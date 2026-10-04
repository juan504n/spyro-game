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
await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'tools/bot-inject.js'), 'utf8') });
await ev(async (opts) => {
  const mod = await import('/tools/lib/duel.mjs');
  const G = window.__game, bot = window.__bot, app = window.__app;
  window.__appUpdate = app.update.bind(app);                              // (bot.install() stops the real-time loop: the bot drives the app's own update, so that the ending plays)
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
    log, mem,
    /** n frames of policy + the game's own update: returns where the fight is */
    run(n, popts) {
      for (let i = 0; i < n; i++) {
        if (B.mode === 'freed') break;
        if (G.hud.talking) { bot.edge('confirm'); }
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
}, opts);

// ---- up the gorge road to the court (the real walk, door to mouth) ---------------------------------------------------------------------------------
const walk = await ev(() => { const r = window.__bot.goto(0, 16, { tol: 2, timeout: 40, auto: true }); return { ...r, at: window.__bot.state() }; });
console.log('walk to the court:', JSON.stringify(walk));
if (!walk.ok) { console.log('FAIL: the walk up the gorge road'); await browser.close(); process.exit(1); }

// ---- the fight --------------------------------------------------------------------------------------------------------------------------------
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
    const r = await ev(() => { const F = window.__fight; for (let k = 0; k < 30; k++) { if (window.__game.hud.talking) window.__bot.edge('confirm'); if (window.__app.state === 'credits' || window.__app.state === 'endresults') { window.__bot.edge('confirm'); window.__game.input.uiEdge.confirm = true; } window.__appUpdate(1 / 60); } return { state: window.__app.state, mode: window.__game.mode, talking: window.__game.hud.talking, locked: window.__game.locked }; });
    if (!states.length || states[states.length - 1] !== r.state) states.push(r.state);
    if (r.state === 'play' && r.mode === 'complete') break;
  }
  const end = await ev(() => { const G = window.__game, pr = window.__app.progress; return { state: window.__app.state, mode: G.mode, locked: G.locked, hud: G.hud.visible, freedSaved: !!pr.guardian.freed, deaths: pr.guardian.deaths, brain: G.boss.brain.mode, day: +G.day.toFixed(2), beams: G.boss.beamK > 0.5 }; });
  console.log('ending: ' + states.join(' > '), JSON.stringify(end));
  endingOk = states.join('>') === 'ending>credits>endresults>play' && end.state === 'play' && end.mode === 'complete' && !end.locked && end.hud && end.freedSaved && end.brain === 'freed' && end.day > 0.9;
  console.log(endingOk ? 'PASS the ending plays through to free roam' : 'FAIL the ending');
}
await browser.close();
const ok = expectWin ? won && endingOk && errors.length === 0 : !won && errors.length === 0;
console.log(ok ? 'PASS' : 'FAIL', expectWin ? 'the Guardian is freed' : 'a fight that must not be won was not won', errors.length ? `(${errors.length} errors)` : '');
process.exit(ok ? 0 : 1);
