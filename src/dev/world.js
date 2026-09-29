// Dev viewer: the realm with a scripted camera (URL: ?test=world&cam=x,y,z,tx,ty,tz&day=0..1).
import * as THREE from 'three';
import { Assets } from '../game/assets.js';
import { buildWorld } from '../game/world.js';

export function create(gfx) {
  const params = new URLSearchParams(location.search);
  const assets = new Assets();
  const world = buildWorld(assets);
  console.log('world built', JSON.stringify(world.timings), JSON.stringify(world.terrainStats), 'missing textures:', [...assets.missing].join(','));
  const camera = new THREE.PerspectiveCamera(58, 4 / 3, 0.4, 1600);
  const state = { day: parseFloat(params.get('day') || '0'), cam: (params.get('cam') || '0,12,190,0,6,100').split(',').map(Number) };
  const api = {
    scene: world.scene, camera, world, assets, state,
    update(dt, t) {
      const c = state.cam;
      camera.position.set(c[0], c[1], c[2]);
      camera.lookAt(c[3], c[4], c[5]);
      world.updateEnvironment(camera, state.day, t, dt);
    },
  };
  window.__dev = api;
  return api;
}
