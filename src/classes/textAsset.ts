import { cloneDeep, once } from 'lodash';
import { AssetBase } from './base';
import { AssetType } from './types';

export interface TextAssetResult {
  name: string;
  data: Buffer;
}

export class TextAsset extends AssetBase<TextAssetResult> {
  readonly type = AssetType.TextAsset;

  private readonly read = once(() => {
    const r = this.info.getReader();
    r.seek(this.info.bytesStart);
    const name = r.nextAlignedString();
    const length = r.nextInt32();
    const data = r.nextBuffer(length);
    return { name, data };
  });

  async load() {
    return cloneDeep(this.read());
  }
}
