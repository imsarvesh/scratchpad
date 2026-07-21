"use client";

import Link from "next/link";
import { use, useState } from "react";

import { CanvasBoard } from "@/components/CanvasBoard";
import { ColorToolbar } from "@/components/ColorToolbar";
import { usePadSocket } from "@/hooks/usePadSocket";
import {
  INK_COLORS,
  isValidRoomId,
  type InkColor,
} from "@shared/protocol";

type PadPageProps = {
  params: Promise<{ id: string }>;
};

function Pad({ id }: { id: string }) {
  const [color, setColor] = useState<InkColor>(INK_COLORS[0]);
  const { strokes, sendStroke, clear, redisOk, status } = usePadSocket(id);

  function copyLink() {
    void navigator.clipboard.writeText(window.location.href);
  }

  return (
    <main className="paper-grain relative h-dvh w-full overflow-hidden bg-[var(--paper)]">
      <CanvasBoard
        color={color}
        strokes={strokes}
        onStrokeComplete={sendStroke}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] sm:px-7 sm:py-6">
        <Link
          href="/"
          className="pointer-events-auto font-[family-name:var(--font-display)] text-base normal-case tracking-normal text-[var(--ink)] transition-colors hover:text-[var(--accent)]"
        >
          Scratchpad
        </Link>
        <span>Room {id}</span>
      </header>

      <ColorToolbar
        color={color}
        onColorChange={setColor}
        onClear={clear}
        onCopyLink={copyLink}
        redisOk={redisOk}
        status={status}
      />
    </main>
  );
}

export default function PadPage({ params }: PadPageProps) {
  const { id } = use(params);

  if (!isValidRoomId(id)) {
    return (
      <main className="paper-grain grid min-h-dvh place-items-center bg-[var(--paper)] px-6">
        <div className="text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Room unavailable
          </p>
          <h1 className="m-0 font-[family-name:var(--font-display)] text-5xl font-medium tracking-[-0.04em]">
            Invalid room
          </h1>
          <Link
            href="/"
            className="mt-7 inline-block border-b border-[var(--ink)] pb-1 font-semibold transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Return home
          </Link>
        </div>
      </main>
    );
  }

  return <Pad id={id} />;
}
