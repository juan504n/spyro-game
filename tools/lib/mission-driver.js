// Injected into the page by the tools that play a realm in the running game (tools/realm-test.mjs, tools/realm-bot.mjs): does what a goal's MISSION asks (missions/, docs/DESIGN.md round thirty-nine) with the REAL
// controller, as a person does it: rams a frozen bloom, fights the Slag Brute that holds a stone (the play of tools/lib/foe-plays.mjs), jumps into a windbell, fetches a pearl and carries it to a lens.
//   await __missionDriver.load()
//   __missionDriver.kind()                      the mission's kind ('rescue' | 'hunt' | 'chime' | 'deliver') or null
//   __missionDriver.play(goalId, { T })         the hero is where the caller put him (in front of the goal, facing it); plays until the goal is lit or T seconds (game time) have gone -> { ok, t, hurts, lit, ... }
// With tools/bot-inject.js installed (realm-bot) the bot's own controls and clock are used; without it (realm-test) the driver puts its own hand on the input for the length of a play.
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
  const dirTo = (a, b) => { const d = hyp(b.x - a.x, b.z - a.z) || 1; return [(b.x - a.x) / d, (b.z - a.z) / d]; };

  /** the loop every play shares: policy(snap) -> { dx, dz, mag, jump, flame, charge } every second frame, until done() or T seconds */
  function drive(policy, done, T, extra = {}) {
    const g = G(), P = g.player, d = io(), ctl = d.ctl;
    let hurts = 0;
    const hurt = g.playerHurt.bind(g);
    g.playerHurt = (x, z) => { const ok = hurt(x, z); if (ok) { hurts++; g.sparx.hp = 3; P.dead = false; } return ok; };
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

  const wait = (n) => { const d = io(); d.tick(n); d.release(); };

  window.__missionDriver = {
    async load() { plays = plays || await import('/tools/lib/foe-plays.mjs'); return true; },
    kind() { const m = G().mission; return m ? m.kind : null; },

    play(goalId, o = {}) {
      const g = G(), M = g.mission, P = g.player, b = g.beacons.get(goalId), T = o.T ?? 120;
      if (!M || !b) return { ok: false, reason: 'no mission or no such goal' };
      const bp = { x: b.x, z: b.z };
      if (b.litFlag) return { ok: true, t: 0, hurts: 0, lit: true };
      if (M.kind === 'rescue') {
        if (goalId === M.spec.final) {                                                                                   // (the Heartbloom: he comes with the sprites)
          const r = drive((s) => { const [dx, dz] = dirTo(s.hero, bp); return hyp(s.hero.x - bp.x, s.hero.z - bp.z) > 8 ? { dx, dz, mag: 1 } : { dx: 0, dz: 0, mag: 0 }; }, () => b.litFlag, T);
          return { ok: b.litFlag, ...r, followers: M.sprites.filter((q) => q.state === 'follow').length };
        }
        const r = drive((s) => { const [dx, dz] = dirTo(s.hero, bp), d = hyp(s.hero.x - bp.x, s.hero.z - bp.z); return { dx, dz, mag: 1, charge: d < 4.5 && Math.floor(s.t * 4) % 2 === 0 }; }, () => b.litFlag, T);
        return { ok: b.litFlag, ...r, freed: M.sprites.length };
      }
      if (M.kind === 'hunt') {
        const h = M.holds.find((q) => q.goal === b);
        if (!h) return { ok: false, reason: 'no brute holds this stone' };
        const r = drive((s) => {
          const e = h.foe, d = hyp(s.hero.x - e.x, s.hero.z - e.z), [dx, dz] = dirTo(s.hero, e);
          if (d > 13 && e.state === 'idle') return { dx, dz, mag: 1 };
          return plays.brutePlay({ t: s.t, hero: s.hero, foe: e });
        }, () => b.litFlag, T);
        return { ok: b.litFlag, ...r, wounds: h.foe.wounds, foe: h.foe.state };
      }
      if (M.kind === 'chime') {
        const r = drive((s) => {
          const [dx, dz] = dirTo(s.hero, bp), d = hyp(s.hero.x - bp.x, s.hero.z - bp.z);
          return { dx, dz, mag: d > 1.2 ? 0.6 : 0.1, jump: s.hero.grounded && d < 4 && Math.floor(s.t * 2) % 2 === 0 };
        }, () => b.litFlag, T);
        return { ok: b.litFlag, ...r };
      }
      if (M.kind === 'deliver') {
        // the nearest pearl that is still on its bed: wait for the ebb, step into it, then carry it (set down beside the lens: a real walk is realm-bot's)
        const pr = M.pearls.filter((q) => q.state === 'rest').sort((a, c) => hyp(a.x - P.x, a.z - P.z) - hyp(c.x - P.x, c.z - P.z))[0];
        if (!pr) return { ok: false, reason: 'no pearl is left on a bed' };
        let waited = 0;
        while (g.waterY > pr.home.y - 0.35 && waited < 200) { wait(30); waited += 0.5; }
        P.place(pr.home.x - 3, pr.home.y - 0.55 + 0.05, pr.home.z, Math.PI / 2); g.cam.snapBehind(P); wait(10); M.lastPos = [P.x, P.z];
        const pick = drive((s) => { const [dx, dz] = dirTo(s.hero, { x: pr.home.x, z: pr.home.z }); return { dx, dz, mag: 1 }; }, () => M.carry === pr, 8);
        if (M.carry !== pr) return { ok: false, reason: 'the pearl was not taken', waited, ...pick };
        const sp = { x: b.x + 3.2, z: b.z };
        P.place(sp.x, g.collision.support(sp.x, sp.z, g.collision.heightAt(sp.x, sp.z) + 2, 0.5).y + 0.05, sp.z, -Math.PI / 2); g.cam.snapBehind(P); M.lastPos = [P.x, P.z];
        const r = drive((s) => { const [dx, dz] = dirTo(s.hero, bp); return hyp(s.hero.x - bp.x, s.hero.z - bp.z) > 2.5 ? { dx, dz, mag: 0.5 } : { dx: 0, dz: 0, mag: 0 }; }, () => b.litFlag, 20);
        return { ok: b.litFlag, waited, ...r };
      }
      return { ok: false, reason: `unknown mission ${M.kind}` };
    },
  };
})();
