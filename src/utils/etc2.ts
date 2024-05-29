import { decodeEtc2Rgba8 as decode } from '@arkntools/unity-js-tools';

const ETC2_ALPHA_MOD_TABLE = [
  [-3, -6, -9, -15, 2, 5, 8, 14],
  [-3, -7, -10, -13, 2, 6, 9, 12],
  [-2, -5, -8, -13, 1, 4, 7, 12],
  [-2, -4, -6, -13, 1, 3, 5, 12],
  [-3, -6, -8, -12, 2, 5, 7, 11],
  [-3, -7, -9, -11, 2, 6, 8, 10],
  [-4, -7, -8, -11, 3, 6, 7, 10],
  [-3, -5, -8, -11, 2, 4, 7, 10],
  [-2, -6, -8, -10, 1, 5, 7, 9],
  [-2, -5, -8, -10, 1, 4, 7, 9],
  [-2, -4, -8, -10, 1, 3, 7, 9],
  [-2, -5, -7, -10, 1, 4, 6, 9],
  [-3, -4, -7, -10, 2, 3, 6, 9],
  [-1, -2, -3, -10, 0, 1, 2, 9],
  [-4, -6, -8, -9, 3, 5, 7, 8],
  [-3, -5, -7, -9, 2, 4, 6, 8],
];
const WRITE_ORDER_TABLE_REV = [15, 11, 7, 3, 14, 10, 6, 2, 13, 9, 5, 1, 12, 8, 4, 0];

const toUInt64 = (data: Uint8Array) =>
  new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(0);

const clamp = (n: number) => {
  if (n < 0) return 0;
  if (n > 255) return 255;
  return n;
};

const decodeEtc2A8Block = (data: Uint8Array) => {
  const out = new Uint8Array(16);
  if (data[1] & 0xf0) {
    const multiplier = data[1] >> 4;
    const table = ETC2_ALPHA_MOD_TABLE[data[1] & 0xf];
    for (let i = 0, l = toUInt64(data); i < 16; i++, l >>= 3n) {
      out[WRITE_ORDER_TABLE_REV[i]] = clamp(data[0] + multiplier * table[Number(l & 7n)]);
    }
  } else {
    out.fill(data[0]);
  }
  return out;
};

const copyBlockAlpha = (
  bx: number,
  by: number,
  w: number,
  h: number,
  bw: number,
  bh: number,
  alpha: Uint8Array,
  image: Uint8Array,
) => {
  const x = bw * bx;
  const copyW = bw * (bx + 1) > w ? w - bw * bx : bw;
  const y0 = by * bh;
  const copyH = bh * (by + 1) > h ? h - y0 : bh;
  for (let y = y0, alphaOffset = 0; y < y0 + copyH; y++, alphaOffset += bw) {
    const imageOffset = y * w + x;
    for (let i = 0; i < copyW; i++) {
      image[(imageOffset + i) * 4 + 3] = alpha[alphaOffset + i];
    }
  }
};

/** Fix wasm decode error (may cause by bit operations) */
export const decodeEtc2Rgba8 = (data: Uint8Array, width: number, height: number) => {
  const image = decode(data, width, height);
  const numBlocksX = Math.floor((width + 3) / 4);
  const numBlockY = Math.floor((height + 3) / 4);
  for (let by = 0, p = 0; by < numBlockY; by++) {
    for (let bx = 0; bx < numBlocksX; bx++, p += 16) {
      const alpha = decodeEtc2A8Block(data.subarray(p, p + 8));
      copyBlockAlpha(bx, by, width, height, 4, 4, alpha, image);
    }
  }
  return image;
};
