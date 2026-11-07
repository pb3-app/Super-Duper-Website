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
    return { hole, stat, ball: { x: hole.tee[0], y: hole.tee[1], vx: 0, vy: 0 }, last: { x: hole.tee[0], y: hole.tee[1] }, t: 0, strokes: 0, moving: false, sink: 0, done: false, penalty: 0, teleCd: 0, ev: [] };
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
      const k = inSand ? 4.2 : 1.1, c = inSand ? 90 : 38;
      let sp = Math.hypot(b.vx, b.vy); if (sp > 1) { const ns = Math.max(0, sp * (1 - k * hh) - c * hh); b.vx *= ns / sp; b.vy *= ns / sp; }
      for (const sg of s.stat) { const r = bounce(b, sg[0], sg[1], sg[2], sg[3], 0.82, 0, 0); if (r > 120) s.ev.push(['wall', r]); }
      for (const o of h.obs || []) if (o.t === 'circle') {
        const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy), min = o.r + R;
        if (d < min && d > 0) { const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 2.1 * vn * nx; b.vy -= 2.1 * vn * ny; s.ev.push(['bumper', Math.abs(vn)]); } b.x = o.x + nx * min; b.y = o.y + ny * min; }
      }
      for (const m of h.mills || []) for (const ms of millSegs(m, s.t)) {
        const cx = b.x - m.x, cy = b.y - m.y; // velocity of the bar at the contact point = omega x r
        const wvx = -m.speed * cy, wvy = m.speed * cx;
        const r = bounce(b, ms.s[0], ms.s[1], ms.s[2], ms.s[3], 0.9, wvx, wvy); if (r > 100) s.ev.push(['wall', r]);
      }
      for (const g of h.gates || []) { const p = gatePos(g, s.t), v = gateVel(g, s.t); for (const sg of rectSegs(p.x, p.y, g.w, g.h)) { const r = bounce(b, sg[0], sg[1], sg[2], sg[3], 0.85, 0, v); if (r > 100) s.ev.push(['wall', r]); } }
      s.teleCd = Math.max(0, s.teleCd - hh);
      if (s.teleCd <= 0) { outer: for (const tp of h.tele || []) for (const [from, to] of [[tp.a, tp.b], [tp.b, tp.a]]) if (Math.hypot(b.x - from[0], b.y - from[1]) < 16) { b.x = to[0]; b.y = to[1]; s.teleCd = 0.6; s.ev.push(['tele']); break outer; } }
      for (const w of h.water || []) if (inRect(w, b.x, b.y)) { s.ev.push(['water']); s.penalty++; s.strokes++; b.x = s.last.x; b.y = s.last.y; b.vx = b.vy = 0; s.moving = false; return; }
      const dc = Math.hypot(b.x - h.cup[0], b.y - h.cup[1]), spd = Math.hypot(b.vx, b.vy);
      if (dc < CUP_R && spd < 430) { s.sink = 0.0001; s.moving = false; s.ev.push(['sink']); return; }
      if (dc < CUP_R * 2.4 && spd < 300) { b.vx += ((h.cup[0] - b.x) / dc) * 380 * hh; b.vy += ((h.cup[1] - b.y) / dc) * 380 * hh; } // a gentle pull when it is rolling slowly over the cup
      if (!inPoly(h.poly, b.x, b.y)) { b.x = s.last.x; b.y = s.last.y; b.vx = b.vy = 0; s.moving = false; s.ev.push(['oob']); return; } // safety net, should not happen
    }
    if (Math.hypot(b.vx, b.vy) < 7) { b.vx = b.vy = 0; s.moving = false; s.last = { x: b.x, y: b.y }; s.ev.push(['rest']); }
  }
  function shoot(s, angle, power) { // power 0..1
    if (s.moving || s.sink || s.done) return false;
    const sp = Math.max(0.05, Math.min(1, power)) * MAX_SPEED;
    s.ball.vx = Math.cos(angle) * sp; s.ball.vy = Math.sin(angle) * sp; s.moving = true; s.strokes++; s.last = { x: s.ball.x, y: s.ball.y };
    return true;
  }
  const label = (strokes, par) => (strokes === 1 ? 'Hole in one!' : { '-3': 'Albatross!', '-2': 'Eagle!', '-1': 'Birdie!', '0': 'Par', '1': 'Bogey', '2': 'Double bogey' }[String(strokes - par)] || (strokes > par ? `+${strokes - par}` : `${strokes - par}`));

  return { R, CUP_R, MAX_SPEED, MAX_STROKES, COURSES, IDS, create, step, shoot, millSegs, gatePos, inPoly, inRect, rectSegs, label };
});
