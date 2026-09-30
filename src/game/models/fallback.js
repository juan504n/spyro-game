// Model resolver: returns the artist's model if it exists, otherwise a simple coloured stand-in that honours the same
// Model contract, so gameplay code never has to special-case a missing actor.
import * as THREE from 'three';
import { Builder } from '../../engine/builder.js';
import { MODELS } from './index.js';
import { createPlaceholderSpyro } from './placeholder.js';

const SPEC = {
  snuffer: { color: [0.2, 0.15, 0.4], r: 0.75, h: 2.0, shape: 'cone' },
  bunny: { color: [0.85, 0.78, 0.7], r: 0.35, h: 0.8, shape: 'sphere' },
  elder: { color: [0.2, 0.55, 0.6], r: 0.5, h: 1.7, shape: 'cone' },
  beacon: { color: [0.55, 0.5, 0.65], r: 1.4, h: 4.4, shape: 'cyl' },
  vase: { color: [0.8, 0.4, 0.25], r: 0.55, h: 1.1, shape: 'cyl' },
  chest: { color: [0.55, 0.35, 0.15], r: 1.0, h: 0.9, shape: 'box' },
  bounce_mushroom: { color: [0.2, 0.65, 0.6], r: 2.4, h: 1.3, shape: 'cyl' },
  brazier: { color: [0.3, 0.28, 0.32], r: 0.8, h: 1.4, shape: 'cyl' },
  windmill_sails: { color: [0.8, 0.7, 0.5], r: 7, h: 0.3, shape: 'box' },
  barrier: { color: [0.5, 0.3, 0.9], r: 6, h: 11, shape: 'box' },
  portcullis: { color: [0.3, 0.3, 0.35], r: 2, h: 5, shape: 'box' },
  light_beam: { color: [1, 0.85, 0.5], r: 1.6, h: 60, shape: 'cyl' },
  cracked_wall: { color: [0.6, 0.55, 0.6], r: 3, h: 5, shape: 'box' },
};

function fallback(assets, name, opts) {
  const spec = SPEC[name] || { color: [1, 0, 1], r: 0.5, h: 1, shape: 'box' };
  const b = new Builder({ lit: true });
  const c = spec.color;
  const h = opts?.height || spec.h;
  if (spec.shape === 'cone') b.cone(spec.r, h, 8, { color: c });
  else if (spec.shape === 'sphere') b.push().translate(0, spec.h / 2, 0).sphere(spec.r, 8, 6, { color: c }).pop();
  else if (spec.shape === 'box') b.box(0, h / 2, 0, spec.r * (name === 'cracked_wall' || name === 'barrier' ? 2 : 1.2), h, name === 'barrier' ? 0.3 : spec.r, { color: c });
  else b.cyl(spec.r, spec.r * 0.8, h, 8, { color: c, caps: 'top' });
  const mesh = new THREE.Mesh(b.build(), assets.mat(null, { lit: true, unique: true, mode: name === 'barrier' || name === 'light_beam' ? 'half' : undefined }));
  const root = new THREE.Group();
  root.add(mesh);
  const model = {
    root, radius: spec.r, height: h, anchors: { flame: new THREE.Object3D(), top: new THREE.Object3D(), mouth: new THREE.Object3D(), lantern: new THREE.Object3D(), base: new THREE.Object3D() },
    lit: 0, open: 0, testPoses: {}, shardColors: [c],
    update() {},
    flash(k) { mesh.material.uniforms.uFlash.value = k; },
    setLit(k) { this.lit = k; mesh.material.uniforms.uColorMul.value.setRGB(0.6 + 0.8 * k, 0.6 + 0.6 * k, 0.6 + 0.2 * k); },
    setOpen(k) { this.open = k; this.raised = k; root.visible = k < 0.98; if (name === 'portcullis') mesh.position.y = k * 4.5; },
    wobble() {},
    setColor() {}, setIntensity(k) { mesh.material.uniforms.uAlpha.value = k; },
  };
  model.anchors.flame.position.set(0, h * 0.85, 0); root.add(model.anchors.flame);
  model.anchors.top.position.set(0, h, 0); root.add(model.anchors.top);
  model.anchors.mouth.position.set(0, h * 0.8, spec.r); root.add(model.anchors.mouth);
  model.anchors.lantern.position.set(0.4, h * 0.9, 0); root.add(model.anchors.lantern);
  return model;
}

/** Create a model by registry name (spyro, snuffer, bunny, elder, beacon, vase, chest, …). */
export function makeModel(assets, name, opts) {
  const e = MODELS[name];
  if (e) {
    try { return e.create(assets, opts); } catch (err) { console.error('model failed, using fallback:', name, err); }
  }
  if (name === 'spyro') return createPlaceholderSpyro(assets);
  return fallback(assets, name, opts);
}
