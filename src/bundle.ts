import { decompressLz4 } from '@arkntools/unity-js-tools';
import BufferReader from 'buffer-reader';
import { Asset } from './asset';
import type { AssetObject } from './classes';
import { alignReader } from './utils/buffer';
import { UnityCN } from './utils/unitycn';
import { unzipIfNeed } from './utils/zip';
import { AssetType } from '.';
import type { AssetBundle, Texture2D } from '.';

interface BundleHeader {
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

export class UnityAssetBundle {
  private constructor(private readonly bundle: Bundle) {}

  get objects() {
    return Array.from(this.bundle.objectMap.values());
  }

  static async load(data: Buffer, options?: BundleLoadOptions) {
    const r = new BufferReader(await unzipIfNeed(data));

    const signature = r.nextStringZero();
    const version = r.nextUInt32BE();
    const unityVersion = r.nextStringZero();
    const unityReversion = r.nextStringZero();

    const bundle = new Bundle(
      {
        signature,
        version,
        unityVersion,
        unityReversion,
        size: 0,
        compressedBlocksInfoSize: 0,
        uncompressedBlocksInfoSize: 0,
        flags: 0,
      },
      options,
    );

    await bundle.read(r);

    return new UnityAssetBundle(bundle);
  }
}

export class Bundle {
  public readonly nodes: StorageNode[] = [];
  public readonly files: Buffer[] = [];
  public readonly objectMap = new Map<string, AssetObject>();
  public containerMap?: Map<string, string>;
  private readonly blockInfos: StorageBlock[] = [];
  private unityCN?: UnityCN;

  public constructor(
    private readonly header: BundleHeader,
    public readonly options?: BundleLoadOptions,
  ) {}

  public async read(r: BufferReader) {
    const { signature } = this.header;

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

    if (assetBundle) {
      try {
        this.containerMap = (await assetBundle.load()).containerMap;
      } catch (error) {
        console.error('Read container error:', error);
      }
    }
  }

  private readHeader(r: BufferReader) {
    const { header } = this;

    header.size = bufferReaderReadBigInt64BE(r);
    header.compressedBlocksInfoSize = r.nextUInt32BE();
    header.uncompressedBlocksInfoSize = r.nextUInt32BE();
    header.flags = r.nextUInt32BE();
  }

  private readUnityCN(r: BufferReader, key: string) {
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

  private readBlocksInfoAndDirectory(r: BufferReader) {
    const { version, flags, compressedBlocksInfoSize, uncompressedBlocksInfoSize } = this.header;
    if (flags & ArchiveFlags.BLOCKS_INFO_AT_THE_END) {
      throw new Error(`Unsupported bundle flags: ${flags}`);
    }

    if (version >= 7) alignReader(r, 16);

    const blockInfoBuffer = r.nextBuffer(compressedBlocksInfoSize);
    const compressionType = flags & ArchiveFlags.COMPRESSION_TYPE_MASK;
    const blockInfoUncompressedBuffer = decompressBuffer(
      blockInfoBuffer,
      compressionType,
      uncompressedBlocksInfoSize,
    );

    this.readBlocksInfo(blockInfoUncompressedBuffer);
  }

  private readBlocksInfo(blockInfo: Buffer) {
    const r = new BufferReader(blockInfo);
    // const uncompressedDataHash = r.nextBuffer(16);
    r.move(16);
    const blockInfoCount = r.nextInt32BE();

    for (let i = 0; i < blockInfoCount; i++) {
      this.blockInfos.push({
        uncompressedSize: r.nextUInt32BE(),
        compressedSize: r.nextUInt32BE(),
        flags: r.nextUInt16BE(),
      });
    }

    const nodeCount = r.nextInt32BE();

    for (let i = 0; i < nodeCount; i++) {
      this.nodes.push({
        offset: bufferReaderReadBigInt64BE(r),
        size: bufferReaderReadBigInt64BE(r),
        flags: r.nextUInt32BE(),
        path: r.nextStringZero(),
      });
    }
  }

  private readBlocks(r: BufferReader) {
    const results: Buffer[] = [];

    for (const [i, { flags, compressedSize, uncompressedSize }] of this.blockInfos.entries()) {
      const compressionType = flags & StorageBlockFlags.COMPRESSION_TYPE_MASK;
      let compressedBuffer = r.nextBuffer(compressedSize);
      if (this.unityCN && flags & 0x100) {
        const bytes = Uint8Array.from(compressedBuffer);
        this.unityCN.decryptBlock(bytes, i);
        compressedBuffer = Buffer.from(bytes);
      }
      const uncompressedBuffer = decompressBuffer(
        compressedBuffer,
        compressionType,
        uncompressedSize,
      );
      results.push(uncompressedBuffer);
    }

    return Buffer.concat(results);
  }

  private readFiles(data: Buffer) {
    const r = new BufferReader(data);
    const files: Buffer[] = [];

    for (const { offset, size } of this.nodes) {
      r.seek(offset);
      files.push(r.nextBuffer(size));
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

const decompressBuffer = (data: Buffer, type: number, uncompressedSize?: number) => {
  switch (type) {
    case CompressionType.NONE:
      return data;

    case CompressionType.LZ4:
    case CompressionType.LZ4_HC: {
      if (!uncompressedSize) throw new Error('Uncompressed size not provided');
      return Buffer.from(decompressLz4(data, uncompressedSize));
    }

    default:
      throw new Error(`Unsupported compression type: ${type}`);
  }
};

const bufferReaderReadBigInt64BE = (r: BufferReader) => Number(r.nextBuffer(8).readBigInt64BE());

const getFileType = (data: Buffer) => {
  const r = new BufferReader(data);
  const signature = r.nextStringZero();

  switch (signature) {
    case Signature.UNITY_WEB:
    case Signature.UNITY_RAW:
    case Signature.UNITY_ARCHIVE:
    case Signature.UNITY_FS:
      return FileType.BUNDLE_FILE;

    case Signature.UNITY_WEB_DATA_1_0:
      return FileType.WEB_FILE;

    default: {
      const GZIP_HEAD = Buffer.from([0x1f, 0x8b]);
      const BROTLI_HEAD = Buffer.from([0x62, 0x72, 0x6f, 0x74, 0x6c, 0x69]);
      const ZIP_HEAD = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      const ZIP_SPANNED_HEAD = Buffer.from([0x50, 0x4b, 0x07, 0x08]);

      const matchHead = (magic: Buffer, start = 0) => {
        r.seek(start);
        return r.nextBuffer(magic.length).equals(magic);
      };

      const isSerializedFile = () => {
        if (data.length < 20) return false;
        r.seek(0);
        r.move(4);
        let fileSize = r.nextUInt32BE();
        const version = r.nextUInt32BE();
        let dataOffset = r.nextUInt32BE();
        r.move(4);
        if (version >= 22) {
          if (data.length < 48) return false;
          r.move(4);
          fileSize = bufferReaderReadBigInt64BE(r);
          dataOffset = bufferReaderReadBigInt64BE(r);
        }
        if (data.length !== fileSize) return false;
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
