import type { Asset } from './asset';
import type { AssetFile } from './assetFile';
import { BundleEnv } from './assetFile';
import type { SerializedType } from './serializedType';
import type { ArrayBufferReader } from './utils/reader';

export class ObjectInfo {
  readonly getReader: () => ArrayBufferReader;
  readonly buildType: string;
  readonly assetVersion: number;
  readonly bytesStart: number;
  readonly bytesSize: number;
  readonly typeId: number;
  readonly classId: number;
  readonly isDestroyed: number = 0;
  readonly stripped: number = 0;
  readonly pathId: bigint;
  readonly serializedType?: SerializedType;
  readonly version: number[];

  constructor(
    readonly asset: Asset,
    readonly bundle: AssetFile,
  ) {
    const r = asset.reader;

    this.buildType = asset.buildType;
    this.assetVersion = asset.header.version;
    this.version = asset.version;
    this.getReader = () => {
      const reader = r.clone();
      reader.seek(this.bytesStart);
      return reader;
    };

    if (asset.enableBigId) this.pathId = r.readInt64();
    else if (asset.header.version < 14) this.pathId = BigInt(r.readInt32());
    else {
      r.align(4);
      this.pathId = r.readInt64();
    }
    this.bytesStart = asset.header.version >= 22 ? Number(r.readUInt64()) : r.readUInt32();
    this.bytesStart += asset.header.dataOffset;
    this.bytesSize = r.readUInt32();
    this.typeId = r.readInt32();
    if (asset.header.version < 16) {
      this.classId = r.readUInt16();
      this.serializedType = asset.typeMap.get(this.typeId);
    } else {
      this.classId = asset.types[this.typeId].classId;
      this.serializedType = asset.types[this.typeId];
    }
    if (asset.header.version < 11) this.isDestroyed = r.readUInt16();
    if (asset.header.version >= 11 && asset.header.version < 17) {
      const scriptTypeIndex = r.readUInt16();
      if (this.serializedType) {
        // @ts-expect-error
        this.serializedType.scriptTypeIndex = scriptTypeIndex;
      }
    }
    if (asset.header.version === 15 || asset.header.version === 16) {
      this.stripped = r.readUInt8();
    }
  }

  isArknightsEndfield() {
    return this.bundle.options?.env === BundleEnv.ARKNIGHTS_ENDFIELD;
  }
}
