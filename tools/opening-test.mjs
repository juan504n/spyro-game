#!/usr/bin/env node
// The opening of the title screen (round thirty-four): Spyro glides in and lands, the camera follows, the logo and the dusk picture are drawn. All on the data of the real Vale, built headlessly (no GPU):
//   node tools/opening-test.mjs
import { buildHeadless } from './headless-world.mjs';
import { makeOpening, splineAt } from '../src/game/cinematics.js';
import { makeTitleArt, drawLogo, drawPressStart, drawDusk, ditherOut, OPEN } from '../src/game/titlescreen.js';
import { Pix } from '../src/engine/textures/pix.js';

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : detail); };
const { grid, kit } = buildHeadless();
const game = { grid };
const op = makeOpening(game);
const fake = () => { const calls = []; return { calls, model: { update: (dt, pose) => calls.push({ dt, pose }) } }; };
const at = (t) => { const pl = fake(); op.flight(pl, t, 1 / 60); return { pl, pose: pl.calls[0].pose, cam: op.shot(t) }; };
const STEP = 1 / 30, END = OPEN.pressAt + 4;

// ---- the flight ------------------------------------------------------------------------------------------------------------------------------
{
  let minClear = Infinity, maxSpeed = 0, prev = null, glideTo = 0, landedAt = -1, yawJump = 0, prevYaw = null;
  for (let t = 0; t <= END; t += STEP) {
    const { pl, pose } = at(t);
    minClear = Math.min(minClear, pl.y - grid.heightAt(pl.x, pl.z));
    if (prev) maxSpeed = Math.max(maxSpeed, Math.hypot(pl.x - prev.x, pl.y - prev.y, pl.z - prev.z) / STEP);
    if (prevYaw !== null) yawJump = Math.max(yawJump, Math.abs(Math.atan2(Math.sin(pl.yaw - prevYaw), Math.cos(pl.yaw - prevYaw))));
    if (pose.glide && !pose.grounded) glideTo = t;
    if (pose.grounded && landedAt < 0) landedAt = t;
    prev = { x: pl.x, y: pl.y, z: pl.z }; prevYaw = pl.yaw;
  }
  check('the hero is never under the ground, nor inside it, on the whole flight', minClear > 0, `(lowest ${minClear.toFixed(2)} m above the terrain)`);
  check('he glides until he lands (the glide pose, in the air), and lands at OPEN.fly', Math.abs(landedAt - OPEN.fly) < 0.1 && glideTo < OPEN.fly + 0.01 && glideTo > OPEN.fly - 0.2, `(glides to ${glideTo.toFixed(2)} s, lands at ${landedAt.toFixed(2)} s)`);
  check('his speed is a glider\'s: no jump through the sky (under 40 m/s at every step of 1/30 s)', maxSpeed < 40, `(fastest ${maxSpeed.toFixed(1)} m/s)`);
  check('he turns smoothly (no heading changes by more than 0.12 rad in a step)', yawJump < 0.12, `(${yawJump.toFixed(3)} rad)`);
  const end = at(END);
  check('he ends on the ground at the landing place, facing the camera (south), standing still', Math.abs(end.pl.y - op.land[1]) < 0.01 && Math.abs(end.pl.yaw) < 1e-6 && end.pose.grounded && (end.pose.speed || 0) === 0, `(yaw ${end.pl.yaw.toFixed(3)}, y ${end.pl.y.toFixed(2)})`);
  const cheers = [];
  for (let t = OPEN.fly; t <= END; t += STEP) cheers.push(at(t).pose.cheer || 0);
  check('he cheers once after landing, in the window the logo leaves free, and stops', Math.max(...cheers) > 0.99 && cheers[0] === 0 && cheers[cheers.length - 1] === 0, `(peak ${Math.max(...cheers).toFixed(2)})`);
  const start = at(0).pl;
  check('he starts far away and high (a dot in the sky: over 90 m from where he lands, over 40 m up)', Math.hypot(start.x - op.land[0], start.z - op.land[2]) > 90 && start.y - grid.heightAt(start.x, start.z) > 40, `(${Math.hypot(start.x - op.land[0], start.z - op.land[2]).toFixed(0)} m away)`);
  // the model is told the step's dt (it keeps its own clock) and the pose is a function of the clock only: jumping to a moment gives what playing through would
  const a = at(7.31).pose, b = at(7.31).pose;
  check('the opening is a pure function of its clock (the skip and the screenshots jump to a moment)', JSON.stringify(a) === JSON.stringify(b));
  check('the model is called with the step\'s own dt', (() => { const pl = fake(); op.flight(pl, 2, 0.0125); return pl.calls[0].dt === 0.0125; })());
}

// ---- the camera ------------------------------------------------------------------------------------------------------------------------------
{
  // it must not be inside a tree, a lamp or a house: every solid with a radius near the camera's ground track is cleared by more than its radius, and it is over the ground
  const solids = kit.colliders.filter((c) => (c.r || 0) > 0.15);
  let worst = Infinity, worstAt = '', under = Infinity, maxFov = 0, minFov = 1e9, jump = 0, prev = null;
  for (let t = 0; t <= END; t += STEP) {
    const { cam } = at(t);
    const [x, y, z] = cam.pos, gy = grid.heightAt(x, z);
    under = Math.min(under, y - gy);
    for (const c of solids) { const d = Math.hypot(c.x - x, c.z - z) - c.r; if (y - gy < 9 && d < worst) { worst = d; worstAt = `${c.tag || c.kind || '?'}@${c.x.toFixed(0)},${c.z.toFixed(0)}`; } }
    maxFov = Math.max(maxFov, cam.fov); minFov = Math.min(minFov, cam.fov);
    if (prev) jump = Math.max(jump, Math.hypot(x - prev[0], y - prev[1], z - prev[2]) / STEP);
    prev = cam.pos;
  }
  check('the camera is never inside a solid (the nearest is more than 0.5 m from its surface)', worst > 0.5, `(${worst.toFixed(2)} m from ${worstAt})`);
  check('... and is always over the ground by more than 1.5 m', under > 1.5, `(${under.toFixed(2)} m)`);
  check('... and moves smoothly (under 12 m/s)', jump < 12, `(${jump.toFixed(1)} m/s)`);
  check('... with a sensible lens (between 30 and 70 degrees)', minFov >= 30 && maxFov <= 70, `(${minFov.toFixed(0)}..${maxFov.toFixed(0)})`);
  const end = at(END).cam, L = op.land;
  const d = Math.hypot(end.pos[0] - L[0], end.pos[2] - L[2]), dy = end.look[1] - L[1];
  check('it ends close and low, looking at the hero from the south (7-9 m away, looking at his chest or head)', d > 6.5 && d < 9.5 && end.pos[2] > L[2] && dy > 1 && dy < 3, `(${d.toFixed(1)} m, looks ${dy.toFixed(1)} m above the ground)`);
  // he is in the frame: the angle between the camera's look and the direction to the hero is small, all along the flight (the shot tracks him)
  let worstAng = 0;
  for (let t = 0.5; t <= END; t += 0.25) {
    const { pl, cam } = at(t);
    const f = [cam.look[0] - cam.pos[0], cam.look[1] - cam.pos[1], cam.look[2] - cam.pos[2]], v = [pl.x - cam.pos[0], pl.y + 0.8 - cam.pos[1], pl.z - cam.pos[2]];
    const ang = Math.acos(Math.max(-1, Math.min(1, (f[0] * v[0] + f[1] * v[1] + f[2] * v[2]) / (Math.hypot(...f) * Math.hypot(...v)))));
    worstAng = Math.max(worstAng, ang);
  }
  check('he is in the camera\'s frame the whole time (within 12 degrees of where it looks)', worstAng < 0.21, `(${(worstAng * 57.3).toFixed(1)} degrees at worst)`);
}

// ---- the pictures ----------------------------------------------------------------------------------------------------------------------------
{
  const art = makeTitleArt();
  check('the logo fits the narrowest frame the HUD has (320 px wide) with its ring, and is not taller than a third of it', art.ring.w <= 320 && art.vale.w <= 320 && art.spyro.h + art.vale.h < 110, `(ring ${art.ring.w}, line two ${art.vale.w}, ${art.spyro.h}+${art.vale.h} tall)`);
  const lit = (p) => { let n = 0; for (let i = 3; i < p.data.length; i += 4) if (p.data[i] >= 128) n++; return n; };
  const frame = (t) => { const p = new Pix(320, 240); drawLogo(p, art, t, 26); return lit(p); };
  const f0 = frame(OPEN.logoAt - 0.1), fMid = frame(OPEN.logoAt + OPEN.logoDur * 0.5), f1 = frame(OPEN.subAt - 0.05), f2 = frame(OPEN.subAt + 0.8);
  check('the logo is not there before it drops, is there while it drops, and the second line comes after it', f0 === 0 && fMid > 1000 && f1 > fMid * 0.9 && f2 > f1 + 1500, `(${f0}, ${fMid}, ${f1}, ${f2} pixels)`);
  const settled = new Pix(320, 240); const r = drawLogo(settled, art, OPEN.pressAt, 26);
  check('settled, the logo lies inside the frame, in its upper half (the end of line two is above line 130)', r.bottom < 130 && r.bottom > 60, `(ends at line ${r.bottom})`);
  const pressed = (t) => { const p = new Pix(320, 240); drawPressStart(p, 'press start', t, 200); return lit(p); };
  check('"press start" is not there before OPEN.pressAt and blinks after it', pressed(OPEN.pressAt - 0.1) === 0 && pressed(OPEN.pressAt + 0.1) > 200 && pressed(OPEN.pressAt + 0.6) === 0 && pressed(OPEN.pressAt + 1.1) > 200);
  const dusk = new Pix(320, 240); drawDusk(dusk, 0.4, 1);
  check('the dusk picture fills the whole frame (opaque everywhere)', lit(dusk) === 320 * 240);
  const lanterns = (frac) => { const p = new Pix(320, 240); drawDusk(p, frac, 0); let warm = 0; for (let i = 0; i < p.data.length; i += 4) if (p.data[i] > 240 && p.data[i + 1] > 180 && p.data[i + 2] < 140 && ((i / 4) / 320 | 0) > 170) warm++; return warm; };
  check('the lanterns light as the work goes on: more lit lamp pixels at every step', lanterns(0) < lanterns(0.3) && lanterns(0.3) < lanterns(0.6) && lanterns(0.6) < lanterns(1), `(${lanterns(0)}, ${lanterns(0.3)}, ${lanterns(0.6)}, ${lanterns(1)})`);
  const w = new Pix(320, 240); w.fill('#ffffff'); ditherOut(w, 0.5);
  const a1 = lit(w); const w2 = new Pix(320, 240); w2.fill('#ffffff'); ditherOut(w2, 1); const w3 = new Pix(320, 240); w3.fill('#ffffff'); ditherOut(w3, 0);
  check('the dither wipe clears half the pixels at half, all at one and none at zero', Math.abs(a1 - 320 * 120) < 320 * 12 && lit(w2) === 0 && lit(w3) === 320 * 240, `(${a1} of ${320 * 240} left at one half)`);
  const spl = splineAt([[0, 0, 0], [1, 1, 1], [2, 0, 2]], 1);
  check('splineAt ends on its last point', Math.abs(spl[0] - 2) < 1e-9);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
