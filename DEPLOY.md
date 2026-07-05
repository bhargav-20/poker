# Deploying All-In

Production is **two independent pieces**:

| Piece | Host | Why |
|-------|------|-----|
| Web client (static) | **GitHub Pages** | Just files — served from `https://bhargav-20.github.io/poker/` |
| Realtime server | **PartyKit / Cloudflare** | GitHub Pages can't run a server or WebSockets |

The client build is baked with the server's URL, so **deploy the server first**, then point the
client at it.

## 1. Deploy the realtime server (PartyKit → Cloudflare, free tier)

```bash
cd server
pnpm exec partykit login     # one-time, opens the browser (uses the installed partykit)
pnpm exec partykit deploy    # deploys to https://poker.<your-username>.partykit.dev
```

> Use `pnpm exec` (not `pnpm dlx`) — partykit is already a dependency here, so this
> avoids re-downloading it and pnpm's "choose which packages to build" prompt.

Note the resulting host (e.g. `poker.bhargav-20.partykit.dev`). It's HTTPS/WSS, which is required
because Pages is served over HTTPS.

## 2. Point the client at the server

In the GitHub repo → **Settings → Secrets and variables → Actions → Variables → New variable**:

- **Name:** `VITE_PARTYKIT_HOST`
- **Value:** `poker.<your-username>.partykit.dev`  (no `https://`, no trailing slash)

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
pnpm dev:server   # PartyKit on :1999
pnpm dev:web      # Vite on :5173  (uses apps/web/.env.local for VITE_PARTYKIT_HOST)
```

## Notes / gotchas

- The client **won't connect** until `VITE_PARTYKIT_HOST` is set to a deployed PartyKit host and
  the server is deployed. Without it the app loads but games can't start.
- Mixed content: because Pages is HTTPS, the server host must be WSS (a deployed `*.partykit.dev`
  is — a bare IP/`localhost` is not).
- Rooms are in-memory (no persistence yet), so a table resets if the server evicts it or redeploys.
