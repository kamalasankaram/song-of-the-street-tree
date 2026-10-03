// Ring detection: average the surface along 360 radii, smooth the profile,
// and take its peaks as ring boundaries. Ported from detect_rings in
// tree_stump_audio.py; arithmetic order is kept so results match exactly.

export function detectRings(surface, { nAngles = 360, nBins = 400 } = {}) {
  const { cx, cy, maxR, lookupZ } = surface;
  const binSize = maxR / nBins;

  const sums = new Float64Array(nBins);
  for (let ai = 0; ai < nAngles; ai++) {
    const angle = ai / nAngles * 2 * Math.PI;
    const c = Math.cos(angle), s = Math.sin(angle);
    for (let bi = 0; bi < nBins; bi++) {
      const r = (bi + 0.5) * binSize;
      sums[bi] += lookupZ(cx + c * r, cy + s * r);
    }
  }
  const avgZ = Array.from(sums, v => v / nAngles);

  const w = Math.max(3, Math.floor(nBins / 80));
  const smooth = new Array(nBins);
  for (let i = 0; i < nBins; i++) {
    const lo = Math.max(0, i - w), hi = Math.min(nBins, i + w + 1);
    let t = 0;
    for (let k = lo; k < hi; k++) t += avgZ[k];
    smooth[i] = t / (hi - lo);
  }

  const peaks = [];
  for (let i = 1; i < nBins - 1; i++) {
    if (smooth[i] >= smooth[i - 1] && smooth[i] >= smooth[i + 1]) peaks.push((i + 0.5) * binSize);
  }
  const minGap = maxR * 0.003;
  const ringRadii = [];
  let last = -999;
  for (const r of peaks) {
    if (r - last >= minGap) { ringRadii.push(r); last = r; }
  }

  let zMin = Infinity, zMax = -Infinity, zSum = 0;
  for (const z of smooth) { if (z < zMin) zMin = z; if (z > zMax) zMax = z; zSum += z; }

  return {
    ...surface,
    ringRadii,
    avgZ: smooth,
    binSize,
    zMin, zMax,
    zMean: zSum / smooth.length,
  };
}
