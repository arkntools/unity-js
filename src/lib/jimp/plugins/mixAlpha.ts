import type { JimpClass } from '@jimp/types';

export const mixAlpha = {
  mixAlpha<I extends JimpClass>(rgb: I, a: I) {
    if (rgb.bitmap.width !== a.bitmap.width || rgb.bitmap.height !== a.bitmap.height) {
      throw new Error('RGB and A image must have the same size');
    }
    rgb.scan((x, y, idx) => {
      rgb.bitmap.data[idx + 3] = a.bitmap.data[idx];
    });
    return rgb;
  },
  premultipliedAlpha<I extends JimpClass>(img: I) {
    const { data } = img.bitmap;
    img.scan((x, y, idx) => {
      const alpha = data[idx + 3] / 255;
      data[idx] *= alpha;
      data[idx + 1] *= alpha;
      data[idx + 2] *= alpha;
    });
    return img;
  },
};
