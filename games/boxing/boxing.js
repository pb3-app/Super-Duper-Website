// Tung Boxing - browser side: menus, first-person drawing, controls, single player + online
import { Match, Brain, CHARACTERS, OPPONENTS, RULES, damageForCharge } from "./engine.js";

const $ = (id) => document.getElementById(id);
const canvas = $("ring");
const ctx = canvas.getContext("2d");

// ================= App state =================
const app = {
  mode: null,        // "single" | "online"
  charId: null,
  fight: null,       // LocalFight | OnlineFight
  socket: null
};

try { $("name").value = localStorage.getItem("tungName") || ""; } catch {}
function playerName() {
  const n = $("name").value.trim().slice(0, 16);
  try { localStorage.setItem("tungName", n); } catch {}
  return n || "Tung" + Math.floor(Math.random() * 1000);
}

// ================= Screens =================
const screens = ["scr-mode", "scr-char", "scr-opp", "scr-online"];
function show(id) {
  for (const s of screens) $(s).hidden = s !== id;
  $("hud").hidden = true;
}
function showHud() { for (const s of screens) $(s).hidden = true; $("hud").hidden = false; }

document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
  app.mode = b.dataset.mode;
  playerName();
  show("scr-char");
}));
document.querySelectorAll(".back").forEach((b) => b.addEventListener("click", () => {
  const cur = screens.find((s) => !$(s).hidden);
  if (cur === "scr-char") show("scr-mode");
  else if (cur === "scr-opp" || cur === "scr-online") { leaveOnline(); show("scr-char"); }
}));

// Character cards
for (const [id, c] of Object.entries(CHARACTERS)) {
  const card = document.createElement("button");
  card.className = "card";
  card.innerHTML = `<canvas width="220" height="220"></canvas><div class="nm" style="color:${c.color}">${c.name}</div><ul>${c.perks.map((p) => `<li>${p}</li>`).join("")}</ul>`;
  drawTungIcon(card.querySelector("canvas"), c.color);
  card.addEventListener("click", () => {
    app.charId = id;
    if (app.mode === "single") show("scr-opp");
    else openOnline();
  });
  $("char-cards").appendChild(card);
}

// Opponent cards
for (const o of OPPONENTS) {
  const card = document.createElement("button");
  card.className = "card";
  card.innerHTML = `<canvas width="220" height="220"></canvas><div class="lvl">LEVEL ${o.level}</div><div class="nm" style="color:${o.level === 5 ? "#c9c2b8" : o.color}">${o.name}</div>
    <div class="stars">${"★".repeat(o.level)}${"☆".repeat(5 - o.level)}</div><ul><li>Dodges about ${Math.round(o.dodgeChance * 100)}% of punches</li><li>${["Worst opponent", "A bit harder", "Medium difficulty", "Pretty hard", "Super hard"][o.level - 1]}</li></ul>`;
  drawTungIcon(card.querySelector("canvas"), o.color);
  card.addEventListener("click", () => startLocal(o));
  $("opp-cards").appendChild(card);
}

// ================= Single player =================
class LocalFight {
  constructor(myDef, foeDef) {
    this.match = new Match(myDef, foeDef);
    this.brain = new Brain(this.match, 1, foeDef);
    this.myDef = myDef; this.foeDef = foeDef;
    this.countdown = 2400; // ms before the bell
    this.acc = 0;
    this.events = [];
  }
  get started() { return this.countdown <= 0; }
  tick(dt) {
    this.countdown -= dt;
    if (this.countdown > 0) return;
    this.acc += Math.min(dt, 100);
    while (this.acc >= 5) {
      this.brain.update();
      this.match.update(5);
      this.acc -= 5;
    }
    for (const e of this.match.takeEvents()) this.events.push({ ...e, mine: e.who === 0 });
  }
  view() { const s = this.match.snapshot(); return { me: s.f[0], foe: s.f[1], winner: s.winner === null ? null : s.winner === 0 }; }
  takeEvents() { const e = this.events; this.events = []; return e; }
  press(h) { if (this.started) this.match.press(0, h); }
  release(h) { if (this.started) this.match.release(0, h); }
  dodge(d) { if (this.started) this.match.dodgePress(0, d); }
  quit() {}
}

function startLocal(opp) {
  const myDef = CHARACTERS[app.charId];
  app.fight = new LocalFight(myDef, opp);
  beginFight(playerName(), myDef, opp.name, opp);
}

// ================= Online =================
class OnlineFight {
  constructor(socket, info) {
    this.socket = socket;
    this.you = info.you;
    this.myDef = CHARACTERS[info.chars[info.you]];
    this.foeDef = CHARACTERS[info.chars[1 - info.you]];
    this.countdown = info.countdown;
    this.snap = null; this.snapAt = 0;
    this.events = [];
    this.winner = null;
    this.onState = (s) => { this.snap = s; this.snapAt = performance.now(); };
    this.onEvents = (list) => { for (const e of list) this.events.push({ ...e, mine: e.who === this.you }); };
    this.onEnd = (d) => { this.winner = d.winner === this.you; if (d.forfeit) this.events.push({ type: "forfeit", mine: d.winner === this.you }); };
    socket.on("state", this.onState);
    socket.on("events", this.onEvents);
    socket.on("end", this.onEnd);
  }
  get started() { return this.countdown <= 0; }
  tick(dt) { this.countdown -= dt; }
  view() {
    if (!this.snap) return null;
    // move timers forward by the time since the last update so animations stay smooth
    const age = Math.min(80, performance.now() - this.snapAt);
    const adv = (f) => {
      const g = { ...f };
      if (g.state === "striking" || g.state === "dodging" || g.state === "dodgeStartup" || g.state === "stunned") g.timer = Math.max(0, g.timer - age);
      if (g.state === "charging") g.chargeMs += age;
      g.punchCd = Math.max(0, g.punchCd - age); g.dodgeCd = Math.max(0, g.dodgeCd - age);
      return g;
    };
    return { me: adv(this.snap.f[this.you]), foe: adv(this.snap.f[1 - this.you]), winner: this.winner };
  }
  takeEvents() { const e = this.events; this.events = []; return e; }
  press(h) { if (this.started) this.socket.emit("in", { k: "p", h }); }
  release(h) { if (this.started) this.socket.emit("in", { k: "r", h }); }
  dodge(d) { if (this.started) this.socket.emit("in", { k: "d", d }); }
  quit() {
    this.socket.off("state", this.onState); this.socket.off("events", this.onEvents); this.socket.off("end", this.onEnd);
    this.socket.emit("leave");
  }
}

function connectOnline() {
  if (app.socket) return app.socket;
  if (typeof io === "undefined") { $("online-status").textContent = "Couldn't load the online library."; return null; }
  const s = io((window.GAME_SERVER_URL || "") + "/boxing", { transports: ["websocket"] });
  app.socket = s;
  s.on("connect_error", () => setOnlineStatus("Can't reach the game server. Is it running?"));
  s.on("waiting", () => setOnlineStatus("Looking for an opponent…"));
  s.on("room", (d) => setOnlineStatus(`Room code: <b>${d.code}</b><br>Send this code to your friend.`));
  s.on("joinError", (d) => setOnlineStatus(d.msg));
  s.on("start", (info) => {
    app.fight = new OnlineFight(s, info);
    beginFight(info.names[info.you], app.fight.myDef, info.names[1 - info.you], app.fight.foeDef);
  });
  return s;
}
function setOnlineStatus(html) { $("online-status").innerHTML = html; setOnlineBusy(!/Can't|not found|full|Couldn't/.test(html)); }
function setOnlineBusy(b) { for (const id of ["btn-quick", "btn-create", "btn-join"]) $(id).disabled = b; }

function openOnline() {
  const c = CHARACTERS[app.charId];
  $("online-you").innerHTML = `Playing as <b style="color:${c.color}">${c.name}</b>`;
  $("online-status").textContent = "";
  setOnlineBusy(false);
  show("scr-online");
  connectOnline();
}
function leaveOnline() { if (app.socket) app.socket.emit("leave"); setOnlineBusy(false); $("online-status").textContent = ""; }

$("btn-quick").addEventListener("click", () => { const s = connectOnline(); if (!s) return; setOnlineStatus("Connecting…"); s.emit("quick", { char: app.charId, name: playerName() }); });
$("btn-create").addEventListener("click", () => { const s = connectOnline(); if (!s) return; setOnlineStatus("Creating room…"); s.emit("create", { char: app.charId, name: playerName() }); });
$("btn-join").addEventListener("click", () => {
  const code = $("room-code").value.trim().toUpperCase();
  if (code.length !== 4) { $("online-status").textContent = "Type the 4-letter room code first."; return; }
  const s = connectOnline(); if (!s) return; setOnlineStatus("Joining…"); s.emit("join", { code, char: app.charId, name: playerName() });
});

// ================= Fight flow =================
const fx = { popups: [], shake: 0, redFlash: 0, foeFlash: 0, camX: 0, camY: 0, foeX: 0, foeY: 0, endAt: 0, banner: "", bannerUntil: 0 };
let names = { me: "", foe: "" };

function beginFight(myName, myDef, foeName, foeDef) {
  names = { me: myName, foe: foeName, myDef, foeDef };
  Object.assign(fx, { popups: [], shake: 0, redFlash: 0, foeFlash: 0, endAt: 0, banner: "", bannerUntil: 0 });
  $("hud-me-name").textContent = myName;
  $("hud-me-name").style.color = myDef.color;
  $("hud-foe-name").textContent = foeName;
  $("hud-foe-name").style.color = foeDef.level === 5 ? "#c9c2b8" : foeDef.color;
  $("touch-down").hidden = !myDef.canDodgeDown;
  showHud();
}

function endFightToMenu() {
  if (app.fight) app.fight.quit();
  app.fight = null;
  $("center-text").textContent = "";
  show("scr-char");
}
$("quit").addEventListener("click", endFightToMenu);

function popup(text, x, y, color, size = 1) { fx.popups.push({ text, x, y, color, size, life: 1 }); }

function handleEvents(events, view) {
  const W = innerWidth, H = innerHeight;
  for (const e of events) {
    if (e.type === "hit") {
      if (e.mine) {
        fx.foeFlash = 1;
        let label = "-" + e.damage;
        if (e.special === "jackpot") label = "JACKPOT! 1 HP";
        else if (e.special === "lucky") label = "LUCKY -" + e.damage;
        else if (e.special === "weak") label = "WEAK -" + e.damage;
        popup(label, W / 2 + (Math.random() - 0.5) * 80, H * 0.3, e.special === "jackpot" ? "#ff4fd8" : "#ffcf99", e.special === "jackpot" ? 1.4 : 1);
        if (e.counter) popup("COUNTER! +" + RULES.COUNTER_BONUS_DAMAGE, W / 2, H * 0.2, "#ffd34a", 1.1);
      } else {
        fx.redFlash = 1; fx.shake = 14 + e.damage * 3;
        let label = "-" + e.damage;
        if (e.special === "jackpot") label = "JACKPOT… 1 HP";
        popup(label, W / 2, H * 0.62, "#ff6b5b", 1.2);
      }
    } else if (e.type === "dodged") {
      if (e.mine) popup("DODGED! HIT BACK NOW!", W / 2, H * 0.4, "#7be38a", 0.9);
      else popup("MISSED, OFF BALANCE!", W / 2, H * 0.3, "#ff6b5b", 0.8);
    } else if (e.type === "parry") {
      if (e.mine) { popup("PARRY!", W / 2, H * 0.35, "#ffd34a", 1.6); fx.shake = 8; }
      else popup("PARRIED!", W / 2, H * 0.55, "#ff6b5b", 1.3);
    } else if (e.type === "ko" || e.type === "forfeit") {
      fx.endAt = performance.now();
      fx.banner = e.mine ? "K.O.!\nYOU WIN" : "K.O.\nYOU LOSE";
      if (e.type === "forfeit") fx.banner = e.mine ? "OPPONENT LEFT\nYOU WIN" : "YOU LEFT";
    }
  }
}

// ================= Controls =================
const keyMap = {
  KeyA: ["dodge", "L"], ArrowLeft: ["dodge", "L"],
  KeyD: ["dodge", "R"], ArrowRight: ["dodge", "R"],
  KeyS: ["dodge", "D"], ArrowDown: ["dodge", "D"],
  KeyJ: ["punch", "L"], KeyK: ["punch", "R"]
};
window.addEventListener("keydown", (e) => {
  if (!app.fight || e.target.tagName === "INPUT") return;
  const k = keyMap[e.code];
  if (!k) return;
  e.preventDefault();
  if (e.repeat) return;
  if (k[0] === "dodge") app.fight.dodge(k[1]); else app.fight.press(k[1]);
});
window.addEventListener("keyup", (e) => {
  if (!app.fight) return;
  const k = keyMap[e.code];
  if (k && k[0] === "punch") app.fight.release(k[1]);
});
canvas.addEventListener("mousedown", (e) => { if (app.fight && (e.button === 0 || e.button === 2)) app.fight.press(e.button === 0 ? "L" : "R"); });
window.addEventListener("mouseup", (e) => { if (app.fight && (e.button === 0 || e.button === 2)) app.fight.release(e.button === 0 ? "L" : "R"); });
window.addEventListener("contextmenu", (e) => { if (app.fight) e.preventDefault(); });
document.querySelectorAll("#touch button").forEach((b) => {
  const [kind, arg] = b.dataset.act.split("-");
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); if (!app.fight) return; if (kind === "dodge") app.fight.dodge(arg); else app.fight.press(arg); });
  const up = (e) => { e.preventDefault(); if (app.fight && kind === "punch") app.fight.release(arg); };
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("pointerleave", up);
});
window.addEventListener("blur", () => { if (app.fight) { app.fight.release("L"); app.fight.release("R"); } });

// ================= Drawing helpers =================
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// A tung (wooden log with a face), front view. (x, y) = center of body, s = height.
function drawTung(c, x, y, s, color, o = {}) {
  const w = s * 0.56, h = s;
  const dark = color === "#26221f";
  const outline = "#1a0f07";
  c.save();
  c.translate(x, y);
  if (o.tilt) c.rotate(o.tilt);
  // body
  const grad = c.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, shade(color, -0.25)); grad.addColorStop(0.45, shade(color, 0.08)); grad.addColorStop(1, shade(color, -0.35));
  c.fillStyle = grad; c.strokeStyle = outline; c.lineWidth = s * 0.018;
  rr(c, -w / 2, -h / 2, w, h, w * 0.22); c.fill(); c.stroke();
  // log top rings
  c.fillStyle = shade(color, dark ? 0.15 : 0.25);
  c.beginPath(); c.ellipse(0, -h / 2 + s * 0.02, w * 0.46, s * 0.05, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = shade(color, -0.3); c.lineWidth = s * 0.008;
  c.beginPath(); c.ellipse(0, -h / 2 + s * 0.02, w * 0.26, s * 0.025, 0, 0, Math.PI * 2); c.stroke();
  // grain
  c.strokeStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(40,20,5,0.22)"; c.lineWidth = s * 0.01;
  for (const gx of [-0.3, -0.12, 0.2, 0.34]) {
    c.beginPath(); c.moveTo(gx * w, -h * 0.3); c.bezierCurveTo(gx * w + s * 0.02, -h * 0.05, gx * w - s * 0.02, h * 0.1, gx * w, h * 0.42); c.stroke();
  }
  // flash when hit
  if (o.flash > 0) { c.globalAlpha = o.flash * 0.7; c.fillStyle = "#fff"; rr(c, -w / 2, -h / 2, w, h, w * 0.22); c.fill(); c.globalAlpha = 1; }
  // face
  const ey = -h * 0.16, ex = w * 0.2, er = s * 0.075;
  for (const sx of [-1, 1]) {
    c.fillStyle = "#fff"; c.strokeStyle = outline; c.lineWidth = s * 0.012;
    c.beginPath(); c.ellipse(sx * ex, ey, er, er * 1.15, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    if (o.dizzy) {
      c.strokeStyle = outline; c.lineWidth = s * 0.012; c.beginPath();
      const t = performance.now() / 120;
      for (let a = 0; a < 9; a += 0.3) c.lineTo(sx * ex + Math.cos(a + t) * a * er * 0.09, ey + Math.sin(a + t) * a * er * 0.09);
      c.stroke();
    } else {
      c.fillStyle = dark ? "#e0302a" : outline;
      c.beginPath(); c.arc(sx * ex + (o.lookX || 0) * er * 0.35, ey + er * 0.15, er * 0.45, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#fff"; c.beginPath(); c.arc(sx * ex + er * 0.1, ey, er * 0.13, 0, Math.PI * 2); c.fill();
    }
    // angry brows
    c.strokeStyle = outline; c.lineWidth = s * 0.03; c.lineCap = "round";
    c.beginPath(); c.moveTo(sx * (ex + er * 1.1), ey - er * 1.45); c.lineTo(sx * (ex - er * 0.9), ey - er * (o.hurt ? 1.6 : 1.05)); c.stroke();
  }
  // mouth
  c.strokeStyle = outline; c.lineWidth = s * 0.02; c.fillStyle = "#3a1408";
  c.beginPath();
  if (o.hurt || o.dizzy) { c.ellipse(0, h * 0.06, w * 0.09, s * 0.05, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
  else { c.moveTo(-w * 0.17, h * 0.05); c.quadraticCurveTo(0, h * 0.0, w * 0.17, h * 0.07); c.stroke(); }
  c.restore();
}

function drawGlove(c, x, y, r, color, glow = 0, label = null, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  if (glow > 0) {
    c.shadowColor = glow > 0.7 ? "#ff3b1f" : glow > 0.35 ? "#ff8c2a" : "#ffd34a";
    c.shadowBlur = r * (0.4 + glow);
  }
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(color, 0.35)); g.addColorStop(1, shade(color, -0.25));
  c.fillStyle = g; c.strokeStyle = "#1a0f07"; c.lineWidth = Math.max(2, r * 0.07);
  c.beginPath(); c.ellipse(x, y, r, r * 0.92, 0, 0, Math.PI * 2); c.fill();
  c.shadowBlur = 0; c.stroke();
  // thumb + cuff
  c.beginPath(); c.ellipse(x - r * 0.55, y + r * 0.1, r * 0.32, r * 0.42, -0.4, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = "#fff3e0"; rr(c, x - r * 0.55, y + r * 0.62, r * 1.1, r * 0.38, r * 0.12); c.fill(); c.stroke();
  if (label) {
    c.fillStyle = "#fff"; c.strokeStyle = "#1a0f07"; c.lineWidth = Math.max(3, r * 0.1);
    c.font = `${Math.round(r * 0.75)}px Bungee, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    c.strokeText(label, x, y - r * 0.05); c.fillText(label, x, y - r * 0.05);
  }
  c.restore();
}

function drawTungIcon(cv, color) {
  const c = cv.getContext("2d");
  const draw = () => { c.clearRect(0, 0, cv.width, cv.height); drawTung(c, cv.width / 2, cv.height * 0.52, cv.height * 0.8, color); };
  draw();
  if (document.fonts) document.fonts.ready.then(draw);
}

// ================= Fight rendering =================
function resize() { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; }
addEventListener("resize", resize); resize();

function drawBackground(W, H, px, py) {
  // crowd / darkness
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#120a05"); sky.addColorStop(0.55, "#2b1a0e"); sky.addColorStop(1, "#4a2e17");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // spotlight
  const spot = ctx.createRadialGradient(W / 2 + px * 0.3, H * 0.15, 10, W / 2 + px * 0.3, H * 0.5, Math.max(W, H) * 0.7);
  spot.addColorStop(0, "rgba(255, 220, 160, 0.28)"); spot.addColorStop(1, "rgba(255, 220, 160, 0)");
  ctx.fillStyle = spot; ctx.fillRect(0, 0, W, H);
  // crowd heads
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  for (let i = -2; i < 26; i++) {
    const x = (i * W) / 22 + px * 0.25, y = H * 0.36 + py * 0.25 + (i % 3) * 8;
    ctx.beginPath(); ctx.arc(x, y, W / 40, 0, Math.PI * 2); ctx.fill();
  }
  // ring floor
  ctx.fillStyle = "#6b4423";
  ctx.beginPath(); ctx.moveTo(-W, H * 0.62 + py * 0.6); ctx.lineTo(W * 2, H * 0.62 + py * 0.6); ctx.lineTo(W * 2, H); ctx.lineTo(-W, H); ctx.fill();
  ctx.strokeStyle = "rgba(40,20,5,0.35)"; ctx.lineWidth = 3;
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(W / 2 + px * 0.6 + i * W * 0.07, H * 0.62 + py * 0.6); ctx.lineTo(W / 2 + px + i * W * 0.3, H); ctx.stroke();
  }
  // ropes
  const ropeCols = ["#ff8c2a", "#fff3e0", "#ff8c2a"];
  for (let i = 0; i < 3; i++) {
    const y = H * (0.42 + i * 0.07) + py * 0.5;
    ctx.strokeStyle = ropeCols[i]; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(W / 2 + px * 0.5, y + 12, W, y); ctx.stroke();
  }
  // "TUNG TUNG SAHUR" banner on the far wall
  ctx.fillStyle = "rgba(255, 140, 42, 0.18)";
  ctx.font = `${Math.round(W / 16)}px Bungee, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("TUNG TUNG TUNG SAHUR", W / 2 + px * 0.3, H * 0.14 + py * 0.3);
}

function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t) { return t * t; }

let last = performance.now();
function frame(now) {
  const dt = Math.min(100, now - last); last = now;
  const f = app.fight;
  if (f) {
    f.tick(dt);
    const v = f.view();
    if (v) {
      handleEvents(f.takeEvents(), v);
      render(v, dt, f);
      updateHud(v, f);
      if (fx.endAt && now - fx.endAt > 2800) endFightToMenu();
    } else { renderIdle(dt); }
  } else renderIdle(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function renderIdle(dt) {
  const W = innerWidth, H = innerHeight;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  drawBackground(W, H, Math.sin(performance.now() / 2000) * 30, 0);
}

function render(v, dt, f) {
  const W = innerWidth, H = innerHeight;
  const S = Math.min(W, H * 1.25);
  const me = v.me, foe = v.foe;
  const k = 1 - Math.pow(0.0001, dt / 1000); // smoothing factor

  // --- my dodge moves the camera ---
  let tx = 0, ty = 0;
  if (me.state === "dodging" || me.state === "dodgeStartup") {
    const amt = me.state === "dodging" ? 1 : 0.35;
    if (me.dir === "L") tx = W * 0.3 * amt;      // I move left -> world slides right
    if (me.dir === "R") tx = -W * 0.3 * amt;
    if (me.dir === "D") ty = -H * 0.28 * amt;    // I duck -> world slides up
  }
  fx.camX = lerp(fx.camX, tx, Math.min(1, k * 2.2));
  fx.camY = lerp(fx.camY, ty, Math.min(1, k * 2.2));
  // --- opponent's dodge moves them ---
  let fxT = 0, fyT = 0;
  if (foe.state === "dodging" || foe.state === "dodgeStartup") {
    const amt = foe.state === "dodging" ? 1 : 0.35;
    if (foe.dir === "L") fxT = S * 0.28 * amt;   // their left is my right
    if (foe.dir === "R") fxT = -S * 0.28 * amt;
    if (foe.dir === "D") fyT = S * 0.25 * amt;
  }
  fx.foeX = lerp(fx.foeX, fxT, Math.min(1, k * 2.2));
  fx.foeY = lerp(fx.foeY, fyT, Math.min(1, k * 2.2));

  fx.shake *= Math.pow(0.002, dt / 1000);
  fx.redFlash = Math.max(0, fx.redFlash - dt / 350);
  fx.foeFlash = Math.max(0, fx.foeFlash - dt / 200);
  const sx = (Math.random() - 0.5) * fx.shake, sy = (Math.random() - 0.5) * fx.shake;

  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.save();
  ctx.translate(sx, sy);
  drawBackground(W, H, fx.camX, fx.camY);

  // --- opponent ---
  const t = performance.now();
  const bob = Math.sin(t / 260) * S * 0.008;
  const ox = W / 2 + fx.camX + fx.foeX, oy = H * 0.5 + fx.camY + fx.foeY + bob;
  const foeColor = names.foeDef.color;
  const bodyH = S * 0.5;
  const stunned = foe.state === "stunned";
  const wobble = stunned ? Math.sin(t / 180) * 0.08 : foe.offBalanceMs > 0 ? Math.sin(t / 70) * 0.06 : 0;
  drawTung(ctx, ox, oy, bodyH, foeColor, { flash: fx.foeFlash, dizzy: stunned, hurt: fx.foeFlash > 0.2 || foe.offBalanceMs > 0, tilt: wobble });
  if (stunned) {
    for (let i = 0; i < 4; i++) {
      const a = t / 300 + (i * Math.PI) / 2;
      ctx.fillStyle = "#ffd34a"; ctx.font = `${Math.round(S * 0.04)}px Bungee, sans-serif`; ctx.textAlign = "center";
      ctx.fillText("★", ox + Math.cos(a) * bodyH * 0.35, oy - bodyH * 0.58 + Math.sin(a) * bodyH * 0.08);
    }
  }

  // opponent gloves. Their LEFT hand is on MY right side of the screen.
  for (const hand of ["L", "R"]) {
    const side = hand === "L" ? 1 : -1;
    let gx = ox + side * bodyH * 0.42, gy = oy + bodyH * 0.12, gr = S * 0.065;
    let glow = 0, label = null;
    if (foe.hand === hand && foe.state === "charging") {
      const dmg = damageForCharge(statsOf(names.foeDef), foe.chargeMs);
      const shakeAmt = Math.min(1, foe.chargeMs / 1200) * S * 0.012;
      gx = ox + side * bodyH * 0.5 + (Math.random() - 0.5) * shakeAmt;
      gy = oy - bodyH * 0.05 + (Math.random() - 0.5) * shakeAmt;
      gr = S * 0.058;
      glow = Math.min(1, (dmg - 1) / 4);
      label = dmg > 1 ? String(dmg) : null;
    } else if (foe.hand === hand && foe.state === "striking") {
      const p = ease(1 - foe.timer / Math.max(1, foe.strikeTotal));
      // flies toward where my head was (center of the screen, shifted by my dodge)
      const targetX = W / 2 + fx.camX + side * S * 0.1, targetY = H * 0.5 + fx.camY;
      gx = lerp(ox + side * bodyH * 0.45, targetX, p);
      gy = lerp(oy, targetY, p);
      gr = lerp(S * 0.06, S * 0.36, p);
      glow = Math.min(1, (foe.damage - 1) / 4);
      label = foe.damage > 1 ? String(foe.damage) : null;
    }
    drawGlove(ctx, gx, gy, gr, foeGloveColor(), glow, label);
  }
  ctx.restore();

  // --- my gloves (bottom of the screen) ---
  const myStats = statsOf(names.myDef);
  for (const hand of ["L", "R"]) {
    const side = hand === "L" ? -1 : 1;
    let gx = W / 2 + side * Math.min(W * 0.3, S * 0.42), gy = H * 0.9 + Math.sin(t / 300 + side) * 4, gr = S * 0.11;
    let glow = 0, label = null, alpha = 1;
    if (me.hand === hand && me.state === "charging") {
      const dmg = damageForCharge(myStats, me.chargeMs);
      const shk = Math.min(1, me.chargeMs / 1200) * 6;
      gy += S * 0.04; gx -= side * S * 0.02;
      gx += (Math.random() - 0.5) * shk; gy += (Math.random() - 0.5) * shk;
      glow = Math.min(1, (dmg - 1) / Math.max(1, myStats.maxDamage - 1));
      label = String(dmg);
    } else if (me.hand === hand && me.state === "striking") {
      const p = ease(1 - me.timer / Math.max(1, me.strikeTotal));
      gx = lerp(gx, ox + side * S * 0.05 - fx.foeX * 0, p);
      gy = lerp(gy, oy - bodyH * 0.12, p);
      gr = lerp(gr, S * 0.05, p);
      glow = Math.min(1, (me.damage - 1) / Math.max(1, myStats.maxDamage - 1));
    } else if (me.punchCd > 0 || me.state === "stunned") {
      alpha = 0.55;
    }
    if (me.counterMs > 0 && me.state === "idle") glow = Math.max(glow, 0.5);
    drawGlove(ctx, gx, gy, gr, names.myDef.color, glow, label, alpha);
  }

  // ready indicators
  const readyY = H - 18;
  const tired = me.flurry >= 2;
  pill(W / 2 - 60, readyY, tired && me.punchCd > 0 ? "TIRED" : "PUNCH", me.punchCd <= 0 && me.state !== "stunned", me.counterMs > 0 ? "#ffd34a" : "#7be38a", tired && me.punchCd > 0);
  pill(W / 2 + 60, readyY, me.offBalanceMs > 0 ? "OFF BAL." : "DODGE", me.dodgeCd <= 0 && (me.state === "idle" || me.state === "charging"), "#7be38a", me.offBalanceMs > 0);
  if (me.counterMs > 0) {
    ctx.fillStyle = "#ffd34a"; ctx.font = "18px Bungee, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(foe.offBalanceMs > 0 ? "THEY'RE OPEN! COUNTER +" + RULES.COUNTER_BONUS_DAMAGE : "COUNTER NOW! +" + RULES.COUNTER_BONUS_DAMAGE, W / 2, readyY - 28);
  }
  if (me.state === "stunned") { ctx.fillStyle = "#ff6b5b"; ctx.font = "22px Bungee, sans-serif"; ctx.textAlign = "center"; ctx.fillText("STUNNED!", W / 2, H * 0.75); }

  // red flash when I'm hit
  if (fx.redFlash > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, "rgba(229,72,60,0)"); g.addColorStop(1, `rgba(229,72,60,${0.65 * fx.redFlash})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // popups
  for (const p of fx.popups) {
    p.life -= dt / 900;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    ctx.font = `${Math.round(30 * p.size)}px Bungee, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 6; ctx.strokeStyle = "#1a0f07"; ctx.fillStyle = p.color;
    const y = p.y - (1 - p.life) * 50;
    ctx.strokeText(p.text, p.x, y); ctx.fillText(p.text, p.x, y);
    ctx.globalAlpha = 1;
  }
  fx.popups = fx.popups.filter((p) => p.life > 0);

  // center text: countdown or KO
  const ct = $("center-text");
  if (!f.started) {
    const n = Math.ceil(f.countdown / 800);
    ct.textContent = n > 0 ? String(n) : "";
  } else if (fx.endAt) {
    ct.textContent = fx.banner;
  } else if (f.countdown > -700) {
    ct.textContent = "FIGHT!";
  } else ct.textContent = "";
}

function pill(x, y, text, ready, color, warn = false) {
  ctx.save();
  ctx.font = "12px Bungee, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = ready ? color : warn ? "rgba(229,72,60,0.8)" : "rgba(0,0,0,0.5)";
  rr(ctx, x - 44, y - 11, 88, 22, 11); ctx.fill();
  ctx.fillStyle = ready ? "#1a0f07" : warn ? "#fff3e0" : "rgba(255,243,224,0.5)";
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

function foeGloveColor() {
  const c = names.foeDef.color;
  return c === "#f2efe8" ? "#d9d2c5" : c;
}

const statsCache = new Map();
function statsOf(def) {
  if (!statsCache.has(def)) {
    const m = new Match(def, def);
    statsCache.set(def, m.f[0].s);
  }
  return statsCache.get(def);
}

function updateHud(v, f) {
  const set = (who, fighter) => {
    const pct = Math.max(0, fighter.hp / fighter.maxHp);
    const fill = $(`hud-${who}-hp`);
    fill.style.width = pct * 100 + "%";
    fill.classList.toggle("low", pct <= 0.3);
    $(`hud-${who}-num`).textContent = `${fighter.hp} / ${fighter.maxHp}`;
  };
  set("me", v.me); set("foe", v.foe);
}

show("scr-mode");
