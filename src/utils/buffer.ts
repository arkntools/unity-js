import { sumBy } from 'es-toolkit';
import { loopEach } from './loop';

export const toUInt4Array = (data: Uint8Array<ArrayBuffer>) => {
  const result = new Uint8Array(data.length * 2);

  loopEach(data.length, i => {
    const byte = data[i];
    result[i * 2] = byte >> 4;
    result[i * 2 + 1] = byte & 0x0f;
  });

  return result;
};

export const hexToUInt8Array = (hex: string): Uint8Array<ArrayBuffer> => {
  if (hex.length % 2 !== 0) throw new Error('Length is not a multiple of 2');
  return new Uint8Array((hex.match(/[\da-f]{2}/gi) || []).map(h => Number.parseInt(h, 16)));
};

export const bufferToHex = (buffer: ArrayBuffer, allZeroToEmpty = false) => {
  const arr = [...new Uint8Array(buffer)];
  if (allZeroToEmpty && arr.every(v => !v)) return '';
  return arr.map(x => x.toString(16).padStart(2, '0')).join('');
};

export const bufferToString = (data: AllowSharedBufferSource, encoding?: string) =>
  new TextDecoder(encoding).decode(data);

export const concatArrayBuffer = (buffers: ArrayBuffer[]) => {
  const result = new Uint8Array(sumBy(buffers, b => b.byteLength));
  buffers.reduce((pos, buffer) => {
    result.set(new Uint8Array(buffer), pos);
    return pos + buffer.byteLength;
  }, 0);
  return result.buffer;
};

export const ensureArrayBuffer = (
  data: ArrayBuffer | Uint8Array<ArrayBuffer> | Buffer<ArrayBuffer>,
): ArrayBuffer => (data instanceof ArrayBuffer ? data : data.buffer || data);
