// HUD / menu art for Gloaming Vale: icons, PS1-style panels, segmented bars and the title logotype.
// Everything is drawn in code into Pix buffers (1-bit alpha, DOM-free, deterministic).
import { Pix, rgb, ditherPick } from './pix.js';
import { drawText, measureText } from './font.js';
import { buildIcons } from './ui/icons.js';
import { trim, lighten, darken } from './ui/pixmap.js';

const INK = '#120c1c';

/** Usage hint per icon. */
export const UI_NOTES = {
  gem_red: '12x12 red gem. Draw next to a grad-style counter.',
  gem_green: '12x12 green gem.',
  gem_blue: '12x12 blue gem.',
  gem_gold: '12x12 gold gem (also the default {gem} inline glyph in text).',
  gem_purple: '12x12 purple gem.',
  lantern_on: '12x16 lit hanging lantern (progress row: lit).',
  lantern_off: '12x16 dark lantern (progress row: still to light).',
  sparx_blue: '14x12 Sparx health icon, blue.',
  sparx_green: '14x12 Sparx health icon, green.',
  sparx_yellow: '14x12 Sparx health icon, yellow.',
  dragon_head: '16x16 lives icon (purple head, orange horns).',
  heart: '10x9 heart (health / collectible hearts).',
  butterfly_icon: '10x10 butterfly (rescued butterflies counter).',
  flame_icon: '10x12 flame (fire-breath ability / ammo).',
  charge_icon: '12x10 horn + speed chevrons (charge / head-butt ability).',
  wing_icon: '14x10 wings (glide ability).',
  key_frame: '16x16 empty rounded keycap; drawKeycap() stretches it around a label (face area 12x10).',
  star: '10x10 gold star (bonus / rating).',
  arrow_right: '6x8 menu selector.',
  arrow_left: '6x8 menu selector.',
  check: '8x8 green tick.',
  cross: '8x8 red cross.',
  bunny_icon: '10x10 bunny (rescued bunnies counter).',
  clock_icon: '10x10 clock (timer challenges).',
};

/** name -> Pix for every HUD icon (see UI_NOTES). */
export function generateUI() {
  return buildIcons();
}

/* ------------------------------------------------------------------------------------------------ */
/* panels                                                                                             */
/* ------------------------------------------------------------------------------------------------ */
const PANEL_STYLES = {
  // 4 rings: ink outline, bright bevel, mid bevel, inner dark line; then the body
  dialog: {
    radius: 4,
    rings: [
      { tl: INK, br: INK },
      { tl: '#fff4ff', br: '#a89cc8' },
      { tl: '#b4a8d4', br: '#5a4a92' },
      { tl: '#0c0818', br: '#0c0818' },
    ],
    tones: ['#40306a', '#2a1a48', '#1a1030'],
    alt: '#0c0818',
  },
  // gold-rimmed variant for menus / pause screen
  menu: {
    radius: 4,
    rings: [
      { tl: INK, br: INK },
      { tl: '#fff6c0', br: '#c05a14' },
      { tl: '#ffc03c', br: '#7a2a10' },
      { tl: '#0c0818', br: '#0c0818' },
    ],
    tones: ['#3a2a60', '#241640', '#160c2c'],
    alt: '#0c0818',
  },
  // slim HUD plate: outline + one bevel line, tighter corners
  hud: {
    radius: 3,
    rings: [
      { tl: INK, br: INK },
      { tl: '#dcd4f0', br: '#7a6ca8' },
    ],
    tones: ['#34285a', '#221640', '#160c2c'],
    alt: '#0c0818',
  },
};

/** Pixel-centre membership in a rounded rectangle [x0,x1) x [y0,y1) with corner radius r. */
function inRR(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px >= x1 || py < y0 || py >= y1) return false;
  if (r <= 0) return true;
  const cx = px < x0 + r ? x0 + r : px > x1 - r ? x1 - r : px;
  const cy = py < y0 + r ? y0 + r : py > y1 - r ? y1 - r : py;
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Draw a PS1-style panel with its top-left corner at (x, y), size w x h.
 * opts: style 'dialog' (default, lilac bevel) | 'menu' (gold bevel) | 'hud' (slim plate)
 *       body  'checker' (default: indigo pixels alternating with black => looks translucent)
 *             | 'solid' (opaque indigo) | 'screen' (indigo pixels alternate with TRANSPARENT holes, real see-through)
 *       radius corner radius in px (default per style)
 * Returns the inner content rectangle { x, y, w, h } (inside the border).
 */
export function drawPanel(pix, x, y, w, h, opts = {}) {
  const S = PANEL_STYLES[opts.style || 'dialog'] || PANEL_STYLES.dialog;
  const r = opts.radius !== undefined ? opts.radius : S.radius;
  const body = opts.body || 'checker';
  const rings = S.rings.map((c) => ({ tl: rgb(c.tl), br: rgb(c.br) }));
  const tones = S.tones.map(rgb);
  const alt = rgb(S.alt);
  const n = rings.length;
  const innerTop = y + n, innerH = Math.max(1, h - n * 2);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const px = x + i + 0.5, py = y + j + 0.5;
      if (!inRR(px, py, x, y, x + w, y + h, r)) continue;
      // which ring (inset depth) is this pixel on?
      let ring = n;
      for (let k = 0; k < n; k++) {
        if (!inRR(px, py, x + k + 1, y + k + 1, x + w - k - 1, y + h - k - 1, Math.max(0, r - k - 1))) { ring = k; break; }
      }
      if (ring < n) {
        const dl = i, dt = j, dr = w - 1 - i, db = h - 1 - j;
        const m = Math.min(dl, dt, dr, db);
        const lit = m === dl || m === dt;
        pix.set(x + i, y + j, lit ? rings[ring].tl : rings[ring].br);
        continue;
      }
      const t = (y + j - innerTop) / innerH;
      const tone = ditherPick(tones, t, x + i, y + j);
      const on = ((x + i + y + j) & 1) === 0;
      if (body === 'solid') pix.set(x + i, y + j, tone);
      else if (body === 'screen') { if (on) pix.set(x + i, y + j, tone); }
      else pix.set(x + i, y + j, on ? tone : alt);
    }
  }
  return { x: x + n, y: y + n, w: Math.max(0, w - 2 * n), h: Math.max(0, h - 2 * n) };
}

/* ------------------------------------------------------------------------------------------------ */
/* keycaps                                                                                            */
/* ------------------------------------------------------------------------------------------------ */
let keyFrame = null;

/**
 * Draw a keycap prompt (e.g. 'A', 'SPACE', 'ESC') with its top-left at (x, y). The 16x16 key_frame is stretched
 * horizontally to fit the label (min width 16). Returns { x, y, w, h }. opts: color (label colour, default ink).
 */
export function drawKeycap(pix, x, y, label = '', opts = {}) {
  if (!keyFrame) keyFrame = buildIcons().key_frame;
  const tw = label ? measureText(label, { style: 'plain' }).w : 0;
  const w = Math.max(16, tw + 8), h = 16;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const sx = i < 6 ? i : i >= w - 6 ? 16 - (w - i) : 7;
      const c = keyFrame.get(sx, j);
      if (c[3] >= 128) pix.set(x + i, y + j, c);
    }
  }
  if (label) drawText(pix, label, x + Math.floor(w / 2), y + 3, { align: 'center', color: opts.color || INK });
  return { x, y, w, h };
}

/* ------------------------------------------------------------------------------------------------ */
/* bars                                                                                               */
/* ------------------------------------------------------------------------------------------------ */
/**
 * Segmented progress bar, top-left (x, y), size w x h (h >= 5 looks best), frac 0..1.
 * opts: segments (default ~ one per 7px, 0 = continuous), gap (px between segments, 1),
 *       colors (fill gradient top->bottom, default amber), bg, border, glint (top highlight row, true)
 */
export function drawBar(pix, x, y, w, h, frac, opts = {}) {
  const f = Math.max(0, Math.min(1, frac));
  const colors = (opts.colors || ['#ffe27a', '#ffc03c', '#f0901c']).map(rgb);
  const border = rgb(opts.border || INK);
  const bgA = rgb(opts.bg || '#22183e'), bgB = rgb(opts.bg2 || '#160c2c');
  const gap = opts.gap !== undefined ? opts.gap : 1;
  const iw = w - 2, ih = h - 2;
  const nSeg = opts.segments !== undefined ? opts.segments : Math.max(1, Math.round(iw / 7));
  // border with rounded (cut) corners
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1;
      const corner = (i === 0 || i === w - 1) && (j === 0 || j === h - 1);
      if (corner) continue;
      if (edge) pix.set(x + i, y + j, border);
      else pix.set(x + i, y + j, ((i + j) & 1) ? bgA : bgB);
    }
  }
  const segs = [];
  if (nSeg <= 0) segs.push([0, iw]);
  else {
    for (let s = 0; s < nSeg; s++) {
      const a = Math.round((s * (iw + gap)) / nSeg);
      const b = Math.round(((s + 1) * (iw + gap)) / nSeg) - gap;
      if (b > a) segs.push([a, b]);
    }
  }
  const glint = opts.glint !== undefined ? opts.glint : true;
  segs.forEach(([a, b], s) => {
    const fs = Math.max(0, Math.min(1, f * segs.length - s));
    const fillW = Math.round(fs * (b - a));
    for (let j = 0; j < ih; j++) {
      const t = ih > 1 ? j / (ih - 1) : 0;
      for (let i = a; i < b; i++) {
        const cx = x + 1 + i, cy = y + 1 + j;
        if (i - a < fillW) {
          let c = ditherPick(colors, t, cx, cy);
          if (glint && j === 0 && ih >= 3) c = lighten(c, 0.5);
          else if (ih >= 4 && j === ih - 1) c = darken(c, 0.25);
          pix.set(cx, cy, c);
        } else {
          pix.set(cx, cy, ((cx + cy) & 1) ? rgb('#2c2050') : rgb('#1c1236'));
        }
      }
    }
  });
}

/* ------------------------------------------------------------------------------------------------ */
/* title logo                                                                                         */
/* ------------------------------------------------------------------------------------------------ */
/**
 * Chunky title logotype. lines = array of strings (each drawn with the bold gradient font, thick outline and
 * drop shadow, centred), returns a transparent Pix cropped to the content.
 * opts: scale (3; number or per-line array), top / mid / bottom (gradient colours, default gold->orange),
 *       outline (#120c1c), outlineWidth, shadow (drop-shadow colour), shadowOffset, rim (inner rim colour or none),
 *       wobble (+-px per-letter vertical jitter, default 1 for scale >= 3), bevel (top-edge highlight rows, 1),
 *       letterSpacing (font px, default 1), lineGap (px, default 3), seed
 */
export function makeLogo(lines, opts = {}) {
  const list = Array.isArray(lines) ? lines : [String(lines)];
  if (!list.length) return new Pix(1, 1);
  const scales = Array.isArray(opts.scale) ? opts.scale : list.map(() => (opts.scale || 3));
  const top = opts.top || '#ffe27a', bottom = opts.bottom || '#f0901c';
  const colors = opts.colors || (opts.mid ? [top, opts.mid, bottom] : [top, bottom]);
  const wobble = opts.wobble !== undefined ? opts.wobble : (Math.min(...scales) >= 3 ? 1 : 0);
  const base = {
    style: 'grad', colors,
    outlineColor: opts.outline || INK,
    shadowColor: opts.shadow || '#0c0818',
    rim: opts.rim,
    bevel: opts.bevel !== undefined ? opts.bevel : 1,
    letterSpacing: opts.letterSpacing !== undefined ? opts.letterSpacing : 1,
    wobble,
  };
  const lineGap = opts.lineGap !== undefined ? opts.lineGap : 3;
  const ms = list.map((t, i) => {
    const ow = opts.outlineWidth !== undefined ? opts.outlineWidth : Math.max(2, Math.round(scales[i] * 0.9));
    const o = { ...base, scale: scales[i], outlineWidth: ow, shadowOffset: opts.shadowOffset !== undefined ? opts.shadowOffset : ow };
    return { o, m: measureText(t, o) };
  });
  const W = Math.max(...ms.map((q) => q.m.w));
  const pad = 12 + wobble * 2;
  let H = pad * 2;
  ms.forEach((q, i) => { H += q.m.h + (i ? lineGap : 0); });
  const canvas = new Pix(W + pad * 2, H);
  let y = pad;
  list.forEach((t, i) => {
    const q = ms[i];
    drawText(canvas, t, pad + Math.floor(W / 2), y, { ...q.o, align: 'center', wobbleSeed: (opts.seed || 0) + i * 3 });
    y += q.m.h + lineGap;
  });
  return trim(canvas, 0);
}
