// A fingerprint of the worlds that must not change by accident: the heightfield, the roads and everything the level script places and decides (the gameplay data), hashed. Gloaming Vale and
// Dawnhaven are pinned in tools/world-hash.json; a change to the engine, the realm kit or a shared prop that moves one grain of either world shows here, and a change that is meant (a door that
// wakes, a new prop on a road) is made official by writing the new hashes (`--write`) in the same commit that makes it. No dev server needed.
//   node tools/world-hash.mjs              compare the pinned worlds with their hashes (exit code 1 when one differs)
//   node tools/world-hash.mjs --write      pin the hashes of the worlds named (all pinned ones by default) as they are now
//   node tools/world-hash.mjs <ids...>     only those worlds; any world of src/game/realms.js can be hashed (a new realm is not pinned until you --write it)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHeadless } from './headless-world.mjs';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'world-hash.json');
const fnv = (h, arr) => { const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };

export function hashWorld(id) {
  const w = buildHeadless(id);
  let h = fnv(2166136261, w.grid.heights);
  for (const p of w.grid.paths) h = fnv(h, new Float32Array(p.pts.flat()));
  // (the list of the trials a world has, when it has none, is not part of the fingerprint: a world that was pinned before there were trials is the same world now)
  const g = fnv(2166136261, new TextEncoder().encode(JSON.stringify(w.gp, (k, v) => (typeof v === 'number' ? +v.toFixed(5) : k === 'trials' && Array.isArray(v) && !v.length ? undefined : v))));
  return { heights: h.toString(16), gameplay: g.toString(16), placed: w.gp.placed.length, gems: w.gp.gemsTotal };
}

const pinned = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const write = process.argv.includes('--write');
const named = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = named.length ? named : Object.keys(pinned);
let failed = 0;
const now = {};
for (const id of ids) {
  now[id] = hashWorld(id);
  const was = pinned[id];
  const same = was && JSON.stringify(was) === JSON.stringify(now[id]);
  if (!write) {
    if (!was) console.log(`NEW  ${id}: ${JSON.stringify(now[id])} (not pinned: --write pins it)`);
    else { if (!same) failed++; console.log(`${same ? 'PASS' : 'FAIL'} ${id}${same ? '' : `: pinned ${JSON.stringify(was)}, now ${JSON.stringify(now[id])}`}`); }
  }
}
if (write) {
  fs.writeFileSync(FILE, `${JSON.stringify({ ...pinned, ...now }, null, 2)}\n`);
  console.log(`pinned ${ids.join(', ')} in tools/world-hash.json`);
}
process.exitCode = failed ? 1 : 0;
