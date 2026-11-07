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
  let selected = null;      // the first dot clicked
  let choices = null;       // several ways round: the player picks one
  let badStroke = null;
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
    if (choices) choices.forEach((c) => line(c.path, COLORS[myColor()], 4, [10, 8]));
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
      if (i === selected) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, R + 7, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS[myColor()];
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

  // ---------- input: click a dot, then the dot to join it to ----------
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  }
  function nearestDot(p, maxD = 26) {
    let best = -1, bd = maxD;
    state.dots.forEach((d, i) => {
      const dd = Math.hypot(d.x - p[0], d.y - p[1]);
      if (dd < bd) { bd = dd; best = i; }
    });
    return best;
  }
  function distToPath(p, pts) {
    let m = 1e9;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((p[0] - x0) * dx + (p[1] - y0) * dy) / l2)) : 0;
      m = Math.min(m, Math.hypot(p[0] - x0 - t * dx, p[1] - y0 - t * dy));
    }
    return m;
  }
  function flashBad(text) {
    setStatus(text, true);
    draw();
  }
  function cancel() { selected = null; choices = null; badStroke = null; }

  canvas.addEventListener("pointermove", (e) => {
    const i = canMove() ? nearestDot(pos(e)) : -1;
    canvas.style.cursor = i >= 0 && state.dots[i].deg < 3 ? "pointer" : choices ? "pointer" : "default";
  });

  canvas.addEventListener("click", (e) => {
    if (!canMove()) return;
    const p = pos(e);

    if (choices) { // pick which way round
      let best = null, bd = 34;
      for (const c of choices) { const d = distToPath(p, c.path); if (d < bd) { bd = d; best = c; } }
      if (best) { cancel(); return submit(best); }
      cancel();
      setStatus("Pick a dot to start a line. " + modeText(), false, myColor());
      return draw();
    }

    const i = nearestDot(p);
    if (selected === null) {
      if (i < 0) return;
      if (state.dots[i].deg >= 3) return flashBad("That dot already has 3 lines.");
      selected = i;
      setStatus("Now click the dot to join it to. Click the same dot again for a loop.", false, myColor());
      return draw();
    }

    if (i < 0) { cancel(); setStatus("Click a dot to start a line. " + modeText(), false, myColor()); return draw(); }
    const from = selected;
    if (state.dots[i].deg >= 3) { selected = null; return flashBad("That dot already has 3 lines."); }
    const options = Rules.movesFor(state, from, i);
    selected = null;
    if (!options.length) {
      setStatus(from === i ? "There isn’t room for a loop at that dot." : "Those dots can’t be joined without crossing a line.", true);
      return draw();
    }
    if (options.length === 1) return submit(options[0]);
    choices = options;
    setStatus("Two ways round. Click the line you want.", false, myColor());
    draw();
  });

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
    setStatus("Your turn: click a dot, then the dot to join it to. " + modeText(), false, 0);
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
      setStatus("Your turn. " + modeText(), false, 0);
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
    let cands = Rules.candidateMoves(state, 12);
    if (!cands.length) return endSolo(state.misere ? false : true);
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    let pick = cands[0], bestScore = -Infinity;
    for (const mv of cands.slice(0, 8)) {
      const t = Rules.clone(state);
      Rules.play(t, mv, 1);
      const left = Rules.candidateMoves(t, 6).length;
      // stuck opponent: great in normal play, a loss in misere
      let score = left === 0 ? (state.misere ? -100 : 100) : (state.misere ? left : -left);
      score += Math.random() * 1.5;
      if (score > bestScore) { bestScore = score; pick = mv; }
    }
    playMove(Rules.curve(state, pick), "ai");
  }

  document.getElementById("newBtn").addEventListener("click", newSolo);
  dotSel.addEventListener("change", newSolo);
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
    if (turn === myId()) setStatus("Your turn! " + modeText(), false, myIdx);
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

  newSolo();
})();
