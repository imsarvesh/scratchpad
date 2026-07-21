"use client";

import { useEffect, useRef } from "react";
import type { InkColor, Point, Stroke } from "../shared/protocol";

type Props = {
  color: InkColor;
  strokes: Stroke[];
  onStrokeComplete: (stroke: Stroke) => void;
};

type DrawableStroke = Pick<Stroke, "color" | "points">;

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: DrawableStroke,
  w: number,
  h: number,
) {
  if (stroke.points.length === 0) return;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (stroke.points.length === 1) {
    const point = stroke.points[0]!;
    ctx.beginPath();
    ctx.arc(point.x * w, point.y * h, 1.25, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  stroke.points.forEach((p, i) => {
    const x = p.x * w;
    const y = p.y * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

export function paintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: DrawableStroke[],
  activeStroke: DrawableStroke | null,
  w: number,
  h: number,
) {
  for (const stroke of strokes) drawStroke(ctx, stroke, w, h);
  if (activeStroke) drawStroke(ctx, activeStroke, w, h);
}

export function normalizePoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): Point {
  const clamp = (value: number) =>
    Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

  return {
    x: clamp((clientX - rect.left) / rect.width),
    y: clamp((clientY - rect.top) / rect.height),
  };
}

export function CanvasBoard({ color, strokes, onStrokeComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Point[] | null>(null);
  const drawingColor = useRef<InkColor | null>(null);
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
      const activePoints = drawing.current;
      const activeColor = drawingColor.current;
      paintStrokes(
        ctx,
        strokes,
        activePoints && activeColor
          ? { color: activeColor, points: activePoints }
          : null,
        rect.width,
        rect.height,
      );
    };

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [strokes]);

  function toNorm(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return normalizePoint(e.clientX, e.clientY, rect);
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 touch-none cursor-crosshair"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = [toNorm(e)];
        drawingColor.current = colorRef.current;
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
        ctx.strokeStyle = drawingColor.current ?? colorRef.current;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(a.x * rect.width, a.y * rect.height);
        ctx.lineTo(b.x * rect.width, b.y * rect.height);
        ctx.stroke();
      }}
      onPointerUp={() => {
        const points = drawing.current;
        const strokeColor = drawingColor.current;
        drawing.current = null;
        drawingColor.current = null;
        if (!points || points.length === 0) return;
        onStrokeComplete({
          id: crypto.randomUUID(),
          color: strokeColor ?? colorRef.current,
          points,
          createdAt: Date.now(),
        });
      }}
      onPointerCancel={() => {
        drawing.current = null;
        drawingColor.current = null;
      }}
    />
  );
}
