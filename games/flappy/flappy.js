(() => {
  const TA = window.TungArt;
  const canvas = document.getElementById("view"), ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const scoreEl = document.getElementById("score"), bestEl = document.getElementById("best"), msgEl = document.getElementById("msg"), startBtn = document.getElementById("startBtn");

  const GROUND = 70, PIPE_W = 78, SPACING = 190, BX = 120, GRAV = 1500, FLAP = -430, FIRST = 420;
  let oppGear = {}; // what the other tung wears (shop items); your own comes from TungGear.mine()
  let seed = "solo", mp = false, state = "idle"; // idle | run | dead
  let bird, pipes, score, scroll, dist = 0, tops = new Map(), opp = null, oppSent = 0, raf = 0, last = 0, flapT = 0, deadAt = 0, shake = 0, parts = [];
  let best = Number(localStorage.getItem("tungFlappyBest") || 0);
  bestEl.textContent = best;
  const clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 90, y: 40 + (i * 53) % 220, s: 0.6 + (i % 3) * 0.3 }));
  let audio;
  function beep(f, d, type = "square", v = 0.06) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f * 1.6), t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (_) {}
  }

  // the world speeds up a little all the time: +1 px/s for every 80 px flown, up to 290 px/s
  const speedAt = (d) => Math.min(290, 150 + d * 0.0125);
  const gapAt = (i) => Math.max(128, 190 - i * 2);
  // Every gap is within reach of the one before it (at most 90 px up or down) and the pipes are exactly SPACING apart.
  function centerAt(i) {
    if (tops.has(i)) return tops.get(i);
    const gap = gapAt(i), lo = 70 + gap / 2, hi = H - GROUND - 70 - gap / 2, rnd = TungMP.rng(seed + ":p" + i), want = lo + rnd() * (hi - lo);
    const c = i === 0 ? Math.max(lo, Math.min(hi, H * 0.42)) : Math.max(lo, Math.min(hi, centerAt(i - 1) + Math.max(-90, Math.min(90, want - centerAt(i - 1)))));
    tops.set(i, c); return c;
  }
  function pipeAt(i, x) {
    const gap = gapAt(i);
    return { i, x: x == null ? FIRST + i * SPACING : x, top: centerAt(i) - gap / 2, gap, passed: false };
  }

  function reset() {
    bird = { y: H * 0.42, vy: 0, rot: 0 };
    tops = new Map(); opp = null; oppSent = 0;
    pipes = []; for (let i = 0; i < 5; i++) pipes.push(pipeAt(i));
    score = 0; scroll = 0; dist = 0; parts = []; shake = 0; state = "idle";
    scoreEl.textContent = 0;
    cancelAnimationFrame(raf);
    last = 0; raf = requestAnimationFrame(frame);
  }

  function flap() {
    if (state === "dead") return;
    if (state === "idle") { if (mp) return; begin(); }
    bird.vy = FLAP; flapT = 0.18; beep(520, 0.09, "triangle");
    for (let i = 0; i < 3; i++) parts.push({ x: BX - 14, y: bird.y + 14, vx: -40 - Math.random() * 40, vy: 20 + Math.random() * 40, life: 0.4 });
  }
  function begin() {
    state = "run"; msgEl.textContent = ""; startBtn.textContent = "Restart"; last = 0;
  }

  // the other player's tung: its position in the world is sent a few times a second and drawn on your pipes
  function sendMe(dead) {
    if (!mp || !window.TungMP) return;
    TungMP.rt({ k: "f", d: Math.round(dist), y: Math.round(bird.y), r: Math.round(bird.rot * 100) / 100, v: Math.round(speedAt(dist)), x: dead ? 1 : 0, w: flapT > 0 ? 1 : 0 });
  }
  function updateOpp(dt) {
    if (!opp) return;
    const target = opp.dead ? opp.d : opp.d + opp.v * Math.min(0.15, (performance.now() - opp.at) / 1000);
    opp.dd += (target - opp.dd) * Math.min(1, dt * 12);
    if (!opp.dead) { opp.dy += (opp.y - opp.dy) * Math.min(1, dt * 14); opp.dr += (opp.r - opp.dr) * Math.min(1, dt * 12); }
    else { opp.fv = Math.min(900, opp.fv + GRAV * dt); opp.dy = Math.min(H - GROUND - 18, opp.dy + opp.fv * dt); opp.dr = Math.min(1.6, opp.dr + dt * 5); }
    opp.flap = Math.max(0, opp.flap - dt);
  }
  function update(dt) {
    scroll += dt;
    updateOpp(dt);
    if (mp && state === "run") { oppSent += dt; if (oppSent >= 0.066) { oppSent = 0; sendMe(false); } }
    for (const c of clouds) { c.x -= 12 * c.s * dt; if (c.x < -80) c.x = W + 40; }
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    parts = parts.filter((p) => p.life > 0);
    flapT = Math.max(0, flapT - dt);
    if (state === "idle") { bird.y = H * 0.42 + Math.sin(performance.now() / 260) * 9; bird.rot = 0; return; }
    const sp = speedAt(dist);
    if (state === "run") {
      bird.vy = Math.min(720, bird.vy + GRAV * dt);
      bird.y += bird.vy * dt;
      bird.rot = Math.max(-0.45, Math.min(1.2, bird.vy / 600));
      for (const p of pipes) p.x -= sp * dt;
      dist += sp * dt;
      while (pipes[0].x < -PIPE_W - 20) { const last = pipes[pipes.length - 1]; pipes.shift(); pipes.push(pipeAt(last.i + 1, last.x + SPACING)); }
      // scoring + collisions (the Tung is a 26px-wide, 46px-tall log)
      const bw = 13, bh = 22;
      for (const p of pipes) {
        if (!p.passed && p.x + PIPE_W < BX - bw) { p.passed = true; score++; scoreEl.textContent = score; beep(760, 0.09, "square", 0.05); if (mp) TungMP.progress(score); }
        if (BX + bw > p.x && BX - bw < p.x + PIPE_W && (bird.y - bh < p.top || bird.y + bh > p.top + p.gap)) return die("🪵 Bonked a green Tung!");
      }
      if (bird.y + bh > H - GROUND) return die("🌱 Hit the ground!");
      if (bird.y - bh < -60) return die("☁️ Flew too high!");
    } else if (state === "dead") {
      bird.vy = Math.min(900, bird.vy + GRAV * dt); bird.y = Math.min(H - GROUND - 18, bird.y + bird.vy * dt); bird.rot = Math.min(1.6, bird.rot + dt * 5);
    }
  }
  function die(text) {
    state = "dead"; deadAt = performance.now(); shake = 0.3; beep(140, 0.35, "sawtooth", 0.09);
    if (mp) {
      sendMe(true);
      msgEl.textContent = `${text} You passed ${score}. Waiting for your opponent…`;
      TungMP.progress(score); TungMP.finish({ score });
      return;
    }
    if (score > best) { best = score; localStorage.setItem("tungFlappyBest", best); bestEl.textContent = best; msgEl.textContent = `${text} New best: ${score} 🏆`; }
    else msgEl.textContent = `${text} You passed ${score}.`;
    if (score > 0 && window.TungMP) TungMP.submitSolo({ game: "flappy", score });
    startBtn.textContent = "Play Again";
  }

  // ---------- drawing ----------
  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 8 * shake * 3, (Math.random() - 0.5) * 8 * shake * 3);
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#58b4ee"); sky.addColorStop(1, "#bfe8ff");
    ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (const c of clouds) { ctx.beginPath(); ctx.arc(c.x, c.y, 22 * c.s, 0, 7); ctx.arc(c.x + 24 * c.s, c.y + 4, 18 * c.s, 0, 7); ctx.arc(c.x - 22 * c.s, c.y + 6, 16 * c.s, 0, 7); ctx.fill(); }
    // distant hills
    ctx.fillStyle = "#8fd18f";
    ctx.beginPath(); ctx.moveTo(0, H - GROUND);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H - GROUND - 40 - 22 * Math.sin((x + scroll * 20) / 60));
    ctx.lineTo(W, H - GROUND); ctx.fill();
    // pipes: green Tung Tung Sahurs
    for (const p of pipes) {
      TA.drawPipe(ctx, p.x, -60, PIPE_W, p.top + 60, "bottom", { green: true });
      TA.drawPipe(ctx, p.x, p.top + p.gap, PIPE_W, H - GROUND - (p.top + p.gap) + 40, "top", { green: true });
    }
    // ground
    ctx.fillStyle = "#7a4a1f"; ctx.fillRect(0, H - GROUND, W, GROUND);
    ctx.fillStyle = "#4fae4f"; ctx.fillRect(0, H - GROUND, W, 14);
    ctx.fillStyle = "#5d3716";
    const off = (state === "run" || state === "dead" ? dist : state === "idle" ? scroll * 150 : 0) % 40;
    for (let x = -off; x < W; x += 40) ctx.fillRect(x, H - GROUND + 30, 20, 6);
    // particles
    ctx.fillStyle = "rgba(255,255,255,.7)";
    for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life * 2); ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    // the bird: Tung Tung Sahur, bat flapping like a wing
    const wing = flapT > 0 ? 1.4 - (flapT / 0.18) * 1.2 : 0.2;
    TA.draw(ctx, BX, bird.y, 56, { gear: TungGear.mine(), rot: bird.rot + 0.15, bat: -0.5 + wing * 0.9, eyes: state === "dead" ? "x" : "normal", mouth: state === "dead" ? "sad" : state === "run" && bird.vy < 0 ? "open" : "smile", look: [0.6, bird.vy / 900], legs: state === "run" ? performance.now() / 160 : 0 });
    // the opponent (multiplayer): same pipes, their own position along them
    if (mp && opp) {
      const name = (window.TungMP && TungMP.match && TungMP.match.opp && TungMP.match.opp.username) || "Opponent";
      let ox = BX + (opp.dd - dist), edge = 0;
      if (ox < 28) { ox = 28; edge = -1; } else if (ox > W - 28) { ox = W - 28; edge = 1; }
      const wing = opp.flap > 0 ? 1.4 - (opp.flap / 0.18) * 1.2 : 0.2;
      ctx.save(); ctx.globalAlpha = opp.dead ? 0.45 : 0.62;
      TA.draw(ctx, ox, opp.dy, edge ? 40 : 56, { gear: oppGear, rot: opp.dr + 0.15, bat: -0.5 + wing * 0.9, eyes: opp.dead ? "x" : "normal", mouth: opp.dead ? "sad" : "smile", look: [0.6, 0], legs: opp.dead ? 0 : performance.now() / 160 });
      ctx.globalAlpha = 1; ctx.font = "800 12px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "#1b3a55"; ctx.fillStyle = "#ffd23f";
      const label = (edge < 0 ? "◀ " : "") + name + (opp.dead ? " 💀" : "") + (edge > 0 ? " ▶" : ""), ly = Math.max(16, opp.dy - 38);
      ctx.strokeText(label, Math.max(60, Math.min(W - 60, ox)), ly); ctx.fillText(label, Math.max(60, Math.min(W - 60, ox)), ly);
      ctx.restore();
    }
    // score
    ctx.textAlign = "center"; ctx.lineJoin = "round";
    ctx.font = "900 54px sans-serif"; ctx.lineWidth = 8; ctx.strokeStyle = "#1b3a55"; ctx.strokeText(score, W / 2, 90);
    ctx.fillStyle = "#fff"; ctx.fillText(score, W / 2, 90);
    if (state === "idle") {
      ctx.font = "800 22px sans-serif"; ctx.lineWidth = 5; ctx.strokeStyle = "#1b3a55";
      const t = mp ? "Get ready…" : "Tap to flap!";
      ctx.strokeText(t, W / 2, H * 0.62); ctx.fillStyle = "#fff"; ctx.fillText(t, W / 2, H * 0.62);
    }
    ctx.restore();
  }

  function frame(t) {
    const dt = Math.min(0.033, last ? (t - last) / 1000 : 0.016);
    last = t;
    shake = Math.max(0, shake - dt);
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  // ---------- input ----------
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
      e.preventDefault();
      if (e.repeat) return;
      if (state === "dead" && !mp) { if (performance.now() - deadAt > 500) restart(); return; }
      flap();
    }
  });
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === "dead" && !mp) { if (performance.now() - deadAt > 500) restart(); return; }
    flap();
  });
  function restart() { if (mp) return; seed = "solo" + Date.now(); reset(); msgEl.textContent = "Press Space, click or tap to flap"; startBtn.textContent = "Start"; }
  startBtn.addEventListener("click", () => { if (mp) return; seed = "solo" + Date.now(); reset(); begin(); });

  reset();
  window.__flappy = () => ({ pipes, dist, opp, bird, state, speedAt, SPACING, centerAt });

  // ---------- multiplayer ----------
  if (window.TungMP) TungMP.on("msg:rt", (m) => {
    const d = m && m.d; if (!mp || !d || d.k !== "f") return;
    const first = !opp, was = opp && opp.dead;
    opp = Object.assign(opp || { dd: d.d, dy: d.y, dr: d.r, fv: 0, flap: 0 }, { d: d.d, y: d.y, r: d.r, v: d.v, dead: !!d.x, at: performance.now() });
    if (d.w) opp.flap = 0.18;
    if (d.x && !was) opp.fv = 0;
    if (first) { opp.dd = d.d; opp.dy = d.y; opp.dr = d.r; }
  });
  if (window.TungMP) TungMP.registerGame({
    prepareMatch(m) { mp = true; seed = m.seed; reset(); oppGear = TungGear.fromNums(m.opp.gear); opp = { dd: 0, dy: bird.y, dr: 0, fv: 0, flap: 0, d: 0, y: bird.y, r: 0, v: 0, dead: false, at: 0 }; msgEl.textContent = ""; },
    startMatch() { if (mp) { begin(); bird.vy = FLAP; } },
    stopMatch() { if (state === "run") { state = "dead"; deadAt = performance.now(); } },
    exitMatch() { mp = false; seed = "solo"; reset(); msgEl.textContent = "Press Space, click or tap to flap"; startBtn.textContent = "Start"; },
  });
})();
