// A foe's brain (src/game/foes/) played at 60 Hz on a floor of its own against a model of the hero (tools/lib/duel.mjs DuelHero: the Player's numbers: a run of 11.5 m/s, a ram of 24, the flame's cone,
// a jump of 15.2 m/s, 1.9 s of blinking after a hit, Sparx's three hits). What tools/foe-test.mjs plays; no game, no browser.
//
//   simulate({ kind, foe: { x, z, yaw }, hero: { x, z, yaw }, policy, seed, T, solids, floorAt, arenaR, others }) -> { t, hero, foe, foes, events, hurts, killedAt, ... }
//     policy(s) -> { dx, dz, mag, jump, flame, charge }   what the hero does, from  s = { t, hero (the model), foe (the one foe), foes, events (so far) }
//     solids: [{ x, z, r }] that nothing walks through (the hero and the foes)       arenaR: the radius of the floor (nothing leaves it)
// A foe the harness knows beside the brains: a 'basic' Snuffer stand-in (a Smokecaller's call), which chases and swings as the real one does (0.66 s of wind-up, 2.7 m of reach).
import { DuelHero, HERO } from './duel.mjs';
import { makeFoe, stepFoe, hitsOn, explode, sideOf, BRAINS, FUSE } from '../../src/game/foes/index.js';

const hyp = Math.hypot;
export const lcg = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

/** A Snuffer of the old kind, as far as a test of the others needs one: it chases at 5.4 m/s and swings. */
function minionStep(m, dt, ctx) {
  const h = ctx.hero, dx = h.x - m.x, dz = h.z - m.z, d = hyp(dx, dz) || 1;
  m.t += dt;
  if (m.state === 'chase') {
    if (d > 2.3) { ctx.move(m, (dx / d) * 5.4, (dz / d) * 5.4, dt); m.yaw = Math.atan2(dx, dz); } else { m.state = 'attack'; m.st = 0; m.struckHero = false; }
  } else if (m.state === 'attack') {
    m.st += dt;
    if (!m.struckHero && m.st >= 0.66) { m.struckHero = true; if (d < 3.2) ctx.emit('hurt', { x: m.x, z: m.z, by: m }); }
    if (m.st >= 1.35) m.state = 'chase';
  }
}

export function simulate({ kind, foe = { x: 0, z: 0, yaw: 0 }, hero: spot = { x: 0, z: 14, yaw: Math.PI }, policy, seed = 1, T = 20, solids = [], floorAt = () => 0, arenaR = 45, others = [], onEvent = null } = {}) {
  const DT = 1 / 60;
  const rng = lcg(seed);
  const hero = new DuelHero({ ...spot }, floorAt);
  hero.invulnT = 0;
  const events = [];
  const main = makeFoe(kind, { ...foe, y: floorAt(foe.x, foe.z) });
  const foes = [main];
  for (const o of others) foes.push(makeFoe(o.kind, { ...o, y: floorAt(o.x, o.z) }));
  let now = 0, hurts = 0, killedAt = null;
  const heroView = { x: 0, y: 0, z: 0, r: HERO.r, dead: false };
  const syncHero = () => { heroView.x = hero.x; heroView.y = hero.y; heroView.z = hero.z; heroView.dead = hero.dead; };
  const kill = (e, how) => { if (e.state === 'dead') return; e.state = 'dead'; e.diedAt = now; e.how = how; if (e === main) killedAt = now; if (e.minions) for (const m of e.minions) ctx.dismiss(m); };
  const ctx = {
    hero: heroView, rng, floorAt,
    alive: (m) => m.state !== 'dead',
    dismiss: (m) => { if (m.state !== 'dead') { m.state = 'dead'; m.how = 'dismissed'; m.diedAt = now; } },
    move(e, vx, vz, dt) {
      const sp = hyp(vx, vz);
      if (sp < 1e-9) return 1;
      const nx = e.x + vx * dt, nz = e.z + vz * dt;
      let bad = hyp(nx, nz) > arenaR;
      for (const so of solids) if (hyp(nx - so.x, nz - so.z) < so.r + e.r) bad = true;
      e.bump = bad;
      if (bad) return 0;
      e.x = nx; e.z = nz;
      if (!e.K.flies) e.y = floorAt(e.x, e.z);
      return 1;
    },
    emit(type, data) {
      const ev = { t: now, type, ...data, by: data && data.by ? data.by.kind : undefined };
      events.push(ev);
      if (onEvent) onEvent(ev, data);
      if (type === 'hurt') { if (hero.hurt(data.x, data.z)) hurts++; }
      if (type === 'summon') {
        const m = makeFoe('basic', { x: data.x, z: data.z, y: floorAt(data.x, data.z), wild: true });
        m.state = 'chase'; m.kind = 'basic'; m.minion = true; m.born = now;
        foes.push(m);
        if (data.by && data.by.minions) data.by.minions.push(m);
      }
      if (type === 'boom') {
        for (const o of foes) if (o !== data.by && o.state !== 'dead' && hyp(o.x - data.x, o.z - data.z) < data.r + o.r) { kill(o, 'blast'); if (o.K.brain === 'fuse' && !o.exploded) explode(o, ctx, false); }
        if (!data.byHero) kill(data.by, 'exploded');
      }
    },
  };
  const attacks = (e) => {
    if (e.state === 'dead') return;
    e.flameCd = Math.max(0, (e.flameCd || 0) - DT); e.chargeCd = Math.max(0, (e.chargeCd || 0) - DT);
    if (e.minion) {                                                              // (a stand-in: it falls to either)
      if (hero.flameHits(e.x, e.y + 1, e.z, e.r) || hero.chargeHits(e.x, e.y + 1, e.z, e.r)) kill(e, 'hit');
      return;
    }
    for (const h of hitsOn(e, hero)) {
      events.push({ t: now, type: 'struck', attack: h.attack, out: h.out, by: e.kind, state: e.state, side: sideOf(e, hero.x, hero.z, BRAINS[e.K.brain].front ?? 0.96) });
      if (h.out === 'kill') kill(e, h.attack);
      else if (h.out === 'boom') { explode(e, ctx, true); kill(e, 'boom'); }
      else if (h.out === 'ring' && h.attack === 'ram') { hero.chargeT = 0; hero.chargeCd = 0.5; hero.vx = -hero.dirx * 5; hero.vz = -hero.dirz * 5; }
    }
  };
  for (; now < T; now += DT) {
    syncHero();
    const s = { t: now, hero, foe: main, foes, events, solids };
    const a = policy ? policy(s) : { dx: 0, dz: 0, mag: 0 };
    hero.step(DT, a || { dx: 0, dz: 0, mag: 0 }, solids, arenaR);
    syncHero();
    for (const e of foes) {
      if (e.state === 'dead') continue;
      if (e.minion) minionStep(e, DT, ctx); else stepFoe(e, DT, ctx);
      attacks(e);
    }
    if (hero.dead && now > 1) { break; }
  }
  return { t: now, hero, foe: main, foes, events, hurts, killedAt, ctx };
}

export { HERO, FUSE };
