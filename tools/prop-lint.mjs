// Lints every registered prop headlessly: NaN/Infinity in geometry, non-finite colliders/lights, triangle counts.
// Usage: node tools/prop-lint.mjs [propName ...]
import { generateTerrain } from '../src/game/terrain.js';
import { Lighting } from '../src/engine/lighting.js';
import { Kit, flatGrid } from '../src/game/kit.js';
import { PROPS } from '../src/game/props/index.js';

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PROPS).filter((n) => !n.startsWith('_'));
const grid = flatGrid(3.2);
const lighting = new Lighting();
lighting.attach(grid);

const variants = [
  {},
  { rot: 1.3, scale: 1.4 },
  { rot: -2.1, scale: 0.7, size: 's', variant: 1, count: 3, r: 2, len: 6, h: 3, w: 4, color: 'violet' },
  { size: 'l', variant: 3, count: 14, r: 6, len: 20, h: 12, w: 10, color: 'cyan', canopy: 'leaves_autumn' },
];
let problems = 0;
for (const name of names) {
  const e = PROPS[name];
  if (!e) { console.log('unknown', name); continue; }
  variants.forEach((v, vi) => {
    const kit = new Kit({ assets: null, lighting, grid });
    const params = { ...(e.defaults || {}), x: 0, z: 0, ax: -6, az: 0, bx: 6, bz: 5, dx: 8, dz: 4, rise: 3, ...v };
    try {
      kit.setPass('dry'); e.fn(kit, params);
      kit.setPass('wet'); e.fn(kit, params);
    } catch (err) { problems++; console.log(`${name}[${vi}] THROWS: ${err.message.split('\n')[0]}`); return; }
    let tris = 0, bad = 0, badUV = 0, badCol = 0;
    for (const { builder } of kit.builders.values()) {
      tris += builder.triangleCount;
      for (const x of builder.pos) if (!Number.isFinite(x)) { bad++; break; }
      for (const x of builder.uvs) if (!Number.isFinite(x)) { badUV++; break; }
      for (const x of builder.colA) if (!Number.isFinite(x)) { badCol++; break; }
    }
    const badColl = kit.colliders.filter((c) => Object.values(c).some((x) => typeof x === 'number' && !Number.isFinite(x))).length;
    const badLight = kit.lights.filter((l) => [l.x, l.y, l.z, l.size].some((x) => !Number.isFinite(x))).length;
    if (bad || badUV || badCol || badColl || badLight) {
      problems++;
      console.log(`${name}[${vi}] NaN: pos=${bad} uv=${badUV} col=${badCol} colliders=${badColl} lights=${badLight}`);
    } else if (vi === 0) console.log(`ok  ${name.padEnd(20)} tris=${String(tris).padStart(5)} colliders=${kit.colliders.length} lights=${kit.lights.length} emitters=${kit.emitters.length}`);
  });
}
console.log(problems ? `${problems} PROBLEM(S)` : 'all props clean');
process.exitCode = problems ? 1 : 0;
