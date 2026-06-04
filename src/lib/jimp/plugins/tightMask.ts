import type { JimpClass } from '@jimp/types';

/**
 * Rasterizes a single triangle into the mask buffer using scanline fill.
 *
 * Vertices are in pixel coordinates matching the image's current coordinate
 * system (before any final flip). The fill uses a top-left rule without
 * anti-aliasing.
 */
function rasterizeTriangle(
  mask: Uint8Array<ArrayBuffer>,
  w: number,
  h: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
) {
  // Sort vertices by y ascending: (x0,y0) <= (x1,y1) <= (x2,y2)
  let x0 = ax;
  let y0 = ay;
  let x1 = bx;
  let y1 = by;
  let x2 = cx;
  let y2 = cy;
  if (y0 > y1) {
    [x0, y0, x1, y1] = [x1, y1, x0, y0];
  }
  if (y0 > y2) {
    [x0, y0, x2, y2] = [x2, y2, x0, y0];
  }
  if (y1 > y2) {
    [x1, y1, x2, y2] = [x2, y2, x1, y1];
  }

  // Degenerate triangle (zero height)
  if (y2 === y0) return;

  const yStart = Math.max(0, Math.ceil(y0));
  const yEnd = Math.min(h - 1, Math.floor(y2));

  // Inverse slopes for the long edge and each half-edge
  const invDyLong = 1 / (y2 - y0);

  for (let y = yStart; y <= yEnd; y++) {
    // x-intercept on the long edge (v0 → v2), always active
    const xLong = x0 + (y - y0) * (x2 - x0) * invDyLong;

    // x-intercept on the short edge: v0→v1 (bottom half) or v1→v2 (top half)
    let xShort: number;
    if (y < y1) {
      // Bottom half: edge v0 → v1
      xShort = y1 === y0 ? x1 : x0 + ((y - y0) * (x1 - x0)) / (y1 - y0);
    } else {
      // Top half: edge v1 → v2
      xShort = y2 === y1 ? x1 : x1 + ((y - y1) * (x2 - x1)) / (y2 - y1);
    }

    const xMin = Math.max(0, Math.ceil(Math.min(xLong, xShort)));
    const xMax = Math.min(w - 1, Math.floor(Math.max(xLong, xShort)));

    const row = y * w;
    for (let x = xMin; x <= xMax; x++) {
      mask[row + x] = 1;
    }
  }
}

type Triangle = [number, number, number, number, number, number];

/** Cross-product sign test for point-in-triangle (includes edges). */
function pointInTriangle(px: number, py: number, [ax, ay, bx, by, cx, cy]: Triangle): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/**
 * Fast check: do two triangles fully cover a w*h image?
 *
 * Samples 4 corners + 4 edge midpoints (8 points). If every sample is
 * inside at least one triangle, the two triangles form a quad that covers
 * the entire image and masking can be skipped. The edge-midpoint samples
 * prevent false positives from degenerate shapes (e.g. two thin triangles
 * that touch all corners but miss the interior).
 */
function trianglesCoverImage(w: number, h: number, t0: Triangle, t1: Triangle): boolean {
  const check = (px: number, py: number) =>
    pointInTriangle(px, py, t0) || pointInTriangle(px, py, t1);
  const mx = (w - 1) / 2;
  const my = (h - 1) / 2;
  return (
    check(0, 0) &&
    check(w - 1, 0) &&
    check(0, h - 1) &&
    check(w - 1, h - 1) &&
    check(mx, 0) &&
    check(mx, h - 1) &&
    check(0, my) &&
    check(w - 1, my)
  );
}

export const tightMask = {
  /**
   * Applies a triangle-mesh mask to the image: pixels outside all triangles
   * have their alpha set to 0. Each triangle is defined by 6 floats
   * `[x0, y0, x1, y1, x2, y2]` in the image's pixel coordinate system.
   *
   * Uses scanline rasterization without anti-aliasing.
   */
  applyTightMask<I extends JimpClass>(img: I, triangles: Array<Triangle>) {
    const { width, height, data } = img.bitmap;

    if (triangles.length === 2 && trianglesCoverImage(width, height, triangles[0], triangles[1])) {
      return img;
    }

    const mask = new Uint8Array(width * height);

    for (const [x0, y0, x1, y1, x2, y2] of triangles) {
      rasterizeTriangle(mask, width, height, x0, y0, x1, y1, x2, y2);
    }

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (!mask[row + x]) {
          data[(row + x) * 4 + 3] = 0;
        }
      }
    }

    return img;
  },
};
