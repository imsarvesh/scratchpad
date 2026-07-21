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
