import type { SpriteAtlas, Texture2D } from '..';
import type { RectF32, Vector2, Vector4 } from '../types';
import { getJimpPNG } from '../utils/image';
import type { BufferReaderExtended } from '../utils/reader';
import { AssetBase } from './base';
import { PPtr } from './pptr';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

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
    const img = this.getImageJimp();
    if (img) return getJimpPNG(img);
  }

  getImageJimp() {
    const spriteAtlas = this.spriteAtlas?.object;
    if (spriteAtlas && this.renderDataKey) {
      const img = spriteAtlas.getImage(this.renderDataKey);
      if (img) return img;
    }
    return this.spriteRenderData.getImage();
  }
}

export class SpriteRenderData {
  readonly texture: PPtr<Texture2D>;
  readonly alphaTexture?: PPtr<Texture2D>;
  readonly textureRect: RectF32;
  readonly textureRectOffset: Vector2;
  readonly atlasRectOffset?: Vector2;
  readonly settingsRaw: SpriteSettings;
  readonly uvTransform?: Vector4;
  readonly downscaleMultiplier?: number;

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
      r.move(r.nextUInt32()); // IndexBuffer
      r.align(4);
      this.readVertexData(r);
    } else {
      const size = r.nextUInt32();
      for (let i = 0; i < size; i++) {
        this.readSpriteVertex(r);
      }
      r.move(r.nextUInt32() * 2); // indices
      r.align(4);
    }
    if (version[0] >= 2018) {
      this.readMatrix(r);
      if (version[0] === 2018 && version[1] < 2) {
        throw new Error(`SpriteRenderData not implemented for version ${version.join('.')}.`);
      }
    }
    this.textureRect = r.nextRectF32();
    this.textureRectOffset = r.nextVector2();
    if (version[0] > 5 || (version[0] === 5 && version[1] >= 6)) {
      this.atlasRectOffset = r.nextVector2();
    }
    this.settingsRaw = new SpriteSettings(r);
    if (version[0] > 4 || (version[0] === 4 && version[1] >= 5)) {
      this.uvTransform = r.nextVector4();
    }
    if (version[0] >= 2017) {
      this.downscaleMultiplier = r.nextFloat();
    }
  }

  public getImage() {
    const textureObj = this.texture.object;
    return textureObj?.getTransformedImageJimp(
      this,
      this.alphaTexture?.object ?? this.findAlphaTexture(textureObj),
    );
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

  private readVertexData(r: BufferReaderExtended) {
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

  private readSpriteVertex(r: BufferReaderExtended) {
    const { version } = this.info;
    r.nextVector3();
    if (version[0] < 4 || (version[0] === 4 && version[1] <= 3)) {
      r.nextVector2();
    }
  }

  private readMatrix(r: BufferReaderExtended) {
    const lenI = r.nextUInt32();
    for (let i = 0; i < lenI; i++) {
      const lenJ = r.nextUInt32();
      r.move(lenJ * 4);
    }
  }
}

export enum SpritePackingMode {
  Tight,
  Rectangle,
}

export enum SpritePackingRotation {
  None,
  FlipHorizontal,
  FlipVertical,
  Rotate180,
  Rotate90,
}

export enum SpriteMeshType {
  FullRect,
  Tight,
}

export class SpriteSettings {
  readonly packed: number;
  readonly packingMode: SpritePackingMode;
  readonly packingRotation: SpritePackingRotation;
  readonly meshType: SpriteMeshType;

  constructor(r: BufferReaderExtended) {
    const raw = r.nextUInt32();

    this.packed = raw & 1;
    this.packingMode = (raw >> 1) & 1;
    this.packingRotation = (raw >> 2) & 1;
    this.meshType = (raw >> 6) & 1;
  }
}
