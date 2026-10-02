// Injected into the page by tools/bot.mjs. Drives the REAL player controller with synthetic input and fast-forwards
// the fixed-step simulation (no rendering) so reachability of every objective can be verified in seconds.
(() => {
  const STEP = 1 / 60;
  const ctl = { mx: 0, my: 0, jump: false, flame: false, charge: false };
  const G = () => window.__game;
  let installed = false;

  function install() {
    if (installed) return;
    installed = true;
    if (window.__app) window.__app.update = () => {};           // stop the real-time loop; the bot owns time
    G().externalPoll = false;                                     // Game.update polls (our synthetic poll below)
    const inp = G().input;
    inp.poll = () => { inp.move.x = ctl.mx; inp.move.y = ctl.my; inp.held.jump = ctl.jump; inp.held.flame = ctl.flame; inp.held.charge = ctl.charge; };
  }
  function tick(n = 1) { for (let i = 0; i < n; i++) G().update(STEP); }
  function edge(a) { G().input.edge[a] = true; }
  const heading = (dx, dz) => {
    const Y = G().cam.yaw;
    ctl.my = dx * Math.sin(Y) + dz * Math.cos(Y);
    ctl.mx = -dx * Math.cos(Y) + dz * Math.sin(Y);
  };
  const state = () => { const p = G().player; return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1), grounded: p.grounded, dead: p.dead }; };

  /**
   * Walk/jump/glide to (tx,tz). o: { tol, timeout, glide (hold glide when airborne), auto (jump ledges/gaps), fly (jump at start), trace (an array: gets a line every 3 frames), careful (0.7 of full speed, jump at the very edge: for hops) }
   */
  function goto(tx, tz, o = {}) {
    install();
    const p = G().player, col = G().collision;
    const tol = o.tol ?? 1.6, maxT = o.timeout ?? 45;
    let t = 0, lastD = Infinity, stuck = 0, airFrames = 0, jumpCd = 0;
    let glidePhase = 0;
    while (t < maxT) {
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d < tol && (o.ignoreY || true)) { ctl.mx = ctl.my = 0; ctl.jump = false; return { ok: true, t: +t.toFixed(1), ...state() }; }
      if (G().hud.talking) { edge('confirm'); ctl.mx = ctl.my = 0; tick(); t += STEP; continue; }   // click through dialogue
      heading(dx / d, dz / d);
      if (o.careful) { ctl.mx *= 0.7; ctl.my *= 0.7; }               // (a person hopping across slabs does not run flat out: a jump at full speed flies 8.7 m)
      ctl.jump = false;
      jumpCd -= STEP;
      if (p.dead) return { ok: false, reason: 'dead', ...state() };
      if (p.grounded) {
        airFrames = 0; glidePhase = 0;
        if (o.auto !== false && jumpCd <= 0) {
          // look ahead for a ledge/gap/water
          const la = Math.min(o.careful ? 1.3 : 2.4 + p.speed * 0.12, d);
          const ax = p.x + (dx / d) * la, az = p.z + (dz / d) * la;
          const sup = col.support(ax, az, p.y, 0.6);
          const drop = p.y - sup.y;
          const wet = col.heightAt(ax, az) < -0.3 && sup.kind === 'terrain';
          if (drop > 1.0 || wet) { ctl.jump = true; edge('jump'); jumpCd = 0.5; }
        }
        if (o.jumpNow) { ctl.jump = true; edge('jump'); jumpCd = 0.5; o.jumpNow = false; }
      } else {
        airFrames++;
        if (o.glide) {
          if (glidePhase === 0 && airFrames > 6) { ctl.jump = false; glidePhase = 1; }
          else if (glidePhase === 1 && airFrames > 9) { ctl.jump = true; edge('jump'); glidePhase = 2; }
          else if (glidePhase === 2) ctl.jump = true;
        }
      }
      // keep the jump key held for the first few airborne frames so the jump is full height
      if (!p.grounded && airFrames < 6) ctl.jump = true;
      tick(); t += STEP;
      if (o.trace && Math.round(t / STEP) % 3 === 0) o.trace.push(`${t.toFixed(2)}s (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) ${p.grounded ? 'ground' : 'air'}${ctl.jump ? ' JUMP' : ''}`);
      if (Math.floor(t) !== Math.floor(t - STEP)) {
        if (lastD - d < 0.6 && p.grounded) stuck++; else stuck = 0;
        lastD = d;
        if (stuck >= 4) return { ok: false, reason: 'stuck', d: +d.toFixed(1), ...state() };
      }
    }
    return { ok: false, reason: 'timeout', ...state() };
  }

  /** Follow a dense path from t0..t1 stepping every `every` points. */
  function follow(pathId, t0 = 0, t1 = 1, every = 4, o = {}) {
    install();
    const path = G().grid.paths.find((p) => p.id === pathId);
    if (!path) return { ok: false, reason: 'no path ' + pathId };
    const n = path.pts.length;
    let total = 0;
    for (let i = Math.floor(t0 * (n - 1)); i <= Math.floor(t1 * (n - 1)); i += every) {
      const q = path.pts[Math.min(i, n - 1)];
      const r = goto(q[0], q[2], { tol: 2.2, timeout: 12, ...o });
      total += r.t || 0;
      if (!r.ok) return { ...r, at: i, of: n, y: q[1] };
    }
    const q = path.pts[Math.floor(t1 * (n - 1))];
    return { ok: true, t: +total.toFixed(1), end: state(), target: [q[0], q[1], q[2]].map((v) => +v.toFixed(1)) };
  }

  function place(x, z, yaw = 0, y) {
    install();
    const g = G();
    g.player.place(x, (y ?? g.grid.heightAt(x, z)) + 0.05, z, yaw);
    g.cam.snapBehind(g.player);
    tick(30);
    return state();
  }

  function tap(action, frames = 4) {
    install();
    for (let i = 0; i < frames; i++) { edge(action); ctl[action] = true; ctl.mx = ctl.my = 0; tick(); }
    ctl[action] = false;
    tick(2);
  }

  function god() { install(); G().player.hurt = () => false; return true; }
  window.__bot = { goto, follow, place, tick, state, tap, ctl, install, edge, god };
})();
