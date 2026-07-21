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

## Tests

`yarn test`
