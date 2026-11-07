// Tung Arena - browser side. The server runs the world; this page sends inputs and draws what the server says.
window.__tungArena = true; // mp.js reads this: a game started from here sends you back here when it ends
try { sessionStorage.removeItem("tungArenaReturn"); } catch (_) {}

(() => {
  const T = window.TungMP;
  const $ = (id) => document.getElementById(id);
  const canvas = $("game"), ctx = canvas.getContext("2d");
  const INTERP_DELAY = 100; // ms behind real time, so movement looks smooth

  let myId = null, arena = { w: 2600, h: 1700 }, radius = 28, holdSecs = 10;
  let logs = [];                 // the logs, from the server's welcome
  let logState = {};             // log id -> [id, how many on it, seconds left or -1]
  const snapshots = [], effects = [];
  let serverOffset = 0, camera = { x: 0, y: 0 }, joined = false;
  const input = { up: false, down: false, left: false, right: false, aim: 0 };
  const mouse = { x: 0, y: 0 };
  let touchTarget = null;

  // ---------- canvas ----------
  function resize() { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; }
  addEventListener("resize", resize); resize();

  // ---------- the login gate ----------
  function showGate(title, text, button) {
    $("gateTitle").textContent = title; $("gateText").textContent = text;
    $("gateBtn").hidden = !button; $("gate").hidden = false;
  }
  function refreshGate() {
    if (!T || T.offline) return showGate("Tung Arena needs the game server", "Start it with npm start, then reload this page.", false);
    if (!T.user) return showGate("Log in to enter Tung Arena", "Your account name shows above your tung, and the matches you start from a log count on the leaderboards.", true);
    $("gate").hidden = true;
  }
  $("gateBtn").addEventListener("click", () => T.openAuth());
  function join() { if (T && T.user) T.send({ t: "arena_join" }); }

  // ---------- messages from the server ----------
  function onMsg(m) {
    switch (m.t) {
      case "arena_welcome":
        myId = m.you; arena = m.arena; radius = m.radius; holdSecs = m.hold; logs = m.logs; joined = true;
        $("gate").hidden = true; $("scores").hidden = false;
        break;
      case "arena_state":
        serverOffset = Date.now() - m.ts;
        logState = {}; for (const l of m.logs) logState[l[0]] = l;
        snapshots.push(m); while (snapshots.length > 30) snapshots.shift();
        break;
      case "arena_event":
        if (m.type === "bonk") { effects.push({ x: m.x, y: m.y, life: 0.7, text: "TUNG!" }); feed(`${m.from} bonked ${m.to}`); }
        else if (m.type === "join") feed(`${m.name} joined`);
        else if (m.type === "leave") feed(`${m.name} left`);
        break;
      case "arena_solo":
        try { sessionStorage.setItem("tungArenaReturn", "1"); } catch (_) {}
        location.href = "/games/" + m.game + "/index.html";
        break;
      case "arena_full":
        showGate("Tung Arena is full", "Try again in a minute.", false);
        break;
    }
  }
  if (T) {
    for (const t of ["arena_welcome", "arena_state", "arena_event", "arena_solo", "arena_full"]) T.on("msg:" + t, onMsg);
    T.on("ready", () => { refreshGate(); join(); });
    T.on("logout", () => { joined = false; myId = null; snapshots.length = 0; refreshGate(); });
    T.booted.then(() => { refreshGate(); join(); });
  }
  function feed(text) {
    const div = document.createElement("div"); div.textContent = text; $("feed").appendChild(div);
    while ($("feed").children.length > 5) $("feed").firstChild.remove();
    setTimeout(() => div.remove(), 5000);
  }

  // ---------- controls ----------
  const keyMap = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right" };
  addEventListener("keydown", (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (keyMap[e.code]) { input[keyMap[e.code]] = true; e.preventDefault(); sendInput(); }
    if (e.code === "Space") { bonk(); e.preventDefault(); }
  });
  addEventListener("keyup", (e) => { if (keyMap[e.code]) { input[keyMap[e.code]] = false; sendInput(); } });
  addEventListener("blur", () => { for (const k of ["up", "down", "left", "right"]) input[k] = false; sendInput(); });
  canvas.addEventListener("pointermove", (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (e.pointerType === "touch" && touchTarget) touchTarget = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerdown", (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (e.pointerType === "touch") touchTarget = { x: e.clientX, y: e.clientY }; // touch: the tung walks towards your finger
    else bonk();
  });
  const stopTouch = () => { touchTarget = null; for (const k of ["up", "down", "left", "right"]) input[k] = false; sendInput(); };
  canvas.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") stopTouch(); });
  canvas.addEventListener("pointercancel", stopTouch);
  $("bonkBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); bonk(); });
  function bonk() { if (joined) T.send({ t: "arena_bonk" }); }

  let lastSent = "";
  function sendInput() {
    if (!joined) return;
    const me = rendered().find((p) => p.id === myId);
    if (me) input.aim = Math.atan2(mouse.y - (me.y - camera.y), mouse.x - (me.x - camera.x));
    if (touchTarget && me) {
      const dx = touchTarget.x - (me.x - camera.x), dy = touchTarget.y - (me.y - camera.y);
      input.left = dx < -24; input.right = dx > 24; input.up = dy < -24; input.down = dy > 24;
      input.aim = Math.atan2(dy, dx);
    }
    const i = { up: input.up, down: input.down, left: input.left, right: input.right, aim: Math.round(input.aim * 100) / 100 };
    const key = JSON.stringify(i);
    if (key === lastSent && Math.random() > 0.2) return; // resend now and then, in case one was lost
    lastSent = key;
    T.send({ t: "arena_input", i });
  }
  setInterval(sendInput, 50);

  // ---------- smoothing ----------
  function rendered() {
    if (!snapshots.length) return [];
    const rt = Date.now() - serverOffset - INTERP_DELAY;
    let older = snapshots[0], newer = snapshots[snapshots.length - 1];
    for (let i = snapshots.length - 1; i > 0; i--) if (snapshots[i - 1].ts <= rt) { older = snapshots[i - 1]; newer = snapshots[i]; break; }
    const span = newer.ts - older.ts, k = span > 0 ? Math.min(1, Math.max(0, (rt - older.ts) / span)) : 1;
    const before = {}; for (const p of older.players) before[p.id] = p;
    return newer.players.map((p) => { const o = before[p.id]; return o ? { ...p, x: o.x + (p.x - o.x) * k, y: o.y + (p.y - o.y) * k } : p; });
  }

  // ---------- drawing ----------
  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const shortTitle = (t) => t.replace(/^Tung Tung /, "").replace(/^Tung /, "");

  function drawFloor() {
    ctx.fillStyle = "#6b4423"; ctx.fillRect(0, 0, arena.w, arena.h);
    ctx.strokeStyle = "#5a381c"; ctx.lineWidth = 3;
    for (let y = 0; y <= arena.h; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(arena.w, y); ctx.stroke();
      const off = (y / 60) % 2 === 0 ? 0 : 120;
      for (let x = off; x <= arena.w; x += 240) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 60); ctx.stroke(); }
    }
    ctx.fillStyle = "rgba(255, 140, 42, 0.08)"; ctx.font = "150px Bungee, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("TUNG ARENA", arena.w / 2 - 240, arena.h / 2 - 60);
    // the practice corner: a rug under the solo logs
    const solos = logs.filter((l) => l.kind === "solo");
    if (solos.length) {
      const x0 = Math.min(...solos.map((l) => l.x - 95)), x1 = Math.max(...solos.map((l) => l.x + 95));
      const y0 = Math.min(...solos.map((l) => l.y - 78)), y1 = Math.max(...solos.map((l) => l.y + 62));
      ctx.fillStyle = "rgba(26, 15, 7, 0.28)"; rr(x0, y0, x1 - x0, y1 - y0, 40); ctx.fill();
      ctx.strokeStyle = "rgba(255, 140, 42, 0.45)"; ctx.lineWidth = 5; ctx.setLineDash([22, 16]); rr(x0, y0, x1 - x0, y1 - y0, 40); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#ffcf99"; ctx.font = "30px Bungee, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("PRACTICE CORNER", (x0 + x1) / 2, y0 - 16);
      ctx.fillStyle = "rgba(255, 243, 224, 0.75)"; ctx.font = "700 16px Nunito, sans-serif";
      ctx.fillText("one tung on a log plays that game alone", (x0 + x1) / 2, y1 + 28);
    }
    ctx.strokeStyle = "#ff8c2a"; ctx.lineWidth = 10; ctx.strokeRect(0, 0, arena.w, arena.h);
  }

  function drawLog(l) {
    const st = logState[l.id], horiz = l.w >= l.h, x = l.x - l.w / 2, y = l.y - l.h / 2, on = st ? st[1] : 0;
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)"; rr(x + 6, y + 9, l.w, l.h, Math.min(l.w, l.h) / 2.2); ctx.fill();
    const g = horiz ? ctx.createLinearGradient(0, y, 0, y + l.h) : ctx.createLinearGradient(x, 0, x + l.w, 0);
    g.addColorStop(0, "#b07a40"); g.addColorStop(0.5, "#8b5a2b"); g.addColorStop(1, "#6a421c");
    ctx.fillStyle = g; rr(x, y, l.w, l.h, Math.min(l.w, l.h) / 2.2); ctx.fill();
    ctx.lineWidth = on ? 6 : 4; ctx.strokeStyle = on ? "#ff8c2a" : "#3d2412"; ctx.stroke();
    // bark lines along the log, and the cut end
    ctx.strokeStyle = "rgba(61, 36, 18, 0.35)"; ctx.lineWidth = 2;
    for (const f of [0.28, 0.5, 0.72]) {
      ctx.beginPath();
      if (horiz) { ctx.moveTo(x + l.h * 0.5, y + l.h * f); ctx.lineTo(x + l.w - l.h * 0.4, y + l.h * f); }
      else { ctx.moveTo(x + l.w * f, y + l.w * 0.5); ctx.lineTo(x + l.w * f, y + l.h - l.w * 0.4); }
      ctx.stroke();
    }
    const cx = horiz ? x + l.h * 0.42 : l.x, cy = horiz ? l.y : y + l.w * 0.42, er = Math.min(l.w, l.h) * 0.34;
    ctx.fillStyle = "#d9a066"; ctx.beginPath(); ctx.arc(cx, cy, er, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(61, 36, 18, 0.55)"; ctx.lineWidth = 2;
    for (const k of [1, 0.66, 0.33]) { ctx.beginPath(); ctx.arc(cx, cy, er * k, 0, Math.PI * 2); ctx.stroke(); }
    drawPlate(l, on);
  }

  function drawPlate(l, on) {
    const solo = l.kind === "solo", label = (l.icon ? l.icon + " " : "") + (solo ? shortTitle(l.title) : l.title);
    ctx.font = (solo ? "700 13px" : "700 17px") + " Nunito, sans-serif";
    const pips = l.need, pipW = pips * 14, tw = Math.ceil(ctx.measureText(label).width), pw = tw + pipW + 26, ph = solo ? 24 : 32;
    let px = l.x, py;
    if (solo) py = l.y - l.h / 2 - 20;
    else if (l.w >= l.h) py = l.y + (l.y < arena.h / 2 ? 1 : -1) * (l.h / 2 + 28);
    else { py = l.y; px = l.x + (l.x < arena.w / 2 ? 1 : -1) * (l.w / 2 + pw / 2 + 12); }
    ctx.fillStyle = "rgba(26, 15, 7, 0.82)"; rr(px - pw / 2, py - ph / 2, pw, ph, 10); ctx.fill();
    ctx.fillStyle = "#fff3e0"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(label, px - pw / 2 + 10, py + 1);
    for (let i = 0; i < pips; i++) {
      ctx.beginPath(); ctx.arc(px + pw / 2 - 10 - (pips - 1 - i) * 14, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = i < on ? "#ff8c2a" : "rgba(255, 243, 224, 0.28)"; ctx.fill();
    }
    ctx.textBaseline = "alphabetic";
  }

  function drawCountdown(l) {
    const st = logState[l.id];
    if (!st || st[2] < 0) return;
    ctx.font = "56px Bungee, sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 8; ctx.strokeStyle = "#1a0f07"; ctx.lineJoin = "round";
    const y = l.y - (l.kind === "solo" ? 60 : 70);
    ctx.strokeText(String(st[2]), l.x, y); ctx.fillStyle = "#ff8c2a"; ctx.fillText(String(st[2]), l.x, y);
  }

  function drawPlayer(p, isMe) {
    const r = radius;
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0, r * 0.9, r, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.rotate(p.f + (p.s ? -1.2 : 0.6));
    ctx.fillStyle = "#d9a066"; ctx.strokeStyle = "#3d2412"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(r * 0.6, -5); ctx.lineTo(r * 2.6, -11); ctx.quadraticCurveTo(r * 2.9, 0, r * 2.6, 11); ctx.lineTo(r * 0.6, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    const bw = r * 1.5, bh = r * 2.1;
    ctx.fillStyle = p.st ? "#ffcf99" : p.c; ctx.strokeStyle = "#3d2412"; ctx.lineWidth = 3; rr(-bw / 2, -bh / 2, bw, bh, 12); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(61, 36, 18, 0.35)"; ctx.lineWidth = 2;
    for (const gx of [-bw * 0.25, bw * 0.22]) { ctx.beginPath(); ctx.moveTo(gx, -bh * 0.4); ctx.lineTo(gx + 2, bh * 0.4); ctx.stroke(); }
    const lx = Math.cos(p.f) * 3, ly = Math.sin(p.f) * 3;
    for (const ex of [-8, 8]) {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, -10, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a0f07"; ctx.beginPath(); ctx.arc(ex + lx, -10 + ly, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "#1a0f07"; ctx.lineWidth = 3; ctx.beginPath();
    if (p.st) ctx.arc(0, 10, 5, 0, Math.PI * 2); else ctx.arc(0, 4, 9, 0.2, Math.PI - 0.2);
    ctx.stroke(); ctx.restore();
    ctx.fillStyle = isMe ? "#ffcf99" : "#fff3e0"; ctx.font = "bold 15px Nunito, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(p.n, p.x, p.y - r * 2.1);
    if (isMe) { ctx.fillStyle = "#ff8c2a"; ctx.beginPath(); ctx.moveTo(p.x - 6, p.y - r * 2.6); ctx.lineTo(p.x + 6, p.y - r * 2.6); ctx.lineTo(p.x, p.y - r * 2.35); ctx.fill(); }
  }

  let lastScores = "";
  function updateHud(players, me) {
    const sorted = [...players].sort((a, b) => b.sc - a.sc).slice(0, 8);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const html = "<b>BONKS</b>" + sorted.map((p) => `<div class="${p.id === myId ? "me" : ""}">${esc(p.n)}: ${p.sc}</div>`).join("");
    if (html !== lastScores) { $("scores").innerHTML = html; lastScores = html; }
    // what the log under you is doing
    const st = $("status");
    const l = me && logs.find((q) => Math.abs(me.x - q.x) <= q.w / 2 && Math.abs(me.y - q.y) <= q.h / 2);
    if (!l) { st.hidden = true; return; }
    const s = logState[l.id], on = s ? s[1] : 1, name = shortTitle(l.title);
    let text;
    if (l.kind === "solo") text = s && s[2] >= 0 ? `${name} alone in ${s[2]}` : `${name}: stay on the log to play alone`;
    else if (on < l.need) text = `${name}: waiting for another tung`;
    else text = `${name} starts in ${s && s[2] >= 0 ? s[2] : holdSecs}`;
    st.textContent = text; st.hidden = false;
  }

  let last = performance.now();
  function frame(now) { draw((now - last) / 1000); last = now; requestAnimationFrame(frame); }
  requestAnimationFrame(frame);

  function draw(dt) {
    const W = innerWidth, H = innerHeight;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.fillStyle = "#1a0f07"; ctx.fillRect(0, 0, W, H);
    const players = rendered(), me = players.find((p) => p.id === myId);
    if (me) { camera.x = me.x - W / 2; camera.y = me.y - H / 2; } else { camera.x = arena.w / 2 - W / 2; camera.y = arena.h / 2 - H / 2; }
    ctx.save(); ctx.translate(-camera.x, -camera.y);
    drawFloor();
    for (const l of logs) drawLog(l);
    for (const p of players) drawPlayer(p, p.id === myId);
    for (const l of logs) drawCountdown(l);
    for (const fx of effects) {
      fx.life -= dt; ctx.globalAlpha = Math.max(0, fx.life / 0.7); ctx.fillStyle = "#ff8c2a";
      ctx.font = "28px Bungee, sans-serif"; ctx.textAlign = "center"; ctx.fillText(fx.text, fx.x, fx.y - 50 - (0.7 - fx.life) * 60); ctx.globalAlpha = 1;
    }
    for (let i = effects.length - 1; i >= 0; i--) if (effects[i].life <= 0) effects.splice(i, 1);
    ctx.restore();
    updateHud(players, me);
  }

  window.__arena = { msg: onMsg, draw, logs: () => logs };
})();
