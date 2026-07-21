import Redis from "ioredis";

import { createFallbackRoomId } from "@shared/protocol";

const NEXT_ROOM_KEY = "pad:next_room";
/** First allocated room is 101 (counter starts at 100, then INCR). */
const NEXT_ROOM_SEED = "100";

/**
 * Allocates the next sequential room id (101, 102, …) via Redis.
 * Seeds the counter on first use.
 */
export async function allocateNextRoomId(
  redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
): Promise<string> {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 2000,
  });

  try {
    await redis.connect();
    await redis.set(NEXT_ROOM_KEY, NEXT_ROOM_SEED, "NX");
    const n = await redis.incr(NEXT_ROOM_KEY);
    return String(n);
  } finally {
    await redis.quit().catch(() => redis.disconnect());
  }
}

export { createFallbackRoomId };
