(() => {
  const H = window.Hangman, TA = window.TungArt;
  const $ = (id) => document.getElementById(id);
  const cv = $("scene"), ctx = cv.getContext("2d"), statusEl = $("status");
  const kb = $("kb");
  let mp = false, my = 0, v = null, busy = false, solo = null, names = ["You", "Opponent"];
  let anim = 0, lastGuessed = -1, shake = 0;

  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const b = document.createElement("button"); b.textContent = ch; b.dataset.ch = ch;
    b.addEventListener("click", () => guessLetter(ch)); kb.append(b);
  }
  function setStatus(t, bad) { statusEl.textContent = t; statusEl.classList.toggle("bad", !!bad); }

  // ---- drawing: gallows + Tung built up part by part ----
  const STAGES = 10;
  function scene(stageCount, lost, won) {
    const W = 360;
    const sky = ctx.createLinearGradient(0, 0, 0, W); sky.addColorStop(0, "#27406b"); sky.addColorStop(1, "#14243f");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = "#fff"; for (const [x, y] of [[40, 40], [300, 60], [230, 25], [90, 110], [330, 140]]) ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = "#2d5a2d"; ctx.fillRect(0, 322, W, 40);
    ctx.fillStyle = "#3d7a3d"; ctx.fillRect(0, 322, W, 6);
    ctx.lineCap = "round"; ctx.strokeStyle = "#8c5a2a";
    const wood = (x1, y1, x2, y2, w) => { ctx.lineWidth = w; ctx.strokeStyle = "#6e4420"; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.lineWidth = w - 5; ctx.strokeStyle = "#a8743b"; ctx.stroke(); };
    if (stageCount >= 1) wood(40, 322, 170, 322, 14);
    if (stageCount >= 2) wood(70, 322, 70, 40, 14);
    if (stageCount >= 3) wood(60, 44, 250, 44, 14);
    if (stageCount >= 4) wood(70, 100, 125, 44, 9);
    const sway = lost ? 0 : Math.sin(performance.now() / 600) * 0.04 * Math.min(1, Math.max(0, stageCount - 4));
    if (stageCount >= 5) { ctx.strokeStyle = "#d8c08a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(230, 44); ctx.lineTo(230, 80); ctx.stroke(); }
    if (stageCount >= 6) {
      const parts = { legs: stageCount >= 10, armFar: stageCount >= 8, bat: stageCount >= 9, face: stageCount >= 7 };
      ctx.save(); ctx.translate(230, 80); ctx.rotate(sway); ctx.translate(-230, -80);
      TA.draw(ctx, 230, 80 + 96, 190, { parts, eyes: lost ? "x" : "normal", mouth: lost ? "sad" : won ? "open" : stageCount >= 9 ? "oh" : "smile", look: [0.3, 0.5], bat: 0.45 });
      ctx.restore();
    }
    if (lost) { ctx.fillStyle = "#ff8a80"; ctx.font = "900 26px sans-serif"; ctx.textAlign = "center"; ctx.fillText("TUNG TUNG... 💀", 180, 346); }
  }
  function stagesFor(wrong, chances) { return wrong === 0 ? 0 : Math.min(STAGES, Math.ceil((wrong * STAGES) / chances)); }

  function loop() {
    if (v) {
      const wrong = v.wrong, lost = v.phase === "done" ? false : wrong >= v.chances;
      let st = stagesFor(wrong, v.chances);
      // after a finished round show the final picture until the next word is set
      if (v.showFinal) { st = stagesFor(v.showFinal.wrong, v.chances); scene(st, !v.showFinal.solved, v.showFinal.solved); }
      else scene(st, lost, false);
    } else scene(0, false, false);
    requestAnimationFrame(loop);
  }

  // ---- UI from a normalized view ----
  function render() {
    if (!v) return;
    const guesser = v.phase === "guess" && v.setter !== v.you;
    const setter = v.phase === "set" && v.setter === v.you;
    $("setup").hidden = !setter;
    $("play").hidden = !(v.phase === "guess") || (v.phase === "guess" && v.setter === v.you) || v.over;
    $("lives2").textContent = v.phase === "guess" ? `❤️ ${Math.max(0, v.chances - v.wrong)} wrong guesses left` : "";
    // the word slots
    const slots = $("word"); slots.replaceChildren();
    if (v.phase === "guess") {
      const wordArr = v.mask.length ? v.mask : [];
      wordArr.forEach((ch, i) => {
        const s = document.createElement("span");
        s.textContent = ch || (v.word ? v.word[i] : "");
        if (!ch && v.word) s.style.opacity = ".55";
        slots.append(s);
      });
    }
    $("hint").textContent = v.phase === "guess" && v.hint ? `Hint: ${v.hint}` : v.phase === "guess" ? "" : "";
    // keyboard
    for (const b of kb.children) {
      const ch = b.dataset.ch, used = v.guessed.includes(ch);
      b.disabled = used || !guesser || busy;
      const inWord = v.mask.includes(ch) || (v.word && v.word.includes(ch));
      b.className = used ? (inWord ? "hit" : "miss") : "";
    }
    $("solveBtn").disabled = !guesser || busy; $("solveIn").disabled = !guesser || busy;
    // rounds list
    const lines = v.results.map((r, i) => {
      const who = r.setter === v.you ? names[1] : names[0];
      return `<div>Round ${i + 1}: ${who === names[0] ? "you guessed" : who + " guessed"} <b>${r.word}</b> - ${r.solved ? "solved" : "not solved"} (${r.wrong} wrong)</div>`;
    });
    $("rounds").innerHTML = lines.join("");
    // status
    if (v.over) {
      if (v.winner === null) setStatus("🤝 It’s a draw.");
      else setStatus(v.winner === v.you ? "🏆 You win!" : `${names[1]} wins.`);
    } else if (v.phase === "set") {
      setStatus(setter ? `Round ${v.round + 1}: choose a secret word for ${names[1]} to guess.` : `Round ${v.round + 1}: ${names[1]} is choosing a word for you…`);
      if (setter) $("wordIn").focus();
    } else if (guesser) setStatus("Your turn to guess! Pick a letter or type the whole word.");
    else setStatus(`${names[1]} is guessing your word “${v.word}”…`);
  }

  function guessLetter(ch) {
    if (!v || busy) return;
    if (solo) return soloGuess({ t: "letter", ch });
    busy = true; render(); TungMP.sendMatch({ t: "tb_move", move: { t: "letter", ch } });
  }
  $("solveBtn").addEventListener("click", () => {
    const w = $("solveIn").value.trim(); if (!w || !v || busy) return;
    $("solveIn").value = "";
    if (solo) return soloGuess({ t: "solve", word: w });
    busy = true; render(); TungMP.sendMatch({ t: "tb_move", move: { t: "solve", word: w } });
  });
  $("solveIn").addEventListener("keydown", (e) => { if (e.key === "Enter") $("solveBtn").click(); });
  $("setBtn").addEventListener("click", () => {
    const word = $("wordIn").value, hint = $("hintIn").value;
    if (!H.WORD_RE.test(word.toUpperCase().replace(/[^A-Z]/g, ""))) return setStatus("Use 3 to 14 letters, A-Z only.", true);
    busy = true; TungMP.sendMatch({ t: "tb_move", move: { t: "word", word, hint } });
    $("wordIn").value = ""; $("hintIn").value = "";
  });
  $("wordIn").addEventListener("keydown", (e) => { if (e.key === "Enter") $("setBtn").click(); });
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[a-z]$/i.test(e.key) && document.activeElement && document.activeElement.tagName !== "INPUT" && v && v.phase === "guess" && v.setter !== v.you && !v.over && !busy) guessLetter(e.key.toUpperCase());
  });

  // ---- solo (against the computer's word) ----
  function newSolo() {
    mp = false; busy = false; names = ["You", "Computer"];
    const cat = $("cat").value, pick = H.randomWord(cat === "any" ? null : cat);
    const lives = Number($("lives").value);
    solo = { g: H.newGame({ chances: lives }), cat: pick.category };
    const g = solo.g;
    // The computer is the setter; run the shared rules so solo and multiplayer behave the same.
    g.setter = 1; g.round = 1; // a single round, with the computer (player 1) as the setter
    H.play(g, { t: "word", word: pick.word, hint: "Category: " + pick.category }, 1);
    v = viewSolo();
    render();
  }
  function viewSolo() {
    const g = solo.g;
    const x = H.view(g, 0);
    x.results = []; // no round list in solo
    x.over = g.over; x.phase = g.over ? "guess" : x.phase;
    x.showFinal = g.over ? { wrong: g.wrong, solved: g.results.length && g.results[g.results.length - 1].solved } : null;
    if (g.over) { x.mask = g.word.split(""); x.guessed = g.guessed; }
    return x;
  }
  function soloGuess(move) {
    const g = solo.g;
    const r = H.play(g, move, 0);
    if (!r.ok) return setStatus(r.error, true);
    // finishRound() in solo: round 1 -> over (a one-round game)
    v = viewSolo();
    if (g.over || (g.results.length && g.phase !== "guess")) {
      const won = g.results[g.results.length - 1].solved;
      g.over = true;
      v = viewSolo();
      v.over = true; v.winner = won ? 0 : 1;
      render();
      setStatus(won ? `🏆 You solved it! The word was ${g.results[g.results.length - 1].word}.` : `💀 Hanged! The word was ${g.results[g.results.length - 1].word}.`);
      if (window.TungMP) TungMP.submitSolo({ game: "hangman", result: won ? "win" : "loss" });
      return;
    }
    render();
  }
  $("newBtn").addEventListener("click", newSolo);

  // ---- multiplayer ----
  if (window.TungMP) {
    TungMP.on("msg:tb_state", (m) => {
      if (!mp) return;
      busy = false; my = m.idx;
      const prev = v;
      v = m.state;
      // when a round just ended, keep showing its final picture until the next word is set
      const last = v.results[v.results.length - 1];
      if (last && (!prev || prev.results.length < v.results.length)) { v.showFinal = { wrong: last.wrong, solved: last.solved }; setTimeout(() => { if (v) { v.showFinal = null; } }, 3500); }
      else if (prev && prev.showFinal && prev.results.length === v.results.length) v.showFinal = prev.showFinal;
      render();
    });
    TungMP.on("msg:tb_reject", (m) => { busy = false; setStatus(m.error || "That wasn’t allowed.", true); render(); });
    TungMP.registerGame({
      prepareMatch(m) { mp = true; solo = null; my = m.idx; names = [m.you.username, m.opp.username]; v = null; busy = true; setStatus("Waiting for the game to start…"); $("setup").hidden = true; $("play").hidden = true; $("word").replaceChildren(); $("rounds").replaceChildren(); },
      startMatch() {},
      stopMatch() { busy = true; },
      exitMatch() { mp = false; newSolo(); },
    });
  }
  newSolo();
  loop();
})();
