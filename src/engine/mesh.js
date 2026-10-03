// A LiDAR mesh as a surface the stylus can read.
//
// Ported from parse_obj / build_grid / lookup_z in tree_stump_audio.py. The
// lookup must match the Python exactly (same cell hashing, same tie-breaking),
// so the new engine reproduces the existing recordings.

/** Read the vertex positions ("v x y z" lines) from an OBJ file's text. */
export function parseObj(text) {
  const out = [];
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    if (text.startsWith('v ', start)) {
      const parts = text.slice(start, end).trim().split(/\s+/);
      const x = Number(parts[1]), y = Number(parts[2]), z = Number(parts[3]);
      if (parts.length >= 4 && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        out.push(x, y, z);
      }
    }
    start = end + 1;
  }
  return new Float64Array(out);
}

/**
 * Build a surface from flat [x, y, z, x, y, z, …] vertices.
 * Returns { cx, cy, maxR, cellSize, lookupZ(x, y) }.
 */
export function meshSurface(verts) {
  const n = verts.length / 3;
  if (n === 0) throw new Error('The scan has no vertices.');

  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += verts[3 * i]; sy += verts[3 * i + 1]; }
  const cx = sx / n, cy = sy / n;
  let maxR = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt((verts[3 * i] - cx) ** 2 + (verts[3 * i + 1] - cy) ** 2);
    if (r > maxR) maxR = r;
  }
  const cellSize = Math.max(maxR * 0.01, 0.001);

  // Python's int() truncates toward zero, so Math.trunc, not Math.floor.
  const cellX = new Int32Array(n), cellY = new Int32Array(n);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const kx = Math.trunc(verts[3 * i] / cellSize), ky = Math.trunc(verts[3 * i + 1] / cellSize);
    cellX[i] = kx; cellY[i] = ky;
    if (kx < minX) minX = kx; if (kx > maxX) maxX = kx;
    if (ky < minY) minY = ky; if (ky > maxY) maxY = ky;
  }
  const w = maxX - minX + 1, h = maxY - minY + 1;

  // Dense buckets (counting sort keeps vertex order within a cell, matching
  // the insertion order of the Python dict buckets).
  const start = new Int32Array(w * h + 1);
  for (let i = 0; i < n; i++) start[(cellX[i] - minX) * h + (cellY[i] - minY) + 1]++;
  for (let c = 0; c < w * h; c++) start[c + 1] += start[c];
  const fill = start.slice(0, w * h);
  const bx = new Float64Array(n), by = new Float64Array(n), bz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = fill[(cellX[i] - minX) * h + (cellY[i] - minY)]++;
    bx[j] = verts[3 * i]; by[j] = verts[3 * i + 1]; bz[j] = verts[3 * i + 2];
  }

  // Nearest vertex in the 3×3 neighbouring cells; 0 when none (as in Python).
  function lookupZ(x, y) {
    const qx = Math.trunc(x / cellSize), qy = Math.trunc(y / cellSize);
    let best = Infinity, bestZ = 0;
    for (let dx = -1; dx <= 1; dx++) {
      const gx = qx + dx - minX;
      if (gx < 0 || gx >= w) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const gy = qy + dy - minY;
        if (gy < 0 || gy >= h) continue;
        const c = gx * h + gy;
        for (let j = start[c]; j < start[c + 1]; j++) {
          const d = (bx[j] - x) ** 2 + (by[j] - y) ** 2;
          if (d < best) { best = d; bestZ = bz[j]; }
        }
      }
    }
    return bestZ;
  }

  return { cx, cy, maxR, cellSize, lookupZ };
}
