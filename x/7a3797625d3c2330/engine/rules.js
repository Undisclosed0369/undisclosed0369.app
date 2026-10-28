// Deal Breaker rules engine.
//
// Pure game logic: no timers, no network, no randomness except a seeded RNG
// kept inside the state. The game server owns the one true state and feeds
// it actions; the browser uses the same file to show what is legal. Tests
// drive it directly.
//
//   createGame(options)            -> state
//   act(state, playerId, action)   -> events     (mutates state, or throws RuleError)
//   timeout(state)                 -> events     (the awaited player ran out of time)
//   autoDiscard(state, playerId)   -> events     (their 60 s discard window ran out)
//   legalMoves(state, playerId)    -> actions
//   view(state, playerId)          -> what that player is allowed to see
//   standings(state)               -> players, best first
//
// Rules follow the printed Monopoly Deal rules. Where they are silent, the
// choices made here are listed in HOUSE RULES at the bottom of this file.

import { CARDS, COLORS, COLOR_VALUE } from "./deck.js";

export const DEF = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export const HAND_LIMIT = 7;
export const PLAYS_PER_TURN = 3;
const HOUSE_VALUE = 3;
const HOTEL_VALUE = 4;
const NO_BUILDINGS = new Set(["black", "mint"]);

export class RuleError extends Error {}
const fail = (msg) => { throw new RuleError(msg); };

export const setSize = (color) => COLORS[color].rent.length;

// ------------------------------------------------------------------ setup

function rng(state) {
  // mulberry32
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle(state, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng(state) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * players: [{ id, name }] (2-5), winSets: 3-6, seed: any integer.
 */
export function createGame({ players, winSets = 3, drawFirst = true, seed = Date.now() }) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 5) fail("2 to 5 players");
  if (new Set(players.map((p) => p.id)).size !== players.length) fail("player ids must be unique");
  if (!(winSets >= 3 && winSets <= 6)) fail("winSets must be 3 to 6");

  const state = {
    version: 1,
    rng: seed >>> 0,
    // drawFirst: play anything before drawing and that turn's draw is lost.
    options: { winSets, drawFirst },
    players: players.map((p) => ({ id: p.id, name: p.name, hand: [], bank: [], sets: [] })),
    cards: {},
    deck: [],
    discard: [],
    turn: { player: 0, plays: 0, number: 0 },
    phase: "play",
    pending: null,
    discards: {},
    winner: null,
    nextSet: 1,
    log: [],
  };

  // Card instances get opaque ids, so an id says nothing about the card.
  const defs = [];
  for (const c of CARDS) for (let i = 0; i < c.count; i++) defs.push(c.id);
  shuffle(state, defs);
  defs.forEach((d, i) => { state.cards["c" + i] = d; state.deck.push("c" + i); });
  shuffle(state, state.deck);

  for (let round = 0; round < 5; round++) {
    for (const p of state.players) p.hand.push(state.deck.pop());
  }
  state.turn.player = Math.floor(rng(state) * state.players.length);
  const events = [];
  startTurn(state, events);
  state.log.push(...events);
  return state;
}

// ------------------------------------------------------------------ lookups

export const def = (state, card) => DEF[state.cards[card]];
export const player = (state, id) => state.players.find((p) => p.id === id) || fail("no such player");
export const active = (state) => state.players[state.turn.player];

const isProperty = (d) => d.type === "property" || d.type === "wild";
const isAnyWild = (d) => d.type === "wild" && d.colors.length > 2;
const cardColors = (d) => (d.type === "property" ? [d.color] : d.colors);

/** Money value of a card on the table or in the bank. */
export function value(state, card) {
  const d = def(state, card);
  // House rule: a rainbow wild on the table is worth a property of its color
  // (so it can pay a debt); in hand it's worth nothing.
  if (d.id === "wild-any") {
    for (const p of state.players) for (const s of p.sets) if (s.cards.includes(card)) return COLOR_VALUE[s.color];
    return 0;
  }
  return d.value;
}

export function findSet(p, setId) {
  return p.sets.find((s) => s.id === setId) || fail("no such set");
}

export const isComplete = (set) => set.cards.length >= setSize(set.color);

/** Distinct colors with at least one complete set. */
export function completeColors(p) {
  return [...new Set(p.sets.filter(isComplete).map((s) => s.color))];
}

export function hasWon(state, p) {
  return completeColors(p).length >= state.options.winSets;
}

/** Rent one set charges, before Double the Rent. */
export function rentFor(state, set) {
  // A set of nothing but ten-color wilds charges no rent.
  if (set.cards.every((c) => isAnyWild(def(state, c)))) return 0;
  const n = Math.min(set.cards.length, setSize(set.color));
  let rent = COLORS[set.color].rent[n - 1];
  if (isComplete(set)) {
    if (set.house) rent += HOUSE_VALUE;
    if (set.hotel) rent += HOTEL_VALUE;
  }
  return rent;
}

/** Cards a player could hand over to pay a debt. */
export function payable(state, p) {
  const out = [...p.bank];
  for (const s of p.sets) {
    for (const c of s.cards) if (value(state, c) > 0) out.push(c);
    if (s.house) out.push(s.house);
    if (s.hotel) out.push(s.hotel);
  }
  return out;
}

function owner(state, card) {
  for (const p of state.players) {
    if (p.hand.includes(card)) return { p, where: "hand" };
    if (p.bank.includes(card)) return { p, where: "bank" };
    for (const s of p.sets) {
      if (s.cards.includes(card)) return { p, where: "set", set: s };
      if (s.house === card) return { p, where: "house", set: s };
      if (s.hotel === card) return { p, where: "hotel", set: s };
    }
  }
  return null;
}

// ------------------------------------------------------------------ moving cards

function takeFromHand(p, card) {
  const i = p.hand.indexOf(card);
  if (i < 0) fail("that card is not in your hand");
  p.hand.splice(i, 1);
}

function draw(state, p, n, events) {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (!state.deck.length) {
      if (!state.discard.length) break;
      state.deck = shuffle(state, state.discard);
      state.discard = [];
      events.push({ t: "reshuffle", n: state.deck.length });
    }
    p.hand.push(state.deck.pop());
    drawn++;
  }
  if (drawn) events.push({ t: "draw", p: p.id, n: drawn });
}

/** Put a property into a player's sets: a chosen set, or the first open set
    of that color, or a new set. */
function placeProperty(state, p, card, color, setId, events) {
  const d = def(state, card);
  if (!cardColors(d).includes(color)) fail("that card can't be that color");
  let set;
  if (setId != null) {
    set = findSet(p, setId);
    if (set.color !== color) fail("that set is a different color");
    if (isComplete(set)) fail("that set is already complete");
  } else {
    set = p.sets.find((s) => s.color === color && !isComplete(s));
  }
  if (!set) {
    set = { id: state.nextSet++, color, cards: [], house: null, hotel: null };
    p.sets.push(set);
  }
  const was = isComplete(set);
  set.cards.push(card);
  if (!was && isComplete(set)) events.push({ t: "setComplete", p: p.id, color, set: set.id });
  return set;
}

/** Where a property lands when it changes hands: its current color if the
    receiver can use it, else the color they are closest to completing. */
function receiveProperty(state, p, card, color, events) {
  placeProperty(state, p, card, color, null, events);
}

/** Pull a card off the table. Sets that empty are removed; sets that are no
    longer complete lose their buildings to the owner's bank. */
function removeFromTable(state, p, card, events) {
  const o = owner(state, card);
  if (!o || o.p !== p) fail("not your card");
  if (o.where === "bank") { p.bank.splice(p.bank.indexOf(card), 1); return null; }
  const s = o.set;
  if (o.where === "house") { s.house = null; if (s.hotel) { p.bank.push(s.hotel); s.hotel = null; } return null; }
  if (o.where === "hotel") { s.hotel = null; return null; }
  const color = s.color;
  s.cards.splice(s.cards.indexOf(card), 1);
  tidy(p, events);
  return color;
}

/** Half-built sets of the same color join up, so you never end up with a
    2/3 and a 1/3 of the same color sitting side by side. */
function mergeSets(p, events) {
  for (const color of new Set(p.sets.map((s) => s.color))) {
    const open = p.sets.filter((s) => s.color === color && !isComplete(s));
    for (let i = 0; i < open.length; i++) {
      for (let j = i + 1; j < open.length && !isComplete(open[i]); j++) {
        while (open[j].cards.length && !isComplete(open[i])) open[i].cards.push(open[j].cards.shift());
        if (isComplete(open[i])) events.push({ t: "setComplete", p: p.id, color, set: open[i].id });
      }
    }
  }
  p.sets = p.sets.filter((s) => s.cards.length);
}

function tidy(p, events) {
  for (const s of p.sets) {
    if (!isComplete(s) && (s.house || s.hotel)) {
      if (s.house) p.bank.push(s.house);
      if (s.hotel) p.bank.push(s.hotel);
      events.push({ t: "buildingsToBank", p: p.id, set: s.id });
      s.house = s.hotel = null;
    }
  }
  p.sets = p.sets.filter((s) => s.cards.length);
}

// ------------------------------------------------------------------ turns

function startTurn(state, events) {
  const p = active(state);
  state.turn.number++;
  state.turn.plays = 0;
  state.phase = "play";
  // A discard still owed from last turn is settled before anything else.
  if (state.discards[p.id]) autoDiscard(state, p.id, events);
  events.push({ t: "turn", p: p.id, n: state.turn.number });
  if (checkWin(state, events)) return;
  // Drawing is the player's own move (see drawCards). Start with an empty
  // hand and it's 5 cards instead of 2.
  state.turn.toDraw = p.hand.length ? 2 : 5;
  state.turn.drawn = false;
  state.turn.drawLost = false;
}

/** With the draw-first rule on, any move made before drawing gives up the
    draw. (act() reports it after the move itself, so it reads in order.) */
function forfeitDraw(state) {
  if (state.turn.drawn || state.turn.drawLost || state.options.drawFirst === false) return;
  state.turn.drawLost = true;
}

/** Take this turn's free cards off the deck. Forget, and they're gone. */
function drawCards(state, p, events) {
  if (state.turn.drawn) fail("you've already drawn this turn");
  if (state.turn.drawLost) fail("too late to draw: you played before drawing");
  state.turn.drawn = true;
  draw(state, p, state.turn.toDraw, events);
}

function endTurn(state, events) {
  const p = active(state);
  const extra = p.hand.length - HAND_LIMIT;
  if (extra > 0) {
    state.discards[p.id] = extra;
    events.push({ t: "mustDiscard", p: p.id, n: extra });
  }
  if (!state.turn.drawn && !state.turn.drawLost) events.push({ t: "skippedDraw", p: p.id, n: state.turn.toDraw });
  events.push({ t: "endTurn", p: p.id });
  state.turn.player = (state.turn.player + 1) % state.players.length;
  startTurn(state, events);
}

/** Anyone with enough sets wins at once, whoever's turn it is (a Forced
    Deal or a payment can finish a set on someone else's turn). The player
    whose turn it is is checked first, then the rest in seat order. */
function checkWin(state, events) {
  if (state.phase === "over") return true;
  const n = state.players.length;
  for (let k = 0; k < n; k++) {
    const p = state.players[(state.turn.player + k) % n];
    if (!hasWon(state, p)) continue;
    state.phase = "over";
    state.winner = p.id;
    state.pending = null;
    events.push({ t: "win", p: p.id });
    return true;
  }
  return false;
}

function spendPlays(state, n) {
  if (state.turn.plays + n > PLAYS_PER_TURN) fail("no plays left this turn");
  state.turn.plays += n;
}

// ------------------------------------------------------------------ actions

/**
 * Apply one action for one player. Throws RuleError (leaving the state
 * untouched) if it isn't allowed.
 */
export function act(state, playerId, action) {
  if (state.phase === "over") fail("the game is over");
  const p = player(state, playerId);
  const events = [];

  // Validate against a copy first, so a rejected action never half-applies.
  // The log is left out of the copy; it only grows and is never read here.
  const { log, ...rest } = state;
  const trial = structuredClone(rest);
  trial.log = [];
  dispatch(trial, player(trial, playerId), action, []);

  const { drawLost, toDraw } = state.turn;
  const who = active(state).id;
  dispatch(state, p, action, events);
  if (!drawLost && state.turn.drawLost && active(state).id === who) events.push({ t: "drawLost", p: who, n: toDraw });
  for (const q of state.players) mergeSets(q, events);
  checkWin(state, events);
  state.log.push(...events);
  return events;
}

function dispatch(state, p, a, events) {
  if (!a || typeof a.type !== "string") fail("bad action");

  if (a.type === "discard") return discard(state, p, a.cards, events);

  if (state.phase === "respond") return respond(state, p, a, events);

  if (active(state) !== p) fail("it isn't your turn");

  if (a.type !== "endTurn" && a.type !== "draw") forfeitDraw(state);

  switch (a.type) {
    case "endTurn": return endTurn(state, events);
    case "draw": return drawCards(state, p, events);
    case "move": return move(state, p, a, events);
    case "bank": return bank(state, p, a, events);
    case "property": return property(state, p, a, events);
    case "passGo": return passGo(state, p, a, events);
    case "house": return building(state, p, a, "house", events);
    case "hotel": return building(state, p, a, "hotel", events);
    case "birthday": return charge(state, p, a, "birthday", events);
    case "debt": return charge(state, p, a, "debt", events);
    case "rent": return rent(state, p, a, events);
    case "sly": return sly(state, p, a, events);
    case "forced": return forced(state, p, a, events);
    case "dealBreaker": return dealBreaker(state, p, a, events);
    default: fail("unknown action " + a.type);
  }
}

function playable(state, p, card, action) {
  if (!p.hand.includes(card)) fail("that card is not in your hand");
  const d = def(state, card);
  if (action && !(d.type === "action" && d.action === action)) fail("that isn't a " + action + " card");
  return d;
}

function bank(state, p, { card }, events) {
  const d = playable(state, p, card);
  if (isProperty(d)) fail("properties can't go in the bank");
  spendPlays(state, 1);
  takeFromHand(p, card);
  p.bank.push(card);
  events.push({ t: "bank", p: p.id, card, def: d.id });
}

function property(state, p, { card, color, set }, events) {
  const d = playable(state, p, card);
  if (!isProperty(d)) fail("that isn't a property");
  const c = color || (d.type === "property" ? d.color : d.colors[0]);
  spendPlays(state, 1);
  takeFromHand(p, card);
  const s = placeProperty(state, p, card, c, set, events);
  events.push({ t: "property", p: p.id, card, def: d.id, color: c, set: s.id });
  checkWin(state, events);
}

/** Rearranging your own properties is free, but only on your turn. */
function move(state, p, { card, color, set }, events) {
  const o = owner(state, card);
  if (!o || o.p !== p || o.where !== "set") fail("that isn't one of your properties");
  const d = def(state, card);
  const c = color || o.set.color;
  if (!cardColors(d).includes(c)) fail("that card can't be that color");
  if (set != null) {
    const target = findSet(p, set);
    if (target === o.set) fail("it's already there");
    if (target.color !== c || isComplete(target)) fail("can't move it there");
  } else if (c === o.set.color) {
    fail("it's already that color");
  }
  o.set.cards.splice(o.set.cards.indexOf(card), 1);
  const s = placeProperty(state, p, card, c, set ?? null, events);
  tidy(p, events);
  events.push({ t: "move", p: p.id, card, color: c, set: s.id });
  checkWin(state, events);
}

function passGo(state, p, { card }, events) {
  const d = playable(state, p, card, "pass-go");
  spendPlays(state, 1);
  takeFromHand(p, card);
  state.discard.push(card);
  events.push({ t: "action", p: p.id, action: "pass-go", card, def: d.id });
  draw(state, p, 2, events);
}

function building(state, p, { card, set }, kind, events) {
  const d = playable(state, p, card, kind);
  const s = findSet(p, set);
  if (!isComplete(s)) fail("buildings go on complete sets only");
  if (NO_BUILDINGS.has(s.color)) fail("no buildings on railroads or utilities");
  if (kind === "house" && s.house) fail("that set already has a house");
  if (kind === "hotel" && !s.house) fail("a hotel needs a house first");
  if (kind === "hotel" && s.hotel) fail("that set already has a hotel");
  spendPlays(state, 1);
  takeFromHand(p, card);
  s[kind] = card;
  events.push({ t: "action", p: p.id, action: kind, card, def: d.id, set: s.id });
}

function others(state, p) {
  return state.players.filter((q) => q !== p);
}

function target(state, p, id) {
  const q = player(state, id);
  if (q === p) fail("you can't target yourself");
  return q;
}

function charge(state, p, { card, target: t }, kind, events) {
  const d = playable(state, p, card, kind === "birthday" ? "birthday" : "debt-collector");
  const targets = kind === "birthday" ? others(state, p) : [target(state, p, t)];
  spendPlays(state, 1);
  takeFromHand(p, card);
  state.discard.push(card);
  const amount = kind === "birthday" ? 2 : 5;
  events.push({ t: "action", p: p.id, action: d.action, card, def: d.id, targets: targets.map((q) => q.id), amount });
  begin(state, { kind: "pay", reason: kind, by: p.id, amount, def: d.id }, targets, events);
}

function rent(state, p, { card, set, target: t, doubles = [] }, events) {
  const d = playable(state, p, card);
  if (d.type !== "rent") fail("that isn't a rent card");
  const s = findSet(p, set);
  if (!d.colors.includes(s.color)) fail("that rent card can't charge that color");
  if (!Array.isArray(doubles) || doubles.length > 2) fail("up to two Double the Rent cards");
  if (new Set(doubles).size !== doubles.length) fail("same card twice");
  for (const c of doubles) playable(state, p, c, "double-the-rent");
  const base = rentFor(state, s);
  if (!base) fail("that set doesn't charge any rent");
  const wild = d.colors.length > 2;
  const targets = wild ? [target(state, p, t)] : others(state, p);
  spendPlays(state, 1 + doubles.length);
  for (const c of [card, ...doubles]) { takeFromHand(p, c); state.discard.push(c); }
  const amount = base * 2 ** doubles.length;
  events.push({ t: "action", p: p.id, action: "rent", card, def: d.id, doubles, color: s.color, set: s.id,
    targets: targets.map((q) => q.id), amount });
  // def: the exact card played, so the people being charged see it.
  begin(state, { kind: "pay", reason: "rent", by: p.id, amount, def: d.id, doubles: doubles.length }, targets, events);
}

function sly(state, p, { card, target: t, take }, events) {
  const d = playable(state, p, card, "sly-deal");
  const q = target(state, p, t);
  const o = owner(state, take);
  if (!o || o.p !== q || o.where !== "set") fail("pick one of their properties");
  if (isComplete(o.set)) fail("you can't take from a complete set");
  spendPlays(state, 1);
  takeFromHand(p, card);
  state.discard.push(card);
  events.push({ t: "action", p: p.id, action: "sly-deal", card, def: d.id, targets: [q.id], take });
  begin(state, { kind: "sly", by: p.id, take }, [q], events);
}

function forced(state, p, { card, target: t, take, give }, events) {
  const d = playable(state, p, card, "forced-deal");
  const q = target(state, p, t);
  const ot = owner(state, take), og = owner(state, give);
  if (!ot || ot.p !== q || ot.where !== "set") fail("pick one of their properties");
  if (!og || og.p !== p || og.where !== "set") fail("pick one of your properties to give");
  if (isComplete(ot.set)) fail("you can't take from a complete set");
  if (isComplete(og.set)) fail("you can't give from a complete set");
  spendPlays(state, 1);
  takeFromHand(p, card);
  state.discard.push(card);
  events.push({ t: "action", p: p.id, action: "forced-deal", card, def: d.id, targets: [q.id], take, give });
  begin(state, { kind: "forced", by: p.id, take, give }, [q], events);
}

function dealBreaker(state, p, { card, target: t, set }, events) {
  const d = playable(state, p, card, "deal-breaker");
  const q = target(state, p, t);
  const s = findSet(q, set);
  if (!isComplete(s)) fail("Deal Breaker takes a complete set");
  spendPlays(state, 1);
  takeFromHand(p, card);
  state.discard.push(card);
  events.push({ t: "action", p: p.id, action: "deal-breaker", card, def: d.id, targets: [q.id], set });
  begin(state, { kind: "dealBreaker", by: p.id, set }, [q], events);
}

// ------------------------------------------------------------------ responses

// A card aimed at other players opens a "pending" exchange. Each target
// answers on its own: Just Say No, or accept. A Just Say No can be answered
// by the player who started it with another, and so on. When a target
// accepts, the effect lands (or, for money, they choose what to pay).

const hasNo = (state, p) => p.hand.some((c) => def(state, c).action === "just-say-no");

function begin(state, pending, targets, events) {
  state.pending = { ...pending, targets: targets.map((q) => ({ id: q.id, step: "respond", nos: 0, result: null })) };
  state.phase = "respond";
  advance(state, events);
}

/** Players who must act now, and what for. */
export function awaiting(state) {
  if (state.phase !== "respond") return state.phase === "play" ? [{ id: active(state).id, step: "play" }] : [];
  const out = [];
  for (const t of state.pending.targets) {
    if (t.step === "respond" || t.step === "pay") out.push({ id: t.id, step: t.step });
    if (t.step === "counter") out.push({ id: state.pending.by, step: "counter", for: t.id });
  }
  return out;
}

/** Skip steps nobody can meaningfully take, then finish when all are done. */
function advance(state, events) {
  const pd = state.pending;
  const by = player(state, pd.by);
  for (const t of pd.targets) {
    const q = player(state, t.id);
    for (let guard = 0; guard < 10; guard++) {
      // Nothing to pay with: no point spending a Just Say No on it, skip straight past.
      const broke = pd.kind === "pay" && !payable(state, q).length;
      if (t.step === "respond" && (!hasNo(state, q) || broke)) accept(state, t, events);
      else if (t.step === "counter" && !hasNo(state, by)) block(t, events, pd);
      else if (t.step === "pay" && !payable(state, q).length) settle(state, t, [], events);
      else break;
    }
  }
  if (pd.targets.every((t) => t.step === "done")) {
    state.pending = null;
    state.phase = "play";
    checkWin(state, events);
  }
}

function block(t, events, pd) {
  t.step = "done";
  t.result = "blocked";
  events.push({ t: "blocked", p: t.id, by: pd.by, kind: pd.kind, reason: pd.reason });
}

function accept(state, t, events) {
  const pd = state.pending;
  if (pd.kind === "pay") { t.step = "pay"; return; }
  apply(state, pd, player(state, t.id), events);
  t.step = "done";
  t.result = "applied";
}

function apply(state, pd, q, events) {
  const p = player(state, pd.by);
  if (pd.kind === "sly") {
    const color = removeFromTable(state, q, pd.take, events);
    receiveProperty(state, p, pd.take, color, events);
    events.push({ t: "steal", from: q.id, to: p.id, cards: [pd.take], kind: "sly-deal" });
  } else if (pd.kind === "forced") {
    const ct = removeFromTable(state, q, pd.take, events);
    const cg = removeFromTable(state, p, pd.give, events);
    receiveProperty(state, p, pd.take, ct, events);
    receiveProperty(state, q, pd.give, cg, events);
    events.push({ t: "swap", a: p.id, b: q.id, gave: pd.give, took: pd.take });
  } else if (pd.kind === "dealBreaker") {
    const s = findSet(q, pd.set);
    q.sets = q.sets.filter((x) => x !== s);
    s.id = state.nextSet++;
    p.sets.push(s);
    events.push({ t: "steal", from: q.id, to: p.id, cards: [...s.cards, s.house, s.hotel].filter(Boolean),
      kind: "deal-breaker", color: s.color });
    events.push({ t: "setComplete", p: p.id, color: s.color, set: s.id });
  }
}

/** Hand over chosen cards for a debt. Properties go to the receiver's table,
    everything else (money, actions, buildings) to their bank. */
function settle(state, t, cards, events) {
  const pd = state.pending;
  const q = player(state, t.id), p = player(state, pd.by);
  const pool = payable(state, q);
  if (new Set(cards).size !== cards.length) fail("same card twice");
  for (const c of cards) if (!pool.includes(c)) fail("you can't pay with that card");
  const total = cards.reduce((n, c) => n + value(state, c), 0);
  const all = pool.reduce((n, c) => n + value(state, c), 0);
  // Money first: properties and buildings only once every bank card is in.
  if (cards.some((c) => !q.bank.includes(c)) && q.bank.some((c) => !cards.includes(c))) {
    fail("pay with your money first — properties only once your bank is empty");
  }
  if (total < pd.amount && total < all) fail(`that's only ${total}M of ${pd.amount}M`);
  // Remove buildings before properties, so a hotel never outlives its house.
  const order = [...cards].sort((a, b) => rank(state, q, a) - rank(state, q, b));
  const moved = [];
  for (const c of order) {
    const o = owner(state, c);
    if (o.p !== q) continue; // already moved with its house
    const color = removeFromTable(state, q, c, events);
    if (color) receiveProperty(state, p, c, color, events);
    else p.bank.push(c);
    moved.push(c);
  }
  events.push({ t: "pay", from: q.id, to: p.id, cards: moved, amount: total, owed: pd.amount, reason: pd.reason });
  t.step = "done";
  t.result = "paid";
}

function rank(state, q, c) {
  const o = owner(state, c);
  return o.where === "hotel" ? 0 : o.where === "house" ? 1 : 2;
}

function respond(state, p, a, events) {
  const pd = state.pending;
  if (a.type === "justSayNo") {
    const card = a.card;
    if (!p.hand.includes(card) || def(state, card).action !== "just-say-no") fail("you need a Just Say No card");
    const t = p.id === pd.by ? pd.targets.find((x) => x.id === a.for && x.step === "counter")
      : pd.targets.find((x) => x.id === p.id && x.step === "respond");
    if (!t) fail("nothing to say no to");
    takeFromHand(p, card);
    state.discard.push(card);
    t.nos++;
    t.step = p.id === pd.by ? "respond" : "counter";
    events.push({ t: "justSayNo", p: p.id, against: p.id === pd.by ? t.id : pd.by, n: t.nos });
  } else if (a.type === "accept") {
    const t = p.id === pd.by ? pd.targets.find((x) => x.id === a.for && x.step === "counter")
      : pd.targets.find((x) => x.id === p.id && x.step === "respond");
    if (!t) fail("nothing to accept");
    if (t.step === "counter") block(t, events, pd);
    else accept(state, t, events);
  } else if (a.type === "pay") {
    const t = pd.targets.find((x) => x.id === p.id && x.step === "pay");
    if (!t) fail("you don't owe anything right now");
    settle(state, t, a.cards || [], events);
  } else {
    fail("waiting for responses");
  }
  advance(state, events);
}

// ------------------------------------------------------------------ discards

function discard(state, p, cards, events) {
  const n = state.discards[p.id];
  if (!n) fail("you don't need to discard");
  if (!Array.isArray(cards) || cards.length !== n) fail(`discard exactly ${n}`);
  if (new Set(cards).size !== n) fail("same card twice");
  for (const c of cards) if (!p.hand.includes(c)) fail("that card is not in your hand");
  for (const c of cards) { takeFromHand(p, c); state.discard.push(c); }
  delete state.discards[p.id];
  events.push({ t: "discard", p: p.id, cards });
}

/** The discard window ran out: drop the least useful cards. */
export function autoDiscard(state, playerId, events = []) {
  const p = player(state, playerId);
  const n = state.discards[playerId];
  if (!n) return events;
  const keepScore = (c) => {
    const d = def(state, c);
    if (d.action === "just-say-no" || d.action === "deal-breaker") return 100;
    if (isProperty(d)) return 50 + d.value;
    return d.value;
  };
  const cards = [...p.hand].sort((a, b) => keepScore(a) - keepScore(b)).slice(0, n);
  discard(state, p, cards, events);
  return events;
}

// ------------------------------------------------------------------ time

/** Pay a debt automatically: the fewest bank cards that cover it, then the
    cheapest properties and buildings, keeping complete sets whole if it can. */
export function autoPayment(state, q, amount) {
  const bankCards = q.bank.map((c) => [c, value(state, c)]);
  // Smallest bank total >= amount (subset sum over small numbers).
  let best = null;
  const reach = new Map([[0, []]]);
  for (const [c, v] of bankCards) {
    for (const [sum, list] of [...reach]) {
      const ns = sum + v;
      if (!reach.has(ns) || reach.get(ns).length > list.length + 1) reach.set(ns, [...list, c]);
    }
  }
  for (const [sum, list] of reach) if (sum >= amount && (!best || sum < best[0])) best = [sum, list];
  if (best) return best[1];

  const out = q.bank.slice();
  let total = out.reduce((n, c) => n + value(state, c), 0);
  const rest = payable(state, q).filter((c) => !q.bank.includes(c)).map((c) => {
    const o = owner(state, c);
    const complete = o.set && isComplete(o.set) ? 1 : 0;
    return { c, v: value(state, c), complete };
  }).sort((a, b) => a.complete - b.complete || a.v - b.v);
  for (const x of rest) {
    if (total >= amount) break;
    out.push(x.c);
    total += x.v;
  }
  return out;
}

/**
 * Take a player out of a game in progress (the leader kicked them). Their
 * hand, bank and table go onto the discard pile; anything aimed at them is
 * dropped, anything they started is cancelled; if it was their turn, the next
 * player is up. One player left standing wins.
 */
export function removePlayer(state, playerId) {
  const events = [];
  const i = state.players.findIndex((p) => p.id === playerId);
  if (i < 0) fail("no such player");
  if (state.phase === "over") fail("the game is over");
  const p = state.players[i];
  const wasTurn = state.turn.player === i;

  for (const s of p.sets) state.discard.push(...s.cards, ...[s.house, s.hotel].filter(Boolean));
  state.discard.push(...p.hand, ...p.bank);
  delete state.discards[p.id];

  const pd = state.pending;
  if (pd && pd.by === p.id) { state.pending = null; state.phase = "play"; }
  else if (pd) pd.targets = pd.targets.filter((t) => t.id !== p.id);

  state.players.splice(i, 1);
  events.push({ t: "removed", p: p.id, name: p.name });

  if (state.players.length < 2) {
    state.phase = "over";
    state.pending = null;
    state.winner = state.players[0]?.id || null;
    if (state.winner) events.push({ t: "win", p: state.winner });
  } else if (wasTurn) {
    state.turn.player = i % state.players.length;
    state.pending = null;
    startTurn(state, events);
  } else {
    if (i < state.turn.player) state.turn.player--;
    if (state.pending && !state.pending.targets.length) { state.pending = null; state.phase = "play"; checkWin(state, events); }
    else if (state.pending) advance(state, events);
  }
  state.log.push(...events);
  return events;
}

/** Whoever the game is waiting on ran out of time. */
export function timeout(state) {
  const events = [];
  if (state.phase === "play") {
    events.push({ t: "timeout", p: active(state).id });
    endTurn(state, events);
  } else if (state.phase === "respond") {
    const pd = state.pending;
    for (const t of pd.targets) {
      if (t.step === "respond") { events.push({ t: "timeout", p: t.id }); accept(state, t, events); }
      if (t.step === "counter") { events.push({ t: "timeout", p: pd.by }); block(t, events, pd); }
    }
    for (const t of pd.targets) {
      if (t.step === "pay") settle(state, t, autoPayment(state, player(state, t.id), pd.amount), events);
    }
    advance(state, events);
  }
  for (const q of state.players) mergeSets(q, events);
  checkWin(state, events);
  state.log.push(...events);
  return events;
}

// ------------------------------------------------------------------ legal moves

/** Every action this player could take right now. Payment is offered as one
    suggestion (the automatic choice); any valid set of cards is accepted. */
export function legalMoves(state, playerId) {
  const p = player(state, playerId);
  const moves = [];
  if (state.discards[p.id]) moves.push({ type: "discard", cards: autoDiscardChoice(state, p) });
  if (state.phase === "over") return moves;

  if (state.phase === "respond") {
    const nos = p.hand.filter((c) => def(state, c).action === "just-say-no");
    for (const w of awaiting(state).filter((x) => x.id === p.id)) {
      if (w.step === "pay") moves.push({ type: "pay", cards: autoPayment(state, p, state.pending.amount) });
      else {
        moves.push({ type: "accept", for: w.for });
        if (nos.length) moves.push({ type: "justSayNo", card: nos[0], for: w.for });
      }
    }
    return moves;
  }

  if (active(state) !== p) return moves;
  if (!state.turn.drawn && !state.turn.drawLost) moves.push({ type: "draw" });
  moves.push({ type: "endTurn" });

  for (const s of p.sets) {
    for (const c of s.cards) {
      const d = def(state, c);
      for (const color of cardColors(d)) {
        if (color !== s.color) moves.push({ type: "move", card: c, color });
      }
    }
  }

  const left = PLAYS_PER_TURN - state.turn.plays;
  if (left <= 0) return moves;

  const opp = others(state, p);
  const loose = (q) => q.sets.filter((s) => !isComplete(s)).flatMap((s) => s.cards);
  const doubles = p.hand.filter((c) => def(state, c).action === "double-the-rent");

  for (const c of new Set(p.hand)) {
    const d = def(state, c);
    if (isProperty(d)) {
      for (const color of cardColors(d)) moves.push({ type: "property", card: c, color });
      continue;
    }
    moves.push({ type: "bank", card: c });
    if (d.type === "rent") {
      for (const s of p.sets) {
        if (!d.colors.includes(s.color) || !rentFor(state, s)) continue;
        for (let k = 0; k <= Math.min(doubles.length, left - 1, 2); k++) {
          const dbl = doubles.slice(0, k);
          if (d.colors.length > 2) for (const q of opp) moves.push({ type: "rent", card: c, set: s.id, target: q.id, doubles: dbl });
          else moves.push({ type: "rent", card: c, set: s.id, doubles: dbl });
        }
      }
      continue;
    }
    switch (d.action) {
      case "pass-go": moves.push({ type: "passGo", card: c }); break;
      case "birthday": moves.push({ type: "birthday", card: c }); break;
      case "debt-collector": for (const q of opp) moves.push({ type: "debt", card: c, target: q.id }); break;
      case "sly-deal":
        for (const q of opp) for (const take of loose(q)) moves.push({ type: "sly", card: c, target: q.id, take });
        break;
      case "forced-deal":
        for (const q of opp) for (const take of loose(q)) for (const give of loose(p)) {
          moves.push({ type: "forced", card: c, target: q.id, take, give });
        }
        break;
      case "deal-breaker":
        for (const q of opp) for (const s of q.sets.filter(isComplete)) {
          moves.push({ type: "dealBreaker", card: c, target: q.id, set: s.id });
        }
        break;
      case "house":
        for (const s of p.sets) if (isComplete(s) && !NO_BUILDINGS.has(s.color) && !s.house) moves.push({ type: "house", card: c, set: s.id });
        break;
      case "hotel":
        for (const s of p.sets) if (isComplete(s) && s.house && !s.hotel) moves.push({ type: "hotel", card: c, set: s.id });
        break;
    }
  }
  return moves;
}

function autoDiscardChoice(state, p) {
  const copy = structuredClone(state);
  const events = autoDiscard(copy, p.id);
  return events.find((e) => e.t === "discard")?.cards || [];
}

// ------------------------------------------------------------------ views

/** Everything one player may see. Other hands and the deck are counts only,
    and only face-up cards are named. */
export function view(state, playerId) {
  const visible = new Set(state.discard);
  const players = state.players.map((p) => {
    for (const c of p.bank) visible.add(c);
    for (const s of p.sets) { for (const c of s.cards) visible.add(c); if (s.house) visible.add(s.house); if (s.hotel) visible.add(s.hotel); }
    const mine = p.id === playerId;
    if (mine) for (const c of p.hand) visible.add(c);
    return { id: p.id, name: p.name, hand: mine ? [...p.hand] : p.hand.length, bank: [...p.bank], sets: structuredClone(p.sets) };
  });
  const cards = {};
  for (const c of visible) cards[c] = state.cards[c];
  return {
    you: playerId,
    options: { ...state.options },
    players,
    cards,
    deck: state.deck.length,
    discard: [...state.discard],
    turn: { ...state.turn, player: active(state).id },
    phase: state.phase,
    pending: state.pending && structuredClone(state.pending),
    awaiting: awaiting(state),
    discards: { ...state.discards },
    winner: state.winner,
  };
}

/** Final order: the winner, then most complete colors, then the most value on
    the table and in the bank. */
export function standings(state) {
  const worth = (p) => p.bank.reduce((n, c) => n + value(state, c), 0) +
    p.sets.reduce((n, s) => n + s.cards.reduce((m, c) => m + value(state, c), 0) +
      (s.house ? HOUSE_VALUE : 0) + (s.hotel ? HOTEL_VALUE : 0), 0);
  return state.players
    .map((p) => ({ id: p.id, name: p.name, sets: completeColors(p).length, worth: worth(p), winner: p.id === state.winner }))
    .sort((a, b) => b.winner - a.winner || b.sets - a.sets || b.worth - a.worth);
}

// HOUSE RULES — where the printed rules are silent
//
// - Money first: you pay from your bank, and may only add properties or
//   buildings once every bank card is handed over (owner's rule).
// - Incomplete sets of the same color merge automatically.
// - Houses and hotels can be handed over as payment (3M / 4M). They go to
//   the receiver's bank.
// - If a set with buildings stops being complete (a property is paid away or
//   a wild card is moved out), its buildings drop into the owner's bank.
// - Up to two Double the Rent cards can go on one Rent card (x4), using all
//   three plays.
// - Forced Deal can't take from, or give from, a complete set.
// - A set made only of ten-color wilds charges no rent.
// - A ten-color (rainbow) wild on the table is worth what a property of its
//   color is worth (e.g. 4M as green), so it can be used to pay (owner's rule).
// - Just Say No played in response never uses one of your three plays.
// - A win counts the moment it happens, on anyone's turn (owner's rule): a
//   Forced Deal or a payment that finishes your last set wins on the spot.
// - When the draw pile runs out, the discard pile is shuffled into a new one.
// - Drawing is a move of its own: tap the deck any time on your turn. End
//   the turn (or run out of time) without drawing and those cards are lost.
// - Players who aren't asked to choose (no Just Say No in hand, nothing to pay
//   with) are skipped automatically, so the game never waits on a non-choice.
