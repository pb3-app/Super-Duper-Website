(() => {
  const T = window.TungMP, $ = (id) => document.getElementById(id);
  const esc = NetPlay.esc, av = NetPlay.avatarHtml;
  const PAL = ["#151515", "#7b7b7b", "#ffffff", "#e63946", "#ff8a3d", "#ffd23f", "#7ddc6a", "#1f9d55", "#4cc9f0", "#2563eb", "#8b5cf6", "#f472b6", "#8b5a2b", "#f5cba7"];
  const SIZES = [4, 9, 16, 30];
  const cv = $("paper"), ctx = cv.getContext("2d", { willReadFrequently: true });
  const W = cv.width, H = cv.height;

  // ---------------- the shared drawing board ----------------
  const board = {
    cmds: [],
    reset() { this.cmds = []; this.paint(); },
    paint() { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); for (const c of this.cmds) this.draw(c); },
    segs(col, size, pts) {
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = size; ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (pts.length < 4) { ctx.beginPath(); ctx.arc(pts[0], pts[1], size / 2, 0, 7); ctx.fill(); return; }
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.stroke();
    },
    draw(c) {
      if (c[0] === "s") this.segs(c[1], c[2], c[3]);
      else if (c[0] === "f") this.fill(c[1], c[2], c[3]);
    },
    fill(x, y, hex) {
      x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return;
      const img = ctx.getImageData(0, 0, W, H), d = img.data, n = parseInt(hex.slice(1), 16);
      const R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255, i0 = (y * W + x) * 4, tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2];
      if (Math.abs(tr - R) + Math.abs(tg - G) + Math.abs(tb - B) < 6) return;
      const ok = (i) => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) <= 70;
      const seen = new Uint8Array(W * H), stack = [x, y];
      while (stack.length) {
        let py = stack.pop(), px = stack.pop();
        while (px >= 0 && !seen[py * W + px] && ok((py * W + px) * 4)) px--;
        px++; let up = false, down = false;
        while (px < W && !seen[py * W + px] && ok((py * W + px) * 4)) {
          const p = py * W + px; seen[p] = 1; d[p * 4] = R; d[p * 4 + 1] = G; d[p * 4 + 2] = B; d[p * 4 + 3] = 255;
          if (py > 0) { const o = p - W, a = !seen[o] && ok(o * 4); if (a && !up) { stack.push(px, py - 1); up = true; } else if (!a) up = false; }
          if (py < H - 1) { const o = p + W, a = !seen[o] && ok(o * 4); if (a && !down) { stack.push(px, py + 1); down = true; } else if (!a) down = false; }
          px++;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    // a command that arrives (or that I make myself)
    add(c) {
      if (c[0] === "c") { this.cmds = []; this.paint(); }
      else if (c[0] === "u") { for (let i = this.cmds.length - 1; i >= 0; i--) if (this.cmds[i][0] === "s" || this.cmds[i][0] === "f") { this.cmds.splice(i, 1); break; } this.paint(); }
      else if (this.cmds.length < 5000) { this.cmds.push(c); this.draw(c); }
    },
  };
  board.reset();

  // ---------------- tools ----------------
  let color = PAL[0], size = SIZES[1], tool = "pen", canDraw = true, groups = [];
  const swEl = $("sw"), sizesEl = $("sizes");
  PAL.forEach((c) => { const b = document.createElement("button"); b.style.background = c; b.dataset.c = c; b.title = c; b.onclick = () => { color = c; if (tool === "eraser") setTool("pen"); paintTools(); }; swEl.append(b); });
  SIZES.forEach((s) => { const b = document.createElement("button"); b.className = "tbtn"; b.dataset.s = s; b.title = "Brush size " + s; b.innerHTML = `<i class="dot" style="width:${Math.max(6, s * 0.6)}px;height:${Math.max(6, s * 0.6)}px"></i>`; b.onclick = () => { size = s; paintTools(); }; sizesEl.append(b); });
  function setTool(t) { tool = t; paintTools(); }
  function paintTools() {
    swEl.querySelectorAll("button").forEach((b) => b.classList.toggle("sel", b.dataset.c === color && tool !== "eraser"));
    sizesEl.querySelectorAll("button").forEach((b) => b.classList.toggle("sel", Number(b.dataset.s) === size));
    document.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("sel", b.dataset.tool === tool));
    cv.style.cursor = tool === "fill" ? "cell" : "crosshair";
  }
  document.querySelectorAll("[data-tool]").forEach((b) => b.onclick = () => setTool(b.dataset.tool));
  paintTools();
  const online = () => mode === "multi" && room && room.state === "game";
  const send = (cmds) => { if (online()) T.send({ t: "pic_draw", cmds }); };

  // ---------------- drawing with the pointer ----------------
  let cur = null;
  const at = (e) => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(W - 1, Math.round((e.clientX - r.left) * W / r.width))), Math.max(0, Math.min(H - 1, Math.round((e.clientY - r.top) * H / r.height)))]; };
  function flush(final) {
    if (!cur) return;
    if (cur.buf.length > 2 || (final && cur.chunks === 0 && cur.buf.length >= 2)) {
      const cmd = ["s", cur.col, cur.size, cur.buf.slice()];
      board.cmds.push(cmd); cur.chunks++; send([cmd]);
      cur.buf = cur.buf.slice(-2);
    }
    if (final) { groups.push(cur.chunks); cur = null; }
  }
  cv.addEventListener("pointerdown", (e) => {
    if (!canDraw || e.button > 0) return; e.preventDefault();
    const [x, y] = at(e);
    if (tool === "fill") { const cmd = ["f", x, y, color]; board.add(cmd); send([cmd]); groups.push(1); return; }
    cv.setPointerCapture(e.pointerId);
    cur = { col: tool === "eraser" ? "#ffffff" : color, size: tool === "eraser" ? Math.round(size * 1.6) : size, buf: [x, y], chunks: 0, last: [x, y], t: performance.now() };
    board.segs(cur.col, cur.size, [x, y]);
  });
  cv.addEventListener("pointermove", (e) => {
    if (!cur) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const [x, y] = at(ev); if (Math.hypot(x - cur.last[0], y - cur.last[1]) < 2) continue;
      board.segs(cur.col, cur.size, [cur.last[0], cur.last[1], x, y]); cur.buf.push(x, y); cur.last = [x, y];
    }
    if (cur.buf.length >= 120 || performance.now() - cur.t > 70) { cur.t = performance.now(); flush(false); }
  });
  const up = () => { if (cur) { if (cur.chunks === 0 && cur.buf.length === 2) { cur.buf.push(cur.buf[0], cur.buf[1]); } flush(true); } };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  function undo() {
    if (!canDraw || cur) return; const n = groups.pop(); if (!n) return;
    for (let i = 0; i < n; i++) board.add(["u"]);
    send(Array.from({ length: n }, () => ["u"]));
  }
  function clearAll() { if (!canDraw) return; board.add(["c"]); groups = []; send([["c"]]); }
  $("undo").onclick = undo; $("clear").onclick = clearAll;
  document.addEventListener("keydown", (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || ""; if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "b") setTool("pen"); else if (k === "e") setTool("eraser"); else if (k === "f") setTool("fill");
    else if (k === "[") { size = SIZES[Math.max(0, SIZES.indexOf(size) - 1)]; paintTools(); } else if (k === "]") { size = SIZES[Math.min(SIZES.length - 1, SIZES.indexOf(size) + 1)]; paintTools(); }
    else if (k === "delete") clearAll();
  });

  // ---------------- screens ----------------
  let mode = "single", room = null, rooms = [], offset = 0, turnKey = "", msgsLog = [], endInfo = null, prevScores = {}, soloWord = "", soloEnd = 0;
  const show = (el, b) => { el.hidden = !b; };
  function screens() {
    const inRoom = !!room, multi = mode === "multi" || inRoom;
    show($("picLobby"), multi && !inRoom); show($("picRoom"), multi && inRoom && room.state === "lobby" && !endInfo);
    const stageOn = !multi || (inRoom && (room.state === "game" || !!endInfo));
    show($("stage"), stageOn);
    $("stage").classList.toggle("solo", !multi);
    show($("soloBar"), !multi); show($("soloHint"), !multi);
    if (multi && !inRoom) renderLobby(); else if (multi && room.state === "lobby" && !endInfo) renderRoom();
    if (stageOn) renderStage();
  }
  function renderLobby() {
    const p = $("picLobby"); p.replaceChildren();
    if (T.offline) { p.innerHTML = `<h2>Multiplayer</h2><p class="hint">Multiplayer needs the game server. Start it with “npm start”.</p>`; return; }
    if (!T.user) { p.innerHTML = `<h2>Multiplayer</h2><p class="hint">Log in to draw and guess with other people online.</p><button class="btn" id="pl">🔑 Log in / Sign up</button>`; $("pl").onclick = () => T.openAuth(); return; }
    p.innerHTML = `<h2>🏠 Open rooms (2 to 8 players)</h2><p class="hint">Create a room, share it with friends and start when everyone has joined. Everybody draws in turn, and the player with the most points wins. Wins and losses count toward the Pictionary leaderboard.</p>
      <div class="btn-row" style="justify-content:flex-start"><button class="btn" id="mk">➕ Create a room</button></div>` +
      (rooms.length ? rooms.map((r) => `<div class="rrow">${av(r.host.avatar)}<div class="grow"><b>${esc(r.host.username)}'s room</b><br><small>${r.opts.rounds} round${r.opts.rounds > 1 ? "s" : ""} · ${r.opts.time}s per drawing · ${r.count}/${r.max}</small></div><button class="btn secondary" data-j="${r.id}" ${r.count >= r.max ? "disabled" : ""}>Join</button></div>`).join("") : `<p class="hint">No open rooms right now. Create one and invite friends!</p>`);
    $("mk").onclick = () => T.send({ t: "pic_create" });
    p.querySelectorAll("[data-j]").forEach((b) => b.onclick = () => T.send({ t: "pic_join", id: b.dataset.j }));
  }
  function renderRoom() {
    const p = $("picRoom"), host = room.host === T.user.id, o = room.opts;
    const seg = (key, vals, fmt) => `<div class="lbl">${key === "rounds" ? "Rounds (everyone draws once per round)" : "Seconds to draw"}</div><div class="seg" data-k="${key}">${vals.map((v) => `<button data-v="${v}" class="${o[key] === v ? "sel" : ""}" ${host ? "" : "disabled"}>${fmt(v)}</button>`).join("")}</div>`;
    p.innerHTML = `<h2>🎨 ${esc((room.members.find((m) => m.id === room.host) || {}).username || "")}'s room</h2>
      <div class="members">${room.members.map((m) => `<div class="member${m.id === room.host ? " host" : ""}">${av(m.avatar)}${esc(m.username)}${m.id === room.host ? " 👑" : ""}</div>`).join("")}</div>
      <p class="hint">${room.members.length} / ${room.max} players. ${host ? "You are the host: choose the settings, then start (at least 2 players)." : "Waiting for the host to start…"}</p>
      ${seg("rounds", [1, 2, 3], (v) => v + (v === 1 ? " round" : " rounds"))}${seg("time", [60, 80, 100], (v) => v + " s")}
      <div class="btn-row" style="justify-content:flex-start"><button class="btn" id="go" ${host && room.members.length >= 2 ? "" : "disabled"}>🏁 Start game</button><button class="btn secondary" id="lv">Leave room</button></div>`;
    p.querySelectorAll(".seg").forEach((sg) => { if (host) sg.querySelectorAll("button").forEach((b) => b.onclick = () => T.send({ t: "pic_config", [sg.dataset.k]: Number(b.dataset.v) })); });
    $("go").onclick = () => T.send({ t: "pic_start" }); $("lv").onclick = () => T.send({ t: "pic_leave" });
  }

  const nameOf = (id) => { const m = room && room.members.find((x) => x.id === id); return m ? m.username : "Someone"; };
  const left = () => Math.max(0, (room.game.endsAt - (Date.now() + offset)) / 1000);
  function renderStage() {
    const ov = $("ov"), multi = !!room && mode !== "single" || !!room;
    if (!multi) { // practice sketchpad
      canDraw = true; $("tools").classList.remove("off"); cv.classList.remove("locked");
      $("rd").textContent = "Practice"; $("word").innerHTML = soloWord ? esc(soloWord) : "Pick a word"; ov.hidden = true; return;
    }
    const g = room.game, me = T.user.id;
    if (endInfo) { canDraw = false; renderPlayers(); $("tools").classList.add("off"); $("rd").textContent = "Game over"; $("word").textContent = ""; $("tm").textContent = ""; $("bar").style.width = "0%"; return endOverlay(); }
    if (!g) return;
    const isDrawer = g.drawer === me, mine = room.members.find((m) => m.id === me) || {};
    $("rd").textContent = `Round ${g.round}/${g.rounds} · Turn ${Math.min(g.turn, g.turns)}/${g.turns}`;
    canDraw = isDrawer && g.phase === "draw"; $("tools").classList.toggle("off", !canDraw); cv.classList.toggle("locked", !canDraw);
    $("leaveBtn").hidden = false;
    const inputOn = !(g.phase === "draw" && isDrawer); $("guess").placeholder = isDrawer ? "Chat with other guessers…" : mine.guessed ? "You got it! Chat here…" : "Type your guess…";
    void inputOn;
    // word line
    if (g.phase === "draw") {
      if (isDrawer) $("word").innerHTML = `${esc(g.word)}<small>draw this!</small>`;
      else if (g.word) $("word").innerHTML = `<span style="color:#8dff9a">${esc(g.word)}</span>`;
      else $("word").innerHTML = `${esc(g.hint.split("").join(" ").replace(/ {2}/g, "   "))}<small>${g.len}</small>`;
    } else if (g.phase === "reveal") $("word").innerHTML = esc(g.lastWord || g.word || "");
    else $("word").textContent = "";
    // overlays
    ov.hidden = true; ov.className = g.phase === "reveal" ? "ov mini" : "ov";
    if (g.phase === "pick") {
      ov.hidden = false;
      if (isDrawer) { ov.innerHTML = `<h2>Your turn! Choose a word</h2><div class="choices">${(g.choices || []).map((w, i) => `<button class="btn" data-i="${i}">${esc(w)}</button>`).join("")}</div><p>Picks the first one for you if you wait.</p>`; ov.querySelectorAll("[data-i]").forEach((b) => b.onclick = () => T.send({ t: "pic_pick", i: Number(b.dataset.i) })); }
      else ov.innerHTML = `<h2>${esc(nameOf(g.drawer))} is choosing a word…</h2><p>Get ready to guess!</p>`;
    } else if (g.phase === "reveal") {
      ov.hidden = false;
      const rows = room.members.map((m) => ({ m, d: (m.pts || 0) - (prevScores[m.id] || 0) })).sort((a, b) => b.d - a.d);
      ov.innerHTML = `<h2>The word was “${esc(g.lastWord || g.word || "?")}”</h2><table>${rows.map((r) => `<tr><td>${esc(r.m.username)}</td><td class="r" style="color:${r.d > 0 ? "#8dff9a" : "#aaa"}">${r.d > 0 ? "+" + r.d : "0"}</td></tr>`).join("")}</table><p>Next drawing starts soon…</p>`;
    }
    renderPlayers();
  }
  function renderPlayers() {
    const me = T.user && T.user.id;
    $("plist").innerHTML = room.members.slice().sort((a, b) => (b.pts || 0) - (a.pts || 0)).map((m) => `<div class="pl${m.id === me ? " me" : ""}${m.drawer ? " drawer" : ""}${m.guessed ? " got" : ""}">${av(m.avatar)}<span class="nm">${esc(m.username)}</span><span>${m.drawer ? "✏️" : m.guessed ? "✔" : ""}</span><span class="pt">${m.pts || 0}</span></div>`).join("");
  }
  function endOverlay() {
    const ov = $("ov"), e = endInfo; ov.hidden = false; ov.className = "ov";
    const won = e.winners.includes(e.you);
    ov.innerHTML = `<h2>${e.reason === "alone" ? "Everyone else left" : won ? (e.winners.length > 1 ? "🤝 It's a tie!" : "🏆 You win!") : "Game over"}</h2>
      <table>${e.ranking.map((r, i) => `<tr class="${e.winners.includes(r.id) ? "win" : ""}"><td>${i + 1}</td><td>${av(r.avatar)} ${esc(r.username)}</td><td class="r">${r.pts}</td></tr>`).join("")}</table>
      <div class="btn-row"><button class="btn" id="again">Back to the room</button><button class="btn secondary" id="out">Leave</button></div>`;
    $("again").onclick = () => { endInfo = null; board.reset(); screens(); };
    $("out").onclick = () => T.send({ t: "pic_leave" });
  }
  setInterval(() => {
    if (room && room.game && !$("stage").hidden && !endInfo) {
      const g = room.game, t = left(), total = g.phase === "draw" ? g.total / 1000 : g.phase === "pick" ? 15 : 5.5;
      $("tm").textContent = g.phase === "draw" || g.phase === "pick" ? Math.ceil(t) + "s" : ""; $("bar").style.width = Math.max(0, Math.min(100, t / total * 100)) + "%";
      if (g.phase === "pick" && g.drawer === T.user.id) { /* countdown is shown in the timer */ }
    } else if (!room && soloEnd) {
      const t = Math.max(0, (soloEnd - Date.now()) / 1000); $("tm").textContent = Math.ceil(t) + "s"; $("bar").style.width = t / 60 * 100 + "%";
      if (t <= 0) { soloEnd = 0; $("tm").textContent = "Time!"; $("timerBtn").textContent = "⏱️ 60 s challenge"; T.showToast && T.showToast("Time is up! Save your masterpiece?"); }
    }
  }, 200);

  // ---------------- chat ----------------
  function addMsg(html, cls) { const d = document.createElement("div"); if (cls) d.className = cls; d.innerHTML = html; const box = $("msgs"); box.append(d); while (box.children.length > 120) box.firstChild.remove(); box.scrollTop = box.scrollHeight; }
  $("chatForm").addEventListener("submit", (e) => { e.preventDefault(); const v = $("guess").value.trim(); if (!v || !room) return; T.send({ t: "pic_guess", text: v }); $("guess").value = ""; });
  T.on("msg:pic_msg", (m) => {
    if (m.kind === "chat") addMsg(`<b>${esc(nameOf(m.from))}:</b> ${esc(m.text)}`, m.priv ? "p" : ""); // priv: only players who know the word see it
    else if (m.kind === "correct") addMsg(`🎉 <b>${esc(nameOf(m.from))}</b> guessed the word! +${m.gain}`, "c");
    else if (m.kind === "close") addMsg(esc(m.text), "n");
    else addMsg(esc(m.text), "i");
  });

  // ---------------- messages from the server ----------------
  T.on("msg:pic_rooms", (m) => { rooms = m.rooms; if (mode === "multi" && !room) renderLobby(); });
  T.on("msg:pic_room", (m) => {
    const prev = room; room = m.room;
    if (!room) { endInfo = null; board.reset(); $("msgs").replaceChildren(); screens(); return; }
    if (m.room.game) { offset = m.room.game.now - Date.now(); }
    if (!prev || prev.id !== room.id) { $("msgs").replaceChildren(); endInfo = null; prevScores = {}; mode = "multi"; }
    const g = room.game;
    if (g) {
      const key = room.id + ":" + g.turn;
      if (key !== turnKey) { turnKey = key; groups = []; prevScores = Object.fromEntries((prev && prev.game ? prev.members : room.members).map((x) => [x.id, x.pts || 0])); if (g.drawer !== T.user.id) T.send({ t: "pic_sync" }); }
      if (g.phase === "draw" && prev && prev.game && prev.game.phase !== "draw") prevScores = Object.fromEntries(room.members.map((x) => [x.id, x.pts || 0]));
    } else turnKey = "";
    screens();
  });
  T.on("msg:pic_cmd", (m) => { for (const c of m.cmds || []) board.add(c); });
  T.on("msg:pic_clear", () => board.reset());
  T.on("msg:pic_end", (m) => { endInfo = m; T.refreshBoard && T.refreshBoard(); screens(); });
  const watch = () => { if (T.user) T.send({ t: "pic_watch" }); };
  T.on("ready", () => { watch(); screens(); });
  T.on("login", () => { watch(); screens(); });
  T.on("logout", () => { room = null; rooms = []; endInfo = null; screens(); });
  T.on("presence", () => { /* the room list is pushed by the server */ });
  T.on("mode", (m) => {
    if (m === "single" && room) { T.showToast && T.showToast("Leave your room first to use the sketchpad."); return; }
    mode = m; if (m === "single") { canDraw = true; board.reset(); groups = []; }
    screens();
  });
  $("leaveBtn").onclick = () => T.send({ t: "pic_leave" });

  // ---------------- practice sketchpad ----------------
  function newWord() { const w = PicWords.pick(1, new Set([soloWord]), $("diff").value)[0]; soloWord = w || "tung tung sahur"; board.reset(); groups = []; screens(); }
  $("newWord").onclick = newWord; $("diff").onchange = newWord;
  $("timerBtn").onclick = () => { if (soloEnd) { soloEnd = 0; $("timerBtn").textContent = "⏱️ 60 s challenge"; $("tm").textContent = ""; $("bar").style.width = "100%"; return; } if (!soloWord) newWord(); soloEnd = Date.now() + 60000; $("timerBtn").textContent = "⏹ Stop timer"; };
  $("savePng").onclick = () => { const a = document.createElement("a"); a.download = "tung-pictionary-" + (soloWord || "sketch").replace(/\s+/g, "-") + ".png"; a.href = cv.toDataURL("image/png"); a.click(); };
  soloWord = ""; screens();
  window.__pic = () => ({ board, room, mode, tool, groups, setMode: (m) => { mode = m; screens(); } });
})();
