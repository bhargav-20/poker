import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import gsap from "gsap";
import type { Card, Suit } from "@poker/shared";
import type { Theme } from "../themes";
import type { CardTextures } from "./themeAssets";

const SUIT_GLYPH: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const RANK_LABEL: Record<string, string> = { T: "10" };

/**
 * A single playing card with a flip animation. Renders from image textures when
 * the theme supplies them, otherwise draws the card procedurally from tokens.
 */
export class CardSprite extends Container {
  private w: number;
  private h: number;
  private theme: Theme;
  private tex: CardTextures | null;

  // Procedural layers.
  private faceLayer = new Container();
  private backLayer = new Container();
  // Image layers. `faceBase` is a white card body behind the art, since many
  // open-source decks draw pips/figures on a transparent background.
  private faceBase = new Graphics();
  private faceSprite = new Sprite();
  private backSprite = new Sprite();

  card: Card | null = null;
  faceUp = false;

  constructor(theme: Theme, w: number, h: number, tex: CardTextures | null = null) {
    super();
    this.theme = theme;
    this.w = w;
    this.h = h;
    this.tex = tex;
    this.faceSprite.anchor.set(0.5);
    this.backSprite.anchor.set(0.5);
    this.addChild(
      this.backLayer,
      this.faceLayer,
      this.backSprite,
      this.faceBase,
      this.faceSprite,
    );
    this.rebuild();
  }

  private get imageMode() {
    return this.tex !== null;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.rebuild();
  }

  setTheme(theme: Theme, tex: CardTextures | null) {
    this.theme = theme;
    this.tex = tex;
    this.rebuild();
  }

  /** Redraw everything for the current mode/size and re-apply the current card. */
  private rebuild() {
    this.drawProceduralBack();
    if (this.imageMode) {
      this.backSprite.texture = this.tex!.back;
      this.sizeSprite(this.backSprite);
      this.faceBase.clear();
      const r = this.h * 0.09;
      this.faceBase
        .roundRect(-this.w / 2, -this.h / 2, this.w, this.h, r)
        .fill(this.theme.cardFace);
      this.faceBase
        .roundRect(-this.w / 2, -this.h / 2, this.w, this.h, r)
        .stroke({ color: this.theme.cardBorder, width: Math.max(1, this.h * 0.02), alignment: 1 });
    }
    this.setCard(this.card, this.faceUp);
  }

  private sizeSprite(s: Sprite) {
    if (s.texture && s.texture !== Texture.EMPTY) {
      s.width = this.w;
      s.height = this.h;
    }
  }

  private roundedRect(fill: number, border: number): Graphics {
    const g = new Graphics();
    const r = this.h * 0.09;
    g.roundRect(-this.w / 2, -this.h / 2, this.w, this.h, r).fill(fill);
    g.roundRect(-this.w / 2, -this.h / 2, this.w, this.h, r).stroke({
      color: border,
      width: Math.max(1, this.h * 0.02),
      alignment: 1,
    });
    return g;
  }

  private drawProceduralBack() {
    this.backLayer.removeChildren();
    const g = this.roundedRect(this.theme.cardBackA, this.theme.cardBorder);
    const inset = this.h * 0.12;
    const pat = new Graphics();
    const step = this.w * 0.28;
    for (let y = -this.h / 2 + inset; y < this.h / 2 - inset; y += step) {
      for (let x = -this.w / 2 + inset; x < this.w / 2 - inset; x += step) {
        pat
          .moveTo(x, y - step * 0.35)
          .lineTo(x + step * 0.35, y)
          .lineTo(x, y + step * 0.35)
          .lineTo(x - step * 0.35, y)
          .closePath()
          .fill({ color: this.theme.cardBackB, alpha: 0.85 });
      }
    }
    const mask = new Graphics();
    const r = this.h * 0.09;
    mask.roundRect(-this.w / 2, -this.h / 2, this.w, this.h, r).fill(0xffffff);
    pat.mask = mask;
    this.backLayer.addChild(g, pat, mask);
  }

  private drawProceduralFace(card: Card) {
    this.faceLayer.removeChildren();
    const rank = card[0]!;
    const suit = card[1] as Suit;
    const isRed = suit === "h" || suit === "d";
    const color = isRed ? this.theme.redSuit : this.theme.blackSuit;
    const label = RANK_LABEL[rank] ?? rank;
    const glyph = SUIT_GLYPH[suit];

    this.faceLayer.addChild(this.roundedRect(this.theme.cardFace, this.theme.cardBorder));

    const cornerSize = this.h * 0.26;
    const makeCorner = () => {
      const c = new Container();
      const t = new Text({
        text: label,
        style: { fontFamily: "Georgia, serif", fontSize: cornerSize, fontWeight: "700", fill: color },
      });
      t.anchor.set(0.5, 0);
      const s = new Text({
        text: glyph,
        style: { fontFamily: "serif", fontSize: cornerSize * 0.8, fill: color },
      });
      s.anchor.set(0.5, 0);
      s.y = cornerSize * 0.95;
      c.addChild(t, s);
      return c;
    };

    const pad = this.w * 0.16;
    const tl = makeCorner();
    tl.position.set(-this.w / 2 + pad, -this.h / 2 + this.h * 0.06);
    const br = makeCorner();
    br.position.set(this.w / 2 - pad, this.h / 2 - this.h * 0.06);
    br.rotation = Math.PI;

    const center = new Text({
      text: glyph,
      style: { fontFamily: "serif", fontSize: this.h * 0.44, fill: color },
    });
    center.anchor.set(0.5);
    this.faceLayer.addChild(tl, br, center);
  }

  /** Prepare the face content for the current card (texture or procedural). */
  private prepareFace() {
    if (this.imageMode) {
      this.faceSprite.texture = this.card
        ? this.tex!.faces.get(this.card) ?? Texture.EMPTY
        : Texture.EMPTY;
      this.sizeSprite(this.faceSprite);
    } else if (this.card) {
      this.drawProceduralFace(this.card);
    }
  }

  /** Toggle which side is visible without disturbing the flip scale. */
  private showSide(faceUp: boolean) {
    this.faceUp = faceUp;
    const showFace = faceUp && !!this.card;
    if (this.imageMode) {
      this.faceSprite.visible = showFace;
      this.faceBase.visible = showFace;
      this.backSprite.visible = !showFace;
      this.faceLayer.visible = false;
      this.backLayer.visible = false;
    } else {
      this.faceLayer.visible = showFace;
      this.backLayer.visible = !showFace;
      this.faceSprite.visible = false;
      this.faceBase.visible = false;
      this.backSprite.visible = false;
    }
  }

  /** Set the card value and which side shows (no animation). */
  setCard(card: Card | null, faceUp: boolean) {
    this.card = card;
    this.prepareFace();
    this.showSide(faceUp);
    this.scale.x = 1;
  }

  /** Animated flip to reveal/hide the face. */
  flipTo(faceUp: boolean, duration = 0.35): gsap.core.Timeline {
    this.prepareFace();
    const tl = gsap.timeline();
    tl.to(this.scale, {
      x: 0,
      duration: duration / 2,
      ease: "power2.in",
      onComplete: () => this.showSide(faceUp),
    });
    tl.to(this.scale, { x: 1, duration: duration / 2, ease: "power2.out" });
    return tl;
  }
}
