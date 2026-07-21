"use client";

import { useEffect, useRef } from "react";
import type { InkColor, Point, Stroke } from "../shared/protocol";

type Props = {
  color: InkColor;
  strokes: Stroke[];
  onStrokeComplete: (stroke: Stroke) => void;
};

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
) {
  if (stroke.points.length === 0) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  stroke.points.forEach((p, i) => {
    const x = p.x * w;
    const y = p.y * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

export function CanvasBoard({ color, strokes, onStrokeComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Point[] | null>(null);
  const colorRef = useRef(color);

  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  // Resize + redraw strokes whenever strokes change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const paint = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const s of strokes) drawStroke(ctx, s, rect.width, rect.height);
    };

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [strokes]);

  function toNorm(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 touch-none cursor-crosshair"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = [toNorm(e)];
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const p = toNorm(e);
        drawing.current.push(p);
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const rect = canvas.getBoundingClientRect();
        const pts = drawing.current;
        if (pts.length < 2) return;
        const a = pts[pts.length - 2]!;
        const b = pts[pts.length - 1]!;
        ctx.strokeStyle = colorRef.current;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(a.x * rect.width, a.y * rect.height);
        ctx.lineTo(b.x * rect.width, b.y * rect.height);
        ctx.stroke();
      }}
      onPointerUp={() => {
        const points = drawing.current;
        drawing.current = null;
        if (!points || points.length === 0) return;
        onStrokeComplete({
          id: crypto.randomUUID(),
          color: colorRef.current,
          points,
          createdAt: Date.now(),
        });
      }}
      onPointerCancel={() => {
        drawing.current = null;
      }}
    />
  );
}
