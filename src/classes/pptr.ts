import type { BufferReaderExtended } from '../utils/reader';
import type { ObjectInfo } from './types';
import type { AssetObject } from '.';

export class PPtr<T extends AssetObject = AssetObject> {
  fileId: number;
  pathId: string;

  constructor(private readonly info: ObjectInfo, r: BufferReaderExtended) {
    this.fileId = r.nextInt32();
    this.pathId = info.assetVersion < 14 ? String(r.nextInt32()) : r.nextInt64String();
  }

  get object() {
    return this.info.bundle.objectMap.get(this.pathId) as T | undefined;
  }
}
