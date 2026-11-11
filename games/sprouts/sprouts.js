(() => {
  const Rules = window.SproutsRules;
  const { W, H, R } = Rules;
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const dotSel = document.getElementById("dotCount");
  const modeSel = document.getElementById("modeSel");

  // Each player's lines have their own colour: player 0 gold, player 1 blue.
  const COLORS = ["#ffcc33", "#4cc9f0"];
  const COLOR_NAMES = ["gold", "blue"];

  let state = Rules.newGame(3, false);
  let mp = null;            // {id, options} while in a multiplayer match
  let started = false;      // MP: server has sent the game state
  let waiting = false;      // MP: our move is on its way to the server
  let turn = "me";          // solo: "me" | "ai"; MP: user id whose turn it is
  let over = false;
  let drag = null;          // the line being drawn: { from, pts }
  let hoverDot = -1;        // the dot the line would end on if you let go now
  let badStroke = null;     // a line that was not allowed, shown in red for a moment
  let aiTimer = null;
  let lastEdges = 0;
  let myMoves = 0;
  let myIdx = 0;            // which colour is mine

  const myId = () => (window.TungMP && TungMP.user ? TungMP.user.id : null);

  function setStatus(text, bad, colorIdx) {
    statusEl.textContent = "";
    if (colorIdx != null) {
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = COLORS[colorIdx];
      statusEl.append(sw);
    }
    statusEl.append(text);
    statusEl.classList.toggle("bad", !!bad);
  }
  const modeText = () => (state.misere ? "Misère: if you can’t move, you win." : "Normal: if you can’t move, you lose.");

  // ---------- drawing ----------
  function line(pts, color, width, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#1b1030";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    state.edges.forEach((e, i) => {
      const fresh = i >= state.edges.length - 2 && state.edges.length === lastEdges;
      line(e.pts, COLORS[e.by || 0], fresh ? 6 : 4);
    });
    if (drag && drag.pts.length > 1) { line(drag.pts, COLORS[myColor()], 5); ctx.globalAlpha = 0.25; line(drag.pts, "#ffffff", 9); ctx.globalAlpha = 1; }
    if (badStroke) line(badStroke, "#ff5252", 4, [6, 6]);

    const canPick = canMove();
    state.dots.forEach((d, i) => {
      const dead = d.deg >= 3;
      ctx.beginPath();
      ctx.arc(d.x, d.y, R, 0, Math.PI * 2);
      ctx.fillStyle = dead ? "#555" : "#f4f1e8";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = dead ? "#222" : "#3a2208";
      ctx.stroke();
      // degree pips
      for (let k = 0; k < d.deg && !dead; k++) {
        ctx.beginPath();
        ctx.arc(d.x - 3 + k * 3, d.y, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = "#3a2208";
        ctx.fill();
      }
      if (drag && i === drag.from) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, R + 7, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS[myColor()];
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (drag && i === hoverDot && !dead) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, R + 7, 0, Math.PI * 2);
        ctx.strokeStyle = "#7df08f";
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (canPick && !dead) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, R + 5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,.28)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }
  const myColor = () => (mp ? myIdx : 0);

  function canMove() {
    if (over) return false;
    if (mp) return started && !waiting && turn === myId();
    return turn === "me";
  }

  // ---------- input: drag from a dot to another dot (or back to the same one for a loop) ----------
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  }
  function nearestDot(p, maxD = 28) {
    let best = -1, bd = maxD;
    state.dots.forEach((d, i) => {
      const dd = Math.hypot(d.x - p[0], d.y - p[1]);
      if (dd < bd) { bd = dd; best = i; }
    });
    return best;
  }
  function flashBad(text) {
    setStatus(text, true);
    draw();
  }
  function cancel() { drag = null; hoverDot = -1; badStroke = null; }
  const hint = () => (mp ? "Your turn! " : "Your turn: ") + "drag from a dot to another dot (or back to the same dot for a loop). " + modeText();
  let badTimer = 0;
  function showBad(pts, text) {
    badStroke = pts; clearTimeout(badTimer); badTimer = setTimeout(() => { badStroke = null; draw(); }, 1400);
    setStatus(text, true); draw();
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!canMove() || drag) return;
    const p = pos(e), i = nearestDot(p);
    e.preventDefault();
    if (i < 0) return;
    if (state.dots[i].deg >= 3) return flashBad("That dot already has 3 lines.");
    badStroke = null;
    drag = { from: i, pts: [[state.dots[i].x, state.dots[i].y]], id: e.pointerId, blocked: false };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    setStatus("Keep going, then let go on the dot you want to join.", false, myColor());
    draw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) {
      const i = canMove() ? nearestDot(pos(e)) : -1;
      canvas.style.cursor = i >= 0 && state.dots[i].deg < 3 ? "grab" : "default";
      return;
    }
    if (e.pointerId !== drag.id) return;
    canvas.style.cursor = "grabbing";
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of list.length ? list : [e]) {
      const p = pos(ev), last = drag.pts[drag.pts.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 3) continue;
      p[0] = Math.max(1, Math.min(W - 1, p[0])); p[1] = Math.max(1, Math.min(H - 1, p[1]));
      const next = drag.pts.concat([p]);
      if (Rules.strokeBlocked(state, next, drag.from)) { // the line stops at whatever it would cross: steer round it
        if (!drag.blocked) { drag.blocked = true; setStatus("The line can’t cross another line (or itself). Steer around it.", true); }
        continue;
      }
      if (drag.blocked) { drag.blocked = false; setStatus("Keep going, then let go on the dot you want to join.", false, myColor()); }
      drag.pts = next;
    }
    const tip = drag.pts[drag.pts.length - 1], d = nearestDot(tip, 26);
    hoverDot = d >= 0 && state.dots[d].deg < 3 && (d !== drag.from || Rules.pathLen(drag.pts) > 60) ? d : -1;
    draw();
  });
  function endStroke(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null; hoverDot = -1;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (cancelled) { setStatus(hint(), false, myColor()); return draw(); }
    const len = Rules.pathLen(d.pts);
    if (len < 12) { setStatus(hint(), false, myColor()); return draw(); } // just a tap
    const tip = d.pts[d.pts.length - 1], to = nearestDot(tip, 30);
    if (to < 0) return showBad(d.pts, "Let go on a dot to finish the line.");
    if (state.dots[to].deg >= 3) return showBad(d.pts, "That dot already has 3 lines.");
    const r = Rules.stroke(state, d.from, to, d.pts);
    if (!r.ok) return showBad(d.pts, r.error);
    submit({ from: d.from, to, path: r.path });
  }
  canvas.addEventListener("pointerup", (e) => endStroke(e, false));
  canvas.addEventListener("pointercancel", (e) => endStroke(e, true));

  function submit(mv) {
    if (mp) {
      waiting = true;
      TungMP.sendMatch({ t: "sp_move", from: mv.from, to: mv.to, path: mv.path });
      setStatus("Sending…");
      draw();
    } else {
      playMove(mv, "me");
    }
  }

  // ---------- solo game ----------
  function newSolo() {
    clearTimeout(aiTimer);
    state = Rules.newGame(Number(dotSel.value), modeSel.value === "misere");
    lastEdges = 0; over = false; turn = "me"; cancel();
    setStatus(hint(), false, 0);
    draw();
  }

  function playMove(mv, who) {
    const r = Rules.play(state, mv, who === "me" ? 0 : 1);
    if (!r.ok) { setStatus(r.error, true); return false; }
    lastEdges = state.edges.length;
    if (!Rules.hasMove(state)) {
      // the other side is stuck
      const stuckIsAi = who === "me";
      const stuckWins = state.misere; // the stuck side wins only in misère
      const iWin = stuckIsAi ? !stuckWins : stuckWins;
      return endSolo(iWin);
    }
    turn = who === "me" ? "ai" : "me";
    if (turn === "ai") {
      setStatus("Computer is thinking…", false, 1);
      draw();
      aiTimer = setTimeout(aiMove, 650);
    } else {
      setStatus(hint(), false, 0);
      draw();
    }
    return true;
  }

  function endSolo(iWin) {
    over = true;
    turn = "none";
    setStatus(iWin ? "🏆 You win! The computer has no moves left or was forced to finish." : "💀 The computer wins this round.");
    draw();
    if (window.TungMP) TungMP.submitSolo({ game: "sprouts", result: iWin ? "win" : "loss" });
  }

  function aiMove() {
    if (over) return;
    // easy plays any legal move, medium weighs 8 moves by how few replies you are left with, hard weighs more of them more carefully
    const level = document.getElementById("level").value, P = { easy: { n: 6, look: 0, tries: 0, noise: 99 }, medium: { n: 12, look: 6, tries: 8, noise: 1.5 }, hard: { n: 24, look: 14, tries: 16, noise: 0.25 } }[level] || { n: 12, look: 6, tries: 8, noise: 1.5 };
    let cands = Rules.candidateMoves(state, P.n);
    if (!cands.length) return endSolo(state.misere ? false : true);
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    let pick = cands[0], bestScore = -Infinity;
    for (const mv of cands.slice(0, P.tries || 1)) {
      if (!P.tries) break;
      const t = Rules.clone(state);
      Rules.play(t, mv, 1);
      const left = Rules.candidateMoves(t, P.look).length;
      // stuck opponent: great in normal play, a loss in misere
      let score = left === 0 ? (state.misere ? -100 : 100) : (state.misere ? left : -left);
      score += Math.random() * P.noise;
      if (score > bestScore) { bestScore = score; pick = mv; }
    }
    playMove(Rules.curve(state, pick), "ai");
  }

  document.getElementById("newBtn").addEventListener("click", newSolo);
  dotSel.addEventListener("change", newSolo);
  document.getElementById("level").addEventListener("change", newSolo);
  modeSel.addEventListener("change", newSolo);

  // ---------- multiplayer ----------
  function applyServerState(s, t, idx) {
    state = s;
    turn = t;
    if (typeof idx === "number") myIdx = idx;
    lastEdges = state.edges.length;
    waiting = false;
    cancel();
    updateTurnText();
    draw();
  }
  function updateTurnText() {
    if (over) return;
    if (turn === myId()) setStatus(hint(), false, myIdx);
    else setStatus("Opponent’s turn…", false, 1 - myIdx);
  }

  if (window.TungMP) {
    TungMP.on("msg:sp_start", (m) => { started = true; applyServerState(m.state, m.turn, m.idx); });
    TungMP.on("msg:sp_move", (m) => {
      if (!mp) return;
      Rules.applyValid(state, m.move);
      lastEdges = state.edges.length;
      turn = m.next;
      waiting = false;
      cancel();
      if (m.next !== myId()) myMoves++, TungMP.progress(myMoves);
      updateTurnText();
      draw();
    });
    TungMP.on("msg:sp_reject", (m) => { waiting = false; setStatus(m.error || "That move wasn’t allowed.", true); draw(); });

    TungMP.registerGame({
      prepareMatch(m) {
        mp = { id: m.id };
        started = false; waiting = false; over = false; myMoves = 0; myIdx = 0;
        clearTimeout(aiTimer);
        state = Rules.newGame(m.options.dots, m.options.mode === "misere");
        lastEdges = 0;
        cancel();
        setStatus("Get ready… " + modeText());
        draw();
      },
      startMatch() {},
      stopMatch() { over = true; started = false; draw(); },
      exitMatch() { mp = null; started = false; waiting = false; newSolo(); },
    });
  }

  window.__sprouts = () => ({ state, drag, over, turn }); // for testing
  newSolo();
})();
