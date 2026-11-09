/* NetPlay - plumbing for the real-time games where one browser (the host) runs the simulation:
   Air Hockey, Sumo and Bomber Arena. It joins 1v1 challenges (shell matches) and open rooms (2-4 players)
   to one small interface, builds the multiplayer panel and says who is the host.

   NetPlay.attach({ game, rooms, panel, menu, play, onPrepare(ctx), onStart(ctx), onStop(), onExit(), onNet(fromId, d), onRoomEnd(info), onLeft(id) })
   ctx = { kind: 'match' | 'room', host: bool, me: {id,name,avatar}, players: [{id,name,avatar,slot}], opts, seed }  (players[0] is the host)
   returns { send(d), progress(v), report({scores, ranking}), setPlaying(b), leave(), get kind(), get ctx() } */
(function () {
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const avatarHtml = (a) => (a && a.startsWith('emoji:') ? `<span style="font-size:1.5rem">${a.slice(6)}</span>` : `<img src="${esc(a || '')}" alt="" style="width:30px;height:30px;border-radius:50%;object-fit:cover">`);

  function attach(cfg) {
    const T = window.TungMP;
    let mode = 'single', playing = false, net = null, room = null, rooms = [], finished = false;
    const spec = () => (T.cfg && T.cfg.games[cfg.game] && T.cfg.games[cfg.game].options) || {};
    const fmt = (k, v) => ({ rounds: v + (v === 1 ? ' round' : ' rounds'), goals: v + ' goals' }[k] || String(v)[0].toUpperCase() + String(v).slice(1));

    function render() {
      if (cfg.play) cfg.play.hidden = !playing;
      if (cfg.menu) cfg.menu.hidden = playing || mode !== 'single';
      if (cfg.panel) cfg.panel.hidden = playing || mode !== 'multi';
      if (!playing && mode === 'multi') renderPanel();
      if (cfg.onScreen) cfg.onScreen({ mode, playing });
    }
    function renderPanel() {
      const p = cfg.panel; if (!p || p.hidden) return;
      p.replaceChildren();
      const sec = (title, hint) => { const d = document.createElement('div'); d.className = 'np-sec'; d.innerHTML = `<h2>${title}</h2>${hint ? `<p class="np-hint">${hint}</p>` : ''}`; p.append(d); return d; };
      if (T.offline) { sec('Multiplayer', 'Multiplayer needs the game server. Start it with “npm start”.'); return; }
      if (!T.user) { const s = sec('Multiplayer', 'Log in to play other people online.'); const b = document.createElement('button'); b.className = 'mp-btn'; b.textContent = '🔑 Log in / Sign up'; b.onclick = () => T.openAuth(); s.append(b); return; }
      const c = sec('⚔️ Challenge someone (1 v 1)', 'Pick a player who is online. You choose the settings in the challenge window.');
      c.append(T.playerList(cfg.game));
      if (cfg.rooms) renderRooms(sec('🏠 Open rooms (2 to ' + (T.cfg.games[cfg.game].groomMax || 4) + ' players)'));
    }
    function renderRooms(box) {
      const o = spec();
      if (room) {
        const host = room.host === T.user.id;
        const segs = Object.entries(o).map(([k, d]) => `<p class="np-label">${esc(d.label || k)}</p><div class="np-seg" data-k="${k}">${d.values.map((v) => `<button data-v="${esc(v)}" class="${room.opts[k] === v ? 'sel' : ''}" ${host ? '' : 'disabled'}>${esc(fmt(k, v))}</button>`).join('')}</div>`).join('');
        box.insertAdjacentHTML('beforeend', `<div class="np-members">${room.members.map((m) => `<div class="np-member${m.id === room.host ? ' host' : ''}">${avatarHtml(m.avatar)}${esc(m.username)}${m.id === room.host ? ' 👑' : ''}</div>`).join('')}</div>
          <p class="np-hint">${room.members.length} / ${room.max} players. ${room.state === 'lobby' ? (host ? 'You are the host: pick the settings, then start when everyone is here.' : 'Waiting for the host to start…') : room.state === 'countdown' ? 'Starting…' : 'A game is in progress.'}</p>${segs}
          ${room.state === 'lobby' ? T.autoStartHtml(room) : ''}
          <div class="btn-row"><button class="btn" id="npStart" ${host && room.state === 'lobby' && room.members.length >= 2 ? '' : 'disabled'}>🏁 Start game</button><button class="btn secondary" id="npLeave">Leave room</button></div>`);
        box.querySelectorAll('.np-seg').forEach((seg) => { if (!host) return; seg.querySelectorAll('button').forEach((b) => b.onclick = () => { const k = seg.dataset.k, d = o[k], v = d.values.find((x) => String(x) === b.dataset.v); T.send({ t: 'gr_config', opts: { [k]: v } }); }); });
        box.querySelector('#npStart').onclick = () => T.send({ t: 'gr_start' });
        box.querySelector('#npLeave').onclick = () => T.send({ t: 'gr_leave' });
        return;
      }
      box.insertAdjacentHTML('beforeend', `<div class="btn-row" style="justify-content:flex-start"><button class="btn" id="npNew">➕ Create a room</button></div>` +
        (rooms.length ? rooms.map((r) => `<div class="np-row">${avatarHtml(r.host.avatar)}<div class="grow"><b>${esc(r.host.username)}'s room</b><br><small>${Object.entries(r.opts).map(([k, v]) => esc(fmt(k, v))).join(' · ')} · ${r.count}/${r.max}</small></div><button class="btn secondary" data-join="${r.id}" ${r.count >= r.max ? 'disabled' : ''}>Join</button></div>`).join('') : '<p class="np-hint">No open rooms right now. Create one and invite friends!</p>'));
      box.querySelector('#npNew').onclick = () => T.send({ t: 'gr_create', game: cfg.game, opts: {} });
      box.querySelectorAll('[data-join]').forEach((b) => b.onclick = () => T.send({ t: 'gr_join', id: b.dataset.join }));
    }

    function setPlaying(b) { playing = b; render(); }
    const api = {
      setPlaying,
      get kind() { return net ? net.kind : null; },
      get ctx() { return net; },
      send(d) { if (!net) return; if (net.kind === 'match') T.rt(d); else if (net.kind === 'room') T.send({ t: 'gr_rt', d }); },
      progress(v) { if (net && net.kind === 'match') T.progress(v); },
      // match: tell the server my score and that I am done. room: the host names the finishing order.
      report({ score, ranking }) {
        if (!net || finished) return; finished = true;
        if (net.kind === 'match') { T.progress(score); T.finish({ score }); }
        else if (net.kind === 'room' && net.host) T.send({ t: 'gr_result', ranking });
      },
      leave() {
        if (!net) return;
        if (net.kind === 'match') { if (T.match) T.send({ t: 'leave_match', matchId: T.match.id }); }
        else { T.send({ t: 'gr_leave' }); net = null; playing = false; render(); if (cfg.onExit) cfg.onExit(); }
      },
    };

    T.on('mode', (m) => { mode = m; if (!net && cfg.onModeChange) cfg.onModeChange(m); render(); });
    const watch = () => { if (T.user && cfg.rooms) T.send({ t: 'gr_watch', game: cfg.game }); };
    T.on('ready', () => { watch(); render(); });
    T.on('login', () => { watch(); render(); });
    T.on('logout', () => { room = null; rooms = []; render(); });
    T.on('presence', () => { if (mode === 'multi' && !playing) renderPanel(); });
    T.on('msg:gr_rooms', (m) => { if (m.game !== cfg.game) return; rooms = m.rooms; if (mode === 'multi' && !playing) renderPanel(); });
    T.on('msg:gr_room', (m) => { if (m.room && m.room.game !== cfg.game) return; room = m.room; if (!m.room && net && net.kind === 'room') { net = null; playing = false; render(); if (cfg.onExit) cfg.onExit(); return; } if (mode === 'multi' && !playing) renderPanel(); });
    T.on('msg:gr_go', (g) => {
      if (g.game !== cfg.game) return;
      finished = false;
      const players = g.players.map((p) => ({ id: p.id, name: p.username, avatar: p.avatar, gear: p.gear, slot: p.slot }));
      const host = players.find((p) => p.id === g.host) || players[0];
      players.sort((a, b) => (a.id === host.id ? -1 : b.id === host.id ? 1 : a.slot - b.slot)); // the host is always first
      net = { kind: 'room', host: g.host === g.you, hostId: host.id, me: players.find((p) => p.id === g.you), players, opts: g.opts, seed: g.seed };
      mode = 'multi'; playing = true; render();
      cfg.onPrepare(net);
      setTimeout(() => { if (net && net.kind === 'room') cfg.onStart(net); }, g.ms);
    });
    T.on('msg:gr_rt', (m) => { if (net && net.kind === 'room') cfg.onNet(m.from, m.d); });
    T.on('msg:gr_left', (m) => { if (cfg.onLeft) cfg.onLeft(m.id); });
    T.on('msg:gr_end', (m) => { if (m.game !== cfg.game) return; if (cfg.onStop) cfg.onStop(); if (cfg.onRoomEnd) cfg.onRoomEnd(m); T.refreshBoard(); });
    T.on('msg:rt', (m) => { if (net && net.kind === 'match') cfg.onNet(net.oppId, m.d); });
    T.registerGame({
      prepareMatch(m) {
        finished = false;
        const me = { id: m.you.id, name: m.you.username, avatar: m.you.avatar, gear: m.you.gear }, opp = { id: m.opp.id, name: m.opp.username, avatar: m.opp.avatar, gear: m.opp.gear };
        const players = (m.idx === 0 ? [me, opp] : [opp, me]).map((p, i) => ({ ...p, slot: i }));
        net = { kind: 'match', host: m.idx === 0, hostId: players[0].id, oppId: opp.id, me: players.find((p) => p.id === me.id), players, opts: m.options, seed: m.seed };
        mode = 'multi'; playing = true; render(); cfg.onPrepare(net);
      },
      startMatch() { if (net && net.kind === 'match') cfg.onStart(net); },
      stopMatch() { if (cfg.onStop) cfg.onStop(); },
      exitMatch() { net = null; playing = false; render(); if (cfg.onExit) cfg.onExit(); },
    });
    render();
    return api;
  }
  window.NetPlay = { attach, avatarHtml, esc };
})();
