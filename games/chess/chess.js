(() => {
  const C = window.ChessRules;
  const $ = (id) => document.getElementById(id);
  const boardEl = $("board"), statusEl = $("status");
  const ART = {
    K: ["🪵", "Tung Tung Tung Sahur"], Q: ["☕", "Ballerina Cappuccina"], R: ["🐊", "Bombardiro Crocodilo"],
    B: ["🥷", "Cappuccino Assassino"], N: ["🦈", "Tralalero Tralala"], P: ["🐸", "Trippi Troppi"],
  };
  let mp = false, my = 0, st = null, busy = false, over = false, names = ["You", "Opponent"];
  let sel = null; // {from} or {drop}
  let legal = [];
  let drag = null;
  let audio;

  function beep(f, d) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      o.type = "triangle"; o.frequency.value = f; g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (_) {}
  }
  function setStatus(t, bad) { statusEl.textContent = t; statusEl.classList.toggle("bad", !!bad); }
  const sqName = C.sqName;

  const pieceEl = (p, prom) => {
    const d = document.createElement("div");
    const t = p.toUpperCase();
    d.className = "piece " + (p === t ? "w" : "b") + (prom ? " prom" : "");
    d.textContent = ART[t][0]; d.title = ART[t][1];
    return d;
  };

  // The crew legend
  const crew = $("crew");
  for (const t of ["K", "Q", "R", "B", "N", "P"]) {
    const w = pieceEl(t, false), name = document.createElement("span");
    name.textContent = `${ART[t][1]} (${{ K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn" }[t]})`;
    crew.append(w, name);
  }

  // ---------- rendering ----------
  function displayToSq(i) {
    const r = my === 0 ? 7 - (i >> 3) : i >> 3, f = my === 0 ? i & 7 : 7 - (i & 7);
    return r * 8 + f;
  }
  function targetsFor() {
    const m = new Map();
    if (!sel) return m;
    for (const mv of legal) {
      if (sel.drop ? mv.drop === sel.drop : (!mv.drop && mv.from === sel.from)) m.set(mv.to, (m.get(mv.to) || []).concat(mv));
    }
    return m;
  }
  function render() {
    if (!st) return;
    legal = !st.over && st.turn === my && !busy ? C.legalMoves(st) : [];
    const targets = targetsFor();
    const kingSq = st.check ? st.board.indexOf(st.turn === 0 ? "K" : "k") : -1;
    boardEl.replaceChildren();
    for (let i = 0; i < 64; i++) {
      const s = displayToSq(i), r = s >> 3, f = s & 7;
      const d = document.createElement("div");
      d.className = "sq " + ((r + f) % 2 === 0 ? "d" : "l");
      d.dataset.sq = s;
      if (st.last && (st.last.from === s || st.last.to === s)) d.classList.add("last");
      if (sel && sel.from === s) d.classList.add("sel");
      if (s === kingSq) d.classList.add("check");
      if (targets.has(s)) { d.classList.add("target"); if (st.board[s]) d.classList.add("cap"); }
      const p = st.board[s];
      if (p) d.append(pieceEl(p, st.prom && st.prom[s]));
      if (i >= 56) { const c = document.createElement("span"); c.className = "coord f"; c.textContent = "abcdefgh"[f]; d.append(c); }
      if (i % 8 === 0) { const c = document.createElement("span"); c.className = "coord r"; c.textContent = r + 1; d.append(c); }
      boardEl.append(d);
    }
    // hands (crazyhouse) and captured pieces (standard)
    const cz = st.variant === "crazyhouse";
    const fill = (el, side) => {
      el.replaceChildren();
      const tag = document.createElement("span"); tag.className = "tag";
      tag.textContent = (side === my ? "You" : names[1]) + (cz ? " - hand:" : " - took:");
      el.append(tag);
      if (cz) {
        let any = false;
        for (const t of C.HAND) {
          const n = st.hand[side][t]; if (!n) continue; any = true;
          const w = document.createElement("span");
          w.className = "hp" + (side === my && st.turn === my && !st.over ? " mine" : "") + (sel && sel.drop === t && side === my ? " sel" : "");
          w.append(pieceEl(side === 0 ? t : t.toLowerCase(), false));
          const nn = document.createElement("span"); nn.className = "n"; nn.textContent = n; w.append(nn);
          if (side === my) w.addEventListener("click", () => pickDrop(t));
          el.append(w);
        }
        if (!any) el.append(document.createTextNode("empty"));
      } else {
        const list = st.taken[side].map((t) => ART[t][0]).join(" ");
        el.append(document.createTextNode(list || "-"));
      }
    };
    fill($("handTop"), 1 - my); fill($("handBot"), my);
    // move list
    const mv = $("moves"); mv.replaceChildren();
    for (let i = 0; i < st.log.length; i += 2) {
      const n = document.createElement("span"); n.className = "n"; n.textContent = i / 2 + 1 + ".";
      const a = document.createElement("span"); a.textContent = st.log[i];
      const b = document.createElement("span"); b.textContent = st.log[i + 1] || "";
      mv.append(n, a, b);
    }
    mv.scrollTop = mv.scrollHeight;
    // status
    if (st.over) {
      const why = { checkmate: "Checkmate", stalemate: "Stalemate - draw", repetition: "Draw by repetition", fifty: "Draw - fifty-move rule", material: "Draw - not enough pieces" }[st.reason] || "Game over";
      setStatus(st.winner === null ? `🤝 ${why}.` : st.winner === my ? `🏆 ${why} - you win!` : `${why} - ${mp ? names[1] : "the computer"} wins.`);
    } else {
      const check = st.check ? " Check!" : "";
      if (st.turn === my) setStatus(`Your move (${my === 0 ? "White" : "Black"}).${check}`);
      else setStatus((mp ? "Waiting for your opponent…" : "Computer is thinking…") + check);
    }
    $("handTop").parentElement.style.setProperty("--sq", "");
  }

  // ---------- moving ----------
  function pickDrop(t) {
    if (!st || st.over || st.turn !== my || busy) return;
    sel = sel && sel.drop === t ? null : { drop: t };
    render();
  }
  function trySquare(s) {
    if (!st || st.over || st.turn !== my || busy) return;
    const targets = targetsFor();
    if (sel && targets.has(s)) return commit(targets.get(s));
    const p = st.board[s];
    if (p && (p === p.toUpperCase() ? 0 : 1) === my && legal.some((m) => !m.drop && m.from === s)) { sel = { from: s }; render(); }
    else { sel = null; render(); }
  }
  function commit(moves) {
    const mv = moves[0];
    if (moves.length > 1 && moves[0].promo) { // promotion: ask
      const wrap = document.createElement("div"); wrap.className = "promo";
      const box = document.createElement("div"); box.className = "box";
      for (const t of ["Q", "R", "B", "N"]) {
        const el = pieceEl(my === 0 ? t : t.toLowerCase(), false); el.style.cursor = "pointer";
        el.addEventListener("click", () => { wrap.remove(); send({ from: mv.from, to: mv.to, promo: t }); });
        box.append(el);
      }
      wrap.append(box); document.body.append(wrap);
      return;
    }
    send(mv.drop ? { drop: mv.drop, to: mv.to } : { from: mv.from, to: mv.to, promo: mv.promo });
  }
  function send(move) {
    sel = null;
    if (mp) { busy = true; TungMP.sendMatch({ t: "tb_move", move }); render(); return; }
    const before = st.board.filter(Boolean).length;
    const r = C.play(st, move, my);
    if (!r.ok) return setStatus(r.error, true);
    beep(st.board.filter(Boolean).length < before ? 220 : 330, 0.09);
    render(); soloNext();
  }

  // pointer: click or drag
  boardEl.addEventListener("pointerdown", (e) => {
    const sqEl = e.target.closest(".sq"); if (!sqEl) return;
    const s = Number(sqEl.dataset.sq);
    const p = st && st.board[s];
    const mine = p && (p === p.toUpperCase() ? 0 : 1) === my;
    if (mine && st.turn === my && !st.over && !busy) {
      if (!(sel && targetsFor().has(s))) { sel = { from: s }; render(); }
      drag = { s, x: e.clientX, y: e.clientY, el: null, p };
    }
    drag = drag || null;
    if (!drag) { trySquare(s); return; }
    boardEl.setPointerCapture && boardEl.setPointerCapture(e.pointerId);
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.el && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 7) {
      drag.el = pieceEl(drag.p, false); drag.el.classList.add("drag");
      drag.el.style.setProperty("--sq", getComputedStyle(boardEl.parentElement).getPropertyValue("--sq"));
      document.body.append(drag.el);
      const src = boardEl.querySelector(`.sq[data-sq="${drag.s}"] .piece`); if (src) src.style.opacity = ".3";
    }
    if (drag.el) { drag.el.style.left = e.clientX + "px"; drag.el.style.top = e.clientY + "px"; }
  });
  window.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.el) {
      d.el.remove();
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const sqEl = under && under.closest && under.closest(".sq");
      if (sqEl) {
        const to = Number(sqEl.dataset.sq), moves = (targetsFor().get(to)) || [];
        if (moves.length) return commit(moves);
      }
      render();
    } else {
      // plain click on own piece: already selected on pointerdown; clicking a target handled below
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const sqEl = under && under.closest && under.closest(".sq");
      if (sqEl && Number(sqEl.dataset.sq) === d.s && sel && sel.from === d.s) { /* selected */ }
    }
  });

  // ---------- solo ----------
  function newSolo() {
    mp = false; over = false; busy = false; sel = null; names = ["You", "Computer"];
    my = Number($("side").value);
    st = C.newGame({ variant: $("variant").value });
    $("help").style.display = st.variant === "crazyhouse" ? "" : "";
    render(); soloNext();
  }
  function soloNext() {
    if (mp || !st) return;
    if (st.over) {
      if (!over) { over = true; if (st.winner !== null && window.TungMP) TungMP.submitSolo({ game: "chess", result: st.winner === my ? "win" : "loss" }); }
      return;
    }
    if (st.turn !== my) {
      busy = true; render();
      setTimeout(() => {
        const mv = C.ai(st, $("level").value);
        busy = false;
        if (mv) { const before = st.board.filter(Boolean).length; C.play(st, mv, st.turn); beep(st.board.filter(Boolean).length < before ? 200 : 300, 0.09); }
        render(); soloNext();
      }, 80);
    }
  }
  $("newBtn").addEventListener("click", newSolo);
  $("resignBtn").addEventListener("click", () => {
    if (mp || !st || st.over || over) return;
    if (!confirm("Resign this game? It counts as a loss on the solo leaderboard.")) return;
    over = true; st.over = true; st.winner = 1 - my; st.reason = "resign";
    if (window.TungMP) TungMP.submitSolo({ game: "chess", result: "loss" });
    render(); setStatus("You resigned.");
  });
  $("mpResign").addEventListener("click", () => {
    if (!mp || !TungMP.match || (st && st.over)) return;
    if (confirm("Resign? This counts as a loss.")) TungMP.send({ t: "leave_match", matchId: TungMP.match.id });
  });

  // ---------- multiplayer ----------
  if (window.TungMP) {
    TungMP.on("msg:tb_state", (m) => {
      if (!mp) return;
      const prevLen = st ? st.log.length : 0;
      st = m.state; my = m.idx; busy = false; sel = null;
      if (st.log.length > prevLen && prevLen) beep(st.taken[0].length + st.taken[1].length ? 260 : 330, 0.09);
      render();
    });
    TungMP.on("msg:tb_reject", (m) => { busy = false; setStatus(m.error || "That move wasn’t allowed.", true); render(); });
    TungMP.registerGame({
      prepareMatch(m) { mp = true; my = m.idx; names = [m.you.username, m.opp.username]; st = C.newGame({ variant: m.options.variant }); busy = true; sel = null; render(); setStatus("Waiting for the game to start…"); document.body.classList.add("mp-chess"); },
      startMatch() {},
      stopMatch() { busy = true; },
      exitMatch() { mp = false; document.body.classList.remove("mp-chess"); newSolo(); },
    });
  }
  newSolo();
})();
