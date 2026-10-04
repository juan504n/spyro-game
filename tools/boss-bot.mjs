// The Guardian fought in the running game by the REAL controller: the hero walks up the gorge road from the door of Dawnhaven, the Guardian wakes, and a player (tools/lib/duel.mjs `policy`: it sees
// the circles on the floor, the rings, the bolts, the fists that have landed and the crown, and takes the way nothing hits) dodges, rams the fists that land, flames the lanterns of the crown and fights
// the Snuffers of the later phases, until the Guardian is free (or the time is up). Everything goes through the game's own input: the stick (turned by the camera's yaw), the jump, the flame and the ram.
//   node tools/boss-bot.mjs [--margin 0.9] [--lap 29] [--ram off] [--flame off] [--idle] [--max 400] [--ending] [--shots dir]
//   (needs the dev server on :5173; GV_URL=http://127.0.0.1:PORT/ tests another server)
// --ending also plays what follows: the dialogue clicked through, the credits skipped, the results, free roam in the Court. Exit code 1 when the fight is not won (or when it was meant not to be: --ram off,
// --flame off and --idle are the fights that must NOT be won: then 1 means that it WAS).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDriver } from './lib/boss-driver.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.GV_URL || 'http://127.0.0.1:5173/';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes(`--${k}`);
const opts = { margin: +arg('margin', 0.9), lap: +arg('lap', 29), ram: arg('ram', 'on') !== 'off', flame: arg('flame', 'on') !== 'off', idle: flag('idle') };
const MAX = +arg('max', 400), shots = arg('shots', null), expectWin = opts.ram && opts.flame && !opts.idle;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message.slice(0, 300)); });
page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) { errors.push(m.text()); console.log('[error]', m.text().slice(0, 300)); } });
const ev = (fn, a) => page.evaluate(fn, a);

await page.goto(BASE + '?world=guardian&preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
const err = await ev(() => window.__error);
if (err) { console.log('BOOT ERROR', String(err).slice(0, 400)); process.exit(1); }
await installDriver(page, root);

// ---- up the gorge road to the court (the real walk, door to mouth) ---------------------------------------------------------------------------------
const walk = await ev(() => { const r = window.__bot.goto(0, 16, { tol: 2, timeout: 40, auto: true }); return { ...r, at: window.__bot.state() }; });
console.log('walk to the court:', JSON.stringify(walk));
if (!walk.ok) { console.log('FAIL: the walk up the gorge road'); await browser.close(); process.exit(1); }

// ---- the fight --------------------------------------------------------------------------------------------------------------------------------
// (a hero who stands still stands in the court, where the fists fall: at the mouth he is out of their reach, 5 m beyond where they can land)
if (opts.idle) await ev(() => window.__bot.goto(0, -12, { tol: 2, timeout: 20, auto: true }));
let last = null, t0 = Date.now(), shotN = 0, seen = 0;
if (shots) fs.mkdirSync(shots, { recursive: true });
// (with --shots a picture is taken a few frames after each of these things happens, and every 10 s of the fight)
const SHOT_ON = /wake|phase|slam|crack|stoop|window|contact|lit|bolt|gloom|freed/;
const shotAfter = new Map();
for (let chunk = 0; chunk < 4000; chunk++) {
  last = await ev(([o, n]) => window.__fight.run(n, o), [opts, shots ? 4 : 120]);
  if (!shots && chunk % 5 === 0) console.log(JSON.stringify(last));
  if (shots) {
    const evs = await ev((n) => window.__fight.log.events.slice(n), seen);
    for (const e of evs) { const kind = e.split(' ')[1]; if (SHOT_ON.test(kind) && !shotAfter.has(kind + e)) shotAfter.set(kind + e, { kind, wait: kind === 'slam' ? 8 : kind === 'bolt-charge' ? 40 : kind === 'gloom' ? 60 : 1 }); }
    seen += evs.length;
    for (const [k, v] of shotAfter) { if (--v.wait <= 0) { await page.screenshot({ path: path.join(shots, `${String(shotN++).padStart(3, '0')}-${v.kind}-${last.t}.png`) }); shotAfter.delete(k); } }
  }
  if (last.mode === 'freed' || last.t > MAX || Date.now() - t0 > 900000) break;
}
const info = await ev(() => { const F = window.__fight, G = window.__game; return { log: F.log, helpers: G.boss.helpers.length, enemiesKilled: G.stats.enemies, hitsTaken: G.boss.hitsTaken, fightTime: +G.boss.fightTime.toFixed(1), day: +G.dayTarget.toFixed(2), beacons: G.stats.beacons }; });
console.log(info.log.events.slice(-60).join('\n'));
const won = last.mode === 'freed';
console.log(`${won ? 'FREED' : 'NOT freed'} at ${last.t}s: hits ${info.log.hits} ${JSON.stringify(info.log.byWhat)}, deaths ${info.log.deaths}, cracks ${info.log.cracks}, lanterns ${info.log.lit}, windows lost ${info.log.lost}, Snuffers killed ${info.log.kills} (at most ${info.log.maxHelpers} at once), fight ${info.fightTime}s, ${((Date.now() - t0) / 1000).toFixed(0)}s of real time`);

// ---- the ending ---------------------------------------------------------------------------------------------------------------------------------
let endingOk = true;
if (won && flag('ending')) {
  const states = [];
  for (let i = 0; i < 400; i++) {
    const r = await ev(() => { for (let k = 0; k < 30; k++) { if (window.__game.hud.talking) window.__bot.edge('confirm'); if (window.__app.state === 'credits' || window.__app.state === 'endresults') { window.__bot.edge('confirm'); window.__game.input.uiEdge.confirm = true; } window.__appUpdate(1 / 60); } return { state: window.__app.state, mode: window.__game.mode, talking: window.__game.hud.talking, locked: window.__game.locked }; });
    if (!states.length || states[states.length - 1] !== r.state) states.push(r.state);
    if (r.state === 'play' && r.mode === 'complete') break;
  }
  const end = await ev(() => { const G = window.__game, pr = window.__app.progress; return { state: window.__app.state, mode: G.mode, locked: G.locked, hud: G.hud.visible, freedSaved: !!pr.guardian.freed, deaths: pr.guardian.deaths, brain: G.boss.brain.mode, day: +G.day.toFixed(2), beams: G.boss.beamK > 0.5 }; });
  console.log('ending: ' + states.join(' > '), JSON.stringify(end));
  endingOk = states.join('>') === 'ending>credits>endresults>play' && end.state === 'play' && end.mode === 'complete' && !end.locked && end.hud && end.freedSaved && end.brain === 'freed' && end.day > 0.9;
  console.log(endingOk ? 'PASS the ending plays through to free roam' : 'FAIL the ending');
}
await browser.close();
// (a hero who stands still must also be HURT, again and again: the fists hurt for real, Sparx takes it and the fourth hit sets him back; with the hurt cut off he would stand there unharmed and still not win)
const hurtOk = !opts.idle || info.log.deaths >= 2;
const ok = expectWin ? won && endingOk && errors.length === 0 : !won && hurtOk && errors.length === 0;
console.log(ok ? 'PASS' : 'FAIL', expectWin ? 'the Guardian is freed' : opts.idle ? `a hero who stands still was set back ${info.log.deaths} times and did not win` : 'a fight that must not be won was not won', errors.length ? `(${errors.length} errors)` : '');
process.exit(ok ? 0 : 1);
