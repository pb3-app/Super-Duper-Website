(() => {
  const W = 960, H = 540, PR = 40, UR = 20, GY0 = 185, GY1 = 355, MAXV = 1500;
  const $ = (id) => document.getElementById(id);
  const cv = $("view"), ctx = cv.getContext("2d");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let audio;
  function beep(f, d, type = "sine", v = 0.08, slide = 0.5) {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t + d); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.02); } catch (_) {}
  }

  // ---------------- state ----------------
  let role = "idle"; // idle | solo | host | guest
  let mirror = false, goalsTo = 7, level = "medium", running = false, raf = 0, last = 0, over = false, names = ["You", "Computer"], myIdx = 0;
  let sim = null, snap = null, snapAt = 0, disp = null; // sim = authoritative state (solo / host); disp = what the guest draws
  let target = { x: 200, y: H / 2 }, keys = {}, trail = [], flashes = [], sendAcc = 0, np = null, banner = null;

  function newSim() {
    return { pad: [{ x: 120, y: H / 2, vx: 0, vy: 0 }, { x: W - 120, y: H / 2, vx: 0, vy: 0 }], puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 }, score: [0, 0], phase: "serve", t: 0, serveTo: 0, resume: 0.9, ev: [], tgt: [{ x: 120, y: H / 2 }, { x: W - 120, y: H / 2 }], ai: { t: 0, hit: 0, aimY: 0, swing: 0 } };
  }
  const world = (vx, vy) => [mirror ? W - vx : vx, vy]; // view -> world coordinates
  const view = (wx, wy) => [mirror ? W - wx : wx, wy];

  // ---------------- physics (run by the solo player or the host) ----------------
  function step(s, dt) {
    s.t += dt;
    // paddles chase their targets with a speed limit, so they feel heavy and smooth
    s.pad.forEach((p, i) => {
      const t = s.tgt[i], lo = i === 0 ? PR : W / 2 + PR, hi = i === 0 ? W / 2 - PR : W - PR;
      const tx = clamp(t.x, lo, hi), ty = clamp(t.y, PR, H - PR);
      const vx = (tx - p.x) * 30, vy = (ty - p.y) * 30, sp = Math.hypot(vx, vy), cap = i === 1 && role === "solo" ? aiCap() : 2800, k = sp > cap ? cap / sp : 1;
      p.vx = vx * k; p.vy = vy * k; p.x += p.vx * dt; p.y += p.vy * dt;
    });
    const u = s.puck;
    if (s.phase === "goal") { s.resume -= dt; if (s.resume <= 0) { if (s.score[0] >= goalsTo || s.score[1] >= goalsTo) { s.phase = "over"; s.ev.push(["over"]); } else { s.phase = "play"; u.x = W / 2 + (s.serveTo === 0 ? -140 : 140); u.y = H / 2; u.vx = u.vy = 0; } } return; }
    if (s.phase === "serve") { s.resume -= dt; u.x = W / 2; u.y = H / 2; if (s.resume <= 0) s.phase = "play"; return; }
    if (s.phase !== "play") return;
    const sub = 4, h = dt / sub;
    for (let n = 0; n < sub; n++) {
      u.x += u.vx * h; u.y += u.vy * h;
      const f = Math.exp(-0.28 * h); u.vx *= f; u.vy *= f; // a little air drag
      if (u.y < UR) { u.y = UR; u.vy = Math.abs(u.vy) * 0.94; s.ev.push(["wall", Math.abs(u.vy)]); }
      if (u.y > H - UR) { u.y = H - UR; u.vy = -Math.abs(u.vy) * 0.94; s.ev.push(["wall", Math.abs(u.vy)]); }
      for (const side of [0, 1]) { // end walls, with the goal slot cut out
        const x = side === 0 ? u.x : W - u.x;
        if (x < UR) {
          if (u.y > GY0 && u.y < GY1) { if (x < -UR * 0.6) { goal(s, side === 0 ? 1 : 0); return; } }
          else { if (side === 0) { u.x = UR; u.vx = Math.abs(u.vx) * 0.94; } else { u.x = W - UR; u.vx = -Math.abs(u.vx) * 0.94; } s.ev.push(["wall", Math.abs(u.vx)]); }
        }
        // goal posts
        for (const py of [GY0, GY1]) { const px = side === 0 ? 0 : W, dx = u.x - px, dy = u.y - py, d = Math.hypot(dx, dy); if (d < UR + 7 && d > 0) { const nx = dx / d, ny = dy / d, vn = u.vx * nx + u.vy * ny; if (vn < 0) { u.vx -= 1.9 * vn * nx; u.vy -= 1.9 * vn * ny; } u.x = px + nx * (UR + 7); u.y = py + ny * (UR + 7); s.ev.push(["wall", 600]); } }
      }
      for (const p of s.pad) {
        const dx = u.x - p.x, dy = u.y - p.y, d = Math.hypot(dx, dy), min = PR + UR;
        if (d < min && d > 0) {
          const nx = dx / d, ny = dy / d, vr = (u.vx - p.vx) * nx + (u.vy - p.vy) * ny;
          if (vr < 0) { u.vx -= (1 + 0.92) * vr * nx; u.vy -= (1 + 0.92) * vr * ny; s.ev.push(["hit", Math.hypot(u.vx, u.vy)]); }
          u.x = p.x + nx * min; u.y = p.y + ny * min;
        }
      }
      const sp = Math.hypot(u.vx, u.vy); if (sp > MAXV) { u.vx *= MAXV / sp; u.vy *= MAXV / sp; }
    }
  }
  function goal(s, who) { // `who` scored
    s.score[who]++; s.phase = "goal"; s.resume = 1.3; s.serveTo = 1 - who; s.puck.vx = s.puck.vy = 0; s.ev.push(["goal", who]);
  }
  const aiCap = () => ({ easy: 900, medium: 1800, hard: 2800 }[level] || 1800);
  function aiThink(s, dt) {
    const a = s.ai, u = s.puck, me = s.pad[1];
    const skill = { easy: 0.4, medium: 0.75, hard: 0.98 }[level] || 0.75;
    let tx = W - 110, ty = H / 2;
    const inMyHalf = u.x >= W / 2 - 30, incoming = u.vx > 40;
    if (s.phase !== "play") { s.tgt[1] = { x: W - 110, y: H / 2 }; return; }
    a.t -= dt; if (a.t <= 0) { a.t = 0.12 + (1 - skill) * 0.25; a.aimY = (Math.random() - 0.5) * (1 - skill) * 220; }
    if (inMyHalf && u.vx > -380 && u.x < W - 90) { // attack: line up behind the puck, then drive through it towards the goal
      const gy = H / 2 + a.aimY, dx = u.x - 0, dy = u.y - gy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const behindX = u.x + ux * (PR + UR + 16), behindY = u.y + uy * (PR + UR + 16);
      const toMeX = me.x - u.x, toMeY = me.y - u.y, along = toMeX * ux + toMeY * uy, off = Math.abs(toMeX * -uy + toMeY * ux);
      if (a.swing > 0 || (along > 40 && off < 34)) { if (a.swing <= 0) a.swing = 0.22; a.swing -= dt; tx = u.x - ux * 150; ty = u.y - uy * 150; }
      else { tx = behindX; ty = behindY; if (tx > W - PR) { tx = W - PR; ty = u.y > H / 2 ? u.y - 70 : u.y + 70; } }
    } else if (incoming || inMyHalf) { // defend: sit on the line between puck and goal
      const t = Math.max(0, (W - 130 - u.x) / Math.max(u.vx, 60)); let py = u.y + u.vy * Math.min(t, 0.8) * skill;
      while (py < UR || py > H - UR) py = py < UR ? 2 * UR - py : 2 * (H - UR) - py;
      tx = W - 120; ty = clamp(py + a.aimY * 0.3, GY0 - 20, GY1 + 20);
    } else { tx = W - 150; ty = H / 2 + (u.y - H / 2) * 0.35; }
    s.tgt[1] = { x: tx, y: ty };
  }
  function localTargets(s) {
    s.tgt[0] = { x: target.x, y: target.y };
  }

  // ---------------- drawing ----------------
  function drawTable(dt) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#11324f"); g.addColorStop(1, "#0b2036");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // air-hole dots
    ctx.fillStyle = "rgba(160,220,255,.08)"; for (let y = 14; y < H; y += 22) for (let x = 14 + ((y / 22) % 2) * 11; x < W; x += 22) ctx.fillRect(x, y, 2, 2);
    ctx.strokeStyle = "rgba(120,200,255,.55)"; ctx.lineWidth = 4; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 70, 0, 7); ctx.stroke();
    ctx.fillStyle = "rgba(120,200,255,.55)"; ctx.beginPath(); ctx.arc(W / 2, H / 2, 8, 0, 7); ctx.fill();
    for (const side of [0, 1]) { // goal crease + glowing slot
      ctx.save(); if (side === 1) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.strokeStyle = "rgba(120,200,255,.45)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, H / 2, 125, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      const c = side === 0 ? (mirror ? "#4cc9f0" : "#ffcc33") : (mirror ? "#ffcc33" : "#4cc9f0"); // my goal is always gold
      const gg = ctx.createLinearGradient(0, 0, 60, 0); gg.addColorStop(0, c); gg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gg; ctx.globalAlpha = 0.55; ctx.fillRect(0, GY0, 60, GY1 - GY0); ctx.globalAlpha = 1;
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, GY0, 9, 0, 7); ctx.arc(0, GY1, 9, 0, 7); ctx.fill();
      ctx.restore();
    }
    // rails
    ctx.lineWidth = 14; ctx.strokeStyle = "#0a1626"; ctx.strokeRect(-2, -2, W + 4, H + 4);
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(160,220,255,.3)"; ctx.strokeRect(6, 6, W - 12, H - 12);
    void dt;
  }
  let padGear = [{}, {}]; // what the two players wear (shop items), by paddle: 0 is the host's
  function paddle(x, y, col, dark, look, gear) {
    gear = gear || {}; const ci = gear.color && window.TungShop ? TungShop.byId[gear.color] : null;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(6, 10, PR, PR * 0.96, 0, 0, 7); ctx.fill();
    const gr = ctx.createRadialGradient(-12, -14, 4, 0, 0, PR); gr.addColorStop(0, "#fff"); gr.addColorStop(0.18, col); gr.addColorStop(1, dark);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, PR, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.beginPath(); ctx.arc(0, 0, PR * 0.62, 0, 7); ctx.fill();
    // a log slice with Tung's eyes looking at the puck
    ctx.fillStyle = ci ? TungGear.skinFill(ctx, ci, PR) : "#c58a4a"; ctx.beginPath(); ctx.arc(0, 0, PR * 0.5, 0, 7); ctx.fill(); ctx.strokeStyle = "#5e3a18"; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(94,58,24,.5)"; ctx.beginPath(); ctx.arc(0, 0, PR * 0.34, 0, 7); ctx.stroke();
    const lx = look[0], ly = look[1], d = Math.hypot(lx, ly) || 1, ox = (lx / d) * 3, oy = (ly / d) * 3;
    for (const sx of [-9, 9]) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, -3, 7, 0, 7); ctx.fill(); ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(sx + ox, -3 + oy, 3.6, 0, 7); ctx.fill(); }
    ctx.strokeStyle = "#2b1208"; ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-7, 10); ctx.quadraticCurveTo(0, 15, 7, 10); ctx.stroke();
    if (gear.face) { ctx.save(); ctx.translate(0, 7); ctx.scale(1.1, 1.1); TungGear.face(ctx, gear.face); ctx.restore(); }
    if (gear.hat) { ctx.save(); ctx.translate(0, 12); ctx.scale(0.9, 0.9); TungGear.hat(ctx, gear.hat, performance.now() / 1000); ctx.restore(); }
    ctx.restore();
  }
  function puck(u) {
    trail.push({ x: u.x, y: u.y, t: performance.now() }); trail = trail.filter((p) => performance.now() - p.t < 180);
    for (const p of trail) { const k = 1 - (performance.now() - p.t) / 180; ctx.fillStyle = `rgba(255,214,120,${0.25 * k})`; ctx.beginPath(); ctx.arc(p.x, p.y, UR * (0.5 + 0.5 * k), 0, 7); ctx.fill(); }
    ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(u.x + 3, u.y + 7, UR, UR * 0.95, 0, 0, 7); ctx.fill();
    const gr = ctx.createRadialGradient(u.x - 6, u.y - 7, 2, u.x, u.y, UR); gr.addColorStop(0, "#e9c58c"); gr.addColorStop(1, "#9a6a33");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(u.x, u.y, UR, 0, 7); ctx.fill(); ctx.strokeStyle = "#4a2d10"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = "rgba(74,45,16,.6)"; ctx.lineWidth = 1.5; for (const r of [UR * 0.62, UR * 0.3]) { ctx.beginPath(); ctx.arc(u.x, u.y, r, 0, 7); ctx.stroke(); }
  }
  function render() {
    ctx.save();
    if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    drawTable();
    const s = role === "guest" ? disp : sim; if (!s) { ctx.restore(); return; }
    const me = role === "guest" ? 1 : 0;
    const pU = s.puck;
    const gold = ["#ffcc33", "#b8860b"], blue = ["#4cc9f0", "#1b6a8a"], cols = mirror ? [blue, gold] : [gold, blue]; // my paddle is always gold
    for (const i of [0, 1]) { const p = s.pad[i]; paddle(p.x, p.y, cols[i][0], cols[i][1], [pU.x - p.x, pU.y - p.y], padGear[i]); }
    puck(pU);
    for (const f of flashes) { const k = (performance.now() - f.t) / 300; ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, UR + k * 40, 0, 7); ctx.stroke(); }
    flashes = flashes.filter((f) => performance.now() - f.t < 300);
    ctx.restore();
    void me;
    // scores printed on the table (not mirrored)
    ctx.font = "900 120px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.09)";
    const mine = role === "guest" ? 1 : 0;
    ctx.fillText(s.score[mine], W * 0.25, H / 2 + 42); ctx.fillText(s.score[1 - mine], W * 0.75, H / 2 + 42);
    ctx.font = "800 15px sans-serif"; ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillText(names[0], W * 0.25, 30); ctx.fillText(names[1], W * 0.75, 30);
    if (s.phase === "serve" && s.resume > 0 && role !== "idle") { ctx.font = "900 64px sans-serif"; ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = "#111"; ctx.lineWidth = 8; ctx.strokeText("READY", W / 2, H / 2 - 120); ctx.fillText("READY", W / 2, H / 2 - 120); }
    if (banner && performance.now() - banner.t < 1200) { ctx.globalAlpha = 1 - (performance.now() - banner.t) / 1200; ctx.font = "900 78px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 10; ctx.strokeStyle = "#111"; ctx.strokeText(banner.text, W / 2, H / 2 - 120); ctx.fillStyle = banner.col; ctx.fillText(banner.text, W / 2, H / 2 - 120); ctx.globalAlpha = 1; }
    $("scMe").textContent = s.score[mine]; $("scOpp").textContent = s.score[1 - mine];
  }

  // ---------------- game flow ----------------
  function handleEvents(list, s) {
    for (const e of list) {
      if (e[0] === "hit") { beep(180 + Math.min(300, e[1] * 0.2), 0.08, "triangle", 0.1, 0.6); flashes.push({ x: s.puck.x, y: s.puck.y, t: performance.now() }); }
      else if (e[0] === "wall") beep(120, 0.04, "square", Math.min(0.06, e[1] / 15000), 0.7);
      else if (e[0] === "goal") { const mine = role === "guest" ? 1 : 0; const won = e[1] === mine; banner = { text: won ? "GOAL!" : "OUCH!", col: won ? "#7df08f" : "#ff8a80", t: performance.now() }; beep(won ? 660 : 160, 0.5, "sawtooth", 0.1, won ? 2 : 0.4); }
    }
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.033, last ? (t - last) / 1000 : 0.016); last = t;
    // keyboard nudges the target
    const kx = (keys.d || keys.right ? 1 : 0) - (keys.a || keys.left ? 1 : 0), ky = (keys.s || keys.down ? 1 : 0) - (keys.w || keys.up ? 1 : 0);
    if (kx || ky) { const [wx, wy] = [target.x + (mirror ? -kx : kx) * 700 * dt, target.y + ky * 700 * dt]; target.x = wx; target.y = wy; }
    if (running) {
      if (role === "solo" || role === "host") {
        localTargets(sim);
        if (role === "solo") aiThink(sim, dt);
        else if (sim.remoteT) sim.tgt[1] = sim.remoteT;
        step(sim, dt);
        if (sim.ev.length) { handleEvents(sim.ev, sim); if (role === "host") pendingEv.push(...sim.ev); sim.ev = []; }
        if (role === "host") { sendAcc += dt; if (sendAcc > 0.033) { sendAcc = 0; sendSnap(); } }
        if (sim.phase === "over" && !over) endGame();
      } else if (role === "guest" && snap) {
        const age = (performance.now() - snapAt) / 1000;
        disp = disp || { pad: [{ x: snap.p[0], y: snap.p[1] }, { x: snap.p[2], y: snap.p[3] }], puck: { x: snap.u[0], y: snap.u[1] }, score: snap.sc, phase: snap.ph, resume: snap.rs };
        const k = Math.min(1, dt * 22);
        disp.puck.x += (snap.u[0] + snap.u[2] * age - disp.puck.x) * k; disp.puck.y += (snap.u[1] + snap.u[3] * age - disp.puck.y) * k;
        disp.pad[0].x += (snap.p[0] - disp.pad[0].x) * k; disp.pad[0].y += (snap.p[1] - disp.pad[0].y) * k;
        disp.pad[1].x += (clampMine(target.x) - disp.pad[1].x) * Math.min(1, dt * 40); disp.pad[1].y += (clamp(target.y, PR, H - PR) - disp.pad[1].y) * Math.min(1, dt * 40);
        disp.score = snap.sc; disp.phase = snap.ph; disp.resume = snap.rs;
        sendAcc += dt; if (sendAcc > 0.025) { sendAcc = 0; np.send({ k: "t", x: Math.round(clampMine(target.x)), y: Math.round(clamp(target.y, PR, H - PR)) }); }
      }
    }
    render();
  }
  function sendSnap() { np.send({ k: "s", p: [sim.pad[0].x, sim.pad[0].y, sim.pad[1].x, sim.pad[1].y].map((v) => Math.round(v * 10) / 10), u: [sim.puck.x, sim.puck.y, sim.puck.vx, sim.puck.vy].map((v) => Math.round(v * 10) / 10), sc: sim.score, ph: sim.phase, rs: Math.max(0, Math.round(sim.resume * 100) / 100), ev: pendingEv.splice(0) }); }
  const clampMine = (x) => (role === "guest" ? clamp(x, W / 2 + PR, W - PR) : clamp(x, PR, W / 2 - PR));
  let pendingEv = [];

  function endGame() {
    over = true; running = false;
    const s = sim || disp, mine = role === "guest" ? 1 : 0, win = s.score[mine] > s.score[1 - mine];
    if (role === "solo") {
      if (window.TungMP) TungMP.submitSolo({ game: "airhockey", result: win ? "win" : "loss" });
      showResult(win ? "🏆 You win!" : "💀 You lose", `${s.score[0]} - ${s.score[1]} against the computer.`, [["Play again", startSolo], ["Menu", toMenu]]);
    } else {
      if (role === "host") sendSnap();
      np.report({ score: s.score[mine], ranking: [] });
    }
  }
  function showResult(title, sub, buttons) {
    const r = $("result"); r.innerHTML = `<h2>${title}</h2><p>${sub}</p><div class="btn-row"></div>`; r.hidden = false;
    for (const [label, fn] of buttons) { const b = document.createElement("button"); b.className = "btn" + (label === "Menu" ? " secondary" : ""); b.textContent = label; b.onclick = fn; r.querySelector(".btn-row").append(b); }
  }
  const hideResult = () => { $("result").hidden = true; };

  function begin(newRole) {
    role = newRole; over = false; hideResult(); banner = null; trail = [];
    sim = role === "guest" ? null : newSim(); snap = null; disp = null; pendingEv = [];
    mirror = role === "guest"; target = { x: role === "guest" ? W - 120 : 120, y: H / 2 };
    if (sim) sim.phase = "serve";
    running = true; cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame);
    $("goalsEl").textContent = goalsTo;
  }
  function startSolo() {
    level = $("level").value; goalsTo = Number($("goals").value); names = ["You", "Computer"]; padGear = [TungGear.mine(), {}];
    np.setPlaying(true); begin("solo");
  }
  function toMenu() { running = false; cancelAnimationFrame(raf); role = "idle"; hideResult(); np.setPlaying(false); }
  $("startBtn").addEventListener("click", startSolo);
  $("quitBtn").addEventListener("click", () => { if (np.kind) np.leave(); else toMenu(); });
  document.addEventListener("keydown", (e) => {
    const k = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" }[e.code];
    if (k && role !== "idle") { e.preventDefault(); keys[k] = true; }
    if (e.code === "Escape" && role === "solo") toMenu();
  });
  document.addEventListener("keyup", (e) => { const k = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" }[e.code]; if (k) keys[k] = false; });
  function pointer(e) { const r = cv.getBoundingClientRect(), vx = ((e.clientX - r.left) / r.width) * W, vy = ((e.clientY - r.top) / r.height) * H, [wx, wy] = world(vx, vy); target = { x: wx, y: wy }; }
  cv.addEventListener("pointermove", pointer); cv.addEventListener("pointerdown", pointer);

  // ---------------- multiplayer (1v1 challenge) ----------------
  np = NetPlay.attach({
    game: "airhockey", rooms: false, panel: $("mpPanel"), menu: $("menu"), play: $("play"),
    onModeChange() { if (role === "solo") toMenu(); },
    onPrepare(ctx) { const mg = TungGear.mine(), og = TungGear.fromNums((ctx.players.find((p) => p.id !== ctx.me.id) || {}).gear); padGear = ctx.host ? [mg, og] : [og, mg]; goalsTo = ctx.opts.goals; names = ctx.host ? [ctx.me.name, ctx.players[1].name] : [ctx.me.name, ctx.players[0].name]; begin(ctx.host ? "host" : "guest"); running = false; if (sim) { sim.phase = "serve"; sim.resume = 3; } },
    onStart(ctx) { running = true; if (sim) { sim.phase = "serve"; sim.resume = 0.9; } },
    onStop() { running = false; },
    onExit() { running = false; cancelAnimationFrame(raf); role = "idle"; hideResult(); },
    onNet(from, d) {
      if (!d) return;
      if (role === "host" && d.k === "t") sim.remoteT = { x: clamp(d.x, W / 2 + PR, W - PR), y: clamp(d.y, PR, H - PR) };
      else if (role === "guest" && d.k === "s") {
        snap = d; snapAt = performance.now();
        if (d.ev && d.ev.length && disp) handleEvents(d.ev, disp);
        if (d.ph === "over" && !over) { over = true; running = false; disp = disp || { pad: [{}, {}], puck: {}, score: d.sc }; disp.score = d.sc; np.report({ score: d.sc[1], ranking: [] }); }
      }
    },
  });
  // sim.remoteT is applied inside step via the loop above; make sure the guest-controlled paddle starts on its side
  window.__air = () => ({ sim, role, step: (dt) => { localTargets(sim); if (role === 'solo') aiThink(sim, dt); step(sim, dt); if (sim.ev.length) sim.ev = []; if (sim.phase === 'over' && !over) endGame(); }, aim: (x, y) => { target = { x, y }; } });
})();
