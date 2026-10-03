// The photo reader: scan-like point density, repeatable, and it finds rings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoPoints, pointRecord, indexicalTrack, SPECIES } from '../src/engine/index.js';

// A 1200 × 1200 "photo" of a stump with 20 dark rings, plus some grain.
function ringPhoto(rings = 20) {
  const w = 1200, h = 1200, cx = 600, cy = 620, r = 500;
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      const ring = 0.5 + 0.5 * Math.cos(d * rings * 2 * Math.PI);
      g[y * w + x] = 120 + 80 * ring + 10 * Math.sin(x * 0.7) * Math.sin(y * 1.3);
    }
  }
  return { g, w, h, circle: { cx, cy, r } };
}

test('samples about as densely as a Polycam scan', () => {
  const { g, w, h, circle } = ringPhoto();
  const n = photoPoints(g, w, h, circle).length / 3;
  assert.ok(n > 4000 && n < 4800, `${n} points`);
});

test('is repeatable', () => {
  const { g, w, h, circle } = ringPhoto();
  assert.deepEqual(photoPoints(g, w, h, circle), photoPoints(g, w, h, circle));
});

test('finds the rings in the photo', () => {
  const { g, w, h, circle } = ringPhoto(20);
  const rings = pointRecord(photoPoints(g, w, h, circle)).ringRadii.length;
  assert.ok(Math.abs(rings - 20) <= 3, `${rings} rings`);
});

test('indexical track stays in range', () => {
  const { g, w, h, circle } = ringPhoto();
  const rd = pointRecord(photoPoints(g, w, h, circle));
  const a = indexicalTrack(rd, SPECIES['Callery Pear'], { duration: 60 }).render(44100 * 10, 44100);
  const peak = a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(peak > 0.05 && peak <= 1.5, `peak ${peak}`);
});
