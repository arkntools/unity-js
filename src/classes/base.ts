import type { ArrayBufferReader } from '../utils/reader';
import type { AssetType, ObjectInfo } from './types';

export abstract class AssetBase {
  abstract readonly type: AssetType;
  readonly name: string;

  constructor(
    protected readonly info: ObjectInfo,
    r: ArrayBufferReader,
  ) {
    r.seek(info.bytesStart);
    this.name = r.readAlignedString();
  }

  get pathId() {
    return this.info.pathId;
  }

  get size() {
    return this.info.bytesSize;
  }
}
