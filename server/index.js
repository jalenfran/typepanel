import http from "http";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

/**
 * Very small in-memory room store.
 * No persistence: if the server restarts, everything is gone.
 */
const rooms = new Map();

function applyPatch(base, patch) {
  const start = Math.max(0, Math.min(base.length, patch.start ?? 0));
  const end = Math.max(start, Math.min(base.length, patch.end ?? start));
  const insert = typeof patch.insert === "string" ? patch.insert : "";
  const before = base.slice(0, start);
  const after = base.slice(end);
  return before + insert + after;
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "/", "http://localhost");
  const roomId = url.searchParams.get("roomId") || "default";

  if (!rooms.has(roomId)) {
    rooms.set(roomId, { text: "", clients: new Set() });
  }
  const room = rooms.get(roomId);
  room.clients.add(ws);

  console.log(
    `[ws] client connected room=${roomId} count=${room.clients.size}`
  );

  // Send current snapshot so new clients see existing text.
  ws.send(
    JSON.stringify({
      type: "snapshot",
      roomId,
      text: room.text,
    })
  );

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      console.warn("[ws] invalid JSON message", e);
      return;
    }

    if (msg.type === "patch" && msg.patch) {
      const patch = msg.patch;
      const nextText = applyPatch(room.text, patch);
      room.text = nextText;

      console.log(
        `[ws] patch room=${roomId} start=${patch.start} end=${patch.end} len=${patch.insert?.length ?? 0}`
      );

      const payload = JSON.stringify({
        type: "patch",
        roomId,
        patch,
      });

      for (const client of room.clients) {
        if (client === ws || client.readyState !== 1) continue;
        client.send(payload);
      }
    }
  });

  ws.on("close", () => {
    room.clients.delete(ws);
    console.log(
      `[ws] client disconnected room=${roomId} count=${room.clients.size}`
    );
    if (room.clients.size === 0) {
      rooms.delete(roomId);
      console.log(`[ws] room empty, deleting room=${roomId}`);
    }
  });

  ws.on("error", (err) => {
    console.error("[ws] socket error", err);
  });
});

server.listen(PORT, () => {
  console.log(`[ws] server listening on port ${PORT}`);
});

