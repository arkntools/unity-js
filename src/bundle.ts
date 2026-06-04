import { decompressLz4, decompressLzmaWithSize } from '@arkntools/unity-js-tools';
import { zip } from 'es-toolkit';
import { Asset } from './asset';
import type { AssetFile, AssetFileLoadOptions } from './assetFile';
import { BundleEnv, FileType, getFileType, Signature } from './assetFile';
import type { Jimp } from './lib/jimp';
import { concatArrayBuffer } from './utils/buffer';
import { loopEach } from './utils/loop';
import { ArrayBufferReader } from './utils/reader';
import { UnityCN } from './utils/unitycn';
import { isVersionLargerThanOrEqual, parseVersion } from './utils/version';
import { AssetType } from '.';
import type { AssetBundle, AssetObject } from '.';

export interface BundleHeader {
  signature: string;
  version: number;
  unityVersion: string;
  unityReversion: string;
  size: number;
  compressedBlocksInfoSize: number;
  uncompressedBlocksInfoSize: number;
  flags: number;
}

interface StorageBlock {
  compressedSize: number;
  uncompressedSize: number;
  flags: number;
}

enum StorageBlockFlags {
  COMPRESSION_TYPE_MASK = 0x3f,
  STREAMED = 0x40,
}

interface StorageNode {
  offset: number;
  size: number;
  flags: number;
  path: string;
}

enum ArchiveFlags {
  COMPRESSION_TYPE_MASK = 0x3f,
  BLOCKS_AND_DIRECTORY_INFO_COMBINED = 0x40,
  BLOCKS_INFO_AT_THE_END = 0x80,
  OLD_WEB_PLUGIN_COMPATIBILITY = 0x100,
  BLOCK_INFO_NEED_PADDING_AT_START = 0x200,
  UNITY_CN_ENCRYPTION = 0x400,
}

enum CompressionType {
  NONE,
  LZMA,
  LZ4,
  LZ4_HC,
  CUSTOM_4,
  CUSTOM_5,
}

export class BundleFile implements AssetFile {
  readonly header: BundleHeader;
  readonly nodes: StorageNode[] = [];
  readonly files: ArrayBuffer[] = [];
  readonly objectMap = new Map<bigint, AssetObject>();
  readonly objects: AssetObject[];
  readonly textureMixCache = new Map<string, Jimp>();
  readonly containerMap?: Map<bigint, String>;
  private readonly blockInfos: StorageBlock[] = [];
  private unityCN?: UnityCN;

  constructor(
    r: ArrayBufferReader,
    readonly options?: AssetFileLoadOptions,
  ) {
    const signature = r.readStringUntilZero();
    const version = r.readUInt32BE();
    const unityVersion = r.readStringUntilZero();
    const unityReversion = r.readStringUntilZero();

    this.header = {
      signature,
      version,
      unityVersion,
      unityReversion,
      size: 0,
      compressedBlocksInfoSize: 0,
      uncompressedBlocksInfoSize: 0,
      flags: 0,
    };

    switch (signature) {
      case Signature.UNITY_FS:
        this.readHeader(r);
        if (this.options?.unityCNKey) {
          this.readUnityCN(r, this.options.unityCNKey);
        }
        this.readBlocksInfoAndDirectory(r);
        this.files.push(...this.readFiles(this.readBlocks(r)));
        break;

      default:
        throw new Error(`Unsupported bundle type: ${signature}`);
    }

    let assetBundle: AssetBundle | undefined;

    zip(this.files, this.nodes)
      .filter(([f]) => getFileType(f) === FileType.ASSETS_FILE)
      .flatMap(([f, n]) => new Asset(this, f, n.path).objects())
      .forEach(obj => {
        this.objectMap.set(obj.pathId, obj);
        if (obj.type === AssetType.AssetBundle) assetBundle = obj;
      });
    this.objects = Array.from(this.objectMap.values());

    if (assetBundle) {
      this.containerMap = assetBundle.containerMap;
    }

    for (const obj of this.objects) {
      if (obj.type !== AssetType.SpriteAtlas) continue;
      const { renderDataMap, packedSprites } = obj;
      if (!renderDataMap.size) continue;
      for (const packedSprite of packedSprites) {
        const sprite = packedSprite.object;
        if (!sprite) continue;
        if (sprite.spriteAtlas?.isNull) {
          sprite.spriteAtlas.set(obj);
        }
      }
    }
  }

  getContainer(pathId: bigint): string {
    return this.containerMap?.get(pathId)?.toString() || '';
  }

  private readHeader(r: ArrayBufferReader) {
    const { header } = this;

    header.size = Number(r.readUInt64BE());
    header.compressedBlocksInfoSize = r.readUInt32BE();
    header.uncompressedBlocksInfoSize = r.readUInt32BE();
    header.flags = r.readUInt32BE();
  }

  private readUnityCN(r: ArrayBufferReader, key: string) {
    let mask: ArchiveFlags;

    const version = parseVersion(this.header.unityReversion);
    if (
      version[0] < 2020 || // 2020 and earlier
      (version[0] === 2020 && version[1] === 3 && version[2] <= 34) || // 2020.3.34 and earlier
      (version[0] === 2021 && version[1] === 3 && version[2] <= 2) || // 2021.3.2 and earlier
      (version[0] === 2022 && version[1] === 3 && version[2] <= 1)
    ) {
      // 2022.3.1 and earlier
      mask = ArchiveFlags.BLOCK_INFO_NEED_PADDING_AT_START;
    } else {
      mask = ArchiveFlags.UNITY_CN_ENCRYPTION;
      throw new Error(`Unsupported unity reversion: ${this.header.unityReversion}`);
    }

    if (this.header.flags & mask) {
      this.unityCN = new UnityCN(r, key);
    }
  }

  private readBlocksInfoAndDirectory(r: ArrayBufferReader) {
    const { version, flags, compressedBlocksInfoSize, uncompressedBlocksInfoSize } = this.header;
    if (flags & ArchiveFlags.BLOCKS_INFO_AT_THE_END) {
      throw new Error(`Unsupported bundle flags: ${ArchiveFlags[flags] || flags}`);
    }

    const reversion = parseVersion(this.header.unityReversion);

    if (version >= 7) r.align(16);
    else if (isVersionLargerThanOrEqual(reversion, [2019, 4])) {
      const preAlign = r.position;
      const align = (16 - (preAlign % 16)) % 16;
      if (align) r.move(align);
    }

    const blockInfoBuffer = r.readBuffer(compressedBlocksInfoSize);
    const compressionType = flags & ArchiveFlags.COMPRESSION_TYPE_MASK;

    const blockInfoUncompressedBuffer = this.decompressBuffer(
      blockInfoBuffer,
      compressionType,
      uncompressedBlocksInfoSize,
    );

    this.readBlocksInfo(blockInfoUncompressedBuffer);
  }

  private readBlocksInfo(blockInfo: ArrayBuffer) {
    const r = new ArrayBufferReader(blockInfo);
    // const uncompressedDataHash = r.readBuffer(16);
    r.move(16);

    loopEach(r.readInt32BE(), () => {
      this.blockInfos.push({
        uncompressedSize: r.readUInt32BE(),
        compressedSize: r.readUInt32BE(),
        flags: r.readUInt16BE(),
      });
    });

    loopEach(r.readInt32BE(), () => {
      this.nodes.push({
        offset: Number(r.readUInt64BE()),
        size: Number(r.readUInt64BE()),
        flags: r.readUInt32BE(),
        path: r.readStringUntilZero(),
      });
    });
  }

  private readBlocks(r: ArrayBufferReader) {
    const results: ArrayBuffer[] = [];

    if (this.header.flags & ArchiveFlags.BLOCK_INFO_NEED_PADDING_AT_START) r.align(16);

    for (const [i, { flags, compressedSize, uncompressedSize }] of this.blockInfos.entries()) {
      const compressionType = flags & StorageBlockFlags.COMPRESSION_TYPE_MASK;
      const compressedBuffer = r.readBuffer(compressedSize);
      if (this.unityCN && flags & 0x100) {
        this.unityCN.decryptBlock(compressedBuffer, i);
      }
      const uncompressedBuffer = this.decompressBuffer(
        compressedBuffer,
        compressionType,
        uncompressedSize,
      );
      results.push(uncompressedBuffer);
    }

    return concatArrayBuffer(results);
  }

  private readFiles(data: ArrayBuffer) {
    const r = new ArrayBufferReader(data);
    const files: ArrayBuffer[] = [];

    for (const { offset, size } of this.nodes) {
      r.seek(offset);
      files.push(r.readBuffer(size));
    }

    return files;
  }

  private decompressBuffer(
    data: ArrayBuffer,
    type: number,
    uncompressedSize?: number,
  ): ArrayBuffer {
    if (type === CompressionType.NONE) return data;

    if (!uncompressedSize) throw new Error('Uncompressed size not provided');

    switch (type) {
      case CompressionType.LZMA:
        return decompressLzmaWithSize(
          new Uint8Array(data),
          uncompressedSize,
        ) as unknown as ArrayBuffer;

      case CompressionType.LZ4:
      case CompressionType.LZ4_HC:
        return decompressLz4(new Uint8Array(data), uncompressedSize)
          .buffer as unknown as ArrayBuffer;
    }

    const isArknights = this.options?.env === BundleEnv.ARKNIGHTS;

    if (isArknights && (type === CompressionType.CUSTOM_4 || type === CompressionType.CUSTOM_5)) {
      return decompressArkLz4(data, uncompressedSize).buffer as unknown as ArrayBuffer;
    }

    throw new Error(`Unsupported compression type: ${CompressionType[type] || type}`);
  }
}

const readLongLengthNoCheck = (ip: Uint8Array<ArrayBuffer>, pos: number): [number, number] => {
  let b = 0;
  let l = 0;
  while (true) {
    b = ip[pos];
    pos++;
    l += b;
    if (b !== 255) break;
  }
  return [l, pos];
};

// From https://github.com/MooncellWiki/UnityPy by Kengxxiao
const decompressArkLz4 = (data: ArrayBuffer, uncompressedSize: number) => {
  const AK_LITERAL_LENGTH_MASK = ((1 << 4) - 1) & 0xff;
  const AK_MATCH_LENGTH_MASK = ~AK_LITERAL_LENGTH_MASK & 0xff;

  const fixedCompressedData = new Uint8Array(data);

  let ip = 0;
  let op = 0;

  while (true) {
    let literalLength = fixedCompressedData[ip] & AK_LITERAL_LENGTH_MASK;
    let matchLength = ((fixedCompressedData[ip] & AK_MATCH_LENGTH_MASK) >> 4) & 0xff;

    fixedCompressedData[ip] = ((literalLength << 4) | matchLength) & 0xff;
    ip++;

    if (literalLength === 15) {
      const [l, newIp] = readLongLengthNoCheck(fixedCompressedData, ip);
      literalLength += l;
      ip = newIp;
    }

    op += literalLength;
    ip += literalLength;

    if (uncompressedSize <= op) break;

    const offset = fixedCompressedData[ip + 1] | (fixedCompressedData[ip] << 8);
    fixedCompressedData[ip] = offset & 0xff;
    fixedCompressedData[ip + 1] = (offset >> 8) & 0xff;
    ip += 2;

    if (matchLength === 15) {
      const [m, newIp] = readLongLengthNoCheck(fixedCompressedData, ip);
      matchLength += m;
      ip = newIp;
    }

    matchLength += 4;
    op += matchLength;
  }

  return decompressLz4(fixedCompressedData, uncompressedSize);
};
