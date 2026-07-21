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
