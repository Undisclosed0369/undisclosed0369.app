// Every event in many random games gets a sensible line from the play-by-play
// narrator, from every player's side of the table.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../../x/7a3797625d3c2330/engine/rules.js";
import { narrate } from "../../x/7a3797625d3c2330/js/activity.js";

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rand() * a.length)];

test("the narrator names every card and never says undefined", () => {
  const seen = {};
  const samples = {};
  for (let g = 0; g < 60; g++) {
    const players = ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase() + "ee" }));
    const s = R.createGame({ players, winSets: 3, seed: g + 1 });
    for (let n = 0; n < 1500 && s.phase !== "over"; n++) {
      const waiting = R.awaiting(s);
      const who = waiting[0].id;
      let moves = R.legalMoves(s, who).filter((m) => m.type !== "discard");
      const busy = moves.filter((m) => m.type !== "endTurn" && m.type !== "move");
      if (busy.length && rand() < 0.85) moves = busy;
      for (const id of Object.keys(s.discards)) narrateAll(R.act(s, id, R.legalMoves(s, id).find((m) => m.type === "discard")));
      if (!moves.length) { narrateAll(R.timeout(s)); continue; }
      narrateAll(R.act(s, who, pick(moves)));
    }
    function narrateAll(events) {
      for (const me of ["a", "c"]) {
        const view = R.view(s, me);
        const name = (pid) => players.find((p) => p.id === pid).name;
        for (const e of events) {
          const text = narrate(e, { me, view, name, events });
          if (!text) continue;
          assert.doesNotMatch(text, /undefined|null|NaN|\ba card\b|  /, `${e.t}: ${text}`);
          seen[e.t] = (seen[e.t] || 0) + 1;
          const k = e.t === "action" ? "action:" + e.action : e.t;
          if (!samples[k]) samples[k] = text;
        }
      }
    }
  }
  for (const t of ["steal", "swap", "pay", "justSayNo", "setComplete", "property", "bank"]) assert.ok(seen[t], `never saw ${t}`);
  console.log(Object.entries(samples).map(([k, v]) => `${k.padEnd(22)} ${v}`).join("\n"));
});
