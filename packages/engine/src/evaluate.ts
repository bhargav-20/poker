/// <reference path="./types.d.ts" />
import { Hand } from "pokersolver";
import type { Card } from "@poker/shared";

/** A ranked hand, with the pokersolver type kept internal to this module. */
export interface Ranked {
  id: string;
  descr: string;
  /** The best 5 cards, in pokersolver order. */
  cards: Card[];
}

function toRanked(id: string, hand: Hand): Ranked {
  return { id, descr: hand.descr, cards: hand.cards.map((c) => c.toString() as Card) };
}

/** Solve a player's best 5-card hand from hole + board (5–7 cards total). */
export function solveHand(id: string, hole: [Card, Card], board: Card[]): Ranked {
  return toRanked(id, Hand.solve([...hole, ...board]));
}

/**
 * Given eligible players' hole cards and the shared board, return the winner
 * id(s). Ties return multiple ids. `entries` must be non-empty.
 */
export function findWinners(
  entries: Array<{ id: string; hole: [Card, Card] }>,
  board: Card[],
): { winnerIds: string[]; ranked: Map<string, Ranked> } {
  const solved = entries.map((e) => ({ id: e.id, hand: Hand.solve([...e.hole, ...board]) }));
  const winningHands = Hand.winners(solved.map((s) => s.hand));
  const winnerIds = solved.filter((s) => winningHands.includes(s.hand)).map((s) => s.id);
  const ranked = new Map<string, Ranked>();
  for (const s of solved) ranked.set(s.id, toRanked(s.id, s.hand));
  return { winnerIds, ranked };
}
