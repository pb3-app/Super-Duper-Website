// Dizzy Tungs - online rooms (up to 4 players, bots fill the empty spots).
// The server runs every game with the same engine the browser uses.
import { Game, COLORS, BOT_LEVELS, TYPES } from "../games/dizzy/engine.js";

const TICK_MS = 1000 / 60;
const SEND_EVERY = 2;              // 30 updates per second
const QUICK_AUTOSTART_MS = 8000;   // quick-match lobbies start 8s after a 2nd player joins

export function setupDizzy(io) {
  const nsp = io.of("/dizzy");
  const rooms = new Map();         // code -> room

  const cleanName = (n) => String(n || "").replace(/[^\w \-]/g, "").trim().slice(0, 16) || "Tung" + Math.floor(Math.random() * 1000);
  const validBots = (b) => (b === "none" || Object.prototype.hasOwnProperty.call(BOT_LEVELS, b) ? b : "medium");

  function makeCode() {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let code;
    do { code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join(""); } while (rooms.has(code));
    return code;
  }

  function newRoom(isPublic) {
    const room = { code: makeCode(), public: isPublic, members: [], bots: "medium", lives: 3, botWins: [0, 0, 0, 0], game: null, timer: null, autoStartAt: 0, autoTimer: null };
    rooms.set(room.code, room);
    return room;
  }

  function sendLobby(room) {
    if (room.game) return;
    const autoStartIn = room.autoStartAt ? Math.max(0, room.autoStartAt - Date.now()) : 0;
    room.members.forEach((s, i) => {
      s.emit("lobby", {
        code: room.code, public: room.public, bots: room.bots, lives: room.lives, autoStartIn,
        youAreHost: !room.public && i === 0,
        players: room.members.map((m) => ({ name: m.data.name, you: m === s, type: m.data.type || "random" }))
      });
    });
  }

  function leaveRoom(socket) {
    const room = socket.data.room;
    if (!room) return;
    socket.data.room = null;
    const idx = room.members.indexOf(socket);
    if (idx >= 0) room.members.splice(idx, 1);
    if (room.game && socket.data.seat !== undefined) room.game.removePlayer(socket.data.seat);
    socket.data.seat = undefined;
    if (room.members.length === 0) { stopGame(room); clearTimeout(room.autoTimer); rooms.delete(room.code); return; }
    if (room.public) scheduleAutoStart(room);
    sendLobby(room);
  }

  function joinRoom(socket, room) {
    leaveRoom(socket);
    if (room.members.length >= 4 || room.game) { socket.emit("joinError", { msg: room.game ? "That game already started." : "That room is full." }); return; }
    room.members.push(socket);
    socket.data.room = room;
    if (room.public) scheduleAutoStart(room);
    sendLobby(room);
  }

  function scheduleAutoStart(room) {
    clearTimeout(room.autoTimer);
    room.autoStartAt = 0;
    if (room.game) return;
    if (room.members.length >= 4) { startGame(room); return; }
    if (room.members.length >= 2) {
      room.autoStartAt = Date.now() + QUICK_AUTOSTART_MS;
      room.autoTimer = setTimeout(() => startGame(room), QUICK_AUTOSTART_MS);
      // keep the countdown on everyone's screen fresh
      const tick = setInterval(() => { if (!room.autoStartAt || room.game || !rooms.has(room.code)) clearInterval(tick); else sendLobby(room); }, 1000);
    }
  }

  function startGame(room) {
    if (room.game || room.members.length === 0) return;
    clearTimeout(room.autoTimer); room.autoStartAt = 0;
    const humans = room.members.length;
    const players = [];
    for (let i = 0; i < 4; i++) {
      if (i < humans) players.push({ name: room.members[i].data.name, colorIndex: i, bot: null, wins: room.members[i].data.wins || 0, type: room.members[i].data.type });
      else if (room.bots !== "none") players.push({ name: `${COLORS[i].name} Bot`, colorIndex: i, bot: room.bots, wins: room.botWins[i] });
    }
    if (players.length < 2) { room.members[0].emit("joinError", { msg: "Need at least 2 players, or turn on bots." }); return; }
    room.game = new Game(players, { lives: room.lives });
    room.members.forEach((s, i) => { s.data.seat = i; s.emit("start", { you: i, host: room.public ? i === 0 : i === 0 }); });
    let ticks = 0;
    room.timer = setInterval(() => {
      const g = room.game;
      if (!g) return;
      g.update(TICK_MS);
      ticks++;
      const ev = g.takeEvents();
      const ids = room.members.map((m) => m.id);
      if (ev.length) nsp.to(ids).emit("events", ev);
      if (ticks % SEND_EVERY === 0 || ev.length) { const snap = g.snapshot(); for (const m of room.members) m.volatile.emit("state", snap); }
      if (g.phase === "matchEnd" && !room.endAt) {
        room.endAt = Date.now();
        // remember wins for the next game in this room
        g.tungs.forEach((t, i) => { if (room.members[i] && !t.bot) room.members[i].data.wins = t.wins; else if (t.bot) room.botWins[t.colorIndex] = t.wins; });
      }
    }, TICK_MS);
  }

  function stopGame(room) {
    clearInterval(room.timer);
    room.timer = null; room.game = null; room.endAt = 0;
  }

  nsp.on("connection", (socket) => {
    socket.data.room = null;

    socket.on("create", (d) => {
      socket.data.name = cleanName(d?.name);
      const room = newRoom(false);
      joinRoom(socket, room);
    });

    socket.on("join", (d) => {
      socket.data.name = cleanName(d?.name);
      const room = rooms.get(String(d?.code || "").toUpperCase());
      if (!room || room.public) { socket.emit("joinError", { msg: "Room not found. Check the code." }); return; }
      joinRoom(socket, room);
    });

    socket.on("quick", (d) => {
      socket.data.name = cleanName(d?.name);
      let room = [...rooms.values()].find((r) => r.public && !r.game && r.members.length < 4);
      if (!room) room = newRoom(true);
      joinRoom(socket, room);
    });

    socket.on("bots", (d) => {
      const room = socket.data.room;
      if (!room || room.public || room.members[0] !== socket || room.game) return;
      room.bots = validBots(d?.level);
      sendLobby(room);
    });

    socket.on("type", (d) => {
      socket.data.type = TYPES[d?.type] ? d.type : "random";
      if (socket.data.room) sendLobby(socket.data.room);
    });

    socket.on("lives", (d) => {
      const room = socket.data.room;
      if (!room || room.public || room.members[0] !== socket || room.game) return;
      const n = Math.round(Number(d?.lives));
      if (n >= 1 && n <= 10) room.lives = n;
      sendLobby(room);
    });

    socket.on("start", () => {
      const room = socket.data.room;
      if (!room || room.members[0] !== socket) return;
      if (room.game && room.game.phase !== "matchEnd") return;
      if (room.game) { stopGame(room); }   // play again with the same room
      startGame(room);
    });

    socket.on("in", (d) => {
      const room = socket.data.room;
      if (!room || !room.game || socket.data.seat === undefined || !d) return;
      if (d.k === "p") room.game.press(socket.data.seat);
      else if (d.k === "r") room.game.release(socket.data.seat);
    });

    socket.on("leave", () => leaveRoom(socket));
    socket.on("disconnect", () => leaveRoom(socket));
  });
}
