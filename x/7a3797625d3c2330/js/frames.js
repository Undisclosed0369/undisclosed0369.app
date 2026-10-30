// One clock for everything that moves, at 60 frames a second at most.
//
// Nothing runs while nothing moves: while you're deciding on a card, no loop
// ticks and the screen isn't redrawn at all. When something does move, it's
// drawn at 60 frames a second at most, whatever the display:
//
// - Our own motion (confetti, a card following your finger, a row gliding
//   to a stop) runs on frame(), which hands each step the time since the
//   last one, so it moves at the same speed however often it's drawn.
// - Displays faster than 60 Hz (120 Hz phones and laptops, 144 Hz monitors)
//   would also play every CSS animation and transition at their full rate,
//   and browsers have no setting for that. So on those displays each one is
//   paused the moment it starts and moved along from here instead, on every
//   second (or third) refresh: the same path and timing, at 60 frames a
//   second or a little under (50 on a 100 Hz screen, 48 on 144 Hz), always
//   evenly spaced.
// - The slow loops that keep going while you're idle (the deck breathing
//   until you draw, the cards floating on the start screen, a clock pulsing
//   in its last seconds) move a fraction of a pixel per frame, so 30 frames
//   a second looks the same. On a fast display all of them are drawn at 30,
//   stepped on a plain timer so nothing else wakes up in between. At 60 Hz
//   the browser moves most of them on its own, without the page at all,
//   which is cheaper still, so they're left to it; the few it can't move
//   alone (it redraws them through the page on every frame) are stepped at
//   30 here on every display.

const AMBIENT = new Set(["deck-breathe", "fan-float", "float", "ring-spin", "timer-pulse", "typing-dot", "typing-pulse",
  "eq", "btn-busy", "rotate-phone", "emo-wait", "pin-check"]);
// The ones the browser can't move alone (checked in Chrome's own trace): a
// second animation on the same property (the floating start cards and the
// results crown each have their entrance), or colours (the PIN check).
const PAGE_DRAWN = new Set(["fan-float", "float", "pin-check"]);
const AMBIENT_MS = 1000 / 30;
/** A slow loop: a CSS animation named above, or a script's with id "ambient". */
const ambient = (a) => a.id === "ambient" || AMBIENT.has(a.animationName);

let every = 1;      // draw motion on every n-th refresh: 1 at 60 Hz, 2 at 120 Hz, 3 at 144 Hz
let period = 1000 / 60;
let raf = 0, last = 0, timer = 0;
const loops = new Set();
const held = new Map(); // motion, on the refresh: Animation → { from: its time, at: when }
const slow = new Map(); // slow loops, on the timer

function tick(now) {
  raf = 0;
  // Due on every n-th refresh, with half a refresh of slack for jitter.
  if (!last || now - last >= every * period - period / 2) {
    const dt = last ? Math.min(now - last, 100) : period * every;
    last = now;
    for (const fn of loops) if (fn(dt, now) === false) loops.delete(fn);
    if (held.size) step(held, now);
  }
  if (loops.size || held.size) raf = requestAnimationFrame(tick);
  else last = 0;
}
const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };

function slowTick() {
  timer = 0;
  step(slow, performance.now());
  if (slow.size) timer = setTimeout(slowTick, AMBIENT_MS);
}
const wakeSlow = () => { if (!timer) timer = setTimeout(slowTick, AMBIENT_MS); };

/** Call fn(dt, now) on every frame (60 a second at most) until it returns
 *  false. dt is the milliseconds since its last frame. Returns a stop function. */
export function frame(fn) {
  loops.add(fn);
  wake();
  return () => loops.delete(fn);
}

// ------------------------------------------------------------------ CSS and Web Animations

/** Take over one animation: everything on a fast display; at 60 Hz, only the
 *  slow loops the browser would otherwise redraw through the page. */
function hold(a) {
  if (held.has(a) || slow.has(a) || a.playState !== "running" || !a.effect) return;
  const end = a.effect.getComputedTiming().endTime;
  if (end < 20) return; // reduced motion: over at once anyway
  const loop = ambient(a);
  if (every === 1 && !PAGE_DRAWN.has(a.animationName)) return;
  (loop ? slow : held).set(a, { from: a.currentTime ?? 0, at: performance.now(), end, el: lift(a) });
  a.pause();
  loop ? wakeSlow() : wake();
}

// A browser moves an animation it plays itself on its own, as a picture.
// Moved from here, a changing size would have it redraw the element at each
// new size, every step. Telling it the element is about to move (will-change)
// keeps it a picture for as long as it's held; the hint goes when it's done.
const lifted = new WeakMap(); // element → how many held animations move it
const MOVES = ["transform", "translate", "rotate", "scale"];
function lift(a) {
  const el = a.effect.target;
  if (!el?.style || a.effect.pseudoElement) return null;
  const moves = typeof CSSTransition !== "undefined" && a instanceof CSSTransition
    ? MOVES.includes(a.transitionProperty)
    : a.effect.getKeyframes().some((k) => MOVES.some((m) => m in k));
  if (!moves) return null;
  const n = lifted.get(el) || 0;
  if (!n) el.style.willChange = "transform";
  lifted.set(el, n + 1);
  return el;
}
function drop(h) {
  const el = h.el;
  if (!el) return;
  const n = (lifted.get(el) || 1) - 1;
  lifted.set(el, n);
  if (!n) el.style.willChange = "";
}

/** Move every animation in `map` to where it should be now. All the reading
 *  first, then all the writing, so the page's style is worked out once. */
function step(map, now) {
  const moves = [];
  for (const [a, h] of map) {
    // Cancelled, finished, or started again by someone else: let it go.
    if (a.playState !== "paused") { map.delete(a); drop(h); continue; }
    // CSS can still pause its own animations (a hover that holds the deck still).
    if (pausedByCss(a)) { h.from = a.currentTime; h.at = now; continue; }
    const t = h.from + (now - h.at) * a.playbackRate;
    moves.push([a, h, t, t >= h.end]);
  }
  for (const [a, h, t, done] of moves) {
    if (!done) { a.currentTime = t; continue; }
    map.delete(a);
    drop(h);
    try { a.finish(); } catch { /* already gone */ }
  }
}

function pausedByCss(a) {
  if (typeof CSSAnimation === "undefined" || !(a instanceof CSSAnimation)) return false;
  const el = a.effect.target;
  // Only ever under the pointer here (hovering the deck holds it still), so
  // the style is only looked up then.
  if (!el?.isConnected || !el.matches(":hover")) return false;
  const cs = getComputedStyle(el, a.effect.pseudoElement || null);
  const names = cs.animationName.split(", "), states = cs.animationPlayState.split(", ");
  const i = names.indexOf(a.animationName);
  return i >= 0 && states[i % states.length] === "paused";
}

/** Back to the browser (the display turned out to be 60 Hz after all): all
 *  motion, and the slow loops it can move on its own. */
function release() {
  const now = performance.now();
  for (const map of [held, slow]) {
    for (const [a, h] of map) {
      if (map === slow && PAGE_DRAWN.has(a.animationName)) continue;
      map.delete(a);
      drop(h);
      if (a.playState !== "paused") continue;
      try { a.currentTime = h.from + (now - h.at) * a.playbackRate; a.play(); } catch { /* gone */ }
    }
  }
}

// Every animation, the moment it starts.
const animate = Element.prototype.animate;
Element.prototype.animate = function (...args) {
  const a = animate.apply(this, args);
  hold(a);
  return a;
};
const catchCss = (el, match) => {
  if (!el?.getAnimations) return;
  for (const a of el.getAnimations({ subtree: true })) if (a.effect?.target === el && match(a)) hold(a);
};
const pseudo = (a) => a.effect.pseudoElement || "";
document.addEventListener("animationstart", (e) => catchCss(e.target, (a) => a.animationName === e.animationName && pseudo(a) === e.pseudoElement), true);
document.addEventListener("transitionrun", (e) => { if (every > 1) catchCss(e.target, (a) => a.transitionProperty === e.propertyName && pseudo(a) === e.pseudoElement); }, true);

// ------------------------------------------------------------------ how fast is this display?

// Timed from twenty refreshes: at the start, again a few seconds in (the
// first count can run slow while the page loads), and whenever the page comes
// back into view or the window changes (it may have moved to another screen).
function measure() {
  if (document.hidden) return;
  const times = [];
  const f = (t) => {
    times.push(t);
    if (times.length < 21) return requestAnimationFrame(f);
    const gaps = times.slice(1).map((t, i) => t - times[i]).sort((x, y) => x - y);
    period = gaps[gaps.length >> 1];
    const hz = 1000 / period;
    pace(hz < 66 ? 1 : Math.ceil(hz / 61));
  };
  requestAnimationFrame(f);
}

/** Draw motion on every n-th refresh. (Also how a 60 Hz screen is tested: pace(2) is 30 fps.) */
export function pace(n) {
  const was = every;
  every = n;
  if (was > 1 && every === 1) release();
  if (was === 1 && every > 1) for (const a of document.getAnimations()) hold(a);
}

measure();
setTimeout(measure, 4000);
document.addEventListener("visibilitychange", measure);
let resized = 0;
addEventListener("resize", () => { clearTimeout(resized); resized = setTimeout(measure, 600); });

/** For tests and the curious: the frame rate motion is drawn at. */
export const fps = () => Math.round(1000 / (period * every));
