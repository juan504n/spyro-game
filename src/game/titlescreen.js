// The first minutes of the game, drawn in code (nothing here is taken from any game): the dusk picture shown while the world is built, the logo of the title screen and the timing of its opening.
//
// The title screen is inspired by how the PlayStation games of the genre open: a hero who comes into the scene and lands, a chunky logotype in the hero's own colours (a purple with a gold outline)
// over a ring of chrome, a second line under it that drips, and a small lower-case "press start" at the bottom. Everything is made of Pix, the same 1-bit-alpha buffers as the rest of the HUD.
import { Pix, ditherPick } from '../engine/textures/pix.js';
import { drawText } from '../engine/textures/font.js';
import { makeLogo } from '../engine/textures/ui.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const ease = (t) => t * t * (3 - 2 * t);

/** the seconds of the opening, from the moment the world is built: Spyro glides in, lands, the logo drops, "press start" comes up */
export const OPEN = {
  fly: 6.6,           // touches the ground
  logoAt: 4.8,        // the logo starts to drop in
  logoDur: 1.1,
  subAt: 5.8,         // the second line, under it
  cheerAt: 7.4,       // he cheers once he has landed
  cheerDur: 1.3,
  pressAt: 8.8,       // "press start" and the keys that start the game
};

// ---------------------------------------------------------------------------------------------------------------------------------------------
// The logo
// ---------------------------------------------------------------------------------------------------------------------------------------------

/**
 * The plate of the logo: a ring of chrome (light on the upper left, dark underneath, a bright rim) round a SOLID dark plate that the letters stand on, as the metal-rimmed plaque behind the
 * logo of the old title screens (here, a made-up one). The shape is a squircle (a superellipse), not an ellipse, so that the corners of a wide word lie on the plate and not over the rim.
 * `thick` is the width of the ring in pixels.
 */
function chromePlate(w, h, thick) {
  const p = new Pix(w, h);
  const cx = w / 2, cy = h / 2, P = 3.4;
  const bands = ['#2a2640', '#5a5878', '#9a98b8', '#d8d8ec', '#ffffff', '#c4c4dc', '#7c7a9c', '#403c5c'];
  const plate = ['#2c1666', '#241258', '#1c0c46', '#140836'];                          // (solid violet, a little lighter at the top)
  const norm = (dx, dy, rx, ry) => (Math.abs(dx / rx) ** P + Math.abs(dy / ry) ** P) ** (1 / P);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = norm(dx, dy, w / 2 - 1, h / 2 - 1);
      if (d > 1) continue;
      const di = norm(dx, dy, w / 2 - 1 - thick, h / 2 - 1 - thick);
      if (di <= 1) { p.set(x, y, ditherPick(plate, clamp((y / h) * 1.15 - 0.05), x, y)); continue; }
      // across the band (0 outside .. 1 inside) and round the ring: the highlight sits on the upper left
      const across = clamp((1 - d) / (1 - norm(dx, dy, w / 2 - 1, h / 2 - 1) + (di - d) + 1e-6)), ang = Math.atan2(dy, dx);
      const light = 0.5 + 0.5 * Math.cos(ang + 2.4), s = Math.sin(across * Math.PI);
      p.set(x, y, ditherPick(bands, clamp(0.1 + 0.45 * s + 0.45 * light * s ** 0.7 - 0.12 * (1 - across)), x, y));
    }
  }
  return p;
}

/** drips under a line of text: some of the letters' lowest pixels run down in a thin streak of the fill's colour, ending in a drop */
function drip(pix, color, seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const out = new Pix(pix.w, pix.h + 14);
  out.blit(pix, 0, 0);
  const lowest = new Array(pix.w).fill(-1);
  for (let x = 0; x < pix.w; x++) for (let y = pix.h - 1; y >= 0; y--) if (pix.data[(y * pix.w + x) * 4 + 3] >= 128) { lowest[x] = y; break; }
  for (let x = 3; x < pix.w - 3; x += 1) {
    if (lowest[x] < 0 || lowest[x - 1] < 0 || lowest[x + 1] < 0 || lowest[x + 2] < 0 || rnd() > 0.035) continue;
    const len = 4 + Math.floor(rnd() * 8), y0 = lowest[x] - 1;
    for (let k = 0; k < len; k++) { out.set(x, y0 + k, color); out.set(x + 1, y0 + k, color); }
    for (const [dx, dy] of [[-1, 0], [0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [0, 2], [1, 2]]) out.set(x + dx, y0 + len + dy - 1, color);       // (the drop at the end: a blob wider than the streak)
  }
  return out;
}

/** every picture of the title screen, made once */
export function makeTitleArt() {
  // SPYRO: fat purple letters, light on top and deep violet at the bottom, with a thick gold outline and a dark shadow under it
  const spyro = makeLogo(['SPYRO'], { scale: [6], colors: ['#f0dcff', '#b878f4', '#7a34d0', '#4a1a98'], outline: '#ffc93a', shadow: '#1a0c2c', outlineWidth: 4, shadowOffset: 3, letterSpacing: 0.5, wobble: 1, bevel: 1 });
  // the name of the realm, in the warm colours of the old second line: orange letters, a green outline, and drips
  const valeFlat = makeLogo(['GLOAMING VALE'], { scale: [3], colors: ['#ffe27a', '#ffa21c', '#f06a14'], outline: '#2c7a26', shadow: '#10200c', outlineWidth: 2, shadowOffset: 2, letterSpacing: 1, wobble: 1 });
  const vale = drip(valeFlat, '#f08a1c', 7);
  const ring = chromePlate(Math.round(spyro.w * 1.3), Math.round(spyro.h * 1.8), 7);
  return { spyro, vale, ring };
}

/**
 * Draw the logo of the title screen at time `t` seconds into the opening (the caller says when it has finished dropping in: t >= OPEN.logoAt + OPEN.logoDur).
 * Layout: the ring and SPYRO share a centre `cy` near the top of the frame; the second line hangs under them.
 */
export function drawLogo(pix, art, t, top, bob = 0) {
  const W = pix.w;
  const k = clamp((t - OPEN.logoAt) / OPEN.logoDur);
  if (k <= 0) return { bottom: top };
  // the drop: from above the frame, down past its place, back up, down again (a bounce that settles)
  const bounce = k < 0.55 ? (k / 0.55) ** 2 : 1 - Math.sin((k - 0.55) / 0.45 * Math.PI) * 0.12 * (1 - (k - 0.55) / 0.45);
  const y = Math.round(top - (1 - bounce) * (top + art.spyro.h + 10)) + bob;
  const cy = y + (art.spyro.h >> 1);
  // the ring sweeps in from the sides (it grows from a line to its full height)
  const grow = ease(clamp((t - OPEN.logoAt - 0.15) / 0.7));
  const rh = Math.max(2, Math.round(art.ring.h * grow));
  const rx = (W - art.ring.w) >> 1;
  if (grow > 0.02) {
    for (let j = 0; j < rh; j++) {
      const sy = Math.floor((j / rh) * art.ring.h), dy = cy - (rh >> 1) + j;
      for (let i = 0; i < art.ring.w; i++) {
        const o = (sy * art.ring.w + i) * 4;
        if (art.ring.data[o + 3] >= 128) pix.set(rx + i, dy, [art.ring.data[o], art.ring.data[o + 1], art.ring.data[o + 2], 255]);
      }
    }
  }
  pix.blit(art.spyro, (W - art.spyro.w) >> 1, y);
  // "TM"-style mark of the real thing is not copied: a small star where it would be
  const sx = ((W + art.spyro.w) >> 1) - 4, sy = y + art.spyro.h - 8;
  const star = (cx, cyy, c) => { pix.set(cx, cyy, c); pix.set(cx - 1, cyy, c); pix.set(cx + 1, cyy, c); pix.set(cx, cyy - 1, c); pix.set(cx, cyy + 1, c); };
  if (k >= 1) star(sx, sy, '#fff4b0');
  let bottom = y + art.spyro.h;
  const k2 = clamp((t - OPEN.subAt) / 0.5);
  if (k2 > 0) {
    // the second line slides up from behind the first and stops under it
    const vy = Math.round(y + art.spyro.h - 6 + (1 - ease(k2)) * 14);
    const visible = Math.ceil(art.vale.h * ease(k2));
    const vx = (W - art.vale.w) >> 1;
    for (let j = 0; j < visible; j++) for (let i = 0; i < art.vale.w; i++) {
      const o = (j * art.vale.w + i) * 4;
      if (art.vale.data[o + 3] >= 128) pix.set(vx + i, vy + j, [art.vale.data[o], art.vale.data[o + 1], art.vale.data[o + 2], 255]);
    }
    bottom = vy + art.vale.h;
  }
  return { bottom };
}

/** the small lower-case prompt at the foot of the title, in a purple of its own with a dark outline, blinking (as "press start" does in the old games) */
export function drawPressStart(pix, text, t, y) {
  if (t < OPEN.pressAt) return;
  if (Math.floor((t - OPEN.pressAt) * 2) % 2 !== 0) return;
  drawText(pix, text, pix.w >> 1, y, { style: 'grad', scale: 2, align: 'center', colors: ['#d8b8ff', '#9a5ae0', '#6a30b8'], outlineColor: '#120c1c' });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// The dusk picture: what the first start shows while the world is built, in place of a bar on black
// ---------------------------------------------------------------------------------------------------------------------------------------------

const SKY = ['#1c1244', '#3a1c6c', '#6e2a88', '#b03e8c', '#e8648a', '#ff9a78', '#ffd08c'];
const mountainLine = (x, seed, base, amp) => {
  // a ridge: a few sines of different periods, with a sharper top (jagged like the peaks of the old title screens)
  const a = Math.sin(x * 0.021 + seed) * 0.5 + Math.sin(x * 0.047 + seed * 2.3) * 0.28 + Math.sin(x * 0.11 + seed * 0.7) * 0.12;
  const peak = Math.abs(Math.sin(x * 0.034 + seed * 1.1));
  return base - amp * (a * 0.6 + 0.4 + (1 - peak) * 0.35);
};

let skyCache = null;
/** the sky and the mountains, drawn once per frame size (the lanterns and the stars are drawn over it) */
function duskBackdrop(W, H) {
  if (skyCache && skyCache.w === W && skyCache.h === H) return skyCache;
  const p = new Pix(W, H);
  const horizon = Math.round(H * 0.62);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, ditherPick(SKY, clamp(y / horizon) ** 1.15, x, y));
  // a sun low behind the farthest ridge
  const sx = Math.round(W * 0.68), sy = horizon - 6;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - sx, (y - sy) * 1.2);
    if (d < 16) p.set(x, y, '#fff2b8'); else if (d < 22) p.set(x, y, ditherPick(['#ffd08c', '#fff2b8'], (22 - d) / 6, x, y));
  }
  // three ridges, each nearer one darker and lower: purple at the far end, nearly black at the front
  const ridges = [
    { base: horizon - 2, amp: 46, seed: 0.4, top: '#a04a98', bottom: '#6e2a7c' },
    { base: horizon + 14, amp: 40, seed: 2.1, top: '#6a2a84', bottom: '#3c1a5c' },
    { base: horizon + 36, amp: 34, seed: 4.7, top: '#341a58', bottom: '#1c1038' },
  ];
  for (const r of ridges) {
    for (let x = 0; x < W; x++) {
      const top = Math.round(mountainLine(x, r.seed, r.base, r.amp));
      for (let y = Math.max(0, top); y < H; y++) p.set(x, y, ditherPick([r.top, r.bottom], clamp((y - top) / 60), x, y));
    }
  }
  skyCache = Object.assign(p, { horizon });
  return skyCache;
}

/**
 * The first start's picture while the world is built: a dusk over jagged mountains, a few stars coming out, and five beacon lanterns along the foot of the picture that light one by one as the
 * work goes on (`frac` 0..1). No bar, no word: the lanterns are the bar. `t` is the clock for the stars.
 */
export function drawDusk(pix, frac, t) {
  const W = pix.w, H = pix.h;
  const bg = duskBackdrop(W, H);
  pix.blit(bg, 0, 0);
  // stars in the upper sky, twinkling
  let s = 12345;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * bg.horizon * 0.55), ph = rnd() * 6.28;
    if (Math.sin(t * 2 + ph) > -0.4) pix.set(x, y, i % 5 === 0 ? '#ffffff' : '#c8bce8');
  }
  // five lanterns on the front ridge: each is a little post with a lamp, dark until the work reaches it
  const n = 5, y0 = Math.round(H * 0.88), gap = Math.round(W * 0.14), x0 = (W >> 1) - gap * 2;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * gap;
    const lit = frac * n > i + 0.15;
    const k = clamp(frac * n - i);
    pix.rect(x, y0 - 4, 1, 10, '#120c1c');
    pix.rect(x - 4, y0 - 12, 9, 9, '#120c1c');
    pix.rect(x - 3, y0 - 11, 7, 7, lit ? ditherPick(['#c8741c', '#ffc03c', '#fff0a0'], k, x, y0) : '#3e2a64');
    if (lit) {
      // a glow round the lamp (a ring of dithered light on the ridge)
      for (let dy = -9; dy <= 9; dy++) for (let dx = -12; dx <= 12; dx++) {
        const d = Math.hypot(dx / 12, dy / 9);
        if (d < 1 && d > 0.55 && ((x + dx + y0 + dy) & 1) === 0 && pix.get(x + dx, y0 - 8 + dy)[3] > 0) pix.set(x + dx, y0 - 8 + dy, ditherPick(['#8a3c7c', '#d8683c', '#ffc03c'], (1 - d) * 2 * k, x + dx, y0 + dy));
      }
    }
  }
}

/** a dither wipe: clears the HUD's pixels where an ordered pattern is below `k` (0 none .. 1 all), a fade that stays 1-bit */
export function ditherOut(pix, k) {
  if (k <= 0) return;
  const w = pix.w, h = pix.h, d = pix.data;
  if (k >= 1) { d.fill(0); return; }
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cut = Math.floor(k * 16);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (B[(y & 3) * 4 + (x & 3)] < cut) d[(y * w + x) * 4 + 3] = 0;
}
