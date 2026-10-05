// The foes played in the running game by the REAL controller: each play of tools/lib/foe-plays.mjs (the same ones tools/foe-test.mjs plays against the brains and a model of the hero) is played on the
// floor of the Guardian's Court (flat, 76 m across: the Guardian himself is taken out of the world), with the foe called in 14 m or so from the hero by the EnemySystem, the hero's stick,
// jump, flame and ram going through the game's own input (tools/bot-inject.js), and the world stepped by the game's own update. What is read back is what happened in the game: whether the foe fell,
// how often the hero was hurt (the real playerHurt), what his attacks did to it (the real outcomes) and whether a keg went off.
//   node tools/foe-bot.mjs [play-id-or-kind ...] [--runs 2] [--list]        (needs the dev server on :5173, GV_URL=http://127.0.0.1:PORT/ tests another)
// A play that does not do what it wants is played once more (a policy is not a person, and the game has random numbers of its own: where a foe patrols); it fails only if both runs fail.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYS } from './lib/foe-plays.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.GV_URL || 'http://127.0.0.1:5173/';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--') && isNaN(+a));
const flag = (k) => process.argv.includes(`--${k}`);
const RUNS = +(process.argv[process.argv.indexOf('--runs') + 1]) || 2;
const picked = PLAYS.filter((p) => !args.length || args.some((a) => p.id === a || p.kind === a || p.id.startsWith(a)));
if (flag('list')) { for (const p of PLAYS) console.log(p.id.padEnd(16), p.kind.padEnd(8), p.want.padEnd(8), p.say); process.exit(0); }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message.slice(0, 300)); });
page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) { errors.push(m.text()); console.log('[error]', m.text().slice(0, 300)); } });
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : detail); };

await page.goto(BASE + '?world=guardian&preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
const boot = await page.evaluate(() => window.__error);
if (boot) { console.log('BOOT ERROR', String(boot).slice(0, 400)); process.exit(1); }
await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'tools/bot-inject.js'), 'utf8') });

await page.evaluate(async () => {
  const plays = await import('/tools/lib/foe-plays.mjs');
  const foes = await import('/src/game/foes/index.js');
  const G = window.__game, bot = window.__bot;
  bot.install();
  G.systems = G.systems.filter((s) => s !== G.boss);                            // (the Guardian sleeps: this is a floor to play on)
  const rec = { hurts: 0, blows: [], boomed: false, killed: false, foe: null };
  const hurt = G.playerHurt.bind(G);
  G.playerHurt = (x, z) => { const ok = hurt(x, z); if (ok) { rec.hurts++; G.sparx.hp = 3; G.player.dead = false; } return ok; };       // (he is hurt, and he does not die: a play counts the hurts)
  G.on('enemy', (e) => { if (e === rec.foe) rec.killed = true; });
  const E = G.enemies, outcome = E._outcome.bind(E), on = E._on.bind(E);
  E._outcome = (e, attack, out, p) => { if (e === rec.foe) rec.blows.push({ attack, out, state: e.state, side: foes.sideOf(e, p.x, p.z, (foes.BRAINS[e.K.brain] || {}).front ?? 0.96) }); return outcome(e, attack, out, p); };
  E._on = (type, d) => { if (type === 'boom' && d && d.by === rec.foe) rec.boomed = true; return on(type, d); };
  const prev = { jump: false, flame: false, charge: false };
  const apply = (a) => {
    const ctl = bot.ctl, Y = G.cam.yaw, m = Math.max(0, Math.min(1, a.mag || 0));
    ctl.my = (a.dx * Math.sin(Y) + a.dz * Math.cos(Y)) * m; ctl.mx = (-a.dx * Math.cos(Y) + a.dz * Math.sin(Y)) * m;
    ctl.jump = !!a.jump; if (a.jump && !prev.jump) bot.edge('jump');
    ctl.flame = !!a.flame; if (a.flame && !prev.flame) bot.edge('flame');
    ctl.charge = !!a.charge; if (a.charge && !prev.charge) bot.edge('charge');
    prev.jump = !!a.jump; prev.flame = !!a.flame; prev.charge = !!a.charge;
  };
  const stage = { fx: -18, fz: -45 };                                           // (the foe's place: the line through the court at z = -45 is 68 m of flat floor; the pillars stand 6 m off it)
  const reset = () => {
    for (const e of E.list.slice()) E.dismiss(e);
    bot.tick(60);
    rec.hurts = 0; rec.blows = []; rec.boomed = false; rec.killed = false;
    prev.jump = prev.flame = prev.charge = false; bot.ctl.mx = bot.ctl.my = 0;
  };
  window.__foeplay = {
    run(id) {
      const pl = plays.PLAYS.find((p) => p.id === id), p = G.player;
      reset();
      const hx = stage.fx + pl.at, hz = stage.fz;
      p.place(hx, G.collision.heightAt(hx, hz) + 0.05, hz, -Math.PI / 2);
      p.invulnT = 0; p.hurtT = 0; G.sparx.hp = 3; G.cam.snapBehind(p);
      bot.tick(20);
      p.invulnT = 0;
      const foe = E.add({ x: stage.fx, z: stage.fz, variant: pl.kind });
      foe.yaw = Math.PI / 2; rec.foe = foe;
      const t0 = G.time;
      let act = null, frames = 0, tail = 0;
      while (G.time - t0 < pl.T) {
        const snap = { t: G.time - t0, hero: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, grounded: p.grounded, up: Math.max(0, p.y - G.collision.heightAt(p.x, p.z)) }, foe, foes: E.list };
        if (frames % 3 === 0 || !act) act = pl.policy(snap);
        apply(act);
        bot.tick(1); frames++;
        if (rec.killed || foe.state === 'dead') { if (++tail > 30) break; }
      }
      bot.ctl.mx = bot.ctl.my = 0; bot.ctl.jump = bot.ctl.flame = bot.ctl.charge = false;
      return { killed: rec.killed || foe.state === 'dead' && !foe.poofedAway, hurts: rec.hurts, blows: rec.blows.slice(), boomed: rec.boomed || !!foe.exploded, t: +(G.time - t0).toFixed(1), end: foe.state };
    },
  };
});

const { judge } = await import('./lib/foe-plays.mjs');
let n = 0;
for (const pl of picked) {
  const results = [];
  for (let run = 0; run < RUNS; run++) {
    const r = await page.evaluate((id) => window.__foeplay.run(id), pl.id);
    results.push(r);
    const bad = judge(pl.want, r);
    if (!bad) break;
  }
  const last = results[results.length - 1], bad = judge(pl.want, last);
  const tries = results.map((r) => `${r.killed ? 'killed' : 'not killed'} in ${r.t}s, hurts ${r.hurts}${r.boomed ? ', went off' : ''}`).join(' / ');
  check(pl.say, !bad, `(${tries}${bad ? '; wanted ' + pl.want + ': ' + bad : ''})`);
  n++;
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FAILED of ${n} plays` : `\nall ${n} plays played as wanted`);
process.exit(failed ? 1 : 0);
