import BufferReader from 'buffer-reader';
import { uncompress as decompressLz4 } from 'lz4-napi';
import { Asset } from './asset';
import type { AssetObject } from './classes';
import { unzipIfNeed } from './utils/zip';
import type { Texture2D } from '.';

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
}

export class AssetBundle {
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

    return new AssetBundle(bundle);
  }
}

export class Bundle {
  public readonly nodes: StorageNode[] = [];
  public readonly files: Buffer[] = [];
  public readonly objectMap = new Map<string, AssetObject>();
  private readonly blockInfos: StorageBlock[] = [];

  public constructor(
    private readonly header: BundleHeader,
    public readonly options?: BundleLoadOptions,
  ) {}

  public async read(r: BufferReader) {
    const { signature } = this.header;

    switch (signature) {
      case Signature.UNITY_FS:
        this.readHeader(r);
        await this.readBlocksInfoAndDirectory(r);
        this.files.push(...this.readFiles(await this.readBlocks(r)));
        break;

      default:
        throw new Error(`Unsupported bundle type: ${signature}`);
    }

    this.files
      .filter(f => getFileType(f) === FileType.ASSETS_FILE)
      .flatMap(f => new Asset(this, f).objects())
      .forEach(obj => {
        this.objectMap.set(obj.pathId, obj);
      });
  }

  private readHeader(r: BufferReader) {
    const { header } = this;

    if (header.version >= 7) {
      throw new Error(`Unsupported bundle version: ${header.version}`);
    }

    header.size = bufferReaderReadBigInt64BE(r);
    header.compressedBlocksInfoSize = r.nextUInt32BE();
    header.uncompressedBlocksInfoSize = r.nextUInt32BE();
    header.flags = r.nextUInt32BE();
  }

  private async readBlocksInfoAndDirectory(r: BufferReader) {
    const { flags, compressedBlocksInfoSize, uncompressedBlocksInfoSize } = this.header;
    if (
      flags & ArchiveFlags.BLOCKS_INFO_AT_THE_END ||
      flags & ArchiveFlags.BLOCK_INFO_NEED_PADDING_AT_START
    ) {
      throw new Error(`Unsupported bundle flags: ${flags}`);
    }

    const blockInfoBuffer = r.nextBuffer(compressedBlocksInfoSize);
    const compressionType = flags & ArchiveFlags.COMPRESSION_TYPE_MASK;
    const blockInfoUncompressedBuffer = await decompressBuffer(
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

  private async readBlocks(r: BufferReader) {
    const results: Buffer[] = [];

    for (const { flags, compressedSize, uncompressedSize } of this.blockInfos) {
      const compressionType = flags & StorageBlockFlags.COMPRESSION_TYPE_MASK;
      const compressedBuffer = r.nextBuffer(compressedSize);
      const uncompressedBuffer = await decompressBuffer(
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
}

const decompressBuffer = async (data: Buffer, type: number, uncompressedSize?: number) => {
  switch (type) {
    case CompressionType.NONE:
      return data;

    case CompressionType.LZ4:
    case CompressionType.LZ4_HC: {
      if (!uncompressedSize) throw new Error('Uncompressed size not provided');
      const sizeBuffer = Buffer.alloc(4);
      sizeBuffer.writeUInt32LE(uncompressedSize);
      return await decompressLz4(Buffer.concat([sizeBuffer, data]));
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
