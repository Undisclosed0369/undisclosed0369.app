// The spotlight: when someone plays an action, the card rises out of their
// seat, flips face up in the middle of the table with a caption, holds long
// enough to read, then drops onto the discard pile. One at a time, in order.
// Anything that should wait for the reveal (your prompt to answer it) waits.

import { $ } from "./util.js";

const queue = [];
const waiting = [];
let busy = false;

/** item: { def, title, sub, from (element), glow, ms, onShow } */
export function spotlight(item) {
  queue.push(item);
  if (!busy) next();
}

/** Run fn once the spotlight has finished showing everything queued. */
export function whenClear(fn) {
  if (!busy && !queue.length) fn();
  else waiting.push(fn);
}

function next() {
  const item = queue.shift();
  if (!item) {
    busy = false;
    while (waiting.length) waiting.shift()();
    return;
  }
  busy = true;
  const el = $("spot");
  const img = el.querySelector("img");
  img.src = `cards/${item.def}.svg`;
  el.querySelector(".spot__title").textContent = item.title || "";
  el.querySelector(".spot__sub").textContent = item.sub || "";
  el.style.setProperty("--spot-glow", item.glow || "rgba(176, 106, 247, .65)");

  // Fly in from the player's seat, out to the discard pile.
  const center = [innerWidth / 2, innerHeight * 0.44];
  const from = item.from?.getBoundingClientRect();
  const to = $("discard")?.getBoundingClientRect();
  el.style.setProperty("--from-x", from ? `${from.left + from.width / 2 - center[0]}px` : "0px");
  el.style.setProperty("--from-y", from ? `${from.top + from.height / 2 - center[1]}px` : "60px");
  el.style.setProperty("--to-x", to ? `${to.left + to.width / 2 - center[0]}px` : "0px");
  el.style.setProperty("--to-y", to ? `${to.top + to.height / 2 - center[1]}px` : "0px");

  el.classList.remove("is-out");
  el.hidden = false;
  // Restart the entrance animations.
  for (const n of el.querySelectorAll("img, p")) { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; }
  item.onShow?.();

  setTimeout(() => {
    el.classList.add("is-out");
    setTimeout(() => { el.hidden = true; next(); }, 420);
  }, item.ms || 1500);
}
