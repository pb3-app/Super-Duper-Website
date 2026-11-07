/* Hangman rules - shared by the server and the browser.
   Two players, two rounds. One player secretly types a word, the other guesses letters (or the whole word).
   Then you swap. Solve it with fewer wrong guesses than your opponent to win. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Hangman = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const WORD_RE = /^[A-Z]{3,14}$/;
  const CHANCES = [6, 8, 10];

  function newGame(opts) {
    const chances = CHANCES.includes(Number(opts && opts.chances)) ? Number(opts.chances) : 8;
    return {
      chances, round: 0, setter: 0, phase: 'set', word: '', hint: '', guessed: [], wrong: 0,
      results: [], over: false, winner: null, reason: null, last: null,
    };
  }
  const guesser = (g) => 1 - g.setter;
  const maskOf = (g) => g.word.split('').map((ch) => (g.guessed.includes(ch) ? ch : null));
  const solved = (g) => g.word.length > 0 && g.word.split('').every((ch) => g.guessed.includes(ch));

  function finishRound(g, win) {
    g.results.push({ setter: g.setter, word: g.word, hint: g.hint, solved: win, wrong: g.wrong, guessed: g.guessed.slice() });
    if (g.round === 1) { // both rounds played: decide
      g.over = true; g.phase = 'done';
      const score = [0, 0]; // wrong guesses made by each player as a guesser (lower is better) and whether they solved
      const solvedBy = [false, false], wrongBy = [0, 0];
      for (const r of g.results) { const gi = 1 - r.setter; solvedBy[gi] = r.solved; wrongBy[gi] = r.wrong; }
      void score;
      if (solvedBy[0] && !solvedBy[1]) { g.winner = 0; g.reason = 'solved'; }
      else if (solvedBy[1] && !solvedBy[0]) { g.winner = 1; g.reason = 'solved'; }
      else if (solvedBy[0] && solvedBy[1]) {
        if (wrongBy[0] === wrongBy[1]) { g.winner = null; g.reason = 'tie'; } else { g.winner = wrongBy[0] < wrongBy[1] ? 0 : 1; g.reason = 'fewer'; }
      } else { g.winner = null; g.reason = 'nobody'; }
    } else {
      g.round = 1; g.setter = 1 - g.setter; g.phase = 'set'; g.word = ''; g.hint = ''; g.guessed = []; g.wrong = 0;
    }
  }

  function play(g, move, idx) {
    if (g.over) return { ok: false, error: 'The game is over' };
    if (g.phase === 'set') {
      if (idx !== g.setter) return { ok: false, error: 'Wait for your opponent to choose a word' };
      if (!move || move.t !== 'word') return { ok: false, error: 'Choose a word first' };
      const w = String(move.word || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (!WORD_RE.test(w)) return { ok: false, error: 'Use 3 to 14 letters, A-Z only' };
      g.word = w; g.hint = String(move.hint || '').slice(0, 30).replace(/[<>]/g, '');
      g.phase = 'guess';
      return { ok: true, ev: { set: true } };
    }
    if (idx !== guesser(g)) return { ok: false, error: 'Not your turn' };
    if (move && move.t === 'letter') {
      const ch = String(move.ch || '').toUpperCase();
      if (!/^[A-Z]$/.test(ch)) return { ok: false, error: 'Pick a letter' };
      if (g.guessed.includes(ch)) return { ok: false, error: 'You already tried that letter' };
      g.guessed.push(ch);
      const hit = g.word.includes(ch);
      if (!hit) g.wrong++;
      g.last = { ch, hit };
      const done = solved(g), dead = g.wrong >= g.chances;
      if (done || dead) finishRound(g, done);
      return { ok: true, ev: { ch, hit, end: done ? 'solved' : dead ? 'hanged' : null } };
    }
    if (move && move.t === 'solve') {
      const w = String(move.word || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (!w) return { ok: false, error: 'Type your guess first' };
      if (w === g.word) { for (const ch of g.word) if (!g.guessed.includes(ch)) g.guessed.push(ch); g.last = { solve: true, hit: true }; finishRound(g, true); return { ok: true, ev: { solve: true, hit: true, end: 'solved' } }; }
      g.wrong++; g.last = { solve: true, hit: false };
      const dead = g.wrong >= g.chances;
      if (dead) finishRound(g, false);
      return { ok: true, ev: { solve: true, hit: false, end: dead ? 'hanged' : null } };
    }
    return { ok: false, error: 'Bad move' };
  }

  function view(g, idx) {
    const showWord = g.phase === 'guess' && idx === g.setter;
    return {
      you: idx, chances: g.chances, round: g.round, setter: g.setter, phase: g.phase, hint: g.hint, len: g.word.length,
      mask: g.phase === 'guess' ? maskOf(g) : [], word: showWord ? g.word : null, guessed: g.guessed, wrong: g.wrong,
      results: g.results, over: g.over, winner: g.winner, reason: g.reason, last: g.last,
    };
  }
  const turnOf = (g) => (g.over ? -2 : g.phase === 'set' ? g.setter : guesser(g));
  const progress = (g, idx) => {
    let w = 0;
    for (const r of g.results) if (1 - r.setter === idx) w += r.wrong;
    if (g.phase === 'guess' && guesser(g) === idx) w += g.wrong;
    return w;
  };

  // ----- solo word bank -----
  const BANK = {
    brainrot: ['TUNGSAHUR', 'TRALALERO', 'BOMBARDIRO', 'CROCODILO', 'CAPPUCCINO', 'ASSASSINO', 'BALLERINA', 'BANANINI', 'CHIMPANZINI', 'PATAPIM', 'LIRILI', 'LARILA', 'TRIPPI', 'TROPPI', 'GLORBO', 'FRUTTODRILLO', 'SIGMA', 'RIZZLER', 'SKIBIDI', 'GYATT', 'MEWING', 'AURA', 'BASEBALL', 'DRUMMER'],
    animals: ['ELEPHANT', 'GIRAFFE', 'PENGUIN', 'DOLPHIN', 'KANGAROO', 'CHEETAH', 'OCTOPUS', 'HEDGEHOG', 'FLAMINGO', 'GORILLA', 'PORCUPINE', 'CROCODILE', 'BUTTERFLY', 'SQUIRREL', 'WALRUS', 'LEOPARD', 'PEACOCK', 'TORTOISE', 'SEAHORSE', 'CHAMELEON'],
    food: ['PANCAKE', 'SPAGHETTI', 'BURRITO', 'CHOCOLATE', 'AVOCADO', 'MARSHMALLOW', 'LASAGNA', 'DUMPLING', 'WATERMELON', 'CROISSANT', 'POPCORN', 'MEATBALL', 'CHEESECAKE', 'PINEAPPLE', 'SANDWICH', 'PRETZEL', 'NOODLES', 'BROCCOLI', 'CUPCAKE', 'TORTILLA'],
    places: ['VOLCANO', 'PYRAMID', 'LIGHTHOUSE', 'WATERFALL', 'SKYSCRAPER', 'MOUNTAIN', 'DESERT', 'ISLAND', 'CASTLE', 'AIRPORT', 'LIBRARY', 'STADIUM', 'GLACIER', 'CANYON', 'RAINFOREST', 'MUSEUM', 'HARBOR', 'CAVERN', 'MONASTERY', 'OBSERVATORY'],
    tech: ['KEYBOARD', 'INTERNET', 'ALGORITHM', 'JAVASCRIPT', 'DATABASE', 'BROWSER', 'PIXEL', 'ROUTER', 'FIREWALL', 'COMPILER', 'PROCESSOR', 'BLUETOOTH', 'SATELLITE', 'HOLOGRAM', 'ROBOTICS', 'SOFTWARE', 'NETWORK', 'ENCRYPTION', 'BANDWIDTH', 'CURSOR'],
    games: ['MINESWEEPER', 'CHECKMATE', 'BASKETBALL', 'BATTLESHIP', 'SCOREBOARD', 'TOURNAMENT', 'CONTROLLER', 'ARCADE', 'JOYSTICK', 'DUNGEON', 'SPEEDRUN', 'MULTIPLAYER', 'LEADERBOARD', 'CHAMPION', 'CHECKPOINT', 'RESPAWN', 'COMBO', 'BOSSFIGHT', 'POWERUP', 'SIDEQUEST'],
  };
  function randomWord(cat) {
    const keys = Object.keys(BANK);
    const k = BANK[cat] ? cat : keys[Math.floor(Math.random() * keys.length)];
    const list = BANK[k];
    return { word: list[Math.floor(Math.random() * list.length)], category: k };
  }
  // letter frequency used by the optional "hint" feature
  const FREQ = 'ETAOINSHRDLCUMWFGYPBVKJXQZ';

  return { WORD_RE, CHANCES, BANK, FREQ, newGame, play, view, turnOf, progress, randomWord, maskOf };
});
