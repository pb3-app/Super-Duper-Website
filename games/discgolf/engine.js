/* Tung Disc Golf - the courses and the flight of a Triple T ID card. Shared by the page and by node (for testing).
   World: x to the right, y up, z forward (a hole starts at the origin and runs towards +z), all in metres.
   A card is thrown with a yaw (where you point), a power, a bank (hyzer or anhyzer), a launch angle (low / normal / high)
   and a hand (backhand or forehand). Every card has flight numbers like a real disc: speed, glide, turn and fade.
     speed: how hard it has to be thrown (more speed = more distance, but only if you can throw it)
     glide: how long it hangs in the air
     turn:  how much it drifts the "wrong" way while it is fast (a negative number is more turn)
     fade:  how much it hooks back at the end when it slows down
   Backhand turns right then fades left; forehand is the mirror image. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.DiscGolf = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const HOLES = 18, MAX_STROKES = 9, G = 9.81, DT = 1 / 90;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  function rngFrom(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const gauss = (r) => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  function hash2(seed, a, b) { let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(seed, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(seed, x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), fx = smooth(x - xi), fz = smooth(z - zi);
    const a = hash2(seed, xi, zi), b = hash2(seed, xi + 1, zi), c = hash2(seed, xi, zi + 1), d = hash2(seed, xi + 1, zi + 1);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fz) * 2 - 1;
  }

  // ---------- the cards ----------
  const DISCS = [
    { id: 'lite', name: 'Pass-Lite', kind: 'Putter', speed: 2, glide: 3, turn: 0, fade: 1, color: '#7ec8ff', blurb: 'Soft and dead straight. For putting and short touch shots.' },
    { id: 'grip', name: 'Pass-Grip', kind: 'Approach', speed: 3, glide: 4, turn: 0, fade: 2, color: '#ffd23f', blurb: 'Stops fast and fades. For approach shots into the basket.' },
    { id: 'mid', name: 'Pass-Mid', kind: 'Midrange', speed: 5, glide: 5, turn: -1, fade: 1, color: '#7df08f', blurb: 'Straight and easy. Your go-to for 40 to 70 metres.' },
    { id: 'fair', name: 'Pass-Fairway', kind: 'Fairway driver', speed: 7, glide: 5, turn: -1, fade: 2, color: '#ff9a3c', blurb: 'Fast but controllable. Long and straight.' },
    { id: 'drive', name: 'Pass-Driver', kind: 'Driver', speed: 9, glide: 5, turn: -1, fade: 2, color: '#ff6b5b', blurb: 'A hard driver: long, with a gentle fade at the end.' },
    { id: 'max', name: 'Pass-Max', kind: 'Distance driver', speed: 12, glide: 5, turn: -1, fade: 3, color: '#c58bff', blurb: 'The longest card there is. It needs a big throw and fades hard.' },
    { id: 'roll', name: 'Pass-Roll', kind: 'Understable', speed: 7, glide: 5, turn: -3, fade: 1, color: '#5fe0d0', blurb: 'Turns over to the right. Throw it on a hyzer to make it fly straight or S-curve.' },
    { id: 'wall', name: 'Pass-Wall', kind: 'Overstable', speed: 10, glide: 4, turn: 0, fade: 4, color: '#f06292', blurb: 'Fights the wind and always hooks left. Great for curving round trees.' },
  ];
  const DISC_BY_ID = {}; DISCS.forEach((d, i) => { d.n = i; DISC_BY_ID[d.id] = d; });

  // physics constants (calibrated against real-ish distances: a putter about 40 m, a distance driver about 125 m)
  const K = { drag: 0.013594, dragSpeed: 0.0000021, lift: 0.222469, a0: 0.021122, turn: 0.662855, fade: 0.791712, bank: 0.003946, bankLift: 0.345631, pcomp: 0.888204, pcompL: 0.478748, windK: 0.8, v0: 18.094425, v0Speed: 2.061057 };
  const LAUNCH = [0.035, 0.115, 0.2]; // low, normal, high (radians above flat)

  // ---------- the courses ----------
  // each hole: [length, bend (degrees at the corner), fairway width, tree density, pond (0 none, 1 beside, 2 to carry), hills, drop (m down to the basket), sway]
  const COURSES = {
    pines: {
      name: 'Pine Hollow', blurb: 'Tight, tree-lined fairways. Keep it straight and use the trees.', seed: 11, wind: 2.4,
      theme: { sky: ['#8ec5ff', '#dff0ff'], fair: [86, 170, 82], rough: [58, 128, 62], forest: [30, 80, 46], tree: [28, 100, 52], water: [58, 130, 190] },
      names: ['Pinecone', 'Widowmaker', 'The Squeeze', 'Dogleg Left', 'Big Pine', 'Sapling', 'Switchback', 'Needles', 'Over the Creek', 'Stump Alley', 'Hazel Bend', 'Downhill Run', 'The Pond', 'Long Haul', 'Tight Lines', 'Fern Gully', 'Last Bridge', 'Home Stretch'],
      holes: [[72, 0, 15, 1.0, 0, 1.0, -1.5, 4], [118, 26, 16, 1.0, 0, 1.5, 2, 0], [64, 0, 13, 1.1, 0, 0.8, -2.5, -3], [146, -30, 17, 0.9, 1, 1.2, 0, 0], [186, 18, 19, 0.8, 0, 1.6, -4, 0], [78, 0, 14, 1.0, 1, 1.0, 1, 5],
        [130, -22, 16, 1.0, 0, 1.4, 3, 0], [94, 0, 15, 1.1, 0, 1.0, -3, -4], [162, 34, 18, 0.9, 1, 1.5, 0, 0], [70, 0, 13, 1.1, 0, 0.9, 2, 3], [112, -18, 15, 1.0, 0, 1.3, -2, 0], [138, 0, 17, 0.9, 0, 1.2, 3.5, 6],
        [88, 24, 14, 1.0, 1, 1.0, 0, 0], [176, -28, 19, 0.8, 0, 1.6, -3, 0], [66, 0, 12, 1.2, 0, 0.8, 1, -3], [124, 20, 16, 1.0, 0, 1.3, 2, 0], [152, -16, 17, 0.9, 1, 1.4, -2, 0], [98, 0, 15, 1.0, 0, 1.0, 1.5, 4]],
    },
    lakeside: {
      name: 'Lakeside Links', blurb: 'Wide open and long, with water to carry and a breeze off the lake.', seed: 23, wind: 7, lenK: 1.14, widthK: 0.82, parAt: [110, 180],
      theme: { sky: ['#7cc0f0', '#e8f6ff'], fair: [120, 190, 90], rough: [96, 160, 74], forest: [60, 110, 60], tree: [40, 120, 70], water: [52, 140, 210] },
      names: ['Shoreline', 'Carry the Cove', 'Skipping Stone', 'Windward', 'Reed Bed', 'Lighthouse', 'Pebble Beach', 'The Long One', 'Gull Rock', 'Boathouse', 'Cattails', 'Sandbar', 'Island Green', 'Crosswind', 'Dock Shot', 'Sunset Drive', 'Heron', 'Clubhouse'],
      holes: [[92, 0, 28, 0.25, 1, 0.8, 0, 6], [142, -14, 30, 0.2, 2, 1.0, -1, 0], [72, 0, 24, 0.3, 2, 0.6, 1, 0], [186, 22, 32, 0.2, 0, 1.2, 0, 0], [122, 0, 28, 0.25, 1, 0.8, -2, -6], [162, -20, 30, 0.2, 2, 1.0, 1, 0],
        [84, 0, 25, 0.3, 1, 0.7, 0, 4], [198, 16, 34, 0.15, 1, 1.2, -3, 0], [110, 0, 28, 0.25, 0, 0.8, 2, 5], [96, -12, 28, 0.25, 2, 0.9, 0, 0], [152, 0, 30, 0.2, 1, 1.0, -1, -5], [78, 0, 24, 0.3, 1, 0.7, 1.5, 3],
        [174, 28, 32, 0.2, 2, 1.1, 0, 0], [132, 0, 28, 0.25, 0, 0.9, -2, 6], [102, -18, 26, 0.3, 1, 0.9, 0, 0], [190, 0, 34, 0.15, 2, 1.2, -3, -4], [88, 0, 25, 0.3, 1, 0.7, 1, 4], [146, 20, 30, 0.2, 1, 1.0, 0, 0]],
    },
  };
  const IDS = Object.keys(COURSES);
  const CELL = 2.5;
  // surfaces: 0 fairway, 1 rough, 2 forest floor, 3 out of bounds, 4 water, 5 tee pad, 6 green
  const FRICTION = [2.4, 4.2, 7, 6, 99, 2.4, 2.8];

  function pathInfo(h, x, z) { // distance to the fairway centre line, how far along it, and which side
    let best = 1e9, along = 0, side = 1, acc = 0;
    for (let i = 0; i + 1 < h.path.length; i++) {
      const [ax, az] = h.path[i], [bx, bz] = h.path[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, l = Math.sqrt(l2);
      let t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; along = acc + l * t; side = ((x - ax) * dz - (z - az) * dx) > 0 ? 1 : -1; }
      acc += l;
    }
    return { dist: best, along, side };
  }
  function pointAlong(h, s) {
    s = Math.max(0, s); let acc = 0;
    for (let i = 0; i + 1 < h.path.length; i++) {
      const [ax, az] = h.path[i], [bx, bz] = h.path[i + 1], l = Math.hypot(bx - ax, bz - az);
      if (s <= acc + l) { const t = (s - acc) / l; return { x: ax + (bx - ax) * t, z: az + (bz - az) * t }; }
      acc += l;
    }
    const e = h.path[h.path.length - 1]; return { x: e[0], z: e[1] };
  }

  function buildHole(courseId, i) {
    const C = COURSES[courseId], sp = C.holes[i], seed = C.seed * 1000 + i * 131 + 7, rng = rngFrom(seed * 7919 + 3);
    const len = Math.round(sp[0] * (C.lenK || 1)), width = sp[2] * (C.widthK || 1), [, bendDeg, , trees, pond, hill, drop, sway] = sp;
    const pk = C.parAt || [95, 150], par = len <= pk[0] ? 3 : len <= pk[1] ? 4 : 5;
    const L1 = len * (0.46 + rng() * 0.1), L2 = len - L1, rad = bendDeg * Math.PI / 180;
    const mid = [sway, L1], bas = [mid[0] + L2 * Math.sin(rad), mid[1] + L2 * Math.cos(rad)];
    const h = { n: i + 1, name: C.names[i], par, len, path: [[0, 0], mid, bas], width, course: courseId, seed, theme: C.theme };
    h.pathLen = Math.hypot(mid[0], mid[1]) + Math.hypot(bas[0] - mid[0], bas[1] - mid[1]);
    const wr = rng() * Math.PI * 2, ws = rng() * C.wind * (0.3 + 0.7 * rng()); h.wind = { x: Math.cos(wr) * ws, z: Math.sin(wr) * ws, speed: ws };
    // ponds
    h.ponds = [];
    if (pond === 1) { const t = 0.5 + rng() * 0.3, p = pointAlong(h, h.pathLen * t), side = rng() < 0.5 ? -1 : 1, r = 7 + rng() * 6; h.ponds.push({ x: p.x + side * (width / 2 - 1.5 + rng() * 3), z: p.z, r }); }
    if (pond === 2) { const t = 0.3 + rng() * 0.15, p = pointAlong(h, h.pathLen * t), r = 11 + rng() * 7; h.ponds.push({ x: p.x + (rng() - 0.5) * 4, z: p.z, r }); }
    // the ground: a grid of heights round the whole hole
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; const pad = width / 2 + 42;
    for (const [px, pz] of h.path) { x0 = Math.min(x0, px - pad); x1 = Math.max(x1, px + pad); z0 = Math.min(z0, pz - 40); z1 = Math.max(z1, pz + 50); }
    const nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL), hv = new Float32Array((nx + 1) * (nz + 1));
    const trend = (inf) => drop * smooth(inf.along / h.pathLen);
    const raw = (x, z) => (vnoise(seed, x / 38, z / 38) * 0.8 + vnoise(seed + 5, x / 15, z / 15) * 0.35) * hill * 1.7;
    
    for (let j = 0; j <= nz; j++) for (let k = 0; k <= nx; k++) {
      const x = x0 + k * CELL, z = z0 + j * CELL, inf = pathInfo(h, x, z);
      let y = raw(x, z) + trend(inf);
      const dt2 = Math.hypot(x, z), db = Math.hypot(x - bas[0], z - bas[1]);
      y = lerp(y, 0, smooth(1 - dt2 / 11)); // a flat tee pad
      y = lerp(y, drop, smooth(1 - db / 9)); // and a flat green
      hv[j * (nx + 1) + k] = y;
    }
    h.grid = { x0, z0, nx, nz, cell: CELL, h: hv };
    h.tee = { x: 0, z: 0, y: 0 }; h.basket = { x: bas[0], z: bas[1], y: hv[Math.round((bas[1] - z0) / CELL) * (nx + 1) + Math.round((bas[0] - x0) / CELL)] };
    // carve the ponds, set the surfaces
    for (const p of h.ponds) {
      const gy = groundRaw(h.grid, p.x, p.z); p.y = gy - 0.5;
      for (let j = 0; j <= nz; j++) for (let k = 0; k <= nx; k++) { const x = x0 + k * CELL, z = z0 + j * CELL, d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 4) hv[j * (nx + 1) + k] = lerp(hv[j * (nx + 1) + k], p.y - 0.6, smooth((p.r + 3 - d) / 4)); }
    }
    h.basket.y = groundRaw(h.grid, bas[0], bas[1]);
    const surf = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) {
      const x = x0 + (k + 0.5) * CELL, z = z0 + (j + 0.5) * CELL, inf = pathInfo(h, x, z);
      let s = 2; const d = inf.dist;
      if (d <= width / 2) s = 0; else if (d <= width / 2 + 9) s = 1; else if (d > width / 2 + 24) s = 3;
      if (inf.along < -22 || inf.along > h.pathLen + 28) s = 3; else if (s === 3 && d > width / 2 + 24) s = 3;
      if (Math.abs(x) < 2.6 && z > -3.4 && z < 1.6) s = 5;
      if (Math.hypot(x - bas[0], z - bas[1]) < 4.5) s = 6;
      for (const p of h.ponds) if (Math.hypot(x - p.x, z - p.z) < p.r) s = 4;
      surf[j * nx + k] = s;
    }
    h.surf = surf;
    // trees along both sides (and a few guards in the fairway)
    h.trees = [];
    const treeRng = rngFrom(seed * 31 + 17), add = (x, z, big) => {
      if (Math.hypot(x, z) < 9 || Math.hypot(x - bas[0], z - bas[1]) < 6) return;
      for (const p of h.ponds) if (Math.hypot(x - p.x, z - p.z) < p.r + 2) return;
      for (const o of h.trees) if (Math.hypot(o.x - x, o.z - z) < 2.2) return;
      const th = (big ? 12 : 7) + treeRng() * 9;
      h.trees.push({ x, z, y: groundRaw(h.grid, x, z), h: th, rc: 1.8 + th * 0.14 + treeRng() * 0.8, tr: 0.28 + treeRng() * 0.12 });
    };
    for (let s = 0; s < h.pathLen + 20; s += 3.2) {
      const p0 = pointAlong(h, s), p1 = pointAlong(h, s + 1), dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1, nxr = dz / l, nzr = -dx / l;
      for (const side of [-1, 1]) for (const row of [0, 1, 2, 3]) {
        const lat = width / 2 + 1.2 + row * (3 + treeRng() * 4) + treeRng() * 3;
        if (treeRng() < trees * (row === 0 ? 0.85 : row < 3 ? 0.75 : 0.55)) add(p0.x + nxr * side * lat + (treeRng() - 0.5) * 2, p0.z + nzr * side * lat + (treeRng() - 0.5) * 2, row > 0);
      }
      if (s > 28 && s < h.pathLen - 22 && treeRng() < 0.045 * trees) { const lat = (treeRng() - 0.5) * width * 0.6; add(p0.x + nxr * lat, p0.z + nzr * lat, false); }
    }
    h.treeGrid = {};
    for (const t of h.trees) { const key = Math.floor(t.x / 8) + ',' + Math.floor(t.z / 8); (h.treeGrid[key] = h.treeGrid[key] || []).push(t); }
    return h;
  }
  function groundRaw(g, x, z) {
    const fx = (x - g.x0) / g.cell, fz = (z - g.z0) / g.cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return -50;
    const tx = fx - i, tz = fz - j, w = g.nx + 1, a = g.h[j * w + i], b = g.h[j * w + i + 1], c = g.h[(j + 1) * w + i], d = g.h[(j + 1) * w + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }
  const groundAt = (h, x, z) => groundRaw(h.grid, x, z);
  function surfAt(h, x, z) {
    const g = h.grid, i = Math.floor((x - g.x0) / g.cell), j = Math.floor((z - g.z0) / g.cell);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return 3;
    return h.surf[j * g.nx + i];
  }
  const courseCache = {};
  function course(id) {
    if (!COURSES[id]) id = 'pines';
    if (!courseCache[id]) courseCache[id] = { id, name: COURSES[id].name, blurb: COURSES[id].blurb, theme: COURSES[id].theme, holes: COURSES[id].holes.map((_, i) => buildHole(id, i)) };
    return courseCache[id];
  }
  const treesNear = (h, x, z) => { const out = [], ci = Math.floor(x / 8), cj = Math.floor(z / 8); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = h.treeGrid[(ci + a) + ',' + (cj + b)]; if (l) for (const t of l) out.push(t); } return out; };

  // ---------- flight ----------
  // p: { disc, yaw (radians, 0 = straight down the +z axis), power 0..1, bank -1 (anhyzer) .. +1 (hyzer), launch 0|1|2, hand +1 backhand / -1 forehand }
  const discOf = (d) => (typeof d === 'string' ? DISC_BY_ID[d] : typeof d === 'number' ? DISCS[d] : d) || DISCS[2];
  function simulate(h, lie, p, opts) {
    opts = opts || {};
    const disc = discOf(p.disc), hand = p.hand === -1 ? -1 : 1, power = clamp(p.power, 0, 1), bank = clamp(p.bank || 0, -1, 1), launch = clamp(p.launch == null ? 1 : p.launch, 0, 2);
    const wind = opts.noWind ? { x: 0, z: 0 } : { x: h.wind.x * K.windK, z: h.wind.z * K.windK }, rng = opts.rng || Math.random;
    const v0 = power * (K.v0 + K.v0Speed * disc.speed) * (disc.speed <= 3 ? 1.0 : 1);
    const g0 = LAUNCH[launch | 0] + (disc.speed >= 9 ? 0.0 : 0.01) + (1 - power) * K.pcompL, hx = Math.sin(p.yaw), hz = Math.cos(p.yaw);
    const st = { x: lie.x, y: groundAt(h, lie.x, lie.z) + 1.15, z: lie.z, vx: hx * v0 * Math.cos(g0), vy: v0 * Math.sin(g0), vz: hz * v0 * Math.cos(g0), t: 0 };
    const nose = g0 + K.a0 * 0.0; // the card is thrown flat to its own path
    const cd = K.drag - K.dragSpeed * disc.speed, glideF = 0.55 + disc.glide * 0.09;
    const pts = [[st.x, st.y, st.z, 0]], b = h.basket;
    let result = null, bounces = 0, firstImpact = null, hitTree = false, phase = 'air', steps = 0, slideSpeed = 0, sdx = 0, sdz = 0;
    const holeAt = (x, y, z, sp) => { // the chains
      const d = Math.hypot(x - b.x, z - b.z), by = b.y;
      if (y - by < 0.35 || y - by > 1.6) return 0;
      if (d < 0.1) return 2; // the pole: deflects
      if (d > 0.52) return 0;
      const pc = clamp(0.97 - 0.038 * Math.max(0, sp - 6), 0.1, 0.97) * (1 - 0.4 * (d / 0.52) * (d / 0.52));
      return rng() < pc ? 1 : 3;
    };
    while (steps < 3000 && !result) {
      steps++;
      if (phase === 'air') {
        const rx = st.vx - wind.x, rz = st.vz - wind.z, sh = Math.hypot(rx, rz) || 1e-6, s = Math.hypot(sh, st.vy), gam = Math.atan2(st.vy, sh);
        const hxu = rx / sh, hzu = rz / sh, rhx = hzu, rhz = -hxu; // horizontal unit vector and the right-hand side of it
        const ax0 = -cd * s * rx, ay0 = -cd * s * st.vy - G, az0 = -cd * s * rz;
        const shg = Math.hypot(st.vx, st.vz), aoa = K.a0 * (1 + K.pcomp * (1 - power)) + nose - gam + (opts.nose || 0), L = K.lift * glideF * shg * shg * clamp(aoa, -0.25, 0.3) * (1 - K.bankLift * Math.abs(bank));
        const lx = -Math.sin(gam) * hxu * L, ly = Math.cos(gam) * L, lz = -Math.sin(gam) * hzu * L;
        // turn at speed, fade when slow, and the hyzer / anhyzer you chose (positive = the fade side)
        const turnF = clamp((s - 17) / 11, 0, 1.25), fadeF = clamp((21 - s) / 11, 0, 1);
        const A = bank * K.bank * s * s + disc.fade * K.fade * fadeF + disc.turn * K.turn * turnF;
        const side = -hand * A; // + goes to the right
        st.vx += (ax0 + lx + rhx * side) * DT; st.vy += (ay0 + ly) * DT; st.vz += (az0 + lz + rhz * side) * DT;
        st.x += st.vx * DT; st.y += st.vy * DT; st.z += st.vz * DT; st.t += DT;
        // trees
        const tci = Math.floor(st.x / 8), tcj = Math.floor(st.z / 8);
        treeLoop: for (let ta = -1; ta <= 1; ta++) for (let tb = -1; tb <= 1; tb++) { const tl = h.treeGrid[(tci + ta) + ',' + (tcj + tb)]; if (!tl) continue; for (const t of tl) {
          const dxx = st.x - t.x, dzz = st.z - t.z; if (dxx * dxx + dzz * dzz > 30) continue;
          const d = Math.hypot(dxx, dzz), yy = st.y - t.y;
          if (yy < 0 || yy > t.h) continue;
          const r = yy < 2.6 ? t.tr + 0.12 : t.rc * (1 - (yy - 2.6) / (t.h - 2.6)) + 0.1;
          if (d < r) {
            hitTree = true; const k = d < t.tr + 0.2 ? 0.12 : 0.45; // the trunk stops it, the leaves only slow it
            const nxn = (st.x - t.x) / (d || 1), nzn = (st.z - t.z) / (d || 1);
            if (k < 0.2) { const dot = st.vx * nxn + st.vz * nzn; st.vx = (st.vx - 2 * dot * nxn) * k; st.vz = (st.vz - 2 * dot * nzn) * k; st.vy = -Math.abs(st.vy) * 0.3; }
            else { st.vx *= k; st.vz *= k; st.vy = Math.min(st.vy, 0) - 1.5; }
            break treeLoop;
          }
        } }
        // the basket
        const hit = holeAt(st.x, st.y, st.z, Math.hypot(st.vx, st.vz));
        if (hit === 1) { result = { kind: 'holed' }; st.vx = st.vz = 0; pts.push([b.x, b.y + 0.7, b.z, st.t]); break; }
        if (hit === 2 || hit === 3) { st.vx = -st.vx * 0.2 + (rng() - 0.5) * 1.2; st.vz = -st.vz * 0.2 + (rng() - 0.5) * 1.2; st.vy = Math.min(st.vy, 0) - 0.8; st.x += st.vx * 0.05; st.z += st.vz * 0.05; }
        // the ground
        const gy = groundAt(h, st.x, st.z);
        if (gy < -40) { result = { kind: 'ob', why: 'out' }; break; }
        if (st.y <= gy + 0.03) {
          const sf = surfAt(h, st.x, st.z); st.y = gy + 0.03;
          if (sf === 4) { result = { kind: 'ob', why: 'water' }; break; }
          if (!firstImpact) firstImpact = { x: st.x, z: st.z, d: Math.hypot(st.x - lie.x, st.z - lie.z) };
          const sp = Math.hypot(st.vx, st.vz);
          if (bounces < 2 && st.vy < -2.2 && sp > 5) { st.vy = -st.vy * 0.22; st.vx *= 0.7; st.vz *= 0.7; bounces++; }
          else { phase = 'slide'; slideSpeed = sp * 0.55; const l = sp || 1; sdx = st.vx / l; sdz = st.vz / l; }
        }
        if (st.t > 16) { result = { kind: 'rest' }; }
      } else { // sliding to a stop
        const sf = surfAt(h, st.x, st.z), mu = FRICTION[sf];
        const gx = (groundAt(h, st.x + 0.6, st.z) - groundAt(h, st.x - 0.6, st.z)) / 1.2, gz = (groundAt(h, st.x, st.z + 0.6) - groundAt(h, st.x, st.z - 0.6)) / 1.2;
        let vx = sdx * slideSpeed - gx * 1.6 * DT * 9, vz = sdz * slideSpeed - gz * 1.6 * DT * 9; // downhill pulls it
        slideSpeed = Math.max(0, slideSpeed - (mu * slideSpeed * 0.55 + 1.1) * DT);
        const sp = Math.hypot(vx, vz); if (sp > 1e-6) { sdx = vx / sp; sdz = vz / sp; slideSpeed = Math.min(slideSpeed, sp + 0.5); }
        st.x += sdx * slideSpeed * DT; st.z += sdz * slideSpeed * DT; st.y = groundAt(h, st.x, st.z) + 0.03; st.t += DT;
        const sf2 = surfAt(h, st.x, st.z);
        if (sf2 === 4) { result = { kind: 'ob', why: 'water' }; break; }
        for (const t of treesNear(h, st.x, st.z)) if (Math.hypot(st.x - t.x, st.z - t.z) < t.tr + 0.15) { hitTree = true; slideSpeed = 0; }
        if (slideSpeed < 0.12) result = { kind: 'rest' };
      }
      if (steps % 3 === 0) pts.push([st.x, st.y, st.z, st.t]);
    }
    if (!result) result = { kind: 'rest' };
    if (result.kind === 'rest') { const sf = surfAt(h, st.x, st.z); if (sf === 3) result = { kind: 'ob', why: 'out' }; else if (sf === 4) result = { kind: 'ob', why: 'water' }; }
    pts.push([st.x, st.y, st.z, st.t]);
    return { pts, end: { x: st.x, y: st.y, z: st.z }, kind: result.kind, why: result.why, hitTree, carry: firstImpact ? firstImpact.d : 0, dist: Math.hypot(st.x - lie.x, st.z - lie.z), time: st.t, surf: surfAt(h, st.x, st.z) };
  }
  // what actually leaves your hand: a little shaky, more so the harder you throw
  function execute(p, rng) {
    rng = rng || Math.random; const pw = clamp(p.power, 0, 1), putt = discOf(p.disc).speed <= 3 && pw < 0.55;
    return Object.assign({}, p, { yaw: p.yaw + gauss(rng) * ((putt ? 0.4 : 0.8) + 3.8 * pw * pw * pw) * Math.PI / 180, power: clamp(pw * (1 + gauss(rng) * 0.025), 0, 1), bank: clamp((p.bank || 0) + gauss(rng) * 0.035 * (0.4 + pw), -1, 1) });
  }
  const throwCard = (h, lie, p, rng) => simulate(h, lie, execute(p, rng), { rng });
  const predict = (h, lie, p) => simulate(h, lie, p, { rng: () => 0.01 }); // no luck, no wobble

  // ---------- helping the player (and testing the course) ----------
  function remaining(h, x, z) { const inf = pathInfo(h, x, z); return Math.max(0, h.pathLen - inf.along) + inf.dist * 0.35; }
  function guidePoint(h, lie) { // where to look: the basket if you can see it, otherwise down the fairway
    const b = h.basket, d = Math.hypot(b.x - lie.x, b.z - lie.z), inf = pathInfo(h, lie.x, lie.z);
    if (d < 95 && (inf.along > h.path.length * 0 && pathInfo(h, (lie.x + b.x) / 2, (lie.z + b.z) / 2).dist < h.width * 0.6 + 4)) return { x: b.x, z: b.z };
    const q = pointAlong(h, Math.min(h.pathLen, inf.along + 55)); return { x: q.x, z: q.z };
  }
  function score(h, lie, r) {
    const b = h.basket, d = Math.hypot(r.end.x - b.x, r.end.z - b.z);
    if (r.kind === 'holed') return -100;
    const near = Math.hypot(lie.x - b.x, lie.z - b.z) < 30;
    let s = near ? d * 1.2 : remaining(h, r.end.x, r.end.z);
    if (r.kind === 'ob') s += 55 + (near ? 0 : 20);
    if (r.hitTree) s += 5;
    const sf = r.surf; if (sf === 2) s += 6; else if (sf === 1) s += 2;
    if (d < 10 && r.kind === 'rest') s -= 3;
    return s;
  }
  function caddie(h, lie, o) {
    o = o || {}; const b = h.basket, dB = Math.hypot(b.x - lie.x, b.z - lie.z), gp = guidePoint(h, lie), base = Math.atan2(gp.x - lie.x, gp.z - lie.z);
    let best = null; const discs = o.discs || DISCS;
    const fast = !!o.fast;
    const powers = dB < 20 ? (fast ? [0.3, 0.45, 0.6] : [0.18, 0.24, 0.3, 0.36, 0.42, 0.5, 0.58]) : dB < 60 ? (fast ? [0.5, 0.7, 0.9] : [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) : (fast ? [0.7, 0.85, 1] : [0.6, 0.7, 0.8, 0.9, 1]);
    for (const d of discs) { if (fast && ((dB < 25 && d.speed > 5) || (dB > 70 && d.speed < 5))) continue; for (const pw of powers) for (const hand of o.forehand ? [1, -1] : [1]) for (const bank of (fast ? [-0.4, 0, 0.6] : [-0.5, 0, 0.5, 1])) for (const launch of (fast ? [1] : [0, 1])) for (let da = -16; da <= 16; da += (fast ? 4 : 2)) {
      const p = { disc: d.id, yaw: base + da * Math.PI / 180, power: pw, bank, launch, hand };
      const r = predict(h, lie, p), sc = score(h, lie, r) + (d.speed >= 9 && dB < 45 ? 40 : 0) + pw * 0.2;
      if (!best || sc < best.sc) best = { sc, p, r };
    } }
    return best;
  }
  // play a whole hole with the caddie's choices and the usual wobble (for testing)
  function autoHole(h, rng) {
    let lie = { x: 0, z: 0 }, strokes = 0, prev = lie;
    while (strokes < MAX_STROKES) {
      const c = caddie(h, lie, { fast: true }), r = throwCard(h, lie, c.p, rng); strokes++;
      if (r.kind === 'holed') return { strokes };
      if (r.kind === 'ob') { strokes++; continue; }
      lie = { x: r.end.x, z: r.end.z };
    }
    return { strokes: MAX_STROKES };
  }

  return { HOLES, MAX_STROKES, DISCS, DISC_BY_ID, COURSES, IDS, CELL, K, LAUNCH, course, groundAt, surfAt, pathInfo, pointAlong, treesNear, simulate, execute, throwCard, predict, caddie, guidePoint, autoHole, rngFrom, gauss, discOf, FRICTION };
});
