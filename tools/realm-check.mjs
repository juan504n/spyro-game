// A realm held to the rules of a good realm: the hard ones (it builds the same twice, the hero starts on firm ground, every goal can be reached, the treasure adds up...) and the design
// principles of the original games' worlds (every goal in a place of its own kind, parts with levels, loops, secrets, danger that grows with the journey...). See tools/lib/realm-rules.mjs
// for each rule and .claude/skills/new-realm for the workflow. Exit code 1 when a rule fails (a rule the realm's brief waives, with its reason, does not).
//   node tools/realm-check.mjs <realm id> [more ids]       (default: every world of src/game/realms.js with kind realm; "starter" is the realm the generator starts from)
import { checkRealm } from './lib/realm-rules.mjs';
import { REALMS } from '../src/game/realms.js';
import { resolveRealm } from './headless-world.mjs';

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(REALMS).filter((k) => REALMS[k].kind === 'realm');
let failed = 0;
for (const id of ids) {
  if (!REALMS[id] && id !== 'starter') { console.log(`FAIL no world '${id}' in src/game/realms.js (${Object.keys(REALMS).join(', ')}, or 'starter')`); failed++; continue; }
  console.log(`\n=== ${resolveRealm(id).name} (${id}) ===`);
  const r = checkRealm(id, { log: (l) => console.log(l) });
  failed += r.failed.length;
  console.log(r.failed.length ? `${r.failed.length} FAILED (${r.hardFailed.length} hard)` : `all rules hold (${r.results.length} checked, ${r.results.filter((x) => x.waived).length} waived)`);
}
process.exitCode = failed ? 1 : 0;
