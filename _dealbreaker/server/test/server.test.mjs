// End-to-end test of the game server, through real WebSockets.
//
// Start a test server first, with clocks fast-forwarded 100x and its own
// storage, so test players never land in (or touch) your local profiles:
//   npm run test:server
// then: npm test

import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.SERVER || "http://127.0.0.1:8788";
const LEADER = "DEAL BREAKER_undisclosed"; // spaces and case don't matter
const room = () => "T" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 8).toUpperCase();

const post = (path, body) => fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));

/** A test player: a socket plus every message it has received. */
class Client {
  constructor(code) {
    this.msgs = [];
    this.waiters = [];
    this.ws = new WebSocket(BASE.replace("http", "ws") + `/api/rooms/${code}/ws`);
    this.open = new Promise((ok, bad) => { this.ws.onopen = ok; this.ws.onerror = bad; });
    this.closed = new Promise((ok) => { this.ws.onclose = ok; });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      this.msgs.push(m);
      if (m.t === "state") this.view = m.view;
      if (m.t === "room") this.room = m.room;
      if (m.t === "welcome") { this.id = m.you; this.token = m.token; }
      for (const w of [...this.waiters]) if (w.test(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.ok(m); }
    };
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  /** Resolve with the first message (already received or future) matching. */
  wait(test, ms = 8000, { fresh = false } = {}) {
    const seen = !fresh && this.msgs.find(test);
    if (seen) return Promise.resolve(seen);
    return new Promise((ok, bad) => {
      // The timer is cleared once the message comes, so it never holds the test run open.
      const w = { test, ok: (m) => { clearTimeout(timer); ok(m); } };
      const timer = setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); bad(new Error("timed out waiting")); }, ms);
      this.waiters.push(w);
    });
  }
  next(test, ms) { return this.wait(test, ms, { fresh: true }); }
  async hello(m) { await this.open; this.send({ t: "hello", ...m }); return this.next((x) => ["welcome", "error", "waiting", "bye"].includes(x.t)); }
  close() { this.ws.close(); return Promise.resolve(); }
}

async function newRoom(name = "Boss") {
  const code = room();
  const r = await post("/api/rooms", { leaderCode: LEADER, room: code, name });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const leader = new Client(code);
  const w = await leader.hello({ token: r.body.token });
  assert.equal(w.t, "welcome");
  assert.equal(w.leader, true);
  return { code, leader };
}

/** Play like a lazy human: end turns, accept, pay with everything, discard the first cards. */
function autopilot(c) {
  const step = () => {
    const v = c.view;
    if (!v || v.phase === "over") return;
    if (v.discards[c.id]) c.send({ t: "act", action: { type: "discard", cards: v.players.find((p) => p.id === c.id).hand.slice(0, v.discards[c.id]) } });
    const mine = v.awaiting.filter((a) => a.id === c.id);
    for (const a of mine) {
      if (a.step === "play") c.send({ t: "act", action: { type: "endTurn" } });
      else if (a.step === "pay") {
        const me = v.players.find((p) => p.id === c.id);
        const cards = [...me.bank, ...me.sets.flatMap((s) => [...s.cards.filter((x) => v.cards[x] !== "wild-any"), s.house, s.hotel].filter(Boolean))];
        c.send({ t: "act", action: { type: "pay", cards } });
      } else c.send({ t: "act", action: { type: "accept", for: a.for } });
    }
  };
  const orig = c.ws.onmessage;
  c.ws.onmessage = (e) => { orig(e); if (JSON.parse(e.data).t === "state") step(); };
}

// ------------------------------------------------------------------ rooms

test("only the leader code opens rooms, and room codes are checked", async () => {
  let r = await post("/api/rooms", { leaderCode: "NOPE", room: "ABCDEF", name: "Boss" });
  assert.equal(r.status, 403);
  r = await post("/api/rooms", { leaderCode: LEADER, room: "AB1", name: "Boss" });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /calculator/);
  const code = room();
  r = await post("/api/rooms", { leaderCode: LEADER, room: code.toLowerCase(), name: "Boss" });
  assert.equal(r.status, 200);
  // Reopening a room nobody is in starts it fresh…
  const again = await post("/api/rooms", { leaderCode: LEADER, room: code, name: "Boss" });
  assert.equal(again.status, 200);
  assert.equal(again.body.resumed, undefined);
  assert.notEqual(again.body.token, r.body.token);
  // …but with friends waiting in it, the leader just walks back in.
  const pal = new Client(code);
  assert.equal((await pal.hello({ name: "Pal" })).t, "welcome");
  const third = await post("/api/rooms", { leaderCode: LEADER, room: code, name: "Boss" });
  assert.equal(third.body.resumed, true);
  assert.equal(third.body.token, again.body.token);
  const info = await (await fetch(BASE + "/api/rooms/" + code)).json();
  assert.deepEqual(info, { exists: true, status: "lobby", players: 2, mode: "players" });
  await pal.close();
  assert.equal((await (await fetch(BASE + "/api/rooms/NOSUCHROOM")).json()).exists, false);
});

test("names: letters only, unique, and the room fills at five", async () => {
  const { code, leader } = await newRoom();
  const bad = new Client(code);
  assert.match((await bad.hello({ name: "R2D2" })).message, /license plate/);
  assert.match((await bad.hello({ name: "Hi!" })).message, /Letters only/);
  assert.match((await bad.hello({ name: "boss" })).message, /already took that name/);
  const ok = await bad.hello({ name: "José María" });
  assert.equal(ok.t, "welcome");
  const extra = [];
  for (const n of ["Ann", "Ben", "Cat"]) { const c = new Client(code); assert.equal((await c.hello({ name: n })).t, "welcome"); extra.push(c); }
  const sixth = new Client(code);
  assert.match((await sixth.hello({ name: "Dee" })).message, /fire hazard/);
  for (const c of [leader, bad, sixth, ...extra]) await c.close();
});

test("settings are the leader's, and checked", async () => {
  const { code, leader } = await newRoom();
  const p = new Client(code);
  await p.hello({ name: "Pat" });
  p.send({ t: "settings", winSets: 4 });
  assert.match((await p.next((m) => m.t === "error")).message, /Only the leader/);
  leader.send({ t: "settings", turnSeconds: 70 });
  assert.match((await leader.next((m) => m.t === "error")).message, /steps of 15/);
  leader.send({ t: "settings", drawFirst: "yes" });
  assert.match((await leader.next((m) => m.t === "error")).message, /On or off/);
  leader.send({ t: "settings", turnSeconds: 75, winSets: 6, mode: "mixed", aiSeats: 2, aiLevel: "easy", drawFirst: false });
  const r = await p.next((m) => m.t === "room" && m.room.settings.turnSeconds === 75);
  assert.deepEqual(r.room.settings, { mode: "mixed", aiSeats: 2, aiLevel: "easy", winSets: 6, turnSeconds: 75, drawFirst: false });
  await leader.close(); await p.close();
});

test("chat reaches everyone, is rate limited, and the leader can mute", async () => {
  const { code, leader } = await newRoom();
  const p = new Client(code);
  await p.hello({ name: "Pat" });
  p.send({ t: "chat", text: "  hello   there  " });
  assert.equal((await leader.next((m) => m.t === "chat" && !m.msg.system)).msg.text, "hello there");
  p.send({ t: "chat", text: "again" });
  assert.match((await p.next((m) => m.t === "error")).message, /One message a second/);
  leader.send({ t: "mute", player: p.id, muted: true });
  await p.next((m) => m.t === "muted");
  await new Promise((r) => setTimeout(r, 1100));
  p.send({ t: "react", r: "🔥" });
  assert.match((await p.next((m) => m.t === "error")).message, /muted/);
  await leader.close(); await p.close();
});

test("only the leader can clear the chat, and everyone sees it wiped", async () => {
  const { code, leader } = await newRoom();
  const p = new Client(code);
  await p.hello({ name: "Pat" });
  p.send({ t: "chat", text: "something regrettable" });
  await leader.next((m) => m.t === "chat" && !m.msg.system);
  p.send({ t: "clearChat" });
  assert.match((await p.next((m) => m.t === "error")).message, /Only the leader/);
  leader.send({ t: "clearChat" });
  const [a, b] = await Promise.all([leader.next((m) => m.t === "chatLog"), p.next((m) => m.t === "chatLog")]);
  for (const log of [a, b]) {
    assert.equal(log.cleared, true);
    assert.equal(log.msgs.length, 1);
    assert.equal(log.msgs[0].system, true);
  }
  // A newcomer only gets the clean slate.
  const q = new Client(code);
  await q.hello({ name: "Quinn" });
  const fresh = await q.wait((m) => m.t === "chatLog");
  assert.ok(!fresh.msgs.some((m) => m.text === "something regrettable"));
  await leader.close(); await p.close(); await q.close();
});

// ------------------------------------------------------------------ playing

test("a full game: each player sees only their own hand, AI seats play, someone wins", async () => {
  const { code, leader } = await newRoom();
  const a = new Client(code), b = new Client(code);
  await a.hello({ name: "Ann" }); await b.hello({ name: "Ben" });
  leader.send({ t: "settings", mode: "mixed", aiSeats: 2 });
  await leader.next((m) => m.t === "room" && m.room.settings.aiSeats === 2);
  for (const c of [leader, a, b]) autopilot(c);
  leader.send({ t: "start" });
  const s = await a.wait((m) => m.t === "state" && m.view);
  assert.equal(s.view.players.length, 5);
  for (const p of s.view.players) assert.equal(typeof p.hand, p.id === a.id ? "object" : "number");
  const over = await leader.wait((m) => m.t === "room" && m.room.status === "over", 60000);
  assert.ok(over.room.results.winner);
  assert.equal(over.room.results.standings.length, 5);
  assert.ok(leader.msgs.some((m) => m.t === "chat" && /WINS!/.test(m.msg.text)));

  // Rematch: same people, fresh AI players, a new deal.
  b.send({ t: "rematch" });
  assert.match((await b.next((m) => m.t === "error")).message, /Only the leader/);
  leader.send({ t: "rematch" });
  const again = await a.next((m) => m.t === "room" && m.room.status === "playing");
  assert.equal(again.room.players.length, 5);
  for (const c of [leader, a, b]) await c.close();
});

test("dropping out: the AI takes the seat, and coming back needs the leader's yes", async () => {
  const { code, leader } = await newRoom();
  const c = new Client(code);
  await c.hello({ name: "Cat" });
  leader.send({ t: "settings", mode: "mixed", aiSeats: 1, winSets: 6 });
  autopilot(leader);
  leader.send({ t: "start" });
  await c.wait((m) => m.t === "state" && m.view);
  const tok = c.token;
  await c.close();
  await leader.wait((m) => m.t === "room" && m.room.players.some((p) => p.name === "Cat" && p.takeover === "disconnect"), 8000);

  const back = new Client(code);
  const w = await back.hello({ token: tok });
  assert.equal(w.t, "waiting");
  const ask = await leader.wait((m) => m.t === "rejoinRequest");
  assert.equal(ask.name, "Cat");
  leader.send({ t: "rejoin", request: ask.request, allow: true });
  await back.wait((m) => m.t === "welcome");
  const r = await leader.wait((m) => m.t === "room" && m.room.players.some((p) => p.name === "Cat" && !p.takeover));
  assert.ok(r);
  for (const x of [leader, back]) await x.close();
});

test("a refused rejoin is told so", async () => {
  const { code, leader } = await newRoom();
  const c = new Client(code);
  await c.hello({ name: "Cat" });
  leader.send({ t: "settings", mode: "mixed", aiSeats: 1, winSets: 6 });
  autopilot(leader);
  leader.send({ t: "start" });
  await c.wait((m) => m.t === "state" && m.view);
  await c.close();
  await leader.wait((m) => m.t === "room" && m.room.players.some((p) => p.name === "Cat" && p.takeover), 8000);
  const back = new Client(code);
  await back.hello({ name: "cat" }); // by name, from a "new device"
  const ask = await leader.wait((m) => m.t === "rejoinRequest");
  leader.send({ t: "rejoin", request: ask.request, allow: false });
  assert.match((await back.wait((m) => m.t === "bye")).reason, /robot keeps the seat/);
  await leader.close();
});

test("three timed-out turns hand the seat to the AI; 'back' takes it back", async () => {
  const { code, leader } = await newRoom();
  const idle = new Client(code);
  await idle.hello({ name: "Ida" });
  leader.send({ t: "settings", mode: "mixed", aiSeats: 1, winSets: 6 });
  autopilot(leader);
  leader.send({ t: "start" });
  await leader.wait((m) => m.t === "room" && m.room.players.some((p) => p.name === "Ida" && p.takeover === "idle"), 30000);
  idle.send({ t: "back" });
  await leader.wait((m) => m.t === "room" && m.room.players.some((p) => p.name === "Ida" && !p.takeover), 8000);
  for (const x of [leader, idle]) await x.close();
});

test("nobody new joins a game in progress; the leader can kick", async () => {
  const { code, leader } = await newRoom();
  const p = new Client(code);
  await p.hello({ name: "Pat" });
  leader.send({ t: "settings", mode: "mixed", aiSeats: 1, winSets: 6 });
  autopilot(leader); autopilot(p);
  leader.send({ t: "start" });
  await p.wait((m) => m.t === "state" && m.view);
  const late = new Client(code);
  assert.match((await late.hello({ name: "Lou" })).message, /started without you/);
  leader.send({ t: "kick", player: p.id });
  assert.match((await p.wait((m) => m.t === "bye")).reason, /removed/);
  // Pat is out of the game itself, not handed to a robot.
  const st = await leader.next((m) => m.t === "state" && m.view && m.view.players.length === 2);
  assert.ok(!st.view.players.some((x) => x.id === p.id));
  // The leader can remove the AI too: last one standing wins.
  const bot = leader.room.players.find((x) => x.bot);
  leader.send({ t: "kick", player: bot.id });
  const over = await leader.next((m) => m.t === "room" && m.room.status === "over");
  assert.equal(over.room.results.winner, leader.id);
  await leader.close(); await late.close();
});

test("the leader leaving a finished or idle room closes it", async () => {
  const { code, leader } = await newRoom();
  const p = new Client(code);
  await p.hello({ name: "Pat" });
  leader.send({ t: "leave" });
  assert.match((await p.wait((m) => m.t === "bye")).reason, /closed the room/);
  assert.equal((await (await fetch(BASE + "/api/rooms/" + code)).json()).exists, false);
});

test("the leader can close the room mid-game, and the code is free again at once", async () => {
  const { code, leader } = await newRoom();
  const p = new Client(code);
  await p.hello({ name: "Pat" });
  leader.send({ t: "start" });
  await p.wait((m) => m.t === "state" && m.view);
  p.send({ t: "closeRoom" });
  assert.match((await p.next((m) => m.t === "error")).message, /Only the leader/);
  leader.send({ t: "closeRoom" });
  assert.match((await p.wait((m) => m.t === "bye")).reason, /closed the room/);
  assert.equal((await (await fetch(BASE + "/api/rooms/" + code)).json()).exists, false);
  const fresh = await post("/api/rooms", { leaderCode: LEADER, room: code, name: "Boss" });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.resumed, undefined);
  const pat = new Client(code);
  assert.equal((await pat.hello({ name: "Pat" })).t, "welcome"); // the old Pat is long gone
  await pat.close();
});

test("in the lobby, a dropped player gets their name (and seat) back", async () => {
  const { code, leader } = await newRoom();
  const p = new Client(code);
  const first = await p.hello({ name: "Pat" });
  await p.close();
  await leader.wait((m) => m.t === "room" && m.room.players.some((x) => x.name === "Pat" && !x.connected), 8000);
  const back = new Client(code);
  const w = await back.hello({ name: "pat" });
  assert.equal(w.t, "welcome");
  assert.equal(w.you, first.you);
  await back.close(); await leader.close();
});

test("the leader can change the timer and the target mid-game, not the seats", async () => {
  const { leader } = await newRoom();
  leader.send({ t: "settings", mode: "mixed", aiSeats: 1, winSets: 6 });
  autopilot(leader);
  leader.send({ t: "start" });
  await leader.wait((m) => m.t === "state" && m.view);
  leader.send({ t: "settings", turnSeconds: 90, winSets: 4 });
  const r = await leader.next((m) => m.t === "room" && m.room.settings.turnSeconds === 90);
  assert.equal(r.room.settings.winSets, 4);
  const st = await leader.next((m) => m.t === "state" && m.view);
  assert.equal(st.view.options.winSets, 4);
  // The running clock changes at once, not from the next turn (times are 100× faster here).
  if (st.clock) assert.ok(st.clock.deadline - st.clock.now <= 950, `clock still at ${st.clock.deadline - st.clock.now} ms`);
  leader.send({ t: "settings", aiSeats: 2 });
  assert.match((await leader.next((m) => m.t === "error")).message, /Seats are set/);
  await leader.close();
});

test("the leader code gets the leader back in, even from a new device", async () => {
  const { code, leader } = await newRoom("Boss");
  await leader.close();
  const again = new Client(code);
  const w = await again.hello({ leaderCode: "dealbreaker_UNDISCLOSED" });
  assert.equal(w.t, "welcome");
  assert.equal(w.leader, true);
  await again.close();
});

// ------------------------------------------------------------------ the player directory (Phase 6)

const someone = () => "Pat " + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 8);

test("locking your name: joining always asks for the PIN", async () => {
  const { code, leader } = await newRoom();
  const name = someone();
  const pat = new Client(code);
  assert.equal((await pat.hello({ name })).t, "welcome");
  pat.send({ t: "lockName", word: "fish" });
  assert.match((await pat.next((m) => m.t === "error")).message, /exactly 4 digits/);
  pat.send({ t: "lockName", word: "4821" });
  const locked = await pat.next((m) => m.t === "nameStatus" && m.changed);
  assert.equal(locked.locked, true);
  assert.ok(locked.pass);
  await pat.close();

  // Another room, another device: the PIN is needed.
  const { code: code2, leader: leader2 } = await newRoom();
  const imp = new Client(code2);
  const ask = await imp.hello({ name });
  assert.equal(ask.code, "needWord");
  const wrong = await imp.hello({ name, word: "1234" });
  assert.equal(wrong.code, "word");
  assert.match(wrong.message, /4 tries left/);
  const right = new Client(code2);
  const w = await right.hello({ name, word: "４８２１" }); // full-width digits count too
  assert.equal(w.t, "welcome");
  // Even the device that set it is asked again when it sits down somewhere new.
  const back = new Client(code);
  assert.equal((await back.hello({ name: name.toUpperCase(), pass: locked.pass })).code, "needWord");
  await leader.close(); await leader2.close(); await imp.close(); await right.close(); await back.close();
});

test("the leader needs their PIN too, but never for a reconnect", async () => {
  const name = someone();
  const { code, leader } = await newRoom(name);
  leader.send({ t: "lockName", word: "9090" });
  await leader.next((m) => m.t === "nameStatus" && m.changed);
  // Opening a room under a locked name asks for the PIN.
  const code2 = room();
  let r = await post("/api/rooms", { leaderCode: LEADER, room: code2, name });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "needWord");
  r = await post("/api/rooms", { leaderCode: LEADER, room: code2, name, word: "1111" });
  assert.equal(r.body.code, "word");
  r = await post("/api/rooms", { leaderCode: LEADER, room: code2, name, word: "9090" });
  assert.equal(r.status, 200);
  // The leader code alone, from a new device: PIN please. With the seat's token: straight in.
  const fresh = new Client(code);
  assert.equal((await fresh.hello({ leaderCode: LEADER })).code, "needWord");
  assert.equal((await fresh.hello({ leaderCode: LEADER, word: "9090" })).t, "welcome");
  const back = new Client(code2);
  assert.equal((await back.hello({ leaderCode: LEADER, token: r.body.token })).t, "welcome");
  await leader.close(); await fresh.close(); await back.close();
});

test("five wrong PINs lock the name for a while", async () => {
  const { code, leader } = await newRoom();
  const name = someone();
  const owner = new Client(code);
  await owner.hello({ name });
  owner.send({ t: "lockName", word: "0007" });
  await owner.next((m) => m.t === "nameStatus" && m.changed);
  await owner.close();
  const guesser = new Client(code);
  for (let i = 0; i < 4; i++) assert.equal((await guesser.hello({ name, word: "1111" })).code, "word");
  const fifth = await guesser.hello({ name, word: "1111" });
  assert.equal(fifth.code, "cooldown");
  // Even the right PIN waits out the cooldown.
  assert.equal((await guesser.hello({ name, word: "0007" })).code, "cooldown");
  await leader.close(); await guesser.close();
});

test("the leader can ban a player, list everyone, unban, and remove a lock", async () => {
  const { code, leader } = await newRoom();
  const name = someone();
  const pat = new Client(code);
  await pat.hello({ name });
  pat.send({ t: "lockName", word: "2468" });
  await pat.next((m) => m.t === "nameStatus" && m.changed);
  pat.send({ t: "ban", player: leader.id });
  assert.match((await pat.next((m) => m.t === "error")).message, /Only the leader/);
  leader.send({ t: "ban", player: pat.id, reason: "cheating at cards" });
  assert.match((await pat.wait((m) => m.t === "bye")).reason, /banned/);
  let dir = await leader.next((m) => m.t === "directory");
  const row = dir.profiles.find((x) => x.name === name);
  assert.ok(row.banned && row.locked);
  assert.ok(!("lock" in row) && !("passes" in row), "no secrets in the list");
  // Banned everywhere.
  const { code: code2, leader: leader2 } = await newRoom();
  const turnedAway = new Client(code2);
  assert.equal((await turnedAway.hello({ name, word: "2468" })).code, "banned");
  leader.send({ t: "unban", name });
  leader.send({ t: "removeLock", name });
  await leader.next((m) => m.t === "directory");
  dir = await leader.next((m) => m.t === "directory");
  assert.ok(!dir.profiles.find((x) => x.name === name).banned);
  assert.ok(!dir.profiles.find((x) => x.name === name).locked);
  const welcomeBack = new Client(code2);
  assert.equal((await welcomeBack.hello({ name })).t, "welcome");
  // The leader can't ban themself.
  leader.send({ t: "ban", player: leader.id });
  assert.match((await leader.next((m) => m.t === "error")).message, /yourself/);
  await leader.close(); await leader2.close(); await turnedAway.close(); await welcomeBack.close(); await pat.close();
});

// ------------------------------------------------------------------ statistics (Phase 6B)

test("a finished game is saved to every human's stats; an ended one isn't", async () => {
  const boss = someone(), pal = someone();
  const { code, leader } = await newRoom(boss);
  const a = new Client(code);
  await a.hello({ name: pal });
  leader.send({ t: "settings", mode: "mixed", aiSeats: 2 });
  await leader.next((m) => m.t === "room" && m.room.settings.aiSeats === 2);
  for (const c of [leader, a]) autopilot(c);
  leader.send({ t: "start" });
  const over = await leader.wait((m) => m.t === "room" && m.room.status === "over", 60000);
  const order = over.room.results.standings.map((x) => x.id);

  // (Only this answer: the autopilots can get unrelated errors once the game is over.)
  const look = async (c, name) => { c.send({ t: "stats", name }); return (await c.next((m) => (m.t === "stats" && m.name === name) || (m.t === "error" && /stats/.test(m.message)))); };
  for (const [c, name, id] of [[leader, boss, leader.id], [a, pal, a.id]]) {
    const { profile } = await look(c, name);
    const g = profile.stats.dealbreaker;
    assert.equal(g.games, 1);
    assert.equal(g.wins, over.room.results.winner === id ? 1 : 0);
    assert.equal(g.positions[order.indexOf(id)], 1, "finishing position recorded");
    assert.equal(g.recent[0].players, 4);
    assert.ok(g.ms > 0);
    assert.deepEqual(profile.stats.overall.byGame, { dealbreaker: 1 });
  }
  // People in the room can look each other up; nobody else.
  assert.equal((await look(a, boss)).profile.name, boss);
  assert.match((await look(a, "Nobody Here")).message, /people in this room/);
  // The robots have no profiles.
  leader.send({ t: "directory" });
  const dir = await leader.next((m) => m.t === "directory");
  assert.ok(!dir.profiles.some((x) => over.room.players.some((q) => q.bot && q.name === x.name)));

  // A game the leader ends early records nothing.
  leader.send({ t: "rematch" });
  await leader.wait((m) => m.t === "state" && m.view && m.view.turn.number >= 1, 8000, { fresh: true });
  leader.send({ t: "endGame" });
  await leader.next((m) => m.t === "room" && m.room.status === "lobby");
  assert.equal((await look(a, pal)).profile.stats.dealbreaker.games, 1);

  // The leader can wipe someone's stats (typos, pranks); the profile stays.
  a.send({ t: "resetStats", name: pal });
  assert.match((await a.next((m) => m.t === "error")).message, /Only the leader/);
  leader.send({ t: "resetStats", name: pal });
  await leader.next((m) => m.t === "directory");
  const wiped = await look(a, pal);
  assert.deepEqual(wiped.profile.stats, {});
  await leader.close(); await a.close();
});

test("leaving mid-game is a DNF: no position, no win, and a robot's moves aren't yours", async () => {
  const boss = someone(), quitter = someone();
  const { code, leader } = await newRoom(boss);
  const a = new Client(code);
  await a.hello({ name: quitter });
  leader.send({ t: "settings", mode: "mixed", aiSeats: 1 });
  await leader.next((m) => m.t === "room" && m.room.settings.aiSeats === 1);
  autopilot(leader);
  leader.send({ t: "start" });
  await a.wait((m) => m.t === "state" && m.view);
  a.send({ t: "leave" });
  await a.wait((m) => m.t === "bye");
  await leader.wait((m) => m.t === "room" && m.room.status === "over", 60000);
  leader.send({ t: "stats", name: quitter });
  const { profile } = await leader.next((m) => m.t === "stats");
  const g = profile.stats.dealbreaker;
  assert.deepEqual([g.games, g.wins, g.dnf], [1, 0, 1]);
  assert.equal(g.recent[0].position, null);
  assert.deepEqual(g.actions, {}, "the robot in their seat played, not them");
  assert.equal(g.banked, 0);
  await leader.close(); await a.close();
});

// ------------------------------------------------------------------ pictures (Phase 6D)

test("pictures: built-in, emoji or photo; shown to the room, carried to other rooms, served by version", async () => {
  const name = someone();
  const { code, leader } = await newRoom();
  const pat = new Client(code);
  await pat.hello({ name });
  const set = async (pic) => { pat.send({ t: "setPicture", pic }); return pat.next((m) => m.t === "picture" || m.t === "error"); };
  assert.deepEqual((await set({ k: "p", id: "house" })).pic, { k: "p", id: "house", ring: null });
  await leader.wait((m) => m.t === "room" && m.room.players.some((q) => q.name === name && q.pic?.id === "house"));
  // Any emoji on any colors, with a ring; junk is refused.
  assert.deepEqual((await set({ k: "e", e: "😎", c1: "#ff0000", c2: "#00ff99", ring: "gold" })).pic, { k: "e", e: "😎", c1: "#ff0000", c2: "#00ff99", ring: "gold" });
  assert.equal((await set({ k: "p", id: "../../etc" })).t, "error");
  assert.equal((await set({ k: "e", e: "<b>hi</b>", c1: "#000000", c2: "#000000" })).t, "error");
  assert.equal((await set({ k: "p", id: "house", ring: "sparkly-unicorn" })).t, "error");

  // A photo goes over HTTP with the seat's token; both sizes are served by a random version.
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const up = (body) => post(`/api/rooms/${code}/picture`, { token: pat.token, thumb: png, full: png, type: "image/png", thumbType: "image/png", w: 1, h: 1, fx: 0, fy: 0, s: 1, ...body });
  assert.equal((await post(`/api/rooms/${code}/picture`, { token: "nope", thumb: png, full: png, type: "image/png", w: 1, h: 1, fx: 0, fy: 0, s: 1 })).status, 400);
  const r = await up({});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const pic = r.body.pic;
  assert.equal(pic.k, "f");
  assert.match(pic.v, /^[0-9a-f]{16}$/);
  for (const which of ["t", "f"]) {
    const got = await fetch(`${BASE}/api/pics/${pic.v}/${which}`);
    assert.equal(got.status, 200);
    assert.equal(got.headers.get("content-type"), "image/png");
    assert.match(got.headers.get("cache-control"), /immutable/);
  }
  assert.equal((await fetch(`${BASE}/api/pics/0000000000000000/t`)).status, 404);
  // Too big for the original.
  const big = await up({ full: Buffer.alloc(5_100_000).toString("base64") });
  assert.match(big.body.error, /too big/);
  // A new ring keeps the same photo.
  const ringed = await set({ k: "f", v: pic.v, ring: "fire" });
  assert.equal(ringed.pic.v, pic.v);
  assert.equal(ringed.pic.ring, "fire");
  await pat.close();

  // Another room: the picture comes along with the name.
  const { code: code2, leader: leader2 } = await newRoom();
  const again = new Client(code2);
  await again.hello({ name });
  await leader2.wait((m) => m.t === "room" && m.room.players.some((q) => q.name === name && q.pic?.v === pic.v));

  // Only the leader can clear someone else's; the photo goes with it.
  again.send({ t: "resetPicture", name });
  assert.match((await again.next((m) => m.t === "error")).message, /Only the leader/);
  const cleared = leader2.next((m) => m.t === "room" && m.room.players.some((q) => q.name === name && q.pic === null));
  leader2.send({ t: "resetPicture", name });
  await leader2.next((m) => m.t === "directory");
  await cleared;
  assert.equal((await fetch(`${BASE}/api/pics/${pic.v}/t`)).status, 404);
  await leader.close(); await leader2.close(); await again.close();
});

test("typing is passed on to everyone else, never stored", async () => {
  const { code, leader } = await newRoom();
  const pat = new Client(code);
  await pat.hello({ name: someone() });
  const seen = leader.next((m) => m.t === "typing");
  pat.send({ t: "typing", on: true });
  const m = await seen;
  assert.deepEqual([m.pid, m.on], [pat.id, true]);
  await leader.close(); await pat.close();
});
