// MIRRORS (a mechanism): a lamp on one side of a floor of squares, a receiver on another, and mirrors of crystal between them. A beam leaves the lamp and runs square by square; a mirror turns it
// a quarter (a '/' one and a '\' one), the receiver lights the lantern. A ram turns a mirror over ('/' to '\' and back). The puzzle is made from a way that works (2 or 3 mirrors on it) and
// then some of the mirrors are turned the wrong way, so that it can always be solved, in as many rams as it was spoilt by (or fewer).
import { hyp, pick, newRam } from './core.js';

export const MIRRORS = { cell: 4.4, wake: 24, r: 0.2, solidR: 1.0, cd: 0.8, maxSteps: 60, w: 5, h: 5 };

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];                                    // east, north, west, south (i grows eastwards and j northwards, in the floor's own frame)
/** which way a beam going `d` goes after a mirror `s` (0: '/', 1: '\') */
export const reflect = (s, d) => (s === 0 ? [d[1], d[0]] : [-d[1], -d[0]]);

/** the square (i, j) of the floor in the world */
export function cellWorld(t, i, j) {
  const lx = (i - (t.w - 1) / 2) * MIRRORS.cell, lz = (j - (t.h - 1) / 2) * MIRRORS.cell, c = Math.cos(t.yaw), s = Math.sin(t.yaw);
  return [t.x + lx * c + lz * s, t.z - lx * s + lz * c];
}

/** the squares the beam goes through with the mirrors as they stand: { cells: [[i, j]...], hit, end } */
export function trace(t, states = null) {
  const key = (i, j) => i * 100 + j, m = new Map(t.mirrors.map((q, k) => [key(q.i, q.j), states ? states[k] : q.s]));
  let [i, j] = [t.source.i, t.source.j], d = DIRS[t.source.d];
  const cells = [[i, j]];
  for (let n = 0; n < MIRRORS.maxSteps; n++) {
    i += d[0]; j += d[1];
    if (i < 0 || j < 0 || i >= t.w || j >= t.h) return { cells, hit: false, end: [i, j] };
    cells.push([i, j]);
    if (i === t.receiver.i && j === t.receiver.j) return { cells, hit: true, end: [i, j] };
    const s = m.get(key(i, j));
    if (s !== undefined) d = reflect(s, d);
  }
  return { cells, hit: false, end: [i, j] };
}

/** the fewest mirrors that must be turned (and which) for the beam to reach the receiver: { turns: [k...], n } or null */
export function solveMirrors(t) {
  const k = t.mirrors.length;
  let best = null;
  for (let m = 0; m < 1 << k; m++) {
    const st = t.mirrors.map((q, x) => (m & (1 << x) ? 1 - q.s : q.s));
    if (!trace(t, st).hit) continue;
    let c = 0; for (let x = 0; x < k; x++) if (m & (1 << x)) c++;
    if (!best || c < best.n) best = { m, n: c };
  }
  if (!best) return null;
  return { turns: t.mirrors.map((q, x) => x).filter((x) => best.m & (1 << x)), n: best.n };
}

/** a puzzle: the lamp, the receiver and `k` mirrors, spoilt */
function generate(t, rng, k) {
  const W = t.w, H = t.h;
  for (let attempt = 0; attempt < 400; attempt++) {
    const j0 = 1 + pick(rng, H - 2);
    let cur = [0, j0], di = 0;                                                       // the lamp is in the west column and the beam goes east
    const used = new Set([cur[0] * 100 + cur[1]]), mirrors = [];
    let ok = true;
    for (let m = 0; m < k && ok; m++) {
      const d = DIRS[di], reach = [];
      for (let s = 1; s < 8; s++) { const i = cur[0] + d[0] * s, j = cur[1] + d[1] * s; if (i < 0 || j < 0 || i >= W || j >= H || used.has(i * 100 + j)) break; reach.push([i, j]); }
      if (!reach.length) { ok = false; break; }
      const c = reach[pick(rng, reach.length)];
      // (the turn must leave room: the next square must be free)
      const outs = [(di + 1) % 4, (di + 3) % 4].filter((o) => { const i = c[0] + DIRS[o][0], j = c[1] + DIRS[o][1]; return i >= 0 && j >= 0 && i < W && j < H && !used.has(i * 100 + j); });
      if (!outs.length) { ok = false; break; }
      const out = outs[pick(rng, outs.length)];
      for (const q of reach) { used.add(q[0] * 100 + q[1]); if (q === c) break; }
      let s = -1;
      for (const cand of [0, 1]) { const r = reflect(cand, DIRS[di]); if (r[0] === DIRS[out][0] && r[1] === DIRS[out][1]) s = cand; }
      mirrors.push({ i: c[0], j: c[1], s, right: s });
      cur = c; di = out;
    }
    if (!ok) continue;
    const d = DIRS[di], reach = [];
    for (let s = 1; s < 8; s++) { const i = cur[0] + d[0] * s, j = cur[1] + d[1] * s; if (i < 0 || j < 0 || i >= W || j >= H || used.has(i * 100 + j)) break; reach.push([i, j]); }
    if (!reach.length) continue;
    const r = reach[reach.length - 1 - pick(rng, Math.min(2, reach.length))];
    t.source = { i: 0, j: j0, d: 0 }; t.receiver = { i: r[0], j: r[1] }; t.mirrors = mirrors.map((q) => ({ i: q.i, j: q.j, s: q.s }));
    // spoil it: turn some of the mirrors the wrong way, then see that the beam does not get there as it stands
    const flips = 1 + pick(rng, k);
    const order = mirrors.map((_, x) => x).sort(() => rng() - 0.5).slice(0, flips);
    for (const x of order) t.mirrors[x].s = 1 - t.mirrors[x].s;
    if (!trace(t).hit) return true;
  }
  return false;
}

/** what stands solid on the floor: the lamp, the receiver and every mirror (the hero and the foes walk round them; a ram that meets one turns it) */
export function solidsOf(t) {
  const at = (i, j, h) => { const [x, z] = cellWorld(t, i, j); return { x, z, r: MIRRORS.solidR, h }; };
  return [at(t.source.i, t.source.j, 3), at(t.receiver.i, t.receiver.j, 3), ...t.mirrors.map((q) => at(q.i, q.j, 2.6))];
}

export const mirrors = {
  init(t, ctx) {
    t.w = t.w ?? MIRRORS.w; t.h = t.h ?? MIRRORS.h;
    const k = t.k ?? 3;
    if (!t.source) { if (!generate(t, ctx.rng, k)) throw new Error('mirrors: no puzzle found'); }
    t.cd = t.mirrors.map(() => 0); t.spent = 0; t.turns = 0; t.state = 'idle'; t.beam = trace(t); t.par = solveMirrors(t).n;
  },

  step(t, dt, ctx) {
    const M = MIRRORS, p = ctx.p;
    t.t += dt;
    if (t.state === 'solved') return;
    if (t.state === 'idle') { if (hyp(p.x - t.x, p.z - t.z) < M.wake) t.state = 'active'; else return; }
    for (let k = 0; k < t.mirrors.length; k++) t.cd[k] = Math.max(0, t.cd[k] - dt);
    newRam(t, p);
    if (p.chargeT <= 0) return;
    // a ram turns the one mirror it meets, once: of the ones in its reach, the nearest to him. (The button held down does not spin it, and a ram that has turned one is spent: it does not turn the next.)
    if (t.spent === t.ramId) return;
    let best = -1, bestD = Infinity, bx = 0, bz = 0;
    for (let k = 0; k < t.mirrors.length; k++) {
      const q = t.mirrors[k];
      if (t.cd[k] > 0) continue;
      const [wx, wz] = cellWorld(t, q.i, q.j);
      if (!p.chargeHits(wx, (t.y || 0) + 0.9, wz, M.r)) continue;
      const d = hyp(wx - p.x, wz - p.z);
      if (d < bestD) { bestD = d; best = k; bx = wx; bz = wz; }
    }
    if (best >= 0) {
      const k = best, q = t.mirrors[k];
      q.s = 1 - q.s; t.cd[k] = M.cd; t.spent = t.ramId; t.turns++;
      t.beam = trace(t);
      ctx.emit('turn_mirror', { by: t, i: k, s: q.s, hit: t.beam.hit, x: bx, z: bz });
      if (t.beam.hit) { t.state = 'solved'; ctx.emit('solved', { by: t }); }
    }
  },

  hud(t) { return t.state === 'active' ? { text: t.beam.hit ? 'THE BEAM IS TRUE' : 'TURN THE MIRRORS WITH A RAM', n: t.turns, of: t.par } : null; },
  targets() { return []; },
};
