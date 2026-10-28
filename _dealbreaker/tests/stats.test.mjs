// Phase 6B: counting a game for player statistics, and adding it into a profile.

import { test } from "node:test";
import assert from "node:assert/strict";
import { R, game, hand, bank, set } from "./helpers.mjs";
import { blankTally, tallyEvents, gameRecord, addGame, top } from "../../x/7a3797625d3c2330/engine/stats.js";

const drawn = (s) => { s.turn.drawn = true; return s; };
/** Track every player; `bots` are seats an AI is playing (not counted). */
function tracker(s, bots = []) {
  const t = Object.fromEntries(s.players.map((p) => [p.id, blankTally()]));
  const names = Object.fromEntries(s.players.map((p) => [p.id, p.name]));
  return { t, run: (events) => tallyEvents(t, s, events, (id) => !bots.includes(id), names) };
}

test("rent: collected and paid, and the biggest single rent across everyone it charged", () => {
  const s = drawn(game());
  const { t, run } = tracker(s);
  const [card] = hand(s, "a", "rent-red-yellow");
  const st = set(s, "a", "red", ["prop-kentucky", "prop-indiana"]);
  const [b3] = bank(s, "b", "money-3");
  const [c3] = bank(s, "c", "money-3");
  run(R.act(s, "a", { type: "rent", card, set: st.id }));
  run(R.act(s, "b", { type: "pay", cards: [b3] }));
  run(R.act(s, "c", { type: "pay", cards: [c3] }));
  assert.equal(t.a.actions.rent, 1);
  assert.equal(t.a.rentCollected, 6);
  assert.equal(t.a.maxRent, 6, "one rent card, two payers: 6M in one go");
  assert.equal(t.b.rentPaid, 3);
  assert.equal(t.c.paid, 3);
});

test("only a player's own moves count: an AI in their seat earns them nothing", () => {
  const s = drawn(game());
  const { t, run } = tracker(s, ["a"]);
  const [m] = hand(s, "a", "money-5");
  run(R.act(s, "a", { type: "bank", card: m }));
  assert.equal(t.a.banked, 0);
  const s2 = drawn(game());
  const k = tracker(s2);
  const [m2, go] = hand(s2, "a", "money-5", "action-pass-go");
  k.run(R.act(s2, "a", { type: "bank", card: m2 }));
  k.run(R.act(s2, "a", { type: "bank", card: go }));
  assert.equal(k.t.a.banked, 6, "cash put in the bank, banked actions included");
});

test("a Deal Breaker counts as a steal, not as a set built", () => {
  const s = drawn(game());
  const { t, run } = tracker(s);
  const red = set(s, "b", "red", ["prop-kentucky", "prop-indiana", "prop-illinois"]);
  const [db] = hand(s, "a", "action-deal-breaker");
  run(R.act(s, "a", { type: "dealBreaker", card: db, target: "b", set: red.id }));
  assert.equal(t.a.actions["deal-breaker"], 1);
  assert.equal(t.a.sets, 0);
  assert.deepEqual(t.a.stoleFrom, { B: 1 });
  assert.deepEqual(t.b.stolenBy, { A: 1 });
});

test("finishing a set counts it, with its color", () => {
  const s = drawn(game());
  const { t, run } = tracker(s);
  set(s, "a", "darkblue", ["prop-boardwalk"]);
  const [park] = hand(s, "a", "prop-park-place");
  run(R.act(s, "a", { type: "property", card: park, color: "darkblue" }));
  assert.equal(t.a.sets, 1);
  assert.deepEqual(t.a.colors, { darkblue: 1 });
});

test("Just Say No and Double the Rent are counted as used", () => {
  const s = drawn(game());
  const { t, run } = tracker(s);
  const [r, d1] = hand(s, "a", "rent-brown-lightblue", "action-double-the-rent");
  const st = set(s, "a", "brown", ["prop-baltic", "prop-mediterranean"]);
  const [no] = hand(s, "b", "action-just-say-no");
  bank(s, "b", "money-5"); // something to lose, so b is asked
  bank(s, "c", "money-5");
  run(R.act(s, "a", { type: "rent", card: r, set: st.id, doubles: [d1] }));
  run(R.act(s, "b", { type: "justSayNo", card: no }));
  assert.equal(t.a.actions["double-the-rent"], 1);
  assert.equal(t.b.actions["just-say-no"], 1);
});

test("profiles add games up: positions, streaks, maps, the biggest rent", () => {
  const rec = (over) => gameRecord({ ...blankTally(), ...over }, { position: 1, players: 3, won: true, dnf: false, ms: 60_000, at: 1, ...over });
  let s = addGame(null, "dealbreaker", rec({ maxRent: 8, rentCollected: 8, stoleFrom: { Bo: 1 }, colors: { red: 1 }, actions: { rent: 2 } }));
  s = addGame(s, "dealbreaker", rec({ maxRent: 5, rentCollected: 5, stoleFrom: { Bo: 2, Al: 1 }, actions: { rent: 1, "sly-deal": 1 } }));
  s = addGame(s, "dealbreaker", rec({ position: 3, won: false }));
  s = addGame(s, "dealbreaker", rec({ position: null, won: false, dnf: true, ms: 10_000 }));
  const g = s.dealbreaker;
  assert.deepEqual([g.games, g.wins, g.dnf], [4, 2, 1]);
  assert.deepEqual(g.positions, [2, 0, 1]);
  assert.deepEqual([g.streak, g.bestStreak], [0, 2]);
  assert.equal(g.maxRent, 8);
  assert.equal(g.rentCollected, 13);
  assert.deepEqual(g.actions, { rent: 3, "sly-deal": 1 });
  assert.deepEqual(top(g.stoleFrom), { key: "Bo", n: 3 });
  assert.equal(g.recent.length, 4);
  assert.equal(g.recent[0].dnf, true);
  assert.deepEqual(s.overall, { games: 4, wins: 2, dnf: 1, ms: 190_000, byGame: { dealbreaker: 4 } });
  assert.equal(g.position, undefined, "per-game fields don't leak into the totals");
});
