import { describe, expect, it } from "vitest";
import { PokerGame } from "./game.js";
import { mulberry32 } from "./deck.js";

function tourney(numPlayers: number, seed = 1, startingStack = 1000) {
  const g = new PokerGame({
    code: "T",
    mode: "tournament",
    startingStack,
    rng: mulberry32(seed),
  });
  const ids: string[] = [];
  for (let i = 0; i < numPlayers; i++) {
    g.addPlayer(`p${i}`, `P${i}`);
    ids.push(`p${i}`);
  }
  return { g, ids };
}

function totalChips(g: PokerGame): number {
  return g.toPublic().players.reduce((s, p) => s + p.stack + p.bet, 0);
}

/** Play the current hand to completion, all players calling/checking down. */
function playCallDown(g: PokerGame) {
  let guard = 0;
  while (g.toPublic().phase === "in_hand") {
    if (guard++ > 500) throw new Error("hand did not terminate");
    const s = g.toPublic();
    const active = s.players.find((p) => p.seat === s.activeSeat);
    if (!active) break;
    const legal = g.legalActions(active.id)!;
    if (legal.canCheck) g.act(active.id, { type: "check" });
    else g.act(active.id, { type: "call" });
  }
}

describe("tournament mode", () => {
  it("starts at blind level 0 and reports mode", () => {
    const { g } = tourney(3);
    const s = g.toPublic();
    expect(s.mode).toBe("tournament");
    expect(s.blinds.current).toEqual({ sb: 5, bb: 10, ante: 0 });
    expect(s.blinds.next).toEqual({ sb: 10, bb: 20, ante: 0 });
    expect(s.tournament?.totalPlayers).toBe(3);
  });

  it("escalates blinds and keeps the current hand's blind for min-raise", () => {
    const { g } = tourney(3);
    g.startHand();
    const before = g.toPublic();
    expect(before.blinds.current).toEqual({ sb: 5, bb: 10, ante: 0 });
    const ev = g.escalateBlinds();
    expect(ev).toMatchObject({ kind: "levelUp", level: 1, sb: 10, bb: 20 });
    // Blinds display updates immediately...
    expect(g.toPublic().blinds.current).toEqual({ sb: 10, bb: 20, ante: 0 });
    // ...and the hand still resolves correctly (chips conserved).
    playCallDown(g);
    expect(totalChips(g)).toBe(3000);
  });

  it("does not escalate past the last level", () => {
    const { g } = tourney(2);
    for (let i = 0; i < 20; i++) g.escalateBlinds();
    const s = g.toPublic();
    expect(s.blinds.next).toBeNull(); // reached the top of the schedule
  });

  it("eliminates a busted player and assigns a finishing place", () => {
    // Two players; force one all-in every hand until someone busts.
    const { g, ids } = tourney(2, 5, 100);
    let guard = 0;
    while (!g.isComplete()) {
      if (guard++ > 200) throw new Error("tournament did not finish");
      g.startHand();
      let inner = 0;
      while (g.toPublic().phase === "in_hand") {
        if (inner++ > 200) throw new Error("stuck");
        const s = g.toPublic();
        const active = s.players.find((p) => p.seat === s.activeSeat);
        if (!active) break;
        g.act(active.id, { type: "allin", amount: 999999 });
      }
    }
    const s = g.toPublic();
    expect(s.tournament?.isComplete).toBe(true);
    expect(totalChips(g)).toBe(200); // 2 * 100, conserved
    // One winner (place 1) and one runner-up (place 2).
    const places = s.players.map((p) => p.place).sort();
    expect(places).toEqual([1, 2]);
    const champ = s.players.find((p) => p.place === 1)!;
    expect(s.tournament?.winnerId).toBe(champ.id);
    expect(ids).toContain(champ.id);
    // The busted player is marked out; the champion is not.
    expect(s.players.find((p) => p.place === 2)!.isOut).toBe(true);
    expect(champ.isOut).toBe(false);
  });

  it("cash mode has no tournament info and does not eliminate", () => {
    const g = new PokerGame({ code: "C", startingStack: 100, rng: mulberry32(3) });
    g.addPlayer("a", "A");
    g.addPlayer("b", "B");
    g.startHand();
    playCallDown(g);
    const s = g.toPublic();
    expect(s.mode).toBe("cash");
    expect(s.tournament).toBeNull();
    expect(s.players.every((p) => p.place === null)).toBe(true);
  });
});
