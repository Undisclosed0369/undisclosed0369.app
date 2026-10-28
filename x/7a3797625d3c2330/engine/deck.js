// Deal Breaker deck: every card in the game, shared by the card builder,
// the rules engine and the UI. 106 cards in total.

// Property colors. `rent` is the rent for 1, 2, 3… cards of that color;
// its length is the size of a complete set.
export const COLORS = {
  brown:     { name: "Brown",      hex: "#7E3A2F", ink: false, rent: [1, 2] },
  lightblue: { name: "Light Blue", hex: "#AEDCF6", ink: true,  rent: [1, 2, 3] },
  magenta:   { name: "Pink",       hex: "#D3238F", ink: false, rent: [1, 2, 4] },
  orange:    { name: "Orange",     hex: "#F07A10", ink: false, rent: [1, 3, 5] },
  red:       { name: "Red",        hex: "#E0282C", ink: false, rent: [2, 3, 6] },
  yellow:    { name: "Yellow",     hex: "#FCE80A", ink: true,  rent: [2, 4, 6] },
  green:     { name: "Green",      hex: "#1F9E4D", ink: false, rent: [2, 4, 7] },
  darkblue:  { name: "Dark Blue",  hex: "#0B52B4", ink: false, rent: [3, 8] },
  black:     { name: "Railroad",   hex: "#232323", ink: false, rent: [1, 2, 3, 4] },
  mint:      { name: "Utility",    hex: "#C6E4CA", ink: true,  rent: [1, 2] },
};

// `ink: true` means the color is light, so text on it is dark.

const property = (id, name, color, value, icon) =>
  ({ id: `prop-${id}`, type: "property", name, color, value, icon, count: 1 });

const wild = (a, b, value, count) =>
  ({ id: `wild-${a}-${b}`, type: "wild", colors: [a, b], value, count });

const rent = (a, b) =>
  ({ id: `rent-${a}-${b}`, type: "rent", colors: [a, b], value: 1, count: 2 });

// Card text uses {M} for the money symbol.
const action = (id, name, value, count, text, note) =>
  ({ id: `action-${id}`, type: "action", action: id, name, value, count, text, note });

export const CARDS = [
  // Properties (28)
  property("mediterranean", "Mediterranean Avenue", "brown", 1),
  property("baltic", "Baltic Avenue", "brown", 1),
  property("oriental", "Oriental Avenue", "lightblue", 1),
  property("vermont", "Vermont Avenue", "lightblue", 1),
  property("connecticut", "Connecticut Avenue", "lightblue", 1),
  property("st-charles", "St. Charles Place", "magenta", 2),
  property("states", "States Avenue", "magenta", 2),
  property("virginia", "Virginia Avenue", "magenta", 2),
  property("st-james", "St. James Place", "orange", 2),
  property("tennessee", "Tennessee Avenue", "orange", 2),
  property("new-york", "New York Avenue", "orange", 2),
  property("kentucky", "Kentucky Avenue", "red", 3),
  property("indiana", "Indiana Avenue", "red", 3),
  property("illinois", "Illinois Avenue", "red", 3),
  property("atlantic", "Atlantic Avenue", "yellow", 3),
  property("ventnor", "Ventnor Avenue", "yellow", 3),
  property("marvin-gardens", "Marvin Gardens", "yellow", 3),
  property("pacific", "Pacific Avenue", "green", 4),
  property("north-carolina", "North Carolina Avenue", "green", 4),
  property("pennsylvania-ave", "Pennsylvania Avenue", "green", 4),
  property("park-place", "Park Place", "darkblue", 4),
  property("boardwalk", "Boardwalk", "darkblue", 4),
  property("reading", "Reading Railroad", "black", 2, "train"),
  property("pennsylvania-rr", "Pennsylvania Railroad", "black", 2, "train"),
  property("b-and-o", "B. & O. Railroad", "black", 2, "train"),
  property("short-line", "Short Line", "black", 2, "train"),
  property("electric", "Electric Company", "mint", 2, "bulb"),
  property("water-works", "Water Works", "mint", 2, "faucet"),

  // Wild properties (11). The first color is the one printed upright.
  { id: "wild-any", type: "wild", colors: Object.keys(COLORS), value: 0, count: 2 },
  wild("lightblue", "brown", 1, 1),
  wild("green", "black", 4, 1),
  wild("orange", "magenta", 2, 2),
  wild("red", "yellow", 3, 2),
  wild("lightblue", "black", 4, 1),
  wild("mint", "black", 2, 1),
  wild("green", "darkblue", 4, 1),

  // Rent (13)
  rent("mint", "black"),
  rent("brown", "lightblue"),
  rent("magenta", "orange"),
  rent("darkblue", "green"),
  rent("red", "yellow"),
  { id: "rent-any", type: "rent", colors: Object.keys(COLORS), value: 3, count: 3 },

  // Actions (34)
  action("pass-go", "Pass Go", 1, 10, ["Draw 2 cards."]),
  action("debt-collector", "Debt Collector", 3, 3, ["Collect {M}5 from", "any player."]),
  action("sly-deal", "Sly Deal", 3, 3,
    ["Steal one property", "from any player & place", "it in front of you."],
    ["You may not steal a property", "that's part of a complete set."]),
  action("forced-deal", "Forced Deal", 3, 3,
    ["Swap any one of your", "properties with any one", "of another player's."],
    ["You may not take a property", "that's part of a complete set."]),
  action("double-the-rent", "Double the Rent", 1, 2,
    ["Play with a rent card.", "Collect double the rent!"]),
  action("birthday", "It's Your Birthday", 2, 3, ["Collect {M}2 from", "each player."]),
  action("house", "House", 3, 3,
    ["Place on a complete", "property set to", "add {M}3 to rent."],
    ["May not be placed on", "railroads or utilities."]),
  action("hotel", "Hotel", 4, 2,
    ["Place on a complete", "property set that has a", "house to add {M}4 to rent.", "The house stays."]),
  action("deal-breaker", "Deal Breaker", 5, 2,
    ["Steal a complete property", "set from any player,", "including any buildings.", "Place it in front of you."]),
  action("just-say-no", "Just Say No", 4, 3, ["Cancel an action card", "played against you."]),

  // Money (20)
  ...[[1, 6], [2, 5], [3, 3], [4, 3], [5, 2], [10, 1]].map(([value, count]) =>
    ({ id: `money-${value}`, type: "money", value, count })),
];

export const DECK_SIZE = CARDS.reduce((n, c) => n + c.count, 0);

/** What a property of each color is worth (the same for every card of a color).
    House rule: a rainbow wild on the table is worth this for its color. */
export const COLOR_VALUE = Object.fromEntries(
  Object.keys(COLORS).map((k) => [k, CARDS.find((c) => c.type === "property" && c.color === k).value]));
