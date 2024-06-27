import type { ArrayBufferReader } from '../utils/reader';
import { AssetBase } from './base';
import { PPtr } from './pptr';
import type { ObjectInfo, PairData } from './types';
import { AssetType } from './types';

export class AssetBundle extends AssetBase {
  readonly type = AssetType.AssetBundle;
  readonly preloadTable: PPtr[] = [];
  readonly containers: Array<PairData<string, AssetInfo>> = [];
  readonly containerMap = new Map<bigint, string>();

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    super(info, r);
    const preloadTableSize = r.readInt32();
    for (let i = 0; i < preloadTableSize; i++) {
      this.preloadTable.push(new PPtr(this.__info, r));
    }
    const containerSize = r.readInt32();
    for (let i = 0; i < containerSize; i++) {
      const path = r.readAlignedString();
      const info = new AssetInfo(this.__info, r);
      this.containers.push([path, info]);
      this.containerMap.set(info.asset.pathId, path);
    }
  }
}

class AssetInfo {
  readonly preloadIndex: number;
  readonly preloadSize: number;
  readonly asset: PPtr;

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    this.preloadIndex = r.readInt32();
    this.preloadSize = r.readInt32();
    this.asset = new PPtr(info, r);
  }
}
