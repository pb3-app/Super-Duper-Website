// Tung Tung Sahur Arena - browser side
// The browser sends inputs to the server and draws what the server says is happening.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const menu = document.getElementById("menu");
const hud = document.getElementById("hud");
const statusEl = document.getElementById("status");
const playBtn = document.getElementById("play");
const nameInput = document.getElementById("name");
const scoresEl = document.getElementById("scores");
const feedEl = document.getElementById("feed");

const INTERP_DELAY = 100; // ms behind real time, so movement looks smooth

let socket = null;
let myId = null;
let arena = { w: 1600, h: 1000 };
let radius = 28;
const snapshots = []; // recent server states for smoothing
const effects = [];   // "TUNG!" pop-ups
let serverTimeOffset = 0;

const input = { up: false, down: false, left: false, right: false, aim: 0 };
let mouse = { x: 0, y: 0 };
let camera = { x: 0, y: 0 };

// ---------- Setup ----------
function resize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
}
window.addEventListener("resize", resize);
resize();

try { nameInput.value = localStorage.getItem("tungName") || ""; } catch {}

playBtn.addEventListener("click", start);
nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") start(); });

function start() {
  const name = nameInput.value.trim();
  try { localStorage.setItem("tungName", name); } catch {}
  playBtn.disabled = true;
  statusEl.textContent = "Connecting to server...";

  socket = io(window.GAME_SERVER_URL, { transports: ["websocket"] });

  socket.on("connect", () => socket.emit("join", { name }));
  socket.on("connect_error", () => {
    statusEl.textContent = "Can't reach the game server. Is it running?";
    playBtn.disabled = false;
    socket.close();
  });
  socket.on("full", () => {
    statusEl.textContent = "Server is full, try again soon!";
    playBtn.disabled = false;
  });
  socket.on("welcome", (data) => {
    myId = data.id;
    arena = data.arena;
    radius = data.radius;
    menu.hidden = true;
    menu.style.display = "none";
    hud.hidden = false;
  });
  socket.on("state", (state) => {
    serverTimeOffset = Date.now() - state.t;
    snapshots.push(state);
    while (snapshots.length > 30) snapshots.shift();
  });
  socket.on("event", (ev) => {
    if (ev.type === "bonk") {
      effects.push({ x: ev.x, y: ev.y, life: 0.7, text: "TUNG!" });
      addFeed(`${ev.from} bonked ${ev.to}`);
    } else if (ev.type === "join") addFeed(`${ev.name} joined`);
    else if (ev.type === "leave") addFeed(`${ev.name} left`);
  });
  socket.on("disconnect", () => {
    addFeed("Disconnected from server");
  });

  setInterval(sendInput, 1000 / 30);
}

function addFeed(text) {
  const div = document.createElement("div");
  div.textContent = text;
  feedEl.appendChild(div);
  while (feedEl.children.length > 5) feedEl.firstChild.remove();
  setTimeout(() => div.remove(), 5000);
}

// ---------- Controls ----------
const keyMap = {
  KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
};
window.addEventListener("keydown", (e) => {
  if (document.activeElement === nameInput) return;
  if (keyMap[e.code]) { input[keyMap[e.code]] = true; e.preventDefault(); }
  if (e.code === "Space") { bonk(); e.preventDefault(); }
});
window.addEventListener("keyup", (e) => {
  if (keyMap[e.code]) input[keyMap[e.code]] = false;
});
canvas.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener("mousedown", bonk);

function bonk() {
  if (socket && myId) socket.emit("bonk");
}

function sendInput() {
  if (!socket || !myId) return;
  const me = getRenderedPlayers().find((p) => p.id === myId);
  if (me) {
    const sx = (me.x - camera.x) ;
    const sy = (me.y - camera.y);
    input.aim = Math.atan2(mouse.y - sy, mouse.x - sx);
  }
  socket.emit("input", input);
}

// ---------- Smoothing (interpolation) ----------
function getRenderedPlayers() {
  if (snapshots.length === 0) return [];
  const renderTime = Date.now() - serverTimeOffset - INTERP_DELAY;

  // find the two snapshots around renderTime
  let older = snapshots[0], newer = snapshots[snapshots.length - 1];
  for (let i = snapshots.length - 1; i > 0; i--) {
    if (snapshots[i - 1].t <= renderTime) {
      older = snapshots[i - 1];
      newer = snapshots[i];
      break;
    }
  }
  const span = newer.t - older.t;
  const k = span > 0 ? Math.min(1, Math.max(0, (renderTime - older.t) / span)) : 1;

  const oldById = {};
  for (const p of older.players) oldById[p.id] = p;
  return newer.players.map((p) => {
    const o = oldById[p.id];
    if (!o) return p;
    return { ...p, x: o.x + (p.x - o.x) * k, y: o.y + (p.y - o.y) * k };
  });
}

// ---------- Drawing ----------
let lastFrame = performance.now();
function frame(now) {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  draw(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function draw(dt) {
  const W = window.innerWidth, H = window.innerHeight;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.fillStyle = "#1a0f07";
  ctx.fillRect(0, 0, W, H);

  const players = getRenderedPlayers();
  const me = players.find((p) => p.id === myId);
  if (me) {
    camera.x = me.x - W / 2;
    camera.y = me.y - H / 2;
  } else {
    camera.x = arena.w / 2 - W / 2;
    camera.y = arena.h / 2 - H / 2;
  }

  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  drawArena();
  for (const p of players) drawPlayer(p, p.id === myId);

  for (const fx of effects) {
    fx.life -= dt;
    ctx.globalAlpha = Math.max(0, fx.life / 0.7);
    ctx.fillStyle = "#ff8c2a";
    ctx.font = "28px Bungee, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(fx.text, fx.x, fx.y - 50 - (0.7 - fx.life) * 60);
    ctx.globalAlpha = 1;
  }
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].life <= 0) effects.splice(i, 1);
  ctx.restore();

  updateScores(players);
}

function drawArena() {
  // wooden floor planks
  ctx.fillStyle = "#6b4423";
  ctx.fillRect(0, 0, arena.w, arena.h);
  ctx.strokeStyle = "#5a381c";
  ctx.lineWidth = 3;
  for (let y = 0; y <= arena.h; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(arena.w, y); ctx.stroke();
    const offset = (y / 60) % 2 === 0 ? 0 : 120;
    for (let x = offset; x <= arena.w; x += 240) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 60); ctx.stroke();
    }
  }
  // arena wall
  ctx.strokeStyle = "#ff8c2a";
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, arena.w, arena.h);

  // big floor text
  ctx.fillStyle = "rgba(255, 140, 42, 0.08)";
  ctx.font = "120px Bungee, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("TUNG TUNG", arena.w / 2, arena.h / 2 - 20);
  ctx.fillText("SAHUR", arena.w / 2, arena.h / 2 + 110);
}

function drawPlayer(p, isMe) {
  const r = radius;
  ctx.save();
  ctx.translate(p.x, p.y);

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(0, r * 0.9, r, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();

  // bat (rotates toward aim, swings when bonking)
  const swing = p.s ? -1.2 : 0.6;
  ctx.save();
  ctx.rotate(p.f + swing);
  ctx.fillStyle = "#d9a066";
  ctx.strokeStyle = "#3d2412";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(r * 0.6, -5);
  ctx.lineTo(r * 2.6, -11);
  ctx.quadraticCurveTo(r * 2.9, 0, r * 2.6, 11);
  ctx.lineTo(r * 0.6, 5);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // log body
  const bodyW = r * 1.5, bodyH = r * 2.1;
  ctx.fillStyle = p.st ? "#ffcf99" : p.color;
  ctx.strokeStyle = "#3d2412";
  ctx.lineWidth = 3;
  roundRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 12);
  ctx.fill(); ctx.stroke();
  // wood grain lines
  ctx.strokeStyle = "rgba(61, 36, 18, 0.35)";
  ctx.lineWidth = 2;
  for (const gx of [-bodyW * 0.25, bodyW * 0.22]) {
    ctx.beginPath(); ctx.moveTo(gx, -bodyH * 0.4); ctx.lineTo(gx + 2, bodyH * 0.4); ctx.stroke();
  }

  // face: eyes look where you aim
  const lookX = Math.cos(p.f) * 3, lookY = Math.sin(p.f) * 3;
  for (const ex of [-8, 8]) {
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(ex, -10, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a0f07";
    ctx.beginPath(); ctx.arc(ex + lookX, -10 + lookY, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  // mouth
  ctx.strokeStyle = "#1a0f07";
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (p.st) ctx.arc(0, 10, 5, 0, Math.PI * 2);
  else ctx.arc(0, 4, 9, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.restore();

  // name tag
  ctx.fillStyle = isMe ? "#ffcf99" : "#fff3e0";
  ctx.font = "bold 14px Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(p.name, p.x, p.y - r * 2.1);
  if (isMe) {
    ctx.fillStyle = "#ff8c2a";
    ctx.beginPath();
    ctx.moveTo(p.x - 6, p.y - r * 2.6);
    ctx.lineTo(p.x + 6, p.y - r * 2.6);
    ctx.lineTo(p.x, p.y - r * 2.35);
    ctx.fill();
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let lastScoreHtml = "";
function updateScores(players) {
  const sorted = [...players].sort((a, b) => b.sc - a.sc).slice(0, 8);
  const html = "<b>BONKS</b>" + sorted
    .map((p) => `<div class="${p.id === myId ? "me" : ""}">${escapeHtml(p.name)}: ${p.sc}</div>`)
    .join("");
  if (html !== lastScoreHtml) { scoresEl.innerHTML = html; lastScoreHtml = html; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
