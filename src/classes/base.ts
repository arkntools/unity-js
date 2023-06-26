import type { ObjectInfo } from '../asset';
import type { AssetType } from './types';

export abstract class AssetBase<T> {
  abstract readonly type: AssetType;
  readonly name: string;

  constructor(protected readonly info: ObjectInfo) {
    const r = info.getReader();
    r.seek(info.bytesStart);
    this.name = r.nextAlignedString();
  }

  abstract load(): Promise<T>;
}
