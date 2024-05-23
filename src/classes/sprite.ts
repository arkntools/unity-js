import type Jimp from 'jimp';
import type { SpriteAtlas, Texture2D } from '..';
import type { RectF32, Vector2, Vector4 } from '../types';
import { getJimpPNG } from '../utils/image';
import type { BufferReaderExtended } from '../utils/reader';
import { AssetBase } from './base';
import { PPtr } from './pptr';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

const textureCache = new Map<string, Jimp>();

export class Sprite extends AssetBase {
  readonly type = AssetType.Sprite;
  readonly rect: RectF32;
  readonly offset: Vector2;
  readonly border?: Vector4;
  readonly pixelsToUnits: number;
  readonly pivot?: Vector2;
  readonly extrude: number;
  readonly isPolygon?: boolean;
  readonly renderDataKey?: string;
  readonly atlasTags?: string[];
  readonly spriteAtlas?: PPtr<SpriteAtlas>;
  readonly spriteRenderData: SpriteRenderData;

  constructor(info: ObjectInfo, r: BufferReaderExtended) {
    super(info, r);
    const { version } = this.info;
    this.rect = r.nextRectF32();
    this.offset = r.nextVector2();
    this.border =
      version[0] > 4 || (version[0] === 4 && version[1] >= 5) ? r.nextVector4() : undefined;
    this.pixelsToUnits = r.nextFloat();
    this.pivot =
      version[0] > 5 ||
      (version[0] === 5 && version[1] > 4) ||
      (version[0] === 5 && version[1] === 4 && version[2] >= 2) ||
      (version[0] === 5 &&
        version[1] === 4 &&
        version[2] === 1 &&
        version[3] >= 3 &&
        this.info.buildType === 'p')
        ? r.nextVector2()
        : undefined;
    this.extrude = r.nextUInt32();
    if (version[0] > 5 || (version[0] === 5 && version[1] >= 3)) {
      this.isPolygon = r.nextBoolean();
      r.align(4);
    }
    if (version[0] >= 2017) {
      this.renderDataKey = r.nextBuffer(16 + 8).toString('hex');
      this.atlasTags = r.nextAlignedStringArray();
      this.spriteAtlas = new PPtr<SpriteAtlas>(this.info, r);
    }
    this.spriteRenderData = new SpriteRenderData(this.info, r);
  }

  getImage() {
    return getJimpPNG(this.getImageJimp());
  }

  getImageJimp() {
    const spriteAtlas = this.spriteAtlas?.object;
    if (spriteAtlas && this.renderDataKey) {
      spriteAtlas.getImage(this.renderDataKey);
    }
    return this.spriteRenderData.getImage();
  }
}

class SpriteRenderData {
  texture: PPtr<Texture2D>;
  alphaTexture?: PPtr<Texture2D>;
  textureRect?: RectF32;
  textureRectOffset?: Vector2;

  constructor(
    private readonly info: ObjectInfo,
    r: BufferReaderExtended,
  ) {
    const { version } = this.info;
    this.texture = new PPtr(info, r);
    if (version[0] > 5 || (version[0] === 5 && version[1] >= 2)) {
      this.alphaTexture = new PPtr(info, r);
    }
    if (version[0] >= 2019) {
      const size = r.nextUInt32();
      if (size > 0) throw new Error('SecondarySpriteTexture is not implemented.');
    }
    if (version[0] > 5 || (version[0] === 5 && version[1] >= 6)) {
      const size = r.nextUInt32();
      for (let i = 0; i < size; i++) {
        this.loadSubMesh(r);
      }
      r.move(r.nextUInt32());
      r.align(4);
      this.loadVertexData(r);
      this.textureRect = r.nextRectF32();
      this.textureRectOffset = r.nextVector2();
    } else {
      const size = r.nextUInt32();
      for (let i = 0; i < size; i++) {
        this.loadSpriteVertex(r);
      }
      r.move(r.nextUInt32() * 2);
      r.align(4);
    }
  }

  public getImage() {
    const textureObj = this.texture.object;
    if (!textureObj) throw new Error(`Cannot find texture "${this.texture.pathId}".`);
    const alphaTextureObj = this.alphaTexture?.object ?? this.findAlphaTexture(textureObj);
    const cacheKey = `${this.texture.pathId}-${alphaTextureObj?.pathId ?? ''}`;
    const mixedTexture =
      textureCache.get(cacheKey) ??
      (() => {
        const texture = textureObj.getImageJimp();
        const alphaTexture = alphaTextureObj?.getImageJimp();
        const [tw, th] = [texture.getWidth(), texture.getHeight()];
        if (alphaTexture) {
          const [atw, ath] = [alphaTexture.getWidth(), alphaTexture.getHeight()];
          if (tw !== atw || th !== ath) {
            alphaTexture.resize(tw, th);
          }
          texture.scan(0, 0, tw, th, function (x, y, idx) {
            this.bitmap.data[idx + 3] = alphaTexture.bitmap.data[idx];
          });
        }
        textureCache.set(cacheKey, texture);
        return texture;
      })();
    if (this.textureRect) {
      const { x, y, width, height } = this.textureRect;
      const realY = mixedTexture.getHeight() - y - height;
      return mixedTexture.clone().crop(x, realY, width, height);
    }
    return mixedTexture;
  }

  private findAlphaTexture(texture: Texture2D) {
    return this.info.bundle.options?.findAlphaTexture?.(
      texture,
      Array.from(this.info.bundle.objectMap.values()).filter(
        (obj): obj is Texture2D => obj.type === AssetType.Texture2D,
      ),
    );
  }

  private loadSubMesh(r: BufferReaderExtended) {
    const { version } = this.info;
    r.move(12);
    if (version[0] < 4) r.move(4);
    if (version[0] > 2017 || (version[0] === 2017 && version[1] >= 3)) r.move(4);
    if (version[0] >= 3) {
      r.move(8);
      this.loadAABB(r);
    }
  }

  private loadAABB(r: BufferReaderExtended) {
    r.nextVector3();
    r.nextVector3();
  }

  private loadVertexData(r: BufferReaderExtended) {
    const { version } = this.info;
    if (version[0] < 2018) r.move(4);
    r.move(4);
    if (version[0] >= 4) {
      const size = r.nextInt32();
      for (let i = 0; i < size; i++) {
        r.move(4);
      }
    }
    if (version[0] < 5) {
      const size = version[0] < 4 ? 4 : r.nextInt32();
      for (let i = 0; i < size; i++) {
        r.move(2);
        r.move(version[0] < 4 ? 8 : 4);
      }
    }
    r.move(r.nextInt32());
  }

  private loadSpriteVertex(r: BufferReaderExtended) {
    const { version } = this.info;
    r.nextVector3();
    if (version[0] < 4 || (version[0] === 4 && version[1] <= 3)) {
      r.nextVector2();
    }
  }
}
