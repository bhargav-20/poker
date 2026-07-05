import type { Card, Rank, Suit } from "@poker/shared";

// A Theme is config. Cards/chips/felt render procedurally from color tokens by
// default, so themes scale crisply and a new one is just another object here.
// A theme may optionally supply an `images` descriptor to render real card art
// instead (the felt/chips stay procedural).
export interface ThemeImages {
  /** Full URL for a card's face, e.g. "/themes/classic/ace_of_spades.png". */
  face: (card: Card) => string;
  /** Full URL for the card back. */
  back: string;
}

export interface Theme {
  id: string;
  name: string;
  /** Radial felt gradient (center -> edge), 0xRRGGBB. */
  feltCenter: number;
  feltEdge: number;
  /** Wooden/leather rail around the table. */
  railOuter: number;
  railInner: number;
  /** Card rendering. */
  cardFace: number;
  cardBorder: number;
  cardBackA: number;
  cardBackB: number;
  redSuit: number;
  blackSuit: number;
  /** UI accents. */
  accent: number; // active-player glow, buttons
  accentSoft: number;
  gold: number; // pot / winner
  chip: { base: number; ring: number };
  seatBg: number;
  seatText: number;
  /** Optional real card art; when present, cards render as sprites. */
  images?: ThemeImages;
}

const RANK_WORD: Record<Rank, string> = {
  A: "ace", K: "king", Q: "queen", J: "jack", T: "10",
  "9": "9", "8": "8", "7": "7", "6": "6", "5": "5", "4": "4", "3": "3", "2": "2",
};
const SUIT_WORD: Record<Suit, string> = {
  s: "spades", h: "hearts", d: "diamonds", c: "clubs",
};

// Vite serves public assets under the app base ("/" locally, "/poker/" on Pages).
const ASSET_BASE = `${import.meta.env.BASE_URL}themes/classic`;

function classicFace(card: Card): string {
  const rank = RANK_WORD[card[0] as Rank];
  const suit = SUIT_WORD[card[1] as Suit];
  return `${ASSET_BASE}/${rank}_of_${suit}.png`;
}

export const THEMES: Record<string, Theme> = {
  emerald: {
    id: "emerald",
    name: "Emerald Classic",
    feltCenter: 0x1f7a52,
    feltEdge: 0x0c3a27,
    railOuter: 0x3b2413,
    railInner: 0x5a3a1f,
    cardFace: 0xfbf7ee,
    cardBorder: 0xd8cfba,
    cardBackA: 0x8a1c2b,
    cardBackB: 0x5a0f1c,
    redSuit: 0xc62828,
    blackSuit: 0x1a1a1a,
    accent: 0x4fd6a6,
    accentSoft: 0x2fae86,
    gold: 0xf2c14e,
    chip: { base: 0xd94141, ring: 0xf5f0e6 },
    seatBg: 0x0b241a,
    seatText: 0xeafff5,
  },
  noir: {
    id: "noir",
    name: "Midnight Noir",
    feltCenter: 0x21324a,
    feltEdge: 0x0b1420,
    railOuter: 0x14181f,
    railInner: 0x232a35,
    cardFace: 0xf5f6fa,
    cardBorder: 0xc4c9d6,
    cardBackA: 0x2b3b57,
    cardBackB: 0x151f30,
    redSuit: 0xe0555f,
    blackSuit: 0x11151c,
    accent: 0x6aa8ff,
    accentSoft: 0x3f7fe0,
    gold: 0xe8c877,
    chip: { base: 0x4f7fd6, ring: 0xeef2fb },
    seatBg: 0x0e1622,
    seatText: 0xeaf1ff,
  },
  classic: {
    id: "classic",
    name: "Illustrated Classic",
    feltCenter: 0x2a6b47,
    feltEdge: 0x123a26,
    railOuter: 0x2e1c0f,
    railInner: 0x4a2f18,
    cardFace: 0xffffff,
    cardBorder: 0xd8cfba,
    cardBackA: 0x8a1c2b,
    cardBackB: 0x5a0f1c,
    redSuit: 0xc62828,
    blackSuit: 0x1a1a1a,
    accent: 0xf2c14e,
    accentSoft: 0xc79a34,
    gold: 0xf7d774,
    chip: { base: 0xc23b3b, ring: 0xf5f0e6 },
    seatBg: 0x14241a,
    seatText: 0xf3fff8,
    images: { face: classicFace, back: `${ASSET_BASE}/back.png` },
  },
};

export const DEFAULT_THEME = "emerald";
