(() => {
  const E = window.ImposterEngine;
  const WORDS = window.ImposterWords;
  const root = document.getElementById("impRoot");
  const TM = window.TungMP;

  let mode = "single";
  let solo = null;          // solo game: {g, bots, humanName, reported}
  let soloSize = 5;
  let room = null;          // server room view (multiplayer)
  let rooms = [];           // open rooms
  let roomAt = 0;           // when `room` arrived (performance.now)
  let timerEl = null;

  const GENERIC = ["nice", "common", "popular", "classic", "fun", "big", "old", "round", "useful", "everyday", "familiar", "typical"];
  const BOT_NAMES = ["Tung Bot", "Log Buddy", "Drummy", "Sahur", "Bonkers", "Woody", "Splinter", "Timber"];
  const BOT_FACES = ["🤖", "🪵", "🥁", "🏏", "🦆", "🐸", "🦊", "🐼"];

  // ---------- tiny DOM helper ----------
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, "");
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }
  const av = (a, n = 34) => TM.avatarNode(a, n);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- rendering ----------
  function render() {
    const ae = document.activeElement;
    const keep = ae && ae.id && root.contains(ae) ? { id: ae.id, v: ae.value, s: ae.selectionStart } : null;
    timerEl = null;
    root.replaceChildren(...build());
    if (keep) {
      const el = document.getElementById(keep.id);
      if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch (_) {} }
    }
    const chat = root.querySelector(".imp-chat");
    if (chat) chat.scrollTop = chat.scrollHeight;
    tickTimer();
  }

  function build() {
    if (mode === "single") {
      if (!solo) return [setupCard()];
      return gameView(E.view(solo.g, "me", Date.now()), soloCtx());
    }
    // multiplayer
    if (TM.offline) return [card("Multiplayer needs the game server", h("p", null, "Start it with “npm start” and open the site from there."))];
    if (!TM.user) return [card("Log in to play with others", h("p", { class: "imp-muted" }, "You need an account to join a room."), h("div", { class: "imp-row" }, h("button", { class: "mp-btn", onclick: () => TM.openAuth() }, "🔑 Log in / Sign up")))];
    if (!room) return [roomsCard()];
    if (room.state === "lobby" || !room.game) return [roomLobbyCard()];
    return gameView(room.game, mpCtx());
  }

  function card(title, ...kids) { return h("div", { class: "imp-card" }, title ? h("h2", null, title) : null, ...kids); }

  // ----- solo setup -----
  function setupCard() {
    const sel = h("select", { id: "impSize", onchange: (e) => (soloSize = Number(e.target.value)) },
      [4, 5, 6, 7, 8].map((n) => h("option", { value: n, selected: n === soloSize }, `${n} players (you + ${n - 1} computer)`)));
    return card("🕵️ Play against the computer",
      h("p", null, "One player is secretly the Imposter and doesn’t know the word. Everyone gives a one-word clue (twice around), then you vote. Computer players might be the Imposter, too!"),
      h("div", { class: "imp-setup" }, h("label", null, "Players", sel)),
      h("div", { class: "imp-row" }, h("button", { class: "mp-btn", onclick: () => startSolo(soloSize) }, "▶ Start game")),
      h("p", { class: "imp-hint" }, "Solo games count on the Solo leaderboard (log in to save), never on win/loss records."));
  }

  // ----- multiplayer rooms -----
  function roomsCard() {
    return card("🕵️ Open rooms",
      h("p", { class: "imp-muted" }, `Anyone can join an open room. The host starts the game once ${E.MIN_PLAYERS}-${E.MAX_PLAYERS} players are in.`),
      h("div", { class: "imp-row", style: "justify-content:flex-start" }, h("button", { class: "mp-btn", onclick: () => TM.send({ t: "imp_create" }) }, "➕ Create a room")),
      rooms.length
        ? h("ul", { class: "imp-rooms" }, rooms.map((r) => h("li", { class: "mp-player" },
          av(r.host.avatar, 38), h("div", { class: "mp-pname" }, `${r.host.username}’s room`, h("small", null, `${r.count}/${r.max} players`)),
          h("button", { class: "mp-btn small", disabled: r.count >= r.max, onclick: () => TM.send({ t: "imp_join", roomId: r.id }) }, "Join"))))
        : h("p", { class: "mp-empty" }, "No open rooms right now. Create one and tell your friends to join!"));
  }
  function roomLobbyCard() {
    const me = TM.user.id, isHost = room.host === me, n = room.members.length;
    const canStart = n >= room.min && n <= room.max;
    return card("🕵️ Room lobby",
      room.notice ? h("p", { class: "sp-status bad" }, room.notice) : null,
      h("p", { class: "imp-muted" }, `${n}/${room.max} players. ${n < room.min ? `Need ${room.min - n} more to start.` : "Ready when you are!"}`),
      h("div", { class: "imp-players" }, room.members.map((m) => h("div", { class: "imp-p" }, av(m.avatar, 32), h("span", { class: "nm" }, m.username + (m.id === room.host ? " 👑" : ""))))),
      TM.autoStartEl(room),
      h("div", { class: "imp-row" },
        isHost ? h("button", { class: "mp-btn", disabled: !canStart, onclick: () => TM.send({ t: "imp_start" }) }, "▶ Start game") : h("span", { class: "imp-muted" }, "Waiting for the host to start…"),
        h("button", { class: "mp-btn ghost", onclick: () => TM.send({ t: "imp_leave" }) }, "Leave room")));
  }

  // ----- contexts (where actions go) -----
  function soloCtx() {
    return {
      me: "me",
      act: (a) => { const r = E.act(solo.g, "me", a, Date.now()); if (!r.ok) flash(r.error); solo.onChange(); },
      again: () => { solo = null; render(); },
      againLabel: "Play again",
      isHost: true,
    };
  }
  function mpCtx() {
    return {
      me: TM.user.id,
      act: (a) => TM.send({ t: "imp_act", a }),
      again: () => TM.send({ t: "imp_again" }),
      againLabel: "Back to the room lobby",
      isHost: room.host === TM.user.id,
      leave: () => TM.send({ t: "imp_leave" }),
    };
  }
  function flash(msg) {
    const el = document.getElementById("impMsg");
    if (el) el.textContent = msg;
  }

  // ----- game view (shared by solo and multiplayer) -----
  const PHASE = { clue: "Clue time", discuss: "Discussion", vote: "Vote!", guess: "Last chance", result: "Round over" };

  function gameView(v, ctx) {
    const name = (id) => (v.players.find((p) => p.id === id) || { name: "?" }).name;
    const me = ctx.me;
    const myP = v.players.find((p) => p.id === me);
    const out = [];

    out.push(h("div", { class: "imp-card" },
      h("div", { class: "imp-top" },
        h("span", null, v.phase === "clue" ? `Round ${v.round}/${v.rounds} · ${PHASE.clue}` : PHASE[v.phase]),
        v.msLeft == null ? null : h("span", { class: "imp-timer", id: "impTimer", "data-left": v.msLeft }, "")),
      h("div", { class: "imp-role" + (v.you.isImposter ? " imposter" : ""), style: "margin-top:.6rem" },
        v.you.isImposter
          ? [h("span", null, "You are the"), h("b", null, "🕵️ Imposter"), h("span", null, "You don’t know the word. Listen to the clues and blend in!")]
          : [h("span", null, "The secret word is"), h("b", null, v.you.word || "?"), h("span", null, "Give clues that show you know it, without making it too easy for the Imposter.")])));

    // players
    out.push(h("div", { class: "imp-card" },
      h("div", { class: "imp-players" }, v.players.map((p) => {
        const tags = [];
        if (v.phase === "clue" && v.turn === p.id) tags.push("✍️");
        if (v.phase === "discuss" && p.ready) tags.push("✅");
        if (v.phase === "vote" && p.voted) tags.push("🗳️");
        if (v.imposter === p.id) tags.push("🕵️");
        if (v.ejected === p.id) tags.push("🚪");
        return h("div", { class: "imp-p" + (v.turn === p.id ? " turn" : "") + (p.left || !p.connected ? " off" : "") },
          av(p.avatar, 32), h("span", { class: "nm" }, p.id === me ? p.name + " (you)" : p.name), h("span", { class: "tag" }, tags.join(" ")));
      }))));

    // clues so far
    if (v.clues.length || v.phase === "clue") {
      const rows = [];
      for (let r = 1; r <= v.rounds; r++) {
        const list = v.clues.filter((c) => c.round === r);
        if (!list.length && r > v.round) continue;
        rows.push(h("div", { class: "rd" }, `ROUND ${r}`));
        rows.push(h("div", null, list.map((c) => h("span", { class: "imp-clue" }, h("em", null, name(c.id) + ":"), c.word))));
      }
      out.push(card("Clues", h("div", { class: "imp-clues" }, rows)));
    }

    // phase controls
    out.push(controls(v, ctx, name));
    return out;
  }

  function chatBox(v, ctx, name) {
    return h("div", null,
      h("div", { class: "imp-chat" }, v.chat.length ? v.chat.map((c) => h("div", null, h("b", null, name(c.id) + ": "), c.text)) : h("span", { class: "imp-muted" }, "Say who you suspect and why…")),
      h("form", { class: "imp-form", onsubmit: (e) => {
        e.preventDefault();
        const inp = document.getElementById("impChat");
        const text = inp.value.trim();
        if (!text) return;
        inp.value = "";
        ctx.act({ type: "chat", text });
      } }, h("input", { id: "impChat", maxlength: "140", autocomplete: "off", placeholder: "Type a message" }), h("button", { class: "mp-btn small", type: "submit" }, "Send")));
  }

  function controls(v, ctx, name) {
    const me = ctx.me;
    switch (v.phase) {
      case "clue": {
        if (v.turn === me) {
          return card("Your turn: give a one-word clue",
            h("form", { class: "imp-form", onsubmit: (e) => {
              e.preventDefault();
              const inp = document.getElementById("impClue");
              ctx.act({ type: "clue", word: inp.value });
              inp.value = "";
            } }, h("input", { id: "impClue", maxlength: "20", autocomplete: "off", placeholder: "One word…", autofocus: true }), h("button", { class: "mp-btn", type: "submit" }, "Give clue")),
            h("p", { class: "sp-status bad", id: "impMsg", style: "font-size:1rem;min-height:1.2rem" }, ""));
        }
        return card(null, h("p", { class: "imp-muted" }, `Waiting for ${v.turn ? name(v.turn) : "…"} to give a clue…`));
      }
      case "discuss": {
        const mine = v.players.find((p) => p.id === me);
        return card("Who’s the Imposter?", chatBox(v, ctx, name),
          h("div", { class: "imp-row" },
            h("button", { class: "mp-btn", disabled: mine && mine.ready, onclick: () => ctx.act({ type: "ready" }) }, mine && mine.ready ? "✅ Waiting for others" : "🗳️ I’m ready to vote"),
            h("span", { class: "imp-muted" }, `${v.players.filter((p) => p.ready).length}/${v.players.filter((p) => !p.left).length} ready`)),
          h("p", { class: "sp-status bad", id: "impMsg", style: "font-size:1rem;min-height:1.2rem" }, ""));
      }
      case "vote":
        return card("Vote for the Imposter",
          h("div", { class: "imp-votes" }, v.players.filter((p) => p.id !== me && !p.left).map((p) =>
            h("button", { class: v.myVote === p.id ? "sel" : "", onclick: () => ctx.act({ type: "vote", target: p.id }) }, av(p.avatar, 26), p.name))),
          h("p", { class: "imp-hint" }, v.myVote ? `You voted for ${name(v.myVote)}. You can change your vote until time runs out.` : "Pick the player you think is lying."),
          chatBox(v, ctx, name));
      case "guess": {
        if (v.you.isImposter) {
          return card("You were caught! One last chance",
            h("p", null, "Guess the secret word using the clues you heard. If you’re right, you win anyway!"),
            h("form", { class: "imp-form", onsubmit: (e) => { e.preventDefault(); ctx.act({ type: "guess", word: document.getElementById("impGuess").value }); } },
              h("input", { id: "impGuess", maxlength: "30", autocomplete: "off", placeholder: "The secret word is…" }), h("button", { class: "mp-btn", type: "submit" }, "Guess")));
        }
        return card(`${name(v.ejected)} was the Imposter!`, h("p", { class: "imp-muted" }, "They get one guess at the secret word. If they get it right, the Imposter still wins…"));
      }
      case "result": return resultCard(v, ctx, name);
    }
    return card(null);
  }

  function resultCard(v, ctx, name) {
    const o = v.outcome;
    const meImp = v.you.isImposter;
    const won = (o.winner === "imposter") === meImp;
    const text = {
      caught: "The Imposter was voted out and couldn’t guess the word.",
      guessed: `The Imposter was caught but guessed the word${v.guess ? ` (“${v.guess}”)` : ""}!`,
      innocent: `The crew voted out ${v.ejected ? name(v.ejected) : "an innocent player"}, who wasn’t the Imposter.`,
      tie: "The vote was tied, so nobody was voted out.",
      imposterleft: "The Imposter left the game.",
    }[o.reason] || "";
    const tally = v.votes ? Object.entries(v.votes).map(([a, b]) => `${name(a)} → ${name(b)}`).join(" · ") : "";
    return h("div", { class: "imp-card imp-result" },
      h("div", { class: "big" }, won ? "🏆" : "💀"),
      h("h2", null, `${o.winner === "crew" ? "The Crew wins!" : "The Imposter wins!"} ${won ? "You won." : "You lost."}`),
      h("p", null, text),
      h("p", { style: "margin-top:.6rem" }, "The Imposter was ", h("b", null, name(v.imposter)), ". The word was ", h("b", null, v.word), "."),
      tally ? h("p", { class: "imp-hint" }, "Votes: " + tally) : null,
      h("div", { class: "imp-row" },
        ctx.isHost ? h("button", { class: "mp-btn", onclick: ctx.again }, ctx.againLabel) : h("span", { class: "imp-muted" }, "Waiting for the host…"),
        ctx.leave ? h("button", { class: "mp-btn ghost", onclick: ctx.leave }, "Leave room") : null));
  }

  // ---------- countdown label ----------
  function tickTimer() {
    const el = document.getElementById("impTimer");
    if (!el) return;
    let left;
    if (mode === "single" && solo) left = solo.g.deadline - Date.now();
    else left = Number(el.dataset.left) - (performance.now() - roomAt);
    el.textContent = Math.max(0, Math.ceil(left / 1000)) + "s";
  }
  setInterval(tickTimer, 250);

  // ---------- solo game with computer players ----------
  function startSolo(n) {
    const humanName = TM.user ? TM.user.username : "You";
    const humanAvatar = TM.user ? TM.user.avatar : "emoji:🙂";
    const names = shuffle(BOT_NAMES), faces = shuffle(BOT_FACES);
    const players = [{ id: "me", name: humanName, avatar: humanAvatar }];
    const bots = {};
    for (let i = 0; i < n - 1; i++) {
      const id = "bot" + i;
      players.push({ id, name: names[i], avatar: "emoji:" + faces[i] });
      bots[id] = { due: 0, chats: 0 };
    }
    const word = pick(Object.keys(WORDS));
    const imposter = pick(players).id;
    const g = E.createGame(players, word, imposter, shuffle(players.map((p) => p.id)), Date.now());
    solo = { g, bots, reported: false, onChange: () => { afterSolo(); render(); } };
    render();
  }

  function afterSolo() {
    const g = solo.g;
    if (g.phase === "result" && !solo.reported) {
      solo.reported = true;
      const meImp = g.imposter === "me";
      const win = (g.outcome.winner === "imposter") === meImp;
      TM.submitSolo({ game: "imposter", result: win ? "win" : "loss" });
    }
  }

  const norm = (s) => E.norm(s);
  function related(w, word) {
    if (WORDS[word].includes(w)) return 1;
    const list = WORDS[word];
    if (list.some((x) => x.length > 3 && w.length > 3 && (x.includes(w) || w.includes(x) || x.slice(0, 4) === w.slice(0, 4)))) return 0.5;
    return 0;
  }
  function bestGuessWord(clues) {
    const ranked = Object.keys(WORDS).map((w) => ({ w, s: clues.reduce((a, c) => a + related(c, w), 0) + Math.random() * 0.3 })).sort((a, b) => b.s - a.s);
    return ranked[0];
  }

  function botClue(id) {
    const g = solo.g;
    const used = new Set(g.clues.map((c) => norm(c.word)));
    if (id !== g.imposter) {
      const pool = WORDS[g.word].filter((w) => !used.has(w));
      return pick(pool.length ? pool : WORDS[g.word]);
    }
    const clues = g.clues.filter((c) => !c.skipped).map((c) => norm(c.word));
    const free = GENERIC.filter((w) => !used.has(w));
    if (!clues.length) return pick(free.length ? free : GENERIC);
    const best = bestGuessWord(clues);
    if (best.s < 0.8) return pick(free.length ? free : GENERIC);
    const pool = WORDS[best.w].filter((w) => !used.has(w));
    return pick(pool.length ? pool : free.length ? free : GENERIC);
  }
  function suspicion(pid) {
    const g = solo.g;
    let s = 0;
    for (const c of g.clues) {
      if (c.id !== pid) continue;
      if (c.skipped) s += 1.3;
      else s += 1 - related(norm(c.word), g.word);
    }
    return s;
  }
  function botVote(id) {
    const g = solo.g;
    const others = g.players.filter((p) => !p.left && p.id !== id);
    if (id === g.imposter) return pick(others).id;
    const ranked = others.map((p) => ({ id: p.id, s: suspicion(p.id) + Math.random() * 0.7 })).sort((a, b) => b.s - a.s);
    return (Math.random() < 0.85 ? ranked[0] : pick(ranked)).id;
  }
  function botChat(id) {
    const g = solo.g;
    const others = g.players.filter((p) => p.id !== id && !p.left);
    if (id === g.imposter) return pick([`${pick(others).name}'s clue felt a bit too obvious.`, "I thought all the clues were fine tbh.", `Not sure... maybe ${pick(others).name}?`]);
    const sus = others.map((p) => ({ p, s: suspicion(p.id) })).sort((a, b) => b.s - a.s)[0];
    return sus.s >= 1 ? pick([`${sus.p.name}'s clue seemed really random to me.`, `I'm suspicious of ${sus.p.name}.`]) : pick(["Everyone's clues looked good to me.", "Hard to tell this round..."]);
  }

  function botStep() {
    if (mode !== "single" || !solo) return;
    const g = solo.g, now = Date.now();
    if (g.phase === "result") return;
    let changed = E.tick(g, now);
    const due = (b, ms) => { if (!b.due) b.due = now + ms; return now >= b.due; };

    if (g.phase === "clue") {
      const id = g.order[g.turnIdx];
      if (id !== "me" && solo.bots[id] && due(solo.bots[id], 1500 + Math.random() * 2000)) {
        solo.bots[id].due = 0;
        let r = E.act(g, id, { type: "clue", word: botClue(id) }, now);
        if (!r.ok) E.act(g, id, { type: "clue", word: pick(GENERIC) }, now);
        changed = true;
      }
    } else if (g.phase === "discuss") {
      const meReady = g.ready.includes("me");
      for (const [id, b] of Object.entries(solo.bots)) {
        if (g.phase !== "discuss") break;
        if (b.chats < 1 && now - (b.t0 || (b.t0 = now)) > 4000 + Math.random() * 6000) {
          b.chats++; E.act(g, id, { type: "chat", text: botChat(id) }, now); changed = true;
        }
        if (!g.ready.includes(id) && (now - (b.t0 || now) > 12000 || (meReady && due(b, 700 + Math.random() * 1800)))) {
          E.act(g, id, { type: "ready" }, now); changed = true;
        }
      }
    } else if (g.phase === "vote") {
      for (const [id, b] of Object.entries(solo.bots)) {
        if (g.phase !== "vote") break;
        if (!g.votes[id] && due(b, 1500 + Math.random() * 5000)) { E.act(g, id, { type: "vote", target: botVote(id) }, now); b.due = 0; changed = true; }
      }
    } else if (g.phase === "guess" && g.imposter !== "me") {
      const b = solo.bots[g.imposter];
      if (due(b, 3000)) {
        const best = bestGuessWord(g.clues.filter((c) => !c.skipped).map((c) => norm(c.word)));
        E.act(g, g.imposter, { type: "guess", word: best.w }, now);
        b.due = 0; changed = true;
      }
    }
    // reset per-phase timers when the phase changes
    if (solo.phase !== g.phase) { solo.phase = g.phase; for (const b of Object.values(solo.bots)) { b.due = 0; b.t0 = 0; } changed = true; }
    if (changed) { afterSolo(); render(); }
  }
  setInterval(botStep, 400);

  // ---------- multiplayer wiring ----------
  TM.on("msg:imp_rooms", (m) => { rooms = m.rooms; if (mode === "multi" && !room) render(); });
  TM.on("msg:imp_room", (m) => {
    room = m.room;
    roomAt = performance.now();
    if (room && mode !== "multi") { const b = document.querySelector("#modeSwitch [data-mode=multi]"); if (b) b.click(); }
    render();
  });
  TM.on("ready", () => TM.send({ t: "imp_watch" }));
  TM.on("presence", () => { if (mode === "multi") render(); });
  TM.on("login", render);
  TM.on("logout", () => { room = null; render(); });
  TM.on("mode", (m) => { mode = m; render(); });
  TM.registerGame({ prepareMatch() {}, startMatch() {}, stopMatch() {}, exitMatch() {} });

  render();
})();
