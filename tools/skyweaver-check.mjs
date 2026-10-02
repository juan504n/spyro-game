// The checks of SKYWEAVER SPIRES: every rule of tools/realm-check.mjs (tools/lib/realm-rules.mjs has them all) and whatever is this realm's own, which goes below. No dev server needed:
//   node tools/skyweaver-check.mjs
import { checkRealm } from './lib/realm-rules.mjs';
import { SLOPE_WALK } from '../src/game/collision.js';
import { WATER_LEVEL } from '../src/game/level.js';
import { radiusAt, apexOf } from '../src/game/realm/whirl.js';
import { BRIEF, REGIONS, ROWS, LONELY, LOOM, WHIRLS } from '../src/game/skyweaver/brief.js';
import { SKY_ENVIRONMENT } from '../src/game/skyweaver/environment.js';
import { rowSlabs, lonelySlabs } from '../src/game/skyweaver/layout.js';
import { TRAVEL_PLACES } from '../src/game/skyweaver/travel.js';
import { findTravelPlaces } from './realm-travel.mjs';
import { DOORS } from '../src/game/home/level.js';

const { failed, env, W } = checkRealm('skyweaver', { log: (l) => console.log(l) });
let own = 0;
const check = (name, ok, detail) => { if (!ok) own++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const f1 = (v) => v.toFixed(1);

// ---- this realm's own checks (env: grid, collision, gp, level, ctx, walk, walkShut, foot, air, h) -----------------------------------------------------------------------
{
  const { grid, collision, gp, level, foot, air, h } = env;

  // the country is a SEA of cloud: the level says so, draws it with the cloud's own surface, and under it there is nothing the hero could wade on - the ground that is not an island lies 20 m or more
  // down, and where it climbs to an island's edge it is too steep to stand on (what falls in is set back on the last firm ground; the cloud cannot hold anyone)
  {
    let shelf = [], n = 0;
    const nrm = [0, 1, 0];
    for (let x = -216; x <= 216; x += 4) for (let z = -216; z <= 216; z += 4) {
      const y = h(x, z);
      if (y >= WATER_LEVEL - 0.3 || y < WATER_LEVEL - 20) continue;
      n++;
      grid.normalAt(x, z, nrm);
      if (nrm[1] >= SLOPE_WALK) shelf.push(`${x},${z}(${f1(y)})`);
    }
    check('the sea of cloud is a sea: the level has one, drawn with the cloud\'s surface, and in the first 20 m under it there is no ground gentle enough to stand on', !!level.sea && level.liquid && level.liquid.texture === 'cloud_sea' && n > 100 && shelf.length === 0, `(${n} cells of cliff under the surface, ${shelf.length} gentle${shelf.length ? `: ${shelf.slice(0, 4).join(' ')}` : ''}; sea '${level.sea && level.sea.name}')`);
    const floor = Math.min(...[...Array(61)].flatMap((_, i) => [...Array(61)].map((__, j) => h(-216 + i * 7.2, -216 + j * 7.2))));
    check('... and the fill under it is deep (the lowest ground of the world is 25 m or more under the surface)', floor <= WATER_LEVEL - 25, `(${f1(floor)})`);
  }

  // the way up is by air: the start's own ground, on foot, is the Skygate, the row of slabs, the Cloud Islet and the lonely slab; every other island is reached by a glide or a whirlwind, never walked
  {
    const walked = REGIONS.filter((R) => foot.distNear(R.pts[0][0], R.pts[0][1], Math.min(6, R.pts[0][3] * 0.4), R.pts[0][2]) < Infinity).map((R) => R.id);
    check('on foot from the start he can reach the Skygate and the Cloud Islet and no other island (the rest is a glide or a whirlwind away)', walked.join() === 'skygate,cloudisle', `(${walked.join(', ')})`);
    const kinds = air.links.filter((E) => E.active).map((E) => E.kind).sort();
    check('the journey is two glides and four rides, in a spiral up round the Loom', kinds.join() === 'glide,glide,lift,lift,lift,lift', `(${kinds.join(', ')})`);
  }

  // the slabs: every hop is a fair one - a gap of 2 to 4.6 m between the edges (the controller's own jump is 8.7 m at a run), the slab at least 4.6 m across, a step in height of 0.9 m at most - and each
  // has a gem over it (the way across is shown); the world places exactly the slabs the rows say
  {
    const rows = [...ROWS.map((r) => ({ id: r.id, from: r.from, to: r.to, slabs: rowSlabs(r) }))];
    const lone = lonelySlabs();
    const problems = [];
    let total = 0;
    for (const row of rows) {
      const seq = [{ x: row.from[0], z: row.from[1], y: row.from[2], r: 0 }, ...row.slabs, { x: row.to[0], z: row.to[1], y: row.to[2], r: 0 }];
      for (let i = 1; i < seq.length; i++) {
        const a = seq[i - 1], b = seq[i], gap = Math.hypot(b.x - a.x, b.z - a.z) - a.r - b.r, step = Math.abs(b.y - a.y);
        if (gap < 2.0 || gap > 4.6) problems.push(`${row.id} hop ${i}: a gap of ${f1(gap)} m`);
        if (step > 0.9) problems.push(`${row.id} hop ${i}: a step of ${f1(step)} m`);
      }
      for (const s of row.slabs) { total++; if (s.r < 2.3) problems.push(`${row.id}: a slab of radius ${f1(s.r)}`); }
    }
    const row0 = rowSlabs(ROWS[0])[LONELY.from - 1];
    const chain = [row0, ...lone];
    for (let i = 1; i < chain.length; i++) { const gap = Math.hypot(chain[i].x - chain[i - 1].x, chain[i].z - chain[i - 1].z) - chain[i - 1].r - chain[i].r; if (gap < 2.0 || gap > 4.6) problems.push(`lonely slab hop ${i}: a gap of ${f1(gap)} m`); }
    const placed = gp.placed.filter((p) => p.name === 'sky_slab');
    total += lone.length;
    check('every hop across the cloud is a fair one: a gap of 2 to 4.6 m, a slab 4.6 m across or more, a step of 0.9 m or less', problems.length === 0, problems.slice(0, 4).join('; ') || `(${total} slabs in ${rows.length + 1} rows)`);
    check('the world places exactly the slabs the rows and the lonely branch say', placed.length === total, `(${placed.length} placed, ${total} in the rows)`);
    const bare = placed.filter((s) => !gp.gems.some((g) => Math.hypot(g.x - s.x, g.z - s.z) < 1.6 && g.y > s.y + 0.5 && g.y < s.y + 2.2));
    check('... and each slab has a gem over it, but the lonely slab, which has the chest', bare.length <= 1, bare.map((s) => `${f1(s.x)},${f1(s.z)}`).join(' '));
  }

  // the whirlwinds: three, the shaft of each is clear (no rock or prop across the column from its foot to its top, or the ride would carry him into it), and its top is above the ground it glides on to
  {
    const bad = [];
    for (const w of gp.whirlwinds || []) {
      const top = apexOf(w);
      for (let y = w.y0 + 1; y <= top; y += 2) {
        const r = radiusAt(w, y) + 0.6;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2, x = w.x + Math.cos(a) * r, z = w.z + Math.sin(a) * r;
          if (h(x, z) > y - 0.5 || collision.blocking(x, y, z, 0.4)) { bad.push(`${w.id}@${f1(y)}`); break; }
        }
        if (bad.length && bad[bad.length - 1].startsWith(w.id)) break;
      }
    }
    check('the shaft of every whirlwind is clear from its foot to its top (nothing across the column to carry him into)', (gp.whirlwinds || []).length === WHIRLS.length && bad.length === 0, bad.join(' ') || `(${(gp.whirlwinds || []).map((w) => `${w.id} ${f1(w.h)} m`).join(', ')})`);
    const tops = (gp.whirlwinds || []).map((w) => apexOf(w) - w.y0);
    check('and each is a tall one: a column of 30 m or more (the ride is the way up, not a hop)', tops.length === 3 && Math.min(...tops) >= 30, `(${tops.map(f1).join(', ')})`);
  }

  // the Loom is in sight from the first step: nothing between the start and the crown of the tower rises over the line of sight
  {
    const sp = gp.spawn, eye = { x: sp.x, y: sp.y + 1.8, z: sp.z }, crown = { x: LOOM.x, y: h(LOOM.x, LOOM.z) + 38, z: LOOM.z };
    let worst = Infinity;
    const L = Math.hypot(crown.x - eye.x, crown.z - eye.z);
    for (let d = 8; d < L - 8; d += 4) {
      const t = d / L, x = eye.x + (crown.x - eye.x) * t, z = eye.z + (crown.z - eye.z) * t, y = eye.y + (crown.y - eye.y) * t;
      worst = Math.min(worst, y - h(x, z));
    }
    check('the Loom\'s crown is in sight from the start (no island rises over the line to it)', worst > 3 && gp.placed.some((p) => p.name === 'loom_tower'), `(the line clears the ground by ${f1(worst)} m at the nearest, ${f1(L)} m away)`);
  }

  // the goals are Windbells (the realm's own goal model), the last one the big Loom Bell
  {
    const wrong = BRIEF.goals.filter((g, i) => g.model !== 'windbell' || !!g.big !== (i === BRIEF.goals.length - 1));
    check('every goal is a Windbell, the last the big Loom Bell', wrong.length === 0, wrong.map((g) => g.id).join(' '));
  }

  // the sky is the realm's own: both moods carry rose-gold and white clouds and their own faint mist hills (sky.js), the sun low behind the hero as he climbs
  const [A, B] = SKY_ENVIRONMENT.sky;
  check('both skies paint their own clouds and distant hills (the vale\'s lavender would be wrong above the cloud)', [A, B].every((s) => s.cloudTop && s.cloudBot && s.ridge), '');

  // the places of the TRAVEL menu are what the generator finds now (a change to the layout that was not followed by `node tools/realm-travel.mjs skyweaver` shows here)
  {
    const canon = (groups) => groups.map((q) => `${q.name}: ${q.places.map((p) => [p.id, p.name, p.x, p.z, p.y ?? '', p.yaw, !!p.opens, !!p.shelf].join('|')).join(' ')}`).join('\n');
    const now = findTravelPlaces('skyweaver'), a = canon(now.entry.groups), b = canon(TRAVEL_PLACES.groups);
    const diff = a.split('\n').map((l, i) => [l, b.split('\n')[i]]).filter(([x, y]) => x !== y).map(([x]) => x.slice(0, 60));
    check('the TRAVEL places are current (node tools/realm-travel.mjs skyweaver)', now.problems.length === 0 && a === b, now.problems.join('; ') || (diff.length ? `(differs: ${diff.join(' / ')})` : ''));
  }
  // Dawnhaven's door to the realm is awake
  check('Dawnhaven\'s Skyweaver door is awake and leads here', DOORS.find((d) => d.id === 'skyweaver').target === level.brief.id, '');
  void W;
}

console.log(failed.length + own ? `\n${failed.length + own} FAILED` : '\nall checks passed');
process.exitCode = failed.length + own ? 1 : 0;
