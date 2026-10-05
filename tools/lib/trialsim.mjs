// A trial (src/game/trials/) played at 60 Hz against a model of the hero (tools/lib/duel.mjs DuelHero: the Player's numbers) on a floor of its own. What tools/trial-test.mjs plays; no game, no browser.
//
//   playTrial({ spec, hero: { x, z, yaw }, policy, T, seed, floorAt, solids, immortal }) -> { trial, hero, events, solvedAt, now, foes }
//     spec    what the layout writes ({ kind, id, goal, x, z, ...the kind's parts }), made ready by makeTrial with a seeded random (a tune, a scramble, a puzzle are the same for the same seed)
//     policy(s) -> { dx, dz, mag, jump, flame, charge }    what the hero does, from  s = { t, hero (the model), trial, foes, events }
// A trial that brings foes (a thief, a siege) has them here as the foes of foes/ are in tools/lib/foesim.mjs: the brains of the new kinds, a stand-in for a Snuffer of the old (it chases and swings
// as the real one does); a hero's flame and ram fell them by the same tests (hitsOn).
import { DuelHero, HERO } from './duel.mjs';
import { minionStep } from './foesim.mjs';
import { makeFoe, stepFoe, hitsOn, sideOf, BRAINS } from '../../src/game/foes/index.js';
import { makeTrial, stepTrial, lcg } from '../../src/game/trials/index.js';

const hyp = Math.hypot;

export function playTrial({ spec, hero: spot = { x: 0, z: 12, yaw: Math.PI }, policy, T = 60, seed = 1, floorAt = () => 0, solids = [], immortal = true, stopWhenSolved = true, onEvent = null } = {}) {
  const DT = 1 / 60;
  const rng = lcg(seed);
  const hero = new DuelHero({ ...spot }, floorAt);
  hero.invulnT = 0;
  if (immortal) hero.hp = Infinity;
  const events = [];
  const foes = [];                                                              // the foes a trial has made: { id, e, how }
  let now = 0, hurts = 0, solvedAt = null;
  const heroView = { x: 0, y: 0, z: 0, r: HERO.r, dead: false, ram: false, vx: 0, vz: 0 };
  const sync = () => { heroView.x = hero.x; heroView.y = hero.y; heroView.z = hero.z; heroView.dead = hero.dead; heroView.ram = hero.chargeT > 0; heroView.vx = hero.vx; heroView.vz = hero.vz; };
  // what a foe's brain is stepped with (foes/core.js)
  const fctx = {
    hero: heroView, rng, floorAt,
    alive: (m) => m.state !== 'dead',
    dismiss: (m) => { if (m.state !== 'dead') { m.state = 'dead'; m.how = 'dismissed'; } },
    move(e, vx, vz, dt) {
      const sp = hyp(vx, vz);
      if (sp < 1e-9) return 1;
      let nx = e.x + vx * dt, nz = e.z + vz * dt;
      for (let pass = 0; pass < 3; pass++) for (const so of solids) { const dx = nx - so.x, dz = nz - so.z, rr = so.r + e.r, d = hyp(dx, dz); if (d < rr) { const k = rr / (d || 1e-4); nx = so.x + dx * k; nz = so.z + dz * k; } }
      const f = ((nx - e.x) * vx + (nz - e.z) * vz) / (sp * sp * dt);
      if (f < 0.5) return Math.max(0, f);
      e.x = nx; e.z = nz; if (!e.K.flies) e.y = floorAt(e.x, e.z);
      return Math.min(1.2, f);
    },
    emit(type, data) { if (type === 'hurt') { if (hero.hurt(data.x, data.z)) hurts++; } },
  };
  const ctx = {
    p: hero, rng,
    emit(type, data) {
      const ev = { t: now, type, ...data, by: data && data.by ? data.by.kind : undefined };
      events.push(ev);
      if (type === 'solved' && solvedAt === null) solvedAt = now;
      if (onEvent) onEvent(ev, data);
    },
    spawn(kind, x, z, opts = {}) {
      const rec = { id: foes.length, kind, how: null };
      let e = makeFoe(kind, { x, z, y: floorAt(x, z), wild: !!opts.wild });
      if (!BRAINS[e.K.brain]) { e = makeFoe('basic', { x, z, y: floorAt(x, z), wild: true }); e.minion = true; e.state = 'chase'; e.kind = kind; }      // (a Snuffer of the old kinds: a stand-in that chases and swings)
      rec.e = e; foes.push(rec);
      return rec;
    },
    fate: (h) => (!h ? 'gone' : h.e.state !== 'dead' ? 'alive' : h.how === 'killed' ? 'killed' : 'gone'),
    dismiss: (h) => { if (h && h.e.state !== 'dead') { h.e.state = 'dead'; h.how = 'dismissed'; } },
  };
  const trial = makeTrial(spec, ctx);
  const kill = (rec) => { if (rec.e.state === 'dead') return; rec.e.state = 'dead'; rec.how = 'killed'; };
  for (; now < T; now += DT) {
    sync();
    const s = { t: now, hero, trial, foes: foes.map((f) => f.e), events, foeRecs: foes };
    const a = policy ? policy(s) : { dx: 0, dz: 0, mag: 0 };
    hero.step(DT, a || { dx: 0, dz: 0, mag: 0 }, solids, 1e9);
    sync();
    for (const rec of foes) {
      const e = rec.e;
      if (e.state === 'dead') continue;
      e.flameCd = Math.max(0, (e.flameCd || 0) - DT); e.chargeCd = Math.max(0, (e.chargeCd || 0) - DT);
      if (e.minion) {
        minionStep(e, DT, fctx);
        if (hero.flameHits(e.x, e.y + 1, e.z, e.r) || hero.chargeHits(e.x, e.y + 1, e.z, e.r)) kill(rec);
      } else {
        stepFoe(e, DT, fctx);
        for (const h of hitsOn(e, hero)) { if (h.out === 'kill' || h.out === 'boom') kill(rec); }
      }
    }
    stepTrial(trial, DT, ctx);
    if (stopWhenSolved && solvedAt !== null && now - solvedAt > 0.5) break;
  }
  return { trial, hero, events, solvedAt, now, foes, hurts };
}

export { HERO };
