// The chat's emoji menu, in the style of Discord: search on top with a skin
// tone picker, categories down the side, every emoji in a scrolling grid with
// sticky (collapsible) headers, your most-used ones first, and a preview of
// the hovered emoji and its :name: along the bottom.
//
// The emoji list (emoji-groups.js, 45 KB) loads the first time the menu
// opens, and the menu is built once and kept. Emoji are drawn the Apple way,
// like the chat itself.

import { h } from "./sheets.js";
import { sound } from "./fx.js";
import { emojiNodes, addTone, TONES } from "./richtext.js";
import { store } from "./util.js";

const RECENT_MAX = 27; // three rows
const FACES = ["😀", "😄", "😁", "😆", "😅", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😋", "😜", "🤪", "😎", "🤓", "🥳", "🤠", "😏", "🤑", "🤗", "🫠"];

let input = null, button = null, host = null;
let panel = null, groups = null, flat = null; // flat: [{ e, names, tone }] by index
let tone = store.get("db:emoji:tone") || 0;    // 0 = default yellow, 1–5 = skin tones
const collapsed = new Set(store.get("db:emoji:collapsed") || []);

/** input: the chat field; btn: the smiley button; where: the element the menu sits in (the chat panel). */
export function initEmojiPicker(inputEl, btn, where) {
  input = inputEl; button = btn; host = where;
  // The button's face changes every time you point at it, like Discord's.
  const face = () => { button.replaceChildren(...emojiNodes(FACES[Math.floor(Math.random() * FACES.length)])); };
  face();
  button.addEventListener("pointerenter", face);
  button.addEventListener("click", (e) => { e.preventDefault(); toggle(); });
}

export const isOpen = () => !!panel && !panel.hidden;

export async function toggle(force) {
  const want = force ?? !isOpen();
  if (!want) return close();
  if (!panel) {
    button.classList.add("is-loading");
    try { ({ GROUPS: groups } = await import("./emoji-groups.js")); } finally { button.classList.remove("is-loading"); }
    build();
  }
  drawRecent();
  panel.hidden = false;
  button.classList.add("is-on");
  requestAnimationFrame(() => panel.classList.add("is-open"));
  if (!matchMedia("(pointer: coarse)").matches) setTimeout(() => panel.querySelector(".emo__search").focus({ preventScroll: true }), 60);
  setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
}

export function close() {
  if (!isOpen()) return;
  panel.classList.remove("is-open");
  button.classList.remove("is-on");
  document.removeEventListener("pointerdown", outside, true);
  const p = panel;
  setTimeout(() => { if (!p.classList.contains("is-open")) p.hidden = true; }, 180);
}

function outside(e) {
  if (panel.contains(e.target) || button.contains(e.target)) return;
  close();
}

// ------------------------------------------------------------------ building

const withTone = (item, t = tone) => (t && item.tone ? addTone(item.e, TONES[t - 1]) : item.e);
const firstName = (item) => item.names.split(" ")[0];
const glyph = (e) => h("span", { class: "emo__g" }, ...emojiNodes(e));

let scroller, rail, foot, search, recentSec, resultSec, toneBtn, toneMenu;

function build() {
  flat = [];
  for (const g of groups) g.start = flat.push(...g.items.map(([e, names, t]) => ({ e, names, tone: !!t, group: g.id }))) - g.items.length;

  search = h("input", { class: "emo__search", type: "search", placeholder: "Find the perfect emoji", "aria-label": "Search emoji", autocomplete: "off", spellcheck: "false",
    oninput: () => runSearch(), onkeydown: (e) => {
      if (e.key === "Enter") { e.preventDefault(); const b = resultSec.querySelector(".emo__e"); if (b) pickFrom(b, e.shiftKey); }
    } });
  toneBtn = h("button", { class: "emo__tone", type: "button", title: "Skin tone", "aria-label": "Skin tone", onclick: () => { toneMenu.hidden = !toneMenu.hidden; } });
  toneMenu = h("div", { class: "emo__tones", hidden: true }, ...[0, 1, 2, 3, 4, 5].map((t) =>
    h("button", { class: "emo__tonepick", type: "button", "aria-label": t ? `Skin tone ${t}` : "Default", onclick: () => setTone(t) }, glyph(t ? addTone("👏", TONES[t - 1]) : "👏"))));
  paintToneBtn();

  recentSec = section("recent", "Frequently used", "🕘", []);
  resultSec = h("section", { class: "emo__sec", hidden: true }, h("p", { class: "emo__head is-static" }, "Search results"), h("div", { class: "emo__grid" }));
  scroller = h("div", { class: "emo__scroll" }, resultSec, recentSec, ...groups.map((g) => section(g.id, g.name, g.icon, g.items.map((_, i) => g.start + i))));
  rail = h("nav", { class: "emo__rail", "aria-label": "Categories" },
    ...[{ id: "recent", icon: "🕘", name: "Frequently used" }, ...groups].map((g) =>
      h("button", { class: "emo__cat", type: "button", title: g.name, "aria-label": g.name, "data-sec": g.id, onclick: () => jump(g.id) }, glyph(g.icon))));
  foot = h("div", { class: "emo__foot" }, h("span", { class: "emo__big" }), h("b", { class: "emo__name" }, ""));

  panel = h("div", { class: "emo", role: "dialog", "aria-label": "Emoji", hidden: true },
    h("div", { class: "emo__top" }, h("span", { class: "emo__lens", "aria-hidden": "true" }), search, h("div", { class: "emo__tonewrap" }, toneBtn, toneMenu)),
    h("div", { class: "emo__main" }, rail, scroller),
    foot);
  host.append(panel);

  // One set of listeners for the whole grid.
  scroller.addEventListener("click", (e) => {
    const b = e.target.closest(".emo__e");
    if (b) return pickFrom(b, e.shiftKey);
    const head = e.target.closest(".emo__head:not(.is-static)");
    if (head) toggleSection(head.parentElement);
  });
  scroller.addEventListener("pointerover", (e) => { const b = e.target.closest(".emo__e"); if (b) preview(b); });
  scroller.addEventListener("focusin", (e) => { const b = e.target.closest(".emo__e"); if (b) preview(b); });
  scroller.addEventListener("scroll", () => { if (!spyQueued) { spyQueued = true; requestAnimationFrame(spy); } }, { passive: true });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); input.focus({ preventScroll: true }); }
    else if (e.key.startsWith("Arrow") && e.target.classList.contains("emo__e")) arrows(e);
  });
  preview(null);
  spy();
}

function section(id, name, icon, indexes) {
  const sec = h("section", { class: "emo__sec" + (collapsed.has(id) ? " is-collapsed" : ""), "data-sec": id },
    h("button", { class: "emo__head", type: "button", "aria-expanded": !collapsed.has(id) }, h("span", { class: "emo__hicon" }, glyph(icon)), name, h("span", { class: "emo__chev", "aria-hidden": "true" })),
    h("div", { class: "emo__grid" }, ...indexes.map(cell)));
  return sec;
}

function cell(i) {
  const item = flat[i];
  return h("button", { class: "emo__e", type: "button", "data-i": i, "aria-label": ":" + firstName(item) + ":" }, glyph(withTone(item)));
}

/** Folds a section's grid shut, or open, by animating its height (the grid
 *  is display: none while collapsed, so CSS alone can't tween it). */
function toggleSection(sec) {
  const id = sec.dataset.sec;
  const grid = sec.querySelector(".emo__grid");
  const on = sec.classList.contains("is-collapsed");
  grid.getAnimations().forEach((a) => a.cancel());
  // Only the part you can see is animated: a big group (People is thousands
  // of pixels) would otherwise rush past in a blur.
  const cap = Math.max(120, scroller.clientHeight);
  const from = on ? 0 : Math.min(cap, grid.offsetHeight);
  sec.classList.toggle("is-collapsed", !on);
  if (on) sec.classList.add("is-opening");
  const to = on ? Math.min(cap, grid.offsetHeight) : 0;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && sec.offsetParent) {
    if (!on) sec.classList.add("is-closing"); // keep it drawn while it folds away
    const fold = grid.animate([
      { height: from + "px", opacity: on ? 0 : 1, transform: on ? "translateY(-4px)" : "none" },
      { height: to + "px", opacity: on ? 1 : 0, transform: on ? "none" : "translateY(-4px)" },
    ], { duration: Math.min(320, 160 + Math.abs(to - from) * 0.25), easing: "cubic-bezier(.32,.72,0,1)" });
    fold.onfinish = fold.oncancel = () => sec.classList.remove("is-closing", "is-opening");
  } else sec.classList.remove("is-opening");
  sec.querySelector(".emo__head").setAttribute("aria-expanded", on);
  if (on) collapsed.delete(id); else collapsed.add(id);
  store.set("db:emoji:collapsed", [...collapsed]);
}

// ------------------------------------------------------------------ using it

function pickFrom(b, keepOpen) {
  const item = flat[Number(b.dataset.i)];
  const e = withTone(item);
  // Into the message, where the cursor is.
  const at = input.selectionStart ?? input.value.length, to = input.selectionEnd ?? at;
  if ((input.value.length - (to - at) + e.length) > Number(input.maxLength || 200)) { sound("error"); return; }
  input.setRangeText(e, at, to, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  remember(Number(b.dataset.i));
  b.classList.remove("is-picked"); void b.offsetWidth; b.classList.add("is-picked");
  // A plain click closes the menu; Shift keeps it open for more (like Discord).
  if (!keepOpen) { close(); if (!matchMedia("(pointer: coarse)").matches) input.focus({ preventScroll: true }); }
}

function remember(i) {
  const counts = store.get("db:emoji:recent") || {};
  counts[i] = (counts[i] || 0) + 1;
  store.set("db:emoji:recent", counts);
}

function drawRecent() {
  const counts = store.get("db:emoji:recent") || {};
  const top = Object.entries(counts).filter(([i]) => flat[i]).sort((a, b) => b[1] - a[1]).slice(0, RECENT_MAX).map(([i]) => Number(i));
  recentSec.hidden = !top.length;
  rail.querySelector('[data-sec="recent"]').hidden = !top.length;
  recentSec.querySelector(".emo__grid").replaceChildren(...top.map(cell));
}

function preview(b) {
  const item = b ? flat[Number(b.dataset.i)] : flat[0];
  foot.querySelector(".emo__big").replaceChildren(glyph(withTone(item)));
  foot.querySelector(".emo__name").textContent = ":" + firstName(item) + ":";
}

function setTone(t) {
  tone = t;
  store.set("db:emoji:tone", t);
  toneMenu.hidden = true;
  paintToneBtn();
  // Redraw only the emoji that take a skin tone.
  for (const b of scroller.querySelectorAll(".emo__e")) {
    const item = flat[Number(b.dataset.i)];
    if (item.tone) b.replaceChildren(glyph(withTone(item)));
  }
}
function paintToneBtn() { toneBtn.replaceChildren(glyph(tone ? addTone("👏", TONES[tone - 1]) : "👏")); }

// Search every name ("joy", "face_with_tears_of_joy"…); names that start with it first.
function runSearch() {
  const q = search.value.trim().toLowerCase().replace(/\s+/g, "_").replace(/^:|:$/g, "");
  const searching = !!q;
  resultSec.hidden = !searching;
  for (const s of scroller.querySelectorAll(".emo__sec[data-sec]")) s.classList.toggle("is-searching", searching);
  rail.classList.toggle("is-searching", searching);
  if (!searching) { scroller.scrollTop = 0; return; }
  const starts = [], has = [];
  for (let i = 0; i < flat.length && starts.length < 150; i++) {
    const names = flat[i].names.split(" ");
    if (names.some((n) => n.startsWith(q))) starts.push(i);
    else if (names.some((n) => n.includes(q))) has.push(i);
  }
  const found = [...starts, ...has].slice(0, 150);
  const grid = resultSec.querySelector(".emo__grid");
  grid.replaceChildren(...found.map(cell));
  if (!found.length) grid.replaceChildren(h("p", { class: "emo__none" }, "No emoji found. Try “cat”. Everyone loves cats."));
  else preview(grid.firstChild);
  scroller.scrollTop = 0;
}

function jump(id) {
  if (search.value) { search.value = ""; runSearch(); }
  const sec = scroller.querySelector(`.emo__sec[data-sec="${id}"]`);
  if (sec) scroller.scrollTo({ top: sec.offsetTop, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

// The category you're looking at lights up on the side.
let spyQueued = false;
function spy() {
  spyQueued = false;
  const top = scroller.scrollTop + 8; // sections are measured from the top of the scroller
  let current = null;
  for (const s of scroller.querySelectorAll(".emo__sec[data-sec]")) if (!s.hidden && s.offsetTop <= top) current = s.dataset.sec;
  current ||= scroller.querySelector(".emo__sec[data-sec]:not([hidden])")?.dataset.sec;
  for (const b of rail.children) b.classList.toggle("is-on", b.dataset.sec === current);
}

// Arrow keys move around the grid.
function arrows(e) {
  const all = [...scroller.querySelectorAll(".emo__sec:not([hidden]):not(.is-collapsed):not(.is-searching) .emo__e")];
  const i = all.indexOf(e.target);
  const grid = e.target.parentElement;
  const cols = Math.max(1, Math.round(grid.clientWidth / e.target.offsetWidth));
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
  const next = all[Math.max(0, Math.min(all.length - 1, i + step))];
  if (next) { e.preventDefault(); next.focus(); next.scrollIntoView({ block: "nearest" }); }
}
