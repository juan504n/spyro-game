// The checks of EMBERFALL CRAGS: every rule of tools/realm-check.mjs (tools/lib/realm-rules.mjs has them all) and whatever is this realm's own, which goes below. No dev server needed:
//   node tools/emberfall-check.mjs
import { checkRealm } from './lib/realm-rules.mjs';
import { terrainPicker } from '../src/game/terrain-mesh.js';
import { generateWorldTextures } from '../src/engine/textures/world.js';
import { SMELTER, FURNACE, LEDGE, PLINTH } from '../src/game/emberfall/smelter.js';
import { ANVIL, LAKE, CALDERA } from '../src/game/emberfall/brief.js';
import { EMBER_ENVIRONMENT } from '../src/game/emberfall/environment.js';
import { MAW } from '../src/game/emberfall/layout.js';
import { DOORS } from '../src/game/home/level.js';
import { WATER_LEVEL } from '../src/game/level.js';
import { TRAVEL_PLACES } from '../src/game/emberfall/travel.js';
import { findTravelPlaces } from './realm-travel.mjs';

const { failed, env, W } = checkRealm('emberfall', { log: (l) => console.log(l) });
let own = 0;
const check = (name, ok, detail) => { if (!ok) own++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };

// ---- this realm's own checks (env: grid, collision, gp, level, ctx, walk, walkShut, h) ----------------------------------------------------------------------------
{
  const { grid, gp, ctx, level, walk, walkShut, h } = env, pick = terrainPicker(grid), goal = (id) => gp.beacons.find((b) => b.id === id);
  // the ground wears the realm's own textures: scorched roads, a lake bed of cinder, the far mountains in their own rock, and nothing of the vale's ground
  const trunk = ctx.pathPoint('trunk', 0.3), ash = ctx.pathPoint('ashway', 0.4);
  const t = [pick.at(trunk.x, trunk.z).tex, pick.at(ash.x, ash.z).tex, pick.at(FURNACE.x + 4, FURNACE.z + 3).tex];
  check('the roads are scorched (basalt cobbles with embers in the gaps, trodden ash) and the Furnace floor is cinder', t[0] === 'cobble_ember' && t[1] === 'path_ash' && t[2] === 'cinder', `(${t.join(', ')})`);
  let far = 0, vale = 0, total = 0;
  for (let x = -190; x <= 190; x += 8) for (let z = -190; z <= 190; z += 8) { const q = pick.at(x, z).tex; total++; if (q === 'far_ember') far++; if (['far_rock', 'cliff', 'cliff_warm', 'cliff_bare', 'cliff_warm_bare', 'grass_a', 'grass_b', 'grass_flowers', 'moss', 'sand', 'dirt', 'cobble', 'flagstone', 'shore_pebbles', 'snow'].includes(q)) vale++; }
  check('the far mountains wear the realm\'s own far rock, and nothing of the vale\'s ground is left', far > total * 0.2 && vale === 0, `(${far} of ${total} samples far_ember, ${vale} of the vale's)`);
  // the props wear its skin (kit.skin): no moss, green pine, yellow or blue flower or tuft, no plain cliff with a lip, was made for it
  const keys = [...W.kit.builders.keys()].map((k) => k.split('|')[0]), used = new Set(keys);
  const bad = ['moss', 'pine', 'cliff', 'cliff_warm', 'flower_yellow', 'flower_blue', 'tuft'].filter((n) => used.has(n));
  check('the props wear the realm\'s skin: ash, bare basalt, fire lilies only', bad.length === 0 && used.has('ash') && used.has('cliff_basalt_bare') && used.has('flower_ember') && used.has('crystal_ember'), `(${[...used].sort().join(' ')}${bad.length ? `; the vale's: ${bad.join(' ')}` : ''})`);
  check('the standing stones\' runes burn orange (the skin\'s rune tint), not the Lantern Keepers\' violet', Array.isArray(level.brief.theme.skin.palettes.rune) && level.brief.theme.skin.palettes.rune[0] > level.brief.theme.skin.palettes.rune[2], '');

  // the Ember Rift is lava: the lake is drawn with the lava texture, burns at a touch, and its middle is far under the burning depth - except the stack, a level crown of rock to land on
  const lq = level.liquid, have = generateWorldTextures();
  check('the lake is lava: a liquid that burns at a touch, with a texture the game has', !!lq && lq.splash === 'lava' && lq.burnDepth > 0 && lq.burnDepth < 0.5 && !!have[lq.texture], `(${lq ? `${lq.texture}, burns from ${lq.burnDepth} m` : 'water'})`);
  // (the walk map takes the lava's burning depth from the descriptor, as the player does: the shallows of the rift are not ground a hero stands on)
  let lowest = Infinity; walk.each((x, y, z) => { if (y < lowest) lowest = y; });
  check('the walk map keeps the hero out of the burning lava: no walkable ground lower than the burning depth', lowest >= WATER_LEVEL - lq.burnDepth - 0.05, `(the lowest ground he can stand on: ${lowest.toFixed(2)} m, lava burns from ${(WATER_LEVEL - lq.burnDepth).toFixed(2)} m)`);
  // (and the lava hisses: a bed of fire noise over the rift, three loops)
  const hiss = gp.soundSources.filter((q) => q.name === 'flame_loop');
  check('the lava hisses: three quiet fire loops over the length of the rift', hiss.length === 3 && hiss.every((q) => Math.abs(q.x - LAKE.x) < LAKE.rx && Math.abs(q.z - LAKE.z) < LAKE.rz && q.vol <= 0.3), `(${hiss.length} loops)`);
  let wet = 0, deep = 0;
  for (let a = 0; a < 24; a++) for (const f of [0.35, 0.6, 0.8]) { const x = LAKE.x + Math.cos((a / 24) * Math.PI * 2) * LAKE.rx * f, z = LAKE.z + Math.sin((a / 24) * Math.PI * 2) * LAKE.rz * f; if (Math.hypot(x - ANVIL.x, z - ANVIL.z) < ANVIL.r * 1.3) continue; wet++; if (h(x, z) < WATER_LEVEL - lq.burnDepth - 0.5) deep++; }
  check('the rift is lava from bank to bank: its middle is under the burning depth everywhere except the stack', deep >= wet * 0.97, `(${deep} of ${wet} samples)`);
  const g = goal('anvil'); let lo = Infinity, hi = -Infinity;
  for (let a = 0; a < 12; a++) for (const r of [0, 3, 5]) { const q = h(g.x + Math.cos((a / 12) * Math.PI * 2) * r, g.z + Math.sin((a / 12) * Math.PI * 2) * r); lo = Math.min(lo, q); hi = Math.max(hi, q); }
  check('the stack is a level crown of rock (within 5 m of the Anvil Stone the ground varies under 0.6 m) high over the lava', hi - lo < 0.6 && g.y > 10 && walk.distNear(g.x, g.z, 3, g.y) === Infinity, `(${lo.toFixed(2)}..${hi.toFixed(2)} m, ${g.y.toFixed(1)} m up, no way on foot)`);

  // the Maw: a stone dragon's mouth over the mouth of the cave with the ward of fire in it; shut, the mountain (the Furnace, the gorge, the caldera) cannot be walked into, open it can
  const mouth = SMELTER.at('maw', 0), mawProp = gp.placed.find((p) => p.name === 'dragon_maw');
  check('the dragon\'s Maw stands in front of the tunnel and the ward of fire shuts its mouth', !!mawProp && Math.hypot(mawProp.x - MAW.x, mawProp.z - MAW.z) < 1 && Math.hypot(gp.barrier.x - mouth.x, gp.barrier.z - mouth.z) < 3 && Math.abs(gp.barrier.y - mouth.y) < 1.5 && Array.isArray(gp.barrier.opts.tint), `(ward at ${gp.barrier.x.toFixed(1)}, ${gp.barrier.z.toFixed(1)}, the tunnel begins at ${mouth.x}, ${mouth.z})`);
  const inside = ['smelter', 'heart'].map((id) => goal(id)), shut = inside.map((q) => walkShut.distNear(q.x, q.z, 3, q.y)), open = inside.map((q) => walk.distNear(q.x, q.z, 3, q.y));
  const outside = ['gate', 'grove'].map((id) => goal(id)), reach = outside.map((q) => walkShut.distNear(q.x, q.z, 3, q.y));
  check('the ward keeps the mountain shut: the Furnace and the Heartforge cannot be walked to until it opens, and the first goals can', shut.every((d) => d === Infinity) && open.every((d) => d < Infinity) && reach.every((d) => d < Infinity), `(shut ${shut.map((d) => (d === Infinity ? 'no' : d.toFixed(0))).join('/')}, open ${open.map((d) => d.toFixed(0)).join('/')}, the first goals ${reach.map((d) => d.toFixed(0)).join('/')} m)`);
  check('the ward opens after three Emberstones (the three of the open country: the stone by the gate, the grove and the stack)', level.brief.gate.at === 3 && level.goal.gateAt === 3, '');

  // the Smelter: floors level, at the height the tunnels and chambers say (the terrain follows them), the balcony 7 m over the Furnace with the secret in it
  let off = 0, floors = 0;
  const mouths = { maw: [6, 0], exit: [0, 10] };                 // (the first metres of the Maw and the last of the way out are the mouths: the ground eases into the floor there)
  for (const name of Object.keys(SMELTER.tunnels)) for (let s = (mouths[name] || [0, 0])[0]; s <= SMELTER.length(name) - (mouths[name] || [0, 0])[1]; s += 1.5) { const q = SMELTER.at(name, s); if (!SMELTER.inside(q.x, q.z)) continue; floors++; if (Math.abs(grid.heightAt(q.x, q.z) - q.y) > 0.25) off++; }
  for (const c of Object.values(SMELTER.chambers)) for (const [dx, dz] of [[0, 0], [c.rx * 0.5, 0], [-c.rx * 0.5, 0], [0, c.rz * 0.5], [0, -c.rz * 0.5]]) { floors++; if (Math.abs(grid.heightAt(c.x + dx, c.z + dz) - c.floorY) > 0.25) off++; }
  check('the Smelter\'s floors are the ground: level, at the height the tunnels and chambers say', off === 0, `(${off} of ${floors} samples off)`);
  const bal = gp.chests.find((c) => c.secret === 'balcony');
  check('the balcony is a little round room 7 m over the Furnace, with a chest in it that a hero who climbs the passage can reach', !!bal && Math.abs(bal.y - (FURNACE.floorY + 7)) < 0.6 && Math.hypot(bal.x - LEDGE.x, bal.z - LEDGE.z) < LEDGE.rx && walk.distNear(bal.x, bal.z, 2.4, bal.y) < Infinity, `(chest at ${bal ? bal.y.toFixed(1) : '?'} m, the Furnace's floor ${PLINTH} m)`);
  const wall = gp.walls[0], gl = gp.chests.find((c) => c.secret === 'ashglade');
  check('the ash glade is behind a cracked wall: the chest is out of reach until it is broken', !!wall && !!gl && !(walkShut.distNear(gl.x, gl.z, 2.4, gl.y) < Infinity) && walk.distNear(gl.x, gl.z, 2.4, gl.y) < Infinity, '');

  // the mountains are walls (country.js `mountain.margin`: a mountain stays a good way above the ribbon floor beside it, so the heroes cannot walk up a slope onto it): the ground over 30 m that he can stand on is the gorge and the caldera, nothing else
  {
    const gorge = Array.from({ length: 41 }, (_, i) => ctx.pathPoint('gorge', i / 40));
    let high = 0, stray = [];
    for (let x = -210; x <= 210; x += 6) for (let z = -210; z <= 210; z += 6) {
      const y = h(x, z);
      if (y < 30 || !(walk.distNear(x, z, 2.4, y) < Infinity)) continue;
      high++;
      if (!(Math.hypot(x - CALDERA.x, z - CALDERA.z) < CALDERA.r + CALDERA.wall + 8 || gorge.some((p) => Math.hypot(p.x - x, p.z - z) < 16))) stray.push(`${x},${z}`);
    }
    check('the mountains are walls: the only high ground (over 30 m) he can walk to is the gorge and the caldera', high > 20 && stray.length === 0, `(${high} walkable cells over 30 m, ${stray.length} elsewhere${stray.length ? `: ${stray.slice(0, 4).join(' ')}` : ''})`);
  }

  // the sky is the realm's own: both moods carry smoke-dark and ember-lit clouds and their own distant mountains (sky.js), the lights come from the west behind the hero as he walks east
  const [A, B] = EMBER_ENVIRONMENT.sky;
  check('both skies paint their own clouds and distant mountains (the vale\'s lavender would be wrong over ash)', [A, B].every((s) => s.cloudTop && s.cloudBot && s.ridge), '');

  // the places of the TRAVEL menu are what the generator finds now (a change to the layout that was not followed by `node tools/realm-travel.mjs emberfall` shows here)
  {
    const canon = (groups) => groups.map((q) => `${q.name}: ${q.places.map((p) => [p.id, p.name, p.x, p.z, p.y ?? '', p.yaw, !!p.opens, !!p.shelf].join('|')).join(' ')}`).join('\n');
    const now = findTravelPlaces('emberfall'), a = canon(now.entry.groups), b = canon(TRAVEL_PLACES.groups);
    const diff = a.split('\n').map((l, i) => [l, b.split('\n')[i]]).filter(([x, y]) => x !== y).map(([x]) => x.slice(0, 60));
    check('the TRAVEL places are current (node tools/realm-travel.mjs emberfall)', now.problems.length === 0 && a === b, now.problems.join('; ') || (diff.length ? `(differs: ${diff.join(' / ')})` : ''));
  }
  // Dawnhaven's door to the realm is awake
  check('Dawnhaven\'s Emberfall door is awake and leads here', DOORS.find((d) => d.id === 'emberfall').target === level.brief.id, '');
}

console.log(failed.length + own ? `\n${failed.length + own} FAILED` : '\nall checks passed');
process.exitCode = failed.length + own ? 1 : 0;
