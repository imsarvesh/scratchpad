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
  const raw = (configured ?? "").trim() || (isLocalHost ? fallbackLocal : "");

  if (!raw) return null;

  const isLoopbackTarget =
    /^(wss?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(raw);

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
