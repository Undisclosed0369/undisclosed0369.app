// Full-screen overlays (the menu, a player's view, stats, results), one at a
// time, and the big tiles they're built from.

import { h, press } from "./sheets.js";
import { $ } from "./util.js";

let overlayEl = null;
let overlayKey = null;

/** The open overlay's key ("menu", "profile", "player:p2", "results:…"), or null. */
export const currentOverlay = () => overlayKey;
export const overlayOpen = () => !!overlayEl;

export function overlay(key, content, { closable = true, cls = "" } = {}) {
  closeOverlay(true);
  const el = h("div", { class: "overlay" + (cls ? " " + cls : ""), role: "dialog", "aria-modal": "true" },
    h("div", { class: "overlay__inner" }, content),
    closable ? h("button", { class: "icon-btn overlay__close", type: "button", "aria-label": "Close", onclick: () => { closeOverlay(); },
      html: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>' }) : null);
  if (closable) el.addEventListener("click", (e) => { if (e.target === el) closeOverlay(); });
  el.closable = closable;
  $("overlays").append(el);
  overlayEl = el;
  overlayKey = key;
}

export function closeOverlay(instant = false) {
  if (!overlayEl) return;
  const el = overlayEl;
  overlayEl = null;
  overlayKey = null;
  if (instant) return el.remove();
  el.classList.add("is-out");
  setTimeout(() => el.remove(), 320);
}

// Keyboard for the full-screen overlays (sheets handle their own): Esc
// closes the menu, Return presses the main button (Rematch).
addEventListener("keydown", (e) => {
  if (!overlayEl || e.defaultPrevented || e.repeat || document.querySelector(".sheet")) return;
  if (e.key === "Escape") {
    // A screen with a way back (your stats, opened from somewhere) goes back; otherwise it closes.
    const back = overlayEl.querySelector("[data-back]");
    if (back) { e.preventDefault(); press(back); return; }
    if (overlayEl.closable) { e.preventDefault(); closeOverlay(); return; }
  }
  if (e.key === "Enter" && !e.target.closest?.("input, textarea, button")) {
    const target = overlayEl.querySelector("[data-default]:not(:disabled)");
    if (target) { e.preventDefault(); press(target); }
  }
});

export function tile({ icon, label, small, primary, danger, row, extra, onClick }) {
  return h("button", { class: "tile" + (primary ? " tile--primary" : "") + (danger ? " tile--danger" : "") + (row ? " tile--row" : ""), type: "button",
    onclick: () => { onClick?.(); } },
    h("span", { class: "tile__icon" }, icon),
    h("span", {}, label, small ? h("small", { style: { display: "block", marginTop: ".2rem" } }, small) : null),
    extra || null);
}

/** How to play, full screen, inside the game: the page never changes, so the
 *  music carries on. The rules page's "← Table" (and Esc) close it. */
export function openRules() {
  overlay("rules", h("iframe", { class: "rules-frame", src: "rules/?embed", title: "How to play" }), { cls: "overlay--rules" });
}
addEventListener("message", (e) => {
  if (e.origin === location.origin && e.data?.t === "closeRules" && overlayKey === "rules") closeOverlay();
});
