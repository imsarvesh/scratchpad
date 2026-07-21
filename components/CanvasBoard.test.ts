import { describe, expect, it, vi } from "vitest";

import { INK_COLORS, type Stroke } from "../shared/protocol";
import { drawStroke, normalizePoint, paintStrokes } from "./CanvasBoard";

function canvasContext() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    lineJoin: "miter",
  } as unknown as CanvasRenderingContext2D;
}

function stroke(id: string, points: Stroke["points"]): Stroke {
  return {
    id,
    color: INK_COLORS[0],
    points,
    createdAt: 1,
  };
}

describe("CanvasBoard drawing helpers", () => {
  it("repaints the active stroke after committed strokes", () => {
    const ctx = canvasContext();

    paintStrokes(
      ctx,
      [stroke("committed", [{ x: 0.1, y: 0.2 }])],
      stroke("active", [
        { x: 0.3, y: 0.4 },
        { x: 0.5, y: 0.6 },
      ]),
      100,
      100,
    );

    expect(vi.mocked(ctx.moveTo).mock.calls).toEqual([[30, 40]]);
    expect(vi.mocked(ctx.lineTo).mock.calls).toEqual([[50, 60]]);
    expect(ctx.arc).toHaveBeenCalledWith(10, 20, 1.25, 0, Math.PI * 2);
  });

  it("renders a one-point stroke as a visible dot", () => {
    const ctx = canvasContext();

    drawStroke(ctx, stroke("tap", [{ x: 0.25, y: 0.75 }]), 200, 100);

    expect(ctx.arc).toHaveBeenCalledWith(50, 75, 1.25, 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalledOnce();
  });

  it("clamps normalized pointer coordinates to the canvas", () => {
    const rect = { left: 10, top: 20, width: 100, height: 50 };

    expect(normalizePoint(-5, 100, rect)).toEqual({ x: 0, y: 1 });
    expect(normalizePoint(60, 45, rect)).toEqual({ x: 0.5, y: 0.5 });
  });
});
