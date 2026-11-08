(() => {
  const E = window.UnoEngine, $ = (id) => document.getElementById(id), esc = NetPlay.esc;
  const COLOR_NAME = { R: 'Red', Y: 'Yellow', G: 'Green', B: 'Blue' };
  let local = null, botTimer = null, cr = null, turnEndsAt = 0, shownEnd = false;
  const myId = () => (local ? 'me' : TungMP.user ? TungMP.user.id : null);

  // ---------- cards ----------
  const SYM = { skip: '⊘', rev: '⇄', '+2': '+2', wild: '★', '+4': '+4' };
  function cardEl(c, cls) {
    const d = document.createElement('div');
    if (!c) { d.className = 'pc back ' + (cls || ''); return d; }
    const face = SYM[c.v] || c.v, corner = c.v === 'wild' ? '★' : face;
    d.className = `pc ${c.c} U-${c.c} ${cls || ''}`;
    d.innerHTML = `<span class="oval"></span><span class="face">${face}</span><span class="co tl">${corner}</span><span class="co br">${corner}</span>`;
    d.title = E.label(c);
    return d;
  }
  const ORDER = { R: 0, Y: 1, G: 2, B: 3, W: 4 };

  // ---------- drawing the table from a view ----------
  function render(v) {
    const me = myId(), turnMe = v.turn === me, byId = Object.fromEntries(v.players.map((p) => [p.id, p]));
    const idx = v.players.findIndex((p) => p.id === me), order = v.players.map((_, i) => v.players[(idx + 1 + i) % v.players.length]).filter((p) => p.id !== me);
    // top bar
    const turnName = v.turn ? (byId[v.turn] ? byId[v.turn].name : '') : '';
    $('bar').innerHTML = `<span class="chip ${turnMe ? 'me' : 'turn'}">${v.phase === 'over' ? 'Game over' : turnMe ? 'Your turn' : esc(turnName) + "'s turn"}</span><span class="chip">${v.dir === 1 ? '↻ clockwise' : '↺ counter-clockwise'}</span><span class="chip">🂠 ${v.drawSize} left</span>${!local && v.turn && turnEndsAt ? '<span class="chip timer" id="clock"></span>' : ''}`;
    // others
    $('opps').innerHTML = order.map((p) => `<div class="opp${v.turn === p.id ? ' turn' : ''}"><div class="nm">${esc(p.name)}</div><div class="fan">${Array.from({ length: Math.min(p.count, 8) }, () => '<div class="pc back"></div>').join('')}${p.count > 8 ? `<span class="more">+${p.count - 8}</span>` : ''}</div><div class="sub">${p.count} card${p.count === 1 ? '' : 's'}${p.count === 1 ? ' · UNO!' : ''}</div></div>`).join('');
    // piles
    const dp = $('drawPile'); dp.replaceChildren(cardEl(null, 'big' + (turnMe && v.phase === 'play' ? ' clickable glow' : '')));
    dp.firstChild.onclick = () => { if (turnMe && v.phase === 'play') act({ t: 'draw' }); };
    $('discPile').replaceChildren(cardEl(v.top, 'big'));
    $('colorRing').style.background = { R: '#e5483c', Y: '#f2c230', G: '#3fae55', B: '#3f7fd9' }[v.color];
    $('colorRing').title = 'Colour to match: ' + COLOR_NAME[v.color];
    // my hand (sorted for the eye; clicks use the real position)
    const playable = new Set(v.playable);
    const sorted = v.hand.map((c, i) => ({ c, i })).sort((a, b) => ORDER[a.c.c] - ORDER[b.c.c] || String(a.c.v).localeCompare(String(b.c.v), undefined, { numeric: true }));
    $('hand').replaceChildren(...sorted.map(({ c, i }) => {
      const ok = turnMe && playable.has(i), el = cardEl(c, ok ? 'ok glow' : 'no');
      el.onclick = () => { if (!ok) return; if (c.c === 'W') pickColor((col) => act({ t: 'play', i, color: col })); else act({ t: 'play', i }); };
      return el;
    }));
    // messages and buttons
    $('msg').textContent = v.phase === 'over' ? '' : turnMe ? (v.phase === 'drawn' ? 'You drew a card you can play: play it or keep it.' : playable.size ? 'Pick a card to play, or draw one.' : 'Nothing fits: draw a card.') : 'Waiting for ' + turnName + '…';
    $('acts').innerHTML = turnMe && v.phase === 'drawn' ? '<button class="btn secondary" id="passBtn">Keep it and pass</button>' : '';
    if ($('passBtn')) $('passBtn').onclick = () => act({ t: 'pass' });
    $('log').innerHTML = v.log.map((l) => `<div>${esc(l.text)}</div>`).join('');
    $('quitBtn').textContent = local ? '☰ Menu' : '🚪 Leave the room';
    if (v.phase !== 'over') { $('result').hidden = true; shownEnd = false; }
  }
  setInterval(() => { const c = $('clock'); if (c && turnEndsAt) c.textContent = '⏱ ' + Math.max(0, Math.ceil((turnEndsAt - Date.now()) / 1000)) + 's'; }, 400);

  function pickColor(cb) {
    $('picker').hidden = false;
    $('picker').querySelectorAll('.col').forEach((b) => { b.onclick = () => { $('picker').hidden = true; cb(b.dataset.c); }; });
  }
  function showResult(title, rows, buttons) {
    const r = $('result');
    r.innerHTML = `<h2>${title}</h2>${rows ? `<table>${rows}</table>` : ''}<div class="btn-row"></div>`; r.hidden = false;
    for (const [label, fn, cls] of buttons) { const b = document.createElement('button'); b.className = 'btn' + (cls ? ' ' + cls : ''); b.textContent = label; b.onclick = fn; r.querySelector('.btn-row').append(b); }
  }

  // ---------- against the computer ----------
  function startSolo() {
    clearTimeout(botTimer);
    const n = Number($('bots').value), names = ['Tralalero', 'Bombardiro', 'Cappuccina', 'Lirili', 'Ballerina'];
    const players = [{ id: 'me', name: window.TungMP && TungMP.user ? TungMP.user.username : 'You' }];
    for (let i = 0; i < n; i++) players.push({ id: 'bot' + i, name: names[i] + ' 🤖', bot: true });
    local = { s: E.create(players), done: false }; cr.setSolo(true); shownEnd = false;
    renderLocal(); botLoop();
  }
  function renderLocal() { if (local) render(E.view(local.s, 'me')); }
  function botLoop() {
    clearTimeout(botTimer);
    if (!local) return;
    const s = local.s;
    if (s.phase === 'over') return endLocal();
    const id = E.turnOf(s);
    if (id === 'me') return;
    botTimer = setTimeout(() => { E.act(s, id, E.botAct(s, id)); renderLocal(); botLoop(); }, 900 + Math.random() * 500);
  }
  function endLocal() {
    if (local.done) return; local.done = true;
    const s = local.s, won = s.winner === 'me';
    if (window.TungMP) TungMP.submitSolo({ game: 'uno', result: won ? 'win' : 'loss' });
    const name = s.players.find((p) => p.id === s.winner).name;
    showResult(won ? '🏆 You win!' : `💀 ${esc(name)} wins`, '', [['Deal again', startSolo], ['Menu', toMenu, 'secondary']]);
  }
  function toMenu() { clearTimeout(botTimer); local = null; cr.setSolo(false); }
  function act(action) {
    if (local) { const r = E.act(local.s, 'me', action); if (!r.ok) return TungMP.showToast({ title: r.error, ttl: 2000 }); renderLocal(); botLoop(); }
    else cr.act(action);
  }
  $('startBtn').addEventListener('click', startSolo);
  $('quitBtn').addEventListener('click', () => { if (local) toMenu(); else if (confirm('Leave the room? If a game is on it counts as a loss.')) cr.leave(); });

  // ---------- online rooms ----------
  cr = CardRoom.attach({
    game: 'uno', panel: $('mpPanel'), menu: $('menu'), play: $('play'),
    onModeChange() { if (local) toMenu(); },
    onStart() { shownEnd = false; },
    onRoom(room) {
      if (local) return;
      turnEndsAt = room.turnMs ? Date.now() + room.turnMs : 0;
      render(room.g);
      if (room.state === 'over' && room.result && !shownEnd) {
        shownEnd = true;
        const me = TungMP.user.id, host = room.host === me, w = room.result[0];
        const rows = room.result.map((r) => `<tr class="${r.place === 1 ? 'win' : ''}"><td>${r.place}</td><td>${esc(r.name)}${r.id === me ? ' (you)' : ''}</td></tr>`).join('');
        showResult(w.id === me ? '🏆 You win!' : `💀 ${esc(w.name)} wins`, rows, [host ? ['Back to the room', () => cr.toLobby()] : ['Waiting for the host…', () => {}, 'secondary'], ['Leave', () => cr.leave(), 'secondary']]);
      }
    },
    onLobby() { $('result').hidden = true; shownEnd = false; },
  });
  window.__uno = () => ({ local, cr, E });
})();
