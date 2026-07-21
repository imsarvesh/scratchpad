import type { WebSocket } from "ws";

export type RoomRegistry = {
  join(roomId: string, socket: WebSocket): void;
  leave(socket: WebSocket): void;
  broadcast(roomId: string, data: string, except?: WebSocket): void;
  getRoom(socket: WebSocket): string | undefined;
};

export function createRoomRegistry(): RoomRegistry {
  const roomToSockets = new Map<string, Set<WebSocket>>();
  const socketToRoom = new Map<WebSocket, string>();

  return {
    join(roomId, socket) {
      const prev = socketToRoom.get(socket);
      if (prev) {
        roomToSockets.get(prev)?.delete(socket);
      }
      socketToRoom.set(socket, roomId);
      let set = roomToSockets.get(roomId);
      if (!set) {
        set = new Set();
        roomToSockets.set(roomId, set);
      }
      set.add(socket);
    },
    leave(socket) {
      const roomId = socketToRoom.get(socket);
      socketToRoom.delete(socket);
      if (!roomId) return;
      const set = roomToSockets.get(roomId);
      set?.delete(socket);
      if (set && set.size === 0) roomToSockets.delete(roomId);
    },
    broadcast(roomId, data, except) {
      const set = roomToSockets.get(roomId);
      if (!set) return;
      for (const s of set) {
        if (s === except) continue;
        if (s.readyState === s.OPEN) s.send(data);
      }
    },
    getRoom(socket) {
      return socketToRoom.get(socket);
    },
  };
}
