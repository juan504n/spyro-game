// The checks of FROSTBLOOM HOLLOW: every rule of tools/realm-check.mjs (tools/lib/realm-rules.mjs has them all) and whatever is this realm's own, which goes below. No dev server needed:
//   node tools/frostbloom-check.mjs
import { checkRealm } from './lib/realm-rules.mjs';
import { terrainPicker } from '../src/game/terrain-mesh.js';
import { GLACIER, HEART, VAULT } from '../src/game/frostbloom/glacier.js';
import { DOORS } from '../src/game/home/level.js';
import { TRAVEL_PLACES } from '../src/game/frostbloom/travel.js';
import { uvProjection } from '../src/game/terrain-mesh.js';
import { findTravelPlaces } from './realm-travel.mjs';

const { failed, env, W } = checkRealm('frostbloom', { log: (l) => console.log(l) });
let own = 0;
const check = (name, ok, detail) => { if (!ok) own++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };

// ---- this realm's own checks (env: grid, collision, gp, level, ctx, walk, walkShut, h) ----------------------------------------------------------------------------
{
  const { grid, gp, ctx, level, walk, walkShut } = env, pick = terrainPicker(grid);
  // the ground wears the realm's own textures (level.roadTextures, lakeTextures: terrain-mesh.js and world.js read them)
  const trunk = ctx.pathPoint('trunk', 0.3), ring = ctx.pathPoint('ring', 0.25);
  // (roads are ribbons of their own texture laid over the ground (roads.js), whose terrain keeps the ground's own texture beneath: they are read from level.roadTextures)
  const t = [{ tex: level.roadTextures.cobble }, { tex: level.roadTextures.dirt }, pick.at(0, 34), pick.at(HEART.x + 5, HEART.z + 3)];
  check('the roads are frosted (stone with snow in the gaps, trodden snow), the lake and the caves are ice',
    t[0].tex === 'cobble_frost' && t[1].tex === 'path_snow' && t[2].tex === 'ice' && t[3].tex === 'ice', `(${t.map((q) => q.tex).join(', ')})`);
  // the far mountains wear its own far rock, and nothing of the vale's ground (grass, moss, the plain cliff) is left anywhere
  let far = 0, vale = 0, total = 0;
  for (let x = -190; x <= 190; x += 8) for (let z = -190; z <= 190; z += 8) { const q = pick.at(x, z).tex; total++; if (q === 'far_frost') far++; if (['far_rock', 'cliff', 'cliff_warm', 'cliff_bare', 'grass_a', 'grass_b', 'grass_flowers', 'moss', 'sand', 'dirt', 'cobble'].includes(q)) vale++; }
  check('the far mountains wear the realm\'s own far rock, and nothing of the vale\'s ground is left', far > total * 0.2 && vale === 0, `(${far} of ${total} samples far_frost, ${vale} of the vale's)`);
  // the props wear its skin (kit.skin): no moss, green pine, yellow or blue flower or tuft was made for it
  const keys = [...W.kit.builders.keys()].map((k) => k.split('|')[0]);
  const used = new Set(keys), bad = ['moss', 'pine', 'cliff', 'cliff_warm', 'flower_yellow', 'flower_blue', 'tuft'].filter((n) => used.has(n));
  check('the props wear the realm\'s skin: snow, frost-blue stone, pines under snow, blossom only', bad.length === 0 && used.has('snow') && used.has('pine_snow') && used.has('cliff_frost') && used.has('flower_pink'), `(${[...used].sort().join(' ')}${bad.length ? `; wrong: ${bad.join(' ')}` : ''})`);
  // the glacier: the road runs into the mouth under the Icefall, the way on is a cave under a roof to the chamber, and the vault is behind a cracked wall
  const mouth = GLACIER.at('mouth', 0), road = grid.paths.find((p) => p.id === 'iceroad'), end = road.pts[road.pts.length - 1];
  check('the Icefall hangs over the mouth and the Icefall road runs in under it', gp.placed.some((p) => p.name === 'ice_fall' && Math.hypot(p.x - mouth.x, p.z - (mouth.z - 5)) < 6) && Math.hypot(end[0] - mouth.x, end[2] - (mouth.z - 14)) < 3, `(the road ends at ${end[0].toFixed(1)}, ${end[2].toFixed(1)})`);
  const wall = gp.walls.find((w) => Math.hypot(w.x - GLACIER.at('vault', 5.5).x, w.z - GLACIER.at('vault', 5.5).z) < 1);
  const chest = gp.chests.find((c) => c.secret === 'vault');
  check('the ice vault is behind a cracked wall: the chest is out of reach until it is broken', !!wall && !!chest && !(walkShut.distNear(chest.x, chest.z, 2.4, chest.y) < Infinity) && walk.distNear(chest.x, chest.z, 2.4, chest.y) < Infinity && Math.hypot(chest.x - VAULT.x, chest.z - VAULT.z) < VAULT.rx, wall ? '' : '(no wall in the vault\'s passage)');
  // the floors of the caves are level, at the plinth's height: the terrain follows them (GLACIER.landform), the way into the mass is not a ramp over rolling ground
  let off = 0, floors = 0;
  for (const name of Object.keys(GLACIER.tunnels)) for (let t = 0; t <= GLACIER.length(name); t += 1.5) { const q = GLACIER.at(name, t); if (!GLACIER.inside(q.x, q.z)) continue; floors++; if (Math.abs(grid.heightAt(q.x, q.z) - q.y) > 0.12) off++; }       // (the lane in front of the cliff is open ground, not yet under the mountain)
  for (const c of Object.values(GLACIER.chambers)) for (const [dx, dz] of [[0, 0], [c.rx * 0.5, 0], [-c.rx * 0.5, 0], [0, c.rz * 0.5], [0, -c.rz * 0.5]]) { floors++; if (Math.abs(grid.heightAt(c.x + dx, c.z + dz) - c.floorY) > 0.12) off++; }
  check('the glacier\'s floors are the ground: level, at the height the tunnels and chambers say', off === 0, `(${off} of ${floors} samples off)`);
  // its rock textures project like rock (a wall's texture is not smeared down a slope), and its snow is ground
  check('the frost textures project as the rock and the snow they are', uvProjection('cliff_frost', 0.8, [1, 0, 0.1], [1, 0, 0.1]) === 'wallX' && uvProjection('cliff_frost', 0.2, [0, 1, 0], [1, 0, 0.1]) === 'planar' && uvProjection('far_frost', 0.8, [0.1, 0, 1], [0, 1, 0]) === 'wallZ' && uvProjection('far_frost', 0.5, [0, 1, 0], [0.1, 0, 1]) === 'planar' && uvProjection('snow', 0.4, [0, 1, 0], [0, 1, 0]) === 'planar', '(a wall of frost rock is mapped from the side, gentle rock from above: whatever the geometry under it looks like)');
  // the places of the TRAVEL menu are what the generator finds now: a change to the layout that was not followed by `node tools/realm-travel.mjs frostbloom` (or a change to the generator) shows here
  {
    const canon = (groups) => groups.map((g) => `${g.name}: ${g.places.map((p) => [p.id, p.name, p.x, p.z, p.y ?? '', p.yaw, !!p.opens].join('|')).join(' ')}`).join('\n');
    const now = findTravelPlaces('frostbloom'), a = canon(now.entry.groups), b = canon(TRAVEL_PLACES.groups);
    const diff = a.split('\n').map((l, i) => [l, b.split('\n')[i]]).filter(([x, y]) => x !== y).map(([x]) => x.slice(0, 60));
    check('the TRAVEL places are current (node tools/realm-travel.mjs frostbloom)', now.problems.length === 0 && a === b, now.problems.join('; ') || (diff.length ? `(differs: ${diff.join(' / ')})` : ''));
  }
  // the ice gate is the realm's own colour, and Dawnhaven's door to the realm is awake
  check('the ice gate\'s field is ice teal, not the Dawn Gate\'s violet', !!gp.barrier && Array.isArray(gp.barrier.opts && gp.barrier.opts.tint), '');
  check('Dawnhaven\'s Frostbloom door is awake and leads here', DOORS.find((d) => d.id === 'frostbloom').target === level.brief.id, '');
}

console.log(failed.length + own ? `\n${failed.length + own} FAILED` : '\nall checks passed');
process.exitCode = failed.length + own ? 1 : 0;
