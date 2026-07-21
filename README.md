# Scratchpad

Collaborative drawing pad — share a link, draw together.

## Run locally

1. `docker compose up -d`
2. `cp .env.local.example .env.local`
3. `yarn install`
4. `yarn dev` — Next on :3000, WS on :3001
5. Open http://localhost:3000

v1 runs a single WebSocket process; Redis pub/sub publish is reserved for future multi-instance — do not run multiple WS servers yet.

## Tests

`yarn test`
