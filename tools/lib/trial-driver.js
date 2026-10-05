// Injected into the page by the tools that play a realm in the running game (tools/realm-test.mjs, tools/realm-bot.mjs): plays the trial that seals a lantern with the REAL controller, the way a person does it -
// the stick, the jump, the breath of fire and the ram go through the game's own input, and time is the game's own update. The plays are tools/lib/trial-plays.mjs's (the same ones tools/trial-test.mjs plays against the
// pure machines and tools/trial-bot.mjs on the Court's floor): each kind has its right play (`POLICY`), and a place where the hero begins it (`startOf`).
//   await __trialDriver.load()                      the plays are loaded (once)
//   __trialDriver.trials()                          [{ id, kind, goal, start: { x, z, yaw } }] the trials of this world, in the order of their goals
//   __trialDriver.solve(id, { T, place })           plays the trial until it is solved or T seconds have gone (default 150): the hero is put at its start first unless `place` is false (the caller has walked him there)
//                                                   -> { ok, t, fails, misses, hurts, state }; the hero cannot be hurt while he plays (a test of the trial, not of the Snuffers)
// With tools/bot-inject.js installed (realm-bot) the bot's own controls and clock are used; without it (realm-test) the driver puts its own hand on the input for the length of a play and lets go.
(() => {
  let plays = null;
  const G = () => window.__game;
  const hyp = Math.hypot;

  function io() {
    if (window.__bot) { const b = window.__bot; return { ctl: b.ctl, tick: (n) => b.tick(n), edge: (a) => b.edge(a), release() {} }; }
    const g = G(), inp = g.input, orig = inp.poll, ctl = { mx: 0, my: 0, jump: false, flame: false, charge: false };
    inp.poll = () => { inp.move.x = ctl.mx; inp.move.y = ctl.my; inp.held.jump = ctl.jump; inp.held.flame = ctl.flame; inp.held.charge = ctl.charge; };
    return { ctl, tick: (n) => { for (let i = 0; i < n; i++) window.__app.update(1 / 60); }, edge: (a) => { inp.edge[a] = true; }, release() { inp.poll = orig; } };
  }

  window.__trialDriver = {
    async load() { plays = plays || await import('/tools/lib/trial-plays.mjs'); return true; },

    trials() {
      const S = G().trials;
      return (S ? S.list : []).map((r) => ({ id: r.spec.id, kind: r.t.kind, goal: r.spec.goal, start: plays.startOf(r.t), done: r.done }));
    },

    solve(id, o = {}) {
      const g = G(), S = g.trials, r = S && S.get(id);
      if (!r) return { ok: false, reason: `no trial '${id}'` };
      const T = o.T ?? 150, P = g.player, d = io();
      const policy = plays.POLICY[r.t.kind]();
      if (o.place !== false) {
        const s = plays.startOf(r.t), y = g.collision.support(s.x, s.z, g.collision.heightAt(s.x, s.z) + 2, 0.5).y;
        P.place(s.x, y + 0.05, s.z, s.yaw); g.cam.snapBehind(P); d.tick(20);
      }
      let hurts = 0;
      const hurt = g.playerHurt.bind(g);
      g.playerHurt = (x, z) => { const ok = hurt(x, z); if (ok) { hurts++; g.sparx.hp = 3; P.dead = false; } return ok; };       // (he is hurt, and he does not fall)
      const prev = { jump: false, flame: false, charge: false };
      const t0 = g.time, ctl = d.ctl;
      let act = null, frames = 0, doneAt = null, fails = 0, misses = 0;
      const events = [];
      const on = S._on.bind(S);
      S._on = (rr, type, dd) => { if (rr === r) { events.push(type); if (type === 'fail') fails++; if (type === 'miss') misses++; } return on(rr, type, dd); };
      while (g.time - t0 < T) {
        if (r.done && doneAt === null) doneAt = g.time - t0;
        if (doneAt !== null && (r.t.kind !== 'rings' || (P.grounded && g.time - t0 - doneAt > 0.5) || g.time - t0 - doneAt > 9)) break;                   // (a course in the air is flown to the ground: the pilot lands him where it ends)
        const snap = { t: g.time - t0, hero: P, trial: r.t, foes: r.foes, events, floorAt: (x, z) => g.collision.support(x, z, P.y + 0.6, 0.62).y };
        if (frames % 2 === 0 || !act) act = policy(snap) || { dx: 0, dz: 0, mag: 0 };
        const Y = g.cam.yaw, m = Math.max(0, Math.min(1, act.mag || 0));
        ctl.my = (act.dx * Math.sin(Y) + act.dz * Math.cos(Y)) * m; ctl.mx = (-act.dx * Math.cos(Y) + act.dz * Math.sin(Y)) * m;
        ctl.jump = !!act.jump; if (act.jump && !prev.jump) d.edge('jump');
        ctl.flame = !!act.flame; if (act.flame && !prev.flame) d.edge('flame');
        ctl.charge = !!act.charge; if (act.charge && !prev.charge) d.edge('charge');
        prev.jump = !!act.jump; prev.flame = !!act.flame; prev.charge = !!act.charge;
        d.tick(1); frames++;
      }
      ctl.mx = ctl.my = 0; ctl.jump = ctl.flame = ctl.charge = false;
      d.tick(2);
      S._on = on;
      g.playerHurt = hurt;
      d.release();
      return { ok: r.done, t: doneAt === null ? null : +doneAt.toFixed(1), fails, misses, hurts, state: r.t.state, at: [+P.x.toFixed(1), +P.z.toFixed(1)], dist: r.spec.goal && r.beacon ? +hyp(P.x - r.beacon.x, P.z - r.beacon.z).toFixed(0) : null };
    },
  };
})();
