/* Tung Tung Uno: the rules, with no screen. The server runs a room with it (so nobody can see another hand) and the
   page runs it for a game against the computer. Same code both times.

   Engine.create(players, opts) -> state          players: [{ id, name, bot }]
   Engine.view(state, id)       -> what that player may see
   Engine.act(state, id, action) -> { ok, error? }   actions: { t: 'play', i, color? } | { t: 'draw' } | { t: 'pass' }
   Engine.botAct(state, id)     -> an action (also used for a player who ran out of time)
   Engine.turnOf(state)         -> the id that has to act, or null
   Engine.ranking(state)        -> ids, winner first */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.UnoEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COLORS = ['R', 'Y', 'G', 'B'];
  const MIN_PLAYERS = 2, MAX_PLAYERS = 6, HAND = 7;

  function makeDeck() {
    const d = []; let id = 0;
    for (const c of COLORS) {
      d.push({ id: id++, c, v: '0' });
      for (let k = 0; k < 2; k++) {
        for (let n = 1; n <= 9; n++) d.push({ id: id++, c, v: String(n) });
        for (const v of ['skip', 'rev', '+2']) d.push({ id: id++, c, v });
      }
    }
    for (let k = 0; k < 4; k++) { d.push({ id: id++, c: 'W', v: 'wild' }); d.push({ id: id++, c: 'W', v: '+4' }); }
    return d;
  }
  function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function create(players, opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const s = {
      players: players.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot, hand: [] })),
      draw: shuffle(makeDeck(), rng), disc: [], dir: 1, turn: 0, color: 'R', phase: 'play', drawn: -1, winner: null, log: [], seq: 0, rng,
    };
    for (let r = 0; r < HAND; r++) for (const p of s.players) p.hand.push(s.draw.pop());
    // the first card is a plain number card
    let first;
    do { first = s.draw.pop(); if (first.c === 'W' || !/^\d$/.test(first.v)) { s.draw.unshift(first); first = null; } } while (!first);
    s.disc.push(first); s.color = first.c;
    s.turn = Math.floor(rng() * s.players.length);
    say(s, 'Game on! First card ' + label(first) + '.');
    return s;
  }

  const label = (c) => (c.c === 'W' ? (c.v === '+4' ? 'Wild +4' : 'Wild') : ({ R: 'Red', Y: 'Yellow', G: 'Green', B: 'Blue' }[c.c]) + ' ' + ({ skip: 'Skip', rev: 'Reverse', '+2': '+2' }[c.v] || c.v));
  function say(s, text) { s.log.push({ n: ++s.seq, text }); if (s.log.length > 12) s.log.shift(); }
  const top = (s) => s.disc[s.disc.length - 1];
  const canPlay = (s, card) => card.c === 'W' || card.c === s.color || (top(s).c !== 'W' && card.v === top(s).v);
  const nextIndex = (s, from, steps) => { const n = s.players.length; return (((from + s.dir * steps) % n) + n) % n; };

  function drawCard(s) {
    if (!s.draw.length) { // shuffle the discards back in, keeping the top card
      const t = s.disc.pop(); s.draw = shuffle(s.disc, s.rng); s.disc = [t];
      if (!s.draw.length) return null;
    }
    return s.draw.pop();
  }
  function give(s, p, n) { let got = 0; for (let i = 0; i < n; i++) { const c = drawCard(s); if (!c) break; p.hand.push(c); got++; } return got; }

  function advance(s, steps) { s.turn = nextIndex(s, s.turn, steps || 1); s.phase = 'play'; s.drawn = -1; }

  function act(s, id, a) {
    if (s.phase === 'over') return { ok: false, error: 'The game is over' };
    const p = s.players[s.turn];
    if (!p || p.id !== id) return { ok: false, error: 'It is not your turn' };
    if (!a || typeof a !== 'object') return { ok: false, error: 'Bad move' };
    if (a.t === 'draw') {
      if (s.phase !== 'play') return { ok: false, error: 'You already drew' };
      const c = drawCard(s);
      if (!c) { say(s, p.name + ' could not draw, passes.'); advance(s); return { ok: true }; }
      p.hand.push(c);
      if (canPlay(s, c)) { s.phase = 'drawn'; s.drawn = p.hand.length - 1; say(s, p.name + ' drew a card.'); }
      else { say(s, p.name + ' drew a card and passes.'); advance(s); }
      return { ok: true };
    }
    if (a.t === 'pass') {
      if (s.phase !== 'drawn') return { ok: false, error: 'Draw a card first' };
      say(s, p.name + ' keeps the card and passes.'); advance(s); return { ok: true };
    }
    if (a.t !== 'play') return { ok: false, error: 'Bad move' };
    const i = Math.floor(Number(a.i));
    if (!(i >= 0 && i < p.hand.length)) return { ok: false, error: 'No such card' };
    if (s.phase === 'drawn' && i !== s.drawn) return { ok: false, error: 'You can only play the card you just drew' };
    const card = p.hand[i];
    if (!canPlay(s, card)) return { ok: false, error: 'That card does not match' };
    if (card.c === 'W' && !COLORS.includes(a.color)) return { ok: false, error: 'Pick a colour' };
    p.hand.splice(i, 1); s.disc.push(card);
    s.color = card.c === 'W' ? a.color : card.c;
    let text = p.name + ' played ' + label(card) + (card.c === 'W' ? ' (' + { R: 'red', Y: 'yellow', G: 'green', B: 'blue' }[s.color] + ')' : '') + '.';
    if (!p.hand.length) { s.phase = 'over'; s.winner = p.id; say(s, text); say(s, p.name + ' wins! 🎉'); return { ok: true }; }
    if (p.hand.length === 1) text += ' UNO!';
    say(s, text);
    const n = s.players.length;
    if (card.v === 'rev') { s.dir = -s.dir; if (n === 2) advance(s, 2); else advance(s, 1); }
    else if (card.v === 'skip') advance(s, 2);
    else if (card.v === '+2' || card.v === '+4') {
      const victim = s.players[nextIndex(s, s.turn, 1)], got = give(s, victim, card.v === '+2' ? 2 : 4);
      say(s, victim.name + ' draws ' + got + ' and loses a turn.'); advance(s, 2);
    } else advance(s, 1);
    return { ok: true };
  }

  const playableIdx = (s, p) => p.hand.map((c, i) => (canPlay(s, c) ? i : -1)).filter((i) => i >= 0);

  function view(s, id) {
    const me = s.players.find((p) => p.id === id), t = s.players[s.turn];
    return {
      players: s.players.map((p) => ({ id: p.id, name: p.name, bot: p.bot, count: p.hand.length })),
      hand: me ? me.hand : [], top: top(s), color: s.color, dir: s.dir, drawSize: s.draw.length,
      turn: s.phase === 'over' ? null : t.id, phase: s.phase, drawn: s.drawn, winner: s.winner, log: s.log.slice(-6),
      playable: me && t && t.id === id && s.phase !== 'over' ? (s.phase === 'drawn' ? [s.drawn] : playableIdx(s, me)) : [],
    };
  }
  const turnOf = (s) => (s.phase === 'over' ? null : s.players[s.turn].id);
  function ranking(s) {
    const w = s.players.find((p) => p.id === s.winner);
    return [w, ...s.players.filter((p) => p !== w).sort((a, b) => a.hand.length - b.hand.length)].filter(Boolean).map((p) => p.id);
  }

  // ---- the computer ----
  function botAct(s, id) {
    const p = s.players.find((x) => x.id === id);
    if (s.phase === 'drawn') { const c = p.hand[s.drawn]; return canPlay(s, c) ? { t: 'play', i: s.drawn, color: pickColor(p, s.drawn) } : { t: 'pass' }; }
    const ok = playableIdx(s, p);
    if (!ok.length) return { t: 'draw' };
    const nextP = s.players[nextIndex(s, s.turn, 1)], danger = nextP.hand.length <= 2;
    const count = {}; for (const c of p.hand) if (c.c !== 'W') count[c.c] = (count[c.c] || 0) + 1;
    const score = (i) => {
      const c = p.hand[i]; let v = 0;
      if (c.c === 'W') v = c.v === '+4' ? (danger ? 9 : -4) : -6; // keep the wilds for later unless somebody is about to win
      else if (['skip', 'rev', '+2'].includes(c.v)) v = danger ? 8 : 3;
      else v = 1 + (/^\d$/.test(c.v) ? Number(c.v) / 10 : 0);
      if (c.c !== 'W') v += (count[c.c] || 0) * 0.3;
      return v + s.rng() * 0.2;
    };
    const best = ok.slice().sort((a, b) => score(b) - score(a))[0];
    return { t: 'play', i: best, color: pickColor(p, best) };
  }
  function pickColor(p, playing) {
    const count = { R: 0, Y: 0, G: 0, B: 0 };
    p.hand.forEach((c, i) => { if (i !== playing && c.c !== 'W') count[c.c]++; });
    return COLORS.slice().sort((a, b) => count[b] - count[a])[0];
  }

  return { COLORS, MIN_PLAYERS, MAX_PLAYERS, HAND, create, view, act, botAct, turnOf, ranking, label, canPlay };
});
