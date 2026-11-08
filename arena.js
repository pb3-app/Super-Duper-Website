// Tung Arena - browser side. The server runs the world; this page sends inputs and draws what the server says.
window.__tungArena = true; // mp.js reads this: a game started from here sends you back here when it ends
try { sessionStorage.removeItem("tungArenaReturn"); } catch (_) {}

(() => {
  const T = window.TungMP;
  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  let ctx = canvas.getContext("2d");
  const mainCtx = ctx;
  const Shop = window.TungShop, G = window.TungGear;
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
        myId = m.you; arena = m.arena; radius = m.radius; holdSecs = m.hold; logs = m.logs; safe = m.safe; showdown = m.showdown; sdBoard = m.board || sdBoard; wheel = m.wheel ? { ...m.wheel } : null; wheelSpin = null; if (chatLog.childElementCount === 0) for (const c of m.chat || []) addChat(c, false); me$ = { bonks: m.bonks || 0, pct: Math.round(Math.min(1, Math.floor((m.bonks || 0) / 10) / 10) * 100) }; joined = true;
        $("gate").hidden = true; $("scores").hidden = false;
        loadShop(); loadBoard();
        break;
      case "arena_chat": addChat(m, true); break;
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
        else if (m.type === "chatslow") feed("Slow down a little: too many chat messages")
        else if (m.type === "safe") feed("No bonking on logs or in the practice corner");
        else if (m.type === "join") feed(`${m.name} joined`);
        else if (m.type === "leave") feed(`${m.name} left`);
        else if (m.type === "wheel" && wheel) {
          wheelSpin = { from: m.from, to: m.to, t0: performance.now(), ms: m.ms }; wheel.rot = m.to; wheelEventAt = performance.now();
          const mine = T.user && m.name === T.user.username;
          feed(mine ? "🎡 You spun the prize wheel..." : `🎡 ${m.name} spun the prize wheel...`);
          setTimeout(() => {
            feed(`🎡 ${mine ? "You" : m.name} won ${m.text}${m.big ? " 🎉" : ""}!`);
            effects.push({ x: wheel.x, y: wheel.y - wheel.r - 80, life: 0.7, text: m.big ? "JACKPOT!" : "TUNG!" });
            if (m.big) bonkSound(0.9);
            if (mine) loadShop();
          }, m.ms + 200);
        }
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
    for (const t of ["arena_welcome", "arena_chat", "arena_state", "arena_event", "arena_solo", "arena_room", "arena_full", "arena_sd", "arena_me"]) T.on("msg:" + t, onMsg);
    T.on("ready", () => { refreshGate(); join(); });
    T.on("logout", () => { joined = false; chatBox.hidden = true;  myId = null; snapshots.length = 0; refreshGate(); });
    T.booted.then(() => { refreshGate(); join(); });
  }
  function feed(text) {
    const div = document.createElement("div"); div.textContent = text; $("feed").appendChild(div);
    while ($("feed").children.length > 5) $("feed").firstChild.remove();
    setTimeout(() => div.remove(), 5000);
  }

  // ---------- global chat: lines at the bottom right, and a bubble over the speaker's head ----------
  const chatBox = $("chat"), chatLog = $("chatLog"), chatForm = $("chatForm"), chatInput = $("chatInput");
  const bubbles = {}; // player id -> { lines, born }
  let chatOpen = false;
  const BUBBLE_MS = 7000, LINE_MS = 14000;
  function addChat(m, live) {
    const mine = m.id === myId, div = document.createElement("div");
    div.className = "line" + (mine ? " me" : ""); div.dataset.ts = String(live ? Date.now() : m.ts || 0);
    const b = document.createElement("b"); b.textContent = m.name; div.append(b, document.createTextNode(m.text));
    chatLog.appendChild(div);
    while (chatLog.childElementCount > 40) chatLog.firstChild.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
    if (!joined) return;
    chatBox.hidden = false; fadeChat();
    if (live) bubbles[m.id] = { text: m.text, born: performance.now() };
  }
  function fadeChat() {
    const now = Date.now();
    for (const d of chatLog.children) d.classList.toggle("old", !chatOpen && now - Number(d.dataset.ts) > LINE_MS);
  }
  setInterval(fadeChat, 1000);
  function openChat() {
    if (!joined || chatOpen) return;
    chatOpen = true; chatBox.hidden = false; chatBox.classList.add("open"); chatForm.hidden = false; fadeChat(); chatLog.scrollTop = chatLog.scrollHeight;
    for (const k of ["up", "down", "left", "right"]) input[k] = false; touchTarget = null; sendInput();
    setTimeout(() => chatInput.focus(), 0);
  }
  function closeChat() { chatOpen = false; chatBox.classList.remove("open"); chatForm.hidden = true; chatInput.value = ""; chatInput.blur(); fadeChat(); }
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text && joined) T.send({ t: "arena_chat", text });
    closeChat();
  });
  chatInput.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeChat(); } });
  $("chatBtn").addEventListener("click", () => (chatOpen ? closeChat() : openChat()));
  // the bubble over a head: wraps long lines, fades out at the end
  function drawBubble(p, topY) {
    const bb = bubbles[p.id]; if (!bb) return;
    const age = performance.now() - bb.born; if (age > BUBBLE_MS) { delete bubbles[p.id]; return; }
    const c = ctx; c.save();
    c.globalAlpha = age > BUBBLE_MS - 600 ? Math.max(0, (BUBBLE_MS - age) / 600) : 1;
    c.font = "700 15px Nunito, sans-serif";
    const maxW = 210, words = bb.text.split(" "), lines = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    if (lines.length > 4) { lines.length = 4; lines[3] = lines[3].slice(0, -1) + "…"; }
    const w = Math.min(maxW + 8, Math.max(...lines.map((l) => c.measureText(l).width)) + 20), h = lines.length * 19 + 14, x = p.x - w / 2, y = topY - h - 10;
    c.fillStyle = "#fff8ea"; c.strokeStyle = "#2b1a0e"; c.lineWidth = 3;
    c.beginPath(); c.roundRect(x, y, w, h, 12); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(p.x - 7, y + h - 1); c.lineTo(p.x, y + h + 9); c.lineTo(p.x + 7, y + h - 1); c.fill();
    c.beginPath(); c.moveTo(p.x - 7, y + h); c.lineTo(p.x, y + h + 9); c.lineTo(p.x + 7, y + h); c.stroke();
    c.fillStyle = "#2b1a0e"; c.textAlign = "center"; c.textBaseline = "top";
    lines.forEach((l, i) => c.fillText(l, p.x, y + 8 + i * 19));
    c.restore();
  }

  // ---------- the prize wheel that stands in the arena ----------
  let wheel = null, wheelSpin = null, wheelImg = null, wheelBusy = false, wheelNear = false, wheelEventAt = 0, wheelTick = 0;
  const hm = (ms) => { const m = Math.max(1, Math.floor(ms / 60000)); return `${Math.floor(m / 60)}h ${m % 60}m`; };
  function wheelAngle() {
    if (!wheel) return 0;
    if (!wheelSpin) return wheel.rot;
    const t = (performance.now() - wheelSpin.t0) / wheelSpin.ms;
    if (t >= 1) { wheelSpin = null; return wheel.rot; }
    return wheelSpin.from + (wheelSpin.to - wheelSpin.from) * (1 - Math.pow(1 - Math.max(0, t), 4));
  }
  function tickSound(v) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = "triangle"; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.05);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.02, v * 0.3), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.08);
    } catch (_) {}
  }
  function wheelPrompt() {
    const d = T.daily, touch = matchMedia("(pointer: coarse)").matches;
    if (wheelSpin) return { text: "🎡 The wheel is spinning...", btn: null };
    if (!d) return { text: "🎡 Prize wheel", btn: null };
    if (d.pending && d.pending.length) return { text: `🎁 Your week ${d.pending[0] / 7} streak prize is ready: ${touch ? "tap Claim" : "press E"} to claim it`, btn: "🎁 Claim" };
    if (d.canSpin) return { text: `🎡 Prize wheel: ${touch ? "tap Spin" : "press E"} to spin!`, btn: "🎡 Spin!" };
    return { text: `🎡 You already spun today. Next spin in ${hm(d.resetsIn)} (${touch ? "tap" : "press E"} for your streak)`, btn: "🔥 Streak" };
  }
  async function useWheel() {
    if (!joined || !wheel || wheelBusy || !wheelNear) return;
    if (wheelSpin) { feed("The wheel is still spinning"); return; }
    const d = T.daily;
    if (!d) { T.loadDaily(); feed("Checking your daily spin..."); return; }
    if (!d.canSpin) { openShop("daily"); return; }
    wheelBusy = true;
    const t0 = performance.now();
    try {
      const r = await T.api("/api/daily/spin", { method: "POST" });
      await new Promise((res) => setTimeout(res, 4800));
      T.applyDaily(r.state); loadShop();
      if (wheelEventAt < t0) { const p = r.prize; feed(`🎡 You won ${p.kind === "item" ? p.name : p.n + " tung buck" + (p.n === 1 ? "" : "s")}!`); } // the broadcast never reached us
    } catch (err) { feed(err.message || "Could not spin"); }
    wheelBusy = false;
  }
  function drawWheelProp(me) {
    if (!wheel) return;
    const { x, y, r } = wheel, c = ctx, W = innerWidth, H = innerHeight;
    if (x + r + 150 < camera.x || x - r - 150 > camera.x + W || y + r + 200 < camera.y || y - r - 200 > camera.y + H) return;
    if (!wheelImg && T.wheelFace) wheelImg = T.wheelFace(520);
    const ang = wheelAngle(), spinning = !!wheelSpin, now = performance.now(), d = T.daily, ready = !!(d && (d.canSpin || (d.pending && d.pending.length)));
    const k = Math.floor((ang + 15) / 30);
    if (spinning && k !== wheelTick) { const dd = me ? Math.hypot(me.x - x, me.y - y) : 9999; if (dd < 1500) tickSound(1 - dd / 1600); }
    wheelTick = k;
    // the rug it stands on
    c.fillStyle = "rgba(0,0,0,0.3)"; c.beginPath(); c.ellipse(x, y + r * 0.92, r * 1.25, r * 0.34, 0, 0, 7); c.fill();
    c.fillStyle = "#4a2c14"; c.beginPath(); c.arc(x, y, r + 56, 0, 7); c.fill();
    c.strokeStyle = "#ff8c2a"; c.lineWidth = 5; c.setLineDash([16, 12]); c.stroke(); c.setLineDash([]);
    if (ready) { c.globalAlpha = 0.35 + 0.25 * Math.sin(now / 260); c.strokeStyle = "#ffd27a"; c.lineWidth = 10; c.beginPath(); c.arc(x, y, r + 70, 0, 7); c.stroke(); c.globalAlpha = 1; }
    // wooden rim and its lights
    c.fillStyle = "#5a3515"; c.strokeStyle = "#2b1a0e"; c.lineWidth = 6; c.beginPath(); c.arc(x, y, r + 18, 0, 7); c.fill(); c.stroke();
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2, on = spinning ? (Math.floor(now / 90) + i) % 2 === 0 : (Math.floor(now / 500) + i) % 4 === 0;
      c.fillStyle = on ? "#ffe08a" : "#8a5a30"; c.beginPath(); c.arc(x + Math.cos(a) * (r + 9), y + Math.sin(a) * (r + 9), 4.5, 0, 7); c.fill();
    }
    // the wheel itself
    if (wheelImg) { const s = r / 0.957; c.save(); c.translate(x, y); c.rotate(ang * Math.PI / 180); c.drawImage(wheelImg, -s, -s, s * 2, s * 2); c.restore(); }
    // the pointer
    c.fillStyle = "#ff3b2f"; c.strokeStyle = "#2b1a0e"; c.lineWidth = 4; c.beginPath(); c.moveTo(x - 20, y - r - 34); c.lineTo(x + 20, y - r - 34); c.lineTo(x, y - r + 12); c.closePath(); c.fill(); c.stroke();
    // the sign
    c.textAlign = "center"; c.font = "26px Bungee, sans-serif"; c.lineWidth = 6; c.strokeStyle = "#2b1a0e"; c.strokeText("DAILY WHEEL", x, y - r - 52); c.fillStyle = "#ffcf99"; c.fillText("DAILY WHEEL", x, y - r - 52);
    if (ready && !spinning) { c.font = "800 16px Nunito, sans-serif"; c.fillStyle = "#ffe08a"; c.fillText("★ spin ready ★", x, y + r + 84); }
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
    if (e.key === "/" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openChat(); return; }
    if (keyMap[e.code]) { input[keyMap[e.code]] = true; e.preventDefault(); sendInput(); }
    if (e.code === "Space") { bonk(); e.preventDefault(); }
    if (e.code === "KeyE" && wheelNear) { useWheel(); e.preventDefault(); }
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
  $("wheelBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); useWheel(); });
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

  // the whole tung at (0, 0): used on the map and in the shop previews
  function drawTung(p) {
    const r = radius, g = gearIds(p), t = performance.now() / 1000;
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0, r * 0.9, r, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    if (g.wear && G.isBehind(g.wear)) G.behind(ctx, g.wear, t);
    ctx.save(); ctx.rotate(p.f + (p.s ? -1.2 : 0.6)); G.bat(ctx, r, g.bat); ctx.restore();
    const bw = r * 1.5, bh = r * 2.1, ci = g.color && Shop.byId[g.color];
    ctx.fillStyle = p.st ? "#ffcf99" : ci ? G.skinFill(ctx, ci, bh) : p.c; ctx.strokeStyle = INK; ctx.lineWidth = 3; rr(-bw / 2, -bh / 2, bw, bh, 12); ctx.fill(); ctx.stroke();
    if (ci && ci.pattern && !p.st) G.skin(ctx, ci.pattern, bw, bh, t);
    ctx.strokeStyle = "rgba(61, 36, 18, 0.35)"; ctx.lineWidth = 2;
    for (const gx of [-bw * 0.25, bw * 0.22]) { ctx.beginPath(); ctx.moveTo(gx, -bh * 0.4); ctx.lineTo(gx + 2, bh * 0.4); ctx.stroke(); }
    if (g.wear && !G.isBehind(g.wear)) G.wear(ctx, g.wear);
    const lx = Math.cos(p.f) * 3, ly = Math.sin(p.f) * 3;
    for (const ex of [-8, 8]) {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, -10, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a0f07"; ctx.beginPath(); ctx.arc(ex + lx, -10 + ly, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "#1a0f07"; ctx.lineWidth = 3; ctx.beginPath();
    if (p.st) ctx.arc(0, 10, 5, 0, Math.PI * 2); else ctx.arc(0, 4, 9, 0.2, Math.PI - 0.2);
    ctx.stroke();
    if (g.face) G.face(ctx, g.face);
    if (g.hat) G.hat(ctx, g.hat, t);
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
    drawBubble(p, p.y - r * 2.1 - (gearIds(p).hat ? 22 : 0) - 24 - (p.k > 0 ? 22 : 0) - (isMe ? 12 : 0));
    if (isMe) { const o = gearIds(p).hat ? 22 : 0; ctx.fillStyle = "#ff8c2a"; ctx.beginPath(); ctx.moveTo(p.x - 6, p.y - r * 2.6 - o); ctx.lineTo(p.x + 6, p.y - r * 2.6 - o); ctx.lineTo(p.x, p.y - r * 2.35 - o); ctx.fill(); }
  }

  // ---------- trails: a little show behind a tung that wears one ----------
  const trailBits = [], lastAt = {};
  function trailTick(p, dt) {
    const g = gearIds(p);
    if (!g.trail) { delete lastAt[p.id]; return; }
    const l = lastAt[p.id];
    if (l && Math.hypot(p.x - l.x, p.y - l.y) > 5 && trailBits.length < 400) {
      trailBits.push({ kind: g.trail, x: p.x + (Math.random() - 0.5) * 14, y: p.y + radius * 0.7 + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 20, vy: G.trailRise(g.trail) < 0 ? -30 - Math.random() * 30 : G.trailRise(g.trail) > 0 ? 20 + Math.random() * 30 : (Math.random() - 0.5) * 20, life: 0.8, max: 0.8 });
    }
    lastAt[p.id] = { x: p.x, y: p.y };
  }
  function drawTrails(dt) {
    for (const b of trailBits) { b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; G.bit(ctx, b.kind, b.x, b.y, b.life / b.max); }
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
    if (wheel) { mctx.fillStyle = "#ffd27a"; mctx.beginPath(); mctx.arc(wheel.x * k, wheel.y * k, 5, 0, 7); mctx.fill(); mctx.strokeStyle = "#7a4a1f"; mctx.lineWidth = 1.5; mctx.stroke(); }
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
    const st = $("status"), wb = $("wheelBtn");
    wheelNear = !!(me && wheel && Math.hypot(me.x - wheel.x, me.y - wheel.y) < wheel.r + 110);
    if (wheelNear) {
      const pr = wheelPrompt(); st.textContent = pr.text; st.hidden = false;
      wb.hidden = !pr.btn; if (pr.btn && wb.textContent !== pr.btn) wb.textContent = pr.btn;
      return;
    }
    wb.hidden = true;
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
    drawWheelProp(me);
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
    if (wheel) {
      const wx = wheel.x * k, wy = wheel.y * k;
      c.fillStyle = "#e0a91a"; c.strokeStyle = "#3d2412"; c.lineWidth = 2; c.beginPath(); c.arc(wx, wy, 17, 0, 7); c.fill(); c.stroke();
      c.font = "18px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#fff"; c.fillText("🎡", wx, wy + 1);
      c.font = "700 12px Nunito, sans-serif"; c.fillStyle = "#fff3e0"; c.fillText("Daily wheel", wx, wy + 32);
      mapHits.push({ x: wx, y: wy, r: 26, l: { title: "Daily wheel", icon: "🎡", kind: "wheel", x: wheel.x, y: wheel.y + wheel.r + 70 } });
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
      const l = mapHover.l, text = (l.icon ? l.icon + " " : "") + l.title + (l.kind === "solo" ? " · play alone" : l.kind === "wheel" ? " · spin once a day for prizes" : l.kind === "showdown" ? " · cross the bridge and bonk tungs off" : l.group ? ` · group log: ${l.need} to ${l.max} tungs` : " · stand here with another tung");
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
  let catTier = 0, catSlot = "all", catOwn = "all"; // the catalogue filters
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
    if (o.trail) for (let i = 0; i < 9; i++) G.bit(ctx, o.trail, -26 - i * 9, 30 - i * 5 + (i % 2) * 7, 1 - i / 10);
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
    $("shopBalance").textContent = `🪙 ${d.balance} tung buck${d.balance === 1 ? "" : "s"} · ${d.wins} multiplayer win${d.wins === 1 ? "" : "s"}${d.bonus ? ` + ${d.bonus} from the Showdown and daily prizes` : ""}`;
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === shopTab));
    const body = $("shopBody");
    if (shopTab === "shop") {
      const mins = Math.max(1, Math.floor(d.resetsIn / 60000)), left = `${Math.floor(mins / 60)}h ${mins % 60}m`;
      body.innerHTML = `<p class="shop__note">Six new items every day at 8:00 AM Eastern, one for each part of your tung. The four tiers are Tung, Tung Tung, Tung Tung Tung and Triple T Sahur: the higher the tier, the rarer it is in the shop. You earn one tung buck for every multiplayer win. New items in ${left}.</p><div class="shop__grid">${d.today.map(itemCard).join("")}</div>`;
    } else if (shopTab === "daily") {
      const dd = T.daily;
      if (!dd) { body.innerHTML = '<p class="shop__note">Loading your streak...</p>'; return; }
      const pos = dd.streak % 7 === 0 && dd.streak > 0 ? 7 : dd.streak % 7;
      const dots = Array.from({ length: 7 }, (_, i) => `<span class="dstreak__dot${i + 1 <= pos ? " on" : ""}${i === 6 ? " big" : ""}">${i === 6 ? "🎁" : i + 1}</span>`).join("");
      const nextWeek = dd.nextPrize.week, weeks = [];
      for (let w = Math.max(1, nextWeek - 1); weeks.length < 4; w++) weeks.push(w);
      const ladder = weeks.map((w) => {
        const t = w % 2 === 1 ? 3 : 4, b = Math.min(20, 5 * w), done = w < nextWeek || (dd.pending || []).includes(w * 7);
        return `<div class="dstreak__week${w === nextWeek ? " now" : ""}${done ? " done" : ""}"><b>Week ${w}</b><span class="dw dw${t}">${Shop.TIERS[t]} item</span><span>+${b} 🪙</span><small>${w * 7} days${done ? " ✔" : ""}</small></div>`;
      }).join("");
      const claim = dd.pending && dd.pending.length ? `<button class="shop__btn buy" data-act="claimweek">🎉 Claim your week ${dd.pending[0] / 7} prize!</button>` : "";
      const spin = dd.canSpin ? `<p class="dstreak__spin ready">🎡 Your daily spin is ready! Go to the wheel in the arena (the little 🎡 on the map).</p>` : `<p class="dstreak__spin">🎡 You already spun today. Next spin in ${hm(dd.resetsIn)}.</p>`;
      body.innerHTML = `<div class="dstreak"><div class="dstreak__top"><b>🔥 ${dd.streak} day${dd.streak === 1 ? "" : "s"} in a row</b><small>best ${dd.best}</small></div>
        <div class="dstreak__dots">${dots}</div>
        <p class="shop__note">Log in every day (it changes at 8:00 AM Eastern). ${dd.daysLeft > 0 ? dd.daysLeft + " more day" + (dd.daysLeft === 1 ? "" : "s") : "Today"} until the week ${nextWeek} prize: a ${dd.nextPrize.tierName} item and ${dd.nextPrize.bucks} 🪙. Miss a day and the streak starts over.</p>
        ${claim}<div class="dstreak__ladder">${ladder}</div>${spin}
        <div class="dstreak__actions"><button class="shop__btn" data-act="wheelwp">📍 Mark the wheel on my map</button>${wheel ? '<button class="shop__btn" data-act="openwheel">🎡 Daily window</button>' : ""}</div></div>`;
    } else if (shopTab === "cat") {
      const todaySet = new Set(d.today), all = Shop.ITEMS;
      const items = all.filter((it) => (!catTier || it.tier === catTier) && (catSlot === "all" || it.slot === catSlot) && (catOwn === "all" || (catOwn === "owned") === owns(it.id)))
        .sort((a, b) => a.tier - b.tier || Shop.SLOTS.indexOf(a.slot) - Shop.SLOTS.indexOf(b.slot) || a.name.localeCompare(b.name));
      const chip = (kind, val, label, on) => `<button type="button" class="cat__chip${on ? " on" : ""}" data-filter="${kind}:${val}">${label}</button>`;
      const ownedN = all.filter((it) => owns(it.id)).length;
      const cardHtml = (it) => {
        const own = owns(it.id), pct = Shop.chanceOf(it) * 100, odds = pct >= 10 ? Math.round(pct) + "%" : pct >= 1 ? pct.toFixed(1) + "%" : "<1%";
        const status = own ? `<span class="cat__st own">✔ Owned${wearing(it) ? " · wearing" : ""}</span>` : todaySet.has(it.id) ? `<span class="cat__st now">🛍 In today's shop</span>` : `<span class="cat__st">🔒 Not owned</span>`;
        return `<div class="shop__card cat__card tier-${it.tier}${own ? " owned" : ""}"><canvas width="132" height="132" data-item="${it.id}" aria-label="${it.name}"></canvas><div class="shop__name">${it.name}</div><div class="shop__meta">${Shop.SLOT_NAMES[it.slot]} · 🪙 ${it.price}</div><div class="shop__meta">In the shop about ${odds} of days</div>${status}</div>`;
      };
      let list = "";
      if (!items.length) list = '<p class="shop__note">Nothing matches those filters.</p>';
      else for (const t of [1, 2, 3, 4]) {
        const group = items.filter((it) => it.tier === t); if (!group.length) continue;
        const have = group.filter((it) => owns(it.id)).length;
        list += `<h3 class="cat__tier t${t}">${Shop.TIERS[t]} <small>${have} of ${group.length} owned · 🪙 ${Shop.PRICE[t]} each</small></h3><div class="shop__grid cat__grid">${group.map(cardHtml).join("")}</div>`;
      }
      body.innerHTML = `<p class="shop__note">Every cosmetic there is: <b>${all.length}</b> items, and you own <b>${ownedN}</b>. They only go on sale in the daily shop (one per part of your tung each day), and the higher the tier the less often they show up.</p>
        <div class="cat__filters"><div>${chip("tier", 0, "All tiers", !catTier)}${[1, 2, 3, 4].map((t) => chip("tier", t, Shop.TIERS[t], catTier === t)).join("")}</div>
        <div>${chip("slot", "all", "All parts", catSlot === "all")}${Shop.SLOTS.map((sl) => chip("slot", sl, Shop.SLOT_NAMES[sl], catSlot === sl)).join("")}</div>
        <div>${chip("own", "all", "Everything", catOwn === "all")}${chip("own", "owned", "Owned", catOwn === "owned")}${chip("own", "missing", "Not owned yet", catOwn === "missing")}</div></div>${list}`;
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
  function openShop(tab) {
    if (typeof tab === "string") shopTab = tab;
    shopOpen = true; $("shop").hidden = false; shopMsg(""); if (T) T.loadDaily().then(() => { if (shopOpen && shopTab === "daily") renderShop(); });
    for (const k of ["up", "down", "left", "right"]) input[k] = false;
    sendInput(); loadShop(); renderShop();
  }
  function closeShop() { shopOpen = false; $("shop").hidden = true; }
  $("shopBtn").addEventListener("click", () => openShop());
  $("bucks").addEventListener("click", () => openShop());
  $("shopClose").addEventListener("click", closeShop);
  $("shop").addEventListener("pointerdown", (e) => { if (e.target === $("shop")) closeShop(); });
  addEventListener("keydown", (e) => { if (e.code === "Escape" && shopOpen) closeShop(); });
  $("shopTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { shopTab = b.dataset.tab; shopMsg(""); renderShop(); } });
  $("shopBody").addEventListener("click", async (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) { const [k, v] = f.dataset.filter.split(":"); if (k === "tier") catTier = Number(v); else if (k === "slot") catSlot = v; else catOwn = v; renderShop(); return; }
    const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
    if (b.dataset.act === "wheelwp") {
      if (wheel) { waypoint = { x: wheel.x, y: wheel.y + wheel.r + 70, title: "Daily wheel", icon: "🎡", kind: "wheel" }; shopMsg("Marked. Close the shop and follow the arrow."); closeShop(); feed("Marker set on the Daily wheel"); }
      else shopMsg("Join the arena first to find the wheel.");
      return;
    }
    if (b.dataset.act === "openwheel") { closeShop(); T.openDaily(); return; }
    b.disabled = true; shopMsg("");
    try {
      if (b.dataset.act === "claimweek") {
        const r = await T.api("/api/daily/claim", { method: "POST" });
        T.applyDaily(r.state); shopMsg(`🎉 Week ${r.week} prize: ${r.item.name} and ${r.bucks} tung bucks!`);
        shopData = await T.api("/api/shop"); renderBucks();
      } else if (b.dataset.act === "buy") {
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
  if (T) T.on("daily", loadShop); // a daily prize changes what you own

  window.__arena = { msg: onMsg, draw, me: () => rendered().find((p) => p.id === myId), wheel: () => wheel, logs: () => logs, myId: () => myId, setShop: (d) => { shopData = d; renderBucks(); }, openShop, previewItem, wear: (g) => { for (const p of snapshots[snapshots.length - 1].players) if (p.id === myId) p.g = g; } };
})();
