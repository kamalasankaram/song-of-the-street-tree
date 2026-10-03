// Two-track player: indexical + metaphorical, mixed through Web Audio.
//
// Why Web Audio and not <audio>.volume like the prototype: iOS ignores
// HTMLMediaElement.volume, so the crossfader did nothing on iPhones. Routing
// each element through its own GainNode fixes that on every platform.
//
// Why not decode into AudioBuffers: a 22-minute mono track decodes to ~230 MB
// of float samples; two of them would exhaust memory on many phones. Media
// elements stream from disk instead.
//
// Stumps added from a photo have no files at all: an AudioWorklet makes both
// tracks live (see engine/worklet.js), into the same pair of gain nodes.
import workletUrl from './engine/worklet.js?worker&url';
import { SPECIES } from './engine/index.js';

let ctx = null;
const players = new Map(); // stumpId -> player
const listeners = new Set();

function getContext() {
  // Same as AppDelegate's .playback category, for Safari and the web preview:
  // don't let the silent switch mute live synthesis.
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
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
    time: p.live ? p.time : p.idx.currentTime,
    duration: p.live ? p.stump.live.duration : p.idx.duration,
    error: p.error,
  };
}

export function getState(id) {
  const p = players.get(id);
  return p ? snapshot(p) : null;
}

export function registerStump(stump) {
  if (players.has(stump.id)) return;
  if (stump.live) {
    players.set(stump.id, { id: stump.id, stump, live: true, node: null, time: 0, playing: false, xfade: 0.5, gains: null, error: null });
    return;
  }
  if (!stump.audio) return;
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

let workletReady = null;

async function connect(p) {
  if (p.gains) return;
  const ac = getContext();
  const gi = ac.createGain();
  const gm = ac.createGain();
  if (p.live) {
    workletReady ??= ac.audioWorklet.addModule(workletUrl);
    await workletReady;
    const { verts, species, rings, duration } = p.stump.live;
    const node = new AudioWorkletNode(ac, 'stump-processor', {
      numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [1, 1],
      processorOptions: { verts: Float64Array.from(verts), species: SPECIES[species] || SPECIES['Unknown / Other'], rings, duration },
    });
    node.port.onmessage = e => {
      p.time = e.data.time;
      if (e.data.ended) p.playing = false;
      emit(p);
    };
    node.connect(gi, 0);
    node.connect(gm, 1);
    p.node = node;
  } else {
    ac.createMediaElementSource(p.idx).connect(gi);
    ac.createMediaElementSource(p.met).connect(gm);
  }
  gi.connect(ac.destination);
  gm.connect(ac.destination);
  p.gains = { idx: gi, met: gm };
  applyXfade(p);
}

// The last 5% of the slider at each end is fully one track. On a phone the
// thumb rarely lands exactly on 0 or 1, and even 2% of the other track is
// clearly audible.
const XFADE_END = 0.05;

function applyXfade(p) {
  if (!p.gains) return;
  // Equal-power crossfade: 0 = all indexical, 1 = all metaphorical.
  const x = Math.min(1, Math.max(0, (p.xfade - XFADE_END) / (1 - 2 * XFADE_END)));
  const t = getContext().currentTime;
  p.gains.idx.gain.setTargetAtTime(x >= 1 ? 0 : Math.cos(x * Math.PI / 2), t, 0.02);
  p.gains.met.gain.setTargetAtTime(x <= 0 ? 0 : Math.sin(x * Math.PI / 2), t, 0.02);
  // Belt and braces: silence the element itself at the ends too.
  if (!p.live) {
    p.idx.muted = x >= 1;
    p.met.muted = x <= 0;
  }
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

  const ac = getContext();
  try {
    // Resume first: iOS only unlocks audio inside the tap that asked for it.
    const resumed = ac.state === 'suspended' ? ac.resume() : null;
    await connect(p);
    await resumed;
    if (p.live) {
      if (p.time >= p.stump.live.duration) {
        // Played to the end: start the side again from the top.
        p.node.disconnect(); p.gains.idx.disconnect(); p.gains.met.disconnect();
        p.gains = null; p.node = null; p.time = 0;
        await connect(p);
      }
      p.node.port.postMessage('play');
    } else {
      p.met.currentTime = p.idx.currentTime;
      await Promise.all([p.idx.play(), p.met.play()]);
    }
    p.playing = true;
    p.error = null;
    setMediaSession(p);
  } catch (e) {
    console.error('Audio play failed:', e);
    if (p.live) p.node?.port.postMessage('pause');
    else { p.idx.pause(); p.met.pause(); }
    p.error = 'Audio could not start.';
  }
  emit(p);
}

function pause(p) {
  if (p.live) p.node?.port.postMessage('pause');
  else { p.idx.pause(); p.met.pause(); }
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
    artwork: [p.stump.photo
      ? { src: p.stump.photo, type: 'image/jpeg' }
      : { src: 'media/linden-hero.jpg', sizes: '1500x2000', type: 'image/jpeg' }],
  });
  navigator.mediaSession.setActionHandler('play', () => { if (!p.playing) toggle(p.id); });
  navigator.mediaSession.setActionHandler('pause', () => { if (p.playing) toggle(p.id); });
}

export function fmt(s) {
  if (!isFinite(s) || isNaN(s)) return '—';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

/** Stop and forget a stump (used when a photo stump is removed). */
export function unregisterStump(id) {
  const p = players.get(id);
  if (!p) return;
  if (p.playing) pause(p);
  p.node?.disconnect();
  p.gains?.idx.disconnect();
  p.gains?.met.disconnect();
  players.delete(id);
}
