import type { ArrayBufferReader } from '../utils/reader';
import type { ObjectInfo } from './types';
import type { AssetObject } from '.';

export class PPtr<T extends AssetObject = AssetObject> {
  fileId: number;
  pathId: bigint;

  constructor(
    private readonly __info: ObjectInfo,
    r: ArrayBufferReader,
  ) {
    this.fileId = r.readInt32();
    this.pathId = __info.assetVersion < 14 ? BigInt(r.readInt32()) : r.readInt64();
  }

  get object() {
    return this.__info.bundle.objectMap.get(this.pathId) as T | undefined;
  }

  get isNull() {
    return this.pathId === 0n || this.fileId < 0;
  }

  protected get __class() {
    if (this.isNull) return 'PPtr<null>';
    const objClass: string = (this.object as any)?.__class ?? 'unknown';
    return `PPtr<${objClass}>`;
  }

  set(obj: T) {
    // ignore file id
    this.pathId = obj.pathId;
  }
}
