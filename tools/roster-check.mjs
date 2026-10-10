// WHICH FOES LIVE WHERE, held across all the worlds (src/game/foes/roster.js, docs/DESIGN.md round thirty-eight): a kind of foe is one world's own, and no other world has it.
//   - every kind of KINDS belongs to exactly one roster (the Guardian's Court, the Snuffers' own stronghold, is the one world that shares: the three Snuffers the game began with)
//   - every roster names kinds that exist; every realm has a roster of at least three kinds
//   - every world BUILT headlessly places only foes of its roster: the placed ones, the waves of its sieges, the foes its briefed missions bring (and nothing in Dawnhaven)
//   - a Smokecaller calls one of its own world's foes; a foe the roster maps for a tool (foeOf) is in the roster
//   node tools/roster-check.mjs
import { KINDS, KIND_IDS } from '../src/game/foes/kinds.js';
import { ROSTERS, SHARED_ROSTERS, rosterOf, homeOf, foeOf, summonOf } from '../src/game/foes/roster.js';
import { REALMS } from '../src/game/realms.js';
import { buildHeadless } from './headless-world.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail); };

check('every roster names kinds that exist', Object.values({ ...ROSTERS, ...SHARED_ROSTERS }).every((r) => r.every((k) => KINDS[k])));
const owners = Object.fromEntries(KIND_IDS.map((k) => [k, Object.keys(ROSTERS).filter((id) => ROSTERS[id].includes(k))]));
check('every kind of foe belongs to exactly one world', KIND_IDS.every((k) => owners[k].length === 1), KIND_IDS.filter((k) => owners[k].length !== 1).map((k) => `${k}: ${owners[k].join('+') || 'nobody'}`).join(', '));
const realms = Object.keys(REALMS).filter((id) => REALMS[id].kind === 'realm');
check('every realm has a roster of at least three kinds, and no two rosters share a kind', realms.every((id) => (ROSTERS[id] || []).length >= 3) && new Set(Object.values(ROSTERS).flat()).size === Object.values(ROSTERS).flat().length, realms.map((id) => `${id} ${(ROSTERS[id] || []).length}`).join(', '));
check('the Guardian\'s Court shares only the three Snuffers the game began with', SHARED_ROSTERS.guardian.join() === 'basic,bell,thorn' && SHARED_ROSTERS.guardian.every((k) => ROSTERS.gloaming.includes(k)));
check('foeOf: a kind of another world is mapped to the nearest in danger of the world\'s own; one of its own stays', realms.every((id) => KIND_IDS.every((k) => rosterOf(id).includes(foeOf(id, k)) && (!rosterOf(id).includes(k) || foeOf(id, k) === k))));
check('a Smokecaller calls a walker or flyer of its own world, never a Pilferling', realms.every((id) => rosterOf(id).includes(summonOf(id)) && summonOf(id) !== 'thief'), realms.map((id) => `${id}: ${summonOf(id)}`).join(', '));
check('Dawnhaven has no roster and no foes', rosterOf('home') === null && buildHeadless('home').gp.enemies.length === 0);

for (const id of [...realms, 'guardian']) {
  if (!REALMS[id]) continue;
  const W = buildHeadless(id), gp = W.gp, R = rosterOf(id);
  const called = [...(gp.trials || []).flatMap((t) => (t.waves || []).flat()), ...((gp.boss && gp.boss.helpers) || []).flat().map((q) => q.variant)];          // (and the helpers a boss calls out of the floor)
  const seen = [...new Set([...gp.enemies.map((e) => e.variant), ...called])];
  const alien = seen.filter((k) => !R.includes(k));
  check(`${id}: every foe placed or called is of its roster (${R.join(', ')})`, alien.length === 0, alien.length ? `foreign: ${alien.join(', ')}` : `${gp.enemies.length} placed`);
  if (id !== 'guardian') for (const k of seen) check(`${id}: ${k} lives nowhere else`, homeOf(k) === id);
}
console.log(failed ? `${failed} FAILED` : 'all roster checks passed');
process.exitCode = failed ? 1 : 0;
