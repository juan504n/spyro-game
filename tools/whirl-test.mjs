// Whirlwinds through the REAL Player (no browser, no dev server): a hero in the foot of an updraft is lifted off the ground to the top and hovers there; one who walks in at the edge is caught, not thrown
// out; one outside it, or above its top, is not touched; at the top he presses jump and glides out as far as the situation check (src/game/realm/situations.js) promises. The ground is flat at y = 0.
//   node tools/whirl-test.mjs
import { Player } from '../src/game/player.js';
import { DEFAULT_SETTINGS } from '../src/engine/gfx.js';
import { WHIRL, apexOf, radiusAt, liftSpeed, whirlAt } from '../src/game/realm/whirl.js';
import { liftReach, GLIDE_MARGIN } from '../src/game/realm/situations.js';

const DT = 1 / 60;
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const collision = { support: () => ({ y: 0, kind: 'terrain', c: null }), normalAt: () => [0, 1, 0], heightAt: () => 0, pushOut: () => null };

const W = { id: 'w', x: 0, z: 0, y0: 0, h: 30, r: 2.6 };
function world(whirls = [W]) {
  const game = { gfx: { settings: { ...DEFAULT_SETTINGS } }, collision, level: { valley: { x: 0, z: 0, rx: 1e6, rz: 1e6 } }, objects: { whirlwinds: whirls }, beacons: null, enemies: null };
  const p = new Player(game, null);
  const input = { move: { x: 0, y: 0 }, held: {}, edge: {}, pressed(a) { return !!this.edge[a]; }, down(a) { return !!this.held[a]; } };
  const step = () => { p.update(DT, input, 0); input.edge = {}; };
  return { p, input, step };
}
const run = (step, secs) => { for (let i = 0; i < Math.round(secs / DT); i++) step(); };

// ---- the shape of the column ---------------------------------------------------------------------------------------------------
check('the column widens as it rises, from r at its foot to WIDEN x r at its top', Math.abs(radiusAt(W, 0) - W.r) < 1e-9 && Math.abs(radiusAt(W, 30) - W.r * WHIRL.widen) < 1e-9, `(${radiusAt(W, 0).toFixed(1)} m .. ${radiusAt(W, 30).toFixed(1)} m)`);
check('it holds from a little under its foot to a little over its top, and not outside its radius', !!whirlAt(W, 0, -0.5, 0) && !whirlAt(W, 0, -1, 0) && !!whirlAt(W, 0, 31, 0) && !whirlAt(W, 0, 32, 0) && !whirlAt(W, 2.7, 0, 0) && !!whirlAt(W, 2.5, 0, 0), '');
check('the lift is full to six metres under the top and eases to a hover', liftSpeed(W, 10) === WHIRL.lift && liftSpeed(W, 30) === 0 && liftSpeed(W, 27) > 0 && liftSpeed(W, 27) < WHIRL.lift, '');

// ---- standing in the foot: lifted off the ground, carried to the top, hovering ---------------------------------------------------------
{
  const { p, step } = world();
  p.place(0.6, 0, 0.3, 0);
  let t = 0, topAt = null, maxY = 0;
  for (; t < 8; t += DT) { step(); maxY = Math.max(maxY, p.y); if (topAt === null && p.y > apexOf(W) - 1.5) topAt = t; }
  check('standing in its foot he is lifted off the ground and carried up to its top (11 m/s: the 30 m in about three seconds)', topAt !== null && topAt > 2.2 && topAt < 5, `(within 1.5 m of the top after ${topAt === null ? 'never' : topAt.toFixed(1)} s)`);
  check('... and hovers there: no overshoot, no sinking, the air hold him', maxY < apexOf(W) + 0.8 && Math.abs(p.y - apexOf(W)) < 0.8 && Math.abs(p.vy) < 0.5 && !p.grounded, `(y ${p.y.toFixed(2)} after 8 s, the top is ${apexOf(W)}, highest ${maxY.toFixed(2)})`);
  check('... near the axis: the column draws him in', Math.hypot(p.x, p.z) < 0.6, `(${Math.hypot(p.x, p.z).toFixed(2)} m from the axis)`);
}

// ---- walking in at the edge: caught, not thrown out ---------------------------------------------------------------------------------------
{
  const { p, input, step } = world();
  p.place(-8, 0, 1.8, 0);                              // 8 m west of the column, 1.8 m south of its axis: he runs east into its edge
  input.move = { x: -1, y: 0 };                         // (camera yaw 0: stick x < 0 is east)
  let inAt = null;
  for (let t = 0; t < 4; t += DT) { step(); if (inAt === null && whirlAt(W, p.x, p.y, p.z)) { inAt = t; input.move = { x: 0, y: 0 }; } }
  run(step, 4);
  check('running into the edge of the column at full speed, he is caught and lifted', inAt !== null && p.y > 15, `(entered after ${inAt === null ? 'never' : inAt.toFixed(2)} s, ${p.y.toFixed(1)} m up after 8 s)`);
}
{
  const { p, input, step } = world();
  p.place(-8, 0, 0, 0);
  input.move = { x: -1, y: 0 };                         // straight through the middle, full speed, and keep the stick pushed
  let top = 0, exitSpeed = null, wasIn = false;
  for (let t = 0; t < 4; t += DT) {
    step(); top = Math.max(top, p.y);
    const inside = !!whirlAt(W, p.x, p.y, p.z);
    if (wasIn && !inside && exitSpeed === null) exitSpeed = p.speed;
    wasIn = inside;
  }
  // (with his running kept whole inside the column - WHIRL.hold 1 - he is lifted 6 m and carried out of it at 5.5 m/s; held at 0.35 of a run he is lifted 16 m and leaves at 2.8: the thresholds are between)
  check('running straight through the middle and keeping the stick pushed: the thick air slows him and lifts him well up (a third of the column), he is not thrown through', top > 12 && (exitSpeed === null || exitSpeed < 4), `(lifted ${top.toFixed(1)} m, left it at ${exitSpeed === null ? 'never' : exitSpeed.toFixed(1)} m/s)`);
}

// ---- not touched outside it ---------------------------------------------------------------------------------------------------------
{
  const { p, step } = world();
  p.place(W.r + 1.2, 12, 0, 0); p.vy = 0;
  run(step, 0.5);
  check('a hero falling just outside its radius falls', p.y < 12 - 2, `(${p.y.toFixed(1)} m after half a second from 12)`);
  const q = world();
  q.p.place(0, apexOf(W) + 3, 0, 0);
  run(q.step, 0.4);
  check('a hero above its top is not lifted', q.p.y < apexOf(W) + 3 - 0.5, `(${q.p.y.toFixed(1)} m)`);
}

// ---- the glide out of the top: as far as the situation check promises ----------------------------------------------------------------------
{
  const { p, input, step } = world();
  p.place(0.2, 0, 0, 0);
  run(step, 6);                                          // carried to the top
  input.move = { x: 0, y: 1 }; input.held.jump = true; input.edge = { jump: true };
  let landed = null, glided = false;
  for (let t = 0; t < 14 && landed === null; t += DT) { step(); if (p.gliding) glided = true; if (p.grounded) landed = Math.hypot(p.x, p.z); }
  const bound = liftReach(apexOf(W)) * GLIDE_MARGIN;
  check('at the top he presses jump (and steers) and glides out of the column', glided && landed !== null, `(glided: ${glided}, came down ${landed === null ? 'never' : landed.toFixed(1)} m from the axis)`);
  check('... at least as far as the situation check says a glide from the top carries (with its margin of a person)', landed !== null && landed >= bound, `(${landed === null ? '?' : landed.toFixed(1)} m against ${bound.toFixed(1)} m, ${landed === null ? '?' : (landed / liftReach(apexOf(W))).toFixed(2)} of the ballistic reach ${liftReach(apexOf(W)).toFixed(1)})`);
}

// ---- a hero gliding over a column gains height from it ---------------------------------------------------------------------------------------
{
  const { p, input, step } = world();
  p.place(-10, 14, 0, -Math.PI / 2);                   // facing east (yaw = atan2(x, z): +x is yaw PI/2)
  p.yaw = Math.PI / 2; p.vy = 0; p.jumpsUsed = 1;
  input.held.jump = true; input.edge = { jump: true };
  input.move = { x: -1, y: 0 };
  let top = 0;
  for (let t = 0; t < 3; t += DT) { step(); top = Math.max(top, p.y); }
  check('a hero gliding through a column is carried up while he is in it (a glide over one gains height)', top > 14.5, `(highest ${top.toFixed(1)} m from 14 m)`);
}

// ---- no whirlwinds: nothing changes -----------------------------------------------------------------------------------------------------------
{
  const a = world([]), b = world([W]);
  a.p.place(40, 5, 40, 0); b.p.place(40, 5, 40, 0);
  run(a.step, 1); run(b.step, 1);
  check('far from any column a hero falls exactly as he does without whirlwinds', a.p.y === b.p.y && a.p.vy === b.p.vy, `(${a.p.y.toFixed(3)} / ${b.p.y.toFixed(3)})`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall whirlwind checks passed');
process.exitCode = failed ? 1 : 0;
