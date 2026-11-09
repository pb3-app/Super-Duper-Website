(() => {
  const E = window.GolfEngine, W = 900, H = 500, DT = 1 / 240;
  const cam = { s: 1, ox: 0, oy: 0 }; // the course is zoomed to fill the table
  const $ = (id) => document.getElementById(id);
  const cv = $("view"), ctx = cv.getContext("2d");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let audio;
  function beep(f, d, type = "sine", v = 0.07, slide = 0.6) {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t + d); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.02); } catch (_) {}
  }

  let courseId = localStorage.getItem("tungGolfCourse") || "meadow", C = E.COURSES[courseId] || E.COURSES.meadow;
  if (!E.COURSES[courseId]) courseId = "meadow";
  let np = null, mode = "idle"; // idle | solo | match
  let HOLES = E.COURSES[courseId].holes.slice(0, E.HOLES_PER_ROUND), roundSeed = "";
  const newRound = (seed) => { roundSeed = seed || Math.random().toString(36).slice(2, 8); HOLES = E.build(courseId, roundSeed); }; // a fresh shuffle every round (a match gives both players the same one)
  const ICONS = { power: "🔥", magnet: "🧲", ghost: "👻", shield: "🛡️" }, TIPS = { power: "POWER SHOT next putt!", magnet: "MAGNET next putt!", ghost: "GHOST BALL next putt!", shield: "WATER SHIELD!" };
  let holeIdx = 0, S = null, results = [], phase = "aim", drag = null, mouse = { x: 0, y: 0 }, acc = 0, last = 0, raf = 0, banner = null, nextAt = 0, finished = false, lastSent = 0, trail = [], splash = [], oppName = "Opponent";
  let t0 = 0;

  // ---------------- menu ----------------
  function renderCourses() {
    const box = $("courses"); box.replaceChildren();
    for (const id of E.IDS) {
      const c = E.COURSES[id], b = document.createElement("button");
      b.className = "course" + (id === courseId ? " sel" : "");
      b.innerHTML = `<div class="swatch" style="background:linear-gradient(135deg,${c.theme.floor[0]},${c.theme.sky});box-shadow:inset 0 0 0 4px ${c.theme.rail}"></div><h3>${c.name}</h3><p>${c.blurb}</p><p style="margin-top:.3rem">${c.holes.length} holes to draw from · 6 each round, shuffled every time</p>`;
      b.onclick = () => { courseId = id; C = c; localStorage.setItem("tungGolfCourse", id); renderCourses(); };
      box.append(b);
    }
  }

  // ---------------- flow ----------------
  const total = () => results.reduce((a, b) => a + b, 0) + (S && (phase === "aim" || phase === "roll" || phase === "wait") ? Math.min(S.strokes, E.MAX_STROKES) : 0);
  function newHole() {
    S = E.create(HOLES[holeIdx]); fitCam(S.hole); phase = "aim"; drag = null; trail = []; banner = null; acc = 0;
    $("chipHole").textContent = `Hole ${holeIdx + 1} / ${HOLES.length} · ${S.hole.name}`; $("parEl").textContent = S.hole.par; hud(); card();
    sendOpp();
  }
  function fitCam(h) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of h.poly) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    const sc = Math.min((W - 90) / (x1 - x0), (H - 90) / (y1 - y0), 1.3);
    cam.s = sc; cam.ox = W / 2 - sc * (x0 + x1) / 2; cam.oy = H / 2 - sc * (y0 + y1) / 2 + 4;
  }
  function hud() {
    $("strokeEl").textContent = S ? S.strokes : 0; $("totalEl").textContent = total();
    $("invEl").textContent = S ? Object.keys(S.inv).filter((k) => S.inv[k] > 0).map((k) => ICONS[k].repeat(S.inv[k])).join(" ") || "none" : "none";
    const b = Number(localStorage.getItem("tungGolfBest:" + courseId) || 0); $("bestEl").textContent = b || "-";
  }
  function card() {
    const hs = HOLES, parTot = hs.reduce((a, h) => a + h.par, 0), tot = results.reduce((a, b) => a + b, 0);
    let h = "<tr><th>Hole</th>" + hs.map((_, i) => `<th>${i + 1}</th>`).join("") + "<th>Total</th></tr><tr><th>Par</th>" + hs.map((x) => `<td>${x.par}</td>`).join("") + `<td>${parTot}</td></tr><tr><th>You</th>`;
    h += hs.map((x, i) => { const v = results[i]; return `<td class="${i === holeIdx && v === undefined ? "cur" : ""} ${v === undefined ? "" : v < x.par ? "under" : v > x.par ? "over" : ""}">${v === undefined ? (i === holeIdx && S ? S.strokes || "·" : "") : v}</td>`; }).join("") + `<td>${tot || ""}</td></tr>`;
    $("card").innerHTML = h;
  }
  function startCourse(m) {
    mode = m; holeIdx = 0; results = []; finished = false; lastSent = 0; hideResult(); $("oppLine").textContent = ""; newRound();
    $("bestChip").hidden = m !== "solo";
    t0 = performance.now(); newHole(); running(true);
  }
  function running(on) { cancelAnimationFrame(raf); if (on) { last = 0; raf = requestAnimationFrame(frame); } }
  function holeDone() {
    const strokes = Math.min(S.strokes, E.MAX_STROKES), par = S.hole.par;
    results[holeIdx] = strokes; phase = "between"; nextAt = performance.now() + 1700;
    const lab = E.label(strokes, par); banner = { text: strokes >= E.MAX_STROKES && !S.done ? "Pick up" : lab, sub: `${strokes} stroke${strokes === 1 ? "" : "s"} · par ${par}`, t: performance.now() };
    beep(strokes <= par ? 700 : 300, 0.4, "triangle", 0.08, 1.6); if (strokes <= par) setTimeout(() => beep(990, 0.3, "triangle", 0.07, 1.3), 150);
    hud(); card(); sendOpp(); if (mode === "match" && total() > lastSent) { lastSent = total(); np.progress(lastSent); }
  }
  function finishCourse() {
    finished = true; phase = "done"; const tot = results.reduce((a, b) => a + b, 0), par = HOLES.reduce((a, h) => a + h.par, 0);
    const diff = tot - par, txt = diff === 0 ? "Even par" : diff < 0 ? `${-diff} under par` : `${diff} over par`;
    if (mode === "solo") {
      const key = "tungGolfBest:" + courseId, prev = Number(localStorage.getItem(key) || 0), pb = !prev || tot < prev; if (pb) localStorage.setItem(key, String(tot));
      if (window.TungMP) TungMP.submitSolo({ game: "golf", level: courseId, strokes: tot });
      hud(); beep(880, 0.6, "triangle", 0.09, 1.5);
      showResult(`⛳ ${tot} strokes`, `${txt}. ${pb ? "🏆 New personal best on this course!" : "Your best here: " + prev}`, [["Play again", () => startCourse("solo")], ["Menu", toMenu]]);
    } else {
      np.report({ score: tot, ranking: [] }); showResult(`⛳ ${tot} strokes`, `${txt}. Waiting for your opponent to finish…`, []);
    }
  }
  function showResult(title, sub, buttons) {
    const r = $("result"); r.innerHTML = `<h2>${title}</h2><p>${sub}</p><div class="btn-row"></div>`; r.hidden = false;
    for (const [label, fn] of buttons) { const b = document.createElement("button"); b.className = "btn" + (label === "Menu" ? " secondary" : ""); b.textContent = label; b.onclick = fn; r.querySelector(".btn-row").append(b); }
  }
  const hideResult = () => { $("result").hidden = true; };
  function toMenu() { running(false); mode = "idle"; hideResult(); np.setPlaying(false); }
  function sendOpp() { if (mode === "match") np.send({ k: "h", h: holeIdx + 1, t: total(), d: finished ? 1 : 0 }); }

  // ---------------- main loop ----------------
  function advance(dt, ts) {
    if (S && phase !== "done") {
      acc += dt;
      while (acc >= DT) {
        acc -= DT; E.step(S, DT);
        for (const e of S.ev) handleEvent(e); S.ev = [];
        if (S.moving) trail.push({ x: S.ball.x, y: S.ball.y, t: ts });
        if (S.done && phase === "roll") { phase = "sunk"; holeDone(); }
      }
      if (phase === "roll" && !S.moving && !S.sink && !S.done) { // the ball has come to rest
        if (S.strokes >= E.MAX_STROKES) { S.strokes = E.MAX_STROKES; holeDone(); } else { phase = "aim"; hud(); card(); }
      }
      if (phase === "between" && performance.now() > nextAt) { if (holeIdx + 1 < HOLES.length) { holeIdx++; newHole(); } else finishCourse(); }
    }
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016); last = ts;
    advance(dt, ts);
    draw(ts / 1000);
  }
  function handleEvent(e) {
    if (e[0] === "wall") beep(160 + Math.min(300, e[1] * 0.4), 0.05, "square", Math.min(0.06, e[1] / 8000), 0.7);
    else if (e[0] === "bumper") beep(520, 0.08, "triangle", 0.07, 1.4);
    else if (e[0] === "sink") { beep(300, 0.25, "sine", 0.1, 0.4); }
    else if (e[0] === "water") { beep(220, 0.4, "sawtooth", 0.06, 0.3); for (let i = 0; i < 14; i++) splash.push({ x: S.last.x + (Math.random() - 0.5) * 20, y: S.last.y, vx: (Math.random() - 0.5) * 160, vy: -80 - Math.random() * 120, t: performance.now() }); banner = e[1] === "shield" ? { text: "Shield saved you!", sub: "no penalty stroke", t: performance.now() } : { text: "Splash! +1 stroke", sub: "", t: performance.now() }; hud(); }
    else if (e[0] === "tele") beep(900, 0.25, "sine", 0.06, 0.3);
    else if (e[0] === "pick") { beep(760, 0.2, "triangle", 0.09, 1.7); banner = { text: TIPS[e[1]] || "POWER-UP!", sub: "", t: performance.now() }; hud(); }
    else if (e[0] === "boost") { /* quiet */ }
  }

  // ---------------- input ----------------
  function pos(e) { const r = cv.getBoundingClientRect(); return { x: (((e.clientX - r.left) / r.width) * W - cam.ox) / cam.s, y: (((e.clientY - r.top) / r.height) * H - cam.oy) / cam.s }; }
  cv.addEventListener("pointerdown", (e) => { if (!S || phase !== "aim" || S.moving) return; mouse = pos(e); drag = { x: mouse.x, y: mouse.y }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { mouse = pos(e); });
  cv.addEventListener("pointerup", () => {
    if (!drag) return; const d = drag; drag = null;
    const dx = d.x - mouse.x, dy = d.y - mouse.y, dist = Math.hypot(dx, dy);
    if (dist < 14 || !S || phase !== "aim") return;
    const p = clamp(dist / 170, 0.06, 1);
    if (E.shoot(S, Math.atan2(dy, dx), p)) { phase = "roll"; beep(240 + p * 160, 0.08, "triangle", 0.1, 0.5); hud(); card(); sendOpp(); if (mode === "match" && total() > lastSent) { lastSent = total(); np.progress(lastSent); } }
  });
  cv.addEventListener("pointercancel", () => { drag = null; });
  document.addEventListener("keydown", (e) => { if (e.code === "Escape") { if (drag) drag = null; else if (mode === "solo") toMenu(); } });
  $("startBtn").addEventListener("click", () => { np.setPlaying(true); startCourse("solo"); });
  $("quitBtn").addEventListener("click", () => { if (np.kind) np.leave(); else toMenu(); });

  // ---------------- drawing ----------------
  function pathPoly(p) { const pa = new Path2D(); p.forEach((q, i) => (i ? pa.lineTo(q[0], q[1]) : pa.moveTo(q[0], q[1]))); pa.closePath(); return pa; }
  function rayHit(x, y, dx, dy, maxD) {
    let best = maxD;
    for (const s of S.stat) {
      const x1 = s[0], y1 = s[1], x2 = s[2], y2 = s[3], ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const tt = ((x1 - x) * ey - (y1 - y) * ex) / den, u = ((x1 - x) * dy - (y1 - y) * dx) / den;
      if (tt > 0 && u >= 0 && u <= 1 && tt < best) best = tt;
    }
    return best;
  }
  function draw(t) {
    const th = C.theme, h = S ? S.hole : HOLES[0];
    const bg = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 560); bg.addColorStop(0, th.sky); bg.addColorStop(1, "#050a08"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (!S) return;
    ctx.save(); ctx.translate(cam.ox, cam.oy); ctx.scale(cam.s, cam.s);
    const pa = pathPoly(h.poly);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10; ctx.fillStyle = th.floor[0]; ctx.fill(pa); ctx.restore();
    ctx.save(); ctx.clip(pa);
    for (let x = 0; x < W; x += 44) { ctx.fillStyle = (x / 44) % 2 ? th.floor[0] : th.floor[1]; ctx.fillRect(x, 0, 44, H); }
    if (courseId === "neon") { ctx.strokeStyle = "rgba(79,216,255,.07)"; ctx.lineWidth = 1; for (let x = 0; x < W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = 0; y < H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }
    for (const r of h.sand || []) { ctx.fillStyle = "#e6cf95"; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = "rgba(160,120,50,.35)"; for (let i = 0; i < r.w * r.h / 160; i++) { const q = (i * 9301 + 49297) % 233280; ctx.fillRect(r.x + (q % r.w), r.y + ((q * 7) % r.h), 2, 2); } }
    for (const r of h.water || []) { const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h); g.addColorStop(0, "#3aa0e8"); g.addColorStop(1, "#1d5fb0"); ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2; for (let y = r.y + 12; y < r.y + r.h; y += 18) { ctx.beginPath(); for (let x = r.x; x <= r.x + r.w; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.08 + t * 2 + y) * 3); ctx.stroke(); } }
    for (const r of h.ice || []) { const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h); g.addColorStop(0, "rgba(190,235,255,.85)"); g.addColorStop(1, "rgba(130,200,245,.85)"); ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 2; for (let i = 0; i < r.w * r.h / 5200; i++) { const q = (i * 7919 + 104729) % 100003, x = r.x + (q % Math.max(1, r.w - 30)), y = r.y + ((q * 13) % Math.max(1, r.h - 14)); ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x + 16, y); ctx.stroke(); } }
    for (const r of h.mud || []) { ctx.fillStyle = "#6a4a2a"; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = "rgba(40,24,10,.45)"; for (let i = 0; i < r.w * r.h / 900; i++) { const q = (i * 9301 + 49297) % 233280, x = r.x + 6 + (q % Math.max(1, r.w - 12)), y = r.y + 6 + ((q * 7) % Math.max(1, r.h - 12)); ctx.beginPath(); ctx.arc(x, y, 3 + (q % 4), 0, 7); ctx.fill(); } }
    for (const cv of h.conv || []) { ctx.fillStyle = "rgba(30,30,40,.55)"; ctx.fillRect(cv.x, cv.y, cv.w, cv.h); ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 4; ctx.lineCap = "round"; const off = ((t * 70) % 40); const dirx = cv.dx, diry = cv.dy;
      ctx.save(); ctx.beginPath(); ctx.rect(cv.x, cv.y, cv.w, cv.h); ctx.clip();
      if (diry) { for (let y = cv.y - 40 + (diry > 0 ? off : 40 - off); y < cv.y + cv.h + 40; y += 40) for (const x of [cv.x + cv.w * 0.3, cv.x + cv.w * 0.7]) { ctx.beginPath(); ctx.moveTo(x - 10, y - 8 * diry); ctx.lineTo(x, y + 6 * diry); ctx.lineTo(x + 10, y - 8 * diry); ctx.stroke(); } }
      else { for (let x = cv.x - 40 + (dirx > 0 ? off : 40 - off); x < cv.x + cv.w + 40; x += 40) for (const y of [cv.y + cv.h * 0.3, cv.y + cv.h * 0.7]) { ctx.beginPath(); ctx.moveTo(x - 8 * dirx, y - 10); ctx.lineTo(x + 6 * dirx, y); ctx.lineTo(x - 8 * dirx, y + 10); ctx.stroke(); } }
      ctx.restore(); }
    for (const bo of h.boost || []) { ctx.fillStyle = "rgba(255,210,63,.22)"; ctx.fillRect(bo.x, bo.y, bo.w, bo.h); ctx.fillStyle = "#ffd23f"; const off = (t * 60) % 30; for (let x = bo.x - 30 + off; x < bo.x + bo.w; x += 30) { ctx.beginPath(); ctx.moveTo(x, bo.y + bo.h * 0.3); ctx.lineTo(x + 16, bo.y + bo.h * 0.5); ctx.lineTo(x, bo.y + bo.h * 0.7); ctx.lineTo(x + 6, bo.y + bo.h * 0.5); ctx.closePath(); if (x > bo.x - 4 && x + 16 < bo.x + bo.w + 4) ctx.fill(); } }
    for (const tp of h.tele || []) for (const [p, col] of [[tp.a, "#4fd8ff"], [tp.b, "#e84fd8"]]) { ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.shadowColor = col; ctx.shadowBlur = 14; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(p[0], p[1], 8 + i * 5 + Math.sin(t * 3 + i) * 1.5, 0, 7); ctx.stroke(); } ctx.shadowBlur = 0; }
    // tee mat
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.roundRect(h.tee[0] - 24, h.tee[1] - 16, 48, 32, 8); ctx.fill();
    // cup
    ctx.fillStyle = "#0a0a0a"; ctx.beginPath(); ctx.arc(h.cup[0], h.cup[1], E.CUP_R, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    // rails
    ctx.lineJoin = "round"; ctx.strokeStyle = th.rail; ctx.lineWidth = 16; ctx.stroke(pa);
    ctx.strokeStyle = th.railHi; ctx.lineWidth = 3; ctx.globalAlpha = 0.9; ctx.stroke(pa); ctx.globalAlpha = 1;
    const railFill = (path) => { ctx.fillStyle = th.rail; ctx.strokeStyle = th.railHi; ctx.lineWidth = 3; path(); ctx.fill(); ctx.stroke(); };
    for (const o of h.obs || []) {
      if (o.t === "rect") railFill(() => { ctx.beginPath(); ctx.roundRect(o.x, o.y, o.w, o.h, 6); });
      else if (o.t === "wall") { ctx.lineCap = "round"; ctx.strokeStyle = th.rail; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke(); ctx.strokeStyle = th.railHi; ctx.lineWidth = 3; ctx.stroke(); }
      else if (o.t === "circle") { const g = ctx.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.3, 2, o.x, o.y, o.r); g.addColorStop(0, "#fff"); g.addColorStop(0.3, th.accent); g.addColorStop(1, th.rail); ctx.shadowColor = th.accent; ctx.shadowBlur = courseId === "neon" ? 18 : 6; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = th.rail; ctx.lineWidth = 3; ctx.stroke(); }
    }
    for (const m of h.mills || []) { for (const sg of E.millSegs(m, S.t).slice(0, 1)) void sg; ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.ph + m.speed * S.t); ctx.fillStyle = th.rail; ctx.strokeStyle = th.railHi; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(-m.len / 2, -m.w / 2, m.len, m.w, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#ff6b5e"; ctx.fillRect(-m.len / 2 + 6, -m.w / 2 + 3, 26, m.w - 6); ctx.fillRect(m.len / 2 - 32, -m.w / 2 + 3, 26, m.w - 6); ctx.restore(); ctx.fillStyle = "#333"; ctx.beginPath(); ctx.arc(m.x, m.y, 12, 0, 7); ctx.fill(); ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(m.x, m.y, 5, 0, 7); ctx.fill(); }
    for (const g of h.gates || []) { const p = E.gatePos(g, S.t); railFill(() => { ctx.beginPath(); ctx.roundRect(p.x, p.y, g.w, g.h, 6); }); ctx.fillStyle = "#ff6b5e"; for (let y = p.y + 8; y < p.y + g.h - 8; y += 20) ctx.fillRect(p.x + 4, y, g.w - 8, 8); }
    // flag
    const [cx, cy] = h.cup; ctx.strokeStyle = "#eee"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 58); ctx.stroke();
    ctx.fillStyle = th.accent; ctx.beginPath(); ctx.moveTo(cx, cy - 58); ctx.lineTo(cx + 30, cy - 49 + Math.sin(t * 4) * 2); ctx.lineTo(cx, cy - 38); ctx.closePath(); ctx.fill(); ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("🪵", cx + 12, cy - 43);
    for (const pk of S.picks) if (!pk.got) { const bob = Math.sin(t * 4 + pk.x) * 3; ctx.save(); ctx.shadowColor = "#ffe27a"; ctx.shadowBlur = 14; ctx.fillStyle = "rgba(255,244,190,.92)"; ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 14, 0, 7); ctx.fill(); ctx.restore(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 14, 0, 7); ctx.stroke(); ctx.font = "16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000"; ctx.fillText(ICONS[pk.type], pk.x, pk.y + 1 + bob); ctx.textBaseline = "alphabetic"; }
    if (S.act.magnet && S.moving) { ctx.strokeStyle = "rgba(120,200,255,.6)"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(h.cup[0], h.cup[1], E.CUP_R * 8, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    // trail + ball
    const now = performance.now(); trail = trail.filter((p) => now - p.t < 220);
    for (const p of trail) { const k = 1 - (now - p.t) / 220; ctx.fillStyle = `rgba(255,255,255,${0.16 * k})`; ctx.beginPath(); ctx.arc(p.x, p.y, E.R * (0.4 + 0.5 * k), 0, 7); ctx.fill(); }
    const b = S.ball, sc = S.sink > 0 ? Math.max(0.15, 1 - S.sink / 0.35) : 1;
    if (!S.done) {
      if (S.act.power && S.moving) { ctx.fillStyle = "rgba(255,120,40,.35)"; ctx.beginPath(); ctx.arc(b.x, b.y, E.R * 2.1, 0, 7); ctx.fill(); }
      if (S.act.ghost) ctx.globalAlpha = 0.55;
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(b.x + 2, b.y + 4, E.R * sc, E.R * 0.8 * sc, 0, 0, 7); ctx.fill();
      const g = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, E.R * sc); g.addColorStop(0, "#fff"); g.addColorStop(1, "#c9c9d2"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, E.R * sc, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
    }
    splash = splash.filter((p) => now - p.t < 600); for (const p of splash) { const k = (now - p.t) / 600; ctx.fillStyle = `rgba(190,230,255,${1 - k})`; ctx.beginPath(); ctx.arc(p.x + p.vx * k, p.y + p.vy * k + 300 * k * k, 3, 0, 7); ctx.fill(); }
    // aiming guide
    if (drag && phase === "aim") {
      const dx = drag.x - mouse.x, dy = drag.y - mouse.y, dist = Math.hypot(dx, dy), p = clamp(dist / 170, 0, 1);
      if (dist > 6) {
        const ux = dx / dist, uy = dy / dist, len = rayHit(b.x, b.y, ux, uy, 60 + p * 340);
        const col = `hsl(${120 - p * 120},90%,58%)`;
        ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.setLineDash([2, 10]); ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + ux * len, b.y + uy * len); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - ux * Math.min(dist, 170), b.y - uy * Math.min(dist, 170)); ctx.stroke(); // the putter pulled back
        ctx.fillStyle = "#c58a4a"; ctx.beginPath(); ctx.arc(b.x - ux * Math.min(dist, 170), b.y - uy * Math.min(dist, 170), 9, 0, 7); ctx.fill(); ctx.strokeStyle = "#5e3a18"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(b.x - 30, b.y - 34, 60, 8); ctx.fillStyle = col; ctx.fillRect(b.x - 30, b.y - 34, 60 * p, 8);
      }
    } else if (phase === "aim" && !S.moving) { ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, 15 + Math.sin(t * 4) * 2, 0, 7); ctx.stroke(); }
    ctx.restore();
    if (banner && now - banner.t < 1800) { const k = (now - banner.t) / 1800; ctx.globalAlpha = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2; ctx.textAlign = "center"; ctx.font = "900 58px sans-serif"; ctx.lineWidth = 9; ctx.strokeStyle = "#101010"; ctx.strokeText(banner.text, W / 2, 70); ctx.fillStyle = th.accent; ctx.fillText(banner.text, W / 2, 70); if (banner.sub) { ctx.font = "800 22px sans-serif"; ctx.lineWidth = 5; ctx.strokeText(banner.sub, W / 2, 100); ctx.fillStyle = "#fff"; ctx.fillText(banner.sub, W / 2, 100); } ctx.globalAlpha = 1; }
  }

  // ---------------- multiplayer ----------------
  np = NetPlay.attach({
    game: "golf", rooms: false, panel: $("mpPanel"), menu: $("menu"), play: $("play"),
    onModeChange() { if (mode === "solo") toMenu(); },
    onPrepare(ctx) { oppName = ctx.players.find((p) => p.id !== ctx.me.id).name; courseId = ctx.opts.level; C = E.COURSES[courseId]; newRound(ctx.seed); mode = "match"; $("bestChip").hidden = true; holeIdx = 0; results = []; finished = false; lastSent = 0; hideResult(); newHole(); phase = "wait"; running(true); $("oppLine").textContent = `${oppName} is ready.`; },
    onStart() { phase = "aim"; t0 = performance.now(); },
    onStop() { },
    onExit() { running(false); mode = "idle"; hideResult(); },
    onNet(from, d) { if (d && d.k === "h") $("oppLine").textContent = `${oppName}: hole ${d.h}/${HOLES.length} · ${d.t} stroke${d.t === 1 ? "" : "s"}${d.d ? " · finished" : ""}`; },
  });
  renderCourses();
  window.__golf = () => ({ goto: (i) => { holeIdx = i; newHole(); }, S, phase, results, mode, hole: holeIdx, advance, nextNow: () => { nextAt = 0; }, putt: (ang, p) => { if (S && phase === 'aim' && E.shoot(S, ang, p)) { phase = 'roll'; hud(); card(); sendOpp(); if (mode === 'match' && total() > lastSent) { lastSent = total(); np.progress(lastSent); } return true; } return false; } });
})();
