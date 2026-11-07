// Tung Boxing - fight engine
// This one file runs the fight rules. The browser uses it for single player,
// and the game server uses the exact same file for online matches,
// so the rules are always identical.
//
// All times are in milliseconds.

export const RULES = {
  START_HP: 20,
  QUICK_MS: 160,             // hold shorter than this = quick jab (1 damage)
  MS_PER_DAMAGE: 280,        // each extra damage point takes this much more holding
  MAX_DAMAGE: 5,
  FULL_HOLD_LIMIT_MS: 1500,  // holding at full power longer than this throws the punch automatically
  STRIKE_MS: 420,            // release -> impact. This is the defender's reaction window.
  COUNTER_STRIKE_MS: 250,    // punch thrown right after a successful dodge travels faster
  COUNTER_WINDOW_MS: 600,    // how long after a dodge the fast counter is available
  PUNCH_COOLDOWN_MS: 380,    // after a punch lands/misses
  DODGE_STARTUP_MS: 70,      // dodge takes this long to start protecting you
  DODGE_CANCEL_EXTRA_MS: 90, // extra startup when dodging out of a wind-up
  DODGE_ACTIVE_MS: 380,      // how long a dodge protects you
  DODGE_COOLDOWN_MS: 450,
  PARRY_WINDOW_MS: 100,      // release your punch within this long before their punch lands = parry
  STUN_MS: 1500,
  ONLINE_EXTRA_STRIKE_MS: 90, // online matches give a bit more reaction time to cover internet delay

  // --- anti-spam / counter rewards ---
  COUNTER_BONUS_DAMAGE: 2,     // counter punches (thrown right after a dodge) do this much extra
  WHIFF_NO_DODGE_MS: 600,      // after your punch gets dodged you can't dodge for this long (off balance)
  WHIFF_EXTRA_COOLDOWN_MS: 250,// ...and your next punch takes this much longer
  FATIGUE_WINDOW_MS: 1200,     // punches thrown within this long of the previous one count as a flurry
  FATIGUE_STEP_MS: 180,        // each punch in a flurry adds this much to the punch cooldown
  FATIGUE_MAX_STEPS: 5
};

// ---------- Playable tungs ----------
// Every tung starts from the base rules above; these change only what is listed.
export const CHARACTERS = {
  grey: {
    name: "Grey Tung", color: "#9a9a9a",
    hp: 28,
    dodgeCooldown: 500, chargeRate: 0.8,
    perks: ["28 health (others have 20)", "Heavy: winds up slower", "Heavy: dodge recharges slower"]
  },
  red: {
    name: "Red Tung", color: "#d8453b",
    chargeRate: 1.5, maxDamage: 7,
    perks: ["Winds up punches faster", "Max punch is 7 instead of 5"]
  },
  blue: {
    name: "Blue Tung", color: "#3f7fd9",
    dodgeStartup: 50,
    perks: ["Dodges faster: more time to react"]
  },
  pink: {
    name: "Pink Tung", color: "#ef7fb8",
    luck: true,
    perks: ["Each hit: 20% chance -1 damage, 20% chance +2", "1% chance to drop the opponent to 1 health"]
  },
  brown: {
    name: "Brown Tung", color: "#8a5a2e",
    armoredWindup: true, hp: 23,
    perks: ["Getting hit does NOT reset his wind-up", "23 health"]
  },
  yellow: {
    name: "Yellow Tung", color: "#f2c230",
    canDodgeDown: true, downStartup: 70,
    perks: ["Dodge down: dodges left AND right punches", "Dodge down is normal speed"]
  }
};

// ---------- Computer opponents (no special abilities) ----------
export const OPPONENTS = [
  { level: 1, name: "White Tung",  color: "#f2efe8", dodgeChance: 0.10, idle: [1700, 2800], heavy: 0.15, counter: 0.0,  parry: 0.0,  interrupt: 0.0,  react: [200, 300], followUp: 0.0 },
  { level: 2, name: "Orange Tung", color: "#f08a2a", dodgeChance: 0.30, idle: [1300, 2300], heavy: 0.25, counter: 0.15, parry: 0.0,  interrupt: 0.05, react: [180, 280], followUp: 0.0 },
  { level: 3, name: "Purple Tung", color: "#8d4fd1", dodgeChance: 0.50, idle: [850, 1600], heavy: 0.35, counter: 0.45, parry: 0.05, interrupt: 0.2, react: [160, 260], followUp: 0.1 },
  { level: 4, name: "Green Tung",  color: "#3fae55", dodgeChance: 0.70, idle: [750, 1400],  heavy: 0.40, counter: 0.7,  parry: 0.10, interrupt: 0.35, react: [140, 240], followUp: 0.3 },
  { level: 5, name: "Black Tung",  color: "#26221f", dodgeChance: 0.90, idle: [330, 750],   heavy: 0.5,  counter: 1.0,  parry: 0.4,  interrupt: 0.85,  react: [110, 200], followUp: 0.75 }
];

function statsFor(def) {
  return {
    name: def.name,
    color: def.color,
    hp: def.hp ?? RULES.START_HP,
    chargeRate: def.chargeRate ?? 1,
    maxDamage: def.maxDamage ?? RULES.MAX_DAMAGE,
    dodgeStartup: def.dodgeStartup ?? RULES.DODGE_STARTUP_MS,
    dodgeCooldown: def.dodgeCooldown ?? RULES.DODGE_COOLDOWN_MS,
    luck: !!def.luck,
    armoredWindup: !!def.armoredWindup,
    canDodgeDown: !!def.canDodgeDown,
    downStartup: def.downStartup ?? RULES.DODGE_STARTUP_MS
  };
}

export function damageForCharge(stats, chargeMs) {
  if (chargeMs < RULES.QUICK_MS) return 1;
  const per = RULES.MS_PER_DAMAGE / stats.chargeRate;
  return Math.min(stats.maxDamage, 1 + Math.floor((chargeMs - RULES.QUICK_MS) / per));
}

export function chargeForDamage(stats, dmg) {
  if (dmg <= 1) return 0;
  return RULES.QUICK_MS + (dmg - 1) * (RULES.MS_PER_DAMAGE / stats.chargeRate) + 5;
}

function makeFighter(def) {
  const s = statsFor(def);
  return {
    s,
    hp: s.hp,
    state: "idle",       // idle | charging | striking | dodgeStartup | dodging | stunned
    hand: null,          // "L" | "R" for punches
    dir: null,           // "L" | "R" | "D" for dodges
    timer: 0,            // ms left in the current state (striking, dodgeStartup, dodging, stunned)
    strikeTotal: 0,
    chargeMs: 0,
    fullHoldMs: 0,
    damage: 0,
    punchId: 0,
    punchCd: 0,
    dodgeCd: 0,
    counterMs: 0,        // >0 = next punch is a fast counter
    isCounter: false,
    held: { L: false, R: false },
    consumed: { L: false, R: false },
    pressAt: { L: 0, R: 0 },
    tapQueued: null,
    dodgeQueued: null,
    flurry: 0,
    lastThrowAt: -1e9,
    offBalanceMs: 0
  };
}

// A single fight between fighter 0 and fighter 1.
export class Match {
  constructor(defA, defB, opts = {}) {
    this.f = [makeFighter(defA), makeFighter(defB)];
    this.rng = opts.rng || Math.random;
    this.strikeBonus = opts.online ? RULES.ONLINE_EXTRA_STRIKE_MS : 0;
    this.time = 0;
    this.events = [];
    this.winner = null;
    this.nextPunchId = 1;
  }

  emit(e) { this.events.push({ ...e, t: this.time }); }
  takeEvents() { const e = this.events; this.events = []; return e; }

  // ---- Player actions ----
  punchStart(i, hand) {
    const f = this.f[i];
    if (this.winner !== null || f.state !== "idle" || f.punchCd > 0) return false;
    f.state = "charging";
    f.hand = hand === "R" ? "R" : "L";
    f.chargeMs = 0;
    f.fullHoldMs = 0;
    return true;
  }

  punchRelease(i, hand) {
    const f = this.f[i];
    if (f.state !== "charging" || (hand && hand !== f.hand)) return false;
    const foe = this.f[1 - i];
    f.damage = damageForCharge(f.s, f.chargeMs);
    f.isCounter = f.counterMs > 0;
    if (f.isCounter) f.damage += RULES.COUNTER_BONUS_DAMAGE;
    f.counterMs = 0;
    // flurry tiredness: punching again soon after the last punch
    f.flurry = (this.time - f.lastThrowAt < RULES.FATIGUE_WINDOW_MS) ? Math.min(RULES.FATIGUE_MAX_STEPS, f.flurry + 1) : 0;
    f.lastThrowAt = this.time;
    f.strikeTotal = (f.isCounter ? RULES.COUNTER_STRIKE_MS : RULES.STRIKE_MS) + this.strikeBonus;
    f.timer = f.strikeTotal;
    f.state = "striking";
    f.consumed[f.hand] = true; // must let go of the button before the next punch
    f.punchId = this.nextPunchId++;
    this.emit({ type: "throw", who: i, hand: f.hand, damage: f.damage, counter: f.isCounter, strikeMs: f.strikeTotal });

    // Parry: released just before the opponent's punch lands
    if (foe.state === "striking" && foe.timer <= RULES.PARRY_WINDOW_MS) {
      foe.state = "stunned";
      foe.timer = RULES.STUN_MS;
      foe.chargeMs = 0;
      this.emit({ type: "parry", who: i });
    }
    return true;
  }

  dodge(i, dir) {
    const f = this.f[i];
    if (this.winner !== null || f.dodgeCd > 0) return false;
    if (dir === "D" && !f.s.canDodgeDown) return false;
    if (f.state !== "idle" && f.state !== "charging") return false;
    let startup = dir === "D" ? f.s.downStartup : f.s.dodgeStartup;
    if (f.state === "charging") startup += RULES.DODGE_CANCEL_EXTRA_MS;
    f.state = "dodgeStartup";
    f.dir = dir;
    f.chargeMs = 0;
    f.timer = startup;
    if (startup <= 0) { f.state = "dodging"; f.timer = RULES.DODGE_ACTIVE_MS; }
    return true;
  }

  // ---- Button-style input (used by human players) ----
  // Pressing early (during a cooldown) is remembered for a moment so it still happens.
  press(i, hand) {
    const f = this.f[i];
    hand = hand === "R" ? "R" : "L";
    f.held[hand] = true;
    f.consumed[hand] = false;
    f.pressAt[hand] = this.time;
    this.punchStart(i, hand);
  }

  release(i, hand) {
    const f = this.f[i];
    hand = hand === "R" ? "R" : "L";
    const wasHeld = f.held[hand];
    f.held[hand] = false;
    if (f.state === "charging" && f.hand === hand) { this.punchRelease(i, hand); return; }
    // quick tap made while not ready: throw a jab as soon as possible
    if (wasHeld && !f.consumed[hand] && this.time - f.pressAt[hand] < 250) f.tapQueued = { hand, until: this.time + 250 };
  }

  dodgePress(i, dir) {
    if (!this.dodge(i, dir)) this.f[i].dodgeQueued = { dir, until: this.time + 140 };
  }

  pumpInput(i) {
    const f = this.f[i];
    if (f.dodgeQueued) {
      if (this.time > f.dodgeQueued.until) f.dodgeQueued = null;
      else if (this.dodge(i, f.dodgeQueued.dir)) f.dodgeQueued = null;
    }
    if (f.state !== "idle" || f.punchCd > 0) return;
    if (f.tapQueued) {
      const q = f.tapQueued; f.tapQueued = null;
      if (this.time <= q.until && this.punchStart(i, q.hand)) this.punchRelease(i, q.hand);
      return;
    }
    for (const h of ["L", "R"]) {
      if (f.held[h] && !f.consumed[h]) { this.punchStart(i, h); return; }
    }
  }

  // ---- Simulation step ----
  update(dt) {
    if (this.winner !== null) return;
    this.time += dt;
    this.pumpInput(0);
    this.pumpInput(1);
    for (let i = 0; i < 2; i++) {
      const f = this.f[i];
      f.punchCd = Math.max(0, f.punchCd - dt);
      f.dodgeCd = Math.max(0, f.dodgeCd - dt);
      f.counterMs = Math.max(0, f.counterMs - dt);
      f.offBalanceMs = Math.max(0, f.offBalanceMs - dt);

      if (f.state === "charging") {
        f.chargeMs += dt;
        if (damageForCharge(f.s, f.chargeMs) >= f.s.maxDamage) {
          f.fullHoldMs += dt;
          if (f.fullHoldMs >= RULES.FULL_HOLD_LIMIT_MS) this.punchRelease(i);
        }
      } else if (f.state === "dodgeStartup") {
        f.timer -= dt;
        if (f.timer <= 0) { f.state = "dodging"; f.timer = RULES.DODGE_ACTIVE_MS + f.timer; }
      } else if (f.state === "dodging") {
        f.timer -= dt;
        if (f.timer <= 0) { f.state = "idle"; f.dir = null; f.dodgeCd = f.s.dodgeCooldown; }
      } else if (f.state === "stunned") {
        f.timer -= dt;
        if (f.timer <= 0) { f.state = "idle"; f.punchCd = 0; }
      }
    }
    // Resolve punches after timers so both fighters are up to date
    for (let i = 0; i < 2; i++) {
      const f = this.f[i];
      if (f.state !== "striking") continue;
      f.timer -= dt;
      if (f.timer <= 0) this.land(i);
    }
  }

  land(i) {
    const f = this.f[i];
    const foe = this.f[1 - i];
    f.state = "idle";
    f.punchCd = RULES.PUNCH_COOLDOWN_MS + f.flurry * RULES.FATIGUE_STEP_MS;
    const dodged = foe.state === "dodging" && (foe.dir === "D" || foe.dir === f.hand);
    if (dodged) {
      foe.counterMs = RULES.COUNTER_WINDOW_MS;
      // missing leaves you off balance
      f.punchCd += RULES.WHIFF_EXTRA_COOLDOWN_MS;
      f.dodgeCd = Math.max(f.dodgeCd, RULES.WHIFF_NO_DODGE_MS);
      f.offBalanceMs = RULES.WHIFF_NO_DODGE_MS;
      this.emit({ type: "dodged", who: 1 - i, hand: f.hand });
      return;
    }
    let dmg = f.damage;
    let special = null;
    if (f.s.luck) {
      const u = this.rng();
      if (u < 0.01 && foe.hp > 1) { special = "jackpot"; }
      else if (u < 0.21) { dmg = Math.max(0, dmg - 1); special = "weak"; }
      else if (u < 0.41) { dmg += 2; special = "lucky"; }
    }
    if (special === "jackpot") { dmg = foe.hp - 1; foe.hp = 1; }
    else foe.hp = Math.max(0, foe.hp - dmg);
    if (foe.state === "charging" && !foe.s.armoredWindup) foe.chargeMs = 0;
    this.emit({ type: "hit", who: i, hand: f.hand, damage: dmg, special, counter: f.isCounter });
    if (foe.hp <= 0) {
      this.winner = i;
      this.emit({ type: "ko", who: i });
    }
  }

  // Compact copy of the fight, for sending over the internet / drawing
  snapshot() {
    return {
      time: this.time,
      winner: this.winner,
      f: this.f.map((f) => ({
        hp: f.hp, maxHp: f.s.hp, state: f.state, hand: f.hand, dir: f.dir,
        timer: Math.round(f.timer), strikeTotal: f.strikeTotal, chargeMs: Math.round(f.chargeMs),
        damage: f.damage, punchCd: Math.round(f.punchCd), dodgeCd: Math.round(f.dodgeCd),
        counterMs: Math.round(f.counterMs), isCounter: f.isCounter, punchId: f.punchId,
        offBalanceMs: Math.round(f.offBalanceMs), flurry: f.flurry
      }))
    };
  }
}

// ---------- Computer brain ----------
// Controls one fighter in a Match. Used for single-player opponents (and for balance testing).
export class Brain {
  constructor(match, me, cfg, rng = Math.random) {
    this.m = match;
    this.me = me;
    this.cfg = cfg;
    this.rng = rng;
    this.seenPunch = 0;
    this.plan = [];        // scheduled actions: {at, fn}
    this.nextAttack = match.time + this.range(cfg.idle) * 0.6;
    this.targetCharge = 0;
    this.lastDodgedSeen = 0;
  }

  range([a, b]) { return a + this.rng() * (b - a); }
  schedule(delay, fn) { this.plan.push({ at: this.m.time + delay, fn }); }

  pickDamage(stats) {
    // Mix of quick jabs, medium and heavy punches: sometimes fast, sometimes slow
    const r = this.rng();
    if (r < this.cfg.heavy) return Math.max(3, Math.round(stats.maxDamage * (0.7 + this.rng() * 0.3)));
    if (r < this.cfg.heavy + 0.35) return 1;
    return 2 + Math.floor(this.rng() * 2);
  }

  update() {
    const m = this.m, me = m.f[this.me], foe = m.f[1 - this.me], c = this.cfg;
    if (m.winner !== null) return;

    // run scheduled actions
    for (let k = this.plan.length - 1; k >= 0; k--) {
      if (this.plan[k].at <= m.time) { const p = this.plan.splice(k, 1)[0]; p.fn(); }
    }

    // React to a new incoming punch
    if (foe.state === "striking" && foe.punchId !== this.seenPunch) {
      this.seenPunch = foe.punchId;
      const impactIn = foe.timer;
      const canPunch = (me.state === "idle" && me.punchCd <= 0);
      if (canPunch && this.rng() < c.parry) {
        // aim for the middle of the parry window, with some timing error
        const err = c.parryError ? c.parryError(this.rng) : (this.rng() - 0.5) * 60;
        const releaseIn = Math.max(0, impactIn - 50 + err);
        this.schedule(releaseIn, () => { if (m.punchStart(this.me, this.rng() < 0.5 ? "L" : "R")) m.punchRelease(this.me); });
      } else if (this.rng() < c.dodgeChance) {
        let react = c.humanReact ? c.humanReact(this.rng) : this.range(c.react);
        let dir = me.s.canDodgeDown && c.useDown ? "D" : foe.hand;
        if (dir !== "D" && c.misread && this.rng() < c.misread) dir = dir === "L" ? "R" : "L";
        // Keep trying from "reaction time" until it's too late to make it
        this.pendingDodge = { from: m.time + react, punchId: foe.punchId, dir };
      }
    }
    if (this.pendingDodge) {
      const pd = this.pendingDodge;
      if (foe.state !== "striking" || foe.punchId !== pd.punchId) this.pendingDodge = null;
      else if (m.time >= pd.from) {
        const startup = (pd.dir === "D" ? me.s.downStartup : me.s.dodgeStartup) + (me.state === "charging" ? RULES.DODGE_CANCEL_EXTRA_MS : 0);
        if (startup >= foe.timer) this.pendingDodge = null;          // too late now
        else if (m.dodge(this.me, pd.dir)) this.pendingDodge = null; // dodged
      }
    }

    // Counter-punch right after a successful dodge
    if (me.counterMs > this.prevCounter) {
      // just dodged something: decide once whether to punish it
      if (this.rng() < c.counter) {
        const delay = (c.counterDelay ? c.counterDelay(this.rng) : 60 + this.rng() * 120);
        this.schedule(delay, () => {
          if (m.punchStart(this.me, this.rng() < 0.5 ? "L" : "R")) {
            this.targetCharge = this.rng() < 0.3 ? chargeForDamage(me.s, 2) : 0;
          }
        });
      }
    }
    this.prevCounter = me.counterMs;

    // Interrupt the opponent's big wind-up with a quick jab
    if (foe.state === "charging" && foe.chargeMs > 400 && me.state === "idle" && me.punchCd <= 0 && !this.interruptTried) {
      this.interruptTried = true;
      if (this.rng() < c.interrupt) { if (m.punchStart(this.me, this.rng() < 0.5 ? "L" : "R")) this.targetCharge = 0; }
    }
    if (foe.state !== "charging") this.interruptTried = false;

    // Combo: throw another punch as soon as possible after the last one
    if (this.wasStriking && me.state === "idle" && this.rng() < (c.followUp || 0)) {
      this.nextAttack = m.time;
      this.comboQuick = true;
    }
    this.wasStriking = me.state === "striking";

    // Start a normal attack
    if (me.state === "idle" && me.punchCd <= 0 && m.time >= this.nextAttack && foe.state !== "striking") {
      if (m.punchStart(this.me, this.rng() < 0.5 ? "L" : "R")) {
        this.targetCharge = this.comboQuick ? chargeForDamage(me.s, 1 + Math.floor(this.rng() * 2)) : chargeForDamage(me.s, this.pickDamage(me.s));
        this.comboQuick = false;
        this.nextAttack = m.time + this.range(c.idle);
      }
    }

    // Release when charged enough
    // (but don't throw if about to dodge an incoming punch)
    if (me.state === "charging" && me.chargeMs >= this.targetCharge && !this.pendingDodge) m.punchRelease(this.me);
  }
}
