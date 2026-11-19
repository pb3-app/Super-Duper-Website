/* Tung Disc Golf - the page: a small 3D renderer on a plain canvas (no libraries), the controls and the round.
   All the course and flight rules are in engine.js. */
(() => {
  "use strict";
  const DG = window.DiscGolf, W = 960, H = 540, FOC = 520;
  const $ = (id) => document.getElementById(id);
  const cv = $("view"), ctx = cv.getContext("2d");
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const D2R = Math.PI / 180;

  // ---------------- sound ----------------
  let AC = null, muted = false;
  function beep(f, d, type, v, slide) {
    if (muted) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume();
      const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f * (slide || 1)), t + d);
      g.gain.setValueAtTime(v || 0.07, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d);
    } catch (_) {}
  }
  function noise(d, f0, vol) {
    if (muted) return;
    try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); const b = AC.createBuffer(1, AC.sampleRate * d, AC.sampleRate), a = b.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / a.length); const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = b; fl.type = "bandpass"; fl.frequency.value = f0; g.gain.value = vol; s.connect(fl); fl.connect(g); g.connect(AC.destination); s.start(); } catch (_) {}
  }

  // ---------------- state ----------------
  let courseId = (() => { try { return localStorage.getItem("tungDGCourse") || "pines"; } catch (_) { return "pines"; } })();
  if (!DG.COURSES[courseId]) courseId = "pines";
  let course = DG.course(courseId), np = null, mode = "idle"; // idle | solo | match
  let holeIdx = 0, hole = null, lie = { x: 0, z: 0 }, prevLie = lie, strokes = 0, results = [], phase = "idle", finished = false, lastSent = 0, oppName = "";
  let cfg = { disc: 2, yaw: 0, power: 0.7, bank: 0, launch: 1, hand: 1 };
  let pred = null, flight = null, banner = null, nextAt = 0, raf = 0, last = 0, tAnim = 0;
  const cam = { x: 0, y: 3, z: -8, yaw: 0, pitch: 0.12 }, camT = { x: 0, y: 3, z: -8, yaw: 0, pitch: 0.12 };
  let R = null; // render data of the hole on screen
  const keys = {};

  // ---------------- the cards ----------------
  const CW = 192, CH = 120;
  function drawCardArt(g, w, h, disc) { // a Triple T ID card: photo, name, a holographic stripe, the flight numbers stamped on it, a chip and a barcode
    const s = w / CW; g.save(); g.scale(s, s); g.clearRect(0, 0, CW, CH);
    const base = g.createLinearGradient(0, 0, CW, CH); base.addColorStop(0, "#ffffff"); base.addColorStop(0.18, disc.color); base.addColorStop(1, shade(disc.color, 0.55));
    g.fillStyle = "rgba(0,0,0,.55)"; rrect(g, 1, 3, CW - 2, CH - 2, 14); g.fill(); // edge of the plastic
    g.fillStyle = base; rrect(g, 0, 0, CW, CH - 3, 14); g.fill();
    g.save(); rrect(g, 0, 0, CW, CH - 3, 14); g.clip();
    // holographic stripe
    const holo = g.createLinearGradient(0, 70, CW, 100); ["#ff6ad5", "#ffd86b", "#7df0ff", "#9d7bff", "#ff6ad5"].forEach((c, i) => holo.addColorStop(i / 4, c));
    g.globalAlpha = 0.42; g.fillStyle = holo; g.save(); g.transform(1, 0, -0.35, 1, 28, 0); g.fillRect(-20, 74, CW + 60, 17); g.restore(); g.globalAlpha = 1;
    g.fillStyle = "rgba(255,255,255,.16)"; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(CW - 20, CH + 10, 24 + i * 11, 0, 7); g.lineWidth = 1.2; g.strokeStyle = "rgba(255,255,255,.12)"; g.stroke(); }
    g.restore();
    // the photo window with a tung
    g.fillStyle = "#fff6e6"; rrect(g, 12, 14, 60, 62, 8); g.fill(); g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 2; g.stroke();
    const lg = g.createLinearGradient(0, 22, 0, 70); lg.addColorStop(0, "#e0a965"); lg.addColorStop(1, "#bd8043"); g.fillStyle = lg; rrect(g, 28, 24, 28, 46, 8); g.fill(); g.strokeStyle = "#5e3a18"; g.lineWidth = 2; g.stroke();
    g.fillStyle = "#f1cf9b"; g.beginPath(); g.ellipse(42, 25, 14, 5, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(36, 42, 5.5, 0, 7); g.arc(49, 42, 5.5, 0, 7); g.fill(); g.fillStyle = "#111"; g.beginPath(); g.arc(37, 43, 2.4, 0, 7); g.arc(50, 43, 2.4, 0, 7); g.fill();
    g.strokeStyle = "#3d2412"; g.lineWidth = 2; g.beginPath(); g.arc(42.5, 52, 6, 0.2, Math.PI - 0.2); g.stroke();
    // the printing
    g.fillStyle = "rgba(10,10,10,.85)"; g.textAlign = "left"; g.font = "900 22px sans-serif"; g.fillText("TRIPLE T", 82, 36); g.font = "800 11px sans-serif"; g.fillStyle = "rgba(10,10,10,.7)"; g.fillText("ID CARD · " + disc.kind.toUpperCase(), 82, 50);
    g.font = "900 13px sans-serif"; g.fillStyle = "rgba(10,10,10,.9)"; g.fillText(disc.name, 82, 68);
    g.fillStyle = "rgba(10,10,10,.8)"; g.font = "800 14px sans-serif"; g.fillText(`${disc.speed}   ${disc.glide}   ${disc.turn}   ${disc.fade}`, 14, 106);
    g.fillStyle = "#e8c65a"; rrect(g, 108, 79, 20, 15, 3); g.fill(); g.strokeStyle = "rgba(90,60,0,.6)"; g.lineWidth = 1; g.stroke();
    g.fillStyle = "rgba(10,10,10,.65)"; for (let i = 0; i < 26; i++) g.fillRect(104 + i * 3.1, 98, i % 3 === 0 ? 2 : 1, 12);
    g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 2; rrect(g, 1, 1, CW - 2, CH - 5, 13); g.stroke();
    g.restore();
  }
  function shade(hex, k) { const c = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k)); return `rgb(${c[0]},${c[1]},${c[2]})`; }
  const artCache = {};
  function artFor(disc, back) {
    const key = disc.id + (back ? "b" : ""); if (artCache[key]) return artCache[key];
    const c = document.createElement("canvas"); c.width = CW; c.height = CH; const g = c.getContext("2d");
    if (!back) drawCardArt(g, CW, CH, disc);
    else { const gr = g.createLinearGradient(0, 0, CW, CH); gr.addColorStop(0, shade(disc.color, 0.8)); gr.addColorStop(1, shade(disc.color, 0.4)); g.fillStyle = "rgba(0,0,0,.55)"; rrect(g, 1, 3, CW - 2, CH - 2, 14); g.fill(); g.fillStyle = gr; rrect(g, 0, 0, CW, CH - 3, 14); g.fill(); g.fillStyle = "rgba(255,255,255,.2)"; g.font = "900 64px sans-serif"; g.textAlign = "center"; g.fillText("TTT", CW / 2, 74); g.strokeStyle = "rgba(255,255,255,.4)"; g.lineWidth = 2; rrect(g, 1, 1, CW - 2, CH - 5, 13); g.stroke(); }
    artCache[key] = c; return c;
  }
  function cardIcon(c, disc) { c.getContext("2d").clearRect(0, 0, c.width, c.height); drawCardArt(c.getContext("2d"), c.width, c.height, disc); }
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function renderBag() {
    const box = $("bag"); box.replaceChildren();
    DG.DISCS.forEach((d, i) => {
      const b = document.createElement("button"); b.className = "card-btn" + (i === cfg.disc ? " on" : ""); b.dataset.i = i; b.title = d.blurb;
      const c = document.createElement("canvas"); c.width = 192; c.height = 120; cardIcon(c, d);
      b.append(c); b.insertAdjacentHTML("beforeend", `<b><kbd>${i + 1}</kbd>${d.name}</b><small>${d.kind}</small><small>${d.speed} / ${d.glide} / ${d.turn} / ${d.fade}</small><small>about ${Math.round(DG.maxCarry(d.id))} m flat out</small>`);
      b.onclick = () => { cfg.disc = i; syncUI(); refreshInfo(); beep(520, 0.05, "triangle", 0.05, 1.2); };
      box.append(b);
    });
  }

  // ---------------- course render data ----------------
  const SUN = [0.45, 0.8, 0.35];
  function prepareHole(h) {
    if (h._r) return h._r;
    const g = h.grid, nx = g.nx, nz = g.nz, col = new Uint8Array(nx * nz * 3), th = h.theme;
    const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) {
      const s = h.surf[j * nx + k], x = g.x0 + (k + 0.5) * g.cell, z = g.z0 + (j + 0.5) * g.cell;
      const hx = (DG.groundAt(h, x + 1.2, z) - DG.groundAt(h, x - 1.2, z)) / 2.4, hz = (DG.groundAt(h, x, z + 1.2) - DG.groundAt(h, x, z - 1.2)) / 2.4, nl = Math.hypot(hx, 1, hz);
      const lam = clamp((-hx * SUN[0] + SUN[1] - hz * SUN[2]) / nl, 0, 1), sh = 0.52 + 0.6 * lam;
      let c = s === 0 ? th.fair : s === 1 ? th.rough : s === 2 || s === 3 ? th.forest : s === 4 ? th.water : s === 5 ? [168, 172, 170] : [70, 200, 90];
      if (s === 3) c = mix(th.forest, [60, 40, 30], 0.3);
      if (s === 0 || s === 1) { const inf = DG.pathInfo(h, x, z), stripe = Math.floor(inf.along / 5) % 2 ? 1.05 : 0.95; c = [c[0] * stripe, c[1] * stripe, c[2] * stripe]; }
      const n = ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1 * 0.08 + 0.96;
      col[(j * nx + k) * 3] = clamp(c[0] * sh * n, 0, 255); col[(j * nx + k) * 3 + 1] = clamp(c[1] * sh * n, 0, 255); col[(j * nx + k) * 3 + 2] = clamp(c[2] * sh * n, 0, 255);
    }
    // the minimap, drawn once
    const gx = nx * g.cell, gz = nz * g.cell, sc = Math.min(146 / gx, 214 / gz), mw = Math.ceil(gx * sc), mh = Math.ceil(gz * sc), mm = document.createElement("canvas"); mm.width = mw; mm.height = mh;
    const m = mm.getContext("2d");
    for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) { const i = (j * nx + k) * 3; m.fillStyle = `rgb(${col[i]},${col[i + 1]},${col[i + 2]})`; m.fillRect(k * g.cell * sc, mh - (j + 1) * g.cell * sc, g.cell * sc + 0.6, g.cell * sc + 0.6); }
    m.fillStyle = "rgba(10,50,20,.9)"; for (const t of h.trees) m.fillRect((t.x - g.x0) * sc - 0.7, mh - (t.z - g.z0) * sc - 0.7, 1.7, 1.7);
    const toM = (x, z) => [(x - g.x0) * sc, mh - (z - g.z0) * sc];
    m.strokeStyle = "rgba(255,255,255,.5)"; m.lineWidth = 1; m.setLineDash([3, 3]); m.beginPath(); h.path.forEach((p, i) => { const q = toM(p[0], p[1]); i ? m.lineTo(...q) : m.moveTo(...q); }); m.stroke(); m.setLineDash([]);
    h._r = { col, mm, sc, mw, mh, toM, vx: new Float32Array((nx + 1) * (nz + 1)), vy: new Float32Array((nx + 1) * (nz + 1)), vz: new Float32Array((nx + 1) * (nz + 1)), stamp: new Int32Array((nx + 1) * (nz + 1)), order: new Int32Array(nx * nz), key: new Float32Array(nx * nz) };
    return h._r;
  }

  // ---------------- camera + projection ----------------
  let fx, fy, fz, rx, rz, ux, uy, uz;
  function basis() {
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw), sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
    fx = sy * cp; fy = -sp; fz = cy * cp; rx = cy; rz = -sy; ux = sy * sp; uy = cp; uz = cy * sp;
  }
  const P = { x: 0, y: 0, z: 0 };
  function project(x, y, z, o) {
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z, zc = dx * fx + dy * fy + dz * fz;
    if (zc < 0.2) return false; const k = FOC / zc; o.z = zc; o.x = W / 2 + (dx * rx + dz * rz) * k; o.y = H / 2 - (dx * ux + dy * uy + dz * uz) * k; return true;
  }
  const fogMix = (c, d, sky) => { const t = clamp((d - 70) / 300, 0, 1); const f = t * t * 0.9; return [c[0] + (sky[0] - c[0]) * f, c[1] + (sky[1] - c[1]) * f, c[2] + (sky[2] - c[2]) * f]; };
  const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const hex2 = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

  // ---------------- drawing the world ----------------
  let frameNo = 0;
  function drawSky(th, now) {
    const hy = H / 2 - Math.tan(cam.pitch) * FOC, g = ctx.createLinearGradient(0, 0, 0, Math.max(60, hy + 20)); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const sx = W / 2 + wrapA(2.2 - cam.yaw) * FOC; ctx.fillStyle = "rgba(255,244,200,.9)"; ctx.beginPath(); ctx.arc(sx, Math.max(40, hy - 150), 26, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.75)";
    for (let i = 0; i < 6; i++) { const a = wrapA(i * 1.1 + now * 0.00002 - cam.yaw), x = W / 2 + a * FOC, y = hy - 60 - (i % 3) * 38; if (Math.abs(a) < 1.3) { ctx.beginPath(); ctx.ellipse(x, y, 60 + (i % 2) * 26, 13, 0, 0, 7); ctx.ellipse(x + 30, y - 7, 40, 11, 0, 0, 7); ctx.fill(); } }
    // far hills
    for (const [amp, base, shade] of [[26, 0, "rgba(80,130,150,.55)"], [16, 7, "rgba(60,110,100,.7)"]]) {
      ctx.fillStyle = shade; ctx.beginPath(); ctx.moveTo(0, hy + 40);
      for (let x = 0; x <= W; x += 24) { const a = (x - W / 2) / FOC + cam.yaw; ctx.lineTo(x, hy - base - amp * (0.5 + 0.5 * Math.sin(a * 5 + base) * Math.cos(a * 2.3 + 1))); }
      ctx.lineTo(W, hy + 40); ctx.closePath(); ctx.fill();
    }
    return hy;
  }
  function drawTerrain(h, rd) {
    const g = h.grid, nx = g.nx, nz = g.nz, w = nx + 1, th = h.theme, sky = hex2(th.sky[1]);
    frameNo++;
    // which cells could be seen, nearest last
    const buckets = new Int32Array(257), list = rd.order, key = rd.key; let n = 0;
    const cx = cam.x, cz = cam.z;
    for (let j = 0; j < nz; j++) {
      const z = g.z0 + (j + 0.5) * g.cell;
      for (let k = 0; k < nx; k++) {
        const x = g.x0 + (k + 0.5) * g.cell, dx = x - cx, dz = z - cz, fw = dx * fx + dz * fz;
        if (fw < -4) continue; const d = Math.hypot(dx, dz); if (d > 340) continue;
        if (fw < d * 0.28 && fw < 25) continue; // far off to the side, behind the lens
        list[n] = j * nx + k; key[n] = d; buckets[Math.min(256, (d * 0.75) | 0)]++; n++;
      }
    }
    // counting sort, far to near
    let acc = 0; const start = new Int32Array(258); for (let b = 256; b >= 0; b--) { start[b] = acc; acc += buckets[b]; }
    const sorted = new Int32Array(n); for (let i = 0; i < n; i++) { const b = Math.min(256, (key[i] * 0.75) | 0); sorted[start[b]++] = list[i]; }
    const getV = (k, j) => {
      const vi = j * w + k; if (rd.stamp[vi] !== frameNo) { rd.stamp[vi] = frameNo; const x = g.x0 + k * g.cell, z = g.z0 + j * g.cell; if (project(x, g.h[vi], z, P)) { rd.vx[vi] = P.x; rd.vy[vi] = P.y; rd.vz[vi] = P.z; } else rd.vz[vi] = -1; } return vi;
    };
    ctx.lineJoin = "round"; ctx.lineWidth = 1;
    const t = performance.now() / 1000;
    for (let q = 0; q < n; q++) {
      const ci = sorted[q], j = (ci / nx) | 0, k = ci - j * nx, a = getV(k, j), b = getV(k + 1, j), c = getV(k + 1, j + 1), d = getV(k, j + 1);
      if (rd.vz[a] < 0 || rd.vz[b] < 0 || rd.vz[c] < 0 || rd.vz[d] < 0) continue;
      const xa = rd.vx[a], xb = rd.vx[b], xc = rd.vx[c], xd = rd.vx[d];
      if ((xa < -20 && xb < -20 && xc < -20 && xd < -20) || (xa > W + 20 && xb > W + 20 && xc > W + 20 && xd > W + 20)) continue;
      const ya = rd.vy[a], yb = rd.vy[b], yc = rd.vy[c], yd = rd.vy[d];
      if (ya > H + 30 && yb > H + 30 && yc > H + 30 && yd > H + 30) continue;
      const i3 = ci * 3; let col = [rd.col[i3], rd.col[i3 + 1], rd.col[i3 + 2]];
      const s = h.surf[ci];
      let wa = ya, wb = yb, wc = yc, wd = yd;
      if (s === 4) { // water: a flat sheet at the surface level, with a little shimmer
        const x = g.x0 + (k + 0.5) * g.cell, z = g.z0 + (j + 0.5) * g.cell; let wy = -1e9; for (const p of h.ponds) if (Math.hypot(x - p.x, z - p.z) < p.r + 1) wy = p.y + 0.35;
        if (wy > -1e8) { const pts = [[g.x0 + k * g.cell, g.z0 + j * g.cell], [g.x0 + (k + 1) * g.cell, g.z0 + j * g.cell], [g.x0 + (k + 1) * g.cell, g.z0 + (j + 1) * g.cell], [g.x0 + k * g.cell, g.z0 + (j + 1) * g.cell]], o = []; let ok = true; for (const p of pts) { if (!project(p[0], wy, p[1], P)) { ok = false; break; } o.push([P.x, P.y]); } if (ok) { [wa, wb, wc, wd] = [o[0][1], o[1][1], o[2][1], o[3][1]]; ctx.beginPath(); ctx.moveTo(o[0][0], o[0][1]); ctx.lineTo(o[1][0], o[1][1]); ctx.lineTo(o[2][0], o[2][1]); ctx.lineTo(o[3][0], o[3][1]); ctx.closePath(); const sh = 1 + 0.12 * Math.sin(t * 1.5 + k * 0.9 + j * 0.7); const fc = fogMix([col[0] * sh, col[1] * sh, col[2] * sh], rd.vz[a], sky); ctx.fillStyle = ctx.strokeStyle = rgb(fc); ctx.fill(); ctx.stroke(); continue; } }
      }
      col = fogMix(col, rd.vz[a], sky);
      ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.lineTo(xc, yc); ctx.lineTo(xd, yd); ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle = rgb(col); ctx.fill(); ctx.stroke();
    }
  }
  function drawTree(t, th, sky) {
    if (!project(t.x, t.y, t.z, P)) return; const d = P.z, k = FOC / d, bx = P.x, by = P.y;
    if (d > 330 || bx < -200 || bx > W + 200) return;
    const col = (c, m) => rgb(fogMix([c[0] * m, c[1] * m, c[2] * m], d, sky));
    const trunk = t.tr * k, th1 = t.h * 0.3 * k;
    ctx.fillStyle = col([110, 74, 44], 0.9); ctx.fillRect(bx - trunk, by - th1, trunk * 2, th1);
    for (let l = 0; l < 3; l++) {
      const y0 = t.h * (0.2 + l * 0.22), y1 = y0 + t.h * (0.46 - l * 0.04), rr = t.rc * (1 - l * 0.24) * k;
      const by0 = by - y0 * k, by1 = by - y1 * k;
      ctx.fillStyle = col(th.tree, 0.7 + l * 0.2); ctx.beginPath(); ctx.moveTo(bx, by1); ctx.lineTo(bx + rr, by0); ctx.lineTo(bx - rr, by0); ctx.closePath(); ctx.fill();
    }
  }
  function drawBasket(h, sky) {
    const b = h.basket;
    if (!project(b.x, b.y, b.z, P)) return; const d = P.z, k = FOC / d, bx = P.x, by = P.y;
    const px = (y) => by - y * k;
    // a tall flag so it can be found from far away
    ctx.strokeStyle = "rgba(60,60,60,.9)"; ctx.lineWidth = Math.max(1, 0.05 * k); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, px(4.2)); ctx.stroke();
    ctx.fillStyle = "#ff3b3b"; ctx.beginPath(); ctx.moveTo(bx, px(4.2)); ctx.lineTo(bx + 0.9 * k, px(3.95)); ctx.lineTo(bx, px(3.7)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#9aa0a6"; ctx.lineWidth = Math.max(1, 0.06 * k); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, px(1.6)); ctx.stroke();
    // the chains: a cage between two rings
    ctx.lineWidth = Math.max(1, 0.025 * k); ctx.strokeStyle = "rgba(220,226,232,.95)";
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, x1 = bx + Math.cos(a) * 0.36 * k, x2 = bx + Math.cos(a) * 0.22 * k, y1 = px(1.35) + Math.sin(a) * 0.05 * k, y2 = px(0.62) + Math.sin(a) * 0.03 * k; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    ctx.strokeStyle = "#ffb703"; ctx.lineWidth = Math.max(1.5, 0.06 * k); ctx.beginPath(); ctx.ellipse(bx, px(1.38), 0.38 * k, 0.07 * k, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = "#6c757d"; ctx.beginPath(); ctx.ellipse(bx, px(0.6), 0.3 * k, 0.05 * k, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = "#ffb703"; ctx.beginPath(); ctx.ellipse(bx, px(0.58), 0.34 * k, 0.06 * k, 0, 0, 7); ctx.fill();
  }
  function drawGimmeRing(h) { // the 3 metre gimme circle round the basket
    const b = h.basket, pts = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2, x = b.x + Math.cos(a) * DG.GIMME, z = b.z + Math.sin(a) * DG.GIMME; pts.push([x, DG.groundAt(h, x, z) + 0.12, z]); }
    drawLine(pts, "rgba(255,255,255,.7)", true, 2, 0);
  }
  function drawTee(h) { // a sign at the tee
    if (!project(2.8, DG.groundAt(h, 2.8, 0), 0.5, P)) return; const k = FOC / P.z, x = P.x, y = P.y;
    ctx.fillStyle = "#5e3a18"; ctx.fillRect(x - 0.05 * k, y - 1.5 * k, 0.1 * k, 1.5 * k); ctx.fillStyle = "#ffd23f"; ctx.fillRect(x - 0.42 * k, y - 1.9 * k, 0.84 * k, 0.5 * k);
    if (k > 12) { ctx.fillStyle = "#2b1a0e"; ctx.font = `900 ${Math.max(8, 0.34 * k) | 0}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(`${h.n}  PAR ${h.par}`, x, y - 1.55 * k); }
  }
  function drawLine(pts, color, dashed, lw, lift) { // a flight path in the air
    ctx.strokeStyle = color; ctx.lineWidth = lw || 3; ctx.lineCap = "round"; if (dashed) ctx.setLineDash([3, 9]);
    ctx.beginPath(); let started = false;
    for (const p of pts) { if (project(p[0], p[1] + (lift || 0), p[2], P)) { started ? ctx.lineTo(P.x, P.y) : ctx.moveTo(P.x, P.y); started = true; } }
    ctx.stroke(); ctx.setLineDash([]);
  }
  function drawCard3D(x, y, z, bank, dirx, dirz, spin, disc, big, hold) {
    // a real-looking card: its art is pasted onto the projected rectangle, with an edge, a moving shine and a back side
    const l = Math.hypot(dirx, dirz) || 1, f = [dirx / l, 0, dirz / l], r = [f[2], 0, -f[0]];
    const tilt = bank * 0.55 + (hold ? 0 : 0.1 * Math.sin(spin * 0.7)), e1 = [r[0] * Math.cos(tilt), Math.sin(tilt), r[2] * Math.cos(tilt)], e2 = f;
    const c = Math.cos(spin), sn = Math.sin(spin), a = [e1[0] * c + e2[0] * sn, e1[1] * c + e2[1] * sn, e1[2] * c + e2[2] * sn], b = [-e1[0] * sn + e2[0] * c, -e1[1] * sn + e2[1] * c, -e1[2] * sn + e2[2] * c];
    { // tip the card up a little towards the camera so you can see its face in the air
      const nrm = [b[1] * a[2] - b[2] * a[1], b[2] * a[0] - b[0] * a[2], b[0] * a[1] - b[1] * a[0]], vt = hold ? 0.55 : 0.5, cv2 = Math.cos(vt), sv = Math.sin(vt);
      let n2 = [nrm[0] * cv2 - f[0] * sv, nrm[1] * cv2 - f[1] * sv, nrm[2] * cv2 - f[2] * sv]; const nl = Math.hypot(n2[0], n2[1], n2[2]) || 1; n2 = n2.map((v) => v / nl);
      const da = a[0] * n2[0] + a[1] * n2[1] + a[2] * n2[2]; let a2 = [a[0] - n2[0] * da, a[1] - n2[1] * da, a[2] - n2[2] * da]; const al = Math.hypot(a2[0], a2[1], a2[2]) || 1; a2 = a2.map((v) => v / al);
      const b2 = [a2[1] * n2[2] - a2[2] * n2[1], a2[2] * n2[0] - a2[0] * n2[2], a2[0] * n2[1] - a2[1] * n2[0]];
      a[0] = a2[0]; a[1] = a2[1]; a[2] = a2[2]; b[0] = b2[0]; b[1] = b2[1]; b[2] = b2[2];
    }
    const sz = big || 0.5, hw = sz * 0.5, hh = sz * 0.5 * (CH / CW), quad = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], o = [];
    for (const [u, v] of quad) { if (!project(x + a[0] * u + b[0] * v, y + a[1] * u + b[1] * v, z + a[2] * u + b[2] * v, P)) return 0; o.push([P.x, P.y]); }
    const w = Math.hypot(o[1][0] - o[0][0], o[1][1] - o[0][1]);
    const ux = (o[1][0] - o[0][0]) / CW, uy = (o[1][1] - o[0][1]) / CW, vx = (o[3][0] - o[0][0]) / CH, vy = (o[3][1] - o[0][1]) / CH, det = ux * vy - uy * vx, back = det < 0;
    const edge = Math.max(1.2, w * 0.045);
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.moveTo(o[0][0], o[0][1] + edge); for (let i = 1; i < 4; i++) ctx.lineTo(o[i][0], o[i][1] + edge); ctx.closePath(); ctx.fill();
    ctx.save();
    if (back) ctx.setTransform(-ux, -uy, vx, vy, o[1][0], o[1][1]); else ctx.setTransform(ux, uy, vx, vy, o[0][0], o[0][1]);
    ctx.drawImage(artFor(disc, back), 0, 0);
    if (w > 18) { // a shine that slides across as it spins
      ctx.save(); rrect(ctx, 0, 0, CW, CH - 3, 14); ctx.clip(); const gx = (((spin * 0.45) % 2) + 2) % 2 * (CW + 120) - 80, sh = ctx.createLinearGradient(gx, 0, gx + 70, CH); sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(0.5, "rgba(255,255,255,.5)"); sh.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = sh; ctx.fillRect(0, 0, CW, CH); ctx.restore();
    }
    ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    return w;
  }
  function drawShadow(x, z, h, height) {
    const gy = DG.groundAt(h, x, z); if (gy < -40) return; if (!project(x, gy + 0.03, z, P)) return; const k = FOC / P.z, px = P.x, py = P.y, up = clamp(1 - (height || 0) * 0.045, 0.35, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.26 * up})`; ctx.beginPath(); ctx.ellipse(px, py, 0.38 * k * up, 0.12 * k * up, 0, 0, 7); ctx.fill();
  }
  function drawTrail(f) { // a ribbon in the card's colour that fades behind it, with a few sparkles
    const n = Math.min(f.i + 1, f.pts.length), start = Math.max(0, n - 70), c = hex2(f.disc.color); let prev = null;
    for (let i = start; i < n; i++) {
      const p = f.pts[i], age = (i - start) / Math.max(1, n - start - 1); if (!project(p[0], p[1], p[2], P)) { prev = null; continue; }
      if (prev) { ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.08 + 0.7 * age})`; ctx.lineWidth = 1 + 7 * age * age; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(P.x, P.y); ctx.stroke(); ctx.strokeStyle = `rgba(255,255,255,${0.1 + 0.55 * age})`; ctx.lineWidth = 1 + 2 * age; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(P.x, P.y); ctx.stroke(); }
      if (i % 5 === 0 && age > 0.35) { ctx.fillStyle = `rgba(255,255,255,${age * 0.8})`; const j = Math.sin(i * 12.9898 + tAnim * 6) * 7; ctx.beginPath(); ctx.arc(P.x + j, P.y + Math.cos(i * 7.7) * 7, 1 + age * 1.8, 0, 7); ctx.fill(); }
      prev = [P.x, P.y];
    }
  }

  function drawHUDOverlay(now) {
    // wind
    const wk = DG.K.windK, wx = hole.wind.x * wk, wz = hole.wind.z * wk, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), right = wx * cy - wz * sy, fwd = wx * sy + wz * cy, sp = Math.hypot(wx, wz);
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.arc(54, 56, 40, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(54, 56, 38, 0, 7); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "800 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText("WIND", 54, 22);
    if (sp > 0.15) { const l = Math.min(30, 8 + sp * 7), ang = Math.atan2(right, fwd), ex = 54 + Math.sin(ang) * l, ey = 62 - Math.cos(ang) * l; ctx.strokeStyle = "#7ee0ff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(54 - Math.sin(ang) * l * 0.6, 62 + Math.cos(ang) * l * 0.6); ctx.lineTo(ex, ey); ctx.stroke(); ctx.fillStyle = "#7ee0ff"; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#fff"; ctx.fillText(`${(sp / wk).toFixed(1)} m/s`, 54, 84);
    // minimap
    const rd = R, mx = W - rd.mw - 12, my = 12;
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(mx - 4, my - 4, rd.mw + 8, rd.mh + 8); ctx.drawImage(rd.mm, mx, my);
    const mp = (x, z) => { const q = rd.toM(x, z); return [mx + q[0], my + q[1]]; };
    if (phase === "aim" || phase === "power" || phase === "acc") { ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); if (pred) pred.pts.forEach((p, i) => { const q = mp(p[0], p[2]); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); else { const q0 = mp(lie.x, lie.z), q1 = mp(lie.x + Math.sin(cfg.yaw) * 70, lie.z + Math.cos(cfg.yaw) * 70); ctx.moveTo(...q0); ctx.lineTo(...q1); } ctx.stroke(); ctx.setLineDash([]); }
    const t0 = mp(0, 0); ctx.fillStyle = "#cfd8dc"; ctx.fillRect(t0[0] - 3, t0[1] - 2, 6, 4);
    const bp = mp(hole.basket.x, hole.basket.z); ctx.fillStyle = "#ff3b3b"; ctx.beginPath(); ctx.arc(bp[0], bp[1], 4, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
    const lp = mp(lie.x, lie.z); ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.arc(lp[0], lp[1], 4, 0, 7); ctx.fill(); ctx.strokeStyle = "#000"; ctx.stroke();
    if (flight) { const q = mp(flight.cur[0], flight.cur[2]); ctx.fillStyle = flight.disc.color; ctx.beginPath(); ctx.arc(q[0], q[1], 3.5, 0, 7); ctx.fill(); }
  }
  function drawBanner(now) {
    if (!banner) return; const age = now - banner.t; if (age > banner.ms) { banner = null; return; }
    const k = age / banner.ms; ctx.globalAlpha = k < 0.78 ? 1 : 1 - (k - 0.78) / 0.22; ctx.textAlign = "center";
    const pop = 1 + Math.max(0, 0.25 - age / 600); ctx.save(); ctx.translate(W / 2, H * 0.3); ctx.scale(pop, pop);
    ctx.font = "900 54px sans-serif"; ctx.lineWidth = 9; ctx.strokeStyle = "#101010"; ctx.strokeText(banner.text, 0, 0); ctx.fillStyle = banner.color || "#fff"; ctx.fillText(banner.text, 0, 0);
    if (banner.sub) { ctx.font = "800 22px sans-serif"; ctx.lineWidth = 6; ctx.strokeText(banner.sub, 0, 36); ctx.fillStyle = "#fff"; ctx.fillText(banner.sub, 0, 36); }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  const say = (text, sub, color, ms) => { banner = { text, sub, color, ms: ms || 2200, t: performance.now() }; };

  function render(now) {
    if (!hole) return;
    basis(); R = prepareHole(hole); const th = hole.theme, sky = hex2(th.sky[1]);
    drawSky(th, now);
    // the ground below the horizon
    ctx.fillStyle = rgb(fogMix(hex2("#5a8a50"), 400, sky)); ctx.fillRect(0, H / 2 - Math.tan(cam.pitch) * FOC + 8, W, H);
    drawTerrain(hole, R);
    drawTee(hole); drawGimmeRing(hole);
    // trees and the basket, far to near
    const vis = [];
    for (const t of hole.trees) { const dx = t.x - cam.x, dz = t.z - cam.z, fw = dx * fx + dz * fz; if (fw < 0.5 || fw > 330) continue; if (Math.abs(dx * rx + dz * rz) > fw * 1.1 + 8) continue; vis.push([fw, t]); }
    const bd = (hole.basket.x - cam.x) * fx + (hole.basket.z - cam.z) * fz; vis.push([bd, null]);
    vis.sort((a, b) => b[0] - a[0]);
    for (const [, t] of vis) { if (t) drawTree(t, th, sky); else drawBasket(hole, sky); }
    // the flight path preview (or, if there is none, a straight dotted line showing where you are pointing)
    if ((phase === "aim" || phase === "power" || phase === "acc") && !putting) {
      if (pred) {
        drawLine(pred.pts.filter((_, i) => i % 3 === 0), "rgba(255,230,90,.95)", true, 4, 0);
        const e = pred.end; if (project(e.x, DG.groundAt(hole, e.x, e.z) + 0.05, e.z, P)) { const k = FOC / P.z; ctx.strokeStyle = pred.kind === "ob" ? "#ff5a4a" : pred.kind === "holed" ? "#7df08f" : "#ffe066"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(P.x, P.y, Math.max(6, 0.7 * k), Math.max(3, 0.25 * k), 0, 0, 7); ctx.stroke(); }
      } else {
        const pts = []; for (let d = 4; d <= 90; d += 3) { const x = lie.x + Math.sin(cfg.yaw) * d, z = lie.z + Math.cos(cfg.yaw) * d; pts.push([x, DG.groundAt(hole, x, z) + 0.15, z]); }
        drawLine(pts, "rgba(255,230,90,.85)", true, 3, 0);
      }
    }
    if (flight) {
      drawTrail(flight);
      const h0 = DG.groundAt(hole, flight.cur[0], flight.cur[2]); drawShadow(flight.cur[0], flight.cur[2], hole, flight.cur[1] - h0);
      for (let g = 2; g >= 1; g--) { const gi = Math.max(0, flight.i - g * 3), q = flight.pts[gi]; if (q && Math.hypot(q[0] - flight.cur[0], q[2] - flight.cur[2]) < 25) { ctx.globalAlpha = 0.16 * (3 - g); drawCard3D(q[0], q[1], q[2], flight.bank, flight.dx, flight.dz, flight.spin - g * 0.7 * flight.hand, flight.disc, 1.9); ctx.globalAlpha = 1; } }
      drawCard3D(flight.cur[0], flight.cur[1], flight.cur[2], flight.bank, flight.dx, flight.dz, flight.spin, flight.disc, 1.9);
    } else if (phase !== "between" && phase !== "holed") {
      drawCard3D(lie.x, DG.groundAt(hole, lie.x, lie.z) + 0.05, lie.z, 0.0, Math.sin(cfg.yaw), Math.cos(cfg.yaw), 0, DG.DISCS[cfg.disc], 0.9, true); // the card on the ground at your feet
    }
    if (flight) { const dd = Math.hypot(flight.cur[0] - lie.x, flight.cur[2] - lie.z); ctx.font = "900 22px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 5; ctx.strokeStyle = "#101010"; ctx.strokeText(`${dd.toFixed(0)} m`, W / 2, H - 22); ctx.fillStyle = "#fff"; ctx.fillText(`${dd.toFixed(0)} m`, W / 2, H - 22); }
    drawHUDOverlay(now); drawBanner(now);
    if (putting && phase === "aim") drawPutt(now);
    if (phase === "aim" || phase === "power" || phase === "acc") { if (!putting) drawMeter(now); const d = DG.DISCS[cfg.disc]; ctx.textAlign = "left"; ctx.font = "800 14px sans-serif"; ctx.lineWidth = 4; ctx.strokeStyle = "#101010"; const tx = `${d.name} · ${d.kind}${pred && !putting ? ` · about ${pred.dist.toFixed(0)} m at ${Math.round(previewPower() * 100)}%` : ""}`; ctx.strokeText(tx, 16, H - 18); ctx.fillStyle = d.color; ctx.fillText(tx, 16, H - 18); }
    const tf = $("throwFloat"), want = phase === "aim" ? (putting ? "🥏 PUTT! <kbd>Space</kbd>" : "🥏 THROW <kbd>Space</kbd>") : phase === "power" ? "SET THE POWER <kbd>Space</kbd>" : phase === "acc" ? "RELEASE! <kbd>Space</kbd>" : "";
    tf.hidden = !want; const wk = phase + (putting ? "p" : ""); if (want && tf.dataset.w !== wk) { tf.innerHTML = want; tf.dataset.w = wk; }
  }

  // ---------------- the throw: pick power on the first press, then the release on the second ----------------
  let meter = null;
  // Putting: inside 10 m there is no power meter. The putter is solved for you and you line up a drifting ring with the basket and press Space once.
  let putting = false, puttSol = null, puttT0 = 0, puttMo = null, puttTrail = [];
  const puttAmp = (d) => clamp(0.8 + 0.4 * d, 1.2, 4.2);
  const puttPos = (now) => { const t = Math.max(0, (now - puttT0) / 1000), A = puttAmp(puttSol.dist); return [A * Math.sin(2.3 * t + puttMo[0]), 0.55 * A * Math.sin(1.31 * t + puttMo[1])]; };
  const tri = (x) => { const m = ((x % 2) + 2) % 2; return m < 1 ? m : 2 - m; };
  const powerAt = (now) => tri((now - meter.t0) / 1150);
  const accAt = (now) => 0.5 + 0.5 * Math.sin(((now - meter.t0) / (1500 - 750 * meter.power)) * 2 * Math.PI - Math.PI / 2);
  function pressThrow() {
    const now = performance.now();
    if (phase === "aim" && putting) { if (now < puttT0) return; const [ex, ey] = puttPos(now); puttNow(ex, ey); }
    else if (phase === "aim") { meter = { stage: "power", t0: now, power: 0 }; phase = "power"; beep(420, 0.06, "triangle", 0.05, 1.3); }
    else if (phase === "power") { meter.power = Math.max(0.05, powerAt(now)); cfg.power = meter.power; meter.stage = "acc"; meter.t0 = now; phase = "acc"; updatePred(); beep(560, 0.06, "triangle", 0.05, 1.3); }
    else if (phase === "acc") { const a = (accAt(now) - 0.5) * 2, pw = meter.power; meter = null; throwNow(pw, a); }
  }
  function cancelMeter() { if (phase === "power" || phase === "acc") { meter = null; phase = "aim"; } }
  function drawPutt(now) {
    const b = hole.basket; if (!project(b.x, b.y + 0.9, b.z, P)) return;
    const u = 0.35 * FOC / P.z, cx = P.x, cy = P.y, ready = now >= puttT0, [ex, ey] = ready ? puttPos(now) : [0, 0], rx = cx + ex * u, ry = cy - ey * u, near = Math.hypot(ex, ey) < 1.2;
    // the sweet spot on the basket
    ctx.fillStyle = near ? "rgba(120,255,160,.28)" : "rgba(255,255,255,.12)"; ctx.beginPath(); ctx.arc(cx, cy, 1.2 * u, 0, 7); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = near ? "rgba(120,255,160,1)" : "rgba(255,255,255,.9)"; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.arc(cx, cy, 1.2 * u, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, 7); ctx.fill();
    if (ready) { puttTrail.push([rx, ry]); if (puttTrail.length > 14) puttTrail.shift(); }
    puttTrail.forEach((q, i) => { ctx.fillStyle = `rgba(255,230,90,${(i / puttTrail.length) * 0.35})`; ctx.beginPath(); ctx.arc(q[0], q[1], 9 * (i / puttTrail.length), 0, 7); ctx.fill(); });
    ctx.globalAlpha = ready ? 1 : 0.4; ctx.strokeStyle = near ? "#7df08f" : "#ffe066"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(rx, ry, 17, 0, 7); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rx - 26, ry); ctx.lineTo(rx - 8, ry); ctx.moveTo(rx + 8, ry); ctx.lineTo(rx + 26, ry); ctx.moveTo(rx, ry - 26); ctx.lineTo(rx, ry - 8); ctx.moveTo(rx, ry + 8); ctx.lineTo(rx, ry + 26); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(0,0,0,.6)"; rrect(ctx, W / 2 - 230, H - 60, 460, 44, 12); ctx.fill(); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "800 14px sans-serif";
    ctx.fillText(ready ? `PUTTING · ${puttSol.dist.toFixed(1)} m: press Space when the ring is on the basket` : "PUTTING: get ready…", W / 2, H - 33);
  }
  function drawMeter(now) {
    const w = 380, h = 24, x = (W - w) / 2, y = H - 64;
    ctx.fillStyle = "rgba(0,0,0,.6)"; rrect(ctx, x - 10, y - 30, w + 20, h + 46, 14); ctx.fill();
    ctx.textAlign = "center"; ctx.font = "800 12px sans-serif"; ctx.fillStyle = "#fff";
    if (phase === "aim") { ctx.fillText("Aim, pick your card, then press THROW (Space) to start the power meter", W / 2, y + 12); return; }
    ctx.fillText(phase === "power" ? "POWER: press Space when it is as high as you want" : "RELEASE: press Space with the marker in the green", W / 2, y - 12);
    ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fillRect(x, y, w, h);
    if (phase === "power") { const p = powerAt(now); ctx.fillStyle = `hsl(${120 - p * 120},85%,55%)`; ctx.fillRect(x, y, w * p, h); for (const t of [0.25, 0.5, 0.75]) { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x + w * t - 1, y, 2, h); } ctx.fillStyle = "#fff"; ctx.fillText(Math.round(p * 100) + "%", x + w / 2, y + 17); }
    else {
      ctx.fillStyle = "#b3392e"; ctx.fillRect(x, y, w, h); ctx.fillStyle = "#e0b43a"; ctx.fillRect(x + w * 0.3, y, w * 0.4, h); ctx.fillStyle = "#3be86b"; ctx.fillRect(x + w * 0.45, y, w * 0.1, h);
      ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(x + w * 0.5 - 1, y - 4, 2, h + 8);
      const m = accAt(now); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(x + w * m, y - 6); ctx.lineTo(x + w * m - 8, y - 18); ctx.lineTo(x + w * m + 8, y - 18); ctx.closePath(); ctx.fill(); ctx.fillRect(x + w * m - 2, y, 4, h);
      ctx.fillStyle = "#fff"; ctx.fillText(`power ${Math.round(meter.power * 100)}%`, x + w / 2, y + 17);
    }
  }

  // ---------------- the round ----------------
  const dBasket = () => Math.hypot(hole.basket.x - lie.x, hole.basket.z - lie.z);
  const label = (s, par) => (s === 1 ? "ACE!!" : s - par <= -3 ? "ALBATROSS!" : s - par === -2 ? "EAGLE!" : s - par === -1 ? "BIRDIE!" : s === par ? "PAR" : s - par === 1 ? "BOGEY" : s - par === 2 ? "DOUBLE BOGEY" : "+" + (s - par));
  const total = () => results.reduce((a, b) => a + b, 0) + (hole && (phase === "aim" || phase === "flight" || phase === "power" || phase === "acc") ? Math.min(strokes, DG.MAX_STROKES) : 0);
  function startCourse(m) {
    mode = m; course = DG.course(courseId); holeIdx = 0; results = []; finished = false; lastSent = 0; hideResult(); $("oppLine").textContent = ""; np.setPlaying(true);
    newHole(); running(true);
  }
  function newHole() {
    hole = course.holes[holeIdx]; lie = { x: 0, z: 0 }; prevLie = lie; strokes = 0; flight = null; phase = "aim"; banner = null; prepareHole(hole);
    $("chipHole").textContent = `Hole ${holeIdx + 1} / ${DG.HOLES} · ${hole.name}`; $("parEl").textContent = hole.par; $("strokeEl").textContent = 0; $("totEl").textContent = total() || 0;
    setupLie(true); hud(); card(); sendOpp(); say(`HOLE ${holeIdx + 1}`, `${hole.name} · par ${hole.par} · ${hole.len} m`, "#ffd23f", 2600);
    camSnap();
  }
  function recommend(dist) { return dist <= 22 ? 0 : dist <= 50 ? 1 : dist <= 85 ? 2 : dist <= 118 ? 3 : dist <= 150 ? 4 : 5; }
  function setupLie() { // point down the fairway (or at the basket) with a sensible card for the distance. The rest is up to you.
    const gp = DG.guidePoint(hole, lie), dB = dBasket(); cfg.yaw = Math.atan2(gp.x - lie.x, gp.z - lie.z); cfg.disc = recommend(dB); cfg.bank = 0; cfg.launch = 1; cfg.hand = 1; cfg.power = clamp(Math.hypot(gp.x - lie.x, gp.z - lie.z) / DG.maxCarry(DG.DISCS[cfg.disc].id), 0.3, 1);
    putting = dB <= DG.PUTT && dB > DG.GIMME;
    if (putting) { cfg.disc = 0; puttSol = DG.puttSolve(hole, lie); cfg.yaw = puttSol.yaw; puttMo = [Math.random() * 6.28, Math.random() * 6.28]; puttT0 = performance.now() + 900; puttTrail = []; }
    $("panel").classList.toggle("putting", putting);
    syncUI(); refreshInfo();
  }
  const params = (p) => Object.assign({ disc: DG.DISCS[cfg.disc].id, yaw: cfg.yaw, power: cfg.power, bank: cfg.bank, launch: cfg.launch, hand: cfg.hand }, p || {});
  // the flight path preview: where the card would go at the power on the meter (live while the meter moves), with the wind but without any shaky release
  const previewPower = () => (phase === "power" && meter ? powerAt(performance.now()) : cfg.power);
  function updatePred() { pred = !hole || putting || (phase !== "aim" && phase !== "power" && phase !== "acc") ? null : DG.predict(hole, lie, params({ power: clamp(previewPower(), 0.05, 1) })); }
  function refreshInfo() {
    if (!hole) return; const d = DG.DISCS[cfg.disc];
    if (putting) { pred = null; $("flightInfo").textContent = `PUTTING from ${dBasket().toFixed(1)} m: line the ring up with the basket and press Space once. The farther out you are, the more the ring wanders. Wind still pushes it.`; hud(); return; }
    updatePred();
    $("flightInfo").textContent = `${d.name} (${d.kind}) at ${Math.round(cfg.power * 100)}% power: about ${pred ? pred.dist.toFixed(0) : "?"} m${pred && pred.kind === "ob" ? " (out of bounds!)" : pred && pred.kind === "holed" ? " (in the basket!)" : ""} · the basket is ${dBasket().toFixed(0)} m away · wind ${(hole.wind.speed * DG.K.windK).toFixed(1)} m/s`; hud();
  }
  function syncUI() {
    $("bank").value = Math.round(cfg.bank * 100); $("bankEl").textContent = cfg.bank === 0 ? "Flat" : cfg.bank > 0 ? `Hyzer ${Math.round(cfg.bank * 100)}%` : `Anhyzer ${Math.round(-cfg.bank * 100)}%`;
    document.querySelectorAll("#launchSeg button").forEach((b) => b.classList.toggle("on", +b.dataset.v === cfg.launch));
    document.querySelectorAll("#handSeg button").forEach((b) => b.classList.toggle("on", +b.dataset.v === cfg.hand));
    document.querySelectorAll("#bag .card-btn").forEach((b) => b.classList.toggle("on", +b.dataset.i === cfg.disc));
  }
  function hud() { if (!hole) return; $("strokeEl").textContent = strokes; $("distEl").textContent = Math.round(dBasket()); $("totEl").textContent = total(); }
  function card() {
    const t = $("card"), rows = [[0, 9], [9, 18]];
    t.innerHTML = rows.map(([a, b]) => {
      const hs = course.holes.slice(a, b), r1 = hs.map((h, i) => `<th>${a + i + 1}</th>`).join(""), r2 = hs.map((h) => `<td>${h.par}</td>`).join("");
      const r3 = hs.map((h, i) => { const s = results[a + i], cls = s == null ? (a + i === holeIdx ? "cur" : "") : s < h.par ? "under" : s > h.par ? "over" : ""; return `<td class="${cls}">${s == null ? (a + i === holeIdx ? strokes || "" : "") : s}</td>`; }).join("");
      const sub = results.slice(a, b).reduce((x, y) => x + (y || 0), 0), par = hs.reduce((x, h) => x + h.par, 0);
      return `<tr><th>Hole</th>${r1}<th>${a ? "In" : "Out"}</th></tr><tr><th>Par</th>${r2}<td>${par}</td></tr><tr><th>You</th>${r3}<td>${sub || ""}</td></tr>`;
    }).join("");
  }
  function startFlight(r, p, disc) {
    flight = { r, pts: r.pts, i: 0, t: 0, disc, bank: p.bank, hand: p.hand, spin: 0, cur: r.pts[0], dx: Math.sin(p.yaw), dz: Math.cos(p.yaw), wasTree: false };
    phase = "flight"; beep(300, 0.22, "sawtooth", 0.03, 2.2); noise(0.25, 1800, 0.12); hud(); card(); sendOpp(); pred = null;
    $("flightInfo").textContent = "";
  }
  function throwNow(power, acc) {
    if (!hole || (phase !== "aim" && phase !== "acc" && phase !== "power")) return;
    strokes++; const p = params({ power: power == null ? cfg.power : power, acc: acc || 0 }), r = DG.throwCard(hole, lie, p); startFlight(r, p, DG.DISCS[cfg.disc]);
  }
  function puttNow(ex, ey) {
    if (!hole || phase !== "aim" || !putting || !puttSol) return;
    strokes++; const o = DG.puttThrow(hole, lie, puttSol, ex, ey); beep(520, 0.08, "triangle", 0.05, 1.4); startFlight(o.r, Object.assign({ bank: 0, hand: 1 }, o.p), DG.DISCS[0]);
  }
  function flightStep(dt) {
    const f = flight; f.t += dt * 1.25; const pts = f.pts;
    while (f.i < pts.length - 2 && pts[f.i + 1][3] <= f.t) f.i++;
    const a = pts[f.i], b = pts[Math.min(pts.length - 1, f.i + 1)], u = b[3] > a[3] ? clamp((f.t - a[3]) / (b[3] - a[3]), 0, 1) : 1;
    f.cur = [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
    const dx = b[0] - a[0], dz = b[2] - a[2]; if (Math.hypot(dx, dz) > 0.001) { f.dx = lerp(f.dx, dx, 0.2); f.dz = lerp(f.dz, dz, 0.2); }
    f.spin += dt * 14 * f.hand; if (f.t >= pts[pts.length - 1][3] + 0.05) flightEnd();
  }
  function flightEnd() {
    const f = flight, r = f.r; flight = null;
    if (r.hitTree) beep(180, 0.12, "square", 0.06, 0.6);
    if (r.kind === "holed") {
      phase = "holed"; const s = strokes; beep(880, 0.15, "triangle", 0.08, 1.3); setTimeout(() => beep(1320, 0.3, "triangle", 0.07, 1.2), 120); noise(0.3, 3200, 0.1);
      say("CHAINS!", `${label(s, hole.par)} · ${s} throw${s === 1 ? "" : "s"}`, s <= hole.par ? "#7df08f" : "#ffd23f", 2400); setTimeout(() => holeDone(s), 1700); return;
    }
    if (r.kind === "ob") {
      strokes++; noise(0.4, r.why === "water" ? 500 : 900, 0.12); beep(200, 0.3, "triangle", 0.06, 0.5);
      say(r.why === "water" ? "SPLASH!" : "OUT OF BOUNDS", "+1 throw: throw again from where you were", "#ff8a7a", 2600);
    } else {
      lie = { x: r.end.x, z: r.end.z }; prevLie = lie; const dB = dBasket();
      if (dB <= DG.GIMME) { // within 3 metres: it is a gimme, the tap-in is given and counts as one more throw
        strokes++; const sc = Math.min(strokes, DG.MAX_STROKES); phase = "holed"; hud(); beep(700, 0.15, "triangle", 0.07, 1.3); setTimeout(() => beep(1000, 0.25, "triangle", 0.06, 1.2), 120);
        say("GIMME!", `${dB.toFixed(1)} m out: it counts · ${label(sc, hole.par)} · ${sc} throw${sc === 1 ? "" : "s"}`, sc <= hole.par ? "#7df08f" : "#ffd23f", 2600); setTimeout(() => holeDone(sc), 1900); return;
      }
      say(`${r.dist.toFixed(0)} m`, dB < 1 ? "right next to the basket" : `${dB.toFixed(0)} m to the basket${r.hitTree ? " · off a tree!" : ""}`, "#fff", 2000);
    }
    if (strokes >= DG.MAX_STROKES) { say("PICK UP", `${DG.MAX_STROKES} throws is the most you can take`, "#ff8a7a", 2200); setTimeout(() => holeDone(DG.MAX_STROKES), 1500); phase = "holed"; return; }
    phase = "aim"; setupLie(); hud(); card(); sendOpp();
  }
  function holeDone(s) {
    results[holeIdx] = Math.min(s, DG.MAX_STROKES); phase = "between"; flight = null; nextAt = performance.now() + 2200; hud(); card(); sendOpp();
    if (mode === "match" && total() > lastSent) { lastSent = total(); np.progress(lastSent); }
  }
  function finishCourse() {
    finished = true; phase = "done"; const tot = results.reduce((a, b) => a + b, 0), par = course.holes.reduce((a, h) => a + h.par, 0), diff = tot - par;
    const txt = diff === 0 ? "Even par" : diff < 0 ? `${-diff} under par` : `${diff} over par`;
    if (mode === "solo") {
      const key = "tungDGBest:" + courseId; let prev = 0; try { prev = Number(localStorage.getItem(key) || 0); } catch (_) {} const pb = !prev || tot < prev; try { if (pb) localStorage.setItem(key, String(tot)); } catch (_) {}
      if (window.TungMP) TungMP.submitSolo({ game: "discgolf", level: courseId, strokes: tot });
      beep(880, 0.6, "triangle", 0.09, 1.5);
      showResult(`🥏 ${tot} throws`, `${txt}. ${pb ? "🏆 New personal best on this course!" : "Your best here: " + prev}`, [["Play again", () => startCourse("solo")], ["Menu", toMenu]]);
    } else { np.report({ score: tot, ranking: [] }); showResult(`🥏 ${tot} throws`, `${txt}. Waiting for your opponent to finish…`, []); }
  }
  function showResult(title, sub, buttons) {
    const r = $("result"); r.innerHTML = `<h2>${title}</h2><p>${sub}</p><div class="btn-row"></div>`; r.hidden = false;
    for (const [lab, fn] of buttons) { const b = document.createElement("button"); b.className = "btn" + (lab === "Menu" ? " secondary" : ""); b.textContent = lab; b.onclick = fn; r.querySelector(".btn-row").append(b); }
  }
  const hideResult = () => { $("result").hidden = true; };
  function toMenu() { running(false); mode = "idle"; phase = "idle"; hideResult(); np.setPlaying(false); }
  function sendOpp() { if (mode === "match") np.send({ k: "h", h: holeIdx + 1, t: total(), d: finished ? 1 : 0 }); }

  // ---------------- the camera follows the action ----------------
  function camSnap() { aimCam(); Object.assign(cam, camT); }
  function aimCam() {
    const gy = DG.groundAt(hole, lie.x, lie.z);
    if (putting && puttSol) { // low and close, looking at the basket
      const b = hole.basket, d = puttSol.dist, back = clamp(d * 0.55 + 1.5, 3, 6), sy = Math.sin(puttSol.yaw), cy = Math.cos(puttSol.yaw);
      camT.x = lie.x - sy * back; camT.z = lie.z - cy * back; camT.y = Math.max(gy, DG.groundAt(hole, camT.x, camT.z)) + 1.45; camT.yaw = puttSol.yaw;
      camT.pitch = clamp(Math.atan2(camT.y - (b.y + 0.9), d + back), -0.05, 0.4); return;
    }
    const back = 7.5, sy = Math.sin(cfg.yaw), cy = Math.cos(cfg.yaw);
    camT.x = lie.x - sy * back; camT.z = lie.z - cy * back; camT.y = Math.max(gy, DG.groundAt(hole, camT.x, camT.z)) + 2.6; camT.yaw = cfg.yaw; camT.pitch = 0.17;
  }
  function updateCam(dt, now) {
    if (phase === "flight" && flight) {
      const c = flight.cur, l = Math.hypot(flight.dx, flight.dz) || 1, dx = flight.dx / l, dz = flight.dz / l;
      camT.x = c[0] - dx * 9; camT.z = c[2] - dz * 9; camT.y = Math.max(c[1] + 2.4, DG.groundAt(hole, camT.x, camT.z) + 2.4);
      camT.yaw = Math.atan2(dx, dz); const down = (camT.y - c[1]) / 9; camT.pitch = clamp(Math.atan(down), 0.05, 0.5);
    } else if (phase === "aim" || phase === "power" || phase === "acc") aimCam();
    else if (phase === "between" || phase === "holed") { const b = hole.basket, a = now * 0.0004, d = 9; camT.x = b.x + Math.sin(a) * d; camT.z = b.z + Math.cos(a) * d; camT.y = b.y + 4.5; camT.yaw = Math.atan2(b.x - camT.x, b.z - camT.z); camT.pitch = 0.3; }
    const k = 1 - Math.exp(-(phase === "flight" ? 9 : 5) * dt);
    cam.x = lerp(cam.x, camT.x, k); cam.y = lerp(cam.y, camT.y, k); cam.z = lerp(cam.z, camT.z, k);
    cam.yaw += wrapA(camT.yaw - cam.yaw) * (phase === "aim" ? Math.min(1, dt * 14) : k); cam.pitch = lerp(cam.pitch, camT.pitch, k);
  }

  // ---------------- main loop ----------------
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016); last = ts; tAnim += dt;
    if (!hole) return;
    if (phase === "aim") { // held keys
      let d = 0; if (keys.left) d -= 1; if (keys.right) d += 1; if (d && !putting) { cfg.yaw += d * dt * (keys.shift ? 0.25 : 0.9); refreshInfo(); }
    }
    if (phase === "power" && meter) updatePred();
    if (phase === "flight" && flight) flightStep(dt);
    if (phase === "between" && performance.now() > nextAt) { if (holeIdx + 1 < DG.HOLES) { holeIdx++; newHole(); } else finishCourse(); }
    updateCam(dt, ts); render(ts);
  }
  function running(on) { cancelAnimationFrame(raf); if (on) { last = 0; raf = requestAnimationFrame(frame); } }

  // ---------------- input ----------------
  const KEYMAP = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ShiftLeft: "shift", ShiftRight: "shift" };
  addEventListener("keydown", (e) => {
    if (mode === "idle" || /input|select|textarea/i.test(e.target.tagName)) return;
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); return; }
    if (e.code === "Space") { e.preventDefault(); if (!e.repeat) pressThrow(); return; }
    if (e.code === "Escape" && (phase === "power" || phase === "acc")) { cancelMeter(); return; }
    if (e.code === "Escape" && mode === "solo" && phase === "aim") { $("quitBtn").click(); return; }
    if (phase !== "aim") return;
    if (putting) return; // the putter is locked in
    if (/^Digit[1-8]$/.test(e.code)) { cfg.disc = +e.code.slice(5) - 1; syncUI(); refreshInfo(); return; }
    if (e.code === "KeyQ") { cfg.bank = clamp(cfg.bank - 0.25, -1, 1); syncUI(); refreshInfo(); } else if (e.code === "KeyE") { cfg.bank = clamp(cfg.bank + 0.25, -1, 1); syncUI(); refreshInfo(); }
    else if (e.code === "KeyF") { cfg.hand = -cfg.hand; syncUI(); refreshInfo(); }
  });
  addEventListener("blur", () => { for (const k of Object.keys(keys)) keys[k] = false; });
  addEventListener("keyup", (e) => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
  let dragX = null;
  cv.addEventListener("pointerdown", (e) => { dragX = e.clientX; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (dragX == null || phase !== "aim" || putting) return; cfg.yaw += (e.clientX - dragX) * 0.0035; dragX = e.clientX; refreshInfo(); });
  cv.addEventListener("pointerup", () => { dragX = null; });
  $("bank").addEventListener("input", (e) => { cfg.bank = e.target.value / 100; syncUI(); refreshInfo(); });
  $("launchSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { cfg.launch = +b.dataset.v; syncUI(); refreshInfo(); } });
  $("handSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { cfg.hand = +b.dataset.v; syncUI(); refreshInfo(); } });
  $("throwBtn").addEventListener("click", pressThrow); $("throwFloat").addEventListener("click", pressThrow);
  $("aimBtn").addEventListener("click", () => { if (phase !== "aim" || putting) return; cfg.yaw = Math.atan2(hole.basket.x - lie.x, hole.basket.z - lie.z); refreshInfo(); });
  $("quitBtn").addEventListener("click", () => { if (np.kind) np.leave(); else toMenu(); });
  $("startBtn").addEventListener("click", () => startCourse("solo"));

  // ---------------- menu ----------------
  function renderCourses() {
    const box = $("courses"); box.replaceChildren();
    for (const id of DG.IDS) {
      const c = DG.COURSES[id], b = document.createElement("button"); b.className = "course" + (id === courseId ? " sel" : "");
      const par = DG.course(id).holes.reduce((a, h) => a + h.par, 0), len = DG.course(id).holes.reduce((a, h) => a + h.len, 0), best = (() => { try { return localStorage.getItem("tungDGBest:" + id); } catch (_) { return null; } })();
      b.innerHTML = `<div class="swatch" style="background:linear-gradient(135deg,rgb(${c.theme.fair}),${c.theme.sky[0]});box-shadow:inset 0 0 0 4px rgb(${c.theme.rough})"></div><h3>${c.name}</h3><p>${c.blurb}<br>18 holes · par ${par} · ${len} m${best ? ` · your best ${best}` : ""}</p>`;
      b.onclick = () => { courseId = id; try { localStorage.setItem("tungDGCourse", id); } catch (_) {} renderCourses(); };
      box.append(b);
    }
  }

  // ---------------- multiplayer ----------------
  np = NetPlay.attach({
    game: "discgolf", rooms: false, panel: $("mpPanel"), menu: $("menu"), play: $("play"),
    onModeChange() { if (mode === "solo") toMenu(); },
    onPrepare(c) { oppName = c.players.find((p) => p.id !== c.me.id).name; courseId = c.opts.level in DG.COURSES ? c.opts.level : "pines"; course = DG.course(courseId); mode = "match"; holeIdx = 0; results = []; finished = false; lastSent = 0; hideResult(); $("oppLine").textContent = ""; newHole(); running(true); phase = "wait"; },
    onStart() { phase = "aim"; setupLie(); },
    onStop() { },
    onExit() { running(false); mode = "idle"; hideResult(); },
    onNet(from, d) { if (d && d.k === "h") $("oppLine").textContent = `${oppName}: hole ${d.h}/${DG.HOLES} · ${d.t} throw${d.t === 1 ? "" : "s"}${d.d ? " · finished" : ""}`; },
  });
  renderBag(); renderCourses(); syncUI();
  window.__dg = () => ({ DG, cfg, hole, lie, phase, strokes, results, flight, cam, throwNow, pressThrow, puttNow, putting: () => putting, puttSol: () => puttSol, meter: () => meter, holeDone, newHole: () => newHole(), goto: (i) => { holeIdx = i; newHole(); }, setLie: (x, z) => { lie = { x, z }; setupLie(); }, frame: (ts) => frame(ts), render: () => render(performance.now()), start: startCourse });
})();
