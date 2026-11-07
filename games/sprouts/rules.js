/*
 * Sprouts rules, shared by the browser (solo + UI) and the server (authoritative multiplayer).
 *
 * State: { dots:[{x,y,deg}], edges:[{a,b,pts}], misere, moves }
 * Move:  { from, to, path:[[x,y],...] }  - freehand polyline from dot `from` to dot `to`.
 * The new dot is always placed at the middle (by length) of the new line. Where on the
 * line it goes doesn't change the game, so this is equivalent to letting the player pick.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SproutsRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const W = 640, H = 420, R = 7;     // board size, dot radius
  const CELL = 4;                    // raster cell for the "any legal move left?" search
  const MAX_PTS = 400;
  const DOT_CLEAR = R + 8;   // lines keep this far from other dots
  const LINE_CLEAR = 18;     // lines keep this far from other lines
  const DOT_GAP = 24;        // new dots keep this far from every dot
  const DOT_LINE_GAP = 20;   // new dots keep this far from every line
  const END_ZONE = 30;       // clearances are relaxed near the line's own end dots
  const EPS = 1e-4;
  const round1 = (v) => Math.round(v * 10) / 10;

  function newGame(n, misere) {
    n = Math.max(2, Math.min(6, Math.floor(n) || 3));
    const dots = [];
    for (let i = 0; i < n; i++) {
      const ang = (2 * Math.PI * i) / n + 0.5;
      dots.push({ x: round1(W / 2 + 190 * Math.cos(ang)), y: round1(H / 2 + 125 * Math.sin(ang)), deg: 0 });
    }
    return { dots, edges: [], misere: !!misere, moves: 0 };
  }

  const clone = (s) => JSON.parse(JSON.stringify(s));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function pathLen(p) { let l = 0; for (let i = 1; i < p.length; i++) l += dist(p[i - 1], p[i]); return l; }

  // Intersection of segments pq: null | [x,y] | 'overlap'
  function segInt(p, p2, q, q2) {
    const rx = p2[0] - p[0], ry = p2[1] - p[1], sx = q2[0] - q[0], sy = q2[1] - q[1];
    const d = rx * sy - ry * sx;
    const qpx = q[0] - p[0], qpy = q[1] - p[1];
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(qpx * ry - qpy * rx) > 1e-6) return null;
      const rr = rx * rx + ry * ry;
      if (rr === 0) return null;
      let t0 = (qpx * rx + qpy * ry) / rr, t1 = t0 + (sx * rx + sy * ry) / rr;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      const lo = Math.max(0, t0), hi = Math.min(1, t1);
      if (hi < lo - 1e-9) return null;
      if (hi - lo > 1e-6) return 'overlap';
      return [p[0] + lo * rx, p[1] + lo * ry];
    }
    const t = (qpx * sy - qpy * sx) / d, u = (qpx * ry - qpy * rx) / d;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    return [p[0] + t * rx, p[1] + t * ry];
  }
  function distPtSeg(pt, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy));
  }

  function pointAtHalf(pts) {
    const half = pathLen(pts) / 2;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = dist(pts[i - 1], pts[i]);
      if (acc + l >= half && l > 0) {
        const t = (half - acc) / l;
        return { idx: i, pt: [round1(pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0])), round1(pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]))] };
      }
      acc += l;
    }
    return { idx: pts.length - 1, pt: pts[pts.length - 1] };
  }

  // Choose where on the new line the new dot goes: nearest the middle with clear space around it.
  function findDotSpot(s, pts, cum, total) {
    const n = pts.length - 1;
    const at = (d) => {
      let i = 1;
      while (i < n && cum[i] < d) i++;
      const l = cum[i] - cum[i - 1];
      const t = l ? (d - cum[i - 1]) / l : 0;
      return { idx: i, pt: [round1(pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0])), round1(pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]))] };
    };
    const ok = (c, d) => {
      for (const dot of s.dots) if (dist(c.pt, [dot.x, dot.y]) < DOT_GAP) return false;
      for (const e of s.edges) for (let j = 0; j < e.pts.length - 1; j++) {
        if (distPtSeg(c.pt, e.pts[j], e.pts[j + 1]) < DOT_LINE_GAP) return false;
      }
      // away from far-away parts of its own line (loops, tight bends)
      for (let i = 0; i < n; i++) {
        if (cum[i + 1] > d - 30 && cum[i] < d + 30) continue;
        if (distPtSeg(c.pt, pts[i], pts[i + 1]) < DOT_LINE_GAP) return false;
      }
      return true;
    };
    const mid = total / 2;
    for (let off = 0; off <= total / 2 - 8; off += 4) {
      for (const sgn of off ? [1, -1] : [1]) {
        const d = mid + sgn * off;
        if (d < 8 || d > total - 8) continue;
        const c = at(d);
        if (ok(c, d)) return { idx: c.idx, pt: c.pt };
      }
    }
    return null;
  }

  /** Check a move. Returns {ok:true, v:{from,to,pts,newDot}} or {ok:false, error}. */
  function validate(s, mv) {
    const fail = (error) => ({ ok: false, error });
    if (!mv || !Number.isInteger(mv.from) || !Number.isInteger(mv.to)) return fail('Bad move');
    const a = s.dots[mv.from], b = s.dots[mv.to];
    if (!a || !b) return fail('Bad move');
    const loop = mv.from === mv.to;
    if (loop ? a.deg > 1 : a.deg > 2 || b.deg > 2) return fail(loop ? 'A loop needs a dot with two free spots' : 'That dot is full (3 lines)');
    if (!Array.isArray(mv.path) || mv.path.length < 2 || mv.path.length > MAX_PTS) return fail('Bad line');
    const pts = [];
    for (const p of mv.path) {
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return fail('Bad line');
      if (p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) return fail('Stay inside the board');
      pts.push([round1(p[0]), round1(p[1])]);
    }
    if (dist(pts[0], [a.x, a.y]) > 32 || dist(pts[pts.length - 1], [b.x, b.y]) > 32) return fail('Line must start and end on dots');
    pts[0] = [a.x, a.y];
    pts[pts.length - 1] = [b.x, b.y];
    if (pathLen(pts) < (loop ? 90 : 36)) return fail(loop ? 'Loop is too small' : 'Line is too short');

    const A = [a.x, a.y], B = [b.x, b.y];
    const allowed = (pt) => dist(pt, A) < EPS || dist(pt, B) < EPS;
    const n = pts.length - 1; // segments
    // self-crossing
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (j === i + 1) {
          // adjacent segments share a vertex; folding straight back is an overlap
          const r = segInt(pts[i], pts[i + 1], pts[j], pts[j + 1]);
          if (r === 'overlap') return fail('Line can’t cross itself');
          continue;
        }
        const r = segInt(pts[i], pts[i + 1], pts[j], pts[j + 1]);
        if (r === null) continue;
        if (r !== 'overlap' && loop && i === 0 && j === n - 1 && allowed(r)) continue;
        return fail('Line can’t cross itself');
      }
    }
    // crossing existing lines
    for (let i = 0; i < n; i++) {
      for (const e of s.edges) {
        for (let j = 0; j < e.pts.length - 1; j++) {
          const r = segInt(pts[i], pts[i + 1], e.pts[j], e.pts[j + 1]);
          if (r === null) continue;
          if (r !== 'overlap' && allowed(r)) continue;
          return fail('Line can’t cross another line');
        }
      }
    }
    // other dots are barriers; and don't hug your own start/end dot mid-line
    const clear = DOT_CLEAR;
    const total = pathLen(pts);
    const cum = [0];
    for (let i = 0; i < n; i++) cum.push(cum[i] + dist(pts[i], pts[i + 1]));
    for (let k = 0; k < s.dots.length; k++) {
      const d = s.dots[k], D = [d.x, d.y];
      const isEnd = k === mv.from || k === mv.to;
      for (let i = 0; i < n; i++) {
        const segLen = cum[i + 1] - cum[i];
        if (!isEnd) {
          if (distPtSeg(D, pts[i], pts[i + 1]) < clear) return fail('Line can’t pass that close to a dot');
        } else {
          const steps = Math.max(1, Math.ceil(segLen / 3));
          for (let q = 0; q <= steps; q++) {
            const t = q / steps;
            const p = [pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])];
            const fromStart = cum[i] + t * segLen;
            const nearEnd = (k === mv.from && fromStart < END_ZONE) || (k === mv.to && total - fromStart < END_ZONE);
            if (!nearEnd && dist(p, D) < clear) return fail('Line gets too close to a dot');
          }
        }
      }
    }
    // keep some air between the new line and existing lines
    for (let i = 0; i < n; i++) {
      const segLen = cum[i + 1] - cum[i];
      const steps = Math.max(1, Math.ceil(segLen / 3));
      for (let q = 0; q <= steps; q++) {
        const t = q / steps;
        const fromStart = cum[i] + t * segLen;
        if (fromStart < END_ZONE || total - fromStart < END_ZONE) continue;
        const p = [pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])];
        for (const e of s.edges) for (let j = 0; j < e.pts.length - 1; j++) {
          if (distPtSeg(p, e.pts[j], e.pts[j + 1]) < LINE_CLEAR) return fail('Line is too close to another line');
        }
      }
    }
    // the new dot goes on the line, as near the middle as there is room for it
    const spot = findDotSpot(s, pts, cum, total);
    if (!spot) return fail('No room for the new dot on that line. Try a longer line or more open space');
    const h = spot;
    return { ok: true, v: { from: mv.from, to: mv.to, pts, newDot: h.pt, splitIdx: h.idx } };
  }

  function applyValid(s, v) {
    const idx = s.dots.length;
    s.dots.push({ x: v.newDot[0], y: v.newDot[1], deg: 2 });
    const first = v.pts.slice(0, v.splitIdx).concat([v.newDot]);
    const second = [v.newDot].concat(v.pts.slice(v.splitIdx));
    s.edges.push({ a: v.from, b: idx, pts: first, by: v.by || 0 }, { a: idx, b: v.to, pts: second, by: v.by || 0 });
    s.dots[v.from].deg++;
    s.dots[v.to].deg++;
    s.moves++;
  }

  /** Validate and apply. Returns {ok, error, v}. */
  function play(s, mv, by) {
    const r = validate(s, mv);
    if (r.ok) { r.v.by = by || 0; applyValid(s, r.v); }
    return r;
  }

  // ---------- "is there any legal move?" via a raster search ----------
  function buildGrid(s) {
    const cw = Math.ceil(W / CELL), ch = Math.ceil(H / CELL);
    const blocked = new Uint8Array(cw * ch);
    const mark = (x, y, rad) => {
      const r = Math.ceil(rad / CELL);
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const X = cx + dx, Y = cy + dy;
        if (X < 0 || Y < 0 || X >= cw || Y >= ch) continue;
        if (Math.hypot((X + 0.5) * CELL - x, (Y + 0.5) * CELL - y) <= rad) blocked[Y * cw + X] = 1;
      }
    };
    for (let X = 0; X < cw; X++) for (let Y = 0; Y < ch; Y++) {
      if (X < 5 || Y < 5 || X >= cw - 5 || Y >= ch - 5) blocked[Y * cw + X] = 1;
    }
    for (const e of s.edges) {
      for (let i = 0; i < e.pts.length - 1; i++) {
        const p = e.pts[i], q = e.pts[i + 1], l = dist(p, q), steps = Math.max(1, Math.ceil(l / 2));
        for (let t = 0; t <= steps; t++) mark(p[0] + ((q[0] - p[0]) * t) / steps, p[1] + ((q[1] - p[1]) * t) / steps, LINE_CLEAR + 5);
      }
    }
    for (const d of s.dots) mark(d.x, d.y, DOT_CLEAR + 5);
    return { cw, ch, blocked };
  }

  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function label(g) {
    const comp = new Int32Array(g.cw * g.ch).fill(-1);
    let n = 0;
    const q = [];
    for (let i = 0; i < comp.length; i++) {
      if (g.blocked[i] || comp[i] >= 0) continue;
      comp[i] = n; q.length = 0; q.push(i);
      for (let h = 0; h < q.length; h++) {
        const c = q[h], x = c % g.cw, y = (c / g.cw) | 0;
        for (const [dx, dy] of NB) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= g.cw || Y >= g.ch) continue;
          const j = Y * g.cw + X;
          if (!g.blocked[j] && comp[j] < 0) { comp[j] = n; q.push(j); }
        }
      }
      n++;
    }
    return { comp, n };
  }

  // Free cells in a ring around a dot, grouped by region.
  function ports(g, comp, d) {
    const out = new Map();
    for (let a = 0; a < 360; a += 6) {
      for (const rad of [DOT_CLEAR + 5 + 3, DOT_CLEAR + 5 + 6]) {
        const x = d.x + rad * Math.cos((a * Math.PI) / 180), y = d.y + rad * Math.sin((a * Math.PI) / 180);
        const X = Math.floor(x / CELL), Y = Math.floor(y / CELL);
        if (X < 0 || Y < 0 || X >= g.cw || Y >= g.ch) continue;
        const i = Y * g.cw + X;
        if (g.blocked[i]) continue;
        const c = comp[i];
        if (!out.has(c)) out.set(c, []);
        out.get(c).push({ i, a });
      }
    }
    return out;
  }

  function bfs(g, sources, isGoal, extraBlocked) {
    const prev = new Int32Array(g.cw * g.ch).fill(-2);
    const q = [];
    for (const i of sources) { if (!g.blocked[i] && !(extraBlocked && extraBlocked[i])) { prev[i] = -1; q.push(i); } }
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (isGoal(c)) {
        const path = [];
        for (let k = c; k !== -1; k = prev[k]) path.push(k);
        return path.reverse();
      }
      const x = c % g.cw, y = (c / g.cw) | 0;
      for (const [dx, dy] of NB) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= g.cw || Y >= g.ch) continue;
        const j = Y * g.cw + X;
        if (prev[j] === -2 && !g.blocked[j] && !(extraBlocked && extraBlocked[j])) { prev[j] = c; q.push(j); }
      }
    }
    return null;
  }
  const cellPt = (g, i) => [(i % g.cw + 0.5) * CELL, (((i / g.cw) | 0) + 0.5) * CELL];

  function simplify(pts, eps) {
    if (pts.length < 3) return pts;
    let max = 0, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = distPtSeg(pts[i], pts[0], pts[pts.length - 1]);
      if (d > max) { max = d; idx = i; }
    }
    if (max <= eps) return [pts[0], pts[pts.length - 1]];
    return simplify(pts.slice(0, idx + 1), eps).slice(0, -1).concat(simplify(pts.slice(idx), eps));
  }

  /**
   * Candidate legal moves (each fully validated). `limit` caps how many we return.
   * Used for "no moves left?" detection and for the computer player.
   */
  function candidateMoves(s, limit) {
    limit = limit || 40;
    const live = [];
    s.dots.forEach((d, i) => { if (d.deg < 3) live.push(i); });
    if (!live.length) return [];
    const g = buildGrid(s);
    const { comp } = label(g);
    const P = new Map();
    for (const i of live) P.set(i, ports(g, comp, s.dots[i]));
    const out = [];
    const tryPath = (from, to, cells) => {
      let pts = [[s.dots[from].x, s.dots[from].y]].concat(cells.map((c) => cellPt(g, c)), [[s.dots[to].x, s.dots[to].y]]);
      pts = simplify(pts, 2);
      const r = validate(s, { from, to, path: pts });
      if (r.ok) out.push({ from, to, path: r.v.pts });
      return r.ok;
    };
    // two different dots in the same region
    for (let x = 0; x < live.length && out.length < limit; x++) {
      for (let y = x + 1; y < live.length && out.length < limit; y++) {
        const A = live[x], B = live[y];
        for (const [c, pa] of P.get(A)) {
          const pb = P.get(B).get(c);
          if (!pb) continue;
          const goal = new Set(pb.map((p) => p.i));
          const path = bfs(g, pa.map((p) => p.i), (i) => goal.has(i));
          if (path && tryPath(A, B, path)) break;
        }
      }
    }
    // loops (dot with two free spots)
    for (const A of live) {
      if (out.length >= limit) break;
      if (s.dots[A].deg > 1) continue;
      const circ = circleLoops(s, g, comp, A);
      if (circ.length) { out.push(circ[Math.floor(Math.random() * circ.length)]); continue; }
      for (const [c, pa] of P.get(A)) {
        const full = loopCells(s, g, comp, A, c, pa);
        if (full && tryPath(A, A, full)) break;
      }
    }
    return out;
  }

  // Round loops from dot A: one validated loop per region it can fit in, as smooth circles.
  function circleLoops(s, g, comp, A) {
    const a = s.dots[A], out = [], seen = new Set();
    for (const r of [32, 26, 40, 22]) {
      for (let deg = 0; deg < 360; deg += 15) {
        const th = (deg * Math.PI) / 180, N = 32;
        const pts = [];
        for (let k = 0; k <= N; k++) {
          const ph = th + Math.PI + (2 * Math.PI * k) / N;
          pts.push([a.x + r * Math.cos(th) + r * Math.cos(ph), a.y + r * Math.sin(th) + r * Math.sin(ph)]);
        }
        pts[0] = [a.x, a.y]; pts[N] = [a.x, a.y];
        const far = [a.x + 2 * r * Math.cos(th), a.y + 2 * r * Math.sin(th)];
        const X = Math.floor(far[0] / CELL), Y = Math.floor(far[1] / CELL);
        if (X < 0 || Y < 0 || X >= g.cw || Y >= g.ch) continue;
        const c = g.blocked[Y * g.cw + X] ? 'b' + deg : comp[Y * g.cw + X];
        if (seen.has(c)) continue;
        const v = validate(s, { from: A, to: A, path: pts });
        if (v.ok) { seen.add(c); out.push({ from: A, to: A, path: v.v.pts }); }
      }
      if (out.length) break;
    }
    return out;
  }

  // The cells of a loop that leaves dot A into region c and comes back to it.
  function loopCells(s, g, comp, A, c, pa) {
    if (pa.length < 4) return null;
    const start = pa[0];
    // the loop returns to a port about a quarter turn round the dot, so it has some width
    let end = null, best = 1e9;
    for (const p of pa) {
      const d = (((p.a - start.a) % 360) + 360) % 360;
      const score = Math.min(Math.abs(d - 100), Math.abs(d - 260));
      if (score < best) { best = score; end = p; }
    }
    if (!end || best > 40) return null;
    const far = bfs(g, [start.i], (i) => dist(cellPt(g, i), [s.dots[A].x, s.dots[A].y]) > 38 && comp[i] === c);
    if (!far) return null;
    const wp = far[far.length - 1];
    const used = new Uint8Array(g.cw * g.ch);
    for (const cell of far.slice(0, -1)) {
      const x = cell % g.cw, y = (cell / g.cw) | 0;
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < g.cw && Y < g.ch) used[Y * g.cw + X] = 1;
      }
    }
    // open the area round the waypoint so the way back can leave it in another direction
    {
      const wx = wp % g.cw, wy = (wp / g.cw) | 0;
      for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
        const X = wx + dx, Y = wy + dy;
        if (X >= 0 && Y >= 0 && X < g.cw && Y < g.ch) used[Y * g.cw + X] = 0;
      }
    }
    const back = bfs(g, [wp], (i) => i === end.i, used);
    return back ? far.concat(back.slice(1)) : null;
  }

  // ---------- natural-looking curves ----------
  function densify(pts, step) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
    }
    return out;
  }
  function chaikin(pts, rounds) {
    for (let r = 0; r < rounds; r++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }
  // Smooth the grid-routed line: relax it like a taut string, then run a spline through it.
  function relax(pts, passes) {
    let p = pts.map((q) => q.slice());
    for (let k = 0; k < passes; k++) {
      const n = p.map((q) => q.slice());
      for (let i = 1; i < p.length - 1; i++) {
        n[i][0] = (p[i - 1][0] + 2 * p[i][0] + p[i + 1][0]) / 4;
        n[i][1] = (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4;
      }
      p = n;
    }
    return p;
  }
  function resample(pts, step) {
    const total = pathLen(pts), n = Math.max(2, Math.round(total / step));
    const out = [pts[0]];
    let i = 1, acc = 0;
    for (let k = 1; k < n; k++) {
      const target = (total * k) / n;
      while (i < pts.length - 1 && acc + dist(pts[i - 1], pts[i]) < target) { acc += dist(pts[i - 1], pts[i]); i++; }
      const l = dist(pts[i - 1], pts[i]) || 1, t = (target - acc) / l;
      out.push([pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function spline(pts, per) {
    const out = [];
    const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  /** Turn a grid-routed line into a natural, flowing one (kept only if it is still legal). */
  function curve(s, mv) {
    const raw = mv.path;
    if (mv.from === mv.to) return mv; // loops are already round
    const base = densify(simplify(raw, 3), 8);
    const first = base[0], last = base[base.length - 1];
    const chord = dist(first, last) || 1;
    const nx = -(last[1] - first[1]) / chord, ny = (last[0] - first[0]) / chord;
    // how far the routed line already bends away from the straight chord
    let bend = 0;
    for (const q of base) bend = Math.max(bend, Math.abs((q[0] - first[0]) * nx + (q[1] - first[1]) * ny));
    const side = Math.random() < 0.5 ? 1 : -1, wob = Math.random() * 6.28;
    const tries = [[6, 1], [4, 1], [2, 0.5], [3, 0], [1, 0], [8, 0]];
    for (const [passes, bowK] of tries) {
      let pts = base;
      if (bend < 14 && bowK) { // nearly straight: give it a gentle bow
        const A = side * Math.min(34, Math.max(12, chord * 0.16)) * bowK;
        pts = base.map((q, i) => {
          const t = i / (base.length - 1), off = A * Math.sin(Math.PI * t) + 3 * Math.sin(Math.PI * t) * Math.sin(wob + t * 4);
          return [q[0] + nx * off, q[1] + ny * off];
        });
      }
      pts = relax(pts, passes);
      pts = resample(pts, 28);
      pts = spline(pts, 8);
      pts[0] = raw[0]; pts[pts.length - 1] = raw[raw.length - 1];
      pts = simplify(pts, 0.3).map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]);
      const cand = { from: mv.from, to: mv.to, path: pts };
      if (validate(s, cand).ok) return cand;
    }
    return mv;
  }

  /** Every legal line that joins dots A and B (one per region they share), drawn smoothly. */
  function movesFor(s, A, B) {
    const a = s.dots[A], b = s.dots[B];
    if (!a || !b) return [];
    if (A === B ? a.deg > 1 : a.deg > 2 || b.deg > 2) return [];
    const g = buildGrid(s), { comp } = label(g);
    const pa = ports(g, comp, a), out = [];
    const add = (cells) => {
      let pts = [[a.x, a.y]].concat(cells.map((c) => cellPt(g, c)), [[b.x, b.y]]);
      pts = simplify(pts, 2);
      const r = validate(s, { from: A, to: B, path: pts });
      if (r.ok) out.push(curve(s, { from: A, to: B, path: r.v.pts }));
    };
    if (A !== B) {
      const pb = ports(g, comp, b);
      for (const [c, list] of pa) {
        const lb = pb.get(c);
        if (!lb) continue;
        const goal = new Set(lb.map((p) => p.i));
        const path = bfs(g, list.map((p) => p.i), (i) => goal.has(i));
        if (path) add(path);
      }
    } else {
      out.push(...circleLoops(s, g, comp, A));
      if (!out.length) for (const [c, list] of pa) {
        const cells = loopCells(s, g, comp, A, c, list);
        if (cells) add(cells);
      }
    }
    return out;
  }

  function hasMove(s) { return candidateMoves(s, 1).length > 0; }

  return { W, H, R, newGame, clone, validate, applyValid, play, candidateMoves, movesFor, curve, hasMove, simplify, pathLen };
});
