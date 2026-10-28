// The announcer's lines (from _dealbreaker/COPY.md). {p} player, {t} target,
// {c} color, {n} amount. Never the same line twice in a row.

const LINES = {
  "deal-breaker": [
    "{p} just broke {t}'s heart. And their {c} set.",
    "DEAL. BROKEN. {t} would like to speak to a manager.",
    "{p} took the whole {c} set. No dinner, no flowers, nothing.",
    "{t}'s {c} set has left the chat.",
    "That's not a deal, {t}. That's a robbery with paperwork.",
  ],
  "just-say-no": [
    "{p} said NO. Full sentence.",
    "Denied! {p} has boundaries.",
    "{p} just pulled a Just Say No. The audacity.",
    "Not today, {t}. Not today.",
    "{p}: 'I'm going to stop you right there.'",
  ],
  "no-to-no": [
    "A NO to the NO? This is getting personal.",
    "Plot twist! {p} says no to the no.",
    "Double negative! Grammar teachers everywhere are confused.",
  ],
  birthday: [
    "🎂 It's {p}'s birthday! Everyone pays 2M. No gift receipts.",
    "Happy birthday, {p}! Your friends are thrilled. Their wallets aren't.",
    "{p} is celebrating. You are paying. That's how birthdays work now.",
    "Surprise! It's {p}'s birthday. Again. Somehow.",
  ],
  rent: [
    "{p} is collecting rent on {c}. Everyone, empty your pockets.",
    "Rent's due! {p} is your landlord now. Sorry.",
    "{p} wants {n}M. The landlord has spoken.",
  ],
  "rent-one": [
    "{p} is charging {t} {n}M rent. Specifically {t}. Personally.",
    "{t}, the landlord would like a word. And {n}M.",
    "{p} picked {t}. Out of everyone. Interesting.",
  ],
  "double-rent": [
    "DOUBLE RENT! {p} has chosen violence.",
    "{p} doubled the rent. Inflation is real, folks.",
    "Rent: doubled. Mercy: none. {n}M please.",
    "{p} read the room and decided to double it.",
  ],
  "debt-collector": [
    "{p} is collecting 5M from {t}. Knuckles cracking audibly.",
    "{t}, your debt has been… collected. 5M, thanks.",
    "{p} sent the debt collector to {t}'s house. He brought a clipboard.",
  ],
  "sly-deal": [
    "{p} sneakily took {t}'s {c}. Smooth.",
    "Sly Deal! {t}, check your pockets.",
    "{p} has sticky fingers and a {c} property that isn't theirs.",
  ],
  "forced-deal": [
    "{p} forced a swap with {t}. Nobody asked {t}.",
    "Forced Deal! {t}, enjoy your 'upgrade'.",
    "{p} traded with {t}. 'Traded.'",
  ],
  "pass-go": [
    "{p} passed GO. Collect two cards, do not collect 200.",
    "{p} draws two more. Greedy, but legal.",
  ],

  // The same moments, when you're the one doing it.
  "mine-birthday": [
    "🎂 It's your birthday! Everyone owes you 2M. Act surprised.",
    "Happy birthday to you. Everyone else: wallets out.",
  ],
  "mine-rent": [
    "Rent's due. You're the landlord now. It suits you.",
    "You want {n}M from everyone. The landlord has spoken.",
  ],
  "mine-rent-one": [
    "You're charging {t} {n}M. Specifically {t}. Personally.",
    "{t} owes you {n}M. Out of everyone. Interesting choice.",
  ],
  "mine-double-rent": [
    "DOUBLE RENT! You have chosen violence.",
    "You doubled the rent. Inflation is real, folks.",
  ],
  "mine-debt-collector": [
    "You sent the debt collector to {t}. He brought a clipboard.",
    "{t} owes you 5M. Knuckles: cracked.",
  ],
  "mine-pass-go": [
    "You passed GO. Two more cards, no 200.",
    "Two more cards. Greedy, but legal.",
  ],
  house: ["{p} built a house on {c}. Property values: up. Friendships: down."],
  hotel: ["A hotel?! {p} is going full tycoon."],
  complete: [
    "{p} completed {c}! Set and match.",
    "{c} is DONE. {p} is building an empire.",
    "Ding! {p} finished the {c} set. Everyone else: concerned.",
    "{p} has a full {c} set. Lock your doors.",
  ],
  "one-away": [
    "⚠️ {p} is ONE set away. Do something!",
    "{p} can smell victory. Somebody stop them.",
  ],
  paid: [
    "{p} paid {n}M. A single tear rolls down their cheek.",
  ],
  broke: [
    "{p} is broke and paid with everything they had. Respect.",
    "{p} has nothing to pay with. You can't squeeze water from a stone.",
  ],
  overpaid: ["{p} overpaid. No change given. That's the rules, babe."],
  "time-low": ["⏰ Tick tock, {p}."],
  timeout: ["{p} fell asleep. Next!"],
  "timeout-respond": ["{p} didn't answer. Silence means yes."],
  win: [
    "🏆 {p} WINS! Bow down to the property tycoon.",
    "{p} wins! The deals were made. The friendships were broken.",
  ],
  lose: [
    "Good game. Well… a game.",
    "You lost, but at least you had fun. Right? …Right?",
  ],
  "your-turn-draw": [
    "Your turn. Tap the deck — those {n} cards won't draw themselves.",
    "You're up. First things first: tap the deck.",
    "Your move. The deck is glowing at you. Don't leave it hanging.",
  ],
  "skipped-draw": [
    "{p} forgot to draw. Those {n} cards are gone forever.",
    "{p} skipped the free cards. Bold. Wrong, but bold.",
    "{p} didn't draw. The deck is hurt.",
  ],
  "your-turn": ["Your turn. Make it count.", "You're up. No pressure. (Some pressure.)", "Your move, tycoon."],
};

const last = {};

export function line(kind, vars = {}) {
  if (vars.p === "You" && LINES["mine-" + kind]) kind = "mine-" + kind;
  const list = LINES[kind];
  if (!list) return "";
  let i;
  do { i = Math.floor(Math.random() * list.length); } while (list.length > 1 && i === last[kind]);
  last[kind] = i;
  const text = list[i].replace(/\{(\w)\}/g, (_, k) => vars[k] ?? "");
  const out = vars.p === "You" ? secondPerson(text) : text;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// "You is charging…" → "You are charging…", and friends.
const YOU = { is: "are", has: "have", wins: "win", WINS: "WIN", wants: "want", draws: "draw", says: "say" };
function secondPerson(text) {
  return text
    .replace(/\bYou's\b/g, "Your")
    .replace(/\bYou (is|has|wins|WINS|wants|draws|says)\b/g, (_, v) => `You ${YOU[v]}`);
}
