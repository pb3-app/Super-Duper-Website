/* Tung Tung Football: the rules and the players, with no screen. One browser (the host) runs this; everybody else only draws
   what view() says. Team 0 always attacks toward +x (the right), team 1 toward -x.

   const g = FootballSim.create({ quarterSecs, human: [true, false], names, level, rng })
   g.step(dt, [input0, input1])   input: { dx, dy, actN, swN, thrN, thrK, call }   (the *N fields are counters: a change = a press)
   g.view()                       everything the renderer needs (plain JSON)
   g.call(team, id)               pick a play: offence 'quick'|'mixed'|'deep'|'runL'|'runM'|'runR'|'fg'|'punt', defence 'cover2'|'man'|'blitz'|'prevent' */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.FootballSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const L = 120, W = 53.3, CY = W / 2, EZ = 10;
  const SPD = { QB: 6.6, RB: 8.0, WR: 8.4, TE: 7.5, OL: 5.4, DL: 7.0, LB: 7.9, CB: 8.8, S: 8.6 };
  const ROLES_OFF = ['QB', 'RB', 'OL', 'OL', 'OL', 'OL', 'OL', 'WR', 'WR', 'WR', 'TE'];
  const ROLES_DEF = ['DL', 'DL', 'DL', 'DL', 'LB', 'LB', 'LB', 'CB', 'CB', 'S', 'S'];
  const RECEIVERS = [7, 8, 9, 10, 1]; // keys 1 to 5 throw to these offensive slots
  const BALL_SPEED = 27, CLOCK_RATE = 2.5; // the game clock runs 2.5 times faster than real time, so a quarter is about 35 seconds of live play
  const OFF_PLAYS = {
    quick: { name: 'Quick Pass', kind: 'pass' }, mixed: { name: 'Mixed Routes', kind: 'pass' }, deep: { name: 'Deep Bombs', kind: 'pass' },
    runL: { name: 'Run Left', kind: 'run' }, runM: { name: 'Run Middle', kind: 'run' }, runR: { name: 'Run Right', kind: 'run' },
    fg: { name: 'Field Goal', kind: 'kick' }, punt: { name: 'Punt', kind: 'kick' },
  };
  const DEF_PLAYS = { cover2: { name: 'Cover 2 Zone' }, man: { name: 'Man Coverage' }, blitz: { name: 'Blitz' }, prevent: { name: 'Prevent Deep' } };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // routes: [forward yards, sideways yards]; `in` is +1 when the player starts on the side where the middle is toward +y
  function routeFor(play, slot, inn) {
    const R = {
      quick: { 7: [[3, 0], [8, 5 * inn]], 8: [[3, 0], [8, 5 * inn]], 9: [[5, 0], [5, -6 * inn]], 10: [[4, 0], [5, 7 * inn]], 1: [[-1, 0], [3, 9 * inn]] },
      mixed: { 7: [[10, 0], [10, -2 * inn], [10, 0]], 8: [[13, 0], [20, 8 * inn]], 9: [[8, 0], [14, 7 * inn]], 10: [[12, 0]], 1: [[0, 0], [4, 8 * inn]] },
      deep: { 7: [[36, 0]], 8: [[36, 2 * inn]], 9: [[8, 0], [30, 12 * inn]], 10: [[7, 0], [9, 7 * inn]], 1: [[1, 0], [4, 7 * inn]] },
    };
    return (R[play] && R[play][slot]) || [];
  }

  function create(opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const g = {
      rng, quarterSecs: opts.quarterSecs || 90, quarter: 1, clock: opts.quarterSecs || 90, score: [0, 0], names: opts.names || ['Tung FC', 'Cappuccino United'],
      human: opts.human || [true, false], level: opts.level || 'medium',
      off: 0, los: 35, fdl: 45, down: 1, toGo: 10, phase: 'call', phaseT: 0, callT: 14, calls: [null, null], text: '', textT: 0, lastPlay: '',
      players: [], ball: { x: 35, y: CY, z: 0, state: 'held', carrier: null }, P: null, endAfter: false, over: false, winner: -1, seq: 0, lastIn: [{}, {}],
      ctl: [null, null], kickAnim: null, firstQ: 0, plays: 0, stats: [0, 0], hist: [],
    };
    for (let t = 0; t < 2; t++) for (let k = 0; k < 11; k++) g.players.push({ id: t * 11 + k, team: t, k, role: '', x: 0, y: 0, vx: 0, vy: 0, sp: 0.94 + rng() * 0.12, mode: 'stand', route: [], ri: 0, assign: -1, eng: -1, engT: 0, free: false, stun: 0, dive: 0, dcd: 0, jukeT: 0, jcd: 0, zone: null, tcd: 0 });
    // the computer team's speed depends on the level
    const lv = { easy: 0.95, medium: 1, hard: 1.05 }[g.level] || 1;
    for (let k = 0; k < 11; k++) { const p = g.players[11 + k]; if (!g.human[1]) p.sp *= lv; }
    startDrive(g, 0, 35);
    const api = {
      g, step: (dt, ins) => step(g, dt, ins || []), view: () => view(g), call: (team, id) => setCall(g, team, id),
      offPlays: OFF_PLAYS, defPlays: DEF_PLAYS,
    };
    return api;
  }

  function startDrive(g, team, los) { g.off = team; g.los = los; const dir = team === 0 ? 1 : -1; g.fdl = clamp(los + dir * 10, EZ, L - EZ); g.down = 1; g.toGo = 10; g.calls = [null, null]; g.P = null; }
  const dirOf = (g) => (g.off === 0 ? 1 : -1);
  const goalOf = (g, team) => (team === 0 ? L - EZ : EZ); // the line a team scores on
  const yardLine = (x, team) => (team === 0 ? x - EZ : L - EZ - x); // yards from that team's own goal line

  // ---------------- calling plays ----------------
  function setCall(g, team, id) {
    if (g.phase !== 'call' || g.calls[team]) return false;
    const isOff = team === g.off;
    if (isOff ? !OFF_PLAYS[id] : !DEF_PLAYS[id]) return false;
    if (isOff && (id === 'fg' || id === 'punt') && false) return false;
    g.calls[team] = id; return true;
  }
  function cpuCall(g, team) {
    const r = g.rng, dir = dirOf(g);
    if (team !== g.off) {
      const toGo = g.toGo, w = toGo >= 10 ? [['cover2', 3], ['man', 3], ['blitz', 2], ['prevent', 2]] : toGo <= 3 ? [['cover2', 2], ['man', 3], ['blitz', 4], ['prevent', 0]] : [['cover2', 3], ['man', 3], ['blitz', 3], ['prevent', 1]];
      return pickW(w, r);
    }
    const toGoal = Math.abs(goalOf(g, g.off) - g.los);
    if (g.down === 4) {
      if (toGoal <= 38) return 'fg';
      if (g.toGo <= 2 && toGoal < 60) return pickW([['runM', 2], ['quick', 1]], r);
      return 'punt';
    }
    if (g.toGo >= 8) return pickW([['quick', 3], ['mixed', 3], ['deep', 2], ['runM', 1]], r);
    if (g.toGo <= 3) return pickW([['runL', 2], ['runM', 3], ['runR', 2], ['quick', 2], ['deep', 1]], r);
    return pickW([['quick', 2], ['mixed', 2], ['deep', 1], ['runL', 2], ['runM', 2], ['runR', 2]], r);
  }
  function pickW(list, r) { const t = list.reduce((n, x) => n + x[1], 0); let v = r() * t; for (const [id, w] of list) { if ((v -= w) < 0) return id; } return list[0][0]; }

  // ---------------- lining up ----------------
  function lineUp(g) {
    const dir = dirOf(g), los = g.los, offT = g.off, defT = 1 - g.off, oc = g.calls[offT], dc = g.calls[defT], kind = OFF_PLAYS[oc].kind;
    const O = g.players.slice(offT * 11, offT * 11 + 11), D = g.players.slice(defT * 11, defT * 11 + 11);
    const place = (p, fwd, y) => { p.x = los + dir * fwd; p.y = clamp(y, 1, W - 1); p.vx = p.vy = 0; p.eng = -1; p.engT = 0; p.free = false; p.stun = 0; p.dive = 0; p.jukeT = 0; p.route = []; p.ri = 0; p.assign = -1; p.zone = null; p.mode = 'stand'; };
    O.forEach((p, k) => { p.role = ROLES_OFF[k]; });
    D.forEach((p, k) => { p.role = ROLES_DEF[k]; });
    const rbSide = oc === 'runL' ? -1 : 1;
    place(O[0], kind === 'pass' ? -4.6 : -4.2, CY);
    place(O[1], -4.6, CY + 2.8 * rbSide);
    [-5.2, -2.6, 0, 2.6, 5.2].forEach((o, i) => place(O[2 + i], -0.9, CY + o));
    place(O[7], -0.6, CY - 20); place(O[8], -0.6, CY + 19); place(O[9], -1.8, CY + 9.5); place(O[10], -0.9, CY - 5.6);
    // routes
    if (kind === 'pass') for (const slot of RECEIVERS) { const p = O[slot], inn = CY - p.y > 0 ? 1 : -1; p.route = routeFor(oc, slot, inn).map(([f, l]) => [p.x + dir * f, p.y + l]); p.mode = 'route'; }
    O.forEach((p) => { if (p.role === 'OL') p.mode = 'oline'; });
    if (kind === 'pass') { O[1].mode = oc === 'deep' ? 'block' : 'route'; if (oc === 'deep') O[1].route = []; } else { O[1].mode = 'runner'; O[7].mode = 'block'; O[8].mode = 'block'; O[9].mode = 'block'; O[10].mode = 'block'; }
    // defence
    const deep = dc === 'prevent', blitz = dc === 'blitz', man = dc === 'man';
    [-4.6, -1.6, 1.6, 4.6].forEach((o, i) => place(D[i], 1.1, CY + o));
    [-6.5, 0, 6.5].forEach((o, i) => place(D[4 + i], blitz ? 2.8 : deep ? 7 : 4.4, CY + o));
    place(D[7], man ? 2 : deep ? 11 : 6, O[7].y); place(D[8], man ? 2 : deep ? 11 : 6, O[8].y);
    place(D[9], deep ? 24 : 13, CY - 9); place(D[10], deep ? 24 : 13, CY + 9);
    D.forEach((p) => { p.mode = 'rush'; });
    const zone = (p, fwd, y) => { p.mode = 'zone'; p.zone = { x: los + dir * fwd, y }; };
    const mark = (p, slotIdx) => { p.mode = 'man'; p.assign = O[slotIdx].id; };
    if (dc === 'cover2') { zone(D[4], 8, CY - 8); zone(D[5], 8, CY); zone(D[6], 8, CY + 8); zone(D[7], 6, 6); zone(D[8], 6, W - 6); zone(D[9], 20, CY - 11); zone(D[10], 20, CY + 11); }
    else if (man) { mark(D[7], 7); mark(D[8], 8); mark(D[9], 9); zone(D[10], 20, CY); mark(D[4], 1); mark(D[5], 10); zone(D[6], 9, CY); }
    else if (blitz) { mark(D[7], 7); mark(D[8], 8); mark(D[9], 9); mark(D[10], 10); D[4].mode = D[5].mode = D[6].mode = 'rush'; }
    else if (deep) { D[3].mode = 'zone'; D[3].zone = { x: los + dir * 7, y: CY }; zone(D[4], 11, CY - 9); zone(D[5], 11, CY); zone(D[6], 11, CY + 9); zone(D[7], 15, 7); zone(D[8], 15, W - 7); zone(D[9], 26, CY - 12); zone(D[10], 26, CY + 12); }
    else { /* fallback */ }
    g.ball.x = los; g.ball.y = CY; g.ball.z = 0; g.ball.state = 'held'; g.ball.carrier = O[0].id;
    g.P = { play: oc, defPlay: dc, kind, t: 0, thrown: false, handed: false, target: -1, qb: O[0].id, rb: O[1].id, carrier: O[0].id, done: false, turnover: false, qbT: 0, aiLook: 0, scramble: false, dropped: false, catchT: 0, caught: false, intercepted: false, thrower: O[0].id, backfield: true };
    g.ctl[offT] = O[0].id; g.ctl[defT] = D[5].id;
  }

  // ---------------- the main step ----------------
  function step(g, dt, ins) {
    dt = Math.min(dt, 0.05);
    if (g.textT > 0) g.textT -= dt;
    if (g.over) return;
    switch (g.phase) {
      case 'call': {
        g.callT -= dt;
        for (const t of [0, 1]) {
          const inp = ins[t] || {};
          if (!g.calls[t]) {
            if (!g.human[t]) g.calls[t] = cpuCall(g, t);
            else if (inp.call && setCall(g, t, inp.call)) { /* chosen */ }
            else if (g.callT <= 0) g.calls[t] = cpuCall(g, t);
          }
        }
        if (g.calls[0] && g.calls[1]) beginPlay(g);
        break;
      }
      case 'presnap': g.phaseT -= dt; if (g.phaseT <= 0) snap(g); break;
      case 'live': live(g, dt, ins); break;
      case 'kick': kickStep(g, dt); break;
      case 'dead': g.phaseT -= dt; if (g.phaseT <= 0) afterPlay(g); break;
      case 'qend': g.phaseT -= dt; if (g.phaseT <= 0) { g.phase = 'call'; g.callT = 14; g.calls = [null, null]; g.text = ''; } break;
    }
    for (const t of [0, 1]) if (ins[t]) g.lastIn[t] = { actN: ins[t].actN || 0, swN: ins[t].swN || 0, thrN: ins[t].thrN || 0 }; // a copy: the page keeps changing its own object
  }

  function beginPlay(g) {
    const oc = g.calls[g.off];
    if (OFF_PLAYS[oc].kind === 'kick') return startKick(g, oc);
    lineUp(g); g.phase = 'presnap'; g.phaseT = 1.0; g.text = ''; g.textT = 0;
  }
  function snap(g) { g.phase = 'live'; g.P.t = 0; }

  // ---------------- a live play ----------------
  function mv(p, tx, ty, dt, mul) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1, sp = SPD[p.role] * p.sp * (mul == null ? 1 : mul) * (p.stun > 0 ? 0 : 1);
    const want = Math.min(sp, d / Math.max(dt, 0.001));
    const wx = (dx / d) * want, wy = (dy / d) * want, k = Math.min(1, dt * 9);
    p.vx += (wx - p.vx) * k; p.vy += (wy - p.vy) * k;
  }
  function drive(p, ix, iy, dt, mul) { // a person steering with a stick
    const l = Math.hypot(ix, iy), sp = SPD[p.role] * p.sp * (mul == null ? 1 : mul) * (p.stun > 0 ? 0 : 1), k = Math.min(1, dt * 10);
    const wx = l > 0.1 ? (ix / Math.max(1, l)) * sp : 0, wy = l > 0.1 ? (iy / Math.max(1, l)) * sp : 0;
    p.vx += (wx - p.vx) * k; p.vy += (wy - p.vy) * k;
  }
  const carrierOf = (g) => (g.P && g.P.carrier >= 0 ? g.players[g.P.carrier] : null);

  function live(g, dt, ins) {
    const P = g.P, dir = dirOf(g), offT = g.off, defT = 1 - g.off, O = g.players.slice(offT * 11, offT * 11 + 11), D = g.players.slice(defT * 11, defT * 11 + 11);
    P.t += dt; g.clock = Math.max(0, g.clock - dt * CLOCK_RATE); if (g.clock === 0) g.endAfter = true;
    const inO = ins[offT] || {}, inD = ins[defT] || {}, lastO = g.lastIn[offT] || {}, lastD = g.lastIn[defT] || {};
    const press = (inp, last, key) => (inp[key] || 0) !== (last[key] || 0);
    const humanO = g.human[offT], humanD = g.human[defT];
    const qb = g.players[P.qb], carrier = carrierOf(g);
    const turned = P.turnover; // after an interception / fumble the roles swap (see swapSides)
    const att = P.attTeam != null ? P.attTeam : offT;

    // ---- who each person controls ----
    // offence: the QB until the ball is thrown, then the target, then whoever carries it
    let offCtl = P.intercepted ? P.carrier : (P.thrown && !P.caught && P.target >= 0 ? P.target : P.carrier);
    g.ctl[offT] = offCtl >= 0 ? offCtl : null;

    // ---- offence movement ----
    for (const p of O) {
      if (p.stun > 0) p.stun -= dt;
      if (p.id === offCtl && humanO && !P.intercepted) {
        drive(p, inO.dx || 0, inO.dy || 0, dt, p.jukeT > 0 ? 1.28 : 1);
        if (press(inO, lastO, 'actN') && p.id === P.carrier && p.id !== P.qb && p.jcd <= 0) { p.jukeT = 0.42; p.jcd = 1.4; }
        if (press(inO, lastO, 'actN') && p.id === P.qb && !P.thrown && p.jcd <= 0) { p.jukeT = 0.35; p.jcd = 1.5; }
      } else offAI(g, p, dt, P, O, D, dir);
      if (p.jukeT > 0) p.jukeT -= dt; if (p.jcd > 0) p.jcd -= dt;
    }
    // ---- pass: a throw ----
    if (P.kind === 'pass' && !P.thrown && !P.scrambling) {
      if (humanO && press(inO, lastO, 'thrN') && P.t > 0.35) throwTo(g, qb, O[RECEIVERS[clamp((inO.thrK | 0), 0, 4)]], D);
      else if (!humanO) aiThrow(g, qb, O, D, dt);
    }
    // ---- handoff ----
    if (P.kind === 'run' && !P.handed && P.t > 0.5) { P.handed = true; P.carrier = P.rb; g.ball.carrier = P.rb; P.backfield = false; }

    // ---- defence ----
    let sel = g.ctl[defT];
    if (humanD) {
      if (sel === null || sel === undefined || !D.some((d) => d.id === sel)) sel = D[5].id;
      if (press(inD, lastD, 'swN') || (press(inD, lastD, 'actN') && false)) { sel = nearestTo(D, g.ball).id; }
      g.ctl[defT] = sel;
    }
    for (const d of D) {
      if (d.stun > 0) d.stun -= dt; if (d.dcd > 0) d.dcd -= dt; if (d.tcd > 0) d.tcd -= dt;
      if (humanD && d.id === sel) {
        let mul = 1;
        if (d.dive > 0) { d.dive -= dt; mul = 1.45; }
        drive(d, inD.dx || 0, inD.dy || 0, dt, mul);
        if (press(inD, lastD, 'actN') && d.dcd <= 0) { d.dive = 0.3; d.dcd = 1.3; }
      } else defAI(g, d, dt, P, O, D, dir);
    }
    // ---- blocking ----
    blocking(g, dt, P, O, D);
    // ---- the ball in the air ----
    if (g.ball.state === 'air') ballFlight(g, dt, O, D);
    // ---- move everybody ----
    for (const p of g.players) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y < -1.5) { p.y = -1.5; p.vy = 0; } if (p.y > W + 1.5) { p.y = W + 1.5; p.vy = 0; }
      p.x = clamp(p.x, 1, L - 1);
    }
    // ---- the ball follows its carrier ----
    const c2 = carrierOf(g);
    if (c2 && g.ball.state === 'held') { g.ball.x = c2.x; g.ball.y = c2.y; g.ball.z = 0; g.ball.carrier = c2.id; }
    // ---- tackles, touchdowns, out of bounds ----
    if (c2 && g.ball.state === 'held' && g.phase === 'live') checkCarrier(g, c2, dt);
  }

  const nearestTo = (list, pt) => list.slice().sort((a, b) => dist(a, pt) - dist(b, pt))[0];

  function offAI(g, p, dt, P, O, D, dir) {
    const los = g.los;
    if (p.id === P.qb) {
      if (P.thrown || P.handed) { // after the throw / handoff: step back and watch (or a runner)
        if (P.carrier === p.id) carrierAI(g, p, dt, D, dir); else mv(p, p.x - dir * 0.2, p.y, dt, 0.3);
        return;
      }
      if (P.kind === 'pass') {
        const spotX = los - dir * 7.2; // drop back
        if (P.scrambling) carrierAI(g, p, dt, D, dir); else mv(p, (P.t < 1.0 ? spotX : p.x), CY + Math.sin(P.t * 1.5) * 0 + (p.y - CY) * 0.9, dt, 0.8);
      } else mv(p, O[1].x - dir * 0.2, O[1].y - (O[1].y > CY ? 1 : -1) * 0.5, dt, 0.7);
      return;
    }
    if (p.id === P.carrier) { carrierAI(g, p, dt, D, dir); return; }
    if (p.mode === 'oline') { // hold the line, give ground slowly on passes; on runs drive at the nearest defender
      if (p.eng >= 0) return; // moved by blocking()
      if (P.kind === 'run') { const foe = D.filter((d) => d.eng < 0 && (d.x - p.x) * dir > -1).sort((a, b) => dist(a, p) - dist(b, p))[0]; if (foe && dist(foe, p) < 9) { mv(p, foe.x - dir * 0.4, foe.y, dt, 0.75); return; } }
      // pass blocking: step up to the rusher who is closest to my spot
      const rusher = D.filter((d) => d.mode === 'rush' && d.eng < 0 && !d.free && (d.x - p.x) * dir > -1.5).sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (rusher && dist(rusher, p) < 7) { mv(p, rusher.x - dir * 0.5, rusher.y, dt, 0.8); return; }
      mv(p, p.x - dir * 0.5, p.y, dt, 0.35);
      return;
    }
    if (p.mode === 'route') {
      if (P.intercepted || P.caught) { chaseBlock(g, p, dt, D, dir); return; }
      if (p.ri < p.route.length) { const w = p.route[p.ri]; mv(p, w[0], w[1], dt, 0.97); if (Math.hypot(w[0] - p.x, w[1] - p.y) < 0.8) p.ri++; }
      else mv(p, p.x + dir * 10, p.y, dt, 0.97);
      return;
    }
    if (p.mode === 'runner') { // the back before the handoff heads to his gap
      const side = P.play === 'runL' ? -1 : P.play === 'runR' ? 1 : 0;
      mv(p, los + dir * 1.5, CY + side * 4.5 + (P.play === 'runM' ? (p.y > CY ? -1 : 1) * 0.8 : 0), dt, P.handed ? 1 : 0.62);
      return;
    }
    if (p.mode === 'block') { chaseBlock(g, p, dt, D, dir); return; }
    mv(p, p.x, p.y, dt, 0);
  }
  // blockers and teammates of the ball carrier: get in front of the nearest tackler
  function chaseBlock(g, p, dt, D, dir) {
    const c = carrierOf(g);
    if (!c) return mv(p, p.x, p.y, dt, 0);
    const foe = D.filter((d) => d.eng < 0 || d.eng === p.id).sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (foe && dist(foe, p) < 9 && dist(foe, c) < 14) { const tx = foe.x - dir * 0.2, ty = foe.y; mv(p, tx, ty, dt, 0.85); if (dist(p, foe) < 1.1) foe.stun = Math.max(foe.stun, 0.12); }
    else mv(p, c.x + dir * 2, c.y + (p.y > c.y ? 2 : -2), dt, 0.9);
  }
  function carrierAI(g, p, dt, D, dir) {
    // pick the lane that gains the most ground without running into a tackler; keep to it for a moment
    p.aiT = (p.aiT || 0) - dt;
    if (p.aiT <= 0 || p.aiDir == null) {
      p.aiT = 0.16; let best = 0, bs = -1e9;
      for (let a = -70; a <= 70; a += 14) {
        const rad = a * Math.PI / 180, dx = Math.cos(rad) * dir, dy = Math.sin(rad); let sc = Math.cos(rad) * 6 - Math.abs(a) * 0.012;
        for (const d of D) {
          const vx = d.x - p.x, vy = d.y - p.y, t = clamp(vx * dx + vy * dy, 0, 9), cx = p.x + dx * t - d.x, cy = p.y + dy * t - d.y, dd = Math.hypot(cx, cy);
          if (t > 0.3 && dd < 3.4) sc -= (3.4 - dd) * 2.3 * (1 - t / 14);
        }
        const ey = p.y + dy * 8; if (ey < 2) sc -= (2 - ey) * 0.9; if (ey > W - 2) sc -= (ey - (W - 2)) * 0.9;
        if (p.aiDir != null) sc += (1 - Math.abs(a - p.aiDir) / 140) * 0.9;
        if (sc > bs) { bs = sc; best = a; }
      }
      p.aiDir = best;
    }
    const rad = p.aiDir * Math.PI / 180;
    mv(p, p.x + Math.cos(rad) * dir * 6, p.y + Math.sin(rad) * 6, dt, p.jukeT > 0 ? 1.28 : 1);
    const near = D.filter((d) => dist(d, p) < 2.0 && d.stun <= 0).length;
    if (near && p.jcd <= 0 && p.id !== g.P.qb && g.rng() < dt * 2.5) { p.jukeT = 0.42; p.jcd = 1.5; }
  }

  // ---------------- the pass ----------------
  function aiThrow(g, qb, O, D, dt) {
    const P = g.P; if (P.t < 1.1) return;
    P.aiLook -= dt; if (P.aiLook > 0) return; P.aiLook = 0.12;
    const rush = D.filter((d) => d.mode === 'rush' && d.free).sort((a, b) => dist(a, qb) - dist(b, qb))[0];
    const pressured = rush && dist(rush, qb) < 3.2;
    let best = null, bs = -99;
    for (const slot of RECEIVERS) {
      const r = O[slot]; if (r.id === qb.id) continue;
      const dm = Math.min(...D.map((d) => dist(d, r))), ahead = (r.x - qb.x) * dirOf(g);
      if (ahead < 1) continue;
      const s = Math.min(dm, 6) * 1.0 + Math.min(ahead, 25) * 0.07 + g.rng() * 0.4;
      if (s > bs) { bs = s; best = { r, dm }; }
    }
    const skill = { easy: 0.85, medium: 1, hard: 1.2 }[g.level] || 1;
    const patience = 2.3 + g.rng() * 1.2;
    if (best && (best.dm >= 2.6 / skill || pressured || P.t > patience)) {
      if (pressured || P.t > patience + 0.9) { if (!best || best.dm < 1.3) { P.scrambling = true; return; } }
      throwTo(g, qb, best.r, D);
    } else if (P.t > patience + 1.2) P.scrambling = true;
  }
  function throwTo(g, qb, r, D) {
    const P = g.P; if (!r || P.thrown) return;
    const b = g.ball; P.thrown = true; P.target = r.id; P.thrower = qb.id; P.carrier = -1; P.backfield = false;
    // lead the receiver: aim at where he will be when the ball gets there
    let T = Math.max(0.3, dist(qb, r) / BALL_SPEED), tx = r.x + r.vx * T * 0.95, ty = r.y + r.vy * T * 0.95;
    T = Math.max(0.3, Math.hypot(tx - qb.x, ty - qb.y) / BALL_SPEED); tx = r.x + r.vx * T * 0.95; ty = r.y + r.vy * T * 0.95;
    const rush = D.some((d) => d.mode === 'rush' && d.free && dist(d, qb) < 3.2);
    const err = 0.3 + (rush ? 0.9 : 0) + Math.hypot(tx - qb.x, ty - qb.y) * 0.012 + (qb.jukeT > 0 ? 0.3 : 0);
    tx += (g.rng() - 0.5) * 2 * err; ty += (g.rng() - 0.5) * 2 * err;
    Object.assign(b, { state: 'air', sx: qb.x, sy: qb.y, tx, ty, T, u: 0, hgt: 1.4 + Math.hypot(tx - qb.x, ty - qb.y) * 0.07, carrier: null, x: qb.x, y: qb.y, z: 0 });
  }
  function ballFlight(g, dt, O, D) {
    const b = g.ball, P = g.P; b.u += dt / b.T;
    const u = Math.min(1, b.u); b.x = b.sx + (b.tx - b.sx) * u; b.y = b.sy + (b.ty - b.sy) * u; b.z = 4 * b.hgt * u * (1 - u);
    if (b.u < 1) return;
    // the ball comes down
    const R = g.players[P.target], team = g.players.filter((p) => p.team !== R.team);
    const dr = Math.hypot(R.x - b.tx, R.y - b.ty);
    const defs = team.map((d) => ({ d, dd: Math.hypot(d.x - b.tx, d.y - b.ty) })).sort((a, b2) => a.dd - b2.dd);
    const nd = defs[0], reach = 2.8;
    const skill = { easy: 0.9, medium: 1, hard: 1.08 }[g.level] || 1;
    let catchP = dr > reach ? 0 : (nd.dd < 0.9 ? 0.5 : nd.dd < 1.6 ? 0.74 : 0.95) * (1 - dr / reach * 0.2);
    const rv = g.rng();
    if (rv < catchP) { // caught
      P.caught = true; P.carrier = R.id; b.state = 'held'; b.carrier = R.id; R.route = []; R.ri = 0; R.mode = 'runner2'; P.catchX = R.x; return;
    }
    if (nd.dd < 1.3 && nd.dd < dr && g.rng() < 0.2 * skill) { // picked off
      P.intercepted = true; interception(g, nd.d); return;
    }
    // incomplete
    b.state = 'dead'; b.carrier = null; endPlay(g, 'incomplete', g.los);
  }
  function interception(g, d) {
    const P = g.P, b = g.ball, dir = d.team === 0 ? 1 : -1;
    // the defender is wrapped up after a short return
    let x = clamp(b.tx + dir * (1 + g.rng() * 7), EZ + 0.5, L - EZ - 0.5);
    if ((b.tx - (d.team === 0 ? EZ : L - EZ)) * dir < 0) x = d.team === 0 ? EZ + 20 : L - EZ - 20; // caught in his own end zone: touchback
    P.done = true; g.hist.push({ k: 'pass:int' });
    b.state = 'dead'; g.phase = 'dead'; g.phaseT = 2; g.plays++; g.text = 'INTERCEPTED!'; g.textT = 2; g.lastPlay = 'Interception';
    g.pendingNext = { type: 'turnover', x, to: d.team };
  }

  // ---------------- defence ----------------
  function defAI(g, d, dt, P, O, D, dir) {
    if (d.mode === 'chase') { const c = carrierOf(g); if (c) mv(d, c.x + c.vx * 0.3, c.y + c.vy * 0.3, dt, 1); return; }
    if (d.mode === 'block') { chaseBlock2(g, d, dt); return; }
    if (d.mode === 'runner2') { const D2 = g.players.filter((p) => p.team !== d.team); carrierAI(g, d, dt, D2, d.team === 0 ? 1 : -1); return; }
    if (d.eng >= 0) return; // being blocked: blocking() moves him
    const c = carrierOf(g), b = g.ball;
    const runnerOut = c && (P.handed || P.caught || P.scrambling) && P.carrier !== P.qb;
    const qb = g.players[P.qb];
    if (runnerOut || (P.scrambling && c)) { mv(d, c.x + c.vx * 0.3, c.y + c.vy * 0.3, dt, d.role === 'DL' || d.role === 'LB' ? 0.97 : 1); return; }
    if (P.thrown && b.state === 'air') {
      // chase the ball down when it is near my area
      const near = Math.hypot(d.x - b.tx, d.y - b.ty);
      if (d.mode === 'man' && d.assign >= 0) { const r = g.players[d.assign]; if (r.id === P.target || near < 9) mv(d, b.tx, b.ty, dt, 1); else mv(d, r.x + dir * 1.2, r.y, dt, 1); return; }
      if (near < 7) { mv(d, b.tx, b.ty, dt, 1); return; }
    }
    if (d.mode === 'rush') {
      if (P.kind === 'run' && !P.handed) { mv(d, g.los - dir * 1.5, qb.y + (d.y - qb.y) * 0.4, dt, 0.9); return; }
      if (P.kind === 'run') { const cc = carrierOf(g); if (cc && P.t > 0.75) mv(d, cc.x + cc.vx * 0.3, cc.y + cc.vy * 0.3, dt, 0.97); else mv(d, d.x, d.y, dt, 0); return; }
      const t = c || qb; mv(d, t.x + t.vx * 0.2, t.y + t.vy * 0.2, dt, d.free ? 1 : 0.9); return;
    }
    if (d.mode === 'man' && d.assign >= 0) { const r = g.players[d.assign]; mv(d, r.x + dir * 1.2 + r.vx * 0.15, r.y + r.vy * 0.15, dt, 1); return; }
    if (d.mode === 'zone' && d.zone) {
      // hold the spot, slide toward the ball side, pick up whoever comes into it
      let tx = d.zone.x, ty = d.zone.y + (b.y - d.zone.y) * 0.18;
      const come = O.filter((o) => (RECEIVERS.includes(o.k)) && Math.hypot(o.x - d.zone.x, o.y - d.zone.y) < 6.5).sort((a, b2) => Math.hypot(a.x - d.zone.x, a.y - d.zone.y) - Math.hypot(b2.x - d.zone.x, b2.y - d.zone.y))[0];
      if (come && P.t > 1.0) { tx = come.x + dir * 1.4; ty = come.y; }
      mv(d, tx, ty, dt, 0.95); return;
    }
    mv(d, d.x, d.y, dt, 0);
  }
  function chaseBlock2(g, p, dt) {
    const c = carrierOf(g); if (!c) return mv(p, p.x, p.y, dt, 0);
    const dir = p.team === 0 ? 1 : -1, foes = g.players.filter((q) => q.team !== p.team);
    const foe = foes.sort((a, b) => dist(a, c) - dist(b, c))[Math.min(foes.length - 1, p.k % 4)];
    if (foe && dist(p, foe) < 14) { mv(p, foe.x - dir * 0.3, foe.y, dt, 0.9); if (dist(p, foe) < 1.1) foe.stun = Math.max(foe.stun, 0.1); }
    else mv(p, c.x + dir * 3, c.y + (p.k % 2 ? 3 : -3), dt, 0.9);
  }

  // linemen tie up rushers for a while
  function blocking(g, dt, P, O, D) {
    if (P.turnover) return;
    const dir = dirOf(g), qb = g.players[P.qb];
    for (const d of D) {
      if (d.mode !== 'rush' && !(d.role === 'LB' && P.kind === 'run')) { d.eng = -1; continue; }
      if (d.eng >= 0) {
        const b = g.players[d.eng]; d.engT -= dt;
        if (d.engT <= 0 || P.thrown && false) { d.eng = -1; d.free = true; if (b) b.eng = -1; }
        else { d.vx *= 0.2; d.vy *= 0.2; if (b) { b.vx = d.vx; b.vy = d.vy; b.x += (d.x - dir * 0.9 - b.x) * Math.min(1, dt * 6); b.y += (d.y - b.y) * Math.min(1, dt * 6); } }
        continue;
      }
      if (d.free) continue;
      const ol = O.filter((o) => (o.role === 'OL' || o.role === 'TE') && o.eng < 0).sort((a, b) => dist(a, d) - dist(b, d))[0];
      if (ol && dist(ol, d) < 1.9 && (d.x - ol.x) * dir >= -0.8) {
        d.eng = ol.id; ol.eng = d.id;
        // a person on offence has a harder time when the line is beaten: the engage time shrinks with the level
        const lv = { easy: 1.25, medium: 1, hard: 0.8 }[g.level] || 1;
        d.engT = (P.kind === 'pass' ? 1.9 + g.rng() * 2.6 : 1.3 + g.rng() * 1.9) * (g.human[1 - d.team] ? 1 : 1) * (g.human[d.team] ? 1 : lv);
      }
    }
  }

  // ---------------- the carrier ----------------
  function checkCarrier(g, c, dt) {
    const P = g.P, dir = c.team === 0 ? 1 : -1, foes = g.players.filter((p) => p.team !== c.team);
    // touchdown
    const goal = goalOf(g, c.team);
    if ((c.x - goal) * dir >= 0) return touchdown(g, c);
    // out of bounds
    if (c.y < 0 || c.y > W) return endPlay(g, P.intercepted ? 'return' : P.caught ? 'run' : P.kind === 'run' ? 'run' : 'run', c.x, true);
    for (const d of foes) {
      if (d.tcd > 0 || d.eng >= 0 && g.players[d.eng] && false) continue;
      if (d.stun > 0 || d.eng >= 0) continue;
      const reach = d.dive > 0 ? 1.9 : 1.05;
      if (dist(d, c) > reach) continue;
      d.tcd = 0.3;
      if (c.jukeT > 0 && c.id !== P.qb) { d.stun = 0.55; continue; }
      if (c.id === P.qb && c.jukeT > 0) { d.stun = 0.4; continue; }
      const p = 0.86 + (d.dive > 0 ? 0.1 : 0) - (c.role === 'RB' ? 0.05 : 0);
      if (g.rng() < p) {
        // the tackle
        const behind = (c.x - g.los) * dir < 0 && c.id === P.qb && !P.thrown;
        if ((c.x - (c.team === 0 ? EZ : L - EZ)) * dir <= 0 && c.team === g.off) return safety(g, c);
        if (g.rng() < 0.035) return fumble(g, c, d);
        return endPlay(g, behind ? 'sack' : P.intercepted ? 'return' : 'run', c.x);
      }
      d.stun = 0.35; // missed
    }
  }
  function touchdown(g, c) {
    const team = c.team; g.score[team] += 7;
    g.text = (P_int(g) ? 'PICK SIX! ' : 'TOUCHDOWN! ') + g.names[team]; g.textT = 2.4;
    g.stats[team]++; g.hist.push({ k: (g.P.kind || '') + ':td', g: 0 });
    g.lastPlay = 'Touchdown';
    g.P.done = true; g.phase = 'dead'; g.phaseT = 2.6; g.ball.state = 'dead'; g.pendingNext = { type: 'kickoff', to: 1 - team };
  }
  const P_int = (g) => g.P && g.P.intercepted;
  function safety(g, c) {
    const scorer = 1 - c.team; g.score[scorer] += 2; g.text = 'SAFETY!'; g.textT = 2.4; g.lastPlay = 'Safety';
    g.P.done = true; g.phase = 'dead'; g.phaseT = 2.4; g.ball.state = 'dead'; g.pendingNext = { type: 'free', to: scorer };
  }
  function fumble(g, c, d) {
    const keep = g.rng() < 0.45;
    g.text = keep ? 'FUMBLE! Recovered!' : 'FUMBLE! Turnover!'; g.textT = 2.2;
    if (keep) return endPlay(g, 'run', c.x);
    g.P.done = true; g.phase = 'dead'; g.phaseT = 1.8; g.ball.state = 'dead'; g.pendingNext = { type: 'turnover', x: c.x, to: 1 - c.team };
  }

  // ---------------- the end of a play ----------------
  function endPlay(g, kind, x, oob) {
    const P = g.P, team = g.off, dir = dirOf(g);
    P.done = true; g.phase = 'dead'; g.phaseT = kind === 'incomplete' ? 1.3 : 1.7; g.ball.state = 'dead'; g.plays++;
    g.hist.push({ k: P.kind + ':' + kind, g: (x - g.los) * dir });
    if (P.intercepted) { g.pendingNext = { type: 'turnover', x, to: team }; g.text = g.text || 'INTERCEPTED'; g.textT = 2; return; }
    if (kind === 'incomplete') { g.text = 'INCOMPLETE'; g.textT = 1.2; g.pendingNext = { type: 'down', x: g.los }; g.lastPlay = 'Incomplete'; return; }
    const gain = (x - g.los) * dir; x = clamp(x, EZ + 0.01, L - EZ - 0.01);
    g.lastPlay = kind === 'sack' ? 'Sack for ' + Math.round(gain) : (gain >= 0 ? '+' : '') + Math.round(gain) + ' yards';
    g.text = kind === 'sack' ? 'SACKED!  ' + Math.round(gain) + ' yds' : (gain >= 0 ? '+' : '') + Math.round(gain) + ' YARDS'; g.textT = 1.6;
    g.pendingNext = { type: 'down', x };
  }
  function afterPlay(g) {
    const n = g.pendingNext || { type: 'down', x: g.los }; g.pendingNext = null;
    if (n.type === 'kickoff') { startDrive(g, n.to, n.to === 0 ? EZ + 25 : L - EZ - 25); }
    else if (n.type === 'free') { startDrive(g, n.to, n.to === 0 ? EZ + 40 : L - EZ - 40); }
    else if (n.type === 'turnover') { const to = n.to, x = clamp(n.x, EZ + 1, L - EZ - 1); startDrive(g, to, x); }
    else if (n.type === 'punted') { startDrive(g, n.to, n.x); }
    else {
      // an ordinary down: move the ball, count the down
      const dir = dirOf(g), team = g.off, x = n.x, gain = (x - g.los) * dir;
      g.los = x;
      if (gain >= g.toGo - 0.01) { g.down = 1; g.toGo = Math.min(10, Math.abs(goalOf(g, team) - g.los)); g.fdl = g.los + dir * g.toGo; g.text = 'FIRST DOWN!'; g.textT = 1.4; }
      else { g.toGo -= gain; g.down++; if (g.down > 4) { g.text = 'TURNOVER ON DOWNS'; g.textT = 2; startDrive(g, 1 - team, g.los); } }
    }
    g.calls = [null, null]; g.callT = 14; g.P = null; g.ball.state = 'held';
    if (g.endAfter) return endOfQuarter(g);
    g.phase = 'call';
  }
  function endOfQuarter(g) {
    g.endAfter = false;
    if (g.quarter >= 4) {
      g.over = true; g.phase = 'over'; g.winner = g.score[0] === g.score[1] ? -1 : g.score[0] > g.score[1] ? 0 : 1;
      g.text = g.winner < 0 ? 'TIE GAME' : 'FINAL: ' + g.names[g.winner] + ' win'; g.textT = 99; return;
    }
    g.quarter++; g.clock = g.quarterSecs;
    if (g.quarter === 3) { startDrive(g, 1, L - EZ - 25); g.text = 'HALFTIME'; } else g.text = 'QUARTER ' + g.quarter;
    g.textT = 2.2; g.phase = 'qend'; g.phaseT = 2.4; g.calls = [null, null];
  }

  // ---------------- kicks ----------------
  function startKick(g, id) {
    const dir = dirOf(g), team = g.off, toGoal = Math.abs(goalOf(g, team) - g.los);
    g.phase = 'kick'; g.plays++;
    if (id === 'fg') {
      const d = toGoal + 17; const p = d <= 30 ? 0.96 : d <= 40 ? 0.84 : d <= 48 ? 0.66 : d <= 55 ? 0.4 : 0.12;
      g.kickAnim = { kind: 'fg', t: 0, T: 1.9, ok: g.rng() < p, sx: g.los, sy: CY, tx: goalOf(g, team) + dir * 8, ty: CY + (g.rng() - 0.5) * 3, team };
    } else {
      const len = 36 + g.rng() * 14, x = g.los + dir * len;
      const end = team === 0 ? x >= L - EZ : x <= EZ;
      g.kickAnim = { kind: 'punt', t: 0, T: 2.2, sx: g.los, sy: CY, tx: end ? goalOf(g, team) + dir * 5 : x, ty: CY + (g.rng() - 0.5) * 8, touchback: end, team };
    }
    g.ball.state = 'kick'; g.ball.carrier = null; g.ball.x = g.los; g.ball.y = CY; g.P = null;
    // line everyone up for the picture
    lineUp2(g);
  }
  function lineUp2(g) { const dir = dirOf(g); g.players.forEach((p) => { p.vx = p.vy = 0; p.mode = 'stand'; }); const O = g.players.slice(g.off * 11, g.off * 11 + 11), D = g.players.slice((1 - g.off) * 11, (1 - g.off) * 11 + 11); O.forEach((p, k) => { p.x = g.los - dir * (k < 7 ? 1 : 6 + (k - 6)); p.y = CY - 10 + k * 2; }); D.forEach((p, k) => { p.x = g.los + dir * (k < 4 ? 1.2 : 8 + k); p.y = CY - 10 + k * 2; }); }
  function kickStep(g, dt) {
    const k = g.kickAnim; k.t += dt; const u = Math.min(1, k.t / k.T), b = g.ball;
    b.x = k.sx + (k.tx - k.sx) * u; b.y = k.sy + (k.ty - k.sy) * u; b.z = 4 * (k.kind === 'fg' ? 3.2 : 6.5) * u * (1 - u);
    if (u < 1) return;
    const team = k.team, dir = team === 0 ? 1 : -1;
    g.ball.state = 'dead'; g.ball.z = 0;
    if (k.kind === 'fg') {
      if (k.ok) { g.score[team] += 3; g.text = 'FIELD GOAL IS GOOD!'; g.pendingNext = { type: 'kickoff', to: 1 - team }; g.stats[team]++; }
      else { g.text = 'FIELD GOAL NO GOOD'; g.pendingNext = { type: 'turnover', x: g.los, to: 1 - team }; }
    } else {
      g.text = k.touchback ? 'TOUCHBACK' : 'PUNT'; g.pendingNext = { type: 'punted', to: 1 - team, x: k.touchback ? (team === 0 ? L - EZ - 20 : EZ + 20) : k.tx };
    }
    g.textT = 2; g.phase = 'dead'; g.phaseT = 2.2; g.kickAnim = null;
  }

  // ---------------- what the screen needs ----------------
  function view(g) {
    const P = g.P, dir = dirOf(g);
    return {
      human: g.human, phase: g.phase, q: g.quarter, clock: Math.ceil(g.clock), score: g.score, names: g.names, off: g.off, los: Math.round(g.los * 10) / 10, fdl: Math.round(g.fdl * 10) / 10,
      down: g.down, toGo: Math.max(1, Math.round(g.toGo)), text: g.textT > 0 ? g.text : '', callT: Math.ceil(g.callT), calls: g.calls.map((c) => !!c), over: g.over, winner: g.winner, last: g.lastPlay,
      pl: g.players.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, p.team, ROLE_CODE[p.role] || 0, (p.jukeT > 0 ? 1 : 0) | (p.stun > 0 ? 2 : 0) | (p.dive > 0 ? 4 : 0) | (g.ball.carrier === p.id ? 8 : 0) | (g.ctl[p.team] === p.id ? 16 : 0), Math.round(p.vx * 10) / 10, Math.round(p.vy * 10) / 10]),
      ball: [Math.round(g.ball.x * 10) / 10, Math.round(g.ball.y * 10) / 10, Math.round(g.ball.z * 10) / 10, g.ball.state === 'held' ? 0 : g.ball.state === 'air' ? 1 : g.ball.state === 'kick' ? 2 : 3],
      routes: g.phase === 'presnap' || g.phase === 'live' ? g.players.filter((p) => p.team === g.off && p.mode === 'route' && p.route.length && !(P && P.thrown)).map((p) => [p.id, p.route.slice(p.ri).map((w) => [Math.round(w[0] * 10) / 10, Math.round(w[1] * 10) / 10])]) : [],
      thrown: P ? P.thrown : false, target: P ? P.target : -1, ctl: g.ctl, pcall: g.calls[g.off] || null, dcall: g.calls[1 - g.off] || null, plays: g.plays, kick: g.kickAnim ? g.kickAnim.kind : null,
    };
  }
  const ROLE_CODE = { QB: 1, RB: 2, OL: 3, WR: 4, TE: 5, DL: 6, LB: 7, CB: 8, S: 9 };

  return { create, OFF_PLAYS, DEF_PLAYS, RECEIVERS, L, W, CY, EZ, yardLine, goalOf, routeFor, CLOCK_RATE };
});
