import type { AssetType, ObjectInfo } from './types';

export abstract class AssetBase<T> {
  abstract readonly type: AssetType;
  readonly name: string;

  constructor(protected readonly info: ObjectInfo, readName = true) {
    if (readName) {
      const r = info.getReader();
      r.seek(info.bytesStart);
      this.name = r.nextAlignedString();
    } else {
      this.name = '';
    }
  }

  get pathId() {
    return this.info.pathId;
  }

  get container() {
    return this.info.bundle.containerMap?.get(this.pathId);
  }

  abstract load(...args: any[]): Promise<Readonly<T>>;
}
