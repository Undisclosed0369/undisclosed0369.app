// Effects: sound, voices, confetti, shockwaves, stamps, floating amounts.
//
// SOUND
// Recorded sounds (sounds/sfx, built by _dealbreaker/tools/build-sounds.py)
// play through one small studio chain, a gentle compressor. A slider's notch
// is still synthesised live with the Web Audio API (through a dry bus and a
// reverb send), and so is any recording that fails to load. With sound off
// nothing is downloaded.
//
// VOICE
// Bella, the table's all-seeing croupier, calls out the big moments, one line
// each. She can be switched off on each device.

import { reduceMotion } from "./util.js";

// ------------------------------------------------------------------ the studio

let A = null;   // { ctx, out, verb }
let muted = (() => { try { return localStorage.getItem("db:mute") === "1"; } catch { return false; } })();

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  if (!m && A) preload();
  try { localStorage.setItem("db:mute", m ? "1" : "0"); } catch { /* private mode */ }
}

function studio() {
  if (A) return A;
  const ctx = new AudioContext();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  const master = ctx.createGain();
  master.gain.value = 0.85;
  comp.connect(master).connect(ctx.destination);

  // A small, warm room: decaying stereo noise, softened at the top.
  const len = Math.floor(ctx.sampleRate * 1.6);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
      d[i] = lp * Math.pow(1 - t, 3.2);
    }
  }
  const verb = ctx.createConvolver();
  verb.buffer = ir;
  const verbGain = ctx.createGain();
  verbGain.gain.value = 0.28;
  verb.connect(verbGain).connect(comp);
  A = { ctx, out: comp, verb };
  if (!muted) preload();
  return A;
}

/** The shared audio context (the music player plays through it too). */
export const audio = () => studio().ctx;

// Browsers only allow audio after the first tap.
addEventListener("pointerdown", () => {
  try { const { ctx } = studio(); if (ctx.state === "suspended") ctx.resume(); } catch { /* no audio */ }
}, { passive: true });

/** A voice's output: dry plus a reverb send. */
function bus(wet = 0.35, pan = 0) {
  const { ctx, out, verb } = A;
  const g = ctx.createGain();
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  const send = ctx.createGain();
  send.gain.value = wet;
  g.connect(p);
  p.connect(out);
  p.connect(send).connect(verb);
  return g;
}

function env(param, t, { a = 0.005, peak = 0.2, d = 0.3, hold = 0 } = {}) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + a);
  if (hold) param.setValueAtTime(peak, t + a + hold);
  param.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
}

/** A soft, rounded tone with a touch of second harmonic. */
function tone(freq, { at = 0, d = 0.3, peak = 0.12, type = "sine", wet = 0.3, pan = 0, slide = 0, a = 0.006 } = {}) {
  const { ctx } = A;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + d);
  env(g.gain, t, { a, peak, d });
  o.connect(g).connect(bus(wet, pan));
  o.start(t);
  o.stop(t + a + d + 0.05);
}

/** A bell: FM synthesis, bright attack, long glassy tail. */
function bell(freq, { at = 0, d = 1.2, peak = 0.09, ratio = 3.5, depth = 2.2, wet = 0.45, pan = 0 } = {}) {
  const { ctx } = A;
  const t = ctx.currentTime + at;
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  car.frequency.value = freq;
  mod.frequency.value = freq * ratio;
  mg.gain.setValueAtTime(freq * depth, t);
  mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + d * 0.6);
  mod.connect(mg).connect(car.frequency);
  env(g.gain, t, { a: 0.003, peak, d });
  car.connect(g).connect(bus(wet, pan));
  car.start(t); mod.start(t);
  car.stop(t + d + 0.1); mod.stop(t + d + 0.1);
}

/** Filtered noise: card slides, whooshes, the felt. */
function noise({ at = 0, d = 0.1, peak = 0.2, from = 3000, to = 900, q = 0.9, type = "bandpass", wet = 0.15, pan = 0, a = 0.004 } = {}) {
  const { ctx } = A;
  const t = ctx.currentTime + at;
  const len = Math.ceil(ctx.sampleRate * (d + a + 0.05));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + a + d);
  const g = ctx.createGain();
  env(g.gain, t, { a, peak, d });
  src.connect(f).connect(g).connect(bus(wet, pan));
  src.start(t);
  src.stop(t + a + d + 0.05);
}

/** A round low thump, felt more than heard. */
function thump(at = 0, peak = 0.35, freq = 120) {
  tone(freq, { at, d: 0.22, peak, slide: 0.45, wet: 0.1, a: 0.002 });
}

/** A soft pad chord for the big endings. */
function pad(freqs, { at = 0, d = 1.8, peak = 0.035, wet = 0.6 } = {}) {
  const { ctx } = A;
  for (const [i, f] of freqs.entries()) {
    const t = ctx.currentTime + at;
    for (const detune of [-6, 6]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = detune;
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(600, t);
      lp.frequency.linearRampToValueAtTime(2200, t + d * 0.4);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(lp).connect(g).connect(bus(wet, (i - 1) * 0.3));
      o.start(t);
      o.stop(t + d + 0.1);
    }
  }
}

const N = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, E6: 1318.5, G6: 1568,
  A3: 220, G3: 196, F3: 174.61, E3: 164.81, D3: 146.83, C3: 130.81, Bb3: 233.08, Eb4: 311.13, Ab3: 207.65 };

const SOUNDS = {
  // UI (buttons make no sound: a click is felt, not heard)
  tick: () => { noise({ d: 0.02, peak: 0.1, from: 2600, to: 2200, q: 6, wet: 0.08 }); tone(1900, { d: 0.03, peak: 0.02, wet: 0.05 }); },
  // A slider's notch or a PIN digit: kept synthesised, small and dry.
  notch: () => { noise({ d: 0.02, peak: 0.1, from: 2600, to: 2200, q: 6, wet: 0.08 }); tone(1900, { d: 0.03, peak: 0.02, wet: 0.05 }); },
  error: () => { tone(N.E4, { d: 0.12, peak: 0.07, type: "triangle", wet: 0.2 }); tone(N.C4, { at: 0.1, d: 0.2, peak: 0.07, type: "triangle", wet: 0.2 }); },

  // Cards
  card: () => { noise({ d: 0.09, peak: 0.26, from: 5200, to: 1500, q: 0.7, wet: 0.12 }); thump(0.03, 0.06, 180); },
  draw: () => [0, 0.11].forEach((t, i) => { noise({ at: t, d: 0.1, peak: 0.24, from: 4800, to: 1400, q: 0.7, pan: i ? 0.2 : -0.2 }); }),
  deal: () => { for (let i = 0; i < 6; i++) noise({ at: i * 0.07, d: 0.08, peak: 0.2, from: 5000, to: 1600, q: 0.7, pan: (i % 2 ? 0.25 : -0.25) }); },
  place: () => { noise({ d: 0.07, peak: 0.2, from: 3800, to: 1200 }); thump(0.02, 0.16, 150); },
  flip: () => { noise({ d: 0.16, peak: 0.16, from: 1200, to: 5200, q: 0.8 }); bell(N.E6, { at: 0.08, d: 0.5, peak: 0.03, depth: 1 }); },
  bank: () => { noise({ d: 0.06, peak: 0.16, from: 4000, to: 1800 }); bell(N.A5, { at: 0.03, d: 0.6, peak: 0.05, ratio: 2.76, depth: 1.4 }); },
  coin: () => { bell(N.E6, { d: 0.5, peak: 0.05, ratio: 2.76, depth: 1.2 }); bell(N.G6, { at: 0.07, d: 0.7, peak: 0.045, ratio: 2.76, depth: 1.2 }); },

  // Moments
  turn: () => { tone(N.G5, { d: 0.35, peak: 0.07, wet: 0.45 }); tone(N.C6, { at: 0.12, d: 0.6, peak: 0.07, wet: 0.5 }); },
  rent: () => {
    noise({ d: 0.05, peak: 0.12, from: 6000, to: 3000, q: 2 });
    [N.C6, N.E6, N.G6].forEach((f, i) => bell(f, { at: 0.04 + i * 0.06, d: 0.9, peak: 0.05, ratio: 2.76, depth: 1.5, pan: (i - 1) * 0.3 }));
    thump(0, 0.18, 110);
  },
  doubleRent: () => { SOUNDS.rent(); [N.G5, N.C6].forEach((f, i) => bell(f, { at: 0.28 + i * 0.08, d: 1.1, peak: 0.06, ratio: 2.76 })); thump(0.28, 0.25, 90); },
  pay: () => { tone(N.E5, { d: 0.18, peak: 0.05, wet: 0.35 }); tone(N.C5, { at: 0.12, d: 0.3, peak: 0.05, wet: 0.4 }); noise({ at: 0.05, d: 0.12, peak: 0.1, from: 3000, to: 900 }); },
  paid: () => { SOUNDS.coin(); },
  steal: () => { noise({ d: 0.32, peak: 0.22, from: 500, to: 5000, q: 0.6, wet: 0.25 }); tone(N.A4, { at: 0.2, d: 0.25, peak: 0.05, type: "triangle", slide: 1.5 }); },
  swap: () => { noise({ d: 0.25, peak: 0.18, from: 600, to: 4200, pan: -0.4 }); noise({ at: 0.14, d: 0.25, peak: 0.18, from: 4200, to: 600, pan: 0.4 }); },
  jsn: () => {
    // A firm, brassy "no": two descending notes over a deep hit.
    thump(0, 0.45, 95);
    for (const [f, at] of [[N.G3, 0.0], [N.D3, 0.16]]) {
      const { ctx } = A;
      const t = ctx.currentTime + at;
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = "sawtooth";
      o.frequency.value = f;
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(1800, t);
      lp.frequency.exponentialRampToValueAtTime(400, t + 0.35);
      env(g.gain, t, { a: 0.01, peak: 0.12, d: 0.35 });
      o.connect(lp).connect(g).connect(bus(0.35));
      o.start(t);
      o.stop(t + 0.45);
    }
  },
  dealBreaker: () => {
    noise({ d: 0.5, peak: 0.25, from: 300, to: 6000, q: 0.5, wet: 0.35 });
    thump(0.42, 0.55, 70);
    [N.C5, N.Eb4 * 2, N.G5].forEach((f, i) => bell(f, { at: 0.44 + i * 0.02, d: 1.6, peak: 0.05, ratio: 1.4, depth: 3 }));
    pad([N.C3 * 2, N.Eb4, N.G4], { at: 0.42, d: 1.6, peak: 0.03 });
  },
  birthday: () => [N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, i) => bell(f, { at: i * 0.09, d: 0.9, peak: 0.05, ratio: 3.01, depth: 1.6, pan: (i - 2) * 0.2 })),
  complete: () => { [N.E5, N.G5, N.B5, N.E6].forEach((f, i) => bell(f, { at: i * 0.07, d: 1.2, peak: 0.055, ratio: 2, depth: 1.2, pan: (i - 1.5) * 0.25 })); noise({ at: 0.25, d: 0.6, peak: 0.05, from: 8000, to: 4000, q: 0.3, wet: 0.6 }); },
  skipped: () => { tone(N.A4, { d: 0.2, peak: 0.05, type: "triangle" }); tone(N.F4, { at: 0.16, d: 0.3, peak: 0.05, type: "triangle" }); },

  // Chat
  send: () => { noise({ d: 0.12, peak: 0.08, from: 800, to: 4500, q: 1.2, wet: 0.1 }); },
  receive: () => { tone(N.E6, { d: 0.12, peak: 0.035, wet: 0.3 }); tone(N.C6 * 1.5, { at: 0.08, d: 0.22, peak: 0.03, wet: 0.35 }); },

  // Endings
  win: () => {
    pad([N.C4, N.E4, N.G4], { d: 1.2, peak: 0.035 });
    pad([N.F4, N.A4, N.C5], { at: 0.6, d: 1.2, peak: 0.035 });
    pad([N.G4, N.B4, N.D5], { at: 1.2, d: 1.0, peak: 0.035 });
    pad([N.C5, N.E5, N.G5], { at: 1.8, d: 2.6, peak: 0.045 });
    [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6].forEach((f, i) => bell(f, { at: 1.8 + i * 0.07, d: 1.6, peak: 0.05, ratio: 3.01, depth: 1.4, pan: (i - 2.5) * 0.2 }));
    thump(1.8, 0.4, 90);
  },
  lose: () => {
    pad([N.A3, N.C4, N.E4], { d: 1.6, peak: 0.03 });
    pad([N.F3, N.A3, N.C4], { at: 0.8, d: 2.2, peak: 0.03 });
    [N.E5, N.C5, N.A4].forEach((f, i) => bell(f, { at: i * 0.22, d: 1.2, peak: 0.04, ratio: 2, depth: 0.8 }));
  },
};

// ------------------------------------------------------------------ recorded sounds

/** Moments with a recording in sounds/sfx (the rest stay synthesised). */
const RECORDED = ["deal", "draw", "card", "place", "reshuffle", "move", "flip", "bank", "pay", "coin", "paid",
  "rent", "doubleRent", "sly", "forced", "jsn", "dealBreaker", "birthday", "complete", "turn", "tick", "timeout", "skipped",
  "win", "lose", "error", "send", "receive"];
const buffers = new Map();   // file → Promise<AudioBuffer | null>
const ready = new Map();     // file → AudioBuffer, once decoded

function buffer(file) {
  if (!buffers.has(file)) {
    buffers.set(file, fetch(file).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((b) => new Promise((ok, no) => A.ctx.decodeAudioData(b, ok, no)))
      .then((b) => { ready.set(file, b); return b; }).catch(() => null));
  }
  return buffers.get(file);
}

/** Every effect, fetched once the first tap opens the audio (a few hundred KB). */
function preload() {
  for (const n of RECORDED) buffer(`sounds/sfx/${n}.mp3`);
}

function playBuffer(buf, { at = 0, gain = 1 } = {}) {
  const src = A.ctx.createBufferSource();
  const g = A.ctx.createGain();
  src.buffer = buf;
  g.gain.value = gain;
  src.connect(g).connect(A.out);
  src.start(A.ctx.currentTime + at);
  return src;
}

// The same sound asked for twice at the same moment plays once: a tap on a
// menu tile that opens a sheet (which taps too), several cards moving in one
// update. Stacked copies only sound louder and doubled. The window is short
// enough that quick typing (a PIN) still clicks on every digit.
const lastPlayed = new Map();   // name → time
const AGAIN_MS = 60;

export function sound(name) {
  if (muted) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) || -Infinity) < AGAIN_MS) return;
  lastPlayed.set(name, now);
  try {
    studio();
    if (A.ctx.state !== "running") return;
    if (RECORDED.includes(name)) {
      const file = `sounds/sfx/${name}.mp3`;
      const buf = ready.get(file);
      if (buf) { playBuffer(buf); return; }
      // Not decoded yet (the first few seconds): play it as soon as it is,
      // unless that's too late to still belong to the moment.
      const asked = performance.now();
      buffer(file).then((b) => {
        if (!b) return SOUNDS[name]?.();
        if (performance.now() - asked < 400) playBuffer(b);
      });
      return;
    }
    SOUNDS[name]?.();
  } catch { /* ignore */ }
}

// ------------------------------------------------------------------ voices

/** "on" (the default) or "off". */
let voiceMode = (() => { try { return localStorage.getItem("db:voice") === "off" ? "off" : "on"; } catch { return "on"; } })();
export const getVoice = () => voiceMode;
export function setVoice(v) {
  voiceMode = v === "off" ? "off" : "on";
  try { localStorage.setItem("db:voice", voiceMode); } catch { /* private mode */ }
}

let speaking = null;
const ducks = new Set();
/** The music player listens, to dip under the voice. */
export const onSpeak = (fn) => ducks.add(fn);

/**
 * Bella says a moment's line: start, rent, doubleRent, debt, dealBreaker,
 * sly, forced, jsn, birthday, oneAway, hurry, timeout, win, lose. `at` waits that
 * many seconds (to land after the moment's sound). A new line cuts off the last.
 */
export function voice(key, { at = 0 } = {}) {
  if (muted || voiceMode === "off") return;
  try {
    studio();
    if (A.ctx.state !== "running") return;
    const file = `sounds/voice/${key}.mp3`;
    const asked = performance.now();
    buffer(file).then((buf) => {
      if (!buf || performance.now() - asked > 1500 + at * 1000) return;
      try { speaking?.stop(); } catch { /* already over */ }
      const wait = Math.max(0, at - (performance.now() - asked) / 1000);
      const src = playBuffer(buf, { at: wait, gain: 1.15 });
      speaking = src;
      for (const fn of ducks) fn(true, wait);
      src.onended = () => { if (speaking === src) { speaking = null; for (const fn of ducks) fn(false); } };
    });
  } catch { /* ignore */ }
}

// ------------------------------------------------------------------ confetti

const canvas = () => document.getElementById("fx");
let particles = [];
let running = false;
const COLORS = ["#8d42f5", "#e042f5", "#42a1f5", "#42e0f5", "#ffcf6b", "#42f566", "#ff5a5f"];

export function confetti({ x = innerWidth / 2, y = innerHeight * 0.35, count = 120, spread = 1 } = {}) {
  if (reduceMotion.matches) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (4 + Math.random() * 9) * spread;
    particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6,
      w: 5 + Math.random() * 6, h: 8 + Math.random() * 8,
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: COLORS[Math.floor(Math.random() * COLORS.length)], life: 1,
    });
  }
  if (!running) loop();
}

function loop() {
  const cv = canvas();
  const dpr = devicePixelRatio || 1;
  if (cv.width !== innerWidth * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  running = true;
  const step = () => {
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of particles) {
      p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.006;
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.scale(1, Math.cos(p.r * 2));
      g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    particles = particles.filter((p) => p.life > 0 && p.y < innerHeight + 40);
    if (particles.length) requestAnimationFrame(step);
    else { g.clearRect(0, 0, innerWidth, innerHeight); running = false; }
  };
  requestAnimationFrame(step);
}

// ------------------------------------------------------------------ shock, stamp, amounts

export function shock(x, y, color = "#fff") {
  if (reduceMotion.matches) return;
  for (let i = 0; i < 2; i++) {
    const el = document.createElement("div");
    el.className = "shock";
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.setProperty("--c", color);
    el.style.animationDelay = i * 120 + "ms";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }
}

export function stamp(text, c1 = "#ff453a", c2 = "#e042f5") {
  // One stamp at a time: a quick "NO!" after a "DEAL BREAKER!" replaces it.
  for (const old of document.querySelectorAll(".stamp")) old.remove();
  const el = document.createElement("div");
  el.className = "stamp";
  el.textContent = text;
  el.style.setProperty("--c1", c1);
  el.style.setProperty("--c2", c2);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

/** "+4M" rising from a bank, or "−4M" in red. */
export function floatAmount(el, amount, loss = false) {
  if (!el || !amount) return;
  const r = el.getBoundingClientRect();
  if (!r.width) return;
  const f = document.createElement("div");
  f.className = "float-amount" + (loss ? " is-loss" : "");
  f.textContent = (loss ? "−" : "+") + amount + "M";
  f.style.left = r.left + r.width / 2 + "px";
  f.style.top = r.top + "px";
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1600);
}

/** Center of an element on screen. */
export function centerOf(el) {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}
