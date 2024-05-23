import type { BufferReaderExtended } from '../utils/reader';
import { AssetBase } from './base';
import { PPtr } from './pptr';
import type { ObjectInfo, PairData } from './types';
import { AssetType } from './types';

export class AssetBundle extends AssetBase {
  readonly type = AssetType.AssetBundle;
  readonly preloadTable: PPtr[] = [];
  readonly container: Array<PairData<string, AssetInfo>> = [];
  readonly containerMap = new Map<string, string>();

  constructor(info: ObjectInfo, r: BufferReaderExtended) {
    super(info, r);
    const preloadTableSize = r.nextInt32();
    for (let i = 0; i < preloadTableSize; i++) {
      this.preloadTable.push(new PPtr(this.info, r));
    }
    const containerSize = r.nextInt32();
    for (let i = 0; i < containerSize; i++) {
      const path = r.nextAlignedString();
      const info = new AssetInfo(this.info, r);
      this.container.push([path, info]);
      this.containerMap.set(info.asset.pathId, path);
    }
  }
}

class AssetInfo {
  readonly preloadIndex: number;
  readonly preloadSize: number;
  readonly asset: PPtr;

  constructor(info: ObjectInfo, r: BufferReaderExtended) {
    this.preloadIndex = r.nextInt32();
    this.preloadSize = r.nextInt32();
    this.asset = new PPtr(info, r);
  }
}
