// Checks the JavaScript engine against the original Python script
// (reference/tree_stump_audio.py) on a synthetic stump.
// Run with: npm test   (needs python3; skips otherwise)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseObj, meshSurface, detectRings, indexicalTrack, metaphoricalTrack, toPcm16, SPECIES } from '../src/engine/index.js';
import { syntheticStumpObj } from './synthetic-stump.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const SECONDS = 2;

function hasPython() {
  try { execFileSync('python3', ['--version']); return true; } catch { return false; }
}

for (const speciesName of ['Littleleaf Linden', 'Red Oak']) {
  test(`matches tree_stump_audio.py: ${speciesName}`, { skip: !hasPython() && 'python3 not found' }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'stump-'));
    const objPath = join(dir, 'stump.obj');
    const objText = syntheticStumpObj();
    writeFileSync(objPath, objText);
    execFileSync('python3', [join(root, 'test/reference.py'), join(root, 'reference/tree_stump_audio.py'),
      objPath, dir, speciesName, String(SECONDS)]);
    const ref = JSON.parse(readFileSync(join(dir, 'rings.json'), 'utf8'));
    const pcm = name => new Int16Array(new Uint8Array(readFileSync(join(dir, name))).buffer);

    const rd = detectRings(meshSurface(parseObj(objText)));
    assert.ok(Math.abs(rd.cx - ref.cx) < 1e-12 && Math.abs(rd.maxR - ref.max_r) < 1e-12, 'centre and radius');
    assert.equal(rd.ringRadii.length, ref.ring_radii.length, 'ring count');
    rd.ringRadii.forEach((r, i) => assert.ok(Math.abs(r - ref.ring_radii[i]) < 1e-12, `ring ${i}`));

    const idx = indexicalTrack(rd, SPECIES[speciesName], { duration: SECONDS });
    // Render in uneven chunks to exercise the chunk edges of the stylus filter.
    const parts = [];
    for (let at = 0; at < idx.total; at += 7919) parts.push(idx.render(at, 7919));
    const idxJs = toPcm16(Float32Array.from(parts.flatMap(p => Array.from(p))));
    const met = metaphoricalTrack(rd, rd.ringRadii.length, { duration: SECONDS });
    const metJs = toPcm16(Float32Array.from([...met.next(50000), ...met.next(met.total)]));

    for (const [name, js] of [['indexical.pcm', idxJs], ['metaphorical.pcm', metJs]]) {
      const py = pcm(name);
      assert.equal(js.length, py.length, `${name} length`);
      let worst = 0;
      for (let i = 0; i < py.length; i++) worst = Math.max(worst, Math.abs(js[i] - py[i]));
      // ±1 step allows for float32 storage and libm rounding; anything more is a real difference.
      assert.ok(worst <= 1, `${name}: max difference ${worst} (16-bit steps)`);
    }
  });
}
