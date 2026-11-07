(() => {
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const msgEl = document.getElementById("msg");
  const startBtn = document.getElementById("startBtn");

  const GRID = 20;
  const CELL = canvas.width / GRID;
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  let snake, dir, nextDir, food, score, timer, running, dead;
  let mp = null; // active multiplayer match ({seed}) or null for single player
  let best = Number(localStorage.getItem("tungSnakeBest") || 0);
  bestEl.textContent = best;

  // ---------- Sound ----------
  let audioCtx;
  function tung(freq = 180, dur = 0.2) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq / 3, t + dur);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + dur);
    } catch (_) {}
  }

  // ---------- Game logic ----------
  function reset() {
    snake = [
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 },
    ];
    dir = DIRS.right;
    nextDir = DIRS.right;
    score = 0;
    dead = false;
    scoreEl.textContent = 0;
    placeFood();
  }

  function placeFood() {
    // In a match both players use the same seeded food sequence (one stream per food).
    const rnd = mp ? TungMP.rng(mp.seed + ":food:" + score) : Math.random;
    do {
      food = { x: Math.floor(rnd() * GRID), y: Math.floor(rnd() * GRID) };
    } while (snake.some((s) => s.x === food.x && s.y === food.y));
  }

  function speed() {
    return Math.max(60, 140 - score * 3);
  }

  function step() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
    const hitSelf = snake.some((s) => s.x === head.x && s.y === head.y);
    if (hitWall || hitSelf) return gameOver();

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score++;
      scoreEl.textContent = score;
      if (mp) TungMP.progress(score);
      tung(220, 0.15);
      placeFood();
    } else {
      snake.pop();
    }

    draw();
    timer = setTimeout(step, speed());
  }

  function start() {
    if (mp) return; // matches start themselves after the countdown
    if (running) return pause();
    if (dead || !snake) reset();
    running = true;
    msgEl.textContent = "";
    startBtn.textContent = "Pause";
    clearTimeout(timer);
    timer = setTimeout(step, speed());
  }

  function pause() {
    running = false;
    clearTimeout(timer);
    msgEl.textContent = "Paused";
    startBtn.textContent = "Resume";
  }

  function gameOver() {
    running = false;
    dead = true;
    clearTimeout(timer);
    tung(120, 0.5);
    if (mp) {
      msgEl.textContent = `BONK! You're out with ${score} drums. Waiting for your opponent…`;
      draw(true);
      TungMP.finish({ score });
      return;
    }
    if (window.TungMP && score > 0) TungMP.submitSolo({ game: "snake", score });
    if (score > best) {
      best = score;
      localStorage.setItem("tungSnakeBest", best);
      bestEl.textContent = best;
      msgEl.textContent = `TUNG! New best: ${score} 🏆`;
    } else {
      msgEl.textContent = `BONK! Game over — ${score} drums`;
    }
    startBtn.textContent = "Play Again";
    draw(true);
  }

  function setDir(name) {
    const d = DIRS[name];
    if (!d) return;
    // prevent reversing into yourself
    if (d.x === -dir.x && d.y === -dir.y) return;
    if (mp && !running) return;
    nextDir = d;
    if (!running && !dead && snake) start();
  }

  // ---------- Drawing ----------
  function draw(isDead = false) {
    // background checker
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#1f1338" : "#24163f";
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }

    // food (drum)
    ctx.font = `${CELL * 0.9}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🥁", food.x * CELL + CELL / 2, food.y * CELL + CELL / 2 + 1);

    // body (wooden logs)
    for (let i = snake.length - 1; i >= 1; i--) {
      const s = snake[i];
      const shade = i % 2 ? "#b5763c" : "#9c6230";
      roundRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2, 6, shade);
      ctx.fillStyle = "rgba(0,0,0,.15)";
      ctx.fillRect(s.x * CELL + CELL * 0.3, s.y * CELL + 3, 2, CELL - 6);
      ctx.fillRect(s.x * CELL + CELL * 0.65, s.y * CELL + 3, 2, CELL - 6);
    }

    // head (Tung face)
    const h = snake[0];
    const hx = h.x * CELL;
    const hy = h.y * CELL;
    roundRect(hx, hy, CELL, CELL, 8, isDead ? "#7a4a1f" : "#e0a868");
    const ex = dir.x * 3;
    const ey = dir.y * 3;
    ctx.fillStyle = "#fff";
    circle(hx + CELL * 0.32 + ex, hy + CELL * 0.38 + ey, 4);
    circle(hx + CELL * 0.68 + ex, hy + CELL * 0.38 + ey, 4);
    ctx.fillStyle = "#111";
    circle(hx + CELL * 0.32 + ex * 1.4, hy + CELL * 0.38 + ey * 1.4, 2);
    circle(hx + CELL * 0.68 + ex * 1.4, hy + CELL * 0.38 + ey * 1.4, 2);
    ctx.fillStyle = "#2a1408";
    ctx.fillRect(hx + CELL * 0.35, hy + CELL * 0.65, CELL * 0.3, 3);
  }

  function roundRect(x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.fill();
  }

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- Input ----------
  const KEYS = {
    ArrowUp: "up", w: "up", W: "up",
    ArrowDown: "down", s: "down", S: "down",
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right",
  };

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      start();
      return;
    }
    if (KEYS[e.key]) {
      e.preventDefault();
      setDir(KEYS[e.key]);
    }
  });

  startBtn.addEventListener("click", start);

  document.querySelectorAll(".dpad button").forEach((b) =>
    b.addEventListener("click", () => setDir(b.dataset.dir))
  );

  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return start();
    setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    touchStart = null;
  });

  reset();
  draw();

  // ---------- Multiplayer hooks (see mp.js) ----------
  if (window.TungMP) TungMP.registerGame({
    prepareMatch(m) {
      mp = { seed: m.seed };
      clearTimeout(timer);
      running = false;
      reset();
      draw();
      msgEl.textContent = "";
    },
    startMatch() {
      if (!mp) return;
      running = true;
      clearTimeout(timer);
      timer = setTimeout(step, speed());
    },
    stopMatch() {
      running = false;
      clearTimeout(timer);
    },
    exitMatch() {
      mp = null;
      running = false;
      clearTimeout(timer);
      reset();
      draw();
      msgEl.textContent = "Press Start or Space";
      startBtn.textContent = "Start";
    },
  });
})();
