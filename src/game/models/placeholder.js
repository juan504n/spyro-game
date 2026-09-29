// Stand-in hero model (same Model contract as the real one) used until/unless the creature artist's dragon is present.
import * as THREE from 'three';
import { Builder } from '../../engine/builder.js';

export function createPlaceholderSpyro(assets) {
  const root = new THREE.Group();
  const mk = (fn) => {
    const b = new Builder({ lit: true });
    fn(b);
    return new THREE.Mesh(b.build(), assets.mat(null, { lit: true, unique: true }));
  };
  const purple = [0.5, 0.25, 0.8], gold = [0.95, 0.65, 0.15];
  const body = new THREE.Group(); root.add(body);
  const torso = mk((b) => b.sphere(0.5, 8, 6, { color: purple }));
  torso.scale.set(1, 0.85, 1.5); torso.position.set(0, 0.55, 0); body.add(torso);
  const head = mk((b) => { b.sphere(0.38, 8, 6, { color: purple }); b.push().translate(0.2, 0.3, 0.05).cone(0.09, 0.4, 5, { color: gold }).pop(); b.push().translate(-0.2, 0.3, 0.05).cone(0.09, 0.4, 5, { color: gold }).pop(); });
  head.position.set(0, 0.85, 0.85); body.add(head);
  const wings = mk((b) => { b.quad([0.25, 0, 0], [1.1, 0.1, -0.2], [1.0, 0.7, -0.4], [0.25, 0.3, 0], { color: gold, double: true }); b.quad([-1.1, 0.1, -0.2], [-0.25, 0, 0], [-0.25, 0.3, 0], [-1.0, 0.7, -0.4], { color: gold, double: true }); });
  wings.position.set(0, 0.95, -0.1); body.add(wings);
  const legs = [];
  for (const [x, z] of [[0.3, 0.45], [-0.3, 0.45], [0.3, -0.45], [-0.3, -0.45]]) {
    const l = mk((b) => b.cyl(0.13, 0.11, 0.35, 6, { color: purple })); l.position.set(x, 0, z); root.add(l); legs.push(l);
  }
  const tail = mk((b) => b.cone(0.22, 0.9, 6, { color: purple }));
  tail.rotation.x = Math.PI / 2 + 0.3; tail.position.set(0, 0.55, -0.7); body.add(tail);
  const mouth = new THREE.Object3D(); mouth.position.set(0, 0.8, 1.3); root.add(mouth);
  return {
    root, radius: 0.55, height: 1.05, anchors: { mouth, back: new THREE.Object3D() }, phase: 0,
    testPoses: { idle: {}, run: { speed: 11 } },
    update(dt, pose = {}) {
      const sp = pose.speed || 0;
      this.phase += dt * (2 + sp * 0.9);
      legs.forEach((l, i) => { l.rotation.x = Math.sin(this.phase + (i % 3 ? Math.PI : 0)) * Math.min(0.7, sp * 0.1); });
      body.position.y = Math.abs(Math.sin(this.phase)) * Math.min(0.12, sp * 0.02);
      wings.scale.setScalar(pose.glide ? 1.6 : 0.6);
      head.rotation.x = pose.charge ? 0.5 : pose.flame ? -0.3 : 0;
      root.scale.y = 1 - (pose.land || 0) * 0.25;
    },
    flash(k) { root.traverse((o) => { if (o.material && o.material.uniforms) o.material.uniforms.uFlash.value = k; }); },
  };
}
