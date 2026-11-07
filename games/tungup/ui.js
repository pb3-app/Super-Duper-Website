(() => {
  const M = window.TungMaps, L = window.TungLoad, TA = window.TungArt;
  const $ = (id) => document.getElementById(id);
  const canvas = $('view');
  const fmt = (ms) => { const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  let sel = { map: 'junkyard', tung: 'classic', bat: 'classic', chaos: 'normal' };
  try { Object.assign(sel, JSON.parse(store.get('tungUpLoadout') || '{}')); } catch {}
  if (!M.IDS.includes(sel.map)) sel.map = 'junkyard'; if (!L.TUNGS[sel.tung]) sel.tung = 'classic'; if (!L.BATS[sel.bat]) sel.bat = 'classic';
  const saveSel = () => store.set('tungUpLoadout', JSON.stringify(sel));

  let mode = 'single', screen = 'select', net = null, roomView = null, rooms = [], lastResult = null;
  const myName = () => (window.TungMP && TungMP.user ? TungMP.user.username : 'You');
  const myId = () => (window.TungMP && TungMP.user ? TungMP.user.id : 'me');

  // ---------------- engine ----------------
  const engine = TUEngine.create(canvas, {
    send(d) { if (!net) return; if (net.kind === 'match') TungMP.rt(d); else if (net.kind === 'room') TungMP.send({ t: 'tu_rt', d }); },
    onProgress(pct) { if (!net) return; if (net.kind === 'match') TungMP.progress(pct); else if (net.kind === 'room') TungMP.send({ t: 'tu_progress', v: pct }); },
    onTop(ms) {
      if (!net) return soloDone(ms);
      if (net.kind === 'match') { TungMP.progress(100); TungMP.finish({ cleared: true }); }
      else if (net.kind === 'room') { TungMP.send({ t: 'tu_progress', v: 100 }); TungMP.send({ t: 'tu_top' }); }
    },
    onStart() { hideResult(); },
  });

  // ---------------- pickers ----------------
  const bar = (label, v) => `<div class="stat"><span>${label}</span><i><b style="width:${Math.round(Math.max(0.08, Math.min(1, v)) * 100)}%"></b></i></div>`;
  const norm = (v, lo, hi) => 0.2 + 0.8 * ((v - lo) / (hi - lo));
  function batIcon(b) {
    const c = document.createElement('canvas'); c.width = 52; c.height = 62; const x = c.getContext('2d');
    x.lineCap = 'round'; x.translate(26, 31); x.rotate(0.7);
    const len = 14 + b.reach * 0.32, th = b.id === 'heavy' ? 13 : b.id === 'twig' ? 4 : b.id === 'noodle' ? 5 : 8;
    x.strokeStyle = b.dark; x.lineWidth = th + 3; x.beginPath(); x.moveTo(0, len); x.lineTo(0, -len); x.stroke();
    x.strokeStyle = b.col; x.lineWidth = th; x.beginPath(); x.moveTo(0, len * 0.7); x.lineTo(0, -len); x.stroke();
    if (b.id === 'mallet') { x.fillStyle = b.col; x.strokeStyle = b.dark; x.lineWidth = 3; x.beginPath(); x.roundRect(-9, -len - 8, 18, 22, 4); x.fill(); x.stroke(); }
    if (b.id === 'frost') { x.fillStyle = '#e8f9ff'; x.beginPath(); x.arc(0, -len, 8, 0, 7); x.fill(); x.stroke(); }
    return c.toDataURL();
  }
  function renderPickers() {
    $('mapCards').innerHTML = M.IDS.map((id) => {
      const d = M.DEFS[id], m = M.build(id), s = d.sky;
      return `<button class="pcard mapcard${sel.map === id ? ' sel' : ''}" data-map="${id}"><div class="sky" style="background:linear-gradient(to top,${s[0]},${s[1]},${s[2]})"><span>${(m.height / 10).toFixed(0)} m · ${m.platforms.length} ledges</span></div><div class="info"><h3>${d.name}</h3><p>${d.blurb}</p></div></button>`;
    }).join('');
    $('tungCards').innerHTML = L.TUNG_IDS.map((id) => {
      const t = L.TUNGS[id];
      const img = TA.dataURL({ pal: t.pal === 'brown' ? undefined : t.pal, parts: { legs: true, armFar: true, face: true, bat: false } }, 104, 124);
      return `<button class="pcard${sel.tung === id ? ' sel' : ''}" data-tung="${id}"><h3>${t.name}</h3><p>${t.blurb}</p><div class="row"><img src="${img}" alt=""><div class="stats">${bar('Health', norm(t.hp, 70, 140))}${bar('Speed', norm(t.speed, 200, 295))}${bar('Jump', norm(t.jump, 820, 950))}${bar('Weight', norm(t.weight, 0.7, 1.45))}</div></div></button>`;
    }).join('');
    $('batCards').innerHTML = L.BAT_IDS.map((id) => {
      const b = L.BATS[id];
      return `<button class="pcard${sel.bat === id ? ' sel' : ''}" data-bat="${id}"><h3>${b.name}</h3><p>${b.blurb}</p><div class="row"><img src="${batIcon(b)}" alt=""><div class="stats">${bar('Damage', norm(b.dmg, 6, 30))}${bar('Knockback', norm(b.knock, 300, 850))}${bar('Swing', norm(0.75 - b.swing, 0.05, 0.6))}${bar('Reach', norm(b.reach, 45, 108))}</div></div></button>`;
    }).join('');
    for (const b of $('chaosSeg').children) b.classList.toggle('sel', b.dataset.v === sel.chaos);
  }
  document.addEventListener('click', (e) => {
    const c = e.target.closest('.pcard'); if (!c) return;
    if (c.dataset.map) sel.map = c.dataset.map; if (c.dataset.tung) sel.tung = c.dataset.tung; if (c.dataset.bat) sel.bat = c.dataset.bat;
    saveSel(); renderPickers(); updateBest();
  });
  $('chaosSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; sel.chaos = b.dataset.v; saveSel(); renderPickers(); });

  // ---------------- screens ----------------
  function show(s) {
    screen = s;
    $('play').hidden = s !== 'play';
    const lobby = s === 'select';
    $('loadout').hidden = !lobby;
    $('mpPanel').hidden = !(lobby && mode === 'multi');
    $('secMap').hidden = mode === 'multi'; $('secChaos').hidden = mode === 'multi'; $('startRow').hidden = mode === 'multi';
    $('h2Tung').textContent = (mode === 'multi' ? '1' : '2') + '. Pick your Tung'; $('h2Bat').textContent = (mode === 'multi' ? '2' : '3') + '. Pick your bat';
    $('againBtn').hidden = !!net; $('quitBtn').textContent = net ? '🚪 Leave' : '☰ Loadout (Esc)';
    if (lobby) { if (mode === 'multi') { renderPlayers(); renderRooms(); } updateBest(); }
  }
  function updateBest() { const b = store.get('tungUpBest:' + sel.map); $('bestEl').textContent = b ? fmt(Number(b)) : '-'; }

  // ---------------- solo ----------------
  function startSolo() {
    net = null; hideResult();
    engine.setup({ mapId: sel.map, chaos: sel.chaos, seed: 'solo' + Date.now(), mode: 'solo', me: { id: 'me', name: myName(), tung: sel.tung, bat: sel.bat }, others: [] });
    show('play'); engine.beginCountdown(3.2); engine.startLoop(); setTimeout(() => canvas.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  }
  function soloDone(ms) {
    const key = 'tungUpBest:' + sel.map, prev = Number(store.get(key) || 0), pb = !prev || ms < prev;
    if (pb) store.set(key, String(ms));
    updateBest();
    const ranked = sel.chaos === 'normal';
    if (ranked && window.TungMP) TungMP.submitSolo({ game: 'tungup', level: sel.map, time: ms });
    showResult(`<h2>🏔️ You reached the top!</h2><p style="font-size:1.6rem;font-weight:900">${fmt(ms)}</p><p>${pb ? '🏆 New personal best on this map!' : 'Your best: ' + fmt(prev)}</p><p class="hintline">${ranked ? 'Saved to the solo time board (log in to appear on it).' : 'Only Normal chaos runs go on the time board.'}</p><div class="btn-row"><button class="btn" id="rAgain">↻ Climb again</button><button class="btn secondary" id="rLoad">☰ Change loadout</button></div>`);
    $('rAgain').onclick = startSolo; $('rLoad').onclick = () => { hideResult(); engine.stop(); show('select'); };
  }
  function showResult(html) { const r = $('tuResult'); r.innerHTML = html; r.hidden = false; }
  function hideResult() { $('tuResult').hidden = true; }
  $('startBtn').addEventListener('click', startSolo);
  $('againBtn').addEventListener('click', () => { if (!net) startSolo(); });
  $('quitBtn').addEventListener('click', () => {
    if (!net) { engine.stop(); engine.setPhase('idle'); hideResult(); show('select'); return; }
    if (net.kind === 'match') { if (confirm('Leave the match? You will forfeit and it counts as a loss.')) { TungMP.send({ t: 'leave_match', matchId: TungMP.match.id }); } }
    else if (net.kind === 'room') { if (confirm('Leave the room? If a race is on, it counts as a loss.')) { TungMP.send({ t: 'tu_leave' }); engine.stop(); net = null; hideResult(); show('select'); } }
  });

  // ---------------- keyboard / touch ----------------
  const GAMEKEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'KeyJ', 'KeyX', 'KeyK', 'KeyE']);
  const typing = (e) => e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
  document.addEventListener('keydown', (e) => {
    if (screen !== 'play' || typing(e)) return;
    if (GAMEKEYS.has(e.code)) { e.preventDefault(); if (!e.repeat) engine.key(e.code, true); }
    if (!net && !e.repeat) { if (e.code === 'KeyR') startSolo(); if (e.code === 'Escape') $('quitBtn').click(); }
  });
  document.addEventListener('keyup', (e) => { if (GAMEKEYS.has(e.code)) engine.key(e.code, false); });
  window.addEventListener('blur', () => { for (const k of ['l', 'r', 'jump', 'down']) engine.press(k, false); });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { e.preventDefault(); engine.press('swing', true); } });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  for (const [id, name] of [['bL', 'l'], ['bR', 'r'], ['bJ', 'jump'], ['bS', 'swing'], ['bI', 'item'], ['bD', 'down']]) {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); engine.press(name, true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => engine.press(name, false));
  }
  setInterval(() => {
    if (screen !== 'play') return;
    $('timeEl').textContent = fmt(engine.time * 1000);
    $('heightEl').textContent = Math.floor(engine.pct);
  }, 100);

  // ---------------- multiplayer lobby ----------------
  function renderPlayers() {
    const box = $('tuPlayers'); box.replaceChildren();
    if (!window.TungMP || TungMP.offline) { box.textContent = 'Multiplayer needs the game server. Start it with “npm start”.'; return; }
    if (!TungMP.user) { const p = document.createElement('p'); p.textContent = 'Log in to race other players.'; const b = document.createElement('button'); b.className = 'mp-btn'; b.textContent = '🔑 Log in / Sign up'; b.onclick = () => TungMP.openAuth(); box.append(p, b); return; }
    box.append(TungMP.playerList('tungup'));
  }
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  function avatarHtml(a) { return a && a.startsWith('emoji:') ? `<span style="font-size:1.5rem">${a.slice(6)}</span>` : `<img src="${esc(a)}" alt="" style="width:30px;height:30px;border-radius:50%;object-fit:cover">`; }
  function renderRooms() {
    const box = $('tuRooms');
    if (!window.TungMP || TungMP.offline) { box.textContent = ''; return; }
    if (!TungMP.user) { box.innerHTML = '<p class="hintline">Log in to create or join rooms.</p>'; return; }
    if (roomView) {
      const r = roomView, host = r.host === TungMP.user.id;
      const mapsOpts = M.IDS.map((id) => `<button data-rmap="${id}" class="${r.map === id ? 'sel' : ''}">${M.DEFS[id].name}</button>`).join('');
      const chaos = ['off', 'normal', 'wild'].map((c) => `<button data-rchaos="${c}" class="${r.chaos === c ? 'sel' : ''}">${c[0].toUpperCase() + c.slice(1)}</button>`).join('');
      box.innerHTML = `<div class="members">${r.members.map((m) => `<div class="member${m.id === r.host ? ' host' : ''}">${avatarHtml(m.avatar)}${esc(m.username)}${m.id === r.host ? ' 👑' : ''}</div>`).join('')}</div>
        <p class="hintline">${r.members.length} / ${r.max} racers. ${r.state === 'lobby' ? (host ? 'You are the host: pick the map and chaos level, then start when everyone is ready.' : 'Waiting for the host to start the race…') : r.state === 'countdown' ? 'Starting…' : 'A race is in progress.'}</p>
        <p style="margin:.4rem 0 .2rem;font-weight:800">Map</p><div class="seg" id="rmaps">${mapsOpts}</div>
        <p style="margin:.6rem 0 .2rem;font-weight:800">Chaos</p><div class="seg" id="rchaos">${chaos}</div>
        <div class="btn-row"><button class="btn" id="roomStart" ${host && r.state === 'lobby' && r.members.length >= 2 ? '' : 'disabled'}>🏁 Start race</button><button class="btn secondary" id="roomLeave">Leave room</button></div>`;
      if (!host) for (const b of box.querySelectorAll('#rmaps button, #rchaos button')) b.disabled = true;
      box.querySelectorAll('[data-rmap]').forEach((b) => b.onclick = () => TungMP.send({ t: 'tu_config', map: b.dataset.rmap }));
      box.querySelectorAll('[data-rchaos]').forEach((b) => b.onclick = () => TungMP.send({ t: 'tu_config', chaos: b.dataset.rchaos }));
      $('roomStart').onclick = () => TungMP.send({ t: 'tu_start' });
      $('roomLeave').onclick = () => TungMP.send({ t: 'tu_leave' });
      return;
    }
    box.innerHTML = `<div class="btn-row" style="justify-content:flex-start"><button class="btn" id="roomNew">➕ Create a room</button></div>` +
      (rooms.length ? rooms.map((r) => `<div class="roomrow">${avatarHtml(r.host.avatar)}<div class="grow"><b>${esc(r.host.username)}'s room</b><br><small>${esc(M.DEFS[r.map] ? M.DEFS[r.map].name : r.map)} · chaos ${esc(r.chaos)} · ${r.count}/${r.max}</small></div><button class="btn secondary" data-join="${r.id}" ${r.count >= r.max ? 'disabled' : ''}>Join</button></div>`).join('') : '<p class="hintline">No open rooms right now. Create one and share the link with friends!</p>');
    $('roomNew').onclick = () => TungMP.send({ t: 'tu_create', map: sel.map, chaos: sel.chaos });
    box.querySelectorAll('[data-join]').forEach((b) => b.onclick = () => TungMP.send({ t: 'tu_join', id: b.dataset.join }));
  }

  // ---------------- wiring to the shared multiplayer client ----------------
  if (window.TungMP) {
    TungMP.on('mode', (m) => {
      mode = m;
      if (net) { show('play'); return; }
      if (m === 'multi') { engine.stop(); engine.setPhase('idle'); hideResult(); }
      show('select');
    });
    const watch = () => { if (TungMP.user) TungMP.send({ t: 'tu_watch' }); };
    TungMP.on('ready', () => { watch(); renderPlayers(); renderRooms(); });
    TungMP.on('login', () => { renderPlayers(); renderRooms(); });
    TungMP.on('logout', () => { roomView = null; rooms = []; renderPlayers(); renderRooms(); });
    TungMP.on('presence', () => { if (mode === 'multi' && screen === 'select') renderPlayers(); });
    TungMP.on('msg:tu_rooms', (m) => { rooms = m.rooms; if (mode === 'multi' && screen === 'select') renderRooms(); });
    TungMP.on('msg:tu_room', (m) => { roomView = m.room; if (!m.room && net && net.kind === 'room') { net = null; } if (mode === 'multi' && screen === 'select') renderRooms(); });
    TungMP.on('msg:tu_go', (g) => {
      net = { kind: 'room' }; hideResult();
      const me = g.players.find((p) => p.id === g.you);
      engine.setup({ mapId: g.map, chaos: g.chaos, seed: g.seed, mode: 'room', me: { id: me.id, name: me.username, avatar: me.avatar, tung: sel.tung, bat: sel.bat }, others: g.players.filter((p) => p.id !== g.you).map((p) => ({ id: p.id, name: p.username, avatar: p.avatar, tung: 'classic', bat: 'classic' })) });
      mode = 'multi'; show('play'); engine.beginCountdown(g.ms / 1000); engine.startLoop();
    });
    TungMP.on('msg:tu_rt', (m) => { if (net && net.kind === 'room') engine.onNet(m.from, m.d); });
    TungMP.on('msg:tu_end', (m) => {
      engine.stop(); if (!net || net.kind !== 'room') return;
      const won = m.winner === m.you;
      const rows = m.ranking.map((r, i) => `<tr class="${r.id === m.winner ? 'win' : ''}"><td>${i + 1}</td><td>${avatarHtml(r.avatar)} ${esc(r.username)}${r.id === m.you ? ' (you)' : ''}</td><td>${r.progress}%</td><td>${r.time ? fmt(r.time) : ''}</td></tr>`).join('');
      const why = { top: won ? 'You reached the top first!' : 'Someone reached the top first.', alone: 'Everyone else left the room.', timeout: 'Time ran out: highest climber wins.' }[m.reason] || '';
      showResult(`<h2>${won ? '🏆 You won!' : '🏁 Race over'}</h2><p>${why}</p><table>${rows}</table><p class="hintline">Your Tung Up! record: ${m.stats.game.w}W - ${m.stats.game.l}L</p><div class="btn-row"><button class="btn" id="rBack">Back to the room</button><button class="btn secondary" id="rLeave">Leave room</button></div>`);
      $('rBack').onclick = () => { hideResult(); net = null; show('select'); renderRooms(); };
      $('rLeave').onclick = () => { TungMP.send({ t: 'tu_leave' }); hideResult(); net = null; show('select'); };
      TungMP.refreshBoard(); beepEnd(won);
    });
    TungMP.registerGame({
      prepareMatch(m) {
        net = { kind: 'match', oppId: m.opp.id }; hideResult(); mode = 'multi';
        engine.setup({ mapId: m.options.level, chaos: m.options.chaos, seed: m.seed, mode: 'match', me: { id: m.you.id, name: m.you.username, avatar: m.you.avatar, tung: sel.tung, bat: sel.bat }, others: [{ id: m.opp.id, name: m.opp.username, avatar: m.opp.avatar, tung: 'classic', bat: 'classic' }] });
        engine.setPhase('idle'); show('play'); engine.startLoop();
      },
      startMatch() { if (net && net.kind === 'match') engine.beginNow(); },
      stopMatch() { engine.stop(); },
      exitMatch() { net = null; engine.stop(); engine.setPhase('idle'); hideResult(); show('select'); },
    });
    TungMP.on('msg:rt', (m) => { if (net && net.kind === 'match') engine.onNet(net.oppId, m.d); });
  }
  function beepEnd(won) { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = won ? 660 : 200; g.gain.value = 0.06; o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.3); } catch (_) {} }

  renderPickers(); show('select');
  // paint the first map behind the picker so the canvas is never blank when the run starts
  engine.setup({ mapId: sel.map, chaos: 'off', seed: 'preview', mode: 'solo', me: { id: 'me', name: myName(), tung: sel.tung, bat: sel.bat }, others: [] });
  window.__tu = engine;
})();
