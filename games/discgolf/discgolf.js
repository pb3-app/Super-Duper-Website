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
  function cardIcon(c, disc) {
    const g = c.getContext("2d"), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, disc.color); gr.addColorStop(1, "#000"); g.fillStyle = gr; g.globalAlpha = 1;
    rrect(g, 2, 2, w - 4, h - 4, 7); g.fill(); g.fillStyle = disc.color; rrect(g, 3, 3, w - 6, h - 6, 6); g.globalAlpha = 0.92; g.fill(); g.globalAlpha = 1;
    g.fillStyle = "rgba(255,255,255,.85)"; rrect(g, 7, 8, h * 0.52, h * 0.52, 4); g.fill(); // the photo
    g.fillStyle = "#c8874a"; g.fillRect(7 + h * 0.18, 8 + h * 0.12, h * 0.16, h * 0.3); g.fillStyle = "#fff"; g.beginPath(); g.arc(7 + h * 0.22, 8 + h * 0.2, 2.6, 0, 7); g.arc(7 + h * 0.3, 8 + h * 0.2, 2.6, 0, 7); g.fill(); g.fillStyle = "#111"; g.beginPath(); g.arc(7 + h * 0.22, 8 + h * 0.2, 1.1, 0, 7); g.arc(7 + h * 0.3, 8 + h * 0.2, 1.1, 0, 7); g.fill();
    g.fillStyle = "rgba(0,0,0,.75)"; g.font = "900 12px sans-serif"; g.textAlign = "left"; g.fillText("TTT", h * 0.52 + 12, 20); g.font = "800 8px sans-serif"; g.fillText("ID CARD", h * 0.52 + 12, 30);
    g.fillStyle = "rgba(0,0,0,.55)"; for (let i = 0; i < 16; i++) g.fillRect(8 + i * 4, h - 13, i % 3 === 0 ? 2.5 : 1.3, 8);
    g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 2; rrect(g, 2, 2, w - 4, h - 4, 7); g.stroke();
  }
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function renderBag() {
    const box = $("bag"); box.replaceChildren();
    DG.DISCS.forEach((d, i) => {
      const b = document.createElement("button"); b.className = "card-btn" + (i === cfg.disc ? " on" : ""); b.dataset.i = i; b.title = d.blurb;
      const c = document.createElement("canvas"); c.width = 156; c.height = 100; cardIcon(c, d);
      b.append(c); b.insertAdjacentHTML("beforeend", `<b><kbd>${i + 1}</kbd>${d.name}</b><small>${d.kind}</small><small>${d.speed} / ${d.glide} / ${d.turn} / ${d.fade}</small>`);
      b.onclick = () => { cfg.disc = i; syncUI(); refreshPred(); beep(520, 0.05, "triangle", 0.05, 1.2); };
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
  function drawCard3D(x, y, z, bank, dirx, dirz, spin, disc, big) {
    // a card (a flat rectangle) at (x, y, z), tilted by the bank, spinning
    const l = Math.hypot(dirx, dirz) || 1, f = [dirx / l, 0, dirz / l], r = [f[2], 0, -f[0]];
    const tilt = bank * 0.55, e1 = [r[0] * Math.cos(tilt), Math.sin(tilt), r[2] * Math.cos(tilt)], e2 = f;
    const c = Math.cos(spin), s = Math.sin(spin), a = [e1[0] * c + e2[0] * s, e1[1] * c + e2[1] * s, e1[2] * c + e2[2] * s], b = [-e1[0] * s + e2[0] * c, -e1[1] * s + e2[1] * c, -e1[2] * s + e2[2] * c];
    const sz = big || 0.42, hw = sz * 0.5, hh = sz * 0.32, quad = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], o = [];
    for (const [u, v] of quad) { if (!project(x + a[0] * u + b[0] * v, y + a[1] * u + b[1] * v, z + a[2] * u + b[2] * v, P)) return; o.push([P.x, P.y]); }
    ctx.fillStyle = "#101010"; ctx.beginPath(); ctx.moveTo(...o[0]); for (let i = 1; i < 4; i++) ctx.lineTo(...o[i]); ctx.closePath(); ctx.fill();
    const m = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)], inner = [m(m(o[0], o[2], 0.1), o[0], 0), 0]; void inner;
    const ctr = [(o[0][0] + o[2][0]) / 2, (o[0][1] + o[2][1]) / 2], sh = o.map((q) => [lerp(q[0], ctr[0], 0.1), lerp(q[1], ctr[1], 0.1)]);
    ctx.fillStyle = disc.color; ctx.beginPath(); ctx.moveTo(...sh[0]); for (let i = 1; i < 4; i++) ctx.lineTo(...sh[i]); ctx.closePath(); ctx.fill();
    const w = Math.hypot(o[1][0] - o[0][0], o[1][1] - o[0][1]);
    if (w > 26) { ctx.save(); ctx.translate(ctr[0], ctr[1]); ctx.rotate(Math.atan2(o[1][1] - o[0][1], o[1][0] - o[0][0])); ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(-w * 0.4, -w * 0.12, w * 0.3, w * 0.3); ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.font = `900 ${Math.max(6, w * 0.22) | 0}px sans-serif`; ctx.textAlign = "left"; ctx.fillText("TTT", -w * 0.04, w * 0.02); ctx.restore(); }
  }
  function drawShadow(x, z, h) {
    const gy = DG.groundAt(h, x, z); if (gy < -40) return; if (!project(x, gy + 0.03, z, P)) return; const k = FOC / P.z, px = P.x, py = P.y;
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(px, py, 0.34 * k, 0.1 * k, 0, 0, 7); ctx.fill();
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
    if (pred && phase === "aim") { ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 2; ctx.beginPath(); pred.pts.forEach((p, i) => { const q = mp(p[0], p[2]); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); ctx.stroke(); }
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
    drawTee(hole);
    // trees and the basket, far to near
    const vis = [];
    for (const t of hole.trees) { const dx = t.x - cam.x, dz = t.z - cam.z, fw = dx * fx + dz * fz; if (fw < 0.5 || fw > 330) continue; if (Math.abs(dx * rx + dz * rz) > fw * 1.1 + 8) continue; vis.push([fw, t]); }
    const bd = (hole.basket.x - cam.x) * fx + (hole.basket.z - cam.z) * fz; vis.push([bd, null]);
    vis.sort((a, b) => b[0] - a[0]);
    for (const [, t] of vis) { if (t) drawTree(t, th, sky); else drawBasket(hole, sky); }
    // the aim line, and the card
    if (phase === "aim" && pred) {
      const pts = pred.pts.filter((_, i) => i % 3 === 0); drawLine(pts, "rgba(255,230,90,.95)", true, 4, 0.0);
      const e = pred.end; if (project(e.x, DG.groundAt(hole, e.x, e.z) + 0.05, e.z, P)) { const k = FOC / P.z; ctx.strokeStyle = pred.kind === "ob" ? "#ff5a4a" : pred.kind === "holed" ? "#7df08f" : "#ffe066"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(P.x, P.y, Math.max(6, 0.7 * k), Math.max(3, 0.25 * k), 0, 0, 7); ctx.stroke(); }
    }
    if (flight) {
      const trail = flight.pts.slice(0, flight.i + 1).filter((_, i, a) => i % 2 === 0 || i === a.length - 1); drawLine(trail, "rgba(255,255,255,.7)", false, 2.5, 0);
      drawShadow(flight.cur[0], flight.cur[2], hole);
      drawCard3D(flight.cur[0], flight.cur[1], flight.cur[2], flight.bank, flight.dx, flight.dz, flight.spin, flight.disc, 1.35);
    } else if (phase !== "between" && phase !== "holed") {
      drawCard3D(lie.x, DG.groundAt(hole, lie.x, lie.z) + 0.05, lie.z, 0.0, Math.sin(cfg.yaw), Math.cos(cfg.yaw), 0, DG.DISCS[cfg.disc], 0.8); // the card on the ground at your feet
    }
    if (flight) { const dd = Math.hypot(flight.cur[0] - lie.x, flight.cur[2] - lie.z); ctx.font = "900 22px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 5; ctx.strokeStyle = "#101010"; ctx.strokeText(`${dd.toFixed(0)} m`, W / 2, H - 22); ctx.fillStyle = "#fff"; ctx.fillText(`${dd.toFixed(0)} m`, W / 2, H - 22); }
    drawHUDOverlay(now); drawBanner(now);
    if (phase === "aim") { // the power gauge and the card you hold
      const x = 22, y = 118, hh = 240, pw = cfg.power; ctx.fillStyle = "rgba(0,0,0,.5)"; rrect(ctx, x - 6, y - 8, 32, hh + 40, 10); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(x, y, 20, hh); const col = `hsl(${120 - pw * 120},85%,55%)`; ctx.fillStyle = col; ctx.fillRect(x, y + hh * (1 - pw), 20, hh * pw);
      ctx.fillStyle = "#fff"; ctx.font = "800 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText(Math.round(pw * 100) + "%", x + 10, y + hh + 18);
      const d = DG.DISCS[cfg.disc]; ctx.textAlign = "left"; ctx.font = "800 14px sans-serif"; ctx.lineWidth = 4; ctx.strokeStyle = "#101010"; const tx = `${d.name} · ${pred ? pred.dist.toFixed(0) : "?"} m`; ctx.strokeText(tx, 70, H - 18); ctx.fillStyle = d.color; ctx.fillText(tx, 70, H - 18);
    }
    $("throwFloat").hidden = phase !== "aim";
  }

  // ---------------- the round ----------------
  const dBasket = () => Math.hypot(hole.basket.x - lie.x, hole.basket.z - lie.z);
  const label = (s, par) => (s === 1 ? "ACE!!" : s - par <= -3 ? "ALBATROSS!" : s - par === -2 ? "EAGLE!" : s - par === -1 ? "BIRDIE!" : s === par ? "PAR" : s - par === 1 ? "BOGEY" : s - par === 2 ? "DOUBLE BOGEY" : "+" + (s - par));
  const total = () => results.reduce((a, b) => a + b, 0) + (hole && (phase === "aim" || phase === "flight") ? Math.min(strokes, DG.MAX_STROKES) : 0);
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
  function setupLie(first) { // a sensible aim, card and power for where you are
    const gp = DG.guidePoint(hole, lie), dB = dBasket(); cfg.yaw = Math.atan2(gp.x - lie.x, gp.z - lie.z); cfg.disc = recommend(dB); cfg.bank = 0; cfg.launch = 1; cfg.hand = 1;
    const c = DG.caddie(hole, lie, { fast: true, discs: [DG.DISCS[cfg.disc]] }); if (c) { cfg.yaw = c.p.yaw; cfg.power = c.p.power; cfg.bank = c.p.bank; cfg.launch = c.p.launch; }
    syncUI(); refreshPred(); void first;
  }
  const params = (p) => Object.assign({ disc: DG.DISCS[cfg.disc].id, yaw: cfg.yaw, power: cfg.power, bank: cfg.bank, launch: cfg.launch, hand: cfg.hand }, p || {});
  function refreshPred() { if (!hole) return; pred = DG.predict(hole, lie, params()); const dd = pred.dist; $("flightInfo").textContent = `${DG.DISCS[cfg.disc].name}: about ${dd.toFixed(0)} m${pred.kind === "ob" ? " (that goes out of bounds!)" : pred.kind === "holed" ? " (in the basket!)" : ""} · basket ${dBasket().toFixed(0)} m away`; hud(); }
  function syncUI() {
    $("power").value = Math.round(cfg.power * 100); $("powEl").textContent = Math.round(cfg.power * 100) + "%";
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
  function throwNow() {
    if (phase !== "aim" || !hole) return;
    strokes++; const p = params(), r = DG.throwCard(hole, lie, p), disc = DG.DISCS[cfg.disc];
    flight = { r, pts: r.pts, i: 0, t: 0, disc, bank: p.bank, hand: p.hand, spin: 0, cur: r.pts[0], dx: Math.sin(p.yaw), dz: Math.cos(p.yaw), wasTree: false };
    phase = "flight"; beep(300, 0.22, "sawtooth", 0.03, 2.2); noise(0.25, 1800, 0.12); hud(); card(); sendOpp(); pred = null;
    $("flightInfo").textContent = "";
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
    const gy = DG.groundAt(hole, lie.x, lie.z), back = 7.5, sy = Math.sin(cfg.yaw), cy = Math.cos(cfg.yaw);
    camT.x = lie.x - sy * back; camT.z = lie.z - cy * back; camT.y = Math.max(gy, DG.groundAt(hole, camT.x, camT.z)) + 2.6; camT.yaw = cfg.yaw; camT.pitch = 0.17;
  }
  function updateCam(dt, now) {
    if (phase === "flight" && flight) {
      const c = flight.cur, l = Math.hypot(flight.dx, flight.dz) || 1, dx = flight.dx / l, dz = flight.dz / l;
      camT.x = c[0] - dx * 9; camT.z = c[2] - dz * 9; camT.y = Math.max(c[1] + 2.4, DG.groundAt(hole, camT.x, camT.z) + 2.4);
      camT.yaw = Math.atan2(dx, dz); const down = (camT.y - c[1]) / 9; camT.pitch = clamp(Math.atan(down), 0.05, 0.5);
    } else if (phase === "aim") aimCam();
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
      let d = 0; if (keys.left) d -= 1; if (keys.right) d += 1; if (d) { cfg.yaw += d * dt * (keys.shift ? 0.25 : 0.9); refreshPred(); }
      let p = 0; if (keys.up) p += 1; if (keys.down) p -= 1; if (p) { cfg.power = clamp(cfg.power + p * dt * 0.4, 0.05, 1); syncUI(); refreshPred(); }
    }
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
    if (e.code === "Space") { e.preventDefault(); if (!e.repeat) throwNow(); return; }
    if (phase !== "aim") return;
    if (/^Digit[1-8]$/.test(e.code)) { cfg.disc = +e.code.slice(5) - 1; syncUI(); refreshPred(); return; }
    if (e.code === "KeyQ") { cfg.bank = clamp(cfg.bank - 0.25, -1, 1); syncUI(); refreshPred(); } else if (e.code === "KeyE") { cfg.bank = clamp(cfg.bank + 0.25, -1, 1); syncUI(); refreshPred(); }
    else if (e.code === "KeyC") caddie(); else if (e.code === "KeyF") { cfg.hand = -cfg.hand; syncUI(); refreshPred(); }
    else if (e.code === "Escape" && mode === "solo") $("quitBtn").click();
  });
  addEventListener("blur", () => { for (const k of Object.keys(keys)) keys[k] = false; });
  addEventListener("keyup", (e) => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
  let dragX = null;
  cv.addEventListener("pointerdown", (e) => { dragX = e.clientX; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (dragX == null || phase !== "aim") return; cfg.yaw += (e.clientX - dragX) * 0.0035; dragX = e.clientX; refreshPred(); });
  cv.addEventListener("pointerup", () => { dragX = null; });
  $("power").addEventListener("input", (e) => { cfg.power = e.target.value / 100; syncUI(); refreshPred(); });
  $("bank").addEventListener("input", (e) => { cfg.bank = e.target.value / 100; syncUI(); refreshPred(); });
  $("launchSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { cfg.launch = +b.dataset.v; syncUI(); refreshPred(); } });
  $("handSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { cfg.hand = +b.dataset.v; syncUI(); refreshPred(); } });
  $("throwBtn").addEventListener("click", throwNow); $("throwFloat").addEventListener("click", throwNow);
  $("aimBtn").addEventListener("click", () => { if (phase !== "aim") return; cfg.yaw = Math.atan2(hole.basket.x - lie.x, hole.basket.z - lie.z); refreshPred(); });
  function caddie() {
    if (phase !== "aim") return; $("flightInfo").textContent = "Caddie is thinking…";
    setTimeout(() => { const c = DG.caddie(hole, lie, { fast: false }); if (c) { cfg.disc = DG.discOf(c.p.disc).n; cfg.yaw = c.p.yaw; cfg.power = c.p.power; cfg.bank = c.p.bank; cfg.launch = c.p.launch; cfg.hand = c.p.hand; syncUI(); refreshPred(); beep(660, 0.1, "triangle", 0.05, 1.3); } }, 20);
  }
  $("caddieBtn").addEventListener("click", caddie);
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
  window.__dg = () => ({ DG, cfg, hole, lie, phase, strokes, results, flight, pred, cam, throwNow, caddie, holeDone, newHole: () => newHole(), goto: (i) => { holeIdx = i; newHole(); }, setLie: (x, z) => { lie = { x, z }; setupLie(); }, frame: (ts) => frame(ts), render: () => render(performance.now()), start: startCourse });
})();
