import { Container, Graphics } from "pixi.js";
import type { Theme } from "../themes";

/** A single casino chip (top-down) drawn procedurally. */
export function makeChip(theme: Theme, radius: number): Graphics {
  const g = new Graphics();
  g.circle(0, 0, radius).fill(theme.chip.base);
  // Edge dashes.
  const dashes = 8;
  for (let i = 0; i < dashes; i++) {
    const a0 = (i / dashes) * Math.PI * 2;
    const a1 = a0 + Math.PI / dashes;
    g.moveTo(Math.cos(a0) * radius, Math.sin(a0) * radius)
      .arc(0, 0, radius, a0, a1)
      .lineTo(Math.cos(a1) * (radius * 0.72), Math.sin(a1) * (radius * 0.72))
      .arc(0, 0, radius * 0.72, a1, a0, true)
      .closePath()
      .fill(theme.chip.ring);
  }
  g.circle(0, 0, radius * 0.6).fill(theme.chip.base);
  g.circle(0, 0, radius * 0.6).stroke({ color: theme.chip.ring, width: radius * 0.12 });
  return g;
}

/** A short stack of chips, height scaling loosely with the amount. */
export function makeChipStack(theme: Theme, amount: number, radius: number): Container {
  const c = new Container();
  const count = Math.min(6, 1 + Math.floor(Math.log2(Math.max(1, amount / 10))));
  for (let i = 0; i < count; i++) {
    const chip = makeChip(theme, radius);
    chip.y = -i * radius * 0.34;
    c.addChild(chip);
  }
  return c;
}
