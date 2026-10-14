// MANNERS: what the Snuffers do when nobody is looking at them, and when somebody first is. The PS1 game's villains are bumbling guys with lives of their own: they squabble among themselves
// before the hero is anywhere near, and some of them turn their backs and waggle their behinds at him before they come for him. Pure, like the brains (no three, no DOM, `ctx.rng` and not
// Math.random), and played in Node by tools/manner-test.mjs.
//
//   squabble   two idle foes that meet (within 5.5 m, neither near the hero) walk up to each other and bicker for 5 to 9 s: each swings its pole at the other every 1.3 to 2.1 s (the pole stops short: the
//              other staggers, nobody is hurt), then they go back to their rounds. It breaks off the moment the hero comes into sight of either.
//   moon       when a foe first sees the hero from far off (7 m or more) it may (3 times in 10) turn its back on him and waggle for 1.25 s, looking over its shoulder, before the alarm.
//
// A foe has manners if it is a Snuffer in body (K.model 'snuffer') that does not run from the hero (the Pilferling has its own jeer); `K.manners === false` takes them away, and `K.moon` is a kind's own
// chance of mooning (the default is MANNER.moon). The system calls `mannerIdle` in a foe's idle (foes/core.js `loiter` for the brains, systems/enemies.js for the plain Snuffers) and puts `mannerPose` on the pose.
import { hyp, bearing, turnTo, setMannerHook } from './core.js';

export const MANNER = { r: 5.5, near: 2.3, len: [5, 9], bop: [1.3, 2.1], cd: [9, 18], scan: 0.6, pair: 0.4, moon: 0.3, moonLen: 1.25, moonMin: 7, walk: 0.35 };

export const hasManners = (K) => K.manners !== false && K.model === 'snuffer' && K.brain !== 'flee';

const between = (r, [a, b]) => a + (b - a) * r;

/** the swing of a pole as the Snuffers' models know it (pose.attack: windup 0..0.4, strike 0.4..0.6, recover): `s` seconds into the swing -> attack, 0 when it is over */
function swing(s) {
  if (s < 0.5) return (s / 0.5) * 0.4;
  if (s < 0.65) return 0.4 + ((s - 0.5) / 0.15) * 0.2;
  if (s < 1.1) return 0.6 + ((s - 0.65) / 0.45) * 0.4;
  return 0;
}

const end = (e) => { e.manner = null; e.mAttack = 0; e.mMoon = 0; };

/**
 * One step of a foe's manners while it is idle. `noticed`: the hero is within its sight. Returns true when it is busy with a manner (the caller leaves it alone this step: no loitering, no alarm),
 * false when it is free to do what it does.
 */
export function mannerIdle(e, dt, ctx, noticed) {
  if (!ctx.manners || !hasManners(e.K)) return false;                // (a world that wants them says so: `ctx.manners`; the brains' own tests play the fight without them)
  const hero = ctx.hero, M = MANNER;
  e.speedNow = 0;
  e.mHit = Math.max(0, (e.mHit || 0) - dt * 2.5);
  e.mCd = (e.mCd ?? between(ctx.rng(), M.cd) * 0.4) - dt;
  const m = e.manner;
  if (m) {
    if (m.kind === 'moon') {
      m.t -= dt;
      e.yaw = turnTo(e.yaw, bearing(e.x, e.z, hero.x, hero.z) + Math.PI, 9, dt);
      e.mMoon = 1; e.mAttack = 0;
      if (m.t <= 0) { end(e); e.mooned = true; return false; }
      return true;
    }
    // a squabble
    const o = m.with;
    if (noticed || !o || !ctx.alive(o) || o.state !== 'idle' || !o.manner || o.manner.with !== e) { end(e); e.mCd = between(ctx.rng(), M.cd); return false; }
    const dx = o.x - e.x, dz = o.z - e.z, d = hyp(dx, dz);
    e.yaw = turnTo(e.yaw, bearing(e.x, e.z, o.x, o.z), 8, dt);
    m.t -= dt;
    if (d > M.near) { const sp = e.K.speed * M.walk; ctx.move(e, (dx / d) * sp, (dz / d) * sp, dt); e.speedNow = sp; } else e.speedNow = 0;
    // the swing
    if (m.s >= 0) {
      const before = m.s;
      m.s += dt;
      e.mAttack = swing(m.s);
      if (before < 0.6 && m.s >= 0.6) { o.mHit = 1; ctx.emit('tell', { what: 'bicker', x: e.x, z: e.z, by: e }); }
      if (m.s >= 1.1) { m.s = -1; e.mAttack = 0; m.next = between(ctx.rng(), M.bop); }
    } else {
      e.mAttack = 0;
      m.next -= dt;
      if (m.next <= 0 && d < M.near + 1.2) m.s = 0;
    }
    if (m.t <= 0 && m.s < 0) { end(e); e.mCd = between(ctx.rng(), M.cd); }
    return !!e.manner;
  }
  e.mMoon = 0; e.mAttack = 0;
  if (noticed) {
    // the first sight of the hero, from far off: a chance to turn round and waggle first
    const dh = hyp(hero.x - e.x, hero.z - e.z);
    if (!e.mooned && !hero.dead && !hero.ram && dh >= M.moonMin && ctx.rng() < (e.K.moon ?? M.moon)) {
      e.manner = { kind: 'moon', t: M.moonLen };
      e.mMoon = 1;
      ctx.emit('tell', { what: 'jeer', x: e.x, z: e.z, by: e });
      return true;
    }
    return false;
  }
  if (e.mooned && hyp(hero.x - e.x, hero.z - e.z) > e.K.notice * 1.6) e.mooned = false;
  // two that meet may fall to bickering
  e.mScan = (e.mScan ?? 0) - dt;
  if (e.mCd <= 0 && e.mScan <= 0 && ctx.others) {
    e.mScan = M.scan;
    for (const o of ctx.others(e, M.r)) {
      if (o === e || !hasManners(o.K) || o.state !== 'idle' || o.manner || (o.mCd ?? 0) > 0) continue;
      if (hyp(hero.x - o.x, hero.z - o.z) < o.K.notice * 1.1) continue;
      if (ctx.rng() > M.pair) break;
      const len = between(ctx.rng(), M.len);
      e.manner = { kind: 'squabble', with: o, t: len, s: -1, next: between(ctx.rng(), M.bop) * 0.5 };
      o.manner = { kind: 'squabble', with: e, t: len, s: -1, next: between(ctx.rng(), M.bop) };
      return true;
    }
  }
  return false;
}

/** what a foe in a manner adds to its pose: the swing of its pole, the staggered lean of the one that is struck, the moon */
export function mannerPose(e, pose) {
  if (e.mAttack > 0) pose.attack = Math.max(pose.attack || 0, e.mAttack);
  if (e.mHit > 0) pose.hurt = Math.max(pose.hurt || 0, e.mHit * 0.55);
  if (e.mMoon) pose.moon = 1;
  if (e.manner && e.manner.kind === 'squabble') pose.alert = Math.max(pose.alert || 0, 0.25);
  return pose;
}

// (foes/core.js `loiter`, the idle of every brain, asks this: registered here so that core.js need not import it)
setMannerHook(mannerIdle);
