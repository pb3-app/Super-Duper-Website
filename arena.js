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

  let myId = null, arena = { w: 4600, h: 3200 }, radius = 28, holdSecs = 10, safe = null;
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
        myId = m.you; arena = m.arena; radius = m.radius; holdSecs = m.hold; logs = m.logs; safe = m.safe; joined = true;
        $("gate").hidden = true; $("scores").hidden = false;
        loadShop();
        break;
      case "arena_state":
        serverOffset = Date.now() - m.ts;
        logState = {}; for (const l of m.logs) logState[l[0]] = l;
        snapshots.push(m); while (snapshots.length > 30) snapshots.shift();
        break;
      case "arena_event":
        if (m.type === "bonk") { effects.push({ x: m.x, y: m.y, life: 0.7, text: "TUNG!" }); feed(`${m.from} bonked ${m.to}`); }
        else if (m.type === "safe") feed("No bonking on logs or in the practice corner");
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
    if (shopOpen || (e.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName))) return;
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
    if (id === "candy") fill = "#ffffff";
    else if (id === "baguette") fill = grad([0, "#e8c07a"], [1, "#c98f43"]);
    else if (id === "ice") fill = grad([0, "#e6f9ff"], [1, "#62c1ff"]);
    else if (id === "flame") fill = grad([0, "#ffd23f"], [0.55, "#ff8a2a"], [1, "#ff3d2b"]);
    else if (id === "goldbat") fill = grad([0, "#fff1a8"], [0.5, "#ffd23f"], [1, "#c9971a"]);
    ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.lineWidth = 3; path(); ctx.fill();
    ctx.save(); path(); ctx.clip();
    if (id === "candy") { ctx.strokeStyle = "#e63946"; ctx.lineWidth = 7; for (let x = r * 0.4; x < r * 3; x += 16) { ctx.beginPath(); ctx.moveTo(x, -14); ctx.lineTo(x + 12, 14); ctx.stroke(); } }
    if (id === "baguette") { ctx.strokeStyle = "rgba(120, 70, 20, 0.55)"; ctx.lineWidth = 2.5; for (let x = r * 1.1; x < r * 2.6; x += 15) { ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x + 7, 5); ctx.stroke(); } }
    if (id === "goldbat" || id === "ice") { ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; ctx.fillRect(r * 0.7, -8, r * 2.2, 3); }
    ctx.restore(); path(); ctx.stroke();
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
    ctx.save(); ctx.rotate(p.f + (p.s ? -1.2 : 0.6)); drawBat(r, g.bat); ctx.restore();
    const bw = r * 1.5, bh = r * 2.1, ci = g.color && Shop.byId[g.color];
    ctx.fillStyle = p.st ? "#ffcf99" : ci ? ci.fill : p.c; ctx.strokeStyle = INK; ctx.lineWidth = 3; rr(-bw / 2, -bh / 2, bw, bh, 12); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(61, 36, 18, 0.35)"; ctx.lineWidth = 2;
    for (const gx of [-bw * 0.25, bw * 0.22]) { ctx.beginPath(); ctx.moveTo(gx, -bh * 0.4); ctx.lineTo(gx + 2, bh * 0.4); ctx.stroke(); }
    if (g.wear === "tee" || g.wear === "scarf" || g.wear === "bowtie") drawWear(g.wear);
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
    ctx.save(); ctx.translate(p.x, p.y); drawTung(p); ctx.restore();
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
      trailBits.push({ kind: g.trail, x: p.x + (Math.random() - 0.5) * 14, y: p.y + radius * 0.7 + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 20, vy: g.trail === "flames" || g.trail === "bubbles" || g.trail === "hearts" ? -30 - Math.random() * 30 : (Math.random() - 0.5) * 20, life: 0.8, max: 0.8 });
    }
    lastAt[p.id] = { x: p.x, y: p.y };
  }
  function drawBit(kind, x, y, k) { // k: 1 fresh, 0 gone
    ctx.globalAlpha = Math.max(0, k);
    if (kind === "bubbles") { ctx.strokeStyle = "#bfe6ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 3 + (1 - k) * 6, 0, 7); ctx.stroke(); }
    else if (kind === "sparkles") { ctx.fillStyle = k > 0.5 ? "#fff6b0" : "#ffd23f"; star(x, y, 3 + k * 6); ctx.fill(); }
    else if (kind === "flames") { ctx.fillStyle = k > 0.55 ? "#ffd23f" : "#ff5a2b"; ctx.beginPath(); ctx.arc(x, y, 3 + k * 8, 0, 7); ctx.fill(); }
    else if (kind === "hearts") { ctx.fillStyle = "#ff5fa2"; heart(x, y, 3 + k * 5); ctx.fill(); }
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
    if (safe) { mctx.fillStyle = "rgba(255, 207, 153, 0.25)"; mctx.fillRect(safe.x0 * k, safe.y0 * k, (safe.x1 - safe.x0) * k, (safe.y1 - safe.y0) * k); }
    for (const l of logs) { if (l.kind === "solo") continue; const st = logState[l.id]; mctx.fillStyle = st ? "#ff8c2a" : "#a9733a"; mctx.fillRect((l.x - l.w / 2) * k, (l.y - l.h / 2) * k, Math.max(3, l.w * k), Math.max(3, l.h * k)); }
    for (const p of players) { mctx.fillStyle = p.id === myId ? "#ffffff" : "#e0b07a"; mctx.beginPath(); mctx.arc(p.x * k, p.y * k, p.id === myId ? 4 : 2.5, 0, 7); mctx.fill(); }
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
    updateHud(players, me);
    drawMini(players);
  }

  // ---------- the shop and the wardrobe ----------
  let shopData = null, shopOpen = false, shopTab = "shop";
  const RARITY = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic" };
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
  const wearing = (it) => shopData && shopData.equipped[it.slot] === it.id;
  const owns = (id) => shopData && shopData.owned.includes(id);

  function itemCard(id) {
    const it = Shop.byId[id], d = shopData, own = owns(id);
    let action;
    if (own) action = wearing(it) ? `<button class="shop__btn" disabled>Wearing it</button>` : `<button class="shop__btn" data-act="equip" data-slot="${it.slot}" data-id="${id}">Wear it</button>`;
    else if (d.balance >= it.price) action = `<button class="shop__btn buy" data-act="buy" data-id="${id}">Buy for 🪙 ${it.price}</button>`;
    else action = `<button class="shop__btn" disabled>Need ${it.price - d.balance} more 🪙</button>`;
    return `<div class="shop__card rar-${it.rarity}"><canvas width="132" height="132" data-item="${id}" aria-label="${it.name}"></canvas><div class="shop__name">${it.name}</div><div class="shop__meta">${RARITY[it.rarity]} · ${Shop.SLOT_NAMES[it.slot]} · 🪙 ${it.price}</div>${action}</div>`;
  }
  function renderShop() {
    const d = shopData; if (!d) return;
    $("shopBalance").textContent = `🪙 ${d.balance} tung buck${d.balance === 1 ? "" : "s"} · ${d.wins} multiplayer win${d.wins === 1 ? "" : "s"}`;
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === shopTab));
    const body = $("shopBody");
    if (shopTab === "shop") {
      const mins = Math.max(1, Math.floor(d.resetsIn / 60000)), left = `${Math.floor(mins / 60)}h ${mins % 60}m`;
      body.innerHTML = `<p class="shop__note">Six new items every day, one for each part of your tung. You earn one tung buck for every multiplayer win. New items in ${left}.</p><div class="shop__grid">${d.today.map(itemCard).join("")}</div>`;
    } else {
      const rows = Shop.SLOTS.map((slot) => {
        const mine = Shop.ITEMS.filter((it) => it.slot === slot && owns(it.id));
        const none = `<button class="shop__tile${d.equipped[slot] ? "" : " on"}" data-act="equip" data-slot="${slot}" data-id="">None</button>`;
        const tiles = mine.map((it) => `<button class="shop__tile${wearing(it) ? " on" : ""}" data-act="equip" data-slot="${slot}" data-id="${it.id}" title="${it.name}"><canvas width="64" height="64" data-item="${it.id}"></canvas><span>${it.name}</span></button>`).join("");
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

  window.__arena = { msg: onMsg, draw, logs: () => logs, setShop: (d) => { shopData = d; renderBucks(); }, openShop, previewItem, wear: (g) => { for (const p of snapshots[snapshots.length - 1].players) if (p.id === myId) p.g = g; } };
})();
