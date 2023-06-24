import type { ObjectInfo } from '../asset';
import type { AssetInterface, AssetType, ImplementedAssetType } from './types';

export class UnknownAsset implements AssetInterface {
  readonly type: Exclude<AssetType, ImplementedAssetType>;

  constructor(private readonly info: ObjectInfo) {
    this.type = info.classId;
  }

  load() {
    throw new Error('This type of asset is not implemented.');
  }
}
