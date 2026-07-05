import { describe, expect, it } from "vitest";
import { findWinners, solveHand } from "./evaluate.js";
import type { Card } from "@poker/shared";

describe("hand evaluation", () => {
  it("ranks a flush over a pair", () => {
    const board: Card[] = ["9h", "5h", "2h", "Kd", "3c"];
    const flush = solveHand("a", ["Ah", "7h"], board); // Ace-high heart flush
    expect(flush.descr.toLowerCase()).toContain("flush");
    const { winnerIds } = findWinners(
      [
        { id: "a", hole: ["Ah", "7h"] }, // flush
        { id: "b", hole: ["Kc", "Ks"] }, // trip kings
      ],
      board,
    );
    expect(winnerIds).toEqual(["a"]);
  });

  it("finds a single winner with the better kicker", () => {
    const board: Card[] = ["Ac", "Kd", "7s", "2h", "9c"];
    const { winnerIds } = findWinners(
      [
        { id: "a", hole: ["Ah", "Qd"] }, // pair aces, Q kicker
        { id: "b", hole: ["As", "Jd"] }, // pair aces, J kicker
      ],
      board,
    );
    expect(winnerIds).toEqual(["a"]);
  });

  it("detects a tie (split pot)", () => {
    const board: Card[] = ["Ac", "Kd", "Qh", "Js", "Tc"]; // board is a straight
    const { winnerIds } = findWinners(
      [
        { id: "a", hole: ["2d", "3d"] },
        { id: "b", hole: ["4d", "5d"] },
      ],
      board,
    );
    expect(winnerIds.sort()).toEqual(["a", "b"]);
  });
});
