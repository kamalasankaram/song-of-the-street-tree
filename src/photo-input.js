// Helpers for adding a stump from a photo: reading the picture and where it
// was taken, suggesting the species from NYC Parks' tree inventory, and
// keeping added stumps on this phone until the shared archive exists.
import { SPECIES } from './engine/index.js';

// Long side of the copy the engine reads. Point sampling only needs ~75
// pixels per point, so this keeps phones fast with the same sound.
const WORK_SIZE = 1600;

/** Decode a photo, upright, into a canvas no larger than WORK_SIZE. */
export async function loadPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode(); // browsers apply the EXIF rotation to <img>
    const s = Math.min(1, WORK_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * s);
    canvas.height = Math.round(img.naturalHeight * s);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Luminance of every pixel, for photoPoints(). */
export function luminance(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
  return g;
}

/** A small JPEG of the stump for its card and the lock screen. */
export function thumbnail(canvas, { cx, cy, r }, size = 360) {
  const t = document.createElement('canvas');
  t.width = t.height = size;
  const pad = r * 1.08;
  t.getContext('2d').drawImage(canvas, cx - pad, cy - pad, 2 * pad, 2 * pad, 0, 0, size, size);
  return t.toDataURL('image/jpeg', 0.8);
}

/** Where a JPEG was taken, from its EXIF GPS tags, or null. */
export async function photoLocation(file) {
  try {
    const b = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (b.getUint16(0) !== 0xffd8) return null;
    let o = 2;
    while (o + 4 < b.byteLength) {
      const marker = b.getUint16(o), len = b.getUint16(o + 2);
      if (marker === 0xffe1 && b.getUint32(o + 4) === 0x45786966) return readGps(b, o + 10);
      o += 2 + len;
    }
  } catch { /* not a readable JPEG */ }
  return null;
}

function readGps(b, tiff) {
  const le = b.getUint16(tiff) === 0x4949;
  const u16 = p => b.getUint16(tiff + p, le), u32 = p => b.getUint32(tiff + p, le);
  const entries = ifd => {
    const n = u16(ifd), out = {};
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + 12 * i;
      out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
    }
    return out;
  };
  const gpsPtr = entries(u32(4))[0x8825];
  if (!gpsPtr) return null;
  const g = entries(u32(gpsPtr.at));
  if (!g[2] || !g[4]) return null;
  const ref = t => String.fromCharCode(b.getUint8(tiff + t.at));
  const dms = t => {
    const p = u32(t.at);
    const v = k => u32(p + 8 * k) / (u32(p + 8 * k + 4) || 1);
    return v(0) + v(1) / 60 + v(2) / 3600;
  };
  const lat = dms(g[2]) * (g[1] && ref(g[1]) === 'S' ? -1 : 1);
  const lng = dms(g[4]) * (g[3] && ref(g[3]) === 'W' ? -1 : 1);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null;
}

/** The phone's current location, or null. */
export function currentLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000 });
  });
}

// ── Species from NYC Parks' tree inventory (Forestry Tree Points) ───────────
// It keeps trees after they're removed: structure "Stump", "Retired", etc.
const FORESTRY = 'https://data.cityofnewyork.us/resource/hn5i-inap.json';
const REMOVED = /stump|retired|shaft/i;

const metres = (a, b) => {
  const k = Math.PI / 180, x = (b.lng - a.lng) * k * Math.cos((a.lat + b.lat) / 2 * k), y = (b.lat - a.lat) * k;
  return Math.hypot(x, y) * 6371000;
};

// "Tilia cordata - littleleaf linden" -> one of the engine's species names.
export function matchSpecies(common) {
  const c = String(common || '').toLowerCase();
  let best = null;
  for (const name of Object.keys(SPECIES)) {
    const words = name.toLowerCase().split(/\s+/);
    if (words.every(w => c.includes(w)) && (!best || name.length > best.length)) best = name;
  }
  return best;
}

/** Removed trees near a spot, nearest first: [{ species, latin, common, structure, dbh, distance }]. */
export async function nearbyRemovedTrees({ lat, lng }, radius = 50) {
  const where = `within_circle(location, ${lat}, ${lng}, ${radius})`;
  const res = await fetch(`${FORESTRY}?$where=${encodeURIComponent(where)}&$limit=200`);
  if (!res.ok) throw new Error('Tree map lookup failed: ' + res.status);
  const rows = await res.json();
  return rows
    .filter(r => REMOVED.test(r.tpstructure || ''))
    .map(r => {
      const [latin, common] = String(r.genusspecies || '').split(/\s+-\s+/);
      const c = r.location?.coordinates;
      const pos = c ? { lng: +c[0], lat: +c[1] } : null;
      return {
        species: matchSpecies(common),
        latin: latin || '', common: common || 'unknown species',
        structure: r.tpstructure, dbh: r.dbh ? +r.dbh : null,
        distance: pos ? metres({ lat, lng }, pos) : null,
      };
    })
    .filter(t => t.distance !== null)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6);
}

// ── This phone's stumps (until the shared archive) ──────────────────────────
const KEY = 'sst.photo-stumps.v1';

export function loadLocalStumps() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

export function saveLocalStumps(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}
