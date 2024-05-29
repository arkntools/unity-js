import type { ArrayBufferReader } from '../utils/reader';
import { AssetBase } from './base';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

export class TextAsset extends AssetBase {
  readonly type = AssetType.TextAsset;
  readonly data: ArrayBuffer;

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    super(info, r);
    const length = r.readInt32();
    this.data = r.readBuffer(length);
  }
}
