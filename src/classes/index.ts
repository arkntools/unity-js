import { TextAsset } from './textAsset';
import { Texture2D } from './texture2d';
import type { ObjectInfo } from './types';
import { AssetType } from './types';
import { UnknownAsset } from './unknown';

export type ImplementedAssetType = keyof typeof classMap;

export type AssetObject = TextAsset | Texture2D | UnknownAsset;

const classMap = {
  [AssetType.TextAsset]: TextAsset,
  [AssetType.Texture2D]: Texture2D,
} as const;

export const createAssetObject = (info: ObjectInfo) => {
  if (info.classId in classMap) return new classMap[info.classId as ImplementedAssetType](info);
  return new UnknownAsset(info);
};
