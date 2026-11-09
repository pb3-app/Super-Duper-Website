(() => {
  const TA = window.TungArt;
  const GW = 60, GH = 60, CELL = 10, TICK = 130, DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const COLORS = ["#ffcc33", "#4cc9f0", "#ff6b6b", "#7df08f", "#c78bff", "#ff9d4d", "#5ee6c8", "#f27ac0"];
  const BOTNAMES = ["Tralalero", "Bombardiro", "Cappuccino", "Chimpanzini", "Ballerina", "Lirili", "Trippi", "Glorbo"];
  const $ = (id) => document.getElementById(id);
  const cv = $("view"), ctx = cv.getContext("2d"), msgEl = $("msg");
  const idx = (x, y) => y * GW + x;

  let gearBy = []; // what each player (by slot) wears: the shop items they bought
  let mp = false, host = true, myId = 0, sim = null, view = null, running = false, raf = 0, ended = false;
  let best = Number(localStorage.getItem("tungPaperBest") || 0); $("bestEl").textContent = (best / 10).toFixed(1);
  let tickAt = 0, tickTimer = 0, myPeakSent = 0, lastMsg = "", audio;
  function beep(f, d, v = 0.05) {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain(); o.type = "square"; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.02); } catch (_) {}
  }

  // =========================== simulation (runs in the host's browser) ===========================
  function makeSim(players, seconds) {
    const s = { owner: new Uint8Array(GW * GH), mark: new Uint8Array(GW * GH), players: [], remain: seconds * 1000, tickN: 0 };
    players.forEach((p, i) => s.players.push({ id: i, name: p.name, color: COLORS[i % COLORS.length], human: !!p.human, alive: false, x: 0, y: 0, px: 0, py: 0, dir: 0, ndir: 0, trail: [], respawn: 1, peak: 0, count: 0, kills: 0, ai: { phase: "out", tx: 0, ty: 0 }, ev: "" }));
    s.players.forEach((p) => spawn(s, p, true));
    return s;
  }
  function spawn(s, p, first) {
    for (let t = 0; t < 200; t++) {
      const x = 5 + Math.floor(Math.random() * (GW - 10)), y = 5 + Math.floor(Math.random() * (GH - 10));
      let ok = true;
      for (let dy = -4; dy <= 4 && ok; dy++) for (let dx = -4; dx <= 4; dx++) { const j = idx(x + dx, y + dy); if (s.owner[j] || s.mark[j]) { ok = false; break; } }
      if (!ok) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s.owner[idx(x + dx, y + dy)] = p.id + 1;
      p.x = p.px = x; p.y = p.py = y; p.dir = p.ndir = Math.floor(Math.random() * 4); p.alive = true; p.trail = []; p.respawn = 0; p.ai = { phase: "out", tx: x, ty: y };
      return;
    }
    p.respawn = first ? 1 : 10; // no room yet, try again soon
  }
  function kill(s, p, by, why) {
    if (!p.alive) return;
    p.alive = false; p.respawn = Math.ceil(2600 / TICK);
    for (const c of p.trail) s.mark[c] = 0;
    p.trail = [];
    for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === p.id + 1) s.owner[i] = 0;
    p.ev = why;
    if (by && by !== p) by.kills++;
  }
  function fillFor(s, p) {
    const me = p.id + 1;
    for (const c of p.trail) { s.owner[c] = me; s.mark[c] = 0; }
    p.trail = [];
    const seen = new Uint8Array(GW * GH), q = [];
    const push = (x, y) => { const j = idx(x, y); if (!seen[j] && s.owner[j] !== me) { seen[j] = 1; q.push(j); } };
    for (let x = 0; x < GW; x++) { push(x, 0); push(x, GH - 1); }
    for (let y = 0; y < GH; y++) { push(0, y); push(GW - 1, y); }
    for (let h = 0; h < q.length; h++) {
      const j = q[h], x = j % GW, y = (j / GW) | 0;
      if (x > 0) push(x - 1, y); if (x < GW - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < GH - 1) push(x, y + 1);
    }
    let got = 0;
    for (let j = 0; j < s.owner.length; j++) if (!seen[j] && s.owner[j] !== me) { s.owner[j] = me; got++; }
    return got;
  }
  // computer level: easy = short wandering loops, medium as before, hard = big loops that also go after your trail
  let aiLevel = "medium";
  const AI_L = { easy: { trail: 5, flip: 0.22, hunt: false }, medium: { trail: 12, flip: 0.1, hunt: false }, hard: { trail: 18, flip: 0.03, hunt: true } };
  function aiPick(s, p) {
    const L = AI_L[aiLevel] || AI_L.medium;
    const safe = (d) => {
      const nx = p.x + DX[d], ny = p.y + DY[d];
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) return false;
      return s.mark[idx(nx, ny)] !== p.id + 1;
    };
    const opp = (p.dir + 2) % 4;
    const onHome = s.owner[idx(p.x, p.y)] === p.id + 1;
    const a = p.ai;
    if (onHome && (a.phase === "home" || (Math.abs(p.x - a.tx) + Math.abs(p.y - a.ty) < 2 && a.phase === "out"))) {
      a.phase = "out";
      const ang = Math.floor(Math.random() * 4), dist = 5 + Math.floor(Math.random() * 9);
      a.tx = Math.max(1, Math.min(GW - 2, p.x + DX[ang] * dist + (Math.floor(Math.random() * 7) - 3)));
      a.ty = Math.max(1, Math.min(GH - 2, p.y + DY[ang] * dist + (Math.floor(Math.random() * 7) - 3)));
    }
    if (a.phase === "out" && !onHome && (p.trail.length > L.trail + Math.floor(Math.random() * 6) || (Math.abs(p.x - a.tx) + Math.abs(p.y - a.ty) < 2))) a.phase = "home";
    if (L.hunt && a.phase === "out" && !onHome && p.trail.length < 9) { // spot an enemy trail close by and go and cut it
      let bj = -1, bd = 8;
      for (let yy = Math.max(0, p.y - 7); yy <= Math.min(GH - 1, p.y + 7); yy++) for (let xx = Math.max(0, p.x - 7); xx <= Math.min(GW - 1, p.x + 7); xx++) {
        const m = s.mark[idx(xx, yy)]; if (!m || m === p.id + 1 || !s.players[m - 1].alive) continue;
        const d = Math.abs(xx - p.x) + Math.abs(yy - p.y); if (d < bd) { bd = d; bj = idx(xx, yy); }
      }
      if (bj >= 0) { a.tx = bj % GW; a.ty = (bj / GW) | 0; }
    }
    if (a.phase === "home" && !onHome) {
      let bx = -1, by = -1, bd = 1e9;
      for (let j = 0; j < s.owner.length; j += 1) if (s.owner[j] === p.id + 1) { const x = j % GW, y = (j / GW) | 0, d = Math.abs(x - p.x) + Math.abs(y - p.y); if (d < bd) { bd = d; bx = x; by = y; } }
      if (bx >= 0) { a.tx = bx; a.ty = by; }
    }
    const dxs = a.tx - p.x, dys = a.ty - p.y;
    const prefs = [];
    if (Math.abs(dxs) >= Math.abs(dys)) { prefs.push(dxs > 0 ? 1 : 3, dys > 0 ? 2 : 0); } else { prefs.push(dys > 0 ? 2 : 0, dxs > 0 ? 1 : 3); }
    if (Math.random() < L.flip) prefs.reverse();
    prefs.push(p.dir, (p.dir + 1) % 4, (p.dir + 3) % 4);
    for (const d of prefs) if (d !== opp && safe(d)) return d;
    for (let d = 0; d < 4; d++) if (d !== opp && safe(d)) return d;
    return p.dir;
  }
  function tick(s) {
    s.tickN++; s.remain -= TICK;
    const P = s.players;
    for (const p of P) { p.px = p.x; p.py = p.y; }
    // respawns
    for (const p of P) if (!p.alive && --p.respawn <= 0) spawn(s, p, false);
    // choose directions
    for (const p of P) if (p.alive) { if (!p.human) p.ndir = aiPick(s, p); if (p.ndir !== (p.dir + 2) % 4) p.dir = p.ndir; }
    // targets
    const target = new Map();
    const dying = new Map();
    for (const p of P) {
      if (!p.alive) continue;
      const nx = p.x + DX[p.dir], ny = p.y + DY[p.dir];
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) { dying.set(p, [null, "left the paper"]); continue; }
      const j = idx(nx, ny);
      if (target.has(j)) { const o = target.get(j); dying.set(p, [o, "head-on crash"]); dying.set(o, [p, "head-on crash"]); }
      else target.set(j, p);
      const m = s.mark[j];
      if (m) { const owner = P[m - 1]; if (owner === p) dying.set(p, [null, "hit its own trail"]); else if (owner.alive) dying.set(owner, [p, "was cut by " + p.name]); }
    }
    for (const [p, [by, why]] of dying) kill(s, p, by, why);
    // moves
    for (const p of P) {
      if (!p.alive) continue;
      p.x += DX[p.dir]; p.y += DY[p.dir];
      const j = idx(p.x, p.y);
      if (s.owner[j] === p.id + 1) { if (p.trail.length) fillFor(s, p); }
      else { p.trail.push(j); s.mark[j] = p.id + 1; }
    }
    // land counts and peaks
    for (const p of P) p.count = 0;
    for (let j = 0; j < s.owner.length; j++) if (s.owner[j]) P[s.owner[j] - 1].count++;
    for (const p of P) p.peak = Math.max(p.peak, Math.round((p.count * 1000) / (GW * GH)));
  }
  const tenths = (p) => Math.round((p.count * 1000) / (GW * GH));

  // =========================== snapshots for the guest ===========================
  function snapshot(s) {
    let o = ""; for (let j = 0; j < s.owner.length; j++) o += String.fromCharCode(48 + s.owner[j]);
    return { k: "s", n: s.tickN, t: s.remain, o, p: s.players.map((p) => [p.x, p.y, p.dir, p.alive ? 1 : 0, p.peak, p.count, p.kills, p.trail.join(",") , p.ev]) };
  }
  function applySnapshot(d) {
    if (!view) return;
    for (let j = 0; j < d.o.length; j++) view.owner[j] = d.o.charCodeAt(j) - 48;
    view.remain = d.t; view.tickN = d.n;
    d.p.forEach((a, i) => {
      const p = view.players[i]; if (!p) return;
      p.px = p.x; p.py = p.y;
      p.x = a[0]; p.y = a[1]; p.dir = a[2]; p.alive = !!a[3]; p.peak = a[4]; p.count = a[5]; p.kills = a[6]; p.trail = a[7] ? a[7].split(",").map(Number) : []; p.ev = a[8];
      if (!p.alive) { p.px = p.x; p.py = p.y; }
    });
    for (const p of view.players) if (!p.alive || Math.abs(p.x - p.px) + Math.abs(p.y - p.py) > 2) { p.px = p.x; p.py = p.y; }
    tickAt = performance.now();
  }

  // =========================== running a round ===========================
  function roundMs() { return mp ? roundSecs : Number($("time").value) * 1000; }
  let roundSecs = 120, botCount = 3, names = [];
  function build(humans) {
    const list = humans.map((n) => ({ name: n, human: true }));
    for (let i = 0; i < botCount; i++) list.push({ name: BOTNAMES[i % BOTNAMES.length], human: false });
    return list;
  }
  function begin() {
    ended = false; running = true; myPeakSent = 0;
    if (!mp || host) { sim.remain = (mp ? roundSecs : Number($("time").value)) * 1000; tickAt = performance.now(); clearInterval(tickTimer); tickTimer = setInterval(hostTick, TICK); }
    msgEl.textContent = ""; $("startBtn").textContent = "Restart";
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  function hostTick() {
    if (!running) return;
    tick(sim); view = sim; tickAt = performance.now();
    if (mp) TungMP.rt(snapshot(sim));
    hud(); if (sim.remain <= 0) endRound();
  }
  function endRound() {
    if (ended) return; ended = true; running = false; clearInterval(tickTimer);
    const me = view.players[myId], score = me.peak;
    if (mp) { if (host) TungMP.rt(snapshot(view)); TungMP.progress(score); TungMP.finish({ score }); msgEl.textContent = `Time! Your biggest land was ${(score / 10).toFixed(1)}%. Waiting for the result…`; return; }
    const ranked = view.players.slice().sort((a, b) => b.peak - a.peak), place = ranked.indexOf(me) + 1;
    msgEl.textContent = `Time! You peaked at ${(score / 10).toFixed(1)}% (place ${place} of ${ranked.length}), ${me.kills} cuts.`;
    if (score > best) { best = score; localStorage.setItem("tungPaperBest", best); $("bestEl").textContent = (best / 10).toFixed(1); msgEl.textContent += " New best! 🏆"; }
    if (score > 0 && window.TungMP) TungMP.submitSolo({ game: "paper", score });
    $("startBtn").textContent = "Play again"; beep(500, 0.4);
  }

  function hud() {
    const me = view.players[myId];
    $("timeEl").textContent = Math.max(0, Math.ceil(view.remain / 1000));
    $("landEl").textContent = (tenths(me) / 10).toFixed(1); $("peakEl").textContent = (me.peak / 10).toFixed(1); $("killEl").textContent = me.kills;
    if (mp && running && me.peak > myPeakSent) { myPeakSent = me.peak; TungMP.progress(me.peak); }
    const rows = view.players.slice().sort((a, b) => b.count - a.count).map((p) => `<div class="row${p.id === myId ? " me" : ""}${p.alive ? "" : " dead"}"><i style="background:${p.color}"></i>${p.name}<b>${(tenths(p) / 10).toFixed(1)}%</b></div>`).join("");
    if (rows !== lastMsg) { $("board").innerHTML = rows; lastMsg = rows; }
    if (mp && !host && running && view.remain <= 0) endRound();
    if (!me.alive && me.ev) msgEl.textContent = `💥 You ${me.ev}! Respawning…`; else if (me.alive && msgEl.textContent.startsWith("💥")) msgEl.textContent = "";
  }

  // =========================== drawing ===========================
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!view) return;
    const now = performance.now(), k = Math.min(1, (now - tickAt) / TICK);
    ctx.fillStyle = "#1b2536"; ctx.fillRect(0, 0, 600, 600);
    ctx.fillStyle = "rgba(255,255,255,.035)";
    for (let y = 0; y < GH; y++) for (let x = (y & 1); x < GW; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    for (let j = 0; j < view.owner.length; j++) { const o = view.owner[j]; if (!o) continue; ctx.fillStyle = view.players[o - 1].color + "88"; ctx.fillRect((j % GW) * CELL, ((j / GW) | 0) * CELL, CELL, CELL); }
    for (const p of view.players) {
      if (!p.trail.length) continue;
      ctx.fillStyle = p.color + "cc";
      for (const c of p.trail) ctx.fillRect((c % GW) * CELL + 2, ((c / GW) | 0) * CELL + 2, CELL - 4, CELL - 4);
    }
    for (const p of view.players) {
      if (!p.alive) continue;
      const x = (p.px + (p.x - p.px) * k + 0.5) * CELL, y = (p.py + (p.y - p.py) * k + 0.5) * CELL;
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
      ctx.strokeStyle = p.id === myId ? "#fff" : "#000"; ctx.lineWidth = 2; ctx.stroke();
      TA.draw(ctx, x, y - 2, 26, { gear: gearBy[p.id], look: [DX[p.dir], DY[p.dir]], mouth: "oh", parts: { face: true, bat: false, legs: false, armFar: false }, bat: 0 });
      if (p.id === myId) { ctx.font = "800 11px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText("YOU", x, y - 16); }
    }
    ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 2; ctx.strokeRect(1, 1, 598, 598);
    if (running) hud();
  }

  // =========================== input ===========================
  const KEYS = { ArrowUp: 0, w: 0, W: 0, ArrowRight: 1, d: 1, D: 1, ArrowDown: 2, s: 2, S: 2, ArrowLeft: 3, a: 3, A: 3 };
  function steer(d) {
    if (!running) return;
    const me = view.players[myId];
    if (mp && !host) { TungMP.rt({ k: "d", d }); me.ndir = d; return; }
    if (d !== (me.dir + 2) % 4) me.ndir = d;
  }
  document.addEventListener("keydown", (e) => { if (e.key in KEYS) { e.preventDefault(); steer(KEYS[e.key]); } });
  let sx = 0, sy = 0;
  cv.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
  cv.addEventListener("pointerup", (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.hypot(dx, dy) < 18) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
  });

  // =========================== modes ===========================
  function startSolo() {
    gearBy = [TungGear.mine()];
    mp = false; host = true; myId = 0; botCount = Number($("bots").value); aiLevel = $("level").value;
    sim = makeSim(build(["You"]), Number($("time").value)); view = sim; begin(); hud();
  }
  $("startBtn").addEventListener("click", () => { if (!mp) startSolo(); });
  function idle() { mp = false; botCount = 3; sim = makeSim(build(["You"]), 120); view = sim; sim.players.forEach((p, i) => { if (i) p.alive = false; }); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); hud(); }
  window.__paper = () => view; // for testing from the console
  idle();

  if (window.TungMP) {
    TungMP.on("msg:rt", (m) => {
      const d = m.d; if (!mp || !d) return;
      if (host && d.k === "d" && sim) { const p = sim.players[1]; if (p && d.d !== (p.dir + 2) % 4) p.ndir = d.d; }
      else if (!host && d.k === "s") applySnapshot(d);
    });
    TungMP.registerGame({
      prepareMatch(m) {
        mp = true; host = m.idx === 0; myId = m.idx; ended = false; running = false; clearInterval(tickTimer);
        roundSecs = m.options.time; botCount = m.options.bots; aiLevel = m.options.level || "medium";
        const hostName = host ? m.you.username : m.opp.username, guestName = host ? m.opp.username : m.you.username;
        names = [hostName, guestName];
        const myG = TungGear.mine(), oppG = TungGear.fromNums(m.opp.gear); gearBy = host ? [myG, oppG] : [oppG, myG];
        sim = makeSim(build(names), roundSecs); view = sim;
        msgEl.textContent = "Get ready…"; $("startBtn").textContent = "Start"; hud();
        cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
      },
      startMatch() { if (mp) { begin(); } },
      stopMatch() { running = false; clearInterval(tickTimer); },
      exitMatch() { mp = false; clearInterval(tickTimer); idle(); msgEl.textContent = "Press Start"; $("startBtn").textContent = "Start"; },
    });
  }
})();
