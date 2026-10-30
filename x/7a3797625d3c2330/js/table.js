// Draws the table from the player's view, and animates every card that
// moved since the last draw.
//
// Seats go around a felt in turn order, the way people sit at a real table:
// you at the bottom, the next player on your left, then across, then your
// right. Every opponent's sets and bank are drawn as real cards.
//
// Animation is "FLIP": before redrawing, note where every card is on screen;
// after, move each card back to where it was and let it glide to its new
// place along a little arc. Cards that arrive from somewhere not drawn as
// cards (the deck, an opponent's hand) start from that pile or player.

import { COLORS, COLOR_VALUE } from "../engine/deck.js";
import { DEF, setSize, isComplete, completeColors } from "../engine/rules.js";
import { h, cardEl, cardSrc } from "./sheets.js";
import { sound } from "./fx.js";
import { picArt, picContent, animate as animatePic } from "./pictures.js";
import { $, reduceMotion } from "./util.js";

export const defOf = (view, card) => DEF[view.cards[card]];
/** What a card is worth. House rule: a rainbow wild on the table is worth a
    property of its color; in hand, nothing. */
export const valueOf = (view, card) => {
  const d = defOf(view, card);
  if (d?.id === "wild-any") {
    const s = view.players.flatMap((p) => p.sets).find((x) => x.cards.includes(card));
    return s ? COLOR_VALUE[s.color] : 0;
  }
  return d?.value || 0;
};

const GRADIENTS = [
  ["#8d42f5", "#e042f5"], ["#42a1f5", "#42e0f5"], ["#f5a142", "#ff5a5f"], ["#2fbf71", "#42e0f5"],
  ["#e042f5", "#ff5a5f"], ["#5b5bf5", "#42a1f5"], ["#f5c542", "#f5a142"], ["#ff5a8a", "#8d42f5"],
];
/**
 * A player's avatar: their picture (Phase 6D) if they've picked one, else
 * their initial on a gradient. animate: a GIF picture plays (their turn,
 * their full-screen view); otherwise it plays only under the mouse.
 */
export function avatar(name, { bot = false, online = true, animate = false } = {}) {
  const dot = h("span", { class: "avatar__dot" + (online ? "" : " is-off") });
  const art = !bot && picArt(name);
  if (art) {
    const el = h("span", { class: "avatar avatar--" + (art.photo ? "photo" : "preset") + (art.gif ? " avatar--gif" : ""), "data-ring": art.ring || null,
      "data-keep": animate && art.gif ? "" : null,
      style: art.colors ? { "--av": `linear-gradient(135deg, ${art.colors[0]}, ${art.colors[1]})` } : null },
      picContent(art), dot);
    el._art = art;
    if (animate && art.gif) animatePic(el, true);
    return el;
  }
  let hsh = 0;
  for (const ch of name) hsh = (hsh * 31 + ch.codePointAt(0)) >>> 0;
  const [a, b] = GRADIENTS[hsh % GRADIENTS.length];
  return h("span", { class: "avatar", style: { "--av": `linear-gradient(135deg, ${a}, ${b})` } },
    bot ? "🤖" : name.trim()[0].toUpperCase(), dot);
}

// A seat's stats always fit, however narrow the seat: if they'd overflow,
// the words go first ("in hand", "Bank"), then the little fan of card
// backs. The sets counter is never cut. How wide each version is gets
// measured once per seat (again if the window changes); after that, a seat
// that grows or shrinks (every turn, on every frame of it) just picks the
// version that fits, without measuring anything.
// (Applied on the next frame: hiding the fan of card backs changes the
// stats' height, and changing what's being observed from inside the
// observer would have the browser complain and re-check.)
const fits = new Map();
const metaFit = new ResizeObserver((entries) => {
  if (!fits.size) requestAnimationFrame(() => { for (const [m, w] of fits) if (m.isConnected) fitMeta(m, w); fits.clear(); });
  for (const e of entries) fits.set(e.target, Math.round(e.contentRect.width));
});
function fitMeta(m, width = m.clientWidth) {
  const key = innerWidth + "x" + innerHeight;
  if (m._fit?.key !== key) {
    m.classList.remove("is-tight", "is-tighter");
    const full = m.scrollWidth;
    m.classList.add("is-tight");
    m._fit = { key, full, tight: m.scrollWidth };
    width = m.clientWidth;
  }
  m.classList.toggle("is-tight", m._fit.full > width + 1);
  m.classList.toggle("is-tighter", m._fit.tight > width + 1);
}

const TYPE_ORDER = { property: 0, wild: 1, rent: 2, action: 3, money: 4 };
const COLOR_ORDER = Object.keys(COLORS);
function handOrder(view) {
  return (a, b) => {
    const x = defOf(view, a), y = defOf(view, b);
    return TYPE_ORDER[x.type] - TYPE_ORDER[y.type] ||
      COLOR_ORDER.indexOf(x.color) - COLOR_ORDER.indexOf(y.color) ||
      y.value - x.value || x.id.localeCompare(y.id) || a.localeCompare(b);
  };
}

/** A card in a set. A two-color wild is printed with its first color upright
 *  and its second upside down, so it's turned around when it's the second. */
export function setCardEl(view, card, color) {
  const el = cardEl(card, view.cards[card]);
  if (isTurned(view, card, color)) el.classList.add("is-turned");
  return el;
}
const isTurned = (view, card, color) => {
  const d = defOf(view, card);
  return d?.type === "wild" && d.colors.length === 2 && color === d.colors[1];
};

export const bankTotal = (view, p) => p.bank.reduce((n, c) => n + valueOf(view, c), 0);

/** Who sits where, by how many opponents there are. */
function seatsFor(others) {
  const [a, b, c, d] = others;
  switch (others.length) {
    case 1: return { left: [], top: [a], right: [] };
    case 2: return { left: [a], top: [], right: [b] };
    case 3: return { left: [a], top: [b], right: [c] };
    default: return { left: [a], top: [b, c], right: [d] };
  }
}

function timerEl() {
  return h("span", { class: "timer", html: '<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="16"/><circle class="timer__arc" cx="18" cy="18" r="16"/></svg><span></span>' });
}

// Last known colour of every card on a table, to spot wilds being flipped.
const lastColor = new Map();

// Only what changed is rebuilt. Each piece of the table (a seat, a set, the
// bank, the hand…) is kept with a signature of everything it was drawn from;
// an update that leaves the signature alone leaves the element alone too, so
// a robot's turn redraws its own seat and not the whole table. That saves
// phones rebuilding and re-decoding dozens of cards several times a second.
const kept = new Map(); // key → { sig, el }
let used = new Set();
function keep(key, sig, build) {
  used.add(key);
  const was = kept.get(key);
  if (was && was.sig === sig) return was.el;
  const el = build();
  kept.set(key, { sig, el });
  return el;
}
/** Put exactly these nodes in the box, in order, without touching the ones
 *  already in place (moving an element would replay its animations). */
function sync(box, nodes) {
  nodes = nodes.filter(Boolean);
  for (let i = 0; i < nodes.length; i++) {
    const at = box.children[i];
    if (at !== nodes[i]) box.insertBefore(nodes[i], at || null);
  }
  while (box.children.length > nodes.length) box.lastElementChild.remove();
}

// ------------------------------------------------------------------ draw

/**
 * G: { me, view, room, moves, myTurn }
 * handlers: { opp(pid), bank(), options?(pid) } — taps on your own cards come through drag.js;
 * `options` (the leader only) puts a player-options button on each seat.
 */
export function renderTable(G, handlers) {
  const { view, me } = G;
  const players = view.players;
  const mine = players.find((p) => p.id === me) || { hand: [], bank: [], sets: [] };
  const seat = Math.max(0, players.findIndex((p) => p.id === me));
  const others = players.slice(seat + 1).concat(players.slice(0, seat)).filter((p) => p.id !== me);
  const awaiting = new Set(view.awaiting.map((a) => a.id));
  const roomPlayer = (pid) => G.room?.players.find((p) => p.id === pid) || {};
  // A card's id with its design: ids are only unique within one game.
  const ids = (cards) => cards.filter(Boolean).map((c) => c + ":" + view.cards[c]);
  used = new Set();

  // Opponents, around the felt
  const layout = seatsFor(others);
  const tbl = $("tbl");
  tbl.classList.toggle("has-left", layout.left.length > 0);
  tbl.classList.toggle("has-right", layout.right.length > 0);
  // Whoever's turn it is gets the spotlight: their seat grows, the rest
  // shrink back. On your turn, every opponent steps back for your cards.
  const turnOf = view.phase === "over" ? null : view.turn.player;
  tbl.classList.toggle("is-my-turn", turnOf === me);
  for (const side of ["left", "top", "right"]) tbl.classList.toggle("active-" + side, layout[side].some((p) => p.id === turnOf));
  for (const side of ["left", "top", "right"]) {
    sync($("side-" + side), layout[side].map((p) => {
      const rp = roomPlayer(p.id);
      const sig = JSON.stringify([p.name, p.hand, p.sets.map((s) => [s.id, s.color, ids([...s.cards, s.house, s.hotel])]),
        ids(p.bank.slice(-3)), bankTotal(view, p), completeColors(p).length, view.options.winSets, view.phase, turnOf === p.id,
        awaiting.has(p.id), view.turn.player === p.id ? view.turn.plays : -1, rp.bot, rp.connected, rp.takeover, !!handlers.options, picArt(p.name)]);
      return keep("opp:" + p.id, sig, () => oppSeat(p));
    }));
  }
  // A new seat is fitted now, before it's drawn; the observer then only has
  // to pick a version when it changes size.
  metaFit.disconnect();
  for (const m of tbl.querySelectorAll(".oseat__meta")) { if (!m._fit) fitMeta(m); metaFit.observe(m); }

  function oppSeat(p) {
    const rp = roomPlayer(p.id);
    const turn = view.turn.player === p.id && view.phase !== "over";
    const sets = p.sets.map((s) => h("span", { class: "oset" + (isComplete(s) ? " is-full" : ""), "data-set": s.id, "data-color": s.color, title: `${COLORS[s.color].name} ${Math.min(s.cards.length, setSize(s.color))}/${setSize(s.color)}` },
      ...[...s.cards, s.house, s.hotel].filter(Boolean).map((c) => setCardEl(view, c, s.color))));
    const bank = p.bank.length ? h("span", { class: "obank" },
      h("span", { class: "obank__stack" }, ...p.bank.slice(-3).map((c, i, top) => {
        const el = cardEl(c, view.cards[c]);
        el.style.transform = `translate(${(i - top.length + 1) * 2}px, ${(i - top.length + 1) * 2}px)`;
        return el;
      })),
      h("b", {}, bankTotal(view, p) + "M")) : null;
    const backs = Math.min(p.hand, 5);
    return h("div", { class: "oseat" + (turn || awaiting.has(p.id) ? " is-turn" : "") + (turn ? " is-active" : ""), role: "button", tabindex: "0",
      "data-opp": p.id, "data-drop": "opp", onclick: () => handlers.opp(p.id),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") handlers.opp(p.id); } },
      h("div", { class: "oseat__head" },
        avatar(p.name, { bot: rp.bot, online: rp.bot || rp.connected, animate: turn && view.phase !== "over" }),
        h("div", { class: "oseat__who" },
          h("span", { class: "oseat__name" }, h("span", { class: "oseat__nm" }, p.name), rp.takeover ? h("span", { class: "oseat__ai", style: { marginLeft: ".35rem" } }, "AI") : null,
            turn && view.phase === "play" ? playsBadge(view.turn.plays) : null),
          h("span", { class: "oseat__meta" },
            h("span", { class: "oseat__stat", title: `${p.hand} in hand` },
              h("span", { class: "fan-backs" }, ...Array.from({ length: backs }, (_, i) => h("i", { style: { transform: `rotate(${(i - (backs - 1) / 2) * 12}deg) translateX(${i * 2}px)` } }))),
              h("b", {}, p.hand), h("span", { class: "oseat__word" }, " in hand")),
            h("span", { class: "oseat__stat", title: "Bank" }, h("span", { class: "oseat__word" }, "Bank "), h("b", {}, bankTotal(view, p) + "M")),
            // Sets that count towards winning: complete, and each a different color.
            h("span", { class: "oseat__stat oseat__goal" + (completeColors(p).length >= view.options.winSets - 1 ? " is-close" : ""),
              title: "Complete sets, in different colors, towards the win", "aria-label": `${completeColors(p).length} of ${view.options.winSets} sets` },
              h("b", {}, `${completeColors(p).length}/${view.options.winSets}`)))),
        // The leader's way into this player's options, right on their seat.
        handlers.options ? h("button", { class: "oseat__opts", type: "button", title: `Options for ${p.name}`, "aria-label": `Options for ${p.name}`,
          onclick: (e) => { e.stopPropagation(); handlers.options(p.id); },
          onpointerdown: (e) => e.stopPropagation() },
          h("span", { class: "oseat__dots", "aria-hidden": "true", html: '<svg viewBox="0 0 16 16"><circle cx="3" cy="8" r="1.6"/><circle cx="8" cy="8" r="1.6"/><circle cx="13" cy="8" r="1.6"/></svg>' }),
          h("span", { class: "oseat__optlabel" }, "Options")) : null),
      h("div", { class: "oseat__table" }, ...sets, bank,
        !p.sets.length && !p.bank.length ? h("span", { class: "oseat__empty" }, "Nothing on the table yet") : null),
      awaiting.has(p.id) ? timerEl() : null);
  }

  // Plays left, on whoever's turn it is.
  function playsBadge(used) {
    const left = Math.max(0, 3 - used);
    return h("span", { class: "plays-badge" + (left ? "" : " is-done"), title: `${left} play${left === 1 ? "" : "s"} left` },
      h("span", { class: "plays-badge__pips" }, ...[0, 1, 2].map((k) => h("i", { class: k < used ? "is-used" : "" }))),
      h("b", {}, left ? `${left} left` : "done"));
  }

  // My sets
  sync($("my-sets"), mine.sets.map((s) => keep("set:" + s.id, JSON.stringify([s.color, ids([...s.cards, s.house, s.hotel])]), () => {
    const size = setSize(s.color);
    const cards = [...s.cards, s.house, s.hotel].filter(Boolean)
      .map((c) => setCardEl(view, c, s.color));
    return h("div", { class: "set" + (isComplete(s) ? " is-full" : ""), "data-set": s.id, "data-color": s.color, "data-drop": "set" },
      ...cards, h("span", { class: "set__count" }, `${Math.min(s.cards.length, size)}/${size}`),
      isComplete(s) ? h("span", { class: "set__sheen", "aria-hidden": "true" }, shine(h("i"))) : null);
  })));

  // My bank: the top three notes, and the total.
  const total = bankTotal(view, mine);
  const top = mine.bank.slice(-3);
  const bankSig = JSON.stringify([ids(top), total]);
  if (kept.get("bank")?.sig !== bankSig) $("my-bank").replaceChildren(
    top.length
      ? h("span", { class: "bank__stack" }, ...top.map((c, i) => {
        const el = cardEl(c, view.cards[c]);
        el.style.transform = `translate(${(i - top.length + 1) * 3}px, ${(i - top.length + 1) * 3}px)`;
        return el;
      }))
      : h("span", { class: "bank__empty" }, "Bank"),
    h("span", { class: "bank__total" }, total + "M"),
    h("span", { class: "bank__label" }, "Bank"));
  kept.set("bank", { sig: bankSig });
  used.add("bank");
  $("my-bank").onclick = handlers.bank;

  // Piles
  $("deck").querySelector(".pile__count").textContent = view.deck;
  const canDraw = G.moves.some((m) => m.type === "draw");
  $("deck").classList.toggle("is-drawable", canDraw);
  $("deck").setAttribute("role", canDraw ? "button" : "img");
  $("deck").tabIndex = canDraw ? 0 : -1;
  const cta = $("deck").querySelector(".pile__cta");
  cta.replaceChildren(`Tap to draw ${view.turn.toDraw || 2}`, h("kbd", { class: "keycap keycap--cta", "aria-hidden": "true" }, "↩"));
  const topDiscard = view.discard[view.discard.length - 1];
  sync($("discard"), topDiscard ? [keep("discard", ids([topDiscard])[0], () => cardEl(topDiscard, view.cards[topDiscard]))] : []);

  // Hand: fanned, overlapping more as it grows.
  const hand = Array.isArray(mine.hand) ? [...mine.hand].sort(handOrder(view)) : [];
  const playable = new Set(G.moves.filter((m) => m.card).map((m) => m.card));
  const n = hand.length;
  const handEl = $("hand");
  const room = handEl.clientWidth || innerWidth * 0.6;
  const cw = handEl.querySelector(".card")?.offsetWidth || 90;
  const overlap = n > 1 ? Math.min(-0.06, Math.max(-0.72, (room - cw) / (n - 1) / cw - 1)) : 0;
  handEl.style.setProperty("--overlap", overlap);
  handEl.classList.toggle("is-waiting", !G.myTurn);
  const dimmed = (c) => G.myTurn && view.phase === "play" && !playable.has(c);
  sync(handEl, hand.map((c, i) => {
    const mid = (n - 1) / 2;
    const el = keep("hand:" + c, JSON.stringify([view.cards[c], i, n, dimmed(c)]), () => {
      const card = cardEl(c, view.cards[c]);
      card.style.setProperty("--tilt", ((i - mid) * Math.min(4, 22 / Math.max(n, 1))).toFixed(2) + "deg");
      card.style.setProperty("--lift", Math.min(12, Math.abs(i - mid) ** 1.5 * 1.3).toFixed(1));
      if (dimmed(c)) card.classList.add("is-dim");
      return card;
    });
    // A card dropped on the table hides until the server answers; if it
    // comes straight back (refused), it shows again.
    el.style.visibility = "";
    return el;
  }));

  // Plays left, end turn
  const myTurn = view.turn.player === me && view.phase === "play";
  const pips = $("plays");
  pips.classList.toggle("is-off", !myTurn);
  [...pips.children].forEach((i, k) => i.classList.toggle("is-used", k < view.turn.plays));
  const left = Math.max(0, 3 - view.turn.plays);
  const label = $("plays-left");
  label.textContent = !myTurn ? "" : view.turn.drawLost ? (left ? `${left} left · no draw` : "No plays left") : !view.turn.drawn ? "Draw first" : left ? `${left} play${left === 1 ? "" : "s"} left` : "No plays left";
  label.classList.toggle("is-done", myTurn && view.turn.drawn && !left);
  const canEnd = G.moves.some((m) => m.type === "endTurn");
  const end = $("end-turn");
  end.disabled = !canEnd;
  end.classList.toggle("is-ready", canEnd && !canDraw && view.turn.plays >= 3);
  readyGlow(end.classList.contains("is-ready"));

  // A wild card that changed colour flips over.
  const seen = new Set();
  for (const p of players) {
    for (const s of p.sets) {
      for (const c of s.cards) {
        seen.add(c);
        const was = lastColor.get(c);
        lastColor.set(c, s.color);
        if (was && was !== s.color && defOf(view, c)?.type === "wild") {
          const el = document.querySelector(`#table [data-card="${c}"]`);
          if (!el) continue;
          sound("flip");
          const from = isTurned(view, c, was) ? 180 : 0, to = isTurned(view, c, s.color) ? 180 : 0;
          if (from !== to && !reduceMotion.matches) {
            // Spin it round to its new color, like turning a real card.
            el.querySelector("img")?.animate([
              { transform: `rotate(${from}deg) scale(1)` },
              { transform: `rotate(${(from + to) / 2 + 90}deg) scale(1.12)`, offset: 0.5 },
              { transform: `rotate(${to === 0 ? 360 : 180}deg) scale(1)` },
            ], { duration: 750, easing: "cubic-bezier(.3,1.3,.4,1)" });
          } else { el.classList.remove("is-flip"); void el.offsetWidth; el.classList.add("is-flip"); }
        }
      }
    }
  }
  for (const c of [...lastColor.keys()]) if (!seen.has(c)) lastColor.delete(c);
  for (const k of [...kept.keys()]) if (!used.has(k)) kept.delete(k);
}

// The shine on a complete set: one sweep across, then a pause, for as long
// as the set is on the table. Nothing moves during the pause, so nothing is
// redrawn (a looping animation would keep the screen busy through it).
function shine(streak) {
  if (reduceMotion.matches) return streak;
  const sweep = () => {
    // A slow loop ("ambient", frames.js): 30 frames a second on fast displays.
    const a = streak.animate([{ transform: "translateX(-90%)" }, { transform: "translateX(60%)" }], { duration: 2100, easing: "ease-in-out", id: "ambient" });
    a.onfinish = () => setTimeout(() => { if (streak.isConnected) sweep(); }, 1400);
  };
  sweep();
  return streak;
}

// "End turn" glows while it's the only thing left to do: lit for the middle
// half of every 2.2 seconds. The glow only ever switches on and off, so a
// timer flips it; an animation would have the browser redo the button on
// every frame in between.
let glow = null;
function readyGlow(on) {
  const end = $("end-turn");
  if (!on || reduceMotion.matches) {
    if (glow) { clearTimeout(glow.wait); clearInterval(glow.every); glow = null; }
    end.classList.remove("is-lit");
    return;
  }
  if (glow) return;
  const flip = () => end.classList.toggle("is-lit");
  glow = { wait: setTimeout(() => { flip(); glow.every = setInterval(flip, 1100); }, 550) };
}

/** A full-screen menu or a sheet's frosted backdrop is over the table. */
const covered = () => !!document.querySelector(".overlay:not(.is-out), .scrim:not(.is-out)");

// ------------------------------------------------------------------ motion

/** Where everything is right now. `override` pins a card's start (a drop). */
export function capture(override) {
  const cards = new Map();
  for (const el of document.querySelectorAll("#table [data-card]")) {
    cards.set(el.dataset.card, { rect: el.getBoundingClientRect(), src: el.querySelector("img")?.getAttribute("src") });
  }
  if (override) cards.set(override.card, { rect: override.rect, src: override.src });
  const opps = new Map();
  for (const el of document.querySelectorAll("#table [data-opp]")) opps.set(el.dataset.opp, el.getBoundingClientRect());
  return { cards, opps, deck: $("deck").getBoundingClientRect(), discard: $("discard").getBoundingClientRect() };
}

/** Glide every card from where it was to where it is. */
export function animateFrom(before, events, view, me) {
  // Under a frosted menu or sheet, cards just go where they're going: a glide
  // nobody can see would still have the whole blur redone on every frame.
  if (!before || reduceMotion.matches || document.hidden || covered()) return;
  const actorOf = (card) => {
    for (const e of events) {
      if (e.card === card || e.take === card || e.give === card || e.cards?.includes(card) || e.doubles?.includes(card)) return e.p || e.from || e.a;
    }
    return null;
  };
  const oppRect = (pid) => before.opps.get(pid) || document.querySelector(`[data-opp="${pid}"]`)?.getBoundingClientRect();
  let stagger = 0;

  // Cards changing hands (rent, steals, swaps, a Deal Breaker) go one at a
  // time, slowly, glowing in the colour of what's happening, and both seats
  // light up, so everyone can follow who lost what to whom.
  const moving = transfers(events);
  let slow = 0;
  const slowNext = (kind) => { const d = slow; slow += TRANSFER[kind].gap; return d; };
  for (const e of events) {
    const kind = e.t === "pay" ? "pay" : e.t === "swap" ? "swap" : e.t === "steal" ? (e.kind === "deal-breaker" ? "breaker" : "steal") : null;
    if (!kind || (e.t === "pay" && !e.cards.length)) continue;
    const [from, to] = e.t === "swap" ? [e.a, e.b] : [e.from, e.to];
    pulse(from, me, TRANSFER[kind].color, 0);
    pulse(to, me, TRANSFER[kind].color, 450);
  }

  // Drawing (the turn's cards, Pass Go): yours come off the deck face down
  // and flip over in your hand; everyone else's fly to their seat.
  const drawnByMe = events.some((e) => e.t === "draw" && e.p === me);
  let dealt = 0;
  for (const e of events) {
    if (e.t !== "draw" || e.p === me) continue;
    const seat = document.querySelector(`[data-opp="${e.p}"]`);
    for (let k = 0; k < e.n; k++) toSeat(seat, (dealt++) * DEAL_GAP, before.deck);
  }

  for (const el of document.querySelectorAll("#table [data-card]")) {
    const id = el.dataset.card;
    const now = el.getBoundingClientRect();
    if (!now.width) continue;
    if (drawnByMe && !before.cards.has(id) && el.closest("#hand")) {
      toHand(el, (dealt++) * DEAL_GAP, before.deck);
      continue;
    }
    let from = before.cards.get(id)?.rect;
    let scale = from ? from.width / now.width : 0;
    if (!from) {
      const actor = actorOf(id);
      if (actor && actor !== me) {
        const r = oppRect(actor);
        if (r) { from = { left: r.left + r.width / 2 - 20, top: r.top + 10, width: 40, height: 62 }; }
        scale = 40 / now.width;
      } else { from = before.deck; scale = from ? from.width / now.width : 1; }
    }
    if (!from) continue;
    const dx = from.left + from.width / 2 - (now.left + now.width / 2);
    const dy = from.top + from.height / 2 - (now.top + now.height / 2);
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) continue;
    const kind = moving.get(id);
    if (kind) { fly(el, dx, dy, scale, slowNext(kind), TRANSFER[kind]); continue; }
    fly(el, dx, dy, scale, stagger);
    stagger += 55;
  }

  // Cards that left the drawn table (into someone's hand, or under the
  // discard pile): a ghost carries them there.
  const present = new Set([...document.querySelectorAll("#table [data-card]")]
    .filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.dataset.card));
  for (const [id, was] of before.cards) {
    if (present.has(id) || !was.src) continue;
    const owner = view.players.find((p) => p.id !== me &&
      (p.bank.includes(id) || p.sets.some((s) => s.cards.includes(id) || s.house === id || s.hotel === id)));
    const to = owner ? document.querySelector(`[data-opp="${owner.id}"]`)?.getBoundingClientRect() : $("discard").getBoundingClientRect();
    if (!to) continue;
    const kind = moving.get(id);
    if (kind) { ghost(was.src, was.rect, to, slowNext(kind), TRANSFER[kind]); continue; }
    ghost(was.src, was.rect, to, stagger);
    stagger += 55;
  }
}

/** How each kind of hand-over looks: glow colour, flight time, gap between cards. */
const TRANSFER = {
  pay: { color: "rgba(255, 207, 107, .95)", ms: 1150, gap: 260 },
  steal: { color: "rgba(255, 90, 95, .95)", ms: 1250, gap: 260 },
  swap: { color: "rgba(90, 170, 255, .95)", ms: 1250, gap: 420 },
  breaker: { color: "rgba(224, 66, 245, .95)", ms: 1300, gap: 230 },
};

/** card → which kind of hand-over it's part of, from this update's events. */
function transfers(events) {
  const out = new Map();
  for (const e of events) {
    if (e.t === "pay") for (const c of e.cards) out.set(c, "pay");
    else if (e.t === "steal") for (const c of e.cards) out.set(c, e.kind === "deal-breaker" ? "breaker" : "steal");
    else if (e.t === "swap") { out.set(e.gave, "swap"); out.set(e.took, "swap"); }
  }
  return out;
}

/** A soft ring of light round a seat (or your own table). */
function pulse(pid, me, color, delay) {
  const el = pid === me ? $("mine") : document.querySelector(`[data-opp="${pid}"]`);
  if (!el) return;
  el.animate([
    { boxShadow: `0 0 0 0 ${color.replace(/[\d.]+\)$/, "0)")}` },
    { boxShadow: `0 0 0 2px ${color}, 0 0 34px -4px ${color}`, offset: 0.35 },
    { boxShadow: `0 0 0 0 ${color.replace(/[\d.]+\)$/, "0)")}` },
  ], { duration: 1400, delay, easing: "ease-out" });
}

// ------------------------------------------------------------------ dealing

const DEAL_GAP = 110; // ms between cards leaving the deck
const BACK = cardSrc(null);

/** A face-down card from the deck to a spot on screen. Resolves on landing. */
function flight(from, to, delay, { fade = false } = {}) {
  return new Promise((done) => {
    if (!from || !to) return done();
    const g = h("div", { class: "ghost ghost--deal", style: { left: from.left + "px", top: from.top + "px", width: from.width + "px", height: from.height + "px" } },
      h("img", { src: BACK, alt: "" }));
    document.body.append(g);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = to.width / from.width;
    const spin = (Math.random() - 0.5) * 18;
    const lift = Math.min(90, 26 + Math.hypot(dx, dy) * 0.12);
    const anim = g.animate([
      { transform: "none", opacity: 0 },
      { transform: `translate(${dx * 0.08}px, ${dy * 0.08 - 10}px) rotate(${spin / 3}deg)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - lift}px) scale(${(1 + scale) / 2 * 1.06}) rotate(${spin}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: fade ? 0 : 1 },
    ], { duration: 520, delay, easing: "cubic-bezier(.25,.8,.3,1)", fill: "both" });
    anim.onfinish = () => { g.remove(); done(); };
  });
}

/** One of your cards: hidden until its face-down twin lands, then flips up. */
function toHand(el, delay, deck) {
  const to = el.getBoundingClientRect();
  el.style.opacity = "0";
  flight(deck, to, delay).then(() => {
    el.style.opacity = "";
    // Added on top of the card's own fan angle, so it flips where it sits.
    el.animate([
      { transform: "perspective(700px) rotateY(90deg) scale(1.04)" },
      { transform: "perspective(700px) rotateY(0deg) scale(1)" },
    ], { duration: 280, easing: "cubic-bezier(.2,.9,.3,1.2)", composite: "add" });
    sound("card");
  });
}

/** A card for someone else: into their seat, which gives a little nod. */
function toSeat(seat, delay, deck) {
  if (!seat) return;
  const r = seat.getBoundingClientRect();
  const fan = seat.querySelector(".fan-backs")?.getBoundingClientRect();
  const w = Math.max(18, Math.min(34, r.height * 0.3));
  const at = fan && fan.width ? { left: fan.left + fan.width / 2 - w / 2, top: fan.top + fan.height / 2 - w * 0.78, width: w, height: w * 1.56 }
    : { left: r.left + r.width / 2 - w / 2, top: r.top + 8, width: w, height: w * 1.56 };
  flight(deck, at, delay, { fade: true }).then(() => {
    seat.animate([{ transform: "scale(1)" }, { transform: "scale(1.025)" }, { transform: "scale(1)" }], { duration: 260, easing: "ease-out" });
  });
}

/**
 * The deal at the start of a game: five rounds round the table, one card at
 * a time, starting with the first player. Your cards land face down and flip.
 */
export function dealIn(view, me, lead = 600) {
  if (reduceMotion.matches || document.hidden) return;
  const mine = [...document.querySelectorAll("#hand .card")];
  for (const el of mine) el.style.opacity = "0";
  // Wait for the table to finish fading in, so every card is seen leaving.
  setTimeout(() => deal(view, me, mine), lead);
}

function deal(view, me, mine) {
  const deck = $("deck").getBoundingClientRect();
  const n = view.players.length;
  const first = view.players.findIndex((p) => p.id === view.turn.player);
  let k = 0;
  for (let round = 0; round < 5; round++) {
    for (let i = 0; i < n; i++) {
      const p = view.players[(Math.max(0, first) + i) % n];
      if (p.id === me) { if (mine[round]) toHand(mine[round], k * DEAL_GAP, deck); }
      else toSeat(document.querySelector(`[data-opp="${p.id}"]`), k * DEAL_GAP, deck);
      k++;
    }
  }
}

/** `slow` (a TRANSFER entry): a longer, higher flight with a glow, for cards changing hands. */
function fly(el, dx, dy, scale, delay, slow = null) {
  const lift = Math.min(slow ? 150 : 110, (slow ? 60 : 34) + Math.hypot(dx, dy) * (slow ? 0.2 : 0.14));
  const spin = (Math.random() - 0.5) * (slow ? 10 : 16);
  const duration = slow ? slow.ms : 680;
  el.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, zIndex: 50 },
    // Held up for a beat at the top of the arc, big enough to read.
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(${slow ? 1.35 : (scale + 1) / 2 * 1.1}) rotate(${spin}deg)`, offset: slow ? 0.42 : 0.5, zIndex: 50 },
    ...(slow ? [{ transform: `translate(${dx * 0.42}px, ${dy * 0.42 - lift}px) scale(1.35) rotate(${spin}deg)`, offset: 0.58, zIndex: 50 }] : []),
    { transform: "none", zIndex: 50 },
  ], { duration, delay, easing: slow ? "cubic-bezier(.45,.05,.25,1)" : "cubic-bezier(.22,.85,.25,1)", fill: "backwards", composite: "add" });
  if (slow) {
    el.animate([
      { boxShadow: `0 0 0 0 transparent`, zIndex: 50 },
      { boxShadow: `0 0 0 2px ${slow.color}, 0 18px 40px -8px ${slow.color}`, offset: 0.4, zIndex: 50 },
      { boxShadow: `0 0 0 2px ${slow.color}, 0 18px 40px -8px ${slow.color}`, offset: 0.7, zIndex: 50 },
      { boxShadow: `0 0 0 0 transparent`, zIndex: 50 },
    ], { duration: duration + 250, delay, easing: "ease-out", fill: "backwards" });
  }
}

function ghost(src, from, to, delay, slow = null) {
  const g = h("div", { class: "ghost", style: { left: from.left + "px", top: from.top + "px", width: from.width + "px", height: from.height + "px" } },
    h("img", { src, alt: "" }));
  document.body.append(g);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const lift = slow ? Math.min(150, 60 + Math.hypot(dx, dy) * 0.2) : 70;
  const glow = slow ? `0 0 0 2px ${slow.color}, 0 18px 40px -8px ${slow.color}` : "0 30px 60px -20px rgba(0, 0, 0, .9)";
  const anim = g.animate(slow ? [
    { transform: "none", opacity: 1, boxShadow: "0 0 0 0 transparent" },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(1.35) rotate(-6deg)`, opacity: 1, boxShadow: glow, offset: 0.42 },
    { transform: `translate(${dx * 0.58}px, ${dy * 0.58 - lift}px) scale(1.35) rotate(-6deg)`, opacity: 1, boxShadow: glow, offset: 0.58 },
    { transform: `translate(${dx}px, ${dy}px) scale(.45)`, opacity: 0, boxShadow: "0 0 0 0 transparent" },
  ] : [
    { transform: "none", opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 70}px) scale(1.05) rotate(-8deg)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(.3)`, opacity: 0 },
  ], { duration: slow ? slow.ms + 150 : 760, delay, easing: slow ? "cubic-bezier(.45,.05,.25,1)" : "cubic-bezier(.3,.7,.3,1)", fill: "both" });
  anim.onfinish = () => g.remove();
}
