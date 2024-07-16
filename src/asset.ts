import type { Bundle } from './bundle';
import type { AssetObject } from './classes';
import { createAssetObject } from './classes';
import { ArrayBufferReader } from './utils/reader';

interface AssetHeader {
  metadataSize: number;
  fileSize: number;
  version: number;
  dataOffset: number;
  endianness: number;
}

interface TypeInfo {
  classId: number;
}

export interface ObjectInfo {
  getReader: () => ArrayBufferReader;
  bundle: Bundle;
  buildType: string;
  assetVersion: number;
  bytesStart: number;
  bytesSize: number;
  typeId: number;
  classId: number;
  isDestroyed: number;
  stripped: number;
  pathId: bigint;
  version: number[];
}

export class Asset {
  private readonly reader: ArrayBufferReader;
  private readonly header: AssetHeader;
  private readonly fileEndianness: number = 0;
  private readonly unityVersion: string = '';
  private readonly version: number[] = [];
  private readonly buildType: string = '';
  private readonly targetPlatform: number = 0;
  private readonly enableTypeTree: boolean = false;
  private readonly enableBigId: boolean = false;
  private readonly types: TypeInfo[] = [];
  private readonly objectInfos: ObjectInfo[] = [];
  private readonly cloneReader = () => this.reader.clone();

  constructor(bundle: Bundle, data: ArrayBuffer) {
    const r = new ArrayBufferReader(data);
    this.reader = r;

    const header: AssetHeader = (this.header = {
      metadataSize: r.readUInt32BE(),
      fileSize: r.readUInt32BE(),
      version: r.readUInt32BE(),
      dataOffset: r.readUInt32BE(),
      endianness: 0,
    });

    if (header.version >= 9) {
      this.fileEndianness = header.endianness = r.readUInt8();
      r.move(3);
    } else {
      r.seek(header.fileSize - header.metadataSize);
      this.fileEndianness = r.readUInt8();
    }
    if (header.version >= 22) {
      header.metadataSize = r.readUInt32();
      header.fileSize = Number(r.readUInt64());
      header.dataOffset = Number(r.readUInt64());
      r.move(8);
    }
    r.setLittleEndian(!this.fileEndianness);
    if (header.version >= 7) {
      this.unityVersion = r.readStringUntilZero();
      this.version = this.unityVersion
        .replace(/[a-z]+/gi, '.')
        .split('.')
        .slice(0, 4)
        .map(s => Number(s));
      this.buildType = this.unityVersion.match(/[a-z]/i)?.[0] ?? '';
    }
    if (header.version >= 8) {
      this.targetPlatform = r.readInt32();
    }
    if (header.version >= 13) {
      this.enableTypeTree = !!r.readUInt8();
    }

    const typeCount = r.readInt32();
    for (let i = 0; i < typeCount; i++) {
      this.readType(false);
    }

    if (header.version >= 7 && header.version < 14) {
      this.enableBigId = !!r.readInt32();
    }

    const objectCount = r.readUInt32();
    for (let i = 0; i < objectCount; i++) {
      const info: ObjectInfo = {
        getReader: this.cloneReader,
        bundle,
        buildType: this.buildType,
        assetVersion: header.version,
        bytesStart: 0,
        bytesSize: 0,
        typeId: 0,
        classId: 0,
        isDestroyed: 0,
        stripped: 0,
        pathId: 0n,
        version: this.version,
      };

      if (this.enableBigId) info.pathId = r.readInt64();
      else if (header.version < 14) info.pathId = BigInt(r.readInt32());
      else {
        r.align(4);
        info.pathId = r.readInt64();
      }
      info.bytesStart = header.version >= 22 ? Number(r.readUInt64()) : r.readUInt32();
      info.bytesStart += header.dataOffset;
      info.bytesSize = r.readUInt32();
      info.typeId = r.readInt32();
      if (header.version < 16) info.classId = r.readUInt16();
      else info.classId = this.types[info.typeId].classId;
      if (header.version < 11) info.isDestroyed = r.readUInt16();
      if (header.version >= 11 && header.version < 17) r.move(2);
      if (header.version === 15 || header.version === 16) info.stripped = r.readUInt8();

      this.objectInfos.push(info);
    }

    // 未实现
  }

  public objects() {
    return this.objectInfos.map(createAssetObject).filter(o => o) as AssetObject[];
  }

  // 未完整实现，只用于跳过
  private readType(isRefType: boolean) {
    const r = this.reader;
    const { version } = this.header;

    const info: TypeInfo = {
      classId: r.readInt32(),
    };

    if (version >= 16) r.move(1);
    const scriptTypeIndex = version >= 17 ? r.readInt16() : null;
    if (version >= 13) {
      if (
        (isRefType && scriptTypeIndex !== null) ||
        (version < 16 && info.classId < 0) ||
        (version >= 16 && info.classId === 114)
      ) {
        r.move(16);
      }
      r.move(16);
    }
    if (this.enableTypeTree) {
      if (version >= 12 || version === 10) this.readTypeTreeBlob();
      else throw new Error(`Unsupported asset version: ${version}`);
      if (version >= 21) {
        if (isRefType) {
          r.readStringUntilZero();
          r.readStringUntilZero();
          r.readStringUntilZero();
        } else {
          const size = r.readInt32();
          r.move(size * 4);
        }
      }
    }

    this.types.push(info);
  }

  // 未实现，只用于跳过
  private readTypeTreeBlob() {
    const r = this.reader;

    const nodeNumber = r.readInt32();
    const stringBufferSize = r.readInt32();

    for (let i = 0; i < nodeNumber; i++) {
      r.move(24);
      if (this.header.version >= 19) r.move(8);
    }
    r.move(stringBufferSize);
  }
}
