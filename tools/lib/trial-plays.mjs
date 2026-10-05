// How a person plays each trial, as data (tools/trial-test.mjs plays these against the pure machines and a model of the hero; tools/trial-bot.mjs plays the same ones in the running game with the
// real controller): a policy is a function of what the hero can see and says what he does, { dx, dz, mag, jump, flame, charge }; a play is a trial (a spec), a policy, how long, where the hero
// begins, and what must come of it.
//   s = { t, hero: { x, y, z, yaw, grounded, chargeT, flameT }, trial: the trial's record (its parts and state), foes: [the foes it has made], events }
import { solveBoard } from '../../src/game/trials/plates.js';
import { solveMirrors, cellWorld } from '../../src/game/trials/mirrors.js';
import { solidsOf } from '../../src/game/trials/index.js';
import { wardPlay, hogPlay, rush } from './foe-plays.mjs';
import { goalieX, toLocal, toWorld } from '../../src/game/trials/puck.js';
import { buildTrial } from '../../src/game/trials/place.js';
import { ledgeWorld } from './flyhero.mjs';

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
/** the right play: press the plates of the shortest way out of the board, one at a time, from the hub and back to it (a straight line from the hub to a plate crosses no other plate; and the way out is looked for again from
 * the board as it is each time he is on the hub, so a plate pressed by the way - he came in over one - costs a press more, not the play) */
export const platesRight = () => {
  let target = null, leaving = false;
  return (s) => {
    const t = s.trial, atHub = hyp(s.hero.x - t.x, s.hero.z - t.z) < 1.2;
    if (leaving) { if (t.was.some(Boolean) || !atHub) return goTo(s, t.x, t.z, { stop: 0.8 }); leaving = false; target = null; }
    if (target === null) {
      if (!atHub) return goTo(s, t.x, t.z, { stop: 0.8 });
      const way = solveBoard(t.on);
      if (!way || !way.presses.length) return STILL;
      target = way.presses[0];
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

/** a hero who lets the first `n` wisps that rise go (the wisp's own number says which) and burns the rest */
export const wispsLetGo = (n) => (s) => {
  const t = s.trial;
  if (t.state !== 'active') return goTo(s, t.x, t.z, { stop: 1.0 });
  const live = t.live.filter((w) => !w.dead && w.n > n).sort((a, b) => b.age - a.age);
  if (!live.length) return goTo(s, t.x, t.z, { stop: 1.0 });
  return flameAt(s, live[0].x, live[0].z, { within: 0.3, range: 6.2 });
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

// ---- rings -------------------------------------------------------------------------------------------------------------------------------------------
/**
 * The way a person flies it: along the line through the middle of the rings, looking a few metres ahead on it (not at the next ring itself, which is always off to the side of where he is: a glide turns slowly,
 * and a hero who steers at the next hoop swings past it). `path(t)` is the polyline from the lip of the ledge through each ring and on past the last along its way.
 */
export const ringsPath = (t) => {
  const pts = [{ x: t.edgePt.x, z: t.edgePt.z }, ...t.rings.map((r) => ({ x: r.x, z: r.z }))], last = t.rings[t.rings.length - 1];
  pts.push({ x: last.x + last.nx * 12, z: last.z + last.nz * 12 });
  return pts;
};
/** the point `look` metres along a polyline from the nearest point of it to (x, z) */
export function ahead(pts, x, z, look) {
  let best = Infinity, bi = 0, bk = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const k = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)), d = hyp(x - (a.x + dx * k), z - (a.z + dz * k));
    if (d < best) { best = d; bi = i; bk = k; }
  }
  let i = bi, rest = look;
  const a = pts[i], b = pts[i + 1], seg = hyp(b.x - a.x, b.z - a.z);
  let at = bk * seg;
  for (;;) {
    const A = pts[i], B = pts[i + 1], len = hyp(B.x - A.x, B.z - A.z);
    if (at + rest <= len || i + 2 >= pts.length) { const k = Math.min(1, (at + rest) / (len || 1)); return { x: A.x + (B.x - A.x) * k, z: A.z + (B.z - A.z) * k }; }
    rest -= len - at; at = 0; i++;
  }
}
/**
 * The right play: run at the edge of the ledge along the course, jump at the lip, let go and press again at the top of the jump (that press is the glide), hold JUMP, and steer along the line of the rings.
 * `late` (s): waits that long after the top before he glides (a hero who is slow with his thumb); `walk`: he walks off the edge and does not jump (the glide begins in the fall); `look`: how far ahead on the line he
 * looks (m); `aim(s)` says where he steers for instead (the plays that do not follow the line).
 */
export const ringsRight = ({ late = 0, walk = false, look = 6, aim = null } = {}) => {
  let phase = 'run', wait = 0, atTop = 0, pts = null;
  return (s) => {
    const t = s.trial, h = s.hero, E = t.edgePt, fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
    pts = pts || ringsPath(t);
    if (phase === 'run') {
      // he runs at the edge and jumps when the ground ahead falls away (as a person does: he looks at the edge; the plays that are not told the ground go by where the lip is)
      const gx = E.x + fx * 3, gz = E.z + fz * 3, d = (h.x - E.x) * fx + (h.z - E.z) * fz;
      const ahead = s.floorAt ? s.floorAt(h.x + fx * (walk ? 0.1 : 0.9), h.z + fz * (walk ? 0.1 : 0.9)) < h.y - 0.8 : d > -(walk ? 0.2 : 0.9);
      if (ahead) { phase = walk ? 'fall' : 'jump'; } else return goTo(s, gx, gz, { stop: 0.1 });
    }
    if (phase === 'jump') { phase = 'rise'; return { dx: fx, dz: fz, mag: 1, jump: true }; }
    if (phase === 'rise') {                                                                                      // (the key is let go, and pressed again at the top of the jump)
      if (h.vy > 0.5 || h.grounded) return { dx: fx, dz: fz, mag: 1, jump: h.grounded };
      if (atTop === 0) atTop = s.t;                                                                              // (the top of the jump: by the game's clock, not by how often he is asked)
      if (s.t - atTop < late) return { dx: fx, dz: fz, mag: 1, jump: false };
      phase = 'glide'; return { dx: fx, dz: fz, mag: 1, jump: false };
    }
    if (phase === 'fall') { if (h.grounded || h.vy > -5) return { dx: fx, dz: fz, mag: 1, jump: false }; phase = 'glide'; return { dx: fx, dz: fz, mag: 1, jump: false }; }          // (a press in the 0.11 s after the ledge is a jump, not a glide: he waits for the fall to pass 5 m/s)
    // glide: the key goes down (a press) one step after it was up, and stays down
    wait += 1;
    const to = aim ? aim(s) : ahead(pts, h.x, h.z, look);
    const [dx, dz] = dirTo(h, to);
    return { dx, dz, mag: 1, jump: wait > 1 };
  };
};
/** a hero who glides without steering: straight along the course from the ledge, never turning for a ring */
export const ringsStraight = () => ringsRight({ aim: (s) => ({ x: s.hero.x + Math.sin(s.trial.yaw) * 20, z: s.hero.z + Math.cos(s.trial.yaw) * 20 }) });
/** a hero who runs off the edge and never glides (he falls, and what he falls on is the bed) */
export const ringsDrop = () => {
  let off = false;
  return (s) => {
    const t = s.trial, E = t.edgePt, fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), d = (s.hero.x - E.x) * fx + (s.hero.z - E.z) * fz;
    if (d > 2) off = true;
    if (off && s.hero.grounded) return STILL;                                                                    // (he has fallen, and he stands where he fell)
    return d < 2 ? goTo(s, E.x + fx * 6, E.z + fz * 6, { stop: 0.1 }) : { dx: fx, dz: fz, mag: 1, jump: false };
  };
};

// a hero whose trial is solved does nothing more
const guard = (f) => (s) => (s.trial.state === 'solved' ? STILL : f(s));
const guardMaker = (mk) => (...a) => guard(mk(...a));
export const plays = {
  bellsRight: guard(bellsRight), bellsWrong: guard(bellsWrong), platesRight: guardMaker(platesRight), platesLap: guard(platesLap), circuitRun: guardMaker(circuitRun),
  wispsRight: guard(wispsRight), wispsLetGo: guardMaker(wispsLetGo), puckRight: guard(puckRight), mirrorsRight: guardMaker(mirrorsRight), hunt: guardMaker(hunt), siegeRight: guardMaker(siegeRight),
  ringsRight: guardMaker(ringsRight), ringsStraight: guardMaker(ringsStraight), ringsDrop: guardMaker(ringsDrop),
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

/** the ground the rings are flown over in the tests: a ledge 24 m up with its edge 4.5 m out, a stack of ground 9 m under it 40 m out and the bed (the lava) far below; the course from the ledge toward the stack */
export const RING_WORLD = { x: 0, z: 0, y: 24, yaw: 0, edge: 4.5, from: 40, r: 10, top: 15, bed: -5, half: 20 };
export const ringsGround = () => ledgeWorld(RING_WORLD);
SPECS.rings = { ...buildTrial({ id: 'x', x: 0, z: 40 }, { kind: 'rings', at: [0, 0], toward: [0, 40] }, { h: ringsGround() }), id: 'rings', goal: 'x' };

/** the right play of each kind, made fresh (some have a memory) */
export const POLICY = {
  bells: () => plays.bellsRight, plates: () => plays.platesRight(), circuit: () => plays.circuitRun(1), wisps: () => plays.wispsRight, puck: () => plays.puckRight,
  mirrors: () => plays.mirrorsRight(), thief: () => plays.hunt(6, 0), siege: () => plays.siegeRight(), rings: () => plays.ringsRight(),
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
    case 'rings': return { x: t.x, z: t.z, yaw: t.yaw };                                                           // (the ledge, facing the way the course runs)
    default: return { x: t.x, z: t.z, yaw: 0 };                                                                    // (plates and wisps: the middle of the ring)
  }
}

/** a spec moved to (ox, oz): the same trial in another place (the bot puts it on the floor of the Court) */
export function shift(spec, ox, oz, oy = 0) {
  const s = JSON.parse(JSON.stringify(spec));
  s.x += ox; s.z += oz;
  for (const k of ['bells', 'plates', 'pylons', 'vents']) if (s[k]) s[k] = s[k].map((p) => ({ ...p, x: p.x + ox, z: p.z + oz }));
  if (s.rings) {                                                                                                  // (a course in the air: its heights are the ground's and the ground is moved too)
    s.y += oy; s.rings = s.rings.map((r) => ({ ...r, x: r.x + ox, z: r.z + oz, y: r.y + oy }));
    s.edgePt = { ...s.edgePt, x: s.edgePt.x + ox, z: s.edgePt.z + oz, y: s.edgePt.y + oy };
    s.land = { ...s.land, x: s.land.x + ox, z: s.land.z + oz };
  }
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
  { id: 'plates-in', say: 'Plates: ... and one who comes into the ring over a plate (the way out is looked for again, from the board as it is)', kind: 'plates', spec: SPECS.plates, policy: () => plays.platesRight(), T: 60, hero: { x: 0, z: 9, yaw: Math.PI }, want: 'solved' },
  { id: 'plates-still', say: 'Plates: a hero who stands on the hub does nothing to it', kind: 'plates', spec: SPECS.plates, policy: () => still, T: 20, hero: { x: 0, z: 0.5, yaw: 0 }, want: 'quiet' },
  { id: 'circuit-run', say: 'Circuit: a hero who runs the pylons in order inside the time solves it', kind: 'circuit', spec: SPECS.circuit, policy: () => plays.circuitRun(1), T: 40, hero: { x: 16, z: -6, yaw: 0 }, want: 'solved' },
  { id: 'circuit-pace', say: 'Circuit: ... at 60% of a run too (the clock is made for that)', kind: 'circuit', spec: SPECS.circuit, policy: () => plays.circuitRun(0.6), T: 60, hero: { x: 16, z: -6, yaw: 0 }, want: 'solved' },
  { id: 'circuit-slow', say: 'Circuit: a hero who walks it at 40% runs out of time and has to begin again', kind: 'circuit', spec: SPECS.circuit, policy: () => plays.circuitRun(0.4), T: 40, hero: { x: 16, z: -6, yaw: 0 }, want: 'failed' },
  { id: 'wisps-right', say: 'Wisps: a hero who breathes on the wisps that are nearest to getting away solves it', kind: 'wisps', spec: SPECS.wisps, policy: () => plays.wispsRight, T: 60, hero: { x: 0, z: 0, yaw: 0 }, want: 'solved' },
  { id: 'wisps-four', say: 'Wisps: ... and one who lets the first four get away and burns the other eight (four may get away)', kind: 'wisps', spec: SPECS.wisps, policy: () => plays.wispsLetGo(4), T: 60, hero: { x: 0, z: 0, yaw: 0 }, want: 'solved' },
  { id: 'wisps-still', say: 'Wisps: a hero who only watches sees them all get away, and the vents begin again', kind: 'wisps', spec: SPECS.wisps, policy: () => still, T: 40, hero: { x: 0, z: 0, yaw: 0 }, want: 'failed' },
  { id: 'puck-right', say: 'Puck: a hero who rams the puck at the side of the goal the goalie is not on scores three', kind: 'puck', spec: SPECS.puck, policy: () => plays.puckRight, T: 90, hero: { x: 0, z: -8, yaw: 0 }, want: 'solved' },
  { id: 'puck-still', say: 'Puck: a hero who does not ram it scores nothing', kind: 'puck', spec: SPECS.puck, policy: () => still, T: 30, hero: { x: 0, z: -8, yaw: 0 }, want: 'quiet' },
  { id: 'mirrors-right', say: 'Mirrors: a hero who rams the mirrors that the shortest way turns solves it', kind: 'mirrors', spec: SPECS.mirrors, policy: () => plays.mirrorsRight(), T: 40, hero: { x: 0, z: -14, yaw: 0 }, want: 'solved', seeds: [1, 2, 3, 4, 5, 6] },
  { id: 'mirrors-two', say: 'Mirrors: ... and a puzzle of two mirrors', kind: 'mirrors', spec: SPECS.mirrors2, policy: () => plays.mirrorsRight(), T: 40, hero: { x: 0, z: -14, yaw: 0 }, want: 'solved' },
  { id: 'mirrors-still', say: 'Mirrors: a hero who does not ram anything leaves the beam where it is', kind: 'mirrors', spec: SPECS.mirrors, policy: () => still, T: 20, hero: { x: 0, z: -14, yaw: 0 }, want: 'quiet' },
  { id: 'thief-flame', say: 'Thief: a hero who runs the Pilferling down and flames it from 6 m solves it', kind: 'thief', spec: SPECS.thief, policy: () => plays.hunt(6, 0), T: 60, hero: { x: 0, z: -8, yaw: 0 }, want: 'solved' },
  { id: 'thief-still', say: 'Thief: a hero who stands still is not hurt by it and does not solve it', kind: 'thief', spec: SPECS.thief, policy: () => still, T: 30, hero: { x: 0, z: -8, yaw: 0 }, want: 'quiet' },
  { id: 'rings-right', say: 'Rings: a hero who leaps from the ledge, glides and steers along the line of the rings solves it', kind: 'rings', spec: SPECS.rings, policy: () => plays.ringsRight(), T: 12, hero: { x: 0, z: -2, yaw: 0 }, want: 'solved', floor: ringsGround },
  { id: 'rings-walk', say: 'Rings: ... and one who walks off the edge and glides from the fall (the way the Anvil Stone has always been reached) too', kind: 'rings', spec: SPECS.rings, policy: () => plays.ringsRight({ walk: true }), T: 12, hero: { x: 0, z: -2, yaw: 0 }, want: 'solved', floor: ringsGround },
  { id: 'rings-late', say: 'Rings: ... and one whose thumb is a third of a second late', kind: 'rings', spec: SPECS.rings, policy: () => plays.ringsRight({ late: 0.3 }), T: 12, hero: { x: 0, z: -2, yaw: 0 }, want: 'solved', floor: ringsGround },
  { id: 'rings-straight', say: 'Rings: a hero who glides straight and never steers passes some of the rings and not enough', kind: 'rings', spec: SPECS.rings, policy: () => plays.ringsStraight(), T: 14, hero: { x: 0, z: -2, yaw: 0 }, want: 'unsolved', floor: ringsGround },
  { id: 'rings-drop', say: 'Rings: a hero who runs off the ledge and does not glide falls to the bed and nothing comes of it', kind: 'rings', spec: SPECS.rings, policy: () => plays.ringsDrop(), T: 8, hero: { x: 0, z: -2, yaw: 0 }, want: 'quiet', floor: ringsGround },
  { id: 'rings-still', say: 'Rings: a hero who stands on the ledge does nothing to it', kind: 'rings', spec: SPECS.rings, policy: () => still, T: 10, hero: { x: 0, z: -2, yaw: 0 }, want: 'quiet', floor: ringsGround },
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
