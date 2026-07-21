"use client";

import { customAlphabet } from "nanoid";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { isValidRoomId } from "@shared/protocol";

const generateRoomId = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-",
  10,
);

export function createRoomId(): string {
  return generateRoomId();
}

export function HomeCreate() {
  const router = useRouter();
  const [joinId, setJoinId] = useState("");
  const canJoin = isValidRoomId(joinId);

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
        onClick={() => router.push(`/pad/${createRoomId()}`)}
        className="new-pad-button"
      >
        New pad
        <span aria-hidden="true">↗</span>
      </button>

      <div className="action-divider" aria-hidden="true">
        <span />
        <span>or return to a room</span>
        <span />
      </div>

      <form className="join-form" onSubmit={joinRoom}>
        <label htmlFor="room-id">Room ID</label>
        <div className="join-row">
          <input
            id="room-id"
            value={joinId}
            onChange={(event) => setJoinId(event.target.value.trim())}
            placeholder="Ab_12-XyZ9"
            maxLength={10}
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
