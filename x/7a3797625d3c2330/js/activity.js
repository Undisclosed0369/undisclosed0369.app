// The play-by-play: one plain, specific line per thing that happened, told
// from the reader's side of the table. "Rita stole your Boardwalk." "You paid
// Nilesh 4M rent: 3M and Baltic Avenue." Every card is named.
//
//   narrate(event, { me, view, name(pid), events }) -> string | null
//   (events: everything else in the same update, for context)

import { COLORS, COLOR_VALUE } from "../engine/deck.js";
import { DEF, completeColors } from "../engine/rules.js";

const color = (k) => (COLORS[k]?.name || "").toLowerCase();

/** What a card is called in a sentence. `as` is the color a wild is used as. */
export function cardLabel(view, card, as) {
  const d = DEF[view.cards[card]];
  if (!d) return "a card";
  switch (d.type) {
    case "property": return d.name;
    case "money": return `${d.value}M`;
    case "wild":
      if (d.colors.length > 2) return as ? `the rainbow wild (as ${color(as)})` : "the rainbow wild";
      return `the ${color(d.colors[0])}/${color(d.colors[1])} wild` + (as ? ` (as ${color(as)})` : "");
    case "rent": return d.colors.length > 2 ? "a Rent (any color)" : `a Rent (${color(d.colors[0])}/${color(d.colors[1])})`;
    default: return d.name;
  }
}

/** "a, b and c" */
export const listOf = (items) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const PENDING = { rent: "rent", birthday: "birthday demand", debt: "Debt Collector", sly: "Sly Deal", forced: "Forced Deal", dealBreaker: "Deal Breaker" };
const PAID_FOR = { rent: "rent", birthday: "for the birthday", debt: "to the Debt Collector" };

export function narrate(e, { me, view, name, events }) {
  const Who = (pid) => (pid === me ? "You" : name(pid));
  const who = (pid) => (pid === me ? "you" : name(pid));
  const whose = (pid) => (pid === me ? "your" : `${name(pid)}'s`);
  const own = (pid) => (pid === me ? "your" : "their");
  const card = (c, as) => cardLabel(view, c, as);
  // After "your" / "Rita's": "your Boardwalk", "Rita's light blue/brown wild".
  const owned = (prefix, c, as) => `${prefix} ${card(c, as).replace(/^the /, "")}`;
  // In a payment, anything that isn't a money card shows what it was worth.
  const worth = (c, as) => {
    const d = DEF[view.cards[c]];
    if (d?.type === "money") return card(c);
    // A rainbow wild is worth a property of the color it was used as.
    const v = d?.id === "wild-any" ? COLOR_VALUE[as] ?? 0 : d?.value ?? 0;
    return `${card(c, as)} (${v}M)`;
  };
  const setColorOf = (pid, setId) => view.players.find((p) => p.id === pid)?.sets.find((s) => s.id === setId)?.color;
  const colorOfCard = (c) => view.players.flatMap((p) => p.sets).find((s) => s.cards.includes(c))?.color;
  const n = (k, word) => `${k} ${word}${k === 1 ? "" : "s"}`;

  switch (e.t) {
    case "turn": return e.p === me ? null : `${name(e.p)}'s turn.`;
    case "drawLost": return e.p === me
      ? `You played before drawing, so this turn's ${n(e.n, "card")} ${e.n === 1 ? "is" : "are"} gone.`
      : `${name(e.p)} played before drawing and lost ${own(e.p)} ${n(e.n, "card")}.`;
    case "draw": return e.p === me ? `You drew ${n(e.n, "card")}.` : `${name(e.p)} drew ${n(e.n, "card")}.`;
    case "property": return `${Who(e.p)} played ${card(e.card, DEF[e.def]?.type === "wild" ? e.color : null)}.`;
    case "bank": {
      const d = DEF[e.def];
      return d?.type === "money" ? `${Who(e.p)} banked ${d.value}M.` : `${Who(e.p)} banked ${card(e.card)} as ${d?.value}M.`;
    }
    case "move": return `${Who(e.p)} switched ${owned(own(e.p), e.card)} to ${color(e.color)}.`;

    case "action": {
      const t = e.targets?.length === 1 ? e.targets[0] : null;
      switch (e.action) {
        case "pass-go": return `${Who(e.p)} played Pass Go and drew 2 more cards.`;
        case "birthday": return `${Who(e.p)} played It's My Birthday: everyone owes ${e.p === me ? "you" : "them"} 2M.`;
        case "debt-collector": return `${Who(e.p)} sent the Debt Collector after ${who(t)}: 5M, please.`;
        case "rent": {
          const dbl = e.doubles?.length ? ` with ${e.doubles.length > 1 ? "two Double the Rents (×4)" : "Double the Rent (×2)"}` : "";
          return `${Who(e.p)} charged ${t ? who(t) : "everyone"} ${e.amount}M rent on ${own(e.p)} ${color(e.color)} set${dbl}.`;
        }
        case "sly-deal": return `${Who(e.p)} played Sly Deal on ${who(t)}, going for ${owned(whose(t), e.take)}.`;
        case "forced-deal": return `${Who(e.p)} played Forced Deal: ${owned(own(e.p), e.give)} for ${owned(whose(t), e.take)}.`;
        case "deal-breaker": {
          // If nobody could say no, the set has already moved by now: the
          // steal in the same update knows its color.
          const c = setColorOf(t, e.set) || events?.find((x) => x.t === "steal" && x.kind === "deal-breaker")?.color;
          return `${Who(e.p)} played Deal Breaker on ${whose(t)} complete ${color(c)} set!`;
        }
        case "house": case "hotel": return `${Who(e.p)} built a ${e.action} on ${own(e.p)} ${color(setColorOf(e.p, e.set))} set.`;
        default: return `${Who(e.p)} played ${card(e.card)}.`;
      }
    }

    case "justSayNo": {
      if (e.n > 1) return `${Who(e.p)} said Just Say No right back to ${who(e.against)}!`;
      // If it settled things at once, the "blocked" in the same update says what it stopped.
      const b = events?.find((x) => x.t === "blocked");
      const what = PENDING[view.pending?.reason] || PENDING[view.pending?.kind] || PENDING[b?.reason] || PENDING[b?.kind] || "move";
      return `${Who(e.p)} played Just Say No on ${whose(e.against)} ${what}!`;
    }
    case "blocked": {
      const what = PENDING[e.reason] || PENDING[e.kind] || "move";
      return `${Whose(e.by)} ${what} on ${who(e.p)} is cancelled.`;
    }

    case "steal":
      if (e.kind === "deal-breaker") {
        return `${Who(e.to)} took ${whose(e.from)} whole ${color(e.color)} set: ${listOf(e.cards.map((c) => card(c)))}.`;
      }
      return `${Who(e.to)} stole ${owned(whose(e.from), e.cards[0])}.`;
    case "swap":
      return `${Who(e.a)} swapped ${owned(own(e.a), e.gave)} for ${owned(whose(e.b), e.took)}.`;

    case "pay": {
      if (!e.cards.length) return `${Who(e.from)} had nothing to pay ${who(e.to)}.`;
      const why = PAID_FOR[e.reason] ? ` ${PAID_FOR[e.reason]}` : "";
      const what = listOf(e.cards.map((c) => worth(c, colorOfCard(c))));
      const tail = e.amount > e.owed ? " No change given."
        : e.amount < e.owed ? ` That's everything ${e.from === me ? "you" : "they"} had.` : "";
      return `${Who(e.from)} paid ${who(e.to)} ${e.amount}M${why}: ${what}.${tail}`;
    }
    case "setComplete": {
      const p = view.players.find((x) => x.id === e.p);
      const done = p ? completeColors(p).length : 0;
      return `${Who(e.p)} completed ${own(e.p)} ${color(e.color)} set (${done}/${view.options.winSets}).`;
    }
    case "buildingsToBank": return `${Whose(e.p)} broken set's buildings went to ${own(e.p)} bank.`;
    case "mustDiscard": return `${Who(e.p)} ${e.p === me ? "have" : "has"} too many cards: ${n(e.n, "discard")} to make.`;
    case "discard": return `${Who(e.p)} discarded ${listOf(e.cards.map((c) => card(c)))}.`;
    case "removed": return e.p === me ? "The leader removed you from the game." : `The leader removed ${e.name} from the game. Their cards went to the discard pile.`;
    case "reshuffle": return "The deck ran dry. The discards were shuffled back in.";
    case "win": return e.p === me ? "You won! 🏆" : `${name(e.p)} won! 🏆`;
    default: return null;
  }

  function Whose(pid) { const w = whose(pid); return w[0].toUpperCase() + w.slice(1); }
}
