// A deterministic fake stump for tests: a disc with uneven growth rings,
// earlywood dips, saw marks and noise, written as OBJ text.
export function syntheticStumpObj({ radius = 0.25, spacing = 0.0025, rings = 18, seed = 7 } = {}) {
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // Uneven ring widths, like real growth.
  const widths = Array.from({ length: rings }, () => 0.6 + rand());
  const sum = widths.reduce((a, b) => a + b, 0);
  const bounds = [];
  let acc = 0;
  for (const w of widths) { acc += w / sum * radius; bounds.push(acc); }

  const lines = ['# synthetic stump'];
  for (let x = -radius; x <= radius; x += spacing) {
    for (let y = -radius; y <= radius; y += spacing) {
      const jx = x + (rand() - 0.5) * spacing * 0.6, jy = y + (rand() - 0.5) * spacing * 0.6;
      const r = Math.hypot(jx, jy);
      if (r > radius) continue;
      const k = bounds.findIndex(b => r <= b);
      const inner = k > 0 ? bounds[k - 1] : 0;
      const frac = (r - inner) / (bounds[k] - inner);
      const ridge = 0.0015 * Math.cos(frac * Math.PI * 2);   // latewood ridge at each boundary
      const saw = 0.0004 * Math.sin(jx * 400);                // chainsaw marks
      const tilt = 0.01 * jx;
      const z = 0.05 + ridge + saw + tilt + (rand() - 0.5) * 0.0003;
      lines.push(`v ${jx.toFixed(6)} ${jy.toFixed(6)} ${z.toFixed(6)}`);
    }
  }
  return lines.join('\n') + '\n';
}
