/* Super (Ultimate) Tic-Tac-Toe rules - shared by the server and the browser.
   9 small boards make one big board. Where you play inside a small board decides which small
   board your opponent must play in next. If that board is already won or full, they may play in
   any open board. Win three small boards in a row to win. A full board nobody won counts for nobody. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.UTTT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const WEIGHT = [3, 2, 3, 2, 4, 2, 3, 2, 3];

  function newGame() {
    return { cells: new Array(81).fill(0), boards: new Array(9).fill(0), turn: 0, next: -1, over: false, winner: null, reason: null, last: -1, moves: 0 };
  }
  const clone = (g) => ({ ...g, cells: g.cells.slice(), boards: g.boards.slice() });
  const lineWon = (a, m) => LINES.some((l) => a[l[0]] === m && a[l[1]] === m && a[l[2]] === m);

  function legalMoves(g) {
    const out = [];
    if (g.over) return out;
    for (let b = 0; b < 9; b++) {
      if (g.boards[b] !== 0 || (g.next !== -1 && g.next !== b)) continue;
      for (let c = 0; c < 9; c++) if (g.cells[b * 9 + c] === 0) out.push({ b, c });
    }
    return out;
  }

  function apply(g, mv) { // assumes the move is legal; mutates g
    const mark = g.turn + 1;
    g.cells[mv.b * 9 + mv.c] = mark;
    g.last = mv.b * 9 + mv.c;
    g.moves++;
    const sub = g.cells.slice(mv.b * 9, mv.b * 9 + 9);
    let boardWon = false;
    if (lineWon(sub, mark)) { g.boards[mv.b] = mark; boardWon = true; }
    else if (sub.every((x) => x)) g.boards[mv.b] = 3;
    if (lineWon(g.boards, mark)) { g.over = true; g.winner = g.turn; g.reason = 'tictactoe'; }
    else if (g.boards.every((x) => x !== 0)) {
      g.over = true; g.reason = 'draw';
      const a = g.boards.filter((x) => x === 1).length, b2 = g.boards.filter((x) => x === 2).length;
      g.winner = null; // equal-or-not, a full big board without a line is a draw
      g.tally = [a, b2];
    }
    g.next = g.boards[mv.c] === 0 ? mv.c : -1;
    if (!g.over) g.turn = 1 - g.turn;
    return boardWon;
  }

  function play(g, move, idx) {
    if (g.over) return { ok: false, error: 'The game is over' };
    if (idx !== g.turn) return { ok: false, error: 'Not your turn' };
    const b = Number(move && move.b), c = Number(move && move.c);
    if (!Number.isInteger(b) || !Number.isInteger(c) || b < 0 || b > 8 || c < 0 || c > 8) return { ok: false, error: 'Bad move' };
    if (g.boards[b] !== 0) return { ok: false, error: 'That board is already decided' };
    if (g.next !== -1 && g.next !== b) return { ok: false, error: `You must play in board ${g.next + 1}` };
    if (g.cells[b * 9 + c] !== 0) return { ok: false, error: 'That square is taken' };
    const won = apply(g, { b, c });
    return { ok: true, ev: { b, c, won } };
  }

  const view = (g) => g;
  const turnOf = (g) => (g.over ? -2 : g.turn);
  const progress = (g, idx) => g.boards.filter((x) => x === idx + 1).length;

  // ----- computer player -----
  function evalFor(g, me) { // positive = good for `me` (0/1)
    const m = me + 1, o = 2 - me;
    if (g.over) return g.winner === me ? 1e5 : g.winner === null ? 0 : -1e5;
    let s = 0;
    for (let b = 0; b < 9; b++) {
      const v = g.boards[b];
      if (v === m) s += 30 * WEIGHT[b]; else if (v === o) s -= 30 * WEIGHT[b];
      else if (v === 0) {
        const sub = g.cells.slice(b * 9, b * 9 + 9);
        for (const l of LINES) {
          const a = [sub[l[0]], sub[l[1]], sub[l[2]]];
          const mc = a.filter((x) => x === m).length, oc = a.filter((x) => x === o).length;
          if (oc === 0) s += mc === 2 ? 5 : mc === 1 ? 1 : 0;
          if (mc === 0) s -= oc === 2 ? 5 : oc === 1 ? 1 : 0;
        }
      }
    }
    for (const l of LINES) {
      const a = [g.boards[l[0]], g.boards[l[1]], g.boards[l[2]]];
      const mc = a.filter((x) => x === m).length, oc = a.filter((x) => x === o).length, dead = a.filter((x) => x === 3).length;
      if (dead) continue;
      if (oc === 0) s += mc === 2 ? 60 : mc === 1 ? 12 : 0;
      if (mc === 0) s -= oc === 2 ? 60 : oc === 1 ? 12 : 0;
    }
    if (g.next === -1) s += g.turn === me ? 8 : -8;
    return s;
  }
  function search(g, depth, alpha, beta, me) {
    if (g.over || depth === 0) return evalFor(g, me);
    const moves = legalMoves(g);
    if (!moves.length) return 0;
    const maxing = g.turn === me;
    let best = maxing ? -Infinity : Infinity;
    for (const mv of moves) {
      const n = clone(g);
      apply(n, mv);
      const v = search(n, depth - 1, alpha, beta, me);
      if (maxing) { if (v > best) best = v; if (v > alpha) alpha = v; } else { if (v < best) best = v; if (v < beta) beta = v; }
      if (beta <= alpha) break;
    }
    return best;
  }
  function ai(g, level) {
    const moves = legalMoves(g);
    if (!moves.length) return null;
    const me = g.turn;
    if (level === 'easy') { // wins a board when it can, otherwise random
      const win = moves.find((mv) => { const n = clone(g); return apply(n, mv); });
      return win || moves[Math.floor(Math.random() * moves.length)];
    }
    const depth = level === 'hard' ? (moves.length > 20 ? 4 : 5) : 3;
    let bestV = -Infinity, pick = [];
    for (const mv of moves) {
      const n = clone(g);
      apply(n, mv);
      const v = search(n, depth - 1, -Infinity, Infinity, me) + Math.random() * 0.01;
      if (v > bestV + 1e-9) { bestV = v; pick = [mv]; } else if (Math.abs(v - bestV) <= 1e-9) pick.push(mv);
    }
    return pick[Math.floor(Math.random() * pick.length)];
  }

  return { newGame, play, view, turnOf, progress, legalMoves, apply, clone, ai, LINES };
});
