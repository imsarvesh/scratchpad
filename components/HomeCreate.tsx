"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { createFallbackRoomId, isValidRoomId } from "@shared/protocol";

/** Kept for tests — same shape as Redis fallback ids (101–999). */
export function createRoomId(): string {
  return createFallbackRoomId();
}

export function HomeCreate() {
  const router = useRouter();
  const [joinId, setJoinId] = useState("");
  const [creating, setCreating] = useState(false);
  const canJoin = isValidRoomId(joinId);

  async function createPad() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      const data = (await res.json()) as { id?: string };
      const id =
        data.id && isValidRoomId(data.id) ? data.id : createFallbackRoomId();
      router.push(`/pad/${id}`);
    } catch {
      router.push(`/pad/${createFallbackRoomId()}`);
    } finally {
      setCreating(false);
    }
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canJoin) {
      router.push(`/pad/${joinId}`);
    }
  }

  return (
    <div className="home-actions">
      <button
        type="button"
        onClick={() => void createPad()}
        className="new-pad-button"
        disabled={creating}
      >
        {creating ? "Creating…" : "New pad"}
        <span aria-hidden="true">↗</span>
      </button>

      <div className="action-divider" aria-hidden="true">
        <span />
        <span>or return to a room</span>
        <span />
      </div>

      <form className="join-form" onSubmit={joinRoom}>
        <label htmlFor="room-id">Room number</label>
        <div className="join-row">
          <input
            id="room-id"
            value={joinId}
            onChange={(event) =>
              setJoinId(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="101"
            inputMode="numeric"
            maxLength={6}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" disabled={!canJoin}>
            Join
          </button>
        </div>
      </form>
    </div>
  );
}
