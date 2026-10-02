// Finds the places of a realm for the TRAVEL menu (src/game/travel.js) and writes them to src/game/<id>/travel.js: the start, a spot in front of every goal, a spot in each named part of the
// country and beside every secret. Each place is searched for round the point it is meant for (nearest first, looking back along the way the hero comes from) until one passes every rule a
// place must (tools/lib/travel-rules.mjs: he can stand there, clear of rock and props, away from the Snuffers, not in a pocket...), so the list is valid by construction; re-run it after the
// realm's layout changes. The generator (tools/new-realm.mjs) calls it, and registers the list in travel.js.
//   node tools/realm-travel.mjs <realm id> [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHeadless, addRuntimeColliders } from './headless-world.mjs';
import { makeWalkmap } from './walkmap.mjs';
import { makePlaceChecker } from './lib/travel-rules.mjs';
import { measureText } from '../src/engine/textures/font.js';
import { pointOn, regionAt } from '../src/game/realm/country.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r2 = (v) => Math.round(v * 100) / 100;
const MAX_NAME = 230 - 20 - 24;

/** the places of a world: { world, name, groups: [{ name, places: [{ id, name, x, z, yaw, y? }] }] } */
export function findTravelPlaces(which) {
  const W = buildHeadless(which);
  const { grid, collision, gp, level: L } = W;
  addRuntimeColliders(collision, gp, grid);
  const { flood } = makeWalkmap({ grid, collision });
  const wBroken = flood([gp.spawn.x, gp.spawn.z], { breakWalls: true, openGate: true });               // (the walkable country: cracked walls broken, the gate open)
  const wShut = gp.barrier ? flood([gp.spawn.x, gp.spawn.z], { breakWalls: true }) : null;            // (what the hero reaches while the gate is shut)
  const checkPlace = makePlaceChecker(W, flood, wBroken);
  const brief = L.brief;
  const taken = [];
  const problems = [];

  /** a valid place near (x0, z0), looking at (fx, fz), arriving from the side of (bx, bz) when there is one: nearest candidates first */
  // (`ref`: the height of the floor the place is meant for - a goal's, a chest's, a ribbon's: under a cave's roof the highest surface at a point is the roof, not where he stands)
  const find = (id, name, x0, z0, fx, fz, bx = null, bz = null, rings = [0, 3, 4.5, 6, 8, 10, 13, 17, 22], ref = null, shelf = false) => {
    const base = bx === null ? 0 : Math.atan2(bz - z0, bx - x0);
    for (const d of rings) {
      const n = d === 0 ? 1 : 16;
      for (let k = 0; k < n; k++) {
        // (alternate to the right and to the left of the way back, widening)
        const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * ((Math.PI * 2) / n);
        const x = r2(x0 + Math.cos(a) * d), z = r2(z0 + Math.sin(a) * d);
        if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < 4)) continue;
        const p = { id, name, x, z, yaw: r2(Math.atan2(fx - x, fz - z)) };
        const sup = ref === null ? collision.support(x, z, 1e3, 1e3) : collision.support(x, z, ref, 0.9);
        if (Math.abs(sup.y - grid.heightAt(x, z)) > 0.15) p.y = r2(sup.y);
        const bad = checkPlace(p, { shelf });
        if (Object.values(bad).every((v) => !v)) {
          if (shelf) p.shelf = true;
          if (wShut && !shelf && !(wShut.distNear(x, z, 2.4, (p.y ?? grid.heightAt(x, z))) < Infinity)) p.opens = true;       // (a place beyond the gate opens it for him: App._placeHero)
          taken.push(p);
          return p;
        }
      }
    }
    problems.push(`no valid place found for ${id}`);
    return null;
  };
  const sp = gp.spawn;
  const goals = [], country = [], secrets = [];
  for (const b of gp.beacons) {
    const g = brief ? brief.goals.find((q) => q.id === b.id) : null, rings = [4, 5.5, 7, 9, 12, 16, 22];
    let p = find(b.id, g ? g.name : b.name, b.x, b.z, b.x, b.z, sp.x, sp.z, rings, b.y);
    // (a glide goal stands on a shelf the hero cannot walk to: its place is on the shelf, flagged `shelf`, and he glides off it)
    if (!p && g && g.situation === 'glide') { const i = problems.findIndex((q) => q === `no valid place found for ${b.id}`); if (i >= 0) problems.splice(i, 1); p = find(b.id, g.name, b.x, b.z, b.x, b.z, sp.x, sp.z, [4, 5.5, 7], b.y, true); }
    goals.push(p);
  }
  country.push(find('start', 'THE START', sp.x, sp.z, sp.x + Math.sin(sp.yaw) * 20, sp.z + Math.cos(sp.yaw) * 20, null, null, undefined, sp.y));
  for (const R of L.regions || []) {
    if (R.sealed || !R.label) continue;
    const [px, pz] = pointOn(R, 0.5), [qx, qz] = pointOn(R, 0.62);
    if (taken.some((t) => Math.hypot(t.x - px, t.z - pz) < 16)) continue;                  // (a part whose middle is where a place already is has no need of another)
    country.push(find(goals.some((g) => g && g.id === R.id) ? `${R.id}-part` : R.id, R.label, px, pz, qx, qz, null, null, undefined, regionAt(R, px, pz).h));       // (a part may be named like a goal: the keys of a world's places are all different)
  }
  for (const c of gp.chests.filter((q) => q.secret)) {
    if (taken.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < 12)) continue;                // (a secret beside a goal is shown by the goal's place)
    const s = brief ? brief.secrets.find((q) => q.id === c.secret) : null;
    secrets.push(find(`secret-${c.secret}`, s ? s.name : `SECRET ${c.secret.toUpperCase()}`, c.x, c.z, c.x, c.z, sp.x, sp.z, [3.5, 5, 7, 9, 12, 16], c.y));
  }
  // (a page of a phone's menu shows about six rows: a list is split into pages of six; a lone place left over for the last page (a page needs two) is made up with one from the page before it)
  const chunk = (list, name) => {
    const ok = list.filter(Boolean), sizes = [], out = [];
    for (let i = 0; i < ok.length; i += 6) sizes.push(Math.min(6, ok.length - i));
    if (sizes.length > 1 && sizes[sizes.length - 1] === 1) { sizes[sizes.length - 2]--; sizes[sizes.length - 1]++; }
    let from = 0;
    sizes.forEach((n, k) => { out.push({ name: k ? `${name} (${k + 1})` : name, places: ok.slice(from, from + n) }); from += n; });
    return out;
  };
  const groups = [...chunk(goals, 'THE GOALS'), ...chunk(country, 'THE COUNTRY'), ...chunk(secrets, 'THE SECRETS')].filter((g) => g.places.length >= 2);
  for (const g of groups) for (const p of g.places) if (measureText(p.name).w > MAX_NAME) problems.push(`'${p.name}' is too wide for a page of the menu (${measureText(p.name).w} px, at most ${MAX_NAME})`);
  const world = typeof which === 'object' ? which.id : which;
  return { entry: { world, name: L.name.toUpperCase(), groups }, problems };
}

/** the text of src/game/<id>/travel.js */
export function travelSource(entry) {
  const place = (p) => `        { id: '${p.id}', name: '${p.name.replace(/'/g, "\\'")}', x: ${p.x}, z: ${p.z}, ${p.y !== undefined ? `y: ${p.y}, ` : ''}yaw: ${p.yaw}${p.opens ? ', opens: true' : ''}${p.shelf ? ', shelf: true' : ''} },`;
  return `// The places of ${entry.name} for the TRAVEL menu (src/game/travel.js): the start, a spot in front of every goal, one in each named part of the country and beside each secret. FOUND AND CHECKED
// by tools/realm-travel.mjs (every place passes the rules of tools/lib/travel-rules.mjs): re-run \`node tools/realm-travel.mjs ${entry.world}\` after the layout changes rather than editing by hand.
export const TRAVEL_PLACES = {
  world: '${entry.world}', name: '${entry.name}',
  groups: [
${entry.groups.map((g) => `    {\n      name: '${g.name}',\n      places: [\n${g.places.map(place).join('\n')}\n      ],\n    },`).join('\n')}
  ],
};
`;
}

/** put a realm's list in travel.js between its marker comments (once) */
export function registerTravel(id, root = ROOT) {
  const f = path.join(root, 'src/game/travel.js');
  let s = fs.readFileSync(f, 'utf8');
  const name = `TRAVEL_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  if (s.includes(`from './${id}/travel.js'`)) return false;
  if (!s.includes('// <realm-travel-imports>') || !s.includes('// <realm-travel-entries>')) throw new Error('src/game/travel.js has lost its <realm-travel-imports> / <realm-travel-entries> markers');
  s = s.replace('// <realm-travel-imports>', `import { TRAVEL_PLACES as ${name} } from './${id}/travel.js';\n// <realm-travel-imports>`);
  s = s.replace('  // <realm-travel-entries>', `  ${name},\n  // <realm-travel-entries>`);
  fs.writeFileSync(f, s);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2], dry = process.argv.includes('--dry');
  if (!id) { console.log('usage: node tools/realm-travel.mjs <realm id> [--dry]'); process.exit(1); }
  const { entry, problems } = findTravelPlaces(id);
  const src = travelSource(entry);
  if (dry) console.log(src);
  else {
    fs.writeFileSync(path.join(ROOT, `src/game/${id}/travel.js`), src);
    const added = registerTravel(id);
    console.log(`wrote src/game/${id}/travel.js: ${entry.groups.map((g) => `${g.name} ${g.places.length}`).join(', ')}${added ? ' (registered in src/game/travel.js)' : ''}`);
  }
  for (const p of problems) console.log('PROBLEM', p);
  process.exitCode = problems.length ? 1 : 0;
}
