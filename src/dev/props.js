// Dev gallery for scenery props.  URL: ?test=props[&only=name][&list=a,b][&cam=x,y,z,tx,ty,tz][&day=0..1][&orbit=1][&spacing=18]
import * as THREE from 'three';
import { Assets } from '../game/assets.js';
import { Kit, flatGrid } from '../game/kit.js';
import { Lighting, atmosphere, dynamicLight } from '../engine/lighting.js';
import { Builder } from '../engine/builder.js';
import { U } from '../engine/materials.js';
import { Sky } from '../game/sky.js';
import { PROPS } from '../game/props/index.js';

export function create(gfx) {
  const params = new URLSearchParams(location.search);
  const assets = new Assets();
  const grid = flatGrid(3.2);
  const lighting = new Lighting();
  lighting.attach(grid);
  const kit = new Kit({ assets, lighting, grid });
  const names = params.get('only') ? [params.get('only')] : params.get('list') ? params.get('list').split(',') : Object.keys(PROPS);
  const spacing = +(params.get('spacing') || 16);
  const place = (fnName, i) => {
    const e = PROPS[fnName];
    if (!e) { console.warn('unknown prop', fnName); return; }
    const x = (i - (names.length - 1) / 2) * spacing;
    e.fn(kit, { x, z: 0, ...(e.defaults || {}) });
  };
  kit.setPass('dry');
  names.forEach(place);
  lighting.bake();
  kit.setPass('wet');
  names.forEach(place);

  const scene = new THREE.Scene();
  // ground
  const g = new Builder({ lighting });
  const S = 4, R = 14;
  for (let j = -R; j < R; j++) for (let i = -R * 4; i < R * 4; i++) {
    g.quad([i * S, 3.2, (j + 1) * S], [(i + 1) * S, 3.2, (j + 1) * S], [(i + 1) * S, 3.2, j * S], [i * S, 3.2, j * S], { tile: 6, aoFn: () => 1 });
  }
  scene.add(new THREE.Mesh(g.build(), assets.mat('grass_a')));
  scene.add(kit.build());
  const sky = new Sky(assets);
  scene.add(sky.group);
  console.log('props gallery: tris', kit.triangleCount(), 'builders', kit.builders.size, 'colliders', kit.colliders.length, 'lights', kit.lights.length, 'missing textures:', [...assets.missing].join(','));

  const camera = new THREE.PerspectiveCamera(58, 4 / 3, 0.4, 1600);
  const state = { day: parseFloat(params.get('day') || '0'), cam: (params.get('cam') || `0,7,${Math.max(26, names.length * spacing * 0.55)},0,3.5,0`).split(',').map(Number), orbit: params.has('orbit') };
  const api = {
    scene, camera, kit, state, assets,
    update(dt, t) {
      const c = state.cam;
      if (state.orbit) {
        const r = Math.hypot(c[0] - c[3], c[2] - c[5]);
        const a = t * 0.5;
        camera.position.set(c[3] + Math.sin(a) * r, c[1], c[5] + Math.cos(a) * r);
      } else camera.position.set(c[0], c[1], c[2]);
      camera.lookAt(c[3], c[4], c[5]);
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
