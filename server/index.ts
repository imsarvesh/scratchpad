import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { createPadStore } from "./redis";
import { createRoomRegistry } from "./rooms";
import {
  parseClientMessage,
  serializeMessage,
  type ServerMessage,
} from "../shared/protocol";

/** Load .env / .env.local for the WS process (Next does this automatically; tsx does not). */
function loadEnvFiles() {
  const apply = (name: string, overwrite: boolean) => {
    const path = resolve(process.cwd(), name);
    if (!existsSync(path)) return;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (overwrite || process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  };
  apply(".env", false);
  apply(".env.local", true);
}

loadEnvFiles();

const port = Number(process.env.WS_PORT ?? 3001);
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

const store = createPadStore(redisUrl);
const rooms = createRoomRegistry();
const wss = new WebSocketServer({ port });

store.getStrokes("__healthcheck__").then(() => {
  console.log(
    `Scratchpad Redis ${store.isHealthy() ? "ok" : "unavailable"} (${redisUrl.replace(/:[^:@/]+@/, ":****@")})`,
  );
});

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
