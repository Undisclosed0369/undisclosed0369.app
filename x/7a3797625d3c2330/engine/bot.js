// AI players. Picks one move at a time from the engine's legal moves.
//
//   chooseMove(state, playerId, level)  -> action
//
// "easy" knows what the cards do but plays loosely: it often picks a
// so-so move over the best one, forgets to hold its Just Say No, and pays
// with whatever comes to hand. Beatable, not brainless.
// "normal" plays like a decent human: it finishes sets, keeps some money in
// the bank, hunts the player in the lead, saves its Just Say No for the big
// hits and its Deal Breaker for full sets, and pays with what it can spare.
//
// It plays fair: it only looks at its own hand and what's face up on the
// table (other hands and the deck order are never read). It's also cheap:
// no lookahead, just a score per legal move, so it runs inside the server's
// tiny CPU budget.

import * as R from "./rules.js";

const rand = () => Math.random();
// A winning move beats everything, and never ties with another one.
const WIN = 1000;
const pickRandom = (list) => list[Math.floor(rand() * list.length)];

export function chooseMove(state, playerId, level = "normal") {
  const moves = R.legalMoves(state, playerId);
  if (!moves.length) return null;
  const me = R.player(state, playerId);

  // A discard owed from an earlier turn, while it isn't our turn to play.
  const owed = moves.find((m) => m.type === "discard");
  if (owed && (state.phase !== "respond" || !R.awaiting(state).some((a) => a.id === playerId))) {
    if (R.active(state).id !== playerId || state.phase !== "play") {
      return level === "easy" ? owed : { type: "discard", cards: discardChoice(state, me, state.discards[playerId]) };
    }
  }

  // Robots never forget to draw.
  const draw = moves.find((m) => m.type === "draw");
  if (draw) return draw;

  const pay = moves.find((m) => m.type === "pay");
  if (pay) return level === "easy" ? pay : { type: "pay", cards: paymentChoice(state, me, state.pending.amount) };

  const ctx = context(state, me);
  // Easy: a lot of noise on every score, and now and then just any move.
  const noise = level === "easy" ? 14 : 0.3;
  if (level === "easy" && rand() < 0.15) {
    const any = moves.filter((m) => m.type !== "discard" && m.type !== "move");
    if (any.length) return pickRandom(any);
  }
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    if (m.type === "discard") continue;
    const base = score(ctx, m);
    // Moving a wild is free, so a noisy player could shuffle forever: Easy
    // only moves one when it finishes a set.
    if (level === "easy" && m.type === "move" && base < 20) continue;
    const s = base + rand() * noise;
    if (s > bestScore) { best = m; bestScore = s; }
  }
  return best || owed;
}

// ------------------------------------------------------------------ reading the table

function context(state, me) {
  const others = state.players.filter((p) => p.id !== me.id);
  const strength = (p) => R.completeColors(p).length * 10 + p.sets.reduce((n, s) => n + Math.min(1, s.cards.length / R.setSize(s.color)), 0) * 3 + bankOf(state, p) * 0.15;
  const leader = others.reduce((a, b) => (strength(b) > strength(a) ? b : a), others[0]);
  return {
    state, me, others, leader,
    goal: state.options.winSets,
    done: R.completeColors(me).length,
    playsLeft: 3 - state.turn.plays,
    myBank: bankOf(state, me),
  };
}

const bankOf = (state, p) => p.bank.reduce((n, c) => n + R.value(state, c), 0);
const wealth = (state, p) => R.payable(state, p).reduce((n, c) => n + R.value(state, c), 0);
const openSet = (p, color) => p.sets.find((s) => s.color === color && !R.isComplete(s));
const setOf = (p, card) => p.sets.find((s) => s.cards.includes(card));
const hasComplete = (p, color) => p.sets.some((s) => s.color === color && R.isComplete(s));
/** How far along a color is for this player, 0..1 (its best unfinished set). */
const progress = (p, color) => {
  const s = openSet(p, color);
  return s ? s.cards.length / R.setSize(color) : 0;
};

/** Would one more card of this color finish a set (and maybe win)? */
function finishes(ctx, p, color) {
  if (hasComplete(p, color) && !openSet(p, color)) return { set: false, win: false };
  const s = openSet(p, color);
  const have = s ? s.cards.length : 0;
  const set = have + 1 >= R.setSize(color);
  const newColor = set && !hasComplete(p, color);
  return { set, win: newColor && R.completeColors(p).length + 1 >= ctx.goal };
}

// ------------------------------------------------------------------ scoring a move

function score(ctx, m) {
  const { state, me } = ctx;
  const d = m.card ? R.def(state, m.card) : null;
  switch (m.type) {
    case "endTurn": return 0;
    case "accept": return 4;
    case "justSayNo": return justSayNo(ctx, m);
    case "property": return property(ctx, m, d);
    case "move": return moveWild(ctx, m);
    case "bank": return bank(ctx, d);
    case "passGo": return me.hand.length <= 4 ? 8 : me.hand.length >= 7 ? 1 : 5;
    case "birthday": {
      const take = ctx.others.reduce((n, p) => n + Math.min(2, wealth(state, p)), 0);
      return take ? 3 + take * 1.2 : -2;
    }
    case "debt": {
      const q = R.player(state, m.target);
      const take = Math.min(5, wealth(state, q));
      return take ? 3 + take * 1.4 + (q === ctx.leader ? 2 : 0) : -2;
    }
    case "rent": return rent(ctx, m);
    case "sly": return sly(ctx, m);
    case "forced": return forced(ctx, m);
    case "dealBreaker": return dealBreaker(ctx, m);
    case "house": case "hotel": {
      const s = R.findSet(me, m.set);
      return 7 + R.rentFor(state, s) * 0.3;
    }
    default: return 0;
  }
}

function property(ctx, m, d) {
  const { me } = ctx;
  const f = finishes(ctx, me, m.color);
  if (f.win) return WIN + 3; // the simplest way to win goes first
  if (f.set) return 30;
  const p = progress(me, m.color);
  // The ten-color wild is precious: only spend it where it counts.
  if (d.type === "wild" && d.colors.length > 2) return p ? 4 + p * 6 : -1;
  return 9 + p * 8;
}

function moveWild(ctx, m) {
  const { me } = ctx;
  const from = setOf(me, m.card);
  // Never break up a finished set just to shuffle cards about.
  if (from && R.isComplete(from) && from.cards.length <= R.setSize(from.color)) return -30;
  const f = finishes(ctx, me, m.color);
  if (f.win) return WIN + 2;
  if (f.set) return 25;
  // Otherwise only worth it if the card goes somewhere clearly better.
  const gain = progress(me, m.color) - (from ? (from.cards.length - 1) / R.setSize(from.color) : 0);
  return gain > 0.34 ? 1 + gain * 4 : -1;
}

function bank(ctx, d) {
  const { me, myBank, playsLeft } = ctx;
  // Cards beyond seven at the end of the turn are thrown away: bank them instead.
  const overflow = me.hand.length - 7 >= playsLeft;
  if (d.type === "money") return Math.max(1.5, 6 - myBank * 0.35) + d.value * 0.3 + (overflow ? 3 : 0);
  if (d.type === "action") {
    if (d.action === "just-say-no" || d.action === "deal-breaker") return overflow ? 1 : -8;
    if (d.action === "sly-deal" || d.action === "forced-deal") return overflow ? 2 : -2;
    // Weak actions are worth more as cash when the bank is thin.
    return (myBank < 5 ? 3 : 1) + d.value * 0.4 + (overflow ? 3 : 0);
  }
  return (myBank < 4 ? 2 : 0.5) + d.value * 0.3 + (overflow ? 3 : 0);
}

function rent(ctx, m) {
  const { state, me } = ctx;
  const s = R.findSet(me, m.set);
  const amount = R.rentFor(state, s) * 2 ** m.doubles.length;
  const targets = m.target ? [R.player(state, m.target)] : ctx.others;
  const take = targets.reduce((n, p) => n + Math.min(amount, wealth(state, p)), 0);
  if (!take) return -2;
  // A Double the Rent is a play and a card: only worth it when it really pays.
  const leaderBonus = m.target && R.player(state, m.target) === ctx.leader ? 2 : 0;
  return 2 + take * 1.1 - m.doubles.length * 3.5 + leaderBonus;
}

function sly(ctx, m) {
  const { state, me } = ctx;
  const q = R.player(state, m.target);
  const from = setOf(q, m.take);
  const color = from.color;
  const f = finishes(ctx, me, color);
  if (f.win) return WIN + 1;
  let s = 8 + R.value(state, m.take) * 0.4 + progress(me, color) * 6;
  if (f.set) s += 18;
  // Spoil a set someone is one card from finishing.
  if (from.cards.length + 1 >= R.setSize(color)) s += 6;
  if (q === ctx.leader) s += 2;
  return s;
}

function forced(ctx, m) {
  const { state, me } = ctx;
  const q = R.player(state, m.target);
  const takeColor = setOf(q, m.take).color;
  const giveSet = setOf(me, m.give);
  const f = finishes(ctx, me, takeColor);
  if (f.win) return WIN + 1;
  let gain = 4 + R.value(state, m.take) * 0.4 + progress(me, takeColor) * 6 + (f.set ? 18 : 0);
  if (giveSet && giveSet.color === takeColor) return -5; // a pointless swap
  // What we give up: the progress that card was making, and its value.
  const loss = R.value(state, m.give) * 0.4 + (giveSet ? (giveSet.cards.length / R.setSize(giveSet.color)) * 8 : 0);
  // Handing them the card that finishes their set is a gift, not a deal.
  // (and if it's their last set, they win on the spot: never).
  if (giveSet && finishes(ctx, q, giveSet.color).win) return -WIN;
  const theirs = openSet(q, giveSet?.color);
  if (theirs && theirs.cards.length + 1 >= R.setSize(giveSet.color)) gain -= 15;
  return gain - loss;
}

function dealBreaker(ctx, m) {
  const { state, me } = ctx;
  const q = R.player(state, m.target);
  const s = R.findSet(q, m.set);
  const fresh = !hasComplete(me, s.color);
  if (fresh && ctx.done + 1 >= ctx.goal) return WIN;
  let v = 20 + (fresh ? 12 : 0) + (s.house ? 3 : 0) + (s.hotel ? 4 : 0) + s.cards.length;
  if (q === ctx.leader) v += 4;
  return v;
}

/** Answering an attack (or their No to ours) with a Just Say No. */
function justSayNo(ctx, m) {
  const { state, me } = ctx;
  const pd = state.pending;
  const jsnLeft = me.hand.filter((c) => R.def(state, c).action === "just-say-no").length;
  const spare = jsnLeft > 1 ? 2 : 0;

  // We're the attacker and they said no: is our card worth defending?
  if (m.for && pd.by === me.id) {
    if (pd.kind === "dealBreaker") return 40;
    if (pd.kind === "sly" || pd.kind === "forced") return 6 + spare;
    return pd.amount >= 5 ? 6 + spare : 1 + spare;
  }

  // Someone is coming for us.
  switch (pd.kind) {
    case "dealBreaker": return 50;
    case "sly": case "forced": {
      const s = setOf(me, pd.take);
      const need = s ? R.setSize(s.color) - s.cards.length : 9;
      return (need <= 1 ? 12 : 3) + R.value(state, pd.take) * 0.6 + spare;
    }
    case "pay": {
      const bank = bankOf(state, me);
      const hurts = pd.amount > bank; // would cost properties
      return (pd.amount >= 5 ? 9 : pd.amount >= 3 ? 4 : 1) + (hurts ? 6 : 0) + spare;
    }
    default: return 3;
  }
}

// ------------------------------------------------------------------ paying and discarding

/** Money first (the rules insist), then the properties we'll miss least. */
export function paymentChoice(state, me, amount) {
  const auto = R.autoPayment(state, me, amount);
  const bankTotal = bankOf(state, me);
  if (bankTotal >= amount) return auto; // the engine already finds the tightest bank-only payment
  const out = [...me.bank];
  let total = bankTotal;
  const keep = (c) => {
    const s = setOf(me, c);
    if (!s) return 2; // a building: the house/hotel goes with a finished set
    if (R.isComplete(s)) return 100 + s.cards.length;
    return (s.cards.length / R.setSize(s.color)) * 10;
  };
  const rest = R.payable(state, me).filter((c) => !me.bank.includes(c))
    .sort((a, b) => keep(a) - keep(b) || R.value(state, a) - R.value(state, b));
  for (const c of rest) {
    if (total >= amount) break;
    out.push(c);
    total += R.value(state, c);
  }
  return out;
}

/** Throw away what we'll miss least: small money and weak actions before properties and Just Say No. */
export function discardChoice(state, me, n) {
  const keep = (c) => {
    const d = R.def(state, c);
    if (d.action === "just-say-no") return 100;
    if (d.action === "deal-breaker") return 90;
    if (d.type === "property" || d.type === "wild") return 50 + progress(me, d.color || d.colors[0]) * 20;
    if (d.action === "sly-deal" || d.action === "forced-deal") return 40;
    if (d.type === "money") return 10 + d.value;
    return 20 + d.value;
  };
  return [...me.hand].sort((a, b) => keep(a) - keep(b)).slice(0, n);
}
