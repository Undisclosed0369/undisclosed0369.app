// Deal Breaker — the app: screens, joining and the connection, and turning
// server messages into what you see and hear. The lobby, the announcer, the
// menu and results, and full-screen overlays live in their own modules.

import { api, Connection } from "./net.js";
import { h, closeSheet, toast, openSheetKey, press, sinceSheet, cardSrc } from "./sheets.js";
import { DEF } from "../engine/rules.js";
import { renderTable, capture, animateFrom, dealIn, avatar } from "./table.js";
import * as play from "./play.js";
import * as chat from "./chat.js";
import { enableDrag } from "./drag.js";
import { dragScroll } from "./scroll.js";
import { whenClear } from "./spotlight.js";
import { sound, voice } from "./fx.js";
import { line } from "./lines.js";
import * as people from "./people.js";
import * as profile from "./profile.js";
import * as pictures from "./pictures.js";
import { $, store } from "./util.js";
import { S, G } from "./state.js";
import { overlay, closeOverlay, currentOverlay, overlayOpen, openRules } from "./overlay.js";
import { initLobby, renderLobby, playerMenu } from "./lobby.js";
import { announce, clearFeed, effects, announced } from "./announcer.js";
import { refreshMenu, showResults, closeResults } from "./menu.js";
import { wantMusic } from "./music.js";

const params = new URLSearchParams(location.search);
const leaderCode = (() => { try { return sessionStorage.getItem("door:code"); } catch { return null; } })();
const asLeader = params.has("lead") && !!leaderCode;

play.bind(G);
initLobby({ leave: (...a) => leave(...a) });

const peopleCtx = {
  overlay: (k, el, opts) => overlay(k, el, opts),
  closeOverlay: () => closeOverlay(),
  overlayKey: currentOverlay,
  send: (m) => S.conn?.send(m),
  me: () => S.room?.players.find((p) => p.id === S.me),
  leader: () => S.leader,
  toast,
};
people.initPeople({ ...peopleCtx, openProfile: (...a) => profile.openProfile(...a) });
profile.initProfile({ ...peopleCtx, openPicker: (...a) => pictures.openPicker(...a) });
pictures.initPictures({ ...peopleCtx, avatar,
  // A new photo or GIF goes over HTTP with this seat's token (too big for the socket).
  upload: (body) => api(`/api/rooms/${encodeURIComponent(S.roomCode)}/picture`, { token: store.get("db:session")?.token, ...body }) });

chat.initChat({
  me: () => S.me,
  room: () => S.room,
  send: (text) => S.conn?.send({ t: "chat", text }),
  react: (r) => S.conn?.send({ t: "react", r }),
  clear: () => S.conn?.send({ t: "clearChat" }),
  typing: (on) => S.conn?.send({ t: "typing", on }),
});

// ------------------------------------------------------------------ screens

const SCREENS = ["start", "wait", "lobby", "table"];
function show(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  document.body.classList.add("in-game");
  document.body.classList.toggle("on-table", id === "table");
  chat.layout();
  if (id === "table") wake(); else unwake();
  // Music plays through the lobby and the game without a break; the start
  // screen (out of the room) is quiet.
  if (id === "lobby" || id === "table") wantMusic(true);
  else if (id === "start") wantMusic(false);
}

function startScreen(error = "") {
  closeSheet(true);
  closeOverlay(true);
  if (lostToast) { lostToast(); lostToast = null; }
  show("start");
  formStep(false);
  busy(false);
  if (asLeader) {
    $("start-kicker").textContent = "Welcome back, boss";
    $("start-lead").textContent = "Name your room. Your friends join with it.";
    $("room-label").textContent = "Name your room";
  }
  const saved = store.get("db:name");
  if (saved && !$("name").value) $("name").value = saved;
  const err = $("join-error");
  err.textContent = error;
  err.classList.toggle("is-bad", !!error);
}

function waitScreen(text, cancel = true) {
  show("wait");
  $("wait-line").textContent = text;
  $("wait-cancel").hidden = !cancel;
}

// ------------------------------------------------------------------ joining

// ------------------------------------------------------------------ the PIN step

// A locked name turns the start panel into a PIN pad (the room and name are
// kept), and the 4th digit sends it. Wrong PINs shake and clear; the right
// one goes straight into the room.
const PIN_CODES = ["needWord", "word", "cooldown"];
let pin = null; // { box } while the PIN pad is showing

/** Slide between the panel's two steps, easing its height from one to the other. */
function swapStep(toPin, animate = true) {
  const panel = $("join-form");
  const from = $(toPin ? "step-form" : "step-pin");
  const to = $(toPin ? "step-pin" : "step-form");
  if (!to.hidden) return;
  const h0 = panel.offsetHeight;
  from.hidden = true;
  to.hidden = false;
  if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const h1 = panel.offsetHeight;
  const ease = "cubic-bezier(.2, .9, .25, 1)";
  panel.style.overflow = "hidden";
  panel.animate([{ height: h0 + "px" }, { height: h1 + "px" }], { duration: 460, easing: ease })
    .finished.catch(() => {}).then(() => { panel.style.overflow = ""; });
  to.animate([{ opacity: 0, transform: `translateX(${toPin ? 28 : -28}px) scale(.98)` }, { opacity: 1, transform: "none" }],
    { duration: 420, delay: 60, easing: ease, fill: "backwards" });
}

/** The seat button while the server answers: disabled, with a little patience. */
function busy(on) {
  const b = $("join-go");
  b.disabled = on;
  b.classList.toggle("is-busy", on);
  b.firstChild.textContent = on ? "Pulling up a chair…" : asLeader ? "Open the room" : "Take a seat";
}

function formStep(animate = true) {
  pin = null;
  swapStep(false, animate);
}

/** The server wants this name's PIN (code: needWord | word | cooldown). */
function pinStep(code, message) {
  busy(false);
  if (!pin) {
    const box = people.pinInput(() => sendPin(), { onComplete: () => sendPin() });
    pin = { box };
    $("pin-name").textContent = $("name").value.trim().replace(/\s+/g, " ");
    $("pin-boxes").replaceChildren(box);
    $("pin-msg").textContent = "";
    swapStep(true);
    // No sound of its own: the click that got here already made one.
    box.focus();
    if (code === "needWord") return;
  }
  const box = pin.box;
  box.classList.remove("is-checking");
  box.disable(false);
  box.clear();
  box.shake();
  sound("error");
  $("pin-msg").textContent = message;
  if (code === "cooldown") box.disable(true);
  else box.focus();
}

function sendPin() {
  const box = pin?.box;
  if (!box || box.classList.contains("is-checking")) return;
  if (box.value().length !== 4) { box.shake(); sound("error"); return; }
  $("pin-msg").textContent = "";
  box.classList.add("is-checking");
  box.disable(true);
  enter(box.value());
}

$("pin-back").addEventListener("click", () => {
  S.conn?.close(); S.conn = null;
  formStep();
  setTimeout(() => $("name").focus({ preventScroll: true }), 420);
});

// ------------------------------------------------------------------ taking a seat

$("join-form").addEventListener("submit", (e) => { e.preventDefault(); if (!pin) enter(); });

/** Join (or, for the leader, open) the room. word: the PIN from the PIN step. */
async function enter(word) {
  const room = $("room").value.replace(/\s+/g, "").toUpperCase();
  const name = $("name").value.trim().replace(/\s+/g, " ");
  const err = (msg) => {
    busy(false);
    if (pin) { formStep(); }
    $("join-error").textContent = msg; $("join-error").classList.remove("is-bad"); void $("join-error").offsetWidth; $("join-error").classList.add("is-bad"); sound("error");
  };
  if (!room) return err(asLeader ? "Your room needs a name. Even 'CAT' qualifies." : "Which room? Even a guess helps.");
  if (!name) return err("What should we call you?");
  store.set("db:name", name);
  busy(true);
  try {
    if (asLeader) {
      const r = await api("/api/rooms", { leaderCode, room, name, word });
      if (PIN_CODES.includes(r.code)) return pinStep(r.code, r.error);
      if (!r.ok) return err(r.error || "That didn't work.");
      store.set("db:session", { room: r.room, token: r.token });
      if (pin) pin.box.classList.add("is-right");
      connect(r.room, { token: r.token, leaderCode, word }, { quiet: true });
      toast(r.resumed ? `Welcome back to ${r.room}. It missed you.` : `Room ${r.room} is open. Tell your victims— friends.`);
    } else {
      const info = await api(`/api/rooms/${encodeURIComponent(room)}`);
      if (info.error) return err(info.error);
      if (!info.exists) return err("That room doesn't exist. Did you dream it? (The leader has to open it first.)");
      // Stay on this screen while the server checks the name (and PIN): a
      // locked name slides to the PIN pad without flashing a waiting screen.
      connect(room, { name, word }, { quiet: true });
    }
  } catch {
    if (pin) { busy(false); pin.box.classList.remove("is-checking"); pin.box.disable(false); $("pin-msg").textContent = "Can't reach the table. Check your connection and try again."; sound("error"); return; }
    err("Can't reach the table. Check your connection and try again.");
  }
}

$("wait-cancel").addEventListener("click", () => { leave(false); });
// How to play opens over the start screen too (the link still works without scripts).
$("start-rules").addEventListener("click", (e) => { e.preventDefault(); openRules(); });

/** quiet: keep the current screen (the PIN step) instead of the waiting one. */
function connect(room, hello, { quiet = false } = {}) {
  S.conn?.close();
  S.joined = false;
  S.roomCode = room;
  if (!quiet) waitScreen("Pulling up a chair…");
  // Only the current connection is listened to: an old one closing late (after
  // switching rooms) must not raise a "connection lost" that never clears.
  let conn = null;
  const mine = (fn) => (x) => { if (conn && S.conn === conn) fn(x); };
  conn = S.conn = new Connection(room, () => {
    const saved = store.get("db:session");
    const token = saved && saved.room === room ? saved.token : hello.token;
    // A locked name needs its PIN each time it sits down (not when reconnecting with the seat's token).
    return { t: "hello", token, name: token ? undefined : hello.name, leaderCode: asLeader ? leaderCode : undefined,
      word: hello.word || undefined };
  }, mine(onMessage), mine(onStatus));
}

let lostToast = null;
let failures = 0;
async function onStatus(s) {
  if (s === "open") { failures = 0; if (lostToast) { lostToast(); lostToast = null; } return; }
  if (s === "connecting") return;
  if (s !== "closed") return;
  if (S.joined && !lostToast) lostToast = toast("Connection lost. Reconnecting…", { sticky: true, bad: true });
  // Never got in: maybe the room is gone (an hour of silence closes it).
  if (!S.joined && ++failures === 2) {
    const room = S.roomCode;
    const info = await api(`/api/rooms/${room}`).catch(() => null);
    if (info && !info.exists && S.roomCode === room) {
      leave(false);
      startScreen("That room has closed. Rooms tidy themselves up after an hour of silence.");
    } else if (!info) {
      waitScreen("Can't reach the table. Still trying…");
    }
  }
}

// Set while we wait for the server's goodbye.
let byeWaiter = null;

async function leave(tell = true, msg = { t: "leave" }) {
  if (tell && S.conn?.send(msg)) {
    // Wait for the server to confirm before hanging up, so the message can't
    // get lost on the way (that's what used to leave closed rooms behind).
    waitScreen(msg.t === "closeRoom" ? "Closing the room…" : "Packing up your cards…", false);
    await new Promise((ok) => { byeWaiter = ok; setTimeout(ok, 2500); });
    byeWaiter = null;
  }
  S.conn?.close();
  S.conn = null;
  S.joined = false;
  S.view = null; S.room = null; S.resultsKey = null;
  S.lobbyForm = null; S.seatSig = null; S.seatIds = null;
  store.del("db:session");
  chat.reset([]);
  chat.setLeader(false);
  chat.close();
  startScreen();
}

// ------------------------------------------------------------------ messages

const rejoinToasts = new Map();

function onMessage(m) {
  switch (m.t) {
    case "welcome":
      S.joined = true;
      S.me = m.you;
      S.leader = m.leader;
      chat.setLeader(m.leader);
      store.set("db:session", { room: S.roomCode, token: m.token });
      break;
    case "room": {
      const was = S.room?.status;
      S.room = m.room;
      for (const p of m.room.players) if (!p.bot) pictures.setPicOf(p.name, p.pic);
      chat.setFaces(m.room.players);
      if (m.room.status === "lobby") {
        closeResults();
        if (was === "playing" || was === "over") S.view = null;
        show("lobby");
        renderLobby();
      } else if (m.room.status === "playing") {
        // A rematch: everyone's results go away, not just the leader's.
        closeResults();
        if ($("table").hidden && S.view) show("table");
      } else if (m.room.status === "over") showResults();
      if (S.view) refreshTableMeta();
      refreshMenu();
      if (currentOverlay()?.startsWith("player:") && !m.room.players.some((x) => "player:" + x.id === currentOverlay())) closeOverlay();
      break;
    }
    case "state":
      if (!m.view) { S.view = null; return; }
      S.clock = m.clock;
      if (m.clock) S.offset = m.clock.now - Date.now();
      onState(m.view, m.moves || [], m.events || []);
      break;
    case "chatLog": m.cleared ? chat.wipe(m.msgs) : chat.reset(m.msgs); break;
    case "chat": chat.add(m.msg); break;
    case "typing": chat.typing(m); break;
    case "error":
      if (!S.joined) {
        S.conn?.close(); S.conn = null;
        sound("error");
        if (PIN_CODES.includes(m.code)) { if ($("start").hidden) startScreen(); pinStep(m.code, m.message); }
        else startScreen(m.message);
        return;
      }
      if (people.lockOpen() && people.lockError(m.message)) return;
      if (profile.profileError(m.message)) return;
      pictures.failed();
      sound("error");
      toast(m.message, { bad: true });
      // A drop the server refused: put the card back where it was.
      if (S.view && !$("table").hidden) redraw();
      break;
    case "waiting": waitScreen(m.message); break;
    case "bye":
      if (byeWaiter) { byeWaiter(); return; } // we asked to go; leave() takes it from here
      S.conn?.close(); S.conn = null; S.joined = false;
      store.del("db:session");
      startScreen(m.reason);
      break;
    case "rejoinRequest":
      if (rejoinToasts.has(m.request)) break;
      sound("turn");
      rejoinToasts.set(m.request, toast(`${m.name} wants back in.`, { sticky: true, actions: [
        { label: "Keep the robot", onClick: () => { S.conn.send({ t: "rejoin", request: m.request, allow: false }); rejoinToasts.delete(m.request); } },
        { label: "Let them in", primary: true, onClick: () => { S.conn.send({ t: "rejoin", request: m.request, allow: true }); rejoinToasts.delete(m.request); } },
      ] }));
      break;
    case "rejoinGone": rejoinToasts.get(m.request)?.(); rejoinToasts.delete(m.request); break;
    case "nameStatus": people.nameStatus(m); break;
    case "directory": people.directory(m.profiles); profile.afterDirectory(); break;
    case "stats": profile.stats(m); break;
    case "picture": pictures.saved(m.pic); break;
    case "muted": toast(m.muted ? "The leader has muted you. Think about what you said." : "You can talk again. Use it wisely.", { bad: m.muted }); break;
  }
}

// ------------------------------------------------------------------ the game

// Tapping an opponent's seat opens them full screen: who they are, their
// whole table, and (for the leader) their options.
const handlers = {
  opp: (pid) => {
    const rp = S.room?.players.find((x) => x.id === pid);
    if (rp) playerMenu(rp);
    else play.showOpponent(pid);
  },
  bank: play.showBank,
};
// The leader gets a player-options button on every seat.
Object.defineProperty(handlers, "options", {
  get: () => (S.leader ? (pid) => { const rp = S.room?.players.find((x) => x.id === pid); if (rp) playerMenu(rp); } : null),
});

function redraw() {
  renderTable(G, handlers);
}

$("deck").querySelector("img").src = cardSrc(null);

// Every card's picture, fetched quietly a few seconds into the first game
// (about a megabyte on a phone), so a card never appears blank the first time
// it's drawn. Only fetched, not drawn: nothing is held in memory until needed.
let cardsFetched = false;
function fetchCards() {
  if (cardsFetched) return;
  cardsFetched = true;
  setTimeout(() => { for (const id of [...Object.keys(DEF), null]) fetch(cardSrc(id), { priority: "low" }).catch(() => {}); }, 4000);
}

function onState(view, moves, events) {
  const first = !S.view;
  const drop = S.drop && Date.now() - S.drop.at < 15000 ? S.drop : null;
  S.drop = null;
  const before = !$("table").hidden ? capture(drop) : null;
  S.view = view;
  S.moves = moves;
  if (first) { announced.clear(); S.lastTurnMine = false; clearFeed(); }
  if ($("table").hidden) show("table");
  redraw();
  fetchCards();
  // A fresh deal: cards fly out round the table. Otherwise everything that
  // moved glides from where it was.
  if (first && view.turn.number <= 1 && !view.turn.drawn && S.view.players.every((p) => !p.sets.length && !p.bank.length)) { sound("deal"); voice("start", { at: 1.4 }); dealIn(view, S.me); }
  else animateFrom(before, events, view, S.me);
  refreshTableMeta();
  const mine = view.turn.player === S.me && view.phase === "play";
  if (mine && !S.lastTurnMine) { sound("turn"); announce(line(view.turn.drawn ? "your-turn" : "your-turn-draw", { n: view.turn.toDraw })); }
  S.lastTurnMine = mine;
  effects(events);
  // A card sheet left open from before this update may offer stale moves.
  const k = openSheetKey();
  if (k && /^(card|pick|take|give|set|own|rent|dbl):/.test(k)) closeSheet();
  refreshMenu();
  schedulePrompts();
}

// Prompts (answer an attack, pay up) wait until the card that caused them
// has been shown, so you see what hit you before you're asked about it.
let promptsQueued = false;
function schedulePrompts() {
  if (promptsQueued) return;
  promptsQueued = true;
  whenClear(() => {
    promptsQueued = false;
    play.prompts();
    if (currentOverlay() === "menu" && /^(respond|counter|pay|paypre|discard):/.test(openSheetKey() || "")) closeOverlay();
  });
}

function refreshTableMeta() {
  const v = S.view;
  if (!v) return;
  const me = S.room?.players.find((p) => p.id === S.me);
  const lineEl = $("turn-line");
  const waitOn = v.awaiting.filter((a) => a.id !== S.me).map((a) => v.players.find((p) => p.id === a.id)?.name);
  if (me?.takeover === "idle") {
    lineEl.replaceChildren(h("button", { class: "btn btn--primary", type: "button", onclick: () => { S.conn.send({ t: "back" }); } }, h("span", {}, "I'm back")));
  } else if (v.phase === "over") lineEl.textContent = "Game over";
  else if (v.turn.player === S.me && v.phase === "play") lineEl.textContent = S.moves.some((m) => m.type === "draw") ? "Tap the deck to draw" : "Your turn · drag a card to play it";
  else if (v.awaiting.some((a) => a.id === S.me)) lineEl.textContent = "Your move";
  else lineEl.textContent = waitOn.length ? `Waiting for ${waitOn.slice(0, 2).join(" & ")}` : "";
}

function drawCards() {
  const m = S.moves.find((x) => x.type === "draw");
  if (m) { G.send(m); sound("draw"); }
}
$("deck").addEventListener("click", drawCards);
// Return on the table does one thing at a time: at the start of your turn it
// draws; once you've drawn and have no plays left (End turn is pulsing) it
// ends the turn. Never while anything else is open or waiting (a sheet, a
// dialog, the chat, someone paying you), and never in the beat right after a
// sheet or a draw, so one Return can't do two things.
let tableKeyAt = 0;
function canEndByKey() {
  const v = S.view, end = $("end-turn");
  if (!v || v.phase !== "play" || v.turn.player !== S.me || !v.turn.drawn) return false;
  if (v.awaiting.some((a) => a.id !== S.me)) return false;
  if (S.moves.some((m) => m.type === "draw")) return false;
  return end.classList.contains("is-ready") && !end.disabled;
}
addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.repeat || e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  if ($("table").hidden || overlayOpen() || document.querySelector(".sheet, [role=dialog]:not([hidden])")) return;
  if (e.target.closest?.("input, textarea, [contenteditable], button, a")) return;
  if (sinceSheet() < 700 || performance.now() - tableKeyAt < 700) return;
  if (canEndByKey()) {
    e.preventDefault();
    tableKeyAt = performance.now();
    press($("end-turn"));
    return;
  }
  if (!S.moves.some((m) => m.type === "draw")) return;
  e.preventDefault();
  tableKeyAt = performance.now();
  $("deck").classList.add("is-pressed");
  setTimeout(() => $("deck").classList.remove("is-pressed"), 160);
  drawCards();
});
$("deck").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drawCards(); } });

$("end-turn").addEventListener("click", () => {
  const m = S.moves.find((x) => x.type === "endTurn");
  if (m) { G.send(m); }
});

// Drag and drop: your hand, and the wild cards on your table.
function onDrop(card, zone, rect, src) {
  const result = play.dropCard(card, zone);
  if (!result) return;
  // The next redraw carries the card on from exactly where you let go.
  S.drop = { card, rect, src, at: Date.now() };
  if (result === "sent") {
    const el = document.querySelector(`#table [data-card="${card}"]`);
    if (el) el.style.visibility = "hidden";
  }
  sound("card");
}
enableDrag($("hand"), { selector: ".card", zonesFor: play.zonesFor, onDrop, autoScroll: $("my-sets"), onTap: (c) => { play.handCard(c); } });
enableDrag($("my-sets"), { selector: ".card", strict: true, zonesFor: play.zonesFor, onDrop, autoScroll: $("my-sets"), onTap: (c) => { play.setCard(c); } });
// A long row of sets scrolls sideways — except when you grab a card you can
// move, which picks the card up instead.
dragScroll($("my-sets"), { canStart: (e) => {
  const card = e.target.closest("[data-card]")?.dataset.card;
  return !card || !play.zonesFor(card).length;
} });

// ------------------------------------------------------------------ timers

// Five times a second, but the page is only touched where something visibly
// changed: the seconds, and the ring once it has moved by half a pixel or so
// (a 0.4% step: on a five-minute turn, about once a second). Between those,
// a running clock costs nothing at all.
const setText = (el, text) => { if (el.textContent !== String(text)) el.textContent = text; };
const setLeft = (el, frac) => {
  const was = el._left ?? -1;
  if (Math.abs(frac - was) < 0.004 && !(frac === 0 && was !== 0)) return;
  el._left = frac;
  el.style.setProperty("--left", frac.toFixed(4));
};
let lastTick = 0;
setInterval(() => {
  const v = S.view, c = S.clock;
  if (!v || !c || $("table").hidden) return;
  const now = Date.now() + S.offset;
  const total = c.turnSeconds * 1000;
  const left = Math.max(0, c.deadline - now);
  const secs = Math.ceil(left / 1000);
  const frac = Math.max(0, Math.min(1, left / total));
  const awaitingMe = v.awaiting.some((a) => a.id === S.me) && v.phase !== "over";
  const mine = $("my-timer");
  mine.hidden = !awaitingMe;
  if (awaitingMe) {
    setLeft(mine, frac);
    setText(mine.querySelector("span"), secs);
    mine.classList.toggle("is-low", secs <= 10);
    // The tick is a tick-tock (two seconds' worth), so it plays every other second.
    if (secs <= 10 && secs !== lastTick && secs > 0) { if (secs % 2 === 0) sound("tick"); lastTick = secs; }
    // Twenty seconds left on your own turn: a nudge, once.
    if (secs === 20 && v.turn.player === S.me && v.phase === "play" && !announced.has("hurry:" + c.deadline)) { announced.add("hurry:" + c.deadline); voice("hurry"); }
    if (secs === 10 && !announced.has("low:" + c.deadline)) { announced.add("low:" + c.deadline); announce(line("time-low", { p: "you" })); }
  }
  for (const el of document.querySelectorAll(".oseat .timer")) {
    setLeft(el, frac);
    setText(el.querySelector("span"), secs);
    el.classList.toggle("is-low", secs <= 10);
  }
  const d = c.discards?.[S.me];
  for (const el of document.querySelectorAll('[data-countdown="discard"]')) setText(el, d ? Math.max(0, Math.ceil((d - now) / 1000)) + "s" : "");
}, 200);

// ------------------------------------------------------------------ the phone

let lock = null;
async function wake() {
  try { if (!lock && navigator.wakeLock) lock = await navigator.wakeLock.request("screen"); } catch { /* not allowed */ }
}
function unwake() { lock?.release?.(); lock = null; }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !$("table").hidden) { lock = null; wake(); } });

// The table re-fans the hand when the screen changes size.
let resizeTimer = 0;
addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (S.view && !$("table").hidden) redraw(); }, 120); });

// One gentle hint, on an iPhone in Safari, about saving it as an app.
function homeScreenHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  if (!ios || standalone || store.get("db:hinted")) return;
  store.set("db:hinted", true);
  setTimeout(() => toast("Tip: tap Share → Add to Home Screen to play fullscreen, like an app.", { ms: 9000, actions: [{ label: "Got it" }] }), 2500);
}

// ------------------------------------------------------------------ go

const saved = store.get("db:session");
if (saved?.room && saved?.token) connect(saved.room, { token: saved.token });
else startScreen();
homeScreenHint();
chat.layout();
