import { createJimp } from '@jimp/core';
import { methods as crop } from '@jimp/plugin-crop';
import { methods as flip } from '@jimp/plugin-flip';
import { methods as resize } from '@jimp/plugin-resize';
import { methods as rotate } from '@jimp/plugin-rotate';
import type { JimpClass } from '@jimp/types';
import { mixAlpha } from './plugins/mixAlpha';
import { tightMask } from './plugins/tightMask';
import png from './png';

export const Jimp = createJimp({
  formats: [png],
  plugins: [flip, resize, crop, rotate, mixAlpha, tightMask],
});

// eslint-disable-next-line ts/no-redeclare
export type Jimp = InstanceType<typeof Jimp>;

export const getJimpPNG = <I extends JimpClass>(img: I) =>
  (img as any as Jimp).getBuffer('image/png') as Promise<Buffer<ArrayBuffer>>;
