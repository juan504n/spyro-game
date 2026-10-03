// The checks of TIDEGLASS REACH: every rule of tools/realm-check.mjs (tools/lib/realm-rules.mjs has them all, among them the seven of the tide) and whatever is this realm's own, which goes below.
// No dev server needed:
//   node tools/tideglass-check.mjs
import { checkRealm } from './lib/realm-rules.mjs';
import { terrainPicker } from '../src/game/terrain-mesh.js';
import { SLOPE_WALK } from '../src/game/collision.js';
import { WATER_LEVEL } from '../src/game/level.js';
import { tideLevel, tideLow, tideHigh, drownDepth } from '../src/game/realm/tide.js';
import { BRIEF, FLATS, POOL, BRIDGES, GATE, DOOR } from '../src/game/tideglass/brief.js';
import { cairnSpots } from '../src/game/tideglass/level.js';
import { WEEPING, GROTTO } from '../src/game/tideglass/weeping.js';
import { TIDE_ENVIRONMENT } from '../src/game/tideglass/environment.js';
import { TRAVEL_PLACES } from '../src/game/tideglass/travel.js';
import { findTravelPlaces } from './realm-travel.mjs';
import { DOORS } from '../src/game/home/level.js';

const { failed, env } = checkRealm('tideglass', { log: (l) => console.log(l) });
let own = 0;
const check = (name, ok, detail) => { if (!ok) own++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const f1 = (v) => v.toFixed(1), pct = (a, b) => `${Math.round((a / b) * 100)}%`;

// ---- this realm's own checks (env: grid, collision, gp, level, ctx, walk, walkShut, foot, flood, h) --------------------------------------------------------------------------
{
  const { grid, collision, gp, level, walk, walkShut, flood, h } = env;
  const T = level.tide, lo = tideLow(T), hi = tideHigh(T), drown = drownDepth(level);
  const goal = (id) => gp.beacons.find((b) => b.id === id);
  const at = (o, r = 4) => walk.distNear(o.x, o.z, r, o.y - 0.5);
  /** the points of a road at every `step` metres along it: { x, z } */
  const along = (id, step = 2, from = 0, to = Infinity) => {
    const pts = grid.paths.find((p) => p.id === id).pts, out = [];
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, , az] = pts[i], [bx, , bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
      for (let u = 0; u < L; u += step) if (s + u >= from && s + u <= to) out.push({ x: ax + ((bx - ax) * u) / L, z: az + ((bz - az) * u) / L });
      s += L;
    }
    return out;
  };

  // the tide is the one the brief says: 90 s from high water to high water, 1.4 m either side of the mean, and it begins at the mean level going out (the first thing the hero sees is the flats appearing)
  {
    const ok = !!T && T.period === 90 && T.amp === 1.4 && Math.abs(lo + 1.4 - WATER_LEVEL) < 1e-9 && Math.abs(hi - 1.4 - WATER_LEVEL) < 1e-9
      && Math.abs(tideLevel(T, 0) - WATER_LEVEL) < 1e-9 && tideLevel(T, 2) < WATER_LEVEL - 0.1 && Math.abs(tideLevel(T, 22.5) - lo) < 1e-6 && Math.abs(tideLevel(T, 67.5) - hi) < 1e-6 && Math.abs(tideLevel(T, 90) - WATER_LEVEL) < 1e-9;
    check('the tide is 90 s round and 1.4 m either side of the mean, and begins at the mean level going out (low water at 22.5 s, high at 67.5 s)', ok, T ? `(${T.period} s, ${f1(lo)}..${f1(hi)} m, at 0 s ${f1(tideLevel(T, 0))}, at 22.5 s ${f1(tideLevel(T, 22.5))})` : '(no tide)');
    check('... the sea is the Reach: the water is drawn out to 360 m, tinted from the shallows to the deep with the realm\'s own surface, and says so when the hero cannot cross it', !!level.sea && level.sea.r === 360 && T.tint.texture === 'water_tide' && /KEEP TO THE ROAD/.test(level.sea.deepHint) && /TIDE/.test(T.hint), `('${level.sea && level.sea.name}', ${T.tint.texture})`);
    let floor = Infinity;
    for (let x = -216; x <= 216; x += 6) for (let z = -216; z <= 216; z += 6) floor = Math.min(floor, h(x, z));
    check('... and what is not land or shoal lies deep (the lowest ground is 6 m or more under the mean level: nowhere to stand in the open sea)', floor <= WATER_LEVEL - 6, `(${f1(floor)})`);
  }

  // the Low Road over the Salt Flats: the sand is bare at the low tide, wading at the mean and drowns him at the high - the whole way (a dry road or a drowned one would be no tide)
  {
    const road = along('causeway', 2, 0, Infinity).filter((q) => q.x >= FLATS.pts[0][0] && q.x <= FLATS.pts[FLATS.pts.length - 1][0]);
    const ys = road.map((q) => h(q.x, q.z)), n = ys.length;
    const bare = ys.filter((y) => y >= lo + 0.1).length, wade = ys.filter((y) => y < WATER_LEVEL && WATER_LEVEL - y < drown).length, deadly = ys.filter((y) => hi - y >= drown).length, deepMean = ys.filter((y) => WATER_LEVEL - y >= drown).length;
    check('the Low Road across the flats is bare at the low tide, wading at the mean and deeper than he can stand in at the high (in all but a few steps)', n > 80 && bare >= n * 0.98 && wade >= n * 0.9 && deadly >= n * 0.9 && deepMean <= n * 0.02, `(${n} points: bare at low ${pct(bare, n)}, wading at mean ${pct(wade, n)}, drowning at high ${pct(deadly, n)}, drowning at mean ${pct(deepMean, n)}; ground ${f1(Math.min(...ys))}..${f1(Math.max(...ys))})`);
  }

  // the cairns: the world places the ones the level raises (one lantern each), they stand over the high tide with room to spare, and in pairs either side of the causeway
  {
    const spots = cairnSpots(), placed = gp.placed.filter((p) => p.name === 'tide_cairn');
    const unmatched = spots.filter((c) => !placed.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 0.5));
    const low = placed.filter((p) => collision.support(p.x, p.z, p.y + 1, 0.5).y < hi + 0.6);
    check('the world places exactly the cairns the level raises, each over the high tide by 0.6 m or more (a refuge, not a puddle)', placed.length === spots.length && unmatched.length === 0 && low.length === 0, `(${placed.length} placed, ${spots.length} raised${unmatched.length ? `, missing ${unmatched.slice(0, 3).map((c) => `${f1(c.x)},${f1(c.z)}`).join(' ')}` : ''}${low.length ? `, too low ${low.length}` : ''})`);
    const pairs = spots.filter((c) => c.side !== 0), left = pairs.filter((c) => c.side < 0).map((c) => c.s).sort((a, b) => a - b), right = pairs.filter((c) => c.side > 0).map((c) => c.s).sort((a, b) => a - b);
    check('... in pairs either side of the causeway (the channel markers of the road), and one for the tide pool with its chest on it', left.length >= 5 && left.join() === right.join() && spots.some((c) => c.pool) && gp.chests.some((c) => c.secret === 'pool' && Math.hypot(c.x - POOL.x, c.z - POOL.z) < 3 && collision.support(c.x, c.z, c.y + 1, 0.4).y >= hi + 0.6), `(${left.length} pairs, ${spots.length - pairs.length} more)`);
  }

  // Pearl Rock is a tidal island: the walk to its lens is bare ground from the first step to the last at the low tide, the lens stands well over the high tide, and at the high tide there is no walking to it
  {
    const g = goal('pearl'), route = walk.route(g.x, g.z, 4, g.y - 0.5) || [];
    const wet = route.filter(([x, y, z]) => y < lo - 0.02 && y <= h(x, z) + 0.3).length;
    const highWalk = flood([gp.spawn.x, gp.spawn.z], { hop: 6.2, breakWalls: true, openGate: true, water: hi });
    check('Pearl Rock: the walk to the lens is dry at the low tide, the lens stands 6 m or more over the high tide, and at the high tide it is an island (no walk to it)', route.length > 40 && wet === 0 && g.y - hi >= 6 && !(highWalk.distNear(g.x, g.z, 4, g.y - 0.5) < Infinity), `(${route.length} cells, ${wet} of them under the low tide; the lens ${f1(g.y - hi)} m over the high tide)`);
  }

  // the Weeping Cliff's cave: the tunnel's floor climbs from the beach (under the high tide at its mouth, drowning there) to a chamber that is dry at every tide, and the lens hangs in it; the Weeping Fall
  // hangs over the mouth and is heard from the beach
  {
    const mouth = WEEPING.tunnels.mouth, rises = mouth.every((p, i) => i === 0 || p[2] >= mouth[i - 1][2]);
    const g = goal('weeping'), chamberY = collision.support(GROTTO.x, GROTTO.z, GROTTO.floorY + 1, 0.5).y;
    check('the sea cave: the floor rises from the beach (the mouth is drowned at the high tide), the chamber stands 0.6 m or more over it, and the lens hangs on the chamber\'s dry floor', rises && hi - mouth[0][2] >= drown && chamberY >= hi + 0.6 && Math.hypot(g.x - GROTTO.x, g.z - GROTTO.z) < GROTTO.rx && Math.abs(g.y - chamberY) < 0.6, `(the mouth ${f1(mouth[0][2])} m, ${f1(hi - mouth[0][2])} m deep at the high tide; the chamber ${f1(chamberY)} m)`);
    const fall = gp.placed.filter((p) => p.name === 'cave_fall'), m0 = mouth[0];
    const heard = (gp.soundSources || []).filter((s) => s.name === 'waterfall' && fall[0] && Math.hypot(s.x - fall[0].x, s.z - fall[0].z) < 14 && s.range >= 40);
    check('... the Weeping Fall hangs over the mouth, and is heard from 40 m or more', fall.length === 1 && Math.hypot(fall[0].x - m0[0], fall[0].z - m0[1]) < 10 && heard.length === 1, fall[0] ? `(${f1(Math.hypot(fall[0].x - m0[0], fall[0].z - m0[1]))} m from the mouth; sound ${heard.length ? `range ${heard[0].range}` : 'missing'})` : '(no fall)');
  }

  // the glass bridges: four of them, a deck of glass that is walkable end to end (the colliders hold him at one height all along, a step of 0.35 m or less between neighbours), wide enough, high over the water
  // at the middle, and meeting the ground at each end without a step (0.7 m at most); the Lone Stack's chest is across them
  {
    const placed = gp.placed.filter((p) => p.name === 'glass_bridge'), problems = [];
    if (placed.length !== BRIDGES.length) problems.push(`${placed.length} placed, ${BRIDGES.length} in the brief`);
    for (const b of BRIDGES) {
      const L = Math.hypot(b.to[0] - b.from[0], b.to[1] - b.from[1]), ux = (b.to[0] - b.from[0]) / L, uz = (b.to[1] - b.from[1]) / L;
      if (!placed.some((p) => Math.hypot(p.x - b.from[0], p.z - b.from[1]) < 0.3)) problems.push(`${b.id}: not placed`);
      if (b.width < 3.3) problems.push(`${b.id}: ${f1(b.width)} m wide`);
      let prev = null, worst = 0, gaps = 0, steep = 0;
      for (let d = 1.0; d <= L - 1.0; d += 0.6) {
        const x = b.from[0] + ux * d, z = b.from[1] + uz * d, s = collision.support(x, z, 40, 0.4);
        if (s.kind !== 'collider') gaps++;
        if (prev !== null) worst = Math.max(worst, Math.abs(s.y - prev));
        prev = s.y;
      }
      if (gaps) problems.push(`${b.id}: ${gaps} gaps in the deck`);
      if (worst > 0.35) problems.push(`${b.id}: a step of ${f1(worst)} m`);
      // from 2 m before the start to 2 m past the end, on the axis and 1.5 m to either side (where a hero runs, and where he drifts to): what holds him is the deck, or ground he can stand on - never the
      // steep rim of the ground sticking up through the deck's end and standing him still (the real controller would not climb it: that was the first run of the bot)
      for (let d = -2.0; d <= L + 2.0; d += 0.3) for (const lat of [-1.5, 0, 1.5]) {
        const x = b.from[0] + ux * d - uz * lat, z = b.from[1] + uz * d + ux * lat, s = collision.support(x, z, 40, 0.5);
        if (s.kind === 'terrain' && grid.normalAt(x, z)[1] < SLOPE_WALK) steep++;
      }
      if (steep) problems.push(`${b.id}: ${steep} steep terrain cells at its ends or under it`);
      const mid = collision.support(b.from[0] + ux * L / 2, b.from[1] + uz * L / 2, 40, 0.4), mid0 = h(b.from[0] + ux * L / 2, b.from[1] + uz * L / 2);
      if (mid.y - mid0 < 6) problems.push(`${b.id}: ${f1(mid.y - mid0)} m over the ground at the middle`);
      for (const [sx, sz, px, pz, nm] of [[b.from[0], b.from[1], -ux, -uz, 'start'], [b.to[0], b.to[1], ux, uz, 'end']]) {
        const deck = collision.support(sx - px * -1.2, sz - pz * -1.2, 40, 0.4).y, ground = collision.support(sx + px * 1.2, sz + pz * 1.2, deck + 0.7, 0.4).y;
        if (Math.abs(deck - ground) > 0.7) problems.push(`${b.id} ${nm}: a step of ${f1(Math.abs(deck - ground))} m (deck ${f1(deck)}, ground ${f1(ground)})`);
      }
    }
    check('four bridges of glass, each walkable end to end (no gaps, no step over 0.35 m), 3.3 m wide or more, 6 m or more over the water at the middle, and meeting the ground at each end', problems.length === 0, problems.slice(0, 4).join('; ') || `(${BRIDGES.map((b) => `${b.id} ${f1(Math.hypot(b.to[0] - b.from[0], b.to[1] - b.from[1]))} m`).join(', ')})`);
    const lone = gp.chests.find((c) => c.secret === 'lone'), route = lone ? walk.route(lone.x, lone.z, 2.4, lone.y - 0.3) || [] : [];
    let glass = 0;
    for (let i = 1; i < route.length; i++) if (route[i][1] - h(route[i][0], route[i][2]) > 3) glass += Math.hypot(route[i][0] - route[i - 1][0], route[i][2] - route[i - 1][2]);
    check('... the Lone Stack\'s chest is out over the Reach: the walk to it crosses 30 m of glass or more', !!lone && route.length > 0 && glass >= 30, `(${f1(glass)} m of bridge)`);
  }

  // the Sea Gate: two pillars across the neck of the headland ridge and a field of glass between them that opens when four of the five lenses shine. It really shuts the way: the ground across the gate is
  // no wider than the pillars' plinths (nothing is left to walk round them), and with it shut the walk to the Tideglass is gone - while the four lenses that open it are all in reach
  {
    const g5 = goal('light'), ux = Math.sin(GATE.yaw), uz = Math.cos(GATE.yaw);
    const gateY = h(GATE.x, GATE.z);
    let a = 0, b = 0;
    for (let s = 0; s <= 14; s += 0.25) { if (h(GATE.x + uz * s, GATE.z - ux * s) >= gateY - 1.2) b = s; if (h(GATE.x - uz * s, GATE.z + ux * s) >= gateY - 1.2) a = s; }
    check('the Sea Gate is across the whole neck: the ground at the gate is level with the threshold no wider than the pillars\' plinths (7.7 m either side of the middle, nothing to walk round them by)', !!gp.barrier && Math.hypot(gp.barrier.x - GATE.x, gp.barrier.z - GATE.z) < 1 && a <= 7.6 && b <= 7.6 && a >= 5 && b >= 5, `(ground within 1.2 m of the threshold's height: ${f1(a)} m one way, ${f1(b)} m the other)`);
    // ... and the way through it, once it is open, has no step the body cannot climb (0.62 m): the threshold is a flat slab, the road under it is pinned level (brief.js neckRoad)
    let step = 0, prevY = null;
    for (let a = -8; a <= 8; a += 0.3) {
      const x = GATE.x + ux * a, z = GATE.z + uz * a, y = collision.support(x, z, 60, 0.5).y;
      if (prevY !== null) step = Math.max(step, y - prevY);
      prevY = y;
    }
    check('... and once it is open the way through it has no step over 0.45 m to climb (the threshold is a flat slab on a road pinned level)', step <= 0.45, `(the highest step on the way through is ${f1(step)} m)`);
    const four = BRIEF.goals.slice(0, 4).map((g) => goal(g.id)), lights = four.map((g) => walkShut.distNear(g.x, g.z, 4, g.y - 0.5));
    check('... it opens at four lenses of five; shut, the Tideglass cannot be walked to, open it can - and the four lenses that open it are all in reach while it is shut', BRIEF.gate.at === 4 && BRIEF.goals.length === 5 && walkShut.distNear(g5.x, g5.z, 4, g5.y - 0.5) === Infinity && at(g5) < Infinity && lights.every((d) => d < Infinity), `(shut: ${four.map((g, i) => `${g.id} ${Number.isFinite(lights[i]) ? Math.round(lights[i]) : 'cut'}`).join(', ')}, light ${walkShut.distNear(g5.x, g5.z, 4, g5.y - 0.5)}; open: light ${Math.round(at(g5))} m)`);
  }

  // the lenses are Tide Lenses (the realm's own goal model), the last the big Tideglass, and each rings (its own sound) when it is lit
  {
    const wrong = BRIEF.goals.filter((g, i) => g.model !== 'tidelens' || !!g.big !== (i === BRIEF.goals.length - 1));
    check('every goal is a Tide Lens, the last the big Tideglass', wrong.length === 0, wrong.map((g) => g.id).join(' '));
    const mute = BRIEF.goals.filter((g) => g.sfx !== 'lens_ring');
    check('... and each rings when it is lit (lens_ring, not the lantern\'s whoomp), and the world hands the sound on to the goal records', mute.length === 0 && gp.beacons.every((b) => b.sfx === 'lens_ring'), mute.map((g) => g.id).join(' '));
  }

  // the Snuffers keep to the dry ground (the tide would drown or carry the ones on the sand): every one stands 1 m or more over the high tide
  {
    const wet = gp.enemies.filter((e) => h(e.x, e.z) < hi + 1.0);
    check('no Snuffer stands where the sea comes: each is 1 m or more over the high tide', wet.length === 0, wet.slice(0, 4).map((e) => `${f1(e.x)},${f1(e.z)}`).join(' ') || `(${gp.enemies.length} Snuffers)`);
  }

  // the ground the hero stands on: paving on the quay, sand on the flats and the beach, turf on the ridges and stacks, the cave's floor sand
  {
    const pick = terrainPicker(grid), tex = (x, z) => pick.at(x, z).tex, want = [
      ['the quay', -186, 18, ['cobble_tide']], ['the flats', 0, 66, ['sand_tide', 'sand_wet']], ['the High Road', -182, -48, ['tideturf']], ['the Cliffwalk', -26, -109.5, ['tideturf']], ['Pearl Rock', -18, 38, ['tideturf']], ['the first stack', 12.5, -82, ['tideturf']], ['the cave\'s chamber', GROTTO.x - 4, GROTTO.z + 2, ['sand_tide', 'sand_wet', 'cliff_tide']],
    ];
    const bad = want.filter(([, x, z, ok]) => !ok.includes(tex(x, z)));
    check('the ground wears its own textures: paving on the quay, sand on the flats, turf on the ridges, the rock and the stacks (off the roads)', bad.length === 0, bad.map(([n, x, z]) => `${n}: ${tex(x, z)}`).join('; ') || `(${want.map(([n, x, z]) => `${n} ${tex(x, z)}`).join(', ')})`);
  }

  // the sky is the realm's own: a teal dusk (dark, sea-green) and a green dawn (bright, gold on the horizon), each with its own clouds and distant hills
  {
    const [A, B] = TIDE_ENVIRONMENT.sky, luma = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    check('both skies paint their own clouds and hills; the dusk is a dark teal (the fog and the glow greener and bluer than red), the dawn bright with a gold horizon', [A, B].every((s) => s.cloudTop && s.cloudBot && s.ridge) && luma(A.zenith) < 0.2 && luma(B.zenith) > 0.4 && A.fog[1] > A.fog[0] + 0.15 && A.fog[2] > A.fog[0] + 0.15 && B.horizon[0] > B.horizon[2] + 0.2, `(zenith ${f1(luma(A.zenith))} -> ${f1(luma(B.zenith))}, dawn horizon ${B.horizon.map((v) => v.toFixed(2)).join(',')})`);
  }

  // the places of the TRAVEL menu are what the generator finds now (a change to the layout that was not followed by `node tools/realm-travel.mjs tideglass` shows here)
  {
    const canon = (groups) => groups.map((q) => `${q.name}: ${q.places.map((p) => [p.id, p.name, p.x, p.z, p.y ?? '', p.yaw, !!p.opens, !!p.shelf].join('|')).join(' ')}`).join('\n');
    const now = findTravelPlaces('tideglass'), a = canon(now.entry.groups), b = canon(TRAVEL_PLACES.groups);
    const diff = a.split('\n').map((l, i) => [l, b.split('\n')[i]]).filter(([x, y]) => x !== y).map(([x]) => x.slice(0, 60));
    check('the TRAVEL places are current (node tools/realm-travel.mjs tideglass)', now.problems.length === 0 && a === b, now.problems.join('; ') || (diff.length ? `(differs: ${diff.join(' / ')})` : ''));
  }
  // Dawnhaven's door to the realm is awake, and the way back is a door at the quay
  check('Dawnhaven\'s Tideglass door is awake and leads here, and the realm\'s own door leads back to Dawnhaven', DOORS.find((d) => d.id === 'tideglass').target === level.brief.id && DOOR.target === 'home', '');
}

console.log(failed.length + own ? `\n${failed.length + own} FAILED` : '\nall checks passed');
process.exitCode = failed.length + own ? 1 : 0;
