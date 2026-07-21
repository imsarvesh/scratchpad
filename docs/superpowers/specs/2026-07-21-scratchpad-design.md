# Scratchpad — Design Spec

**Date:** 2026-07-21  
**Status:** Approved for planning  
**Stack:** Next.js 16 (App Router) + separate WebSocket server + Redis

## Goal

A shared digital scratch pad: anyone with a room link can draw with mouse or Apple Pencil. A few ink colors, clear board, elegant UI. Realtime sync via WebSocket; Redis keeps strokes consistent across clients and restarts for ~24 hours.

## Decisions

| Topic | Choice |
| --- | --- |
| Rooms | Shareable URLs: `/pad/[id]` |
| Persistence | Redis TTL ~24h, refreshed on activity |
| Identity | Fully anonymous — no names, cursors, or presence UI |
| Tools (v1) | 5 ink colors + Clear board |
| Architecture | Next.js UI + separate WS server (`ws`) + Redis (Docker Compose locally) |
| Room ids | Short URL-safe ids (`nanoid`, 10 chars) |
| WS URL | Client uses `NEXT_PUBLIC_WS_URL` (default `ws://localhost:3001`) |

## Product & UX

### Home (`/`)

- Brand **Scratchpad** as the hero signal
- One short supporting line
- Primary CTA: **New pad** → generates room id → navigates to `/pad/[id]`
- Optional: join by pasting a room id
- Soft atmosphere (subtle grain/gradient); expressive typography for brand; no purple/glow AI look

### Pad (`/pad/[id]`)

- Full-bleed drawing surface (the ink is the focus)
- Floating toolbar: 5 ink colors + Clear
  - Ink: charcoal `#1a1a1a`, clay `#c45c26`, sea `#2f6f6a`, ink blue `#2c4a7c`, rose `#a33b5a`
- Share by copying the room URL (optional copy button in toolbar)
- No cards in the hero/pad chrome; toolbar is minimal chrome only
- Pointer Events for mouse, touch, and Apple Pencil; `touch-action: none` to prevent scroll/zoom while drawing
- Subtle motion on toolbar/landing enter only

### Out of scope (v1)

- Auth, nicknames, presence cursors
- Brush sizes, eraser, undo, pressure width
- Export/download image
- Room listing / lobby beyond create + optional id join

## Architecture

```
Browser (canvas + Pointer Events)
    ↕ WebSocket
WS server (rooms, broadcast, clear)
    ↕ Redis
  • Stroke list per room (append on draw)
  • Pub/Sub channel per room (fan-out across WS instances)
  • Key TTL ~24h, refreshed on activity
```

### Processes (local)

1. Redis via `docker compose`
2. Next.js (`yarn dev`) — UI only
3. WebSocket server (separate Node/`tsx` process on port `3001`) — rooms, Redis I/O, broadcast

### Stroke model

```ts
type Point = { x: number; y: number }; // normalized 0–1
type Stroke = {
  id: string;
  color: string; // one of the 5 palette hex values
  points: Point[]; // max 2000 points; server truncates if longer
  createdAt: number;
};
```

Normalized coordinates so different screen sizes share the same pad space. Local drawing paints immediately; the finished stroke is sent once on pointer-up (not every move) to keep traffic low.

### Protocol

| Direction | Type | Purpose |
| --- | --- | --- |
| C→S | `join` | `{ roomId }` — enter room |
| S→C | `history` | `{ strokes: Stroke[] }` — full state after join |
| C→S / S→C | `stroke` | `{ stroke: Stroke }` — new stroke |
| C→S / S→C | `clear` | wipe room |
| S→C | `error` | `{ message }` |

### Redis keys

- `pad:{roomId}:strokes` — Redis **LIST** of JSON strokes (`RPUSH` / `LRANGE 0 -1` / `DEL` on clear)
- Pub/Sub channel name `pad:{roomId}` — fan-out across WS instances
- TTL 86400s on the strokes key; `EXPIRE` refreshed on stroke append or clear
- Max strokes retained per room: 5000 (trim from the left if exceeded)

## Components

| Unit | Responsibility | Does not |
| --- | --- | --- |
| `CanvasBoard` | Render strokes; local drawing via Pointer Events | Network |
| `usePadSocket` | Connect, join, send/receive, reconnect | Drawing math |
| `ColorToolbar` | Color selection + clear action | Socket details |
| `HomeCreate` | Create/join room navigation | Drawing |
| WS `rooms` | Room membership, broadcast | Persistence details |
| WS `redis` | Append/load strokes, pub/sub, TTL | HTTP |
| WS `protocol` | Message parse/validate | Business beyond schema |

## Edge cases

- **Reconnect:** client re-sends `join`, replaces local canvas from fresh `history` (avoids duplicate strokes)
- **Redis unavailable:** in-process broadcast still works; persistence/history degraded; UI shows subtle “offline sync” state
- **Oversized strokes:** server caps points per stroke
- **Clear:** room-wide, irreversible in v1 (no undo)

## Error handling

- Invalid room id / malformed messages → `error` to sender, ignore otherwise
- WS disconnect → client reconnects with backoff, then re-`join`
- Clear and stroke writes refresh Redis TTL when Redis is healthy

## Testing (lightweight v1)

- Protocol unit tests: validate stroke shape, point cap, normalize bounds
- Manual: two browsers same room; draw + clear; refresh mid-session recovers history
- Manual iPad: Pencil draws without page scroll

## Success criteria

1. Two users on the same `/pad/[id]` see each other’s strokes in near real time
2. Refresh within 24h restores the pad from Redis
3. Mouse and Apple Pencil both draw cleanly
4. UI feels calm and paper-like; brand leads on the home page
`