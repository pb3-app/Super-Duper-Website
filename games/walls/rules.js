/* Tung Walls rules (a race with walls, like Quoridor) - shared by the server and the browser.
   9 x 9 squares. Each tung starts in the middle of its own edge and has to reach the far edge. On your turn you either
   step one square up, down, left or right, or put down a wall (two squares long, ten walls each). Walls cannot be walked
   through, but you may never wall a tung in completely: there must always be a way to the finish for both.
   If the other tung is right next to you, jump over it (or step to the side if a wall or the edge is behind it).

   Board: rows 0 (top) to 8, columns 0 to 8. Player 0 starts at the bottom (row 8) and runs to row 0, player 1 the other way.
   A wall is { r, c, o } with r and c from 0 to 7. o = 'h': it lies under row r and spans columns c and c + 1.
   o = 'v': it lies to the right of column c and spans rows r and r + 1.
   Moves: { t: 'move', r, c } or { t: 'wall', r, c, o }. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.TungWalls = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const N = 9, WALLS = 10, GOAL = [0, 8];

  function newGame() {
    return { pawns: [{ r: 8, c: 4 }, { r: 0, c: 4 }], h: new Array(64).fill(0), v: new Array(64).fill(0), left: [WALLS, WALLS], turn: 0, over: false, winner: null, reason: null, last: null, moves: 0 };
  }
  const clone = (g) => ({ ...g, pawns: [{ ...g.pawns[0] }, { ...g.pawns[1] }], h: g.h.slice(), v: g.v.slice(), left: g.left.slice() });

  const hb = (g, r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8 && g.h[r * 8 + c] ? 1 : 0);
  const vb = (g, r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8 && g.v[r * 8 + c] ? 1 : 0);
  // can you step from (r, c) one square in direction (dr, dc) without a wall or the edge in the way?
  function open(g, r, c, dr, dc) {
    if (dr === -1) return r >= 1 && !hb(g, r - 1, c) && !hb(g, r - 1, c - 1);
    if (dr === 1) return r <= 7 && !hb(g, r, c) && !hb(g, r, c - 1);
    if (dc === 1) return c <= 7 && !vb(g, r, c) && !vb(g, r - 1, c);
    return c >= 1 && !vb(g, r, c - 1) && !vb(g, r - 1, c - 1);
  }
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function pawnMoves(g, idx) {
    const me = g.pawns[idx], opp = g.pawns[1 - idx], out = [];
    for (const [dr, dc] of DIRS) {
      if (!open(g, me.r, me.c, dr, dc)) continue;
      const nr = me.r + dr, nc = me.c + dc;
      if (nr !== opp.r || nc !== opp.c) { out.push({ r: nr, c: nc }); continue; }
      if (open(g, opp.r, opp.c, dr, dc)) { out.push({ r: opp.r + dr, c: opp.c + dc }); continue; } // jump straight over
      for (const [pr, pc] of DIRS) { // blocked behind the other tung: step round it
        if ((pr === dr && pc === dc) || (pr === -dr && pc === -dc)) continue;
        if (open(g, opp.r, opp.c, pr, pc)) out.push({ r: opp.r + pr, c: opp.c + pc });
      }
    }
    return out;
  }

  // steps to the finish row for a tung (the other tung does not count), -1 if there is no way
  const seen = new Int32Array(81), queue = new Int16Array(81), prev = new Int16Array(81);
  let stamp = 0;
  function dist(g, idx, wantPath) {
    const p = g.pawns[idx], goal = GOAL[idx];
    if (p.r === goal) return wantPath ? [] : 0;
    stamp++;
    let qh = 0, qt = 0, start = p.r * 9 + p.c;
    queue[qt++] = start; seen[start] = stamp; prev[start] = -1;
    // level by level, so the distance is known without a second array
    let level = 0, levelEnd = qt;
    while (qh < qt) {
      const cur = queue[qh++], r = (cur / 9) | 0, c = cur % 9;
      for (const [dr, dc] of DIRS) {
        if (!open(g, r, c, dr, dc)) continue;
        const nr = r + dr, nc = c + dc, k = nr * 9 + nc;
        if (seen[k] === stamp) continue;
        seen[k] = stamp; prev[k] = cur; queue[qt++] = k;
        if (nr === goal) {
          if (!wantPath) return level + 1;
          const path = []; let x = k;
          while (x !== start) { path.push({ r: (x / 9) | 0, c: x % 9 }); x = prev[x]; }
          return path.reverse();
        }
      }
      if (qh === levelEnd) { level++; levelEnd = qt; }
    }
    return wantPath ? null : -1;
  }

  function wallLegal(g, w) {
    const r = w.r, c = w.c, o = w.o;
    if ((o !== 'h' && o !== 'v') || !Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r > 7 || c < 0 || c > 7) return false;
    const k = r * 8 + c;
    if (g.h[k] || g.v[k]) return false; // the same spot, or crossing a wall there
    if (o === 'h') { if ((c > 0 && g.h[k - 1]) || (c < 7 && g.h[k + 1])) return false; }
    else if ((r > 0 && g.v[k - 8]) || (r < 7 && g.v[k + 8])) return false;
    const arr = o === 'h' ? g.h : g.v;
    arr[k] = 1;
    const ok = dist(g, 0) >= 0 && dist(g, 1) >= 0;
    arr[k] = 0;
    return ok;
  }

  function apply(g, mv) { // assumes the move is legal; mutates g
    const idx = g.turn;
    if (mv.t === 'wall') {
      (mv.o === 'h' ? g.h : g.v)[mv.r * 8 + mv.c] = 1; g.left[idx]--;
      g.last = { idx, t: 'wall', r: mv.r, c: mv.c, o: mv.o };
    } else {
      const from = { ...g.pawns[idx] };
      g.pawns[idx] = { r: mv.r, c: mv.c };
      g.last = { idx, t: 'move', r: mv.r, c: mv.c, fr: from.r, fc: from.c };
      if (mv.r === GOAL[idx]) { g.over = true; g.winner = idx; g.reason = 'goal'; }
    }
    g.moves++;
    if (!g.over) g.turn = 1 - g.turn;
  }

  function play(g, move, idx) {
    if (g.over) return { ok: false, error: 'The game is over' };
    if (idx !== g.turn) return { ok: false, error: 'Not your turn' };
    if (!move || typeof move !== 'object') return { ok: false, error: 'Bad move' };
    if (move.t === 'move') {
      const r = Number(move.r), c = Number(move.c);
      if (!pawnMoves(g, idx).some((m) => m.r === r && m.c === c)) return { ok: false, error: 'You cannot step there' };
      apply(g, { t: 'move', r, c });
      return { ok: true, ev: g.last };
    }
    if (move.t === 'wall') {
      if (g.left[idx] <= 0) return { ok: false, error: 'You are out of walls' };
      const w = { r: Number(move.r), c: Number(move.c), o: move.o };
      if (!wallLegal(g, w)) return { ok: false, error: 'You cannot put a wall there (it overlaps, or it would trap a tung)' };
      apply(g, { t: 'wall', ...w });
      return { ok: true, ev: g.last };
    }
    return { ok: false, error: 'Bad move' };
  }

  const view = (g) => g;
  const turnOf = (g) => (g.over ? -2 : g.turn);
  const progress = (g, idx) => (idx === 0 ? 8 - g.pawns[0].r : g.pawns[1].r); // rows crossed

  // ----- computer player -----
  // walls that would get in the way of `idx` along its shortest route (the only walls worth trying)
  function wallsAgainst(g, idx) {
    const path = dist(g, idx, true) || [], out = [], seenK = new Set();
    let pr = g.pawns[idx].r, pc = g.pawns[idx].c;
    const add = (r, c, o) => { const k = o + r * 8 + c; if (r < 0 || r > 7 || c < 0 || c > 7 || seenK.has(k)) return; seenK.add(k); out.push({ t: 'wall', r, c, o }); };
    for (const s of path) {
      if (s.r !== pr) { const r = Math.min(s.r, pr); add(r, s.c, 'h'); add(r, s.c - 1, 'h'); }
      else { const c = Math.min(s.c, pc); add(s.r, c, 'v'); add(s.r - 1, c, 'v'); }
      pr = s.r; pc = s.c;
    }
    return out;
  }
  function score(g, me) { // positive = good for `me`
    if (g.over) return g.winner === me ? 1e5 - g.moves : -1e5 + g.moves;
    const dm = dist(g, me), dO = dist(g, 1 - me);
    return (dO - dm) * 10 + (g.left[me] - g.left[1 - me]) * 0.7 + (g.turn === me ? 1 : -1);
  }
  function genMoves(g, limit) {
    const idx = g.turn, mv = pawnMoves(g, idx).map((m) => ({ t: 'move', r: m.r, c: m.c }));
    const walls = [];
    if (g.left[idx] > 0) for (const w of wallsAgainst(g, 1 - idx)) if (wallLegal(g, w)) walls.push(w);
    if (limit && walls.length > limit) { // keep the walls that hurt the other tung most
      const sc = (w) => { const n = clone(g); apply(n, w); return dist(n, 1 - idx) - dist(n, idx) * 0.5; };
      walls.sort((a, b) => sc(b) - sc(a)); walls.length = limit;
    }
    return mv.concat(walls);
  }
  function search(g, depth, alpha, beta, me, limit) {
    if (g.over || depth === 0) return score(g, me);
    const moves = genMoves(g, limit), maxing = g.turn === me;
    if (!moves.length) return score(g, me);
    let best = maxing ? -Infinity : Infinity;
    for (const mv of moves) {
      const n = clone(g); apply(n, mv);
      const v = search(n, depth - 1, alpha, beta, me, limit);
      if (maxing) { if (v > best) best = v; if (v > alpha) alpha = v; } else { if (v < best) best = v; if (v < beta) beta = v; }
      if (beta <= alpha) break;
    }
    return best;
  }
  // level: 'easy' = always walks the shortest way, never uses a wall; 'medium' looks 2 moves ahead; 'hard' looks 4
  function ai(g, level) {
    const idx = g.turn, steps = pawnMoves(g, idx);
    if (!steps.length) return null;
    if (level === 'easy') {
      let best = [], bd = 1e9;
      for (const m of steps) {
        const n = clone(g); apply(n, { t: 'move', r: m.r, c: m.c });
        const d = n.over ? -1 : dist(n, idx);
        if (d < bd) { bd = d; best = [m]; } else if (d === bd) best.push(m);
      }
      const m = best[Math.floor(Math.random() * best.length)];
      return { t: 'move', r: m.r, c: m.c };
    }
    const depth = level === 'hard' ? 4 : 2, limit = level === 'hard' ? 7 : 9;
    const moves = genMoves(g, limit + 2);
    let bestV = -Infinity, pick = [];
    for (const mv of moves) {
      const n = clone(g); apply(n, mv);
      let v = search(n, depth - 1, -Infinity, Infinity, idx, limit) + Math.random() * 0.05;
      if (level === 'medium' && mv.t === 'wall' && g.left[idx] <= 5) v -= 0.5; // medium saves its last walls a little
      if (v > bestV + 1e-9) { bestV = v; pick = [mv]; } else if (Math.abs(v - bestV) <= 1e-9) pick.push(mv);
    }
    return pick[Math.floor(Math.random() * pick.length)];
  }

  return { N, WALLS, GOAL, newGame, clone, play, view, turnOf, progress, pawnMoves, wallLegal, dist, open, apply, ai };
});
