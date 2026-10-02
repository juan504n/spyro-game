// Skyweaver Spires' own props: the slabs of rock that hang in the air (to hop across the cloud), puffs of cloud on the sea, a vane that turns in the wind, the walled vault, and the Loom, the tower at
// the heart of the world. All of them are made of the realm's marble and sage turf through the skin (kit.skin: `cliff` and `moss` are remapped), and none of them looks at the terrain's shadow map where
// it floats (unshadowed): the ground far below them would smear dark streaks over their tops.
import { lump, lumps, num, int, TAU, shade, unshadowed, clamp } from './util.js';

/**
 * A slab of marble hanging in the air: a flat top with a turf of sage on it, 1 m of stone under it that tapers to a point. ORIGIN = the middle of the top, so `y` is the height the hero stands at.
 * `r` is the radius of the top (2 m by default: a hop's landing). A cylinder collider holds the hero on it.
 */
export function skySlab(kit, { x, z, rot = 0, scale = 1, y, r }) {
  r = num(r, 2.0, 1.2, 5);
  const rng = kit.rng(x, z, 811);
  kit.at(x, z, { rot, scale, y }, () => unshadowed(kit, () => {
    const rock = kit.b('cliff'), turf = kit.b('moss');
    const col = shade(-3.2, [0.62, 0.64, 0.8], 0, [1.04, 1.0, 0.98], 0.04);
    // the stone: a squat bowl whose rim is a hair over the top, the underside tapering to a point
    rock.lathe([[0, -3.1], [r * 0.18, -2.6], [r * 0.52, -1.5], [r * 0.9, -0.45], [r * 1.02, -0.12], [r, 0]], 9, { tile: 3, color: col, rot: rng.float(0, TAU) });
    const top = (kit.skin && kit.skin.palettes && kit.skin.palettes.mossTop) || [0.9, 1.0, 0.9];
    turf.disc(r * 0.99, 9, { y: 0.02, tile: 3.5, color: top });
    kit.cyl(0, 0, r * 0.97, -1.0, 0, { top: true });
    kit.caster(0, 0, r, 0.4, 0.15);
  }));
}

/**
 * A puff of cloud on the sea: a cluster of white lumps with flat bottoms, lit from within (they are cloud, not rock). ORIGIN = the waterline (pass `y: 0`: the ground far below is no height for it). Not solid:
 * a hero who falls into it falls through. `r` is the size of the cluster, `count` how many lumps.
 */
export function cloudPuff(kit, { x, z, rot = 0, scale = 1, y, r, count }) {
  r = num(r, 4, 1.5, 12); count = int(count, 4, 1, 9);
  const rng = kit.rng(x, z, 823);
  kit.at(x, z, { rot, scale, y }, () => unshadowed(kit, () => {
    const b = kit.b('cloud_sea');
    const specs = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + rng.float(-0.4, 0.4), d = i === 0 ? 0 : r * rng.float(0.35, 0.8), rr = r * (i === 0 ? rng.float(0.5, 0.65) : rng.float(0.28, 0.5));
      specs.push({ c: [Math.cos(a) * d, rr * 0.35, Math.sin(a) * d], r: rr, sy: rng.float(0.6, 0.8), detail: 'o1', noise: 0.18, smooth: 0.65, hideK: 0.7 });
    }
    lumps(b, rng, specs, { tile: 14, floorY: 0, skipDown: 0.05, emissive: 0.55, colorFor: (s) => shade(0, [0.84, 0.88, 1.0], s.r * 1.2, [1.1, 1.1, 1.14], 0.03) });
  }));
}

/**
 * A weather vane: a pole of bronze with a ring of three cups below an arrow, the landmark of a place where the wind has stopped (the arrow points where it last blew from: `rot`). ORIGIN = the ground at
 * its foot; 8 m tall.
 */
export function windVane(kit, { x, z, rot = 0, scale = 1, y }) {
  kit.at(x, z, { rot, scale, y }, () => {
    const brass = kit.b('metal_brass'), stone = kit.b('cliff');
    stone.lathe([[1.1, 0], [0.9, 0.5], [0.6, 0.9], [0.45, 1.0]], 8, { tile: 3, color: [1.0, 0.98, 0.96] });
    brass.lathe([[0.2, 0.9], [0.14, 4], [0.1, 7.2]], 6, { tile: 2, color: [1.1, 1.0, 0.8] });
    // three cups on arms at 5.6 m (a ring that turns in a wind), a ball under the arrow
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU, ax = Math.sin(a), az = Math.cos(a);
      brass.box(ax * 0.55, 5.6, az * 0.55, 0.1 + Math.abs(ax) * 0.9, 0.08, 0.1 + Math.abs(az) * 0.9, { tile: 2, color: [1.05, 0.95, 0.75] });
      brass.at(ax * 1.15, 5.6, az * 1.15, (q) => q.sphere(0.32, 6, 4, { tile: 2, color: [1.2, 1.08, 0.8] }));
    }
    brass.at(0, 7.3, 0, (q) => q.sphere(0.3, 6, 5, { tile: 2, color: [1.3, 1.15, 0.85] }));
    // the arrow: a long flat kite pointing along +Z, two panels so that it is seen from both sides
    const a0 = [0, 7.55, 1.9], a1 = [0.4, 7.55, -1.0], a2 = [0, 7.55, -0.6], a3 = [-0.4, 7.55, -1.0];
    const o = { tile: 2, color: [1.25, 1.1, 0.8] };
    for (const [A, B, C] of [[a0, a1, a2], [a0, a2, a3]]) { brass.tri(A, B, C, [0, 0], [1, 0], [0.5, 1], o, [0, 1, 0]); brass.tri(A, C, B, [0, 0], [0.5, 1], [1, 0], o, [0, -1, 0]); }
    kit.glow(0, 7.6, 0, { color: [1.0, 0.8, 0.5], size: 1.6, pool: 0 });
    kit.cyl(0, 0, 0.8, 0, 1.0, { top: true });
    kit.cyl(0, 0, 0.22, 0, 7.3);
    kit.caster(0, 0, 0.9, 7, 0.15);
  });
}

/**
 * The walled vault of the Orchard Terrace: a courtyard (`w` by `d` metres, walls 4.6 m high) of marble with one doorway, 4.4 m wide, in the middle of its `door` side ('north' | 'south' | 'east' |
 * 'west'), the lintel over it carrying a pair of pennants. The doorway is shut by a cracked wall the layout puts across it (ctx.addWall); there is no other way in. ORIGIN = the middle of the
 * courtyard on the ground; the layout works out where the door is from `door` (vaultDoor below).
 */
export function vaultWalls(kit, { x, z, rot = 0, scale = 1, y, w, d, door }) {
  w = num(w, 14, 8, 24); d = num(d, 12, 8, 24);
  door = ['north', 'south', 'east', 'west'].includes(door) ? door : 'north';
  const H = 4.6, T = 0.6, G = 2.2;                            // wall height, half thickness, half width of the doorway
  kit.at(x, z, { rot, scale, y }, () => {
    const stone = kit.b('cliff'), cap = kit.b('flagstone');
    const col = shade(0, [0.82, 0.84, 0.92], H, [1.06, 1.02, 1.0], 0.03);
    // a straight stretch of wall from (x0, z0) to (x1, z1) (axis-aligned), with its collider
    const wall = (x0, z0, x1, z1) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = Math.abs(x1 - x0), sz = Math.abs(z1 - z0), alongX = sx > sz;
      const hx = (alongX ? sx : T * 2) / 2, hz = (alongX ? T * 2 : sz) / 2;
      if (hx < 0.05 || hz < 0.05) return;
      stone.box(cx, H / 2, cz, hx * 2, H, hz * 2, { tile: 3, color: col, faces: ['+z', '-z', '+x', '-x'] });
      cap.box(cx, H + 0.12, cz, hx * 2 + 0.3, 0.24, hz * 2 + 0.3, { tile: 3, color: [1.0, 0.98, 0.96] });
      kit.box(cx, cz, hx, hz, -0.2, H + 0.3, {});
    };
    const hw = w / 2, hd = d / 2;
    const side = (name, ax, az, bx, bz) => {
      if (name !== door) { wall(ax, az, bx, bz); return; }
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (alongX) { wall(ax, az, mx - G, mz); wall(mx + G, mz, bx, bz); } else { wall(ax, az, mx, mz - G); wall(mx, mz + G, bx, bz); }
      // the lintel over the doorway, and a pair of pillars either side
      const lx = alongX ? mx : mx, lz = mz, lw = alongX ? G * 2 + 1.2 : T * 2 + 0.4, ld = alongX ? T * 2 + 0.4 : G * 2 + 1.2;
      stone.box(lx, H + 0.1, lz, lw, 0.8, ld, { tile: 3, color: [1.04, 1.0, 0.98] });
      for (const s of [-1, 1]) stone.box(alongX ? mx + s * (G + 0.1) : mx, H / 2 + 0.3, alongX ? mz : mz + s * (G + 0.1), 0.7, H + 0.6, 0.7, { tile: 3, color: [1.06, 1.02, 1.0] });
    };
    side('north', -hw, -hd, hw, -hd);
    side('south', -hw, hd, hw, hd);
    side('west', -hw, -hd, -hw, hd);
    side('east', hw, -hd, hw, hd);
    kit.caster(0, 0, Math.max(w, d) * 0.6, H, 0.3);
  });
}

/** Where the doorway of a vault placed at (x, z) with these params is, and the way it looks out (the yaw of the cracked wall across it): [x, z, yaw] (rot 0: north is -z) */
export function vaultDoor({ x, z, w = 14, d = 12, door = 'north' }) {
  const hw = w / 2, hd = d / 2;
  if (door === 'north') return [x, z - hd, 0];
  if (door === 'south') return [x, z + hd, 0];
  if (door === 'east') return [x + hw, z, Math.PI / 2];
  return [x - hw, z, Math.PI / 2];
}

/**
 * THE LOOM: the tower at the heart of Skyweaver Spires, where the Skyweavers wove the winds. A three-stepped base of marble, a drum with six buttresses, a slender shaft of cream marble that
 * tapers as it rises, three bands of bronze, and a crown of eight threads that gather into a golden spindle whose tip burns with a light you can see from the first step of the realm. ORIGIN = the
 * ground at its foot; 40 m tall. The shaft is solid (the hero walks round it); the Loom Bell hangs at its foot, by the layout.
 */
export function loomTower(kit, { x, z, rot = 0, scale = 1, y }) {
  kit.at(x, z, { rot, scale, y }, () => {
    const stone = kit.b('cliff'), brass = kit.b('metal_brass'), cap = kit.b('flagstone');
    const col = (h) => shade(0, [0.8, 0.82, 0.92], h, [1.08, 1.04, 1.0], 0.025);
    // the base: three steps
    cap.lathe([[9.6, 0], [9.6, 0.5], [8.6, 0.5], [8.6, 1.0], [7.6, 1.0], [7.6, 1.5]], 12, { tile: 3, color: [1.0, 0.98, 0.98], smooth: false });
    // the drum with its buttresses
    stone.lathe([[6.4, 1.5], [6.2, 5.5], [5.4, 7.2], [4.0, 8.0]], 12, { tile: 3, color: col(8), smooth: false });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.26, sx = Math.sin(a), sz = Math.cos(a);
      stone.box(sx * 6.3, 3.6, sz * 6.3, 1.4, 4.4, 1.4, { tile: 3, color: col(6) });
      stone.box(sx * 5.9, 6.4, sz * 5.9, 1.0, 1.2, 1.0, { tile: 3, color: col(8) });
    }
    // the shaft: cream marble tapering from 3.8 to 2.1, with three bands of bronze
    stone.lathe([[3.9, 8.0], [3.5, 16], [2.9, 24], [2.3, 32], [2.1, 34]], 10, { tile: 3.5, color: col(34), smooth: true });
    for (const [yy, rr] of [[12.0, 3.75], [20.0, 3.2], [28.0, 2.6]]) brass.lathe([[rr + 0.25, yy - 0.6], [rr + 0.35, yy], [rr + 0.25, yy + 0.6]], 10, { tile: 2, color: [1.15, 1.04, 0.78], smooth: true });
    // the crown: eight threads rising from the shaft's top and gathering into a spindle
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, sx = Math.sin(a), sz = Math.cos(a);
      const p0 = [sx * 2.0, 34, sz * 2.0], p1 = [sx * 3.0, 37, sz * 3.0], p2 = [0, 41.5, 0];
      for (const [A, B] of [[p0, p1], [p1, p2]]) {
        const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], L = Math.hypot(dx, dy, dz), n = [dz / L, 0, -dx / L], k = 0.18;
        const q = [[A[0] - n[0] * k, A[1], A[2] - n[2] * k], [A[0] + n[0] * k, A[1], A[2] + n[2] * k], [B[0] + n[0] * k * 0.4, B[1], B[2] + n[2] * k * 0.4], [B[0] - n[0] * k * 0.4, B[1], B[2] - n[2] * k * 0.4]];
        brass.quad(q[0], q[1], q[2], q[3], { tile: 2, color: [1.25, 1.12, 0.8], double: true });
      }
    }
    brass.at(0, 36.5, 0, (q) => q.sphere(0.9, 8, 6, { tile: 2, color: [1.25, 1.12, 0.8] }));
    brass.at(0, 41, 0, (q) => q.cone(0.7, 3.2, 6, { tile: 2, color: [1.3, 1.16, 0.84] }));
    kit.glow(0, 42, 0, { color: [1.0, 0.82, 0.5], size: 9, pool: 0, flicker: 0.1 });
    kit.glow(0, 36.5, 0, { color: [1.0, 0.86, 0.6], size: 5, pool: 0, flicker: 0.05 });
    kit.cyl(0, 0, 9.4, 0, 1.4, { top: true });
    kit.cyl(0, 0, 6.0, 0, 8.2);
    kit.cyl(0, 0, 3.4, 0, 34);
    kit.caster(0, 0, 8, 38, 0.3);
    kit.emitter(0, 36, 0, { kind: 'sparkle', rate: 3, radius: 2.4 });
  });
}

export const SKY = {
  sky_slab: { fn: skySlab, size: 5, note: 'a slab of marble hanging in the air with a turf top at the origin\'s height (r = the radius of the top, 2 m): a cylinder collider to stand on; hop from one to the next', defaults: { r: 2 } },
  cloud_puff: { fn: cloudPuff, size: 8, note: 'a puff of cloud (lit white lumps, flat bottoms) on the sea: pass y: 0; not solid; r the size, count the lumps', defaults: { r: 4, count: 4 } },
  wind_vane: { fn: windVane, size: 3, note: 'a weather vane: a bronze pole 8 m tall with three cups and an arrow on a marble foot', defaults: {} },
  vault_walls: { fn: vaultWalls, size: 16, note: 'a courtyard of marble walls (w by d, 4.6 m high) with one doorway 4.4 m wide in the middle of its `door` side (north | south | east | west): shut it with a cracked wall (vaultDoor says where)', defaults: { w: 14, d: 12, door: 'north' } },
  loom_tower: { fn: loomTower, size: 20, note: 'the Loom: a marble tower 42 m tall on a three-stepped base with bronze bands and a crown of threads round a golden spindle that shines; solid; origin = the ground at its foot', defaults: {} },
};
void clamp; void lump;
