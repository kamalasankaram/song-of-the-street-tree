// Stump-to-sound engine. Any surface ({ cx, cy, maxR, lookupZ }) can feed it:
// a LiDAR mesh today, a photo's brightness map next.
export { parseObj, meshSurface } from './mesh.js';
export { detectRings } from './rings.js';
export { indexicalTrack, metaphoricalTrack, toPcm16, SAMPLE_RATE, HZ_PER_RING } from './tracks.js';
export { SPECIES } from './species.js';
export { photoPoints, pointRecord, POINTS_PER_RADIUS } from './photo.js';
