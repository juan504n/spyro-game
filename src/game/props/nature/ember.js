// Props of the burnt country (Emberfall Crags): columns of basalt, the stone dragon's Maw that guards the mountain, a vent in the ground that smokes and glows, a dead tree, the great stone Anvil.
import { lump, tube, shade, num, int, sizeK, TAU, lerp } from './util.js';

/** the colour a basalt face takes at a height: black at the foot, a lighter brown up the shaft */
const basalt = (h) => shade(0, [0.66, 0.6, 0.58], h, [1.12, 1.04, 0.98], 0.05);

/**
 * Columns of basalt like a giant's causeway: hexagonal prisms of one width standing shoulder to shoulder, tallest in the middle, some missing. ORIGIN = the ground at the middle of the cluster.
 * `rings` = how many rings of columns round the middle one, `h` the height of the tallest, `r` the radius of one column.
 */
export function basaltColumns(kit, { x, z, rot = 0, scale = 1, y, rings, h, r: R }) {
  rings = int(rings, 2, 1, 3); h = num(h, 4.5, 1.5, 12); R = num(R, 0.95, 0.5, 1.6);
  const rng = kit.rng(x, z, 311), step = R * 1.76;                   // (hexagons of radius R touch at centres 1.73 R apart; a hair more leaves the seams dark)
  kit.at(x, z, { rot, scale, y }, () => {
    const b = kit.b('cliff_basalt');
    for (let q = -rings; q <= rings; q++) {
      for (let s = -rings; s <= rings; s++) {
        if (Math.abs(q + s) > rings) continue;
        const d = (Math.abs(q) + Math.abs(s) + Math.abs(q + s)) / 2;
        if (d > 0 && rng.chance(0.22)) continue;                         // (a gap here and there)
        const cx = step * (q + s / 2), cz = step * s * 0.866;
        const hh = Math.max(0.7, h * (1 - 0.34 * (d / rings)) * rng.float(0.55, 1.0));
        const top = [], bot = [];
        const a0 = rng.float(0, 1);
        for (let i = 0; i < 6; i++) {
          const a = a0 + (i / 6) * TAU, rr = R * rng.float(0.94, 1.0);
          bot.push([cx + Math.sin(a) * rr, -0.7, cz + Math.cos(a) * rr]);
          top.push([cx + Math.sin(a) * rr, hh + rng.float(-0.14, 0.14), cz + Math.cos(a) * rr]);
        }
        const o = { color: basalt(hh), tile: 3 };
        for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; b.quad(bot[i], bot[j], top[j], top[i], o); }
        const mid = [cx, hh + rng.float(-0.1, 0.2), cz];
        for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; b.tri(mid, top[j], top[i], [mid[0] / 3, mid[2] / 3], [top[j][0] / 3, top[j][2] / 3], [top[i][0] / 3, top[i][2] / 3], { color: shade(0, [0.9, 0.84, 0.8], hh, [1.2, 1.12, 1.06], 0.04) }); }
        kit.cyl(cx, cz, R * 0.9, 0, hh, { top: hh < 1.4 });
        kit.caster(cx, cz, R * 0.9, hh, 0.35);
      }
    }
  });
}

/**
 * The Maw: the head of a stone dragon cut into a cliff, its mouth the mouth of a cave. ORIGIN = the ground in the middle of the mouth, local +z = the way out (towards whoever comes to it), the cave
 * runs towards -z. The mouth is 6.4 m wide and 6.4 m high (the width of the tunnel behind it and of the ward that shuts it: `anchors.barrier`), its upper teeth hang into it, its lower teeth stand either
 * side of the way in, two eyes burn over it and two horns sweep back over the cliff. Solid everywhere but the mouth.
 */
export function dragonMaw(kit, { x, z, rot = 0, scale = 1, y }) {
  const rng = kit.rng(x, z, 312);
  kit.at(x, z, { rot, scale, y }, () => {
    const b = kit.b('cliff_basalt'), t = (hgt) => basalt(hgt);
    // the arch of the mouth: two posts and a half round, one stone tube swept along them (the opening inside it is 6.4 wide and 6.4 high)
    const R0 = 4.4, cy = 3.2, arch = [[-R0, -0.6, 0.4], [-R0, cy, 0.4]];
    for (let i = 1; i < 12; i++) { const a = Math.PI - (i / 12) * Math.PI; arch.push([Math.cos(a) * R0, cy + Math.sin(a) * R0, 0.4]); }
    arch.push([R0, cy, 0.4], [R0, -0.6, 0.4]);
    tube(b, arch, 1.25, { segs: 7, tile: 3, color: t(6), smooth: 1 });
    // the skull over it and the cheeks beside it: lumps of the same stone, merging into the cliff behind
    const skull = [
      { c: [0, 9.2, -0.2], r: 5.4, sx: 1.55, sy: 0.72, sz: 0.95 },
      { c: [-6.6, 4.4, -0.4], r: 3.3, sx: 1, sy: 1.3, sz: 1 }, { c: [6.6, 4.4, -0.4], r: 3.3, sx: 1, sy: 1.3, sz: 1 },
      { c: [-3.6, 8.8, 1.7], r: 1.8, sx: 1.3, sy: 0.7, sz: 1 }, { c: [3.6, 8.8, 1.7], r: 1.8, sx: 1.3, sy: 0.7, sz: 1 },      // the brow ridges over the eyes
    ];
    for (const s of skull) lump(b, rng, s.c, s.r, { detail: 'o1', noise: 0.16, sx: s.sx, sy: s.sy, sz: s.sz, tile: 3, smooth: 0.35, floorY: -0.6, skipDown: 0.2, color: t(s.c[1] + s.r) });
    // teeth: the upper ones hang from the arch into the mouth, the lower ones stand outside the posts and point up and forward
    const fang = (base, tip, w) => {
      const dx = tip[0] - base[0], dy = tip[1] - base[1], dz = tip[2] - base[2], L = Math.hypot(dx, dy, dz) || 1;
      const n = [dy / L, -dx / L, 0], k = w / 2;
      const A = [base[0] - n[0] * k, base[1] - n[1] * k, base[2] - k], B = [base[0] + n[0] * k, base[1] + n[1] * k, base[2] - k];
      const C = [base[0] + n[0] * k, base[1] + n[1] * k, base[2] + k], D = [base[0] - n[0] * k, base[1] - n[1] * k, base[2] + k];
      const o = { color: [1.2, 1.12, 1.02], tile: 2 };
      b.tri(A, B, tip, [0, 0], [1, 0], [0.5, 2], o); b.tri(B, C, tip, [0, 0], [1, 0], [0.5, 2], o); b.tri(C, D, tip, [0, 0], [1, 0], [0.5, 2], o); b.tri(D, A, tip, [0, 0], [1, 0], [0.5, 2], o);
    };
    for (let i = 1; i < 8; i++) {
      const a = Math.PI - (i / 8) * Math.PI, px = Math.cos(a) * (R0 - 1.0), py = cy + Math.sin(a) * (R0 - 1.0), L = rng.float(0.9, 1.6) * (1.0 - Math.abs(i - 4) * 0.08);
      fang([px, py, 0.5], [px * 0.96, py - L, 0.9], 0.5);
    }
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
      const fx = sd * (5.0 + i * 1.5), L = rng.float(1.5, 2.6) * (1 - i * 0.12);
      fang([fx, -0.5, 2.2 + i * 0.5], [fx + sd * 0.15, L, 2.6 + i * 0.5], 0.8);
    }
    // the horns: two tubes sweeping up and back over the cliff
    for (const sd of [-1, 1]) {
      tube(b, [[sd * 5.4, 9.2, 0], [sd * 6.4, 11.4, -0.8], [sd * 6.0, 14.2, -2.4], [sd * 4.4, 16.4, -4.4]], [0.95, 0.72, 0.44, 0.05], { segs: 6, tile: 3, color: t(14) });
    }
    // solid: the cheeks and posts either side, the brow over the mouth (the mouth itself stays clear: 6.4 m)
    kit.box(-5.9, 0.4, 2.0, 1.8, -0.6, 11);
    kit.box(5.9, 0.4, 2.0, 1.8, -0.6, 11);
    kit.box(0, 0.2, 5.8, 1.6, 6.3, 11);
    kit.caster(0, 0, 7, 12, 0.4);
    // the eyes burn, and the mouth glows with what is behind it
    for (const sd of [-1, 1]) kit.glow(sd * 3.6, 8.6, 3.0, { color: [1.0, 0.5, 0.14], size: 3.4, pool: 0, flicker: 0.15 });
    kit.glow(0, 2.6, 1.5, { color: [1.0, 0.45, 0.14], size: 7, pool: 9, flicker: 0.22, lightR: 14, lightK: 0.55 });
    kit.emitter(0, 1.4, 0.5, { kind: 'ember', rate: 3, radius: 2.4 });
  });
}

/**
 * A vent: a crack in the ground that glows and smokes, with a lip of black rock round it. ORIGIN = the ground at its middle. A little light on the ground round it, embers rising and a thread of
 * smoke. (Harmless: it is a crack, not a pool: lava pools are the Ember Rift's.)
 */
export function emberVent(kit, { x, z, rot = 0, scale = 1, y }) {
  const rng = kit.rng(x, z, 313);
  kit.at(x, z, { rot, scale, y }, () => {
    const rock = kit.b('cliff_basalt'), lava = kit.b('lava');
    const n = 9, a = 1.5 * rng.float(0.9, 1.15), bb = 0.42, pts = [];
    for (let i = 0; i < n; i++) { const ang = (i / n) * TAU; pts.push([Math.cos(ang) * a * rng.float(0.88, 1.06), 0.14, Math.sin(ang) * bb * rng.float(0.85, 1.1)]); }
    const c = [0, 0.1, 0];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; lava.tri(c, pts[j], pts[i], [0.5, 0.5], [0.5 + pts[j][0] / 3, 0.5 + pts[j][2] / 3], [0.5 + pts[i][0] / 3, 0.5 + pts[i][2] / 3], { emissive: 1, color: [1.0, 0.9, 0.7] }, [0, 1, 0]); }
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + rng.float(-0.2, 0.2), d = a * 1.2 * (0.8 + 0.4 * Math.abs(Math.cos(ang)));
      lump(rock, rng, [Math.cos(ang) * d, 0.1, Math.sin(ang) * d * 0.55], rng.float(0.38, 0.62), { detail: 'o1', noise: 0.25, sy: 0.7, tile: 2, smooth: 0.2, floorY: 0, skipDown: 0.05, color: [0.7, 0.64, 0.62] });
    }
    kit.glow(0, 0.4, 0, { color: [1.0, 0.5, 0.16], size: 4.6, pool: 5.5, flicker: 0.3, lightR: 8, lightK: 0.5 });
    kit.emitter(0, 0.3, 0, { kind: 'ember', rate: 3.5, radius: 0.6 });
    kit.emitter(0, 0.7, 0, { kind: 'smoke', rate: 0.7, radius: 0.3 });
    kit.caster(0, 0, 1.2, 0.5, 0.2);
  });
}

/**
 * A dead tree: a charred trunk with a few bare branches forking off it, black with a smoulder at the tips. ORIGIN = the ground at its foot. `size` s/m/l or a factor.
 */
export function deadTree(kit, { x, z, rot = 0, scale = 1, y, size }) {
  size = sizeK(size);
  const rng = kit.rng(x, z, 314), H = rng.float(4.4, 6.6) * size;
  kit.at(x, z, { rot, scale, y }, () => {
    const bark = kit.b('bark'), col = (hh) => shade(0, [0.34, 0.3, 0.3], hh, [0.62, 0.52, 0.48], 0.05);
    const lx = rng.float(-0.55, 0.55), lz = rng.float(-0.55, 0.55);
    const trunk = [[0, -0.6, 0], [lx * 0.3, H * 0.3, lz * 0.3], [lx * 0.8, H * 0.65, lz * 0.8], [lx, H, lz]];
    tube(bark, trunk, [0.52 * size, 0.38 * size, 0.24 * size, 0.07], { segs: 6, tile: 3, color: col(H), capEnd: 'point', capLen: 0.5 });
    const at = (t) => { const f = t * (trunk.length - 1), i = Math.min(trunk.length - 2, Math.floor(f)), u = f - i; return [lerp(trunk[i][0], trunk[i + 1][0], u), lerp(trunk[i][1], trunk[i + 1][1], u), lerp(trunk[i][2], trunk[i + 1][2], u)]; };
    const nb = rng.int(3, 6);
    for (let i = 0; i < nb; i++) {
      const t = rng.float(0.38, 0.92), p = at(t), ang = rng.float(0, TAU) + i * 1.9, len = rng.float(1.5, 2.9) * size * (1.15 - t * 0.55);
      const p1 = [p[0] + Math.cos(ang) * len * 0.5, p[1] + len * 0.5, p[2] + Math.sin(ang) * len * 0.5], p2 = [p[0] + Math.cos(ang) * len, p[1] + len * 0.95, p[2] + Math.sin(ang) * len];
      tube(bark, [p, p1, p2], [0.2 * size, 0.12 * size, 0.03], { segs: 4, tile: 3, color: col(H), capEnd: 'point', capLen: 0.35 });
      if (rng.chance(0.6)) { const q = [lerp(p1[0], p2[0], 0.4), lerp(p1[1], p2[1], 0.4), lerp(p1[2], p2[2], 0.4)]; tube(bark, [q, [q[0] - Math.sin(ang) * len * 0.4, q[1] + len * 0.4, q[2] + Math.cos(ang) * len * 0.4]], [0.07 * size, 0.02], { segs: 3, tile: 3, color: col(H) }); }
    }
    kit.caster(0, 0, 0.6, H * 0.8, 0.28);
    kit.cyl(0, 0, 0.55 * size, 0, H * 0.7);
  });
}

/**
 * The Anvil: a block of basalt in the shape of a smith's anvil, 9 m long, standing on the plateau that is named for it; a horn at one end, a crack of ember along the face. ORIGIN = the ground at
 * the middle of its foot, the horn points towards +x.
 */
export function giantAnvil(kit, { x, z, rot = 0, scale = 1, y }) {
  kit.at(x, z, { rot, scale, y }, () => {
    const b = kit.b('cliff_basalt'), o = (hh) => ({ color: basalt(hh), tile: 3 });
    b.box(0, 0.9, 0, 4.6, 2.2, 2.8, o(2));              // the foot
    b.box(0, 2.6, 0, 3.0, 1.6, 2.0, o(3.4));            // the waist
    b.box(-0.4, 4.0, 0, 8.6, 1.5, 3.4, o(4.8));         // the face
    b.push(); b.translate(3.9, 4.25, 0); b.rotateZ(-Math.PI / 2); b.cone(1.0, 3.6, 7, { color: basalt(4.8), tile: 3 }); b.pop();      // the horn
    b.box(-4.9, 4.35, 0, 0.7, 0.9, 2.2, o(5));          // the heel of the face
    const lava = kit.b('lava');
    lava.quad([-3.4, 4.78, 0.5], [3.0, 4.78, 0.5], [3.0, 4.78, -0.5], [-3.4, 4.78, -0.5], { emissive: 1, color: [1.0, 0.85, 0.6], tile: 2 });       // the crack of ember along the face
    kit.box(0, 0, 2.3, 1.4, -0.4, 3.4);
    kit.box(-0.4, 0, 4.3, 1.7, 3.3, 4.8);
    kit.caster(0, 0, 4, 5, 0.4);
    kit.glow(0, 5.0, 0, { color: [1.0, 0.5, 0.16], size: 5, pool: 6, flicker: 0.2 });
  });
}

export const EMBER = {
  basalt_columns: { fn: basaltColumns, size: 8, note: 'columns of basalt like a giant\'s causeway: hexagonal prisms shoulder to shoulder, tallest in the middle (rings 1-3, h 1.5-12, r 0.5-1.6)', defaults: { rings: 2, h: 4.5 } },
  dragon_maw: { fn: dragonMaw, size: 14, note: 'the head of a stone dragon cut into a cliff, its mouth (6.4 x 6.4 m) the mouth of a cave; local +z = the way out; anchors.barrier = the middle of the mouth, on the ground', defaults: {}, anchors: { barrier: [0, 0, 0.4] } },
  ember_vent: { fn: emberVent, size: 3, note: 'a crack in the ground that glows and smokes, a lip of black rock round it (harmless)', defaults: {} },
  dead_tree: { fn: deadTree, size: 5, note: 'a charred dead tree with a few bare branches (size s|m|l or a factor)', defaults: { size: 'm' } },
  giant_anvil: { fn: giantAnvil, size: 9, note: 'a block of basalt in the shape of a smith\'s anvil, 9 m long, horn towards +x, a crack of ember along its face', defaults: {} },
};
