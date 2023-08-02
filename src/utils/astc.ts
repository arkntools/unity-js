import { astcDecode as decode } from '@arkntools/astc-decode';
import { TextureFormat } from '../classes/types';

const astcBlockMap: Partial<Record<TextureFormat, [number, number]>> = {
  [TextureFormat.ASTC_HDR_4x4]: [4, 4],
  [TextureFormat.ASTC_RGB_5x5]: [5, 5],
  [TextureFormat.ASTC_RGB_6x6]: [6, 6],
  [TextureFormat.ASTC_RGB_8x8]: [8, 8],
  [TextureFormat.ASTC_RGB_10x10]: [10, 10],
  [TextureFormat.ASTC_RGB_12x12]: [12, 12],
  [TextureFormat.ASTC_RGBA_4x4]: [4, 4],
  [TextureFormat.ASTC_RGBA_5x5]: [5, 5],
  [TextureFormat.ASTC_RGBA_6x6]: [6, 6],
  [TextureFormat.ASTC_RGBA_8x8]: [8, 8],
  [TextureFormat.ASTC_RGBA_10x10]: [10, 10],
  [TextureFormat.ASTC_RGBA_12x12]: [12, 12],
};

export const isSupportedAstcFormat = (format: TextureFormat) => format in astcBlockMap;

export const decodeAstc = (data: Buffer, w: number, h: number, format: TextureFormat) => {
  const blockSizes = astcBlockMap[format];
  if (!blockSizes) throw new Error(`unsupported astc texture format "${format}"`);
  return Buffer.from(decode(Uint8Array.from(data), w, h, ...blockSizes));
};
