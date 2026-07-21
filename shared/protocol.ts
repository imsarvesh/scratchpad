export const INK_COLORS = [
  "#1a1a1a",
  "#c45c26",
  "#2f6f6a",
  "#2c4a7c",
  "#a33b5a",
] as const;

export type InkColor = (typeof INK_COLORS)[number];

export const MAX_POINTS_PER_STROKE = 2000;
export const MAX_STROKES_PER_ROOM = 5000;
export const ROOM_TTL_SECONDS = 86400;

export type Point = { x: number; y: number };

export type Stroke = {
  id: string;
  color: InkColor;
  points: Point[];
  createdAt: number;
};

export type ClientMessage =
  | { type: "join"; roomId: string }
  | { type: "stroke"; stroke: Stroke }
  | { type: "clear"; roomId: string };

export type ServerMessage =
  | { type: "history"; strokes: Stroke[] }
  | { type: "stroke"; stroke: Stroke }
  | { type: "clear" }
  | { type: "error"; message: string }
  | { type: "syncStatus"; redis: boolean };

export function isInkColor(c: string): c is InkColor {
  return (INK_COLORS as readonly string[]).includes(c);
}

/** Simple numeric room names: 101, 102, … (3–6 digits). */
export function isValidRoomId(id: string): boolean {
  return /^\d{3,6}$/.test(id);
}

/** Fallback when Redis allocator is unavailable: random 101–999. */
export function createFallbackRoomId(): string {
  return String(101 + Math.floor(Math.random() * 899));
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function normalizeStroke(raw: unknown): Stroke | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id.length === 0 || o.id.length > 64) return null;
  if (typeof o.color !== "string" || !isInkColor(o.color)) return null;
  if (typeof o.createdAt !== "number" || !Number.isFinite(o.createdAt)) return null;
  if (!Array.isArray(o.points) || o.points.length === 0) return null;

  const points: Point[] = [];
  for (const p of o.points.slice(0, MAX_POINTS_PER_STROKE)) {
    if (!p || typeof p !== "object") return null;
    const pt = p as Record<string, unknown>;
    if (typeof pt.x !== "number" || typeof pt.y !== "number") return null;
    points.push({ x: clamp01(pt.x), y: clamp01(pt.y) });
  }
  if (points.length === 0) return null;

  return {
    id: o.id,
    color: o.color,
    points,
    createdAt: o.createdAt,
  };
}

export function parseClientMessage(data: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const msg = parsed as Record<string, unknown>;
  if (msg.type === "join" && typeof msg.roomId === "string" && isValidRoomId(msg.roomId)) {
    return { type: "join", roomId: msg.roomId };
  }
  if (msg.type === "clear" && typeof msg.roomId === "string" && isValidRoomId(msg.roomId)) {
    return { type: "clear", roomId: msg.roomId };
  }
  if (msg.type === "stroke") {
    const stroke = normalizeStroke(msg.stroke);
    if (!stroke) return null;
    return { type: "stroke", stroke };
  }
  return null;
}

export function serializeMessage(msg: ServerMessage | ClientMessage): string {
  return JSON.stringify(msg);
}
