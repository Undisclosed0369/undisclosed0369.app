// Plays many full games with random moves to shake out rule bugs.
//
//   node _dealbreaker/tests/simulate.mjs [games=1000]
//
// Every game checks after every action that no card was lost or duplicated
// and that somebody can always move. Prints a summary; exits 1 on any bug.

import * as R from "../../x/7a3797625d3c2330/engine/rules.js";

const GAMES = Number(process.argv[2] || 1000);
const MAX_TURNS = 400;

let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const pick = (list) => list[Math.floor(rand() * list.length)];

function check(s) {
  const all = [...s.deck, ...s.discard];
  for (const p of s.players) {
    all.push(...p.hand, ...p.bank);
    for (const st of p.sets) {
      all.push(...st.cards);
      if (st.house) all.push(st.house);
      if (st.hotel) all.push(st.hotel);
      if (st.cards.length > R.setSize(st.color)) throw new Error("overfull set");
      if (!st.cards.length) throw new Error("empty set left behind");
      if ((st.house || st.hotel) && !R.isComplete(st)) throw new Error("building on incomplete set");
      if (st.hotel && !st.house) throw new Error("hotel without house");
    }
  }
  if (all.length !== 106) throw new Error(`card count ${all.length}`);
  if (new Set(all).size !== 106) throw new Error("duplicate card");
}

const stats = { finished: 0, stalled: 0, bugs: 0, actions: 0, turns: 0, timeouts: 0, jsn: 0, events: {} };

for (let g = 0; g < GAMES; g++) {
  const n = 2 + Math.floor(rand() * 4);
  const players = Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "P" + i }));
  const winSets = 3 + Math.floor(rand() * 4);
  const s = R.createGame({ players, winSets, seed: g + 1 });
  try {
    check(s);
    while (s.phase !== "over" && s.turn.number <= MAX_TURNS) {
      // Owed discards are sometimes paid at once, sometimes left to time out.
      for (const id of Object.keys(s.discards)) {
        if (rand() < 0.5) R.act(s, id, pick(R.legalMoves(s, id).filter((m) => m.type === "discard")));
      }
      const waiting = R.awaiting(s);
      if (!waiting.length) throw new Error("nobody can move");
      if (rand() < 0.02) { R.timeout(s); stats.timeouts++; check(s); continue; }
      const who = pick(waiting).id;
      let moves = R.legalMoves(s, who).filter((m) => m.type !== "discard");
      if (!moves.length) throw new Error(`${who} is awaited but has no moves`);
      // Random play that still tries things: end the turn only now and then.
      const busy = moves.filter((m) => m.type !== "endTurn");
      if (busy.length && rand() < 0.85) moves = busy;
      const m = pick(moves);
      for (const e of R.act(s, who, m)) stats.events[e.t] = (stats.events[e.t] || 0) + 1;
      stats.actions++;
      check(s);
    }
    stats.turns += s.turn.number;
    if (s.phase === "over") {
      stats.finished++;
      if (!R.hasWon(s, R.player(s, s.winner))) throw new Error("winner without the sets");
    } else stats.stalled++;
  } catch (e) {
    stats.bugs++;
    console.error(`game ${g} (seed ${g + 1}, ${n} players, ${winSets} sets): ${e.stack}`);
    if (stats.bugs > 5) break;
  }
}

console.log(`${GAMES} games: ${stats.finished} won, ${stats.stalled} hit ${MAX_TURNS} turns, ${stats.bugs} bugs`);
console.log(`${stats.actions} actions, ${stats.timeouts} timeouts, avg ${Math.round(stats.turns / GAMES)} turns/game`);
console.log("events:", Object.entries(stats.events).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "));
process.exit(stats.bugs ? 1 : 0);
