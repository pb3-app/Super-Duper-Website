/* TouchPad.mount(el, { onMove(dx, dy), buttons: [{ label, onDown() }] }) - a joystick and big buttons for phones. */
(function () {
  function mount(el, o) {
    el.classList.add('tp');
    const joy = document.createElement('div'); joy.className = 'joy'; const knob = document.createElement('i'); joy.append(knob);
    const btns = document.createElement('div'); btns.className = 'btns';
    el.replaceChildren(joy, btns);
    const move = (e) => { const r = joy.getBoundingClientRect(), dx = e.clientX - (r.x + r.width / 2), dy = e.clientY - (r.y + r.height / 2), l = Math.hypot(dx, dy) || 1, m = Math.min(1, l / 50), x = (dx / l) * m, y = (dy / l) * m; knob.style.transform = `translate(${x * 42}px, ${y * 42}px)`; o.onMove(m < 0.18 ? 0 : x, m < 0.18 ? 0 : y); };
    joy.addEventListener('pointerdown', (e) => { joy.setPointerCapture(e.pointerId); move(e); });
    joy.addEventListener('pointermove', (e) => { if (e.buttons || e.pressure) move(e); });
    for (const ev of ['pointerup', 'pointercancel']) joy.addEventListener(ev, () => { knob.style.transform = ''; o.onMove(0, 0); });
    for (const b of o.buttons || []) { const bt = document.createElement('button'); bt.className = 'btn'; bt.textContent = b.label; bt.addEventListener('pointerdown', (e) => { e.preventDefault(); b.onDown(); }); btns.append(bt); }
  }
  window.TouchPad = { mount };
})();
