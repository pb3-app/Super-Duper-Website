// Tung Boxing - online 1v1 matches.
// The server runs every fight with the same engine the browser uses,
// so nobody can cheat by changing the game on their own computer.
import { Match, CHARACTERS } from "../games/boxing/engine.js";

const TICK_MS = 1000 / 60;     // fight simulation steps per second
const SEND_EVERY = 2;          // send the fight state every 2nd step (30 times a second)
const COUNTDOWN_MS = 2400;

export function setupBoxing(io) {
  const nsp = io.of("/boxing");
  let waiting = null;          // socket waiting for a quick match
  const rooms = new Map();     // code -> socket waiting in a private room
  const fights = new Set();

  function cleanName(n) {
    const s = String(n || "").replace(/[^\w \-]/g, "").trim().slice(0, 16);
    return s || "Tung" + Math.floor(Math.random() * 1000);
  }
  function validChar(c) { return Object.prototype.hasOwnProperty.call(CHARACTERS, c) ? c : "grey"; }

  function makeCode() {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let code;
    do { code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join(""); } while (rooms.has(code));
    return code;
  }

  function stopWaiting(socket) {
    if (waiting === socket) waiting = null;
    if (socket.data.roomCode) { rooms.delete(socket.data.roomCode); socket.data.roomCode = null; }
  }

  function startFight(a, b) {
    stopWaiting(a); stopWaiting(b);
    const players = [a, b];
    const chars = players.map((s) => s.data.char);
    const match = new Match(CHARACTERS[chars[0]], CHARACTERS[chars[1]], { online: true });
    const fight = { match, players, startAt: Date.now() + COUNTDOWN_MS, ticks: 0, over: false };
    fights.add(fight);
    players.forEach((s, i) => {
      s.data.fight = fight;
      s.data.index = i;
      s.emit("start", { you: i, chars, names: players.map((p) => p.data.name), countdown: COUNTDOWN_MS });
    });

    fight.timer = setInterval(() => {
      if (fight.over) return;
      const now = Date.now();
      if (now >= fight.startAt) match.update(TICK_MS);
      fight.ticks++;
      const events = match.takeEvents();
      if (events.length) nsp.to(players.map((p) => p.id)).emit("events", events);
      if (fight.ticks % SEND_EVERY === 0 || events.length) {
        const snap = match.snapshot();
        for (const p of players) p.volatile.emit("state", snap);
      }
      if (match.winner !== null) endFight(fight, match.winner, false);
    }, TICK_MS);
  }

  function endFight(fight, winner, forfeit) {
    if (fight.over) return;
    fight.over = true;
    clearInterval(fight.timer);
    fights.delete(fight);
    for (const p of fight.players) {
      if (p.connected) p.emit("end", { winner, forfeit });
      p.data.fight = null;
    }
  }

  function leaveFight(socket) {
    const fight = socket.data.fight;
    if (fight && !fight.over) endFight(fight, 1 - socket.data.index, true);
  }

  nsp.on("connection", (socket) => {
    socket.data.fight = null;

    const setup = (d) => {
      leaveFight(socket);
      stopWaiting(socket);
      socket.data.name = cleanName(d?.name);
      socket.data.char = validChar(d?.char);
    };

    socket.on("quick", (d) => {
      setup(d);
      if (waiting && waiting.connected && waiting !== socket) startFight(waiting, socket);
      else { waiting = socket; socket.emit("waiting"); }
    });

    socket.on("create", (d) => {
      setup(d);
      const code = makeCode();
      rooms.set(code, socket);
      socket.data.roomCode = code;
      socket.emit("room", { code });
    });

    socket.on("join", (d) => {
      setup(d);
      const code = String(d?.code || "").toUpperCase();
      const host = rooms.get(code);
      if (!host || !host.connected || host === socket) { socket.emit("joinError", { msg: "Room not found. Check the code." }); return; }
      startFight(host, socket);
    });

    socket.on("in", (d) => {
      const fight = socket.data.fight;
      if (!fight || fight.over || Date.now() < fight.startAt || typeof d !== "object" || !d) return;
      const i = socket.data.index, m = fight.match;
      if (d.k === "p" && (d.h === "L" || d.h === "R")) m.press(i, d.h);
      else if (d.k === "r" && (d.h === "L" || d.h === "R")) m.release(i, d.h);
      else if (d.k === "d" && (d.d === "L" || d.d === "R" || d.d === "D")) m.dodgePress(i, d.d);
    });

    socket.on("leave", () => { leaveFight(socket); stopWaiting(socket); });
    socket.on("disconnect", () => { leaveFight(socket); stopWaiting(socket); });
  });
}
