"use client";

import { INK_COLORS, type InkColor } from "@shared/protocol";
import type { PadSocketStatus } from "@/hooks/usePadSocket";

type ColorToolbarProps = {
  color: InkColor;
  onColorChange: (color: InkColor) => void;
  onClear: () => void;
  onCopyLink: () => void;
  redisOk: boolean;
  status: PadSocketStatus;
};

const STATUS_LABELS: Record<PadSocketStatus, string> = {
  connecting: "Connecting",
  open: "Live",
  closed: "Reconnecting",
  unavailable: "No server",
};

export function ColorToolbar({
  color,
  onColorChange,
  onClear,
  onCopyLink,
  redisOk,
  status,
}: ColorToolbarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-4 sm:bottom-7">
      <div
        className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--ink)_18%,transparent)] bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] px-3 py-2 shadow-[0_10px_30px_rgba(26,26,26,0.13)] backdrop-blur-md sm:gap-3 sm:px-4"
        role="toolbar"
        aria-label="Drawing tools"
      >
        <div className="flex items-center gap-1.5" aria-label="Ink color">
          {INK_COLORS.map((inkColor) => (
            <button
              key={inkColor}
              type="button"
              className="size-7 rounded-full border-2 border-[var(--paper)] outline-offset-2 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:size-8"
              style={{
                backgroundColor: inkColor,
                boxShadow:
                  color === inkColor
                    ? `0 0 0 2px var(--paper), 0 0 0 4px ${inkColor}`
                    : undefined,
              }}
              aria-label={`Use ${inkColor} ink`}
              aria-pressed={color === inkColor}
              onClick={() => onColorChange(inkColor)}
            />
          ))}
        </div>

        <span
          className="h-6 w-px bg-[color-mix(in_srgb,var(--ink)_18%,transparent)]"
          aria-hidden="true"
        />

        <button
          type="button"
          className="rounded-full px-2 py-1 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          onClick={onClear}
        >
          Clear
        </button>
        <button
          type="button"
          className="whitespace-nowrap rounded-full bg-[var(--ink)] px-3 py-1.5 text-sm font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          onClick={onCopyLink}
        >
          Copy link
        </button>

        <div
          className="hidden min-w-14 items-center gap-1.5 border-l border-[color-mix(in_srgb,var(--ink)_18%,transparent)] pl-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] sm:flex"
          aria-live="polite"
        >
          <span
            className={`size-1.5 rounded-full ${
              status === "open" ? "bg-[var(--accent)]" : "bg-[#c45c26]"
            }`}
            aria-hidden="true"
          />
          <span>{!redisOk ? "Sync offline" : STATUS_LABELS[status]}</span>
        </div>
      </div>
    </div>
  );
}
