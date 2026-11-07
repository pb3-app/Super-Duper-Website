(() => {
  const E = CupEngine;
  const W = 960, H = 540, L = E.L, HW = E.HW;
  const $ = (id) => document.getElementById(id);
  const cv = $("view"), ctx = cv.getContext("2d");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------------- sound ----------------
  let audio;
  const AC = () => (audio = audio || new (window.AudioContext || window.webkitAudioContext)());
  function tone(f, d, type = "sine", v = 0.08, slide = 0.5, delay = 0) {
    try { const a = AC(), t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.02); } catch (_) {}
  }

  // ---------------- camera ----------------
  const CAM = { x: 0, y: 150, z: -95, pitch: (42 * Math.PI) / 180, F: 800, cx: W / 2, cy: 250 };
  const SIN = Math.sin(CAM.pitch), COS = Math.cos(CAM.pitch);
  function proj(x, y, z) {
    const rx = x - CAM.x, ry = y - CAM.y, rz = z - CAM.z;
    const depth = -ry * SIN + rz * COS, up = ry * COS + rz * SIN;
    if (depth < 8) return null;
    const k = CAM.F / depth;
    return { x: CAM.cx + rx * k, y: CAM.cy - up * k, k, d: depth };
  }
  function unproject(px, py, yPlane) { // where the line of sight through a pixel meets the plane at height yPlane
    const a = (px - CAM.cx) / CAM.F, b = -(py - CAM.cy) / CAM.F;
    const dx = a, dy = -SIN + b * COS, dz = COS + b * SIN;
    if (dy > -1e-4) return null;
    const t = (yPlane - CAM.y) / dy;
    return { x: CAM.x + dx * t, z: CAM.z + dz * t };
  }
  const P = (x, y, z) => proj(x, y, z);

  // ---------------- state ----------------
  let mode = "idle"; // idle | solo | match
  let np = null, running = false, raf = 0, last = 0, names = ["You", "Computer"], level = "medium";
  let me = 0, cupsN = 6, layout = [], alive = [[], []], turn = 0, throwsLeft = 2, made = 0;
  let phase = "idle"; // idle | aim | fly | gap | over
  let ball = null, thrower = 0, simCups = [], acc = 0, trail = [], gapT = 0, queue = [], aiT = 0, clock = 25;
  let aim = { x: 0, z: 118 }, charging = false, chargeT = 0, keys = {}, t0 = 0;
  let pops = [], bits = [], leaving = [], banner = null, overlay = null, wasOver = false;
  let sceneCv = null;

  const sunk = (s) => layout.length - alive[1 - s].filter(Boolean).length; // cups slot s has sunk
  const left = (s) => alive[s].filter(Boolean).length;
  const toView = (slot, x, z) => (slot === me ? [x, z] : [-x, L - z]);
  function cupPos(slot, c) { return slot === me ? { x: c.x, z: c.z } : { x: -c.x, z: L - c.z }; }

  // ---------------- game flow ----------------
  function setup(newMode, meSlot, n) {
    mode = newMode; me = meSlot; cupsN = n; layout = E.rackLayout(n);
    alive = [layout.map(() => true), layout.map(() => true)];
    turn = 0; throwsLeft = 2; made = 0; ball = null; trail = []; pops = []; bits = []; leaving = []; queue = []; banner = null;
    charging = false; wasOver = false; aim = { x: 0, z: 118 }; hideResult();
    phase = "idle"; t0 = 0;
    $("myLeft").textContent = n; $("oppLeft").textContent = n; $("oppName").textContent = names[1];
    running = true; cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame);
    hud();
  }
  function startTurn() {
    phase = "aim"; clock = 25; charging = false; aiT = 1.1 + Math.random() * 0.6;
    if (turn === me) banner = { text: made === 0 && throwsLeft === 2 ? "YOUR THROW" : "THROW AGAIN", col: "#ffd23f", t: performance.now() };
    hud();
  }
  function hud() {
    $("myLeft").textContent = left(me); $("oppLeft").textContent = left(1 - me);
    const mine = turn === me && phase !== "over";
    $("turnChip").textContent = phase === "over" ? "Game over" : mine ? `Your turn · ${throwsLeft} ball${throwsLeft === 1 ? "" : "s"}` : `${names[1]}'s turn · ${throwsLeft} ball${throwsLeft === 1 ? "" : "s"}`;
    $("clockChip").style.visibility = mine && phase === "aim" ? "visible" : "hidden";
    $("clock").textContent = Math.max(0, Math.ceil(clock));
  }

  function launch(slot, p, v) {
    thrower = slot; ball = E.newBall(p, v); simCups = E.farRack(layout, alive[1 - slot]); acc = 0; trail = []; phase = "fly"; charging = false;
    tone(300, 0.1, "triangle", 0.05, 1.6);
    hud();
  }
  function fire(meter) {
    if (phase !== "aim" || turn !== me) return;
    const t = E.makeThrow(aim.x, aim.z, meter, Math.random);
    if (mode === "match") np.send({ k: "t", p: t.p, v: t.v });
    launch(me, t.p, t.v);
  }

  function resolve() {
    const victim = 1 - thrower, o = ball.outcome, mineThrow = thrower === me;
    let text = "MISS", col = "#d6d6d6";
    if (o === "sink") {
      const idx = ball.cup, c = layout[idx], pos = cupPos(victim, c);
      alive[victim][idx] = false; made++;
      leaving.push({ slot: victim, i: idx, t: performance.now(), x: pos.x, z: pos.z });
      splash(pos.x, pos.z);
      text = mineThrow ? "SPLASH!" : "OUCH!"; col = mineThrow ? "#7df08f" : "#ff8a80";
      tone(520, 0.12, "sine", 0.1, 1.5); tone(780, 0.25, "sine", 0.09, 1.2, 0.09); if (mineThrow) tone(1040, 0.3, "sine", 0.07, 1, 0.2);
      if (mineThrow && mode === "match") np.progress(sunk(me));
    } else if (ball.bounces > 0 && ball.ev.some((e) => e[0] === "rim")) { text = "SO CLOSE"; col = "#ffd23f"; }
    banner = { text, col, t: performance.now() };
    throwsLeft--;
    let again = false;
    if (left(victim) === 0) { phase = "over"; hud(); return finish(thrower); }
    if (throwsLeft === 0) {
      if (made === 2) { again = true; banner = { text: "BALLS BACK!", col: "#4cc9f0", t: performance.now() }; tone(660, 0.2, "triangle", 0.08, 2); }
      else turn = 1 - turn;
      throwsLeft = 2; made = 0;
    }
    ball = null; phase = "gap"; gapT = again ? 1.3 : 1.1; hud();
  }
  function splash(x, z) {
    for (let i = 0; i < 16; i++) bits.push({ x, y: E.CH, z, vx: (Math.random() - 0.5) * 60, vy: 90 + Math.random() * 110, vz: (Math.random() - 0.5) * 60, life: 0.8 });
  }

  function finish(winnerSlot) {
    if (wasOver) return; wasOver = true;
    const won = winnerSlot === me;
    if (mode === "solo") {
      if (window.TungMP) TungMP.submitSolo({ game: "cuppong", result: won ? "win" : "loss" });
      showResult(won ? "🏆 You win!" : "💀 You lose", won ? `You cleared all ${cupsN} of ${names[1]}'s cups.` : `${names[1]} cleared your cups. You sank ${sunk(me)} of ${cupsN}.`, [["Play again", startSolo], ["Menu", toMenu]]);
    } else if (mode === "match") {
      showResult(won ? "🏆 You cleared the table!" : "That was the last cup", `You sank ${sunk(me)} of ${cupsN}. Waiting for the result…`, []);
      np.report({ score: sunk(me) });
    }
  }
  function showResult(title, sub, buttons) {
    const r = $("result"); r.innerHTML = `<h2>${title}</h2><p>${sub}</p><div class="btn-row"></div>`; r.hidden = false;
    for (const [label, fn] of buttons) { const b = document.createElement("button"); b.className = "btn" + (label === "Menu" ? " secondary" : ""); b.textContent = label; b.onclick = fn; r.querySelector(".btn-row").append(b); }
  }
  const hideResult = () => { $("result").hidden = true; };

  // ---------------- computer player ----------------
  function aiThrow() {
    const cups = E.farRack(layout, alive[0]);
    if (!cups.length) return;
    // prefer the front cups a little, like a real player
    let c = cups[Math.floor(Math.random() * cups.length)];
    if (Math.random() < 0.5) c = cups.reduce((a, b) => (b.z < a.z ? b : a), cups[0]);
    const sigma = { easy: 1.8, medium: 0.85, hard: 0.5 }[level] || 0.85;
    const g = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(6.283185307 * Math.random());
    const dev = Math.min(1, Math.abs(g) * sigma), meter = 0.5 + (Math.random() < 0.5 ? -1 : 1) * dev / 2;
    const t = E.makeThrow(c.x, c.z, meter, Math.random);
    launch(1, t.p, t.v);
  }

  // ---------------- update ----------------
  function update(dt) {
    t0 += dt;
    // aim with the keyboard
    const kx = (keys.d || keys.right ? 1 : 0) - (keys.a || keys.left ? 1 : 0), ky = (keys.w || keys.up ? 1 : 0) - (keys.s || keys.down ? 1 : 0);
    if (kx || ky) { aim.x = clamp(aim.x + kx * 60 * dt, -HW + 8, HW - 8); aim.z = clamp(aim.z + ky * 60 * dt, L * 0.5, L - 4); }
    if (charging) chargeT += dt;
    if (phase === "idle") return;
    if (phase === "aim") {
      if (turn === me) {
        clock -= dt;
        if (Math.floor(clock * 2) !== Math.floor((clock + dt) * 2)) $("clock").textContent = Math.max(0, Math.ceil(clock));
        if (clock <= 0) { clock = 99; const c = E.farRack(layout, alive[1 - me]); const t = c.length ? c[Math.floor(Math.random() * c.length)] : { x: 0, z: 130 }; aim = { x: t.x, z: t.z }; fire(1); }
      } else if (mode === "solo") {
        aiT -= dt; if (aiT <= 0) aiThrow();
      } else if (queue.length) {
        const d = queue.shift(); launch(1 - me, d.p, d.v);
      }
    } else if (phase === "fly") {
      acc += dt * 0.8;
      let n = 0;
      while (acc >= E.DT && !ball.done && n++ < 80) { E.step(ball, simCups); acc -= E.DT; }
      for (const e of ball.ev) sound(e);
      ball.ev.length = 0;
      const [bx, bz] = toView(thrower, ball.x, ball.z);
      trail.push({ x: bx, y: ball.y, z: bz, t: t0 }); if (trail.length > 14) trail.shift();
      if (ball.done) resolve();
    } else if (phase === "gap") {
      gapT -= dt; if (gapT <= 0) startTurn();
    }
    for (const b of bits) { b.vy -= 600 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt; }
    bits = bits.filter((b) => b.life > 0 && b.y > 0);
  }
  function sound(e) {
    if (e[0] === "table") tone(clamp(300 + e[1] * 0.6, 300, 900), 0.06, "triangle", clamp(e[1] / 3000, 0.02, 0.1), 0.6);
    else if (e[0] === "rim") tone(1500, 0.09, "square", 0.04, 0.5);
    else if (e[0] === "wall") tone(260, 0.07, "triangle", 0.05, 0.6);
    else if (e[0] === "sink") tone(180, 0.18, "sine", 0.12, 0.5);
  }

  // ---------------- drawing: the room and table (cached) ----------------
  function line(g, pts, close) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); if (close) g.closePath(); }
  function buildScene() {
    sceneCv = document.createElement("canvas"); sceneCv.width = W; sceneCv.height = H;
    const g = sceneCv.getContext("2d"), FY = -72;
    // back wall
    const wall = g.createLinearGradient(0, 0, 0, 260); wall.addColorStop(0, "#150b2b"); wall.addColorStop(1, "#33195c");
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    // bokeh lights
    for (let i = 0; i < 26; i++) {
      const x = ((i * 137) % 960), y = 20 + ((i * 59) % 150), r = 8 + (i % 5) * 6, cols = ["255,120,200", "120,200,255", "255,210,90", "170,120,255"];
      const bg = g.createRadialGradient(x, y, 0, x, y, r); bg.addColorStop(0, `rgba(${cols[i % 4]},.35)`); bg.addColorStop(1, `rgba(${cols[i % 4]},0)`);
      g.fillStyle = bg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    // warm pendant lights along the top
    for (const x of [150, 480, 810]) { const lg = g.createRadialGradient(x, 0, 0, x, 0, 230); lg.addColorStop(0, "rgba(255,214,140,.55)"); lg.addColorStop(1, "rgba(255,214,140,0)"); g.fillStyle = lg; g.fillRect(x - 230, 0, 460, 240); g.fillStyle = "#ffe9b8"; g.beginPath(); g.arc(x, 2, 7, 0, 7); g.fill(); }
    // floor
    const fl = [P(-600, FY, -88), P(600, FY, -88), P(600, FY, 560), P(-600, FY, 560)];
    const fg = g.createLinearGradient(0, fl[3].y, 0, H); fg.addColorStop(0, "#2a1a3f"); fg.addColorStop(1, "#4b2f55");
    g.fillStyle = fg; line(g, fl, true); g.fill();
    g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 1.2;
    for (let x = -600; x <= 600; x += 40) { const a = P(x, FY, -88), b = P(x, FY, 560); if (a && b) { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } }
    // table shadow on the floor
    const sh = [P(-HW - 10, FY, 0), P(HW + 10, FY, 0), P(HW + 10, FY, L), P(-HW - 10, FY, L)];
    g.fillStyle = "rgba(0,0,0,.45)"; line(g, sh, true); g.fill();
    // legs
    const leg = (x, z) => { const a = P(x, 0, z), b = P(x, FY, z); g.strokeStyle = "#1a1224"; g.lineWidth = Math.max(4, 5 * a.k); g.lineCap = "round"; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };
    leg(-HW + 5, L - 6); leg(HW - 5, L - 6); leg(-HW + 5, 6); leg(HW - 5, 6);
    // table top: front edge, then the playing surface
    const A = P(-HW, 0, 0), B = P(HW, 0, 0), C = P(HW, 0, L), D = P(-HW, 0, L), A2 = P(-HW, -7, 0), B2 = P(HW, -7, 0);
    g.fillStyle = "#7a4a22"; line(g, [A, B, B2, A2], true); g.fill();
    g.fillStyle = "rgba(255,255,255,.12)"; line(g, [A, B, P(HW, -1.8, 0), P(-HW, -1.8, 0)], true); g.fill();
    const tg = g.createLinearGradient(0, C.y, 0, A.y); tg.addColorStop(0, "#1e7fa6"); tg.addColorStop(0.55, "#1a6c93"); tg.addColorStop(1, "#14587d");
    g.fillStyle = tg; line(g, [A, B, C, D], true); g.fill();
    g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 2.4; g.lineJoin = "round";
    line(g, [P(-HW + 3, 0, 3), P(HW - 3, 0, 3), P(HW - 3, 0, L - 3), P(-HW + 3, 0, L - 3)], true); g.stroke();
    const m1 = P(-HW + 3, 0, L / 2), m2 = P(HW - 3, 0, L / 2); g.lineWidth = 2; g.beginPath(); g.moveTo(m1.x, m1.y); g.lineTo(m2.x, m2.y); g.stroke();
    g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 1.6; g.beginPath(); for (let i = 0; i <= 40; i++) { const a = (i / 40) * 6.2832, p = P(Math.cos(a) * 14, 0, L / 2 + Math.sin(a) * 14); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); } g.stroke();
    // a log-slice emblem in the middle circle
    const emb = (rad, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); for (let i = 0; i <= 40; i++) { const a = (i / 40) * 6.2832, p = P(Math.cos(a) * rad, 0, L / 2 + Math.sin(a) * rad); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); } };
    g.fillStyle = "#c58a4a"; emb(10, "#5e3a18", 2); g.fill(); g.stroke(); emb(6.5, "rgba(94,58,24,.6)", 1.4); g.stroke(); emb(3, "rgba(94,58,24,.6)", 1.4); g.stroke();
    // a shine over the middle of the table
    const sg = g.createRadialGradient(480, 250, 10, 480, 250, 320); sg.addColorStop(0, "rgba(255,255,255,.14)"); sg.addColorStop(1, "rgba(255,255,255,0)");
    g.save(); line(g, [A, B, C, D], true); g.clip(); g.fillStyle = sg; g.fillRect(0, 0, W, H); g.restore();
    // vignette
    const vg = g.createRadialGradient(480, 270, 250, 480, 270, 620); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  // ---------------- drawing: cups, ball, interface ----------------
  const COLORS = { mine: ["#ff6b6b", "#d62839", "#8f1220"], theirs: ["#6db3ff", "#2f7de1", "#1a478a"] };
  function ringPts(cx, cz, y, r, n = 26) { const out = []; for (let i = 0; i <= n; i++) { const a = (i / n) * 6.2832, p = P(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r); out.push({ x: p.x, y: p.y, a }); } return out; }
  function drawCup(cx, cz, mine, lift, alpha) {
    const col = mine ? COLORS.mine : COLORS.theirs, y0 = lift;
    const top = ringPts(cx, cz, y0 + E.CH, E.RT), bot = ringPts(cx, cz, y0, E.RB);
    ctx.save(); ctx.globalAlpha = alpha;
    // shadow on the table
    if (!lift) { ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ringPts(cx + 2, cz - 1, 0.05, E.RB + 1.6).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.fill(); }
    const front = (pts) => pts.filter((p) => Math.sin(p.a) <= 0.0001 && p.a >= 0);
    const ft = top.filter((p) => p.a >= 3.1416 - 1e-6), fb = bot.filter((p) => p.a >= 3.1416 - 1e-6);
    void front;
    const xs = top.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const body = ctx.createLinearGradient(x0, 0, x1, 0); body.addColorStop(0, col[0]); body.addColorStop(0.45, col[1]); body.addColorStop(1, col[2]);
    ctx.fillStyle = body; ctx.beginPath(); ft.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); for (let i = fb.length - 1; i >= 0; i--) ctx.lineTo(fb[i].x, fb[i].y); ctx.closePath(); ctx.fill();
    // white band
    const ba = ringPts(cx, cz, y0 + E.CH * 0.52, E.wallR(E.CH * 0.52)).filter((p) => p.a >= 3.1416 - 1e-6), bb = ringPts(cx, cz, y0 + E.CH * 0.74, E.wallR(E.CH * 0.74)).filter((p) => p.a >= 3.1416 - 1e-6);
    ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.beginPath(); bb.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); for (let i = ba.length - 1; i >= 0; i--) ctx.lineTo(ba[i].x, ba[i].y); ctx.closePath(); ctx.fill();
    // side highlight
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2; const hl = top.find((p) => Math.abs(p.a - 3.6) < 0.13), hb = bot.find((p) => Math.abs(p.a - 3.6) < 0.13); if (hl && hb) { ctx.beginPath(); ctx.moveTo(hl.x, hl.y); ctx.lineTo(hb.x, hb.y); ctx.stroke(); }
    // opening: dark inside, then the water
    ctx.beginPath(); top.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
    const ig = ctx.createLinearGradient(0, Math.min(...top.map((p) => p.y)), 0, Math.max(...top.map((p) => p.y))); ig.addColorStop(0, col[2]); ig.addColorStop(1, col[1]);
    ctx.fillStyle = ig; ctx.fill();
    ctx.save(); ctx.clip();
    const wt = ringPts(cx, cz, y0 + E.CH - 3.4, E.wallR(E.CH - 3.4) - 0.5);
    ctx.fillStyle = "rgba(150,220,255,.9)"; ctx.beginPath(); wt.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.35)"; const c0 = P(cx - 1.4, y0 + E.CH - 3.4, cz + 1); ctx.beginPath(); ctx.ellipse(c0.x, c0.y, 5 * c0.k * 0.5, 2 * c0.k * 0.5, 0, 0, 7); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = col[0]; ctx.lineWidth = Math.max(1.6, 1.2 * P(cx, y0 + E.CH, cz).k); ctx.beginPath(); top.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    ctx.restore();
  }
  function drawBall(x, y, z, a) {
    const p = P(x, y, z), s = P(x, 0.05, z); if (!p || !s) return;
    const r = E.BR * p.k;
    const sa = clamp(0.4 - y / 260, 0.05, 0.4);
    if (x > -HW && x < HW && z > 0 && z < L) { ctx.fillStyle = `rgba(0,0,0,${sa})`; ctx.beginPath(); ctx.ellipse(s.x, s.y, r * (1 + y / 90), r * 0.5 * (1 + y / 90), 0, 0, 7); ctx.fill(); }
    ctx.globalAlpha = a == null ? 1 : a;
    const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r); g.addColorStop(0, "#ffffff"); g.addColorStop(0.7, "#f3ece0"); g.addColorStop(1, "#c9bda8");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(80,60,30,.45)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function reticle() {
    if (phase !== "aim" || turn !== me) return;
    const meter = charging ? E.meterAt(chargeT) : 0.5, r = charging ? E.spread(meter) : E.spread(0.5);
    // preview of the arc
    const s = E.solve(aim.x, aim.z), step = s.tf / 22;
    ctx.fillStyle = "rgba(255,255,255,.55)";
    for (let i = 1; i < 22; i++) { const t = i * step, x = s.p.x + s.v.x * t, y = s.p.y + s.v.y * t - 0.5 * E.G * t * t, z = s.p.z + s.v.z * t, p = P(x, y, z); if (p) { ctx.globalAlpha = 0.25 + 0.5 * (i / 22); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.4, 1.3 * p.k * 1.2), 0, 7); ctx.fill(); } }
    ctx.globalAlpha = 1;
    const dev = Math.abs(meter - 0.5) * 2, col = dev < 0.3 ? "#7df08f" : dev < 0.55 ? "#ffd23f" : "#ff6b5e";
    const ring = (rad, w, c, dash) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.beginPath(); for (let i = 0; i <= 36; i++) { const a = (i / 36) * 6.2832, p = P(aim.x + Math.cos(a) * rad, E.AIM_Y, aim.z + Math.sin(a) * rad); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.stroke(); ctx.setLineDash([]); };
    ring(r, 2.2, charging ? col : "rgba(255,255,255,.8)", charging ? [] : [5, 5]);
    ring(2.2, 2.6, "#ffffff"); const c = P(aim.x, E.AIM_Y, aim.z); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(c.x, c.y, 2.6, 0, 7); ctx.fill();
    // meter
    const bx = W / 2 - 150, by = H - 40, bw = 300;
    ctx.fillStyle = "rgba(8,12,24,.7)"; ctx.beginPath(); ctx.roundRect(bx - 12, by - 22, bw + 24, 46, 14); ctx.fill();
    const mg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    mg.addColorStop(0, "#ff6b5e"); mg.addColorStop(0.22, "#ffd23f"); mg.addColorStop(0.35, "#7df08f"); mg.addColorStop(0.65, "#7df08f"); mg.addColorStop(0.78, "#ffd23f"); mg.addColorStop(1, "#ff6b5e");
    ctx.fillStyle = mg; ctx.beginPath(); ctx.roundRect(bx, by - 6, bw, 14, 7); ctx.fill();
    const mx = bx + bw * meter;
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#101820"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx, by + 12); ctx.lineTo(mx - 8, by + 24 - 2); ctx.lineTo(mx + 8, by + 24 - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(mx - 2, by - 12, 4, 26);
    ctx.fillStyle = "#fff"; ctx.font = "800 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(charging ? "RELEASE IN THE GREEN" : "HOLD TO CHARGE", W / 2, by - 12);
  }

  function miniCups() {
    for (const [slot, x0, mine] of [[me, 18, true], [1 - me, W - 18, false]]) {
      const col = mine ? COLORS.mine : COLORS.theirs, n = layout.length;
      for (let i = 0; i < n; i++) {
        const x = mine ? x0 + i * 20 : x0 - i * 20, on = alive[slot][i];
        ctx.fillStyle = on ? col[1] : "rgba(255,255,255,.12)"; ctx.beginPath(); ctx.moveTo(x - 7, 18); ctx.lineTo(x + 7, 18); ctx.lineTo(x + 5, 36); ctx.lineTo(x - 5, 36); ctx.closePath(); ctx.fill();
        if (on) { ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(x - 6, 24, 12, 4); }
      }
      ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.font = "800 12px sans-serif"; ctx.textAlign = mine ? "left" : "right"; ctx.fillText(mine ? names[0] : names[1], mine ? x0 - 7 : x0 + 7, 14);
    }
  }

  function render() {
    if (!sceneCv) buildScene();
    ctx.drawImage(sceneCv, 0, 0);
    if (!layout.length) return;
    // depth-sorted cups and ball
    const items = [];
    for (const slot of [0, 1]) layout.forEach((c) => { if (alive[slot][c.i]) { const pos = cupPos(slot, c); items.push({ k: "cup", slot, pos, d: P(pos.x, E.CH / 2, pos.z).d }); } });
    for (const l of leaving) { const age = (performance.now() - l.t) / 700; if (age < 1) items.push({ k: "gone", l, age, d: P(l.x, E.CH / 2, l.z).d }); }
    if (ball) { const [bx, bz] = toView(thrower, ball.x, ball.z), p = P(bx, ball.y, bz); if (p) items.push({ k: "ball", bx, bz, d: p.d }); }
    items.sort((a, b) => b.d - a.d);
    for (const it of items) {
      if (it.k === "cup") drawCup(it.pos.x, it.pos.z, it.slot === me, 0, 1);
      else if (it.k === "gone") drawCup(it.l.x, it.l.z, it.l.slot === me, it.age * 14, 1 - it.age);
      else {
        for (let i = 0; i < trail.length - 1; i++) drawBall(trail[i].x, trail[i].y, trail[i].z, 0.07 + 0.06 * (i / trail.length));
        drawBall(it.bx, ball.y, it.bz);
      }
    }
    leaving = leaving.filter((l) => performance.now() - l.t < 700);
    for (const b of bits) { const p = P(b.x, b.y, b.z); if (p) { ctx.fillStyle = `rgba(160,225,255,${clamp(b.life * 1.4, 0, 1)})`; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, 1.4 * p.k), 0, 7); ctx.fill(); } }
    reticle();
    miniCups();
    // turn and throws indicator
    if (phase !== "over" && phase !== "idle") {
      const mine = turn === me; ctx.textAlign = "center"; ctx.font = "800 14px sans-serif";
      ctx.fillStyle = "rgba(8,12,24,.65)"; ctx.beginPath(); ctx.roundRect(W / 2 - 110, 6, 220, 28, 14); ctx.fill();
      ctx.fillStyle = mine ? "#ffd23f" : "#9ad1ff"; ctx.fillText(mine ? "YOUR TURN" : names[1].toUpperCase() + "'S TURN", W / 2 - 22, 25);
      for (let i = 0; i < 2; i++) { ctx.fillStyle = i < throwsLeft ? "#fff" : "rgba(255,255,255,.25)"; ctx.beginPath(); ctx.arc(W / 2 + 58 + i * 20, 20, 6, 0, 7); ctx.fill(); }
    }
    if (banner && performance.now() - banner.t < 1100) {
      const k = (performance.now() - banner.t) / 1100; ctx.globalAlpha = 1 - k * k; ctx.textAlign = "center"; ctx.font = "900 50px sans-serif"; ctx.lineWidth = 8; ctx.strokeStyle = "#101820"; ctx.lineJoin = "round";
      const y = 215 - k * 18; ctx.strokeText(banner.text, W / 2, y); ctx.fillStyle = banner.col; ctx.fillText(banner.text, W / 2, y); ctx.globalAlpha = 1;
    }
    if (phase === "idle" && running) { ctx.textAlign = "center"; ctx.font = "900 54px sans-serif"; ctx.lineWidth = 8; ctx.strokeStyle = "#101820"; ctx.strokeText("GET READY", W / 2, 230); ctx.fillStyle = "#ffd23f"; ctx.fillText("GET READY", W / 2, 230); }
  }

  // ---------------- main loop ----------------
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.033, last ? (t - last) / 1000 : 0.016); last = t;
    if (running) update(dt);
    render();
  }
  function startSolo() {
    level = $("level").value; names = ["You", "Computer"];
    np.setPlaying(true); setup("solo", 0, Number($("cups").value));
    setTimeout(() => { if (mode === "solo" && phase === "idle") startTurn(); }, 900);
  }
  function toMenu() { running = false; cancelAnimationFrame(raf); mode = "idle"; phase = "idle"; hideResult(); np.setPlaying(false); }
  $("startBtn").addEventListener("click", startSolo);
  $("quitBtn").addEventListener("click", () => { if (np.kind) np.leave(); else toMenu(); });

  // ---------------- input ----------------
  function pointer(e) {
    const r = cv.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H - (e.pointerType === "touch" ? 50 : 0);
    const q = unproject(px, py, E.AIM_Y);
    if (q) aim = { x: clamp(q.x, -HW + 8, HW - 8), z: clamp(q.z, L * 0.5, L - 4) };
  }
  function begin() { if (phase === "aim" && turn === me && !charging) { charging = true; chargeT = 0; } }
  function end() { if (charging) { charging = false; fire(E.meterAt(chargeT)); } }
  cv.addEventListener("pointermove", pointer);
  cv.addEventListener("pointerdown", (e) => { pointer(e); begin(); try { cv.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", () => { charging = false; });
  const KEYMAP = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  document.addEventListener("keydown", (e) => {
    if (mode === "idle") return;
    const k = KEYMAP[e.code]; if (k) { e.preventDefault(); keys[k] = true; }
    if (e.code === "Space" && !e.repeat) { e.preventDefault(); begin(); }
    if (e.code === "Escape" && mode === "solo") toMenu();
  });
  document.addEventListener("keyup", (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; if (e.code === "Space") end(); });
  window.addEventListener("blur", () => { charging = false; keys = {}; });

  // ---------------- multiplayer (1v1 challenge) ----------------
  np = NetPlay.attach({
    game: "cuppong", rooms: false, panel: $("mpPanel"), menu: $("menu"), play: $("play"),
    onModeChange() { if (mode === "solo") toMenu(); },
    onPrepare(c) {
      const other = c.players.find((p) => p.id !== c.me.id);
      names = [c.me.name, other ? other.name : "Opponent"];
      setup("match", c.me.slot, Number(c.opts.cups) || 6);
      $("oppName").textContent = names[1];
    },
    onStart() { if (mode === "match" && phase === "idle") startTurn(); },
    onStop() { running = false; hideResult(); },
    onExit() { running = false; cancelAnimationFrame(raf); mode = "idle"; phase = "idle"; hideResult(); },
    onNet(from, d) {
      if (!d || d.k !== "t" || !d.p || !d.v) return;
      const num = (o, ks) => ks.every((k) => Number.isFinite(o[k]));
      if (!num(d.p, ["x", "y", "z"]) || !num(d.v, ["x", "y", "z"])) return;
      if (Math.abs(d.v.x) > 800 || Math.abs(d.v.y) > 800 || Math.abs(d.v.z) > 800) return;
      queue.push({ p: { x: d.p.x, y: d.p.y, z: d.p.z }, v: { x: d.v.x, y: d.v.y, z: d.v.z } });
    },
  });

  window.__cp = () => ({ E, get alive() { return alive; }, get phase() { return phase; }, get turn() { return turn; }, get me() { return me; }, get ball() { return ball; }, get throwsLeft() { return throwsLeft; }, setup, startTurn, update, render, aim: (x, z) => { aim = { x, z }; }, fire, launch, resolve, proj, unproject, get layout() { return layout; }, get mode() { return mode; } });
})();
