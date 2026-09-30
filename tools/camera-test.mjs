// Camera behaviour test (no browser, no dev server): the REAL Player controller and GameCamera on flat ground with scripted stick
// input, in each camera mode.  node tools/camera-test.mjs [--table]
//   --table   print the metrics of every scenario in every mode (how far the view travels, how much it swings)
// (CAM_MODULE=/path/to/camera.js runs the same scenarios against another camera implementation, e.g. an old one from git.)
import * as THREE from 'three';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Player } from '../src/game/player.js';
import { DEFAULT_SETTINGS, loadSettings } from '../src/engine/gfx.js';

const { GameCamera } = await import(process.env.CAM_MODULE ? pathToFileURL(path.resolve(process.env.CAM_MODULE)).href : '../src/game/camera.js');
const TAU = Math.PI * 2, DT = 1 / 60, DEG = 180 / Math.PI;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

/** flat, empty world */
const collision = {
  support: () => ({ y: 0, kind: 'terrain', c: null }), normalAt: () => [0, 1, 0], heightAt: () => 0, pushOut: () => null,
  ray: 1,                                   // what rayFraction() reports (1 = nothing in the way); tests set it to fake obstacles
  rayFraction() { return collision.ray; }, near: () => [], blocking: () => null,
};

function rig(mode, extra = {}) {
  const settings = { ...DEFAULT_SETTINGS, camMode: mode, ...extra };
  const game = { gfx: { settings }, collision, level: { valley: { x: 0, z: 0, rx: 1e6, rz: 1e6 } }, objects: null, hud: null };
  const player = new Player(game, null);
  player.place(0, 0, 0, 0);
  const camera = new THREE.PerspectiveCamera(58, 4 / 3, 0.1, 500);
  const cam = new GameCamera(camera, game);
  const input = {
    move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, stickLook: { x: 0, y: 0 }, held: {}, edge: {},
    takeLook() { const r = { ...this.look }; this.look.x = this.look.y = 0; return r; },
    pressed(a) { return !!this.edge[a]; }, down(a) { return !!this.held[a]; },
  };
  cam.snapBehind(player);
  for (let i = 0; i < 30; i++) { player.update(DT, input, cam.yaw); cam.update(DT, input, player, 1); input.edge = {}; }
  return { settings, game, player, cam, camera, input };
}

/** run `stick(t) -> [x, y, jump?]` for `secs`; returns how the view and Spyro's path behaved */
function run(mode, stick, secs, o = {}) {
  const r = rig(mode, o.settings);
  const { player, cam, camera, input } = r;
  const prevF = new THREE.Vector3(), f = new THREE.Vector3();
  camera.getWorldDirection(prevF);
  const yaw0 = cam.yaw;
  let swAfter = 0, yawPath = 0, signed = 0, sw2 = 0, n = 0, swMax = 0, lastYaw = cam.yaw, hPath = 0, lastH = null;
  for (let i = 0; i < secs * 60; i++) {
    const t = i * DT, [mx, my, jump] = stick(t);
    input.move.x = mx; input.move.y = my;
    input.held.jump = !!jump; input.edge = jump ? { jump: true } : {};
    if (o.glide && t > 0.05) { input.held.jump = true; }
    player.update(DT, input, cam.yaw);
    cam.update(DT, input, player, 1);
    input.edge = {};
    camera.getWorldDirection(f);
    const w = Math.acos(Math.max(-1, Math.min(1, f.dot(prevF)))) / DT;
    sw2 += w * w; n++; swMax = Math.max(swMax, w); prevF.copy(f);
    { const dy = angDiff(cam.yaw, lastYaw); yawPath += Math.abs(dy); signed += dy; lastYaw = cam.yaw; }
    if (o.after !== undefined && t >= o.after) swAfter = Math.max(swAfter, w);
    if (player.speed > 3) { const h = Math.atan2(player.vx, player.vz); if (lastH !== null) hPath += Math.abs(angDiff(h, lastH)); lastH = h; }
  }
  return { net: angDiff(cam.yaw, yaw0) * DEG, signed: signed * DEG, swingAfter: swAfter * DEG, path: yawPath * DEG, swingRms: Math.sqrt(sw2 / n) * DEG, swingMax: swMax * DEG, heroTurn: hPath * DEG, player, cam };
}

const rad = (d) => (d * Math.PI) / 180;
const S = {
  straight: () => [0, 1],
  offCentre: () => [Math.sin(rad(25)), Math.cos(rad(25))],           // a thumb resting 25 degrees off straight ahead
  wobble: (t) => [0.35 * Math.sin(TAU * 0.9 * t), 0.9],              // +-21 degrees at 0.9 Hz
  zigzag: (t) => [Math.floor(t / 0.5) % 2 ? 0.87 : -0.87, 0.5],      // +-60 degrees, switching every half second
  hops: (t) => [Math.floor(t / 0.7) % 2 ? 0.87 : -0.87, 0.5, (t % 0.7) < 0.05],
  right45: () => [Math.sin(rad(45)), Math.cos(rad(45))],
  sideways: () => [1, 0],
  back: () => [0, -1],
  circle: (t) => [Math.sin((TAU * t) / 8), Math.cos((TAU * t) / 8)],
};

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const f0 = (v) => v.toFixed(0), f1 = (v) => v.toFixed(1);

if (process.argv.includes('--table')) {
  for (const mode of ['smart', 'active', 'passive']) {
    console.log(`\n${mode}: view yaw travelled / net / view swing rms (deg/s) / Spyro's path turned (deg)`);
    for (const [name, fn] of Object.entries(S)) {
      const r = run(mode, fn, 8);
      console.log(`  ${name.padEnd(10)} ${f0(r.path).padStart(5)} ${f0(r.net).padStart(6)} ${f1(r.swingRms).padStart(7)} ${f0(r.heroTurn).padStart(6)}`);
    }
  }
}

// ---- settings ------------------------------------------------------------------------------------------------------------
{
  check('defaults: smart camera, speed x1, aim assist on', DEFAULT_SETTINGS.camMode === 'smart' && DEFAULT_SETTINGS.lookSpeed === 0.5 && DEFAULT_SETTINGS.aimAssist === true);
  globalThis.localStorage = { getItem: () => JSON.stringify({ camMode: 'wat', lookSpeed: 'x', aimAssist: 'no' }), setItem() {} };
  const s = loadSettings();
  check('stored garbage falls back to valid camera settings', s.camMode === 'smart' && s.lookSpeed === 0.5 && s.aimAssist === true, JSON.stringify([s.camMode, s.lookSpeed, s.aimAssist]));
  globalThis.localStorage = { getItem: () => JSON.stringify({ camMode: 'passive', lookSpeed: 0.8, aimAssist: false }), setItem() {} };
  const t = loadSettings();
  check('stored camera settings survive', t.camMode === 'passive' && t.lookSpeed === 0.8 && t.aimAssist === false, JSON.stringify([t.camMode, t.lookSpeed, t.aimAssist]));
  delete globalThis.localStorage;
}

// ---- smart: calm, but it does follow a clear turn ---------------------------------------------------------------------
{
  const straight = run('smart', S.straight, 6);
  check('smart: running straight ahead does not move the view', Math.abs(straight.net) < 0.5 && straight.path < 1, `(${f1(straight.path)} deg)`);
  const off = run('smart', S.offCentre, 6);
  check('smart: a thumb 25 deg off centre neither spins the view nor bends Spyro\'s path', off.path < 1 && off.heroTurn < 5, `(view ${f1(off.path)} deg, path ${f1(off.heroTurn)} deg)`);
  const wob = run('smart', S.wobble, 8);
  check('smart: a +-21 deg wobble leaves the view alone', wob.path < 1, `(${f1(wob.path)} deg)`);
  const zig = run('smart', S.zigzag, 8);
  check('smart: zig-zagging +-60 deg barely moves the view', zig.path < 90, `(${f0(zig.path)} deg in 8 s)`);
  const hop = run('smart', S.hops, 8);
  check('smart: hopping about +-60 deg barely moves the view', hop.path < 90, `(${f0(hop.path)} deg in 8 s)`);
  const r45 = run('smart', S.right45, 6);
  check('smart: holding 45 deg right turns the view right, gently', r45.signed < -60 && r45.signed > -200, `(${f0(r45.signed)} deg in 6 s)`);
  const r60 = run('smart', () => [Math.sin(rad(60)), Math.cos(rad(60))], 4);
  check('smart: holding 60 deg right swings the view after Spyro', r60.signed < -100 && r60.signed > -300, `(${f0(r60.signed)} deg in 4 s)`);
  const side = run('smart', S.sideways, 4);
  check('smart: a pure sideways push is a strafe: the view stays put', side.path < 1, `(${f1(side.path)} deg)`);
  const back = run('smart', S.back, 4);
  check('smart: running back towards the camera does not spin it', back.path < 1, `(${f1(back.path)} deg)`);
  // Spyro turns round almost at once; the look-ahead point used to jump with him and pan the view ~15 degrees in a couple of frames
  const flip = run('smart', (t) => [0, t < 1 ? 1 : -1], 2, { after: 1 });
  check('smart: turning Spyro round does not pan the view', flip.swingAfter < 60, `(fastest pan ${f0(flip.swingAfter)} deg/s)`);
}
// ---- passive: never moves by itself ----------------------------------------------------------------------------------
{
  let worst = 0;
  for (const [name, fn] of Object.entries(S)) worst = Math.max(worst, run('passive', fn, 6).path);
  check('passive: no stick input ever turns the view', worst < 0.01, `(most: ${worst.toFixed(3)} deg)`);
  const g = run('passive', S.right45, 5, { glide: true });
  check('passive: not even gliding turns the view', g.path < 0.01, `(${g.path.toFixed(3)} deg)`);
  // manual control still works, and R swings it back behind Spyro
  const r = rig('passive');
  r.input.look.x = 0.5;
  r.player.update(DT, r.input, r.cam.yaw); r.cam.update(DT, r.input, r.player, 1);
  check('passive: dragging turns the view', Math.abs(angDiff(r.cam.yaw, Math.PI)) > 0.3 || Math.abs(angDiff(r.cam.yaw, 0)) > 0.3, `(yaw ${f0(r.cam.yaw * DEG)})`);
  r.player.yaw = 1.0; r.input.edge = { camReset: true };
  r.cam.update(DT, r.input, r.player, 1);
  check('passive: R / CAM swings the view back behind Spyro', Math.abs(angDiff(r.cam.yaw, 1.0)) < 0.01);
}
// ---- active: the original's fast follow ------------------------------------------------------------------------------------
{
  const small = run('active', () => [Math.sin(rad(20)), Math.cos(rad(20))], 4);
  check('active: even a small sideways lean makes the view follow', small.signed < -60, `(${f0(small.signed)} deg in 4 s)`);
  const side = run('active', S.sideways, 3);
  check('active: sideways swings it too (the original\'s arcs), faster than smart', side.path > 200 && side.path > run('smart', () => [Math.sin(rad(60)), Math.cos(rad(60))], 3).path, `(${f0(side.path)} deg in 3 s)`);
  const straight = run('active', S.straight, 4);
  check('active: running straight ahead does not move the view', straight.path < 0.5, `(${f1(straight.path)} deg)`);
}
// ---- camera speed ---------------------------------------------------------------------------------------------------------
{
  const turn = (v) => { const r = rig('passive', { lookSpeed: v }); const y0 = r.cam.yaw; r.input.look.x = 0.1; r.player.update(DT, r.input, r.cam.yaw); r.cam.update(DT, r.input, r.player, 1); return Math.abs(angDiff(r.cam.yaw, y0)); };
  const lo = turn(0), mid = turn(0.5), hi = turn(1);
  check('camera speed scales manual look (x0.4 .. x1 .. x1.6)', Math.abs(mid - 0.1) < 1e-6 && Math.abs(lo - 0.04) < 1e-6 && Math.abs(hi - 0.16) < 1e-6, `(${lo.toFixed(3)} ${mid.toFixed(3)} ${hi.toFixed(3)} rad for a 0.1 rad drag)`);
}
// ---- obstruction pull-in: quick in, held, then gently out (no popping in and out past every tree) ----------------------------
{
  const dist = (r) => Math.hypot(r.camera.position.x - r.cam.tx, r.camera.position.z - r.cam.tz);   // horizontal camera distance from its pivot
  const stepFor = (r, secs, ray) => { collision.ray = ray; for (let i = 0; i < secs * 60; i++) { r.input.move.y = 1; r.player.update(DT, r.input, r.cam.yaw); r.cam.update(DT, r.input, r.player, 1); r.input.edge = {}; } };
  const r = rig('smart');
  stepFor(r, 1, 1);
  const full = dist(r);
  stepFor(r, 0.15, 0.4);
  const pulled = dist(r);
  check('obstruction: a blocked ray pulls the camera in at once', pulled < full * 0.6, `(${full.toFixed(1)} -> ${pulled.toFixed(1)} m in 0.15 s)`);
  stepFor(r, 0.3, 1);
  check('obstruction: it does not spring back the moment the way is clear', dist(r) < full * 0.6, `(0.3 s after: ${dist(r).toFixed(1)} m)`);
  stepFor(r, 2.0, 1);
  check('obstruction: it returns to full distance once the way has been clear for a while', dist(r) > full * 0.95, `(2.3 s after: ${dist(r).toFixed(1)} m)`);
  // a row of trees: blocked 0.1 s, clear 0.25 s, over and over
  const q = rig('smart');
  stepFor(q, 1, 1);
  stepFor(q, 0.15, 0.4);
  let lo = 1e9, hi = 0;
  for (let k = 0; k < 8; k++) { stepFor(q, 0.25, 1); lo = Math.min(lo, dist(q)); hi = Math.max(hi, dist(q)); stepFor(q, 0.1, 0.4); lo = Math.min(lo, dist(q)); hi = Math.max(hi, dist(q)); }
  check('obstruction: passing a row of trees does not pump the camera in and out', hi - lo < 0.6, `(range ${lo.toFixed(1)}..${hi.toFixed(1)} m over 2.8 s)`);
  collision.ray = 1;
}
// ---- a stale mode name never breaks the camera ---------------------------------------------------------------------------------
{
  const r = rig('nonsense');
  check('an unknown mode behaves like smart', r.cam.mode === 'smart');
}

console.log(failed ? `\n${failed} FAILED` : '\nall camera checks passed');
process.exitCode = failed ? 1 : 0;
