// Render both tracks for a Polycam OBJ scan to WAV files, like the desktop
// tree_stump_audio.py but much faster.
//
//   npm run render -- path/to/scan.obj "Littleleaf Linden" [ringCount] [minutes]
//
// ringCount: leave out to use the detected count. minutes: default 22.
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { parseObj, meshSurface, detectRings, indexicalTrack, metaphoricalTrack, toPcm16, SPECIES, SAMPLE_RATE } from '../src/engine/index.js';

const [objPath, speciesName = 'Unknown / Other', ringArg, minutesArg] = process.argv.slice(2);
if (!objPath || !SPECIES[speciesName]) {
  console.error('Usage: npm run render -- scan.obj "<species>" [ringCount] [minutes]');
  console.error('Species: ' + Object.keys(SPECIES).join(', '));
  process.exit(1);
}
const duration = Math.round(Number(minutesArg || 22) * 60);

const rd = detectRings(meshSurface(parseObj(readFileSync(objPath, 'utf8'))));
const rings = ringArg ? Number(ringArg) : rd.ringRadii.length;
console.log(`${rd.ringRadii.length} ring boundaries detected; using ${rings} rings → ${rings * 8} Hz`);

function writeWav(path, total, nextChunk) {
  const fd = openSync(path, 'w');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + total * 2, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(total * 2, 40);
  writeSync(fd, header);
  for (let done = 0; done < total;) {
    const pcm = toPcm16(nextChunk(done));
    writeSync(fd, Buffer.from(pcm.buffer));
    done += pcm.length;
    process.stdout.write(`\r${path}: ${Math.round(100 * done / total)}%`);
  }
  closeSync(fd);
  console.log();
}

const base = objPath.replace(/\.obj$/i, '');
const CHUNK = SAMPLE_RATE * 10;
const idx = indexicalTrack(rd, SPECIES[speciesName], { duration });
writeWav(`${base}_indexical.wav`, idx.total, at => idx.render(at, CHUNK));
const met = metaphoricalTrack(rd, rings, { duration });
writeWav(`${base}_metaphorical.wav`, met.total, () => met.next(CHUNK));
