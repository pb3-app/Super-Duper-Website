(() => {
  const W = window.TungWalls, TA = window.TungArt, TG = window.TungGear;
  const $ = (id) => document.getElementById(id);
  const cv = $("board"), ctx = cv.getContext("2d"), statusEl = $("status");

  let mp = false, my = 0, g = null, view = null, busy = false, over = false;
  let names = ["You", "Computer"], gears = [{}, {}], pals = [undefined, "blue"];
  let tool = null;            // 'h' | 'v' | null: a wall is being placed with the buttons
  let ghost = null;           // the wall being previewed: { r, c, o } in board coordinates
  let hover = null;           // the square under the mouse
  let hint = null;            // a suggested move
  let lastOrient = "h";
  let touchGhost = false;
  const anim = [null, null];  // where each tung is drawn (squares, so it can glide)
  const legsT = [0, 0];

  // ---- geometry: 9 squares, 8 gaps and a rim, in units ----
  const UNITS = 54 + 8 * 1.4 + 2 * 1.6;
  let S = 560, dpr = 1;
  const geo = () => { const u = S / UNITS; return { u, cell: 6 * u, gap: 1.4 * u, pad: 1.6 * u, step: 7.4 * u, top: 2.2 * u }; }; // top: room above the board for a tall tung on the far row
  function resize() {
    S = Math.max(240, Math.min(560, cv.parentElement.clientWidth || 560));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const H = S + geo().top;
    cv.width = Math.round(S * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = S + "px"; cv.style.height = H + "px";
  }
  addEventListener("resize", resize);

  // I always see myself at the bottom, so the second player sees the board turned round
  const flip = () => my === 1;
  const dCell = (r, c) => (flip() ? [8 - r, 8 - c] : [r, c]);
  const dWall = (r, c) => (flip() ? [7 - r, 7 - c] : [r, c]);
  const cellXY = (dr, dc) => { const k = geo(); return { x: k.pad + dc * k.step, y: k.pad + dr * k.step }; };

  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

  function wallRect(w) { // pixel box of a wall (display coordinates are worked out here)
    const k = geo(), [dr, dc] = dWall(w.r, w.c), x0 = k.pad + dc * k.step, y0 = k.pad + dr * k.step;
    if (w.o === "h") return { x: x0, y: y0 + k.cell, w: k.cell * 2 + k.gap, h: k.gap };
    return { x: x0 + k.cell, y: y0, w: k.gap, h: k.cell * 2 + k.gap };
  }
  function drawWall(w, style) {
    const k = geo(), b = wallRect(w), t = k.gap * 0.25;
    ctx.save();
    if (style === "ghost" || style === "bad" || style === "hint") {
      ctx.globalAlpha = style === "hint" ? 0.55 + 0.35 * Math.sin(performance.now() / 180) : 0.8;
      ctx.fillStyle = style === "bad" ? "#ff5a4a" : style === "hint" ? "#ffe066" : "#ffc933";
      rr(b.x - t, b.y - t, b.w + t * 2, b.h + t * 2, k.gap * 0.6); ctx.fill();
    } else {
      if (style === "last") { ctx.shadowColor = "#ffc933"; ctx.shadowBlur = k.gap * 2.2; }
      ctx.fillStyle = "#efcf98"; rr(b.x - t, b.y - t, b.w + t * 2, b.h + t * 2, k.gap * 0.6); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#c79a5a"; // a darker underside
      if (w.o === "h") rr(b.x - t, b.y + b.h * 0.55, b.w + t * 2, b.h * 0.45 + t, k.gap * 0.4); else rr(b.x + b.w * 0.55, b.y - t, b.w * 0.45 + t, b.h + t * 2, k.gap * 0.4);
      ctx.fill();
    }
    ctx.restore();
  }

  function chevrons(dr, up, color) {
    const k = geo(); ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = k.u * 0.7; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let dc = 0; dc < 9; dc++) {
      const { x, y } = cellXY(dr, dc), cx = x + k.cell / 2, cy = y + k.cell / 2, s = k.cell * 0.2, d = up ? 1 : -1;
      for (const o of [-0.16, 0.12]) { ctx.beginPath(); ctx.moveTo(cx - s, cy + (s * 0.5 - o * k.cell) * d * 1); ctx.lineTo(cx, cy - (s * 0.5 + o * k.cell) * d); ctx.lineTo(cx + s, cy + (s * 0.5 - o * k.cell) * d); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawTung(i, x, y, cell, now) {
    const gear = gears[i] || {}, mine = i === my;
    const bob = Math.sin(now / 420 + i * 2) * cell * 0.018, h = cell * 1.62;
    // the ring it stands on
    const ring = mine ? "#ffc933" : "#59b8ff";
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.32)"; ctx.beginPath(); ctx.ellipse(x, y + cell * 0.4, cell * 0.36, cell * 0.12, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = ring; ctx.lineWidth = cell * 0.06; ctx.beginPath(); ctx.ellipse(x, y + cell * 0.4, cell * 0.4, cell * 0.14, 0, 0, 7); ctx.stroke();
    ctx.restore();
    if (TA) TA.draw(ctx, x, y - cell * 0.16 + bob, h, { gear, pal: pals[i], look: [0, mine ? -0.8 : 0.8], bat: mine ? 0.55 : -0.45, legs: legsT[i], mouth: view && view.over && view.winner === i ? "open" : "smile", eyes: view && view.over && view.winner !== null && view.winner !== i ? "x" : "normal" });
    else { ctx.fillStyle = ring; ctx.beginPath(); ctx.arc(x, y, cell * 0.35, 0, 7); ctx.fill(); }
  }

  function draw() {
    syncMine();
    const now = performance.now(), k = geo(), s = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, k.top * dpr);
    ctx.clearRect(0, -k.top, S, S + k.top);
    // board
    ctx.fillStyle = "#2c1809"; rr(0, 0, S, S, S * 0.03); ctx.fill();
    ctx.fillStyle = "#3a1f0b"; rr(k.u * 0.5, k.u * 0.5, S - k.u, S - k.u, S * 0.025); ctx.fill();
    if (!s) return;
    // squares
    const myMoves = s && !s.over && s.turn === my && !busy && !tool ? W.pawnMoves(s, my) : [];
    for (let dr = 0; dr < 9; dr++) for (let dc = 0; dc < 9; dc++) {
      const { x, y } = cellXY(dr, dc);
      const goalMine = dr === 0, goalOpp = dr === 8;
      ctx.fillStyle = "#24130a"; rr(x, y + k.u * 0.5, k.cell, k.cell, k.u * 1.1); ctx.fill();
      ctx.fillStyle = goalMine ? "#8a6a2a" : goalOpp ? "#2f5f86" : "#6b4220"; rr(x, y, k.cell, k.cell, k.u * 1.1); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.08)"; rr(x + k.u * 0.3, y + k.u * 0.3, k.cell - k.u * 0.6, k.cell * 0.4, k.u * 0.9); ctx.fill();
    }
    chevrons(0, true, "rgba(255,226,120,.75)"); chevrons(8, false, "rgba(150,210,255,.7)");
    // where the last move came from
    if (s.last && s.last.t === "move") { const [dr, dc] = dCell(s.last.fr, s.last.fc), { x, y } = cellXY(dr, dc); ctx.fillStyle = s.last.idx === my ? "rgba(255,201,51,.28)" : "rgba(89,184,255,.28)"; rr(x, y, k.cell, k.cell, k.u * 1.1); ctx.fill(); }
    // moves I can make
    for (const m of myMoves) {
      const [dr, dc] = dCell(m.r, m.c), { x, y } = cellXY(dr, dc), cx = x + k.cell / 2, cy = y + k.cell / 2;
      const hot = hover && hover.r === m.r && hover.c === m.c;
      ctx.fillStyle = hot ? "rgba(255,201,51,.5)" : "rgba(255,201,51,.18)"; rr(x, y, k.cell, k.cell, k.u * 1.1); ctx.fill();
      ctx.strokeStyle = "#ffc933"; ctx.lineWidth = k.u * 0.6; ctx.beginPath(); ctx.arc(cx, cy, k.cell * (hot ? 0.3 : 0.24), 0, 7); ctx.stroke();
      ctx.fillStyle = "#ffc933"; ctx.beginPath(); ctx.arc(cx, cy, k.cell * 0.09, 0, 7); ctx.fill();
    }
    if (hint && hint.t === "move") { const [dr, dc] = dCell(hint.r, hint.c), { x, y } = cellXY(dr, dc); ctx.globalAlpha = 0.4 + 0.3 * Math.sin(now / 180); ctx.fillStyle = "#ffe066"; rr(x, y, k.cell, k.cell, k.u * 1.1); ctx.fill(); ctx.globalAlpha = 1; }
    // walls
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (s.h[r * 8 + c]) drawWall({ r, c, o: "h" }, s.last && s.last.t === "wall" && s.last.r === r && s.last.c === c && s.last.o === "h" ? "last" : "");
      if (s.v[r * 8 + c]) drawWall({ r, c, o: "v" }, s.last && s.last.t === "wall" && s.last.r === r && s.last.c === c && s.last.o === "v" ? "last" : "");
    }
    if (hint && hint.t === "wall") drawWall(hint, "hint");
    if (ghost) drawWall(ghost, canPlace(ghost) ? "ghost" : "bad");
    // tungs, the one further down the screen last so it overlaps the other
    for (let i = 0; i < 2; i++) {
      const p = s.pawns[i], [dr, dc] = dCell(p.r, p.c);
      if (!anim[i]) anim[i] = { r: dr, c: dc };
      const a = anim[i], dx = dr - a.r, dy = dc - a.c;
      a.r += dx * 0.22; a.c += dy * 0.22;
      const moving = Math.abs(dx) + Math.abs(dy) > 0.04;
      legsT[i] = moving ? (legsT[i] + 0.06) % 1 : 0;
      if (!moving) { a.r = dr; a.c = dc; }
    }
    if (s.over) { ctx.fillStyle = "rgba(20,10,4,.35)"; rr(0, 0, S, S, S * 0.03); ctx.fill(); }
    const order = [0, 1].sort((a, b) => anim[a].r - anim[b].r);
    for (const i of order) {
      const a = anim[i], { x, y } = cellXY(a.r, a.c);
      if (s.turn === i && !s.over) { ctx.save(); ctx.globalAlpha = 0.35 + 0.2 * Math.sin(now / 260); ctx.fillStyle = i === my ? "#ffc933" : "#59b8ff"; ctx.beginPath(); ctx.arc(x + k.cell / 2, y + k.cell * 0.55, k.cell * 0.6, 0, 7); ctx.fill(); ctx.restore(); }
      drawTung(i, x + k.cell / 2, y + k.cell / 2, k.cell, now);
    }
    if (s.over) {
      ctx.fillStyle = "#fff3d6"; ctx.textAlign = "center"; ctx.font = `900 ${S * 0.085}px Nunito, sans-serif`;
      ctx.fillText(s.winner === my ? "🏆 You win!" : mp ? names[s.winner] + " wins" : "Computer wins", S / 2, S / 2 + S * 0.03);
    }
  }
  // who I am and what I wear can arrive after the page opens (the account loads a moment later), so look again as it changes
  let mineKey = "";
  function syncMine() {
    if (mp || !view || !TG) return;
    const u = window.TungMP && TungMP.user, key = JSON.stringify([u && u.username, u && u.gear]);
    if (key === mineKey) return;
    mineKey = key; gears[my] = TG.mine();
    const nm = (u && u.username) || "You"; if (names[my] !== nm) names[my] = nm;
    portraits(); render();
  }
  (function loop() { draw(); requestAnimationFrame(loop); })();
  window.__walls = { draw, state: () => view, setTool: (t) => setTool(t) }; // for testing

  // ---- input ----
  const canPlace = (w) => !!view && !view.over && view.turn === my && !busy && view.left[my] > 0 && W.wallLegal(view, w);
  function pointer(e) { const b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * (S / b.width), y: (e.clientY - b.top) * (S / b.width) - geo().top }; }
  function cellAt(x, y) { // the square under a point, or null if it is in a gap
    const k = geo(), fx = (x - k.pad) / k.step, fy = (y - k.pad) / k.step, dc = Math.floor(fx), dr = Math.floor(fy);
    if (dc < 0 || dc > 8 || dr < 0 || dr > 8) return null;
    if ((fx - dc) * k.step > k.cell || (fy - dr) * k.step > k.cell) return null;
    const [r, c] = dCell(dr, dc); return { r, c };
  }
  function wallAt(x, y) { // the wall a point is asking for, or null
    const k = geo(), ic = Math.max(1, Math.min(8, Math.round((x - k.pad + k.gap / 2) / k.step))), ir = Math.max(1, Math.min(8, Math.round((y - k.pad + k.gap / 2) / k.step)));
    const cx = k.pad + ic * k.step - k.gap / 2, cy = k.pad + ir * k.step - k.gap / 2, dx = x - cx, dy = y - cy;
    let o = tool;
    if (!o) {
      const inH = Math.abs(dy) < k.gap * 0.85, inV = Math.abs(dx) < k.gap * 0.85;
      if (!inH && !inV) return null;
      if (x < k.pad || y < k.pad || x > S - k.pad || y > S - k.pad) return null;
      o = inH && inV ? lastOrient : inH ? "h" : "v";
    }
    const [r, c] = dWall(ir - 1, ic - 1); // a wall's corner, turned back to board coordinates
    return { r, c, o };
  }
  cv.addEventListener("pointermove", (e) => {
    if (!view || view.over || view.turn !== my || busy) { ghost = null; hover = null; return; }
    const p = pointer(e);
    hover = cellAt(p.x, p.y);
    if (e.pointerType === "touch" && !touchGhost) return;
    ghost = tool || !hover ? wallAt(p.x, p.y) : null;
  });
  cv.addEventListener("pointerleave", () => { hover = null; if (!touchGhost) ghost = null; });
  cv.addEventListener("pointerdown", (e) => {
    if (!view || view.over || view.turn !== my || busy) return;
    const p = pointer(e), cell = cellAt(p.x, p.y), w = tool || !cell ? wallAt(p.x, p.y) : null;
    hint = null; $("twHint").textContent = "";
    if (cell && !tool) {
      if (W.pawnMoves(view, my).some((m) => m.r === cell.r && m.c === cell.c)) { ghost = null; touchGhost = false; submit({ t: "move", r: cell.r, c: cell.c }); }
      return;
    }
    if (!w) return;
    if (w.o) lastOrient = w.o;
    if (e.pointerType === "touch" && !(ghost && ghost.r === w.r && ghost.c === w.c && ghost.o === w.o)) { ghost = w; touchGhost = true; $("twHint").textContent = canPlace(w) ? "Tap the same spot again to place the wall." : "That wall is not allowed there."; return; }
    ghost = w;
    if (!canPlace(w)) { setStatus(view.left[my] <= 0 ? "You are out of walls." : "A wall cannot go there (it overlaps another wall, or it would shut a tung in).", true); return; }
    ghost = null; touchGhost = false; setTool(null);
    submit({ t: "wall", r: w.r, c: w.c, o: w.o });
  });
  function setTool(t) { tool = t; ghost = null; touchGhost = false; $("wallH").classList.toggle("on", t === "h"); $("wallV").classList.toggle("on", t === "v"); cv.style.cursor = t ? "crosshair" : "pointer"; if (t) lastOrient = t; }
  $("wallH").addEventListener("click", () => setTool(tool === "h" ? null : "h"));
  $("wallV").addEventListener("click", () => setTool(tool === "v" ? null : "v"));
  addEventListener("keydown", (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) return;
    if (e.key === "Escape") setTool(null);
    else if (e.key === "h" || e.key === "H") setTool(tool === "h" ? null : "h");
    else if (e.key === "v" || e.key === "V") setTool(tool === "v" ? null : "v");
  });
  $("hintBtn").addEventListener("click", () => {
    if (mp) return setStatus("No hints in an online game.", true);
    if (!view || view.over || view.turn !== my || busy) return;
    const m = W.ai(W.clone(view), "hard"); if (!m) return;
    hint = m; $("twHint").textContent = m.t === "move" ? "Hint: step to the glowing square." : "Hint: a wall there would slow them down.";
  });

  function submit(move) {
    hint = null;
    if (mp) { busy = true; TungMP.sendMatch({ t: "tb_move", move }); render(); return; }
    const r = W.play(g, move, my);
    if (!r.ok) return setStatus(r.error, true);
    view = g; render(); tick();
  }

  // ---- the page around the board ----
  function setStatus(t, bad) { statusEl.textContent = t; statusEl.classList.toggle("bad", !!bad); }
  function pips(el, left) { el.replaceChildren(...Array.from({ length: W.WALLS }, (_, i) => { const x = document.createElement("i"); if (i >= left) x.className = "used"; return x; })); }
  function portrait(el, i) { if (TA) el.src = TA.dataURL({ gear: gears[i] || {}, pal: pals[i], look: [0, 0.2] }, 56, 80); }
  function render() {
    const s = view; if (!s) return;
    const opp = 1 - my;
    $("nmMe").textContent = names[my]; $("nmOpp").textContent = names[opp];
    $("subMe").textContent = "You · " + (my === 0 ? "first" : "second"); $("subOpp").textContent = mp ? "Opponent" : "Computer";
    pips($("pipsMe"), s.left[my]); pips($("pipsOpp"), s.left[opp]);
    $("cardMe").classList.toggle("turn", !s.over && s.turn === my); $("cardOpp").classList.toggle("turn", !s.over && s.turn === opp);
    $("wallH").disabled = $("wallV").disabled = s.over || s.left[my] <= 0;
    if (s.over) setStatus(s.winner === my ? "🏆 You win! You reached the far side first." : mp ? names[s.winner] + " got across first." : "The computer got across first.");
    else if (s.turn === my) setStatus(`Your turn: step to a glowing circle or place a wall (you have ${s.left[my]}).`);
    else setStatus(mp ? "Waiting for your opponent…" : "Computer is thinking…");
  }

  // ----- solo -----
  function newSolo() {
    mp = false; over = false; busy = false; hint = null; setTool(null); $("hintBtn").hidden = false; $("twHint").textContent = "";
    my = Number($("side").value);
    const me = (window.TungMP && TungMP.user && TungMP.user.username) || "You";
    names = my === 0 ? [me, "Computer"] : ["Computer", me];
    gears = [{}, {}]; pals = [undefined, undefined];
    gears[my] = TG ? TG.mine() : {}; pals[1 - my] = "blue";
    anim[0] = anim[1] = null;
    g = W.newGame(); view = g; render(); portraits(); tick();
  }
  function portraits() { portrait($("imgMe"), my); portrait($("imgOpp"), 1 - my); }
  function tick() {
    if (mp || !g) return;
    if (g.over) return finishSolo();
    if (g.turn !== my) {
      busy = true; render();
      setTimeout(() => {
        const mv = W.ai(g, $("level").value);
        busy = false;
        if (mv) W.play(g, mv, g.turn);
        view = g; render();
        if (g.over) finishSolo();
      }, 600);
    }
  }
  function finishSolo() {
    if (over) return; over = true;
    if (g.winner === null) return;
    if (window.TungMP) TungMP.submitSolo({ game: "walls", result: g.winner === my ? "win" : "loss" });
  }
  $("newBtn").addEventListener("click", newSolo);
  $("level").addEventListener("change", newSolo);
  $("side").addEventListener("change", newSolo);

  // ----- multiplayer -----
  if (window.TungMP) {
    TungMP.on("msg:tb_state", (m) => { if (!mp) return; view = m.state; my = m.idx; busy = false; render(); });
    TungMP.on("msg:tb_reject", (m) => { busy = false; setStatus(m.error || "That move wasn’t allowed.", true); if (view) render(); });
    TungMP.registerGame({
      prepareMatch(m) {
        mp = true; my = m.idx; hint = null; setTool(null); $("hintBtn").hidden = true; $("twHint").textContent = "";
        names = m.idx === 0 ? [m.you.username, m.opp.username] : [m.opp.username, m.you.username];
        gears = [{}, {}]; pals = [undefined, undefined];
        gears[my] = TG ? (Array.isArray(m.you.gear) && m.you.gear.some(Boolean) ? TG.fromNums(m.you.gear) : TG.mine()) : {}; gears[1 - my] = TG ? TG.fromNums(m.opp.gear) : {};
        pals[1 - my] = Object.keys(gears[1 - my]).length ? undefined : "blue";
        anim[0] = anim[1] = null;
        view = W.newGame(); busy = true; render(); portraits(); setStatus("Waiting for the game to start…");
      },
      startMatch() {},
      stopMatch() { busy = true; },
      exitMatch() { mp = false; newSolo(); },
    });
  }
  resize();
  newSolo();
  if (window.TungMP && TungMP.booted) TungMP.booted.then(() => { if (!mp) newSolo(); });
})();
