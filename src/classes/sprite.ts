import type { SpriteAtlas, Texture2D } from '..';
import type { RectF32, Vector2, Vector4 } from '../types';
import { bufferToHex } from '../utils/buffer';
import { getJimpPNG } from '../utils/jimp';
import type { ArrayBufferReader } from '../utils/reader';
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

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    super(info, r);
    const { version } = this.__info;
    this.rect = r.readRectF32();
    this.offset = r.readVector2();
    this.border =
      version[0] > 4 || (version[0] === 4 && version[1] >= 5) ? r.readVector4() : undefined;
    this.pixelsToUnits = r.readFloat32();
    this.pivot =
      version[0] > 5 ||
      (version[0] === 5 && version[1] > 4) ||
      (version[0] === 5 && version[1] === 4 && version[2] >= 2) ||
      (version[0] === 5 &&
        version[1] === 4 &&
        version[2] === 1 &&
        version[3] >= 3 &&
        this.__info.buildType === 'p')
        ? r.readVector2()
        : undefined;
    this.extrude = r.readUInt32();
    if (version[0] > 5 || (version[0] === 5 && version[1] >= 3)) {
      this.isPolygon = r.readBoolean();
      r.align(4);
    }
    if (version[0] >= 2017) {
      this.renderDataKey = bufferToHex(r.readBuffer(24), true);
      this.atlasTags = r.readAlignedStringArray();
      this.spriteAtlas = new PPtr(this.__info, r);
    }
    this.spriteRenderData = new SpriteRenderData(this.__info, r);
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
    private readonly __info: ObjectInfo,
    r: ArrayBufferReader,
  ) {
    const { version } = this.__info;
    this.texture = new PPtr(__info, r);
    if (version[0] > 5 || (version[0] === 5 && version[1] >= 2)) {
      this.alphaTexture = new PPtr(__info, r);
    }
    if (version[0] >= 2019) {
      const size = r.readUInt32();
      if (size > 0) throw new Error('SecondarySpriteTexture is not implemented.');
    }
    if (version[0] > 5 || (version[0] === 5 && version[1] >= 6)) {
      const size = r.readUInt32();
      for (let i = 0; i < size; i++) {
        this.loadSubMesh(r);
      }
      r.move(r.readUInt32()); // IndexBuffer
      r.align(4);
      this.readVertexData(r);
    } else {
      const size = r.readUInt32();
      for (let i = 0; i < size; i++) {
        this.readSpriteVertex(r);
      }
      r.move(r.readUInt32() * 2); // indices
      r.align(4);
    }
    if (version[0] >= 2018) {
      this.readMatrix(r);
      if (version[0] === 2018 && version[1] < 2) {
        throw new Error(`SpriteRenderData not implemented for version ${version.join('.')}.`);
      }
    }
    this.textureRect = r.readRectF32();
    this.textureRectOffset = r.readVector2();
    if (version[0] > 5 || (version[0] === 5 && version[1] >= 6)) {
      this.atlasRectOffset = r.readVector2();
    }
    this.settingsRaw = new SpriteSettings(r);
    if (version[0] > 4 || (version[0] === 4 && version[1] >= 5)) {
      this.uvTransform = r.readVector4();
    }
    if (version[0] >= 2017) {
      this.downscaleMultiplier = r.readFloat32();
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
    return this.__info.bundle.options?.findAlphaTexture?.(
      texture,
      Array.from(this.__info.bundle.objectMap.values()).filter(
        (obj): obj is Texture2D => obj.type === AssetType.Texture2D,
      ),
    );
  }

  private loadSubMesh(r: ArrayBufferReader) {
    const { version } = this.__info;
    r.move(12);
    if (version[0] < 4) r.move(4);
    if (version[0] > 2017 || (version[0] === 2017 && version[1] >= 3)) r.move(4);
    if (version[0] >= 3) {
      r.move(8);
      this.loadAABB(r);
    }
  }

  private loadAABB(r: ArrayBufferReader) {
    r.readVector3();
    r.readVector3();
  }

  private readVertexData(r: ArrayBufferReader) {
    const { version } = this.__info;
    if (version[0] < 2018) r.move(4);
    r.move(4);
    if (version[0] >= 4) {
      const size = r.readInt32();
      for (let i = 0; i < size; i++) {
        r.move(4);
      }
    }
    if (version[0] < 5) {
      const size = version[0] < 4 ? 4 : r.readInt32();
      for (let i = 0; i < size; i++) {
        r.move(2);
        r.move(version[0] < 4 ? 8 : 4);
      }
    }
    r.move(r.readInt32());
  }

  private readSpriteVertex(r: ArrayBufferReader) {
    const { version } = this.__info;
    r.readVector3();
    if (version[0] < 4 || (version[0] === 4 && version[1] <= 3)) {
      r.readVector2();
    }
  }

  private readMatrix(r: ArrayBufferReader) {
    const lenI = r.readUInt32();
    for (let i = 0; i < lenI; i++) {
      const lenJ = r.readUInt32();
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

  constructor(r: ArrayBufferReader) {
    const raw = r.readUInt32();

    this.packed = raw & 1;
    this.packingMode = (raw >> 1) & 1;
    this.packingRotation = (raw >> 2) & 1;
    this.meshType = (raw >> 6) & 1;
  }
}
