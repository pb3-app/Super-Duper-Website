(() => {
  const E = window.Phase10Engine, $ = (id) => document.getElementById(id), esc = NetPlay.esc;
  let local = null, botTimer = null, cr = null, turnEndsAt = 0, shownEnd = null, sel = new Set(), sortBy = 'number', lastView = null;
  const myId = () => (local ? 'me' : TungMP.user ? TungMP.user.id : null);
  const COLS = { R: 0, B: 1, G: 2, Y: 3, W: 4, S: 5 };

  function cardEl(c, cls, shownN) {
    const d = document.createElement('div');
    if (!c) { d.className = 'pc back ' + (cls || ''); return d; }
    const face = c.c === 'S' ? '⊘' : c.c === 'W' ? 'W' : c.n;
    d.className = `pc ${c.c} ${cls || ''}`;
    d.innerHTML = `<span class="face">${face}</span>${c.c === 'S' ? '' : `<span class="co tl">${c.c === 'W' ? (shownN || '★') : c.n}</span><span class="co br">${c.c === 'W' ? (shownN || '★') : c.n}</span>`}`;
    d.title = E.cardText(c) + (c.c === 'W' && shownN ? ' (as ' + shownN + ')' : '');
    return d;
  }
  const groupName = (g) => (g.k === 'set' ? 'Set of ' + g.num + 's' : g.k === 'run' ? 'Run ' + g.lo + '–' + g.hi : ({ R: 'Red', B: 'Blue', G: 'Green', Y: 'Yellow' }[g.color]) + ' cards');

  function render(v) {
    lastView = v;
    const me = myId(), turnMe = v.turn === me, byId = Object.fromEntries(v.players.map((p) => [p.id, p])), mine = byId[me];
    const idx = v.players.findIndex((p) => p.id === me), order = v.players.map((_, i) => v.players[(idx + 1 + i) % v.players.length]).filter((p) => p.id !== me);
    const turnName = v.turn && byId[v.turn] ? byId[v.turn].name : '';
    for (const id of [...sel]) if (!v.hand.some((c) => c.id === id)) sel.delete(id);
    $('bar').innerHTML = `<span class="chip">Hand ${v.handNo}</span><span class="chip">First to finish ${v.target} phase${v.target === 1 ? '' : 's'}</span><span class="chip ${turnMe ? 'me' : 'turn'}">${v.stage === 'over' ? 'Game over' : v.stage === 'handEnd' ? 'Hand over' : turnMe ? 'Your turn' : esc(turnName) + "'s turn"}</span>${!local && v.turn && turnEndsAt ? '<span class="chip timer" id="clock"></span>' : ''}`;
    $('phaseMsg').innerHTML = mine ? `Your phase <b>${v.myPhase}</b>: ${esc(v.phaseText)}${mine.laid ? ' ✔ laid down' : ''} · score ${mine.score}` : '';
    $('opps').innerHTML = order.map((p) => `<div class="opp${v.turn === p.id ? ' turn' : ''}"><div class="nm">${esc(p.name)}</div><div class="fan">${Array.from({ length: Math.min(p.count, 8) }, () => '<div class="pc back"></div>').join('')}${p.count > 8 ? `<span class="more">+${p.count - 8}</span>` : ''}</div><div class="sub">${p.count} cards · phase ${p.phase} · ${p.score} pts${p.laid ? ' · ✔ laid' : ''}</div>${p.skipMe ? '<div class="skipmark">⊘ skipped next</div>' : ''}</div>`).join('');

    // laid groups (anybody's); highlight where the selected card could go
    const one = sel.size === 1 ? v.hand.find((c) => c.id === [...sel][0]) : null;
    const canHit = turnMe && v.stage === 'play' && mine && mine.laid && one;
    const laidHtml = [];
    $('laid').replaceChildren();
    for (const p of v.players) {
      if (!p.laid) continue;
      const row = document.createElement('div'); row.className = 'laidrow';
      row.innerHTML = `<div class="who">${p.id === me ? 'You' : esc(p.name)}: phase ${p.phase - (p.laid ? 0 : 0)} laid down</div>`;
      const wrap = document.createElement('div'); wrap.className = 'groups';
      p.laid.forEach((g, gi) => {
        const hit = canHit ? E.hitSpot(g, one) : null, el = document.createElement('div');
        el.className = 'group' + (hit ? ' hitable' : '');
        const send = (end) => act({ t: 'hit', card: one.id, pid: p.id, g: gi, end });
        if (hit && g.k === 'run') { const b = document.createElement('button'); b.className = 'end'; b.textContent = '◀'; b.onclick = (e) => { e.stopPropagation(); send('lo'); }; el.append(b); }
        const cards = g.k === 'run' ? g.cards.slice().sort((a, b) => a.n - b.n) : g.cards;
        for (const x of cards) el.append(cardEl(x.card, 'sm', x.n));
        if (hit && g.k === 'run') { const b = document.createElement('button'); b.className = 'end'; b.textContent = '▶'; b.onclick = (e) => { e.stopPropagation(); send('hi'); }; el.append(b); }
        const k = document.createElement('span'); k.className = 'gk'; k.textContent = groupName(g); el.append(k);
        if (hit && g.k !== 'run') { el.onclick = () => send(); }
        wrap.append(el);
      });
      row.append(wrap); $('laid').append(row);
    }
    // piles
    const canDraw = turnMe && v.stage === 'draw';
    const dp = cardEl(null, 'big' + (canDraw ? ' clickable glow' : '')); dp.onclick = () => { if (canDraw) act({ t: 'draw', from: 'deck' }); };
    $('drawPile').replaceChildren(dp);
    const takeDisc = canDraw && v.top && v.top.c !== 'S', dc = v.top ? cardEl(v.top, 'big' + (takeDisc ? ' clickable glow' : '')) : document.createElement('div');
    dc.onclick = () => { if (takeDisc) act({ t: 'draw', from: 'disc' }); };
    $('discPile').replaceChildren(dc);
    // hand
    const cmp = sortBy === 'number' ? (a, b) => (a.c === 'W' || a.c === 'S' || b.c === 'W' || b.c === 'S' ? COLS[a.c] - COLS[b.c] : a.n - b.n || COLS[a.c] - COLS[b.c]) : (a, b) => COLS[a.c] - COLS[b.c] || a.n - b.n;
    $('hand').replaceChildren(...v.hand.slice().sort(cmp).map((c) => {
      const el = cardEl(c, (sel.has(c.id) ? 'sel ' : '') + (turnMe && v.stage === 'play' ? 'ok' : ''));
      el.onclick = () => { if (!(turnMe && v.stage === 'play')) return; sel.has(c.id) ? sel.delete(c.id) : sel.add(c.id); render(lastView); };
      return el;
    }));
    $('sortNum').classList.toggle('on', sortBy === 'number'); $('sortCol').classList.toggle('on', sortBy === 'colour');
    // messages and buttons
    $('msg').textContent = v.stage === 'over' || v.stage === 'handEnd' ? '' : !turnMe ? 'Waiting for ' + turnName + '…' : v.stage === 'draw' ? 'Draw from the draw pile or take the top discard.' : mine.laid ? (one ? 'Click a glowing group to hit, or discard the selected card.' : 'Select a card to hit with or to discard.') : (v.canLay ? 'You can make your phase! Press “Lay down phase”.' : 'Select a card to discard (or select cards to lay down).');
    const acts = [];
    if (turnMe && v.stage === 'play') {
      if (!mine.laid) acts.push(['laybtn', sel.size ? 'Lay down selected' : 'Lay down phase', v.canLay || sel.size ? '' : 'secondary']);
      acts.push(['dbtn', 'Discard' + (sel.size === 1 ? '' : ' (select one)'), sel.size === 1 ? '' : 'secondary']);
    }
    $('acts').innerHTML = acts.map(([id, t, c]) => `<button class="btn ${c}" id="${id}">${t}</button>`).join('');
    if ($('laybtn')) $('laybtn').onclick = () => act({ t: 'lay', ids: [...sel] });
    if ($('dbtn')) $('dbtn').onclick = () => discard();
    $('log').innerHTML = v.log.map((l) => `<div>${esc(l.text)}</div>`).join('');
    $('quitBtn').textContent = local ? '☰ Menu' : '🚪 Leave the room';
    renderOverlay(v);
  }
  $('sortNum').onclick = () => { sortBy = 'number'; if (lastView) render(lastView); };
  $('sortCol').onclick = () => { sortBy = 'colour'; if (lastView) render(lastView); };
  setInterval(() => { const c = $('clock'); if (c && turnEndsAt) c.textContent = '⏱ ' + Math.max(0, Math.ceil((turnEndsAt - Date.now()) / 1000)) + 's'; }, 400);

  function discard() {
    if (sel.size !== 1 || !lastView) return;
    const card = lastView.hand.find((c) => c.id === [...sel][0]);
    if (card.c !== 'S') return act({ t: 'discard', card: card.id });
    const me = myId(), box = $('skipWho'); box.replaceChildren();
    for (const p of lastView.players) if (p.id !== me) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = p.name; b.onclick = () => { $('picker').hidden = true; act({ t: 'discard', card: card.id, target: p.id }); }; box.append(b); }
    $('picker').hidden = false;
  }

  // the overlay between hands and at the end of the game
  function renderOverlay(v) {
    const r = $('result');
    if (v.stage !== 'handEnd' && v.stage !== 'over') { r.hidden = true; shownEnd = null; return; }
    const key = v.stage + v.handNo + (v.ready || []).length;
    if (shownEnd === key) return; shownEnd = key;
    const me = myId(), rows = (v.result || []).map((x) => `<tr class="${x.out ? 'win' : ''}"><td>${esc(x.name)}${x.id === me ? ' (you)' : ''}${x.out ? ' 🚪 out' : ''}</td><td>+${x.pts}</td><td>${x.total}</td><td>${x.advanced ? '✔ phase done' : 'again'}</td></tr>`).join('');
    const head = '<tr><th>Player</th><th>This hand</th><th>Total</th><th>Phase</th></tr>';
    const btns = [];
    let title;
    if (v.stage === 'over') {
      const w = v.players.find((p) => p.id === v.winner);
      title = w.id === me ? '🏆 You win the game!' : `💀 ${esc(w.name)} wins the game`;
      if (local) btns.push(['Deal again', startSolo], ['Menu', toMenu, 'secondary']);
      else { const host = cr.room && cr.room.host === TungMP.user.id; btns.push(host ? ['Back to the room', () => cr.toLobby()] : ['Waiting for the host…', () => {}, 'secondary'], ['Leave', () => cr.leave(), 'secondary']); }
    } else {
      title = 'Hand ' + v.handNo + ' is over';
      const ready = (v.ready || []).includes(me);
      btns.push([ready ? 'Waiting for the others…' : '▶ Ready for the next hand', () => act({ t: 'next' }), ready ? 'secondary' : '']);
    }
    r.innerHTML = `<h2>${title}</h2><table>${head}${rows}</table><div class="btn-row"></div>`; r.hidden = false;
    for (const [label, fn, cls] of btns) { const b = document.createElement('button'); b.className = 'btn' + (cls ? ' ' + cls : ''); b.textContent = label; b.onclick = fn; r.querySelector('.btn-row').append(b); }
  }

  // ---------- against the computer ----------
  function startSolo() {
    clearTimeout(botTimer); sel.clear(); shownEnd = null;
    const n = Number($('bots').value), names = ['Tralalero', 'Bombardiro', 'Cappuccina', 'Lirili', 'Ballerina'];
    const players = [{ id: 'me', name: window.TungMP && TungMP.user ? TungMP.user.username : 'You' }];
    for (let i = 0; i < n; i++) players.push({ id: 'bot' + i, name: names[i] + ' 🤖', bot: true });
    local = { s: E.create(players, { phases: Number($('phases').value) }), done: false }; cr.setSolo(true);
    renderLocal(); botLoop();
  }
  function renderLocal() { if (local) render(E.view(local.s, 'me')); }
  function botLoop() {
    clearTimeout(botTimer);
    if (!local) return;
    const s = local.s;
    if (s.stage === 'over') return endLocal();
    const id = E.turnOf(s);
    if (id === null || id === 'me') return; // hand over: waits for the "ready" button
    botTimer = setTimeout(() => { const a = E.botAct(s, id), r = E.act(s, id, a); if (!r.ok) E.act(s, id, { t: 'draw', from: 'deck' }); renderLocal(); botLoop(); }, 800 + Math.random() * 500);
  }
  function endLocal() {
    if (local.done) return; local.done = true;
    if (window.TungMP) TungMP.submitSolo({ game: 'phase10', result: local.s.winner === 'me' ? 'win' : 'loss' });
  }
  function toMenu() { clearTimeout(botTimer); local = null; sel.clear(); cr.setSolo(false); }
  function act(action) {
    if (local) {
      const r = E.act(local.s, 'me', action);
      if (!r.ok) return TungMP.showToast({ title: r.error, ttl: 2200 });
      if (action.t === 'lay' || action.t === 'discard' || action.t === 'hit') sel.clear();
      renderLocal(); botLoop();
    } else { cr.act(action); if (action.t === 'lay' || action.t === 'discard' || action.t === 'hit') sel.clear(); }
  }
  $('startBtn').addEventListener('click', startSolo);
  $('quitBtn').addEventListener('click', () => { if (local) toMenu(); else if (confirm('Leave the room? If a game is on it counts as a loss.')) cr.leave(); });

  // ---------- online rooms ----------
  cr = CardRoom.attach({
    game: 'phase10', panel: $('mpPanel'), menu: $('menu'), play: $('play'),
    onModeChange() { if (local) toMenu(); },
    onStart() { shownEnd = null; sel.clear(); },
    onRoom(room) { if (local) return; turnEndsAt = room.turnMs ? Date.now() + room.turnMs : 0; render(room.g); },
    onLobby() { $('result').hidden = true; shownEnd = null; },
  });
  window.__p10 = () => ({ local, cr, E, sel });
})();
