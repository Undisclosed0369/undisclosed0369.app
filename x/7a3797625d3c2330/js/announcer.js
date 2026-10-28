// The announcer: the play-by-play in the middle of the table, the activity
// sheet, and the sounds, stamps and spotlights that go with each move.

import { COLORS } from "../engine/deck.js";
import { completeColors } from "../engine/rules.js";
import { h, sheet } from "./sheets.js";
import * as play from "./play.js";
import { spotlight } from "./spotlight.js";
import { sound, voice, confetti, shock, stamp, floatAmount, centerOf } from "./fx.js";
import { line } from "./lines.js";
import { narrate } from "./activity.js";
import { S } from "./state.js";
import { $ } from "./util.js";

const nameOf = (pid) => S.view?.players.find((p) => p.id === pid)?.name || "Someone";
const colorName = (k) => (COLORS[k]?.name || "").toLowerCase();
export const announced = new Set();
const seatEl = (pid) => document.querySelector(`[data-opp="${pid}"]`);
const bankEl = (pid) => pid === S.me ? $("my-bank") : seatEl(pid)?.querySelector(".obank") || seatEl(pid);

// The play-by-play in the middle of the table: a short line for every move,
// told from your side ("Rita paid you 3M rent"), the last few kept on screen.
// Lines from one update arrive a beat apart, so each can be read.
const FEED_KEEP = 3;
const feedQueue = [];
let feedTimer = 0;

// Everything said this game, for the full activity sheet.
const activity = [];

export function announce(text) {
  if (!text) return;
  activity.push({ text, at: Date.now() });
  if (activity.length > 300) activity.shift();
  feedQueue.push(text);
  if (!feedTimer) feedNext();
}

function feedNext() {
  const text = feedQueue.shift();
  if (!text) { feedTimer = 0; return; }
  const box = $("announce");
  box.append(h("li", { class: "announce__line is-new" }, text));
  const lines = [...box.children].filter((li) => !li.classList.contains("is-gone"));
  for (const li of lines.slice(0, Math.max(0, lines.length - FEED_KEEP))) {
    li.classList.add("is-gone");
    setTimeout(() => li.remove(), 400);
  }
  feedTimer = setTimeout(feedNext, feedQueue.length > 4 ? 220 : 520);
}

export function clearFeed() {
  activity.length = 0;
  feedQueue.length = 0;
  clearTimeout(feedTimer);
  feedTimer = 0;
  $("announce").replaceChildren();
}

/** Tap the play-by-play: everything that's happened this game, newest first. */
function showActivity() {
  if (!activity.length) return;
  const time = (at) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const mine = /\b(you|your|You|Your)\b/;
  sheet({ key: "activity", title: "Activity", sub: "This game, newest first. Lines about you are highlighted.",
    body: h("ol", { class: "activity" }, ...activity.slice().reverse().map((a, i) =>
      h("li", { class: "activity__row" + (mine.test(a.text) ? " is-you" : ""), style: { animationDelay: Math.min(i, 12) * 25 + "ms" } },
        h("time", {}, time(a.at)), h("span", {}, a.text)))) });
}
$("announce").addEventListener("click", showActivity);

// Names from your side of the table: "You" to start a sentence, "you" after.
const Who = (pid) => pid === S.me ? "You" : nameOf(pid);
const who = (pid) => pid === S.me ? "you" : nameOf(pid);

const SPOT = {
  "deal-breaker": { title: "Deal Breaker!", glow: "rgba(224, 66, 245, .75)", ms: 2100 },
  "sly-deal": { title: "Sly Deal", glow: "rgba(66, 161, 245, .7)" },
  "forced-deal": { title: "Forced Deal", glow: "rgba(66, 224, 245, .65)" },
  "debt-collector": { title: "Debt Collector", glow: "rgba(255, 207, 107, .7)" },
  birthday: { title: "It's my birthday!", glow: "rgba(255, 90, 138, .7)" },
  rent: { title: "Rent's due", glow: "rgba(255, 207, 107, .75)" },
  "pass-go": { title: "Pass Go", glow: "rgba(47, 191, 113, .65)", ms: 1200 },
  house: { title: "A house!", glow: "rgba(47, 191, 113, .65)", ms: 1300 },
  hotel: { title: "A hotel!", glow: "rgba(255, 90, 95, .65)", ms: 1300 },
};

export function effects(events) {
  const center = [innerWidth / 2, innerHeight * 0.45];
  const lines = [];
  const say = (text) => { if (text) lines.push(text); };
  const ctx = { me: S.me, view: S.view, name: nameOf, events };
  for (const e of events) {
    // First the plain facts, naming every card, from your side of the table.
    say(narrate(e, ctx));
    // Then the sound, the motion and (for the big moments) the joke.
    switch (e.t) {
      case "draw": if (e.p === S.me) sound("draw"); break;
      case "property": sound("place"); break;
      case "bank": sound("bank"); floatAmount(bankEl(e.p), play.DEF[e.def]?.value); break;
      case "action": {
        const t = e.targets?.length === 1 ? who(e.targets[0]) : "everyone";
        const vars = { p: Who(e.p), t, n: e.amount, c: colorName(e.color) };
        let joke = null;
        if (e.action === "deal-breaker") { stamp("DEAL BREAKER!"); sound("dealBreaker"); voice("dealBreaker", { at: 0.7 }); shock(...center, "#e042f5"); joke = line("deal-breaker", vars); }
        else if (e.action === "birthday") { confetti({ count: 70, spread: 0.8 }); sound("birthday"); voice("birthday", { at: 0.4 }); joke = line("birthday", vars); }
        else if (e.action === "rent") {
          if (e.doubles?.length) { stamp(e.doubles.length > 1 ? "RENT ×4!" : "DOUBLE RENT!", "#ffcf6b", "#f5a142"); sound("doubleRent"); voice("doubleRent", { at: 0.5 }); joke = line("double-rent", vars); }
          else { sound("rent"); voice("rent", { at: 0.4 }); joke = line(e.targets.length === 1 ? "rent-one" : "rent", vars); }
        } else if (e.action === "debt-collector") { sound("rent"); voice("debt", { at: 0.4 }); joke = line("debt-collector", vars); }
        else if (e.action === "pass-go") { sound("draw"); joke = line("pass-go", vars); }
        else if (e.action === "house" || e.action === "hotel") { sound("complete"); joke = line(e.action, { ...vars, c: colorName(setColor(e.p, e.set)) }); }
        else if (e.action === "sly-deal") { sound("sly"); voice("sly", { at: 0.3 }); joke = narrate(e, ctx); }
        else if (e.action === "forced-deal") { sound("forced"); voice("forced", { at: 0.3 }); joke = narrate(e, ctx); }
        // Someone else's action is held up in the middle of the table for a
        // moment, so everyone sees what was played before anyone has to answer.
        if (e.p !== S.me && SPOT[e.action]) {
          const s = SPOT[e.action];
          const atMe = e.targets?.includes(S.me);
          spotlight({ def: e.def, title: `${nameOf(e.p)}: ${s.title}`, sub: joke, from: seatEl(e.p), glow: s.glow, ms: (s.ms || 1600) + (atMe ? 400 : 0) });
        }
        break;
      }
      case "justSayNo": {
        stamp("NO!", "#ff5a5f", "#ff8a3d");
        sound("jsn");
        voice("jsn", { at: 0.35 });
        shock(...center, "#ff5a5f");
        const no = line(e.n > 1 ? "no-to-no" : "just-say-no", { p: Who(e.p), t: who(e.against) });
        if (e.p !== S.me) spotlight({ def: "action-just-say-no", title: `${nameOf(e.p)}: Just Say No!`, sub: no, from: seatEl(e.p), glow: "rgba(255, 69, 58, .75)", ms: 1700 });
        break;
      }
      // The cards actually changing hands (the action itself had its sound).
      case "steal": case "swap": sound("move"); break;
      case "reshuffle": sound("reshuffle"); break;
      case "pay": {
        if (e.from === S.me) sound("pay");
        else if (e.to === S.me) sound("paid");
        else sound("coin");
        if (e.to === S.me) { $("my-bank").classList.remove("is-bump"); void $("my-bank").offsetWidth; $("my-bank").classList.add("is-bump"); }
        if (e.amount) {
          floatAmount(bankEl(e.to), e.amount);
          floatAmount(bankEl(e.from), e.amount, true);
        }
        break;
      }
      case "setComplete": {
        const el = document.querySelector(`[data-set="${e.set}"]`);
        if (e.p === S.me) {
          const [x, y] = el ? centerOf(el) : center;
          confetti({ x, y, count: 60, spread: 0.6 });
        }
        sound("complete");
        el?.classList.add("is-new");
        break;
      }
      case "timeout":
        // Your own clock ran out: a robot steps in for this one.
        if (e.p === S.me) { sound("timeout"); voice("timeout", { at: 0.5 }); }
        say(line(S.view.phase === "respond" ? "timeout-respond" : "timeout", { p: Who(e.p) }));
        break;
      case "drawLost": sound("skipped"); break;
      case "skippedDraw": sound("skipped"); say(line("skipped-draw", { p: Who(e.p), n: e.n })); break;
    }
  }
  // Someone one set away from winning gets called out, once per new set.
  for (const p of S.view.players) {
    const n = completeColors(p).length;
    const key = p.id + ":" + n;
    if (n === S.view.options.winSets - 1 && !announced.has(key)) { announced.add(key); say(line("one-away", { p: Who(p.id) })); voice("oneAway", { at: 1.2 }); }
  }
  for (const l of lines) announce(l);
}

function setColor(pid, setId) {
  return S.view.players.find((p) => p.id === pid)?.sets.find((s) => s.id === setId)?.color;
}
