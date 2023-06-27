import { AssetBase } from './base';
import type { AssetType, ObjectInfo } from './types';
import type { ImplementedAssetType } from '.';

export class UnknownAsset extends AssetBase<void> {
  readonly type: Exclude<AssetType, ImplementedAssetType> = this.info.classId;

  constructor(info: ObjectInfo) {
    super(info, false);
  }

  async load() {
    throw new Error('This type of asset is not implemented.');
  }
}
