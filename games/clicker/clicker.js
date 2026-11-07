(() => {
  const $ = (id) => document.getElementById(id);
  const tungsEl = $("tungs"), perClickEl = $("perClick"), perSecEl = $("perSec"), logBtn = $("log");
  const shopEl = $("shop"), noteEl = $("saveNote");

  // The brainrot crew: each one earns tungs for you every second.
  const GENS = [
    { id: "tung", name: "Tung Tung Tung Sahur", e: "🪵", cost: 15, cps: 0.2, line: "Bonks the log all night" },
    { id: "shark", name: "Tralalero Tralala", e: "🦈", cost: 100, cps: 1, line: "Swims laps round the log" },
    { id: "croc", name: "Bombardiro Crocodilo", e: "🐊", cost: 1100, cps: 8, line: "Air-drops fresh logs" },
    { id: "monkey", name: "Chimpanzini Bananini", e: "🐒", cost: 12000, cps: 47, line: "Peels logs very fast" },
    { id: "ballerina", name: "Ballerina Cappuccina", e: "☕", cost: 130000, cps: 260, line: "Spins on top of the log" },
    { id: "elephant", name: "Lirili Larila", e: "🐘", cost: 1400000, cps: 1400, line: "Walks the desert of logs" },
    { id: "frog", name: "Trippi Troppi", e: "🐸", cost: 20000000, cps: 7800, line: "Hops between two logs" },
    { id: "ninja", name: "Cappuccino Assassino", e: "🥷", cost: 330000000, cps: 44000, line: "Silent log delivery" },
    { id: "tree", name: "Brr Brr Patapim", e: "🌳", cost: 5100000000, cps: 260000, line: "Grows logs from nothing" },
    { id: "melon", name: "Glorbo Fruttodrillo", e: "🍉", cost: 75000000000, cps: 1600000, line: "Nobody knows how" },
  ];
  const clickCost = (lvl) => Math.floor(50 * Math.pow(2.3, lvl));
  const genCost = (g, n) => Math.floor(g.cost * Math.pow(1.15, n));
  const GUEST = "tungClicker:guest";
  const uid = () => (window.TungMP && TungMP.user ? TungMP.user.id : null);
  const lsKey = () => (uid() ? "tungClicker:" + uid() : GUEST);

  const blank = () => ({ tungs: 0, total: 0, clicks: 0, lvl: 0, own: {}, t: Date.now() });
  let s = load(lsKey()) || blank();
  let loadedFor = lsKey();
  let dirty = false, serverOk = false;

  function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
  function saveLocal() { try { localStorage.setItem(lsKey(), JSON.stringify(s)); } catch {} }

  // multiplier for owning lots of one kind: x2 at 25, 50, 100, 200
  const mult = (n) => Math.pow(2, [25, 50, 100, 200].filter((m) => n >= m).length);
  const perClick = () => 1 + s.lvl * s.lvl + Math.floor(cps() * 0.01);
  function cps() { return GENS.reduce((a, g) => a + (s.own[g.id] || 0) * g.cps * mult(s.own[g.id] || 0), 0); }

  function fmt(n) {
    if (n < 1000) return n >= 100 || Number.isInteger(n) ? String(Math.floor(n)) : n.toFixed(1);
    const u = ["K", "M", "B", "T", "Qa", "Qi", "Sx"];
    let i = -1;
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + u[i];
  }

  // ---------- shop ----------
  const rows = {};
  function buildShop() {
    const mk = (key, icon) => {
      const b = document.createElement("button");
      b.className = "item";
      b.innerHTML = `<span class="ic">${icon}</span><span class="tx"><span class="nm"></span><small></small></span><span class="own"></span><span class="cost"></span>`;
      shopEl.append(b);
      rows[key] = b;
      return b;
    };
    mk("click", "🏏").addEventListener("click", () => buy("click"));
    for (const g of GENS) mk(g.id, g.e).addEventListener("click", () => buy(g.id));
  }
  function buy(id) {
    if (id === "click") {
      const c = clickCost(s.lvl);
      if (s.tungs < c) return;
      s.tungs -= c; s.lvl++;
    } else {
      const g = GENS.find((x) => x.id === id), n = s.own[id] || 0, c = genCost(g, n);
      if (s.tungs < c) return;
      s.tungs -= c; s.own[id] = n + 1;
    }
    dirty = true; render(); saveLocal();
  }

  function render() {
    tungsEl.textContent = fmt(s.tungs);
    perClickEl.textContent = fmt(perClick());
    perSecEl.textContent = fmt(cps());
    const set = (key, name, sub, own, cost) => {
      const b = rows[key];
      b.querySelector(".nm").textContent = name;
      b.querySelector("small").textContent = sub;
      b.querySelector(".own").textContent = own;
      b.querySelector(".cost").textContent = fmt(cost);
      const can = s.tungs >= cost;
      b.disabled = !can;
      b.classList.toggle("can", can);
    };
    set("click", "Heavier bat", `+${fmt(2 * s.lvl + 1)} per click`, s.lvl, clickCost(s.lvl));
    for (const g of GENS) {
      const n = s.own[g.id] || 0, m = mult(n);
      set(g.id, g.name, `${g.line} · ${fmt(g.cps * m)}/s each${m > 1 ? ` (x${m})` : ""}`, n, genCost(g, n));
    }
  }

  // ---------- clicking and ticking ----------
  logBtn.addEventListener("click", (e) => {
    const n = perClick();
    s.tungs += n; s.total += n; s.clicks++; dirty = true;
    tungSound();
    const pop = document.createElement("div");
    pop.className = "pop"; pop.textContent = "+" + fmt(n);
    pop.style.left = (e.clientX || logBtn.getBoundingClientRect().left + 150) + "px";
    pop.style.top = (e.clientY || logBtn.getBoundingClientRect().top + 100) - 20 + "px";
    document.body.append(pop);
    setTimeout(() => pop.remove(), 900);
    render();
  });

  let audio;
  function tungSound() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.2);
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.25);
    } catch (_) {}
  }

  let lastTick = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = (now - lastTick) / 1000;
    lastTick = now;
    const gain = cps() * dt;
    if (gain > 0) { s.tungs += gain; s.total += gain; dirty = true; }
    s.t = Date.now();
    render();
  }, 100);

  // ---------- saving ----------
  function note(text) { noteEl.textContent = text; }
  async function saveServer() {
    if (!uid()) return;
    try {
      const r = await TungMP.api("/api/clicker", { method: "POST", body: { state: s } });
      if (r.kept && r.state) { s = r.state; render(); } // a bigger save was already on the server
      serverOk = true;
      note("Progress saved to your account.");
    } catch { note("Couldn’t reach the server. Progress is saved on this device."); }
  }
  setInterval(() => { saveLocal(); }, 3000);
  setInterval(() => { if (dirty) { dirty = false; saveServer(); } }, 15000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) { saveLocal(); if (uid()) saveServer(); } });
  window.addEventListener("pagehide", saveLocal);

  // offline progress: the crew keeps working while you are away (half speed, up to 8 hours)
  function offlineGain() {
    const away = Math.min(8 * 3600, Math.max(0, (Date.now() - (s.t || Date.now())) / 1000));
    const g = cps() * away * 0.5;
    if (away > 60 && g > 0) { s.tungs += g; s.total += g; note(`Welcome back! Your crew earned ${fmt(g)} tungs while you were away.`); }
  }

  // When the login finishes, pull the account's saved progress and keep whichever is bigger.
  async function adoptAccount() {
    if (!uid() || loadedFor === lsKey()) return;
    const guest = s;
    let remote = null;
    try { remote = (await TungMP.api("/api/clicker")).state; } catch {}
    const mine = load(lsKey());
    const candidates = [remote, mine, guest].filter(Boolean);
    s = candidates.reduce((a, b) => (b.total > a.total ? b : a), candidates[0] || blank());
    loadedFor = lsKey();
    offlineGain();
    render(); saveLocal(); dirty = true;
    await saveServer();
  }
  if (window.TungMP) {
    TungMP.on("ready", adoptAccount);
    TungMP.on("logout", () => { s = load(GUEST) || blank(); loadedFor = lsKey(); render(); note("Logged out. Log in to save your progress to your account."); });
    TungMP.booted.then(() => {
      const box = $("gameLeaderboard");
      if (box) TungMP.mountLeaderboard(box, { game: "solo:clicker", tabs: [{ id: "solo:clicker", label: "Total tungs" }] });
      if (!uid() && !TungMP.offline) note("Log in to save your progress to your account and join the leaderboard.");
    });
  }

  $("resetBtn").addEventListener("click", () => {
    if (!confirm("Start over? This wipes your tungs and upgrades. Your leaderboard total stays until you earn a bigger one.")) return;
    const total = s.total; // your lifetime total (and leaderboard spot) is kept
    s = blank();
    s.total = total;
    render(); saveLocal(); dirty = true;
    note("Progress reset.");
  });

  if (window.TungMP && TungMP.setupFullscreen) TungMP.setupFullscreen(document.getElementById("gameArea"));
  buildShop();
  offlineGain();
  render();
})();
