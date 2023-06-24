import type { ObjectInfo } from '../asset';
import { TextAsset } from './textAsset';
import { AssetType } from './types';
import { UnknownAsset } from './unknown';

export type AssetObject = TextAsset | UnknownAsset;

const classMap: Record<number, new (info: ObjectInfo) => AssetObject> = {
  [AssetType.TextAsset]: TextAsset,
};

export const createAssetObject = (info: ObjectInfo) => {
  if (info.classId in classMap) return new classMap[info.classId](info);
  return new UnknownAsset(info);
};
