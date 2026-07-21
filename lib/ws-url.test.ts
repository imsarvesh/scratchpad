import { describe, expect, it } from "vitest";
import { resolveWsUrl, sanitizeWsUrlInput } from "./ws-url";

describe("sanitizeWsUrlInput", () => {
  it("strips a leading equals from pasted env values", () => {
    expect(sanitizeWsUrlInput("=wss://scratchpad-ws.fly.dev")).toBe(
      "wss://scratchpad-ws.fly.dev",
    );
  });

  it("strips KEY=value paste mistakes", () => {
    expect(
      sanitizeWsUrlInput("NEXT_PUBLIC_WS_URL=wss://scratchpad-ws.fly.dev"),
    ).toBe("wss://scratchpad-ws.fly.dev");
  });
});

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
    expect(
      resolveWsUrl(undefined, "scratchpad.vercel.app", "https:"),
    ).toBeNull();
  });

  it("keeps a real wss URL in production", () => {
    expect(
      resolveWsUrl(
        "wss://scratchpad-ws.fly.dev",
        "scratchpad.vercel.app",
        "https:",
      ),
    ).toBe("wss://scratchpad-ws.fly.dev");
  });

  it("fixes leading-equals env values so they are not relative URLs", () => {
    expect(
      resolveWsUrl(
        "=wss://scratchpad-ws.fly.dev",
        "scratchpad-ten-wheat.vercel.app",
        "https:",
      ),
    ).toBe("wss://scratchpad-ws.fly.dev");
  });

  it("rejects relative / non-ws values", () => {
    expect(
      resolveWsUrl("/pad/101", "scratchpad.vercel.app", "https:"),
    ).toBeNull();
  });

  it("upgrades ws:// to wss:// on https pages for public hosts", () => {
    expect(
      resolveWsUrl("ws://scratchpad-ws.fly.dev", "example.com", "https:"),
    ).toBe("wss://scratchpad-ws.fly.dev");
  });
});
