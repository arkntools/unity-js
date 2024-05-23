import type { BufferReaderExtended } from '../utils/reader';
import { AssetBase } from './base';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

export interface TextAssetResult {
  name: string;
  data: Buffer;
}

export class TextAsset extends AssetBase {
  readonly type = AssetType.TextAsset;
  readonly data: Buffer;

  constructor(info: ObjectInfo, r: BufferReaderExtended) {
    super(info, r);
    const length = r.nextInt32();
    this.data = r.nextBuffer(length);
  }
}
