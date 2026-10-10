// The foes (docs/DESIGN.md, round twenty-eight): `KINDS` says what each kind is (kinds.js), a brain says what it does (one file each: pure state machines, played in Node by tools/foe-test.mjs and
// in the game by systems/enemies.js). The Snuffers of old are the 'rush' brain, which is the EnemySystem's own code and not here.
//
// The events a brain says (ctx.emit(type, data); `by` is the foe): the system plays the sounds and the dust, and hurts the hero on 'hurt'.
//   alert {x,z}            it has seen the hero                      tell {what,x,z,r?}     a warning begins (what: wind paw crack raise fuse rear call jeer cower)
//   lock {x,z}             what it aims at is fixed now              lob {ball}             a ball leaves a Slinger          splat {x,y,z,r}     it lands
//   rush {x,z}             a Ramhog sets off                         bonk {x,y,z}           it hits something                ripple {x,y,z}      a mole's mound moves
//   burst {x,y,z,r}        a mole breaks the ground                  bash {x,y,z}           a Lidwarden's shield comes round boom {x,y,z,r,byHero}  a keg goes off
//   dive {x,z}             a Dusk Moth drops                         land {x,y,z}           it lands                         summon {x,z,kind}   a Smokecaller calls
//   hurt {x,z}             the hero is hit (the system calls playerHurt(x, z): it knows his blinking and Sparx's hits)
//   (round thirty-eight)   tell.what also: shiver gather glow     gust {x,y,z,yaw,range,half}  a Gale Spirit blows     shove {dx,dz,power}  the blast throws the hero     pulse {x,y,z,r}  a Drifter's ring of static
//                          a Shiverling and a Shellback say 'rush' when they dash and lunge; a Slag Brute's 'tell' raise carries r (the ring it will slam), its 'bash' carries r
import { sling } from './sling.js';
import { charge } from './charge.js';
import { burrow } from './burrow.js';
import { ward } from './ward.js';
import { fuse } from './fuse.js';
import { swoop } from './swoop.js';
import { call } from './call.js';
import { flee } from './flee.js';
import { orbit } from './orbit.js';
import { brute } from './brute.js';
import { gust } from './gust.js';
import { shell } from './shell.js';
import { drift } from './drift.js';
import { kindOf } from './kinds.js';
import { sideOf } from './core.js';

export { KINDS, FOE_IDS, KIND_IDS, DANGER, kindOf } from './kinds.js';
export { sideOf } from './core.js';
export { SLING } from './sling.js';
export { CHARGE } from './charge.js';
export { BURROW } from './burrow.js';
export { WARD } from './ward.js';
export { FUSE, explode } from './fuse.js';
export { SWOOP } from './swoop.js';
export { CALL } from './call.js';
export { FLEE } from './flee.js';
export { ORBIT } from './orbit.js';
export { BRUTE } from './brute.js';
export { GUST } from './gust.js';
export { SHELL } from './shell.js';
export { DRIFT } from './drift.js';
export { ROSTERS, rosterOf, foeOf, summonOf } from './roster.js';

/** The brains by name. Each: init(e), step(e, dt, ctx), struck(e, attack, side) -> 'kill' | 'ring' | 'ignore' | 'boom' | 'wound' | 'flip', pose(e), and `front`: the half angle of what it guards. */
export const BRAINS = { sling, charge, burrow, ward, fuse, swoop, call, flee, orbit, brute, gust, shell, drift };

export const hasBrain = (K) => !!BRAINS[K.brain];

/** A foe record for a kind (what the EnemySystem makes, without the parts that draw it): for the tests, and the tools that need a foe without a game. */
export function makeFoe(id, s = {}) {
  const K = kindOf(id);
  const e = {
    variant: id, kind: id, K, V: K, x: s.x ?? 0, y: s.y ?? 0, z: s.z ?? 0, hx: s.x ?? 0, hz: s.z ?? 0, vx: 0, vz: 0, yaw: s.yaw ?? 0, r: K.r, h: K.h, cy: K.cy,
    hp: K.hp, state: 'idle', st: 0, tx: s.x ?? 0, tz: s.z ?? 0, patrolR: s.patrol ?? 5, t: 0, alert: 0, attack: 0, stun: 0, speedNow: 0, wild: !!s.wild,
  };
  const B = BRAINS[K.brain];
  if (B) B.init(e);
  return e;
}

/** What the hero's attack does to foe `e` (`attack`: 'flame' or 'ram'; the hero at (hx, hz)): 'kill' | 'ring' | 'ignore' | 'boom' | 'wound' (a Slag Brute's hatch) | 'flip' (a Shellback turned over). */
export function struckBy(e, attack, hx, hz) {
  const B = BRAINS[e.K.brain];
  return B.struck(e, attack, sideOf(e, hx, hz, B.front ?? 0.96));
}

/**
 * What the hero's attacks do to foe `e` this step: [{ attack: 'flame' | 'ram', out: 'kill' | 'ring' | 'ignore' | 'boom' }]. `p` is the Player (or a model of it: flameT, chargeT, flameHits(), chargeHits());
 * a foe is hit by the same tests as ever (the flame's cone, the ram's horns) against its middle, `e.y + e.cy`, and by one attack of a kind at a time (flameCd 0.3 s, chargeCd 0.5 s: the system counts them down).
 */
export function hitsOn(e, p) {
  const out = [];
  if (p.flameT > 0 && !(e.flameCd > 0) && p.flameHits(e.x, e.y + e.cy, e.z, e.r)) { e.flameCd = 0.3; out.push({ attack: 'flame', out: struckBy(e, 'flame', p.x, p.z) }); }
  if (p.chargeT > 0 && !(e.chargeCd > 0) && p.chargeHits(e.x, e.y + e.cy, e.z, e.r)) { e.chargeCd = 0.5; out.push({ attack: 'ram', out: struckBy(e, 'ram', p.x, p.z) }); }
  return out;
}

/** The pose a foe's model is told. */
export const poseOf = (e) => BRAINS[e.K.brain].pose(e);

/** One step of foe `e`'s brain. */
export const stepFoe = (e, dt, ctx) => BRAINS[e.K.brain].step(e, dt, ctx);

