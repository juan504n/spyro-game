// How a person plays each trial, as data (tools/trial-test.mjs plays these against the pure machines and a model of the hero; tools/trial-bot.mjs plays the same ones in the running game with the
// real controller): a policy is a function of what the hero can see and says what he does, { dx, dz, mag, jump, flame, charge }; a play is a trial (a spec), a policy, how long, where the hero
// begins, and what must come of it.
//   s = { t, hero: { x, y, z, yaw, grounded, chargeT, flameT }, trial: the trial's record (its parts and state), foes: [the foes it has made], events }
import { solveBoard } from '../../src/game/trials/plates.js';
import { solveMirrors, cellWorld } from '../../src/game/trials/mirrors.js';
import { solidsOf } from '../../src/game/trials/index.js';
import { wardPlay, hogPlay, rush } from './foe-plays.mjs';
import { goalieX, toLocal, toWorld } from '../../src/game/trials/puck.js';

const hyp = Math.hypot;
export const dirTo = (a, b) => { const d = hyp(b.x - a.x, b.z - a.z) || 1; return [(b.x - a.x) / d, (b.z - a.z) / d]; };
export const dist = (a, b) => hyp(b.x - a.x, b.z - a.z);
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const STILL = { dx: 0, dz: 0, mag: 0 };
export const still = () => STILL;

/** go to a point and stop there (`mag` of a run, easing in over the last metres) */
export const goTo = (s, x, z, { stop = 0.5, mag = 1 } = {}) => {
  const [dx, dz] = dirTo(s.hero, { x, z }), d = hyp(x - s.hero.x, z - s.hero.z);
  return d < stop ? STILL : { dx, dz, mag: d < 2 ? Math.max(0.35, mag * d / 2) : mag };
};

/** face a point (a nudge of the stick turns him in a few frames and moves him half a metre) and breathe fire once he faces it (the stick back at rest: he keeps the way he faces) */
export const flameAt = (s, x, z, { within = 0.22, range = 6.4 } = {}) => {
  const [dx, dz] = dirTo(s.hero, { x, z });
  const err = Math.abs(wrap(Math.atan2(x - s.hero.x, z - s.hero.z) - s.hero.yaw)), d = hyp(x - s.hero.x, z - s.hero.z);
  if (d > range - 0.5) return { dx, dz, mag: 0.6 };                                // (too far to reach: go nearer first)
  return { dx, dz, mag: err > within ? 0.3 : 0, flame: err <= within };
};

// ---- bells -------------------------------------------------------------------------------------------------------------------------------------------
/** the right play: stand in the middle of the arc, and when it is his turn, breathe on the bell the tune says next */
export const bellsRight = (s) => {
  const t = s.trial;
  if (t.phase !== 'play') return goTo(s, t.x, t.z, { stop: 1.5 });
  const b = t.bells[t.tune[t.pos]];
  return flameAt(s, b.x, b.z);
};
/** a wrong play: always breathe on a bell that is not the next one */
export const bellsWrong = (s) => {
  const t = s.trial;
  if (t.phase !== 'play') return goTo(s, t.x, t.z, { stop: 1.5 });
  const want = t.tune[t.pos], i = (want + 1) % t.bells.length, b = t.bells[i];
  return flameAt(s, b.x, b.z);
};

// ---- plates ------------------------------------------------------------------------------------------------------------------------------------------
/** the right play: press the plates of the shortest way out of the board, one at a time, from the hub and back to it */
export const platesRight = () => {
  let queue = null, target = null, leaving = false;
  return (s) => {
    const t = s.trial;
    if (!queue) queue = solveBoard(t.on).presses.slice();
    if (leaving) { if (t.was.some(Boolean) || hyp(s.hero.x - t.x, s.hero.z - t.z) > 1.2) return goTo(s, t.x, t.z, { stop: 0.8 }); leaving = false; target = null; }
    if (target === null) {
      if (!queue.length) return goTo(s, t.x, t.z, { stop: 0.8 });
      target = queue.shift();
    }
    const b = t.plates[target];
    if (t.was[target]) { leaving = true; return goTo(s, t.x, t.z, { stop: 0.8 }); }
    return goTo(s, b.x, b.z, { stop: 0.2 });
  };
};
/** a hero who runs round the ring over every plate in turn presses them all and solves nothing by it (it is a puzzle, not a lap) */
export const platesLap = (s) => {
  const t = s.trial, i = Math.floor((s.t * 1.1) % t.plates.length), b = t.plates[i];
  return goTo(s, b.x, b.z, { stop: 0.2 });
};

// ---- circuit -----------------------------------------------------------------------------------------------------------------------------------------
/** the right play: run to each pylon in turn (a straight line to the next) */
export const circuitRun = (mag = 1) => (s) => {
  const t = s.trial, b = t.pylons[Math.min(t.next, t.pylons.length - 1)];
  if (t.next === 0 && !t.running && hyp(s.hero.x - t.x, s.hero.z - t.z) > 80) return goTo(s, b.x, b.z, { mag: 1 });
  return goTo(s, b.x, b.z, { stop: 0.4, mag });
};

// ---- wisps -------------------------------------------------------------------------------------------------------------------------------------------
/** the right play: stand in the middle of the vents and breathe on the wisp that is nearest to getting away */
export const wispsRight = (s) => {
  const t = s.trial;
  if (t.state !== 'active') return goTo(s, t.x, t.z, { stop: 1.0 });
  const live = t.live.filter((w) => !w.dead).sort((a, b) => b.age - a.age);
  if (!live.length) return goTo(s, t.x, t.z, { stop: 1.0 });
  const w = live[0];
  return flameAt(s, w.x, w.z, { within: 0.3, range: 6.2 });
};

// ---- puck --------------------------------------------------------------------------------------------------------------------------------------------
/**
 * the right play: get behind the puck on the line to the goal and ram it along that line. He aims at the side of the goal the goalie is not on (a bank off the side wall is not needed).
 */
export const puckRight = (s) => {
  const t = s.trial, [hx, hz] = toLocal(t, s.hero.x, s.hero.z);
  const gx = goalieX(t, t.t + 0.5), aimX = gx > 0 ? -t.goalHW * 0.55 : t.goalHW * 0.55, aimZ = t.hl + 0.5;
  let vx = aimX - t.px, vz = aimZ - t.pz;
  const l = hyp(vx, vz) || 1; vx /= l; vz /= l;
  const bx = t.px - vx * 2.6, bz = t.pz - vz * 2.6;                                  // (where he gets to: behind the puck)
  const moving = hyp(t.vx, t.vz) > 1.2;
  if (moving || t.hold > 0) return goTo(s, ...toWorld(t, bx, bz), { stop: 0.5 });
  const dBehind = hyp(hx - bx, hz - bz);
  const toPuck = hyp(t.px - hx, t.pz - hz);
  // lined up (behind the puck, on the line): ram
  const [wx, wz] = toWorld(t, t.px, t.pz);
  if (dBehind < 1.1 || (toPuck < 3.3 && ((t.px - hx) * vx + (t.pz - hz) * vz) / (toPuck || 1) > 0.93)) {
    const [dx, dz] = dirTo(s.hero, { x: toWorld(t, t.px + vx, t.pz + vz)[0], z: toWorld(t, t.px + vx, t.pz + vz)[1] });
    void wx; void wz;
    return { dx, dz, mag: 1, charge: true };
  }
  return goTo(s, ...toWorld(t, bx, bz), { stop: 0.4 });
};

// ---- mirrors -----------------------------------------------------------------------------------------------------------------------------------------
/** how far from the middle of a solid a hero keeps going past it (its radius, his, and a margin) */
const PASS = 1.0 + 0.55 + 0.35;
/** the way to (tx, tz) that does not run into a solid: straight, or by a point beside the one that is in the way */
export const around = (s, tx, tz, solids, clear = PASS) => {
  const hx = s.hero.x, hz = s.hero.z, dx = tx - hx, dz = tz - hz, d = hyp(dx, dz) || 1;
  for (const o of solids) {
    const u = ((o.x - hx) * dx + (o.z - hz) * dz) / (d * d);
    if (u <= 0 || u >= 1) continue;
    const px = hx + dx * u, pz = hz + dz * u, off = hyp(o.x - px, o.z - pz);
    if (off < clear && hyp(o.x - tx, o.z - tz) > 0.5) {
      const side = (o.x - px) * -dz + (o.z - pz) * dx >= 0 ? -1 : 1;
      return [o.x + (-dz / d) * side * (clear + 0.5), o.z + (dx / d) * side * (clear + 0.5)];
    }
  }
  return [tx, tz];
};
/** the right play: ram the mirrors that the shortest solution turns, one after another, each from 4.5 m off on a side that no other solid is on, lined up with it first (a ram cannot turn) */
export const mirrorsRight = () => {
  let queue = null, mark = 0, approach = null;
  return (s) => {
    const t = s.trial;
    if (!queue || mark !== t.turns) { queue = solveMirrors(t) ? solveMirrors(t).turns.slice() : []; mark = t.turns; approach = null; }
    if (!queue.length) return STILL;
    const q = t.mirrors[queue[0]], [wx, wz] = cellWorld(t, q.i, q.j), others = solidsOf(t).filter((o) => hyp(o.x - wx, o.z - wz) > 0.5);
    if (!approach) {
      let best = null;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, px = wx + Math.sin(a) * 4.5, pz = wz + Math.cos(a) * 4.5;
        const free = others.every((o) => {
          const u = Math.max(0, Math.min(1, ((o.x - px) * (wx - px) + (o.z - pz) * (wz - pz)) / (4.5 * 4.5))), cx = px + (wx - px) * u, cz = pz + (wz - pz) * u;
          return hyp(o.x - cx, o.z - cz) > PASS + 0.3 && hyp(o.x - px, o.z - pz) > 2.2;
        });
        const d = hyp(px - s.hero.x, pz - s.hero.z);
        if (free && (!best || d < best.d)) best = { px, pz, d };
      }
      approach = best || { px: wx, pz: wz - 4.5, d: 0 };
    }
    const dP = hyp(approach.px - s.hero.x, approach.pz - s.hero.z);
    const [dx, dz] = dirTo(s.hero, { x: wx, z: wz }), err = Math.abs(wrap(Math.atan2(wx - s.hero.x, wz - s.hero.z) - s.hero.yaw)), d = hyp(wx - s.hero.x, wz - s.hero.z);
    const ramming = s.hero.chargeT > 0;
    if (!ramming && d < 3.0) return goTo(s, ...around(s, approach.px, approach.pz, others), { stop: 0.5 });     // (against it after a ram: back off to run at it again: the button is let go and pressed anew)
    if (!ramming && dP > 1.0 && d > 5.3) return goTo(s, ...around(s, approach.px, approach.pz, others), { stop: 0.5 });
    if (!ramming && err > 0.12) return { dx, dz, mag: 0.3 };                                    // (lined up first: a nudge of the stick turns him on the spot)
    return { dx, dz, mag: 1, charge: true };
  };
};

// ---- thief and siege: the foes' own plays -------------------------------------------------------------------------------------------------------------
/** run at the nearest foe and flame it from 5 m, ram it from 2 (a Bell Snuffer only to a ram, a Thorn Snuffer only to the flame: he knows which) */
export const hunt = (flameRange = 5, ramRange = 2) => (s) => {
  const live = s.foes.filter((e) => e.state !== 'dead');
  if (!live.length) return goTo(s, s.trial.x, s.trial.z, { stop: 1.0 });
  const e = live.sort((a, b) => dist(s.hero, a) - dist(s.hero, b))[0], [dx, dz] = dirTo(s.hero, e), d = dist(s.hero, e);
  const armoured = e.kind === 'bell', spiked = e.kind === 'thorn';
  const ram = !spiked && ramRange > 0 && d < (armoured ? 3 : ramRange), flame = !armoured && flameRange > 0 && d < flameRange && d > 1 && !ram;
  return { dx, dz, mag: 1, flame, charge: ram };
};

/**
 * The siege as a person plays it: at the foe that is nearest, and what he does to it is what that kind asks (tools/lib/foe-plays.mjs): round a Lidwarden to its side, off the line of a Ramhog, fire on a
 * Rimeling that comes and on a Fusepup from afar, a ram for a Bell Snuffer and the flame for a Thorn Snuffer.
 */
export const siegeRight = () => (s) => {
  const live = s.foes.filter((e) => e.state !== 'dead');
  if (!live.length) return goTo(s, s.trial.x, s.trial.z, { stop: 1.0 });
  const e = live.sort((a, b) => dist(s.hero, a) - dist(s.hero, b))[0], t = { ...s, foe: e };
  switch (e.kind) {
    case 'warden': return wardPlay(t);
    case 'hog': return hogPlay(t);
    case 'rime': return flameAt(s, e.x, e.z, { range: 6.4 });                                                  // (turned to it first: it comes from where it likes, and a breath into the air melts nothing)
    case 'pup': {                                                                                              // (a Fusepup is breathed on from 4.4 m or more, out of its blast, and backed away from when it is nearer)
      const d = dist(s.hero, e), [dx, dz] = dirTo(s.hero, e);
      return d < 4.4 ? { dx: -dx, dz: -dz, mag: 1 } : flameAt(s, e.x, e.z, { range: 6.4 });
    }
    case 'slinger': return rush({ ram: 2.5, flame: 5 })(t);
    default: return hunt(5, 2)(s);
  }
};

// a hero whose trial is solved does nothing more
const guard = (f) => (s) => (s.trial.state === 'solved' ? STILL : f(s));
const guardMaker = (mk) => (...a) => guard(mk(...a));
export const plays = {
  bellsRight: guard(bellsRight), bellsWrong: guard(bellsWrong), platesRight: guardMaker(platesRight), platesLap: guard(platesLap), circuitRun: guardMaker(circuitRun),
  wispsRight: guard(wispsRight), puckRight: guard(puckRight), mirrorsRight: guardMaker(mirrorsRight), hunt: guardMaker(hunt), siegeRight: guardMaker(siegeRight),
};


// ---- the plays: a trial (a spec, relative to the stage's middle), a policy, how long, where the hero begins, what must come of it ----------------------------------------------------------------------
const pts = (a) => a.map(([x, z]) => ({ x, z }));
import { arcPoints } from '../../src/game/trials/core.js';

export const SPECS = {
  bells: { kind: 'bells', id: 'bells', goal: 'x', x: 0, z: 0, bells: pts(arcPoints(0, 0, 5.8, -1.15, 1.15, 5)), len: 4 },
  bells6: { kind: 'bells', id: 'bells', goal: 'x', x: 0, z: 0, bells: pts(arcPoints(0, 0, 5.8, -1.3, 1.3, 6)), len: 6 },
  plates: { kind: 'plates', id: 'plates', goal: 'x', x: 0, z: 0, plates: pts(arcPoints(0, 0, 5.5, 0, Math.PI * 2, 5)) },
  plates6: { kind: 'plates', id: 'plates', goal: 'x', x: 0, z: 0, scramble: 4, plates: pts(arcPoints(0, 0, 6.2, 0, Math.PI * 2, 6)) },
  circuit: { kind: 'circuit', id: 'circuit', goal: 'x', x: 0, z: 0, pylons: pts(arcPoints(0, 0, 16, 0, 5.4, 7)) },
  wisps: { kind: 'wisps', id: 'wisps', goal: 'x', x: 0, z: 0, vents: pts(arcPoints(0, 0, 5, 0, Math.PI * 2, 5)) },
  puck: { kind: 'puck', id: 'puck', goal: 'x', x: 0, z: 0, yaw: 0 },
  mirrors: { kind: 'mirrors', id: 'mirrors', goal: 'x', x: 0, z: 0, yaw: 0 },
  mirrors2: { kind: 'mirrors', id: 'mirrors', goal: 'x', x: 0, z: 0, yaw: 0, k: 2 },
  thief: { kind: 'thief', id: 'thief', goal: 'x', x: 0, z: 0, spawnX: 0, spawnZ: 12 },
  siege: { kind: 'siege', id: 'siege', goal: 'x', x: 0, z: 0, r: 12, waves: [['basic', 'basic'], ['slinger', 'basic', 'bell'], ['thorn', 'basic']] },
};

/** the right play of each kind, made fresh (some have a memory) */
export const POLICY = {
  bells: () => plays.bellsRight, plates: () => plays.platesRight(), circuit: () => plays.circuitRun(1), wisps: () => plays.wispsRight, puck: () => plays.puckRight,
  mirrors: () => plays.mirrorsRight(), thief: () => plays.hunt(6, 0), siege: () => plays.siegeRight(),
};

/** where a hero begins a trial (the realm's bots put him there, on foot or at once): near it, on ground the checker found level and clear, and facing what it asks him to face. `t` is the trial's record or its spec. */
export function startOf(t) {
  const P = t.pylons;
  switch (t.kind) {
    case 'bells': return { x: t.x, z: t.z, yaw: t.yaw };
    case 'circuit': {
      const a = P[0], b = P[1], d = hyp(b.x - a.x, b.z - a.z) || 1;
      return { x: a.x - ((b.x - a.x) / d) * 6, z: a.z - ((b.z - a.z) / d) * 6, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    case 'puck': { const [x, z] = toWorld(t, 0, -t.hl * 0.55); return { x, z, yaw: t.yaw }; }
    case 'mirrors': { const [x, z] = cellWorld(t, (t.w - 1) / 2, -1.7); return { x, z, yaw: t.yaw }; }
    case 'thief': return { x: t.x, z: t.z, yaw: Math.atan2((t.spawnX ?? t.x) - t.x, (t.spawnZ ?? t.z + 1) - t.z) };
    case 'siege': return { x: t.x + 3, z: t.z, yaw: -Math.PI / 2 };
    default: return { x: t.x, z: t.z, yaw: 0 };                                                                    // (plates and wisps: the middle of the ring)
  }
}

/** a spec moved to (ox, oz): the same trial in another place (the bot puts it on the floor of the Court) */
export function shift(spec, ox, oz) {
  const s = JSON.parse(JSON.stringify(spec));
  s.x += ox; s.z += oz;
  for (const k of ['bells', 'plates', 'pylons', 'vents']) if (s[k]) s[k] = s[k].map((p) => ({ ...p, x: p.x + ox, z: p.z + oz }));
  if (s.spawnX !== undefined) { s.spawnX += ox; s.spawnZ += oz; }
  return s;
}

/**
 * Each play: id, what it says, the spec, the policy (a function that makes it: some have a memory), T (seconds), `hero` (where he begins, from the middle of the trial), `seeds`, and what must come of it (`want`):
 *   solved     the seal is broken                                   unsolved    it is not
 *   failed     not solved, and it began again (a `fail` event)      missed      not solved, and a wrong step was made
 *   quiet      not solved and nothing happened to it
 */
export const PLAYS = [
  { id: 'bells-right', say: 'Bells: a hero who breathes on the bells in the order of the tune solves it', kind: 'bells', spec: SPECS.bells, policy: () => plays.bellsRight, T: 45, hero: { x: 0, z: -2, yaw: 0 }, want: 'solved' },
  { id: 'bells-six', say: 'Bells: ... and a tune of six on six bells too', kind: 'bells', spec: SPECS.bells6, policy: () => plays.bellsRight, T: 60, hero: { x: 0, z: -2, yaw: 0 }, want: 'solved' },
  { id: 'bells-wrong', say: 'Bells: a hero who breathes on the wrong bell is told so (the tune is rung again) and does not solve it', kind: 'bells', spec: SPECS.bells, policy: () => plays.bellsWrong, T: 40, hero: { x: 0, z: -2, yaw: 0 }, want: 'missed' },
  { id: 'bells-still', say: 'Bells: a hero who does nothing hears the tune (and hears it again) and nothing comes of it', kind: 'bells', spec: SPECS.bells, policy: () => still, T: 40, hero: { x: 0, z: -2, yaw: 0 }, want: 'unsolved' },
  { id: 'plates-right', say: 'Plates: a hero who presses the plates of the shortest way solves it', kind: 'plates', spec: SPECS.plates, policy: () => plays.platesRight(), T: 40, hero: { x: 0, z: 0.5, yaw: 0 }, want: 'solved' },
  { id: 'plates-six', say: 'Plates: ... and a ring of six that was spoilt four times', kind: 'plates', spec: SPECS.plates6, policy: () => plays.platesRight(), T: 60, hero: { x: 0, z: 0.5, yaw: 0 }, want: 'solved' },
  { id: 'plates-still', say: 'Plates: a hero who stands on the hub does nothing to it', kind: 'plates', spec: SPECS.plates, policy: () => still, T: 20, hero: { x: 0, z: 0.5, yaw: 0 }, want: 'quiet' },
  { id: 'circuit-run', say: 'Circuit: a hero who runs the pylons in order inside the time solves it', kind: 'circuit', spec: SPECS.circuit, policy: () => plays.circuitRun(1), T: 40, hero: { x: 16, z: -6, yaw: 0 }, want: 'solved' },
  { id: 'circuit-pace', say: 'Circuit: ... at 60% of a run too (the clock is made for that)', kind: 'circuit', spec: SPECS.circuit, policy: () => plays.circuitRun(0.6), T: 60, hero: { x: 16, z: -6, yaw: 0 }, want: 'solved' },
  { id: 'circuit-slow', say: 'Circuit: a hero who walks it at 40% runs out of time and has to begin again', kind: 'circuit', spec: SPECS.circuit, policy: () => plays.circuitRun(0.4), T: 40, hero: { x: 16, z: -6, yaw: 0 }, want: 'failed' },
  { id: 'wisps-right', say: 'Wisps: a hero who breathes on the wisps that are nearest to getting away solves it', kind: 'wisps', spec: SPECS.wisps, policy: () => plays.wispsRight, T: 60, hero: { x: 0, z: 0, yaw: 0 }, want: 'solved' },
  { id: 'wisps-still', say: 'Wisps: a hero who only watches sees them all get away, and the vents begin again', kind: 'wisps', spec: SPECS.wisps, policy: () => still, T: 40, hero: { x: 0, z: 0, yaw: 0 }, want: 'failed' },
  { id: 'puck-right', say: 'Puck: a hero who rams the puck at the side of the goal the goalie is not on scores three', kind: 'puck', spec: SPECS.puck, policy: () => plays.puckRight, T: 90, hero: { x: 0, z: -8, yaw: 0 }, want: 'solved' },
  { id: 'puck-still', say: 'Puck: a hero who does not ram it scores nothing', kind: 'puck', spec: SPECS.puck, policy: () => still, T: 30, hero: { x: 0, z: -8, yaw: 0 }, want: 'quiet' },
  { id: 'mirrors-right', say: 'Mirrors: a hero who rams the mirrors that the shortest way turns solves it', kind: 'mirrors', spec: SPECS.mirrors, policy: () => plays.mirrorsRight(), T: 40, hero: { x: 0, z: -14, yaw: 0 }, want: 'solved', seeds: [1, 2, 3, 4, 5, 6] },
  { id: 'mirrors-two', say: 'Mirrors: ... and a puzzle of two mirrors', kind: 'mirrors', spec: SPECS.mirrors2, policy: () => plays.mirrorsRight(), T: 40, hero: { x: 0, z: -14, yaw: 0 }, want: 'solved' },
  { id: 'mirrors-still', say: 'Mirrors: a hero who does not ram anything leaves the beam where it is', kind: 'mirrors', spec: SPECS.mirrors, policy: () => still, T: 20, hero: { x: 0, z: -14, yaw: 0 }, want: 'quiet' },
  { id: 'thief-flame', say: 'Thief: a hero who runs the Pilferling down and flames it from 6 m solves it', kind: 'thief', spec: SPECS.thief, policy: () => plays.hunt(6, 0), T: 60, hero: { x: 0, z: -8, yaw: 0 }, want: 'solved' },
  { id: 'thief-still', say: 'Thief: a hero who stands still is not hurt by it and does not solve it', kind: 'thief', spec: SPECS.thief, policy: () => still, T: 30, hero: { x: 0, z: -8, yaw: 0 }, want: 'quiet' },
  { id: 'siege-right', say: 'Siege: a hero who fights what comes in three waves clears it', kind: 'siege', spec: SPECS.siege, policy: () => plays.hunt(5, 2), T: 120, hero: { x: 0, z: -8, yaw: 0 }, want: 'solved' },
  { id: 'siege-still', say: 'Siege: a hero who does not fight does not clear it (and it does not clear itself)', kind: 'siege', spec: SPECS.siege, policy: () => still, T: 40, hero: { x: 0, z: -8, yaw: 0 }, want: 'unsolved' },
];

/** the outcome of a play: { solved, fails (times it began again), misses, ... } -> null if it is what the play wants, else why not */
export function judge(want, r) {
  switch (want) {
    case 'solved': return r.solved ? null : `not solved (${r.fails} fails, ${r.misses} misses)`;
    case 'unsolved': return !r.solved ? null : 'it was solved';
    case 'failed': return !r.solved && r.fails >= 1 ? null : `solved ${r.solved}, began again ${r.fails} times`;
    case 'missed': return !r.solved && r.misses >= 1 ? null : `solved ${r.solved}, ${r.misses} misses`;
    case 'quiet': return !r.solved && r.fails === 0 && r.misses === 0 ? null : `solved ${r.solved}, ${r.fails} fails, ${r.misses} misses`;
    default: return 'unknown want ' + want;
  }
}
