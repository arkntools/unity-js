import { isNotNil } from 'es-toolkit';
import { ArrayBufferReader } from '../utils/reader';
import type { ObjectInfo } from './types';
import type { AssetObject } from '.';

export class PPtr<T extends AssetObject = AssetObject> {
  fileId: number;
  pathId: bigint;

  constructor(info: ObjectInfo, r: ArrayBufferReader);
  constructor(info: ObjectInfo, fileId: number, pathId: bigint);
  constructor(
    private readonly __info: ObjectInfo,
    r: ArrayBufferReader | number,
    pathId?: bigint,
  ) {
    if (r instanceof ArrayBufferReader) {
      this.fileId = r.readInt32();
      this.pathId = this.__info.assetVersion < 14 ? BigInt(r.readInt32()) : r.readInt64();
    } else if (typeof r === 'number' && typeof pathId === 'bigint') {
      this.fileId = r;
      this.pathId = pathId;
    } else {
      throw new TypeError('PPtr invalid arguments');
    }
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

  static fromPlainObject<T extends AssetObject, U extends boolean = true>(
    info: ObjectInfo,
    item: { m_FileID: number; m_PathID: bigint },
    tryCatch: U = true as U,
    // @ts-ignore
  ): U extends true ? PPtr<T> | undefined : PPtr<T> {
    if (tryCatch) {
      try {
        return new PPtr<T>(info, item.m_FileID, item.m_PathID);
      } catch {}
    } else {
      return new PPtr<T>(info, item.m_FileID, item.m_PathID);
    }
  }

  static fromPlainObjectList<T extends AssetObject>(
    info: ObjectInfo,
    list: Array<{ m_FileID: number; m_PathID: bigint }>,
  ) {
    return list.map(item => PPtr.fromPlainObject<T>(info, item)).filter(isNotNil);
  }

  static toObjectList<T extends AssetObject>(list: PPtr<T>[]) {
    return list.map(item => item.object).filter(isNotNil);
  }

  set(obj: T) {
    // ignore file id
    this.pathId = obj.pathId;
  }
}
