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
  check('the foes that ask more of the hero pay more: a Lidwarden, a Ramhog, a Smokecaller pay at least the Bell Snuffer\'s 7; a Pilferling, a prize, pays the most', ['warden', 'hog', 'caller'].every((k) => sum(ENEMY_DROPS[k]) >= 7) && sum(ENEMY_DROPS.thief) >= 15);
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
const still = () => ({ dx: 0, dz: 0, mag: 0 });
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
const dirTo = (a, b) => { const d = hyp(b.x - a.x, b.z - a.z) || 1; return [(b.x - a.x) / d, (b.z - a.z) / d]; };
const dist = (a, b) => hyp(b.x - a.x, b.z - a.z);
/** run at the foe, and ram when `ram` m from it (or flame when `flame` m): what a hero does to a foe that keeps away or comes */
const rush = ({ ram = 0, flame = 0 } = {}) => (s) => {
  const [dx, dz] = dirTo(s.hero, s.foe), d = dist(s.hero, s.foe);
  return { dx, dz, mag: 1, charge: ram > 0 && d < ram, flame: flame > 0 && d < flame && d > 1 };
};
const win = (kind, policy, extra = {}, tries = SEEDS, T = 25) => {
  const rs = tries.map((seed) => simulate({ kind, policy, T, seed, ...extra }));
  return { n: rs.length, killed: rs.filter((r) => r.killedAt !== null).length, hurts: rs.map((r) => r.hurts), worst: Math.max(...rs.map((r) => r.hurts)), time: Math.max(...rs.map((r) => r.killedAt ?? Infinity)), rs };
};
const show = (w) => `(killed ${w.killed}/${w.n}, hurts ${w.hurts.join(',')}, the longest ${w.time === Infinity ? 'never' : f1(w.time) + ' s'})`;
const clear = (w, maxHurts = 0) => w.killed === w.n && w.worst <= maxHurts;
/** the kills a foe took from the hero's attacks from the front, with its guard up */
const frontKills = (rs) => rs.flatMap((r) => r.events.filter((e) => e.type === 'struck' && e.out === 'kill' && e.side === 'front' && e.state !== 'stunned' && e.state !== 'open'));
{
  // the Slinger: close in (it backs off, slower than he runs) and flame or ram it; a hero who stands still is hit
  let w = win('slinger', rush({ ram: 7 }));
  check('Slinger: a hero who runs at it and rams it is never hit and wins', clear(w), show(w));
  w = win('slinger', rush({ flame: 5.5 }));
  check('Slinger: so does one who flames it from 5.5 m', clear(w), show(w));
  w = win('slinger', still, {}, SEEDS, 12);
  check('Slinger: a hero who stands still is hit (by the ball that comes down where he stands)', w.rs.every((r) => r.hurts >= 1), `(hurts ${w.hurts.join(',')})`);
  w = win('slinger', (s) => ({ dx: Math.cos(s.t * 1.2), dz: Math.sin(s.t * 1.2), mag: 1 }), { hero: { x: 0, z: 9, yaw: Math.PI } }, SEEDS, 14);
  check('Slinger: a hero who keeps moving is not hit by what it throws (the ring stops following him)', w.worst === 0, `(hurts ${w.hurts.join(',')})`);

  // the Ramhog: step off the line it runs, and go after it: from behind its brow is nothing
  const hogPolicy = (s) => {
    const e = s.foe, h = s.hero, fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
    const lat = (h.x - e.x) * fz - (h.z - e.z) * fx, lon = (h.x - e.x) * fx + (h.z - e.z) * fz;       // where the hero is in the hog's own frame: lon > 0 is in front of it
    if ((e.state === 'paw' && e.locked) || (e.state === 'rush' && lon > 0.5)) {
      if (Math.abs(lat) < 2.6) { const sd = lat >= 0 ? 1 : -1; return { dx: fz * sd, dz: -fx * sd, mag: 1 }; }               // (step off its line)
      return { dx: 0, dz: 0, mag: 0 };
    }
    if (['rush', 'skid', 'turn', 'stunned'].includes(e.state) && lon <= 0.5) { const [dx, dz] = dirTo(h, e); return { dx, dz, mag: 1, charge: true }; }   // (it has gone by: after it)
    return { dx: 0, dz: 0, mag: 0 };
  };
  w = win('hog', hogPolicy, { hero: { x: 0, z: 14, yaw: Math.PI } }, SEEDS, 30);
  check('Ramhog: a hero who steps off its line and goes after it wins, and is not hurt', clear(w), show(w));
  const headOn = (s) => { const [dx, dz] = dirTo(s.hero, s.foe); return { dx, dz, mag: 1, charge: dist(s.hero, s.foe) < 8 }; };
  w = win('hog', headOn, {}, SEEDS, 20);
  check('Ramhog: a hero who rams at it head on gets nothing from its brow (no kill from the front, but the ones from the side and the back when he is knocked round)', frontKills(w.rs).length === 0 && w.rs.some((r) => r.events.some((e) => e.type === 'struck' && e.out === 'ring')), `(${w.rs.flatMap((r) => r.events.filter((e) => e.type === 'struck')).length} blows)`);
  w = win('hog', still, {}, SEEDS, 12);
  check('Ramhog: a hero who stands still is run down', w.rs.every((r) => r.hurts >= 1), `(hurts ${w.hurts.join(',')})`);
  {
    // led into a post: the charge ends against it, and a stunned hog falls to anything
    const setup = { kind: 'hog', foe: { x: 0, z: 0, yaw: 0 }, hero: { x: 0, z: 10, yaw: Math.PI }, solids: [{ x: 0, z: 16, r: 1.5 }], seed: 2, policy: (s) => (s.foe.state === 'rush' || (s.foe.state === 'paw' && s.foe.locked) ? { dx: 1, dz: 0, mag: 1 } : { dx: 0, dz: 0, mag: 0 }) };
    const r = simulate({ ...setup, T: 6 });
    const bonk = r.events.find((e) => e.type === 'bonk');
    const after = bonk ? simulate({ ...setup, T: bonk.t + 0.3 }) : null;
    check('Ramhog: a hog that runs into a post is stunned where the post is, and the hero who stepped aside is not hurt', !!bonk && after.foe.state === 'stunned' && r.hurts === 0 && bonk.z < 16, bonk ? `(bonk at ${f1(bonk.t)} s, ${f1(bonk.z)} m, then ${after.foe.state})` : '(no bonk)');
  }

  // the Dustmole: let it come, leave the ring when the ground cracks, strike it dazed. Keep moving and it is left behind; stand still and it is up under him
  const molePolicy = (s) => {
    const e = s.foe, h = s.hero;
    if (e.state === 'dazed') { const [dx, dz] = dirTo(h, e); return { dx, dz, mag: 1, charge: dist(h, e) < 6 }; }
    if (e.state === 'crack') { const [dx, dz] = dirTo(e, h); return { dx, dz, mag: 1 }; }                    // (out of the ring)
    return { dx: 0, dz: 0, mag: 0 };
  };
  w = win('mole', molePolicy, {}, SEEDS, 30);
  check('Dustmole: a hero who waits for it, leaves the ring when the ground cracks and strikes it dazed wins, and is not hurt', clear(w), show(w));
  w = win('mole', still, {}, SEEDS, 12);
  check('Dustmole: a hero who stands still in the ring is caught by the burst', w.rs.every((r) => r.hurts >= 1), `(hurts ${w.hurts.join(',')})`);
  w = win('mole', (s) => ({ dx: Math.cos(s.t * 1.1), dz: Math.sin(s.t * 1.1), mag: 1 }), { hero: { x: 0, z: 9, yaw: Math.PI } }, SEEDS, 20);
  check('Dustmole: a hero who only keeps moving is never hurt (it cannot catch a run) and never wins either', w.worst === 0 && w.killed === 0, `(hurts ${w.hurts.join(',')}, killed ${w.killed})`);
  w = win('mole', (s) => { const [dx, dz] = dirTo(s.hero, s.foe); return { dx, dz, mag: 0.3, charge: true, flame: true }; }, {}, SEEDS, 6);
  check('Dustmole: ramming and breathing fire at the mound does nothing while it is underground', w.killed === 0 || w.rs.every((r) => r.killedAt === null || r.events.some((e) => e.type === 'burst' && e.t < r.killedAt)), show(w));

  // the Lidwarden: go round it (it turns at 1.3 rad/s; he circles at three times that) and strike its side
  const wardPolicy = (s) => {
    const e = s.foe, h = s.hero, d = dist(h, e);
    const off = Math.abs(((Math.atan2(h.x - e.x, h.z - e.z) - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);          // how far round from its front he is (0 front .. PI behind)
    const rel = Math.atan2(h.x - e.x, h.z - e.z);
    if (d > 7) { const [dx, dz] = dirTo(h, e); return { dx, dz, mag: 1 }; }
    if (off < 1.5) { const a = rel + 1.5; return { dx: Math.sin(a) * 1 - Math.sin(rel) * (d - 3.2) * 0.3, dz: Math.cos(a) * 1 - Math.cos(rel) * (d - 3.2) * 0.3, mag: 1 }; }        // (round it, at about 3 m)
    const [dx, dz] = dirTo(h, e);
    return { dx, dz, mag: 1, charge: d < 5.5 };
  };
  w = win('warden', wardPolicy, {}, SEEDS, 30);
  check('Lidwarden: a hero who goes round it and strikes its side or its back wins', w.killed >= w.n - 1, show(w));
  w = win('warden', headOn, {}, SEEDS, 20);
  check('Lidwarden: a hero who rams it head on gets nothing from the front while its shield is up', frontKills(w.rs).length === 0 && w.rs.some((r) => r.events.some((e) => e.type === 'struck' && e.out === 'ring')), `(${w.rs.flatMap((r) => r.events.filter((e) => e.type === 'struck')).length} blows)`);
  w = win('warden', still, {}, SEEDS, 12);
  check('Lidwarden: a hero who stands still is bashed', w.rs.every((r) => r.hurts >= 1), `(hurts ${w.hurts.join(',')})`);
  {
    // taken on the bash and struck while the shield is down: the other way to win
    const r = simulate({ kind: 'warden', hero: { x: 0, z: 9, yaw: Math.PI }, T: 12, seed: 3, policy: (s) => {
      const e = s.foe;
      if (e.state === 'open') { const [dx, dz] = dirTo(s.hero, e); return { dx, dz, mag: 1, charge: true }; }
      if (e.state === 'raise') { const [dx, dz] = dirTo(e, s.hero); return { dx: dz, dz: -dx, mag: 1 }; }                       // (a step to the side of the bash)
      return { dx: 0, dz: 0, mag: 0 };
    } });
    check('Lidwarden: a hero who steps aside from the bash and strikes it while the shield is down wins too', r.killedAt !== null, `(${r.killedAt === null ? 'not killed' : 'killed at ' + f1(r.killedAt) + ' s'}, hurts ${r.hurts})`);
  }

  // the Fusepup: flame it from afar (out of the blast), or be hurt; a ram puts him in it
  const pupFlame = (s) => {
    const d = dist(s.hero, s.foe), [dx, dz] = dirTo(s.hero, s.foe);
    if (s.foe.state === 'idle') return { dx: 0, dz: 0, mag: 0 };
    if (d > 6.0) return { dx, dz, mag: 0 };
    if (d >= 4.4) return { dx, dz, mag: 0, flame: true };
    return { dx: -dx, dz: -dz, mag: 1 };                                                                      // (too near: back away)
  };
  w = win('pup', pupFlame, { hero: { x: 0, z: 13, yaw: Math.PI } }, SEEDS, 14);
  check('Fusepup: a hero who flames it from more than 4 m is not in the blast, and wins', clear(w), show(w));
  w = win('pup', rush({ ram: 4 }), {}, SEEDS, 14);
  check('Fusepup: a hero who rams it is in the blast of the keg it sets off', w.rs.every((r) => r.hurts >= 1), show(w));
  w = win('pup', (s) => { const [dx, dz] = dirTo(s.foe, s.hero); return { dx, dz, mag: 1 }; }, { hero: { x: 0, z: 9, yaw: Math.PI } }, SEEDS, 8);
  check('Fusepup: a hero who runs from it is not hurt (a run is quicker, and the fuse burns out behind him)', w.worst === 0 && w.rs.every((r) => r.events.some((e) => e.type === 'boom')), `(hurts ${w.hurts.join(',')})`);

  // the Dusk Moth: jump and breathe fire; ram it when it has landed; step away from its shadow
  const mothPolicy = (s) => {
    const e = s.foe, h = s.hero, [dx, dz] = dirTo(h, e), d = dist(h, e);
    if (e.state === 'idle' || e.state === 'alert') return { dx: 0, dz: 0, mag: 0 };
    if (e.state === 'land') return { dx, dz, mag: 1, charge: d < 6 };
    if (d < 8.5 && h.grounded && e.state === 'circle') return { dx, dz, mag: 0.01, jump: true };
    if (!h.grounded && h.y > 0.7) return { dx, dz, mag: 0.01, flame: d < 7.4 };
    return { dx: 0, dz: 0, mag: 0 };
  };
  w = win('moth', mothPolicy, { hero: { x: 0, z: 9, yaw: Math.PI } }, SEEDS, 30);
  check('Dusk Moth: a hero who jumps and breathes fire, and rams it when it lands, wins', w.killed >= w.n - 1 && w.worst <= 1, show(w));
  w = win('moth', still, {}, SEEDS, 12);
  check('Dusk Moth: a hero who stands still is dived on', w.rs.every((r) => r.hurts >= 1), `(hurts ${w.hurts.join(',')})`);
  w = win('moth', (s) => { const [dx, dz] = dirTo(s.hero, s.foe); return { dx, dz, mag: 0.01, flame: dist(s.hero, s.foe) < 7 }; }, { hero: { x: 0, z: 9, yaw: Math.PI } }, SEEDS, 2.4);
  check('Dusk Moth: fire breathed from the ground does not reach it while it hangs (nothing is killed in the 2.4 s before its first dive)', w.killed === 0, show(w));
  {
    const r = simulate({ kind: 'moth', hero: { x: 0, z: 9, yaw: Math.PI }, T: 14, seed: 2, policy: (s) => { const e = s.foe; if (e.state === 'rear' || e.state === 'dive') { const a = Math.atan2(s.hero.x - e.aimX, s.hero.z - e.aimZ); return { dx: Math.sin(a), dz: Math.cos(a), mag: 1 }; } return { dx: 0, dz: 0, mag: 0 }; } });
    check('Dusk Moth: a hero who steps away from where its shadow falls is not hurt by its dives', r.hurts === 0 && r.events.filter((e) => e.type === 'dive').length >= 2, `(dives ${r.events.filter((e) => e.type === 'dive').length}, hurts ${r.hurts})`);
  }

  // the Smokecaller: rush through what it calls, to it; never more than three; they go when it goes
  w = win('caller', rush({ ram: 6 }), { hero: { x: 0, z: 12, yaw: Math.PI } }, SEEDS, 30);
  check('Smokecaller: a hero who rushes it wins (it is slower than a run), hurt at most twice by what it called', w.killed === w.n && w.worst <= 2, show(w));
  {
    // a hero who fights what it calls: it calls again every 7 s, and never has more than three
    const r = simulate({ kind: 'caller', hero: { x: 0, z: 14, yaw: Math.PI }, T: 40, seed: 4, policy: (s) => {
      const live = s.foes.filter((m) => m.minion && m.state !== 'dead').sort((a, b) => dist(s.hero, a) - dist(s.hero, b))[0];
      if (live && dist(s.hero, live) < 6) { const [dx, dz] = dirTo(s.hero, live); return { dx, dz, mag: 1, charge: dist(s.hero, live) < 4 }; }
      return { dx: 0, dz: 0, mag: 0 };
    } });
    const minions = r.foes.filter((x) => x.minion);
    let most = 0;
    for (let t = 0; t < 40; t += 0.1) most = Math.max(most, minions.filter((x) => x.born <= t && (x.diedAt === undefined || x.diedAt > t)).length);
    check('Smokecaller: it calls again every 7 s whatever he does to what it called, and never has more than three alive', r.events.filter((e) => e.type === 'summon').length >= 4 && most <= CALL.cap && most >= 1, `(${r.events.filter((e) => e.type === 'summon').length} calls, at most ${most} alive)`);
    w = win('caller', still, { hero: { x: 0, z: 25, yaw: Math.PI } }, [1], 60);
    let most2 = 0; const m2 = w.rs[0].foes.filter((x) => x.minion);
    for (let t = 0; t < 60; t += 0.1) most2 = Math.max(most2, m2.filter((x) => x.born <= t && (x.diedAt === undefined || x.diedAt > t)).length);
    check('Smokecaller: left alone with a hero who does nothing it still never has more than three of them at once', most2 <= CALL.cap, `(${m2.length} called, at most ${most2} alive)`);
  }
  {
    const r = simulate({ kind: 'caller', hero: { x: 0, z: 14, yaw: Math.PI }, T: 40, seed: 5, policy: (s) => (s.foes.filter((m) => m.minion).length >= 2 ? { ...(() => { const [dx, dz] = dirTo(s.hero, s.foe); return { dx, dz }; })(), mag: 1, charge: dist(s.hero, s.foe) < 6 } : { dx: 0, dz: 0, mag: 0 }) });
    const mins = r.foes.filter((m) => m.minion);
    check('Smokecaller: when it falls, the Snuffers it called go up in smoke with it (dismissed: no gems, not counted as beaten)', r.killedAt !== null && mins.length >= 2 && mins.some((m) => m.how === 'dismissed') && mins.every((m) => m.state === 'dead' || m.diedAt === undefined), `(${mins.length} called, ${mins.filter((m) => m.how === 'dismissed').length} gone with it)`);
  }

  // the Pilferling: never hurts; a ram catches it; cornered it gives up
  w = win('thief', rush({ ram: 9 }), { hero: { x: 0, z: 10, yaw: Math.PI } }, SEEDS, 25);
  check('Pilferling: a hero who rams after it catches it, and it never hurts him', w.killed === w.n && w.worst === 0, show(w));
  w = win('thief', still, {}, SEEDS, 12);
  check('Pilferling: it does not fight: a hero who stands still is never touched', w.worst === 0 && w.killed === 0, `(hurts ${w.hurts.join(',')})`);
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
