// Camera behaviour test (no browser, no dev server): the REAL Player controller and GameCamera on flat ground with scripted stick
// input, in each camera mode.  node tools/camera-test.mjs [--table]
//   --table   print the metrics of every scenario in every mode (how far the view travels, how much it swings)
// (CAM_MODULE=/path/to/camera.js runs the same scenarios against another camera implementation, e.g. an old one from git.)
import * as THREE from 'three';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Player } from '../src/game/player.js';
import { Collision, CAM_BLOCK_SIZE } from '../src/game/collision.js';
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

/** the REAL collision layer over fake terrain (`height(x, z)`) and props: trees, houses, slopes... */
function realWorld(height = () => 0, colliders = []) {
  const e = 0.05;
  const grid = {
    heightAt: (x, z) => height(x, z),
    normalAt: (x, z, out = [0, 1, 0]) => {
      const gx = (height(x + e, z) - height(x - e, z)) / (2 * e), gz = (height(x, z + e) - height(x, z - e)) / (2 * e), l = Math.hypot(gx, 1, gz);
      out[0] = -gx / l; out[1] = 1 / l; out[2] = -gz / l; return out;
    },
  };
  return new Collision(grid, colliders.map((c) => ({ ...c })));
}
const tree = (x, z, r = 0.9) => ({ type: 'cyl', x, z, r, y0: 0, y1: 6.5, top: false });
const house = (x, z, h = 4) => ({ type: 'box', x, z, hx: h, hz: h, rot: 0, y0: 0, y1: 9, top: false });

function rig(mode, extra = {}, world = collision) {
  const settings = { ...DEFAULT_SETTINGS, camMode: mode, ...extra };
  const game = { gfx: { settings }, collision: world, level: { valley: { x: 0, z: 0, rx: 1e6, rz: 1e6 } }, objects: null, hud: null };
  const player = new Player(game, null);
  player.place(0, world.heightAt(0, 0), 0, 0);
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
  check('defaults: ACTIVE camera, speed x1, aim assist on', DEFAULT_SETTINGS.camMode === 'active' && DEFAULT_SETTINGS.lookSpeed === 0.5 && DEFAULT_SETTINGS.aimAssist === true);
  globalThis.localStorage = { getItem: () => JSON.stringify({ camMode: 'wat', lookSpeed: 'x', aimAssist: 'no' }), setItem() {} };
  const s = loadSettings();
  check('stored garbage falls back to valid camera settings', s.camMode === 'active' && s.lookSpeed === 0.5 && s.aimAssist === true, JSON.stringify([s.camMode, s.lookSpeed, s.aimAssist]));
  globalThis.localStorage = { getItem: () => JSON.stringify({ camMode: 'passive', lookSpeed: 0.8, aimAssist: false }), setItem() {} };
  const t = loadSettings();
  check('stored camera settings survive', t.camMode === 'passive' && t.lookSpeed === 0.8 && t.aimAssist === false, JSON.stringify([t.camMode, t.lookSpeed, t.aimAssist]));
  // the default used to be 'smart' and was saved along with any other option: that stored default moves to Active once; a later choice stays
  const load = (o) => { globalThis.localStorage = { getItem: () => JSON.stringify(o), setItem() {} }; return loadSettings().camMode; };
  check('an old stored default (smart, no camVersion) becomes Active', load({ crt: 0.5, camMode: 'smart' }) === 'active');
  check('a smart chosen after the change (camVersion 2) stays smart', load({ camMode: 'smart', camVersion: 2 }) === 'smart');
  check('a stored passive stays passive', load({ camMode: 'passive' }) === 'passive');
  check('nothing stored gives Active', (() => { globalThis.localStorage = { getItem: () => null, setItem() {} }; return loadSettings().camMode; })() === 'active');
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
  r.player.yaw = 1.0;
  r.cam.swingBehind(r.player);             // (what Game.step calls when R / pad Y / the CAM button is pressed; see tools/camera-input-test.mjs)
  r.cam.update(DT, r.input, r.player, 1);
  check('passive: swinging behind Spyro (R / CAM) puts the view behind him', Math.abs(angDiff(r.cam.yaw, 1.0)) < 0.01 && Math.abs(r.cam.pitch - 0.32) < 0.01);
  r.player.yaw = -2.0; r.input.edge = { camReset: true };
  r.cam.update(DT, r.input, r.player, 1);
  check('the camera itself no longer reads the (already cleared) key press', Math.abs(angDiff(r.cam.yaw, -2.0)) > 0.5);
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
// ---- obstacles: small things are ignored, ground is climbed, big things pull in a little and calmly ----------------------------
{
  const pivotDist = (r) => Math.hypot(r.camera.position.x - r.cam.tx, r.camera.position.y - (r.cam.ty + 0.25), r.camera.position.z - r.cam.tz);
  const settle = (r, secs, move = 0) => { const ds = []; for (let i = 0; i < secs * 60; i++) { r.input.move.y = move; r.player.update(DT, r.input, r.cam.yaw); r.cam.update(DT, r.input, r.player, 1); r.input.edge = {}; ds.push(pivotDist(r)); } return ds; };
  const pops = (ds) => { let n = 0; for (let i = 5; i < ds.length; i++) if (Math.abs(ds[i] - ds[i - 5]) > 0.35) n++; return n; };
  const nominal = 6.9;

  // which colliders may hold the camera back
  {
    const c = realWorld(() => 0, [tree(0, 5), { type: 'cyl', x: 9, z: 0, r: 0.3, y0: 0, y1: 5, top: false }, house(20, 0), { type: 'cyl', x: 30, z: 0, r: 3.1, y0: 0, y1: 5, top: false },
      { type: 'box', x: 40, z: 0, hx: 6, hz: 1.5, rot: 0, y0: 0, y1: 0.4, top: true }, { type: 'cyl', x: 50, z: 0, r: 0.9, y0: 0, y1: 5, top: false, cam: true }]);
    const flags = c.colliders.map((k) => k.cam);
    check('camera-blocking colliders: trees and lamp posts no, houses and boulders yes, walk-on decks no, explicit flag wins', JSON.stringify(flags) === JSON.stringify([false, false, true, true, false, true]) && CAM_BLOCK_SIZE === 2.4, JSON.stringify(flags));
  }
  // a tree right behind him: the camera does not move in
  {
    const r = rig('active', {}, realWorld(() => 0, [tree(0, -3.5), tree(0.4, -5.5), tree(-0.5, -1.4)]));
    const ds = settle(r, 3);
    check('trees behind Spyro do not bring the camera in', Math.min(...ds) > nominal * 0.97, `(closest ${Math.min(...ds).toFixed(2)} of ${nominal} m)`);
  }
  // a row of trees passing by while he runs: the distance does not pump
  {
    const trees = []; for (let i = 0; i < 12; i++) trees.push(tree((i % 2 ? 1.1 : -1.1), -8 + i * 6));
    const r = rig('active', {}, realWorld(() => 0, trees));
    const ds = settle(r, 6, 1);
    check('running past a row of trees: no pops, no zoom', pops(ds) === 0 && Math.min(...ds) > nominal * 0.97, `(range ${Math.min(...ds).toFixed(1)}..${Math.max(...ds).toFixed(1)} m, ${pops(ds)} pops)`);
  }
  // a house behind him: it does hold the camera back, but only a little, and smoothly
  {
    const r = rig('active', {}, realWorld(() => 0, [house(0, -5.5, 4)]));
    const ds = settle(r, 3);
    const jump = Math.max(...ds.slice(1).map((v, i) => Math.abs(v - ds[i])));
    check('a house behind Spyro pulls the camera in, but never closer than 62 %', Math.min(...ds) >= nominal * 0.62 - 0.05 && Math.min(...ds) < nominal * 0.8, `(settles at ${ds[ds.length - 1].toFixed(2)} m, floor ${(nominal * 0.62).toFixed(2)})`);
    check('... and calmly (no frame changes the distance by more than 0.25 m)', jump < 0.25, `(largest step ${jump.toFixed(2)} m)`);
  }
  // rising ground behind him: the camera climbs and keeps its distance
  {
    const slope = (deg) => (x, z) => Math.tan((deg * Math.PI) / 180) * Math.max(0, -z - 0.6);      // rising from 0.6 m behind Spyro
    const w30 = realWorld(slope(40)), r30 = rig('active', {}, w30);
    const d30 = settle(r30, 3);
    check('a 40 degree slope behind him: the camera climbs, its distance stays', Math.min(...d30) > nominal * 0.97 && r30.cam.lift > 0.12, `(lift ${(r30.cam.lift * 57.3).toFixed(0)} deg, distance ${Math.min(...d30).toFixed(2)})`);
    const camGround = w30.heightAt(r30.camera.position.x, r30.camera.position.z);
    check('... and stays above the ground', r30.camera.position.y > camGround + 0.6, `(${(r30.camera.position.y - camGround).toFixed(2)} m above it)`);
    const w55 = realWorld(slope(55)), r55 = rig('active', {}, w55);
    const d55 = settle(r55, 4);
    check('a 55 degree hillside behind him: climbs and keeps at least 90 % of its distance', Math.min(...d55) > nominal * 0.9, `(closest ${Math.min(...d55).toFixed(2)} m, lift ${(r55.cam.lift * 57.3).toFixed(0)} deg)`);
    const w80 = realWorld(slope(80)), r80 = rig('active', {}, w80);
    const d80 = settle(r80, 4);
    check('a sheer wall behind him: it climbs as far as it can and never comes closer than 62 %', Math.min(...d80) >= nominal * 0.62 - 0.05 && r80.cam.pitch + r80.cam.lift <= 1.1 + 1e-6, `(closest ${Math.min(...d80).toFixed(2)} m)`);
    // the ground evens out: the camera comes back down, slowly
    const before = r30.cam.lift;
    r30.game.collision = realWorld(() => 0);
    settle(r30, 0.3);
    const soon = r30.cam.lift;
    settle(r30, 4);
    check('when the ground levels out the camera settles back down, not at once', soon > before * 0.5 && r30.cam.lift < before * 0.15, `(lift ${(before * 57.3).toFixed(0)} -> ${(soon * 57.3).toFixed(0)} deg after 0.3 s -> ${(r30.cam.lift * 57.3).toFixed(0)} deg after 4 s)`);
  }
  // bumpy ground: the camera does not bob with it
  {
    const bumps = (x, z) => 0.7 * Math.sin(z * 0.9) * Math.sin(x * 0.7 + 1) + 0.15 * z * 0;
    const w = realWorld(bumps), r = rig('active', {}, w);
    const ds = settle(r, 6, 1);
    const ys = []; { const q = rig('active', {}, w); for (let i = 0; i < 360; i++) { q.input.move.y = 1; q.player.update(DT, q.input, q.cam.yaw); q.cam.update(DT, q.input, q.player, 1); q.input.edge = {}; ys.push(q.camera.position.y - q.player.y); } }
    let worst = 0; for (let i = 5; i < ys.length; i++) worst = Math.max(worst, Math.abs(ys[i] - ys[i - 5]));
    check('running over bumpy ground: the camera does not pump in or bob', pops(ds) === 0 && worst < 0.5, `(${pops(ds)} distance pops, camera height moves at most ${worst.toFixed(2)} m per 5 frames)`);
  }
}
// ---- a stale mode name never breaks the camera ---------------------------------------------------------------------------------
{
  const r = rig('nonsense');
  check('an unknown mode behaves like active (the default)', r.cam.mode === 'active');
}

console.log(failed ? `\n${failed} FAILED` : '\nall camera checks passed');
process.exitCode = failed ? 1 : 0;
