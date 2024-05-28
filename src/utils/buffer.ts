import { sumBy } from 'lodash';

export const toUInt4Array = (data: Uint8Array) => {
  const result = new Uint8Array(data.length * 2);

  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    result[i * 2] = byte >> 4;
    result[i * 2 + 1] = byte & 0x0f;
  }

  return result;
};

export const hexToUInt8Array = (hex: string) => {
  if (hex.length % 2 !== 0) throw new Error('Length is not a multiple of 2');
  return new Uint8Array((hex.match(/[\da-f]{2}/gi) || []).map(h => parseInt(h, 16)));
};

export const bufferToHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');

export const bufferToString = (data: AllowSharedBufferSource, encoding?: string) =>
  new TextDecoder(encoding).decode(data);

export const concatArrayBuffer = (buffers: ArrayBuffer[]) => {
  const result = new Uint8Array(sumBy(buffers, 'byteLength'));
  buffers.reduce((pos, buffer) => {
    result.set(new Uint8Array(buffer), pos);
    return pos + buffer.byteLength;
  }, 0);
  return result.buffer;
};

export const ensureArrayBuffer = (data: Buffer | ArrayBuffer | Uint8Array): ArrayBuffer =>
  data instanceof ArrayBuffer ? data : data.buffer || data;
