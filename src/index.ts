import { UnityAssetBundle } from './bundle';
export const loadAssetBundle = UnityAssetBundle.load;

export { AssetType } from './classes/types';
export type { AssetObject } from './classes/index';

export type * from './classes/textAsset';
export type * from './classes/texture2d';
export type * from './classes/sprite';
export type * from './classes/assetBundle';
