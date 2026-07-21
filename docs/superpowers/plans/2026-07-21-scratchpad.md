# Scratchpad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shareable collaborative scratch pad with Pointer Events drawing, five ink colors, Clear, WebSocket realtime sync, and Redis stroke persistence (24h TTL).

**Architecture:** Next.js 16 App Router serves the UI. A separate Node WebSocket server (`ws` + `tsx`) manages rooms, validates protocol messages, persists strokes in Redis LIST keys, and fans out via Redis pub/sub. Clients normalize stroke points to 0–1 and send finished strokes on pointer-up.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, `ws`, `ioredis`, `nanoid`, `tsx`, Vitest, Docker Compose (Redis 7)

## Global Constraints

- Room URLs: `/pad/[id]` with 10-char `nanoid` ids
- Ink palette only: `#1a1a1a`, `#c45c26`, `#2f6f6a`, `#2c4a7c`, `#a33b5a`
- Max 2000 points per stroke (server truncates); max 5000 strokes per room (LTRIM)
- Redis TTL 86400s refreshed on stroke/clear; key `pad:{roomId}:strokes`; pub/sub channel `pad:{roomId}`
- Anonymous — no names, cursors, or presence UI
- WS default `ws://localhost:3001` via `NEXT_PUBLIC_WS_URL`
- No brush sizes, eraser, undo, pressure, auth, or image export in v1
- Elegant paper-like UI; brand-first home; avoid purple/glow AI aesthetic and default Inter/Roboto stacks

## File Structure

| Path | Responsibility |
| --- | --- |
| `shared/protocol.ts` | Types, constants, parse/validate/normalize helpers (shared by client + server) |
| `shared/protocol.test.ts` | Vitest coverage for protocol helpers |
| `server/redis.ts` | Redis client: load/append/clear strokes, TTL, pub/sub publish/subscribe |
| `server/rooms.ts` | In-memory socket→room map; broadcast to local sockets |
| `server/index.ts` | WebSocket server entry: join/stroke/clear handlers |
| `docker-compose.yml` | Redis 7 on port 6379 |
| `hooks/usePadSocket.ts` | Client WS lifecycle: connect, join, history, stroke, clear, reconnect |
| `components/CanvasBoard.tsx` | Canvas rendering + local Pointer Events drawing |
| `components/ColorToolbar.tsx` | Color swatches, clear, copy link |
| `components/HomeCreate.tsx` | New pad + join-by-id |
| `app/page.tsx` | Landing |
| `app/pad/[id]/page.tsx` | Pad route composing canvas + toolbar + socket |
| `app/layout.tsx` / `app/globals.css` | Fonts, CSS variables, paper atmosphere |
| `.env.local.example` | `NEXT_PUBLIC_WS_URL`, `REDIS_URL` |

---

### Task 1: Scaffold tooling, Redis, shared package path

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.local.example`
- Create: `vitest.config.ts`
- Create: `shared/protocol.ts` (stub export only — full impl in Task 2)
- Modify: `package.json`
- Modify: `tsconfig.json` (path alias `@shared/*`)

**Interfaces:**
- Consumes: none
- Produces: scripts `dev:ws`, `test`; deps installed; Redis compose file

- [ ] **Step 1: Add docker-compose for Redis**

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: ["redis-server", "--save", "", "--appendonly", "no"]
```

- [ ] **Step 2: Add env example**

```bash
# .env.local.example
NEXT_PUBLIC_WS_URL=ws://localhost:3001
REDIS_URL=redis://127.0.0.1:6379
WS_PORT=3001
```

- [ ] **Step 3: Update package.json scripts and dependencies**

Add dependencies: `ws`, `ioredis`, `nanoid`  
Add devDependencies: `tsx`, `vitest`, `@types/ws`, `concurrently`  
Update scripts:

```json
{
  "scripts": {
    "dev": "concurrently -n next,ws -c cyan,magenta \"next dev\" \"tsx watch server/index.ts\"",
    "dev:next": "next dev",
    "dev:ws": "tsx watch server/index.ts",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Run: `yarn add ws ioredis nanoid && yarn add -D tsx vitest @types/ws concurrently`

- [ ] **Step 4: Add Vitest config and tsconfig paths**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
```

In `tsconfig.json` `compilerOptions.paths` add:

```json
"@shared/*": ["./shared/*"]
```

- [ ] **Step 5: Stub shared module so imports resolve**

```ts
// shared/protocol.ts
export const INK_COLORS = [
  "#1a1a1a",
  "#c45c26",
  "#2f6f6a",
  "#2c4a7c",
  "#a33b5a",
] as const;

export type InkColor = (typeof INK_COLORS)[number];
```

- [ ] **Step 6: Start Redis and verify**

Run: `docker compose up -d`  
Run: `docker compose ps`  
Expected: `redis` running, port 6379

- [ ] **Step 7: Commit (if git repo exists; otherwise `git init` first with user OK)**

```bash
git add docker-compose.yml .env.local.example package.json yarn.lock vitest.config.ts tsconfig.json shared/protocol.ts
git commit -m "chore: scaffold Redis, Vitest, and WS tooling"
```

---

### Task 2: Shared protocol — types, validation, normalization

**Files:**
- Modify: `shared/protocol.ts`
- Create: `shared/protocol.test.ts`

**Interfaces:**
- Consumes: stub from Task 1
- Produces:
  - `Point`, `Stroke`, client/server message union types
  - `MAX_POINTS_PER_STROKE = 2000`, `MAX_STROKES_PER_ROOM = 5000`, `ROOM_TTL_SECONDS = 86400`
  - `isInkColor(c: string): c is InkColor`
  - `normalizeStroke(raw: unknown): Stroke | null` — validates id/color/points, clamps points to 0–1, truncates to 2000
  - `isValidRoomId(id: string): boolean` — `/^[A-Za-z0-9_-]{10}$/`
  - `parseClientMessage(data: string): ClientMessage | null`
  - `serializeMessage(msg: ServerMessage | ClientMessage): string`

- [ ] **Step 1: Write failing tests**

```ts
// shared/protocol.test.ts
import { describe, expect, it } from "vitest";
import {
  normalizeStroke,
  isValidRoomId,
  parseClientMessage,
  INK_COLORS,
  MAX_POINTS_PER_STROKE,
} from "./protocol";

describe("isValidRoomId", () => {
  it("accepts 10-char URL-safe ids", () => {
    expect(isValidRoomId("abcdefghij")).toBe(true);
    expect(isValidRoomId("Ab_12-XyZ9")).toBe(true);
  });
  it("rejects bad lengths or chars", () => {
    expect(isValidRoomId("short")).toBe(false);
    expect(isValidRoomId("abcdefghijk")).toBe(false);
    expect(isValidRoomId("bad id!!!!")).toBe(false);
  });
});

describe("normalizeStroke", () => {
  it("accepts a valid stroke and clamps points", () => {
    const stroke = normalizeStroke({
      id: "s1",
      color: INK_COLORS[0],
      points: [
        { x: -0.2, y: 0.5 },
        { x: 1.5, y: 2 },
      ],
      createdAt: 1,
    });
    expect(stroke).toEqual({
      id: "s1",
      color: INK_COLORS[0],
      points: [
        { x: 0, y: 0.5 },
        { x: 1, y: 1 },
      ],
      createdAt: 1,
    });
  });

  it("rejects unknown colors", () => {
    expect(
      normalizeStroke({
        id: "s1",
        color: "#ff0000",
        points: [{ x: 0.1, y: 0.1 }],
        createdAt: 1,
      }),
    ).toBeNull();
  });

  it("truncates points beyond MAX_POINTS_PER_STROKE", () => {
    const points = Array.from({ length: MAX_POINTS_PER_STROKE + 50 }, (_, i) => ({
      x: i / (MAX_POINTS_PER_STROKE + 50),
      y: 0.5,
    }));
    const stroke = normalizeStroke({
      id: "s1",
      color: INK_COLORS[1],
      points,
      createdAt: 1,
    });
    expect(stroke?.points).toHaveLength(MAX_POINTS_PER_STROKE);
  });

  it("rejects empty points", () => {
    expect(
      normalizeStroke({
        id: "s1",
        color: INK_COLORS[0],
        points: [],
        createdAt: 1,
      }),
    ).toBeNull();
  });
});

describe("parseClientMessage", () => {
  it("parses join", () => {
    expect(parseClientMessage(JSON.stringify({ type: "join", roomId: "abcdefghij" }))).toEqual({
      type: "join",
      roomId: "abcdefghij",
    });
  });
  it("returns null for garbage", () => {
    expect(parseClientMessage("not-json")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "nope" }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `yarn test`  
Expected: FAIL (exports missing / not implemented)

- [ ] **Step 3: Implement `shared/protocol.ts` fully**

```ts
// shared/protocol.ts
export const INK_COLORS = [
  "#1a1a1a",
  "#c45c26",
  "#2f6f6a",
  "#2c4a7c",
  "#a33b5a",
] as const;

export type InkColor = (typeof INK_COLORS)[number];

export const MAX_POINTS_PER_STROKE = 2000;
export const MAX_STROKES_PER_ROOM = 5000;
export const ROOM_TTL_SECONDS = 86400;

export type Point = { x: number; y: number };

export type Stroke = {
  id: string;
  color: InkColor;
  points: Point[];
  createdAt: number;
};

export type ClientMessage =
  | { type: "join"; roomId: string }
  | { type: "stroke"; stroke: Stroke }
  | { type: "clear"; roomId: string };

export type ServerMessage =
  | { type: "history"; strokes: Stroke[] }
  | { type: "stroke"; stroke: Stroke }
  | { type: "clear" }
  | { type: "error"; message: string }
  | { type: "syncStatus"; redis: boolean };

export function isInkColor(c: string): c is InkColor {
  return (INK_COLORS as readonly string[]).includes(c);
}

export function isValidRoomId(id: string): boolean {
  return /^[A-Za-z0-9_-]{10}$/.test(id);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function normalizeStroke(raw: unknown): Stroke | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id.length === 0 || o.id.length > 64) return null;
  if (typeof o.color !== "string" || !isInkColor(o.color)) return null;
  if (typeof o.createdAt !== "number" || !Number.isFinite(o.createdAt)) return null;
  if (!Array.isArray(o.points) || o.points.length === 0) return null;

  const points: Point[] = [];
  for (const p of o.points.slice(0, MAX_POINTS_PER_STROKE)) {
    if (!p || typeof p !== "object") return null;
    const pt = p as Record<string, unknown>;
    if (typeof pt.x !== "number" || typeof pt.y !== "number") return null;
    points.push({ x: clamp01(pt.x), y: clamp01(pt.y) });
  }
  if (points.length === 0) return null;

  return {
    id: o.id,
    color: o.color,
    points,
    createdAt: o.createdAt,
  };
}

export function parseClientMessage(data: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const msg = parsed as Record<string, unknown>;
  if (msg.type === "join" && typeof msg.roomId === "string" && isValidRoomId(msg.roomId)) {
    return { type: "join", roomId: msg.roomId };
  }
  if (msg.type === "clear" && typeof msg.roomId === "string" && isValidRoomId(msg.roomId)) {
    return { type: "clear", roomId: msg.roomId };
  }
  if (msg.type === "stroke") {
    const stroke = normalizeStroke(msg.stroke);
    if (!stroke) return null;
    return { type: "stroke", stroke };
  }
  return null;
}

export function serializeMessage(msg: ServerMessage | ClientMessage): string {
  return JSON.stringify(msg);
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `yarn test`  
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add shared/protocol.ts shared/protocol.test.ts
git commit -m "feat: add shared pad protocol validation"
```

---

### Task 3: Redis persistence + pub/sub helpers

**Files:**
- Create: `server/redis.ts`
- Create: `server/redis.test.ts` (integration — skip if Redis unreachable)

**Interfaces:**
- Consumes: `Stroke`, `ROOM_TTL_SECONDS`, `MAX_STROKES_PER_ROOM` from `@shared/protocol` (use relative import `../shared/protocol` from server to avoid Next bundling issues, OR keep `@shared` via tsx/vitest alias)
- Produces:
  - `createPadStore(redisUrl: string)` → `{ getStrokes, appendStroke, clearStrokes, publish, subscribe, isHealthy, quit }`
  - Strokes key: `pad:{roomId}:strokes`
  - Channel: `pad:{roomId}`
  - On append: `RPUSH`, `LTRIM -MAX_STROKES_PER_ROOM -1`, `EXPIRE`
  - On clear: `DEL` then `EXPIRE` not needed; publish `{type:"clear"}`
  - `isHealthy()` reflects last successful ping / connection status

- [ ] **Step 1: Write integration test**

```ts
// server/redis.test.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createPadStore } from "./redis";
import { INK_COLORS } from "../shared/protocol";

const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

describe("createPadStore", () => {
  const store = createPadStore(url);
  const roomId = "testroom01";

  beforeAll(async () => {
    await store.clearStrokes(roomId);
  });

  afterAll(async () => {
    await store.clearStrokes(roomId);
    await store.quit();
  });

  it("appends and loads strokes", async () => {
    const stroke = {
      id: "stroke-1",
      color: INK_COLORS[0],
      points: [{ x: 0.1, y: 0.2 }],
      createdAt: Date.now(),
    };
    await store.appendStroke(roomId, stroke);
    const strokes = await store.getStrokes(roomId);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]?.id).toBe("stroke-1");
  });

  it("clears strokes", async () => {
    await store.clearStrokes(roomId);
    expect(await store.getStrokes(roomId)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test server/redis.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `server/redis.ts`**

```ts
// server/redis.ts
import Redis from "ioredis";
import {
  MAX_STROKES_PER_ROOM,
  ROOM_TTL_SECONDS,
  type Stroke,
  type ServerMessage,
} from "../shared/protocol";

function strokesKey(roomId: string) {
  return `pad:${roomId}:strokes`;
}

function channel(roomId: string) {
  return `pad:${roomId}`;
}

export function createPadStore(redisUrl: string) {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
  const sub = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
  let healthy = false;

  async function ensure() {
    if (redis.status === "wait") await redis.connect();
    if (sub.status === "wait") await sub.connect();
    await redis.ping();
    healthy = true;
  }

  return {
    isHealthy: () => healthy,
    async getStrokes(roomId: string): Promise<Stroke[]> {
      try {
        await ensure();
        const raw = await redis.lrange(strokesKey(roomId), 0, -1);
        return raw.map((s) => JSON.parse(s) as Stroke);
      } catch {
        healthy = false;
        return [];
      }
    },
    async appendStroke(roomId: string, stroke: Stroke): Promise<void> {
      try {
        await ensure();
        const key = strokesKey(roomId);
        await redis
          .multi()
          .rpush(key, JSON.stringify(stroke))
          .ltrim(key, -MAX_STROKES_PER_ROOM, -1)
          .expire(key, ROOM_TTL_SECONDS)
          .exec();
      } catch {
        healthy = false;
      }
    },
    async clearStrokes(roomId: string): Promise<void> {
      try {
        await ensure();
        await redis.del(strokesKey(roomId));
      } catch {
        healthy = false;
      }
    },
    async publish(roomId: string, message: ServerMessage): Promise<void> {
      try {
        await ensure();
        await redis.publish(channel(roomId), JSON.stringify(message));
      } catch {
        healthy = false;
      }
    },
    async subscribe(
      roomId: string,
      onMessage: (msg: ServerMessage) => void,
    ): Promise<() => Promise<void>> {
      await ensure();
      const ch = channel(roomId);
      const handler = (c: string, payload: string) => {
        if (c !== ch) return;
        try {
          onMessage(JSON.parse(payload) as ServerMessage);
        } catch {
          /* ignore */
        }
      };
      sub.on("message", handler);
      await sub.subscribe(ch);
      return async () => {
        sub.off("message", handler);
        await sub.unsubscribe(ch);
      };
    },
    async quit() {
      await redis.quit();
      await sub.quit();
    },
  };
}

export type PadStore = ReturnType<typeof createPadStore>;
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `yarn test`  
Expected: PASS (Redis must be up)

- [ ] **Step 5: Commit**

```bash
git add server/redis.ts server/redis.test.ts
git commit -m "feat: add Redis pad stroke store"
```

---

### Task 4: Room registry + WebSocket server

**Files:**
- Create: `server/rooms.ts`
- Create: `server/index.ts`

**Interfaces:**
- Consumes: `createPadStore`, `parseClientMessage`, `serializeMessage`, `normalizeStroke`
- Produces: WS server on `WS_PORT` (default 3001) handling join → history, stroke persist+broadcast, clear wipe+broadcast; on Redis failure still broadcasts locally and sends `syncStatus { redis: false }`

- [ ] **Step 1: Implement `server/rooms.ts`**

```ts
// server/rooms.ts
import type { WebSocket } from "ws";

export type RoomRegistry = {
  join(roomId: string, socket: WebSocket): void;
  leave(socket: WebSocket): void;
  broadcast(roomId: string, data: string, except?: WebSocket): void;
  getRoom(socket: WebSocket): string | undefined;
};

export function createRoomRegistry(): RoomRegistry {
  const roomToSockets = new Map<string, Set<WebSocket>>();
  const socketToRoom = new Map<WebSocket, string>();

  return {
    join(roomId, socket) {
      const prev = socketToRoom.get(socket);
      if (prev) {
        roomToSockets.get(prev)?.delete(socket);
      }
      socketToRoom.set(socket, roomId);
      let set = roomToSockets.get(roomId);
      if (!set) {
        set = new Set();
        roomToSockets.set(roomId, set);
      }
      set.add(socket);
    },
    leave(socket) {
      const roomId = socketToRoom.get(socket);
      socketToRoom.delete(socket);
      if (!roomId) return;
      const set = roomToSockets.get(roomId);
      set?.delete(socket);
      if (set && set.size === 0) roomToSockets.delete(roomId);
    },
    broadcast(roomId, data, except) {
      const set = roomToSockets.get(roomId);
      if (!set) return;
      for (const s of set) {
        if (s === except) continue;
        if (s.readyState === s.OPEN) s.send(data);
      }
    },
    getRoom(socket) {
      return socketToRoom.get(socket);
    },
  };
}
```

- [ ] **Step 2: Implement `server/index.ts`**

```ts
// server/index.ts
import { WebSocketServer, type WebSocket } from "ws";
import { createPadStore } from "./redis";
import { createRoomRegistry } from "./rooms";
import {
  parseClientMessage,
  serializeMessage,
  type ServerMessage,
} from "../shared/protocol";

const port = Number(process.env.WS_PORT ?? 3001);
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

const store = createPadStore(redisUrl);
const rooms = createRoomRegistry();
const wss = new WebSocketServer({ port });

function send(socket: WebSocket, msg: ServerMessage) {
  if (socket.readyState === socket.OPEN) {
    socket.send(serializeMessage(msg));
  }
}

wss.on("connection", (socket) => {
  socket.on("message", async (raw) => {
    const text = typeof raw === "string" ? raw : raw.toString();
    const msg = parseClientMessage(text);
    if (!msg) {
      send(socket, { type: "error", message: "Invalid message" });
      return;
    }

    if (msg.type === "join") {
      rooms.join(msg.roomId, socket);
      const strokes = await store.getStrokes(msg.roomId);
      send(socket, { type: "syncStatus", redis: store.isHealthy() });
      send(socket, { type: "history", strokes });
      return;
    }

    const roomId = rooms.getRoom(socket);
    if (!roomId) {
      send(socket, { type: "error", message: "Join a room first" });
      return;
    }

    if (msg.type === "stroke") {
      if (msg.stroke && roomId) {
        await store.appendStroke(roomId, msg.stroke);
        const out: ServerMessage = { type: "stroke", stroke: msg.stroke };
        const payload = serializeMessage(out);
        rooms.broadcast(roomId, payload, socket);
        await store.publish(roomId, out);
        send(socket, { type: "syncStatus", redis: store.isHealthy() });
      }
      return;
    }

    if (msg.type === "clear") {
      if (msg.roomId !== roomId) {
        send(socket, { type: "error", message: "Room mismatch" });
        return;
      }
      await store.clearStrokes(roomId);
      const out: ServerMessage = { type: "clear" };
      const payload = serializeMessage(out);
      rooms.broadcast(roomId, payload);
      await store.publish(roomId, out);
      send(socket, { type: "syncStatus", redis: store.isHealthy() });
    }
  });

  socket.on("close", () => {
    rooms.leave(socket);
  });
});

console.log(`Scratchpad WS listening on :${port}`);
```

Note: For single-instance local v1, in-process `rooms.broadcast` is enough; `publish` enables multi-instance later. Do **not** also re-broadcast pub/sub to the same process in v1 (avoids duplicates). Document that multi-instance needs a subscriber that skips locally originated messages — out of scope for local docker single WS.

- [ ] **Step 3: Smoke-test WS manually**

Run: `yarn dev:ws`  
Expected: log `Scratchpad WS listening on :3001`

Optional quick check with `websocat` or a tiny node snippet joining a room.

- [ ] **Step 4: Commit**

```bash
git add server/rooms.ts server/index.ts
git commit -m "feat: add WebSocket room server"
```

---

### Task 5: Home page — brand, create, join

**Files:**
- Create: `components/HomeCreate.tsx`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `nanoid` with custom alphabet matching `isValidRoomId`
- Produces: landing CTAs navigating to `/pad/{id}`

- [ ] **Step 1: Update fonts and global atmosphere**

Use Google fonts **Fraunces** (display) + **Source Sans 3** (body) — not Geist/Inter. Update `layout.tsx` metadata title to `Scratchpad`.

```css
/* app/globals.css — key variables */
@import "tailwindcss";

:root {
  --paper: #e8e2d6;
  --paper-deep: #d4cbb8;
  --ink: #1a1a1a;
  --muted: #5c564c;
  --accent: #2f6f6a;
  --background: var(--paper);
  --foreground: var(--ink);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-body);
  --font-display: var(--font-display);
}

body {
  background:
    radial-gradient(ellipse 120% 80% at 20% 0%, #f3efe6 0%, transparent 55%),
    radial-gradient(ellipse 100% 70% at 100% 100%, #d9d0c0 0%, transparent 50%),
    var(--paper);
  color: var(--ink);
  font-family: var(--font-body), "Source Sans 3", sans-serif;
}

.paper-grain {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E");
}
```

- [ ] **Step 2: Implement `HomeCreate`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-",
  10,
);

export function HomeCreate() {
  const router = useRouter();
  const [joinId, setJoinId] = useState("");

  return (
    <div className="flex flex-col items-stretch gap-4 w-full max-w-sm">
      <button
        type="button"
        onClick={() => router.push(`/pad/${nanoid()}`)}
        className="bg-[var(--ink)] text-[var(--paper)] px-6 py-3 text-lg tracking-wide transition hover:opacity-90 active:scale-[0.99]"
      >
        New pad
      </button>
      <div className="flex gap-2">
        <input
          value={joinId}
          onChange={(e) => setJoinId(e.target.value.trim())}
          placeholder="Room id"
          maxLength={10}
          className="flex-1 bg-transparent border-b border-[var(--muted)] px-2 py-2 outline-none focus:border-[var(--accent)]"
          aria-label="Room id"
        />
        <button
          type="button"
          disabled={joinId.length !== 10}
          onClick={() => router.push(`/pad/${joinId}`)}
          className="px-4 py-2 border border-[var(--ink)] disabled:opacity-40"
        >
          Join
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace `app/page.tsx` with brand-first landing**

Single composition: brand name large, one sentence, CTA group. Full-bleed paper atmosphere. Motion: fade/slide-in on brand and CTA (`@keyframes` in CSS, 2–3 intentional motions).

- [ ] **Step 4: Visual check**

Run: `yarn dev:next` → open `/`  
Expected: Scratchpad brand dominates; New pad works

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/layout.tsx app/globals.css components/HomeCreate.tsx
git commit -m "feat: add Scratchpad home create/join"
```

---

### Task 6: CanvasBoard — Pointer Events drawing

**Files:**
- Create: `components/CanvasBoard.tsx`

**Interfaces:**
- Consumes: `Stroke`, `InkColor`, `Point` from shared protocol
- Produces: React component

```tsx
type CanvasBoardProps = {
  color: InkColor;
  strokes: Stroke[];
  onStrokeComplete: (stroke: Stroke) => void;
};
```

- Local in-progress path drawn immediately
- On pointerup: build `Stroke` with `crypto.randomUUID()`, normalized points, call `onStrokeComplete`
- Re-render all `strokes` from props (replace on history)
- `touch-action: none`; `setPointerCapture`
- Resize canvas to parent via ResizeObserver; devicePixelRatio aware

- [ ] **Step 1: Implement CanvasBoard**

Draw strokes with `lineCap = "round"`, `lineJoin = "round"`, fixed lineWidth ~2.5 CSS px. Convert pointer coords → normalized via canvas CSS width/height.

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { InkColor, Point, Stroke } from "../shared/protocol";

type Props = {
  color: InkColor;
  strokes: Stroke[];
  onStrokeComplete: (stroke: Stroke) => void;
};

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
) {
  if (stroke.points.length === 0) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  stroke.points.forEach((p, i) => {
    const x = p.x * w;
    const y = p.y * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

export function CanvasBoard({ color, strokes, onStrokeComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Point[] | null>(null);
  const colorRef = useRef(color);
  colorRef.current = color;

  // Resize + redraw strokes whenever strokes change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const paint = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const s of strokes) drawStroke(ctx, s, rect.width, rect.height);
    };

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [strokes]);

  function toNorm(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 touch-none cursor-crosshair"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = [toNorm(e)];
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const p = toNorm(e);
        drawing.current.push(p);
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const rect = canvas.getBoundingClientRect();
        const pts = drawing.current;
        if (pts.length < 2) return;
        const a = pts[pts.length - 2]!;
        const b = pts[pts.length - 1]!;
        ctx.strokeStyle = colorRef.current;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(a.x * rect.width, a.y * rect.height);
        ctx.lineTo(b.x * rect.width, b.y * rect.height);
        ctx.stroke();
      }}
      onPointerUp={() => {
        const points = drawing.current;
        drawing.current = null;
        if (!points || points.length === 0) return;
        onStrokeComplete({
          id: crypto.randomUUID(),
          color: colorRef.current,
          points,
          createdAt: Date.now(),
        });
      }}
      onPointerCancel={() => {
        drawing.current = null;
      }}
    />
  );
}
```

- [ ] **Step 2: Temporary mount on a test route OR skip to Task 8 for wiring — verify pointer draw works with a local `useState` harness if needed**

- [ ] **Step 3: Commit**

```bash
git add components/CanvasBoard.tsx
git commit -m "feat: add pointer-driven canvas board"
```

---

### Task 7: usePadSocket hook

**Files:**
- Create: `hooks/usePadSocket.ts`

**Interfaces:**
- Consumes: protocol serialize/parse types
- Produces:

```ts
function usePadSocket(roomId: string): {
  strokes: Stroke[];
  status: "connecting" | "open" | "closed";
  redisOk: boolean;
  sendStroke: (stroke: Stroke) => void;
  clear: () => void;
}
```

Behavior:
- Connect to `process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001"`
- On open: send `{ type: "join", roomId }`
- On `history`: replace `strokes`
- On `stroke`: append (skip if id already present)
- On `clear`: set strokes `[]`
- On `syncStatus`: set `redisOk`
- On close: exponential backoff reconnect (1s, 2s, 4s … cap 10s), then re-join
- `sendStroke`: optimistic append locally + send message
- `clear`: send `{ type: "clear", roomId }`

- [ ] **Step 1: Implement hook**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  serializeMessage,
  type ServerMessage,
  type Stroke,
} from "../shared/protocol";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

export function usePadSocket(roomId: string) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [redisOk, setRedisOk] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);

  const sendStroke = useCallback((stroke: Stroke) => {
    setStrokes((prev) => (prev.some((s) => s.id === stroke.id) ? prev : [...prev, stroke]));
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(serializeMessage({ type: "stroke", stroke }));
    }
  }, []);

  const clear = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(serializeMessage({ type: "clear", roomId }));
    }
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      if (cancelled) return;
      setStatus("connecting");
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1000;
        setStatus("open");
        ws.send(serializeMessage({ type: "join", roomId }));
      };

      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === "history") setStrokes(msg.strokes);
        if (msg.type === "stroke") {
          setStrokes((prev) =>
            prev.some((s) => s.id === msg.stroke.id) ? prev : [...prev, msg.stroke],
          );
        }
        if (msg.type === "clear") setStrokes([]);
        if (msg.type === "syncStatus") setRedisOk(msg.redis);
      };

      ws.onclose = () => {
        setStatus("closed");
        wsRef.current = null;
        const delay = backoffRef.current;
        backoffRef.current = Math.min(10000, delay * 2);
        timer = setTimeout(connect, delay);
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [roomId]);

  return { strokes, status, redisOk, sendStroke, clear };
}
```

- [ ] **Step 2: Commit**

```bash
git add hooks/usePadSocket.ts
git commit -m "feat: add pad WebSocket hook"
```

---

### Task 8: ColorToolbar + pad page composition

**Files:**
- Create: `components/ColorToolbar.tsx`
- Create: `app/pad/[id]/page.tsx`

**Interfaces:**
- Consumes: `CanvasBoard`, `usePadSocket`, `INK_COLORS`
- Produces: full pad experience

- [ ] **Step 1: ColorToolbar**

Props: `color`, `onColorChange`, `onClear`, `onCopyLink`, `redisOk`, `status`

Floating bottom or side: swatches as plain circles (selected = ring), Clear text button, Copy link, subtle “sync offline” when `!redisOk`.

- [ ] **Step 2: Pad page**

```tsx
"use client";

import { use, useState } from "react";
import { CanvasBoard } from "../../../components/CanvasBoard";
import { ColorToolbar } from "../../../components/ColorToolbar";
import { usePadSocket } from "../../../hooks/usePadSocket";
import { INK_COLORS, type InkColor } from "../../../shared/protocol";

export default function PadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [color, setColor] = useState<InkColor>(INK_COLORS[0]);
  const { strokes, sendStroke, clear, redisOk, status } = usePadSocket(id);

  return (
    <main className="relative h-dvh w-full overflow-hidden paper-grain">
      <CanvasBoard color={color} strokes={strokes} onStrokeComplete={sendStroke} />
      <ColorToolbar
        color={color}
        onColorChange={setColor}
        onClear={clear}
        onCopyLink={() => navigator.clipboard.writeText(window.location.href)}
        redisOk={redisOk}
        status={status}
      />
    </main>
  );
}
```

Validate `id` with `isValidRoomId`; if invalid, show simple “Invalid room” + link home.

- [ ] **Step 3: Manual two-browser test**

1. `docker compose up -d && yarn dev`
2. Browser A: New pad → draw
3. Browser B: open same URL → see history + live strokes
4. Clear from A → B clears
5. Refresh B → history restores

- [ ] **Step 4: Commit**

```bash
git add components/ColorToolbar.tsx app/pad/[id]/page.tsx
git commit -m "feat: wire collaborative pad page"
```

---

### Task 9: Polish README + final verification

**Files:**
- Modify: `README.md`
- Create: `.env.local` from example (do not commit secrets — none expected)

- [ ] **Step 1: README with run instructions**

```md
# Scratchpad

Collaborative drawing pad — share a link, draw together.

## Run locally

1. `docker compose up -d`
2. `cp .env.local.example .env.local`
3. `yarn install`
4. `yarn dev` — Next on :3000, WS on :3001
5. Open http://localhost:3000

## Tests

`yarn test`
```

- [ ] **Step 2: Run full verification**

Run: `yarn test` — expect PASS  
Run: `yarn build` — expect Next build success  
Manual checklist from Task 8

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: explain local Scratchpad setup"
```

---

## Spec coverage checklist

| Spec item | Task |
| --- | --- |
| Shareable `/pad/[id]` | 5, 8 |
| 24h Redis TTL + LIST | 3 |
| Anonymous / no presence | 5–8 (no UI) |
| 5 colors + clear | 2, 8 |
| Pointer Events / Pencil | 6 |
| Separate WS + Redis | 1, 3, 4 |
| History on join / reconnect | 4, 7 |
| Point cap 2000 / stroke cap 5000 | 2, 3 |
| Elegant paper UI | 5, 8 |
| Protocol tests | 2 |
| Offline sync status | 4, 7, 8 |

## Self-review notes

- Pub/sub publish is implemented for future multi-instance; single local WS uses in-process broadcast only (avoids duplicate strokes). Spec satisfied for local consistent data via Redis LIST history.
- Optimistic local append + server broadcast-with-except avoids double-draw for the author; remote clients get the stroke once.
- `clear` client does not wipe locally until server `clear` event (or could optimistic-clear — prefer wait for server echo via broadcast including sender: Task 4 broadcasts clear to all including sender — update Task 4 clear handler to include sender so UI updates). **Fix in Task 4:** `rooms.broadcast(roomId, payload)` already includes all members including clearer — good. Client should not optimistic-clear; wait for event. Hook `clear()` only sends — correct.
