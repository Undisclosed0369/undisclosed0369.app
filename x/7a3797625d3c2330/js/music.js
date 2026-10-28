// Background music: one track at a time, looping, at each player's own
// volume, chosen per device. It runs from the lobby through the game and
// back without a break (the page never reloads between them), dips under
// Bella's voice, and pauses while the tab is hidden. With the game open in
// two tabs, only the one used last plays, so it's never heard twice.
//
// Off really means off: the track is stopped and its address dropped, so
// nothing more is downloaded. Tracks stream, so the 100-minute lounge mix
// only downloads as far as it's played; where you left it is remembered.

import { audio, onSpeak } from "./fx.js";

export const TRACKS = [
  { id: "lounge", name: "Luxury Hotel Lounge", note: "Smooth jazz, 100 minutes" },
  { id: "shop-theme", name: "Shop Theme", note: "Bossa nova lounge" },
  { id: "sunny-side-up", name: "Sunny Side Up", note: "Gypsy jazz" },
  { id: "pollie-soft", name: "Pollie Soft", note: "Easy jazz" },
  { id: "funky-menu", name: "Funky Menu", note: "A little funk" },
  { id: "happy-clappy", name: "Happy Clappy", note: "Cheerful piano" },
];

const KEY = "db:music";
const state = (() => {
  const base = { on: true, volume: 0.45, track: "lounge", at: {} };
  try { return { ...base, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return base; }
})();
if (!TRACKS.some((t) => t.id === state.track)) state.track = "lounge";
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } };

let el = null, gain = null;
let wanted = false;     // on a screen that has music (the lobby and the table)
let waiting = false;    // the browser wants a tap before it plays sound
let ducked = false;
let turn = 0;            // bumps on every start/stop, so a late stop never undoes a newer start
const listeners = new Set();
const changed = () => { for (const fn of listeners) fn(getMusic()); };

/** { on, volume, track, playing } */
export const getMusic = () => ({ on: state.on, volume: state.volume, track: state.track, playing: !!el && !el.paused });
export const onMusic = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** The <audio> element, routed through the audio context so the volume
 *  works everywhere (iPhones ignore an element's own volume). */
function player() {
  if (el) return el;
  el = new Audio();
  el.loop = true;
  el.preload = "none";
  try {
    const ctx = audio();
    gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(gain).connect(ctx.destination);
  } catch { gain = null; }
  el.addEventListener("timeupdate", remember);
  el.addEventListener("play", changed);
  el.addEventListener("pause", changed);
  return el;
}

const level = () => state.volume * (ducked ? 0.4 : 1);
function fade(to, seconds) {
  if (gain) {
    const ctx = audio(), g = gain.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(to, ctx.currentTime + seconds);
  } else if (el) el.volume = Math.min(1, to);
}

let lastSaved = 0;
function remember() {
  if (!el || el.paused || !el.currentTime) return;
  state.at[state.track] = el.currentTime;
  if (Date.now() - lastSaved > 10000) { lastSaved = Date.now(); save(); }
}

function start() {
  if (!state.on || !wanted || document.hidden) return;
  turn++;
  const p = player();
  const src = `sounds/music/${state.track}.mp3`;
  if (!p.getAttribute("src")) {
    p.src = src;
    const at = state.at[state.track];
    if (at) p.addEventListener("loadedmetadata", () => { if (at < p.duration - 2) p.currentTime = at; }, { once: true });
  }
  try { if (audio().state === "suspended") audio().resume(); } catch { /* no audio */ }
  p.play().then(() => { waiting = false; claim(); fade(level(), 1.6); }).catch(() => { waiting = true; });
}

/** Stop, and let go of the track entirely: nothing keeps downloading. */
function stop(unload = true) {
  waiting = false;
  if (!el) return;
  remember();
  save();
  fade(0, 0.35);
  const p = el, mine = ++turn;
  setTimeout(() => {
    if (mine !== turn) return;
    p.pause();
    if (unload) { p.removeAttribute("src"); p.load(); }
    changed();
  }, 380);
}

// One tab at a time: a tab that starts playing tells the others, and they
// stop. (Two copies of the same track a moment apart sound like an echo.)
const tabs = "BroadcastChannel" in window ? new BroadcastChannel("db:music") : null;
const me = Math.random().toString(36).slice(2);
tabs?.addEventListener("message", (e) => { if (e.data?.playing && e.data.tab !== me && el && !el.paused) stop(false); });
const claim = () => tabs?.postMessage({ playing: true, tab: me });

// Browsers only play sound after a tap: the first one starts it.
// A tap in a tab whose music was stopped by another tab brings it back here.
for (const type of ["pointerdown", "keydown"]) addEventListener(type, () => { if (waiting || (el && el.paused && wanted && state.on)) start(); }, { passive: true });
// Nobody's listening to a hidden tab: pause there, carry on when it's back.
document.addEventListener("visibilitychange", () => { if (document.hidden) { if (el && !el.paused) { remember(); save(); el.pause(); } } else start(); });
addEventListener("pagehide", () => { remember(); save(); });
onSpeak((on, wait = 0) => {
  ducked = on;
  if (el && !el.paused && gain) {
    const ctx = audio(), g = gain.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime + wait);
    g.linearRampToValueAtTime(level(), ctx.currentTime + wait + (on ? 0.15 : 0.6));
  }
});

/** The app says whether this screen has music (the lobby and the table do). */
export function wantMusic(yes) {
  if (yes === wanted) return;
  wanted = yes;
  if (yes) start(); else stop();
}

export function setMusicOn(on) {
  state.on = on;
  save();
  if (on) start(); else stop();
  changed();
}

export function setVolume(v) {
  state.volume = Math.max(0, Math.min(1, v));
  save();
  if (el && !el.paused) fade(level(), 0.08);
  changed();
}

export function setTrack(id) {
  if (!TRACKS.some((t) => t.id === id) || id === state.track) { if (!getMusic().playing) setMusicOn(true); return; }
  remember();
  state.track = id;
  state.on = true;
  save();
  if (el && el.getAttribute("src")) {
    fade(0, 0.3);
    const p = el, mine = ++turn;
    setTimeout(() => { if (mine !== turn) return; p.pause(); p.removeAttribute("src"); p.load(); start(); }, 320);
  } else start();
  changed();
}
