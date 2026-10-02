import { DEFAULTS } from "@poker/shared";

export interface Point {
  x: number;
  y: number;
}

export interface TableGeometry {
  w: number;
  h: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  cardW: number;
  cardH: number;
  /** Larger cards for the local player at the bottom. */
  heroCardW: number;
  heroCardH: number;
  /** Smaller cards for opponents' compact seats. */
  oppCardW: number;
  oppCardH: number;
  seats: Point[]; // slot 0 = local player
  community: Point[]; // 5 board card centers
  pot: Point;
  deck: Point;
}

const MAX_SEATS = DEFAULTS.MAX_SEATS;

// Portrait: local player at the bottom, one seat on each flank, and the other
// five fan across the upper band.
const SLOTS_PORTRAIT: ReadonlyArray<readonly [number, number]> = [
  [0.5, 1.0], // 0 hero
  [0.09, 0.56], // 1 left
  [0.12, 0.25], // 2 upper-left
  [0.27, 0.07], // 3 top-left
  [0.5, 0.0], // 4 top
  [0.73, 0.07], // 5 top-right
  [0.88, 0.25], // 6 upper-right
  [0.91, 0.56], // 7 right
];

// Landscape: a wide ring. The hero sits bottom, left of center so the action
// dock can live in the bottom-right corner without overlapping it.
const SLOTS_LANDSCAPE: ReadonlyArray<readonly [number, number]> = [
  [0.4, 1.0], // 0 hero
  [0.13, 0.94], // 1 lower-left
  [0.05, 0.5], // 2 left
  [0.14, 0.06], // 3 upper-left
  [0.37, 0.0], // 4 top-left
  [0.63, 0.0], // 5 top-right
  [0.88, 0.06], // 6 upper-right
  [0.93, 0.46], // 7 right (kept above the corner dock)
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function build(
  w: number,
  h: number,
  slots: ReadonlyArray<readonly [number, number]>,
  opts: {
    topInset: number;
    bottomInset: number;
    sideInset: number;
    cyF: number;
    ryF: number;
    rxCap: number;
    ryCap: number;
  },
): TableGeometry {
  const { topInset, bottomInset, sideInset, cyF, ryF, rxCap, ryCap } = opts;
  const playTop = topInset;
  const playH = h - topInset - bottomInset;
  const playW = w - sideInset * 2;

  const cx = w / 2;
  const cy = playTop + playH * cyF;
  const rx = Math.min(playW / 2 - 4, rxCap);
  const ry = Math.min(playH * ryF, ryCap);

  const base = Math.min(w, playH);
  const cardH = clamp(base * 0.14, 40, 92);
  const cardW = cardH * 0.7;
  const heroCardH = clamp(base * 0.2, 58, 124);
  const heroCardW = heroCardH * 0.7;
  const oppCardH = clamp(cardH * 0.62, 24, 54);
  const oppCardW = oppCardH * 0.7;

  const seats: Point[] = slots.map(([fx, fy]) => ({
    x: sideInset + fx * playW,
    y: playTop + fy * playH,
  }));

  const gap = cardW * 0.28;
  const totalW = cardW * 5 + gap * 4;
  const startX = cx - totalW / 2 + cardW / 2;
  const boardY = cy - cardH * 0.1;
  const community: Point[] = [];
  for (let i = 0; i < 5; i++) {
    community.push({ x: startX + i * (cardW + gap), y: boardY });
  }

  return {
    w,
    h,
    cx,
    cy,
    rx,
    ry,
    cardW,
    cardH,
    heroCardW,
    heroCardH,
    oppCardW,
    oppCardH,
    seats,
    community,
    pot: { x: cx, y: cy - cardH * 0.95 },
    deck: { x: cx, y: cy },
  };
}

export function computeGeometry(w: number, h: number): TableGeometry {
  const landscape = w > h * 1.15;
  if (landscape) {
    return build(w, h, SLOTS_LANDSCAPE, {
      topInset: 46,
      bottomInset: 52,
      sideInset: 10,
      cyF: 0.46,
      ryF: 0.5,
      rxCap: 640,
      ryCap: 320,
    });
  }
  return build(w, h, SLOTS_PORTRAIT, {
    topInset: 76,
    bottomInset: clamp(h * 0.24, 120, 210),
    sideInset: 6,
    cyF: 0.48,
    ryF: 0.46,
    rxCap: 560,
    ryCap: 360,
  });
}

/** Map an absolute seat number to a display slot so the local player sits at the bottom. */
export function slotFor(seat: number, selfSeat: number | null): number {
  const base = selfSeat ?? 0;
  return (seat - base + MAX_SEATS) % MAX_SEATS;
}
