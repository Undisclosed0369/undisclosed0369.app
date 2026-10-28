// The player directory: one shared Durable Object for every room. It knows
// every name that has ever played, its optional 4-digit PIN lock, and whether
// it's banned. (Phase 6B adds stats to the same profiles.)
//
// Names are people here: "Mobile" in one room is "Mobile" in every room.
// Anyone can use a free name; a locked one needs its PIN every time it sits
// down in a room (reconnecting to the same seat doesn't ask again). Entering
// it gives that device a pass, which only proves ownership for changing or
// removing the lock. The leader is asked like anyone else, but can never be
// banned.
//
// Secrets: a PIN is never stored, only a keyed hash of it (HMAC-SHA-256
// with a per-name salt and a server-side pepper). Passes are stored hashed
// too. Five wrong PINs in a row lock the name for ten minutes. (The PIN
// travels as `word` in messages, from when it was a 4-letter word.)

import { DurableObject } from "cloudflare:workers";
import { addGame } from "../../../x/7a3797625d3c2330/engine/stats.js";

const MAX_FAILS = 5;
const COOLDOWN = 10 * 60_000;
const MAX_PASSES = 12; // remembered devices per name
// Pictures (Phase 6D+). A profile keeps a small description of its picture;
// photos (and GIFs) live in their own keys: a sharp, cropped still for
// avatars ("thumb") and the original for the full-size view ("full"), both
// under a random version that only rooms and lists hand out.
const PRESET_RE = /^[a-z0-9-]{1,24}$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const RINGS = ["gold", "brand", "rainbow", "fire", "ice", "mint", "rose", "mono"];
const MAX_THUMB = 400_000;     // bytes: 384 × 384, a few dozen KB in practice
const MAX_FULL = 5_000_000;    // bytes: the original photo or GIF
const CHUNK = 1_000_000;       // storage values stay well under their size limit
const IMG_TYPES = ["image/webp", "image/jpeg", "image/png", "image/gif"];
const isEmoji = (e) => typeof e === "string" && e.length <= 24 && /^\p{Extended_Pictographic}/u.test(e) && !/[<>"'&\s]/.test(e);
const num = (x, lo, hi) => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;

/** A picture saved in an older format, in today's. Stored pictures are never
 *  thrown away for their shape: anything that can still be drawn is upgraded
 *  as it is read (the first Phase 6D pictures were { preset: "tycoon" }). */
export const upgradePic = (pic) => {
  if (!pic || typeof pic !== "object") return null;
  if (pic.k) return pic;
  if (typeof pic.preset === "string" && PRESET_RE.test(pic.preset)) return { k: "p", id: pic.preset, ring: null };
  if (isEmoji(pic.emoji)) return { k: "e", e: pic.emoji, c1: HEX_RE.test(pic.c1 || pic.bg || "") ? (pic.c1 || pic.bg) : "#8d42f5", c2: HEX_RE.test(pic.c2 || "") ? pic.c2 : "#e042f5", ring: null };
  return null;
};

/** A picture as rooms and lists see it (no secrets in it, just how to draw it), or null. */
export const publicPic = (p) => { const pic = upgradePic(p?.pic); return pic ? { ...pic } : null; };
const PIN_RE = /^[0-9]{4}$/;

export const nameKey = (name) => String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
// NFKC turns full-width digits (some keyboards type those) into plain ones.
const normWord = (w) => String(w || "").normalize("NFKC").replace(/\s+/g, "");
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const random = (n = 16) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const sha = async (text) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export class Directory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.scale = Number(env.TIME_SCALE || 1);
    this.pepper = env.NAME_PEPPER || env.LEADER_CODE || "deal-breaker";
  }

  // ---------------------------------------------------------------- storage

  async get(name) {
    const p = (await this.ctx.storage.get("p:" + nameKey(name))) || null;
    if (p?.pic && !p.pic.k) p.pic = upgradePic(p.pic) || p.pic; // saved as-is by the next put()
    return p;
  }
  async put(p) { await this.ctx.storage.put("p:" + p.key, p); }

  /** The profile for a name, created on first sight. */
  async ensure(name) {
    const p = await this.get(name);
    if (p) return p;
    const now = Date.now();
    return { key: nameKey(name), name, first: now, last: now, rooms: 0, lastRoom: null, lock: null, passes: [], fails: 0, cooldownUntil: 0, banned: null, stats: {}, pic: null };
  }

  hashWord(p, word) { return hmac(this.pepper, `${p.key}:${p.lock.salt}:${normWord(word)}`); }

  async checkPass(p, pass) {
    if (!pass || !p.passes?.length) return false;
    const h = await sha(pass);
    return p.passes.some((x) => same(x, h));
  }

  async newPass(p) {
    const pass = random();
    p.passes = [...(p.passes || []), await sha(pass)].slice(-MAX_PASSES);
    return pass;
  }

  /** Check a word, counting wrong ones. Returns { ok } or an error code. */
  async tryWord(p, word) {
    const now = Date.now();
    if (p.cooldownUntil > now) return { ok: false, code: "cooldown", minutes: Math.ceil((p.cooldownUntil - now) / 60_000 / this.scale) || 1 };
    if (same(await this.hashWord(p, word), p.lock.hash)) { p.fails = 0; return { ok: true }; }
    p.fails = (p.fails || 0) + 1;
    if (p.fails >= MAX_FAILS) {
      p.fails = 0;
      p.cooldownUntil = now + Math.round(COOLDOWN * this.scale);
      return { ok: false, code: "cooldown", minutes: 10 };
    }
    return { ok: false, code: "word", left: MAX_FAILS - p.fails };
  }

  // ---------------------------------------------------------------- joining

  /**
   * May this name join? { name, word?, leader? } (a device pass doesn't count
   * here; the leader is never turned away as banned, but still needs the PIN) ->
   *   { ok: true, pass? }  or  { ok: false, code: "banned" | "needWord" | "word" | "cooldown", left?, minutes? }
   */
  async gate({ name, word, leader = false }) {
    const p = await this.ensure(name);
    if (p.banned && !leader) return { ok: false, code: "banned" };
    if (!p.lock) return { ok: true };
    if (!word) return { ok: false, code: "needWord" };
    const r = await this.tryWord(p, word);
    if (!r.ok) { await this.put(p); return r; }
    const fresh = await this.newPass(p);
    await this.put(p);
    return { ok: true, pass: fresh };
  }

  /** Someone with this name just sat down in a room. */
  async seen(name, room) {
    const p = await this.ensure(name);
    p.name = name; // keep the latest spelling
    p.last = Date.now();
    if (room && room !== p.lastRoom) { p.rooms = (p.rooms || 0) + 1; p.lastRoom = room; }
    await this.put(p);
    return { locked: !!p.lock, pic: publicPic(p) };
  }

  async status(name) {
    const p = await this.get(name);
    return { locked: !!p?.lock, banned: !!p?.banned };
  }

  // ---------------------------------------------------------------- locking your own name

  /**
   * Set or change the word. Changing needs proof it's yours: this device's
   * pass, the old word, or being the leader.
   */
  async lock({ name, word, oldWord, pass, leader = false }) {
    if (!PIN_RE.test(normWord(word))) return { ok: false, code: "format" };
    const p = await this.ensure(name);
    if (p.lock && !leader && !(await this.checkPass(p, pass))) {
      if (!oldWord) return { ok: false, code: "needWord" };
      const r = await this.tryWord(p, oldWord);
      if (!r.ok) { await this.put(p); return r; }
    }
    p.lock = { salt: random(8), hash: "", at: Date.now() };
    p.lock.hash = await this.hashWord(p, word);
    p.passes = [];      // every other device has to learn the new word
    p.fails = 0;
    const fresh = await this.newPass(p);
    await this.put(p);
    return { ok: true, pass: fresh };
  }

  async unlock({ name, word, pass, leader = false }) {
    const p = await this.get(name);
    if (!p?.lock) return { ok: true };
    if (!leader && !(await this.checkPass(p, pass))) {
      if (!word) return { ok: false, code: "needWord" };
      const r = await this.tryWord(p, word);
      if (!r.ok) { await this.put(p); return r; }
    }
    p.lock = null;
    p.passes = [];
    p.fails = 0;
    p.cooldownUntil = 0;
    await this.put(p);
    return { ok: true };
  }

  // ---------------------------------------------------------------- statistics (Phase 6B)

  /**
   * A finished game: [{ name, game, record }] for every human at the table,
   * added into their profiles and saved together in one write.
   */
  async record(entries) {
    const out = {};
    for (const { name, game, record } of entries) {
      const p = out["p:" + nameKey(name)] || await this.ensure(name);
      p.stats = addGame(p.stats, game, record);
      out["p:" + p.key] = p;
    }
    await this.ctx.storage.put(out);
    return { ok: true };
  }

  /** Just the stats of one name (for the screens in 6C). */
  async stats(name) {
    const p = await this.get(name);
    return p ? { name: p.name, key: p.key, locked: !!p.lock, first: p.first, last: p.last, rooms: p.rooms || 0, stats: p.stats || {}, pic: publicPic(p) } : null;
  }

  // ---------------------------------------------------------------- pictures (Phase 6D+)

  /**
   * Set (or, with null, remove) a name's picture, except a new photo (see
   * setPhoto):
   *   { k: "p", id, ring? }                 a built-in
   *   { k: "e", e: "😎", c1, c2, ring? }     any emoji on a gradient
   *   { k: "f", v, ring? }                  the photo they already have, with a new ring
   */
  async setPic(name, pic) {
    const p = await this.ensure(name);
    const cur = p.pic?.k ? p.pic : null;
    const ring = pic?.ring == null || pic.ring === "" ? null : pic.ring;
    if (ring !== null && !RINGS.includes(ring)) return { ok: false, code: "picture" };
    let next = null;
    if (pic && pic.k === "p" && PRESET_RE.test(pic.id || "")) next = { k: "p", id: pic.id };
    else if (pic && pic.k === "e" && isEmoji(pic.e) && HEX_RE.test(pic.c1 || "") && HEX_RE.test(pic.c2 || "")) next = { k: "e", e: pic.e, c1: pic.c1, c2: pic.c2 };
    else if (pic && pic.k === "f" && cur?.k === "f" && pic.v === cur.v) next = { ...cur };
    else if (pic) return { ok: false, code: "picture" };
    if (next) next.ring = ring;
    if (cur?.k === "f" && next?.v !== cur.v) await this.dropImage(cur.v);
    p.pic = next;
    await this.put(p);
    return { ok: true, pic: publicPic(p) };
  }

  /**
   * A new photo or GIF, cropped on the device:
   *   { thumb: base64, full: base64, type, gif, w, h, fx, fy, s, ring? }
   * thumb is the 384 px circle crop (a still, even for a GIF); full is the
   * original. w × h is the original's size; fx, fy, s place it in the circle
   * (so a GIF can play cropped the same way).
   */
  async setPhoto(name, b) {
    const bad = { ok: false, code: "picture" };
    if (!b || !IMG_TYPES.includes(b.type) || typeof b.thumb !== "string" || typeof b.full !== "string") return bad;
    if (!num(b.w, 1, 20000) || !num(b.h, 1, 20000) || !num(b.fx, -10, 10) || !num(b.fy, -10, 10) || !num(b.s, 1, 8)) return bad;
    const ring = b.ring == null || b.ring === "" ? null : b.ring;
    if (ring !== null && !RINGS.includes(ring)) return bad;
    let thumb, full;
    try { thumb = fromB64(b.thumb); full = fromB64(b.full); } catch { return bad; }
    if (thumb.byteLength > MAX_THUMB) return bad;
    if (full.byteLength > MAX_FULL) return { ok: false, code: "pictureSize" };
    const v = random(8);
    const parts = Math.ceil(full.byteLength / CHUNK);
    const put = { ["img:" + v]: { type: b.type, thumbType: b.thumbType && IMG_TYPES.includes(b.thumbType) ? b.thumbType : "image/jpeg", parts, size: full.byteLength },
      ["img:" + v + ":t"]: thumb };
    for (let i = 0; i < parts; i++) put[`img:${v}:f:${i}`] = full.slice(i * CHUNK, (i + 1) * CHUNK);
    await this.ctx.storage.put(put);
    const p = await this.ensure(name);
    if (p.pic?.k === "f") await this.dropImage(p.pic.v);
    p.pic = { k: "f", v, gif: b.type === "image/gif", w: Math.round(b.w), h: Math.round(b.h), fx: b.fx, fy: b.fy, s: b.s, ring };
    await this.put(p);
    return { ok: true, pic: publicPic(p) };
  }

  /** A photo's bytes by version: which is "t" (the avatar still) or "f" (the original). */
  async image(v, which) {
    const meta = await this.ctx.storage.get("img:" + v);
    if (!meta) return null;
    if (which === "t") return { type: meta.thumbType, bytes: await this.ctx.storage.get(`img:${v}:t`) };
    const parts = await this.ctx.storage.get(Array.from({ length: meta.parts }, (_, i) => `img:${v}:f:${i}`));
    const bytes = new Uint8Array(meta.size);
    let at = 0;
    for (let i = 0; i < meta.parts; i++) { const c = new Uint8Array(parts.get(`img:${v}:f:${i}`)); bytes.set(c, at); at += c.byteLength; }
    return { type: meta.type, bytes };
  }

  async dropImage(v) {
    const meta = await this.ctx.storage.get("img:" + v);
    if (!meta) return;
    await this.ctx.storage.delete(["img:" + v, `img:${v}:t`, ...Array.from({ length: meta.parts }, (_, i) => `img:${v}:f:${i}`)]);
  }


  // ---------------------------------------------------------------- the leader's tools

  /** Everyone, without secrets, newest first. */
  async list() {
    const all = await this.ctx.storage.list({ prefix: "p:" });
    return [...all.values()].map((p) => ({
      name: p.name, key: p.key, first: p.first, last: p.last, rooms: p.rooms || 0, lastRoom: p.lastRoom,
      locked: !!p.lock, banned: p.banned, stats: p.stats || {}, pic: publicPic(p),
    })).sort((a, b) => b.last - a.last);
  }

  async ban(name, { by = "leader", room = null, reason = "" } = {}) {
    const p = await this.ensure(name);
    p.banned = { at: Date.now(), by, room, reason: String(reason || "").slice(0, 120) };
    await this.put(p);
    return { ok: true };
  }

  async unban(name) {
    const p = await this.get(name);
    if (p) { p.banned = null; await this.put(p); }
    return { ok: true };
  }

  async removeLock(name) { return this.unlock({ name, leader: true }); }

  /** Typos and pranks: wipe a name's stats, keeping the profile (and its lock). */
  async resetStats(name) {
    const p = await this.get(name);
    if (p) { p.stats = {}; await this.put(p); }
    return { ok: true };
  }

  async remove(name) {
    const p = await this.get(name);
    if (p?.pic?.k === "f") await this.dropImage(p.pic.v);
    await this.ctx.storage.delete("p:" + nameKey(name));
    return { ok: true };
  }
}
