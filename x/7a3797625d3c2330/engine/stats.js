// Player statistics (Phase 6B): counting one game as it's played, turning
// that into a record per player when it ends, and adding records into a
// profile. Shared by the server (which records) and the screens (6C).
//
// Only a player's own moves count: the server says, for every batch of
// events, whose seat is being played by its human. Anything an AI does in
// someone's seat isn't credited to them.
//
// Profile stats are generic, so other games plug in later:
//   { overall: { games, wins, dnf, ms, byGame: { dealbreaker: n } },
//     dealbreaker: { games, wins, dnf, ms, positions: [1st, 2nd, …], streak, bestStreak,
//                    actions: { "deal-breaker": n, … }, rentCollected, rentPaid, maxRent,
//                    collected, paid, banked, sets, colors: { red: n }, stoleFrom: { name: n },
//                    stolenBy: { name: n }, recent: [ … last 20 games ] } }
// Numbers add up, maps add up key by key, and keys starting with "max" keep
// the biggest.

import { value } from "./rules.js";

export const GAME = "dealbreaker";
const RECENT = 20;

/** What one player did in one game so far. */
export function blankTally() {
  return { actions: {}, rentCollected: 0, rentPaid: 0, maxRent: 0, collected: 0, paid: 0, banked: 0, sets: 0, colors: {}, stoleFrom: {}, stolenBy: {} };
}

const bump = (map, key, n = 1) => { map[key] = (map[key] || 0) + n; };

/**
 * Count a batch of events. tallies: { [playerId]: tally } for the players
 * being tracked (humans); counts(id): is that seat being played by its own
 * human right now? names: { [playerId]: name } (kept, since a kicked player
 * leaves the game state).
 */
export function tallyEvents(tallies, state, events, counts, names) {
  const mine = (id) => tallies[id] && counts(id) ? tallies[id] : null;
  const name = (id) => names[id] || state.players.find((p) => p.id === id)?.name || "Someone";
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    switch (e.t) {
      case "action": {
        const t = mine(e.p);
        if (!t) break;
        bump(t.actions, e.action);
        if (e.action === "rent") {
          if (e.doubles?.length) bump(t.actions, "double-the-rent", e.doubles.length);
          t.openRent = 0; // what this one rent card brings in, from everyone it charges
        }
        break;
      }
      case "justSayNo": { const t = mine(e.p); if (t) bump(t.actions, "just-say-no"); break; }
      case "bank": { const t = mine(e.p); if (t) t.banked += value(state, e.card); break; }
      case "pay": {
        const payer = mine(e.from), payee = mine(e.to);
        if (payer) { payer.paid += e.amount; if (e.reason === "rent") payer.rentPaid += e.amount; }
        if (payee) {
          payee.collected += e.amount;
          if (e.reason === "rent") {
            payee.rentCollected += e.amount;
            payee.openRent = (payee.openRent || 0) + e.amount;
            payee.maxRent = Math.max(payee.maxRent, payee.openRent);
          }
        }
        break;
      }
      case "setComplete": {
        // A set taken whole with a Deal Breaker wasn't built here.
        const prev = events[i - 1];
        if (prev && prev.t === "steal" && prev.kind === "deal-breaker" && prev.to === e.p) break;
        const t = mine(e.p);
        if (t) { t.sets++; bump(t.colors, e.color); }
        break;
      }
      case "steal": case "swap": {
        const thief = e.t === "swap" ? e.a : e.to, victim = e.t === "swap" ? e.b : e.from;
        const t = mine(thief), v = mine(victim);
        if (t) bump(t.stoleFrom, name(victim));
        if (v) bump(v.stolenBy, name(thief));
        break;
      }
    }
  }
}

/** One finished game for one player, ready to add into their profile. */
export function gameRecord(tally, { position, players, won, dnf, ms, at }) {
  const { openRent, ...counted } = tally;
  void openRent;
  return { ...counted, position, players, won, dnf, ms, at };
}

/** Add numbers and maps of numbers into a running total ("max…" keys keep the biggest). */
function addInto(total, add) {
  for (const [k, v] of Object.entries(add)) {
    if (typeof v === "number") total[k] = k.startsWith("max") ? Math.max(total[k] || 0, v) : (total[k] || 0) + v;
    else if (v && typeof v === "object" && !Array.isArray(v)) addInto(total[k] || (total[k] = {}), v);
  }
  return total;
}

/** A profile's stats with one more game in them (returns a new object). */
export function addGame(stats, game, r) {
  const s = structuredClone(stats || {});
  const o = s.overall || (s.overall = { games: 0, wins: 0, dnf: 0, ms: 0, byGame: {} });
  o.games++;
  if (r.won) o.wins++;
  if (r.dnf) o.dnf++;
  o.ms += r.ms || 0;
  bump(o.byGame, game);

  const g = s[game] || (s[game] = { games: 0, wins: 0, dnf: 0, ms: 0, positions: [], streak: 0, bestStreak: 0, recent: [] });
  g.games++;
  if (r.won) g.wins++;
  if (r.dnf) g.dnf++;
  g.ms += r.ms || 0;
  if (!r.dnf && r.position) g.positions[r.position - 1] = (g.positions[r.position - 1] || 0) + 1;
  for (let i = 0; i < g.positions.length; i++) g.positions[i] ||= 0;
  g.streak = r.won ? g.streak + 1 : 0;
  g.bestStreak = Math.max(g.bestStreak, g.streak);
  const { position, players, won, dnf, ms, at, ...counted } = r;
  addInto(g, counted);
  g.recent = [{ at, position, players, won, dnf, ms }, ...g.recent].slice(0, RECENT);
  return s;
}

/** The fun extras, worked out when shown: the most of a map ({ name: n }) or null. */
export function top(map) {
  let best = null;
  for (const [k, n] of Object.entries(map || {})) if (!best || n > best[1]) best = [k, n];
  return best ? { key: best[0], n: best[1] } : null;
}
