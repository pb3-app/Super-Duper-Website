// Home page: click the mascot scene for a "TUNG!" (sound and a small pop).
(function () {
  const scene = document.getElementById("heroScene");
  if (!scene) return;
  let audioCtx;

  function playTung() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    } catch (_) {}
  }

  // Hotspots are given in the scene's own coordinates; map them onto wherever the picture is drawn.
  const VB = { x: -30, y: 20, w: 1290, h: 520 };
  const stage = scene.parentElement;
  function placeSpots() {
    const cs = getComputedStyle(scene);
    const sr = stage.getBoundingClientRect(), ir = scene.getBoundingClientRect();
    const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
    const bw = ir.width - pl - pr, bh = ir.height - pt - pb;
    const k = Math.min(bw / VB.w, bh / VB.h);
    const ox = ir.left - sr.left + pl + (bw - VB.w * k) / 2;
    const oy = ir.top - sr.top + pt + (bh - VB.h * k) / 2;
    stage.querySelectorAll(".ly-spot[data-svg]").forEach((s) => {
      const [x, y] = s.dataset.svg.split(",").map(Number);
      s.style.setProperty("--x", ox + (x - VB.x) * k + "px");
      s.style.setProperty("--y", oy + (y - VB.y) * k + "px");
    });
  }
  placeSpots();
  window.addEventListener("resize", placeSpots);
  if (window.ResizeObserver) new ResizeObserver(placeSpots).observe(stage);
  window.addEventListener("load", placeSpots);

  scene.addEventListener("click", (e) => {
    playTung();
    const pop = document.createElement("div");
    pop.className = "tung-pop";
    pop.textContent = "TUNG!";
    pop.style.left = e.clientX + "px";
    pop.style.top = e.clientY - 20 + "px";
    document.body.append(pop);
    setTimeout(() => pop.remove(), 800);
  });
})();
