import type { ArrayBufferReader } from '../utils/reader';
import type { ObjectInfo } from './types';
import type { AssetObject } from '.';

export class PPtr<T extends AssetObject = AssetObject> {
  fileId: number;
  pathId: bigint;

  constructor(
    private readonly info: ObjectInfo,
    r: ArrayBufferReader,
  ) {
    this.fileId = r.readInt32();
    this.pathId = info.assetVersion < 14 ? BigInt(r.readInt32()) : r.readInt64();
  }

  get object() {
    return this.info.bundle.objectMap.get(this.pathId) as T | undefined;
  }

  get isNull() {
    return this.pathId === 0n || this.fileId < 0;
  }

  set(obj: T) {
    // ignore file id
    this.pathId = obj.pathId;
  }
}
