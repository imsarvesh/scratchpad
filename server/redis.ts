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
        await redis.publish(channel(roomId), JSON.stringify({ type: "clear" }));
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
