import type { LameInitParams } from '@arkntools/lame-wasm';
import { Lame, LAME_INIT_PARAMS_DEFAULTS } from '@arkntools/lame-wasm';
import { sumBy } from 'es-toolkit';

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

type LameOptions = Mutable<LameInitParams>;

export type LameVbrQuality = LameOptions['vbrQuality'];

const concat = (...uint8arrays: Uint8Array<ArrayBuffer>[]) => {
  const totalLength = sumBy(uint8arrays, uint8array => uint8array.byteLength);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  uint8arrays.forEach(uint8array => {
    result.set(uint8array, offset);
    offset += uint8array.byteLength;
  });

  return result;
};

export const encodeMP3 = async (channels: Float32Array[], opt: Partial<LameOptions>) => {
  const lame = await Lame.load({ ...LAME_INIT_PARAMS_DEFAULTS, ...opt });
  return concat(...lame.encode(...channels));
};
