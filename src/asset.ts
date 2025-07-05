import type { Bundle } from './bundle';
import type { AssetObject } from './classes';
import { createAssetObject } from './classes';
import { ObjectInfo } from './object';
import { SerializedType } from './serializedType';
import { ArrayBufferReader } from './utils/reader';

export interface AssetHeader {
  metadataSize: number;
  fileSize: number;
  version: number;
  dataOffset: number;
  endianness: number;
}

export class Asset {
  readonly header: AssetHeader;
  readonly fileEndianness: number = 0;
  readonly unityVersion: string = '';
  readonly version: number[] = [];
  readonly buildType: string = '';
  readonly targetPlatform: number = 0;
  readonly enableTypeTree: boolean = false;
  readonly enableBigId: boolean = false;
  readonly types: SerializedType[] = [];
  readonly typeMap = new Map<number, SerializedType>();
  readonly objectInfos: ObjectInfo[] = [];
  readonly reader: ArrayBufferReader;

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
      const type = new SerializedType(r, header, this.enableTypeTree, false);
      this.types.push(type);
      this.typeMap.set(type.classId, type);
    }

    if (header.version >= 7 && header.version < 14) {
      this.enableBigId = !!r.readInt32();
    }

    const objectCount = r.readUInt32();
    for (let i = 0; i < objectCount; i++) {
      this.objectInfos.push(new ObjectInfo(this, bundle));
    }

    // 未实现
  }

  objects() {
    return this.objectInfos.map(createAssetObject).filter(o => o) as AssetObject[];
  }
}
