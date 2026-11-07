(() => {
  const TA = window.TungArt;
  const W = 900, H = 640, CX = 450, CY = 340, TILT = 0.7, R0 = 270, RMIN = 150, PR = 27, ACC = 1500, FRIC = 3.4, VMAX = 340, DASH_V = 760;
  const $ = (id) => document.getElementById(id);
  const cv = $("view"), ctx = cv.getContext("2d");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const COLS = [{ pal: undefined, belt: "#ffcc33", name: "gold" }, { pal: "blue", belt: "#4cc9f0", name: "blue" }, { pal: "red", belt: "#ff6b6b", name: "red" }, { pal: "green", belt: "#7df08f", name: "green" }];
  let audio;
  function beep(f, d, type = "sine", v = 0.08, slide = 0.5) { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t + d); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.02); } catch (_) {} }

  let role = "idle", sim = null, view = null, myIdx = 0, np = null, running = false, raf = 0, last = 0, over = false, level = "medium", roundsTo = 3, shake = 0, parts = [], pops = [], snapAt = 0, sendAcc = 0, pendingEv = [], ctxInfo = null, banner = null;
  const keys = {}; let joy = { x: 0, y: 0 }, dashCount = 0, myInput = { dx: 0, dy: 0, dash: 0 };
  const remoteIn = new Map();

  // ---------------- simulation (solo player or room/match host) ----------------
  function makeSim(players, to) {
    const s = { players: players.map((p, i) => ({ id: p.id, name: p.name, bot: !!p.bot, slot: i, x: CX, y: CY, vx: 0, vy: 0, alive: true, fall: 0, dashT: 0, cd: 0, face: 0, wins: 0, inp: { dx: 0, dy: 0, dash: 0 }, lastDash: 0, ai: { t: 0, tx: 0, ty: 0 } })), R: R0, phase: "ready", t: 0, tFight: 0, ready: 2.4, round: 1, to, ev: [], over: 0, winner: -1, matchOver: false, lastWinner: -1 };
    startRound(s); return s;
  }
  function startRound(s) {
    const n = s.players.length; s.R = R0; s.phase = "ready"; s.ready = 2.2; s.tFight = 0; s.over = 0; s.lastWinner = -1;
    s.players.forEach((p, i) => { const a = (i / n) * Math.PI * 2 + (n === 2 ? Math.PI / 2 : Math.PI / 4); p.x = CX + Math.cos(a) * 150; p.y = CY + Math.sin(a) * 150; p.vx = p.vy = 0; p.alive = true; p.fall = 0; p.dashT = 0; p.cd = 0.4; p.face = a + Math.PI; });
  }
  function aiInput(s, p, dt) {
    const a = p.ai, par = { easy: { rt: 0.35, dash: 0.25, edge: 55 }, medium: { rt: 0.18, dash: 0.55, edge: 85 }, hard: { rt: 0.08, dash: 0.9, edge: 110 } }[level] || {};
    a.t -= dt; const dc = Math.hypot(p.x - CX, p.y - CY);
    let tx = CX, ty = CY, wantDash = false;
    const foes = s.players.filter((q) => q !== p && q.alive); if (!foes.length) return { dx: 0, dy: 0, dash: 0 };
    if (a.t <= 0) { a.t = par.rt; let best = null, bd = 1e9; for (const q of foes) { const d = Math.hypot(q.x - p.x, q.y - p.y) - Math.hypot(q.x - CX, q.y - CY) * 0.6; if (d < bd) { bd = d; best = q; } } a.target = best; }
    const q = a.target && a.target.alive ? a.target : foes[0];
    const qd = Math.hypot(q.x - CX, q.y - CY) || 1, ox = (q.x - CX) / qd, oy = (q.y - CY) / qd; // outward direction at the target
    const behindX = q.x - ox * (PR * 2 + 6), behindY = q.y - oy * (PR * 2 + 6); // stand on the ring-centre side of them and push outward
    tx = behindX; ty = behindY;
    const toQ = Math.hypot(q.x - p.x, q.y - p.y);
    if (toQ < PR * 2 + 70) { tx = q.x; ty = q.y; }
    if (dc > s.R - par.edge) { tx = CX + (p.x - CX) * 0.3; ty = CY + (p.y - CY) * 0.3; } // too close to the edge: come back in
    if (toQ < 120 && toQ > PR * 2 && p.cd <= 0 && dc < s.R - par.edge * 0.8 && Math.random() < par.dash * dt * 3.5) wantDash = true;
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    p.face = Math.atan2(q.y - p.y, q.x - p.x);
    return { dx: dx / d, dy: dy / d, dash: wantDash ? p.lastDash + 1 : p.lastDash };
  }
  function stepSim(s, dt) {
    s.t += dt;
    if (s.phase === "ready") { s.ready -= dt; if (s.ready <= 0) { s.phase = "fight"; s.ev.push(["go"]); } }
    else if (s.phase === "fight") { s.tFight += dt; if (s.tFight > 10) s.R = Math.max(RMIN, R0 - (s.tFight - 10) * 6); }
    else if (s.phase === "over") { s.over -= dt; if (s.over <= 0) { if (s.matchOver) { s.phase = "end"; s.ev.push(["end"]); } else { s.round++; startRound(s); } } }
    const live = s.phase === "fight" || s.phase === "over";
    for (const p of s.players) {
      if (p.fall > 0 || !p.alive) { if (p.fall > 0) p.fall += dt; p.x += p.vx * dt; p.y += p.vy * dt; continue; }
      let inp = p.bot ? aiInput(s, p, dt) : p.inp; if (s.phase !== "fight") inp = { dx: 0, dy: 0, dash: p.lastDash };
      const len = Math.hypot(inp.dx, inp.dy);
      if (len > 0.05) { p.vx += (inp.dx / len) * ACC * dt; p.vy += (inp.dy / len) * ACC * dt; if (!p.bot) p.face = Math.atan2(inp.dy, inp.dx); }
      if (inp.dash !== p.lastDash) { p.lastDash = inp.dash; if (p.cd <= 0 && s.phase === "fight") { const f = len > 0.05 ? Math.atan2(inp.dy, inp.dx) : p.face; p.vx += Math.cos(f) * DASH_V; p.vy += Math.sin(f) * DASH_V; p.dashT = 0.24; p.cd = 1.5; p.face = f; s.ev.push(["dash", p.slot]); } }
      p.cd = Math.max(0, p.cd - dt); p.dashT = Math.max(0, p.dashT - dt);
      const f = Math.exp(-FRIC * dt * (p.dashT > 0 ? 0.35 : 1)); p.vx *= f; p.vy *= f;
      const sp = Math.hypot(p.vx, p.vy), cap = p.dashT > 0 ? 950 : VMAX; if (sp > cap) { p.vx *= cap / sp; p.vy *= cap / sp; }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    // bodies push each other
    for (let i = 0; i < s.players.length; i++) for (let j = i + 1; j < s.players.length; j++) {
      const a = s.players[i], b = s.players[j]; if (!a.alive || !b.alive || a.fall || b.fall) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = PR * 2;
      if (d < min && d > 0) {
        const nx = dx / d, ny = dy / d, rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny, push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        if (rel < 0) {
          const e = 1.0, j2 = (-(1 + e) * rel) / 2; let ba = 0, bb = 0; if (a.dashT > 0) bb = 260; if (b.dashT > 0) ba = 260;
          a.vx -= nx * (j2 + ba); a.vy -= ny * (j2 + ba); b.vx += nx * (j2 + bb); b.vy += ny * (j2 + bb);
          s.ev.push(["bonk", Math.abs(rel) + ba + bb, (a.x + b.x) / 2, (a.y + b.y) / 2]);
        }
      }
    }
    if (s.phase === "fight") {
      for (const p of s.players) if (p.alive && Math.hypot(p.x - CX, p.y - CY) > s.R + PR * 0.55) { p.alive = false; p.fall = 0.001; s.ev.push(["fall", p.slot]); }
      const alive = s.players.filter((p) => p.alive);
      if (alive.length <= 1) {
        s.phase = "over"; s.over = 2.4;
        if (alive.length === 1) { alive[0].wins++; s.lastWinner = alive[0].slot; s.ev.push(["round", alive[0].slot]); } else { s.lastWinner = -1; s.ev.push(["round", -1]); }
        const champ = s.players.find((p) => p.wins >= s.to); if (champ) { s.matchOver = true; s.winner = champ.slot; }
      }
    }
  }
  function snapshot(s) { return { k: "s", p: s.players.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.vx), Math.round(p.vy), p.alive ? 1 : 0, Math.round(p.fall * 100) / 100, Math.round(p.dashT * 100) / 100, Math.round(p.cd * 100) / 100, p.wins, Math.round(p.face * 100) / 100]), R: Math.round(s.R), ph: s.phase, rd: s.round, rdy: Math.round(s.ready * 100) / 100, lw: s.lastWinner, w: s.winner, ev: pendingEv.splice(0) }; }

  // ---------------- drawing ----------------
  const proj = (x, y) => [x, CY + (y - CY) * TILT];
  function drawRing(R) {
    const bg = ctx.createRadialGradient(CX, CY, 60, CX, CY, 520); bg.addColorStop(0, "#2a2140"); bg.addColorStop(1, "#0d0a14"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // dojo floor planks
    ctx.strokeStyle = "rgba(255,255,255,.04)"; ctx.lineWidth = 2; for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    // platform (the dohyo)
    ctx.save(); ctx.translate(CX, CY); ctx.scale(1, TILT);
    ctx.fillStyle = "#3a2a18"; ctx.beginPath(); ctx.arc(0, 38, R0 + 24, 0, 7); ctx.fill(); // clay base
    ctx.fillStyle = "#6a4a28"; ctx.beginPath(); ctx.arc(0, 18, R0 + 24, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(0, -20, 40, 0, 0, R0 + 20); g.addColorStop(0, "#e4cf9a"); g.addColorStop(1, "#c9aa6a");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R0 + 20, 0, 7); ctx.fill();
    ctx.restore();
    // the shrinking fighting ring
    ctx.save(); ctx.translate(CX, CY); ctx.scale(1, TILT);
    ctx.fillStyle = "#d8bd7a"; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(120,80,30,.25)"; ctx.lineWidth = 2; for (let r = 40; r < R; r += 40) { ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); }
    ctx.strokeStyle = "#8a2a1c"; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke(); // straw rope
    ctx.strokeStyle = "#e8cf90"; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 4; for (const dx of [-26, 26]) { ctx.beginPath(); ctx.moveTo(dx, -8); ctx.lineTo(dx, 8); ctx.stroke(); } // the two start lines
    ctx.restore();
    // the shrunken-away part is dark
    if (R < R0) { ctx.save(); ctx.translate(CX, CY); ctx.scale(1, TILT); ctx.fillStyle = "rgba(20,10,0,.55)"; ctx.beginPath(); ctx.arc(0, 0, R0 + 20, 0, 7); ctx.arc(0, 0, R, 0, 7, true); ctx.fill("evenodd"); ctx.restore(); }
  }
  function drawFighter(p, idx, s) {
    const col = COLS[idx % 4], [x, y0] = proj(p.x, p.y);
    let y = y0, sc = 1, alpha = 1, rot = 0;
    if (p.fall > 0) { const k = Math.min(1, p.fall / 0.9); sc = 1 - k * 0.7; y += k * 160; alpha = 1 - k * 0.8; rot = k * 2.4; }
    if (alpha <= 0.05) return;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(x, y0 + 6, PR * 0.95 * sc, PR * 0.4 * sc, 0, 0, 7); ctx.fill();
    const flip = Math.cos(p.face) < 0, dashing = p.dashT > 0;
    ctx.translate(x, y - 44 * sc); ctx.rotate(rot + (dashing ? Math.cos(p.face) * 0.25 : 0)); ctx.scale(sc * 1.25, sc * 1.25);
    TA.draw(ctx, 0, 0, 82, { pal: col.pal, flip, bat: 0.8, mouth: dashing ? "open" : p.alive ? "smile" : "sad", eyes: p.alive ? "normal" : "x", look: [Math.cos(p.face), Math.sin(p.face) * 0.5], legs: performance.now() / 150 + idx, parts: { legs: true, armFar: true, face: true, bat: false } });
    ctx.fillStyle = col.belt; ctx.fillRect(-14, 18, 28, 8); // the mawashi belt in your colour
    ctx.restore();
    if (dashing) { ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - Math.cos(p.face) * (34 + i * 12), y0 - 30 - Math.sin(p.face) * (14 + i * 6) + i * 6 - 6); ctx.lineTo(x - Math.cos(p.face) * (60 + i * 12), y0 - 30 - Math.sin(p.face) * (20 + i * 6) + i * 6 - 6); ctx.stroke(); } }
    if (p.alive || p.fall < 0.4) { ctx.font = "800 13px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.strokeText(p.name, x, y0 - 98); ctx.fillStyle = col.belt; ctx.fillText(p.name, x, y0 - 98); }
  }
  function render() {
    const s = role === "guest" ? view : sim; if (!s) { ctx.fillStyle = "#14101c"; ctx.fillRect(0, 0, W, H); return; }
    ctx.save(); if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 14);
    drawRing(s.R);
    const order = s.players.map((p, i) => [p, i]).sort((a, b) => a[0].y - b[0].y);
    for (const [p, i] of order) drawFighter(p, i, s);
    for (const q of parts) { ctx.globalAlpha = Math.max(0, q.life * 2); ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
    for (const q of pops) { const k = (performance.now() - q.t) / 900; ctx.globalAlpha = 1 - k; ctx.font = "900 28px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 6; ctx.strokeStyle = "#111"; ctx.strokeText(q.text, q.x, q.y - k * 40); ctx.fillStyle = "#ffd23f"; ctx.fillText(q.text, q.x, q.y - k * 40); } ctx.globalAlpha = 1;
    ctx.restore();
    // HUD: the dash meter and the round banner
    const me = s.players[myIdx];
    if (me) { ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.beginPath(); ctx.roundRect(14, H - 40, 170, 26, 10); ctx.fill(); ctx.fillStyle = me.cd <= 0 ? "#7df08f" : "#ffd23f"; ctx.beginPath(); ctx.roundRect(17, H - 37, 164 * (1 - Math.min(1, me.cd / 1.5)), 20, 8); ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = "800 12px sans-serif"; ctx.textAlign = "left"; ctx.fillText(me.cd <= 0 ? "SHOVE READY (Space)" : "recharging…", 24, H - 23); }
    ctx.textAlign = "center"; ctx.lineWidth = 9; ctx.strokeStyle = "#111";
    const say = (t, col) => { ctx.font = "900 70px sans-serif"; ctx.strokeText(t, W / 2, 96); ctx.fillStyle = col; ctx.fillText(t, W / 2, 96); };
    if (s.phase === "ready") say(s.ready > 0.9 ? `ROUND ${s.rd || s.round}` : "FIGHT!", "#ffd23f");
    else if (s.phase === "over") { const w = s.lastWinner; if (w >= 0 && s.players[w]) say(`${s.players[w].name} wins the round!`.slice(0, 26), COLS[w % 4].belt); else say("DRAW", "#fff"); }
    const sc = s.players.map((p, i) => `${p.name.slice(0, 8)} ${p.wins}`).join("  ·  ");
    $("scoreChip").textContent = sc; $("roundChip").textContent = `Round ${s.rd || s.round} · first to ${roundsTo}`;
  }

  // ---------------- flow ----------------
  function handleEv(list, s) {
    for (const e of list) {
      if (e[0] === "bonk") { shake = Math.min(1, e[1] / 700); beep(110 + Math.min(120, e[1] * 0.1), 0.14, "square", 0.1, 0.4); const [x, y] = proj(e[2], e[3]); for (let i = 0; i < 8; i++) parts.push({ x, y: y - 20, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 200, life: 0.5, r: 3, col: "#ffd23f" }); if (e[1] > 450) pops.push({ x, y: y - 60, text: "BONK!", t: performance.now() }); }
      else if (e[0] === "dash") beep(300, 0.18, "sawtooth", 0.05, 2);
      else if (e[0] === "fall") beep(600, 0.7, "sine", 0.07, 0.2);
      else if (e[0] === "round") { beep(e[1] === myIdx ? 740 : 220, 0.5, "triangle", 0.1, e[1] === myIdx ? 1.6 : 0.5); }
      else if (e[0] === "go") beep(520, 0.25, "square", 0.08, 1.8);
    }
  }
  function readInput() {
    let dx = (keys.d || keys.right ? 1 : 0) - (keys.a || keys.left ? 1 : 0) + joy.x, dy = (keys.s || keys.down ? 1 : 0) - (keys.w || keys.up ? 1 : 0) + joy.y;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    myInput.dx = dx; myInput.dy = dy;
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.033, last ? (t - last) / 1000 : 0.016); last = t;
    readInput(); shake = Math.max(0, shake - dt * 3);
    for (const q of parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 500 * dt; q.life -= dt; } parts = parts.filter((q) => q.life > 0); pops = pops.filter((q) => performance.now() - q.t < 900);
    if (running) {
      if (role === "solo" || role === "host") {
        sim.players[myIdx].inp = { dx: myInput.dx, dy: myInput.dy, dash: dashCount };
        for (const [id, inp] of remoteIn) { const p = sim.players.find((q) => q.id === id); if (p) p.inp = inp; }
        const sub = 2; for (let i = 0; i < sub; i++) stepSim(sim, dt / sub);
        if (sim.ev.length) { handleEv(sim.ev, sim); if (role === "host") pendingEv.push(...sim.ev); sim.ev = []; }
        if (role === "host") { sendAcc += dt; if (sendAcc > 0.033) { sendAcc = 0; np.send(snapshot(sim)); } }
        if (sim.phase === "end" && !over) endMatch();
      } else if (role === "guest" && view) {
        sendAcc += dt; if (sendAcc > 0.033) { sendAcc = 0; np.send({ k: "in", dx: Math.round(myInput.dx * 100) / 100, dy: Math.round(myInput.dy * 100) / 100, dash: dashCount }); }
        const age = Math.min(0.12, (performance.now() - snapAt) / 1000);
        view.players.forEach((p, i) => { const n = view.target[i]; const k = Math.min(1, dt * 18); const tx = n.x + n.vx * age, ty = n.y + n.vy * age; p.x += (tx - p.x) * k; p.y += (ty - p.y) * k; p.vx = n.vx; p.vy = n.vy; });
      }
    }
    render();
  }
  function endMatch() {
    over = true; running = false; role === "guest" ? 0 : 0;
    const s = sim || view; const wins = s.players.map((p) => p.wins), iWon = s.winner === myIdx;
    if (role === "solo") {
      if (window.TungMP) TungMP.submitSolo({ game: "sumo", result: iWon ? "win" : "loss" });
      showResult(iWon ? "🏆 Champion!" : "💀 You were thrown out", `Rounds won: ${s.players.map((p) => `${p.name} ${p.wins}`).join(", ")}`, [["Fight again", startSolo], ["Menu", toMenu]]);
    } else {
      if (role === "host") np.send(snapshot(sim));
      const ranking = s.players.map((p, i) => ({ id: p.id, w: p.wins, win: i === s.winner })).sort((a, b) => (b.win - a.win) || (b.w - a.w)).map((x) => x.id);
      np.report({ score: wins[myIdx], ranking });
      if (np.kind === "room") showResult(iWon ? "🏆 You win!" : "Match over", `${s.players.map((p) => `${p.name} ${p.wins}`).join("  ·  ")}`, [["Back to the room", () => { hideResult(); np.setPlaying(false); }]]);
    }
  }
  function showResult(title, sub, buttons) { const r = $("result"); r.innerHTML = `<h2>${title}</h2><p>${sub}</p><div class="btn-row"></div>`; r.hidden = false; for (const [label, fn] of buttons) { const b = document.createElement("button"); b.className = "btn" + (label === "Menu" ? " secondary" : ""); b.textContent = label; b.onclick = fn; r.querySelector(".btn-row").append(b); } }
  const hideResult = () => { $("result").hidden = true; };

  function begin(newRole, players, to) {
    role = newRole; over = false; hideResult(); roundsTo = to; parts = []; pops = []; dashCount = 0; remoteIn.clear();
    sim = role === "guest" ? null : makeSim(players, to);
    view = role === "guest" ? { players: players.map((p, i) => ({ id: p.id, name: p.name, slot: i, x: CX, y: CY, vx: 0, vy: 0, alive: true, fall: 0, dashT: 0, cd: 0, wins: 0, face: 0 })), target: players.map(() => ({ x: CX, y: CY, vx: 0, vy: 0 })), R: R0, phase: "ready", round: 1, ready: 3, lastWinner: -1 } : null;
    myIdx = players.findIndex((p) => p.me); running = true; cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame);
  }
  function startSolo() {
    level = $("level").value; const nb = Number($("bots").value), names = ["Tralalero", "Bombardiro", "Cappuccino"];
    const players = [{ id: "me", name: (window.TungMP && TungMP.user ? TungMP.user.username : "You"), me: true }];
    for (let i = 0; i < nb; i++) players.push({ id: "bot" + i, name: names[i], bot: true });
    np.setPlaying(true); begin("solo", players, Number($("rounds").value));
  }
  function toMenu() { running = false; cancelAnimationFrame(raf); role = "idle"; hideResult(); np.setPlaying(false); }
  $("startBtn").addEventListener("click", startSolo);
  $("quitBtn").addEventListener("click", () => { if (np.kind) np.leave(); else toMenu(); });
  const KM = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  document.addEventListener("keydown", (e) => {
    if (role === "idle") return;
    if (KM[e.code]) { e.preventDefault(); keys[KM[e.code]] = true; }
    if ((e.code === "Space" || e.code === "ShiftLeft" || e.code === "ShiftRight") && !e.repeat) { e.preventDefault(); dashCount++; }
    if (e.code === "Escape" && role === "solo") toMenu();
  });
  document.addEventListener("keyup", (e) => { if (KM[e.code]) keys[KM[e.code]] = false; });
  TouchPad.mount($("pad"), { onMove: (x, y) => { joy = { x, y }; }, buttons: [{ label: "💥 Shove", onDown: () => { dashCount++; } }] });

  // ---------------- multiplayer ----------------
  const asPlayers = (ctx) => ctx.players.map((p) => ({ id: p.id, name: p.name, me: p.id === ctx.me.id }));
  np = NetPlay.attach({
    game: "sumo", rooms: true, panel: $("mpPanel"), menu: $("menu"), play: $("play"),
    onModeChange() { if (role === "solo") toMenu(); },
    onPrepare(ctx) { ctxInfo = ctx; begin(ctx.host ? "host" : "guest", asPlayers(ctx), ctx.opts.rounds); if (sim) { sim.phase = "ready"; sim.ready = 99; } running = true; },
    onStart() { if (sim) { sim.ready = 1.8; sim.phase = "ready"; } },
    onStop() { },
    onExit() { running = false; cancelAnimationFrame(raf); role = "idle"; hideResult(); },
    onNet(from, d) {
      if (!d) return;
      if (role === "host" && d.k === "in") remoteIn.set(from, { dx: clamp(+d.dx || 0, -1, 1), dy: clamp(+d.dy || 0, -1, 1), dash: d.dash | 0 });
      else if (role === "guest" && d.k === "s" && view) {
        snapAt = performance.now();
        d.p.forEach((a, i) => { const p = view.players[i]; if (!p) return; const first = !view.seen; p.vx = a[2]; p.vy = a[3]; view.target[i] = { x: a[0], y: a[1], vx: a[2], vy: a[3] }; if (first || Math.hypot(p.x - a[0], p.y - a[1]) > 120) { p.x = a[0]; p.y = a[1]; } p.alive = !!a[4]; p.fall = a[5]; p.dashT = a[6]; p.cd = a[7]; p.wins = a[8]; p.face = a[9]; });
        view.seen = true; view.R = d.R; view.phase = d.ph; view.rd = d.rd; view.ready = d.rdy; view.lastWinner = d.lw; view.winner = d.w;
        handleEv(d.ev || [], view);
        if (d.ph === "end" && !over) { view.winner = d.w; endMatch(); }
      }
    },
    onLeft(id) { if (sim) { const p = sim.players.find((q) => q.id === id); if (p && p.alive) { p.alive = false; p.fall = 0.001; } } },
    onRoomEnd(m) { running = false; const rows = m.ranking.map((r) => `<tr class="${r.place === 1 ? "win" : ""}"><td>${r.place}</td><td>${NetPlay.avatarHtml(r.avatar)} ${NetPlay.esc(r.username)}</td></tr>`).join(""); showResult(m.reason === "host_left" ? "Host left" : (m.ranking[0].id === m.you ? "🏆 You win!" : "Match over"), `<table>${rows}</table>`, [["Back to the room", () => { hideResult(); np.setPlaying(false); }]]); },
  });
  window.__sumo = () => ({ sim, view, role, myIdx, step: (dt) => { sim.players[myIdx].inp = { dx: myInput.dx, dy: myInput.dy, dash: dashCount }; stepSim(sim, dt); sim.ev = []; if (sim.phase === "end" && !over) endMatch(); }, input: (dx, dy) => { myInput.dx = dx; myInput.dy = dy; }, dash: () => { dashCount++; }, setLevel: (l) => { level = l; } });
})();
