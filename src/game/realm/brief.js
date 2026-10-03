// The BRIEF of a realm: its design, written down as data before any of it is built, and kept as the single source of truth for what it is meant to be. The code that builds the realm
// (its level.js and layout.js) reads its places from the brief, and tools/realm-check.mjs holds the finished world to what the brief promises and to the principles of the original
// games' worlds that the brief is written against (see .claude/skills/new-realm/reference/principles.md).
//
//   export const BRIEF = defineBrief({ id: 'frostbloom', name: 'FROSTBLOOM HOLLOW', ... });
//
// defineBrief applies the defaults and refuses a brief that could not describe a realm (it throws with every problem it found, so one run lists them all).

/** The situations a goal can stand in. Every one is a different kind of place with a different way to it (see situations.js, which says how each is checked). */
export const SITUATION_IDS = ['landing', 'clearing', 'island', 'summit', 'cave', 'glide', 'puzzle', 'crater', 'lift', 'bridge'];

/** The rules a realm's brief is held to: how many goals, how many different situations among them, how many parts the country has... (the checker has the rest). */
export const RULES = {
  goalsMin: 3, goalsMax: 9,
  situationsMin: (n) => Math.min(4, n),         // "varied situations": of five goals at least four stand in different kinds of place
  regionsMin: 5,                               // a country of parts, not an open field
  heightSpanMin: 25,                           // ... with levels: the ribbons' floors span at least this many metres
  paletteMax: 3,                               // a themed place: two or three base colours, accents on top
  secretsMin: 3,
  gemsMin: 400,
};

import { tideProblems } from './tide.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isXZ = (o) => o && isNum(o.x) && isNum(o.z);

/** The ids of the DEFAULT_WORDS a brief may override (realms.js has the values). */
const WORD_KEYS = ['goals', 'lit', 'finale', 'portalOpened', 'saved', 'results', 'portalResults', 'freeRoam', 'restored', 'restoredHint', 'icons', 'gate'];

export function defineBrief(b) {
  const errs = [];
  const err = (m) => errs.push(m);
  const need = (cond, m) => { if (!cond) err(m); };

  need(typeof b.id === 'string' && /^[a-z][a-z0-9-]{1,23}$/.test(b.id), 'id: a short lowercase word (the REALMS key, ?world=<id>, the progress key)');
  need(typeof b.name === 'string' && b.name === b.name.toUpperCase(), 'name: UPPER CASE (it is drawn in the HUD font)');
  need(typeof b.tagline === 'string' && b.tagline === b.tagline.toUpperCase(), 'tagline: UPPER CASE');
  need(b.world && isNum(b.world.size) && isNum(b.world.cell) && Math.abs(b.world.size / b.world.cell - Math.round(b.world.size / b.world.cell)) < 1e-9, 'world: { size, cell } with size a whole number of cells');
  need(b.environment && Array.isArray(b.environment.envs) && b.environment.envs.length === 2 && Array.isArray(b.environment.sky) && b.environment.sky.length === 2, 'environment: { envs: [A, B], sky: [A, B], sun, moon } (engine/lighting.js DEFAULT_ENVIRONMENT shows the shape)');
  need(b.theme && Array.isArray(b.theme.palette) && b.theme.palette.length >= 1 && b.theme.palette.length <= RULES.paletteMax, `theme.palette: one to ${RULES.paletteMax} base colours (names), a place is made of few`);
  need(b.theme && Array.isArray(b.theme.ground) && b.theme.ground.length >= 1, 'theme.ground: the ground textures the realm is made of');

  const c = b.country || {};
  need(Array.isArray(c.regions) && c.regions.length >= RULES.regionsMin, `country.regions: at least ${RULES.regionsMin} parts (a country of parts joined by roads, not one open field)`);
  const ids = new Set();
  let lo = Infinity, hi = -Infinity;
  for (const r of c.regions || []) {
    need(typeof r.id === 'string' && !ids.has(r.id), `region '${r.id}': an id, and a different one from every other`);
    ids.add(r.id);
    need(isNum(r.fall) && r.fall > 0, `region '${r.id}': fall > 0 (metres from the ribbon's edge up to the mountains)`);
    need(Array.isArray(r.pts) && r.pts.length >= 2 && r.pts.every((p) => p.length === 4 && p.every(isNum)), `region '${r.id}': pts [[x, z, height, halfWidth], ...] with at least two points`);
    for (const p of r.pts || []) { if (isNum(p[2])) { lo = Math.min(lo, p[2]); hi = Math.max(hi, p[2]); } }
  }
  need(hi - lo >= RULES.heightSpanMin, `country.regions: the floors span ${isFinite(hi - lo) ? (hi - lo).toFixed(1) : '?'} m; a country with levels spans at least ${RULES.heightSpanMin} (height is the reward)`);

  const roads = b.roads || [];
  need(roads.length >= 3, 'roads: at least three');
  const rids = new Set();
  for (const r of roads) {
    need(typeof r.id === 'string' && !rids.has(r.id), `road '${r.id}': an id, and a different one from every other`);
    rids.add(r.id);
    need(['dirt', 'cobble', 'flagstone'].includes(r.surface), `road '${r.id}': surface dirt | cobble | flagstone`);
    need(isNum(r.width) && r.width > 1, `road '${r.id}': width in metres`);
    need(Array.isArray(r.pts) && r.pts.length >= 2 && r.pts.every((p) => isNum(p[0]) && isNum(p[1])), `road '${r.id}': pts [[x, z], ...]`);
  }

  need(b.spawn && isNum(b.spawn.x) && isNum(b.spawn.z) && isNum(b.spawn.yaw), 'spawn: { x, z, yaw } (where the hero comes out of the door)');

  const goals = b.goals || [];
  need(goals.length >= RULES.goalsMin && goals.length <= RULES.goalsMax, `goals: ${RULES.goalsMin} to ${RULES.goalsMax} (the lanterns of the realm)`);
  const gids = new Set();
  for (const g of goals) {
    need(typeof g.id === 'string' && !gids.has(g.id), `goal '${g.id}': an id, and a different one from every other`);
    gids.add(g.id);
    need(typeof g.name === 'string' && g.name === g.name.toUpperCase(), `goal '${g.id}': name in UPPER CASE`);
    need(isXZ(g), `goal '${g.id}': x and z`);
    need(SITUATION_IDS.includes(g.situation), `goal '${g.id}': situation one of ${SITUATION_IDS.join(' | ')} (it is what the checker holds the place to)`);
    // the look of a goal (BeaconSystem reads these: a colour of the wrong shape only fails when the hero first lights it)
    const col = (v, n = 3) => Array.isArray(v) && v.length === n && v.every(isNum);
    if (g.beam !== undefined) need(!!g.beam && col(g.beam.off) && col(g.beam.on), `goal '${g.id}': beam { off: [r, g, b], on: [r, g, b] } (its column of light before and after it is lit)`);
    for (const k of ['glow', 'wisp', 'sparkle']) if (g[k] !== undefined) need(col(g[k]), `goal '${g.id}': ${k} [r, g, b]`);
    if (g.spark !== undefined) need(!!g.spark && col(g.spark.c0, 4) && col(g.spark.c1, 4), `goal '${g.id}': spark { c0: [r, g, b, a], c1: [r, g, b, a] } (the colours of the burst when it is lit: from, to)`);
    if (g.model !== undefined) need(typeof g.model === 'string', `goal '${g.id}': model the name of a model (models/objects.js)`);
    if (g.sfx !== undefined) need(typeof g.sfx === 'string', `goal '${g.id}': sfx the name of a sound (engine/audio: it is played, with the lantern's beam, when the goal is lit)`);
  }
  const kinds = new Set(goals.map((g) => g.situation));
  need(kinds.size >= RULES.situationsMin(goals.length), `goals: ${kinds.size} different situations among ${goals.length} goals; at least ${RULES.situationsMin(goals.length)} (every goal in a place of its own kind)`);
  if (goals.length) need(['summit', 'crater', 'cave', 'island'].includes(goals[goals.length - 1].situation), 'goals: the last goal is the finale and stands somewhere grand (a summit, a crater, a cave or an island)');

  // a SEA instead of a lake (Skyweaver Spires' cloud): the ground that is not an island lies far below the surface, and what falls in is set back on the last firm ground
  if (b.sea !== undefined) {
    need(!b.lake, 'sea: a realm has a lake or a sea, not both');
    need(b.sea && typeof b.sea.name === 'string' && b.sea.name === b.sea.name.toUpperCase() && typeof b.sea.deepHint === 'string' && b.sea.deepHint === b.sea.deepHint.toUpperCase(), 'sea: { name, deepHint } in UPPER CASE (the hint a hero who has fallen into it is shown), radius optional');
    need(!b.sea || b.sea.radius === undefined || (isNum(b.sea.radius) && b.sea.radius >= 100), 'sea.radius: metres (the surface is drawn out to it), 100 or more');
    need(!b.sea || ((b.sea.segs === undefined || (Number.isInteger(b.sea.segs) && b.sea.segs >= 24 && b.sea.segs <= 200)) && (b.sea.rings === undefined || (Number.isInteger(b.sea.rings) && b.sea.rings >= 8 && b.sea.rings <= 96))), 'sea.segs, sea.rings: how finely the surface is cut (whole numbers: 24 to 200 round, 8 to 96 out; 72 by 32 by default)');
  }
  // a TIDE (Tideglass Reach): the sea rises and falls round the mean level; realm/tide.js says what the numbers are and the checker (the `tide.*` rules) holds the country to them
  if (b.tide !== undefined) {
    for (const m of tideProblems(b.tide)) err(m);
    need(!!b.sea || !!b.lake, 'tide: a tide needs water to rise and fall in: brief.sea (or brief.lake)');
    if (b.tide && b.tide.hint !== undefined) need(typeof b.tide.hint === 'string' && b.tide.hint === b.tide.hint.toUpperCase(), 'tide.hint: UPPER CASE (what a hero who has drowned on ground that is only under water at high tide is told)');
    if (b.tide && b.tide.tint !== undefined) {
      const t = b.tide.tint, col = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
      need(t && col(t.shallow) && col(t.deep) && (t.scale === undefined || (isNum(t.scale) && t.scale >= 1 && t.scale <= 8)), 'tide.tint: { shallow: [r, g, b], deep: [r, g, b], scale (metres of depth over which the one turns into the other, 1 to 8: 4.2 by default), shimmer [r, g, b] (the additive layer), texture (a water texture name) }');
    }
  }
  if (b.rockLine !== undefined) need(isNum(b.rockLine) && b.rockLine > 0, 'rockLine: the height in metres over which the ground is drawn as far rock (42 by default; a realm of high islands says where)');
  // the AIR: how islands are joined where there is no way on foot (a glide from a ledge, or a ride up a whirlwind and a glide from its top); tools/lib/air.mjs holds each link to the numbers
  if (b.air !== undefined) {
    need(b.air && isNum(b.air.startCells) && Array.isArray(b.air.links) && b.air.links.length >= 1, 'air: { startCells (how many 1.2 m cells of ground the hero can walk from the start), links: [{ id, kind, ... }] }');
    const lid = new Set();
    for (const L of (b.air && b.air.links) || []) {
      need(typeof L.id === 'string' && !lid.has(L.id), `air link '${L.id}': an id, and a different one from every other`);
      lid.add(L.id);
      need(L.kind === 'glide' || L.kind === 'lift', `air link '${L.id}': kind glide | lift`);
      need(Array.isArray(L.land) && L.land.length === 2 && L.land.every(isNum), `air link '${L.id}': land [x, z] (where the glide comes down)`);
      if (L.kind === 'glide') need(Array.isArray(L.launch) && L.launch.length === 2 && L.launch.every(isNum), `air link '${L.id}': a glide has launch [x, z] (the ledge he runs off)`);
      if (L.kind === 'lift') need(typeof L.whirl === 'string', `air link '${L.id}': a lift has whirl, the id of a whirlwind (gp.whirlwinds)`);
    }
  }
  need(!goals.some((g) => g.situation === 'lift') || b.air !== undefined, 'goals: a lift goal needs the air journey (brief.air: the links and the whirlwinds that lift him)');
  need(b.exit && typeof b.exit.target === 'string' && Array.isArray(b.exit.color) && b.exit.color.length === 3, 'exit: { target (a realm id), name, tag, color [r, g, b] } (the ring of light over the last goal)');
  need(Array.isArray(b.secrets) && b.secrets.length >= RULES.secretsMin && b.secrets.every((s) => s.id && s.name), `secrets: at least ${RULES.secretsMin} ({ id, name }): what is off the road and worth finding`);
  if (b.words) for (const k of Object.keys(b.words)) need(WORD_KEYS.includes(k), `words.${k}: not one of ${WORD_KEYS.join(', ')}`);
  if (b.gate) need(isXZ(b.gate) && isNum(b.gate.at) && b.gate.at < goals.length, 'gate: { x, z, at (how many goals open it), yaw }');
  if (errs.length) throw new Error(`The brief of '${b && b.id}' is not a design yet:\n  - ${errs.join('\n  - ')}`);

  return {
    gems: { min: RULES.gemsMin },
    danger: { safeRadius: 30 },
    waive: [],
    labels: ['SCULPTING THE LAND', 'PLANTING THE FOREST', 'PAINTING THE LIGHT', 'RAISING THE HILLS', 'FILLING THE LAKE'],
    ...b,
    country: { seed: 1000, mountain: {}, roll: {}, ...c },
    words: { ...(b.words || {}) },
  };
}

/** Points of a region's line as [x, z] (for a road that runs along it): `from` and `to` pick a stretch by point index. */
export const ptsOf = (regions, id, from = 0, to = Infinity) => {
  const R = regions.find((r) => r.id === id);
  if (!R) throw new Error(`no region '${id}'`);
  return R.pts.slice(from, to).map((p) => [p[0], p[1]]);
};
