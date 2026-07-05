import { Assets, Texture } from "pixi.js";
import { RANKS, SUITS, type Card } from "@poker/shared";
import type { Theme } from "../themes";

export interface CardTextures {
  faces: Map<Card, Texture>;
  back: Texture;
}

const cache = new Map<string, CardTextures>();

function allCards(): Card[] {
  const out: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) out.push(`${r}${s}` as Card);
  return out;
}

/** Preload every card face + back for an image theme. Cached per theme id. */
export async function loadCardTextures(theme: Theme): Promise<CardTextures | null> {
  if (!theme.images) return null;
  const cached = cache.get(theme.id);
  if (cached) return cached;

  const img = theme.images;
  const cards = allCards();
  const urls = [...cards.map(img.face), img.back];
  await Assets.load(urls);

  const faces = new Map<Card, Texture>();
  for (const c of cards) faces.set(c, Texture.from(img.face(c)));
  const tex: CardTextures = { faces, back: Texture.from(img.back) };
  cache.set(theme.id, tex);
  return tex;
}
