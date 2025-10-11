import { last } from 'es-toolkit';
import { SpritePackingMode, SpritePackingRotation } from '..';
import type { SpriteSettings } from '..';
import { getJimpPNG, Jimp } from '../lib/jimp';
import type { RectF32 } from '../types';
import { decodeTexture } from '../utils/decodeTexture';
import { ArrayBufferReader } from '../utils/reader';
import type { GetImage } from './base';
import { AssetBase } from './base';
import type { ImgBitMap, ObjectInfo } from './types';
import { AssetType } from './types';

export interface StreamInfo {
  offset: number;
  size: number;
  path: string;
}

export interface TextureTransformedOptions {
  textureRect: RectF32;
  downscaleMultiplier?: number;
  settingsRaw?: SpriteSettings;
}

const jimpFlipVertical = (img: Jimp) => img.flip({ horizontal: false, vertical: true });

export class Texture2D extends AssetBase implements GetImage {
  readonly type = AssetType.Texture2D;
  readonly width: number;
  readonly height: number;
  readonly textureFormat: number;
  readonly streamData?: StreamInfo;
  readonly dataSize: number;
  private readonly image: TextureDecoder;

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    super(info, r);
    const { version } = this.__info;
    if (version[0] > 2017 || (version[0] === 2017 && version[1] >= 3)) {
      r.move(5);
      if (version[0] > 2020 || (version[0] === 2020 && version[1] >= 2)) {
        r.move(1);
      }
      r.align(4);
    }
    this.width = r.readInt32();
    this.height = r.readInt32();
    r.move(4);
    if (version[0] >= 2020) r.move(4);
    this.textureFormat = r.readInt32();
    if (version[0] < 5 || (version[0] === 5 && version[1] < 2)) r.move(1);
    else r.move(4);
    if (version[0] > 2 || (version[0] === 2 && version[1] >= 6)) r.move(1);
    if (version[0] >= 2020) r.move(1);
    if (version[0] > 2019 || (version[0] === 2019 && version[1] >= 3)) r.move(1);
    if (version[0] >= 3 && (version[0] < 5 || (version[0] === 5 && version[1] <= 4))) r.move(1);
    if (version[0] > 2018 || (version[0] === 2018 && version[1] >= 2)) r.move(1);
    r.align(4);
    if (version[0] > 2018 || (version[0] === 2018 && version[1] >= 2)) r.move(4);
    r.move(8);
    this.readTextureSetting(r);
    if (version[0] >= 3) r.move(4);
    if (version[0] > 3 || (version[0] === 3 && version[1] >= 5)) r.move(4);
    if (version[0] > 2020 || (version[0] === 2020 && version[1] >= 2)) {
      const length = r.readInt32();
      r.readBuffer(length);
      r.align(4);
    }
    const dataSize = r.readInt32();
    this.streamData =
      dataSize === 0 && ((version[0] === 5 && version[1] >= 3) || version[0] > 5)
        ? this.readStreamInfo(r)
        : undefined;
    const data = this.streamData?.path ? this.readData(this.streamData) : r.readBuffer(dataSize);
    this.dataSize = this.streamData?.size ?? dataSize;
    this.image = new TextureDecoder(this, new Uint8Array(data));
  }

  get size() {
    return this.__info.bytesSize + this.dataSize;
  }

  getImage() {
    return getJimpPNG(this.getImageJimp());
  }

  getImageJimp() {
    return jimpFlipVertical(this.getImageJimpRaw());
  }

  getImageBitmap(): ImgBitMap {
    const { bitmap } = this.getImageJimp();
    return {
      data: bitmap.data.buffer as unknown as ArrayBuffer,
      width: bitmap.width,
      height: bitmap.height,
    };
  }

  getMixJimp(alphaTexture: Texture2D) {
    return jimpFlipVertical(this.getMixJimpRaw(alphaTexture));
  }

  getTransformedImageJimp(
    { downscaleMultiplier = 1, textureRect, settingsRaw }: TextureTransformedOptions,
    alphaTexture?: Texture2D,
  ) {
    const img = alphaTexture ? this.getMixJimpRaw(alphaTexture) : this.getImageJimpRaw();

    if (downscaleMultiplier > 0 && downscaleMultiplier !== 1) {
      img.resize({
        w: img.width / downscaleMultiplier,
        h: img.height / downscaleMultiplier,
      });
    }

    img.crop({
      x: textureRect.x,
      y: textureRect.y,
      w: textureRect.w,
      h: textureRect.h,
    });

    if (settingsRaw?.packed === 1) {
      switch (settingsRaw.packingRotation) {
        case SpritePackingRotation.FlipHorizontal:
          jimpFlipVertical(img);
          break;
        case SpritePackingRotation.FlipVertical:
          jimpFlipVertical(img);
          break;
        case SpritePackingRotation.Rotate180:
          img.rotate(180);
          break;
        case SpritePackingRotation.Rotate90:
          img.rotate(270);
          break;
      }
    }

    if (settingsRaw?.packingMode === SpritePackingMode.Tight) {
      console.warn(this.name, "SpritePackingMode.Tight isn't implemented.");
    }

    jimpFlipVertical(img);

    return img;
  }

  private getImageJimpRaw() {
    return new Jimp({ data: Buffer.from(this.image.data), width: this.width, height: this.height });
  }

  private getMixJimpRaw(alphaTexture: Texture2D) {
    const cacheMap = this.__info.bundle.textureMixCache;
    const key = `${this.pathId},${alphaTexture.pathId}`;
    const cached = cacheMap.get(key);
    if (cached) return cached.clone();

    const rgb = this.getImageJimpRaw();
    const alpha = alphaTexture.getImageJimpRaw();

    if (this.width !== alphaTexture.width || this.height !== alphaTexture.height) {
      alpha.resize({ w: this.width, h: this.height });
    }

    rgb.mixAlpha(alpha);

    cacheMap.set(key, rgb);

    return rgb.clone();
  }

  private readTextureSetting(r: ArrayBufferReader) {
    const { version } = this.__info;
    r.move(12);
    if (version[0] >= 2017) r.move(12);
    else r.move(4);
  }

  private readStreamInfo(r: ArrayBufferReader): StreamInfo {
    const { version } = this.__info;
    return {
      offset: version[0] >= 2020 ? Number(r.readUInt64()) : r.readUInt32(),
      size: r.readUInt32(),
      path: r.readAlignedString(),
    };
  }

  private readData(streamInfo: StreamInfo) {
    const sPath = last(streamInfo.path.split('/'))!;
    const index = this.__info.bundle.nodes.findIndex(({ path }) => path === sPath);
    if (index === -1) throw new Error(`Cannot find node by path: ${sPath}`);
    const file = this.__info.bundle.files[index];
    const r = new ArrayBufferReader(file);
    r.seek(streamInfo.offset);
    return r.readBuffer(streamInfo.size);
  }
}

class TextureDecoder {
  protected readonly __doNotDump = true;
  private decoded = false;

  constructor(
    private readonly texture: Texture2D,
    private rawData: Uint8Array<ArrayBuffer>,
  ) {}

  get data() {
    this.decodeImageData();
    return this.rawData;
  }

  private decodeImageData() {
    if (this.decoded) return;
    this.rawData = decodeTexture(
      this.rawData,
      this.texture.width,
      this.texture.height,
      this.texture.textureFormat,
      this.texture.name,
    );
    this.decoded = true;
  }
}
