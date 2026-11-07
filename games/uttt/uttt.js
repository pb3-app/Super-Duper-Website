(() => {
  const U = window.UTTT;
  const $ = (id) => document.getElementById(id);
  const big = $("big"), statusEl = $("status");
  let mp = false, my = 0, g = null, view = null, busy = false, over = false;
  let names = ["X", "O"];

  // build the 9 x 9 grid once
  const boards = [], cells = [];
  for (let b = 0; b < 9; b++) {
    const sb = document.createElement("div");
    sb.className = "sb";
    const win = document.createElement("div"); win.className = "win";
    for (let c = 0; c < 9; c++) {
      const btn = document.createElement("button");
      btn.className = "c"; btn.setAttribute("aria-label", `board ${b + 1} square ${c + 1}`);
      btn.addEventListener("click", () => click(b, c));
      sb.append(btn); cells[b * 9 + c] = btn;
    }
    sb.append(win); big.append(sb); boards.push(sb);
  }

  function setStatus(t, bad) { statusEl.textContent = t; statusEl.classList.toggle("bad", !!bad); }
  const mark = (i) => (i === 0 ? "X" : "O");

  function render() {
    const s = view;
    $("nx").textContent = s.boards.filter((x) => x === 1).length;
    $("no").textContent = s.boards.filter((x) => x === 2).length;
    const myTurn = !s.over && s.turn === my && !busy;
    for (let b = 0; b < 9; b++) {
      const sb = boards[b], v = s.boards[b];
      const playable = !s.over && v === 0 && (s.next === -1 || s.next === b);
      sb.className = "sb" + (playable ? " live" : "") + (v ? " dead" : "") + (v === 1 ? " wx" : v === 2 ? " wo" : v === 3 ? " wd" : "");
      sb.querySelector(".win").textContent = v === 1 ? "X" : v === 2 ? "O" : v === 3 ? "tie" : "";
      for (let c = 0; c < 9; c++) {
        const k = b * 9 + c, btn = cells[k], val = s.cells[k];
        btn.textContent = val === 1 ? "X" : val === 2 ? "O" : "";
        btn.className = "c" + (val === 1 ? " x" : val === 2 ? " o" : "") + (s.last === k ? " last" : "") + (myTurn && playable && !val ? " can" : "");
        btn.disabled = !(myTurn && playable && !val);
      }
    }
    if (s.over) {
      if (s.winner === null) setStatus(s.reason === "draw" ? "It’s a draw - the big board filled up." : "Draw.");
      else setStatus(s.winner === my ? "🏆 You win!" : mp ? `${names[s.winner]} wins.` : "The computer wins.");
    } else if (s.turn === my) {
      setStatus(s.next === -1 ? `Your turn (${mark(my)}) - play in any glowing board.` : `Your turn (${mark(my)}) - play in the glowing board.`);
    } else setStatus(mp ? "Waiting for your opponent…" : "Computer is thinking…");
  }

  function click(b, c) {
    if (!view || view.over || view.turn !== my || busy) return;
    if (mp) { busy = true; TungMP.sendMatch({ t: "tb_move", move: { b, c } }); render(); return; }
    const r = U.play(g, { b, c }, my);
    if (!r.ok) return setStatus(r.error, true);
    view = g; render(); tick();
  }

  // ----- solo -----
  function newSolo() {
    mp = false; over = false; busy = false;
    my = Number($("side").value);
    g = U.newGame(); view = g; render(); tick();
  }
  function tick() {
    if (mp || !g) return;
    if (g.over) return finishSolo();
    if (g.turn !== my) {
      busy = true; render();
      setTimeout(() => {
        const mv = U.ai(g, $("level").value);
        busy = false;
        if (mv) U.play(g, mv, g.turn);
        view = g; render();
        if (g.over) finishSolo();
      }, 450);
    }
  }
  function finishSolo() {
    if (over) return; over = true;
    if (g.winner === null) return;
    if (window.TungMP) TungMP.submitSolo({ game: "uttt", result: g.winner === my ? "win" : "loss" });
  }
  $("newBtn").addEventListener("click", newSolo);

  // ----- multiplayer -----
  if (window.TungMP) {
    TungMP.on("msg:tb_state", (m) => {
      if (!mp) return;
      view = m.state; my = m.idx; busy = false; render();
    });
    TungMP.on("msg:tb_reject", (m) => { busy = false; setStatus(m.error || "That move wasn’t allowed.", true); if (view) render(); });
    TungMP.registerGame({
      prepareMatch(m) {
        mp = true; my = m.idx; names = m.idx === 0 ? [m.you.username, m.opp.username] : [m.opp.username, m.you.username];
        view = U.newGame(); busy = true; render(); setStatus("Waiting for the game to start…");
      },
      startMatch() {},
      stopMatch() { busy = true; },
      exitMatch() { mp = false; newSolo(); },
    });
    TungMP.booted.then(() => {});
  }
  newSolo();
})();
