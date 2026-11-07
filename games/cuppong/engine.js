/* Cup Pong physics. Pure functions, no DOM, so the browser and node tests run the exact same code.
   Units are centimetres and seconds. The table runs from z = 0 (the thrower's end) to z = L; x = 0 is the middle.
   Every throw is simulated in the THROWER'S frame, where the cups being aimed at are at the far end. A watcher gets the
   starting velocity, runs the same fixed-step simulation and draws it flipped. Only + - * / and sqrt are used in the
   simulation, so every browser lands the ball in exactly the same place. */
(function (root) {
  const L = 160, HW = 58;
  const BR = 2.4, RT = 6.2, RB = 4.2, CH = 13.5, G = 981;
  const DT = 1 / 480, SP = 12.9, ROWDZ = 11.2, Z0 = 13;
  const RELEASE_Y = 45, RELEASE_Z = -22;

  // positions of one side's cups, in that side's own frame (back row nearest its own table end)
  function rackLayout(n) {
    const rows = n === 10 ? [4, 3, 2, 1] : [3, 2, 1], out = [];
    rows.forEach((cnt, r) => { for (let i = 0; i < cnt; i++) out.push({ i: out.length, x: (i - (cnt - 1) / 2) * SP, z: Z0 + r * ROWDZ }); });
    return out;
  }
  // the cups a thrower is aiming at, in the thrower's frame (the victim's own layout turned around)
  function farRack(layout, alive) {
    return layout.filter((c) => alive[c.i]).map((c) => ({ i: c.i, x: -c.x, z: L - c.z }));
  }

  // ---- aiming ----
  const AIM_Y = CH + BR; // the ball should reach this height right over the middle of the cup
  function flightTime(dz) { return 0.38 + dz * 0.0012; }
  function release(tx) { return { x: tx * 0.2, y: RELEASE_Y, z: RELEASE_Z }; }
  function solve(tx, tz) {
    const p = release(tx), tf = flightTime(tz - p.z);
    return { p, v: { x: (tx - p.x) / tf, y: (AIM_Y - p.y) / tf + 0.5 * G * tf, z: (tz - p.z) / tf }, tf };
  }
  // meter: 0 to 1 and back; 0.5 is perfect. Returns how far (cm) the throw can stray.
  function spread(meter) {
    const dev = Math.abs(meter - 0.5) * 2;
    return 0.4 + 19 * dev * Math.sqrt(dev);
  }
  function meterAt(t) { const k = (t / 0.62) % 2; return k < 1 ? k : 2 - k; }

  // ---- the ball ----
  function newBall(p, v) { return { x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, t: 0, rest: 0, done: false, outcome: null, cup: -1, bounces: 0, ev: [] }; }

  function wallR(y) { const k = y <= 0 ? 0 : y >= CH ? 1 : y / CH; return RB + (RT - RB) * k; }

  // advance one fixed step. `cups` are the live cups in the thrower's frame.
  function step(b, cups) {
    if (b.done) return;
    b.t += DT;
    b.vy -= G * DT;
    b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;
    // table top
    if (b.y < BR && b.y > -BR * 2 && b.x > -HW && b.x < HW && b.z > 0 && b.z < L) {
      b.y = BR;
      if (b.vy < -25) { b.vy = -b.vy * 0.76; b.vx *= 0.99; b.vz *= 0.99; b.bounces++; b.ev.push(["table", -b.vy]); }
      else { b.vy = 0; const f = 1 - 1.4 * DT; b.vx *= f; b.vz *= f; }
    }
    // cups
    for (let n = 0; n < cups.length; n++) {
      const c = cups[n], dx = b.x - c.x, dz = b.z - c.z;
      if (dx > RT + BR + 1 || dx < -(RT + BR + 1) || dz > RT + BR + 1 || dz < -(RT + BR + 1)) continue;
      if (b.y > CH + BR + 1) continue;
      const d = Math.sqrt(dx * dx + dz * dz), ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
      // the rim ring
      const rdx = d - RT, rdy = b.y - CH, rd = Math.sqrt(rdx * rdx + rdy * rdy);
      if (rd < BR + 0.35 && rd > 1e-6) {
        const nr = rdx / rd, ny = rdy / rd, vr = b.vx * ux + b.vz * uz, vn = vr * nr + b.vy * ny;
        if (vn < 0) { const j = -(1 + 0.5) * vn; b.vx += j * nr * ux; b.vz += j * nr * uz; b.vy += j * ny; b.ev.push(["rim", -vn]); }
        const push = BR + 0.35 - rd; b.x += nr * ux * push; b.z += nr * uz * push; b.y += ny * push;
        continue;
      }
      const w = wallR(b.y);
      if (b.y <= CH) {
        if (d < w) { // inside the cup
          if (b.y < CH - 2.2 && d < w - 0.2) { b.done = true; b.outcome = "sink"; b.cup = c.i; b.ev.push(["sink", 0]); return; }
          if (d > w - BR) { // inner wall
            const vr = b.vx * ux + b.vz * uz;
            if (vr > 0) { b.vx -= 1.4 * vr * ux; b.vz -= 1.4 * vr * uz; b.vy *= 0.97; b.ev.push(["wall", vr]); }
            const pd = d - (w - BR); b.x -= ux * pd; b.z -= uz * pd;
          }
        } else if (d < w + BR) { // outer wall
          const vr = b.vx * ux + b.vz * uz;
          if (vr < 0) { b.vx -= 1.5 * vr * ux; b.vz -= 1.5 * vr * uz; b.ev.push(["wall", -vr]); }
          const pd = w + BR - d; b.x += ux * pd; b.z += uz * pd;
        }
      }
    }
    // finished?
    if (b.y < -60 || b.t > 6 || b.z > L + 120 || b.z < -140 || b.x > HW + 120 || b.x < -HW - 120) { b.done = true; b.outcome = "miss"; return; }
    if (b.y <= BR + 0.01 && b.vx * b.vx + b.vz * b.vz < 100 && b.vy === 0) { b.rest += DT; if (b.rest > 0.3) { b.done = true; b.outcome = "miss"; } } else b.rest = 0;
  }
  function playOut(p, v, cups) { const b = newBall(p, v); let n = 0; while (!b.done && n++ < 6 * 480) step(b, cups); return b; }

  // a random point inside a disc (rand is any function returning [0,1))
  function scatter(rand, r) { const a = rand() * 6.283185307179586, d = Math.sqrt(rand()) * r; return { x: Math.cos(a) * d, z: Math.sin(a) * d }; }
  // the full throw for a target and a meter reading
  function makeThrow(tx, tz, meter, rand) {
    const e = scatter(rand, spread(meter)), s = solve(tx + e.x, tz + e.z);
    return { p: s.p, v: s.v };
  }

  const api = { L, HW, BR, RT, RB, CH, G, DT, SP, AIM_Y, rackLayout, farRack, solve, spread, meterAt, newBall, step, playOut, scatter, makeThrow, wallR, release };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CupEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
