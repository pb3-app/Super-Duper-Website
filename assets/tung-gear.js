/* TungGear - draws what a tung wears (hats, faces, outfits, bats, skins, wings, cape, trail bits) with plain canvas calls.
   The arena draws a squat tung; TungArt (the tall tung the games use) draws the same things through TungGear too, so what you
   bought in the shop shows on you everywhere. Every function takes the canvas context first. */
(function (root) {
  let ctx = null;
  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function heart(cx, cy, s) {
    ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.2, cx - s * 0.8, cy - s * 1.3, cx, cy - s * 0.45);
    ctx.bezierCurveTo(cx + s * 0.8, cy - s * 1.3, cx + s * 1.6, cy - s * 0.2, cx, cy + s * 0.9); ctx.closePath();
  }
  function star(cx, cy, s) {
    ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.quadraticCurveTo(cx, cy, cx + s, cy); ctx.quadraticCurveTo(cx, cy, cx, cy + s);
    ctx.quadraticCurveTo(cx, cy, cx - s, cy); ctx.quadraticCurveTo(cx, cy, cx, cy - s); ctx.closePath();
  }
  const INK = "#3d2412";

  function drawBat(r, id) {
    const path = () => { ctx.beginPath(); ctx.moveTo(r * 0.6, -5); ctx.lineTo(r * 2.6, -11); ctx.quadraticCurveTo(r * 2.9, 0, r * 2.6, 11); ctx.lineTo(r * 0.6, 5); ctx.closePath(); };
    const grad = (...stops) => { const g = ctx.createLinearGradient(r * 0.6, 0, r * 2.9, 0); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
    let fill = "#d9a066";
    if (id === "lightning") { // a bolt instead of a bat
      ctx.save(); ctx.shadowColor = "#fff27a"; ctx.shadowBlur = 12; ctx.fillStyle = "#ffe14d"; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = "round";
      ctx.beginPath(); [[0.6, -4], [1.3, -13], [1.5, -3], [2.2, -12], [2.35, 1], [3.0, 0], [2.1, 12], [1.95, 3], [1.3, 12], [1.2, 3]].forEach(([x, y], i) => (i ? ctx.lineTo(r * x, y) : ctx.moveTo(r * x, y))); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); return;
    }
    if (id === "rolling") fill = grad([0, "#f0dfb8"], [1, "#d8b87a"]);
    else if (id === "carrot") fill = grad([0, "#ff9a3c"], [1, "#e8590c"]);
    else if (id === "pencil") fill = "#ffd23f";
    else if (id === "leek") fill = grad([0, "#fafff0"], [0.4, "#e9f7d0"], [1, "#3f9a4a"]);
    else if (id === "neon") fill = "#15152b";
    else if (id === "cactus") fill = grad([0, "#58b858"], [1, "#2f8a3a"]);
    else if (id === "galaxybat") fill = grad([0, "#2b1b5e"], [1, "#8e44ff"]);
    if (id === "candy") fill = "#ffffff";
    else if (id === "baguette") fill = grad([0, "#e8c07a"], [1, "#c98f43"]);
    else if (id === "ice") fill = grad([0, "#e6f9ff"], [1, "#62c1ff"]);
    else if (id === "flame") fill = grad([0, "#ffd23f"], [0.55, "#ff8a2a"], [1, "#ff3d2b"]);
    else if (id === "goldbat") fill = grad([0, "#fff1a8"], [0.5, "#ffd23f"], [1, "#c9971a"]);
    ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.lineWidth = 3; path(); ctx.fill();
    ctx.save(); path(); ctx.clip();
    if (id === "rolling") { ctx.fillStyle = "#b07a40"; ctx.fillRect(r * 0.5, -14, r * 0.55, 28); ctx.fillRect(r * 2.2, -14, r * 0.8, 28); }
    if (id === "carrot") { ctx.strokeStyle = "rgba(150, 60, 0, 0.45)"; ctx.lineWidth = 2; for (let x = r * 0.9; x < r * 2.6; x += 18) { ctx.beginPath(); ctx.moveTo(x, -9); ctx.lineTo(x + 5, -4); ctx.moveTo(x + 8, 9); ctx.lineTo(x + 3, 4); ctx.stroke(); } }
    if (id === "pencil") { ctx.fillStyle = "#ff8fb1"; ctx.fillRect(r * 0.5, -14, r * 0.45, 28); ctx.fillStyle = "#c0c6cc"; ctx.fillRect(r * 0.95, -14, 6, 28); ctx.fillStyle = "#f2d2a0"; ctx.beginPath(); ctx.moveTo(r * 2.0, -14); ctx.lineTo(r * 3.0, 0); ctx.lineTo(r * 2.0, 14); ctx.fill(); ctx.fillStyle = "#333"; ctx.beginPath(); ctx.moveTo(r * 2.65, -4); ctx.lineTo(r * 3.0, 0); ctx.lineTo(r * 2.65, 4); ctx.fill(); ctx.strokeStyle = "rgba(160, 110, 0, 0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * 1.1, -4); ctx.lineTo(r * 2.0, -4); ctx.moveTo(r * 1.1, 4); ctx.lineTo(r * 2.0, 4); ctx.stroke(); }
    if (id === "leek") { ctx.strokeStyle = "rgba(30, 90, 40, 0.5)"; ctx.lineWidth = 2; for (const y of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(r * 1.5, y); ctx.lineTo(r * 3, y * 1.3); ctx.stroke(); } }
    if (id === "cactus") { ctx.fillStyle = "#fff"; for (let x = r * 0.9; x < r * 2.7; x += 14) for (const y of [-6, 5]) { ctx.fillRect(x + (y > 0 ? 6 : 0), y, 2.5, 2.5); } ctx.fillStyle = "#ff5fa2"; ctx.beginPath(); ctx.arc(r * 2.7, 0, 5, 0, 7); ctx.fill(); }
    if (id === "galaxybat") { const tw = performance.now() / 300; ctx.fillStyle = "#fff"; const ga = ctx.globalAlpha; for (let i = 0; i < 12; i++) { const x = r * 0.7 + ((i * 37) % 100) / 100 * r * 2.2, y = ((i * 53) % 100) / 100 * 18 - 9; ctx.globalAlpha = ga * (0.4 + 0.6 * Math.abs(Math.sin(tw + i))); ctx.fillRect(x, y, 2.2, 2.2); } ctx.globalAlpha = ga; }
    if (id === "candy") { ctx.strokeStyle = "#e63946"; ctx.lineWidth = 7; for (let x = r * 0.4; x < r * 3; x += 16) { ctx.beginPath(); ctx.moveTo(x, -14); ctx.lineTo(x + 12, 14); ctx.stroke(); } }
    if (id === "baguette") { ctx.strokeStyle = "rgba(120, 70, 20, 0.55)"; ctx.lineWidth = 2.5; for (let x = r * 1.1; x < r * 2.6; x += 15) { ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x + 7, 5); ctx.stroke(); } }
    if (id === "goldbat" || id === "ice") { ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; ctx.fillRect(r * 0.7, -8, r * 2.2, 3); }
    ctx.restore();
    if (id === "neon") { ctx.save(); ctx.shadowColor = "#39f0ff"; ctx.shadowBlur = 14; ctx.strokeStyle = "#39f0ff"; ctx.lineWidth = 3; path(); ctx.stroke(); ctx.restore(); return; }
    path(); ctx.stroke();
  }

  // ---------- skins: a fill (one colour or a gradient) with a pattern over it ----------
  function skinFill(ci, bh) {
    if (!ci.fill2) return ci.fill;
    const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2); g.addColorStop(0, ci.fill); g.addColorStop(1, ci.fill2); return g;
  }
  function drawSkin(pat, bw, bh, t) {
    ctx.save(); rr(-bw / 2, -bh / 2, bw, bh, 12); ctx.clip();
    const x0 = -bw / 2, y0 = -bh / 2;
    if (pat === "tiger") { ctx.strokeStyle = "#5a2d0c"; ctx.lineWidth = 4; for (let y = y0 + 6; y < bh / 2; y += 11) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo(0, y + 6, -x0, y - 2); ctx.stroke(); } }
    else if (pat === "polka") { ctx.fillStyle = "#fff"; for (let y = y0 + 7, row = 0; y < bh / 2; y += 12, row++) for (let x = x0 + 6 + (row % 2) * 7; x < -x0; x += 14) { ctx.beginPath(); ctx.arc(x, y, 2.8, 0, 7); ctx.fill(); } }
    else if (pat === "checker") { ctx.fillStyle = "#2b2b2b"; const c = 8; for (let y = 0, row = 0; y0 + y < bh / 2; y += c, row++) for (let x = (row % 2) * c; x0 + x < -x0; x += c * 2) ctx.fillRect(x0 + x, y0 + y, c, c); }
    else if (pat === "camo") { const cols = ["#4a5f2a", "#a3b36a", "#3b4a21"]; for (let i = 0; i < 9; i++) { ctx.fillStyle = cols[i % 3]; ctx.beginPath(); ctx.ellipse(x0 + ((i * 41) % 100) / 100 * bw, y0 + ((i * 67) % 100) / 100 * bh, 9, 6, i, 0, 7); ctx.fill(); } }
    else if (pat === "ocean") { ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2; for (let y = y0 + 10; y < bh / 2; y += 12) { ctx.beginPath(); for (let x = x0; x <= -x0; x += 4) ctx.lineTo(x, y + Math.sin(x / 4 + t * 2 + y) * 2); ctx.stroke(); } }
    else if (pat === "sunset") { ctx.fillStyle = "rgba(255, 79, 138, 0.45)"; ctx.fillRect(x0, -bh * 0.1, bw, bh * 0.25); ctx.fillStyle = "#fff6b0"; ctx.beginPath(); ctx.arc(0, y0 + 10, 7, 0, 7); ctx.fill(); }
    else if (pat === "galaxy") { ctx.fillStyle = "rgba(255, 90, 200, 0.25)"; ctx.beginPath(); ctx.ellipse(-3, 2, 14, 24, 0.5, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; const ga = ctx.globalAlpha; for (let i = 0; i < 14; i++) { ctx.globalAlpha = ga * (0.35 + 0.65 * Math.abs(Math.sin(t * 2 + i * 1.7))); ctx.fillRect(x0 + ((i * 37) % 100) / 100 * bw, y0 + ((i * 59) % 100) / 100 * bh, 2.2, 2.2); } ctx.globalAlpha = ga; }
    else if (pat === "rainbow") { const g = ctx.createLinearGradient(0, y0, 0, bh / 2); ["#ff4d4d", "#ff9a3c", "#ffe14d", "#5fd16b", "#4cb5ff", "#9b6bff"].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c)); ctx.fillStyle = g; ctx.fillRect(x0, y0, bw, bh); }
    ctx.restore(); ctx.strokeStyle = INK; ctx.lineWidth = 3; rr(-bw / 2, -bh / 2, bw, bh, 12); ctx.stroke();
  }
  function drawWings(t) {
    const flap = Math.sin(t * 5) * 6;
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#fdfdff"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(s * 14, -6); ctx.quadraticCurveTo(s * 40, -46 - flap, s * 58, -22 - flap); ctx.quadraticCurveTo(s * 50, -16 - flap / 2, s * 56, -6); ctx.quadraticCurveTo(s * 46, -4, s * 50, 8); ctx.quadraticCurveTo(s * 34, 2, s * 36, 14); ctx.quadraticCurveTo(s * 22, 8, s * 14, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  function drawHat(id, t) {
    const top = -29;
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.lineJoin = "round";
    switch (id) {
      case "party":
        ctx.fillStyle = "#ff4fb8"; ctx.beginPath(); ctx.moveTo(-15, top + 3); ctx.lineTo(15, top + 3); ctx.lineTo(0, top - 40); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; for (const k of [0.3, 0.6]) { ctx.beginPath(); ctx.moveTo(-15 * (1 - k) - 1, top + 3 - 43 * k); ctx.lineTo(15 * (1 - k) + 1, top + 3 - 43 * k); ctx.stroke(); }
        ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, top - 41, 5, 0, 7); ctx.fill(); ctx.stroke(); break;
      case "beanie":
        ctx.fillStyle = "#3a86ff"; ctx.beginPath(); ctx.arc(0, top + 5, 22, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#1d5fd1"; rr(-23, top + 1, 46, 10, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, top - 19, 6, 0, 7); ctx.fill(); ctx.stroke(); break;
      case "cowboy":
        ctx.fillStyle = "#8a5a2b"; ctx.beginPath(); ctx.ellipse(0, top + 3, 35, 8, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#9a6a33"; rr(-15, top - 21, 30, 25, 9); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.fillRect(-15, top - 3, 30, 5); break;
      case "chef":
        ctx.fillStyle = "#fff"; for (const [x, y, r] of [[-12, -16, 11], [12, -16, 11], [0, -22, 13]]) { ctx.beginPath(); ctx.arc(x, top + y, r, 0, 7); ctx.fill(); ctx.stroke(); }
        ctx.fillRect(-18, top - 10, 36, 13); ctx.strokeRect(-18, top - 10, 36, 13); break;
      case "tophat":
        ctx.fillStyle = "#1f1f24"; rr(-15, top - 35, 30, 36, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#d62839"; ctx.fillRect(-15, top - 9, 30, 7);
        ctx.fillStyle = "#1f1f24"; rr(-25, top - 2, 50, 7, 3); ctx.fill(); ctx.stroke(); break;
      case "propeller":
        ctx.fillStyle = "#e63946"; ctx.beginPath(); ctx.arc(0, top + 3, 17, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, top - 14); ctx.lineTo(0, top - 23); ctx.stroke();
        ctx.save(); ctx.translate(0, top - 24); ctx.rotate(t * 14); ctx.fillStyle = "#ffd23f";
        ctx.beginPath(); ctx.ellipse(0, 0, 17, 3.2, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); break;
      case "crown":
        ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.moveTo(-19, top + 5); ctx.lineTo(-19, top - 15); ctx.lineTo(-10, top - 5); ctx.lineTo(0, top - 21); ctx.lineTo(10, top - 5); ctx.lineTo(19, top - 15); ctx.lineTo(19, top + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
        for (const [x, c] of [[-10, "#e63946"], [0, "#3a86ff"], [10, "#2ec4b6"]]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, top - 1, 3.2, 0, 7); ctx.fill(); } break;
      case "bucket":
        ctx.fillStyle = "#e8d9a0"; ctx.beginPath(); ctx.moveTo(-16, top + 5); ctx.lineTo(-13, top - 15); ctx.lineTo(13, top - 15); ctx.lineTo(16, top + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, top + 5, 27, 6, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#9a8a50"; ctx.fillRect(-15, top - 4, 30, 5); break;
      case "cap":
        ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.arc(0, top + 5, 19, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#a31d2b"; ctx.beginPath(); ctx.ellipse(14, top + 5, 16, 4, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, top - 14, 3, 0, 7); ctx.fill(); break;
      case "headband":
        ctx.fillStyle = "#ff5a2b"; rr(-23, top + 6, 46, 8, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillRect(-23, top + 9, 46, 2);
        ctx.fillStyle = "#ff5a2b"; ctx.beginPath(); ctx.moveTo(23, top + 10); ctx.lineTo(34, top + 4); ctx.lineTo(32, top + 16); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case "wizard":
        ctx.fillStyle = "#5b2fb8"; ctx.beginPath(); ctx.moveTo(-19, top + 4); ctx.quadraticCurveTo(-4, top - 20, 12, top - 48); ctx.quadraticCurveTo(14, top - 20, 19, top + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, top + 5, 31, 7, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ffd23f"; star(-4, top - 12, 4); ctx.fill(); star(6, top - 24, 3); ctx.fill(); break;
      case "pirate":
        ctx.fillStyle = "#1f1f24"; ctx.beginPath(); ctx.moveTo(-27, top + 6); ctx.quadraticCurveTo(-14, top - 30, 0, top - 22); ctx.quadraticCurveTo(14, top - 30, 27, top + 6); ctx.quadraticCurveTo(0, top - 2, -27, top + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, top - 10, 5, 0, 7); ctx.fill(); ctx.fillStyle = "#1f1f24"; ctx.fillRect(-3, top - 12, 2, 3); ctx.fillRect(1, top - 12, 2, 3); break;
      case "santa":
        ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.moveTo(-19, top + 4); ctx.lineTo(19, top + 4); ctx.quadraticCurveTo(16, top - 20, 28, top - 24); ctx.quadraticCurveTo(-4, top - 40, -19, top + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; rr(-22, top - 2, 44, 10, 5); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(28, top - 24, 6, 0, 7); ctx.fill(); ctx.stroke(); break;
      case "viking":
        ctx.fillStyle = "#f3ead2"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 16, top + 1); ctx.quadraticCurveTo(s * 36, top - 2, s * 31, top - 26); ctx.quadraticCurveTo(s * 25, top - 10, s * 12, top - 8); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = "#9aa0a6"; ctx.beginPath(); ctx.arc(0, top + 6, 20, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#6c7279"; ctx.fillRect(-20, top + 2, 40, 5); break;
      case "flower":
        ctx.strokeStyle = "#3f9a4a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, top + 18, 24, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = INK;
        [[-17, 0, "#ff7aa8"], [-8, -5, "#ffd23f"], [3, -6, "#fff"], [13, -3, "#ff7aa8"], [20, 4, "#c9a7ff"]].forEach(([x, y, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, top + y, 5.5, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#ffb000"; ctx.beginPath(); ctx.arc(x, top + y, 1.8, 0, 7); ctx.fill(); }); break;
      case "knight":
        ctx.fillStyle = "#b8bec6"; rr(-19, top - 17, 38, 25, 10); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#2b2f36"; ctx.fillRect(-14, top - 5, 28, 5);
        ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.ellipse(0, top - 22, 5, 11, 0.2, 0, 7); ctx.fill(); ctx.stroke(); break;
      case "astronaut":
        ctx.fillStyle = "rgba(170, 225, 255, 0.28)"; ctx.strokeStyle = "#e6eef6"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -4, 31, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -4, 24, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke(); break;
      case "sombrero":
        ctx.fillStyle = "#e6b95a"; ctx.beginPath(); ctx.ellipse(0, top + 5, 43, 9, 0, 0, 7); ctx.fill(); ctx.stroke();
        rr(-13, top - 22, 26, 26, 9); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#d62839"; ctx.fillRect(-13, top - 4, 26, 6);
        ctx.fillStyle = "#2ec4b6"; for (const x of [-8, 0, 8]) ctx.fillRect(x - 1.5, top - 3, 3, 4); break;
      case "pharaoh":
        for (const s of [-1, 1]) { for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? "#2f6fe0" : "#ffd23f"; ctx.fillRect(s > 0 ? 16 : -26, top + 2 + i * 6, 10, 6); } ctx.strokeRect(s > 0 ? 16 : -26, top + 2, 10, 36); }
        ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.moveTo(-26, top + 4); ctx.lineTo(-19, top - 24); ctx.lineTo(19, top - 24); ctx.lineTo(26, top + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#2f6fe0"; for (const x of [-12, -4, 4, 12]) ctx.fillRect(x - 2, top - 22, 4, 24); ctx.fillStyle = "#e63946"; ctx.beginPath(); ctx.arc(0, top - 6, 3.5, 0, 7); ctx.fill(); break;
      case "flamecrown": {
        ctx.save(); ctx.shadowColor = "#ff8a2a"; ctx.shadowBlur = 14;
        for (let i = -2; i <= 2; i++) { const h = 20 + (i === 0 ? 10 : 0) + Math.sin(t * 9 + i * 1.7) * 4; ctx.fillStyle = "#ff5a2b"; ctx.beginPath(); ctx.moveTo(i * 8 - 6, top + 2); ctx.quadraticCurveTo(i * 8 - 2, top - h * 0.6, i * 8 + Math.sin(t * 7 + i) * 3, top - h); ctx.quadraticCurveTo(i * 8 + 3, top - h * 0.5, i * 8 + 6, top + 2); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.moveTo(i * 8 - 3, top + 2); ctx.quadraticCurveTo(i * 8, top - h * 0.45, i * 8, top - h * 0.6); ctx.quadraticCurveTo(i * 8 + 1, top - h * 0.3, i * 8 + 3, top + 2); ctx.fill(); }
        ctx.restore(); ctx.fillStyle = "#c9971a"; rr(-20, top - 1, 40, 8, 3); ctx.fill(); ctx.stroke(); break; }
      case "unicorn": {
        const g = ctx.createLinearGradient(0, top - 36, 0, top + 4); g.addColorStop(0, "#fff0fa"); g.addColorStop(1, "#ffb3e6");
        ctx.save(); ctx.shadowColor = "#ffd6f5"; ctx.shadowBlur = 10; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-7, top + 4); ctx.lineTo(0, top - 38); ctx.lineTo(7, top + 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        ctx.strokeStyle = "#e08ac8"; ctx.lineWidth = 2; for (let i = 1; i < 5; i++) { const y = top + 4 - i * 8; ctx.beginPath(); ctx.moveTo(-6 + i, y); ctx.lineTo(6 - i, y - 4); ctx.stroke(); }
        ctx.fillStyle = "#fff6b0"; star(12 + Math.sin(t * 3) * 3, top - 22, 3 + Math.abs(Math.sin(t * 4)) * 2); ctx.fill(); break; }
      case "halo":
        ctx.save(); ctx.shadowColor = "#fff2a8"; ctx.shadowBlur = 14; ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.ellipse(0, top - 17 + Math.sin(t * 3) * 2, 18, 6, 0, 0, 7); ctx.stroke(); ctx.restore(); break;
    }
  }

  function drawFace(id) {
    ctx.lineJoin = "round"; ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
    switch (id) {
      case "sunglasses":
        ctx.fillStyle = "#15151a"; rr(-18, -17, 16, 12, 4); ctx.fill(); rr(2, -17, 16, 12, 4); ctx.fill();
        ctx.strokeStyle = "#15151a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-3, -13); ctx.lineTo(3, -13); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(-15, -15, 5, 2); ctx.fillRect(5, -15, 5, 2); break;
      case "mustache":
        ctx.fillStyle = "#2b1a0e"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 7, 0, 9, 4.5, s * 0.35, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(s * 15, 3, 3, 0, 7); ctx.fill(); } break;
      case "monocle":
        ctx.strokeStyle = "#e0a91a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(8, -10, 9.5, 0, 7); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(16, -5); ctx.quadraticCurveTo(23, 4, 19, 17); ctx.stroke(); break;
      case "bandana":
        ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.moveTo(-21, -3); ctx.lineTo(21, -3); ctx.lineTo(21, 4); ctx.lineTo(0, 22); ctx.lineTo(-21, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; for (const [x, y] of [[-10, 2], [0, 8], [10, 2], [0, 0]]) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill(); } break;
      case "glasses":
        ctx.strokeStyle = "#5a3a1a"; ctx.lineWidth = 2.5; for (const x of [-8, 8]) { ctx.beginPath(); ctx.arc(x, -10, 8.5, 0, 7); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(-0.5, -11); ctx.lineTo(0.5, -11); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.25)"; for (const x of [-8, 8]) { ctx.beginPath(); ctx.arc(x, -10, 8, 0, 7); ctx.fill(); } break;
      case "eyepatch":
        ctx.strokeStyle = "#15151a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-21, -22); ctx.lineTo(8, -10); ctx.lineTo(21, -3); ctx.stroke();
        ctx.fillStyle = "#15151a"; ctx.beginPath(); ctx.ellipse(8, -10, 9, 8, 0.3, 0, 7); ctx.fill(); break;
      case "blush":
        ctx.fillStyle = "rgba(255, 90, 130, 0.5)"; for (const x of [-16, 16]) { ctx.beginPath(); ctx.ellipse(x, 1, 6, 3.5, 0, 0, 7); ctx.fill(); } break;
      case "goggles":
        ctx.fillStyle = "#ff8c2a"; ctx.fillRect(-22, -12.5, 44, 5);
        for (const x of [-8, 8]) { ctx.fillStyle = "rgba(120, 225, 255, 0.55)"; ctx.strokeStyle = "#ff8c2a"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x, -10, 9, 0, 7); ctx.fill(); ctx.stroke(); } break;
      case "beard":
        ctx.fillStyle = "#6b3f1d"; ctx.beginPath(); ctx.moveTo(-18, 2); ctx.quadraticCurveTo(-22, 34, 0, 38); ctx.quadraticCurveTo(22, 34, 18, 2); ctx.quadraticCurveTo(0, 12, -18, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1.5; for (const x of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x * 1.2, 30); ctx.stroke(); } break;
      case "clownnose":
        ctx.fillStyle = "#e63946"; ctx.beginPath(); ctx.arc(0, -1, 6.5, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(-2, -3, 2, 0, 7); ctx.fill(); break;
      case "visor": {
        const t = performance.now() / 1000;
        ctx.fillStyle = "rgba(0, 235, 255, 0.5)"; ctx.strokeStyle = "#00a8bb"; rr(-22, -18, 44, 14, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(-19 + ((t * 30) % 36), -16, 4, 10); break; }
      case "laser": {
        const t = performance.now() / 1000, pulse = 0.7 + 0.3 * Math.sin(t * 8);
        ctx.save(); ctx.shadowColor = "#ff2a2a"; ctx.shadowBlur = 14 * pulse;
        for (const x of [-8, 8]) { ctx.fillStyle = "#ff2a2a"; ctx.beginPath(); ctx.arc(x, -10, 5.5, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(255, 60, 60, 0.7)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x + (x > 0 ? 18 : -18), -22); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, -10, 2, 0, 7); ctx.fill(); }
        ctx.restore(); break; }
      case "heartshades":
        ctx.fillStyle = "#ff4f9a"; heart(-8, -9, 9); ctx.fill(); ctx.stroke(); heart(8, -9, 9); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.beginPath(); ctx.arc(-11, -12, 2, 0, 7); ctx.arc(5, -12, 2, 0, 7); ctx.fill(); break;
    }
  }

  function drawWear(id) {
    ctx.lineJoin = "round"; ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
    switch (id) {
      case "bowtie":
        ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(-13, 8); ctx.lineTo(-13, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(13, 8); ctx.lineTo(13, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#a31d2b"; ctx.beginPath(); ctx.arc(0, 15, 3.5, 0, 7); ctx.fill(); break;
      case "scarf":
        ctx.fillStyle = "#d62839"; rr(-23, 9, 46, 10, 5); ctx.fill(); ctx.stroke();
        rr(9, 15, 10, 22, 3); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; for (const x of [-14, -4, 6]) { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, 18); ctx.stroke(); }
        for (const y of [22, 29]) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(18, y); ctx.stroke(); } break;
      case "badge":
        ctx.fillStyle = "#ffd23f"; star(-11, 15, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(-11, 15, 6.5, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#c9971a"; star(-11, 15, 3.5); ctx.fill(); break;
      case "lei":
        [[-18, 0, "#ff7aa8"], [-11, 7, "#ffd23f"], [-4, 11, "#fff"], [4, 11, "#ff7aa8"], [11, 7, "#c9a7ff"], [18, 0, "#ffd23f"]].forEach(([x, y, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, 10 + y, 5, 0, 7); ctx.fill(); ctx.stroke(); }); break;
      case "jersey":
        ctx.fillStyle = "#2f6fe0"; rr(-21.5, 7, 43, 22.5, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillRect(-21.5, 11, 43, 3);
        ctx.fillStyle = "#fff"; ctx.font = "bold 13px Bungee, sans-serif"; ctx.textAlign = "center"; ctx.fillText("1", 0, 27); break;
      case "armor": {
        const g = ctx.createLinearGradient(-21, 0, 21, 0); g.addColorStop(0, "#8e959e"); g.addColorStop(0.45, "#e1e6eb"); g.addColorStop(1, "#8e959e");
        ctx.fillStyle = g; rr(-22, 6, 44, 25, 7); ctx.fill(); ctx.stroke(); ctx.strokeStyle = "rgba(40,45,55,0.55)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, 30); ctx.moveTo(-20, 18); ctx.lineTo(20, 18); ctx.stroke();
        ctx.fillStyle = "#5a6068"; for (const [x, y] of [[-14, 11], [14, 11], [-14, 25], [14, 25]]) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); } break; }
      case "tux":
        ctx.fillStyle = "#1f1f24"; rr(-21.5, 7, 43, 23, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fdfdfd"; ctx.beginPath(); ctx.moveTo(-7, 7); ctx.lineTo(7, 7); ctx.lineTo(0, 27); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#d62839"; ctx.beginPath(); ctx.moveTo(0, 11); ctx.lineTo(-6, 8); ctx.lineTo(-6, 14); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, 11); ctx.lineTo(6, 8); ctx.lineTo(6, 14); ctx.closePath(); ctx.fill(); break;
      case "tee":
        ctx.fillStyle = "#fdfdfd"; rr(-21.5, 7, 43, 22.5, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.font = "bold 9px Bungee, sans-serif"; ctx.textAlign = "center"; ctx.fillText("TUNG", 0, 22); break;
    }
  }
  function drawCape(t) {
    const sw = Math.sin(t * 4) * 2;
    ctx.fillStyle = "#d62839"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(-20, -16); ctx.lineTo(20, -16); ctx.lineTo(36 + sw, 40); ctx.lineTo(-36 + sw, 40); ctx.closePath(); ctx.fill(); ctx.stroke();
  }


  function drawBit(kind, x, y, k) { // k: 1 fresh, 0 gone
    ctx.globalAlpha = Math.max(0, k);
    if (kind === "bubbles") { ctx.strokeStyle = "#bfe6ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 3 + (1 - k) * 6, 0, 7); ctx.stroke(); }
    else if (kind === "sparkles") { ctx.fillStyle = k > 0.5 ? "#fff6b0" : "#ffd23f"; star(x, y, 3 + k * 6); ctx.fill(); }
    else if (kind === "flames") { ctx.fillStyle = k > 0.55 ? "#ffd23f" : "#ff5a2b"; ctx.beginPath(); ctx.arc(x, y, 3 + k * 8, 0, 7); ctx.fill(); }
    else if (kind === "hearts") { ctx.fillStyle = "#ff5fa2"; heart(x, y, 3 + k * 5); ctx.fill(); }
    else if (kind === "dust") { ctx.fillStyle = "rgba(216, 195, 154, 0.8)"; ctx.beginPath(); ctx.arc(x, y, 2 + (1 - k) * 8, 0, 7); ctx.fill(); }
    else if (kind === "leaves") { ctx.fillStyle = (Math.floor(x) % 3 === 0) ? "#e8590c" : (Math.floor(x) % 3 === 1) ? "#5fb85f" : "#e0a91a"; ctx.save(); ctx.translate(x, y); ctx.rotate(k * 7 + x); ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, 7); ctx.fill(); ctx.restore(); }
    else if (kind === "music") { ctx.fillStyle = "#fff"; ctx.strokeStyle = "#3d2412"; ctx.lineWidth = 3; ctx.font = "bold " + Math.round(13 + k * 6) + "px sans-serif"; ctx.textAlign = "center"; const note = (Math.floor(x) % 2) ? "♪" : "♫"; ctx.strokeText(note, x, y); ctx.fillText(note, x, y); }
    else if (kind === "rainbowtrail") { ctx.fillStyle = `hsl(${Math.floor((k * 300 + x * 3) % 360)}, 95%, 60%)`; ctx.beginPath(); ctx.arc(x, y, 3 + k * 6, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  const use = (c) => { ctx = c; };
  // gear is sent as numbers (the position in TungShop.ITEMS + 1, in slot order); this turns them back into { slot: itemId }
  function fromNums(arr) {
    const S = root.TungShop, g = {};
    if (S && Array.isArray(arr)) arr.forEach((n, i) => { if (n && S.ITEMS[n - 1]) g[S.SLOTS[i]] = S.ITEMS[n - 1].id; });
    return g;
  }
  const api = {
    fromNums,
    ofUser: (u) => (u && u.gear ? fromNums(u.gear) : {}),
    mine: () => fromNums(root.TungMP && root.TungMP.user ? root.TungMP.user.gear : null), // what the logged-in player wears
    hat: (c, id, t) => { use(c); drawHat(id, t || 0); },
    face: (c, id) => { use(c); drawFace(id); },
    wear: (c, id) => { use(c); drawWear(id); },
    cape: (c, t) => { use(c); drawCape(t || 0); },
    wings: (c, t) => { use(c); drawWings(t || 0); },
    bat: (c, r, id) => { use(c); drawBat(r, id); },
    skinFill: (c, ci, bh) => { use(c); return skinFill(ci, bh); },
    skin: (c, pat, bw, bh, t) => { use(c); drawSkin(pat, bw, bh, t || 0); },
    bit: (c, kind, x, y, k) => { use(c); drawBit(kind, x, y, k); },
    heart: (c, x, y, s) => { use(c); heart(x, y, s); },
    star: (c, x, y, s) => { use(c); star(x, y, s); },
  };
  root.TungGear = api;
})(typeof window !== 'undefined' ? window : globalThis);
