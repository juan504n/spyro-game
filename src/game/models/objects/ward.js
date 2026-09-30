// WARD — the ancient ward that seals the Dawn Gate's mountain: the WALL ROUND THE GATE. A tall, semi-translucent violet curtain standing on the circle of
// radius R round the summit (the very circle the hero is stopped at, see Player._boundary), following the ground, drawn in the gate's own shimmering hex
// lattice so the two read as one spell. It is never quite invisible: the veil is thin but always there, it brightens where the hero is near and flares where
// he leans on it, and a bright seam runs along the ground so the line can be seen from above and from a glide. setOpen(k): 0 = sealed .. 1 = gone (it goes with the
// gate's own field; the hero is let through once it has).
//
// World-space model: root sits at the origin and the vertices are world positions. opts: cx, cz (the summit), radius (42), heightAt(x, z) (the ground; flat 0 by
// default), gateX + gap (the gate stands due south of the summit at x = gateX, and its own field fills an opening gap metres either side of that: 3.3;
// gap 0 = a full ring).
// update(dt, { t, open, px, pz }): t = clock, open = gate dissolve 0..1, (px, pz) = the hero (for the glow that follows him).
import { Rig, setAlpha } from './common.js';
import { litBuilder, smooth, clamp, TAU } from './geo.js';

const N = 144;                                                   // segments round the circle (about 1.8 m each at R 42)
const ROWS = [-1.5, 0, 1.5, 4.5, 10, 18, 28, 42];                // metres above the ground
const VEIL = [0.9, 0.9, 0.85, 0.7, 0.52, 0.36, 0.2, 0.0];        // veil alpha per row: densest at the ground, thinning to nothing overhead
const GLOW = [0.0, 0.9, 0.75, 0.5, 0.3, 0.15, 0.06, 0.0];       // the additive lattice: the same shape, a little more focused on the ground
const SEAM = [[-0.5, 0.0], [0.15, 1.0], [1.7, 0.0]];           // [height, alpha] of the bright seam on the ground
const FAR = 0.55;                                                // how much of its brightness the wall keeps away from the hero
const NEAR_R = 24;                                               // metres (along the wall) over which it brightens round the hero
const T = 3.2;                                                   // world units per texture repeat (as the gate's field)

export function createWard(assets, opts = {}) {
  const R = opts.radius ?? 42, cx = opts.cx ?? 0, cz = opts.cz ?? 0, heightAt = opts.heightAt || (() => 0), gap = opts.gap ?? 3.3, gateX = opts.gateX ?? cx;
  const rig = new Rig(assets);
  const mVeil = rig.half('barrier', { double: true, scroll: [0.012, 0.03], depthWrite: false });
  const mGlow = rig.glow('barrier', { double: true, scroll: [-0.035, -0.11] });
  const mSeam = rig.glow(null, { double: true });

  // the ring: N vertices on the circle (angle a: x = sin a, z = cos a, a = 0 due south, towards the gate), each with the ground height under it
  const ang = Array.from({ length: N + 1 }, (_, i) => (i / N) * TAU);
  const ring = ang.map((a) => { const x = cx + Math.sin(a) * R, z = cz + Math.cos(a) * R; return { a, x, z, g: heightAt(x, z) }; });
  const M = Math.max(1, Math.round((TAU * R) / T)), Tu = (TAU * R) / M;    // whole texture repeats round the circle, so the seam closes
  // the gate's own field fills the opening on the south side: leave the ring open there (the pillars hide its ends)
  const inGate = (i) => { const k = ring[i], l = ring[i + 1], xm = (k.x + l.x) / 2, zm = (k.z + l.z) / 2; return Math.abs(xm - gateX) < gap && zm > cz; };

  // one mesh per layer; the vertices are emitted in a known order (six per quad, corners BL BR TR BL TR TL) so their alpha can be rewritten every frame
  const corners = [0, 1, 2, 0, 2, 3];
  const layer = (rows, alphas, tintOf, seed, uOff, vOff, material, name, order) => {
    const b = litBuilder(1, seed);
    const meta = [];                                                          // per vertex: [ring index 0..N-1, row index]
    for (let i = 0; i < N; i++) {
      if (inGate(i)) continue;
      const k = ring[i], l = ring[i + 1];
      for (let j = 0; j + 1 < rows.length; j++) {
        const P = (r, h) => [r.x, r.g + h, r.z];
        const tint = [tintOf(rows[j]), tintOf(rows[j]), tintOf(rows[j + 1]), tintOf(rows[j + 1])];
        b.quad(P(k, rows[j]), P(l, rows[j]), P(l, rows[j + 1]), P(k, rows[j + 1]), {
          uv: [(i / N) * M + uOff, rows[j] / Tu + vOff, ((i + 1) / N) * M + uOff, rows[j + 1] / Tu + vOff],
          tints: tint, alphas: [alphas[j], alphas[j], alphas[j + 1], alphas[j + 1]],
        }, [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]]);
        const cs = [[i, j], [(i + 1) % N, j], [(i + 1) % N, j + 1], [i, j + 1]];
        for (const c of corners) meta.push(cs[c]);
      }
    }
    const mesh = rig.mesh(b, material, null, { name, order });
    const attr = mesh.geometry.attributes.aCol;
    if (attr.count !== meta.length) throw new Error(`ward ${name}: ${attr.count} vertices, ${meta.length} expected`);
    const base = Float32Array.from({ length: meta.length }, (_, v) => alphas[meta[v][1]]);
    mesh.frustumCulled = false;                                               // (a big ring: the camera is usually inside or beside its bounding sphere)
    return { mesh, attr, meta, base };
  };
  const veil = layer(ROWS, VEIL, (h) => [0.3 + 0.12 * (1 - smooth(0, 8, h)), 0.2 + 0.08 * (1 - smooth(0, 8, h)), 0.62 + 0.18 * (1 - smooth(0, 8, h))], 301, 0, 0, mVeil, 'veil', 8);
  const glow = layer(ROWS, GLOW, (h) => [0.3 + 0.2 * (1 - smooth(0, 10, h)), 0.2 + 0.12 * (1 - smooth(0, 10, h)), 0.55 + 0.3 * (1 - smooth(0, 10, h))], 302, 0.37, 0.21, mGlow, 'glow', 9);
  const seam = layer(SEAM.map((s) => s[0]), SEAM.map((s) => s[1]), () => [0.46, 0.3, 0.8], 303, 0, 0, mSeam, 'seam', 10);

  // the glow that follows the hero: how much of its brightness each ring vertex has right now (the veil stays see-through at most; the flare where he leans on the wall
  // goes into the additive lattice and the seam, which is what makes it look solid there)
  const lvl = new Float32Array(N), lvlGlow = new Float32Array(N);
  const st = { k: clamp(opts.open ?? 0), target: clamp(opts.open ?? 0), t: 0, px: cx, pz: cz + R * 3, touch: 0 };
  const writeAlpha = (L, lv, fade) => {
    const { attr, meta, base } = L, arr = attr.array;
    for (let v = 0; v < meta.length; v++) arr[v * 4 + 3] = Math.round(255 * clamp(base[v] * lv[meta[v][0]] * fade));
    attr.needsUpdate = true;
  };
  const apply = () => {
    const { t } = st;
    // where the hero is, as a bearing and a distance from the wall
    const dx = st.px - cx, dz = st.pz - cz, d = Math.hypot(dx, dz), bearing = Math.atan2(dx, dz);
    const away = Math.abs(d - R);
    const close = 1 - smooth(2, 70, away);                                    // 1 at the wall .. 0 far from it (either side)
    st.touch = d < R ? 1 : clamp((R + 2.5 - d) / 2.5);                        // leaning on it
    const fade = 1 - smooth(0, 0.55, st.k);                                   // gone by the time the ward stops holding (the gate's collider lets go at 0.55)
    for (let i = 0; i < N; i++) {
      let da = Math.abs(ang[i] - bearing) % TAU; if (da > Math.PI) da = TAU - da;
      const arc = da * R;
      const near = Math.exp(-((arc / NEAR_R) ** 2));
      const flare = st.touch * Math.exp(-((arc / 7) ** 2));
      lvl[i] = FAR + (1 - FAR) * close * near;
      lvlGlow[i] = lvl[i] + 0.9 * flare;
    }
    // a slow pulse and a fast shimmer, so even the far parts of the wall move (the lattices scroll too)
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.7);
    writeAlpha(veil, lvl, fade);
    writeAlpha(glow, lvlGlow, fade);
    writeAlpha(seam, lvlGlow, fade);
    setAlpha(mVeil, 1.1 * (0.92 + 0.08 * pulse));
    setAlpha(mGlow, 0.6 + 0.12 * Math.sin(t * 5.3 + 1.7) * Math.sin(t * 1.3));
    setAlpha(mSeam, 0.8 + 0.2 * pulse);
    rig.root.visible = st.k < 0.55;
  };

  const model = {
    root: rig.root,
    anchors: {},
    radius: R,
    height: ROWS[ROWS.length - 1],
    size: { w: 2 * R, h: ROWS[ROWS.length - 1] },
    tris: rig.tris,
    get open() { return st.target; },
    get touch() { return st.touch; },
    setOpen(k) { st.target = clamp(k); },
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.open !== undefined) st.target = clamp(pose.open);
      if (pose.px !== undefined) { st.px = pose.px; st.pz = pose.pz; }
      st.k += (st.target - st.k) * (1 - Math.exp(-dt * 8));
      if (Math.abs(st.k - st.target) < 0.002) st.k = st.target;
      apply();
    },
    testPoses: { sealed: { open: 0 }, half: { open: 0.3 }, open: { open: 1 } },
    flash: () => {},
    dispose: () => rig.dispose(),
  };
  apply();
  return model;
}
