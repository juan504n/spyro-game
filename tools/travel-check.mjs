// The places of the TRAVEL menu (src/game/travel.js) checked headlessly: both worlds are built (no GPU, no server) and every place is held to the standard a debugging tool needs: the hero put
// there can STAND (the floor is where the place says, not a roof or the air), is clear of rock, props and the game's own colliders, not in water, not on a slope he would slide down,
// not beside a Snuffer or inside the light of an awake door (he would be hurt, or carried away, the moment he arrives), and not in a pocket: there is walking ground all round him, and in
// Dawnhaven he is in the walkable country (the garden and the vault, which a cracked wall shuts, count once the wall is broken). The lists are held to what a menu can show: a page of
// a phone's menu has about six rows, and the names must fit the panel. Exit code 1 when a check fails.
//   node tools/travel-check.mjs
import { buildHeadless, addRuntimeColliders } from './headless-world.mjs';
import { makeWalkmap } from './walkmap.mjs';
import { SLOPE_WALK } from '../src/game/collision.js';
import { WATER_LEVEL, WARD_RADIUS } from '../src/game/level.js';
import { REALMS } from '../src/game/realms.js';
import { TRAVEL, travelPlaces, travelWorld, findPlace, heroSpot } from '../src/game/travel.js';
import { measureText } from '../src/engine/textures/font.js';
import { areaAt } from '../src/game/debuginfo.js';

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const f1 = (v) => v.toFixed(1);

// ---- the lists --------------------------------------------------------------------------------------------------------------------------------
{
  check('every world of the list is a world of the game', TRAVEL.length === Object.keys(REALMS).length && TRAVEL.every((w) => REALMS[w.world]), `(${TRAVEL.map((w) => w.world).join(', ')})`);
  const all = TRAVEL.flatMap((w) => travelPlaces(w.world));
  check('the places have keys that are all different, and findPlace finds each', new Set(all.map((p) => p.key)).size === all.length && all.every((p) => findPlace(p.key)?.key === p.key), `(${all.length} places)`);
  check('a world has a few groups and a group a few places, so that a page of a phone\'s menu (about six rows) shows them', TRAVEL.every((w) => w.groups.length >= 2 && w.groups.length <= 6 && w.groups.every((g) => g.places.length >= 2 && g.places.length <= 6)),
    TRAVEL.map((w) => `${w.world}: ${w.groups.map((g) => g.places.length).join('+')}`).join('; '));
  const widest = Math.max(...all.map((p) => measureText(p.name).w), ...TRAVEL.flatMap((w) => [measureText(w.name).w, ...w.groups.map((g) => measureText(g.name).w)]));
  check('the names are capitals that fit a page of the menu (230 px wide, a row\'s text starts 20 px in and a marker is 24 px at the end)', all.every((p) => p.name === p.name.toUpperCase()) && widest <= 230 - 20 - 24, `(the widest ${widest} px)`);
  check('every place says which way he faces', all.every((p) => Number.isFinite(p.yaw) && Number.isFinite(p.x) && Number.isFinite(p.z) && (p.y === undefined || Number.isFinite(p.y))));
  check('both worlds have a place to start from (the realm\'s start, Dawnhaven\'s cove)', !!findPlace('gloaming/start') && !!findPlace('home/cove'));
}

// ---- the places in the worlds -------------------------------------------------------------------------------------------------------------------
for (const id of ['gloaming', 'home']) {
  const W = buildHeadless(id), { grid, collision, gp, level } = W;
  addRuntimeColliders(collision, gp, grid);
  const places = travelPlaces(id), nrm = [0, 1, 0];
  const lim = grid.half - 6;
  // (as Player.update asks it: a solid collider stops a body standing with its feet at `feet` when it reaches above the step he can take (0.62) and starts below his head (1.05))
  const solidAt = (x, feet, z, r) => {
    for (const c of collision.near(x, z)) { if (!c.solid || c.y1 <= feet + 0.62 || c.y0 >= feet + 1.05 || !collision.inside(c, x, z, r)) continue; return c; }
    for (const m of collision.solids) { const e = { x, z, r }; if (m.inBoxXZ(x, z) && m.push(e, feet, 1.05, 0.62) && Math.hypot(e.x - x, e.z - z) > 0.25) return m; }
    return null;
  };
  const arrive = id === 'home' ? [gp.arrivals.gloaming.x, gp.arrivals.gloaming.z] : [gp.spawn.x, gp.spawn.z];
  const { flood } = makeWalkmap({ grid, collision });
  const wBroken = id === 'home' ? flood(arrive, { breakWalls: true }) : null;
  const bad = { floor: [], clear: [], slope: [], water: [], enemy: [], door: [], pocket: [], walk: [], bounds: [], name: [] };
  for (const p of places) {
    const sp = heroSpot(grid, p), feet = sp.y - 0.05;
    const sup = collision.support(p.x, p.z, feet + 0.62, 0.62);
    if (Math.abs(sup.y - feet) > 0.1) bad.floor.push(`${p.key} (floor ${f1(sup.y)}, wanted ${f1(feet)})`);
    let tight = solidAt(p.x, sup.y, p.z, 0.55) ? 9 : 0;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (solidAt(p.x + Math.cos(a) * 1.3, sup.y, p.z + Math.sin(a) * 1.3, 0.55)) tight++; }
    if (tight) bad.clear.push(`${p.key} (${tight})`);
    if (sup.kind === 'terrain') { grid.normalAt(p.x, p.z, nrm); if (nrm[1] < SLOPE_WALK) bad.slope.push(p.key); if (sup.y < WATER_LEVEL + 0.2) bad.water.push(p.key); }
    else if (sup.n && sup.n.ny < SLOPE_WALK) bad.slope.push(p.key);
    for (const e of gp.enemies || []) if (Math.hypot(e.x - p.x, e.z - p.z) < 6) { bad.enemy.push(p.key); break; }
    for (const q of gp.portals || []) if (q.state === 'open' && Math.hypot(q.x - p.x, q.z - p.z) < 6) { bad.door.push(p.key); break; }
    if (Math.abs(p.x) > lim || Math.abs(p.z) > lim) bad.bounds.push(p.key);
    // not in a pocket: walking ground all round him (a flood within 40 m reaches 100 cells or more: the Shrine Isle, the smallest, has 140), and in Dawnhaven he is in the country
    const local = flood([p.x, p.z], { startY: sup.y, breakWalls: true, mask: (x, y, z) => Math.hypot(x - p.x, z - p.z) < 40 });
    let cells = 0; local.each(() => { cells++; });
    if (cells < 100) bad.pocket.push(`${p.key} (${cells} cells)`);
    if (wBroken && !(wBroken.distNear(p.x, p.z, 2.4, sup.y) < Infinity)) bad.walk.push(p.key);
    const area = areaAt(level, p.x, p.z, sup.y);
    if (!area || !area.name) bad.name.push(p.key);
  }
  // the places inside the ward that seals the vale's summit while the Dawn Gate is shut: the app opens the gate for a hero put there (App._placeHero), or the ward would throw him out
  if (level.summit) {
    const inWard = places.filter((p) => Math.hypot(p.x - level.summit.x, p.z - level.summit.z) < WARD_RADIUS).map((p) => p.key);
    check(`${travelWorld(id).name}: the places inside the ward of the summit are the two of the observatory (they open the Dawn Gate)`, inWard.join() === 'gloaming/observatory,gloaming/beacon-room', `(${inWard.join(', ')})`);
  }
  const say = (k) => bad[k].join(', ');
  const W_ = travelWorld(id).name;
  check(`${W_}: every place has the floor it says (not a roof, not the air)`, bad.floor.length === 0, say('floor') || `(${places.length} places)`);
  check(`${W_}: ... clear of rock, props and the game's colliders all round him`, bad.clear.length === 0, say('clear'));
  check(`${W_}: ... on ground he does not slide down, and out of the water`, bad.slope.length === 0 && bad.water.length === 0, `${say('slope')} ${say('water')}`.trim());
  check(`${W_}: ... 6 m from the Snuffers and from every door that is awake`, bad.enemy.length === 0 && bad.door.length === 0, `${say('enemy')} ${say('door')}`.trim());
  check(`${W_}: ... inside the world's bounds, named by the debug readout's areas`, bad.bounds.length === 0 && bad.name.length === 0, `${say('bounds')} ${say('name')}`.trim());
  check(`${W_}: ... in no pocket: walkable ground reaches 40 m round him`, bad.pocket.length === 0, say('pocket'));
  if (wBroken) check(`${W_}: ... in the walkable country, from the cove (the cracked walls broken)`, bad.walk.length === 0, say('walk'));
}

console.log(failed ? `\n${failed} FAILED` : '\nall travel checks passed');
process.exitCode = failed ? 1 : 0;
