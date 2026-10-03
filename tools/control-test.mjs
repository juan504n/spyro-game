// Controls test (no browser, no dev server): the touch stick maths and the fire aim assist, the latter through the REAL Player.
//   node tools/control-test.mjs
import { FloatingStick } from '../src/game/touchstick.js';
import { AIM, aimBearing, aimStep } from '../src/game/aim.js';
import { Player } from '../src/game/player.js';
import { DEFAULT_SETTINGS } from '../src/engine/gfx.js';

const DT = 1 / 60, DEG = 180 / Math.PI, rad = (d) => (d * Math.PI) / 180;
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- the move stick ----------------------------------------------------------------------------------------------------
{
  const st = new FloatingStick({ radius: 52, dead: 0.14 }).start(200, 300);
  let worst = 0;
  for (let i = 0; i < 40; i++) { st.move(200 + 5 * Math.sin(i), 300 + 5 * Math.cos(i * 1.3)); worst = Math.max(worst, Math.hypot(st.x, st.y)); }
  check('stick: a resting thumb (5 px of wandering) does nothing', worst === 0, `(largest output ${worst.toFixed(2)})`);
  st.move(200 + 30, 300);
  check('stick: 30 px right reads as right, past the dead zone', near(st.y, 0) && st.x > 0.45 && st.x < 0.6, `(${st.x.toFixed(2)})`);
  st.move(200, 300 - 52);
  check('stick: up on the screen is +y, full at the rim', near(st.x, 0) && near(st.y, 1), `(${st.y.toFixed(2)})`);
  const before = { x: st.bx, y: st.by };
  st.move(200 + 100, 300);
  check('stick: sliding past the rim drags the circle along', near(st.x, 1) && near(Math.hypot(st.dx, st.dy), 52) && st.bx > before.x + 40, `(circle moved ${(st.bx - before.x).toFixed(0)} px)`);
  st.move(200 + 100 - 104, 300);
  check('stick: turning right round takes one diameter of thumb travel, not a long haul', near(st.x, -1, 1e-6), `(${st.x.toFixed(2)})`);
  st.end();
  check('stick: letting go clears it', st.x === 0 && st.y === 0 && !st.active);
  // direction is exact (no drift between axes) at any angle
  const s2 = new FloatingStick().start(0, 0);
  s2.move(30 * Math.cos(rad(37)), -30 * Math.sin(rad(37)));
  check('stick: the direction is the thumb\'s direction', near(Math.atan2(s2.y, s2.x) * DEG, 37, 1e-6));
}

// ---- aim assist maths -----------------------------------------------------------------------------------------------------
{
  const at = (bearingDeg, d) => ({ x: Math.sin(rad(bearingDeg)) * d, z: Math.cos(rad(bearingDeg)) * d, r: 0.9 });
  check('aim: a target dead ahead is found', near(aimBearing(0, 0, 0, [at(0, 4)]), 0));
  check('aim: 60 deg off is still inside the cone', near(aimBearing(0, 0, 0, [at(60, 4)]) * DEG, 60, 1e-6));
  check('aim: 75 deg off is not', aimBearing(0, 0, 0, [at(75, 4)]) === null);
  check('aim: too far away is not', aimBearing(0, 0, 0, [at(10, 20)]) === null);
  check('aim: the target nearest to straight ahead wins', near(aimBearing(0, 0, 0, [at(60, 3), at(-15, 6)]) * DEG, -15, 1e-6));
  check('aim: works with wrap-around (yaw near +-pi)', near(aimBearing(0, 0, rad(170), [at(-160, 4)]) * DEG, -160, 1e-6));
  let y = 0; for (let i = 0; i < 6; i++) y = aimStep(y, rad(80), DT);
  check('aim: it swings at a limited rate and never overshoots', near(y, AIM.rate * DT * 6, 1e-9) && aimStep(0, 0.01, DT) === 0.01, `(${(y * DEG).toFixed(1)} deg in 6 frames)`);
}

// ---- aim assist through the real Player ------------------------------------------------------------------------------------
const collision = { support: () => ({ y: 0, kind: 'terrain', c: null }), normalAt: () => [0, 1, 0], heightAt: () => 0, pushOut: () => null };
function breathe({ bearing, dist = 4.5, stick = [0, 0], assist = true, lit = false, kind = 'brazier' }) {
  const spot = { x: Math.sin(rad(bearing)) * dist, y: 0, z: Math.cos(rad(bearing)) * dist };
  const braziers = kind === 'brazier' ? [{ ...spot, lit }] : [];
  const objects = { braziers, vases: kind === 'vase' ? [{ ...spot, broken: lit }] : [], chests: kind === 'chest' ? [{ ...spot, opened: lit }] : [] };
  const game = { gfx: { settings: { ...DEFAULT_SETTINGS, aimAssist: assist } }, collision, level: { valley: { x: 0, z: 0, rx: 1e6, rz: 1e6 } }, objects, beacons: null, enemies: null };
  const p = new Player(game, null);
  p.place(0, 0, 0, 0);
  const input = { move: { x: stick[0], y: stick[1] }, held: {}, edge: {}, pressed(a) { return !!this.edge[a]; }, down(a) { return !!this.held[a]; } };
  for (let i = 0; i < 20; i++) p.update(DT, input, 0);
  let hit = false;
  input.held.flame = true; input.edge = { flame: true };
  for (let i = 0; i < 40; i++) {
    p.update(DT, input, 0);
    input.edge = {};
    if (p.flameHits(spot.x, spot.y + 0.9, spot.z, 0.9)) hit = true;
  }
  return { hit, yaw: p.yaw * DEG };
}
{
  const off = breathe({ bearing: 55, assist: false });
  check('no assist: a brazier 55 deg off to the side is missed', !off.hit && Math.abs(off.yaw) < 1, `(facing ${off.yaw.toFixed(0)} deg)`);
  const on = breathe({ bearing: 55 });
  check('assist: Spyro swings round to it and burns it', on.hit && on.yaw > 40, `(facing ${on.yaw.toFixed(0)} deg)`);
  const vase = breathe({ bearing: 55, kind: 'vase' }), chest = breathe({ bearing: -50, kind: 'chest' }), broken = breathe({ bearing: 55, kind: 'vase', lit: true });
  check('assist: vases and chests are targets too, until they are broken / open', vase.hit && chest.hit && !broken.hit && Math.abs(broken.yaw) < 1, `(vase ${vase.yaw.toFixed(0)}, chest ${chest.yaw.toFixed(0)}, broken ${broken.yaw.toFixed(0)} deg)`);
  const lit = breathe({ bearing: 55, lit: true });
  check('assist: ignores a brazier that is already lit', !lit.hit && Math.abs(lit.yaw) < 1);
  const behind = breathe({ bearing: 150 });
  check('assist: never spins him right round to something behind him', !behind.hit && Math.abs(behind.yaw) < 1);
  // (steering is camera-relative: with the camera looking along +z, stick x > 0 runs towards -x, so a target on the +x side is at stick x < 0)
  const away = breathe({ bearing: 55, stick: [Math.sin(rad(60)), Math.cos(rad(60))] });       // pushed 60 deg away from the target's side
  check('assist: the stick has the last word (it will not fight where you point him)', !away.hit && away.yaw < 0, `(facing ${away.yaw.toFixed(0)} deg)`);
  const along = breathe({ bearing: 55, stick: [-Math.sin(rad(60)), Math.cos(rad(60))] });     // pushed 60 deg towards it: the assist finishes the job
  check('assist: helps when the stick already points roughly at the target', along.hit && along.yaw > 50, `(facing ${along.yaw.toFixed(0)} deg)`);
}

// ---- ram + jump through the real Player ---------------------------------------------------------------------------------------
// In the original you can jump while ramming: hold the ram button, tap jump, and the charge carries on through the air (and on landing) while the button stays held.
function ramJump({ ram = true, releaseInAir = false } = {}) {
  const game = { gfx: { settings: { ...DEFAULT_SETTINGS } }, collision, level: { valley: { x: 0, z: 0, rx: 1e6, rz: 1e6 } }, objects: {}, beacons: null, enemies: null };
  const p = new Player(game, null);
  p.place(0, 0, 0, 0);
  const input = { move: { x: 0, y: 1 }, held: {}, edge: {}, pressed(a) { return !!this.edge[a]; }, down(a) { return !!this.held[a]; } };
  const step = () => { p.update(DT, input, 0); input.edge = {}; };
  for (let i = 0; i < 30; i++) step();                                   // run up
  if (ram) { input.held.charge = true; input.edge = { charge: true }; for (let i = 0; i < 40; i++) step(); }     // ram to full speed (and keep the button down)
  const x0 = p.z, v0 = p.speed, charging0 = p.chargeT > 0;
  input.held.jump = true; input.edge = { jump: true }; step(); input.held.jump = false;                        // tap jump
  const r = { charging0, v0, jumped: !p.grounded && p.vy > 10, chargingAfter: p.chargeT > 0, minAir: 1e9, flew: 0 };
  let frames = 0;
  while (!p.grounded && frames < 200) {
    step(); frames++;
    r.minAir = Math.min(r.minAir, p.speed);
    if (releaseInAir && frames === 10) input.held.charge = false;
  }
  r.dist = p.z - x0; r.chargingLanded = p.chargeT > 0; r.vLanded = p.speed; r.frames = frames;
  input.held.charge = false; step();
  r.chargingReleased = p.chargeT > 0;
  return r;
}
{
  const run = ramJump({ ram: false }), ram = ramJump();
  check('jump: a plain running jump is as it was (about 8.7 m)', run.jumped && !run.charging0 && run.dist > 7.5 && run.dist < 10, `(${run.dist.toFixed(1)} m)`);
  check('ram + jump: with RAM held and JUMP tapped he jumps, still ramming', ram.charging0 && ram.jumped && ram.chargingAfter, `(charging before ${ram.charging0}, left the ground ${ram.jumped}, still charging ${ram.chargingAfter})`);
  check('ram + jump: the ram keeps its speed all the way through the air, so the jump is long (about 18 m)', ram.minAir > 22 && ram.dist > 15, `(slowest ${ram.minAir.toFixed(1)} m/s, ${ram.dist.toFixed(1)} m)`);
  check('ram + jump: he lands still ramming while RAM stays held, and letting go ends it', ram.chargingLanded && ram.vLanded > 22 && !ram.chargingReleased, `(charging on landing ${ram.chargingLanded}, speed ${ram.vLanded.toFixed(1)}, after letting go ${ram.chargingReleased})`);
  const cut = ramJump({ releaseInAir: true });
  check('ram + jump: letting go of RAM in the air ends the ram (back to a normal run speed at once)', cut.jumped && !cut.chargingLanded && cut.vLanded < 12.5, `(charging on landing ${cut.chargingLanded}, speed ${cut.vLanded.toFixed(1)})`);
}

// ---- a deck over the crest of a steep rim, through the real Player -------------------------------------------------------------------------------
// The rule that stops a runner climbing a steep face read the TERRAIN under him: a glass bridge laid over the rim of a stack stood the hero still on it (the first run of the realm walker at Tideglass
// Reach: the terrain under the deck was steep and rising towards the stack, and the deck rose a few centimetres on the way). On a prop that rises he walks; on the bare face he is still stopped.
function rimWalk({ deck }) {
  // terrain: flat at 12 m for z >= 0, falling away steeply towards -z (the face rises towards +z); the deck is a collider 3.8 m wide from z = -6 to z = 1 at 12.1 m rising 0.05 m a metre
  const terrain = (z) => (z >= 0 ? 12 : 12 + 3 * z);
  const deckTop = (x, z) => (deck && Math.abs(x) <= 1.9 && z >= -6 && z <= 1 ? 12.1 + 0.05 * (z + 6) : -Infinity);
  const col = {
    support: (x, z, feet, up) => { const t = terrain(z), d = deckTop(x, z); return d > t && d <= feet + up ? { y: d, kind: 'collider', c: {} } : { y: t, kind: 'terrain', c: null }; },
    normalAt: (x, z) => (z < 0.5 ? [0, 0.3, -0.95] : [0, 1, 0]),                 // (the face rises towards +z, so its normal leans towards -z)
    heightAt: (x, z) => Math.max(terrain(z), deckTop(x, z)),
    pushOut: () => null,
  };
  const game = { gfx: { settings: { ...DEFAULT_SETTINGS } }, collision: col, level: { valley: { x: 0, z: 0, rx: 1e6, rz: 1e6 } }, objects: {}, beacons: null, enemies: null };
  const p = new Player(game, null);
  p.place(0, deck ? deckTop(0, -5) : terrain(-0.5), deck ? -5 : -0.5, 0);
  const input = { move: { x: 0, y: 1 }, held: {}, edge: {}, pressed(a) { return !!this.edge[a]; }, down(a) { return !!this.held[a]; } };
  const z0 = p.z;
  for (let i = 0; i < 90; i++) { p.update(DT, input, 0); input.edge = {}; }
  return { moved: p.z - z0, kind: p.groundKind };
}
{
  const onDeck = rimWalk({ deck: true }), bare = rimWalk({ deck: false });
  check('a hero on a deck that rises over the crest of a steep rim walks on (he is not stopped by the terrain under it)', onDeck.moved > 8, `(${onDeck.moved.toFixed(1)} m in 1.5 s)`);
  check('... and one on the bare steep face is still held back by it', bare.moved < 1.5, `(${bare.moved.toFixed(1)} m in 1.5 s)`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall control checks passed');
process.exitCode = failed ? 1 : 0;
