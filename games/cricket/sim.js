/* Tung Cricket - the rules and the match engine, shared by the browser (and testable in node).
   The whole match is a deterministic function of its settings (a seed) and the list of actions the two sides take,
   so a 1 v 1 game only has to send the actions: both browsers replay the same list and always agree.
   Anything the computer decides (its bowling, its shots, its field) is turned into an ordinary action first.

   Ground: polar spots round the middle of the pitch, angle 0 = straight down the ground towards the bowler,
   +90 = square on the off side (right), -90 = square on the leg side, 180 = behind the batter. Metres.
   Pitch: u = line (0 = middle stump, + = off side), v = length (0 = yorker ... 1 = bouncer). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.CricketSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const BOUNDARY = 66, CIRCLE = 27, STUMP = 0.17, WIDE_OFF = 0.6, WIDE_LEG = -0.5;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const D2R = Math.PI / 180;
  const wrap = (a) => { a %= 360; return a > 180 ? a - 360 : a <= -180 ? a + 360 : a; };
  const adiff = (a, b) => Math.abs(wrap(a - b));
  const xy = (a, r) => [r * Math.sin(a * D2R), -r * Math.cos(a * D2R)]; // screen-style: +x off side, -y towards the bowler
  const dist2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  function rngFrom(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h >>> 0; }
  const gauss = (r) => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

  // ---------- teams ----------
  const TEAMS = [
    { id: 'strikers', name: 'Sahur Strikers', short: 'SAH', color: '#ff9f1c', bat: 2, pow: 12, fast: -6, spin: -4, fld: 0, blurb: 'Big hitters, thin attack' },
    { id: 'titans', name: 'Tralalero Titans', short: 'TRA', color: '#3a8dff', bat: 2, pow: 2, fast: 5, spin: 0, fld: 2, blurb: 'Balanced, good with the new ball' },
    { id: 'blasters', name: 'Bombardiro Blasters', short: 'BOM', color: '#e63946', bat: -3, pow: 4, fast: 11, spin: -8, fld: 2, blurb: 'Fearsome pace attack' },
    { id: 'spinners', name: 'Lirili Spinners', short: 'LIR', color: '#2ec4b6', bat: 0, pow: -2, fast: -8, spin: 13, fld: 0, blurb: 'A web of spin on dusty pitches' },
    { id: 'kings', name: 'Cappuccino Kings', short: 'CAP', color: '#b5835a', bat: 9, pow: -5, fast: -2, spin: 2, fld: -2, blurb: 'Classy, technical batting' },
    { id: 'rangers', name: 'Brr Brr Rangers', short: 'BRR', color: '#9b5de5', bat: 2, pow: 2, fast: 1, spin: 2, fld: 9, blurb: 'All-rounders and electric fielding' },
  ];
  const FIRST = ['Tung', 'Bonk', 'Sahur', 'Brr', 'Lirili', 'Tralala', 'Bombar', 'Cappu', 'Chimp', 'Patapim', 'Trippi', 'Frigo', 'Camelo', 'Tata', 'Boneca', 'Glorbo', 'Orcal', 'Croco', 'Zibra', 'Tigri', 'Burba', 'Lulu', 'Bananit', 'Odin', 'Ballerin', 'Garam', 'Svin', 'Pipi', 'Mateo', 'Nuclear'];
  const LAST = ['Singh', 'Khan', 'Smith', 'Perera', 'Sharma', 'Taylor', 'Root', 'Stokes', 'Babar', 'Rashid', 'Warner', 'Archer', 'Starc', 'Rabada', 'Boult', 'Jadeja', 'Pant', 'Gill', 'Salt', 'Buttler', 'Shami', 'Siraj', 'Lyon', 'Hazel', 'Curran', 'Brook', 'Nair', 'Dhoni', 'Pooran', 'Rizwan'];
  const ROLES = [
    { r: 'Opener', bat: 78, pow: 70, spd: 70 }, { r: 'Opener', bat: 80, pow: 66, spd: 68 }, { r: 'Top order', bat: 82, pow: 72, spd: 70 },
    { r: 'Middle order', bat: 76, pow: 74, spd: 66, bowl: 36, bt: 'medfast' }, { r: 'All-rounder', bat: 70, pow: 72, spd: 64, bowl: 42, bt: 'offspin' },
    { r: 'Keeper', bat: 68, pow: 70, spd: 70, wk: true }, { r: 'All-rounder', bat: 64, pow: 70, spd: 62, bowl: 62, bt: 'medfast' },
    { r: 'All-rounder', bat: 58, pow: 64, spd: 60, bowl: 66, bt: 'legspin' }, { r: 'Spinner', bat: 38, pow: 48, spd: 55, bowl: 74, bt: 'offspin' },
    { r: 'Fast bowler', bat: 30, pow: 42, spd: 52, bowl: 80, bt: 'fast' }, { r: 'Fast bowler', bat: 24, pow: 36, spd: 50, bowl: 76, bt: 'fast' },
  ];
  const BT_NAME = { fast: 'Fast', medfast: 'Fast-medium', offspin: 'Off spin', legspin: 'Leg spin' };
  function makeTeam(id) {
    const prof = TEAMS.find((t) => t.id === id) || TEAMS[0], r = rngFrom(hashStr('team:' + prof.id)), used = new Set(), players = [];
    ROLES.forEach((ro, i) => {
      let name; do { name = FIRST[Math.floor(r() * FIRST.length)] + ' ' + LAST[Math.floor(r() * LAST.length)]; } while (used.has(name)); used.add(name);
      const n = () => Math.round(gauss(r) * 5), c = (x) => clamp(Math.round(x), 18, 96);
      const bt = ro.bt || (i === 3 || i === 4 ? 'medfast' : null), spin = bt === 'offspin' || bt === 'legspin', bowlBase = ro.bowl || 28;
      const bowl = c(bowlBase + (ro.bowl ? (spin ? prof.spin : prof.fast) : 0) + n()), acc = c(bowl + n() * 1.2 - 4);
      players.push({
        id: i, name, role: ro.r, wk: !!ro.wk, bat: c(ro.bat + prof.bat + n()), pow: c(ro.pow + prof.pow + n()), spd: c(ro.spd + n()), tmp: c(60 + n() * 2),
        bowl, acc, bt: bt || 'medfast', canBowl: !!ro.bowl && bowl >= 38 || (bt && bowlBase >= 34), fld: c(62 + prof.fld + n() * 1.5 + (ro.wk ? 12 : 0)),
        kmh: bt === 'fast' ? 128 + bowl * 0.24 + n() : bt === 'medfast' ? 112 + bowl * 0.2 + n() : bt === 'legspin' ? 74 + bowl * 0.1 + n() * 0.5 : 76 + bowl * 0.1 + n() * 0.5,
      });
    });
    players.forEach((p) => { if (p.canBowl === undefined || p.canBowl === null) p.canBowl = false; p.canBowl = !!p.canBowl; });
    return { id: prof.id, name: prof.name, short: prof.short, color: prof.color, blurb: prof.blurb, players, order: players.map((p) => p.id) };
  }
  const isSpin = (p) => p.bt === 'offspin' || p.bt === 'legspin';

  // ---------- conditions ----------
  const PITCHES = {
    flat: { id: 'flat', name: 'Flat deck', seam: 0.12, bounce: 0.5, turn: 0.2, out: 1.07, note: 'True bounce and a quick outfield. Good for batting.' },
    green: { id: 'green', name: 'Green top', seam: 0.55, bounce: 0.72, turn: 0.05, out: 1.0, note: 'Grass on it. The seamers will move it off the pitch.' },
    dusty: { id: 'dusty', name: 'Dusty turner', seam: 0.05, bounce: 0.3, turn: 0.55, out: 0.96, note: 'Dry and low. Spin will take over as it wears.' },
    damp: { id: 'damp', name: 'Damp and slow', seam: 0.32, bounce: 0.42, turn: 0.12, out: 0.88, note: 'Slow outfield: boundaries are hard work.' },
  };
  const WEATHER = {
    sunny: { id: 'sunny', name: 'Sunny', swing: 0.1 }, overcast: { id: 'overcast', name: 'Overcast', swing: 0.55 },
    humid: { id: 'humid', name: 'Humid', swing: 0.4 }, windy: { id: 'windy', name: 'Windy', swing: 0.25 },
  };

  // ---------- deliveries ----------
  const KINDS = {
    good: { n: 'Good length', t: 'pace', v: 0.38, u: 0.05, spd: 1, seam: 1, d: 'Hits the pitch on a testing length' },
    full: { n: 'Full', t: 'pace', v: 0.2, u: 0.08, spd: 1, seam: 0.8, d: 'Pitched up, inviting the drive' },
    short: { n: 'Short', t: 'pace', v: 0.62, u: 0.05, spd: 1, seam: 0.5, d: 'Pitched short, rises at the body' },
    yorker: { n: 'Yorker', t: 'pace', v: 0.05, u: 0.02, spd: 1, seam: 0, hard: 0.1, d: 'Aimed at the toes. Hard to hit, easy to miss the spot' },
    bouncer: { n: 'Bouncer', t: 'pace', v: 0.86, u: 0.0, spd: 1, seam: 0, bnc: 1, d: 'At the head. Only two an over' },
    slower: { n: 'Slower ball', t: 'pace', v: 0.34, u: 0.05, spd: 0.78, seam: 0.6, d: 'Takes pace off to beat the timing' },
    inswing: { n: 'Inswinger', t: 'pace', v: 0.3, u: 0.2, spd: 0.98, seam: 0.4, sw: -1, d: 'Curves in towards the pads' },
    outswing: { n: 'Outswinger', t: 'pace', v: 0.32, u: -0.02, spd: 0.98, seam: 0.4, sw: 1, d: 'Curves away from the bat' },
    cutter: { n: 'Cutter', t: 'pace', v: 0.38, u: 0.05, spd: 0.88, seam: 2, d: 'Grips and cuts off the seam' },
    wideyork: { n: 'Wide yorker', t: 'pace', v: 0.06, u: 0.46, spd: 1, seam: 0, hard: 0.12, d: 'Wide of off stump at the toes' },
    stock: { n: 'Stock ball', t: 'spin', v: 0.36, u: 0.06, spd: 1, turn: 1, d: 'Your normal spinning delivery' },
    flight: { n: 'Flighted', t: 'spin', v: 0.27, u: 0.06, spd: 0.9, turn: 1.15, d: 'Slower and looped, tempts a big shot' },
    googly: { n: 'Googly / doosra', t: 'spin', v: 0.36, u: 0.06, spd: 1, turn: -1, d: 'Spins the other way' },
    arm: { n: 'Arm ball', t: 'spin', v: 0.4, u: 0.05, spd: 1.08, turn: 0, d: 'Skids on straight, no turn' },
    quick: { n: 'Quicker one', t: 'spin', v: 0.46, u: 0.05, spd: 1.16, turn: 0.7, d: 'Fired in flat and fast' },
  };
  const KIND_LISTS = {
    fast: ['good', 'full', 'short', 'yorker', 'bouncer', 'slower', 'inswing', 'outswing', 'wideyork'],
    medfast: ['good', 'full', 'short', 'yorker', 'slower', 'cutter', 'inswing', 'outswing', 'wideyork'],
    offspin: ['stock', 'flight', 'googly', 'arm', 'quick'], legspin: ['stock', 'flight', 'googly', 'arm', 'quick'],
  };
  const kindsFor = (p) => KIND_LISTS[p.bt] || KIND_LISTS.medfast;

  // ---------- shots ----------
  // c / h: the middle and half width of the angles the shot can go to. v, u, wv, wu: the length and line it suits best.
  const SHOTS = {
    leave: { n: 'Leave', key: '1', d: 'Let it go' },
    defend: { n: 'Defend', key: '2', pw: 7, c: 0, h: 30, v: 0.36, wv: 0.75, u: 0, wu: 1.0, rv: 0.1, d: 'Safe. Plays almost anything for no runs' },
    drive: { n: 'Drive', key: '3', pw: 64, c: 12, h: 52, v: 0.2, wv: 0.17, u: 0.14, wu: 0.3, rv: 1, d: 'Full balls on a good line' },
    cut: { n: 'Cut', key: '4', pw: 58, c: 90, h: 26, v: 0.6, wv: 0.14, u: 0.4, wu: 0.22, rv: 0.9, d: 'Short and wide outside off' },
    pull: { n: 'Pull', key: '5', pw: 68, c: -82, h: 36, v: 0.72, wv: 0.17, u: -0.04, wu: 0.4, rv: 1, d: 'Short balls at the body' },
    sweep: { n: 'Sweep', key: '6', pw: 52, c: -85, h: 44, v: 0.42, wv: 0.22, u: -0.1, wu: 0.3, rv: 0.85, spinOnly: true, d: 'Down on a knee against spin' },
    flick: { n: 'Flick', key: '7', pw: 54, c: -44, h: 26, v: 0.3, wv: 0.2, u: -0.2, wu: 0.28, rv: 0.75, d: 'Pads and leg stump line, off the hip' },
    loft: { n: 'Big hit', key: '8', pw: 74, c: 0, h: 78, v: 0.3, wv: 0.22, u: 0.04, wu: 0.36, rv: 1.1, air: true, d: 'Swing hard for six. Skied if mistimed' },
    ramp: { n: 'Ramp', key: '9', pw: 66, c: 180, h: 30, v: 0.1, wv: 0.12, u: 0.0, wu: 0.28, rv: 1.1, air: true, d: 'Scoop it over the keeper. Brave' },
  };
  const SHOT_IDS = Object.keys(SHOTS);

  // ---------- fields ----------
  const FIELDS = {
    pp: { n: 'Powerplay', f: [[160, 15], [130, 16], [85, 22], [50, 25], [14, 26], [-18, 26], [-55, 26], [-92, 22], [-150, 58]], note: '2 outside the ring' },
    attack: { n: 'Attacking', f: [[165, 14], [155, 15], [145, 16], [125, 15], [80, 20], [45, 22], [12, 18], [-18, 20], [-105, 10]], note: 'Slips and close catchers' },
    balanced: { n: 'Balanced', f: [[160, 15], [48, 25], [12, 26], [-18, 26], [-92, 22], [135, 60], [60, 60], [-55, 62], [-148, 60]], note: '4 on the boundary' },
    defensive: { n: 'Defensive', f: [[88, 22], [48, 26], [12, 26], [-58, 26], [140, 60], [62, 60], [-14, 62], [-60, 62], [-150, 60]], note: '5 on the boundary' },
    death: { n: 'Death overs', f: [[95, 20], [50, 25], [-20, 26], [-55, 25], [88, 62], [25, 62], [-25, 63], [-62, 62], [-145, 62]], note: 'Guard the rope' },
    spin: { n: 'Spin trap', f: [[165, 14], [70, 12], [45, 20], [12, 24], [-18, 24], [-55, 24], [-110, 12], [-70, 60], [60, 62]], note: 'Close in for the turn' },
  };
  const outsideCount = (f) => f.filter((p) => p[1] > CIRCLE).length;

  // ---------- helpers ----------
  const inn = (m) => m.innings[m.inn];
  const batSide = (m) => inn(m).bat, bowlSide = (m) => inn(m).bowl;
  const pl = (m, team, i) => m.teams[team].players[i];
  const oversText = (balls) => Math.floor(balls / 6) + '.' + (balls % 6);
  const isPP = (m) => { const i = inn(m); return i && !i.so && Math.floor(i.balls / 6) < m.cfg.pp; };
  const maxOutside = (m) => (isPP(m) ? 2 : 5);
  const lv = (m) => ({ easy: 0, medium: 1, hard: 2 }[m.cfg.level] ?? 1);

  function create(o) {
    o = o || {};
    const seed = (o.seed >>> 0) || 12345, overs = [1, 2, 3, 5, 10, 20].includes(+o.overs) ? +o.overs : 5;
    const m = {
      seed, rng: rngFrom(seed), brng: rngFrom(seed ^ 0x9e3779b9 ^ ((Date.now() & 0xffff) * (o.noRandomBot ? 0 : 1))),
      cfg: { overs, wk: 10, level: o.level || 'medium', pp: Math.max(1, Math.ceil(overs * 0.2)), maxOv: Math.max(1, Math.ceil(overs / 5)), bot: [!!(o.bot && o.bot[0]), !!(o.bot && o.bot[1])], timers: !!o.timers, follow: !!o.follow },
      teams: [makeTeam(o.teams ? o.teams[0] : 'titans'), makeTeam(o.teams ? o.teams[1] : 'blasters')],
      names: o.names || ['You', 'Opponent'],
      phase: 'toss', t: 0, hold: 0, toss: { caller: 0, call: null, coin: null, winner: null, choice: null },
      ready: [false, false], innings: [], inn: -1, so: 0, field: FIELDS.balanced.f.map((p) => p.slice()), fieldName: 'balanced',
      fat: {}, wear: 0, balls: 0, log: [], n: 0, ev: [], result: null, pend: null, think: 0, decide: 0, soBalls: 0, stats: {}, lastBat: -1,
    };
    const pr = rngFrom(seed ^ 0xabcdef);
    const pk = ['flat', 'flat', 'green', 'dusty', 'damp'], wk = ['sunny', 'sunny', 'overcast', 'humid', 'windy'];
    m.pitch = PITCHES[o.pitch && PITCHES[o.pitch] ? o.pitch : pk[Math.floor(pr() * pk.length)]];
    m.weather = WEATHER[wk[Math.floor(pr() * wk.length)]];
    m.dewLikely = pr() < 0.4;
    if (m.cfg.bot[0] && !m.cfg.bot[1]) m.toss.caller = 1; // the human calls the toss
    if (o.caller === 0 || o.caller === 1) m.toss.caller = o.caller;
    return m;
  }

  // ---------- log + events ----------
  const emit = (m, e) => { m.ev.push(e); };
  const note = (m, text, kind) => emit(m, { k: 'text', text, kind: kind || '' });

  // ---------- fielders ----------
  function fielders(m) {
    const i = inn(m), team = m.teams[i.bowl], list = [];
    const keeper = team.players.find((p) => p.wk) || team.players[5];
    const bi = i.bowler >= 0 ? i.bowler : (i.lastBowler >= 0 ? i.lastBowler : team.players.findIndex((p) => p.canBowl));
    list.push({ i: bi, a: 0, r: 11, role: 'bowler', fld: pl(m, i.bowl, bi).fld });
    list.push({ i: keeper.id, a: 180, r: 13, role: 'keeper', fld: keeper.fld + 6 });
    const others = team.players.filter((p) => p.id !== bi && p.id !== keeper.id).sort((a, b) => b.fld - a.fld);
    const spots = m.field.map((p, k) => ({ a: p[0], r: p[1], k })).sort((a, b) => a.r - b.r);
    spots.forEach((s, k) => { const p = others[k] || others[others.length - 1]; list.push({ i: p.id, a: s.a, r: s.r, role: 'field', fld: p.fld, k: s.k }); });
    return list;
  }

  // ---------- innings ----------
  function newInnings(m, bat, bowl, overs, wk, target, so) {
    const order = m.teams[bat].order.slice();
    const I = {
      bat, bowl, overs, wk, target: target == null ? null : target, so: !!so, runs: 0, wkts: 0, balls: 0, ex: { wd: 0, nb: 0, b: 0, lb: 0 }, order,
      striker: order[0], non: order[1], next: 2, bats: {}, bowls: {}, overs_: [], fow: [], part: { runs: 0, balls: 0, a: order[0], b: order[1] }, wagon: [], map: [],
      bowler: -1, lastBowler: -1, revs: 1, free: false, over: null, bounc: 0, fours: 0, sixes: 0, done: false, reason: '',
    };
    I.bats[order[0]] = { r: 0, b: 0, f: 0, s: 0, out: null, in: true }; I.bats[order[1]] = { r: 0, b: 0, f: 0, s: 0, out: null, in: true };
    m.innings.push(I); m.inn = m.innings.length - 1;
    return I;
  }
  function startInnings(m, bat, bowl, overs, wk, target, so) {
    const I = newInnings(m, bat, bowl, overs, wk, target, so);
    m.fieldName = isPP(m) ? 'pp' : 'balanced'; m.field = FIELDS[m.fieldName].f.map((p) => p.slice());
    m.phase = 'pickBowler'; m.t = 0; m.think = 0;
    emit(m, { k: 'innings', i: m.inn });
    note(m, `${m.teams[bat].name} to bat. ${I.target != null ? `They need ${I.target} to win.` : ''}`, 'big');
    return I;
  }
  function bowlerOptions(m) {
    const i = inn(m), team = m.teams[i.bowl], mx = i.so ? 1 : m.cfg.maxOv;
    return team.players.filter((p) => p.canBowl || (i.bowls[p.id])).map((p) => {
      const b = i.bowls[p.id] || { b: 0 }, ov = Math.floor(b.b / 6);
      return { id: p.id, ov, left: mx - ov, ok: ov < mx && p.id !== i.lastBowler, p };
    });
  }
  function availableBatters(m) { const i = inn(m); return i.order.slice(i.next).filter((x) => !i.bats[x]); }

  // ---------- the ball ----------
  function flightSec(kmh) { return clamp(190 / kmh, 1.15, 2.6); }
  function makeDelivery(m, a) {
    const I = inn(m), B = pl(m, I.bowl, I.bowler), list = kindsFor(B), kind = list.includes(a.kind) ? a.kind : list[0], K = KINDS[kind];
    const rr = m.rng, eff = clamp(a.eff == null ? 0.6 : +a.eff, 0, 1), fat = m.fat[I.bowl + ':' + B.id] || 0;
    const tu = clamp(a.u == null ? K.u : +a.u, -1, 1), tv = clamp(a.v == null ? K.v : +a.v, 0, 1);
    const dewF = m.dewOn && isSpin(B) ? 1.2 : 1;
    const sigma = (0.05 + 0.17 * (1 - B.acc / 100)) * (1 + 0.55 * Math.max(0, eff - 0.5) + fat * 0.9) * (1 + (K.hard || 0) * 3) * dewF * (m.weather.id === 'windy' ? 1.08 : 1);
    const swingMv = (K.sw || 0) * m.weather.swing * (B.bowl / 100) * 0.34 * (m.pitch.id === 'damp' ? 1.1 : 1);
    let u = tu + swingMv + gauss(rr) * sigma, v = clamp(tv + gauss(rr) * sigma * 0.9, 0, 1);
    let dev = 0;
    if (K.t === 'pace') dev = m.pitch.seam * (K.seam || 0) * (0.35 + B.bowl / 190) * (rr() < 0.5 ? -1 : 1) * 0.55;
    else {
      const dir = B.bt === 'offspin' ? -1 : 1, wearF = m.pitch.turn + 0.32 * clamp(m.wear, 0, 1);
      dev = dir * (K.turn || 0) * (0.25 + B.bowl / 130) * wearF * 0.62;
    }
    const speed = Math.max(60, B.kmh * K.spd * (0.93 + 0.07 * eff) * (1 - fat * 0.07));
    const full = v < 0.03 && K.t === 'pace' && rr() < 0.55; // a full toss: it never bounces
    const del = { kind, name: K.n, eff, tu, tv, u, v, dev, uEff: u + dev, speed, flight: flightSec(speed), full, nb: false, wide: false, bnc: !!K.bnc || v > 0.8, spin: K.t === 'spin', swing: swingMv };
    const nbP = 0.008 + 0.03 * Math.max(0, eff - 0.7) + fat * 0.03;
    if (rr() < nbP) del.nb = true;
    if (del.bnc && (I.bounc >= 2)) { del.nb = true; del.bncNb = true; }
    if (del.bnc) I.bounc++;
    del.wide = del.uEff > WIDE_OFF || del.uEff < WIDE_LEG || v > 0.94;
    return del;
  }

  function shotFit(sh, uE, vE, step, spin) {
    const d1 = (vE + (step ? -0.2 : 0) - sh.v) / sh.wv, d2 = (uE - sh.u) / sh.wu;
    let f = Math.exp(-d1 * d1) * Math.exp(-d2 * d2);
    if (sh.spinOnly && !spin) f *= 0.45;
    if (sh.id === 'ramp' && spin) f *= 0.4;
    return f;
  }

  function nearestFielderTo(fl, p, skip) {
    let best = null, bd = 1e9;
    for (const f of fl) { if (skip && skip.includes(f)) continue; const d = dist2(xy(f.a, f.r), p); if (d < bd) { bd = d; best = f; } }
    return { f: best, d: bd };
  }

  // The outcome of a played shot: where the ball goes and whether anybody gets to it.
  function flyBall(m, del, S, sh, q, ang, air, fl, edge) {
    const rr = m.rng, I = inn(m);
    let D = (sh.pw || 20) * (0.3 + 0.9 * clamp((q - 0.3) / 0.7, 0, 1.1)) * (0.62 + S.pow / 160) * (m.pitch.out) * (sh.id === 'defend' || sh.id === 'sweep' || sh.id === 'flick' ? 1 : clamp(0.9 + del.speed / 700, 0.9, 1.15));
    if (air && sh.id !== 'loft' && sh.id !== 'ramp') D *= 1.22;
    if (edge) D = 6 + rr() * 28;
    const path = { a: Math.round(ang), d: Math.round(D), air: !!air, hang: 0, by: -1, caught: false, six: false, four: false, stop: 0, dropped: false, land: null };
    const unit = xy(ang, 1);
    const reachBase = (f) => 1.6 + 3.2 * (f.fld / 100);
    if (!air) {
      // along the ground: the first fielder who can reach the line of the ball stops it
      let hit = null;
      for (const f of fl) {
        if (f.role === 'keeper' && adiff(f.a, ang) > 40) continue;
        const dAng = adiff(f.a, ang); if (dAng > 80) continue;
        const along = f.r * Math.cos(dAng * D2R), lat = f.r * Math.sin(dAng * D2R);
        if (along <= 0.5 || along > D + 1.5) continue;
        const reach = reachBase(f) * clamp(1.28 - 0.55 * (D / BOUNDARY), 0.7, 1.2);
        if (lat <= reach && (!hit || along < hit.along)) hit = { f, along };
      }
      if (hit) {
        const mis = (1 - hit.f.fld / 100) * 0.1;
        if (m.rng() < mis) { path.fumble = hit.f.i; path.by = hit.f.i; D = Math.min(D * 0.85, hit.along + 14 + rr() * 6); path.d = Math.round(D); path.stop = Math.round(hit.along); }
        else { path.by = hit.f.i; path.stop = Math.round(hit.along); path.d = Math.round(hit.along); D = hit.along; }
      }
      if (D >= BOUNDARY && !(hit && !path.fumble)) { path.four = true; path.d = BOUNDARY; return path; }
      path.t = D / 19;
    } else {
      // in the air: it comes down at carry distance D, and somebody may get under it
      const H = 0.75 + D / 52 + (edge ? 0.2 : 0);
      path.hang = +H.toFixed(2); path.land = [Math.round(ang), Math.round(D)];
      const lp = xy(ang, D);
      let best = null;
      for (const f of fl) {
        const dd = dist2(xy(f.a, f.r), lp), movef = f.role === 'keeper' ? 0.8 : 1;
        const reach = (1.1 + 4.1 * H * (0.55 + 0.45 * f.fld / 100)) * movef;
        if (D >= BOUNDARY - 1) { if (!(f.r >= BOUNDARY - 9 && D <= BOUNDARY + 5)) continue; }
        if (dd <= reach) { const pc = (0.97 - 0.6 * Math.pow(dd / reach, 1.4)) * (0.78 + 0.22 * f.fld / 100) * (D > 55 ? 0.9 : 1) * (H < 0.95 ? 0.88 : 1) * (D >= BOUNDARY - 1 ? 0.78 : 1); if (!best || pc > best.pc) best = { f, pc, dd }; }
      }
      if (best) {
        path.by = best.f.i;
        if (rr() < best.pc) { path.caught = true; path.d = Math.round(D); return path; }
        path.dropped = true; D = Math.max(3, D - 2); path.d = Math.round(D);
      }
      if (!path.dropped) {
        if (D >= BOUNDARY - 1) { path.six = true; path.d = Math.round(D); return path; }
        // lands inside the rope and runs on
        const roll = Math.min(22, D * 0.32);
        if (D + roll >= BOUNDARY) { const g = fl.find((f) => f.r > BOUNDARY - 12 && adiff(f.a, ang) < 14); if (!g) { path.four = true; path.d = BOUNDARY; path.t = H + 1; return path; } D = BOUNDARY - 6; }
        else D = D + roll;
        path.d = Math.round(D);
      }
      path.t = H + Math.max(0, D - (path.land ? path.land[1] : D)) / 16;
    }
    return path;
  }

  // times for the run decision: how long until the ball is back at the stumps, and how many runs the batters can make safely
  function runInfo(m, path, fl, S, N) {
    const rest = xy(path.a, path.d);
    let fielder, ballT, dist;
    if (path.by >= 0 && !path.fumble) { fielder = fl.find((f) => f.i === path.by); const fp = xy(fielder.a, fielder.r); dist = dist2(fp, rest); ballT = (path.t || path.d / 19) + 0.3; }
    else { const nf = nearestFielderTo(fl, rest); fielder = nf.f; dist = nf.d; ballT = (path.t || path.d / 19) + nf.d / (6.2 + 2 * (fielder.fld / 100)) + 0.2; if (path.fumble) ballT += 0.6; }
    const fp = xy(fielder.a, fielder.r), end = Math.min(dist2(fp, [0, -10]), dist2(fp, [0, 10]));
    const tf = ballT + 0.55 + end / 29 + 0.25;
    const spd = (S.spd + N.spd) / 2, t1 = 3.3 - 0.01 * spd, tn = 2.7 - 0.01 * spd;
    const T = (n) => t1 + (n - 1) * tn + 0.2;
    let safe = 0; for (let n = 1; n <= 3; n++) if (T(n) < tf) safe = n;
    const cap = path.d < 14 ? 1 : path.d < 26 ? 2 : 3;
    return { tf: +tf.toFixed(2), safe: Math.min(safe, cap), cap, fielder: fielder.i, t1, tn, thr: fielder.fld };
  }

  function resolve(m, del, sw) {
    const rr = m.rng, I = inn(m), S = pl(m, I.bat, I.striker), N = pl(m, I.bat, I.non), B = pl(m, I.bowl, I.bowler);
    const fl = fielders(m), keeper = fl.find((f) => f.role === 'keeper');
    const r = { kind: del.kind, del, shot: sw || null, runs: 0, bat: 0, extra: null, ex: 0, wkt: null, four: false, six: false, live: null, path: null, dec: null, legal: !(del.nb || del.wide), text: '', st: I.striker };
    const stumpsHit = Math.abs(del.uEff) < STUMP + 0.02 && del.v < 0.62 && !del.full ? true : (del.full && Math.abs(del.uEff) < STUMP + 0.02);
    const struck = sw && sw.type !== 'leave' && Number.isFinite(sw.at);
    const free = I.free;
    r.free = free;
    // ----- nobody plays at it -----
    if (!struck) {
      if (del.nb) { r.extra = 'nb'; r.ex = 1; r.kind2 = 'noball'; }
      else if (del.wide) { r.extra = 'wd'; r.ex = 1; r.kind2 = 'wide'; if (rr() < 0.2) { r.ex = 5; r.text = 'wide'; } }
      else if (stumpsHit && !free && rr() < 0.92) { r.wkt = { how: 'bowled', by: B.id }; r.kind2 = 'wicket'; }
      else if (stumpsHit && free) { r.kind2 = 'dot'; }
      else if (rr() < 0.07) { r.extra = 'b'; r.ex = 1; r.kind2 = 'bye'; }
      else r.kind2 = 'dot';
      if (del.nb && stumpsHit) r.kind2 = 'noball';
      r.leave = true;
      if (r.wkt) r.dec = null;
      return r;
    }
    // ----- a shot -----
    const sh = Object.assign({ id: sw.type }, SHOTS[sw.type] || SHOTS.defend), aerial = !!sw.air || !!sh.air, step = !!sw.step;
    const te = sw.at - del.flight * 1000;
    const bq = clamp((B.bowl - 50) / 100 * 0.35 + Math.abs(del.dev) * 0.5 + (del.kind === 'yorker' ? 0.14 : 0) + (del.speed > 138 ? 0.06 : 0) + (del.kind === 'slower' ? 0.08 : 0), -0.1, 0.5);
    const speedF = clamp(120 / del.speed, 0.82, 1.3), settle = (I.bats[S.id].b < 6 ? 0.9 : 1) * (1 + (I.bats[S.id].f || 0) * 0);
    const pressure = clamp(m.pressure || 0, 0, 1), formF = (0.93 + 0.1 * (I.bats[S.id].form || 0)) * (1 - 0.1 * pressure * (1 - S.tmp / 100)) * settle;
    const perfect = (62 + 0.8 * S.bat) * speedF * formF;
    const ae = Math.abs(te);
    const tq = Math.exp(-Math.pow(ae / (2.1 * perfect), 2)) * (ae > perfect * 5 ? 0 : 1);
    r.timing = te; r.tq = tq;
    const fit = shotFit(sh, del.uEff, del.v, step, del.spin);
    const skillF = 0.58 + S.bat / 200;
    let q = tq * (0.3 + 0.7 * fit) * skillF * (1 - bq) * (aerial && !sh.air ? 0.93 : 1) * (step ? 0.95 : 1) + (rr() - 0.5) * 0.2;
    if (sh.id === 'defend') q = Math.max(q, 0.2 + (tq > 0.5 ? 0.15 : 0)) * 1.1;
    r.q = +q.toFixed(2); r.fit = +fit.toFixed(2);
    let ang = clamp(wrapTo(sw.ang == null ? sh.c : sw.ang, sh.c, sh.h), -180, 180);
    ang = wrap(ang + gauss(rr) * (3 + (1 - clamp(q, 0, 1)) * 20));
    r.ang = Math.round(ang);
    const edgeSide = del.uEff >= 0 ? 1 : -1;
    const noWk = free; // a free hit: only a run out
    if (q < 0.17) {
      // beaten
      r.beaten = true; r.kind2 = 'miss';
      const lbwLine = Math.abs(del.uEff) < STUMP + 0.04 && del.v < 0.55 && !step && del.uEff > -0.45;
      if (del.nb) { r.extra = 'nb'; r.ex = 1; }
      else if (stumpsHit && !noWk && rr() < 0.75) { r.wkt = { how: 'bowled', by: B.id }; r.kind2 = 'wicket'; }
      else if (step && !noWk && rr() < 0.42 && !del.nb) { r.wkt = { how: 'stumped', by: B.id, f: keeper.i }; r.kind2 = 'wicket'; }
      else if (lbwLine && !noWk && rr() < 0.5) {
        const truth = Math.abs(del.uEff) <= STUMP + 0.005 && del.v < 0.55;
        const initial = truth ? rr() < 0.8 : rr() < 0.18;
        r.dec = { kind: 'lbw', truth, initial, call: Math.abs(Math.abs(del.uEff) - STUMP) < 0.035 };
        r.wkt = { how: 'lbw', by: B.id }; r.kind2 = 'wicket';
        if (!initial) { r.wkt = null; r.kind2 = 'miss'; r.runs = 0; r.dec.pending = 'notout'; }
      } else if (rr() < 0.09 && !noWk) { // a false appeal for a catch behind
        const initial = rr() < 0.35; r.dec = { kind: 'cb', truth: false, initial, call: false };
        if (initial) { r.wkt = { how: 'cb', by: B.id, f: keeper.i }; r.kind2 = 'wicket'; }
      }
      if (!r.wkt && !r.extra) { if (rr() < 0.09) { r.extra = 'lb'; r.ex = 1; r.kind2 = 'legbye'; } }
      return r;
    }
    if (q < 0.31) {
      // edge or inside edge
      r.kind2 = 'edge';
      if (!r.extra && del.nb) { r.extra = 'nb'; r.ex = 1; }
      if (stumpsHit && !noWk && rr() < 0.12 && !aerial) { r.wkt = { how: 'bowled', by: B.id, inside: true }; r.kind2 = 'wicket'; return r; }
      const eang = edgeSide * (150 + rr() * 30) * (rr() < 0.12 ? -1 : 1);
      const air = rr() < 0.55;
      r.path = flyBall(m, del, S, sh, q, wrap(eang), air, fl, true);
      return finishPlay(m, r, del, S, N, fl, keeper, noWk, true);
    }
    r.kind2 = q < 0.48 ? 'mistime' : 'hit';
    let air = aerial;
    if (q < 0.48 && !air && rr() < 0.35) air = true; // a mistimed shot can balloon up
    if (q >= 0.48 && sh.id === 'defend') air = false;
    r.path = flyBall(m, del, S, sh, q, ang, air, fl, false);
    return finishPlay(m, r, del, S, N, fl, keeper, noWk, false);
  }
  function wrapTo(a, c, h) { const d = wrap(a - c); return wrap(c + clamp(d, -h, h)); }

  function finishPlay(m, r, del, S, N, fl, keeper, noWk, edge) {
    const rr = m.rng, p = r.path, I = inn(m), B = pl(m, I.bowl, I.bowler);
    if (del.nb && !r.extra) { r.extra = 'nb'; r.ex = 1; }
    if (p.caught) {
      const how = edge || (p.by === keeper.i && p.a > 140) ? 'cb' : 'caught';
      if (!noWk) {
        r.wkt = { how: p.by === keeper.i ? 'cb' : 'caught', by: B.id, f: p.by }; r.kind2 = 'wicket';
        if (r.wkt.how === 'cb' && edge) { r.dec = { kind: 'cb', truth: true, initial: rr() < 0.88, call: false }; if (!r.dec.initial) { r.wkt = null; r.kind2 = 'edge'; r.dec.pending = 'notout'; } }
        return r;
      }
      p.caught = false; p.dropped = true; // a no-ball or a free hit: the catch does not count
    }
    if (p.six) { r.six = true; r.bat = 6; r.kind2 = 'six'; return r; }
    if (p.four) { r.four = true; r.bat = 4; r.kind2 = 'four'; return r; }
    r.live = runInfo(m, p, fl, S, N);
    r.kind2 = 'live';
    return r;
  }

  // ---------- applying a finished ball ----------
  function over_(m) { const I = inn(m); return I.over; }
  function ensureOver(m) {
    const I = inn(m);
    if (!I.over) I.over = { bowler: I.bowler, runs: 0, w: 0, balls: [], bounc: 0 };
    return I.over;
  }
  const ballLabel = (r, runs) => {
    if (r.wkt) return 'W' + (runs ? runs : '');
    if (r.extra === 'wd') return r.ex > 1 ? 'Wd' + (r.ex - 1) : 'Wd'; if (r.extra === 'nb') return 'Nb' + (r.bat ? r.bat : ''); if (r.extra === 'b') return runs + 'b'; if (r.extra === 'lb') return runs + 'lb';
    return String(r.bat);
  };
  function commit(m, r, runsMade) {
    const I = inn(m), S = pl(m, I.bat, I.striker), B = pl(m, I.bowl, I.bowler), bs = I.bats[I.striker], bw = I.bowls[I.bowler] || (I.bowls[I.bowler] = { b: 0, r: 0, w: 0, wd: 0, nb: 0, m: 0, dots: 0 });
    const ov = ensureOver(m);
    // runs
    if (r.live && !r.wkt) { r.bat = r.extra ? r.bat : runsMade; if (r.extra === 'nb') r.bat = runsMade; r.runsRan = runsMade; } else if (r.live && r.wkt) { r.bat = runsMade; }
    let bye = 0;
    if (r.extra === 'b' || r.extra === 'lb') { bye = r.ex; r.ex = bye; }
    const total = (r.extra === 'wd' ? r.ex : r.extra === 'nb' ? 1 : bye) + (r.bat || 0);
    I.runs += total; ov.runs += total;
    if (r.extra === 'wd') { I.ex.wd += r.ex; bw.wd += r.ex; bw.r += r.ex; }
    else if (r.extra === 'nb') { I.ex.nb += 1; bw.nb += 1; bw.r += 1 + (r.bat || 0); }
    else if (r.extra === 'b') I.ex.b += bye; else if (r.extra === 'lb') I.ex.lb += bye;
    if (r.extra !== 'b' && r.extra !== 'lb' && r.extra !== 'wd' && r.extra !== 'nb') bw.r += r.bat || 0;
    if (r.extra === 'wd') { /* no ball faced */ } else { bs.b++; }
    if (r.extra !== 'wd' && r.extra !== 'b' && r.extra !== 'lb') { bs.r += r.bat || 0; if (r.four || (r.bat === 4 && !r.live)) { bs.f++; I.fours++; } if (r.six) { bs.s++; I.sixes++; } }
    else if (r.extra === 'b' || r.extra === 'lb') { /* runs to extras */ }
    if (r.live && r.bat === 4) { /* overthrow style boundaries are not modelled */ }
    I.part.runs += total; if (r.extra !== 'wd') I.part.balls++;
    if (r.extra !== 'wd' && r.extra !== 'nb') { I.balls++; bw.b++; ov.balls.push(ballLabel(r, runsMade)); this_nothing(); } else ov.balls.push(ballLabel(r, runsMade));
    if (!r.extra && !r.wkt && (r.bat || 0) === 0) bw.dots++;
    if (r.extra === 'nb') I.free = true; else if (r.extra !== 'wd') I.free = false;
    if (I.free && r.extra !== 'nb' && r.extra !== 'wd') I.free = false;
    // wagon wheel and pitch map
    if (r.path) I.wagon.push({ a: r.path.a, d: r.path.d, runs: r.bat || 0, six: !!r.six, four: !!r.four, w: !!r.wkt });
    I.map.push({ u: +r.del.u.toFixed(2), v: +r.del.v.toFixed(2), runs: total, w: !!r.wkt, bnc: r.del.bnc, k: r.del.kind });
    // fatigue and form
    const fk = I.bowl + ':' + I.bowler; m.fat[fk] = (m.fat[fk] || 0) + 0.012 * (0.6 + r.del.eff) * (isSpin(B) ? 0.5 : 1);
    m.balls++; m.wear = clamp(m.balls / 140, 0, 1);
    bs.form = clamp((bs.form || 0) + ((r.bat || 0) >= 4 ? 0.15 : (r.bat || 0) > 0 ? 0.03 : -0.015), -0.5, 1);
    // the wicket
    let out = null;
    if (r.wkt) {
      I.wkts++; bw.w += (r.wkt.how === 'runout') ? 0 : 1; ov.w++;
      out = r.wkt.out == null ? I.striker : r.wkt.out;
      const bo = I.bats[out]; bo.out = { how: r.wkt.how, by: r.wkt.by, f: r.wkt.f == null ? -1 : r.wkt.f }; bo.in = false;
      I.fow.push({ w: I.wkts, runs: I.runs, bat: out, ov: oversText(I.balls) });
      I.part = { runs: 0, balls: 0, a: -1, b: -1 };
      I.free = false;
    }
    // strike rotation
    const odd = (r.live ? runsMade : (r.extra === 'b' || r.extra === 'lb' ? bye : 0)) % 2 === 1;
    if (r.extra === 'wd' && r.ex > 1) { /* wides run */ }
    if (odd) { if (!out || r.wkt.how !== 'runout') { const t = I.striker; I.striker = I.non; I.non = t; } else { /* run out handled in the batter swap below */ const t = I.striker; I.striker = I.non; I.non = t; } }
    if (out != null) {
      // the batter who is out is replaced; the new batter takes his end
      if (out === I.striker) I.striker = -1; else if (out === I.non) I.non = -1;
    }
    r.total = total; r.out = out;
    I.lastRes = r;
    return r;
  }
  function this_nothing() {}

  // ---------- phases ----------
  function inningsOver(m) {
    const I = inn(m);
    if (I.wkts >= I.wk) return 'all out';
    if (I.balls >= I.overs * 6) return 'overs';
    if (I.target != null && I.runs >= I.target) return 'chased';
    return null;
  }
  function describe(m, r) {
    const I = inn(m), S = pl(m, I.bat, r.st), B = pl(m, I.bowl, I.bowler), rr = m.rng;
    const pick = (a) => a[Math.floor(rr() * a.length)];
    const sn = S.name.split(' ').pop(), bn = B.name.split(' ').pop();
    const sh = r.shot && SHOTS[r.shot.type] ? SHOTS[r.shot.type].n.toLowerCase() : '';
    const quality = r.q > 0.75 ? 'perfectly timed' : r.q > 0.55 ? 'well timed' : r.q > 0.4 ? 'a little mistimed' : 'poorly timed';
    const dir = (a) => { const x = Math.abs(a); return x < 14 ? 'straight' : x < 38 ? (a > 0 ? 'through extra cover' : 'through midwicket') : x < 75 ? (a > 0 ? 'through cover' : 'through midwicket') : x < 105 ? (a > 0 ? 'past point' : 'to square leg') : x < 150 ? (a > 0 ? 'down to third man' : 'fine of square leg') : 'behind the keeper'; };
    const k = r.kind2;
    if (r.wkt) {
      const w = r.wkt, f = w.f != null && w.f >= 0 ? pl(m, I.bowl, w.f).name.split(' ').pop() : '';
      const t = { bowled: pick([`BOWLED! ${bn} flattens the stumps!`, `Cleaned up! ${sn} is bowled by ${bn}.`, `Timber! The stumps are shattered.`]),
        lbw: pick([`LBW! Plumb in front, ${sn} has to go.`, `Trapped in front! The finger goes up.`]),
        caught: pick([`OUT! ${sn} holes out and ${f} takes the catch.`, `Caught! ${f} settles under it and holds on.`, `That's gone straight to ${f}. ${sn} is caught.`]),
        cb: pick([`Edged and taken! ${f} gloves it behind.`, `Caught behind! ${sn} nicks it to ${f}.`]),
        stumped: pick([`Stumped! ${sn} is out of the crease and ${f} whips the bails off.`, `Down the track and beaten. ${f} does the rest.`]),
        runout: pick([`RUN OUT! ${sn} is short of the line.`, `Direct hit! A mix up and a wicket.`]) }[w.how];
      return t + (w.inside ? ' Inside edge onto the stumps.' : '');
    }
    if (k === 'wide') return pick([`Wide. ${bn} loses his line.`, 'Too wide, the umpire stretches his arms.']);
    if (k === 'noball') return r.del.bncNb ? 'No ball! Too many bouncers this over.' : pick(['No ball! He has overstepped. Free hit coming.', 'Front foot no-ball! A free hit next.']);
    if (k === 'six') return pick([`SIX! ${sn} launches ${bn} over the rope!`, `That's out of the ground! A huge ${sh}.`, `Maximum! ${quality} and it sails away.`]);
    if (k === 'four') return pick([`FOUR! A ${quality} ${sh} ${dir(r.ang)}.`, `Cracked ${dir(r.ang)} for four!`, `Races away to the boundary, ${sn} with a lovely ${sh}.`]);
    if (r.leave) return pick([`${sn} leaves it alone.`, `Left. Dot ball.`, `Outside off, no shot offered.`]);
    if (r.beaten) return pick([`Beaten! ${sn} swings and misses.`, `Play and a miss from ${sn}.`, `${bn} beats the bat.`]);
    if (k === 'edge') return pick([`An edge! It runs away ${dir(r.ang)}.`, `Thick edge, no one near it.`]);
    const runs = r.bat || 0;
    if (runs === 0) return pick([`${sn} defends. No run.`, `Dot ball. ${bn} keeps it tight.`, `Straight to the fielder. Nothing doing.`]);
    return pick([`${runs} run${runs > 1 ? 's' : ''}, ${quality} ${sh} ${dir(r.ang)}.`, `${sn} works it ${dir(r.ang)} for ${runs}.`]);
  }
  function holdFor(r) { return r.wkt ? 3 : r.six ? 2.7 : r.four ? 2.4 : r.live && (r.bat || 0) > 1 ? 1.8 : r.leave ? 1 : 1.5; }

  function afterBall(m, r) {
    const I = inn(m);
    emit(m, { k: 'result', r: slimResult(m, r), runs: I.runs, wkts: I.wkts, balls: I.balls });
    note(m, describe(m, r), r.wkt ? 'wicket' : r.six || r.four ? 'boundary' : '');
    m.pend = null; m.phase = 'hold'; m.t = 0; m.hold = holdFor(r);
    const over = inningsOver(m);
    const endOfOver = I.balls > 0 && I.balls % 6 === 0 && (r.extra !== 'wd' && r.extra !== 'nb');
    m.next = over ? 'end' : r.wkt && I.wkts < I.wk ? 'newbat' : endOfOver ? 'overend' : 'bowl';
    if (over) { I.done = true; I.reason = over; }
    if (endOfOver && !over && r.live && false) { /* nothing */ }
  }
  const slimResult = (m, r) => ({ kind2: r.kind2, bat: r.bat || 0, ex: r.ex, extra: r.extra, total: r.total, wkt: r.wkt, four: r.four, six: r.six, path: r.path, del: r.del, ang: r.ang, q: r.q, timing: r.timing, tq: r.tq, fit: r.fit, shot: r.shot, leave: !!r.leave, beaten: !!r.beaten, live: r.live, st: r.st, dec: r.dec && { kind: r.dec.kind, initial: r.dec.initial, truth: r.dec.truth, call: r.dec.call, reviewed: r.dec.reviewed, over: r.dec.over }, text: '' });

  function endOver(m) {
    const I = inn(m), ov = I.over;
    if (ov) {
      const bw = I.bowls[ov.bowler]; if (ov.runs === 0 && ov.balls.length >= 6) bw.m++;
      I.overs_.push({ bowler: ov.bowler, runs: ov.runs, w: ov.w, balls: ov.balls.slice() });
    }
    I.over = null; I.bounc = 0;
    const t = I.striker; I.striker = I.non; I.non = t;
    I.lastBowler = I.bowler; I.bowler = -1;
  }

  function finishInnings(m) {
    const I = inn(m);
    I.done = true;
    if (I.over) { const bw = I.bowls[I.over.bowler]; I.overs_.push({ bowler: I.over.bowler, runs: I.over.runs, w: I.over.w, balls: I.over.balls.slice(), part: true }); I.over = null; }
    emit(m, { k: 'inningsEnd', i: m.inn });
    note(m, `${m.teams[I.bat].name}: ${I.runs}/${I.wkts} (${oversText(I.balls)} overs)`, 'big');
    const regular = m.innings.filter((x) => !x.so);
    if (!I.so) {
      if (regular.length === 1) { // second innings
        const t = I.runs + 1, ov = I.overs;
        m.dewOn = m.dewLikely;
        m.phase = 'break'; m.t = 0; m.nextInn = { bat: I.bowl, bowl: I.bat, overs: ov, wk: m.cfg.wk, target: t, so: false }; m.breakText = `${m.teams[I.bowl].name} need ${t} to win from ${ov * 6} balls.`;
        return;
      }
      return decide(m);
    }
    const sos = m.innings.filter((x) => x.so);
    if (sos.length % 2 === 1) {
      m.phase = 'break'; m.t = 0; m.nextInn = { bat: I.bowl, bowl: I.bat, overs: 1, wk: 2, target: I.runs + 1, so: true }; m.breakText = `Super over: ${m.teams[I.bowl].name} need ${I.runs + 1}.`;
      return;
    }
    return decide(m);
  }

  function decide(m) {
    const a = m.innings.filter((x) => !x.so), s = m.innings.filter((x) => x.so);
    const tm = (idx) => a.filter((x) => x.bat === idx).reduce((n, x) => n + x.runs, 0);
    let w = -1, text = '';
    if (s.length >= 2 && s.length % 2 === 0) {
      const last2 = s.slice(-2), r0 = last2[0].runs, r1 = last2[1].runs;
      if (r0 !== r1) { w = r1 > r0 ? last2[1].bat : last2[0].bat; text = `${m.teams[w].name} win the super over!`; }
      else if (s.length >= 6) { const b = (t) => s.filter((x) => x.bat === t).reduce((n, x) => n + x.fours + x.sixes, 0); w = b(0) === b(1) ? (m.rng() < 0.5 ? 0 : 1) : (b(0) > b(1) ? 0 : 1); text = `${m.teams[w].name} win on boundaries after tied super overs!`; }
      else return startSuper(m);
    } else {
      const r0 = tm(a[0].bat), r1 = tm(a[1].bat);
      if (a[1].runs > a[0].runs) { w = a[1].bat; const left = a[1].overs * 6 - a[1].balls, wk = a[1].wk - a[1].wkts; text = `${m.teams[w].name} win by ${wk} wicket${wk === 1 ? '' : 's'}${left > 0 ? ` with ${left} ball${left === 1 ? '' : 's'} to spare` : ''}.`; }
      else if (a[1].runs < a[0].runs) { w = a[0].bat; const d = a[0].runs - a[1].runs; text = `${m.teams[w].name} win by ${d} run${d === 1 ? '' : 's'}.`; }
      else return startSuper(m);
    }
    const mom = manOfMatch(m);
    m.result = { winner: w, text, mom, scores: [tm(0) + soRuns(m, 0), tm(1) + soRuns(m, 1)] };
    m.phase = 'done'; m.t = 0;
    emit(m, { k: 'done' });
  }
  const soRuns = (m, t) => m.innings.filter((x) => x.so && x.bat === t).reduce((n, x) => n + x.runs, 0);
  function startSuper(m) {
    const a = m.innings.filter((x) => !x.so), first = a[1].bat; // the side that batted second bats first in the super over
    m.soCount = (m.soCount || 0) + 1;
    m.phase = 'break'; m.t = 0; m.nextInn = { bat: first, bowl: 1 - first, overs: 1, wk: 2, target: null, so: true }; m.breakText = m.innings.some((x) => x.so) ? 'Tied again! Another super over.' : 'The scores are level! Super over to decide it.';
    note(m, m.breakText, 'big');
  }
  function manOfMatch(m) {
    let best = null;
    for (const I of m.innings) {
      for (const k of Object.keys(I.bats)) { const b = I.bats[k], id = +k, sc = b.r + (b.s || 0) * 2 + (b.b ? (b.r / b.b > 1.3 ? 4 : 0) : 0); add(m.stats, I.bat, id, sc, 0); }
      for (const k of Object.keys(I.bowls)) { const w = I.bowls[k]; add(m.stats, I.bowl, +k, w.w * 24 + (w.b > 5 && w.r / (w.b / 6) < 7 ? 8 : 0) + w.m * 8, w.w); }
      for (const k of Object.keys(I.bats)) { const b = I.bats[k]; if (b.out && b.out.f >= 0 && (b.out.how === 'caught' || b.out.how === 'cb' || b.out.how === 'stumped' || b.out.how === 'runout')) add(m.stats, I.bowl, b.out.f, 10, 0); }
    }
    for (const key of Object.keys(m.stats)) if (!best || m.stats[key].sc > best.sc) best = Object.assign({ key }, m.stats[key]);
    if (!best) return null;
    const [t, i] = best.key.split(':').map(Number);
    return { team: t, id: i, name: pl(m, t, i).name, sc: Math.round(best.sc) };
  }
  function add(st, team, id, sc, wk) { const k = team + ':' + id; (st[k] || (st[k] = { sc: 0, w: 0 })); st[k].sc += sc; st[k].w += wk; }

  function nextBall(m) {
    // called when the next delivery can be bowled
    const I = inn(m);
    m.phase = 'bowl'; m.t = 0; m.think = 0;
    m.pressure = 0;
    if (I.target != null) { const left = Math.max(1, I.overs * 6 - I.balls), need = I.target - I.runs, rrr = need / left * 6; m.pressure = clamp((rrr - 6) / 8, 0, 1); }
  }

  // ---------- actions ----------
  function sideOf(m, who) { const ph = m.phase; return who; }
  function validField(m, f) {
    if (!Array.isArray(f) || f.length !== 9) return false;
    for (const p of f) if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || p[1] < 7 || p[1] > BOUNDARY - 1) return false;
    return outsideCount(f) <= maxOutside(m);
  }
  function startNextInnings(m) {
    const n = m.nextInn; m.nextInn = null;
    startInnings(m, n.bat, n.bowl, n.overs, n.wk, n.target, n.so);
  }
  function startMatch(m) {
    const w = m.toss.winner, batFirst = m.toss.choice === 'bat' ? w : 1 - w;
    m.dewOn = false;
    startInnings(m, batFirst, 1 - batFirst, m.cfg.overs, m.cfg.wk, null, false);
  }

  function act(m, side, a) {
    if (!a || typeof a !== 'object') return false;
    const ok = applyAct(m, side, a);
    if (ok) { m.n++; m.log.push({ n: m.n, s: side, a }); }
    return ok;
  }

  function applyAct(m, side, a) {
    const ph = m.phase, t = a.t;
    if (ph === 'toss' && t === 'call' && side === m.toss.caller && (a.v === 'h' || a.v === 't')) {
      m.toss.call = a.v; m.toss.coin = m.rng() < 0.5 ? 'h' : 't'; m.toss.winner = m.toss.coin === a.v ? m.toss.caller : 1 - m.toss.caller;
      m.phase = 'tosspick'; m.t = 0; m.think = 0; emit(m, { k: 'coin', coin: m.toss.coin }); note(m, `${m.names[m.toss.caller]} called ${a.v === 'h' ? 'heads' : 'tails'}. It's ${m.toss.coin === 'h' ? 'heads' : 'tails'}! ${m.names[m.toss.winner]} won the toss.`, 'big');
      return true;
    }
    if (ph === 'tosspick' && t === 'choose' && side === m.toss.winner && (a.v === 'bat' || a.v === 'bowl')) {
      m.toss.choice = a.v; m.phase = 'setup'; m.t = 0; m.ready = [false, false];
      note(m, `${m.names[m.toss.winner]} chose to ${a.v} first.`, 'big');
      emit(m, { k: 'setup' });
      return true;
    }
    if (ph === 'setup' && (side === 0 || side === 1)) {
      if (t === 'order' && Array.isArray(a.order) && a.order.length === 11 && !m.ready[side]) {
        const s = new Set(a.order); if (s.size !== 11 || a.order.some((x) => !(x >= 0 && x < 11))) return false;
        m.teams[side].order = a.order.slice(); return true;
      }
      if (t === 'ready') { m.ready[side] = true; if (m.ready[0] && m.ready[1]) startMatch(m); return true; }
      return false;
    }
    if (ph === 'break' && (t === 'go' || t === 'next') && (side === 0 || side === 1 || side === -1)) { startNextInnings(m); return true; }
    if (ph === 'hold' && t === 'next' && side === -1) { return doNext(m); }
    if (ph === 'done') return false;
    const I = inn(m);
    if (!I) return false;
    if ((ph === 'pickBowler' || ph === 'bowl') && side === I.bowl && t === 'field') {
      let f = a.f;
      if (typeof a.preset === 'string' && FIELDS[a.preset]) f = FIELDS[a.preset].f;
      if (!validField(m, f)) return false;
      m.field = f.map((p) => [Math.round(wrap(p[0])), Math.round(p[1])]); m.fieldName = FIELDS[a.preset] ? a.preset : 'custom'; emit(m, { k: 'field' }); return true;
    }
    if (ph === 'pickBowler' && side === I.bowl && t === 'bowler') {
      const o = bowlerOptions(m).find((x) => x.id === a.i); if (!o || !o.ok) return false;
      I.bowler = o.id; I.bowls[o.id] = I.bowls[o.id] || { b: 0, r: 0, w: 0, wd: 0, nb: 0, m: 0, dots: 0 }; I.over = null; I.bounc = 0;
      ensureOver(m);
      emit(m, { k: 'over', n: Math.floor(I.balls / 6) + 1, bowler: o.id });
      note(m, `Over ${Math.floor(I.balls / 6) + 1}: ${pl(m, I.bowl, o.id).name} to bowl${isPP(m) ? ' (powerplay)' : ''}.`, 'big');
      nextBall(m); return true;
    }
    if (ph === 'bowl' && side === I.bowl && t === 'deliver') {
      const del = makeDelivery(m, a);
      m.pend = { del, sw: null }; m.phase = 'flight'; m.t = 0;
      emit(m, { k: 'deliver', del });
      return true;
    }
    if (ph === 'flight' && side === I.bat && (t === 'swing' || t === 'noswing')) {
      const del = m.pend.del;
      let sw = null;
      if (t === 'swing' && SHOTS[a.type] && a.type !== 'leave' && Number.isFinite(+a.at)) {
        const sh = SHOTS[a.type];
        if (sh.id === 'sweep') { /* any */ }
        sw = { type: a.type, ang: Number.isFinite(+a.ang) ? +a.ang : sh.c, air: !!a.air, step: !!a.step, at: clamp(+a.at, 0, 6000) };
      }
      const r = resolve(m, del, sw);
      return afterResolve(m, r);
    }
    if (ph === 'runs' && side === I.bat && t === 'runs') {
      const n = clamp(Math.round(+a.n), 0, 3), r = m.pend.r;
      return doRuns(m, r, n);
    }
    if (ph === 'review' && side === m.pend.reviewer && t === 'review') {
      return doReview(m, !!a.v);
    }
    if (ph === 'newbat' && side === I.bat && t === 'batter') {
      const avail = availableBatters(m);
      if (!avail.includes(a.i)) return false;
      bringIn(m, a.i); return true;
    }
    return false;
  }

  function bringIn(m, id) {
    const I = inn(m);
    I.bats[id] = { r: 0, b: 0, f: 0, s: 0, out: null, in: true };
    I.next = Math.max(I.next, I.order.indexOf(id) + 1);
    if (I.striker === -1) I.striker = id; else I.non = id;
    // the new batter always takes the striker's end unless the over has just finished
    if (I.striker === -1) I.striker = id;
    I.part = { runs: 0, balls: 0, a: I.striker, b: I.non };
    emit(m, { k: 'batter', id });
    note(m, `${pl(m, I.bat, id).name} comes to the crease.`);
    const nb = I.balls > 0 && I.balls % 6 === 0 && I.over == null && m.afterNew === 'overend';
    if (m.afterNew === 'overend') { m.afterNew = null; m.phase = 'pickBowler'; m.t = 0; m.think = 0; endOverSafe(m); } else { nextBall(m); }
  }
  function endOverSafe(m) { /* the over was ended before the new batter came in */ }

  function afterResolve(m, r) {
    // an umpire's decision that could be reviewed?
    const I = inn(m);
    if (r.dec && r.dec.initial !== r.dec.truth || (r.dec && r.dec.pending)) {
      // is there a review left on the side that would want one?
      const out = r.dec.initial, rev = out ? I.bat : I.bowl;
      const left = out ? I.revs : (I.bowlRevs == null ? 1 : I.bowlRevs);
      if (left > 0 && r.dec.initial !== r.dec.truth) {
        m.pend = { r, reviewer: rev, dec: true }; m.phase = 'review'; m.t = 0; m.think = 0;
        emit(m, { k: 'dec', kind: r.dec.kind, initial: r.dec.initial, reviewer: rev });
        note(m, r.dec.initial ? `The umpire says OUT (${r.dec.kind === 'lbw' ? 'lbw' : 'caught behind'}). ${m.names[rev]} can review.` : `Not out! ${m.names[rev]} can review.`, 'dec');
        return true;
      }
    }
    return proceed(m, r);
  }
  function doReview(m, yes) {
    const I = inn(m), r = m.pend.r, rev = m.pend.reviewer;
    if (!yes) { return proceed(m, r, true); }
    if (rev === I.bat) I.revs--; else I.bowlRevs = (I.bowlRevs == null ? 1 : I.bowlRevs) - 1;
    const truth = r.dec.truth;
    r.dec.reviewed = true;
    if (r.dec.call && r.dec.kind === 'lbw') { r.dec.over = false; note(m, `Umpire's call! The decision stands.`, 'dec'); emit(m, { k: 'drs', over: false, call: true }); if (rev !== I.bat || r.dec.initial) { /* keeps the review for umpire's call on a hit */ if (rev === I.bat) I.revs++; else I.bowlRevs++; } return proceed(m, r, true); }
    if (truth === r.dec.initial) { r.dec.over = false; note(m, `The review fails. The decision stands.`, 'dec'); emit(m, { k: 'drs', over: false }); return proceed(m, r, true); }
    r.dec.over = true; note(m, `Overturned! The review is successful.`, 'dec'); emit(m, { k: 'drs', over: true });
    if (r.dec.initial) { r.wkt = null; r.kind2 = 'miss'; r.legal = !(r.del.nb || r.del.wide); r.bat = 0; r.live = null; if (r.extra == null && r.del.nb) { r.extra = 'nb'; r.ex = 1; } }
    else { r.wkt = { how: r.dec.kind === 'lbw' ? 'lbw' : 'cb', by: pl(m, I.bowl, I.bowler).id, f: r.dec.kind === 'cb' ? (fielders(m).find((f) => f.role === 'keeper').i) : undefined }; r.kind2 = 'wicket'; }
    return proceed(m, r, true);
  }
  function proceed(m, r, fromReview) {
    if (r.live && !r.wkt) {
      // ask the batters how many runs to go for
      m.pend = { r }; m.phase = 'runs'; m.t = 0; m.think = 0;
      emit(m, { k: 'runs', info: r.live, path: r.path, del: r.del, r: slimResult(m, r) });
      return true;
    }
    const I = inn(m);
    commit(m, r, r.bat || 0);
    afterBall(m, r);
    return true;
  }
  function doRuns(m, r, n) {
    const rr = m.rng, I = inn(m), L = r.live, fl = fielders(m);
    // going for more than is safe risks a run out
    const T = (k) => L.t1 + (k - 1) * L.tn + 0.2;
    let made = n, out = null;
    if (n > 0 && T(n) >= L.tf) {
      const late = clamp((T(n) - L.tf + 0.2) / 1.1, 0, 1), hit = late * (0.4 + 0.5 * L.thr / 100);
      if (rr() < hit && !(false)) { made = n - 1; out = rr() < 0.55 ? I.striker : I.non; r.wkt = { how: 'runout', by: -1, f: L.fielder, out }; r.kind2 = 'wicket'; r.runout = true; }
      else if (rr() < 0.04) { made = n + 1; r.overthrow = true; }
    }
    if (r.wkt && r.wkt.how === 'runout') { /* the batter who is out is replaced below */ }
    r.live = L; r.bat = made;
    commit(m, r, made);
    if (r.wkt && r.wkt.how === 'runout') { r.runout = true; }
    afterBall(m, r);
    return true;
  }

  function doNext(m) {
    const I = inn(m);
    if (m.next === 'end') { finishInnings(m); return true; }
    if (m.next === 'newbat') {
      const over = I.balls > 0 && I.balls % 6 === 0 && I.over && I.over.balls.length >= 6;
      m.afterNew = over ? 'overend' : null;
      if (over) { endOver(m); m.afterNew = 'overend'; }
      if (availableBatters(m).length === 0) { finishInnings(m); return true; }
      m.phase = 'newbat'; m.t = 0; m.think = 0; return true;
    }
    if (m.next === 'overend') { endOver(m); m.phase = 'pickBowler'; m.t = 0; m.think = 0; return true; }
    nextBall(m); return true;
  }

  // ---------- computer players ----------
  function aiParams(m) { const l = lv(m); return { tSd: [270, 190, 120][l], aim: [0.14, 0.07, 0.025][l], smart: [0.5, 0.78, 0.96][l], bowlSd: [1.4, 1, 0.8][l] }; }
  const pickW = (r, items, ws) => { let t = ws.reduce((a, b) => a + b, 0), x = r() * t; for (let i = 0; i < items.length; i++) { x -= ws[i]; if (x <= 0) return items[i]; } return items[items.length - 1]; };

  function aiBowler(m) {
    const I = inn(m), r = m.brng, P = aiParams(m), left = I.overs * 6 - I.balls, death = left <= Math.max(6, I.overs * 6 * 0.25);
    const opts = bowlerOptions(m).filter((o) => o.ok);
    if (!opts.length) return null;
    const sc = opts.map((o) => {
      const p = o.p; let s = p.bowl + (isSpin(p) ? m.pitch.turn * 40 + m.wear * 15 : m.pitch.seam * 25 + m.weather.swing * 15) + (death && !isSpin(p) ? 12 : 0) - (m.fat[I.bowl + ':' + p.id] || 0) * 30 + o.left * 3;
      if (!p.canBowl) s -= 25;
      return s + (r() - 0.5) * (1 - P.smart) * 70;
    });
    let bi = 0; sc.forEach((s, i) => { if (s > sc[bi]) bi = i; });
    return opts[bi].id;
  }
  function aiFieldChoice(m) {
    const I = inn(m), r = m.brng, B = I.bowler >= 0 ? pl(m, I.bowl, I.bowler) : null, left = I.overs * 6 - I.balls;
    const P = aiParams(m); let id;
    if (isPP(m)) id = B && isSpin(B) ? 'pp' : 'pp';
    else if (left <= Math.max(6, I.overs * 6 * 0.22)) id = 'death';
    else if (B && isSpin(B)) id = 'spin';
    else if (I.target != null && I.target - I.runs < 12) id = 'defensive';
    else id = r() < 0.25 ? 'defensive' : 'balanced';
    if (r() > P.smart + 0.2) id = 'balanced';
    if (!isPP(m) && id === 'attack') id = 'balanced';
    if (outsideCount(FIELDS[id].f) > maxOutside(m)) id = 'pp';
    return id;
  }
  function aiDeliver(m) {
    const I = inn(m), r = m.brng, B = pl(m, I.bowl, I.bowler), P = aiParams(m), list = kindsFor(B), left = I.overs * 6 - I.balls, death = left <= Math.max(6, I.overs * 6 * 0.25);
    const bouncers = I.bounc, ws = list.map((k) => {
      let w = 1;
      if (k === 'good') w = 3; if (k === 'full') w = 1.5; if (k === 'short') w = 0.7; if (k === 'bouncer') w = bouncers >= 2 ? 0 : 0.7; if (k === 'wideyork') w = 0.3; if (k === 'stock') w = 3; if (k === 'googly') w = 1.2; if (k === 'arm') w = 0.8; if (k === 'quick') w = 0.7;
      if (death && (k === 'yorker' || k === 'slower' || k === 'wideyork')) w *= 3;
      if (isPlayNew(m) && (k === 'inswing' || k === 'outswing')) w *= 2.3;
      if (m.pitch.seam > 0.4 && k === 'cutter') w *= 2;
      if (k === 'full' && death) w *= 0.5; return w;
    });
    const kind = pickW(r, list, ws), K = KINDS[kind];
    const aim = P.aim, tu = clamp(K.u + (kind.includes('swing') || K.t === 'spin' ? 0.04 : 0.08) + gauss(r) * aim, -0.35, 0.5), tv = clamp(K.v + gauss(r) * aim * 0.8, 0.02, 0.9);
    const eff = clamp((death ? 0.8 : 0.55) + gauss(r) * 0.1 - (m.fat[I.bowl + ':' + B.id] || 0) * 1.2, 0.3, 1);
    return { t: 'deliver', kind, u: +tu.toFixed(2), v: +tv.toFixed(2), eff: +eff.toFixed(2) };
  }
  const isPlayNew = (m) => m.balls < 24;

  function aggression(m) {
    const I = inn(m), left = I.overs * 6 - I.balls; let agg = 0.45 + 0.25 * (1 - left / (I.overs * 6));
    if (I.target != null) { const need = I.target - I.runs, rrr = need / Math.max(1, left) * 6; agg = clamp(0.25 + (rrr - 4) / 9, 0.2, 1); }
    else if (left <= 6) agg = 0.9;
    agg -= (I.wkts / I.wk) * 0.18; agg += (m.brng() - 0.5) * 0.2;
    const b = I.bats[I.striker]; if (b && b.b < 4) agg -= 0.2;
    return clamp(agg, 0.05, 1);
  }
  function aiShotChoice(m, del) {
    const I = inn(m), S = pl(m, I.bat, I.striker), r = m.brng, P = aiParams(m), agg = aggression(m), fl = fielders(m);
    const uE = del.uEff, vE = del.v;
    let bestId = 'leave', best = -1, bestStep = false, bestAir = false;
    for (const id of SHOT_IDS) {
      if (id === 'leave') continue;
      const sh = Object.assign({ id }, SHOTS[id]);
      for (const step of (del.spin && id !== 'defend' && id !== 'sweep' && id !== 'ramp' ? [false, true] : [false])) {
        const fit = shotFit(sh, uE, vE, step, del.spin);
        let rw = id === 'defend' ? 0.18 + (1 - agg) * 0.55 : (sh.rv || 1) * (0.35 + agg);
        if (id === 'loft' || id === 'ramp') rw *= 0.25 + agg * 0.7 * (S.pow / 70);
        if (step) rw *= agg > 0.6 ? 1.0 : 0.5;
        let s = fit * rw + (r() - 0.5) * (1 - P.smart) * 0.9;
        if (id === 'defend') s += 0.12 * (1 - fit);
        if (s > best) { best = s; bestId = id; bestStep = step; bestAir = (id === 'drive' || id === 'flick') && agg > 0.75 && r() < 0.5; }
      }
    }
    if (del.wide && del.uEff > WIDE_OFF + 0.15 && !(agg > 0.8)) return { type: 'leave' };
    if (best < 0.14 && !(agg > 0.85)) return Math.abs(uE) > STUMP + 0.12 && vE < 0.65 || del.full === false && uE > 0.45 ? { type: 'leave' } : { type: 'defend', ang: 0, air: false, step: false };
    // aim for a gap
    const sh = SHOTS[bestId]; let ang = sh.c, bd = -1;
    for (let k = -4; k <= 4; k++) {
      const a = wrapTo(sh.c + (k / 4) * sh.h, sh.c, sh.h); let mn = 1e9;
      for (const f of fl) { if (f.role === 'keeper') continue; const d = dist2(xy(f.a, f.r), xy(a, 40)); if (d < mn) mn = d; }
      mn += (r() - 0.5) * 18 * (1 - P.smart) * 4;
      if (mn > bd) { bd = mn; ang = a; }
    }
    return { type: bestId, ang: Math.round(ang), air: bestAir, step: bestStep };
  }
  function aiSwing(m) {
    const del = m.pend.del, I = inn(m), S = pl(m, I.bat, I.striker), P = aiParams(m), r = m.brng;
    const c = aiShotChoice(m, del);
    if (c.type === 'leave') return { t: 'noswing' };
    const sd = P.tSd * (1.3 - S.bat / 150) * (del.speed > 135 ? 1.1 : 1);
    return { t: 'swing', type: c.type, ang: c.ang, air: c.air, step: c.step, at: Math.round(del.flight * 1000 + gauss(r) * sd) };
  }
  function aiRunsChoice(m) {
    const r0 = m.pend.r, L = r0.live, r = m.brng, P = aiParams(m), I = inn(m); let n = L.safe;
    const agg = aggression(m);
    const T = (k) => L.t1 + (k - 1) * L.tn + 0.2;
    if (n < L.cap && agg > 0.6 && T(n + 1) < L.tf + 0.1 && r() < 0.5) n++;
    if (r() > P.smart) n = Math.max(0, n - (r() < 0.6 ? 1 : 0));
    return { t: 'runs', n };
  }

  // one step of whatever the computer (or a timed-out human) should do for the phase we are in
  function autoAction(m) {
    const I = inn(m), ph = m.phase;
    switch (ph) {
      case 'toss': return { side: m.toss.caller, a: { t: 'call', v: m.brng() < 0.5 ? 'h' : 't' } };
      case 'tosspick': { const bowl = m.pitch.seam > 0.3 || m.weather.swing > 0.35 || m.brng() < 0.45; return { side: m.toss.winner, a: { t: 'choose', v: bowl ? 'bowl' : 'bat' } }; }
      case 'setup': { const s = m.ready[0] ? 1 : 0; return { side: s, a: { t: 'ready' } }; }
      case 'pickBowler': return { side: I.bowl, a: { t: 'bowler', i: aiBowler(m) } };
      case 'bowl': return { side: I.bowl, a: aiDeliver(m) };
      case 'flight': return { side: I.bat, a: aiSwing(m) };
      case 'runs': return { side: I.bat, a: aiRunsChoice(m) };
      case 'review': {
        const r = m.pend.r, P = aiParams(m);
        return { side: m.pend.reviewer, a: { t: 'review', v: m.brng() < P.smart } };
      }
      case 'newbat': { const av = availableBatters(m); return { side: I.bat, a: { t: 'batter', i: av[0] } }; }
      case 'break': return { side: -1, a: { t: 'go' } };
      case 'hold': return { side: -1, a: { t: 'next' } };
    }
    return null;
  }
  const phaseSide = (m) => {
    const I = inn(m), ph = m.phase;
    if (ph === 'toss') return m.toss.caller; if (ph === 'tosspick') return m.toss.winner;
    if (ph === 'pickBowler' || ph === 'bowl') return I.bowl; if (ph === 'flight' || ph === 'runs' || ph === 'newbat') return I.bat;
    if (ph === 'review') return m.pend.reviewer; return -1;
  };

  // The host calls this every frame. It runs the clock and plays any side that is a computer (or timed out).
  // Returns the number of actions it applied (they are in m.log).
  function tick(m, dt) {
    if (m.cfg.follow) return 0;
    m.t += dt; let n = 0;
    const ph = m.phase;
    if (ph === 'done') return 0;
    if (ph === 'hold') { if (m.t >= m.hold) { act(m, -1, { t: 'next' }); n++; } return n; }
    if (ph === 'break') { if (m.t >= 5) { act(m, -1, { t: 'go' }); n++; } return n; }
    if (ph === 'setup') {
      for (const s of [0, 1]) if (!m.ready[s] && (m.cfg.bot[s] || (m.cfg.timers && m.t > 75))) { act(m, s, { t: 'ready' }); n++; }
      return n;
    }
    const side = phaseSide(m);
    const bot = side >= 0 && m.cfg.bot[side];
    const limit = { toss: 20, tosspick: 20, pickBowler: 45, bowl: 30, flight: 0, runs: 9, review: 8, newbat: 25 }[ph];
    if (ph === 'flight') {
      const del = m.pend.del;
      if (bot) { if (m.t >= 0.05) { const x = autoAction(m); act(m, x.side, x.a); n++; } }
      else if (m.t >= del.flight + 1.4) { act(m, side, { t: 'noswing' }); n++; }
      return n;
    }
    const delay = bot ? (ph === 'toss' || ph === 'tosspick' ? 1.4 : ph === 'pickBowler' ? 0.9 : ph === 'bowl' ? 1 : ph === 'runs' ? 0.5 : 0.8) : 0;
    if (bot && m.t >= delay) {
      if (ph === 'pickBowler') { // choose the bowler, then the field for him
        const x = autoAction(m); if (x && x.a.i != null && act(m, x.side, x.a)) { n++; const id = aiFieldChoice(m); act(m, side, { t: 'field', preset: id }); n++; }
        return n;
      }
      const x = autoAction(m); if (x && x.a && act(m, x.side, x.a)) n++;
    } else if (!bot && m.cfg.timers && limit && m.t >= limit) {
      if (ph === 'pickBowler') { const x = autoAction(m); if (x && act(m, x.side, x.a)) n++; }
      else { const x = autoAction(m); if (x && x.a && act(m, x.side, x.a)) n++; }
    }
    return n;
  }

  // ---------- numbers for the screen ----------
  function status(m) {
    const I = inn(m); if (!I) return null;
    const balls = I.balls, left = I.overs * 6 - balls, crr = balls ? I.runs / balls * 6 : 0;
    const o = { runs: I.runs, wkts: I.wkts, balls, left, overs: oversText(balls), crr: +crr.toFixed(2), target: I.target, need: null, rrr: null, proj: Math.round(crr * I.overs), pp: isPP(m), free: I.free };
    if (I.target != null) { o.need = Math.max(0, I.target - I.runs); o.rrr = left > 0 ? +(o.need / left * 6).toFixed(2) : 0; }
    return o;
  }
  function rosterView(m, team) { return m.teams[team].players.map((p) => ({ id: p.id, name: p.name, role: p.role, bat: p.bat, pow: p.pow, bowl: p.bowl, bt: p.bt, canBowl: p.canBowl, fld: p.fld, wk: p.wk, spd: p.spd })); }

  return { BOUNDARY, CIRCLE, STUMP, WIDE_OFF, WIDE_LEG, TEAMS, PITCHES, WEATHER, KINDS, SHOTS, SHOT_IDS, FIELDS, BT_NAME, create, act, tick, autoAction, status, fielders, bowlerOptions, availableBatters, kindsFor, validField, outsideCount, maxOutside, isPP, isSpin, xy, wrap, oversText, shotFit, rosterView, makeTeam, aiFieldChoice, inn, pl, phaseSide, flightSec, adiff };
});
