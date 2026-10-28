// Rules engine tests. Run from the repo root: node --test _dealbreaker/tests/

import test from "node:test";
import assert from "node:assert/strict";
import { R, game, p, hand, bank, set, turnOf, total, bankValue, defsOf } from "./helpers.mjs";

const fails = (fn, msg) => assert.throws(fn, (e) => e instanceof R.RuleError && (!msg || e.message.includes(msg)));

// ------------------------------------------------------------------ setup

test("a new game deals 5 each; the first player draws 2 when they tap the deck", () => {
  const s = R.createGame({ players: [{ id: "a" }, { id: "b" }, { id: "c" }], seed: 7 });
  assert.equal(total(s), 106);
  const first = R.active(s);
  for (const x of s.players) assert.equal(x.hand.length, 5);
  assert.deepEqual(R.legalMoves(s, first.id)[0], { type: "draw" });
  R.act(s, first.id, { type: "draw" });
  assert.equal(first.hand.length, 7);
  assert.equal(s.deck.length, 106 - 15 - 2);
  fails(() => R.act(s, first.id, { type: "draw" }), "already drawn");
});

test("forget to draw and those cards are gone", () => {
  const s = game(2);
  hand(s, "a", "money-1");
  const ev = R.act(s, "a", { type: "endTurn" });
  assert.ok(ev.some((e) => e.t === "skippedDraw" && e.p === "a" && e.n === 2));
  assert.equal(p(s, "a").hand.length, 1);
  R.act(s, "b", { type: "endTurn" });
  R.act(s, "a", { type: "draw" });
  assert.equal(p(s, "a").hand.length, 3); // just this turn's two, no catching up
});

test("draw first: play anything before drawing and the draw is gone for the turn", () => {
  const s = game();
  const [m, w] = hand(s, "a", "money-1", "wild-red-yellow");
  R.act(s, "a", { type: "property", card: w, color: "red" });
  const events = R.act(s, "a", { type: "bank", card: m });
  assert.ok(!events.some((e) => e.t === "drawLost"), "only the first move gives it up");
  assert.equal(s.turn.drawLost, true);
  assert.ok(!R.legalMoves(s, "a").some((x) => x.type === "draw"));
  fails(() => R.act(s, "a", { type: "draw" }), "too late");
  // The loss is announced once, when it happens, not again at the end of the turn.
  assert.ok(!R.act(s, "a", { type: "endTurn" }).some((e) => e.t === "skippedDraw"));
  // Next turn, it's back.
  assert.ok(R.legalMoves(s, "b").some((x) => x.type === "draw"));
});

test("draw first: the first move before drawing says the draw is lost", () => {
  const s = game();
  const [m] = hand(s, "a", "money-1");
  const events = R.act(s, "a", { type: "bank", card: m });
  assert.deepEqual(events.find((e) => e.t === "drawLost"), { t: "drawLost", p: "a", n: 2 });
});

test("with draw-first off, you can draw after playing cards, and drawing doesn't use a play", () => {
  const s = game();
  s.options.drawFirst = false;
  const [m] = hand(s, "a", "money-1");
  R.act(s, "a", { type: "bank", card: m });
  R.act(s, "a", { type: "draw" });
  assert.equal(s.turn.plays, 1);
  assert.equal(p(s, "a").hand.length, 2);
});

test("running out of time without drawing loses the draw", () => {
  const s = game();
  const ev = R.timeout(s);
  assert.ok(ev.some((e) => e.t === "skippedDraw"));
  assert.equal(p(s, "a").hand.length, 0);
});

test("player count and win target are checked", () => {
  fails(() => R.createGame({ players: [{ id: "a" }] }));
  fails(() => R.createGame({ players: "abcdef".split("").map((id) => ({ id })) }));
  fails(() => R.createGame({ players: [{ id: "a" }, { id: "b" }], winSets: 7 }));
  fails(() => R.createGame({ players: [{ id: "a" }, { id: "b" }], winSets: 2 }));
});

test("starting a turn with an empty hand draws 5", () => {
  const s = game(2);
  hand(s, "a", "money-1");
  R.act(s, "a", { type: "endTurn" });
  R.act(s, "b", { type: "draw" });
  assert.equal(p(s, "b").hand.length, 5);
  R.act(s, "b", { type: "endTurn" });
  R.act(s, "a", { type: "draw" });
  assert.equal(p(s, "a").hand.length, 3);
});

test("the discard pile is reshuffled when the deck runs out", () => {
  const s = game(2);
  s.discard.push(...s.deck.splice(0, s.deck.length - 1));
  R.act(s, "a", { type: "endTurn" });
  R.act(s, "b", { type: "draw" });
  assert.equal(p(s, "b").hand.length, 5); // empty hand: draws 5, deck had 1
  assert.ok(s.log.some((e) => e.t === "reshuffle"));
  assert.equal(total(s), 106);
});

// ------------------------------------------------------------------ plays

test("three plays per turn, the fourth is refused", () => {
  const s = game();
  const cards = hand(s, "a", "money-1", "money-1", "money-1", "money-1");
  for (let i = 0; i < 3; i++) R.act(s, "a", { type: "bank", card: cards[i] });
  fails(() => R.act(s, "a", { type: "bank", card: cards[3] }), "no plays left");
});

test("money and actions can be banked, properties can't", () => {
  const s = game();
  const [m, a, h, prop, wild, any] = hand(s, "a", "money-5", "action-sly-deal", "action-house",
    "prop-boardwalk", "wild-red-yellow", "wild-any");
  R.act(s, "a", { type: "bank", card: m });
  R.act(s, "a", { type: "bank", card: a });
  R.act(s, "a", { type: "bank", card: h });
  assert.equal(bankValue(s, "a"), 5 + 3 + 3);
  s.turn.plays = 0;
  fails(() => R.act(s, "a", { type: "bank", card: prop }), "properties");
  fails(() => R.act(s, "a", { type: "bank", card: wild }), "properties");
  fails(() => R.act(s, "a", { type: "bank", card: any }), "properties");
});

test("you can only act on your own turn and with your own cards", () => {
  const s = game();
  const [m] = hand(s, "b", "money-1");
  fails(() => R.act(s, "b", { type: "bank", card: m }), "your turn");
  fails(() => R.act(s, "a", { type: "bank", card: m }), "not in your hand");
});

test("a rejected action leaves the game exactly as it was", () => {
  const s = game();
  const [m] = hand(s, "a", "money-1");
  s.turn.plays = 3;
  const before = JSON.stringify(s);
  fails(() => R.act(s, "a", { type: "bank", card: m }));
  assert.equal(JSON.stringify(s), before);
});

// ------------------------------------------------------------------ properties

test("properties build sets, and a full set starts a new one", () => {
  const s = game();
  const [b1, b2, w] = hand(s, "a", "prop-baltic", "prop-mediterranean", "wild-lightblue-brown");
  R.act(s, "a", { type: "property", card: b1 });
  const ev = R.act(s, "a", { type: "property", card: b2 });
  assert.ok(ev.some((e) => e.t === "setComplete" && e.color === "brown"));
  R.act(s, "a", { type: "property", card: w, color: "brown" });
  const sets = p(s, "a").sets.filter((x) => x.color === "brown");
  assert.deepEqual(sets.map((x) => x.cards.length), [2, 1]);
});

test("wild cards go in their colors only; the ten-color wild goes anywhere", () => {
  const s = game();
  const [w, any] = hand(s, "a", "wild-red-yellow", "wild-any");
  fails(() => R.act(s, "a", { type: "property", card: w, color: "green" }), "can't be that color");
  R.act(s, "a", { type: "property", card: w, color: "yellow" });
  R.act(s, "a", { type: "property", card: any, color: "darkblue" });
  assert.deepEqual(p(s, "a").sets.map((x) => x.color).sort(), ["darkblue", "yellow"]);
});

test("wilds can be rearranged on your turn for free", () => {
  const s = game();
  set(s, "a", "red", ["prop-kentucky", "wild-red-yellow"]);
  const w = p(s, "a").sets[0].cards[1];
  s.turn.plays = 3;
  R.act(s, "a", { type: "move", card: w, color: "yellow" });
  assert.deepEqual(p(s, "a").sets.map((x) => x.color).sort(), ["red", "yellow"]);
  fails(() => R.act(s, "a", { type: "move", card: p(s, "a").sets.find((x) => x.color === "red").cards[0], color: "yellow" }));
  turnOf(s, "b");
  fails(() => R.act(s, "a", { type: "move", card: w, color: "red" }), "your turn");
});

// ------------------------------------------------------------------ simple actions

test("half-built sets of the same color join up by themselves", () => {
  const s = game();
  // A complete light blue set using a wild, plus a spare Vermont on its own.
  const full = set(s, "a", "lightblue", ["prop-oriental", "prop-connecticut", "wild-lightblue-brown"]);
  set(s, "a", "lightblue", ["prop-vermont"]);
  // Move the wild to brown: the 2/3 and the 1/3 merge into one complete set.
  const ev = R.act(s, "a", { type: "move", card: full.cards[2], color: "brown" });
  const blues = p(s, "a").sets.filter((x) => x.color === "lightblue");
  assert.equal(blues.length, 1);
  assert.equal(blues[0].cards.length, 3);
  assert.ok(ev.some((e) => e.t === "setComplete" && e.color === "lightblue"));
});

test("Pass Go draws two", () => {
  const s = game();
  const [g] = hand(s, "a", "action-pass-go");
  R.act(s, "a", { type: "passGo", card: g });
  assert.equal(p(s, "a").hand.length, 2);
  assert.equal(s.turn.plays, 1);
});

test("It's My Birthday: everyone else pays 2M, no change", () => {
  const s = game();
  const [card] = hand(s, "a", "action-birthday");
  const [five] = bank(s, "b", "money-5");
  const [one, one2] = bank(s, "c", "money-1", "money-1");
  R.act(s, "a", { type: "birthday", card });
  assert.equal(s.phase, "respond");
  R.act(s, "b", { type: "pay", cards: [five] });
  fails(() => R.act(s, "c", { type: "pay", cards: [one] }), "only 1M");
  R.act(s, "c", { type: "pay", cards: [one, one2] });
  assert.equal(s.phase, "play");
  assert.equal(bankValue(s, "a"), 7);
});

test("someone with nothing to pay with is skipped; someone short pays all", () => {
  const s = game();
  const [card] = hand(s, "a", "action-debt-collector");
  const [two] = bank(s, "b", "money-2");
  R.act(s, "a", { type: "debt", card, target: "c" });
  assert.equal(s.phase, "play"); // c has nothing
  const [card2] = hand(s, "a", "action-debt-collector");
  R.act(s, "a", { type: "debt", card: card2, target: "b" });
  fails(() => R.act(s, "b", { type: "pay", cards: [] }));
  R.act(s, "b", { type: "pay", cards: [two] });
  assert.equal(bankValue(s, "a"), 2);
});

test("you pay from bank and table, never from your hand", () => {
  const s = game();
  const [card] = hand(s, "a", "action-debt-collector");
  const [inHand] = hand(s, "b", "money-10");
  const st = set(s, "b", "green", ["prop-pacific"]);
  R.act(s, "a", { type: "debt", card, target: "b" });
  fails(() => R.act(s, "b", { type: "pay", cards: [inHand] }), "can't pay with");
  R.act(s, "b", { type: "pay", cards: [st.cards[0]] });
  // Paid properties land on the receiver's table, not in their bank.
  assert.equal(p(s, "a").sets[0].color, "green");
  assert.equal(bankValue(s, "a"), 0);
});

test("money first: properties only once the bank is empty", () => {
  const s = game();
  const [card] = hand(s, "a", "action-debt-collector");
  const [two] = bank(s, "b", "money-2");
  const st = set(s, "b", "green", ["prop-pacific"]);
  R.act(s, "a", { type: "debt", card, target: "b" });
  fails(() => R.act(s, "b", { type: "pay", cards: [st.cards[0]] }), "money first");
  R.act(s, "b", { type: "pay", cards: [two, st.cards[0]] });
  assert.equal(bankValue(s, "a"), 2);
  assert.equal(p(s, "a").sets[0].color, "green");
});

test("when money covers it, you pay with money only", () => {
  const s = game();
  const [card] = hand(s, "a", "action-debt-collector");
  const [five, one] = bank(s, "b", "money-5", "money-1");
  const st = set(s, "b", "green", ["prop-pacific"]);
  R.act(s, "a", { type: "debt", card, target: "b" });
  fails(() => R.act(s, "b", { type: "pay", cards: [one, st.cards[0]] }), "money first");
  R.act(s, "b", { type: "pay", cards: [five] });
  assert.equal(bankValue(s, "b"), 1);
  void one;
});

test("house rule: a rainbow wild is worth a property of its color, and pays debts", () => {
  const s = game();
  s.turn.drawn = true;
  const [card] = hand(s, "a", "action-debt-collector");
  const [rainbow] = set(s, "b", "green", ["wild-any"]).cards;
  const [james] = set(s, "b", "orange", ["prop-st-james"]).cards;
  assert.equal(R.value(s, rainbow), 4); // green: 4M
  R.act(s, "a", { type: "debt", card, target: "b" });
  // The suggested payment needs it too: 2M of orange alone doesn't cover 5M.
  assert.ok(R.legalMoves(s, "b").find((m) => m.type === "pay").cards.includes(rainbow));
  const events = R.act(s, "b", { type: "pay", cards: [rainbow, james] });
  assert.equal(events.find((e) => e.t === "pay").amount, 6);
  // It lands on the collector's table, same color.
  assert.ok(p(s, "a").sets.some((x) => x.color === "green" && x.cards.includes(rainbow)));
});

test("house rule: a rainbow wild's worth follows its color, and is nothing in hand", () => {
  const s = game();
  const [inHand] = hand(s, "a", "wild-any");
  assert.equal(R.value(s, inHand), 0);
  const [rainbow] = set(s, "b", "brown", ["wild-any"]).cards;
  assert.equal(R.value(s, rainbow), 1);
  p(s, "b").sets[0].color = "darkblue";
  assert.equal(R.value(s, rainbow), 4);
});

// ------------------------------------------------------------------ rent

test("two-color rent charges everyone for one of your sets", () => {
  const s = game();
  const [card] = hand(s, "a", "rent-red-yellow");
  const st = set(s, "a", "red", ["prop-kentucky", "prop-indiana"]);
  bank(s, "b", "money-3"); bank(s, "c", "money-3");
  const ev = R.act(s, "a", { type: "rent", card, set: st.id });
  assert.equal(ev.find((e) => e.t === "action").amount, 3);
  assert.deepEqual(ev.find((e) => e.t === "action").targets, ["b", "c"]);
  fails(() => R.act(s, "a", { type: "endTurn" }), "waiting");
});

test("rent counts buildings on complete sets", () => {
  const s = game();
  const st = set(s, "a", "darkblue", ["prop-boardwalk", "prop-park-place"], { house: true, hotel: true });
  assert.equal(R.rentFor(s, st), 8 + 3 + 4);
});

test("rent cards only charge their own colors", () => {
  const s = game();
  const [card] = hand(s, "a", "rent-red-yellow");
  const st = set(s, "a", "green", ["prop-pacific"]);
  fails(() => R.act(s, "a", { type: "rent", card, set: st.id }), "can't charge");
});

test("wild rent charges one chosen player any color", () => {
  const s = game();
  const [card] = hand(s, "a", "rent-any");
  const st = set(s, "a", "green", ["prop-pacific", "prop-north-carolina"]);
  bank(s, "b", "money-4");
  const ev = R.act(s, "a", { type: "rent", card, set: st.id, target: "b" });
  assert.deepEqual(ev.find((e) => e.t === "action").targets, ["b"]);
  assert.equal(ev.find((e) => e.t === "action").amount, 4);
});

test("Double the Rent doubles, two of them quadruple, and they cost plays", () => {
  const s = game();
  const [r, d1, d2] = hand(s, "a", "rent-brown-lightblue", "action-double-the-rent", "action-double-the-rent");
  const st = set(s, "a", "brown", ["prop-baltic", "prop-mediterranean"]);
  const ev = R.act(s, "a", { type: "rent", card: r, set: st.id, doubles: [d1, d2] });
  assert.equal(ev.find((e) => e.t === "action").amount, 2 * 4);
  assert.equal(s.turn.plays, 3);

  const s2 = game();
  const [r2, d3] = hand(s2, "a", "rent-brown-lightblue", "action-double-the-rent");
  const st2 = set(s2, "a", "brown", ["prop-baltic"]);
  s2.turn.plays = 2;
  fails(() => R.act(s2, "a", { type: "rent", card: r2, set: st2.id, doubles: [d3] }), "no plays left");
});

test("a set of only ten-color wilds charges no rent", () => {
  const s = game();
  const [card] = hand(s, "a", "rent-any");
  const st = set(s, "a", "orange", ["wild-any"]);
  fails(() => R.act(s, "a", { type: "rent", card, set: st.id, target: "b" }), "doesn't charge");
});

// ------------------------------------------------------------------ Just Say No

test("Just Say No cancels an action against you, and doesn't use a play", () => {
  const s = game();
  const [card] = hand(s, "a", "action-debt-collector");
  const [no] = hand(s, "b", "action-just-say-no");
  bank(s, "b", "money-5");
  R.act(s, "a", { type: "debt", card, target: "b" });
  R.act(s, "b", { type: "justSayNo", card: no });
  // a has no Just Say No, so it's settled straight away.
  assert.equal(s.phase, "play");
  assert.equal(bankValue(s, "b"), 5);
  assert.equal(s.turn.plays, 1);
});

test("Just Say No chains: the attacker can say no to the no", () => {
  const s = game();
  const [card, aNo] = hand(s, "a", "action-debt-collector", "action-just-say-no");
  const [bNo, bNo2] = hand(s, "b", "action-just-say-no", "action-just-say-no");
  bank(s, "b", "money-5");
  R.act(s, "a", { type: "debt", card, target: "b" });
  R.act(s, "b", { type: "justSayNo", card: bNo });
  assert.deepEqual(R.awaiting(s), [{ id: "a", step: "counter", for: "b" }]);
  R.act(s, "a", { type: "justSayNo", card: aNo, for: "b" });
  R.act(s, "b", { type: "justSayNo", card: bNo2 });
  assert.equal(s.phase, "play"); // a is out of Nos; b wins the exchange
  assert.equal(bankValue(s, "b"), 5);
});

test("the attacker's no-to-the-no makes the target pay after all", () => {
  const s = game();
  const [card, aNo] = hand(s, "a", "action-debt-collector", "action-just-say-no");
  const [bNo] = hand(s, "b", "action-just-say-no");
  const [five] = bank(s, "b", "money-5");
  R.act(s, "a", { type: "debt", card, target: "b" });
  R.act(s, "b", { type: "justSayNo", card: bNo });
  R.act(s, "a", { type: "justSayNo", card: aNo, for: "b" });
  assert.deepEqual(R.awaiting(s), [{ id: "b", step: "pay" }]);
  R.act(s, "b", { type: "pay", cards: [five] });
  assert.equal(bankValue(s, "a"), 5);
});

test("Just Say No against rent cancels the Double the Rent too", () => {
  const s = game(2);
  const [r, d] = hand(s, "a", "rent-red-yellow", "action-double-the-rent");
  const st = set(s, "a", "red", ["prop-kentucky"]);
  const [no] = hand(s, "b", "action-just-say-no");
  bank(s, "b", "money-4");
  R.act(s, "a", { type: "rent", card: r, set: st.id, doubles: [d] });
  R.act(s, "b", { type: "justSayNo", card: no });
  assert.equal(bankValue(s, "b"), 4);
  assert.equal(s.turn.plays, 2);
});

test("with several targets, each answers on their own", () => {
  const s = game();
  const [card] = hand(s, "a", "action-birthday");
  const [no] = hand(s, "b", "action-just-say-no");
  bank(s, "b", "money-2");
  const [c2] = bank(s, "c", "money-2");
  R.act(s, "a", { type: "birthday", card });
  R.act(s, "c", { type: "pay", cards: [c2] });
  assert.equal(s.phase, "respond");
  R.act(s, "b", { type: "justSayNo", card: no });
  assert.equal(s.phase, "play");
  assert.equal(bankValue(s, "a"), 2);
});

test("you can't play Just Say No when nothing is aimed at you", () => {
  const s = game();
  const [no] = hand(s, "a", "action-just-say-no");
  fails(() => R.act(s, "a", { type: "justSayNo", card: no }));
});

// ------------------------------------------------------------------ stealing

test("Sly Deal takes one property, never from a complete set", () => {
  const s = game();
  const [card, card2] = hand(s, "a", "action-sly-deal", "action-sly-deal");
  const loose = set(s, "b", "green", ["prop-pacific", "prop-north-carolina"]);
  const full = set(s, "b", "brown", ["prop-baltic", "prop-mediterranean"]);
  fails(() => R.act(s, "a", { type: "sly", card, target: "b", take: full.cards[0] }), "complete");
  R.act(s, "a", { type: "sly", card: card2, target: "b", take: loose.cards[0] });
  assert.equal(p(s, "a").sets[0].color, "green");
  assert.equal(p(s, "b").sets.find((x) => x.color === "green").cards.length, 1);
});

test("Forced Deal swaps, but neither card may come from a complete set", () => {
  const s = game();
  const [card] = hand(s, "a", "action-forced-deal");
  const mine = set(s, "a", "red", ["prop-kentucky"]);
  const myFull = set(s, "a", "brown", ["prop-baltic", "prop-mediterranean"]);
  const theirs = set(s, "b", "green", ["prop-pacific"]);
  fails(() => R.act(s, "a", { type: "forced", card, target: "b", take: theirs.cards[0], give: myFull.cards[0] }), "give");
  R.act(s, "a", { type: "forced", card, target: "b", take: theirs.cards[0], give: mine.cards[0] });
  assert.deepEqual(p(s, "a").sets.map((x) => x.color).sort(), ["brown", "green"]);
  assert.deepEqual(p(s, "b").sets.map((x) => x.color), ["red"]);
});

test("Deal Breaker takes a whole complete set, buildings included", () => {
  const s = game();
  const [card, card2] = hand(s, "a", "action-deal-breaker", "action-deal-breaker");
  const loose = set(s, "b", "green", ["prop-pacific"]);
  const full = set(s, "b", "darkblue", ["prop-boardwalk", "prop-park-place"], { house: true });
  fails(() => R.act(s, "a", { type: "dealBreaker", card, target: "b", set: loose.id }), "complete");
  R.act(s, "a", { type: "dealBreaker", card: card2, target: "b", set: full.id });
  const got = p(s, "a").sets[0];
  assert.equal(got.color, "darkblue");
  assert.ok(got.house);
  assert.equal(p(s, "b").sets.length, 1);
});

// ------------------------------------------------------------------ buildings

test("houses and hotels: complete sets only, house first, never railroads or utilities", () => {
  const s = game();
  const [h, h2, ht, h3] = hand(s, "a", "action-house", "action-house", "action-hotel", "action-house");
  const loose = set(s, "a", "red", ["prop-kentucky"]);
  const full = set(s, "a", "brown", ["prop-baltic", "prop-mediterranean"]);
  const rail = set(s, "a", "black", ["prop-reading", "prop-short-line", "prop-b-and-o", "prop-pennsylvania-rr"]);
  fails(() => R.act(s, "a", { type: "house", card: h, set: loose.id }), "complete");
  fails(() => R.act(s, "a", { type: "house", card: h, set: rail.id }), "railroads");
  fails(() => R.act(s, "a", { type: "hotel", card: ht, set: full.id }), "house first");
  R.act(s, "a", { type: "house", card: h, set: full.id });
  fails(() => R.act(s, "a", { type: "house", card: h2, set: full.id }), "already");
  R.act(s, "a", { type: "hotel", card: ht, set: full.id });
  assert.equal(R.rentFor(s, full), 2 + 3 + 4);
  void h3;
});

test("a set that stops being complete drops its buildings into the bank", () => {
  const s = game();
  const full = set(s, "a", "red", ["prop-kentucky", "prop-indiana", "wild-red-yellow"], { house: true });
  R.act(s, "a", { type: "move", card: full.cards[2], color: "yellow" });
  assert.equal(full.house, null);
  assert.equal(bankValue(s, "a"), 3);
});

test("buildings can be paid with, and land in the receiver's bank", () => {
  const s = game();
  const [card] = hand(s, "a", "action-debt-collector");
  const full = set(s, "b", "brown", ["prop-baltic", "prop-mediterranean"], { house: true, hotel: true });
  R.act(s, "a", { type: "debt", card, target: "b" });
  R.act(s, "b", { type: "pay", cards: [full.hotel, full.cards[0]] });
  assert.equal(bankValue(s, "a"), 4);
  assert.equal(p(s, "a").sets[0].color, "brown");
  // b's set broke, so its house dropped into b's bank.
  assert.equal(bankValue(s, "b"), 3);
});

// ------------------------------------------------------------------ hand limit

const NINE = ["money-1", "money-1", "money-1", "money-2", "money-2", "money-2", "money-3", "money-3", "money-4"];

test("ending a turn over 7 cards owes a discard, and the next player starts at once", () => {
  const s = game(2);
  hand(s, "a", ...NINE);
  R.act(s, "a", { type: "endTurn" });
  assert.equal(s.discards.a, 2);
  assert.equal(R.active(s).id, "b");
  fails(() => R.act(s, "a", { type: "discard", cards: p(s, "a").hand.slice(0, 1) }), "exactly 2");
  R.act(s, "a", { type: "discard", cards: p(s, "a").hand.slice(0, 2) });
  assert.equal(p(s, "a").hand.length, 7);
  assert.equal(s.discards.a, undefined);
});

test("an unpaid discard is settled automatically before your next turn", () => {
  const s = game(2);
  hand(s, "a", ...NINE);
  R.act(s, "a", { type: "endTurn" });
  R.act(s, "b", { type: "endTurn" });
  assert.equal(s.discards.a, undefined);
  assert.equal(p(s, "a").hand.length, 7);
});

test("auto-discard keeps Just Say No and properties over small money", () => {
  const s = game(2);
  hand(s, "a", "action-just-say-no", "prop-boardwalk", ...Array(6).fill("money-1"), "money-2");
  s.discards.a = 2;
  R.autoDiscard(s, "a");
  assert.deepEqual(defsOf(s, p(s, "a").hand).filter((d) => !d.startsWith("money")), ["action-just-say-no", "prop-boardwalk"]);
});

// ------------------------------------------------------------------ time

test("running out of time on your turn ends it", () => {
  const s = game();
  R.timeout(s);
  assert.equal(R.active(s).id, "b");
});

test("running out of time when charged: no Just Say No, and the payment is picked for you", () => {
  const s = game();
  const [card] = hand(s, "a", "action-debt-collector");
  hand(s, "b", "action-just-say-no");
  bank(s, "b", "money-1", "money-5", "money-2", "money-3");
  R.act(s, "a", { type: "debt", card, target: "b" });
  R.timeout(s);
  assert.equal(s.phase, "play");
  assert.equal(bankValue(s, "a"), 5); // the exact 5M note, not 1+2+3
  assert.equal(p(s, "b").hand.length, 1); // still holding the Just Say No
});

test("auto-payment uses money first, then the cheapest loose properties", () => {
  const s = game();
  bank(s, "b", "money-1");
  set(s, "b", "darkblue", ["prop-boardwalk", "prop-park-place"]);
  set(s, "b", "brown", ["prop-baltic"]);
  const pay = R.autoPayment(s, p(s, "b"), 2);
  assert.deepEqual(defsOf(s, pay), ["money-1", "prop-baltic"]);
});

test("a timed-out counter lets the No stand", () => {
  const s = game();
  const [card, aNo] = hand(s, "a", "action-debt-collector", "action-just-say-no");
  const [bNo] = hand(s, "b", "action-just-say-no");
  bank(s, "b", "money-5");
  R.act(s, "a", { type: "debt", card, target: "b" });
  R.act(s, "b", { type: "justSayNo", card: bNo });
  R.timeout(s);
  assert.equal(bankValue(s, "b"), 5);
  assert.ok(p(s, "a").hand.includes(aNo));
});

// ------------------------------------------------------------------ winning

const fill = (s, id, colors) => {
  const sets = {
    brown: ["prop-baltic", "prop-mediterranean"], darkblue: ["prop-boardwalk", "prop-park-place"],
    mint: ["prop-electric", "prop-water-works"], green: ["prop-pacific", "prop-north-carolina", "prop-pennsylvania-ave"],
    red: ["prop-kentucky", "prop-indiana", "prop-illinois"], yellow: ["prop-atlantic", "prop-ventnor", "prop-marvin-gardens"],
    orange: ["prop-st-james", "prop-tennessee", "prop-new-york"],
  };
  for (const c of colors) set(s, id, c, sets[c]);
};

test("completing the target number of different colors wins on the spot", () => {
  const s = game();
  fill(s, "a", ["brown", "darkblue"]);
  const [w, g] = hand(s, "a", "wild-any", "prop-electric");
  set(s, "a", "mint", ["prop-water-works"]);
  R.act(s, "a", { type: "property", card: g });
  assert.equal(s.phase, "over");
  assert.equal(s.winner, "a");
  fails(() => R.act(s, "a", { type: "property", card: w, color: "red" }), "over");
});

test("two complete sets of the same color count once", () => {
  const s = game();
  fill(s, "a", ["brown", "darkblue"]);
  set(s, "a", "brown", ["wild-lightblue-brown", "wild-any"]);
  assert.equal(R.completeColors(p(s, "a")).length, 2);
  assert.equal(R.hasWon(s, p(s, "a")), false);
});

test("the win target can be raised to 6", () => {
  const s = game(3, 6);
  fill(s, "a", ["brown", "darkblue", "mint", "green", "red"]);
  const [y] = hand(s, "a", "prop-atlantic");
  set(s, "a", "yellow", ["prop-ventnor", "prop-marvin-gardens"]);
  assert.equal(s.phase, "play");
  R.act(s, "a", { type: "property", card: y });
  assert.equal(s.winner, "a");
});

test("a set finished on someone else's turn wins on the spot", () => {
  // a's Forced Deal hands b the card that finishes b's third set, during a's turn.
  const s = game();
  s.turn.drawn = true;
  fill(s, "b", ["brown", "darkblue"]);
  set(s, "b", "red", ["prop-kentucky", "prop-indiana"]);
  const [give] = set(s, "a", "red", ["prop-illinois"]).cards;
  const [take] = set(s, "b", "green", ["prop-pacific"]).cards;
  const [fd] = hand(s, "a", "action-forced-deal");
  const events = R.act(s, "a", { type: "forced", card: fd, target: "b", take, give });
  assert.equal(s.phase, "over");
  assert.equal(s.winner, "b");
  assert.ok(events.some((e) => e.t === "win" && e.p === "b"));
});


test("standings: winner, then complete colors, then total value", () => {
  const s = game();
  fill(s, "a", ["brown", "darkblue", "mint"]);
  s.winner = "a";
  fill(s, "c", ["green"]);
  bank(s, "b", "money-10");
  bank(s, "c", "money-1");
  assert.deepEqual(R.standings(s).map((x) => x.id), ["a", "c", "b"]);
});

// ------------------------------------------------------------------ views

test("a player's view hides other hands and the deck order", () => {
  const s = R.createGame({ players: [{ id: "a" }, { id: "b" }], seed: 3 });
  const v = R.view(s, "a");
  const me = v.players.find((x) => x.id === "a"), them = v.players.find((x) => x.id === "b");
  assert.ok(Array.isArray(me.hand));
  assert.equal(typeof them.hand, "number");
  assert.equal(typeof v.deck, "number");
  for (const c of p(s, "b").hand) assert.equal(v.cards[c], undefined);
  for (const c of me.hand) assert.ok(v.cards[c]);
  assert.equal(v.rng, undefined);
});

// ------------------------------------------------------------------ legal moves

test("every move legalMoves offers is accepted", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = R.createGame({ players: [{ id: "a" }, { id: "b" }, { id: "c" }], seed });
    for (const x of s.players) for (const c of x.hand) {
      const d = R.def(s, c);
      if (d.type === "property") { /* keep */ }
    }
    const who = R.active(s).id;
    for (const m of R.legalMoves(s, who)) {
      const copy = structuredClone(s);
      R.act(copy, who, m);
    }
  }
});

// ------------------------------------------------------------------ removing a player

test("removing a player: their cards go to the discard pile and nothing is lost", () => {
  const s = game(3);
  const before = total(s);
  hand(s, "b", "money-5", "prop-boardwalk");
  bank(s, "b", "money-2");
  set(s, "b", "red", ["prop-kentucky"]);
  const events = R.removePlayer(s, "b");
  assert.deepEqual(events.map((e) => e.t), ["removed"]);
  assert.deepEqual(s.players.map((x) => x.id), ["a", "c"]);
  assert.equal(R.active(s).id, "a");
  assert.equal(total(s), before);
});

test("removing the player whose turn it is passes the turn on", () => {
  const s = game(3);
  R.act(s, "a", { type: "draw" });
  R.act(s, "a", { type: "endTurn" }); // b's turn
  const events = R.removePlayer(s, "b");
  assert.equal(R.active(s).id, "c");
  assert.ok(events.some((e) => e.t === "turn" && e.p === "c"));
});

test("removing someone who owes rent lets the rent finish without them", () => {
  const s = game(3);
  s.turn.drawn = true;
  const [bday] = hand(s, "a", "action-birthday");
  hand(s, "b", "action-just-say-no");
  hand(s, "c", "action-just-say-no");
  bank(s, "b", "money-2");
  const [two] = bank(s, "c", "money-2");
  R.act(s, "a", { type: "birthday", card: bday });
  assert.equal(s.phase, "respond");
  R.removePlayer(s, "b");
  assert.deepEqual(R.awaiting(s).map((x) => x.id), ["c"]);
  R.act(s, "c", { type: "accept" });
  R.act(s, "c", { type: "pay", cards: [two] });
  assert.equal(s.phase, "play"); // c paid; the birthday is over
});

test("removing the player who started an attack cancels it", () => {
  const s = game(3);
  s.turn.drawn = true;
  const [bday] = hand(s, "a", "action-birthday");
  hand(s, "b", "action-just-say-no");
  R.act(s, "a", { type: "birthday", card: bday });
  R.removePlayer(s, "a");
  assert.equal(s.pending, null);
  assert.equal(R.active(s).id, "b");
});

test("the last player standing wins", () => {
  const s = game(2);
  const events = R.removePlayer(s, "b");
  assert.equal(s.phase, "over");
  assert.equal(s.winner, "a");
  assert.ok(events.some((e) => e.t === "win" && e.p === "a"));
});

test("a charge remembers the exact card, so the people paying see it", () => {
  const s = game();
  s.turn.drawn = true;
  const [card] = hand(s, "a", "rent-red-yellow");
  set(s, "a", "red", ["prop-kentucky"]);
  hand(s, "b", "action-just-say-no");
  bank(s, "b", "money-1");
  R.act(s, "a", { type: "rent", card, set: p(s, "a").sets[0].id, doubles: [] });
  assert.equal(s.pending.def, "rent-red-yellow");
  assert.equal(R.view(s, "b").pending.def, "rent-red-yellow");
});

test("charged with nothing to pay: skipped, even holding a Just Say No", () => {
  const s = game();
  s.turn.drawn = true;
  const [card] = hand(s, "a", "action-debt-collector");
  const [no] = hand(s, "b", "action-just-say-no");
  const events = R.act(s, "a", { type: "debt", card, target: "b" });
  assert.equal(s.phase, "play");
  assert.ok(events.some((e) => e.t === "pay" && e.from === "b" && e.cards.length === 0));
  assert.ok(p(s, "b").hand.includes(no), "the Just Say No is kept");
});
