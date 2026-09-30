// Gems: ~400 static pickups + physics gems that burst out of vases/enemies. One InstancedMesh, per-instance colour.
import * as THREE from 'three';
import { Builder } from '../../engine/builder.js';

export const GEM_TYPES = {
  1: { name: 'red', color: [1.0, 0.13, 0.20], size: 0.62, snd: 'gem_red' },
  2: { name: 'green', color: [0.10, 0.95, 0.38], size: 0.70, snd: 'gem_green' },
  5: { name: 'blue', color: [0.22, 0.50, 1.0], size: 0.80, snd: 'gem_blue' },
  10: { name: 'gold', color: [1.0, 0.80, 0.10], size: 0.92, snd: 'gem_gold' },
  25: { name: 'purple', color: [0.82, 0.28, 1.0], size: 1.12, snd: 'gem_purple' },
};

const dummy = new THREE.Object3D();
const col = new THREE.Color();

/**
 * A cut gem in 48 flat facets (Spyro-style): a hexagonal table, a crown of alternating triangles, a short girdle band and a
 * two-tier pavilion down to the point. Each facet carries a baked brightness; the gem shader lights them with two fixed lights
 * and a specular glint, so the facets flash as the gem spins. Vertex colours are white-ish tints, the hue is per instance.
 */
function gemGeometry() {
  const b = new Builder({ lit: true });
  const N = 6, TAU = Math.PI * 2;
  const ring = (r, y, off = 0) => Array.from({ length: N }, (_, i) => [r * Math.sin((i / N) * TAU + off), y, r * Math.cos((i / N) * TAU + off)]);
  const HALF = Math.PI / N;
  const T = ring(0.25, 0.36, HALF);       // table (turned half a step against the girdle: the crown becomes alternating triangles)
  const G = ring(0.52, 0.11);              // girdle top
  const H = ring(0.52, 0.0);               // girdle bottom
  const M = ring(0.27, -0.30, HALF);      // pavilion mid ring
  const tip = [0, -0.66, 0];
  const cen = [0, -0.05, 0];
  const facet = (a, c, d, k) => {
    // wind counter-clockwise seen from outside, flat normal, baked tint k (0..1 of the tint range)
    const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const mid = [(a[0] + c[0] + d[0]) / 3 - cen[0], (a[1] + c[1] + d[1]) / 3 - cen[1], (a[2] + c[2] + d[2]) / 3 - cen[2]];
    if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] < 0) { const t = c; c = d; d = t; n = [-n[0], -n[1], -n[2]]; }
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    const t = [k, k, k];
    b.tri(a, c, d, [0, 0], [0, 0], [0, 0], { tints: [t, t, t] }, [n, n, n]);
  };
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, im = (i + N - 1) % N;
    facet([0, 0.36, 0], T[i], T[j], 1.0);                 // table
    facet(T[im], G[i], T[i], 0.92);                       // crown: triangles pointing down to the girdle ...
    facet(T[i], G[i], G[j], i % 2 ? 0.74 : 0.84);         // ... and up to the table
    facet(G[i], H[i], H[j], 0.62); facet(G[i], H[j], G[j], 0.62);      // girdle band
    facet(H[i], H[j], M[i], i % 2 ? 0.66 : 0.78);         // pavilion, upper tier
    facet(H[j], M[j], M[i], i % 2 ? 0.52 : 0.6);
    facet(M[i], M[j], tip, i % 2 ? 0.42 : 0.55);          // pavilion, lower tier
  }
  const g = b.build();
  g.computeBoundingSphere();
  return g;
}

export class GemField {
  constructor(game, list) {
    this.game = game;
    this.items = [];
    this.free = [];
    const DYN = 160;
    this.capacity = list.length + DYN;
    const geo = gemGeometry();
    const mat = game.assets.mat(null, { gem: true, day: false, unique: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = this.capacity;
    this.mesh.name = 'gems';
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < this.capacity; i++) { this.mesh.setMatrixAt(i, dummy.matrix); this.mesh.setColorAt(i, col.setRGB(1, 1, 1)); }
    game.dyn.add(this.mesh);
    list.forEach((g) => this._add(g.x, g.y, g.z, g.value, false));
    for (let i = list.length; i < this.capacity; i++) this.free.push(i);
    this.total = list.reduce((s, g) => s + g.value, 0);
    this.collected = 0;
    this.magnetR = 5.2;
  }

  _add(x, y, z, value, dynamic) {
    const idx = dynamic ? this.free.pop() : this.items.length;
    if (idx === undefined) return null;
    const T = GEM_TYPES[value] || GEM_TYPES[1];
    const it = { i: idx, x, y, z, value, size: T.size, color: T.color, spin: Math.random() * 6.28, phase: Math.random() * 6.28, alive: true, dynamic, vx: 0, vy: 0, vz: 0, delay: 0, bounces: 0, magnet: false, sp: 0 };
    this.mesh.setColorAt(idx, col.setRGB(T.color[0], T.color[1], T.color[2]));
    if (dynamic) this.items.push(it); else this.items[idx] = it;
    this.mesh.instanceColor.needsUpdate = true;
    return it;
  }

  /** Physics gems flying out of a broken vase / defeated enemy. `values` = e.g. [1,1,2]. */
  burst(x, y, z, values, power = 1) {
    for (const v of values) {
      const it = this._add(x, y, z, v, true);
      if (!it) continue;
      const a = Math.random() * Math.PI * 2, s = (2.5 + Math.random() * 3.5) * power;
      it.vx = Math.cos(a) * s; it.vz = Math.sin(a) * s; it.vy = (7 + Math.random() * 4) * power;
      it.delay = 0.45;
    }
    this.game.audio?.sfx('gem_burst', { vol: 0.7 });
  }

  update(dt, game) {
    const p = game.player;
    if (p.dead) return;
    const px = p.x, py = p.y + 0.5, pz = p.z;
    const grid = game.collision;
    const hasSparx = game.sparx && game.sparx.hp > 0;
    const R = 1.55, MR = this.magnetR;
    for (let k = this.items.length - 1; k >= 0; k--) {
      const it = this.items[k];
      if (!it || !it.alive) continue;
      if (it.dynamic) {
        it.delay -= dt;
        if (!it.magnet) {
          it.vy -= 30 * dt;
          it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
          const g = grid.support(it.x, it.z, it.y, 0.5).y + 0.5;
          if (it.y < g) {
            it.y = g;
            if (it.bounces < 3 && Math.abs(it.vy) > 2) { it.vy = -it.vy * 0.5; it.vx *= 0.7; it.vz *= 0.7; it.bounces++; } else { it.vy = 0; it.vx *= 0.8; it.vz *= 0.8; }
          }
        }
        if (it.delay > 0) continue;
      }
      const dx = px - it.x, dy = py - it.y, dz = pz - it.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < R * R) { this._collect(it, game); continue; }
      if (hasSparx && d2 < MR * MR) it.magnet = true;
      if (it.magnet) {
        it.sp = Math.min(26, it.sp + 60 * dt);
        const d = Math.sqrt(d2) || 1;
        it.x += (dx / d) * it.sp * dt; it.y += (dy / d) * it.sp * dt; it.z += (dz / d) * it.sp * dt;
        if (d < 0.9) this._collect(it, game);
      }
    }
  }

  _collect(it, game) {
    it.alive = false;
    dummy.scale.setScalar(0); dummy.updateMatrix();
    this.mesh.setMatrixAt(it.i, dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (it.dynamic) this.free.push(it.i);
    this.collected += it.value;
    game.stats.gems += it.value;
    const T = GEM_TYPES[it.value] || GEM_TYPES[1];
    game.fx.gemPickup(it.x, it.y, it.z, T.color);
    game.audio?.sfx(T.snd, { vol: 0.85, pan: 0 });
    game.hud?.pulse('gems');
    game.emit('gem', it.value);
  }

  frame(dt, alpha, game) {
    const t = game.time;
    const cam = game.camera.position;
    let dirty = false;
    for (const it of this.items) {
      if (!it) continue;
      if (!it.alive) continue;
      const dx = it.x - cam.x, dz = it.z - cam.z;
      const near = dx * dx + dz * dz < 190 * 190;
      if (!near) { if (!it.hidden) { dummy.scale.setScalar(0); dummy.updateMatrix(); this.mesh.setMatrixAt(it.i, dummy.matrix); it.hidden = true; dirty = true; } continue; }
      it.hidden = false;
      const bob = it.dynamic && !it.magnet && it.vy !== 0 ? 0 : Math.sin(t * 2.4 + it.phase) * 0.14;
      dummy.position.set(it.x, it.y + bob, it.z);
      dummy.rotation.set(0, t * 1.9 + it.spin, 0);
      dummy.scale.setScalar(it.size);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(it.i, dummy.matrix);
      dirty = true;
      // sparkle: nearby gems pop a star twinkle or a cross glint now and then (big gems more often)
      if (dx * dx + dz * dz < 900 && Math.random() < dt * (it.value >= 5 ? 0.9 : 0.4)) {
        const ox = (Math.random() - 0.5) * 0.5 * it.size, oy = (0.15 + Math.random() * 0.4) * it.size, oz = (Math.random() - 0.5) * 0.5 * it.size;
        if (Math.random() < 0.6) game.fx.twinkle(it.x + ox, it.y + oy, it.z + oz, 0.7 + it.size * 0.7);
        else game.fx.glint(it.x + ox, it.y + oy, it.z + oz, 0.8 + it.size * 0.4);
      }
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
