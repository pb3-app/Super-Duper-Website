/* Chess + Crazyhouse rules - shared by the server and the browser.
   Full rules: castling, en passant, promotion, check/checkmate, stalemate, threefold repetition,
   fifty-move rule, insufficient material. Crazyhouse: every piece you capture goes into your hand
   and you may drop it on any empty square later (instead of making a normal move). Captured
   promoted pieces turn back into pawns. White is player 0, black is player 1. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.ChessRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FILES = 'abcdefgh';
  const sqName = (s) => FILES[s & 7] + ((s >> 3) + 1);
  const colorOf = (p) => (p === p.toUpperCase() ? 0 : 1);
  const HAND = ['Q', 'R', 'B', 'N', 'P'];
  const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

  function newGame(opts) {
    const b = new Array(64).fill(null);
    const back = 'RNBQKBNR';
    for (let f = 0; f < 8; f++) { b[f] = back[f]; b[8 + f] = 'P'; b[48 + f] = 'p'; b[56 + f] = back[f].toLowerCase(); }
    const g = {
      variant: opts && opts.variant === 'crazyhouse' ? 'crazyhouse' : 'standard',
      board: b, turn: 0, castle: [true, true, true, true], ep: -1, half: 0, full: 1,
      hand: [{ P: 0, N: 0, B: 0, R: 0, Q: 0 }, { P: 0, N: 0, B: 0, R: 0, Q: 0 }], prom: new Array(64).fill(false),
      hist: {}, over: false, winner: null, reason: null, last: null, check: false, log: [], taken: [[], []],
    };
    g.hist[posKey(g)] = 1;
    return g;
  }
  function clone(g) {
    // hist is shared on purpose: only real (non-quiet) moves touch it, and those are applied to the live game
    return { ...g, board: g.board.slice(), castle: g.castle.slice(), hand: [{ ...g.hand[0] }, { ...g.hand[1] }], prom: g.prom.slice(), taken: [g.taken[0].slice(), g.taken[1].slice()] };
  }
  function posKey(g) {
    return g.board.map((p) => p || '.').join('') + g.turn + g.castle.map((x) => (x ? 1 : 0)).join('') + g.ep +
      (g.variant === 'crazyhouse' ? JSON.stringify(g.hand) + g.prom.map((x) => (x ? 1 : 0)).join('') : '');
  }

  const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KG = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]], ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function attacked(b, sq, by) { // is `sq` attacked by colour `by`?
    const r = sq >> 3, f = sq & 7;
    const pawn = by === 0 ? 'P' : 'p', pr = by === 0 ? r - 1 : r + 1;
    if (pr >= 0 && pr < 8) { if (f > 0 && b[pr * 8 + f - 1] === pawn) return true; if (f < 7 && b[pr * 8 + f + 1] === pawn) return true; }
    const kn = by === 0 ? 'N' : 'n', kg = by === 0 ? 'K' : 'k';
    for (const [dr, df] of KN) { const rr = r + dr, ff = f + df; if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && b[rr * 8 + ff] === kn) return true; }
    for (const [dr, df] of KG) { const rr = r + dr, ff = f + df; if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && b[rr * 8 + ff] === kg) return true; }
    const q = by === 0 ? 'Q' : 'q', rk = by === 0 ? 'R' : 'r', bs = by === 0 ? 'B' : 'b';
    for (const [dr, df] of DIAG) { let rr = r + dr, ff = f + df; while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) { const p = b[rr * 8 + ff]; if (p) { if (p === q || p === bs) return true; break; } rr += dr; ff += df; } }
    for (const [dr, df] of ORTH) { let rr = r + dr, ff = f + df; while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) { const p = b[rr * 8 + ff]; if (p) { if (p === q || p === rk) return true; break; } rr += dr; ff += df; } }
    return false;
  }
  const kingSq = (b, c) => b.indexOf(c === 0 ? 'K' : 'k');
  const inCheck = (g, c = g.turn) => { const k = kingSq(g.board, c); return k >= 0 && attacked(g.board, k, 1 - c); };

  function pseudo(g) {
    const b = g.board, c = g.turn, out = [];
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (!p || colorOf(p) !== c) continue;
      const r = s >> 3, f = s & 7, t = p.toUpperCase();
      if (t === 'P') {
        const dir = c === 0 ? 1 : -1, start = c === 0 ? 1 : 6, last = c === 0 ? 7 : 0;
        const add = (to, extra) => {
          if ((to >> 3) === last) for (const promo of ['Q', 'R', 'B', 'N']) out.push({ from: s, to, promo, ...extra });
          else out.push({ from: s, to, ...extra });
        };
        const r1 = r + dir;
        if (r1 >= 0 && r1 < 8 && !b[r1 * 8 + f]) {
          add(r1 * 8 + f, {});
          if (r === start && !b[(r + 2 * dir) * 8 + f]) out.push({ from: s, to: (r + 2 * dir) * 8 + f, dbl: true });
        }
        for (const df of [-1, 1]) {
          const ff = f + df; if (ff < 0 || ff > 7 || r1 < 0 || r1 > 7) continue;
          const to = r1 * 8 + ff, tp = b[to];
          if (tp && colorOf(tp) !== c) add(to, { cap: true });
          else if (!tp && to === g.ep) out.push({ from: s, to, cap: true, ep: true });
        }
      } else if (t === 'N' || t === 'K') {
        for (const [dr, df] of t === 'N' ? KN : KG) {
          const rr = r + dr, ff = f + df; if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
          const tp = b[rr * 8 + ff];
          if (!tp) out.push({ from: s, to: rr * 8 + ff }); else if (colorOf(tp) !== c) out.push({ from: s, to: rr * 8 + ff, cap: true });
        }
        if (t === 'K') { // castling
          const home = c === 0 ? 4 : 60;
          if (s === home && !attacked(b, s, 1 - c)) {
            const rk = c === 0 ? 'R' : 'r';
            if (g.castle[c * 2] && b[home + 3] === rk && !b[home + 1] && !b[home + 2] && !attacked(b, home + 1, 1 - c) && !attacked(b, home + 2, 1 - c)) out.push({ from: s, to: home + 2, castle: 'K' });
            if (g.castle[c * 2 + 1] && b[home - 4] === rk && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(b, home - 1, 1 - c) && !attacked(b, home - 2, 1 - c)) out.push({ from: s, to: home - 2, castle: 'Q' });
          }
        }
      } else {
        const dirs = t === 'B' ? DIAG : t === 'R' ? ORTH : DIAG.concat(ORTH);
        for (const [dr, df] of dirs) {
          let rr = r + dr, ff = f + df;
          while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
            const tp = b[rr * 8 + ff];
            if (!tp) out.push({ from: s, to: rr * 8 + ff });
            else { if (colorOf(tp) !== c) out.push({ from: s, to: rr * 8 + ff, cap: true }); break; }
            rr += dr; ff += df;
          }
        }
      }
    }
    if (g.variant === 'crazyhouse') {
      for (const t of HAND) {
        if (!g.hand[c][t]) continue;
        for (let s = 0; s < 64; s++) {
          if (b[s]) continue;
          if (t === 'P' && ((s >> 3) === 0 || (s >> 3) === 7)) continue;
          out.push({ drop: t, to: s });
        }
      }
    }
    return out;
  }

  function safeAfter(g, mv) { // does the move leave our own king safe? (done in place on the board)
    const b = g.board, c = g.turn;
    if (mv.drop) {
      b[mv.to] = c === 0 ? mv.drop : mv.drop.toLowerCase();
      const k = kingSq(b, c), ok = !attacked(b, k, 1 - c);
      b[mv.to] = null;
      return ok;
    }
    const mover = b[mv.from], victim = b[mv.to];
    let epSq = -1, epPiece = null;
    b[mv.to] = mv.promo ? (c === 0 ? mv.promo : mv.promo.toLowerCase()) : mover; b[mv.from] = null;
    if (mv.ep) { epSq = mv.to + (c === 0 ? -8 : 8); epPiece = b[epSq]; b[epSq] = null; }
    const k = kingSq(b, c), ok = !attacked(b, k, 1 - c);
    b[mv.from] = mover; b[mv.to] = victim;
    if (mv.ep) b[epSq] = epPiece;
    return ok;
  }
  function legalMoves(g) {
    if (g.over) return [];
    return pseudo(g).filter((mv) => safeAfter(g, mv));
  }

  function sanOf(g, mv, legal) {
    if (mv.drop) return (mv.drop === 'P' ? '' : mv.drop) + '@' + sqName(mv.to);
    if (mv.castle) return mv.castle === 'K' ? 'O-O' : 'O-O-O';
    const p = g.board[mv.from], t = p.toUpperCase();
    let s = '';
    if (t === 'P') { if (mv.cap) s += FILES[mv.from & 7]; }
    else {
      s += t;
      const others = legal.filter((m) => !m.drop && m.to === mv.to && m.from !== mv.from && g.board[m.from] === p);
      if (others.length) {
        if (others.every((m) => (m.from & 7) !== (mv.from & 7))) s += FILES[mv.from & 7];
        else if (others.every((m) => (m.from >> 3) !== (mv.from >> 3))) s += (mv.from >> 3) + 1;
        else s += sqName(mv.from);
      }
    }
    if (mv.cap) s += 'x';
    s += sqName(mv.to);
    if (mv.promo) s += '=' + mv.promo;
    return s;
  }

  function sameSquareColourBishops(b) {
    const bishops = [];
    for (let s = 0; s < 64; s++) if (b[s] && b[s].toUpperCase() === 'B') bishops.push(((s >> 3) + (s & 7)) % 2);
    return bishops.length > 0 && bishops.every((x) => x === bishops[0]);
  }
  function insufficient(g) {
    if (g.variant === 'crazyhouse') return false;
    const pieces = g.board.filter(Boolean).filter((p) => p.toUpperCase() !== 'K');
    if (!pieces.length) return true;
    if (pieces.every((p) => 'NBnb'.includes(p))) {
      if (pieces.length === 1) return true;
      if (pieces.every((p) => p.toUpperCase() === 'B') && sameSquareColourBishops(g.board)) return true;
    }
    return false;
  }

  // Applies a move that is known to be legal. `quiet` skips game-end detection (used while searching).
  function applyMove(g, mv, quiet) {
    const b = g.board, c = g.turn, cz = g.variant === 'crazyhouse';
    let resetHalf = false, took = null;
    g.ep = -1;
    if (mv.drop) {
      b[mv.to] = c === 0 ? mv.drop : mv.drop.toLowerCase();
      g.hand[c][mv.drop]--; g.prom[mv.to] = false; resetHalf = true;
    } else {
      const mover = b[mv.from], t = mover.toUpperCase();
      let victim = b[mv.to];
      let victimSq = mv.to;
      if (mv.ep) { victimSq = mv.to + (c === 0 ? -8 : 8); victim = b[victimSq]; b[victimSq] = null; }
      if (victim) {
        resetHalf = true; took = victim;
        if (cz) { const type = g.prom[victimSq] ? 'P' : victim.toUpperCase(); if (type !== 'K') g.hand[c][type]++; }
        g.taken[c].push(victim.toUpperCase());
        g.prom[victimSq] = false;
      }
      const wasProm = g.prom[mv.from];
      b[mv.to] = mv.promo ? (c === 0 ? mv.promo : mv.promo.toLowerCase()) : mover;
      b[mv.from] = null; g.prom[mv.from] = false;
      g.prom[mv.to] = mv.promo ? true : wasProm;
      if (t === 'P') resetHalf = true;
      if (mv.castle) {
        const home = c === 0 ? 0 : 56;
        if (mv.castle === 'K') { b[home + 5] = b[home + 7]; b[home + 7] = null; } else { b[home + 3] = b[home]; b[home] = null; }
      }
      if (mv.dbl) g.ep = (mv.from + mv.to) / 2;
      // castling rights
      if (t === 'K') { g.castle[c * 2] = false; g.castle[c * 2 + 1] = false; }
      for (const [sq, idx] of [[7, 0], [0, 1], [63, 2], [56, 3]]) if (mv.from === sq || mv.to === sq) g.castle[idx] = false;
    }
    g.half = resetHalf ? 0 : g.half + 1;
    if (c === 1) g.full++;
    g.turn = 1 - c;
    g.last = mv.drop ? { drop: mv.drop, to: mv.to } : { from: mv.from, to: mv.to };
    g.check = inCheck(g);
    if (quiet) return took;
    const key = posKey(g);
    g.hist[key] = (g.hist[key] || 0) + 1;
    const moves = legalMoves(g);
    if (!moves.length) {
      g.over = true;
      if (g.check) { g.winner = c; g.reason = 'checkmate'; } else { g.winner = null; g.reason = 'stalemate'; }
    } else if (g.hist[key] >= 3) { g.over = true; g.winner = null; g.reason = 'repetition'; }
    else if (g.half >= 100) { g.over = true; g.winner = null; g.reason = 'fifty'; }
    else if (insufficient(g)) { g.over = true; g.winner = null; g.reason = 'material'; }
    return took;
  }

  function play(g, move, idx) {
    if (g.over) return { ok: false, error: 'The game is over' };
    if (idx !== g.turn) return { ok: false, error: 'Not your turn' };
    if (!move || typeof move !== 'object') return { ok: false, error: 'Bad move' };
    const legal = legalMoves(g);
    let mv;
    if (move.drop) mv = legal.find((m) => m.drop === move.drop && m.to === Number(move.to));
    else mv = legal.find((m) => !m.drop && m.from === Number(move.from) && m.to === Number(move.to) && (m.promo || null) === (move.promo || null));
    if (!mv && !move.drop && !move.promo) { // pawn reaching the last rank without a chosen piece: queen
      mv = legal.find((m) => !m.drop && m.from === Number(move.from) && m.to === Number(move.to) && m.promo === 'Q');
    }
    if (!mv) return { ok: false, error: 'That move is not legal' };
    const san = sanOf(g, mv, legal);
    const took = applyMove(g, mv, false);
    const suffix = g.over && g.reason === 'checkmate' ? '#' : g.check ? '+' : '';
    g.log = g.log.concat(san + suffix);
    return { ok: true, ev: { from: mv.from, to: mv.to, drop: mv.drop || null, san: san + suffix, took } };
  }

  const view = (g) => { const v = { ...g }; delete v.hist; return v; };
  const turnOf = (g) => (g.over ? -2 : g.turn);
  const progress = (g, idx) => g.taken[idx].length;

  // ----- computer player -----
  const PST_P = [0,0,0,0,0,0,0,0, 5,10,10,-20,-20,10,10,5, 5,-5,-10,0,0,-10,-5,5, 0,0,0,20,20,0,0,0, 5,5,10,25,25,10,5,5, 10,10,20,30,30,20,10,10, 50,50,50,50,50,50,50,50, 0,0,0,0,0,0,0,0];
  const PST_N = [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,5,5,0,-20,-40, -30,5,10,15,15,10,5,-30, -30,0,15,20,20,15,0,-30, -30,5,15,20,20,15,5,-30, -30,0,10,15,15,10,0,-30, -40,-20,0,0,0,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50];
  const PST_C = [0,0,0,0,0,0,0,0, 0,1,2,3,3,2,1,0, 0,2,4,5,5,4,2,0, 0,3,5,7,7,5,3,0, 0,3,5,7,7,5,3,0, 0,2,4,5,5,4,2,0, 0,1,2,3,3,2,1,0, 0,0,0,0,0,0,0,0].map((x) => x * 2);
  function evaluate(g) { // from the side-to-move's point of view
    let s = 0;
    for (let q = 0; q < 64; q++) {
      const p = g.board[q]; if (!p) continue;
      const c = colorOf(p), t = p.toUpperCase();
      const idx = c === 0 ? q : 63 - ((q & 7) + 8 * (7 - (q >> 3))) + 0; // mirror ranks for black
      const m = c === 0 ? q : (7 - (q >> 3)) * 8 + (q & 7);
      void idx;
      let v = VAL[t];
      if (t === 'P') v += PST_P[m]; else if (t === 'N') v += PST_N[m]; else if (t === 'B' || t === 'Q') v += PST_C[m]; else if (t === 'K') v += g.variant === 'crazyhouse' ? 0 : (PST_C[m] > 6 ? -10 : 0);
      s += c === 0 ? v : -v;
    }
    if (g.variant === 'crazyhouse') for (const t of HAND) s += (g.hand[0][t] - g.hand[1][t]) * VAL[t] * 0.75;
    return g.turn === 0 ? s : -s;
  }
  function orderMoves(g, moves) {
    return moves.map((mv) => {
      let sc = 0;
      if (mv.cap) { const v = g.board[mv.to]; sc += 10 * (v ? VAL[v.toUpperCase()] : 100) - VAL[g.board[mv.from].toUpperCase()] / 10; }
      if (mv.promo) sc += VAL[mv.promo];
      if (mv.drop) sc += 20;
      return [sc + Math.random(), mv];
    }).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }
  let deadline = 0, nodes = 0, aborted = false;
  function negamax(g, depth, alpha, beta, ply) {
    if (++nodes % 512 === 0 && Date.now() > deadline) aborted = true;
    if (aborted) return 0;
    let moves = legalMoves(g);
    if (!moves.length) return inCheck(g) ? -100000 + ply : 0;
    if (depth <= 0) {
      let stand = evaluate(g);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      moves = orderMoves(g, moves.filter((m) => m.cap || m.promo)).slice(0, 8);
      if (ply > 8) return stand;
      for (const mv of moves) {
        const n = clone(g); applyMove(n, mv, true);
        const v = -negamax(n, depth - 1, -beta, -alpha, ply + 1);
        if (v >= beta) return v;
        if (v > alpha) alpha = v;
      }
      return alpha;
    }
    if (g.variant === 'crazyhouse' && depth > 1) { // keep the tree small: drops only next to existing pieces
      const near = new Set();
      for (let q = 0; q < 64; q++) if (g.board[q]) for (const [dr, df] of KG) { const r = (q >> 3) + dr, f = (q & 7) + df; if (r >= 0 && r < 8 && f >= 0 && f < 8) near.add(r * 8 + f); }
      moves = moves.filter((m) => !m.drop || near.has(m.to));
    }
    moves = orderMoves(g, moves);
    let best = -Infinity;
    for (const mv of moves) {
      const n = clone(g); applyMove(n, mv, true);
      const v = -negamax(n, depth - 1, -beta, -alpha, ply + 1);
      if (aborted) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  function ai(g, level) {
    const legal = legalMoves(g);
    if (!legal.length) return null;
    const rnd = (a) => a[Math.floor(Math.random() * a.length)];
    const wrap = (mv) => (mv.drop ? { drop: mv.drop, to: mv.to } : { from: mv.from, to: mv.to, promo: mv.promo });
    if (level === 'easy') { // mostly greedy, sometimes careless
      if (Math.random() < 0.25) return wrap(rnd(legal));
      const caps = legal.filter((m) => m.cap || m.promo);
      if (caps.length && Math.random() < 0.8) {
        const sc = (m) => (m.cap && g.board[m.to] ? VAL[g.board[m.to].toUpperCase()] : 100);
        caps.sort((a, b) => sc(b) - sc(a));
        return wrap(caps[0]);
      }
      return wrap(rnd(legal));
    }
    const maxDepth = level === 'hard' ? 4 : 2, budget = level === 'hard' ? 1400 : 500;
    deadline = Date.now() + budget; aborted = false; nodes = 0;
    let best = rnd(legal);
    let ordered = orderMoves(g, legal);
    if (g.variant === 'crazyhouse') { const keep = ordered.filter((m) => !m.drop); const drops = ordered.filter((m) => m.drop).slice(0, 14); ordered = keep.concat(drops); }
    for (let depth = 1; depth <= maxDepth; depth++) {
      let bv = -Infinity, bm = null;
      for (const mv of ordered) {
        const n = clone(g); applyMove(n, mv, true);
        const v = -negamax(n, depth - 1, -Infinity, Infinity, 1);
        if (aborted) break;
        if (v > bv) { bv = v; bm = mv; }
      }
      if (aborted) break;
      if (bm) { best = bm; ordered = [bm].concat(ordered.filter((m) => m !== bm)); }
      if (bv > 90000) break;
    }
    return wrap(best);
  }

  return { newGame, play, view, turnOf, progress, legalMoves, inCheck, clone, ai, sqName, applyMove, HAND, FILES };
});
