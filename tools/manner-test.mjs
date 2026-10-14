// The Snuffers' manners (src/game/foes/manner.js) played in Node against a model of the hero, headlessly: two idle foes that meet bicker (face each other, close in, swing their poles, nobody is hurt)
// and break off the moment the hero comes into sight; a foe that first sees the hero from afar may turn its back and waggle before the alarm, and never when he is close, ramming or dead; the kinds
// with manners are the Snuffers in body that do not run from him; and a brain's own idle (a Slinger's) goes through the same manners.
//   node tools/manner-test.mjs
import { makeFoe, stepFoe, mannerIdle, mannerPose, hasManners, MANNER, KINDS } from '../src/game/foes/index.js';
import { wrap, bearing } from '../src/game/foes/core.js';

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : detail); };

const lcg = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
function world(foes, { hero = { x: 200, z: 200 }, rng = lcg(5) } = {}) {
  const ev = [];
  const ctx = {
    manners: true, hero: { x: hero.x, y: 0, z: hero.z, r: 0.55, dead: false, ram: false, vx: 0, vz: 0 }, rng, floorAt: () => 0,
    move: (m, vx, vz, dt) => { m.x += vx * dt; m.z += vz * dt; return 1; },
    emit: (type, d) => ev.push({ type, ...d }), dismiss() {}, alive: (m) => m.state !== 'dead',
    others: (e, r) => foes.filter((o) => o !== e && Math.hypot(o.x - e.x, o.z - e.z) < r),
  };
  return { ctx, ev, foes };
}
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const run = (w, secs, f, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) f(t); };

// the kinds
check('the Snuffers in body have manners, the Pilferling, the urchin and the beasts do not', ['basic', 'bell', 'thorn', 'rime', 'slinger', 'warden', 'pup', 'caller'].every((k) => hasManners(KINDS[k])) && ['thief', 'urchin', 'hog', 'mole', 'moth', 'brute', 'crab', 'drifter', 'gale', 'shiver'].every((k) => !hasManners(KINDS[k])));

// two plain Snuffers (the 'rush' kind: the system's own idle calls mannerIdle) that meet
{
  const a = makeFoe('basic', { x: 0, z: 0 }), b = makeFoe('basic', { x: 3.5, z: 0.5 }), w = world([a, b]);
  const ev = w.ev;
  let began = null, closest = 99, swings = 0, hurts = 0, faced = false, left = null;
  run(w, 90, (t) => {
    for (const e of [a, b]) mannerIdle(e, 1 / 30, w.ctx, false);
    if (began === null && a.manner && b.manner) began = t;
    if (began !== null && a.manner) { closest = Math.min(closest, near(a, b)); if (Math.abs(wrap(a.yaw - bearing(a.x, a.z, b.x, b.z))) < 0.3 && t > began + 1.5) faced = true; }
    if (began !== null && !a.manner && !b.manner && left === null) left = t;
    if (a.mAttack > 0.55 || b.mAttack > 0.55) swings++;
  });
  hurts = ev.filter((x) => x.type === 'hurt').length;
  check('two idle Snuffers that meet fall to bickering', began !== null, began !== null ? `(at ${began.toFixed(1)} s)` : '');
  check('... they close in on each other (to 2.3 m) and face each other', closest <= MANNER.near + 0.35 && faced, `(closest ${closest.toFixed(2)} m)`);
  check('... they swing their poles at each other, and say so (the bicker), and nobody is hurt', swings > 0 && ev.filter((x) => x.type === 'tell' && x.what === 'bicker').length >= 1 && hurts === 0, `(${swings} swing steps, ${ev.filter((x) => x.what === 'bicker').length} blows)`);
  check('... and it ends: they are back to their rounds (5 to 9 s, and a few seconds to finish the swing), with a rest before the next', left !== null && left - began <= MANNER.len[1] + 4 && a.mCd > 0, `(${left === null ? 'never' : (left - began).toFixed(1)} s)`);
  // the one that is struck staggers
  const c = makeFoe('basic', { x: 0, z: 0 }), d = makeFoe('basic', { x: 2, z: 0 }), w2 = world([c, d], { rng: () => 0.01 });
  let hit = 0;
  run(w2, 30, () => { mannerIdle(c, 1 / 30, w2.ctx, false); mannerIdle(d, 1 / 30, w2.ctx, false); hit = Math.max(hit, c.mHit || 0, d.mHit || 0); });
  const p = mannerPose({ mAttack: 0.5, mHit: 0.8, mMoon: 0, manner: { kind: 'squabble' } }, { attack: 0 });
  check('... the one that is struck staggers (mHit), and the pose says the swing, the stagger and the unease', hit > 0.9 && p.attack === 0.5 && p.hurt > 0.3 && p.alert > 0, `(${hit.toFixed(2)})`);
}

// the hero comes into sight of one of them: they break off at once
{
  const a = makeFoe('basic', { x: 0, z: 0 }), b = makeFoe('basic', { x: 3, z: 0 }), w = world([a, b], { rng: () => 0.01 });
  let on = false;
  for (let t = 0; t < 40 && !on; t += 1 / 30) { mannerIdle(a, 1 / 30, w.ctx, false); mannerIdle(b, 1 / 30, w.ctx, false); if (a.manner && b.manner) on = true; }
  for (let t = 0; t < 2; t += 1 / 30) { mannerIdle(a, 1 / 30, w.ctx, false); mannerIdle(b, 1 / 30, w.ctx, false); }        // (a little way into it)
  const busy = !!(a.manner && b.manner);
  const r = mannerIdle(a, 1 / 30, w.ctx, true);
  check('a squabble breaks off the moment the hero is in sight (the foe is free to give the alarm)', on && busy && r === false && !a.manner, `(busy ${busy}, free ${r === false}, manner ${a.manner ? 'still' : 'gone'})`);
  mannerIdle(b, 1 / 30, w.ctx, false);
  check('... and the other, left alone, drops it too', !b.manner);
}

// mooning
{
  const mk = (rngv, heroAt, mod = {}) => {
    const e = makeFoe('basic', { x: 0, z: 0, yaw: 0 }), w = world([e], { hero: heroAt, rng: () => rngv });
    Object.assign(w.ctx.hero, mod);
    return { e, w };
  };
  let { e, w } = mk(0.05, { x: 0, z: 12 });
  const first = mannerIdle(e, 1 / 30, w.ctx, true);
  let turned = false;
  run(w, 1.0, () => { mannerIdle(e, 1 / 30, w.ctx, true); });
  turned = Math.abs(wrap(e.yaw - (bearing(0, 0, 0, 12) + Math.PI))) < 0.25 && e.mMoon === 1;
  check('a foe that first sees the hero from 12 m may turn its back on him (busy: no alarm yet), and the pose says moon', first === true && turned && mannerPose(e, {}).moon === 1, `(yaw ${e.yaw.toFixed(2)})`);
  run(w, 0.6, () => { mannerIdle(e, 1 / 30, w.ctx, true); });
  const after = mannerIdle(e, 1 / 30, w.ctx, true);
  check('... after 1.25 s it is done and gives the alarm, and does not moon again at once', !e.manner && after === false && e.mooned === true && e.mMoon === 0);
  ({ e, w } = mk(0.05, { x: 0, z: 5 }));
  check('... not when the hero is close (5 m)', mannerIdle(e, 1 / 30, w.ctx, true) === false && !e.manner);
  ({ e, w } = mk(0.9, { x: 0, z: 12 }));
  check('... not when the dice say no (a chance of 3 in 10)', mannerIdle(e, 1 / 30, w.ctx, true) === false && !e.manner);
  ({ e, w } = mk(0.05, { x: 0, z: 12 }, { ram: true }));
  check('... not when the hero is ramming at it', mannerIdle(e, 1 / 30, w.ctx, true) === false && !e.manner);
  ({ e, w } = mk(0.05, { x: 0, z: 12 }, { dead: true }));
  check('... not when the hero is dead', mannerIdle(e, 1 / 30, w.ctx, true) === false && !e.manner);
  const thief = makeFoe('thief', { x: 0, z: 0 }), wt = world([thief], { hero: { x: 0, z: 12 }, rng: () => 0.05 });
  check('... and the Pilferling has its own jeer: no manners', mannerIdle(thief, 1 / 30, wt.ctx, true) === false && !thief.manner);
}

// a brain's own idle goes through the same manners (the Slinger loiters with core.loiter)
{
  const a = makeFoe('slinger', { x: 0, z: 0, patrol: 0 }), b = makeFoe('slinger', { x: 3, z: 1, patrol: 0 }), w = world([a, b], { rng: lcg(11) });
  let on = false, swung = false;
  run(w, 90, () => { stepFoe(a, 1 / 30, w.ctx); stepFoe(b, 1 / 30, w.ctx); if (a.manner && b.manner) on = true; if (a.mAttack > 0.5 || b.mAttack > 0.5) swung = true; });
  check('two Slingers that meet bicker too, through their own idle', on && swung && a.state === 'idle' && b.state === 'idle');
  const hero = w.ctx.hero; hero.x = 4; hero.z = 3;
  stepFoe(a, 1 / 30, w.ctx); stepFoe(b, 1 / 30, w.ctx);
  run(w, 3, () => { stepFoe(a, 1 / 30, w.ctx); stepFoe(b, 1 / 30, w.ctx); });
  check('... and with the hero on top of them they fight him, not each other', a.state !== 'idle' || b.state !== 'idle');
}

// without `ctx.manners` (the brains' own tests, a world that does not want them) a foe is just a foe
{
  const a = makeFoe('basic', { x: 0, z: 0 }), b = makeFoe('basic', { x: 3, z: 0 }), w = world([a, b], { rng: () => 0.01 });
  w.ctx.manners = false;
  run(w, 30, () => { mannerIdle(a, 1 / 30, w.ctx, false); mannerIdle(b, 1 / 30, w.ctx, false); });
  check('without ctx.manners nothing happens', !a.manner && !b.manner && mannerIdle(a, 1 / 30, w.ctx, true) === false);
}

// no Math.random in a manner (a fight can be replayed)
{
  const real = Math.random; let calls = 0; Math.random = () => { calls++; return real(); };
  const a = makeFoe('basic', { x: 0, z: 0 }), b = makeFoe('basic', { x: 3, z: 0 }), w = world([a, b]);
  run(w, 30, () => { mannerIdle(a, 1 / 30, w.ctx, false); mannerIdle(b, 1 / 30, w.ctx, false); });
  Math.random = real;
  check('a manner never asks for Math.random (it asks ctx.rng)', calls === 0, `(${calls} calls)`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall manner checks passed');
process.exit(failed ? 1 : 0);
