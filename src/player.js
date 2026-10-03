// Two-track player: indexical + metaphorical, mixed through Web Audio.
//
// Why Web Audio and not <audio>.volume like the prototype: iOS ignores
// HTMLMediaElement.volume, so the crossfader did nothing on iPhones. Routing
// each element through its own GainNode fixes that on every platform.
//
// Why not decode into AudioBuffers: a 22-minute mono track decodes to ~230 MB
// of float samples; two of them would exhaust memory on many phones. Media
// elements stream from disk instead.

let ctx = null;
const players = new Map(); // stumpId -> player
const listeners = new Set();

function getContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export function onPlayerChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(p) {
  for (const fn of listeners) fn(p.id, snapshot(p));
}

function snapshot(p) {
  return {
    playing: p.playing,
    xfade: p.xfade,
    time: p.idx.currentTime,
    duration: p.idx.duration,
    error: p.error,
  };
}

export function getState(id) {
  const p = players.get(id);
  return p ? snapshot(p) : null;
}

export function registerStump(stump) {
  if (!stump.audio || players.has(stump.id)) return;
  const idx = new Audio(stump.audio.indexical);
  const met = new Audio(stump.audio.metaphorical);
  for (const el of [idx, met]) {
    el.preload = 'metadata';
    el.setAttribute('playsinline', '');
  }
  const p = { id: stump.id, stump, idx, met, playing: false, xfade: 0.5, gains: null, error: null };
  players.set(stump.id, p);

  idx.addEventListener('timeupdate', () => {
    // Keep the metaphorical track locked to the indexical one.
    if (p.playing && Math.abs(idx.currentTime - met.currentTime) > 0.15) {
      met.currentTime = idx.currentTime;
    }
    emit(p);
  });
  idx.addEventListener('loadedmetadata', () => emit(p));
  idx.addEventListener('ended', () => {
    p.playing = false;
    met.pause();
    emit(p);
  });
}

function connect(p) {
  if (p.gains) return;
  const ac = getContext();
  const gi = ac.createGain();
  const gm = ac.createGain();
  ac.createMediaElementSource(p.idx).connect(gi).connect(ac.destination);
  ac.createMediaElementSource(p.met).connect(gm).connect(ac.destination);
  p.gains = { idx: gi, met: gm };
  applyXfade(p);
}

function applyXfade(p) {
  if (!p.gains) return;
  // Equal-power crossfade: 0 = all indexical, 1 = all metaphorical.
  const t = getContext().currentTime;
  p.gains.idx.gain.setTargetAtTime(Math.cos(p.xfade * Math.PI / 2), t, 0.02);
  p.gains.met.gain.setTargetAtTime(Math.sin(p.xfade * Math.PI / 2), t, 0.02);
}

export function setXfade(id, value) {
  const p = players.get(id);
  if (!p) return;
  p.xfade = Math.min(1, Math.max(0, parseFloat(value)));
  applyXfade(p);
  emit(p);
}

export async function toggle(id) {
  const p = players.get(id);
  if (!p) return;
  if (p.playing) {
    pause(p);
    return;
  }
  for (const other of players.values()) if (other !== p && other.playing) pause(other);

  connect(p);
  const ac = getContext();
  if (ac.state === 'suspended') await ac.resume();
  p.met.currentTime = p.idx.currentTime;
  try {
    await Promise.all([p.idx.play(), p.met.play()]);
    p.playing = true;
    p.error = null;
    setMediaSession(p);
  } catch (e) {
    console.error('Audio play failed:', e);
    p.idx.pause();
    p.met.pause();
    p.error = 'Audio could not start.';
  }
  emit(p);
}

function pause(p) {
  p.idx.pause();
  p.met.pause();
  p.playing = false;
  emit(p);
}

// Lock-screen and headphone controls.
function setMediaSession(p) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: p.stump.species,
    artist: 'Song of the Street Tree',
    album: p.stump.loc,
    artwork: [{ src: 'media/linden-hero.jpg', sizes: '1500x2000', type: 'image/jpeg' }],
  });
  navigator.mediaSession.setActionHandler('play', () => { if (!p.playing) toggle(p.id); });
  navigator.mediaSession.setActionHandler('pause', () => { if (p.playing) toggle(p.id); });
}

export function fmt(s) {
  if (!isFinite(s) || isNaN(s)) return '—';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}
