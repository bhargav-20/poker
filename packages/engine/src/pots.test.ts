import { describe, expect, it } from "vitest";
import { computePots } from "./pots.js";

describe("side pot computation", () => {
  it("single pot when everyone contributes equally", () => {
    const pots = computePots([
      { id: "a", committed: 100, folded: false },
      { id: "b", committed: 100, folded: false },
      { id: "c", committed: 100, folded: false },
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0]!.amount).toBe(300);
    expect(pots[0]!.eligible.sort()).toEqual(["a", "b", "c"]);
  });

  it("creates a side pot for a short all-in", () => {
    // a is all-in for 50, b and c continue to 200.
    const pots = computePots([
      { id: "a", committed: 50, folded: false },
      { id: "b", committed: 200, folded: false },
      { id: "c", committed: 200, folded: false },
    ]);
    expect(pots).toHaveLength(2);
    // Main pot: 50 * 3 = 150, all eligible.
    expect(pots[0]!.amount).toBe(150);
    expect(pots[0]!.eligible.sort()).toEqual(["a", "b", "c"]);
    // Side pot: 150 * 2 = 300, only b and c.
    expect(pots[1]!.amount).toBe(300);
    expect(pots[1]!.eligible.sort()).toEqual(["b", "c"]);
  });

  it("folded players' chips stay in the pot but they are not eligible", () => {
    const pots = computePots([
      { id: "a", committed: 100, folded: true },
      { id: "b", committed: 100, folded: false },
      { id: "c", committed: 100, folded: false },
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0]!.amount).toBe(300);
    expect(pots[0]!.eligible.sort()).toEqual(["b", "c"]);
  });

  it("conserves total chips across multiple all-in layers", () => {
    const contribs = [
      { id: "a", committed: 30, folded: false },
      { id: "b", committed: 80, folded: false },
      { id: "c", committed: 200, folded: false },
      { id: "d", committed: 200, folded: true },
    ];
    const pots = computePots(contribs);
    const total = pots.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(30 + 80 + 200 + 200);
  });
});
