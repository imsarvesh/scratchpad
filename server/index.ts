import { WebSocketServer, type WebSocket } from "ws";
import { createPadStore } from "./redis";
import { createRoomRegistry } from "./rooms";
import {
  parseClientMessage,
  serializeMessage,
  type ServerMessage,
} from "../shared/protocol";

const port = Number(process.env.WS_PORT ?? 3001);
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

const store = createPadStore(redisUrl);
const rooms = createRoomRegistry();
const wss = new WebSocketServer({ port });

function send(socket: WebSocket, msg: ServerMessage) {
  if (socket.readyState === socket.OPEN) {
    socket.send(serializeMessage(msg));
  }
}

wss.on("connection", (socket) => {
  socket.on("message", async (raw) => {
    const text = typeof raw === "string" ? raw : raw.toString();
    const msg = parseClientMessage(text);
    if (!msg) {
      send(socket, { type: "error", message: "Invalid message" });
      return;
    }

    if (msg.type === "join") {
      rooms.join(msg.roomId, socket);
      const strokes = await store.getStrokes(msg.roomId);
      send(socket, { type: "syncStatus", redis: store.isHealthy() });
      send(socket, { type: "history", strokes });
      return;
    }

    const roomId = rooms.getRoom(socket);
    if (!roomId) {
      send(socket, { type: "error", message: "Join a room first" });
      return;
    }

    if (msg.type === "stroke") {
      if (msg.stroke && roomId) {
        await store.appendStroke(roomId, msg.stroke);
        const out: ServerMessage = { type: "stroke", stroke: msg.stroke };
        const payload = serializeMessage(out);
        rooms.broadcast(roomId, payload, socket);
        await store.publish(roomId, out);
        send(socket, { type: "syncStatus", redis: store.isHealthy() });
      }
      return;
    }

    if (msg.type === "clear") {
      if (msg.roomId !== roomId) {
        send(socket, { type: "error", message: "Room mismatch" });
        return;
      }
      await store.clearStrokes(roomId);
      const out: ServerMessage = { type: "clear" };
      const payload = serializeMessage(out);
      rooms.broadcast(roomId, payload);
      await store.publish(roomId, out);
      send(socket, { type: "syncStatus", redis: store.isHealthy() });
    }
  });

  socket.on("close", () => {
    rooms.leave(socket);
  });
});

console.log(`Scratchpad WS listening on :${port}`);
