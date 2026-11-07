/* Track library for Tung F1 Racing. Every track is a closed loop built from a wobbly outline,
   smoothed into a dense centre line. Used by the game page; the server only needs the track ids. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.F1Tracks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const GATES = 8; // checkpoints per lap, gate 0 is the start/finish line

  // radius(theta) of the outline plus a stretch; hw = half the road width
  const DEFS = {
    speedway: { name: 'Speedway', blurb: 'A fast, wide oval. Flat out nearly all the way.', hw: 92, ax: 1.18, ay: 0.78, r: (t) => 900 + 50 * Math.sin(3 * t + 0.4), color: '#2a7a3a' },
    chicane: { name: 'Chicane Park', blurb: 'An oval with a run of quick left-right flicks.', hw: 80, ax: 1.2, ay: 0.8, r: (t) => 880 + 70 * Math.sin(8 * t) + 40 * Math.sin(3 * t), color: '#3a7a52' },
    hairpin: { name: 'Hairpin Hill', blurb: 'Two long straights joined by tight hairpins. Brake late!', hw: 66, ax: 1.0, ay: 0.3, r: (t) => 1280 + 60 * Math.sin(3 * t + 1), color: '#6b7a2e', ellipse: true },
    serpent: { name: 'Serpent Run', blurb: 'A three-lobed snake of sweeping curves.', hw: 78, ax: 1.1, ay: 0.95, r: (t) => 760 + 190 * Math.sin(3 * t) + 40 * Math.sin(5 * t + 1), color: '#2f7f6f' },
    circuit: { name: 'Grand Circuit', blurb: 'A proper grand prix mix of fast and slow corners.', hw: 74, ax: 1.4, ay: 0.95, r: (t) => 760 + 140 * Math.sin(2 * t + 0.5) + 150 * Math.sin(3 * t + 1.2) + 80 * Math.sin(5 * t), color: '#3f7a3f' },
    gauntlet: { name: 'The Gauntlet', blurb: 'Narrow and twisty. Only the sharpest survive.', hw: 56, ax: 1.0, ay: 1.0, r: (t) => 700 + 85 * Math.sin(4 * t) + 45 * Math.sin(7 * t + 2) + 28 * Math.sin(9 * t + 0.6), color: '#7a5a2e' },
  };
  const IDS = Object.keys(DEFS);

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return [0, 1].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
  }

  const cache = {};
  function build(id) {
    if (cache[id]) return cache[id];
    const d = DEFS[id];
    if (!d) throw new Error('Unknown track ' + id);
    // control points around the outline (clockwise on screen)
    const K = 72, ctrl = [];
    for (let i = 0; i < K; i++) {
      const th = (i / K) * Math.PI * 2;
      const r = d.ellipse ? (() => { const a = d.r(th), b = a * d.ay; return (a * b) / Math.sqrt((b * Math.cos(th)) ** 2 + (a * Math.sin(th)) ** 2) / 1; })() : d.r(th);
      ctrl.push(d.ellipse ? [r * Math.cos(th), r * Math.sin(th)] : [r * d.ax * Math.cos(th), r * d.ay * Math.sin(th)]);
    }
    // dense resample
    const raw = [];
    for (let i = 0; i < K; i++) {
      const p0 = ctrl[(i - 1 + K) % K], p1 = ctrl[i], p2 = ctrl[(i + 1) % K], p3 = ctrl[(i + 2) % K];
      const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 8));
      for (let s = 0; s < steps; s++) raw.push(catmull(p0, p1, p2, p3, s / steps));
    }
    // even spacing of ~10px
    let len = 0; const cum0 = [0];
    for (let i = 1; i <= raw.length; i++) { const a = raw[i - 1], b = raw[i % raw.length]; len += Math.hypot(b[0] - a[0], b[1] - a[1]); cum0.push(len); }
    const N = Math.round(len / 10), pts = [];
    let j = 0;
    for (let i = 0; i < N; i++) {
      const target = (i / N) * len;
      while (cum0[j + 1] < target) j++;
      const a = raw[j], b = raw[(j + 1) % raw.length], f = (target - cum0[j]) / (cum0[j + 1] - cum0[j] || 1);
      pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    const ds = len / N;
    const tx = [], ty = [], curv = [];
    for (let i = 0; i < N; i++) {
      const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      tx.push(dx / l); ty.push(dy / l);
    }
    for (let i = 0; i < N; i++) { // curvature = change of heading per unit length
      const a = Math.atan2(ty[(i - 3 + N) % N], tx[(i - 3 + N) % N]), b = Math.atan2(ty[(i + 3) % N], tx[(i + 3) % N]);
      let da = b - a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      curv.push(Math.abs(da) / (6 * ds));
    }
    // start line: the straightest stretch on the lower half of the map, so the grid has room
    let start = 0, bestScore = Infinity;
    for (let i = 0; i < N; i++) {
      if (pts[i][1] < 0) continue;
      let m = 0; for (let k = -30; k <= 12; k++) m = Math.max(m, curv[(i + k + N) % N]);
      if (m < bestScore) { bestScore = m; start = i; }
    }
    const rot = (arr) => arr.slice(start).concat(arr.slice(0, start));
    const P = rot(pts), TX = rot(tx), TY = rot(ty), CV = rot(curv);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of P) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const tr = { id, name: d.name, blurb: d.blurb, hw: d.hw, grass: d.color, pts: P, tx: TX, ty: TY, curv: CV, N, ds, L: ds * N, gate: (k) => Math.round((k * N) / GATES) % N, bbox: [minX, minY, maxX, maxY] };
    cache[id] = tr;
    return tr;
  }

  // nearest centre-line sample, searching a window around `hint` (or everywhere when hint is -1).
  // Returns {i, d, side} where d is the distance and side the signed lateral offset (+ = right of travel).
  function nearest(tr, x, y, hint) {
    const N = tr.N;
    let best = -1, bd = Infinity;
    const lo = hint < 0 ? 0 : -60, hi = hint < 0 ? N - 1 : 60;
    for (let k = lo; k <= hi; k++) {
      const i = hint < 0 ? k : (hint + k + N) % N;
      const dx = x - tr.pts[i][0], dy = y - tr.pts[i][1], dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = i; }
    }
    const dx = x - tr.pts[best][0], dy = y - tr.pts[best][1];
    return { i: best, d: Math.sqrt(bd), side: dx * -tr.ty[best] + dy * tr.tx[best] };
  }

  return { IDS, DEFS, GATES, build, nearest };
});
