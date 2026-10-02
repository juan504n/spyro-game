// The SITUATIONS a goal can stand in. The original games put their portals and goals in a different kind of place each time (beside the landing, up a tower, in a dragon's mouth, in a cave on a
// platform, behind a waterfall, at the end of a maze...): never five alike on a ring. A brief says which situation each of its goals is in, and tools/realm-check.mjs asks the built world whether
// the goal really stands in it - so "an island goal" is one with water all round it, "a glide goal" one the hero can only get to by gliding from higher ground, and so on.
//
// check(goal, env) -> { ok, detail }; `env` is what the checker has built (tools/realm-check.mjs):
//   grid, collision, gp, level, ctx (the dry ctx), massifs, h(x, z),
//   walk (a flood from the spawn with every cracked wall broken, the gate open and jumps allowed: tools/walkmap.mjs), walkShut (the same as things stand: walls whole, the gate shut)
import { WATER_LEVEL } from '../level.js';
import { SITUATION_IDS } from './brief.js';

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : String(v));

/**
 * How far a glide carries the hero from a standing start `drop` metres above where he lands (negative: the landing is higher): the run-up of a jump (11.5 m/s for the 0.38 s to its 2.9 m
 * apex), then the glide (13.5 m/s forward, falling 3.1 m/s). The numbers are Player's constants (player.js); 0 when the jump does not even reach the landing.
 */
export function glideReach(drop) {
  const t = (drop + 2.9) / 3.1;
  return t <= 0 ? 0 : 4.4 + 13.5 * t;
}
/** a margin on that: the hero is a person with a thumb, not a ballistic curve */
export const GLIDE_MARGIN = 0.75;

export const SITUATIONS = {
  landing: {
    doc: 'close to where the hero arrives: the first goal, in sight of the start, where he learns what a goal is',
    check(g, e) {
      const d = e.walk.distNear(g.x, g.z, 3, g.y);
      return { ok: d < 140, detail: `${f1(d)} m of walking from the start (under 140)` };
    },
  },

  clearing: {
    doc: 'in a clearing off the road: level open ground ringed by trees and rocks, a short detour from the way',
    check(g, e) {
      const slope = e.grid.slopeAt(g.x, g.z);
      let pd = Infinity;                                               // (metres from the nearest road's edge; the grid's own distance field only reaches a few metres)
      for (const p of e.grid.paths) for (const q of p.pts) pd = Math.min(pd, Math.hypot(q[0] - g.x, q[2] - g.z) - p.width / 2);
      let ring = 0;
      for (const p of e.gp.placed) if (/tree|pine|rock|boulder|spire|crystal|ice|stone/.test(p.name) && Math.hypot(p.x - g.x, p.z - g.z) < 24) ring++;
      const d = e.walk.distNear(g.x, g.z, 3, g.y);
      return { ok: slope < 0.3 && pd > 3 && pd < 45 && ring >= 4 && d < Infinity, detail: `slope ${slope.toFixed(2)}, ${f1(pd)} m off the road, ${ring} trees and rocks within 24 m, ${f1(d)} m of walking` };
    },
  },

  island: {
    doc: 'out on the water: a shrine on an islet, reached by stepping stones or a glide',
    check(g, e) {
      let wet = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        for (const r of [7, 10, 14]) if (e.h(g.x + Math.cos(a) * r, g.z + Math.sin(a) * r) < WATER_LEVEL - 0.3) { wet++; break; }
      }
      const d = e.walk.distNear(g.x, g.z, 3, g.y);
      return { ok: wet >= 5, detail: `water in ${wet} of 8 directions within 14 m, ${f1(d)} m of walking (Infinity: only by gliding)` };
    },
  },

  summit: {
    doc: 'on top: the highest ground for 60 m round, well above the start, at the end of a long climb',
    check(g, e) {
      let top = -Infinity;
      for (let r = 0; r <= 60; r += 6) for (let k = 0; k < 12; k++) { const a = (k * Math.PI) / 6; top = Math.max(top, e.h(g.x + Math.cos(a) * r, g.z + Math.sin(a) * r)); }
      const up = g.y - e.gp.spawn.y, d = e.walk.distNear(g.x, g.z, 6, g.y - 1);
      return { ok: g.y >= top - 1 && up >= 18 && d > 150, detail: `${f1(up)} m above the start, the highest ground within 60 m is ${f1(top)}, ${f1(d)} m of walking` };
    },
  },

  cave: {
    doc: 'inside the rock: a tunnel or a chamber under a roof, lit by crystals and torches, behind something (a waterfall, a door of ice)',
    check(g, e) {
      // (under the roof of a rock mass: right over the goal, or all round it - a skylight over the goal itself, the light pouring down on it, still leaves it in a chamber)
      const roofedAt = (q, x, z) => q.inBoxXZ(x, z) && q.roofed(x, g.y, z, 3);
      const ring = (q) => Array.from({ length: 8 }, (_, k) => roofedAt(q, g.x + Math.cos((k / 8) * Math.PI * 2) * 4.5, g.z + Math.sin((k / 8) * Math.PI * 2) * 4.5)).filter(Boolean).length;
      const m = e.massifs.find((q) => roofedAt(q, g.x, g.z) || ring(q) >= 6);
      const d = e.walk.distNear(g.x, g.z, 3, g.y);
      return { ok: !!m && d < Infinity, detail: m ? `under the roof of '${m.id}', ${f1(d)} m of walking` : 'not under any rock mass' };
    },
  },

  glide: {
    doc: 'across a gap: a ledge or shelf the hero reaches by gliding from higher ground (it may have a long way round on foot, never a short one; with no way on foot at all it must have a way off by a glide)',
    check(g, e) {
      const foot = e.walk.distNear(g.x, g.z, 3, g.y);
      let best = null;
      e.walk.each((x, y, z) => {
        const gap = Math.hypot(x - g.x, z - g.z);
        if (gap < 10) return;
        const drop = y - g.y;
        if (gap > glideReach(drop) * GLIDE_MARGIN) return;
        const dFoot = e.walk.dist(x, z, y);
        if (!best || gap < best.gap) best = { x, y, z, gap, drop, dFoot };
      });
      if (!best) return { ok: false, detail: 'no ledge to glide from within reach' };
      const detour = foot === Infinity ? Infinity : foot - best.dFoot;
      // a way off: a shelf with no way on foot is no trap - ground of the walkable country lower than the goal, 10 m or more off, within reach of a glide from it (a hero who falls in the lava
      // comes back to the last firm ground, which is the shelf: from there he must be able to glide on)
      let off = null;
      if (foot === Infinity) {
        e.walk.each((x, y, z) => {
          const gap = Math.hypot(x - g.x, z - g.z), drop = g.y - y;
          if (gap < 10 || drop < 1 || y < WATER_LEVEL + 0.6 || gap > glideReach(drop) * GLIDE_MARGIN) return;                // (dry ground: not the shallows of the lava)
          if (!off || gap < off.gap) off = { x, y, z, gap, drop };
        });
      }
      const way = foot === Infinity ? (off ? `; off again by a glide to (${f1(off.x)}, ${f1(off.y)}, ${f1(off.z)}): ${f1(off.gap)} m across, ${f1(off.drop)} m down` : '; NO WAY OFF the shelf by a glide') : '';
      return { ok: (foot === Infinity || detour > 2.2 * best.gap + 40) && (foot !== Infinity || !!off), detail: `launch from (${f1(best.x)}, ${f1(best.y)}, ${f1(best.z)}): ${f1(best.gap)} m across, ${f1(best.drop)} m down; ${foot === Infinity ? 'no way on foot' : `${f1(detour)} m more on foot than from the launch`}${way}` };
    },
  },

  puzzle: {
    doc: 'sealed until something is done: a cracked wall to charge, a gate that opens when others are lit',
    check(g, e) {
      const shut = e.walkShut.distNear(g.x, g.z, 3, g.y), open = e.walk.distNear(g.x, g.z, 3, g.y);
      return { ok: shut === Infinity && open < Infinity, detail: `${f1(shut)} m of walking while it is shut, ${f1(open)} m once the walls are broken and the gate is open` };
    },
  },

  crater: {
    doc: 'in a bowl: the floor is lower than the rim all round, the way in is a gorge or a road down, and it is guarded',
    check(g, e) {
      let high = 0;
      for (let k = 0; k < 16; k++) { const a = (k * Math.PI) / 8; if (e.h(g.x + Math.cos(a) * 30, g.z + Math.sin(a) * 30) > g.y + 4) high++; }
      const guards = e.gp.enemies.filter((q) => Math.hypot(q.x - g.x, q.z - g.z) < 30).length;
      return { ok: high >= 11 && guards >= 2, detail: `the rim is higher than the floor by 4 m in ${high} of 16 directions at 30 m, ${guards} Snuffers within 30 m` };
    },
  },
};

for (const id of SITUATION_IDS) if (!SITUATIONS[id]) throw new Error(`situation '${id}' has no check`);
