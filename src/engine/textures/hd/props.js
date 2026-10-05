// HD painters for the things that are made and carried: a crate, a chest, a vase, and the village's window, door and banner. Each is painted at the size it has (w x h) in floating point, with the colours of its pixel twin.
import { Canvas, RNG, clamp, mix, smoothstep, ramp, col, fbmWH, grain, noise } from './kit.js';
import { leaf } from './plants.js';

const h01 = (i, s) => { let h = Math.imul(i + 1, 374761393) ^ Math.imul(s + 7, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** a round nail or rivet head: a shadow, a dark rim, a lit dome */
function rivet(cv, x, y, r, dark, mid, light) {
  cv.soft(x + r * 0.35, y + r * 0.45, r * 1.3, [10, 6, 6], 0.5);
  cv.soft(x, y, r, dark, 1);
  cv.soft(x - r * 0.1, y - r * 0.12, r * 0.8, mid, 1);
  cv.soft(x - r * 0.3, y - r * 0.36, r * 0.38, light, 0.95);
}

/** a plank-shaped region's wood: grain along `vertical` (true) or across, and a tone that changes plank by plank */
function woodField(w, h, seed, vertical) {
  return vertical ? fbmWH(w, h, seed, 26, 3, 0.55, 2) : fbmWH(w, h, seed, 2, 3, 0.55, 26);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A crate: a frame of planks round a dark panel, two braces across it, nails at the corners and the ends of the braces.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function crate(w, h, { seed = 8001, R } = {}) {
  const n = w, K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R), cv = new Canvas(w, [0, 0, 0], { h });
  const gV = woodField(w, h, seed + 1, true), gH = woodField(w, h, seed + 2, false), blot = fbmWH(w, h, seed + 3, 4, 3), cr = noise(seed + 4, 18);
  const F = 34 * K, bw = 34 * K, height = new Float32Array(w * h), tmp = [0, 0, 0];
  cv.fillWith((x, y, out) => {
    const k = y * w + x;
    const dEdge = Math.min(x, y, w - 1 - x, h - 1 - y), inFrame = dEdge < F;
    const d1 = Math.abs(x - y) / 1.4142 - bw / 2, d2 = Math.abs(x + y - (w - 1)) / 1.4142 - bw / 2;
    const dBrace = Math.min(d1, d2), inBrace = !inFrame && dBrace < 0;
    let t, hgt = 0;
    if (inFrame) {
      const horiz = Math.min(y, h - 1 - y) < F && Math.min(y, h - 1 - y) <= Math.min(x, w - 1 - x);
      const g = horiz ? gH[k] : gV[k];
      t = 0.62 + (g - 0.5) * 0.4 + (blot[k] - 0.5) * 0.14;
      hgt = 0.7 * smoothstep(0, 6 * K, F - dEdge) + 0.05;                                     // the frame stands above the rest
    } else if (inBrace) {
      const u = (x - y) / 1.4142, g = cr((u / 70 * 5 + 40) % 1, (y / h * 3) % 1);              // grain along the diagonal brace (rotated lookup)
      t = 0.66 + (g - 0.5) * 0.4 + (blot[k] - 0.5) * 0.14;
      hgt = 0.45 * smoothstep(0, 5 * K, -dBrace) + 0.05;
    } else {
      t = 0.26 + (gV[k] - 0.5) * 0.3 + (blot[k] - 0.5) * 0.1;                                  // the panel behind: darker, in planks
      const plank = Math.floor((x / w) * 4);
      t += (h01(plank, seed) - 0.5) * 0.08;
      hgt = (Math.abs(((x / w) * 4) % 1 - 0.5) > 0.47) ? -0.2 : 0;                              // the gaps between the panel's planks
    }
    RR(clamp(t), out);
    if (!inFrame && !inBrace && hgt < 0) { out[0] *= 0.5; out[1] *= 0.5; out[2] *= 0.5; }
    height[k] = hgt;
  });
  cv.shade(height, 2.4);
  // the shadow the frame and the braces throw on the panel
  const ao = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dEdge = Math.min(x, y, w - 1 - x, h - 1 - y), d1 = Math.abs(x - y) / 1.4142 - bw / 2, d2 = Math.abs(x + y - (w - 1)) / 1.4142 - bw / 2, db = Math.min(d1, d2);
      let s = 0;
      if (dEdge >= F) s -= 0.4 * (1 - smoothstep(0, 9 * K, dEdge - F));
      if (db >= 0) s -= 0.3 * (1 - smoothstep(0, 8 * K, db));
      ao[y * w + x] = s;
    }
  }
  cv.modulate(ao);
  // the joints of the frame: where its planks meet at the corners
  for (const [x0, y0, x1, y1] of [[F, 0, F, F], [w - F, 0, w - F, F], [F, h - F, F, h], [w - F, h - F, w - F, h], [0, F, F, F], [0, h - F, F, h - F], [w - F, F, w, F], [w - F, h - F, w, h - F]]) {
    cv.stroke([[x0, y0], [x1, y1]], 2.2 * K, 2.2 * K, [26, 14, 8], [26, 14, 8], 0.8);
  }
  const rv = [[0.5 * F, 0.5 * F], [w - 0.5 * F, 0.5 * F], [0.5 * F, h - 0.5 * F], [w - 0.5 * F, h - 0.5 * F]];
  for (const [x, y] of rv) rivet(cv, x, y, 6 * K, [40, 28, 24], [96, 82, 78], [230, 220, 210]);
  for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8], [0.5, 0.5]]) rivet(cv, x * w, y * h, 5 * K, [40, 28, 24], [96, 82, 78], [230, 220, 210]);
  cv.modulate(grain(w, seed + 9, w / 2, 0.035));
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A chest: boards upright, two iron bands, a brass lock.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function chest(w, h, { seed = 8101, R, M, B } = {}) {
  const n = w, K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R), MR = ramp(M), BR = ramp(B), cv = new Canvas(w, [0, 0, 0], { h });
  const gV = woodField(w, h, seed + 1, true), blot = fbmWH(w, h, seed + 2, 4, 3), brush = fbmWH(w, h, seed + 3, 3, 3, 0.6, 40);
  const height = new Float32Array(w * h), band = [[0.045, 0.2], [0.8, 0.955]].map(([a, b]) => [a * w, b * w]), tmp = [0, 0, 0];
  const lock = [0.36 * w, 0.3 * h, 0.64 * w, 0.7 * h];
  const boards = 5;
  cv.fillWith((x, y, out) => {
    const k = y * w + x, u = (x / w) * boards, id = Math.floor(u), fu = u - id, dgap = Math.min(fu, 1 - fu) * (w / boards);
    let hgt = 0.3;
    const inBand = (x >= band[0][0] && x <= band[0][1]) || (x >= band[1][0] && x <= band[1][1]);
    const inLock = x >= lock[0] && x <= lock[2] && y >= lock[1] && y <= lock[3];
    if (inLock) {
      const edge = Math.min(x - lock[0], lock[2] - x, y - lock[1], lock[3] - y);
      BR(clamp(0.58 + (brush[k] - 0.5) * 0.12 + 0.2 * smoothstep(0, 6 * K, edge) - 0.2 * (1 - smoothstep(0, 5 * K, edge))), out);
      hgt = 0.8 * smoothstep(0, 4 * K, edge) + 0.4;
    } else if (inBand) {
      const bx = x >= band[0][0] && x <= band[0][1] ? x - band[0][0] : x - band[1][0], bwid = band[0][1] - band[0][0], edge = Math.min(bx, bwid - bx);
      MR(clamp(0.5 + (brush[k] - 0.5) * 0.3 + 0.16 * smoothstep(0, 5 * K, edge) - 0.14 * (1 - smoothstep(0, 4 * K, edge))), out);
      hgt = 0.6 * smoothstep(0, 4 * K, edge) + 0.3;
    } else {
      RR(clamp(0.5 + 0.2 * (h01(id, seed) - 0.5) + (gV[k] - 0.5) * 0.4 + (blot[k] - 0.5) * 0.14), out);
      if (dgap < 2.6 * K) { const g = 1 - smoothstep(0.4 * K, 2.6 * K, dgap); out[0] *= 1 - 0.7 * g; out[1] *= 1 - 0.7 * g; out[2] *= 1 - 0.7 * g; hgt = 0.3 - 0.3 * g; }
    }
    height[k] = hgt;
  });
  cv.shade(height, 2.0);
  // a shadow under the bands and the lock
  const ao = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (const [a, b] of band) { const d = x < a ? a - x : x > b ? x - b : -1; if (d >= 0) s -= 0.34 * (1 - smoothstep(0, 7 * K, d)); }
      const dx = x < lock[0] ? lock[0] - x : x > lock[2] ? x - lock[2] : 0, dy = y < lock[1] ? lock[1] - y : y > lock[3] ? y - lock[3] : 0, dl = Math.hypot(dx, dy);
      if (dl > 0) s -= 0.34 * (1 - smoothstep(0, 8 * K, dl));
      ao[y * w + x] = s;
    }
  }
  cv.modulate(ao);
  // rivets down the bands, the keyhole and the hasp
  for (const [a, b] of band) for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) rivet(cv, (a + b) / 2, fy * h, 5 * K, [30, 28, 40], [100, 98, 120], [236, 234, 250]);
  const kx = (lock[0] + lock[2]) / 2, ky = (lock[1] + lock[3]) / 2;
  cv.soft(kx, ky - 6 * K, 9 * K, [20, 12, 6], 1); cv.stroke([[kx, ky - 4 * K], [kx, ky + 22 * K]], 8 * K, 4 * K, [20, 12, 6], [20, 12, 6], 1);
  cv.soft(kx + 1.5 * K, ky + 3 * K, 12 * K, [10, 6, 4], 0.0);
  for (const [fx, fy] of [[0.4, 0.34], [0.6, 0.34], [0.4, 0.66], [0.6, 0.66]]) rivet(cv, fx * w, fy * h, 3.8 * K, BR(0.2, [0, 0, 0]), BR(0.6, [0, 0, 0]), [255, 244, 190]);
  cv.modulate(grain(w, seed + 9, w / 2, 0.03));
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A vase: terracotta in bands, cream stripes, a band of gold teeth and one of blue; the glaze catches the light. (It wraps round: the zigzags come out even.)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function vase(w, h, { seed = 8201, R } = {}) {
  const n = w, K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R), cv = new Canvas(w, [0, 0, 0], { h });
  const f = fbmWH(w, h, seed + 1, 6, 3, 0.5, 3), g = fbmWH(w, h, seed + 2, 24, 2, 0.5, 6);
  const gold = ramp(['#8a4a10', '#d88a1c', '#ffc03c', '#fff0a0']), blue = ramp(['#12328a', '#2a62d8', '#5a96ff', '#b4d4ff']), cream = ramp(['#b8a888', '#e6dcc0', '#fffaec']);
  const teeth = 8, height = new Float32Array(w * h), tmp = [0, 0, 0];
  const band = (v, a, b) => smoothstep(a - 0.004, a + 0.004, v) * (1 - smoothstep(b - 0.004, b + 0.004, v));
  cv.fillWith((x, y, out) => {
    const k = y * w + x, u = x / w, v = y / h;
    let t = 0.4 + (f[k] - 0.5) * 0.34 + (g[k] - 0.5) * 0.12 + 0.12 * Math.sin(v * 40 + f[k] * 6) * 0.2;       // clay, with the marks of the wheel
    RR(clamp(t), out);
    let hgt = 0;
    const stripe = band(v, 0.07, 0.13) + band(v, 0.66, 0.72);
    if (stripe > 0) { cream(clamp(0.55 + (f[k] - 0.5) * 0.3 + 0.2 * (1 - Math.abs((v - (v < 0.5 ? 0.1 : 0.69)) / 0.03))), tmp); for (let c = 0; c < 3; c++) out[c] = mix(out[c], tmp[c], stripe); hgt += 0.3 * stripe; }
    const tri = (frac) => 1 - Math.abs(frac * 2 - 1);                                                   // a triangle wave, 0..1
    // gold teeth point up from a line at 0.34; blue teeth hang from a line at 0.42
    const ug = (u * teeth) % 1, tg = tri(ug), yUp = 0.34 - 0.075 * tg, yDn = 0.42 + 0.075 * tg;
    const gm = band(v, yUp, 0.34) * smoothstep(0.0, 0.15, tg + 0.15 * 0), bm = band(v, 0.42, yDn);
    if (gm > 0) { gold(clamp(0.45 + 0.4 * (1 - (0.34 - v) / 0.08) * 0 + 0.35 * (v - yUp) / 0.08 + (f[k] - 0.5) * 0.2), tmp); for (let c = 0; c < 3; c++) out[c] = mix(out[c], tmp[c], gm); hgt += 0.2 * gm; }
    if (bm > 0) { blue(clamp(0.7 - 0.5 * (v - 0.42) / 0.08 + (f[k] - 0.5) * 0.2), tmp); for (let c = 0; c < 3; c++) out[c] = mix(out[c], tmp[c], bm); hgt += 0.2 * bm; }
    const line = band(v, 0.335, 0.345) + band(v, 0.415, 0.425);                                       // dark lines at the edges of the bands
    out[0] *= 1 - 0.5 * line; out[1] *= 1 - 0.5 * line; out[2] *= 1 - 0.5 * line;
    height[k] = hgt + (g[k] - 0.5) * 0.06;
  });
  cv.shade(height, 1.6);
  cv.modulate(grain(w, seed + 9, w / 2, 0.03));
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A window: a dark frame, a cross of mullions, four panes lit warm from within, a sill.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function windowTex(w, h, { seed = 8301, W, G } = {}) {
  const n = w, K = n / 128;
  const rng = new RNG(seed);
  const WR = ramp(W), GR = ramp(G), cv = new Canvas(w, [0, 0, 0], { h });
  const gl = fbmWH(w, h, seed + 1, 3, 3), gr = fbmWH(w, h, seed + 2, 3, 3, 0.55, 30);
  const fr = 12 * K, mu = 7 * K, height = new Float32Array(w * h), tmp = [0, 0, 0];
  cv.fillWith((x, y, out) => {
    const k = y * w + x, dEdge = Math.min(x, y, w - 1 - x, h - 1 - y), dm = Math.min(Math.abs(x - w / 2), Math.abs(y - h / 2)) - mu / 2;
    const wood = dEdge < fr || dm < 0;
    if (wood) {
      WR(clamp(0.22 + (gr[k] - 0.5) * 0.18 + 0.12 * smoothstep(0, 4 * K, dEdge < fr ? fr - dEdge : -dm)), out);
      height[k] = 0.6 * smoothstep(0, 4 * K, dEdge < fr ? Math.min(dEdge, fr - dEdge) : -dm) + 0.1;
    } else {
      // the pane: bright in the middle (the lamp), amber at the edge, a little uneven like old glass
      const px = (x < w / 2 ? x - fr : x - w / 2 - mu / 2) / (w / 2 - fr - mu / 2) - 0.5, py = (y < h / 2 ? y - fr : y - h / 2 - mu / 2) / (h / 2 - fr - mu / 2) - 0.5;
      const r = Math.hypot(px * 1.5 - 0.15, py * 1.5 - 0.1);
      GR(clamp(0.95 - r * 0.8 + (gl[k] - 0.5) * 0.18), out);
      height[k] = 0;
    }
  });
  cv.shade(height, 1.8);
  // a glint across each pane
  for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x0 = fr + ox * (w / 2 - fr + mu / 2 - fr * 0) - (ox ? 0 : 0), y0 = fr + oy * (h / 2 - fr + mu / 2);
    const px0 = ox ? w / 2 + mu / 2 : fr, py0 = oy ? h / 2 + mu / 2 : fr, pw = (w - 2 * fr - mu) / 2, ph = (h - 2 * fr - mu) / 2;
    cv.stroke([[px0 + pw * 0.12, py0 + ph * 0.55], [px0 + pw * 0.5, py0 + ph * 0.12]], 5 * K, 2 * K, [255, 252, 230], [255, 252, 230], 0.45);
  }
  cv.modulate(grain(w, seed + 9, w / 2, 0.025));
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A door: upright boards with an arched head, two iron straps, a ring. (128 x 256)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function door(w, h, { seed = 8401, W, M } = {}) {
  const K = w / 128;
  const rng = new RNG(seed);
  const WR = ramp(W), MR = ramp(M), cv = new Canvas(w, [0, 0, 0], { h });
  const gV = fbmWH(w, h, seed + 1, 20, 3, 0.55, 3), blot = fbmWH(w, h, seed + 2, 3, 3), brush = fbmWH(w, h, seed + 3, 40, 2, 0.5, 2);
  const height = new Float32Array(w * h), boards = 4, arc = w / 2, straps = [[0.34, 0.44], [0.74, 0.84]].map(([a, b]) => [a * h, b * h]), tmp = [0, 0, 0];
  const frameW = 12 * K;
  cv.fillWith((x, y, out) => {
    const k = y * w + x;
    // the arched head: outside the arch the wall's frame colour (dark), and a rim of the arch itself
    let dOut = Math.min(x, w - 1 - x);
    if (y < arc) dOut = Math.min(dOut, arc - Math.hypot(x + 0.5 - w / 2, y + 0.5 - arc));
    if (dOut < 0) { WR(0.05, out); height[k] = 0; return; }
    const u = (x / w) * boards, id = Math.floor(u), fu = u - id, dgap = Math.min(fu, 1 - fu) * (w / boards);
    const inStrap = straps.some(([a, b]) => y >= a && y <= b);
    if (inStrap) {
      const [a, b] = straps.find(([a2, b2]) => y >= a2 && y <= b2), edge = Math.min(y - a, b - y);
      MR(clamp(0.5 + (brush[k] - 0.5) * 0.3 + 0.2 * smoothstep(0, 4 * K, edge) - 0.16 * (1 - smoothstep(0, 3 * K, edge))), out);
      height[k] = 0.6 * smoothstep(0, 3.5 * K, edge) + 0.3;
    } else {
      WR(clamp(0.46 + 0.16 * (h01(id, seed) - 0.5) + (gV[k] - 0.5) * 0.42 + (blot[k] - 0.5) * 0.14), out);
      let hg = 0.3;
      if (dgap < 2.4 * K) { const g = 1 - smoothstep(0.3 * K, 2.4 * K, dgap); out[0] *= 1 - 0.7 * g; out[1] *= 1 - 0.7 * g; out[2] *= 1 - 0.7 * g; hg -= 0.3 * g; }
      if (dOut < frameW) { out[0] *= 0.62 + 0.38 * smoothstep(0, frameW, dOut); out[1] *= 0.62 + 0.38 * smoothstep(0, frameW, dOut); out[2] *= 0.62 + 0.38 * smoothstep(0, frameW, dOut); hg -= 0.2 * (1 - smoothstep(0, frameW, dOut)); }
      height[k] = hg;
    }
  });
  cv.shade(height, 2.2);
  const ao = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (const [a, b] of straps) { const d = y < a ? a - y : y > b ? y - b : -1; if (d >= 0) s -= 0.34 * (1 - smoothstep(0, 6 * K, d)); } ao[y * w + x] = s; }
  cv.modulate(ao);
  for (const [a, b] of straps) for (const fx of [0.14, 0.38, 0.62, 0.86]) rivet(cv, fx * w, (a + b) / 2, 3.8 * K, [30, 28, 40], [100, 98, 120], [236, 234, 250]);
  // the ring: a plate and an iron ring that hangs from it
  const rx = 0.78 * w, ry = 0.58 * h;
  cv.soft(rx + 2 * K, ry + 3 * K, 12 * K, [10, 6, 4], 0.5);
  cv.soft(rx, ry, 10 * K, [50, 48, 64], 1); cv.soft(rx - 2 * K, ry - 2 * K, 7 * K, [120, 118, 140], 1);
  for (let a = 0; a < 6.283; a += 0.1) cv.soft(rx + Math.cos(a) * 9 * K, ry + 8 * K + Math.sin(a) * 9 * K, 2.4 * K, a > 3.4 && a < 5.9 ? [210, 208, 224] : [60, 58, 76], 0.9);
  cv.modulate(grain(w, seed + 9, w / 2, 0.03, h));
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A banner: a hanging cloth, a gold border, a field that is darker, a lantern in the middle and a jewel under it, a rod and a fringe. (128 x 256)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function banner(w, h, { seed = 8501, P, G, W } = {}) {
  const K = w / 128;
  const rng = new RNG(seed);
  const PR = ramp(P), GR = ramp(G), WR = ramp(W), cv = new Canvas(w, [0, 0, 0], { h });
  const weaveF = fbmWH(w, h, seed + 1, 40, 2, 0.5, 60), blot = fbmWH(w, h, seed + 2, 3, 3), fold = fbmWH(w, h, seed + 3, 3, 2, 0.5, 2);
  const rod = 12 * K, fringe = 22 * K, bd = 12 * K, bw = 8 * K, height = new Float32Array(w * h), tmp = [0, 0, 0];
  cv.fillWith((x, y, out) => {
    const k = y * w + x;
    if (y < rod) { WR(clamp(0.5 + 0.3 * (1 - y / rod) + (blot[k] - 0.5) * 0.2 - (y > rod - 3 * K ? 0.25 : 0)), out); height[k] = 0.6; return; }
    if (y > h - fringe) {                                                                         // a fringe of gold threads
      const t = (x / w) * 16, fr = t - Math.floor(t), thread = 1 - smoothstep(0.38, 0.5, Math.abs(fr - 0.5)), len = (y - (h - fringe)) / fringe;
      GR(clamp(0.65 + 0.3 * (1 - len) - 0.2 * (1 - thread) + (weaveF[k] - 0.5) * 0.2), out);
      if (len > 0.55 && thread < 0.5) { out[0] = out[1] = out[2] = 0; }
      height[k] = 0.1;
      return;
    }
    const dEdge = Math.min(x, w - 1 - x, y - rod, h - fringe - 1 - y);
    const inBorder = dEdge >= bd && dEdge < bd + bw, inField = dEdge >= bd + bw + 2 * K;
    if (inBorder) { GR(clamp(0.55 + (weaveF[k] - 0.5) * 0.25 + 0.25 * smoothstep(0, 3 * K, dEdge - bd) * (1 - smoothstep(bw - 3 * K, bw, dEdge - bd))), out); height[k] = 0.5; return; }
    PR(clamp((inField ? 0.28 : 0.46) + (weaveF[k] - 0.5) * 0.12 + (blot[k] - 0.5) * 0.1 + (fold[k] - 0.5) * 0.12), out);
    height[k] = (weaveF[k] - 0.5) * 0.08 + (fold[k] - 0.5) * 0.2;
  });
  cv.shade(height, 1.4);
  // the lantern: a gold cap, a body and a foot, glowing at its heart
  const cx = w / 2, cy = h * 0.4;
  cv.soft(cx, cy, 40 * K, [255, 190, 70], 0.28, 56 * K);
  leaf(cv, cx, cy - 46 * K, Math.PI / 2, 24 * K, 26 * K, GR(0.2, [0, 0, 0]), GR(0.85, [0, 0, 0]), 1, 0.1);        // the cap, pointing down
  leaf(cv, cx, cy - 28 * K, Math.PI / 2, 68 * K, 46 * K, GR(0.25, [0, 0, 0]), GR(0.9, [0, 0, 0]), 1, 0.05);      // the body
  cv.soft(cx - 2 * K, cy - 2 * K, 13 * K, [255, 250, 210], 0.95, 22 * K);
  leaf(cv, cx, cy + 38 * K, Math.PI / 2, 20 * K, 16 * K, GR(0.2, [0, 0, 0]), GR(0.8, [0, 0, 0]), 1, 0.1);
  // a jewel below
  const jy = h * 0.72;
  leaf(cv, cx, jy - 16 * K, Math.PI / 2, 32 * K, 26 * K, GR(0.25, [0, 0, 0]), GR(0.95, [0, 0, 0]), 1, 0.2);
  cv.soft(cx - 2 * K, jy - 2 * K, 4 * K, [255, 250, 220], 0.9);
  cv.modulate(grain(w, seed + 9, w / 2, 0.025, h));
  return cv;
}
