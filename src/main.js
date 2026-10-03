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
import { registerStump, toggle, setXfade, onPlayerChange, getState, fmt } from './player.js';

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
  if (!t.audio) {
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

function addCard(t, i) {
  const card = document.createElement('div');
  card.className = 'tree-card';
  card.innerHTML = `
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
  card.querySelector('a')?.addEventListener('click', e => e.stopPropagation());
  card.addEventListener('click', () => flyToStump(i));
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

const markers = [];
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
      : '<div class="popup-no-video">3D video: not yet added</div>'}`;
  el.appendChild(playerControls(t, true));
  const marker = L.marker([t.lat, t.lng], { icon: makeIcon(t.inDB === true ? '#6e715a' : '#9e6050') })
    .addTo(map)
    .bindPopup(el, { maxWidth: 290, maxHeight: popupMaxHeight(), autoPanPadding: [12, 12] });
  markers.push(marker);
}

function flyToStump(i) {
  const t = stumps[i];
  document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  map.flyTo([t.lat, t.lng], 17, { duration: 1.2 });
  setTimeout(() => markers[i].openPopup(), 1300);
}

function updateCount() {
  const n = stumps.length;
  const word = n + ' stump' + (n !== 1 ? 's' : '');
  document.getElementById('tree-count').textContent = word;
  document.getElementById('footer-count').textContent = word + ' archived';
}

stumps.forEach((t, i) => {
  registerStump(t);
  addCard(t, i);
  addMarker(t);
});
updateCount();

// ── Add a tree (in memory only until the shared archive lands in phase 5) ────
document.getElementById('add-btn').addEventListener('click', () => {
  const val = id => document.getElementById(id).value.trim();
  const sp = val('f-species'), addr = val('f-address'), bor = val('f-borough');
  if (!sp || !addr || !bor) { alert('Please fill in species, address, and borough.'); return; }
  const db = val('f-db');
  const rings = parseInt(val('f-rings'), 10) || null;
  const isRing = RING_POROUS.includes(sp);
  const t = {
    id: 'local-' + Date.now(),
    lat: 40.889 + (Math.random() - 0.5) * 0.005, lng: -73.913 + (Math.random() - 0.5) * 0.005,
    species: sp, latin: '', loc: addr, borough: bor,
    inDB: db === 'yes' ? true : db === 'no' ? false : null,
    rings, anatomy: [[isRing ? 'Ring-porous' : 'Diffuse-porous', true]],
    ringStyle: isRing ? 'ring' : 'diffuse', video: null, audio: null,
  };
  stumps.push(t);
  const i = stumps.length - 1;
  const card = addCard(t, i);
  card.style.animation = 'fadeUp 0.5s ease both';
  addMarker(t);
  updateCount();
  ['f-species', 'f-borough', 'f-address', 'f-rings', 'f-video', 'f-notes'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('f-db').value = 'yes';
  map.flyTo([t.lat, t.lng], 16, { duration: 1.2 });
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
