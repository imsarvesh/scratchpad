import Redis from "ioredis";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { clearStoredStrokes, createPadStore } from "./redis";
import { INK_COLORS } from "../shared/protocol";

const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

async function isRedisAvailable(redisUrl: string): Promise<boolean> {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    await client.quit().catch(() => client.disconnect());
  }
}

const redisAvailable = await isRedisAvailable(url);

describe("clearStoredStrokes", () => {
  it("only deletes the room's stroke key", async () => {
    const deletedKeys: string[] = [];
    const redis = {
      async del(key: string) {
        deletedKeys.push(key);
        return 1;
      },
    };

    await clearStoredStrokes(redis, "room-1");

    expect(deletedKeys).toEqual(["pad:room-1:strokes"]);
  });
});

describe.skipIf(!redisAvailable)("createPadStore", () => {
  const store = createPadStore(url);
  const roomId = "101";

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
    const stroke = {
      id: "stroke-clear",
      color: INK_COLORS[0],
      points: [{ x: 0.5, y: 0.5 }],
      createdAt: Date.now(),
    };
    await store.appendStroke(roomId, stroke);
    expect(await store.getStrokes(roomId)).toHaveLength(1);
    await store.clearStrokes(roomId);
    expect(await store.getStrokes(roomId)).toEqual([]);
  });

  it("does not publish when clearing strokes", async () => {
    const subscriber = new Redis(url);
    const clearRoomId = "clear-no-publish";
    let messages = 0;
    subscriber.on("message", () => {
      messages += 1;
    });
    try {
      await subscriber.subscribe(`pad:${clearRoomId}`);

      await store.clearStrokes(clearRoomId);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(messages).toBe(0);
    } finally {
      await subscriber.quit();
    }
  });
});
