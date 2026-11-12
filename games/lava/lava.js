(() => {
  const Sim = window.LavaSim, TA = window.TungArt;
  const { W, H, EVENTS, EVENT_IDS, ITEMS, ITEM_INFO } = Sim;
  const $ = (id) => document.getElementById(id);
  const cv = $("view"), ctx = cv.getContext("2d");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const COLS = [{ pal: undefined, belt: "#ffcc33" }, { pal: "blue", belt: "#4cc9f0" }, { pal: "red", belt: "#ff6b6b" }, { pal: "green", belt: "#7df08f" }];
  const KINDS = Sim.KINDS, DECOS = Sim.DECOS;
  let audio;
  function beep(f, d, type = "sine", v = 0.07, slide = 0.5) { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t + d); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.02); } catch (_) {} }

  let role = "idle", sim = null, V = null, meta = [], myIdx = 0, np = null, running = false, raf = 0, last = 0, over = false, level = "medium", chaos = "normal", roundsTo = 2;
  let shake = 0, parts = [], pops = [], sendAcc = 0, snapAt = 0, ctxInfo = null, ink = [], tClock = 0, lastEvAnnounce = -1;
  const keys = {}; let joy = { x: 0, y: 0 }, my = { dx: 0, jh: false, jn: 0, sw: 0, it: 0 }, touchJump = 0;
  const remoteIn = new Map();

  // ---------------- turning a snapshot into something to draw ----------------
  function emptyView(players) {
    return { ph: "ready", rd: 1, rdy: 2.4, lw: -1, w: -1, t: 0, lv: 600, to: roundsTo, wd: 1, plats: [], items: [], hz: [], evs: [], seen: false,
      players: players.map((p, i) => ({ x: 480, y: 520, vx: 0, vy: 0, alive: true, face: 1, sw: -1, stun: 0, fx: 0, item: -1, wins: 0, ink: 0, inv: 0, name: p.name, gear: p.gear, slot: i, tx: 480, ty: 520 })) };
  }
  function decode(d, into) {
    const v = into || V; v.ph = d.ph; v.rd = d.rd; v.rdy = d.rdy; v.lw = d.lw; v.w = d.w; v.t = d.t; v.lv = d.lv; v.to = d.to || v.to; v.wd = d.wd;
    d.p.forEach((a, i) => { const p = v.players[i]; if (!p) return; const first = !v.seen; p.vx = a[2]; p.vy = a[3]; p.tx = a[0]; p.ty = a[1]; if (first || Math.hypot(p.x - a[0], p.y - a[1]) > 140) { p.x = a[0]; p.y = a[1]; } p.alive = !!a[4]; p.face = a[5]; p.sw = a[6]; p.stun = a[7]; p.fx = a[8]; p.item = a[9]; p.wins = a[10]; p.ink = a[11]; p.inv = a[12]; });
    v.plats = d.pl.map((a) => ({ x: a[0], y: a[1], w: a[2], kind: KINDS[a[3]], gone: !!a[4], shake: !!a[5], deco: DECOS[a[6]] }));
    v.items = d.it.map((a) => ({ x: a[0], y: a[1], type: ITEMS[a[2]] }));
    v.hz = d.hz; v.evs = d.evs.map((e) => ({ id: EVENT_IDS[e[0]], t0: e[1], dur: e[2] })); v.seen = true;
  }
  const evActive = (id) => V && V.evs.some((e) => e.id === id && V.t >= e.t0 && V.t < e.t0 + e.dur);

  // ---------------- drawing ----------------
  function drawBackdrop(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#1a0b1c"); g.addColorStop(0.6, "#2c1118"); g.addColorStop(1, "#40150f"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,.035)"; ctx.lineWidth = 2; for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // a window with the sky going red
    ctx.fillStyle = "rgba(255,90,40,.10)"; ctx.fillRect(380, 60, 200, 150); ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.strokeRect(380, 60, 200, 150); ctx.beginPath(); ctx.moveTo(480, 60); ctx.lineTo(480, 210); ctx.moveTo(380, 135); ctx.lineTo(580, 135); ctx.stroke();
  }
  function drawLava(lv, t) {
    // the glow above the surface
    const g = ctx.createLinearGradient(0, lv - 170, 0, lv); g.addColorStop(0, "rgba(255,90,20,0)"); g.addColorStop(1, "rgba(255,110,30,.30)"); ctx.fillStyle = g; ctx.fillRect(0, lv - 170, W, 170);
    const body = ctx.createLinearGradient(0, lv, 0, H); body.addColorStop(0, "#ff9a2a"); body.addColorStop(0.15, "#ff5a14"); body.addColorStop(1, "#8a0e00");
    ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(0, H + 10);
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, lv + Math.sin(x * 0.03 + t * 2.2) * 4 + Math.sin(x * 0.011 - t * 1.3) * 5);
    ctx.lineTo(W, H + 10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,230,120,.75)"; ctx.lineWidth = 3; ctx.beginPath(); for (let x = 0; x <= W; x += 16) { const y = lv + Math.sin(x * 0.03 + t * 2.2) * 4 + Math.sin(x * 0.011 - t * 1.3) * 5; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    ctx.fillStyle = "rgba(255,210,90,.35)"; for (let i = 0; i < 14; i++) { const x = (i * 97 + t * 14 * (i % 3 + 1)) % W, y = lv + 14 + ((i * 53 + t * 20) % Math.max(20, H - lv)); ctx.beginPath(); ctx.arc(x, y, 3 + (i % 3), 0, 7); ctx.fill(); }
  }
  const DECO_COL = { couch: "#b84a4a", table: "#8a5a2a", shelf: "#6a4a2a", bed: "#e8e0d0", crate: "#b9803c", tv: "#1a1c2a", rug: "#c04a7a" };
  function drawPlat(pl, t) {
    let { x, y, w } = pl; const h = 16, alpha = pl.gone ? clamp(1 - (y - 160) / 500, 0, 1) : 1;
    if (alpha <= 0.02 || y > H + 40) return;
    if (pl.shake) { x += (Math.random() - 0.5) * 4; y += Math.random() * 2; }
    ctx.save(); ctx.globalAlpha = alpha;
    const base = pl.kind === "ice" ? "#9fd8f2" : DECO_COL[pl.deco] || "#8a6a4a";
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(x + 4, y + h, w - 6, 6);
    switch (pl.deco) {
      case "couch": ctx.fillStyle = base; ctx.beginPath(); ctx.roundRect(x, y, w, h + 8, 7); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.14)"; for (let cx = x + 6; cx < x + w - 10; cx += 34) ctx.fillRect(cx, y + 2, 28, 7); ctx.fillStyle = "#8f3636"; ctx.fillRect(x - 5, y - 8, 12, h + 18); ctx.fillRect(x + w - 7, y - 8, 12, h + 18); break;
      case "table": ctx.fillStyle = base; ctx.beginPath(); ctx.roundRect(x, y, w, 10, 3); ctx.fill(); ctx.fillStyle = "#5e3a18"; ctx.fillRect(x + 8, y + 10, 7, 24); ctx.fillRect(x + w - 15, y + 10, 7, 24); break;
      case "shelf": ctx.fillStyle = base; ctx.fillRect(x, y, w, h + 6); for (let bx = x + 5; bx < x + w - 10; bx += 11) { ctx.fillStyle = ["#d04a3a", "#3a7ad0", "#e0b43a", "#4aa84a"][Math.floor(bx / 11) % 4]; ctx.fillRect(bx, y + 3, 8, h - 3); } break;
      case "bed": ctx.fillStyle = base; ctx.beginPath(); ctx.roundRect(x, y, w, 14, 5); ctx.fill(); ctx.fillStyle = "#3a68b0"; ctx.fillRect(x + w * 0.3, y, w * 0.7, 14); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(x + 4, y - 4, 30, 10, 5); ctx.fill(); ctx.fillStyle = "#5e3a18"; ctx.fillRect(x, y + 14, 6, 10); ctx.fillRect(x + w - 6, y + 14, 6, 10); break;
      case "crate": ctx.fillStyle = base; ctx.fillRect(x, y, w, h + 8); ctx.strokeStyle = "#6e4a1c"; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h + 5); ctx.beginPath(); for (let cx = x; cx < x + w; cx += 24) { ctx.moveTo(cx, y); ctx.lineTo(cx + 24, y + h + 8); } ctx.stroke(); break;
      case "tv": ctx.fillStyle = base; ctx.beginPath(); ctx.roundRect(x, y, w, h + 6, 5); ctx.fill(); ctx.shadowColor = "#4fd8ff"; ctx.shadowBlur = 10; ctx.fillStyle = `hsl(${(t * 60 + x) % 360},70%,45%)`; ctx.fillRect(x + 5, y + 3, w - 10, h - 2); break;
      default: ctx.fillStyle = base; ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.3)"; for (let cx = x + 6; cx < x + w - 6; cx += 14) ctx.fillRect(cx, y + 5, 7, 5);
    }
    ctx.shadowBlur = 0;
    if (pl.kind === "ice") { ctx.fillStyle = "rgba(210,245,255,.6)"; ctx.fillRect(x, y, w, 6); ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fillRect(x + 8, y + 2, w * 0.35, 3); }
    else if (pl.kind === "crumble") { ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w * 0.25, y); ctx.lineTo(x + w * 0.32, y + 10); ctx.lineTo(x + w * 0.22, y + 20); ctx.moveTo(x + w * 0.7, y); ctx.lineTo(x + w * 0.64, y + 11); ctx.lineTo(x + w * 0.72, y + 22); ctx.stroke(); }
    else if (pl.kind === "move") { ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = "900 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("◂ ▸", x + w / 2, y + h + 12); }
    else if (pl.kind === "bounce") { ctx.fillStyle = "#ff6b5e"; ctx.fillRect(x, y - 3, w, 5); ctx.strokeStyle = "#ddd"; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(x + w * 0.3, y + 6 + i * 5); ctx.lineTo(x + w * 0.7, y + 9 + i * 5); } ctx.stroke(); }
    if (evActive("ice") && pl.kind !== "ice") { ctx.fillStyle = "rgba(190,235,255,.5)"; ctx.fillRect(x, y - 1, w, 5); }
    ctx.restore();
  }
  function drawItem(it, t) {
    const info = ITEM_INFO[it.type], bob = Math.sin(t * 4 + it.x) * 3;
    ctx.save(); ctx.shadowColor = "#ffe27a"; ctx.shadowBlur = 14; ctx.fillStyle = "rgba(255,244,190,.92)"; ctx.beginPath(); ctx.arc(it.x, it.y + bob, 16, 0, 7); ctx.fill(); ctx.restore();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(it.x, it.y + bob, 16, 0, 7); ctx.stroke();
    ctx.font = "18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000"; ctx.fillText(info.icon, it.x, it.y + 1 + bob); ctx.textBaseline = "alphabetic";
  }
  function drawHazards(t) {
    for (const h of V.hz) {
      const k = h[0];
      if (k === "m" || k === "f") { const x = h[1], y = h[2], fire = k === "f"; ctx.save(); const g = ctx.createRadialGradient(x, y, 2, x, y, 26); g.addColorStop(0, "#fff6b0"); g.addColorStop(0.4, fire ? "#ff9a2a" : "#ff6a2a"); g.addColorStop(1, "rgba(255,60,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, fire ? 20 : 26, 0, 7); ctx.fill(); ctx.fillStyle = fire ? "#ffcf6a" : "#4a3328"; ctx.beginPath(); ctx.arc(x, y, fire ? 8 : 13, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(255,150,40,.5)"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 14, y - 50); ctx.stroke(); ctx.restore(); }
      else if (k === "b") { const x = h[1], tt = h[2]; if (tt < 0) { ctx.fillStyle = `rgba(255,255,120,${0.12 + 0.18 * Math.abs(Math.sin(t * 20))})`; ctx.fillRect(x - 32, 0, 64, H); ctx.strokeStyle = "rgba(255,255,160,.7)"; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]); } else { ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillRect(x - 32, 0, 64, H); ctx.strokeStyle = "#fffbb0"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, 0); for (let y = 30; y < H; y += 40) ctx.lineTo(x + (Math.random() - 0.5) * 34, y); ctx.stroke(); } }
      else if (k === "g") { const x = h[1], tt = h[2]; if (tt < 0) { ctx.fillStyle = `rgba(255,150,40,${0.35 + 0.3 * Math.sin(t * 18)})`; ctx.beginPath(); ctx.ellipse(x, V.lv, 38, 11, 0, 0, 7); ctx.fill(); } else { const hh = 270 * Math.min(1, tt * 6) * (1 - Math.max(0, (tt - 0.7) * 4)); const gr = ctx.createLinearGradient(0, V.lv - hh, 0, V.lv); gr.addColorStop(0, "#fff0a0"); gr.addColorStop(1, "#ff5a14"); ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(x - 26, V.lv - hh, 52, hh + 12, 24); ctx.fill(); } }
      else if (k === "p") { ctx.font = "20px sans-serif"; ctx.textAlign = "center"; ctx.fillText("🍌", h[1], h[2] + 4); }
      else if (k === "s") { const x = h[1], y = h[2], d = h[3]; ctx.fillStyle = "rgba(255,70,60,.22)"; ctx.fillRect(0, y, W, 112); ctx.save(); ctx.translate(x, y + 56); ctx.scale(d, 1); ctx.fillStyle = "#c58a4a"; ctx.strokeStyle = "#5e3a18"; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(-150, -26, 230, 52, 22); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#8c5a2a"; ctx.fillRect(-150, -26, 36, 52); ctx.restore(); }
      else if (k === "t") { const x = h[1], y = h[2]; ctx.save(); ctx.strokeStyle = "rgba(220,230,255,.8)"; ctx.lineWidth = 4; for (let i = 0; i < 9; i++) { const yy = y - 260 + i * 60, r = 18 + i * 9; ctx.beginPath(); ctx.ellipse(x + Math.sin(t * 6 + i) * 10, yy, r, r * 0.28, 0, 0, 7); ctx.stroke(); } ctx.restore(); }
    }
  }
  function drawFighter(p, idx, t) {
    const col = COLS[p.slot % 4];
    if (!p.alive && p.y > V.lv + 70) return;
    ctx.save();
    if (!p.alive) { ctx.beginPath(); ctx.rect(0, 0, W, V.lv + 6); ctx.clip(); ctx.globalAlpha = 0.9; }
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 13, 4, 0, 0, 7); ctx.fill();
    const moving = Math.abs(p.vx) > 40, swinging = p.sw >= 0, bat = swinging ? -0.9 + 2.9 * Math.sin(Math.min(1, p.sw) * Math.PI / 2) : 0.55;
    if (p.fx & 4) { ctx.fillStyle = "rgba(120,210,255,.22)"; ctx.strokeStyle = "rgba(160,230,255,.9)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y - 44, 40, 0, 7); ctx.fill(); ctx.stroke(); }
    if (p.fx & 1) { ctx.fillStyle = "rgba(255,170,40,.9)"; ctx.beginPath(); ctx.moveTo(p.x - 8, p.y); ctx.lineTo(p.x, p.y + 38 + Math.random() * 14); ctx.lineTo(p.x + 8, p.y); ctx.fill(); }
    ctx.translate(p.x, p.y - 48); if (p.stun > 0) ctx.rotate(Math.sin(t * 24) * 0.12); if (!p.alive) ctx.rotate(0.6);
    TA.draw(ctx, 0, 0, 100, { gear: p.gear, pal: col.pal, flip: p.face < 0, bat, mouth: p.alive ? (swinging ? "open" : "smile") : "oh", eyes: p.alive ? (p.stun > 0 ? "x" : "normal") : "x", look: [p.face, 0.2], legs: moving ? performance.now() / 160 + idx : 0, parts: { legs: true, armFar: true, face: true, bat: true } });
    ctx.restore();
    if (p.alive) {
      ctx.font = "800 12px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.strokeText(p.name, p.x, p.y - 108); ctx.fillStyle = col.belt; ctx.fillText(p.name, p.x, p.y - 108);
      const on = []; if (p.fx & 2) on.push("🦘"); if (p.fx & 8) on.push("🏏"); if (p.fx & 16) on.push("🥤"); if (p.fx & 32) on.push("🪶"); if (p.inv > 0) on.push("🙃");
      if (on.length) { ctx.font = "13px sans-serif"; ctx.fillText(on.join(" "), p.x, p.y - 122); }
      if (p.stun > 0) { ctx.font = "14px sans-serif"; ctx.fillText("💫", p.x, p.y - 94); }
    }
  }
  function drawEventsUI(t) {
    // the announcement bar: what is coming, and what is going on now
    const now = V.t, cur = V.evs.filter((e) => now >= e.t0 && now < e.t0 + e.dur), soon = V.evs.filter((e) => now < e.t0).sort((a, b) => a.t0 - b.t0)[0];
    let y = 14;
    const bar = (icon, title, sub, warn) => { ctx.save(); ctx.globalAlpha = 0.92; ctx.fillStyle = warn ? "rgba(90,20,10,.9)" : "rgba(20,10,10,.85)"; ctx.strokeStyle = warn ? "#ffb347" : "#ff7a3a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(W / 2 - 250, y, 500, sub ? 56 : 40, 14); ctx.fill(); ctx.stroke(); ctx.restore(); ctx.textAlign = "center"; ctx.fillStyle = "#ffe0a8"; ctx.font = "900 19px sans-serif"; ctx.fillText(`${icon} ${title}`, W / 2, y + 25); if (sub) { ctx.fillStyle = "#ffcf99"; ctx.font = "700 12px sans-serif"; ctx.fillText(sub, W / 2, y + 45); } y += sub ? 62 : 46; };
    if (soon && soon.t0 - now <= 2.6) { const E = EVENTS[soon.id]; bar("⚠️", `${E.name} in ${Math.ceil(soon.t0 - now)}`, E.tip, true); }
    for (const e of cur.slice(0, 2)) { const E = EVENTS[e.id]; bar(E.icon, E.name, now - e.t0 < 3.2 ? E.tip : "", false); }
  }
  function render(t) {
    if (!V) { ctx.fillStyle = "#1a0a0a"; ctx.fillRect(0, 0, W, H); return; }
    ctx.save();
    let sx = 0, sy = 0; if (shake > 0 || evActive("quake")) { const k = Math.max(shake, evActive("quake") ? 0.5 : 0); sx = (Math.random() - 0.5) * k * 14; sy = (Math.random() - 0.5) * k * 14; }
    ctx.translate(sx, sy);
    if (evActive("dizzy")) { ctx.translate(W / 2, H / 2); ctx.rotate(Math.sin(t * 2.2) * 0.04); ctx.scale(1 + Math.sin(t * 1.7) * 0.02, 1); ctx.translate(-W / 2, -H / 2); }
    drawBackdrop(t);
    for (const pl of V.plats) drawPlat(pl, t);
    for (const it of V.items) drawItem(it, t);
    drawLava(V.lv, t);
    const order = V.players.map((p, i) => [p, i]).sort((a, b) => a[0].y - b[0].y);
    for (const [p, i] of order) drawFighter(p, i, t);
    drawHazards(t);
    for (const q of parts) { ctx.globalAlpha = Math.max(0, q.life * 2); ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
    if (evActive("wind")) { ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 2; for (let i = 0; i < 18; i++) { const y = (i * 61 + t * 40) % H, x = ((t * 700 * V.wd + i * 173) % (W + 200) + W + 200) % (W + 200) - 100; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 50 * V.wd, y); ctx.stroke(); } }
    ctx.restore();
    // screen effects that only you see
    const me = V.players[myIdx];
    if (evActive("lowgrav")) { ctx.fillStyle = "rgba(130,170,255,.07)"; ctx.fillRect(0, 0, W, H); }
    if (evActive("blackout") && me) { const g = ctx.createRadialGradient(me.x, me.y - 40, 40, me.x, me.y - 40, 250); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.93)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); const lg = ctx.createLinearGradient(0, V.lv - 120, 0, V.lv); lg.addColorStop(0, "rgba(255,90,20,0)"); lg.addColorStop(1, "rgba(255,110,30,.5)"); ctx.fillStyle = lg; ctx.fillRect(0, V.lv - 120, W, 140); }
    if (me && me.ink > 0 && !ink.length) splat();
    if (me && (evActive("ink") || me.ink > 0)) { for (const b of ink) { ctx.globalAlpha = Math.min(1, b.a); ctx.fillStyle = "#0a0a12"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; }
    if (me && (evActive("invert") || me.inv > 0)) { ctx.fillStyle = "#ffd23f"; ctx.font = "900 16px sans-serif"; ctx.textAlign = "center"; ctx.fillText("🙃 CONTROLS INVERTED", W / 2, H - 70); }
    drawEventsUI(t);
    // the lava meter on the right, and the item slot
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(W - 22, 80, 10, 440); const frac = clamp((H - V.lv) / H, 0, 1); ctx.fillStyle = "#ff6a2a"; ctx.fillRect(W - 22, 520 - 440 * frac, 10, 440 * frac);
    V.players.forEach((p, i) => { if (!p.alive) return; ctx.fillStyle = COLS[p.slot % 4].belt; ctx.beginPath(); ctx.arc(W - 17, 520 - 440 * clamp((H - p.y) / H, 0, 1), i === myIdx ? 6 : 4, 0, 7); ctx.fill(); });
    if (me) { ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.beginPath(); ctx.roundRect(14, H - 54, 190, 40, 12); ctx.fill(); ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "800 13px sans-serif"; if (me.item >= 0) { const info = ITEM_INFO[ITEMS[me.item]]; ctx.font = "22px sans-serif"; ctx.fillText(info.icon, 22, H - 25); ctx.font = "800 12px sans-serif"; ctx.fillText(info.name + "  (E)", 52, H - 29); } else { ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillText("no item: grab a glowing orb", 24, H - 29); } }
    ctx.textAlign = "center"; ctx.lineWidth = 9; ctx.strokeStyle = "#111";
    const say = (txt, col) => { ctx.font = "900 70px sans-serif"; ctx.strokeText(txt, W / 2, 300); ctx.fillStyle = col; ctx.fillText(txt, W / 2, 300); };
    if (V.ph === "ready") say(V.rdy > 0.9 ? `ROUND ${V.rd}` : "GO!", "#ffd23f");
    else if (V.ph === "over") { const w = V.players[V.lw]; if (w) say(`${w.name} wins!`.slice(0, 22), COLS[w.slot % 4].belt); else say("DRAW", "#fff"); }
    $("scoreChip").textContent = V.players.map((p) => `${p.name.slice(0, 8)} ${p.wins}`).join("  ·  "); $("roundChip").textContent = `Round ${V.rd} · first to ${V.to}`;
  }

  // ---------------- events (sounds and sparks) ----------------
  const splat = () => { ink = Array.from({ length: 12 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 30 + Math.random() * 70, a: 0.95 })); };
  function spark(x, y, n, col, sp = 260, life = 0.5) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * sp, vy: -Math.random() * sp, life, r: 2 + Math.random() * 3, col }); }
  function handleEv(list) {
    for (const e of list) {
      const k = e[0];
      if (k === "burn") { beep(500, 0.6, "sawtooth", 0.08, 0.2); spark(e[2], e[3], 22, "#ff8a2a", 420, 0.8); shake = Math.max(shake, 0.5); }
      else if (k === "bonk") { beep(130, 0.14, "square", 0.1, 0.4); spark(e[1], e[2], 8, "#ffd23f"); shake = Math.max(shake, 0.4); }
      else if (k === "boom") { beep(90, 0.3, "sawtooth", 0.09, 0.3); spark(e[1], e[2], 16, "#ffb347", 380, 0.6); shake = Math.max(shake, 0.6); }
      else if (k === "bolt") { beep(900, 0.2, "sawtooth", 0.08, 0.2); shake = Math.max(shake, 0.7); }
      else if (k === "erupt") { beep(160, 0.5, "sawtooth", 0.09, 0.5); shake = Math.max(shake, 0.5); }
      else if (k === "swing") beep(260, 0.1, "sawtooth", 0.04, 0.4);
      else if (k === "jump") beep(380, 0.1, "square", 0.03, 1.6);
      else if (k === "pick") { beep(700, 0.1, "triangle", 0.07, 1.5); setTimeout(() => beep(1000, 0.12, "triangle", 0.06, 1.3), 80); }
      else if (k === "use") beep(520, 0.2, "triangle", 0.07, 2);
      else if (k === "event") { beep(440, 0.15, "square", 0.06, 0.8); setTimeout(() => beep(330, 0.25, "square", 0.06, 0.6), 160); if (e[1] === "ink") splat(); }
      else if (k === "round") beep(e[1] === myIdx ? 740 : 220, 0.5, "triangle", 0.1, e[1] === myIdx ? 1.6 : 0.5);
      else if (k === "go") beep(520, 0.25, "square", 0.08, 1.8);
      else if (k === "crack") { beep(100, 0.2, "sawtooth", 0.05, 0.5); spark(e[1], e[2], 8, "#c8a070", 200, 0.5); }
      else if (k === "shield") beep(1200, 0.15, "triangle", 0.06, 0.5);
      else if (k === "bounce") beep(240, 0.25, "sine", 0.08, 3);
      else if (k === "slip") beep(600, 0.2, "sine", 0.05, 0.3);
    }
  }

  // ---------------- input ----------------
  function readInput() {
    const dx = (keys.d || keys.right ? 1 : 0) - (keys.a || keys.left ? 1 : 0) + joy.x; my.dx = Math.max(-1, Math.min(1, dx));
    my.jh = !!(keys.w || keys.up || keys.space) || touchJump > 0;
  }
  const KM = { KeyW: "w", KeyA: "a", KeyD: "d", ArrowUp: "up", ArrowLeft: "left", ArrowRight: "right", Space: "space" };
  document.addEventListener("keydown", (e) => {
    if (role === "idle" || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) return;
    if (KM[e.code]) { e.preventDefault(); if (!keys[KM[e.code]] && (e.code === "KeyW" || e.code === "ArrowUp" || e.code === "Space")) my.jn++; keys[KM[e.code]] = true; }
    if ((e.code === "KeyJ" || e.code === "KeyF") && !e.repeat) { my.sw++; ink.forEach((b) => (b.a *= 0.4)); }
    if ((e.code === "KeyE" || e.code === "KeyK") && !e.repeat) my.it++;
    if (e.code === "Escape" && role === "solo") toMenu();
  });
  document.addEventListener("keyup", (e) => { if (KM[e.code]) keys[KM[e.code]] = false; });
  window.addEventListener("blur", () => { for (const k of Object.keys(keys)) keys[k] = false; });
  cv.addEventListener("pointerdown", (e) => { if (role === "idle") return; e.preventDefault(); my.sw++; ink.forEach((b) => (b.a *= 0.4)); });
  TouchPad.mount($("pad"), { onMove: (x, y) => { joy = { x, y: 0 }; if (y < -0.6 && !joy.up) { joy.up = true; my.jn++; touchJump = 0.4; } if (y >= -0.6) joy.up = false; }, buttons: [{ label: "⤒ Jump", onDown: () => { my.jn++; touchJump = 0.4; } }, { label: "🏏 Bat", onDown: () => { my.sw++; } }, { label: "🎁 Item", onDown: () => { my.it++; } }] });

  // ---------------- the loop ----------------
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.033, last ? (now - last) / 1000 : 0.016); last = now; tClock += dt; touchJump = Math.max(0, touchJump - dt);
    readInput(); shake = Math.max(0, shake - dt * 3);
    for (const q of parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 700 * dt; q.life -= dt; } parts = parts.filter((q) => q.life > 0);
    for (const b of ink) b.a -= dt * 0.04; ink = ink.filter((b) => b.a > 0);
    if (running) {
      if (role === "solo" || role === "host") {
        const me = sim.players[myIdx]; me.inp = { dx: my.dx, jh: my.jh, jn: my.jn, sw: my.sw, it: my.it };
        for (const [id, inp] of remoteIn) { const p = sim.players.find((q) => q.id === id); if (p) p.inp = inp; }
        const sub = 2; for (let i = 0; i < sub; i++) stepSim(dt / sub);
        if (sim.ev.length) { handleEv(sim.ev); if (role === "host") pending.push(...sim.ev); sim.ev = []; }
        decode(Sim.snapshot(sim, false));
        V.players.forEach((p, i) => { p.x = p.tx; p.y = p.ty; });
        if (role === "host") { sendAcc += dt; if (sendAcc > 0.033) { sendAcc = 0; np.send(hostSnap()); } }
        if (sim.phase === "end" && !over) endMatch();
      } else if (role === "guest" && V) {
        sendAcc += dt; if (sendAcc > 0.033) { sendAcc = 0; np.send({ k: "in", dx: Math.round(my.dx * 100) / 100, jh: my.jh ? 1 : 0, jn: my.jn, sw: my.sw, it: my.it }); }
        const age = Math.min(0.12, (performance.now() - snapAt) / 1000), k = Math.min(1, dt * 18);
        V.players.forEach((p) => { p.x += (p.tx + p.vx * age - p.x) * k; p.y += (p.ty + p.vy * age - p.y) * k; });
      }
    }
    render(tClock);
  }
  function stepSim(dt) { Sim.stepSim(sim, dt); }
  let pending = [];
  function hostSnap() { const d = Sim.snapshot(sim, false); d.ev = pending.splice(0); return d; }

  function endMatch() {
    over = true; running = false;
    const s = sim || V, wins = (sim ? sim.players : V.players).map((p) => p.wins), iWon = (sim ? sim.winner : V.w) === myIdx, names = (sim ? sim.players : V.players).map((p) => p.name);
    if (role === "solo") {
      if (window.TungMP) TungMP.submitSolo({ game: "lava", result: iWon ? "win" : "loss" });
      showResult(iWon ? "🏆 Last Tung standing!" : "🔥 Burnt to a crisp", `Rounds won: ${names.map((n, i) => `${n} ${wins[i]}`).join(", ")}`, [["Go again", startSolo], ["Menu", toMenu]]);
    } else {
      if (role === "host") np.send(hostSnap());
      const order = names.map((n, i) => ({ i, w: wins[i], win: i === (sim ? sim.winner : V.w) })).sort((a, b) => (b.win - a.win) || (b.w - a.w));
      const ranking = order.map((o) => meta[o.i].id);
      np.report({ score: wins[myIdx], ranking });
      if (np.kind === "room") showResult(iWon ? "🏆 You win!" : "Match over", names.map((n, i) => `${n} ${wins[i]}`).join("  ·  "), [["Back to the room", () => { hideResult(); np.setPlaying(false); }]]);
    }
    void s;
  }
  function showResult(title, sub, buttons) { const r = $("result"); r.innerHTML = `<h2>${title}</h2><p>${sub}</p><div class="btn-row"></div>`; r.hidden = false; for (const [label, fn] of buttons) { const b = document.createElement("button"); b.className = "btn" + (label === "Menu" ? " secondary" : ""); b.textContent = label; b.onclick = fn; r.querySelector(".btn-row").append(b); } }
  const hideResult = () => { $("result").hidden = true; };

  function begin(newRole, players, to, opts) {
    role = newRole; over = false; hideResult(); roundsTo = to; parts = []; ink = []; pending = []; remoteIn.clear(); meta = players; my = { dx: 0, jh: false, jn: 0, sw: 0, it: 0 };
    sim = role === "guest" ? null : Sim.makeSim(players, to, opts);
    V = emptyView(players); myIdx = players.findIndex((p) => p.me); running = true; cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame);
  }
  function startSolo() {
    level = $("level").value; chaos = $("chaos").value; const nb = Number($("bots").value), names = ["Tralalero", "Bombardiro", "Cappuccino"];
    const players = [{ id: "me", name: (window.TungMP && TungMP.user ? TungMP.user.username : "You"), gear: TungGear.mine(), me: true }];
    for (let i = 0; i < nb; i++) players.push({ id: "bot" + i, name: names[i], bot: true });
    np.setPlaying(true); begin("solo", players, Number($("rounds").value), { level, chaos });
  }
  function toMenu() { running = false; cancelAnimationFrame(raf); role = "idle"; hideResult(); np.setPlaying(false); }
  $("startBtn").addEventListener("click", startSolo);
  $("quitBtn").addEventListener("click", () => { if (np.kind) np.leave(); else toMenu(); });

  // ---------------- multiplayer (a room, or a 1 v 1 match): the host runs the lava, everybody else sends keys and draws ----------------
  const asPlayers = (c) => c.players.map((p) => ({ id: p.id, name: p.name, gear: TungGear.fromNums(p.gear), me: p.id === c.me.id }));
  np = NetPlay.attach({
    game: "lava", rooms: true, panel: $("mpPanel"), menu: $("menu"), play: $("play"),
    onModeChange() { if (role === "solo") toMenu(); },
    onPrepare(c) { ctxInfo = c; begin(c.host ? "host" : "guest", asPlayers(c), c.opts.rounds, { chaos: c.opts.chaos, level: "medium" }); if (sim) { sim.phase = "ready"; sim.ready = 99; } running = true; },
    onStart() { if (sim) { sim.ready = 1.8; sim.phase = "ready"; } },
    onStop() { },
    onExit() { running = false; cancelAnimationFrame(raf); role = "idle"; hideResult(); },
    onNet(from, d) {
      if (!d) return;
      if (role === "host" && d.k === "in") remoteIn.set(from, { dx: clamp(+d.dx || 0, -1, 1), jh: !!d.jh, jn: d.jn | 0, sw: d.sw | 0, it: d.it | 0 });
      else if (role === "guest" && d.k === "s" && V) {
        snapAt = performance.now(); decode(d); handleEv(d.ev || []);
        if (d.ph === "end" && !over) { V.w = d.w; endMatch(); }
      }
    },
    onLeft(id) { if (sim) { const p = sim.players.find((q) => q.id === id); if (p && p.alive) { p.alive = false; p.diedAt = sim.t; } } },
    onRoomEnd(m) { running = false; const rows = m.ranking.map((r) => `<tr class="${r.place === 1 ? "win" : ""}"><td>${r.place}</td><td>${NetPlay.avatarHtml(r.avatar)} ${NetPlay.esc(r.username)}</td></tr>`).join(""); showResult(m.reason === "host_left" ? "Host left" : (m.ranking[0].id === m.you ? "🏆 You win!" : "Match over"), `<table>${rows}</table>`, [["Back to the room", () => { hideResult(); np.setPlaying(false); }]]); },
  });
  // the host's sound effects also have to reach the guests: collect them as they happen
  const stepOrig = Sim.stepSim; void stepOrig;
  window.__lava = () => ({ frame: (ts) => frame(ts), sim, V, role, myIdx, step: (dt) => { sim.players[myIdx].inp = { dx: my.dx, jh: my.jh, jn: my.jn, sw: my.sw, it: my.it }; Sim.stepSim(sim, dt); sim.ev = []; }, my, draw: () => { decode(Sim.snapshot(sim, false)); V.players.forEach((p) => { p.x = p.tx; p.y = p.ty; }); render(tClock += 0.016); } });
})();
