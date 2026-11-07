(() => {
  const BS = window.Battleship, TA = window.TungArt;
  const N = BS.N, CS = 40, M = 30;
  const $ = (id) => document.getElementById(id);
  const mineCv = $("mine"), enemyCv = $("enemy"), mctx = mineCv.getContext("2d"), ectx = enemyCv.getContext("2d");
  const statusEl = $("status");

  let started = false, mp = false, my = 0, g = null, view = null, busy = false, over = false;
  let fleet = BS.randomFleet();          // the arrangement being edited before "Ready"
  let ready = false;
  let drag = null, hoverE = null;
  const anims = [];                      // falling bombs and bursts {board:'mine'|'enemy', r, c, res, t0}
  let audio;

  function beep(f, d, type = "square", v = 0.07) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime, o = audio.createOscillator(), gn = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f / 2), t + d);
      gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(gn).connect(audio.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (_) {}
  }
  function setStatus(t, bad) { statusEl.textContent = t; statusEl.classList.toggle("bad", !!bad); }

  // ---------- drawing ----------
  function sea(ctx, label) {
    const W = M + N * CS + 10;
    const gr = ctx.createLinearGradient(0, 0, 0, W);
    gr.addColorStop(0, "#0d5a86"); gr.addColorStop(1, "#093e63");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 440, 440);
    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 1;
    for (let i = 0; i <= N; i++) {
      ctx.beginPath(); ctx.moveTo(M + i * CS, M); ctx.lineTo(M + i * CS, M + N * CS); ctx.moveTo(M, M + i * CS); ctx.lineTo(M + N * CS, M + i * CS); ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = "700 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let i = 0; i < N; i++) { ctx.fillText("ABCDEFGHIJ"[i], M + i * CS + CS / 2, M / 2); ctx.fillText(String(i + 1), M / 2, M + i * CS + CS / 2); }
    // little waves
    ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 2;
    const tt = performance.now() / 900;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const x = M + c * CS + 8, y = M + r * CS + CS * 0.5 + Math.sin(tt + c * 0.8 + r) * 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 6, y - 5, x + 12, y); ctx.quadraticCurveTo(x + 18, y + 5, x + 24, y); ctx.stroke();
    }
    void label;
  }
  function shipBox(s) { return { x: M + s.c * CS, y: M + s.r * CS }; }
  function drawShip(ctx, s, o) {
    const { x, y } = shipBox(s), len = s.len * CS - 6, thick = CS - 12;
    ctx.save();
    if (s.dir === "h") TA.drawLog(ctx, x + 3, y + 6, len, thick, o);
    else { ctx.translate(x + CS - 6, y + 3); ctx.rotate(Math.PI / 2); TA.drawLog(ctx, 0, 0, len, thick, o); }
    ctx.restore();
  }
  function marker(ctx, r, c, v, t) { // v: 1 miss, 2 hit
    const cx = M + c * CS + CS / 2, cy = M + r * CS + CS / 2;
    if (v === 1) {
      ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, 6 + (t ? Math.min(1, t) * 6 : 6), 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.stroke();
    } else if (v === 2) {
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.arc(cx, cy + 4, 12, 0, 7); ctx.fill();
      TA.explosion(ctx, cx, cy, 16, 0.55);
    }
  }

  function renderMine() {
    sea(mctx);
    const list = (view && view.myShips) ? view.myShips : fleet;
    const sunkSet = new Set((view ? view.sunkMine : []).map((s) => s.r + "," + s.c + "," + s.dir));
    for (const s of list) {
      if (drag && drag.ship === s) continue;
      drawShip(mctx, s, { dead: sunkSet.has(s.r + "," + s.c + "," + s.dir) });
    }
    if (drag) { // ghost
      const ok = canPlace(drag.ghost, drag.ship);
      mctx.globalAlpha = 0.85;
      drawShip(mctx, drag.ghost, { alpha: 1 });
      mctx.globalAlpha = 1;
      mctx.fillStyle = ok ? "rgba(80,255,120,.22)" : "rgba(255,70,60,.35)";
      for (const [r, c] of BS.cellsOf(drag.ghost)) if (r >= 0 && r < N && c >= 0 && c < N) mctx.fillRect(M + c * CS, M + r * CS, CS, CS);
    }
    if (view && view.phase === "fire") {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const v = view.incoming[r * N + c]; if (!v) continue;
        if (!anims.find((a) => a.board === "mine" && a.r === r && a.c === c && !a.done)) marker(mctx, r, c, v);
      }
    }
    drawAnims(mctx, "mine");
  }
  function renderEnemy() {
    sea(ectx);
    if (view && view.phase === "fire") {
      // sunk enemy logs are shown; if the game is over, the rest too
      const sunkSet = new Set();
      for (const s of view.sunkFoe) { drawShip(ectx, s, { dead: true, alpha: 0.95 }); sunkSet.add(s.r + "," + s.c + "," + s.dir); }
      if (view.foeShips) for (const s of view.foeShips) if (!sunkSet.has(s.r + "," + s.c + "," + s.dir)) drawShip(ectx, s, { alpha: 0.55 });
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const v = view.fired[r * N + c]; if (!v) continue;
        if (!anims.find((a) => a.board === "enemy" && a.r === r && a.c === c && !a.done)) marker(ectx, r, c, v);
      }
      if (hoverE && canFire() && !view.fired[hoverE.r * N + hoverE.c]) {
        ectx.strokeStyle = "#ffc933"; ectx.lineWidth = 3;
        ectx.strokeRect(M + hoverE.c * CS + 2, M + hoverE.r * CS + 2, CS - 4, CS - 4);
        ectx.fillStyle = "rgba(255,201,51,.18)"; ectx.fillRect(M + hoverE.c * CS, M + hoverE.r * CS, CS, CS);
      }
    } else {
      ectx.fillStyle = "rgba(0,0,0,.35)"; ectx.fillRect(M, M, N * CS, N * CS);
      ectx.fillStyle = "#fff"; ectx.font = "800 18px sans-serif"; ectx.textAlign = "center";
      ectx.fillText("Place your fleet first", M + (N * CS) / 2, M + (N * CS) / 2);
    }
    drawAnims(ectx, "enemy");
  }
  function drawAnims(ctx, board) {
    const now = performance.now();
    for (const a of anims) {
      if (a.board !== board || a.done) continue;
      const t = (now - a.t0) / 1000, cx = M + a.c * CS + CS / 2, cy = M + a.r * CS + CS / 2;
      if (t < 0 || t > 1.15) { if (t > 1.15) a.done = true; continue; }
      if (t < 0.55) { // the green Tung drops in
        const k = t / 0.55, y = cy - (1 - k * k) * 190;
        TA.drawBomb(ctx, cx, y, CS * 1.25, { rot: (1 - k) * 2.2, t: k * 2 });
        ctx.fillStyle = `rgba(0,0,0,${0.18 * k})`; ctx.beginPath(); ctx.ellipse(cx, cy + 10, 10 * k, 4 * k, 0, 0, 7); ctx.fill();
      } else {
        const k = (t - 0.55) / 0.6;
        if (a.res === "miss") {
          ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 3;
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx, cy, 6 + k * 22 + i * 7, 0, 7); ctx.stroke(); }
        } else TA.explosion(ctx, cx, cy, 30, k);
      }
      if (!a.sfx && t >= 0.55) { a.sfx = 1; if (a.res === "miss") beep(260, 0.18, "sine", 0.06); else { beep(120, 0.4, "sawtooth", 0.1); if (a.res === "sunk") setTimeout(() => beep(80, 0.6, "sawtooth", 0.12), 150); } }
    }
    while (anims.length && anims[0].done) anims.shift();
  }
  function loop() {
    renderMine(); renderEnemy();
    requestAnimationFrame(loop);
  }

  // ---------- placement ----------
  const cellAt = (cv, ev) => {
    const r = cv.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * 440 - M, y = ((ev.clientY - r.top) / r.height) * 440 - M;
    return { r: Math.floor(y / CS), c: Math.floor(x / CS) };
  };
  function canPlace(s, ignore) {
    const used = new Set();
    for (const o of fleet) if (o !== ignore) for (const [r, c] of BS.cellsOf(o)) used.add(r * N + c);
    return BS.cellsOf(s).every(([r, c]) => r >= 0 && r < N && c >= 0 && c < N && !used.has(r * N + c));
  }
  const editing = () => !ready && (!view || view.phase === "place") && !(view && view.myPlaced);
  mineCv.addEventListener("pointerdown", (ev) => {
    if (!editing()) return;
    const { r, c } = cellAt(mineCv, ev);
    const s = fleet.find((o) => BS.cellsOf(o).some(([a, b]) => a === r && b === c));
    if (!s) return;
    mineCv.setPointerCapture(ev.pointerId);
    drag = { ship: s, off: [r - s.r, c - s.c], moved: false, ghost: { ...s }, start: [r, c] };
  });
  mineCv.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const { r, c } = cellAt(mineCv, ev);
    if (r !== drag.start[0] || c !== drag.start[1]) drag.moved = true;
    drag.ghost = { ...drag.ship, r: r - drag.off[0], c: c - drag.off[1] };
  });
  mineCv.addEventListener("pointerup", () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.moved) { if (canPlace(d.ghost, d.ship)) { d.ship.r = d.ghost.r; d.ship.c = d.ghost.c; beep(300, 0.08, "triangle"); } else beep(110, 0.15, "square", 0.05); }
    else { // a click turns the ship around its first square (nudging it back onto the board when needed)
      const t = { ...d.ship, dir: d.ship.dir === "h" ? "v" : "h" };
      const tries = [[0, 0]];
      for (let k = 1; k < d.ship.len; k++) tries.push([-k, 0], [0, -k]);
      for (const [dr, dc] of tries) { const cand = { ...t, r: t.r + dr, c: t.c + dc }; if (canPlace(cand, d.ship)) { Object.assign(d.ship, cand); beep(380, 0.07, "triangle"); break; } }
    }
  });
  mineCv.addEventListener("pointercancel", () => { drag = null; });
  $("randBtn").addEventListener("click", () => { if (editing()) { fleet = BS.randomFleet(); beep(320, 0.1, "triangle"); } });
  $("readyBtn").addEventListener("click", () => {
    if (!editing()) return;
    if (mp && !started) return setStatus("Wait for the countdown to finish, then press Ready.", true);
    ready = true;
    if (mp) { TungMP.sendMatch({ t: "tb_move", move: { t: "place", ships: fleet } }); setStatus("Fleet ready. Waiting for your opponent…"); }
    else beginSoloBattle();
    sync();
  });

  // ---------- firing ----------
  const canFire = () => !!view && view.phase === "fire" && !view.over && view.turn === my && !busy;
  enemyCv.addEventListener("pointermove", (ev) => { const p = cellAt(enemyCv, ev); hoverE = p.r >= 0 && p.r < N && p.c >= 0 && p.c < N ? p : null; });
  enemyCv.addEventListener("pointerleave", () => { hoverE = null; });
  enemyCv.addEventListener("click", (ev) => {
    if (!canFire()) return;
    const { r, c } = cellAt(enemyCv, ev);
    if (!(r >= 0 && r < N && c >= 0 && c < N) || view.fired[r * N + c]) return;
    if (mp) { busy = true; TungMP.sendMatch({ t: "tb_move", move: { t: "fire", r, c } }); beep(500, 0.08, "triangle"); return; }
    const res = BS.play(g, { t: "fire", r, c }, my);
    if (!res.ok) return setStatus(res.error, true);
    handleEvent(res.ev); view = BS.view(g, my); sync(); soloNext();
  });

  function handleEvent(ev) {
    if (!ev || ev.by === undefined) return;
    const mine = ev.by !== my;
    anims.push({ board: mine ? "mine" : "enemy", r: ev.r, c: ev.c, res: ev.res, t0: performance.now() });
  }

  // ---------- fleet chips + status ----------
  function chips(list, sunk) {
    const out = [];
    const left = list.slice();
    for (const s of sunk) { const i = left.indexOf(s.len); if (i >= 0) left.splice(i, 1); out.push(`<span class="ship sunk">${BS.NAMES[s.len]} (${s.len})</span>`); }
    for (const l of left) out.push(`<span class="ship">${BS.NAMES[l]} (${l})</span>`);
    return out.join("");
  }
  function sync() {
    const placing = editing();
    $("placeBtns").style.display = placing ? "" : "none";
    $("seaEnemy").classList.toggle("dim", !view || view.phase !== "fire");
    $("seaEnemy").classList.toggle("active", canFire());
    $("seaMine").classList.toggle("active", placing);
    if (view && view.phase === "fire") {
      $("enemyFleet").innerHTML = chips(BS.FLEET, view.sunkFoe);
      $("mineFleet").innerHTML = chips(BS.FLEET, view.sunkMine);
      $("enemyInfo").textContent = `(${view.fired.filter((x) => x === 2).length} hits)`;
      $("mineInfo").textContent = `(${view.incoming.filter((x) => x === 2).length} hit)`;
      if (view.over) setStatus(view.winner === my ? "🏆 Victory! You sank their whole fleet!" : "💀 Your fleet has been sunk.");
      else if (view.turn === my) setStatus(view.rule === "streak" ? "Your turn - a hit lets you fire again!" : "Your turn - click enemy waters to drop a bomb.");
      else setStatus(mp ? "Enemy is aiming…" : "The computer is aiming…");
    } else {
      $("enemyFleet").innerHTML = ""; $("mineFleet").innerHTML = ""; $("enemyInfo").textContent = ""; $("mineInfo").textContent = "";
      if (placing) setStatus("Arrange your fleet: drag a log to move it, click a log to turn it, then press Ready.");
    }
  }

  // ---------- solo ----------
  function newSolo() {
    mp = false; over = false; busy = false; my = 0; ready = false; view = null; g = null;
    fleet = BS.randomFleet(); anims.length = 0;
    sync();
  }
  function beginSoloBattle() {
    g = BS.newGame({ rule: $("rule").value });
    BS.play(g, { t: "place", ships: fleet }, 0);
    BS.play(g, { t: "place", ships: BS.randomFleet() }, 1);
    view = BS.view(g, 0);
    sync(); soloNext();
  }
  function soloNext() {
    if (mp || !g) return;
    if (g.over) {
      if (!over) { over = true; if (window.TungMP) TungMP.submitSolo({ game: "battleship", result: g.winner === 0 ? "win" : "loss" }); }
      sync(); return;
    }
    if (g.turn === 1) {
      busy = true; sync();
      setTimeout(() => {
        const shot = BS.ai(g, 1, $("level").value);
        const res = BS.play(g, { t: "fire", ...shot }, 1);
        busy = false;
        if (res.ok) handleEvent(res.ev);
        view = BS.view(g, 0); sync(); soloNext();
      }, 900);
    }
  }
  $("newBtn").addEventListener("click", newSolo);

  // ---------- multiplayer ----------
  if (window.TungMP) {
    TungMP.on("msg:tb_state", (m) => {
      if (!mp) return;
      my = m.idx; busy = false; view = m.state;
      if (m.ev && m.ev.by !== undefined) handleEvent(m.ev);
      if (view.myPlaced) ready = true;
      sync();
    });
    TungMP.on("msg:tb_reject", (m) => { busy = false; setStatus(m.error || "That wasn’t allowed.", true); if (!view || view.phase === "place") ready = !!(view && view.myPlaced); sync(); });
    TungMP.registerGame({
      prepareMatch(m) { mp = true; started = false; my = m.idx; ready = false; view = null; busy = false; fleet = BS.randomFleet(); anims.length = 0; sync(); },
      startMatch() { started = true; sync(); },
      stopMatch() { busy = true; sync(); },
      exitMatch() { mp = false; newSolo(); },
    });
  }
  newSolo();
  loop();
})();
