import {
  Application,
  Container,
  Graphics,
  Text,
  WebGPURenderer,
} from "pixi.js";
import gsap from "gsap";
import { DEFAULTS, type Card, type PublicTableState } from "@poker/shared";
import type { Theme } from "../themes";
import { computeGeometry, slotFor, type TableGeometry } from "./layout";
import { CardSprite } from "./CardSprite";
import { Seat } from "./Seat";
import { makeChipStack } from "./chips";
import { loadCardTextures, type CardTextures } from "./themeAssets";

export class PokerTable {
  readonly app = new Application();
  private felt = new Graphics();
  private tableLabel = new Text({ text: "", style: { fontSize: 22, fill: 0xffffff } });
  private boardLayer = new Container();
  private seatLayer = new Container();
  private potLayer = new Container();
  private fxLayer = new Container();
  private potText = new Text({ text: "", style: { fontSize: 20, fill: 0xffffff, fontWeight: "800" } });
  private potChips = new Container();

  private geo!: TableGeometry;
  private theme!: Theme;
  private selfId = "";
  private selfSeat: number | null = null;

  private seats = new Map<number, Seat>();
  private board: CardSprite[] = [];
  private cardTex: CardTextures | null = null;

  private prevPhase = "";
  private prevBoardLen = 0;
  private lastState: PublicTableState | null = null;
  private lastHole: [Card, Card] | null = null;

  rendererType: "webgpu" | "webgl" = "webgl";

  async init(parent: HTMLElement, theme: Theme, selfId: string) {
    this.theme = theme;
    this.selfId = selfId;
    // `?gl=1` forces WebGL — used for automated screenshot verification, since
    // headless capture cannot read back a WebGPU canvas. Default is WebGPU.
    const forceGl = new URLSearchParams(window.location.search).has("gl");
    await this.app.init({
      resizeTo: parent,
      preference: forceGl ? "webgl" : "webgpu",
      antialias: true,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    this.rendererType = this.app.renderer instanceof WebGPURenderer ? "webgpu" : "webgl";
    parent.appendChild(this.app.canvas);

    this.potText.anchor.set(0.5);
    this.potLayer.addChild(this.potChips, this.potText);
    this.app.stage.addChild(this.felt, this.boardLayer, this.potLayer, this.seatLayer, this.fxLayer);

    this.cardTex = await loadCardTextures(theme);
    this.geo = computeGeometry(this.app.screen.width, this.app.screen.height);
    this.buildBoard();
    this.drawFelt();
    this.app.renderer.on("resize", () => this.onResize());
    this.app.ticker.add(() => this.tickTimers());
  }

  /** Per-frame update of the active player's turn-timer bar. */
  private tickTimers() {
    const st = this.lastState;
    if (!st) return;
    const total = (st.turnSeconds || DEFAULTS.TURN_SECONDS) * 1000;
    for (const [seatNo, seat] of this.seats) {
      if (st.phase === "in_hand" && seatNo === st.activeSeat && st.turnEndsAt) {
        seat.drawTimer((st.turnEndsAt - Date.now()) / total);
      } else {
        seat.drawTimer(null);
      }
    }
  }

  async setTheme(theme: Theme) {
    this.theme = theme;
    this.cardTex = await loadCardTextures(theme);
    this.drawFelt();
    this.board.forEach((c) => c.setTheme(theme, this.cardTex));
    this.seats.forEach((s) => s.setTheme(theme, this.cardTex));
    if (this.lastState) this.render(this.lastState, this.lastHole);
  }

  private onResize() {
    this.geo = computeGeometry(this.app.screen.width, this.app.screen.height);
    this.drawFelt();
    this.board.forEach((c, i) => {
      c.resize(this.geo.cardW, this.geo.cardH);
      c.position.set(this.geo.community[i]!.x, this.geo.community[i]!.y);
    });
    this.seats.forEach((s) => s.resizeCards(this.geo.cardW, this.geo.cardH));
    if (this.lastState) this.render(this.lastState, this.lastHole);
  }

  private buildBoard() {
    this.boardLayer.removeChildren();
    this.board = [];
    for (let i = 0; i < 5; i++) {
      const c = new CardSprite(this.theme, this.geo.cardW, this.geo.cardH, this.cardTex);
      c.position.set(this.geo.community[i]!.x, this.geo.community[i]!.y);
      c.visible = false;
      this.board.push(c);
      this.boardLayer.addChild(c);
    }
  }

  private drawFelt() {
    const { cx, cy, rx, ry } = this.geo;
    const g = this.felt;
    g.clear();
    // Rail.
    g.ellipse(cx, cy, rx + 40, ry + 40).fill(this.theme.railOuter);
    g.ellipse(cx, cy, rx + 24, ry + 24).fill(this.theme.railInner);
    g.ellipse(cx, cy, rx + 24, ry + 24).stroke({ color: 0x000000, width: 3, alpha: 0.3 });
    // Radial felt (edge -> center) approximated by concentric ellipses.
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const color = lerpColor(this.theme.feltEdge, this.theme.feltCenter, t);
      g.ellipse(cx, cy, rx * (1 - 0.55 * t), ry * (1 - 0.55 * t)).fill(color);
    }
    // Center betting line.
    g.ellipse(cx, cy, rx * 0.62, ry * 0.6).stroke({ color: 0xffffff, width: 1.5, alpha: 0.08 });

    this.potText.style.fill = this.theme.gold;
    this.potLayer.position.set(this.geo.pot.x, this.geo.pot.y);
  }

  // ── Reconciliation ─────────────────────────────────────────────────────────
  render(state: PublicTableState, hole: [Card, Card] | null) {
    this.lastState = state;
    this.lastHole = hole;
    const self = state.players.find((p) => p.id === this.selfId);
    this.selfSeat = self ? self.seat : null;

    const newHand = this.prevPhase !== "in_hand" && state.phase === "in_hand";
    const ids = new Set(state.players.map((p) => p.seat));

    for (const p of state.players) {
      let seat = this.seats.get(p.seat);
      if (!seat) {
        seat = new Seat(this.theme, this.geo.cardW, this.geo.cardH, this.cardTex);
        this.seats.set(p.seat, seat);
        this.seatLayer.addChild(seat);
      }
      const slot = slotFor(p.seat, this.selfSeat);
      const pos = this.geo.seats[slot]!;
      const isSelf = p.id === this.selfId;
      seat.update({
        player: p,
        pos,
        geo: this.geo,
        isSelf,
        isActive: state.activeSeat === p.seat && state.phase === "in_hand",
        isButton: state.buttonSeat === p.seat && state.phase !== "lobby",
        hole: isSelf ? hole : null,
        showCards: isSelf,
        handOver: state.phase === "hand_over",
        dealt: state.phase !== "lobby",
        cardW: isSelf ? this.geo.heroCardW : this.geo.oppCardW,
        cardH: isSelf ? this.geo.heroCardH : this.geo.oppCardH,
        cardsBelow: pos.y < this.geo.cy - 1,
      });
    }
    // Remove seats that left.
    for (const [seatNo, seat] of this.seats) {
      if (!ids.has(seatNo)) {
        seat.destroy();
        this.seats.delete(seatNo);
      }
    }

    // Community cards.
    for (let i = 0; i < 5; i++) {
      const card = state.board[i];
      const sprite = this.board[i]!;
      if (card) {
        const isNew = i >= this.prevBoardLen;
        sprite.visible = true;
        if (isNew) {
          sprite.setCard(card, false);
          sprite.flipTo(true);
        } else {
          sprite.setCard(card, true);
        }
      } else {
        sprite.visible = false;
        sprite.setCard(null, false);
      }
    }

    // Pot — a small chip pile above the "Pot N" label.
    this.potChips.removeChildren();
    if (state.totalPot > 0) {
      const stack = makeChipStack(this.theme, state.totalPot, 9);
      stack.position.set(0, -20);
      this.potChips.addChild(stack);
      this.potText.text = `Pot ${state.totalPot}`;
      this.potText.visible = true;
    } else {
      this.potText.visible = false;
    }

    if (newHand) this.dealAnimation(state);
    if (state.phase === "hand_over" && this.prevPhase === "in_hand" && state.lastResult) {
      this.winnerFlourish(state);
    }

    this.prevPhase = state.phase;
    this.prevBoardLen = state.board.length;
  }

  // ── Animations ───────────────────────────────────────────────────────────
  private dealAnimation(state: PublicTableState) {
    let d = 0;
    // Two passes (one card each) around the table, starting left of button.
    for (let pass = 0; pass < 2; pass++) {
      for (const p of state.players) {
        if (p.hasFolded) continue;
        const seat = this.seats.get(p.seat);
        if (!seat) continue;
        const card = seat.cards[pass]!;
        card.visible = true;
        const tx = card.x;
        const ty = card.y;
        const localDeckX = this.geo.deck.x - seat.x;
        const localDeckY = this.geo.deck.y - seat.y;
        card.position.set(localDeckX, localDeckY);
        card.alpha = 0;
        gsap.to(card, { alpha: 1, duration: 0.15, delay: d });
        gsap.to(card.position, { x: tx, y: ty, duration: 0.4, delay: d, ease: "power2.out" });
        d += 0.09;
      }
    }
  }

  private winnerFlourish(state: PublicTableState) {
    const winners = state.lastResult!.winners.map((w) => w.playerId);
    for (const w of winners) {
      const p = state.players.find((pl) => pl.id === w);
      if (!p) continue;
      const seat = this.seats.get(p.seat);
      if (!seat) continue;
      const ring = new Graphics();
      ring.position.copyFrom(seat.position);
      ring.circle(0, 0, 20).stroke({ color: this.theme.gold, width: 4, alpha: 0.9 });
      this.fxLayer.addChild(ring);
      gsap.fromTo(
        ring.scale,
        { x: 1, y: 1 },
        { x: 5, y: 5, duration: 0.8, ease: "power2.out" },
      );
      gsap.to(ring, { alpha: 0, duration: 0.8, onComplete: () => ring.destroy() });
    }
    // Slide the pot toward the (first) winner.
    const first = state.players.find((pl) => pl.id === winners[0]);
    if (first) {
      const seat = this.seats.get(first.seat);
      if (seat) {
        gsap.to(this.potLayer.position, {
          x: seat.x,
          y: seat.y,
          duration: 0.6,
          ease: "power2.in",
          onComplete: () => {
            this.potLayer.position.set(this.geo.pot.x, this.geo.pot.y);
          },
        });
      }
    }
  }

  destroy() {
    gsap.globalTimeline.clear();
    this.app.destroy(true, { children: true });
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
