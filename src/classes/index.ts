import { AssetBundle } from './assetBundle';
import { MonoBehaviour } from './monoBehaviour';
import { MonoScript } from './monoScript';
import { Sprite } from './sprite';
import { SpriteAtlas } from './spriteAtlas';
import { TextAsset } from './textAsset';
import { Texture2D } from './texture2d';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

export type AssetObject =
  | TextAsset
  | Texture2D
  | Sprite
  | SpriteAtlas
  | AssetBundle
  | MonoBehaviour
  | MonoScript;

type ImplementedAssetType = keyof typeof classMap;

const classMap = {
  [AssetType.TextAsset]: TextAsset,
  [AssetType.Texture2D]: Texture2D,
  [AssetType.Sprite]: Sprite,
  [AssetType.SpriteAtlas]: SpriteAtlas,
  [AssetType.AssetBundle]: AssetBundle,
  [AssetType.MonoBehaviour]: MonoBehaviour,
  [AssetType.MonoScript]: MonoScript,
} as const;

export const createAssetObject = (info: ObjectInfo) => {
  if (info.classId in classMap) {
    return new classMap[info.classId as ImplementedAssetType](info, info.getReader());
  }
};
