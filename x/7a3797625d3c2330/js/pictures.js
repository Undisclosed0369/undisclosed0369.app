// Profile pictures (Phase 6D+): a picture belongs to a name, like its stats.
//
// Three kinds, each with an optional ring around it:
//   { k: "p", id }               a built-in (a property color and an emoji)
//   { k: "e", e, c1, c2 }        any emoji on any two-color gradient
//   { k: "f", v, gif, w, h, fx, fy, s }  your own photo or GIF
//
// Photos are framed on this device. The server keeps a sharp 384 px still of
// the circle ("thumb", for avatars) and the original ("full", for the
// full-size view and for GIFs), under a random version; browsers cache both
// for good. A GIF shows its still frame until it's worth watching: on the
// seat of the player whose turn it is, under the mouse, and on their
// full-screen view and stats.
//
// Every avatar on screen asks picOf(name), so the lobby, seats, chat, menu,
// results and stats all show the picture without knowing about it.

import { h } from "./sheets.js";
import { sound } from "./fx.js";
import { SERVER } from "./net.js";
import { COLORS } from "../engine/deck.js";
import { appleImage, emojiNodes } from "./richtext.js";
import { nameKey as key } from "./util.js";

const shade = (hex, to = "#ffffff", k = .35) => {
  const p = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const [a, b] = [p(hex), p(to)];
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, "0")).join("");
};
const prop = (c, k) => [COLORS[c].hex, shade(COLORS[c].hex, "#ffffff", k)];

/** The built-ins: property colors from the deck, each with its own emoji. */
export const PRESETS = [
  { id: "tycoon", emoji: "🎩", label: "Tycoon", colors: ["#2a2340", "#8d42f5"] },
  { id: "boardwalk", emoji: "💎", label: "Boardwalk", colors: prop("darkblue", .45) },
  { id: "house", emoji: "🏠", label: "House", colors: prop("green", .4) },
  { id: "hotel", emoji: "🏨", label: "Hotel", colors: prop("red", .35) },
  { id: "birthday", emoji: "🎂", label: "Birthday", colors: prop("magenta", .4) },
  { id: "sly", emoji: "🕵️", label: "Sly Deal", colors: prop("orange", .35) },
  { id: "debt", emoji: "💼", label: "Debt Collector", colors: prop("brown", .4) },
  { id: "railroad", emoji: "🚂", label: "Railroad", colors: ["#232323", "#5b5b66"] },
  { id: "electric", emoji: "💡", label: "Electric Co.", colors: [shade(COLORS.yellow.hex, "#f5a142", .35), COLORS.yellow.hex] },
  { id: "water", emoji: "💧", label: "Water Works", colors: [shade(COLORS.lightblue.hex, "#42a1f5", .45), COLORS.lightblue.hex] },
  { id: "money", emoji: "💰", label: "Cash", colors: [shade(COLORS.mint.hex, "#1f9e4d", .55), COLORS.mint.hex] },
  { id: "crown", emoji: "👑", label: "Winner", colors: ["#f5a142", "#ffcf6b"] },
  { id: "no", emoji: "✋", label: "Just Say No", colors: ["#ff453a", "#ff8a84"] },
  { id: "breaker", emoji: "💥", label: "Deal Breaker", colors: ["#8d42f5", "#e042f5"] },
  { id: "dice", emoji: "🎲", label: "Lucky", colors: ["#42a1f5", "#42e0f5"] },
  { id: "rocket", emoji: "🚀", label: "Pass Go", colors: ["#2fbf71", "#42e0f5"] },
];
const PRESET = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

/** Backgrounds for an emoji picture (or pick your own two colors). */
export const SWATCHES = [
  ["#8d42f5", "#e042f5"], ["#42a1f5", "#42e0f5"], ["#2fbf71", "#42e0f5"], ["#f5a142", "#ffcf6b"],
  ["#ff453a", "#ff8a84"], ["#ff2d6f", "#ff8ab3"], ...["darkblue", "green", "red", "orange", "brown", "magenta"].map((c) => prop(c, .4)),
  ["#232323", "#5b5b66"], ["#f2f2f7", "#c7c7cc"],
];

/** Rings around any picture. */
export const RINGS = [
  { id: null, label: "None" }, { id: "gold", label: "Gold" }, { id: "brand", label: "Neon" }, { id: "rainbow", label: "Rainbow" },
  { id: "fire", label: "Fire" }, { id: "ice", label: "Ice" }, { id: "mint", label: "Mint" }, { id: "rose", label: "Rose" }, { id: "mono", label: "Silver" },
];

// ------------------------------------------------------------------ who has what

const pics = new Map(); // name key -> picture

/** Learn a name's picture (from a room, a list or a profile). null clears it. */
export function setPicOf(name, pic) {
  if (!name) return;
  if (pic && pic.k) pics.set(key(name), pic); else pics.delete(key(name));
}
export const picOf = (name) => pics.get(key(name)) || null;

const imgUrl = (v, which) => `${SERVER}/api/pics/${v}/${which}`;

/**
 * How to draw a picture: { emoji, src, colors } for a built-in or an emoji,
 * { thumb, full, gif, crop } for a photo; ring on both. null for none.
 */
export function picArt(name, pic = picOf(name)) {
  if (!pic?.k) return null;
  const ring = pic.ring || null;
  if (pic.k === "p") {
    const p = PRESET[pic.id];
    return p ? { emoji: p.emoji, src: appleImage(p.emoji), colors: p.colors, ring } : null;
  }
  if (pic.k === "e") return { emoji: pic.e, src: appleImage(pic.e), colors: [pic.c1, pic.c2], ring };
  if (pic.k === "f") {
    // A photo not uploaded yet (being chosen) carries its own local addresses.
    const thumb = pic.local?.thumb || imgUrl(pic.v, "t"), full = pic.local?.full || imgUrl(pic.v, "f");
    const m = Math.min(pic.w, pic.h);
    return { photo: true, thumb, full, gif: !!pic.gif, ring,
      crop: { iw: (pic.w / m) * pic.s, ih: (pic.h / m) * pic.s, fx: pic.fx, fy: pic.fy } };
  }
  return null;
}

/** The inside of an avatar for a picture (the avatar itself is drawn in table.js). */
export function picContent(art) {
  if (art.photo) return h("span", { class: "avatar__clip" }, h("img", { class: "avatar__img", src: art.thumb, alt: "", draggable: "false", decoding: "async" }));
  return art.src ? h("img", { class: "avatar__emoji", src: art.src, alt: "", draggable: "false", decoding: "async" }) : h("span", { class: "avatar__emoji" }, art.emoji);
}

/**
 * Play (or stop) a GIF avatar. The animated original is only fetched the
 * first time it's needed, and sits over the still, cropped the same way.
 */
export function animate(el, on) {
  const art = el?._art;
  if (!art?.gif) return;
  if (on) {
    let anim = el.querySelector(".avatar__anim");
    if (!anim) {
      const c = art.crop;
      anim = h("img", { class: "avatar__anim", src: art.full, alt: "", draggable: "false", decoding: "async",
        style: { "--iw": c.iw, "--ih": c.ih, "--fx": c.fx, "--fy": c.fy } });
      anim.addEventListener("load", () => anim.classList.add("is-ready"), { once: true });
      el.querySelector(".avatar__clip").append(anim);
    }
  }
  el.classList.toggle("is-anim", on);
}

// GIFs play under the mouse, wherever they are: on the picture itself, or
// anywhere on the row or seat that carries it (a lobby seat, a seat at the
// table, the menu's player list, results, Players & bans, a chat message).
const HOSTS = ".seat, .oseat, .who__row, .standing, .dirv__row, .msg";
function hovered(target) {
  const host = target?.closest?.(HOSTS);
  const el = host?.querySelector(".avatar--gif") || target?.closest?.(".avatar--gif");
  return el ? { el, area: host || el } : null;
}
addEventListener("pointerover", (e) => {
  const hit = hovered(e.target);
  if (hit && !hit.area.contains(e.relatedTarget)) animate(hit.el, true);
});
addEventListener("pointerout", (e) => {
  const hit = hovered(e.target);
  if (hit && !hit.area.contains(e.relatedTarget) && !hit.el.dataset.keep) animate(hit.el, false);
});

// ------------------------------------------------------------------ the full-size view

/** Tap a big avatar (player view, stats) to see the picture at full size. */
export function viewable(el, name) {
  if (!el || !picOf(name)) return el;
  el.classList.add("is-viewable");
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", `See ${name}'s picture`);
  const go = (e) => { e.stopPropagation(); openFull(name); };
  el.addEventListener("click", go);
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); } });
  return el;
}

/** The picture as big as it really is, or as big as the screen allows, whichever is smaller. */
export function openFull(name) {
  const art = picArt(name);
  if (!art) return;
  let pic;
  if (art.photo) {
    pic = h("img", { class: "lightbox__img", src: art.full, alt: `${name}'s picture`, draggable: "false" });
    // Shown no bigger than it really is.
    pic.addEventListener("load", () => { pic.style.maxWidth = `min(${pic.naturalWidth}px, 92vw)`; pic.style.maxHeight = `min(${pic.naturalHeight}px, 82dvh)`; pic.classList.add("is-ready"); }, { once: true });
  } else {
    pic = h("div", { class: "lightbox__art", "data-ring": art.ring || null, style: { "--av": `linear-gradient(135deg, ${art.colors[0]}, ${art.colors[1]})` } }, h("span", {}, ...emojiNodes(art.emoji)));
  }
  const box = h("div", { class: "lightbox", role: "dialog", "aria-modal": "true", "aria-label": `${name}'s picture` },
    h("figure", { class: "lightbox__fig" }, pic, h("figcaption", {}, name)),
    h("button", { class: "icon-btn lightbox__close", type: "button", "aria-label": "Close",
      html: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>' }));
  const close = () => {
    removeEventListener("keydown", onKey, true);
    box.classList.add("is-out");
    setTimeout(() => box.remove(), 220);
  };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };
  box.addEventListener("click", close);
  addEventListener("keydown", onKey, true);
  document.body.append(box);
}

// ------------------------------------------------------------------ choosing yours

let ctx = null;
/** ctx: { overlay(key, el, opts), closeOverlay(), overlayKey(), send(msg), upload(body) -> Promise<{ ok, pic, error }>, me() -> player, toast(text, opts), avatar(name, opts) } */
export function initPictures(c) { ctx = c; }

let pv = null; // { name, current, choice, tab, back, crop, saving, emojiQuery }
const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

/** back: where "← Back" goes (the screen it was opened from). */
export function openPicker({ back = null, backLabel = "Back" } = {}) {
  const me = ctx.me();
  if (!me) return;
  const current = picOf(me.name);
  pv = { name: me.name, current, choice: current, tab: current?.k === "e" ? "emoji" : current?.k === "f" ? "photo" : "builtin",
    back, backLabel, root: h("div", { class: "picv" }), crop: null, saving: false, emojiQuery: "", urls: [] };
  ctx.overlay("picture", pv.root);
  draw();
}

/** The server saved it. */
export function saved(pic) {
  if (!pv || ctx.overlayKey() !== "picture") return;
  setPicOf(pv.name, pic);
  sound("complete");
  ctx.toast(pic ? "Looking good. Everyone sees it now." : "Picture removed. Back to the classic initial.");
  const back = pv.back;
  pv = null;
  if (back) back(); else ctx.closeOverlay();
}

/** The server said no: let them try again (the toast shows the reason). */
export function failed() {
  if (!pv || ctx.overlayKey() !== "picture") return false;
  pv.saving = false;
  draw();
  return false;
}

function preview(choice) {
  // The avatar as it'll look, at hero size (a GIF plays).
  const was = picOf(pv.name);
  setPicOf(pv.name, choice);
  const el = ctx.avatar(pv.name, { online: false, animate: true });
  setPicOf(pv.name, was);
  return el;
}

async function save() {
  const v = pv;
  if (v.saving) return;
  v.saving = true;
  draw();
  const c = v.choice;
  if (c?.k === "f" && c.local) {
    // A new photo or GIF goes over HTTP (it can be a few MB).
    const r = await ctx.upload({ ...c.upload, ring: c.ring || null }).catch(() => ({ error: "Can't reach the table. Check your connection and try again." }));
    if (pv !== v) return;
    if (r.ok) return saved(r.pic);
    ctx.toast(r.error || "That picture didn't work. Try another one.", { bad: true });
    sound("error");
    v.saving = false;
    return draw();
  }
  ctx.send({ t: "setPicture", pic: c ? strip(c) : null });
}
const strip = (c) => (c.k === "f" ? { k: "f", v: c.v, ring: c.ring || null } : { ...c, ring: c.ring || null });

function draw() {
  const v = pv;
  if (v.crop) return drawCrop();
  const top = v.back ? h("button", { class: "btn btn--quiet prof__back", type: "button", "data-back": true, onclick: () => { v.back(); } }, h("span", {}, `← ${v.backLabel}`)) : null;
  const changed = !same(v.choice, v.current);
  const tab = (id, label) => h("button", { class: "dirv__tab" + (v.tab === id ? " is-on" : ""), type: "button", role: "tab", "aria-selected": v.tab === id,
    onclick: () => { v.tab = id; draw(); } }, label);

  const body = v.tab === "builtin" ? builtins() : v.tab === "emoji" ? emojiMaker() : photoTab();

  v.root.replaceChildren(...[top,
    h("div", { class: "picv__hero" },
      h("div", { class: "prof__ring picv__ring" }, preview(v.choice)),
      h("div", {},
        h("p", { class: "kicker" }, "Your picture"),
        h("h2", { class: "prof__name" }, v.name),
        h("p", { class: "prof__meta" }, "Shows everywhere your name does: the table, the lobby, chat, results and stats."))),
    h("div", { class: "dirv__tabs picv__tabs", role: "tablist" }, tab("builtin", "Built-in"), tab("emoji", "Emoji"), tab("photo", "Photo or GIF")),
    body,
    v.choice ? rings() : null,
    h("div", { class: "picv__buttons" },
      v.current || v.choice ? h("button", { class: "btn btn--quiet btn--big", type: "button", disabled: !v.choice || null, onclick: () => { v.choice = null; draw(); } },
        h("span", {}, "Just my initial")) : null,
      h("button", { class: "btn btn--primary btn--big", type: "button", "data-default": true, disabled: !changed || v.saving || null, onclick: save },
        h("span", {}, v.saving ? (v.choice?.local ? `Uploading ${mb(v.choice.size)}…` : "Saving…") : "Save")))].filter(Boolean));
}
const mb = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB");

function builtins() {
  const v = pv;
  const on = v.choice?.k === "p" ? v.choice.id : null;
  return h("div", { class: "picv__grid", role: "radiogroup", "aria-label": "Built-in pictures" },
    ...PRESETS.map((p, i) => h("button", { class: "picv__opt" + (on === p.id ? " is-on" : ""), type: "button", role: "radio", "aria-checked": on === p.id,
      title: p.label, "aria-label": p.label, style: { "--av": `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})`, animationDelay: Math.min(i, 15) * 18 + "ms" },
      onclick: () => { v.choice = { k: "p", id: p.id, ring: v.choice?.ring || null }; draw(); } }, picContent({ emoji: p.emoji, src: appleImage(p.emoji) }))));
}

// Any emoji (searchable, from the chat's emoji menu list) on any colors.
let emojiList = null;
function emojiMaker() {
  const v = pv;
  const cur = v.choice?.k === "e" ? v.choice : null;
  const pickEmoji = (e) => { v.choice = { k: "e", e, c1: cur?.c1 || SWATCHES[0][0], c2: cur?.c2 || SWATCHES[0][1], ring: v.choice?.ring || null }; draw(); };
  const pickBg = (c1, c2) => { v.choice = { k: "e", e: cur?.e || "😎", c1, c2, ring: v.choice?.ring || null }; draw(); };
  const grid = h("div", { class: "picv__emoji" });
  const fill = () => {
    if (!emojiList) { grid.replaceChildren(h("div", { class: "spinner" })); return; }
    const q = v.emojiQuery.trim().toLowerCase().replace(/\s+/g, "_");
    const list = (q ? emojiList.filter((x) => x[1].split(" ").some((n) => n.includes(q))) : emojiList).slice(0, 120);
    grid.replaceChildren(...list.map(([e, names]) => h("button", { class: "emo__e" + (cur?.e === e ? " is-on" : ""), type: "button", title: ":" + names.split(" ")[0] + ":",
      onclick: () => pickEmoji(e) }, h("span", { class: "emo__g" }, ...emojiNodes(e)))));
    if (!list.length) grid.replaceChildren(h("p", { class: "emo__none" }, "No emoji by that name. Try “cat”."));
  };
  if (!emojiList) import("./emoji-groups.js").then(({ GROUPS }) => { emojiList = GROUPS.flatMap((g) => g.items); if (pv === v && v.tab === "emoji" && !v.crop) fill(); });
  fill();
  const search = h("input", { class: "emo__search picv__search", type: "search", placeholder: "Find an emoji", value: v.emojiQuery, "aria-label": "Search emoji",
    oninput: (e) => { v.emojiQuery = e.target.value; fill(); } });
  const color = (i) => h("input", { class: "picv__color", type: "color", value: (cur ? [cur.c1, cur.c2] : SWATCHES[0])[i], "aria-label": i ? "Second color" : "First color",
    onchange: (e) => { const c = cur ? [cur.c1, cur.c2] : [...SWATCHES[0]]; c[i] = e.target.value; pickBg(c[0], c[1]); } });
  return h("div", { class: "picv__maker" },
    h("div", { class: "picv__searchwrap" }, h("span", { class: "emo__lens", "aria-hidden": "true" }), search),
    grid,
    h("p", { class: "picv__label" }, "Background"),
    h("div", { class: "picv__swatches" },
      ...SWATCHES.map(([a, b]) => h("button", { class: "picv__swatch" + (cur && cur.c1 === a && cur.c2 === b ? " is-on" : ""), type: "button", "aria-label": "Background", style: { "--av": `linear-gradient(135deg, ${a}, ${b})` },
        onclick: () => pickBg(a, b) })),
      h("label", { class: "picv__custom", title: "Your own colors" }, color(0), color(1))));
}

function photoTab() {
  const v = pv;
  const file = h("input", { type: "file", accept: "image/*", hidden: true, onchange: (e) => { const f = e.target.files?.[0]; if (f) startCrop(f); } });
  return h("div", { class: "picv__more" },
    h("button", { class: "picv__wide", type: "button", onclick: () => file.click() }, h("span", { class: "picv__icon" }, "📷"),
      h("span", {}, v.choice?.k === "f" ? "Choose another photo or GIF" : "Choose a photo or GIF",
        h("small", {}, "Framed in a circle on this device. GIFs play on your turn, on hover and on your profile. Up to 5 MB."))), file);
}

function rings() {
  const v = pv;
  return h("div", { class: "picv__rings" }, h("p", { class: "picv__label" }, "Ring"),
    h("div", { class: "picv__ringrow" }, ...RINGS.map((r) => h("button", { class: "picv__ringopt" + ((v.choice.ring || null) === r.id ? " is-on" : ""), type: "button",
      "data-ring": r.id, onclick: () => { v.choice = { ...v.choice, ring: r.id }; draw(); } }, r.label))));
}

// ------------------------------------------------------------------ framing a photo

const THUMB = 384; // pixels kept for avatars: sharp at any size they're shown
const MAX_FULL = 5_000_000;
const KEEP_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function startCrop(file) {
  if (file.size > MAX_FULL && file.type === "image/gif") { ctx.toast("That GIF is too big. Up to 5 MB, please.", { bad: true }); sound("error"); return; }
  const url = URL.createObjectURL(file);
  pv.urls.push(url);
  const img = new Image();
  img.onload = () => {
    pv.crop = { img, url, file, zoom: 1, x: 0, y: 0 };
    draw();
  };
  img.onerror = () => ctx.toast("That file didn't open as a picture. Try a JPEG, PNG or GIF.", { bad: true });
  img.src = url;
}

const toB64 = (blob) => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = bad; r.readAsDataURL(blob); });
const canvasBlob = (canvas, type, q) => new Promise((ok) => canvas.toBlob(ok, type, q));

function drawCrop() {
  const v = pv, c = v.crop;
  const SIZE = innerHeight < 480 ? 170 : 240; // the circle on screen (smaller on a phone on its side)
  const W = c.img.naturalWidth, H = c.img.naturalHeight;
  const base = SIZE / Math.min(W, H); // fills the circle at zoom 1
  const pic = h("img", { class: "crop__img", src: c.url, alt: "", draggable: "false" });
  const stage = h("div", { class: "crop", style: { width: SIZE + "px", height: SIZE + "px" } }, pic, h("div", { class: "crop__ring" }));
  // Keep the photo covering the circle wherever it's dragged or zoomed.
  const clamp = () => {
    const s = base * c.zoom;
    const mx = Math.max(0, (W * s - SIZE) / 2), my = Math.max(0, (H * s - SIZE) / 2);
    c.x = Math.max(-mx, Math.min(mx, c.x));
    c.y = Math.max(-my, Math.min(my, c.y));
  };
  const place = () => {
    clamp();
    const s = base * c.zoom;
    pic.style.width = W * s + "px";
    pic.style.height = H * s + "px";
    pic.style.transform = `translate(calc(-50% + ${c.x}px), calc(-50% + ${c.y}px))`;
  };
  // Drag with a finger or the mouse; pinch or the wheel to zoom.
  const pts = new Map();
  let last = null;
  stage.addEventListener("pointerdown", (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = null; });
  stage.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (last) { c.zoom = Math.max(1, Math.min(6, c.zoom * d / last)); zoom.value = c.zoom; }
      last = d;
    } else { c.x += e.clientX - prev[0]; c.y += e.clientY - prev[1]; }
    place();
  });
  const up = (e) => { pts.delete(e.pointerId); last = null; };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  stage.addEventListener("wheel", (e) => { e.preventDefault(); c.zoom = Math.max(1, Math.min(6, c.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))); zoom.value = c.zoom; place(); }, { passive: false });
  const zoom = h("input", { class: "crop__zoom", type: "range", min: 1, max: 6, step: 0.01, value: c.zoom, "aria-label": "Zoom",
    oninput: (e) => { c.zoom = Number(e.target.value); place(); } });

  const use = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    // The avatar still: exactly what's inside the circle, at THUMB × THUMB.
    const s = base * c.zoom;
    const side = SIZE / s;
    const sx = W / 2 - c.x / s - side / 2, sy = H / 2 - c.y / s - side / 2;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = THUMB;
    const g = canvas.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(c.img, sx, sy, side, side, 0, 0, THUMB, THUMB);
    // WebP where the browser can make it (Safari can't, so JPEG there).
    let thumb = await canvasBlob(canvas, "image/webp", .9);
    if (!thumb || thumb.type !== "image/webp") thumb = await canvasBlob(canvas, "image/jpeg", .9);
    // The original, as it is (any photo up to 5 MB, any GIF); bigger or odd
    // formats are redrawn at up to 2560 px, still at high quality.
    let full = c.file;
    if (!KEEP_TYPES.includes(full.type) || full.size > MAX_FULL) {
      const k = Math.min(1, 2560 / Math.max(W, H));
      const big = document.createElement("canvas");
      big.width = Math.round(W * k); big.height = Math.round(H * k);
      big.getContext("2d").drawImage(c.img, 0, 0, big.width, big.height);
      full = await canvasBlob(big, "image/jpeg", .92);
    }
    const thumbUrl = URL.createObjectURL(thumb);
    v.urls.push(thumbUrl);
    const placeAt = { w: W, h: H, fx: c.x / SIZE, fy: c.y / SIZE, s: c.zoom };
    v.choice = { k: "f", gif: full.type === "image/gif", ...placeAt, ring: v.choice?.ring || null, local: { thumb: thumbUrl, full: c.url }, size: full.size,
      upload: { thumb: await toB64(thumb), thumbType: thumb.type, full: await toB64(full), type: full.type, ...placeAt } };
    v.crop = null;
    draw();
  };

  v.root.replaceChildren(
    h("button", { class: "btn btn--quiet prof__back", type: "button", "data-back": true, onclick: () => { v.crop = null; draw(); } }, h("span", {}, "← Pictures")),
    h("div", { class: "picv__hero picv__hero--crop" },
      h("p", { class: "kicker" }, c.file.type === "image/gif" ? "Your GIF" : "Your photo"),
      h("h2", { class: "prof__name" }, "Frame it"),
      h("p", { class: "prof__meta" }, "Drag to move, pinch or zoom to fit. Only the circle shows; tapping it shows the whole thing.")),
    stage,
    h("label", { class: "crop__bar" }, h("span", {}, "−"), zoom, h("span", {}, "+")),
    h("div", { class: "picv__buttons" },
      h("button", { class: "btn btn--quiet btn--big", type: "button", onclick: () => { v.crop = null; draw(); } }, h("span", {}, "Back")),
      h("button", { class: "btn btn--primary btn--big", type: "button", "data-default": true, onclick: use }, h("span", {}, "Use this"))));
  place();
}
