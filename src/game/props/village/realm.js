// The homeworld's furniture: realm_door (the stone doorway of a realm's portal).
import { PI, vgrad, grid, planar, arcPt, frustum, archUnit, mulc, mixc } from './common.js';

const VIOLET = [0.66, 0.46, 1.0];

// ---------------------------------------------------------------------------------------------------------------
// realm_door : a doorway of dressed stone with a swirl of light in its opening (the light itself is the 'realm_portal' model, put there by the PortalSystem).
// Local +Z = front (the side the hero comes from). The opening is 5.2 wide: straight sides up to y = 3.4, then a semicircular arch to y = 6.0. A low dais of flagstone runs out
// to z = +6, with a rune plate on it and a banner on each pillar in the door's colour. `sealed` (a realm that still sleeps) dims the trim, greys the banners and shuts the opening
// with a slab of stone.
// ---------------------------------------------------------------------------------------------------------------
export function realmDoor(kit, p) {
  const { x, z, rot = 0, scale = 1, y, color = VIOLET, sealed = false } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const W = 5.2, D = 1.2, a = 2.6, ys = 3.4, Yt = 7.0, n = 10, prud = 0.14, ringW = 0.8, base = -0.7;
    const Dr = D + prud;
    const st = kit.b('brick');
    const so = { tile: 3.2, emissive: 0.22 };
    const tint = vgrad(0, [0.86, 0.84, 0.94], 6, [1.06, 1.03, 1.12]);
    const trim = sealed ? mulc(mixc(color, [0.55, 0.6, 0.75], 0.6), 0.5) : color;          // the glow along the arch and on the plaques
    const Y = [0, 1, 0];
    const glowB = kit.b(null);

    // the pillars' faces (front and back), in two courses
    for (const sg of [1, -1]) {
      const zf = sg * D, uA = [sg, 0, 0];
      const P = (px, py) => [sg * px, py, zf];
      for (const sx of [-1, 1]) {
        const x0 = sx > 0 ? a : -W, x1 = sx > 0 ? W : -a;
        for (const [y0, y1] of [[base, ys], [ys, Yt]]) {
          planar(st, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], uA, Y, { ...so, color: tint });
        }
      }
    }
    archUnit(kit, { a, ys, Yt, D, n, prud, ringW, tex: 'brick', tint: [1, 0.98, 1.06], emissive: 0.22, glow: true, glowColor: trim, tunnel: false });
    // outer side faces
    grid(st, [W, base, D], [0, 0, -2 * D], [0, Yt - base, 0], 1, 3, { ...so, color: tint });
    grid(st, [-W, base, -D], [0, 0, 2 * D], [0, Yt - base, 0], 1, 3, { ...so, color: tint });
    // the tunnel: side walls + the underside of the arch
    const inner = vgrad(0, [0.7, 0.68, 0.8], ys, [0.95, 0.93, 1.05]);
    grid(st, [-a, 0, Dr], [0, 0, -2 * Dr], [0, ys, 0], 1, 2, { ...so, color: inner });
    grid(st, [a, 0, -Dr], [0, 0, 2 * Dr], [0, ys, 0], 1, 2, { ...so, color: inner });
    for (let i = 0; i < n; i++) {
      const th = (k) => PI - (k * PI) / n;
      const q0 = arcPt(0, ys, a, th(i)), q1 = arcPt(0, ys, a, th(i + 1));
      planar(st, [[q1[0], q1[1], Dr], [q0[0], q0[1], Dr], [q0[0], q0[1], -Dr], [q1[0], q1[1], -Dr]], [0, 0, 1], [1, 0, 0], { ...so, color: [0.62, 0.6, 0.74] });
    }
    // cornice slab + cap
    kit.b('brick').box(0, Yt + 0.22, 0, 2 * (W + 0.35), 0.44, 2 * (D + 0.4), { tile: 3.2, color: [1.0, 0.98, 1.08], emissive: 0.22, faces: ['+z', '-z', '+x', '-x', '-y'] });
    kit.b('flagstone').box(0, Yt + 0.22, 0, 2 * (W + 0.35), 0.44, 2 * (D + 0.4), { tile: 3.2, color: [1.0, 0.98, 1.08], emissive: 0.22, faces: ['+y'] });
    // a pinnacle over each pillar
    for (const sx of [-1, 1]) {
      kit.xf.push().translate(sx * (a + W) / 2, Yt + 0.44, 0);
      kit.b('roof_teal').cyl(1.35, 0.0, 3.0, 8, { tile: 3.0, smooth: false, uWrap: 5, emissive: 0.16, color: vgrad(0, [0.85, 0.85, 0.95], 3.0, [1.1, 1.1, 1.15]) });
      kit.xf.translate(0, 3.0, 0);
      kit.b('metal_brass').sphere(0.3, 6, 3, { tile: 1.6, emissive: 0.4, smooth: false });
      kit.xf.pop();
    }
    // a banner on each pillar (front and back), in the door's colour
    const bn = kit.b('banner', { double: true });
    const tone = sealed ? [0.5, 0.52, 0.62] : [color[0] * 0.95 + 0.1, color[1] * 0.95 + 0.1, color[2] * 0.95 + 0.1];
    for (const sx of [-1, 1]) for (const sg of [1, -1]) {
      const cx = sx * (a + W) / 2, zz = sg * (D + 0.07), hw = 0.62;
      bn.quad([cx - sg * hw, 1.5, zz], [cx + sg * hw, 1.5, zz], [cx + sg * hw, 5.3, zz], [cx - sg * hw, 5.3, zz], { uv: [0, 0, 1, 1], emissive: 0.5, color: tone });
    }
    // rune plaques on the pillars (front and back)
    const rb = kit.b('rune_ring');
    for (const sg of [1, -1]) for (const sx of [-1, 1]) {
      const s = 0.55, cx = sx * (a + W) / 2, zz = sg * (D + 0.05), py = 6.2;
      const a0 = [cx - sg * s, py - s, zz], b0 = [cx + sg * s, py - s, zz];
      rb.quad(a0, b0, [b0[0], py + s, zz], [a0[0], py + s, zz], { uv: [0, 0, 1, 1], emissive: 0.85, color: sealed ? [0.6, 0.62, 0.75] : [0.95, 0.9, 1.0] });
    }
    // the glowing inner edges of the pillars
    {
      const xr = a - 0.07;
      glowB.quad([xr, 0.3, -0.2], [xr, 0.3, 0.2], [xr, ys - 0.2, 0.2], [xr, ys - 0.2, -0.2], { color: trim, emissive: 1 });
      glowB.quad([-xr, 0.3, 0.2], [-xr, 0.3, -0.2], [-xr, ys - 0.2, -0.2], [-xr, ys - 0.2, 0.2], { color: trim, emissive: 1 });
    }
    // the dais: flagstone, a brick plinth round it, a rune plate in front of the opening
    const dz0 = -1.4, dz1 = 6.0, dh = 0.3, dw = 5.4;
    kit.b('flagstone').quad([-dw, dh, dz1], [dw, dh, dz1], [dw, dh, dz0], [-dw, dh, dz0], { tile: 3.2, color: [1.02, 1.0, 1.1], emissive: 0.22 });
    for (const [O, U] of [
      [[-dw, base, dz1], [2 * dw, 0, 0]], [[dw, base, dz0], [-2 * dw, 0, 0]],
      [[dw, base, dz1], [0, 0, -(dz1 - dz0)]], [[-dw, base, dz0], [0, 0, dz1 - dz0]],
    ]) grid(kit.b('brick'), O, U, [0, dh - base, 0], 3, 1, { tile: 3.2, color: vgrad(base, [0.6, 0.58, 0.68], dh, [0.98, 0.96, 1.06]), emissive: 0.2 });
    const rh = 1.8, rz = 3.5;
    kit.b('brick').box(0, dh + 0.05, rz, 2 * rh, 0.1, 2 * rh, { tile: 3.2, color: [0.9, 0.88, 1.0], emissive: 0.2 });
    kit.b('rune_ring', { mode: 'add', decal: true }).disc(rh * 0.98, 32, { y: dh + 0.11, uvDisc: true, emissive: 1, color: sealed ? [0.5, 0.52, 0.65] : [0.8, 0.76, 0.95] });          // (the ring of runes is light laid on the flagstone: a disc, not a dark square plate)
    // a sleeping door is shut with a slab of dark stone (it fills the opening; its face carries the dormant light)
    if (sealed) {
      const sl = kit.b('tower_stone');
      sl.box(0, ys * 0.5, 0, 2 * a - 0.1, ys, 0.5, { tile: 3.0, color: [0.8, 0.8, 0.95], emissive: 0.2, faces: ['+z', '-z'] });
    }
    // light and colliders
    kit.glow(0, ys + 0.6, 1.8, { color: sealed ? [0.5, 0.55, 0.75] : color, size: sealed ? 6 : 9, pool: sealed ? 3 : 6.5 });
    for (const sx of [-1, 1]) {
      kit.box(sx * (a + W) / 2, 0, (W - a) / 2, D, -1, Yt + 0.5, { tag: 'door' });
      kit.caster(sx * (a + W) / 2, 0, 1.7, 8, 0.45);
    }
    kit.box(0, 0, a, D, ys + a * 0.7, Yt + 0.5, { tag: 'lintel' });
    if (sealed) kit.box(0, 0, a, 0.4, -1, ys + a * 0.7, { tag: 'seal' });
    kit.box(0, (dz0 + dz1) / 2, dw, (dz1 - dz0) / 2, -1, dh, { top: true, tag: 'dais' });
    kit.caster(0, 0, 2.2, 6.5, 0.3);
  });
}

export const REALM = {
  realm_door: {
    fn: realmDoor, size: 12, defaults: { sealed: false },
    note: 'Doorway of a realm\'s portal: dressed-stone pillars (opening 5.2 wide, straight sides to y=3.4, semicircular arch to y=6.0, block top y=7.0, pinnacles to ~10), a banner per pillar in param color [r,g,b] (the trim glows in it too), a flagstone dais (top y=0.3, walkable, 10.8 wide) running to z=+6 with a rune plate at z=3.5. Front = +Z. The swirl of light is the realm_portal model (shape arch, r 2.6, hs 3.1) centred on anchors.portal = [0,3.4,0]. param sealed:true dims it all and fills the opening with a slab of stone (a collider).',
    anchors: { portal: [0, 3.4, 0], front: [0, 0.3, 3.5, 0] },
  },
};

void frustum;
