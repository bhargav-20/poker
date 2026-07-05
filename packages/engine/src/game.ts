import {
  BLIND_SCHEDULE,
  DEFAULTS,
  type Action,
  type BlindLevel,
  type Card,
  type GameEvent,
  type GameMode,
  type HandResult,
  type HandResultWinner,
  type LegalActions,
  type PayoutStructure,
  type PublicPlayer,
  type PublicTableState,
  type Street,
  type TablePhase,
  type TournamentInfo,
} from "@poker/shared";
import { makeDeck, shuffle, type RNG } from "./deck.js";
import { findWinners } from "./evaluate.js";
import { computePots, type Contributor } from "./pots.js";

interface EnginePlayer {
  id: string;
  name: string;
  seat: number;
  stack: number;
  bet: number; // committed this betting round
  committed: number; // committed this whole hand (for side pots)
  hole: [Card, Card] | null;
  hasFolded: boolean;
  isAllIn: boolean;
  isConnected: boolean;
  hasActedThisRound: boolean;
  inHand: boolean; // dealt into the current hand
  stackAtHandStart: number; // for tournament placement tie-breaks
  place: number | null; // tournament finishing place (null = still in)
  sittingOut: boolean; // cash: seated but not dealt in
  boughtIn: number; // cash: cumulative chips bought in (for net)
  prize: number; // tournament: prize awarded
}

export interface GameConfig {
  code: string;
  maxSeats?: number;
  startingStack?: number;
  smallBlind?: number;
  bigBlind?: number;
  mode?: GameMode;
  blindSchedule?: BlindLevel[];
  antePctOfBB?: number;
  minBuyIn?: number;
  maxBuyIn?: number;
  buyIn?: number;
  payout?: PayoutStructure;
  turnSeconds?: number;
  rng?: RNG;
}

export class PokerGame {
  readonly code: string;
  readonly maxSeats: number;
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  private rng: RNG;

  private players = new Map<string, EnginePlayer>();
  private deck: Card[] = [];
  board: Card[] = [];
  phase: TablePhase = "lobby";
  street: Street = "preflop";
  buttonSeat = -1;
  activeSeat: number | null = null;
  hostId = "";

  // Mode + tournament state.
  mode: GameMode = "cash";
  blindSchedule: BlindLevel[];
  level = 0;
  /** Server-managed display timers (epoch ms), injected before broadcast. */
  nextBlindAt: number | null = null;
  turnEndsAt: number | null = null;
  private registered = new Set<string>();
  private totalPlayers = 0;
  private tournamentComplete = false;
  private winnerId: string | null = null;

  // Ante + buy-in config.
  antePctOfBB = 0;
  minBuyIn: number;
  maxBuyIn: number;
  buyIn: number; // tournament entry
  payout: PayoutStructure;
  turnSeconds: number; // per-turn action clock (0 = off)
  private prizePool = 0;
  private ante = 0; // effective ante this hand
  private pendingRebuys = new Map<string, number>();
  private endRequested = false; // host asked to end; applied when the hand ends

  private currentBet = 0; // highest bet to match this round
  private lastRaiseSize = 0; // size of the last raise (for min-raise rule)
  private handBb = 0; // big blind locked in for the current hand
  private lastResult: HandResult | null = null;

  constructor(cfg: GameConfig) {
    this.code = cfg.code;
    this.maxSeats = cfg.maxSeats ?? DEFAULTS.MAX_SEATS;
    this.startingStack = cfg.startingStack ?? DEFAULTS.STARTING_STACK;
    this.mode = cfg.mode ?? "cash";
    this.blindSchedule = cfg.blindSchedule ?? BLIND_SCHEDULE;
    this.smallBlind = cfg.smallBlind ?? this.blindSchedule[0]!.sb;
    this.bigBlind = cfg.bigBlind ?? this.blindSchedule[0]!.bb;
    this.antePctOfBB = cfg.antePctOfBB ?? 0;
    this.minBuyIn = cfg.minBuyIn ?? Math.round(this.startingStack * DEFAULTS.MIN_BUYIN_FACTOR);
    this.maxBuyIn = cfg.maxBuyIn ?? Math.round(this.startingStack * DEFAULTS.MAX_BUYIN_FACTOR);
    this.buyIn = cfg.buyIn ?? DEFAULTS.TOURNEY_BUYIN;
    this.payout = cfg.payout ?? [100];
    this.turnSeconds = cfg.turnSeconds ?? DEFAULTS.TURN_SECONDS;
    this.rng = cfg.rng ?? Math.random;
  }

  /**
   * Host closes the game. If a hand is in progress, the end is deferred until it
   * completes (so the pot is awarded first); otherwise it ends immediately.
   */
  endGame(hostId: string): { ok: boolean; error?: string } {
    if (hostId !== this.hostId) return { ok: false, error: "Only the host can end the game" };
    if (this.phase === "in_hand") {
      this.endRequested = true;
    } else {
      this.phase = "ended";
      this.activeSeat = null;
    }
    return { ok: true };
  }

  /** Configure the game before it starts. Lobby only. */
  configure(opts: {
    mode?: GameMode;
    startingStack?: number;
    minBuyIn?: number;
    maxBuyIn?: number;
    buyIn?: number;
    antePctOfBB?: number;
    payout?: PayoutStructure;
    turnSeconds?: number;
    smallBlind?: number;
    bigBlind?: number;
  }): void {
    if (this.phase !== "lobby") return;
    if (opts.mode) {
      this.mode = opts.mode;
      if (opts.mode === "tournament") {
        this.level = 0;
        this.smallBlind = this.blindSchedule[0]!.sb;
        this.bigBlind = this.blindSchedule[0]!.bb;
      }
    }
    if (opts.startingStack) {
      this.startingStack = opts.startingStack;
      this.minBuyIn = Math.round(this.startingStack * DEFAULTS.MIN_BUYIN_FACTOR);
      this.maxBuyIn = Math.round(this.startingStack * DEFAULTS.MAX_BUYIN_FACTOR);
      // Reset seated players (still in lobby) to the new stack.
      for (const p of this.players.values()) {
        p.stack = this.startingStack;
        p.boughtIn = this.startingStack;
      }
    }
    if (opts.minBuyIn !== undefined) this.minBuyIn = opts.minBuyIn;
    if (opts.maxBuyIn !== undefined) this.maxBuyIn = opts.maxBuyIn;
    if (opts.buyIn !== undefined) this.buyIn = opts.buyIn;
    if (opts.antePctOfBB !== undefined) this.antePctOfBB = Math.max(0, opts.antePctOfBB);
    if (opts.payout && opts.payout.length > 0) this.payout = opts.payout;
    if (opts.turnSeconds !== undefined) this.turnSeconds = Math.max(0, opts.turnSeconds);
    // Custom blinds apply to cash games; tournaments use the escalating schedule.
    if (this.mode !== "tournament") {
      if (opts.smallBlind !== undefined) this.smallBlind = Math.max(1, Math.round(opts.smallBlind));
      if (opts.bigBlind !== undefined) {
        this.bigBlind = Math.max(this.smallBlind + 1, Math.round(opts.bigBlind));
      }
    }
  }

  /** Escalate to the next blind level (tournament). Applies to the next hand. */
  escalateBlinds(): GameEvent | null {
    if (this.mode !== "tournament") return null;
    if (this.level >= this.blindSchedule.length - 1) return null;
    this.level += 1;
    const lvl = this.blindSchedule[this.level]!;
    this.smallBlind = lvl.sb;
    this.bigBlind = lvl.bb;
    return { kind: "levelUp", level: this.level, sb: lvl.sb, bb: lvl.bb };
  }

  isComplete(): boolean {
    return this.tournamentComplete;
  }

  // ── Membership ─────────────────────────────────────────────────────────
  addPlayer(id: string, name: string): { ok: boolean; error?: string } {
    if (this.players.has(id)) {
      this.players.get(id)!.isConnected = true;
      return { ok: true };
    }
    const taken = new Set([...this.players.values()].map((p) => p.seat));
    let seat = -1;
    for (let s = 0; s < this.maxSeats; s++) {
      if (!taken.has(s)) {
        seat = s;
        break;
      }
    }
    if (seat === -1) return { ok: false, error: "Table is full" };
    if (this.players.size === 0) this.hostId = id;
    this.players.set(id, {
      id,
      name,
      seat,
      stack: this.startingStack,
      bet: 0,
      committed: 0,
      hole: null,
      hasFolded: false,
      isAllIn: false,
      isConnected: true,
      hasActedThisRound: false,
      inHand: false,
      stackAtHandStart: this.startingStack,
      place: null,
      sittingOut: false,
      boughtIn: this.startingStack,
      prize: 0,
    });
    return { ok: true };
  }

  // ── Cash: sit out / rebuy (host-approved) ───────────────────────────────────
  setSitOut(id: string, sittingOut: boolean): { ok: boolean; error?: string } {
    const p = this.players.get(id);
    if (!p) return { ok: false, error: "Not at table" };
    if (sittingOut === false && p.stack <= 0) {
      return { ok: false, error: "Rebuy before sitting back in" };
    }
    p.sittingOut = sittingOut;
    return { ok: true };
  }

  requestRebuy(id: string, amount: number): { ok: boolean; error?: string } {
    const p = this.players.get(id);
    if (!p) return { ok: false, error: "Not at table" };
    if (this.mode !== "cash") return { ok: false, error: "Rebuys are cash-game only" };
    const amt = Math.round(amount);
    if (p.stack + amt > this.maxBuyIn) {
      return { ok: false, error: `Max buy-in is ${this.maxBuyIn}` };
    }
    if (amt < this.minBuyIn && p.stack === 0) {
      return { ok: false, error: `Min buy-in is ${this.minBuyIn}` };
    }
    if (amt <= 0) return { ok: false, error: "Invalid amount" };
    this.pendingRebuys.set(id, amt);
    return { ok: true };
  }

  /** Host approves/denies a pending rebuy. Returns an event on approval. */
  resolveRebuy(
    hostId: string,
    id: string,
    approve: boolean,
  ): { ok: boolean; error?: string; event?: GameEvent } {
    if (hostId !== this.hostId) return { ok: false, error: "Only the host can approve" };
    const amt = this.pendingRebuys.get(id);
    if (amt === undefined) return { ok: false, error: "No pending rebuy" };
    this.pendingRebuys.delete(id);
    if (!approve) return { ok: true };
    const p = this.players.get(id);
    if (!p) return { ok: false, error: "Player left" };
    p.stack += amt;
    p.boughtIn += amt;
    p.sittingOut = false;
    return { ok: true, event: { kind: "rebuy", seat: p.seat, amount: amt } };
  }

  /** True once a tournament has started (registration closed). */
  private started(): boolean {
    return this.registered.size > 0;
  }

  setConnected(id: string, connected: boolean): void {
    const p = this.players.get(id);
    if (p) p.isConnected = connected;
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  getHole(id: string): [Card, Card] | null {
    return this.players.get(id)?.hole ?? null;
  }

  // ── Hand lifecycle ───────────────────────────────────────────────────────
  canStart(): boolean {
    return this.seatedWithChips().length >= 2 && this.phase !== "in_hand";
  }

  startHand(byId?: string): { events: GameEvent[]; error?: string } {
    if (byId && byId !== this.hostId) return { events: [], error: "Only the host can start" };
    if (!this.canStart()) return { events: [], error: "Need at least 2 players" };

    const participants = this.seatedWithChips();
    // First tournament hand: close registration, snapshot the field.
    if (this.mode === "tournament" && !this.started()) {
      this.totalPlayers = participants.length;
      for (const p of participants) this.registered.add(p.id);
      this.prizePool = this.buyIn * this.totalPlayers;
    }
    for (const p of this.players.values()) {
      p.bet = 0;
      p.committed = 0;
      p.hole = null;
      p.hasFolded = false;
      p.isAllIn = false;
      p.hasActedThisRound = false;
      p.inHand = participants.includes(p);
      p.stackAtHandStart = p.stack;
    }
    this.board = [];
    this.street = "preflop";
    this.phase = "in_hand";
    this.lastResult = null;
    this.deck = shuffle(makeDeck(), this.rng);

    // Move the button to the next participant seat.
    this.buttonSeat = this.nextSeat(this.buttonSeat, (p) => p.inHand);

    const events: GameEvent[] = [];
    const heads = participants.length === 2;
    const sbSeat = heads
      ? this.buttonSeat
      : this.nextSeat(this.buttonSeat, (p) => p.inHand);
    const bbSeat = this.nextSeat(sbSeat, (p) => p.inHand);
    events.push({ kind: "handStart", buttonSeat: this.buttonSeat, sbSeat, bbSeat });

    // Deal two hole cards to each participant, starting left of the button.
    const dealOrder = this.seatsFrom(
      this.nextSeat(this.buttonSeat, (p) => p.inHand),
      (p) => p.inHand,
    );
    for (const seat of dealOrder) {
      const p = this.playerAtSeat(seat)!;
      p.hole = [this.deck.pop()!, this.deck.pop()!];
    }
    events.push({ kind: "dealHole", order: dealOrder });

    // Lock in this hand's big blind so a mid-hand escalation doesn't change
    // min-raise sizing until the next hand.
    this.handBb = this.bigBlind;

    // Post antes (traditional format: every player in the hand), before blinds.
    // Antes are dead money — they go to the pot but not to the betting line.
    this.ante = this.antePctOfBB > 0 ? Math.round((this.antePctOfBB / 100) * this.handBb) : 0;
    if (this.ante > 0) {
      for (const seat of this.seatsFrom(this.buttonSeat, (p) => p.inHand)) {
        this.postAnte(seat, this.ante, events);
      }
    }

    // Post blinds.
    this.postBlind(sbSeat, this.smallBlind, events, "sb");
    this.postBlind(bbSeat, this.bigBlind, events, "bb");
    this.currentBet = this.handBb;
    this.lastRaiseSize = this.handBb;

    // First to act preflop: heads-up = button (SB); otherwise seat after BB.
    const firstToAct = heads
      ? this.buttonSeat
      : this.nextSeat(bbSeat, (p) => this.canAct(p));
    this.activeSeat = this.playerAtSeat(firstToAct)!.inHand ? firstToAct : null;
    // Edge case: if the blinds put everyone all-in, the round is already
    // complete — resolve immediately. Otherwise wait for action.
    if (this.isRoundComplete()) this.settleIfRoundDone(events);
    return { events };
  }

  private postBlind(
    seat: number,
    amount: number,
    events: GameEvent[],
    blind: "sb" | "bb",
  ): void {
    const p = this.playerAtSeat(seat)!;
    const post = Math.min(amount, p.stack);
    p.stack -= post;
    p.bet += post;
    p.committed += post;
    if (p.stack === 0) p.isAllIn = true;
    events.push({ kind: "postBlind", seat, amount: post, blind });
  }

  /** Post an ante into the pot (not the betting line). May put a short stack all-in. */
  private postAnte(seat: number, amount: number, events: GameEvent[]): void {
    const p = this.playerAtSeat(seat)!;
    const post = Math.min(amount, p.stack);
    if (post <= 0) return;
    p.stack -= post;
    p.committed += post;
    if (p.stack === 0) p.isAllIn = true;
    events.push({ kind: "postAnte", seat, amount: post });
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  legalActions(id: string): LegalActions | null {
    const p = this.players.get(id);
    if (!p || this.phase !== "in_hand" || this.activeSeat !== p.seat) return null;
    const toCall = this.currentBet - p.bet;
    const canCheck = toCall <= 0;
    const canCall = toCall > 0 && p.stack > 0;
    const callAmount = Math.min(toCall, p.stack);
    // Minimum legal raise total = currentBet + last raise size (capped by stack).
    const minRaiseTo = this.currentBet + this.lastRaiseSize;
    const maxRaiseTo = p.bet + p.stack; // all-in
    const canRaise = this.currentBet > 0 && maxRaiseTo > this.currentBet;
    const canBet = this.currentBet === 0 && p.stack > 0;
    return {
      canFold: true,
      canCheck,
      canCall,
      callAmount,
      canBet,
      canRaise,
      minRaiseTo: Math.min(minRaiseTo, maxRaiseTo),
      maxRaiseTo,
    };
  }

  act(id: string, action: Action): { events: GameEvent[]; error?: string } {
    const p = this.players.get(id);
    if (!p) return { events: [], error: "Not at table" };
    if (this.phase !== "in_hand" || this.activeSeat !== p.seat) {
      return { events: [], error: "Not your turn" };
    }
    const legal = this.legalActions(id)!;
    const events: GameEvent[] = [];
    const toCall = this.currentBet - p.bet;

    switch (action.type) {
      case "fold": {
        p.hasFolded = true;
        p.hasActedThisRound = true;
        events.push({ kind: "action", seat: p.seat, action: "fold", amount: 0 });
        break;
      }
      case "check": {
        if (!legal.canCheck) return { events: [], error: "Cannot check" };
        p.hasActedThisRound = true;
        events.push({ kind: "action", seat: p.seat, action: "check", amount: 0 });
        break;
      }
      case "call": {
        if (toCall <= 0) return { events: [], error: "Nothing to call" };
        const pay = Math.min(toCall, p.stack);
        this.commit(p, pay);
        p.hasActedThisRound = true;
        events.push({ kind: "action", seat: p.seat, action: "call", amount: pay });
        break;
      }
      case "bet":
      case "raise": {
        const target = action.amount ?? 0;
        const res = this.applyRaise(p, target, legal);
        if (res.error) return { events: [], error: res.error };
        events.push({ kind: "action", seat: p.seat, action: action.type, amount: target });
        break;
      }
      case "allin": {
        const target = p.bet + p.stack;
        if (target > this.currentBet) {
          this.applyRaise(p, target, legal, true);
        } else {
          this.commit(p, p.stack); // all-in call/short
        }
        p.hasActedThisRound = true;
        events.push({ kind: "action", seat: p.seat, action: "allin", amount: target });
        break;
      }
      default:
        return { events: [], error: "Unknown action" };
    }

    this.advance(events);
    return { events };
  }

  private commit(p: EnginePlayer, amount: number): void {
    const pay = Math.min(amount, p.stack);
    p.stack -= pay;
    p.bet += pay;
    p.committed += pay;
    if (p.stack === 0) p.isAllIn = true;
  }

  private applyRaise(
    p: EnginePlayer,
    target: number,
    legal: LegalActions,
    isAllIn = false,
  ): { error?: string } {
    if (target > legal.maxRaiseTo) return { error: "Raise exceeds stack" };
    // A full raise must reach at least minRaiseTo, unless it's an all-in shove
    // for less (allowed, but does not reopen betting).
    const isFull = target >= legal.minRaiseTo;
    if (!isAllIn && !isFull) return { error: "Raise below minimum" };
    if (target <= this.currentBet && !isAllIn) return { error: "Raise must exceed current bet" };

    const delta = target - p.bet;
    const raiseSize = target - this.currentBet;
    this.commit(p, delta);

    if (raiseSize >= this.lastRaiseSize || isFull) {
      // A full raise reopens the betting round.
      this.lastRaiseSize = Math.max(raiseSize, this.lastRaiseSize);
      this.currentBet = target;
      for (const o of this.inHandPlayers()) {
        if (o !== p && !o.hasFolded && !o.isAllIn) o.hasActedThisRound = false;
      }
    } else {
      // Short all-in: raises the amount to match but does NOT reopen action.
      this.currentBet = Math.max(this.currentBet, target);
    }
    p.hasActedThisRound = true;
    return {};
  }

  // ── Round / street progression ────────────────────────────────────────────
  private advance(events: GameEvent[]): void {
    // Everyone folded but one → award immediately.
    const live = this.inHandPlayers().filter((p) => !p.hasFolded);
    if (live.length === 1) {
      this.awardByFold(live[0]!, events);
      return;
    }
    if (this.isRoundComplete()) {
      this.settleIfRoundDone(events);
    } else {
      this.activeSeat = this.nextSeat(this.activeSeat!, (p) => this.canAct(p));
    }
  }

  private settleIfRoundDone(events: GameEvent[]): void {
    // Collect this round's bets are already in `committed`; reset per-street bet.
    // Decide whether more betting is possible on later streets.
    const canStillAct = this.inHandPlayers().filter((p) => this.canAct(p));
    const live = this.inHandPlayers().filter((p) => !p.hasFolded);
    if (live.length === 1) {
      this.awardByFold(live[0]!, events);
      return;
    }
    if (this.street === "river" || canStillAct.length <= 1) {
      // No further betting possible → run out remaining board, then showdown.
      this.runOutBoard(events);
      this.showdown(events);
      return;
    }
    this.nextStreet(events);
  }

  private nextStreet(events: GameEvent[]): void {
    for (const p of this.inHandPlayers()) {
      p.bet = 0;
      p.hasActedThisRound = false;
    }
    this.currentBet = 0;
    this.lastRaiseSize = this.handBb;

    const order: Street[] = ["preflop", "flop", "turn", "river"];
    const idx = order.indexOf(this.street);
    this.street = order[idx + 1]!;
    if (this.street === "flop") this.dealBoard(3);
    else this.dealBoard(1);
    events.push({ kind: "street", street: this.street, cards: [...this.board] });

    // First to act postflop = first active seat left of the button.
    this.activeSeat = this.nextSeat(this.buttonSeat, (p) => this.canAct(p));
    // If nobody can act (all all-in), keep running out.
    if (this.inHandPlayers().filter((p) => this.canAct(p)).length <= 1) {
      this.settleIfRoundDone(events);
    }
  }

  private runOutBoard(events: GameEvent[]): void {
    const order: Street[] = ["preflop", "flop", "turn", "river"];
    while (this.board.length < 5) {
      const idx = order.indexOf(this.street);
      this.street = order[idx + 1]!;
      this.dealBoard(this.street === "flop" ? 3 : 1);
      events.push({ kind: "street", street: this.street, cards: [...this.board] });
    }
  }

  private dealBoard(n: number): void {
    for (let i = 0; i < n; i++) this.board.push(this.deck.pop()!);
  }

  private isRoundComplete(): boolean {
    const contenders = this.inHandPlayers().filter((p) => !p.hasFolded && !p.isAllIn);
    if (contenders.length === 0) return true;
    return contenders.every((p) => p.hasActedThisRound && p.bet === this.currentBet);
  }

  // ── Resolution ────────────────────────────────────────────────────────────
  private awardByFold(winner: EnginePlayer, events: GameEvent[]): void {
    const total = this.inHandPlayers().reduce((s, p) => s + p.committed, 0);
    winner.stack += total;
    const w: HandResultWinner = {
      playerId: winner.id,
      amount: total,
      handName: "",
      cards: [],
    };
    this.lastResult = { winners: [w], shownHands: {}, wonByFold: true };
    events.push({ kind: "potAward", winners: [w] });
    this.endHand(events);
  }

  private showdown(events: GameEvent[]): void {
    const contribs: Contributor[] = this.inHandPlayers().map((p) => ({
      id: p.id,
      committed: p.committed,
      folded: p.hasFolded,
    }));
    const pots = computePots(contribs);

    const shownHands: Record<string, [Card, Card]> = {};
    for (const p of this.inHandPlayers()) {
      if (!p.hasFolded && p.hole) shownHands[p.id] = p.hole;
    }

    const winnersByPlayer = new Map<string, HandResultWinner>();
    for (const pot of pots) {
      const entries = pot.eligible
        .map((id) => this.players.get(id)!)
        .filter((p) => p.hole)
        .map((p) => ({ id: p.id, hole: p.hole! }));
      if (entries.length === 0) continue;
      const { winnerIds, ranked } = findWinners(entries, this.board);
      const share = Math.floor(pot.amount / winnerIds.length);
      let remainder = pot.amount - share * winnerIds.length;
      // Odd chip goes to the first winner clockwise from the button.
      const ordered = this.seatsFrom(this.buttonSeat, (p) => winnerIds.includes(p.id))
        .map((seat) => this.playerAtSeat(seat)!.id);
      for (const id of ordered) {
        const p = this.players.get(id)!;
        let amt = share;
        if (remainder > 0) {
          amt += 1;
          remainder -= 1;
        }
        p.stack += amt;
        const r = ranked.get(id)!;
        const existing = winnersByPlayer.get(id);
        if (existing) {
          existing.amount += amt;
        } else {
          winnersByPlayer.set(id, {
            playerId: id,
            amount: amt,
            handName: r.descr,
            cards: r.cards,
          });
        }
      }
    }

    const winners = [...winnersByPlayer.values()];
    this.lastResult = { winners, shownHands, wonByFold: false };
    events.push({ kind: "showdown", result: this.lastResult });
    events.push({ kind: "potAward", winners });
    this.endHand(events);
  }

  private endHand(events: GameEvent[]): void {
    // All chips are back in stacks now; clear per-hand bet accounting so the
    // public view and chip totals are clean.
    for (const p of this.players.values()) {
      p.bet = 0;
      p.committed = 0;
    }

    // Tournament: eliminate busted players and record finishing places.
    if (this.mode === "tournament" && this.started()) {
      const remaining = [...this.players.values()].filter(
        (p) => this.registered.has(p.id) && p.place === null,
      );
      const alive = remaining.filter((p) => p.stack > 0);
      const busted = remaining.filter((p) => p.stack <= 0);
      const amounts = this.payoutAmounts();
      // More chips at hand start → better (lower) finishing place.
      busted.sort((a, b) => b.stackAtHandStart - a.stackAtHandStart);
      busted.forEach((p, i) => {
        p.place = alive.length + 1 + i;
        p.prize = amounts[p.place - 1] ?? 0;
        events.push({ kind: "bust", seat: p.seat, place: p.place });
      });
      if (alive.length === 1) {
        const champ = alive[0]!;
        champ.place = 1;
        champ.prize = amounts[0] ?? 0;
        this.winnerId = champ.id;
        this.tournamentComplete = true;
      }
    }

    // If the host asked to end during the hand, close the game now that the pot
    // has been awarded; otherwise pause between hands.
    this.phase = this.endRequested ? "ended" : "hand_over";
    this.endRequested = false;
    this.activeSeat = null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private seatedWithChips(): EnginePlayer[] {
    return [...this.players.values()]
      .filter((p) => {
        if (p.stack <= 0) return false;
        if (this.mode === "tournament") {
          // After it starts, only registered players; disconnected still get
          // dealt in and blinded off (the server auto-folds their turns).
          return this.started() ? this.registered.has(p.id) : true;
        }
        return p.isConnected && !p.sittingOut;
      })
      .sort((a, b) => a.seat - b.seat);
  }

  /** Prize amount for each finishing place (index 0 = 1st), renormalized. */
  private payoutAmounts(): number[] {
    return this.payoutPreview(this.prizePool, this.totalPlayers);
  }

  private inHandPlayers(): EnginePlayer[] {
    return [...this.players.values()]
      .filter((p) => p.inHand)
      .sort((a, b) => a.seat - b.seat);
  }

  private playerAtSeat(seat: number): EnginePlayer | undefined {
    return [...this.players.values()].find((p) => p.seat === seat);
  }

  private canAct(p: EnginePlayer): boolean {
    return p.inHand && !p.hasFolded && !p.isAllIn && p.stack > 0;
  }

  /** Next seat clockwise from `seat` (exclusive) whose player matches pred. */
  private nextSeat(seat: number, pred: (p: EnginePlayer) => boolean): number {
    for (let i = 1; i <= this.maxSeats; i++) {
      const s = (seat + i + this.maxSeats) % this.maxSeats;
      const p = this.playerAtSeat(s);
      if (p && pred(p)) return s;
    }
    // Fallback: the seat itself if it matches (single-player edge cases).
    const self = this.playerAtSeat(((seat % this.maxSeats) + this.maxSeats) % this.maxSeats);
    return self && pred(self) ? self.seat : seat;
  }

  /** Seats clockwise starting just after `seat`, matching pred, wrapping once. */
  private seatsFrom(seat: number, pred: (p: EnginePlayer) => boolean): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.maxSeats; i++) {
      const s = (seat + i + this.maxSeats) % this.maxSeats;
      const p = this.playerAtSeat(s);
      if (p && pred(p)) out.push(s);
    }
    return out;
  }

  // ── Public view ────────────────────────────────────────────────────────────
  toPublic(): PublicTableState {
    const players: PublicPlayer[] = [...this.players.values()]
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        stack: p.stack,
        bet: p.bet,
        hasFolded: p.hasFolded,
        isAllIn: p.isAllIn,
        isConnected: p.isConnected,
        revealed:
          this.lastResult && !this.lastResult.wonByFold && this.lastResult.shownHands[p.id]
            ? this.lastResult.shownHands[p.id]!
            : null,
        isOut: this.mode === "tournament" && p.place !== null && p.place !== 1,
        place: p.place,
        sittingOut: p.sittingOut,
        net: this.mode === "cash" ? p.stack - p.boughtIn : 0,
      }));
    const pots = computePots(
      this.inHandPlayers().map((p) => ({
        id: p.id,
        committed: p.committed,
        folded: p.hasFolded,
      })),
    );
    const totalPot = pots.reduce((s, x) => s + x.amount, 0);
    return {
      code: this.code,
      phase: this.phase,
      street: this.street,
      players,
      board: [...this.board],
      pots,
      totalPot,
      buttonSeat: this.buttonSeat,
      activeSeat: this.activeSeat,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      ante: this.ante,
      hostId: this.hostId,
      lastResult: this.lastResult,
      minBuyIn: this.minBuyIn,
      maxBuyIn: this.maxBuyIn,
      pendingRebuys: [...this.pendingRebuys.entries()].map(([id, amount]) => ({
        playerId: id,
        name: this.players.get(id)?.name ?? "?",
        amount,
      })),
      mode: this.mode,
      level: this.level,
      blinds: {
        current: { sb: this.smallBlind, bb: this.bigBlind, ante: this.ante },
        next: this.nextBlindLevel(),
      },
      nextBlindAt: this.nextBlindAt,
      turnEndsAt: this.turnEndsAt,
      turnSeconds: this.turnSeconds,
      endingAfterHand: this.endRequested,
      tournament: this.mode === "tournament" ? this.tournamentInfo() : null,
    };
  }

  private nextBlindLevel(): BlindLevel | null {
    const lvl = this.blindSchedule[this.level + 1];
    if (!lvl) return null;
    const ante = this.antePctOfBB > 0 ? Math.round((this.antePctOfBB / 100) * lvl.bb) : 0;
    return { sb: lvl.sb, bb: lvl.bb, ante };
  }

  private tournamentInfo(): TournamentInfo {
    const placements = [...this.players.values()]
      .filter((p) => p.place !== null)
      .map((p) => ({ playerId: p.id, place: p.place!, prize: p.prize }))
      .sort((a, b) => a.place - b.place);
    const playersLeft = [...this.players.values()].filter(
      (p) => this.registered.has(p.id) && p.place === null,
    ).length;
    const started = this.started();
    const entrants = started ? this.totalPlayers : this.seatedWithChips().length;
    const pool = started ? this.prizePool : this.buyIn * entrants;
    const payouts = this.payoutPreview(pool, entrants).map((amount, i) => ({
      place: i + 1,
      amount,
    }));
    return {
      isComplete: this.tournamentComplete,
      winnerId: this.winnerId,
      placements,
      playersLeft: started ? playersLeft : entrants,
      totalPlayers: entrants,
      buyIn: this.buyIn,
      prizePool: pool,
      payouts,
    };
  }

  /** Payout amounts for a given pool/entrant count (used for live preview too). */
  private payoutPreview(pool: number, entrants: number): number[] {
    if (pool <= 0 || entrants <= 0) return [];
    const places = Math.min(this.payout.length, entrants);
    const pct = this.payout.slice(0, places);
    const sum = pct.reduce((a, b) => a + b, 0) || 1;
    const amounts = pct.map((p) => Math.floor((p / sum) * pool));
    const distributed = amounts.reduce((a, b) => a + b, 0);
    amounts[0] = (amounts[0] ?? 0) + (pool - distributed);
    return amounts;
  }
}
