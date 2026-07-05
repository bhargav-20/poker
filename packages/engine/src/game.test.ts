import { describe, expect, it } from "vitest";
import { PokerGame } from "./game.js";
import { mulberry32 } from "./deck.js";

const STACK = 1000;

function makeGame(numPlayers: number, seed = 1) {
  const g = new PokerGame({
    code: "TEST",
    startingStack: STACK,
    smallBlind: 5,
    bigBlind: 10,
    rng: mulberry32(seed),
  });
  const ids: string[] = [];
  for (let i = 0; i < numPlayers; i++) {
    const id = `p${i}`;
    g.addPlayer(id, `Player ${i}`);
    ids.push(id);
  }
  return { g, ids };
}

function totalChips(g: PokerGame): number {
  return g.toPublic().players.reduce((s, p) => s + p.stack + p.bet, 0);
}

/** Play a hand to completion with a "call/check down" policy (no folds). */
function playCallDown(g: PokerGame): void {
  let guard = 0;
  while (g.toPublic().phase === "in_hand") {
    if (guard++ > 500) throw new Error("hand did not terminate");
    const state = g.toPublic();
    const active = state.players.find((p) => p.seat === state.activeSeat);
    if (!active) break;
    const legal = g.legalActions(active.id)!;
    if (legal.canCheck) g.act(active.id, { type: "check" });
    else if (legal.canCall) g.act(active.id, { type: "call" });
    else g.act(active.id, { type: "check" });
  }
}

describe("PokerGame lifecycle", () => {
  it("assigns seats and a host", () => {
    const { g, ids } = makeGame(3);
    const s = g.toPublic();
    expect(s.players).toHaveLength(3);
    expect(s.hostId).toBe(ids[0]);
    expect(s.players.map((p) => p.seat)).toEqual([0, 1, 2]);
  });

  it("requires at least 2 players to start", () => {
    const { g } = makeGame(1);
    const r = g.startHand();
    expect(r.error).toBeTruthy();
  });

  it("posts blinds and deals hole cards on start", () => {
    const { g, ids } = makeGame(3);
    g.startHand();
    const s = g.toPublic();
    expect(s.phase).toBe("in_hand");
    expect(s.totalPot).toBe(15); // sb 5 + bb 10
    for (const id of ids) expect(g.getHole(id)).not.toBeNull();
    expect(s.activeSeat).not.toBeNull();
  });

  it("conserves chips through a full call-down hand (3 players)", () => {
    const { g } = makeGame(3, 42);
    expect(totalChips(g)).toBe(3 * STACK);
    g.startHand();
    playCallDown(g);
    const s = g.toPublic();
    expect(s.phase).toBe("hand_over");
    expect(s.board).toHaveLength(5);
    expect(totalChips(g)).toBe(3 * STACK); // no chips created or destroyed
    expect(s.lastResult).not.toBeNull();
    const awarded = s.lastResult!.winners.reduce((x, w) => x + w.amount, 0);
    expect(awarded).toBe(3 * 10); // everyone put in one big blind
  });

  it("awards the pot to the last player when everyone else folds", () => {
    const { g, ids } = makeGame(3, 7);
    g.startHand();
    // Everyone folds until one remains.
    let guard = 0;
    while (g.toPublic().phase === "in_hand") {
      if (guard++ > 50) throw new Error("stuck");
      const s = g.toPublic();
      const active = s.players.find((p) => p.seat === s.activeSeat)!;
      const live = s.players.filter((p) => !p.hasFolded);
      if (live.length <= 1) break;
      g.act(active.id, { type: "fold" });
    }
    const s = g.toPublic();
    expect(s.phase).toBe("hand_over");
    expect(s.lastResult!.wonByFold).toBe(true);
    expect(totalChips(g)).toBe(3 * STACK);
    expect(ids).toContain(s.lastResult!.winners[0]!.playerId);
  });

  it("handles heads-up (2 players): button posts SB and acts first preflop", () => {
    const { g } = makeGame(2, 3);
    g.startHand();
    const s = g.toPublic();
    expect(s.activeSeat).toBe(s.buttonSeat); // heads-up button acts first preflop
    playCallDown(g);
    expect(totalChips(g)).toBe(2 * STACK);
  });

  it("rotates the button between hands", () => {
    const { g } = makeGame(3, 9);
    g.startHand();
    const first = g.toPublic().buttonSeat;
    playCallDown(g);
    g.startHand();
    const second = g.toPublic().buttonSeat;
    expect(second).not.toBe(first);
    expect(totalChips(g)).toBe(3 * STACK);
  });

  it("enforces turn order", () => {
    const { g, ids } = makeGame(3);
    g.startHand();
    const s = g.toPublic();
    const notActive = s.players.find((p) => p.seat !== s.activeSeat)!;
    const r = g.act(notActive.id, { type: "call" });
    expect(r.error).toBe("Not your turn");
  });

  it("enforces minimum raise size", () => {
    const { g } = makeGame(3);
    g.startHand();
    const s = g.toPublic();
    const active = s.players.find((p) => p.seat === s.activeSeat)!;
    // currentBet is 10 (BB), min raise to is 20. Try raising to 15.
    const r = g.act(active.id, { type: "raise", amount: 15 });
    expect(r.error).toBeTruthy();
  });

  it("resolves an all-in run-out to showdown (chips conserved)", () => {
    const { g } = makeGame(2, 11);
    g.startHand();
    // Both shove.
    let guard = 0;
    while (g.toPublic().phase === "in_hand") {
      if (guard++ > 50) throw new Error("stuck");
      const s = g.toPublic();
      const active = s.players.find((p) => p.seat === s.activeSeat);
      if (!active) break;
      g.act(active.id, { type: "allin" });
    }
    const s = g.toPublic();
    expect(s.phase).toBe("hand_over");
    expect(s.board).toHaveLength(5);
    expect(totalChips(g)).toBe(2 * STACK);
  });
});
