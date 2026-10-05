// The trials played in the running game by the REAL controller: each play of tools/lib/trial-plays.mjs (the same ones tools/trial-test.mjs plays against the machines and a model of the hero) is played on
// the floor of the Guardian's Court (flat round floor, the Guardian himself taken out of the world), with the trial put into the world by the TrialSystem a few metres from the hero, his stick, jump,
// flame and ram going through the game's own input (tools/bot-inject.js), and the world stepped by the game's own update. What is read back is what happened in the game: whether the seal was broken,
// how often it began again, what the machine said (the real events), what the HUD showed, which sounds were asked for.
//   node tools/trial-bot.mjs [play-id-or-kind ...] [--runs 2] [--list] [--sounds] [--quick]        (needs the dev server on :5173, GV_URL=http://127.0.0.1:PORT/ tests another)
// A play that does not do what it wants is played once more (a policy is not a person); it fails only if both runs fail.
// Besides the plays it holds what the game does with a trial: the lantern of a trial is SEALED (a breath on it lights nothing and the HUD says why), the last step breaks the seal and the lantern is
// lit a moment later (stats, banner), the trial's own foes pay nothing, each kind's lesson is said once, the aim assist swings to the bells and the wisps and not to the sealed lantern, a saved realm
// has every seal broken, and what a trial put into the world goes with it (the live decals and billboards are the same after every play as before the first).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYS, judge } from './lib/trial-plays.mjs';
import { TRIALS } from '../src/game/trials/kinds.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.GV_URL || 'http://127.0.0.1:5173/';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--') && isNaN(+a));
const flag = (k) => process.argv.includes(`--${k}`);
const RUNS = +(process.argv[process.argv.indexOf('--runs') + 1]) || 2;
const quick = flag('quick');                                                      // (one play of each kind, the first - the right one - and every check of the system: a minute, not four)
const picked = PLAYS.filter((p) => !args.length || args.some((a) => p.id === a || p.kind === a || p.id.startsWith(a))).filter((p, i, all) => !quick || all.findIndex((q) => q.kind === p.kind) === i);
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
  const plays = await import('/tools/lib/trial-plays.mjs');
  const G = window.__game, bot = window.__bot, S = G.trials;
  bot.install();
  G.systems = G.systems.filter((s) => s !== G.boss);                            // (the Guardian sleeps: this is a floor to play on)
  const AT = { circuit: [0, -30], rings: [-12, -58] };                           // (the Court: a flat floor round a dais at (0, -30); a trial stands on its western side, a loop of pylons goes round the dais; the ledge of the rings is up in the air over its north-west, its course running south over the floor)
  const at = (kind) => AT[kind] || [-22, -30];
  const rec = { events: [], hurts: 0, sounds: new Set(), n: {}, opts: {}, said: [], r: null };
  const hud = G.hud, hint = hud.hint.bind(hud);
  hud.hint = (text, dur) => { rec.said.push(text); return hint(text, dur); };
  if (G.audio && G.audio.sfx) { const sfx = G.audio.sfx.bind(G.audio); G.audio.sfx = (name, o) => { rec.sounds.add(name); rec.n[name] = (rec.n[name] || 0) + 1; rec.opts[name] = o; return sfx(name, o); }; }
  else G.audio = { sfx: (name, o) => { rec.sounds.add(name); rec.n[name] = (rec.n[name] || 0) + 1; rec.opts[name] = o; } };                    // (a page without audio: the names are still asked for)
  const on = S._on.bind(S);
  S._on = (r, type, d) => { if (r === rec.r) rec.events.push({ type, i: d.i, why: d.why, k: d.k, score: d.score }); return on(r, type, d); };
  const hurt = G.playerHurt.bind(G);
  G.playerHurt = (x, z) => { const ok = hurt(x, z); if (ok) { rec.hurts++; G.sparx.hp = 3; G.player.dead = false; } return ok; };       // (he is hurt, and he does not die: a play counts the hurts)
  const liveList = () => [...G.fx.decalHalf.list.filter((d) => !d.dead).map((d) => ['half', d]), ...G.fx.decalAdd.list.filter((d) => !d.dead).map((d) => ['add', d]), ...G.fx.handles.filter((h) => !h.dead && h.sprite !== 'glow_small').map((h) => ['bb', h])];
  let base = null, baseSet = null;
  const reset = () => {
    for (const r of S.list.slice()) S.remove(r);
    for (const e of G.enemies.list.slice()) G.enemies.dismiss(e);
    bot.tick(60);
    G.beacons.lit = 0; G.stats.beacons = 0; G.stats.trials = 0; G.day = G.dayTarget = 0;                   // (the Court has no lanterns of its own: what a check lit is forgotten, in the system's count and in the stats)
    rec.events = []; rec.hurts = 0; rec.sounds.clear(); rec.n = {}; rec.r = null;
    prev.jump = prev.flame = prev.charge = false; bot.ctl.mx = bot.ctl.my = 0;
    if (base === null) { base = liveList().length; baseSet = new Set(liveList().map((x) => x[1])); }
  };
  const prev = { jump: false, flame: false, charge: false };
  // a lantern for a trial to seal, put into the Court (with two spare ones that nobody lights: the last lantern of a world starts its finale, and the Court has none)
  const lanterns = [];
  const lantern = (id, x, z) => {
    const mk = (i, x0, z0) => { const b = G.beacons._make({ id: i, name: 'BOT LANTERN', x: x0, y: G.collision.heightAt(x0, z0), z: z0, yaw: 0 }, G.beacons.list.length); G.beacons.list.push(b); lanterns.push(b); return b; };
    mk(id + '-a', x + 40, z - 20); mk(id + '-b', x + 40, z + 20);
    return mk(id, x, z);
  };
  const clearLanterns = () => {
    for (const b of lanterns) {
      const i = G.beacons.list.indexOf(b); if (i >= 0) G.beacons.list.splice(i, 1);
      b.model.root.parent && b.model.root.parent.remove(b.model.root); b.beam.root.parent && b.beam.root.parent.remove(b.beam.root);
      b.pool.dead = true; b.halo.dead = true; for (const w of b.wisps) w.h.dead = true;
    }
    lanterns.length = 0;
    G.hud.bannerState = null;
  };
  const apply = (a) => {
    const ctl = bot.ctl, Y = G.cam.yaw, m = Math.max(0, Math.min(1, a.mag || 0));
    ctl.my = (a.dx * Math.sin(Y) + a.dz * Math.cos(Y)) * m; ctl.mx = (-a.dx * Math.cos(Y) + a.dz * Math.sin(Y)) * m;
    ctl.jump = !!a.jump; if (a.jump && !prev.jump) bot.edge('jump');
    ctl.flame = !!a.flame; if (a.flame && !prev.flame) bot.edge('flame');
    ctl.charge = !!a.charge; if (a.charge && !prev.charge) bot.edge('charge');
    prev.jump = !!a.jump; prev.flame = !!a.flame; prev.charge = !!a.charge;
  };
  const place = (x, z, yaw, y) => { const p = G.player; p.place(x, (y ?? G.collision.heightAt(x, z)) + 0.05, z, yaw); p.invulnT = 0; p.hurtT = 0; G.sparx.hp = 3; G.cam.snapBehind(p); bot.tick(20); p.invulnT = 0; };
  const stop = () => { bot.ctl.mx = bot.ctl.my = 0; bot.ctl.jump = bot.ctl.flame = bot.ctl.charge = false; prev.jump = prev.flame = prev.charge = false; };
  /** play a policy on a trial (a spec of trial-plays shifted to the Court) until it is solved or T seconds have gone: returns what happened */
  const playOn = (spec, hero, policy, T, seed, extra = {}) => {
    const [ox, oz] = at(spec.kind);
    const sp = plays.shift(spec, ox, oz, spec.kind === 'rings' ? G.collision.heightAt(ox, oz) : 0);                                   // (a course in the air is written over a ground: the Court's floor is it)
    let ledge = null;
    if (spec.kind === 'rings') ledge = G.collision.add({ type: 'cyl', x: sp.x, z: sp.z, r: 4.5, y0: sp.y - 20, y1: sp.y, top: true, tag: 'botledge' });          // (the ledge he leaps from: a stand of stone with its edge 4.5 m out)
    place(ox + hero.x, oz + hero.z, hero.yaw, spec.kind === 'rings' ? sp.y : undefined);
    const r = S.add({ ...sp, id: 'bot-' + spec.kind, seed, goal: undefined, ...extra });                 // (the plays' specs name a goal that is not in the Court: these seal nothing)
    rec.r = r; rec.events = []; rec.sounds.clear(); rec.n = {}; rec.hurts = 0;
    const p = G.player, t0 = G.time;
    const floorAt = (x, z) => G.collision.support(x, z, p.y + 0.6, 0.62).y;                                   // (what a pilot is told of the ground: where it falls away)
    let act = null, frames = 0, solvedAt = null, hudSeen = 0, hudText = null;
    while (G.time - t0 < T) {
      const snap = { t: G.time - t0, hero: p, trial: r.t, foes: r.foes, events: rec.events, floorAt };
      if (frames % 2 === 0 || !act) act = policy(snap);
      apply(act);
      bot.tick(1); frames++;
      if (r.done && solvedAt === null) solvedAt = G.time - t0;
      if (solvedAt !== null && (spec.kind === 'rings' ? (p.grounded && G.time - t0 - solvedAt > 0.5) || G.time - t0 - solvedAt > 9 : G.time - t0 - solvedAt > 1.6)) break;          // (a course in the air is flown to the ground)
      if (r.t.state === 'active') { const h = S.hudState(); if (h) { hudSeen++; hudText = h.text; } }
    }
    stop();
    const t = r.t, q = (v) => +v.toFixed(1);
    if (ledge) G.collision.remove(ledge);
    const detail = t.kind === 'rings' ? { passed: t.passed, last: t.last, got: t.got, runs: t.runs, hero: [q(p.x), q(p.y), q(p.z)], grounded: p.grounded }
      : t.kind === 'siege' ? { wave: t.wave, left: t.left, foes: r.foes.map((e) => `${e.kind}:${e.state}`), hero: [q(p.x), q(p.z)] }
      : t.kind === 'mirrors' ? { turns: t.turns, par: t.par, hit: t.beam.hit, hero: [q(p.x), q(p.z)], mirrors: t.mirrors.map((m) => [m.i, m.j, m.s]), source: t.source, receiver: t.receiver, turned: rec.events.filter((e) => e.type === 'turn_mirror').map((e) => e.i) }
      : t.kind === 'puck' ? { score: t.score, puck: [q(t.px), q(t.pz)] } : t.kind === 'thief' ? { foe: t.foe && t.foe.state } : {};
    const res = { detail, solved: r.done, t: solvedAt === null ? null : +solvedAt.toFixed(1), fails: rec.events.filter((e) => e.type === 'fail').length, misses: rec.events.filter((e) => e.type === 'miss').length, hurts: rec.hurts, events: rec.events.map((e) => e.type), sounds: [...rec.sounds], counts: { ...rec.n }, hudSeen, hudText, foes: r.foes.length, state: r.t.state };
    return { r, res };
  };
  window.__trialplay = {
    run(id) {
      const pl = plays.PLAYS.find((q) => q.id === id);
      reset();
      const { r, res } = playOn(pl.spec, pl.hero, pl.policy(), pl.T, pl.seeds ? pl.seeds[0] : 1);
      S.remove(r);
      return res;
    },
    /** a trial with a lantern: the seal holds against a breath, the hint says why, a solved trial lights the lantern */
    seal() {
      reset();
      const [ox, oz] = at('plates');
      const b = lantern('botlantern', ox + 12, oz);
      const lit0 = G.stats.beacons, trials0 = G.stats.trials, p = G.player;
      const r = S.add({ ...plays.shift(plays.SPECS.plates, ox, oz), id: 'bot-seal', goal: 'botlantern', seed: 3 });
      place(ox + 12 - 4.5, oz, Math.PI / 2);
      const said0 = rec.said.length;
      // a breath on the sealed lantern
      for (let i = 0; i < 30; i++) { apply({ dx: 1, dz: 0, mag: 0, flame: true }); bot.tick(1); }
      stop(); bot.tick(20);
      const sealedHeld = !b.litFlag && b.sealed === true, hintText = rec.said.slice(said0).find((t) => /SEALED/.test(t)) || null, hintSaid = !!hintText, turnedAway = rec.sounds.has('trial_seal');
      const aimsAtLantern = G.player._aimTargets().some((q) => Math.hypot(q.x - b.x, q.z - b.z) < 0.01);
      // solve it with the right play
      place(ox, oz + 0.5, 0);
      const policy = plays.PLAYS.find((q) => q.id === 'plates-right').policy();
      const t0 = G.time;
      let solvedAt = null, litAt = null, banner = null;
      while (G.time - t0 < 60) {
        apply(policy({ t: G.time - t0, hero: p, trial: r.t, foes: r.foes, events: rec.events }));
        bot.tick(1);
        if (r.done && solvedAt === null) solvedAt = G.time - t0;
        if (b.litFlag && litAt === null) { litAt = G.time - t0; banner = G.hud.bannerState && G.hud.bannerState.title; }
        if (litAt !== null) break;
      }
      stop();
      const out = { sealedHeld, hintSaid, hintText, turnedAway, aimsAtLantern, solved: r.done, solvedAt, litAt, banner, unsealed: b.sealed === false, beacons: G.stats.beacons - lit0, trials: G.stats.trials - trials0, sounds: [...rec.sounds] };
      S.remove(r);
      clearLanterns();
      G.stats.beacons = lit0; G.stats.trials = trials0; G.day = G.dayTarget = 0;
      return out;
    },
    /** a lantern far from its trial (more than 26 m): the seal breaks and the lantern waits for his fire - it is not lit, it is ready, the HUD says so - and a breath lights it */
    far() {
      reset();
      const [ox, oz] = at('plates'), p = G.player;
      const b = lantern('botlantern4', ox + 42, oz);                  // (42 m from the plates, still on the Court's floor)
      const lit0 = G.stats.beacons, trials0 = G.stats.trials;
      const r = S.add({ ...plays.shift(plays.SPECS.plates, ox, oz), id: 'bot-far', goal: 'botlantern4', seed: 3 });
      place(ox, oz + 0.5, 0);
      const policy = plays.PLAYS.find((q) => q.id === 'plates-right').policy(), said0 = rec.said.length, t0 = G.time;
      let solvedAt = null;
      while (G.time - t0 < 60) {
        apply(policy({ t: G.time - t0, hero: p, trial: r.t, foes: r.foes, events: rec.events }));
        bot.tick(1);
        if (r.done && solvedAt === null) solvedAt = G.time - t0;
        if (solvedAt !== null && G.time - t0 - solvedAt > 3) break;
      }
      stop(); bot.tick(30);
      const hintText = rec.said.slice(said0).find((t) => /SEAL IS BROKEN/.test(t)) || null;
      const freed = { solved: r.done, lit: b.litFlag, ready: b.ready === true, sealed: b.sealed, said: !!hintText, hintText, beacons: G.stats.beacons - lit0, trials: G.stats.trials - trials0 };
      place(b.x - 4.5, b.z, Math.PI / 2);
      for (let i = 0; i < 300 && !b.litFlag; i++) { apply({ dx: 1, dz: 0, mag: 0, flame: true }); bot.tick(1); }
      stop(); bot.tick(10);
      const out = { ...freed, litByFire: b.litFlag, beaconsAfter: G.stats.beacons - lit0 };
      S.remove(r);
      clearLanterns();
      G.stats.beacons = lit0; G.stats.trials = trials0; G.day = G.dayTarget = 0;
      return out;
    },
    /** a breath on a sealed lantern whose trial is out of sight: the hint says where the trial is */
    rebuff() {
      reset();
      const [ox, oz] = at('plates'), p = G.player;
      const b = lantern('botlantern6', ox + 42, oz);
      const r = S.add({ ...plays.shift(plays.SPECS.plates, ox, oz), id: 'bot-where', goal: 'botlantern6', seed: 3 });
      place(b.x - 4.5, oz, Math.PI / 2);
      const said0 = rec.said.length;
      for (let i = 0; i < 30; i++) { apply({ dx: 1, dz: 0, mag: 0, flame: true }); bot.tick(1); }
      stop(); bot.tick(10);
      const hint = rec.said.slice(said0).find((t) => /SEALED/.test(t)) || null;
      S.remove(r);
      clearLanterns();
      return { hint };
    },
    /** a breath on the sealed lantern in the middle of a siege that is going on turns away with its sound and says nothing: he is doing what the hint would tell him */
    siegeSeal() {
      reset();
      const [ox, oz] = at('plates');
      const b = lantern('botlantern7', ox, oz);
      const r = S.add({ ...plays.shift(plays.SPECS.siege, ox, oz), id: 'bot-siegeseal', goal: 'botlantern7', seed: 3 });
      place(ox + 4.5, oz, -Math.PI / 2);
      bot.tick(40);
      const said0 = rec.said.length; rec.sounds.clear();
      for (let i = 0; i < 40; i++) { apply({ dx: -1, dz: 0, mag: 0, flame: true }); bot.tick(1); }
      stop(); bot.tick(10);
      const out = { state: r.t.state, sealed: b.sealed, hint: rec.said.slice(said0).some((t) => /SEALED/.test(t)), sound: rec.sounds.has('trial_seal') };
      S.remove(r);
      clearLanterns();
      return out;
    },
    /** a sealed lantern lit by some other means: the trial has nothing left to ask, and it ends in silence (no seal breaking, no gems) */
    other() {
      reset();
      const [ox, oz] = at('plates');
      const b = lantern('botlantern5', ox + 12, oz), lit0 = G.stats.beacons;
      const gems0 = G.gems.items.filter((g) => g.dynamic && g.alive).length;
      const r = S.add({ ...plays.shift(plays.SPECS.plates, ox, oz), id: 'bot-other', goal: 'botlantern5', seed: 3, gems: [5, 5] });
      place(ox, oz + 0.5, 0);
      bot.tick(10);
      const before = { sealed: b.sealed, done: r.done };
      rec.sounds.clear();
      G.beacons.ignite(b);
      bot.tick(90);
      const out = { before, after: { sealed: b.sealed, done: r.done, state: r.t.state }, trialBreak: rec.sounds.has('trial_break'), gems: G.gems.items.filter((g) => g.dynamic && g.alive).length - gems0, lit: b.litFlag, beacons: G.stats.beacons - lit0 };
      S.remove(r);
      clearLanterns();
      G.stats.beacons = lit0; G.stats.trials = 0; G.day = G.dayTarget = 0;
      return out;
    },
    /** what the aim assist is shown, the HUD's line, and the lesson */
    aim() {
      reset();
      const [ox, oz] = at('bells'), p = G.player;
      const r = S.add({ ...plays.shift(plays.SPECS.bells, ox, oz), id: 'bot-aim', seed: 1, goal: undefined });
      place(ox, oz - 2, 0);
      const listenAim = p._aimTargets().length;
      bot.tick(30);
      const hudListen = S.hudState() && S.hudState().text;
      const listenAim2 = p._aimTargets().filter((q) => r.t.bells.some((b) => Math.hypot(b.x - q.x, b.z - q.z) < 0.01)).length;
      let guard = 0; while (r.t.phase !== 'play' && guard++ < 1200) bot.tick(1);
      const playAim = p._aimTargets().filter((q) => r.t.bells.some((b) => Math.hypot(b.x - q.x, b.z - q.z) < 0.01)).length;
      const hudPlay = S.hudState() && S.hudState().text;
      S.remove(r);
      const w = S.add({ ...plays.shift(plays.SPECS.wisps, ox, oz), id: 'bot-aim2', seed: 2, goal: undefined });
      place(ox, oz, 0);
      guard = 0; while (!w.t.live.some((q) => !q.dead) && guard++ < 600) bot.tick(1);
      const wispAim = p._aimTargets().filter((q) => w.t.live.some((l) => !l.dead && Math.hypot(l.x - q.x, l.z - q.z) < 0.01)).length;
      S.remove(w);
      return { listenAim, listenAim2, hudListen, playAim, hudPlay, wispAim, bells: r.t.bells.length };
    },
    /** a saved realm entered again: every trial is solved and its lantern free of the seal, nothing plays out */
    restore() {
      reset();
      const [ox, oz] = at('plates');
      const b = lantern('botlantern2', ox + 12, oz);
      const r = S.add({ ...plays.shift(plays.SPECS.plates, ox, oz), id: 'bot-restore', goal: 'botlantern2', seed: 3 });
      const before = { sealed: b.sealed, state: r.t.state };
      G.hud.bannerState = null;
      S.restore();
      bot.tick(5);
      const out = { before, after: { sealed: b.sealed, state: r.t.state, done: r.done }, banner: !!G.hud.bannerState, lit: b.litFlag };
      S.remove(r);
      clearLanterns();
      G.stats.trials = 0;
      return out;
    },
    /** what a trial's foes drop: nothing */
    pays() {
      reset();
      const [ox, oz] = at('thief'), p = G.player;
      const before = G.gems.items.filter((g) => g.dynamic && g.alive).length;
      const { r, res } = playOn(plays.SPECS.siege, { x: 0, z: -8, yaw: 0 }, plays.plays.hunt(5, 3), 120, 1, { gems: [] });
      bot.tick(90);
      const after = G.gems.items.filter((g) => g.dynamic && g.alive).length;
      S.remove(r);
      return { solved: res.solved, before, after, foes: res.foes };
    },
    /** a trial with gems pays them once, at the lantern, when it is solved */
    reward() {
      reset();
      const [ox, oz] = at('plates');
      const before = G.gems.items.filter((g) => g.dynamic && g.alive).length;
      const b = lantern('botlantern3', ox + 12, oz);
      const r = S.add({ ...plays.shift(plays.SPECS.plates, ox, oz), id: 'bot-pay', goal: 'botlantern3', seed: 3, gems: [5, 5, 2] });
      place(ox, oz + 0.5, 0);
      const policy = plays.PLAYS.find((q) => q.id === 'plates-right').policy(), p = G.player, t0 = G.time;
      while (G.time - t0 < 60 && !b.litFlag) { apply(policy({ t: G.time - t0, hero: p, trial: r.t, foes: r.foes, events: rec.events })); bot.tick(1); }
      stop(); bot.tick(5);
      const after = G.gems.items.filter((g) => g.dynamic && g.alive).length;
      S.remove(r);
      clearLanterns();
      G.stats.beacons = 0; G.stats.trials = 0; G.day = G.dayTarget = 0;
      return { before, after };
    },
    /** a hero who stands where the course of rings ends with its seal unbroken is carried back to the ledge by a gust; one who is put somewhere else on the way is free at once (nothing is locked) */
    gust() {
      reset();
      const [ox, oz] = at('rings'), p = G.player;
      const sp = plays.shift(plays.SPECS.rings, ox, oz, G.collision.heightAt(ox, oz));
      const ledge = G.collision.add({ type: 'cyl', x: sp.x, z: sp.z, r: 4.5, y0: sp.y - 20, y1: sp.y, top: true, tag: 'botledge' });
      const r = S.add({ ...sp, id: 'bot-gust', goal: undefined, seed: 1 });
      rec.r = r; rec.events = []; rec.sounds.clear();
      const said0 = rec.said.length, out = {};
      place(sp.land.x + 2, sp.land.z, 0);                                                                     // (on the floor where the course ends)
      let t0 = G.time, ret = null, carried = false, c0 = null, c1 = null, maxY = -Infinity, invMid = null, yawLate = null, vAfter = null, invAfter = null, pyawAfter = null;
      while (G.time - t0 < 8) {
        bot.tick(1);
        if (ret === null && rec.events.some((e) => e.type === 'return')) ret = G.time - t0;
        if (p.carry) {
          carried = true; if (c0 === null) c0 = G.time - t0;
          maxY = Math.max(maxY, p.y); yawLate = p.yaw;
          if (invMid === null && G.time - t0 - c0 > 0.9) invMid = p.invulnT;                                                      // (half way: untouchable)
        } else if (c0 !== null) { c1 = G.time - t0; vAfter = Math.hypot(p.vx, p.vy, p.vz); invAfter = p.invulnT; pyawAfter = p.pyaw; break; }
      }
      bot.tick(20);
      out.first = { returnedAt: ret === null ? null : +ret.toFixed(2), carried, sound: rec.sounds.has('trial_gust'), hint: rec.said.slice(said0).some((t) => /A GUST CARRIES YOU BACK TO THE LEDGE/.test(t)), at: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)], pad: [sp.x, sp.y, sp.z], grounded: p.grounded, carryAfter: !!p.carry, locked: !!(p.locked || G.locked), yaw: +p.yaw.toFixed(2), want: sp.yaw,
        rideT: c0 === null || c1 === null ? null : +(c1 - c0).toFixed(2), maxY: +maxY.toFixed(1), invMid: invMid === null ? null : +invMid.toFixed(1), invAfter: invAfter === null ? null : +invAfter.toFixed(1), yawLate: yawLate === null ? null : +yawLate.toFixed(2), pyawAfter: pyawAfter === null ? null : +pyawAfter.toFixed(2), vAfter: vAfter === null ? null : +vAfter.toFixed(1), padY: sp.y };
      // put him somewhere else while the gust has him (the TRAVEL menu does): he is free at once, and runs when he is told to
      S.remove(r);
      const r2 = S.add({ ...sp, id: 'bot-gust2', goal: undefined, seed: 1 });
      rec.r = r2; rec.events = [];
      place(sp.land.x + 2, sp.land.z, 0);
      t0 = G.time; while (G.time - t0 < 3 && !p.carry) bot.tick(1);
      const had = !!p.carry;
      place(ox + 20, oz + 20, 0);
      const x0 = p.x, z0 = p.z;
      for (let i = 0; i < 40; i++) { apply({ dx: 1, dz: 0, mag: 1 }); bot.tick(1); }
      stop();
      out.second = { carriedWhenPlaced: had, carryAfter: !!p.carry, locked: !!(p.locked || G.locked), ran: +Math.hypot(p.x - x0, p.z - z0).toFixed(1), invuln: +p.invulnT.toFixed(1) };
      S.remove(r2);
      // the guards of the gust: a hero who is carried already (by a portal's light, say), one who is dead and a trial that is solved are not taken over
      const r3 = S.add({ ...sp, id: 'bot-gust3', goal: undefined, seed: 1 }), back = { x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw };
      rec.r = r3; rec.events = [];
      place(sp.land.x + 2, sp.land.z, 0); bot.tick(5);
      const dummy = { t: 0, dur: 99, at: () => [p.x, p.y, p.z, p.yaw], onDone() {} };
      p.carry = dummy; S._on(r3, 'return', back); const keeps = p.carry === dummy; p.carry = null;
      p.dead = true; S._on(r3, 'return', back); const deadFree = !p.carry; p.dead = false; p.carry = null;
      r3.done = true; S._on(r3, 'return', back); const solvedFree = !p.carry; r3.done = false; p.carry = null;
      out.guards = { keeps, deadFree, solvedFree };
      S.remove(r3);
      G.collision.remove(ledge);
      return out;
    },
    /** what the rings show: each hoop's state (off / next / done / missed) from what the machine knows, a flash and a rising note for each that is flown through, the end of a run (its sound and what the hint says), the stones of the lip (dim when he is far, lit on the ledge, dark when it is solved), the way the hoops hang and face, the rune ring on the pad */
    ringsView() {
      reset();
      const [ox, oz] = at('rings');
      const sp = plays.shift(plays.SPECS.rings, ox, oz, G.collision.heightAt(ox, oz));
      const ledge = G.collision.add({ type: 'cyl', x: sp.x, z: sp.z, r: 4.5, y0: sp.y - 20, y1: sp.y, top: true, tag: 'botledge' });
      const r = S.add({ ...sp, id: 'bot-ringsview', goal: undefined, seed: 1 });
      rec.r = r; rec.events = []; rec.sounds.clear(); rec.n = {}; rec.opts = {};
      const v = r.view, t = r.t, out = {};
      const log = v.rings.map(() => []), passes = v.rings.map(() => 0), lit = [];
      v.rings.forEach((m, i) => { const ss = m.setState.bind(m); m.setState = (st) => { log[i].push(st); return ss(st); }; const pp = m.pass.bind(m); m.pass = () => { passes[i]++; return pp(); }; });
      v.lip.forEach((m, i) => { const sl = m.setLit.bind(m); m.setLit = (x) => { lit[i] = x; return sl(x); }; });
      const shown = () => log.map((l) => (l.length ? l[l.length - 1][0] : '?')).join('');                      // (n: next, o: off, d: done, m: missed)
      place(0, 4, 0); bot.tick(3);                                                                               // (far from the ledge: the Court's far side)
      out.far = { shown: shown(), lit: lit.slice(), state: t.state };
      place(sp.x, sp.z, sp.yaw, sp.y); bot.tick(3);                                                              // (on the ledge)
      out.near = { shown: shown(), lit: lit.slice(), state: t.state };
      const set = (got, last) => { t.got = got; t.last = last; bot.tick(2); return shown(); };
      out.states = [set([1, -1, 0, 0, 0, 0], 1), set([1, 1, 1, 0, 0, 0], 2), set([-1, -1, 1, 0, 0, 0], 2), set([1, 1, 1, 1, 1, 1], 5), set([0, 0, 0, 0, 0, 0], -1)];
      rec.sounds.clear(); rec.opts = {};
      S._on(r, 'ring', { i: 2, n: 1 }); const p1 = rec.opts.trial_ring && rec.opts.trial_ring.pitch;
      S._on(r, 'ring', { i: 3, n: 3 }); const p3 = rec.opts.trial_ring && rec.opts.trial_ring.pitch;
      out.ring = { passes: passes.slice(), heard: rec.sounds.has('trial_ring'), p1, p3 };
      let said0 = rec.said.length; rec.sounds.clear();
      S._on(r, 'fail', { n: 2, why: 'landed' });
      out.fail2 = { sound: rec.sounds.has('trial_fail'), said: rec.said.slice(said0) };
      said0 = rec.said.length;
      S._on(r, 'fail', { n: 0, why: 'landed' });
      out.fail0 = { said: rec.said.slice(said0) };
      const off = (a, b) => +Math.abs(a - b).toFixed(3);
      out.geo = {
        rings: t.rings.map((c, i) => { const m = v.rings[i].root; return [off(m.position.x, c.x), off(m.position.y, c.y), off(m.position.z, c.z), off(m.rotation.y, Math.atan2(c.nx, c.nz))]; }),
        lip: v.lip.map((m) => [+m.root.position.x.toFixed(2), +m.root.position.y.toFixed(2), +m.root.position.z.toFixed(2)]), edge: [t.edgePt.x, t.edgePt.y, t.edgePt.z], yaw: t.yaw,
        mark: !!v.mark && off(v.mark.d.x, sp.x) < 0.01 && off(v.mark.d.z, sp.z) < 0.01,
      };
      S._on(r, 'solved', { by: t }); bot.tick(2);
      out.solved = { shown: shown(), lit: lit.slice() };
      S.remove(r);
      G.collision.remove(ledge);
      return out;
    },
    settle() { reset(); return liveList().length - base + G.collision.colliders.filter((c) => c.tag === 'trial').length; },
    extras() { return [...liveList().filter((x) => !baseSet.has(x[1])).map(([k, h]) => `${k}:${h.sprite}@${(h.x ?? 0).toFixed(0)},${(h.z ?? 0).toFixed(0)}`), ...G.collision.colliders.filter((c) => c.tag === 'trial').map((c) => `collider ${c.src}`)]; },
    said() { return rec.said.slice(); },
  };
});

let n = 0;
const gustChecks = (gs) => {
  const f1 = gs.first, f2 = gs.second, g = gs.guards;
  check('a hero who stands where the course of rings ends with its seal unbroken is carried back to the ledge after about 1.6 s (a gust, its sound and its hint) and stands there facing the course, free', f1.returnedAt !== null && f1.returnedAt > 1.1 && f1.returnedAt < 2.0 && f1.carried && f1.sound && f1.hint && Math.hypot(f1.at[0] - f1.pad[0], f1.at[2] - f1.pad[2]) < 1 && Math.abs(f1.at[1] - f1.pad[1]) < 0.5 && f1.grounded && !f1.carryAfter && !f1.locked && Math.abs(f1.yaw - f1.want) < 0.05, JSON.stringify(f1));
  check('... the ride takes a couple of seconds (1.3 s and a metre in 45), over an arc that carries him above the ledge before he is set down on it, facing the course (not the way he came) and not falling (the arc\'s last speed is not his), and he is untouchable on the way and for 1.2 s after', f1.rideT > 1.6 && f1.rideT < 3.2 && f1.maxY > f1.padY + 1 && f1.invMid > 0 && Math.abs(f1.invAfter - 1.2) < 0.05 && Math.abs(f1.yawLate - f1.want) < 0.3 && Math.abs(f1.pyawAfter - f1.want) < 0.05 && f1.vAfter < 0.5, JSON.stringify(f1));
  check('... a gust does not take over a hero who is carried already, nor a dead one, nor come when the seal is broken', g.keeps && g.deadFree && g.solvedFree, JSON.stringify(g));
  check('... and one who is put somewhere else while the gust has him (the TRAVEL menu) is free at once: nothing is locked, he runs when he is told to (the realm test once found him frozen for good)', f2.carriedWhenPlaced && !f2.carryAfter && !f2.locked && f2.ran > 4 && f2.invuln < 5, JSON.stringify(f2));
};
if (flag('gust')) {                                                                  // (only the gust: --gust)
  gustChecks(await page.evaluate(() => window.__trialplay.gust()));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nthe gust held');
  process.exit(failed ? 1 : 0);
}
const wanted = { bells: ['trial_bell'], plates: ['trial_plate'], circuit: ['trial_start', 'trial_pylon'], wisps: ['trial_pop', 'trial_wisp'], puck: ['trial_kick'], mirrors: ['trial_turn'], thief: ['foe_puff'], siege: ['trial_horn'], rings: ['trial_ring'] };
for (const pl of picked) {
  const results = [];
  for (let run = 0; run < RUNS; run++) {
    const r = await page.evaluate((id) => window.__trialplay.run(id), pl.id);
    results.push(r);
    if (!judge(pl.want, r)) break;
  }
  const last = results[results.length - 1], bad = judge(pl.want, last);
  const tries = results.map((r) => `${r.solved ? 'solved in ' + r.t + 's' : 'not solved'}, ${r.fails} fails, ${r.misses} misses, hurts ${r.hurts}`).join(' / ');
  check(pl.say, !bad, `(${tries}${bad ? '; wanted ' + pl.want + ': ' + bad + ' ' + JSON.stringify(last.detail) : ''})`);
  if (flag('sounds')) console.log('     sounds:', last.sounds.join(' '), '| events:', [...new Set(last.events)].join(' '));
  if (pl.want === 'solved' && last.solved) {
    const miss = (wanted[pl.kind] || []).filter((s) => !last.sounds.includes(s));
    const horns = pl.kind === 'siege' ? (last.counts.trial_horn || 0) : null;                    // (a siege blows its horn when it begins and at each of its three waves)
    check(`   ... and it is heard (${(wanted[pl.kind] || []).join(' ')}) and the HUD said what it asked (${last.hudText})`, miss.length === 0 && last.hudSeen > 0 && (horns === null || horns >= 4), miss.length ? `(not asked for: ${miss.join(' ')}; asked for: ${last.sounds.join(' ')})` : `(${last.hudSeen} frames${horns === null ? '' : `, ${horns} horns`})`);
  }
  n++;
}
if (!args.length || args.includes('rings')) {
  const rv = await page.evaluate(() => window.__trialplay.ringsView());
  check('the rings show what the machine knows: the next hoop bright and the others dim (a hero far off and on the ledge), the ones he flew through gold, the ones he missed dark, all gold when none is next, all dim again when the run begins anew', rv.far.shown === 'nooooo' && rv.near.shown === 'nooooo' && rv.states.join() === 'dmnooo,dddnoo,mmdnoo,dddddd,nooooo', JSON.stringify([rv.far, rv.near, rv.states]));
  check('... a hoop flown through flashes and chimes higher with each (1.0, then 1.2 at the third); a run that ends with two says THE RINGS GO DARK  -  2 OF 4 and with none says only that, each with its sound', rv.ring.passes.join() === '0,0,1,1,0,0' && rv.ring.heard && rv.ring.p1 === 1 && Math.abs(rv.ring.p3 - 1.2) < 1e-9 && rv.fail2.sound && rv.fail2.said.length === 1 && rv.fail2.said[0] === 'THE RINGS GO DARK  -  2 OF 4: LEAP FROM THE LEDGE AGAIN' && rv.fail0.said.length === 1 && rv.fail0.said[0] === 'THE RINGS GO DARK  -  LEAP FROM THE LEDGE AGAIN', JSON.stringify([rv.ring, rv.fail2, rv.fail0]));
  const lipOk = (() => { const [ex, , ez] = rv.geo.edge, fx = Math.sin(rv.geo.yaw), fz = Math.cos(rv.geo.yaw); return rv.geo.lip.length === 2 && [-1, 1].every((sd, i) => Math.abs(rv.geo.lip[i][0] - (ex + fz * 3.6 * sd - fx * 0.4)) < 0.02 && Math.abs(rv.geo.lip[i][2] - (ez - fx * 3.6 * sd - fz * 0.4)) < 0.02); })();
  check('... the hoops hang where the machine says and face along the course; two stones stand at the lip, either side of the way, 3.6 m from it; a rune ring marks the pad; the stones are dim far off (0.35), lit on the ledge (1) and dark when it is solved, and every hoop is gold', rv.geo.rings.every((q) => q.every((v) => v < 0.01)) && lipOk && rv.geo.mark && rv.far.lit.join() === '0.35,0.35' && rv.near.lit.join() === '1,1' && rv.solved.lit.join() === '0,0' && rv.solved.shown === 'dddddd', JSON.stringify([rv.geo, rv.solved]));
}
if (!args.length) {
  const o = await page.evaluate(() => window.__trialplay.seal());
  check('the lantern of a trial is sealed: a breath on it lights nothing, it is turned away with a sound and the HUD says it is sealed, and the aim assist does not swing to it', o.sealedHeld && o.hintSaid && o.turnedAway && !o.aimsAtLantern, JSON.stringify(o));
  check('a solved trial breaks the seal and the lantern is lit a moment later (0.9 s), once: the lanterns lit go up by one and the trials solved by one', o.solved && o.unsealed && o.litAt !== null && o.litAt - o.solvedAt > 0.6 && o.litAt - o.solvedAt < 1.6 && o.beacons === 1 && o.trials === 1 && o.sounds.includes('trial_break'), `(solved at ${o.solvedAt && o.solvedAt.toFixed(1)}, lit at ${o.litAt && o.litAt.toFixed(1)}; banner ${o.banner})`);
  const fr = await page.evaluate(() => window.__trialplay.far());
  check('a lantern more than 26 m from its trial is not lit when the seal breaks: it is freed (ready), the HUD says its seal is broken and where it waits for his fire (about 40 M TO THE EAST), and a breath lights it', fr.solved && !fr.lit && fr.ready && !fr.sealed && fr.said && /\((3[5-9]|4\d|50) M TO THE EAST\)$/.test(fr.hintText) && fr.beacons === 0 && fr.trials === 1 && fr.litByFire && fr.beaconsAfter === 1, JSON.stringify(fr));
  const wh = await page.evaluate(() => window.__trialplay.rebuff());
  check('a breath on a sealed lantern whose trial is out of sight says where the trial is (40 M TO THE WEST), and in sight it does not', !!wh.hint && /\(40 M TO THE WEST\)$/.test(wh.hint) && !/\(\d+ M TO/.test(o.hintText || ''), JSON.stringify(wh));
  const sg = await page.evaluate(() => window.__trialplay.siegeSeal());
  check('a breath on the sealed lantern in the middle of a siege that is going on is turned away with its sound and says nothing', sg.state === 'active' && sg.sealed === true && !sg.hint && sg.sound, JSON.stringify(sg));
  const ot = await page.evaluate(() => window.__trialplay.other());
  check('a sealed lantern that is lit by some other means ends its trial at once and in silence (no seal breaking, no gems)', ot.before.sealed === true && !ot.before.done && ot.after.done && ot.after.state === 'solved' && !ot.after.sealed && !ot.trialBreak && ot.gems === 0 && ot.lit && ot.beacons === 1, JSON.stringify(ot));
  const a = await page.evaluate(() => window.__trialplay.aim());
  check('the aim assist is shown the bells only while it is his turn (none while they ring) and the wisps in the air; the HUD says LISTEN, then how many bells he has got', a.listenAim2 === 0 && a.playAim === a.bells && a.wispAim >= 1 && /LISTEN/.test(a.hudListen) && /BELLS 0 OF/.test(a.hudPlay), JSON.stringify(a));
  const rs = await page.evaluate(() => window.__trialplay.restore());
  check('a saved realm entered again has every seal broken at once (its trials solved, its lanterns free of the seal) and nothing plays out', rs.before.sealed === true && rs.after.sealed === false && rs.after.state === 'solved' && !rs.banner && !rs.lit, JSON.stringify(rs));
  const py = await page.evaluate(() => window.__trialplay.pays());
  check('what a trial calls pays nothing when it falls (a siege cleared: no gems on the floor)', py.solved && py.after === py.before, JSON.stringify(py));
  const rw = await page.evaluate(() => window.__trialplay.reward());
  check('a trial with gems pays them, once, when it is solved', rw.after - rw.before === 3, JSON.stringify(rw));
  gustChecks(await page.evaluate(() => window.__trialplay.gust()));
  const said = await page.evaluate(() => window.__trialplay.said());
  const kinds = [...new Set(picked.map((p) => p.kind))];
  const wrong = kinds.filter((k) => said.filter((t) => t === TRIALS[k].hint).length !== 1).map((k) => `${k} said ${said.filter((t) => t === TRIALS[k].hint).length} times`);
  check(`each kind's lesson is put on the HUD once (${kinds.join(' ')})`, kinds.length > 0 && wrong.length === 0, wrong.join(', '));
  const leak = await page.evaluate(() => window.__trialplay.settle());
  check('what a trial put into the world goes with it (the decals, billboards and colliders left after the last play are the ones there were before the first)', leak === 0, `(${leak} left: ${(await page.evaluate(() => window.__trialplay.extras())).join(' ')})`);
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FAILED of ${n} plays` : `\nall ${n} plays played as wanted`);
process.exit(failed ? 1 : 0);
