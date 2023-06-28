import { cloneDeep, once } from 'lodash';
import type { Texture2D } from '..';
import type { RectF32 } from '../types';
import { Jimp } from '../utils/jimp';
import type { BufferReaderExtended } from '../utils/reader';
import { AssetBase } from './base';
import type { ObjectInfo } from './types';
import { AssetType } from './types';
import type { AssetObject } from '.';

const textureCache = new Map<string, Jimp>();

export interface SpriteResult {
  name: string;
  width: number;
  height: number;
  data: Buffer;
}

export class Sprite extends AssetBase<SpriteResult> {
  readonly type = AssetType.Sprite;

  get image() {
    return this.read().image.clone();
  }

  async load(): Promise<SpriteResult> {
    return cloneDeep(await this.handleResult());
  }

  private readonly read = once(() => {
    const { version } = this.info;
    const r = this.info.getReader();
    r.seek(this.info.bytesStart);
    const name = r.nextAlignedString();
    const rect = r.nextRectF32();
    const offset = r.nextVector2();
    const border = version[0] > 4 || (version[0] === 4 && version[1] >= 5) ? r.nextVector4() : null;
    const pixelsToUnits = r.nextFloat();
    const pivot =
      version[0] > 5 ||
      (version[0] === 5 && version[1] > 4) ||
      (version[0] === 5 && version[1] === 4 && version[2] >= 2) ||
      (version[0] === 5 &&
        version[1] === 4 &&
        version[2] === 1 &&
        version[3] >= 3 &&
        this.info.buildType === 'p')
        ? r.nextVector2()
        : null;
    const extrude = r.nextUInt32();
    let isPolygon: boolean | null = null;
    if (version[0] > 5 || (version[0] === 5 && version[1] >= 3)) {
      isPolygon = !!r.nextUInt8();
      r.align(4);
    }
    if (version[0] >= 2017) {
      r.move(16 + 8);
      const length = r.nextInt32();
      for (let i = 0; i < length; i++) {
        r.nextAlignedString();
      }
      new PPtr<any>(this.info, r);
    }
    const spriteRenderData = new SpriteRenderData(this.info, r);
    return {
      name,
      rect,
      offset,
      border,
      pixelsToUnits,
      pivot,
      extrude,
      isPolygon,
      spriteRenderData,
      image: spriteRenderData.getImage(name),
    };
  });

  private readonly handleResult = once(async () => {
    const {
      name,
      rect: { width, height },
      image,
    } = this.read();
    return {
      name,
      width,
      height,
      data: await image.deflateStrategy(0).getBufferAsync(Jimp.MIME_PNG),
    };
  });
}

class PPtr<T extends AssetObject> {
  fileId: number;
  pathId: string;

  constructor(private readonly info: ObjectInfo, r: BufferReaderExtended) {
    this.fileId = r.nextInt32();
    this.pathId = info.assetVersion < 14 ? String(r.nextInt32()) : r.nextInt64String();
  }

  get object() {
    return this.info.bundle.objectMap.get(this.pathId) as T | undefined;
  }
}

class SpriteRenderData {
  texture: PPtr<Texture2D>;
  alphaTexture?: PPtr<Texture2D>;
  textureRect?: RectF32;

  constructor(private readonly info: ObjectInfo, r: BufferReaderExtended) {
    const { version } = this.info;
    this.texture = new PPtr(info, r);
    if (version[0] > 5 || (version[0] === 5 && version[1] >= 2)) {
      this.alphaTexture = new PPtr(info, r);
    }
    if (version[0] >= 2019) {
      const size = r.nextInt32();
      if (size > 0) throw new Error('SecondarySpriteTexture is not implemented.');
    }
    if (version[0] > 5 || (version[0] === 5 && version[1] >= 6)) {
      const size = r.nextInt32();
      for (let i = 0; i < size; i++) {
        this.loadSubMesh(r);
      }
      r.move(r.nextInt32());
      r.align(4);
      this.loadVertexData(r);
      this.textureRect = r.nextRectF32();
    } else {
      const size = r.nextInt32();
      for (let i = 0; i < size; i++) {
        this.loadSpriteVertex(r);
      }
      r.move(r.nextInt32() * 2);
      r.align(4);
    }
  }

  public getImage(name?: string) {
    const textureObj = this.texture.object;
    if (!textureObj) throw new Error(`Cannot find texture "${this.texture.pathId}".`);
    const alphaTextureObj =
      this.alphaTexture?.object ?? (name ? this.findAlphaTexture(name) : undefined);
    const cacheKey = `${this.texture.pathId}-${alphaTextureObj?.pathId ?? ''}`;
    const mixedTexture =
      textureCache.get(cacheKey) ??
      (() => {
        const texture = textureObj.image;
        const alphaTexture = alphaTextureObj?.image;
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

  private findAlphaTexture(name: string) {
    const alphaName = `${name}[alpha]`;
    return Array.from(this.info.bundle.objectMap.values()).find(
      obj => obj.type === AssetType.Texture2D && obj.name === alphaName,
    ) as Texture2D | undefined;
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
