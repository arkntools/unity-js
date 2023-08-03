import { decodeAstc as decode } from '@arkntools/unity-js-tools';
import { TextureFormat } from '../classes/types';

type BlockParams = [number, number];

const size = (s: number): BlockParams => [s, s];

const astcBlockMap: Partial<Record<TextureFormat, BlockParams>> = {
  [TextureFormat.ASTC_RGB_4x4]: size(4),
  [TextureFormat.ASTC_RGB_5x5]: size(5),
  [TextureFormat.ASTC_RGB_6x6]: size(6),
  [TextureFormat.ASTC_RGB_8x8]: size(8),
  [TextureFormat.ASTC_RGB_10x10]: size(10),
  [TextureFormat.ASTC_RGB_12x12]: size(12),
  [TextureFormat.ASTC_RGBA_4x4]: size(4),
  [TextureFormat.ASTC_RGBA_5x5]: size(5),
  [TextureFormat.ASTC_RGBA_6x6]: size(6),
  [TextureFormat.ASTC_RGBA_8x8]: size(8),
  [TextureFormat.ASTC_RGBA_10x10]: size(10),
  [TextureFormat.ASTC_RGBA_12x12]: size(12),
  [TextureFormat.ASTC_HDR_4x4]: size(4),
  [TextureFormat.ASTC_HDR_5x5]: size(5),
  [TextureFormat.ASTC_HDR_6x6]: size(6),
  [TextureFormat.ASTC_HDR_8x8]: size(8),
  [TextureFormat.ASTC_HDR_10x10]: size(10),
  [TextureFormat.ASTC_HDR_12x12]: size(12),
};

export const isSupportedAstcFormat = (format: TextureFormat) => format in astcBlockMap;

export const decodeAstc = (data: Buffer, w: number, h: number, format: TextureFormat) => {
  const blockSizes = astcBlockMap[format];
  if (!blockSizes) throw new Error(`unsupported astc texture format "${format}"`);
  return Buffer.from(decode(data, w, h, ...blockSizes));
};
