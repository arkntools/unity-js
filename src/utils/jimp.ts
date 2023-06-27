import configure from '@jimp/custom';
import color from '@jimp/plugin-color';
import crop from '@jimp/plugin-crop';
import resize from '@jimp/plugin-resize';
import png from '@jimp/png';

const CustomJimp = configure({
  types: [png],
  plugins: [crop, resize, color],
});

export type Jimp = InstanceType<typeof CustomJimp>;

export { CustomJimp as Jimp };
