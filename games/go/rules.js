/* Go rules - shared by the server and the browser.
   Area (Chinese) scoring with 7.5 komi, positional superko, suicide is illegal.
   After two passes players mark dead stones and both accept the count (or play on). Black is player 0. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GoRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const KOMI = 7.5;
  function newGame(opts) {
    const n = [9, 13, 19].includes(Number(opts && opts.size)) ? Number(opts.size) : 9;
    return { n, cells: new Array(n * n).fill(0), turn: 0, caps: [0, 0], passes: 0, phase: 'play', dead: [], acc: [false, false], hist: { [new Array(n * n).fill(0).join('')]: 1 }, last: null, ko: -1, komi: KOMI, over: false, winner: null, reason: null, result: null, moves: 0 };
  }
  const nbrs = (n, i) => { const x = i % n, y = (i / n) | 0, o = []; if (x > 0) o.push(i - 1); if (x < n - 1) o.push(i + 1); if (y > 0) o.push(i - n); if (y < n - 1) o.push(i + n); return o; };
  function group(cells, n, i) { // connected stones of the same colour and their liberties
    const c = cells[i], seen = new Set([i]), stack = [i], libs = new Set(), stones = [];
    while (stack.length) {
      const p = stack.pop(); stones.push(p);
      for (const q of nbrs(n, p)) {
        if (cells[q] === 0) libs.add(q);
        else if (cells[q] === c && !seen.has(q)) { seen.add(q); stack.push(q); }
      }
    }
    return { stones, libs };
  }
  // Tries a move on a copy; returns {cells, captured} or null when illegal (occupied, suicide). Superko is checked by the caller.
  function attempt(cells, n, i, color) {
    if (cells[i] !== 0) return null;
    const b = cells.slice(); b[i] = color;
    const opp = 3 - color; let captured = 0;
    for (const q of nbrs(n, i)) if (b[q] === opp) { const g = group(b, n, q); if (g.libs.size === 0) { for (const s of g.stones) b[s] = 0; captured += g.stones.length; } }
    if (group(b, n, i).libs.size === 0) return null;
    return { cells: b, captured };
  }
  const key = (cells) => cells.join('');

  function legal(g, i, color) {
    const r = attempt(g.cells, g.n, i, color);
    if (!r) return false;
    return !g.hist[key(r.cells)];
  }

  function areaScore(cells, n, dead) {
    const b = cells.slice();
    for (const i of dead || []) b[i] = 0;
    let black = 0, white = 0, tb = 0, tw = 0;
    const seen = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      if (b[i] === 1) black++; else if (b[i] === 2) white++;
      else if (!seen[i]) {
        const stack = [i]; seen[i] = 1; let size = 0, touchB = false, touchW = false;
        while (stack.length) { const p = stack.pop(); size++; for (const q of nbrs(n, p)) { if (b[q] === 1) touchB = true; else if (b[q] === 2) touchW = true; else if (!seen[q]) { seen[q] = 1; stack.push(q); } } }
        if (touchB && !touchW) tb += size; else if (touchW && !touchB) tw += size;
      }
    }
    return { black: black + tb, white: white + tw, stonesB: black, stonesW: white, terrB: tb, terrW: tw };
  }
  function finishScore(g) {
    const s = areaScore(g.cells, g.n, g.dead);
    const w = s.white + g.komi;
    g.result = { ...s, komi: g.komi, whiteTotal: w, margin: Math.abs(s.black - w) };
    g.over = true; g.phase = 'done'; g.winner = s.black > w ? 0 : 1; g.reason = 'score';
  }

  function play(g, move, idx) {
    if (g.over) return { ok: false, error: 'The game is over' };
    const m = move || {};
    if (m.t === 'resign') { g.over = true; g.phase = 'done'; g.winner = 1 - idx; g.reason = 'resign'; return { ok: true, ev: { resign: idx } }; }
    if (g.phase === 'play') {
      if (idx !== g.turn) return { ok: false, error: 'Not your turn' };
      if (m.t === 'pass') {
        g.passes++; g.last = { pass: true, by: idx }; g.ko = -1; g.turn = 1 - g.turn; g.moves++;
        if (g.passes >= 2) { g.phase = 'score'; g.acc = [false, false]; g.dead = []; }
        return { ok: true, ev: { pass: idx, score: g.phase === 'score' } };
      }
      if (m.t !== 'play') return { ok: false, error: 'Bad move' };
      const x = Math.floor(Number(m.x)), y = Math.floor(Number(m.y));
      if (!(x >= 0 && x < g.n && y >= 0 && y < g.n)) return { ok: false, error: 'Off the board' };
      const i = y * g.n + x, color = idx + 1;
      if (g.cells[i] !== 0) return { ok: false, error: 'That point is taken' };
      const r = attempt(g.cells, g.n, i, color);
      if (!r) return { ok: false, error: 'Suicide is not allowed' };
      const k = key(r.cells);
      if (g.hist[k]) return { ok: false, error: 'Ko: that would repeat an earlier position' };
      g.hist[k] = 1; g.cells = r.cells; g.caps[idx] += r.captured; g.passes = 0; g.last = { x, y, by: idx };
      g.ko = r.captured === 1 && group(g.cells, g.n, i).stones.length === 1 ? (function () { for (const q of nbrs(g.n, i)) if (g.cells[q] === 0) return q; return -1; })() : -1;
      g.turn = 1 - g.turn; g.moves++;
      return { ok: true, ev: { x, y, captured: r.captured, by: idx } };
    }
    if (g.phase === 'score') {
      if (m.t === 'dead') {
        const x = Math.floor(Number(m.x)), y = Math.floor(Number(m.y));
        if (!(x >= 0 && x < g.n && y >= 0 && y < g.n)) return { ok: false, error: 'Off the board' };
        const i = y * g.n + x;
        if (!g.cells[i]) return { ok: false, error: 'Click a stone to mark it dead or alive' };
        const stones = group(g.cells, g.n, i).stones, set = new Set(g.dead), isDead = set.has(i);
        for (const s of stones) { if (isDead) set.delete(s); else set.add(s); }
        g.dead = [...set]; g.acc = [false, false];
        return { ok: true, ev: { dead: true } };
      }
      if (m.t === 'accept') { g.acc[idx] = true; if (g.acc[0] && g.acc[1]) finishScore(g); return { ok: true, ev: { accept: idx } }; }
      if (m.t === 'resume') { g.phase = 'play'; g.passes = 0; g.dead = []; g.acc = [false, false]; g.turn = idx; return { ok: true, ev: { resume: idx } }; }
      return { ok: false, error: 'Mark dead stones, then accept the count (or play on)' };
    }
    return { ok: false, error: 'Bad move' };
  }

  const view = (g) => { const v = { ...g }; delete v.hist; return v; };
  const turnOf = (g) => (g.over ? -2 : g.phase === 'score' ? -1 : g.turn);
  const laggard = (g) => (g.phase === 'score' ? (g.acc[0] && !g.acc[1] ? 1 : g.acc[1] && !g.acc[0] ? 0 : -1) : -1);
  const progress = (g, idx) => g.caps[idx];

  // ------------------- computer player (Monte Carlo) -------------------
  const rnd = (k) => Math.floor(Math.random() * k);
  function isOwnEye(b, n, i, color) {
    const ns = nbrs(n, i);
    if (!ns.every((q) => b[q] === color)) return false;
    const x = i % n, y = (i / n) | 0; let bad = 0, total = 0;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= n || yy >= n) { bad += 0; continue; } total++; const c = b[yy * n + xx]; if (c !== color) bad++; }
    const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
    return edge ? bad === 0 : bad <= 1;
  }
  function playout(cells, n, toMove, maxMoves) {
    let b = cells.slice(), color = toMove, passes = 0;
    for (let mv = 0; mv < maxMoves && passes < 2; mv++) {
      const empties = []; for (let i = 0; i < b.length; i++) if (b[i] === 0) empties.push(i);
      let moved = false;
      for (let t = 0; t < 14 && empties.length; t++) {
        const k = rnd(empties.length), i = empties[k];
        if (isOwnEye(b, n, i, color)) { empties[k] = empties[empties.length - 1]; empties.pop(); continue; }
        const r = attempt(b, n, i, color);
        if (r) { b = r.cells; moved = true; break; }
        empties[k] = empties[empties.length - 1]; empties.pop();
      }
      if (moved) passes = 0; else passes++;
      color = 3 - color;
    }
    return areaScore(b, n, null);
  }
  function candidates(g) {
    const n = g.n, color = g.turn + 1, out = [];
    const near = new Set();
    for (let i = 0; i < n * n; i++) if (g.cells[i]) { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = (i % n) + dx, y = ((i / n) | 0) + dy; if (x >= 0 && y >= 0 && x < n && y < n) near.add(y * n + x); } }
    const stars = n === 9 ? [20, 24, 56, 60, 40] : n === 13 ? [42, 48, 120, 126, 84] : [60, 66, 72, 174, 180, 186, 288, 294, 300];
    if (near.size === 0) for (const s of stars) near.add(s);
    for (const i of near) if (g.cells[i] === 0 && legal(g, i, color) && !isOwnEye(g.cells, n, i, color)) out.push(i);
    return out;
  }
  function tactical(g, cand) { // capture, or save a group in atari: used by the easy level and to order choices
    const n = g.n, color = g.turn + 1, opp = 3 - color, score = new Map();
    for (const i of cand) {
      let s = 0;
      for (const q of nbrs(n, i)) {
        if (g.cells[q] === opp) { const gr = group(g.cells, n, q); if (gr.libs.size === 1) s += 6 + gr.stones.length; else if (gr.libs.size === 2) s += 1.5; }
        if (g.cells[q] === color) { const gr = group(g.cells, n, q); if (gr.libs.size === 1) s += 5 + gr.stones.length; }
      }
      const x = i % n, y = (i / n) | 0; if (x === 0 || y === 0 || x === n - 1 || y === n - 1) s -= 1.2;
      score.set(i, s + Math.random() * 0.8);
    }
    return score;
  }
  // returns {t:'play',x,y} or {t:'pass'}
  function ai(g, level, budgetMs) {
    const n = g.n, color = g.turn + 1;
    const cand = candidates(g);
    const last = g.last;
    if (!cand.length) return { t: 'pass' };
    const tac = tactical(g, cand);
    const toMove = (i) => ({ t: 'play', x: i % n, y: (i / n) | 0 });
    if (level === 'easy') { let best = cand[0], bs = -1e9; for (const i of cand) { const s = tac.get(i); if (s > bs) { bs = s; best = i; } } return toMove(best); }
    const ms = budgetMs || (level === 'hard' ? (n <= 9 ? 2200 : 2600) : (n <= 9 ? 900 : 1100));
    const ordered = cand.slice().sort((a, b) => tac.get(b) - tac.get(a)).slice(0, n <= 9 ? 22 : 16);
    const stats = ordered.map((i) => ({ i, w: 0, k: 0 }));
    const opp = g.passes > 0 && last && last.pass;
    const t0 = Date.now(); let total = 0;
    const maxMoves = Math.round(n * n * 0.9);
    while (Date.now() - t0 < ms) {
      let pick = null, pv = -1;
      for (const s of stats) { const v = s.k === 0 ? 1e9 : s.w / s.k + 0.9 * Math.sqrt(Math.log(total + 1) / s.k); if (v > pv) { pv = v; pick = s; } }
      const r = attempt(g.cells, n, pick.i, color); if (!r) { pick.k = 1e9; pick.w = 0; continue; }
      const sc = playout(r.cells, n, 3 - color, maxMoves);
      const mine = color === 1 ? sc.black : sc.white + KOMI, theirs = color === 1 ? sc.white + KOMI : sc.black;
      pick.k++; total++; pick.w += mine > theirs ? 1 : 0;
    }
    let best = stats[0], bv = -1;
    for (const s of stats) { const v = (s.w + 0.5 + (tac.get(s.i) || 0) * 0.02) / (s.k + 1); if (s.k < 1e8 && v > bv) { bv = v; best = s; } }
    // pass when the opponent passed and we are already ahead on the board
    if (opp) { const sc = areaScore(g.cells, n, null); const mine = color === 1 ? sc.black : sc.white + KOMI, theirs = color === 1 ? sc.white + KOMI : sc.black; if (mine > theirs + 1) return { t: 'pass' }; }
    if (bv < 0.08 && g.moves > n * n * 0.6) return { t: 'pass' };
    return toMove(best.i);
  }
  // groups the computer thinks are dead, from many quick playouts
  function estimateDead(g, playouts) {
    const n = g.n, own = new Array(n * n).fill(0).map(() => [0, 0]);
    for (let p = 0; p < (playouts || 120); p++) {
      let b = g.cells.slice(), color = g.turn + 1, passes = 0;
      for (let mv = 0; mv < n * n && passes < 2; mv++) {
        const empties = []; for (let i = 0; i < b.length; i++) if (b[i] === 0) empties.push(i);
        let moved = false;
        for (let t = 0; t < 12 && empties.length; t++) { const k = rnd(empties.length), i = empties[k]; if (isOwnEye(b, n, i, color)) { empties[k] = empties[empties.length - 1]; empties.pop(); continue; } const r = attempt(b, n, i, color); if (r) { b = r.cells; moved = true; break; } empties[k] = empties[empties.length - 1]; empties.pop(); }
        if (moved) passes = 0; else passes++; color = 3 - color;
      }
      for (let i = 0; i < b.length; i++) { if (b[i]) own[i][b[i] - 1]++; }
    }
    const dead = new Set(), seen = new Set();
    for (let i = 0; i < n * n; i++) {
      if (!g.cells[i] || seen.has(i)) continue;
      const gr = group(g.cells, n, i); for (const s of gr.stones) seen.add(s);
      const c = g.cells[i] - 1; let mineCount = 0, total = 0;
      for (const s of gr.stones) { mineCount += own[s][c]; total += (playouts || 120); }
      if (mineCount / total < 0.3) for (const s of gr.stones) dead.add(s);
    }
    return [...dead];
  }

  return { KOMI, newGame, play, view, turnOf, laggard, progress, legal, attempt, group, areaScore, ai, estimateDead, nbrs };
});
