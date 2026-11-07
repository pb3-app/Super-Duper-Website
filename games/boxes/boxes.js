(() => {
  const B = window.Boxes;
  const $ = (id) => document.getElementById(id);
  const cv = $("board"), ctx = cv.getContext("2d"), statusEl = $("status");
  const CW = cv.width, M = 64;
  const COL = ["#ffcc33", "#4cc9f0"];
  let mp = false, my = 0, g = null, hover = -1, busy = false, over = false, names = ["You", "Computer"];
  let flash = null; // {boxes, t}

  const S = () => (CW - 2 * M) / g.n;
  const dot = (r, c) => [M + c * S(), M + r * S()];
  function edgeSeg(e) {
    const i = B.edgeInfo(g.n, e);
    return i.o === "h" ? [dot(i.r, i.c), dot(i.r, i.c + 1)] : [dot(i.r, i.c), dot(i.r + 1, i.c)];
  }
  function distSeg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    let t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  }
  function pick(ev) {
    const r = cv.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * CW, py = ((ev.clientY - r.top) / r.height) * CW;
    let best = -1, bd = S() * 0.28;
    for (let e = 0; e < g.edges.length; e++) {
      if (g.edges[e]) continue;
      const [a, b] = edgeSeg(e), d = distSeg(px, py, a, b);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CW);
    const s = S();
    // claimed boxes
    for (let b = 0; b < g.boxes.length; b++) {
      const o = g.boxes[b]; if (!o) continue;
      const r = Math.floor(b / g.n), c = b % g.n, [x, y] = dot(r, c);
      ctx.fillStyle = o === 1 ? "rgba(255,204,51,.16)" : "rgba(76,201,240,.16)";
      ctx.fillRect(x + 3, y + 3, s - 6, s - 6);
      window.TungArt.draw(ctx, x + s / 2, y + s / 2 + s * 0.02, s * 0.74, { green: o === 2, bat: 0.5, mouth: "open", look: [0, 0.2] });
    }
    // lines
    ctx.lineCap = "round";
    for (let e = 0; e < g.edges.length; e++) {
      const o = g.edges[e]; if (!o) continue;
      const [a, b] = edgeSeg(e);
      ctx.strokeStyle = COL[o - 1]; ctx.lineWidth = e === g.last ? 11 : 8;
      if (e === g.last) { ctx.shadowColor = COL[o - 1]; ctx.shadowBlur = 16; }
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // hover preview
    if (hover >= 0 && !g.edges[hover] && canMove()) {
      const [a, b] = edgeSeg(hover);
      ctx.strokeStyle = COL[my] + "99"; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    // dots
    ctx.fillStyle = "#f3e0bd";
    for (let r = 0; r <= g.n; r++) for (let c = 0; c <= g.n; c++) { const [x, y] = dot(r, c); ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill(); }
    // flash on a fresh capture
    if (flash && performance.now() - flash.t < 500) {
      const k = (performance.now() - flash.t) / 500;
      for (const b of flash.boxes) { const [x, y] = dot(Math.floor(b / g.n), b % g.n); ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 6; ctx.strokeRect(x + 4 - k * 6, y + 4 - k * 6, s - 8 + k * 12, s - 8 + k * 12); }
      requestAnimationFrame(draw);
    }
  }

  const canMove = () => !!g && !g.over && g.turn === my && !busy;
  function setStatus(t, bad) { statusEl.textContent = t; statusEl.classList.toggle("bad", !!bad); }
  function ui() {
    $("s0").textContent = `${my === 0 ? names[0] : names[1]}: ${g.score[0]}`;
    $("s1").textContent = `${my === 1 ? names[0] : names[1]}: ${g.score[1]}`;
    $("s0").classList.toggle("turn", !g.over && g.turn === 0);
    $("s1").classList.toggle("turn", !g.over && g.turn === 1);
    if (g.over) {
      setStatus(g.winner === null ? "It’s a tie!" : g.winner === my ? "🏆 You win!" : `${names[1]} wins.`);
    } else setStatus(g.turn === my ? "Your turn - draw a line." : mp ? "Waiting for your opponent…" : "Computer is thinking…");
    draw();
  }
  function noteCapture(prev) {
    const fresh = []; for (let b = 0; b < g.boxes.length; b++) if (g.boxes[b] && !(prev && prev[b])) fresh.push(b);
    if (fresh.length) flash = { boxes: fresh, t: performance.now() };
  }

  cv.addEventListener("pointermove", (ev) => { if (!g) return; const h = pick(ev); if (h !== hover) { hover = h; draw(); } });
  cv.addEventListener("pointerleave", () => { hover = -1; if (g) draw(); });
  cv.addEventListener("click", (ev) => {
    if (!canMove()) return;
    const e = pick(ev); if (e < 0) return;
    const i = B.edgeInfo(g.n, e);
    if (mp) { busy = true; TungMP.sendMatch({ t: "tb_move", move: i }); return; }
    const prev = g.boxes.slice();
    const r = B.play(g, i, my);
    if (!r.ok) return setStatus(r.error, true);
    noteCapture(prev); ui(); soloNext();
  });

  // ----- solo -----
  function newSolo() {
    mp = false; over = false; busy = false; names = ["You", "Computer"];
    my = Number($("side").value);
    g = B.newGame({ size: Number($("size").value) });
    ui(); soloNext();
  }
  function soloNext() {
    if (mp || !g) return;
    if (g.over) { if (!over) { over = true; if (g.winner !== null && window.TungMP) TungMP.submitSolo({ game: "boxes", result: g.winner === my ? "win" : "loss" }); } return; }
    if (g.turn !== my) {
      busy = true;
      setTimeout(() => {
        const mv = B.ai(g, $("level").value);
        busy = false;
        if (mv) { const prev = g.boxes.slice(); B.play(g, mv, g.turn); noteCapture(prev); }
        ui(); soloNext();
      }, 500);
    }
  }
  $("newBtn").addEventListener("click", newSolo);
  for (const id of ["size"]) $(id).addEventListener("change", newSolo);

  // ----- multiplayer -----
  if (window.TungMP) {
    TungMP.on("msg:tb_state", (m) => {
      if (!mp) return;
      const prev = g && g.boxes ? g.boxes.slice() : null;
      g = m.state; my = m.idx; busy = false; noteCapture(prev); ui();
    });
    TungMP.on("msg:tb_reject", (m) => { busy = false; setStatus(m.error || "That move wasn’t allowed.", true); });
    TungMP.registerGame({
      prepareMatch(m) { mp = true; my = m.idx; names = [m.you.username, m.opp.username]; g = B.newGame({ size: m.options.size }); busy = true; ui(); setStatus("Waiting for the game to start…"); },
      startMatch() {},
      stopMatch() { busy = true; },
      exitMatch() { mp = false; newSolo(); },
    });
  }
  newSolo();
})();
