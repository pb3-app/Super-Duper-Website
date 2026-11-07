(() => {
  const G = window.GoRules;
  const $ = (id) => document.getElementById(id);
  const cv = $("board"), ctx = cv.getContext("2d"), statusEl = $("status");
  const CW = 640, M = 44;
  let mp = false, my = 0, g = null, busy = false, over = false, hover = -1, names = ["You", "Computer"], thinking = false, anims = [], audio;

  function click(freq, d = 0.06, v = 0.07) {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const t = audio.currentTime, o = audio.createOscillator(), gn = audio.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq / 2, t + d); gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(gn).connect(audio.destination); o.start(t); o.stop(t + d + 0.02); } catch (_) {}
  }
  const S = () => (CW - 2 * M) / (g.n - 1);
  const pt = (i) => [M + (i % g.n) * S(), M + Math.floor(i / g.n) * S()];
  function setStatus(t, bad) { statusEl.textContent = t; statusEl.classList.toggle("bad", !!bad); }
  const colName = (i) => (i === 0 ? "Black" : "White");

  function stars(n) {
    const e = n === 9 ? [2, 4, 6] : n === 13 ? [3, 6, 9] : [3, 9, 15], out = [];
    if (n === 9) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
    for (const a of e) for (const b of e) out.push([a, b]);
    return out;
  }
  function territory(gm) { // ownership of empty points for the preview during scoring
    const n = gm.n, b = gm.cells.slice(), own = new Array(n * n).fill(0);
    for (const i of gm.dead || []) b[i] = 0;
    const seen = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      if (b[i] || seen[i]) continue;
      const stack = [i], pts = []; seen[i] = 1; let tb = false, tw = false;
      while (stack.length) { const p = stack.pop(); pts.push(p); for (const q of G.nbrs(n, p)) { if (b[q] === 1) tb = true; else if (b[q] === 2) tw = true; else if (!seen[q]) { seen[q] = 1; stack.push(q); } } }
      if (tb && !tw) for (const p of pts) own[p] = 1; else if (tw && !tb) for (const p of pts) own[p] = 2;
    }
    return own;
  }

  function stone(x, y, color, r, a = 1, dead = false) {
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(0,0,0,.32)"; ctx.beginPath(); ctx.ellipse(x + r * 0.12, y + r * 0.18, r, r * 0.96, 0, 0, 7); ctx.fill();
    const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.1, x, y, r);
    if (color === 1) { gr.addColorStop(0, "#7a7a84"); gr.addColorStop(0.55, "#1b1b21"); gr.addColorStop(1, "#050507"); }
    else { gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.6, "#ece5d6"); gr.addColorStop(1, "#b8ad97"); }
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    // a faint log ring so the stones belong to the Tung family
    ctx.strokeStyle = color === 1 ? "rgba(255,210,120,.28)" : "rgba(120,80,30,.22)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, r * 0.28, 0, 7); ctx.stroke();
    if (dead) { ctx.strokeStyle = "#e5503c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.5); ctx.lineTo(x + r * 0.5, y + r * 0.5); ctx.moveTo(x + r * 0.5, y - r * 0.5); ctx.lineTo(x - r * 0.5, y + r * 0.5); ctx.stroke(); }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CW);
    if (!g) return;
    const n = g.n, s = S(), r = s * 0.47;
    // wooden board
    const wg = ctx.createLinearGradient(0, 0, CW, CW); wg.addColorStop(0, "#e2b66a"); wg.addColorStop(0.5, "#d9a85a"); wg.addColorStop(1, "#c8924a");
    ctx.fillStyle = wg; ctx.fillRect(0, 0, CW, CW);
    ctx.globalAlpha = 0.08; ctx.strokeStyle = "#6b4410"; ctx.lineWidth = 1.5;
    for (let y = 6; y < CW; y += 11) { ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= CW; x += 40) ctx.lineTo(x, y + Math.sin((x + y) * 0.05) * 2.5); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#5a3a12"; ctx.lineWidth = 1.4;
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(M, M + i * s); ctx.lineTo(CW - M, M + i * s); ctx.moveTo(M + i * s, M); ctx.lineTo(M + i * s, CW - M); ctx.stroke(); }
    ctx.lineWidth = 2.6; ctx.strokeRect(M, M, CW - 2 * M, CW - 2 * M);
    ctx.fillStyle = "#3a2208"; for (const [a, b] of stars(n)) { ctx.beginPath(); ctx.arc(M + a * s, M + b * s, 4, 0, 7); ctx.fill(); }
    ctx.fillStyle = "rgba(58,34,8,.7)"; ctx.font = "700 12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) { const L = "ABCDEFGHJKLMNOPQRST"[i]; ctx.fillText(L, M + i * s, 18); ctx.fillText(L, M + i * s, CW - 18); ctx.fillText(String(n - i), 18, M + i * s); ctx.fillText(String(n - i), CW - 18, M + i * s); }
    // territory preview while counting
    const scoring = g.phase === "score" || (g.phase === "done" && g.result);
    const deadSet = new Set(g.dead || []);
    if (scoring) { const own = territory(g); for (let i = 0; i < n * n; i++) if (own[i]) { const [x, y] = pt(i); ctx.fillStyle = own[i] === 1 ? "rgba(10,10,14,.75)" : "rgba(255,255,255,.85)"; ctx.fillRect(x - s * 0.17, y - s * 0.17, s * 0.34, s * 0.34); } }
    // stones
    for (let i = 0; i < n * n; i++) if (g.cells[i]) {
      const [x, y] = pt(i); const d = deadSet.has(i);
      stone(x, y, g.cells[i], r, d ? 0.45 : 1, d);
    }
    // fading captured stones
    const now = performance.now();
    anims = anims.filter((a) => now - a.t < 380);
    for (const a of anims) { const k = (now - a.t) / 380; stone(a.x, a.y, a.c, r * (1 - k * 0.4), 1 - k); }
    // last move + ko
    if (g.last && !g.last.pass && g.last.x !== undefined && g.cells[g.last.y * n + g.last.x]) {
      const [x, y] = pt(g.last.y * n + g.last.x); ctx.strokeStyle = g.cells[g.last.y * n + g.last.x] === 1 ? "#ffd23f" : "#c0392b"; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, 7); ctx.stroke();
    }
    if (g.ko >= 0 && g.phase === "play") { const [x, y] = pt(g.ko); ctx.strokeStyle = "#e5503c"; ctx.lineWidth = 2.4; ctx.strokeRect(x - r * 0.4, y - r * 0.4, r * 0.8, r * 0.8); }
    // hover ghost
    if (hover >= 0 && canPlay() && g.phase === "play" && previewLegal(hover)) { const [x, y] = pt(hover); stone(x, y, my + 1, r, 0.45); }
    requestAnimationFrame(() => { if (anims.length) draw(); });
  }
  function previewLegal(i) { return g.cells[i] === 0 && i !== g.ko && !!G.attempt(g.cells, g.n, i, my + 1); }
  const canPlay = () => !!g && !g.over && g.phase === "play" && g.turn === my && !busy && !thinking;

  function ui() {
    $("nameB").textContent = names[0] + (my === 0 ? "" : ""); $("nameW").textContent = names[1];
    $("capB").textContent = `${g.caps[0]} captured`; $("capW").textContent = `${g.caps[1]} captured`;
    $("plB").classList.toggle("turn", !g.over && g.phase === "play" && g.turn === 0); $("plW").classList.toggle("turn", !g.over && g.phase === "play" && g.turn === 1);
    const play = !g.over && g.phase === "play", sc = !g.over && g.phase === "score";
    $("passBtn").hidden = !play; $("passBtn").disabled = !canPlay();
    $("resignBtn").hidden = g.over; $("acceptBtn").hidden = !sc; $("resumeBtn").hidden = !sc;
    $("acceptBtn").disabled = !!g.acc[my]; $("acceptBtn").textContent = g.acc[my] ? "✅ Waiting for your opponent…" : "✅ Accept the count";
    if (g.over) {
      if (g.reason === "resign") setStatus(g.winner === my ? "🏆 Your opponent resigned. You win!" : "You resigned.");
      else { const r = g.result; setStatus(g.winner === my ? `🏆 You win by ${r.margin} points!` : `You lose by ${r.margin} points.`); }
    } else if (g.phase === "score") setStatus(g.acc[my] ? "Waiting for your opponent to accept…" : "Click groups to mark them dead or alive. Accept when the count looks right.");
    else if (thinking) setStatus("Computer is thinking…");
    else if (g.turn === my) setStatus(`Your turn (${colName(my)})` + (g.last && g.last.pass ? " - your opponent passed." : "."));
    else setStatus(mp ? "Waiting for your opponent…" : "Computer is thinking…");
    // score box
    const box = $("scoreBox"), res = g.over && g.result ? g.result : G.areaScore(g.cells, g.n, g.dead);
    const w = (res.white !== undefined ? res.white : 0) + g.komi;
    box.innerHTML = g.phase === "play" && !g.over ? `Area now: <b>Black ${res.black}</b> · <b>White ${res.white}</b> + ${g.komi} komi` : `<b>Black ${res.black}</b> vs <b>White ${(res.white + g.komi).toFixed(1)}</b><br><small>(${res.stonesB}+${res.terrB} · ${res.stonesW}+${res.terrW}+${g.komi} komi)</small>`;
    void w;
    draw();
  }
  function noteCaptures(prev, next) { if (!prev) return; for (let i = 0; i < prev.length; i++) if (prev[i] && !next[i]) { const [x, y] = pt(i); anims.push({ x, y, c: prev[i], t: performance.now() }); } }

  function mouseIdx(e) {
    const r = cv.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * CW, py = ((e.clientY - r.top) / r.height) * CW, s = S();
    const x = Math.round((px - M) / s), y = Math.round((py - M) / s);
    if (x < 0 || y < 0 || x >= g.n || y >= g.n || Math.hypot(px - (M + x * s), py - (M + y * s)) > s * 0.55) return -1;
    return y * g.n + x;
  }
  cv.addEventListener("pointermove", (e) => { if (!g) return; const h = mouseIdx(e); if (h !== hover) { hover = h; draw(); } });
  cv.addEventListener("pointerleave", () => { hover = -1; if (g) draw(); });
  cv.addEventListener("click", (e) => {
    if (!g || g.over) return;
    const i = mouseIdx(e); if (i < 0) return;
    const x = i % g.n, y = Math.floor(i / g.n);
    if (g.phase === "score") return act({ t: "dead", x, y });
    if (!canPlay()) return;
    if (!previewLegal(i)) { setStatus(g.cells[i] ? "That point is taken." : i === g.ko ? "Ko: you can't retake right away." : "That move would be suicide.", true); return; }
    act({ t: "play", x, y });
  });
  function act(move) {
    if (mp) { busy = true; TungMP.sendMatch({ t: "tb_move", move }); ui(); return; }
    const before = g.cells.slice();
    const r = G.play(g, move, move.t === "dead" || move.t === "accept" || move.t === "resume" ? my : g.turn === my ? my : g.turn);
    if (!r.ok) return setStatus(r.error, true);
    if (move.t === "resume") g.aiMarked = false;
    noteCaptures(before, g.cells); if (move.t === "play") click(r.ev.captured ? 190 : 330);
    ui(); soloNext();
  }
  $("passBtn").addEventListener("click", () => { if (canPlay()) act({ t: "pass" }); });
  $("resignBtn").addEventListener("click", () => { if (!g || g.over || !confirm("Resign this game?")) return; act({ t: "resign" }); });
  $("acceptBtn").addEventListener("click", () => act({ t: "accept" }));
  $("resumeBtn").addEventListener("click", () => act({ t: "resume" }));

  // ---------- solo ----------
  function newSolo() {
    mp = false; over = false; busy = false; thinking = false; anims = []; names = ["You", "Computer"];
    my = Number($("side").value); names = my === 0 ? ["You", "Computer"] : ["Computer", "You"];
    g = G.newGame({ size: Number($("size").value) }); ui(); soloNext();
  }
  function soloNext() {
    if (mp || !g) return;
    if (g.over) { if (!over) { over = true; if (window.TungMP) TungMP.submitSolo({ game: "go", result: g.winner === my ? "win" : "loss" }); } ui(); return; }
    if (g.phase === "score") { // the computer marks the dead stones once, and accepts whatever the final marking is
      if (!g.aiMarked) { g.aiMarked = true; for (const i of G.estimateDead(g, 90)) if (!g.dead.includes(i)) G.play(g, { t: "dead", x: i % g.n, y: Math.floor(i / g.n) }, 1 - my); ui(); }
      if (g.acc[my] && !g.acc[1 - my]) { G.play(g, { t: "accept" }, 1 - my); ui(); soloNext(); }
      return;
    }
    if (g.turn !== my) {
      thinking = true; ui();
      setTimeout(() => {
        const mv = G.ai(g, $("level").value), before = g.cells.slice();
        const r = G.play(g, mv, g.turn); thinking = false;
        if (!r.ok) G.play(g, { t: "pass" }, g.turn);
        noteCaptures(before, g.cells); click(r.ok && r.ev && r.ev.captured ? 190 : 300);
        ui(); soloNext();
      }, 350);
    }
  }
  $("newBtn").addEventListener("click", newSolo);
  for (const id of ["size", "side"]) $(id).addEventListener("change", newSolo);

  // ---------- multiplayer ----------
  if (window.TungMP) {
    TungMP.on("msg:tb_state", (m) => {
      if (!mp) return;
      const prev = g && g.cells ? g.cells.slice() : null;
      g = m.state; my = m.idx; busy = false; noteCaptures(prev, g.cells);
      if (g.last && !g.last.pass && g.last.by !== my) click(g.caps[1 - my] ? 220 : 320);
      ui();
    });
    TungMP.on("msg:tb_reject", (m) => { busy = false; setStatus(m.error || "That move wasn’t allowed.", true); if (g) ui(); });
    TungMP.registerGame({
      prepareMatch(m) { mp = true; my = m.idx; names = m.idx === 0 ? [m.you.username, m.opp.username] : [m.opp.username, m.you.username]; g = G.newGame({ size: m.options.size }); busy = true; anims = []; ui(); setStatus("Waiting for the game to start…"); },
      startMatch() {},
      stopMatch() { busy = true; },
      exitMatch() { mp = false; newSolo(); },
    });
  }
  newSolo();
})();
