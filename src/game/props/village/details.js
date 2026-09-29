// Small architectural details shared by several props: windows, doors, lanterns, chimneys, posts, hoops...
// Wall-mounted helpers draw in a "face frame": origin on the wall plane, +z = out of the wall, +x = right, +y = up.
import { PI, TAU, TINT, mulc, frustum, quadUV, vgrad } from './common.js';

/** Lit window with a chunky header + sill (the window texture carries its own frame).  o: w,h, shutter (tint | null) */
export function windowUnit(kit, o = {}) {
  const { w = 1.3, h = 1.3, lit = 0.92, shutter = null, sill = true, header = true, trim = TINT.warm, shutterL = true, shutterR = true, flowers = false } = o;
  const hw = w / 2, hh = h / 2;
  const glass = kit.b('window');
  glass.quad([-hw, -hh, 0.07], [hw, -hh, 0.07], [hw, hh, 0.07], [-hw, hh, 0.07], { uv: [0, 0, 1, 1], emissive: lit, color: TINT.glass });
  const wp = kit.b('wood_plank'), wb = kit.b('wood_beam');
  if (header) wp.box(0, hh + 0.13, 0.16, w + 0.5, 0.26, 0.32, { tile: 2.4, color: trim, faces: ['+z', '+y', '-y'] });
  if (sill) wp.box(0, -hh - 0.11, 0.22, w + 0.66, 0.22, 0.44, { tile: 2.4, color: mulc(trim, 1.08), faces: ['+z', '+y', '-y'] });
  if (flowers) flowerBox(kit, { w: w + 0.4, y: -hh - 0.56, palette: o.palette });
  if (shutter) {
    for (const s of [-1, 1]) {
      if ((s < 0 && !shutterL) || (s > 0 && !shutterR)) continue;
      const x0 = s * (hw + 0.1), x1 = s * (hw + 0.1 + 0.55);
      const a = s > 0 ? [x0, -hh, 0.06] : [x1, -hh, 0.06], bq = s > 0 ? [x1, -hh, 0.06] : [x0, -hh, 0.06];
      wb.quad(a, bq, [bq[0], hh, 0.06], [a[0], hh, 0.06], { uv: [0, 0, 0.55 / 1.6, h / 3.2], color: shutter });
    }
  }
}

/** Front door (door texture) with jambs, lintel and a stone step.  Origin = centre of the threshold on the wall. */
export function doorUnit(kit, o = {}) {
  const { w = 1.8, h = 3.2, base = 0.5, trim = TINT.warm, step = true, tint = TINT.white } = o;
  const hw = w / 2;
  kit.b('door').quad([-hw, 0, 0.09], [hw, 0, 0.09], [hw, h, 0.09], [-hw, h, 0.09], { uv: [0, 0, 1, 1], color: tint });
  const wp = kit.b('wood_plank'), wb = kit.b('wood_beam');
  for (const s of [-1, 1]) wb.box(s * (hw + 0.16), h / 2 + 0.1, 0.17, 0.32, h + 0.2, 0.34, { tile: 2.4, color: trim, faces: ['+z', s > 0 ? '+x' : '-x', s > 0 ? '-x' : '+x'] });
  wp.box(0, h + 0.22, 0.2, w + 0.9, 0.44, 0.4, { tile: 2.4, color: trim, faces: ['+z', '+y', '-y'] });
  if (step) {
    const st = kit.b('brick');
    const sh = base + 0.9; // from below ground to just under the threshold
    st.box(0, -base + 0.26 - sh / 2 + 0.0, 0.2 + 0.55, w + 0.8, sh, 1.1, { tile: 3.2, color: vgrad(-base - 0.6, [0.6, 0.6, 0.68], -base + 0.3, [0.92, 0.9, 0.96]), faces: ['+z', '+x', '-x', '+y'] });
  }
}

/** Lantern hanging on a short iron arm from a wall (face frame).  Local y = lantern centre. */
export function lanternWall(kit, o = {}) {
  const iron = kit.b('metal_iron');
  iron.box(0, 0.5, 0.3, 0.12, 0.1, 0.6, { tile: 1.6, faces: ['+y', '+x', '-x', '+z'] });
  lanternBody(kit, 0, 0, 0.6, o);
}

/** The lantern itself: brass cage with emissive glass, pyramid cap.  Centre (x,y,z) in the current frame. */
export function lanternBody(kit, x, y, z, o = {}) {
  const { s = 1, lit = 1 } = o;
  const g = kit.b('lantern_glass_on');
  const hw = 0.24 * s, hh = 0.34 * s;
  g.box(x, y, z, hw * 2, hh * 2, hw * 2, { uv: [0, 0, 1, 1], emissive: lit, faces: ['+z', '-z', '+x', '-x'], color: [1, 1, 1] });
  const iron = kit.b('metal_iron');
  frustum(iron, x, z, hw + 0.06 * s, hw + 0.06 * s, 0.05 * s, 0.05 * s, y + hh, y + hh + 0.3 * s, { tile: 1.6, faces: ['+z', '-z', '+x', '-x'] });
  iron.quad([x - hw, y - hh, z + hw], [x + hw, y - hh, z + hw], [x + hw, y - hh, z - hw], [x - hw, y - hh, z - hw], { tile: 1.6, flip: true });
}

/**
 * Brick chimney rising through the roof (L-frame): o = { x, z, sx, sz, tex, top, y0 }.  Optional pot + cap.
 * y0 = bottom (hidden inside the roof).
 */
export function chimneyStack(kit, o) {
  const { x = 0, z = 0, sx = 1.3, sz = 1.3, tex = 'brick', top, tint = [0.9, 0.86, 0.9], y0 = 4 } = o;
  const br = kit.b(tex);
  br.box(x, (y0 + top) / 2, z, sx, top - y0, sz, { tile: 2.4, color: vgrad(top - 2.4, mulc(tint, 0.78), top, mulc(tint, 1.0)), faces: ['+z', '-z', '+x', '-x'] });
  // corbelled cap
  br.box(x, top + 0.1, z, sx + 0.36, 0.22, sz + 0.36, { tile: 2.4, color: mulc(tint, 1.08), faces: ['+z', '-z', '+x', '-x', '+y', '-y'] });
  const dark = kit.b(null);
  dark.box(x, top + 0.22, z, sx * 0.6, 0.04, sz * 0.6, { color: [0.08, 0.06, 0.1], faces: ['+y'] });
}

/** Simple vertical post (square) with pointed cap.  In the current frame, base at y=0. */
export function post(kit, x, z, h, w = 0.3, o = {}) {
  const wb = kit.b('wood_beam');
  wb.box(x, h / 2, z, w, h, w, { tile: 2.4, color: o.color || TINT.white, faces: ['+z', '-z', '+x', '-x'] });
  if (o.cap !== false) frustum(wb, x, z, w * 0.5, w * 0.5, 0.02, 0.02, h, h + w * 0.7, { tile: 2.4, color: o.color || TINT.white, faces: ['+z', '-z', '+x', '-x'] });
}

/** Flower box under a window (face frame; origin = window centre).  Wood box + a sloped green pad with flower diamonds. */
export function flowerBox(kit, o = {}) {
  const { w = 1.7, y = -0.95, palette = [[1.0, 0.45, 0.4], [0.75, 0.55, 1.0], [1.0, 0.85, 0.35]] } = o;
  const wp = kit.b('wood_plank');
  const hw = w / 2;
  wp.box(0, y, 0.3, w, 0.34, 0.6, { tile: 2.4, color: [0.9, 0.78, 0.7], faces: ['+z', '+x', '-x', '-y'] });
  const v = kit.b(null);
  const y0 = y + 0.17;
  v.quad([-hw, y0, 0.6], [hw, y0, 0.6], [hw * 0.9, y0 + 0.5, 0.18], [-hw * 0.9, y0 + 0.5, 0.18], { color: [0.28, 0.62, 0.3] });
  const n = 4;
  for (let i = 0; i < n; i++) {
    const cx = -hw * 0.75 + (i / (n - 1)) * hw * 1.5, cy = y0 + 0.42 + (i % 2) * 0.08;
    const c = palette[i % palette.length];
    v.quad([cx - 0.11, cy - 0.11, 0.42], [cx + 0.11, cy - 0.11, 0.42], [cx + 0.11, cy + 0.11, 0.42], [cx - 0.11, cy + 0.11, 0.42], { color: c, emissive: 0.25 });
  }
}

/** Lean-to porch roof over a door (face frame; origin = door threshold centre). */
export function porch(kit, o = {}) {
  const { w = 3.0, d = 1.5, y = 3.9, tex = 'roof_teal', tint = [1, 1, 1] } = o;
  const hw = w / 2;
  const wp = kit.b('wood_plank'), wb = kit.b('wood_beam'), rf = kit.b(tex);
  const drop = 0.55;
  // sloped roof: high against the wall, dropping toward the front; outward normal up + front
  quadUV(rf, [-hw, y - drop, d], [hw, y - drop, d], [hw, y + 0.35, 0.0], [-hw, y + 0.35, 0.0], { tile: 3.2, color: tint });
  // fascia + soffit
  wp.quad([-hw, y - drop - 0.22, d], [hw, y - drop - 0.22, d], [hw, y - drop, d], [-hw, y - drop, d], { tile: 3.2, color: TINT.trimDark });
  wp.quad([-hw, y + 0.13, 0], [-hw, y - drop - 0.22, d], [-hw, y - drop, d], [-hw, y + 0.35, 0], { tile: 3.2, color: TINT.trimDark });
  wp.quad([hw, y - drop - 0.22, d], [hw, y + 0.13, 0], [hw, y + 0.35, 0], [hw, y - drop, d], { tile: 3.2, color: TINT.trimDark });
  wp.quad([-hw, y + 0.13, 0], [hw, y + 0.13, 0], [hw, y - drop - 0.22, d], [-hw, y - drop - 0.22, d], { tile: 3.2, color: [0.55, 0.5, 0.55] });
  // two posts (down to the ground)
  const base = o.base ?? 0.5, top = y - drop - 0.22;
  for (const s of [-1, 1]) wb.box(s * (hw - 0.15), (top - base) / 2, d - 0.15, 0.26, top + base, 0.26, { tile: 2.4, color: TINT.warm, faces: ['+z', '-z', '+x', '-x'] });
}

/** Small gabled porch roof over a door on two posts (face frame; origin = door threshold centre, wall at z=0). */
export function porchGable(kit, o = {}) {
  const { w = 3.6, d = 2.2, ye = 3.95, rise = 1.5, tex = 'roof_teal', tint = [1, 1, 1], base = 0.5, wall = 'plaster', wallTint = [1.1, 1.04, 1.0] } = o;
  const hw = w / 2, yr = ye + rise;
  const rf = kit.b(tex), wp = kit.b('wood_plank'), wb = kit.b('wood_beam');
  const T = 0.2;
  // slopes (top)
  quadUV(rf, [-hw - 0.2, ye - 0.15, 0], [-hw - 0.2, ye - 0.15, d + 0.3], [0, yr + 0.05, d + 0.3], [0, yr + 0.05, 0], { tile: 3.2, color: tint, emissive: 0.16 });
  quadUV(rf, [hw + 0.2, ye - 0.15, d + 0.3], [hw + 0.2, ye - 0.15, 0], [0, yr + 0.05, 0], [0, yr + 0.05, d + 0.3], { tile: 3.2, color: tint, emissive: 0.16 });
  // undersides (dark wood)
  const uc = { tile: 3.2, color: [0.5, 0.46, 0.52] };
  wp.quad([-hw - 0.2, ye - 0.15 - T, d + 0.3], [-hw - 0.2, ye - 0.15 - T, 0], [0, yr + 0.05 - T, 0], [0, yr + 0.05 - T, d + 0.3], uc);
  wp.quad([hw + 0.2, ye - 0.15 - T, 0], [hw + 0.2, ye - 0.15 - T, d + 0.3], [0, yr + 0.05 - T, d + 0.3], [0, yr + 0.05 - T, 0], uc);
  // front gable triangle + barge boards
  const wl = kit.b(wall);
  wl.tri([-hw, ye - 0.1, d], [hw, ye - 0.1, d], [0, yr - 0.05, d], [0, 0], [w / 3.2, 0], [w / 6.4, rise / 3.2], { color: wallTint, emissive: 0.2 });
  const bt = { tile: 3.2, color: TINT.trimDark };
  wp.quad([-hw - 0.2, ye - 0.15 - T, d + 0.3], [0, yr + 0.05 - T, d + 0.3], [0, yr + 0.05, d + 0.3], [-hw - 0.2, ye - 0.15, d + 0.3], bt);
  wp.quad([0, yr + 0.05 - T, d + 0.3], [hw + 0.2, ye - 0.15 - T, d + 0.3], [hw + 0.2, ye - 0.15, d + 0.3], [0, yr + 0.05, d + 0.3], bt);
  // posts
  for (const s of [-1, 1]) wb.box(s * (hw - 0.12), (ye - 0.35 - base) / 2, d - 0.12, 0.28, ye - 0.35 + base, 0.28, { tile: 2.4, color: TINT.warm, faces: ['+z', '-z', '+x', '-x'] });
  // tie beam across the front
  wp.box(0, ye - 0.35, d - 0.14, w, 0.24, 0.2, { tile: 2.4, color: TINT.warm, faces: ['+z', '-y', '+y'] });
}

/** Small cupola / lantern turret on a ridge (L-frame: centre x,z on the ridge line at y = yRidge). */
export function cupola(kit, x, z, yRidge, o = {}) {
  const { s = 1, tex = 'roof_red', tint = [1, 1, 1] } = o;
  const wp = kit.b('wood_plank'), wb = kit.b('wood_beam'), rf = kit.b(tex), gl = kit.b('window');
  const hw = 0.85 * s, h = 1.5 * s;
  const y0 = yRidge - 0.15;
  wp.box(x, y0 + h / 2, z, hw * 2, h, hw * 2, { tile: 2.4, color: [0.9, 0.8, 0.72], faces: ['+z', '-z', '+x', '-x'] });
  // glowing louvre windows on the four sides
  const g = 0.5 * s;
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = x + nx * (hw + 0.03), cz = z + nz * (hw + 0.03), cy = y0 + h * 0.55;
    const rx = nz, rz = -nx;   // right vector seen from outside
    gl.quad([cx - rx * g, cy - g, cz - rz * g], [cx + rx * g, cy - g, cz + rz * g], [cx + rx * g, cy + g, cz + rz * g], [cx - rx * g, cy + g, cz - rz * g],
      { uv: [0, 0, 1, 1], emissive: 0.9, color: TINT.glass });
  }
  // little pyramid roof + finial
  frustum(rf, x, z, hw + 0.45 * s, hw + 0.45 * s, 0.06, 0.06, y0 + h, y0 + h + 1.5 * s, { tile: 3.0, color: tint, emissive: 0.16, faces: ['+z', '-z', '+x', '-x'] });
  wb.box(x, y0 + h + 1.5 * s + 0.3, z, 0.1, 0.6, 0.1, { tile: 2.4, faces: ['+z', '-z', '+x', '-x'] });
}
