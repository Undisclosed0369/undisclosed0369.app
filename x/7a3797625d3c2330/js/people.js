// Names as people (Phase 6A): locking your own name with a 4-digit PIN,
// and the leader's Players & bans list.
//
// Everything goes over the room connection; the server checks who may do
// what. This module only draws the screens and remembers this device's
// passes (one per locked name it has unlocked).

import { h } from "./sheets.js";
import { avatar } from "./table.js";
import { sound } from "./fx.js";
import { setPicOf } from "./pictures.js";
import { nameKey as key, store } from "./util.js";

let ctx = null;
/** ctx: { overlay(key, el), closeOverlay(), overlayKey(), send(msg), me() -> player, leader() -> bool, toast(text, opts), openProfile(name, opts) } */
export function initPeople(c) { ctx = c; }

// ------------------------------------------------------------------ this device's passes

export const passFor = (name) => store.get("db:pass:" + key(name));
export function rememberPass(name, pass) { if (name && pass) store.set("db:pass:" + key(name), pass); }
export function forgetPass(name) { store.del("db:pass:" + key(name)); }

// ------------------------------------------------------------------ the 4-digit field

/** Plain digits from whatever was typed or pasted (full-width ones too). */
export const digits = (v) => String(v).normalize("NFKC").replace(/[^0-9]/g, "");

/**
 * Four real number boxes, like a phone's passcode: type and it moves on,
 * Backspace goes back, arrows move, paste fills them all. Each digit shows
 * for a moment, then hides behind a dot. Each box is a proper input with
 * the number pad, so every keyboard (iPhone, Android, desktop) types into it.
 */
export function pinInput(onEnter, { onComplete } = {}) {
  const boxes = [0, 1, 2, 3].map((i) => h("input", { class: "word__cell", type: "text", maxlength: 4, autocomplete: "off",
    inputmode: "numeric", pattern: "[0-9]*", spellcheck: "false", "aria-label": `Digit ${i + 1} of 4`, enterkeyhint: i === 3 ? "done" : "next" }));
  const box = h("div", { class: "word", role: "group", "aria-label": "PIN, 4 digits" }, ...boxes);
  const hideLater = (b) => { clearTimeout(b.hideTimer); b.classList.remove("is-hidden"); b.hideTimer = setTimeout(() => b.classList.add("is-hidden"), 700); };
  const fill = (from, text) => {
    // Spread what was typed or pasted across this box and the ones after it.
    const chars = [...digits(text)];
    let i = from;
    for (const ch of chars) { if (i > 3) break; boxes[i].value = ch; hideLater(boxes[i]); i++; }
    paint();
    boxes[Math.min(i, 3)].focus();
    if (onComplete && box.value().length === 4) onComplete(box.value());
  };
  const paint = () => boxes.forEach((b) => { b.classList.toggle("is-filled", !!b.value); if (!b.value) b.classList.remove("is-hidden"); });
  boxes.forEach((b, i) => {
    b.addEventListener("input", (e) => {
      if (e.isComposing) return; // let the keyboard finish first
      const v = b.value;
      if (!v) { paint(); return; }
      b.value = "";
      fill(i, v);
      sound("notch");
    });
    b.addEventListener("compositionend", () => { const v = b.value; b.value = ""; fill(i, v); });
    b.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); onEnter?.(); }
      else if (e.key === "Backspace" && !b.value && i > 0) { e.preventDefault(); boxes[i - 1].value = ""; boxes[i - 1].focus(); paint(); }
      else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
      else if (e.key === "ArrowRight" && i < 3) { e.preventDefault(); boxes[i + 1].focus(); }
    });
    b.addEventListener("paste", (e) => { e.preventDefault(); fill(i, e.clipboardData?.getData("text") || ""); });
    b.addEventListener("focus", () => b.select());
  });
  box.value = () => boxes.map((b) => b.value).join("");
  box.clear = () => { boxes.forEach((b) => { b.value = ""; }); paint(); };
  box.disable = (off) => boxes.forEach((b) => { b.disabled = off; });
  box.focus = () => setTimeout(() => (boxes.find((b) => !b.value) || boxes[3]).focus({ preventScroll: true }), 350);
  box.shake = () => { box.classList.remove("is-wrong"); void box.offsetWidth; box.classList.add("is-wrong"); };
  return box;
}

// ------------------------------------------------------------------ locking your name

let lockView = null; // { name, fail } while the lock screen is open
let locked = false;

/** The server told us whether our name is locked (and maybe gave a pass). */
export function nameStatus(m) {
  if (m.pass) rememberPass(m.name, m.pass);
  if (m.changed && !m.locked) forgetPass(m.name);
  locked = !!m.locked;
  if (lockView && m.changed) lockDone(m.locked);
  for (const id of ["lobby-lock"]) document.getElementById(id)?.classList.toggle("is-on", locked);
}
export const isLocked = () => locked;

export function openLock() {
  const me = ctx.me();
  if (!me) return;
  lockView = { name: me.name };
  const view = h("div", { class: "lockv" });
  ctx.overlay("lock", view);
  drawLock(view, locked ? "locked" : "new");
}

function drawLock(view, mode) {
  const name = lockView.name;
  const msg = h("p", { class: "lockv__msg", "aria-live": "polite" });
  const send = () => {
    const pin = code.value();
    if (pin.length !== 4) { code.shake(); msg.textContent = "Four digits, please. No more, no less."; sound("error"); return; }
    msg.textContent = "";
    ctx.send({ t: "lockName", word: pin, pass: passFor(name) });
  };
  const code = pinInput(send);
  lockView.fail = (text) => { code.shake(); msg.textContent = text; sound("error"); };

  const hero = h("div", { class: "lockv__hero" },
    h("div", { class: "lockv__icon" + (mode === "locked" ? " is-locked" : "") }, mode === "locked" ? "🔒" : "🔓"),
    h("h2", { class: "lockv__title" }, mode === "locked" ? `${name} is locked` : `Lock “${name}”`),
    h("p", { class: "lockv__sub" }, mode === "locked"
      ? "Nobody can sit down as you without the PIN. You'll be asked for it each time you join a room."
      : "Pick a 4-digit PIN. Anyone using your name on another device will need it. Your stats stay yours."));

  if (mode === "locked") {
    view.replaceChildren(hero, h("div", { class: "tiles lockv__tiles" },
      tile("✏️", "Change the PIN", "Every other device will need the new one", () => drawLock(view, "change")),
      tile("🔓", "Remove the lock", "Anyone can use this name again", () => {
        ctx.send({ t: "unlockName", pass: passFor(name) });
      }, true)));
    return;
  }
  view.replaceChildren(hero, h("div", { class: "lockv__form" },
    code, msg,
    h("div", { class: "lockv__buttons" },
      mode === "change" ? h("button", { class: "btn btn--quiet btn--big", type: "button", onclick: () => drawLock(view, "locked") }, h("span", {}, "Never mind")) : null,
      h("button", { class: "btn btn--primary btn--big", type: "button", "data-default": true, onclick: send },
        h("span", {}, mode === "change" ? "Change it" : "Lock my name"))),
    h("p", { class: "lockv__hint" }, "Numbers only. Not 1234, we beg you. Five wrong guesses lock the name for 10 minutes.")));
  code.focus();
}

function lockDone(isNowLocked) {
  const view = document.querySelector(".lockv");
  if (!view) return;
  if (isNowLocked) sound("complete");
  view.replaceChildren(h("div", { class: "lockv__done" },
    h("div", { class: "lockv__check" }, isNowLocked ? "🔒" : "🔓"),
    h("h2", { class: "lockv__title" }, isNowLocked ? "Locked!" : "Unlocked"),
    h("p", { class: "lockv__sub" }, isNowLocked ? "Your name is yours. Next time you join a room, have the PIN ready." : "Anyone can use this name again.")));
  setTimeout(() => { if (ctx.overlayKey() === "lock") ctx.closeOverlay(); lockView = null; }, 1600);
}

/** An error from the server while the lock screen is open. */
export function lockError(text) {
  if (!lockView?.fail) return false;
  lockView.fail(text);
  return true;
}

export const lockOpen = () => ctx.overlayKey() === "lock";

function tile(icon, label, small, onClick, danger = false) {
  return h("button", { class: "tile tile--row" + (danger ? " tile--danger" : ""), type: "button", onclick: () => { onClick(); } },
    h("span", { class: "tile__icon" }, icon),
    h("span", {}, label, h("small", { style: { display: "block", marginTop: ".2rem" } }, small)));
}

// ------------------------------------------------------------------ the leader's players & bans

let dirView = null; // { tab, query, sort, profiles, root }

/** keep: the tab, search and sort to come back to (from a profile's "← Back"). */
export function openDirectory(keep = null) {
  dirView = { tab: "players", query: "", sort: "last", ...keep, profiles: null, confirm: null };
  const root = h("div", { class: "dirv" });
  dirView.root = root;
  ctx.overlay("directory", root);
  drawDirectory();
  ctx.send({ t: "directory" });
}

export function directory(profiles) {
  if (!dirView || ctx.overlayKey() !== "directory") return;
  const first = dirView.profiles === null;
  for (const p of profiles) setPicOf(p.name, p.pic);
  dirView.profiles = profiles;
  dirView.confirm = null;
  drawDirectory(!first); // after an action: update in place, no entrance replay
}

const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

/** quiet: redraw without replaying the rows' entrance (after searching or an action). */
function drawDirectory(quiet = false) {
  const v = dirView;
  const all = v.profiles || [];
  const banned = all.filter((p) => p.banned);
  const games = (p) => p.stats?.overall?.games || 0, wins = (p) => p.stats?.overall?.wins || 0;
  const rate = (p) => (games(p) ? wins(p) / games(p) : -1);
  const SORTS = { last: (a, b) => b.last - a.last, games: (a, b) => games(b) - games(a) || b.last - a.last,
    wins: (a, b) => wins(b) - wins(a) || b.last - a.last, rate: (a, b) => rate(b) - rate(a) || games(b) - games(a) };
  const list = (v.tab === "bans" ? banned : all).filter((p) => !v.query || p.key.includes(v.query.toLowerCase())).sort(SORTS[v.sort] || SORTS.last);
  const me = ctx.me();

  const search = h("input", { class: "dirv__search", type: "search", placeholder: "Find a suspect…", value: v.query, "aria-label": "Search names",
    oninput: (e) => { v.query = e.target.value; const pos = e.target.selectionStart; drawDirectory(true); const s = v.root.querySelector(".dirv__search"); s.focus(); s.setSelectionRange(pos, pos); } });
  const tab = (id, label, n) => h("button", { class: "dirv__tab" + (v.tab === id ? " is-on" : ""), type: "button", role: "tab", "aria-selected": v.tab === id,
    onclick: () => { v.tab = id; v.confirm = null; drawDirectory(); } }, label, h("span", { class: "dirv__count" }, n));

  // A row's buttons, or its "are you sure?". Swapped in place on that row only.
  const ASK = { ban: "Ban {n}?", unban: "Unban {n}?", removeLock: "Remove the lock?", deleteProfile: "Delete {n} for good?" };
  const YES = { ban: "is-bad", unban: "is-good", removeLock: "is-gold", deleteProfile: "is-bad" };
  const actionsFor = (p, isMe, confirming) => {
    const wrap = h("div", { class: "dirv__actions" + (confirming ? " is-confirming" : "") });
    const set = (c) => { const next = actionsFor(p, isMe, c); wrap.replaceWith(next); };
    const act = (action, label, cls) => h("button", { class: "dirv__act " + cls, type: "button", onclick: () => set(action) }, label);
    if (confirming) {
      wrap.append(
        h("span", { class: "dirv__ask" }, ASK[confirming].replace("{n}", p.name)),
        h("button", { class: "dirv__act is-plain", type: "button", onclick: () => set(null) }, "No"),
        h("button", { class: "dirv__act is-yes " + YES[confirming], type: "button",
          onclick: (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = "…"; ctx.send({ t: confirming, name: p.name }); sound("swap"); } }, "Yes"));
    } else {
      if (p.locked) wrap.append(act("removeLock", "Unlock", "is-gold"));
      if (!isMe) wrap.append(p.banned ? act("unban", "Unban", "is-good") : act("ban", "Ban", "is-bad"), act("deleteProfile", "Delete", "is-bad-soft"));
    }
    return wrap;
  };

  // Tap a row (not its buttons) for that player's full stats; "← Back" returns here as it was.
  const openRow = (p) => ctx.openProfile(p.name, { back: () => openDirectory({ tab: v.tab, query: v.query, sort: v.sort }), backLabel: "Players & bans" });
  const statLine = (p) => games(p) ? `${games(p)} game${games(p) === 1 ? "" : "s"} · ${wins(p)} win${wins(p) === 1 ? "" : "s"} · ${Math.round((wins(p) / games(p)) * 100)}%` : "No games yet";
  const row = (p, i) => {
    const isMe = me && p.key === me.name.trim().replace(/\s+/g, " ").toLowerCase();
    return h("li", { class: "dirv__row is-tappable" + (p.banned ? " is-banned" : ""), style: { animationDelay: Math.min(i, 14) * 25 + "ms" },
      onclick: (e) => { if (!e.target.closest("button")) openRow(p); } },
      avatar(p.name, { online: false }),
      h("div", { class: "dirv__who" },
        h("span", { class: "dirv__name" }, p.name, isMe ? h("span", { class: "dirv__badge is-you" }, "You") : null,
          p.locked ? h("span", { class: "dirv__badge" }, "🔒 Locked") : null,
          p.banned ? h("span", { class: "dirv__badge is-bad" }, "Banned") : null),
        h("span", { class: "dirv__meta" },
          p.banned ? `Banned ${ago(p.banned.at)}${p.banned.room ? ` in ${p.banned.room}` : ""}${p.banned.reason ? ` · “${p.banned.reason}”` : ""}`
            : `${statLine(p)} · last seen ${ago(p.last)} · ${p.rooms} room${p.rooms === 1 ? "" : "s"}`)),
      actionsFor(p, isMe, null));
  };

  v.root.replaceChildren(
    h("header", { class: "dirv__head" },
      h("p", { class: "kicker" }, "Leader only"),
      h("h2", { class: "menu__title" }, "Players & bans"),
      h("p", { class: "dirv__sub" }, "All Players. You see everything. Use this power wisely. Or don't. Tap anyone for their stats.")),
    h("div", { class: "dirv__bar" },
      h("div", { class: "dirv__tabs", role: "tablist" }, tab("players", "Players", all.length), tab("bans", "Banned", banned.length)),
      search),
    h("div", { class: "dirv__sorts", role: "group", "aria-label": "Sort by" }, h("span", {}, "Sort"),
      ...[["last", "Last played"], ["games", "Games"], ["wins", "Wins"], ["rate", "Win rate"]].map(([id, label]) =>
        h("button", { class: "dirv__sort" + (v.sort === id ? " is-on" : ""), type: "button", "aria-pressed": v.sort === id,
          onclick: () => { v.sort = id; drawDirectory(true); } }, label))),
    v.profiles === null
      ? h("div", { class: "dirv__empty" }, h("div", { class: "spinner" }), "Fetching everyone…")
      : list.length
        ? h("ul", { class: "dirv__list" + (quiet ? " is-quiet" : "") }, ...list.map(row))
        : h("div", { class: "dirv__empty" }, v.tab === "bans" ? "Nobody's banned. A peaceful kingdom." : v.query ? "Nobody by that name. Yet." : "Nobody yet. Go recruit."));
}
