import {
  PROPERTY_COLORS,
  type ActionType,
  type Card,
  type CardKind,
  type PropertyColor,
} from "./types";

export const SET_SIZE: Record<PropertyColor, number> = {
  brown: 2,
  "light-blue": 3,
  pink: 3,
  orange: 3,
  red: 3,
  yellow: 3,
  green: 3,
  "dark-blue": 2,
  railroad: 4,
  utility: 2,
};

export const RENT_CHART: Record<PropertyColor, number[]> = {
  brown: [1, 2],
  "light-blue": [1, 2, 3],
  pink: [1, 2, 4],
  orange: [1, 3, 5],
  red: [2, 3, 6],
  yellow: [2, 4, 6],
  green: [2, 4, 7],
  "dark-blue": [3, 8],
  railroad: [1, 2, 3, 4],
  utility: [1, 2],
};

export const PROPERTY_FACE_VALUE: Record<PropertyColor, number> = {
  brown: 1,
  "light-blue": 1,
  pink: 2,
  orange: 2,
  red: 3,
  yellow: 3,
  green: 4,
  "dark-blue": 4,
  railroad: 2,
  utility: 2,
};

const PROPERTY_COUNTS: Record<PropertyColor, number> = {
  brown: 2,
  "dark-blue": 2,
  green: 3,
  "light-blue": 3,
  orange: 3,
  pink: 3,
  red: 3,
  yellow: 3,
  railroad: 4,
  utility: 2,
};

type CardDefinition = {
  defId: string;
  name: string;
  kind: CardKind;
  count: number;
  value: number;
  colors?: PropertyColor[];
  action?: ActionType;
  rentColors?: PropertyColor[];
  wildRent?: boolean;
  isMulticolor?: boolean;
};

const colorLabel = (color: PropertyColor) =>
  color
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");

const propertyDefinitions: CardDefinition[] = PROPERTY_COLORS.map((color) => ({
  defId: `property-${color}`,
  name: colorLabel(color),
  kind: "property",
  count: PROPERTY_COUNTS[color],
  value: PROPERTY_FACE_VALUE[color],
  colors: [color],
}));

const wildcardDefinitions: CardDefinition[] = [
  {
    defId: "wild-dark-blue-green",
    name: "Dark Blue / Green Wild",
    kind: "wild",
    count: 1,
    value: 4,
    colors: ["dark-blue", "green"],
  },
  {
    defId: "wild-green-railroad",
    name: "Green / Railroad Wild",
    kind: "wild",
    count: 1,
    value: 4,
    colors: ["green", "railroad"],
  },
  {
    defId: "wild-utility-railroad",
    name: "Utility / Railroad Wild",
    kind: "wild",
    count: 1,
    value: 2,
    colors: ["utility", "railroad"],
  },
  {
    defId: "wild-light-blue-railroad",
    name: "Light Blue / Railroad Wild",
    kind: "wild",
    count: 1,
    value: 4,
    colors: ["light-blue", "railroad"],
  },
  {
    defId: "wild-light-blue-brown",
    name: "Light Blue / Brown Wild",
    kind: "wild",
    count: 1,
    value: 1,
    colors: ["light-blue", "brown"],
  },
  {
    defId: "wild-pink-orange",
    name: "Pink / Orange Wild",
    kind: "wild",
    count: 2,
    value: 2,
    colors: ["pink", "orange"],
  },
  {
    defId: "wild-red-yellow",
    name: "Red / Yellow Wild",
    kind: "wild",
    count: 2,
    value: 3,
    colors: ["red", "yellow"],
  },
  {
    defId: "wild-any",
    name: "Prismatic Wild",
    kind: "wild",
    count: 2,
    value: 0,
    colors: [...PROPERTY_COLORS],
    isMulticolor: true,
  },
];

const moneyDefinitions: CardDefinition[] = [
  { defId: "money-1", name: "$1M", kind: "money", count: 6, value: 1 },
  { defId: "money-2", name: "$2M", kind: "money", count: 5, value: 2 },
  { defId: "money-3", name: "$3M", kind: "money", count: 3, value: 3 },
  { defId: "money-4", name: "$4M", kind: "money", count: 3, value: 4 },
  { defId: "money-5", name: "$5M", kind: "money", count: 2, value: 5 },
  { defId: "money-10", name: "$10M", kind: "money", count: 1, value: 10 },
];

const actionDefinitions: CardDefinition[] = [
  {
    defId: "action-deal-breaker",
    name: "Set Sweep",
    kind: "action",
    action: "deal-breaker",
    count: 2,
    value: 5,
  },
  {
    defId: "action-just-say-no",
    name: "Hard No",
    kind: "action",
    action: "just-say-no",
    count: 3,
    value: 4,
  },
  {
    defId: "action-sly-deal",
    name: "Quiet Take",
    kind: "action",
    action: "sly-deal",
    count: 3,
    value: 3,
  },
  {
    defId: "action-forced-deal",
    name: "Forced Swap",
    kind: "action",
    action: "forced-deal",
    count: 3,
    value: 3,
  },
  {
    defId: "action-debt-collector",
    name: "Collect Debt",
    kind: "action",
    action: "debt-collector",
    count: 3,
    value: 3,
  },
  {
    defId: "action-birthday",
    name: "Table Tribute",
    kind: "action",
    action: "birthday",
    count: 3,
    value: 2,
  },
  {
    defId: "action-pass-go",
    name: "Sprint Ahead",
    kind: "action",
    action: "pass-go",
    count: 10,
    value: 1,
  },
  {
    defId: "action-house",
    name: "House",
    kind: "action",
    action: "house",
    count: 3,
    value: 3,
  },
  {
    defId: "action-hotel",
    name: "Hotel",
    kind: "action",
    action: "hotel",
    count: 2,
    value: 4,
  },
  {
    defId: "action-double-rent",
    name: "Double Rent",
    kind: "action",
    action: "double-rent",
    count: 2,
    value: 1,
  },
];

const rentDefinitions: CardDefinition[] = [
  {
    defId: "rent-dark-blue-green",
    name: "Dark Blue / Green Rent",
    kind: "rent",
    count: 2,
    value: 1,
    rentColors: ["dark-blue", "green"],
  },
  {
    defId: "rent-red-yellow",
    name: "Red / Yellow Rent",
    kind: "rent",
    count: 2,
    value: 1,
    rentColors: ["red", "yellow"],
  },
  {
    defId: "rent-pink-orange",
    name: "Pink / Orange Rent",
    kind: "rent",
    count: 2,
    value: 1,
    rentColors: ["pink", "orange"],
  },
  {
    defId: "rent-light-blue-brown",
    name: "Light Blue / Brown Rent",
    kind: "rent",
    count: 2,
    value: 1,
    rentColors: ["light-blue", "brown"],
  },
  {
    defId: "rent-railroad-utility",
    name: "Railroad / Utility Rent",
    kind: "rent",
    count: 2,
    value: 1,
    rentColors: ["railroad", "utility"],
  },
  {
    defId: "rent-wild",
    name: "Wild Rent",
    kind: "rent",
    count: 3,
    value: 3,
    rentColors: [...PROPERTY_COLORS],
    wildRent: true,
  },
];

export const CARD_DEFINITIONS = [
  ...propertyDefinitions,
  ...wildcardDefinitions,
  ...moneyDefinitions,
  ...actionDefinitions,
  ...rentDefinitions,
];

export function createOrderedDeck(): Card[] {
  const cards: Card[] = [];

  for (const definition of CARD_DEFINITIONS) {
    for (let copy = 1; copy <= definition.count; copy += 1) {
      cards.push({
        id: `${definition.defId}-${copy}`,
        defId: definition.defId,
        kind: definition.kind,
        name: definition.name,
        value: definition.value,
        colors: definition.colors ? [...definition.colors] : undefined,
        action: definition.action,
        rentColors: definition.rentColors ? [...definition.rentColors] : undefined,
        wildRent: definition.wildRent,
        isMulticolor: definition.isMulticolor,
      });
    }
  }

  return cards;
}

export function nextSeed(seed: number): number {
  return (seed * 1664525 + 1013904223) >>> 0;
}

export function shuffleCards(cards: Card[], seed: number): { cards: Card[]; seed: number } {
  const shuffled = [...cards];
  let currentSeed = seed >>> 0;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    currentSeed = nextSeed(currentSeed);
    const swapIndex = currentSeed % (index + 1);
    const temp = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = temp;
  }

  return { cards: shuffled, seed: currentSeed };
}

export function createShuffledDeck(seed = 20260613): { deck: Card[]; seed: number } {
  const shuffled = shuffleCards(createOrderedDeck(), seed);
  return { deck: shuffled.cards, seed: shuffled.seed };
}

export function getDeckCount(): number {
  return createOrderedDeck().length;
}
