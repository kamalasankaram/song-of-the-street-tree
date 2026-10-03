import '@fontsource/fraunces/400-italic.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/fraunces/900.css';
import '@fontsource/ibm-plex-mono/300.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-sans/300.css';
import '@fontsource/ibm-plex-sans/400.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';

import L from 'leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import { setWorkerUrl } from 'maplibre-gl';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { stumps, RING_POROUS, fundamental } from './stumps.js';
import { registerStump, unregisterStump, toggle, setXfade, onPlayerChange, getState, fmt } from './player.js';
import { photoPoints, pointRecord } from './engine/index.js';
import { loadPhoto, luminance, thumbnail, photoLocation, currentLocation, nearbyRemovedTrees, loadLocalStumps, saveLocalStumps } from './photo-input.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

document.getElementById('hero-photo').style.backgroundImage = 'url("media/linden-hero.jpg")';

// ── Rings drawing ───────────────────────────────────────────────────────────
function ringsSVG(count, style) {
  let s = '';
  for (let i = count; i >= 0; i--) {
    const r = 3 + (i / count) * 44;
    const w = style === 'ring' ? (i % 2 === 0 ? 1.3 : 0.4) : 0.5 + (i % 3 === 0 ? 0.3 : 0);
    s += `<circle cx="50" cy="50" r="${r.toFixed(1)}" fill="none" stroke="#47423f" stroke-width="${w}"/>`;
  }
  return s + '<circle cx="50" cy="50" r="2" fill="#47423f" opacity="0.4"/>';
}

const statusText = t =>
  t.inDB === true ? '● In NYC Street Tree Database'
  : t.inDB === false ? '○ Not in Street Tree Database'
  : '◌ Database status unknown';

// ── Player controls (shared by cards and map popups) ─────────────────────────
function playerControls(t, compact) {
  const wrap = document.createElement('div');
  if (!t.audio && !t.live) {
    wrap.innerHTML = `<div class="${compact ? 'popup-no-audio' : 'card-no-audio'}">Audio not yet attached</div>`;
    return wrap;
  }
  wrap.innerHTML = compact
    ? `<div class="popup-audio-label">Audio · crossfade</div>
       <div class="popup-xfade-row"><span>Idx</span>
         <input type="range" class="pp-xfade" min="0" max="1" step="0.01" aria-label="Crossfade">
       <span>Met</span></div>
       <div class="popup-play-row"><button class="pp-play">▶ Play</button>
         <span class="pp-time">—</span></div>
       <div class="popup-no-audio pp-err" hidden></div>`
    : `<div class="xfade-label-row"><span>◀ Indexical (raw topology)</span><span>(ring pitch) Metaphorical ▶</span></div>
       <input type="range" class="xfade-slider" min="0" max="1" step="0.01" aria-label="Crossfade">
       <div class="card-play-row"><button class="card-play-btn">▶ Play</button>
         <span class="card-time">—</span></div>
       <div class="card-no-audio pp-err" hidden></div>`;
  const slider = wrap.querySelector('input');
  const btn = wrap.querySelector('button');
  const time = wrap.querySelector('.pp-time, .card-time');
  const err = wrap.querySelector('.pp-err');

  slider.addEventListener('input', () => setXfade(t.id, slider.value));
  slider.addEventListener('click', e => e.stopPropagation());
  btn.addEventListener('click', e => { e.stopPropagation(); toggle(t.id); });

  const render = st => {
    if (!st) return;
    slider.value = st.xfade;
    btn.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    btn.classList.toggle('playing', st.playing);
    time.textContent = fmt(st.time) + ' / ' + fmt(st.duration);
    err.hidden = !st.error;
    err.textContent = st.error || '';
  };
  onPlayerChange((id, st) => { if (id === t.id) render(st); });
  render(getState(t.id));
  return wrap;
}

// ── Cards ───────────────────────────────────────────────────────────────────
const grid = document.getElementById('tree-grid');

function addCard(t) {
  const card = document.createElement('div');
  card.className = 'tree-card';
  card.innerHTML = `
    ${t.photo ? `<img class="card-photo" src="${esc(t.photo)}" alt="">` : ''}
    <svg class="card-rings" viewBox="0 0 100 100">${ringsSVG(t.rings || 7, t.ringStyle)}</svg>
    <div class="card-status ${t.inDB === true ? '' : 'unreg'}">${statusText(t)}</div>
    <div class="card-species">${esc(t.species)}</div>
    <div class="card-latin">${[t.latin, t.rings && t.rings + ' rings', t.rings && fundamental(t.rings)].filter(Boolean).map(esc).join(' · ')}</div>
    <div class="card-meta">
      <span class="meta-key">Location</span><span class="meta-val">${esc(t.loc)}, ${esc(t.borough)}</span>
      ${t.scan ? `<span class="meta-key">Scan</span><span class="meta-val">${esc(t.scan)}</span>` : ''}
      ${t.duration ? `<span class="meta-key">Duration</span><span class="meta-val">${esc(t.duration)}</span>` : ''}
      ${t.polycamUrl ? `<span class="meta-key">3D View</span><span class="meta-val"><a href="${esc(t.polycamUrl)}" target="_blank" rel="noopener" style="color:var(--moss);text-decoration:none">Open in Polycam ↗</a></span>` : ''}
    </div>
    <div class="anatomy-strip">${(t.anatomy || []).map(([label, hi]) => `<span class="anatomy-chip ${hi ? 'hi' : ''}">${esc(label)}</span>`).join('')}</div>
    <div class="card-audio"></div>`;
  card.querySelector('.card-audio').appendChild(playerControls(t, false));
  if (t.local) {
    const rm = document.createElement('button');
    rm.className = 'link-btn card-remove';
    rm.textContent = 'Remove from this phone';
    rm.addEventListener('click', e => { e.stopPropagation(); removeLocalStump(t, card); });
    card.appendChild(rm);
  }
  card.querySelector('a')?.addEventListener('click', e => e.stopPropagation());
  card.addEventListener('click', () => flyToStump(t));
  grid.appendChild(card);
  return card;
}

// ── Map ─────────────────────────────────────────────────────────────────────
const map = L.map('map', { zoomControl: true, scrollWheelZoom: false }).setView([40.8900, -73.9130], 15);
// Basemap: OpenFreeMap's Positron style (the same light look as the prototype's
// CARTO tiles). CARTO refuses requests from inside the app (capacitor://
// origin) without a key; OpenFreeMap needs no key and allows app use.
setWorkerUrl(new URL(import.meta.env.DEV
  ? '/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'
  : 'maplibre/maplibre-gl-worker.mjs', document.baseURI).href);
maplibreGL({
  style: 'https://tiles.openfreemap.org/styles/positron',
  attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
}).addTo(map);

function makeIcon(color) {
  return L.divIcon({
    className: '',
    html: `<svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 0C4.9 0 0 4.9 0 11c0 7.7 11 19 11 19s11-11.3 11-19C22 4.9 17.1 0 11 0z" fill="${color}" opacity="0.92"/>
      <circle cx="11" cy="11" r="4" fill="rgba(255,255,255,0.35)"/></svg>`,
    iconSize: [22, 30], iconAnchor: [11, 30], popupAnchor: [0, -32],
  });
}

const markers = new Map(); // stump id -> marker
// Long popups (video + player) scroll inside the map instead of being cut off on phones.
const popupMaxHeight = () => Math.max(220, document.getElementById('map').clientHeight - 70);

function addMarker(t) {
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="popup-species">${esc(t.species)}</div>
    ${t.latin ? `<div class="popup-latin">${esc(t.latin)}</div>` : ''}
    <div class="popup-status ${t.inDB === true ? '' : 'unreg'}">${statusText(t)}</div>
    <div class="popup-loc">${esc(t.loc)}, ${esc(t.borough)}${t.rings ? ' · ' + t.rings + ' rings · ' + fundamental(t.rings) : ''}</div>
    ${t.video
      ? `<video class="popup-video" src="${esc(t.video)}" controls playsinline preload="metadata" style="width:100%;background:#000"></video>`
      : t.photo ? `<img class="popup-photo" src="${esc(t.photo)}" alt="">`
      : '<div class="popup-no-video">3D video: not yet added</div>'}`;
  el.appendChild(playerControls(t, true));
  const marker = L.marker([t.lat, t.lng], { icon: makeIcon(t.inDB === true ? '#6e715a' : '#9e6050') })
    .addTo(map)
    .bindPopup(el, { maxWidth: 290, maxHeight: popupMaxHeight(), autoPanPadding: [12, 12] });
  markers.set(t.id, marker);
}

function flyToStump(t) {
  document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  map.flyTo([t.lat, t.lng], 17, { duration: 1.2 });
  setTimeout(() => markers.get(t.id)?.openPopup(), 1300);
}

function updateCount() {
  const n = stumps.length;
  const word = n + ' stump' + (n !== 1 ? 's' : '');
  document.getElementById('tree-count').textContent = word;
  document.getElementById('footer-count').textContent = word + ' archived';
}

const localStumps = loadLocalStumps();
stumps.push(...localStumps);
stumps.forEach(t => {
  registerStump(t);
  addCard(t);
  addMarker(t);
});
updateCount();

function removeLocalStump(t, card) {
  if (!confirm(`Remove this ${t.species} from your phone?`)) return;
  unregisterStump(t.id);
  card.remove();
  markers.get(t.id)?.remove();
  markers.delete(t.id);
  stumps.splice(stumps.indexOf(t), 1);
  localStumps.splice(localStumps.indexOf(t), 1);
  saveLocalStumps(localStumps);
  updateCount();
}

// ── Add a stump from a photo ────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const RING_STYLE = sp => (RING_POROUS.includes(sp) ? 'ring' : 'diffuse');
const draft = { canvas: null, gray: null, circle: null, centre: null, verts: null, where: null, match: null };

function resetDraft() {
  Object.assign(draft, { canvas: null, gray: null, circle: null, centre: null, verts: null, where: null, match: null });
  ['f-photo', 'f-rings', 'f-address', 'f-borough', 'f-notes'].forEach(id => { $(id).value = ''; });
  $('f-species').value = 'Unknown / Other';
  ['picker-wrap', 'loc-wrap', 'suggest-wrap'].forEach(id => { $(id).hidden = true; });
  $('suggest').innerHTML = '';
  $('add-btn').disabled = true;
}

function drawPicker() {
  const c = $('picker'), ctx = c.getContext('2d');
  c.width = draft.canvas.width; c.height = draft.canvas.height;
  ctx.drawImage(draft.canvas, 0, 0);
  const lw = Math.max(2, c.width / 300);
  ctx.lineWidth = lw;
  if (draft.centre) {
    ctx.strokeStyle = '#f1e3c8';
    ctx.beginPath(); ctx.arc(draft.centre.x, draft.centre.y, lw * 4, 0, 2 * Math.PI); ctx.stroke();
  }
  if (draft.circle) {
    ctx.strokeStyle = '#c9e06a';
    ctx.beginPath(); ctx.arc(draft.circle.cx, draft.circle.cy, draft.circle.r, 0, 2 * Math.PI); ctx.stroke();
  }
  $('picker-hint').textContent = !draft.centre ? '2 · Tap the centre of the stump (the pith)'
    : !draft.circle ? '3 · Now tap the edge of the wood, just inside the bark'
    : '✓ Stump marked';
}

$('f-photo').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  $('add-status').textContent = 'Reading the photo…';
  try {
    draft.canvas = await loadPhoto(file);
  } catch {
    $('add-status').textContent = 'That photo could not be read. Try a JPEG or a photo from your camera.';
    return;
  }
  draft.gray = luminance(draft.canvas);
  draft.centre = draft.circle = draft.verts = null;
  $('picker-wrap').hidden = false;
  drawPicker();
  $('add-status').textContent = '';
  setWhere(await photoLocation(file), 'from the photo');
});

$('picker').addEventListener('click', e => {
  if (!draft.canvas || draft.circle) return;
  const c = $('picker'), box = c.getBoundingClientRect();
  // The canvas is letterboxed by object-fit: contain.
  const s = Math.min(box.width / c.width, box.height / c.height);
  const ox = (box.width - c.width * s) / 2, oy = (box.height - c.height * s) / 2;
  const x = (e.clientX - box.left - ox) / s, y = (e.clientY - box.top - oy) / s;
  if (x < 0 || y < 0 || x > c.width || y > c.height) return;
  if (!draft.centre) draft.centre = { x, y };
  else {
    const r = Math.hypot(x - draft.centre.x, y - draft.centre.y);
    if (r < 20) return;
    draft.circle = { cx: draft.centre.x, cy: draft.centre.y, r };
    readStump();
  }
  drawPicker();
});

$('picker-redo').addEventListener('click', () => {
  draft.centre = draft.circle = draft.verts = null;
  $('add-btn').disabled = true;
  if (draft.canvas) drawPicker();
});

function readStump() {
  const { width: w, height: h } = draft.canvas;
  draft.verts = photoPoints(draft.gray, w, h, draft.circle);
  const rings = pointRecord(draft.verts).ringRadii.length;
  $('f-rings').value = Math.max(1, rings);
  $('add-btn').disabled = false;
}

function setWhere(where, how) {
  $('loc-wrap').hidden = false;
  draft.where = where;
  $('loc-text').textContent = where
    ? `${where.lat.toFixed(5)}, ${where.lng.toFixed(5)} (${how})`
    : 'This photo has no location. Use your current location if you are standing at the stump.';
  if (where) suggestSpecies(where);
}

$('loc-btn').addEventListener('click', async () => {
  $('loc-text').textContent = 'Finding you…';
  const where = await currentLocation();
  if (where) setWhere(where, 'your current location');
  else $('loc-text').textContent = 'Location is not available. The stump will be placed at the middle of the map.';
});

async function suggestSpecies(where) {
  $('suggest-wrap').hidden = false;
  const box = $('suggest');
  box.textContent = 'Looking up nearby trees…';
  draft.match = null;
  let trees;
  try { trees = await nearbyRemovedTrees(where); } catch { box.textContent = 'The tree map could not be reached. Choose a species below, or leave it as Unknown.'; return; }
  if (!trees.length) { box.textContent = 'No removed trees are recorded near here. Leave the species as Unknown, or choose one if you know it.'; return; }
  box.innerHTML = '';
  for (const t of trees) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'suggest-item';
    b.innerHTML = `${esc(t.common)} · ${Math.round(t.distance)} m away<small>${esc(t.structure)}${t.dbh ? ` · trunk ${t.dbh}″` : ''}${t.latin ? ` · ${esc(t.latin)}` : ''}</small>`;
    b.addEventListener('click', () => {
      box.querySelectorAll('.suggest-item').forEach(x => x.classList.remove('chosen'));
      b.classList.add('chosen');
      draft.match = t;
      $('f-species').value = t.species || 'Unknown / Other';
    });
    box.appendChild(b);
  }
}

const titleCase = s => s.replace(/\b\w/g, c => c.toUpperCase());

$('add-btn').addEventListener('click', () => {
  if (!draft.verts) return;
  const engineSpecies = $('f-species').value || 'Unknown / Other';
  const match = draft.match && (draft.match.species === engineSpecies || engineSpecies === 'Unknown / Other') ? draft.match : null;
  const species = match ? titleCase(match.common) : engineSpecies === 'Unknown / Other' ? 'Unknown species' : engineSpecies;
  const rings = Math.max(1, parseInt($('f-rings').value, 10) || 1);
  const where = draft.where || { lat: map.getCenter().lat, lng: map.getCenter().lng };
  const isRing = RING_POROUS.includes(engineSpecies);
  const t = {
    id: 'photo-' + Date.now(),
    lat: where.lat, lng: where.lng,
    species, latin: match?.latin || '',
    loc: $('f-address').value.trim() || `${where.lat.toFixed(4)}, ${where.lng.toFixed(4)}`,
    borough: $('f-borough').value || 'New York City',
    inDB: match ? true : null,
    rings,
    scan: 'Photo · read like a scan',
    duration: '22:00 · made live on this phone',
    anatomy: [[isRing ? 'Ring-porous' : 'Diffuse-porous', true]],
    ringStyle: RING_STYLE(engineSpecies),
    notes: $('f-notes').value.trim(),
    video: null, audio: null,
    photo: thumbnail(draft.canvas, draft.circle),
    live: { verts: Array.from(draft.verts, v => Math.round(v * 1e5) / 1e5), species: engineSpecies, rings, duration: 1320 },
    local: true,
  };
  localStumps.push(t);
  if (!saveLocalStumps(localStumps)) {
    localStumps.pop();
    $('add-status').textContent = 'Your phone is out of space for saved stumps. Remove one and try again.';
    return;
  }
  stumps.push(t);
  registerStump(t);
  const card = addCard(t);
  card.style.animation = 'fadeUp 0.5s ease both';
  addMarker(t);
  updateCount();
  resetDraft();
  $('add-status').textContent = `Added. Press play on its card to hear it.`;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
