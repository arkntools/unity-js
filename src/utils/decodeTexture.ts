import {
  decodeAstc,
  decodeAtcRgb4,
  decodeAtcRgba8,
  decodeBc1,
  decodeBc3,
  decodeBc4,
  decodeBc5,
  decodeBc6Unsigned,
  decodeBc7,
  decodeEacr,
  decodeEacrSigned,
  decodeEacrg,
  decodeEacrgSigned,
  decodeEtc1,
  decodeEtc2Rgb,
  decodeEtc2Rgba1,
  decodePvrtc2bpp,
  decodePvrtc4bpp,
} from '@arkntools/unity-js-tools';
import { TextureFormat as TF } from '../classes/types';
import { decodeEtc2Rgba8 } from './etc2';

type DecodeFunction = (data: Uint8Array, width: number, height: number) => Uint8Array;

const getAstcDecodeFunc =
  (blockSize: number): DecodeFunction =>
  (...args) =>
    decodeAstc(...args, blockSize, blockSize);

const funcMap: Partial<Record<TF, DecodeFunction>> = {
  [TF.ATC_RGB4]: decodeAtcRgb4,
  [TF.ATC_RGBA8]: decodeAtcRgba8,
  [TF.ASTC_RGB_4x4]: getAstcDecodeFunc(4),
  [TF.ASTC_RGB_5x5]: getAstcDecodeFunc(5),
  [TF.ASTC_RGB_6x6]: getAstcDecodeFunc(6),
  [TF.ASTC_RGB_8x8]: getAstcDecodeFunc(8),
  [TF.ASTC_RGB_10x10]: getAstcDecodeFunc(10),
  [TF.ASTC_RGB_12x12]: getAstcDecodeFunc(12),
  [TF.ASTC_RGBA_4x4]: getAstcDecodeFunc(4),
  [TF.ASTC_RGBA_5x5]: getAstcDecodeFunc(5),
  [TF.ASTC_RGBA_6x6]: getAstcDecodeFunc(6),
  [TF.ASTC_RGBA_8x8]: getAstcDecodeFunc(8),
  [TF.ASTC_RGBA_10x10]: getAstcDecodeFunc(10),
  [TF.ASTC_RGBA_12x12]: getAstcDecodeFunc(12),
  [TF.ASTC_HDR_4x4]: getAstcDecodeFunc(4),
  [TF.ASTC_HDR_5x5]: getAstcDecodeFunc(5),
  [TF.ASTC_HDR_6x6]: getAstcDecodeFunc(6),
  [TF.ASTC_HDR_8x8]: getAstcDecodeFunc(8),
  [TF.ASTC_HDR_10x10]: getAstcDecodeFunc(10),
  [TF.ASTC_HDR_12x12]: getAstcDecodeFunc(12),
  [TF.DXT1]: decodeBc1,
  [TF.DXT5]: decodeBc3,
  [TF.BC4]: decodeBc4,
  [TF.BC5]: decodeBc5,
  [TF.BC6H]: decodeBc6Unsigned, // not sure
  [TF.BC7]: decodeBc7,
  [TF.ETC_RGB4]: decodeEtc1,
  [TF.ETC_RGB4_3DS]: decodeEtc1,
  [TF.ETC2_RGB]: decodeEtc2Rgb,
  [TF.ETC2_RGBA1]: decodeEtc2Rgba1,
  [TF.ETC2_RGBA8]: decodeEtc2Rgba8,
  [TF.EAC_R]: decodeEacr,
  [TF.EAC_R_SIGNED]: decodeEacrSigned,
  [TF.EAC_RG]: decodeEacrg,
  [TF.EAC_RG_SIGNED]: decodeEacrgSigned,
  [TF.PVRTC_RGB2]: decodePvrtc2bpp,
  [TF.PVRTC_RGBA2]: decodePvrtc2bpp,
  [TF.PVRTC_RGB4]: decodePvrtc4bpp,
  [TF.PVRTC_RGBA4]: decodePvrtc4bpp,
};

const bgra2rgba = (data: Uint8Array) => {
  for (let i = 0; i + 3 < data.length; i += 4) {
    [data[i], data[i + 2]] = [data[i + 2], data[i]];
  }
  return data;
};

export const decodeTexture = (
  data: Uint8Array,
  width: number,
  height: number,
  format: TF,
  name: string,
) => {
  const decodeFunc = funcMap[format];
  if (!decodeFunc) {
    throw new Error(`Texture2d format "${format}" decoder is not implemented. (${name})`);
  }
  return bgra2rgba(decodeFunc(data, width, height));
};
