// The foes played in the running game by the REAL controller: each play of tools/lib/foe-plays.mjs (the same ones tools/foe-test.mjs plays against the brains and a model of the hero) is played on the
// floor of the Guardian's Court (flat, 76 m across: the Guardian himself is taken out of the world), with the foe called in 14 m or so from the hero by the EnemySystem, the hero's stick,
// jump, flame and ram going through the game's own input (tools/bot-inject.js), and the world stepped by the game's own update. What is read back is what happened in the game: whether the foe fell,
// how often the hero was hurt (the real playerHurt), what his attacks did to it (the real outcomes) and whether a keg went off.
//   node tools/foe-bot.mjs [play-id-or-kind ...] [--runs 2] [--list]        (needs the dev server on :5173, GV_URL=http://127.0.0.1:PORT/ tests another)
// A play that does not do what it wants is played once more (a policy is not a person, and the game has random numbers of its own: where a foe patrols); it fails only if both runs fail.
// Besides what the plays do, it holds what the game does with what a foe says: each kind's lesson is put on the HUD once (the first time one has seen the hero), the sounds a play must make are
// asked for (`hears` of a play: the names go to audio.sfx whether or not the page has made them), and what a foe drew on the floor is taken away with it (the live decals and billboards are the
// same after every play as before the first). --sounds prints what each play said, --leaks the marks left after each.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYS } from './lib/foe-plays.mjs';
import { KINDS } from '../src/game/foes/kinds.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.GV_URL || 'http://127.0.0.1:5173/';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--') && isNaN(+a));
const flag = (k) => process.argv.includes(`--${k}`);
const RUNS = +(process.argv[process.argv.indexOf('--runs') + 1]) || 2;
const SHOW_SOUNDS = flag('sounds');
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
  const rec = { hurts: 0, blows: [], boomed: false, killed: false, foe: null, others: [], sounds: new Set(), dismissed: 0, said: {}, called: [], playing: false };
  const said = [];                                                                // (what the HUD was told: the lessons)
  const hud = G.hud, hint = hud.hint.bind(hud);
  hud.hint = (text, dur) => { said.push(text); return hint(text, dur); };
  if (G.audio && G.audio.sfx) { const sfx = G.audio.sfx.bind(G.audio); G.audio.sfx = (name, o) => { rec.sounds.add(name); return sfx(name, o); }; }
  else G.audio = { sfx: (name) => { rec.sounds.add(name); } };                    // (a page without audio: the names are still asked for)
  // (the glow of a butterfly that a fallen foe lets out is the critters', and stays: it is not a mark of the foe's)
  const liveList = () => [...G.fx.decalHalf.list.filter((d) => !d.dead).map((d) => ['half', d]), ...G.fx.decalAdd.list.filter((d) => !d.dead).map((d) => ['add', d]), ...G.fx.handles.filter((h) => !h.dead && h.sprite !== 'glow_small').map((h) => ['bb', h])];
  const live = () => liveList().length;
  let base = null, baseSet = null;
  const hurt = G.playerHurt.bind(G);
  G.playerHurt = (x, z) => { const ok = hurt(x, z); if (ok) { rec.hurts++; G.sparx.hp = 3; G.player.dead = false; } return ok; };       // (he is hurt, and he does not die: a play counts the hurts)
  G.on('enemy', (e) => { if (e === rec.foe) rec.killed = true; });
  const E = G.enemies, outcome = E._outcome.bind(E), on = E._on.bind(E);
  E._outcome = (e, attack, out, p) => { if (e === rec.foe) rec.blows.push({ attack, out, state: e.state, side: foes.sideOf(e, p.x, p.z, (foes.BRAINS[e.K.brain] || {}).front ?? 0.96) }); return outcome(e, attack, out, p); };
  const ring = E._ring.bind(E), melt = E._melt.bind(E), dismiss = E.dismiss.bind(E), add = E.add.bind(E);
  E.add = (sp) => { const e = add(sp); if (rec.playing) rec.called.push(e); return e; };                 // (what comes into the world while a play is on: what a Smokecaller called)
  E._ring = (e, p, attack) => {                                                   // (the Rimeling's shell turns a ram away; a brow and a shield do the same through _outcome)
    const r = ring(e, p, attack);
    if (e === rec.foe) rec.blows.push({ attack, out: 'ring', state: e.state, side: 'front', after: { charging: p.chargeT > 0, back: p.vx * Math.sin(p.yaw) + p.vz * Math.cos(p.yaw) < 0 } });
    return r;
  };
  E.dismiss = (e) => { if (e.state !== 'dead') rec.dismissed++; return dismiss(e); };                  // (what is sent away in smoke: not what is beaten)
  E._melt = (e) => { if (e === rec.foe) rec.blows.push({ attack: 'flame', out: 'melt', state: e.state, side: 'front' }); return melt(e); };
  E._on = (type, d) => { if (d && d.by === rec.foe) { rec.said[type] = (rec.said[type] || 0) + 1; if (type === 'boom') rec.boomed = true; } return on(type, d); };
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
    rec.hurts = 0; rec.blows = []; rec.boomed = false; rec.killed = false; rec.sounds.clear(); rec.dismissed = 0; rec.said = {}; rec.called = []; rec.playing = false;
    prev.jump = prev.flame = prev.charge = false; bot.ctl.mx = bot.ctl.my = 0;
    if (base === null) { base = live(); baseSet = new Set(liveList().map((x) => x[1])); }
  };
  // how strongly what a foe draws to warn him is showing: the highest alpha among its decals and billboards
  const alphas = (v, out = []) => {
    if (!v || typeof v !== 'object') return out;
    if (Array.isArray(v)) { for (const x of v) alphas(x, out); return out; }
    if (typeof v.alpha === 'number' && 'dead' in v) { out.push(v.alpha); return out; }
    for (const k of Object.keys(v)) if (k !== 'ball') alphas(v[k], out);
    return out;
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
      const fy = G.collision.heightAt(stage.fx, stage.fz);
      const posts = (pl.posts || []).map((q) => G.collision.add({ type: 'cyl', x: stage.fx + q.along, z: stage.fz + q.across, r: q.r, y0: fy - 1, y1: fy + 6 }));
      const foe = E.add({ x: stage.fx, z: stage.fz, variant: pl.kind });
      foe.yaw = Math.PI / 2; rec.foe = foe;
      rec.others = (pl.others || []).map((o) => E.add({ x: stage.fx + o.dx, z: stage.fz + o.dz, variant: o.kind }));
      const t0 = G.time;
      rec.playing = true;
      let act = null, frames = 0, tail = 0, peak = 0;
      while (G.time - t0 < pl.T) {
        const snap = { t: G.time - t0, hero: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, grounded: p.grounded, up: Math.max(0, p.y - G.collision.heightAt(p.x, p.z)) }, foe, foes: E.list };
        if (frames % 3 === 0 || !act) act = pl.policy(snap);
        apply(act);
        bot.tick(1); frames++;
        if (foe.vis) for (const a of alphas(foe.vis)) peak = Math.max(peak, a);
        if (rec.killed || foe.state === 'dead') { if (++tail > 30) break; }
      }
      bot.ctl.mx = bot.ctl.my = 0; bot.ctl.jump = bot.ctl.flame = bot.ctl.charge = false;
      const during = { hurts: rec.hurts };      // (what the play did within its T: the second below is for what is going up in smoke, not for the hero, who stands there: a mole that cracks as the play ends must not count)
      bot.tick(60);                                                               // (a second for what is going up in smoke to have gone)
      rec.playing = false;
      for (const c of posts) G.collision.remove(c);
      const standing = (e) => e.state !== 'dead';
      return { killed: rec.killed, hurts: during.hurts, blows: rec.blows.slice(), boomed: rec.boomed || !!foe.exploded, t: +(G.time - t0).toFixed(1), end: foe.state, shell: foe.shell, dismissed: rec.dismissed, called: rec.called.map((m) => !!m.wild), said: { ...rec.said }, peak: +peak.toFixed(2),
        left: E.list.filter((e) => e !== foe && standing(e)).length, others: rec.others.filter(standing).length, sounds: [...rec.sounds] };
    },
    /** what a keg's blast takes and spares, and who the aim assist sees (the hero stands far off: nothing wakes) */
    system() {
      reset();
      const p = G.player, fy = G.collision.heightAt(stage.fx, stage.fz), hx = stage.fx + 45;
      p.place(hx, G.collision.heightAt(hx, stage.fz) + 0.05, stage.fz, -Math.PI / 2);
      bot.tick(10);
      const at = (dx, dz, variant) => E.add({ x: stage.fx + dx, z: stage.fz + dz, variant });
      const pup = at(0, 0, 'pup'), near = at(1.5, 0, 'basic'), far = at(-6, 0, 'basic'), mole = at(0, 1.2, 'mole');
      bot.tick(3);
      const aims = (e) => p._aimTargets().some((t) => Math.hypot(t.x - e.x, t.z - e.z) < 0.01);
      const under = aims(mole), others = aims(near);
      mole.state = 'dazed'; mole.st = 0; bot.tick(2);
      const dazed = aims(mole);
      mole.state = 'idle'; bot.tick(2);
      E._outcome(pup, 'flame', 'boom', p);
      bot.tick(2);
      const out = { pup: pup.state, near: near.state, far: far.state, mole: mole.state, aimUnder: under, aimOthers: others, aimDazed: dazed };
      reset();
      return out;
    },
    /** every foe taken away, and what they drew with them: the live decals and billboards beyond what the page had before the first play */
    settle() { reset(); return live() - base; },
    extras() { return liveList().filter((x) => !baseSet.has(x[1])).map(([k, h]) => `${k}:${h.sprite}@${(h.x ?? 0).toFixed(0)},${(h.z ?? 0).toFixed(0)}`); },
    said() { return said.slice(); },
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
  const last = results[results.length - 1];
  let bad = judge(pl.want, last);
  const tries = results.map((r) => `${r.killed ? 'killed' : 'not killed'} in ${r.t}s, hurts ${r.hurts}${r.boomed ? ', went off' : ''}`).join(' / ');
  check(pl.say, !bad, `(${tries}${bad ? '; wanted ' + pl.want + ': ' + bad : ''})`);
  if (SHOW_SOUNDS) console.log('     sounds:', last.sounds.join(' '));
  if (flag('leaks')) console.log('     marks left after it (more than before the first play):', await page.evaluate(() => window.__foeplay.settle()), (await page.evaluate(() => window.__foeplay.extras())).join(' '));
  const missing = (pl.hears || []).filter((name) => !last.sounds.includes(name));
  if (pl.shows) check(`   ... and it is seen: what warns him (a ring, a crack, a lane, a glow) is drawn`, last.peak >= 0.3, `(the strongest mark: ${last.peak})`);
  if (pl.hears) check(`   ... and it is heard: ${pl.hears.join(' ')}`, missing.length === 0, missing.length ? `(not asked for: ${missing.join(' ')}; asked for: ${last.sounds.join(' ')})` : '');
  n++;
}
{
  const o = await page.evaluate(() => window.__foeplay.system());
  check('a keg takes the Snuffers within its blast (a Snuffer 1.5 m from it) and not the one beyond it (6 m), and spares a Dustmole under the ground', o.pup === 'dead' && o.near === 'dead' && o.far !== 'dead' && o.mole !== 'dead', `(${JSON.stringify(o)})`);
  check('the hero\'s aim assist leaves a Dustmole under the ground alone, sees the other Snuffers and sees it when it is dazed', !o.aimUnder && o.aimOthers && o.aimDazed, `(under ${o.aimUnder}, a Snuffer ${o.aimOthers}, dazed ${o.aimDazed})`);
}
{
  // what each kind teaches is said once (the first time one sees the hero), in its own words
  const said = await page.evaluate(() => window.__foeplay.said());
  const kinds = [...new Set(picked.flatMap((p) => [p.kind, ...(p.others || []).map((o) => o.kind)]))].filter((k) => KINDS[k] && KINDS[k].hint);
  const wrong = kinds.filter((k) => said.filter((t) => t === KINDS[k].hint).length !== 1).map((k) => `${k} said ${said.filter((t) => t === KINDS[k].hint).length} times`);
  check(`each kind's lesson is put on the HUD once (${kinds.join(' ')})`, kinds.length > 0 && wrong.length === 0, wrong.join(', '));
  const leak = await page.evaluate(() => window.__foeplay.settle());
  check('what a foe drew on the floor and in the air goes with it (the decals and billboards left after the last play are the ones there were before the first)', leak === 0, `(${leak} left)`);
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FAILED of ${n} plays` : `\nall ${n} plays played as wanted`);
process.exit(failed ? 1 : 0);
