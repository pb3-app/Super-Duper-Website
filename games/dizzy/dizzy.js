// Dizzy Tungs - a normal arcade game page: Single Player / Multiplayer switch, challenges and rooms come from the site (NetPlay).
// One browser (the host) runs the game; everyone else sends their button presses and draws the snapshots the host sends back.
import { Game, RULES, COLORS, MAPS, BOT_LEVELS, TYPES, TYPE_IDS } from "./engine.js";

const $ = (id) => document.getElementById(id);
const canvas = $("arena");
const ctx = canvas.getContext("2d");
const LOCAL_KEYS = ["KeyQ", "KeyM", "KeyP", "KeyZ"];     // seat 0..3 (matches their starting corners)
const LOCAL_KEY_LABELS = ["Q", "M", "P", "Z"];

const app = { session: null };
let np = null;
const myName = () => (window.TungMP && TungMP.user ? TungMP.user.username : "You");

// ================= Local sessions (single player + same screen) =================
class LocalSession {
  constructor(players, humanSeats, lives) {
    this.players = players;
    this.humanSeats = humanSeats;   // [{ seat, keys, label, color }]
    this.lives = lives;
    this.game = new Game(players, { lives });
    this.acc = 0;
    this.events = [];
  }
  tick(dt) {
    this.acc += Math.min(dt, 100);
    while (this.acc >= 1000 / 120) { this.game.update(1000 / 120); this.acc -= 1000 / 120; }
    this.events.push(...this.game.takeEvents());
  }
  view() { return this.game.snapshot(); }
  takeEvents() { const e = this.events; this.events = []; return e; }
  press(seat) { this.game.press(seat); }
  release(seat) { this.game.release(seat); }
  again() {
    // keep everyone's win count going between games
    this.players = this.players.map((p, i) => ({ ...p, wins: this.game.tungs[i].wins }));
    this.game = new Game(this.players, { lives: this.lives });
  }
  quit() {}
  get mySeats() { return this.humanSeats.map((h) => h.seat); }
}

let myType = "bouncy";
try { const t = localStorage.getItem("dizzyType"); if (TYPES[t]) myType = t; } catch {}
function typeOptions(selected, withRandom = true) {
  return (withRandom ? `<option value="random"${selected === "random" ? " selected" : ""}>🎲 Random</option>` : "") +
    TYPE_IDS.map((id) => `<option value="${id}"${id === selected ? " selected" : ""}>${TYPES[id].icon} ${TYPES[id].name}</option>`).join("");
}
function renderTypeCards() {
  const box = $("type-cards"); box.innerHTML = "";
  for (const id of TYPE_IDS) {
    const t = TYPES[id];
    const b = document.createElement("button");
    b.className = "tcard" + (id === myType ? " sel" : "");
    b.innerHTML = `<div class="ic">${t.icon}</div><div class="nm">${t.name}</div><ul>${t.perks.map((p) => `<li>${p}</li>`).join("")}</ul>`;
    b.addEventListener("click", () => { myType = id; try { localStorage.setItem("dizzyType", id); } catch {} renderTypeCards(); });
    box.appendChild(b);
  }
}
renderTypeCards();

function startSingle(level) {
  const players = [{ name: myName(), bot: null, type: myType }, ...[1, 2, 3].map((i) => ({ name: `${COLORS[i].name} Bot`, bot: level }))];
  app.session = new LocalSession(players, [{ seat: 0, keys: ["Space", "Enter"], label: "SPACE", color: 0 }], Number($("single-lives").value));
  app.session.single = true;
  beginGame();
}
document.querySelectorAll("[data-single]").forEach((b) => b.addEventListener("click", () => startSingle(b.dataset.single)));

// Same-screen seats
const localJoined = [true, true, false, false];
const localTypes = ["random", "random", "random", "random"];
function renderLocalSeats() {
  const box = $("local-seats");
  box.innerHTML = "";
  COLORS.forEach((c, i) => {
    const d = document.createElement("div");
    d.className = "seat" + (localJoined[i] ? " on" : "");
    d.style.color = c.color;
    d.innerHTML = `<div class="nm">${c.name}</div><div class="who">${localJoined[i] ? `Key <kbd>${LOCAL_KEY_LABELS[i]}</kbd>` : "empty"}</div>` +
      (localJoined[i] ? `<select>${typeOptions(localTypes[i])}</select>` : "") + `<button>${localJoined[i] ? "Remove" : "+ Add player"}</button>`;
    d.querySelector("button").addEventListener("click", () => { localJoined[i] = !localJoined[i]; renderLocalSeats(); });
    const sel = d.querySelector("select");
    if (sel) sel.addEventListener("change", () => { localTypes[i] = sel.value; });
    box.appendChild(d);
  });
  $("local-status").textContent = "";
}
renderLocalSeats();
$("local-start").addEventListener("click", () => {
  const bots = $("local-bots").value;
  const humans = localJoined.filter(Boolean).length;
  if (humans + (bots === "none" ? 0 : 4 - humans) < 2) { $("local-status").textContent = "Add at least 2 players (or turn on bots)."; return; }
  const players = [], humanSeats = [];
  COLORS.forEach((c, i) => {
    if (localJoined[i]) { players.push({ name: `${c.name} (${LOCAL_KEY_LABELS[i]})`, colorIndex: i, bot: null, type: localTypes[i] }); humanSeats.push({ seat: players.length - 1, keys: [LOCAL_KEYS[i]], label: LOCAL_KEY_LABELS[i], color: i }); }
    else if (bots !== "none") players.push({ name: `${c.name} Bot`, colorIndex: i, bot: bots });
  });
  app.session = new LocalSession(players, humanSeats, Number($("local-lives").value));
  app.session.local = true;
  beginGame();
});

// ================= Online sessions (the host runs the game, everyone else watches snapshots) =================
class HostSession {
  constructor(info) {
    this.online = true; this.isHost = true;
    this.ids = info.players.map((p) => p.id);
    this.names = info.players.map((p) => p.name);
    this.lives = Math.max(1, Number(info.opts && info.opts.lives) || 3);
    this.types = { [info.me.id]: myType };
    this.mySeat = this.ids.indexOf(info.me.id);
    this.game = null; this.acc = 0; this.events = []; this.sendAcc = 0; this.outEv = [];
  }
  start() {
    const players = this.ids.map((id, i) => ({ name: this.names[i], colorIndex: i, bot: null, type: this.types[id] || "random" }));
    this.game = new Game(players, { lives: this.lives });
  }
  tick(dt) {
    const g = this.game; if (!g) return;
    this.acc += Math.min(dt, 100);
    while (this.acc >= 1000 / 120) { g.update(1000 / 120); this.acc -= 1000 / 120; }
    const ev = g.takeEvents();
    this.events.push(...ev); this.outEv.push(...ev);
    this.sendAcc += dt;
    if (this.sendAcc >= 33) { this.sendAcc = 0; np.send({ k: "s", s: g.snapshot(), ev: this.outEv }); this.outEv = []; }
  }
  view() { return this.game ? this.game.snapshot() : null; }
  takeEvents() { const e = this.events; this.events = []; return e; }
  press(seat) { if (this.game) this.game.press(seat); }
  release(seat) { if (this.game) this.game.release(seat); }
  remote(from, d) {
    if (d.k === "type") { this.types[from] = TYPES[d.type] ? d.type : "random"; return; }
    const seat = this.ids.indexOf(from); if (seat < 0 || !this.game) return;
    if (d.k === "p") this.game.press(seat); else if (d.k === "r") this.game.release(seat);
  }
  left(id) { const seat = this.ids.indexOf(id); if (seat >= 0 && this.game) this.game.removePlayer(seat); }
  quit() {}
  get mySeats() { return [this.mySeat]; }
}

class GuestSession {
  constructor(info) {
    this.online = true; this.isHost = false;
    this.ids = info.players.map((p) => p.id);
    this.mySeat = this.ids.indexOf(info.me.id);
    this.snaps = [];          // recent snapshots for smoothing
    this.offset = null;       // local clock - host game clock
    this.events = [];
    // tell the host which tung we picked (repeat until the game starts: the host may not be listening yet)
    const hello = () => np.send({ k: "type", type: myType });
    hello();
    this.hello = setInterval(() => { if (this.snaps.length) clearInterval(this.hello); else hello(); }, 400);
  }
  push(d) {
    const s = d.s; if (!s) return;
    const off = performance.now() - s.time;
    this.offset = this.offset === null ? off : Math.min(off, this.offset + 2); // track the fastest arrival
    this.snaps.push(s);
    while (this.snaps.length > 40) this.snaps.shift();
    if (d.ev) this.events.push(...d.ev);
  }
  tick() {}
  view() {
    if (!this.snaps.length) return null;
    const renderT = performance.now() - this.offset - 70; // draw 70ms behind for smooth motion
    let a = this.snaps[0], b = this.snaps[this.snaps.length - 1];
    for (let i = this.snaps.length - 1; i > 0; i--) if (this.snaps[i - 1].time <= renderT) { a = this.snaps[i - 1]; b = this.snaps[i]; break; }
    const span = b.time - a.time, k = span > 0 ? Math.max(0, Math.min(1, (renderT - a.time) / span)) : 1;
    const out = { ...b, tungs: b.tungs.map((t) => {
      const o = a.tungs.find((x) => x.id === t.id);
      if (!o) return t;
      let da = t.a - o.a; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      return { ...t, x: o.x + (t.x - o.x) * k, y: o.y + (t.y - o.y) * k, a: o.a + da * k };
    }) };
    out.bats = b.bats.map((bt) => { const o = a.bats.find((x) => x.id === bt.id); return o ? { ...bt, x: o.x + (bt.x - o.x) * k, y: o.y + (bt.y - o.y) * k } : bt; });
    return out;
  }
  takeEvents() { const e = this.events; this.events = []; return e; }
  press() { np.send({ k: "p" }); }
  release() { np.send({ k: "r" }); }
  quit() { clearInterval(this.hello); }
  get mySeats() { return [this.mySeat]; }
}

// when the game is over online: the host names the finishing order, in a 1 v 1 everybody reports win (1) or loss (0)
function reportOnline(s, v) {
  if (s.reported) return; s.reported = true;
  const w = v.matchWinner;
  const order = v.tungs.map((t) => ({ id: s.ids[t.id], win: t.id === w ? 1 : 0, w: t.wins, left: t.left ? 1 : 0 }))
    .sort((a, b) => (a.left - b.left) || (b.win - a.win) || (b.w - a.w)).map((x) => x.id);
  np.report({ score: s.mySeat === w ? 1 : 0, ranking: order });
}

// ================= Game flow =================
const fx = { parts: [], pops: [], shake: 0, lastPhase: null };
function beginGame() {
  fx.parts = []; fx.pops = []; fx.shake = 0;
  $("end-buttons").hidden = true; $("result").hidden = true;
  $("banner").textContent = "";
  buildTouchZones();
  np.setPlaying(true);
}
function toMenu() {
  if (app.session) app.session.quit();
  app.session = null;
  $("end-buttons").hidden = true; $("result").hidden = true;
  np.setPlaying(false);
}
function showResult(title, sub, buttons) {
  const r = $("result"); r.innerHTML = `<h2>${title}</h2><p>${sub}</p><div class="btn-row"></div>`; r.hidden = false;
  for (const [label, fn] of buttons) { const b = document.createElement("button"); b.className = "btn"; b.textContent = label; b.onclick = fn; r.querySelector(".btn-row").append(b); }
}
$("quit").addEventListener("click", () => { if (np.kind) np.leave(); else toMenu(); });
$("btn-menu").addEventListener("click", toMenu);
$("btn-again").addEventListener("click", () => {
  const s = app.session; if (!s || s.online) return;
  s.again(); s.recorded = false; beginGame();
});

function buildTouchZones() {
  const box = $("touch-zones"); box.innerHTML = "";
  const s = app.session;
  if (!matchMedia("(pointer: coarse)").matches || !s || !s.local) return;
  for (const h of s.humanSeats) {
    const z = document.createElement("div");
    z.className = "tz c" + h.color; z.style.background = COLORS[h.color].color; z.textContent = "HOLD";
    z.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); app.session && app.session.press(h.seat); });
    const up = (e) => { e.preventDefault(); app.session && app.session.release(h.seat); };
    z.addEventListener("pointerup", up); z.addEventListener("pointercancel", up);
    box.appendChild(z);
  }
}

// ================= Controls =================
const down = new Set();
function seatForKey(code) {
  const s = app.session; if (!s) return null;
  if (!s.local) return code === "Space" || code === "Enter" ? s.mySeats[0] : null;
  const h = s.humanSeats.find((x) => x.keys.includes(code));
  return h ? h.seat : null;
}
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
  if (e.code === "Escape" && app.session && !app.session.online) { toMenu(); return; }
  const seat = seatForKey(e.code);
  if (seat === null) return;
  e.preventDefault();
  if (e.repeat || down.has(e.code)) return;
  down.add(e.code);
  app.session.press(seat);
});
addEventListener("keyup", (e) => {
  if (!down.has(e.code)) return;
  down.delete(e.code);
  const seat = app.session ? seatForKey(e.code) : null;
  if (seat !== null) app.session.release(seat);
});
let pointerHeld = false;
canvas.addEventListener("pointerdown", (e) => {
  const s = app.session; if (!s || s.local) return;
  e.preventDefault(); pointerHeld = true; s.press(s.mySeats[0]);
});
addEventListener("pointerup", () => { const s = app.session; if (pointerHeld && s) { pointerHeld = false; s.release(s.mySeats[0]); } });
addEventListener("blur", () => { const s = app.session; if (!s) return; for (const seat of s.mySeats) s.release(seat); down.clear(); });

// ================= Drawing =================
function resize() { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; }
addEventListener("resize", resize); resize();

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const map = MAPS.yard;
let floorCache = null;
function drawFloor() {
  if (!floorCache) {
    floorCache = document.createElement("canvas");
    floorCache.width = map.w; floorCache.height = map.h;
    const c = floorCache.getContext("2d");
    c.fillStyle = "#8b5a2b"; c.fillRect(0, 0, map.w, map.h);
    for (let y = 0; y < map.h; y += 50) {
      c.fillStyle = (y / 50) % 2 ? "#8f5e2f" : "#865628"; c.fillRect(0, y, map.w, 50);
      c.strokeStyle = "rgba(40,20,5,0.35)"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, y); c.lineTo(map.w, y); c.stroke();
      for (let x = ((y / 50) % 2) * 150; x < map.w; x += 300) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 50); c.stroke(); }
    }
    c.fillStyle = "rgba(255,140,42,0.12)"; c.font = "70px Bungee, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("TUNG TUNG", map.w / 2, map.h / 2 - 140); c.fillText("SAHUR", map.w / 2, map.h / 2 + 150);
    // corner pads in each player color
    map.spawns.forEach((s, i) => { c.fillStyle = COLORS[i].color + "33"; c.beginPath(); c.arc(s.x, s.y, 46, 0, Math.PI * 2); c.fill(); });
    for (const w of map.walls) {
      c.fillStyle = "#3d2412"; c.fillRect(w.x + 5, w.y + 7, w.w, w.h); // shadow
      const g = c.createLinearGradient(w.x, w.y, w.x, w.y + w.h); g.addColorStop(0, "#6b4423"); g.addColorStop(1, "#4a2e17");
      c.fillStyle = g; c.fillRect(w.x, w.y, w.w, w.h);
      c.strokeStyle = "#2b1a0e"; c.lineWidth = 3; c.strokeRect(w.x, w.y, w.w, w.h);
      c.strokeStyle = "rgba(255,207,153,0.15)"; c.lineWidth = 2;
      for (let k = 12; k < Math.max(w.w, w.h); k += 14) { c.beginPath(); if (w.w > w.h) { c.moveTo(w.x + k, w.y + 4); c.lineTo(w.x + k, w.y + w.h - 4); } else { c.moveTo(w.x + 4, w.y + k); c.lineTo(w.x + w.w - 4, w.y + k); } c.stroke(); }
    }
    if (document.fonts) document.fonts.ready.then(() => { floorCache = null; });
  }
  ctx.drawImage(floorCache, 0, 0);
  ctx.strokeStyle = "#ff8c2a"; ctx.lineWidth = 6; ctx.strokeRect(-3, -3, map.w + 6, map.h + 6);
}

function drawBatShape(len, color) {
  // a bat pointing along +x, handle at 0
  ctx.fillStyle = "#e0b07a"; ctx.strokeStyle = "#2b1a0e"; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -3); ctx.lineTo(len * 0.55, -4.5); ctx.quadraticCurveTo(len, -8, len, 0); ctx.quadraticCurveTo(len, 8, len * 0.55, 4.5); ctx.lineTo(0, 3); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.fillRect(-1, -3.5, len * 0.22, 7);
}

const TYPE_SIZE = Object.fromEntries(TYPE_IDS.map((id) => [id, TYPES[id].size || 1]));
function drawTung(t, now) {
  const r = RULES.RADIUS * (TYPE_SIZE[t.type] || 1) * (t.size > 1 ? 1.35 : t.size < 1 ? 0.7 : 1);
  const col = COLORS[t.c].color;
  ctx.save();
  ctx.translate(t.x, t.y);
  if (!t.alive) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#3d2412"; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.6, t.a, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(col, -0.4); ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.5, t.a, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); return;
  }
  if (t.inv > 0 && Math.floor(now / 80) % 2 === 0) ctx.globalAlpha = 0.4;
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(4, 6, r, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(t.a);
  // bat(s) held out front: shows where you're aiming
  if (t.cd <= 0) {
    const bats = t.double > 0 ? [-0.25, 0.25] : [0.35];
    const batLen = t.type === "slugger" ? r * 2 : r * 1.5;
    for (const off of bats) { ctx.save(); ctx.translate(r * 0.4, off * r * 1.6); ctx.rotate(-off * 0.3); drawBatShape(batLen, col); ctx.restore(); }
  }
  // log top (seen from above): wood rings
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, shade(col, 0.25)); g.addColorStop(1, shade(col, -0.2));
  ctx.fillStyle = g; ctx.strokeStyle = "#1a0f07"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = shade(col, -0.35); ctx.lineWidth = 1.5;
  for (const k of [0.66, 0.38]) { ctx.beginPath(); ctx.arc(0, 0, r * k, 0, Math.PI * 2); ctx.stroke(); }
  // eyes on the front edge
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1a0f07"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r * 0.5, s * r * 0.33, r * 0.24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#1a0f07"; ctx.beginPath(); ctx.arc(r * 0.6, s * r * 0.33, r * 0.11, 0, Math.PI * 2); ctx.fill();
  }
  ctx.rotate(-t.a);
  // type badge in the middle of the log
  if (t.type && TYPES[t.type]) {
    ctx.fillStyle = "rgba(26,15,7,0.55)"; ctx.beginPath(); ctx.arc(-r * 0.15, 0, r * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff3e0"; ctx.font = `bold ${Math.round(r * 0.45)}px Nunito, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(TYPES[t.type].icon, -r * 0.15, 1);
  }
  if (t.type === "zoomy" && t.hold) {
    ctx.strokeStyle = "rgba(255,243,224,0.5)"; ctx.lineWidth = 2;
    for (const k of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.moveTo(-Math.cos(t.a) * r * 1.2 - Math.sin(t.a) * k * r, -Math.sin(t.a) * r * 1.2 + Math.cos(t.a) * k * r); ctx.lineTo(-Math.cos(t.a) * r * 2 - Math.sin(t.a) * k * r, -Math.sin(t.a) * r * 2 + Math.cos(t.a) * k * r); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  // shield bubble
  if (t.shield > 0) {
    ctx.strokeStyle = "rgba(124,196,255,0.9)"; ctx.fillStyle = "rgba(124,196,255,0.18)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r + 10 + Math.sin(now / 150) * 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // dizzy swirl while spinning
  if (!t.hold) {
    ctx.strokeStyle = "rgba(255,243,224,0.35)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r + 5, t.a + Math.PI * 0.6 * -t.spin, t.a + Math.PI * 1.2 * -t.spin, t.spin > 0); ctx.stroke();
  }
  ctx.restore();
  // name + hearts above
  ctx.font = "bold 13px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.lineWidth = 4; ctx.strokeStyle = "rgba(26,15,7,0.8)"; ctx.fillStyle = col;
  ctx.strokeText(t.name, t.x, t.y - r - 16); ctx.fillText(t.name, t.x, t.y - r - 16);
  ctx.fillStyle = "#ff6b5b"; ctx.font = "13px sans-serif";
  const hs = hearts(t.hp);
  ctx.strokeText(hs, t.x, t.y - r - 3); ctx.fillText(hs, t.x, t.y - r - 3);
}

const crateIcon = { grow: ["⬆", "#7be38a"], shrink: ["⬇", "#ff9de0"], shield: ["◯", "#7cc4ff"], double: ["✕2", "#ffd34a"] };
function drawCrate(c, now) {
  const s = RULES.CRATE_RADIUS * 1.6, bob = Math.sin(now / 250 + c.x) * 2;
  ctx.save(); ctx.translate(c.x, c.y + bob);
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(-s / 2 + 3, -s / 2 + 5, s, s);
  ctx.fillStyle = "#c8874a"; ctx.strokeStyle = "#2b1a0e"; ctx.lineWidth = 3;
  rr(-s / 2, -s / 2, s, s, 5); ctx.fill(); ctx.stroke();
  const [ic, col] = crateIcon[c.kind];
  ctx.fillStyle = col; rr(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64, 4); ctx.fill();
  ctx.fillStyle = "#1a0f07"; ctx.font = `bold ${Math.round(s * 0.42)}px Nunito, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(ic, 0, 1);
  ctx.restore();
}

function handleEvents(events, v) {
  for (const e of events) {
    if (e.type === "hit" || e.type === "ko") {
      for (let i = 0; i < (e.type === "ko" ? 22 : 10); i++) {
        const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 200;
        fx.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, col: e.type === "ko" ? "#ff8c2a" : "#ffcf99" });
      }
      fx.pops.push({ x: e.x, y: e.y, text: e.type === "ko" ? "TUNG!!" : "BONK", life: 1, col: e.type === "ko" ? "#ff8c2a" : "#fff3e0" });
      fx.shake = e.type === "ko" ? 12 : 5;
    } else if (e.type === "shieldPop") fx.pops.push({ x: e.x, y: e.y, text: "BLOCKED", life: 1, col: "#7cc4ff" });
    else if (e.type === "crate") fx.pops.push({ x: e.x, y: e.y, text: { grow: "GROW!", shrink: "SHRINK!", shield: "SHIELD!", double: "DOUBLE BATS!" }[e.kind], life: 1, col: crateIcon[e.kind][1] });
    else if (e.type === "batBreak") for (let i = 0; i < 5; i++) fx.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.4, col: "#e0b07a" });
  }
}

function updateHud(v) {
  const s = app.session;
  const mine = s ? s.mySeats : [];
  $("scoreboard").innerHTML = v.tungs.map((t) => {
    const col = COLORS[t.c].color;
    const key = s && s.local ? (s.humanSeats.find((h) => h.seat === t.id) || {}).label : null;
    return `<div class="sb ${t.alive ? "" : "out"}" style="color:${col}"><span class="ty" title="${TYPES[t.type]?.name || ""}">${TYPES[t.type]?.icon || ""}</span><span class="n">${escapeHtml(t.name)}${s && s.online && mine.includes(t.id) ? " (you)" : ""}</span>
      <span class="h">${hearts(t.hp)}</span>${t.wins ? `<span class="w">🏆${t.wins}</span>` : ""}${key ? `<kbd class="k">${key}</kbd>` : ""}</div>`;
  }).join("");

  const name = (id) => { const t = v.tungs.find((x) => x.id === id); return t ? t.name : "?"; };
  let text = "";
  if (v.phase === "countdown") text = `${v.round > 1 ? "AGAIN!" : "GET READY"}\n<small>${Math.ceil(v.phaseMs / 600) || "GO!"}</small>`;
  else if (v.phase === "roundEnd") text = v.matchWinner !== null && v.matchWinner !== undefined ? `${name(v.matchWinner)}\nWINS!` : "DRAW!\n<small>nobody survived… going again</small>";
  else if (v.phase === "matchEnd") text = `${name(v.matchWinner)}\nWINS!`;
  else if (v.phase === "play" && mine.length && mine.every((id) => { const t = v.tungs.find((x) => x.id === id); return t && !t.alive; })) text = "OUT!\n<small>watching the rest of the round…</small>";
  $("banner").innerHTML = text.split("\n").map((l, i) => i === 0 ? escapeHtml(l) : l).join("\n");
  $("end-buttons").hidden = !(v.phase === "matchEnd" && s && !s.online);

  if (v.phase === "matchEnd" && s) {
    if (s.online) reportOnline(s, v);
    else if (s.single && !s.recorded) {
      s.recorded = true;
      const me = v.tungs.find((t) => t.id === s.mySeats[0]);
      if (me && window.TungMP && TungMP.user) TungMP.submitSolo({ game: "dizzy", result: v.matchWinner === me.id ? "win" : "loss" });
    }
  }
}
function hearts(n) { n = Math.max(0, n); return n > 5 ? `♥×${n}` : "♥".repeat(n); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

let last = performance.now();
function frame(now) {
  const dt = Math.min(100, now - last); last = now;
  if (!app.session) { requestAnimationFrame(frame); return; }
  const W = innerWidth, H = innerHeight;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.fillStyle = "#1a0f07"; ctx.fillRect(0, 0, W, H);
  // fit the arena on screen (room at the top for the scoreboard)
  const top = 46, pad = 10;
  const scale = Math.min((W - pad * 2) / map.w, (H - top - pad * 2) / map.h);
  const ox = (W - map.w * scale) / 2, oy = top + (H - top - map.h * scale) / 2;

  const s = app.session;
  let v = null;
  if (s) { s.tick(dt); v = s.view(); if (v) handleEvents(s.takeEvents(), v); }

  fx.shake *= Math.pow(0.003, dt / 1000);
  ctx.save();
  ctx.translate(ox + (Math.random() - 0.5) * fx.shake, oy + (Math.random() - 0.5) * fx.shake);
  ctx.scale(scale, scale);
  drawFloor();
  if (v) {
    for (const c of v.crates) drawCrate(c, now);
    for (const t of v.tungs) if (!t.alive && !t.left) drawTung(t, now);
    for (const t of v.tungs) if (t.alive) drawTung(t, now);
    for (const b of v.bats) { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.s); ctx.translate(-16, 0); drawBatShape(32, COLORS[v.tungs[b.o]?.c ?? 0].color); ctx.restore(); }
  }
  // particles + popups
  for (const p of fx.parts) { p.life -= dt / 1000; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; ctx.globalAlpha = Math.max(0, p.life / 0.6); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  fx.parts = fx.parts.filter((p) => p.life > 0);
  for (const p of fx.pops) {
    p.life -= dt / 900;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    ctx.font = "22px Bungee, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 5; ctx.strokeStyle = "#1a0f07"; ctx.fillStyle = p.col;
    const y = p.y - 40 - (1 - p.life) * 40;
    ctx.strokeText(p.text, p.x, y); ctx.fillText(p.text, p.x, y);
  }
  ctx.globalAlpha = 1;
  fx.pops = fx.pops.filter((p) => p.life > 0);
  ctx.restore();

  if (v) updateHud(v);
  else { $("scoreboard").innerHTML = ""; $("banner").innerHTML = "GET READY"; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ================= Multiplayer (challenges and rooms from the site) =================
np = NetPlay.attach({
  game: "dizzy", rooms: true, panel: $("mpPanel"), menu: $("menu"), play: $("stage"),
  onModeChange() { if (app.session && !app.session.online) toMenu(); },
  onPrepare(c) {
    if (app.session) app.session.quit();
    fx.parts = []; fx.pops = []; fx.shake = 0;
    app.session = c.host ? new HostSession(c) : new GuestSession(c);
    $("end-buttons").hidden = true; $("result").hidden = true; $("touch-zones").innerHTML = "";
  },
  onStart() { const s = app.session; if (s && s.isHost && !s.game) s.start(); },
  onStop() {},
  onExit() { if (app.session) app.session.quit(); app.session = null; $("result").hidden = true; },
  onNet(from, d) {
    const s = app.session; if (!s || !d) return;
    if (s.isHost) s.remote(from, d); else if (d.k === "s") s.push(d);
  },
  onLeft(id) { const s = app.session; if (s && s.isHost) s.left(id); },
  onRoomEnd(m) {
    const rows = m.ranking.map((r) => `<tr class="${r.place === 1 ? "win" : ""}"><td>${r.place}</td><td>${NetPlay.avatarHtml(r.avatar)} ${NetPlay.esc(r.username)}</td></tr>`).join("");
    showResult(m.reason === "host_left" ? "Host left" : (m.ranking[0].id === m.you ? "🏆 You win!" : "Match over"), `<table>${rows}</table>`, [["Back to the room", toMenu]]);
  },
});
window.__dizzy = () => ({ app, np, myType });
