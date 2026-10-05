import { Gfx } from './engine/gfx.js';
import { U } from './engine/materials.js';
import { installErrorLog } from './engine/errlog.js';
import { HD_STATS } from './engine/textures/hd/index.js';

installErrorLog();      // (debug mode shows the last errors: catch them from the very start, including the ones while the world builds)

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('screen');

/** A visible message instead of a silent black page (no WebGL2, a crash while building the world, ...). */
function fatal(headline, detail) {
  try {
    let d = document.getElementById('fatal');
    if (!d) {
      d = document.createElement('div');
      d.id = 'fatal';
      d.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:24px;box-sizing:border-box;text-align:center;background:#000;color:#c8bce8;font:16px/1.6 monospace;z-index:20;white-space:pre-wrap;overflow:auto';
      document.body.appendChild(d);
    }
    d.textContent = `${headline}\n\n${detail}`;
  } catch (e) { /* nothing more we can do */ }
}
const explain = (e) => String((e && (e.message || e)) || e).slice(0, 300);

let gfx = null;
try {
  gfx = new Gfx(canvas, { preserve: params.has('preserve') });
} catch (e) {
  console.error(e);
  window.__error = String((e && e.stack) || e);
  fatal('GLOAMING VALE COULD NOT START', `It needs a browser with WebGL2 enabled.\n\n${explain(e)}`);
}

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
  // window.resize does not fire when only the pixel ratio changes (a window dragged between displays), nor when the platform's safe area changes (an app showing or hiding its header): watch for both
  let seenDpr = window.devicePixelRatio, seenW = window.innerWidth, seenH = window.innerHeight;
  const frame = (now) => {
    requestAnimationFrame(frame);
    if (window.devicePixelRatio !== seenDpr || window.innerWidth !== seenW || window.innerHeight !== seenH || gfx.insetChanged()) {
      seenDpr = window.devicePixelRatio; seenW = window.innerWidth; seenH = window.innerHeight;
      gfx.resize();
    }
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
    if (doRender) gfx.render(scene.scene, scene.camera, scene.overlay);
  };
  requestAnimationFrame(frame);

  window.__gv = {
    gfx, scene,
    hd: HD_STATS,                                       // (how many HD textures have been painted, and how long it took: see engine/textures/hd/index.js)
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

if (gfx) {
  window.addEventListener('resize', () => gfx.resize());
  boot().catch((e) => {
    console.error(e);
    window.__error = String((e && e.stack) || e);
    fatal('GLOAMING VALE HIT A SNAG WHILE LOADING', `${explain(e)}\n\nReloading the page usually fixes it.`);
  });
}
