(() => {
  const P = window.PoolEngine;
  const { W, H, R } = P;
  const canvas = document.getElementById("table");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const groupsEl = document.getElementById("groups");
  const OX = 40, OY = 40; // the felt starts here inside the wooden frame

  const COLORS = { 1: "#f2c200", 2: "#2a6fdb", 3: "#e03a2f", 4: "#e0509a", 5: "#f07a1a", 6: "#1f9d55", 7: "#8a2b1e", 8: "#151515" };
  const colorOf = (id) => COLORS[id > 8 ? id - 8 : id];

  let game = P.newGame();
  let mp = null;            // {id} while in a multiplayer match
  let started = false, waiting = false;
  let myIdx = 0;            // which player I am (0 or 1)
  let aim = 0;
  let placed = null;        // where I put the cue ball after a foul
  let mouse = [HEAD(0), HEAD(1)];
  let drag = null;          // {sx, sy, x, y} while you pull the cue back
  let anim = null;          // {ev, final?, afterSolo}
  let over = false;
  let aiTimer = null;
  let last = 0;
  function HEAD(i) { return P.HEAD[i]; }

  const myId = () => (window.TungMP && TungMP.user ? TungMP.user.id : null);

  function setStatus(t, bad) { statusEl.textContent = t; statusEl.classList.toggle("bad", !!bad); }

  const myTurn = () => !over && !anim && game.turn === myIdx && (!mp || (started && !waiting));

  // ---------- drawing ----------
  function drawBall(b, x, y, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    const id = b.id;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = id === 0 ? "#fbfaf4" : id > 8 ? "#fbfaf4" : colorOf(id);
    ctx.fill();
    if (id > 8) {
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = colorOf(id); ctx.fillRect(x - R, y - R * 0.55, R * 2, R * 1.1);
      ctx.restore();
    }
    if (id > 0) {
      ctx.beginPath(); ctx.arc(x, y, R * 0.5, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
      ctx.fillStyle = "#111"; ctx.font = "bold 9px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(id), x, y + 0.5);
    }
    ctx.beginPath(); ctx.arc(x - 3, y - 3, 2.4, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // where the aim line first touches a ball or a cushion
  function rayHit(cx, cy, ang) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let best = { t: 1e9, ball: null };
    for (const b of game.balls) {
      if (b.out || b.id === 0) continue;
      const fx = b.x - cx, fy = b.y - cy, proj = fx * dx + fy * dy;
      if (proj <= 0) continue;
      const d2 = fx * fx + fy * fy - proj * proj;
      if (d2 > 4 * R * R) continue;
      const t = proj - Math.sqrt(4 * R * R - d2);
      if (t < best.t) best = { t, ball: b };
    }
    let tw = 1e9;
    if (dx > 0) tw = Math.min(tw, (W - R - cx) / dx); else if (dx < 0) tw = Math.min(tw, (R - cx) / dx);
    if (dy > 0) tw = Math.min(tw, (H - R - cy) / dy); else if (dy < 0) tw = Math.min(tw, (R - cy) / dy);
    if (tw < best.t) best = { t: tw, ball: null };
    return best;
  }

  function draw() {
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    // wooden frame
    const g = ctx.createLinearGradient(0, 0, cw, ch);
    g.addColorStop(0, "#8a5a2b"); g.addColorStop(0.5, "#b5763c"); g.addColorStop(1, "#7a4a1f");
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(0, 0, cw, ch, 22); ctx.fill();
    // felt
    ctx.fillStyle = "#17653a"; ctx.fillRect(OX - 6, OY - 6, W + 12, H + 12);
    ctx.fillStyle = "#1c7a46"; ctx.fillRect(OX, OY, W, H);
    ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(OX + P.HEAD[0], OY); ctx.lineTo(OX + P.HEAD[0], OY + H); ctx.stroke();
    // pockets
    ctx.fillStyle = "#0b0b0b";
    for (const p of P.POCKETS) { ctx.beginPath(); ctx.arc(OX + p[0], OY + p[1], 21, 0, Math.PI * 2); ctx.fill(); }

    const cue = game.balls[0];
    const canAim = myTurn();
    const needPlace = canAim && game.inHand && !placed;
    // aim guide
    if (canAim && !needPlace) {
      const cx = placed ? placed[0] : cue.x, cy = placed ? placed[1] : cue.y;
      const hit = rayHit(cx, cy, aim);
      const ex = cx + Math.cos(aim) * hit.t, ey = cy + Math.sin(aim) * hit.t;
      ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(OX + cx, OY + cy); ctx.lineTo(OX + ex, OY + ey); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(OX + ex, OY + ey, R, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.stroke();
      if (hit.ball) { // where the hit ball will go
        const nx = hit.ball.x - ex, ny = hit.ball.y - ey, nl = Math.hypot(nx, ny) || 1;
        ctx.strokeStyle = "rgba(255,230,120,.8)";
        ctx.beginPath(); ctx.moveTo(OX + hit.ball.x, OY + hit.ball.y); ctx.lineTo(OX + hit.ball.x + (nx / nl) * 60, OY + hit.ball.y + (ny / nl) * 60); ctx.stroke();
      }
      // cue stick
      const pw = drag ? dragPower() : 0.35, back = R + 8 + pw * 70;
      ctx.strokeStyle = "#e0b070"; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(OX + cx - Math.cos(aim) * back, OY + cy - Math.sin(aim) * back);
      ctx.lineTo(OX + cx - Math.cos(aim) * (back + 260), OY + cy - Math.sin(aim) * (back + 260)); ctx.stroke();
      ctx.strokeStyle = "#5a3a18"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(OX + cx - Math.cos(aim) * (back + 200), OY + cy - Math.sin(aim) * (back + 200));
      ctx.lineTo(OX + cx - Math.cos(aim) * (back + 260), OY + cy - Math.sin(aim) * (back + 260)); ctx.stroke();
    }
    // balls
    for (const b of game.balls) {
      if (b.out) continue;
      if (b.id === 0 && game.inHand && canAim) continue;
      drawBall(b, OX + b.x, OY + b.y);
    }
    if (canAim && game.inHand) {
      const pos = placed || (P.freeSpot(game, mouse[0], mouse[1]) ? mouse : null);
      if (pos) drawBall({ id: 0 }, OX + pos[0], OY + pos[1], placed ? 1 : 0.55);
    }
    if (drag && canAim) { // power meter
      const pw = dragPower();
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(OX, OY + H + 12, 160, 10);
      ctx.fillStyle = pw > 0.8 ? "#ff6b5e" : pw > 0.5 ? "#ffcc33" : "#7ddc7a"; ctx.fillRect(OX, OY + H + 12, 160 * pw, 10);
    }
    updateGroups();
  }

  function updateGroups() {
    const g0 = game.groups[0], g1 = game.groups[1];
    const me = game.groups[myIdx], opp = game.groups[1 - myIdx];
    const label = (grp) => (grp ? grp + "s" : "open table");
    if (!g0 && !g1) { groupsEl.textContent = "Table is open: pot a ball to pick solids or stripes."; return; }
    const left = (grp) => P.remaining(game, grp);
    groupsEl.textContent = `You: ${label(me)} (${left(me)} left) · ${mp ? "Opponent" : "Computer"}: ${label(opp)} (${left(opp)} left)`;
  }

  // ---------- input ----------
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * canvas.width) / r.width - OX, ((e.clientY - r.top) * canvas.height) / r.height - OY];
  }
  function setAimFrom(p) {
    const cue = game.balls[0];
    const cx = placed ? placed[0] : cue.x, cy = placed ? placed[1] : cue.y;
    aim = Math.atan2(p[1] - cy, p[0] - cx);
  }
  // Click and drag: pull back from the cue ball like a cue, and let go to shoot.
  const MAX_PULL = 170;
  function pull() { return drag ? Math.hypot(drag.x - drag.sx, drag.y - drag.sy) : 0; }
  function dragPower() { return Math.min(1, pull() / MAX_PULL); }
  function dragAngle() { return Math.atan2(drag.sy - drag.y, drag.sx - drag.x); } // the shot goes the opposite way

  canvas.addEventListener("pointerdown", (e) => {
    if (!myTurn()) return;
    mouse = pos(e);
    if (game.inHand && !placed) {
      if (P.freeSpot(game, mouse[0], mouse[1])) { placed = [mouse[0], mouse[1]]; setStatus("Cue ball placed. Click and drag back to shoot."); }
      else setStatus("Can’t place the cue ball there.", true);
      return draw();
    }
    canvas.setPointerCapture(e.pointerId);
    drag = { sx: mouse[0], sy: mouse[1], x: mouse[0], y: mouse[1] };
    draw();
  });
  canvas.addEventListener("pointermove", (e) => {
    mouse = pos(e);
    if (drag) {
      drag.x = mouse[0]; drag.y = mouse[1];
      if (pull() > 6) aim = dragAngle();
      draw();
    } else if (myTurn() && game.inHand && !placed) draw();
  });
  function release() {
    if (!drag) return;
    const power = dragPower(), long = pull() >= 14;
    const angle = drag.sx === drag.x && drag.sy === drag.y ? aim : dragAngle();
    drag = null;
    if (!long) { draw(); return setStatus("Drag further back to shoot, then let go."); }
    shoot({ angle, power: Math.max(0.08, power) });
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", () => { drag = null; draw(); });

  function shoot(shot) {
    if (!myTurn()) return;
    if (game.inHand) shot.cue = placed;
    if (mp) {
      waiting = true;
      TungMP.sendMatch({ t: "pool_shot", angle: shot.angle, power: shot.power, cue: shot.cue });
      setStatus("Shot sent…");
      draw();
    } else {
      launch(shot, null);
    }
  }

  // ---------- shots ----------
  function launch(shot, final) {
    const err = P.prepareShot(game, shot);
    if (err) { setStatus(err, true); return false; }
    placed = null;
    anim = { ev: { firstHit: null, potted: [] }, final };
    last = 0;
    requestAnimationFrame(frame);
    return true;
  }

  function frame(t) {
    if (!anim) return;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    let n = Math.max(1, Math.round(dt / P.DT));
    while (n-- > 0 && P.moving(game.balls)) P.step(game.balls, anim.ev);
    draw();
    if (P.moving(game.balls)) return requestAnimationFrame(frame);
    for (const b of game.balls) { b.vx = 0; b.vy = 0; }
    const a = anim;
    if (mp) {
      if (a.final) return settle(a);
      a.waiting = true; // the server's result isn't here yet
      return;
    }
    anim = null;
    const report = P.judge(game, a.ev);
    afterShot(report);
  }

  // multiplayer: the server's result replaces whatever our local replay ended with
  function settle(a) {
    anim = null;
    game = a.final.state;
    afterShot(null, a.final);
  }

  function afterShot(report, net) {
    waiting = false;
    placed = null;
    if (window.TungMP && mp) TungMP.progress(game.pots[myIdx]);
    if (game.over) {
      over = true;
      if (!mp) {
        const iWin = game.winner === 0;
        setStatus(iWin ? "🏆 You win! " + game.msg : "💀 The computer wins. " + game.msg);
        draw();
        if (window.TungMP) TungMP.submitSolo({ game: "pool", result: iWin ? "win" : "loss" });
      }
      return draw();
    }
    describeTurn();
    draw();
    if (!mp && game.turn === 1) aiTimer = setTimeout(aiMove, 900);
  }

  function describeTurn() {
    const mine = game.turn === myIdx;
    const base = game.msg ? game.msg + " " : "";
    if (game.inHand && mine) setStatus(base + "Click the table to place the cue ball.");
    else if (mine) setStatus(base + "Your shot.");
    else setStatus(base + (mp ? "Opponent’s shot…" : "Computer is lining up…"));
  }

  function aiMove() {
    if (over || anim) return;
    const shot = P.aiShot(game, undefined, document.getElementById("level").value);
    const mine = game.balls[0];
    aim = shot.angle;
    launch(shot, null);
  }

  function newSolo() {
    clearTimeout(aiTimer);
    game = P.newGame(); over = false; anim = null; placed = null; myIdx = 0; mp = null;
    aim = 0;
    setStatus("Your break. Click and drag back from the table, then let go to shoot.");
    draw();
  }
  document.getElementById("newBtn").addEventListener("click", newSolo);
  document.getElementById("level").addEventListener("change", newSolo);

  // ---------- multiplayer ----------
  if (window.TungMP) {
    TungMP.on("msg:pool_start", (m) => {
      started = true; waiting = false; anim = null; placed = null;
      game = m.state; myIdx = m.idx;
      describeTurn(); draw();
    });
    TungMP.on("msg:pool_shot", (m) => {
      if (!mp) return;
      const shot = m.shot;
      // replay the shot from our copy of the table, then snap to the server's result
      const err = P.prepareShot(game, shot);
      if (err) { game = m.state; return afterShot(null, m); }
      placed = null;
      anim = { ev: { firstHit: null, potted: [] }, final: m };
      last = 0;
      requestAnimationFrame(frame);
    });
    TungMP.on("msg:pool_reject", (m) => { waiting = false; setStatus(m.error || "That shot wasn’t allowed.", true); draw(); });

    TungMP.registerGame({
      prepareMatch(m) {
        mp = { id: m.id };
        started = false; waiting = false; over = false; anim = null; placed = null; myIdx = 0;
        clearTimeout(aiTimer);
        game = P.newGame();
        setStatus("Get ready…");
        draw();
      },
      startMatch() {},
      stopMatch() { over = true; started = false; draw(); },
      exitMatch() { mp = null; started = false; waiting = false; newSolo(); },
    });
  }

  newSolo();
})();
