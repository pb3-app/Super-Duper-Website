// Dizzy Tungs - game engine
// One-button game: your tung spins nonstop. Every press throws a bat, HOLD to run the way
// you're facing, and every time you let go your spin flips direction. Last tung standing wins.
// The browser uses this file for single player / same-screen games, and the server
// uses the exact same file for online games.

export const RULES = {
  ROUNDS_TO_WIN: 1,        // one round = one game (a draw replays the round)
  DEFAULT_LIVES: 3,
  MAX_LIVES: 10,
  RADIUS: 24,
  SPIN_SPEED: 3.0,          // radians per second (about one full turn every 2 seconds)
  MOVE_SPEED: 190,          // pixels per second while holding
  THROW_COOLDOWN_MS: 400,
  MAX_BATS: 2,              // bats in the air at once per tung (double bats: 4)
  BAT_SPEED: 520,
  BAT_RADIUS: 9,
  BAT_BOUNCES: 1,           // bats bounce off walls this many times
  BAT_LIFE_MS: 2000,
  HIT_INVULN_MS: 600,
  CRATE_RADIUS: 18,
  CRATE_MAX: 3,
  CRATE_EVERY_MS: [4000, 7000],
  EFFECT_MS: 8000,
  SHIELD_MS: 10000,
  ROUND_START_MS: 1800,     // "3-2-1" before a round
  ROUND_END_MS: 2600
};

export const COLORS = [
  { name: "Red", color: "#d8453b" },
  { name: "Blue", color: "#3f7fd9" },
  { name: "Green", color: "#3fae55" },
  { name: "Yellow", color: "#f2c230" }
];

// ---------- Tung types (pick one, bots pick at random) ----------
// Every type starts from the base rules; these change only what is listed.
export const TYPES = {
  bouncy:  { name: "Bouncy Tung",  icon: "↯", bounces: 4, batLife: 1.8,
             perks: ["Bats bounce 4 times instead of once", "Bats stay out longer"] },
  zoomy:   { name: "Zoomy Tung",   icon: "»", speed: 1.6, size: 0.85,
             perks: ["Runs 60% faster", "A bit smaller"] },
  spinny:  { name: "Spinny Tung",  icon: "⟳", spin: 1.2, batSpeed: 0.8,
             perks: ["Spins 20% faster: lines up shots more often", "Lighter bats fly 20% slower"] },
  slugger: { name: "Slugger Tung", icon: "➶", batSpeed: 1.45, cooldown: 1.45,
             perks: ["Bats fly 45% faster", "Takes longer to reload"] }
};
export const TYPE_IDS = Object.keys(TYPES);

function typeStats(id) {
  const t = TYPES[id] || TYPES.bouncy;
  return { bounces: t.bounces ?? RULES.BAT_BOUNCES, speed: t.speed ?? 1, lives: t.lives ?? 0, size: t.size ?? 1,
    batSpeed: t.batSpeed ?? 1, cooldown: t.cooldown ?? 1, batLife: t.batLife ?? 1, tough: t.tough ?? 0, spin: t.spin ?? 1 };
}

export const BOT_LEVELS = {
  // aim: how sloppy the bot is (1 = only throws when the bat will really connect)
  easy:   { label: "Easy",   aim: 3.0, think: [450, 750], lead: 0,   dodge: 0,    throwChance: 0.35, crates: 0.25, moveTol: 0.45 },
  medium: { label: "Medium", aim: 1.8, think: [250, 450], lead: 0.5, dodge: 0.4,  throwChance: 0.7,  crates: 0.55, moveTol: 0.3, saveBats: true },
  hard:   { label: "Hard",   aim: 1.0, think: [220, 380], lead: 1,   dodge: 0.9,  throwChance: 1,    crates: 0.9,  moveTol: 0.25, saveBats: true }
};

// ---------- The one map (for now) ----------
export const MAPS = {
  yard: {
    name: "Sahur Yard",
    w: 1200, h: 800,
    walls: [
      { x: 560, y: 330, w: 80, h: 140 },
      { x: 250, y: 180, w: 150, h: 40 }, { x: 800, y: 180, w: 150, h: 40 },
      { x: 250, y: 580, w: 150, h: 40 }, { x: 800, y: 580, w: 150, h: 40 },
      { x: 140, y: 365, w: 40, h: 70 },  { x: 1020, y: 365, w: 40, h: 70 },
      { x: 580, y: 80, w: 40, h: 110 },  { x: 580, y: 610, w: 40, h: 110 }
    ],
    spawns: [
      { x: 90, y: 90, a: Math.PI / 4 }, { x: 1110, y: 710, a: (-3 * Math.PI) / 4 },
      { x: 1110, y: 90, a: (3 * Math.PI) / 4 }, { x: 90, y: 710, a: -Math.PI / 4 }
    ]
  }
};

const TAU = Math.PI * 2;
function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// circle vs rectangle: returns push-out vector or null
function circleRect(cx, cy, r, w) {
  const nx = clamp(cx, w.x, w.x + w.w), ny = clamp(cy, w.y, w.y + w.h);
  const dx = cx - nx, dy = cy - ny, d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 0) { const d = Math.sqrt(d2); return { x: (dx / d) * (r - d), y: (dy / d) * (r - d), nx: dx / d, ny: dy / d }; }
  // center inside the rectangle: push out the shortest way
  const left = cx - w.x, right = w.x + w.w - cx, top = cy - w.y, bottom = w.y + w.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: -(left + r), y: 0, nx: -1, ny: 0 };
  if (m === right) return { x: right + r, y: 0, nx: 1, ny: 0 };
  if (m === top) return { x: 0, y: -(top + r), nx: 0, ny: -1 };
  return { x: 0, y: bottom + r, nx: 0, ny: 1 };
}

// does a straight line from a to b hit any wall?
export function lineBlocked(map, ax, ay, bx, by, pad = 0) {
  for (const w of map.walls) {
    const x0 = w.x - pad, y0 = w.y - pad, x1 = w.x + w.w + pad, y1 = w.y + w.h + pad;
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    const p = [-dx, dx, -dy, dy], q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
    let hit = true;
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) { hit = false; break; } }
      else {
        const t = q[i] / p[i];
        if (p[i] < 0) { if (t > t1) { hit = false; break; } if (t > t0) t0 = t; }
        else { if (t < t0) { hit = false; break; } if (t < t1) t1 = t; }
      }
    }
    if (hit && t0 <= t1) return true;
  }
  return false;
}

export class Game {
  // players: [{ name, colorIndex, bot: null | "easy" | "medium" | "hard" }]
  constructor(players, opts = {}) {
    this.map = MAPS[opts.map || "yard"];
    this.rng = opts.rng || Math.random;
    this.time = 0;
    this.events = [];
    this.round = 0;
    this.matchWinner = null;
    this.lives = clamp(Math.round(opts.lives || RULES.DEFAULT_LIVES), 1, RULES.MAX_LIVES);
    this.tungs = players.map((p, i) => {
      const type = TYPES[p.type] ? p.type : TYPE_IDS[Math.floor(this.rng() * TYPE_IDS.length)]; // missing/random -> pick one
      return {
      id: i, name: p.name, colorIndex: p.colorIndex ?? i, bot: p.bot || null, wins: p.wins || 0,
      type, ts: typeStats(type),
      x: 0, y: 0, a: 0, hp: this.lives, alive: true,
      holding: false, holdStart: 0, throwCd: 0, invuln: 0, spinDir: 1,
      size: 1, sizeMs: 0, shield: 0, double: 0, left: false
    }; });
    this.bots = this.tungs.map((t) => (t.bot ? new Bot(this, t.id, BOT_LEVELS[t.bot], this.rng) : null));
    this.startRound();
  }

  emit(e) { this.events.push({ ...e, t: this.time }); }
  takeEvents() { const e = this.events; this.events = []; return e; }

  startRound() {
    this.round++;
    this.phase = "countdown";
    this.phaseMs = RULES.ROUND_START_MS;
    this.bats = [];
    this.crates = [];
    this.nextCrate = this.range(RULES.CRATE_EVERY_MS) * 0.5;
    this.roundWinner = null;
    this.nextBatId = 1;
    const order = this.tungs.map((t, i) => i);
    this.tungs.forEach((t, i) => {
      const s = this.map.spawns[t.colorIndex % this.map.spawns.length];
      Object.assign(t, { x: s.x, y: s.y, a: s.a, hp: this.maxLives(t), alive: !t.left, holding: false, throwCd: 0, invuln: 0,
        size: 1, sizeMs: 0, shield: 0, double: 0, spinDir: i % 2 === 0 ? 1 : -1 });
    });
    this.emit({ type: "round", round: this.round });
  }

  range([a, b]) { return a + this.rng() * (b - a); }
  maxLives(t) { return Math.max(1, this.lives + t.ts.lives); }
  radius(t) { return RULES.RADIUS * t.ts.size * (t.size > 1 ? 1.35 : t.size < 1 ? 0.7 : 1); }
  speed(t) { return RULES.MOVE_SPEED * t.ts.speed * (t.size > 1 ? 0.8 : t.size < 1 ? 1.3 : 1); }
  batSpeed(t) { return RULES.BAT_SPEED * t.ts.batSpeed; }

  // ---- input (one button per tung) ----
  // Every press throws a bat (if it's ready) and you run while holding.
  press(i) {
    const t = this.tungs[i];
    if (!t || t.holding) return;
    t.holding = true;
    t.holdStart = this.time;
    this.throwBat(t);
  }
  // Letting go flips your spin direction (clockwise <-> counter-clockwise)
  release(i) {
    const t = this.tungs[i];
    if (!t || !t.holding) return;
    t.holding = false;
    if (t.alive) t.spinDir = -t.spinDir;
  }
  removePlayer(i) {
    const t = this.tungs[i];
    if (!t) return;
    t.left = true; t.alive = false; t.holding = false;
  }

  throwBat(t) {
    if (this.phase !== "play" || !t.alive || t.throwCd > 0) return false;
    const mine = this.bats.filter((b) => b.owner === t.id).length;
    const per = t.double > 0 ? 2 : 1;
    if (mine + per > RULES.MAX_BATS * per) return false;
    const angles = per === 2 ? [t.a - 0.14, t.a + 0.14] : [t.a];
    const r = this.radius(t);
    for (const a of angles) {
      this.bats.push({
        id: this.nextBatId++, owner: t.id, x: t.x + Math.cos(a) * (r + 6), y: t.y + Math.sin(a) * (r + 6),
        vx: Math.cos(a) * this.batSpeed(t), vy: Math.sin(a) * this.batSpeed(t), life: RULES.BAT_LIFE_MS * t.ts.batLife, bounces: 0, maxBounces: t.ts.bounces, spin: 0
      });
    }
    t.throwCd = RULES.THROW_COOLDOWN_MS * t.ts.cooldown;
    this.emit({ type: "throw", who: t.id });
    return true;
  }

  // ---- simulation ----
  update(dt) {
    this.time += dt;
    const sec = dt / 1000;

    if (this.phase === "countdown") {
      this.phaseMs -= dt;
      if (this.phaseMs <= 0) { this.phase = "play"; this.emit({ type: "go" }); }
      for (const t of this.tungs) if (t.alive) t.a = wrapAngle(t.a + t.spinDir * RULES.SPIN_SPEED * t.ts.spin * sec);
      return;
    }
    if (this.phase === "roundEnd") {
      this.phaseMs -= dt;
      this.moveBats(sec, dt);
      if (this.phaseMs <= 0) {
        if (this.matchWinner !== null) this.phase = "matchEnd";
        else this.startRound();
      }
      return;
    }
    if (this.phase === "matchEnd") return;

    for (let i = 0; i < this.bots.length; i++) if (this.bots[i] && this.tungs[i].alive) this.bots[i].update(dt);

    for (const t of this.tungs) {
      if (!t.alive) continue;
      t.throwCd = Math.max(0, t.throwCd - dt);
      t.invuln = Math.max(0, t.invuln - dt);
      t.shield = Math.max(0, t.shield - dt);
      t.double = Math.max(0, t.double - dt);
      if (t.sizeMs > 0) { t.sizeMs -= dt; if (t.sizeMs <= 0) { t.size = 1; if (t.hp > this.maxLives(t)) t.hp = this.maxLives(t); } }

      if (t.holding) {
        t.x += Math.cos(t.a) * this.speed(t) * sec;
        t.y += Math.sin(t.a) * this.speed(t) * sec;
      } else {
        t.a = wrapAngle(t.a + t.spinDir * RULES.SPIN_SPEED * t.ts.spin * sec);
      }
      this.collideTung(t);
    }
    // tungs push each other apart
    for (let i = 0; i < this.tungs.length; i++) for (let j = i + 1; j < this.tungs.length; j++) {
      const a = this.tungs[i], b = this.tungs[j];
      if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, min = this.radius(a) + this.radius(b);
      if (d < min) { const p = (min - d) / 2; a.x -= (dx / d) * p; a.y -= (dy / d) * p; b.x += (dx / d) * p; b.y += (dy / d) * p; this.collideTung(a); this.collideTung(b); }
    }

    this.moveBats(sec, dt);
    this.updateCrates(dt);

    // round over?
    const alive = this.tungs.filter((t) => t.alive);
    const playing = this.tungs.filter((t) => !t.left);
    if (alive.length <= 1 && playing.length >= 1) {
      const w = alive[0] || null;
      this.roundWinner = w ? w.id : -1;
      if (w) { w.wins++; this.matchWinner = w.id; }
      if (playing.length === 1 && w) this.matchWinner = w.id;
      this.phase = "roundEnd";
      this.phaseMs = RULES.ROUND_END_MS;
      this.emit({ type: "roundEnd", winner: this.roundWinner, match: this.matchWinner });
    }
  }

  collideTung(t) {
    const r = this.radius(t), m = this.map;
    for (const w of m.walls) { const p = circleRect(t.x, t.y, r, w); if (p) { t.x += p.x; t.y += p.y; } }
    t.x = clamp(t.x, r, m.w - r);
    t.y = clamp(t.y, r, m.h - r);
  }

  moveBats(sec, dt) {
    const m = this.map;
    for (const b of this.bats) {
      b.life -= dt;
      b.spin += sec * 18;
      // move in small steps so fast bats can't pass through walls
      const steps = 3;
      for (let s = 0; s < steps && b.life > 0; s++) {
        b.x += (b.vx * sec) / steps;
        b.y += (b.vy * sec) / steps;
        let bounced = false;
        if (b.x < RULES.BAT_RADIUS || b.x > m.w - RULES.BAT_RADIUS) { b.vx = -b.vx; b.x = clamp(b.x, RULES.BAT_RADIUS, m.w - RULES.BAT_RADIUS); bounced = true; }
        if (b.y < RULES.BAT_RADIUS || b.y > m.h - RULES.BAT_RADIUS) { b.vy = -b.vy; b.y = clamp(b.y, RULES.BAT_RADIUS, m.h - RULES.BAT_RADIUS); bounced = true; }
        for (const w of m.walls) {
          const p = circleRect(b.x, b.y, RULES.BAT_RADIUS, w);
          if (p) {
            b.x += p.x; b.y += p.y;
            if (Math.abs(p.nx) > Math.abs(p.ny)) b.vx = -b.vx; else b.vy = -b.vy;
            bounced = true;
          }
        }
        if (bounced) { b.bounces++; if (b.bounces > b.maxBounces) { b.life = 0; this.emit({ type: "batBreak", x: b.x, y: b.y }); } }
        if (b.life <= 0 || this.phase !== "play") continue;
        // hit tungs
        for (const t of this.tungs) {
          if (!t.alive || t.id === b.owner) continue; // your own bats never hit you
          const r = this.radius(t) + RULES.BAT_RADIUS;
          if ((t.x - b.x) ** 2 + (t.y - b.y) ** 2 < r * r) { b.life = 0; this.hitTung(t, b); break; }
        }
        // hit crates
        if (b.life > 0) for (const c of this.crates) {
          if (!c.gone && (c.x - b.x) ** 2 + (c.y - b.y) ** 2 < (RULES.CRATE_RADIUS + RULES.BAT_RADIUS) ** 2) {
            b.life = 0; c.gone = true;
            const owner = this.tungs[b.owner];
            if (owner && owner.alive) this.applyCrate(owner, c);
            break;
          }
        }
      }
    }
    this.bats = this.bats.filter((b) => b.life > 0);
  }

  hitTung(t, b) {
    if (t.invuln > 0) return;
    if (t.shield > 0) { t.shield = 0; t.invuln = 300; this.emit({ type: "shieldPop", who: t.id, x: t.x, y: t.y }); return; }
    if (t.ts.tough > 0 && this.rng() < t.ts.tough) { t.invuln = 300; this.emit({ type: "tough", who: t.id, x: t.x, y: t.y }); return; }
    t.hp -= 1;
    t.invuln = RULES.HIT_INVULN_MS;
    this.emit({ type: "hit", who: t.id, by: b.owner, x: t.x, y: t.y });
    if (t.hp <= 0) {
      t.alive = false; t.holding = false;
      this.emit({ type: "ko", who: t.id, by: b.owner, x: t.x, y: t.y });
    }
  }

  updateCrates(dt) {
    this.crates = this.crates.filter((c) => !c.gone);
    this.nextCrate -= dt;
    if (this.nextCrate <= 0 && this.crates.length < RULES.CRATE_MAX) {
      this.nextCrate = this.range(RULES.CRATE_EVERY_MS);
      for (let tries = 0; tries < 30; tries++) {
        const x = 60 + this.rng() * (this.map.w - 120), y = 60 + this.rng() * (this.map.h - 120);
        if (this.map.walls.some((w) => circleRect(x, y, RULES.CRATE_RADIUS + 20, w))) continue;
        if (this.tungs.some((t) => t.alive && Math.hypot(t.x - x, t.y - y) < 90)) continue;
        const kinds = ["grow", "shrink", "shield", "double"];
        this.crates.push({ id: this.time + tries, x, y, kind: kinds[Math.floor(this.rng() * kinds.length)], gone: false });
        break;
      }
    }
    for (const c of this.crates) {
      if (c.gone) continue;
      for (const t of this.tungs) {
        if (t.alive && Math.hypot(t.x - c.x, t.y - c.y) < this.radius(t) + RULES.CRATE_RADIUS) { c.gone = true; this.applyCrate(t, c); break; }
      }
    }
  }

  applyCrate(t, c) {
    if (c.kind === "grow") { t.size = 1.35; t.sizeMs = RULES.EFFECT_MS; t.hp = Math.min(this.maxLives(t) + 1, t.hp + 1); }
    else if (c.kind === "shrink") { t.size = 0.7; t.sizeMs = RULES.EFFECT_MS; if (t.hp > this.maxLives(t)) t.hp = this.maxLives(t); }
    else if (c.kind === "shield") t.shield = RULES.SHIELD_MS;
    else if (c.kind === "double") t.double = RULES.EFFECT_MS;
    this.collideTung(t);
    this.emit({ type: "crate", who: t.id, kind: c.kind, x: c.x, y: c.y });
  }

  snapshot() {
    return {
      time: this.time, lives: this.lives, phase: this.phase, phaseMs: Math.round(this.phaseMs), round: this.round,
      roundWinner: this.roundWinner, matchWinner: this.matchWinner,
      tungs: this.tungs.map((t) => ({
        id: t.id, name: t.name, c: t.colorIndex, bot: t.bot, wins: t.wins, type: t.type, maxHp: this.maxLives(t),
        x: Math.round(t.x * 10) / 10, y: Math.round(t.y * 10) / 10, a: Math.round(t.a * 1000) / 1000,
        hp: t.hp, alive: t.alive, hold: t.holding, cd: Math.round(t.throwCd), inv: Math.round(t.invuln),
        size: t.size, shield: Math.round(t.shield), double: Math.round(t.double), left: t.left, spin: t.spinDir
      })),
      bats: this.bats.map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), s: Math.round(b.spin * 100) / 100, o: b.owner })),
      crates: this.crates.filter((c) => !c.gone).map((c) => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y), kind: c.kind }))
    };
  }
}

// ---------- Bots ----------
// Bots play with the SAME single button as people: they can only wait for their spin
// to line up, then tap (throw) or hold (run).
class Bot {
  constructor(game, id, cfg, rng) {
    this.g = game; this.id = id; this.cfg = cfg; this.rng = rng;
    this.thinkIn = 0;
    this.holdUntil = 0;
    this.tapRelease = 0;
    this.goal = null;
    this.nav = buildNav(game.map);
  }

  me() { return this.g.tungs[this.id]; }

  update(dt) {
    const g = this.g, me = this.me(), c = this.cfg;
    if (g.phase !== "play") { if (me.holding) g.release(this.id); return; }

    // finish a tap
    if (this.tapRelease && g.time >= this.tapRelease) { this.tapRelease = 0; g.release(this.id); return; }
    // finish a run
    if (me.holding && !this.tapRelease) {
      if (g.time >= this.holdUntil || this.wouldBump(me)) g.release(this.id, false);
      return;
    }

    this.thinkIn -= dt;
    const enemies = g.tungs.filter((t) => t.alive && t.id !== this.id);
    if (!enemies.length) return;

    // 1) dodge incoming bats (only possible if the way I'm facing gets me out of the way)
    if (c.dodge > 0) {
      const danger = this.incomingBat(me);
      if (danger && this.rng() < c.dodge * (dt / 60)) {
        const away = this.escapeAngle(me, danger);
        if (Math.abs(wrapAngle(me.a - away)) < 0.9) { this.run(260); return; }
      }
    }

    // 2) throw if lined up with someone
    if (me.throwCd <= 0) {
      for (const e of enemies) {
        const aim = this.aimAngle(me, e);
        if (aim === null) continue;
        // how far off can the throw be and still hit at this distance?
        const dist = Math.hypot(e.x - me.x, e.y - me.y);
        const tol = Math.atan2((this.g.radius(e) + RULES.BAT_RADIUS) * 0.85, dist) * c.aim;
        if (Math.abs(wrapAngle(me.a - aim)) < tol) {
          if (this.rng() < c.throwChance * (dt / 40)) { this.tap(); return; }
        }
      }
    }

    // 3) pick a place to go and run when facing it
    if (this.thinkIn <= 0) {
      this.thinkIn = this.g.range(c.think);
      this.goal = this.pickGoal(me, enemies);
    }
    if (this.goal) {
      const dir = Math.atan2(this.goal.y - me.y, this.goal.x - me.x);
      const dist = Math.hypot(this.goal.x - me.x, this.goal.y - me.y);
      // smarter bots don't waste a ready bat on a run when an enemy is in sight
      const saving = c.saveBats && me.throwCd <= 0 && enemies.some((e) => !lineBlocked(this.g.map, me.x, me.y, e.x, e.y, RULES.BAT_RADIUS));
      if (dist > 20 && !saving && Math.abs(wrapAngle(me.a - dir)) < c.moveTol) {
        this.run(Math.min(700, (dist / this.g.speed(me)) * 1000));
      }
    }
  }

  tap() { this.g.press(this.id); this.tapRelease = this.g.time + 40; }
  run(ms) { this.g.press(this.id); this.holdUntil = this.g.time + ms; }

  wouldBump(me) {
    const ahead = this.g.radius(me) + 14;
    const x = me.x + Math.cos(me.a) * ahead, y = me.y + Math.sin(me.a) * ahead;
    const m = this.g.map;
    if (x < 4 || y < 4 || x > m.w - 4 || y > m.h - 4) return true;
    return m.walls.some((w) => x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h);
  }

  aimAngle(me, e) {
    const g = this.g;
    if (lineBlocked(g.map, me.x, me.y, e.x, e.y, RULES.BAT_RADIUS)) return null;
    let tx = e.x, ty = e.y;
    if (this.cfg.lead > 0 && e.holding) {
      const tFly = Math.hypot(e.x - me.x, e.y - me.y) / g.batSpeed(me);
      tx += Math.cos(e.a) * g.speed(e) * tFly * this.cfg.lead;
      ty += Math.sin(e.a) * g.speed(e) * tFly * this.cfg.lead;
    }
    return Math.atan2(ty - me.y, tx - me.x);
  }

  incomingBat(me) {
    const r = this.g.radius(me) + RULES.BAT_RADIUS + 8;
    for (const b of this.g.bats) {
      if (b.owner === this.id) continue;
      const rx = me.x - b.x, ry = me.y - b.y;
      const v2 = b.vx * b.vx + b.vy * b.vy;
      const tClose = (rx * b.vx + ry * b.vy) / v2;
      if (tClose < 0 || tClose > 0.7) continue;
      const cx = b.x + b.vx * tClose - me.x, cy = b.y + b.vy * tClose - me.y;
      if (cx * cx + cy * cy < r * r) return b;
    }
    return null;
  }

  escapeAngle(me, b) {
    // move sideways to the bat's path, choosing the side I'm already on
    const pa = Math.atan2(b.vy, b.vx);
    const side = (me.x - b.x) * b.vy - (me.y - b.y) * b.vx > 0 ? -1 : 1;
    return pa + side * (Math.PI / 2);
  }

  pickGoal(me, enemies) {
    const g = this.g;
    // grab a crate?
    if (g.crates.length && this.rng() < this.cfg.crates) {
      let best = null, bd = 1e9;
      for (const c of g.crates) { const d = Math.hypot(c.x - me.x, c.y - me.y); if (d < bd) { bd = d; best = c; } }
      if (best && bd < 500) return this.nextStep(me, best);
    }
    // otherwise go find the nearest enemy, but keep some distance
    let target = null, td = 1e9;
    for (const e of enemies) { const d = Math.hypot(e.x - me.x, e.y - me.y); if (d < td) { td = d; target = e; } }
    if (!target) return null;
    const see = !lineBlocked(g.map, me.x, me.y, target.x, target.y, RULES.BAT_RADIUS);
    if (see && td < 330) {
      // close and visible: strafe to a random nearby spot
      const a = this.rng() * TAU;
      return { x: clamp(me.x + Math.cos(a) * 120, 40, g.map.w - 40), y: clamp(me.y + Math.sin(a) * 120, 40, g.map.h - 40) };
    }
    return this.nextStep(me, target);
  }

  // path-finding on a coarse grid around the walls
  nextStep(me, target) {
    const n = this.nav, g = this.g;
    if (!lineBlocked(g.map, me.x, me.y, target.x, target.y, g.radius(me))) return { x: target.x, y: target.y };
    const start = n.cellOf(me.x, me.y), goal = n.cellOf(target.x, target.y);
    const prev = new Map([[start, -1]]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === goal) break;
      for (const nb of n.neighbors(cur)) if (!prev.has(nb)) { prev.set(nb, cur); queue.push(nb); }
    }
    if (!prev.has(goal)) return { x: target.x, y: target.y };
    const path = [];
    for (let c = goal; c !== -1; c = prev.get(c)) path.push(c);
    path.reverse();
    // furthest point along the path I can run to in a straight line
    let pick = path[Math.min(1, path.length - 1)];
    for (const c of path) { const p = n.center(c); if (!lineBlocked(g.map, me.x, me.y, p.x, p.y, g.radius(me))) pick = c; else break; }
    return n.center(pick);
  }
}

function buildNav(map) {
  const size = 50;
  const cols = Math.ceil(map.w / size), rows = Math.ceil(map.h / size);
  const free = new Array(cols * rows).fill(true);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * size + size / 2, y = r * size + size / 2;
    if (map.walls.some((w) => circleRect(x, y, 26, w))) free[r * cols + c] = false;
  }
  return {
    cellOf(x, y) { return clamp(Math.floor(y / size), 0, rows - 1) * cols + clamp(Math.floor(x / size), 0, cols - 1); },
    center(i) { return { x: (i % cols) * size + size / 2, y: Math.floor(i / cols) * size + size / 2 }; },
    neighbors(i) {
      const c = i % cols, r = Math.floor(i / cols), out = [];
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc >= 0 && nr >= 0 && nc < cols && nr < rows && free[nr * cols + nc]) out.push(nr * cols + nc);
      }
      return out;
    }
  };
}
