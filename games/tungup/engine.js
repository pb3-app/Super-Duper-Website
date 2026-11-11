/* Tung Up! engine: physics, bat combat, items, chaos events, networking hooks and drawing.
   Every player simulates their own Tung (so controls feel instant) and tells the others where they are;
   a bat hit is decided by the attacker and applied by the victim. Chaos events run on the shared match clock. */
(() => {
  const M = window.TungMaps, L = window.TungLoad, TA = window.TungArt;
  const VW = 960, VH = 600, G0 = 2300, BODY_W = 13, BODY_H = 44;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
  const lerp = (a, b, k) => a + (b - a) * k;
  function rngFor(str) { // same tiny seeded generator as the maps
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function create(canvas, hooks) {
    const ctx = canvas.getContext('2d');
    let map = null, cfg = null, phase = 'idle'; // idle | countdown | run | done
    let t = 0, cdLeft = 0, me = null, remotes = new Map(), solids = [], plats = [];
    let crumble = new Map(), crateGone = new Map(), peels = [], parts = [], pops = [], flashT = 0, shakeT = 0, hitStop = 0, deco = [];
    let events = [], banner = null, evState = {}, ink = [], lightning = [], meteors = [], bananas = [], tornado = null, sweeps = [], quakeAt = -1;
    let cam = { y: -VH + 100, rot: 0 };
    const input = { l: false, r: false, jump: false, jumpBuf: 0, down: false, swingBuf: 0, itemBuf: 0 };
    let sendAcc = 0, lastPct = -1, finishedAt = 0, raf = 0, last = 0, audio, bigMsg = null, runStartWall = 0, spectate = null;

    // ------------ audio ------------
    function beep(f, d, type = 'square', v = 0.05, slide = 0.6) {
      try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        const tt = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
        o.type = type; o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), tt + d);
        g.gain.setValueAtTime(v, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + d);
        o.connect(g).connect(audio.destination); o.start(tt); o.stop(tt + d + 0.02);
      } catch (_) {}
    }
    const sfx = {
      jump: () => beep(380, 0.12, 'square', 0.04, 1.6), land: () => beep(120, 0.07, 'sine', 0.05, 0.6), swing: () => beep(260, 0.12, 'sawtooth', 0.04, 0.4),
      hit: () => { beep(150, 0.18, 'square', 0.09, 0.4); beep(90, 0.22, 'sawtooth', 0.07, 0.5); }, hurt: () => beep(110, 0.3, 'sawtooth', 0.09, 0.4),
      pick: () => { beep(700, 0.1, 'triangle', 0.07, 1.5); setTimeout(() => beep(1000, 0.12, 'triangle', 0.06, 1.3), 80); }, use: () => beep(500, 0.2, 'triangle', 0.07, 2),
      bounce: () => beep(240, 0.25, 'sine', 0.08, 3), bonk: () => { beep(80, 0.5, 'sawtooth', 0.12, 0.3); }, warn: () => { beep(600, 0.12, 'square', 0.05, 0.8); setTimeout(() => beep(600, 0.12, 'square', 0.05, 0.8), 160); },
      win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'triangle', 0.08, 1), i * 120)); },
    };

    // ------------ world setup ------------
    function makePlayer(def, slot, n) {
      const T = L.TUNGS[def.tung] || L.TUNGS.classic, B = L.BATS[def.bat] || L.BATS.classic;
      return {
        id: def.id, name: def.name, avatar: def.avatar, tung: T, bat: B, slot,
        x: map.spawn.x + (slot - (n - 1) / 2) * 64, y: 0, vx: 0, vy: 0, face: 1, grounded: true, standing: null, standPos: null, coyote: 0, airLeft: T.airJumps,
        hp: T.hp, maxHp: T.hp, inv: 0, stun: 0, slowT: 0, slowF: 1, swing: null, swingCd: 0, item: null,
        fx: { rocket: 0, spring: 0, shield: 0, mega: 0, soda: 0, feather: 0, invert: 0, ink: 0 }, shieldHits: 0,
        peak: 0, pct: 0, dead: 0, drop: 0, run: 0, hook: null, jumpCut: false, flash: 0, finished: false, sw: -1, tx: 0, ty: 0, inEvent: 0, lastHit: 0, bumped: 0,
      };
    }
    function genDecor() {
      const r = rngFor('decor-' + map.id), out = [];
      for (let i = 0; i < 46; i++) out.push({ x: r() * 960, y: -r() * map.height, w: 60 + r() * 160, h: 120 + r() * 380, k: r(), tone: r() });
      return out;
    }
    function setup(c) {
      cfg = c; map = M.build(c.mapId);
      plats = map.platforms; solids = plats.filter((p) => p.id !== 0 && !p.thin); // everything is solid (blocks head, sides and feet) except the 'thin' ledges
      const all = [c.me].concat(c.others || []);
      me = makePlayer(c.me, all.findIndex((x) => x.id === c.me.id), all.length);
      remotes = new Map();
      all.forEach((d, i) => { if (d.id !== c.me.id) { const r = makePlayer(d, i, all.length); r.tx = r.x; r.ty = r.y; r.remote = true; r.seen = false; remotes.set(d.id, r); } });
      crumble = new Map(); crateGone = new Map(); peels = []; parts = []; pops = []; ink = []; lightning = []; meteors = []; bananas = []; sweeps = []; tornado = null;
      evState = {}; banner = null; t = 0; finishedAt = 0; lastPct = -1; bigMsg = null; quakeAt = -1; deco = genDecor();
      events = buildEvents(c.seed || 'solo', c.chaos || 'normal');
      cam.y = Math.min(me.y - VH * 0.6, 100 - VH);
    }
    function buildEvents(seed, chaos) {
      const out = [];
      if (chaos === 'off') return out;
      const r = rngFor(seed + ':events'), ids = Object.keys(L.EVENTS), total = ids.reduce((a, k) => a + L.EVENTS[k].w, 0);
      let tt = chaos === 'wild' ? 13 : 24, n = 0;
      while (tt < 1500) {
        let roll = r() * total, id = ids[0];
        for (const k of ids) { roll -= L.EVENTS[k].w; if (roll <= 0) { id = k; break; } }
        const dur = L.EVENTS[id].dur;
        out.push({ n: n++, id, t0: tt, dur, seed: Math.floor(r() * 1e9) });
        if (chaos === 'wild' && r() < 0.3) { // a second event at the same time
          let id2 = ids[Math.floor(r() * ids.length)]; if (id2 === id) id2 = 'wind';
          out.push({ n: n++, id: id2, t0: tt + 1.5, dur: L.EVENTS[id2].dur, seed: Math.floor(r() * 1e9) });
        }
        tt += dur + (chaos === 'wild' ? 3 + r() * 5 : 10 + r() * 9);
      }
      return out;
    }

    // ------------ helpers ------------
    const pos = (p) => M.platPos(p, t);
    function addParts(x, y, n, o = {}) {
      for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * (o.sp || 240) + (o.vx || 0), vy: (Math.random() - 0.5) * (o.sp || 240) + (o.vy || 0), life: o.life || 0.5, max: o.life || 0.5, r: o.r || 3, col: o.col || '#fff', g: o.g == null ? 500 : o.g });
    }
    function pop(text, x, y, col = '#fff', big = false) { pops.push({ text, x, y, col, t: 0, big }); }
    const myPct = () => clamp((-me.y / map.height) * 100, 0, 100);
    const isIce = () => evActive('ice') || (me.standing && me.standing.kind === 'ice');
    function evActive(id) { return events.some((e) => e.id === id && t >= e.t0 && t < e.t0 + e.dur); }
    const rr = (a, b, c, d, e, f, g, h) => a < f && b > e && c < h && d > g; // rect overlap: l r t b vs l r t b

    // ------------ combat ------------
    function hurt(amount, o = {}) { // returns true if damage was applied
      const p = me;
      if (p.dead > 0 || p.inv > 0 || phase !== 'run' || p.finished) return false;
      if (p.fx.shield > 0 && p.shieldHits > 0) {
        p.shieldHits--; p.inv = 0.4; if (p.shieldHits <= 0) p.fx.shield = 0;
        addParts(p.x, p.y - 24, 14, { col: '#7ad3ff', sp: 320 }); pop('BLOCKED', p.x, p.y - 60, '#7ad3ff'); sfx.use(); return false;
      }
      p.hp -= amount; p.inv = o.inv || 0.6; p.flash = 0.25;
      const w = p.tung.weight;
      if (o.vx != null) { p.vx = o.vx / w; p.vy = (o.vy != null ? o.vy : -300) / w; p.grounded = false; p.standing = null; p.swing = null; }
      p.stun = Math.max(p.stun, o.stun != null ? o.stun : 0.3);
      if (o.slow) { p.slowT = o.slow.t; p.slowF = o.slow.f; }
      shakeT = Math.max(shakeT, 0.25); sfx.hurt();
      addParts(p.x, p.y - 24, 10, { col: '#ffcc33', sp: 360 });
      pop('-' + Math.round(amount), p.x, p.y - 56, '#ff6b5e', true);
      if (p.hp <= 0) bonked();
      return true;
    }
    function bonked() {
      const p = me;
      p.hp = 0; p.dead = 1.5; p.item = null; for (const k in p.fx) p.fx[k] = 0; p.swing = null; p.hook = null;
      addParts(p.x, p.y - 24, 40, { col: '#ffcc33', sp: 600, life: 0.9 });
      sfx.bonk(); bigMsg = { text: 'BONKED! Back to the bottom…', t: 1.6 }; shakeT = 0.5;
    }
    function respawn() {
      const p = me;
      p.x = map.spawn.x + (p.slot - 1) * 40; p.y = 0; p.vx = p.vy = 0; p.hp = p.maxHp; p.inv = 2.4; p.stun = 0; p.grounded = true; p.standing = null; p.dead = 0; p.airLeft = p.tung.airJumps; p.slowT = 0;
      cam.y = Math.min(p.y - VH * 0.6, 100 - VH);
    }
    function startSwing() {
      const p = me;
      if (p.swing || p.swingCd > 0 || p.stun > 0 || p.hook || p.dead > 0) return;
      p.swing = { t: 0, dur: p.bat.swing * (p.fx.mega > 0 ? 1.08 : 1), hit: new Set(), opened: false };
      sfx.swing();
      for (const b of ink) b.a *= 0.35; // swinging wipes ink off the screen
      if (p.fx.ink > 0) p.fx.ink = Math.max(0, p.fx.ink - 1.8);
    }
    const swingK = (s) => s.t / s.dur;
    function swingAngle(k) { // 0 = bat straight up; positive = toward the way you face
      if (k < 0.22) return lerp(0.45, -1.1, k / 0.22);
      if (k < 0.72) { const u = (k - 0.22) / 0.5; return lerp(-1.1, 2.15, 1 - Math.pow(1 - u, 2)); }
      return lerp(2.15, 0.45, (k - 0.72) / 0.28);
    }
    function batGeom(p, k, scaleBat) {
      const a = swingAngle(k), len = p.bat.reach * scaleBat * (p.fx.mega > 0 || p.mega ? 1.8 : 1);
      const hx = p.x + p.face * 11, hy = p.y - 27;
      const dx = Math.sin(a) * p.face, dy = -Math.cos(a);
      return { hx, hy, tx: hx + dx * len, ty: hy + dy * len, len, a };
    }
    function updateSwing(dt) {
      const p = me, s = p.swing;
      if (!s) return;
      s.t += dt;
      const k = swingK(s);
      if (k >= 1) { p.swing = null; p.swingCd = 0.1; return; }
      if (k > 0.24 && k < 0.74) {
        const g = batGeom(p, k, 1), mega = p.fx.mega > 0;
        for (const r of remotes.values()) {
          if (s.hit.has(r.id) || !r.seen || r.dead || r.fin) continue;
          const body = [r.x - BODY_W - 6, r.x + BODY_W + 6, r.y - BODY_H - 6, r.y + 4];
          let hit = false;
          for (let i = 1; i <= 6 && !hit; i++) { const f = i / 6, px = lerp(g.hx, g.tx, f), py = lerp(g.hy, g.ty, f); if (px > body[0] && px < body[1] && py > body[2] && py < body[3]) hit = true; }
          if (hit) {
            s.hit.add(r.id);
            const dmg = p.bat.dmg * (mega ? 1.7 : 1), kb = p.bat.knock * (mega ? 1.35 : 1);
            hooks.send({ k: 'hit', to: r.id, dmg: Math.round(dmg), kb: Math.round(kb), d: p.face, st: p.bat.stun, sl: p.bat.slow, by: p.id });
            pop('BONK!', r.x, r.y - 64, '#ffd23f', true); addParts(r.x, r.y - 24, 12, { col: '#fff', sp: 420, life: 0.4 }); sfx.hit();
            hitStop = 0.06; shakeT = Math.max(shakeT, 0.18); r.flash = 0.2; r.hp = Math.max(0, r.hp - dmg);
          }
        }
        // bats open crates and set off crumbling ledges
        for (const c of map.crates) {
          if (crateGone.has(c.id)) continue;
          if (Math.hypot(c.x - g.tx, c.y - g.ty) < 34 || Math.hypot(c.x - lerp(g.hx, g.tx, 0.6), c.y - lerp(g.hy, g.ty, 0.6)) < 34) collectCrate(c);
        }
        for (const pl of plats) if (pl.kind === 'crumble' && !crumble.has(pl.id)) { const pp = pos(pl); if (g.tx > pp.x && g.tx < pp.x + pl.w && Math.abs(g.ty - pp.y) < 20) crumble.set(pl.id, { t: 0.2, gone: 0 }); }
        for (let i = peels.length - 1; i >= 0; i--) if (Math.hypot(peels[i].x - g.tx, peels[i].y - 10 - g.ty) < 34) { hooks.send({ k: 'peelx', id: peels[i].id }); peels.splice(i, 1); }
      }
    }

    // ------------ items ------------
    function pickItem() {
      const others = [...remotes.values()].filter((r) => r.seen);
      const avg = others.length ? others.reduce((a, r) => a + r.pct, 0) / others.length : me.pct;
      const lag = others.length ? avg - me.pct : 0;
      const list = [];
      for (const it of Object.values(L.ITEMS)) {
        if (it.others && !others.length) continue;
        let w = it.w;
        if (lag > 10 && ['rocket', 'hook', 'spring'].includes(it.id)) w *= 2.6;
        if (lag < -10) { if (['banana', 'ink', 'invert', 'megabat'].includes(it.id)) w *= 2.2; if (['rocket', 'hook'].includes(it.id)) w *= 0.3; }
        if (it.id === 'heal' && me.hp > me.maxHp * 0.85) w *= 0.25;
        list.push([it, w]);
      }
      let roll = Math.random() * list.reduce((a, x) => a + x[1], 0);
      for (const [it, w] of list) { roll -= w; if (roll <= 0) return it; }
      return list[0][0];
    }
    function collectCrate(c) {
      if (me.item) return false;
      crateGone.set(c.id, t + 14); me.item = pickItem(); hooks.send({ k: 'pick', c: c.id });
      sfx.pick(); addParts(c.x, c.y, 16, { col: '#ffd23f', sp: 360 }); pop(me.item.name + '!', me.x, me.y - 66, '#ffd23f', true);
      return true;
    }
    function findHookTarget() {
      let best = null, bs = 1e9;
      for (const pl of plats) {
        if (pl.kind === 'block') continue;
        const pp = pos(pl), cx = pp.x + pl.w / 2, dy = me.y - pp.y;
        if (dy < 110 || dy > 460) continue;
        const dx = Math.abs(clamp(me.x, pp.x + 10, pp.x + pl.w - 10) - me.x);
        if (dx > 310) continue;
        const score = dx * 0.6 + Math.abs(dy - 300) * 0.5;
        if (score < bs) { bs = score; best = { pl, x: clamp(me.x, pp.x + 14, pp.x + pl.w - 14), y: pp.y, cx }; }
      }
      return best;
    }
    function useItem() {
      const p = me; if (!p.item || p.stun > 0 || p.dead > 0 || p.hook) return;
      const it = p.item;
      switch (it.id) {
        case 'rocket': p.fx.rocket = 0.8; p.grounded = false; p.standing = null; break;
        case 'spring': p.fx.spring = 10; break;
        case 'shield': p.fx.shield = 10; p.shieldHits = 2; break;
        case 'megabat': p.fx.mega = 9; break;
        case 'soda': p.fx.soda = 8; break;
        case 'feather': p.fx.feather = 10; break;
        case 'heal': p.hp = Math.min(p.maxHp, p.hp + 45); pop('+45', p.x, p.y - 60, '#7df08f', true); break;
        case 'hook': {
          const tg = findHookTarget();
          if (!tg) { pop('No ledge in range', p.x, p.y - 60, '#ffb3a8'); return; }
          p.hook = { sx: p.x, sy: p.y, tx: tg.x, ty: tg.y, t: 0, dur: 0.42, pl: tg.pl }; p.grounded = false; p.standing = null; p.vx = p.vy = 0; break;
        }
        case 'banana': { const pl = { id: Math.floor(Math.random() * 1e9), x: p.x - p.face * 26, y: p.y, owner: p.id, born: t }; peels.push(pl); hooks.send({ k: 'peel', id: pl.id, x: pl.x, y: pl.y }); break; }
        case 'ink': hooks.send({ k: 'fx', type: 'ink', dur: 7, by: p.id }); break;
        case 'invert': hooks.send({ k: 'fx', type: 'invert', dur: 6, by: p.id }); break;
      }
      sfx.use(); addParts(p.x, p.y - 24, 14, { col: '#fff', sp: 300 });
      p.item = null;
    }

    // ------------ chaos events ------------
    function updateEvents(dt) {
      let warnShown = null;
      for (const e of events) {
        if (e.t0 - 2.6 <= t && t < e.t0) warnShown = e;
        if (t >= e.t0 && t < e.t0 + e.dur) updateEvent(e, dt);
        else if (t >= e.t0 + e.dur && evState[e.n] && !evState[e.n].done) evState[e.n].done = true;
      }
      if (warnShown) { if (!banner || banner.e !== warnShown) { banner = { e: warnShown, t: 0, warn: true }; sfx.warn(); } }
      else if (banner && banner.warn) banner = null;
      const live = events.find((e) => t >= e.t0 && t < e.t0 + e.dur);
      if (live && (!banner || banner.e !== live || banner.warn)) { banner = { e: live, t: 0, warn: false }; }
      if (!live && banner && !banner.warn) banner = null;
      if (banner) banner.t += dt;
      // clean-ups
      meteors = meteors.filter((m) => m.y < cam.y + VH + 120 && !m.dead);
      bananas = bananas.filter((m) => m.y < cam.y + VH + 120 && !m.dead);
      lightning = lightning.filter((l) => t < l.t1 + 0.3);
      sweeps = sweeps.filter((s) => t < s.t0 + s.dur + 0.2);
      for (const b of ink) b.a -= dt / (me && me.fx.ink > 0 ? 14 : 8);
      ink = ink.filter((b) => b.a > 0.02);
      if (tornado && !evActive('tornado')) tornado = null;
    }
    function updateEvent(e, dt) {
      const st = evState[e.n] || (evState[e.n] = { r: rngFor('ev' + e.seed + me.id), acc: 0, k: 0, done: false });
      const p = me, age = t - e.t0;
      switch (e.id) {
        case 'quake': {
          shakeT = Math.max(shakeT, 0.12);
          const slot = Math.floor(age / 0.9);
          if (slot !== st.k && p.grounded && p.stun <= 0) { st.k = slot; const rs = rngFor('q' + e.seed + slot)(); p.vx += (rs < 0.5 ? -1 : 1) * 330; p.vy = -160; p.grounded = false; p.standing = null; sfx.hurt(); }
          for (const c of crumble.values()) if (c.t > 0) c.t += dt;
          break;
        }
        case 'meteors': {
          st.acc += dt;
          while (st.acc > (cfg.chaos === 'wild' ? 0.32 : 0.5)) { st.acc -= (cfg.chaos === 'wild' ? 0.32 : 0.5); meteors.push({ x: p.x + (st.r() - 0.5) * 760, y: cam.y - 40, vx: -160 + st.r() * 320, vy: 640 + st.r() * 200, r: 15 }); }
          for (const m of meteors) {
            m.x += m.vx * dt; m.y += m.vy * dt;
            if (!m.dead && p.dead <= 0 && Math.hypot(m.x - p.x, m.y - (p.y - 22)) < m.r + 18) { m.dead = true; hurt(18, { vx: Math.sign(p.x - m.x || 1) * 480, vy: -380, stun: 0.35 }); addParts(m.x, m.y, 14, { col: '#ff8a3a', sp: 400 }); }
            if (!m.dead) for (const pl of plats) { if (pl.kind === 'block' || pl.id === 0) continue; const pp = pos(pl); if (m.x > pp.x && m.x < pp.x + pl.w && m.y > pp.y - 4 && m.y < pp.y + 26) { m.dead = true; addParts(m.x, pp.y, 10, { col: '#ff8a3a', sp: 360, vy: -150 }); break; } }
          }
          break;
        }
        case 'lightning': {
          st.acc += dt;
          while (st.acc > (cfg.chaos === 'wild' ? 0.75 : 1.1)) { st.acc -= (cfg.chaos === 'wild' ? 0.75 : 1.1); const lx = clamp(p.x + (st.r() - 0.5) * 340, 30, 930); lightning.push({ x: lx, t0: t, t1: t + 0.85, hit: false }); }
          for (const l of lightning) if (!l.hit && t >= l.t1) { l.hit = true; flashT = 0.18; shakeT = 0.3; beep(70, 0.4, 'sawtooth', 0.12, 0.4); if (Math.abs(p.x - l.x) < 36 && p.y > cam.y - 20 && p.y < cam.y + VH + 40) hurt(22, { vx: Math.sign(p.x - l.x || 1) * 200, vy: -300, stun: 0.5 }); }
          break;
        }
        case 'wind': {
          const dir = rngFor('w' + e.seed + Math.floor(age / 2.2))() < 0.5 ? -1 : 1;
          st.dir = dir; if (p.grounded) { p.x = clamp(p.x + dir * 95 * dt, 14, VW - 14); } else p.vx += dir * 1250 * dt; if (Math.random() < 0.6) addParts(p.x - dir * 300 + (Math.random() - 0.5) * 600, cam.y + Math.random() * VH, 1, { col: 'rgba(255,255,255,.7)', vx: dir * 700, sp: 0, life: 0.5, r: 2, g: 0 });
          break;
        }
        case 'tornado': {
          if (!tornado) tornado = { x: p.x < 480 ? 900 : 60, y: p.y - 140, dir: p.x < 480 ? -1 : 1, spin: 0 };
          tornado.x += tornado.dir * 150 * dt; tornado.spin += dt * 9; if (tornado.x < 40 || tornado.x > 920) tornado.dir *= -1;
          if (Math.abs(p.x - tornado.x) < 62 && p.y < tornado.y + 130 && p.y > tornado.y - 380 && p.dead <= 0) { p.vy = Math.max(p.vy - 3600 * dt, -620); p.vx += Math.sin(tornado.spin * 2) * 900 * dt + (p.x < tornado.x ? -300 : 300) * dt; p.grounded = false; p.standing = null; }
          break;
        }
        case 'invert': p.fx.invert = Math.max(p.fx.invert, 0.25); break;
        case 'ink': {
          st.acc += dt;
          while (st.acc > 0.75) { st.acc -= 0.75; for (let i = 0; i < 2; i++) ink.push({ x: 80 + st.r() * 800, y: 60 + st.r() * 480, r: 45 + st.r() * 80, a: 1, w: st.r() * 6 }); }
          break;
        }
        case 'bananas': {
          st.acc += dt;
          while (st.acc > 0.45) { st.acc -= 0.45; bananas.push({ x: p.x + (st.r() - 0.5) * 760, y: cam.y - 40, vx: 0, vy: 520 + st.r() * 120, rot: 0 }); }
          for (const b of bananas) {
            b.y += b.vy * dt; b.rot += dt * 6;
            if (!b.dead && Math.abs(b.x - p.x) < 26 && Math.abs(b.y - (p.y - 22)) < 30 && p.stun <= 0 && p.inv <= 0) { b.dead = true; slip(p.vx || p.face * 100); }
            if (!b.dead) for (const pl of plats) { if (pl.kind === 'block' || pl.id === 0) continue; const pp = pos(pl); if (b.x > pp.x && b.x < pp.x + pl.w && b.y > pp.y - 4 && b.y < pp.y + 24) { b.dead = true; peels.push({ id: Math.floor(Math.random() * 1e9), x: b.x, y: pp.y, owner: -1, born: t, ttl: 9 }); break; } }
          }
          break;
        }
        case 'sweep': {
          if (st.next == null) st.next = e.t0 + 0.5;
          if (t >= st.next) { const dir = st.r() < 0.5 ? 1 : -1; sweeps.push({ y: p.y - 26, dir, t0: t + 0.9, dur: 1.0, hit: false }); st.next = t + 2.7; }
          for (const s of sweeps) {
            if (s.hit || t < s.t0) continue;
            const k = (t - s.t0) / s.dur, bx = s.dir > 0 ? -150 + k * 1260 : 1110 - k * 1260;
            if (Math.abs(p.x - bx) < 90 && p.y - BODY_H < s.y + 55 && p.y > s.y - 55) { s.hit = true; hurt(14, { vx: s.dir * 900, vy: -420, stun: 0.55 }); }
          }
          break;
        }
        default: break;
      }
    }
    function slip(vx) {
      const p = me; if (p.dead > 0) return;
      if (p.fx.shield > 0 && p.shieldHits > 0) { p.shieldHits--; if (p.shieldHits <= 0) p.fx.shield = 0; return; }
      p.stun = 0.8; p.vx = (vx >= 0 ? 1 : -1) * 460; p.vy = -260; p.grounded = false; p.standing = null; p.swing = null; pop('SLIP!', p.x, p.y - 60, '#ffe45e', true); beep(500, 0.3, 'sine', 0.07, 0.3);
    }

    // ------------ main simulation ------------
    function updateMe(dt) {
      const p = me;
      if (p.dead > 0) { p.dead -= dt; if (p.dead <= 0) respawn(); return; }
      if (p.finished) { p.vx = approach(p.vx, 0, 2000 * dt); return; }
      p.inv = Math.max(0, p.inv - dt); p.stun = Math.max(0, p.stun - dt); p.slowT = Math.max(0, p.slowT - dt); p.flash = Math.max(0, p.flash - dt);
      p.swingCd = Math.max(0, p.swingCd - dt); p.drop = Math.max(0, p.drop - dt);
      for (const k in p.fx) p.fx[k] = Math.max(0, p.fx[k] - dt);
      input.jumpBuf = Math.max(0, input.jumpBuf - dt); input.swingBuf = Math.max(0, input.swingBuf - dt); input.itemBuf = Math.max(0, input.itemBuf - dt);
      if (input.swingBuf > 0) { startSwing(); if (p.swing) input.swingBuf = 0; }
      if (input.itemBuf > 0) { useItem(); input.itemBuf = 0; }
      // hook pull
      if (p.hook) {
        const h = p.hook; h.t += dt; const k = clamp(h.t / h.dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
        const cur = pos(h.pl);
        p.x = lerp(h.sx, h.tx, e); p.y = lerp(h.sy, cur.y, e); p.vx = p.vy = 0; p.face = h.tx >= h.sx ? 1 : -1;
        if (k >= 1) { p.hook = null; p.vy = -260; p.grounded = false; }
        updateSwing(dt); return;
      }
      // follow a platform we stand on
      if (p.grounded && p.standing) {
        const cur = pos(p.standing);
        if (p.standPos) { p.x += cur.x - p.standPos.x; }
        p.y = cur.y; p.standPos = cur;
        if (p.standing.kind === 'conv') p.x += p.standing.dirc * 105 * dt;
        const cs = crumble.get(p.standing.id); if (p.standing.kind === 'crumble' && !cs) crumble.set(p.standing.id, { t: 0.001, gone: 0 });
      }
      // horizontal control
      let dir = (input.r ? 1 : 0) - (input.l ? 1 : 0); if (p.fx.invert > 0) dir = -dir;
      const stunned = p.stun > 0, ice = isIce();
      const spd = p.tung.speed * (p.fx.soda > 0 ? 1.4 : 1) * (p.slowT > 0 ? p.slowF : 1) * p.bat.moveMul * (p.swing ? 0.8 : 1);
      if (!stunned && dir) { p.vx = approach(p.vx, dir * spd, (p.grounded ? (ice ? 900 : 3300) : 2000) * dt); if (!p.swing || swingK(p.swing) > 0.8) p.face = dir; }
      else p.vx = approach(p.vx, 0, (p.grounded ? (ice ? 420 : 3300) : (stunned ? 60 : 420)) * dt);
      p.run += Math.abs(p.vx) * dt * 0.05;
      // jump
      p.coyote = p.grounded ? 0.06 : Math.max(0, p.coyote - dt);
      if (!stunned && input.jumpBuf > 0) {
        if (p.coyote > 0 || (p.fx.rocket <= 0 && p.airLeft > 0 && !p.grounded)) {
          const air = !(p.coyote > 0); if (air) p.airLeft--;
          const mul = (p.fx.spring > 0 ? 1.38 : 1) * (evActive('lowgrav') ? 1.1 : 1);
          p.vy = -p.tung.jump * mul; p.grounded = false; p.standing = null; p.coyote = 0; input.jumpBuf = 0; p.jumpCut = false; sfx.jump();
          addParts(p.x, p.y, air ? 8 : 5, { col: air ? '#ffe27a' : '#cfc7b4', sp: 140, vy: 60, life: 0.35 });
        }
      }
      if (!input.jump && p.vy < -320 && !p.jumpCut && p.fx.rocket <= 0) { p.vy *= 0.5; p.jumpCut = true; }
      // only the see-through ledges let you drop through them
      if (input.down && p.grounded && p.standing && p.standing.thin) { p.drop = 0.28; p.grounded = false; p.standing = null; p.y += 2; }
      // vertical forces
      const g = G0 * (evActive('lowgrav') ? 0.42 : 1) * (p.fx.feather > 0 ? 0.4 : 1);
      if (p.fx.rocket > 0) { p.vy = Math.min(p.vy, -820); if (Math.random() < 0.9) addParts(p.x, p.y, 1, { col: Math.random() < 0.5 ? '#ff9d00' : '#ffe45e', vy: 220, sp: 120, life: 0.4, r: 4 }); }
      else p.vy = Math.min(1300, p.vy + g * dt);
      if (p.fx.feather > 0 && p.vy > 260) p.vy = 260;
      if (p.tung.float && input.jump && p.vy > 330 && !stunned) p.vy = 330;
      for (const h of map.hazards) if (h.kind === 'fan' && p.x > h.x && p.x < h.x + h.w && p.y > h.y && p.y < h.y + h.h + 20) { p.vy -= h.force * dt; if (p.vy < -560) p.vy = -560; p.grounded = false; if (Math.random() < 0.3) addParts(p.x + (Math.random() - 0.5) * 30, p.y, 1, { col: 'rgba(255,255,255,.6)', vy: -200, sp: 20, life: 0.5, r: 2, g: 0 }); }
      // integrate x with solid blocks
      let nx = clamp(p.x + p.vx * dt, 14, VW - 14);
      if (p.fx.rocket <= 0) for (const b of solids) { // the sides of solid platforms stop you
        const cs = crumble.get(b.id); if (cs && cs.gone > 0) continue;
        const sp = b.kind === 'block' ? b : pos(b);
        if (rr(nx - BODY_W, nx + BODY_W, p.y - BODY_H, p.y - 0.5, sp.x, sp.x + b.w, sp.y, sp.y + b.h)) { nx = p.vx > 0 || nx < sp.x + b.w / 2 ? sp.x - BODY_W : sp.x + b.w + BODY_W; p.vx = 0; }
      }
      p.x = nx;
      // integrate y with platform landing
      const prevFeet = p.y; let ny = p.y + p.vy * dt;
      let land = null, landY = 1e9;
      if (p.vy >= 0 || (p.grounded && !p.standing)) {
        for (const pl of plats) {
          if (pl.kind === 'block') { if (p.x + BODY_W > pl.x && p.x - BODY_W < pl.x + pl.w && prevFeet <= pl.y + 1 && ny >= pl.y && pl.y < landY) { land = pl; landY = pl.y; } continue; }
          if (p.drop > 0 && pl.thin) continue;
          const cs = crumble.get(pl.id); if (cs && cs.gone > 0) continue;
          const pp = pos(pl), prevTop = M.platPos(pl, t - dt).y;
          if (p.x + 11 > pp.x && p.x - 11 < pp.x + pl.w && prevFeet <= prevTop + 4 && ny >= pp.y && pp.y < landY) { land = pl; landY = pp.y; }
        }
      }
      if (land && p.vy >= 0) {
        const lp = pos(land), top = land.kind === 'block' ? land.y : lp.y;
        const hard = p.vy > 520; ny = top; p.vy = 0; p.grounded = true; p.standing = land; p.standPos = land.kind === 'block' ? { x: land.x, y: land.y } : lp; p.airLeft = p.tung.airJumps; p.jumpCut = false;
        if (hard) { sfx.land(); addParts(p.x, top, 6, { col: '#cfc7b4', sp: 180, vy: -40, life: 0.3 }); }
        if (land.kind === 'bounce') { p.vy = -1320; p.grounded = false; p.standing = null; sfx.bounce(); addParts(p.x, top, 12, { col: '#ff6b5e', sp: 240, vy: -100 }); }
        if (land.kind === 'crumble' && !crumble.has(land.id)) crumble.set(land.id, { t: 0.001, gone: 0 });
      } else if (p.vy < 0) {
        // bump your head on the underside of a solid platform
        if (p.fx.rocket <= 0) for (const b of solids) {
          const cs = crumble.get(b.id); if (cs && cs.gone > 0) continue;
          const sp = b.kind === 'block' ? b : pos(b);
          if (p.x + BODY_W > sp.x && p.x - BODY_W < sp.x + b.w && p.y - BODY_H >= sp.y + b.h - 1 && ny - BODY_H < sp.y + b.h) { ny = sp.y + b.h + BODY_H; p.vy = Math.max(0, p.vy * -0.1); p.jumpCut = true; addParts(p.x, ny - BODY_H, 4, { col: '#cfc7b4', sp: 120, vy: 30, life: 0.25 }); }
        }
        p.grounded = false;
      } else if (p.grounded && p.standing) { ny = p.y; }
      else p.grounded = false;
      if (p.grounded && p.standing) {
        const sp = p.standing.kind === 'block' ? { x: p.standing.x, y: p.standing.y } : pos(p.standing);
        if (!(p.x + 11 > sp.x && p.x - 11 < sp.x + p.standing.w) || (p.standing.kind === 'crumble' && (crumble.get(p.standing.id) || {}).gone > 0)) { p.grounded = false; p.standing = null; }
      }
      p.y = ny;
      if (p.y > 40) { p.y = 0; p.vy = 0; p.grounded = true; }
      // hazards
      if (p.inv <= 0) for (const h of map.hazards) {
        if (h.kind === 'spike' && rr(p.x - BODY_W + 3, p.x + BODY_W - 3, p.y - BODY_H, p.y, h.x + 3, h.x + h.w - 3, h.y + 5, h.y + h.h)) hurt(12, { vx: Math.sign(p.x - (h.x + h.w / 2) || p.face) * 260, vy: -560, stun: 0.25, inv: 0.8 });
        if (h.kind === 'swing') {
          const b = M.swingPos(h, t), cx = clamp(b.x, p.x - BODY_W, p.x + BODY_W), cy = clamp(b.y, p.y - BODY_H, p.y);
          if (Math.hypot(b.x - cx, b.y - cy) < h.r) hurt(15, { vx: Math.sign(p.x - b.x || 1) * 640, vy: -380, stun: 0.4, inv: 0.8 });
        }
      }
      // banana peels
      for (let i = peels.length - 1; i >= 0; i--) {
        const pe = peels[i];
        if (pe.ttl && t - pe.born > pe.ttl) { peels.splice(i, 1); continue; }
        if (!pe.owner || pe.owner !== p.id || t - pe.born > 1.2) {
          if (Math.abs(p.x - pe.x) < 24 && Math.abs(p.y - pe.y) < 14 && p.stun <= 0 && p.inv <= 0 && p.grounded) { peels.splice(i, 1); hooks.send({ k: 'peelx', id: pe.id }); slip(p.vx || p.face * 120); }
        }
        if (!pe.ttl && t - pe.born > 25) peels.splice(i, 1);
      }
      // crates (walk into them)
      for (const c of map.crates) if (!crateGone.has(c.id) && Math.abs(p.x - c.x) < 28 && p.y - BODY_H < c.y + 18 && p.y > c.y - 20) collectCrate(c);
      // crumbling ledges
      for (const [id, c] of crumble) {
        if (c.gone > 0) { c.gone -= dt; if (c.gone <= 0) crumble.delete(id); }
        else if (c.t > 0) { c.t += dt; if (c.t > 0.8) { c.gone = 3.2; c.t = 0; const pl = plats[id]; if (pl) { const pp = pos(pl); addParts(pp.x + pl.w / 2, pp.y, 14, { col: '#9a8a6a', sp: 260, vy: 80 }); } } }
      }
      updateSwing(dt);
      // progress and the top
      p.pct = myPct(); if (p.pct > p.peak) p.peak = p.pct;
      const gl = map.goal;
      if (!p.finished && p.grounded && p.standing && p.standing.deco === 'goal') finish();
      void gl;
    }
    function finish() {
      me.finished = true; finishedAt = t; sfx.win(); bigMsg = { text: '🏔️ YOU REACHED THE TOP!', t: 3 };
      addParts(me.x, me.y - 30, 60, { col: '#ffd23f', sp: 700, life: 1.2 });
      phase = 'done'; hooks.onTop(Math.round(t * 1000));
    }

    function step(dt) {
      if (phase === 'countdown') { cdLeft -= dt; if (cdLeft <= 0) beginRun(); }
      if (phase === 'run' || phase === 'done') {
        if (hitStop > 0) { hitStop -= dt; return renderOnly(dt); }
        t += dt;
        updateEvents(dt);
        updateMe(dt);
        // remotes glide toward their latest position
        for (const r of remotes.values()) {
          r.x = lerp(r.x, r.tx, Math.min(1, dt * 14)); r.y = lerp(r.y, r.ty, Math.min(1, dt * 14)); r.flash = Math.max(0, r.flash - dt); r.run += Math.abs(r.vx || 0) * dt * 0.05;
        }
        // respawning crates
        for (const [id, back] of crateGone) if (t >= back) crateGone.delete(id);
        // net: my state 20x a second
        sendAcc += dt;
        if (sendAcc >= 0.05) {
          sendAcc = 0;
          hooks.send({ k: 's', x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, vx: Math.round(me.vx), f: me.face, sw: me.swing ? Math.round(swingK(me.swing) * 100) / 100 : -1, hp: Math.round(me.hp), mh: me.maxHp, g: me.grounded ? 1 : 0, sh: me.fx.shield > 0 ? 1 : 0, mg: me.fx.mega > 0 ? 1 : 0, st: me.stun > 0 ? 1 : 0, dd: me.dead > 0 ? 1 : 0, pk: Math.round(me.peak * 10) / 10, fin: me.finished ? 1 : 0, lo: [me.tung.id, me.bat.id], iv: me.inv > 0 ? 1 : 0, it: me.item ? me.item.icon : '' });
        }
        const pct = Math.floor(me.peak);
        if (pct > lastPct) { lastPct = pct; hooks.onProgress(pct, me.peak); }
      }
      updateFx(dt);
    }
    function updateFx(dt) {
      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt; }
      parts = parts.filter((p) => p.life > 0);
      for (const p of pops) p.t += dt;
      pops = pops.filter((p) => p.t < 1.1);
      shakeT = Math.max(0, shakeT - dt); flashT = Math.max(0, flashT - dt);
      if (bigMsg) { bigMsg.t -= dt; if (bigMsg.t <= 0) bigMsg = null; }
      // camera
      if (me) {
        const target = Math.min(me.y - VH * 0.6, 100 - VH), tg = Math.max(map.goal.y - 240, target);
        const k = Math.min(1, dt * (me.vy > 700 || me.dead > 0 ? 9 : me.vy < -500 ? 7 : 4.5));
        cam.y = lerp(cam.y, me.dead > 0 && me.dead > 0.7 ? cam.y : tg, k);
        const dz = evActive('dizzy') ? Math.sin(t * 1.7) * 0.11 : 0;
        cam.rot = lerp(cam.rot, dz, Math.min(1, dt * 5));
      }
    }
    function renderOnly(dt) { updateFx(dt); }

    function beginRun() {
      phase = 'run'; t = 0; runStartWall = performance.now(); sendAcc = 0; lastPct = -1; hooks.onStart && hooks.onStart();
    }

    // ------------ network input ------------
    function onNet(from, d) {
      if (!d || !map) return;
      const r = remotes.get(from); if (!r) return;
      if (d.k === 's') {
        r.tx = d.x; r.ty = d.y; if (!r.seen) { r.x = d.x; r.y = d.y; r.seen = true; }
        r.vx = d.vx; r.face = d.f; r.sw = d.sw; r.hp = d.hp; r.maxHp = d.mh; r.grounded = !!d.g; r.shield = !!d.sh; r.mega = !!d.mg; r.stunned = !!d.st; r.dead = !!d.dd; r.peak = d.pk; r.pct = clamp((-d.y / map.height) * 100, 0, 100); r.fin = !!d.fin; r.inv = !!d.iv; r.itemIcon = d.it;
        if (d.lo && (r.tung.id !== d.lo[0] || r.bat.id !== d.lo[1])) { r.tung = L.TUNGS[d.lo[0]] || r.tung; r.bat = L.BATS[d.lo[1]] || r.bat; }
      } else if (d.k === 'hit' && d.to === me.id) {
        const kb = d.kb / 1, dir = d.d || 1;
        const hit = hurt(d.dmg, { vx: dir * kb * 0.95, vy: -kb * 0.62, stun: d.st, slow: d.sl, inv: 0.55 });
        if (hit) { r.flash = 0.1; }
      } else if (d.k === 'fx') {
        if (d.type === 'ink') { me.fx.ink = Math.max(me.fx.ink, d.dur); for (let i = 0; i < 9; i++) ink.push({ x: 60 + Math.random() * 840, y: 40 + Math.random() * 520, r: 40 + Math.random() * 90, a: 1, w: Math.random() * 6 }); pop('INKED!', me.x, me.y - 60, '#aab', true); }
        if (d.type === 'invert') { me.fx.invert = Math.max(me.fx.invert, d.dur); pop('INVERTED!', me.x, me.y - 60, '#ffb3f0', true); }
        sfx.warn();
      } else if (d.k === 'pick') crateGone.set(d.c, t + 14);
      else if (d.k === 'peel') peels.push({ id: d.id, x: d.x, y: d.y, owner: from, born: t });
      else if (d.k === 'peelx') { const i = peels.findIndex((p) => p.id === d.id); if (i >= 0) peels.splice(i, 1); }
    }

    // ------------ drawing ------------
    const lerpCol = (a, b, k) => { const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16)); return 'rgb(' + pa.map((v, i) => Math.round(lerp(v, pb[i], k))).join(',') + ')'; };
    function skyAt(f) { const s = map.theme.sky; f = clamp(f, 0, 1); return f < 0.5 ? lerpCol(s[0], s[1], f * 2) : lerpCol(s[1], s[2], (f - 0.5) * 2); }
    function drawBackground() {
      const f = clamp((-(cam.y + VH / 2)) / map.height, 0, 1);
      const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, skyAt(f + 0.14)); g.addColorStop(1, skyAt(f - 0.1));
      ctx.fillStyle = g; ctx.fillRect(-60, -60, VW + 120, VH + 120);
      if (f > 0.42) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (f - 0.42) * 2.4)})`; for (let i = 0; i < 70; i++) { const sx = (i * 137.5) % VW, sy = ((i * 91.3) % VH); ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1); } }
      // parallax silhouettes
      for (const d of deco) {
        const par = 0.35, sy = d.y * par - cam.y * par + VH * 0.65 + (cam.y * 0.0);
        const y = d.y - cam.y * (1 - par) - (0) ; void y;
        const yy = (d.y - cam.y) * par + VH * 0.35 + cam.y * 0.0;
        void sy;
        if (yy < -d.h - 40 || yy > VH + 40) continue;
        ctx.fillStyle = `rgba(0,0,0,${0.1 + d.tone * 0.12})`;
        const th = map.id;
        if (th === 'frost' || th === 'volcano') { ctx.beginPath(); ctx.moveTo(d.x - d.w, yy + d.h); ctx.lineTo(d.x, yy); ctx.lineTo(d.x + d.w, yy + d.h); ctx.fill(); }
        else if (th === 'clouds') { ctx.fillStyle = `rgba(255,255,255,${0.2 + d.tone * 0.2})`; ctx.beginPath(); ctx.ellipse(d.x, yy + 30, d.w * 0.6, 26, 0, 0, 7); ctx.ellipse(d.x + d.w * 0.3, yy + 20, d.w * 0.4, 30, 0, 0, 7); ctx.fill(); }
        else { ctx.fillRect(d.x - d.w / 2, yy, d.w, d.h); if (d.k > 0.5) { ctx.fillStyle = `rgba(255,220,120,${0.15 + d.tone * 0.2})`; for (let wy = yy + 14; wy < yy + d.h - 10; wy += 22) for (let wx = d.x - d.w / 2 + 8; wx < d.x + d.w / 2 - 10; wx += 18) if (((wx * 7 + wy * 13) | 0) % 5 < 2) ctx.fillRect(wx, wy, 7, 9); } }
      }
    }
    const DECO_COL = { car: ['#c0392b', '#2e86c1', '#d4ac0d', '#27ae60', '#7d3c98'], couch: ['#a04040', '#406080'], fridge: ['#e8e8ee'], barrel: ['#2f7d4a', '#a04a2a'], crate: ['#b9803c'], tire: ['#222'], girder: ['#e8892b'], cone: ['#ff7a1a'], pipe: ['#5a8a6a'], ice: ['#bfe9ff'], snow: ['#f4faff'], rock: ['#6e6a66', '#7a5a4a'], sign: ['#ff4fd8', '#4fd8ff', '#ffe24f'], screen: ['#1d2a44'], vent: ['#586070'], lava: ['#3a2020'], bone: ['#efe3c8'], cloud: ['#ffffff'], balloon: ['#ff7a9a'], rest: ['#c9954f'], goal: ['#ffd23f'], ground: ['#5a4a3a'], spring: ['#ff6b5e'] };
    function drawPlat(pl) {
      const pp = pos(pl); let { x, y } = pp; const w = pl.w, h = pl.kind === 'block' ? pl.h : 28, thin = !!pl.thin;
      const cs = crumble.get(pl.id);
      if (cs && cs.gone > 0) return;
      if (cs && cs.t > 0) { x += (Math.random() - 0.5) * 3; y += Math.random() * 2; }
      const cols = DECO_COL[pl.deco] || ['#8a7a6a'], col = cols[pl.id % cols.length];
      ctx.save();
      if (thin) ctx.globalAlpha = 0.62; // see-through: you can jump up through these
      ctx.fillStyle = col;
      if (pl.deco === 'ground') { ctx.fillStyle = map.id === 'frost' ? '#e8f4ff' : map.id === 'volcano' ? '#2a1612' : '#4e3a2a'; ctx.fillRect(x, y, w, 70); ctx.fillStyle = map.theme.accent; ctx.fillRect(x, y, w, 7); ctx.restore(); return; }
      switch (pl.deco) {
        case 'car': { ctx.beginPath(); ctx.roundRect(x, y, w, 22, 7); ctx.fill(); ctx.fillStyle = 'rgba(160,220,255,.8)'; ctx.fillRect(x + 10, y + 5, Math.min(30, w / 4), 10); ctx.fillRect(x + w - 40, y + 5, 30, 10); ctx.fillStyle = '#111'; for (const wx of [x + 22, x + w - 22]) { ctx.beginPath(); ctx.arc(wx, y + 24, 8, 0, 7); ctx.fill(); } break; }
        case 'tire': { for (let tx = x; tx < x + w - 10; tx += 34) { ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.roundRect(tx, y, 34, 26, 12); ctx.fill(); ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(tx + 17, y + 13, 5, 0, 7); ctx.fill(); } break; }
        case 'fridge': ctx.beginPath(); ctx.roundRect(x, y, w, 26, 5); ctx.fill(); ctx.fillStyle = '#9aa'; ctx.fillRect(x + w * 0.5 - 1, y + 3, 2, 20); ctx.fillStyle = '#aab'; ctx.fillRect(x + 6, y + 4, 4, 10); break;
        case 'barrel': for (let bx = x; bx < x + w - 14; bx += 30) { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(bx, y, 30, 28, 6); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(bx, y + 8, 30, 3); ctx.fillRect(bx, y + 18, 30, 3); } break;
        case 'couch': ctx.beginPath(); ctx.roundRect(x, y, w, 22, 8); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x + w / 2 - 1, y + 2, 2, 18); ctx.beginPath(); ctx.roundRect(x - 4, y - 4, 18, 30, 6); ctx.roundRect(x + w - 14, y - 4, 18, 30, 6); ctx.fill(); break;
        case 'girder': ctx.fillRect(x, y, w, 12); ctx.fillRect(x, y + 12, w, 4); ctx.strokeStyle = '#a85a10'; ctx.lineWidth = 3; ctx.beginPath(); for (let gx = x; gx < x + w; gx += 28) { ctx.moveTo(gx, y + 14); ctx.lineTo(gx + 14, y + 28); ctx.lineTo(gx + 28, y + 14); } ctx.stroke(); ctx.fillStyle = '#ffd9a0'; for (let gx = x + 6; gx < x + w; gx += 28) ctx.fillRect(gx, y + 3, 4, 4); break;
        case 'cone': case 'pipe': ctx.beginPath(); ctx.roundRect(x, y, w, 20, 8); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; for (let gx = x + 10; gx < x + w - 10; gx += 26) ctx.fillRect(gx, y, 8, 20); break;
        case 'crate': ctx.fillRect(x, y, w, 26); ctx.strokeStyle = '#6e4a1c'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, 23); ctx.beginPath(); for (let gx = x; gx < x + w; gx += 26) { ctx.moveTo(gx, y); ctx.lineTo(gx + 26, y + 26); } ctx.stroke(); break;
        case 'ice': case 'snow': ctx.fillStyle = pl.deco === 'snow' ? '#f4faff' : 'rgba(180,230,255,.92)'; ctx.beginPath(); ctx.roundRect(x, y, w, 26, 9); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.fillRect(x + 8, y + 3, w * 0.4, 4); break;
        case 'sign': case 'screen': { ctx.fillStyle = '#10122a'; ctx.beginPath(); ctx.roundRect(x, y, w, 24, 6); ctx.fill(); ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.fillStyle = col; ctx.fillRect(x + 6, y + 6, w - 12, 5); ctx.fillRect(x + 6, y + 15, (w - 12) * 0.6, 4); ctx.shadowBlur = 0; break; }
        case 'vent': ctx.fillRect(x, y, w, 22); ctx.fillStyle = '#2a3040'; for (let gx = x + 6; gx < x + w - 6; gx += 10) ctx.fillRect(gx, y + 5, 5, 13); break;
        case 'lava': ctx.beginPath(); ctx.roundRect(x, y, w, 26, 8); ctx.fill(); ctx.shadowColor = '#ff6a2a'; ctx.shadowBlur = 10; ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 10, y + 14); ctx.lineTo(x + w * 0.4, y + 8); ctx.lineTo(x + w * 0.6, y + 18); ctx.lineTo(x + w - 10, y + 10); ctx.stroke(); ctx.shadowBlur = 0; break;
        case 'bone': ctx.beginPath(); ctx.roundRect(x, y + 4, w, 14, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x + 4, y + 6, 8, 0, 7); ctx.arc(x + 4, y + 16, 8, 0, 7); ctx.arc(x + w - 4, y + 6, 8, 0, 7); ctx.arc(x + w - 4, y + 16, 8, 0, 7); ctx.fill(); break;
        case 'rock': ctx.beginPath(); ctx.moveTo(x, y + 26); ctx.lineTo(x + 6, y + 2); ctx.lineTo(x + w - 8, y); ctx.lineTo(x + w, y + 24); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 12, y + 3, w * 0.5, 4); break;
        case 'cloud': case 'balloon': ctx.fillStyle = '#fff'; for (let cx = x + 12; cx < x + w - 6; cx += 18) { ctx.beginPath(); ctx.arc(cx, y + 8 + Math.sin(cx) * 2, 12, 0, 7); ctx.fill(); } ctx.fillRect(x + 6, y + 8, w - 12, 12); ctx.fillStyle = 'rgba(150,180,220,.35)'; ctx.fillRect(x + 6, y + 16, w - 12, 5); break;
        case 'rest': ctx.beginPath(); ctx.roundRect(x, y, w, 26, 6); ctx.fill(); ctx.fillStyle = '#8c5a2a'; ctx.fillRect(x, y + 20, w, 6); ctx.fillStyle = map.theme.accent; for (let fx = x + 24; fx < x + w; fx += 60) { ctx.fillRect(fx, y - 34, 3, 34); ctx.beginPath(); ctx.moveTo(fx + 3, y - 34); ctx.lineTo(fx + 22, y - 27); ctx.lineTo(fx + 3, y - 20); ctx.fill(); } break;
        case 'goal': ctx.beginPath(); ctx.roundRect(x, y, w, 28, 8); ctx.fill(); ctx.fillStyle = '#fff3a8'; ctx.fillRect(x + 8, y + 3, w - 16, 5); ctx.fillStyle = '#b8860b'; ctx.fillRect(x, y + 22, w, 6); break;
        case 'spring': ctx.fillStyle = '#ddd'; ctx.fillRect(x + w * 0.2, y + 8, w * 0.6, 16); ctx.strokeStyle = '#999'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(x + w * 0.2, y + 9 + i * 4); ctx.lineTo(x + w * 0.8, y + 11 + i * 4); } ctx.stroke(); ctx.fillStyle = '#ff6b5e'; ctx.beginPath(); ctx.roundRect(x, y, w, 10, 5); ctx.fill(); break;
        default: ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
      }
      if (pl.kind === 'conv') { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x, y, w, 5); ctx.fillStyle = '#ffe45e'; const o = ((t * 60 * pl.dirc) % 20 + 20) % 20; for (let cx = x - 20 + o; cx < x + w; cx += 20) { ctx.beginPath(); const a = Math.max(x, cx), b = Math.min(x + w, cx + 10); if (b > a) ctx.fillRect(a, y + 1, b - a, 3); } }
      if (pl.kind === 'ice') { ctx.fillStyle = 'rgba(200,240,255,.55)'; ctx.fillRect(x, y, w, 5); }
      if (pl.kind === 'crumble') { ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w * 0.25, y); ctx.lineTo(x + w * 0.3, y + 12); ctx.lineTo(x + w * 0.22, y + 24); ctx.moveTo(x + w * 0.7, y); ctx.lineTo(x + w * 0.66, y + 10); ctx.stroke(); }
      if (thin) { ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.strokeRect(x + 1, y + 1, w - 2, 24); ctx.setLineDash([]); }
      else if (pl.kind !== 'block' && pl.deco !== 'ground') { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x + 3, y + 22, w - 6, 4); } // a darker underside: this one is solid
      if (evActive('ice') && pl.kind !== 'ice') { ctx.fillStyle = 'rgba(190,235,255,.55)'; ctx.fillRect(x, y - 1, w, 6); }
      ctx.restore();
    }
    function drawCrate(c) {
      const gone = crateGone.get(c.id); if (gone) return;
      const bob = Math.sin(t * 3 + c.id) * 3;
      ctx.save(); ctx.translate(c.x, c.y + bob); ctx.rotate(Math.sin(t * 2 + c.id) * 0.08);
      ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 14; ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.roundRect(-14, -14, 28, 28, 6); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#7a4a00'; ctx.font = '900 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 1);
      ctx.restore();
    }
    function drawHazard(h) {
      if (h.kind === 'spike') { ctx.fillStyle = '#cfd3da'; for (let sx = h.x; sx < h.x + h.w; sx += 14) { ctx.beginPath(); ctx.moveTo(sx, h.y + h.h); ctx.lineTo(sx + 7, h.y); ctx.lineTo(sx + 14, h.y + h.h); ctx.fill(); } }
      else if (h.kind === 'swing') {
        const b = M.swingPos(h, t);
        ctx.strokeStyle = '#444'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(h.px, h.py); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.arc(h.px, h.py, 8, 0, 7); ctx.fill();
        ctx.fillStyle = '#555a66'; ctx.beginPath(); ctx.arc(b.x, b.y, h.r, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(b.x - 7, b.y - 7, 7, 0, 7); ctx.fill();
        ctx.fillStyle = '#c0392b'; ctx.fillRect(b.x - h.r * 0.5, b.y - 3, h.r, 6);
      } else if (h.kind === 'fan') {
        ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
        for (let i = 0; i < 7; i++) { const yy = h.y + h.h - ((t * 140 + i * 50) % h.h); ctx.beginPath(); ctx.moveTo(h.x + 10 + (i * 29) % (h.w - 20), yy); ctx.lineTo(h.x + 10 + (i * 29) % (h.w - 20), yy - 24); ctx.stroke(); }
        ctx.fillStyle = '#3a3f4a'; ctx.fillRect(h.x - 4, h.y + h.h, h.w + 8, 8);
      }
    }
    function drawBat(p, k, sc, alpha) {
      const g = batGeom(p, k < 0 ? 0 : k, sc), mega = p.fx ? p.fx.mega > 0 : p.mega; void mega;
      const b = p.bat, thick = (b.id === 'heavy' ? 13 : b.id === 'twig' ? 4 : b.id === 'noodle' ? 5 : 8) * (g.len > b.reach * 1.5 ? 1.4 : 1);
      ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round';
      const mx = lerp(g.hx, g.tx, 0.5), my = lerp(g.hy, g.ty, 0.5);
      if (b.id === 'noodle') { ctx.strokeStyle = b.dark; ctx.lineWidth = thick + 2; ctx.beginPath(); ctx.moveTo(g.hx, g.hy); ctx.quadraticCurveTo(mx + Math.cos(t * 12) * 10, my + 8, g.tx, g.ty); ctx.stroke(); ctx.strokeStyle = b.col; ctx.lineWidth = thick - 1; ctx.stroke(); }
      else { ctx.strokeStyle = b.dark; ctx.lineWidth = thick + 3; ctx.beginPath(); ctx.moveTo(g.hx, g.hy); ctx.lineTo(g.tx, g.ty); ctx.stroke(); ctx.strokeStyle = b.col; ctx.lineWidth = thick; ctx.beginPath(); ctx.moveTo(lerp(g.hx, g.tx, 0.2), lerp(g.hy, g.ty, 0.2)); ctx.lineTo(g.tx, g.ty); ctx.stroke(); }
      if (b.id === 'mallet') { ctx.fillStyle = b.col; ctx.strokeStyle = b.dark; ctx.lineWidth = 3; ctx.save(); ctx.translate(g.tx, g.ty); ctx.rotate(Math.atan2(g.ty - g.hy, g.tx - g.hx)); ctx.beginPath(); ctx.roundRect(-6, -14, 16, 28, 4); ctx.fill(); ctx.stroke(); ctx.restore(); }
      if (b.id === 'frost') { ctx.fillStyle = '#e8f9ff'; ctx.beginPath(); ctx.arc(g.tx, g.ty, 9, 0, 7); ctx.fill(); ctx.strokeStyle = b.dark; ctx.lineWidth = 2; ctx.stroke(); }
      if (b.id === 'heavy') { ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; for (let i = 1; i < 4; i++) { const f = 0.25 * i; ctx.beginPath(); ctx.moveTo(lerp(g.hx, g.tx, f) - 4, lerp(g.hy, g.ty, f)); ctx.lineTo(lerp(g.hx, g.tx, f) + 4, lerp(g.hy, g.ty, f) + 3); ctx.stroke(); } }
      // swing streak
      if (k > 0.22 && k < 0.78) { ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.beginPath(); const a0 = swingAngle(Math.max(0.22, k - 0.12)); for (let i = 0; i <= 6; i++) { const aa = lerp(a0, g.a, i / 6); ctx.lineTo(g.hx + Math.sin(aa) * p.face * g.len * 0.95, g.hy - Math.cos(aa) * g.len * 0.95); } ctx.stroke(); }
      ctx.restore();
    }
    function drawHat(p, cx, topY) {
      const hat = p.tung.hat; if (!hat) return;
      ctx.save();
      if (hat === 'crown') { ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 11, topY + 2); ctx.lineTo(cx - 11, topY - 10); ctx.lineTo(cx - 5, topY - 4); ctx.lineTo(cx, topY - 13); ctx.lineTo(cx + 5, topY - 4); ctx.lineTo(cx + 11, topY - 10); ctx.lineTo(cx + 11, topY + 2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if (hat === 'halo') { ctx.strokeStyle = 'rgba(255,255,170,.9)'; ctx.lineWidth = 3; ctx.shadowColor = '#ffffaa'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.ellipse(cx, topY - 6, 11, 4, 0, 0, 7); ctx.stroke(); }
      else if (hat === 'helmet') { ctx.fillStyle = '#9aa4b0'; ctx.strokeStyle = '#4a5460'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, topY + 4, 13, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if (hat === 'cap') { ctx.fillStyle = '#1d6fd6'; ctx.beginPath(); ctx.arc(cx, topY + 3, 11, Math.PI, 0); ctx.fill(); ctx.fillRect(cx, topY + 1, 15, 4); }
      else if (hat === 'sprout') { ctx.strokeStyle = '#2f9d3f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, topY + 2); ctx.quadraticCurveTo(cx - 2, topY - 8, cx + 4, topY - 12); ctx.stroke(); ctx.fillStyle = '#5fd36a'; ctx.beginPath(); ctx.ellipse(cx + 8, topY - 12, 8, 4, -0.5, 0, 7); ctx.ellipse(cx - 5, topY - 8, 7, 4, 0.6, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    function drawTung(p, isMe) {
      const alpha = (p.inv > 0 || p.iv) && Math.floor(t * 18) % 2 ? 0.45 : 1;
      if (p.dead && isMe) return; if (p.dead) return;
      const sh = 58, cy = p.y - 26, fl = p.face < 0;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 14, 4, 0, 0, 7); ctx.fill();
      const sw = isMe ? (p.swing ? swingK(p.swing) : -1) : p.sw;
      const stunned = isMe ? p.stun > 0 : p.stunned;
      const air = !p.grounded;
      const pal = p.tung.pal === 'brown' ? {} : { pal: p.tung.pal };
      TA.draw(ctx, p.x, cy, sh, { ...pal, flip: fl, rot: (stunned ? Math.sin(t * 30) * 0.2 : clamp((p.vx || 0) / 1500, -0.15, 0.15) + (air ? clamp((p.vy || 0) / 4000, -0.1, 0.1) : 0)) , eyes: stunned ? 'x' : 'normal', mouth: stunned ? 'sad' : sw >= 0 ? 'open' : air ? 'oh' : 'smile', look: [0.5, air ? (p.vy < 0 ? -0.4 : 0.4) : 0.1], legs: p.grounded ? p.run : 0.25, parts: { legs: true, armFar: true, face: true, bat: false } });
      // tinted body overlay for flash
      if (p.flash > 0) { ctx.globalAlpha = p.flash * 3; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(p.x - 12, p.y - 50, 24, 48, 9); ctx.fill(); ctx.globalAlpha = alpha; }
      drawHat(p, p.x, p.y - 52);
      // bat: rests on the shoulder, swings when attacking
      const k = sw >= 0 ? sw : -1;
      drawBat(p, k >= 0 ? k : 0.0, 1, alpha);
      if (p.fx ? p.fx.shield > 0 : p.shield) { ctx.globalAlpha = 0.5; ctx.fillStyle = 'rgba(120,210,255,.25)'; ctx.strokeStyle = '#7ad3ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y - 24, 36, 0, 7); ctx.fill(); ctx.stroke(); }
      ctx.restore();
      // name + hp
      ctx.save(); ctx.textAlign = 'center'; ctx.font = '800 12px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      const ny = p.y - 76; ctx.strokeText(p.name, p.x, ny); ctx.fillStyle = isMe ? '#ffe27a' : '#fff'; ctx.fillText(p.name, p.x, ny);
      const hp = clamp(p.hp / (p.maxHp || 100), 0, 1); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(p.x - 18, ny + 4, 36, 5); ctx.fillStyle = hp > 0.5 ? '#5fe07a' : hp > 0.25 ? '#ffd23f' : '#ff5a4a'; ctx.fillRect(p.x - 18, ny + 4, 36 * hp, 5);
      if (!isMe && p.itemIcon) { ctx.font = '14px sans-serif'; ctx.fillText(p.itemIcon, p.x + 26, ny + 8); }
      ctx.restore();
      if (isMe && p.fx.rocket > 0) { ctx.fillStyle = '#ff9d00'; ctx.beginPath(); ctx.moveTo(p.x - 6, p.y); ctx.lineTo(p.x, p.y + 26 + Math.random() * 12); ctx.lineTo(p.x + 6, p.y); ctx.fill(); }
      if (p.hook) { ctx.strokeStyle = '#d9d2c0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y - 30); ctx.lineTo(p.hook.tx, p.hook.ty); ctx.stroke(); ctx.fillStyle = '#9aa'; ctx.beginPath(); ctx.arc(p.hook.tx, p.hook.ty, 6, 0, 7); ctx.fill(); }
    }
    function drawEventsWorld() {
      for (const m of meteors) { ctx.save(); ctx.translate(m.x, m.y); ctx.fillStyle = '#ff7a2a'; ctx.shadowColor = '#ff6a00'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(0, 0, m.r, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,200,80,.5)'; ctx.beginPath(); ctx.moveTo(-m.r * 0.8, 0); ctx.lineTo(-m.vx * 0.06, -m.vy * 0.06); ctx.lineTo(m.r * 0.8, 0); ctx.fill(); ctx.restore(); }
      for (const b of bananas) { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.font = '26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🍌', 0, 0); ctx.restore(); }
      for (const l of lightning) {
        const pre = clamp((t - l.t0) / (l.t1 - l.t0), 0, 1);
        if (t < l.t1) { ctx.strokeStyle = `rgba(255,255,120,${0.25 + pre * 0.5})`; ctx.lineWidth = 2 + pre * 4; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.moveTo(l.x, cam.y - 10); ctx.lineTo(l.x, cam.y + VH + 10); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = `rgba(255,255,160,${0.2 + pre * 0.4})`; ctx.beginPath(); ctx.ellipse(l.x, me.y, 40 * pre, 10 * pre, 0, 0, 7); ctx.fill(); }
        else { ctx.strokeStyle = '#fff'; ctx.shadowColor = '#aaf'; ctx.shadowBlur = 20; ctx.lineWidth = 6; ctx.beginPath(); let yy = cam.y - 10, xx = l.x; ctx.moveTo(xx, yy); while (yy < cam.y + VH + 10) { yy += 40; xx = l.x + (Math.sin(yy * 0.31 + l.t0) * 22); ctx.lineTo(xx, yy); } ctx.stroke(); ctx.shadowBlur = 0; }
      }
      if (tornado) { ctx.save(); ctx.translate(tornado.x, tornado.y); for (let i = 0; i < 14; i++) { const f = i / 13, yy = -380 * (1 - f) + 130 * f - 0, ww = 20 + (1 - f) * 90 * 0.55 + 10; const xo = Math.sin(tornado.spin + i * 0.7) * 14; ctx.strokeStyle = `rgba(230,235,245,${0.35 + f * 0.3})`; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(xo, yy + 0, ww, 9, 0, 0, 7); ctx.stroke(); } ctx.restore(); }
      for (const s of sweeps) {
        if (t < s.t0) { ctx.fillStyle = `rgba(255,60,50,${0.18 + 0.12 * Math.sin(t * 20)})`; ctx.fillRect(0, s.y - 52, VW, 104); }
        else { const k = (t - s.t0) / s.dur, bx = s.dir > 0 ? -150 + k * 1260 : 1110 - k * 1260; ctx.save(); ctx.translate(bx, s.y); ctx.scale(s.dir, 1); ctx.fillStyle = '#d9a566'; ctx.strokeStyle = '#6b4a1e'; ctx.lineWidth = 6; ctx.beginPath(); ctx.roundRect(-80, -50, 170, 100, 40); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#8c5a2a'; ctx.fillRect(-200, -18, 130, 36); ctx.restore(); }
      }
      for (const pe of peels) { ctx.save(); ctx.translate(pe.x, pe.y - 8); ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🍌', 0, 0); ctx.restore(); }
    }
    function drawOverlays() {
      // ink blobs
      for (const b of ink) { ctx.save(); ctx.globalAlpha = Math.min(0.96, b.a * 1.3); ctx.fillStyle = '#10101c'; ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * 0.85, b.w, 0, 7); ctx.ellipse(b.x + b.r * 0.6, b.y + b.r * 0.3, b.r * 0.5, b.r * 0.4, 0, 0, 7); ctx.ellipse(b.x - b.r * 0.5, b.y - b.r * 0.5, b.r * 0.35, b.r * 0.3, 0, 0, 7); ctx.fill(); ctx.restore(); }
      if (evActive('blackout')) {
        const sx = me.x, sy = me.y - cam.y - 26;
        const g = ctx.createRadialGradient(sx, sy, 40, sx, sy, 190); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.96)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
      }
      if (flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${flashT * 4})`; ctx.fillRect(0, 0, VW, VH); }
      if (me.flash > 0) { ctx.fillStyle = `rgba(255,60,40,${me.flash * 1.2})`; ctx.fillRect(0, 0, VW, VH); }
      if (me.fx.invert > 0 || evActive('invert')) { ctx.fillStyle = 'rgba(255,0,200,.08)'; ctx.fillRect(0, 0, VW, VH); }
    }
    function drawHud() {
      ctx.save(); ctx.textBaseline = 'middle';
      // health bar
      const hp = clamp(me.hp / me.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.roundRect(12, 12, 220, 26, 10); ctx.fill();
      ctx.fillStyle = hp > 0.5 ? '#5fe07a' : hp > 0.25 ? '#ffd23f' : '#ff5a4a'; ctx.beginPath(); ctx.roundRect(15, 15, 214 * hp, 20, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 13px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('❤ ' + Math.ceil(me.hp) + ' / ' + me.maxHp, 22, 26);
      // item slot
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.roundRect(12, 44, 64, 64, 12); ctx.fill();
      ctx.strokeStyle = me.item ? '#ffd23f' : 'rgba(255,255,255,.2)'; ctx.lineWidth = 3; ctx.stroke();
      if (me.item) { ctx.font = '34px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(me.item.icon, 44, 78); ctx.font = '800 11px sans-serif'; ctx.fillStyle = '#ffe27a'; ctx.fillText('K / E', 44, 100); ctx.textAlign = 'left'; ctx.font = '800 13px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(me.item.name, 84, 62); ctx.font = '600 11px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(me.item.desc.slice(0, 40), 84, 80); }
      else { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('NO ITEM', 44, 78); }
      // active effect chips
      let cx = 12; const chips = [['rocket', '🚀'], ['spring', '🦘'], ['shield', '🛡️'], ['mega', '🏏'], ['soda', '🥤'], ['feather', '🪶'], ['invert', '🙃'], ['ink', '🦑']];
      for (const [k, ic] of chips) if (me.fx[k] > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.roundRect(cx, 116, 46, 24, 8); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(ic + Math.ceil(me.fx[k]), cx + 5, 129); cx += 50; }
      // altitude bar on the right
      const bx = VW - 26, by = 40, bh = VH - 80;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.roundRect(bx - 6, by - 12, 24, bh + 24, 10); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(bx + 4, by, 4, bh);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(bx - 2, by - 2, 16, 4); ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⛳', bx + 6, by - 20);
      const dot = (pct, col, label, r = 6) => { const yy = by + bh - (clamp(pct, 0, 100) / 100) * bh; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(bx + 6, yy, r, 0, 7); ctx.fill(); if (label) { ctx.fillStyle = '#fff'; ctx.font = '700 10px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(label, bx - 10, yy); } };
      for (const r of remotes.values()) if (r.seen) dot(r.pct, '#4cc9f0', r.name.slice(0, 8), 5);
      dot(me.pct, '#ffd23f', 'YOU', 7);
      // event banner
      if (banner) {
        const e = L.EVENTS[banner.e.id];
        const w = 460, x = (VW - w) / 2, y = 14, a = banner.warn ? 0.6 + 0.4 * Math.sin(t * 14) : 1;
        ctx.globalAlpha = a; ctx.fillStyle = banner.warn ? 'rgba(180,30,20,.85)' : 'rgba(20,20,40,.78)'; ctx.beginPath(); ctx.roundRect(x, y, w, 52, 14); ctx.fill();
        ctx.strokeStyle = banner.warn ? '#ffb3a8' : '#ffd23f'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '900 18px sans-serif'; ctx.fillText((banner.warn ? '⚠ INCOMING: ' : '') + e.icon + ' ' + e.name, VW / 2, y + 18);
        ctx.font = '600 12px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(banner.warn ? `starts in ${Math.max(0, banner.e.t0 - t).toFixed(1)}s` : e.tip, VW / 2, y + 38);
        if (!banner.warn) { const left = clamp((banner.e.t0 + banner.e.dur - t) / banner.e.dur, 0, 1); ctx.fillStyle = '#ffd23f'; ctx.fillRect(x + 12, y + 47, (w - 24) * left, 3); }
      }
      if (bigMsg) { ctx.globalAlpha = Math.min(1, bigMsg.t); ctx.font = '900 44px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 8; ctx.strokeStyle = '#111'; ctx.strokeText(bigMsg.text, VW / 2, VH * 0.4); ctx.fillStyle = '#ffd23f'; ctx.fillText(bigMsg.text, VW / 2, VH * 0.4); ctx.globalAlpha = 1; }
      if (phase === 'countdown') { const n = Math.ceil(cdLeft - 0.45); ctx.font = '900 120px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 12; ctx.strokeStyle = '#111'; ctx.strokeText(n > 0 ? n : 'GO!', VW / 2, VH * 0.4); ctx.fillStyle = '#ffd23f'; ctx.fillText(n > 0 ? n : 'GO!', VW / 2, VH * 0.4); }
      ctx.restore();
    }
    function render() {
      if (!map || !me) { ctx.fillStyle = '#10141c'; ctx.fillRect(0, 0, VW, VH); return; }
      ctx.save();
      ctx.translate(VW / 2, VH / 2); ctx.rotate(cam.rot); ctx.translate(-VW / 2, -VH / 2);
      const sx = shakeT > 0 ? (Math.random() - 0.5) * 12 * Math.min(1, shakeT * 3) : 0, sy = shakeT > 0 ? (Math.random() - 0.5) * 12 * Math.min(1, shakeT * 3) : 0;
      ctx.translate(sx, sy);
      drawBackground();
      ctx.translate(0, -cam.y);
      const top = cam.y - 80, bot = cam.y + VH + 80;
      // walls
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(0, top, 14, bot - top); ctx.fillRect(VW - 14, top, 14, bot - top);
      ctx.fillStyle = map.theme.accent; ctx.globalAlpha = 0.35; ctx.fillRect(12, top, 3, bot - top); ctx.fillRect(VW - 15, top, 3, bot - top); ctx.globalAlpha = 1;
      for (const h of map.hazards) { const yy = h.kind === 'swing' ? h.py - 10 : h.y; if (yy < bot && (h.kind === 'swing' ? h.py + h.len + 40 : h.y + (h.h || 30)) > top) drawHazard(h); }
      for (const pl of plats) { const pp = pos(pl); if (pp.y > bot || pp.y + (pl.h || 30) + 60 < top) continue; drawPlat(pl); }
      // goal statue
      { const g = map.goal; if (g.y > top - 200 && g.y < bot + 200) { TA.draw(ctx, g.x + g.w / 2, g.y - 70, 150, { pal: 'gold', mouth: 'open', bat: 0.4 }); ctx.fillStyle = '#ffd23f'; ctx.font = '900 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('THE TOP!', g.x + g.w / 2, g.y - 170); } }
      for (const c of map.crates) if (c.y > top && c.y < bot) drawCrate(c);
      drawEventsWorld();
      for (const r of remotes.values()) if (r.seen && r.y > top - 100 && r.y < bot + 100) drawTung(r, false);
      drawTung(me, true);
      for (const p of parts) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      for (const p of pops) { ctx.save(); ctx.globalAlpha = 1 - p.t / 1.1; ctx.font = (p.big ? '900 22px' : '800 15px') + ' sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#111'; const yy = p.y - p.t * 50; ctx.strokeText(p.text, p.x, yy); ctx.fillStyle = p.col; ctx.fillText(p.text, p.x, yy); ctx.restore(); }
      ctx.translate(0, cam.y);
      drawOverlays();
      ctx.restore();
      drawHud();
    }

    // ------------ loop and API ------------
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
      const n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
      for (let i = 0; i < n; i++) step(h);
      render();
    }
    function startLoop() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
    function stopLoop() { cancelAnimationFrame(raf); raf = 0; }
    const api = {
      setup, startLoop, stopLoop, onNet,
      beginCountdown(sec) { phase = 'countdown'; cdLeft = sec; },
      beginNow() { beginRun(); },
      stop() { if (phase === 'run') phase = 'idle'; },
      setPhase(p) { phase = p; },
      get phase() { return phase; },
      get time() { return t; },
      get me() { return me; },
      get remotes() { return remotes; },
      get pct() { return me ? me.pct : 0; },
      key(code, down) {
        const left = ['ArrowLeft', 'KeyA'], right = ['ArrowRight', 'KeyD'], jump = ['ArrowUp', 'KeyW', 'Space'], dn = ['ArrowDown', 'KeyS'];
        if (left.includes(code)) input.l = down; else if (right.includes(code)) input.r = down; else if (jump.includes(code)) { if (down && !input.jump) input.jumpBuf = 0.13; input.jump = down; } else if (dn.includes(code)) input.down = down;
        else if (down && ['KeyJ', 'KeyX'].includes(code)) input.swingBuf = 0.15; else if (down && ['KeyK', 'KeyE'].includes(code)) input.itemBuf = 0.15;
      },
      press(name, down) { if (name === 'l') input.l = down; if (name === 'r') input.r = down; if (name === 'jump') { if (down && !input.jump) input.jumpBuf = 0.13; input.jump = down; } if (name === 'down') input.down = down; if (name === 'swing' && down) input.swingBuf = 0.15; if (name === 'item' && down) input.itemBuf = 0.15; },
      sim(seconds, cb) { const n = Math.round(seconds * 120); for (let i = 0; i < n; i++) { if (i % 4 === 0 && cb) cb(); step(1 / 120); if (phase === 'done') break; } }, // fast-forward for tests
      forceEvent(id) { const ev = L.EVENTS[id]; events.push({ n: 900 + events.length, id, t0: t + 0.05, dur: ev.dur, seed: 7 }); }, // for testing
      renderNow() { render(); },
      dbg() { return { me, map, t, phase, remotes, plats, input, fx: { meteors, bananas, lightning, tornado, sweeps, ink, peels, events } }; },
    };
    return api;
  }
  window.TUEngine = { create };
})();
