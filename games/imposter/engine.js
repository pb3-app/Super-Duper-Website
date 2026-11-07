/*
 * The Imposter - game state machine, shared by the server (multiplayer rooms)
 * and the browser (solo mode against computer players).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImposterEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROUNDS = 2, CLUE_MS = 30000, DISCUSS_MS = 60000, VOTE_MS = 30000, GUESS_MS = 25000;
  const MIN_PLAYERS = 4, MAX_PLAYERS = 8;

  const ok = () => ({ ok: true });
  const err = (error) => ({ ok: false, error });
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}]/gu, '');

  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function guessMatches(guess, word) {
    const g = norm(guess), w = norm(word);
    if (!g) return false;
    return g === w || g === w + 's' || g + 's' === w || (w.length > 4 && lev(g, w) <= 1);
  }

  function createGame(players, word, imposterId, order, now) {
    return {
      phase: 'clue', round: 1, turnIdx: 0, word, imposter: imposterId,
      players: players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, connected: true, left: false })),
      order: order.slice(), clues: [], chat: [], ready: [], votes: {}, ejected: null, tie: false, guess: null,
      outcome: null, cancelled: false, deadline: now + CLUE_MS,
    };
  }
  const active = (g) => g.players.filter((p) => !p.left);
  const find = (g, id) => g.players.find((p) => p.id === id && !p.left);
  const curId = (g) => (g.phase === 'clue' ? g.order[g.turnIdx] : null);

  function finish(g, winner, reason) {
    g.phase = 'result';
    g.outcome = { winner, reason };
    g.deadline = Infinity;
  }
  function startDiscuss(g, now) { g.phase = 'discuss'; g.ready = []; g.deadline = now + DISCUSS_MS; }
  function startVote(g, now) { g.phase = 'vote'; g.votes = {}; g.deadline = now + VOTE_MS; }

  function advance(g, now, inc) {
    if (inc) g.turnIdx++;
    for (let guard = 0; guard < 100; guard++) {
      if (g.turnIdx >= g.order.length) {
        g.round++; g.turnIdx = 0;
        if (g.round > ROUNDS) return startDiscuss(g, now);
      }
      if (find(g, g.order[g.turnIdx])) break;
      g.turnIdx++;
    }
    g.deadline = now + CLUE_MS;
  }

  function resolveVotes(g, now) {
    const counts = {};
    for (const [voter, target] of Object.entries(g.votes)) {
      if (find(g, voter) && find(g, target)) counts[target] = (counts[target] || 0) + 1;
    }
    const max = Math.max(0, ...Object.values(counts));
    const top = Object.keys(counts).filter((k) => counts[k] === max);
    g.voteCounts = counts;
    if (max > 0 && top.length === 1) {
      g.ejected = top[0];
      if (g.ejected === g.imposter) { g.phase = 'guess'; g.deadline = now + GUESS_MS; }
      else finish(g, 'imposter', 'innocent');
    } else {
      g.tie = true;
      finish(g, 'imposter', 'tie');
    }
  }

  const connectedActive = (g) => active(g).filter((p) => p.connected);
  function recheck(g, now) {
    if (g.phase === 'discuss') {
      const need = connectedActive(g);
      if (need.length && need.every((p) => g.ready.includes(p.id))) startVote(g, now);
    } else if (g.phase === 'vote') {
      const need = connectedActive(g);
      if (need.length && need.every((p) => g.votes[p.id])) resolveVotes(g, now);
    }
  }

  function act(g, id, a, now) {
    if (g.phase === 'result') return err('The round is over');
    if (!find(g, id)) return err('You are not in this game');
    switch (a && a.type) {
      case 'clue': {
        if (g.phase !== 'clue' || curId(g) !== id) return err('Not your turn');
        const w = String(a.word || '').trim();
        if (!/^[\p{L}][\p{L}'-]{0,19}$/u.test(w)) return err('Type a single word (letters only)');
        if (norm(w) === norm(g.word)) return err('You can’t use the secret word itself!');
        g.clues.push({ round: g.round, id, word: w });
        advance(g, now, true);
        return ok();
      }
      case 'chat': {
        if (g.phase !== 'discuss' && g.phase !== 'vote') return err('Chat opens after the clues');
        const text = String(a.text || '').trim().slice(0, 140);
        if (!text) return err('Empty message');
        const last = [...g.chat].reverse().find((c) => c.id === id);
        if (last && now - last.t < 700) return err('Slow down');
        g.chat.push({ id, text, t: now });
        if (g.chat.length > 60) g.chat.shift();
        return ok();
      }
      case 'ready': {
        if (g.phase !== 'discuss') return err('Not discussing');
        if (!g.ready.includes(id)) g.ready.push(id);
        recheck(g, now);
        return ok();
      }
      case 'vote': {
        if (g.phase !== 'vote') return err('Not voting');
        if (a.target === id || !find(g, a.target)) return err('Pick someone else');
        g.votes[id] = a.target;
        recheck(g, now);
        return ok();
      }
      case 'guess': {
        if (g.phase !== 'guess' || id !== g.imposter) return err('Not your guess');
        g.guess = String(a.word || '').trim().slice(0, 30);
        if (guessMatches(g.guess, g.word)) finish(g, 'imposter', 'guessed');
        else finish(g, 'crew', 'caught');
        return ok();
      }
    }
    return err('Unknown action');
  }

  /** Advance timers. Returns true if anything changed. */
  function tick(g, now) {
    if (g.phase === 'result' || now < g.deadline) return false;
    switch (g.phase) {
      case 'clue': g.clues.push({ round: g.round, id: g.order[g.turnIdx], word: '—', skipped: true }); advance(g, now, true); break;
      case 'discuss': startVote(g, now); break;
      case 'vote': resolveVotes(g, now); break;
      case 'guess': g.guess = ''; finish(g, 'crew', 'caught'); break;
    }
    return true;
  }

  function setConnected(g, id, connected, now) {
    const p = find(g, id);
    if (!p) return;
    p.connected = connected;
    if (!connected && g.phase === 'clue' && curId(g) === id) g.deadline = Math.min(g.deadline, now + 4000);
    if (!connected) recheck(g, now);
  }

  /** A player leaves mid-game. */
  function leave(g, id, now) {
    const p = find(g, id);
    if (!p || g.phase === 'result') return;
    p.left = true;
    if (id === g.imposter) return finish(g, 'crew', 'imposterleft');
    if (active(g).length < 3) { g.cancelled = true; return; }
    if (g.phase === 'clue' && g.order[g.turnIdx] === id) advance(g, now, false);
    else if (g.phase === 'guess') return;
    recheck(g, now);
  }

  function view(g, forId, now) {
    const done = g.phase === 'result';
    const revealImp = done || g.phase === 'guess';
    const isImp = forId === g.imposter;
    return {
      phase: g.phase, round: g.round, rounds: ROUNDS,
      msLeft: g.deadline === Infinity ? null : Math.max(0, g.deadline - now),
      players: g.players.map((p) => ({
        id: p.id, name: p.name, avatar: p.avatar, connected: p.connected, left: p.left,
        voted: !!g.votes[p.id], ready: g.ready.includes(p.id),
      })),
      order: g.order, turn: curId(g), clues: g.clues, chat: g.chat,
      you: { id: forId, isImposter: isImp, word: isImp && !done ? null : g.word },
      myVote: g.votes[forId] || null,
      ejected: g.ejected, tie: g.tie, guess: g.guess, outcome: g.outcome,
      imposter: revealImp ? g.imposter : null,
      word: done ? g.word : null,
      votes: done ? g.votes : null,
    };
  }

  return { ROUNDS, MIN_PLAYERS, MAX_PLAYERS, CLUE_MS, createGame, act, tick, setConnected, leave, view, guessMatches, norm };
});
