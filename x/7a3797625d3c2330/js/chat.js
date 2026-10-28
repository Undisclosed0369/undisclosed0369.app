// Table chat, in the style of Messages: blue bubbles for you, grey for
// everyone else, runs grouped with a tail on the last bubble, names and
// avatars on incoming runs, timestamps between conversations, "Delivered"
// under your latest message, and emoji-only messages shown big.
//
// Docked beside the table on wide screens (open by default, remembers your
// choice); a slide-over with an unread badge on phones.

import { h, sheet, closeSheet, option } from "./sheets.js";
import { avatar } from "./table.js";
import { sound } from "./fx.js";
import { dragScroll } from "./scroll.js";
import { richText, expandShortcodes, suggest, appleEmoji } from "./richtext.js";
import { initEmojiPicker, close as closeEmoji } from "./emoji-picker.js";
import { $, store } from "./util.js";

const REACTS = ["😂", "🔥", "😭", "👀", "GG", "Nooo", "Why me"];
const RUN_GAP = 120_000;        // a pause this long starts a new run
const TIME_GAP = 10 * 60_000;   // and this long shows a timestamp
const wide = matchMedia("(min-width: 1100px) and (hover: hover)");

let ctx = null;
let last = null;      // the previous message, for grouping
let unread = 0;
let status = null;    // the "Delivered" line

export function initChat(c) {
  ctx = c;
  $("reacts").replaceChildren(...REACTS.map((r) => {
    const b = h("button", { type: "button", onclick: () => { ctx.react(r); sound("send"); } }, r);
    appleEmoji(b);
    return b;
  }));
  // Fingers scroll it natively; a mouse or trackpad click can drag it too.
  dragScroll($("reacts"), { pointerTypes: ["mouse", "pen"] });
  const input = $("chat-input");
  const field = input.closest(".chat__field");
  input.addEventListener("input", () => {
    liveShortcodes(input);
    field.classList.toggle("has-text", !!input.value.trim());
    showSuggestions(input);
    imTyping(!!input.value.trim());
  });
  input.addEventListener("blur", () => imTyping(false));
  input.addEventListener("keydown", (e) => suggestKeys(e, input));
  input.addEventListener("blur", () => setTimeout(hideSuggestions, 150));
  $("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = expandShortcodes(input.value).trim();
    if (!text) return;
    if (ctx.send(text)) { input.value = ""; field.classList.remove("has-text"); hideSuggestions(); imTyping(false); sound("send"); }
  });
  $("chat-form").before(suggestBox);
  initEmojiPicker(input, $("chat-emoji"), $("chat-form"));
  $("chat-fab").addEventListener("click", open);
  $("chat-btn").addEventListener("click", open);
  $("chat-close").addEventListener("click", close);
  $("chat-clear").addEventListener("click", confirmClear);
  wide.addEventListener("change", layout);
  // Phones: when the keyboard is up, fit the chat into what's left above it.
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", fitKeyboard);
    visualViewport.addEventListener("scroll", fitKeyboard);
    input.addEventListener("focus", () => setTimeout(fitKeyboard, 250));
    input.addEventListener("blur", () => setTimeout(fitKeyboard, 250));
  }
  for (const id of ["lobby", "table"]) new MutationObserver(layout).observe($(id), { attributes: true, attributeFilter: ["hidden"] });
}

export const docked = () => document.body.classList.contains("chat-docked");

const touch = matchMedia("(pointer: coarse)");
let fullHeight = Math.max(window.visualViewport?.height || 0, innerHeight);

/** Keyboard up on a phone: the chat takes exactly the visible area, full width,
    with a slim header, so the conversation and the field both stay in view. */
function fitKeyboard() {
  const chat = $("chat");
  const vv = window.visualViewport;
  const focused = document.activeElement === $("chat-input");
  // The tallest the visible area has been without the keyboard (iPhone keeps
  // the page height and shrinks the visible part; Android shrinks both).
  if (vv && !focused) fullHeight = Math.max(vv.height, innerHeight);
  const typing = !!vv && touch.matches && focused && fullHeight - vv.height > 120;
  chat.classList.toggle("is-typing", typing);
  document.body.classList.toggle("chat-typing", typing);
  if (typing) {
    chat.style.top = vv.offsetTop + "px";
    chat.style.height = vv.height + "px";
    chat.style.bottom = "auto";
    const log = $("chat-log");
    log.scrollTop = log.scrollHeight;
  } else {
    chat.style.top = chat.style.height = chat.style.bottom = "";
  }
}
const inRoom = () => !$("lobby").hidden || !$("table").hidden;

export function layout() {
  const dock = wide.matches && (store.get("db:chat") ?? "open") === "open" && inRoom();
  const was = document.body.classList.contains("chat-docked");
  document.body.classList.toggle("chat-docked", dock);
  $("chat").hidden = !inRoom();
  if (dock) $("chat").classList.add("is-open");
  else if (was) $("chat").classList.remove("is-open"); // the window got narrow: tuck it away
  $("chat-fab").hidden = !inRoom() || dock;
}

export function open() {
  if (wide.matches) { store.set("db:chat", "open"); layout(); }
  $("chat").hidden = false;
  requestAnimationFrame(() => $("chat").classList.add("is-open"));
  unread = 0;
  badge();
  const log = $("chat-log");
  log.scrollTop = log.scrollHeight;
  if (!matchMedia("(pointer: coarse)").matches) setTimeout(() => $("chat-input").focus({ preventScroll: true }), 350);
}

export function close() {
  closeEmoji();
  if (wide.matches) store.set("db:chat", "closed");
  document.body.classList.remove("chat-docked");
  $("chat").classList.remove("is-open");
  layout();
}

function badge() {
  for (const id of ["chat-badge", "chat-fab-badge"]) {
    const b = $(id);
    b.hidden = !unread;
    b.textContent = unread > 9 ? "9+" : unread;
  }
}

// ------------------------------------------------------------------ :emoji: as you type

const suggestBox = h("div", { class: "emoji-suggest", role: "listbox", "aria-label": "Emoji", hidden: true });
let picks = [];
let active = 0;

/** A finished :name: turns into its emoji right away, keeping the caret in place. */
function liveShortcodes(input) {
  const before = input.value.slice(0, input.selectionStart);
  const after = input.value.slice(input.selectionStart);
  const swapped = expandShortcodes(before);
  if (swapped === before) return;
  input.value = swapped + after;
  input.setSelectionRange(swapped.length, swapped.length);
}

const typedCode = (input) => /(?:^|[\s(])(:[a-z0-9_+-]{2,40})$/i.exec(input.value.slice(0, input.selectionStart))?.[1];

function showSuggestions(input) {
  const token = typedCode(input);
  picks = token ? suggest(token.slice(1)) : [];
  if (!picks.length) return hideSuggestions();
  active = 0;
  suggestBox.replaceChildren(...picks.map(([name, emoji], i) => {
    const glyph = h("span", { class: "emoji-suggest__glyph" }, emoji);
    appleEmoji(glyph);
    return h("button", { type: "button", role: "option", class: "emoji-suggest__item" + (i === 0 ? " is-active" : ""),
      onpointerdown: (e) => { e.preventDefault(); pick(input, i); } },
      glyph, h("span", { class: "emoji-suggest__name" }, `:${name}:`));
  }));
  suggestBox.hidden = false;
}

function hideSuggestions() { suggestBox.hidden = true; picks = []; }

function pick(input, i) {
  const token = typedCode(input);
  if (!token || !picks[i]) return;
  const start = input.selectionStart - token.length;
  const insert = picks[i][1] + " ";
  input.value = input.value.slice(0, start) + insert + input.value.slice(input.selectionStart);
  input.setSelectionRange(start + insert.length, start + insert.length);
  input.closest(".chat__field").classList.add("has-text");
  hideSuggestions();
  input.focus();
}

function suggestKeys(e, input) {
  if (suggestBox.hidden || !picks.length) return;
  const move = (d) => {
    active = (active + d + picks.length) % picks.length;
    [...suggestBox.children].forEach((b, i) => b.classList.toggle("is-active", i === active));
  };
  if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
  else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(input, active); }
  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hideSuggestions(); }
}

// ------------------------------------------------------------------ clearing (leader)

const ASK = [
  "Every message, for everyone, gone. Like tears in rain.",
  "This wipes the chat for the whole table. Receipts included.",
  "No undo. Not even for you, boss.",
  "The group chat will never know what hit it.",
];

export function setLeader(isLeader) { $("chat-clear").hidden = !isLeader; }

function confirmClear() {
  sheet({ center: true, title: "Clear the chat for everyone?", sub: ASK[Math.floor(Math.random() * ASK.length)],
    body: h("div", { class: "options" },
      option({ icon: "🧽", danger: true, primary: true, label: "Wipe it", small: "Everyone's history, gone", onClick: () => { closeSheet(); ctx.clear(); } }),
      option({ icon: "🍿", safe: true, label: "Keep the drama", small: "Leave the chat as it is", onClick: () => closeSheet() })) });
}

/** The leader cleared the chat: sweep the old messages away, then show the new log. */
export function wipe(list) {
  const log = $("chat-log");
  const items = [...log.children];
  if (!items.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return reset(list, true);
  items.reverse().forEach((li, k) => li.style.setProperty("--k", Math.min(k, 14)));
  log.classList.add("is-wiping");
  sound("swap");
  setTimeout(() => { log.classList.remove("is-wiping"); reset(list, true); }, 520 + Math.min(items.length, 14) * 28);
}

// ------------------------------------------------------------------ "… is typing"

// Ours: "on" when you start, refreshed every few seconds while you keep going,
// "off" when you send, clear the field, leave it, or stop for a while.
let typingOn = false, typingAt = 0, typingStop = 0;
function imTyping(on) {
  clearTimeout(typingStop);
  if (!on) { if (typingOn) { typingOn = false; ctx.typing?.(false); } return; }
  if (!typingOn || Date.now() - typingAt > 3000) { typingOn = true; typingAt = Date.now(); ctx.typing?.(true); }
  typingStop = setTimeout(() => imTyping(false), 5000);
}

// Theirs: shown as a bubble of bouncing dots under the conversation (and as
// dots on the chat button while the chat is closed). Each fades on its own
// if the "off" never comes.
const typers = new Map(); // pid -> { name, timer }
export function typing(m) {
  const t = typers.get(m.pid);
  if (t) clearTimeout(t.timer);
  if (m.on) typers.set(m.pid, { name: m.name, timer: setTimeout(() => { typers.delete(m.pid); drawTyping(); }, 6500) });
  else typers.delete(m.pid);
  drawTyping();
}
function drawTyping() {
  const box = $("chat-typing");
  const names = [...typers.values()].map((t) => t.name);
  const on = names.length > 0;
  for (const id of ["chat-btn", "chat-fab"]) $(id)?.classList.toggle("is-typing", on);
  if (!on) { box.classList.remove("is-on"); return; }
  const who = names.length === 1 ? `${names[0]} is typing`
    : names.length === 2 ? `${names[0]} and ${names[1]} are typing` : "Several people are typing";
  const bot = (name) => ctx.room()?.players.find((p) => p.name === name)?.bot;
  box.replaceChildren(
    h("span", { class: "typing__faces" }, ...names.slice(0, 3).map((n) => avatar(n, { bot: bot(n), online: false }))),
    h("span", { class: "typing__bubble", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
    h("span", { class: "typing__who" }, who));
  box.classList.add("is-on");
  const log = $("chat-log");
  if (log.scrollHeight - log.scrollTop - log.clientHeight < 120) log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
}

export function setFaces(players) {
  $("chat-faces").replaceChildren(...players.filter((p) => !p.bot).slice(0, 5).map((p) => avatar(p.name)));
}

export function reset(list, animateLast = false) {
  $("chat-log").replaceChildren();
  last = null;
  status = null;
  unread = 0;
  badge();
  list.forEach((m, i) => add(m, !(animateLast && i === list.length - 1)));
}

const timeLabel = (at) => {
  const d = new Date(at);
  return `<b>Today</b> ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};
const isEmoji = (t) => /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s){1,8}$/u.test(t) && !/^[\d#*\s]+$/.test(t);

export function add(msg, quiet = false) {
  const log = $("chat-log");
  // Their message is here: they've stopped typing.
  if (msg.pid && typers.has(msg.pid)) { clearTimeout(typers.get(msg.pid).timer); typers.delete(msg.pid); drawTyping(); }
  const me = ctx.me();
  const mine = msg.pid === me;
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;

  if (!last || msg.at - last.at > TIME_GAP) log.append(h("li", { class: "msg__time", html: timeLabel(msg.at) }));

  if (msg.system) {
    log.append(h("li", { class: "msg msg--system" + (msg.cleared ? " msg--cleared" : "") + (quiet ? "" : " is-new") }, h("div", { class: "msg__body" }, h("span", { class: "msg__bubble" }, richText(msg.text)))));
    last = { ...msg, el: null };
  } else {
    const sameRun = last && !last.system && last.pid === msg.pid && msg.at - last.at < RUN_GAP;
    const bot = ctx.room()?.players.find((p) => p.id === msg.pid)?.bot;
    const li = h("li", { class: "msg msg--end" + (mine ? " msg--me" : "") + (sameRun ? "" : " msg--start") + (isEmoji(msg.text) ? " msg--emoji" : "") + (quiet ? "" : " is-new") },
      !mine ? h("span", { class: "msg__face" }, avatar(msg.name, { bot })) : null,
      h("div", { class: "msg__body" },
        !mine && !sameRun ? h("span", { class: "msg__who" }, msg.name) : null,
        h("span", { class: "msg__bubble" }, richText(msg.text))));
    if (sameRun && last.el) {
      // The run continues: the previous bubble loses its tail and face.
      last.el.classList.remove("msg--end");
      const face = last.el.querySelector(".msg__face");
      if (face) face.replaceChildren();
    }
    log.append(li);
    last = { ...msg, el: li };

    // "Delivered" sits under your latest message only.
    if (mine) {
      status?.remove();
      status = h("li", { class: "msg msg--me" }, h("span", { class: "msg__status" }, "Delivered"));
      log.append(status);
    }
  }

  while (log.children.length > 400) log.firstChild.remove();
  if (atBottom || mine) log.scrollTo({ top: log.scrollHeight, behavior: quiet ? "auto" : "smooth" });
  if (quiet || mine || msg.system) return;
  sound("receive");
  if (!$("chat").classList.contains("is-open")) { unread++; badge(); }
}
