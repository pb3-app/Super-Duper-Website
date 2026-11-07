(() => {
  const TA = window.TungArt;
  const W = 900, H = 500, X0 = 50, X1 = 850, Y0 = 44, Y1 = 456, CX = 450, CY = 250;
  const HOOP = [{ x: 838, y: CY }, { x: 62, y: CY }]; // the hoop team 0 / team 1 shoots at
  const DIR = [1, -1], R3 = 205, SPEED = 190, PR = 15;
  const $ = (id) => document.getElementById(id);
  const cv = $("view"), ctx = cv.getContext("2d"), msgEl = $("msg");
  const TEAMCOL = ["#ffcc33", "#4cc9f0"];

  let mp = false, host = true, myTeam = 0, mirror = false, S = null, running = false, raf = 0, last = 0, acc = 0, tickSend = 0;
  let evOut = [], lastProg = -1, level = "medium", seconds = 120, rng = Math.random, popups = [], flashes = [], audio;
  const inp = { dx: 0, dy: 0, shoot: -1, pass: 0, steal: 0, sw: 0 }; // my inputs; shoot: -1 none else meter at release
  let keys = {}, charging = 0, chargeT = 0, remoteIn = { dx: 0, dy: 0, shoot: -1, pass: 0, steal: 0, sw: 0 }, handled = [{ pass: 0, steal: 0, sw: 0 }, { pass: 0, steal: 0, sw: 0 }], lastSentIn = "";

  function beep(f, d, type = "square", v = 0.06, slide = 0.6) {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t + d); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.02); } catch (_) {}
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const meterAt = (t) => Math.min(1, t / 1.0);

  // ============================ simulation ============================
  function newSim() {
    const mk = (id, team, name) => ({ id, team, name, x: 0, y: 0, vx: 0, vy: 0, face: team === 0 ? 0 : Math.PI, steal: 0, think: 0, hold: 0 });
    const s = {
      players: [mk(0, 0, "Tung"), mk(1, 0, "Sahur"), mk(2, 1, "Tralalero"), mk(3, 1, "Bombardiro")],
      ball: { x: CX, y: CY, vx: 0, vy: 0, owner: -1, mode: "loose", t: 0, free: 0 },
      score: [0, 0], remain: seconds * 1000, clock: 12, ctl: [0, 2], overtime: false, over: false, ev: [], poss: 0, tipped: false, pause: 0,
    };
    resetPlay(s, 0);
    return s;
  }
  function resetPlay(s, offense) {
    const d = DIR[offense], off = s.players.filter((p) => p.team === offense), def = s.players.filter((p) => p.team !== offense);
    const set = (p, x, y) => { p.x = x; p.y = y; p.vx = p.vy = 0; p.face = DIR[p.team] > 0 ? 0 : Math.PI; };
    set(off[0], CX - d * 120, 250); set(off[1], CX - d * 20, 150);
    set(def[0], CX + d * 40, 235); set(def[1], CX + d * 110, 330);
    s.ball.owner = off[0].id; s.ball.mode = "held"; s.ball.vx = s.ball.vy = 0;
    s.poss = offense; s.clock = 12; s.pause = 0.7;
    s.ctl[offense] = off[0].id; s.ctl[1 - offense] = def[0].id;
  }
  function gain(s, p) { // p picks up / receives possession
    s.ball.owner = p.id; s.ball.mode = "held"; s.ball.free = 0;
    if (s.poss !== p.team) { s.poss = p.team; s.clock = 12; }
    if (humanTeam(p.team)) s.ctl[p.team] = p.id;
    const opp = s.players.filter((q) => q.team !== p.team);
    if (humanTeam(1 - p.team)) s.ctl[1 - p.team] = opp.sort((a, b) => dist(a, p) - dist(b, p))[0].id;
  }
  const humanTeam = (t) => (mp ? true : t === 0);

  function defenderNear(s, p, r) { let best = null, bd = r; for (const q of s.players) if (q.team !== p.team) { const d = dist(p, q); if (d < bd) { bd = d; best = q; } } return best ? { q: best, d: bd } : null; }

  function doShoot(s, p, meter, skill) {
    const hoop = HOOP[p.team], d = Math.hypot(hoop.x - p.x, hoop.y - p.y);
    let prob = clamp(0.88 - (d - 60) / 450, 0.22, 0.88);
    const timing = meter >= 0.76 && meter <= 0.97 ? 0.14 : meter < 0.4 ? -0.28 : meter > 0.97 ? -0.15 : (meter - 0.4) * 0.3 - 0.06;
    prob += timing + (skill || 0);
    const c = defenderNear(s, p, 70);
    if (c) prob -= ((70 - c.d) / 70) * 0.4;
    prob = clamp(prob, 0.05, 0.95);
    const pts = d >= R3 ? 3 : 2;
    // a defender right in the shooter's face can block
    const b = defenderNear(s, p, 38);
    if (b && Math.random() < 0.3 * (1 - b.d / 38) + (b.q.steal > 0 ? 0 : 0.05)) {
      const bl = s.ball; bl.owner = -1; bl.mode = "loose"; bl.x = p.x; bl.y = p.y; bl.vx = (b.q.x - p.x) * 6 + (Math.random() - 0.5) * 80; bl.vy = (Math.random() - 0.5) * 220; bl.free = 0.3;
      s.ev.push(["block", b.q.x, b.q.y]); return;
    }
    s.ball.owner = -1; s.ball.mode = "shot"; s.ball.t = 0; s.ball.dur = 0.55 + d / 900;
    s.ball.from = { x: p.x, y: p.y }; s.ball.to = { x: hoop.x, y: hoop.y }; s.ball.by = p.id; s.ball.pts = pts; s.ball.score = Math.random() < prob; s.ball.x = p.x; s.ball.y = p.y;
    s.ev.push(["shoot", p.x, p.y]);
  }
  function doPass(s, p, q) {
    const b = s.ball; b.owner = -1; b.mode = "pass"; b.t = 0; b.from = { x: p.x, y: p.y }; b.to = q; b.dur = Math.max(0.15, dist(p, q) / 560); b.by = p.id; b.x = p.x; b.y = p.y;
    s.ev.push(["pass", p.x, p.y]);
  }
  function doSteal(s, p) {
    if (p.steal > 0) return; p.steal = 0.7;
    const owner = s.ball.owner >= 0 ? s.players[s.ball.owner] : null;
    s.ev.push(["swipe", p.x, p.y]);
    if (owner && owner.team !== p.team && dist(p, owner) < 38 && Math.random() < 0.42) {
      gain(s, p); s.ev.push(["steal", p.x, p.y]);
    }
  }

  function aiControl(s, p, dt, skillMul) {
    const b = s.ball, team = p.team, hoop = HOOP[team], myGoal = HOOP[1 - team], d = DIR[team];
    const mates = s.players.filter((q) => q.team === team), mate = mates.find((q) => q !== p), foes = s.players.filter((q) => q.team !== team);
    const hasBall = b.owner === p.id, teamHas = b.owner >= 0 && s.players[b.owner].team === team, foeHas = b.owner >= 0 && !teamHas;
    let tx = p.x, ty = p.y, sp = SPEED * skillMul;
    p.think -= dt; if (p.steal > 0) p.steal -= dt;
    if (hasBall) {
      const dh = Math.hypot(hoop.x - p.x, hoop.y - p.y), near = defenderNear(s, p, 60);
      tx = hoop.x - d * 150; ty = hoop.y + (p.y < hoop.y ? -40 : 40) * (1 + Math.sin(performance.now() / 700));
      if (dh < 190) { tx = p.x; ty = p.y; }
      sp *= 0.93;
      if (p.think <= 0) {
        p.think = 0.35 + Math.random() * 0.3;
        const open = !defenderNear(s, p, 55);
        const ready = s.pause <= 0;
        if (ready && dh < 260 && (open ? Math.random() < 0.55 : Math.random() < 0.18) && dh > 60) { const m = clamp(0.78 + (Math.random() - 0.5) * (level === "easy" ? 0.5 : level === "hard" ? 0.1 : 0.28), 0.2, 1); doShoot(s, p, m, level === "hard" ? 0.05 : level === "easy" ? -0.08 : 0); return; }
        if (ready && near && mate && Math.random() < 0.5) { const dm = Math.hypot(hoop.x - mate.x, hoop.y - mate.y); if (dm < dh + 80 && !defenderNear(s, mate, 40)) { doPass(s, p, mate); return; } }
        if (s.clock < 2.5 && ready) doShoot(s, p, 0.7, -0.05);
      }
    } else if (teamHas) { // spot up, or cut when the teammate is the handler
      const side = p.id % 2 ? 1 : -1;
      tx = hoop.x - d * 190; ty = hoop.y + side * 120;
      if (Math.sin(performance.now() / 1500 + p.id) > 0.6) { tx = hoop.x - d * 90; ty = hoop.y + side * 60; }
    } else if (foeHas) { // man-to-man
      const handler = s.players[b.owner], mark = foes.find((q) => q !== handler) && (p.id % 2 === 0 ? handler : foes.find((q) => q !== handler)) || handler;
      const m = mark;
      const gx = myGoal.x - m.x, gy = myGoal.y - m.y, gl = Math.hypot(gx, gy) || 1, gap = m === handler ? 26 : 46;
      tx = m.x + (gx / gl) * gap; ty = m.y + (gy / gl) * gap;
      if (m === handler && dist(p, handler) < 36 && p.think <= 0 && level !== "easy") { p.think = level === "hard" ? 0.45 : 0.8; doSteal(s, p); }
    } else { // loose ball: the closest on each team goes for it
      const closest = mates.slice().sort((a, c) => dist(a, b) - dist(c, b))[0];
      if (closest === p) { tx = b.x; ty = b.y; sp *= 1.05; } else { tx = (b.x + hoop.x) / 2 - d * 60; ty = b.y + (p.id % 2 ? 50 : -50); }
    }
    const dx = tx - p.x, dy = ty - p.y, l = Math.hypot(dx, dy);
    if (l > 5) { p.vx += ((dx / l) * sp - p.vx) * Math.min(1, dt * 8); p.vy += ((dy / l) * sp - p.vy) * Math.min(1, dt * 8); }
    else { p.vx *= 0.8; p.vy *= 0.8; }
  }

  function humanControl(s, p, input, dt) {
    const sp = SPEED * (s.ball.owner === p.id ? 0.93 : 1);
    const l = Math.hypot(input.dx, input.dy) || 1;
    const tx = input.dx ? (input.dx / l) * sp : 0, ty = input.dy ? (input.dy / l) * sp : 0;
    p.vx += (tx - p.vx) * Math.min(1, dt * 10); p.vy += (ty - p.vy) * Math.min(1, dt * 10);
    if (p.steal > 0) p.steal -= dt;
  }

  function stepSim(s, dt, ins) {
    if (s.over) return;
    if (s.pause > 0) s.pause -= dt;
    const skillMul = level === "easy" ? 0.82 : level === "hard" ? 1.02 : 0.93;
    // inputs: team 0 uses ins[0], team 1 uses ins[1] (only human teams)
    for (const t of [0, 1]) {
      const input = ins[t]; if (!input || !humanTeam(t)) continue;
      const hs = handled[t], p = s.players[s.ctl[t]], mate = s.players.find((q) => q.team === t && q !== p);
      if (input.sw !== hs.sw) { hs.sw = input.sw; s.ctl[t] = mate.id; }
      if (input.pass !== hs.pass) { hs.pass = input.pass; if (s.ball.owner === p.id && s.pause <= 0) doPass(s, p, mate); }
      if (input.steal !== hs.steal) { hs.steal = input.steal; doSteal(s, p); }
      if (input.shoot >= 0 && input.shootId !== hs.shootId) { hs.shootId = input.shootId; if (s.ball.owner === p.id && s.pause <= 0) doShoot(s, p, input.shoot, 0); }
    }
    for (const p of s.players) {
      const isCtl = humanTeam(p.team) && s.ctl[p.team] === p.id;
      if (isCtl) humanControl(s, p, p.team === 0 || !mp ? ins[0] || inp : ins[1], dt); else aiControl(s, p, dt, skillMul);
      if (s.pause > 0) { p.vx *= 0.5; p.vy *= 0.5; }
      p.x = clamp(p.x + p.vx * dt, X0, X1); p.y = clamp(p.y + p.vy * dt, Y0, Y1);
      if (Math.hypot(p.vx, p.vy) > 20) p.face = Math.atan2(p.vy, p.vx);
    }
    // player collisions
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { const a = s.players[i], b = s.players[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); if (d < PR * 2 && d > 0.01) { const push = (PR * 2 - d) / 2; a.x -= (dx / d) * push; a.y -= (dy / d) * push; b.x += (dx / d) * push; b.y += (dy / d) * push; } }
    // ball
    const b = s.ball;
    if (b.mode === "held") {
      const o = s.players[b.owner]; b.x = o.x + Math.cos(o.face) * 14; b.y = o.y + Math.sin(o.face) * 14 + 4;
      s.clock -= dt;
      if (s.clock <= 0) { const other = s.players.find((q) => q.team !== o.team && dist(q, o) < 400); s.ev.push(["clock", o.x, o.y]); gain(s, s.players.filter((q) => q.team !== o.team).sort((a, c) => dist(a, o) - dist(c, o))[0] || other); s.pause = 0.4; }
    } else if (b.mode === "loose") {
      b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= Math.exp(-2.2 * dt); b.vy *= Math.exp(-2.2 * dt);
      if (b.x < X0 || b.x > X1) { b.x = clamp(b.x, X0, X1); b.vx *= -0.6; } if (b.y < Y0 || b.y > Y1) { b.y = clamp(b.y, Y0, Y1); b.vy *= -0.6; }
      b.free -= dt;
      if (b.free <= 0) { let best = null, bd = 24; for (const p of s.players) { const d = dist(p, b); if (d < bd) { bd = d; best = p; } } if (best) { gain(s, best); s.ev.push(["pick", best.x, best.y]); } }
    } else if (b.mode === "pass") {
      b.t += dt; const k = Math.min(1, b.t / b.dur); b.x = b.from.x + (b.to.x - b.from.x) * k; b.y = b.from.y + (b.to.y - b.from.y) * k;
      const by = s.players[b.by];
      for (const q of s.players) if (q.team !== by.team && k > 0.15 && k < 0.95 && dist(q, b) < 20 && Math.random() < 0.05 + (level === "hard" ? 0.04 : 0)) { gain(s, q); s.ev.push(["steal", q.x, q.y]); break; }
      if (b.mode === "pass" && k >= 1) { const mate = s.players.find((q) => q.team === by.team && q.id !== by.id); gain(s, mate); }
    } else if (b.mode === "shot") {
      b.t += dt; const k = Math.min(1, b.t / b.dur);
      b.x = b.from.x + (b.to.x - b.from.x) * k; b.y = b.from.y + (b.to.y - b.from.y) * k;
      b.z = Math.sin(k * Math.PI) * 120;
      if (k >= 1) {
        const by = s.players[b.by];
        if (b.score) {
          s.score[by.team] += b.pts; s.ev.push(["score", b.to.x, b.to.y, b.pts, by.team]);
          resetPlay(s, 1 - by.team); s.pause = 1.1;
          if (s.overtime) { s.over = true; }
        } else {
          s.ev.push(["miss", b.to.x, b.to.y]);
          b.mode = "loose"; b.x = b.to.x - DIR[by.team] * 16; b.y = b.to.y; b.vx = -DIR[by.team] * (80 + Math.random() * 120); b.vy = (Math.random() - 0.5) * 260; b.free = 0.35; b.z = 0;
        }
      }
    }
    // clock
    if (!s.overtime) { s.remain -= dt * 1000; if (s.remain <= 0) { s.remain = 0; if (s.score[0] !== s.score[1]) s.over = true; else { s.overtime = true; s.ev.push(["ot", 0, 0]); } } }
  }

  // ============================ snapshots ============================
  const r1 = (v) => Math.round(v * 10) / 10;
  function snap(s, evs) {
    return { k: "s", p: s.players.map((p) => [r1(p.x), r1(p.y), Math.round(p.face * 100) / 100, p.steal > 0 ? 1 : 0]), b: [r1(s.ball.x), r1(s.ball.y), Math.round((s.ball.z || 0)), s.ball.owner, s.ball.mode], sc: s.score, rm: Math.round(s.remain), cl: Math.round(s.clock * 10) / 10, ctl: s.ctl, ot: s.overtime ? 1 : 0, ov: s.over ? 1 : 0, ev: evs || [], pa: s.pause > 0 ? 1 : 0, po: s.poss };
  }
  function applySnap(d) {
    if (!S) return;
    d.p.forEach((a, i) => { const p = S.players[i]; p.tx = a[0]; p.ty = a[1]; p.face = a[2]; p.steal = a[3]; });
    S.ball.tx = d.b[0]; S.ball.ty = d.b[1]; S.ball.z = d.b[2]; S.ball.owner = d.b[3]; S.ball.mode = d.b[4];
    S.score = d.sc; S.remain = d.rm; S.clock = d.cl; S.ctl = d.ctl; S.overtime = !!d.ot; S.over = !!d.ov; S.poss = d.po;
    if (!S.sync) { for (const p of S.players) { p.x = p.tx; p.y = p.ty; } S.ball.x = S.ball.tx; S.ball.y = S.ball.ty; S.sync = true; }
    for (const e of d.ev) handleEvent(e);
    if (mp && S.score[myTeam] !== lastProg) { lastProg = S.score[myTeam]; TungMP.progress(lastProg); }
  }
  function handleEvent(e) {
    const [k, x, y, pts, team] = e;
    if (k === "score") { popups.push({ x, y: y - 30, text: `${pts === 3 ? "THREE!" : "BUCKET!"} +${pts}`, t: performance.now(), col: TEAMCOL[team] }); beep(660, 0.25, "triangle", 0.09, 1.5); setTimeout(() => beep(880, 0.2, "triangle", 0.08, 1.2), 120); if (mp && host && S.score[myTeam] !== lastProg) { lastProg = S.score[myTeam]; TungMP.progress(lastProg); } }
    else if (k === "shoot") beep(300, 0.15, "sine", 0.05, 1.4);
    else if (k === "miss") { popups.push({ x, y: y - 20, text: "clank", t: performance.now(), col: "#ddd" }); beep(160, 0.2, "square", 0.06, 0.5); }
    else if (k === "block") { popups.push({ x, y: y - 30, text: "BLOCKED!", t: performance.now(), col: "#ff8a80" }); beep(120, 0.2, "sawtooth", 0.08); }
    else if (k === "steal") { popups.push({ x, y: y - 30, text: "STOLEN!", t: performance.now(), col: "#7df08f" }); beep(520, 0.12, "square", 0.07, 0.5); }
    else if (k === "clock") popups.push({ x, y: y - 30, text: "shot clock!", t: performance.now(), col: "#ffd27a" });
    else if (k === "pass") beep(400, 0.06, "sine", 0.04);
    else if (k === "ot") popups.push({ x: CX, y: 200, text: "SUDDEN DEATH!", t: performance.now(), col: "#ff9d00" });
  }

  // ============================ main loop ============================
  function myInput() { return { dx: inp.dx, dy: inp.dy, shoot: inp.shoot, shootId: inp.shootId, pass: inp.pass, steal: inp.steal, sw: inp.sw }; }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016); last = t;
    if (S && running) {
      if (!mp || host) {
        acc += dt;
        while (acc >= 1 / 60) {
          acc -= 1 / 60;
          const ins = mp ? [myInput(), remoteIn] : [myInput(), null];
          stepSim(S, 1 / 60, ins);
          for (const e of S.ev) { handleEvent(e); evOut.push(e); }
          S.ev = [];
          if (S.over) break;
        }
        if (mp) { tickSend += dt; if (tickSend > 0.05 || S.over) { tickSend = 0; TungMP.rt(snap(S, evOut)); evOut = []; } } else evOut = [];
        if (S.over) endGame();
      } else { // guest: glide toward the host's latest positions, send my inputs when they change
        for (const p of S.players) if (p.tx !== undefined) { p.x += (p.tx - p.x) * Math.min(1, dt * 18); p.y += (p.ty - p.y) * Math.min(1, dt * 18); }
        if (S.ball.tx !== undefined) { S.ball.x += (S.ball.tx - S.ball.x) * Math.min(1, dt * 22); S.ball.y += (S.ball.ty - S.ball.y) * Math.min(1, dt * 22); }
        const cur = JSON.stringify(myInput());
        if (cur !== lastSentIn) { lastSentIn = cur; TungMP.rt({ k: "in", i: myInput() }); }
        if (S.over) endGame();
      }
      if (charging) chargeT = Math.min(1.05, chargeT + dt);
    }
    if (S) draw();
  }
  function endGame() {
    if (!running) return; running = false;
    const mine = S.score[myTeam], theirs = S.score[1 - myTeam];
    if (mp) { TungMP.progress(mine); TungMP.finish({ score: mine }); msgEl.textContent = `Final: ${mine} - ${theirs}. Waiting for the result…`; return; }
    msgEl.textContent = mine > theirs ? `🏆 You win ${mine} - ${theirs}!` : `💀 You lose ${mine} - ${theirs}.`;
    if (window.TungMP) TungMP.submitSolo({ game: "basketball", result: mine > theirs ? "win" : "loss" });
    $("startBtn").textContent = "Play again"; beep(mine > theirs ? 700 : 150, 0.5, "triangle", 0.1);
  }

  // ============================ drawing ============================
  function court() {
    ctx.fillStyle = "#c58a46"; ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 50) { ctx.fillStyle = x / 50 % 2 ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.04)"; ctx.fillRect(x, 0, 50, H); }
    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 3;
    ctx.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
    ctx.beginPath(); ctx.moveTo(CX, Y0); ctx.lineTo(CX, Y1); ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, 60, 0, 7); ctx.stroke();
    for (const [i, h] of HOOP.entries()) {
      const d = i === 0 ? -1 : 1; // direction from the hoop toward the court
      ctx.fillStyle = "rgba(180,60,30,.35)"; ctx.fillRect(d > 0 ? X0 : X1 - 190, CY - 80, 190, 160); ctx.strokeRect(d > 0 ? X0 : X1 - 190, CY - 80, 190, 160);
      ctx.beginPath(); ctx.arc(d > 0 ? X0 + 190 : X1 - 190, CY, 60, d > 0 ? -Math.PI / 2 : Math.PI / 2, d > 0 ? Math.PI / 2 : -Math.PI / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x, h.y, R3, d > 0 ? -1.15 : Math.PI - 1.15 + 0, d > 0 ? 1.15 : Math.PI + 1.15); ctx.stroke(); // 3-point arc (approx)
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(h.x + d * -6, h.y - 28); ctx.lineTo(h.x + d * -6, h.y + 28); ctx.stroke(); ctx.lineWidth = 3;
      ctx.strokeStyle = "#ff5a2a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(h.x + d * 14, h.y, 13, 0, 7); ctx.stroke(); ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.arc(h.x + d * 14, h.y, 9, 0, 7); ctx.stroke(); ctx.strokeStyle = "rgba(255,255,255,.9)";
    }
  }
  function drawPlayer(p, isCtl, hasBall) {
    const bob = Math.sin(performance.now() / 120 + p.id) * (Math.hypot(p.vx || 0, p.vy || 0) > 30 ? 2 : 0.6);
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(p.x, p.y + 20, 15, 6, 0, 0, 7); ctx.fill();
    if (isCtl) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(p.x, p.y + 20, 20, 8, 0, 0, 7); ctx.stroke(); }
    ctx.fillStyle = TEAMCOL[p.team]; ctx.beginPath(); ctx.ellipse(p.x, p.y + 20, 15, 6, 0, 0, 7); ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
    const flip = Math.cos(p.face) < 0;
    TA.draw(ctx, p.x, p.y - 4 + bob, 54, { green: p.team === 1, flip, bat: 0.9, eyes: "normal", mouth: hasBall ? "smile" : "oh", look: [flip ? -0.5 : 0.5, 0.2], legs: performance.now() / 180 + p.id, parts: { legs: true, armFar: true, bat: false, face: true } });
    // jersey stripe
    ctx.fillStyle = TEAMCOL[p.team]; ctx.fillRect(p.x - 12, p.y - 4 + bob, 24, 5);
    if (isCtl) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(p.x, p.y - 44); ctx.lineTo(p.x - 7, p.y - 54); ctx.lineTo(p.x + 7, p.y - 54); ctx.fill(); }
  }
  function drawBall() {
    const b = S.ball, z = b.z || 0;
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(b.x, b.y + 16, 8, 3, 0, 0, 7); ctx.fill();
    const y = b.y - (b.mode === "shot" ? z : 0);
    ctx.fillStyle = "#ee7a2a"; ctx.beginPath(); ctx.arc(b.x, y, 8.5, 0, 7); ctx.fill(); ctx.strokeStyle = "#4a210a"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.x - 8.5, y); ctx.lineTo(b.x + 8.5, y); ctx.moveTo(b.x, y - 8.5); ctx.lineTo(b.x, y + 8.5); ctx.stroke();
  }
  function draw() {
    ctx.save();
    if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    court();
    const list = S.players.slice().sort((a, b) => a.y - b.y);
    for (const p of list) drawPlayer(p, humanTeam(p.team) && S.ctl[p.team] === p.id && (!mp ? p.team === 0 : p.team === myTeam), S.ball.owner === p.id);
    drawBall();
    // shot meter
    if (charging && running) {
      const p = S.players[S.ctl[myTeam]], m = meterAt(chargeT);
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(p.x - 22, p.y - 70, 44, 8);
      ctx.fillStyle = "#3fcf5a"; ctx.fillRect(p.x - 22 + 44 * 0.76, p.y - 70, 44 * 0.21, 8);
      ctx.fillStyle = "#fff"; ctx.fillRect(p.x - 22 + 44 * m - 1.5, p.y - 73, 3, 14);
    }
    ctx.restore();
    // scoreboard (not mirrored)
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(CX - 150, 0, 300, 36);
    ctx.font = "900 24px sans-serif"; ctx.textAlign = "center";
    const mine = mp ? myTeam : 0;
    ctx.fillStyle = TEAMCOL[mine]; ctx.fillText(S.score[mine], CX - 95, 27); ctx.fillStyle = TEAMCOL[1 - mine]; ctx.fillText(S.score[1 - mine], CX + 95, 27);
    ctx.fillStyle = "#fff"; ctx.font = "800 17px sans-serif";
    ctx.fillText(S.overtime ? "SUDDEN DEATH" : Math.floor(S.remain / 60000) + ":" + String(Math.ceil((S.remain % 60000) / 1000) % 60).padStart(2, "0"), CX, 24);
    ctx.font = "700 12px sans-serif"; ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.fillText("YOU" + (mp ? "" : ""), CX - 145, 12); ctx.textAlign = "right"; ctx.fillText(mp ? "THEM" : "CPU", CX + 145, 12);
    // shot clock
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(CX - 60, 38, 120, 7); ctx.fillStyle = S.clock < 3 ? "#ff6b5e" : "#ffd27a"; ctx.fillRect(CX - 60, 38, 120 * Math.max(0, S.clock / 12), 7);
    // popups
    const now = performance.now();
    popups = popups.filter((p) => now - p.t < 1100);
    for (const p of popups) { const k = (now - p.t) / 1100; const px = mirror ? W - p.x : p.x; ctx.globalAlpha = 1 - k; ctx.font = "900 26px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 6; ctx.strokeStyle = "#222"; ctx.strokeText(p.text, px, p.y - k * 36); ctx.fillStyle = p.col; ctx.fillText(p.text, px, p.y - k * 36); ctx.globalAlpha = 1; }
    if (!running && !S.over && !mp) { ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(0, 0, W, H); }
  }

  // ============================ input ============================
  const K = { ArrowLeft: "l", a: "l", A: "l", ArrowRight: "r", d: "r", D: "r", ArrowUp: "u", w: "u", W: "u", ArrowDown: "d", s: "d", S: "d" };
  function recalc() {
    let dx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), dy = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
    if (joy.x || joy.y) { dx = joy.x; dy = joy.y; }
    inp.dx = mirror ? -dx : dx; inp.dy = dy;
  }
  function startCharge() { if (!running || charging) return; charging = 1; chargeT = 0; }
  function releaseShot() { if (!charging) return; charging = 0; inp.shoot = meterAt(chargeT); inp.shootId = (inp.shootId || 0) + 1; }
  document.addEventListener("keydown", (e) => {
    if (e.key in K) { e.preventDefault(); keys[K[e.key]] = true; recalc(); }
    if (e.code === "Space") { e.preventDefault(); if (!e.repeat) startCharge(); }
    if (e.repeat) return;
    if (e.key === "j" || e.key === "J") inp.pass++;
    if (e.key === "k" || e.key === "K") inp.steal++;
    if (e.key === "e" || e.key === "E" || e.key === "Shift") inp.sw++;
  });
  document.addEventListener("keyup", (e) => { if (e.key in K) { keys[K[e.key]] = false; recalc(); } if (e.code === "Space") releaseShot(); });
  const joy = { x: 0, y: 0 };
  const joyEl = $("joy"), knob = $("knob");
  function joyMove(e) { const r = joyEl.getBoundingClientRect(), dx = e.clientX - (r.x + r.width / 2), dy = e.clientY - (r.y + r.height / 2), l = Math.hypot(dx, dy) || 1, m = Math.min(1, l / 60); joy.x = (dx / l) * m; joy.y = (dy / l) * m; knob.style.transform = `translate(${joy.x * 40}px,${joy.y * 40}px)`; recalc(); }
  joyEl.addEventListener("pointerdown", (e) => { joyEl.setPointerCapture(e.pointerId); joyMove(e); });
  joyEl.addEventListener("pointermove", (e) => { if (e.buttons || e.pressure) joyMove(e); });
  for (const ev of ["pointerup", "pointercancel"]) joyEl.addEventListener(ev, () => { joy.x = joy.y = 0; knob.style.transform = ""; recalc(); });
  $("bShoot").addEventListener("pointerdown", (e) => { e.preventDefault(); startCharge(); });
  $("bShoot").addEventListener("pointerup", releaseShot); $("bShoot").addEventListener("pointerleave", releaseShot);
  $("bPass").addEventListener("pointerdown", (e) => { e.preventDefault(); inp.pass++; });
  $("bSteal").addEventListener("pointerdown", (e) => { e.preventDefault(); inp.steal++; });
  $("bSwitch").addEventListener("pointerdown", (e) => { e.preventDefault(); inp.sw++; });

  // ============================ flow ============================
  function startSolo() {
    mp = false; host = true; myTeam = 0; mirror = false; level = $("level").value; seconds = Number($("length").value);
    S = newSim(); handled = [{ pass: inp.pass, steal: inp.steal, sw: inp.sw }, { pass: 0, steal: 0, sw: 0 }]; popups = []; running = true; acc = 0;
    msgEl.textContent = ""; $("startBtn").textContent = "Restart"; cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame);
  }
  $("startBtn").addEventListener("click", () => { if (!mp) startSolo(); });
  function idle() { mp = false; host = true; myTeam = 0; mirror = false; seconds = 120; S = newSim(); running = false; cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame); }
  idle();

  if (window.TungMP) {
    TungMP.on("msg:rt", (m) => {
      const d = m.d; if (!mp || !d) return;
      if (host && d.k === "in") remoteIn = d.i;
      else if (!host && d.k === "s") applySnap(d);
    });
    TungMP.registerGame({
      prepareMatch(m) {
        mp = true; lastProg = -1; evOut = []; host = m.idx === 0; myTeam = m.idx; mirror = m.idx === 1; level = "medium"; seconds = m.options.length;
        S = newSim(); S.sync = false; popups = []; running = false; remoteIn = { dx: 0, dy: 0, shoot: -1, pass: 0, steal: 0, sw: 0 }; handled = [{ pass: 0, steal: 0, sw: 0 }, { pass: 0, steal: 0, sw: 0 }]; inp.pass = inp.steal = inp.sw = 0;
        S.players[0].name = host ? m.you.username : m.opp.username; S.players[2].name = host ? m.opp.username : m.you.username;
        msgEl.textContent = "Get ready…"; cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame);
      },
      startMatch() { if (mp) { running = true; acc = 0; msgEl.textContent = ""; } },
      stopMatch() { running = false; charging = 0; },
      exitMatch() { mp = false; idle(); msgEl.textContent = "Press Tip off"; $("startBtn").textContent = "Tip off"; },
    });
  }
})();
