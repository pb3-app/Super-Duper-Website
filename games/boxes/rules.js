/* Dots and Boxes rules - shared by the server and the browser.
   n x n boxes. Players take turns drawing one line between two neighbouring dots.
   Closing the fourth side of a box claims it and you move again. Most boxes wins. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Boxes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Edges are numbered: horizontals first (row r in 0..n, col c in 0..n-1), then verticals (row r in 0..n-1, col c in 0..n).
  const hId = (n, r, c) => r * n + c;
  const vId = (n, r, c) => (n + 1) * n + r * (n + 1) + c;
  const edgeCount = (n) => 2 * n * (n + 1);
  function boxEdges(n, r, c) { return [hId(n, r, c), hId(n, r + 1, c), vId(n, r, c), vId(n, r, c + 1)]; }
  function edgeBoxes(n, e) { // boxes touching edge e
    const out = [];
    if (e < (n + 1) * n) { const r = Math.floor(e / n), c = e % n; if (r > 0) out.push((r - 1) * n + c); if (r < n) out.push(r * n + c); }
    else { const k = e - (n + 1) * n, r = Math.floor(k / (n + 1)), c = k % (n + 1); if (c > 0) out.push(r * n + c - 1); if (c < n) out.push(r * n + c); }
    return out;
  }
  function edgeInfo(n, e) {
    if (e < (n + 1) * n) return { o: 'h', r: Math.floor(e / n), c: e % n };
    const k = e - (n + 1) * n; return { o: 'v', r: Math.floor(k / (n + 1)), c: k % (n + 1) };
  }

  function newGame(opts) {
    const n = Math.max(2, Math.min(8, Math.floor(Number(opts && opts.size) || 4)));
    return { n, edges: new Array(edgeCount(n)).fill(0), boxes: new Array(n * n).fill(0), turn: 0, over: false, winner: null, reason: null, last: -1, score: [0, 0], free: edgeCount(n) };
  }
  const clone = (g) => ({ ...g, edges: g.edges.slice(), boxes: g.boxes.slice(), score: g.score.slice() });
  const sidesOf = (g, b) => boxEdges(g.n, Math.floor(b / g.n), b % g.n).filter((e) => g.edges[e]).length;

  function draw(g, e) { // mutates; returns boxes completed
    g.edges[e] = g.turn + 1;
    g.last = e; g.free--;
    let got = 0;
    for (const b of edgeBoxes(g.n, e)) if (!g.boxes[b] && sidesOf(g, b) === 4) { g.boxes[b] = g.turn + 1; g.score[g.turn]++; got++; }
    if (g.free === 0) {
      g.over = true; g.reason = 'boxes';
      g.winner = g.score[0] === g.score[1] ? null : g.score[0] > g.score[1] ? 0 : 1;
    } else if (!got) g.turn = 1 - g.turn;
    return got;
  }

  function play(g, move, idx) {
    if (g.over) return { ok: false, error: 'The game is over' };
    if (idx !== g.turn) return { ok: false, error: 'Not your turn' };
    const o = move && move.o, r = Number(move && move.r), c = Number(move && move.c), n = g.n;
    if (!Number.isInteger(r) || !Number.isInteger(c)) return { ok: false, error: 'Bad move' };
    let e;
    if (o === 'h' && r >= 0 && r <= n && c >= 0 && c < n) e = hId(n, r, c);
    else if (o === 'v' && r >= 0 && r < n && c >= 0 && c <= n) e = vId(n, r, c);
    else return { ok: false, error: 'Bad move' };
    if (g.edges[e]) return { ok: false, error: 'That line is already drawn' };
    const by = g.turn;
    const got = draw(g, e);
    return { ok: true, ev: { e, got, by } };
  }

  const view = (g) => g;
  const turnOf = (g) => (g.over ? -2 : g.turn);
  const progress = (g, idx) => g.score[idx];
  const freeEdges = (g) => { const o = []; for (let e = 0; e < g.edges.length; e++) if (!g.edges[e]) o.push(e); return o; };

  // ----- computer player -----
  function ai(g, level) {
    const free = freeEdges(g);
    if (!free.length) return null;
    const toMove = (e) => edgeInfo(g.n, e);
    const rnd = (a) => a[Math.floor(Math.random() * a.length)];
    const takes = free.filter((e) => edgeBoxes(g.n, e).some((b) => !g.boxes[b] && sidesOf(g, b) === 3));
    const safe = free.filter((e) => edgeBoxes(g.n, e).every((b) => sidesOf(g, b) < 2));
    if (level === 'easy') return toMove(takes.length && Math.random() < 0.8 ? rnd(takes) : rnd(free));
    // End game: search exactly when few lines remain (finds sacrifices and double-crosses).
    if (level === 'hard' && free.length <= 12) {
      const memo = new Map();
      const solve = (st) => { // best (my boxes - their boxes) for the player to move from st
        let key = 0; for (let i = 0; i < st.edges.length; i++) if (st.edges[i]) key += Math.pow(2, i);
        if (memo.has(key)) return memo.get(key);
        let best = -Infinity;
        for (const e of freeEdges(st)) {
          const n = clone(st); const before = n.score[n.turn]; const t = n.turn;
          draw(n, e);
          const gained = n.score[t] - before;
          const v = n.over ? gained : (n.turn === t ? gained + solve(n) : gained - solve(n));
          if (v > best) best = v;
        }
        memo.set(key, best);
        return best;
      };
      let bestV = -Infinity, picks = [];
      for (const e of free) {
        const n = clone(g); const t = n.turn; const before = n.score[t];
        draw(n, e);
        const gained = n.score[t] - before;
        const v = n.over ? gained : (n.turn === t ? gained + solve(n) : gained - solve(n));
        if (v > bestV) { bestV = v; picks = [e]; } else if (v === bestV) picks.push(e);
      }
      return toMove(rnd(picks));
    }
    if (takes.length) return toMove(rnd(takes));
    if (safe.length) return toMove(rnd(safe));
    // Every move gives something away: give away as little as possible.
    let bestCost = Infinity, picks = [];
    for (const e of free) {
      const n = clone(g); n.turn = 1 - g.turn; // pretend the opponent moves next after our line
      draw(n, e);
      n.turn = 1 - g.turn;
      let cost = 0, guard = 0;
      for (;;) { // opponent greedily takes every box offered
        const t3 = freeEdges(n).find((x) => edgeBoxes(n.n, x).some((b) => !n.boxes[b] && sidesOf(n, b) === 3));
        if (t3 === undefined || n.over || guard++ > 80) break;
        cost += draw(n, t3);
      }
      cost += Math.random() * 0.1;
      if (cost < bestCost) { bestCost = cost; picks = [e]; } else if (Math.abs(cost - bestCost) < 0.0001) picks.push(e);
    }
    return toMove(rnd(picks));
  }

  return { newGame, play, view, turnOf, progress, ai, hId, vId, boxEdges, edgeInfo, edgeBoxes, sidesOf, clone };
});
