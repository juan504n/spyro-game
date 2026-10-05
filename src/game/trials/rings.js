// RINGS (the air): hoops of light hang over a drop, along the line a glide takes from the ledge the hero stands on. He runs off the edge, jumps, holds JUMP and glides; each ring he flies through counts
// (a ring is passed when his body crosses its plane inside it, going the way the course runs), in order but not every one: a ring that is missed is only missed, and four of the six are enough. The
// run ends when he lands (or the lava, or a fall, takes him and he is set back to the ledge): with too few rings the hoops go dark and he begins again; with enough, the seal is broken in the air.
// A hero who lands where the course ends (the stack in the lava, with the lantern) with the trial unsolved is carried back to the ledge by a gust, so that a miss costs a breath and not a walk.
// The rings are set by the layout from the glide the hero really has (`ringCourse`: the numbers of the Player, the line a jump and a glide take from a ledge) a little under that line, so that a straight
// glide passes through the upper part of each and a glide that is a little late through the lower, with a gentle S in the way (`amp`) so that it asks to be steered and not only held.
import { hyp } from './core.js';

export const RINGS = {
  r: 3.2, n: 6, want: 4, amp: 4.0, sag: 2.0, d0: 5.5, len: 34, padR: 3.6,
  wake: 36, settle: 1.6, landR: 14,
  // the glide the Player has (player.js P): the run, the jump's apex, the glide's speed and its fall; and the stretch a jump covers before the glide can begin
  run: 11.5, jumpV: 15.2, gravity: 40, glideSpeed: 13.5, glideFall: 3.1, jumpReach: 4.4,
};

/** how high the best glide is over the ledge at `d` metres past its edge (a jump from a run, then a glide that begins at the top of it): the jump's arc to 4.4 m, then 3.1 m for every 13.5 m. */
export function glideLine(d) {
  const R = RINGS;
  if (d <= 0) return 0;
  if (d < R.jumpReach) { const t = d / R.run; return R.jumpV * t - 0.5 * R.gravity * t * t; }
  const apex = (R.jumpV * R.jumpV) / (2 * R.gravity);                                  // (2.9 m)
  return apex - (R.glideFall / R.glideSpeed) * (d - R.jumpReach);
}

/**
 * The course: where the ledge ends and where each ring hangs. `at` is where the hero stands (the pad), `yaw` the way the course runs from it, `h(x, z)` the ground; the edge is the last firm
 * ground on the way before the ground falls away more than 1.2 m (or `edge` metres out when there is no drop: the checker says so). Rings from `d0` to `len` metres past the edge, an S of width `amp`
 * about the straight line, each `sag` metres under the glide line (which begins at the height of the lip) and facing along the course. Returns { edge: { x, y, z, d }, rings: [{ x, y, z, nx, nz, d }] }.
 */
export function ringCourse({ x, z, y, yaw, h = () => 0, edge = 6, n = RINGS.n, len = RINGS.len, amp = RINGS.amp, sag = RINGS.sag, d0 = RINGS.d0 }) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = fz, lz = -fx;                    // (along the course, and across it)
  let e = edge;
  for (let d = 0.5; d <= 16; d += 0.5) if (h(x + fx * d, z + fz * d) < y - 1.2) { e = d - 0.5; break; }
  const E = { x: x + fx * e, z: z + fz * e, d: e };
  E.y = h(E.x, E.z);
  const lat = (f) => amp * Math.sin(Math.PI * 2 * f), dlat = (f) => amp * Math.PI * 2 * Math.cos(Math.PI * 2 * f) / (len - d0);
  const rings = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1), d = d0 + f * (len - d0), l = lat(f), s = dlat(f);
    const tx = fx + lx * s, tz = fz + lz * s, tl = hyp(tx, tz);
    rings.push({ x: E.x + fx * d + lx * l, z: E.z + fz * d + lz * l, y: E.y + glideLine(d) - sag, nx: tx / tl, nz: tz / tl, d });         // (the glide begins at the lip, not at the pad)
  }
  return { edge: E, rings };
}

export const rings = {
  init(t) {
    t.phase = 'ready'; t.passed = 0; t.last = -1; t.got = t.rings.map(() => 0); t.flying = false; t.prev = null; t.settle = 0; t.cool = 0; t.state = 'idle'; t.runs = 0; t.fly = 0;
    t.r ??= RINGS.r; t.want ??= Math.min(RINGS.want, t.rings.length);
  },

  step(t, dt, ctx) {
    const p = ctx.p;
    t.t += dt;
    if (t.state === 'solved') return;
    t.cool = Math.max(0, t.cool - dt);
    if (hyp(p.x - t.x, p.z - t.z) < RINGS.wake || t.flying) t.state = 'active';
    const cur = { x: p.x, y: p.y + 0.55, z: p.z };                                        // (the middle of his body)
    // a hero set back (the lava, a fall) or carried is not where he was a step ago: the run he was on is over, and no ring was passed on the way
    if (t.prev && hyp(cur.x - t.prev.x, cur.z - t.prev.z) + Math.abs(cur.y - t.prev.y) > 8) { if (t.flying) end(t, ctx, 'lost'); t.prev = null; }
    if (p.dead) { if (t.flying) end(t, ctx, 'died'); t.prev = null; return; }
    if (t.flying) t.fly += dt;
    if (t.prev && !p.grounded) {
      for (let i = t.last + 1; i < t.rings.length; i++) {
        const c = t.rings[i];
        const a = (t.prev.x - c.x) * c.nx + (t.prev.z - c.z) * c.nz, b = (cur.x - c.x) * c.nx + (cur.z - c.z) * c.nz;
        if (!(a < 0 && b >= 0)) continue;                                                // (not through this ring's plane, going the way the course runs)
        const k = -a / (b - a), qx = t.prev.x + (cur.x - t.prev.x) * k, qy = t.prev.y + (cur.y - t.prev.y) * k, qz = t.prev.z + (cur.z - t.prev.z) * k;
        if (Math.hypot(qx - c.x, qy - c.y, qz - c.z) > t.r) continue;                    // (through the plane, outside the hoop)
        for (let j = t.last + 1; j < i; j++) t.got[j] = -1;                              // (the rings before it that were not flown through are missed: -1; one that was is 1; one that is still to come, 0)
        t.got[i] = 1; t.last = i; t.passed++;
        if (!t.flying) { t.flying = true; t.fly = 0; t.runs++; ctx.emit('start', { by: t }); }
        ctx.emit('ring', { by: t, i, n: t.passed });
        if (t.passed >= t.want) { t.flying = false; t.state = 'solved'; ctx.emit('solved', { by: t }); return; }
        break;                                                                           // (one ring a step)
      }
    }
    if (t.flying && p.grounded) end(t, ctx, 'landed');
    // standing where the course ends with the trial unsolved: the gust that carries him back to the ledge
    const L = t.land;
    if (!t.flying && L && p.grounded && !p.dead && hyp(p.x - L.x, p.z - L.z) < (L.r ?? RINGS.landR) && t.cool <= 0) {
      t.settle += dt;
      if (t.settle > RINGS.settle) { t.settle = 0; t.cool = 4; ctx.emit('return', { by: t, x: t.x, y: t.y, z: t.z, yaw: t.yaw }); }
    } else t.settle = Math.max(0, t.settle - dt * 2);
    t.prev = cur;
  },

  /** the hero has gone far off: the run is let go (no sound) and the hoops are as they were */
  sleep(t) { if (t.state !== 'solved') { reset(t); t.state = 'idle'; } },

  hud(t) {
    if (t.state !== 'active') return null;
    const of = t.want;
    return { text: t.flying ? `RINGS ${t.passed} OF ${of}` : `LEAP FROM THE LEDGE: ${of} OF ${t.rings.length} RINGS`, n: t.passed, of };
  },
  targets() { return []; },
};

function reset(t) { t.passed = 0; t.last = -1; t.got.fill(0); t.flying = false; t.fly = 0; t.prev = null; t.settle = 0; }

/** the run is over without enough rings: the hoops go dark and he begins again (`why`: he landed, the lava or a fall set him back, he died) */
function end(t, ctx, why) {
  const n = t.passed;
  reset(t);
  ctx.emit('fail', { by: t, why, n });
}
