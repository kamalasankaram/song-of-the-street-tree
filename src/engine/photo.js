// A photo of a stump's cut face as a surface the stylus can read.
//
// Brightness stands in for height (lighter = higher), with the overall
// lighting removed. The photo is not read pixel by pixel: it is sampled at
// scattered points about as dense as a Polycam LiDAR scan (~4,400 points on
// the face), and the stylus jumps from nearest point to nearest point, exactly
// as it does on a mesh. Read every pixel and the sound clusters in the
// 120-500 Hz mids; read like a scan and it has the scan's space and low weight.
import { meshSurface } from './mesh.js';
import { detectRings } from './rings.js';

// Points across the stump's radius. 37.5 gives ~4,400 points on the face,
// the density of the Polycam scans (1500 px radius -> 40 px apart).
export const POINTS_PER_RADIUS = 37.5;
// Height scale of a point surface: values are z-scores × this.
const Z_UNIT = 0.01;

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / n;
      s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Sample a photo into scan-like points.
 * gray: luminance per pixel (any range), w × h. The stump is the circle at
 * (cx, cy) with radius r, in pixels. Returns flat [x, y, z, …] vertices with
 * the radius scaled to 1, ready for pointRecord().
 */
export function photoPoints(gray, w, h, { cx, cy, r, pointsPerRadius = POINTS_PER_RADIUS, seed = 1 }) {
  const spacing = r / pointsPerRadius;
  // Each point reads the average over its own patch, minus the lighting
  // (a blur ~5% of the radius wide).
  const cell = boxBlur(gray, w, h, Math.max(1, Math.round(spacing / 2)));
  const light = boxBlur(gray, w, h, Math.max(2, Math.round(r * 80 / 1500)));

  let s = seed >>> 0 || 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const xs = [], ys = [], vs = [];
  for (let y = cy - r; y <= cy + r; y += spacing) {
    for (let x = cx - r; x <= cx + r; x += spacing) {
      const px = x + (rnd() - 0.5) * spacing * 0.6, py = y + (rnd() - 0.5) * spacing * 0.6;
      if (Math.hypot(px - cx, py - cy) > r) continue;
      const ix = Math.round(px), iy = Math.round(py);
      if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
      const i = iy * w + ix;
      xs.push(px); ys.push(py); vs.push(cell[i] - light[i]);
    }
  }
  const n = vs.length;
  const mean = vs.reduce((a, v) => a + v, 0) / n;
  const sd = Math.sqrt(vs.reduce((a, v) => a + (v - mean) ** 2, 0) / n) || 1;
  const verts = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) {
    verts[3 * k] = (xs[k] - cx) / r;
    verts[3 * k + 1] = -(ys[k] - cy) / r; // image y runs down
    verts[3 * k + 2] = (vs[k] - mean) / sd * Z_UNIT;
  }
  return verts;
}

/**
 * Rings and levels for a point surface, ready for the tracks. The level range
 * is ±3 standard deviations of the points, so the indexical track is loud
 * without clipping (the averaged ring profile alone is far narrower).
 */
export function pointRecord(verts) {
  const rd = detectRings(meshSurface(verts));
  return { ...rd, zMin: rd.zMean - 3 * Z_UNIT, zMax: rd.zMean + 3 * Z_UNIT };
}
