/* Tung Floor Is Lava (extreme): the rules, the players, the computer and the chaos events, with no screen.
   One browser (the host, or the solo player) runs makeSim()/stepSim(); everybody else only draws snapshot()s.
   World: 960 x 600, y runs DOWN. The lava rises from the bottom. Last Tung standing wins the round. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.LavaSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 960, H = 600, G = 2300, BW = 13, SPEED = 250, JUMP = 820, REACH = 62;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
  const rnd = () => Math.random();

  const ITEMS = ['rocket', 'spring', 'shield', 'mega', 'soda', 'feather', 'banana', 'ink', 'invert'];
  const ITEM_INFO = {
    rocket: { icon: '🚀', name: 'Rocket Boost', w: 9 }, spring: { icon: '🦘', name: 'Spring Shoes', w: 9 }, shield: { icon: '🛡️', name: 'Bubble Shield', w: 9 },
    mega: { icon: '🏏', name: 'Mega Bat', w: 8 }, soda: { icon: '🥤', name: 'Speed Soda', w: 8 }, feather: { icon: '🪶', name: 'Feather Fall', w: 7 },
    banana: { icon: '🍌', name: 'Banana Peel', w: 8 }, ink: { icon: '🦑', name: 'Ink Bomb', w: 6 }, invert: { icon: '🙃', name: 'Invert Zap', w: 5 },
  };
  // every event is announced 2.5 seconds ahead
  const EVENTS = {
    quake: { name: 'EARTHQUAKE', icon: '🌋', dur: 6, w: 8, tip: 'The ground shakes: platforms crack and you get shoved around!' },
    meteors: { name: 'METEOR SHOWER', icon: '☄️', dur: 9, w: 10, tip: 'Rocks are falling: they smash platforms and hurl Tungs!' },
    lightning: { name: 'LIGHTNING STORM', icon: '⚡', dur: 8, w: 8, tip: 'Watch the warning lines, then get out of the way!' },
    wind: { name: 'GALE FORCE WIND', icon: '💨', dur: 8, w: 9, tip: 'Strong gusts push everyone sideways.' },
    tornado: { name: 'TORNADO', icon: '🌪️', dur: 10, w: 6, tip: 'A twister sweeps through and lifts you up!' },
    invert: { name: 'INVERTED CONTROLS', icon: '🙃', dur: 8, w: 8, tip: 'Left is right and right is left!' },
    ink: { name: 'INK SPLATS', icon: '🦑', dur: 10, w: 7, tip: 'Ink hits the screen. Swing your bat to wipe it!' },
    blackout: { name: 'BLACKOUT', icon: '🌑', dur: 7, w: 6, tip: 'The lights are out. Only the lava glows.' },
    lowgrav: { name: 'LOW GRAVITY', icon: '🎈', dur: 9, w: 7, tip: 'Everything floats. Jump high!' },
    ice: { name: 'FLASH FREEZE', icon: '🧊', dur: 9, w: 7, tip: 'Every platform is slippery ice.' },
    bananas: { name: 'BANANA RAIN', icon: '🍌', dur: 8, w: 6, tip: 'Peels are falling. Do not slip!' },
    sweep: { name: 'GIANT BAT SWEEP', icon: '🏏', dur: 8, w: 7, tip: 'A huge bat sweeps across: jump over it!' },
    dizzy: { name: 'DIZZY SPELL', icon: '😵‍💫', dur: 8, w: 5, tip: 'The whole room is swaying and so are you.' },
    surge: { name: 'LAVA SURGE', icon: '🔥', dur: 5, w: 9, tip: 'The lava jumps up. Climb, climb, climb!' },
    geysers: { name: 'LAVA GEYSERS', icon: '🌋', dur: 9, w: 9, tip: 'Glowing spots on the lava mean an eruption is coming.' },
    fireballs: { name: 'FIREBALL RAIN', icon: '☄️', dur: 9, w: 8, tip: 'Burning rocks fall slowly. Dodge or shield!' },
  };
  const EVENT_IDS = Object.keys(EVENTS);
  // computer players: how fast they react, how well they dodge, how often they fight
  const LEVELS = { easy: { rt: 0.34, dodge: 0.35, aggr: 0.25, jumpErr: 0.25, items: 0.3 }, medium: { rt: 0.18, dodge: 0.7, aggr: 0.55, jumpErr: 0.1, items: 0.6 }, hard: { rt: 0.07, dodge: 0.97, aggr: 0.9, jumpErr: 0.02, items: 0.95 } };

  // ---------------- the room: platforms ----------------
  function genPlatforms() {
    const ys = [520, 445, 370, 295, 220, 145], out = [], rows = [];
    ys.forEach((y, r) => {
      const n = r === 0 ? 4 : r === ys.length - 1 ? 2 : 3 + (rnd() < 0.4 ? 1 : 0), seg = (W - 120) / n, row = [];
      for (let i = 0; i < n; i++) {
        const w = (r === ys.length - 1 ? 170 : 86) + rnd() * 84, cx = 60 + seg * i + seg / 2 + (rnd() - 0.5) * seg * 0.45;
        row.push({ x0: clamp(cx - w / 2, 28, W - 28 - w), y, w, kind: 'normal', deco: ['couch', 'table', 'shelf', 'bed', 'crate', 'tv', 'rug'][Math.floor(rnd() * 7)] });
      }
      if (r > 0) for (const p of row) { // every platform has to be within reach of one in the row below
        const gap = (q) => Math.max(0, q.x0 - (p.x0 + p.w), p.x0 - (q.x0 + q.w));
        let best = rows[r - 1][0]; for (const q of rows[r - 1]) if (gap(q) < gap(best)) best = q;
        if (gap(best) > 110) { const dir = best.x0 > p.x0 ? 1 : -1; p.x0 = clamp(p.x0 + dir * (gap(best) - 100), 28, W - 28 - p.w); }
      }
      rows.push(row);
      for (const p of row) {
        const k = r === 0 || r === ys.length - 1 ? 0 : rnd();
        if (k > 0.9) p.kind = 'bounce'; else if (k > 0.78) p.kind = 'ice'; else if (k > 0.62) { p.kind = 'move'; p.amp = 45 + rnd() * 35; p.per = 3 + rnd() * 2; p.ph = rnd() * 6.28; } else if (k > 0.4) p.kind = 'crumble';
        out.push(p);
      }
    });
    return out.map((p, i) => ({ id: i, ...p, x: p.x0, dx: 0, st: 0, shake: 0, gone: 0, fy: 0, fv: 0 }));
  }

  // ---------------- creating the match ----------------
  function makeSim(players, to, opts) {
    opts = opts || {};
    const s = {
      players: players.map((p, i) => ({ id: p.id, name: p.name, gear: p.gear, bot: !!p.bot, slot: i, wins: 0, x: 0, y: 0, vx: 0, vy: 0, alive: true, face: 1, grounded: false, stand: null, coy: 0, jbuf: 0, jumpCut: false, jhT: 0,
        swing: null, swCd: 0, stun: 0, ink: 0, inv: 0, fx: { rocket: 0, spring: 0, shield: 0, mega: 0, soda: 0, feather: 0 }, item: null, diedAt: -1, inp: { dx: 0, jh: false, jn: 0, sw: 0, it: 0 }, last: { jn: 0, sw: 0, it: 0 }, ai: { t: 0, tx: 0, plat: null, nearItem: null, jumpT: 0 } })),
      to, chaos: opts.chaos || 'normal', level: opts.level || 'medium', phase: 'ready', ready: 2.4, round: 1, ev: [], over: 0, winner: -1, matchOver: false, lastWinner: -1, t: 0,
      plats: [], items: [], meteors: [], bolts: [], balls: [], geysers: [], peels: [], sweeps: [], twister: null, events: [], lava: 600, surge: 0, itemT: 6, windDir: 1, windT: 0, shakeT: 0,
    };
    startRound(s); return s;
  }
  function buildEvents(chaos) {
    const out = []; if (chaos === 'off') return out;
    const total = EVENT_IDS.reduce((a, k) => a + EVENTS[k].w, 0);
    let t = chaos === 'wild' ? 7 : 12, n = 0;
    while (t < 140) {
      let roll = rnd() * total, id = EVENT_IDS[0]; for (const k of EVENT_IDS) { roll -= EVENTS[k].w; if (roll <= 0) { id = k; break; } }
      out.push({ n: n++, id, t0: t, dur: EVENTS[id].dur, started: false });
      if (chaos === 'wild' && rnd() < 0.35) { let id2 = EVENT_IDS[Math.floor(rnd() * EVENT_IDS.length)]; if (id2 === id) id2 = 'wind'; out.push({ n: n++, id: id2, t0: t + 1.5, dur: EVENTS[id2].dur, started: false }); }
      t += EVENTS[id].dur + (chaos === 'wild' ? 2 + rnd() * 4 : 8 + rnd() * 8);
    }
    return out;
  }
  function startRound(s) {
    s.t = 0; s.phase = 'ready'; s.ready = 2.2; s.over = 0; s.lastWinner = -1; s.lava = 600; s.surge = 0; s.itemT = 6;
    s.plats = genPlatforms(); s.items = []; s.meteors = []; s.bolts = []; s.balls = []; s.geysers = []; s.peels = []; s.sweeps = []; s.twister = null; s.events = buildEvents(s.chaos);
    const low = s.plats.filter((p) => p.y === 520), n = s.players.length;
    s.players.forEach((p, i) => {
      const pl = low[i % low.length]; p.x = pl.x0 + pl.w * (0.3 + 0.4 * ((i / low.length) % 1 || 0.5)); p.y = pl.y; p.vx = p.vy = 0; p.alive = true; p.face = i % 2 ? -1 : 1; p.grounded = true; p.stand = pl; p.swing = null; p.swCd = 0; p.stun = 0; p.ink = 0; p.inv = 0;
      for (const k in p.fx) p.fx[k] = 0; p.item = null; p.diedAt = -1; p.last = { jn: p.inp.jn, sw: p.inp.sw, it: p.inp.it }; p.ai = { t: 0, tx: 0, plat: null, nearItem: null, jumpT: 0 };
    });
    void n;
  }
  const evOn = (s, id) => s.events.some((e) => e.id === id && s.t >= e.t0 && s.t < e.t0 + e.dur);
  const platX = (s, pl) => (pl.kind === 'move' ? pl.x0 + Math.sin((s.t / pl.per) * 6.2832 + pl.ph) * pl.amp : pl.x0);
  const platTop = (pl) => pl.y + pl.fy;
  const aliveList = (s) => s.players.filter((p) => p.alive);
  const tell = (s, ...e) => s.ev.push(e);

  // ---------------- the computer ----------------
  function aiInput(s, p, dt) {
    const L = LEVELS[s.level] || LEVELS.medium, a = p.ai, I = { dx: 0, jh: false, jn: p.inp.jn, sw: p.inp.sw, it: p.inp.it };
    a.t -= dt; a.jumpT = Math.max(0, a.jumpT - dt);
    const margin = (pl) => s.lava - platTop(pl); // how far the platform is above the lava
    if (a.t <= 0) {
      a.t = L.rt * (0.7 + rnd() * 0.6);
      // 1. where to stand: stay if the platform is safe and near the middle, otherwise find a higher one
      const cur = p.stand && !p.stand.gone ? p.stand : null;
      const ok = (pl) => !pl.gone && pl.st < 0.35 && margin(pl) > 28;
      let goal = cur && ok(cur) && margin(cur) > 58 + 22 * L.dodge ? cur : null; // stay put until the lava gets close, then climb
      if (!goal) {
        let best = null, bs = -1e9;
        for (const pl of s.plats) {
          if (!ok(pl)) continue; const px = platX(s, pl), dxp = Math.max(0, pl.x0 - 0, Math.abs(px + pl.w / 2 - p.x) - pl.w / 2), dyp = p.y - platTop(pl);
          if (dyp > 118 || dxp > 150) continue; // out of reach of one jump from here
          const sc = margin(pl) * 0.35 - dxp * 0.8 - (dyp < -60 ? 40 : 0) + (dyp > 20 && dyp < 135 ? 45 : 0) + (cur && pl === cur ? 20 : 0) - (pl.kind === 'crumble' ? 30 : 0) - (pl.kind === 'ice' ? 12 : 0) - (pl.kind === 'move' ? 18 : 0) - (pl.kind === 'bounce' ? 90 : 0);
          if (sc > bs) { bs = sc; best = pl; }
        }
        goal = best;
      }
      a.plat = goal; a.tx = goal ? platX(s, goal) + goal.w * (0.3 + rnd() * 0.4) : (p.stand ? platX(s, p.stand) + p.stand.w / 2 : p.x); // nowhere to go: stay on your platform
      // a fighter goes after somebody standing on the same platform (to knock them into the lava)
      const prey = p.stand && s.players.find((q) => q !== p && q.alive && q.stand === p.stand);
      if (prey && !goal) { a.tx = prey.x - Math.sign(prey.x - p.x) * 30; } else if (prey && rnd() < L.aggr) { a.tx = prey.x - Math.sign(prey.x - p.x) * 30; a.plat = p.stand; }
      // 2. an item close by
      a.nearItem = null; if (!p.item) for (const it of s.items) if (Math.hypot(it.x - p.x, it.y - p.y) < 170 && margin({ y: it.y, fy: 0 }) > 40) { a.nearItem = it; break; }
      if (a.nearItem && a.nearItem.pl === p.stand && rnd() < L.items) a.tx = a.nearItem.x; else a.nearItem = null; // only walk for an item on the platform you are standing on
      // 3. use an item
      if (p.item && rnd() < L.items) {
        const foe = s.players.find((q) => q !== p && q.alive && Math.abs(q.x - p.x) < 130 && Math.abs(q.y - p.y) < 60), low = p.stand && margin(p.stand) < 80;
        const use = { rocket: low || !a.plat, spring: !!a.plat && a.plat.y < p.y - 90, shield: s.events.some((e) => s.t >= e.t0 - 1 && s.t < e.t0 + e.dur && ['meteors', 'lightning', 'fireballs', 'sweep'].includes(e.id)), mega: !!foe, soda: true, feather: low, banana: !!foe, ink: true, invert: true }[p.item];
        if (use) { a.useIt = true; }
      }
    }
    // a computer player dodges what is about to hit it
    let flee = 0, dodgeJump = false;
    if (rnd() < L.dodge) {
      for (const b of s.bolts) if (Math.abs(b.x - p.x) < 62 && b.t < 0.2) flee = Math.sign(p.x - b.x) || 1;
      for (const g of s.geysers) if (Math.abs(g.x - p.x) < 62 && g.t < 0.4 && p.y > s.lava - 280) flee = Math.sign(p.x - g.x) || 1;
      for (const m of s.meteors) if (m.y < p.y && p.y - m.y < 240 && Math.abs(m.x - p.x) < 60) flee = Math.sign(p.x - m.x) || 1;
      for (const f of s.balls) if (f.y < p.y && p.y - f.y < 200 && Math.abs(f.x - p.x) < 50) flee = Math.sign(p.x - f.x) || 1;
      for (const w of s.sweeps) if (Math.abs(w.x - p.x) < 150 && p.y > w.y - 20 && p.y < w.y + 110 && Math.sign(p.x - w.x) === -w.dir) dodgeJump = true;
      if (s.twister && Math.abs(s.twister.x - p.x) < 110) flee = Math.sign(p.x - s.twister.x) || 1;
    }
    const target = a.tx, ddx = target - p.x;
    I.dx = flee ? flee : Math.abs(ddx) < 14 ? 0 : Math.sign(ddx);
    if (a.useIt && p.item) { I.it = p.inp.it + 1; a.useIt = false; }
    // jumping: up to a higher platform, across a gap, or over a sweeping bat
    const goalPl = a.plat, want = goalPl && platTop(goalPl) < p.y - 14, onGround = p.grounded;
    if (onGround && a.jumpT <= 0) {
      let j = dodgeJump;
      if (want && goalPl) { const gx = platX(s, goalPl), edge = Math.max(0, gx - p.x, p.x - (gx + goalPl.w)); if (edge < 62 + (rnd() < L.jumpErr ? 50 : 0) && !flee) j = true; }
      if (goalPl && !want && p.stand && goalPl !== p.stand && Math.abs(ddx) > 30) { const px = platX(s, p.stand); if (I.dx > 0 ? p.x > px + p.stand.w - 18 : p.x < px + 18) j = true; } // at the edge, going across
      if (p.stand && margin(p.stand) < 40 && goalPl) j = true;
      if (j) { I.jn = p.inp.jn + 1; a.jumpT = 0.5; p.jhT = 0.38; }
    }
    I.jh = p.jhT > 0; if (p.jhT > 0) p.jhT -= dt;
    // fighting: a swing at a Tung that is close
    const foe = s.players.find((q) => q !== p && q.alive && Math.abs(q.y - p.y) < 42 && (q.x - p.x) * p.face > 0 && Math.abs(q.x - p.x) < REACH - 4 + (p.fx.mega > 0 ? 40 : 0));
    if (foe && p.swCd <= 0 && rnd() < L.aggr * dt * 6) I.sw = p.inp.sw + 1;
    else if (!foe) { const near = s.players.find((q) => q !== p && q.alive && Math.abs(q.y - p.y) < 40 && Math.abs(q.x - p.x) < 90); if (near && !flee && rnd() < L.aggr * 0.5 * dt) { I.dx = Math.sign(near.x - p.x); } } // turn to face a Tung that is close
    return I;
  }

  // ---------------- chaos events ----------------
  function startEvent(s, e) {
    tell(s, 'event', e.id);
    if (e.id === 'quake') for (const pl of s.plats) if (!pl.gone && pl.kind !== 'crumble' && rnd() < 0.12) pl.st = Math.max(pl.st, 0.001);
    if (e.id === 'surge') s.surge += 95;
    if (e.id === 'sweep') { const row = [520, 445, 370, 295, 220][Math.floor(rnd() * 5)]; s.sweeps.push({ x: rnd() < 0.5 ? -120 : W + 120, y: row - 70, dir: 0, spd: 380 }); const sw = s.sweeps[s.sweeps.length - 1]; sw.dir = sw.x < 0 ? 1 : -1; }
    if (e.id === 'tornado') s.twister = { x: rnd() < 0.5 ? 60 : W - 60, y: 330, vx: 0, t: 0 }, s.twister.vx = s.twister.x < W / 2 ? 120 : -120;
    e.nextAt = s.t; e.acc = 0;
  }
  function updateEvents(s, dt) {
    for (const e of s.events) {
      if (s.t < e.t0 || s.t >= e.t0 + e.dur) { if (e.id === 'tornado' && e.started && s.t >= e.t0 + e.dur) s.twister = null; continue; }
      if (!e.started) { e.started = true; startEvent(s, e); }
      e.acc = (e.acc || 0) + dt;
      if (e.id === 'quake') { s.shakeT = 0.2; if (e.acc > 0.45) { e.acc = 0; for (const p of s.players) if (p.alive && p.grounded) { p.vx += (rnd() < 0.5 ? -1 : 1) * 230; p.vy = -160; p.grounded = false; p.stand = null; } } }
      else if (e.id === 'meteors' && e.acc > 0.55) { e.acc = 0; s.meteors.push({ x: 40 + rnd() * (W - 80), y: -40, vx: (rnd() - 0.5) * 120, vy: 600 + rnd() * 120 }); }
      else if (e.id === 'lightning' && e.acc > 1.15) { e.acc = 0; const t = s.players.filter((p) => p.alive); const tg = t.length && rnd() < 0.6 ? t[Math.floor(rnd() * t.length)].x : 40 + rnd() * (W - 80); s.bolts.push({ x: clamp(tg, 40, W - 40), t: -1.1, hit: false }); }
      else if (e.id === 'bananas' && e.acc > 0.4) { e.acc = 0; s.peels.push({ x: 40 + rnd() * (W - 80), y: -30, vy: 300, rest: false, age: 0 }); }
      else if (e.id === 'fireballs' && e.acc > 0.5) { e.acc = 0; s.balls.push({ x: 40 + rnd() * (W - 80), y: -30, vx: (rnd() - 0.5) * 140, vy: 230 + rnd() * 60 }); }
      else if (e.id === 'geysers' && e.acc > 1.5) { e.acc = 0; for (let i = 0; i < 2; i++) s.geysers.push({ x: 50 + rnd() * (W - 100), t: -1.3 - i * 0.3 }); }
      else if (e.id === 'dizzy' && e.acc > 0.35) { e.acc = 0; for (const p of s.players) if (p.alive) p.vx += (rnd() - 0.5) * 380; }
      else if (e.id === 'surge') { /* the lava is already on its way up */ }
    }
  }
  function knock(s, p, dir, power, up, stun, byShieldOk) {
    if (!p.alive) return false;
    if (byShieldOk && p.fx.shield > 0) { p.fx.shield = 0; tell(s, 'shield', p.slot); return false; }
    p.vx = dir * power; p.vy = -up; p.stun = Math.max(p.stun, stun); p.grounded = false; p.stand = null; p.swing = null; return true;
  }
  function updateHazards(s, dt) {
    // meteors
    for (let i = s.meteors.length - 1; i >= 0; i--) {
      const m = s.meteors[i], py = m.y; m.x += m.vx * dt; m.y += m.vy * dt;
      let hit = null;
      for (const p of s.players) if (p.alive && Math.abs(p.x - m.x) < 26 && Math.abs((p.y - 40) - m.y) < 36) { knock(s, p, Math.sign(p.x - m.x) || 1, 520, 520, 0.7, true); tell(s, 'boom', m.x, m.y); hit = true; }
      if (!hit) for (const pl of s.plats) { if (pl.gone) continue; const px = platX(s, pl), top = platTop(pl); if (m.x > px - 6 && m.x < px + pl.w + 6 && py <= top && m.y >= top) { hit = pl; break; } }
      if (hit && hit !== true) { const pl = hit; for (const p of s.players) if (p.alive && Math.hypot(p.x - m.x, p.y - platTop(pl)) < 90) knock(s, p, Math.sign(p.x - m.x) || 1, 460, 460, 0.5, true); if (pl.kind === 'crumble') pl.st = Math.max(pl.st, 0.45); else if (rnd() < 0.3) pl.st = Math.max(pl.st, 0.001); tell(s, 'boom', m.x, platTop(pl)); }
      if (hit || m.y > s.lava) { if (!hit) tell(s, 'splash', m.x); s.meteors.splice(i, 1); }
    }
    // lightning: a warning, then the strike
    for (let i = s.bolts.length - 1; i >= 0; i--) {
      const b = s.bolts[i]; b.t += dt;
      if (b.t >= 0 && !b.hit) { b.hit = true; tell(s, 'bolt', b.x); for (const p of s.players) if (p.alive && Math.abs(p.x - b.x) < 32) knock(s, p, 0, 0, 380, 0.9, true); }
      if (b.t > 0.3) s.bolts.splice(i, 1);
    }
    // fireballs
    for (let i = s.balls.length - 1; i >= 0; i--) {
      const f = s.balls[i]; f.x += f.vx * dt; f.y += f.vy * dt; let dead = f.y > s.lava || f.x < -30 || f.x > W + 30;
      for (const p of s.players) if (p.alive && Math.abs(p.x - f.x) < 22 && Math.abs((p.y - 40) - f.y) < 34) { knock(s, p, Math.sign(p.x - f.x) || 1, 380, 300, 0.5, true); dead = true; tell(s, 'boom', f.x, f.y); }
      if (!dead) for (const pl of s.plats) { if (pl.gone) continue; const px = platX(s, pl); if (f.x > px && f.x < px + pl.w && f.y > platTop(pl) - 8 && f.y < platTop(pl) + 14) { dead = true; tell(s, 'boom', f.x, f.y); } }
      if (dead) s.balls.splice(i, 1);
    }
    // geysers: a glow, then a column of lava that kills whoever is in it
    for (let i = s.geysers.length - 1; i >= 0; i--) {
      const g = s.geysers[i]; g.t += dt;
      if (g.t >= 0 && g.t < 0.9) { for (const p of s.players) if (p.alive && Math.abs(p.x - g.x) < 28 && p.y > s.lava - 270 && !(p.fx.shield > 0 && (p.fx.shield = 0, true))) die(s, p); }
      if (g.t >= 0 && !g.on) { g.on = true; tell(s, 'erupt', g.x); }
      if (g.t > 0.9) s.geysers.splice(i, 1);
    }
    // banana peels
    for (let i = s.peels.length - 1; i >= 0; i--) {
      const b = s.peels[i]; b.age += dt;
      if (!b.rest) { const py = b.y; b.y += b.vy * dt; for (const pl of s.plats) { if (pl.gone) continue; const px = platX(s, pl); if (b.x > px && b.x < px + pl.w && py <= platTop(pl) && b.y >= platTop(pl)) { b.rest = true; b.y = platTop(pl); b.pl = pl; } } if (b.y > s.lava) { s.peels.splice(i, 1); continue; } }
      else if (b.pl) { b.x += b.pl.dx || 0; if (b.pl.gone) { b.rest = false; b.pl = null; } }
      let used = false; for (const p of s.players) if (p.alive && b.rest && Math.abs(p.x - b.x) < 18 && Math.abs(p.y - b.y) < 20) { p.stun = Math.max(p.stun, 0.6); p.vx = (p.vx >= 0 ? 1 : -1) * 460; tell(s, 'slip', p.slot); used = true; }
      if (used || b.age > 18) s.peels.splice(i, 1);
    }
    // the giant bat
    for (let i = s.sweeps.length - 1; i >= 0; i--) {
      const w = s.sweeps[i]; w.x += w.dir * w.spd * dt;
      for (const p of s.players) if (p.alive && Math.abs(p.x - w.x) < 56 && p.y > w.y && p.y < w.y + 112 && p.stun < 0.3) { knock(s, p, w.dir, 640, 430, 0.7, true); }
      if (w.x < -200 || w.x > W + 200) s.sweeps.splice(i, 1);
    }
    // the tornado
    if (s.twister) {
      const t = s.twister; t.t += dt; t.x += t.vx * dt; if (t.x < 40 || t.x > W - 40) t.vx = -t.vx; t.y = 330 + Math.sin(t.t * 1.4) * 80;
      for (const p of s.players) if (p.alive && Math.abs(p.x - t.x) < 90 && Math.abs(p.y - t.y) < 260) { p.vy = Math.max(-520, p.vy - 3400 * dt); p.vx += (t.x - p.x) * 3.2 * dt + (Math.sin(t.t * 9) * 160) * dt; p.grounded = false; p.stand = null; }
    }
  }

  // ---------------- one tick ----------------
  function die(s, p) { if (!p.alive) return; p.alive = false; p.diedAt = s.t; p.swing = null; tell(s, 'burn', p.slot, p.x, p.y); }
  function useItem(s, p) {
    const it = p.item; if (!it) return; p.item = null; tell(s, 'use', p.slot, it);
    if (it === 'rocket') p.fx.rocket = 1.1; else if (it === 'spring') p.fx.spring = 9; else if (it === 'shield') p.fx.shield = 10; else if (it === 'mega') p.fx.mega = 9; else if (it === 'soda') p.fx.soda = 7; else if (it === 'feather') p.fx.feather = 10;
    else if (it === 'banana') s.peels.push({ x: p.x - p.face * 26, y: p.y, vy: 0, rest: true, age: 0, pl: p.stand });
    else if (it === 'ink') for (const q of s.players) if (q !== p && q.alive) q.ink = 7;
    else if (it === 'invert') for (const q of s.players) if (q !== p && q.alive) q.inv = 5;
  }
  function stepPlayer(s, p, dt, wind) {
    const I = p.inp;
    if (!p.alive) { p.y += 30 * dt; return; }
    for (const k in p.fx) p.fx[k] = Math.max(0, p.fx[k] - dt); p.ink = Math.max(0, p.ink - dt); p.inv = Math.max(0, p.inv - dt); p.swCd = Math.max(0, p.swCd - dt);
    if (I.it !== p.last.it) { p.last.it = I.it; useItem(s, p); }
    let dx = I.dx; if (evOn(s, 'invert') || p.inv > 0) dx = -dx;
    p.stun = Math.max(0, p.stun - dt); if (p.stun > 0) dx = 0;
    const ice = evOn(s, 'ice') || (p.stand && p.stand.kind === 'ice' && p.grounded);
    const spd = SPEED * (p.fx.soda > 0 ? 1.4 : 1) * (p.swing ? 0.8 : 1), acc = p.grounded ? (ice ? 800 : 3300) : 2000;
    if (dx) { p.vx = approach(p.vx, dx * spd, acc * dt); if (!p.swing) p.face = dx > 0 ? 1 : -1; } else p.vx = approach(p.vx, 0, (p.grounded ? (ice ? 320 : 3300) : p.stun > 0 ? 60 : 380) * dt);
    if (wind) p.vx += wind * (p.grounded ? 0.55 : 1.25) * dt;
    // a swing of the bat
    if (I.sw !== p.last.sw) { p.last.sw = I.sw; if (p.swCd <= 0 && p.stun <= 0 && !p.swing) { p.swing = { t: 0, dur: 0.34, hit: [] }; p.swCd = 0.6; tell(s, 'swing', p.slot); p.ink = Math.max(0, p.ink - 4); } }
    if (p.swing) {
      const sw = p.swing; sw.t += dt;
      if (sw.t > 0.1 && sw.t < 0.26) for (const q of s.players) {
        if (q === p || !q.alive || sw.hit.includes(q.id)) continue; const reach = REACH + (p.fx.mega > 0 ? 44 : 0), rel = (q.x - p.x) * p.face;
        if (rel > -10 && rel < reach && Math.abs(q.y - p.y) < 50) { sw.hit.push(q.id); if (knock(s, q, p.face, 560 * (p.fx.mega > 0 ? 1.7 : 1), 430, 0.4, true)) tell(s, 'bonk', q.x, q.y - 40); }
      }
      if (sw.t >= sw.dur) p.swing = null;
    }
    // jumping
    if (I.jn !== p.last.jn) { p.last.jn = I.jn; p.jbuf = 0.12; }
    p.jbuf = Math.max(0, p.jbuf - dt); p.coy = p.grounded ? 0.09 : Math.max(0, p.coy - dt);
    if (p.jbuf > 0 && p.coy > 0 && p.stun <= 0) { p.vy = -JUMP * (p.fx.spring > 0 ? 1.35 : 1) * (evOn(s, 'lowgrav') ? 1.08 : 1); p.grounded = false; p.stand = null; p.coy = 0; p.jbuf = 0; p.jumpCut = false; tell(s, 'jump', p.slot); }
    if (!I.jh && p.vy < -320 && !p.jumpCut && p.fx.rocket <= 0) { p.vy *= 0.5; p.jumpCut = true; }
    const g = G * (evOn(s, 'lowgrav') ? 0.42 : 1) * (p.fx.feather > 0 ? 0.4 : 1);
    if (p.fx.rocket > 0) p.vy = Math.min(p.vy, -700); else p.vy = Math.min(1300, p.vy + g * dt);
    if (p.fx.feather > 0 && p.vy > 240) p.vy = 240;
    // moving: the platform carries you
    if (p.grounded && p.stand && !p.stand.gone) p.x += p.stand.dx;
    p.x += p.vx * dt; if (p.x < 16) { p.x = 16; p.vx = Math.max(0, p.vx); } if (p.x > W - 16) { p.x = W - 16; p.vx = Math.min(0, p.vx); }
    const prev = p.y; let ny = p.y + p.vy * dt, land = null, ly = 1e9;
    if (p.vy >= 0) for (const pl of s.plats) {
      if (pl.gone) continue; const px = platX(s, pl), top = platTop(pl);
      if (p.x + 9 > px && p.x - 9 < px + pl.w && prev <= top + 4 + Math.abs(pl.dx) && ny >= top && top < ly) { land = pl; ly = top; }
    }
    if (land && p.vy >= 0) {
      p.y = ly; p.vy = 0; p.grounded = true; p.stand = land; p.jumpCut = false;
      if (land.kind === 'bounce') { p.vy = -1250; p.grounded = false; p.stand = null; tell(s, 'bounce', p.slot); }
      if (land.kind === 'crumble' && land.st <= 0) land.st = 0.001;
    } else { p.y = ny; if (p.vy !== 0) p.grounded = false; if (p.grounded && p.stand) { const px = platX(s, p.stand); if (p.stand.gone || !(p.x + 9 > px && p.x - 9 < px + p.stand.w)) { p.grounded = false; p.stand = null; } } }
    if (p.y > s.lava + 4 || p.y > H + 40) die(s, p);
  }
  function stepSim(s, dt) {
    s.t += dt;
    if (s.phase === 'ready') { s.ready -= dt; if (s.ready <= 0) { s.phase = 'fight'; s.t = 0; tell(s, 'go'); } }
    else if (s.phase === 'over') { s.over -= dt; if (s.over <= 0) { if (s.matchOver) { s.phase = 'end'; tell(s, 'end'); } else { s.round++; startRound(s); } } }
    const live = s.phase === 'fight' || s.phase === 'over';
    // computer players think
    for (const p of s.players) if (p.bot && p.alive && s.phase === 'fight') p.inp = aiInput(s, p, dt);
    if (s.phase === 'over') for (const p of s.players) p.inp = { dx: 0, jh: false, jn: p.inp.jn, sw: p.inp.sw, it: p.inp.it };
    if (s.phase === 'fight') {
      // the lava rises faster and faster
      const rate = 5 + 0.1 * s.t; s.lava -= rate * dt;
      if (s.surge > 0) { const d = Math.min(s.surge, 55 * dt); s.lava -= d; s.surge -= d; }
      s.lava = Math.max(50, s.lava);
      updateEvents(s, dt);
      s.windT -= dt; if (s.windT <= 0) { s.windT = 2.2 + rnd() * 1.5; s.windDir = rnd() < 0.5 ? -1 : 1; }
      // platforms: they move, crack and fall
      for (const pl of s.plats) {
        const nx = platX(s, pl); pl.dx = nx - pl.x; pl.x = nx;
        if (pl.st > 0 && !pl.gone) { pl.st += dt; pl.shake = 1; if (pl.st > 0.7) { pl.gone = 1; pl.fv = 0; tell(s, 'crack', pl.x + pl.w / 2, pl.y); } }
        if (pl.gone) { pl.fv += 900 * dt; pl.fy += pl.fv * dt; }
      }
      // items
      s.itemT -= dt;
      if (s.itemT <= 0) { s.itemT = 7 + rnd() * 4; if (s.items.length < 2) { const ok = s.plats.filter((pl) => !pl.gone && pl.y < s.lava - 90); if (ok.length) { const pl = ok[Math.floor(rnd() * ok.length)]; let roll = rnd() * ITEMS.reduce((a, k) => a + ITEM_INFO[k].w, 0), id = ITEMS[0]; for (const k of ITEMS) { roll -= ITEM_INFO[k].w; if (roll <= 0) { id = k; break; } } s.items.push({ x: pl.x + pl.w / 2, y: platTop(pl) - 28, type: id, pl }); } } }
      for (let i = s.items.length - 1; i >= 0; i--) { const it = s.items[i]; if (it.pl) { it.x += it.pl.dx || 0; it.y = platTop(it.pl) - 28; if (it.pl.gone) { s.items.splice(i, 1); continue; } } for (const p of s.players) if (p.alive && !p.item && Math.abs(p.x - it.x) < 24 && Math.abs((p.y - 30) - it.y) < 40) { p.item = it.type; tell(s, 'pick', p.slot, it.type); s.items.splice(i, 1); break; } }
      updateHazards(s, dt);
    }
    if (live) {
      const wind = s.phase === 'fight' && evOn(s, 'wind') ? s.windDir * 760 : 0;
      for (const p of s.players) stepPlayer(s, p, dt, wind);
      // swing / item counters must keep moving even when nobody can act yet
    }
    if (s.phase === 'fight') {
      const alive = aliveList(s), many = s.players.length > 1;
      if ((many && alive.length <= 1) || alive.length === 0) {
        s.phase = 'over'; s.over = 2.6;
        let w = alive[0] || s.players.slice().sort((a, b) => b.diedAt - a.diedAt)[0]; // the last one still standing, or the last one to die
        if (w) { w.wins++; s.lastWinner = w.slot; tell(s, 'round', w.slot); }
        const champ = s.players.find((p) => p.wins >= s.to); if (champ) { s.matchOver = true; s.winner = champ.slot; }
      }
    }
  }

  // ---------------- what the screens need ----------------
  const r1 = (v) => Math.round(v * 10) / 10;
  function snapshot(s, drain) {
    const upcoming = s.events.filter((e) => s.t >= e.t0 - 3 && s.t < e.t0 + e.dur).map((e) => [EVENT_IDS.indexOf(e.id), r1(e.t0), e.dur]);
    return {
      k: 's', ph: s.phase, rd: s.round, rdy: Math.round(s.ready * 100) / 100, lw: s.lastWinner, w: s.winner, t: r1(s.t), lv: Math.round(s.lava), to: s.to,
      p: s.players.map((p) => [r1(p.x), r1(p.y), Math.round(p.vx), Math.round(p.vy), p.alive ? 1 : 0, p.face, p.swing ? Math.round((p.swing.t / p.swing.dur) * 100) / 100 : -1, Math.round(p.stun * 100) / 100, (p.fx.rocket > 0 ? 1 : 0) | (p.fx.spring > 0 ? 2 : 0) | (p.fx.shield > 0 ? 4 : 0) | (p.fx.mega > 0 ? 8 : 0) | (p.fx.soda > 0 ? 16 : 0) | (p.fx.feather > 0 ? 32 : 0), p.item ? ITEMS.indexOf(p.item) : -1, p.wins, r1(p.ink), r1(p.inv)]),
      pl: s.plats.map((pl) => [Math.round(pl.x), Math.round(pl.y + pl.fy), Math.round(pl.w), ['normal', 'crumble', 'move', 'ice', 'bounce'].indexOf(pl.kind), pl.gone ? 1 : 0, pl.shake ? 1 : 0, ['couch', 'table', 'shelf', 'bed', 'crate', 'tv', 'rug'].indexOf(pl.deco)]),
      it: s.items.map((i) => [Math.round(i.x), Math.round(i.y), ITEMS.indexOf(i.type)]),
      hz: [].concat(s.meteors.map((m) => ['m', Math.round(m.x), Math.round(m.y)]), s.balls.map((f) => ['f', Math.round(f.x), Math.round(f.y)]), s.bolts.map((b) => ['b', Math.round(b.x), r1(b.t)]), s.geysers.map((g) => ['g', Math.round(g.x), r1(g.t)]), s.peels.map((b) => ['p', Math.round(b.x), Math.round(b.y)]), s.sweeps.map((w) => ['s', Math.round(w.x), Math.round(w.y), w.dir]), s.twister ? [['t', Math.round(s.twister.x), Math.round(s.twister.y)]] : []),
      evs: upcoming, wd: s.windDir, ev: drain ? s.ev.splice(0) : [],
    };
  }
  const DECOS = ['couch', 'table', 'shelf', 'bed', 'crate', 'tv', 'rug'], KINDS = ['normal', 'crumble', 'move', 'ice', 'bounce'];
  return { W, H, G, BW, SPEED, JUMP, REACH, EVENTS, EVENT_IDS, ITEMS, ITEM_INFO, LEVELS, DECOS, KINDS, makeSim, stepSim, snapshot, startRound, aliveList };
});
