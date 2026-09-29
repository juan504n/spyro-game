// Camera rails: Catmull-Rom paths for the title orbit, the intro fly-through and the sunrise finale.
import { LEVEL } from './level.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => t * t * (3 - 2 * t);

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

/** Sunrise finale: pull back from the Great Beacon and sweep out over the awakening valley. */
export function finaleShot(game, beacon) {
  const bx = beacon.x, by = beacon.y + 6, bz = beacon.z;
  const camPts = [
    [bx + 2, by + 1, bz + 10], [bx + 16, by + 8, bz + 18], [bx + 30, by + 26, bz + 10], [bx + 12, by + 44, bz + 44], [bx - 10, by + 40, bz + 110],
  ];
  const lookPts = [
    [bx, by + 2, bz], [bx, by + 6, bz], [bx, by - 4, bz + 30], [bx, by - 32, bz + 100], [bx + 4, by - 44, bz + 200],
  ];
  return (t, k) => {
    const u = ease(clamp(k, 0, 1));
    return { pos: splineAt(camPts, u), look: splineAt(lookPts, u), fov: 56 + 12 * u };
  };
}
