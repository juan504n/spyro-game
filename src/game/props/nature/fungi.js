// Mushrooms: giant decor mushrooms and clusters of small glowing toadstools.
import { shade, TAU, lerp, clamp, mulc, norm3, num, int, sizeK, oneOf } from './util.js';

/**
 * Domed cap (rim -> crown) centred on the Y axis with the WHOLE 32x32 cap texture on every `panel` of `pw` segments
 * (the texture does not tile).  v = 0 at the rim (purple band), 1 at the crown (light teal).
 * ring profile: [[radiusFactor, yFactor], ...] from rim to crown.
 */
function cap(b, y0, Rc, Hc, segs, prof, { color, emissive, rot0 = 0, pw = 2, gillsUnder = 0.3, hub = 0.22 } = {}) {
  const K = prof.length;
  const ring = prof.map(([rf, yf]) => {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const a = rot0 + (i / segs) * TAU;
      pts.push([Math.sin(a) * Rc * rf, y0 + Hc * yf, Math.cos(a) * Rc * rf]);
    }
    return pts;
  });
  // smooth normals per ring vertex (profile slope in the r/y plane)
  const nrm = prof.map(([rf, yf], k) => {
    const a = prof[Math.max(k - 1, 0)], c = prof[Math.min(k + 1, K - 1)];
    const dr = (c[0] - a[0]) * Rc, dy = (c[1] - a[1]) * Hc;
    const nr = dy, ny = -dr;                       // perpendicular in the (r,y) plane, pointing out/up
    const l = Math.hypot(nr, ny) || 1;
    const out = [];
    for (let i = 0; i <= segs; i++) {
      const a2 = rot0 + (i / segs) * TAU;
      out.push(norm3([Math.sin(a2) * nr / l, ny / l, Math.cos(a2) * nr / l]));
    }
    return out;
  });
  const o = { color, emissive };
  const uOf = (i) => ((i % pw) / pw);
  for (let k = 0; k < K - 1; k++) {
    const v0 = lerp(0.02, 1, k / (K - 1)), v1 = lerp(0.02, 1, (k + 1) / (K - 1));
    for (let i = 0; i < segs; i++) {
      const u0 = uOf(i), u1 = u0 + 1 / pw;
      const BL = ring[k][i], BR = ring[k][i + 1], TR = ring[k + 1][i + 1], TL = ring[k + 1][i];
      const last = k === K - 2 && prof[K - 1][0] === 0;
      if (last) b.tri(BL, BR, TL, [u0, v0], [u1, v0], [(u0 + u1) / 2, v1], o, [nrm[k][i], nrm[k][i + 1], nrm[k + 1][i]]);
      else {
        b.tri(BL, BR, TR, [u0, v0], [u1, v0], [u1, v1], o, [nrm[k][i], nrm[k][i + 1], nrm[k + 1][i + 1]]);
        b.tri(BL, TR, TL, [u0, v0], [u1, v1], [u0, v1], o, [nrm[k][i], nrm[k + 1][i + 1], nrm[k + 1][i]]);
      }
    }
  }
  // underside: gill ring from the rim in to the stem, facing down (uses the purple rim band of the texture)
  const rim = ring[0];
  const hubR = Rc * hub, hubY = y0 + Hc * gillsUnder;
  const inner = rim.map((p, i) => {
    const a = rot0 + (i / segs) * TAU;
    return [Math.sin(a) * hubR, hubY, Math.cos(a) * hubR];
  });
  const darker = typeof color === 'function' ? (x, y, z) => mulc(color(x, y, z), 0.75) : mulc(color || [1, 1, 1], 0.75);
  const under = { color: darker, emissive };
  for (let i = 0; i < segs; i++) {
    const u0 = uOf(i), u1 = u0 + 1 / pw;
    // downward facing (reverse winding of the up-facing annulus)
    if (hub <= 0.01) {
      b.tri(rim[i], inner[i], rim[i + 1], [u0, 0.05], [(u0 + u1) / 2, 0.08], [u1, 0.05], under, [0, -1, 0]);
    } else {
      b.tri(rim[i], inner[i + 1], rim[i + 1], [u0, 0.05], [u1, 0.08], [u1, 0.05], under, [0, -1, 0]);
      b.tri(rim[i], inner[i], inner[i + 1], [u0, 0.05], [u0, 0.08], [u1, 0.08], under, [0, -1, 0]);
    }
  }
}

/** Stem: frustum stack, each face maps the whole 16x16 stem texture (gill fringe at the top, dark foot at the bottom). */
function stem(b, rings, segs, { color, emissive, rot0 = 0 } = {}) {
  const P = rings.map(([yy, rr]) => {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const a = rot0 + (i / segs) * TAU;
      pts.push([Math.sin(a) * rr, yy, Math.cos(a) * rr]);
    }
    return pts;
  });
  const y0 = rings[0][0], y1 = rings[rings.length - 1][0];
  const o = { color, emissive };
  for (let k = 0; k < rings.length - 1; k++) {
    const v0 = (rings[k][0] - y0) / (y1 - y0), v1 = (rings[k + 1][0] - y0) / (y1 - y0);
    for (let i = 0; i < segs; i++) {
      const BL = P[k][i], BR = P[k][i + 1], TR = P[k + 1][i + 1], TL = P[k + 1][i];
      const a = rot0 + ((i + 0.5) / segs) * TAU;
      const n = [Math.sin(a), 0, Math.cos(a)];
      b.tri(BL, BR, TR, [0, v0], [1, v0], [1, v1], o, [n, n, n]);
      b.tri(BL, TR, TL, [0, v0], [1, v1], [0, v1], o, [n, n, n]);
    }
  }
}

const DOME = [[1, 0], [0.9, 0.3], [0.62, 0.68], [0.28, 0.93], [0, 1]];

const HEIGHTS = { s: 5.2, m: 6.6, l: 8.0 };

/** Giant decor mushroom 5-8 tall: cream stem, huge spotted cap that glows softly. */
export function giantMushroom(kit, { x, z, rot = 0, scale = 1, y, size }) {
  const r = kit.rng(x, z, 163);
  // size: 's' | 'm' | 'l', a multiplier of the default height (<= 3, e.g. 1.2) or an absolute height (> 3)
  const H = clamp(HEIGHTS[size] || (typeof size === 'number' && Number.isFinite(size) ? (size <= 3 ? 6.6 * size : size) : 6.6), 3.5, 13);
  const k = H / 6.6;
  kit.at(x, z, { rot, scale, y }, () => {
    const Hs = H * 0.6;
    const rs = 0.85 * k;
    stem(kit.b('mushroom_stem'), [[-0.3, rs * 1.45], [0.5 * k, rs * 1.15], [Hs * 0.55, rs * 0.95], [Hs, rs * 0.85]], 6, {
      color: shade(-0.3, [0.7, 0.66, 0.78], Hs, [1.14, 1.08, 1.1], 0.03), emissive: 0.4, rot0: r.float(0, 1),
    });
    const Rc = 3.3 * k * r.float(0.94, 1.08), Hc = H * 0.42;
    const capB = kit.b('mushroom_cap');
    const tint = r.pick([[1.0, 1.0, 1.05], [1.12, 0.94, 1.12], [0.94, 1.08, 1.12]]);
    cap(capB, Hs - Hc * 0.12, Rc, Hc, 8, DOME, {
      color: shade(Hs - 0.5, mulc(tint, 0.78), Hs + Hc, mulc(tint, 1.1), 0.04), emissive: 0.35, rot0: r.float(0, 1), pw: 2,
    });
    // glowing blotches on the dome (additive soft discs lying on the surface)
    const glowB = kit.b('sun_glow', { mode: 'add' });
    const nS = 6;
    const a0 = r.float(0, TAU);
    for (let i = 0; i < nS; i++) {
      const a = a0 + (i / nS) * TAU + r.float(-0.3, 0.3);
      const t = r.float(0.35, 0.8);                       // 0 = rim ... 1 = crown
      const rf = lerp(0.9, 0.3, t), yf = lerp(0.3, 0.93, t);
      const px = Math.sin(a) * Rc * rf, pz = Math.cos(a) * Rc * rf, py = Hs - Hc * 0.12 + Hc * yf;
      const n = norm3([Math.sin(a) * 0.55, 0.8 + t * 0.4, Math.cos(a) * 0.55]);
      const up = Math.abs(n[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
      const t1 = norm3([n[1] * up[2] - n[2] * up[1], n[2] * up[0] - n[0] * up[2], n[0] * up[1] - n[1] * up[0]]);
      const t2 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
      const s = r.float(0.55, 0.9) * k, off = 0.14;
      const C = [px + n[0] * off, py + n[1] * off, pz + n[2] * off];
      const q = (a1, b1) => [C[0] + t1[0] * a1 + t2[0] * b1, C[1] + t1[1] * a1 + t2[1] * b1, C[2] + t1[2] * a1 + t2[2] * b1];
      glowB.quad(q(-s, -s), q(s, -s), q(s, s), q(-s, s), { uv: [0, 0, 1, 1], emissive: 1, color: [0.5, 0.95, 0.85] }, [n, n, n, n]);
    }
    kit.glow(0, Hs + Hc * 0.5, 0, { color: [0.5, 1.0, 0.85], size: 6.5 * k, pool: 5 * k, flicker: 0.06 });
    kit.emitter(0, Hs + Hc * 0.9, 0, { kind: 'sparkle', rate: 1.6, radius: Rc * 0.6 });
    kit.cyl(0, 0, rs * 1.2, 0, Hs);
    kit.caster(0, 0, Rc * 0.55, H * 0.9, 0.35);
  });
}

/** Cluster of small glowing toadstools. */
export function mushroomCluster(kit, { x, z, rot = 0, scale = 1, y, count }) {
  count = int(count, 5, 1, 10);
  const r = kit.rng(x, z, 167);
  kit.at(x, z, { rot, scale, y }, () => {
    const stemB = kit.b('mushroom_stem');
    const capB = kit.b('mushroom_cap');
    const tints = [[1.0, 1.0, 1.05], [1.22, 0.86, 1.14], [0.88, 1.12, 1.2]];
    for (let i = 0; i < count; i++) {
      const a = r.float(0, TAU), d = i === 0 ? 0 : r.float(0.6, 1.5) * Math.sqrt(count / 5);
      const px = Math.cos(a) * d, pz = Math.sin(a) * d;
      const hs = r.float(0.6, 1.4) * (i === 0 ? 1.25 : 1), Rc = r.float(0.45, 0.8) * (i === 0 ? 1.25 : 1);
      const rs = Rc * 0.28;
      const tint = tints[i % tints.length];
      const lean = r.float(-0.12, 0.12);
      // build in a shifted / leaning frame (all builders share kit.xf)
      kit.xf.push().translate(px, 0, pz).rotateZ(lean);
      stem(stemB, [[-0.15, rs * 1.3], [hs, rs * 0.9]], 5, { color: shade(0, [0.72, 0.68, 0.8], hs, [1.14, 1.08, 1.1], 0.03), emissive: 0.45, rot0: r.float(0, 1) });
      cap(capB, hs - Rc * 0.15, Rc, Rc * 0.8, 6, [[1, 0], [0.7, 0.62], [0, 1]], {
        color: shade(hs - 0.2, mulc(tint, 0.85), hs + Rc * 0.8, mulc(tint, 1.18), 0.03), emissive: 0.6, rot0: r.float(0, 1), pw: 2, hub: 0, gillsUnder: 0.22,
      });
      kit.xf.pop();
    }
    kit.glow(0, 0.9, 0, { color: [0.5, 1.0, 0.85], size: 3.8, pool: 2.8, flicker: 0.06 });
    kit.emitter(0, 1.0, 0, { kind: 'firefly', rate: 0.8, radius: 1.4 });
    kit.caster(0, 0, 1.0, 1.2, 0.15);
  });
}

export const FUNGI = {
  giant_mushroom: { fn: giantMushroom, size: 8, note: 'giant decor mushroom 5-8 tall (size s|m|l, a multiplier such as 1.2, or an absolute height > 3): glowing cap, walk under it', defaults: { size: 'm' }, anchors: { cap: [0, 5.2, 0] } },
  mushroom_cluster: { fn: mushroomCluster, size: 4, note: 'cluster of small glowing toadstools; count', defaults: { count: 5 } },
};
