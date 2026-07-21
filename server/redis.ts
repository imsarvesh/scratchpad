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

function trimMemory(list: Stroke[]): Stroke[] {
  if (list.length <= MAX_STROKES_PER_ROOM) return list;
  return list.slice(-MAX_STROKES_PER_ROOM);
}

export async function clearStoredStrokes(
  redis: { del(key: string): Promise<unknown> },
  roomId: string,
): Promise<void> {
  await redis.del(strokesKey(roomId));
}

export function createPadStore(redisUrl: string) {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
  });
  const sub = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
  });
  let healthy = false;
  const memory = new Map<string, Stroke[]>();

  redis.on("error", () => {
    healthy = false;
  });
  sub.on("error", () => {
    healthy = false;
  });

  async function ensure() {
    if (redis.status === "end" || redis.status === "close") {
      redis.connect().catch(() => undefined);
    }
    if (sub.status === "end" || sub.status === "close") {
      sub.connect().catch(() => undefined);
    }
    if (redis.status === "wait") await redis.connect();
    if (sub.status === "wait") await sub.connect();
    await redis.ping();
    if (!healthy) {
      console.log("[redis] connected");
    }
    healthy = true;
  }

  function remember(roomId: string, strokes: Stroke[]) {
    memory.set(roomId, trimMemory(strokes));
  }

  return {
    isHealthy: () => healthy,
    async getStrokes(roomId: string): Promise<Stroke[]> {
      try {
        await ensure();
        const raw = await redis.lrange(strokesKey(roomId), 0, -1);
        const strokes = raw.map((s) => JSON.parse(s) as Stroke);
        remember(roomId, strokes);
        return strokes;
      } catch (err) {
        healthy = false;
        console.warn(
          "[redis] getStrokes failed — using memory:",
          err instanceof Error ? err.message : err,
        );
        return memory.get(roomId) ?? [];
      }
    },
    async appendStroke(roomId: string, stroke: Stroke): Promise<void> {
      const local = memory.get(roomId) ?? [];
      local.push(stroke);
      remember(roomId, local);

      try {
        await ensure();
        const key = strokesKey(roomId);
        await redis
          .multi()
          .rpush(key, JSON.stringify(stroke))
          .ltrim(key, -MAX_STROKES_PER_ROOM, -1)
          .expire(key, ROOM_TTL_SECONDS)
          .exec();
      } catch (err) {
        healthy = false;
        console.warn(
          "[redis] appendStroke failed — kept in memory:",
          err instanceof Error ? err.message : err,
        );
      }
    },
    async clearStrokes(roomId: string): Promise<void> {
      memory.delete(roomId);
      try {
        await ensure();
        await clearStoredStrokes(redis, roomId);
      } catch (err) {
        healthy = false;
        console.warn(
          "[redis] clearStrokes failed:",
          err instanceof Error ? err.message : err,
        );
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
      await redis.quit().catch(() => undefined);
      await sub.quit().catch(() => undefined);
    },
  };
}

export type PadStore = ReturnType<typeof createPadStore>;
