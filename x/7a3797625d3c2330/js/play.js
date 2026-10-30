// Playing cards: what a tap on a card offers, the choices that follow
// (targets, sets, colors), and the prompts the game raises on its own —
// answer an attack, pay a debt, discard down to seven.
//
// Every option comes from the moves the server says are legal, so nothing
// here can offer something the rules don't allow.

import { COLORS } from "../engine/deck.js";
import { DEF, setSize, isComplete, rentFor, autoPayment } from "../engine/rules.js";
import { h, cardEl, sheet, closeSheet, option, openSheetKey, keycap } from "./sheets.js";
import { defOf, valueOf, bankTotal, avatar, setCardEl } from "./table.js";

let G;
/** G: { me, view, moves, room, send(action) } — kept current by app.js. */
export function bind(g) { G = g; }

const nameOf = (pid) => G.view.players.find((p) => p.id === pid)?.name || "Someone";
const colorName = (k) => COLORS[k].name;
const meP = () => G.view.players.find((p) => p.id === G.me);
const setById = (pid, id) => G.view.players.find((p) => p.id === pid)?.sets.find((s) => s.id === id);
const ownerOfCard = (card) => G.view.players.find((p) => p.sets.some((s) => s.cards.includes(card)));
const setOfCard = (card) => G.view.players.flatMap((p) => p.sets).find((s) => s.cards.includes(card));
/** A card as it lies on the table: wilds turned to the color they're used as. */
const tableCard = (card) => setCardEl(G.view, card, setOfCard(card)?.color);

function play(action) {
  closeSheet();
  G.send(action);
}

const back = (fn) => option({ label: "Back", quiet: true, onClick: fn });

// ------------------------------------------------------------------ looking

export function showCard(card) {
  const d = defOf(G.view, card);
  sheet({ center: true, title: d.name || (d.type === "money" ? `${d.value}M` : d.type === "wild" ? "Wild property" : "Rent"),
    sub: d.value ? `Worth ${d.value}M` : "No money value", body: h("div", { class: "big-card" }, cardEl(null, d.id, { big: true })) });
}

/** `extra`: anything to add under their table (the leader's player options). */
export function showOpponent(pid, extra = null) {
  const p = G.view.players.find((x) => x.id === pid);
  const groups = p.sets.map((s) => h("div", { class: "sgroup" },
    h("p", { class: "sgroup__label" }, h("span", { class: "option__swatch", style: { background: COLORS[s.color].hex, width: ".8rem", height: ".8rem" } }),
      `${colorName(s.color)} · ${Math.min(s.cards.length, setSize(s.color))}/${setSize(s.color)}`, isComplete(s) ? " · complete" : ""),
    h("div", { class: "picks" }, ...[...s.cards, s.house, s.hotel].filter(Boolean).map((c) =>
      h("button", { class: "pick", type: "button", onclick: () => showCard(c) }, setCardEl(G.view, c, s.color))))));
  const bank = p.bank.length ? h("div", { class: "sgroup" }, h("p", { class: "sgroup__label" }, `Bank · ${bankTotal(G.view, p)}M`),
    h("div", { class: "picks" }, ...p.bank.map((c) => h("button", { class: "pick", type: "button", onclick: () => showCard(c) }, cardEl(null, G.view.cards[c]))))) : null;
  sheet({ title: p.name, sub: `${p.hand} card${p.hand === 1 ? "" : "s"} in hand · Bank ${bankTotal(G.view, p)}M`,
    card: avatar(p.name), body: h("div", {}, ...(groups.length || bank ? [...groups, bank] : [h("p", { class: "sheet__sub" }, "Nothing on the table yet. Suspiciously quiet.")]),
      extra ? h("div", { class: "options", style: { marginTop: "1rem" } }, extra) : null) });
}

export function showBank() {
  const p = meP();
  if (!p.bank.length) return sheet({ title: "Your bank", sub: "Empty. Like a politician's promise.", body: h("div") });
  sheet({ title: "Your bank", sub: `${bankTotal(G.view, p)}M across ${p.bank.length} card${p.bank.length === 1 ? "" : "s"}`,
    body: h("div", { class: "picks" }, ...p.bank.map((c) => h("button", { class: "pick", type: "button", onclick: () => showCard(c) }, cardEl(null, G.view.cards[c])))) });
}

// ------------------------------------------------------------------ your cards

export function handCard(card, only = null) {
  const d = defOf(G.view, card);
  const moves = only || G.moves.filter((m) => m.card === card && m.type !== "move" && m.type !== "discard");
  if (!moves.length) return showCard(card);

  const opts = [];
  const props = moves.filter((m) => m.type === "property");
  for (const m of props) {
    const set = meP().sets.find((s) => s.color === m.color && !isComplete(s));
    const have = set ? set.cards.length : 0;
    opts.push(option({ swatch: COLORS[m.color].hex,
      label: props.length === 1 ? "Put it on the table" : `Play as ${colorName(m.color)}`,
      small: `${colorName(m.color)} set: ${have + 1}/${setSize(m.color)}${have + 1 >= setSize(m.color) ? " — complete!" : ""}`,
      onClick: () => play(m) }));
  }

  const first = (type) => moves.find((m) => m.type === type);
  if (first("passGo")) opts.push(option({ icon: "⏭", label: "Pass Go", small: "Draw 2 more cards", onClick: () => play(first("passGo")) }));
  if (first("birthday")) opts.push(option({ icon: "🎂", label: "It's my birthday!", small: "Everyone pays you 2M", onClick: () => play(first("birthday")) }));
  if (first("debt")) opts.push(option({ icon: "💼", label: "Send the debt collector", small: "Pick who pays you 5M", onClick: () => pickPlayer(card, moves.filter((m) => m.type === "debt"), "Who owes you 5M?") }));
  if (first("rent")) opts.push(option({ icon: "💸", label: "Charge rent", small: d.colors.length > 2 ? "One player, any of your sets" : "Everyone pays", onClick: () => rentSteps(card, moves.filter((m) => m.type === "rent")) }));
  if (first("sly")) opts.push(option({ icon: "🕵️", label: "Sly Deal", small: "Steal one property", onClick: () => pickTake(card, moves.filter((m) => m.type === "sly"), "Steal which one?") }));
  if (first("forced")) opts.push(option({ icon: "🔁", label: "Forced Deal", small: "Swap one of yours for one of theirs", onClick: () => pickTake(card, moves.filter((m) => m.type === "forced"), "Take which one?") }));
  if (first("dealBreaker")) opts.push(option({ icon: "💥", label: "Deal Breaker", small: "Take a whole complete set", danger: true, onClick: () => pickSet(card, moves.filter((m) => m.type === "dealBreaker")) }));
  for (const kind of ["house", "hotel"]) {
    const ms = moves.filter((m) => m.type === kind);
    if (ms.length) opts.push(option({ icon: kind === "house" ? "🏠" : "🏨", label: `Build a ${kind}`, small: `+${kind === "house" ? 3 : 4}M rent on a complete set`,
      onClick: () => ms.length === 1 ? play(ms[0]) : pickOwnSet(card, ms, `Put the ${kind} where?`) }));
  }
  if (!only && d.type === "action" && !moves.some((m) => m.type !== "bank") && first("bank")) {
    // An action with nothing to aim at yet: say why, then offer the bank.
    opts.unshift(h("p", { class: "sheet__sub" }, whyNot(d)));
  }
  if (first("bank")) opts.push(option({ icon: "🏦", label: "Put it in the bank", small: `+${d.value}M`, onClick: () => play(first("bank")) }));

  sheet({ key: "card:" + card, title: d.name || (d.type === "money" ? `${d.value}M` : d.type === "wild" ? "Wild property" : "Rent"),
    sub: playsLeft(), card: cardEl(null, d.id), body: h("div", { class: "options" }, ...opts) });
}

function whyNot(d) {
  switch (d.action) {
    case "sly-deal": case "forced-deal": return "Nobody has a property you can take right now.";
    case "deal-breaker": return "Nobody has a complete set. Yet.";
    case "house": case "hotel": return "You need a complete set to build on (not railroads or utilities).";
    case "double-the-rent": return "Play it together with a rent card.";
    default: return "";
  }
}

function playsLeft() {
  const left = 3 - G.view.turn.plays;
  return `${left} play${left === 1 ? "" : "s"} left this turn`;
}

/** Tap a property you already own: move a wild to another color. */
export function setCard(card, only = null) {
  const moves = only || G.moves.filter((m) => m.type === "move" && m.card === card);
  if (!moves.length) return showCard(card);
  const d = defOf(G.view, card);
  sheet({ title: "Move this wild card", sub: "Free — it doesn't use a play.", card: cardEl(null, d.id),
    body: h("div", { class: "options" },
      ...moves.map((m) => option({ swatch: COLORS[m.color].hex, label: `Make it ${colorName(m.color)}`, onClick: () => play(m) })),
      option({ label: "Just looking", quiet: true, onClick: () => closeSheet() })) });
}

// ------------------------------------------------------------------ choosing

function pickPlayer(card, moves, title) {
  const s = sheet({ key: "pick:" + card, title, card: cardEl(null, G.view.cards[card]), body: h("div") });
  s.set(h("div", { class: "options" },
    ...moves.map((m) => {
      const p = G.view.players.find((x) => x.id === m.target);
      return option({ label: p.name, small: `Bank ${bankTotal(G.view, p)}M · ${p.sets.length} set${p.sets.length === 1 ? "" : "s"}`, onClick: () => play(m) });
    }),
    back(() => handCard(card))));
}

function cardPicks(cards, onPick) {
  // Grouped by owner, each a tappable card.
  const byOwner = new Map();
  for (const c of cards) {
    const o = ownerOfCard(c);
    if (!byOwner.has(o.id)) byOwner.set(o.id, []);
    byOwner.get(o.id).push(c);
  }
  return [...byOwner].map(([pid, cs]) => h("div", { class: "sgroup" },
    h("p", { class: "sgroup__label" }, pid === G.me ? "Yours" : nameOf(pid)),
    h("div", { class: "picks" }, ...cs.map((c) => h("button", { class: "pick", type: "button", onclick: () => onPick(c) },
      tableCard(c))))));
}

function pickTake(card, moves, title) {
  const takes = [...new Set(moves.map((m) => m.take))];
  const s = sheet({ key: "take:" + card, title, sub: "Not from a complete set.", card: cardEl(null, G.view.cards[card]), body: h("div") });
  s.set(h("div", {}, ...cardPicks(takes, (take) => {
    const ms = moves.filter((m) => m.take === take);
    if (ms[0].type === "sly") return play(ms[0]);
    pickGive(card, ms, take);
  }), back(() => handCard(card))));
}

function pickGive(card, moves, take) {
  const s = sheet({ key: "give:" + card + take, title: "Give them which one?", sub: `For their ${defOf(G.view, take).name || "property"}.`,
    card: cardEl(null, G.view.cards[take]), body: h("div") });
  s.set(h("div", {}, ...cardPicks(moves.map((m) => m.give), (give) => play(moves.find((m) => m.give === give))),
    back(() => pickTake(card, G.moves.filter((m) => m.card === card && m.type === "forced" && (!take || m.target === moves[0].target)), "Take which one?"))));
}

function pickSet(card, moves) {
  const s = sheet({ key: "set:" + card, title: "Take which set?", sub: "Buildings come with it.", card: cardEl(null, G.view.cards[card]), body: h("div") });
  s.set(h("div", {}, ...moves.map((m) => {
    const set = setById(m.target, m.set);
    return h("div", { class: "sgroup" },
      h("p", { class: "sgroup__label" }, `${nameOf(m.target)} · ${colorName(set.color)}`),
      h("button", { class: "pick", type: "button", style: { display: "flex", gap: ".4rem" }, onclick: () => play(m) },
        ...[...set.cards, set.house, set.hotel].filter(Boolean).map((c) => h("div", { style: { width: "4.4rem" } }, tableCard(c)))));
  }), back(() => handCard(card))));
}

function pickOwnSet(card, moves, title) {
  const s = sheet({ key: "own:" + card, title, card: cardEl(null, G.view.cards[card]), body: h("div") });
  s.set(h("div", { class: "options" }, ...moves.map((m) => {
    const set = setById(G.me, m.set);
    return option({ swatch: COLORS[set.color].hex, label: colorName(set.color), small: `Rent now ${rentFor(G.view, set)}M`, onClick: () => play(m) });
  }), back(() => handCard(card))));
}

function rentSteps(card, moves) {
  const sets = [...new Set(moves.map((m) => m.set))];
  const chooseSet = (setId) => {
    const ms = moves.filter((m) => m.set === setId);
    const base = rentFor(G.view, setById(G.me, setId));
    const levels = [...new Set(ms.map((m) => m.doubles.length))].sort();
    const chooseLevel = (k) => {
      const lm = ms.filter((m) => m.doubles.length === k);
      if (lm[0].target) return pickPlayer(card, lm, `Who pays ${base * 2 ** k}M?`);
      play(lm[0]);
    };
    if (levels.length === 1) return chooseLevel(levels[0]);
    const s = sheet({ key: "dbl:" + card + setId, title: "Double it?", sub: "Each Double the Rent uses a play.", card: cardEl(null, "action-double-the-rent"), body: h("div") });
    s.set(h("div", { class: "options" }, ...levels.map((k) => option({
      icon: ["💸", "✌️", "🔥"][k], label: ["Just the rent", "Double the rent", "Quadruple it"][k], small: `${base * 2 ** k}M${k ? ` · uses ${k + 1} plays` : ""}`,
      onClick: () => chooseLevel(k) })), back(() => rentSteps(card, moves))));
  };
  if (sets.length === 1) return chooseSet(sets[0]);
  const s = sheet({ key: "rent:" + card, title: "Charge rent for which set?", card: cardEl(null, G.view.cards[card]), body: h("div") });
  s.set(h("div", { class: "options" }, ...sets.map((id) => {
    const set = setById(G.me, id);
    return option({ swatch: COLORS[set.color].hex, label: `${colorName(set.color)} — ${rentFor(G.view, set)}M`,
      small: `${Math.min(set.cards.length, setSize(set.color))} of ${setSize(set.color)}${isComplete(set) ? ", complete" : ""}`, onClick: () => chooseSet(id) });
  }), back(() => handCard(card))));
}

// ------------------------------------------------------------------ prompts

const PENDING_CARD = { birthday: "action-birthday", debt: "action-debt-collector", rent: "rent-any",
  sly: "action-sly-deal", forced: "action-forced-deal", dealBreaker: "action-deal-breaker" };

function describe(pd) {
  const by = nameOf(pd.by);
  if (pd.kind === "pay") {
    if (pd.reason === "birthday") return [`It's ${by}'s birthday`, "Everyone pays 2M. No gift receipts."];
    if (pd.reason === "debt") return [`${by} sent the debt collector`, "You owe 5M."];
    return [`${by} wants rent`, pd.doubles ? `You owe ${pd.amount}M. Doubled${pd.doubles > 1 ? " twice" : ""}, naturally.` : `You owe ${pd.amount}M.`];
  }
  if (pd.kind === "sly") return [`${by} is trying a Sly Deal`, `They want your ${defOf(G.view, pd.take)?.name || "wild card"}.`];
  if (pd.kind === "forced") return [`${by} wants to swap`, `Your ${defOf(G.view, pd.take)?.name || "wild card"} for their ${defOf(G.view, pd.give)?.name || "wild card"}.`];
  if (pd.kind === "dealBreaker") {
    const set = G.view.players.flatMap((p) => p.sets).find((s) => s.id === pd.set);
    return [`${by} played a Deal Breaker`, `They want your whole ${set ? colorName(set.color) : ""} set.`];
  }
  return ["Incoming", ""];
}

/** Open (or close) whatever the game needs from you right now. */
export function prompts() {
  const v = G.view;
  if (!v || v.phase === "over") return closePrompt();
  const mine = v.awaiting.filter((a) => a.id === G.me && a.step !== "play");
  const pd = v.pending;
  const no = G.moves.find((m) => m.type === "justSayNo");

  const respond = mine.find((a) => a.step === "respond");
  if (respond) {
    const t = pd.targets.find((x) => x.id === G.me);
    // Keyed on *your* part of the exchange only: other players answering
    // must not close and reopen your prompt (it used to pop up once per player).
    const key = `respond:${v.turn.number}:${pd.by}:${pd.kind}:${pd.reason || ""}:${pd.amount || 0}:${pd.take || pd.set || ""}:${t.nos}`;
    // Already answering it (or choosing what to pay, with the way back still open).
    if (openSheetKey() === key || openSheetKey() === "paypre:" + key) return;
    const [title, sub] = describe(pd);
    const accept = G.moves.find((m) => m.type === "accept");
    const show = pd.kind === "sly" ? pd.take : pd.kind === "forced" ? pd.take : null;
    sheet({ key, modal: true, title: t.nos ? `${nameOf(pd.by)} said no to your no!` : title, sub,
      card: cardEl(null, show ? v.cards[show] : pd.def || PENDING_CARD[pd.reason] || PENDING_CARD[pd.kind]),
      body: h("div", { class: "options" },
        no ? option({ icon: "✋", danger: true, label: "Just Say No", small: "Cancel it. Uses your Just Say No card.", onClick: () => play(no) }) : null,
        accept ? option({ icon: pd.kind === "pay" ? "💳" : "🤝", primary: true, label: pd.kind === "pay" ? "Pay up" : "Fine. Take it.",
          small: pd.kind === "pay" ? "Choose what to hand over" : null,
          // Paying opens the pay sheet first, with a way back to the Just Say No:
          // nothing is decided until you press Pay.
          onClick: () => (pd.kind === "pay" && no ? payPrompt(pd.amount, { preview: key, accept, back: () => { closeSheet(true); prompts(); } }) : play(accept)) }) : null) });
    return;
  }

  const counter = mine.find((a) => a.step === "counter");
  if (counter) {
    const key = `counter:${counter.for}:${pd.targets.find((x) => x.id === counter.for).nos}`;
    if (openSheetKey() === key) return;
    const accept = G.moves.find((m) => m.type === "accept" && m.for === counter.for);
    const back2 = G.moves.find((m) => m.type === "justSayNo" && m.for === counter.for);
    sheet({ key, modal: true, title: `${nameOf(counter.for)} said NO!`, sub: "Got a Just Say No of your own?", card: cardEl(null, "action-just-say-no"),
      body: h("div", { class: "options" },
        back2 ? option({ icon: "✋", danger: true, label: "No to the no!", small: "Play your Just Say No.", onClick: () => play(back2) }) : null,
        option({ icon: "🫡", primary: true, label: "Let it go", small: "Their No stands.", onClick: () => play(accept) })) });
    return;
  }

  if (mine.find((a) => a.step === "pay")) return payPrompt(pd.amount);
  if (v.discards[G.me]) return discardPrompt(v.discards[G.me]);
  closePrompt();
}

function closePrompt() {
  const k = openSheetKey();
  if (k && /^(respond|counter|pay|paypre|discard):/.test(k)) closeSheet();
}

/** preview: the respond key, when you're still allowed to go back and say no instead. */
function payPrompt(owed, { preview = null, accept = null, back = null } = {}) {
  const v = G.view;
  const key = preview ? "paypre:" + preview : `pay:${v.turn.number}:${owed}`;
  if (openSheetKey() === key) return;
  const p = meP();
  const bankCards = [...p.bank];
  const tableCards = p.sets.flatMap((s) => [...s.cards.filter((c) => valueOf(v, c) > 0), s.house, s.hotel].filter(Boolean));
  const pool = [...bankCards, ...tableCards];
  const all = pool.reduce((n, c) => n + valueOf(v, c), 0);
  const chosen = new Set();
  const tally = h("span", { class: "tally" });
  // From the preview, paying is two steps for the server: accept, then pay.
  const send = (cards) => {
    if (!preview) return play({ type: "pay", cards });
    closeSheet();
    G.send(accept);
    G.send({ type: "pay", cards });
  };
  const pay = h("button", { class: "btn btn--primary", type: "button", "data-default": true, onclick: () => send([...chosen]) }, h("span", {}, "Pay"), keycap());
  let suggest = G.moves.find((m) => m.type === "pay");
  if (preview) {
    try { suggest = { type: "pay", cards: autoPayment(v, p, owed) }; } catch { suggest = null; }
  }
  const els = new Map();
  let tableGroup = null;

  // Money first: properties unlock only once every bank card is in.
  const update = () => {
    const bankDone = bankCards.every((c) => chosen.has(c));
    if (!bankDone) for (const c of tableCards) if (chosen.delete(c)) els.get(c)?.classList.remove("is-on");
    tableGroup?.classList.toggle("is-locked", !bankDone);
    const sum = [...chosen].reduce((n, c) => n + valueOf(v, c), 0);
    tally.textContent = `${sum}M of ${owed}M`;
    const ok = sum >= owed || (chosen.size === pool.length && pool.length > 0);
    tally.classList.toggle("is-ok", ok);
    pay.disabled = !ok;
    pay.firstChild.textContent = sum > owed ? `Pay ${sum}M (no change!)` : "Pay";
  };
  const pickEl = (c) => {
    const el = h("button", { class: "pick", type: "button" }, tableCard(c), h("span", { class: "pick__check" }, "✓"));
    el.onclick = () => { chosen.has(c) ? chosen.delete(c) : chosen.add(c); el.classList.toggle("is-on", chosen.has(c)); update(); };
    els.set(c, el);
    return el;
  };
  if (tableCards.length) {
    tableGroup = h("div", { class: "sgroup" },
      h("p", { class: "sgroup__label" }, "Properties & buildings",
        bankCards.length ? h("span", { class: "sgroup__lock" }, "Bank first — hand over all your money to unlock") : null),
      // One row per set, its house and hotel right beside its cards.
      h("div", { class: "paysets" }, ...p.sets.map((st) => {
        const cards = [...st.cards.filter((c) => valueOf(v, c) > 0), st.house, st.hotel].filter(Boolean);
        if (!cards.length) return null;
        return h("div", { class: "payset" + (isComplete(st) ? " is-full" : "") },
          h("p", { class: "payset__label" }, h("span", { class: "option__swatch" , style: { background: COLORS[st.color].hex } }),
            `${colorName(st.color)} ${Math.min(st.cards.length, setSize(st.color))}/${setSize(st.color)}`,
            st.hotel ? " · house + hotel" : st.house ? " · house" : ""),
          h("div", { class: "payset__cards" }, ...cards.map((c) => {
            const el = pickEl(c);
            if (c === st.house || c === st.hotel) el.classList.add("pick--building");
            return el;
          })));
      })));
  }
  const subLine = all < owed ? `You only have ${all}M. Hand it all over.` : "Money first. Properties only once your bank is empty. No change given.";
  sheet({ key, modal: true, title: `Pay ${owed}M`,
    sub: subLine,
    body: h("div", {},
      bankCards.length ? h("div", { class: "sgroup" }, h("p", { class: "sgroup__label" }, `Bank · ${bankTotal(v, p)}M`), h("div", { class: "picks" }, ...bankCards.map(pickEl))) : null,
      tableGroup,
      h("div", { class: "sheet__foot" }, tally,
        back ? h("button", { class: "btn btn--quiet sheet__back", type: "button", onclick: back, title: "Back to Just Say No" },
          h("span", {}, "← Back")) : null,
        suggest ? h("button", { class: "btn btn--quiet", type: "button", "data-tab": true, onclick: () => send(suggest.cards) }, h("span", {}, "Pick for me"), keycap("tab")) : null, pay)) });
  update();
}

function discardPrompt(n) {
  const v = G.view;
  const key = `discard:${v.turn.number}:${n}`;
  if (openSheetKey() === key) return;
  const p = meP();
  const chosen = new Set();
  const btn = h("button", { class: "btn btn--primary", type: "button", "data-default": true, onclick: () => play({ type: "discard", cards: [...chosen] }) }, h("span"), keycap());
  const update = () => { btn.disabled = chosen.size !== n; btn.firstChild.textContent = chosen.size === n ? `Discard ${n}` : `Pick ${n - chosen.size} more`; };
  sheet({ key, modal: true, title: `Too many cards: discard ${n}`, sub: h("span", {}, "You can hold 7. ", h("b", { "data-countdown": "discard" }, ""), " left to choose."),
    body: h("div", {},
      h("div", { class: "picks" }, ...[...p.hand].map((c) => {
        const el = h("button", { class: "pick", type: "button" }, cardEl(null, v.cards[c]), h("span", { class: "pick__check" }, "✕"));
        el.onclick = () => {
          if (!chosen.has(c) && chosen.size >= n) return;
          chosen.has(c) ? chosen.delete(c) : chosen.add(c);
          el.classList.toggle("is-on", chosen.has(c));
          update();
        };
        return el;
      })),
      h("div", { class: "sheet__foot" }, btn)) });
  update();
}

// ------------------------------------------------------------------ dropping

const ACTIONS = new Set(["passGo", "birthday", "debt", "rent", "sly", "forced", "dealBreaker", "house", "hotel"]);
const q = (sel) => document.querySelector(sel);
const mySet = (id) => q(`#my-sets [data-set="${id}"]`);
const openSetOf = (color) => q(`#my-sets [data-color="${color}"]:not(.is-full)`);
const targetOf = (m) => m.target || null;

/** Every element a card can be dropped on, from the legal moves. */
export function zonesFor(card) {
  const moves = G.moves.filter((m) => m.card === card);
  const zones = new Set();
  for (const m of moves) {
    if (m.type === "bank") zones.add(q("#my-bank"));
    else if (m.type === "property" || m.type === "move") {
      // A card already on your table only goes to another colour's set (or
      // starts one); a card from your hand can land anywhere on your side.
      const s = openSetOf(m.color);
      if (s) zones.add(s);
      if (m.type === "property" || !s) zones.add(q("#mine"));
    } else if (m.type === "house" || m.type === "hotel") zones.add(mySet(m.set));
    else if (ACTIONS.has(m.type)) {
      zones.add(q("#felt"));
      if (targetOf(m)) zones.add(q(`[data-opp="${m.target}"]`));
      if (m.type === "rent") zones.add(mySet(m.set));
    }
  }
  zones.delete(null);
  return [...zones];
}

/** A card let go on a zone: play it, or ask only what's still open. */
export function dropCard(card, zone) {
  const all = G.moves.filter((m) => m.card === card);
  const kind = zone.dataset.drop;
  const fromSet = all.some((m) => m.type === "move");
  let ms = [];
  if (kind === "bank") ms = all.filter((m) => m.type === "bank");
  else if (kind === "set") {
    const id = zone.dataset.set, color = zone.dataset.color;
    ms = all.filter((m) => ((m.type === "property" || m.type === "move") && m.color === color) || ((m.type === "house" || m.type === "hotel" || m.type === "rent") && String(m.set) === id));
  } else if (kind === "mine") ms = all.filter((m) => m.type === "property" || m.type === "move");
  else if (kind === "opp") ms = all.filter((m) => m.target === zone.dataset.opp);
  else if (kind === "felt") ms = all.filter((m) => ACTIONS.has(m.type));
  if (!ms.length) return false;

  // Pass Go dropped on the bank is usually a near miss for the deck (they sit
  // side by side on phones), so it asks first.
  if (kind === "bank" && G.view.cards[card] === "action-pass-go") { confirmBankPassGo(card, ms[0]); return "asked"; }

  // One answer, nothing to ask.
  if (ms.length === 1) { play(ms[0]); return "sent"; }
  if (fromSet) { setCard(card, ms); return "asked"; }
  const types = new Set(ms.map((m) => m.type));
  if (types.size === 1) {
    const t = [...types][0];
    if (t === "rent") { rentSteps(card, ms); return "asked"; }
    if (t === "sly" || t === "forced") {
      pickTake(card, ms, t === "sly" ? "Steal which one?" : "Take which one?");
      return "asked";
    }
    if (t === "dealBreaker") { pickSet(card, ms); return "asked"; }
    if (t === "debt") { pickPlayer(card, ms, "Who owes you 5M?"); return "asked"; }
    if (t === "house" || t === "hotel") { pickOwnSet(card, ms, `Put the ${t} where?`); return "asked"; }
  }
  handCard(card, ms);
  return "asked";
}

/** "Bank your Pass Go?" A small centered dialog: bank it, or play it after all. */
function confirmBankPassGo(card, bank) {
  const go = G.moves.find((m) => m.card === card && m.type === "passGo");
  // Return draws (the likely intent); banking takes a deliberate click. Esc is Never mind.
  sheet({ key: `bank-go:${card}`, dialog: true, body: h("div", { class: "dlg" },
    h("div", { class: "dlg__art" }, cardEl(card, "action-pass-go")),
    h("div", { class: "dlg__main" },
      h("p", { class: "dlg__title" }, "Bank your Pass Go?"),
      h("p", { class: "dlg__sub" }, go ? "In the bank it's just 1M. Played, it draws you 2 cards." : "It'll sit in your bank as 1M."),
      h("div", { class: "dlg__buttons" },
        go ? h("button", { class: "btn dlg__btn dlg__btn--go", type: "button", "data-default": true, onclick: () => { play(go); } },
          h("span", {}, "Draw 2 instead"), keycap()) : null,
        h("button", { class: "btn dlg__btn dlg__btn--bank", type: "button", "data-default": go ? null : true, onclick: () => { play(bank); } },
          h("span", {}, "Bank it +1M"), go ? null : keycap()))),
    h("button", { class: "btn dlg__btn dlg__btn--cancel", type: "button", "data-cancel": true, onclick: () => { closeSheet(); } },
      h("span", {}, "Never mind"), keycap("esc"))) });
}

export { DEF };
