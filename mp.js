/*
 * Tung Tung Arcade - multiplayer client
 * Accounts, online list, challenges, match shell for game pages, leaderboards.
 * Games talk to this through window.TungMP (see bottom of file).
 */
(() => {
  'use strict';

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else if (v === true) e.setAttribute(k, '');
        else e.setAttribute(k, v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
    del(k) { try { sessionStorage.removeItem(k); } catch {} },
  };

  // ---------- Background music: one looping track on every page, with a button to turn it off ----------
  // Browsers only start sound after the visitor has clicked, tapped or pressed a key on the site, so the track starts at the
  // first of those. Each page is a new page load, so the position is saved and the next page carries on from about there.
  const Music = (() => {
    const SRC = '/assets/audio/batida-funk-medley.mp3', PREF = 'tungMusic', POS = 'tungMusicPos';
    const ls = {
      get(k) { try { return localStorage.getItem(k); } catch { return null; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    };
    let audio = null, on = ls.get(PREF) !== 'off', waiting = false;
    const buttons = new Set();
    function ensure() {
      if (audio) return audio;
      audio = new Audio(SRC);
      audio.loop = true; audio.volume = 0.3; audio.preload = 'auto';
      const pos = Number(ls.get(POS));
      if (pos > 0) audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = pos % (audio.duration || pos + 1); } catch {} }, { once: true });
      setInterval(() => { if (!audio.paused) ls.set(POS, String(audio.currentTime)); }, 1000);
      window.addEventListener('pagehide', () => ls.set(POS, String(audio.currentTime)));
      return audio;
    }
    function waitForGesture() {
      if (waiting) return;
      waiting = true;
      const go = () => { waiting = false; for (const ev of EVENTS) removeEventListener(ev, go, true); play(); };
      const EVENTS = ['pointerdown', 'keydown', 'touchstart'];
      for (const ev of EVENTS) addEventListener(ev, go, { capture: true, passive: true });
    }
    function play() {
      if (!on) return;
      const p = ensure().play();
      if (p && p.catch) p.catch(() => waitForGesture());
    }
    function paint() {
      for (const b of buttons) {
        b.textContent = on ? '🔊' : '🔇';
        b.setAttribute('aria-pressed', String(on));
        b.setAttribute('aria-label', on ? 'Turn the music off' : 'Turn the music on');
        b.title = on ? 'Music on' : 'Music off';
      }
    }
    function toggle() {
      on = !on;
      ls.set(PREF, on ? 'on' : 'off');
      if (on) play(); else if (audio) audio.pause();
      paint();
    }
    return {
      start: play,
      button() {
        const b = h('button', { class: 'mp-btn ghost mp-music', type: 'button', onclick: toggle });
        buttons.add(b); paint();
        return b;
      },
    };
  })();

  // Deterministic RNG so both players get the same board (exposed for games).
  function hashSeed(str) {
    let x = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      x = Math.imul(x ^ str.charCodeAt(i), 3432918353);
      x = (x << 13) | (x >>> 19);
    }
    return () => {
      x = Math.imul(x ^ (x >>> 16), 2246822507);
      x = Math.imul(x ^ (x >>> 13), 3266489909);
      return (x ^= x >>> 16) >>> 0;
    };
  }
  function rng(seedStr) {
    const seed = hashSeed(String(seedStr));
    let a = seed();
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let audioCtx;
  function tung(freq = 200, dur = 0.2) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq / 3, t + dur);
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + dur);
    } catch (_) {}
  }

  // ---------- state ----------
  const S = {
    cfg: null, token: store.get('tungToken'), user: null, ws: null, retry: 0,
    offline: false, online: [], loggingOut: false, outgoing: null, incoming: new Map(),
    shell: null, listeners: {},
  };
  const on = (ev, fn) => ((S.listeners[ev] = S.listeners[ev] || []).push(fn));
  const emit = (ev, d) => (S.listeners[ev] || []).forEach((fn) => fn(d));

  async function api(path, { method = 'GET', body } = {}) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (S.token) headers.Authorization = 'Bearer ' + S.token;
    const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try { data = await r.json(); } catch {}
    if (!r.ok) throw new Error(data.error || 'Request failed (' + r.status + ')');
    return data;
  }

  // ---------- avatar ----------
  function avatarNode(av, size = 32) {
    const box = h('span', { class: 'mp-avatar' });
    box.style.width = box.style.height = size + 'px';
    box.style.fontSize = Math.round(size * 0.58) + 'px';
    if (typeof av === 'string' && av.startsWith('emoji:')) box.textContent = av.slice(6);
    else if (typeof av === 'string') box.append(h('img', { src: av, alt: '' }));
    return box;
  }
  const gameTitle = (id) => (S.cfg && S.cfg.games[id] ? S.cfg.games[id].title : id);
  const gameIcon = (id) => (S.cfg && S.cfg.games[id] ? S.cfg.games[id].icon : '🎮');
  const OPT_FMT = {
    dots: (v) => v + ' dots', size: (v) => v + 'x' + v, chances: (v) => v + ' lives', length: (v) => v + 's', time: (v) => v + 's',
    laps: (v) => v + ' laps', bots: (v) => (v ? v + ' bots' : 'no bots'), rule: (v) => (v === 'streak' ? 'Hit again' : 'Classic'),
    variant: (v) => (v === 'crazyhouse' ? 'Crazyhouse' : 'Standard'),
    rounds: (v) => v + (v === 1 ? ' round' : ' rounds'), goals: (v) => v + ' goals',
  };
  const fmtOpt = (k, v) => (OPT_FMT[k] ? OPT_FMT[k](v) : v === 'misere' ? 'Misère' : String(v)[0].toUpperCase() + String(v).slice(1));
  const fmtTime = (ms) => { const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); };
  const optText = (o) => { const v = Object.entries(o || {}).map(([k, x]) => fmtOpt(k, x)); return v.length ? ' (' + v.join(', ') + ')' : ''; };

  // ---------- websocket ----------
  function connect() {
    if (!S.token || S.offline) return;
    if (S.ws && S.ws.readyState <= 1) return;
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    S.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token: S.token }));
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      onMsg(m);
    };
    ws.onclose = () => {
      if (S.ws !== ws) return;
      S.ws = null;
      emit('conn');
      if (S.token && !S.loggingOut) {
        S.retry = Math.min((S.retry || 500) * 2, 8000);
        setTimeout(connect, S.retry);
      }
    };
  }
  function send(m) {
    if (S.ws && S.ws.readyState === 1) { S.ws.send(JSON.stringify(m)); return true; }
    return false;
  }

  function onMsg(m) {
    switch (m.t) {
      case 'hello':
        S.user = m.user; S.retry = 0;
        renderSlot(); emit('ready');
        break;
      case 'auth_failed':
        clearSession();
        break;
      case 'presence':
        S.online = m.users;
        renderSlot(); renderDrawer(); emit('presence');
        break;
      case 'error':
        showToast({ title: m.message, ttl: 4000 });
        break;
      case 'challenge_in': incomingChallenge(m); break;
      case 'challenge_out': outgoingChallenge(m); break;
      case 'challenge_update': challengeUpdate(m); break;
      case 'match_start':
        location.href = '/games/' + m.game + '/index.html?match=' + encodeURIComponent(m.matchId);
        break;
      default:
        emit('msg:' + m.t, m);
    }
  }

  function clearSession() {
    S.token = null; S.user = null; S.online = [];
    store.del('tungToken');
    if (S.ws) { const w = S.ws; S.ws = null; w.close(); }
    renderSlot(); renderDrawer(); emit('presence'); emit('logout');
  }
  async function logout() {
    S.loggingOut = true;
    try { await api('/api/logout', { method: 'POST', body: {} }); } catch {}
    clearSession();
    S.loggingOut = false;
    closeDrawer();
    if (S.shell && S.shell.match) location.href = location.pathname;
  }

  // ---------- slot / drawer ----------
  let drawer;
  function slotEl() {
    let s = $('#mpSlot');
    if (!s) { s = h('div', { id: 'mpSlot', class: 'mp-float' }); document.body.append(s); }
    s.classList.add('mp-slot');
    return s;
  }
  function others() { return S.online.filter((u) => !S.user || u.id !== S.user.id); }

  function renderSlot() {
    const slot = slotEl();
    slot.replaceChildren();
    if (S.offline) {
      slot.append(h('span', { class: 'mp-chip warn', title: 'Start the server with: npm start' }, '⚠️ Offline'));
    } else if (S.user) {
      slot.append(h('button', { class: 'mp-btn ghost', onclick: toggleDrawer, title: 'Online players' },
        avatarNode(S.user.avatar, 24), S.user.username, ' · 👥 ' + others().length));
    } else if (S.token) {
      slot.append(h('span', { class: 'mp-chip' }, 'Connecting…'));
    } else {
      slot.append(h('button', { class: 'mp-btn', onclick: () => openAuth() }, '🔑 Log in'));
    }
    slot.append(Music.button());
  }
  function toggleDrawer() { if (drawer && !drawer.hidden) closeDrawer(); else { buildDrawer(); drawer.hidden = false; renderDrawer(); } }
  function closeDrawer() { if (drawer) drawer.hidden = true; }
  function buildDrawer() {
    if (drawer) return;
    drawer = h('aside', { class: 'mp-drawer', hidden: true });
    document.body.append(drawer);
    document.addEventListener('click', (e) => {
      if (drawer.hidden) return;
      if (drawer.contains(e.target) || $('#mpSlot').contains(e.target) || e.target.closest('.mp-backdrop')) return;
      closeDrawer();
    });
  }
  function renderDrawer() {
    if (!drawer || drawer.hidden) return;
    drawer.replaceChildren();
    if (!S.user) { drawer.hidden = true; return; }
    drawer.append(
      h('div', { class: 'mp-me' }, avatarNode(S.user.avatar, 40), h('span', { class: 'grow' }, S.user.username),
        h('button', { class: 'mp-btn small ghost', onclick: logout }, 'Log out')),
      h('h3', null, '👥 Online now'),
      playerList(null),
    );
  }

  function inMatchNow() {
    const me = S.online.find((u) => S.user && u.id === S.user.id);
    return !!(me && me.status === 'ingame') || !!(S.shell && S.shell.match);
  }
  function playerList(game) {
    const list = others();
    if (!list.length) return h('p', { class: 'mp-empty' }, 'Nobody else is online right now. Send a friend this website’s link!');
    const busy = inMatchNow();
    return h('ul', { class: 'mp-players' }, list.map((u) =>
      h('li', { class: 'mp-player' },
        avatarNode(u.avatar, 38),
        h('div', { class: 'mp-pname' }, u.username, h('small', { class: u.status }, u.status === 'ingame' ? 'In a match' : 'Online')),
        h('button', { class: 'mp-btn small', disabled: u.status === 'ingame' || busy, onclick: () => openChallenge(u, game) }, '⚔️ Challenge'))));
  }

  // ---------- full screen ----------
  // Popups must live inside the full-screen element, or the browser would not show them.
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const fsHost = () => fsEl() || document.querySelector('.fs-pseudo') || document.body;
  function initFullscreen(gameArea) {
    const top = document.querySelector('.game-top');
    if (!top || !gameArea) return;
    const plain = document.body.dataset.fs === 'plain'; // text-heavy pages scroll instead of scaling
    let on = false, pseudo = false, stage = null, ro = null;
    const exitBtn = h('button', { class: 'fs-exit', title: 'Exit full screen (Esc)', onclick: () => leave() }, '✕ Exit full screen');
    const btn = h('button', { class: 'btn secondary fs-btn', title: 'Play full screen', onclick: () => (on ? leave() : enter()) }, '⛶ Full screen');
    top.insertBefore(btn, top.querySelector('#mpSlot'));
    function fit() {
      if (!on || !stage) return;
      const vw = gameArea.clientWidth, vh = gameArea.clientHeight, w = stage.offsetWidth, hh = stage.offsetHeight;
      const z = Math.min((vw - 16) / w, (vh - 16) / hh, 4);
      if (plain || z < 0.7) { gameArea.classList.add('fs-scroll'); stage.style.transform = ''; return; }
      gameArea.classList.remove('fs-scroll');
      stage.style.transform = `translate(-50%, -50%) scale(${z.toFixed(4)})`;
    }
    function activate() {
      on = true; document.body.classList.add('fs-on');
      gameArea.classList.add('fs-active', pseudo ? 'fs-pseudo' : 'fs-real');
      stage = h('div', { class: 'fs-stage' });
      while (gameArea.firstChild) stage.append(gameArea.firstChild);
      gameArea.append(stage, exitBtn);
      if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(stage); }
      window.addEventListener('resize', fit);
      if (toastBox) fsHost().append(toastBox);
      btn.textContent = '⛶ Exit full screen';
      fit();
    }
    function deactivate() {
      if (!on) return;
      on = false; document.body.classList.remove('fs-on');
      if (ro) ro.disconnect();
      window.removeEventListener('resize', fit);
      const kids = [...stage.childNodes];
      stage.remove(); exitBtn.remove();
      kids.forEach((k) => gameArea.append(k));
      gameArea.classList.remove('fs-active', 'fs-pseudo', 'fs-real', 'fs-scroll');
      stage = null; btn.textContent = '⛶ Full screen';
      if (toastBox) document.body.append(toastBox);
      window.dispatchEvent(new Event('resize'));
    }
    async function enter() {
      if (on) return;
      if (gameArea.hidden) { showToast({ title: 'Start a game first, then go full screen.', ttl: 3000 }); return; }
      const req = gameArea.requestFullscreen || gameArea.webkitRequestFullscreen;
      pseudo = !req || /iPhone|iPod/.test(navigator.userAgent);
      if (!pseudo) { try { await req.call(gameArea, { navigationUI: 'hide' }); } catch { pseudo = true; } }
      activate();
    }
    function leave() {
      if (!on) return;
      if (!pseudo && fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; } // the change event cleans up
      deactivate();
    }
    const onChange = () => { if (on && !pseudo && !fsEl()) deactivate(); };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && on && pseudo) leave(); });
    S.fullscreen = { enter, leave, get on() { return on; } };
  }

  // ---------- modal / toast ----------
  function openModal(content, { dismiss = true, onClose } = {}) {
    const back = h('div', { class: 'mp-backdrop' }, h('div', { class: 'mp-modal', role: 'dialog', 'aria-modal': 'true' }, content));
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (onClose) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape' && dismiss) close(); };
    back.addEventListener('mousedown', (e) => { if (e.target === back && dismiss) close(); });
    document.addEventListener('keydown', onKey);
    fsHost().append(back);
    return { close, el: back };
  }
  let toastBox;
  function showToast({ title, avatar, actions = [], ttl = 0, key }) {
    if (!toastBox) { toastBox = h('div', { class: 'mp-toasts' }); fsHost().append(toastBox); }
    const el = h('div', { class: 'mp-toast' },
      h('div', { class: 'top' }, avatar ? avatarNode(avatar, 38) : null, h('div', null, title)));
    if (actions.length) el.append(h('div', { class: 'row' }, actions.map((a) =>
      h('button', { class: 'mp-btn small ' + (a.kind || ''), onclick: () => a.fn(t) }, a.label))));
    if (ttl) {
      const bar = h('div', { class: 'bar' }); bar.style.animationDuration = ttl + 'ms'; el.append(bar);
    }
    toastBox.append(el);
    const t = { el, remove() { clearTimeout(timer); el.remove(); } };
    const timer = ttl ? setTimeout(() => t.remove(), ttl) : null;
    return t;
  }

  // ---------- auth ----------
  let authModal = null;
  function openAuth(initial = 'login') {
    return new Promise((resolve, reject) => {
      if (S.offline) return reject(new Error('offline'));
      if (authModal) return;
      let mode = initial, avatar = null, uploaded = null, busy = false;
      const body = h('div');
      const render = () => {
        body.replaceChildren();
        const err = h('div', { class: 'mp-error', role: 'alert' });
        const user = h('input', { type: 'text', maxlength: '16', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' });
        const pin = h('input', { type: 'password', class: 'mp-pin', inputmode: 'numeric', maxlength: '4', autocomplete: mode === 'login' ? 'current-password' : 'new-password', placeholder: '••••' });
        const pin2 = h('input', { type: 'password', class: 'mp-pin', inputmode: 'numeric', maxlength: '4', autocomplete: 'new-password', placeholder: '••••' });
        [pin, pin2].forEach((p) => p.addEventListener('input', () => { p.value = p.value.replace(/\D/g, '').slice(0, 4); }));

        const tabs = h('div', { class: 'mp-tabs' },
          h('button', { class: 'mp-btn small' + (mode === 'login' ? '' : ' ghost'), onclick: () => { mode = 'login'; render(); } }, 'Log in'),
          h('button', { class: 'mp-btn small' + (mode === 'signup' ? '' : ' ghost'), onclick: () => { mode = 'signup'; render(); } }, 'Sign up'));
        const form = h('form', { novalidate: true },
          h('label', { class: 'mp-field' }, 'Username', user),
          h('label', { class: 'mp-field' }, '4-digit PIN', pin));
        if (mode === 'signup') {
          form.append(h('label', { class: 'mp-field' }, 'Confirm PIN', pin2), avatarPicker());
        }
        const submit = h('button', { class: 'mp-btn', type: 'submit' }, mode === 'login' ? 'Log in' : 'Create account');
        form.append(err, h('div', { class: 'row' }, submit));
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (busy) return;
          err.textContent = '';
          const username = user.value.trim();
          if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return (err.textContent = 'Username: 3-16 letters, numbers or _');
          if (!/^\d{4}$/.test(pin.value)) return (err.textContent = 'PIN must be exactly 4 digits');
          let payload = { username, pin: pin.value };
          if (mode === 'signup') {
            if (pin.value !== pin2.value) return (err.textContent = 'PINs do not match');
            if (!avatar) return (err.textContent = 'Pick a profile picture');
            payload.avatar = avatar.type === 'image' ? { type: 'image', data: avatar.data } : avatar;
          }
          busy = true; submit.disabled = true;
          try {
            const r = await api(mode === 'login' ? '/api/login' : '/api/signup', { method: 'POST', body: payload });
            S.token = r.token; store.set('tungToken', r.token); S.loggingOut = false;
            connect();
            modal.close();
            resolve(r.user);
            emit('login');
          } catch (ex) {
            err.textContent = ex.message; busy = false; submit.disabled = false;
          }
        });
        body.append(h('h2', null, '🥁 Tung Tung Arcade'), tabs, form);
        setTimeout(() => user.focus(), 0);
      };

      function avatarPicker() {
        const grid = h('div', { class: 'mp-emoji-grid' });
        const preview = h('span');
        const refresh = () => {
          [...grid.children].forEach((b) => b.classList.toggle('sel', avatar && avatar.type === 'emoji' && avatar.value === b.textContent));
          preview.replaceChildren(avatar ? avatarNode(avatar.type === 'image' ? avatar.data : 'emoji:' + avatar.value, 48) : h('span', { class: 'mp-hint' }, 'None yet'));
        };
        for (const em of S.cfg.avatars) grid.append(h('button', { type: 'button', onclick: () => { avatar = { type: 'emoji', value: em }; refresh(); } }, em));
        const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
        file.addEventListener('change', async () => {
          const f = file.files[0];
          if (!f) return;
          try { uploaded = await resizeImage(f); avatar = { type: 'image', data: uploaded }; refresh(); }
          catch { showToast({ title: 'Could not read that image', ttl: 3000 }); }
        });
        const wrap = h('div', { class: 'mp-field' }, 'Profile picture', grid,
          h('div', { class: 'mp-pic-row' }, preview,
            h('button', { type: 'button', class: 'mp-btn small ghost', onclick: () => file.click() }, '📷 Upload photo'), file));
        refresh();
        return wrap;
      }

      const modal = openModal(body, { dismiss: true, onClose: () => { authModal = null; reject(new Error('cancelled')); } });
      authModal = modal;
      render();
    }).catch(() => null);
  }

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) return reject(new Error('bad'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const N = 128, c = document.createElement('canvas');
        c.width = c.height = N;
        const side = Math.min(img.width, img.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#7a4a1f'; ctx.fillRect(0, 0, N, N);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, N, N);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad')); };
      img.src = url;
    });
  }

  // ---------- challenges ----------
  async function openChallenge(target, preGame) {
    if (!S.user) { const u = await openAuth(); if (!u) return; }
    const games = Object.keys(S.cfg.games).filter((g) => (!S.cfg.games[g].rooms || S.cfg.games[g].challenge) && !S.cfg.games[g].soloOnly);
    const hint = preGame || (S.shell && S.shell.game);
    let game = hint && games.includes(hint) ? hint : games[0];
    const chosen = {}; // option values per game
    const optsOf = (g) => (chosen[g] = chosen[g] || Object.fromEntries(Object.entries(S.cfg.games[g].options || {}).map(([k, o]) => [k, o.default])));
    const body = h('div');
    const render = () => {
      const spec = S.cfg.games[game].options || {};
      body.replaceChildren(
        h('h2', null, '⚔️ Challenge ' + target.username),
        h('div', { class: 'mp-field' }, 'Game',
          h('div', { class: 'mp-choice' }, games.map((g) =>
            h('button', { class: g === game ? 'sel' : '', onclick: () => { game = g; render(); } }, gameIcon(g) + ' ' + gameTitle(g))))),
        Object.entries(spec).map(([k, o]) =>
          h('div', { class: 'mp-field' }, o.label || k,
            h('div', { class: 'mp-choice' }, o.values.map((v) =>
              h('button', { class: v === optsOf(game)[k] ? 'sel' : '', onclick: () => { optsOf(game)[k] = v; render(); } }, fmtOpt(k, v)))))),
        h('p', { class: 'mp-hint', style: 'text-align:center' }, 'Wins and losses count on the leaderboard.'),
        h('div', { class: 'row' },
          h('button', { class: 'mp-btn ghost', onclick: () => m.close() }, 'Cancel'),
          h('button', { class: 'mp-btn', onclick: () => {
            send({ t: 'challenge', to: target.id, game, options: optsOf(game) });
            m.close(); closeDrawer();
          } }, 'Send challenge')));
    };
    const m = openModal(body);
    render();
  }

  function incomingChallenge(c) {
    tung(240, 0.3); setTimeout(() => tung(180, 0.3), 160);
    const t = showToast({
      avatar: c.from.avatar, ttl: c.ttl,
      title: `${c.from.username} challenged you to ${gameTitle(c.game)}${optText(c.options)}!`,
      actions: [
        { label: 'Decline', kind: 'ghost', fn: () => { send({ t: 'challenge_response', id: c.id, accept: false }); t.remove(); S.incoming.delete(c.id); } },
        { label: '⚔️ Accept', fn: () => { send({ t: 'challenge_response', id: c.id, accept: true }); t.remove(); S.incoming.delete(c.id); } },
      ],
    });
    S.incoming.set(c.id, t);
  }
  function outgoingChallenge(c) {
    if (S.outgoing) S.outgoing.toast.remove();
    const toast = showToast({
      avatar: c.to.avatar, ttl: c.ttl,
      title: `Waiting for ${c.to.username} to accept ${gameTitle(c.game)}${optText(c.options)}…`,
      actions: [{ label: 'Cancel', kind: 'ghost', fn: () => send({ t: 'challenge_cancel', id: c.id }) }],
    });
    S.outgoing = { id: c.id, toast, to: c.to };
  }
  function challengeUpdate(u) {
    const inc = S.incoming.get(u.id);
    if (inc) { inc.remove(); S.incoming.delete(u.id); }
    if (S.outgoing && S.outgoing.id === u.id) {
      S.outgoing.toast.remove();
      const name = S.outgoing.to.username;
      const text = { declined: `${name} declined.`, expired: `${name} didn’t answer.`, busy: `${name} is busy.`, cancelled: 'Challenge cancelled.' }[u.status];
      S.outgoing = null;
      if (text) showToast({ title: text, ttl: 3500 });
    }
  }

  // ---------- leaderboard ----------
  function soloTabs(g, label) {
    const lv = S.cfg.games[g] && S.cfg.games[g].options && S.cfg.games[g].options.level;
    return lv ? lv.values.map((l) => ({ id: `solo:${g}:${l}`, label: `${label} ${l[0].toUpperCase() + l.slice(1)}` }))
      : [{ id: 'solo:' + g, label }];
  }
  async function submitSolo(payload) {
    if (!S.user) { showToast({ title: 'Log in to save your score to the solo leaderboard.', ttl: 4000 }); return; }
    try { await api('/api/solo', { method: 'POST', body: payload }); if (S.shell && S.shell.lb) S.shell.lb.refresh(); }
    catch (e) { showToast({ title: 'Could not save score: ' + e.message, ttl: 4000 }); }
  }
  function mountLeaderboard(container, { game, tabs }) {
    let current = game;
    const wrap = h('div', { class: 'mp-lb' });
    container.replaceChildren(wrap);
    const render = async () => {
      let data;
      const solo = current.startsWith('solo:') ? current.split(':') : null; // solo:game[:level]
      try {
        data = solo
          ? await api(`/api/solo-leaderboard?game=${solo[1]}&level=${solo[2] || 'easy'}`)
          : await api('/api/leaderboard?game=' + encodeURIComponent(current));
      } catch { wrap.replaceChildren(h('p', { class: 'mp-empty' }, 'Leaderboard unavailable (is the server running?)')); return; }
      const title = solo
        ? `🎯 ${gameTitle(solo[1])} Solo${solo[2] ? ' - ' + solo[2][0].toUpperCase() + solo[2].slice(1) : ''}`
        : current === 'all' ? '🏆 Overall Leaderboard' : `🏆 ${gameTitle(current)} Leaderboard`;
      const tabBar = tabs.length > 1 ? h('div', { class: 'mp-tabs' }, tabs.map((t) =>
        h('button', { class: 'mp-btn small' + (t.id === current ? '' : ' ghost'), onclick: () => { current = t.id; render(); } }, t.label))) : null;
      if (solo) {
        const isTime = solo[1] === 'minesweeper' || solo[1] === 'f1' || solo[1] === 'tungup' || solo[1] === 'golf';
        const isWL = !!(S.cfg.games[solo[1]] && S.cfg.games[solo[1]].soloWL);
        const isCount = solo[1] === 'clicker';
        const cols = isWL ? ['#', 'Player', 'Wins', 'Losses'] : ['#', 'Player', solo[1] === 'golf' ? 'Fewest strokes' : isTime ? 'Best time' : isCount ? 'Total tungs' : solo[1] === 'slope' ? 'Best distance' : solo[1] === 'flappy' ? 'Most pipes' : solo[1] === 'paper' ? 'Biggest land' : 'Best score'];
        const table = h('table', null,
          h('thead', null, h('tr', null, cols.map((x) => h('th', null, x)))),
          h('tbody', null, data.rows.length ? data.rows.map((r, i) =>
            h('tr', { class: S.user && S.user.id === r.id ? 'me' : '' },
              h('td', null, i + 1),
              h('td', { class: 'who' }, h('div', null, avatarNode(r.avatar, 30), r.username)),
              h('td', { class: 'win' }, solo[1] === 'golf' ? r.value + ' strokes' : solo[1] === 'f1' || solo[1] === 'tungup' ? fmtTime(r.value) : isTime ? r.value + 's' : isCount ? r.value.toLocaleString() : solo[1] === 'slope' ? r.value + ' m' : solo[1] === 'paper' ? (r.value / 10).toFixed(1) + '%' : r.value),
              isWL ? h('td', { class: 'loss' }, r.losses) : null))
            : h('tr', null, h('td', { colspan: String(cols.length), class: 'mp-empty' }, 'No solo scores yet. Log in and play single player to get on the board!'))));
        wrap.replaceChildren(...[h('h2', null, title), tabBar, h('p', { class: 'mp-hint', style: 'text-align:center;margin-bottom:.5rem' }, (isWL ? 'Your results against the computer. ' : isCount ? 'Everything you have ever clicked and earned. ' : 'Single player scores. ') + 'These never affect win/loss records.'), table].filter(Boolean));
        return;
      }
      const table = h('table', null,
        h('thead', null, h('tr', null, ['#', 'Player', 'Wins', 'Losses', 'Draws'].map((x) => h('th', null, x)))),
        h('tbody', null, data.rows.length ? data.rows.map((r, i) =>
          h('tr', { class: S.user && S.user.id === r.id ? 'me' : '' },
            h('td', null, i + 1),
            h('td', { class: 'who' }, h('div', null, avatarNode(r.avatar, 30), r.username)),
            h('td', { class: 'win' }, r.wins), h('td', { class: 'loss' }, r.losses), h('td', null, r.draws)))
          : h('tr', null, h('td', { colspan: '5', class: 'mp-empty' }, 'No players yet. Sign up and be the first!'))));
      wrap.replaceChildren(...[h('h2', null, title), tabBar, table].filter(Boolean));
    };
    render();
    return { refresh: render };
  }

  // ---------- game page shell ----------
  function initShell() {
    const gameId = document.body.dataset.game;
    if (!gameId) return;
    const sh = (S.shell = {
      game: gameId, mode: 'single', match: null, running: false, ended: false,
      pendingId: new URLSearchParams(location.search).get('match'), api: null,
      me: { progress: 0, status: 'playing' }, opp: { progress: 0, status: 'playing' }, lb: null, cd: null,
    });
    const gameArea = $('#gameArea'), lobby = $('#mpLobby'), bar = $('#mpMatchBar'), modeBtns = document.querySelectorAll('#modeSwitch [data-mode]');
    const overlay = h('div', { class: 'mp-overlay', hidden: true });
    gameArea.append(overlay);
    initFullscreen(gameArea);

    const lbBox = $('#gameLeaderboard');
    if (lbBox) sh.lb = mountLeaderboard(lbBox, { game: gameId, tabs: [{ id: gameId, label: '👥 Multiplayer' }, { id: 'all', label: 'Overall' }, ...soloTabs(gameId, '🎯 Solo')] });

    function setMode(mode) {
      sh.mode = mode;
      modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
      if (document.body.dataset.custom) { // the game page runs its own lobby (e.g. The Imposter)
        gameArea.hidden = false; lobby.hidden = true; bar.hidden = !sh.match;
        if (!bar.hidden) renderBar();
        emit('mode', mode);
        return;
      }
      const inMatch = !!sh.match;
      gameArea.hidden = mode === 'multi' && !inMatch;
      lobby.hidden = !(mode === 'multi' && !inMatch);
      bar.hidden = !inMatch;
      if (!lobby.hidden) renderLobby();
    }
    modeBtns.forEach((b) => b.addEventListener('click', () => {
      if (sh.match && !sh.ended) return;
      if (b.dataset.mode === sh.mode) return;
      if (sh.match) leaveMatch(b.dataset.mode); else setMode(b.dataset.mode);
    }));

    function renderLobby() {
      lobby.replaceChildren();
      const title = h('h2', null, `${gameIcon(gameId)} Play ${gameTitle(gameId)} online`);
      if (S.offline) return lobby.append(title, h('p', null, 'Multiplayer needs the game server. Start it with “npm start” and open the site from there.'));
      if (sh.pendingId) {
        if (!S.user) return lobby.append(title, h('p', null, 'Log in to join your match.'), h('button', { class: 'mp-btn', onclick: () => openAuth() }, '🔑 Log in'));
        return lobby.append(title, h('p', null, 'Joining match…'));
      }
      if (!S.user) return lobby.append(title, h('p', null, 'Log in to challenge other players. Wins and losses count on the leaderboard!'), h('button', { class: 'mp-btn', onclick: () => openAuth() }, '🔑 Log in / Sign up'));
      lobby.append(title, h('p', null, 'Pick someone who’s online and challenge them. Single player games never count toward records.'), playerList(gameId));
    }
    on('presence', () => { if (!lobby.hidden) renderLobby(); });
    on('login', () => { if (!lobby.hidden) renderLobby(); });
    on('logout', () => { if (!lobby.hidden) renderLobby(); });

    function sideNode(user, st, mine) {
      const total = sh.match && sh.match.total;
      const label = S.cfg.games[gameId].progressLabel;
      const val = gameId === 'tungup' ? st.progress + '%' : total ? `${st.progress}/${total}` : gameId === 'paper' ? (st.progress / 10).toFixed(1) + '%' : st.progress;
      const statusTxt = st.status === 'cleared' ? ' ✅' : st.status === 'out' ? ' ☠️' : '';
      return h('div', { class: 'mp-side' }, avatarNode(user.avatar, 40),
        h('div', null, h('b', null, mine ? 'You' : user.username), h('small', null, `${label}: ${val}${statusTxt}`)));
    }
    function renderBar() {
      if (!sh.match) return;
      bar.replaceChildren(
        sideNode(sh.match.you, sh.me, true),
        h('div', { class: 'mp-vs' }, 'VS', h('small', null, optText(sh.match.options).replace(/[()]/g, '').trim() || '1v1')),
        sideNode(sh.match.opp, sh.opp, false));
    }

    function showOverlay(text, small) { overlay.hidden = false; overlay.classList.toggle('small', !!small); overlay.textContent = text; }

    function leaveMatch(nextMode = 'multi') {
      sh.match = null; sh.running = false; sh.ended = false; sh.pendingId = null;
      clearInterval(sh.cd); overlay.hidden = true;
      document.body.classList.remove('mp-active');
      try { history.replaceState(null, '', location.pathname); } catch {}
      if (sh.api && sh.api.exitMatch) sh.api.exitMatch();
      setMode(nextMode);
    }

    // server messages
    on('ready', () => {
      if (sh.match && !sh.ended) send({ t: 'resume_match', matchId: sh.match.id });
      else if (sh.pendingId) send({ t: 'join_match', matchId: sh.pendingId });
      if (!lobby.hidden) renderLobby();
    });
    on('msg:match_gone', () => {
      if (sh.match) return;
      sh.pendingId = null;
      try { history.replaceState(null, '', location.pathname); } catch {}
      setMode('multi');
      showToast({ title: 'That match is no longer active.', ttl: 4000 });
    });
    on('msg:match_joined', (m) => {
      if (sh.match && sh.match.id === m.match.id) { sh.opp = m.match.oppState; renderBar(); return; }
      sh.match = m.match; sh.pendingId = null; sh.ended = false;
      sh.me = { progress: 0, status: 'playing' }; sh.opp = m.match.oppState;
      document.body.classList.add('mp-active');
      setMode('multi');
      renderBar();
      if (sh.api) sh.api.prepareMatch(m.match);
      if (m.waiting) showOverlay(`Waiting for ${m.match.opp.username}…`, true);
    });
    on('msg:match_countdown', (m) => {
      clearInterval(sh.cd);
      const end = Date.now() + m.ms;
      let last = null;
      const tick = () => {
        const left = end - Date.now();
        if (left <= 0) {
          clearInterval(sh.cd);
          showOverlay('TUNG!'); tung(260, 0.25);
          setTimeout(() => { overlay.hidden = true; }, 500);
          sh.running = true;
          if (sh.api) sh.api.startMatch(sh.match);
          return;
        }
        const n = Math.ceil(left / 1000);
        if (n !== last) { last = n; showOverlay(String(n)); tung(160, 0.15); }
      };
      sh.cd = setInterval(tick, 50);
      tick();
    });
    on('msg:opp', (m) => { sh.opp = { progress: m.progress, status: m.status }; renderBar(); });
    on('msg:tb_state', (m) => { if (!m.prog || !sh.match) return; sh.me = { progress: m.prog[m.idx], status: 'playing' }; sh.opp = { progress: m.prog[1 - m.idx], status: 'playing' }; renderBar(); });
    on('msg:match_end', (m) => {
      if (!sh.match || sh.match.id !== m.matchId) return;
      sh.running = false; sh.ended = true;
      clearInterval(sh.cd); overlay.hidden = true;
      if (sh.api) sh.api.stopMatch();
      const mine = m.players.find((p) => p.id === m.you), opp = m.players.find((p) => p.id !== m.you);
      sh.me = { progress: mine.progress, status: mine.status }; sh.opp = { progress: opp.progress, status: opp.status };
      renderBar();
      showResult(m, mine, opp);
      if (sh.lb) sh.lb.refresh();
    });

    function showResult(m, mine, opp) {
      const R = {
        win: ['🏆', 'You won!'], loss: ['💀', 'You lost'], draw: ['🤝', 'It’s a draw'], cancelled: ['🚫', 'Match cancelled'],
      }[m.result];
      const reasons = {
        score: m.game === 'go' ? `Counted by area scoring with 7.5 komi. Captures: you ${mine.progress}, ${opp.username} ${opp.progress}.` : m.game === 'paper' ? `Biggest land: you ${(mine.progress / 10).toFixed(1)}%, ${opp.username} ${(opp.progress / 10).toFixed(1)}%.` : `Final score ${mine.progress} to ${opp.progress}.`,
        cleared: m.game === 'tungup' ? (m.result === 'win' ? 'You reached the top first! 🏔️' : `${opp.username} reached the top first.`) : m.game === 'f1' ? (m.result === 'win' ? 'You took the chequered flag first! 🏁' : `${opp.username} took the chequered flag first.`) : m.result === 'win' ? 'You cleared the board first!' : `${opp.username} cleared the board first.`,
        revealed: m.game === 'tungup' ? `Nobody reached the top: ${mine.progress}% to ${opp.progress}%.` : m.game === 'f1' ? `Nobody finished: checkpoints ${mine.progress} to ${opp.progress}.` : `Cleared ${mine.progress} tiles vs ${opp.progress}.`,
        survived: 'Tied on tiles - decided by who lasted longer.',
        forfeit: 'Someone left the match.', left: m.result === 'cancelled' ? 'A player left before it started.' : (m.result === 'win' ? `${opp.username} left the match.` : 'You left the match.'),
        disconnect: m.result === 'win' ? `${opp.username} disconnected.` : 'You were disconnected.',
        noshow: 'Your opponent never showed up. No record was counted.',
        timeout: 'Time limit reached.',
        pot8: m.result === 'win' ? 'You potted the 8 ball to win!' : `${opp.username} potted the 8 ball.`,
        bad8: m.result === 'win' ? `${opp.username} sank the 8 ball too early or fouled on it.` : 'The 8 ball went down too early, or on a foul.',
        turntime: m.result === 'win' ? `${opp.username} ran out of time.` : 'You ran out of time.',
        strokes: m.result === 'draw' ? `Tied on ${mine.progress} strokes.` : m.result === 'win' ? `You finished with fewer strokes (${mine.progress} to ${opp.progress}).` : `${opp.username} needed fewer strokes (${opp.progress} to ${mine.progress}).`,
        resign: m.result === 'win' ? `${opp.username} resigned.` : 'You resigned.',
        checkmate: m.result === 'win' ? 'Checkmate! 🎉' : 'You were checkmated.',
        stalemate: 'Stalemate - the player to move had no legal move but was not in check.',
        repetition: 'Draw by threefold repetition.', fifty: 'Draw by the fifty-move rule.', material: 'Draw - neither side can checkmate.',
        tictactoe: m.result === 'win' ? 'You got three small boards in a row!' : `${opp.username} got three small boards in a row.`,
        fleet: m.result === 'win' ? 'You sank the whole enemy fleet! ⚓' : 'Your whole fleet was sunk.',
        boxes: `Boxes: you ${mine.progress}, ${opp.username} ${opp.progress}.`,
        solved: m.result === 'win' ? 'You solved your word and they did not.' : `${opp.username} solved theirs and you did not.`,
        fewer: m.result === 'win' ? 'You solved yours with fewer wrong guesses.' : `${opp.username} needed fewer wrong guesses.`,
        tie: 'Both solved it with the same number of wrong guesses.', nobody: 'Neither of you solved the other’s word.',
        nomoves: m.options && m.options.mode === 'misere'
          ? (m.result === 'win' ? 'You have no legal move left, and in Misère that wins!' : `${opp.username} has no legal move left, which wins in Misère.`)
          : (m.result === 'win' ? `${opp.username} has no legal move left. You win!` : 'You have no legal move left.'),
      };
      const rowFor = (p) => h('div', { class: 'mp-player' + (m.result !== 'draw' && m.result !== 'cancelled' && ((m.result === 'win') === (p.id === m.you)) ? ' winner' : '') },
        avatarNode(p.avatar, 38), h('div', { class: 'mp-pname' }, p.id === m.you ? p.username + ' (you)' : p.username,
          h('small', { class: '' }, `${S.cfg.games[m.game].progressLabel}: ${m.game === 'tungup' ? p.progress + '%' : m.total ? p.progress + '/' + m.total : m.game === 'paper' ? (p.progress / 10).toFixed(1) + '%' : p.progress}`)));
      const body = h('div', null,
        h('div', { class: 'mp-result-emoji' }, R[0]), h('h2', null, R[1]),
        h('p', { class: 'mp-result-sub' }, reasons[m.reason] || ''),
        m.result === 'cancelled' ? null : h('div', { class: 'mp-result-players' }, rowFor(mine), rowFor(opp)),
        m.result === 'cancelled' ? null : h('p', { class: 'mp-result-sub', style: 'margin-top:.8rem' },
          `Your ${gameTitle(m.game)} record: ${m.stats.game.w}W - ${m.stats.game.l}L - ${m.stats.game.d}D`),
        h('div', { class: 'row' },
          m.result === 'cancelled' ? null : h('button', { class: 'mp-btn', onclick: () => {
            send({ t: 'challenge', to: opp.id, game: m.game, options: m.options }); modal.close();
          } }, '🔁 Rematch'),
          h('button', { class: 'mp-btn ghost', onclick: () => { modal.close(); leaveMatch('multi'); } }, 'Back to lobby'),
          h('button', { class: 'mp-btn ghost', onclick: () => { modal.close(); leaveMatch('single'); } }, 'Single player')));
      const modal = openModal(body, { dismiss: false });
      tung(m.result === 'win' ? 330 : 140, 0.5);
    }

    // leaving mid-match = forfeit
    window.addEventListener('beforeunload', (e) => { if (sh.running) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a.back');
      if (!a || !sh.running) return;
      e.preventDefault();
      if (confirm('Leave the match? You will forfeit and it counts as a loss.')) {
        send({ t: 'leave_match', matchId: sh.match.id });
        sh.running = false;
        setTimeout(() => { location.href = a.href; }, 150);
      }
    });

    // initial mode
    if (sh.pendingId) { setMode('multi'); }
    else setMode('single');
    S.shellApi = {
      progress(v) {
        if (!sh.match || !sh.running) return;
        sh.me.progress = v; send({ t: 'progress', matchId: sh.match.id, value: v }); renderBar();
      },
      finish(p) {
        if (!sh.match || !sh.running) return;
        sh.me.status = p && p.cleared ? 'cleared' : 'out';
        send(Object.assign({ t: 'finish', matchId: sh.match.id }, p || {})); renderBar();
      },
    };
  }

  // ---------- public API for games ----------
  window.TungMP = {
    rng,
    submitSolo,
    mountLeaderboard, soloTabs, api, playerList, openModal, showToast,
    get fullscreen() { return S.fullscreen; },
    setupFullscreen: initFullscreen,
    refreshBoard() { if (S.shell && S.shell.lb) S.shell.lb.refresh(); },
    get cfg() { return S.cfg; },
    on, send, avatarNode, openAuth,
    get user() { return S.user; },
    get online() { return S.online; },
    get offline() { return S.offline; },
    get mode() { return S.shell ? S.shell.mode : 'single'; },
    sendMatch(m) { if (S.shell && S.shell.match) send(Object.assign({ matchId: S.shell.match.id }, m)); },
    rt(d) { if (S.shell && S.shell.match && S.shell.running) send({ t: 'rt', matchId: S.shell.match.id, d }); },
    get match() { return S.shell ? S.shell.match : null; },
    fmtTime,
    registerGame(api) { if (S.shell) S.shell.api = api; else S.pendingGame = api; },
    progress(v) { if (S.shellApi) S.shellApi.progress(v); },
    finish(p) { if (S.shellApi) S.shellApi.finish(p); },
    isMatch() { return !!(S.shell && S.shell.match && !S.shell.ended); },
  };

  // ---------- boot ----------
  async function boot() {
    Music.start();
    try { S.cfg = await api('/api/config'); }
    catch { S.offline = true; }
    // Game pages still need the shell elements even when offline.
    if (S.cfg) {
      if (S.token) connect();
      else if (!S.offline && !document.body.dataset.game && !document.body.dataset.noprompt && !store.get('tungPrompted')) {
        store.set('tungPrompted', '1');
        openAuth('login');
      }
    }
    renderSlot();
    if (document.body.dataset.game) {
      if (!S.cfg) S.cfg = { games: { [document.body.dataset.game]: { title: document.body.dataset.game, icon: '🎮', progressLabel: 'Score' } }, avatars: [] };
      initShell();
      if (S.pendingGame) { S.shell.api = S.pendingGame; }
    }
    const lbPanel = $('#leaderboardPanel');
    if (lbPanel && S.cfg && !S.offline) {
      // The home page only shows the overall win/loss board; per-game and solo boards live on each game page.
      const tabs = [{ id: 'all', label: 'Overall' }];
      const lb = mountLeaderboard(lbPanel, { game: 'all', tabs });
      window.addEventListener('hashchange', () => { if (location.hash === '#leaderboards') lb.refresh(); });
      on('login', lb.refresh); on('logout', lb.refresh);
    }
  }
  window.TungMP.booted = new Promise((res) => {
    const go = () => boot().then(res, res);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  });
})();
