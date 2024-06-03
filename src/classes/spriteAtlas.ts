import { SpriteSettings } from '..';
import type { Sprite, Texture2D } from '..';
import type { RectF32, Vector2, Vector4 } from '../types';
import { bufferToHex } from '../utils/buffer';
import type { ArrayBufferReader } from '../utils/reader';
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

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    super(info, r);

    const packedSpritesSize = r.readUInt32();
    for (let i = 0; i < packedSpritesSize; i++) {
      this.packedSprites.push(new PPtr(this.__info, r));
    }

    r.readAlignedStringArray();

    const renderDataMapSize = r.readUInt32();
    for (let i = 0; i < renderDataMapSize; i++) {
      const key = bufferToHex(r.readBuffer(16 + 8));
      const data = new SpriteAtlasData(this.__info, r);
      this.renderDataMap.set(key, data);
    }

    r.readAlignedString();

    this.isVariant = r.readBoolean();
  }

  getImage(renderDataKey: string) {
    return this.renderDataMap.get(renderDataKey)?.getImage();
  }
}

export class SpriteAtlasData {
  readonly texture: PPtr<Texture2D>;
  readonly alphaTexture: PPtr<Texture2D>;
  readonly textureRect: RectF32;
  readonly textureRectOffset: Vector2;
  readonly atlasRectOffset?: Vector2;
  readonly uvTransform: Vector4;
  readonly downscaleMultiplier: number;
  readonly settingsRaw: SpriteSettings;

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    const { version } = info;
    this.texture = new PPtr(info, r);
    this.alphaTexture = new PPtr(info, r);
    this.textureRect = r.readRectF32();
    this.textureRectOffset = r.readVector2();
    if (version[0] > 2017 || (version[0] === 2017 && version[1] >= 2)) {
      this.atlasRectOffset = r.readVector2();
    }
    this.uvTransform = r.readVector4();
    this.downscaleMultiplier = r.readFloat32();
    this.settingsRaw = new SpriteSettings(r);
    if (version[0] > 2020 || (version[0] === 2020 && version[1] >= 2)) {
      const size = r.readUInt32();
      if (size > 0) throw new Error('SecondarySpriteTexture is not implemented.');
    }
  }

  public getImage() {
    const textureObj = this.texture.object;
    return textureObj?.getTransformedImageJimp(this, this.alphaTexture.object);
  }
}
