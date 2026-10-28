// Player Statistics (Phase 6C): one name's profile, full screen. Your own
// (lobby and menu), anyone's at your table (their full-screen view), and
// for the leader anyone who has ever played (from Players & bans).
//
// The numbers come from the server ({ t: "stats", name }), which decides
// who may see what. The fun extras (favorite color, nemesis, …) are worked
// out here from the counts.

import { h } from "./sheets.js";
import { avatar } from "./table.js";
import { sound } from "./fx.js";
import { COLORS } from "../engine/deck.js";
import { top } from "../engine/stats.js";
import { setPicOf, viewable } from "./pictures.js";
import { nameKey as key } from "./util.js";

let ctx = null;
/** ctx: { overlay(key, el), closeOverlay(), overlayKey(), send(msg), me() -> player, leader() -> bool, toast(text, opts), openPicker(opts) } */
export function initProfile(c) { ctx = c; }

const GAMES = { dealbreaker: "Deal Breaker" };

let pv = null; // { name, back, profile (undefined while loading, null if none), error, confirm, root }

/** back: where "← Back" goes (e.g. the player's view, or Players & bans); none for your own. */
/** closable: false when it must be left by "← Back" (the game-over screen has the Rematch button). */
export function openProfile(name, { back = null, backLabel = "Back", closable = true } = {}) {
  pv = { name, back, backLabel, profile: undefined, error: null, confirm: null, root: h("div", { class: "prof" }) };
  ctx.overlay("profile", pv.root, { closable });
  draw();
  ctx.send({ t: "stats", name });
}

const open = () => pv && ctx.overlayKey() === "profile";

/** The server's answer. */
export function stats(m) {
  if (!open() || key(m.name) !== key(pv.name)) return;
  const first = pv.profile === undefined;
  if (m.profile) setPicOf(m.profile.name, m.profile.pic);
  pv.profile = m.profile;
  pv.confirm = null;
  draw(!first);
}

/** A refusal while loading (not someone in your room). Returns true if it was ours. */
export function profileError(text) {
  if (!open() || pv.profile !== undefined) return false;
  pv.error = text;
  draw();
  return true;
}

/** After a leader action: the profile again, or (deleted) back where we came from. */
export function afterDirectory() {
  if (!open() || !pv.pending) return;
  const done = pv.pending;
  pv.pending = null;
  if (done === "deleteProfile") {
    ctx.toast(`${pv.name} is gone. Their wins, their losses, their shame — all gone.`);
    if (pv.back) pv.back(); else ctx.closeOverlay();
    return;
  }
  if (done === "resetStats") ctx.toast(`${pv.name}'s stats have been wiped. A fresh start. A clean conscience.`);
  if (done === "removeLock") ctx.toast(`${pv.name}'s lock has been removed. Choose a better PIN this time.`);
  if (done === "resetPicture") { setPicOf(pv.name, null); ctx.toast(`${pv.name}'s picture is gone. Back to the initial.`); }
  ctx.send({ t: "stats", name: pv.name });
}

// ------------------------------------------------------------------ helpers

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
function duration(ms) {
  const m = Math.round((ms || 0) / 60000);
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  const hrs = Math.floor(m / 60);
  return m % 60 ? `${hrs}h ${m % 60}m` : `${hrs} h`;
}
const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 3600) return s < 120 ? "just now" : `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : d < 30 ? `${d} days ago` : new Date(t).toLocaleDateString();
};

/** A number that counts up to its value when it appears (instantly with reduced motion). */
function counter(n, fmt = (x) => String(x)) {
  const el = h("b", { class: "prof__n" }, fmt(0));
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still || !n) { el.textContent = fmt(n); return el; }
  const start = performance.now() + 120, ms = Math.min(1100, 500 + n * 20);
  const step = (t) => {
    const k = Math.min(1, Math.max(0, (t - start) / ms));
    el.textContent = fmt(Math.round(n * (1 - (1 - k) ** 3)));
    if (k < 1 && el.isConnected !== false) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return el;
}

const card = (icon, n, label, { fmt, tone = "", note } = {}) => h("div", { class: "prof__card" + (tone ? " is-" + tone : "") },
  h("span", { class: "prof__icon", "aria-hidden": "true" }, icon), counter(n, fmt), h("span", { class: "prof__label" }, label),
  note ? h("span", { class: "prof__note" }, note) : null);

// ------------------------------------------------------------------ drawing

/** quiet: after an action, without replaying the entrance. */
function draw(quiet = false) {
  const v = pv;
  const p = v.profile;
  const me = ctx.me();
  const isMe = me && key(me.name) === key(v.name);
  const leader = ctx.leader();

  const top_ = h("div", { class: "prof__top" },
    v.back ? h("button", { class: "btn btn--quiet prof__back", type: "button", "data-back": true, onclick: () => { v.back(); } }, h("span", {}, `← ${v.backLabel}`)) : null);
  const hero = h("div", { class: "prof__hero" },
    h("div", { class: "prof__ring" }, viewable(avatar(v.name, { online: false, animate: true }), v.name),
      // Your own: tap the picture to change it.
      isMe ? h("button", { class: "prof__edit", type: "button", title: "Change my picture", "aria-label": "Change my picture",
        onclick: () => ctx.openPicker({ back: () => openProfile(v.name, { back: v.back, backLabel: v.backLabel }), backLabel: "My stats" }) }, "✏️") : null),
    h("div", {},
      h("p", { class: "kicker" }, "Player Statistics"),
      h("h2", { class: "prof__name" }, p?.name || v.name,
        isMe ? h("span", { class: "dirv__badge is-you" }, "You") : null,
        p?.locked ? h("span", { class: "dirv__badge" }, "🔒 Locked") : null),
      p ? h("p", { class: "prof__meta" }, `First seen ${new Date(p.first).toLocaleDateString()} · last seen ${ago(p.last)} · ${p.rooms} room${p.rooms === 1 ? "" : "s"}`) : null,
      leader && !isMe && p?.locked ? h("p", { class: "prof__meta prof__boss" }, "🔓 Lock? What lock? You're the boss.") : null));

  let body;
  if (v.error) body = h("div", { class: "prof__empty" }, h("span", { class: "prof__emoji" }, "🙈"), v.error);
  else if (v.profile === undefined) body = h("div", { class: "prof__empty" }, h("div", { class: "spinner" }), "Pulling the records…");
  else if (!p || !p.stats?.overall?.games) body = h("div", { class: "prof__empty" }, h("span", { class: "prof__emoji" }, "🃏"),
    p ? "No games yet. A blank slate. A mystery. A legend in the making (maybe)." : "Nobody by that name. Yet.");
  else body = h("div", { class: "prof__body" }, overall(p.stats), ...Object.keys(GAMES).filter((g) => p.stats[g]?.games).map((g) => gameSection(g, p.stats[g])));

  v.root.classList.toggle("is-quiet", quiet);
  const tools = leader && p && (p.pic || p.stats?.overall?.games || p.locked || !isMe);
  // (replaceChildren would print a null as the word "null", so the gaps are dropped.)
  v.root.replaceChildren(...[top_, hero, body, tools ? leaderTools(p, isMe) : null].filter(Boolean));
}

function overall(s) {
  const o = s.overall;
  const fav = top(o.byGame);
  return h("section", { class: "prof__section" },
    h("p", { class: "prof__label-row" }, "Overall", fav && Object.keys(o.byGame).length > 1 ? h("span", {}, `Favorite game: ${GAMES[fav.key] || fav.key}`) : null),
    h("div", { class: "prof__grid prof__grid--overall" },
      card("🎲", o.games, o.games === 1 ? "game" : "games"),
      card("🏆", o.wins, o.wins === 1 ? "win" : "wins", { tone: "gold" }),
      card("📈", pct(o.wins, o.games), "win rate", { fmt: (x) => x + "%" }),
      card("🏃", o.dnf, "DNFs", { tone: o.dnf ? "warn" : "" }),
      card("⏱", Math.round(o.ms / 60000), "played", { fmt: (x) => duration(x * 60000) })));
}

function gameSection(game, g) {
  const a = g.actions || {};
  const lines = quips(g);
  const max = Math.max(1, ...g.positions);
  const places = Math.max(5, g.positions.length);
  const color = top(g.colors), nemesis = top(g.stolenBy), victim = top(g.stoleFrom);
  const extra = (icon, label, value, sub) => h("div", { class: "prof__extra" }, h("span", { class: "prof__icon" }, icon),
    h("div", {}, h("span", { class: "prof__label" }, label), h("b", {}, value), sub ? h("span", { class: "prof__note" }, sub) : null));

  return h("section", { class: "prof__section" },
    h("p", { class: "prof__label-row" }, GAMES[game] || game, h("span", {}, `${g.games} game${g.games === 1 ? "" : "s"} · ${pct(g.wins, g.games)}% won`)),
    lines.length ? h("div", { class: "prof__quips" }, ...lines.map((t) => h("p", {}, t))) : null,

    h("div", { class: "prof__split" },
      h("div", { class: "prof__panel" },
        h("p", { class: "prof__panel-title" }, "Finishes"),
        h("div", { class: "prof__bars" }, ...Array.from({ length: places }, (_, i) => {
          const n = g.positions[i] || 0;
          return h("div", { class: "prof__bar" + (i < 3 ? ` is-p${i + 1}` : "") },
            h("span", { class: "prof__bar-label" }, ordinal(i + 1)),
            h("span", { class: "prof__bar-track" }, h("span", { class: "prof__bar-fill", style: { "--w": (n / max) * 100 + "%", animationDelay: 150 + i * 70 + "ms" } })),
            h("b", { class: "prof__bar-n" }, n));
        }), g.dnf ? h("div", { class: "prof__bar is-dnf" },
          h("span", { class: "prof__bar-label" }, "DNF"),
          h("span", { class: "prof__bar-track" }, h("span", { class: "prof__bar-fill", style: { "--w": (g.dnf / Math.max(max, g.dnf)) * 100 + "%", animationDelay: 150 + places * 70 + "ms" } })),
          h("b", { class: "prof__bar-n" }, g.dnf)) : null)),
      h("div", { class: "prof__panel prof__extras" },
        extra("🔥", "Win streak", `${g.streak} now · best ${g.bestStreak}`),
        extra("🎨", "Favorite color", color ? (COLORS[color.key]?.name || color.key) : "Still deciding",
          color ? `${color.n} set${color.n === 1 ? "" : "s"} completed` : null),
        extra("😈", "Nemesis", nemesis ? nemesis.key : "Nobody (yet)", nemesis ? `Stole from you ${nemesis.n}×. They know what they did.` : null),
        extra("🎯", "Favorite victim", victim ? victim.key : "Nobody (yet)", victim ? `You stole from them ${victim.n}×. Maybe apologize?` : null))),

    h("div", { class: "prof__grid" },
      card("💥", a["deal-breaker"] || 0, "Deal Breakers", { tone: "brand" }),
      card("✋", a["just-say-no"] || 0, "Just Say Nos"),
      card("🕵️", a["sly-deal"] || 0, "Sly Deals"),
      card("🔄", a["forced-deal"] || 0, "Forced Deals"),
      card("💼", a["debt-collector"] || 0, "Debt Collectors"),
      card("🎂", a.birthday || 0, "Birthdays"),
      card("🏠", g.rentCollected || 0, "rent collected", { fmt: (x) => x + "M", tone: "good" }),
      card("💸", g.rentPaid || 0, "rent paid", { fmt: (x) => x + "M", tone: "warn" }),
      card("👑", g.maxRent || 0, "biggest rent", { fmt: (x) => x + "M", tone: "gold" }),
      card("🏦", g.banked || 0, "cash banked", { fmt: (x) => x + "M" }),
      card("🧩", g.sets || 0, "sets completed"),
      card("⏱", Math.round((g.ms || 0) / 60000), "played", { fmt: (x) => duration(x * 60000) })),

    g.recent?.length ? h("div", { class: "prof__recent" },
      h("p", { class: "prof__panel-title" }, "Recent games"),
      h("div", { class: "prof__chips" }, ...g.recent.slice(0, 10).map((r) => h("span", { class: "prof__chip" + (r.won ? " is-won" : r.dnf ? " is-dnf" : "") },
        r.won ? "🏆 Won" : r.dnf ? "DNF" : `${ordinal(r.position)} of ${r.players}`,
        h("small", {}, `${duration(r.ms)} · ${ago(r.at)}`))))) : null);
}

/** The lines from COPY.md that fit this profile. */
function quips(g) {
  const out = [];
  const rate = pct(g.wins, g.games);
  if (!g.wins) out.push("Wins: 0. But who's counting? (The server. The server is counting.)");
  else if (rate > 50 && g.games >= 3) out.push(`Win rate ${rate}%. Your friends should stop inviting you.`);
  if (!g.actions?.["deal-breaker"]) out.push("Never used a Deal Breaker. Too pure for this world.");
  if (g.dnf >= 3) out.push(`DNFs: ${g.dnf}. Commitment issues?`);
  return out.slice(0, 2);
}

/** The leader's buttons for this profile, each asking "sure?" in place. */
function leaderTools(p, isMe) {
  const v = pv;
  const ASK = { resetPicture: "Remove {n}'s picture?", resetStats: "Wipe all of {n}'s stats?", removeLock: "Remove {n}'s lock?", deleteProfile: "Delete {n} forever? Their wins, their losses, their shame — all gone." };
  const YES = { resetPicture: "is-bad", resetStats: "is-bad", removeLock: "is-gold", deleteProfile: "is-bad" };
  const wrap = h("div", { class: "prof__tools" + (v.confirm ? " is-confirming" : "") });
  const set = (c) => { v.confirm = c; wrap.replaceWith(leaderTools(p, isMe)); };
  const act = (action, label, cls) => h("button", { class: "dirv__act " + cls, type: "button", onclick: () => set(action) }, label);
  if (v.confirm) {
    wrap.append(h("span", { class: "dirv__ask" }, ASK[v.confirm].replace("{n}", p.name)),
      h("button", { class: "dirv__act is-plain", type: "button", onclick: () => set(null) }, "No"),
      h("button", { class: "dirv__act is-yes " + YES[v.confirm], type: "button", onclick: (e) => {
        e.currentTarget.disabled = true; e.currentTarget.textContent = "…";
        v.pending = v.confirm;
        ctx.send({ t: v.confirm, name: p.name });
        sound("swap");
      } }, "Yes"));
  } else {
    wrap.append(h("span", { class: "prof__tools-label" }, "Leader"));
    if (p.pic) wrap.append(act("resetPicture", "Reset picture", "is-bad-soft"));
    if (p.stats?.overall?.games) wrap.append(act("resetStats", "Reset stats", "is-bad-soft"));
    if (p.locked) wrap.append(act("removeLock", "Unlock", "is-gold"));
    if (!isMe) wrap.append(act("deleteProfile", "Delete", "is-bad"));
  }
  return wrap;
}
