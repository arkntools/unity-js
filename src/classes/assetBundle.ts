import { once } from 'lodash';
import type { BufferReaderExtended } from '../utils/reader';
import { AssetBase } from './base';
import { PPtr } from './pptr';
import type { ObjectInfo, PairData } from './types';
import { AssetType } from './types';

export interface AssetBundleResult {
  name: string;
  preloadTable: PPtr[];
  container: Array<PairData<string, AssetInfo>>;
  containerMap: Map<string, string>;
}

export class AssetBundle extends AssetBase<AssetBundleResult> {
  readonly type = AssetType.AssetBundle;

  async load(): Promise<Readonly<AssetBundleResult>> {
    return this.read();
  }

  private readonly read = once(() => {
    const r = this.info.getReader();
    r.seek(this.info.bytesStart);
    const name = r.nextAlignedString();
    const preloadTableSize = r.nextInt32();
    const preloadTable: PPtr[] = [];
    for (let i = 0; i < preloadTableSize; i++) {
      preloadTable.push(new PPtr(this.info, r));
    }
    const containerSize = r.nextInt32();
    const container: Array<PairData<string, AssetInfo>> = [];
    const containerMap = new Map<string, string>();
    for (let i = 0; i < containerSize; i++) {
      const path = r.nextAlignedString();
      const info = new AssetInfo(this.info, r);
      container.push([path, info]);
      containerMap.set(info.asset.pathId, path);
    }
    return { name, preloadTable, container, containerMap };
  });
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
