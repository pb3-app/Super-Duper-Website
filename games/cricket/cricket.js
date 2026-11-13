/* Tung Cricket - the screen. All the rules live in sim.js; this file draws the match and turns clicks into actions.
   Solo: one sim, the computer plays side 1. Match: the host runs the clock and the computer-free sim and sends every action it applies;
   the guest keeps a copy of the sim and replays those actions (and sends its own choices to the host as requests). */
(() => {
  "use strict";
  const S = window.CricketSim, TA = window.TungArt;
  const $ = (id) => document.getElementById(id);
  const cv = $("view"), ctx = cv.getContext("2d"), W = 960, H = 540;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const PAL = { strikers: "gold", titans: "blue", blasters: "red", spinners: "green", kings: "brown", rangers: "pink" };
  const sn = (n) => { const p = String(n).split(" "); return p.length > 1 ? p[0][0] + " " + p.slice(1).join(" ") : n; };

  let sim = null, role = "idle", my = 0, np = null, raf = 0, last = 0, ctxInfo = null, finished = false, sentN = 0;
  let anim = null, busyUntil = 0, logLines = [], banner = null, bannerT = 0, coin = null, gears = [null, null], names = ["You", "Computer"];
  let sel = { team: "titans", kind: null, u: 0.05, v: 0.38, eff: 0.6, shot: "defend", ang: null, air: false, step: false, preset: null, tab: "comm" };
  let edit = { on: false, f: null, drag: -1 }, ckey = "", picks = { mine: null, opp: null }, pickBox = false, aimAt = null, mouse = [480, 300];

  // ---------------- sound ----------------
  let AC = null, muted = false;
  function snd(kind) {
    if (muted) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume();
      const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(); o.connect(g); g.connect(AC.destination);
      const noise = (dur, f0, vol) => { const b = AC.createBuffer(1, AC.sampleRate * dur, AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), gg = AC.createGain(); s.buffer = b; fl.type = "bandpass"; fl.frequency.value = f0; gg.gain.value = vol; s.connect(fl); fl.connect(gg); gg.connect(AC.destination); s.start(t); };
      if (kind === "hit") { o.type = "triangle"; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.09); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.start(t); o.stop(t + 0.13); noise(0.05, 2400, 0.25); }
      else if (kind === "stumps") { noise(0.35, 900, 0.5); o.type = "square"; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.3); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32); o.start(t); o.stop(t + 0.33); }
      else if (kind === "cheer") { noise(1.4, 1100, 0.35); o.disconnect(); }
      else if (kind === "gasp") { noise(0.7, 600, 0.25); o.disconnect(); }
      else if (kind === "tick") { o.type = "sine"; o.frequency.value = 880; g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07); o.start(t); o.stop(t + 0.08); }
      else if (kind === "whoosh") { noise(0.18, 1600, 0.18); o.disconnect(); }
    } catch (_) {}
  }

  // ---------------- small helpers about the match ----------------
  const mySide = () => my;
  const I = () => (sim && sim.inn >= 0 ? sim.innings[sim.inn] : null);
  const P = (team, i) => sim.teams[team].players[i];
  const teamCol = (t) => sim.teams[t].color;
  const gearOf = (team) => gears[team] || null;
  const palOf = (team) => PAL[sim.teams[team].id] || "brown";
  const iAmBat = () => { const i = I(); return i && i.bat === my; };
  const iAmBowl = () => { const i = I(); return i && i.bowl === my; };
  const animBusy = () => performance.now() < busyUntil || (anim && !anim.over);
  const posName = (a, r) => {
    const A = S.wrap(a), x = Math.abs(A), out = r > S.CIRCLE ? "deep " : r < 14 ? "short " : "";
    if (x > 168) return "keeper"; if (x > 140) return A > 0 ? out + "slip" : out + "fine leg"; if (x > 112) return A > 0 ? out + "gully" : out + "leg gully";
    if (x > 82) return A > 0 ? out + "point" : out + "square leg"; if (x > 58) return A > 0 ? out + "cover point" : out + "midwicket"; if (x > 32) return A > 0 ? out + "extra cover" : out + "midwicket";
    if (x > 12) return A > 0 ? out + "mid off" : out + "mid on"; return out + "straight";
  };

  // ---------------- team picker (menu) ----------------
  function teamBars(t) {
    const pl = t.players, avg = (f, n) => Math.round(pl.slice(0, n || 11).reduce((a, p) => a + f(p), 0) / (n || pl.length));
    const bw = pl.filter((p) => p.canBowl), fast = bw.filter((p) => !S.isSpin(p)), spin = bw.filter((p) => S.isSpin(p));
    const a = (arr) => (arr.length ? Math.round(arr.reduce((x, p) => x + p.bowl, 0) / arr.length) : 30);
    return [["Batting", avg((p) => p.bat, 7)], ["Power", avg((p) => p.pow, 7)], ["Pace", a(fast.sort((x, y) => y.bowl - x.bowl).slice(0, 3))], ["Spin", a(spin.sort((x, y) => y.bowl - x.bowl).slice(0, 3))], ["Fielding", avg((p) => p.fld)]];
  }
  function teamCards(el, onPick, chosen) {
    el.innerHTML = S.TEAMS.map((t) => {
      const tm = S.makeTeam(t.id), bars = teamBars(tm).map(([n, v]) => `<span>${n}</span><span class="bar"><i style="width:${clamp(v, 5, 100)}%"></i></span>`).join("");
      return `<button class="team${t.id === chosen ? " on" : ""}" data-team="${t.id}"><b><i style="background:${t.color}"></i>${esc(t.name)}</b><small>${esc(t.blurb)}</small><span class="bars">${bars}</span></button>`;
    }).join("");
    el.onclick = (e) => { const b = e.target.closest("[data-team]"); if (!b) return; onPick(b.dataset.team); teamCards(el, onPick, b.dataset.team); };
  }
  teamCards($("teamGrid"), (id) => { sel.team = id; }, sel.team);

  // ---------------- starting and ending a match ----------------
  const me = () => (window.TungMP && TungMP.user ? TungMP.user.username : "You");
  function startSolo() {
    const opp = S.TEAMS.filter((t) => t.id !== sel.team), pick = opp[Math.floor(Math.random() * opp.length)].id;
    names = [me(), "Computer"]; gears = [window.TungGear ? TungGear.mine() : null, null];
    const pitch = $("pitch").value;
    sim = S.create({ seed: (Math.random() * 4294967295) >>> 0, overs: Number($("overs").value), level: $("level").value, pitch: pitch === "random" ? undefined : pitch, bot: [false, true], timers: false, teams: [sel.team, pick], names });
    my = 0; role = "solo"; begin();
  }
  function begin() {
    finished = false; sentN = 0; anim = null; busyUntil = 0; logLines = []; banner = null; coin = null; edit = { on: false, f: null, drag: -1 }; ckey = ""; $("result").hidden = true;
    sel.kind = null; sel.shot = "defend"; sel.ang = null; sel.air = false; sel.step = false;
    if (np) np.setPlaying(true); else return;
    $("board").innerHTML = ""; cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame);
    note(`${sim.teams[0].name} v ${sim.teams[1].name}. Pitch: ${sim.pitch.name} (${sim.pitch.note}) Weather: ${sim.weather.name}.`, "big");
    setTab(sel.tab);
  }
  function toMenu() { cancelAnimationFrame(raf); role = "idle"; sim = null; pickBox = false; $("result").hidden = true; if (np) np.setPlaying(false); }
  $("startBtn").addEventListener("click", () => { snd("tick"); startSolo(); });
  $("quitBtn").addEventListener("click", () => { if (np && np.kind) { if (confirm("Leave the match? You will forfeit and it counts as a loss.")) np.leave(); } else if (!sim || sim.phase === "done" || confirm("Quit this match?")) toMenu(); });
  addEventListener("keydown", (e) => { if (e.code === "Escape" && role === "solo") $("quitBtn").click(); });

  // ---------------- actions: everything the player does goes through submit() ----------------
  function submit(a) {
    if (!sim) return;
    if (role === "guest") { np.send({ k: "req", a }); return; }
    if (S.act(sim, my, a)) flush();
  }
  function flush() {
    if (role !== "host" || !np) { sim && (sentN = sim.log.length); return; }
    while (sentN < sim.log.length) { const e = sim.log[sentN++]; np.send({ k: "act", n: e.n, s: e.s, a: e.a }); }
  }
  function note(text, kind) { logLines.unshift({ text, kind: kind || "" }); if (logLines.length > 90) logLines.pop(); if (sel.tab === "comm") renderTab(); }

  // ---------------- events from the sim become animations ----------------
  function setBanner(text, sub, color) { banner = { text, sub, color: color || "#fff" }; bannerT = performance.now(); const b = $("banner"); b.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ""}`; b.style.color = color || "#fff"; b.hidden = false; b.style.animation = "none"; void b.offsetWidth; b.style.animation = ""; }
  function hideBanner() { banner = null; $("banner").hidden = true; }
  function pump() {
    const evs = sim.ev.splice(0);
    for (const e of evs) {
      switch (e.k) {
        case "text": note(e.text, e.kind); break;
        case "coin": coin = { t0: performance.now(), coin: e.coin }; snd("whoosh"); break;
        case "deliver": hideBanner(); anim = { t0: performance.now(), del: e.del, res: null, swingE: null, resE: null, over: false, stage: "flight", sounds: {} }; busyUntil = Infinity; snd("whoosh"); break;
        case "runs": if (anim && !anim.res) { anim.res = e.r; anim.resE = (performance.now() - anim.t0) / 1000; if (e.r.shot && Number.isFinite(e.r.shot.at)) anim.swingE = anim.swingE == null ? e.r.shot.at / 1000 : anim.swingE; } break;
        case "result": if (anim && anim.sounds.a && e.r.wkt && !(anim.res && anim.res.wkt)) { setBanner("WICKET!", wicketText(e.r), "#ff6b5b"); snd("gasp"); } if (anim) { anim.res = e.r; anim.resE = (performance.now() - anim.t0) / 1000; if (e.r.shot && Number.isFinite(e.r.shot.at)) anim.swingE = anim.swingE == null ? e.r.shot.at / 1000 : anim.swingE; } renderBoard(); break;
        case "over": hideBanner(); setBanner(`OVER ${e.n}`, `${sn(P(I().bowl, e.bowler).name)} to bowl`, "#ffd23f"); break;
        case "innings": hideBanner(); anim = null; busyUntil = 0; setBanner("INNINGS " + (sim.inn + 1), `${sim.teams[sim.innings[e.i].bat].name} bat`, "#ffd23f"); break;
        case "dec": setBanner(e.initial ? "OUT?" : "NOT OUT?", "The umpire has given his decision", "#9bd0ff"); snd("gasp"); break;
        case "drs": setBanner(e.over ? "OVERTURNED!" : e.call ? "UMPIRE'S CALL" : "STANDS", "", e.over ? "#7ee08f" : "#ffb347"); break;
        case "batter": renderBoard(); break;
        case "field": ckey = ""; break;
        case "done": renderBoard(); break;
      }
    }
  }
  function animStage(now) {
    const a = anim; if (!a) return null; const e = (now - a.t0) / 1000, F = a.del.flight;
    if (e < F) return { s: "flight", e };
    if (!a.res) return { s: "wait", e };
    const tb = Math.max(F + 0.5, (a.resE || 0) + 0.15);
    if (e < tb) return { s: "contact", e, tc: e - F };
    const p = a.res.path, T = p ? clamp(p.caught ? p.hang + 0.5 : p.six ? 1.9 : (p.t || 1.2) * 0.85, 0.8, 2.6) : 1.3;
    if (e < tb + T) return { s: "ball", e, p: (e - tb) / T, T, tb };
    return { s: "after", e, tb, T };
  }
  function animTick(now) {
    if (!anim) return;
    const st = animStage(now); anim.stage = st.s; anim.st = st; const r = anim.res;
    if (st.s === "contact" && r && !anim.sounds.c) { anim.sounds.c = 1; if (r.shot && !r.leave && !r.beaten) snd("hit"); else if (r.wkt && r.wkt.how === "bowled") snd("stumps"); }
    if (st.s === "ball" && r && !anim.sounds.b) { anim.sounds.b = 1; if (r.six || r.four) snd("cheer"); }
    if (st.s === "after" && !anim.sounds.a) {
      anim.sounds.a = 1; busyUntil = now + 250;
      if (r.wkt) { setBanner("WICKET!", wicketText(r), "#ff6b5b"); snd(r.wkt.how === "bowled" ? "stumps" : "gasp"); }
      else if (r.six) setBanner("SIX!", "", "#c58bff"); else if (r.four) setBanner("FOUR!", "", "#7ee08f");
      else if (r.extra === "wd") setBanner("WIDE", r.ex > 1 ? r.ex - 1 + " more" : "", "#ffb347"); else if (r.extra === "nb") setBanner("NO BALL", "Free hit next", "#ffb347");
      else if (r.beaten) setBanner("MISSED", "", "#cfe3ee");
      anim.over = !r.live || sim.phase !== "runs";
    }
    if (st.s === "after" && sim.phase !== "runs" && sim.phase !== "review") anim.over = true;
    if (anim.over && st.s === "after") { if (sim.phase === "bowl" || sim.phase === "pickBowler" || sim.phase === "newbat" || sim.phase === "break" || sim.phase === "done") { anim = null; busyUntil = 0; hideBanner(); } else busyUntil = 0; }
  }
  function wicketText(r) {
    const w = r.wkt, i = I(), who = P(i.bat, r.st).name, b = P(i.bowl, i.bowler).name;
    const f = w.f != null && w.f >= 0 ? sn(P(i.bowl, w.f).name) : "";
    return `${sn(who)} ${{ bowled: "b " + sn(b), lbw: "lbw b " + sn(b), caught: "c " + f + " b " + sn(b), cb: "c " + f + " b " + sn(b), stumped: "st " + f + " b " + sn(b), runout: "run out (" + f + ")" }[w.how] || ""}`;
  }

  // ---------------- drawing: the pitch seen from behind the bowler ----------------
  const sc = (d) => 1 / (1 + 0.075 * d), PX = 105;
  const proj = (lat, d, h) => { const s = sc(d); return [480 + lat * PX * s, 140 + 340 * s - (h || 0) * PX * s]; };
  const crowd = []; { let a = 7; const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; for (let i = 0; i < 520; i++) crowd.push([rnd() * W, 54 + rnd() * 90, rnd(), rnd()]); }
  function drawPitchBg(t) {
    const g = ctx.createLinearGradient(0, 0, 0, 160); g.addColorStop(0, "#7cc2ff"); g.addColorStop(1, "#cfeaff"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 160);
    ctx.fillStyle = "#2a2f45"; ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(0, 40); ctx.quadraticCurveTo(480, 6, W, 40); ctx.lineTo(W, 150); ctx.closePath(); ctx.fill();
    const cols = ["#e5503c", "#ffd23f", "#4aa8f0", "#f1f1f1", "#7df08f", "#ff9f1c"];
    for (const [x, y, a, b] of crowd) { ctx.fillStyle = cols[Math.floor(a * cols.length)]; ctx.globalAlpha = 0.75; const wob = Math.sin(t * 0.004 + x) * (banner ? 2.5 : 0.6); ctx.fillRect(x, y + wob, 4, 5); } ctx.globalAlpha = 1;
    ctx.fillStyle = "#1a1d2e"; ctx.fillRect(0, 140, W, 14);
    ctx.fillStyle = "rgba(255,255,255,.1)"; for (let i = 0; i < 6; i++) ctx.fillRect(40 + i * 160, 100, 3, 44);
    const gg = ctx.createLinearGradient(0, 150, 0, H); gg.addColorStop(0, "#2f8f45"); gg.addColorStop(1, "#1f6b30"); ctx.fillStyle = gg; ctx.fillRect(0, 154, W, H - 154);
    for (let i = 0; i < 10; i++) { const y0 = 154 + Math.pow(i / 10, 1.6) * (H - 154), y1 = 154 + Math.pow((i + 1) / 10, 1.6) * (H - 154); if (i % 2) { ctx.fillStyle = "rgba(0,0,0,.06)"; ctx.fillRect(0, y0, W, y1 - y0); } }
    const p = [proj(-1.525, -1.2, 0), proj(1.525, -1.2, 0), proj(1.525, 22, 0), proj(-1.525, 22, 0)];
    ctx.fillStyle = sim && sim.pitch.id === "green" ? "#a8b878" : sim && sim.pitch.id === "dusty" ? "#d9b57a" : "#cfae78";
    ctx.beginPath(); ctx.moveTo(...p[0]); for (const q of p.slice(1)) ctx.lineTo(...q); ctx.closePath(); ctx.fill();
    if (sim) { ctx.strokeStyle = "rgba(90,60,30," + (0.1 + sim.wear * 0.4) + ")"; ctx.lineWidth = 1; for (let i = 0; i < 6 + sim.wear * 26; i++) { const d = 3 + ((i * 37) % 17), l = ((i * 53) % 21) / 10 - 1; const a = proj(l, d, 0), b = proj(l + 0.1, d + 0.7, 0); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); } }
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 2;
    const line = (l1, d1, l2, d2) => { const a = proj(l1, d1, 0), b = proj(l2, d2, 0); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); };
    line(-1.8, 1.2, 1.8, 1.2); line(-1.8, 19.2, 1.8, 19.2); line(-1.3, -1.2, -1.3, 1.2); line(1.3, -1.2, 1.3, 1.2);
  }
  function drawStumps(d, flown, t) {
    const s = sc(d), w = 0.114;
    for (const dx of [-w, 0, w]) {
      const a = proj(dx, d, 0), b = proj(dx, d, 0.71); ctx.strokeStyle = "#f6e7c1"; ctx.lineWidth = Math.max(1.5, 5 * s);
      ctx.save(); if (flown) { ctx.translate(dx * 260 * flown + 0, -flown * 40 * (1 - flown * 0.2)); ctx.translate(a[0], a[1]); ctx.rotate(dx * 9 * flown + flown * 1.2); ctx.translate(-a[0], -a[1]); }
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.restore();
    }
    if (!flown) { const a = proj(-w, d, 0.71), b = proj(w, d, 0.71); ctx.strokeStyle = "#c9971a"; ctx.lineWidth = Math.max(1.5, 4 * s); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
  }
  function tungAt(x, y, h, o) { TA.draw(ctx, x, y - h * 0.45, h, o); }
  function ballPos(e, del) {
    const F = del.flight, t = clamp(e / F, 0, 1), latPx = 0.67;
    const bounceD = del.full ? null : 1 + 11 * Math.pow(del.v, 0.9), hArr = del.full ? 0.8 : 0.05 + 1.55 * del.v;
    const lat0 = (del.u - 2.2 * (del.swing || 0)) * latPx * 0.6, latB = del.u * latPx, latE = del.uEff * latPx;
    if (bounceD == null) return { lat: lerp(lat0, latE, t), d: lerp(21, 1.2, t), h: lerp(2.2, hArr, t) + Math.sin(Math.PI * t) * 0.15 };
    const tb = (21 - bounceD) / 20;
    if (t < tb) { const s = t / tb; return { lat: lerp(lat0, latB, ease(s)), d: lerp(21, bounceD, s), h: 2.2 * (1 - s * s) }; }
    const s = (t - tb) / (1 - tb); return { lat: lerp(latB, latE, s), d: lerp(bounceD, 1.2, s), h: hArr * s + 0.3 * Math.sin(Math.PI * s) * (1 - s), bounced: true };
  }
  function batAngle(e) {
    if (!anim || anim.swingE == null) return 0.5;
    const s = e - anim.swingE;
    if (s < -0.22) return 0.5; if (s < 0) return lerp(0.5, -0.7, (s + 0.22) / 0.22);
    if (s < 0.3) return lerp(-0.7, 2.4, Math.pow(s / 0.3, 1.5)); return lerp(2.4, 1.1, clamp((s - 0.3) / 1.2, 0, 1));
  }
  function drawPitchView(now) {
    drawPitchBg(now);
    const i = I(), st = anim && anim.st, e = st ? st.e : 0;
    const flown = anim && anim.res && anim.res.wkt && anim.res.wkt.how === "bowled" && st && (st.s === "contact" || st.s === "ball" || st.s === "after") ? clamp((e - anim.del.flight) / 0.6, 0, 1) : 0;
    drawStumps(20.1, 0); drawStumps(0, flown);
    // the bowler
    const bw = i ? P(i.bowl, i.bowler >= 0 ? i.bowler : 0) : null, bt = i ? i.bowl : 1;
    let bd = 24.5, bob = 0;
    if (anim) { const k = clamp(e / 0.5, 0, 1); bd = lerp(24.5, 20.6, ease(k)); bob = Math.sin(e * 20) * 2 * (1 - k); } else if (i && sim.phase === "flight") bd = 20.6;
    const bp = proj(0.4, bd, 0); tungAt(bp[0], bp[1] + bob, 1.75 * PX * sc(bd), { pal: palOf(bt), gear: i && i.bowl === my ? gearOf(my) : gearOf(bt), parts: { legs: 1, armFar: 1, face: 1 }, look: [0, 0.3], mouth: "open", legs: now / 140 });
    // the batter
    const bsp = proj(-0.85, 1.2, 0), bh = 1.75 * PX * sc(1.2), bat = i ? i.bat : 0;
    if (anim && st && (st.s === "flight" || st.s === "wait" || st.s === "contact")) { /* swing handled by batAngle */ }
    tungAt(bsp[0], bsp[1], bh, { pal: palOf(bat), gear: gearOf(bat), bat: batAngle(e), look: [0.3, -0.4], mouth: "smile", eyes: "normal" });
    // the timing ring on the bat while the ball is on its way
    if (anim && anim.del && (st.s === "flight")) {
      const F = anim.del.flight, k = clamp(e / F, 0, 1), c = proj(-0.2, 1.2, 0.6), rad = lerp(95, 18, k);
      ctx.save(); ctx.lineWidth = 4; ctx.strokeStyle = iAmBat() ? "rgba(255,230,120,.9)" : "rgba(255,255,255,.3)"; ctx.beginPath(); ctx.arc(c[0], c[1], rad, 0, 7); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.beginPath(); ctx.arc(c[0], c[1], 18, 0, 7); ctx.stroke(); ctx.restore();
    }
    // the ball
    if (anim && st) {
      let bp2 = null;
      if (st.s === "flight") bp2 = ballPos(e, anim.del); else if (st.s === "wait" || st.s === "contact") bp2 = ballPos(anim.del.flight, anim.del);
      if (bp2 && !(st.s === "contact" && anim.res && anim.res.shot && !anim.res.beaten && !anim.res.leave && e - anim.del.flight > 0.1)) {
        const a = proj(bp2.lat, bp2.d, bp2.h), g = proj(bp2.lat, bp2.d, 0), s = sc(bp2.d), r = clamp(0.085 * PX * s * 1.5, 3, 14);
        ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(g[0], g[1], r * 1.1, r * 0.4, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#d8342a"; ctx.beginPath(); ctx.arc(a[0], a[1], r, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(a[0], a[1], r * 0.7, 0.3, 2.2); ctx.stroke();
      }
    } else if (i && sim.phase === "bowl" && iAmBowl()) { // the aiming spot
      const d = 1 + 11 * Math.pow(sel.v, 0.9), p = proj(sel.u * 0.67, d, 0), s = sc(d);
      ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(p[0], p[1], 22 * s * 1.6, 9 * s * 1.6, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p[0] - 10, p[1]); ctx.lineTo(p[0] + 10, p[1]); ctx.moveTo(p[0], p[1] - 5); ctx.lineTo(p[0], p[1] + 5); ctx.stroke();
    }
    // the length zones, while the bowler is choosing
    if (i && sim.phase === "bowl" && iAmBowl() && !anim) {
      const zones = [["yorker", 0, 1.1], ["full", 1.1, 3.4], ["good", 3.4, 6.4], ["short", 6.4, 8.6], ["bouncer", 8.6, 12]];
      ctx.font = "11px sans-serif"; ctx.fillStyle = "rgba(255,255,255,.6)"; for (const [n, d0, d1] of zones) { const p = proj(1.7, 1 + (d0 + d1) / 2, 0); ctx.fillText(n, p[0] + 6, p[1] + 3); const q = proj(-1.5, 1 + d0 + 0.2, 0), q2 = proj(1.5, 1 + d0 + 0.2, 0); ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(...q); ctx.lineTo(...q2); ctx.stroke(); }
    }
  }

  // ---------------- drawing: the field from above ----------------
  const FK = 3.7, FC = [480, 276];
  const fpt = (a, r) => { const [x, y] = S.xy(a, r); return [FC[0] + x * FK, FC[1] + y * FK]; };
  function drawFieldBg() {
    ctx.fillStyle = "#101a14"; ctx.fillRect(0, 0, W, H);
    const R = S.BOUNDARY * FK;
    for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? "#2f8f45" : "#2a8140"; ctx.beginPath(); ctx.arc(FC[0], FC[1], R * (1 - i / 12), 0, 7); ctx.fill(); }
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(FC[0], FC[1], R, 0, 7); ctx.stroke();
    ctx.setLineDash([6, 8]); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(FC[0], FC[1], S.CIRCLE * FK, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = sim && sim.pitch.id === "dusty" ? "#d9b57a" : "#cfae78"; ctx.fillRect(FC[0] - 1.5 * FK, FC[1] - 11 * FK, 3 * FK, 22 * FK);
    ctx.fillStyle = "#f6e7c1"; ctx.fillRect(FC[0] - 5, FC[1] - 10 * FK - 3, 10, 6); ctx.fillRect(FC[0] - 5, FC[1] + 10 * FK - 3, 10, 6);
  }
  function drawFielders(list, hi, small) {
    const i = I(); if (!i) return;
    const items = list || S.fielders(sim);
    for (const f of items) {
      const [x, y] = fpt(f.a, f.r), h = f.role === "keeper" ? 38 : 34;
      ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x, y + h * 0.42, 11, 4, 0, 0, 7); ctx.fill();
      tungAt(x, y + h * 0.45, h, { pal: palOf(i.bowl), parts: { legs: 1, armFar: 1, face: 1 }, look: [0, 0.3] });
      if (hi === f.i) { ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.stroke(); }
      if (small) { ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = "10px sans-serif"; ctx.textAlign = "center"; ctx.fillText(posName(f.a, f.r), x, y + h * 0.45 + 12); ctx.textAlign = "left"; }
    }
  }
  function drawBatters() {
    const i = I(); if (!i) return;
    const sp = fpt(180, 9), np2 = fpt(0, 9);
    if (i.striker >= 0) tungAt(sp[0] - 14, sp[1] + 4, 40, { pal: palOf(i.bat), gear: gearOf(i.bat), bat: 0.6 });
    if (i.non >= 0) tungAt(np2[0] + 12, np2[1], 34, { pal: palOf(i.bat), parts: { legs: 1, armFar: 1, face: 1 } });
  }
  function drawField(now) {
    drawFieldBg();
    const i = I(), st = anim && anim.st;
    if (edit.on) {
      const list = edit.f.map((p, k) => ({ i: -1 - k, a: p[0], r: p[1], role: "field", fld: 70, k }));
      list.unshift({ i: -99, a: 0, r: 11, role: "bowler", fld: 70 }, { i: -98, a: 180, r: 13, role: "keeper", fld: 70 });
      drawFielders(list, edit.drag >= 0 ? -1 - edit.drag : null, true); drawBatters();
      const out = S.outsideCount(edit.f), mx = S.maxOutside(sim);
      ctx.fillStyle = out > mx ? "#ff6b5b" : "#fff"; ctx.font = "bold 16px sans-serif"; ctx.fillText(`Outside the ring: ${out} / ${mx} ${S.isPP(sim) ? "(powerplay)" : ""}`, 14, 26); ctx.font = "13px sans-serif"; ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fillText("Drag a fielder to move him.", 14, 46);
      return;
    }
    drawFielders(null, anim && anim.res && anim.res.live ? anim.res.live.fielder : (anim && anim.res && anim.res.path && anim.res.path.by >= 0 ? anim.res.path.by : null), false); drawBatters();
    if (anim && anim.res && anim.res.path && st && (st.s === "ball" || st.s === "after")) {
      const p = anim.res.path, A = p.a, D = p.six ? Math.max(p.d, S.BOUNDARY + 8) : p.d, k = st.s === "ball" ? ease(st.p) : 1, sp = fpt(180, 9), ep = fpt(A, D);
      const bx = lerp(sp[0], ep[0], k), by = lerp(sp[1], ep[1], k), arc = p.air ? Math.sin(Math.PI * (st.s === "ball" ? st.p : 1)) * (30 + p.d * 1.3) : 0;
      ctx.strokeStyle = anim.res.six ? "#c58bff" : anim.res.four ? "#7ee08f" : "rgba(255,255,255,.55)"; ctx.lineWidth = anim.res.six || anim.res.four ? 4 : 2; ctx.setLineDash(p.air ? [4, 6] : []);
      ctx.beginPath(); ctx.moveTo(sp[0], sp[1]); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      const showBall = !(p.caught && st.s === "after");
      if (showBall) { ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(bx, by, 6, 3, 0, 0, 7); ctx.fill(); ctx.fillStyle = "#d8342a"; ctx.beginPath(); ctx.arc(bx, by - arc, 6, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke(); }
      if (p.caught && st.s !== "flight") { const f = S.fielders(sim).find((q) => q.i === p.by); if (f) { const [fx, fy] = fpt(f.a, f.r); ctx.strokeStyle = "#ff6b5b"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(fx, fy, 24, 0, 7); ctx.stroke(); } }
    }
    if (sim.phase === "runs" && anim && anim.res && anim.res.live) { // the runners and the run choices
      const L = anim.res.live; ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(14, 12, 300, 54); ctx.fillStyle = "#fff"; ctx.font = "bold 15px sans-serif"; ctx.fillText(`Ball back in about ${L.tf.toFixed(1)}s`, 24, 34); ctx.font = "13px sans-serif"; ctx.fillStyle = "#cfe"; ctx.fillText(`${L.safe} run${L.safe === 1 ? "" : "s"} look safe. You can take up to ${L.cap}.`, 24, 54);
    }
  }
  function drawLineup(now) {
    drawPitchBg(now);
    for (const t of [0, 1]) {
      const x0 = t ? 640 : 70, dir = t ? -1 : 1;
      for (let k = 0; k < 5; k++) { const x = x0 + dir * 0 + (t ? k * 52 : k * 52), y = 470 - (k % 2) * 26, h = 120 - (k % 2) * 10; tungAt(x + 70, y, h, { pal: palOf(t), gear: k === 2 ? gearOf(t) : null, flip: !!t, parts: k === 2 ? undefined : { legs: 1, armFar: 1, face: 1 }, mouth: "smile", look: [t ? -0.5 : 0.5, 0.1], legs: 0 }); }
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(t ? 560 : 40, 120, 360, 62); ctx.fillStyle = sim.teams[t].color; ctx.fillRect(t ? 560 : 40, 120, 8, 62);
      ctx.fillStyle = "#fff"; ctx.font = "bold 24px sans-serif"; ctx.fillText(sim.teams[t].name, (t ? 560 : 40) + 22, 150); ctx.font = "13px sans-serif"; ctx.fillStyle = "#cfe"; ctx.fillText(sim.names[t] + " · " + sim.teams[t].blurb, (t ? 560 : 40) + 22, 172);
    }
    ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(310, 345, 340, 70); ctx.fillStyle = "#ffd23f"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center"; ctx.fillText(sim.pitch.name + " · " + sim.weather.name, 480, 373); ctx.fillStyle = "#fff"; ctx.font = "13px sans-serif"; ctx.fillText(sim.pitch.note.slice(0, 52), 480, 395); ctx.fillText(sim.cfg.overs + " overs each", 480, 411); ctx.textAlign = "left";
  }
  function drawBigText(t) {
    if (!sim) return;
    if (sim.phase === "toss" || (sim.phase === "tosspick" && coin && performance.now() - coin.t0 < 2500)) {
      const k = coin ? clamp((performance.now() - coin.t0) / 1600, 0, 1) : 0, c = FC;
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, 0, W, H);
      const sc2 = Math.abs(Math.cos(k * 14)) * (1 - k) + k, y = c[1] - Math.sin(k * Math.PI) * 120;
      ctx.save(); ctx.translate(c[0], y); ctx.scale(1, Math.max(0.06, sc2)); ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = "#a8781a"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 54, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#7a5a0a"; ctx.font = "bold 40px sans-serif"; ctx.textAlign = "center"; ctx.fillText(coin && k > 0.95 ? (coin.coin === "h" ? "H" : "T") : "🪙", 0, 14); ctx.restore();
    }
  }

  // ---------------- the frame ----------------
  function useField() {
    if (!sim) return true;
    if (edit.on) return true;
    if (anim && anim.st) return anim.st.s === "ball" || anim.st.s === "after";
    const ph = sim.phase; return !(ph === "bowl" || ph === "flight");
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const now = performance.now(), dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016); last = now;
    if (!sim) return;
    if (role !== "guest") { S.tick(sim, dt); flush(); }
    pump(); animTick(now);
    if (sim.phase === "done" && !finished && !animBusy()) finishMatch();
    const key = ctlKey(); if (key !== ckey) { ckey = key; renderCtl(); renderBoard(); }
    updateTimer();
    if (!I()) drawLineup(now); else if (useField()) drawField(now); else drawPitchView(now);
    drawBigText(now); drawAim();
  }
  const ctlKey = () => `${sim.phase}|${sim.n}|${animBusy() ? 1 : 0}|${edit.on ? 1 : 0}|${pickBox ? 1 : 0}|${sim.phase === "done" ? 1 : 0}`;
  function updateTimer() {
    const el = $("tm"); if (!el || !sim) return;
    const i = I(), lim = { runs: 9, review: 8, bowl: 30, pickBowler: 45, newbat: 25 }[sim.phase];
    let f = 1;
    if (sim.phase === "flight" && anim) f = 1 - clamp(((performance.now() - anim.t0) / 1000) / (anim.del.flight + 1.4), 0, 1);
    else if (lim && sim.cfg.timers) f = 1 - clamp(sim.t / lim, 0, 1); else if (sim.phase === "runs" || sim.phase === "review") f = 1;
    el.style.width = f * 100 + "%"; void i;
  }

  // ---------------- the scoreboard ----------------
  function chip(l) { const c = /^W/.test(l) ? "w" : /Wd|Nb/.test(l) ? "x" : l === "6" ? "s" : l === "4" ? "f" : ""; return `<i class="${c}">${l}</i>`; }
  function renderBoard() {
    if (!sim) return; const i = I(), el = $("board");
    if (!i) { el.innerHTML = `<div class="cx-score"><span class="tm"><i style="background:${teamCol(0)}"></i>${esc(sim.teams[0].name)}</span><span class="mid">v</span><span class="tm"><i style="background:${teamCol(1)}"></i>${esc(sim.teams[1].name)}</span><span class="grow"></span><span class="chip2">${esc(sim.pitch.name)}</span><span class="chip2">${esc(sim.weather.name)}</span></div>`; return; }
    const s = S.status(sim), chipsH = [];
    if (s.pp) chipsH.push(`<span class="chip2 pp">Powerplay</span>`); if (s.free) chipsH.push(`<span class="chip2 hot">FREE HIT</span>`); if (i.so) chipsH.push(`<span class="chip2 hot">Super over</span>`);
    chipsH.push(`<span class="chip2">${esc(sim.pitch.name)}</span><span class="chip2">${esc(sim.weather.name)}${sim.dewOn ? " + dew" : ""}</span>`);
    const target = s.target != null ? `<span class="mid">Need <b>${s.need}</b> from <b>${s.left}</b> balls · RRR <b>${s.rrr}</b></span>` : `<span class="mid">Projected <b>${s.proj}</b></span>`;
    const bat = (id, star) => { if (id < 0) return ""; const b = i.bats[id], p = P(i.bat, id); return `<span>${star ? '<span class="st">▶</span> ' : ""}${esc(sn(p.name))} <b>${b.r}</b> (${b.b})</span>`; };
    const bw = i.bowler >= 0 ? (() => { const b = i.bowls[i.bowler] || { b: 0, r: 0, w: 0 }; return `<span>🎯 ${esc(sn(P(i.bowl, i.bowler).name))} <b>${S.oversText(b.b)}-${b.m || 0}-${b.r}-${b.w}</b></span>`; })() : "";
    const ov = i.over ? i.over.balls.map(chip).join("") : "";
    const maxOv = i.so ? 1 : sim.cfg.maxOv;
    el.innerHTML = `<div class="cx-score"><span class="tm"><i style="background:${teamCol(i.bat)}"></i>${esc(sim.teams[i.bat].short)}</span><span class="big">${i.runs}/${i.wkts}</span><span class="mid">(${s.overs} / ${i.overs}) · CRR <b>${s.crr}</b></span>${target}<span class="grow"></span>${chipsH.join("")}</div>
      <div class="cx-lines">${bat(i.striker, true)}${bat(i.non, false)}${bw}<span class="grow"></span><span>This over <span class="balls">${ov || "-"}</span></span><span class="rt">Reviews: bat ${i.revs} · field ${i.bowlRevs == null ? 1 : i.bowlRevs} · max ${maxOv} ov each</span></div>`;
  }

  // ---------------- the control panel ----------------
  const ctl = $("ctl");
  const waiting = (t) => `<p class="hint">${t}</p>`;
  const timer = `<div class="cx-timer"><i id="tm"></i></div>`;
  function shotPanel(canSwing) {
    const i = I(), btns = S.SHOT_IDS.map((id) => { const sh = S.SHOTS[id]; return `<button class="cx-btn${sel.shot === id ? " on" : ""}" data-a="shot:${id}" title="${esc(sh.d)}"><kbd>${sh.key}</kbd>${sh.n}<small>${esc(sh.d)}</small></button>`; }).join("");
    return `<div class="cx-two"><div><h3>🏏 You are batting${i && i.free ? " · FREE HIT!" : ""}</h3><div class="cx-row">${btns}</div>
      <div class="cx-row" style="margin-top:.4rem"><button class="cx-btn${sel.air ? " on" : ""}" data-a="air"><kbd>L</kbd>Lofted<small>More distance, more risk of a catch</small></button><button class="cx-btn${sel.step ? " on" : ""}" data-a="step"><kbd>S</kbd>Step out<small>Come down the track. Stumped if you miss</small></button>
      <button class="cx-btn go" data-a="swing" ${canSwing ? "" : "disabled"}>SWING! <kbd>Space</kbd></button></div>
      <p class="hint">Pick a shot that suits the ball, aim it into a gap on the little field, then press <b>Space</b> (or click the pitch) just as the ring closes on the ball.</p>${timer}</div><canvas id="aim" width="210" height="210"></canvas></div>`;
  }
  function bowlPanel() {
    const i = I(), B = P(i.bowl, i.bowler), list = S.kindsFor(B), ft = sim.fat[i.bowl + ":" + B.id] || 0;
    if (!sel.kind || !list.includes(sel.kind)) { sel.kind = list[0]; sel.u = S.KINDS[sel.kind].u; sel.v = S.KINDS[sel.kind].v; }
    const btns = list.map((k) => { const K = S.KINDS[k]; return `<button class="cx-btn${sel.kind === k ? " on" : ""}" data-a="kind:${k}" title="${esc(K.d)}">${K.n}<small>${esc(K.d)}</small></button>`; }).join("");
    const bncOk = i.bounc < 2;
    return `<h3>🎯 You are bowling: ${esc(B.name)} <span class="rt">${S.BT_NAME[B.bt]} · accuracy <b>${B.acc}</b> · tiredness <b>${Math.round(ft * 100)}%</b> · over ${Math.floor(i.balls / 6) + 1}, ball ${(i.over ? i.over.balls.filter((b) => !/Wd|Nb/.test(b)).length : 0) + 1}${bncOk ? "" : " · NO MORE BOUNCERS THIS OVER"}</span></h3>
      <div class="cx-row">${btns}</div>
      <div class="cx-slider"><span>Effort</span><input type="range" id="eff" min="0" max="100" value="${Math.round(sel.eff * 100)}"><span class="rt">Harder = quicker but less accurate and more tiring. Over-stepping gives a no-ball.</span></div>
      <div class="cx-row" style="margin-top:.5rem"><button class="cx-btn go" data-a="bowl" ${animBusy() ? "disabled" : ""}>BOWL! <kbd>Space</kbd></button><button class="cx-btn" data-a="editfield">🧤 Change the field</button></div>
      <p class="hint">Click the pitch to aim: left to right is the line (off stump on the right), further up is a fuller or shorter length. Watch the swing and the turn.</p>`;
  }
  function pickBowlerPanel() {
    const i = I(), opts = S.bowlerOptions(sim).sort((a, b) => b.p.bowl - a.p.bowl);
    const cards = opts.map((o) => { const p = o.p, ft = Math.round((sim.fat[i.bowl + ":" + p.id] || 0) * 100); return `<button class="cx-btn" data-a="bowler:${p.id}" ${o.ok ? "" : "disabled"}><b>${esc(p.name)}</b><small>${S.BT_NAME[p.bt]} · bowling ${p.bowl} · acc ${p.acc} · ${o.ov} ov bowled, ${Math.max(0, o.left)} left${ft ? " · tired " + ft + "%" : ""}${p.id === i.lastBowler ? " · bowled last over" : ""}</small></button>`; }).join("");
    const pre = Object.entries(S.FIELDS).map(([id, f]) => { const ok = S.outsideCount(f.f) <= S.maxOutside(sim); return `<button class="cx-btn${sim.fieldName === id || sel.preset === id ? " on" : ""}" data-a="preset:${id}" ${ok ? "" : "disabled"} title="${esc(f.note)}">${f.n}<small>${esc(f.note)}${ok ? "" : " (not allowed in the powerplay)"}</small></button>`; }).join("");
    return `<h3>🧢 Over ${Math.floor(i.balls / 6) + 1}: choose your bowler</h3><div class="cx-row">${cards}</div><h3 style="margin-top:.6rem">🧤 Field: <span class="rt">${sim.fieldName === "custom" ? "custom" : esc((S.FIELDS[sim.fieldName] || {}).n || "")}</span></h3><div class="cx-row">${pre}<button class="cx-btn" data-a="editfield">✏️ Place the fielders yourself</button></div>
      <p class="hint">${S.isPP(sim) ? "Powerplay: only 2 fielders may be outside the ring." : "No more than 5 fielders outside the ring."} Pace likes the new ball and a green pitch, spin takes over as the pitch wears.</p>${sim.cfg.timers ? timer : ""}`;
  }
  function setupPanel() {
    const t = sim.teams[my], mine = my, rows = t.order.map((id, k) => { const p = t.players[id]; return `<div><b>${k + 1}</b><span>${esc(p.name)} <span class="rt">${p.role}${p.canBowl ? " · " + S.BT_NAME[p.bt] : ""}${p.wk ? " · keeper" : ""}</span></span><span class="rt">bat <b>${p.bat}</b> pow <b>${p.pow}</b> bowl <b>${p.bowl}</b> fld <b>${p.fld}</b></span><span><button data-a="up:${k}" ${k && !sim.ready[mine] ? "" : "disabled"}>▲</button><button data-a="down:${k}" ${k < 10 && !sim.ready[mine] ? "" : "disabled"}>▼</button></span></div>`; }).join("");
    const opp = sim.teams[1 - my], I1 = sim.toss.choice === "bat" ? sim.toss.winner : 1 - sim.toss.winner;
    return `<h3>📋 ${esc(t.name)}: set your batting order</h3><div class="cx-two"><div class="order">${rows}</div><div style="max-width:300px"><p class="rt"><b>${esc(sim.pitch.name)}</b>: ${esc(sim.pitch.note)}<br><b>${esc(sim.weather.name)}</b>${sim.weather.swing > 0.35 ? ": the ball will swing." : "."}<br>${esc(sim.names[I1])} bat first.<br>Opponents: <b>${esc(opp.name)}</b></p><button class="cx-btn go" data-a="ready" ${sim.ready[my] ? "disabled" : ""}>${sim.ready[my] ? "Waiting for the other side…" : "READY"}</button></div></div>`;
  }
  function renderCtl() {
    if (!sim) return;
    if (pickBox) { ctl.innerHTML = `<h3>Pick your team</h3><div class="teamgrid" id="pickGrid"></div><p class="hint">${picks.mine ? "Waiting for your opponent to pick…" : "Choose a side, then the match starts."}</p>`; teamCards($("pickGrid"), (id) => pickTeam(id), picks.mine); return; }
    const ph = sim.phase, i = I(), who = ph === "done" ? -1 : S.phaseSide(sim), mine = who === my, busy = animBusy();
    let h = "";
    if (edit.on) h = `<h3>🧤 Place your fielders</h3><div class="cx-row">${Object.entries(S.FIELDS).map(([id, f]) => `<button class="cx-btn" data-a="editpreset:${id}">${f.n}</button>`).join("")}</div><div class="cx-row" style="margin-top:.5rem"><button class="cx-btn go" data-a="fieldok">✔ Use this field</button><button class="cx-btn" data-a="fieldcancel">Cancel</button></div>`;
    else switch (ph) {
      case "toss": h = mine ? `<h3>🪙 You call the toss</h3><div class="cx-row"><button class="cx-btn go" data-a="call:h">Heads</button><button class="cx-btn go" data-a="call:t">Tails</button></div>` : waiting(`${esc(sim.names[sim.toss.caller])} is calling the toss…`); break;
      case "tosspick": h = mine ? `<h3>🏆 You won the toss</h3><div class="cx-row"><button class="cx-btn go" data-a="choose:bat">Bat first</button><button class="cx-btn go" data-a="choose:bowl">Bowl first</button></div><p class="hint">${esc(sim.pitch.note)} ${sim.weather.swing > 0.35 ? "It is " + sim.weather.name.toLowerCase() + ": the ball should swing." : ""}</p>` : waiting(`${esc(sim.names[sim.toss.winner])} won the toss and is choosing…`); break;
      case "setup": h = setupPanel(); break;
      case "pickBowler": h = i.bowl === my ? pickBowlerPanel() : waiting(`${esc(sim.names[i.bowl])} is choosing the bowler and setting the field…`) + (i.bat === my ? "" : ""); break;
      case "bowl": h = i.bowl === my ? bowlPanel() : shotPanel(false); break;
      case "flight": h = i.bat === my ? shotPanel(true) : waiting("The ball is on its way…" + "") + timer; break;
      case "runs": { const L = anim && anim.res && anim.res.live ? anim.res.live : sim.pend && sim.pend.r.live; if (i.bat === my && L) { const T = (k) => L.t1 + (k - 1) * L.tn + 0.2; h = `<h3>🏃 How many runs?</h3><div class="cx-row"><button class="cx-btn" data-a="runs:0"><kbd>0</kbd>Stay put<small>No risk</small></button>${[1, 2, 3].map((n) => `<button class="cx-btn ${n <= L.safe ? "safe" : T(n) < L.tf + 0.35 ? "risky" : "danger"}" data-a="runs:${n}" ${n > L.cap ? "disabled" : ""}><kbd>${n}</kbd>${n} run${n > 1 ? "s" : ""}<small>${n <= L.safe ? "Safe" : T(n) < L.tf + 0.35 ? "Risky" : "Very risky: run out?"}</small></button>`).join("")}<button class="cx-btn go" data-a="runs:${L.safe}">Safe: ${L.safe} <kbd>Enter</kbd></button></div>${timer}`; } else h = waiting("The batters are deciding whether to run…"); break; }
      case "review": h = mine ? `<h3>📺 ${sim.pend.r.dec.initial ? "You've been given out" : "Not out was the decision"}</h3><div class="cx-row"><button class="cx-btn go" data-a="review:y"><kbd>R</kbd>Review it</button><button class="cx-btn" data-a="review:n"><kbd>N</kbd>Accept</button></div><p class="hint">A successful review overturns the umpire. Lose it and you have no more. Umpire's call means the decision stands but you keep the review.</p>${timer}` : waiting("The other side is thinking about a review…"); break;
      case "newbat": { const av = S.availableBatters(sim); h = i.bat === my ? `<h3>🚶 Who goes in next?</h3><div class="cx-row">${av.map((id) => { const p = P(i.bat, id); return `<button class="cx-btn" data-a="batter:${id}">${esc(p.name)}<small>${p.role} · bat ${p.bat} · power ${p.pow}</small></button>`; }).join("")}</div>` : waiting(`${esc(sim.names[i.bat])} is choosing the next batter…`); break; }
      case "break": h = `<h3>⏸️ Innings break</h3><p>${esc(sim.breakText || "")}</p><div class="cx-row"><button class="cx-btn go" data-a="go">${sim.nextInn && sim.nextInn.so ? "Super over!" : "Start the chase"}</button></div>`; break;
      case "hold": h = waiting(esc((logLines[0] && logLines[0].text) || "")); break;
      case "done": h = `<h3>🏁 ${esc(sim.result ? sim.result.text : "")}</h3>`; break;
      default: h = "";
    }
    ctl.innerHTML = h;
    const eff = $("eff"); if (eff) eff.oninput = () => { sel.eff = eff.value / 100; };
    if (ph === "bowl" && i && i.bat === my && I().bat === my) { /* nothing */ }
  }
  ctl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"); if (!b || b.disabled) return; snd("tick"); doAction(b.dataset.a);
  });
  function doAction(a) {
    const [k, v] = a.split(":"), i = I();
    switch (k) {
      case "call": submit({ t: "call", v }); break; case "choose": submit({ t: "choose", v }); break; case "ready": submit({ t: "ready" }); break;
      case "up": case "down": { const o = sim.teams[my].order.slice(), x = +v, y = k === "up" ? x - 1 : x + 1; if (y < 0 || y > 10) break; [o[x], o[y]] = [o[y], o[x]]; submit({ t: "order", order: o }); break; }
      case "bowler": { const id = +v; submit({ t: "bowler", i: id }); if (sel.preset) submit({ t: "field", preset: sel.preset }); else if (sim.fieldName !== "custom" || !S.validField(sim, sim.field)) submit({ t: "field", preset: S.aiFieldChoice ? "balanced" : "balanced" }); break; }
      case "preset": sel.preset = v; if (sim.phase === "bowl") submit({ t: "field", preset: v }); else { submit({ t: "field", preset: v }); } ckey = ""; break;
      case "editfield": edit = { on: true, f: sim.field.map((p) => p.slice()), drag: -1 }; ckey = ""; break;
      case "editpreset": edit.f = S.FIELDS[v].f.map((p) => p.slice()); break;
      case "fieldok": if (S.validField(sim, edit.f)) { submit({ t: "field", f: edit.f }); sel.preset = null; edit.on = false; ckey = ""; } else setBanner("Too many outside the ring", "", "#ff6b5b"); break;
      case "fieldcancel": edit.on = false; ckey = ""; break;
      case "kind": sel.kind = v; sel.u = S.KINDS[v].u; sel.v = S.KINDS[v].v; ckey = ""; renderCtl(); break;
      case "bowl": if (!animBusy() && sim.phase === "bowl" && i.bowl === my) { submit({ t: "deliver", kind: sel.kind, u: +sel.u.toFixed(2), v: +sel.v.toFixed(2), eff: +sel.eff.toFixed(2) }); busyUntil = performance.now() + 400; } break;
      case "shot": sel.shot = v; sel.ang = null; renderCtl(); break;
      case "air": sel.air = !sel.air; renderCtl(); break; case "step": sel.step = !sel.step; renderCtl(); break;
      case "swing": swing(); break;
      case "runs": submit({ t: "runs", n: +v }); break;
      case "review": submit({ t: "review", v: v === "y" }); break;
      case "batter": submit({ t: "batter", i: +v }); break;
      case "go": submit({ t: "go" }); break;
    }
  }
  function swing() {
    const i = I(); if (!sim || sim.phase !== "flight" || !i || i.bat !== my || !anim || anim.swingE != null || !sim.pend || anim.del !== sim.pend.del) return;
    const e = performance.now() - anim.t0;
    if (sel.shot === "leave") { submit({ t: "noswing" }); anim.swingE = null; return; }
    anim.swingE = e / 1000; snd("whoosh");
    const sh = S.SHOTS[sel.shot], ang = sel.ang == null ? sh.c : sel.ang;
    submit({ t: "swing", type: sel.shot, ang: Math.round(ang), air: sel.air, step: sel.step, at: Math.round(e) });
  }

  // ---------------- input ----------------
  function cvPoint(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; }
  cv.addEventListener("pointerdown", (e) => {
    if (!sim) return; const [x, y] = cvPoint(e); mouse = [x, y];
    if (edit.on) { let best = -1, bd = 26; edit.f.forEach((p, k) => { const [fx, fy] = fpt(p[0], p[1]), d = Math.hypot(fx - x, fy - y); if (d < bd) { bd = d; best = k; } }); edit.drag = best; if (best >= 0) cv.setPointerCapture(e.pointerId); return; }
    const i = I(); if (!i) return;
    if (sim.phase === "bowl" && i.bowl === my && !useField()) { setAim(x, y); return; }
    if (sim.phase === "flight" && i.bat === my) swing();
  });
  cv.addEventListener("pointermove", (e) => {
    const [x, y] = cvPoint(e); mouse = [x, y];
    if (edit.on && edit.drag >= 0) { const dx = x - FC[0], dy = y - FC[1], r = clamp(Math.hypot(dx, dy) / FK, 7, S.BOUNDARY - 2), a = Math.atan2(dx, -dy) * 180 / Math.PI; edit.f[edit.drag] = [Math.round(a), Math.round(r)]; }
    else if (e.buttons && sim && sim.phase === "bowl" && iAmBowl() && !useField()) setAim(x, y);
  });
  cv.addEventListener("pointerup", () => { edit.drag = -1; });
  function setAim(x, y) { // invert the pitch projection: from a screen spot to a line and a length
    let best = null;
    for (let d = 1; d <= 12.2; d += 0.1) { const [, py] = proj(0, d, 0); if (!best || Math.abs(py - y) < best.e) best = { d, e: Math.abs(py - y) }; }
    const lat = (x - 480) / (PX * sc(best.d)), v = Math.pow(clamp((best.d - 1) / 11, 0, 1), 1 / 0.9);
    sel.u = clamp(lat / 0.67, -1, 1); sel.v = clamp(v, 0.0, 1);
  }
  addEventListener("keydown", (e) => {
    if (!sim || /input|select|textarea/i.test(e.target.tagName)) return; const i = I();
    if (e.code === "Space") { e.preventDefault(); if (sim.phase === "bowl" && i.bowl === my) doAction("bowl"); else if (sim.phase === "flight" && i.bat === my) swing(); else if (sim.phase === "break") doAction("go"); return; }
    if (i && i.bat === my && (sim.phase === "bowl" || sim.phase === "flight") && /^[1-9]$/.test(e.key)) { const id = S.SHOT_IDS.find((s) => S.SHOTS[s].key === e.key); if (id) { sel.shot = id; sel.ang = null; renderCtl(); } return; }
    if (e.key === "l" || e.key === "L") { sel.air = !sel.air; renderCtl(); } if (e.key === "s" || e.key === "S") { sel.step = !sel.step; renderCtl(); }
    if (sim.phase === "runs" && i.bat === my) { if (/^[0-3]$/.test(e.key)) submit({ t: "runs", n: +e.key }); else if (e.key === "Enter") { const L = anim && anim.res && anim.res.live; submit({ t: "runs", n: L ? L.safe : 1 }); } }
    if (sim.phase === "review" && sim.pend && sim.pend.reviewer === my) { if (e.key === "r" || e.key === "R") submit({ t: "review", v: true }); if (e.key === "n" || e.key === "N") submit({ t: "review", v: false }); }
  });
  // the little field you aim your shot on
  function drawAim() {
    const c = $("aim"); if (!c || !sim || !I()) return; const g = c.getContext("2d"), R = 94, C = [105, 105], k = R / S.BOUNDARY;
    g.clearRect(0, 0, 210, 210); g.fillStyle = "#14341c"; g.fillRect(0, 0, 210, 210); g.fillStyle = "#2f8f45"; g.beginPath(); g.arc(C[0], C[1], R, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
    g.setLineDash([3, 4]); g.beginPath(); g.arc(C[0], C[1], S.CIRCLE * k, 0, 7); g.stroke(); g.setLineDash([]); g.fillStyle = "#cfae78"; g.fillRect(C[0] - 2.5, C[1] - 10 * k * 1.3, 5, 10 * k * 2.6);
    const P2 = (a, r) => { const [x, y] = S.xy(a, r); return [C[0] + x * k, C[1] + y * k]; };
    const sh = S.SHOTS[sel.shot];
    if (sh && sh.c != null) { const a0 = sh.c - sh.h, a1 = sh.c + sh.h; g.fillStyle = "rgba(255,230,120,.25)"; g.beginPath(); g.moveTo(...P2(0, 0)); for (let a = a0; a <= a1; a += 4) g.lineTo(...P2(a, S.BOUNDARY)); g.closePath(); g.fill(); }
    for (const f of S.fielders(sim)) { const [x, y] = P2(f.a, f.r); g.fillStyle = f.role === "keeper" ? "#ffd23f" : "#ff7a6b"; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
    if (sel.ang != null || aimAt != null) { const a = sel.ang == null ? sh.c : sel.ang, [x, y] = P2(a, S.BOUNDARY * 0.9); g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.moveTo(...P2(0, 0)); g.lineTo(x, y); g.stroke(); g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    if (!c.dataset.on) { c.dataset.on = 1; const pick = (e) => { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) * 210 / r.width - C[0], y = (e.clientY - r.top) * 210 / r.height - C[1], a = Math.atan2(x, -y) * 180 / Math.PI, s2 = S.SHOTS[sel.shot]; if (!s2 || s2.c == null) return; const d = S.wrap(a - s2.c); sel.ang = Math.round(S.wrap(s2.c + clamp(d, -s2.h, s2.h))); aimAt = 1; }; c.addEventListener("pointermove", pick); c.addEventListener("pointerdown", pick); }
  }

  // ---------------- the match centre ----------------
  const sName = (t, id) => (id >= 0 ? sn(P(t, id).name) : "");
  function howOut(I2, id) {
    const o = I2.bats[id] && I2.bats[id].out; if (!o) return I2.bats[id] && I2.bats[id].in ? "not out" : "";
    const b = sName(I2.bowl, o.by), f = o.f >= 0 ? sName(I2.bowl, o.f) : "";
    return { bowled: "b " + b, lbw: "lbw b " + b, caught: "c " + f + " b " + b, cb: "c †" + f + " b " + b, stumped: "st †" + f + " b " + b, runout: "run out (" + f + ")" }[o.how] || o.how;
  }
  function cardHtml(I2, idx) {
    const t = I2.bat, rows = I2.order.map((id) => { const b = I2.bats[id]; if (!b) return null; return `<tr class="${b.out ? "out" : ""}"><td>${esc(P(t, id).name)}${I2.striker === id ? " *" : ""}</td><td class="how">${esc(howOut(I2, id))}</td><td><b>${b.r}</b></td><td>${b.b}</td><td>${b.f}</td><td>${b.s}</td><td>${b.b ? Math.round(b.r / b.b * 100) : "-"}</td></tr>`; }).filter(Boolean).join("");
    const dnb = I2.order.filter((id) => !I2.bats[id]).map((id) => sn(P(t, id).name)).join(", ");
    const bows = Object.keys(I2.bowls).map((k) => { const b = I2.bowls[k], p = P(I2.bowl, +k), ov = b.b / 6; return `<tr><td>${esc(p.name)}</td><td>${S.oversText(b.b)}</td><td>${b.m || 0}</td><td>${b.r}</td><td><b>${b.w}</b></td><td>${ov ? (b.r / ov).toFixed(1) : "-"}</td><td>${b.wd}/${b.nb}</td></tr>`; }).join("");
    const ex = I2.ex.wd + I2.ex.nb + I2.ex.b + I2.ex.lb;
    return `<div class="sc-h"><span>${esc(sim.teams[t].name)}${I2.so ? " (super over)" : ""}</span><span>${I2.runs}/${I2.wkts} (${S.oversText(I2.balls)} ov)</span></div>
      <table class="sc"><tr><th>Batter</th><th></th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr>${rows}<tr><td>Extras</td><td class="how" colspan="6">${ex} (wd ${I2.ex.wd}, nb ${I2.ex.nb}, b ${I2.ex.b}, lb ${I2.ex.lb})</td></tr></table>
      ${dnb ? `<p class="fow">Did not bat: ${esc(dnb)}</p>` : ""}<p class="fow">Fall of wickets: ${I2.fow.map((f) => `${f.w}-${f.runs} (${esc(sn(P(t, f.bat).name))}, ${f.ov} ov)`).join(", ") || "none"}</p>
      <table class="sc"><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th><th>Wd/Nb</th></tr>${bows}</table>`;
  }
  function manhattan(I2) {
    const ov = I2.overs_.slice(); if (I2.over && I2.over.balls.length) ov.push({ runs: I2.over.runs, w: I2.over.w, balls: I2.over.balls });
    const mx = Math.max(6, ...ov.map((o) => o.runs));
    return `<div class="manh">${ov.map((o, k) => `<div class="${o.w ? "w" : ""}" style="height:${o.runs / mx * 100}%"><span>${o.runs}${o.w ? " W" + o.w : ""}</span><em>${k + 1}</em></div>`).join("")}</div>`;
  }
  function wagon(c, I2) {
    const g = c.getContext("2d"), w = c.width, h = c.height, R = Math.min(w, h) / 2 - 6, C = [w / 2, h / 2], k = R / S.BOUNDARY;
    g.clearRect(0, 0, w, h); g.fillStyle = "#2f8f45"; g.beginPath(); g.arc(C[0], C[1], R, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke(); g.setLineDash([3, 4]); g.beginPath(); g.arc(C[0], C[1], S.CIRCLE * k, 0, 7); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#cfae78"; g.fillRect(C[0] - 3, C[1] - 10 * k, 6, 20 * k);
    for (const s of I2.wagon) { const [x, y] = S.xy(s.a, Math.min(s.d, S.BOUNDARY)); g.strokeStyle = s.w ? "#ff4d3d" : s.six ? "#c58bff" : s.four ? "#7ee08f" : s.runs ? "#ffd23f" : "rgba(255,255,255,.35)"; g.lineWidth = s.six || s.four ? 2.5 : 1.5; g.beginPath(); g.moveTo(C[0], C[1] + 10 * k); g.lineTo(C[0] + x * k, C[1] + y * k); g.stroke(); }
  }
  function pmap(c, I2) {
    const g = c.getContext("2d"), w = c.width, h = c.height; g.clearRect(0, 0, w, h); g.fillStyle = "#cfae78"; g.fillRect(w * 0.2, 0, w * 0.6, h);
    g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 1; for (const f of [0.08, 0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(w * 0.2, h * (1 - f)); g.lineTo(w * 0.8, h * (1 - f)); g.stroke(); }
    g.fillStyle = "#f6e7c1"; g.fillRect(w * 0.5 - 14, h - 8, 28, 8);
    for (const m of I2.map) { const x = w * 0.5 + m.u * w * 0.27, y = h * (1 - m.v); g.fillStyle = m.w ? "#ff4d3d" : m.runs >= 4 ? "#7ee08f" : m.runs ? "#ffd23f" : "#fff"; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.strokeStyle = "rgba(0,0,0,.4)"; g.stroke(); }
  }
  function chartsHtml() {
    return sim.innings.map((I2, k) => `<h3 style="margin:.6rem 0 .2rem">${esc(sim.teams[I2.bat].name)} (innings ${k + 1})</h3><div class="charts"><div><div class="rt">Wagon wheel: where the runs went</div><canvas width="320" height="320" data-w="${k}"></canvas></div><div><div class="rt">Pitch map: where the ball pitched</div><canvas width="320" height="320" data-p="${k}"></canvas></div><div><div class="rt">Runs per over</div>${manhattan(I2)}</div></div>`).join("") || "<p>Nothing to show yet.</p>";
  }
  function teamsHtml() {
    return `<div class="teamstats">${[0, 1].map((t) => `<div><div class="sc-h"><span>${esc(sim.teams[t].name)}</span></div><table class="sc"><tr><th>Player</th><th>Bat</th><th>Pow</th><th>Bowl</th><th>Fld</th></tr>${sim.teams[t].players.map((p) => `<tr><td>${esc(p.name)} <span class="rt">${p.wk ? "wk" : p.canBowl ? S.BT_NAME[p.bt] : ""}</span></td><td>${p.bat}</td><td>${p.pow}</td><td>${p.canBowl ? p.bowl : "-"}</td><td>${p.fld}</td></tr>`).join("")}</table></div>`).join("")}</div>`;
  }
  const HELP = `<div class="comm" style="max-height:none"><p class="big">Bowling</p><p>Choose a bowler each over (nobody bowls two in a row, and each has an over limit). Pick a delivery, click the pitch to aim, set your effort and bowl. Fast bowlers swing it when it is overcast and seam it on a green pitch; spinners turn it more as the pitch wears. Three bouncers in an over is a no-ball. Tired bowlers lose accuracy.</p><p class="big">Batting</p><p>Pick a shot that suits the ball (drive the full ones, cut the short wide ones, pull the short ones at your body, sweep the spinners), aim it into a gap on the little field and press Space as the ring closes. Perfect timing is power, a mistimed shot is an edge or a catch. Step out to spinners for a big hit, but miss and you are stumped.</p><p class="big">Running</p><p>After a shot you pick how many to run. Green is safe, orange risky, red is a probable run out. Better fielders and shorter throws make it harder.</p><p class="big">The rules</p><p>10 wickets, a powerplay at the start (2 fielders outside the ring), free hit after a no-ball (only run outs), wides and extras, DRS reviews on LBW and edges (one each per innings, umpire's call keeps it), and a super over if the scores are level.</p></div>`;
  function setTab(t) { sel.tab = t; document.querySelectorAll("#tabs [data-t]").forEach((b) => b.classList.toggle("on", b.dataset.t === t)); renderTab(); }
  function renderTab() {
    const el = $("tabBody"); if (!sim) { el.innerHTML = ""; return; }
    if (sel.tab === "comm") el.innerHTML = `<div class="comm">${logLines.map((l) => `<p class="${l.kind}">${esc(l.text)}</p>`).join("")}</div>`;
    else if (sel.tab === "card") el.innerHTML = sim.innings.map((I2, k) => cardHtml(I2, k)).join("") || "<p>The match has not started.</p>";
    else if (sel.tab === "charts") { el.innerHTML = chartsHtml(); el.querySelectorAll("[data-w]").forEach((c) => wagon(c, sim.innings[+c.dataset.w])); el.querySelectorAll("[data-p]").forEach((c) => pmap(c, sim.innings[+c.dataset.p])); }
    else if (sel.tab === "teams") el.innerHTML = teamsHtml(); else el.innerHTML = HELP;
  }
  $("tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) setTab(b.dataset.t); });
  setInterval(() => { if (sim && (sel.tab === "card" || sel.tab === "charts") && !document.hidden) renderTab(); }, 4000);

  // ---------------- the end ----------------
  function finishMatch() {
    finished = true; const res = sim.result, won = res.winner === my;
    if (role === "solo") { if (window.TungMP) TungMP.submitSolo({ game: "cricket", result: won ? "win" : "loss" }); }
    else if (np) { np.report({ score: res.scores[my] + (won && res.scores[0] === res.scores[1] ? 1 : 0) }); }
    const mom = res.mom;
    const box = $("result"); box.hidden = false;
    box.innerHTML = `<div><h2>${won ? "🏆 You win!" : res.winner < 0 ? "🤝 Tied" : "💀 You lose"}</h2><p class="sub"><b>${esc(res.text)}</b>${mom ? `<br>⭐ Player of the match: <b>${esc(mom.name)}</b> (${esc(sim.teams[mom.team].name)})` : ""}</p>
      ${sim.innings.map((I2, k) => cardHtml(I2, k)).join("")}<div class="charts">${sim.innings.map((I2, k) => `<div><div class="rt">${esc(sim.teams[I2.bat].short)} wagon wheel</div><canvas width="320" height="320" data-w="${k}"></canvas></div>`).join("")}</div>
      <div class="rowbtn">${role === "solo" ? `<button class="btn" id="again">🏏 Play again</button><button class="btn secondary" id="menuBtn">Menu</button>` : `<button class="btn secondary" id="closeRes">Close</button>`}</div></div>`;
    box.querySelectorAll("[data-w]").forEach((c) => wagon(c, sim.innings[+c.dataset.w]));
    const a = $("again"), m2 = $("menuBtn"), cl = $("closeRes"); if (a) a.onclick = () => { box.hidden = true; startSolo(); }; if (m2) m2.onclick = () => { box.hidden = true; toMenu(); }; if (cl) cl.onclick = () => { box.hidden = true; };
    if (won) snd("cheer");
  }

  // ---------------- multiplayer ----------------
  function pickTeam(id) {
    picks.mine = id; np.send({ k: "team", id }); if (role === "host" && picks.opp) startHost(); renderCtl();
  }
  function seedOf(c) { const s = c.seed; if (typeof s === "number") return s >>> 0; let h = 2166136261; for (const ch of String(s || "x")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; }
  function simOpts(c, teams, extra) { const pitch = c.opts && c.opts.pitch; return Object.assign({ seed: seedOf(c), overs: Number(c.opts && c.opts.overs) || 2, level: "medium", pitch: pitch && pitch !== "random" ? pitch : undefined, teams, names: [c.players[0].name, c.players[1].name], bot: [false, false], timers: true }, extra || {}); }
  function startHost() {
    const c = ctxInfo, teams = [picks.mine, picks.opp];
    sim = S.create(simOpts(c, teams)); np.send({ k: "init", teams }); pickBox = false; names = sim.names; gears = c.players.map((p) => TungGear.fromNums(p.gear)); begin();
  }
  np = NetPlay.attach({
    game: "cricket", rooms: false, panel: $("mpPanel"), menu: $("menu"), play: $("play"),
    onModeChange() { if (role === "solo") toMenu(); },
    onPrepare(c) {
      ctxInfo = c; role = c.host ? "host" : "guest"; my = c.host ? 0 : 1; sim = S.create(simOpts(c, ["titans", "blasters"])); picks = { mine: null, opp: null }; pickBox = true; finished = false; anim = null;
      $("result").hidden = true; $("board").innerHTML = ""; logLines = []; ckey = ""; hideBanner(); cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame); sentN = 0; sim.cfg.follow = true; // nothing runs until both have chosen
    },
    onStart() { },
    onStop() { },
    onExit() { cancelAnimationFrame(raf); role = "idle"; sim = null; pickBox = false; $("result").hidden = true; },
    onNet(from, d) {
      if (!d) return;
      if (d.k === "team") { picks.opp = String(d.id); if (role === "host" && picks.mine) startHost(); }
      else if (role === "guest" && d.k === "init") {
        const c = ctxInfo; sim = S.create(simOpts(c, d.teams.map(String), { follow: true })); pickBox = false; names = sim.names; gears = c.players.map((p) => TungGear.fromNums(p.gear)); begin();
      } else if (role === "guest" && d.k === "act" && sim && !pickBox) { if (d.n === sim.n + 1) S.act(sim, d.s, d.a); }
      else if (role === "host" && d.k === "req" && sim && !pickBox && d.a && typeof d.a === "object") { if (S.act(sim, 1, d.a)) flush(); }
    },
    onLeft() { },
  });
  window.__cr = () => ({ sim, anim, sel, my, role, S, edit, submit, doAction, frame: (ts) => frame(ts) });
})();
