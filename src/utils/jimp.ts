import { Buffer } from 'buffer/';
import _Jimp from 'jimp';

export type Jimp = _Jimp;

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const Jimp: typeof _Jimp =
  typeof _Jimp?.read === 'function'
    ? _Jimp
    : typeof self !== 'undefined'
      ? (self as any).Jimp
      : _Jimp;

export const getJimpPNG = (img: Jimp) => img.deflateStrategy(0).getBufferAsync(Jimp.MIME_PNG);

const rotate90degrees = (bitmap: Jimp['bitmap'], dstBuffer: Buffer, clockwise: boolean) => {
  const dstOffsetStep = clockwise ? -4 : 4;
  let dstOffset = clockwise ? dstBuffer.length - 4 : 0;

  let tmp;
  let x;
  let y;
  let srcOffset;

  for (x = 0; x < bitmap.width; x++) {
    for (y = bitmap.height - 1; y >= 0; y--) {
      srcOffset = (bitmap.width * y + x) << 2;
      tmp = bitmap.data.readUInt32BE(srcOffset);
      dstBuffer.writeUInt32BE(tmp, dstOffset);
      dstOffset += dstOffsetStep;
    }
  }
};

export const simpleRotate = (img: Jimp, deg: number) => {
  let steps = Math.round(deg / 90) % 4;
  steps += steps < 0 ? 4 : 0;

  if (steps === 0) return;

  const srcBuffer = img.bitmap.data;
  const len = srcBuffer.length;
  const dstBuffer = Buffer.allocUnsafe(len);

  if (steps === 2) {
    for (let srcOffset = 0; srcOffset < len; srcOffset += 4) {
      dstBuffer.writeUInt32BE(srcBuffer.readUInt32BE(srcOffset), len - srcOffset - 4);
    }
  } else {
    rotate90degrees(img.bitmap, dstBuffer, steps === 1);
    [img.bitmap.width, img.bitmap.height] = [img.bitmap.height, img.bitmap.width];
  }

  img.bitmap.data = dstBuffer as any;
};
