/* Tung Tung Mini Golf: courses and physics, shared by the page and by the headless test.
   Coordinates are 900x560. Ball radius 8. Walls are line segments; windmills and gates move with time. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GolfEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const R = 8, CUP_R = 12, MAX_SPEED = 950, MAX_STROKES = 8;
  const rect = (x, y, w, h) => ({ x, y, w, h });
  const box = (x, y, w, h) => ({ t: 'rect', x, y, w, h });
  const bump = (x, y, r) => ({ t: 'circle', x, y, r });
  const wall = (x1, y1, x2, y2) => ({ t: 'wall', x1, y1, x2, y2 });
  const poly = (...p) => p;
  const rectPoly = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  
  const COURSES = {
    meadow: {
      name: 'Meadow Park', blurb: 'Sunny greens with sand, water and a windmill. A friendly start.', theme: { floor: ['#4fae4f', '#46a046'], rail: '#7a4a1f', railHi: '#c58a4a', sky: '#2c6b3a', accent: '#ffd23f' },
      holes: [
        { name: 'The Warm-up', par: 2, tee: [170, 280], cup: [730, 280], poly: poly([100, 200], [800, 200], [800, 360], [100, 360]), obs: [] },
        { name: 'The Dogleg', par: 3, tee: [170, 160], cup: [730, 405], poly: poly([100, 100], [520, 100], [520, 340], [800, 340], [800, 470], [100, 470]), obs: [box(240, 250, 100, 50)] },
        { name: 'Sand Trap', par: 3, tee: [160, 280], cup: [750, 280], poly: poly([100, 160], [800, 160], [800, 400], [100, 400]), obs: [bump(600, 215, 20), bump(600, 345, 20)], sand: [rect(340, 190, 140, 100)] },
        { name: 'The Windmill', par: 3, tee: [160, 280], cup: [760, 280], poly: poly([100, 150], [800, 150], [800, 410], [100, 410]), obs: [], mills: [{ x: 450, y: 280, len: 190, w: 14, speed: 1.7, ph: 0 }] },
        { name: 'Water Hazard', par: 3, tee: [160, 280], cup: [750, 280], poly: poly([100, 120], [800, 120], [800, 440], [100, 440]), obs: [], water: [rect(320, 120, 200, 140), rect(320, 300, 200, 140)] },
        { name: 'Zig-Zag', par: 4, tee: [150, 190], cup: [750, 420], poly: poly([100, 100], [800, 100], [800, 460], [100, 460]), obs: [wall(300, 100, 300, 360), wall(500, 460, 500, 200), wall(660, 100, 660, 340)] },
        { name: 'Bumper Garden', par: 3, tee: [150, 280], cup: [760, 280], poly: rectPoly(100, 130, 800, 430), obs: [bump(320, 225, 22), bump(320, 335, 22), bump(460, 280, 24), bump(600, 225, 22), bump(600, 335, 22)], sand: [rect(200, 240, 70, 80)] },
        { name: 'The Bog', par: 3, tee: [160, 280], cup: [750, 280], poly: rectPoly(100, 150, 800, 410), obs: [bump(640, 355, 20)], mud: [rect(300, 150, 140, 260), rect(520, 150, 120, 130)] },
      ],
    },
    neon: {
      name: 'Neon Arcade', blurb: 'Boost pads, teleporters and moving gates. Faster, trickier, flashier.', theme: { floor: ['#171a3a', '#12152f'], rail: '#e84fd8', railHi: '#4fd8ff', sky: '#0a0c24', accent: '#4fd8ff' },
      holes: [
        { name: 'Launch Pad', par: 2, tee: [150, 280], cup: [770, 280], poly: poly([100, 190], [800, 190], [800, 370], [100, 370]), obs: [bump(660, 280, 16)], boost: [{ x: 240, y: 190, w: 90, h: 180, dx: 1, dy: 0 }] },
        { name: 'Pinball', par: 3, tee: [150, 280], cup: [760, 280], poly: poly([100, 130], [800, 130], [800, 430], [100, 430]), obs: [bump(330, 210, 24), bump(330, 350, 24), bump(450, 280, 26), bump(570, 205, 24), bump(570, 355, 24), bump(690, 280, 18)] },
        { name: 'Teleporter', par: 3, tee: [160, 280], cup: [740, 280], poly: poly([100, 150], [800, 150], [800, 410], [100, 410]), obs: [wall(450, 150, 450, 410)], tele: [{ a: [360, 280], b: [540, 280] }] },
        { name: 'Gate Keeper', par: 3, tee: [150, 280], cup: [760, 280], poly: poly([100, 150], [800, 150], [800, 410], [100, 410]), obs: [], gates: [{ x: 330, y: 150, w: 26, h: 130, ay: 110, per: 3.4, ph: 0 }, { x: 560, y: 280, w: 26, h: 130, ay: 110, per: 3.4, ph: 3 }] },
        { name: 'Double Mill', par: 4, tee: [140, 280], cup: [770, 280], poly: poly([100, 130], [800, 130], [800, 430], [100, 430]), obs: [], mills: [{ x: 330, y: 280, len: 190, w: 14, speed: 1.9, ph: 0 }, { x: 570, y: 280, len: 190, w: 14, speed: -2.2, ph: 1.2 }] },
        { name: 'Grand Finale', par: 4, tee: [150, 170], cup: [750, 420], poly: poly([100, 100], [800, 100], [800, 470], [100, 470]), obs: [wall(280, 100, 280, 360), wall(440, 470, 440, 220), bump(620, 200, 22)], sand: [rect(480, 330, 120, 100)], water: [rect(560, 100, 120, 70)], mills: [{ x: 640, y: 380, len: 140, w: 12, speed: 2.0, ph: 0 }], boost: [{ x: 120, y: 380, w: 130, h: 70, dx: 1, dy: 0 }] },
        { name: 'Conveyor Lab', par: 3, tee: [150, 280], cup: [760, 280], poly: rectPoly(100, 150, 800, 410), obs: [], conv: [{ x: 300, y: 150, w: 100, h: 260, dx: 0, dy: 1, f: 420 }, { x: 520, y: 150, w: 100, h: 260, dx: 0, dy: -1, f: 420 }] },
        { name: 'Boost Maze', par: 4, tee: [150, 170], cup: [750, 420], poly: rectPoly(100, 100, 800, 470), obs: [wall(300, 100, 300, 330), wall(500, 470, 500, 240)], boost: [{ x: 520, y: 330, w: 130, h: 110, dx: 1, dy: 0 }] },
      ],
    },
    frost: {
      name: 'Frosty Peaks', blurb: 'Ice that makes the ball slide for ever, snowdrifts, and belts that push you towards the water.', theme: { floor: ['#dff3ff', '#cfeaf8'], rail: '#4a86c0', railHi: '#e6f6ff', sky: '#1a3a5c', accent: '#8fe3ff' },
      holes: [
        { name: 'Slide Away', par: 2, tee: [150, 280], cup: [750, 280], poly: rectPoly(100, 200, 800, 360), obs: [bump(520, 280, 16)], ice: [rect(100, 200, 700, 160)] },
        { name: 'Ice Dogleg', par: 3, tee: [170, 160], cup: [730, 405], poly: poly([100, 100], [520, 100], [520, 340], [800, 340], [800, 470], [100, 470]), obs: [box(240, 250, 100, 50)], ice: [rect(100, 100, 420, 370), rect(520, 340, 280, 130)] },
        { name: 'Frozen Pond', par: 3, tee: [160, 280], cup: [750, 280], poly: rectPoly(100, 120, 800, 440), obs: [], water: [rect(340, 200, 180, 130)], ice: [rect(300, 120, 260, 320)] },
        { name: 'Slalom', par: 4, tee: [150, 190], cup: [750, 420], poly: rectPoly(100, 100, 800, 460), obs: [wall(280, 100, 280, 330), wall(430, 460, 430, 230), wall(580, 100, 580, 330)], ice: [rect(100, 100, 700, 360)] },
        { name: 'Snowdrift', par: 3, tee: [150, 280], cup: [760, 280], poly: rectPoly(100, 140, 800, 420), obs: [bump(640, 345, 20)], mud: [rect(280, 140, 100, 280), rect(480, 140, 100, 160)] },
        { name: 'Cliff Conveyor', par: 3, tee: [150, 280], cup: [760, 280], poly: rectPoly(100, 150, 800, 410), obs: [], conv: [{ x: 380, y: 150, w: 110, h: 260, dx: 0, dy: 1, f: 420 }], water: [rect(380, 380, 110, 30)] },
        { name: 'Gate Crash', par: 4, tee: [140, 280], cup: [770, 280], poly: rectPoly(100, 130, 800, 430), obs: [], ice: [rect(100, 130, 700, 300)], gates: [{ x: 300, y: 150, w: 26, h: 130, ay: 110, per: 3.6, ph: 0 }, { x: 540, y: 280, w: 26, h: 130, ay: 110, per: 3.6, ph: 2.4 }] },
        { name: 'The Summit', par: 4, tee: [150, 170], cup: [750, 420], poly: rectPoly(100, 100, 800, 470), obs: [wall(280, 100, 280, 360), wall(440, 470, 440, 220), bump(620, 200, 22)], ice: [rect(100, 100, 350, 370)], mud: [rect(540, 330, 110, 90)], mills: [{ x: 650, y: 380, len: 130, w: 12, speed: 2, ph: 0 }] },
      ],
    },
    desert: {
      name: 'Desert Dunes', blurb: 'Dunes, quicksand, cactus bumpers and teleporting mirages under a hot sun.', theme: { floor: ['#ecce8e', '#e2c27c'], rail: '#8a4a22', railHi: '#f2c883', sky: '#6a3a14', accent: '#ff9a3a' },
      holes: [
        { name: 'Oasis', par: 2, tee: [150, 280], cup: [750, 280], poly: rectPoly(100, 200, 800, 360), obs: [bump(640, 235, 18)], water: [rect(430, 240, 70, 80)], sand: [rect(250, 200, 140, 160)] },
        { name: 'Dune Run', par: 3, tee: [150, 280], cup: [770, 280], poly: rectPoly(100, 150, 800, 410), obs: [bump(395, 280, 16)], sand: [rect(250, 150, 90, 260), rect(450, 150, 90, 260), rect(650, 150, 80, 260)] },
        { name: 'Quicksand', par: 3, tee: [150, 280], cup: [750, 280], poly: rectPoly(100, 140, 800, 420), obs: [wall(570, 140, 570, 290)], mud: [rect(300, 140, 200, 280)] },
        { name: 'Pyramid', par: 4, tee: [150, 285], cup: [750, 285], poly: rectPoly(100, 100, 800, 470), obs: [box(380, 200, 160, 170)], sand: [rect(180, 400, 200, 70)], mills: [{ x: 650, y: 285, len: 160, w: 12, speed: 1.5, ph: 0 }] },
        { name: 'Cactus Patch', par: 3, tee: [150, 280], cup: [770, 280], poly: rectPoly(100, 130, 800, 430), obs: [bump(300, 200, 16), bump(300, 360, 16), bump(400, 280, 16), bump(500, 200, 16), bump(500, 360, 16), bump(600, 280, 16), bump(700, 200, 14), bump(700, 360, 14)], sand: [rect(180, 200, 70, 160)] },
        { name: 'Mirage', par: 3, tee: [150, 280], cup: [750, 280], poly: rectPoly(100, 150, 800, 410), obs: [wall(450, 150, 450, 410)], sand: [rect(640, 230, 110, 100)], tele: [{ a: [340, 230], b: [560, 330] }] },
        { name: 'Sandstorm', par: 4, tee: [140, 280], cup: [770, 280], poly: rectPoly(100, 120, 800, 440), obs: [], sand: [rect(690, 200, 80, 160)], conv: [{ x: 300, y: 120, w: 120, h: 320, dx: 0, dy: 1, f: 380 }, { x: 520, y: 120, w: 120, h: 320, dx: 0, dy: -1, f: 380 }] },
        { name: 'Camel Crossing', par: 4, tee: [140, 280], cup: [770, 280], poly: rectPoly(100, 130, 800, 430), obs: [], sand: [rect(200, 330, 120, 100)], water: [rect(500, 130, 120, 110), rect(500, 320, 120, 110)], gates: [{ x: 360, y: 150, w: 26, h: 140, ay: 110, per: 3.4, ph: 0 }] },
      ],
    },
    candy: {
      name: 'Candy Cove', blurb: 'Lollipop bumpers, sticky syrup, conveyor belts and boost pads. Sweet and chaotic.', theme: { floor: ['#ffb8e0', '#ffa6d4'], rail: '#b84a8c', railHi: '#ffe0f0', sky: '#4a1f50', accent: '#fff06a' },
      holes: [
        { name: 'Sprinkle Start', par: 2, tee: [150, 280], cup: [770, 280], poly: rectPoly(100, 190, 800, 370), obs: [bump(520, 235, 16), bump(520, 325, 16)], boost: [{ x: 230, y: 190, w: 90, h: 180, dx: 1, dy: 0 }] },
        { name: 'Lollipop Lane', par: 3, tee: [150, 280], cup: [770, 280], poly: rectPoly(100, 130, 800, 430), obs: [bump(300, 200, 20), bump(300, 360, 20), bump(430, 280, 24), bump(560, 200, 20), bump(560, 360, 20), bump(690, 280, 16)] },
        { name: 'Syrup Swamp', par: 3, tee: [150, 280], cup: [750, 280], poly: rectPoly(100, 150, 800, 410), obs: [bump(620, 280, 18)], mud: [rect(300, 150, 150, 260)] },
        { name: 'Gumdrop Gates', par: 3, tee: [140, 280], cup: [770, 280], poly: rectPoly(100, 150, 800, 410), obs: [], gates: [{ x: 300, y: 150, w: 26, h: 130, ay: 110, per: 4, ph: 0 }, { x: 480, y: 280, w: 26, h: 130, ay: 110, per: 4, ph: 2.7 }, { x: 650, y: 150, w: 26, h: 130, ay: 110, per: 4, ph: 5.4 }] },
        { name: 'Candy Belts', par: 3, tee: [150, 280], cup: [760, 280], poly: rectPoly(100, 150, 800, 410), obs: [], conv: [{ x: 260, y: 150, w: 100, h: 260, dx: 0, dy: 1, f: 400 }, { x: 400, y: 150, w: 100, h: 260, dx: 0, dy: -1, f: 400 }, { x: 540, y: 150, w: 100, h: 260, dx: 0, dy: 1, f: 400 }] },
        { name: 'Peppermint Mill', par: 3, tee: [150, 280], cup: [760, 280], poly: rectPoly(100, 150, 800, 410), obs: [bump(650, 280, 16)], mills: [{ x: 440, y: 280, len: 220, w: 16, speed: 2.2, ph: 0 }] },
        { name: 'Licorice Maze', par: 4, tee: [150, 160], cup: [750, 420], poly: rectPoly(100, 100, 800, 470), obs: [wall(250, 100, 250, 360), wall(400, 470, 400, 210), wall(550, 100, 550, 360), wall(700, 470, 700, 210)] },
        { name: 'Sugar Rush', par: 4, tee: [140, 280], cup: [770, 280], poly: rectPoly(100, 120, 800, 440), obs: [wall(500, 120, 500, 300), bump(640, 380, 20)], boost: [{ x: 200, y: 120, w: 90, h: 320, dx: 1, dy: 0 }], tele: [{ a: [400, 190], b: [610, 350] }] },
      ],
    },
  };
  const IDS = Object.keys(COURSES);

  function rectSegs(x, y, w, h) { return [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]]; }
  function inPoly(p, x, y) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
  const inRect = (r, x, y, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;

  function create(hole) {
    const stat = [], n = hole.poly.length;
    for (let i = 0; i < n; i++) { const a = hole.poly[i], b = hole.poly[(i + 1) % n]; stat.push([a[0], a[1], b[0], b[1]]); }
    for (const o of hole.obs || []) { if (o.t === 'rect') stat.push(...rectSegs(o.x, o.y, o.w, o.h)); else if (o.t === 'wall') stat.push([o.x1, o.y1, o.x2, o.y2]); }
    return { hole, stat, ball: { x: hole.tee[0], y: hole.tee[1], vx: 0, vy: 0 }, last: { x: hole.tee[0], y: hole.tee[1] }, t: 0, strokes: 0, moving: false, sink: 0, done: false, penalty: 0, teleCd: 0, ev: [],
      picks: (hole.picks || []).map((p) => ({ ...p, got: false })), inv: { power: 0, magnet: 0, ghost: 0, shield: 0 }, act: { power: false, magnet: false, ghost: false } };
  }
  function millSegs(m, t) { // a rotating bar: returns segments with the velocity of the wall at each end
    const a = m.ph + m.speed * t, c = Math.cos(a), s = Math.sin(a), hl = m.len / 2, hw = m.w / 2;
    const pts = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([x, y]) => [m.x + x * c - y * s, m.y + x * s + y * c]);
    return [0, 1, 2, 3].map((i) => ({ s: [pts[i][0], pts[i][1], pts[(i + 1) % 4][0], pts[(i + 1) % 4][1]], mill: m }));
  }
  const gatePos = (g, t) => ({ x: g.x, y: g.y + g.ay * Math.sin((t / g.per) * Math.PI * 2 + g.ph) });
  function gateVel(g, t) { return (g.ay * Math.cos((t / g.per) * Math.PI * 2 + g.ph) * Math.PI * 2) / g.per; }

  function bounce(b, x1, y1, x2, y2, e, wvx, wvy, wx, wy) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
    let u = ((b.x - x1) * dx + (b.y - y1) * dy) / l2; u = Math.max(0, Math.min(1, u));
    const cx = x1 + dx * u, cy = y1 + dy * u; let nx = b.x - cx, ny = b.y - cy, d = Math.hypot(nx, ny);
    if (d >= R) return false;
    if (d < 1e-6) { nx = -dy; ny = dx; d = Math.hypot(nx, ny) || 1; }
    nx /= d; ny /= d; b.x = cx + nx * R; b.y = cy + ny * R;
    let vx = wvx, vy = wvy;
    if (wx !== undefined) { vx = -wy * 0; } // placeholder so the signature stays readable
    const rel = (b.vx - wvx) * nx + (b.vy - wvy) * ny;
    if (rel < 0) { b.vx -= (1 + e) * rel * nx; b.vy -= (1 + e) * rel * ny; return Math.abs(rel); }
    void vx; void vy;
    return 0;
  }

  // Advance one fixed step. Events are pushed on s.ev.
  function step(s, dt) {
    const h = s.hole, b = s.ball; s.t += dt;
    if (s.done) return;
    if (s.sink > 0) { // falling into the cup
      s.sink += dt; const k = Math.min(1, s.sink / 0.35); b.x += (h.cup[0] - b.x) * Math.min(1, dt * 18); b.y += (h.cup[1] - b.y) * Math.min(1, dt * 18); b.vx = b.vy = 0; if (k >= 1) { s.done = true; } return;
    }
    if (!s.moving) return;
    const sp0 = Math.hypot(b.vx, b.vy);
    const sub = Math.max(1, Math.ceil((sp0 * dt) / 3)), hh = dt / sub;
    for (let n = 0; n < sub; n++) {
      b.x += b.vx * hh; b.y += b.vy * hh;
      let inSand = false;
      for (const r of h.sand || []) if (inRect(r, b.x, b.y)) inSand = true;
      for (const bo of h.boost || []) if (inRect(bo, b.x, b.y)) { b.vx += bo.dx * 1500 * hh; b.vy += bo.dy * 1500 * hh; s.ev.push(['boost']); }
      let inIce = false, inMud = false, onConv = false;
      for (const r of h.ice || []) if (inRect(r, b.x, b.y)) inIce = true;
      for (const r of h.mud || []) if (inRect(r, b.x, b.y)) inMud = true;
      for (const cv of h.conv || []) if (inRect(cv, b.x, b.y)) { b.vx += cv.dx * cv.f * hh; b.vy += cv.dy * cv.f * hh; onConv = true; }
      s.onConv = onConv;
      for (const pk of s.picks) if (!pk.got && Math.hypot(b.x - pk.x, b.y - pk.y) < 17) { pk.got = true; s.inv[pk.type] = Math.min(2, s.inv[pk.type] + 1); s.ev.push(['pick', pk.type, pk.x, pk.y]); }
      const k = inMud ? 6.5 : inSand ? 4.2 : inIce ? 0.28 : 1.1, c = inMud ? 160 : inSand ? 90 : inIce ? 12 : 38;
      let sp = Math.hypot(b.vx, b.vy); if (sp > 1) { const ns = Math.max(0, sp * (1 - k * hh) - c * hh); b.vx *= ns / sp; b.vy *= ns / sp; }
      for (const sg of s.stat) { const r = bounce(b, sg[0], sg[1], sg[2], sg[3], 0.82, 0, 0); if (r > 120) s.ev.push(['wall', r]); }
      const ghost = s.act.ghost; // a ghost ball flies through the bumpers and the moving bars
      for (const o of h.obs || []) if (o.t === 'circle' && !ghost) {
        const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy), min = o.r + R;
        if (d < min && d > 0) { const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 2.1 * vn * nx; b.vy -= 2.1 * vn * ny; s.ev.push(['bumper', Math.abs(vn)]); } b.x = o.x + nx * min; b.y = o.y + ny * min; }
      }
      if (!ghost) for (const m of h.mills || []) for (const ms of millSegs(m, s.t)) {
        const cx = b.x - m.x, cy = b.y - m.y; // velocity of the bar at the contact point = omega x r
        const wvx = -m.speed * cy, wvy = m.speed * cx;
        const r = bounce(b, ms.s[0], ms.s[1], ms.s[2], ms.s[3], 0.9, wvx, wvy); if (r > 100) s.ev.push(['wall', r]);
      }
      if (!ghost) for (const g of h.gates || []) { const p = gatePos(g, s.t), v = gateVel(g, s.t); for (const sg of rectSegs(p.x, p.y, g.w, g.h)) { const r = bounce(b, sg[0], sg[1], sg[2], sg[3], 0.85, 0, v); if (r > 100) s.ev.push(['wall', r]); } }
      s.teleCd = Math.max(0, s.teleCd - hh);
      if (s.teleCd <= 0) { outer: for (const tp of h.tele || []) for (const [from, to] of [[tp.a, tp.b], [tp.b, tp.a]]) if (Math.hypot(b.x - from[0], b.y - from[1]) < 16) { b.x = to[0]; b.y = to[1]; s.teleCd = 0.6; s.ev.push(['tele']); break outer; } }
      for (const w of h.water || []) if (inRect(w, b.x, b.y)) {
        if (s.inv.shield > 0) { s.inv.shield--; s.ev.push(['water', 'shield']); } else { s.ev.push(['water']); s.penalty++; s.strokes++; } // a shield saves the penalty stroke
        b.x = s.last.x; b.y = s.last.y; b.vx = b.vy = 0; s.moving = false; s.act = { power: false, magnet: false, ghost: false }; return;
      }
      const dc = Math.hypot(b.x - h.cup[0], b.y - h.cup[1]), spd = Math.hypot(b.vx, b.vy);
      const mag = s.act.magnet; // a magnet shot is pulled in from much further away, and fast putts drop too
      if (dc < CUP_R * (mag ? 1.5 : 1) && spd < (mag ? 760 : 430)) { s.sink = 0.0001; s.moving = false; s.ev.push(['sink']); return; }
      if (dc < CUP_R * (mag ? 8 : 2.4) && spd < (mag ? 700 : 300)) { const pull = mag ? 1300 : 380; b.vx += ((h.cup[0] - b.x) / dc) * pull * hh; b.vy += ((h.cup[1] - b.y) / dc) * pull * hh; } // a gentle pull when it is rolling slowly over the cup
      if (!inPoly(h.poly, b.x, b.y)) { b.x = s.last.x; b.y = s.last.y; b.vx = b.vy = 0; s.moving = false; s.ev.push(['oob']); return; } // safety net, should not happen
    }
    // a ball jammed against a wall at the end of a belt counts as stopped once it has barely moved for a moment
    if (!s.ref || Math.hypot(b.x - s.ref.x, b.y - s.ref.y) > 4) s.ref = { x: b.x, y: b.y, t: s.t };
    const jammed = s.onConv && s.t - s.ref.t > 0.5 && Math.hypot(b.vx, b.vy) < 60;
    s.shotT = (s.shotT || 0) + dt; // no putt may roll for ever (a ball on ice that keeps getting hit by a mill, say)
    if ((Math.hypot(b.vx, b.vy) < 7 && !s.onConv) || jammed || s.shotT > 16) { b.vx = b.vy = 0; s.moving = false; s.last = { x: b.x, y: b.y }; s.act = { power: false, magnet: false, ghost: false }; s.ev.push(['rest']); }
  }
  function shoot(s, angle, power) { // power 0..1
    if (s.moving || s.sink || s.done) return false;
    s.shotT = 0; s.ref = null;
    s.act = { power: s.inv.power > 0, magnet: s.inv.magnet > 0, ghost: s.inv.ghost > 0 }; s.inv.power = s.inv.magnet = s.inv.ghost = 0; // power-ups you are holding go off with this shot
    const sp = Math.max(0.05, Math.min(1, power)) * MAX_SPEED * (s.act.power ? 1.5 : 1);
    s.ball.vx = Math.cos(angle) * sp; s.ball.vy = Math.sin(angle) * sp; s.moving = true; s.strokes++; s.last = { x: s.ball.x, y: s.ball.y };
    return true;
  }
  const label = (strokes, par) => (strokes === 1 ? 'Hole in one!' : { '-3': 'Albatross!', '-2': 'Eagle!', '-1': 'Birdie!', '0': 'Par', '1': 'Bogey', '2': 'Double bogey' }[String(strokes - par)] || (strokes > par ? `+${strokes - par}` : `${strokes - par}`));

  // ---------- every round is different: a seeded shuffle of the course's holes, mirrored and re-timed, with power-ups lying about ----------
  const HOLES_PER_ROUND = 6;
  function hashStr(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rngOf(seed) { let a = hashStr(seed); return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function bbox(h) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of h.poly) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); } return { x0, y0, x1, y1 }; }
  function mirror(h, mx, my) { // flip the hole left-right and/or top-bottom, around the middle of its outline
    const bb = bbox(h), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    const X = (x) => (mx ? 2 * cx - x : x), Y = (y) => (my ? 2 * cy - y : y);
    const pt = (q) => [X(q[0]), Y(q[1])], rc = (r) => ({ ...r, x: mx ? 2 * cx - r.x - r.w : r.x, y: my ? 2 * cy - r.y - r.h : r.y });
    const o = { ...h };
    o.poly = h.poly.map(pt); o.tee = pt(h.tee); o.cup = pt(h.cup);
    o.obs = (h.obs || []).map((b) => (b.t === 'rect' ? { ...rc(b), t: 'rect' } : b.t === 'circle' ? { ...b, x: X(b.x), y: Y(b.y) } : { ...b, x1: X(b.x1), y1: Y(b.y1), x2: X(b.x2), y2: Y(b.y2) }));
    for (const key of ['sand', 'water', 'ice', 'mud']) if (h[key]) o[key] = h[key].map(rc);
    for (const key of ['boost', 'conv']) if (h[key]) o[key] = h[key].map((b) => ({ ...rc(b), dx: mx ? -b.dx : b.dx, dy: my ? -b.dy : b.dy }));
    if (h.tele) o.tele = h.tele.map((t) => ({ a: pt(t.a), b: pt(t.b) }));
    if (h.mills) o.mills = h.mills.map((m) => { let ph = m.ph, speed = m.speed; if (mx) { ph = Math.PI - ph; speed = -speed; } if (my) { ph = -ph; speed = -speed; } return { ...m, x: X(m.x), y: Y(m.y), ph, speed }; });
    if (h.gates) o.gates = h.gates.map((g) => ({ ...g, x: mx ? 2 * cx - g.x - g.w : g.x, y: my ? 2 * cy - g.y - g.h : g.y, ay: my ? -g.ay : g.ay }));
    return o;
  }
  function placePicks(h, r) { // two power-ups on open ground, away from the walls, the tee, the cup and anything that moves
    const st = create(h).stat, bb = bbox(h), out = [];
    const wallDist = (x, y) => { let best = 1e9; for (const sg of st) { const dx = sg[2] - sg[0], dy = sg[3] - sg[1], l2 = dx * dx + dy * dy || 1; let u = ((x - sg[0]) * dx + (y - sg[1]) * dy) / l2; u = Math.max(0, Math.min(1, u)); best = Math.min(best, Math.hypot(x - sg[0] - dx * u, y - sg[1] - dy * u)); } return best; };
    const types = ['power', 'power', 'magnet', 'magnet', 'ghost', 'shield']; const moving = !!((h.mills && h.mills.length) || (h.gates && h.gates.length) || (h.obs || []).some((o) => o.t === 'circle')), wet = !!(h.water && h.water.length);
    for (let tries = 0; tries < 400 && out.length < 2; tries++) {
      const x = bb.x0 + 40 + r() * (bb.x1 - bb.x0 - 80), y = bb.y0 + 40 + r() * (bb.y1 - bb.y0 - 80);
      if (!inPoly(h.poly, x, y) || wallDist(x, y) < 34 || Math.hypot(x - h.tee[0], y - h.tee[1]) < 90 || Math.hypot(x - h.cup[0], y - h.cup[1]) < 80) continue;
      if ((h.water || []).some((w) => inRect(w, x, y, 20)) || (h.conv || []).some((c) => inRect(c, x, y)) || (h.tele || []).some((t) => Math.hypot(x - t.a[0], y - t.a[1]) < 50 || Math.hypot(x - t.b[0], y - t.b[1]) < 50)) continue;
      if ((h.mills || []).some((m) => Math.hypot(x - m.x, y - m.y) < m.len / 2 + 28) || (h.gates || []).some((g) => x > g.x - 40 && x < g.x + g.w + 40) || (h.obs || []).some((o) => o.t === 'circle' && Math.hypot(x - o.x, y - o.y) < o.r + 30)) continue;
      if (out.some((q) => Math.hypot(q.x - x, q.y - y) < 150)) continue;
      let type = types[Math.floor(r() * types.length)];
      if (type === 'ghost' && !moving) type = 'power';
      if (type === 'shield' && !wet) type = 'magnet';
      out.push({ x: Math.round(x), y: Math.round(y), type });
    }
    return out;
  }
  // The six holes of one round. Same course + same seed = the same round (so both players in a match get it), a new seed = a new round.
  function build(courseId, seed) {
    const C = COURSES[courseId] || COURSES.meadow, r = rngOf(courseId + ':' + seed);
    const order = C.holes.map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const chosen = order.slice(0, Math.min(HOLES_PER_ROUND, C.holes.length)).map((i) => C.holes[i]);
    chosen.sort((a, b) => a.par - b.par); // the round builds up: the easy holes come first
    return chosen.map((src) => {
      let h = JSON.parse(JSON.stringify(src));
      h = mirror(h, r() < 0.5, r() < 0.5);
      if (r() < 0.3 && !h.boost && !h.conv && !h.tele) { const t = h.tee; h.tee = h.cup; h.cup = t; h.name += ' (backwards)'; } // play it from the other end
      for (const m of h.mills || []) { m.ph += r() * 6.28; m.speed *= (r() < 0.5 ? -1 : 1) * (0.85 + r() * 0.4); }
      for (const g of h.gates || []) { g.ph += r() * 6.28; g.per *= 0.85 + r() * 0.35; }
      h.picks = placePicks(h, r);
      return h;
    });
  }

  return { R, CUP_R, MAX_SPEED, MAX_STROKES, COURSES, IDS, HOLES_PER_ROUND, create, step, shoot, build, millSegs, gatePos, inPoly, inRect, rectSegs, label };
});
