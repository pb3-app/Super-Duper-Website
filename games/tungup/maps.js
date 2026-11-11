/* Tung Up! maps. Each map is generated from fixed rules and a fixed seed, so it is always the same map.
   Every step is built from the jump physics so the next platform is always reachable.
   World: x runs 0..960, y runs DOWN; the floor top is y = 0 and the goal is at y = -height. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.TungMaps = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const WW = 960;
  // Every Tung now has the same stats, so the jump is the same for all of them (see loadout.js): 800 launch speed = a 139 px jump.
  // Platforms are SOLID (you bump your head on the underside, and the sides stop you): the only ones you can jump up through are 'thin' ones.
  const PHYS = { G: 2300, JUMP: 800, SPEED: 240 };
  const REACH_K = 0.92, MIN_GAP = 24, PLAT_H = 26; // how much of the real jump the generator uses (higher = harder), and the least sideways clearance between a solid platform and the one under it
  const reach = (dy) => { const d = PHYS.JUMP * PHYS.JUMP - 2 * PHYS.G * dy; if (d < 0) return 0; return PHYS.SPEED * ((PHYS.JUMP + Math.sqrt(d)) / PHYS.G) - 28; };

  function rngFor(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const DEFS = {
    junkyard: {
      name: 'Junkyard Rise', blurb: 'The Only Up classic: climb a tower of wrecked cars, fridges and tyres. Look out for swinging scrap.',
      decos: ['car', 'tire', 'fridge', 'crate', 'couch', 'barrel'], sky: ['#e98a5a', '#2a3a5a', '#070b18'], accent: '#ff9d4d',
      plan: [['stairs', 7], ['gap', 2], ['obstacle', 1], ['crumble', 3], ['stairs', 4], ['conv', 3], ['bounce', 1], ['stairs', 3], ['narrow', 4], ['spikes', 2], ['rest'], ['swing', 2], ['stairs', 4], ['gap', 3], ['crumble', 4], ['narrow', 4], ['bounce', 2], ['obstacle', 2], ['conv', 3], ['stairs', 5], ['narrow', 5], ['rest'], ['stairs', 5]],
    },
    construction: {
      name: 'Skyline Construction', blurb: 'Girders, cranes and moving lifts high above the city. Wrecking balls swing across the beams.',
      decos: ['girder', 'crate', 'cone', 'pipe', 'barrel'], sky: ['#9ec7e8', '#4a6a96', '#0a1020'], accent: '#ffd23f',
      plan: [['stairs', 6], ['move', 4], ['swing', 2], ['gap', 3], ['narrow', 3], ['move', 4], ['obstacle', 2], ['rest'], ['stairs', 4], ['spikes', 2], ['swing', 2], ['bounce', 2], ['move', 5], ['narrow', 5], ['gap', 3], ['rest'], ['move', 4], ['swing', 3], ['narrow', 5], ['stairs', 5]],
    },
    frost: {
      name: 'Frostbite Peak', blurb: 'Slippery ice ledges, updraft vents and bouncy snow drifts. Do not stop moving.',
      decos: ['ice', 'snow', 'rock', 'ice'], sky: ['#cfeaff', '#6a8fc0', '#050a1c'], accent: '#7ad3ff',
      plan: [['stairs', 5], ['ice', 6], ['bounce', 1], ['ice', 4], ['fan', 1], ['ice', 5], ['narrow', 4], ['rest'], ['ice', 6], ['bounce', 2], ['crumble', 4], ['fan', 2], ['ice', 6], ['narrow', 5], ['move', 3], ['rest'], ['ice', 6], ['fan', 1], ['narrow', 5]],
    },
    neon: {
      name: 'Neon Night City', blurb: 'Conveyor rooftops, flickering signs and elevator platforms in a city that never sleeps.',
      decos: ['sign', 'screen', 'pipe', 'vent'], sky: ['#ff4fa0', '#321a5e', '#05030f'], accent: '#ff4fd8',
      plan: [['stairs', 5], ['conv', 5], ['move', 4], ['bounce', 1], ['crumble', 4], ['conv', 4], ['narrow', 4], ['rest'], ['move', 5], ['swing', 2], ['spikes', 2], ['conv', 4], ['bounce', 2], ['narrow', 5], ['crumble', 4], ['rest'], ['move', 5], ['conv', 4], ['narrow', 5], ['gap', 3]],
    },
    volcano: {
      name: 'Magma Mountain', blurb: 'Crumbling rock over a sea of fire. Spikes, wrecking boulders and tight jumps.',
      decos: ['rock', 'lava', 'bone', 'rock'], sky: ['#ff6a2a', '#5a1a14', '#0a0306'], accent: '#ff6a2a',
      plan: [['stairs', 4], ['crumble', 6], ['spikes', 3], ['gap', 3], ['swing', 2], ['crumble', 5], ['narrow', 5], ['rest'], ['move', 4], ['spikes', 2], ['crumble', 5], ['bounce', 2], ['narrow', 6], ['swing', 3], ['gap', 3], ['rest'], ['crumble', 6], ['narrow', 6], ['spikes', 2]],
    },
    clouds: {
      name: 'Cloud Kingdom', blurb: 'Tiny clouds, wind vents and long bounces up to the sun. The smallest ledges in the game.',
      decos: ['cloud', 'cloud', 'cloud', 'balloon'], sky: ['#ffe9a8', '#74b4f0', '#1a1a5a'], accent: '#ffffff',
      plan: [['stairs', 4], ['narrow', 6], ['fan', 2], ['bounce', 2], ['narrow', 6], ['move', 4], ['crumble', 4], ['rest'], ['narrow', 7], ['fan', 2], ['bounce', 3], ['move', 5], ['narrow', 7], ['gap', 3], ['rest'], ['fan', 2], ['narrow', 8], ['bounce', 2], ['move', 4]],
    },
  };
  const IDS = Object.keys(DEFS);

  const cache = {};
  function build(id) {
    if (cache[id]) return cache[id];
    const d = DEFS[id]; if (!d) throw new Error('Unknown map ' + id);
    const rnd = rngFor('tungup-map-' + id);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const P = [], Hz = [], Cr = [], chain = [];
    let pid = 0, cid = 0, side = rnd() < 0.5 ? -1 : 1, sinceCrate = 0;
    const floor = { id: pid++, x: 0, y: 0, w: WW, h: 60, kind: 'solid', thin: false, deco: 'ground', move: null, dirc: 0 };
    P.push(floor);
    let c = { x: WW / 2, y: 0, w: 220, ax: 0, thin: false };

    // place the next platform above the last one; the gap is limited by the jump physics
    function add(o) {
      const dy = o.dy, w = o.w, ax = o.ax || 0;
      let kind = o.kind || 'solid', thin = !!o.thin || (d.thinAll && !o.solid && kind === 'solid');
      const gmax = Math.max(MIN_GAP + 16, reach(dy) * REACH_K - ax - c.ax);
      const maxdx = gmax + (c.w + w) / 2;
      const y = c.y - dy;
      // the platforms just below: no new solid platform may leave you too little head room on them, or hang across the way from one to the next
      const list = P.filter((q) => q.id !== 0 && q.kind !== 'block').slice(-12);
      const spans = list.map((q, i) => {
        const n = list[i + 1], ax = q.move ? q.move.ax : 0, out = { own: { l: q.x - ax - 10, r: q.x + q.w + ax + 10, y: q.y } };
        if (n) { const nax = n.move ? n.move.ax : 0, gl = Math.min(q.x + q.w + ax, n.x + n.w + nax), gr = Math.max(q.x - ax, n.x - nax); if (gr > gl) out.way = { l: gl - 16, r: gr + 16, top: Math.min(q.y, n.y), low: Math.max(q.y, n.y) }; }
        return out;
      });
      const lo = w / 2 + ax + 30, hi = WW - w / 2 - ax - 30;
      let dir = o.dir || side, x = null;
      // A solid platform has to sit BESIDE the one under it (or you would bang your head on it), and must not hang over the take-off edge of the
      // platform two steps down. If there is no room for that, this platform becomes one of the see-through ledges instead.
      const place = (isThin) => {
        const mindx = isThin ? 0 : Math.min(maxdx - 6, (c.w + w) / 2 + MIN_GAP + ax + c.ax);
        const hangs = (px) => !isThin && spans.some((q) => (px + w / 2 > q.own.l && px - w / 2 < q.own.r && y + PLAT_H > q.own.y - 56 && y < q.own.y + 40) || (q.way && px + w / 2 > q.way.l && px - w / 2 < q.way.r && y + PLAT_H > q.way.top - 80 && y < q.way.low + 40));
        const clear = (px) => px >= lo && px <= hi && (isThin || Math.abs(px - c.x) >= mindx - 0.01) && Math.abs(px - c.x) <= maxdx + 0.01;
        const cands = [];
        for (const dd of [dir, -dir]) for (let f = 1; f >= 0; f -= 0.1) { const px = c.x + dd * (mindx + (maxdx - mindx) * Math.max(0, f - (o.small ? 0.3 : 0))); if (clear(px) && !hangs(px)) cands.push({ px, dd }); }
        if (!cands.length) return null;
        const same = cands.filter((q) => q.dd === dir), use = same.length && rnd() < 0.8 ? same : cands; // keep the direction you were going unless something is in the way
        return use[Math.min(use.length - 1, Math.floor(Math.pow(rnd(), 1.6) * use.length))]; // the list starts with the longest jumps
      };
      if (o.dx != null) x = Math.max(lo, Math.min(hi, c.x + o.dx));
      else {
        let q = place(thin);
        if (!q && !thin) { thin = true; if (kind !== 'solid' && kind !== 'bounce') kind = 'solid'; q = place(true); }
        if (!q) q = { px: Math.max(lo, Math.min(hi, c.x + dir * Math.min(maxdx, 120))), dd: dir };
        x = q.px; dir = q.dd;
      }
      const pl = { id: pid++, x: x - w / 2, y, w, h: PLAT_H, kind, thin, deco: o.deco || pick(d.decos), move: o.move || null, dirc: o.dirc || 0 };
      P.push(pl);
      chain.push({ from: { x: c.x, y: c.y, w: c.w, ax: c.ax, thin: c.thin }, to: { x, y, w, ax, thin }, dy });
      c = { x, y, w, ax, thin };
      side = o.run ? dir : -dir; // a run keeps going the same way until the edge of the world; otherwise zig-zag
      if (x < 220) side = 1; if (x > WW - 220) side = -1;
      return pl;
    }
    function crate(pl, force) {
      sinceCrate++;
      if (!force && (sinceCrate < 5 || rnd() < 0.35)) return;
      if (pl.move || pl.kind === 'crumble' || pl.kind === 'bounce') return;
      sinceCrate = 0; Cr.push({ id: cid++, x: pl.x + pl.w / 2, y: pl.y - 30 });
    }
    const dyStd = () => 58 + rnd() * 44;      // lower steps: you travel sideways more than up
    const widthStd = () => 84 + rnd() * 46;   // narrower landings

    const CH = {
      stairs(n) { for (let i = 0; i < n; i++) crate(add({ dy: dyStd(), w: widthStd() })); },
      gap(n) { for (let i = 0; i < n; i++) crate(add({ dy: 10 + rnd() * 34, w: 84 + rnd() * 26, run: true })); add({ dy: 70 + rnd() * 20, w: 120 }); },
      narrow(n) { for (let i = 0; i < n; i++) crate(add({ dy: 62 + rnd() * 40, w: 40 + rnd() * 24 })); },
      crumble(n) { for (let i = 0; i < n; i++) add({ dy: 64 + rnd() * 30, w: 96, kind: 'crumble' }); add({ dy: 80, w: 120 }); },
      conv(n) { const dir = rnd() < 0.5 ? -1 : 1; for (let i = 0; i < n; i++) crate(add({ dy: 66 + rnd() * 30, w: 140 + rnd() * 20, kind: 'conv', dirc: i % 2 ? -dir : dir })); },
      ice(n) { for (let i = 0; i < n; i++) crate(add({ dy: 64 + rnd() * 34, w: 120 + rnd() * 40, kind: 'ice', deco: pick(d.decos) })); },
      move(n) { for (let i = 0; i < n; i++) { const ax = 110 + rnd() * 50, w = 110, x0 = Math.max(w / 2 + ax + 30, Math.min(WW - w / 2 - ax - 30, c.x)); add({ dy: 70 + rnd() * 26, w, ax, move: { ax, ay: 0, per: 3.2 + rnd() * 1.6, ph: rnd() * 6.28 }, dx: x0 - c.x }); } add({ dy: 70, w: 120 }); },
      bounce() { add({ dy: 70, w: 110, kind: 'bounce', deco: 'spring' }); const top = add({ dy: 270, w: 140, dx: (c.x < WW / 2 ? 1 : -1) * (150 + rnd() * 50) }); crate(top, true); },
      // a long run sideways across the whole width, with hardly any climbing
      run(n) { for (let i = 0; i < n; i++) crate(add({ dy: -6 + rnd() * 40, w: 84 + rnd() * 30, run: true })); },
      // the ONE kind of platform you can jump up through (and drop down through with S)
      ledge(n) { for (let i = 0; i < n; i++) crate(add({ dy: 66 + rnd() * 34, w: 120 + rnd() * 40, thin: true, deco: pick(d.decos) })); },
      obstacle(n) { for (let i = 0; i < n; i++) { const pl = add({ dy: 76 + rnd() * 20, w: 270 }); const bx = pl.x + pl.w / 2 - 27 + (rnd() < 0.5 ? -50 : 50); P.push({ id: pid++, x: bx, y: pl.y - 62, w: 54, h: 62, kind: 'block', deco: pick(d.decos), move: null, dirc: 0 }); } },
      spikes(n) { for (let i = 0; i < n; i++) { const pl = add({ dy: 76 + rnd() * 16, w: 230 }); const sx = pl.x + pl.w / 2 - 28 + (rnd() < 0.5 ? -40 : 40); Hz.push({ kind: 'spike', x: sx, y: pl.y - 18, w: 56, h: 18 }); } },
      swing(n) { for (let i = 0; i < n; i++) { const pl = add({ dy: 78 + rnd() * 20, w: 280 }); Hz.push({ kind: 'swing', px: pl.x + pl.w / 2, py: pl.y - 232, len: 205, amp: 0.85 + rnd() * 0.2, per: 2.4 + rnd() * 0.8, ph: rnd() * 6.28, r: 24 }); crate(pl); } },
      fan() { const pl = add({ dy: 76, w: 140 }); Hz.push({ kind: 'fan', x: pl.x + pl.w / 2 - 55, y: pl.y - 330, w: 110, h: 330, force: 3500 }); const top = add({ dy: 335, w: 140, dx: (c.x < WW / 2 ? 1 : -1) * (150 + rnd() * 40) }); crate(top, true); },
      rest() { const pl = add({ dy: 80, w: 400, deco: 'rest' }); Cr.push({ id: cid++, x: pl.x + 110, y: pl.y - 30 }); Cr.push({ id: cid++, x: pl.x + pl.w - 110, y: pl.y - 30 }); sinceCrate = 0; },
    };
    // every map gets long sideways runs after each rest and every few chunks, and a couple of the one see-through kind of ledge
    const plan = [];
    d.plan.forEach((st, i) => { plan.push(st); if (st[0] === 'rest' || (i % 4 === 3)) plan.push(['run', 3 + (i % 3)]); if (i % 9 === 6) plan.push(['ledge', 2]); });
    for (const [name, n] of plan) CH[name](n || 1);
    const goal = add({ dy: 90, w: 520, deco: 'goal' });
    const height = -goal.y;
    const map = { id, name: d.name, blurb: d.blurb, theme: { sky: d.sky, accent: d.accent, decos: d.decos }, W: WW, platforms: P, hazards: Hz, crates: Cr, goal: { x: goal.x, y: goal.y, w: goal.w }, height, chain, spawn: { x: WW / 2, y: 0 } };
    cache[id] = map;
    return map;
  }

  // position of a (possibly moving) platform at time t (seconds)
  function platPos(p, t) {
    if (!p.move) return { x: p.x, y: p.y };
    const s = Math.sin((t / p.move.per) * Math.PI * 2 + p.move.ph);
    return { x: p.x + p.move.ax * s, y: p.y + p.move.ay * s };
  }
  function swingPos(h, t) { // ball centre
    const a = h.amp * Math.sin((t / h.per) * Math.PI * 2 + h.ph);
    return { x: h.px + Math.sin(a) * h.len, y: h.py + Math.cos(a) * h.len, a };
  }

  return { IDS, DEFS, WW, PHYS, reach, build, platPos, swingPos };
});
