(() => {
  const TA = window.TungArt;
  const canvas = document.getElementById("view"), ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const $ = (id) => document.getElementById(id);
  const scoreEl = $("score"), timeEl = $("time"), comboEl = $("combo"), bestEl = $("best"), msgEl = $("msg"), startBtn = $("startBtn"), barEl = $("bar");
  const ROUND = 45000;
  const HOLES = []; // 3 x 3
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) HOLES.push({ x: 130 + c * 190, y: 170 + r * 150 });

  let seed = "solo", mp = false, running = false, ended = false, raf = 0;
  let score, streak, bestStreak, hits, shots, penalty, t0, spawns, next, moles, fx, mouse = { x: W / 2, y: H / 2 }, swing = 0;
  let best = Number(localStorage.getItem("tungWhackBest") || 0);
  bestEl.textContent = best;
  let audio;
  function beep(f, d, type = "square", v = 0.07, slide = 0.5) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (_) {}
  }

  // The whole round's pop-ups are planned from the seed, so everyone in a match faces the same Tungs.
  function plan(sd) {
    const rnd = TungMP.rng(sd + ":plan");
    const list = [], busyUntil = new Array(9).fill(-1);
    let t = 700;
    while (t < ROUND + 3000) {
      const p = t / ROUND;
      const gap = 880 - 520 * Math.min(1, p) + rnd() * 220 - 110;
      const up = 1250 - 650 * Math.min(1, p) + rnd() * 250;
      const free = []; for (let h = 0; h < 9; h++) if (busyUntil[h] < t) free.push(h);
      if (free.length) {
        const hole = free[Math.floor(rnd() * free.length)];
        const roll = rnd();
        const type = roll < 0.12 ? "gold" : roll < 0.3 ? "decoy" : roll < 0.5 ? "helmet" : "tung";
        const dur = type === "gold" ? up * 0.62 : type === "helmet" ? up * 1.15 : up;
        list.push({ hole, type, t0: t, dur, hp: type === "helmet" ? 2 : 1 });
        busyUntil[hole] = t + dur + 200;
      }
      t += Math.max(260, gap);
    }
    return list;
  }

  function reset() {
    score = 0; streak = 0; bestStreak = 0; hits = 0; shots = 0; penalty = 0; t0 = 0;
    spawns = plan(seed); next = 0; moles = []; fx = []; ended = false; running = false;
    scoreEl.textContent = 0; comboEl.textContent = "x1"; timeEl.textContent = ROUND / 1000; barEl.style.width = "100%";
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  const mult = () => Math.min(4, 1 + Math.floor(streak / 5));
  function begin() { running = true; ended = false; t0 = performance.now(); msgEl.textContent = ""; startBtn.textContent = "Restart"; }

  function popup(text, x, y, color) { fx.push({ k: "text", text, x, y, color, born: performance.now() }); }

  function whack(x, y, keyHole) {
    if (!running || ended) return;
    swing = performance.now();
    shots++;
    const now = performance.now() - t0;
    let target = null;
    for (const m of moles) {
      if (m.dead) continue;
      const h = HOLES[m.hole];
      const vis = rise(m, now);
      if (vis < 0.25) continue;
      const hit = keyHole !== undefined ? keyHole === m.hole : (x > h.x - 52 && x < h.x + 52 && y > h.y - 118 * vis - 8 && y < h.y + 24);
      if (hit && (!target || h.y > HOLES[target.hole].y)) target = m;
    }
    if (!target) { // a swing at nothing
      if (streak > 0) popup("miss", x, y, "#ffd0cc");
      streak = 0; comboEl.textContent = "x1"; beep(200, 0.08, "sine", 0.05);
      const hx = keyHole !== undefined ? HOLES[keyHole].x : x, hy = keyHole !== undefined ? HOLES[keyHole].y : y;
      fx.push({ k: "dust", x: hx, y: hy, born: performance.now() });
      return;
    }
    const h = HOLES[target.hole];
    if (target.type === "decoy") {
      target.dead = now; target.hitType = "decoy";
      streak = 0; penalty += 2000; comboEl.textContent = "x1";
      popup("-2s!", h.x, h.y - 100, "#7df08f"); beep(110, 0.35, "sawtooth", 0.1, 0.5);
      fx.push({ k: "burst", x: h.x, y: h.y - 40, born: performance.now(), green: true });
      return;
    }
    target.hp--;
    if (target.hp > 0) { target.cracked = true; popup("crack!", h.x, h.y - 100, "#fff"); beep(300, 0.07, "triangle", 0.08); fx.push({ k: "stars", x: h.x, y: h.y - 70, born: performance.now() }); return; }
    target.dead = now; target.hitType = target.type;
    const base = target.type === "gold" ? 30 : target.type === "helmet" ? 20 : 10;
    streak++; bestStreak = Math.max(bestStreak, streak); hits++;
    const gain = base * mult();
    score += gain; scoreEl.textContent = score; comboEl.textContent = "x" + mult();
    popup("+" + gain, h.x, h.y - 100, target.type === "gold" ? "#ffe45e" : "#fff");
    fx.push({ k: "stars", x: h.x, y: h.y - 70, born: performance.now() });
    beep(target.type === "gold" ? 900 : 420, 0.1, "square", 0.08, 0.6);
    if (mp) TungMP.progress(score);
  }
  const rise = (m, now) => {
    const age = now - m.t0;
    if (m.dead) return Math.max(0, 1 - (now - m.dead) / 160) * Math.min(1, age / 120);
    if (age < 0) return 0;
    if (age < 130) return age / 130;
    if (age < m.dur - 150) return 1;
    return Math.max(0, (m.dur - age) / 150);
  };

  function endRound() {
    ended = true; running = false;
    const acc = shots ? Math.round((hits / shots) * 100) : 0;
    const summary = `Score ${score} · ${hits} Tungs whacked · ${acc}% accuracy · best streak ${bestStreak}`;
    if (mp) { msgEl.textContent = `Time! ${summary}. Waiting for your opponent…`; TungMP.progress(score); TungMP.finish({ score }); return; }
    if (score > best) { best = score; localStorage.setItem("tungWhackBest", best); bestEl.textContent = best; msgEl.textContent = `Time! ${summary} - new best! 🏆`; }
    else msgEl.textContent = `Time! ${summary}`;
    if (score > 0 && window.TungMP) TungMP.submitSolo({ game: "whack", score });
    startBtn.textContent = "Play Again";
    beep(500, 0.4, "triangle", 0.1, 0.4);
  }

  // ---------- drawing ----------
  function moleArt(m, now, h, vis) {
    const y = h.y + 12 - vis * 62; // log centre; the lower part is hidden by the mound
    const o = { bat: m.cracked ? 1.2 : 0.35, mouth: m.dead ? "sad" : "open", eyes: m.dead ? "x" : "normal", look: [0, 0.5] };
    if (m.type === "gold") o.pal = "gold"; else if (m.type === "decoy") o.green = true;
    ctx.save();
    ctx.beginPath(); ctx.rect(h.x - 120, h.y - 220, 240, 220 + 14); ctx.clip();
    TA.draw(ctx, h.x, y - 20, 126, o);
    if (m.type === "helmet" && m.hp > 0) { // a steel cap on top
      ctx.fillStyle = m.cracked ? "#9aa" : "#b8c4cc"; ctx.strokeStyle = "#556"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(h.x, y - 66, 36, 17, 0, Math.PI, 0); ctx.lineTo(h.x + 36, y - 60); ctx.ellipse(h.x, y - 60, 36, 7, 0, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (m.cracked) { ctx.strokeStyle = "#333"; ctx.beginPath(); ctx.moveTo(h.x - 6, y - 82); ctx.lineTo(h.x + 2, y - 70); ctx.lineTo(h.x - 4, y - 64); ctx.stroke(); }
    }
    ctx.restore();
  }
  function draw() {
    const now = performance.now();
    const rel = running || ended ? now - t0 : 0;
    // lawn
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#4da24d"); g.addColorStop(1, "#2f7a2f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(0,0,0,.08)"; ctx.lineWidth = 3;
    for (let i = 0; i < 26; i++) { const x = (i * 97) % W, y = (i * 61) % H; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y - 9); ctx.stroke(); }
    // holes back, moles, mound front
    HOLES.forEach((h, i) => {
      ctx.fillStyle = "#1a0f06"; ctx.beginPath(); ctx.ellipse(h.x, h.y, 62, 20, 0, 0, 7); ctx.fill();
      const m = moles.find((q) => q.hole === i && !q.gone);
      if (m) { const vis = rise(m, rel); if (vis > 0) moleArt(m, rel, h, vis); }
      ctx.fillStyle = "#6b4423"; ctx.beginPath(); ctx.ellipse(h.x, h.y + 6, 66, 18, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = "#845630"; ctx.beginPath(); ctx.ellipse(h.x, h.y + 3, 66, 16, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.font = "800 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText("QWEASDZXC"[i], h.x, h.y + 38);
    });
    // effects
    fx = fx.filter((f) => now - f.born < 800);
    for (const f of fx) {
      const k = (now - f.born) / 800;
      if (f.k === "text") { ctx.globalAlpha = 1 - k; ctx.font = "900 28px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 6; ctx.strokeStyle = "#1b3a1b"; ctx.strokeText(f.text, f.x, f.y - k * 36); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - k * 36); ctx.globalAlpha = 1; }
      else if (f.k === "stars" || f.k === "burst") {
        ctx.globalAlpha = 1 - k; ctx.fillStyle = f.green ? "#7df08f" : "#ffe45e";
        for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 + k, d = 18 + k * 50; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.7, 5 * (1 - k) + 2, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
      } else if (f.k === "dust") { ctx.globalAlpha = (1 - k) * 0.6; ctx.fillStyle = "#c9a36a"; ctx.beginPath(); ctx.ellipse(f.x, f.y, 20 + k * 40, 8 + k * 14, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    }
    // mallet
    const sw = Math.max(0, 1 - (now - swing) / 160);
    ctx.save(); ctx.translate(mouse.x, mouse.y); ctx.rotate(-0.5 + sw * 1.2);
    ctx.strokeStyle = "#8c5a2a"; ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 62); ctx.stroke();
    ctx.fillStyle = "#c58a4a"; ctx.strokeStyle = "#5e3a18"; ctx.lineWidth = 3; ctx.fillRect(-26, -20, 52, 30); ctx.strokeRect(-26, -20, 52, 30);
    ctx.restore();
  }

  let lastTick = 0;
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (running) {
      const rel = t === undefined ? 0 : performance.now() - t0;
      // activate planned pop-ups
      while (next < spawns.length && spawns[next].t0 <= rel) { moles.push({ ...spawns[next], cracked: false, dead: 0 }); next++; }
      moles = moles.filter((m) => { const gone = m.dead ? rel - m.dead > 200 : rel - m.t0 > m.dur + 50; if (gone) m.gone = true; return !gone; });
      const left = Math.max(0, ROUND - penalty - rel);
      timeEl.textContent = Math.ceil(left / 1000);
      barEl.style.width = (left / ROUND) * 100 + "%";
      if (left <= 0) endRound();
    }
    void lastTick;
    draw();
  }

  // ---------- input ----------
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  canvas.addEventListener("pointermove", (e) => { mouse = pos(e); });
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); mouse = pos(e); whack(mouse.x, mouse.y); });
  const KEYS = "qweasdzxc";
  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const i = KEYS.indexOf(e.key.toLowerCase());
    if (i >= 0 && e.key.length === 1 && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== "INPUT") whack(HOLES[i].x, HOLES[i].y, i);
    if (e.code === "Space") { e.preventDefault(); if (!running && !mp) { seed = "solo" + Date.now(); reset(); begin(); } }
  });
  startBtn.addEventListener("click", () => { if (mp) return; seed = "solo" + Date.now(); reset(); begin(); });

  reset();
  if (window.TungMP) TungMP.registerGame({
    prepareMatch(m) { mp = true; seed = m.seed; reset(); msgEl.textContent = ""; },
    startMatch() { if (mp) begin(); },
    stopMatch() { running = false; },
    exitMatch() { mp = false; seed = "solo"; reset(); msgEl.textContent = "Press Start - whack every brown Tung that pops up!"; startBtn.textContent = "Start"; },
  });
})();
