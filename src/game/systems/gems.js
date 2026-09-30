// Gems: ~400 static pickups + physics gems that burst out of vases/enemies. One InstancedMesh, per-instance colour.
import * as THREE from 'three';
import { Builder } from '../../engine/builder.js';

// vol: playback level of the chime (the rarer, richer chimes are a little louder: they are the reward)
// ladder: semitones over the chime's own pitch for a quick run of pickups (see COMBO below); gold and purple keep their pitch
export const GEM_TYPES = {
  1: { name: 'red', color: [1.0, 0.13, 0.20], size: 0.62, snd: 'gem_red', vol: 0.8, ladder: [0, 5, 7, 12] },
  2: { name: 'green', color: [0.10, 0.95, 0.38], size: 0.70, snd: 'gem_green', vol: 0.85, ladder: [0, 5, 7] },
  5: { name: 'blue', color: [0.22, 0.50, 1.0], size: 0.80, snd: 'gem_blue', vol: 0.9, ladder: [0, 5, 7, 12] },
  10: { name: 'gold', color: [1.0, 0.80, 0.10], size: 0.92, snd: 'gem_gold', vol: 1.0, ladder: [0] },
  25: { name: 'purple', color: [0.82, 0.28, 1.0], size: 1.12, snd: 'gem_purple', vol: 1.0, ladder: [0] },
};

// COMBO: pickups less than COMBO_WINDOW seconds apart form a run. Each chime in a run is played higher along the type's ladder
// (a fourth, a fifth, an octave: all inside the D pentatonic family, so it stays in tune with the music) and after the top it
// trills between the last two steps, so a burst out of a chest or a sprint down a gem trail sparkles upward instead of repeating
// one note. A pause resets it.
const COMBO_WINDOW = 0.85;

// FLIGHT: a gem that Sparx pulls in is lobbed, not slid: it rises first and then dives into Spyro. Over a flight time T the gem
// follows the straight line to wherever he is *now* (so it still homes in on a moving target) with progress u^EASE (slow at first,
// fast at the end) plus a parabolic hump of height H (up, then down). Longer pulls take longer and arc higher.
const FLIGHT = { t0: 0.32, tPerM: 0.05, h0: 0.55, hPerM: 0.4, ease: 1.35, cancelDist: 14 };

const dummy = new THREE.Object3D();
const col = new THREE.Color();

/**
 * A cut gem in 48 flat facets (Spyro-style): a hexagonal table, a crown of alternating triangles, a short girdle band and a
 * two-tier pavilion down to the point. Each facet carries a baked brightness; the gem shader lights them with two fixed lights
 * and a specular glint, so the facets flash as the gem spins. Vertex colours are white-ish tints, the hue is per instance.
 */
export function gemGeometry() {
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
    this.combo = 0;                    // pickups so far in the current run
    this.lastAt = -1e9;                // game time of the previous pickup
    this.magnetR = 5.2;
  }

  _add(x, y, z, value, dynamic) {
    const idx = dynamic ? this.free.pop() : this.items.length;
    if (idx === undefined) return null;
    const T = GEM_TYPES[value] || GEM_TYPES[1];
    const it = { i: idx, x, y, z, value, size: T.size, color: T.color, spin: Math.random() * 6.28, phase: Math.random() * 6.28, alive: true, dynamic, vx: 0, vy: 0, vz: 0, delay: 0, bounces: 0, magnet: false, mt: 0, T: 0, H: 0, sx: 0, sy: 0, sz: 0, trail: 0, hx: x, hy: y, hz: z };
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
      if (!it.magnet && hasSparx && d2 < MR * MR) this._launch(it, Math.sqrt(d2));
      if (it.magnet) this._fly(it, dt, px, py, pz, game);
    }
  }

  /** Sparx grabs the gem: remember where it starts and how long / how high the lob will be. */
  _launch(it, d) {
    it.magnet = true;
    this.game.sparx?.grab(it);                        // (he flicks towards it)
    it.mt = 0; it.trail = 0;
    it.sx = it.x; it.sy = it.y; it.sz = it.z;
    it.T = FLIGHT.t0 + FLIGHT.tPerM * d;
    it.H = FLIGHT.h0 + FLIGHT.hPerM * d;
    it.vx = it.vy = it.vz = 0;
  }

  /** One step of a lob toward the player's chest (px, py, pz): a hump over the line to where he is now. */
  _fly(it, dt, px, py, pz, game) {
    const dx = px - it.x, dy = py - it.y, dz = pz - it.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > FLIGHT.cancelDist) {                   // he was teleported (respawn) or outran the pull: let the gem go
      it.magnet = false;
      if (!it.dynamic) { it.x = it.hx; it.y = it.hy; it.z = it.hz; }      // (a placed gem returns to where it hangs; a burst gem just drops)
      return;
    }
    it.mt += dt;
    const u = Math.min(1, it.mt / it.T);
    const p = Math.pow(u, FLIGHT.ease);
    it.x = it.sx + (px - it.sx) * p;
    it.y = it.sy + (py - it.sy) * p + it.H * 4 * u * (1 - u);
    it.z = it.sz + (pz - it.sz) * p;
    it.trail -= dt;
    if (it.trail <= 0) { it.trail = 0.04; game.fx.gemTrail(it.x, it.y, it.z, it.color); }
    if (u >= 1 || (it.mt > 0.15 && dist < 0.7)) this._collect(it, game);
  }

  /** Playback rate for this pickup's chime: the run so far climbs the type's ladder (semitones), then trills between its top two steps. */
  _comboPitch(T, now) {
    this.combo = now - this.lastAt < COMBO_WINDOW ? this.combo + 1 : 0;
    this.lastAt = now;
    const L = T.ladder, k = this.combo;
    const semis = k < L.length ? L[k] : L[Math.max(0, L.length - 1 - ((k - L.length + 1) % 2))];
    return Math.pow(2, semis / 12);
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
    game.audio?.sfx(T.snd, { vol: T.vol, pan: 0, pitch: this._comboPitch(T, game.time) });
    game.hud?.pulse('gems');
    game.counter?.bump(it.value, T.color);
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
      const flying = it.magnet;
      const bob = flying || (it.dynamic && it.vy !== 0) ? 0 : Math.sin(t * 2.4 + it.phase) * 0.14;
      dummy.position.set(it.x, it.y + bob, it.z);
      if (flying) {
        const u = Math.min(1, it.mt / it.T);
        dummy.rotation.set(0.45 * Math.sin(it.mt * 11 + it.phase), t * 1.9 + it.spin + it.mt * 14, 0.35 * Math.cos(it.mt * 8));
        dummy.scale.setScalar(it.size * (1 + 0.14 * 4 * u * (1 - u) - 0.3 * Math.max(0, u - 0.82) / 0.18));        // swells at the top of the hop, shrinks into Spyro
      } else {
        dummy.rotation.set(0, t * 1.9 + it.spin, 0);
        dummy.scale.setScalar(it.size);
      }
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
