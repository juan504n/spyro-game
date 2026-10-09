// Camera rails: Catmull-Rom paths for the title orbit, the intro fly-through and the sunrise finale.
import { LEVEL } from './level.js';
import { OPEN } from './titlescreen.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}

/** Sample a Catmull-Rom spline through pts at u in [0,1]. */
export function splineAt(pts, u) {
  const n = pts.length - 1;
  const f = clamp(u, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(f));
  return cr(pts[Math.max(i - 1, 0)], pts[i], pts[i + 1], pts[Math.min(i + 2, n)], f - i);
}

/** Slow drifting shot of the village at dusk for the title screen (clear of trees and roofs). */
export function titleShot(game) {
  const c = LEVEL.lanterns[0];
  const cy = game.grid.heightAt(c.x, c.z);
  return (t) => {
    const a = -0.55 + Math.sin(t * 0.09) * 0.32;
    const r = 34 + Math.sin(t * 0.13) * 2;
    const y = cy + 15 + Math.sin(t * 0.21) * 0.9;
    return { pos: [c.x + Math.sin(a) * r, y, c.z + 14 + Math.cos(a) * r * 0.9], look: [c.x, cy + 4.5, c.z - 6], fov: 52 };
  };
}

/** ~15 s fly-over introducing every landmark. */
export function introShot(game) {
  const h = (x, z) => game.grid.heightAt(x, z);
  const S = LEVEL.summit;
  const camPts = [
    [26, h(26, 184) + 20, 190], [8, h(8, 150) + 18, 152], [-24, h(-24, 104) + 18, 108], [-6, 26, 70],
    [44, 30, 46], [96, 46, 62], [130, 44, 4], [70, 50, -14], [-40, 48, 6], [-92, 58, -14], [-80, 62, -60], [-16, 70, -74], [S.x + 30, 96, S.z + 46], [S.x + 4, 100, S.z + 28],
  ];
  const lookPts = [
    [0, 8, 138], [0, 6, 128], [-4, 3, 60], [-4, 6, 30],
    [104, 20, 26], [112, 26, 26], [112, 22, 22], [-30, 10, 20], [-118, 32, -20], [-110, 34, -50], [-72, 44, -98], [0, 58, -142], [S.x, 66, S.z], [S.x, 72, S.z],
  ];
  return (t, k) => {
    const u = ease(clamp(k, 0, 1));
    return { pos: splineAt(camPts, u), look: splineAt(lookPts, u), fov: 60 };
  };
}

/**
 * Sunrise finale: pull back from the Great Beacon and sweep out over the awakening valley. With the portal that opens above the lantern (`portal`: its record in the gameplay data,
 * see systems/portals.js) the shot begins differently: the camera slips in through the arch to the lantern room's floor and tips up to watch the ring of light bloom over the lamp,
 * and from `lead` seconds on it joins the pull-back (blended, so that nothing jumps).
 */
export function finaleShot(game, beacon, portal = null, dur = 13, lead = 6.2) {
  const bx = beacon.x, by = beacon.y + 6, bz = beacon.z;
  const camPts = [
    [bx + 2, by + 1, bz + 10], [bx + 16, by + 8, bz + 18], [bx + 30, by + 26, bz + 10], [bx + 12, by + 44, bz + 44], [bx - 10, by + 40, bz + 110],
  ];
  const lookPts = [
    [bx, by + 2, bz], [bx, by + 6, bz], [bx, by - 4, bz + 30], [bx, by - 32, bz + 100], [bx + 4, by - 44, bz + 200],
  ];
  const sweep = (t, k) => {
    const u = ease(clamp(k, 0, 1));
    return { pos: splineAt(camPts, u), look: splineAt(lookPts, u), fov: 56 + 12 * u };
  };
  if (!portal) return sweep;
  const cy = portal.y + portal.cy, B = beacon.y;
  // in through the arch that faces south (the gap between two pillars) and up to the floor beside the lamp
  const inPos = [[bx + 2.5, B + 7, bz + 9.5], [bx + 2.0, B + 3.2, bz + 7.4], [bx + 1.7, B + 0.2, bz + 6.5]];
  const inLook = [[bx, B + 8.5, bz], [bx, B + 11, bz], [bx, cy - 0.5, bz]];
  const end = { pos: inPos[2], look: inLook[2], fov: 70 };
  return (t, k) => {
    if (t < lead) {
      const u = ease(clamp(t / lead, 0, 1));
      return { pos: splineAt(inPos, u), look: splineAt(inLook, u), fov: lerp(56, 70, u) };
    }
    const k2 = (t - lead) / Math.max(1e-3, dur - lead), a = sweep(0, k2);
    const w = ease(clamp((t - lead) / 1.8, 0, 1));
    return { pos: [0, 1, 2].map((i) => lerp(end.pos[i], a.pos[i], w)), look: [0, 1, 2].map((i) => lerp(end.look[i], a.look[i], w)), fov: lerp(end.fov, a.fov, w) };
  };
}

/**
 * The Guardian's Gate opens (Dawnhaven, when the fifth realm burns: App._gateCeremony): the camera stands on the road 30 m in front of the gate, low, looking at the field between the pillars; it comes
 * closer as the field dissolves and the door of light is lit in its place, and climbs the beam that rises out of it. `b` is the gate's barrier record in the gameplay data (x, y = the floor, z).
 */
export function gateShot(b) {
  const gx = b.x, gy = b.y, gz = b.z;
  return (t, k) => {
    const u = ease(clamp(k, 0, 1)), up = ease(clamp((k - 0.64) / 0.36, 0, 1));
    return {
      pos: [gx + lerp(-15, 6, u), gy + lerp(4.2, 7.0, u) + up * 54, gz + lerp(30, 20, u) + up * 10],
      look: [gx, gy + 6.5 + up * 52, gz],
      fov: lerp(56, 62, u) + up * 8,
    };
  };
}

/**
 * The opening of the title screen (OPEN in titlescreen.js has its timing): Spyro glides in from far over the Vale at dusk, flares and lands on the village plaza, turns his face to
 * the camera and cheers; the camera starts high and wide to find him as a dot in the sky and ends low and close, with the Hearth Beacon and the houses behind him.
 * Both are plain functions of the clock `t` (seconds into the opening), so the opening can be jumped to any moment (the skip, the screenshots).
 * Returns { flight(player, t, dt), shot(t), land }: `flight` sets the hero's place, yaw and pose, `shot` is a camera shot.
 */
export function makeOpening(game, fly = OPEN.fly) {
  const c01 = (v) => clamp(v, 0, 1), c11 = (v) => clamp(v, -1, 1);
  const h = (x, z) => game.grid.heightAt(x, z);
  const LAND = [0.5, h(0.5, 144) + 0.02, 144];
  const route = [
    [-28, h(-28, 50) + 48, 50], [-11, h(-11, 92) + 34, 92], [7, h(7, 118) + 19, 118], [5, h(5, 133) + 8.5, 133], LAND,
  ];
  // The route is walked by its length, not by the spline's own parameter (which would be fast on the long first stretch and slow on the short ones): he comes in at about 22 m/s and eases down to
  // a walking pace over the last metres (the flare). `arc` maps a length fraction back to the spline's parameter.
  const N = 200, lens = [0];
  for (let i = 1; i <= N; i++) { const a = splineAt(route, (i - 1) / N), b = splineAt(route, i / N); lens.push(lens[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); }
  const total = lens[N];
  const arc = (f) => { const want = f * total; let i = 1; while (i < N && lens[i] < want) i++; const k = (want - lens[i - 1]) / ((lens[i] - lens[i - 1]) || 1); return (i - 1 + k) / N; };
  const along = (t) => { const k = c01(t / fly); return arc(1 - (1 - k) ** 1.4); };
  const at = (t) => splineAt(route, along(t));
  const yawAt = (t) => {
    const a = at(Math.max(0, t - 0.05)), b = at(Math.min(fly, t + 0.05));
    const head = Math.atan2(b[0] - a[0], b[2] - a[2]);
    return lerp(head, 0, ease(c01((t - fly + 1.6) / 1.6)));          // (and faces the camera, to the south, as he lands)
  };
  const cam0 = [-1.5, h(-1.5, 166) + 10, 166], cam1 = [0.6, h(0.6, 151.5) + 2.5, 151.5];
  const flight = (pl, t, dt) => {
    const p = t < fly ? at(t) : LAND;
    pl.x = p[0]; pl.y = p[1]; pl.z = p[2]; pl.yaw = yawAt(t);
    pl.grounded = t >= fly;
    const turn = c11(-(yawAt(t + 0.1) - yawAt(t - 0.1)) * 2.5, -1, 1);
    const after = t - fly;
    const cheer = c01((t - OPEN.cheerAt) / 0.25) * (1 - c01((t - OPEN.cheerAt - OPEN.cheerDur) / 0.35));
    const pose = t < fly
      ? { grounded: false, glide: true, vy: -2.2 + 1.6 * ease(c01((t - fly + 1.2) / 1.2)), speed: 14, turn, t }
      : { grounded: true, speed: Math.max(0, 4 * (1 - after / 0.5)), land: c01(1 - after / 0.5), cheer, turn: 0, t };
    pl.model.update(dt, pose);              // (the model keeps its own clock, so it is told the step's dt)
  };
  const shot = (t) => {
    const k = ease(c01(t / fly));
    const hero = t < fly ? at(t) : LAND;
    const sway = Math.sin(t * 0.35) * 0.7 * c01((t - fly) / 2);
    const pos = [lerp(cam0[0], cam1[0], k) + sway, lerp(cam0[1], cam1[1], k), lerp(cam0[2], cam1[2], k)];
    const settle = ease(c01((t - fly + 0.6) / 1.4));
    const look = [lerp(hero[0], LAND[0], settle), lerp(hero[1] + 0.8, LAND[1] + 2.15, settle), lerp(hero[2], LAND[2], settle)];
    return { pos, look, fov: lerp(54, 42, k) };
  };
  return { flight, shot, land: LAND, fly };
}
