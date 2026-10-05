// The foes' brains (src/game/foes/) held to what their design says, headlessly: no server, no browser. Each brain is played at 60 Hz on a floor of its own against a model of the hero (tools/lib/foesim.mjs:
// the Player's numbers), by a hero who plays it right, one who plays it wrong and one who stands still.
//   node tools/foe-test.mjs
//
//   the table     every foe has its row: a model, a hint, a drop, a danger, a brain that has what a brain must
//   the matrix    what a flame and a ram do to each foe from the front, the side and the back, in each of its states (written out here, not derived: the code is held to the design)
//   the tells     no foe can hurt the hero until its warning has run: a ball takes 2 s from the wind-up, a charge 0.9 s from the paw, the ground cracks 0.8 s before it bursts, a shield is raised for 1.1 s...
//   the play      the right play wins and is never hurt; standing still is hurt by every foe that attacks; the wrong verb never wins
//   the rest      the same seed plays the same fight, a Smokecaller never has more than three and takes its Snuffers with it, a keg's blast, a hog that hits a wall is stunned, a thief that is cornered gives up
import { simulate, HERO, FUSE } from './lib/foesim.mjs';
import { PLAYS, judge, dirTo, dist, still, rush } from './lib/foe-plays.mjs';
import { KINDS, FOE_IDS, KIND_IDS, DANGER, BRAINS, makeFoe, struckBy, explode, SLING, CHARGE, BURROW, WARD, SWOOP, CALL, FLEE, hitsOn } from '../src/game/foes/index.js';
import { ENEMY_DROPS } from '../src/game/economy.js';

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : detail); };
const hyp = Math.hypot;
const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);
const SEEDS = [1, 2, 3, 4, 5, 6];
const sum = (a) => a.reduce((x, y) => x + y, 0);

// ---- the table -----------------------------------------------------------------------------------------------------------------------------------
{
  check('every kind has its row, a model, a name, drops that the gem budget knows, a danger, and a hint where it teaches something', KIND_IDS.every((k) => KINDS[k].model && KINDS[k].name && ENEMY_DROPS[k] && ENEMY_DROPS[k].length && DANGER[k] !== undefined) && FOE_IDS.every((k) => KINDS[k].hint && KINDS[k].hint.length > 20), KIND_IDS.join(' '));
  check('there are nine more kinds than the original three (the Rimeling and eight with a brain of their own)', KIND_IDS.length === 12 && FOE_IDS.length === 8, `${KIND_IDS.length} kinds, ${FOE_IDS.length} brains`);
  check('every brain has what a brain must (init, step, struck, pose) and every kind with a brain has one', FOE_IDS.every((k) => { const B = BRAINS[KINDS[k].brain]; return B && ['init', 'step', 'struck', 'pose'].every((f) => typeof B[f] === 'function'); }));
  check('every foe falls to one hit of the right thing (hp 1), as the Snuffers always did', KIND_IDS.every((k) => KINDS[k].hp === 1));
  check('the foes that ask more of the hero pay more: a Lidwarden, a Ramhog, a Smokecaller pay at least the Bell Snuffer\'s 7; a Pilferling, a prize, pays more than a Thorn Snuffer', ['warden', 'hog', 'caller'].every((k) => sum(ENEMY_DROPS[k]) >= 7) && sum(ENEMY_DROPS.thief) > sum(ENEMY_DROPS.thorn));
}

// ---- the matrix ------------------------------------------------------------------------------------------------------------------------------------
{
  // the foe stands at the origin looking down +z (yaw 0): a hero at +z is in front of it, at -z behind it, at +x to its side
  const at = { front: [0, 6], back: [0, -6], side: [6, 0] };
  const out = (kind, state, side, attack) => { const e = makeFoe(kind, { x: 0, z: 0 }); e.state = state; return struckBy(e, attack, ...at[side]); };
  const rows = [
    // [kind, state, side, flame, ram]
    ['slinger', 'kite', 'front', 'kill', 'kill'], ['slinger', 'windup', 'back', 'kill', 'kill'],
    ['hog', 'stalk', 'front', 'ring', 'ring'], ['hog', 'stalk', 'side', 'kill', 'kill'], ['hog', 'skid', 'back', 'kill', 'kill'], ['hog', 'rush', 'front', 'ring', 'ring'], ['hog', 'rush', 'side', 'kill', 'kill'], ['hog', 'stunned', 'front', 'kill', 'kill'],
    ['mole', 'idle', 'front', 'ignore', 'ignore'], ['mole', 'track', 'side', 'ignore', 'ignore'], ['mole', 'crack', 'front', 'ignore', 'ignore'], ['mole', 'dazed', 'front', 'kill', 'kill'], ['mole', 'dig', 'side', 'ignore', 'ignore'],
    ['warden', 'advance', 'front', 'ring', 'ring'], ['warden', 'raise', 'front', 'ring', 'ring'], ['warden', 'advance', 'side', 'kill', 'kill'], ['warden', 'advance', 'back', 'kill', 'kill'], ['warden', 'open', 'front', 'kill', 'kill'],
    ['pup', 'run', 'front', 'boom', 'boom'], ['pup', 'idle', 'back', 'boom', 'boom'],
    ['moth', 'circle', 'front', 'kill', 'kill'], ['moth', 'land', 'back', 'kill', 'kill'],
    ['caller', 'kite', 'front', 'kill', 'kill'], ['thief', 'run', 'back', 'kill', 'kill'],
  ];
  const bad = [];
  for (const [kind, state, side, fl, rm] of rows) {
    const a = out(kind, state, side, 'flame'), b = out(kind, state, side, 'ram');
    if (a !== fl || b !== rm) bad.push(`${kind}/${state}/${side}: flame ${a} (want ${fl}) ram ${b} (want ${rm})`);
  }
  check(`the matrix of what a flame and a ram do to each foe, from each side, in each state (${rows.length} cases)`, bad.length === 0, bad.join(' | '));
  const deg = (d) => [Math.sin((d * Math.PI) / 180) * 6, Math.cos((d * Math.PI) / 180) * 6];
  const hog = makeFoe('hog', { x: 0, z: 0 }); hog.state = 'stalk';
  const brow = (d) => struckBy(hog, 'ram', ...deg(d));
  check('a hog\'s brow is a quarter of the circle: 40 degrees off its nose rings, 70 degrees does not', brow(0) === 'ring' && brow(40) === 'ring' && brow(-40) === 'ring' && brow(70) === 'kill' && brow(-70) === 'kill' && brow(180) === 'kill');
  const lid = makeFoe('warden', { x: 0, z: 0 }); lid.state = 'advance';
  const shield = (d) => struckBy(lid, 'flame', ...deg(d));
  check('a Lidwarden\'s shield is wider than a hog\'s brow: 60 degrees off its front still rings, 75 does not', shield(60) === 'ring' && shield(-60) === 'ring' && shield(75) === 'kill' && shield(-75) === 'kill');
  // the geometry of the flame and the ram decides what reaches a hanging moth: out of reach of a hero on the ground, within reach of one at the top of a jump
  const m = makeFoe('moth', { x: 0, z: 0 });
  const heroAt = (y, flame) => ({ x: 0, y, z: -6, flameT: flame ? 0.3 : 0, chargeT: flame ? 0 : 0.1, mouth: { x: 0, z: -5 }, dirx: 0, dirz: 1,
    flameHits(x, yy, z, r, dy = 2.4) { const d = hyp(x - this.mouth.x, z - this.mouth.z); return this.flameT > 0 && d < HERO.flameRange + r && Math.abs(yy - (this.y + 0.6)) <= dy; },
    chargeHits(x, yy, z, r) { return this.chargeT > 0 && hyp(x - this.x, z - this.z) < 2.4 + r && Math.abs(yy - this.y) <= 2.2; } });
  check('a Dusk Moth that hangs over the hero is out of reach of a flame from the ground and of a ram, and in reach of a flame at the top of a jump',
    hitsOn(m, heroAt(0, true)).length === 0 && hitsOn(m, heroAt(0, false)).length === 0 && hitsOn(Object.assign(m, { flameCd: 0 }), heroAt(2.0, true)).length === 1, `(it hangs ${f1(m.y + m.K.cy)} m up)`);
}

// ---- the tells -------------------------------------------------------------------------------------------------------------------------------------
const gapOf = (r, a, b) => { const ea = r.events.find((e) => e.type === a); if (!ea) return null; const eb = r.events.find((e) => e.type === b && e.t >= ea.t); return eb ? eb.t - ea.t : null; };
{
  const rows = [
    ['slinger', 'tell', 'hurt', SLING.windup + SLING.flight - 0.02, 'a ball takes the wind-up and its flight to come down'],
    ['hog', 'tell', 'hurt', CHARGE.paw, 'a hog paws the ground before it runs'],
    ['mole', 'tell', 'burst', BURROW.crack - 0.02, 'the ground cracks before it bursts'],
    ['warden', 'tell', 'bash', WARD.raise - 0.02, 'the shield is raised before it bashes'],
    ['pup', 'tell', 'boom', FUSE.armed - 0.02, 'a fuse burns before a keg goes off at his feet'],
    ['moth', 'tell', 'hurt', SWOOP.tell, 'a moth rears before it dives'],
  ];
  for (const [kind, a, b, min, what] of rows) {
    const gaps = [];
    for (const seed of SEEDS) for (const d of [3, 6, 10, 14]) {
      const g = gapOf(simulate({ kind, hero: { x: 0, z: d, yaw: Math.PI }, policy: still, T: 14, seed }), a, b);
      if (g !== null) gaps.push(g);
    }
    check(`${what} (never under ${f2(min)} s over ${gaps.length} fights)`, gaps.length >= 8 && Math.min(...gaps) >= min, `(the least: ${f2(Math.min(...gaps))} s)`);
  }
  // the numbers of the tells, held to what a person can use
  check('the warnings are long enough to act on: a ball 2 s, a paw 0.9 s, a crack 0.8 s, a raised shield 1.1 s, a rear 0.7 s, a fuse 1.2 s before it may go off at the hero', SLING.windup + SLING.flight >= 2 && CHARGE.paw >= 0.9 && BURROW.crack >= 0.8 && WARD.raise >= 1.1 && SWOOP.tell >= 0.7 && FUSE.armed >= 1.2);
  check('what is thrown or driven can be avoided: the ring stops following the hero 0.5 s before the ball lands, a hog\'s line is fixed 0.25 s before it sets off, a dive is aimed 0.25 s before it', SLING.lock >= 0.5 && CHARGE.lock >= 0.25 && SWOOP.lock >= 0.25);
  check('what keeps away and what flees is slower than a run, so that it can always be caught: a Slinger and a Smokecaller back off at under 6 m/s, a Pilferling runs at under 10 m/s (a run is 11.5, a ram 24), a mound follows at 6',
    SLING.panic < HERO.run / 2 && CALL.panic < HERO.run / 2 && FLEE.speed < HERO.run && FLEE.speed * FLEE.boost < HERO.run * 1.05 && BURROW.under < HERO.run);
  check('a hog runs faster than a hero (15 against 11.5) for under 1.1 s: it is a line to step off, not a race', CHARGE.speed > HERO.run && CHARGE.maxT <= 1.1 && CHARGE.speed * CHARGE.maxT <= 17);
}

// ---- the play --------------------------------------------------------------------------------------------------------------------------------------
// (the plays are tools/lib/foe-plays.mjs: the same ones tools/foe-bot.mjs plays in the running game with the real controller)
const outcome = (r) => ({ killed: r.killedAt !== null, hurts: r.hurts, blows: r.events.filter((e) => e.type === 'struck'), boomed: r.events.some((e) => e.type === 'boom'), left: r.foes.filter((f) => f !== r.foe && f.state !== 'dead').length });
const win = (kind, policy, extra = {}, tries = SEEDS, T = 25) => {
  const rs = tries.map((seed) => simulate({ kind, policy, T, seed, ...extra }));
  return { n: rs.length, killed: rs.filter((r) => r.killedAt !== null).length, hurts: rs.map((r) => r.hurts), worst: Math.max(...rs.map((r) => r.hurts)), time: Math.max(...rs.map((r) => r.killedAt ?? Infinity)), rs };
};
{
  for (const pl of PLAYS.filter((p) => p.sim !== false)) {
    const seeds = pl.seeds || SEEDS;
    const outs = seeds.map((seed) => outcome(simulate({ kind: pl.kind, policy: pl.policy, T: pl.T, seed, hero: { x: 0, z: pl.at, yaw: Math.PI } })));
    const fails = outs.map((o) => judge(pl.want, o)).filter(Boolean);
    check(pl.say, fails.length <= (pl.tol || 0), `(${outs.length - fails.length}/${outs.length} runs as wanted${fails.length ? ': ' + fails[0] : ''})`);
  }
  {
    // led into a post: the charge ends against it, and a stunned hog falls to anything
    const setup = { kind: 'hog', foe: { x: 0, z: 0, yaw: 0 }, hero: { x: 0, z: 10, yaw: Math.PI }, solids: [{ x: 0, z: 16, r: 1.5 }], seed: 2, policy: (s) => (s.foe.state === 'rush' || (s.foe.state === 'paw' && s.foe.locked) ? { dx: 1, dz: 0, mag: 1 } : { dx: 0, dz: 0, mag: 0 }) };
    const r = simulate({ ...setup, T: 6 });
    const bonk = r.events.find((e) => e.type === 'bonk');
    const after = bonk ? simulate({ ...setup, T: bonk.t + 0.3 }) : null;
    check('Ramhog: a hog that runs into a post is stunned where the post is, and the hero who stepped aside is not hurt', !!bonk && after.foe.state === 'stunned' && r.hurts === 0 && bonk.z < 16, bonk ? `(bonk at ${f1(bonk.t)} s, ${f1(bonk.z)} m, then ${after.foe.state})` : '(no bonk)');
  }
  {
    // a hero who fights what a Smokecaller calls: it calls again every 7 s, and never has more than three
    const r = simulate({ kind: 'caller', hero: { x: 0, z: 14, yaw: Math.PI }, T: 40, seed: 4, policy: (s) => {
      const live = s.foes.filter((m) => m.minion && m.state !== 'dead').sort((a, b) => dist(s.hero, a) - dist(s.hero, b))[0];
      if (live && dist(s.hero, live) < 6) { const [dx, dz] = dirTo(s.hero, live); return { dx, dz, mag: 1, charge: dist(s.hero, live) < 4 }; }
      return { dx: 0, dz: 0, mag: 0 };
    } });
    const most = (rr, T) => { const ms = rr.foes.filter((x) => x.minion); let m = 0; for (let t = 0; t < T; t += 0.1) m = Math.max(m, ms.filter((x) => x.born <= t && (x.diedAt === undefined || x.diedAt > t)).length); return m; };
    check('Smokecaller: it calls again every 7 s whatever he does to what it called, and never has more than three alive', r.events.filter((e) => e.type === 'summon').length >= 4 && most(r, 40) <= CALL.cap && most(r, 40) >= 1, `(${r.events.filter((e) => e.type === 'summon').length} calls, at most ${most(r, 40)} alive)`);
    const q = simulate({ kind: 'caller', hero: { x: 0, z: 25, yaw: Math.PI }, T: 60, seed: 1, policy: still });
    check('Smokecaller: left alone with a hero who does nothing it still never has more than three of them at once', most(q, 60) <= CALL.cap, `(${q.foes.filter((x) => x.minion).length} called, at most ${most(q, 60)} alive)`);
    const d = simulate({ kind: 'caller', hero: { x: 0, z: 14, yaw: Math.PI }, T: 40, seed: 5, policy: (s) => (s.foes.filter((m) => m.minion).length >= 2 ? { ...(() => { const [dx, dz] = dirTo(s.hero, s.foe); return { dx, dz }; })(), mag: 1, charge: dist(s.hero, s.foe) < 6 } : { dx: 0, dz: 0, mag: 0 }) });
    const mins = d.foes.filter((m) => m.minion);
    check('Smokecaller: when it falls, the Snuffers it called go up in smoke with it (dismissed: no gems, not counted as beaten)', d.killedAt !== null && mins.length >= 2 && mins.some((m) => m.how === 'dismissed') && mins.every((m) => m.state === 'dead' || m.diedAt === undefined), `(${mins.length} called, ${mins.filter((m) => m.how === 'dismissed').length} gone with it)`);
  }
  {
    // an alley closed at one end: a thief driven into it has nowhere to go
    const alley = [];
    for (let z = -13; z <= 1; z += 1.5) { alley.push({ x: -3.5, z, r: 1 }, { x: 3.5, z, r: 1 }); }
    for (let x = -3.5; x <= 3.5; x += 1.5) alley.push({ x, z: -13, r: 1 });
    const r = simulate({ kind: 'thief', foe: { x: 0, z: -6 }, hero: { x: 0, z: 9, yaw: Math.PI }, solids: alley, T: 12, seed: 3, policy: (s) => { const [dx, dz] = dirTo(s.hero, s.foe); return { dx, dz, mag: 0.6 }; } });
    const cow = r.events.find((e) => e.type === 'tell' && e.what === 'cower');
    check('Pilferling: driven into a blind alley it puts its hands up (a cower) at the end of it rather than run through the wall', !!cow && Math.abs(cow.x) < 3.5 && cow.z < -9 && cow.z > -13, cow ? `(at ${f1(cow.x)}, ${f1(cow.z)}, ${f1(cow.t)} s)` : '(never)');
    const q = simulate({ kind: 'thief', hero: { x: 0, z: 10, yaw: Math.PI }, T: 20, seed: 3, policy: (s) => { const [dx, dz] = dirTo(s.hero, s.foe); return { dx, dz, mag: 0.7 }; } });
    check('Pilferling: it jeers when it has a lead (a chase has its moments)', q.events.some((e) => e.type === 'tell' && e.what === 'jeer'));
    const j = simulate({ kind: 'thief', hero: { x: 0, z: 10, yaw: Math.PI }, T: 20, seed: 2, policy: rush({ ram: 9 }) });
    check('Pilferling: a ram that comes straight at it is sidestepped (it is not there at the last moment: the ram cannot turn)', j.events.filter((e) => e.type === 'tell' && e.what === 'juke').length >= 1, `(${j.events.filter((e) => e.what === 'juke').length} sidesteps)`);
  }
}

// ---- the rest --------------------------------------------------------------------------------------------------------------------------------------
{
  const key = (r) => r.events.map((e) => `${e.t.toFixed(3)}:${e.type}:${e.what || ''}:${e.x !== undefined ? e.x.toFixed(2) : ''}`).join(',') + `|${r.hurts}|${r.killedAt}`;
  const bad = [];
  for (const kind of FOE_IDS) {
    const pol = (s) => ({ dx: Math.cos(s.t), dz: Math.sin(s.t), mag: 0.7, flame: Math.sin(s.t * 3) > 0.9 });
    if (key(simulate({ kind, policy: pol, T: 12, seed: 9 })) !== key(simulate({ kind, policy: pol, T: 12, seed: 9 }))) bad.push(kind + ' (not repeatable)');
  }
  check('the same seed plays the same fight', bad.length === 0, bad.join(', '));
  const where = (kind, seed) => { const r = simulate({ kind, hero: { x: 0, z: 90, yaw: Math.PI }, policy: still, T: 25, seed }); return [r.foe.x, r.foe.z]; };
  check('a foe that loiters chooses where on another seed (its patrol is not the same walk every time)', ['slinger', 'hog', 'warden', 'pup', 'caller', 'thief'].every((k) => { const a = where(k, 9), b = where(k, 10); return hyp(a[0] - b[0], a[1] - b[1]) > 0.05; }));
  const nums = [];
  for (const kind of FOE_IDS) {
    const r = simulate({ kind, policy: (s) => ({ dx: Math.cos(s.t * 2), dz: Math.sin(s.t * 2), mag: 1, flame: true }), T: 10, seed: 4 });
    for (const e of r.events) for (const k of ['x', 'y', 'z', 'r']) if (e[k] !== undefined && !Number.isFinite(e[k])) nums.push(`${kind}:${e.type}.${k}`);
    if (![r.foe.x, r.foe.y, r.foe.z, r.foe.yaw].every(Number.isFinite)) nums.push(kind + ' position');
  }
  check('every number a brain says or keeps is finite', nums.length === 0, nums.join(' '));
  {
    // the keg: its blast is 3.4 m; it takes the Snuffers (and kegs) in it and not the ones beyond; the hero is hurt in it and not outside
    const go = (hx, hz) => {
      const r = simulate({ kind: 'pup', foe: { x: 0, z: 0 }, hero: { x: hx, z: hz, yaw: Math.PI }, others: [{ kind: 'pup', x: 2.5, z: -1 }, { kind: 'slinger', x: -2.0, z: 1.0 }, { kind: 'slinger', x: 6, z: 6 }], T: 0.02, seed: 1, policy: still });
      explode(r.foe, r.ctx, true);
      return r;
    };
    const r = go(0, 30);
    const dead = r.foes.filter((m) => m.state === 'dead').map((m) => m.kind + '@' + m.x.toFixed(0));
    check('Fusepup: the blast takes the Snuffers within 3.4 m of the keg (another keg goes off with it) and not the ones beyond', r.foes[1].state === 'dead' && r.foes[2].state === 'dead' && r.foes[3].state !== 'dead' && r.foes[1].exploded === true, dead.join(' '));
    const hurtsOf = (r) => r.events.filter((e) => e.type === 'hurt').length;
    check('Fusepup: the hero is in the blast at 3.3 m and out of it at 4.1 m', hurtsOf(go(0, 3.3)) === 1 && hurtsOf(go(0, 4.1)) === 0);
  }
  {
    // a brain reads nothing but what it is given: no Math.random, no clocks
    const R = Math.random; let calls = 0; Math.random = () => { calls++; return 0.5; };
    for (const kind of FOE_IDS) simulate({ kind, policy: still, T: 6, seed: 2 });
    Math.random = R;
    check('a brain never asks for Math.random (it asks ctx.rng: a fight can be replayed)', calls === 0, `(${calls} calls)`);
  }
}

console.log(failed ? `\n${failed} FAILED` : '\nall foe checks passed');
process.exit(failed ? 1 : 0);
