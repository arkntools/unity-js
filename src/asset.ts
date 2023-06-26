import type { AssetBundle } from './bundle';
import { createAssetObject } from './classes';
import type { BufferReaderExtended } from './utils/reader';
import { createExtendedBufferReader } from './utils/reader';

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
  getReader: () => BufferReaderExtended;
  bundle: AssetBundle;
  buildType: string;
  assetVersion: number;
  bytesStart: number;
  bytesSize: number;
  typeId: number;
  classId: number;
  isDestroyed: number;
  stripped: number;
  pathId: string;
  version: number[];
}

export class Asset {
  private readonly reader: BufferReaderExtended;
  private readonly header: AssetHeader;
  private readonly fileEndianness: number = 0;
  private readonly unityVersion: string = '';
  private readonly version: number[] = [];
  private readonly targetPlatform: number = 0;
  private readonly enableTypeTree: boolean = false;
  private readonly enableBigId: boolean = false;
  private readonly types: TypeInfo[] = [];
  private readonly objectInfos: ObjectInfo[] = [];
  private readonly cloneReader = () => this.reader.clone();

  constructor(bundle: AssetBundle, data: Buffer) {
    const r = createExtendedBufferReader(data);
    this.reader = r;

    const header: AssetHeader = (this.header = {
      metadataSize: r.nextUInt32BE(),
      fileSize: r.nextUInt32BE(),
      version: r.nextUInt32BE(),
      dataOffset: r.nextUInt32BE(),
      endianness: 0,
    });

    if (header.version >= 9) {
      this.fileEndianness = header.endianness = r.nextUInt8();
      r.move(3);
    } else {
      r.seek(header.fileSize - header.metadataSize);
      this.fileEndianness = r.nextUInt8();
    }
    r.setEndianness(this.fileEndianness);

    if (header.version >= 22) {
      header.metadataSize = r.nextUInt32();
      header.fileSize = r.nextInt64Number();
      header.dataOffset = r.nextInt64Number();
      r.move(8);
    }
    if (header.version >= 7) {
      this.unityVersion = r.nextStringZero();
      this.version = this.unityVersion.split('.').map(s => Number(s));
    }
    if (header.version >= 8) {
      this.targetPlatform = r.nextInt32();
    }
    if (header.version >= 13) {
      this.enableTypeTree = !!r.nextUInt8();
    }

    const typeCount = r.nextInt32();
    for (let i = 0; i < typeCount; i++) {
      this.readType(false);
    }

    if (header.version >= 7 && header.version < 14) {
      this.enableBigId = !!r.nextInt32();
    }

    const objectCount = r.nextUInt32();
    for (let i = 0; i < objectCount; i++) {
      const info: ObjectInfo = {
        getReader: this.cloneReader,
        bundle,
        buildType: '',
        assetVersion: 0,
        bytesStart: 0,
        bytesSize: 0,
        typeId: 0,
        classId: 0,
        isDestroyed: 0,
        stripped: 0,
        pathId: '',
        version: this.version,
      };

      if (this.enableBigId) info.pathId = r.nextInt64String();
      else if (header.version < 14) info.pathId = String(r.nextInt32());
      else {
        r.align(4);
        info.pathId = r.nextInt64String();
      }
      info.bytesStart = header.version >= 22 ? r.nextInt64Number() : r.nextUInt32();
      info.bytesStart += header.dataOffset;
      info.bytesSize = r.nextUInt32();
      info.typeId = r.nextInt32();
      if (header.version < 16) info.classId = r.nextUInt16();
      else info.classId = this.types[info.typeId].classId;
      if (header.version < 11) info.isDestroyed = r.nextUInt16();
      if (header.version >= 11 && header.version < 17) r.move(2);
      if (header.version === 15 || header.version === 16) info.stripped = r.nextUInt8();

      this.objectInfos.push(info);
    }

    // 未实现
  }

  public objects() {
    return this.objectInfos.map(createAssetObject);
  }

  // 未完整实现，只用于跳过
  private readType(isRefType: boolean) {
    const r = this.reader;
    const { version } = this.header;

    const info: TypeInfo = {
      classId: r.nextInt32(),
    };

    if (version >= 16) r.move(1);
    const scriptTypeIndex = version >= 17 ? r.nextInt16() : null;
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
          r.nextStringZero();
          r.nextStringZero();
          r.nextStringZero();
        } else {
          const size = r.nextInt32();
          r.move(size * 4);
        }
      }
    }

    this.types.push(info);
  }

  // 未实现，只用于跳过
  private readTypeTreeBlob() {
    const r = this.reader;

    const nodeNumber = r.nextInt32();
    const stringBufferSize = r.nextInt32();

    for (let i = 0; i < nodeNumber; i++) {
      r.move(24);
      if (this.header.version >= 19) r.move(8);
    }
    r.move(stringBufferSize);
  }
}
