import type { Pot } from "@poker/shared";

export interface Contributor {
  id: string;
  committed: number;
  folded: boolean;
}

/**
 * Split total committed chips into main + side pots using standard all-in
 * layering. Folded players' chips remain in the pots (dead money) but they are
 * never eligible to win. Consecutive layers with identical eligibility are
 * merged.
 */
export function computePots(contributors: Contributor[]): Pot[] {
  const remaining = contributors
    .filter((c) => c.committed > 0)
    .map((c) => ({ ...c }));
  const pots: Pot[] = [];

  while (remaining.length > 0) {
    const min = Math.min(...remaining.map((c) => c.committed));
    let amount = 0;
    const eligible: string[] = [];
    for (const c of remaining) {
      amount += min;
      c.committed -= min;
      if (!c.folded) eligible.push(c.id);
    }
    const prev = pots[pots.length - 1];
    if (prev && sameSet(prev.eligible, eligible)) {
      prev.amount += amount;
    } else {
      pots.push({ amount, eligible });
    }
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (remaining[i]!.committed <= 0) remaining.splice(i, 1);
    }
  }
  return pots;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}
