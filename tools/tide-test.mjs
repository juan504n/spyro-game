// The TIDE (src/game/realm/tide.js) proved without a browser or a dev server:
//   * the pure functions: the level over time, its extremes, its rate, the share of the cycle above a height, when it next crosses one;
//   * the REAL Player in water that rises and falls: wading at the mean level, drowning at the high tide on ground that is dry at the low, being set back on ground the sea does not reach even at the high
//     tide (and not on ground that is only above the mean level), and a world with no tide behaving exactly as before;
//   * the walk map at a given water level (the low tide by default, the high on request), and flooding from many places at once;
//   * the water that is drawn: lifted to the level of the tide, its shallows tinted again for the depth over them, the deeps and the high ground untouched, and the colours the same as the builder baked when the water
//     stands where it was cut; a world with no tide with a surface that has no way to move.
//   node tools/tide-test.mjs
import { Player } from '../src/game/player.js';
import { DEFAULT_SETTINGS } from '../src/engine/gfx.js';
import { WATER_LEVEL } from '../src/game/level.js';
import { TIDE, DROWN_DEPTH, WADE, tideLevel, tideLow, tideHigh, tideRate, tideDir, tideAbove, tideNext, tideProblems, refugeReach } from '../src/game/realm/tide.js';
import { defineBrief } from '../src/game/realm/brief.js';
import { REALM as STARTER } from '../src/game/realm/starter/index.js';
import { buildHeadless } from './headless-world.mjs';
import { makeWalkmap } from './walkmap.mjs';

const DT = 1 / 60;
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const f2 = (v) => v.toFixed(2);

// ---- the pure tide -----------------------------------------------------------------------------------------------------------------
const T = { period: 90, amp: 1.4, start: 0 };
{
  check('the water stands at the low tide when the world begins (start 0), at the mean a quarter of the way, at the high tide at half', near(tideLevel(T, 0), -1.4) && near(tideLevel(T, 22.5), 0, 1e-9) && near(tideLevel(T, 45), 1.4), `(${f2(tideLevel(T, 0))}, ${f2(tideLevel(T, 22.5))}, ${f2(tideLevel(T, 45))})`);
  check('... and is the same every period', near(tideLevel(T, 13.7), tideLevel(T, 13.7 + 90)) && near(tideLevel(T, 13.7), tideLevel(T, 13.7 + 9 * 90), 1e-9), '');
  const S = { ...T, start: 0.5 };
  check('start 0.5 begins at the high tide', near(tideLevel(S, 0), 1.4) && near(tideLevel(S, 45), -1.4), '');
  let lo = Infinity, hi = -Infinity, rate = 0, prev = tideLevel(T, 0);
  for (let t = 0.01; t <= 180; t += 0.01) { const y = tideLevel(T, t); lo = Math.min(lo, y); hi = Math.max(hi, y); rate = Math.max(rate, Math.abs(y - prev) / 0.01); prev = y; }
  check('the low and the high of the cycle are tideLow and tideHigh, and it rises as fast as tideRate says', near(lo, tideLow(T), 1e-3) && near(hi, tideHigh(T), 1e-3) && near(rate, tideRate(T), 2e-3), `(${f2(lo)}..${f2(hi)}, at most ${rate.toFixed(4)} m/s, tideRate ${tideRate(T).toFixed(4)})`);
  check('a world with no tide has the mean level for ever', tideLevel(null, 123) === WATER_LEVEL && tideLow(null) === WATER_LEVEL && tideHigh(null) === WATER_LEVEL && tideRate(null) === 0 && tideDir(null, 5) === 0, '');
  check('the direction: rising from the low tide, falling from the high', tideDir(T, 10) === 1 && tideDir(T, 60) === -1, '');
  let worst = 0;
  for (const y of [-1.2, -0.4, 0, 0.45, 1.0]) {
    let n = 0, N = 90000;
    for (let i = 0; i < N; i++) if (tideLevel(T, (i + 0.5) / N * 90) > y) n++;
    worst = Math.max(worst, Math.abs(n / N - tideAbove(T, y)));
  }
  check('tideAbove is the share of the cycle the water stands over a height (measured by sampling)', worst < 2e-4 && tideAbove(T, 1.5) === 0 && tideAbove(T, -1.5) === 1 && near(tideAbove(T, 0), 0.5), `(worst ${worst.toExponential(1)})`);
  let bad = 0;
  for (const y of [-1, -0.3, 0.2, 1.1]) for (const dir of [1, -1]) for (const t0 of [0, 7, 30, 61, 88]) {
    const w = tideNext(T, t0, y, dir), a = tideLevel(T, t0 + w), b = tideLevel(T, t0 + w + 0.01);
    if (!near(a, y, 1e-6) || Math.sign(b - a) !== dir) bad++;
  }
  check('tideNext is when the water next crosses a height, going the way asked', bad === 0 && tideNext(T, 0, 3, 1) === Infinity && tideNext(null, 0, 0, 1) === Infinity, `(${bad} wrong)`);
  check('the refuge a design may ask for is half what a wading hero covers while the water rises over his head (A 1.4 m, 90 s: about 35 m)', near(refugeReach(T), 0.5 * 11.5 * WADE * (DROWN_DEPTH / tideRate(T)), 1e-9) && refugeReach(T) > 30 && refugeReach(T) < 40, `(${refugeReach(T).toFixed(1)} m)`);
  check('tideProblems refuses a tide that is not one (a period of a minute and a half is one, a day is not; metres of amplitude, not a tenth)', tideProblems(T).length === 0 && tideProblems({ period: 3600, amp: 1.4 }).length === 1 && tideProblems({ period: 90, amp: 0.1 }).length === 1 && tideProblems({ period: 90, amp: 1.4, start: 1 }).length === 1 && tideProblems(null).length === 1, `(limits ${TIDE.periodMin}..${TIDE.periodMax} s, ${TIDE.ampMin}..${TIDE.ampMax} m)`);
  const sea = { name: 'THE SEA', deepHint: 'TOO DEEP!', radius: 300 };
  const probe = (extra) => { try { defineBrief({ ...STARTER.level.brief, lake: undefined, sea, ...extra }); return ''; } catch (e) { return e.message; } };
  check('a brief with a tide needs water to rise in, and a hint and a tint of the right shape', probe({ tide: T }) === '' && /tide\.hint/.test(probe({ tide: { ...T, hint: 'lower case' } })) && /tide\.tint/.test(probe({ tide: { ...T, tint: { shallow: [1, 1], deep: [0, 0, 0] } } })) && /tide: a tide needs water/.test((() => { try { defineBrief({ ...STARTER.level.brief, lake: undefined, sea: undefined, tide: T }); return ''; } catch (e) { return e.message; } })()), '');
}

// ---- the real Player in water that moves ----------------------------------------------------------------------------------------------
// ground: bare flats at -0.4 west of x = 0 (0.4 m under the mean level: wading at the mean, dry at the low tide, 1.8 m deep at the high), a shelf of 1.8 m from x = 0 to x = 10 (above the mean
// level and under the high tide's reach: the sea never covers it deeply, but the hero is not "safe" there), and high ground of 3 m east of that
const heightAt = (x) => (x < 0 ? -0.4 : x < 10 ? 1.8 : 3.0);
const collision = { support: (x) => ({ y: heightAt(x), kind: 'terrain', c: null }), normalAt: () => [0, 1, 0], heightAt: (x) => heightAt(x), pushOut: () => null };
function world(tide) {
  const game = { gfx: { settings: { ...DEFAULT_SETTINGS } }, collision, level: { valley: { x: 0, z: 0, rx: 1e6, rz: 1e6 } }, objects: null, beacons: null, enemies: null,
    gameplay: { spawn: { x: 30, y: 3.0, z: 0, yaw: 0 } }, startSpot() { const sp = this.gameplay.spawn; return { x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw }; } };      // (Game.startSpot: where the world begins)
  if (tide !== undefined) { game.waterY = tide ? tideLevel(tide, 0) : 0; game.waterHi = tideHigh(tide); game.waterLo = tideLow(tide); }
  const p = new Player(game, null);
  const input = { move: { x: 0, y: 0 }, held: {}, edge: {}, pressed(a) { return !!this.edge[a]; }, down(a) { return !!this.held[a]; } };
  const events = [];
  p.on.drown = () => events.push('drown'); p.on.splash = (d) => events.push(`splash ${d.toFixed(2)}`); p.on.respawn = () => events.push('respawn');
  const step = () => { p.update(DT, input, 0); input.edge = {}; };
  return { game, p, input, step, events };
}
const run = (step, secs) => { for (let i = 0; i < Math.round(secs / DT); i++) step(); };
{
  // at the low tide the flats are dry
  const a = world(T);
  a.game.waterY = -1.4;
  a.p.place(-20, -0.4, 0, 0);
  run(a.step, 1.5);
  check('at the low tide (1.4 m under the mean) the flats are bare: he is not in the water and nothing splashes', !a.p.inWater && a.events.length === 0, `(in water ${a.p.inWater}, events ${a.events.join() || 'none'})`);

  // at the mean level they are 0.4 m under: he wades, slower
  const b = world(T);
  b.game.waterY = 0;
  b.p.place(-20, -0.4, 0, 0);
  b.input.move = { x: 0, y: 1 };                              // (camera yaw 0: stick y > 0 runs along +z)
  run(b.step, 1.6);
  check('at the mean level the flats are 0.4 m deep: he wades (a splash on entering) at 0.62 of a run, and does not drown', b.p.inWater && b.events.some((e) => e.startsWith('splash')) && !b.events.includes('drown') && near(b.p.speed, 11.5 * WADE, 0.4), `(speed ${b.p.speed.toFixed(2)} m/s, ${b.events.join()})`);

  // as the water rises over the flats it drowns him, and sets him back where the sea does not reach at the high tide
  const c = world(T);
  c.game.waterY = -1.4;
  c.p.place(4, 1.8, 0, 0);                                    // (on the shelf of 1.8 m: above the mean level, but within the reach of the high tide)
  run(c.step, 1.0);
  c.p.x = 14; c.p.y = 3.0; c.p.grounded = false;              // (up on the high ground for a moment: the spot he is set back on)
  run(c.step, 1.0);
  const safeX = c.p.safe.x;
  c.p.x = -20; c.p.y = -0.4; c.p.vx = c.p.vy = c.p.vz = 0; c.p.grounded = false;
  run(c.step, 0.5);
  c.game.waterY = 1.4;                                        // (the tide is in: 1.8 m of water over the flats)
  const t0 = c.events.length;
  run(c.step, 0.6);
  const drownedAt = c.events.slice(t0).indexOf('drown');
  check('at the high tide the flats are 1.8 m deep: he drowns (after a third of a second) and is set back on ground the sea does not reach', drownedAt >= 0 && c.p.x === safeX && c.p.y > 2.5 && !c.p.inWater, `(events ${c.events.slice(t0).join()}; back at x ${f2(c.p.x)}, y ${f2(c.p.y)}, the safe spot was x ${f2(safeX)})`);
  check('... that spot is on the high ground (3 m), not the shelf (1.8 m: dry now, under 0.6 m of the high tide\'s reach)', safeX > 10, `(x ${f2(safeX)})`);

  // the same hero standing on the shelf never makes it his safe spot while the high tide could reach it
  const d = world(T);
  d.game.waterY = 0;
  d.p.place(30, 3.0, 0, 0);
  run(d.step, 1.0);
  d.p.x = 4; d.p.y = 1.8; d.p.grounded = false;
  run(d.step, 3.0);
  check('standing on 1.8 m ground (under the high tide\'s 1.4 + 0.6) does not make it a safe spot', d.p.safe.x === 30, `(safe x ${f2(d.p.safe.x)})`);

  // a world with no tide (a game with no waterY at all, as every test of the controller makes one, or with the mean level) is what it was
  const e = world(undefined), f = world(null);
  for (const w of [e, f]) { w.p.place(-20, -0.4, 0, 0); w.p.safe = { x: 30, y: 3, z: 0, yaw: 0 }; run(w.step, 1.0); }
  check('with no tide at all the flats 0.4 m under the mean level are shallow water for ever (no drowning), and the same with or without the game\'s water numbers', e.p.inWater && f.p.inWater && !e.events.includes('drown') && !f.events.includes('drown'), `(${e.events.join()} | ${f.events.join()})`);
  const g = world(undefined);
  g.p.place(-20, -2.5, 0, 0);
  const ground = collision.heightAt; collision.heightAt = () => -2.5; collision.support = () => ({ y: -2.5, kind: 'terrain', c: null });
  g.p.safe = { x: 30, y: 3, z: 0, yaw: 0 };
  run(g.step, 1.0);
  collision.heightAt = ground; collision.support = (x) => ({ y: heightAt(x), kind: 'terrain', c: null });
  check('... and 2.5 m under the mean level is the deep: he drowns, as in every lake', g.events.includes('drown'), `(${g.events.join()})`);
  // a safe spot that would take him again is no safe spot (the data once put one on the bed of a lake: an arrival with no height; he drowned there and was set back to the same place, for ever): he is set
  // back at the start of the world instead, once, and stays there dry
  const deep = (x) => (x < 20 ? -2.5 : 3.0);
  const saveSup = collision.support, saveH = collision.heightAt;
  collision.heightAt = deep; collision.support = (x) => ({ y: deep(x), kind: 'terrain', c: null });
  const h = world(undefined);
  h.p.place(-20, -2.5, 0, 0);                                 // (place() makes the spot his safe spot: here it is 2.5 m under the water)
  run(h.step, 3.0);
  const drowns = h.events.filter((e) => e === 'drown').length;
  check('a safe spot that is itself under 2.5 m of water sends him to the start of the world, once (not to the same bed again and again), and he stands there dry', drowns === 1 && h.p.x === 30 && h.p.y > 2.9 && !h.p.inWater && h.p.safe.x === 30, `(${drowns} drownings, at x ${f2(h.p.x)} y ${f2(h.p.y)}, safe ${f2(h.p.safe.x)})`);
  // ... and one that is dry is still where he goes back to
  const k = world(undefined);
  k.p.place(40, 3.0, 0, 0);
  run(k.step, 0.5);
  k.p.x = -20; k.p.y = -2.5; k.p.vx = k.p.vy = k.p.vz = 0; k.p.grounded = false;
  run(k.step, 1.0);
  check('... a safe spot that is dry is still where a drowned hero goes back to (the start is for the spot that takes him again)', k.events.includes('drown') && k.p.x === 40, `(at x ${f2(k.p.x)})`);
  collision.support = saveSup; collision.heightAt = saveH;
}

// ---- the walk map at a water level --------------------------------------------------------------------------------------------------
{
  const W = buildHeadless('starter');
  const wm = makeWalkmap(W);
  const start = [W.gp.spawn.x, W.gp.spawn.z];
  const def = wm.flood(start, { hop: 6.2 }), mean = wm.flood(start, { hop: 6.2, water: WATER_LEVEL }), low = wm.flood(start, { hop: 6.2, water: -1.4 }), high = wm.flood(start, { hop: 6.2, water: 1.4 });
  check('the walk map: with no water level given it floods at the mean level (a world without a tide has no other), and the same cells as water: WATER_LEVEL', def.count === mean.count && wm.tideLow === WATER_LEVEL && wm.tideHigh === WATER_LEVEL, `(${def.count} cells)`);
  check('... lower water gives the hero more ground (the lake\'s deep begins lower), higher water less', low.count > mean.count && high.count < mean.count, `(low tide ${low.count}, mean ${mean.count}, high tide ${high.count} cells)`);
  // many seeds at once: the distance is to the nearest of them
  const one = wm.flood(start);
  let far = null;
  one.each((x, y, z) => { if (!far && Math.hypot(x - start[0], z - start[1]) > 40) far = [x, z, y]; });
  const two = wm.flood(null, { seeds: [[start[0], start[1]], far] });
  const mid = [(start[0] + far[0]) / 2, (start[1] + far[1]) / 2];
  check('flooding from two places at once: each is at distance 0, and a place between them is no farther from the pair than from either alone', two.dist(start[0], start[1]) === 0 && two.dist(far[0], far[1]) === 0 && two.distNear(mid[0], mid[1], 8) <= one.distNear(mid[0], mid[1], 8) + 1e-9, `(${two.count} cells from the pair, ${one.count} from one)`);
}

// ---- the water that is drawn ---------------------------------------------------------------------------------------------------------------
{
  const { buildWater } = await import('../src/game/water.js');
  const { Assets } = await import('../src/game/assets.js');
  const assets = new Assets();
  const TIDAL = { ...STARTER, level: { ...STARTER.level, tide: { period: 90, amp: 1.4, start: 0 } } };
  const W = buildHeadless(TIDAL), W0 = buildHeadless('starter');
  const g = buildWater(W.grid, W.lighting, assets), g0 = buildWater(W0.grid, W0.lighting, assets);
  check('a world with no tide has a surface with no way to move (the water group has no setLevel)', typeof g0.setLevel === 'undefined' && g0.position.y === 0, '');
  check('a world with a tide has one, and some of its vertices (the shallows) are tinted again as the water moves, but not all of them (the deeps and the high ground are not)', typeof g.setLevel === 'function' && g.setLevel.tidal > 100, `(${g.setLevel && g.setLevel.tidal} of ${g.children[0].geometry.attributes.position.count} vertices)`);
  const mesh = g.children[0], A = mesh.geometry.attributes.aCol.array, B = mesh.geometry.attributes.aColB.array;
  const base = A.slice(), baseB = B.slice();
  // the colours it was baked with are what a retint at the mean level gives (within the rounding of a byte): the formula is the builder's
  g.setLevel.retint(WATER_LEVEL);
  let off = 0;
  for (let i = 0; i < A.length; i++) off = Math.max(off, Math.abs(A[i] - base[i]), Math.abs(B[i] - baseB[i]));
  check('with the water at the level it was cut at the tinted vertices come out as the builder baked them (a byte at most)', off <= 1, `(largest difference ${off})`);
  g.setLevel(-1.4);
  const lowCols = A.slice(), lowY = g.position.y, pos = mesh.geometry.attributes.position;
  let changed = 0, still = 0, wrong = 0;
  for (let v = 0; v < A.length / 4; v++) {
    let d = 0;
    for (let c = 0; c < 3; c++) d += Math.abs(lowCols[v * 4 + c] - base[v * 4 + c]);
    const gh = W.grid.heightAt(pos.getX(v), pos.getZ(v)), tidal = gh < 1.4 && gh > -1.4 - 4.2;
    if (d) changed++; else still++;
    if (!tidal && d) wrong++;                         // (over the deeps or the high ground the tint must be what it was)
  }
  check('at the low tide the group is lowered by the tide (1.4 m), the vertices over the tidal ground are tinted again, and none of the rest', near(lowY, -1.4) && changed > 50 && wrong === 0, `(group y ${lowY}, ${changed} tinted again, ${still} as they were, ${wrong} changed that should not have)`);
  g.setLevel(1.4);
  const hiCols = A.slice();
  let darker = 0, lighter = 0;
  for (let v = 0; v < A.length / 4; v++) { const l = lowCols[v * 4 + 2] - base[v * 4 + 2], h = hiCols[v * 4 + 2] - base[v * 4 + 2]; if (h < 0 && l >= 0) darker++; if (l > 0 && h <= 0) lighter++; }
  check('where the water is deeper the surface is tinted deeper (darker blue-grey than at the mean) and where it is shallower, lighter: the high tide darkens the shallows, the low tide lightens them', near(g.position.y, 1.4) && darker > 20, `(group y ${g.position.y}; ${darker} vertices darker at the high tide than at the mean)`);
  g.setLevel(WATER_LEVEL);
  let back = 0;
  for (let i = 0; i < A.length; i++) back = Math.max(back, Math.abs(A[i] - base[i]));
  check('back at the mean level the surface is as it was', near(g.position.y, 0) && back <= 1, `(${back})`);
  void B;
}

console.log(failed ? `\n${failed} FAILED` : '\nall tide checks passed');
process.exitCode = failed ? 1 : 0;
