// The foes' brains (src/game/foes/) held to what their design says, headlessly: no server, no browser. Each brain is played at 60 Hz on a floor of its own against a model of the hero (tools/lib/foesim.mjs:
// the Player's numbers), by a hero who plays it right, one who plays it wrong and one who stands still.
//   node tools/foe-test.mjs
//
//   the table     every foe has its row: a model, a hint, a drop, a danger, a brain that has what a brain must
//   the matrix    what a flame and a ram do to each foe from the front, the side and the back, in each of its states (written out here, not derived: the code is held to the design)
//   the breath    how often each foe attacks (the least time between two of its attacks), where a ball's ring is, who keeps away from a hero who walks, what cannot be aimed at, a keg once, a blow once
//   the tells     no foe can hurt the hero until its warning has run: a ball takes 2 s from the wind-up, a charge 0.9 s from the paw, the ground cracks 0.8 s before it bursts, a shield is raised for 1.1 s...
//   the play      the right play wins and is never hurt; standing still is hurt by every foe that attacks; the wrong verb never wins
//   the rest      the same seed plays the same fight, a Smokecaller never has more than three and takes its Snuffers with it, a keg's blast, a hog that hits a wall is stunned, a thief that is cornered gives up
import { simulate, HERO, FUSE } from './lib/foesim.mjs';
import { PLAYS, judge, dirTo, dist, still, rush, lap } from './lib/foe-plays.mjs';
import { KINDS, FOE_IDS, KIND_IDS, DANGER, BRAINS, makeFoe, stepFoe, struckBy, explode, SLING, CHARGE, BURROW, WARD, SWOOP, CALL, FLEE, hitsOn } from '../src/game/foes/index.js';
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
  check('what keeps away and what flees is slower than a run, so that it can always be caught or outrun: a Slinger and a Smokecaller back off at under 6 m/s, a Pilferling runs at under 10 m/s (a run is 11.5, a ram 24), a mound follows at 6, a Fusepup runs at under 8, a Lidwarden walks at under 4 and turns at under 1.5 rad/s (a hero circles it at 3 m at 3.6)',
    SLING.panic < HERO.run / 2 && CALL.panic < HERO.run / 2 && FLEE.speed < HERO.run && FLEE.speed * FLEE.boost < HERO.run * 1.05 && BURROW.under < HERO.run && FUSE.speed < HERO.run * 0.7 && WARD.walk < HERO.run / 3 && CHARGE.walk < HERO.run / 3 && WARD.turn * 2.5 < HERO.run / 3.2);
  check('a hog runs faster than a hero (15 against 11.5) for under 1.1 s: it is a line to step off, not a race', CHARGE.speed > HERO.run && CHARGE.maxT <= 1.1 && CHARGE.speed * CHARGE.maxT <= 17);
}

// ---- the breath a hero gets ---------------------------------------------------------------------------------------------------------------------------
{
  // how often a foe attacks: the time between two of its attacks, seen with a hero who is hit and does not fall (`immortal`) and either stands where he is or keeps running
  const gapsOf = (kind, type, policy, at = [4, 7, 10, 14]) => {
    const out = [];
    for (const seed of SEEDS) for (const d of at) {
      const r = simulate({ kind, policy, T: 60, seed, immortal: true, hero: { x: 0, z: d, yaw: Math.PI } });
      const ts = r.events.filter((e) => e.type === type).map((e) => e.t);
      for (let i = 1; i < ts.length; i++) out.push(ts[i] - ts[i - 1]);
    }
    return out;
  };
  const rows = [
    ['slinger', 'lob', [still, lap], 3.5, 'a Slinger throws a ball every 3.5 s at the most'],
    ['hog', 'rush', [still, lap], 3.2, 'a Ramhog does not run twice within 3.2 s (the skid, the turn, the next paw)'],
    ['mole', 'burst', [still], 3.5, 'a Dustmole bursts every 3.5 s at the most (dazed, digging in, a second under the ground)'],
    ['warden', 'bash', [still], 1.95, 'a Lidwarden bashes every 2 s at the most (the shield rises for 1.1 s and is down for 0.9)'],
    ['moth', 'dive', [still, lap], 6.5, 'a Dusk Moth dives every 6.5 s at the most (rear, dive, land, rise, and 4 s of circling)'],
    ['caller', 'summon', [still], 7.0, 'a Smokecaller calls every 7 s at the most'],
  ];
  for (const [kind, type, policies, min, what] of rows) {
    const gaps = policies.flatMap((p) => gapsOf(kind, type, p));
    check(`${what} (never under ${f2(min)} s over ${gaps.length} gaps)`, gaps.length >= 20 && Math.min(...gaps) >= min, `(the least: ${gaps.length ? f2(Math.min(...gaps)) : 'none'} s)`);
  }
  // the ring a ball makes on the floor follows the hero for the first 0.6 s of its flight and is then fixed: a hero who walks on is not where it lands
  {
    let last = null;
    const r = simulate({ kind: 'slinger', hero: { x: 0, z: 9, yaw: Math.PI }, T: 8, seed: 3, immortal: true, policy: (s) => { last = { x: s.hero.x, z: s.hero.z, t: s.t }; return { dx: 1, dz: 0, mag: 0.4 }; },
      onEvent: (ev) => { if (ev.type === 'lock') ev.hero = { ...last }; } });
    const lock = r.events.find((e) => e.type === 'lock'), lob = r.events.find((e) => e.type === 'lob'), splat = r.events.find((e) => e.type === 'splat');
    const err = lock ? hyp(lock.x - lock.hero.x, lock.z - lock.hero.z) : Infinity, moved = splat && lock ? hyp(splat.x - lock.x, splat.z - lock.z) : Infinity;
    check('Slinger: the ring follows a walking hero until 0.5 s before the ball lands (it is where he is at the lock) and then stays where it is (the ball lands there)', !!lock && !!splat && !!lob && err < 0.2 && moved < 1e-6 && Math.abs(splat.t - lock.t - SLING.lock) < 0.03 && lock.t > lob.t + 0.4,
      lock ? `(at the lock the ring is ${f2(err)} m from him; it lands ${f2(moved)} m from the lock, ${f2(splat.t - lock.t)} s later)` : '(no lock)');
  }
  // the burst of a ball hurts a hero within its 1.7 m (and his own 0.55) and not one beyond: seen over many balls, a hero who walks aside from the ring at different speeds once it is fixed
  {
    const pairs = [];
    for (const seed of SEEDS) for (const mag of [0, 0.15, 0.25, 0.35, 0.5, 0.8]) {
      let last = null;
      const r = simulate({ kind: 'slinger', hero: { x: 0, z: 9, yaw: Math.PI }, T: 14, seed, immortal: true,
        policy: (s) => { last = { x: s.hero.x, z: s.hero.z }; return s.foe.balls.some((b) => b.locked) ? { dx: 1, dz: 0, mag } : still(s); },
        onEvent: (ev) => { if (ev.type === 'splat') ev.hero = { ...last }; } });
      for (const sp of r.events.filter((e) => e.type === 'splat')) pairs.push({ d: hyp(sp.hero.x - sp.x, sp.hero.z - sp.z), hurt: r.events.some((e) => e.type === 'hurt' && Math.abs(e.t - sp.t) < 1e-6) });
    }
    const wrong = pairs.filter((p) => (p.d < 2.1 && !p.hurt) || (p.d > 2.4 && p.hurt));
    check('Slinger: a ball hurts a hero within 1.7 m of where it lands (and his own 0.55 m) and none beyond that', pairs.filter((p) => p.d < 2.1).length >= 10 && pairs.filter((p) => p.d > 2.4 && p.d < 6).length >= 10 && wrong.length === 0,
      `(${pairs.length} balls; ${wrong.length} wrong: ${wrong.slice(0, 3).map((p) => `${f2(p.d)} m ${p.hurt ? 'hurt' : 'not'}`).join(', ')})`);
  }
  // the hog's line is fixed 0.25 s before it sets off, and it runs along the line it had then, whatever the hero does with that quarter second
  {
    const bad = [];
    let runs = 0;
    for (const seed of SEEDS) {
      const r = simulate({ kind: 'hog', hero: { x: 0, z: 14, yaw: Math.PI }, T: 25, seed, immortal: true,
        policy: (s) => (s.foe.state === 'paw' && s.foe.st > 0.6 ? { dx: Math.cos(s.foe.yaw), dz: -Math.sin(s.foe.yaw), mag: 1 } : still(s)),
        onEvent: (ev, data) => { if (ev.type === 'rush') ev.dir = Math.atan2(data.by.dx, data.by.dz); } });
      const locks = r.events.filter((e) => e.type === 'lock'), rushes = r.events.filter((e) => e.type === 'rush');
      runs += rushes.length;
      if (locks.length !== rushes.length) bad.push(`seed ${seed}: ${locks.length} locks, ${rushes.length} runs`);
      rushes.forEach((rs, i) => { const lk = locks[i]; if (lk && (Math.abs(Math.atan2(Math.sin(rs.dir - lk.yaw), Math.cos(rs.dir - lk.yaw))) > 0.01 || Math.abs(rs.t - lk.t - CHARGE.lock) > 0.03)) bad.push(`seed ${seed}: run ${i} off its locked line by ${f2(rs.dir - lk.yaw)} rad, ${f2(rs.t - lk.t)} s after the lock`); });
    }
    check('Ramhog: its line is fixed 0.25 s before it sets off and it runs along it (a hero who steps aside in that quarter second is not followed)', runs >= 6 && bad.length === 0, `(${runs} runs; ${bad.slice(0, 2).join(' | ')})`);
  }
  // ... and it rests a little (0.55 s) once it has turned back before it paws again
  {
    const gaps = [];
    for (const seed of SEEDS) {
      let prev = null, turned = null;
      simulate({ kind: 'hog', hero: { x: 0, z: 10, yaw: Math.PI }, T: 40, seed, immortal: true, policy: (s) => {
        const st = s.foe.state;
        if (prev === 'turn' && st === 'stalk') turned = s.t;
        if (st === 'paw' && prev !== 'paw' && turned !== null) { gaps.push(s.t - turned); turned = null; }
        prev = st; return still(s);
      } });
    }
    check('Ramhog: it rests at least 0.55 s after it has turned back before it paws again', gaps.length >= 6 && Math.min(...gaps) >= 0.55, `(${gaps.length} times; the least: ${gaps.length ? f2(Math.min(...gaps)) : 'none'} s)`);
  }
  // what a brain's blow reaches, seen one step at a time: the foe where the test puts it, in the state it names, and the hero where the test puts him
  {
    const probe = (kind, set, hero) => {
      const e = makeFoe(kind, { x: 0, z: 0, yaw: set.yaw ?? 0 });
      Object.assign(e, set);
      const ev = [];
      const ctx = { hero: { x: hero.x, y: hero.y ?? 0, z: hero.z, r: 0.55, dead: false, ram: false, vx: 0, vz: 0 }, rng: () => 0.5, floorAt: () => 0, move: (m, vx, vz, d) => { m.x += vx * d; m.z += vz * d; return 1; }, emit: (type, data) => ev.push({ type, ...data }), dismiss() {}, alive: () => true };
      stepFoe(e, 1 / 60, ctx);
      return ev.some((x) => x.type === 'hurt');
    };
    const at = (deg, r) => ({ x: Math.sin((deg * Math.PI) / 180) * r, z: Math.cos((deg * Math.PI) / 180) * r });
    const bash = (deg, r) => probe('warden', { state: 'raise', st: WARD.raise - 0.001, yaw: 0 }, at(deg, r));
    check('Lidwarden: a bash hurts a hero within 3.2 m and 60 degrees of where it faces, and not one beyond either', bash(0, 2.5) && bash(40, 2.8) && bash(-40, 2.8) && bash(0, 3.0) && !bash(0, 3.6) && !bash(80, 2.5) && !bash(-80, 2.5) && !bash(180, 2.5) && !bash(120, 3.0),
      `(ahead 2.5 m ${bash(0, 2.5)}, 40 degrees ${bash(40, 2.8)}, 3.6 m ${bash(0, 3.6)}, 80 degrees ${bash(80, 2.5)}, behind ${bash(180, 2.5)})`);
    const burst = (r) => probe('mole', { state: 'crack', st: BURROW.crack - 0.001 }, at(30, r));
    check('Dustmole: its burst hurts a hero within 2.3 m of it (1.8 m and his own 0.55) and not one beyond that', burst(0.5) && burst(1.5) && burst(2.1) && !burst(2.6) && !burst(3.5), `(1.5 m ${burst(1.5)}, 2.1 m ${burst(2.1)}, 2.6 m ${burst(2.6)})`);
    const run = (side) => probe('hog', { state: 'rush', rushT: 0.5, v: 15, dx: 0, dz: 1, yaw: 0, hit: false }, { x: side, z: 0.4 });
    check('Ramhog: a hog that runs hurts a hero within 1.7 m of it (its own 0.95 m, his 0.55 and a quarter metre) and not one who has stepped 2.3 m aside', run(0.4) && run(1.2) && run(1.5) && !run(2.3) && !run(3), `(0.4 m ${run(0.4)}, 1.5 m ${run(1.5)}, 2.3 m ${run(2.3)})`);
    const dive = (x, y) => probe('moth', { state: 'dive', st: 0, aimX: 0, aimZ: 5, y: 3, hit: false }, { x, y, z: 0.3 });
    check('Dusk Moth: a diving moth hurts a hero within 1.3 m of its middle and not one who has stepped 2 m aside', dive(0.5, 2.4) && dive(0.9, 2.8) && !dive(2.0, 2.4) && !dive(0.5, 0), `(0.5 m ${dive(0.5, 2.4)}, 2 m aside ${dive(2.0, 2.4)}, on the ground ${dive(0.5, 0)})`);
  }
  // a Lidwarden's shield is down for 0.9 s after a bash (and the Snuffer is open to anything: the matrix says so)
  {
    const lens = [];
    for (const seed of SEEDS) {
      let prev = null, from = null;
      simulate({ kind: 'warden', hero: { x: 0, z: 6, yaw: Math.PI }, T: 30, seed, immortal: true, policy: (s) => {
        const st = s.foe.state;
        if (st === 'open' && prev !== 'open') from = s.t;
        if (prev === 'open' && st !== 'open' && from !== null) { lens.push(s.t - from); from = null; }
        prev = st; return still(s);
      } });
    }
    check('Lidwarden: its shield stays down for 0.9 s after a bash', lens.length >= 20 && Math.min(...lens) >= 0.85, `(${lens.length} times; the least: ${lens.length ? f2(Math.min(...lens)) : 'none'} s)`);
  }
  // a Fusepup is slower than a run: a hero who runs from it gains on it
  {
    let gap0 = null, gap = null;
    simulate({ kind: 'pup', hero: { x: 0, z: 9, yaw: Math.PI }, T: 2.4, seed: 3, immortal: true, policy: (s) => {
      const d = dist(s.hero, s.foe), [dx, dz] = dirTo(s.foe, s.hero);
      if (s.foe.state === 'run' && gap0 === null) gap0 = [d, s.t];
      gap = [d, s.t];
      return { dx, dz, mag: 1 };
    } });
    const grew = gap0 ? (gap[0] - gap0[0]) / (gap[1] - gap0[1]) : -Infinity;
    check('Fusepup: a hero who runs from it gains on it (it runs at 7.2 m/s, he at 11.5: the gap grows by 3 m/s at the least)', grew > 3, `(the gap grows ${f1(grew)} m/s)`);
  }
  // a Dusk Moth fixes its aim 0.25 s before the dive and lands where it said (a hero who steps aside in that quarter second is not followed)
  {
    const bad = [];
    let dives = 0;
    for (const seed of SEEDS) {
      const r = simulate({ kind: 'moth', hero: { x: 0, z: 9, yaw: Math.PI }, T: 30, seed, immortal: true,
        policy: (s) => (s.foe.state === 'rear' && s.foe.st > 0.5 ? { dx: 1, dz: 0, mag: 1 } : still(s)) });
      const locks = r.events.filter((e) => e.type === 'lock'), landings = r.events.filter((e) => e.type === 'land'), dv = r.events.filter((e) => e.type === 'dive');
      dives += dv.length;
      if (locks.length !== dv.length) bad.push(`seed ${seed}: ${locks.length} locks, ${dv.length} dives`);
      landings.forEach((l, i) => { const k = locks[i]; if (k && hyp(l.x - k.x, l.z - k.z) > 0.6) bad.push(`seed ${seed}: dive ${i} landed ${f2(hyp(l.x - k.x, l.z - k.z))} m from its lock`); });
    }
    check('Dusk Moth: its aim is fixed 0.25 s before the dive and it lands where it said (a lock comes before every dive)', dives >= 6 && bad.length === 0, `(${dives} dives; ${bad.slice(0, 2).join(' | ')})`);
  }
  // a Slinger and a Smokecaller stand off: when they throw or call they are 6 to 14 m (it throws from as far as 14) and 8 to 12 m from the hero, whether he began nearer (it backs off) or further (it comes on)
  for (const [kind, what, lo, hi] of [['slinger', 'wind', 6, 14], ['caller', 'call', 8, 12]]) {
    const ds = [];
    for (const at of [3, 5, 9, 14, 17]) {
      let d = null;
      simulate({ kind, hero: { x: 0, z: at, yaw: Math.PI }, T: 8, seed: 2, immortal: true, policy: still, onEvent: (ev, data) => { if (ev.type === 'tell' && ev.what === what && d === null) d = hyp(data.by.x, data.by.z - at); } });
      ds.push(d);
    }
    check(`${KINDS[kind].name[0] + KINDS[kind].name.slice(1).toLowerCase()}: it stands ${lo} to ${hi} m from the hero when it ${kind === 'slinger' ? 'throws' : 'calls'}, whether he began at 3, 5, 9, 14 or 17 m from it`, ds.every((d) => d !== null && d >= lo - 0.3 && d <= hi + 0.5), `(${ds.map((d) => (d === null ? '-' : f1(d))).join(' ')} m)`);
  }
  // the mole cannot be aimed at, or taken by a blast, but while it is dazed
  {
    let bad = 0, dazed = 0, seen = new Set();
    simulate({ kind: 'mole', hero: { x: 0, z: 10, yaw: Math.PI }, T: 14, seed: 2, immortal: true, policy: (s) => { seen.add(s.foe.state); if (s.foe.state === 'dazed') dazed++; if (!!s.foe.untargetable !== (s.foe.state !== 'dazed')) bad++; return { dx: 0, dz: 0, mag: 0 }; } });
    check('Dustmole: it is untargetable in every state but dazed (the aim assist and a keg\'s blast leave a mole under the ground alone)', bad === 0 && dazed > 30 && seen.size >= 4, `(${[...seen].join(' ')}; ${bad} frames wrong)`);
  }
  // a keg goes off once, and what a hero's attack counts for is counted once in 0.3 s (a flame) or 0.5 s (a ram)
  {
    const r = simulate({ kind: 'pup', foe: { x: 0, z: 0 }, hero: { x: 0, z: 30, yaw: Math.PI }, T: 0.02, seed: 1, policy: still });
    explode(r.foe, r.ctx, true); explode(r.foe, r.ctx, true); explode(r.foe, r.ctx, false);
    check('Fusepup: a keg goes off once however often it is told to', r.events.filter((e) => e.type === 'boom').length === 1);
    const hog = makeFoe('hog', { x: 0, z: 0 }); hog.state = 'stalk';
    const hero = { x: 0, y: 0, z: 3, flameT: 1, chargeT: 1, flameHits: () => true, chargeHits: () => true };
    let flames = 0, rams = 0;
    for (let i = 0; i < 60; i++) { hog.flameCd = Math.max(0, (hog.flameCd || 0) - 1 / 60); hog.chargeCd = Math.max(0, (hog.chargeCd || 0) - 1 / 60); for (const h of hitsOn(hog, hero)) { if (h.attack === 'flame') flames++; else rams++; } }
    check('a flame counts once in 0.3 s and a ram once in 0.5 s (a second of each is 4 and 2 blows)', flames === 4 && rams === 2, `(${flames} flames, ${rams} rams in a second)`);
  }
  // the Rimeling's shell: more than one breath (a breath is two ticks of 0.3 s) to melt, and it grows back after some seconds
  check('the Rimeling\'s shell takes three ticks of fire (more than one breath) to melt and grows back no sooner than 4 s later', KINDS.rime.shell === true && KINDS.rime.melt >= 3 && KINDS.rime.regrow >= 4 && KINDS.rime.regrow <= 8, `(melt ${KINDS.rime.melt}, regrow ${KINDS.rime.regrow} s)`);
}

// ---- the play --------------------------------------------------------------------------------------------------------------------------------------
// (the plays are tools/lib/foe-plays.mjs: the same ones tools/foe-bot.mjs plays in the running game with the real controller)
const outcome = (r) => ({ killed: r.killedAt !== null, hurts: r.hurts, blows: r.events.filter((e) => e.type === 'struck'), boomed: r.events.some((e) => e.type === 'boom'), left: r.foes.filter((f) => f !== r.foe && f.state !== 'dead').length,
  dismissed: r.foes.filter((f) => f.how === 'dismissed').length, called: r.foes.filter((f) => f.minion).map((f) => !!f.wild), said: r.events.reduce((m, e) => { if (e.by === r.foe.kind) m[e.type] = (m[e.type] || 0) + 1; return m; }, {}) });
const win = (kind, policy, extra = {}, tries = SEEDS, T = 25) => {
  const rs = tries.map((seed) => simulate({ kind, policy, T, seed, ...extra }));
  return { n: rs.length, killed: rs.filter((r) => r.killedAt !== null).length, hurts: rs.map((r) => r.hurts), worst: Math.max(...rs.map((r) => r.hurts)), time: Math.max(...rs.map((r) => r.killedAt ?? Infinity)), rs };
};
{
  for (const pl of PLAYS.filter((p) => p.sim !== false)) {
    const seeds = pl.seeds || SEEDS;
    const solids = (pl.posts || []).map((q) => ({ x: q.across, z: q.along, r: q.r }));
    const outs = seeds.map((seed) => outcome(simulate({ kind: pl.kind, policy: pl.policy, T: pl.T, seed, solids, hero: { x: 0, z: pl.at, yaw: Math.PI } })));
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
    const q = simulate({ kind: 'caller', hero: { x: 0, z: 14, yaw: Math.PI }, T: 60, seed: 1, immortal: true, policy: still });
    check('Smokecaller: with a hero who stands there (and is hit, and does not fall) it fills up to three Snuffers and never has more than three at once, however long', most(q, 60) === CALL.cap && q.events.filter((e) => e.type === 'summon').length === CALL.cap, `(${q.events.filter((e) => e.type === 'summon').length} called, at most ${most(q, 60)} alive)`);
    const d = simulate({ kind: 'caller', hero: { x: 0, z: 14, yaw: Math.PI }, T: 40, seed: 5, policy: (s) => (s.foes.filter((m) => m.minion).length >= 2 ? { ...(() => { const [dx, dz] = dirTo(s.hero, s.foe); return { dx, dz }; })(), mag: 1, charge: dist(s.hero, s.foe) < 6 } : { dx: 0, dz: 0, mag: 0 }) });
    const mins = d.foes.filter((m) => m.minion);
    check('Smokecaller: when it falls, the Snuffers it called go up in smoke with it (dismissed: no gems, not counted as beaten)', d.killedAt !== null && mins.length >= 2 && mins.some((m) => m.how === 'dismissed') && mins.every((m) => m.state === 'dead' || m.diedAt === undefined), `(${mins.length} called, ${mins.filter((m) => m.how === 'dismissed').length} gone with it)`);
  }
  {
    // an alley closed at one end: a thief driven into it has nowhere to go
    const alley = [];
    for (let z = -13; z <= 1; z += 1.5) { alley.push({ x: -3.5, z, r: 1 }, { x: 3.5, z, r: 1 }); }
    for (let x = -3.5; x <= 3.5; x += 1.5) alley.push({ x, z: -13, r: 1 });
    const setup = { kind: 'thief', foe: { x: 0, z: -6 }, hero: { x: 0, z: 3, yaw: Math.PI }, solids: alley, seed: 3, policy: (s) => { const [dx, dz] = dirTo(s.hero, s.foe); return { dx, dz, mag: dist(s.hero, s.foe) > 4.5 ? 1 : 0 }; } };
    const r = simulate({ ...setup, T: 12 });
    const cow = r.events.find((e) => e.type === 'tell' && e.what === 'cower');
    check('Pilferling: driven into a blind alley it puts its hands up (a cower) at the end of it rather than run through the wall', !!cow && Math.abs(cow.x) < 3.5 && cow.z < -9 && cow.z > -13, cow ? `(at ${f1(cow.x)}, ${f1(cow.z)}, ${f1(cow.t)} s)` : '(never)');
    const later = cow ? simulate({ ...setup, T: cow.t + 1.6 }) : null;
    check('Pilferling: with its hands up it stays where it is for the 2 s (a hero has time to reach it)', !!later && hyp(later.foe.x - cow.x, later.foe.z - cow.z) < 0.3 && later.foe.state === 'cower', later ? `(it has moved ${f2(hyp(later.foe.x - cow.x, later.foe.z - cow.z))} m in 1.6 s, and is ${later.foe.state})` : '');
    // a wall of posts across its way, a long way from the hero: it runs along the wall (it steers round what is in its way) and does not stand at it with its hands up
    const wall = [];
    for (let x = -14; x <= 14; x += 0.8) wall.push({ x, z: -8, r: 1 });
    let wx = 0, cowered = false;
    const w = simulate({ kind: 'thief', foe: { x: 0, z: -3 }, hero: { x: 0, z: 9, yaw: Math.PI }, solids: wall, T: 2.5, seed: 3, policy: still, onEvent: (ev) => { if (ev.type === 'tell' && ev.what === 'cower') cowered = true; } });
    check('Pilferling: a wall across the way it runs does not stop it: it runs along the wall, and does not put its hands up at it', !cowered && Math.abs(w.foe.x) >= 6 && w.foe.z > -8, `(it is at ${f1(w.foe.x)}, ${f1(w.foe.z)} after 2.5 s; hands up: ${cowered})`);
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
