import { loopEach } from '../utils/loop';
import type { ArrayBufferReader } from '../utils/reader';
import { AssetBase } from './base';
import { PPtr } from './pptr';
import type { ObjectInfo, PairData } from './types';
import { AssetType } from './types';

export class AssetBundle extends AssetBase {
  readonly type = AssetType.AssetBundle;
  readonly preloadTable: PPtr[] = [];
  readonly containers: Array<PairData<String, AssetInfo>> = [];
  readonly containerMap = new Map<bigint, String>();

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    super(info, r);

    if (info.isArknightsEndfield()) r.move(4);

    loopEach(r.readInt32(), () => {
      this.preloadTable.push(new PPtr(this.__info, r));
    });

    loopEach(r.readInt32(), () => {
      // eslint-disable-next-line no-new-wrappers
      const path = new String(r.readAlignedString());
      const container = new AssetInfo(this.__info, r);
      this.containers.push([path, container]);

      const { preloadIndex, preloadSize } = container;
      const preloadEnd = preloadIndex + preloadSize;
      this.preloadTable.slice(preloadIndex, preloadEnd).forEach(preload => {
        this.containerMap.set(preload.pathId, path);
      });
    });
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
