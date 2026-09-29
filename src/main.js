import { Gfx } from './engine/gfx.js';
import { U } from './engine/materials.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('screen');
const gfx = new Gfx(canvas, { preserve: params.has('preserve') });
window.addEventListener('resize', () => gfx.resize());

let scene = null; // { scene, camera, update(dt, t), frameStart?() }
const clock = { t: 0 };

async function boot() {
  const test = params.get('test');
  if (test) {
    const mod = await import(`./dev/${test}.js`);
    scene = await mod.create(gfx, params);
  } else {
    const mod = await import('./game/app.js');
    scene = await mod.create(gfx, params);
  }
  gfx.onInternalResize = (W, H) => {
    if (scene?.camera) { scene.camera.aspect = W / H; scene.camera.updateProjectionMatrix(); }
    scene?.onResize?.(W, H);
  };
  gfx.onInternalResize(gfx.W, gfx.H);

  let last = performance.now();
  let acc30 = 0;
  const frame = (now) => {
    requestAnimationFrame(frame);
    let dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    clock.t += dt;
    U.uTime.value = clock.t;
    if (!scene) return;
    // 30 fps lock: simulate every frame, render every other one (the original ran at 30)
    let doRender = true;
    if (gfx.settings.fps30) {
      acc30 += dt;
      if (acc30 < 1 / 30 - 0.002) doRender = false; else acc30 = Math.max(0, acc30 - 1 / 30);
    }
    gfx.clearHud();
    scene.update?.(dt, clock.t);
    if (doRender) gfx.render(scene.scene, scene.camera);
  };
  requestAnimationFrame(frame);

  window.__gv = {
    gfx, scene,
    snapshot() {
      const f = gfx.readInternal();
      let bin = '';
      const chunk = 0x8000;
      for (let i = 0; i < f.data.length; i += chunk) bin += String.fromCharCode.apply(null, f.data.subarray(i, i + chunk));
      return { w: f.w, h: f.h, b64: btoa(bin) };
    },
  };
  if (!scene.deferReady) window.__ready = true;
}
boot().catch((e) => { console.error(e); window.__error = String((e && e.stack) || e); });
