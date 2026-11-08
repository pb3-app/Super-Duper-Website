// Tung Arena - browser side. The server runs the world; this page sends inputs and draws what the server says.
window.__tungArena = true; // mp.js reads this: a game started from here sends you back here when it ends
try { sessionStorage.removeItem("tungArenaReturn"); } catch (_) {}

(() => {
  const T = window.TungMP;
  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  let ctx = canvas.getContext("2d");
  const mainCtx = ctx;
  const Shop = window.TungShop;
  const INTERP_DELAY = 100; // ms behind real time, so movement looks smooth

  let myId = null, arena = { w: 4600, h: 3200 }, radius = 28, holdSecs = 10, safe = null, showdown = null, sdBoard = { cur: [], all: [] }, me$ = { bonks: 0, pct: 0 };
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
        myId = m.you; arena = m.arena; radius = m.radius; holdSecs = m.hold; logs = m.logs; safe = m.safe; showdown = m.showdown; sdBoard = m.board || sdBoard; me$ = { bonks: m.bonks || 0, pct: Math.round(Math.min(1, Math.floor((m.bonks || 0) / 10) / 10) * 100) }; joined = true;
        $("gate").hidden = true; $("scores").hidden = false;
        loadShop(); loadBoard();
        break;
      case "arena_state":
        serverOffset = Date.now() - m.ts;
        logState = {}; for (const l of m.logs) logState[l[0]] = l;
        snapshots.push(m); while (snapshots.length > 30) snapshots.shift();
        break;
      case "arena_sd": sdBoard = m.board; break;
      case "arena_me":
        me$ = { bonks: m.bonks, pct: m.pct };
        if (m.up) feed(`Speed boost! You are ${m.pct}% faster (${m.bonks} bonks)`);
        break;
      case "arena_event":
        if (m.type === "bonk") {
          effects.push({ x: m.x, y: m.y, life: 0.7, text: "TUNG!" }); feed(`${m.from} bonked ${m.to}`);
          const me = rendered().find((p) => p.id === myId), d = me ? Math.hypot(me.x - m.x, me.y - m.y) : 0; // quieter the further away it is
          if (d < 1400) bonkSound(1 - d / 1500);
        }
        else if (m.type === "coins") { feed(`+${m.n} tung ${m.n === 1 ? "buck" : "bucks"} for a ${m.streak} streak!`); loadShop(); }
        else if (m.type === "streak") feed(`${m.name} is on a ${m.streak} streak in the Showdown`);
        else if (m.type === "safe") feed("No bonking on logs or in the practice corner");
        else if (m.type === "join") feed(`${m.name} joined`);
        else if (m.type === "leave") feed(`${m.name} left`);
        break;
      case "arena_solo":
        try { sessionStorage.setItem("tungArenaReturn", "1"); } catch (_) {}
        location.href = "/games/" + m.game + "/index.html";
        break;
      case "arena_room": // a group log: the room is already made, everybody on the log is in it
        try { sessionStorage.setItem("tungArenaReturn", "1"); } catch (_) {}
        location.href = "/games/" + m.game + "/index.html?room=" + encodeURIComponent(m.id);
        break;
      case "arena_full":
        showGate("Tung Arena is full", "Try again in a minute.", false);
        break;
    }
  }
  if (T) {
    for (const t of ["arena_welcome", "arena_state", "arena_event", "arena_solo", "arena_room", "arena_full", "arena_sd", "arena_me"]) T.on("msg:" + t, onMsg);
    T.on("ready", () => { refreshGate(); join(); });
    T.on("logout", () => { joined = false; myId = null; snapshots.length = 0; refreshGate(); });
    T.booted.then(() => { refreshGate(); join(); });
  }
  function feed(text) {
    const div = document.createElement("div"); div.textContent = text; $("feed").appendChild(div);
    while ($("feed").children.length > 5) $("feed").firstChild.remove();
    setTimeout(() => div.remove(), 5000);
  }

  // ---------- the bonk: a hit on a tom drum ----------
  let actx = null;
  function bonkSound(volume) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const t = actx.currentTime, out = actx.createGain(); out.gain.value = Math.max(0.05, Math.min(1, volume)); out.connect(actx.destination);
      // the skin: a low note that drops quickly in pitch as it rings out
      const body = actx.createOscillator(), bg = actx.createGain();
      body.type = "sine"; body.frequency.setValueAtTime(190, t); body.frequency.exponentialRampToValueAtTime(78, t + 0.2);
      bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.9, t + 0.004); bg.gain.exponentialRampToValueAtTime(0.0008, t + 0.42);
      body.connect(bg).connect(out); body.start(t); body.stop(t + 0.45);
      // the shell: a quieter overtone that dies sooner
      const ring = actx.createOscillator(), rg = actx.createGain();
      ring.type = "triangle"; ring.frequency.setValueAtTime(330, t); ring.frequency.exponentialRampToValueAtTime(150, t + 0.12);
      rg.gain.setValueAtTime(0.0001, t); rg.gain.exponentialRampToValueAtTime(0.28, t + 0.004); rg.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
      ring.connect(rg).connect(out); ring.start(t); ring.stop(t + 0.2);
      // the stick: a very short burst of noise
      const n = Math.floor(actx.sampleRate * 0.035), buf = actx.createBuffer(1, n, actx.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = actx.createBufferSource(), hp = actx.createBiquadFilter(), sg = actx.createGain();
      src.buffer = buf; hp.type = "highpass"; hp.frequency.value = 1400; sg.gain.value = 0.35;
      src.connect(hp).connect(sg).connect(out); src.start(t);
    } catch (_) {}
  }

  // ---------- controls ----------
  const keyMap = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right" };
  addEventListener("keydown", (e) => {
    if (shopOpen || admOpen || (e.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName))) return;
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
    ctx.fillStyle = "rgba(255, 140, 42, 0.08)"; ctx.font = "300px Bungee, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("TUNG ARENA", arena.w * 0.3, arena.h * 0.3);
    // the practice corner: a rug under the solo logs. Safe: nobody can be bonked here.
    if (safe) {
      const { x0, y0, x1, y1 } = safe;
      ctx.fillStyle = "rgba(26, 15, 7, 0.28)"; rr(x0, y0, x1 - x0, y1 - y0, 40); ctx.fill();
      ctx.strokeStyle = "rgba(255, 140, 42, 0.45)"; ctx.lineWidth = 5; ctx.setLineDash([22, 16]); rr(x0, y0, x1 - x0, y1 - y0, 40); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#ffcf99"; ctx.font = "30px Bungee, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("PRACTICE CORNER", (x0 + x1) / 2, y0 - 16);
      ctx.fillStyle = "rgba(255, 243, 224, 0.75)"; ctx.font = "700 16px Nunito, sans-serif";
      ctx.fillText("one tung on a log plays that game alone · no bonking here", (x0 + x1) / 2, y1 + 28);
    }
    drawShowdown();
    ctx.strokeStyle = "#ff8c2a"; ctx.lineWidth = 10; ctx.strokeRect(0, 0, arena.w, arena.h);
  }

  function drawShowdown() {
    if (!showdown) return;
    const { cx, cy, plat, abyss, bx0, bx1, by0, by1 } = showdown;
    // the pit
    const g = ctx.createRadialGradient(cx, cy, plat * 0.5, cx, cy, abyss);
    g.addColorStop(0, "#07090d"); g.addColorStop(1, "#141a24");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, abyss, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)"; ctx.lineWidth = 3;
    for (let r = plat + 50; r < abyss; r += 50) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = "#3d2412"; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(cx, cy, abyss + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#a9733a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, abyss - 2, 0, Math.PI * 2); ctx.stroke();
    // the platform
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)"; ctx.beginPath(); ctx.arc(cx + 12, cy + 18, plat, 0, Math.PI * 2); ctx.fill();
    const pg = ctx.createRadialGradient(cx - 80, cy - 90, 40, cx, cy, plat);
    pg.addColorStop(0, "#a9733a"); pg.addColorStop(1, "#7a4b22");
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(cx, cy, plat, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(61, 36, 18, 0.45)"; ctx.lineWidth = 3;
    for (const k of [0.33, 0.66]) { ctx.beginPath(); ctx.arc(cx, cy, plat * k, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 12; i++) { const an = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * 30, cy + Math.sin(an) * 30); ctx.lineTo(cx + Math.cos(an) * plat, cy + Math.sin(an) * plat); ctx.stroke(); }
    ctx.strokeStyle = "#3d2412"; ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(cx, cy, plat, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#ff8c2a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, plat - 14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(255, 207, 153, 0.28)"; ctx.font = "64px Bungee, sans-serif"; ctx.textAlign = "center"; ctx.fillText("SHOWDOWN", cx, cy + 22);
    // the bridge
    ctx.fillStyle = "#8b5a2b"; ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    ctx.strokeStyle = "#5a381c"; ctx.lineWidth = 3;
    for (let y = by0 + 12; y < by1; y += 24) { ctx.beginPath(); ctx.moveTo(bx0, y); ctx.lineTo(bx1, y); ctx.stroke(); }
    ctx.fillStyle = "#3d2412"; ctx.fillRect(bx0 - 8, by0, 10, by1 - by0); ctx.fillRect(bx1 - 2, by0, 10, by1 - by0);
    for (let y = by0 + 6; y < by1; y += 60) { ctx.fillRect(bx0 - 14, y, 22, 14); ctx.fillRect(bx1 - 8, y, 22, 14); }
    // the signs
    ctx.fillStyle = "#ff8c2a"; ctx.font = "58px Bungee, sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 8; ctx.strokeStyle = "#1a0f07"; ctx.lineJoin = "round";
    ctx.strokeText("TUNG SHOWDOWN", cx, cy - abyss - 42); ctx.fillText("TUNG SHOWDOWN", cx, cy - abyss - 42);
    ctx.font = "700 20px Nunito, sans-serif"; ctx.fillStyle = "#ffe9b8"; ctx.fillText("bonk tungs off the platform for a streak · falling or leaving loses it", cx, cy - abyss - 12);
    ctx.fillStyle = "rgba(26, 15, 7, 0.78)"; rr(cx - 150, by1 + 18, 300, 40, 12); ctx.fill();
    ctx.fillStyle = "#ffcf99"; ctx.font = "26px Bungee, sans-serif"; ctx.fillText("▲ SHOWDOWN BRIDGE", cx, by1 + 47);
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
    const solo = l.kind === "solo", label = (l.icon ? l.icon + " " : "") + (solo ? shortTitle(l.title) : l.title) + (l.group ? " · group" : "");
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

  // ---------- what a tung wears ----------
  const gearIds = (p) => {
    if (p.g) return p.g;
    const g = {};
    (p.q || []).forEach((n, i) => { if (n && Shop.ITEMS[n - 1]) g[Shop.SLOTS[i]] = Shop.ITEMS[n - 1].id; });
    return g;
  };
  function heart(cx, cy, s) {
    ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.2, cx - s * 0.8, cy - s * 1.3, cx, cy - s * 0.45);
    ctx.bezierCurveTo(cx + s * 0.8, cy - s * 1.3, cx + s * 1.6, cy - s * 0.2, cx, cy + s * 0.9); ctx.closePath();
  }
  function star(cx, cy, s) {
    ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.quadraticCurveTo(cx, cy, cx + s, cy); ctx.quadraticCurveTo(cx, cy, cx, cy + s);
    ctx.quadraticCurveTo(cx, cy, cx - s, cy); ctx.quadraticCurveTo(cx, cy, cx, cy - s); ctx.closePath();
  }
  const INK = "#3d2412";

  function drawBat(r, id) {
    const path = () => { ctx.beginPath(); ctx.moveTo(r * 0.6, -5); ctx.lineTo(r * 2.6, -11); ctx.quadraticCurveTo(r * 2.9, 0, r * 2.6, 11); ctx.lineTo(r * 0.6, 5); ctx.closePath(); };
    const grad = (...stops) => { const g = ctx.createLinearGradient(r * 0.6, 0, r * 2.9, 0); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
    let fill = "#d9a066";
    if (id === "lightning") { // a bolt instead of a bat
      ctx.save(); ctx.shadowColor = "#fff27a"; ctx.shadowBlur = 12; ctx.fillStyle = "#ffe14d"; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = "round";
      ctx.beginPath(); [[0.6, -4], [1.3, -13], [1.5, -3], [2.2, -12], [2.35, 1], [3.0, 0], [2.1, 12], [1.95, 3], [1.3, 12], [1.2, 3]].forEach(([x, y], i) => (i ? ctx.lineTo(r * x, y) : ctx.moveTo(r * x, y))); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); return;
    }
    if (id === "rolling") fill = grad([0, "#f0dfb8"], [1, "#d8b87a"]);
    else if (id === "carrot") fill = grad([0, "#ff9a3c"], [1, "#e8590c"]);
    else if (id === "pencil") fill = "#ffd23f";
    else if (id === "leek") fill = grad([0, "#fafff0"], [0.4, "#e9f7d0"], [1, "#3f9a4a"]);
    else if (id === "neon") fill = "#15152b";
    else if (id === "cactus") fill = grad([0, "#58b858"], [1, "#2f8a3a"]);
    else if (id === "galaxybat") fill = grad([0, "#2b1b5e"], [1, "#8e44ff"]);
    if (id === "candy") fill = "#ffffff";
    else if (id === "baguette") fill = grad([0, "#e8c07a"], [1, "#c98f43"]);
    else if (id === "ice") fill = grad([0, "#e6f9ff"], [1, "#62c1ff"]);
    else if (id === "flame") fill = grad([0, "#ffd23f"], [0.55, "#ff8a2a"], [1, "#ff3d2b"]);
    else if (id === "goldbat") fill = grad([0, "#fff1a8"], [0.5, "#ffd23f"], [1, "#c9971a"]);
    ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.lineWidth = 3; path(); ctx.fill();
    ctx.save(); path(); ctx.clip();
    if (id === "rolling") { ctx.fillStyle = "#b07a40"; ctx.fillRect(r * 0.5, -14, r * 0.55, 28); ctx.fillRect(r * 2.2, -14, r * 0.8, 28); }
    if (id === "carrot") { ctx.strokeStyle = "rgba(150, 60, 0, 0.45)"; ctx.lineWidth = 2; for (let x = r * 0.9; x < r * 2.6; x += 18) { ctx.beginPath(); ctx.moveTo(x, -9); ctx.lineTo(x + 5, -4); ctx.moveTo(x + 8, 9); ctx.lineTo(x + 3, 4); ctx.stroke(); } }
    if (id === "pencil") { ctx.fillStyle = "#ff8fb1"; ctx.fillRect(r * 0.5, -14, r * 0.45, 28); ctx.fillStyle = "#c0c6cc"; ctx.fillRect(r * 0.95, -14, 6, 28); ctx.fillStyle = "#f2d2a0"; ctx.beginPath(); ctx.moveTo(r * 2.0, -14); ctx.lineTo(r * 3.0, 0); ctx.lineTo(r * 2.0, 14); ctx.fill(); ctx.fillStyle = "#333"; ctx.beginPath(); ctx.moveTo(r * 2.65, -4); ctx.lineTo(r * 3.0, 0); ctx.lineTo(r * 2.65, 4); ctx.fill(); ctx.strokeStyle = "rgba(160, 110, 0, 0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * 1.1, -4); ctx.lineTo(r * 2.0, -4); ctx.moveTo(r * 1.1, 4); ctx.lineTo(r * 2.0, 4); ctx.stroke(); }
    if (id === "leek") { ctx.strokeStyle = "rgba(30, 90, 40, 0.5)"; ctx.lineWidth = 2; for (const y of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(r * 1.5, y); ctx.lineTo(r * 3, y * 1.3); ctx.stroke(); } }
    if (id === "cactus") { ctx.fillStyle = "#fff"; for (let x = r * 0.9; x < r * 2.7; x += 14) for (const y of [-6, 5]) { ctx.fillRect(x + (y > 0 ? 6 : 0), y, 2.5, 2.5); } ctx.fillStyle = "#ff5fa2"; ctx.beginPath(); ctx.arc(r * 2.7, 0, 5, 0, 7); ctx.fill(); }
    if (id === "galaxybat") { const tw = performance.now() / 300; ctx.fillStyle = "#fff"; for (let i = 0; i < 12; i++) { const x = r * 0.7 + ((i * 37) % 100) / 100 * r * 2.2, y = ((i * 53) % 100) / 100 * 18 - 9; ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(tw + i)); ctx.fillRect(x, y, 2.2, 2.2); } ctx.globalAlpha = 1; }
    if (id === "candy") { ctx.strokeStyle = "#e63946"; ctx.lineWidth = 7; for (let x = r * 0.4; x < r * 3; x += 16) { ctx.beginPath(); ctx.moveTo(x, -14); ctx.lineTo(x + 12, 14); ctx.stroke(); } }
    if (id === "baguette") { ctx.strokeStyle = "rgba(120, 70, 20, 0.55)"; ctx.lineWidth = 2.5; for (let x = r * 1.1; x < r * 2.6; x += 15) { ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x + 7, 5); ctx.stroke(); } }
    if (id === "goldbat" || id === "ice") { ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; ctx.fillRect(r * 0.7, -8, r * 2.2, 3); }
    ctx.restore();
    if (id === "neon") { ctx.save(); ctx.shadowColor = "#39f0ff"; ctx.shadowBlur = 14; ctx.strokeStyle = "#39f0ff"; ctx.lineWidth = 3; path(); ctx.stroke(); ctx.restore(); return; }
    path(); ctx.stroke();
  }

  // ---------- skins: a fill (one colour or a gradient) with a pattern over it ----------
  function skinFill(ci, bh) {
    if (!ci.fill2) return ci.fill;
    const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2); g.addColorStop(0, ci.fill); g.addColorStop(1, ci.fill2); return g;
  }
  function drawSkin(pat, bw, bh, t) {
    ctx.save(); rr(-bw / 2, -bh / 2, bw, bh, 12); ctx.clip();
    const x0 = -bw / 2, y0 = -bh / 2;
    if (pat === "tiger") { ctx.strokeStyle = "#5a2d0c"; ctx.lineWidth = 4; for (let y = y0 + 6; y < bh / 2; y += 11) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo(0, y + 6, -x0, y - 2); ctx.stroke(); } }
    else if (pat === "polka") { ctx.fillStyle = "#fff"; for (let y = y0 + 7, row = 0; y < bh / 2; y += 12, row++) for (let x = x0 + 6 + (row % 2) * 7; x < -x0; x += 14) { ctx.beginPath(); ctx.arc(x, y, 2.8, 0, 7); ctx.fill(); } }
    else if (pat === "checker") { ctx.fillStyle = "#2b2b2b"; const c = 8; for (let y = 0, row = 0; y0 + y < bh / 2; y += c, row++) for (let x = (row % 2) * c; x0 + x < -x0; x += c * 2) ctx.fillRect(x0 + x, y0 + y, c, c); }
    else if (pat === "camo") { const cols = ["#4a5f2a", "#a3b36a", "#3b4a21"]; for (let i = 0; i < 9; i++) { ctx.fillStyle = cols[i % 3]; ctx.beginPath(); ctx.ellipse(x0 + ((i * 41) % 100) / 100 * bw, y0 + ((i * 67) % 100) / 100 * bh, 9, 6, i, 0, 7); ctx.fill(); } }
    else if (pat === "ocean") { ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2; for (let y = y0 + 10; y < bh / 2; y += 12) { ctx.beginPath(); for (let x = x0; x <= -x0; x += 4) ctx.lineTo(x, y + Math.sin(x / 4 + t * 2 + y) * 2); ctx.stroke(); } }
    else if (pat === "sunset") { ctx.fillStyle = "rgba(255, 79, 138, 0.45)"; ctx.fillRect(x0, -bh * 0.1, bw, bh * 0.25); ctx.fillStyle = "#fff6b0"; ctx.beginPath(); ctx.arc(0, y0 + 10, 7, 0, 7); ctx.fill(); }
    else if (pat === "galaxy") { ctx.fillStyle = "rgba(255, 90, 200, 0.25)"; ctx.beginPath(); ctx.ellipse(-3, 2, 14, 24, 0.5, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; for (let i = 0; i < 14; i++) { ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 2 + i * 1.7)); ctx.fillRect(x0 + ((i * 37) % 100) / 100 * bw, y0 + ((i * 59) % 100) / 100 * bh, 2.2, 2.2); } ctx.globalAlpha = 1; }
    else if (pat === "rainbow") { const g = ctx.createLinearGradient(0, y0, 0, bh / 2); ["#ff4d4d", "#ff9a3c", "#ffe14d", "#5fd16b", "#4cb5ff", "#9b6bff"].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c)); ctx.fillStyle = g; ctx.fillRect(x0, y0, bw, bh); }
    ctx.restore(); ctx.strokeStyle = INK; ctx.lineWidth = 3; rr(-bw / 2, -bh / 2, bw, bh, 12); ctx.stroke();
  }
  function drawWings(t) {
    const flap = Math.sin(t * 5) * 6;
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#fdfdff"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(s * 14, -6); ctx.quadraticCurveTo(s * 40, -46 - flap, s * 58, -22 - flap); ctx.quadraticCurveTo(s * 50, -16 - flap / 2, s * 56, -6); ctx.quadraticCurveTo(s * 46, -4, s * 50, 8); ctx.quadraticCurveTo(s * 34, 2, s * 36, 14); ctx.quadraticCurveTo(s * 22, 8, s * 14, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  function drawHat(id, t) {
    const top = -29;
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.lineJoin = "round";
    switch (id) {
      case "party":
        ctx.fillStyle = "#ff4fb8"; ctx.beginPath(); ctx.moveTo(-15, top + 3); ctx.lineTo(15, top + 3); ctx.lineTo(0, top - 40); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; for (const k of [0.3, 0.6]) { ctx.beginPath(); ctx.moveTo(-15 * (1 - k) - 1, top + 3 - 43 * k); ctx.lineTo(15 * (1 - k) + 1, top + 3 - 43 * k); ctx.stroke(); }
        ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, top - 41, 5, 0, 7); ctx.fill(); ctx.stroke(); break;
      case "beanie":
        ctx.fillStyle = "#3a86ff"; ctx.beginPath(); ctx.arc(0, top + 5, 22, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#1d5fd1"; rr(-23, top + 1, 46, 10, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, top - 19, 6, 0, 7); ctx.fill(); ctx.stroke(); break;
      case "cowboy":
        ctx.fillStyle = "#8a5a2b"; ctx.beginPath(); ctx.ellipse(0, top + 3, 35, 8, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#9a6a33"; rr(-15, top - 21, 30, 25, 9); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.fillRect(-15, top - 3, 30, 5); break;
      case "chef":
        ctx.fillStyle = "#fff"; for (const [x, y, r] of [[-12, -16, 11], [12, -16, 11], [0, -22, 13]]) { ctx.beginPath(); ctx.arc(x, top + y, r, 0, 7); ctx.fill(); ctx.stroke(); }
        ctx.fillRect(-18, top - 10, 36, 13); ctx.strokeRect(-18, top - 10, 36, 13); break;
      case "tophat":
        ctx.fillStyle = "#1f1f24"; rr(-15, top - 35, 30, 36, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#d62839"; ctx.fillRect(-15, top - 9, 30, 7);
        ctx.fillStyle = "#1f1f24"; rr(-25, top - 2, 50, 7, 3); ctx.fill(); ctx.stroke(); break;
      case "propeller":
        ctx.fillStyle = "#e63946"; ctx.beginPath(); ctx.arc(0, top + 3, 17, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, top - 14); ctx.lineTo(0, top - 23); ctx.stroke();
        ctx.save(); ctx.translate(0, top - 24); ctx.rotate(t * 14); ctx.fillStyle = "#ffd23f";
        ctx.beginPath(); ctx.ellipse(0, 0, 17, 3.2, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); break;
      case "crown":
        ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.moveTo(-19, top + 5); ctx.lineTo(-19, top - 15); ctx.lineTo(-10, top - 5); ctx.lineTo(0, top - 21); ctx.lineTo(10, top - 5); ctx.lineTo(19, top - 15); ctx.lineTo(19, top + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
        for (const [x, c] of [[-10, "#e63946"], [0, "#3a86ff"], [10, "#2ec4b6"]]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, top - 1, 3.2, 0, 7); ctx.fill(); } break;
      case "bucket":
        ctx.fillStyle = "#e8d9a0"; ctx.beginPath(); ctx.moveTo(-16, top + 5); ctx.lineTo(-13, top - 15); ctx.lineTo(13, top - 15); ctx.lineTo(16, top + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, top + 5, 27, 6, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#9a8a50"; ctx.fillRect(-15, top - 4, 30, 5); break;
      case "cap":
        ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.arc(0, top + 5, 19, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#a31d2b"; ctx.beginPath(); ctx.ellipse(14, top + 5, 16, 4, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, top - 14, 3, 0, 7); ctx.fill(); break;
      case "headband":
        ctx.fillStyle = "#ff5a2b"; rr(-23, top + 6, 46, 8, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillRect(-23, top + 9, 46, 2);
        ctx.fillStyle = "#ff5a2b"; ctx.beginPath(); ctx.moveTo(23, top + 10); ctx.lineTo(34, top + 4); ctx.lineTo(32, top + 16); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case "wizard":
        ctx.fillStyle = "#5b2fb8"; ctx.beginPath(); ctx.moveTo(-19, top + 4); ctx.quadraticCurveTo(-4, top - 20, 12, top - 48); ctx.quadraticCurveTo(14, top - 20, 19, top + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, top + 5, 31, 7, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ffd23f"; star(-4, top - 12, 4); ctx.fill(); star(6, top - 24, 3); ctx.fill(); break;
      case "pirate":
        ctx.fillStyle = "#1f1f24"; ctx.beginPath(); ctx.moveTo(-27, top + 6); ctx.quadraticCurveTo(-14, top - 30, 0, top - 22); ctx.quadraticCurveTo(14, top - 30, 27, top + 6); ctx.quadraticCurveTo(0, top - 2, -27, top + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, top - 10, 5, 0, 7); ctx.fill(); ctx.fillStyle = "#1f1f24"; ctx.fillRect(-3, top - 12, 2, 3); ctx.fillRect(1, top - 12, 2, 3); break;
      case "santa":
        ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.moveTo(-19, top + 4); ctx.lineTo(19, top + 4); ctx.quadraticCurveTo(16, top - 20, 28, top - 24); ctx.quadraticCurveTo(-4, top - 40, -19, top + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; rr(-22, top - 2, 44, 10, 5); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(28, top - 24, 6, 0, 7); ctx.fill(); ctx.stroke(); break;
      case "viking":
        ctx.fillStyle = "#f3ead2"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 16, top + 1); ctx.quadraticCurveTo(s * 36, top - 2, s * 31, top - 26); ctx.quadraticCurveTo(s * 25, top - 10, s * 12, top - 8); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = "#9aa0a6"; ctx.beginPath(); ctx.arc(0, top + 6, 20, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#6c7279"; ctx.fillRect(-20, top + 2, 40, 5); break;
      case "flower":
        ctx.strokeStyle = "#3f9a4a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, top + 18, 24, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = INK;
        [[-17, 0, "#ff7aa8"], [-8, -5, "#ffd23f"], [3, -6, "#fff"], [13, -3, "#ff7aa8"], [20, 4, "#c9a7ff"]].forEach(([x, y, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, top + y, 5.5, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#ffb000"; ctx.beginPath(); ctx.arc(x, top + y, 1.8, 0, 7); ctx.fill(); }); break;
      case "knight":
        ctx.fillStyle = "#b8bec6"; rr(-19, top - 17, 38, 25, 10); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#2b2f36"; ctx.fillRect(-14, top - 5, 28, 5);
        ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.ellipse(0, top - 22, 5, 11, 0.2, 0, 7); ctx.fill(); ctx.stroke(); break;
      case "astronaut":
        ctx.fillStyle = "rgba(170, 225, 255, 0.28)"; ctx.strokeStyle = "#e6eef6"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -4, 31, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -4, 24, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke(); break;
      case "sombrero":
        ctx.fillStyle = "#e6b95a"; ctx.beginPath(); ctx.ellipse(0, top + 5, 43, 9, 0, 0, 7); ctx.fill(); ctx.stroke();
        rr(-13, top - 22, 26, 26, 9); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#d62839"; ctx.fillRect(-13, top - 4, 26, 6);
        ctx.fillStyle = "#2ec4b6"; for (const x of [-8, 0, 8]) ctx.fillRect(x - 1.5, top - 3, 3, 4); break;
      case "pharaoh":
        for (const s of [-1, 1]) { for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? "#2f6fe0" : "#ffd23f"; ctx.fillRect(s > 0 ? 16 : -26, top + 2 + i * 6, 10, 6); } ctx.strokeRect(s > 0 ? 16 : -26, top + 2, 10, 36); }
        ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.moveTo(-26, top + 4); ctx.lineTo(-19, top - 24); ctx.lineTo(19, top - 24); ctx.lineTo(26, top + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#2f6fe0"; for (const x of [-12, -4, 4, 12]) ctx.fillRect(x - 2, top - 22, 4, 24); ctx.fillStyle = "#e63946"; ctx.beginPath(); ctx.arc(0, top - 6, 3.5, 0, 7); ctx.fill(); break;
      case "flamecrown": {
        ctx.save(); ctx.shadowColor = "#ff8a2a"; ctx.shadowBlur = 14;
        for (let i = -2; i <= 2; i++) { const h = 20 + (i === 0 ? 10 : 0) + Math.sin(t * 9 + i * 1.7) * 4; ctx.fillStyle = "#ff5a2b"; ctx.beginPath(); ctx.moveTo(i * 8 - 6, top + 2); ctx.quadraticCurveTo(i * 8 - 2, top - h * 0.6, i * 8 + Math.sin(t * 7 + i) * 3, top - h); ctx.quadraticCurveTo(i * 8 + 3, top - h * 0.5, i * 8 + 6, top + 2); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.moveTo(i * 8 - 3, top + 2); ctx.quadraticCurveTo(i * 8, top - h * 0.45, i * 8, top - h * 0.6); ctx.quadraticCurveTo(i * 8 + 1, top - h * 0.3, i * 8 + 3, top + 2); ctx.fill(); }
        ctx.restore(); ctx.fillStyle = "#c9971a"; rr(-20, top - 1, 40, 8, 3); ctx.fill(); ctx.stroke(); break; }
      case "unicorn": {
        const g = ctx.createLinearGradient(0, top - 36, 0, top + 4); g.addColorStop(0, "#fff0fa"); g.addColorStop(1, "#ffb3e6");
        ctx.save(); ctx.shadowColor = "#ffd6f5"; ctx.shadowBlur = 10; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-7, top + 4); ctx.lineTo(0, top - 38); ctx.lineTo(7, top + 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        ctx.strokeStyle = "#e08ac8"; ctx.lineWidth = 2; for (let i = 1; i < 5; i++) { const y = top + 4 - i * 8; ctx.beginPath(); ctx.moveTo(-6 + i, y); ctx.lineTo(6 - i, y - 4); ctx.stroke(); }
        ctx.fillStyle = "#fff6b0"; star(12 + Math.sin(t * 3) * 3, top - 22, 3 + Math.abs(Math.sin(t * 4)) * 2); ctx.fill(); break; }
      case "halo":
        ctx.save(); ctx.shadowColor = "#fff2a8"; ctx.shadowBlur = 14; ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.ellipse(0, top - 17 + Math.sin(t * 3) * 2, 18, 6, 0, 0, 7); ctx.stroke(); ctx.restore(); break;
    }
  }

  function drawFace(id) {
    ctx.lineJoin = "round"; ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
    switch (id) {
      case "sunglasses":
        ctx.fillStyle = "#15151a"; rr(-18, -17, 16, 12, 4); ctx.fill(); rr(2, -17, 16, 12, 4); ctx.fill();
        ctx.strokeStyle = "#15151a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-3, -13); ctx.lineTo(3, -13); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(-15, -15, 5, 2); ctx.fillRect(5, -15, 5, 2); break;
      case "mustache":
        ctx.fillStyle = "#2b1a0e"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 7, 0, 9, 4.5, s * 0.35, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(s * 15, 3, 3, 0, 7); ctx.fill(); } break;
      case "monocle":
        ctx.strokeStyle = "#e0a91a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(8, -10, 9.5, 0, 7); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(16, -5); ctx.quadraticCurveTo(23, 4, 19, 17); ctx.stroke(); break;
      case "bandana":
        ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.moveTo(-21, -3); ctx.lineTo(21, -3); ctx.lineTo(21, 4); ctx.lineTo(0, 22); ctx.lineTo(-21, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; for (const [x, y] of [[-10, 2], [0, 8], [10, 2], [0, 0]]) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill(); } break;
      case "glasses":
        ctx.strokeStyle = "#5a3a1a"; ctx.lineWidth = 2.5; for (const x of [-8, 8]) { ctx.beginPath(); ctx.arc(x, -10, 8.5, 0, 7); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(-0.5, -11); ctx.lineTo(0.5, -11); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.25)"; for (const x of [-8, 8]) { ctx.beginPath(); ctx.arc(x, -10, 8, 0, 7); ctx.fill(); } break;
      case "eyepatch":
        ctx.strokeStyle = "#15151a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-21, -22); ctx.lineTo(8, -10); ctx.lineTo(21, -3); ctx.stroke();
        ctx.fillStyle = "#15151a"; ctx.beginPath(); ctx.ellipse(8, -10, 9, 8, 0.3, 0, 7); ctx.fill(); break;
      case "blush":
        ctx.fillStyle = "rgba(255, 90, 130, 0.5)"; for (const x of [-16, 16]) { ctx.beginPath(); ctx.ellipse(x, 1, 6, 3.5, 0, 0, 7); ctx.fill(); } break;
      case "goggles":
        ctx.fillStyle = "#ff8c2a"; ctx.fillRect(-22, -12.5, 44, 5);
        for (const x of [-8, 8]) { ctx.fillStyle = "rgba(120, 225, 255, 0.55)"; ctx.strokeStyle = "#ff8c2a"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x, -10, 9, 0, 7); ctx.fill(); ctx.stroke(); } break;
      case "beard":
        ctx.fillStyle = "#6b3f1d"; ctx.beginPath(); ctx.moveTo(-18, 2); ctx.quadraticCurveTo(-22, 34, 0, 38); ctx.quadraticCurveTo(22, 34, 18, 2); ctx.quadraticCurveTo(0, 12, -18, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1.5; for (const x of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x * 1.2, 30); ctx.stroke(); } break;
      case "clownnose":
        ctx.fillStyle = "#e63946"; ctx.beginPath(); ctx.arc(0, -1, 6.5, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(-2, -3, 2, 0, 7); ctx.fill(); break;
      case "visor": {
        const t = performance.now() / 1000;
        ctx.fillStyle = "rgba(0, 235, 255, 0.5)"; ctx.strokeStyle = "#00a8bb"; rr(-22, -18, 44, 14, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(-19 + ((t * 30) % 36), -16, 4, 10); break; }
      case "laser": {
        const t = performance.now() / 1000, pulse = 0.7 + 0.3 * Math.sin(t * 8);
        ctx.save(); ctx.shadowColor = "#ff2a2a"; ctx.shadowBlur = 14 * pulse;
        for (const x of [-8, 8]) { ctx.fillStyle = "#ff2a2a"; ctx.beginPath(); ctx.arc(x, -10, 5.5, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(255, 60, 60, 0.7)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x + (x > 0 ? 18 : -18), -22); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, -10, 2, 0, 7); ctx.fill(); }
        ctx.restore(); break; }
      case "heartshades":
        ctx.fillStyle = "#ff4f9a"; heart(-8, -9, 9); ctx.fill(); ctx.stroke(); heart(8, -9, 9); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.beginPath(); ctx.arc(-11, -12, 2, 0, 7); ctx.arc(5, -12, 2, 0, 7); ctx.fill(); break;
    }
  }

  function drawWear(id) {
    ctx.lineJoin = "round"; ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
    switch (id) {
      case "bowtie":
        ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(-13, 8); ctx.lineTo(-13, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(13, 8); ctx.lineTo(13, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#a31d2b"; ctx.beginPath(); ctx.arc(0, 15, 3.5, 0, 7); ctx.fill(); break;
      case "scarf":
        ctx.fillStyle = "#d62839"; rr(-23, 9, 46, 10, 5); ctx.fill(); ctx.stroke();
        rr(9, 15, 10, 22, 3); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; for (const x of [-14, -4, 6]) { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, 18); ctx.stroke(); }
        for (const y of [22, 29]) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(18, y); ctx.stroke(); } break;
      case "badge":
        ctx.fillStyle = "#ffd23f"; star(-11, 15, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(-11, 15, 6.5, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#c9971a"; star(-11, 15, 3.5); ctx.fill(); break;
      case "lei":
        [[-18, 0, "#ff7aa8"], [-11, 7, "#ffd23f"], [-4, 11, "#fff"], [4, 11, "#ff7aa8"], [11, 7, "#c9a7ff"], [18, 0, "#ffd23f"]].forEach(([x, y, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, 10 + y, 5, 0, 7); ctx.fill(); ctx.stroke(); }); break;
      case "jersey":
        ctx.fillStyle = "#2f6fe0"; rr(-21.5, 7, 43, 22.5, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillRect(-21.5, 11, 43, 3);
        ctx.fillStyle = "#fff"; ctx.font = "bold 13px Bungee, sans-serif"; ctx.textAlign = "center"; ctx.fillText("1", 0, 27); break;
      case "armor": {
        const g = ctx.createLinearGradient(-21, 0, 21, 0); g.addColorStop(0, "#8e959e"); g.addColorStop(0.45, "#e1e6eb"); g.addColorStop(1, "#8e959e");
        ctx.fillStyle = g; rr(-22, 6, 44, 25, 7); ctx.fill(); ctx.stroke(); ctx.strokeStyle = "rgba(40,45,55,0.55)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, 30); ctx.moveTo(-20, 18); ctx.lineTo(20, 18); ctx.stroke();
        ctx.fillStyle = "#5a6068"; for (const [x, y] of [[-14, 11], [14, 11], [-14, 25], [14, 25]]) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); } break; }
      case "tux":
        ctx.fillStyle = "#1f1f24"; rr(-21.5, 7, 43, 23, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fdfdfd"; ctx.beginPath(); ctx.moveTo(-7, 7); ctx.lineTo(7, 7); ctx.lineTo(0, 27); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.moveTo(0, 11); ctx.lineTo(-6, 8); ctx.lineTo(-6, 14); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, 11); ctx.lineTo(6, 8); ctx.lineTo(6, 14); ctx.closePath(); ctx.fill(); break;
      case "tee":
        ctx.fillStyle = "#fdfdfd"; rr(-21.5, 7, 43, 22.5, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.font = "bold 9px Bungee, sans-serif"; ctx.textAlign = "center"; ctx.fillText("TUNG", 0, 22); break;
    }
  }
  function drawCape(t) {
    const sw = Math.sin(t * 4) * 2;
    ctx.fillStyle = "#d62839"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(-20, -16); ctx.lineTo(20, -16); ctx.lineTo(36 + sw, 40); ctx.lineTo(-36 + sw, 40); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // the whole tung at (0, 0): used on the map and in the shop previews
  function drawTung(p) {
    const r = radius, g = gearIds(p), t = performance.now() / 1000;
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0, r * 0.9, r, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    if (g.wear === "cape") drawCape(t);
    if (g.wear === "wings") drawWings(t);
    ctx.save(); ctx.rotate(p.f + (p.s ? -1.2 : 0.6)); drawBat(r, g.bat); ctx.restore();
    const bw = r * 1.5, bh = r * 2.1, ci = g.color && Shop.byId[g.color];
    ctx.fillStyle = p.st ? "#ffcf99" : ci ? skinFill(ci, bh) : p.c; ctx.strokeStyle = INK; ctx.lineWidth = 3; rr(-bw / 2, -bh / 2, bw, bh, 12); ctx.fill(); ctx.stroke();
    if (ci && ci.pattern && !p.st) drawSkin(ci.pattern, bw, bh, t);
    ctx.strokeStyle = "rgba(61, 36, 18, 0.35)"; ctx.lineWidth = 2;
    for (const gx of [-bw * 0.25, bw * 0.22]) { ctx.beginPath(); ctx.moveTo(gx, -bh * 0.4); ctx.lineTo(gx + 2, bh * 0.4); ctx.stroke(); }
    if (g.wear && g.wear !== "cape" && g.wear !== "wings") drawWear(g.wear);
    const lx = Math.cos(p.f) * 3, ly = Math.sin(p.f) * 3;
    for (const ex of [-8, 8]) {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, -10, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a0f07"; ctx.beginPath(); ctx.arc(ex + lx, -10 + ly, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "#1a0f07"; ctx.lineWidth = 3; ctx.beginPath();
    if (p.st) ctx.arc(0, 10, 5, 0, Math.PI * 2); else ctx.arc(0, 4, 9, 0.2, Math.PI - 0.2);
    ctx.stroke();
    if (g.face) drawFace(g.face);
    if (g.hat) drawHat(g.hat, t);
  }

  function drawPlayer(p, isMe) {
    const r = radius;
    if (p.fl) { // falling into the pit: smaller and fainter until it is gone
      ctx.save(); ctx.globalAlpha = Math.max(0.1, p.fl); ctx.translate(p.x, p.y); const sc = 0.25 + 0.75 * p.fl; ctx.scale(sc, sc); ctx.rotate((1 - p.fl) * 5); drawTung(p); ctx.restore();
      return;
    }
    ctx.save(); ctx.translate(p.x, p.y); drawTung(p); ctx.restore();
    if (p.k > 0) { ctx.fillStyle = "#ff8c2a"; ctx.font = "bold 16px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.fillText("🔥 " + p.k, p.x, p.y - r * 2.1 - (gearIds(p).hat ? 22 : 0) - 20); }
    ctx.fillStyle = isMe ? "#ffcf99" : "#fff3e0"; ctx.font = "bold 15px Nunito, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(p.n, p.x, p.y - r * 2.1 - (gearIds(p).hat ? 22 : 0));
    if (isMe) { const o = gearIds(p).hat ? 22 : 0; ctx.fillStyle = "#ff8c2a"; ctx.beginPath(); ctx.moveTo(p.x - 6, p.y - r * 2.6 - o); ctx.lineTo(p.x + 6, p.y - r * 2.6 - o); ctx.lineTo(p.x, p.y - r * 2.35 - o); ctx.fill(); }
  }

  // ---------- trails: a little show behind a tung that wears one ----------
  const trailBits = [], lastAt = {};
  function trailTick(p, dt) {
    const g = gearIds(p);
    if (!g.trail) { delete lastAt[p.id]; return; }
    const l = lastAt[p.id];
    if (l && Math.hypot(p.x - l.x, p.y - l.y) > 5 && trailBits.length < 400) {
      trailBits.push({ kind: g.trail, x: p.x + (Math.random() - 0.5) * 14, y: p.y + radius * 0.7 + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 20, vy: g.trail === "flames" || g.trail === "bubbles" || g.trail === "hearts" || g.trail === "music" ? -30 - Math.random() * 30 : (Math.random() - 0.5) * 20, life: 0.8, max: 0.8 });
    }
    lastAt[p.id] = { x: p.x, y: p.y };
  }
  function drawBit(kind, x, y, k) { // k: 1 fresh, 0 gone
    ctx.globalAlpha = Math.max(0, k);
    if (kind === "bubbles") { ctx.strokeStyle = "#bfe6ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 3 + (1 - k) * 6, 0, 7); ctx.stroke(); }
    else if (kind === "sparkles") { ctx.fillStyle = k > 0.5 ? "#fff6b0" : "#ffd23f"; star(x, y, 3 + k * 6); ctx.fill(); }
    else if (kind === "flames") { ctx.fillStyle = k > 0.55 ? "#ffd23f" : "#ff5a2b"; ctx.beginPath(); ctx.arc(x, y, 3 + k * 8, 0, 7); ctx.fill(); }
    else if (kind === "hearts") { ctx.fillStyle = "#ff5fa2"; heart(x, y, 3 + k * 5); ctx.fill(); }
    else if (kind === "dust") { ctx.fillStyle = "rgba(216, 195, 154, 0.8)"; ctx.beginPath(); ctx.arc(x, y, 2 + (1 - k) * 8, 0, 7); ctx.fill(); }
    else if (kind === "leaves") { ctx.fillStyle = (Math.floor(x) % 3 === 0) ? "#e8590c" : (Math.floor(x) % 3 === 1) ? "#5fb85f" : "#e0a91a"; ctx.save(); ctx.translate(x, y); ctx.rotate(k * 7 + x); ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, 7); ctx.fill(); ctx.restore(); }
    else if (kind === "music") { ctx.fillStyle = "#fff"; ctx.strokeStyle = "#3d2412"; ctx.lineWidth = 3; ctx.font = "bold " + Math.round(13 + k * 6) + "px sans-serif"; ctx.textAlign = "center"; const note = (Math.floor(x) % 2) ? "♪" : "♫"; ctx.strokeText(note, x, y); ctx.fillText(note, x, y); }
    else if (kind === "rainbowtrail") { ctx.fillStyle = `hsl(${Math.floor((k * 300 + x * 3) % 360)}, 95%, 60%)`; ctx.beginPath(); ctx.arc(x, y, 3 + k * 6, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function drawTrails(dt) {
    for (const b of trailBits) { b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; drawBit(b.kind, b.x, b.y, b.life / b.max); }
    for (let i = trailBits.length - 1; i >= 0; i--) if (trailBits[i].life <= 0) trailBits.splice(i, 1);
  }

  // a small map, because the arena is big
  const mini = $("mini"), mctx = mini.getContext("2d");
  function drawMini(players) {
    const W = mini.width, H = Math.round(mini.width * arena.h / arena.w); mini.height = H;
    const k = W / arena.w;
    mctx.clearRect(0, 0, W, H);
    mctx.fillStyle = "rgba(26, 15, 7, 0.8)"; mctx.fillRect(0, 0, W, H);
    mctx.strokeStyle = "#ff8c2a"; mctx.lineWidth = 2; mctx.strokeRect(1, 1, W - 2, H - 2);
    if (showdown) { mctx.fillStyle = "#06080c"; mctx.beginPath(); mctx.arc(showdown.cx * k, showdown.cy * k, showdown.abyss * k, 0, 7); mctx.fill(); mctx.strokeStyle = "#ff8c2a"; mctx.lineWidth = 1.5; mctx.stroke(); mctx.fillStyle = "#a9733a"; mctx.beginPath(); mctx.arc(showdown.cx * k, showdown.cy * k, showdown.plat * k, 0, 7); mctx.fill(); mctx.fillRect(showdown.bx0 * k, showdown.by0 * k, (showdown.bx1 - showdown.bx0) * k, (showdown.by1 - showdown.by0) * k); }
    if (safe) { mctx.fillStyle = "rgba(255, 207, 153, 0.25)"; mctx.fillRect(safe.x0 * k, safe.y0 * k, (safe.x1 - safe.x0) * k, (safe.y1 - safe.y0) * k); }
    for (const l of logs) { if (l.kind === "solo") continue; const st = logState[l.id]; mctx.fillStyle = st ? "#ff8c2a" : "#a9733a"; mctx.fillRect((l.x - l.w / 2) * k, (l.y - l.h / 2) * k, Math.max(3, l.w * k), Math.max(3, l.h * k)); }
    for (const p of players) { mctx.fillStyle = p.id === myId ? "#ffffff" : "#e0b07a"; mctx.beginPath(); mctx.arc(p.x * k, p.y * k, p.id === myId ? 4 : 2.5, 0, 7); mctx.fill(); }
  }

  let lastScores = "";
  function updateHud(players, me) {
    const sorted = [...players].sort((a, b) => b.sc - a.sc).slice(0, 8);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const next = (Math.floor(me$.bonks / 10) + 1) * 10;
    const html = "<b>BONKS</b>" + sorted.map((p) => `<div class="${p.id === myId ? "me" : ""}">${esc(p.n)}: ${p.sc}</div>`).join("")
      + `<div class="boost">⚡ Speed +${me$.pct}%<small>${me$.pct >= 100 ? "full speed: " + me$.bonks + " bonks in all" : me$.bonks + " bonks in all, next boost at " + next}</small></div>`;
    if (html !== lastScores) { $("scores").innerHTML = html; lastScores = html; }
    // the streak boards: only while you are in the Showdown
    const sdBox = $("sd");
    if (me && me.z) {
      const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      const list = (rows) => rows.length ? `<ol>${rows.map(([n, v], i) => `<li><span class="n">${i + 1}</span><span class="who">${esc(n)}</span><b>${v}</b></li>`).join("")}</ol>` : `<div class="none">nobody yet</div>`;
      const k = me.k || 0, next = (Math.floor(k / 10) + 1) * 10, coins = Math.min(16, 2 ** (next / 10 - 1));
      const html = `<h2>⚔️ Tung Showdown</h2><div class="sd__me">Your streak <b>${k}</b><small>${next} knock-offs: +${coins} tung ${coins === 1 ? "buck" : "bucks"}</small></div><h3>Streaks right now</h3>${list(sdBoard.cur)}<h3>Best ever</h3>${list(sdBoard.all)}`;
      if (html !== sdBox._html) { sdBox.innerHTML = html; sdBox._html = html; }
      sdBox.hidden = false;
    } else sdBox.hidden = true;
    // what the log under you is doing
    const st = $("status");
    const l = me && logs.find((q) => Math.abs(me.x - q.x) <= q.w / 2 && Math.abs(me.y - q.y) <= q.h / 2);
    if (!l) { st.hidden = true; return; }
    const s = logState[l.id], on = s ? s[1] : 1, name = shortTitle(l.title);
    let text;
    if (l.kind === "solo") text = s && s[2] >= 0 ? `${name} alone in ${s[2]}` : `${name}: stay on the log to play alone`;
    else if (on < l.need) text = l.group ? `${name} group: waiting for ${l.need - on} more ${l.need - on === 1 ? "tung" : "tungs"} (${l.need} to ${l.max})` : `${name}: waiting for another tung`;
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
    for (const p of players) trailTick(p, dt);
    drawTrails(dt);
    for (const p of players) drawPlayer(p, p.id === myId);
    for (const l of logs) drawCountdown(l);
    for (const fx of effects) {
      fx.life -= dt; ctx.globalAlpha = Math.max(0, fx.life / 0.7); ctx.fillStyle = "#ff8c2a";
      ctx.font = "28px Bungee, sans-serif"; ctx.textAlign = "center"; ctx.fillText(fx.text, fx.x, fx.y - 50 - (0.7 - fx.life) * 60); ctx.globalAlpha = 1;
    }
    for (let i = effects.length - 1; i >= 0; i--) if (effects[i].life <= 0) effects.splice(i, 1);
    ctx.restore();
    drawWaypoint(me, W, H);
    updateHud(players, me);
    drawMini(players);
    if (mapOpen) drawMap();
  }

  // ---------- the wins and losses leaderboard (all games together), top right ----------
  let lbRows = null, lbAt = 0;
  async function loadBoard() {
    if (!T || !T.user) return;
    try { lbRows = (await T.api("/api/leaderboard?game=all")).rows; lbAt = Date.now(); renderBoard(); } catch (_) {}
  }
  function renderBoard() {
    const box = $("lb"); if (!lbRows) return;
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const played = lbRows.filter((r) => r.wins + r.losses > 0), top = played.slice(0, 8);
    const row = (r, rank) => `<li class="${r.id === myId ? "me" : ""}"><span class="n">${rank}</span><span class="who">${esc(r.username)}</span><span class="rec"><span class="w">${r.wins}W</span> <span class="l">${r.losses}L</span></span></li>`;
    let rows = top.map((r, i) => row(r, i + 1)).join("");
    const mine = lbRows.findIndex((r) => r.id === myId);
    if (mine >= 0 && !top.some((r) => r.id === myId)) rows += `<li class="gap">⋮</li>` + row(lbRows[mine], mine + 1);
    box.innerHTML = `<h2>🏆 Wins and losses <small>all games</small></h2>` + (rows ? `<ol>${rows}</ol>` : `<div class="none">No matches played yet. Be the first to win one.</div>`);
    box.hidden = false;
  }
  setInterval(loadBoard, 20000);

  // ---------- the big map: click the little one (or press M) to see where every game is, and put a marker on one ----------
  let mapOpen = false, waypoint = null, mapHits = [], mapHover = null, mapK = 1;
  const bmc = $("bmCanvas"), bctx = bmc.getContext("2d");
  function sizeMap() {
    const maxW = Math.min(innerWidth - 36, 1240), maxH = Math.max(240, innerHeight - 150);
    const k = Math.min(maxW / arena.w, maxH / arena.h), w = Math.round(arena.w * k), h = Math.round(arena.h * k), d = devicePixelRatio || 1;
    bmc.style.width = w + "px"; bmc.style.height = h + "px"; bmc.width = Math.round(w * d); bmc.height = Math.round(h * d); mapK = k;
  }
  function drawMap() {
    if (!mapOpen) return;
    const d = devicePixelRatio || 1, k = mapK, c = bctx;
    c.setTransform(d, 0, 0, d, 0, 0);
    const W = arena.w * k, H = arena.h * k;
    c.fillStyle = "#5a381c"; c.fillRect(0, 0, W, H);
    c.strokeStyle = "rgba(0, 0, 0, 0.12)"; c.lineWidth = 1;
    for (let y = 0; y < H; y += 24) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.strokeStyle = "#ff8c2a"; c.lineWidth = 4; c.strokeRect(2, 2, W - 4, H - 4);
    mapHits = [];
    // practice corner
    if (safe) {
      const x0 = safe.x0 * k, y0 = safe.y0 * k, w = (safe.x1 - safe.x0) * k, h = (safe.y1 - safe.y0) * k;
      c.fillStyle = "rgba(26, 15, 7, 0.35)"; c.fillRect(x0, y0, w, h);
      c.strokeStyle = "rgba(255, 140, 42, 0.6)"; c.lineWidth = 2; c.setLineDash([8, 6]); c.strokeRect(x0, y0, w, h); c.setLineDash([]);
      c.fillStyle = "#ffcf99"; c.font = "800 13px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("PRACTICE CORNER (play alone)", x0 + w / 2, y0 - 8);
    }
    if (showdown) {
      const sx = showdown.cx * k, sy = showdown.cy * k;
      c.fillStyle = "#06080c"; c.beginPath(); c.arc(sx, sy, showdown.abyss * k, 0, 7); c.fill(); c.strokeStyle = "#ff8c2a"; c.lineWidth = 2; c.stroke();
      c.fillStyle = "#a9733a"; c.beginPath(); c.arc(sx, sy, showdown.plat * k, 0, 7); c.fill();
      c.fillRect(showdown.bx0 * k, showdown.by0 * k, (showdown.bx1 - showdown.bx0) * k, (showdown.by1 - showdown.by0) * k);
      c.fillStyle = "#ffe9b8"; c.font = "800 13px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("⚔️ TUNG SHOWDOWN", sx, sy + 4);
      mapHits.push({ x: sx, y: sy, r: showdown.plat * k, l: { title: "Tung Showdown", icon: "⚔️", kind: "showdown", x: showdown.cx, y: showdown.by1 } });
    }
    c.textBaseline = "middle";
    for (const l of logs) {
      const x = l.x * k, y = l.y * k;
      if (l.kind === "solo") {
        c.font = "16px sans-serif"; c.textAlign = "center"; c.fillText(l.icon || "•", x, y);
        mapHits.push({ x, y, r: 13, l });
        continue;
      }
      const horiz = l.w >= l.h, w = Math.max(10, l.w * k), h = Math.max(10, l.h * k);
      c.fillStyle = logState[l.id] ? "#ff8c2a" : "#b07a40"; c.strokeStyle = "#3d2412"; c.lineWidth = 2;
      c.fillRect(x - w / 2, y - h / 2, w, h); c.strokeRect(x - w / 2, y - h / 2, w, h);
      const label = (l.icon ? l.icon + " " : "") + shortTitle(l.title) + (l.group ? " 👥" : "");
      c.font = "700 12px Nunito, sans-serif"; c.fillStyle = "#fff3e0";
      let lx = x, ly = y;
      if (horiz) { ly = y + (l.y < arena.h / 2 ? 1 : -1) * (h / 2 + 12); c.textAlign = "center"; }
      else if (l.x < arena.w / 2) { lx = x + w / 2 + 8; c.textAlign = "left"; } else { lx = x - w / 2 - 8; c.textAlign = "right"; }
      c.fillText(label, lx, ly);
      mapHits.push({ x, y, r: 30, l });
    }
    c.textBaseline = "alphabetic";
    // the center sign
    c.fillStyle = "rgba(255, 207, 153, 0.18)"; c.font = "800 40px Bungee, sans-serif"; c.textAlign = "center"; c.fillText("TUNG ARENA", W * 0.34, H * 0.36);
    // players
    const players = rendered();
    for (const p of players) {
      c.beginPath(); c.fillStyle = p.id === myId ? "#fff" : "#e0b07a"; c.arc(p.x * k, p.y * k, p.id === myId ? 6 : 4, 0, 7); c.fill();
      if (p.id === myId) { c.strokeStyle = "#ff8c2a"; c.lineWidth = 2; c.stroke(); c.fillStyle = "#fff"; c.font = "800 12px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("You", p.x * k, p.y * k - 12); }
    }
    // the marker
    if (waypoint) { drawPin(c, waypoint.x * k, waypoint.y * k, 1); }
    // hover tooltip
    if (mapHover) {
      const l = mapHover.l, text = (l.icon ? l.icon + " " : "") + l.title + (l.kind === "solo" ? " · play alone" : l.kind === "showdown" ? " · cross the bridge and bonk tungs off" : l.group ? ` · group log: ${l.need} to ${l.max} tungs` : " · stand here with another tung");
      c.font = "700 13px Nunito, sans-serif"; const tw = c.measureText(text).width + 18;
      let tx = Math.min(Math.max(mapHover.x - tw / 2, 6), W - tw - 6), ty = mapHover.y - 38; if (ty < 6) ty = mapHover.y + 20;
      c.fillStyle = "rgba(26, 15, 7, 0.95)"; c.fillRect(tx, ty, tw, 26); c.strokeStyle = "#ff8c2a"; c.lineWidth = 1.5; c.strokeRect(tx, ty, tw, 26);
      c.fillStyle = "#fff3e0"; c.textAlign = "left"; c.fillText(text, tx + 9, ty + 17);
    }
  }
  function drawPin(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = "#ff3b30"; c.strokeStyle = "#fff"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-14, -16, -10, -34, 0, -34); c.bezierCurveTo(10, -34, 14, -16, 0, 0); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(0, -22, 4.5, 0, 7); c.fill(); c.restore();
  }
  function openMap() { if (!joined) return; mapOpen = true; $("bigmap").hidden = false; sizeMap(); drawMap(); }
  function closeMap() { mapOpen = false; $("bigmap").hidden = true; mapHover = null; }
  function mapPoint(e) { const r = bmc.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function mapPick(e) {
    const p = mapPoint(e); let best = null, bd = 1e9;
    for (const h of mapHits) { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < h.r && d < bd) { best = h; bd = d; } }
    return best;
  }
  bmc.addEventListener("pointermove", (e) => { mapHover = mapPick(e); bmc.style.cursor = mapHover ? "pointer" : "default"; drawMap(); });
  bmc.addEventListener("click", (e) => {
    const h = mapPick(e); if (!h) return;
    waypoint = { x: h.l.x, y: h.l.y, title: shortTitle(h.l.title) + (h.l.group ? " (group)" : ""), icon: h.l.icon, kind: h.l.kind };
    feed(`Marker set on ${waypoint.title}${h.l.kind === "solo" ? " (practice corner)" : ""}`);
    closeMap();
  });
  $("mini").addEventListener("click", openMap);
  $("mini").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMap(); } });
  $("bmClose").addEventListener("click", closeMap);
  $("bmClear").addEventListener("click", () => { waypoint = null; drawMap(); });
  $("bigmap").addEventListener("pointerdown", (e) => { if (e.target === $("bigmap")) closeMap(); });
  addEventListener("resize", () => { if (mapOpen) { sizeMap(); drawMap(); } });
  addEventListener("keydown", (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.code === "KeyM" && !shopOpen) { e.preventDefault(); mapOpen ? closeMap() : openMap(); }
    if (e.code === "Escape" && mapOpen) closeMap();
  });
  // the marker, in the arena: a pin over the game when it is on screen, an arrow at the edge of the screen when it is not
  function drawWaypoint(me, W, H) {
    if (!waypoint || !me) return;
    const dx = waypoint.x - me.x, dy = waypoint.y - me.y, dist = Math.hypot(dx, dy);
    if (dist < 140) { waypoint = null; feed("You made it"); return; }
    const sx = waypoint.x - camera.x, sy = waypoint.y - camera.y, label = `${waypoint.icon ? waypoint.icon + " " : ""}${waypoint.title} · ${Math.round(dist / 10) * 10}`;
    ctx.save(); ctx.font = "800 14px Nunito, sans-serif"; ctx.textAlign = "center";
    if (sx > 40 && sx < W - 40 && sy > 90 && sy < H - 60) {
      const bob = Math.sin(performance.now() / 250) * 5;
      ctx.translate(sx, sy - 34 + bob); drawPin(ctx, 0, 0, 1.2); ctx.restore();
      ctx.save(); ctx.font = "800 14px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(26, 15, 7, 0.85)";
      const tw = ctx.measureText(label).width + 16; ctx.fillRect(sx - tw / 2, sy - 108 + bob, tw, 24); ctx.fillStyle = "#fff3e0"; ctx.fillText(label, sx, sy - 91 + bob);
    } else {
      const ang = Math.atan2(sy - H / 2, sx - W / 2), mx = W / 2 - 60, my = H / 2 - 80, t = Math.min(Math.abs(mx / Math.cos(ang || 1e-6)), Math.abs(my / Math.sin(ang || 1e-6)));
      const ex = W / 2 + Math.cos(ang) * t, ey = H / 2 + Math.sin(ang) * t;
      ctx.translate(ex, ey); ctx.rotate(ang);
      ctx.fillStyle = "#ff3b30"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-12, -16); ctx.lineTo(-4, 0); ctx.lineTo(-12, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.rotate(-ang);
      ctx.fillStyle = "rgba(26, 15, 7, 0.85)"; const tw = ctx.measureText(label).width + 16, ox = Math.cos(ang) * -50 - Math.cos(ang) * tw / 3, oy = Math.sin(ang) * -34;
      ctx.fillRect(ox - tw / 2, oy - 12, tw, 24); ctx.fillStyle = "#fff3e0"; ctx.fillText(label, ox, oy + 5);
    }
    ctx.restore();
  }

  // ---------- admins: remove users ----------
  let admUsers = [], admOpen = false, admSure = null;
  const admBtn = $("adminBtn");
  function syncAdmin() { admBtn.hidden = !(T && T.user && T.user.admin); }
  async function loadAdmin() {
    try { admUsers = (await T.api("/api/admin/users")).users; renderAdmin(); } catch (e) { $("admMsg").textContent = e.message; }
  }
  function renderAdmin() {
    const q = $("admFilter").value.trim().toLowerCase(), esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const rows = admUsers.filter((u) => !q || u.username.toLowerCase().includes(q));
    $("admList").innerHTML = rows.length ? rows.map((u) => `<div class="adm__row"><span class="who"><span class="dot${u.online ? " on" : ""}" title="${u.online ? "online" : "offline"}"></span><b>${esc(u.username)}</b>${u.admin ? '<span class="tag">admin</span>' : ""}</span><span class="rec">${u.wins}W ${u.losses}L</span>${u.admin || u.id === (T.user && T.user.id) ? "" : `<button type="button" data-id="${esc(u.id)}" class="${admSure === u.id ? "sure" : ""}">${admSure === u.id ? "Really remove?" : "Remove"}</button>`}</div>`).join("") : '<p>No users match.</p>';
  }
  function openAdmin() { admOpen = true; $("admin").hidden = false; $("admMsg").textContent = ""; admSure = null; for (const k of ["up", "down", "left", "right"]) input[k] = false; sendInput(); loadAdmin(); }
  function closeAdmin() { admOpen = false; $("admin").hidden = true; admSure = null; }
  admBtn.addEventListener("click", openAdmin);
  $("admClose").addEventListener("click", closeAdmin);
  $("admin").addEventListener("pointerdown", (e) => { if (e.target === $("admin")) closeAdmin(); });
  $("admFilter").addEventListener("input", renderAdmin);
  addEventListener("keydown", (e) => { if (e.code === "Escape" && admOpen) closeAdmin(); });
  $("admList").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-id]"); if (!b) return;
    const id = b.dataset.id;
    if (admSure !== id) { admSure = id; $("admMsg").textContent = "Click again to remove them for good."; renderAdmin(); return; }
    b.disabled = true;
    try {
      const r = await T.api("/api/admin/remove", { method: "POST", body: { id } });
      $("admMsg").textContent = `Removed ${r.removed}.`; admSure = null; await loadAdmin();
    } catch (err) { $("admMsg").textContent = err.message; admSure = null; renderAdmin(); }
  });
  if (T) { T.on("ready", syncAdmin); T.on("logout", syncAdmin); T.booted.then(syncAdmin); }

  // ---------- the shop and the wardrobe ----------
  let shopData = null, shopOpen = false, shopTab = "shop";
  async function loadShop() {
    if (!T || !T.user) return;
    try { shopData = await T.api("/api/shop"); renderBucks(); if (shopOpen) renderShop(); } catch (_) {}
  }
  function renderBucks() {
    if (!shopData) return;
    $("bucks").textContent = "🪙 " + shopData.balance; $("bucks").hidden = false; $("shopBtn").hidden = false;
  }
  function previewTung(cv, g, o = {}) {
    const c = cv.getContext("2d"), saved = ctx; ctx = c; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    const bg = c.createRadialGradient(cv.width / 2, cv.height / 2, 8, cv.width / 2, cv.height / 2, cv.width * 0.75);
    bg.addColorStop(0, "#8a5a30"); bg.addColorStop(1, "#43270f"); c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
    c.save(); c.translate(cv.width / 2 + (o.ox || 0), cv.height * (o.oy || 0.58)); c.scale(o.s || 1.1, o.s || 1.1);
    if (o.trail) for (let i = 0; i < 9; i++) drawBit(o.trail, -26 - i * 9, 30 - i * 5 + (i % 2) * 7, 1 - i / 10);
    drawTung({ f: 0.35, s: 0, st: 0, c: "#c8874a", g });
    c.restore(); ctx = saved;
  }
  function previewItem(cv, id) {
    const it = Shop.byId[id], o = { s: 1.15 };
    if (it.slot === "bat") { o.s = 1.05; o.ox = -cv.width * 0.3; }
    if (it.slot === "hat") { o.s = 1.0; o.oy = 0.67; }
    if (it.slot === "trail") { o.trail = id; o.ox = cv.width * 0.14; o.s = 1.0; }
    previewTung(cv, o.trail ? {} : { [it.slot]: id }, o);
  }
  const tierBadge = (t) => `<b class="tierbadge t${t}">${Shop.TIERS[t]}</b>`;
  const wearing = (it) => shopData && shopData.equipped[it.slot] === it.id;
  const owns = (id) => shopData && shopData.owned.includes(id);

  function itemCard(id) {
    const it = Shop.byId[id], d = shopData, own = owns(id);
    let action;
    if (own) action = wearing(it) ? `<button class="shop__btn" disabled>Wearing it</button>` : `<button class="shop__btn" data-act="equip" data-slot="${it.slot}" data-id="${id}">Wear it</button>`;
    else if (d.balance >= it.price) action = `<button class="shop__btn buy" data-act="buy" data-id="${id}">Buy for 🪙 ${it.price}</button>`;
    else action = `<button class="shop__btn" disabled>Need ${it.price - d.balance} more 🪙</button>`;
    return `<div class="shop__card tier-${it.tier}"><canvas width="132" height="132" data-item="${id}" aria-label="${it.name}"></canvas><div class="shop__name">${it.name}</div><div class="shop__meta">${tierBadge(it.tier)} · ${Shop.SLOT_NAMES[it.slot]} · 🪙 ${it.price}</div>${action}</div>`;
  }
  function renderShop() {
    const d = shopData; if (!d) return;
    $("shopBalance").textContent = `🪙 ${d.balance} tung buck${d.balance === 1 ? "" : "s"} · ${d.wins} multiplayer win${d.wins === 1 ? "" : "s"}${d.bonus ? ` + ${d.bonus} from the Showdown` : ""}`;
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === shopTab));
    const body = $("shopBody");
    if (shopTab === "shop") {
      const mins = Math.max(1, Math.floor(d.resetsIn / 60000)), left = `${Math.floor(mins / 60)}h ${mins % 60}m`;
      body.innerHTML = `<p class="shop__note">Six new items every day at 8:00 AM Eastern, one for each part of your tung. The four tiers are Tung, Tung Tung, Tung Tung Tung and Triple T Sahur: the higher the tier, the rarer it is in the shop. You earn one tung buck for every multiplayer win. New items in ${left}.</p><div class="shop__grid">${d.today.map(itemCard).join("")}</div>`;
    } else {
      const rows = Shop.SLOTS.map((slot) => {
        const mine = Shop.ITEMS.filter((it) => it.slot === slot && owns(it.id));
        const none = `<button class="shop__tile${d.equipped[slot] ? "" : " on"}" data-act="equip" data-slot="${slot}" data-id="">None</button>`;
        const tiles = mine.map((it) => `<button class="shop__tile tier-${it.tier}${wearing(it) ? " on" : ""}" data-act="equip" data-slot="${slot}" data-id="${it.id}" title="${it.name}"><canvas width="64" height="64" data-item="${it.id}"></canvas><span>${it.name}</span></button>`).join("");
        return `<div class="ward__row"><b>${Shop.SLOT_NAMES[slot]}</b><div class="ward__items">${none}${tiles}${mine.length ? "" : '<em>Nothing yet</em>'}</div></div>`;
      }).join("");
      body.innerHTML = `<div class="ward"><div class="ward__me"><canvas id="mePreview" width="220" height="250" aria-label="Your tung"></canvas></div><div class="ward__rows">${rows}</div></div>`;
      const g = {}; for (const slot of Shop.SLOTS) if (d.equipped[slot]) g[slot] = d.equipped[slot];
      previewTung($("mePreview"), g, { s: 1.6, oy: 0.6 });
    }
    body.querySelectorAll("canvas[data-item]").forEach((cv) => previewItem(cv, cv.dataset.item));
  }
  function shopMsg(text) { $("shopMsg").textContent = text || ""; }
  function openShop() {
    shopOpen = true; $("shop").hidden = false; shopMsg("");
    for (const k of ["up", "down", "left", "right"]) input[k] = false;
    sendInput(); loadShop(); renderShop();
  }
  function closeShop() { shopOpen = false; $("shop").hidden = true; }
  $("shopBtn").addEventListener("click", openShop);
  $("bucks").addEventListener("click", openShop);
  $("shopClose").addEventListener("click", closeShop);
  $("shop").addEventListener("pointerdown", (e) => { if (e.target === $("shop")) closeShop(); });
  addEventListener("keydown", (e) => { if (e.code === "Escape" && shopOpen) closeShop(); });
  $("shopTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { shopTab = b.dataset.tab; shopMsg(""); renderShop(); } });
  $("shopBody").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
    b.disabled = true; shopMsg("");
    try {
      if (b.dataset.act === "buy") {
        const id = b.dataset.id, it = Shop.byId[id];
        shopData = await T.api("/api/shop/buy", { method: "POST", body: { id } });
        shopData = await T.api("/api/shop/equip", { method: "POST", body: { slot: it.slot, id } }); // wear it straight away
        shopMsg(`You bought the ${it.name} and put it on.`);
      } else shopData = await T.api("/api/shop/equip", { method: "POST", body: { slot: b.dataset.slot, id: b.dataset.id } });
      renderBucks();
    } catch (err) { shopMsg(err.message); }
    renderShop();
  });
  setInterval(loadShop, 60000);

  window.__arena = { msg: onMsg, draw, logs: () => logs, myId: () => myId, setShop: (d) => { shopData = d; renderBucks(); }, openShop, previewItem, wear: (g) => { for (const p of snapshots[snapshots.length - 1].players) if (p.id === myId) p.g = g; } };
})();
