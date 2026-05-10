import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const QUESTIONS_PATH = path.join(__dirname, "questions.json");

const PORT = Number(process.env.PORT) || 3333;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function randomCode() {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

let questions = [];
try {
  const raw = await fs.readFile(QUESTIONS_PATH, "utf8");
  questions = JSON.parse(raw);
} catch (e) {
  console.error("Failed to load questions.json", e);
  process.exit(1);
}

/** @type {Map<string, import('ws').WebSocket>} */
const sockets = new Map();

/** @type {Map<string, Room>} */
const roomsByCode = new Map();

/**
 * @typedef {{ id: string, name: string, role: 'host'|'player' }} Member
 * @typedef {{
 *   code: string,
 *   hostId: string,
 *   members: Map<string, Member>,
 *   socketToMemberId: WeakMap<import('ws').WebSocket, string>,
 *   phase: 'lobby'|'question'|'revealed'|'ended',
 *   questionIndex: number,
 *   answers: Map<string, { choiceIndex: number, at: number }>,
 *   scores: Map<string, number>,
 * }} Room
 */

function createRoom(hostId) {
  let code = randomCode();
  while (roomsByCode.has(code)) code = randomCode();
  /** @type {Room} */
  const room = {
    code,
    hostId,
    members: new Map(),
    socketToMemberId: new WeakMap(),
    phase: "lobby",
    questionIndex: 0,
    answers: new Map(),
    scores: new Map(),
  };
  roomsByCode.set(code, room);
  return room;
}

function destroyRoom(room) {
  roomsByCode.delete(room.code);
}

function registerSocket(memberId, ws) {
  for (const [id, s] of [...sockets.entries()]) {
    if (s === ws) sockets.delete(id);
  }
  sockets.set(memberId, ws);
}

function getRoomForSocket(ws) {
  for (const room of roomsByCode.values()) {
    const mid = room.socketToMemberId.get(ws);
    if (mid) return { room, memberId: mid };
  }
  return null;
}

function leaveRoom(ws, room, leavingId) {
  const isHost = room.hostId === leavingId;
  room.socketToMemberId.delete(ws);
  room.members.delete(leavingId);
  detachSocket(leavingId);

  if (isHost) {
    for (const pid of [...room.members.keys()]) {
      const sock = sockets.get(pid);
      if (sock) {
        try {
          sock.send(JSON.stringify({ type: "error", message: "Host left. Room closed." }));
        } catch {
          /* ignore */
        }
        room.socketToMemberId.delete(sock);
      }
      detachSocket(pid);
    }
    room.members.clear();
    destroyRoom(room);
  } else if (roomsByCode.get(room.code)) {
    broadcastRoom(room);
  }
}

function currentQuestion(room) {
  return questions[room.questionIndex] ?? null;
}

function buildView(room, memberId) {
  const member = room.members.get(memberId);
  const isHost = member?.role === "host";
  const q = currentQuestion(room);
  const players = [...room.members.values()].filter((m) => m.role === "player");

  const scores = Object.fromEntries(
    [...room.members.values()]
      .filter((m) => m.role === "player")
      .map((m) => [m.id, room.scores.get(m.id) ?? 0])
  );

  const answers = {};
  for (const [pid, ans] of room.answers) {
    answers[pid] = { choiceIndex: ans.choiceIndex, at: ans.at };
  }

  let questionPayload = null;
  if (q && (room.phase === "question" || room.phase === "revealed")) {
    questionPayload = {
      index: room.questionIndex,
      total: questions.length,
      text: q.text,
      choices: q.choices,
    };
    if (room.phase === "revealed" || isHost) {
      questionPayload.correctIndex = q.correctIndex;
    }
    if (room.phase === "revealed") {
      questionPayload.answers = answers;
    }
  }

  const myAnswer = room.answers.get(memberId) ?? null;

  return {
    type: "state",
    you: member
      ? { id: member.id, name: member.name, role: member.role }
      : null,
    room: {
      code: room.code,
      phase: room.phase,
      players: players.map((p) => ({ id: p.id, name: p.name })),
      question: questionPayload,
      scores,
      myAnswer,
    },
  };
}

function broadcastRoom(room) {
  for (const m of room.members.values()) {
    const sock = sockets.get(m.id);
    if (!sock || sock.readyState !== 1) continue;
    try {
      sock.send(JSON.stringify(buildView(room, m.id)));
    } catch {
      /* ignore */
    }
  }
}

function detachSocket(memberId) {
  sockets.delete(memberId);
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split("?")[0]);
  const rel = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.join(root, rel);
  if (!full.startsWith(root)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  try {
    let pathname = req.url?.split("?")[0] || "/";
    if (pathname === "/") pathname = "/index.html";
    const filePath = safeJoin(ROOT, pathname);
    if (!filePath) {
      res.writeHead(403).end();
      return;
    }
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    const body = await fs.readFile(filePath);
    res.writeHead(200).end(body);
  } catch {
    res.writeHead(500).end("Server error");
  }
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  let memberId = randomId();

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid message." }));
      return;
    }

    const existing = getRoomForSocket(ws);

    if (msg.type === "host_create") {
      if (existing) leaveRoom(ws, existing.room, existing.memberId);
      const name = String(msg.displayName || "Host").slice(0, 24) || "Host";
      const room = createRoom(memberId);
      room.members.set(memberId, { id: memberId, name, role: "host" });
      room.socketToMemberId.set(ws, memberId);
      registerSocket(memberId, ws);
      ws.send(JSON.stringify({ type: "created", code: room.code, memberId }));
      broadcastRoom(room);
      return;
    }

    if (msg.type === "player_join") {
      if (existing) leaveRoom(ws, existing.room, existing.memberId);
      const code = String(msg.code || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      const name = String(msg.displayName || "Player").slice(0, 24).trim() || "Player";
      const room = roomsByCode.get(code);
      if (!room) {
        ws.send(JSON.stringify({ type: "error", message: "No game found with that code." }));
        return;
      }
      if (room.phase !== "lobby") {
        ws.send(JSON.stringify({ type: "error", message: "That game already started." }));
        return;
      }
      memberId = randomId();
      room.members.set(memberId, { id: memberId, name, role: "player" });
      room.scores.set(memberId, room.scores.get(memberId) ?? 0);
      room.socketToMemberId.set(ws, memberId);
      registerSocket(memberId, ws);
      ws.send(JSON.stringify({ type: "joined", code: room.code, memberId }));
      broadcastRoom(room);
      return;
    }

    if (!existing) {
      ws.send(JSON.stringify({ type: "error", message: "Join or create a room first." }));
      return;
    }

    const { room, memberId: clientId } = existing;

    if (msg.type === "host_start_game") {
      if (room.hostId !== clientId) return;
      if (questions.length === 0) {
        ws.send(JSON.stringify({ type: "error", message: "No questions loaded." }));
        return;
      }
      room.phase = "question";
      room.questionIndex = 0;
      room.answers = new Map();
      broadcastRoom(room);
      return;
    }

    if (msg.type === "host_reveal") {
      if (room.hostId !== clientId) return;
      if (room.phase !== "question") return;
      const q = currentQuestion(room);
      if (!q) return;
      for (const [pid, ans] of room.answers) {
        const cur = room.scores.get(pid) ?? 0;
        if (ans.choiceIndex === q.correctIndex) {
          room.scores.set(pid, cur + 100);
        }
      }
      room.phase = "revealed";
      broadcastRoom(room);
      return;
    }

    if (msg.type === "host_next") {
      if (room.hostId !== clientId) return;
      if (room.phase !== "revealed") return;
      if (room.questionIndex + 1 < questions.length) {
        room.questionIndex += 1;
        room.phase = "question";
        room.answers = new Map();
      } else {
        room.phase = "ended";
      }
      broadcastRoom(room);
      return;
    }

    if (msg.type === "player_answer") {
      if (room.phase !== "question") return;
      const m = room.members.get(clientId);
      if (!m || m.role !== "player") return;
      if (room.answers.has(clientId)) return;
      const choiceIndex = Number(msg.choiceIndex);
      const q = currentQuestion(room);
      if (!q || choiceIndex < 0 || choiceIndex >= q.choices.length) return;
      room.answers.set(clientId, { choiceIndex, at: Date.now() });
      broadcastRoom(room);
      return;
    }
  });

  ws.on("close", () => {
    const hit = getRoomForSocket(ws);
    if (hit) leaveRoom(ws, hit.room, hit.memberId);
  });
});

server.listen(PORT, () => {
  console.log(`Pikelet running at http://localhost:${PORT}`);
});
