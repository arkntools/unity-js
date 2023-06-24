import once from 'lodash.once';
import type { ObjectInfo } from '../asset';
import type { AssetInterface } from './types';
import { AssetType } from './types';

export class TextAsset implements AssetInterface {
  readonly type = AssetType.TextAsset;

  constructor(private readonly info: ObjectInfo) {}

  load = once(() => {
    const r = this.info.getReader();
    r.seek(this.info.bytesStart);
    const name = r.nextAlignedString();
    const length = r.nextInt32();
    const data = r.nextBuffer(length);
    return { name, data };
  });
}
