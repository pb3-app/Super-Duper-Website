/* Tung Up! maps. Each map is generated from fixed rules and a fixed seed, so it is always the same map.
   Every step is built from the jump physics so the next platform is always reachable.
   World: x runs 0..960, y runs DOWN; the floor top is y = 0 and the goal is at y = -height. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.TungMaps = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const WW = 960;
  const PHYS = { G: 2300, JUMP: 860, SPEED: 210 }; // slowest Tung speed; reach is computed from it
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
      name: 'Cloud Kingdom', blurb: 'Narrow clouds, wind vents and long bounces up to the sun. The smallest ledges in the game.',
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
    const floor = { id: pid++, x: 0, y: 0, w: WW, h: 60, kind: 'oneway', deco: 'ground', move: null, dirc: 0 };
    P.push(floor);
    let c = { x: WW / 2, y: 0, w: 220, ax: 0 };

    // place the next platform above the last one; the gap is limited by the jump physics
    function add(o) {
      const dy = o.dy, w = o.w, ax = o.ax || 0;
      const gmax = Math.max(24, reach(dy) * 0.86 - ax - c.ax);
      const maxdx = gmax + (c.w + w) / 2;
      let mag = maxdx * (0.35 + rnd() * 0.65);
      if (o.small) mag *= 0.6;
      let dx = (o.dx != null ? o.dx : side * mag);
      dx = Math.max(-maxdx, Math.min(maxdx, dx));
      let x = c.x + dx;
      const lo = w / 2 + 36, hi = WW - w / 2 - 36;
      if (x < lo) { x = lo + Math.min(40, rnd() * 60); }
      if (x > hi) { x = hi - Math.min(40, rnd() * 60); }
      if (Math.abs(x - c.x) > maxdx) x = c.x + Math.sign(x - c.x) * maxdx;
      const y = c.y - dy;
      const pl = { id: pid++, x: x - w / 2, y, w, h: 20, kind: o.kind || 'oneway', deco: o.deco || pick(d.decos), move: o.move || null, dirc: o.dirc || 0 };
      P.push(pl);
      chain.push({ from: { x: c.x, y: c.y, w: c.w, ax: c.ax }, to: { x, y, w, ax }, dy });
      c = { x, y, w, ax };
      side = (rnd() < 0.78 ? -Math.sign(dx || side) : Math.sign(dx || side)) || 1;
      if (x < 200) side = 1; if (x > WW - 200) side = -1;
      return pl;
    }
    function crate(pl, force) {
      sinceCrate++;
      if (!force && (sinceCrate < 5 || rnd() < 0.35)) return;
      if (pl.move || pl.kind === 'crumble' || pl.kind === 'bounce') return;
      sinceCrate = 0; Cr.push({ id: cid++, x: pl.x + pl.w / 2, y: pl.y - 30 });
    }
    const dyStd = () => 82 + rnd() * 42;
    const widthStd = () => 120 + rnd() * 70;

    const CH = {
      stairs(n) { for (let i = 0; i < n; i++) crate(add({ dy: dyStd(), w: widthStd() })); },
      gap(n) { for (let i = 0; i < n; i++) crate(add({ dy: 24 + rnd() * 30, w: 100 + rnd() * 30 })); add({ dy: 80 + rnd() * 20, w: 150 }); },
      narrow(n) { for (let i = 0; i < n; i++) crate(add({ dy: 78 + rnd() * 38, w: 52 + rnd() * 24, small: false })); },
      crumble(n) { for (let i = 0; i < n; i++) add({ dy: 80 + rnd() * 30, w: 118, kind: 'crumble' }); add({ dy: 90, w: 150 }); },
      conv(n) { const dir = rnd() < 0.5 ? -1 : 1; for (let i = 0; i < n; i++) crate(add({ dy: 84 + rnd() * 30, w: 190 + rnd() * 20, kind: 'conv', dirc: i % 2 ? -dir : dir })); },
      ice(n) { for (let i = 0; i < n; i++) crate(add({ dy: 82 + rnd() * 36, w: 160 + rnd() * 50, kind: 'ice', deco: pick(d.decos) })); },
      move(n) { for (let i = 0; i < n; i++) { const ax = 100 + rnd() * 50; add({ dy: 86 + rnd() * 26, w: 128, ax, move: { ax, ay: 0, per: 3.2 + rnd() * 1.6, ph: rnd() * 6.28 }, dx: 0 }); } add({ dy: 84, w: 160 }); },
      bounce() { const pad = add({ dy: 84, w: 120, kind: 'bounce', deco: 'spring' }); void pad; const top = add({ dy: 290, w: 150, dx: (rnd() < 0.5 ? -1 : 1) * (40 + rnd() * 70) }); crate(top, true); },
      obstacle(n) { for (let i = 0; i < n; i++) { const pl = add({ dy: 90 + rnd() * 20, w: 290 }); const bx = pl.x + pl.w / 2 - 27 + (rnd() < 0.5 ? -50 : 50); P.push({ id: pid++, x: bx, y: pl.y - 62, w: 54, h: 62, kind: 'block', deco: pick(d.decos), move: null, dirc: 0 }); } },
      spikes(n) { for (let i = 0; i < n; i++) { const pl = add({ dy: 90 + rnd() * 16, w: 250 }); const sx = pl.x + pl.w / 2 - 28 + (rnd() < 0.5 ? -40 : 40); Hz.push({ kind: 'spike', x: sx, y: pl.y - 18, w: 56, h: 18 }); } },
      swing(n) { for (let i = 0; i < n; i++) { const pl = add({ dy: 96 + rnd() * 20, w: 300 }); Hz.push({ kind: 'swing', px: pl.x + pl.w / 2, py: pl.y - 232, len: 205, amp: 0.85 + rnd() * 0.2, per: 2.4 + rnd() * 0.8, ph: rnd() * 6.28, r: 24 }); crate(pl); } },
      fan() { const pl = add({ dy: 90, w: 150 }); Hz.push({ kind: 'fan', x: pl.x + pl.w / 2 - 55, y: pl.y - 330, w: 110, h: 330, force: 3500 }); const top = add({ dy: 335, w: 150, dx: (rnd() < 0.5 ? -1 : 1) * (20 + rnd() * 60) }); crate(top, true); },
      rest() { const pl = add({ dy: 96, w: 440, deco: 'rest' }); Cr.push({ id: cid++, x: pl.x + 110, y: pl.y - 30 }); Cr.push({ id: cid++, x: pl.x + pl.w - 110, y: pl.y - 30 }); sinceCrate = 0; },
    };
    for (const [name, n] of d.plan) CH[name](n || 1);
    const goal = add({ dy: 110, w: 560, deco: 'goal' });
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
