import type { JimpClass } from '@jimp/types';

export const mixAlpha = {
  /**
   * @param rgb RGB image
   * @param a Alpha image
   * @returns RGBA image
   */
  mixAlpha<I extends JimpClass>(rgb: I, a: I) {
    if (rgb.bitmap.width !== a.bitmap.width || rgb.bitmap.height !== a.bitmap.height) {
      throw new Error('RGB and A image must have the same size');
    }
    rgb.scan((x, y, idx) => {
      rgb.bitmap.data[idx + 3] = a.bitmap.data[idx];
    });
    return rgb;
  },
};
