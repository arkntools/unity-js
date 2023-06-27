const WRITE_ORDER_TABLE = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15];
const ETC1_SUB_BLOCK_TABLE = [
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
];
const ETC1_MODIFIER_TABLE = [
  [2, 8],
  [5, 17],
  [9, 29],
  [13, 42],
  [18, 60],
  [24, 80],
  [33, 106],
  [47, 183],
];

export const decodeEtc1 = (data: Buffer, w: number, h: number) => {
  const image = new Uint8Array(w * h * 4);
  const numBX = Math.ceil(w / 4);
  const numBY = Math.ceil(h / 4);
  let offset = 0;
  for (let by = 0; by < numBY; by++) {
    for (let bx = 0; bx < numBX; bx++) {
      const buffer = decodeEtc1Block(data.subarray(offset, offset + 8));
      copyBlockBuffer(bx, by, w, h, 4, 4, buffer, image);
      offset += 8;
    }
  }
  return Buffer.from(image);
};

const decodeEtc1Block = (data: Buffer) => {
  const code = [data[3] >> 5, (data[3] >> 2) & 0x07];
  const table = ETC1_SUB_BLOCK_TABLE[data[3] & 0x01];
  const c = [Uint8Array.from([0, 0, 0]), Uint8Array.from([0, 0, 0])];
  if ((data[3] & 2) !== 0) {
    c[0][0] = data[0] & 0xf8;
    c[0][1] = data[1] & 0xf8;
    c[0][2] = data[2] & 0xf8;
    c[1][0] = c[0][0] + ((data[0] << 3) & 0x18) - ((data[0] << 3) & 0x20);
    c[1][1] = c[0][1] + ((data[1] << 3) & 0x18) - ((data[1] << 3) & 0x20);
    c[1][2] = c[0][2] + ((data[2] << 3) & 0x18) - ((data[2] << 3) & 0x20);
    c[0][0] |= c[0][0] >> 5;
    c[0][1] |= c[0][1] >> 5;
    c[0][2] |= c[0][2] >> 5;
    c[1][0] |= c[1][0] >> 5;
    c[1][1] |= c[1][1] >> 5;
    c[1][2] |= c[1][2] >> 5;
  } else {
    c[0][0] = (data[0] & 0xf0) | (data[0] >> 4);
    c[1][0] = (data[0] & 0x0f) | (data[0] << 4);
    c[0][1] = (data[1] & 0xf0) | (data[1] >> 4);
    c[1][1] = (data[1] & 0x0f) | (data[1] << 4);
    c[0][2] = (data[2] & 0xf0) | (data[2] >> 4);
    c[1][2] = (data[2] & 0x0f) | (data[2] << 4);
  }
  let j = (data[6] << 8) | data[7];
  let k = (data[4] << 8) | data[5];
  const result: Uint8Array[] = Array(16);
  for (const [i, s] of table.entries()) {
    let m = ETC1_MODIFIER_TABLE[code[s]][j & 1];
    if ((k & 1) !== 0) {
      m = -m;
    }
    result[WRITE_ORDER_TABLE[i]] = applyColor(c[s], m);
    j >>= 1;
    k >>= 1;
  }
  return result;
};

const applyColor = (c: Uint8Array, m: number) =>
  Uint8Array.of(clamp(c[0] + m), clamp(c[1] + m), clamp(c[2] + m), 255);

const clamp = (n: number) => {
  if (n < 0) return 0;
  if (n > 255) return 255;
  return n;
};

const copyBlockBuffer = (
  bx: number,
  by: number,
  w: number,
  h: number,
  bw: number,
  bh: number,
  buffer: Uint8Array[],
  image: Uint8Array,
) => {
  const x = bw * bx;
  const xl = bw * (bx + 1) > w ? w - bw * bx : bw;
  let bufferOffset = 0;
  const bufferEnd = bw * bh;
  for (let yi = by * bh; yi < h; yi++) {
    if (bufferOffset >= bufferEnd) break;
    for (let i = 0; i < xl; i++) {
      const y = h - 1 - yi;
      const offset = (y * w + x + i) * 4;
      const color = buffer[bufferOffset + i];
      image[offset + 0] = color[0];
      image[offset + 1] = color[1];
      image[offset + 2] = color[2];
      image[offset + 3] = color[3];
    }
    bufferOffset += bw;
  }
};
