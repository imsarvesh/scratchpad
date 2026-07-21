/**
 * Normalize env values that were pasted with a leading `=` or as KEY=value.
 */
export function sanitizeWsUrlInput(raw: string): string {
  let value = raw.trim();
  // Strip wrapping quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  // Common Vercel mistake: value set to `=wss://...` or full `KEY=wss://...`
  if (value.startsWith("=")) {
    value = value.slice(1).trim();
  }
  const keyEq = value.match(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.+)$/);
  if (keyEq?.[1]) {
    value = keyEq[1].trim();
  }
  return value;
}

function isAbsoluteWsUrl(url: string): boolean {
  return /^wss?:\/\//i.test(url);
}

/**
 * Resolve the WebSocket URL for the pad client.
 * Call only in the browser (needs `window.location`).
 * Returns null when production is misconfigured (e.g. still pointing at localhost on Vercel).
 */
export function resolveWsUrl(
  configured = process.env.NEXT_PUBLIC_WS_URL,
  hostname?: string,
  protocol?: string,
): string | null {
  if (typeof window === "undefined" && hostname === undefined) {
    // Avoid baking ws://localhost during SSR — resolve on the client instead.
    return null;
  }

  const host =
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "localhost");
  const pageProtocol =
    protocol ??
    (typeof window !== "undefined" ? window.location.protocol : "http:");

  const isLocalHost =
    host === "localhost" || host === "127.0.0.1" || host === "[::1]";

  const fallbackLocal = "ws://localhost:3001";
  const raw =
    sanitizeWsUrlInput(configured ?? "") ||
    (isLocalHost ? fallbackLocal : "");

  if (!raw) return null;

  // Relative / malformed values become paths like /pad/=wss://... — reject them.
  if (!isAbsoluteWsUrl(raw)) {
    return null;
  }

  const isLoopbackTarget =
    /^wss?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(raw);

  let url = raw;
  if (
    pageProtocol === "https:" &&
    url.startsWith("ws://") &&
    !isLoopbackTarget
  ) {
    url = `wss://${url.slice("ws://".length)}`;
  }

  if (!isLocalHost && isLoopbackTarget) {
    return null;
  }

  return url;
}
