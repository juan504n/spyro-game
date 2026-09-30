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

console.log(failed ? `\n${failed} FAILED` : '\nall control checks passed');
process.exitCode = failed ? 1 : 0;
