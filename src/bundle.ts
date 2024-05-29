import { decompressLz4 } from '@arkntools/unity-js-tools';
import type Jimp from 'jimp';
import { Asset } from './asset';
import type { AssetObject } from './classes';
import { concatArrayBuffer, ensureArrayBuffer } from './utils/buffer';
import { ArrayBufferReader } from './utils/reader';
import { UnityCN } from './utils/unitycn';
import { unzipIfNeed } from './utils/zip';
import { AssetType } from '.';
import type { AssetBundle, Texture2D } from '.';

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

enum Signature {
  UNITY_WEB = 'UnityWeb',
  UNITY_RAW = 'UnityRaw',
  UNITY_FS = 'UnityFS',
  UNITY_ARCHIVE = 'UnityArchive',
  UNITY_WEB_DATA_1_0 = '"UnityWebData1.0"',
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
  LZHAM,
}

enum FileType {
  ASSETS_FILE,
  BUNDLE_FILE,
  WEB_FILE,
  RESOURCE_FILE,
  GZIP_FILE,
  BROTLI_FILE,
  ZIP_FILE,
}

export interface BundleLoadOptions {
  /** 有些 Sprite 可能不会给出 AlphaTexture 的 PathID，可以传入自定义函数去寻找 */
  findAlphaTexture?: (texture: Texture2D, assets: Texture2D[]) => Texture2D | undefined;
  unityCNKey?: string;
}

export class Bundle {
  public readonly header: BundleHeader;
  public readonly nodes: StorageNode[] = [];
  public readonly files: ArrayBuffer[] = [];
  public readonly objectMap = new Map<string, AssetObject>();
  public readonly objects: AssetObject[];
  public readonly textureMixCache = new Map<string, Jimp>();
  public readonly containerMap?: Map<string, string>;
  private readonly blockInfos: StorageBlock[] = [];
  private unityCN?: UnityCN;

  static async load(data: Buffer | ArrayBuffer | Uint8Array, options?: BundleLoadOptions) {
    const r = new ArrayBufferReader(await unzipIfNeed(ensureArrayBuffer(data)));
    return new Bundle(r, options);
  }

  private constructor(
    r: ArrayBufferReader,
    public readonly options?: BundleLoadOptions,
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

    this.files
      .filter(f => getFileType(f) === FileType.ASSETS_FILE)
      .flatMap(f => new Asset(this, f).objects())
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

  private readHeader(r: ArrayBufferReader) {
    const { header } = this;

    header.size = Number(r.readUInt64BE());
    header.compressedBlocksInfoSize = r.readUInt32BE();
    header.uncompressedBlocksInfoSize = r.readUInt32BE();
    header.flags = r.readUInt32BE();
  }

  private readUnityCN(r: ArrayBufferReader, key: string) {
    let mask: ArchiveFlags;

    const version = this.parseVersion(this.header.unityReversion);
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
      throw new Error(`Unsupported bundle flags: ${flags}`);
    }

    if (version >= 7) r.align(16);

    const blockInfoBuffer = r.readBuffer(compressedBlocksInfoSize);
    const compressionType = flags & ArchiveFlags.COMPRESSION_TYPE_MASK;
    const blockInfoUncompressedBuffer = decompressBuffer(
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
    const blockInfoCount = r.readInt32BE();

    for (let i = 0; i < blockInfoCount; i++) {
      this.blockInfos.push({
        uncompressedSize: r.readUInt32BE(),
        compressedSize: r.readUInt32BE(),
        flags: r.readUInt16BE(),
      });
    }

    const nodeCount = r.readInt32BE();

    for (let i = 0; i < nodeCount; i++) {
      this.nodes.push({
        offset: Number(r.readUInt64BE()),
        size: Number(r.readUInt64BE()),
        flags: r.readUInt32BE(),
        path: r.readStringUntilZero(),
      });
    }
  }

  private readBlocks(r: ArrayBufferReader) {
    const results: ArrayBuffer[] = [];

    for (const [i, { flags, compressedSize, uncompressedSize }] of this.blockInfos.entries()) {
      const compressionType = flags & StorageBlockFlags.COMPRESSION_TYPE_MASK;
      const compressedBuffer = r.readBuffer(compressedSize);
      if (this.unityCN && flags & 0x100) {
        this.unityCN.decryptBlock(compressedBuffer, i);
      }
      const uncompressedBuffer = decompressBuffer(
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

  private parseVersion(str: string) {
    return str
      .replace(/\D/g, '.')
      .split('.')
      .filter(Boolean)
      .map(v => parseInt(v));
  }
}

const decompressBuffer = (
  data: ArrayBuffer,
  type: number,
  uncompressedSize?: number,
): ArrayBuffer => {
  switch (type) {
    case CompressionType.NONE:
      return data;

    case CompressionType.LZ4:
    case CompressionType.LZ4_HC: {
      if (!uncompressedSize) throw new Error('Uncompressed size not provided');
      return decompressLz4(new Uint8Array(data), uncompressedSize).buffer;
    }

    default:
      throw new Error(`Unsupported compression type: ${type}`);
  }
};

const getFileType = (data: ArrayBuffer) => {
  const r = new ArrayBufferReader(data);
  const signature = r.readStringUntilZero();

  switch (signature) {
    case Signature.UNITY_WEB:
    case Signature.UNITY_RAW:
    case Signature.UNITY_ARCHIVE:
    case Signature.UNITY_FS:
      return FileType.BUNDLE_FILE;

    case Signature.UNITY_WEB_DATA_1_0:
      return FileType.WEB_FILE;

    default: {
      const GZIP_HEAD = [0x1f, 0x8b];
      const BROTLI_HEAD = [0x62, 0x72, 0x6f, 0x74, 0x6c, 0x69];
      const ZIP_HEAD = [0x50, 0x4b, 0x03, 0x04];
      const ZIP_SPANNED_HEAD = [0x50, 0x4b, 0x07, 0x08];

      const matchHead = (magic: number[], start = 0) => {
        r.seek(start);
        const view = r.readUInt8Slice(magic.length);
        return magic.every((v, i) => view[i] === v);
      };

      const isSerializedFile = () => {
        if (data.byteLength < 20) return false;
        r.seek(0);
        r.move(4);
        let fileSize = r.readUInt32BE();
        const version = r.readUInt32BE();
        let dataOffset = r.readUInt32BE();
        r.move(4);
        if (version >= 22) {
          if (data.byteLength < 48) return false;
          r.move(4);
          fileSize = Number(r.readUInt64BE());
          dataOffset = Number(r.readUInt64BE());
        }
        if (data.byteLength !== fileSize) return false;
        if (dataOffset > fileSize) return false;
        return true;
      };

      // 应该要先复位，猜的
      if (matchHead(GZIP_HEAD)) return FileType.GZIP_FILE;
      if (matchHead(BROTLI_HEAD, 32)) return FileType.BROTLI_FILE;
      if (isSerializedFile()) return FileType.ASSETS_FILE;
      if (matchHead(ZIP_HEAD) || matchHead(ZIP_SPANNED_HEAD)) return FileType.ZIP_FILE;
      return FileType.RESOURCE_FILE;
    }
  }
};
