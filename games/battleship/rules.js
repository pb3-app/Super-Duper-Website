/* Battleship rules - shared by the server and the browser.
   10x10 sea, five ships (5,4,3,3,2). Both players place their fleet in secret, then take turns firing.
   "classic": one shot per turn.  "streak": a hit lets you fire again.  Sink all five ships to win. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Battleship = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const N = 10;
  const FLEET = [5, 4, 3, 3, 2];
  const NAMES = { 5: 'Great Log', 4: 'Big Log', 3: 'Mid Log', 2: 'Small Log' };

  const cellsOf = (s) => { const out = []; for (let i = 0; i < s.len; i++) out.push([s.r + (s.dir === 'v' ? i : 0), s.c + (s.dir === 'h' ? i : 0)]); return out; };

  function validFleet(ships) {
    if (!Array.isArray(ships) || ships.length !== FLEET.length) return null;
    const clean = ships.map((s) => ({ len: Math.floor(Number(s && s.len)), r: Math.floor(Number(s && s.r)), c: Math.floor(Number(s && s.c)), dir: s && s.dir === 'v' ? 'v' : 'h' }));
    const lens = clean.map((s) => s.len).sort((a, b) => b - a);
    if (lens.join() !== FLEET.join()) return null;
    const used = new Set();
    for (const s of clean) {
      for (const [r, c] of cellsOf(s)) {
        if (!(r >= 0 && r < N && c >= 0 && c < N)) return null;
        const k = r * N + c;
        if (used.has(k)) return null;
        used.add(k);
      }
    }
    return clean;
  }
  function randomFleet() {
    for (;;) {
      const ships = [], used = new Set();
      let ok = true;
      for (const len of FLEET) {
        let placed = false;
        for (let t = 0; t < 200 && !placed; t++) {
          const dir = Math.random() < 0.5 ? 'h' : 'v';
          const s = { len, dir, r: Math.floor(Math.random() * (dir === 'v' ? N - len + 1 : N)), c: Math.floor(Math.random() * (dir === 'h' ? N - len + 1 : N)) };
          if (cellsOf(s).every(([r, c]) => !used.has(r * N + c))) { cellsOf(s).forEach(([r, c]) => used.add(r * N + c)); ships.push(s); placed = true; }
        }
        if (!placed) { ok = false; break; }
      }
      if (ok) return ships;
    }
  }

  function newGame(opts) {
    return {
      rule: opts && opts.rule === 'streak' ? 'streak' : 'classic',
      phase: 'place', ships: [null, null], shots: [new Array(N * N).fill(0), new Array(N * N).fill(0)], // shots[i] = what player i fired at the other sea: 0 none, 1 miss, 2 hit
      sunk: [[], []], // sunk[i] = ships of player i that have been sunk
      turn: Math.random() < 0.5 ? 0 : 1, over: false, winner: null, reason: null, last: null,
    };
  }

  function shipAt(g, owner, r, c) {
    return g.ships[owner].find((s) => cellsOf(s).some(([a, b]) => a === r && b === c));
  }

  function play(g, move, idx) {
    if (g.over) return { ok: false, error: 'The game is over' };
    if (move && move.t === 'place') {
      if (g.phase !== 'place') return { ok: false, error: 'Ships are already placed' };
      if (g.ships[idx]) return { ok: false, error: 'You already placed your fleet' };
      const fleet = validFleet(move.ships);
      if (!fleet) return { ok: false, error: 'That fleet is not valid' };
      g.ships[idx] = fleet;
      if (g.ships[0] && g.ships[1]) g.phase = 'fire';
      return { ok: true, ev: { placed: idx, start: g.phase === 'fire' } };
    }
    if (g.phase !== 'fire') return { ok: false, error: 'Wait for both fleets to be ready' };
    if (idx !== g.turn) return { ok: false, error: 'Not your turn' };
    const r = Math.floor(Number(move && move.r)), c = Math.floor(Number(move && move.c));
    if (!(r >= 0 && r < N && c >= 0 && c < N)) return { ok: false, error: 'Bad shot' };
    if (g.shots[idx][r * N + c]) return { ok: false, error: 'You already fired there' };
    const foe = 1 - idx;
    const ship = shipAt(g, foe, r, c);
    let res = 'miss';
    if (ship) {
      g.shots[idx][r * N + c] = 2;
      res = 'hit';
      if (cellsOf(ship).every(([a, b]) => g.shots[idx][a * N + b] === 2)) { g.sunk[foe].push(ship); res = 'sunk'; }
    } else g.shots[idx][r * N + c] = 1;
    g.last = { by: idx, r, c, res };
    if (g.sunk[foe].length === FLEET.length) { g.over = true; g.winner = idx; g.reason = 'fleet'; }
    else if (!(res !== 'miss' && g.rule === 'streak')) g.turn = foe;
    return { ok: true, ev: { by: idx, r, c, res, ship: res === 'sunk' ? ship : null } };
  }

  function view(g, idx) {
    const foe = 1 - idx;
    return {
      rule: g.rule, phase: g.phase, you: idx, turn: g.turn, over: g.over, winner: g.winner, reason: g.reason,
      myShips: g.ships[idx], myPlaced: !!g.ships[idx], foePlaced: !!g.ships[foe],
      fired: g.shots[idx], incoming: g.shots[foe], sunkFoe: g.sunk[foe], sunkMine: g.sunk[idx], last: g.last,
      foeShips: g.over ? g.ships[foe] : null,
    };
  }
  const turnOf = (g) => (g.over ? -2 : g.phase === 'place' ? -1 : g.turn);
  const laggard = (g) => (g.phase === 'place' ? (g.ships[0] && !g.ships[1] ? 1 : !g.ships[0] && g.ships[1] ? 0 : -1) : -1);
  const progress = (g, idx) => g.shots[idx].filter((x) => x === 2).length;

  // ----- computer player -----
  // Counts how many ways the remaining enemy ships could still sit on each square.
  function density(shots, remaining, hits) {
    const dens = new Array(N * N).fill(0);
    for (const len of remaining) {
      for (const dir of ['h', 'v']) {
        for (let r = 0; r < (dir === 'v' ? N - len + 1 : N); r++) {
          for (let c = 0; c < (dir === 'h' ? N - len + 1 : N); c++) {
            const cells = cellsOf({ len, r, c, dir });
            let ok = true, covers = 0;
            for (const [a, b] of cells) { const v = shots[a * N + b]; if (v === 1 || v === 3) { ok = false; break; } if (v === 2) covers++; }
            if (!ok) continue;
            const w = hits && covers ? 1 + covers * 12 : 1;
            for (const [a, b] of cells) if (shots[a * N + b] === 0) dens[a * N + b] += w;
          }
        }
      }
    }
    return dens;
  }
  function ai(g, idx, level) { // returns {r,c} to fire at
    const shots = g.shots[idx].slice();
    const foe = 1 - idx;
    // mark squares of already sunk ships as 3 so they are not treated as open hits
    for (const s of g.sunk[foe]) for (const [a, b] of cellsOf(s)) shots[a * N + b] = 3;
    const free = [];
    for (let i = 0; i < N * N; i++) if (shots[i] === 0) free.push(i);
    const rnd = (a) => a[Math.floor(Math.random() * a.length)];
    const hitCells = []; for (let i = 0; i < N * N; i++) if (shots[i] === 2) hitCells.push(i);
    const pick = (i) => ({ r: Math.floor(i / N), c: i % N });
    if (level === 'easy') {
      if (hitCells.length && Math.random() < 0.7) {
        const adj = [];
        for (const h of hitCells) for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) { const r = Math.floor(h / N) + dr, c = h % N + dc; if (r >= 0 && r < N && c >= 0 && c < N && shots[r * N + c] === 0) adj.push(r * N + c); }
        if (adj.length) return pick(rnd(adj));
      }
      return pick(rnd(free));
    }
    const remaining = FLEET.slice();
    for (const s of g.sunk[foe]) remaining.splice(remaining.indexOf(s.len), 1);
    const dens = density(shots, remaining, hitCells.length > 0);
    let best = -1, picks = [];
    for (const i of free) {
      let d = dens[i];
      if (level === 'medium' && !hitCells.length) d = ((Math.floor(i / N) + i % N) % 2 === 0 ? 2 : 1) * (1 + Math.random());
      if (d > best) { best = d; picks = [i]; } else if (d === best) picks.push(i);
    }
    return pick(rnd(picks));
  }

  return { N, FLEET, NAMES, newGame, play, view, turnOf, laggard, progress, ai, validFleet, randomFleet, cellsOf };
});
