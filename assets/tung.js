/* TungArt - draws Tung Tung Tung Sahur (a talking log with a baseball bat) with plain canvas calls.
   Normal = wood brown. green: true = the same character in green (used for bombs and pipes). */
(function () {
  const PAL = {
    brown: { light: '#e0a965', mid: '#bd8043', dark: '#8c5a2a', deep: '#5e3a18', ring: '#f1cf9b', bat: '#d9a566', batDark: '#8c5a2a' },
    blue: { light: '#a6dcff', mid: '#4aa8f0', dark: '#2670b8', deep: '#123f70', ring: '#d6efff', bat: '#8fd0ff', batDark: '#2670b8' },
    red: { light: '#ff9a8a', mid: '#e5503c', dark: '#a8281c', deep: '#5e120b', ring: '#ffd0c6', bat: '#ff8a78', batDark: '#a8281c' },
    pink: { light: '#ffc2e0', mid: '#f27ac0', dark: '#b84a8c', deep: '#6b1f50', ring: '#ffe0f0', bat: '#ffa6d4', batDark: '#b84a8c' },
    ghost: { light: '#f4fbff', mid: '#cfe3ee', dark: '#8fb0c4', deep: '#4a6678', ring: '#ffffff', bat: '#e6f4fb', batDark: '#8fb0c4' },
    gold: { light: '#fff3a8', mid: '#ffd23f', dark: '#c9971a', deep: '#7a5a0a', ring: '#fff8cf', bat: '#ffe27a', batDark: '#c9971a' },
    green: { light: '#7df08f', mid: '#33cc57', dark: '#1f9a3e', deep: '#116a29', ring: '#b8ffc6', bat: '#58e077', batDark: '#1f9a3e' },
  };
  const pal = (o) => (o && o.pal && PAL[o.pal] ? PAL[o.pal] : o && o.green ? PAL.green : PAL.brown);

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function eye(ctx, x, y, r, look, kind, deep) {
    if (kind === 'x') {
      ctx.strokeStyle = deep; ctx.lineWidth = r * 0.45; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - r * .8, y - r * .8); ctx.lineTo(x + r * .8, y + r * .8); ctx.moveTo(x + r * .8, y - r * .8); ctx.lineTo(x - r * .8, y + r * .8); ctx.stroke();
      return;
    }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.lineWidth = r * 0.18; ctx.strokeStyle = deep; ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + look[0] * r * 0.35, y + look[1] * r * 0.35, r * 0.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + look[0] * r * 0.35 - r * .15, y + look[1] * r * 0.35 - r * .18, r * 0.16, 0, 7); ctx.fill();
  }

  // Upright character, centred on (cx, cy), `h` pixels tall.
  // opts: green, rot (radians), flip, bat (radians, 0 = pointing up), eyes ('normal'|'x'|'blink'), mouth ('smile'|'open'|'oh'), look [dx,dy], alpha, legs (0..1 walk phase)
  function draw(ctx, cx, cy, h, o) {
    o = o || {};
    const P = pal(o), s = h / 160;
    ctx.save();
    ctx.translate(cx, cy);
    if (o.rot) ctx.rotate(o.rot);
    if (o.flip) ctx.scale(-1, 1);
    ctx.scale(s, s);
    ctx.translate(-50, -80);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    const sw = Math.sin((o.legs || 0) * Math.PI * 2) * 5;
    const has = (k) => !o.parts || o.parts[k];
    // legs
    if (has('legs')) {
    ctx.strokeStyle = P.dark; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(38, 124); ctx.lineTo(36 + sw, 150); ctx.moveTo(62, 124); ctx.lineTo(64 - sw, 150); ctx.stroke();
    ctx.fillStyle = P.deep; ctx.beginPath(); ctx.ellipse(34 + sw, 152, 10, 5, 0, 0, 7); ctx.ellipse(66 - sw, 152, 10, 5, 0, 0, 7); ctx.fill();
    }
    // far arm
    if (has('armFar')) {
    ctx.strokeStyle = P.dark; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(24, 78); ctx.quadraticCurveTo(10, 90, 8, 108); ctx.stroke();
    }
    // bat (held in the near hand, swings around the hand at (80,78))
    if (has('bat')) {
    ctx.save();
    ctx.translate(80, 78); ctx.rotate(o.bat != null ? o.bat : 0.45);
    ctx.strokeStyle = P.batDark; ctx.lineWidth = 15; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -88); ctx.stroke();
    ctx.strokeStyle = P.bat; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, -88); ctx.stroke();
    ctx.strokeStyle = P.batDark; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -10); ctx.stroke();
    ctx.restore();
    }
    // body log
    const g = ctx.createLinearGradient(20, 0, 80, 0);
    g.addColorStop(0, P.dark); g.addColorStop(.28, P.mid); g.addColorStop(.6, P.light); g.addColorStop(1, P.mid);
    ctx.fillStyle = g; rr(ctx, 20, 14, 60, 118, 22); ctx.fill();
    ctx.strokeStyle = P.deep; ctx.lineWidth = 3; ctx.stroke();
    // bark
    ctx.strokeStyle = P.deep; ctx.globalAlpha = (o.alpha != null ? o.alpha : 1) * 0.5; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const [x, y1, y2] of [[28, 40, 54], [31, 100, 118], [70, 30, 46], [72, 104, 120], [50, 118, 126], [44, 24, 30]]) { ctx.beginPath(); ctx.moveTo(x, y1); ctx.quadraticCurveTo(x + 3, (y1 + y2) / 2, x - 1, y2); ctx.stroke(); }
    ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
    // top cut ring
    ctx.fillStyle = P.ring; ctx.beginPath(); ctx.ellipse(50, 22, 26, 10, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = P.dark; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(50, 22, 18, 6.5, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(50, 22, 9, 3, 0, 0, 7); ctx.stroke();
    // face
    if (has('face')) {
    const look = o.look || [0.4, 0.3], ek = o.eyes || 'normal';
    if (ek === 'blink') {
      ctx.strokeStyle = P.deep; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(30, 66); ctx.lineTo(46, 66); ctx.moveTo(54, 66); ctx.lineTo(70, 66); ctx.stroke();
    } else { eye(ctx, 38, 66, 11.5, look, ek, P.deep); eye(ctx, 63, 66, 11.5, look, ek, P.deep); }
    ctx.strokeStyle = P.deep; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(28, 50); ctx.lineTo(44, 54); ctx.moveTo(73, 50); ctx.lineTo(58, 54); ctx.stroke(); // brows
    const mo = o.mouth || 'smile';
    ctx.fillStyle = '#2b1208';
    if (mo === 'open') { ctx.beginPath(); ctx.ellipse(50, 98, 10, 12, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#e8574d'; ctx.beginPath(); ctx.ellipse(50, 104, 6, 5, 0, 0, 7); ctx.fill(); }
    else if (mo === 'oh') { ctx.beginPath(); ctx.ellipse(50, 98, 6, 8, 0, 0, 7); ctx.fill(); }
    else if (mo === 'sad') { ctx.strokeStyle = '#2b1208'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(38, 104); ctx.quadraticCurveTo(50, 92, 62, 104); ctx.stroke(); }
    else { ctx.strokeStyle = '#2b1208'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(38, 94); ctx.quadraticCurveTo(50, 106, 62, 94); ctx.stroke(); }
    }
    // near arm
    if (has('bat')) {
    ctx.strokeStyle = P.dark; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(76, 80); ctx.quadraticCurveTo(84, 92, 80, 78); ctx.stroke();
    ctx.fillStyle = P.mid; ctx.beginPath(); ctx.arc(80, 78, 7, 0, 7); ctx.fill(); ctx.strokeStyle = P.deep; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }

  // A long horizontal log (used as a ship). Front (face) is on the right. len/thick in pixels.
  function drawLog(ctx, x, y, len, thick, o) {
    o = o || {};
    const P = pal(o);
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    const g = ctx.createLinearGradient(0, y, 0, y + thick);
    g.addColorStop(0, P.light); g.addColorStop(.45, P.mid); g.addColorStop(1, P.dark);
    ctx.fillStyle = g; rr(ctx, x, y, len, thick, thick * 0.45); ctx.fill();
    ctx.strokeStyle = P.deep; ctx.lineWidth = Math.max(1.5, thick * 0.06); ctx.stroke();
    ctx.strokeStyle = P.deep; ctx.globalAlpha = (o.alpha != null ? o.alpha : 1) * 0.45; ctx.lineWidth = Math.max(1, thick * 0.05); ctx.lineCap = 'round';
    for (let i = 0; i < Math.floor(len / (thick * 0.9)); i++) {
      const bx = x + thick * 0.5 + i * thick * 0.9;
      ctx.beginPath(); ctx.moveTo(bx, y + thick * 0.22); ctx.lineTo(bx + thick * 0.18, y + thick * 0.4); ctx.moveTo(bx + thick * 0.3, y + thick * 0.68); ctx.lineTo(bx + thick * 0.1, y + thick * 0.82); ctx.stroke();
    }
    ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
    // cut end (back)
    ctx.fillStyle = P.ring; ctx.beginPath(); ctx.ellipse(x + thick * 0.28, y + thick / 2, thick * 0.17, thick * 0.4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = P.dark; ctx.lineWidth = Math.max(1, thick * 0.04); ctx.beginPath(); ctx.ellipse(x + thick * 0.28, y + thick / 2, thick * 0.09, thick * 0.22, 0, 0, 7); ctx.stroke();
    // face at the front
    const fx = x + len - thick * 0.62, er = thick * 0.2;
    eye(ctx, fx, y + thick * 0.36, er, [0.5, 0.2], o.dead ? 'x' : 'normal', P.deep);
    eye(ctx, fx + thick * 0.4, y + thick * 0.36, er, [0.5, 0.2], o.dead ? 'x' : 'normal', P.deep);
    ctx.strokeStyle = '#2b1208'; ctx.lineWidth = Math.max(1.5, thick * 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(fx + thick * 0.02, y + thick * 0.72); ctx.quadraticCurveTo(fx + thick * 0.2, y + thick * 0.84, fx + thick * 0.38, y + thick * 0.72); ctx.stroke();
    // bat lying along the deck
    ctx.strokeStyle = P.batDark; ctx.lineWidth = Math.max(2, thick * 0.17);
    ctx.beginPath(); ctx.moveTo(x + thick * 0.6, y + thick * 0.08); ctx.lineTo(x + Math.min(len * 0.55, thick * 1.6), y - thick * 0.02); ctx.stroke();
    ctx.strokeStyle = P.bat; ctx.lineWidth = Math.max(1.5, thick * 0.11);
    ctx.beginPath(); ctx.moveTo(x + thick * 0.8, y + thick * 0.07); ctx.lineTo(x + Math.min(len * 0.55, thick * 1.6), y - thick * 0.02); ctx.stroke();
    ctx.restore();
  }

  // A tall pipe made of a green (or brown) log standing on its end, with Tung's face near the opening.
  // (x, y) top-left; the "mouth" end is the end facing the gap: end = 'bottom' | 'top'.
  function drawPipe(ctx, x, y, w, h, end, o) {
    o = o || {};
    const P = pal(o);
    ctx.save();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, P.dark); g.addColorStop(.3, P.mid); g.addColorStop(.62, P.light); g.addColorStop(1, P.mid);
    ctx.fillStyle = g; rr(ctx, x, y, w, h, Math.min(w * 0.3, 18)); ctx.fill();
    ctx.strokeStyle = P.deep; ctx.lineWidth = 3; ctx.stroke();
    // bark streaks
    ctx.strokeStyle = P.deep; ctx.globalAlpha = 0.35; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let yy = y + 20; yy < y + h - 20; yy += 34) { ctx.beginPath(); ctx.moveTo(x + w * 0.2, yy); ctx.quadraticCurveTo(x + w * 0.25, yy + 8, x + w * 0.18, yy + 16); ctx.moveTo(x + w * 0.76, yy + 14); ctx.quadraticCurveTo(x + w * 0.8, yy + 22, x + w * 0.74, yy + 30); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // rim at the mouth end
    const ry = end === 'bottom' ? y + h - 14 : y + 14;
    ctx.fillStyle = P.ring; ctx.beginPath(); ctx.ellipse(x + w / 2, ry, w * 0.46, 11, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = P.dark; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + w / 2, ry, w * 0.3, 7, 0, 0, 7); ctx.stroke();
    // face on the body near the mouth end
    const fy = end === 'bottom' ? y + h - 70 : y + 70;
    if (h > 120) {
      const er = Math.min(11, w * 0.17);
      eye(ctx, x + w * 0.32, fy, er, [0, end === 'bottom' ? 0.7 : -0.7], 'normal', P.deep);
      eye(ctx, x + w * 0.68, fy, er, [0, end === 'bottom' ? 0.7 : -0.7], 'normal', P.deep);
      ctx.strokeStyle = '#1b0c05'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + w * 0.38, fy + (end === 'bottom' ? 26 : -26)); ctx.quadraticCurveTo(x + w * 0.5, fy + (end === 'bottom' ? 34 : -34), x + w * 0.62, fy + (end === 'bottom' ? 26 : -26)); ctx.stroke();
    }
    ctx.restore();
  }

  // A falling green Tung used as a bomb (small, spinning, with wide eyes).
  function drawBomb(ctx, cx, cy, size, o) {
    o = o || {};
    draw(ctx, cx, cy, size, { green: true, rot: o.rot || 0, bat: -0.9, eyes: 'normal', mouth: 'oh', look: [0, 1], legs: o.t || 0, alpha: o.alpha });
  }

  function explosion(ctx, cx, cy, r, t) { // t: 0..1
    ctx.save();
    ctx.translate(cx, cy);
    const k = Math.min(1, t);
    const spikes = 10;
    ctx.fillStyle = `rgba(255,${Math.round(190 - 120 * k)},40,${1 - k * 0.2})`;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2, rad = r * (0.5 + 0.55 * k) * (i % 2 ? 0.55 : 1);
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,240,170,${1 - k})`; ctx.beginPath(); ctx.arc(0, 0, r * 0.35 * (1 - k * 0.4), 0, 7); ctx.fill();
    ctx.restore();
  }

  const cache = {};
  function dataURL(o, w, h) { // handy for <img> tags
    const key = JSON.stringify([o, w, h]);
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w / 2, h / 2, h * 0.96, o);
    return (cache[key] = c.toDataURL('image/png'));
  }

  window.TungArt = { draw, drawLog, drawPipe, drawBomb, explosion, dataURL, PAL };
})();
