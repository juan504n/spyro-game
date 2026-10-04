// The Guardian's fight driven from outside the page, for the tests that run the real game in a browser (tools/boss-bot.mjs, tools/guardian-test.mjs): the synthetic-input library of tools/bot-inject.js,
// the player of tools/lib/duel.mjs (`policy`) looking at the REAL game's state, and a log of what the brain did. Install it once the Court is the world on the page (it holds that world's Game):
//   await installDriver(page, root);                         // then, in the page:
//   window.__fight.run(n, policyOptions)                      n frames: the policy decides every third, the stick / jump / flame / ram it says go through the game's own input, the app's own update runs
//   window.__fight.log                                        { events, hits, deaths, byWhat, cracks, lit, lost, maxHelpers, kills }
// The app's own update is what steps the game (`window.__appUpdate`, saved once from the class: bot.install() replaces the instance's), so that the travels, the ending and the credits play as they do for a person.
import fs from 'node:fs';
import path from 'node:path';

export async function installDriver(page, root) {
  await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'tools/bot-inject.js'), 'utf8') });
  await page.evaluate(async () => {
    const mod = await import('/tools/lib/duel.mjs');
    const G = window.__game, bot = window.__bot, app = window.__app;
    if (!window.__appUpdate) window.__appUpdate = Object.getPrototypeOf(app).update.bind(app);
    bot.install();
    const mem = {}, prev = { jump: false, flame: false, charge: false };
    const snap = () => {
      const p = G.player, cfg = G.boss.cfg, B = G.boss.brain;
      return {
        t: G.time,
        hero: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, dirx: p.dirx, dirz: p.dirz, vx: p.vx, vz: p.vz, vy: p.vy, grounded: p.grounded, up: Math.max(0, p.y - G.collision.heightAt(p.x, p.z)), canAct: p.canAct, dead: p.dead, chargeT: p.chargeT, flameT: p.flameT, flameCd: p.flameCd, chargeCd: p.chargeCd },
        arena: { cx: cfg.x, cz: cfg.z, r: cfg.arenaR, bodyR: cfg.bodyR, pillars: cfg.pillars },
        boss: { mode: B.mode, sub: B.sub, lit: B.lit, phase: B.phase, crown: B.crown, contact: B.contact, charge: B.charge, fists: B.fists.map((f) => ({ ...f })), waves: B.waves.map((w) => ({ ...w })), bolts: B.bolts.map((b) => ({ ...b })), circles: B.circles.map((c) => ({ ...c })), lanternPos: (j) => B.lanternPos(j) },
        enemies: G.enemies.list.filter((e) => e.state !== 'dead').map((e) => ({ x: e.x, z: e.z, variant: e.variant })),
      };
    };
    const apply = (a) => {
      const ctl = bot.ctl, Y = G.cam.yaw;
      ctl.my = (a.dx * Math.sin(Y) + a.dz * Math.cos(Y)) * a.mag; ctl.mx = (-a.dx * Math.cos(Y) + a.dz * Math.sin(Y)) * a.mag;
      ctl.jump = !!a.jump; if (a.jump && !prev.jump) bot.edge('jump');
      ctl.flame = !!a.flame; if (a.flame && !prev.flame) bot.edge('flame');
      ctl.charge = !!a.charge; if (a.charge && !prev.charge) bot.edge('charge');
      prev.jump = !!a.jump; prev.flame = !!a.flame; prev.charge = !!a.charge;
    };
    const log = { events: [], hits: 0, deaths: 0, byWhat: {}, cracks: 0, lit: 0, lost: 0, maxHelpers: 0, kills: 0 };
    const B = G.boss.brain, orig = B.emit.bind(B);
    B.emit = (t, o) => {
      const rec = `${B.t.toFixed(1)}s ${t}${o && o.what ? ' ' + o.what : ''}${o && o.n ? ' ' + o.n : ''}${o && o.phase !== undefined ? ' p' + o.phase : ''}`;
      if (!/^(\d|\.)+s (slam-telegraph|slam-lock|bolt-burst|gloom-burst|bolt|gloom)$/.test(rec)) log.events.push(rec);
      if (t === 'hit') { log.hits++; log.byWhat[o.what] = (log.byWhat[o.what] || 0) + 1; }
      if (t === 'crack') log.cracks++;
      if (t === 'lit') log.lit++;
      if (t === 'window-lost') log.lost++;
      orig(t, o);
    };
    G.on('enemy', () => { log.kills++; });
    window.__fight = {
      log, mem, act: null, wasDead: false,
      run(n, popts) {
        for (let i = 0; i < n; i++) {
          if (B.mode === 'freed') break;
          if (G.hud.talking) bot.edge('confirm');
          if (i % 3 === 0 || !window.__fight.act) window.__fight.act = mod.policy(snap(), mem, popts);
          apply(window.__fight.act);
          window.__appUpdate(1 / 60);
          if (G.player.dead && !window.__fight.wasDead) { log.deaths++; window.__fight.wasDead = true; }
          if (!G.player.dead) window.__fight.wasDead = false;
          log.maxHelpers = Math.max(log.maxHelpers, G.boss.helpers.filter((h) => h.state !== 'dead').length);
        }
        const p = G.player;
        return { t: +B.t.toFixed(1), mode: B.mode, sub: B.sub, lit: B.lit, fists: B.fists.map((f) => f.state).join('/'), hero: [+p.x.toFixed(1), +p.z.toFixed(1)], hp: G.sparx.hp, dead: p.dead, hits: log.hits, deaths: log.deaths, cracks: log.cracks, state: window.__app.state };
      },
    };
  });
}
