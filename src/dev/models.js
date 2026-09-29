// Dev turntable for actors.  URL: ?test=models&only=name[&pose=run][&cam=x,y,z,tx,ty,tz][&day=0..1][&orbit=1][&opts=json][&res=240|360|480]
// (the page API window.__dev.state.cam = [x,y,z,tx,ty,tz] | null overrides the camera at runtime; tools/model-sheet.mjs uses it)
import * as THREE from 'three';
import { Assets } from '../game/assets.js';
import { Lighting, atmosphere, dynamicLight } from '../engine/lighting.js';
import { Builder } from '../engine/builder.js';
import { flatGrid } from '../game/kit.js';
import { U } from '../engine/materials.js';
import { Sky } from '../game/sky.js';
import { MODELS } from '../game/models/index.js';

export function create(gfx) {
  const params = new URLSearchParams(location.search);
  const assets = new Assets();
  const grid = flatGrid(0);
  const lighting = new Lighting();
  lighting.attach(grid);
  lighting.bake();
  const scene = new THREE.Scene();
  const g = new Builder({ lighting });
  const S = 4, R = 12;
  for (let j = -R; j < R; j++) for (let i = -R; i < R; i++) {
    g.quad([i * S, 0, (j + 1) * S], [(i + 1) * S, 0, (j + 1) * S], [(i + 1) * S, 0, j * S], [i * S, 0, j * S], { tile: 6, aoFn: () => 1 });
  }
  scene.add(new THREE.Mesh(g.build(), assets.mat('grass_a')));
  const sky = new Sky(assets);
  scene.add(sky.group);

  const names = params.get('only') ? params.get('only').split(',') : Object.keys(MODELS);
  const opts = params.get('opts') ? JSON.parse(params.get('opts')) : {};
  const models = [];
  names.forEach((n, i) => {
    const e = MODELS[n];
    if (!e) { console.warn('unknown model', n); return; }
    const m = e.create(assets, opts[n] || opts);
    m.root.position.x = (i - (names.length - 1) / 2) * (e.size || 4) * 1.6;
    scene.add(m.root);
    models.push({ name: n, m, size: e.size || 4 });
  });
  const state = { day: parseFloat(params.get('day') || '0'), pose: params.get('pose') || 'idle', orbit: params.has('orbit'), t: 0, yaw: parseFloat(params.get('yaw') || '0.6') };
  const size = models.length ? models[0].size : 4;
  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 1600);
  const camP = (params.get('cam') || '').split(',').map(Number);
  state.cam = camP.length >= 6 ? camP : null;
  if ([240, 360, 480].includes(+params.get('res'))) gfx.set('height', +params.get('res'));
  console.log('models', names.join(','), 'missing textures:', [...assets.missing].join(','));
  const api = {
    scene, camera, models, state, assets,
    update(dt, t) {
      state.t += dt;
      for (const { m } of models) {
        const pose = m.testPoses?.[state.pose] || {};
        m.update(dt, typeof pose === 'function' ? pose(state.t) : { ...pose, t: state.t });
      }
      const c = models[0]?.m.root.position || new THREE.Vector3();
      const cp = state.cam;
      if (cp && !state.orbit) { camera.position.set(cp[0], cp[1], cp[2]); camera.lookAt(cp[3], cp[4], cp[5]); }
      else {
        const a = state.orbit ? t * 0.6 : state.yaw;
        const r = size * 2.4 * (models.length > 1 ? 1.4 + models.length * 0.25 : 1);
        camera.position.set(c.x * 0 + Math.sin(a) * r, size * 0.7, Math.cos(a) * r);
        camera.lookAt(0, size * 0.35, 0);
      }
      const atm = atmosphere(state.day);
      U.uDay.value = state.day;
      U.uFogColor.value.setRGB(atm.fog[0], atm.fog[1], atm.fog[2]);
      U.uFogRange.value.set(140, 430);
      const dl = dynamicLight(state.day, {});
      U.uSunDir.value.set(...dl.sunDir); U.uSunCol.value.setRGB(...dl.sunCol); U.uAmb.value.setRGB(...dl.amb);
      sky.update(camera, atm, t, dt);
    },
  };
  window.__dev = api;
  return api;
}
