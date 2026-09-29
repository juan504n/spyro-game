// Ground structures: bridge_stone, pier, stairs, fence, wall_stone, bunting.
import {
  PI, TAU, clamp, lerp, mulc, TINT, vgrad, grid, planar, strut, polar, frustum, quadUV,
} from './common.js';
import { lampHead } from './small.js';
import { WATER_LEVEL } from '../../level.js';

// ---------------------------------------------------------------------------------------------------------------
// bridge_stone : arched stone footbridge running along local Z (centred), 5 wide, low parapets.
//   y = 0 is the bank level.  Deck rises to a crown of +1.6 in the middle.  Abutments go down to y = -5.
// ---------------------------------------------------------------------------------------------------------------
export function bridgeStone(kit, p) {
  const { x, z, rot = 0, scale = 1, len = 16 } = p;
  // origin height = the LOWER of the two bank heights sampled at the deck ends (unless y is passed), so both approaches
  // are step-free; a higher bank simply swallows its end of the deck.
  const ends = [-1, 1].map((sg) => kit.groundY(x + Math.sin(rot) * sg * (len / 2) * scale, z + Math.cos(rot) * sg * (len / 2) * scale));
  const y = p.y ?? Math.min(ends[0], ends[1]);
  kit.at(x, z, { rot, scale, y }, () => {
    const L = len, W = 2.5, wk = 1.8;                 // half widths: bridge / walkway
    const n = Math.max(6, 2 * Math.round(L / 2));
    const sp = L / n;
    const crown = 1.6, y0d = 0.15;
    const yd = (zz) => y0d + (crown - y0d) * (1 - Math.pow(zz / (L / 2), 2));
    const aSt = Math.max(2, Math.round(4.0 / sp));    // arch half span in stations
    const a = aSt * sp;
    const yc = 1.0, rise = 3.6, ysp = yc - rise, Rr = (a * a + rise * rise) / (2 * rise);
    const yi = (zz) => yc - (Rr - Math.sqrt(Math.max(Rr * Rr - zz * zz, 0)));
    const zs = Array.from({ length: n + 1 }, (_, i) => -L / 2 + i * sp);
    const bot = -5.0, par = 1.0;
    const st = kit.b('brick'), cb = kit.b('cobble');
    const lift = 0.22;
    const stTint = vgrad(-5, [0.66, 0.64, 0.74], 2, [1.02, 1.0, 1.1]);
    // side faces (spandrel walls / abutments) up to the parapet top; the +X face first, then the -X face
    for (const sx of [1, -1]) {
      const xx = sx * W;
      const uAx = [0, 0, -sx];
      for (let i = 0; i < n; i++) {
        const z0 = zs[i], z1 = zs[i + 1];
        const P = (zz, yy) => [xx, yy, zz];
        const inArch = Math.abs(z0) < a - 1e-6 && Math.abs(z1) < a + 1e-6 && Math.abs((z0 + z1) / 2) < a;
        const t0 = yd(z0) + par, t1 = yd(z1) + par;
        const mk = (l0, l1, tt0, tt1) => {
          const q = sx > 0 ? [P(z1, l1), P(z0, l0), P(z0, tt0), P(z1, tt1)] : [P(z0, l0), P(z1, l1), P(z1, tt1), P(z0, tt0)];
          planar(st, q, uAx, [0, 1, 0], { tile: 3.2, color: stTint, emissive: lift });
        };
        if (inArch) mk(yi(z0), yi(z1), t0, t1);
        else { mk(bot, bot, ysp, ysp); mk(ysp, ysp, t0, t1); }
      }
    }
    // archivolt ring (lighter voussoirs) proud of both faces
    for (const sx of [1, -1]) {
      const xx = sx * (W + 0.1);
      for (let i = 0; i < n; i++) {
        const z0 = zs[i], z1 = zs[i + 1];
        if (!(Math.abs(z0) < a - 1e-6 && Math.abs(z1) <= a + 1e-6)) continue;
        const w = 0.55;
        const P = (zz, yy) => [xx, yy, zz];
        const o0 = yi(z0) + w, o1 = yi(z1) + w;
        const q = sx > 0 ? [P(z1, yi(z1)), P(z0, yi(z0)), P(z0, o0), P(z1, o1)] : [P(z0, yi(z0)), P(z1, yi(z1)), P(z1, o1), P(z0, o0)];
        planar(st, q, [0, 0, -sx], [0, 1, 0], { tile: 3.2, color: i % 2 ? [1.12, 1.08, 1.16] : [0.95, 0.92, 1.02], emissive: lift });
      }
    }
    // ends (walls hidden in the banks)
    for (const sz of [1, -1]) {
      const zz = sz * L / 2;
      const q = sz > 0 ? [[-W, bot, zz], [W, bot, zz], [W, yd(zz), zz], [-W, yd(zz), zz]] : [[W, bot, zz], [-W, bot, zz], [-W, yd(zz), zz], [W, yd(zz), zz]];
      planar(st, q, [sz, 0, 0], [0, 1, 0], { tile: 3.2, color: stTint, emissive: lift });
    }
    // intrados (underside of the arch), facing down
    for (let i = 0; i < n; i++) {
      const z0 = zs[i], z1 = zs[i + 1];
      if (!(Math.abs(z0) < a - 1e-6 && Math.abs(z1) <= a + 1e-6)) continue;
      planar(st, [[-W, yi(z0), z0], [W, yi(z0), z0], [W, yi(z1), z1], [-W, yi(z1), z1]], [1, 0, 0], [0, 0, 1], { tile: 3.2, color: [0.6, 0.58, 0.72] });
    }
    // deck (cobble), parapet inner faces + tops
    for (let i = 0; i < n; i++) {
      const z0 = zs[i], z1 = zs[i + 1];
      const y0 = yd(z0), y1 = yd(z1);
      planar(cb, [[-wk, y1, z1], [wk, y1, z1], [wk, y0, z0], [-wk, y0, z0]], [1, 0, 0], [0, 0, -1], { tile: 3.2, color: [1.05, 1.02, 1.1], emissive: lift, u0: 0.3 });
      for (const sx of [1, -1]) {
        const xi = sx * wk, xo = sx * W;
        // inner parapet face (toward the walkway)
        if (sx > 0) planar(st, [[xi, y0, z0], [xi, y1, z1], [xi, y1 + par, z1], [xi, y0 + par, z0]], [0, 0, 1], [0, 1, 0], { tile: 3.2, color: [0.9, 0.88, 0.98], emissive: lift });
        else planar(st, [[xi, y1, z1], [xi, y0, z0], [xi, y0 + par, z0], [xi, y1 + par, z1]], [0, 0, -1], [0, 1, 0], { tile: 3.2, color: [0.9, 0.88, 0.98], emissive: lift });
        // parapet top
        planar(kit.b('flagstone'), [[Math.min(xi, xo), y1 + par, z1], [Math.max(xi, xo), y1 + par, z1], [Math.max(xi, xo), y0 + par, z0], [Math.min(xi, xo), y0 + par, z0]], [1, 0, 0], [0, 0, -1], { tile: 3.2, color: [1.1, 1.08, 1.16], emissive: lift });
      }
    }
    // parapet end faces + end posts with caps
    for (const sz of [1, -1]) for (const sx of [1, -1]) {
      const zz = sz * L / 2, y0 = yd(zz);
      const xa = Math.min(sx * wk, sx * W), xb = Math.max(sx * wk, sx * W);
      const q = sz > 0 ? [[xa, y0, zz], [xb, y0, zz], [xb, y0 + par, zz], [xa, y0 + par, zz]] : [[xb, y0, zz], [xa, y0, zz], [xa, y0 + par, zz], [xb, y0 + par, zz]];
      planar(st, q, [sz, 0, 0], [0, 1, 0], { tile: 3.2, color: [0.95, 0.92, 1.02], emissive: lift });
      const px = sx * (W - 0.15), pz = sz * (L / 2 - 0.15);
      st.box(px, y0 + 0.7, pz, 1.0, 1.4, 1.0, { tile: 3.2, color: [1.05, 1.02, 1.12], emissive: lift, faces: ['+z', '-z', '+x', '-x'] });
      frustum(st, px, pz, 0.62, 0.62, 0.3, 0.3, y0 + 1.4, y0 + 1.8, { tile: 3.2, color: [1.12, 1.08, 1.18], emissive: lift, faces: ['+z', '-z', '+x', '-x', '+y'] });
    }
    // colliders: walkable deck slabs + parapets
    for (let i = 0; i < n; i++) {
      const z0 = zs[i], z1 = zs[i + 1], zm = (z0 + z1) / 2;
      const ym = (yd(z0) + yd(z1)) / 2;
      kit.box(0, zm, wk, sp / 2 + 0.04, ym - 1.2, ym, { top: true, tag: 'deck' });
      for (const sx of [1, -1]) kit.box(sx * (wk + W) / 2, zm, (W - wk) / 2, sp / 2 + 0.04, Math.min(yd(z0), yd(z1)) - 1, Math.max(yd(z0), yd(z1)) + par, { tag: 'parapet' });
    }
    kit.caster(0, 0, 2.6, 2.4, 0.4);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// pier : wooden pier along +Z from the origin (deck top at y = 0.55), 3.2 wide, lamp post at the end
// ---------------------------------------------------------------------------------------------------------------
export function pier(kit, p) {
  const { x, z, rot = 0, scale = 1, y, len = 14 } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    // near the lake (origin close to WATER_LEVEL) the deck sits 0.3 above the water whatever the shore height; on the
    // gallery lawn (or with an explicit deck param) it is 0.55 above the origin
    const oy = kit.origin.y;
    const yT = p.deck ?? (oy < WATER_LEVEL + 3 ? (WATER_LEVEL + 0.3 - oy) / scale : 0.55);
    const W = 1.6, th = 0.25;
    const wp = kit.b('wood_plank'), wb = kit.b('wood_beam');
    const warm = [1.02, 0.94, 0.88];
    const nseg = Math.max(2, Math.round(len / 2.5));
    const sp = len / nseg;
    // deck planks (cells of one pier segment, planks run across)
    for (let i = 0; i < nseg; i++) {
      const z0 = i * sp, z1 = (i + 1) * sp;
      wp.quad([-W, yT, z1], [W, yT, z1], [W, yT, z0], [-W, yT, z0], { tile: 3.2, color: warm, emissive: 0.2, uv: [0, 0, 2 * W / 3.2, sp / 3.2] });
    }
    // deck edge boards (thickness), end faces
    for (const sx of [1, -1]) {
      const xx = sx * W;
      const q = sx > 0 ? [[xx, yT - th, len], [xx, yT - th, 0], [xx, yT, 0], [xx, yT, len]] : [[xx, yT - th, 0], [xx, yT - th, len], [xx, yT, len], [xx, yT, 0]];
      wp.quad(...q, { tile: 3.2, color: [0.8, 0.7, 0.64] });
    }
    wp.quad([-W, yT - th, len], [W, yT - th, len], [W, yT, len], [-W, yT, len], { tile: 3.2, color: [0.8, 0.7, 0.64] });
    // underside (seen from a boat) + stringers
    wp.quad([-W, yT - th, 0], [W, yT - th, 0], [W, yT - th, len], [-W, yT - th, len], { tile: 3.2, color: [0.5, 0.45, 0.48] });
    // posts in pairs with cross beams
    for (let i = 0; i <= nseg; i++) {
      const zz = Math.min(i * sp, len - 0.2) + (i === 0 ? 0.3 : 0);
      for (const sx of [1, -1]) {
        wb.box(sx * (W - 0.32), (yT - th - 4.2) / 2 + 0.05, zz, 0.42, yT - th + 4.2 + 0.4, 0.42, { tile: 2.4, color: [0.8, 0.7, 0.62], faces: ['+z', '-z', '+x', '-x'] });
      }
      wp.box(0, yT - th - 0.18, zz, 2 * W - 0.1, 0.3, 0.3, { tile: 2.4, color: [0.7, 0.62, 0.58], faces: ['+z', '-z', '-y'] });
    }
    // taller mooring posts at the end + a rail-less edge
    for (const sx of [1, -1]) {
      wb.box(sx * (W - 0.32), yT + 0.5, len - 0.3, 0.42, 1.0, 0.42, { tile: 2.4, color: [0.85, 0.74, 0.66], faces: ['+z', '-z', '+x', '-x', '+y'] });
    }
    // lamp post at the end
    lampHead(kit, 0, len - 0.6, yT, { h: 3.6, glow: true });
    // colliders
    kit.box(0, len / 2, W, len / 2, yT - 0.4, yT, { top: true, tag: 'pier' });
    kit.cyl(0, len - 0.6, 0.3, yT, yT + 3.6, { tag: 'lamp' });
    kit.caster(0, len / 2, 1.6, 0.6, 0.2);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// stairs : straight run from the origin toward local (dx,dz), rising `rise`; w wide.  Solid masonry steps.
// ---------------------------------------------------------------------------------------------------------------
export function stairs(kit, p) {
  const { x, z, rot = 0, scale = 1, y, dx = 0, dz = 6, rise = 3, w = 4, mat = 'stone' } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const D = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(rise / 0.5 - 1e-6));
    const sr = rise / n, run = D / n;
    const yaw = Math.atan2(dx, dz);
    const stone = mat !== 'wood';
    const top = kit.b(stone ? 'flagstone' : 'wood_plank');
    const side = kit.b(stone ? 'brick' : 'wood_plank');
    kit.xf.push().rotateY(yaw);
    for (let i = 0; i < n; i++) {
      const yT = (i + 1) * sr, zc = (i + 0.5) * run;
      const hgt = yT + 0.8;
      const c = stone ? [1.04, 1.02, 1.1] : [1.02, 0.94, 0.88];
      top.box(0, yT - 0.5 * 0, zc, w, 0.0001, run, { tile: 3.2, color: c, emissive: 0.2, faces: ['+y'] });
      side.box(0, yT - hgt / 2, zc, w, hgt, run, { tile: 3.2, color: vgrad(0, mulc(c, 0.75), rise, mulc(c, 0.95)), emissive: 0.2, faces: i === 0 ? ['+z', '+x', '-x'] : ['+z', '+x', '-x'] });
    }
    kit.xf.pop();
    for (let i = 0; i < n; i++) {
      const yT = (i + 1) * sr, zc = (i + 0.5) * run;
      const cx = Math.sin(yaw) * zc, cz = Math.cos(yaw) * zc;
      kit.box(cx, cz, w / 2, run / 2 + 0.02, yT - 0.9, yT, { top: true, rot: yaw, tag: 'step' });
    }
    kit.caster(Math.sin(yaw) * D / 2, Math.cos(yaw) * D / 2, Math.max(w, D) * 0.3, rise, 0.25);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// fence : post-and-rail run between two WORLD points (ax,az)-(bx,bz).  Falls back to a run of `len` along the local X axis.
// ---------------------------------------------------------------------------------------------------------------
function worldRun(kit, p, defLen) {
  let { ax, az, bx, bz } = p;
  if (ax === undefined) {
    const { x, z, rot = 0, len = defLen } = p;
    const c = Math.cos(rot), s = Math.sin(rot);
    ax = x - (len / 2) * c; az = z + (len / 2) * s; bx = x + (len / 2) * c; bz = z - (len / 2) * s;
  }
  return [ax, az, bx, bz];
}
const railYaw = (ax, az, bx, bz) => Math.atan2(-(bz - az), bx - ax);

export function fence(kit, p) {
  const [ax, az, bx, bz] = worldRun(kit, p, 10);
  const D = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(D / 2.4));
  kit.at(0, 0, { y: 0 }, () => {
    const wb = kit.b('wood_beam'), wp = kit.b('wood_plank');
    const col = [0.98, 0.88, 0.8];
    const P = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = lerp(ax, bx, t), pz = lerp(az, bz, t);
      P.push([px, kit.groundY(px, pz), pz]);
    }
    for (const q of P) {
      wb.box(q[0], q[1] + 0.6, q[2], 0.3, 2.0, 0.3, { tile: 2.4, color: col, faces: ['+z', '-z', '+x', '-x'] });
      frustum(wb, q[0], q[2], 0.2, 0.2, 0.02, 0.02, q[1] + 1.6, q[1] + 1.95, { tile: 2.4, color: col, faces: ['+z', '-z', '+x', '-x'] });
    }
    for (let i = 0; i < n; i++) {
      const A = P[i], B = P[i + 1];
      for (const hh of [0.55, 1.15]) strut(wp, [A[0], A[1] + hh, A[2]], [B[0], B[1] + hh, B[2]], 0.16, { h: 0.22, color: col, faces: ['+x', '-x', '+y', '-y'] });
      const mx = (A[0] + B[0]) / 2, mz = (A[2] + B[2]) / 2, len = Math.hypot(B[0] - A[0], B[2] - A[2]);
      kit.box(mx, mz, len / 2, 0.14, Math.min(A[1], B[1]) - 0.2, Math.max(A[1], B[1]) + 1.3, { rot: railYaw(A[0], A[2], B[0], B[2]), tag: 'fence' });
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// wall_stone : low dry-stone wall run between two WORLD points, 1.1 tall, 0.9 thick, cap stones
// ---------------------------------------------------------------------------------------------------------------
export function wallStone(kit, p) {
  const [ax, az, bx, bz] = worldRun(kit, p, 10);
  const D = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(D / 2.6));
  const h = 1.15, T = 0.45;
  kit.at(0, 0, { y: 0 }, () => {
    const st = kit.b('brick'), cap = kit.b('flagstone');
    const dx = (bx - ax) / D, dz = (bz - az) / D;
    const nx = -dz, nz = dx;                 // left normal (seen along the run)
    const P = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = lerp(ax, bx, t), pz = lerp(az, bz, t);
      P.push([px, kit.groundY(px, pz), pz]);
    }
    const tint = [0.98, 0.95, 1.04];
    for (let i = 0; i < n; i++) {
      const A = P[i], B = P[i + 1];
      const yA = A[1], yB = B[1];
      const pt = (Q, s, yy) => [Q[0] + nx * T * s, yy, Q[2] + nz * T * s];
      // side faces (right side seen along the run faces -normal), sunk 0.4 below ground
      const side = (s) => {
        const q = s > 0 ? [pt(B, s, yB - 0.4), pt(A, s, yA - 0.4), pt(A, s, yA + h), pt(B, s, yB + h)] : [pt(A, s, yA - 0.4), pt(B, s, yB - 0.4), pt(B, s, yB + h), pt(A, s, yA + h)];
        const l = Math.hypot(B[0] - A[0], B[2] - A[2]);
        planar(st, q, [dx * (s > 0 ? -1 : 1), 0, dz * (s > 0 ? -1 : 1)], [0, 1, 0], { tile: 2.8, color: vgrad(0, mulc(tint, 0.75), 4, mulc(tint, 1.0)), emissive: 0.2, u0: i * 0.7 });
      };
      side(1); side(-1);
      // cap (slightly wider)
      const c = T + 0.1;
      const cp = (Q, s) => [Q[0] + nx * c * s, Q[1] + h + 0.12, Q[2] + nz * c * s];
      planar(cap, [cp(A, -1), cp(B, -1), cp(B, 1), cp(A, 1)], [dx, 0, dz], [nx, 0, nz], { tile: 3.2, color: [1.1, 1.08, 1.16], emissive: 0.22 });
      // cap front faces (thickness)
      for (const s of [1, -1]) {
        const q = s > 0 ? [[A[0] + nx * c * s, A[1] + h, A[2] + nz * c * s], [B[0] + nx * c * s, B[1] + h, B[2] + nz * c * s], [B[0] + nx * c * s, B[1] + h + 0.12, B[2] + nz * c * s], [A[0] + nx * c * s, A[1] + h + 0.12, A[2] + nz * c * s]] : [[B[0] + nx * c * s, B[1] + h, B[2] + nz * c * s], [A[0] + nx * c * s, A[1] + h, A[2] + nz * c * s], [A[0] + nx * c * s, A[1] + h + 0.12, A[2] + nz * c * s], [B[0] + nx * c * s, B[1] + h + 0.12, B[2] + nz * c * s]];
        planar(st, q, [dx, 0, dz], [0, 1, 0], { tile: 3.2, color: [1.02, 1.0, 1.1], emissive: 0.2 });
      }
      const mx = (A[0] + B[0]) / 2, mz = (A[2] + B[2]) / 2, len = Math.hypot(B[0] - A[0], B[2] - A[2]);
      kit.box(mx, mz, len / 2 + 0.05, T, Math.min(yA, yB) - 0.5, Math.max(yA, yB) + h, { rot: railYaw(A[0], A[2], B[0], B[2]), tag: 'wall' });
    }
    // end caps
    for (const [Q, s] of [[P[0], -1], [P[n], 1]]) {
      const c = T + 0.1;
      const q = s > 0 ? [[Q[0] + nx * T, Q[1] + h + 0.12, Q[2] + nz * T], [Q[0] - nx * T, Q[1] + h + 0.12, Q[2] - nz * T], [Q[0] - nx * T, Q[1] - 0.4, Q[2] - nz * T], [Q[0] + nx * T, Q[1] - 0.4, Q[2] + nz * T]] : null;
      if (q) planar(st, [q[3], q[2], q[1], q[0]], [nx, 0, nz], [0, 1, 0], { tile: 2.8, color: tint, emissive: 0.2 });
      else {
        const r = [[Q[0] - nx * T, Q[1] - 0.4, Q[2] - nz * T], [Q[0] + nx * T, Q[1] - 0.4, Q[2] + nz * T], [Q[0] + nx * T, Q[1] + h + 0.12, Q[2] + nz * T], [Q[0] - nx * T, Q[1] + h + 0.12, Q[2] - nz * T]];
        planar(st, r, [nx, 0, nz], [0, 1, 0], { tile: 2.8, color: tint, emissive: 0.2 });
      }
    }
    kit.caster((ax + bx) / 2, (az + bz) / 2, Math.min(D * 0.3, 2), 1.3, 0.25);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// bunting : string of triangular pennants between two WORLD points at height h (default 4.6), sagging in the middle
// ---------------------------------------------------------------------------------------------------------------
const PENNANT = [[0.35, 0.85, 0.82], [1.0, 0.5, 0.42], [0.7, 0.5, 1.0], [1.0, 0.85, 0.4]];
export function bunting(kit, p) {
  const [ax, az, bx, bz] = worldRun(kit, p, 8);
  const { h = 4.6, sag = 0.7, hb } = p;
  const D = Math.hypot(bx - ax, bz - az);
  kit.at(0, 0, { y: 0 }, () => {
    const v = kit.b(null, { double: true });
    const gA = kit.groundY(ax, az) + h, gB = kit.groundY(bx, bz) + (hb ?? h);
    const n = Math.max(2, Math.round(D / 0.7));
    const pos = (t) => [lerp(ax, bx, t), lerp(gA, gB, t) - sag * 4 * t * (1 - t), lerp(az, bz, t)];
    const dx = (bx - ax) / D, dz = (bz - az) / D;
    // string
    for (let i = 0; i < 12; i++) {
      const a = pos(i / 12), b = pos((i + 1) / 12);
      v.quad([a[0], a[1] - 0.04, a[2]], [b[0], b[1] - 0.04, b[2]], [b[0], b[1] + 0.04, b[2]], [a[0], a[1] + 0.04, a[2]], { color: [0.2, 0.16, 0.2] });
    }
    for (let i = 0; i < n; i++) {
      const t0 = (i + 0.12) / n, t1 = (i + 0.88) / n, tm = (t0 + t1) / 2;
      const a = pos(t0), b = pos(t1), m = pos(tm);
      const c = PENNANT[i % PENNANT.length];
      v.tri([a[0], a[1], a[2]], [b[0], b[1], b[2]], [m[0], m[1] - 0.75, m[2]], [0, 0], [1, 0], [0.5, 1], { color: c, emissive: 0.15 });
    }
  });
}

export const STRUCTURES = {
  bridge_stone: {
    fn: bridgeStone, size: 24,
    note: 'Arched stone footbridge: params rot (yaw: local +Z runs along the bridge, e.g. atan2(dx,dz) of the path) + len (default 16, use >= 11). Centred at the origin, deck z in [-len/2, len/2]; 5 wide (walkway 3.6 between 0.7 parapets). Origin height = the LOWER bank height sampled at the two deck ends unless y is passed (so both approaches are step-free); deck is 0.15 above that at the ends, crown +1.6 in the middle; the arch opening is under z in [-4,4] (springing y=-2.6, crown underside y=+1.0); abutments/spandrels go down to y=-5. Colliders: ~1-unit deck slabs (top:true, steps <=0.36) + parapet boxes.',
    defaults: { len: 16 },
  },
  pier: {
    fn: pier, size: 20,
    note: 'Wooden pier running along +Z from the origin (param len=14, 3.2 wide). Deck top: if the origin is near the lake (ground y < WATER_LEVEL+3) the deck is at world WATER_LEVEL+0.3 whatever the shore height (the first metres may sink into a higher bank); otherwise 0.55 above the origin; override with param deck (local y). Posts go 4.2 below the deck; lamp post + lantern glow at the end (z=len-0.6, on the centre line). One walkable deck collider (top:true). Place the origin ~3 units inland of the shore and rot so +Z points over the water.',
    defaults: { len: 14 },
  },
  stairs: {
    fn: stairs, size: 10,
    note: 'Straight solid stair from the origin toward local (dx,dz) rising `rise` (params dx,dz,rise,w=4,mat="stone"|"wood"). Steps <=0.5 rise; one box collider per step (top:true). Top of the run is at (dx,dz,rise).',
    defaults: { dx: 0, dz: 6, rise: 3, w: 4 },
  },
  fence: {
    fn: fence, size: 10,
    note: 'Post-and-rail fence between two WORLD points {ax,az,bx,bz} (follows terrain height per post; posts ~2.4 apart). In the gallery (no ax..bz) draws a run of `len`=10 along local X. Rail colliders per span.',
  },
  wall_stone: {
    fn: wallStone, size: 10,
    note: 'Low dry-stone wall (1.15 tall, 0.9 thick, cap stones) between two WORLD points {ax,az,bx,bz}; follows terrain; one box collider per ~2.6 segment. Gallery fallback: run of len=10 along local X.',
  },
  bunting: {
    fn: bunting, size: 8,
    note: 'String of teal/coral/violet/gold pennants between two WORLD points {ax,az,bx,bz,h=4.6 (height above ground at A), hb (at B), sag=0.7}. No colliders. Gallery fallback: run of len=8 along local X.',
  },
};
