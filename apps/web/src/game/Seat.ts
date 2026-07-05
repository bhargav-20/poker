import { Container, Graphics, Text } from "pixi.js";
import gsap from "gsap";
import type { PublicPlayer, Card } from "@poker/shared";
import type { Theme } from "../themes";
import { CardSprite } from "./CardSprite";
import type { Point, TableGeometry } from "./layout";
import type { CardTextures } from "./themeAssets";

interface UpdateOpts {
  player: PublicPlayer;
  pos: Point;
  geo: TableGeometry;
  isSelf: boolean;
  isActive: boolean;
  isButton: boolean;
  hole: [Card, Card] | null;
  showCards: boolean;
  handOver: boolean;
  dealt: boolean;
  cardW: number;
  cardH: number;
  cardsBelow: boolean;
}

/**
 * A player position. The local player renders as a wide "pill" with large cards
 * above it; opponents render as a compact vertical marker (avatar + stack, small
 * cards tucked below) so five of them fit across a phone in portrait.
 */
export class Seat extends Container {
  private theme: Theme;
  private glow = new Graphics();
  private timerBar = new Graphics();
  private pod = new Graphics();
  private avatar = new Graphics();
  private initial = new Text({ text: "", style: { fontSize: 14, fill: 0xffffff, fontWeight: "800" } });
  private nameText: Text;
  private stackText: Text;
  private dealer = new Container();
  private betGroup = new Container();
  private betText: Text;
  cards: [CardSprite, CardSprite];
  seat = -1;

  private cardSize = 0;
  private timerW = 60;
  private timerY = 30;

  constructor(theme: Theme, cardW: number, cardH: number, tex: CardTextures | null = null) {
    super();
    this.theme = theme;
    this.nameText = new Text({ text: "", style: { fontFamily: "system-ui", fontSize: 11, fontWeight: "600", fill: theme.seatText } });
    this.stackText = new Text({ text: "", style: { fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: "700", fill: theme.gold } });
    this.betText = new Text({ text: "", style: { fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: "700", fill: 0xffffff } });
    this.nameText.anchor.set(0.5);
    this.stackText.anchor.set(0.5);
    this.betText.anchor.set(0, 0.5);
    this.initial.anchor.set(0.5);
    this.cards = [new CardSprite(theme, cardW, cardH, tex), new CardSprite(theme, cardW, cardH, tex)];

    const d = new Graphics();
    d.circle(0, 0, 10).fill(0xffffff);
    d.circle(0, 0, 10).stroke({ color: 0x333333, width: 1.5 });
    const dt = new Text({ text: "D", style: { fontSize: 11, fontWeight: "900", fill: 0x222222 } });
    dt.anchor.set(0.5);
    this.dealer.addChild(d, dt);
    this.dealer.visible = false;

    const chip = new Graphics();
    chip.circle(0, 0, 7).fill(theme.chip.base);
    chip.circle(0, 0, 7).stroke({ color: 0xffffff, width: 2, alpha: 0.7 });
    this.betText.position.set(11, 0);
    this.betGroup.addChild(chip, this.betText);
    this.betGroup.visible = false;

    this.addChild(this.glow, this.pod, this.timerBar, this.avatar, this.initial, this.nameText, this.stackText);
    this.addChild(this.cards[0], this.cards[1], this.dealer, this.betGroup);
  }

  setTheme(theme: Theme, tex: CardTextures | null) {
    this.theme = theme;
    this.cards.forEach((c) => c.setTheme(theme, tex));
  }

  resizeCards(w: number, h: number) {
    this.cards.forEach((c) => c.resize(w, h));
  }

  update(opts: UpdateOpts) {
    const { player, pos, geo, isSelf, isActive, isButton, hole, showCards } = opts;
    this.seat = player.seat;
    this.position.set(pos.x, pos.y);
    this.alpha = player.isOut ? 0.45 : 1;

    if (this.cardSize !== opts.cardH) {
      this.cards.forEach((c) => c.resize(opts.cardW, opts.cardH));
      this.cardSize = opts.cardH;
    }

    // Text content (shared).
    this.nameText.text = player.name;
    this.nameText.alpha = player.isConnected ? 1 : 0.45;
    if (player.isOut) {
      this.stackText.text = player.place ? `OUT · ${ordinal(player.place)}` : "OUT";
      this.stackText.style.fill = 0x8a94a6;
    } else {
      this.stackText.text = player.isAllIn ? "ALL-IN" : `${player.stack}`;
      this.stackText.style.fill = player.isAllIn ? this.theme.accent : this.theme.gold;
    }
    this.initial.text = (player.name[0] ?? "?").toUpperCase();

    const toCenter = angleTo(pos, { x: geo.cx, y: geo.cy });
    if (isSelf) this.layoutHero(opts, toCenter);
    else this.layoutOpponent(opts, toCenter);

    // Card content + visibility (shared).
    const inHand = opts.dealt && !player.hasFolded && (opts.handOver ? player.revealed : true);
    this.cards.forEach((c) => (c.visible = !!inHand));
    this.cards.forEach((c) => (c.alpha = player.hasFolded ? 0.3 : 1));
    if (isSelf && hole) {
      this.cards[0].setCard(hole[0], showCards);
      this.cards[1].setCard(hole[1], showCards);
    } else if (player.revealed) {
      this.cards[0].setCard(player.revealed[0], true);
      this.cards[1].setCard(player.revealed[1], true);
    } else {
      this.cards[0].setCard("2s", false);
      this.cards[1].setCard("2s", false);
    }

    this.dealer.visible = isButton;
    if (isActive) {
      if (!this._pulsing) this.startPulse();
    } else {
      this.stopPulse();
    }
  }

  // ── Local player: wide pill, big cards above ────────────────────────────────
  private layoutHero(opts: UpdateOpts, toCenter: number) {
    const { player, isActive } = opts;
    const podW = 156;
    const podH = 44;
    const r = 12;

    this.pod.clear();
    this.pod.roundRect(-podW / 2, -podH / 2, podW, podH, r).fill({ color: this.theme.seatBg, alpha: 0.95 });
    this.pod.roundRect(-podW / 2, -podH / 2, podW, podH, r).stroke({ color: this.theme.accent, width: 2, alpha: 0.85 });

    const ax = -podW / 2 + 22;
    this.avatar.clear();
    this.avatar.circle(ax, 0, 16).fill(this.theme.accent);
    this.initial.position.set(ax, 0);
    this.initial.style.fill = this.theme.seatBg;
    this.initial.style.fontSize = 14;

    this.nameText.anchor.set(0, 0.5);
    this.stackText.anchor.set(0, 0.5);
    this.nameText.style.fontSize = 13;
    this.stackText.style.fontSize = 14;
    this.nameText.position.set(ax + 22, -9);
    this.stackText.position.set(ax + 22, 9);

    this.glow.clear();
    if (isActive) {
      this.glow.roundRect(-podW / 2 - 4, -podH / 2 - 4, podW + 8, podH + 8, r + 4).stroke({ color: this.theme.accent, width: 3, alpha: 0.9 });
    }

    const ch = opts.cardH;
    const cardY = -(podH / 2 + ch / 2 + 4);
    const dx = opts.cardW * 0.6;
    this.cards[0].position.set(-dx, cardY);
    this.cards[1].position.set(dx, cardY);
    this.cards[0].rotation = -0.06;
    this.cards[1].rotation = 0.06;

    this.dealer.position.set(podW / 2 - 12, podH / 2 - 4);
    this.placeBet(player, toCenter, podH / 2 + 20);
    this.timerW = podW * 0.8;
    this.timerY = podH / 2 + 5;
  }

  // ── Opponent: compact vertical marker ───────────────────────────────────────
  private layoutOpponent(opts: UpdateOpts, toCenter: number) {
    const { player, isActive } = opts;
    const avY = -14;
    const avR = 16;
    const plateW = 72;
    const plateH = 30;
    const plateY = 16;

    this.pod.clear();
    this.pod.roundRect(-plateW / 2, plateY - plateH / 2, plateW, plateH, 9).fill({ color: this.theme.seatBg, alpha: player.hasFolded ? 0.45 : 0.92 });

    this.avatar.clear();
    this.avatar.circle(0, avY, avR).fill(this.theme.accentSoft);
    this.avatar.circle(0, avY, avR).stroke({ color: 0x000000, width: 1, alpha: 0.25 });
    this.initial.position.set(0, avY);
    this.initial.style.fill = 0xffffff;
    this.initial.style.fontSize = 15;

    this.nameText.anchor.set(0.5);
    this.stackText.anchor.set(0.5);
    this.nameText.style.fontSize = 10;
    this.stackText.style.fontSize = 12;
    this.nameText.position.set(0, plateY - 6);
    this.stackText.position.set(0, plateY + 7);

    this.glow.clear();
    if (isActive) {
      this.glow.circle(0, avY, avR + 3).stroke({ color: this.theme.accent, width: 3, alpha: 0.95 });
    }

    const ch = opts.cardH;
    const cardY = plateY + plateH / 2 + ch / 2 + 7;
    const dx = opts.cardW * 0.62;
    this.cards[0].position.set(-dx, cardY);
    this.cards[1].position.set(dx, cardY);
    this.cards[0].rotation = -0.08;
    this.cards[1].rotation = 0.08;

    this.dealer.position.set(avR + 6, avY - avR + 4);
    this.placeBet(player, toCenter, 52);
    this.timerW = plateW;
    this.timerY = plateY + plateH / 2 + 4;
  }

  private placeBet(player: PublicPlayer, toCenter: number, radius: number) {
    if (player.bet > 0) {
      this.betGroup.visible = true;
      this.betText.text = `${player.bet}`;
      this.betGroup.position.set(Math.cos(toCenter) * radius, Math.sin(toCenter) * radius);
    } else {
      this.betGroup.visible = false;
    }
  }

  /** Depleting turn-timer bar (frac 0..1), positioned by the last layout. */
  drawTimer(frac: number | null) {
    this.timerBar.clear();
    if (frac === null) return;
    const f = Math.max(0, Math.min(1, frac));
    if (f <= 0) return;
    const color = f > 0.35 ? this.theme.accent : 0xff5252;
    this.timerBar.roundRect(-this.timerW / 2, this.timerY, this.timerW * f, 3.5, 2).fill(color);
  }

  private _pulsing = false;
  private _tween?: gsap.core.Tween;
  private startPulse() {
    this._pulsing = true;
    this.glow.alpha = 0.5;
    this._tween = gsap.to(this.glow, { alpha: 1, duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut" });
  }
  private stopPulse() {
    this._pulsing = false;
    this._tween?.kill();
    this.glow.alpha = 1;
  }
}

function angleTo(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
