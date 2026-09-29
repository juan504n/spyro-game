// Dev-only scene that exercises every PS1 effect: affine warping, vertex snapping, dither, fog, cutouts, blend modes.
import * as THREE from 'three';
import { Pix, RNG } from '../engine/textures/pix.js';
import { makeMaterial, texFromPix, U } from '../engine/materials.js';
import { Builder } from '../engine/builder.js';

function checker() {
  const p = new Pix(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const c = ((x >> 3) + (y >> 3)) & 1;
    p.set(x, y, c ? '#e8d8a8' : '#7a9a3a');
  }
  p.line(0, 0, 31, 31, '#c03030'); p.line(0, 31, 31, 0, '#3050c0');
  p.rect(0, 0, 32, 1, '#000'); p.rect(0, 0, 1, 32, '#000');
  return p;
}
function bricks() {
  const p = new Pix(32, 32, '#7a4e44');
  const r = new RNG(3);
  for (let row = 0; row < 4; row++) {
    const off = (row & 1) * 8;
    for (let k = -1; k < 3; k++) {
      const x0 = k * 16 + off, y0 = row * 8;
      p.rect(x0 + 1, y0 + 1, 15, 7, ['#9a6a56', '#b98a6c', '#8a5a4a'][r.int(0, 3)], true);
    }
  }
  return p;
}
function tree() {
  const p = new Pix(32, 32);
  p.ellipse(16, 12, 11, 11, '#3f8f3c'); p.ellipse(13, 9, 5, 4, '#7cc84f'); p.rect(14, 22, 4, 10, '#634632');
  p.outline('#123');
  return p;
}
function glow() {
  const p = new Pix(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5) / 16;
    const v = Math.max(0, 1 - d); const g = Math.round(v * v * 255);
    p.set(x, y, [g, g * 0.7, g * 0.3, 255]);
  }
  return p;
}

export function create(gfx) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 4 / 3, 0.4, 900);
  const mChk = makeMaterial({ map: texFromPix(checker()) });
  const mBrick = makeMaterial({ map: texFromPix(bricks()) });
  const mTree = makeMaterial({ map: texFromPix(tree(), { tile: false }), mode: 'cutout', double: true });
  const mGlow = makeMaterial({ map: texFromPix(glow(), { tile: false }), mode: 'add', double: true });
  const mHalf = makeMaterial({ map: texFromPix(bricks()), mode: 'half', double: true });
  const mGrad = makeMaterial({});

  // big ground made of large triangles: the classic affine-warp stress test
  {
    const b = new Builder();
    const S = 16;
    for (let z = -6; z < 6; z++) for (let x = -6; x < 6; x++) {
      b.quad([x * S, 0, (z + 1) * S], [(x + 1) * S, 0, (z + 1) * S], [(x + 1) * S, 0, z * S], [x * S, 0, z * S], { tile: 8, color: [0.5, 0.5, 0.5] });
    }
    scene.add(new THREE.Mesh(b.build(), mChk));
  }
  const cubes = [];
  for (let i = 0; i < 6; i++) {
    const b = new Builder();
    b.box(0, 1.5, 0, 3, 3, 3, { tile: 3, color: [0.55, 0.55, 0.55] });
    const m = new THREE.Mesh(b.build(), mBrick);
    m.position.set(-10 + i * 5, 0, -10 - i * 14);
    scene.add(m); cubes.push(m);
  }
  {
    const b = new Builder();
    b.quad([-3, 0, 0], [3, 0, 0], [3, 6, 0], [-3, 6, 0], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
    const m = new THREE.Mesh(b.build(), mTree); m.position.set(6, 0, -6); scene.add(m);
    const m2 = new THREE.Mesh(b.build(), mTree); m2.position.set(-14, 0, -20); scene.add(m2);
    const g = new THREE.Mesh(b.build(), mGlow); g.position.set(0, 0, -10); scene.add(g);
    const h = new THREE.Mesh(b.build(), mHalf); h.position.set(-6, 0, -3); scene.add(h);
  }
  // gouraud gradient strip for dither inspection
  {
    const b = new Builder();
    const dark = [0.05, 0.05, 0.05], lite = [0.5, 0.5, 0.5];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const c = (t) => [0.05 + t * 0.45, 0.05 + t * 0.25, 0.1 + t * 0.4];
      b.tri([-8 + t0 * 16, 8, -30], [-8 + t1 * 16, 8, -30], [-8 + t1 * 16, 12, -30], [0, 0], [1, 0], [1, 1], { color: (x) => c((x + 8) / 16) });
      b.tri([-8 + t0 * 16, 8, -30], [-8 + t1 * 16, 12, -30], [-8 + t0 * 16, 12, -30], [0, 0], [1, 1], [0, 1], { color: (x) => c((x + 8) / 16) });
    }
    scene.add(new THREE.Mesh(b.build(), mGrad));
  }
  return {
    scene, camera,
    update(dt, t) {
      cubes.forEach((c, i) => { c.rotation.y = t * 0.4 + i; });
      camera.position.set(Math.sin(t * 0.1) * 6, 4, 14);
      camera.lookAt(0, 3, -20);
    },
  };
}
