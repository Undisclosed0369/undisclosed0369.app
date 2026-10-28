// Test helpers: build exact game situations without playing up to them.

import * as R from "../../x/7a3797625d3c2330/engine/rules.js";

export { R };

/** A fresh game with players a, b, c… where a is about to act, with empty
    hands, banks and tables (every card back in the deck). */
export function game(n = 3, winSets = 3) {
  const players = "abcde".slice(0, n).split("").map((id) => ({ id, name: id.toUpperCase() }));
  const s = R.createGame({ players, winSets, seed: 42 });
  for (const p of s.players) {
    s.deck.push(...p.hand, ...p.bank);
    p.hand = []; p.bank = []; p.sets = [];
  }
  s.deck.push(...s.discard); s.discard = [];
  s.turn = { player: 0, plays: 0, number: 1, toDraw: 2, drawn: false };
  s.phase = "play"; s.pending = null; s.discards = {}; s.winner = null; s.log = [];
  return s;
}

/** Pull one copy of a card (by deck id like "money-5") out of the deck. */
export function grab(s, defId) {
  const i = s.deck.findIndex((c) => s.cards[c] === defId);
  if (i < 0) throw new Error("no " + defId + " left in the deck");
  return s.deck.splice(i, 1)[0];
}

export const p = (s, id) => s.players.find((x) => x.id === id);

export function hand(s, id, ...defs) {
  return defs.map((d) => { const c = grab(s, d); p(s, id).hand.push(c); return c; });
}

export function bank(s, id, ...defs) {
  return defs.map((d) => { const c = grab(s, d); p(s, id).bank.push(c); return c; });
}

/** Lay a set on the table. Returns the set. */
export function set(s, id, color, defs, { house, hotel } = {}) {
  const st = { id: s.nextSet++, color, cards: defs.map((d) => grab(s, d)), house: null, hotel: null };
  if (house) st.house = grab(s, "action-house");
  if (hotel) st.hotel = grab(s, "action-hotel");
  p(s, id).sets.push(st);
  return st;
}

export function turnOf(s, id) {
  s.turn.player = s.players.findIndex((x) => x.id === id);
  s.turn.plays = 0;
  s.turn.toDraw = 2;
  s.turn.drawn = false;
  s.phase = "play";
}

export const total = (s) =>
  s.deck.length + s.discard.length +
  s.players.reduce((n, x) => n + x.hand.length + x.bank.length +
    x.sets.reduce((m, st) => m + st.cards.length + (st.house ? 1 : 0) + (st.hotel ? 1 : 0), 0), 0);

export const bankValue = (s, id) => p(s, id).bank.reduce((n, c) => n + R.value(s, c), 0);
export const defsOf = (s, cards) => cards.map((c) => s.cards[c]).sort();
