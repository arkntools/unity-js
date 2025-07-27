import { size } from 'es-toolkit/compat';
import type { RectF32 } from '../types';
import type { ArrayBufferReader } from '../utils/reader';
import type { GetImage } from './base';
import { AssetBase, defaultGetImage, defaultGetImageBitmap } from './base';
import type { Material } from './material';
import type { MonoScript } from './monoScript';
import { PPtr } from './pptr';
import type { TextAsset } from './textAsset';
import type { Texture2D } from './texture2d';
import type { ImgBitMap, ObjectInfo } from './types';
import { AssetType } from './types';

class AtlasInfo implements GetImage {
  getImage = defaultGetImage;
  getImageBitmap = defaultGetImageBitmap;

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
}

class AtlasSprite implements GetImage {
  getImage = defaultGetImage;
  getImageBitmap = defaultGetImageBitmap;

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
}

export interface MonoBehaviourSpine<T> {
  skel: Record<string, ArrayBuffer>;
  atlas: Record<string, ArrayBuffer>;
  image: Record<string, T>;
}

export class MonoBehaviour extends AssetBase {
  readonly type = AssetType.MonoBehaviour;
  readonly gameObject: PPtr;
  readonly enable: boolean;
  readonly script: PPtr<MonoScript>;

  // for images
  readonly atlases?: AtlasInfo[];
  readonly sprites?: AtlasSprite[];

  // for skeleton data
  readonly atlasAssets?: PPtr<MonoBehaviour>[];
  readonly skeletonJSON?: PPtr<TextAsset>;

  // for atlas
  readonly atlasFile?: PPtr<TextAsset>;
  readonly materials?: PPtr<Material>[];

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
                PPtr.fromPlainObject(info, texture, false),
                PPtr.fromPlainObject(info, alpha, false),
                size,
              ),
          );
        } catch {}
      }

      if (this.atlases && Array.isArray(typeTree._sprites)) {
        try {
          this.sprites = typeTree._sprites.map(({ name, guid, atlas, rect, rotate }) => {
            const atlasInfo = this.atlases![atlas];
            if (!atlasInfo) throw new Error('atlasInfo not found');
            return new AtlasSprite(name, guid, atlasInfo, rect, rotate);
          });
        } catch {}
      }

      if (Array.isArray(typeTree.atlasAssets)) {
        this.atlasAssets = PPtr.fromPlainObjectList(info, typeTree.atlasAssets);
      }

      if (typeTree.skeletonJSON) {
        this.skeletonJSON = PPtr.fromPlainObject(info, typeTree.skeletonJSON);
      }

      if (typeTree.atlasFile) {
        this.atlasFile = PPtr.fromPlainObject(info, typeTree.atlasFile);
      }

      if (Array.isArray(typeTree.materials)) {
        this.materials = PPtr.fromPlainObjectList(info, typeTree.materials);
      }
    }
  }

  get isSpine() {
    return !!(this.atlasAssets?.[0]?.object && this.skeletonJSON?.object?.data);
  }

  async getSpine<T extends boolean = false>(
    getImageBitMap?: T,
  ): Promise<MonoBehaviourSpine<T extends true ? ImgBitMap : ArrayBuffer> | undefined> {
    const atlasAssets = PPtr.toObjectList(this.atlasAssets || []);
    const skelAsset = this.skeletonJSON?.object;
    if (!atlasAssets.length || !skelAsset) return;

    const skel: Record<string, ArrayBuffer> = { [skelAsset.name]: skelAsset.data };
    const atlas: Record<string, ArrayBuffer> = {};
    const materials: Material[] = [];

    for (const atlasAsset of atlasAssets) {
      const atlasFile = atlasAsset.atlasFile?.object;
      const atlasMaterials = PPtr.toObjectList(atlasAsset.materials || []);
      if (atlasFile) atlas[atlasFile.name] = atlasFile.data;
      materials.push(...atlasMaterials);
    }

    if (!size(atlas) || !materials.length) return;

    const image: Record<string, T extends true ? ImgBitMap : ArrayBuffer> = {};
    await Promise.allSettled(
      materials.map(async material => {
        const name = material.getImageName();
        if (!name) return;
        const data = getImageBitMap
          ? await material.getImageBitmap()
          : (await material.getImage())?.buffer;
        if (data) image[`${name}.png`] = data as any;
      }),
    );
    if (!size(image)) return;

    return { skel, atlas, image };
  }
}

export { AtlasInfo as MonoBehaviourAtlasInfo, AtlasSprite as MonoBehaviourAtlasSprite };
