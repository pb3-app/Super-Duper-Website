/* Tung Tung Phase 10: the rules, with no screen. The server runs a room with it (so nobody can see another hand) and the
   page runs it for a game against the computer. Same code both times.

   Each hand: draw a card, then (once you can) lay down your phase, hit cards onto laid groups, and discard one card.
   Go out first to end the hand; everybody else scores the cards left in their hand. A player who laid down their phase
   moves on to the next phase. First to finish `phases` phases wins (lowest score if several finish in the same hand).

   Engine.create(players, { phases }) -> state      players: [{ id, name, bot }]
   Engine.view(state, id)             -> what that player may see
   Engine.act(state, id, action)      -> { ok, error? }
       { t: 'draw', from: 'deck' | 'disc' }   { t: 'lay', ids?: [cardId] }   { t: 'hit', card, pid, g, end? }
       { t: 'discard', card, target? }         { t: 'next' }  (ready for the next hand)
   Engine.botAct(state, id), Engine.turnOf(state), Engine.ranking(state) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Phase10Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COLORS = ['R', 'B', 'G', 'Y'];
  const MIN_PLAYERS = 2, MAX_PLAYERS = 6, HAND = 10;
  const set = (n) => ({ k: 'set', n }), run = (n) => ({ k: 'run', n }), color = (n) => ({ k: 'color', n });
  const PHASES = [
    [set(3), set(3)], [set(3), run(4)], [set(4), run(4)], [run(7)], [run(8)],
    [run(9)], [set(4), set(4)], [color(7)], [set(5), set(2)], [set(5), set(3)],
  ];
  const PHASE_TEXT = ['2 sets of 3', '1 set of 3 + 1 run of 4', '1 set of 4 + 1 run of 4', '1 run of 7', '1 run of 8', '1 run of 9', '2 sets of 4', '7 cards of one colour', '1 set of 5 + 1 set of 2', '1 set of 5 + 1 set of 3'];

  function makeDeck() {
    const d = []; let id = 0;
    for (const c of COLORS) for (let k = 0; k < 2; k++) for (let n = 1; n <= 12; n++) d.push({ id: id++, c, n });
    for (let k = 0; k < 8; k++) d.push({ id: id++, c: 'W', n: 0 });
    for (let k = 0; k < 4; k++) d.push({ id: id++, c: 'S', n: 0 });
    return d;
  }
  const points = (c) => (c.c === 'S' ? 15 : c.c === 'W' ? 25 : c.n <= 9 ? 5 : 10);
  function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const say = (s, text) => { s.log.push({ n: ++s.seq, text }); if (s.log.length > 14) s.log.shift(); };
  const top = (s) => s.disc[s.disc.length - 1];
  const isNat = (c) => c.c !== 'W' && c.c !== 'S';

  function create(players, opts) {
    opts = opts || {};
    const s = {
      players: players.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot, hand: [], phase: 1, done: 0, score: 0, laid: null, skipMe: false })),
      draw: [], disc: [], turn: 0, stage: 'draw', handNo: 0, target: [2, 3, 5, 10].includes(opts.phases) ? opts.phases : 5, winner: null, log: [], seq: 0,
      rng: opts.rng || Math.random, ready: [], result: null, first: -1,
    };
    startHand(s);
    return s;
  }

  function startHand(s) {
    s.handNo++; s.stage = 'draw'; s.result = null; s.ready = [];
    s.draw = shuffle(makeDeck(), s.rng); s.disc = [];
    for (const p of s.players) { p.hand = []; p.laid = null; p.skipMe = false; }
    for (let r = 0; r < HAND; r++) for (const p of s.players) p.hand.push(s.draw.pop());
    let first = s.draw.pop();
    while (first.c === 'S') { s.draw.unshift(first); first = s.draw.pop(); }
    s.disc.push(first);
    s.first = (s.first + 1) % s.players.length; s.turn = s.first;
    say(s, 'Hand ' + s.handNo + ': deal! Everybody is on their own phase.');
  }

  function reshuffle(s) { const t = s.disc.pop(); s.draw = shuffle(s.disc, s.rng); s.disc = [t]; }

  // ---------- phases: can this hand make it? ----------
  function candidates(d, nats, wilds) {
    const out = [];
    if (d.k === 'set') {
      for (let v = 12; v >= 1; v--) {
        const L = nats.filter((c) => c.n === v), k = Math.min(L.length, d.n), w = d.n - k;
        if (k >= 1 && w <= wilds) out.push({ nat: L.slice(0, k), w, num: v });
      }
    } else if (d.k === 'run') {
      for (let st = 13 - d.n; st >= 1; st--) {
        const nat = []; let w = 0;
        for (let j = 0; j < d.n; j++) { const c = nats.find((x) => x.n === st + j && !nat.includes(x)); if (c) nat.push(c); else w++; }
        if (nat.length >= 1 && w <= wilds) out.push({ nat, w, start: st });
      }
    } else {
      for (const col of COLORS) {
        const L = nats.filter((c) => c.c === col).sort((a, b) => b.n - a.n), k = Math.min(L.length, d.n), w = d.n - k;
        if (k >= 1 && w <= wilds) out.push({ nat: L.slice(0, k), w, col });
      }
    }
    return out.sort((a, b) => a.w - b.w);
  }
  function buildGroup(d, cand, wildCards) {
    if (d.k === 'set') return { k: 'set', num: cand.num, cards: [...cand.nat.map((card) => ({ card, n: cand.num })), ...wildCards.map((card) => ({ card, n: cand.num }))] };
    if (d.k === 'color') return { k: 'color', color: cand.col, cards: [...cand.nat.map((card) => ({ card, n: card.n })), ...wildCards.map((card) => ({ card, n: 0 }))] };
    const cards = []; let wi = 0;
    for (let j = 0; j < d.n; j++) { const v = cand.start + j, c = cand.nat.find((x) => x.n === v); cards.push(c ? { card: c, n: v } : { card: wildCards[wi++], n: v }); }
    return { k: 'run', lo: cand.start, hi: cand.start + d.n - 1, cards };
  }
  // find cards in `hand` (or only those in `only`) that make `defs`; returns groups or null
  function solve(hand, defs, only) {
    const cards = only ? hand.filter((c) => only.includes(c.id)) : hand;
    const nats = cards.filter(isNat), wilds = cards.filter((c) => c.c === 'W');
    const rec = (di, ns, ws, groups) => {
      if (di === defs.length) return groups;
      for (const cand of candidates(defs[di], ns, ws.length)) {
        const rest = ns.filter((c) => !cand.nat.includes(c));
        const res = rec(di + 1, rest, ws.slice(cand.w), groups.concat([buildGroup(defs[di], cand, ws.slice(0, cand.w))]));
        if (res) return res;
      }
      return null;
    };
    return rec(0, nats, wilds, []);
  }
  // can `card` be added to `g`? returns { end } or null
  function hitSpot(g, card, end) {
    if (card.c === 'S') return null;
    if (g.k === 'set') return card.c === 'W' || card.n === g.num ? { n: g.num } : null;
    if (g.k === 'color') return card.c === 'W' || card.c === g.color ? { n: card.c === 'W' ? 0 : card.n } : null;
    if (card.c === 'W') {
      const e = end === 'lo' && g.lo > 1 ? 'lo' : end === 'hi' && g.hi < 12 ? 'hi' : g.hi < 12 ? 'hi' : g.lo > 1 ? 'lo' : null;
      return e ? { end: e, n: e === 'hi' ? g.hi + 1 : g.lo - 1 } : null;
    }
    if (card.n === g.hi + 1 && g.hi < 12) return { end: 'hi', n: card.n };
    if (card.n === g.lo - 1 && g.lo > 1) return { end: 'lo', n: card.n };
    return null;
  }

  // ---------- the moves ----------
  function nextTurn(s) {
    const n = s.players.length; let i = s.turn;
    for (let k = 0; k < n; k++) {
      i = (i + 1) % n;
      const p = s.players[i];
      if (p.skipMe) { p.skipMe = false; say(s, p.name + ' is skipped.'); continue; }
      break;
    }
    s.turn = i; s.stage = 'draw';
  }

  function act(s, id, a) {
    if (s.stage === 'over') return { ok: false, error: 'The game is over' };
    if (!a || typeof a !== 'object') return { ok: false, error: 'Bad move' };
    const me = s.players.find((p) => p.id === id);
    if (!me) return { ok: false, error: 'You are not in this game' };
    if (a.t === 'next') {
      if (s.stage !== 'handEnd') return { ok: false, error: 'Not now' };
      if (!s.ready.includes(id)) s.ready.push(id);
      if (s.players.filter((p) => !p.bot).every((p) => s.ready.includes(p.id))) startHand(s);
      return { ok: true };
    }
    if (s.stage === 'handEnd') return { ok: false, error: 'The hand is over' };
    if (s.players[s.turn].id !== id) return { ok: false, error: 'It is not your turn' };
    const need = (st) => (s.stage === st ? null : { ok: false, error: st === 'draw' ? 'You already drew: lay down, hit or discard' : 'Draw a card first' });

    if (a.t === 'draw') {
      const bad = need('draw'); if (bad) return bad;
      if (a.from === 'disc') {
        if (!s.disc.length || top(s).c === 'S') return { ok: false, error: 'You cannot pick up a Skip' };
        me.hand.push(s.disc.pop()); say(s, me.name + ' took the ' + cardText(me.hand[me.hand.length - 1]) + '.');
      } else {
        if (!s.draw.length) reshuffle(s);
        if (!s.draw.length) return { ok: false, error: 'No cards left to draw' };
        me.hand.push(s.draw.pop()); say(s, me.name + ' drew a card.');
      }
      s.stage = 'play'; return { ok: true };
    }
    const bad = need('play'); if (bad) return bad;

    if (a.t === 'lay') {
      if (me.laid) return { ok: false, error: 'You already laid down your phase' };
      const groups = solve(me.hand, PHASES[me.phase - 1], Array.isArray(a.ids) && a.ids.length ? a.ids.map(Number) : null);
      if (!groups) return { ok: false, error: a.ids && a.ids.length ? 'Those cards do not make your phase' : 'You cannot make your phase with this hand yet' };
      const used = new Set(); for (const g of groups) for (const c of g.cards) used.add(c.card.id);
      me.hand = me.hand.filter((c) => !used.has(c.id)); me.laid = groups;
      say(s, me.name + ' laid down phase ' + me.phase + ' (' + PHASE_TEXT[me.phase - 1] + ')!');
      if (!me.hand.length) goOut(s, me);
      return { ok: true };
    }
    if (a.t === 'hit') {
      if (!me.laid) return { ok: false, error: 'Lay down your phase before you hit' };
      const ci = me.hand.findIndex((c) => c.id === Number(a.card));
      if (ci < 0) return { ok: false, error: 'No such card' };
      const tp = s.players.find((p) => p.id === a.pid);
      if (!tp || !tp.laid || !tp.laid[a.g]) return { ok: false, error: 'No such group' };
      const g = tp.laid[a.g], card = me.hand[ci], spot = hitSpot(g, card, a.end);
      if (!spot) return { ok: false, error: 'That card does not fit there' };
      me.hand.splice(ci, 1);
      if (g.k === 'run') { if (spot.end === 'hi') { g.hi++; g.cards.push({ card, n: spot.n }); } else { g.lo--; g.cards.unshift({ card, n: spot.n }); } }
      else g.cards.push({ card, n: spot.n });
      say(s, me.name + ' hit a ' + cardText(card) + ' on ' + (tp === me ? 'their own' : tp.name + "'s") + ' group.');
      if (!me.hand.length) goOut(s, me);
      return { ok: true };
    }
    if (a.t === 'discard') {
      const ci = me.hand.findIndex((c) => c.id === Number(a.card));
      if (ci < 0) return { ok: false, error: 'No such card' };
      const card = me.hand[ci];
      let victim = null;
      if (card.c === 'S') {
        victim = s.players.find((p) => p.id === a.target && p !== me);
        if (!victim) return { ok: false, error: 'Pick who to skip' };
      }
      me.hand.splice(ci, 1); s.disc.push(card);
      if (victim) { victim.skipMe = true; say(s, me.name + ' played a Skip on ' + victim.name + '!'); }
      else say(s, me.name + ' discarded ' + cardText(card) + '.');
      if (!me.hand.length) { goOut(s, me); return { ok: true }; }
      nextTurn(s); return { ok: true };
    }
    return { ok: false, error: 'Bad move' };
  }

  function cardText(c) { return c.c === 'W' ? 'Wild' : c.c === 'S' ? 'Skip' : ({ R: 'red', B: 'blue', G: 'green', Y: 'yellow' }[c.c]) + ' ' + c.n; }

  function goOut(s, out) {
    const rows = s.players.map((p) => {
      const pts = p === out ? 0 : p.hand.reduce((n, c) => n + points(c), 0), advanced = !!p.laid;
      p.score += pts; if (advanced) { p.done++; p.phase++; }
      return { id: p.id, name: p.name, pts, total: p.score, advanced, phase: Math.min(10, p.phase), done: p.done, out: p === out };
    });
    s.result = rows;
    say(s, out.name + ' went out!');
    const finished = s.players.filter((p) => p.done >= s.target);
    if (finished.length) {
      const w = finished.sort((a, b) => a.score - b.score)[0];
      s.winner = w.id; s.stage = 'over'; say(s, w.name + ' wins the game! 🎉');
    } else s.stage = 'handEnd';
  }

  function view(s, id) {
    const me = s.players.find((p) => p.id === id), cur = s.players[s.turn];
    return {
      players: s.players.map((p) => ({ id: p.id, name: p.name, bot: p.bot, count: p.hand.length, phase: Math.min(10, p.phase), done: p.done, score: p.score, laid: p.laid, skipMe: p.skipMe })),
      hand: me ? me.hand : [], top: top(s) || null, drawSize: s.draw.length, turn: s.stage === 'handEnd' || s.stage === 'over' ? null : cur.id, stage: s.stage,
      handNo: s.handNo, target: s.target, winner: s.winner, result: s.result, ready: s.ready, log: s.log.slice(-7),
      phaseText: me ? PHASE_TEXT[Math.min(9, me.phase - 1)] : '', myPhase: me ? Math.min(10, me.phase) : 0,
      canLay: !!(me && cur && cur.id === id && s.stage === 'play' && !me.laid && solve(me.hand, PHASES[me.phase - 1], null)),
    };
  }
  const turnOf = (s) => (s.stage === 'draw' || s.stage === 'play' ? s.players[s.turn].id : null);
  function ranking(s) {
    return s.players.slice().sort((a, b) => (b.id === s.winner) - (a.id === s.winner) || b.done - a.done || a.score - b.score).map((p) => p.id);
  }

  // ---------- the computer ----------
  function usefulness(hand, phase) {
    const defs = PHASES[phase - 1]; let v = 0;
    const byN = {}; for (const c of hand) if (isNat(c)) byN[c.n] = (byN[c.n] || 0) + 1;
    const hasSet = defs.some((d) => d.k === 'set'), hasRun = defs.some((d) => d.k === 'run'), hasColor = defs.some((d) => d.k === 'color');
    if (hasSet) for (const n in byN) v += byN[n] * (byN[n] - 1) * 1.5;
    if (hasRun) { const have = new Set(Object.keys(byN).map(Number)); for (const n of have) { if (have.has(n + 1)) v += 1.4; if (have.has(n + 2)) v += 0.6; } v += have.size * 0.3; }
    if (hasColor) { const col = {}; for (const c of hand) if (isNat(c)) col[c.c] = (col[c.c] || 0) + 1; v += Math.max(0, ...Object.values(col)) * 1.5; }
    v += hand.filter((c) => c.c === 'W').length * 6;
    return v;
  }
  function cardKeepValue(hand, card, phase) {
    if (card.c === 'W') return 100;
    const without = hand.filter((c) => c !== card);
    return usefulness(hand, phase) - usefulness(without, phase);
  }
  function botAct(s, id) {
    const p = s.players.find((x) => x.id === id);
    if (s.stage === 'handEnd') return { t: 'next' };
    if (s.stage === 'draw') {
      const t = top(s);
      if (t && t.c !== 'S') {
        const wanted = t.c === 'W' || (p.laid ? s.players.some((q) => q.laid && q.laid.some((g) => hitSpot(g, t))) : (!solve(p.hand, PHASES[p.phase - 1]) && solve(p.hand.concat([t]), PHASES[p.phase - 1])) || usefulness(p.hand.concat([t]), p.phase) - usefulness(p.hand, p.phase) >= 3);
        if (wanted) return { t: 'draw', from: 'disc' };
      }
      return { t: 'draw', from: 'deck' };
    }
    if (!p.laid && solve(p.hand, PHASES[p.phase - 1])) return { t: 'lay' };
    if (p.laid) {
      for (const c of p.hand) for (const q of s.players) if (q.laid) for (let g = 0; g < q.laid.length; g++) {
        if (hitSpot(q.laid[g], c)) return { t: 'hit', card: c.id, pid: q.id, g, end: 'hi' };
      }
    }
    // discard: a Skip goes to whoever is doing best, otherwise the card we need least
    const skip = p.hand.find((c) => c.c === 'S');
    if (skip) {
      const foes = s.players.filter((q) => q !== p).sort((a, b) => (a.skipMe - b.skipMe) || (a.hand.length - b.hand.length) || (b.phase - a.phase));
      return { t: 'discard', card: skip.id, target: foes[0].id };
    }
    let best = null, bv = Infinity;
    for (const c of p.hand) {
      const v = (p.laid ? 0 : cardKeepValue(p.hand, c, p.phase)) - points(c) * 0.12 + s.rng() * 0.05;
      if (v < bv) { bv = v; best = c; }
    }
    return { t: 'discard', card: best.id };
  }

  return { COLORS, PHASES, PHASE_TEXT, MIN_PLAYERS, MAX_PLAYERS, HAND, create, view, act, botAct, turnOf, ranking, solve, hitSpot, points, cardText };
});
