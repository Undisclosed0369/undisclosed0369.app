// AI-only games: bots play each other start to finish, the way the server
// runs them. Checks every bot move is legal, no game gets stuck, and that
// Normal beats Easy. Prints a summary; exits 1 on any bug.
//
//   node _dealbreaker/tests/ai-sim.mjs [games=1000]

import * as R from "../../x/7a3797625d3c2330/engine/rules.js";
import { chooseMove } from "../../x/7a3797625d3c2330/engine/bot.js";

const GAMES = Number(process.argv[2] || 1000);
const MAX_ACTIONS = 4000;
let seed = 99;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);

const stats = { won: 0, stuck: 0, bugs: 0, turns: 0, decisions: 0, ms: 0, slowest: 0,
  wins: { normal: 0, easy: 0 }, seats: { normal: 0, easy: 0 }, events: {} };

for (let g = 0; g < GAMES; g++) {
  const n = 2 + Math.floor(rand() * 4);
  // Every game mixes the two levels, so Normal and Easy meet head to head.
  const levels = Array.from({ length: n }, (_, i) => (i % 2 === g % 2 ? "normal" : "easy"));
  const players = levels.map((_, i) => ({ id: "p" + i, name: "P" + i }));
  for (const l of levels) stats.seats[l]++;
  const s = R.createGame({ players, winSets: 3 + Math.floor(rand() * 2), seed: g + 1 });
  const level = (id) => levels[Number(id.slice(1))];
  try {
    let actions = 0;
    while (s.phase !== "over") {
      if (++actions > MAX_ACTIONS) { stats.stuck++; break; }
      // Discards owed from a past turn are settled first, as the server's timer would.
      const owing = Object.keys(s.discards).find((id) => R.active(s).id !== id || s.phase !== "play");
      const who = owing || R.awaiting(s)[0]?.id;
      if (!who) throw new Error("nobody can move");
      const t0 = performance.now();
      const m = chooseMove(s, who, level(who));
      const dt = performance.now() - t0;
      stats.decisions++; stats.ms += dt; stats.slowest = Math.max(stats.slowest, dt);
      if (!m) throw new Error(`${who} had no move`);
      for (const e of R.act(s, who, m)) stats.events[e.t] = (stats.events[e.t] || 0) + 1;
    }
    if (s.phase === "over") {
      stats.won++;
      stats.turns += s.turn.number;
      stats.wins[level(s.winner)]++;
    }
  } catch (e) {
    stats.bugs++;
    console.error(`game ${g} (seed ${g + 1}, ${n} players): ${e.stack}`);
    if (stats.bugs > 5) break;
  }
}

const rate = (l) => ((stats.wins[l] / stats.seats[l]) * 100).toFixed(1);
console.log(`${GAMES} AI games: ${stats.won} won, ${stats.stuck} stuck, ${stats.bugs} bugs, avg ${Math.round(stats.turns / Math.max(1, stats.won))} turns`);
console.log(`win rate per seat: normal ${rate("normal")}%, easy ${rate("easy")}%  (${stats.wins.normal} vs ${stats.wins.easy} wins)`);
console.log(`thinking: ${(stats.ms / stats.decisions).toFixed(2)} ms per move on average, slowest ${stats.slowest.toFixed(1)} ms`);
console.log("events:", Object.entries(stats.events).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "));
if (stats.bugs || stats.stuck) process.exit(1);
