import BufferReader from 'buffer-reader';
import Jimp from 'jimp';
import { cloneDeep, last, omit, once } from 'lodash';
import { decodeEtc1 } from '../utils/etc';
import type { BufferReaderExtended } from '../utils/reader';
import { AssetBase } from './base';
import { AssetType, TextureFormat } from './types';

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

export class Texture2D extends AssetBase<Texture2DResult> {
  readonly type = AssetType.Texture2D;

  get image() {
    return this.read().image.clone();
  }

  get meta(): Omit<Texture2DResult, 'data'> {
    return omit(this.read(), 'image');
  }

  async load(): Promise<Texture2DResult> {
    return cloneDeep(await this.handleResult());
  }

  private readonly read = once(() => {
    const { version } = this.info;
    const r = this.info.getReader();
    r.seek(this.info.bytesStart);
    const name = r.nextAlignedString();
    if (version[0] > 2017 || (version[0] === 2017 && version[1] >= 3)) {
      r.move(5);
      if (version[0] > 2020 || (version[0] === 2020 && version[1] >= 2)) {
        r.move(1);
      }
      r.align(4);
    }
    const width = r.nextInt32();
    const height = r.nextInt32();
    r.move(4);
    if (version[0] >= 2020) r.move(4);
    const format = r.nextInt32();
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
    const size = r.nextInt32();
    const streamInfo =
      size === 0 && ((version[0] === 5 && version[1] >= 3) || version[0] > 5)
        ? this.readStreamInfo(r)
        : undefined;
    const data = streamInfo?.path ? this.readData(streamInfo) : r.nextBuffer(size);
    const decodedData = this.decodeImage(data, width, height, format);
    const image = new Jimp({ data: decodedData, width, height });
    return {
      name,
      width,
      height,
      image,
    };
  });

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

  private decodeImage(data: Buffer, width: number, height: number, format: number) {
    switch (format) {
      case TextureFormat.ETC_RGB4:
        return decodeEtc1(data, width, height);
      default:
        throw new Error(`Texture2d image format "${format}" is not implemented.`);
    }
  }

  private readonly handleResult = once(async () => {
    const { image, ...rest } = this.read();
    return {
      ...rest,
      data: await image.deflateStrategy(0).getBufferAsync(Jimp.MIME_PNG),
    };
  });
}
