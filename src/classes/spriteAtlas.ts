import type { Sprite, Texture2D } from '..';
import type { RectF32, Vector2, Vector4 } from '../types';
import type { BufferReaderExtended } from '../utils/reader';
import { AssetBase } from './base';
import { PPtr } from './pptr';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

export interface SpriteAtlasResult {
  name: string;
  packedSprites: Array<PPtr<Sprite>>;
  renderDataMap: Map<string, SpriteAtlasData>;
  isVariant: boolean;
}

export class SpriteAtlas extends AssetBase {
  readonly type = AssetType.SpriteAtlas;
  readonly packedSprites: Array<PPtr<Sprite>> = [];
  readonly renderDataMap = new Map<string, SpriteAtlasData>();
  readonly isVariant: boolean;

  constructor(info: ObjectInfo, r: BufferReaderExtended) {
    super(info, r);

    const packedSpritesSize = r.nextUInt32();
    for (let i = 0; i < packedSpritesSize; i++) {
      this.packedSprites.push(new PPtr<Sprite>(this.info, r));
    }

    r.nextAlignedStringArray();

    const renderDataMapSize = r.nextUInt32();
    for (let i = 0; i < renderDataMapSize; i++) {
      const key = r.nextBuffer(16 + 8).toString('hex');
      const data = new SpriteAtlasData(this.info, r);
      this.renderDataMap.set(key, data);
    }

    r.nextAlignedString();

    this.isVariant = r.nextBoolean();
  }

  getImage(renderDataKey: string) {
    const spriteAtlasData = this.renderDataMap.get(renderDataKey);
    if (!spriteAtlasData) return;
    const texture = spriteAtlasData.texture.object;
    // if (!texture) return;
  }
}

class SpriteAtlasData {
  texture: PPtr<Texture2D>;
  alphaTexture: PPtr<Texture2D>;
  textureRect: RectF32;
  textureRectOffset: Vector2;
  atlasRectOffset?: Vector2;
  uvTransform: Vector4;
  downscaleMultiplier: number;

  constructor(info: ObjectInfo, r: BufferReaderExtended) {
    const { version } = info;
    this.texture = new PPtr<Texture2D>(info, r);
    this.alphaTexture = new PPtr<Texture2D>(info, r);
    this.textureRect = r.nextRectF32();
    this.textureRectOffset = r.nextVector2();
    if (version[0] > 2017 || (version[0] === 2017 && version[1] >= 2)) {
      this.atlasRectOffset = r.nextVector2();
    }
    this.uvTransform = r.nextVector4();
    this.downscaleMultiplier = r.nextFloat();
    r.move(4); // SpriteSettings
    if (version[0] > 2020 || (version[0] === 2020 && version[1] >= 2)) {
      const size = r.nextUInt32();
      if (size > 0) throw new Error('SecondarySpriteTexture is not implemented.');
    }
  }
}
