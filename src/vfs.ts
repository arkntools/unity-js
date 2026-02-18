import { zip } from 'es-toolkit';
import { Asset } from './asset';
import type { AssetFile, AssetFileLoadOptions, AssetFileNode } from './assetFile';
import { FileType, getFileType } from './assetFile';
import type { AssetObject } from './classes';
import type { AssetBundle } from './classes/assetBundle';
import { AssetType } from './classes/types';
import type { Jimp } from './lib/jimp';
import { concatArrayBuffer } from './utils/buffer';
import { ArrayBufferReader } from './utils/reader';
import {
  ARCHIVE_BLOCK_INFO_NEED_PADDING_AT_START,
  ARCHIVE_BLOCKS_INFO_AT_THE_END,
  decompressLz4Inv,
  decompressVFSBlocksInfo,
  decryptVFSBlock,
  isValidVFSHeader,
  readVFSBlocksInfos,
  readVFSDirectoryInfos,
  readVFSHeader,
} from './utils/vfs';
import type { VFSHeader, VFSStorageBlock } from './utils/vfs';

class PartVFSFile implements AssetFile {
  readonly nodes: AssetFileNode[] = [];
  readonly files: ArrayBuffer[] = [];
  readonly objectMap = new Map<bigint, AssetObject>();
  readonly objects: AssetObject[];
  readonly textureMixCache = new Map<string, Jimp>();
  readonly containerMap?: Map<bigint, String>;
  constructor(
    r: ArrayBufferReader,
    readonly options?: AssetFileLoadOptions,
  ) {
    const offset = r.position;

    // skip the 8-byte validation header
    r.move(8);

    // read header
    const header = readVFSHeader(r);

    // read blocks info
    let blockInfosOffset: number;
    if ((header.flags & ARCHIVE_BLOCKS_INFO_AT_THE_END) !== 0) {
      blockInfosOffset = header.size - header.compressedBlocksInfoSize;
    } else {
      blockInfosOffset = header.encFlags >= 7 ? 48 : 40;
    }
    r.seek(offset + blockInfosOffset);

    const { blockInfos, nodes } = this.readBlocksInfoAndDirectory(r, header);

    // read data blocks
    let dataOffset = header.encFlags >= 7 ? 48 : 40;
    if ((header.flags & ARCHIVE_BLOCKS_INFO_AT_THE_END) === 0) {
      let temp = header.compressedBlocksInfoSize;
      if ((header.flags & ARCHIVE_BLOCK_INFO_NEED_PADDING_AT_START) !== 0) {
        temp = (temp + 15) & 0xfffffff0;
      }
      dataOffset += temp;
    }
    r.seek(offset + dataOffset);

    const blocksData = this.readBlocks(r, blockInfos);

    for (const node of nodes) {
      this.nodes.push(node);
      this.files.push(blocksData.slice(node.offset, node.offset + node.size));
    }

    let assetBundle: AssetBundle | undefined;

    zip(this.files, this.nodes)
      .filter(([f]) => getFileType(f) === FileType.ASSETS_FILE)
      .flatMap(([f, n]) => {
        try {
          return new Asset(this, f, n.path).objects();
        } catch (e) {
          console.error(e);
          process.exit(1);
          return [];
        }
      })
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
      const { renderDataMap, packedSprites } = obj as any;
      if (!renderDataMap?.size) continue;
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

  private readBlocksInfoAndDirectory(
    r: ArrayBufferReader,
    header: VFSHeader,
  ): { blockInfos: VFSStorageBlock[]; nodes: AssetFileNode[] } {
    const compressedData = new Uint8Array(r.readBuffer(header.compressedBlocksInfoSize));

    const decompressed = decompressVFSBlocksInfo(
      compressedData,
      header.flags,
      header.uncompressedBlocksInfoSize,
    );

    const infoReader = new ArrayBufferReader(
      (decompressed.buffer as ArrayBuffer).slice(
        decompressed.byteOffset,
        decompressed.byteOffset + decompressed.byteLength,
      ),
    );

    const blockInfos = readVFSBlocksInfos(infoReader);
    const nodes = readVFSDirectoryInfos(infoReader);
    return { blockInfos, nodes };
  }

  private readBlocks(r: ArrayBufferReader, blockInfos: VFSStorageBlock[]): ArrayBuffer {
    const parts: ArrayBuffer[] = [];

    for (const block of blockInfos) {
      const compressionType = block.flags; // no mask

      switch (compressionType) {
        case 0: {
          parts.push(r.readBuffer(block.uncompressedSize));
          break;
        }
        case 5: {
          const compressedBytes = new Uint8Array(r.readBuffer(block.compressedSize));
          decryptVFSBlock(compressedBytes);
          const decompressed = decompressLz4Inv(compressedBytes, block.uncompressedSize);
          parts.push(decompressed.buffer);
          break;
        }
        default:
          throw new Error(`Unsupported VFS block compression type ${compressionType}`);
      }
    }

    return concatArrayBuffer(parts);
  }
}

export class VFSFile implements AssetFile {
  readonly nodes: AssetFileNode[] = [];
  readonly files: ArrayBuffer[] = [];
  readonly objectMap = new Map<bigint, AssetObject>();
  readonly objects: AssetObject[];
  readonly textureMixCache = new Map<string, Jimp>();
  readonly containerMap?: Map<bigint, String>;

  constructor(
    r: ArrayBufferReader,
    readonly options?: AssetFileLoadOptions,
  ) {
    const buf = r.rawBuffer;
    let containerMap: Map<bigint, String> | undefined;

    while (r.position < r.length && isValidVFSHeader(buf, r.position)) {
      const vfs = new PartVFSFile(r, options);

      this.nodes.push(...vfs.nodes);
      this.files.push(...vfs.files);
      for (const [k, v] of vfs.objectMap) this.objectMap.set(k, v);
      for (const [k, v] of vfs.textureMixCache) this.textureMixCache.set(k, v);
      if (vfs.containerMap) {
        if (!containerMap) containerMap = new Map();
        for (const [k, v] of vfs.containerMap) containerMap.set(k, v);
      }
    }

    this.objects = Array.from(this.objectMap.values());
    if (containerMap) {
      this.containerMap = containerMap;
    }
  }

  getContainer(pathId: bigint): string {
    return this.containerMap?.get(pathId)?.toString() || '';
  }
}
