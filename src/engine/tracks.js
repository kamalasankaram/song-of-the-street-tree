// The two tracks, ported from generate_audio and generate_metaphorical in
// tree_stump_audio.py. Arithmetic is kept in the same order as the Python so
// the output matches it sample for sample (within floating-point rounding).
//
// Both are rendered in chunks so a 22-minute side never has to sit in memory
// at once: a full side is ~58 million samples per track.

export const SAMPLE_RATE = 44100;
export const RPM = 33.33;
// Stylus compliance: moving average over 5 samples (~0.11 ms). INTERPRETIVE.
export const FILTER_WINDOW = 5;
// Ring count × 8 Hz = fundamental of the metaphorical track. INTERPRETIVE.
export const HZ_PER_RING = 8.0;

// Shared stylus path: spiral inward along the detected ring boundaries.
function stylus(rd, duration) {
  const rings = rd.ringRadii;
  const waypoints = rings.length >= 2 ? [...rings].reverse().concat([0.0]) : [rd.maxR, 0.0];
  const nSeg = waypoints.length - 1;
  const rotPerS = RPM / 60.0;

  const rAt = t => {
    const f = (t / duration) * nSeg;
    const i = Math.min(Math.trunc(f), nSeg - 1);
    return waypoints[i] + (waypoints[i + 1] - waypoints[i]) * (f - i);
  };

  // Position within the current ring, 0 at its inner boundary. Same result as
  // the Python's linear scan (first ri >= 1 with r <= rings[ri]), found by
  // binary search because it runs once per sample.
  const ringFrac = r => {
    const n = rings.length;
    if (n < 2 || r > rings[n - 1]) return 0.0;
    let lo = 1, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (r <= rings[mid]) hi = mid; else lo = mid + 1;
    }
    const span = rings[lo] - rings[lo - 1];
    return span > 0 ? (r - rings[lo - 1]) / span : 0.0;
  };

  // Where the stylus is at sample i, and the raw surface height there.
  const at = (i, sampleRate) => {
    const t = i / sampleRate;
    const rotation = t * rotPerS * 2.0 * Math.PI;
    const r = rAt(t);
    const x = rd.cx + Math.cos(rotation) * r;
    const y = rd.cy + Math.sin(rotation) * r;
    return { r, z: rd.lookupZ(x, y) };
  };

  return { at, ringFrac };
}

function zStats(rd) {
  const zRange = rd.zMax !== rd.zMin ? rd.zMax - rd.zMin : 1.0;
  return { zMean: rd.zMean, zRange };
}

/**
 * Indexical track: surface height read by the stylus is the waveform.
 * Every sample depends only on its time, so any span can be rendered on its
 * own: render(start, count) returns a Float32Array.
 */
export function indexicalTrack(rd, species, { duration = 1320, sampleRate = SAMPLE_RATE } = {}) {
  const { at, ringFrac } = stylus(rd, duration);
  const { zMean, zRange } = zStats(rd);
  const total = Math.trunc(sampleRate * duration);
  const half = Math.trunc(FILTER_WINDOW / 2);
  const ew = species.ewWidth;

  const raw = i => {
    const { r, z } = at(i, sampleRate);
    const topo = (z - zMean) / zRange;
    const rf = ringFrac(r);
    let ewScale = 1.0;
    if (ew > 0 && rf < ew) {
      const tEw = rf / ew;
      ewScale = species.ewBoost * (1.0 - tEw) + 1.0 * tEw;
    }
    return topo * species.hardness * ewScale;
  };

  function render(start, count) {
    count = Math.max(0, Math.min(count, total - start));
    const lo = Math.max(0, start - half), hi = Math.min(total, start + count + half);
    const buf = new Float64Array(hi - lo);
    for (let i = lo; i < hi; i++) buf[i - lo] = raw(i);
    const out = new Float32Array(count);
    for (let i = start; i < start + count; i++) {
      const a = Math.max(0, i - half), b = Math.min(total, i + half + 1);
      let s = 0;
      for (let k = a; k < b; k++) s += buf[k - lo];
      out[i - start] = s / (b - a);
    }
    return out;
  }

  return { total, sampleRate, render };
}

/**
 * Metaphorical track: a tone at ring count × 8 Hz whose pitch, overtones and
 * swell follow the surface. The phase accumulates, so it renders in order:
 * next(count) returns the following Float32Array.
 */
export function metaphoricalTrack(rd, ringCount, { duration = 1320, sampleRate = SAMPLE_RATE } = {}) {
  const { at, ringFrac } = stylus(rd, duration);
  const { zMean, zRange } = zStats(rd);
  const total = Math.trunc(sampleRate * duration);
  const fundHz = ringCount * HZ_PER_RING;
  let i = 0;
  let phase = 0.0;

  function next(count) {
    count = Math.max(0, Math.min(count, total - i));
    const out = new Float32Array(count);
    for (let k = 0; k < count; k++, i++) {
      const { r, z } = at(i, sampleRate);
      let topo = (z - zMean) / zRange + 0.5;
      topo = Math.max(0.0, Math.min(1.0, topo));

      // 1. Pitch drift: ±2% around the fundamental.
      const freq = fundHz * (1.0 + (topo - 0.5) * 0.04);
      phase += 2.0 * Math.PI * freq / sampleRate;

      // 2. Ring pulse: swells at each ring boundary, fades inward.
      const pulse = 0.5 + 0.5 * Math.cos(ringFrac(r) * Math.PI);

      // 3. Harmonics 2–5, richer where the surface is higher.
      let sig = Math.sin(phase);
      sig += topo * 0.30 * Math.sin(2.0 * phase);
      sig += topo * 0.20 * Math.sin(3.0 * phase);
      sig += topo * 0.10 * Math.sin(4.0 * phase);
      sig += topo * 0.05 * Math.sin(5.0 * phase);
      sig /= 1.65;

      out[k] = sig * pulse * 0.85;
    }
    return out;
  }

  return { total, sampleRate, fundHz, next, get position() { return i; } };
}

/** 16-bit PCM exactly as write_wav quantizes it (truncate, clamp ±32767). */
export function toPcm16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = Math.max(-32767, Math.min(32767, Math.trunc(samples[i] * 32767)));
  }
  return out;
}
