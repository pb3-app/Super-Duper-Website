// Tung Tung Football - the pixel screen, the controls and the play-calling. The rules and the players are in sim.js.
(() => {
  const S = window.FootballSim, $ = (id) => document.getElementById(id);
  const canvas = $("view"), ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
  const IW = 384, IH = 216, PXX = 7.2, FT = 30, FH = 166, PXY = FH / S.W; // pixels per yard across and down
  const TEAM = [{ jersey: "#ff8c2a", dark: "#b9560f", helmet: "#ffb25e", pants: "#f4efe6", abbr: "TUN" }, { jersey: "#2f6fe0", dark: "#1c448f", helmet: "#6fa0ff", pants: "#f4efe6", abbr: "CAP" }];
  const FONT = '"Press Start 2P", monospace';

  // ------------- state -------------
  let sim = null, role = "idle";        // idle | solo | host | guest
  let myTeam = 0, paused = false, raf = 0, last = 0, np = null, running = false;
  let guestView = null, disp = null, sendAcc = 0, inAcc = 0, reported = false, panelKey = "";
  let cam = 36, myIn = { dx: 0, dy: 0, actN: 0, swN: 0, thrN: 0, thrK: 0, call: null }, remoteIn = {}, joy = { x: 0, y: 0 };
  const keys = {};

  // ------------- the field -------------
  const sx = (x) => Math.round((x - cam) * PXX + IW / 2);
  const sy = (y) => Math.round(FT + y * PXY);
  function text(str, x, y, color, size, align) {
    ctx.font = `${size || 8}px ${FONT}`; ctx.textAlign = align || "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#000"; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillText(str, x + dx, y + dy);
    ctx.fillStyle = color || "#fff"; ctx.fillText(str, x, y);
  }
  function drawField(v, t) {
    // the stands
    ctx.fillStyle = "#1a1a24"; ctx.fillRect(0, 0, IW, FT - 4);
    for (let i = 0; i < IW; i += 3) for (let j = 0; j < 3; j++) { const c = ["#c8483a", "#e8e0c8", "#3a64c8", "#f2c230", "#5a8a5a", "#d070a0"][(i * 7 + j * 13 + Math.floor((i * 31 + t * (j % 2 ? 1 : 2)) / 40)) % 6]; ctx.fillStyle = c; ctx.fillRect(i, 14 + j * 4 + ((i / 3) % 2), 2, 2); }
    ctx.fillStyle = "#2a2a36"; ctx.fillRect(0, FT - 8, IW, 4);
    // the grass: stripes every 5 yards
    for (let yd = 0; yd < S.L; yd += 5) {
      const x0 = sx(yd), x1 = sx(yd + 5); if (x1 < 0 || x0 > IW) continue;
      ctx.fillStyle = (yd / 5) % 2 ? "#2e8b3e" : "#33973f"; ctx.fillRect(x0, FT - 4, x1 - x0 + 1, FH + 8);
    }
    // end zones
    for (const [a, b, tm] of [[0, S.EZ, 0], [S.L - S.EZ, S.L, 1]]) {
      const x0 = sx(a), x1 = sx(b); if (x1 < 0 || x0 > IW) continue;
      ctx.fillStyle = tm === 0 ? "#b9560f" : "#1c448f"; ctx.fillRect(x0, FT - 4, x1 - x0, FH + 8);
      ctx.fillStyle = tm === 0 ? "#d56d1a" : "#2556b8"; for (let k = 0; k < 4; k++) ctx.fillRect(x0 + k * 9 * 1, FT - 4, 3, FH + 8);
      ctx.save(); ctx.translate((x0 + x1) / 2, sy(S.W / 2)); ctx.rotate(tm === 0 ? -Math.PI / 2 : Math.PI / 2); text(TEAM[tm].abbr, 0, 0, "#fff", 14, "center"); ctx.restore();
    }
    // yard lines and numbers
    for (let yd = 0; yd <= 100; yd += 5) {
      const x = sx(S.EZ + yd); if (x < -10 || x > IW + 10) continue;
      ctx.fillStyle = "#e8f5e8"; ctx.fillRect(x, FT - 2, 1, FH + 4);
      if (yd % 10 === 0 && yd > 0 && yd < 100) {
        const n = String(yd <= 50 ? yd : 100 - yd); ctx.font = `10px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(n, x, FT + 18); ctx.save(); ctx.translate(x, FT + FH - 18); ctx.scale(1, -1); ctx.fillText(n, 0, 0); ctx.restore();
      }
    }
    // hash marks
    ctx.fillStyle = "rgba(255,255,255,.55)"; for (let yd = 0; yd <= 100; yd++) { const x = sx(S.EZ + yd); if (x < 0 || x > IW) continue; ctx.fillRect(x, sy(S.W * 0.4), 1, 2); ctx.fillRect(x, sy(S.W * 0.6) - 2, 1, 2); ctx.fillRect(x, FT, 1, 2); ctx.fillRect(x, FT + FH - 2, 1, 2); }
    // sidelines
    ctx.fillStyle = "#fff"; ctx.fillRect(0, FT - 4, IW, 2); ctx.fillRect(0, FT + FH + 2, IW, 2);
    ctx.fillStyle = "#1a3a20"; ctx.fillRect(0, FT + FH + 4, IW, IH - FT - FH - 4);
    // the line of scrimmage (blue) and the first-down line (yellow)
    if (v.phase !== "kick" && v.phase !== "qend") {
      const lx = sx(v.los), fx = sx(v.fdl);
      ctx.fillStyle = "#4a90ff"; ctx.fillRect(lx, FT - 4, 1, FH + 8);
      ctx.fillStyle = "#ffd23f"; ctx.fillRect(fx, FT - 4, 2, FH + 8);
    }
  }

  // ------------- people -------------
  function sprite(p, v, t, hi) {
    const [x, y, team, role, fl, vx, vy] = p, X = sx(x), Y = sy(y), moving = Math.hypot(vx, vy) > 0.8, c = TEAM[team];
    const frame = moving ? Math.floor(t * 9 + x * 0.7) % 2 : 0, down = fl & 2;
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(X - 3, Y + 2, 7, 2);
    if ((fl & 16) && v.human[team]) { // the player you control
      ctx.strokeStyle = role === 0 ? "#fff" : (team === v.off ? "#6fc3ff" : "#ffd23f"); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(X + 0.5, Y + 2, 7, 3.4, 0, 0, 7); ctx.stroke();
    }
    if (down) { ctx.fillStyle = c.jersey; ctx.fillRect(X - 4, Y - 1, 9, 3); ctx.fillStyle = c.helmet; ctx.fillRect(X + 3, Y - 2, 3, 3); return; }
    const lean = (fl & 4) ? 2 : 0; // a dive
    ctx.fillStyle = c.pants; ctx.fillRect(X - 2, Y - 1, 2, 3 + (frame ? 1 : 0)); ctx.fillRect(X + 1, Y - 1, 2, 3 + (frame ? 0 : 1));
    ctx.fillStyle = c.jersey; ctx.fillRect(X - 3 + lean, Y - 6, 7, 5);
    ctx.fillStyle = c.dark; ctx.fillRect(X - 3 + lean, Y - 2, 7, 1);
    ctx.fillStyle = "#e0ac80"; ctx.fillRect(X - 4 + lean, Y - 5, 1, 3); ctx.fillRect(X + 4 + lean, Y - 5, 1, 3);
    ctx.fillStyle = c.helmet; ctx.fillRect(X - 2 + lean, Y - 10, 5, 4); ctx.fillStyle = "#e0ac80"; ctx.fillRect(X - 1 + lean, Y - 7, 3, 1);
    if (fl & 1) { ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(X - 6, Y - 4, 1, 2); ctx.fillRect(X + 6, Y - 6, 1, 2); } // juke flash
    if (fl & 8) { ctx.fillStyle = "#7a3b12"; ctx.fillRect(X + 4 + lean, Y - 6, 3, 2); ctx.fillStyle = "#e8d8c0"; ctx.fillRect(X + 5 + lean, Y - 6, 1, 1); }
  }
  function drawBall(v) {
    const [x, y, z, st] = v.ball; if (st === 0) return;
    const X = sx(x), Y = sy(y), lift = Math.round(z * 3.2);
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(X - 2, Y + 1, 5, 2);
    ctx.fillStyle = "#7a3b12"; ctx.fillRect(X - 2, Y - 2 - lift, 5, 3); ctx.fillStyle = "#e8d8c0"; ctx.fillRect(X, Y - 2 - lift, 1, 1);
  }
  // route lines for the offence you call (like the play diagrams)
  function drawRoutes(v, t) {
    if (myTeam !== v.off || v.thrown) return;
    ctx.strokeStyle = "#3be86b"; ctx.lineWidth = 1;
    for (const [id, pts] of v.routes) {
      const p = v.pl[id]; if (!pts.length) continue;
      ctx.beginPath(); ctx.moveTo(sx(p[0]), sy(p[1]) - 3); for (const w of pts) ctx.lineTo(sx(w[0]), sy(w[1]));
      ctx.stroke(); const e = pts[pts.length - 1]; ctx.fillStyle = "#3be86b"; ctx.fillRect(sx(e[0]) - 1, sy(e[1]) - 1, 3, 3);
    }
  }
  // the catch ring: the ball has to come down inside it, and you go for it (click / space) when the shrinking ring meets the green one
  function drawCatch(v, t) {
    const c = v.catch; if (!c) return;
    let id = null;
    if (myTeam === v.off && c.ho) id = c.r; else if (myTeam !== v.off && c.hd && c.d != null) id = c.d;
    if (id == null) return;
    const p = v.pl[id], X = sx(p[0]), Y = sy(p[1]) + 1, rx = c.R * PXX, ry = c.R * PXY, open = c.tl <= 0.24 && c.tl >= -0.2;
    const ell = (k, color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(X, Y, Math.max(1, rx * k), Math.max(1, ry * k), 0, 0, 7); ctx.stroke(); };
    // where the ball is coming down
    const lx = sx(c.lx), ly = sy(c.ly); ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx - 3, ly - 1); ctx.lineTo(lx + 3, ly + 2); ctx.moveTo(lx + 3, ly - 1); ctx.lineTo(lx - 3, ly + 2); ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.9; ell(1, c.in ? (open ? "#3be86b" : "#d8ffd8") : "#ff6b5e", c.in ? 2 : 1);
    ell(0.3, "rgba(59,232,107,.9)", 2);                                   // the spot to click on
    const k = 0.3 + 0.7 * Math.max(0, Math.min(1, (c.tl - 0.04) / 0.5));  // the shrinking ring
    ell(k, c.tl < -0.06 ? "#ff6b5e" : "#ffd23f", 1.5);
    ctx.restore();
    if (c.tl > 0.24) text(myTeam === v.off ? "get under it" : "get to the ball", X, Y - 22, "#fff", 6, "center");
    else if (open) text(c.in ? "CLICK!" : "MOVE INTO THE RING", X, Y - 22, c.in ? "#ffd23f" : "#ff6b5e", 7, "center");
  }
  function drawLabels(v) {
    if (myTeam !== v.off || v.thrown || (v.phase !== "live" && v.phase !== "presnap")) return; // the numbers are there as soon as the team lines up
    S.RECEIVERS.forEach((slot, k) => {
      const id = v.off * 11 + slot, p = v.pl[id], X = sx(p[0]), Y = sy(p[1]) - 14;
      ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(X - 4, Y - 5, 9, 9); text(String(k + 1), X, Y, "#ffd23f", 7, "center");
    });
  }

  // ------------- the HUD -------------
  const ord = (n) => ["", "1st", "2nd", "3rd", "4th"][n] || n + "th";
  function hud(v, t) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, IW, 13);
    text(`${TEAM[0].abbr} ${v.score[0]}`, 4, 7, v.off === 0 ? "#ffd23f" : "#fff", 7);
    text(`${TEAM[1].abbr} ${v.score[1]}`, 62, 7, v.off === 1 ? "#ffd23f" : "#fff", 7);
    const q = v.q > 4 ? "OT" : ["", "1st", "2nd", "3rd", "4th"][v.q] + " Qtr";
    const m = Math.floor(v.clock / 60), sec = String(v.clock % 60).padStart(2, "0");
    text(`${q} ${m}:${sec}`, IW / 2, 7, "#fff", 7, "center");
    const goalToGo = Math.abs(S.goalOf({ off: v.off }, v.off) - v.los) <= 10;
    text(`${ord(v.down)} & ${goalToGo ? "Goal" : v.toGo}`, IW - 4, 7, "#fff", 7, "right");
    if (v.last && v.phase === "call") text(v.last, 4, FT + FH + 12, "#cfe8cf", 6);
    const who = v.phase === "call" || v.phase === "presnap" || v.phase === "live" ? (v.off === myTeam ? "You have the ball" : "Defence: stop them") : "";
    if (who && role !== "idle") text(who, IW - 4, FT + FH + 12, "#cfe8cf", 6, "right");
    if (v.text && !v.over) { ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 84, IW, 28); text(v.text, IW / 2, 98, "#ffd23f", 13, "center"); }
  }

  function render(v, t) {
    // the camera follows the ball
    const target = v.phase === "call" ? v.los + (v.off === 0 ? 5 : -5) : v.ball[0] + (v.off === 0 ? 5 : -5);
    cam += (target - cam) * 0.12; cam = Math.max(IW / 2 / PXX, Math.min(S.L - IW / 2 / PXX, cam));
    ctx.fillStyle = "#0b3d16"; ctx.fillRect(0, 0, IW, IH);
    drawField(v, t);
    drawRoutes(v, t);
    // everyone, back to front
    const order = v.pl.map((p, i) => i).sort((a, b) => v.pl[a][1] - v.pl[b][1]);
    for (const i of order) sprite(v.pl[i], v, t);
    drawBall(v); drawCatch(v, t); drawLabels(v); hud(v, t);
  }

  // ------------- play calling -------------
  const STARTS = { 7: [-0.6, -20], 8: [-0.6, 19], 9: [-1.8, 9.5], 10: [-0.9, -5.6], 1: [-4.6, 2.8] };
  const DEF_INFO = {
    cover2: ["Cover 2 Zone", "Safe vs the deep ball. Short passes are open."], man: ["Man Coverage", "Everyone sticks to a receiver."], blitz: ["Blitz", "Send everybody after the QB. Risky!"], prevent: ["Prevent Deep", "Nobody gets behind you."],
    cover3: ["Cover 3 Zone", "Three deep, four short. Hard to throw over."], zblitz: ["Zone Blitz", "Two random players rush, the rest drop into zones."], cblitz: ["Corner Blitz", "A corner and a linebacker come off the edge."],
    spy: ["QB Spy", "A linebacker shadows the QB. Good vs scramblers."], goalline: ["Goal Line Stack", "Everyone crowds the line. Weak to deep passes."], runstop: ["Run Stop", "Eight in the box. Great vs runs, thin deep."],
  };
  function diagram(cv, id) {
    const c = cv.getContext("2d"); c.imageSmoothingEnabled = false; cv.width = 64; cv.height = 40;
    c.fillStyle = "#1d6b2e"; c.fillRect(0, 0, 64, 40);
    const X = (lat) => 32 + lat * 0.9, Y = (fwd) => 32 - fwd * 0.62;
    c.fillStyle = "#4a90ff"; c.fillRect(0, Y(0), 64, 1);
    const kind = S.OFF_PLAYS[id].kind;
    c.fillStyle = "#fff"; for (const lat of [-3.4, -1.7, 0, 1.7, 3.4]) c.fillRect(X(lat) - 1, Y(-0.9) - 1, 3, 3);
    c.fillStyle = "#ffd23f"; c.fillRect(X(0) - 1, Y(-4.6) - 1, 3, 3);
    if (kind === "pass") for (const slot of S.RECEIVERS) {
      const [f0, l0] = STARTS[slot], inn = -l0 > 0 ? 1 : -1; let pts = S.routeFor(id, slot, inn);
      c.strokeStyle = "#3be86b"; c.lineWidth = 1; c.beginPath(); c.moveTo(X(l0), Y(f0)); for (const [f, l] of pts) c.lineTo(X(l0 + l), Y(f0 + f)); c.stroke();
      c.fillStyle = "#fff"; c.fillRect(X(l0) - 1, Y(f0) - 1, 3, 3);
    } else {
      c.strokeStyle = "#3be86b"; c.beginPath(); const side = id === "runL" || id === "sweepL" ? -1 : id === "runR" || id === "sweepR" ? 1 : 0, wide = id.startsWith("sweep") ? 17 : 8;
      c.moveTo(X(2.8), Y(-4.6)); if (id === "draw") { c.setLineDash([2, 2]); c.lineTo(X(0), Y(-9)); c.stroke(); c.setLineDash([]); c.beginPath(); c.moveTo(X(0), Y(-9)); c.lineTo(X(4), Y(2)); c.lineTo(X(4), Y(12)); } else { c.lineTo(X(side * wide), Y(2)); c.lineTo(X(side * wide), Y(12)); } c.stroke();
      c.fillStyle = "#fff"; c.fillRect(X(2.8) - 1, Y(-4.6) - 1, 3, 3);
    }
  }
  function rebuildPanel(v) {
    const p = $("callPanel");
    const mine = v.off === myTeam, key = [v.q, v.plays, v.off, v.down, myTeam].join("-");
    if (v.phase !== "call") { p.hidden = true; panelKey = ""; return; }
    if (v.calls[myTeam]) { p.hidden = false; p.innerHTML = '<div class="wait">Waiting for the other player…</div>'; panelKey = ""; return; }
    p.hidden = false;
    if (panelKey === key) { const t = p.querySelector(".tm"); if (t) t.textContent = v.callT; return; }
    panelKey = key;
    if (mine) {
      const toGoal = Math.abs(S.goalOf({ off: v.off }, v.off) - v.los), fgd = Math.round(toGoal + 17), fgp = fgd <= 30 ? 96 : fgd <= 40 ? 84 : fgd <= 48 ? 66 : fgd <= 55 ? 40 : 12;
      const rec = v.down === 4 ? (toGoal <= 38 ? "fg" : "punt") : null;
      const btn = (id, name, sub) => `<button class="play${rec === id ? " rec" : ""}" data-call="${id}"><canvas></canvas><span>${name}</span>${sub ? `<small>${sub}</small>` : ""}</button>`;
      p.innerHTML = `<h3>Call a play · <span class="tm">${v.callT}</span> <small>(routes change a little every snap)</small></h3><div class="grid">${["quick", "slant", "curl", "mixed", "flood", "screen", "deep", "hail", "runL", "runM", "runR", "sweepL", "sweepR", "draw"].map((id) => btn(id, S.OFF_PLAYS[id].name)).join("")}${`<button class="play${rec === "fg" ? " rec" : ""}" data-call="fg"><span>Field Goal</span><small>${fgd} yds · ${fgp}%</small></button><button class="play${rec === "punt" ? " rec" : ""}" data-call="punt"><span>Punt</span><small>flip the field</small></button>`}</div>`;
      p.querySelectorAll("button.play").forEach((b) => { const cv = b.querySelector("canvas"); if (cv) diagram(cv, b.dataset.call); });
    } else {
      p.innerHTML = `<h3>Call your defence · <span class="tm">${v.callT}</span></h3><div class="grid">${Object.keys(S.DEF_PLAYS).map((id) => `<button class="play" data-call="${id}"><span>${DEF_INFO[id][0]}</span><small>${DEF_INFO[id][1]}</small></button>`).join("")}</div>`;
    }
  }
  $("callPanel").addEventListener("click", (e) => { const b = e.target.closest("[data-call]"); if (b) { myIn.call = b.dataset.call; if (role === "guest") np.send({ k: "c", id: b.dataset.call }); } });

  // ------------- input -------------
  const KEYMAP = { KeyW: "u", ArrowUp: "u", KeyS: "d", ArrowDown: "d", KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r" };
  function readMove() {
    let dx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0) + joy.x, dy = (keys.d ? 1 : 0) - (keys.u ? 1 : 0) + joy.y;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    myIn.dx = Math.round(dx * 100) / 100; myIn.dy = Math.round(dy * 100) / 100;
  }
  function throwKey(k) { myIn.thrK = k; myIn.thrN++; }
  document.addEventListener("keydown", (e) => {
    if (role === "idle" || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
    if (e.code === "Space") { e.preventDefault(); if (!e.repeat) myIn.actN++; }
    if (e.code === "KeyE" || e.code === "ShiftLeft" || e.code === "ShiftRight") { if (!e.repeat) myIn.swN++; e.preventDefault(); }
    if (/^Digit[1-5]$/.test(e.code) && !e.repeat) throwKey(Number(e.code.slice(5)) - 1);
    if ((e.code === "KeyP" || e.code === "Escape") && role === "solo" && !e.repeat) togglePause();
  });
  document.addEventListener("keyup", (e) => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
  window.addEventListener("blur", () => { for (const k of Object.keys(keys)) keys[k] = false; });
  // tap or click a receiver to throw to him
  canvas.addEventListener("pointerdown", (e) => {
    if (role === "idle") return; e.preventDefault();
    const v = currentView(); if (!v) return;
    if (v.catch && v.phase === "live") { myIn.actN++; return; } // the ball is in the air: this click is the catch
    if (v.off !== myTeam || v.thrown || v.phase !== "live") return;
    const r = canvas.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * IW, py = ((e.clientY - r.top) / r.height) * IH;
    let best = -1, bd = 1e9;
    S.RECEIVERS.forEach((slot, k) => { const p = v.pl[v.off * 11 + slot], d = Math.hypot(sx(p[0]) - px, sy(p[1]) - 6 - py); if (d < bd) { bd = d; best = k; } });
    if (best >= 0 && bd < 40) throwKey(best);
  });
  if (window.TouchPad) TouchPad.mount($("pad"), { onMove: (x, y) => { joy = { x, y }; }, buttons: [{ label: "Juke / Dive / Catch", onDown: () => { myIn.actN++; } }, { label: "Switch", onDown: () => { myIn.swN++; } }] });
  function togglePause() { paused = !paused; $("pauseBtn").textContent = paused ? "▶ Resume (P)" : "⏸ Pause (P)"; }
  $("pauseBtn").addEventListener("click", () => { if (role === "solo") togglePause(); });

  // ------------- the loop -------------
  const currentView = () => (role === "guest" ? disp : sim ? sim.view() : null);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
    const t = now / 1000;
    readMove();
    let v = null;
    if ((role === "solo" || role === "host") && running && !paused) {
      const steps = Math.ceil(dt / 0.034), h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const ins = [{}, {}];
        ins[myTeam] = myIn; if (role === "host") ins[1] = remoteIn;
        sim.step(h, ins);
        // a chosen play is used up once it is accepted (or when it is no longer the time to call)
        if (sim.g.phase !== "call" || sim.g.calls[myTeam]) myIn.call = null;
        if (role === "host" && (sim.g.phase !== "call" || sim.g.calls[1])) remoteIn.call = null;
      }
      sendAcc += dt;
      if (role === "host" && sendAcc > 0.033) { sendAcc = 0; np.send({ k: "s", v: sim.view() }); }
    }
    if (role === "guest") {
      inAcc += dt; if (inAcc > 0.05) { inAcc = 0; np.send({ k: "i", i: { dx: myIn.dx, dy: myIn.dy, actN: myIn.actN, swN: myIn.swN, thrN: myIn.thrN, thrK: myIn.thrK } }); }
      smoothGuest(dt);
    }
    v = currentView();
    if (v) { render(v, t); rebuildPanel(v); if (v.over) gameOver(v); }
  }
  function smoothGuest(dt) {
    if (!guestView) return;
    if (!disp) { disp = JSON.parse(JSON.stringify(guestView)); return; }
    const keep = disp.pl; Object.assign(disp, guestView, { pl: keep });
    const k = Math.min(1, dt * 16);
    guestView.pl.forEach((p, i) => { const d = keep[i]; if (!d || Math.hypot(d[0] - p[0], d[1] - p[1]) > 9) { keep[i] = p.slice(); return; } d[0] += (p[0] - d[0]) * k; d[1] += (p[1] - d[1]) * k; d[2] = p[2]; d[3] = p[3]; d[4] = p[4]; d[5] = p[5]; d[6] = p[6]; });
  }

  // ------------- modes -------------
  function startSolo() {
    cancelAnimationFrame(raf);
    const level = $("level").value;
    sim = S.create({ quarterSecs: Number($("qlen").value), human: [true, false], level, names: ["Tung FC", "Cappuccino United"] });
    role = "solo"; myTeam = 0; running = true; paused = false; reported = false; panelKey = ""; $("result").hidden = true; cam = 36;
    np.setPlaying(true); last = 0; raf = requestAnimationFrame(frame);
  }
  function toMenu() { running = false; role = "idle"; cancelAnimationFrame(raf); sim = null; guestView = disp = null; $("callPanel").hidden = true; $("result").hidden = true; np.setPlaying(false); }
  function gameOver(v) {
    if (reported) return; reported = true;
    const me = v.score[myTeam], opp = v.score[1 - myTeam], won = me > opp;
    const msg = me === opp ? "🤝 Tie game" : won ? "🏆 You win!" : "💀 You lose";
    if (role === "solo") {
      if (me !== opp && window.TungMP) TungMP.submitSolo({ game: "football", result: won ? "win" : "loss" });
      showResult(msg, `Final score: ${v.score[0]} - ${v.score[1]}`, [["Play again", startSolo], ["Menu", toMenu]]);
    } else {
      np.report({ score: me });
      showResult(msg, `Final score: ${v.score[0]} - ${v.score[1]}`, []);
    }
  }
  function showResult(title, sub, buttons) {
    const r = $("result"); r.innerHTML = `<h2>${title}</h2><p>${sub}</p><div class="btn-row"></div>`; r.hidden = false;
    for (const [label, fn] of buttons) { const b = document.createElement("button"); b.className = "btn"; b.textContent = label; b.onclick = fn; r.querySelector(".btn-row").append(b); }
  }
  $("startBtn").addEventListener("click", startSolo);
  $("quitBtn").addEventListener("click", () => { if (np.kind) np.leave(); else toMenu(); });

  // ------------- online (1 v 1: the host runs the game) -------------
  np = NetPlay.attach({
    game: "football", rooms: false, panel: $("mpPanel"), menu: $("menu"), play: $("play"),
    onModeChange() { if (role === "solo") toMenu(); },
    onPrepare(c) {
      cancelAnimationFrame(raf); reported = false; panelKey = ""; $("result").hidden = true; guestView = disp = null; running = false; cam = 36;
      myIn = { dx: 0, dy: 0, actN: 0, swN: 0, thrN: 0, thrK: 0, call: null }; remoteIn = {};
      const names = c.host ? [c.me.name, c.players[1].name] : [c.players[0].name, c.me.name];
      TEAM[0].abbr = names[0].slice(0, 3).toUpperCase(); TEAM[1].abbr = names[1].slice(0, 3).toUpperCase();
      if (TEAM[0].abbr === TEAM[1].abbr) TEAM[1].abbr = names[1].slice(-3).toUpperCase();
      if (c.host) { role = "host"; myTeam = 0; sim = S.create({ quarterSecs: Number(c.opts.quarter) || 90, human: [true, true], names }); }
      else { role = "guest"; myTeam = 1; sim = null; }
      last = 0; raf = requestAnimationFrame(frame);
    },
    onStart() { running = true; },
    onStop() { running = false; },
    onExit() { running = false; role = "idle"; cancelAnimationFrame(raf); sim = null; $("callPanel").hidden = true; $("result").hidden = true; },
    onNet(from, d) {
      if (!d) return;
      if (role === "host") {
        if (d.k === "i" && d.i) Object.assign(remoteIn, { dx: +d.i.dx || 0, dy: +d.i.dy || 0, actN: d.i.actN | 0, swN: d.i.swN | 0, thrN: d.i.thrN | 0, thrK: d.i.thrK | 0 });
        else if (d.k === "c") remoteIn.call = String(d.id);
      } else if (role === "guest" && d.k === "s") guestView = d.v;
    },
  });
  window.__fb = () => ({ sim, role, view: currentView, myIn });
})();
