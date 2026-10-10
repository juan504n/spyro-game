// How a realm's brief asks for a trial, and what the layout makes of it. A goal of the brief may carry `trial: { kind, at: [x, z], ...the kind's own numbers }` (defaults below); `buildTrial` makes
// the record the TrialSystem is given (`gp.trials`: systems/trials.js): the parts of the kind placed on the ground (bells on an arc, plates in a ring, vents round a hub...), the gems it pays when
// it is solved (what its foes would have dropped), the look of the realm. `footprint` says what ground a trial needs: the brief's level makes it a level pad, the layout keeps props off it, and the
// checker (tools/lib/realm-rules.mjs `trials.*`) holds it to being flat, dry, clear and reachable. Pure: no three, no DOM.
import { arcPoints, polar, hyp } from './core.js';
import { TRIAL_IDS, TRIALS } from './kinds.js';
import { MIRRORS } from './mirrors.js';
import { RINGS, ringCourse } from './rings.js';
import { foesOf } from './index.js';
import { KINDS } from '../foes/kinds.js';

/** the numbers each kind takes from the brief, with what it is when the brief says nothing */
export const DEFAULTS = {
  bells: { n: 5, r: 5.8, arc: 2.3, len: 4 },
  plates: { n: 5, r: 5.5 },
  circuit: {},
  wisps: { n: 5, r: 5 },
  puck: { yaw: 0, hw: 6.5, hl: 11, goalHW: 2.4 },
  mirrors: { yaw: 0, w: 5, h: 5, k: 3 },
  thief: { dist: 12 },
  siege: { r: 12 },
  rings: { n: RINGS.n, want: RINGS.want, r: RINGS.r, amp: RINGS.amp, sag: RINGS.sag, len: RINGS.len, d0: RINGS.d0, edge: 6, landR: RINGS.landR, padR: RINGS.padR },
};

/** the foes a siege may call (the ones that fight without a place of their own: not the Dusk Moth, which flies, the Smokecaller, which calls more, the Pilferling, which runs, nor the Dustmole, which digs) */
export const SIEGE_KINDS = ['basic', 'bell', 'thorn', 'rime', 'slinger', 'hog', 'warden', 'pup', 'shiver', 'urchin', 'crab'];

/** the look of a realm's trials: the textures of its stone and its crystal and the colour of its glow (`brief.theme.trials`), else the Vale's */
export function lookOf(brief) {
  const T = (brief && brief.theme && brief.theme.trials) || {};
  const first = brief && brief.goals && brief.goals[0];
  return { stone: 'cobble', crystal: 'crystal_violet', metal: 'metal_brass', glow: (first && first.glow) || [0.72, 0.5, 1.0], ...T };
}

/** the gems a solved trial pays: what the foes it brings would have dropped (a thief its sack, a siege its waves); the brief may say its own */
export const rewardOf = (spec) => foesOf(spec).flatMap((k) => (KINDS[k] ? KINDS[k].drops : []));

/** the circle of ground a trial needs level and clear: { x, z, r } (a circuit, which runs over the country as it is, has none) */
export function footprint(spec) {
  switch (spec.kind) {
    case 'bells': {                                                                             // (where he stands and the arc in front of him: a circle round both)
      const a = spec.arc ?? DEFAULTS.bells.arc, mid = spec.r / 2, rad = Math.max(mid, hyp(spec.r * Math.sin(a / 2), spec.r * Math.cos(a / 2) - mid));
      return { x: spec.x + Math.sin(spec.yaw) * mid, z: spec.z + Math.cos(spec.yaw) * mid, r: rad + 1.5 };
    }
    case 'plates': case 'wisps': return { x: spec.x, z: spec.z, r: spec.r + 2.2 };
    case 'puck': return { x: spec.x, z: spec.z, r: hyp(spec.hw, spec.hl) + 0.8 };
    case 'mirrors': return { x: spec.x, z: spec.z, r: hyp(((spec.w ?? MIRRORS.w) - 1) / 2, ((spec.h ?? MIRRORS.h) - 1) / 2) * MIRRORS.cell + 1.8 };
    case 'siege': return { x: spec.x, z: spec.z, r: spec.r + 1.5 };
    case 'rings': return { x: spec.x, z: spec.z, r: spec.padR ?? RINGS.padR };                  // (the ledge he leaps from: the air over the drop is the checker's)
    default: return null;
  }
}

/**
 * The record for a goal's trial, from the brief's `t`. `h(x, z)` is the ground; `look` the realm's. Throws on a kind or a number that cannot be made (defineBrief says so before this is ever called).
 * The bells stand on an arc in front of where the hero stands (`at`, facing `yaw`); plates and vents in a ring round `at`; a puck's court, a mirror floor and a siege's ring are centred on `at`.
 */
export function buildTrial(goal, t, { h = () => 0, look = null } = {}) {
  if (!TRIAL_IDS.includes(t.kind)) throw new Error(`goal '${goal.id}': no trial kind '${t.kind}'`);
  const D = { ...DEFAULTS[t.kind], ...t };
  const at = t.at || (t.pylons && t.pylons[0]) || [goal.x, goal.z];
  const spec = { id: `${goal.id}-${t.kind}`, kind: t.kind, goal: goal.id, x: at[0], z: at[1], y: h(at[0], at[1]), look };
  const part = ([x, z]) => ({ x, z, y: h(x, z) });
  switch (t.kind) {
    case 'bells':
      spec.yaw = D.yaw ?? 0; spec.r = D.r; spec.len = D.len; spec.arc = D.arc;
      spec.bells = arcPoints(at[0], at[1], D.r, spec.yaw - D.arc / 2, spec.yaw + D.arc / 2, D.n).map(part);
      break;
    case 'plates':
      spec.r = D.r; if (D.scramble !== undefined) spec.scramble = D.scramble;
      spec.plates = arcPoints(at[0], at[1], D.r, 0, Math.PI * 2, D.n).map(part);
      break;
    case 'circuit':
      spec.pylons = t.pylons.map(part);
      if (t.time !== undefined) spec.time = t.time;
      break;
    case 'wisps':
      spec.r = D.r; if (D.want !== undefined) spec.want = D.want;
      spec.vents = arcPoints(at[0], at[1], D.r, 0, Math.PI * 2, D.n).map(part);
      break;
    case 'puck':
      Object.assign(spec, { yaw: D.yaw, hw: D.hw, hl: D.hl, goalHW: D.goalHW });
      break;
    case 'mirrors':
      Object.assign(spec, { yaw: D.yaw, w: D.w, h: D.h, k: D.k });
      if (t.seed !== undefined) spec.seed = t.seed;
      break;
    case 'thief': {
      const sp = t.spawn || polar(at[0], at[1], t.yaw ?? 0, D.dist);
      spec.spawnX = sp[0]; spec.spawnZ = sp[1];
      break;
    }
    case 'siege':
      spec.r = D.r; spec.waves = t.waves;
      break;
    case 'rings': {                                                                              // (the ledge is where he stands, `toward` the way the course runs (the lantern, by default): the rings hang along the glide from the edge)
      const to = t.toward || [goal.x, goal.z];
      const yaw = t.yaw ?? Math.atan2(to[0] - at[0], to[1] - at[1]);
      const C = ringCourse({ x: at[0], z: at[1], y: spec.y, yaw, h, edge: D.edge, n: D.n, len: D.len, amp: D.amp, sag: D.sag, d0: D.d0 });
      Object.assign(spec, { yaw, r: D.r, want: Math.min(D.want, D.n), padR: D.padR, edgePt: C.edge, rings: C.rings, land: { x: goal.x, z: goal.z, r: D.landR } });
      break;
    }
    default: break;
  }
  spec.gems = t.gems !== undefined ? t.gems : rewardOf(spec);
  return spec;
}

/** what is wrong with a brief's trial (a list of messages, empty if it is a trial that can be made): defineBrief refuses a design that has any */
export function trialProblems(goal, t) {
  const errs = [], say = (m) => errs.push(`goal '${goal.id}': trial ${m}`);
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const xz = (a) => Array.isArray(a) && a.length === 2 && a.every(num);
  if (!t || typeof t !== 'object') { say('must be { kind, at: [x, z], ... }'); return errs; }
  if (!TRIAL_IDS.includes(t.kind)) { say(`kind one of ${TRIAL_IDS.join(' | ')}`); return errs; }
  if (t.kind === 'circuit') {
    if (!Array.isArray(t.pylons) || t.pylons.length < 5 || t.pylons.length > 9 || !t.pylons.every(xz)) say('circuit needs pylons [[x, z], ...] (five to nine: the loop he runs)');
    if (t.time !== undefined && !(num(t.time) && t.time >= 14)) say('time: seconds (14 or more)');
  } else if (!xz(t.at)) say('at: [x, z] (where it stands: its middle)');
  const D = { ...DEFAULTS[t.kind], ...t };
  if (t.kind === 'bells') {
    if (!(Number.isInteger(D.n) && D.n >= 4 && D.n <= 6)) say('bells n: 4 to 6');
    if (!(D.r >= 4.4 && D.arc > 0 && D.r * D.arc / (D.n - 1) >= 3.2)) say('bells: 3.2 m or more between them (r * arc / (n - 1)) and r from 4.4 m');
    if (!(Number.isInteger(D.len) && D.len >= 3 && D.len <= 6)) say('bells len: 3 to 6 notes');
  }
  if ((t.kind === 'plates' || t.kind === 'wisps') && !(Number.isInteger(D.n) && D.n >= 5 && D.n <= 6 && D.r >= 3.6)) say(`${t.kind} n: 5 or 6, r: 3.6 m or more`);
  if (t.kind === 'puck' && !(D.hw >= 5 && D.hl >= 8 && D.goalHW >= 1.8 && D.goalHW < D.hw)) say('puck: hw 5 m or more, hl 8 m or more, goalHW 1.8 m or more and narrower than the court');
  if (t.kind === 'mirrors' && !(Number.isInteger(D.w) && Number.isInteger(D.h) && D.w >= 4 && D.w <= 5 && D.h >= 4 && D.h <= 5 && Number.isInteger(D.k) && D.k >= 2 && D.k <= 3)) say('mirrors: a floor of 4 or 5 squares each way and 2 or 3 mirrors');
  if (t.kind === 'thief' && t.spawn !== undefined && !xz(t.spawn)) say('thief spawn: [x, z]');
  if (t.kind === 'rings') {
    if (!(Number.isInteger(D.n) && D.n >= 4 && D.n <= 8)) say('rings n: 4 to 8');
    if (!(Number.isInteger(D.want) && D.want >= 3 && D.want <= D.n)) say('rings want: 3 or more and no more than n');
    if (!(D.r >= 2.2 && D.r <= 4)) say('rings r: 2.2 to 4 m (the hoop he must fly through)');
    if (!(D.len >= 20 && D.len <= 60 && D.d0 >= 4.5 && D.d0 <= D.len - 8)) say('rings len: 20 to 60 m, and d0 from 4.5 m (the first ring is past the jump) and 8 m short of the end');
    if (!(D.amp >= 0 && D.amp <= 6)) say('rings amp: 0 to 6 m (the S of the way)');
    if (!(D.sag >= 0 && D.sag <= 4)) say('rings sag: 0 to 4 m under the glide line');
    if (t.toward !== undefined && !xz(t.toward)) say('rings toward: [x, z]');
    if (t.yaw !== undefined && !num(t.yaw)) say('rings yaw: radians');
  }
  if (t.kind === 'siege') {
    if (!(D.r >= 8)) say('siege r: 8 m or more');
    if (!Array.isArray(t.waves) || t.waves.length < 2 || t.waves.length > 4 || !t.waves.every((w) => Array.isArray(w) && w.length >= 1 && w.length <= 4 && w.every((k) => SIEGE_KINDS.includes(k)))) say(`siege waves: two to four waves of one to four of ${SIEGE_KINDS.join(' ')}`);
  }
  if (t.gems !== undefined && !(Array.isArray(t.gems) && t.gems.every((v) => [1, 2, 5, 10, 25].includes(v)))) say('gems: a list of gem values (1 2 5 10 25)');
  void TRIALS;
  return errs;
}
