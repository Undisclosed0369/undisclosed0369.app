// The in-game menu, and the game-over screen.

import { completeColors } from "../engine/rules.js";
import { h, sheet, closeSheet, option, keycap } from "./sheets.js";
import { avatar, bankTotal } from "./table.js";
import * as chat from "./chat.js";
import { rulesForm } from "./controls.js";
import { sound, voice, confetti } from "./fx.js";
import { openAudio } from "./audio-panel.js";
import { line } from "./lines.js";
import * as people from "./people.js";
import * as profile from "./profile.js";
import { overlay, closeOverlay, currentOverlay, tile, openRules } from "./overlay.js";
import { playerMenu, confirmLeave, sendSettings } from "./lobby.js";
import { announced } from "./announcer.js";
import { S } from "./state.js";
import { $ } from "./util.js";

let menuParts = null;

function whoRows() {
  const v = S.view;
  if (!v) return [];
  const goal = v.options.winSets;
  return v.players.map((p) => {
    const rp = S.room?.players.find((x) => x.id === p.id) || {};
    const turn = v.turn.player === p.id && v.phase !== "over";
    return h("div", { class: "who__row" },
      avatar(p.name, { bot: rp.bot, online: rp.bot || rp.connected, animate: turn }),
      h("span", { class: "who__name" }, p.name + (p.id === S.me ? " (you)" : ""), turn ? (p.id === S.me ? " · your turn" : " · their turn") : ""),
      h("span", { class: "who__meta" }, `${completeColors(p).length}/${goal} sets · ${bankTotal(v, p)}M`),
      S.leader && p.id !== S.me && rp.id ? h("button", { class: "icon-btn icon-btn--small", type: "button", "aria-label": `Options for ${p.name}`,
        onclick: () => { closeOverlay(true); playerMenu(rp); }, html: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="12.5" cy="8" r="1.4"/></svg>' }) : null);
  });
}

function openMenu() {
  const r = S.room;
  const playing = r?.status === "playing";
  const soundTile = tile({ row: true, icon: "🎵", label: "Sound & music", small: "Effects, voices, music and its volume", onClick: () => { closeOverlay(true); openAudio(); } });

  const who = h("div", { class: "who" }, ...whoRows());
  const form = rulesForm({ settings: r.settings, editable: S.leader, playing, send: sendSettings });
  menuParts = { who, form };

  overlay("menu", h("div", { class: "menu" },
    h("header", { class: "menu__head" },
      h("div", {},
        h("p", { class: "kicker" }, "The game keeps going"),
        h("h2", { class: "menu__title" }, "Menu"),
        h("p", { class: "menu__room" }, "Room ", h("b", {}, r.code)))),
    h("div", { class: "menu__grid" },
      h("div", { class: "menu__col" },
        h("div", { class: "tiles" },
          tile({ primary: true, row: true, icon: "▶", label: "Back to the table", small: "Nobody waits. Least of all the timer.", onClick: () => closeOverlay() }),
          tile({ icon: "📖", label: "How to play", small: "Every rule, and a search", onClick: openRules }),
          tile({ icon: "💬", label: "Chat", small: "Trash talk responsibly", onClick: () => { closeOverlay(); chat.open(); } }),
          tile({ icon: "📊", label: "My stats", small: "Wins, steals, grudges", onClick: () => { const me = S.room?.players.find((p) => p.id === S.me); if (me) { closeOverlay(true); profile.openProfile(me.name); } } }),
          tile({ icon: people.isLocked() ? "🔒" : "🔓", label: people.isLocked() ? "Name locked" : "Lock my name",
            small: people.isLocked() ? "Change or remove the PIN" : "A 4-digit PIN keeps it yours", onClick: () => { closeOverlay(true); people.openLock(); } }),
          S.leader ? tile({ row: true, icon: "👥", label: "Players & bans", small: "Everyone who's ever played", onClick: () => { closeOverlay(true); people.openDirectory(); } }) : null,
          soundTile,
          S.leader && playing ? tile({ danger: true, icon: "⏹", label: "End the game", small: "Back to the lobby. Nobody wins.", onClick: confirmEnd }) : null,
          // Alone on its row (no End the game beside it), Leave spans the full width.
          tile({ danger: true, row: !(S.leader && playing), icon: "🚪", label: S.leader ? "Close or leave" : "Leave", small: S.leader ? "End it for everyone, or step out" : playing ? "A robot takes your seat" : "See you around", onClick: () => { closeOverlay(true); confirmLeave(); } }))),
      h("div", { class: "menu__col" },
        h("section", { class: "gpanel menu__card" },
          h("h3", { class: "gpanel__title" }, "At the table"), who),
        h("section", { class: "gpanel menu__card" },
          h("h3", { class: "gpanel__title" }, "Table rules ",
            h("span", { class: "gpanel__note" }, S.leader ? "Changes apply right away" : "Only the leader can change these")),
          form)))));
}

export function refreshMenu() {
  if (currentOverlay() !== "menu" || !menuParts) return;
  menuParts.form.update(S.room.settings, S.leader);
  menuParts.who.replaceChildren(...whoRows());
}

function confirmEnd() {
  closeOverlay(true);
  sheet({ center: true, title: "End the game for everyone?", sub: "Back to the lobby. The cards go back in the box.",
    body: h("div", { class: "options" },
      option({ icon: "⏹", danger: true, primary: true, label: "End it", onClick: () => { S.conn.send({ t: "endGame" }); closeSheet(); } }),
      option({ icon: "🃏", safe: true, label: "Keep playing", small: "Nobody saw anything", onClick: () => closeSheet() })) });
}

$("menu-btn").addEventListener("click", openMenu);

// ------------------------------------------------------------------ results

export function showResults() {
  const r = S.room.results;
  if (!r) return;
  const key = "results:" + r.at;
  if (S.resultsKey === key) return;
  S.resultsKey = key;
  const won = r.winner === S.me;
  setTimeout(() => {
    if (S.resultsKey !== key) return;
    closeSheet(true);
    if (won) { confetti({ count: 220, spread: 1.3 }); sound("win"); voice("win", { at: 1.6 }); } else { sound("lose"); voice("lose", { at: 1.2 }); }
    resultsOverlay(r, key);
  }, 1100);
}

/** The game-over screen itself (also where "← Results" comes back to from your stats). */
function resultsOverlay(r, key) {
  const won = r.winner === S.me;
  const winner = r.standings.find((x) => x.winner);
  const me = S.room.players.find((x) => x.id === S.me);
  overlay(key, h("div", { class: "results" },
      h("div", { class: "results__crown" }, won ? "🏆" : "👑"),
      h("p", { class: "kicker" }, "Game over"),
      h("p", { class: "results__title gradient-text" }, won ? "You win!" : `${winner.name} wins!`),
      h("p", { class: "results__line" }, won ? line("win", { p: "You" }) : line("lose")),
      h("ol", { class: "standings" }, ...r.standings.map((p, i) => h("li", { class: `standing standing--${i + 1}`, style: { animationDelay: 200 + i * 90 + "ms" } },
        h("span", { class: "standing__pos" }, i + 1),
        avatar(p.name, { bot: !!S.room.players.find((x) => x.id === p.id)?.bot }),
        h("span", { class: "standing__name" }, p.name + (p.id === S.me ? " (you)" : "")),
        h("span", { class: "standing__meta" }, `${p.sets} set${p.sets === 1 ? "" : "s"} · ${p.worth}M`)))),
      me ? h("button", { class: "results__stats", type: "button", onclick: () => profile.openProfile(me.name, { back: () => (S.resultsKey === key ? resultsOverlay(r, key) : closeOverlay()), backLabel: "Results", closable: false }) },
        "📊 Stats updated. History will remember this.", h("span", {}, "See mine →")) : null,
      h("div", { class: "results__actions" + (S.leader ? "" : " results__actions--wait") },
        S.leader
          ? h("button", { class: "btn btn--primary btn--big", type: "button", "data-default": true, onclick: () => { sound("deal"); S.conn.send({ t: "rematch" }); } }, h("span", {}, "Rematch"), keycap())
          : h("p", { class: "results__wait" }, "Waiting for the leader to call a rematch…"),
        h("button", { class: "btn btn--quiet btn--big", type: "button", onclick: () => { closeOverlay(true); confirmLeave(); } },
          h("span", {}, S.leader ? "Close the room" : "Leave the table")))), { closable: false });
}

export function closeResults() {
  // Your stats opened from the game-over screen go with it (a rematch started).
  if (currentOverlay()?.startsWith("results:") || (currentOverlay() === "profile" && S.resultsKey)) closeOverlay();
  if (S.resultsKey) { S.resultsKey = null; announced.clear(); S.lastTurnMine = false; }
}
