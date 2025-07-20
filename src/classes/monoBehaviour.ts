import { getJimpPNG } from '../lib/jimp';
import type { RectF32 } from '../types';
import type { ArrayBufferReader } from '../utils/reader';
import { AssetBase } from './base';
import type { MonoScript } from './monoScript';
import { PPtr } from './pptr';
import type { Texture2D } from './texture2d';
import type { ImgBitMap, ObjectInfo } from './types';
import { AssetType } from './types';

class AtlasInfo {
  constructor(
    readonly index: number,
    readonly texture: PPtr<Texture2D>,
    readonly alpha: PPtr<Texture2D>,
    readonly size: number,
  ) {}

  getImageJimp() {
    const texture = this.texture.object;
    if (!texture) return;
    const alpha = this.alpha.object;
    return alpha ? texture.getMixJimp(alpha) : texture.getImageJimp();
  }

  getImage() {
    const img = this.getImageJimp();
    if (!img) return;
    return getJimpPNG(img);
  }

  getImageBitmap(): ImgBitMap | undefined {
    const bitmap = this.getImageJimp()?.bitmap;
    if (!bitmap) return;
    return {
      data: bitmap.data.buffer as unknown as ArrayBuffer,
      width: bitmap.width,
      height: bitmap.height,
    };
  }
}

class AtlasSprite {
  constructor(
    readonly name: string,
    readonly guid: string,
    readonly atlas: AtlasInfo,
    readonly rect: RectF32,
    readonly rotate: number,
  ) {}

  getImageJimp() {
    const texture = this.atlas.texture.object;
    const alpha = this.atlas.alpha.object;
    return texture?.getTransformedImageJimp({ textureRect: this.rect }, alpha);
  }

  getImage() {
    const img = this.getImageJimp();
    if (!img) return;
    return getJimpPNG(img);
  }

  getImageBitmap(): ImgBitMap | undefined {
    const bitmap = this.getImageJimp()?.bitmap;
    if (!bitmap) return;
    return {
      data: bitmap.data.buffer as unknown as ArrayBuffer,
      width: bitmap.width,
      height: bitmap.height,
    };
  }
}

export class MonoBehaviour extends AssetBase {
  readonly type = AssetType.MonoBehaviour;
  readonly gameObject: PPtr;
  readonly enable: boolean;
  readonly script: PPtr<MonoScript>;
  readonly atlases?: AtlasInfo[];
  readonly sprites?: AtlasSprite[];

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    super(info, r, false);
    this.gameObject = new PPtr(info, r);
    this.enable = r.readBoolean();
    r.align(4);
    this.script = new PPtr<MonoScript>(info, r);
    this.readName(r);

    const typeTree = this.getTypeTree();
    if (typeTree) {
      if (Array.isArray(typeTree._atlases)) {
        try {
          this.atlases = typeTree._atlases.map(
            ({ index, texture, alpha, size }) =>
              new AtlasInfo(
                index,
                new PPtr(info, texture.m_FileID, texture.m_PathID),
                new PPtr(info, alpha.m_FileID, alpha.m_PathID),
                size,
              ),
          );
        } catch {}
      }

      const { atlases } = this;
      if (atlases && Array.isArray(typeTree._sprites)) {
        try {
          this.sprites = typeTree._sprites.map(({ name, guid, atlas, rect, rotate }) => {
            const atlasInfo = atlases[atlas];
            if (!atlasInfo) throw new Error('atlasInfo not found');
            return new AtlasSprite(name, guid, atlasInfo, rect, rotate);
          });
        } catch {}
      }
    }
  }
}

export { AtlasInfo as MonoBehaviourAtlasInfo, AtlasSprite as MonoBehaviourAtlasSprite };
