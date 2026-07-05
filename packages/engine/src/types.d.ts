// Minimal typings for pokersolver (no official @types package).
declare module "pokersolver" {
  export class Hand {
    /** Human-readable description, e.g. "Full House, A's over K's". */
    descr: string;
    /** Numeric rank category (higher is better). */
    rank: number;
    /** The cards forming the best 5-card hand. */
    cards: Array<{ value: string; suit: string; toString(): string }>;
    static solve(cards: string[]): Hand;
    /** Returns the winning Hand(s) from the list. */
    static winners(hands: Hand[]): Hand[];
  }
}
