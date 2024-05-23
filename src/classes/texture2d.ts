import BufferReader from 'buffer-reader';
import Jimp from 'jimp';
import { last } from 'lodash';
import NestedError from 'nested-error-stacks';
import { decodeTexture } from '../utils/decodeTexture';
import { getJimpPNG } from '../utils/image';
import type { BufferReaderExtended } from '../utils/reader';
import { AssetBase } from './base';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

export interface Texture2DResult {
  name: string;
  width: number;
  height: number;
  data: Buffer;
}

interface StreamInfo {
  offset: number;
  size: number;
  path: string;
}

export class Texture2D extends AssetBase {
  readonly type = AssetType.Texture2D;
  readonly width: number;
  readonly height: number;
  readonly textureFormat: number;
  readonly streamData?: StreamInfo;
  private readonly imageData: Uint8Array;

  constructor(info: ObjectInfo, r: BufferReaderExtended) {
    super(info, r);
    const { version } = this.info;
    if (version[0] > 2017 || (version[0] === 2017 && version[1] >= 3)) {
      r.move(5);
      if (version[0] > 2020 || (version[0] === 2020 && version[1] >= 2)) {
        r.move(1);
      }
      r.align(4);
    }
    this.width = r.nextInt32();
    this.height = r.nextInt32();
    r.move(4);
    if (version[0] >= 2020) r.move(4);
    this.textureFormat = r.nextInt32();
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
      const length = r.nextInt32();
      r.nextBuffer(length);
      r.align(4);
    }
    const dataSize = r.nextInt32();
    this.streamData =
      dataSize === 0 && ((version[0] === 5 && version[1] >= 3) || version[0] > 5)
        ? this.readStreamInfo(r)
        : undefined;
    const data = this.streamData?.path ? this.readData(this.streamData) : r.nextBuffer(dataSize);
    this.imageData = this.decodeTexture(
      data,
      this.width,
      this.height,
      this.textureFormat,
      this.name,
    );
  }

  getImage() {
    return getJimpPNG(this.getImageJimp());
  }

  getImageJimp() {
    return new Jimp({ data: this.imageData, width: this.width, height: this.height });
  }

  private readTextureSetting(r: BufferReaderExtended) {
    const { version } = this.info;
    r.move(12);
    if (version[0] >= 2017) r.move(12);
    else r.move(4);
  }

  private readStreamInfo(r: BufferReaderExtended): StreamInfo {
    const { version } = this.info;
    return {
      offset: version[0] >= 2020 ? r.nextUInt64Number() : r.nextUInt32(),
      size: r.nextUInt32(),
      path: r.nextAlignedString(),
    };
  }

  private readData(streamInfo: StreamInfo) {
    const sPath = last(streamInfo.path.split('/'))!;
    const index = this.info.bundle.nodes.findIndex(({ path }) => path === sPath);
    if (index === -1) throw new Error(`Cannot find node by path: ${sPath}`);
    const file = this.info.bundle.files[index];
    const r = new BufferReader(file);
    r.seek(streamInfo.offset);
    return r.nextBuffer(streamInfo.size);
  }

  private decodeTexture(data: Buffer, width: number, height: number, format: number, name: string) {
    try {
      return decodeTexture(data, width, height, format);
    } catch (error: any) {
      throw new NestedError(`Decode texture for "${name}" failed.`, error);
    }
  }
}
