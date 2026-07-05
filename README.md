# All-In — Multiplayer Poker

A polished, real-time Texas Hold'em web app. Server-authoritative game logic,
WebGPU rendering (auto-fallback to WebGL2), and a swappable theme system.

Two game modes ship today:
- **Cash game** — 6-seat table, host-paced hands, rebuy implied by fixed stacks.
- **Tournament (Sit & Go)** — fixed buy-in, escalating blinds on a clock, a
  per-turn timer that auto-folds/checks, auto-advancing hands, elimination with
  finishing places, and a final standings screen.

Richer image-based themes are the next phase (see `Roadmap`).

## Stack

| Layer | Tech |
|-------|------|
| Game engine | Pure TypeScript, unit-tested (`packages/engine`) — deck, betting state machine, side pots, hand eval via [pokersolver](https://github.com/goldfire/pokersolver) |
| Shared types | `packages/shared` — the wire protocol + DTOs |
| Server | Cloudflare Workers + Durable Objects via [partyserver](https://github.com/threepointone/partyserver) (`server`) — one Durable Object = one table |
| Client | React + Vite + [PixiJS v8](https://pixijs.com) (WebGPU) + [GSAP](https://gsap.com) + Zustand (`apps/web`) |

**Why it can't be cheated:** all state lives in the engine on the server. Each
player's hole cards are sent only to their own connection; everyone else gets
public state (board, pots, bets, whose turn).

## Run locally

```bash
pnpm install

# Terminal 1 — game server (Cloudflare Worker via wrangler) on :8787
pnpm dev:server

# Terminal 2 — web app on :5173
pnpm dev:web
```

Open http://localhost:5173, click **Host a game**, share the 5-char code, and
have others **Join a game** with it. Two browser windows (or a phone on the same
network) is enough to test.

- `?gl=1` forces the WebGL renderer (used for screenshot testing — headless
  capture can't read back a WebGPU canvas). The default is WebGPU.
- The renderer badge (top-right) shows `WEBGPU` or `WEBGL` live.

## Test

```bash
pnpm test          # engine unit tests (hand ranking, side pots, full-hand sims)
pnpm typecheck     # all packages
```

## Deploy (free, hard-capped)

Client → **GitHub Pages**; realtime server → **Cloudflare Workers** (your account,
free tier — exceed a daily limit and it 429s rather than billing you). Full runbook
in [DEPLOY.md](DEPLOY.md).

```bash
cd server && pnpm exec wrangler login && pnpm deploy   # → poker.<you>.workers.dev
# then set the repo variable VITE_PARTYKIT_HOST to that host; pushing to main deploys the client
```

## Themes

Themes are config in `apps/web/src/themes.ts`, switchable live from the table's
top bar. Three ship today:

- **Emerald Classic** / **Midnight Noir** — cards, chips, and felt rendered
  procedurally from color tokens (scale crisply to any resolution, zero assets).
- **Illustrated Classic** — real card art (figured court cards) from
  MIT-licensed PNGs in `public/themes/classic/`, drawn on procedural white card
  bodies over a procedural felt. See `public/themes/CREDITS.md`.

To add an image theme, drop art under `public/themes/<name>/` and add a Theme
object with an `images: { face, back }` descriptor — `CardSprite` renders sprites
when a theme supplies images and falls back to procedural drawing otherwise.

## Roadmap

- **Multi-table tournaments (MTT)** — table balancing across many tables (the
  current tournament is single-table Sit & Go).
- **More image themes** — additional CC0 art packs (Kenney, Screaming Brain)
  behind the same `images` descriptor; optional felt/chip textures.
- Antes/bounties, lobby browser, spectators, persistent accounts, sounds, mobile polish.
