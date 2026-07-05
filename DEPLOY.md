# Deploying All-In

Production is **two independent pieces**:

| Piece | Host | Why |
|-------|------|-----|
| Web client (static) | **GitHub Pages** | Just files — served from `https://bhargav-20.github.io/poker/` |
| Realtime server | **Cloudflare Workers + Durable Objects** (`partyserver`) | GitHub Pages can't run a server or WebSockets |

The client build is baked with the server's URL, so **deploy the server first**, then point the
client at it. The server runs on **your own Cloudflare account** (free tier) — one Durable Object
per table.

## 1. Deploy the realtime server (Cloudflare Workers, free tier)

```bash
cd server
pnpm exec wrangler login     # one-time, opens the browser (your Cloudflare account)
pnpm exec wrangler deploy    # → https://poker.<your-subdomain>.workers.dev
```

- On your very first deploy Cloudflare asks you to pick a **workers.dev subdomain** — that becomes
  the `<your-subdomain>` above.
- Note the resulting host, e.g. `poker.bhargav-20.workers.dev`. It's HTTPS/WSS, required because
  Pages is served over HTTPS.
- Durable Objects use the **SQLite** backend (see `wrangler.toml`), which is included on the free plan.

## 2. Point the client at the server

In the GitHub repo → **Settings → Secrets and variables → Actions → Variables → New variable**:

- **Name:** `VITE_PARTYKIT_HOST`
- **Value:** `poker.<your-subdomain>.workers.dev`  (no `https://`, no trailing slash)

## 3. Enable GitHub Pages

Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## 4. Ship it

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): it installs,
runs the engine tests, builds the client with the right base path + server URL, and publishes to
Pages. You can also trigger it manually from the **Actions** tab (**Run workflow**).

Live at: **https://bhargav-20.github.io/poker/**

## Local development

```bash
pnpm install
pnpm dev:server   # Cloudflare Worker (wrangler dev) on :8787
pnpm dev:web      # Vite on :5173  (uses apps/web/.env.local for VITE_PARTYKIT_HOST → 127.0.0.1:8787)
```

## Notes / gotchas

- The client **won't connect** until `VITE_PARTYKIT_HOST` is set to a deployed Workers host and
  the server is deployed. Without it the app loads but games can't start.
- Mixed content: because Pages is HTTPS, the server host must be WSS (a deployed `*.workers.dev`
  is — a bare IP/`localhost` is not).
- Rooms are in-memory (no persistence yet), so a table resets if the server evicts it or redeploys.
