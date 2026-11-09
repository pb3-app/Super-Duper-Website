/* CardRoom - the multiplayer side of the card games (Tung Tung Uno and Phase 10): open rooms for 2 to 6 players, run by the
   server (it holds the hands). Builds the lobby panel and tells the page what the room looks like.

   CardRoom.attach({ game, panel, menu, play, onRoom(room), onEnd(msg), onLobby() })
   returns { act(action), leave(), toLobby(), setSolo(bool), get room() } */
(function () {
  function attach(cfg) {
    const T = window.TungMP, esc = NetPlay.esc, av = NetPlay.avatarHtml;
    let mode = 'single', solo = false, room = null, rooms = [];
    const spec = () => (T.cfg && T.cfg.games[cfg.game] && T.cfg.games[cfg.game].options) || {};
    const fmt = (k, v) => ({ bots: v ? v + ' computer' : 'no computer', phases: v + (v === 1 ? ' phase' : ' phases') }[k] || String(v));
    const inGame = () => !!(room && (room.state === 'playing' || room.state === 'over'));

    function render() {
      const playing = solo || inGame();
      cfg.play.hidden = !playing;
      if (cfg.menu) cfg.menu.hidden = playing || mode !== 'single';
      cfg.panel.hidden = playing || mode !== 'multi';
      if (!playing && mode === 'multi') renderPanel();
    }
    function sec(p, title, hint) { const d = document.createElement('div'); d.className = 'np-sec'; d.innerHTML = `<h2>${title}</h2>${hint ? `<p class="np-hint">${hint}</p>` : ''}`; p.append(d); return d; }
    function renderPanel() {
      const p = cfg.panel; if (!p || p.hidden) return; p.replaceChildren();
      if (T.offline) return void sec(p, 'Multiplayer', 'Multiplayer needs the game server. Start it with “npm start”.');
      if (!T.user) { const s = sec(p, 'Multiplayer', 'Log in to play other people online.'); const b = document.createElement('button'); b.className = 'mp-btn'; b.textContent = '🔑 Log in / Sign up'; b.onclick = () => T.openAuth(); s.append(b); return; }
      const box = sec(p, '🏠 Rooms (2 to 6 players)');
      if (room) {
        const host = room.host === T.user.id, o = spec();
        const segs = Object.entries(o).map(([k, d]) => `<p class="np-label">${esc(d.label || k)}</p><div class="np-seg" data-k="${k}">${d.values.map((v) => `<button data-v="${esc(v)}" class="${room.opts[k] === v ? 'sel' : ''}" ${host ? '' : 'disabled'}>${esc(fmt(k, v))}</button>`).join('')}</div>`).join('');
        box.insertAdjacentHTML('beforeend', `<div class="np-members">${room.members.map((m) => `<div class="np-member${m.id === room.host ? ' host' : ''}">${av(m.avatar)}${esc(m.username)}${m.id === room.host ? ' 👑' : ''}</div>`).join('')}</div>
          <p class="np-hint">${room.members.length} / ${room.max} players. ${host ? 'You are the host: pick the settings, then start when everyone is here. Computer players only fill empty seats.' : 'Waiting for the host to start…'}</p>${segs}
          ${room.state === 'lobby' ? T.autoStartHtml(room) : ''}
          <div class="btn-row"><button class="btn" id="crStart" ${host && room.members.length >= 2 ? '' : 'disabled'}>🏁 Start game</button><button class="btn secondary" id="crLeave">Leave room</button></div>`);
        box.querySelectorAll('.np-seg').forEach((seg) => { if (!host) return; seg.querySelectorAll('button').forEach((b) => b.onclick = () => { const k = seg.dataset.k, d = o[k], v = d.values.find((x) => String(x) === b.dataset.v); T.send({ t: 'cr_config', opts: { [k]: v } }); }); });
        box.querySelector('#crStart').onclick = () => T.send({ t: 'cr_start' });
        box.querySelector('#crLeave').onclick = () => T.send({ t: 'cr_leave' });
        return;
      }
      box.insertAdjacentHTML('beforeend', `<div class="btn-row" style="justify-content:flex-start"><button class="btn" id="crNew">➕ Create a room</button></div>` +
        (rooms.length ? rooms.map((r) => `<div class="np-row">${av(r.host.avatar)}<div class="grow"><b>${esc(r.host.username)}'s room</b><br><small>${Object.entries(r.opts).map(([k, v]) => esc(fmt(k, v))).join(' · ')} · ${r.count}/${r.max}</small></div><button class="btn secondary" data-join="${r.id}" ${r.count >= r.max ? 'disabled' : ''}>Join</button></div>`).join('') : '<p class="np-hint">No open rooms right now. Create one and invite friends!</p>'));
      box.querySelector('#crNew').onclick = () => T.send({ t: 'cr_create', game: cfg.game, opts: {} });
      box.querySelectorAll('[data-join]').forEach((b) => b.onclick = () => T.send({ t: 'cr_join', id: b.dataset.join }));
    }

    T.on('mode', (m) => { mode = m; if (!inGame() && cfg.onModeChange) cfg.onModeChange(m); render(); });
    const watch = () => { if (T.user) T.send({ t: 'cr_watch', game: cfg.game }); };
    T.on('ready', () => { watch(); render(); });
    T.on('login', () => { watch(); render(); });
    T.on('logout', () => { room = null; rooms = []; render(); });
    T.on('msg:cr_rooms', (m) => { if (m.game !== cfg.game) return; rooms = m.rooms; if (mode === 'multi' && !inGame()) renderPanel(); });
    T.on('msg:cr_room', (m) => {
      if (m.room && m.room.game !== cfg.game) return;
      const was = inGame(); room = m.room;
      if (room) { mode = 'multi'; if (!was && inGame() && cfg.onStart) cfg.onStart(room); }
      render();
      if (inGame()) cfg.onRoom(room); else if (was && cfg.onLobby) cfg.onLobby();
    });
    T.on('msg:cr_reject', (m) => { T.showToast({ title: m.error, ttl: 2500 }); });
    T.on('msg:cr_end', (m) => { if (m.game === cfg.game) { if (cfg.onEnd) cfg.onEnd(m); T.refreshBoard(); } });
    render();
    return {
      act(action) { T.send({ t: 'cr_act', action }); },
      leave() { T.send({ t: 'cr_leave' }); },
      toLobby() { T.send({ t: 'cr_lobby' }); },
      setSolo(b) { solo = b; render(); },
      get room() { return room; },
      get inRoomGame() { return inGame(); },
    };
  }
  window.CardRoom = { attach };
})();
