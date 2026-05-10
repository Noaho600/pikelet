import { getWsUrl } from "./ws.js";

const els = {
  conn: document.getElementById("connStatus"),
  code: document.getElementById("gameCode"),
  copyBtn: document.getElementById("copyCode"),
  copyStatus: document.getElementById("copyStatus"),
  players: document.getElementById("playerList"),
  startBtn: document.getElementById("startGame"),
  lobby: document.getElementById("lobby"),
  game: document.getElementById("gameHost"),
  ended: document.getElementById("endedHost"),
  qText: document.getElementById("hostQuestionText"),
  qMeta: document.getElementById("hostQuestionMeta"),
  progress: document.getElementById("hostAnswerProgress"),
  hostChoices: document.getElementById("hostChoices"),
  revealBtn: document.getElementById("revealBtn"),
  nextBtn: document.getElementById("nextBtn"),
  finalScores: document.getElementById("finalScoresHost"),
  backHome: document.getElementById("backHomeLobby"),
};

let ws;
let lastState = null;

function setConn(text, ok) {
  els.conn.textContent = text;
  els.conn.dataset.ok = ok ? "1" : "0";
}

function renderPlayers(players) {
  if (!players.length) {
    els.players.innerHTML = "<li class=\"muted\">No one has joined yet.</li>";
    return;
  }
  els.players.innerHTML = players.map((p) => `<li>${escapeHtml(p.name)}</li>`).join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyState(msg) {
  lastState = msg;
  const { room } = msg;
  if (!room) return;

  els.code.textContent = room.code;
  renderPlayers(room.players || []);

  const inLobby = room.phase === "lobby";
  const inGame = room.phase === "question" || room.phase === "revealed";
  const done = room.phase === "ended";

  els.lobby.hidden = inGame || done;
  els.game.hidden = !inGame;
  els.ended.hidden = !done;
  if (els.backHome) els.backHome.hidden = inGame || done;

  els.startBtn.disabled = !inLobby || !ws || ws.readyState !== WebSocket.OPEN;

  if (inGame && room.question) {
    const q = room.question;
    els.qText.textContent = q.text;
    els.qMeta.textContent = `Question ${q.index + 1} of ${q.total}`;
    const answered = q.answers ? Object.keys(q.answers).length : 0;
    const total = room.players.length;
    els.progress.textContent =
      room.phase === "question"
        ? `${answered} of ${total} answered`
        : "Scores updated for this round.";

    els.revealBtn.hidden = room.phase !== "question";
    els.nextBtn.hidden = room.phase !== "revealed";
    els.revealBtn.disabled = false;
    els.nextBtn.disabled = false;

    const correct = q.correctIndex;
    els.hostChoices.innerHTML = q.choices
      .map((label, i) => {
        const isCorrect = correct === i;
        const cls =
          room.phase === "revealed" && isCorrect
            ? "correct"
            : room.phase === "question" && isCorrect
              ? "answer-key"
              : "";
        return `<li class="${cls}">${escapeHtml(label)}</li>`;
      })
      .join("");
  }

  if (done) {
    const rows = Object.entries(room.scores || {})
      .map(([id, score]) => {
        const pl = room.players.find((p) => p.id === id);
        return { name: pl?.name || "Player", score };
      })
      .sort((a, b) => b.score - a.score);
    els.finalScores.innerHTML = rows.length
      ? rows.map((r) => `<div class="score-row"><span>${escapeHtml(r.name)}</span><strong>${r.score}</strong></div>`).join("")
      : "<p class=\"muted\">No scores yet.</p>";
  }
}

function connect() {
  ws = new WebSocket(getWsUrl());

  ws.addEventListener("open", () => {
    setConn("Connected", true);
    ws.send(JSON.stringify({ type: "host_create", displayName: "Host" }));
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === "error") {
      setConn(msg.message || "Error", false);
      return;
    }
    if (msg.type === "created") {
      setConn("Room ready — share the code", true);
    }
    if (msg.type === "state") {
      setConn("Connected", true);
      applyState(msg);
    }
  });

  ws.addEventListener("close", () => {
    setConn("Disconnected — refresh to reconnect", false);
    els.startBtn.disabled = true;
    els.revealBtn.disabled = true;
    els.nextBtn.disabled = true;
  });

  ws.addEventListener("error", () => {
    setConn("Could not connect. Is the server running?", false);
  });
}

els.copyBtn.addEventListener("click", async () => {
  const text = els.code.textContent.trim();
  try {
    await navigator.clipboard.writeText(text);
    els.copyStatus.hidden = false;
    els.copyStatus.textContent = "Copied game code.";
    window.setTimeout(() => {
      els.copyStatus.hidden = true;
    }, 2000);
  } catch {
    els.copyStatus.hidden = false;
    els.copyStatus.textContent = "Copy manually if needed.";
  }
});

els.startBtn.addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "host_start_game" }));
  }
});

els.revealBtn.addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "host_reveal" }));
  }
});

els.nextBtn.addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "host_next" }));
  }
});

connect();
