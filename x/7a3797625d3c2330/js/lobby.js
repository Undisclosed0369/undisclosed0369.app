// The lobby (seats and table rules), one player full screen, and leaving.

import { COLORS } from "../engine/deck.js";
import { completeColors, setSize, isComplete } from "../engine/rules.js";
import { h, sheet, closeSheet, option, toast, keycap } from "./sheets.js";
import { avatar, bankTotal, setCardEl } from "./table.js";
import * as play from "./play.js";
import { rulesForm } from "./controls.js";
import { sound } from "./fx.js";
import * as people from "./people.js";
import * as profile from "./profile.js";
import * as pictures from "./pictures.js";
import { overlay, closeOverlay, tile, openRules } from "./overlay.js";
import { openAudio } from "./audio-panel.js";
import { S } from "./state.js";
import { $ } from "./util.js";

let leave = null;
/** app.js hands over how to leave the room (it owns the connection). */
export function initLobby(opts) { leave = opts.leave; }

export const sendSettings = (patch) => S.conn?.send({ t: "settings", ...patch });

export function renderLobby() {
  const r = S.room;
  $("lobby-code").textContent = r.code;
  const players = r.players.filter((p) => !p.bot);
  const mode = r.settings.mode;
  const ghosts = mode === "players" ? 0 : r.settings.aiSeats;
  const seatsUsed = (mode === "ai" ? 1 : players.length) + ghosts;
  $("seat-count").textContent = `${seatsUsed}/5`;

  // Only what changed is redrawn, and only rows that are new slide in: a
  // settings change (the timer, say) mustn't replay the whole list.
  const sig = JSON.stringify([S.me, S.leader, mode, ghosts, r.settings.aiLevel, players.map((p) => [p.id, p.name, p.connected, p.muted, p.leader, p.pic])]);
  if (sig === S.seatSig) return renderLobbyRules(r);
  const seen = S.seatIds || new Set();
  S.seatSig = sig;
  S.seatIds = new Set([...players.map((p) => p.id), ...Array.from({ length: ghosts }, (_, i) => "ai" + i)]);
  const settled = (id) => (seen.has(id) ? " is-settled" : "");
  // Tap anyone to see them (and their stats); the leader's ••• opens the same view.
  const rows = players.map((p, i) => h("li", { class: "seat is-tappable" + settled(p.id) + (p.id === S.me ? " seat--you" : "") + (mode === "ai" && !p.leader ? " seat--ghost" : ""), style: { animationDelay: i * 50 + "ms" },
    onclick: (e) => { if (!e.target.closest("button")) playerMenu(p); } },
    avatar(p.name, { online: p.connected }),
    h("span", { class: "seat__name" }, p.name),
    p.leader ? h("span", { class: "seat__tag seat__tag--lead" }, "Leader") : null,
    p.id === S.me ? h("span", { class: "seat__tag" }, "You") : null,
    p.muted ? h("span", { class: "seat__tag" }, "Muted") : null,
    S.leader && p.id !== S.me ? h("button", { class: "icon-btn icon-btn--small seat__menu", type: "button", "aria-label": "Player options",
      onclick: () => playerMenu(p), html: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="12.5" cy="8" r="1.4"/></svg>' }) : null));
  for (let i = 0; i < ghosts; i++) {
    rows.push(h("li", { class: "seat seat--ghost" + settled("ai" + i) }, avatar("AI", { bot: true }), h("span", { class: "seat__name" }, "AI player"),
      h("span", { class: "seat__tag" }, r.settings.aiLevel === "easy" ? "Easy" : "Normal"),
      S.leader && mode !== "ai" ? h("button", { class: "icon-btn icon-btn--small seat__menu", type: "button", "aria-label": "Remove this AI seat", title: "Remove this AI seat",
        onclick: removeAiSeat, html: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>' }) : null));
  }
  $("seats").replaceChildren(...rows);
  renderLobbyRules(r);
}

function renderLobbyRules(r) {
  const players = r.players.filter((p) => !p.bot);
  const mode = r.settings.mode;
  const ghosts = mode === "players" ? 0 : r.settings.aiSeats;
  // Table rules: live for the leader, read-only for everyone else. Built
  // once and updated in place, so a slider mid-drag isn't yanked about.
  if (!S.lobbyForm || S.lobbyFormLeader !== S.leader) {
    S.lobbyForm = rulesForm({ settings: r.settings, editable: S.leader, playing: false, send: sendSettings });
    S.lobbyFormLeader = S.leader;
    $("rules-form").replaceChildren(S.lobbyForm);
  } else S.lobbyForm.update(r.settings, S.leader);
  $("settings").classList.toggle("is-locked", !S.leader);
  $("lobby-people").hidden = !S.leader;
  $("settings-note").textContent = S.leader ? "" : "Only the leader can change these.";

  const start = $("start-game");
  start.hidden = !S.leader;
  const total = mode === "ai" ? 1 + ghosts : players.length + ghosts;
  start.disabled = total < 2 || total > 5;
  $("lobby-error").textContent = S.leader
    ? (total < 2 ? "You need at least 2 players. Even poker needs an opponent." : total > 5 ? "5 players max. Lose a robot." : "")
    : "Waiting for the leader to deal…";
  $("lobby-error").classList.remove("is-bad");
}

$("start-game").addEventListener("click", () => { S.conn.send({ t: "start" }); sound("deal"); });

$("lobby-code").addEventListener("click", async () => {
  const code = S.room?.code;
  if (!code) return;
  const el = $("lobby-code");
  // Phones get the share sheet where it exists (it needs https); everything
  // else copies, with an old-school fallback for plain-http addresses.
  if (navigator.share && matchMedia("(pointer: coarse)").matches && window.isSecureContext) {
    try { await navigator.share({ text: `Join my Deal Breaker table — room code ${code}` }); return; }
    catch (e) { if (e?.name === "AbortError") return; }
  }
  if (await copyText(code)) {
    el.classList.remove("is-copied"); void el.offsetWidth; el.classList.add("is-copied");
    toast(`Copied ${code}. Go forth and recruit.`);
  } else toast(`Couldn't copy. The code is ${code} — tell them the old-fashioned way.`, { bad: true });
});

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  const ta = h("textarea", { readonly: true, style: { position: "fixed", top: "0", left: "0", opacity: "0", fontSize: "16px" } });
  ta.value = text;
  document.body.append(ta);
  ta.focus({ preventScroll: true });
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  return ok;
}

$("lobby-leave").addEventListener("click", () => confirmLeave());
$("lobby-lock").addEventListener("click", () => people.openLock());
$("lobby-audio").addEventListener("click", openAudio);
$("lobby-stats").addEventListener("click", () => { const me = S.room?.players.find((p) => p.id === S.me); if (me) profile.openProfile(me.name); });
$("lobby-people").addEventListener("click", () => people.openDirectory());
$("lobby-rules").addEventListener("click", openRules);

/**
 * One player (or AI), full screen: who they are, how they're doing, their
 * whole table, and for the leader big tiles to mute or kick (kicking asks
 * again in place). A tap on a seat opens it for everyone; the leader also
 * gets it from the lobby, the seat's ••• button and the menu's player list.
 */
export function playerMenu(p) {
  closeSheet(true);
  const view = h("div", { class: "pcard" });
  const draw = (confirming) => view.replaceChildren(...playerCard(p, confirming, draw).filter(Boolean));
  overlay("player:" + p.id, view);
  draw(false);
}

function playerCard(p, confirming, redraw) {
  const playing = S.room?.status === "playing";
  const seat = S.view?.players.find((x) => x.id === p.id);
  const tags = [
    p.leader ? ["Leader", "lead"] : null,
    p.bot ? [`AI · ${p.level === "easy" ? "Easy" : "Normal"}`, "ai"] : null,
    !p.bot ? (p.connected ? ["Online", "on"] : ["Away", "off"]) : null,
    p.muted ? ["Muted", "muted"] : null,
    p.takeover ? ["AI is playing for them", "ai"] : null,
  ].filter(Boolean);
  const stat = (n, label) => h("div", { class: "pcard__stat" }, h("b", {}, n), h("span", {}, label));

  const hero = h("div", { class: "pcard__hero" },
    // Tap the picture to see it at full size (a GIF plays here).
    h("div", { class: "pcard__ring" }, pictures.viewable(avatar(p.name, { bot: p.bot, online: p.bot || p.connected, animate: true }), p.bot ? null : p.name)),
    h("h2", { class: "pcard__name" }, p.name),
    h("div", { class: "pcard__tags" }, ...tags.map(([t, k]) => h("span", { class: `pcard__tag pcard__tag--${k}` }, t))));
  const stats = playing && seat ? h("div", { class: "pcard__stats" },
    stat(`${completeColors(seat).length}/${S.view.options.winSets}`, "sets"),
    stat(`${bankTotal(S.view, seat)}M`, "in the bank"),
    stat(seat.hand, seat.hand === 1 ? "card in hand" : "cards in hand"),
    stat(seat.sets.reduce((n, x) => n + x.cards.length, 0), "on the table")) : null;

  if (confirming) {
    const ban = confirming === "ban";
    return [hero, h("div", { class: "pcard__confirm" },
      h("p", { class: "pcard__ask" }, ban ? `Ban ${p.name}?` : p.bot ? `Remove ${p.name}?` : `Kick ${p.name}?`),
      h("p", { class: "pcard__sub" }, ban
        ? "Out of this room now, and this name can't join any room until you unban it (from Players & bans)."
        : (playing ? "They leave the table right now and their cards go to the discard pile. " : "")
          + (p.bot ? "Robots don't hold grudges." : "They can't come back to this room.")),
      h("div", { class: "pcard__buttons" },
        h("button", { class: "btn btn--quiet btn--big", type: "button", onclick: () => { redraw(false); } }, h("span", {}, "Never mind")),
        h("button", { class: "btn btn--danger btn--big", type: "button", "data-default": true,
          onclick: () => { S.conn.send({ t: ban ? "ban" : "kick", player: p.id }); sound("swap"); closeOverlay(); } },
          h("span", {}, ban ? "Ban" : p.bot ? "Remove" : "Kick"), keycap())))];
  }
  // Their table, card by card (tap one to see it big).
  const pick = (c, el) => h("button", { class: "pick", type: "button", onclick: () => play.showCard(c) }, el);
  const table = playing && seat && (seat.sets.length || seat.bank.length) ? h("div", { class: "pcard__table" },
    ...seat.sets.map((st) => h("div", { class: "pcard__set" + (isComplete(st) ? " is-full" : "") },
      h("p", { class: "pcard__label" }, h("span", { class: "option__swatch", style: { background: COLORS[st.color].hex } }),
        `${COLORS[st.color].name} · ${Math.min(st.cards.length, setSize(st.color))}/${setSize(st.color)}`),
      h("div", { class: "pcard__cards" }, ...[...st.cards, st.house, st.hotel].filter(Boolean).map((c) => pick(c, setCardEl(S.view, c, st.color)))))),
    seat.bank.length ? h("div", { class: "pcard__set" },
      h("p", { class: "pcard__label" }, `Bank · ${bankTotal(S.view, seat)}M`),
      h("div", { class: "pcard__cards" }, ...seat.bank.map((c) => pick(c, h("div", { class: "card" }, h("img", { src: `cards/${S.view.cards[c]}.svg`, alt: "" })))))) : null)
    : playing && seat ? h("p", { class: "pcard__empty" }, "Nothing on the table yet. Suspiciously quiet.") : null;
  // Everyone's stats, a tap away (robots keep none).
  const statsTile = p.bot ? null : tile({ row: p.id !== S.me, icon: "📊", label: p.id === S.me ? "My stats" : `${p.name}'s stats`,
    small: "Wins, steals, grudges", onClick: () => profile.openProfile(p.name, { back: () => playerMenu(p), backLabel: p.name }) });
  // Your own view: change your picture.
  const picTile = p.id === S.me ? tile({ icon: "🖼️", label: "My picture", small: pictures.picOf(p.name) ? "Change it, or go back to your initial" : "Pick one, or use a photo",
    onClick: () => pictures.openPicker({ back: () => playerMenu(p), backLabel: p.name }) }) : null;
  if (!S.leader || p.id === S.me) return [hero, stats, table, statsTile ? h("div", { class: "tiles pcard__tiles" }, statsTile, picTile) : null];

  return [hero, stats, table, h("div", { class: "tiles pcard__tiles" }, statsTile,
    p.bot ? null : tile({ icon: p.muted ? "🔊" : "🔇", label: p.muted ? "Unmute" : "Mute in chat",
      small: p.muted ? "Let them talk again" : "They can still play, just not type",
      onClick: () => { S.conn.send({ t: "mute", player: p.id, muted: !p.muted }); closeOverlay(); } }),
    tile({ danger: true, row: !!p.bot, icon: "🚪", label: p.bot ? "Remove from the game" : playing ? "Kick from the game" : "Kick",
      small: playing ? "Out now. Their cards go to the discard pile." : "They can't come back to this room",
      onClick: () => redraw("kick") }),
    p.bot ? null : tile({ danger: true, row: true, icon: "⛔", label: "Ban from Deal Breaker",
      small: "Kicked, and this name can't join any room until unbanned", onClick: () => redraw("ban") }),
  )];
}

/** One fewer AI seat, from the lobby. */
function removeAiSeat() {
  const s = S.room.settings;
  sendSettings(s.aiSeats > 1 ? { aiSeats: s.aiSeats - 1 } : { mode: "players" });
}

export function confirmLeave() {
  const inGame = S.room?.status === "playing";
  const close = () => { closeSheet(true); leave(true, { t: "closeRoom" }); };
  if (S.leader) {
    // The leader can end it all (the code is free again straight away), or,
    // mid-game, step out and let a robot keep their seat warm.
    sheet({ center: true, title: "Close the room?",
      sub: inGame ? "Ends the game for everyone and frees the room code. Or slip out and let a robot play for you."
        : "Everyone's sent home and the room code is free again. Open a new one any time.",
      body: h("div", { class: "options" },
        option({ icon: "🚪", danger: true, primary: true, label: "Close the room", small: inGame ? "Game over for everyone" : "The code is free again at once", onClick: close }),
        inGame ? option({ icon: "🤖", label: "Leave, keep it going", small: "A robot plays your seat. Come back with the leader code.", onClick: () => { closeSheet(true); leave(); } }) : null,
        option({ icon: "🪑", safe: true, label: "Stay", small: "Back to the table", onClick: () => closeSheet() })) });
    return;
  }
  sheet({ center: true, title: inGame ? "Leave the game?" : "Leave the room?",
    sub: inGame ? "A robot will take your seat. It's doing its best." : "You can come back with the room code.",
    body: h("div", { class: "options" },
      option({ icon: "🚪", danger: true, primary: true, label: "Leave", onClick: () => { closeSheet(true); leave(); } }),
      option({ icon: "🪑", safe: true, label: "Stay", small: "Back to the table", onClick: () => closeSheet() })) });
}
