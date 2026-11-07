(() => {
  const TA = window.TungArt;
  const GW = 15, GH = 13, T = 48, CW = GW * T, CH = GH * T, HALF = 17, FUSE = 2.3, FLAME_T = 0.5;
  const $ = (id) => document.getElementById(id);
  const cv = $("view"), ctx = cv.getContext("2d");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const COLS = [{ pal: undefined, c: "#ffcc33" }, { pal: "blue", c: "#4cc9f0" }, { pal: "red", c: "#ff6b6b" }, { pal: "green", c: "#7df08f" }];
  const SPAWN = [[1, 1], [13, 11], [13, 1], [1, 11]];
  const ICON = { bomb: "💣", range: "🔥", speed: "👟", shield: "🛡️" };
  let audio;
  function beep(f, d, type = "sine", v = 0.08, slide = 0.5) { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t + d); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.02); } catch (_) {} }

  let role = "idle", sim = null, view = null, myIdx = 0, np = null, running = false, raf = 0, last = 0, over = false, level = "medium", roundsTo = 2, shake = 0, parts = [], snapAt = 0, sendAcc = 0, pendingEv = [], bombCount = 0, rngSeed = "x";
  const keys = {}; let joy = { x: 0, y: 0 }, myIn = { dx: 0, dy: 0 }, order = []; const remoteIn = new Map();

  // ---------------- simulation ----------------
  const idx = (tx, ty) => ty * GW + tx;
  function rng(seed) { let h = 1779033703 ^ seed.length; for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } let a = h >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function spiral() { // the order in which the arena closes in during sudden death
    const out = []; let x0 = 1, y0 = 1, x1 = GW - 2, y1 = GH - 2;
    while (x0 <= x1 && y0 <= y1) { for (let x = x0; x <= x1; x++) out.push([x, y0]); for (let y = y0 + 1; y <= y1; y++) out.push([x1, y]); if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) out.push([x, y1]); if (x0 < x1) for (let y = y1 - 1; y > y0; y--) out.push([x0, y]); x0++; y0++; x1--; y1--; }
    return out;
  }
  const SPIRAL = spiral();
  function makeSim(players, to, seed) {
    const s = { players: players.map((p, i) => ({ id: p.id, name: p.name, bot: !!p.bot, slot: i, x: 0, y: 0, dir: 2, alive: true, bm: 1, rg: 2, spd: 0, shield: 0, inv: 0, wins: 0, pass: new Set(), inp: { dx: 0, dy: 0, bomb: 0 }, lastBomb: 0, ai: { t: 0, path: null, goal: null } })), grid: new Uint8Array(GW * GH), fl: new Float32Array(GW * GH), bombs: [], ups: new Map(), drops: [], phase: "ready", ready: 2.2, t: 0, tr: 0, round: 1, to, ev: [], over: 0, lastWinner: -1, winner: -1, matchOver: false, bid: 1, sd: 0, seed };
    startRound(s); return s;
  }
  function startRound(s) {
    const r = rng(s.seed + ":" + s.round); s.grid.fill(0); s.fl.fill(0); s.bombs = []; s.ups = new Map(); s.drops = []; s.tr = 0; s.sd = 0; s.phase = "ready"; s.ready = 2.2; s.over = 0; s.lastWinner = -1;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1 || (x % 2 === 0 && y % 2 === 0)) s.grid[idx(x, y)] = 1; else if (r() < 0.68) s.grid[idx(x, y)] = 2; }
    const n = s.players.length;
    s.players.forEach((p, i) => { const [sx, sy] = SPAWN[i % 4]; for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = sx + dx, y = sy + dy; if (x > 0 && y > 0 && x < GW - 1 && y < GH - 1 && s.grid[idx(x, y)] === 2) s.grid[idx(x, y)] = 0; } p.x = (sx + 0.5) * T; p.y = (sy + 0.5) * T; p.alive = true; p.bm = 1; p.rg = 2; p.spd = 0; p.shield = 0; p.inv = 0; p.pass = new Set(); p.dir = 2; p.ai = { t: 0, path: null, goal: null }; });
    void n;
  }
  const tileOf = (v) => Math.floor(v / T);
  function bombAt(s, tx, ty) { return s.bombs.find((b) => b.tx === tx && b.ty === ty); }
  function blocked(s, tx, ty, p) {
    if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) return true;
    if (s.grid[idx(tx, ty)]) return true;
    const b = bombAt(s, tx, ty); return !!b && !(p && p.pass.has(b.id));
  }
  function collides(s, x, y, p) { return blocked(s, tileOf(x - HALF), tileOf(y - HALF), p) || blocked(s, tileOf(x + HALF - 1), tileOf(y - HALF), p) || blocked(s, tileOf(x - HALF), tileOf(y + HALF - 1), p) || blocked(s, tileOf(x + HALF - 1), tileOf(y + HALF - 1), p); }
  function move(s, p, dx, dy) {
    if (!dx && !dy) return;
    const nx = p.x + dx, ny = p.y + dy;
    if (!collides(s, nx, ny, p)) { p.x = nx; p.y = ny; return; }
    const step = Math.abs(dx) + Math.abs(dy); // blocked: slide around a corner when we are only slightly off-centre
    if (dx) { const cy = (tileOf(p.y) + 0.5) * T, off = cy - p.y; if (Math.abs(off) <= 18 && !collides(s, p.x + Math.sign(dx) * 3, cy, p)) p.y += clamp(off, -step, step); else if (Math.abs(off) <= 18) { /* the tile ahead is blocked */ } }
    if (dy) { const cx = (tileOf(p.x) + 0.5) * T, off = cx - p.x; if (Math.abs(off) <= 18 && !collides(s, cx, p.y + Math.sign(dy) * 3, p)) p.x += clamp(off, -step, step); }
  }
  function placeBomb(s, p) {
    const tx = tileOf(p.x), ty = tileOf(p.y);
    if (!p.alive || bombAt(s, tx, ty) || s.grid[idx(tx, ty)] || s.bombs.filter((b) => b.owner === p.slot).length >= p.bm) return;
    const b = { id: s.bid++, tx, ty, owner: p.slot, t: FUSE, range: p.rg };
    s.bombs.push(b);
    for (const q of s.players) if (q.alive && Math.abs(q.x - (tx + 0.5) * T) < T - 2 && Math.abs(q.y - (ty + 0.5) * T) < T - 2) q.pass.add(b.id);
    s.ev.push(["place", tx, ty]);
  }
  function explode(s, b) {
    s.bombs = s.bombs.filter((q) => q !== b); s.ev.push(["boom", b.tx, b.ty]);
    const mark = (tx, ty) => { s.fl[idx(tx, ty)] = FLAME_T; const up = s.ups.get(idx(tx, ty)); if (up) s.ups.delete(idx(tx, ty)); };
    mark(b.tx, b.ty);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let i = 1; i <= b.range; i++) {
      const tx = b.tx + dx * i, ty = b.ty + dy * i, g = s.grid[idx(tx, ty)];
      if (g === 1 || g === 3) break;
      mark(tx, ty);
      if (g === 2) { s.grid[idx(tx, ty)] = 0; if (Math.random() < 0.3) { const r = Math.random(); s.drops.push({ tx, ty, t: FLAME_T, type: r < 0.32 ? "bomb" : r < 0.62 ? "range" : r < 0.88 ? "speed" : "shield" }); } s.ev.push(["crate", tx, ty]); break; }
      const other = bombAt(s, tx, ty); if (other) { other.t = Math.min(other.t, 0.02); break; }
    }
  }
  function stepSim(s, dt) {
    s.t += dt;
    if (s.phase === "ready") { s.ready -= dt; if (s.ready <= 0) { s.phase = "fight"; s.ev.push(["go"]); } }
    else if (s.phase === "fight") {
      s.tr += dt;
      if (s.tr > 80) { s.sd -= dt; if (s.sd <= 0 && SPIRAL.length) { s.sd = 0.3; const idxs = SPIRAL.findIndex(([x, y]) => s.grid[idx(x, y)] !== 3); if (idxs >= 0) { const [x, y] = SPIRAL[idxs]; s.grid[idx(x, y)] = 3; s.bombs = s.bombs.filter((b) => !(b.tx === x && b.ty === y)); s.ups.delete(idx(x, y)); s.fl[idx(x, y)] = 0; s.ev.push(["hard", x, y]); for (const p of s.players) if (p.alive && tileOf(p.x) === x && tileOf(p.y) === y) { p.alive = false; s.ev.push(["die", p.slot]); } } } }
    } else if (s.phase === "over") { s.over -= dt; if (s.over <= 0) { if (s.matchOver) { s.phase = "end"; s.ev.push(["end"]); } else { s.round++; startRound(s); } } }
    // flames, fuses, drops
    for (let i = 0; i < s.fl.length; i++) if (s.fl[i] > 0) s.fl[i] = Math.max(0, s.fl[i] - dt);
    for (const d of s.drops) d.t -= dt; for (const d of s.drops.filter((x) => x.t <= 0)) if (!s.grid[idx(d.tx, d.ty)]) s.ups.set(idx(d.tx, d.ty), d.type); s.drops = s.drops.filter((d) => d.t > 0);
    if (s.phase === "fight" || s.phase === "over") { for (const b of s.bombs) b.t -= dt; let guard = 0; while (guard++ < 40) { const due = s.bombs.find((b) => b.t <= 0); if (!due) break; explode(s, due); } }
    for (const p of s.players) {
      if (!p.alive) continue;
      p.inv = Math.max(0, p.inv - dt);
      if (s.phase === "fight") {
        const inp = p.bot ? botInput(s, p, dt) : p.inp;
        if (inp.bomb !== p.lastBomb) { p.lastBomb = inp.bomb; placeBomb(s, p); }
        const sp = (150 + p.spd * 28) * dt;
        let dx = 0, dy = 0; if (Math.abs(inp.dx) >= Math.abs(inp.dy)) { if (inp.dx > 0.2) { dx = sp; p.dir = 1; } else if (inp.dx < -0.2) { dx = -sp; p.dir = 3; } } else { if (inp.dy > 0.2) { dy = sp; p.dir = 2; } else if (inp.dy < -0.2) { dy = -sp; p.dir = 0; } }
        move(s, p, dx, dy);
      }
      for (const id of [...p.pass]) { const b = s.bombs.find((q) => q.id === id); if (!b || !(Math.abs(p.x - (b.tx + 0.5) * T) < T - 1 && Math.abs(p.y - (b.ty + 0.5) * T) < T - 1)) p.pass.delete(id); }
      const tx = tileOf(p.x), ty = tileOf(p.y), up = s.ups.get(idx(tx, ty));
      if (up) { s.ups.delete(idx(tx, ty)); if (up === "bomb") p.bm = Math.min(6, p.bm + 1); else if (up === "range") p.rg = Math.min(8, p.rg + 1); else if (up === "speed") p.spd = Math.min(5, p.spd + 1); else p.shield = 1; s.ev.push(["pick", p.slot]); }
      if (s.fl[idx(tx, ty)] > 0 && p.inv <= 0) { if (p.shield) { p.shield = 0; p.inv = 1.3; s.ev.push(["shield", p.slot]); } else { p.alive = false; s.ev.push(["die", p.slot]); } }
    }
    if (s.phase === "fight") {
      const alive = s.players.filter((p) => p.alive);
      if (alive.length <= 1) {
        s.phase = "over"; s.over = 2.6;
        if (alive.length === 1) { alive[0].wins++; s.lastWinner = alive[0].slot; } else s.lastWinner = -1;
        s.ev.push(["round", s.lastWinner]);
        const champ = s.players.find((p) => p.wins >= s.to); if (champ) { s.matchOver = true; s.winner = champ.slot; }
      }
    }
  }

  // ---------------- computer players ----------------
  function dangerMap(s) {
    const d = new Float32Array(GW * GH).fill(99);
    for (let i = 0; i < d.length; i++) if (s.fl[i] > 0) d[i] = 0;
    const sorted = s.bombs.slice().sort((a, b) => a.t - b.t);
    for (const b of sorted) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) for (let i = dx || dy ? 1 : 0; i <= (dx || dy ? b.range : 0); i++) {
      const tx = b.tx + dx * i, ty = b.ty + dy * i, g = s.grid[idx(tx, ty)]; if (g === 1 || g === 3) break;
      d[idx(tx, ty)] = Math.min(d[idx(tx, ty)], b.t); if (g === 2) break;
    }
    return d;
  }
  function bfs(s, p, from, ok, goal, maxLen) {
    const prev = new Map([[from, -1]]), q = [from]; let found = -1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h]; if (c !== from && goal(c)) { found = c; break; }
      const x = c % GW, y = (c / GW) | 0, steps = (() => { let n = 0, k = c; while (prev.get(k) !== -1) { k = prev.get(k); n++; } return n; })(); if (steps >= maxLen) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, n = idx(nx, ny); if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || prev.has(n)) continue; if (s.grid[n]) continue; const b = bombAt(s, nx, ny); if (b && !p.pass.has(b.id)) continue; if (!ok(n)) continue; prev.set(n, c); q.push(n); }
    }
    if (found < 0) return null;
    const path = []; for (let k = found; k !== -1; k = prev.get(k)) path.push(k); return path.reverse();
  }
  function botInput(s, p, dt) {
    const a = p.ai, par = { easy: { rt: 0.32, risk: 0.7, aggr: 0.35 }, medium: { rt: 0.16, risk: 1.1, aggr: 0.7 }, hard: { rt: 0.07, risk: 1.6, aggr: 1 } }[level] || {};
    a.t -= dt; const tx = tileOf(p.x), ty = tileOf(p.y), me = idx(tx, ty);
    if (a.t <= 0) {
      a.t = par.rt; a.wantBomb = false; const dmap = dangerMap(s);
      const strict = level !== 'easy', safeNow = strict ? dmap[me] > 50 : dmap[me] > par.risk + 0.4, okT = strict ? 50 : 1.4;
      if (!safeNow) { const path = bfs(s, p, me, (n) => dmap[n] > 0.15 || n === me, (n) => (strict ? dmap[n] > 50 : dmap[n] > par.risk + 1.2), 12) || bfs(s, p, me, (n) => dmap[n] > 0.15 || n === me, (n) => dmap[n] > 1.5, 12); a.path = path; }
      else {
        // maybe lay a bomb: next to a crate or an enemy in range, and only when there is a way out
        const near = (dx, dy) => { for (let i = 1; i <= p.rg; i++) { const x = tx + dx * i, y = ty + dy * i, g = s.grid[idx(x, y)]; if (g === 1 || g === 3) return false; if (g === 2) return "crate"; if (s.players.some((q) => q !== p && q.alive && tileOf(q.x) === x && tileOf(q.y) === y)) return "enemy"; } return false; };
        const hit = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => near(dx, dy)).filter(Boolean);
        const enemyHit = hit.includes("enemy"), crateHit = hit.includes("crate");
        if ((enemyHit || (crateHit && Math.random() < par.aggr)) && s.bombs.filter((b) => b.owner === p.slot).length < p.bm && !bombAt(s, tx, ty)) {
          const blast = new Set([me]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let i = 1; i <= p.rg; i++) { const x = tx + dx * i, y = ty + dy * i, g = s.grid[idx(x, y)]; if (g === 1 || g === 3) break; blast.add(idx(x, y)); if (g === 2) break; }
          const esc = bfs(s, p, me, (n) => dmap[n] > 1.5, (n) => !blast.has(n) && dmap[n] > (strict ? 50 : 2.5), 7);
          if (esc) { a.wantBomb = true; a.path = esc; }
        }
        if (!a.wantBomb) { // wander towards power-ups, crates, then enemies
          let path = bfs(s, p, me, (n) => dmap[n] > okT, (n) => s.ups.has(n), 10);
          if (!path) path = bfs(s, p, me, (n) => dmap[n] > okT, (n) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => s.grid[idx((n % GW) + dx, ((n / GW) | 0) + dy)] === 2), 14);
          let crates = 0; for (let i = 0; i < s.grid.length; i++) if (s.grid[i] === 2) crates++;
          if (!path || Math.random() < (crates < 12 ? 0.6 : 0.12) * par.aggr) { const foe = s.players.filter((q) => q !== p && q.alive).sort((u, v) => Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y))[0]; if (foe) path = bfs(s, p, me, (n) => dmap[n] > okT, (n) => n === idx(tileOf(foe.x), tileOf(foe.y)), 22) || path; }
          a.path = path;
        }
      }
    }
    let dx = 0, dy = 0;
    if (a.path && a.path.length > 1) {
      let k = a.path.indexOf(me); if (k < 0) k = 0; const nxt = a.path[Math.min(k + 1, a.path.length - 1)];
      const cx = ((nxt % GW) + 0.5) * T, cy = (((nxt / GW) | 0) + 0.5) * T; dx = cx - p.x; dy = cy - p.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      // line up with the tile row/column first, so the bot does not clip corners
      if (Math.abs(dx) > Math.abs(dy)) { const off = ((ty + 0.5) * T) - p.y; if (Math.abs(off) > 5) { dx = 0; dy = Math.sign(off); } } else { const off = ((tx + 0.5) * T) - p.x; if (Math.abs(off) > 5) { dy = 0; dx = Math.sign(off); } }
    } else if (a.wantBomb) { /* stand and drop */ }
    const bomb = a.wantBomb && !bombAt(s, tx, ty) ? p.lastBomb + 1 : p.lastBomb; if (a.wantBomb) { a.wantBomb = false; }
    return { dx, dy, bomb };
  }

  // ---------------- drawing ----------------
  function crateTile(x, y) {
    ctx.fillStyle = "#b9803c"; ctx.fillRect(x + 2, y + 2, T - 4, T - 4); ctx.fillStyle = "#d9a15a"; ctx.fillRect(x + 2, y + 2, T - 4, 8);
    ctx.strokeStyle = "#6e4a1c"; ctx.lineWidth = 3; ctx.strokeRect(x + 4, y + 4, T - 8, T - 8); ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + T - 4, y + T - 4); ctx.moveTo(x + T - 4, y + 4); ctx.lineTo(x + 4, y + T - 4); ctx.stroke();
    ctx.fillStyle = "rgba(255,230,160,.8)"; ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, 6, 0, 7); ctx.fill(); ctx.strokeStyle = "#6e4a1c"; ctx.lineWidth = 2; ctx.stroke();
  }
  function stoneTile(x, y, hard) {
    ctx.fillStyle = hard ? "#3a3f4a" : "#6a707c"; ctx.fillRect(x, y - 6, T, T + 6); ctx.fillStyle = hard ? "#565d6b" : "#8d94a3"; ctx.fillRect(x, y - 6, T, 10);
    ctx.fillStyle = hard ? "#22252d" : "#4a4f5a"; ctx.fillRect(x, y + T - 8, T, 8); ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y - 5, T - 2, T + 4);
    if (hard) { ctx.fillStyle = "#ff6a2a"; ctx.fillRect(x + 8, y + 12, T - 16, 4); }
  }
  function drawBomb(b, t) {
    const x = (b.tx + 0.5) * T, y = (b.ty + 0.5) * T + 4, k = 1 + Math.sin(t * (b.t < 0.8 ? 26 : 9)) * 0.07;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(0, 14, 16, 6, 0, 0, 7); ctx.fill();
    const g = ctx.createLinearGradient(-16, 0, 16, 0); g.addColorStop(0, "#9a2a22"); g.addColorStop(0.45, "#e5503c"); g.addColorStop(1, "#8a1f19"); ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-16, -14, 32, 30, 9); ctx.fill(); ctx.strokeStyle = "#4a0f0a"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = "#f4e6c8"; ctx.fillRect(-16, -3, 32, 8); ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(-12, -12, 5, 24);
    ctx.strokeStyle = "#d8c08a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(6, -24, 12, -22); ctx.stroke();
    ctx.fillStyle = Math.sin(t * 30) > 0 ? "#ffe45e" : "#ff8a2a"; ctx.beginPath(); ctx.arc(12, -22, 4 + Math.sin(t * 20), 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawFlame(tx, ty, k) {
    const x = (tx + 0.5) * T, y = (ty + 0.5) * T, a = Math.min(1, k * 2.4);
    const g = ctx.createRadialGradient(x, y, 2, x, y, T * 0.62); g.addColorStop(0, `rgba(255,250,200,${a})`); g.addColorStop(0.4, `rgba(255,170,40,${a})`); g.addColorStop(1, `rgba(220,60,20,${a * 0.2})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x - T / 2 + 2, y - T / 2 + 2, T - 4, T - 4, 12); ctx.fill();
  }
  function drawPlayer(p, i, t) {
    if (!p.alive) return; const col = COLS[i % 4], x = p.x, y = p.y;
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x, y + 18, 15, 6, 0, 0, 7); ctx.fill();
    const blink = p.inv > 0 && Math.floor(t * 14) % 2;
    ctx.save(); if (blink) ctx.globalAlpha = 0.4;
    TA.draw(ctx, x, y - 4, 54, { pal: col.pal, flip: p.dir === 3, bat: 0.7, mouth: "smile", look: [p.dir === 1 ? 1 : p.dir === 3 ? -1 : 0, p.dir === 2 ? 0.8 : p.dir === 0 ? -0.8 : 0], legs: performance.now() / 140 + i, parts: { legs: true, armFar: true, face: true, bat: false } });
    ctx.fillStyle = col.c; ctx.fillRect(x - 11, y + 5, 22, 5);
    ctx.restore();
    if (p.shield) { ctx.strokeStyle = "rgba(122,211,255,.9)"; ctx.lineWidth = 3; ctx.fillStyle = "rgba(122,211,255,.18)"; ctx.beginPath(); ctx.arc(x, y - 2, 25, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.font = "800 11px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.strokeText(p.name.slice(0, 9), x, y - 36); ctx.fillStyle = col.c; ctx.fillText(p.name.slice(0, 9), x, y - 36);
  }
  function render() {
    const s = role === "guest" ? view : sim; const t = performance.now() / 1000;
    ctx.fillStyle = "#10201a"; ctx.fillRect(0, 0, CW, CH); if (!s) return;
    ctx.save(); if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 8, (Math.random() - 0.5) * shake * 8);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { ctx.fillStyle = (x + y) % 2 ? "#3f8a45" : "#47964d"; ctx.fillRect(x * T, y * T, T, T); }
    for (const [i, ty] of [[0, 0]]) void i, ty;
    for (let ty = 0; ty < GH; ty++) {
      for (let tx = 0; tx < GW; tx++) { const g = s.grid[idx(tx, ty)]; if (g === 1) stoneTile(tx * T, ty * T, false); else if (g === 3) stoneTile(tx * T, ty * T, true); else if (g === 2) crateTile(tx * T, ty * T); const up = s.ups.get(idx(tx, ty)); if (up) { const by = Math.sin(t * 4 + tx) * 3; ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse((tx + 0.5) * T, (ty + 0.5) * T + 14, 12, 5, 0, 0, 7); ctx.fill(); ctx.fillStyle = "#fff8d6"; ctx.strokeStyle = "#b8860b"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc((tx + 0.5) * T, (ty + 0.5) * T + by, 15, 0, 7); ctx.fill(); ctx.stroke(); ctx.font = "18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ICON[up], (tx + 0.5) * T, (ty + 0.5) * T + by + 1); ctx.textBaseline = "alphabetic"; } }
      for (const b of s.bombs) if (b.ty === ty) drawBomb(b, t);
      s.players.forEach((p, i) => { if (tileOf(p.y) === ty) drawPlayer(p, i, t); });
    }
    for (let ty = 0; ty < GH; ty++) for (let tx = 0; tx < GW; tx++) { const f = s.fl[idx(tx, ty)]; if (f > 0) drawFlame(tx, ty, f / FLAME_T); }
    for (const q of parts) { ctx.globalAlpha = Math.max(0, q.life * 2); ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
    ctx.restore();
    // my power-ups
    const me = s.players[myIdx];
    if (me) { ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.beginPath(); ctx.roundRect(8, CH - 36, 248, 28, 10); ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = "800 13px sans-serif"; ctx.textAlign = "left"; ctx.fillText(`💣 ${me.bm}   🔥 ${me.rg}   👟 ${me.spd}   🛡️ ${me.shield ? "ON" : "-"}`, 16, CH - 17); }
    ctx.textAlign = "center"; ctx.lineWidth = 8; ctx.strokeStyle = "#111";
    const say = (txt, col) => { ctx.font = "900 54px sans-serif"; ctx.strokeText(txt, CW / 2, 90); ctx.fillStyle = col; ctx.fillText(txt, CW / 2, 90); };
    if (s.phase === "ready") say(s.ready > 0.8 ? `ROUND ${s.rd || s.round}` : "GO!", "#ffd23f");
    else if (s.phase === "over") { const w = s.lastWinner; if (w >= 0 && s.players[w]) say(`${s.players[w].name} wins!`.slice(0, 22), COLS[w % 4].c); else say("DRAW", "#fff"); }
    else if (s.phase === "fight" && (s.tr || 0) > 76 && (s.tr || 0) < 84) { ctx.font = "900 28px sans-serif"; ctx.fillStyle = "#ff8a80"; ctx.strokeText("SUDDEN DEATH - the walls close in!", CW / 2, 70); ctx.fillText("SUDDEN DEATH - the walls close in!", CW / 2, 70); }
    $("scoreChip").textContent = s.players.map((p) => `${p.name.slice(0, 8)} ${p.wins}`).join("  ·  "); $("roundChip").textContent = `Round ${s.rd || s.round} · first to ${roundsTo}`;
  }

  // ---------------- flow ----------------
  function handleEv(list, s) {
    for (const e of list) {
      if (e[0] === "boom") { shake = 0.7; beep(90, 0.35, "sawtooth", 0.12, 0.3); for (let i = 0; i < 14; i++) parts.push({ x: (e[1] + 0.5) * T, y: (e[2] + 0.5) * T, vx: (Math.random() - 0.5) * 420, vy: (Math.random() - 0.5) * 420, life: 0.45, r: 3 + Math.random() * 3, col: Math.random() < 0.5 ? "#ffb02a" : "#ff5a2a" }); }
      else if (e[0] === "place") beep(220, 0.1, "triangle", 0.07, 0.6);
      else if (e[0] === "crate") for (let i = 0; i < 6; i++) parts.push({ x: (e[1] + 0.5) * T, y: (e[2] + 0.5) * T, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 200, life: 0.5, r: 3, col: "#b9803c" });
      else if (e[0] === "pick") beep(740, 0.15, "triangle", 0.08, 1.6);
      else if (e[0] === "die") { beep(180, 0.6, "sawtooth", 0.09, 0.2); }
      else if (e[0] === "shield") beep(520, 0.2, "sine", 0.08, 0.4);
      else if (e[0] === "round") beep(e[1] === myIdx ? 740 : 220, 0.5, "triangle", 0.1, e[1] === myIdx ? 1.6 : 0.5);
      else if (e[0] === "go") beep(520, 0.25, "square", 0.08, 1.8);
    }
  }
  function readInput() { let dx = (keys.d || keys.right ? 1 : 0) - (keys.a || keys.left ? 1 : 0) + joy.x, dy = (keys.s || keys.down ? 1 : 0) - (keys.w || keys.up ? 1 : 0) + joy.y; if (Math.abs(dx) > 0.2 && Math.abs(dy) > 0.2 && keys.last) { if (keys.last === "x") dy = 0; else dx = 0; } myIn.dx = dx; myIn.dy = dy; }
  function snapshot(s) { let g = ""; for (let i = 0; i < s.grid.length; i++) g += s.grid[i]; const f = []; for (let i = 0; i < s.fl.length; i++) if (s.fl[i] > 0) f.push([i, Math.round(s.fl[i] * 100) / 100]); return { k: "s", g, p: s.players.map((p) => [Math.round(p.x), Math.round(p.y), p.dir, p.alive ? 1 : 0, p.bm, p.rg, p.spd, p.shield, p.wins, Math.round(p.inv * 10) / 10]), b: s.bombs.map((b) => [b.tx, b.ty, Math.round(b.t * 100) / 100, b.range]), f, u: [...s.ups].map(([i, t]) => [i, t]), ph: s.phase, rd: s.round, rdy: Math.round(s.ready * 100) / 100, lw: s.lastWinner, w: s.winner, tr: Math.round(s.tr), ev: pendingEv.splice(0) }; }
  function frame(tm) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.033, last ? (tm - last) / 1000 : 0.016); last = tm; readInput(); shake = Math.max(0, shake - dt * 3);
    for (const q of parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; } parts = parts.filter((q) => q.life > 0);
    if (running) {
      if (role === "solo" || role === "host") {
        sim.players[myIdx].inp = { dx: myIn.dx, dy: myIn.dy, bomb: bombCount };
        for (const [id, inp] of remoteIn) { const p = sim.players.find((q) => q.id === id); if (p) p.inp = inp; }
        const n = 2; for (let i = 0; i < n; i++) stepSim(sim, dt / n);
        if (sim.ev.length) { handleEv(sim.ev, sim); if (role === "host") pendingEv.push(...sim.ev); sim.ev = []; }
        if (role === "host") { sendAcc += dt; if (sendAcc > 0.05) { sendAcc = 0; np.send(snapshot(sim)); } }
        if (sim.phase === "end" && !over) endMatch();
      } else if (role === "guest" && view) {
        sendAcc += dt; if (sendAcc > 0.04) { sendAcc = 0; np.send({ k: "in", dx: Math.round(myIn.dx * 10) / 10, dy: Math.round(myIn.dy * 10) / 10, bomb: bombCount }); }
        for (const b of view.bombs) b.t -= dt; for (let i = 0; i < view.fl.length; i++) if (view.fl[i] > 0) view.fl[i] = Math.max(0, view.fl[i] - dt);
        view.players.forEach((p, i) => { const n = view.target[i]; if (!n) return; const k = Math.min(1, dt * 16); p.x += (n.x - p.x) * k; p.y += (n.y - p.y) * k; });
      }
    }
    render();
  }
  function endMatch() {
    over = true; running = false; const s = sim || view, iWon = s.winner === myIdx;
    if (role === "solo") {
      if (window.TungMP) TungMP.submitSolo({ game: "bomber", result: iWon ? "win" : "loss" });
      showResult(iWon ? "🏆 Last Tung standing!" : "💥 You were blown up", s.players.map((p) => `${p.name} ${p.wins}`).join(" · "), [["Play again", startSolo], ["Menu", toMenu]]);
    } else {
      if (role === "host") np.send(snapshot(sim));
      const ranking = s.players.map((p, i) => ({ id: p.id, w: p.wins, win: i === s.winner })).sort((a, b) => (b.win - a.win) || (b.w - a.w)).map((x) => x.id);
      np.report({ score: s.players[myIdx].wins, ranking });
      if (np.kind === "room") showResult(iWon ? "🏆 You win!" : "Match over", s.players.map((p) => `${p.name} ${p.wins}`).join("  ·  "), [["Back to the room", () => { hideResult(); np.setPlaying(false); }]]);
    }
  }
  function showResult(title, sub, buttons) { const r = $("result"); r.innerHTML = `<h2>${title}</h2><p>${sub}</p><div class="btn-row"></div>`; r.hidden = false; for (const [label, fn] of buttons) { const b = document.createElement("button"); b.className = "btn" + (label === "Menu" ? " secondary" : ""); b.textContent = label; b.onclick = fn; r.querySelector(".btn-row").append(b); } }
  const hideResult = () => { $("result").hidden = true; };
  function begin(newRole, players, to, seed) {
    role = newRole; over = false; hideResult(); roundsTo = to; parts = []; bombCount = 0; remoteIn.clear(); myIdx = players.findIndex((p) => p.me);
    if (role === "guest") { sim = null; view = { players: players.map((p, i) => ({ id: p.id, name: p.name, slot: i, x: 0, y: 0, dir: 2, alive: true, bm: 1, rg: 2, spd: 0, shield: 0, wins: 0, inv: 0 })), target: [], grid: new Uint8Array(GW * GH), fl: new Float32Array(GW * GH), bombs: [], ups: new Map(), phase: "ready", ready: 3, round: 1, lastWinner: -1, tr: 0 }; }
    else { sim = makeSim(players, to, seed); view = null; }
    running = true; cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame);
  }
  function startSolo() {
    level = $("level").value; const nb = Number($("bots").value), names = ["Tralalero", "Bombardiro", "Cappuccino"];
    const players = [{ id: "me", name: (window.TungMP && TungMP.user ? TungMP.user.username : "You"), me: true }];
    for (let i = 0; i < nb; i++) players.push({ id: "bot" + i, name: names[i], bot: true });
    np.setPlaying(true); begin("solo", players, Number($("rounds").value), "s" + Date.now());
  }
  function toMenu() { running = false; cancelAnimationFrame(raf); role = "idle"; hideResult(); np.setPlaying(false); }
  $("startBtn").addEventListener("click", startSolo); $("quitBtn").addEventListener("click", () => { if (np.kind) np.leave(); else toMenu(); });
  const KM = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  document.addEventListener("keydown", (e) => {
    if (role === "idle") return;
    if (KM[e.code]) { e.preventDefault(); keys[KM[e.code]] = true; keys.last = ["a", "d", "left", "right"].includes(KM[e.code]) ? "x" : "y"; }
    if ((e.code === "Space" || e.code === "KeyE") && !e.repeat) { e.preventDefault(); bombCount++; }
    if (e.code === "Escape" && role === "solo") toMenu();
  });
  document.addEventListener("keyup", (e) => { if (KM[e.code]) keys[KM[e.code]] = false; });
  TouchPad.mount($("pad"), { onMove: (x, y) => { joy = { x, y }; }, buttons: [{ label: "💣 Bomb", onDown: () => { bombCount++; } }] });

  function applySnap(d) {
    snapAt = performance.now();
    for (let i = 0; i < d.g.length; i++) view.grid[i] = d.g.charCodeAt(i) - 48;
    view.fl.fill(0); for (const [i, t] of d.f) view.fl[i] = t;
    view.bombs = d.b.map(([tx, ty, t, range]) => ({ tx, ty, t, range })); view.ups = new Map(d.u);
    d.p.forEach((a, i) => { const p = view.players[i]; if (!p) return; if (!view.target[i]) { p.x = a[0]; p.y = a[1]; } view.target[i] = { x: a[0], y: a[1] }; p.dir = a[2]; p.alive = !!a[3]; p.bm = a[4]; p.rg = a[5]; p.spd = a[6]; p.shield = a[7]; p.wins = a[8]; p.inv = a[9]; });
    view.phase = d.ph; view.rd = d.rd; view.round = d.rd; view.ready = d.rdy; view.lastWinner = d.lw; view.winner = d.w; view.tr = d.tr; handleEv(d.ev || [], view);
    if (d.ph === "end" && !over) endMatch();
  }
  const asPlayers = (c) => c.players.map((p) => ({ id: p.id, name: p.name, me: p.id === c.me.id }));
  np = NetPlay.attach({
    game: "bomber", rooms: true, panel: $("mpPanel"), menu: $("menu"), play: $("play"),
    onModeChange() { if (role === "solo") toMenu(); },
    onPrepare(c) { begin(c.host ? "host" : "guest", asPlayers(c), c.opts.rounds, c.seed); if (sim) { sim.ready = 99; } },
    onStart() { if (sim) sim.ready = 1.8; },
    onStop() { },
    onExit() { running = false; cancelAnimationFrame(raf); role = "idle"; hideResult(); },
    onNet(from, d) {
      if (!d) return;
      if (role === "host" && d.k === "in") remoteIn.set(from, { dx: clamp(+d.dx || 0, -1, 1), dy: clamp(+d.dy || 0, -1, 1), bomb: d.bomb | 0 });
      else if (role === "guest" && d.k === "s" && view) applySnap(d);
    },
    onLeft(id) { if (sim) { const p = sim.players.find((q) => q.id === id); if (p) p.alive = false; } },
    onRoomEnd(m) { running = false; const rows = m.ranking.map((r) => `<tr class="${r.place === 1 ? "win" : ""}"><td>${r.place}</td><td>${NetPlay.avatarHtml(r.avatar)} ${NetPlay.esc(r.username)}</td></tr>`).join(""); showResult(m.reason === "host_left" ? "Host left" : (m.ranking[0].id === m.you ? "🏆 You win!" : "Match over"), `<table>${rows}</table>`, [["Back to the room", () => { hideResult(); np.setPlaying(false); }]]); },
  });
  window.__bomber = () => ({ sim, view, snapshot, applySnap, begin, role, myIdx, step: (dt) => { sim.players[myIdx].inp = { dx: myIn.dx, dy: myIn.dy, bomb: bombCount }; stepSim(sim, dt); sim.ev = []; if (sim.phase === "end" && !over) endMatch(); }, input: (dx, dy) => { myIn.dx = dx; myIn.dy = dy; }, bomb: () => { bombCount++; }, setLevel: (l) => { level = l; }, makeSim, stepSim });
})();
