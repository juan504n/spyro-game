// The painted skybox: a whole sky painted in floating point as one panorama (azimuth round, elevation up from just under the horizon), the way the PS1 game's skies are painted pictures and not
// gradients. DOM-free and deterministic (the same spec gives the same sky), so a tool can paint one in node and look at it.
//
// A spec describes what the painter lays down, bottom to top (every part but `grad` is optional; angles are degrees; azimuth is measured as everywhere in the game, from +x towards +z):
//   grad     [[el, [r, g, b]], ...]       the colour straight up the sky (0..1 rgb), from below the horizon to the zenith, smooth between the stops
//   bend     { amp, k }                   the gradient swings up and down round the sky (amp degrees, k waves round): the colours sweep in arcs and are not level
//   washes   [{ az, el, rx, ry, c, a, add }]   a soft oval of colour (rx, ry degrees wide and high; `add`: it lights instead of covering)
//   clouds   [{ el: [lo, hi], cx, cy, th, soft, lit, shade, rim, a, bend, oct, seed }]   banks of cloud: a noise field cut at `th`; its top edges are lit and its bottoms shaded; cx / cy are the noise
//            cells round the sky and up it, so a low cy / high cx gives long streaks (stratus) and a high cy gives lumps (cumulus)
//   aurora   [{ el, n, amp, lo, hi, a, seed }]   curtains of light round the sky: n ribbons about `el` (degrees), swinging amp degrees, colour lo (their foot) to hi (up)
//   peaks    [{ kind, base, h: [min, max], n, c: [foot, mid, top], snow, haze, a, seed }]   a far range standing on the horizon: kind 'cones' (rounded, snow-capped), 'crag' (low-poly facets), 'rolling'
//   bodies   [{ az, el, r, c: [lit, shade], alpha, glow, ring: { ratio, tilt, c, w }, seed }]   a moon, a planet (with a ring)
//   stars    { n, el: [lo, hi], c, size, a, seed }   small four-pointed sparkles
//   fog      [r, g, b]                    what is under the horizon (the world's own fog, so that the ground fades into the sky)
//
// paintSky(spec, { w, h, fog }) -> { data: Uint8Array RGBA (opaque), w, h }: row 0 is the lowest elevation (EL_MIN), so the picture is the texture of the dome as it stands (v = 0 at the bottom).
import { fbmWH, RNG } from '../../engine/textures/hd/kit.js';

export const EL_MIN = -14;
export const EL_MAX = 90;
const SPAN = EL_MAX - EL_MIN;
const D2R = Math.PI / 180;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = (a - b) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };

/** a colour LUT from stops [[el, rgb]...]: smooth between neighbours; 1024 entries from EL_MIN to EL_MAX */
function gradLut(stops) {
  const n = 1024, lut = new Float32Array(n * 3);
  const s = stops.slice().sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < n; i++) {
    const el = EL_MIN + (i / (n - 1)) * SPAN;
    let k = 0;
    while (k < s.length - 1 && el > s[k + 1][0]) k++;
    const a = s[k], b = s[Math.min(k + 1, s.length - 1)];
    const t = a === b || b[0] === a[0] ? 0 : sstep(a[0], b[0], clamp(el, a[0], b[0]));
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = mix(a[1][c], b[1][c], t);
  }
  return lut;
}

/** one pixel's elevation (degrees) of row y */
const elOf = (y, h) => EL_MIN + ((y + 0.5) / h) * SPAN;
const azOf = (x, w) => ((x + 0.5) / w) * 360;
/** the row of an elevation */
const rowOf = (el, h) => ((el - EL_MIN) / SPAN) * h - 0.5;

/** the game's colour grade (engine/shaders.js vividGrade, strength k), on one colour */
function grade(c, k) {
  let r = Math.pow(c[0], 1 / (1 + 0.62 * k)), g = Math.pow(c[1], 1 / (1 + 0.62 * k)), b = Math.pow(c[2], 1 / (1 + 0.62 * k));
  r *= 1 + 0.14 * k; g *= 1 + 0.10 * k; b *= 1 + 0.02 * k;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = (mx - mn) / Math.max(mx, 0.001), l = 0.299 * r + 0.587 * g + 0.114 * b, f = 1 + k * (0.55 + 0.85 * (1 - sat));
  r = clamp(l + (r - l) * f); g = clamp(l + (g - l) * f); b = clamp(l + (b - l) * f);
  const s = 0.25 * k;
  return [mix(r, r * r * (3 - 2 * r), s), mix(g, g * g * (3 - 2 * g), s), mix(b, b * b * (3 - 2 * b), s)];
}
/** the colour that the grade turns into `t` (found by a few steps of correction): a sky painted in the colours it should have on the screen is put through the inverse of the grade the screen will apply */
function ungrade(t, k, out) {
  let x = t[0], y = t[1], z = t[2];
  for (let i = 0; i < 4; i++) {
    const g = grade([clamp(x), clamp(y), clamp(z)], k);
    x += (t[0] - g[0]) * 0.9; y += (t[1] - g[1]) * 0.9; z += (t[2] - g[2]) * 0.9;
  }
  out[0] = clamp(x); out[1] = clamp(y); out[2] = clamp(z);
}

export function paintSky(spec, { w = 1024, h = 256, fog = null, grade: gradeK = 0 } = {}) {
  const px = new Float32Array(w * h * 3);
  const lut = gradLut(spec.grad);
  const bend = spec.bend || null;
  // the gradient, with its sweep
  for (let x = 0; x < w; x++) {
    const az = azOf(x, w);
    const off = bend ? bend.amp * (Math.sin(az * D2R * Math.round(bend.k || 1) + (bend.ph || 0)) + 0.45 * Math.sin(az * D2R * Math.round(bend.k || 1) * 2 + 1.7 + (bend.ph || 0))) : 0;
    for (let y = 0; y < h; y++) {
      const el = elOf(y, h) - off;
      const f = clamp((el - EL_MIN) / SPAN) * 1023;
      const i0 = Math.floor(f), i1 = Math.min(1023, i0 + 1), t = f - i0;
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) px[o + c] = mix(lut[i0 * 3 + c], lut[i1 * 3 + c], t);
    }
  }
  // soft ovals of colour
  for (const wa of spec.washes || []) {
    const ry = wa.ry || 20, rx = wa.rx || 40, a0 = wa.a ?? 0.6, add = !!wa.add, pw = wa.pow || 1;
    const y0 = Math.max(0, Math.floor(rowOf(wa.el - ry * 3, h))), y1 = Math.min(h - 1, Math.ceil(rowOf(wa.el + ry * 3, h)));
    for (let y = y0; y <= y1; y++) {
      const el = elOf(y, h), dy = (el - wa.el) / ry, cosE = Math.max(0.2, Math.cos(el * D2R));
      for (let x = 0; x < w; x++) {
        const dx = (angDiff(azOf(x, w), wa.az) * cosE) / rx;
        const r2 = dx * dx + dy * dy;
        if (r2 > 9) continue;
        const g = Math.pow(Math.exp(-0.5 * r2), pw) * a0, o = (y * w + x) * 3;
        if (add) { px[o] += wa.c[0] * g; px[o + 1] += wa.c[1] * g; px[o + 2] += wa.c[2] * g; }
        else { const k = clamp(g); px[o] = mix(px[o], wa.c[0], k); px[o + 1] = mix(px[o + 1], wa.c[1], k); px[o + 2] = mix(px[o + 2], wa.c[2], k); }
      }
    }
  }
  // banks of cloud
  for (const cl of spec.clouds || []) paintClouds(px, w, h, cl);
  // curtains of light
  for (const au of spec.aurora || []) paintAurora(px, w, h, au);
  // a far range
  for (const pk of spec.peaks || []) paintPeaks(px, w, h, pk);
  // bodies
  for (const bd of spec.bodies || []) paintBody(px, w, h, bd);
  // stars
  if (spec.stars) paintStars(px, w, h, spec.stars);
  // 8 bits, with a hair of noise so that the long slow gradients do not band
  const data = new Uint8Array(w * h * 4);
  const rng = new RNG(31337);
  // (under the horizon it is the world's fog as the world draws it, raw: the ground's own fog goes through the screen's grade too, so the two meet; the sky above is put through the inverse of the grade)
  const fg = fog || spec.fog || null;
  const tmp = [0, 0, 0], t3 = [0, 0, 0];
  for (let i = 0, n = w * h; i < n; i++) {
    const j = (rng.next() - 0.5) * 0.9;
    let r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2];
    if (gradeK > 0) { t3[0] = clamp(r); t3[1] = clamp(g); t3[2] = clamp(b); ungrade(t3, gradeK, tmp); r = tmp[0]; g = tmp[1]; b = tmp[2]; }
    if (fg) { const k = 1 - sstep(-6, 1.5, elOf(Math.floor(i / w), h)); if (k > 0) { r = mix(r, fg[0], k); g = mix(g, fg[1], k); b = mix(b, fg[2], k); } }
    data[i * 4] = clamp(r * 255 + j, 0, 255); data[i * 4 + 1] = clamp(g * 255 + j, 0, 255); data[i * 4 + 2] = clamp(b * 255 + j, 0, 255); data[i * 4 + 3] = 255;
  }
  return { data, w, h };
}

// ---- clouds ----------------------------------------------------------------------------------------------------------------------------
function paintClouds(px, w, h, cl) {
  const cx = cl.cx || 6, cy = cl.cy || 22, th = cl.th ?? 0.5, soft = cl.soft ?? 0.18, a0 = cl.a ?? 0.9;
  const n = fbmWH(w, h, (cl.seed || 1) * 7919, cx, cl.oct || 4, cl.gain || 0.55, cy);
  const [e0, e1] = cl.el, fade = cl.fade ?? Math.max(1.5, (e1 - e0) * 0.28);
  const lit = cl.lit || [1, 1, 1], shade = cl.shade || [0.7, 0.6, 0.8], rim = cl.rim || null, light = cl.light ?? 5;
  const bd = cl.bend || { amp: 0, k: 2 };
  const rowsPerDeg = h / SPAN;
  for (let x = 0; x < w; x++) {
    const az = azOf(x, w);
    const kk = Math.round(bd.k || 2), off = bd.amp * (Math.sin(az * D2R * kk + (bd.ph || 0)) + 0.5 * Math.sin(az * D2R * kk * 2 + 0.9));     // (degrees the bank is lifted at this azimuth)
    const offRows = off * rowsPerDeg;
    for (let y = 0; y < h; y++) {
      const el = elOf(y, h) - off;
      if (el < e0 - fade || el > e1 + fade) continue;
      const env = sstep(e0 - fade, e0 + fade, el) * (1 - sstep(e1 - fade, e1 + fade, el));
      if (env <= 0.002) continue;
      const ys = clamp(y - offRows, 3, h - 4), yi = Math.floor(ys), yf = ys - yi;
      const at = (row) => { const r0 = clamp(row, 0, h - 2); return n[r0 * w + x] * (1 - yf) + n[(r0 + 1) * w + x] * yf; };
      const v = at(yi);
      const d = (v - th) / soft;
      const m = clamp(d * 0.5 + 0.5) * env * a0;
      if (m <= 0.003) continue;
      // the lit top, the shaded bottom: the way the density runs up the bank
      const up = at(yi + 3) - at(yi - 3);            // (rows run up the sky: > 0 where the cloud thickens upward: a lower edge)
      const L = clamp(0.5 - up * light);
      const dens = clamp(d * 0.35 + 0.5);
      let r = mix(shade[0], lit[0], L), g = mix(shade[1], lit[1], L), b = mix(shade[2], lit[2], L);
      if (rim) { const rg = clamp(1 - Math.abs(d) * 1.6) * 0.8 * L; r = mix(r, rim[0], rg); g = mix(g, rim[1], rg); b = mix(b, rim[2], rg); }
      void dens;
      const o = (y * w + x) * 3;
      px[o] = mix(px[o], r, m); px[o + 1] = mix(px[o + 1], g, m); px[o + 2] = mix(px[o + 2], b, m);
    }
  }
}

// ---- aurora ----------------------------------------------------------------------------------------------------------------------------
function paintAurora(px, w, h, au) {
  const rib = au.n || 3, a0 = au.a ?? 0.7;
  const rng = new RNG((au.seed || 1) * 104729);
  const ribs = [];
  for (let i = 0; i < rib; i++) ribs.push({ base: au.el + (i - (rib - 1) / 2) * (au.gap ?? 5) + (rng.next() - 0.5) * 3, amp: au.amp * (0.6 + rng.next() * 0.8), k: 2 + Math.floor(rng.next() * 3), ph: rng.next() * 6.28, ph2: rng.next() * 6.28, wlo: au.wlo || 1.4, whi: (au.whi || 9) * (0.7 + rng.next() * 0.6), gain: 0.55 + rng.next() * 0.45 });
  const mod = fbmWH(w, 2, (au.seed || 1) * 31, 7, 3, 0.5, 1);
  const fine = fbmWH(w, 2, (au.seed || 1) * 53, 90, 2, 0.5, 1);
  const lo = au.lo, hi = au.hi;
  const centres = ribs.map((r) => { const c = new Float32Array(w); for (let x = 0; x < w; x++) { const az = azOf(x, w) * D2R; c[x] = r.base + r.amp * (Math.sin(az * r.k + r.ph) + 0.5 * Math.sin(az * r.k * 3 + r.ph2)); } return c; });
  for (let x = 0; x < w; x++) {
    const b = 0.25 + 0.75 * sstep(0.28, 0.72, mod[x]);
    const ray = 0.7 + 0.3 * fine[x];
    for (let ri = 0; ri < ribs.length; ri++) {
      const r = ribs[ri], c = centres[ri][x];
      const y0 = Math.max(0, Math.floor(rowOf(c - r.wlo * 3, h))), y1 = Math.min(h - 1, Math.ceil(rowOf(c + r.whi * 3, h)));
      for (let y = y0; y <= y1; y++) {
        const d = elOf(y, h) - c;
        const prof = d < 0 ? Math.exp(-(d * d) / (r.wlo * r.wlo)) : Math.exp(-(d * d) / (r.whi * r.whi));
        const g = prof * b * ray * r.gain * a0, t = clamp(d / (r.whi * 1.4));
        const o = (y * w + x) * 3, cr = mix(lo[0], hi[0], t), cg = mix(lo[1], hi[1], t), cb = mix(lo[2], hi[2], t);
        if (au.mix) { const k = clamp(g); px[o] = mix(px[o], cr, k); px[o + 1] = mix(px[o + 1], cg, k); px[o + 2] = mix(px[o + 2], cb, k); }      // (over a bright sky the light covers it, it does not add to it)
        else { px[o] += cr * g; px[o + 1] += cg * g; px[o + 2] += cb * g; }
      }
    }
  }
}

// ---- peaks -----------------------------------------------------------------------------------------------------------------------------
function paintPeaks(px, w, h, pk) {
  const rng = new RNG((pk.seed || 1) * 7907);
  const [hMin, hMax] = pk.h, n = pk.n || 9, base = pk.base ?? 0, kind = pk.kind || 'cones';
  const top = new Float32Array(w);            // the ridge line at each column: elevation in degrees
  if (kind === 'crag') {
    // coarse points joined by straight lines: the low-poly ridge
    const step = pk.step || 5, pts = Math.ceil(360 / step);
    const hs = []; for (let i = 0; i < pts; i++) hs.push(hMin + (hMax - hMin) * Math.pow(rng.next(), 1.3));
    for (let x = 0; x < w; x++) { const f = (azOf(x, w) / 360) * pts, i = Math.floor(f) % pts, t = f - Math.floor(f); top[x] = base + mix(hs[i], hs[(i + 1) % pts], t); }
  } else if (kind === 'rolling') {
    const f = fbmWH(w, 2, (pk.seed || 1) * 17, n, 3, 0.5, 1);
    for (let x = 0; x < w; x++) top[x] = base + hMin + (hMax - hMin) * f[x];
  } else {
    // cones: bell-shaped peaks with a point at the top
    const peaks = [];
    for (let i = 0; i < n; i++) peaks.push({ az: ((i + rng.next() * 0.8) / n) * 360, h: hMin + (hMax - hMin) * Math.pow(rng.next(), 0.75), w: 11 + rng.next() * 12 });
    for (let x = 0; x < w; x++) {
      const az = azOf(x, w);
      let m = 0;
      for (const p of peaks) { const d = Math.abs(angDiff(az, p.az)) / p.w; if (d < 1) m = Math.max(m, p.h * (0.8 * Math.pow(1 - d * d, 1.6) + 0.2 * Math.pow(1 - d, 4))); }
      top[x] = base + m;
    }
    // the ridge is not a clean curve: shoulders and notches along it, more where the peak is high
    const dn = fbmWH(w, 2, (pk.seed || 1) * 61, 36, 3, 0.55, 1);
    for (let x = 0; x < w; x++) top[x] += (dn[x] - 0.5) * hMax * 0.34 * sstep(0, hMax * 0.45, top[x] - base);
  }
  const [cFoot, cMid, cTop] = pk.c, haze = pk.haze || cFoot, a0 = pk.a ?? 1;
  const snow = pk.snow || null, snowAt = pk.snowAt ?? 0.58;
  const sn = fbmWH(w, 8, (pk.seed || 1) * 5, 40, 2, 0.5, 4);
  for (let x = 0; x < w; x++) {
    const xl = (x + w - 2) % w, xr = (x + 2) % w;
    const R = kind === 'crag' ? 6 : 16;
    let sl = 0; for (let k = 1; k <= R; k++) sl += top[(x + k) % w] - top[(x - k + w) % w];
    void xl; void xr;
    const slope = (sl / R) * (w / 360) / (2 * (R + 1) / 2);               // (> 0 where the ridge rises to the right: that face looks to the left, to the light; smoothed, so that a rounded peak shades round)
    const tp = top[x], aa = Math.max(0.45, Math.abs(top[(x + 1) % w] - top[(x - 1 + w) % w]) * 0.6);   // (a steep side needs a soft edge as wide as the ridge moves from column to column)
    const y1 = Math.min(h - 1, Math.ceil(rowOf(tp + 1, h))), y0 = Math.max(0, Math.floor(rowOf(base - 8, h)));
    for (let y = y0; y <= y1; y++) {
      const el = elOf(y, h), edge = (tp - el);                           // (degrees under the ridge line)
      const cover = clamp(edge / aa + 0.5) * a0;
      if (cover <= 0.002) continue;
      const height = Math.max(0.5, tp - base), t = clamp((el - base) / height);
      let r, g, b;
      if (t < 0.5) { const k = t / 0.5; r = mix(cFoot[0], cMid[0], k); g = mix(cFoot[1], cMid[1], k); b = mix(cFoot[2], cMid[2], k); }
      else { const k = (t - 0.5) / 0.5; r = mix(cMid[0], cTop[0], k); g = mix(cMid[1], cTop[1], k); b = mix(cMid[2], cTop[2], k); }
      // faces to the light are bright, those away from it dim
      const facing = clamp(slope * (kind === 'crag' ? 1.5 : 1.6), -1, 1);
      const grain = 0.9 + 0.2 * sn[(y % 8) * w + x];                   // (the rock is not one flat tone)
      const lightK = (1 + 0.22 * facing) * grain;
      r *= lightK; g *= lightK; b *= lightK;
      if (snow) {
        const sv = sn[(y % 8) * w + x];
        const s = sstep(snowAt - 0.06, snowAt + 0.1, t + (sv - 0.5) * 0.18);
        const sh = 1 + 0.12 * facing;
        r = mix(r, snow[0] * sh, s); g = mix(g, snow[1] * sh, s); b = mix(b, snow[2] * sh, s);
      }
      // the foot of the range goes into the haze
      const hz = Math.pow(1 - t, 0.9) * (pk.hazeAmt ?? 0.75);
      r = mix(r, haze[0], hz * 0.6); g = mix(g, haze[1], hz * 0.6); b = mix(b, haze[2], hz * 0.6);
      const o = (y * w + x) * 3, k = cover * (1 - hz * 0.9) * sstep(0, pk.solid ?? 0.5, t);          // (and the foot of it thins out into the sky behind: a far range stands in mist)
      px[o] = mix(px[o], r, k); px[o + 1] = mix(px[o + 1], g, k); px[o + 2] = mix(px[o + 2], b, k);
    }
  }
}

// ---- bodies: moons and planets -------------------------------------------------------------------------------------------------------
function paintBody(px, w, h, bd) {
  const r = bd.r, alpha = bd.alpha ?? 1, [lit, shade] = bd.c;
  const nz = fbmWH(256, 128, (bd.seed || 1) * 13, 6, 4, 0.55, 3);
  const glow = bd.glow || null;
  const cosE = Math.max(0.2, Math.cos(bd.el * D2R));
  const reach = (bd.ring ? r * (bd.ring.w ? bd.ring.ratio + bd.ring.w : bd.ring.ratio + 0.4) : r) * (glow ? glow.r || 2.2 : 1.25) + 2;
  const y0 = Math.max(0, Math.floor(rowOf(bd.el - reach, h))), y1 = Math.min(h - 1, Math.ceil(rowOf(bd.el + reach, h)));
  const tilt = (bd.ring ? bd.ring.tilt || 0 : 0) * D2R, ct = Math.cos(tilt), st = Math.sin(tilt);
  const L = [-0.55, 0.6, 0.58];
  for (let y = y0; y <= y1; y++) {
    const el = elOf(y, h);
    for (let x = 0; x < w; x++) {
      const dx = (angDiff(azOf(x, w), bd.az) * cosE) / r, dy = (el - bd.el) / r;
      const rr = Math.hypot(dx, dy);
      if (rr > reach / r) continue;
      const o = (y * w + x) * 3;
      if (glow && rr > 1) {
        const gg = Math.exp(-((rr - 1) * (rr - 1)) / ((glow.r ? glow.r / 2 : 1) * (glow.r ? glow.r / 2 : 1) * 0.5)) * (glow.a ?? 0.3);
        px[o] += glow.c[0] * gg; px[o + 1] += glow.c[1] * gg; px[o + 2] += glow.c[2] * gg;
      }
      // a ring: an ellipse tilted on the sky; its far half is behind the planet
      let ringA = 0, ringFront = false, ringC = null;
      if (bd.ring) {
        const rg = bd.ring, ratio = rg.ratio || 1.9, wd = rg.w || 0.5, q = rg.flat || 0.3;
        const u = dx * ct + dy * st, v = (-dx * st + dy * ct) / q, rad = Math.hypot(u, v);
        const d = Math.abs(rad - ratio) / (wd * 0.5);
        if (d < 1) { ringA = (1 - d * d) * (rg.a ?? 0.85); ringFront = v < 0; ringC = rg.c; }
      }
      if (ringA > 0 && !ringFront && rr < 1) ringA = 0;
      if (ringA > 0 && !(ringFront === false && rr < 1)) { /* painted after the disc if in front */ }
      if (rr < 1.04) {
        const edge = 1 - sstep(0.96, 1.0, rr);
        const nzv = Math.sqrt(Math.max(0, 1 - rr * rr)), nx = dx, ny = -dy;
        const dif = clamp(nx * L[0] + ny * L[1] + nzv * L[2]);
        const tx = ((Math.atan2(dx, nzv + 0.001) / Math.PI + 1) * 0.5 * 255) | 0, ty = clamp((ny * 0.5 + 0.5)) * 127 | 0;
        const blot = nz[ty * 256 + (tx % 256)] - 0.5;
        const k = clamp(dif * 1.15 + blot * (bd.blot ?? 0.5));
        const cr = mix(shade[0], lit[0], k), cg = mix(shade[1], lit[1], k), cb = mix(shade[2], lit[2], k);
        const m = edge * alpha;
        px[o] = mix(px[o], cr, m); px[o + 1] = mix(px[o + 1], cg, m); px[o + 2] = mix(px[o + 2], cb, m);
      }
      if (ringA > 0 && (ringFront || rr >= 1.0)) { px[o] = mix(px[o], ringC[0], ringA); px[o + 1] = mix(px[o + 1], ringC[1], ringA); px[o + 2] = mix(px[o + 2], ringC[2], ringA); }
    }
  }
}

// ---- stars -----------------------------------------------------------------------------------------------------------------------------
function paintStars(px, w, h, st) {
  const rng = new RNG((st.seed || 1) * 3331);
  const [e0, e1] = st.el || [6, 80];
  for (let i = 0; i < (st.n || 30); i++) {
    const az = rng.next() * 360, el = mix(e0, e1, Math.pow(rng.next(), 0.8));
    const size = (st.size || 1) * (0.5 + rng.next()), a0 = (st.a ?? 1) * (0.5 + rng.next() * 0.5);
    const cosE = Math.max(0.2, Math.cos(el * D2R)), reach = size * 3.2;
    const y0 = Math.max(0, Math.floor(rowOf(el - reach, h))), y1 = Math.min(h - 1, Math.ceil(rowOf(el + reach, h)));
    const xr = Math.ceil((reach / cosE) * (w / 360)) + 1, xc = Math.round((az / 360) * w - 0.5);
    for (let y = y0; y <= y1; y++) {
      const dy = (elOf(y, h) - el) / size;
      for (let xx = xc - xr; xx <= xc + xr; xx++) {
        const x = ((xx % w) + w) % w;
        const dx = (angDiff(azOf(x, w), az) * cosE) / size;
        const core = Math.exp(-(dx * dx + dy * dy) * 3.2);
        const arm = Math.exp(-Math.abs(dy) * 6) * Math.exp(-dx * dx * 0.55) * 0.55 + Math.exp(-Math.abs(dx) * 6) * Math.exp(-dy * dy * 0.55) * 0.55;
        const g = clamp((core + arm) * a0);
        if (g < 0.01) continue;
        const o = (y * w + x) * 3;
        px[o] = mix(px[o], st.c[0], g); px[o + 1] = mix(px[o + 1], st.c[1], g); px[o + 2] = mix(px[o + 2], st.c[2], g);
      }
    }
  }
}
