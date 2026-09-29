// CRACKED WALL — a stone wall panel (opts.w x opts.h, default 6 x 5, 1 thick, centred on x, base at y = 0, front = +Z)
// with a broken, jagged top and painted cracks. The game hides it when charged and spawns rubble from `shardColors`.
// The crack painting is a runtime copy of the `brick` texture at the same texel density (8 texels / unit).
import { Rig, exposure, setExposure } from './common.js';
import { litBuilder, clamp } from './geo.js';
import { derivedTexture } from './recolor.js';
import { RNG } from '../../../engine/textures/pix.js';

const TEXEL = 8;    // texels per world unit (== brick at tile 4)

function paintCracks(p, src, w, h) {
  const W = p.w, H = p.h;
  // tile the brick texture across the panel (aligned to the bottom edge so courses sit on the ground)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = x % src.w, sy = ((H - 1 - y) % src.h + src.h) % src.h;
      const c = src.get(sx, src.h - 1 - sy);
      p.set(x, H - 1 - y, c);
    }
  }
  const rng = new RNG(1000 + w * 31 + h * 17);
  const DARK = '#1d1526', EDGE = '#b9b3c8', SHADE = '#3f3850', MID = '#2a2236';
  const dot = (x, y, c) => p.set(Math.round(x), Math.round(y), c);
  // a crack is a random walk; its lit edge (upper left) only shows every few pixels so it reads as chipped stone
  const crack = (x, y, ang, len, thick, depth) => {
    for (let i = 0; i < len; i++) {
      ang += rng.float(-0.35, 0.35);
      x += Math.cos(ang); y += Math.sin(ang);
      dot(x, y, DARK);
      if (thick && i < len * 0.7) { dot(x + 1, y, DARK); dot(x, y + 1, MID); }
      else if (i % 2 === 0) dot(x, y + 1, MID);
      if (i % 3 === 1) dot(x - 1, y - 1, EDGE);
      if (depth > 0 && i > 4 && rng.chance(0.09)) crack(x, y, ang + rng.float(0.5, 1.0) * (rng.chance(0.5) ? 1 : -1), Math.floor(len * 0.5), false, depth - 1);
    }
  };
  // an impact point about half way up with cracks radiating from it, plus one long fissure from the top edge
  const cx = W * 0.5 + rng.float(-5, 5), cy = H * 0.5;
  for (let k = 0; k < 5; k++) crack(cx, cy, (k / 5) * Math.PI * 2 + rng.float(-0.4, 0.4), 8 + rng.int(0, 9), k % 2 === 0, 2);
  crack(W * 0.28, 0, Math.PI / 2 + 0.15, Math.floor(H * 0.55), false, 2);
  crack(W * 0.8, H * 0.28, Math.PI / 2 - 0.35, Math.floor(H * 0.42), false, 1);
  // chipped-out bricks: ragged dark patches with a lit lower lip, sitting on the cracks
  for (let k = 0; k < 3; k++) {
    const x = cx + rng.float(-16, 16), y = cy + rng.float(-9, 9);
    const r = rng.float(2.6, 4.2);
    const pts = [];
    for (let a = 0; a < 6; a++) { const t = (a / 6) * Math.PI * 2 + rng.float(-0.3, 0.3), rr = r * rng.float(0.65, 1.25); pts.push([x + Math.cos(t) * rr * 1.5, y + Math.sin(t) * rr * 0.9]); }
    p.poly(pts, SHADE);
    p.poly(pts.map(([px, py]) => [x + (px - x) * 0.7, y + (py - y) * 0.7 + 0.4]), DARK);
    p.line(x - r, y + r * 0.9 + 1, x + r * 1.2, y + r * 0.9 + 1, EDGE);
  }
}

export function createCrackedWall(assets, opts = {}) {
  const w = opts.w ?? 6, h = opts.h ?? 5;
  const T = 1;               // thickness
  const rig = new Rig(assets);
  const anchors = {};
  const tw = Math.round(w * TEXEL), th = Math.round(h * TEXEL);
  const tex = derivedTexture(assets, 'brick', `wall|${tw}|${th}`, (p, src) => paintCracks(p, src, w, h), [tw, th], false);
  const mat = rig.litMap(tex);

  // broken top: the top edge is a polyline through per-boundary heights, so neighbouring faces share whole edges (no
  // T-junctions -> no pixel cracks under the PS1 vertex snap)
  const N = Math.min(8, Math.max(3, Math.round(w / 1.0)));
  const rng = new RNG(77 + N * 13 + Math.round(h * 10));
  const xs = [], H = [];
  for (let i = 0; i <= N; i++) {
    xs.push(-w / 2 + (w * i) / N);
    H.push(h - (i === 0 || i === N ? rng.float(0.25, 0.65) : rng.float(0, 0.8)));
  }
  const b = litBuilder(1, 131);
  const z = T / 2;
  const shade = (x, y) => { const k = 0.7 + 0.3 * Math.min(1, y / (h * 0.6)); return [k, k, k]; };
  const uvF = (p) => [(p[0] + w / 2) / w, p[1] / h];
  const uvB = (p) => [1 - (p[0] + w / 2) / w, p[1] / h];
  const face = (a, bb, c, d, uv) => {
    b.tri(a, bb, c, uv(a), uv(bb), uv(c), { color: shade });
    b.tri(a, c, d, uv(a), uv(c), uv(d), { color: shade });
  };
  for (let i = 0; i < N; i++) {
    const xa = xs[i], xb = xs[i + 1], ha = H[i], hb = H[i + 1];
    face([xa, 0, z], [xb, 0, z], [xb, hb, z], [xa, ha, z], uvF);
    face([xb, 0, -z], [xa, 0, -z], [xa, ha, -z], [xb, hb, -z], uvB);
    // sloped top (uses the topmost strip of the texture)
    const ut = (p) => [(p[0] + w / 2) / w, 0.9 + 0.1 * ((p[2] + z) / T)];
    b.tri([xa, ha, z], [xb, hb, z], [xb, hb, -z], ut([xa, ha, z]), ut([xb, hb, z]), ut([xb, hb, -z]), { color: [0.95, 0.95, 0.95] });
    b.tri([xa, ha, z], [xb, hb, -z], [xa, ha, -z], ut([xa, ha, z]), ut([xb, hb, -z]), ut([xa, ha, -z]), { color: [0.95, 0.95, 0.95] });
  }
  // end faces
  const ue = (p) => [((p[2] + z) / T) * 0.14, p[1] / h];
  const xe = xs[N];
  face([xs[0], 0, -z], [xs[0], 0, z], [xs[0], H[0], z], [xs[0], H[0], -z], ue);
  face([xe, 0, z], [xe, 0, -z], [xe, H[N], -z], [xe, H[N], z], (p) => [1 - ((p[2] + z) / T) * 0.14, p[1] / h]);
  const body = rig.pivot('wall');
  rig.mesh(b, mat, body, { name: 'wall' });
  rig.anchor(anchors, 'impact', 0, h * 0.55, z);
  rig.anchor(anchors, 'center', 0, h * 0.5, 0);

  const st = { wob: 0, t: 0 };
  const model = {
    root: rig.root,
    anchors,
    radius: Math.hypot(w / 2, T / 2),
    height: h,
    tris: rig.tris,
    size: { w, h, d: T },
    shardColors: [[0.5, 0.48, 0.6], [0.64, 0.61, 0.72], [0.4, 0.37, 0.5], [0.78, 0.75, 0.84], [0.22, 0.2, 0.3]],
    wobble(k = 1) { st.wob = Math.max(st.wob, clamp(k)); },
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.wobble) model.wobble(pose.wobble);
      setExposure(mat, exposure(1.4));
      if (st.wob > 0) {
        st.wob = Math.max(0, st.wob - dt * 2.4);
        const k = st.wob * st.wob;
        body.position.x = Math.sin(st.t * 57) * 0.09 * k;
        body.position.z = Math.cos(st.t * 43) * 0.05 * k;
        body.rotation.z = Math.sin(st.t * 49 + 1) * 0.012 * k;
      } else if (body.position.x !== 0 || body.position.z !== 0 || body.rotation.z !== 0) {
        body.position.set(0, 0, 0);
        body.rotation.set(0, 0, 0);
      }
    },
    testPoses: { idle: {}, hit: (t) => ({ t, wobble: (t % 1.6) < 0.05 ? 1 : 0 }) },
    flash: (k) => rig.flash(k),
    dispose: () => rig.dispose(),
  };
  setExposure(mat, exposure(1.4));
  return model;
}
