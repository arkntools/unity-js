import type { ArrayBufferReader } from '../utils/reader';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

const dumpObject = (obj: any, isTop = false): any => {
  if (typeof obj === 'object') {
    if (!isTop && typeof obj.dump === 'function') return obj.dump();
    if (Array.isArray(obj)) return obj.map(item => dumpObject(item));

    const result: any = {};
    const className: string | undefined = obj.__class;
    if (className) result.__class = className;
    for (const key in obj) {
      if (key.startsWith('__') || typeof obj[key] === 'function') continue;
      result[key] = dumpObject(obj[key]);
    }
    return result;
  }

  return obj;
};

export abstract class AssetBase {
  abstract readonly type: AssetType;
  readonly name: string;

  constructor(
    protected readonly __info: ObjectInfo,
    r: ArrayBufferReader,
  ) {
    r.seek(__info.bytesStart);
    this.name = r.readAlignedString();
  }

  get pathId() {
    return this.__info.pathId;
  }

  get size() {
    return this.__info.bytesSize;
  }

  protected get __class() {
    return AssetType[this.type] || 'unknown';
  }

  dump(): Record<string, any> {
    return dumpObject(this, true);
  }
}
