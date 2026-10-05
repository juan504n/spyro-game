// The realm foundry tested as a whole: the starter realm holds to every rule; the generator lays the foundation of a new realm in a scratch copy of the repo (src, tools) - its files, its
// registration in realms.js and travel.js, a list of TRAVEL places that passes the place rules - and refuses what it should; the new realm passes tools/realm-check.mjs; and, with the browser
// step, it plays end to end in the running game (tools/realm-test.mjs: boot, light every goal by breathing fire, the finale, the ring of light, Dawnhaven, and back in restored). The scratch copy
// is removed afterwards.
//   node tools/foundry-test.mjs [--no-browser] [--keep]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkRealm } from './lib/realm-rules.mjs';
import { defineBrief } from '../src/game/realm/brief.js';
import { BRIEF as STARTER_BRIEF } from '../src/game/realm/starter/brief.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = !process.argv.includes('--no-browser'), keep = process.argv.includes('--keep');
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail); };

// ---- the starter realm: the golden example the generator copies ---------------------------------------------------------------------------------------------------
{
  const r = checkRealm('starter');
  check('the starter realm holds to every rule (its only waiver is the loop it still owes)', r.failed.length === 0 && r.results.filter((x) => x.waived).map((x) => x.id).join() === 'design.loops', `(${r.results.length} rules, ${r.failed.map((x) => x.id).join(' ')})`);
  const names = new Set(r.results.map((x) => x.id));
  check('the checker runs every family of rules', ['build.deterministic', 'spawn.firm', 'goals.reach', 'exit.ring', 'gems.total', 'props.roads', 'enemies.safe', 'design.journey', 'design.secrets.sealed', 'design.danger', 'design.leads'].every((k) => names.has(k)));
}

// ---- the brief: a design the engine can read -------------------------------------------------------------------------------------------------------------------
{
  // (the look of a goal is read when the hero first lights it: a colour of the wrong shape used to fail then, in the middle of the game, with "reading '0'" in the effects)
  const refuses = (goal) => { try { defineBrief({ ...STARTER_BRIEF, goals: STARTER_BRIEF.goals.map((g, i) => (i === 0 ? { ...g, ...goal } : g)) }); return false; } catch (e) { return /goal '/.test(e.message) ? e.message : false; } };
  const bad = { 'a spark that is a colour': { spark: [1, 0.8, 0.9] }, 'a beam without its two colours': { beam: { off: [0.5, 0.8, 1] } }, 'a glow of two numbers': { glow: [1, 0.7] }, 'a model that is not a name': { model: 3 } };
  const missed = Object.entries(bad).filter(([, g]) => !refuses(g)).map(([k]) => k);
  check('defineBrief refuses a goal whose look is the wrong shape', missed.length === 0, missed.length ? `(let through: ${missed.join('; ')})` : '');
  const fine = { spark: { c0: [1, 0.8, 0.9, 1], c1: [1, 0.5, 0.7, 0] }, beam: { off: [0.5, 0.8, 1], on: [1, 0.7, 0.9] }, glow: [1, 0.7, 0.9], wisp: [0.6, 0.9, 1], sparkle: [1, 0.8, 0.9], model: 'frostbloom' };
  check('... and takes the shape the engine reads', refuses(fine) === false);
  // (the ask that stands in front of a lantern: a trial that cannot be made is refused when the brief is read, naming the lantern and what is wrong)
  const badTrial = { 'bells: three': { trial: { kind: 'bells', at: [0, 0], n: 3 } }, 'a kind that is not one': { trial: { kind: 'riddle', at: [0, 0] } }, 'a siege of a moth': { trial: { kind: 'siege', at: [0, 0], waves: [['basic'], ['moth']] } }, 'a circuit of four pylons': { trial: { kind: 'circuit', pylons: [[0, 0], [9, 0], [18, 0], [27, 0]] } } };
  const letThrough = Object.entries(badTrial).filter(([, g]) => !refuses(g)).map(([k]) => k);
  check('defineBrief refuses a trial that cannot be made', letThrough.length === 0, letThrough.length ? `(let through: ${letThrough.join('; ')})` : '');
  check('... and takes one that can', refuses({ trial: { kind: 'bells', at: [0, 0] } }) === false && refuses({ trial: { kind: 'siege', at: [0, 0], waves: [['basic'], ['bell', 'thorn']] } }) === false);
}

// ---- the generator, in a scratch copy of the repo ---------------------------------------------------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-'));
let server = null;
try {
  for (const d of ['src', 'tools']) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
  for (const f of ['package.json', 'vite.config.js', 'index.html']) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  const run = (args, opts = {}) => spawnSync('node', args, { cwd: tmp, encoding: 'utf8', ...opts });

  const g = run(['tools/new-realm.mjs', 'scratchvale', '--name', 'SCRATCH VALE', '--tagline', 'A TEST REALM']);
  check('the generator lays the foundation of a realm', g.status === 0 && /laid the foundation of 'scratchvale'/.test(g.stdout), g.status === 0 ? '' : (g.stdout + g.stderr).slice(-400));
  const has = (f) => fs.existsSync(path.join(tmp, f));
  check('... its folder, its check and its places', ['brief.js', 'level.js', 'layout.js', 'index.js', 'travel.js'].every((f) => has(`src/game/scratchvale/${f}`)) && has('tools/scratchvale-check.mjs'));
  const text = (f) => fs.readFileSync(path.join(tmp, f), 'utf8');
  check('... registered in realms.js and travel.js', /scratchvale: SCRATCHVALE,/.test(text('src/game/realms.js')) && /TRAVEL_SCRATCHVALE,/.test(text('src/game/travel.js')));
  const brief = text('src/game/scratchvale/brief.js');
  check('... renamed all through (no trace of the starter\'s name or id)', !/STARTER VALE|id: 'starter'|door: 'starter'/.test(brief + text('src/game/scratchvale/layout.js') + text('src/game/scratchvale/index.js')) && /id: 'scratchvale'/.test(brief) && /SCRATCH VALE/.test(brief));
  check('... with a noise seed of its own', !/seed: 9001/.test(brief));
  check('... and the realm passes the checker (its to-dos waived)', /all rules hold/.test(g.stdout), (g.stdout.match(/^(FAIL|WAIVE).*/gm) || []).join(' | ').slice(0, 300));

  // the rules bite: the same realm with a poorer cast is refused (a rule that nothing can fail is not a rule)
  {
    const lay = path.join(tmp, 'src/game/scratchvale/layout.js'), orig = fs.readFileSync(lay, 'utf8');
    const NEW = /'(slinger|hog|mole|warden|pup|moth|caller|thief|rime)'(?=[,\]])/g;
    const kinds = [...new Set([...orig.matchAll(NEW)].map((m) => m[1]))];
    const refused = (keep) => {
      fs.writeFileSync(lay, orig.replace(NEW, (m, k) => (keep.includes(k) ? m : "'basic'")));
      const r = run(['tools/realm-check.mjs', 'scratchvale']);
      fs.writeFileSync(lay, orig);
      return /^FAIL enemies\.cast/m.test(r.stdout);
    };
    check('the checker refuses a realm whose Snuffers are of the three kinds of old (enemies.cast)', kinds.length >= 3 && refused([]), `(the realm has ${kinds.join(', ')})`);
    check('... and one that has two of the new foes (a cast is three)', refused(kinds.slice(0, 2)));
    check('... and takes the realm back with its cast', !refused(kinds));
  }

  // the trial rules bite too: the same realm with its asks alike, or with a trial where it cannot be done, is refused by the rule that holds it, and for the reason (trials.mix, trials.fair)
  {
    const bf = path.join(tmp, 'src/game/scratchvale/brief.js'), orig = fs.readFileSync(bf, 'utf8');
    const ISLE = "trial: { kind: 'plates', at: [-19, 71], r: 4.4 }", PEAK = "trial: { kind: 'bells', at: [4, -138], yaw: Math.PI }", FIRST = "hintAt: [8, 140], hintR: 9 }";
    const said = (swap) => {
      let src = orig;
      for (const [x, y] of swap) { if (!src.includes(x)) return `the starter has changed: '${x.slice(0, 40)}' is gone`; src = src.replace(x, y); }
      fs.writeFileSync(bf, src);
      const r = run(['tools/realm-check.mjs', 'scratchvale']);
      fs.writeFileSync(bf, orig);
      return r.stdout + r.stderr;
    };
    const bites = (name, swap, re) => { const out = said(swap), ok = re.test(out); check(name, ok, ok ? '' : `(${(out.match(/^(FAIL|the starter).*/gm) || ['no FAIL']).join(' | ').slice(0, 240)})`); };
    const isle = (t) => [[ISLE, `trial: ${t}`]];
    bites('trials.mix refuses a realm whose asks are the same kind twice running', [[PEAK, "trial: { kind: 'plates', at: [4, -138], r: 4.4 }"]], /^FAIL trials\.mix.*plain > plates > plates/m);
    bites('... and one whose first lantern is not the plain one', [[FIRST, "hintAt: [8, 140], hintR: 9, trial: { kind: 'bells', at: [12, 120], yaw: 0 } }"]], /^FAIL trials\.mix.*\(bells > plates > bells/m);
    bites('trials.fair refuses a trial in the water', isle("{ kind: 'plates', at: [-4, 56], r: 4.4 }"), /^FAIL trials\.fair.*of its ground are wet or under a prop/m);
    bites('... on a slope', isle("{ kind: 'plates', at: [35, 20], r: 4.4 }"), /^FAIL trials\.fair.*of its ground are over 0\.9 m off level/m);
    bites('... where the hero cannot walk to it', isle("{ kind: 'plates', at: [-45, 50], r: 4.4 }"), /^FAIL trials\.fair.*the hero cannot walk to it/m);
    bites('... too far from its lantern to be found (110 m)', isle("{ kind: 'plates', at: [2, 160], r: 4.4 }"), /^FAIL trials\.fair.*114 m from its lantern/m);
    const PYL = '[[0,162],[-4,130],[2,110],[2,92],[-14,80],[-28,66],[-34,52]]';                   // (the first pylon is 116 m from the lantern and the last 33: a circuit is found by the nearest)
    bites('... a circuit whose clock is too little for the way (14 s for a way of 126 m)', isle(`{ kind: 'circuit', pylons: ${PYL}, time: 14 }`), /^FAIL trials\.fair.*14 s is too little for \d+ m/m);
    bites('... where a fixed prop stands on its ground (a torch stand of the village)', isle("{ kind: 'plates', at: [0.4, 149], r: 4.4 }"), /^FAIL trials\.fair.*1 of 37 points of its ground are wet or under a prop \(7\.0,149\.0\)/m);
    bites('... a circuit whose way is dry and clear and too steep', isle("{ kind: 'circuit', pylons: [[-76,114],[-60,114],[-44,114],[-28,114],[-12,114]] }"), /^FAIL trials\.fair.*the way from pylon 1 to 2 is wet, blocked or too steep at -68\.5,114\.0/m);
    bites('... a circuit whose way crosses water', isle("{ kind: 'circuit', pylons: [[0,100],[0,80],[0,60],[0,40],[0,20]] }"), /^FAIL trials\.fair.*the way from pylon 2 to 3 is wet, blocked or too steep/m);
    bites('... a circuit with a pylon where he cannot walk', isle("{ kind: 'circuit', pylons: [[0,150],[-4,130],[2,110],[-45,50],[2,92]] }"), /^FAIL trials\.fair.*pylon 4 is not on ground he can walk to/m);
    bites('... a Pilferling with no country to run in', isle("{ kind: 'thief', at: [0, 52], spawn: [-4, 52] }"), /^FAIL trials\.fair.*of a ring of 14 m round the Pilferling are ground to run on/m);
    // (the ground of a trial is made level where the country is not: a ring of plates on a hillside the ruins stand on is level, and is refused where it says it wants the ground as it is)
    const hill = (extra) => isle(`{ kind: 'plates', at: [-69, 75], r: 4.4${extra} }`);
    check('the ground of a trial is made level (a ring of plates on a hillside passes) unless the brief says it wants the ground as it is (pad: false: refused, the hillside is not level)', !/^FAIL/m.test(said(hill(''))) && /^FAIL trials\.fair.*of its ground are over 0\.9 m off level/m.test(said(hill(', pad: false'))));
    const out = said(isle(`{ kind: 'circuit', pylons: ${PYL} }`));
    check('... and takes the same circuit with the clock the machine gives it (a rule that refuses everything is not a rule either)', /^PASS trials\.fair/m.test(out) && /^PASS trials\.mix/m.test(out) && !/^FAIL/m.test(out), (out.match(/^FAIL.*/gm) || []).join(' | ').slice(0, 200));
  }

  const again = run(['tools/new-realm.mjs', 'scratchvale', '--name', 'SCRATCH VALE']);
  check('the generator refuses an id that is taken', again.status !== 0 && /exists already|registered/.test(again.stdout));
  check('... a bad id', run(['tools/new-realm.mjs', 'Bad_Id']).status !== 0);
  check('... a name in lower case', run(['tools/new-realm.mjs', 'okid', '--name', 'lower case']).status !== 0);
  check('... and the starter\'s own name', run(['tools/new-realm.mjs', 'starter']).status !== 0);

  const c = run(['tools/scratchvale-check.mjs']);
  check('the realm\'s own check script runs and passes', c.status === 0 && /all checks passed/.test(c.stdout), c.status === 0 ? '' : c.stdout.slice(-300));
  const tr = run(['tools/realm-travel.mjs', 'scratchvale', '--dry']);
  check('the TRAVEL places can be found again, and none is left out', tr.status === 0 && !/PROBLEM/.test(tr.stdout) && (tr.stdout.match(/\{ id:/g) || []).length >= 6, `(${(tr.stdout.match(/\{ id:/g) || []).length} places)`);

  // ---- and in the running game ---------------------------------------------------------------------------------------------------------------------------------------
  if (browser) {
    const port = 5300 + Math.floor(Math.random() * 600);
    server = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port)], { cwd: tmp, env: { ...process.env, GV_HMR: '0' }, stdio: 'ignore' });
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { await new Promise((r) => setTimeout(r, 500)); try { up = (await fetch(`http://127.0.0.1:${port}/`)).ok; } catch (e) { /* not yet */ } }
    check('a dev server serves the scratch copy', up);
    if (up) {
      const t = spawnSync('node', [path.join(ROOT, 'tools/realm-test.mjs'), 'scratchvale'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GV_URL: `http://127.0.0.1:${port}/` }, timeout: 600000 });
      const lines = (t.stdout || '').split('\n').filter((l) => /^(PASS|FAIL)/.test(l));
      check('the generated realm plays end to end in the running game', t.status === 0 && lines.length >= 9, lines.filter((l) => l.startsWith('FAIL')).join(' | ').slice(0, 400) || `(${lines.length} steps)`);
      // (from the scratch copy: the walk map's routes come from the realm built by Node, which must be the one the server serves)
      const b = run(['tools/realm-bot.mjs', 'scratchvale'], { env: { ...process.env, GV_URL: `http://127.0.0.1:${port}/` }, timeout: 600000 });
      check('... and its goals are walked, in order, by the real controller', b.status === 0 && /routes walked with the real controller/.test(b.stdout), (b.stdout || '').split('\n').filter((l) => /^FAIL/.test(l)).join(' | ').slice(0, 400));
    }
  }
} finally {
  if (server) server.kill();
  if (keep) console.log('kept', tmp); else fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} FAILED` : '\nall foundry checks passed');
process.exitCode = failed ? 1 : 0;
