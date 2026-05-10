import { getWsUrl } from "./ws.js";

const form = document.getElementById("joinForm");
const nameInput = document.getElementById("name");
const codeInput = document.getElementById("code");
const joinPanel = document.getElementById("joinPanel");
const lobbyPanel = document.getElementById("lobbyPlayer");
const gamePanel = document.getElementById("gamePlayer");
const endedPanel = document.getElementById("endedPlayer");
const conn = document.getElementById("connStatus");
const roomLabel = document.getElementById("roomLabel");
const waitMsg = document.getElementById("waitMsg");
const qText = document.getElementById("playerQuestionText");
const qMeta = document.getElementById("playerQuestionMeta");
const choices = document.getElementById("choiceButtons");
const resultMsg = document.getElementById("resultMsg");
const finalScores = document.getElementById("finalScoresPlayer");

const params = new URLSearchParams(location.search);
const presetCode = params.get("code");
if (presetCode) {
  codeInput.value = presetCode.toUpperCase().slice(0, 6);
}

let ws;

function setConn(text, ok) {
  conn.textContent = text;
  conn.dataset.ok = ok ? "1" : "0";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showPhase(phase) {
  joinPanel.hidden = phase !== "join";
  lobbyPanel.hidden = phase !== "lobby";
  gamePanel.hidden = phase !== "game";
  endedPanel.hidden = phase !== "ended";
}

function applyState(msg) {
  const { room, you } = msg;
  if (!room || !you) return;

  roomLabel.textContent = room.code;

  if (room.phase === "lobby") {
    showPhase("lobby");
    waitMsg.textContent = "Hang tight — the host will start the quiz.";
    return;
  }

  if (room.phase === "ended") {
    showPhase("ended");
    const rows = Object.entries(room.scores || {})
      .map(([id, score]) => {
        const pl = room.players.find((p) => p.id === id);
        return { name: pl?.name || "Player", score, self: id === you.id };
      })
      .sort((a, b) => b.score - a.score);
    finalScores.innerHTML = rows.length
      ? rows
          .map(
            (r) =>
              `<div class="score-row${r.self ? " self" : ""}"><span>${escapeHtml(r.name)}${
                r.self ? " (you)" : ""
              }</span><strong>${r.score}</strong></div>`
          )
          .join("")
      : "<p class=\"muted\">No scores.</p>";
    return;
  }

  showPhase("game");
  const q = room.question;
  if (!q) return;

  qText.textContent = q.text;
  qMeta.textContent = `Question ${q.index + 1} of ${q.total}`;

  const locked = room.phase !== "question" || room.myAnswer != null;
  choices.innerHTML = q.choices
    .map(
      (label, i) =>
        `<button type="button" class="choice-btn" data-i="${i}" ${locked ? "disabled" : ""}>${escapeHtml(
          label
        )}</button>`
    )
    .join("");

  choices.querySelectorAll(".choice-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.i);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "player_answer", choiceIndex: i }));
      }
    });
  });

  if (room.phase === "question") {
    resultMsg.hidden = true;
    if (room.myAnswer != null) {
      resultMsg.hidden = false;
      resultMsg.textContent = "Answer locked in. Waiting for reveal…";
      resultMsg.className = "status";
    }
  } else if (room.phase === "revealed") {
    resultMsg.hidden = false;
    const correct = q.correctIndex;
    const mine = room.myAnswer?.choiceIndex;
    if (mine === undefined || mine === null) {
      resultMsg.textContent = "You did not answer in time.";
      resultMsg.className = "status warn";
    } else if (mine === correct) {
      resultMsg.textContent = "Nice — correct (+100).";
      resultMsg.className = "status ok";
    } else {
      resultMsg.textContent = `Not quite — the answer was: ${q.choices[correct]}`;
      resultMsg.className = "status bad";
    }
    choices.querySelectorAll(".choice-btn").forEach((btn, i) => {
      btn.disabled = true;
      if (i === correct) btn.classList.add("correct");
      if (mine != null && i === mine && mine !== correct) btn.classList.add("wrong");
    });
  }
}

function connectAndJoin(name, code) {
  ws = new WebSocket(getWsUrl());
  let closedAfterError = false;

  ws.addEventListener("open", () => {
    setConn("Connected", true);
    ws.send(JSON.stringify({ type: "player_join", code, displayName: name }));
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === "error") {
      closedAfterError = true;
      setConn(msg.message || "Could not join", false);
      showPhase("join");
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      return;
    }
    if (msg.type === "joined") {
      setConn("In lobby", true);
      showPhase("lobby");
    }
    if (msg.type === "state") {
      const phase = msg.room?.phase;
      const label =
        phase === "lobby" ? "In lobby" : phase === "ended" ? "Game over" : "Playing";
      setConn(label, true);
      applyState(msg);
    }
  });

  ws.addEventListener("close", () => {
    if (!closedAfterError) {
      setConn("Disconnected", false);
    }
  });

  ws.addEventListener("error", () => {
    setConn("Could not connect. Is the server running?", false);
  });
}

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameInput.value.trim().slice(0, 24) || "Player";
  const code = codeInput.value.trim();
  if (code.length !== 6) {
    setConn("Game codes are 6 characters.", false);
    return;
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  connectAndJoin(name, code);
});

showPhase("join");
