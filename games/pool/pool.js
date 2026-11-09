/*
 * Tung Pool: 8-ball physics and rules, shared by the browser (animation, solo vs computer)
 * and the server (authoritative multiplayer). Everything here is plain numbers and
 * deterministic, so both sides replay a shot the same way.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PoolEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const W = 800, H = 400;          // the playing surface
  const R = 10;                    // ball radius
  const PR = 22;                   // a ball whose centre gets this close to a pocket is potted
  const POCKETS = [[0, 0], [W / 2, -4], [W, 0], [0, H], [W / 2, H + 4], [W, H]];
  const DT = 1 / 240;
  const DECEL = 150;               // px/s^2 rolling friction (lower = balls roll further)
  const WALL_E = 0.78, BALL_E = 0.97;
  const HEAD = [200, H / 2];
  const MAX_STEPS = 240 * 25;

  const sqrt = Math.sqrt;

  function newGame() {
    const balls = [{ id: 0, x: HEAD[0], y: HEAD[1], vx: 0, vy: 0, out: false }];
    const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    let k = 0;
    const x0 = 570, dx = R * 2 * 0.87 + 0.5, dy = R * 2 + 0.5;
    for (let col = 0; col < 5; col++) {
      for (let row = 0; row <= col; row++) {
        balls.push({ id: order[k++], x: x0 + col * dx, y: H / 2 + (row - col / 2) * dy, vx: 0, vy: 0, out: false });
      }
    }
    return { balls, groups: [null, null], turn: 0, inHand: false, over: false, winner: null, breakDone: false, pots: [0, 0], msg: '' };
  }
  const clone = (g) => JSON.parse(JSON.stringify(g));
  const groupOf = (id) => (id === 0 ? 'cue' : id === 8 ? 'eight' : id < 8 ? 'solid' : 'stripe');

  function moving(balls) {
    for (const b of balls) if (!b.out && (b.vx || b.vy)) return true;
    return false;
  }

  /** One physics step. ev collects {firstHit, potted:[ids]}. */
  function step(balls, ev) {
    for (const b of balls) {
      if (b.out) continue;
      if (b.vx || b.vy) {
        const sp = sqrt(b.vx * b.vx + b.vy * b.vy);
        if (sp < 5) { b.vx = 0; b.vy = 0; }
        else {
          const ns = Math.max(0, sp - DECEL * DT), f = ns / sp;
          b.vx *= f; b.vy *= f;
          b.x += b.vx * DT; b.y += b.vy * DT;
        }
      }
      if (b.vx === 0 && b.vy === 0) continue;
      // pockets
      for (const p of POCKETS) {
        const dx = b.x - p[0], dy = b.y - p[1];
        if (dx * dx + dy * dy < PR * PR) { b.out = true; b.vx = 0; b.vy = 0; ev.potted.push(b.id); break; }
      }
      if (b.out) continue;
      if (b.x < R) { b.x = R; b.vx = -b.vx * WALL_E; }
      else if (b.x > W - R) { b.x = W - R; b.vx = -b.vx * WALL_E; }
      if (b.y < R) { b.y = R; b.vy = -b.vy * WALL_E; }
      else if (b.y > H - R) { b.y = H - R; b.vy = -b.vy * WALL_E; }
    }
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.out) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const c = balls[j];
        if (c.out) continue;
        if (!(a.vx || a.vy || c.vx || c.vy)) continue;
        const dx = a.x - c.x, dy = a.y - c.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = sqrt(d2), nx = dx / d, ny = dy / d, ov = 2 * R - d;
        a.x += (nx * ov) / 2; a.y += (ny * ov) / 2;
        c.x -= (nx * ov) / 2; c.y -= (ny * ov) / 2;
        const vn = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
        if (vn < 0) {
          const j2 = (-(1 + BALL_E) * vn) / 2;
          a.vx += j2 * nx; a.vy += j2 * ny;
          c.vx -= j2 * nx; c.vy -= j2 * ny;
        }
        if (ev.firstHit === null && (a.id === 0 || c.id === 0)) ev.firstHit = a.id === 0 ? c.id : a.id;
      }
    }
  }

  function freeSpot(g, x, y) {
    if (!(x >= R && x <= W - R && y >= R && y <= H - R)) return false;
    for (const b of g.balls) {
      if (b.out || b.id === 0) continue;
      const dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy < (2 * R + 1) * (2 * R + 1)) return false;
    }
    return true;
  }

  /** Place the cue ball (ball in hand) and launch it. Returns an error string or null. */
  function prepareShot(g, shot) {
    const cue = g.balls[0];
    if (g.inHand) {
      if (!shot.cue || !freeSpot(g, shot.cue[0], shot.cue[1])) return 'Place the cue ball on a free spot first';
      cue.x = shot.cue[0]; cue.y = shot.cue[1]; cue.out = false; g.inHand = false;
    }
    if (!Number.isFinite(shot.angle) || !Number.isFinite(shot.power) || shot.power <= 0) return 'Bad shot';
    const power = Math.min(1, shot.power), speed = 150 + 1650 * power;
    cue.vx = Math.cos(shot.angle) * speed; cue.vy = Math.sin(shot.angle) * speed;
    return null;
  }

  function runToRest(g, ev, onStep) {
    for (let n = 0; n < MAX_STEPS && moving(g.balls); n++) { step(g.balls, ev); if (onStep) onStep(); }
    for (const b of g.balls) { b.vx = 0; b.vy = 0; }
  }

  const remaining = (g, grp) => g.balls.filter((b) => !b.out && groupOf(b.id) === grp).length;

  /** Apply the rules after a shot has come to rest. Mutates g; returns a short report. */
  function judge(g, ev) {
    const p = g.turn, o = 1 - p;
    const own = g.groups[p];
    const potted = ev.potted;
    const cuePotted = potted.includes(0);
    const eightPotted = potted.includes(8);
    const objects = potted.filter((id) => id !== 0 && id !== 8);
    const notes = [];
    let foul = false;

    const ownLeft = own ? remaining(g, own) + objects.filter((id) => groupOf(id) === own).length : null; // before this shot
    if (cuePotted) { foul = true; notes.push('scratch'); }
    if (ev.firstHit === null) { foul = true; notes.push('no ball hit'); }
    else if (own) {
      const need = ownLeft > 0 ? own : 'eight';
      if (groupOf(ev.firstHit) !== need) { foul = true; notes.push('wrong ball hit first'); }
    } else if (ev.firstHit === 8) { foul = true; notes.push('hit the 8 first'); }

    const report = { potted: potted.slice(), foul, notes, gameOver: false };

    if (eightPotted) {
      const clean = own && ownLeft === 0 && !foul;
      g.over = true; g.winner = clean ? p : o;
      report.gameOver = true;
      report.reason = clean ? 'pot8' : 'bad8';
      g.msg = clean ? 'Potted the 8 ball to win!' : 'The 8 ball went down too early: ' + (foul ? notes.join(', ') : 'game over');
      return report;
    }

    let ownPotted = 0;
    if (!own && g.breakDone && !foul && objects.length) {
      const grp = groupOf(objects[0]);
      g.groups[p] = grp; g.groups[o] = grp === 'solid' ? 'stripe' : 'solid';
      notes.push('you are ' + grp + 's');
    }
    const grpNow = g.groups[p];
    for (const id of objects) {
      if (grpNow ? groupOf(id) === grpNow : true) { ownPotted++; }
    }
    g.pots[p] += ownPotted;
    g.pots[o] += objects.length - ownPotted;
    g.breakDone = true;

    if (cuePotted) {
      const cue = g.balls[0];
      cue.out = true;
    }
    if (foul) {
      g.turn = o; g.inHand = true;
      g.msg = 'Foul: ' + notes.join(', ') + '. Ball in hand.';
      const cue = g.balls[0];
      if (cue.out) { cue.x = HEAD[0]; cue.y = HEAD[1]; }
    } else if (ownPotted > 0) {
      g.msg = 'Potted ' + ownPotted + '. Shoot again.';
    } else {
      g.turn = o;
      g.msg = objects.length ? 'Wrong group potted. Turn passes.' : 'No ball potted. Turn passes.';
    }
    report.msg = g.msg;
    return report;
  }

  /** Take a whole shot (server and AI). */
  function takeShot(g, shot) {
    if (g.over) return { ok: false, error: 'The game is over' };
    const err = prepareShot(g, shot);
    if (err) return { ok: false, error: err };
    const ev = { firstHit: null, potted: [] };
    runToRest(g, ev);
    const report = judge(g, ev);
    return { ok: true, report, ev };
  }

  // ---------- computer player ----------
  // level: 'easy' mostly lines up any ball and often misses, 'medium' as before, 'hard' looks at far more shots and aims very straight
  const AI_LEVELS = { easy: { noise: 0.07, cap: 14, random: 0.35, powers: [0.5, 0.75] }, medium: { noise: 0.02, cap: 60, random: 0, powers: [0.5, 0.75, 1] }, hard: { noise: 0.004, cap: 160, random: 0, powers: [0.3, 0.5, 0.65, 0.8, 1] } };
  function aiShot(g, noise, level) {
    const L = AI_LEVELS[level] || AI_LEVELS.medium;
    noise = noise == null ? L.noise : noise;
    const p = g.turn;
    const own = g.groups[p];
    let targets;
    if (!own) targets = g.balls.filter((b) => !b.out && b.id !== 0 && b.id !== 8);
    else if (remaining(g, own) > 0) targets = g.balls.filter((b) => !b.out && groupOf(b.id) === own);
    else targets = g.balls.filter((b) => !b.out && b.id === 8);
    let cueAt = null;
    const cue = g.balls[0];
    if (g.inHand) {
      cueAt = [HEAD[0], HEAD[1]];
      for (const c of [[HEAD[0], HEAD[1]], [160, 120], [160, 280], [260, 200], [120, 200], [300, 100], [300, 300]]) {
        if (freeSpot(g, c[0], c[1])) { cueAt = c; break; }
      }
    }
    const cx = cueAt ? cueAt[0] : cue.x, cy = cueAt ? cueAt[1] : cue.y;
    const cands = [];
    for (const t of targets) {
      for (const pk of POCKETS) {
        const tx = pk[0] - t.x, ty = pk[1] - t.y, tl = sqrt(tx * tx + ty * ty) || 1;
        const gx = t.x - (tx / tl) * 2 * R, gy = t.y - (ty / tl) * 2 * R;
        const ax = gx - cx, ay = gy - cy, al = sqrt(ax * ax + ay * ay) || 1;
        if ((ax / al) * (tx / tl) + (ay / al) * (ty / tl) < 0.25) continue; // too thin a cut
        const ang = Math.atan2(ay, ax);
        for (const pw of L.powers) cands.push({ angle: ang + (Math.random() - 0.5) * 0.012, power: pw });
      }
    }
    // fallback: hit the target ball more or less head on (nudges it about), plus a few random shots
    for (const t of targets) {
      const base = Math.atan2(t.y - cy, t.x - cx);
      for (let k = 0; k < 4; k++) cands.push({ angle: base + (Math.random() - 0.5) * 0.35, power: 0.3 + Math.random() * 0.5 });
    }
    for (let i = 0; i < 6; i++) cands.push({ angle: Math.random() * Math.PI * 2, power: 0.5 + Math.random() * 0.5 });
    // shuffle and cap the work
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    let best = null, bestScore = -1e9;
    if (Math.random() < L.random) { // a beginner just hits something
      const t = targets[Math.floor(Math.random() * targets.length)] || g.balls[1];
      return { angle: Math.atan2(t.y - cy, t.x - cx) + (Math.random() - 0.5) * 0.3, power: 0.35 + Math.random() * 0.5, cue: cueAt || undefined };
    }
    for (const c of cands.slice(0, L.cap)) {
      const t = clone(g);
      const shot = { angle: c.angle, power: c.power };
      if (cueAt) shot.cue = cueAt;
      const r = takeShot(t, shot);
      if (!r.ok) continue;
      let score = 0;
      if (t.over) score = t.winner === p ? 1000 : -1000;
      else {
        score += (t.pots[p] - g.pots[p]) * 40 - (t.pots[1 - p] - g.pots[1 - p]) * 15;
        if (r.report.foul) score -= 60;
        if (t.turn === p) score += 15;
      }
      score += Math.random() * 6;
      if (score > bestScore) { bestScore = score; best = shot; }
    }
    if (best) best.angle += (Math.random() - 0.5) * noise;
    return best || { angle: Math.random() * Math.PI * 2, power: 0.6, cue: cueAt || undefined };
  }

  return { W, H, R, PR, POCKETS, HEAD, DT, newGame, clone, step, moving, prepareShot, runToRest, judge, takeShot, aiShot, groupOf, remaining, freeSpot };
});
