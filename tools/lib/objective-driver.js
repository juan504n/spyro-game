// Injected into the page by the tools that play a realm in the running game (tools/objective-play.mjs, tools/realm-test.mjs): does what a realm's OBJECTIVE asks (src/game/objectives/, docs/DESIGN.md round forty-one)
// with the REAL controller, as a person does it: runs a sprite down and rams it, dodges a colossus' slam and rams the hatch in its chest, outruns a storm, drives crabs into a pen.
//   __objectiveDriver.kind()                         the objective's kind ('chase' | 'duel' | 'storm' | 'herd') or null
//   __objectiveDriver.play({ T })                    plays until the objective is done or T seconds (game time) have gone -> { ok, t, hurts, ... }
//   __objectiveDriver.run(kind, o)                   the same for a kind named
// With tools/bot-inject.js installed (realm-bot) the bot's own controls and clock are used; without it the driver puts its own hand on the input for the length of a play.
(() => {
  const G = () => window.__game;
  const hyp = Math.hypot;

  function io() {
    if (window.__bot) { const b = window.__bot; return { ctl: b.ctl, tick: (n) => b.tick(n), edge: (a) => b.edge(a), release() {} }; }
    const g = G(), inp = g.input, orig = inp.poll, ctl = { mx: 0, my: 0, jump: false, flame: false, charge: false };
    inp.poll = () => { inp.move.x = ctl.mx; inp.move.y = ctl.my; inp.held.jump = ctl.jump; inp.held.flame = ctl.flame; inp.held.charge = ctl.charge; };
    return { ctl, tick: (n) => { for (let i = 0; i < n; i++) window.__app.update(1 / 60); }, edge: (a) => { inp.edge[a] = true; }, release() { inp.poll = orig; } };
  }
  const dirTo = (a, b) => { const d = hyp(b.x - a.x, b.z - a.z) || 1; return [(b.x - a.x) / d, (b.z - a.z) / d]; };

  /** the loop every play shares: policy(snap) -> { dx, dz, mag, jump, flame, charge } every second frame, until done() or T seconds */
  function drive(policy, done, T, extra = {}) {
    const g = G(), P = g.player, d = io(), ctl = d.ctl;
    let hurts = 0;
    const hurt = g.playerHurt.bind(g);
    g.playerHurt = (x, z) => { const ok = hurt(x, z); if (ok) { hurts++; if (!extra.mortal) { g.sparx.hp = 3; P.dead = false; } } return ok; };
    const prev = { jump: false, flame: false, charge: false };
    const t0 = g.time;
    let act = null, frames = 0, tail = 0;
    while (g.time - t0 < T) {
      if (done()) { if (++tail > 20) break; }
      if (frames % 2 === 0 || !act) act = policy({ t: g.time - t0, hero: { x: P.x, y: P.y, z: P.z, yaw: P.yaw, grounded: P.grounded, up: Math.max(0, P.y - g.collision.heightAt(P.x, P.z)) } }) || { dx: 0, dz: 0, mag: 0 };
      const Y = g.cam.yaw, m = Math.max(0, Math.min(1, act.mag || 0));
      ctl.my = (act.dx * Math.sin(Y) + act.dz * Math.cos(Y)) * m; ctl.mx = (-act.dx * Math.cos(Y) + act.dz * Math.sin(Y)) * m;
      ctl.jump = !!act.jump; if (act.jump && !prev.jump) d.edge('jump');
      ctl.flame = !!act.flame; if (act.flame && !prev.flame) d.edge('flame');
      ctl.charge = !!act.charge; if (act.charge && !prev.charge) d.edge('charge');
      prev.jump = !!act.jump; prev.flame = !!act.flame; prev.charge = !!act.charge;
      d.tick(1); frames++;
      if (extra.each) extra.each();
    }
    ctl.mx = ctl.my = 0; ctl.jump = ctl.flame = ctl.charge = false;
    d.tick(2);
    g.playerHurt = hurt;
    d.release();
    return { t: +(g.time - t0).toFixed(1), hurts };
  }

  const plays = {
    // a chase: run at the sprite, ram it when it is within reach
    chase(O, o) {
      let ci = -1;
      const r = drive((s) => {
        const h = s.hero, d = hyp(h.x - O.pos.x, h.z - O.pos.z);
        if (ci < 0) { let best = 1e9; O.route.forEach((q, k) => { const dd = hyp(h.x - q[0], h.z - q[1]); if (dd < best) { best = dd; ci = k; } }); }
        while (ci < O.route.length - 1 && O.cum[ci] < O.s - 4 && hyp(h.x - O.route[ci][0], h.z - O.route[ci][1]) < 6) ci++;     // (the point of the road he is making for: the next one he has not reached, short of the sprite)
        const tgt = d > 7 ? { x: O.route[ci][0], z: O.route[ci][1] } : O.pos;
        const [dx, dz] = dirTo(h, tgt);
        return { dx, dz, mag: 1, charge: d < 5.5 && O.state === 'corner' && Math.floor(s.t * 3) % 2 === 0 };
      }, () => O.done, o.T ?? 400);
      return { ok: O.done, ...r, caught: O.k, state: O.state };
    },
    // a duel: keep the colossus' distance, jump its slam and its quake, and ram the hatch while it stands open
    duel(O, o) {
      const g = G(), D = window.__duelK || {};
      let wounds0 = O.wounds;
      const r = drive((s) => {
        const e = O.e, h = s.hero, d = hyp(h.x - e.x, h.z - e.z), [dx, dz] = dirTo(h, e);
        const q = O.quake;
        const quakeNear = q && Math.abs(hyp(h.x - q.x, h.z - q.z) - q.r) < 5.5;
        if (O.state === 'sleep' || O.state === 'home') return { dx, dz, mag: d > 12 ? 1 : 0.3 };
        if (O.state === 'roar' || O.state === 'advance') return d > 9 ? { dx, dz, mag: 1, jump: quakeNear && h.grounded } : { dx: 0, dz: 0, mag: 0, jump: quakeNear && h.grounded };
        if (O.state === 'raise') return { dx: 0, dz: 0, mag: 0, jump: h.grounded && d < 10.5 && O.st > 0.3 * (1.15), };
        if (O.state === 'vent') {
          // line up on the hatch from a few strides off, then ram it; too close, step back and come again
          const c = O.chest, [cx, cz] = dirTo(h, c), dc = hyp(h.x - c.x, h.z - c.z), P = g.player;
          const facing = P.dirx * cx + P.dirz * cz;
          if (dc < 2.4) return { dx: -cx, dz: -cz, mag: 1 };
          return { dx: cx, dz: cz, mag: 1, charge: dc < 7 && facing > 0.9 && O.shutT <= 0, jump: quakeNear && h.grounded };
        }
        return { dx: 0, dz: 0, mag: 0 };
      }, () => O.done, o.T ?? 400);
      return { ok: O.done, ...r, wounds: O.wounds, state: O.state };
    },
    // a storm: walk the route's points one after another (the real air journey - hops, glides, whirlwinds - is tools/realm-bot.mjs's)
    storm(O, o) {
      if (o.teleport) {                                                           // (the objective's logic without the air journey - the bot walks that: he is carried along the route at a runner's pace, and set down at each island's height)
        const g = G(), P = g.player, d = io(), ys = O.route.map((q) => g.collision.support(q[0], q[1], 400, 0.5).y);
        const yAt = (s) => { let i = 1; while (i < O.cum.length - 1 && O.cum[i] < s) i++; const u = Math.max(0, Math.min(1, (s - O.cum[i - 1]) / Math.max(1e-6, O.cum[i] - O.cum[i - 1]))); return ys[i - 1] + (ys[i] - ys[i - 1]) * u; };
        let s = 0, t = 0;
        const v = o.pace ?? 8.5, hurt0 = g.sparx.hp;
        while (!O.done && t < (o.T ?? 200)) {
          s = Math.min(O.len - 3, s + v * (1 / 20)); t += 1 / 20;
          const a = O._at(s);
          P.place(a.x, yAt(s) + 0.3, a.z, Math.atan2(a.dx, a.dz)); g.player.invulnT = 0;
          d.tick(3);
        }
        d.release();
        return { ok: O.done, t: +t.toFixed(1), hurts: hurt0 - g.sparx.hp, P: Math.round(O.P), S: Math.round(O.S), len: Math.round(O.len) };
      }
      let i = 0;
      const r = drive((s) => {
        const h = s.hero;
        while (i < O.route.length - 1 && hyp(h.x - O.route[i][0], h.z - O.route[i][1]) < 6) i++;
        const [dx, dz] = dirTo(h, { x: O.route[i][0], z: O.route[i][1] });
        return { dx, dz, mag: 1, jump: h.grounded && Math.floor(s.t * 1.2) % 2 === 0 };
      }, () => O.done, o.T ?? 400);
      return { ok: O.done, ...r, P: Math.round(O.P), S: Math.round(O.S), len: Math.round(O.len) };
    },
    // a herd: get behind the crab that is farthest from the pen and push it on
    herd(O, o) {
      const r = drive((s) => {
        const h = s.hero, left = O.crabs.filter((c) => !c.penned);
        if (!left.length) return { dx: 0, dz: 0, mag: 0 };
        const pen = { x: O.pen[0], z: O.pen[1] };
        const c = left.sort((a, b) => hyp(b.x - pen.x, b.z - pen.z) - hyp(a.x - pen.x, a.z - pen.z))[0];
        const [ux, uz] = dirTo(pen, c);                                                            // (from the pen to the crab: the hero stands further out along it)
        const gx = c.x + ux * 6.5, gz = c.z + uz * 6.5;
        const far = hyp(h.x - c.x, h.z - c.z);
        const behind = (h.x - c.x) * ux + (h.z - c.z) * uz > 2;
        const tgt = behind || far > 18 ? { x: pen.x * 0.15 + c.x * 0.85, z: pen.z * 0.15 + c.z * 0.85 } : { x: gx, z: gz };
        const [dx, dz] = dirTo(h, tgt), want = Math.atan2(dx, dz), g = G();
        // (the headland has a cliff each side: he goes the nearest way to the one he wants that has ground under it, a stride and a half on)
        let ax = 0, az = 0, found = false;
        const solid = (a, k) => { const nx = h.x + Math.sin(a) * k, nz = h.z + Math.cos(a) * k, sy = g.collision.support(nx, nz, h.y + 1.2, 0.4).y; return sy > h.y - 0.55 * (k / 1.4) && sy < h.y + 1.0 * (k / 1.4) && sy > (g.waterHi ?? g.waterY ?? 0) + 0.6; };
        for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2]) {
          const a = want + off;
          if (solid(a, 1.4) && solid(a, 2.8)) { ax = Math.sin(a); az = Math.cos(a); found = true; break; }
        }
        if (!found && !h.grounded) { ax = dx; az = dz; }                                       // (in the air: no choice)
        return { dx: ax, dz: az, mag: !found && h.grounded ? 0 : behind && far < 7 ? 0.45 : 1 };
      }, () => O.done, o.T ?? 400);
      return { ok: O.done, ...r, penned: O.penned };
    },
  };

  /** puts the hero where a person begins the task: behind the sprite, at the edge of the caldera, at the Skygate, behind the first crab */
  function stage() {
    const g = G(), O = g.objective, P = g.player;
    let x = P.x, z = P.z, yaw = P.yaw;
    if (O.kind === 'chase') { const a = O._at(Math.max(0, O.s - 12)); x = a[0] ?? a.x; z = a[1] ?? a.z; }
    if (O.kind === 'duel') { x = O.spec.arena[0]; z = O.spec.arena[1] - O.spec.arenaR + 4; yaw = 0; }
    if (O.kind === 'storm') { x = O.route[0][0]; z = O.route[0][1] + 5; yaw = 0; }
    if (O.kind === 'herd') {
      const c = O.crabs[0], u = hyp(c.x - O.pen[0], c.z - O.pen[1]) || 1;
      for (const k of [14, 11, 8]) { x = c.x + (c.x - O.pen[0]) / u * k; z = c.z + (c.z - O.pen[1]) / u * k; if (g.collision.heightAt(x, z) > (g.waterHi ?? 0) + 1.5) break; }
    }
    const y = g.collision.support(x, z, g.collision.heightAt(x, z) + 3, 0.5).y;
    P.place(x, y + 0.05, z, yaw); g.cam.snapBehind(P); P.invulnT = 3;
    for (let i = 0; i < 10; i++) window.__app.update(1 / 60);
    return [x, z];
  }

  window.__objectiveDriver = {
    stage,
    kind() { const o = G().objective; return o ? o.kind : null; },
    play(o = {}) {
      const O = G().objective;
      if (!O) return { ok: false, reason: 'no objective' };
      if (O.done) return { ok: true, t: 0, hurts: 0 };
      const f = plays[O.kind];
      return f ? f(O, o) : { ok: false, reason: `unknown objective ${O.kind}` };
    },
  };
})();
