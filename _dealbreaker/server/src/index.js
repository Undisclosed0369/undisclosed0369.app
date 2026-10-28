// Deal Breaker game server (Cloudflare Worker + Durable Objects).
//
// HTTP
//   POST /api/rooms             leader creates a room  { leaderCode, room, name, word? }  (word: the name's PIN, if locked)
//   GET  /api/rooms/:room       does it exist, and can people still join?
//   GET  /api/rooms/:room/ws    WebSocket into the room
//
// Every room is one Durable Object holding the lobby, the chat and the one
// true game state (from the shared rules engine). Clients only ever receive
// their own view of the game. All clocks — turn timer, discard window,
// reconnect grace, AI thinking time, cleanup — run off a single alarm.
//
// WEBSOCKET MESSAGES
//
// client -> server                         server -> client
//   hello { token | name, leaderCode? }      welcome { you, token }
//   settings { … }            (leader)       room { room }            lobby / table info
//   kick { player }           (leader)       state { view, events, clock }
//   start                     (leader)       chat { msg } / chatLog { msgs }
//   rejoin { request, allow } (leader)       rejoinRequest { request, name }
//   mute { player, muted }    (leader)       waiting      (rejoin needs the leader)
//   rematch / endGame         (leader)       error { message, code }
//   clearChat                 (leader)       chatLog { msgs, cleared }
//   closeRoom                 (leader)       bye { reason }  (to everyone; the code is freed)
//   hello { …, word?, pass? }                error { code: needWord | word | cooldown | banned }
//   lockName { word, oldWord?, pass? }       nameStatus { locked, pass? }
//   unlockName { word?, pass? }              nameStatus { locked: false }
//   directory                 (leader)       directory { profiles }
//   ban { player | name, reason? } / unban { name } / removeLock { name } / deleteProfile { name } / resetStats { name }  (leader)
//   stats { name }                           stats { name, profile }  (yourself, people in this room; the leader: anyone)
//   setPicture { pic: { k: "p", id } | { k: "e", e, c1, c2 } | { k: "f", v } (+ ring) | null }   (your own name; a locked one had its PIN asked at the door)
//   POST /api/rooms/<code>/picture { token, thumb, full, type, … }   a new photo or GIF (too big for a socket message)
//   resetPicture { name }     (leader)
//   GET /api/pics/<version>/<t|f>            a photo: the avatar still, or the original (versions are random)
//   act { action }                           bye { reason }
//   back                      (reclaim your seat from the AI)
//   chat { text } / react { r }
//   typing { on }                            typing { pid, name, on }  (to everyone else)
//   leave

import { DurableObject } from "cloudflare:workers";
import * as R from "../../../x/7a3797625d3c2330/engine/rules.js";
import { chooseMove } from "../../../x/7a3797625d3c2330/engine/bot.js";
import * as Stats from "../../../x/7a3797625d3c2330/engine/stats.js";
import { Directory, nameKey } from "./directory.js";

export { Directory };

// What players are told when the directory turns a name away.
const GATE = {
  needWord: () => "This name is locked. What's its PIN?",
  word: (g) => `Wrong PIN. ${g.left} ${g.left === 1 ? "try" : "tries"} left before it locks for 10 minutes.`,
  cooldown: (g) => `Too many wrong PINs. This name is locked for ${g.minutes} more minute${g.minutes === 1 ? "" : "s"}.`,
  banned: () => "This name is banned from Deal Breaker. Take it up with the leader.",
  format: () => "The PIN has to be exactly 4 digits.",
};

// ------------------------------------------------------------------ rules of the room

const TURN = { min: 60, max: 300, step: 15, default: 120 };
const DISCARD_WINDOW = 60_000;
const GRACE = 15_000;          // reconnect window before an AI takes the seat
const LOBBY_GRACE = 60_000;    // a disconnected player leaves the lobby after this
const IDLE_STRIKES = 3;        // timed-out turns in a row before an AI takes over
const EMPTY_ROOM = 3_600_000;  // a room with nobody in it is deleted after an hour
// Long enough that people can follow what the AI just did.
// How long an AI "thinks" before a move, in ms: quick for the routine, a
// proper pause for the big decisions, so it reads like a person at the table.
// Slow enough that everyone can follow along (and the card animations, up
// to ~2 s for a whole set changing hands, finish before the next move).
const BOT_THINK = {
  quick: [1300, 1800],  // drawing, ending the turn
  normal: [2000, 2800], // playing a card, paying
  big: [2900, 3600],    // Deal Breaker, Sly / Forced Deal, Just Say No, doubled rent
};
const BIG = new Set(["dealBreaker", "sly", "forced", "justSayNo"]);
function thinkTime(move) {
  const kind = !move || move.type === "draw" || move.type === "endTurn" ? "quick"
    : BIG.has(move.type) || move.doubles?.length ? "big" : "normal";
  const [lo, hi] = BOT_THINK[kind];
  return lo + Math.random() * (hi - lo);
}
const CHAT_MAX = 200, CHAT_KEEP = 200, CHAT_GAP = 1000;
const REACTIONS = ["😂", "🔥", "😭", "👀", "GG", "Nooo", "Why me"];
// Said in the chat after the leader wipes it.
const CLEARED = [
  "🧽 The leader wiped the chat. Whatever was said here never happened.",
  "🧹 Chat cleared. The evidence has been destroyed.",
  "🫧 Squeaky clean. The leader would like everyone to start over, nicely this time.",
  "📜 The history books have been burned. By the leader. On purpose.",
  "🙈 Chat cleared. We saw nothing. We know nothing.",
];
const BOT_NAMES = ["Robo Rita", "Sir Bots A Lot", "Deal Bot", "Botimus Prime", "Monopoly Max",
  "Cardi Bot", "Rent Bot", "Bot Marley"];

const normCode = (s) => String(s || "").replace(/\s+/g, "").toUpperCase();

/** Names: letters (any language) and single spaces, 2-16 characters. */
export function checkName(raw) {
  const name = String(raw || "").trim().replace(/\s+/g, " ");
  if (/\d/.test(name)) return { error: "No numbers. You're a person, not a license plate." };
  if (!/^[\p{L} ]*$/u.test(name)) return { error: "Letters only. Save the emojis for your group chat." };
  if (name.replace(/ /g, "").length < 2) return { error: "Two letters minimum. 'A' is a grade, not a name." };
  if (name.length > 16) return { error: "Okay, Your Majesty, 16 letters max." };
  return { name };
}

export function checkRoom(raw) {
  const room = normCode(raw);
  if (/[^A-Z]/.test(room)) return { error: "Letters only. This is a casino, not a calculator." };
  if (room.length < 3) return { error: "At least 3 letters. Even 'CAT' qualifies." };
  if (room.length > 12) return { error: "12 letters max. It's a room code, not a novel." };
  return { room };
}

const token = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

function sameSecret(a, b) {
  // Constant-time compare, so the leader code can't be guessed by timing.
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
const isLeaderCode = (env, code) => !!env.LEADER_CODE && sameSecret(normCode(code), normCode(env.LEADER_CODE));

// ------------------------------------------------------------------ worker

function allowed(env, origin) {
  const list = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  return list.includes("*") || (origin && list.includes(origin));
}

function cors(env, req, res) {
  const origin = req.headers.get("Origin");
  if (allowed(env, origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin || "*");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return cors(env, req, new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" } }));
    }
    if (!allowed(env, req.headers.get("Origin")) && req.headers.get("Origin")) {
      return json({ error: "Not from here." }, 403);
    }
    const ip = req.headers.get("CF-Connecting-IP") || "local";
    const scale = Number(env.TIME_SCALE || 1); // tests fast-forward the limits' windows too
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] !== "api") return cors(env, req, json({ ok: true, hint: "Nothing to see here. Shuffle along." }));

    if (parts[1] === "rooms" && parts.length === 2 && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const guard = env.GUARD.get(env.GUARD.idFromName("ip:" + ip));
      if (!(await guard.allow("create", 20, 600_000 * scale))) {
        return cors(env, req, json({ error: "Too many tries. Take a breather and come back in a few minutes." }, 429));
      }
      if (!isLeaderCode(env, body.leaderCode)) {
        await guard.allow("bad-code", 0, 600_000 * scale);
        return cors(env, req, json({ error: "Only the leader can open a room." }, 403));
      }
      const r = checkRoom(body.room);
      if (r.error) return cors(env, req, json({ error: r.error }, 400));
      const n = checkName(body.name);
      if (n.error) return cors(env, req, json({ error: n.error }, 400));
      // A locked name needs its PIN, the leader's included.
      const g = await env.DIRECTORY.get(env.DIRECTORY.idFromName("players")).gate({ name: n.name, word: body.word, leader: true });
      if (!g.ok) return cors(env, req, json({ error: GATE[g.code](g), code: g.code }, 403));
      const stub = env.ROOMS.get(env.ROOMS.idFromName(r.room));
      const out = await stub.create(r.room, n.name);
      return cors(env, req, json(out, out.error ? 409 : 200));
    }

    if (parts[1] === "pics" && /^[0-9a-f]{16}$/.test(parts[2] || "") && ["t", "f"].includes(parts[3]) && req.method === "GET") {
      const dir = env.DIRECTORY.get(env.DIRECTORY.idFromName("players"));
      const pic = await dir.image(parts[2], parts[3]);
      if (!pic) return cors(env, req, new Response("No picture.", { status: 404 }));
      // A version never changes, so browsers keep it for good.
      return cors(env, req, new Response(pic.bytes, { headers: { "Content-Type": pic.type, "Cache-Control": "public, max-age=31536000, immutable" } }));
    }

    if (parts[1] === "rooms" && parts[2] && parts[3] === "picture" && req.method === "POST") {
      const r = checkRoom(parts[2]);
      if (r.error) return cors(env, req, json({ error: r.error }, 400));
      const guard = env.GUARD.get(env.GUARD.idFromName("ip:" + ip));
      if (!(await guard.allow("picture", 20, 600_000 * scale))) return cors(env, req, json({ error: "That's a lot of new pictures. Give it a few minutes." }, 429));
      const body = await req.json().catch(() => null);
      const out = await env.ROOMS.get(env.ROOMS.idFromName(r.room)).uploadPicture(body);
      return cors(env, req, json(out, out.error ? 400 : 200));
    }

    if (parts[1] === "rooms" && parts[2]) {
      const r = checkRoom(parts[2]);
      if (r.error) return cors(env, req, json({ error: r.error }, 400));
      const stub = env.ROOMS.get(env.ROOMS.idFromName(r.room));
      if (parts[3] === "ws") {
        if (req.headers.get("Upgrade") !== "websocket") return json({ error: "WebSocket only." }, 426);
        const guard = env.GUARD.get(env.GUARD.idFromName("ip:" + ip));
        if (!(await guard.allow("join", 60, 60_000 * scale))) return json({ error: "Slow down." }, 429);
        return stub.fetch(req);
      }
      if (parts.length === 3 && req.method === "GET") return cors(env, req, json(await stub.info()));
    }

    return cors(env, req, json({ error: "Not found." }, 404));
  },
};

// ------------------------------------------------------------------ rate limits

/** Counts attempts per key in a sliding window. One instance per IP. */
export class Guard extends DurableObject {
  async allow(key, limit, windowMs) {
    const now = Date.now();
    const list = ((await this.ctx.storage.get(key)) || []).filter((t) => now - t < windowMs);
    if (limit && list.length >= limit) return false;
    list.push(now);
    await this.ctx.storage.put(key, list);
    // Wrong leader codes count against creating rooms too.
    if (key === "bad-code") {
      const c = ((await this.ctx.storage.get("create")) || []);
      c.push(now, now, now, now);
      await this.ctx.storage.put("create", c);
    }
    await this.ctx.storage.setAlarm(now + windowMs);
    return true;
  }
  async alarm() { await this.ctx.storage.deleteAll(); }
}

// ------------------------------------------------------------------ rooms

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.scale = Number(env.TIME_SCALE || 1);
    this.lastChat = new Map();
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get("room")) || null;
      await this.dropStale();
    });
  }

  /** After a restart or crash the sockets are gone without a close event, so
   *  seats saved as connected would look online (and keep an old lobby alive)
   *  forever. Anyone without a live socket is treated as just dropped. */
  async dropStale() {
    const d = this.data;
    if (!d) return;
    const live = new Set(this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment()?.pid).filter(Boolean));
    const stale = d.players.filter((p) => !p.bot && p.connected && !live.has(p.id));
    if (!stale.length) return;
    const now = Date.now();
    for (const p of stale) {
      p.connected = false;
      p.seen = now;
      d.graceAt[p.id] = now + this.ms(d.status === "lobby" ? LOBBY_GRACE : GRACE);
    }
    if (!this.humans().some((x) => x.connected)) d.emptySince = now;
    await this.save();
  }

  ms(n) { return Math.max(1, Math.round(n * this.scale)); }

  // ---------------------------------------------------------------- creation

  async create(code, name) {
    // Only the leader can call this. A game still going, or friends still
    // here, is theirs to walk back into; anything else (a finished match, an
    // empty lobby) is wiped and the code starts fresh.
    if (this.data) {
      const d = this.data;
      const others = d.players.some((p) => p.id !== d.leader && !p.bot && !p.gone && p.connected);
      if (d.status === "playing" || others) {
        const leader = this.player(d.leader);
        return { room: code, player: leader.id, token: leader.token, resumed: true };
      }
      await this.close("The leader opened this room again. Join with the code to play.");
    }
    const leader = { id: "p1", name, token: token(), connected: false, seen: Date.now(), timeouts: 0 };
    this.data = {
      code, created: Date.now(), status: "lobby",
      leader: leader.id,
      settings: { mode: "players", aiSeats: 1, aiLevel: "normal", winSets: 3, turnSeconds: TURN.default, drawFirst: true },
      players: [leader],
      nextId: 2, game: null, clock: null, discardAt: {}, graceAt: {}, botAt: null,
      rejoins: [], chat: [], results: null, emptySince: Date.now(),
    };
    await this.save();
    await this.dir().seen(name, code).catch(() => {});
    return { room: code, player: leader.id, token: leader.token };
  }

  async info() {
    if (!this.data) return { exists: false };
    const d = this.data;
    return { exists: true, status: d.status, players: d.players.filter((p) => !p.gone).length, mode: d.settings.mode };
  }

  async save() {
    if (this.data) await this.ctx.storage.put("room", this.data);
    await this.schedule();
  }

  // ---------------------------------------------------------------- sockets

  async fetch(req) {
    if (!this.data) return new Response("No such room.", { status: 404 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ pid: null, pending: null });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* closed */ }
  }

  socketsOf(pid) {
    return this.ctx.getWebSockets().filter((ws) => ws.deserializeAttachment()?.pid === pid);
  }

  sendTo(pid, msg) { for (const ws of this.socketsOf(pid)) this.send(ws, msg); }

  player(pid) { return this.data.players.find((p) => p.id === pid); }

  humans() { return this.data.players.filter((p) => !p.bot && !p.gone); }

  /** True when the AI is playing this seat. */
  botControls(p) { return p.bot || !!p.takeover; }

  async webSocketMessage(ws, raw) {
    if (!this.data) return this.bye(ws, "This room has closed.");
    let msg;
    try { msg = JSON.parse(raw); } catch { return this.send(ws, { t: "error", message: "Bad message." }); }
    const at = ws.deserializeAttachment() || {};
    try {
      if (msg.t === "hello") return await this.hello(ws, msg);
      if (!at.pid || at.pending) return this.send(ws, { t: "error", message: "Say hello first." });
      const p = this.player(at.pid);
      if (!p || p.gone) return this.send(ws, { t: "bye", reason: "You're not in this room any more." });
      p.seen = Date.now();
      await this.handle(ws, p, msg);
    } catch (e) {
      if (e instanceof R.RuleError) this.send(ws, { t: "error", message: e.message, code: "rule" });
      else { console.error(e); this.send(ws, { t: "error", message: "Something went wrong. The dealer dropped a card." }); }
    }
  }

  async webSocketClose(ws) { await this.dropped(ws); }
  async webSocketError(ws) { await this.dropped(ws); }

  async dropped(ws) {
    if (!this.data) return; // the room was just closed
    const at = ws.deserializeAttachment() || {};
    if (at.pending) {
      this.data.rejoins = this.data.rejoins.filter((r) => r.id !== at.pending);
      this.sendTo(this.data.leader, { t: "rejoinGone", request: at.pending });
    }
    const p = at.pid && this.player(at.pid);
    if (!p || at.pending) return this.save();
    if (this.socketsOf(p.id).some((x) => x !== ws)) return; // still open in another tab
    p.connected = false;
    p.seen = Date.now();
    this.data.graceAt[p.id] = Date.now() + this.ms(this.data.status === "lobby" ? LOBBY_GRACE : GRACE);
    if (!this.humans().some((x) => x.connected)) this.data.emptySince = Date.now();
    this.broadcastRoom();
    await this.save();
  }

  // ---------------------------------------------------------------- joining

  async hello(ws, msg) {
    const d = this.data;
    const at = ws.deserializeAttachment() || {};
    if (at.pid) return this.send(ws, { t: "error", message: "Already here." });

    // The leader's code gets the leader's seat back: straight away with the
    // seat's token (reconnecting), otherwise after the name's PIN, if locked.
    if (msg.leaderCode && isLeaderCode(this.env, msg.leaderCode)) {
      const lead = this.player(d.leader);
      if (msg.token !== lead.token) {
        const g = await this.dir().gate({ name: lead.name, word: msg.word, leader: true });
        if (!g.ok) return this.send(ws, { t: "error", code: g.code, message: GATE[g.code](g) });
      }
      return this.attach(ws, lead, true);
    }

    if (msg.token) {
      const p = d.players.find((x) => x.token === msg.token);
      if (p && p.kicked) return this.bye(ws, "The leader removed you from this room.");
      if (p && !p.gone) {
        if (p.takeover === "disconnect" && d.status === "playing" && p.id !== d.leader) return this.askLeader(ws, p);
        return this.attach(ws, p, false);
      }
    }

    const n = checkName(msg.name);
    if (n.error) return this.send(ws, { t: "error", message: n.error, code: "name" });

    // The directory decides whether this name may play: banned, or locked
    // without its PIN, and it's turned away here.
    const g = await this.dir().gate({ name: n.name, word: msg.word });
    if (!g.ok) return this.send(ws, { t: "error", code: g.code, message: GATE[g.code](g) });
    if (g.pass) this.send(ws, { t: "nameStatus", locked: true, pass: g.pass, name: n.name });
    const same = d.players.find((x) => !x.gone && !x.bot && x.name.toLowerCase() === n.name.toLowerCase());

    if (d.status !== "lobby") {
      // Mid-game, a known name can ask to come back; nobody new can join.
      if (same && same.takeover && same.id !== d.leader && !same.kicked) return this.askLeader(ws, same);
      if (same && same.connected) return this.send(ws, { t: "error", message: "Someone already took that name. Be original. Or add a middle name.", code: "name" });
      return this.send(ws, { t: "error", message: "They started without you. Rude, honestly.", code: "started" });
    }
    // In the lobby, a name whose owner has dropped off (a closed tab, a new
    // phone) is simply theirs again.
    if (same && !same.connected && same.id !== d.leader) return this.attach(ws, same, false);
    if (same) return this.send(ws, { t: "error", message: "Someone already took that name. Be original. Or add a middle name.", code: "name" });
    if (d.settings.mode === "ai") return this.send(ws, { t: "error", message: "It's humans versus robots tonight, and the leader is the only human.", code: "full" });
    const seats = this.humans().length + (d.settings.mode === "mixed" ? d.settings.aiSeats : 0);
    if (seats >= 5) return this.send(ws, { t: "error", message: "Room's full. Five's a party, six is a fire hazard.", code: "full" });

    const p = { id: "p" + d.nextId++, name: n.name, token: token(), connected: false, seen: Date.now(), timeouts: 0 };
    d.players.push(p);
    this.system(`${p.name} joined. Hide your Deal Breakers.`);
    return this.attach(ws, p, false);
  }

  async attach(ws, p, viaLeaderCode) {
    const d = this.data;
    ws.serializeAttachment({ pid: p.id, pending: null });
    const wasAway = !p.connected;
    p.connected = true;
    p.seen = Date.now();
    delete d.graceAt[p.id];
    d.emptySince = null;
    // Back within the grace period, or the leader: just carry on. The seat
    // is only handed back from the AI here after a leader's yes (askLeader)
    // or for the leader themself.
    if (p.takeover === "disconnect" && (viaLeaderCode || p.id === d.leader)) {
      p.takeover = null;
      this.system(`${p.name} is back! The robot is sad to go.`);
    }
    this.send(ws, { t: "welcome", you: p.id, token: p.token, leader: p.id === d.leader });
    this.dir().seen(p.name, d.code).then((r) => {
      this.send(ws, { t: "nameStatus", locked: r.locked, name: p.name });
      // Their picture comes with their name, from any earlier room.
      if (JSON.stringify(r.pic || null) !== JSON.stringify(p.pic || null)) { p.pic = r.pic; this.broadcastRoom(); this.save(); }
    }).catch(() => {});
    this.send(ws, { t: "chatLog", msgs: d.chat });
    if (p.id === d.leader) for (const r of d.rejoins) this.send(ws, { t: "rejoinRequest", request: r.id, name: r.name });
    if (wasAway) this.broadcastRoom();
    else this.sendRoom(ws, p);
    if (d.game) this.sendState(p, []);
    await this.botTick();
    await this.save();
  }

  async askLeader(ws, p) {
    const d = this.data;
    const id = token().slice(0, 8);
    d.rejoins.push({ id, pid: p.id, name: p.name, at: Date.now() });
    ws.serializeAttachment({ pid: null, pending: id, wants: p.id });
    this.send(ws, { t: "waiting", message: `Asking the leader to let ${p.name} back in…` });
    this.sendTo(d.leader, { t: "rejoinRequest", request: id, name: p.name });
    await this.save();
  }

  bye(ws, reason) {
    this.send(ws, { t: "bye", reason });
    try { ws.close(1000, "bye"); } catch { /* already closed */ }
  }

  // ---------------------------------------------------------------- messages

  async handle(ws, p, msg) {
    const d = this.data;
    const isLeader = p.id === d.leader;
    const leaderOnly = () => { if (!isLeader) throw new R.RuleError("Only the leader can do that."); };

    switch (msg.t) {
      case "settings": {
        leaderOnly();
        if (d.status !== "lobby") {
          // Mid-game the leader can change the pace and the target, not the seats.
          if (msg.mode !== undefined || msg.aiSeats !== undefined) throw new R.RuleError("Seats are set once the cards are dealt.");
          const before = { ...d.settings };
          this.applySettings(msg);
          if (d.game) {
            d.game.options.winSets = d.settings.winSets;
            d.game.options.drawFirst = d.settings.drawFirst !== false;
            // Rule switched off: a draw already lost this turn comes back.
            if (!d.game.options.drawFirst) d.game.turn.drawLost = false;
          }
          for (const q of d.players) if (q.bot) q.level = d.settings.aiLevel;
          if (before.turnSeconds !== d.settings.turnSeconds) await this.retime(before.turnSeconds);
          const said = [];
          if (before.turnSeconds !== d.settings.turnSeconds) said.push(`turn timer to ${d.settings.turnSeconds}s`);
          if (before.winSets !== d.settings.winSets) said.push(`sets to win to ${d.settings.winSets}`);
          if (before.aiLevel !== d.settings.aiLevel) said.push(`AI skill to ${d.settings.aiLevel === "easy" ? "Easy" : "Normal"}`);
          if (said.length) this.system(`The leader changed the ${said.join(" and the ")}. Adapt or perish.`);
          if ((before.drawFirst !== false) !== (d.settings.drawFirst !== false)) {
            this.system(d.settings.drawFirst !== false
              ? "New rule from the leader: draw first. Play anything before drawing and those cards are gone."
              : "The leader relaxed the rules: you can draw any time during your turn now.");
          }
          this.broadcastRoom();
          if (d.game && d.status === "playing") this.broadcastState([]);
          break;
        }
        this.applySettings(msg);
        this.broadcastRoom();
        break;
      }
      case "kick": {
        leaderOnly();
        const q = this.player(msg.player);
        if (!q || q === p || q.gone) throw new R.RuleError("You can't kick that player.");
        await this.kick(q, "The leader removed you from this room.");
        break;
      }
      case "ban": {
        // Banned names can't join any room, ever (until unbanned). If they're
        // here, they're kicked out too.
        leaderOnly();
        // From a seat (player) or from the players list (name): either way, if
        // they're in this room right now, they're out.
        const byName = msg.player ? null : checkName(msg.name).name;
        const q = msg.player ? this.player(msg.player)
          : d.players.find((x) => !x.gone && !x.bot && x.name.toLowerCase() === String(byName || "").toLowerCase()) || null;
        const name = q ? q.name : byName;
        if (!name || (q && q.bot)) throw new R.RuleError("You can't ban that player.");
        if (q === p || (q && q.id === d.leader)) throw new R.RuleError("You can't ban yourself, boss.");
        await this.dir().ban(name, { room: d.code, reason: msg.reason });
        if (q && !q.gone) await this.kick(q, "The leader banned you from Deal Breaker.", `${q.name} has been banned. Don't let the door hit you.`);
        await this.sendDirectory(ws);
        break;
      }
      case "unban": leaderOnly(); await this.dir().unban(msg.name); await this.sendDirectory(ws); break;
      case "removeLock": leaderOnly(); await this.dir().removeLock(msg.name); await this.sendDirectory(ws); break;
      case "deleteProfile": leaderOnly(); await this.dir().remove(msg.name); await this.sendDirectory(ws); break;
      case "resetStats": leaderOnly(); await this.dir().resetStats(msg.name); await this.sendDirectory(ws); break;
      case "setPicture": case "resetPicture": {
        // Your own picture; the leader can clear anyone's. A locked name's
        // PIN was asked when it sat down, so being here under it is proof.
        if (msg.t === "resetPicture") leaderOnly();
        const name = msg.t === "resetPicture" ? String(msg.name || "") : p.name;
        const r = await this.dir().setPic(name, msg.t === "resetPicture" ? null : msg.pic);
        if (!r.ok) throw new R.RuleError("That picture didn't work. Try another one.");
        this.picChanged(name, r.pic);
        if (msg.t === "resetPicture") await this.sendDirectory(ws);
        else this.send(ws, { t: "picture", pic: r.pic });
        break;
      }
      case "stats": {
        // Your own, and the humans in this room; the leader can look anyone up.
        const want = nameKey(msg.name);
        const here = d.players.some((q) => !q.bot && !q.gone && nameKey(q.name) === want);
        if (!isLeader && !here) throw new R.RuleError("You can only see the stats of people in this room.");
        this.send(ws, { t: "stats", name: msg.name, profile: await this.dir().stats(msg.name) });
        return;
      }
      case "directory": leaderOnly(); await this.sendDirectory(ws); return;
      case "lockName": case "unlockName": {
        // Your own name only. The leader needs no PIN for their own.
        const args = { name: p.name, word: msg.word, oldWord: msg.oldWord, pass: msg.pass, leader: isLeader };
        const r = msg.t === "lockName" ? await this.dir().lock(args) : await this.dir().unlock(args);
        if (!r.ok) throw new R.RuleError(GATE[r.code](r));
        this.send(ws, { t: "nameStatus", name: p.name, locked: msg.t === "lockName", pass: r.pass || null, changed: true });
        return;
      }
      case "mute": {
        leaderOnly();
        const q = this.player(msg.player);
        if (!q || q.bot) throw new R.RuleError("No such player.");
        q.muted = !!msg.muted;
        this.sendTo(q.id, { t: "muted", muted: q.muted });
        this.broadcastRoom();
        break;
      }
      case "rejoin": {
        leaderOnly();
        const r = d.rejoins.find((x) => x.id === msg.request);
        if (!r) throw new R.RuleError("That request is gone.");
        d.rejoins = d.rejoins.filter((x) => x !== r);
        const waiting = this.ctx.getWebSockets().filter((s) => s.deserializeAttachment()?.pending === r.id);
        const q = this.player(r.pid);
        if (msg.allow && q) {
          q.takeover = null;
          q.timeouts = 0;
          this.system(`${q.name} is back! The robot is sad to go.`);
          for (const s of waiting) await this.attach(s, q, false);
        } else {
          for (const s of waiting) this.bye(s, "The leader said no. The robot keeps the seat. Awkward.");
          this.system("The leader said no. The robot keeps the seat. Awkward.");
        }
        this.broadcastRoom();
        break;
      }
      case "start": {
        leaderOnly();
        if (d.status === "playing") throw new R.RuleError("Already playing.");
        await this.startGame();
        break;
      }
      case "rematch": {
        leaderOnly();
        if (d.status !== "over") throw new R.RuleError("Finish this one first.");
        await this.startGame();
        break;
      }
      case "endGame": {
        leaderOnly();
        if (d.status !== "playing") throw new R.RuleError("No game to end.");
        d.status = "lobby"; d.game = null; d.clock = null; d.discardAt = {}; d.botAt = null; d.results = null;
        d.tally = null; // an abandoned game records nothing
        for (const q of d.players) q.takeover = null;
        this.system("The leader ended the game. Nobody wins. Everybody loses. Mostly the robots.");
        this.broadcastRoom();
        for (const q of this.humans()) this.sendTo(q.id, { t: "state", view: null, events: [], clock: null });
        break;
      }
      case "act": {
        if (d.status !== "playing") throw new R.RuleError("No game in progress.");
        if (p.takeover) throw new R.RuleError("The AI has your seat. Tap “I'm back” first.");
        const before = this.snapshot();
        const events = R.act(d.game, p.id, msg.action || {});
        if (R.active(d.game).id === p.id || before.turn !== d.game.turn.number) p.timeouts = 0;
        await this.afterChange(events, before);
        break;
      }
      case "back": {
        if (p.takeover !== "idle") throw new R.RuleError("Your seat is already yours.");
        p.takeover = null;
        p.timeouts = 0;
        this.system(`${p.name} woke up and took their seat back.`);
        this.broadcastRoom();
        await this.afterChange([]);
        break;
      }
      case "typing": {
        // "… is typing" for everyone else. Passed straight on, never stored.
        if (p.muted) return;
        for (const q of this.humans()) if (q.id !== p.id) this.sendTo(q.id, { t: "typing", pid: p.id, name: p.name, on: !!msg.on });
        return;
      }
      case "chat": case "react": {
        if (p.muted) throw new R.RuleError("The leader has muted you. Think about what you said.");
        const last = this.lastChat.get(p.id) || 0;
        if (Date.now() - last < CHAT_GAP) throw new R.RuleError("Easy there. One message a second.");
        let text;
        if (msg.t === "react") {
          if (!REACTIONS.includes(msg.r)) throw new R.RuleError("Unknown reaction.");
          text = msg.r;
        } else {
          text = String(msg.text || "").trim().replace(/\s+/g, " ");
          if (!text) return;
          if (text.length > CHAT_MAX) throw new R.RuleError(`${CHAT_MAX} characters max.`);
        }
        this.lastChat.set(p.id, Date.now());
        this.post({ id: token().slice(0, 10), pid: p.id, name: p.name, text, react: msg.t === "react", at: Date.now() });
        break;
      }
      case "clearChat": {
        leaderOnly();
        // Wipe the history, then leave one line so nobody thinks they glitched.
        d.chat = [];
        const line = CLEARED[Math.floor(Math.random() * CLEARED.length)];
        const note = { id: token().slice(0, 10), pid: null, name: null, text: line, system: true, cleared: true, at: Date.now() };
        d.chat.push(note);
        for (const q of this.humans()) this.sendTo(q.id, { t: "chatLog", msgs: d.chat, cleared: true });
        break;
      }
      case "closeRoom": {
        // The leader ends everything, game or not; the code is free at once.
        leaderOnly();
        await this.close("The leader closed the room. Thanks for playing!");
        return;
      }
      case "leave": {
        if (isLeader && d.status !== "playing") {
          // The leader leaving an idle or finished room closes it, and frees the code.
          await this.close("The leader closed the room. Thanks for playing!");
          return;
        }
        if (d.status === "lobby") {
          p.gone = true;
          if (p.id === d.leader) p.gone = false; // the leader's seat stays theirs
          this.system(`${p.name} left.`);
        } else {
          p.takeover = p.takeover || "disconnect";
          this.system(`${p.name} vanished. A robot is filling in. It's doing its best.`);
        }
        this.bye(ws, "See you next time.");
        this.broadcastRoom();
        if (d.game) await this.afterChange([]);
        break;
      }
      case "ping": this.send(ws, { t: "pong", at: Date.now() }); return;
      default: throw new R.RuleError("Unknown message.");
    }
    await this.save();
  }

  applySettings(msg) {
    const s = this.data.settings;
    if (msg.mode !== undefined) {
      if (!["players", "mixed", "ai"].includes(msg.mode)) throw new R.RuleError("Unknown mode.");
      s.mode = msg.mode;
    }
    if (msg.aiSeats !== undefined) {
      const n = Number(msg.aiSeats);
      if (!Number.isInteger(n) || n < 1 || n > 4) throw new R.RuleError("1 to 4 AI players.");
      s.aiSeats = n;
    }
    if (msg.aiLevel !== undefined) {
      if (!["easy", "normal"].includes(msg.aiLevel)) throw new R.RuleError("Easy or Normal.");
      s.aiLevel = msg.aiLevel;
    }
    if (msg.winSets !== undefined) {
      const n = Number(msg.winSets);
      if (!Number.isInteger(n) || n < 3 || n > 6) throw new R.RuleError("3 to 6 sets.");
      s.winSets = n;
    }
    if (msg.drawFirst !== undefined) {
      if (typeof msg.drawFirst !== "boolean") throw new R.RuleError("On or off.");
      s.drawFirst = msg.drawFirst;
    }
    if (msg.turnSeconds !== undefined) {
      const n = Number(msg.turnSeconds);
      if (!Number.isInteger(n) || n < TURN.min || n > TURN.max || n % TURN.step) {
        throw new R.RuleError(`${TURN.min} to ${TURN.max} seconds, in steps of ${TURN.step}.`);
      }
      s.turnSeconds = n;
    }
  }

  // ---------------------------------------------------------------- the game

  startGame() {
    const d = this.data;
    const s = d.settings;
    // Bots from a previous game are replaced; humans who left are dropped.
    d.players = d.players.filter((p) => !p.bot && !p.gone && !p.kicked);
    for (const p of d.players) { p.takeover = p.connected || p.id === d.leader ? null : "disconnect"; p.timeouts = 0; }
    const humans = s.mode === "ai" ? d.players.filter((p) => p.id === d.leader) : d.players;
    if (s.mode === "ai") for (const p of d.players) if (p.id !== d.leader) p.gone = true;
    const bots = s.mode === "players" ? 0 : s.mode === "ai" ? s.aiSeats : s.aiSeats;
    const total = humans.length + bots;
    if (total < 2) throw new R.RuleError("You need at least 2 players. Even poker needs an opponent.");
    if (total > 5) throw new R.RuleError("5 players max. Remove an AI or kick someone.");
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < bots; i++) {
      d.players.push({ id: "p" + d.nextId++, name: names[i], bot: true, level: s.aiLevel, connected: true, timeouts: 0 });
    }
    const seated = d.players.filter((p) => !p.gone);
    d.game = R.createGame({ players: seated.map((p) => ({ id: p.id, name: p.name })), winSets: s.winSets,
      drawFirst: s.drawFirst !== false, seed: crypto.getRandomValues(new Uint32Array(1))[0] });
    const events = d.game.log;
    d.game.log = [];
    d.status = "playing";
    d.results = null;
    // Stats for this game: one tally per human seat, saved when it ends.
    d.tally = { start: Date.now(), players: seated.length, seats: {} };
    for (const p of seated) if (!p.bot) d.tally.seats[p.id] = { name: p.name, t: Stats.blankTally(), leftAt: null };
    // The screens deal the cards out one by one (110 ms each, five rounds);
    // AI players wait for the last card to land before their first move.
    d.dealtUntil = Date.now() + this.ms(600 + seated.length * 5 * 110 + 800);
    d.discardAt = {};
    d.clock = null;
    this.system("Cards are dealt. May the best schemer win.");
    this.broadcastRoom();
    return this.afterChange(events, null);
  }

  snapshot() {
    const g = this.data.game;
    return { phase: g.phase, turn: g.turn.number, key: this.awaitKey() };
  }

  awaitKey() {
    const g = this.data.game;
    return g.phase + ":" + g.turn.number + ":" + JSON.stringify(R.awaiting(g));
  }

  /** After anything changes the game: owed discards, the clock, AI turns,
      the end of the game, and telling everyone. */
  async afterChange(events, before) {
    const d = this.data;
    const g = d.game;
    g.log = [];
    const now = Date.now();
    this.tally(events, now);

    for (const e of events) {
      if (e.t === "mustDiscard") {
        const p = this.player(e.p);
        if (this.botControls(p)) events.push(...R.autoDiscard(g, p.id));
        else d.discardAt[e.p] = now + this.ms(DISCARD_WINDOW);
      }
      if (e.t === "discard") delete d.discardAt[e.p];
    }
    for (const pid of Object.keys(d.discardAt)) if (!g.discards[pid]) delete d.discardAt[pid];

    if (g.phase === "over") {
      d.status = "over";
      d.clock = null;
      d.botAt = null;
      d.discardAt = {};
      d.results = { winner: g.winner, standings: R.standings(g), at: now };
      await this.recordStats(now);
      this.system(`🏆 ${this.player(g.winner).name} WINS! Bow down to the property tycoon.`);
      this.broadcastRoom();
    } else {
      this.tickClock(before);
    }

    this.broadcastState(events);
    await this.botTick();
  }

  // ---------------------------------------------------------------- pictures

  /** A new photo or GIF, over HTTP (it can be bigger than a socket message). */
  async uploadPicture(body) {
    const d = this.data;
    const p = d && body?.token && d.players.find((x) => x.token === body.token && !x.bot && !x.gone);
    if (!p) return { error: "You need to be in the room to change your picture." };
    const r = await this.dir().setPhoto(p.name, body);
    if (!r.ok) return { error: r.code === "pictureSize" ? "That one's too big. Up to 5 MB, please." : "That picture didn't work. Try another one." };
    this.picChanged(p.name, r.pic);
    await this.save();
    return { ok: true, pic: r.pic };
  }

  picChanged(name, pic) {
    for (const q of this.data.players) if (!q.bot && nameKey(q.name) === nameKey(name)) q.pic = pic;
    this.broadcastRoom();
  }

  // ---------------------------------------------------------------- statistics (Phase 6B)

  /** Count these events for the humans playing their own seats, and note who has left. */
  tally(events, now) {
    const T = this.data.tally;
    if (!T) return;
    const seats = T.seats;
    const counts = (id) => { const p = this.player(id); return !!p && !p.bot && !p.takeover && !p.gone; };
    const tallies = Object.fromEntries(Object.entries(seats).map(([id, s]) => [id, s.t]));
    const names = Object.fromEntries(this.data.players.map((p) => [p.id, p.name]));
    Stats.tallyEvents(tallies, this.data.game, events, counts, names);
    for (const [id, s] of Object.entries(seats)) {
      const p = this.player(id);
      const away = !p || p.gone || p.kicked || p.takeover === "disconnect";
      if (away && !s.leftAt) s.leftAt = now;
      else if (!away) s.leftAt = null; // back before the end: a normal finish
    }
  }

  /** The game is over: one record per human, into their profiles in one write. */
  async recordStats(now) {
    const d = this.data;
    const T = d.tally;
    if (!T) return;
    d.tally = null;
    const order = R.standings(d.game).map((x) => x.id);
    const entries = Object.entries(T.seats).map(([id, s]) => {
      const p = this.player(id);
      const dnf = !p || !!p.kicked || !!p.gone || p.takeover === "disconnect";
      const at = order.indexOf(id);
      const record = Stats.gameRecord(s.t, {
        position: dnf || at < 0 ? null : at + 1, players: T.players, won: !dnf && d.game.winner === id, dnf,
        ms: (dnf && s.leftAt ? s.leftAt : now) - T.start, at: now,
      });
      return { name: s.name, game: Stats.GAME, record };
    });
    if (entries.length) await this.dir().record(entries).catch(() => {});
  }

  /** The leader changed the turn timer mid-turn: the clock that's running
      changes now, keeping the time already used (and never less than 10 s). */
  async retime(oldSeconds) {
    const d = this.data;
    const c = d.clock;
    if (!c) return;
    const now = Date.now();
    const oldFull = this.ms(oldSeconds * 1000);
    const newFull = this.ms(d.settings.turnSeconds * 1000);
    const floor = this.ms(10_000);
    const redo = (left) => Math.max(floor, newFull - (oldFull - left));
    c.deadline = now + redo(Math.max(0, c.deadline - now));
    if (c.paused != null) c.paused = redo(c.paused);
    await this.schedule();
  }

  /** One clock: whoever the game waits on gets the full time. The active
      player's clock pauses while others answer, and resumes after. */
  tickClock(before) {
    const d = this.data;
    const g = d.game;
    const key = this.awaitKey();
    const full = this.ms(d.settings.turnSeconds * 1000);
    const now = Date.now();
    const c = d.clock;
    if (c && c.key === key) return;
    if (c && c.turn === g.turn.number && before?.phase === "play" && g.phase === "respond") {
      d.clock = { key, turn: g.turn.number, deadline: now + full, paused: Math.max(0, c.deadline - now) };
    } else if (c && c.turn === g.turn.number && g.phase === "play" && c.paused != null) {
      d.clock = { key, turn: g.turn.number, deadline: now + c.paused, paused: null };
    } else if (c && c.turn === g.turn.number && g.phase === "respond") {
      d.clock = { key, turn: g.turn.number, deadline: now + full, paused: c.paused };
    } else {
      d.clock = { key, turn: g.turn.number, deadline: now + full, paused: null };
    }
  }

  /** If the game is waiting on an AI, give it a moment to "think", then act. */
  async botTick() {
    const d = this.data;
    if (d.status !== "playing") { d.botAt = null; return; }
    const waiting = R.awaiting(d.game).some((a) => this.botControls(this.player(a.id)));
    if (!waiting) { d.botAt = null; return; }
    if (!d.botAt) {
      // Peek at what it's about to do (it costs microseconds) to pick a natural pause.
      const who = R.awaiting(d.game).map((a) => this.player(a.id)).find((p) => this.botControls(p));
      const move = chooseMove(d.game, who.id, who.bot ? who.level : "normal");
      d.botAt = Math.max(Date.now() + this.ms(thinkTime(move)), (d.dealtUntil || 0) + this.ms(thinkTime(move)));
    }
  }

  async botMove() {
    const d = this.data;
    d.botAt = null;
    const g = d.game;
    const who = R.awaiting(g).map((a) => this.player(a.id)).find((p) => this.botControls(p));
    if (!who) return;
    const level = who.bot ? who.level : "normal";
    const move = chooseMove(g, who.id, level);
    const before = this.snapshot();
    const events = move ? R.act(g, who.id, move) : R.timeout(g);
    await this.afterChange(events, before);
  }

  // ---------------------------------------------------------------- telling people

  publicRoom() {
    const d = this.data;
    const g = d.game;
    return {
      code: d.code, status: d.status, leader: d.leader, settings: d.settings,
      players: d.players.filter((p) => !p.gone).map((p) => ({
        id: p.id, name: p.name, bot: !!p.bot, takeover: p.takeover || null, connected: !!p.connected,
        muted: !!p.muted, leader: p.id === d.leader, level: p.bot ? p.level : undefined, pic: p.bot ? null : p.pic || null,
        seated: !!(g && g.players.some((x) => x.id === p.id)),
      })),
      results: d.results,
    };
  }

  sendRoom(ws, p) { this.send(ws, { t: "room", room: this.publicRoom(), you: p.id }); }

  broadcastRoom() {
    const room = this.publicRoom();
    for (const p of this.humans()) this.sendTo(p.id, { t: "room", room, you: p.id });
  }

  clockFor() {
    const d = this.data;
    if (!d.clock) return null;
    return { deadline: d.clock.deadline, now: Date.now(), turnSeconds: d.settings.turnSeconds, discards: d.discardAt };
  }

  sendState(p, events) {
    const g = this.data.game;
    if (!g || !g.players.some((x) => x.id === p.id)) {
      // Not seated (joined to watch, or the leader in an AI-only rematch): a
      // spectator's view shows no hand at all.
      if (g) this.sendTo(p.id, { t: "state", view: R.view(g, "__spectator__"), events, clock: this.clockFor() });
      return;
    }
    // The moves the rules allow this player right now, so the screen offers
    // exactly those and never has to guess.
    const moves = p.takeover || g.phase === "over" ? [] : R.legalMoves(g, p.id);
    this.sendTo(p.id, { t: "state", view: R.view(g, p.id), events, clock: this.clockFor(), moves });
  }

  broadcastState(events) {
    for (const p of this.humans()) if (p.connected) this.sendState(p, events);
  }

  post(msg) {
    const d = this.data;
    d.chat.push(msg);
    if (d.chat.length > CHAT_KEEP) d.chat.splice(0, d.chat.length - CHAT_KEEP);
    for (const p of this.humans()) this.sendTo(p.id, { t: "chat", msg });
  }

  dir() { return this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName("players")); }

  async sendDirectory(ws) { this.send(ws, { t: "directory", profiles: await this.dir().list() }); }

  /** Out of the room, and out of the game if they're in one. */
  async kick(q, reason, line = null) {
    const d = this.data;
    if (!q.bot) q.kicked = true;
    q.gone = true;
    for (const s of this.socketsOf(q.id)) this.bye(s, reason);
    const seated = d.game && d.status === "playing" && d.game.players.some((x) => x.id === q.id);
    this.system(line || (seated ? `${q.name} was shown the door. Their cards went to the discard pile.` : `${q.name} was shown the door.`));
    if (seated) {
      // Out of the game itself, not just handed to a robot.
      const before = this.snapshot();
      const events = R.removePlayer(d.game, q.id);
      this.broadcastRoom();
      await this.afterChange(events, before);
    } else {
      this.broadcastRoom();
    }
  }

  /** Close the room: everyone is told, everything is deleted, the code is free. */
  async close(reason) {
    for (const ws of this.ctx.getWebSockets()) this.bye(ws, reason);
    this.data = null;
    await this.ctx.storage.deleteAll();
  }

  system(text) { this.post({ id: token().slice(0, 10), pid: null, name: null, text, system: true, at: Date.now() }); }

  // ---------------------------------------------------------------- the alarm

  async schedule() {
    const d = this.data;
    if (!d) return;
    const times = [...Object.values(d.graceAt), ...Object.values(d.discardAt)];
    if (d.status === "playing" && d.clock) times.push(d.clock.deadline);
    if (d.botAt) times.push(d.botAt);
    if (d.emptySince) times.push(d.emptySince + this.ms(EMPTY_ROOM));
    if (!times.length) return this.ctx.storage.deleteAlarm();
    await this.ctx.storage.setAlarm(Math.min(...times));
  }

  async alarm() {
    const d = this.data;
    if (!d) return;
    const now = Date.now() + 5; // a few ms of slack

    if (d.emptySince && now >= d.emptySince + this.ms(EMPTY_ROOM) && !this.humans().some((p) => p.connected)) {
      await this.close("This room closed after an hour of silence.");
      return;
    }

    for (const [pid, at] of Object.entries(d.graceAt)) {
      if (now < at) continue;
      delete d.graceAt[pid];
      const p = this.player(pid);
      if (!p || p.connected) continue;
      if (d.status === "lobby") {
        if (pid !== d.leader) { p.gone = true; this.system(`${p.name} wandered off.`); }
      } else if (d.status === "playing" && !p.takeover) {
        p.takeover = "disconnect";
        this.system(`${p.name} vanished. A robot is filling in. It's doing its best.`);
      }
      this.broadcastRoom();
    }

    if (d.status === "playing") {
      const g = d.game;
      for (const [pid, at] of Object.entries(d.discardAt)) {
        if (now >= at) { const events = R.autoDiscard(g, pid); delete d.discardAt[pid]; await this.afterChange(events, null); }
      }
      if (d.botAt && now >= d.botAt) await this.botMove();
      if (d.status === "playing" && d.clock && now >= d.clock.deadline) {
        const before = this.snapshot();
        if (g.phase === "play") {
          const p = this.player(R.active(g).id);
          if (p && !this.botControls(p) && ++p.timeouts >= IDLE_STRIKES) {
            p.takeover = "idle";
            this.system(`${p.name} has gone AFK. Robot activated.`);
            this.broadcastRoom();
          }
        }
        const events = R.timeout(g);
        await this.afterChange(events, before);
      }
    }
    await this.save();
  }
}
