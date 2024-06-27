import type { ArrayBufferReader } from '../utils/reader';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

const dumpObject = (obj: any): any => {
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) return obj.map(item => dumpObject(item));
    if (obj instanceof Map) {
      return Object.fromEntries(Array.from(obj.entries()).map(([k, v]) => [k, dumpObject(v)]));
    }
    if (obj instanceof Set) {
      return Array.from(obj.values()).map(item => dumpObject(item));
    }

    const result: any = {};

    const className: string | undefined = obj.__class;
    if (className) result.__class = className;

    for (const key in obj) {
      const cur = obj[key];
      if (
        key.startsWith('__') ||
        typeof cur === 'function' ||
        cur instanceof ArrayBuffer ||
        cur instanceof Uint8Array ||
        (typeof cur === 'object' && cur.__doNotDump)
      ) {
        continue;
      }
      result[key] = typeof cur?.dump === 'function' ? cur.dump() : dumpObject(cur);
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

  get container() {
    return this.__info.bundle.containerMap?.get(this.pathId) ?? '';
  }

  protected get __class() {
    return AssetType[this.type] || 'unknown';
  }

  dump(): Record<string, any> {
    try {
      return dumpObject(this);
    } catch (error) {
      console.error(`Dump ${this.__class} error:`, error);
      return {};
    }
  }
}
