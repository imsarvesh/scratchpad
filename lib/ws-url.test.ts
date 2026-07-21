import { describe, expect, it } from "vitest";
import { resolveWsUrl } from "./ws-url";

describe("resolveWsUrl", () => {
  it("returns null during SSR without an explicit hostname", () => {
    expect(resolveWsUrl("ws://localhost:3001")).toBeNull();
  });

  it("uses localhost default on local hosts", () => {
    expect(resolveWsUrl(undefined, "localhost", "http:")).toBe(
      "ws://localhost:3001",
    );
  });

  it("returns null on Vercel when still pointed at localhost", () => {
    expect(
      resolveWsUrl("ws://localhost:3001", "scratchpad.vercel.app", "https:"),
    ).toBeNull();
  });

  it("returns null on Vercel when env is unset", () => {
    expect(resolveWsUrl("", "scratchpad.vercel.app", "https:")).toBeNull();
    expect(resolveWsUrl(undefined, "scratchpad.vercel.app", "https:")).toBeNull();
  });

  it("keeps a real wss URL in production", () => {
    expect(
      resolveWsUrl("wss://scratchpad-ws.fly.dev", "scratchpad.vercel.app", "https:"),
    ).toBe("wss://scratchpad-ws.fly.dev");
  });

  it("upgrades ws:// to wss:// on https pages for public hosts", () => {
    expect(
      resolveWsUrl("ws://scratchpad-ws.fly.dev", "example.com", "https:"),
    ).toBe("wss://scratchpad-ws.fly.dev");
  });
});
