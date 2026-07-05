// ─────────────────────────────────────────────────────────────────────────
// Cards
// Card notation matches pokersolver: rank + suit, e.g. "As", "Td", "2c".
// Ranks: A K Q J T 9 8 7 6 5 4 3 2   Suits: s(pades) h(earts) d(iamonds) c(lubs)
// ─────────────────────────────────────────────────────────────────────────
export type Suit = "s" | "h" | "d" | "c";
export type Rank =
  | "A" | "K" | "Q" | "J" | "T"
  | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";
export type Card = `${Rank}${Suit}`;

export const SUITS: readonly Suit[] = ["s", "h", "d", "c"];
export const RANKS: readonly Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A",
];

// ─────────────────────────────────────────────────────────────────────────
// Game model
// ─────────────────────────────────────────────────────────────────────────
export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";

/** Phase of the whole table (not a single hand). "ended" = host closed the game. */
export type TablePhase = "lobby" | "in_hand" | "hand_over" | "ended";

export type GameMode = "cash" | "tournament";

export interface BlindLevel {
  sb: number;
  bb: number;
  /** Per-player ante for this level (0 = none). Traditional ante format. */
  ante: number;
}

/** Ante config: the ante is a percentage of the current big blind (0 = off). */
export interface AnteConfig {
  pctOfBB: number;
}

/** Prize payout as percentages of the pool for places 1..N (must sum to 100). */
export type PayoutStructure = number[];

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export interface Action {
  type: ActionType;
  /** Total chips this action commits for bet/raise (the "to" amount, not the delta). */
  amount?: number;
}

/** What a given player is currently allowed to do (sent to the acting client). */
export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  /** Minimum legal total for a bet/raise. */
  minRaiseTo: number;
  /** Maximum legal total (i.e. all-in). */
  maxRaiseTo: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  seat: number;
  stack: number;
  /** Chips committed in the current betting round. */
  bet: number;
  hasFolded: boolean;
  isAllIn: boolean;
  isConnected: boolean;
  /** Revealed hole cards at showdown; null while hidden. */
  revealed: [Card, Card] | null;
  /** Tournament: busted out of the tournament. */
  isOut: boolean;
  /** Tournament: finishing place (1 = winner), or null if still playing. */
  place: number | null;
  /** Sitting out — seated but not dealt into hands (cash). */
  sittingOut: boolean;
  /** Cash: total winnings/losses vs. total bought in (net), for display. */
  net: number;
}

export interface Pot {
  amount: number;
  /** Player ids eligible to win this pot. */
  eligible: string[];
}

export interface TournamentInfo {
  isComplete: boolean;
  winnerId: string | null;
  /** Finishing places recorded so far (1 = winner), with prize won. */
  placements: { playerId: string; place: number; prize: number }[];
  playersLeft: number;
  totalPlayers: number;
  /** Entry buy-in per player and the total prize pool. */
  buyIn: number;
  prizePool: number;
  /** Payout as prize amounts by place, e.g. [{place:1,amount:650},...]. */
  payouts: { place: number; amount: number }[];
}

export interface PublicTableState {
  code: string;
  phase: TablePhase;
  street: Street;
  players: PublicPlayer[];
  board: Card[];
  pots: Pot[];
  /** Total on the table this hand (all pots + uncollected bets), for display. */
  totalPot: number;
  buttonSeat: number;
  /** Seat whose turn it is to act, or null. */
  activeSeat: number | null;
  smallBlind: number;
  bigBlind: number;
  /** Effective per-player ante this hand (0 = none). */
  ante: number;
  hostId: string;
  /** Populated when phase === "hand_over". */
  lastResult: HandResult | null;

  // Cash buy-in / rebuy.
  minBuyIn: number;
  maxBuyIn: number;
  /** Pending rebuy requests awaiting host approval (cash). */
  pendingRebuys: { playerId: string; name: string; amount: number }[];

  // Mode + tournament.
  mode: GameMode;
  /** Current blind level index (tournament). */
  level: number;
  blinds: { current: BlindLevel; next: BlindLevel | null };
  /** Epoch ms when blinds next rise (tournament, in-progress), else null. */
  nextBlindAt: number | null;
  /** Epoch ms when the active player's turn auto-resolves, else null. */
  turnEndsAt: number | null;
  /** Configured turn clock in seconds (0 = no clock). For the countdown ring. */
  turnSeconds: number;
  /** Host has ended the game; it closes when the current hand finishes. */
  endingAfterHand: boolean;
  tournament: TournamentInfo | null;
}

export interface HandResultWinner {
  playerId: string;
  amount: number;
  /** Human description e.g. "Full House, Aces over Kings". */
  handName: string;
  /** The 5 cards forming the winning hand (empty if won by fold). */
  cards: Card[];
}

export interface HandResult {
  winners: HandResultWinner[];
  /** Showdown reveals: playerId -> their two hole cards. */
  shownHands: Record<string, [Card, Card]>;
  wonByFold: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Animation events (server -> client). The client replays these to drive
// GSAP animations; PublicTableState is the source of truth for final layout.
// ─────────────────────────────────────────────────────────────────────────
export type GameEvent =
  | { kind: "handStart"; buttonSeat: number; sbSeat: number; bbSeat: number }
  | { kind: "dealHole"; order: number[] } // seat order cards are dealt to
  | { kind: "postBlind"; seat: number; amount: number; blind: "sb" | "bb" }
  | { kind: "postAnte"; seat: number; amount: number }
  | { kind: "rebuy"; seat: number; amount: number }
  | { kind: "action"; seat: number; action: ActionType; amount: number }
  | { kind: "street"; street: Street; cards: Card[] }
  | { kind: "showdown"; result: HandResult }
  | { kind: "potAward"; winners: HandResultWinner[] }
  | { kind: "levelUp"; level: number; sb: number; bb: number }
  | { kind: "bust"; seat: number; place: number };

// ─────────────────────────────────────────────────────────────────────────
// Wire protocol
// ─────────────────────────────────────────────────────────────────────────
export interface GameConfigMsg {
  mode: GameMode;
  levelSeconds?: number;
  /** Per-turn action clock in seconds (0 = off). */
  turnSeconds?: number;
  /** Cash blinds (tournaments use the escalating schedule). */
  smallBlind?: number;
  bigBlind?: number;
  /** Starting chip stack (both modes). */
  startingStack?: number;
  /** Cash rebuy range (chips). */
  minBuyIn?: number;
  maxBuyIn?: number;
  /** Ante as a percentage of the big blind (0 = off). */
  antePctOfBB?: number;
  /** Tournament entry buy-in (funds the prize pool). */
  buyIn?: number;
  /** Tournament payout percentages by place (must sum to 100). */
  payout?: PayoutStructure;
}

export type ClientMessage =
  | { t: "join"; name: string }
  | ({ t: "config" } & GameConfigMsg)
  | { t: "start" }
  | { t: "action"; action: ActionType; amount?: number }
  | { t: "requestRebuy"; amount: number }
  | { t: "rebuyDecision"; playerId: string; approve: boolean }
  | { t: "sitOut" }
  | { t: "sitIn" }
  | { t: "endGame" }
  | { t: "nextHand" };

export type ServerMessage =
  | { t: "welcome"; playerId: string; state: PublicTableState }
  | { t: "state"; state: PublicTableState }
  | { t: "hole"; cards: [Card, Card] }
  | { t: "legal"; actions: LegalActions | null }
  | { t: "event"; event: GameEvent }
  | { t: "error"; message: string };

export const DEFAULTS = {
  MAX_SEATS: 6,
  STARTING_STACK: 1000,
  SMALL_BLIND: 5,
  BIG_BLIND: 10,
  /** Tournament: seconds per blind level before escalation. */
  LEVEL_SECONDS: 180,
  /** Seconds a player has to act before auto fold/check. */
  TURN_SECONDS: 30,
  /** Seconds between a hand ending and the next auto-dealing (tournament). */
  HAND_DELAY_SECONDS: 4,
  /** Cash rebuy range as multiples of the starting stack. */
  MIN_BUYIN_FACTOR: 0.4,
  MAX_BUYIN_FACTOR: 2.5,
  /** Tournament default entry buy-in (play-money credits). */
  TOURNEY_BUYIN: 100,
} as const;

/** Named prize payout structures (percentages by place). */
export const PAYOUT_PRESETS: { id: string; name: string; pct: PayoutStructure }[] = [
  { id: "wta", name: "Winner takes all", pct: [100] },
  { id: "top2", name: "Top 2 · 65 / 35", pct: [65, 35] },
  { id: "top3", name: "Top 3 · 50 / 30 / 20", pct: [50, 30, 20] },
];

/** Standard escalating blind schedule for tournaments (ante driven by config). */
export const BLIND_SCHEDULE: BlindLevel[] = [
  { sb: 5, bb: 10, ante: 0 },
  { sb: 10, bb: 20, ante: 0 },
  { sb: 15, bb: 30, ante: 0 },
  { sb: 25, bb: 50, ante: 0 },
  { sb: 50, bb: 100, ante: 0 },
  { sb: 75, bb: 150, ante: 0 },
  { sb: 100, bb: 200, ante: 0 },
  { sb: 150, bb: 300, ante: 0 },
  { sb: 200, bb: 400, ante: 0 },
  { sb: 300, bb: 600, ante: 0 },
  { sb: 400, bb: 800, ante: 0 },
  { sb: 600, bb: 1200, ante: 0 },
  { sb: 1000, bb: 2000, ante: 0 },
];
