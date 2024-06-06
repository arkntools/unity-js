import last from 'lodash/last';
import { SpritePackingMode, SpritePackingRotation, type SpriteSettings } from '..';
import type { RectF32 } from '../types';
import { decodeTexture } from '../utils/decodeTexture';
import { Jimp, getJimpPNG, simpleRotate } from '../utils/jimp';
import { ArrayBufferReader } from '../utils/reader';
import { AssetBase } from './base';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

export interface StreamInfo {
  offset: number;
  size: number;
  path: string;
}

export interface TextureTransformedOptions {
  textureRect: RectF32;
  downscaleMultiplier?: number;
  settingsRaw: SpriteSettings;
}

export class Texture2D extends AssetBase {
  readonly type = AssetType.Texture2D;
  readonly width: number;
  readonly height: number;
  readonly textureFormat: number;
  readonly streamData?: StreamInfo;
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
    this.image = new TextureDecoder(this, new Uint8Array(data));
  }

  getImage() {
    return getJimpPNG(this.getImageJimp());
  }

  getImageJimp() {
    return this.getImageJimpRaw().flip(false, true);
  }

  getImageBitmap() {
    return this.image.data.buffer.slice(0);
  }

  getTransformedImageJimp(
    { downscaleMultiplier = 1, textureRect, settingsRaw }: TextureTransformedOptions,
    alphaTexture?: Texture2D,
  ) {
    const img = alphaTexture ? this.getMixJimp(alphaTexture) : this.getImageJimpRaw();

    if (downscaleMultiplier > 0 && downscaleMultiplier !== 1) {
      img.resize(img.getWidth() / downscaleMultiplier, img.getHeight() / downscaleMultiplier);
    }

    img.crop(textureRect.x, textureRect.y, textureRect.width, textureRect.height);

    if (settingsRaw.packed === 1) {
      switch (settingsRaw.packingRotation) {
        case SpritePackingRotation.FlipHorizontal:
          img.flip(true, false);
          break;
        case SpritePackingRotation.FlipVertical:
          img.flip(false, true);
          break;
        case SpritePackingRotation.Rotate180:
          simpleRotate(img, 180);
          break;
        case SpritePackingRotation.Rotate90:
          simpleRotate(img, 270);
          break;
      }
    }

    if (settingsRaw.packingMode === SpritePackingMode.Tight) {
      throw new Error('SpritePackingMode.Tight not implemented.');
    }

    img.flip(false, true);

    return img;
  }

  private getImageJimpRaw() {
    return new Jimp({ data: this.image.data, width: this.width, height: this.height });
  }

  private getMixJimp(alphaTexture: Texture2D) {
    const cacheMap = this.__info.bundle.textureMixCache;
    const key = `${this.pathId},${alphaTexture.pathId}`;
    const cached = cacheMap.get(key);
    if (cached) return cached.clone();

    const rgb = this.getImageJimpRaw();
    const alpha = alphaTexture.getImageJimpRaw();

    if (this.width !== alphaTexture.width || this.height !== alphaTexture.height) {
      alpha.resize(this.width, this.height);
    }

    rgb.scan(0, 0, this.width, this.height, function (x, y, idx) {
      this.bitmap.data[idx + 3] = alpha.bitmap.data[idx];
    });
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
    private rawData: Uint8Array,
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
