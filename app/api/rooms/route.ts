import { NextResponse } from "next/server";

import { allocateNextRoomId, createFallbackRoomId } from "@/lib/rooms";
import { isValidRoomId } from "@shared/protocol";

export async function POST() {
  try {
    const id = await allocateNextRoomId();
    if (!isValidRoomId(id)) {
      return NextResponse.json(
        { error: "Allocated id out of range" },
        { status: 500 },
      );
    }
    return NextResponse.json({ id });
  } catch {
    const id = createFallbackRoomId();
    return NextResponse.json({ id, fallback: true });
  }
}
