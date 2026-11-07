// Tung Tung Sahur Arena - game server
// The server is the "boss": it runs the real game, players only send inputs.

import { createServer } from "http";
import { Server } from "socket.io";

const PORT = process.env.PORT || 3000;

// ---- Game settings (tweak these!) ----
const TICK_RATE = 30;          // game updates per second
const ARENA_W = 1600;
const ARENA_H = 1000;
const PLAYER_RADIUS = 28;
const SPEED = 260;             // pixels per second
const BONK_RANGE = 85;         // how far the bat reaches
const BONK_COOLDOWN = 0.6;     // seconds between swings
const BONK_KNOCKBACK = 900;    // how hard a bonk launches someone
const FRICTION = 6;            // how fast knockback slows down
const MAX_PLAYERS = 16;

const COLORS = ["#c8874a", "#a86b35", "#d9a066", "#8b5a2b", "#e0b07a", "#b5793f"];

const httpServer = createServer((req, res) => {
  // Simple health check so you can visit the server in a browser
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Tung Tung Sahur server is running. Players online: " + Object.keys(players).length);
});

const io = new Server(httpServer, {
  cors: { origin: "*" }, // allow the Amplify website to connect
});

const players = {}; // socket.id -> player

function randomSpawn() {
  return {
    x: PLAYER_RADIUS + Math.random() * (ARENA_W - PLAYER_RADIUS * 2),
    y: PLAYER_RADIUS + Math.random() * (ARENA_H - PLAYER_RADIUS * 2),
  };
}

function cleanName(name) {
  const n = String(name || "").replace(/[^\w \-]/g, "").trim().slice(0, 16);
  return n || "Sahur" + Math.floor(Math.random() * 1000);
}

io.on("connection", (socket) => {
  if (Object.keys(players).length >= MAX_PLAYERS) {
    socket.emit("full");
    socket.disconnect();
    return;
  }

  socket.on("join", (data) => {
    const spawn = randomSpawn();
    players[socket.id] = {
      id: socket.id,
      name: cleanName(data?.name),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      x: spawn.x,
      y: spawn.y,
      vx: 0, vy: 0,          // knockback velocity
      facing: 0,             // angle in radians
      input: { up: false, down: false, left: false, right: false, aim: 0 },
      cooldown: 0,
      swingTime: 0,          // >0 while the bat swing animation plays
      score: 0,
      stunned: 0,
    };
    socket.emit("welcome", { id: socket.id, arena: { w: ARENA_W, h: ARENA_H }, radius: PLAYER_RADIUS });
    io.emit("event", { type: "join", name: players[socket.id].name });
  });

  socket.on("input", (input) => {
    const p = players[socket.id];
    if (!p || typeof input !== "object") return;
    p.input.up = !!input.up;
    p.input.down = !!input.down;
    p.input.left = !!input.left;
    p.input.right = !!input.right;
    if (Number.isFinite(input.aim)) p.input.aim = input.aim;
  });

  socket.on("bonk", () => {
    const p = players[socket.id];
    if (!p || p.cooldown > 0 || p.stunned > 0) return;
    p.cooldown = BONK_COOLDOWN;
    p.swingTime = 0.2;

    for (const other of Object.values(players)) {
      if (other.id === p.id) continue;
      const dx = other.x - p.x;
      const dy = other.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > BONK_RANGE + PLAYER_RADIUS) continue;
      // Only hit things roughly in front of you
      const angleTo = Math.atan2(dy, dx);
      let diff = Math.abs(angleTo - p.facing);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > Math.PI / 2) continue;

      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      other.vx += nx * BONK_KNOCKBACK;
      other.vy += ny * BONK_KNOCKBACK;
      other.stunned = 0.35;
      p.score += 1;
      io.emit("event", { type: "bonk", from: p.name, to: other.name, x: other.x, y: other.y });
    }
  });

  socket.on("disconnect", () => {
    const p = players[socket.id];
    if (p) io.emit("event", { type: "leave", name: p.name });
    delete players[socket.id];
  });
});

// ---- The game loop ----
const dt = 1 / TICK_RATE;
setInterval(() => {
  for (const p of Object.values(players)) {
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.swingTime = Math.max(0, p.swingTime - dt);
    p.stunned = Math.max(0, p.stunned - dt);
    p.facing = p.input.aim;

    let mx = 0, my = 0;
    if (p.stunned <= 0) {
      if (p.input.up) my -= 1;
      if (p.input.down) my += 1;
      if (p.input.left) mx -= 1;
      if (p.input.right) mx += 1;
      const len = Math.hypot(mx, my);
      if (len > 0) { mx /= len; my /= len; }
    }

    p.x += (mx * SPEED + p.vx) * dt;
    p.y += (my * SPEED + p.vy) * dt;

    // Knockback slows down over time
    const decay = Math.exp(-FRICTION * dt);
    p.vx *= decay;
    p.vy *= decay;

    // Keep players inside the arena (bounce off walls)
    if (p.x < PLAYER_RADIUS) { p.x = PLAYER_RADIUS; p.vx = Math.abs(p.vx) * 0.5; }
    if (p.x > ARENA_W - PLAYER_RADIUS) { p.x = ARENA_W - PLAYER_RADIUS; p.vx = -Math.abs(p.vx) * 0.5; }
    if (p.y < PLAYER_RADIUS) { p.y = PLAYER_RADIUS; p.vy = Math.abs(p.vy) * 0.5; }
    if (p.y > ARENA_H - PLAYER_RADIUS) { p.y = ARENA_H - PLAYER_RADIUS; p.vy = -Math.abs(p.vy) * 0.5; }
  }

  // Send a compact snapshot of the world to everyone
  const snapshot = Object.values(players).map((p) => ({
    id: p.id, name: p.name, color: p.color,
    x: Math.round(p.x), y: Math.round(p.y),
    f: Math.round(p.facing * 100) / 100,
    s: p.swingTime > 0 ? 1 : 0,
    st: p.stunned > 0 ? 1 : 0,
    sc: p.score,
  }));
  io.emit("state", { t: Date.now(), players: snapshot });
}, 1000 * dt);

httpServer.listen(PORT, () => {
  console.log(`Tung Tung Sahur server running on port ${PORT}`);
});
