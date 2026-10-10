// The realm foundry's generator: lays the foundation of a new realm. It copies the starter realm (src/game/realm/starter: a small, complete realm that passes every rule of tools/realm-check.mjs)
// to src/game/<id>/ under the new name, writes tools/<id>-check.mjs, registers the realm in src/game/realms.js, finds and registers its places for the TRAVEL menu, and runs the checker, so
// that what you start from builds, boots (?world=<id>) and holds to the rules. What it gives you is a brief to rewrite - the design - and the stages of a level script to replace; the skill
// (.claude/skills/new-realm) is the workflow, and tools/realm-check.mjs says what the design still owes.
//
//   node tools/new-realm.mjs <id> --name "FROSTBLOOM HOLLOW" [--tagline "A REALM OF ICE AND BLOSSOM"] [--door frostbloom] [--wake-door] [--root <dir>] [--no-check] [--dry]
//     <id>         a short lowercase word: the REALMS key, the folder src/game/<id>, ?world=<id>, the progress key
//     --door       the id of the door of Dawnhaven that opens onto the realm (default: the id); --wake-door sets that door's `target` in src/game/home/level.js
//     --root       work in another checkout of the repo (the foundry's own test does)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parse(argv) {
  const a = { _: [], flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) { const k = t.slice(2); if (['wake-door', 'no-check', 'dry'].includes(k)) a.flags.add(k); else a[k] = argv[++i]; } else a._.push(t);
  }
  return a;
}

/** a stable seed for the realm's noise from its id (1000..8918, never the starter's 9001): every realm its own rolling ground and mountains */
const seedOf = (id) => { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 7919; return 1000 + h; };

/** the first block of `//` lines of a file, replaced */
const reheader = (text, header) => text.replace(/^(\/\/.*\n)+/, `${header.trim().split('\n').map((l) => `// ${l}`.trimEnd()).join('\n')}\n`);

export function generate(opts) {
  const { id, root = HERE, dry = false } = opts;
  const NAME = opts.name || id.replace(/-/g, ' ').toUpperCase();
  const TAGLINE = opts.tagline || 'A NEW REALM';
  const door = opts.door || id;
  const IDENT = id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const problems = [];
  if (!/^[a-z][a-z0-9-]{1,23}$/.test(id)) problems.push(`'${id}' is not a short lowercase id (letters, digits and hyphens)`);
  if (['starter', 'home', 'gloaming'].includes(id)) problems.push(`'${id}' is taken`);
  if (NAME !== NAME.toUpperCase()) problems.push('the name must be in UPPER CASE (it is drawn in the HUD font)');
  const dir = path.join(root, 'src/game', id), realmsFile = path.join(root, 'src/game/realms.js');
  if (fs.existsSync(dir)) problems.push(`src/game/${id} exists already`);
  const realms = fs.readFileSync(realmsFile, 'utf8');
  if (!realms.includes('// <realm-imports>') || !realms.includes('// <realm-entries>')) problems.push('src/game/realms.js has lost its <realm-imports> / <realm-entries> markers');
  if (new RegExp(`['"]?${id}['"]?:\\s*\\w+,`).test(realms)) problems.push(`'${id}' is registered in realms.js already`);
  if (problems.length) return { ok: false, problems };

  const starter = (f) => fs.readFileSync(path.join(root, 'src/game/realm/starter', f), 'utf8');
  const adapt = (text, header) => reheader(text, header)
    .replace(/'\.\.\/brief\.js'/g, "'../realm/brief.js'")
    .replace(/'\.\.\/index\.js'/g, "'../realm/index.js'")
    .replace(/'\.\.\/\.\.\/\.\.\/engine\/lighting\.js'/g, "'../../engine/lighting.js'")
    .replace(/'\.\.\/\.\.\/level\.js'/g, "'../level.js'")
    .replace(/STARTER VALE/g, NAME)
    .replace(/A REALM TO BEGIN FROM/g, TAGLINE)
    .replace(/id: 'starter'/g, `id: '${id}'`)
    .replace(/door: 'starter'/g, `door: '${door}'`)
    .replace(/seed: 9001/g, `seed: ${seedOf(id)}`);
  const files = {
    'brief.js': adapt(starter('brief.js'), `${NAME}: the design of the realm, written down as data before it is built (src/game/realm/brief.js has the schema and the rules a brief is held to).
Started from the starter realm by tools/new-realm.mjs: everything below is the starter's - rewrite it. The sky, the parts of the country, the goals (each in a different kind of place), the secrets.
\`waive\` lists what the design does not do yet: each line is a to-do the checker (node tools/realm-check.mjs ${id}) prints until it is deleted.`),
    'level.js': adapt(starter('level.js'), `The level descriptor of ${NAME}: the ground from the brief's ribbons (realm/level.js), plus the landforms the brief cannot say.`),
    'layout.js': adapt(starter('layout.js'), `The level script of ${NAME}: the stages the kit provides (the goals, the ring of light over the last one, the treasure) and the places of the realm, each a function that dresses one part of the country.
Positions come from brief.js; everything here is expressed in world coordinates and validated against the terrain by ctx.h() / ctx.ok(). Called twice by buildWorld (a dry pass, then a wet one): it must be deterministic - use ctx.rng, never Math.random.`),
    'index.js': adapt(starter('index.js'), `The entry of ${NAME} in REALMS (realms.js).`),
  };
  const check = `// The checks of ${NAME}: every rule of tools/realm-check.mjs (tools/lib/realm-rules.mjs has them all) and whatever is this realm's own, which goes below. No dev server needed:
//   node tools/${id}-check.mjs
import { checkRealm } from './lib/realm-rules.mjs';

const { failed, env } = checkRealm('${id}', { log: (l) => console.log(l) });
let own = 0;
const check = (name, ok, detail) => { if (!ok) own++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };

// ---- this realm's own checks (env: grid, collision, gp, level, ctx, walk, walkShut, h) ----------------------------------------------------------------------------
void env; void check;

console.log(failed.length + own ? \`\\n\${failed.length + own} FAILED\` : '\\nall checks passed');
process.exitCode = failed.length + own ? 1 : 0;
`;
  const ident = `import { REALM as ${IDENT} } from './${id}/index.js';\n`;
  const key = /^[a-z][a-z0-9]*$/.test(id) ? id : `'${id}'`;
  if (dry) return { ok: true, dry: true, files: Object.keys(files).map((f) => `src/game/${id}/${f}`).concat(`tools/${id}-check.mjs`), problems };

  fs.mkdirSync(dir, { recursive: true });
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), text);
  fs.writeFileSync(path.join(root, `tools/${id}-check.mjs`), check);
  fs.writeFileSync(realmsFile, realms.replace('// <realm-imports>', `${ident}// <realm-imports>`).replace('  // <realm-entries>', `  ${key}: ${IDENT},\n  // <realm-entries>`));
  const rosterFile = path.join(root, 'src/game/foes/roster.js');
  if (fs.existsSync(rosterFile)) { const rs = fs.readFileSync(rosterFile, 'utf8'); if (rs.includes('  // <roster-entries>')) fs.writeFileSync(rosterFile, rs.replace('  // <roster-entries>', `  ${key}: [],                                    // (the foes of ${id}: none of its own yet: design them, then name them here; foes/roster.js says why)\n  // <roster-entries>`)); }
  let woke = null;
  if (opts.wakeDoor) {
    const homeFile = path.join(root, 'src/game/home/level.js'), home = fs.readFileSync(homeFile, 'utf8');
    const re = new RegExp(`(\\{ id: '${door}',[^\\n]*?)target: null`);
    if (re.test(home)) { fs.writeFileSync(homeFile, home.replace(re, `$1target: '${id}'`)); woke = true; } else woke = false;
  }
  return { ok: true, dir, problems, woke, door };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = parse(process.argv.slice(2)), id = a._[0];
  if (!id) { console.log('usage: node tools/new-realm.mjs <id> --name "REALM NAME" [--tagline "..."] [--door <door id>] [--wake-door] [--root <dir>] [--no-check] [--dry]'); process.exit(1); }
  const root = a.root ? path.resolve(a.root) : HERE;
  const r = generate({ id, root, name: a.name, tagline: a.tagline, door: a.door, wakeDoor: a.flags.has('wake-door'), dry: a.flags.has('dry') });
  if (!r.ok) { for (const p of r.problems) console.log('PROBLEM', p); process.exit(1); }
  if (r.dry) { console.log('would write:'); for (const f of r.files) console.log('  ', f); process.exit(0); }
  console.log(`laid the foundation of '${id}' in src/game/${id}/ (brief.js, level.js, layout.js, index.js), tools/${id}-check.mjs, and registered it in src/game/realms.js`);
  if (a.flags.has('wake-door')) console.log(r.woke ? `woke the door '${r.door}' of Dawnhaven (src/game/home/level.js): its target is '${id}' now (home-check.mjs, home-bot.mjs and portal-test.mjs count the awake doors: update them, and re-pin Dawnhaven: node tools/world-hash.mjs --write home)` : `WARNING: no sleeping door '${r.door}' found in src/game/home/level.js`);
  const run = (args) => spawnSync('node', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const t = run(['tools/realm-travel.mjs', id]);
  console.log((t.stdout + t.stderr).trim().split('\n').slice(-3).join('\n'));
  if (!a.flags.has('no-check')) {
    const c = run(['tools/realm-check.mjs', id]);
    const lines = (c.stdout + c.stderr).trim().split('\n');
    console.log(lines.filter((l) => /^(FAIL|WAIVE)/.test(l)).concat(lines.slice(-1)).join('\n'));
    console.log(c.status === 0 ? '\nThe foundation builds and holds to the rules (the waivers above are the starter\'s to-dos).' : '\nThe checker found problems: see `node tools/realm-check.mjs ' + id + '`.');
  }
  console.log(`
Next (see .claude/skills/new-realm/SKILL.md):
  1. write the design: src/game/${id}/brief.js (identity, sky, parts of the country, goals in different situations, secrets)
  2. build the places: src/game/${id}/layout.js, and landforms in level.js
  3. see it:    node tools/realm-map.mjs ${id} ${id}-map.png      check it: node tools/realm-check.mjs ${id}      play it: ?world=${id}
  4. refresh the TRAVEL places after the layout changes: node tools/realm-travel.mjs ${id}`);
}
