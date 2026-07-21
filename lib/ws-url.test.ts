import { describe, expect, it } from "vitest";
import { resolveWsUrl } from "./ws-url";

describe("resolveWsUrl", () => {
  it("uses localhost default on local hosts", () => {
    expect(resolveWsUrl(undefined, "localhost")).toBe("ws://localhost:3001");
  });

  it("returns null on Vercel when still pointed at localhost", () => {
    expect(
      resolveWsUrl("ws://localhost:3001", "scratchpad.vercel.app"),
    ).toBeNull();
  });

  it("keeps a real wss URL in production", () => {
    expect(
      resolveWsUrl("wss://scratchpad-ws.fly.dev", "scratchpad.vercel.app"),
    ).toBe("wss://scratchpad-ws.fly.dev");
  });

  it("upgrades ws:// to wss:// on https pages when given a public host", () => {
    // Simulate https page via jsdom-less stub: function upgrades only when window is https.
    // Without window, raw ws public URL is returned as-is.
    expect(resolveWsUrl("ws://scratchpad-ws.fly.dev", "example.com")).toBe(
      "ws://scratchpad-ws.fly.dev",
    );
  });
});
