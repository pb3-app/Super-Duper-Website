(() => {
  const LEVELS = {
    easy: { rows: 9, cols: 9, mines: 10, size: 36 },
    medium: { rows: 16, cols: 16, mines: 40, size: 28 },
    hard: { rows: 16, cols: 30, mines: 99, size: 26 },
  };
  const MINE = "🪵";  // the Tung Tung Tung Sahur log
  const FLAG = "🚩";

  const boardEl = document.getElementById("board");
  const minesLeftEl = document.getElementById("minesLeft");
  const timeEl = document.getElementById("time");
  const faceEl = document.getElementById("face");
  const msgEl = document.getElementById("msg");
  const flagModeBtn = document.getElementById("flagMode");
  const levelBtns = document.querySelectorAll("[data-level]");

  let level = localStorage.getItem("tungMinesLevel") || "easy";
  let rows, cols, mineCount;
  let mp = null; // active multiplayer match ({seed, start, running}) or null
  let grid, cells, firstClick, over, flags, revealed, timer, seconds, flagMode = false;

  // ---------- Sound ----------
  let audioCtx;
  function tung(freq = 180, dur = 0.2, vol = 0.4) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq / 3, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + dur);
    } catch (_) {}
  }
  function tungTungTung() {
    [0, 180, 360].forEach((d) => setTimeout(() => tung(160, 0.25, 0.6), d));
  }

  // ---------- Setup ----------
  function newGame(lvl = level) {
    level = lvl;
    localStorage.setItem("tungMinesLevel", level);
    levelBtns.forEach((b) => b.classList.toggle("active", b.dataset.level === level));
    build(level);
  }

  function build(lvl) {
    ({ rows, cols, mines: mineCount } = LEVELS[lvl]);

    grid = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ mine: false, open: false, flag: false, n: 0 }))
    );
    firstClick = true;
    over = false;
    flags = 0;
    revealed = 0;
    seconds = 0;
    clearInterval(timer);
    timer = null;
    timeEl.textContent = 0;
    minesLeftEl.textContent = mineCount;
    faceEl.textContent = "🙂";
    msgEl.textContent = "";

    boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--size))`;
    boardEl.style.setProperty("--size", LEVELS[lvl].size + "px");
    boardEl.innerHTML = "";
    cells = [];
    for (let r = 0; r < rows; r++) {
      cells.push([]);
      for (let c = 0; c < cols; c++) {
        const el = document.createElement("div");
        el.className = "cell";
        el.dataset.r = r;
        el.dataset.c = c;
        boardEl.append(el);
        cells[r].push(el);
      }
    }
  }

  function placeMines(safeR, safeC, rnd = Math.random) {
    let placed = 0;
    while (placed < mineCount) {
      const r = Math.floor(rnd() * rows);
      const c = Math.floor(rnd() * cols);
      // keep the first click and its neighbors safe
      if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
      if (grid[r][c].mine) continue;
      grid[r][c].mine = true;
      placed++;
    }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        grid[r][c].n = neighbors(r, c).filter(([nr, nc]) => grid[nr][nc].mine).length;
  }

  function neighbors(r, c) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push([nr, nc]);
      }
    return out;
  }

  // ---------- Actions ----------
  function reveal(r, c) {
    if (over || (mp && !mp.running)) return;
    const cell = grid[r][c];
    if (cell.flag) return;

    if (firstClick) {
      firstClick = false;
      placeMines(r, c);
      timer = setInterval(() => (timeEl.textContent = ++seconds), 1000);
    }

    if (cell.open) return chord(r, c);

    if (cell.mine) return lose(r, c);

    // flood fill
    const stack = [[r, c]];
    while (stack.length) {
      const [cr, cc] = stack.pop();
      const cur = grid[cr][cc];
      if (cur.open || cur.flag) continue;
      cur.open = true;
      revealed++;
      paint(cr, cc);
      if (cur.n === 0) stack.push(...neighbors(cr, cc));
    }
    tung(260, 0.08, 0.2);
    if (mp) TungMP.progress(revealed);
    checkWin();
  }

  function chord(r, c) {
    const cell = grid[r][c];
    if (!cell.n) return;
    const around = neighbors(r, c);
    const flagged = around.filter(([nr, nc]) => grid[nr][nc].flag).length;
    if (flagged !== cell.n) return;
    for (const [nr, nc] of around) {
      const n = grid[nr][nc];
      if (!n.open && !n.flag) {
        if (n.mine) return lose(nr, nc);
        reveal(nr, nc);
      }
    }
  }

  function toggleFlag(r, c) {
    if (over || firstClick || (mp && !mp.running)) return;
    const cell = grid[r][c];
    if (cell.open) return;
    cell.flag = !cell.flag;
    flags += cell.flag ? 1 : -1;
    minesLeftEl.textContent = mineCount - flags;
    paint(r, c);
    tung(400, 0.06, 0.2);
  }

  function lose(r, c) {
    over = true;
    clearInterval(timer);
    faceEl.textContent = "😵";
    msgEl.textContent = "TUNG TUNG TUNG SAHUR! You woke him up 🏏";
    tungTungTung();
    for (let rr = 0; rr < rows; rr++)
      for (let cc = 0; cc < cols; cc++) {
        const g = grid[rr][cc];
        if (g.mine && !g.flag) {
          g.open = true;
          paint(rr, cc);
        } else if (!g.mine && g.flag) {
          cells[rr][cc].textContent = "❌";
        }
      }
    cells[r][c].classList.add("boom");
    if (mp) {
      msgEl.textContent = "BOOM! You're out. Waiting for your opponent…";
      mp.running = false;
      TungMP.finish({ cleared: false });
    }
  }

  function checkWin() {
    if (revealed !== rows * cols - mineCount) return;
    over = true;
    clearInterval(timer);
    faceEl.textContent = "😎";
    // auto-flag remaining
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (grid[r][c].mine && !grid[r][c].flag) {
          grid[r][c].flag = true;
          paint(r, c);
        }
    minesLeftEl.textContent = 0;

    if (mp) {
      msgEl.textContent = "Board cleared!";
      mp.running = false;
      TungMP.finish({ cleared: true });
      return;
    }

    if (window.TungMP && seconds > 0) TungMP.submitSolo({ game: "minesweeper", level, time: seconds });
    const key = "tungMinesBest_" + level;
    const best = Number(localStorage.getItem(key) || Infinity);
    if (seconds < best) {
      localStorage.setItem(key, seconds);
      msgEl.textContent = `You win! New ${level} record: ${seconds}s 🏆`;
    } else {
      msgEl.textContent = `You win in ${seconds}s! (best: ${best}s)`;
    }
    [0, 120, 240].forEach((d, i) => setTimeout(() => tung(300 + i * 120, 0.2), d));
  }

  function paint(r, c) {
    const g = grid[r][c];
    const el = cells[r][c];
    el.className = "cell";
    el.textContent = "";
    if (g.open) {
      el.classList.add("open");
      if (g.mine) {
        el.classList.add("mine");
        el.textContent = MINE;
      } else if (g.n) {
        el.classList.add("n" + g.n);
        el.textContent = g.n;
      }
    } else if (g.flag) {
      el.textContent = FLAG;
    }
  }

  // ---------- Input ----------
  function cellFrom(e) {
    const el = e.target.closest(".cell");
    return el ? [Number(el.dataset.r), Number(el.dataset.c)] : null;
  }

  boardEl.addEventListener("click", (e) => {
    const pos = cellFrom(e);
    if (!pos) return;
    if (flagMode && !grid[pos[0]][pos[1]].open) toggleFlag(...pos);
    else reveal(...pos);
  });

  boardEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const pos = cellFrom(e);
    if (pos) toggleFlag(...pos);
  });

  boardEl.addEventListener("mousedown", (e) => {
    if (!over && e.button === 0 && cellFrom(e)) faceEl.textContent = "😮";
  });
  document.addEventListener("mouseup", () => {
    if (!over) faceEl.textContent = "🙂";
  });

  faceEl.addEventListener("click", () => { if (!mp) newGame(); });
  levelBtns.forEach((b) => b.addEventListener("click", () => { if (!mp) newGame(b.dataset.level); }));
  flagModeBtn.addEventListener("click", () => {
    flagMode = !flagMode;
    flagModeBtn.textContent = `🚩 Flag mode: ${flagMode ? "On" : "Off"}`;
    flagModeBtn.classList.toggle("active", flagMode);
  });

  newGame();

  // ---------- Multiplayer hooks (see mp.js) ----------
  if (window.TungMP) TungMP.registerGame({
    prepareMatch(m) {
      mp = { seed: m.seed, running: false };
      clearInterval(timer);
      build(m.options.level);
      // Same mines for both players, with an identical opening revealed for the start.
      const rnd = TungMP.rng(m.seed + ":mines");
      const sr = 1 + Math.floor(rnd() * (rows - 2));
      const sc = 1 + Math.floor(rnd() * (cols - 2));
      mp.start = [sr, sc];
      placeMines(sr, sc, rnd);
      firstClick = false;
      msgEl.textContent = "";
    },
    startMatch() {
      if (!mp) return;
      mp.running = true;
      seconds = 0;
      timeEl.textContent = 0;
      timer = setInterval(() => (timeEl.textContent = ++seconds), 1000);
      reveal(mp.start[0], mp.start[1]);
    },
    stopMatch() {
      over = true;
      if (mp) mp.running = false;
      clearInterval(timer);
    },
    exitMatch() {
      mp = null;
      newGame();
    },
  });
})();
