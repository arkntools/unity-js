import type { SpriteAtlas, Texture2D } from '..';
import type { RectF32, Vector2, Vector3, Vector4 } from '../types';
import { bufferToHex } from '../utils/buffer';
import { loopEach, loopMap } from '../utils/loop';
import type { ArrayBufferReader } from '../utils/reader';
import type { GetImage } from './base';
import { AssetBase, defaultGetImage, defaultGetImageBitmap } from './base';
import { SubMesh, VertexData } from './mesh';
import { PPtr } from './pptr';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

export class Sprite extends AssetBase implements GetImage {
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

  getImage = defaultGetImage;
  getImageBitmap = defaultGetImageBitmap;

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

  getImageJimp() {
    const tightInfo: SpriteTightInfo = {
      getTriangles: () => this.spriteRenderData.getTriangles(),
      pixelsToUnits: this.pixelsToUnits,
      pivot: this.pivot ?? { x: 0.5, y: 0.5 },
      spriteRect: this.rect,
    };
    const spriteAtlas = this.spriteAtlas?.object;
    if (spriteAtlas && this.renderDataKey) {
      const img = spriteAtlas.getImage(this.renderDataKey, tightInfo);
      if (img) return img;
    }
    return this.spriteRenderData.getImage(tightInfo);
  }
}

export class SpriteRenderData {
  readonly texture: PPtr<Texture2D>;
  readonly alphaTexture?: PPtr<Texture2D>;
  readonly subMeshes?: SubMesh[];
  readonly indexBuffer?: Uint8Array<ArrayBuffer>;
  readonly vertexData?: VertexData;
  readonly vertices?: SpriteVertex[];
  readonly indices?: number[];
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
      this.subMeshes = loopMap(r.readUInt32(), () => new SubMesh(r, version));
      this.indexBuffer = new Uint8Array(r.readBuffer(r.readUInt32()));
      r.align(4);
      this.vertexData = new VertexData(r, version);
    } else {
      this.vertices = loopMap(r.readUInt32(), () => this.readSpriteVertex(r));
      this.indices = r.readUInt16Array(r.readUInt32());
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

  getImage(tightInfo?: SpriteTightInfo) {
    const textureObj = this.texture.object;
    return textureObj?.getTransformedImageJimp(
      this,
      this.alphaTexture?.object ?? this.findAlphaTexture(textureObj),
      tightInfo,
    );
  }

  getTriangles(): Array<[Vector2, Vector2, Vector2]> {
    if (this.vertices && this.indices) {
      const vertices: Vector2[] = this.vertices.map(v => ({ x: v.pos.x, y: v.pos.y }));
      const triangleCount = Math.floor(this.indices.length / 3);
      const result: Array<[Vector2, Vector2, Vector2]> = [];
      for (let i = 0; i < triangleCount; i++) {
        result.push([
          vertices[this.indices[i * 3]],
          vertices[this.indices[i * 3 + 1]],
          vertices[this.indices[i * 3 + 2]],
        ]);
      }
      return result;
    }

    if (this.vertexData && this.indexBuffer && this.subMeshes) {
      const result: Array<[Vector2, Vector2, Vector2]> = [];
      const channel = this.vertexData.channels![0];
      const stream = this.vertexData.streams![channel.stream];
      const vertexDV = new DataView(
        this.vertexData.dataSize.buffer,
        this.vertexData.dataSize.byteOffset,
        this.vertexData.dataSize.byteLength,
      );
      const indexDV = new DataView(
        this.indexBuffer.buffer,
        this.indexBuffer.byteOffset,
        this.indexBuffer.byteLength,
      );

      for (const subMesh of this.subMeshes) {
        const firstVertex = subMesh.firstVertex ?? 0;
        const vertexCount = subMesh.vertexCount ?? 0;
        let vOffset = stream.offset + firstVertex * stream.stride + channel.offset;
        const vertices: Vector2[] = [];
        for (let v = 0; v < vertexCount; v++) {
          vertices.push({
            x: vertexDV.getFloat32(vOffset, true),
            y: vertexDV.getFloat32(vOffset + 4, true),
          });
          vOffset += stream.stride;
        }

        let iOffset = subMesh.firstByte;
        const triangleCount = Math.floor(subMesh.indexCount / 3);
        for (let i = 0; i < triangleCount; i++) {
          const first = indexDV.getUint16(iOffset, true) - firstVertex;
          const second = indexDV.getUint16(iOffset + 2, true) - firstVertex;
          const third = indexDV.getUint16(iOffset + 4, true) - firstVertex;
          iOffset += 6;
          result.push([vertices[first], vertices[second], vertices[third]]);
        }
      }
      return result;
    }

    return [];
  }

  private findAlphaTexture(texture: Texture2D) {
    return this.__info.bundle.options?.findAlphaTexture?.(
      texture,
      Array.from(this.__info.bundle.objectMap.values()).filter(
        (obj): obj is Texture2D => obj.type === AssetType.Texture2D,
      ),
    );
  }

  private readVertexData(r: ArrayBufferReader) {
    const { version } = this.__info;
    if (version[0] < 2018) r.move(4);
    r.move(4);
    if (version[0] >= 4) {
      loopEach(r.readInt32(), () => r.move(4));
    }
    if (version[0] < 5) {
      loopEach(version[0] < 4 ? 4 : r.readInt32(), () => {
        r.move(2);
        r.move(version[0] < 4 ? 8 : 4);
      });
    }
    r.move(r.readInt32());
  }

  private readSpriteVertex(r: ArrayBufferReader) {
    const { version } = this.__info;
    const vertex: SpriteVertex = {
      pos: r.readVector3(),
    };
    if (version[0] < 4 || (version[0] === 4 && version[1] <= 3)) {
      vertex.uv = r.readVector2();
    }
    return vertex;
  }

  private readMatrix(r: ArrayBufferReader) {
    loopEach(r.readUInt32(), () => {
      r.move(r.readUInt32() * 4);
    });
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
    this.packingRotation = (raw >> 2) & 0xf;
    this.meshType = (raw >> 6) & 1;
  }
}

export interface SpriteVertex {
  pos: Vector3;
  uv?: Vector2;
}

export interface SpriteTightInfo {
  getTriangles: () => Array<[Vector2, Vector2, Vector2]>;
  pixelsToUnits: number;
  pivot: Vector2;
  spriteRect: RectF32;
}
