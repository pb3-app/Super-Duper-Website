(() => {
  const T = window.F1Tracks;
  const $ = (id) => document.getElementById(id);
  const cv = $("view"), ctx = cv.getContext("2d");
  const CW = cv.width, CH = cv.height;
  const msgEl = $("msg"), lapEl = $("lapEl"), posEl = $("posEl"), timeEl = $("timeEl"), bestEl = $("bestEl"), tinfo = $("tinfo");
  const GATES = T.GATES;

  // ---- tuning ----
  const ACC = 520, BRAKE = 1000, DRAG = 1.1, DRAG_OFF = 3.6, GRIP = 7.5, GRIP_OFF = 3.5, WALL = 64;
  const trackSel = $("track");
  for (const id of T.IDS) { const o = document.createElement("option"); o.value = id; o.textContent = T.DEFS[id].name; trackSel.append(o); }

  let tr = T.build("speedway"), path = null;
  let cars = [], me = null, ghost = null, mp = false, myIdx = 0, laps = 3;
  let phase = "idle"; // idle | lights | racing | done
  let raceStart = 0, lightsAt = 0, raf = 0, last = 0, bestLap = 0, shakeT = 0, flashMsg = null, parts = [];
  let keys = { l: false, r: false, g: false, b: false }, touch = { l: false, r: false, g: false, b: false };
  let sendAcc = 0, audio, engine = null;
  const fmt = (ms) => { const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3); };

  // ---- sound: a simple engine hum ----
  function startEngine() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (engine) return;
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "sawtooth"; o.frequency.value = 60; g.gain.value = 0.015;
      o.connect(g).connect(audio.destination); o.start();
      engine = { o, g };
    } catch (_) {}
  }
  function stopEngine() { try { if (engine) { engine.o.stop(); engine = null; } } catch (_) {} }
  function beep(f, d, v = 0.08) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      o.type = "square"; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (_) {}
  }

  // ---- track setup ----
  function loadTrack(id) {
    tr = T.build(id);
    path = new Path2D();
    tr.pts.forEach((p, i) => (i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])));
    path.closePath();
    tinfo.textContent = `${tr.name}: ${tr.blurb} (${(tr.L / 1000).toFixed(1)} km of road units)`;
  }
  function newCar(slot, o) {
    const row = Math.floor(slot / 2), lane = slot % 2 === 0 ? -1 : 1;
    const back = Math.round((70 + row * 56) / tr.ds), idx = (tr.N - back + tr.N) % tr.N;
    const lat = lane * tr.hw * 0.42;
    const x = tr.pts[idx][0] + -tr.ty[idx] * lat, y = tr.pts[idx][1] + tr.tx[idx] * lat;
    return {
      x, y, a: Math.atan2(tr.ty[idx], tr.tx[idx]), vx: 0, vy: 0, steer: 0, thr: 0, brk: 0, hint: idx, D: -back * tr.ds, maxD: -back * tr.ds,
      gates: 0, done: false, finishT: 0, lapStart: 0, lastGates: 0, best: 0, ...o,
    };
  }
  function lapOf(c) { return Math.min(laps, Math.floor(Math.max(0, c.maxD) / tr.L) + 1); }

  function setupRace(opts) {
    loadTrack(opts.track); laps = opts.laps; cars = []; parts = []; ghost = null;
    if (opts.mp) {
      me = newCar(opts.idx, { human: true, name: "You", color: "#ffcc33", gear: TungGear.mine() });
      ghost = newCar(1 - opts.idx, { name: opts.oppName, color: "#4cc9f0", ghost: true, tx: 0, ty: 0, gear: TungGear.fromNums(opts.oppGear) });
      cars = [me, ghost];
    } else {
      const sk = Number($("skill").value);
      const rivals = [["Tralalero", "#2a8cff", 0.98], ["Bombardiro", "#3fcf5a", 1.0], ["Cappuccino", "#555566", 0.94]];
      me = newCar(2, { human: true, name: "You", color: "#ffcc33", gear: TungGear.mine() });
      const slots = [0, 1, 3];
      cars = [me];
      rivals.forEach((r, i) => cars.push(newCar(slots[i], { name: r[0], color: r[1], ai: true, skill: sk * r[2], lane: (i - 1) * 0.28 })));
    }
    bestLap = 0; bestEl.textContent = "-"; lapEl.textContent = "1/" + laps; posEl.textContent = "-"; timeEl.textContent = "0:00.000";
    phase = "idle";
  }

  // ---- physics ----
  function stepCar(c, dt) {
    const fx = Math.cos(c.a), fy = Math.sin(c.a), nx = -fy, ny = fx;
    let vf = c.vx * fx + c.vy * fy, vl = c.vx * nx + c.vy * ny;
    const sp = Math.hypot(c.vx, c.vy);
    const n = T.nearest(tr, c.x, c.y, c.hint);
    const onRoad = Math.abs(n.side) < tr.hw + 6;
    c.onRoad = onRoad;
    // steering: tighter at low speed, limited at high speed
    const turn = c.steer * (3.4 * Math.min(1, sp / 80)) / (1 + (sp / 420) ** 2) * (vf >= -5 ? 1 : -1);
    c.a += turn * dt;
    // engine, brake, drag
    const fx2 = Math.cos(c.a), fy2 = Math.sin(c.a), nx2 = -fy2, ny2 = fx2;
    vf = c.vx * fx2 + c.vy * fy2; vl = c.vx * nx2 + c.vy * ny2;
    if (c.thr > 0) vf += ACC * c.thr * dt;
    if (c.brk > 0) { if (vf > 6) vf = Math.max(0, vf - BRAKE * c.brk * dt); else vf -= ACC * 0.45 * c.brk * dt; }
    vf -= vf * (onRoad ? DRAG : DRAG_OFF) * dt;
    vl *= Math.exp(-(onRoad ? GRIP : GRIP_OFF) * dt);
    c.vx = fx2 * vf + nx2 * vl; c.vy = fy2 * vf + ny2 * vl;
    c.x += c.vx * dt; c.y += c.vy * dt;
    c.slip = Math.abs(vl);
    // walls
    const n2 = T.nearest(tr, c.x, c.y, n.i);
    c.hint = n2.i;
    const lim = tr.hw + WALL;
    if (Math.abs(n2.side) > lim) {
      const lx = -tr.ty[n2.i], ly = tr.tx[n2.i], sgn = n2.side > 0 ? 1 : -1;
      c.x = tr.pts[n2.i][0] + lx * sgn * lim; c.y = tr.pts[n2.i][1] + ly * sgn * lim;
      const out = (c.vx * lx + c.vy * ly) * sgn;
      if (out > 0) { c.vx -= lx * sgn * out * 1.6; c.vy -= ly * sgn * out * 1.6; c.vx *= 0.7; c.vy *= 0.7; if (c.human && out > 60) { shakeT = 0.25; beep(90, 0.15, 0.1); } }
    }
    // progress along the track (never goes backwards)
    let di = c.hint - c.lastIdx; if (c.lastIdx === undefined) di = 0;
    if (di > tr.N / 2) di -= tr.N; if (di < -tr.N / 2) di += tr.N;
    c.lastIdx = c.hint; c.D += di * tr.ds;
    if (c.D > c.maxD) c.maxD = c.D;
    c.wrong = (c.vx * tr.tx[c.hint] + c.vy * tr.ty[c.hint]) < -40;
    c.gates = Math.max(0, Math.floor(c.maxD / (tr.L / GATES)));
  }

  function aiDrive(c) {
    const sp = Math.hypot(c.vx, c.vy), i = c.hint, N = tr.N;
    const look = Math.round((50 + sp * 0.22) / tr.ds);
    const j = (i + look) % N, off = (c.lane || 0) * tr.hw * 0.55;
    const tx = tr.pts[j][0] + -tr.ty[j] * off, ty = tr.pts[j][1] + tr.tx[j] * off;
    let da = Math.atan2(ty - c.y, tx - c.x) - c.a;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    c.steer = Math.max(-1, Math.min(1, da * 2.4));
    let kmax = 0; const win = Math.ceil((sp * 0.75 + 90) / tr.ds);
    for (let k = 0; k <= win; k++) kmax = Math.max(kmax, tr.curv[(i + k) % N]);
    const vmax = Math.min(480 * c.skill, Math.sqrt((540 * c.skill) / Math.max(kmax, 1e-5)));
    const vf = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
    c.thr = vf < vmax ? 1 : 0; c.brk = vf > vmax * 1.06 ? 1 : 0;
    if (!c.onRoad) { c.thr = Math.min(c.thr, 0.6); }
  }

  function collide() {
    for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
      const p = cars[a], q = cars[b]; if (p.ghost || q.ghost) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d < 36 && d > 0.01) {
        const ux = dx / d, uy = dy / d, push = (36 - d) / 2;
        p.x -= ux * push; p.y -= uy * push; q.x += ux * push; q.y += uy * push;
        const rv = (q.vx - p.vx) * ux + (q.vy - p.vy) * uy;
        if (rv < 0) { p.vx += ux * rv * 0.5; p.vy += uy * rv * 0.5; q.vx -= ux * rv * 0.5; q.vy -= uy * rv * 0.5; if (p.human || q.human) { shakeT = 0.12; beep(130, 0.08, 0.06); } }
      }
    }
  }

  // ---- race flow ----
  function begin() { phase = "racing"; raceStart = performance.now(); for (const c of cars) c.lapStart = 0; flashMsg = { t: performance.now(), text: "GO!" }; beep(880, 0.35, 0.1); msgEl.textContent = ""; startEngine(); sendAcc = 0; }
  function startSolo() {
    stopEngine();
    loadTrack(trackSel.value);
    setupRace({ track: trackSel.value, laps: Number($("laps").value), mp: false });
    phase = "lights"; lightsAt = performance.now(); msgEl.textContent = "";
    $("startBtn").textContent = "Restart";
    cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame);
  }
  function finishFor(c, now) {
    c.done = true; c.finishT = now - raceStart;
    if (c === me) {
      bestEl.textContent = bestLap ? fmt(bestLap) : "-";
      if (mp) { TungMP.progress(laps * GATES); TungMP.finish({ cleared: true }); msgEl.textContent = `🏁 You finished in ${fmt(c.finishT)}! Waiting for the result…`; }
    }
  }
  function placeOf(c) {
    const order = cars.filter((q) => !q.ghost || true).slice().sort((a, b) => (a.done && b.done ? a.finishT - b.finishT : a.done ? -1 : b.done ? 1 : b.maxD - a.maxD));
    return order.indexOf(c) + 1;
  }
  function checkSoloEnd(now) {
    if (mp || phase !== "racing") return;
    if (me.done) {
      if (cars.every((c) => c.done) || now - raceStart > me.finishT + 12000) {
        phase = "done"; stopEngine();
        const order = cars.slice().sort((a, b) => (a.done && b.done ? a.finishT - b.finishT : a.done ? -1 : b.done ? 1 : b.maxD - a.maxD));
        const pos = order.indexOf(me) + 1;
        msgEl.textContent = `🏁 Finished P${pos} in ${fmt(me.finishT)} · best lap ${fmt(bestLap)} · ` + order.map((c, i) => `${i + 1}. ${c.name}`).join("  ");
        $("startBtn").textContent = "Race again";
        if (laps === 3 && window.TungMP) TungMP.submitSolo({ game: "f1", level: tr.id, time: Math.round(me.finishT) });
      }
    }
  }

  function update(dt, now) {
    if (phase === "lights") {
      const e = (now - lightsAt) / 1000;
      if (e > 3.6) begin();
      for (const c of cars) { c.thr = 0; c.brk = 0; }
      return;
    }
    if (phase !== "racing" && phase !== "done") return;
    const t = now - raceStart;
    // controls
    if (!me.done) {
      me.steer = (keys.r || touch.r ? 1 : 0) - (keys.l || touch.l ? 1 : 0);
      me.thr = keys.g || touch.g ? 1 : 0; me.brk = keys.b || touch.b ? 1 : 0;
    } else { me.thr = 0; me.brk = 0.6; me.steer = 0; }
    const sub = 2, h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (const c of cars) {
        if (c.ghost) continue;
        if (c.ai) { if (c.done) { c.thr = 0; c.brk = 0.5; c.steer = 0; } else aiDrive(c); }
        stepCar(c, h);
      }
      if (!mp) collide();
    }
    // gates, laps, finishing
    for (const c of cars) {
      if (c.ghost) continue;
      if (c.gates > c.lastGates) {
        if (c === me) {
          const lapNow = Math.floor(c.gates / GATES);
          if (c.gates % GATES === 0 && lapNow >= 1) { // crossed the line
            const lt = t - c.lapStart; c.lapStart = t;
            if (!bestLap || lt < bestLap) bestLap = lt;
            bestEl.textContent = fmt(bestLap);
            flashMsg = { t: now, text: c.gates >= laps * GATES ? "FINISH!" : `LAP ${lapNow + 1}  (${fmt(lt)})` };
            beep(660, 0.2, 0.08);
          }
          if (mp) TungMP.progress(Math.min(c.gates, laps * GATES));
        }
        c.lastGates = c.gates;
        if (c.gates >= laps * GATES && !c.done) finishFor(c, now);
      }
    }
    // smoke
    for (const c of cars) if (!c.ghost && (c.slip > 150 || !c.onRoad) && Math.hypot(c.vx, c.vy) > 60 && Math.random() < 0.6) parts.push({ x: c.x - Math.cos(c.a) * 14, y: c.y - Math.sin(c.a) * 14, life: 0.5, grass: !c.onRoad });
    for (const p of parts) p.life -= dt; parts = parts.filter((p) => p.life > 0);
    // ghost smoothing
    if (ghost && ghost.target) { ghost.x += (ghost.target.x - ghost.x) * 0.3; ghost.y += (ghost.target.y - ghost.y) * 0.3; let da = ghost.target.a - ghost.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; ghost.a += da * 0.3; ghost.gates = ghost.target.g; ghost.maxD = ghost.gates * (tr.L / GATES); }
    // multiplayer: send my state
    if (mp && phase === "racing") { sendAcc += dt; if (sendAcc > 0.066) { sendAcc = 0; TungMP.rt({ x: Math.round(me.x), y: Math.round(me.y), a: Math.round(me.a * 100) / 100, g: me.gates }); } }
    // HUD
    if (phase === "racing") timeEl.textContent = fmt(t);
    lapEl.textContent = Math.min(laps, Math.floor(Math.max(0, me.maxD) / tr.L) + 1) + "/" + laps;
    posEl.textContent = placeOf(me) + "/" + cars.length;
    if (engine && !me.done) { const sp = Math.hypot(me.vx, me.vy); engine.o.frequency.value = 55 + sp * 0.55; engine.g.gain.value = 0.012 + (me.thr ? 0.012 : 0); } else if (engine) engine.g.gain.value = 0.004;
    checkSoloEnd(now);
  }

  // ---- drawing ----
  function drawCar(c, isMe) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); ctx.scale(1.45, 1.45);
    if (c.ghost) ctx.globalAlpha = 0.8;
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(-18, -8, 40, 20);
    ctx.fillStyle = "#111"; for (const [x, y] of [[-13, -11], [-13, 6], [9, -11], [9, 6]]) ctx.fillRect(x, y, 9, 6);
    ctx.fillStyle = c.color; // body
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(10, -5); ctx.lineTo(-14, -8); ctx.lineTo(-18, -8); ctx.lineTo(-18, 8); ctx.lineTo(-14, 8); ctx.lineTo(10, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#222"; ctx.fillRect(18, -11, 4, 22); ctx.fillRect(-20, -10, 4, 20); // wings
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(-8, -1.5, 18, 3);
    // Tung Tung Sahur at the wheel: a log end with two big eyes
    const skin = c.gear && c.gear.color && window.TungShop ? TungShop.byId[c.gear.color] : null;
    ctx.fillStyle = skin ? TungGear.skinFill(ctx, skin, 13) : "#c58a4a"; ctx.beginPath(); ctx.arc(-1, 0, 6.5, 0, 7); ctx.fill(); ctx.strokeStyle = "#5e3a18"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(1.5, -2.4, 2.2, 0, 7); ctx.arc(1.5, 2.4, 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(2.3, -2.4, 1, 0, 7); ctx.arc(2.3, 2.4, 1, 0, 7); ctx.fill();
    ctx.restore();
    if (c.gear && c.gear.hat) { ctx.save(); if (c.ghost) ctx.globalAlpha = 0.8; ctx.translate(c.x, c.y - 4 + 29 * 0.55); ctx.scale(0.55, 0.55); TungGear.hat(ctx, c.gear.hat, performance.now() / 1000); ctx.restore(); } // the hat stays upright
    ctx.save(); ctx.font = "800 13px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.7)";
    ctx.strokeText(c.name, c.x, c.y - 34); ctx.fillStyle = isMe ? "#ffe27a" : "#fff"; ctx.fillText(c.name, c.x, c.y - 34); ctx.restore();
  }
  function draw(now) {
    const sp = Math.hypot(me.vx, me.vy), zoom = 0.82 - (sp / 480) * 0.22;
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    ctx.fillStyle = tr.grass; ctx.fillRect(0, 0, CW, CH);
    const camX = me.x + me.vx * 0.25, camY = me.y + me.vy * 0.25;
    ctx.translate(CW / 2, CH / 2); ctx.scale(zoom, zoom); ctx.translate(-camX, -camY);
    // grass stripes
    ctx.fillStyle = "rgba(0,0,0,.07)";
    const gx0 = Math.floor((camX - CW / zoom) / 180) * 180, gy0 = Math.floor((camY - CH / zoom) / 180) * 180;
    for (let x = gx0; x < camX + CW / zoom; x += 180) for (let y = gy0; y < camY + CH / zoom; y += 180) if (((x / 180) + (y / 180)) & 1) ctx.fillRect(x, y, 180, 180);
    ctx.lineJoin = "round"; ctx.lineCap = "butt";
    ctx.strokeStyle = "#1c1c1c"; ctx.lineWidth = (tr.hw + 40) * 2; ctx.stroke(path); // wall strip
    ctx.strokeStyle = "#d33"; ctx.lineWidth = (tr.hw + 16) * 2; ctx.setLineDash([26, 26]); ctx.stroke(path);
    ctx.strokeStyle = "#fff"; ctx.lineDashOffset = 26; ctx.stroke(path); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.strokeStyle = "#3b3f48"; ctx.lineWidth = tr.hw * 2; ctx.stroke(path);
    ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = tr.hw * 1.2; ctx.stroke(path);
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 3; ctx.setLineDash([26, 30]); ctx.stroke(path); ctx.setLineDash([]);
    // start / finish line
    { const p = tr.pts[0], a = Math.atan2(tr.ty[0], tr.tx[0]); ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(a);
      const sq = 14, n = Math.ceil((tr.hw * 2) / sq);
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? "#fff" : "#111"; ctx.fillRect(-sq + j * sq, -tr.hw + i * sq, sq, sq); }
      ctx.restore(); }
    // gate ticks (faint)
    ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 4;
    for (let k = 1; k < GATES; k++) { const i = tr.gate(k); ctx.beginPath(); ctx.moveTo(tr.pts[i][0] + -tr.ty[i] * tr.hw, tr.pts[i][1] + tr.tx[i] * tr.hw); ctx.lineTo(tr.pts[i][0] + tr.ty[i] * tr.hw, tr.pts[i][1] - tr.tx[i] * tr.hw); ctx.stroke(); }
    // smoke
    for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.grass ? "#8a6a3a" : "#ddd"; ctx.beginPath(); ctx.arc(p.x, p.y, 5 + (0.5 - p.life) * 12, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const c of cars) if (c !== me) drawCar(c, false);
    drawCar(me, true);
    ctx.restore();
    // ---- overlays (screen space) ----
    // minimap
    const mx = CW - 150, my = 12, mw = 138, mh = 92, [x0, y0, x1, y1] = tr.bbox, s = Math.min((mw - 12) / (x1 - x0), (mh - 12) / (y1 - y0));
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(mx, my, mw, mh);
    ctx.save(); ctx.translate(mx + mw / 2 - ((x0 + x1) / 2) * s, my + mh / 2 - ((y0 + y1) / 2) * s); ctx.scale(s, s);
    ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 6 / s * 0.8; ctx.stroke(path);
    for (const c of cars) { ctx.fillStyle = c === me ? "#ffe27a" : c.color; ctx.beginPath(); ctx.arc(c.x, c.y, (c === me ? 8 : 6) / s, 0, 7); ctx.fill(); }
    ctx.restore();
    // speed + wrong way
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(12, CH - 48, 130, 36);
    ctx.fillStyle = "#fff"; ctx.font = "900 22px sans-serif"; ctx.textAlign = "left"; ctx.fillText(Math.round(sp * 0.62) + " km/h", 22, CH - 22);
    if (me.wrong && phase === "racing") { ctx.fillStyle = "rgba(255,60,60,.9)"; ctx.font = "900 30px sans-serif"; ctx.textAlign = "center"; ctx.fillText("⚠ WRONG WAY", CW / 2, 80); }
    if (!me.onRoad && phase === "racing") { ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.font = "800 15px sans-serif"; ctx.textAlign = "center"; ctx.fillText("On the grass - slow!", CW / 2, CH - 16); }
    // start lights
    if (phase === "lights") {
      const e = (now - lightsAt) / 1000, on = Math.min(3, Math.floor(e / 0.9) + 1);
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(CW / 2 - 120, 70, 240, 70);
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i < on && e < 3.2 ? "#ff2a2a" : "#400"; ctx.beginPath(); ctx.arc(CW / 2 - 70 + i * 70, 105, 22, 0, 7); ctx.fill(); }
      if (e > 2.7 && Math.floor(e * 10) % 2 === 0 && e < 3.6) { /* lights out soon */ }
      if (Math.floor(e / 0.9) + 1 !== lightsLast) { lightsLast = Math.floor(e / 0.9) + 1; if (lightsLast <= 3) beep(440, 0.15, 0.08); }
    }
    if (flashMsg && now - flashMsg.t < 1400) {
      const k = (now - flashMsg.t) / 1400; ctx.globalAlpha = 1 - k * k; ctx.textAlign = "center"; ctx.font = "900 46px sans-serif"; ctx.lineWidth = 8; ctx.strokeStyle = "#111";
      ctx.strokeText(flashMsg.text, CW / 2, 150); ctx.fillStyle = "#ffe27a"; ctx.fillText(flashMsg.text, CW / 2, 150); ctx.globalAlpha = 1;
    }
  }
  let lightsLast = 0;

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.033, last ? (t - last) / 1000 : 0.016); last = t;
    shakeT = Math.max(0, shakeT - dt);
    if (phase === "lights" && lightsLast > 3) lightsLast = 0;
    update(dt, performance.now());
    if (me) draw(performance.now());
  }

  // ---- input ----
  const KEYMAP = { ArrowLeft: "l", a: "l", A: "l", ArrowRight: "r", d: "r", D: "r", ArrowUp: "g", w: "g", W: "g", ArrowDown: "b", s: "b", S: "b" };
  document.addEventListener("keydown", (e) => {
    if (KEYMAP[e.key]) { e.preventDefault(); keys[KEYMAP[e.key]] = true; }
    if ((e.key === "r" || e.key === "R") && me && phase === "racing" && !me.done) { const n = T.nearest(tr, me.x, me.y, -1); me.x = tr.pts[n.i][0]; me.y = tr.pts[n.i][1]; me.a = Math.atan2(tr.ty[n.i], tr.tx[n.i]); me.vx = me.vy = 0; me.hint = n.i; me.lastIdx = n.i; }
  });
  document.addEventListener("keyup", (e) => { if (KEYMAP[e.key]) keys[KEYMAP[e.key]] = false; });
  for (const [id, k] of [["bL", "l"], ["bR", "r"], ["bG", "g"], ["bB", "b"]]) {
    const b = $(id);
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); touch[k] = true; });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => { touch[k] = false; });
  }
  $("startBtn").addEventListener("click", () => { if (!mp) startSolo(); });
  trackSel.addEventListener("change", () => { if (!mp) { setupRace({ track: trackSel.value, laps: Number($("laps").value), mp: false }); msgEl.textContent = "Press Start race"; $("startBtn").textContent = "Start race"; stopEngine(); draw(performance.now()); } });
  $("laps").addEventListener("change", () => { if (!mp && phase === "idle") setupRace({ track: trackSel.value, laps: Number($("laps").value), mp: false }); });

  window.__f1dbg = () => ({ cars, me, phase, tr }); // handy for testing from the console
  // ---- initial paint ----
  setupRace({ track: "speedway", laps: 3, mp: false });
  cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);

  // ---- multiplayer ----
  if (window.TungMP) {
    TungMP.on("msg:rt", (m) => { if (mp && ghost && m.d) { const d = m.d; if (!ghost.target) { ghost.x = d.x; ghost.y = d.y; ghost.a = d.a; } ghost.target = d; } });
    TungMP.registerGame({
      prepareMatch(m) {
        stopEngine(); mp = true; myIdx = m.idx;
        setupRace({ track: m.options.level, laps: m.options.laps, mp: true, idx: m.idx, oppName: m.opp.username, oppGear: m.opp.gear });
        phase = "idle"; msgEl.textContent = "Get ready…";
      },
      startMatch() { if (mp) begin(); },
      stopMatch() { phase = "done"; stopEngine(); },
      exitMatch() { mp = false; stopEngine(); setupRace({ track: trackSel.value, laps: Number($("laps").value), mp: false }); msgEl.textContent = "Pick a track and press Start race"; $("startBtn").textContent = "Start race"; },
    });
    TungMP.booted.then(() => {
      const box = $("gameLeaderboard");
      void box;
    });
  }
})();
