# Scratchpad

Collaborative drawing pad — share a link, draw together.

## Run locally

1. `docker compose up -d` — **required** (Redis stores strokes so refresh keeps your drawing)
2. `cp .env.local.example .env.local`
3. `yarn install`
4. `yarn dev` — Next on :3000, WS on :3001
5. Open http://localhost:3000

If the toolbar shows “Sync offline”, Redis is not reachable and drawings may not survive a refresh.

v1 runs a single WebSocket process; Redis pub/sub publish is reserved for future multi-instance — do not run multiple WS servers yet.

## Deploy (Vercel + WebSocket host)

**Vercel cannot run the WebSocket server.** Deploy the UI on Vercel and the `server/` process on Fly.io (or Railway/Render), sharing the same Redis.

### 1. Redis

Use [Upstash](https://upstash.com) (or any hosted Redis). Copy the connection URL (`rediss://...`).

### 2. WebSocket server (Fly.io)

```bash
# Install flyctl, then from this repo:
fly launch --no-deploy   # accept/adjust app name in fly.toml
fly secrets set REDIS_URL="rediss://..."
fly deploy
```

Note the app URL, e.g. `https://scratchpad-ws.fly.dev` → WebSocket URL is `wss://scratchpad-ws.fly.dev`.

### 3. Vercel (Next.js)

In the Vercel project → Settings → Environment Variables:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_WS_URL` | `wss://scratchpad-ws.fly.dev` |
| `REDIS_URL` | same Redis URL (for `/api/rooms` sequential ids) |

Redeploy the Vercel app after setting `NEXT_PUBLIC_WS_URL` (it is baked in at build time).

If `NEXT_PUBLIC_WS_URL` is missing or still `ws://localhost:3001`, the pad shows **No server** instead of reconnecting forever.

## Tests

`yarn test`
