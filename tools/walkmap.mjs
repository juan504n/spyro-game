// Who can walk where, computed headlessly: a Dijkstra over the ground of a built world (tools/headless-world.mjs), in 1.2 m cells with the real slope limit, the real colliders and the
// level's rock masses (massif.js), for a body 0.55 m wide and 1.05 m tall that can step up 0.62 m. The distances are metres of walking. A cell can hold several layers of ground (a
// ledge road over the foot of the mountain it winds round, a tunnel under it, a pier over a lake bed): the states are (cell, height band of 3 m), so that the ground a walker can step
// onto is the layer he is on. Shared by home-check.mjs and the debugging scripts.
//
//   const { flood } = makeWalkmap(buildHeadless('home'));
//   const w = flood([x, z], { breakWalls: false, openGate: false, startY, mask });       (mask(x, y, z) -> false keeps the walk out of a cell: a flood along one corridor)
//   const w = flood([x, z]);       w.has(x, z, y?)   w.dist(x, z, y?)   w.distNear(x, z, r, y?)   w.yAt(x, z)   w.route(x, z, r, y?) -> [[x, y, z, metres], ...]
import { SLOPE_WALK } from '../src/game/collision.js';
import { WATER_LEVEL } from '../src/game/level.js';

export const CELL = 1.2;
const BAND = 3;

export function makeWalkmap({ grid, collision }) {
  const half = grid.half, N = Math.floor((2 * half) / CELL);
  const cx = (i) => -half + (i + 0.5) * CELL, cz = (j) => -half + (j + 0.5) * CELL;
  const nrm = [0, 1, 0];
  const cellAt = (x, z) => { const i = Math.floor((x + half) / CELL), j = Math.floor((z + half) / CELL); return i >= 0 && j >= 0 && i < N && j < N ? j * N + i : -1; };
  const band = (y) => Math.floor((y + 10) / BAND);

  const flood = (start, { breakWalls = false, openGate = false, startY, mask } = {}) => {
    // states: parallel arrays; byKey finds a state by (cell, band), byCell lists a cell's states
    const S = { cell: [], y: [], d: [], parent: [], done: [] };
    const byKey = new Map(), byCell = new Map();
    // (as Player.update asks it: a solid collider stops a 0.55 m wide, 1.05 m tall body standing with its feet at `feet` when it reaches above the step he can take (0.62) and starts below his head)
    const solid = (x, feet, z) => {
      for (const c of collision.near(x, z)) {
        if (!c.solid || c.y1 <= feet + 0.62 || c.y0 >= feet + 1.05 || !collision.inside(c, x, z, 0.55)) continue;
        if ((breakWalls && c.tag === 'wall') || (openGate && c.tag === 'barrier')) continue;
        return true;
      }
      for (const m of collision.solids) { const e = { x, z, r: 0.55 }; if (m.inBoxXZ(x, z) && m.push(e, feet, 1.05, 0.62) && Math.hypot(e.x - x, e.z - z) > 0.25) return true; }       // (the rock pushes him out)
      return false;
    };
    const heap = [];
    const push = (e) => { heap.push(e); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const add = (cell, y, d, parent) => {
      const key = cell * 64 + band(y);
      let s = byKey.get(key);
      if (s === undefined) { s = S.cell.length; S.cell.push(cell); S.y.push(y); S.d.push(d); S.parent.push(parent); S.done.push(0); byKey.set(key, s); let l = byCell.get(cell); if (!l) byCell.set(cell, l = []); l.push(s); push([d, s]); return; }
      if (d < S.d[s] && !S.done[s]) { S.d[s] = d; S.y[s] = y; S.parent[s] = parent; push([d, s]); }
    };
    add(cellAt(start[0], start[1]), startY ?? collision.support(start[0], start[1], 1e3, 1e3).y, 0, -1);
    let count = 0;
    while (heap.length) {
      const [d0, s0] = pop();
      if (S.done[s0] || d0 > S.d[s0]) continue;
      S.done[s0] = 1; count++;
      const c0 = S.cell[s0], i = c0 % N, j = (c0 - i) / N, y0 = S.y[s0];
      // (up to two cells at a stride: the treads of a stair are shallower than a cell, so the cell centres that fall on consecutive treads are not neighbours)
      for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) {
        if ((!di && !dj) || di * di + dj * dj > 5) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const x = cx(a), z = cz(b);
        const sup = collision.support(x, z, y0, 0.62);
        if (sup.y - y0 > 0.62) continue;
        if (mask && !mask(x, sup.y, z)) continue;
        if (sup.kind === 'terrain') { grid.normalAt(x, z, nrm); if (nrm[1] < SLOPE_WALK) continue; if (sup.y < WATER_LEVEL - 0.9) continue; }
        else if (sup.kind === 'solid' && sup.n.ny < SLOPE_WALK) continue;
        if (solid(x, sup.y, z)) continue;
        if (Math.abs(di) + Math.abs(dj) > 1 && solid((x + cx(i)) / 2, Math.max(sup.y, y0), (z + cz(j)) / 2)) continue;       // (nothing in between)
        if (Math.abs(sup.y - y0) > 1.6) continue;
        // (a step down onto a lower layer is a drop, which he takes, but only a short one: a ledge road is not left by walking off its edge)
        if (y0 - sup.y > 0.9) continue;
        add(b * N + a, sup.y, d0 + Math.hypot(di, dj) * CELL, s0);
      }
    }
    const statesAt = (x, z, y) => {
      const l = byCell.get(cellAt(x, z));
      if (!l) return [];
      return l.filter((s) => S.done[s] && (y === undefined || Math.abs(S.y[s] - y) < 2.2));
    };
    const best = (x, z, y) => { let b = -1; for (const s of statesAt(x, z, y)) if (b < 0 || S.d[s] < S.d[b]) b = s; return b; };
    return {
      has: (x, z, y) => statesAt(x, z, y).length > 0,
      count,
      yAt: (x, z, y) => { const s = best(x, z, y); return s < 0 ? NaN : S.y[s]; },
      dist: (x, z, y) => { const s = best(x, z, y); return s < 0 ? Infinity : S.d[s]; },
      /** the shortest walk to anywhere within r metres of (x, z) (and, when y is given, within 2.2 m of that height: ground under a roof or over a cave is another place) */
      distNear(x, z, r = 2.4, y) {
        let bd = Infinity;
        for (let dx = -r; dx <= r; dx += CELL) for (let dz = -r; dz <= r; dz += CELL) { const s = best(x + dx, z + dz, y); if (s >= 0 && S.d[s] < bd) bd = S.d[s]; }
        return bd;
      },
      /** the cells walked from the start to the one nearest to (x, z) in the reach: [[x, y, z, metres]] */
      route(x, z, r = 3, y) {
        let bs = -1;
        for (let dx = -r; dx <= r; dx += CELL) for (let dz = -r; dz <= r; dz += CELL) { const s = best(x + dx, z + dz, y); if (s >= 0 && (bs < 0 || S.d[s] < S.d[bs])) bs = s; }
        const out = [];
        for (let s = bs; s >= 0; s = S.parent[s]) { const c = S.cell[s], i = c % N, j = (c - i) / N; out.push([cx(i), S.y[s], cz(j), S.d[s]]); }
        return out.reverse();
      },
      /** every reached state as [x, y, z] (for statistics) */
      each(fn) { for (let s = 0; s < S.cell.length; s++) if (S.done[s]) { const c = S.cell[s], i = c % N, j = (c - i) / N; fn(cx(i), S.y[s], cz(j)); } },
    };
  };
  return { flood, N, cx, cz, cellAt };
}
