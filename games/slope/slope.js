(() => {
  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const CW = canvas.width, CH = canvas.height;
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const msgEl = document.getElementById("msg");
  const startBtn = document.getElementById("startBtn");

  const HW = 3.4;            // half the road width
  const CHUNK = 28;          // world is built in chunks of this length
  const COLS = [-2.2, 0, 2.2];
  const FOCAL = 360, CAM_H = 3.4, CAM_BACK = 7.5, HORIZON = CH * 0.36;

  let seed = "solo";
  let world, ball, running = false, dead = false, mp = false, raf = 0, last = 0;
  let steer = 0, keyL = false, keyR = false, touchDir = 0;
  let reported = 0;
  let best = Number(localStorage.getItem("tungSlopeBest") || 0);
  bestEl.textContent = best;

  // ---------- world generation (same for both players in a match) ----------
  const chunks = new Map(); // index -> {obstacles, holes}
  function makeChunk(i) {
    if (chunks.has(i)) return chunks.get(i);
    const rnd = TungMP.rng(seed + ":" + i);
    const items = { obstacles: [], holes: [] };
    if (i >= 1) {
      const d = Math.min(1, i / 45);
      // a walk of always-open columns keeps every row fair
      let open = Math.floor(rnd() * 3);
      const rows = 3;
      for (let r = 0; r < rows; r++) {
        if (rnd() > 0.55 + d * 0.4) continue;
        const z = i * CHUNK + 4 + r * (CHUNK / rows);
        const step = Math.floor(rnd() * 3) - 1;
        open = Math.max(0, Math.min(2, open + step));
        const kind = i > 3 && rnd() < 0.3 ? "hole" : "block";
        for (let c = 0; c < 3; c++) {
          if (c === open) continue;
          if (rnd() < 0.55 + d * 0.3) {
            if (kind === "block") items.obstacles.push({ x: COLS[c], z, hw: 0.95, hd: 0.7, h: 1.3 });
            else items.holes.push({ x0: COLS[c] - 1.1, x1: COLS[c] + 1.1, z0: z - 1.6, z1: z + 1.6 });
          }
        }
      }
    }
    chunks.set(i, items);
    return items;
  }
  function nearby(z0, z1) {
    const out = { obstacles: [], holes: [] };
    for (let i = Math.max(0, Math.floor(z0 / CHUNK)); i <= Math.floor(z1 / CHUNK); i++) {
      const c = makeChunk(i);
      out.obstacles.push(...c.obstacles);
      out.holes.push(...c.holes);
    }
    return out;
  }

  function reset() {
    chunks.clear();
    ball = { x: 0, z: 0, y: 0.45, vx: 0, fall: 0 };
    world = { speed: 12 };
    running = false; dead = false; reported = 0;
    scoreEl.textContent = 0;
    cancelAnimationFrame(raf);
    draw();
  }

  // ---------- projection ----------
  function project(x, y, z) {
    const camZ = ball.z - CAM_BACK, dz = z - camZ;
    if (dz < 0.3) return null;
    const k = FOCAL / dz;
    return [CW / 2 + (x - ball.x * 0.55) * k, HORIZON + (CAM_H - y) * k, k];
  }
  function quad(a, b, c, d, fill) {
    if (!a || !b || !c || !d) return;
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
  }

  function draw() {
    ctx.fillStyle = "#070a0d"; ctx.fillRect(0, 0, CW, CH);
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
    sky.addColorStop(0, "#04070a"); sky.addColorStop(1, "#10202a");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, HORIZON);
    const camZ = ball.z - CAM_BACK, far = camZ + 130;
    const objs = nearby(camZ - 5, far);
    const inHole = (z, x) => objs.holes.some((h) => z >= h.z0 && z <= h.z1 && x >= h.x0 && x <= h.x1);

    // road strips from far to near
    for (let z = Math.floor(far / 3) * 3; z >= camZ - 3; z -= 3) {
      const a = project(-HW, 0, z + 3), b = project(HW, 0, z + 3), c = project(HW, 0, z), d = project(-HW, 0, z);
      const stripe = Math.floor(z / 3) % 2;
      quad(a, b, c, d, stripe ? "#16262b" : "#1b2f35");
      if (a && d) { // lit edges
        ctx.strokeStyle = "rgba(218,250,156,.55)"; ctx.lineWidth = Math.max(1, d[2] * 0.05);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
        const bb = b, cc = c;
        ctx.beginPath(); ctx.moveTo(bb[0], bb[1]); ctx.lineTo(cc[0], cc[1]); ctx.stroke();
      }
    }
    // holes: paint the void over the road
    for (const h of objs.holes) {
      if (h.z1 < camZ) continue;
      quad(project(h.x0, 0, h.z1), project(h.x1, 0, h.z1), project(h.x1, 0, h.z0), project(h.x0, 0, h.z0), "#050709");
    }
    // obstacles, far to near
    objs.obstacles.sort((a, b) => b.z - a.z);
    for (const o of objs.obstacles) {
      if (o.z + o.hd < camZ + 0.3 || o.z > far) continue;
      const x0 = o.x - o.hw, x1 = o.x + o.hw, z0 = o.z - o.hd, z1 = o.z + o.hd;
      quad(project(x0, o.h, z1), project(x1, o.h, z1), project(x1, o.h, z0), project(x0, o.h, z0), "#ff6b5e"); // top
      quad(project(x0, o.h, z0), project(x1, o.h, z0), project(x1, 0, z0), project(x0, 0, z0), "#d6382b"); // front
      quad(project(x0, o.h, z1), project(x0, o.h, z0), project(x0, 0, z0), project(x0, 0, z1), "#a82a21"); // sides
      quad(project(x1, o.h, z0), project(x1, o.h, z1), project(x1, 0, z1), project(x1, 0, z0), "#a82a21");
    }
    // ball
    const bp = project(ball.x, Math.max(-6, ball.y), ball.z);
    if (bp) {
      const r = 0.45 * bp[2];
      ctx.fillStyle = "rgba(0,0,0,.4)";
      if (!ball.fall) { const sp = project(ball.x, 0, ball.z); ctx.beginPath(); ctx.ellipse(sp[0], sp[1], r * 0.9, r * 0.35, 0, 0, 7); ctx.fill(); }
      const gr = ctx.createRadialGradient(bp[0] - r * 0.3, bp[1] - r * 0.3, r * 0.1, bp[0], bp[1], r);
      gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#dafa9c");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(bp[0], bp[1], r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------- update ----------
  function update(dt) {
    const dir = (keyR ? 1 : 0) - (keyL ? 1 : 0) || touchDir;
    ball.vx += ((dir * 8.5) - ball.vx) * Math.min(1, dt * 12);
    if (!ball.fall) {
      world.speed = Math.min(36, 12 + ball.z * 0.012);
      ball.z += world.speed * dt;
      ball.x += ball.vx * dt;
      const objs = nearby(ball.z - 2, ball.z + 3);
      // crash into a block?
      for (const o of objs.obstacles) {
        if (Math.abs(ball.x - o.x) < o.hw + 0.38 && Math.abs(ball.z - o.z) < o.hd + 0.38) return crash("💥 Smashed into a block!");
      }
      if (Math.abs(ball.x) > HW) { ball.fall = 1; ball.msg = "🕳️ Fell off the edge!"; }
      else if (objs.holes.some((h) => ball.z > h.z0 + 0.3 && ball.z < h.z1 && ball.x > h.x0 && ball.x < h.x1)) { ball.fall = 1; ball.msg = "🕳️ Fell into a gap!"; }
    } else {
      ball.fall += dt;
      ball.y -= 14 * ball.fall * dt;
      ball.z += world.speed * dt * 0.5;
      if (ball.fall > 0.9) return crash(ball.msg);
    }
    const score = Math.floor(ball.z);
    if (score !== Number(scoreEl.textContent)) scoreEl.textContent = score;
    if (mp && score - reported >= 5) { reported = score; TungMP.progress(score); }
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    update(dt);
    if (!running) return;
    draw();
    raf = requestAnimationFrame(frame);
  }

  function crash(text) {
    running = false; dead = true;
    cancelAnimationFrame(raf);
    const score = Math.floor(ball.z);
    scoreEl.textContent = score;
    draw();
    if (mp) {
      msgEl.textContent = `${text} You went ${score} m. Waiting for your opponent…`;
      TungMP.progress(score);
      TungMP.finish({ score });
      return;
    }
    if (score > best) {
      best = score; localStorage.setItem("tungSlopeBest", best); bestEl.textContent = best;
      msgEl.textContent = `${text} New best: ${score} m 🏆`;
    } else msgEl.textContent = `${text} You went ${score} m.`;
    if (score > 0 && window.TungMP) TungMP.submitSolo({ game: "slope", score });
    startBtn.textContent = "Play Again";
  }

  function begin() {
    running = true; last = 0;
    msgEl.textContent = "";
    startBtn.textContent = "Restart";
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (mp) return;
    if (dead || running || !world) { seed = "solo" + Date.now(); reset(); }
    begin();
  }

  // ---------- input ----------
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); if (!running) start(); return; }
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { e.preventDefault(); keyL = true; }
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); keyR = true; }
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keyL = false;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keyR = false;
  });
  startBtn.addEventListener("click", start);
  for (const [id, d] of [["leftBtn", -1], ["rightBtn", 1]]) {
    const b = document.getElementById(id);
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); touchDir = d; });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => { if (touchDir === d) touchDir = 0; });
  }
  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    touchDir = e.clientX - r.left < r.width / 2 ? -1 : 1;
    if (!running && !mp && !dead) start();
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) canvas.addEventListener(ev, () => { touchDir = 0; });

  reset();

  // ---------- multiplayer hooks (see mp.js) ----------
  if (window.TungMP) TungMP.registerGame({
    prepareMatch(m) { mp = true; seed = m.seed; reset(); msgEl.textContent = ""; },
    startMatch() { if (mp) begin(); },
    stopMatch() { running = false; cancelAnimationFrame(raf); },
    exitMatch() { mp = false; seed = "solo"; reset(); msgEl.textContent = "Press Start or Space"; startBtn.textContent = "Start"; },
  });
})();
