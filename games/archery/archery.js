(() => {
  const W = 960, H = 540, HZ = 340, TCX = 480, TCY = 235;
  const $ = (id) => document.getElementById(id);
  const cv = $("view"), ctx = cv.getContext("2d");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const WIND_NAMES = ["calm", "breezy", "gusty"];

  // ---------------- sound ----------------
  let audio;
  const AC = () => (audio = audio || new (window.AudioContext || window.webkitAudioContext)());
  function tone(f, d, type = "sine", v = 0.08, slide = 0.5, delay = 0) {
    try { const a = AC(), t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.02); } catch (_) {}
  }
  function puff(d, v, freq) {
    try { const a = AC(), n = Math.floor(a.sampleRate * d), buf = a.createBuffer(1, n, a.sampleRate), ch = buf.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = a.createBufferSource(); s.buffer = buf; const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq; const g = a.createGain(); g.gain.value = v; s.connect(f).connect(g).connect(a.destination); s.start(); } catch (_) {}
  }

  // ---------------- seeded random (so both players in a match get the same wind) ----------------
  function rng(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------------- state ----------------
  let mode = "idle"; // idle | solo | match
  let cfg = { ranked: true, arrows: 10, dist: 50, windLvl: 1 };
  let np = null, running = false, raf = 0, last = 0, over = false, names = ["You", "Opponent"];
  let winds = [], fieldKey = "";
  let m = { x: TCX, y: TCY }; // where the mouse / finger / keys point
  let keys = {}, down = false, breathHeld = false, touchLift = 0;
  let st, stuck = [], ghosts = [], pops = [], rings = [], shake = 0, firstHint = true;
  let opp = { total: 0, n: 0 };

  function reset() {
    st = { n: 0, total: 0, pts: [], phase: "wait", wait: 0.8, hold: 0, draw: 0, stamina: 1, locked: false, t: 0, fp: 0, shot: null, sight: { x: TCX, y: TCY }, last: null, waiting: false };
    stuck = []; ghosts = []; pops = []; rings = []; shake = 0; opp = { total: 0, n: 0 }; over = false; down = false;
  }
  let windRand = Math.random;
  function makeWinds(rand, lvl) { winds = []; windRand = rand; cfg.windLvl = lvl; }
  function windFor(i) { // winds are made in order from the shared seed, so both players in a match get the same ones
    while (winds.length <= i) {
      const sign = windRand() < 0.5 ? -1 : 1, r = windRand(), l = cfg.windLvl;
      winds.push(l === 0 ? 0 : sign * (l === 1 ? 0.8 + r * 3.8 : 2.5 + r * 6));
    }
    return winds[i];
  }
  const R = () => 150 * Math.pow(50 / cfg.dist, 0.6); // radius of the target face in pixels
  const scale = () => cfg.dist / 50;
  const gust = () => (cfg.windLvl === 2 ? 1.8 : cfg.windLvl === 1 ? 0.6 : 0) * Math.sin(st.t * 1.7 + st.n * 2.1);
  const curWind = () => windFor(st.n) + gust();

  // ---------------- scoring ----------------
  function scoreAt(x, y) {
    const d = Math.hypot(x - TCX, y - TCY), ringW = R() / 10;
    const dd = Math.max(0, d - 1.5);
    if (dd >= R()) return { p: 0, x: false, d };
    return { p: 10 - Math.floor(dd / ringW), x: dd < ringW * 0.5, d };
  }

  // ---------------- one frame of game logic ----------------
  function update(dt) {
    st.t += dt;
    const kx = (keys.d || keys.right ? 1 : 0) - (keys.a || keys.left ? 1 : 0), ky = (keys.s || keys.down ? 1 : 0) - (keys.w || keys.up ? 1 : 0);
    if (kx || ky) { m.x = clamp(m.x + kx * 300 * dt, 20, W - 20); m.y = clamp(m.y + ky * 300 * dt, 20, H - 20); }
    // breath
    const holding = breathHeld && st.stamina > 0 && !st.locked;
    if (holding) { st.stamina = Math.max(0, st.stamina - dt / 2.4); if (st.stamina === 0) st.locked = true; }
    else { st.stamina = Math.min(1, st.stamina + dt / (st.locked ? 5 : 3.2)); if (st.locked && st.stamina > 0.4) st.locked = false; }
    st.breathing = holding;
    // phases
    if (st.phase === "wait") {
      if (st.waiting) return;
      st.wait -= dt;
      if (st.wait <= 0) {
        if (isFinite(cfg.arrows) && st.n >= cfg.arrows) return finish();
        st.phase = "ready"; st.hold = 0; st.draw = 0;
      }
    }
    if ((st.phase === "ready" || st.phase === "draw") && down) {
      if (st.phase === "ready") { st.phase = "draw"; puff(0.5, 0.05, 900); tone(140, 0.6, "sawtooth", 0.015, 1.8); }
      st.hold += dt; st.draw = Math.min(1, st.hold / 0.8);
    }
    // sway of the sight
    const fatigue = st.hold > 2.2 ? 1 + Math.min(3, (st.hold - 2.2) * 1.3) : 1;
    const amp = 14 * scale() * fatigue * (st.breathing ? 0.16 : 1) * (st.phase === "draw" ? 1 : 0.45);
    const t = st.t;
    const sx = amp * (Math.sin(1.7 * t + 0.4) + 0.5 * Math.sin(3.1 * t + 1.9)), sy = amp * (Math.cos(1.3 * t + 2.2) + 0.45 * Math.sin(2.3 * t + 0.7));
    st.sight = { x: clamp(m.x + sx, 6, W - 6), y: clamp(m.y + sy - touchLift, 6, H - 6) };
    st.fatigued = st.hold > 2.2;
    if (st.phase === "fly") {
      st.fp += dt / 0.42;
      if (st.fp >= 1) land();
    }
    // effects
    for (const p of pops) p.life -= dt;
    pops = pops.filter((p) => p.life > 0);
    for (const r of rings) r.life -= dt;
    rings = rings.filter((r) => r.life > 0);
    shake = Math.max(0, shake - dt * 14);
  }

  function release() {
    if (st.phase !== "draw") return;
    if (st.draw < 0.2) { st.phase = "ready"; st.hold = 0; st.draw = 0; tone(220, 0.1, "triangle", 0.04, 0.6); return; }
    const sc = scale(), w = curWind();
    const ix = st.sight.x + w * 11 * Math.pow(sc, 0.8) + (Math.random() - 0.5) * 3;
    const iy = st.sight.y + Math.pow(1 - st.draw, 1.5) * 210 * sc + (Math.random() - 0.5) * 3;
    st.shot = { ix, iy, w, draw: st.draw, sx: bowX(), sy: H - 70 };
    st.phase = "fly"; st.fp = 0;
    tone(520, 0.16, "triangle", 0.1, 0.35); puff(0.14, 0.12, 2500);
  }
  function land() {
    const s = st.shot, r = scoreAt(s.ix, s.iy);
    st.n++; st.total += r.p; st.pts.push(r.x ? "X" : r.p); st.last = r;
    stuck.push({ x: s.ix, y: s.iy });
    if (stuck.length > 14) stuck.shift();
    shake = r.p ? 3 : 0;
    pops.push({ x: s.ix, y: s.iy - 24, life: 1.1, max: 1.1, text: r.x ? "BULLSEYE!" : r.p ? String(r.p) : "MISS", col: r.x ? "#ffd23f" : r.p >= 9 ? "#ffd23f" : r.p >= 7 ? "#ff8a80" : r.p >= 5 ? "#7cc4ff" : r.p ? "#ffffff" : "#c7c7c7", big: r.x });
    rings.push({ x: s.ix, y: s.iy, life: 0.4 });
    if (r.p) { tone(95, 0.2, "sine", 0.18, 0.5); puff(0.1, 0.18, 700); } else { puff(0.25, 0.12, 400); }
    if (r.x) { tone(880, 0.5, "sine", 0.08, 1, 0.08); tone(1320, 0.5, "sine", 0.06, 1, 0.16); }
    st.phase = "wait"; st.wait = 0.95; st.hold = 0; st.draw = 0;
    if (mode === "match") {
      np.progress(st.total);
      np.send({ k: "a", n: st.n, x: Math.round(s.ix * 10) / 10, y: Math.round(s.iy * 10) / 10, p: r.p, tot: st.total });
    }
    if (isFinite(cfg.arrows) && st.n >= cfg.arrows) st.wait = 0.9;
    updateHud();
    if (!cfg.ranked && mode === "solo" && st.n % 12 === 0) { stuck = []; pops.push({ x: TCX, y: 90, life: 1.6, max: 1.6, text: "Arrows collected", col: "#fff", big: false }); }
  }

  const arrowLabel = () => (isFinite(cfg.arrows) ? cfg.arrows : "∞");
  function updateHud() {
    $("arrowEl").textContent = isFinite(cfg.arrows) ? Math.min(st.n + 1, cfg.arrows) : st.n + 1;
    $("arrowsEl").textContent = arrowLabel();
    $("scMe").textContent = st.total;
    $("oppChip").textContent = mode === "match" ? ` · ${names[1]} ${opp.total} (${opp.n}/${cfg.arrows})` : "";
    const w = curWind();
    $("windEl").textContent = (Math.abs(w) < 0.05 ? "" : w < 0 ? "← " : "→ ") + Math.abs(w).toFixed(1);
  }

  // ---------------- finishing ----------------
  function finish() {
    if (over) return;
    over = true; running = mode === "match" ? running : false;
    const max = cfg.arrows * 10, pct = st.total / max;
    const title = pct >= 0.9 ? "Tung Legend" : pct >= 0.75 ? "Sharpshooter" : pct >= 0.55 ? "Marksman" : pct >= 0.35 ? "Apprentice" : "Beginner";
    const log = `<div class="arrowlog">${st.pts.map((p) => `<b class="${p === "X" ? "x" : ""}">${p}</b>`).join("")}</div>`;
    if (mode === "solo") {
      if (cfg.ranked && st.total > 0 && window.TungMP) TungMP.submitSolo({ game: "archery", score: st.total });
      showResult(`🏹 ${st.total} / ${max}`, `<b>${title}</b>${log}<small>${cfg.ranked ? "Ranked round · saved to the Solo leaderboard if it's your best." : ""}</small>`, [["Shoot again", startSolo], ["Menu", toMenu]]);
    } else if (mode === "match") {
      showResult(`🏹 You scored ${st.total} / ${max}`, `${log}<small>Waiting for ${names[1]} to finish…</small>`, []);
      np.report({ score: st.total });
    }
  }
  function showResult(title, html, buttons) {
    const r = $("result"); r.innerHTML = `<h2>${title}</h2><div style="text-align:center">${html}</div><div class="btn-row"></div>`; r.hidden = false;
    for (const [label, fn] of buttons) { const b = document.createElement("button"); b.className = "btn" + (label === "Menu" ? " secondary" : ""); b.textContent = label; b.onclick = fn; r.querySelector(".btn-row").append(b); }
  }
  const hideResult = () => { $("result").hidden = true; };

  // ---------------- drawing: static scene (cached) ----------------
  let groundCv = null;
  function buildGround() {
    const key = String(cfg.dist);
    if (groundCv && fieldKey === key) return;
    fieldKey = key;
    groundCv = document.createElement("canvas"); groundCv.width = W; groundCv.height = H;
    const g = groundCv.getContext("2d");
    const rs = rng("field");
    // far hills
    const hill = (base, amp, col, seed, freq) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, base - amp * (0.55 * Math.sin(x * freq + seed) + 0.3 * Math.sin(x * freq * 2.3 + seed * 2) + 0.15 * Math.sin(x * freq * 5 + seed * 3)));
      g.lineTo(W, H); g.closePath(); g.fill();
    };
    hill(HZ - 38, 60, "#6f98b8", 1.1, 0.006);
    hill(HZ - 14, 42, "#4f8a68", 3.4, 0.009);
    // tree line
    for (let x = -10; x < W + 20; x += 13 + rs() * 12) {
      const h = 26 + rs() * 24, y = HZ - 4 + rs() * 5;
      g.fillStyle = rs() < 0.5 ? "#2f6b3c" : "#397a45";
      g.beginPath(); g.moveTo(x - 10, y); g.lineTo(x, y - h); g.lineTo(x + 10, y); g.closePath(); g.fill();
      g.fillStyle = "#4a2f17"; g.fillRect(x - 1.5, y, 3, 5);
    }
    // grass with mowing stripes
    const gr = g.createLinearGradient(0, HZ, 0, H); gr.addColorStop(0, "#5aa04a"); gr.addColorStop(1, "#2a6a2c");
    g.fillStyle = gr; g.fillRect(0, HZ, W, H - HZ);
    for (let k = -14; k < 14; k++) {
      if (k % 2) continue;
      g.fillStyle = "rgba(255,255,255,.055)"; g.beginPath(); g.moveTo(TCX + k * 14, HZ); g.lineTo(TCX + (k + 1) * 14, HZ); g.lineTo(TCX + (k + 1) * 150, H); g.lineTo(TCX + k * 150, H); g.closePath(); g.fill();
    }
    g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(0, HZ, W, 2);
    // shooting line markers
    g.fillStyle = "rgba(255,255,255,.55)"; g.fillRect(0, H - 8, W, 3);
    // distance post
    g.fillStyle = "#5d3a1a"; g.fillRect(842, 395, 10, 80);
    const bd = g.createLinearGradient(0, 372, 0, 412); bd.addColorStop(0, "#e1b274"); bd.addColorStop(1, "#c28d4d");
    g.fillStyle = bd; g.beginPath(); g.roundRect(800, 372, 94, 42, 6); g.fill(); g.strokeStyle = "#5d3a1a"; g.lineWidth = 3; g.stroke();
    g.fillStyle = "#3a230d"; g.font = "900 26px sans-serif"; g.textAlign = "center"; g.fillText(cfg.dist + " m", 847, 402);
    // target stand
    const r = R(), gy = Math.min(H + 20, TCY + r * 1.2 + 48);
    g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(TCX, gy + 2, r * 1.1, 11 + r * 0.05, 0, 0, 7); g.fill();
    g.lineCap = "round";
    for (const [x0, x1] of [[-0.5, -0.95], [0.5, 0.95]]) { g.strokeStyle = "#4a2d14"; g.lineWidth = 12; g.beginPath(); g.moveTo(TCX + x0 * r, TCY + r * 0.2); g.lineTo(TCX + x1 * r, gy); g.stroke(); g.strokeStyle = "#8d5a2b"; g.lineWidth = 6; g.stroke(); }
    g.strokeStyle = "#4a2d14"; g.lineWidth = 8; g.beginPath(); g.moveTo(TCX, TCY + r * 0.3); g.lineTo(TCX, gy - 4); g.stroke();
    // straw boss
    const bossR = r * 1.14;
    g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.arc(TCX + 6, TCY + 9, bossR, 0, 7); g.fill();
    const sg = g.createRadialGradient(TCX - bossR * 0.3, TCY - bossR * 0.3, bossR * 0.2, TCX, TCY, bossR); sg.addColorStop(0, "#e8c987"); sg.addColorStop(1, "#b78d45");
    g.fillStyle = sg; g.beginPath(); g.arc(TCX, TCY, bossR, 0, 7); g.fill();
    g.strokeStyle = "rgba(110,72,20,.35)"; g.lineWidth = 1.4;
    for (let i = 0; i < 160; i++) { const a = rs() * 6.283, d = r * (1.0 + rs() * 0.13), l = 6 + rs() * 10; g.beginPath(); g.moveTo(TCX + Math.cos(a) * d, TCY + Math.sin(a) * d); g.lineTo(TCX + Math.cos(a + 0.5) * (d + l * 0.4), TCY + Math.sin(a + 0.5) * (d + l * 0.4)); g.stroke(); }
    g.strokeStyle = "#7a5524"; g.lineWidth = 4; g.beginPath(); g.arc(TCX, TCY, bossR - 2, 0, 7); g.stroke();
    // scoring face
    const cols = ["#f5f3ea", "#f5f3ea", "#202226", "#202226", "#2b7bd1", "#2b7bd1", "#d63631", "#d63631", "#f6c32e", "#f6c32e"];
    for (let k = 0; k < 10; k++) {
      g.fillStyle = cols[k]; g.beginPath(); g.arc(TCX, TCY, r * (1 - k / 10), 0, 7); g.fill();
      g.strokeStyle = k >= 2 && k <= 3 ? "rgba(255,255,255,.42)" : "rgba(0,0,0,.4)"; g.lineWidth = 1.3; g.stroke();
    }
    g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 1.2; g.beginPath(); g.arc(TCX, TCY, r * 0.05, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(TCX - 4, TCY); g.lineTo(TCX + 4, TCY); g.moveTo(TCX, TCY - 4); g.lineTo(TCX, TCY + 4); g.stroke();
    const sh = g.createRadialGradient(TCX - r * 0.35, TCY - r * 0.4, r * 0.1, TCX, TCY, r * 1.05); sh.addColorStop(0, "rgba(255,255,255,.2)"); sh.addColorStop(1, "rgba(0,0,0,.18)");
    g.fillStyle = sh; g.beginPath(); g.arc(TCX, TCY, r, 0, 7); g.fill();
  }

  function drawSky(t) {
    const g = ctx.createLinearGradient(0, 0, 0, HZ); g.addColorStop(0, "#2a6db5"); g.addColorStop(0.7, "#8cc7ee"); g.addColorStop(1, "#d6eefb");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(790, 105, 6, 790, 105, 190); sun.addColorStop(0, "rgba(255,247,200,.95)"); sun.addColorStop(0.18, "rgba(255,236,160,.5)"); sun.addColorStop(1, "rgba(255,236,160,0)");
    ctx.fillStyle = sun; ctx.fillRect(500, 0, 460, 300);
    ctx.fillStyle = "#fffbe3"; ctx.beginPath(); ctx.arc(790, 105, 26, 0, 7); ctx.fill();
    const drift = (curWind() * 6 + 6) * t;
    ctx.fillStyle = "rgba(255,255,255,.82)";
    [[80, 70, 1], [360, 130, 0.8], [620, 50, 1.2], [880, 170, 0.7], [210, 190, 0.6]].forEach(([x, y, s], i) => {
      const cx = ((x + drift * (0.5 + i * 0.12)) % (W + 280) + W + 280) % (W + 280) - 140;
      for (const [dx, dy, rr] of [[0, 0, 30], [30, 6, 24], [-30, 8, 22], [10, -14, 20]]) { ctx.beginPath(); ctx.ellipse(cx + dx * s, y + dy * s, rr * s * 1.2, rr * s * 0.8, 0, 0, 7); ctx.fill(); }
    });
  }

  function drawFlag(t) {
    const px = 110, py = 465, top = 300, w = curWind(), len = 22 + Math.abs(w) * 12, dir = w >= 0 ? 1 : -1;
    ctx.strokeStyle = "#e9e5d8"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, top); ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(px, py + 2, 16, 5, 0, 0, 7); ctx.fill();
    const segs = 6, hgt = 26;
    ctx.beginPath(); ctx.moveTo(px, top);
    const wave = (i) => Math.sin(t * (4 + Math.abs(w) * 1.6) - i * 0.9) * (3 + Math.abs(w) * 1.4) * (i / segs);
    for (let i = 1; i <= segs; i++) ctx.lineTo(px + dir * len * (i / segs), top + 4 * i * (0.4 + (1 - Math.min(1, Math.abs(w) / 7))) + wave(i));
    for (let i = segs; i >= 0; i--) ctx.lineTo(px + dir * len * (i / segs) * 0.97, top + hgt * (1 - (i / segs) * 0.6) + 4 * i * (0.4 + (1 - Math.min(1, Math.abs(w) / 7))) + wave(i));
    ctx.closePath(); ctx.fillStyle = "#f2503f"; ctx.fill(); ctx.strokeStyle = "#a82c20"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.arc(px, top - 4, 5, 0, 7); ctx.fill();
  }

  const bowX = () => W / 2 + ((st ? st.sight.x : W / 2) - W / 2) * 0.1;
  function drawArrowShape(x, y, dx, dy, len, thick, fletch) { // an arrow with its tip at (x, y) pointing along (dx, dy)
    const bx = x - dx * len, by = y - dy * len;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = thick + 1.5; ctx.beginPath(); ctx.moveTo(bx + 3, by + 5); ctx.lineTo(x + 3, y + 5); ctx.stroke();
    ctx.strokeStyle = "#d9b27a"; ctx.lineWidth = thick; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x, y); ctx.stroke();
    ctx.strokeStyle = "#9c6f3a"; ctx.lineWidth = Math.max(1, thick * 0.35); ctx.stroke();
    // steel head
    ctx.fillStyle = "#cfd6df"; ctx.beginPath(); ctx.moveTo(x + dx * thick * 3.2, y + dy * thick * 3.2); ctx.lineTo(x - dy * thick * 0.9, y + dx * thick * 0.9); ctx.lineTo(x + dy * thick * 0.9, y - dx * thick * 0.9); ctx.closePath(); ctx.fill();
    // fletching
    ctx.fillStyle = fletch || "#e63946";
    for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(bx + dx * len * 0.04, by + dy * len * 0.04); ctx.lineTo(bx + dx * len * 0.22 - dy * thick * 2.6 * sg, by + dy * len * 0.22 + dx * thick * 2.6 * sg); ctx.lineTo(bx + dx * len * 0.3, by + dy * len * 0.3); ctx.closePath(); ctx.fill(); }
  }
  function drawStuck(x, y, col, ghost) {
    ctx.save(); if (ghost) ctx.globalAlpha = 0.6;
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.arc(x + 1.5, y + 2, 3.8, 0, 7); ctx.fill();
    for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3; ctx.strokeStyle = col; ctx.lineWidth = 3.2; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); ctx.stroke(); }
    ctx.fillStyle = ghost ? "#7cd7ff" : "#e9d3a9"; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fill(); ctx.strokeStyle = "#5a3a14"; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
  function drawBow() {
    const gx = bowX(), gy = H - 6, pull = st.phase === "draw" ? st.draw : 0;
    ctx.lineCap = "round";
    const tip = (s) => ({ x: gx + s * (200 - pull * 36), y: gy - 128 + pull * 24 });
    for (const s of [-1, 1]) {
      const tp = tip(s);
      ctx.strokeStyle = "#3b210c"; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.quadraticCurveTo(gx + s * 120, gy - 10 - pull * 8, tp.x, tp.y); ctx.stroke();
      ctx.strokeStyle = "#b66a2c"; ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = "rgba(255,225,170,.55)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(gx + s * 8, gy - 4); ctx.quadraticCurveTo(gx + s * 118, gy - 16 - pull * 8, tp.x - s * 3, tp.y + 3); ctx.stroke();
    }
    const tl = tip(-1), tr = tip(1), nockY = lerp(tl.y, gy + 52, pull * 0.92), nock = { x: gx, y: nockY };
    ctx.strokeStyle = "#f1ece0"; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(nock.x, nock.y); ctx.lineTo(tr.x, tr.y); ctx.stroke();
    if (st.phase !== "fly" && st.phase !== "wait") {
      let dx = st.sight.x - nock.x, dy = st.sight.y - nock.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const len = 250 - pull * 60;
      drawArrowShape(nock.x + dx * len, nock.y + dy * len, dx, dy, len, 5.5, "#e63946");
    }
    // grip + a leather wrap
    ctx.fillStyle = "#2b1a0e"; ctx.beginPath(); ctx.roundRect(gx - 17, gy - 34, 34, 46, 8); ctx.fill();
    ctx.fillStyle = "#7a4a22"; ctx.beginPath(); ctx.roundRect(gx - 12, gy - 28, 24, 34, 6); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.25)"; for (let y = -24; y < 6; y += 7) ctx.fillRect(gx - 12, gy + y, 24, 1.8);
  }
  function drawSight() {
    const s = st.sight, drawing = st.phase === "draw" || st.phase === "ready";
    if (!drawing) return;
    ctx.save(); ctx.translate(s.x, s.y);
    const col = st.fatigued ? "#ff6b5e" : st.draw >= 1 ? "#7df08f" : "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 4.5; ring(18); ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 2; ring(18); ctx.stroke();
    for (const [a, b] of [[-30, -12], [12, 30]]) for (const k of [0, 1]) { ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 4; ctx.beginPath(); if (k) { ctx.moveTo(0, a); ctx.lineTo(0, b); } else { ctx.moveTo(a, 0); ctx.lineTo(b, 0); } ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke(); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, 7); ctx.fill();
    // draw-strength arc
    if (st.phase === "draw") {
      ctx.lineWidth = 5; ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.arc(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + 6.2832); ctx.stroke();
      ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + 6.2832 * st.draw); ctx.stroke();
    }
    ctx.restore();
    function ring(r) { ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); }
  }
  function drawFlight() {
    const s = st.shot, p = st.fp, e = 1 - Math.pow(1 - p, 1.8);
    const x = lerp(s.sx, s.ix, e), y = lerp(s.sy, s.iy, e) - Math.sin(Math.PI * Math.min(1, p)) * 70 * (1 - p * 0.3);
    const px = lerp(s.sx, s.ix, 1 - Math.pow(1 - Math.max(0, p - 0.03), 1.8)), py = lerp(s.sy, s.iy, 1 - Math.pow(1 - Math.max(0, p - 0.03), 1.8)) - Math.sin(Math.PI * Math.max(0, p - 0.03)) * 70 * (1 - p * 0.3);
    let dx = x - px, dy = y - py; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const sc = 1 - 0.8 * e;
    ctx.globalAlpha = 0.25; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3 * sc; ctx.beginPath(); ctx.moveTo(x - dx * 130 * sc, y - dy * 130 * sc); ctx.lineTo(x, y); ctx.stroke(); ctx.globalAlpha = 1;
    drawArrowShape(x, y, dx, dy, 120 * sc, Math.max(1.6, 5.5 * sc), "#e63946");
  }
  function windGlyph() { // wind arrow at the top of the view
    const w = curWind(), mag = Math.min(1, Math.abs(w) / 9);
    ctx.save(); ctx.translate(W / 2, 30);
    ctx.fillStyle = "rgba(8,16,30,.55)"; ctx.beginPath(); ctx.roundRect(-96, -18, 192, 36, 18); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "800 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("WIND  " + Math.abs(w).toFixed(1) + " m/s", 18, 1);
    if (Math.abs(w) > 0.05) {
      const dir = w > 0 ? 1 : -1, x0 = -70 * 1, len = 12 + mag * 14;
      ctx.strokeStyle = "#8fd0ff"; ctx.fillStyle = "#8fd0ff"; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x0 - dir * len / 2, 0); ctx.lineTo(x0 + dir * len / 2, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0 + dir * (len / 2 + 7), 0); ctx.lineTo(x0 + dir * (len / 2 - 2), -6); ctx.lineTo(x0 + dir * (len / 2 - 2), 6); ctx.closePath(); ctx.fill();
    } else { ctx.fillStyle = "#8fd0ff"; ctx.beginPath(); ctx.arc(-70, 0, 4, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function breathBar() {
    const x = W - 168, y = H - 34;
    ctx.fillStyle = "rgba(8,16,30,.55)"; ctx.beginPath(); ctx.roundRect(x - 8, y - 18, 160, 32, 16); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "800 11px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText("BREATH", x, y - 1);
    ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.beginPath(); ctx.roundRect(x + 52, y - 6, 88, 10, 5); ctx.fill();
    ctx.fillStyle = st.locked ? "#ff6b5e" : st.breathing ? "#7cc4ff" : "#7df08f"; ctx.beginPath(); ctx.roundRect(x + 52, y - 6, Math.max(2, 88 * st.stamina), 10, 5); ctx.fill();
  }

  function render() {
    buildGround();
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawSky(st ? st.t : 0);
    ctx.drawImage(groundCv, 0, 0);
    if (!st) { ctx.restore(); return; }
    drawFlag(st.t);
    for (const g of ghosts) drawStuck(g.x, g.y, "#4cc9f0", true);
    for (const s of stuck) drawStuck(s.x, s.y, "#e63946", false);
    for (const r of rings) { const k = 1 - r.life / 0.4; ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r.x, r.y, 6 + k * 22, 0, 7); ctx.stroke(); }
    for (const p of pops) {
      const k = 1 - p.life / p.max; ctx.globalAlpha = Math.min(1, p.life * 3); ctx.textAlign = "center"; ctx.font = `900 ${p.big ? 40 : 34}px sans-serif`; ctx.lineWidth = 7; ctx.strokeStyle = "#101820"; ctx.lineJoin = "round";
      ctx.strokeText(p.text, p.x, p.y - k * 36); ctx.fillStyle = p.col; ctx.fillText(p.text, p.x, p.y - k * 36); ctx.globalAlpha = 1;
    }
    if (st.phase === "fly") drawFlight();
    drawBow();
    drawSight();
    ctx.restore();
    windGlyph(); breathBar();
    if (firstHint && st.phase === "ready" && st.n === 0) {
      ctx.textAlign = "center"; ctx.font = "800 18px sans-serif"; ctx.fillStyle = "rgba(8,16,30,.7)"; ctx.beginPath(); ctx.roundRect(W / 2 - 170, H - 78, 340, 34, 17); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText("Hold click to draw, release to shoot", W / 2, H - 55);
    }
    if (st.phase === "wait" && st.waiting) {
      ctx.textAlign = "center"; ctx.font = "900 44px sans-serif"; ctx.lineWidth = 8; ctx.strokeStyle = "#101820"; ctx.strokeText("GET READY", W / 2, 130); ctx.fillStyle = "#ffd23f"; ctx.fillText("GET READY", W / 2, 130);
    }
  }

  // ---------------- main loop ----------------
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.033, last ? (t - last) / 1000 : 0.016); last = t;
    if (running) { update(dt); updateHud(); }
    render();
  }
  function begin(newMode) {
    mode = newMode; reset(); hideResult(); fieldKey = "";
    $("practiceOpts").hidden = true;
    updateHud();
    running = true; cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame);
  }
  function startSolo() {
    const ranked = document.querySelector(".mode.sel").dataset.m === "ranked";
    cfg = ranked ? { ranked: true, arrows: 10, dist: 50, windLvl: 1 } : { ranked: false, arrows: Infinity, dist: Number($("dist").value), windLvl: Number($("wind").value) };
    names = ["You", "Computer"];
    makeWinds(rng(String(Math.random())), cfg.windLvl);
    np.setPlaying(true); begin("solo");
  }
  function toMenu() { running = false; cancelAnimationFrame(raf); mode = "idle"; hideResult(); np.setPlaying(false); }

  document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".mode").forEach((x) => x.classList.toggle("sel", x === b));
    $("practiceOpts").hidden = b.dataset.m !== "practice";
  }));
  $("startBtn").addEventListener("click", startSolo);
  $("quitBtn").addEventListener("click", () => { if (np.kind) np.leave(); else toMenu(); });

  // ---------------- input ----------------
  function pointer(e) {
    const r = cv.getBoundingClientRect();
    m.x = clamp(((e.clientX - r.left) / r.width) * W, 6, W - 6); m.y = clamp(((e.clientY - r.top) / r.height) * H, 6, H - 6);
    touchLift = e.pointerType === "touch" ? 70 : 0;
  }
  cv.addEventListener("pointermove", pointer);
  cv.addEventListener("pointerdown", (e) => { pointer(e); down = true; firstHint = false; try { cv.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
  const up = () => { if (down) { down = false; release(); } };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", () => { down = false; if (st && st.phase === "draw") { st.phase = "ready"; st.hold = 0; st.draw = 0; } });
  window.addEventListener("blur", () => { down = false; breathHeld = false; });
  const KEYMAP = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  document.addEventListener("keydown", (e) => {
    if (mode === "idle") return;
    const k = KEYMAP[e.code];
    if (k) { e.preventDefault(); keys[k] = true; }
    if (e.code === "Space" || e.code === "ShiftLeft" || e.code === "ShiftRight") { e.preventDefault(); breathHeld = true; }
    if (e.code === "Enter" && !e.repeat) { e.preventDefault(); down = true; firstHint = false; }
    if (e.code === "Escape" && mode === "solo") toMenu();
  });
  document.addEventListener("keyup", (e) => {
    const k = KEYMAP[e.code]; if (k) keys[k] = false;
    if (e.code === "Space" || e.code === "ShiftLeft" || e.code === "ShiftRight") breathHeld = false;
    if (e.code === "Enter" && down) { down = false; release(); }
  });
  const sb = $("steadyBtn");
  sb.addEventListener("pointerdown", (e) => { breathHeld = true; e.preventDefault(); });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) sb.addEventListener(ev, () => { breathHeld = false; });

  // ---------------- multiplayer (1v1 challenge, same wind for both) ----------------
  np = NetPlay.attach({
    game: "archery", rooms: false, panel: $("mpPanel"), menu: $("menu"), play: $("play"),
    onModeChange() { if (mode === "solo") toMenu(); },
    onPrepare(c) {
      const lvl = Math.max(0, WIND_NAMES.indexOf(c.opts.wind));
      cfg = { ranked: false, arrows: Number(c.opts.arrows) || 10, dist: 50, windLvl: lvl };
      names = [c.me.name, (c.players.find((p) => p.id !== c.me.id) || {}).name || "Opponent"];
      makeWinds(rng(String(c.seed)), lvl);
      begin("match"); running = false; st.waiting = true; updateHud(); render();
      if (!raf) raf = requestAnimationFrame(frame);
    },
    onStart() { running = true; st.waiting = false; st.wait = 0.7; if (!raf) { last = 0; raf = requestAnimationFrame(frame); } },
    onStop() { running = false; hideResult(); },
    onExit() { running = false; cancelAnimationFrame(raf); mode = "idle"; hideResult(); },
    onNet(from, d) {
      if (!d || d.k !== "a") return;
      opp = { total: d.tot, n: d.n };
      ghosts.push({ x: clamp(Number(d.x) || 0, 0, W), y: clamp(Number(d.y) || 0, 0, H) });
      if (ghosts.length > 20) ghosts.shift();
    },
  });

  window.__arch = () => ({ get st() { return st; }, cfg, winds, update, release, land, scoreAt, begin, startSolo, setDown: (v) => { down = v; }, aim: (x, y) => { m.x = x; m.y = y; }, render, makeWinds, rng, get mode() { return mode; } });
})();
