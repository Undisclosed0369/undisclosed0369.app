// Drag and drop for cards.
//
// Pick a card up (mouse or finger) and it follows you, tilting with your
// movement like a real card held at one corner. Everywhere it can legally
// go glows; where it would land glows brighter. Let go there and it plays;
// let go anywhere else and it springs back to your hand. A tap without
// moving still opens the card's options.
//
//   enableDrag(container, { selector, zonesFor(card) -> [zoneEl], onDrop(card, zoneEl, rect), onTap(card), strict, autoScroll })
//
// autoScroll (your row of sets): when it's longer than the screen, holding a
// card near either end of it scrolls it that way, faster the closer you get,
// so a set that's out of view can still be reached.
//
// strict (cards already on your table): only the drop zone right under the
// pointer counts, so letting go over the card's own set does nothing rather
// than counting as "your table"; and it takes a bit more movement to start.

import { reduceMotion } from "./util.js";

const START = 7;              // px before a press becomes a drag
const EDGE = 90;              // px from a row's end where holding a card scrolls it
const SPEED = 16;             // px per frame at the very end (and beyond)

export function enableDrag(container, opts) {
  container.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const card = e.target.closest(opts.selector);
    if (!card || !container.contains(card)) return;
    start(card, e, opts);
  });
}

function start(cardEl, down, opts) {
  const id = cardEl.dataset.card;
  const zones = opts.zonesFor(id) || [];
  let drag = null;
  let over = null;
  const sx = down.clientX, sy = down.clientY;
  let vx = 0, lastX = sx, lastT = performance.now();
  let point = null, scrolling = 0;

  /** Which zone the card would land in, at this point on screen. */
  const aim = (x, y) => {
    const under = document.elementsFromPoint(x, y).map((el) => el.closest("[data-drop]")).filter(Boolean);
    const hit = opts.strict ? (zones.includes(under[0]) ? under[0] : null) : under.find((z) => zones.includes(z));
    if (hit !== over) {
      over?.classList.remove("is-over");
      over = hit || null;
      over?.classList.add("is-over");
      if (over) navigator.vibrate?.(8);
    }
  };

  /** Near an end of the row (or past it), scroll it, every frame until the
   *  card moves away, the row runs out, or the card is let go. */
  const autoScroll = () => {
    scrolling = 0;
    const row = opts.autoScroll;
    if (!drag || !point || !row || row.scrollWidth <= row.clientWidth + 1) return;
    const r = row.getBoundingClientRect();
    if (point.y < r.top - 60 || point.y > r.bottom + 60) return;
    const edge = Math.min(EDGE, r.width * 0.2);
    const fromLeft = point.x - r.left, fromRight = r.right - point.x;
    const push = fromLeft < edge ? -(edge - fromLeft) / edge : fromRight < edge ? (edge - fromRight) / edge : 0;
    if (!push) return;
    const before = row.scrollLeft;
    row.scrollLeft += Math.sign(push) * Math.max(2, SPEED * Math.min(1, push * push));
    if (row.scrollLeft === before) return; // already at that end
    aim(point.x, point.y);                 // the sets slid under the card
    scrolling = requestAnimationFrame(autoScroll);
  };

  const move = (e) => {
    if (e.pointerId !== down.pointerId) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!drag) {
      if (Math.hypot(dx, dy) < (opts.strict ? START * 2 : START) || !zones.length) return;
      drag = begin(cardEl, zones);
    }
    e.preventDefault();
    const now = performance.now();
    vx = vx * 0.7 + ((e.clientX - lastX) / Math.max(1, now - lastT)) * 0.3;
    lastX = e.clientX;
    lastT = now;
    const tilt = Math.max(-18, Math.min(18, vx * 9));
    drag.el.style.transform = `translate(${e.clientX - drag.ox}px, ${e.clientY - drag.oy}px) rotate(${tilt}deg) scale(1.1)`;
    point = { x: e.clientX, y: e.clientY };
    aim(point.x, point.y);
    if (!scrolling) autoScroll();
  };

  const up = (e) => {
    if (e.pointerId !== down.pointerId) return;
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    removeEventListener("pointercancel", up);
    cancelAnimationFrame(scrolling);
    scrolling = 0;
    if (!drag) {
      if (e.type === "pointerup" && Math.hypot(e.clientX - sx, e.clientY - sy) < (opts.strict ? START * 2 : START)) opts.onTap(id);
      return;
    }
    for (const z of zones) z.classList.remove("is-drop", "is-over");
    document.body.classList.remove("is-dragging");
    const rect = drag.el.getBoundingClientRect();
    if (over && e.type === "pointerup") {
      // Settle into the zone, then hand over: the table redraw carries the
      // card the rest of the way from exactly here.
      drag.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }).onfinish = () => drag.el.remove();
      cardEl.classList.remove("is-lifted");
      opts.onDrop(id, over, rect, drag.src);
    } else {
      // Spring back home.
      const home = cardEl.getBoundingClientRect();
      const anim = drag.el.animate([
        { transform: drag.el.style.transform },
        { transform: `translate(${home.left}px, ${home.top}px) rotate(0deg) scale(1)` },
      ], { duration: reduceMotion.matches ? 1 : 420, easing: "cubic-bezier(.2,1.25,.35,1)", fill: "forwards" });
      anim.onfinish = () => { drag.el.remove(); cardEl.classList.remove("is-lifted"); };
    }
  };

  addEventListener("pointermove", move, { passive: false });
  addEventListener("pointerup", up);
  addEventListener("pointercancel", up);
}

function begin(cardEl, zones) {
  const r = cardEl.getBoundingClientRect();
  const src = cardEl.querySelector("img")?.getAttribute("src");
  const el = document.createElement("div");
  el.className = "dragging";
  el.style.width = r.width + "px";
  el.style.height = r.height + "px";
  el.innerHTML = `<img src="${src}" alt="">`;
  document.body.append(el);
  const ox = r.width / 2, oy = r.height * 0.55;
  el.style.transform = `translate(${r.left}px, ${r.top}px)`;
  // translate is relative to the top-left corner: keep the grab point under the finger.
  const drag = { el, src, ox, oy };
  cardEl.classList.add("is-lifted");
  for (const z of zones) z.classList.add("is-drop");
  document.body.classList.add("is-dragging");
  return drag;
}
