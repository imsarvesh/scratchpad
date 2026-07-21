/**
 * Resolve the WebSocket URL for the pad client.
 * Returns null when production is misconfigured (e.g. still pointing at localhost on Vercel).
 */
export function resolveWsUrl(
  configured = process.env.NEXT_PUBLIC_WS_URL,
  hostname =
    typeof window !== "undefined" ? window.location.hostname : "localhost",
): string | null {
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";

  const fallbackLocal = "ws://localhost:3001";
  const raw = (configured ?? "").trim() || (isLocalHost ? fallbackLocal : "");

  if (!raw) return null;

  const isLoopbackTarget =
    /^(wss?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(raw);

  // HTTPS pages cannot use ws:// (mixed content); upgrade when possible.
  let url = raw;
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
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
