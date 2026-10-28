// The Normal AI makes the moves a decent player would.

import { test } from "node:test";
import assert from "node:assert/strict";
import { R, game, hand, bank, set, p } from "./helpers.mjs";
import { chooseMove } from "../../x/7a3797625d3c2330/engine/bot.js";

const drawn = (s) => { s.turn.drawn = true; return s; };
const think = (s, id = "a") => chooseMove(s, id, "normal");

test("it draws first, always", () => {
  const s = game();
  hand(s, "a", "prop-boardwalk");
  assert.deepEqual(think(s), { type: "draw" });
});

test("it finishes a set when it can", () => {
  const s = drawn(game());
  set(s, "a", "darkblue", ["prop-boardwalk"]);
  const [park] = hand(s, "a", "money-1", "prop-park-place").slice(1);
  hand(s, "a", "prop-mediterranean");
  assert.deepEqual(think(s), { type: "property", card: park, color: "darkblue" });
});

test("it plays the winning card over anything else", () => {
  const s = drawn(game(3, 3));
  set(s, "a", "darkblue", ["prop-boardwalk", "prop-park-place"]);
  set(s, "a", "brown", ["prop-mediterranean", "prop-baltic"]);
  set(s, "a", "green", ["prop-pacific", "prop-north-carolina"]);
  set(s, "b", "red", ["prop-kentucky", "prop-indiana", "prop-illinois"]);
  const [penn] = hand(s, "a", "prop-pennsylvania-ave");
  hand(s, "a", "action-deal-breaker");
  assert.deepEqual(think(s), { type: "property", card: penn, color: "green" });
});

test("it takes a whole set with a Deal Breaker", () => {
  const s = drawn(game());
  const red = set(s, "b", "red", ["prop-kentucky", "prop-indiana", "prop-illinois"]);
  const [db] = hand(s, "a", "action-deal-breaker", "money-1");
  assert.deepEqual(think(s), { type: "dealBreaker", card: db, target: "b", set: red.id });
});

test("it keeps its Just Say No instead of banking it", () => {
  const s = drawn(game());
  const [, m] = hand(s, "a", "action-just-say-no", "money-3");
  assert.deepEqual(think(s), { type: "bank", card: m });
  R.act(s, "a", think(s));
  // With only the Just Say No left, it ends the turn rather than bank it.
  assert.deepEqual(think(s), { type: "endTurn" });
});

test("it says no to a Deal Breaker", () => {
  const s = drawn(game());
  set(s, "b", "red", ["prop-kentucky", "prop-indiana", "prop-illinois"]);
  const [db] = hand(s, "a", "action-deal-breaker");
  const [no] = hand(s, "b", "action-just-say-no");
  R.act(s, "a", think(s));
  assert.equal(R.awaiting(s)[0].id, "b");
  assert.deepEqual(think(s, "b"), { type: "justSayNo", card: no, for: undefined });
  void db;
});

test("it saves its Just Say No for something worth it", () => {
  const s = drawn(game());
  const [bday] = hand(s, "a", "action-birthday");
  hand(s, "b", "action-just-say-no");
  bank(s, "b", "money-5");
  R.act(s, "a", { type: "birthday", card: bday });
  // A 2M birthday, with plenty in the bank: just pay.
  assert.equal(think(s, "b").type, "accept");
});

test("it pays with money first, and never breaks a finished set if it can help it", () => {
  const s = drawn(game());
  const [debt] = hand(s, "a", "action-debt-collector");
  const [one] = bank(s, "b", "money-1");
  const done = set(s, "b", "darkblue", ["prop-boardwalk", "prop-park-place"]);
  const [loose] = set(s, "b", "green", ["prop-pacific"]).cards;
  R.act(s, "a", { type: "debt", card: debt, target: "b" }); // no Just Say No: straight to paying
  const m = think(s, "b");
  assert.equal(m.type, "pay");
  assert.ok(m.cards.includes(one), "all the money goes first");
  assert.ok(m.cards.includes(loose), "then the stray property");
  assert.ok(!done.cards.some((c) => m.cards.includes(c)), "the finished set stays");
  R.act(s, "b", m); // and the rules accept it
});

test("it discards what it'll miss least", () => {
  const s = game();
  const keep = hand(s, "b", "action-just-say-no", "action-deal-breaker", "prop-boardwalk");
  hand(s, "b", "money-1", "money-1", "money-2", "money-3", "money-4", "money-5");
  s.discards.b = 2;
  const m = think(s, "b");
  assert.equal(m.type, "discard");
  assert.equal(m.cards.length, 2);
  assert.ok(!keep.some((c) => m.cards.includes(c)));
  assert.deepEqual(m.cards.map((c) => s.cards[c]).sort(), ["money-1", "money-1"]);
});

test("Easy still plays every turn legally", () => {
  const s = game();
  hand(s, "a", "prop-boardwalk", "money-2", "action-birthday");
  for (let i = 0; i < 6 && R.active(s).id === "a"; i++) R.act(s, "a", chooseMove(s, "a", "easy"));
  assert.ok(true);
  void p;
});
