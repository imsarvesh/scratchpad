"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  serializeMessage,
  type ServerMessage,
  type Stroke,
} from "../shared/protocol";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

export function usePadSocket(roomId: string) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [redisOk, setRedisOk] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);

  const sendStroke = useCallback((stroke: Stroke) => {
    setStrokes((prev) => (prev.some((s) => s.id === stroke.id) ? prev : [...prev, stroke]));
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(serializeMessage({ type: "stroke", stroke }));
    }
  }, []);

  const clear = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(serializeMessage({ type: "clear", roomId }));
    }
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      if (cancelled) return;
      setStatus("connecting");
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1000;
        setStatus("open");
        ws.send(serializeMessage({ type: "join", roomId }));
      };

      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === "history") setStrokes(msg.strokes);
        if (msg.type === "stroke") {
          setStrokes((prev) =>
            prev.some((s) => s.id === msg.stroke.id) ? prev : [...prev, msg.stroke],
          );
        }
        if (msg.type === "clear") setStrokes([]);
        if (msg.type === "syncStatus") setRedisOk(msg.redis);
      };

      ws.onclose = () => {
        setStatus("closed");
        wsRef.current = null;
        const delay = backoffRef.current;
        backoffRef.current = Math.min(10000, delay * 2);
        timer = setTimeout(connect, delay);
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [roomId]);

  return { strokes, status, redisOk, sendStroke, clear };
}
