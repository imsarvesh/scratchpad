import { describe, expect, it } from "vitest";

import { isValidRoomId } from "@shared/protocol";
import { createRoomId } from "./HomeCreate";

describe("createRoomId", () => {
  it("creates room ids accepted by the shared protocol", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(isValidRoomId(createRoomId())).toBe(true);
    }
  });
});
