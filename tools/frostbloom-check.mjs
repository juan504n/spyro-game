// The checks of FROSTBLOOM HOLLOW: every rule of tools/realm-check.mjs (tools/lib/realm-rules.mjs has them all) and whatever is this realm's own, which goes below. No dev server needed:
//   node tools/frostbloom-check.mjs
import { checkRealm } from './lib/realm-rules.mjs';

const { failed, env } = checkRealm('frostbloom', { log: (l) => console.log(l) });
let own = 0;
const check = (name, ok, detail) => { if (!ok) own++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };

// ---- this realm's own checks (env: grid, collision, gp, level, ctx, walk, walkShut, h) ----------------------------------------------------------------------------
void env; void check;

console.log(failed.length + own ? `\n${failed.length + own} FAILED` : '\nall checks passed');
process.exitCode = failed.length + own ? 1 : 0;
