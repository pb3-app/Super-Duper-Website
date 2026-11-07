(() => {
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const CW = canvas.width, CH = canvas.height;
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const msgEl = document.getElementById("msg");
  const startBtn = document.getElementById("startBtn");
  const ladderEl = document.getElementById("ladder");

  // Italian brainrot ladder: two of the same merge into the next one up.
  const TIERS = [
    { name: "Tung Tung Tung Sahur", e: "🪵", r: 15, c: "#b5763c", pts: 0 },
    { name: "Tralalero Tralala", e: "🦈", r: 21, c: "#4a90c9", pts: 1 },
    { name: "Bombardiro Crocodilo", e: "🐊", r: 27, c: "#4f9d4a", pts: 3 },
    { name: "Chimpanzini Bananini", e: "🐒", r: 33, c: "#e0b64a", pts: 6 },
    { name: "Ballerina Cappuccina", e: "☕", r: 40, c: "#c98a5a", pts: 10 },
    { name: "Lirili Larila", e: "🐘", r: 48, c: "#8d99a6", pts: 15 },
    { name: "Trippi Troppi", e: "🐸", r: 56, c: "#58b368", pts: 21 },
    { name: "Bombombini Gusini", e: "🦆", r: 65, c: "#e6d44a", pts: 28 },
    { name: "Cappuccino Assassino", e: "🥷", r: 74, c: "#555b66", pts: 36 },
    { name: "Brr Brr Patapim", e: "🌳", r: 84, c: "#3e8a55", pts: 45 },
    { name: "Glorbo Fruttodrillo", e: "🍉", r: 95, c: "#d9435a", pts: 55 },
  ];
  const BX0 = 20, BX1 = 380, BY1 = 620;   // container walls and floor
  const TOP = 110;                         // top of the container
  const LINE = 150;                        // the danger line
  const G = 1500;

  let seed = "solo", mp = false;
  let pieces, nextId, score, aimX, dropN, cooldown, over, running, raf = 0, last = 0, dangerT, reported;
  let nextTier, curTier, pops = [];
  let best = Number(localStorage.getItem("tungBrainrotBest") || 0);
  bestEl.textContent = best;

  for (const t of TIERS.slice(0, 8)) ladderEl.append(Object.assign(document.createElement("span"), { textContent: t.e, title: t.name }));
  ladderEl.append(Object.assign(document.createElement("small"), { textContent: "Next up: " + TIERS.slice(8).map((t) => t.e).join(" → ") }));

  function pickTier(n) {
    const r = TungMP.rng(seed + ":drop:" + n)();
    return r < 0.34 ? 0 : r < 0.62 ? 1 : r < 0.82 ? 2 : r < 0.94 ? 3 : 4;
  }

  function reset() {
    pieces = []; nextId = 1; score = 0; aimX = (BX0 + BX1) / 2; dropN = 0; cooldown = 0; over = false; dangerT = 0; reported = 0; pops = [];
    curTier = pickTier(0); nextTier = pickTier(1);
    scoreEl.textContent = 0;
    cancelAnimationFrame(raf); running = false;
    draw();
  }

  // ---------- physics ----------
  function addPiece(x, y, tier, vx = 0, vy = 0) {
    pieces.push({ id: nextId++, x, y, vx, vy, tier, r: TIERS[tier].r, age: 0 });
  }

  function physics(dt) {
    const SUB = 4, h = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      for (const p of pieces) {
        p.vy += G * h;
        p.x += p.vx * h; p.y += p.vy * h;
        if (p.x - p.r < BX0) { p.x = BX0 + p.r; p.vx = Math.abs(p.vx) * 0.2; }
        if (p.x + p.r > BX1) { p.x = BX1 - p.r; p.vx = -Math.abs(p.vx) * 0.2; }
        if (p.y + p.r > BY1) { p.y = BY1 - p.r; p.vy = -Math.abs(p.vy) * 0.15; p.vx *= 0.97; }
      }
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < pieces.length; i++) {
          for (let j = i + 1; j < pieces.length; j++) {
            const a = pieces[i], b = pieces[j];
            const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
            if (dx * dx + dy * dy >= min * min) continue;
            const d = Math.sqrt(dx * dx + dy * dy) || 0.001, nx = dx / d, ny = dy / d, ov = min - d;
            const ma = a.r * a.r, mb = b.r * b.r, tot = ma + mb;
            a.x -= nx * ov * (mb / tot); a.y -= ny * ov * (mb / tot);
            b.x += nx * ov * (ma / tot); b.y += ny * ov * (ma / tot);
            const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (vn < 0) {
              const j2 = (-(1 + 0.1) * vn) / (1 / ma + 1 / mb);
              a.vx -= (j2 / ma) * nx; a.vy -= (j2 / ma) * ny;
              b.vx += (j2 / mb) * nx; b.vy += (j2 / mb) * ny;
              // a little sliding friction
              const tx = -ny, ty = nx, vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
              const f = vt * 0.02;
              a.vx += (f * tx * mb) / tot; a.vy += (f * ty * mb) / tot;
              b.vx -= (f * tx * ma) / tot; b.vy -= (f * ty * ma) / tot;
            }
          }
        }
      }
      for (const p of pieces) {
        p.vx *= 0.999; p.vy *= 0.999;
        if (Math.abs(p.vx) < 1.5) p.vx = 0;
      }
      merges();
    }
  }

  function merges() {
    const gone = new Set();
    const born = [];
    for (let i = 0; i < pieces.length; i++) {
      const a = pieces[i];
      if (gone.has(a.id)) continue;
      for (let j = i + 1; j < pieces.length; j++) {
        const b = pieces[j];
        if (gone.has(b.id) || a.tier !== b.tier) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy > (a.r + b.r + 1.5) * (a.r + b.r + 1.5)) continue;
        gone.add(a.id); gone.add(b.id);
        const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
        if (a.tier === TIERS.length - 1) { gain(100); pops.push({ x, y, t: 0, e: "✨" }); }
        else { born.push({ x, y, tier: a.tier + 1, vx: (a.vx + b.vx) / 2, vy: (a.vy + b.vy) / 2 }); gain(TIERS[a.tier + 1].pts); pops.push({ x, y, t: 0, e: "✨" }); }
        beep(300 + a.tier * 70);
        break;
      }
    }
    if (gone.size) {
      pieces = pieces.filter((p) => !gone.has(p.id));
      for (const b of born) addPiece(b.x, b.y, b.tier, b.vx, b.vy);
    }
  }
  function gain(n) { score += n; scoreEl.textContent = score; }

  let audio;
  function beep(f) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      o.type = "triangle"; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.12);
      g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.2);
    } catch (_) {}
  }

  // ---------- game flow ----------
  function drop() {
    if (!running || over || cooldown > 0) return;
    const t = TIERS[curTier];
    const x = Math.max(BX0 + t.r, Math.min(BX1 - t.r, aimX));
    addPiece(x, TOP - t.r, curTier);
    dropN++;
    curTier = nextTier; nextTier = pickTier(dropN + 1);
    cooldown = 0.55;
    beep(180);
  }

  function update(dt) {
    cooldown = Math.max(0, cooldown - dt);
    physics(dt);
    for (const p of pops) p.t += dt;
    pops = pops.filter((p) => p.t < 0.5);
    // the pile is too high if something resting sits above the line for a while
    let danger = false;
    for (const p of pieces) {
      p.age += dt;
      if (p.age > 1.2 && p.y - p.r < LINE && Math.hypot(p.vx, p.vy) < 60) danger = true;
    }
    dangerT = danger ? dangerT + dt : Math.max(0, dangerT - dt * 2);
    if (dangerT > 2) return finish();
    if (mp && score !== reported) { reported = score; TungMP.progress(score); }
  }

  function finish() {
    running = false; over = true;
    cancelAnimationFrame(raf);
    draw();
    if (mp) {
      msgEl.textContent = `The pile hit the line! ${score} points. Waiting for your opponent…`;
      TungMP.progress(score);
      TungMP.finish({ score });
      return;
    }
    if (score > best) { best = score; localStorage.setItem("tungBrainrotBest", best); bestEl.textContent = best; msgEl.textContent = `Game over. New best: ${score} 🏆`; }
    else msgEl.textContent = `Game over. ${score} points.`;
    if (score > 0 && window.TungMP) TungMP.submitSolo({ game: "brainrot", score });
    startBtn.textContent = "Play Again";
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min(0.033, last ? (t - last) / 1000 : 0.016);
    last = t;
    update(dt);
    if (!running) return;
    draw();
    raf = requestAnimationFrame(frame);
  }
  function begin() { running = true; last = 0; msgEl.textContent = ""; startBtn.textContent = "Restart"; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  function start() { if (mp) return; seed = "solo" + Date.now(); reset(); begin(); }

  // ---------- drawing ----------
  function drawPiece(p, x, y, alpha) {
    const t = TIERS[p.tier];
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    const g = ctx.createRadialGradient(x - p.r * 0.3, y - p.r * 0.35, p.r * 0.1, x, y, p.r);
    g.addColorStop(0, "#ffffff55"); g.addColorStop(0.25, t.c); g.addColorStop(1, shade(t.c));
    ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.stroke();
    ctx.font = `${Math.round(p.r * 1.15)}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff";
    ctx.fillText(t.e, x, y + p.r * 0.06);
    ctx.restore();
  }
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.round(v * 0.55));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = "#14101c"; ctx.fillRect(0, 0, CW, CH);
    // container
    ctx.fillStyle = "#1e1829"; ctx.fillRect(BX0, TOP, BX1 - BX0, BY1 - TOP);
    ctx.strokeStyle = "#b5763c"; ctx.lineWidth = 8; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(BX0 - 4, TOP); ctx.lineTo(BX0 - 4, BY1 + 4); ctx.lineTo(BX1 + 4, BY1 + 4); ctx.lineTo(BX1 + 4, TOP); ctx.stroke();
    // danger line
    ctx.setLineDash([8, 8]); ctx.strokeStyle = dangerT > 0 ? "#ff5252" : "rgba(255,120,120,.45)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(BX0, LINE); ctx.lineTo(BX1, LINE); ctx.stroke(); ctx.setLineDash([]);
    for (const p of pieces) drawPiece(p, p.x, p.y);
    // the piece in hand and the next one
    if (!over) {
      const t = TIERS[curTier];
      const x = Math.max(BX0 + t.r, Math.min(BX1 - t.r, aimX));
      if (running) {
        ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.moveTo(x, TOP); ctx.lineTo(x, BY1); ctx.stroke(); ctx.setLineDash([]);
      }
      drawPiece({ tier: curTier, r: t.r }, x, Math.min(TOP - t.r - 4, 80), cooldown > 0 ? 0.4 : 1);
      ctx.fillStyle = "#fff"; ctx.font = "bold 13px Trebuchet MS, sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "top";
      ctx.fillText("Next", CW - 14, 12);
      drawPiece({ tier: nextTier, r: Math.min(TIERS[nextTier].r, 24) }, CW - 34, 52);
    }
    for (const p of pops) { ctx.globalAlpha = 1 - p.t / 0.5; ctx.font = "26px sans-serif"; ctx.textAlign = "center"; ctx.fillText(p.e, p.x, p.y - p.t * 40); ctx.globalAlpha = 1; }
  }

  // ---------- input ----------
  function setAim(e) {
    const r = canvas.getBoundingClientRect();
    aimX = ((e.clientX - r.left) * CW) / r.width;
    if (!running) draw();
  }
  canvas.addEventListener("pointermove", setAim);
  canvas.addEventListener("pointerdown", (e) => { setAim(e); if (!running && !mp && !over) start(); else drop(); });
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); if (!running && !mp) start(); else drop(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); aimX = Math.max(BX0, aimX - 18); if (!running) draw(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); aimX = Math.min(BX1, aimX + 18); if (!running) draw(); }
  });
  startBtn.addEventListener("click", start);

  reset();

  // ---------- multiplayer hooks (see mp.js) ----------
  if (window.TungMP) TungMP.registerGame({
    prepareMatch(m) { mp = true; seed = m.seed; reset(); msgEl.textContent = ""; },
    startMatch() { if (mp) begin(); },
    stopMatch() { running = false; cancelAnimationFrame(raf); },
    exitMatch() { mp = false; seed = "solo"; reset(); msgEl.textContent = "Press Start or Space"; startBtn.textContent = "Start"; },
  });
})();
