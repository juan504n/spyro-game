// Bitmap font for Gloaming Vale: hand-authored 5x7 pixel glyphs (ASCII 32-126 + a few extras) and a small
// text renderer that paints into any Pix. DOM-free, deterministic, 1-bit alpha only.
//
// GLYPH DATA  (FONT_GLYPHS)
//   FONT_GLYPHS[char] = { w, rows }
//     w    glyph width in font pixels (proportional: 'I' is 3, 'M' is 5, '!' is 1 ...; digits are always 5 = tabular)
//     rows array of row strings, row 0 = top of the cap box. '#' = ink, '.' = empty.
//          rows 0..6  cap box (caps / digits / ascenders); baseline sits under row 6
//          rows 2..6  x-height zone (lowercase bodies are 5 rows tall)
//          rows 7..8  descender zone (g j p q y , ; _)
//   Font metrics are in FONT_METRICS (below). Every glyph gets 1 font-pixel of spacing to its right.
//
// COLOUR TAGS
//   '{#ffe27a}word{/}' switches the fill colour for the enclosed text ('{#rgb}' works too, '{/}' resets). The state
//   carries across '\n' and wrapText() re-opens open tags on each wrapped line. Tagged glyphs use the tag colour
//   (flat in flat styles; a light->dark gradient derived from it in 'grad') and still get the style's outline / shadow.
//
// INLINE ICONS  (FONT_ICONS)
//   Multi-colour glyphs that live in the text flow:  {heart} {gem} {gem_red} {gem_green} {gem_blue}
//   {gem_gold} {gem_purple} {lantern} {lantern_off} {star}   or the unicode chars in FONT_ICON_CHARS
//   (♥ = heart, ◆ = gem, ★ = star). They keep their own colours; outline/shadow styles still wrap them.
//
// API:  drawText(pix, text, x, y, opts)  measureText(text, opts)  wrapText(text, maxW, opts)  textPix(text, opts)
import { Pix, rgb, bayer } from './pix.js';
import { RAMPS } from './palette.js';
import { lighten, darken } from './ui/pixmap.js';

export const FONT_METRICS = Object.freeze({
  cellW: 5,          // widest normal glyph
  capHeight: 7,      // rows 0..6
  xHeight: 5,        // lowercase body rows 2..6
  descent: 2,        // rows 7..8 (g j p q y , ; _)
  spacing: 1,        // blank pixel column after every glyph
  spaceW: 2,         // width of ' ' (plus the usual 1px spacing)
  lineHeight: 10,    // baseline-to-baseline distance (9 rows + 1 leading), in font pixels
});

/* ------------------------------------------------------------------------------------------------ */
/* Glyph source. Blank rows are '' (auto-padded). Keep every row of one glyph the same length.       */
/* ------------------------------------------------------------------------------------------------ */
const SRC = {
  ' ': ['..'],
  '!': ['#', '#', '#', '#', '#', '', '#'],
  '"': ['#.#', '#.#', '#.#'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '$': ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  "'": ['#', '#'],
  '(': ['..#', '.#.', '#..', '#..', '#..', '.#.', '..#'],
  ')': ['#..', '.#.', '..#', '..#', '..#', '.#.', '#..'],
  '*': ['', '#.#.#', '.###.', '#####', '.###.', '#.#.#'],
  '+': ['', '..#..', '..#..', '#####', '..#..', '..#..'],
  ',': ['', '', '', '', '', '.#', '.#', '#.'],
  '-': ['', '', '', '####'],
  '.': ['', '', '', '', '', '##', '##'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],

  '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],

  ':': ['', '##', '##', '', '##', '##'],
  ';': ['', '##', '##', '', '', '.#', '.#', '#.'],
  '<': ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'],
  '=': ['', '', '#####', '', '#####'],
  '>': ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '', '..#..'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],

  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],

  '[': ['###', '#..', '#..', '#..', '#..', '#..', '###'],
  '\\': ['#....', '.#...', '.#...', '..#..', '...#.', '...#.', '....#'],
  ']': ['###', '..#', '..#', '..#', '..#', '..#', '###'],
  '^': ['.#.', '#.#'],
  '_': ['', '', '', '', '', '', '', '#####'],
  '`': ['#.', '.#'],

  'a': ['', '', '.###.', '....#', '.####', '#...#', '.####'],
  'b': ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  'c': ['', '', '.###.', '#...#', '#....', '#...#', '.###.'],
  'd': ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  'e': ['', '', '.###.', '#...#', '#####', '#....', '.###.'],
  'f': ['..##', '.#..', '###.', '.#..', '.#..', '.#..', '.#..'],
  'g': ['', '', '.####', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  'h': ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  'i': ['.#.', '', '##.', '.#.', '.#.', '.#.', '###'],
  'j': ['..#', '', '.##', '..#', '..#', '..#', '..#', '..#', '##.'],
  'k': ['#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#'],
  'l': ['##.', '.#.', '.#.', '.#.', '.#.', '.#.', '.##'],
  'm': ['', '', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  'n': ['', '', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  'o': ['', '', '.###.', '#...#', '#...#', '#...#', '.###.'],
  'p': ['', '', '####.', '#...#', '#...#', '#...#', '####.', '#....', '#....'],
  'q': ['', '', '.####', '#...#', '#...#', '#...#', '.####', '....#', '....#'],
  'r': ['', '', '#.##', '##..', '#...', '#...', '#...'],
  's': ['', '', '.####', '#....', '.###.', '....#', '####.'],
  't': ['.#..', '.#..', '###.', '.#..', '.#..', '.#.#', '..#.'],
  'u': ['', '', '#...#', '#...#', '#...#', '#..##', '.##.#'],
  'v': ['', '', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'w': ['', '', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  'x': ['', '', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  'y': ['', '', '#...#', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  'z': ['', '', '#####', '...#.', '..#..', '.#...', '#####'],

  '{': ['..##', '.#..', '.#..', '#...', '.#..', '.#..', '..##'],
  '|': ['#', '#', '#', '#', '#', '#', '#'],
  '}': ['##..', '..#.', '..#.', '...#', '..#.', '..#.', '##..'],
  '~': ['', '', '.#...', '#.#.#', '...#.'],

  // extras beyond ASCII
  '×': ['', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '…': ['', '', '', '', '', '', '#.#.#'],
  '•': ['', '', '.#.', '###', '.#.'],
  '°': ['.#.', '#.#', '.#.'],
  '→': ['', '..#..', '...#.', '#####', '...#.', '..#..'],
  '←': ['', '..#..', '.#...', '#####', '.#...', '..#..'],
  '↑': ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '..#..'],
  '↓': ['..#..', '..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..'],
};

// Typographic look-alikes routed to the glyphs above.
const ALIASES = {
  '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '−': '-', '\u00a0': ' ', '\t': '  ', '\r': '',
  '✕': '×', '✖': '×',
};

function buildGlyphs() {
  const out = {};
  for (const ch of Object.keys(SRC)) {
    const rows = SRC[ch];
    let w = 0;
    for (const r of rows) w = Math.max(w, r.length);
    out[ch] = { w, rows: rows.map((r) => r.padEnd(w, '.')) };
  }
  return Object.freeze(out);
}

/** char -> { w, rows }  (see header). ASCII 32..126 plus × … • ° → ← ↑ ↓ */
export const FONT_GLYPHS = buildGlyphs();

/* ------------------------------------------------------------------------------------------------ */
/* Inline icons                                                                                       */
/* ------------------------------------------------------------------------------------------------ */
function gemPal(r) {
  return { L: r[3], W: r[4], m: r[2], M: r[1], d: r[0] };
}
const GEM_ROWS = ['.LWWWm.', 'LLWWWmm', 'LLLmmMd', '.LLmMd.', '..LmM..', '...m...'];
const HEART_PAL = { p: '#ff6a68', R: '#e02c34', w: '#ffc0b8', d: '#a01420' };
const LANTERN_PAL = { b: '#7a5218', B: '#dcb048', y: '#ffc03c', Y: '#ffe27a', w: '#fff6c0', o: '#f0901c' };
const LANTERN_OFF_PAL = { b: '#4a4654', B: '#a4a0b4', y: '#2a1560', Y: '#4a2a9a', w: '#7a4ad0', o: '#2a1560' };
const STAR_PAL = { Y: '#ffd050', y: '#f0a828', w: '#fff090', d: '#a04a08' };

function icon(top, rows, pal) {
  const w = rows[0].length;
  const cp = {};
  for (const k of Object.keys(pal)) cp[k] = rgb(pal[k]);
  return { w, top, rows, pal: cp };
}

/** name -> { w, top, rows, pal } — multi-colour glyphs (rows start at font row `top`). */
export const FONT_ICONS = Object.freeze({
  heart: icon(1, ['.pp.pp.', 'pwRRRRd', 'RRRRRRd', '.RRRRd.', '..RRd..', '...d...'], HEART_PAL),
  gem: icon(0, GEM_ROWS, gemPal(RAMPS.gemGold)),
  gem_red: icon(0, GEM_ROWS, gemPal(RAMPS.gemRed)),
  gem_green: icon(0, GEM_ROWS, gemPal(RAMPS.gemGreen)),
  gem_blue: icon(0, GEM_ROWS, gemPal(RAMPS.gemBlue)),
  gem_gold: icon(0, GEM_ROWS, gemPal(RAMPS.gemGold)),
  gem_purple: icon(0, GEM_ROWS, gemPal(RAMPS.gemPurple)),
  lantern: icon(0, ['..b..', '.bBb.', 'bBBBb', 'byYyb', 'bywyb', 'byoyb', '.bbb.'], LANTERN_PAL),
  lantern_off: icon(0, ['..b..', '.bBb.', 'bBBBb', 'byYyb', 'bywyb', 'byoyb', '.bbb.'], LANTERN_OFF_PAL),
  star: icon(0, ['...Y...', '..YYY..', 'YYYwYYY', '.YYYYd.', '.YYYYd.', '.YY.Yd.', '.Y...y.'], STAR_PAL),
});

/** Unicode characters that draw an inline icon. */
export const FONT_ICON_CHARS = Object.freeze({ '♥': 'heart', '❤': 'heart', '◆': 'gem', '♦': 'gem', '★': 'star', '🏮': 'lantern' });

/* ------------------------------------------------------------------------------------------------ */
/* Option resolution                                                                                   */
/* ------------------------------------------------------------------------------------------------ */
const DEFAULT_GRAD = ['#ffe27a', '#ffc03c', '#f0901c'];
const INK = '#120c1c';

function resolve(opts = {}) {
  const scale = Math.max(1, Math.round(opts.scale || 1));
  const style = opts.style || 'plain';
  const grad = style === 'grad';
  const bold = opts.bold !== undefined ? !!opts.bold : style === 'bold' || grad;
  const smooth = opts.smooth || 'auto';           // 'auto' | 'none' | 'brush'
  const brush = scale >= 2 && (smooth === 'brush' || (smooth === 'auto' && bold));
  const smear = bold && !brush;                  // +1 font pixel of stroke weight at scale 1
  // Brush geometry (all in output pixels): T = stroke thickness, sh = half-pixel alignment shift.
  let T = scale;
  if (brush) T = Math.max(scale, Math.round(scale * (bold ? 1.45 : 1.1)));
  const sh = ((scale & 1) === (T & 1)) ? 0 : 0.5;
  const lov = brush ? Math.max(0, Math.round((T - scale) / 2 - sh)) : 0; // overhang left/top
  const extra = brush ? T - scale : 0;                                     // added width/height per glyph

  const outlineOn = style === 'outline' || grad || (opts.outlineWidth || 0) > 0;
  const shadowOn = style === 'shadow' || grad || !!opts.shadowOffset;
  const ow = outlineOn
    ? (opts.outlineWidth !== undefined ? Math.max(0, Math.round(opts.outlineWidth))
      : (brush || grad ? Math.max(1, Math.round(scale * 0.75)) : scale))
    : 0;
  const sOff = shadowOn
    ? (opts.shadowOffset !== undefined ? Math.round(opts.shadowOffset)
      : (grad || brush ? Math.max(1, Math.round(scale * 0.75)) : scale))
    : 0;

  const baseColor = rgb(opts.color !== undefined ? opts.color : '#ffffff');
  let colors = null;
  if (opts.colors && opts.colors.length) colors = opts.colors.map(rgb);
  else if (grad) {
    colors = opts.color !== undefined
      ? [lighten(baseColor, 0.5), baseColor, darken(baseColor, 0.25)]
      : DEFAULT_GRAD.map(rgb);
  }
  const bevel = opts.bevel !== undefined ? opts.bevel : (grad && scale >= 2 ? 1 : 0);
  return {
    scale, style, bold, brush, smear, T, sh, lov, extra, ow, sOff, colors, baseColor, bevel,
    outlineOn, shadowOn,
    outlineColor: rgb(opts.outlineColor !== undefined ? opts.outlineColor : INK),
    shadowColor: rgb(opts.shadowColor !== undefined ? opts.shadowColor : (style === 'shadow' ? INK : '#000000')),
    rim: opts.rim !== undefined ? rgb(opts.rim) : null,
    rimWidth: Math.max(1, Math.round(opts.rimWidth || 1)),
    ls: opts.letterSpacing || 0,
    lineGap: opts.lineGap || 0,
    align: opts.align || 'left',
    clip: opts.clip || null,
    caps: !!opts.caps,
    limit: opts.limit === undefined ? Infinity : Math.max(0, Math.floor(opts.limit)),
    wobble: opts.wobble || 0,
    wobbleSeed: opts.wobbleSeed || 0,
    dither: opts.dither !== undefined ? !!opts.dither : true,
    square: opts.square !== undefined ? opts.square : 0,
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* Tokenising + layout                                                                                 */
/* ------------------------------------------------------------------------------------------------ */
/** Parse '{#rgb}' / '{#rrggbb}' (set fill colour) and '{/}' (reset). Returns the colour, null (reset) or undefined. */
function parseTag(name) {
  if (name === '/' || name === '/c') return null;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(name)) return rgb(name);
  return undefined;
}

function tokenize(str, o, st) {
  const chars = Array.from(str);
  const toks = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === '{') {
      let j = i + 1, name = '';
      while (j < chars.length && chars[j] !== '}' && name.length < 14) name += chars[j++];
      if (j < chars.length && chars[j] === '}') {
        const ic = FONT_ICONS[name] || FONT_ICONS[name.toLowerCase()];
        if (ic) {
          toks.push({ icon: ic, w: ic.w });
          i = j;
          continue;
        }
        const col = parseTag(name);
        if (col !== undefined) { st.col = col; i = j; continue; }
      }
    }
    if (FONT_ICON_CHARS[ch]) { const ic = FONT_ICONS[FONT_ICON_CHARS[ch]]; toks.push({ icon: ic, w: ic.w }); continue; }
    if (ALIASES[ch] !== undefined) {
      for (const c2 of ALIASES[ch]) toks.push(glyphToken(c2, st.col));
      continue;
    }
    let use = ch;
    if (o.caps) { const up = ch.toUpperCase(); if (up.length === 1) use = up; }
    toks.push(glyphToken(use, st.col));
  }
  return toks;
}

function glyphToken(ch, tag) {
  const g = FONT_GLYPHS[ch] || FONT_GLYPHS['?'];
  return { glyph: g, w: g.w, ch, blank: ch === ' ', tag };
}

function advance(tok, o) {
  const smearX = o.smear && tok.glyph && !tok.blank ? 1 : 0;
  return (tok.w + smearX + FONT_METRICS.spacing + o.ls) * o.scale + o.extra;
}

function layoutLine(str, o, st) {
  const tokens = tokenize(str, o, st);
  let cx = 0;
  const items = [];
  for (const t of tokens) {
    items.push({ t, x: cx });
    cx += advance(t, o);
  }
  const w = tokens.length ? cx - (FONT_METRICS.spacing + o.ls) * o.scale : 0;
  return { items, w: Math.max(0, w) };
}

function layoutText(text, o) {
  const st = { col: null };                       // colour-tag state carries across '\n'
  return String(text == null ? '' : text).split('\n').map((ln) => layoutLine(ln, o, st));
}

function boxHeight(o) { return FONT_METRICS.capHeight * o.scale + o.extra; }
function lineAdvance(o) { return FONT_METRICS.lineHeight * o.scale + o.extra + o.lineGap; }

/**
 * Size of `text` (may contain '\n'). w/h describe the ink box WITHOUT outline/shadow decorations:
 * h is the cap box (7 font px * scale; descenders hang `descent` below it). Also returns lines, lineHeight,
 * descent and `pad` (extra pixels covered by outline/shadow on each side).
 */
export function measureText(text, opts = {}) {
  const o = resolve(opts);
  const lines = layoutText(text, o);
  let w = 0;
  for (const l of lines) w = Math.max(w, l.w);
  const la = lineAdvance(o);
  const h = boxHeight(o) + (lines.length - 1) * la;
  const sh = o.shadowOn ? o.sOff : 0;
  return {
    w, h, lines: lines.length, lineHeight: la, descent: FONT_METRICS.descent * o.scale,
    pad: { l: o.ow, t: o.ow, r: o.ow + sh, b: o.ow + sh },
  };
}

/**
 * Greedy word wrap: returns an array of lines that each measure <= maxW (over-long words are hard-split).
 * Colour tags that are still open at a line break are re-opened at the start of the next line.
 */
export function wrapText(text, maxW, opts = {}) {
  const width = (t) => measureText(t, opts).w;
  const out = [];
  for (const para of String(text == null ? '' : text).split('\n')) {
    let cur = '';
    for (const wd of para.split(' ')) {
      if (cur && width(cur + ' ' + wd) <= maxW) { cur += ' ' + wd; continue; }
      if (cur) { out.push(cur); cur = ''; }
      let word = wd;
      while (word.length > 1 && width(word) > maxW) {
        let k = word.length - 1;
        while (k > 1 && width(word.slice(0, k)) > maxW) k--;
        out.push(word.slice(0, k));
        word = word.slice(k);
      }
      cur = word;
    }
    out.push(cur);
  }
  // carry colour tags across the breaks we introduced
  let open = null;
  return out.map((ln) => {
    const line = open ? `{${open}}${ln}` : ln;
    for (const m of ln.matchAll(/\{(#[0-9a-fA-F]{3,6}|\/c?)\}/g)) open = m[1].charAt(0) === '/' ? null : m[1];
    return line;
  });
}

/* ------------------------------------------------------------------------------------------------ */
/* Rasterising                                                                                         */
/* ------------------------------------------------------------------------------------------------ */
function stampSegment(cv, gyv, icv, CW, CH, x0, y0, x1, y1, R, sq, gTop, val, packed) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - R - 1)), maxX = Math.min(CW - 1, Math.ceil(Math.max(x0, x1) + R + 1));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - R - 1)), maxY = Math.min(CH - 1, Math.ceil(Math.max(y0, y1) + R + 1));
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
  for (let Y = minY; Y <= maxY; Y++) {
    for (let X = minX; X <= maxX; X++) {
      const px = X + 0.5, py = Y + 0.5;
      let t = len2 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = px - (x0 + t * dx), qy = py - (y0 + t * dy);
      const e = Math.sqrt(qx * qx + qy * qy);
      const c = Math.max(Math.abs(qx), Math.abs(qy));
      if ((1 - sq) * e + sq * c <= R + 1e-6) {
        const i = Y * CW + X;
        cv[i] = val;
        gyv[i] = Y - gTop;
        if (val === 3) icv[i] = packed;
      }
    }
  }
}

function renderMasks(line, o) {
  const s = o.scale;
  const M = o.ow + o.sOff + 2;
  const bx = M + o.lov;
  const rowsPx = 9 * s + o.extra;
  const CW = line.w + o.extra + o.lov * 2 + 2 * M + 2;
  const CH = rowsPx + o.lov * 2 + 2 * M + o.wobble * 2 + 2;
  const ink = new Uint8Array(CW * CH);
  const icv = new Int32Array(CW * CH);
  const gyv = new Int16Array(CW * CH);
  const R = o.T / 2 + 0.02;
  const sq = o.brush ? 0.15 + o.square : 0;
  let gi = 0;
  for (const it of line.items) {
    const t = it.t;
    if (t.blank) { gi++; continue; }
    let wob = 0;
    if (o.wobble) wob = Math.round(Math.sin(gi * 2.3 + o.wobbleSeed * 1.7 + 0.6) * o.wobble);
    gi++;
    const gx = bx + it.x;
    const gTop = M + o.lov + o.wobble + wob;   // glyph cell top (row 0) in canvas coords
    if (t.icon) {
      const ic = t.icon;
      for (let r = 0; r < ic.rows.length; r++) {
        for (let c = 0; c < ic.w; c++) {
          const ch = ic.rows[r][c];
          if (ch === '.') continue;
          const col = ic.pal[ch];
          const packed = (col[0] << 16) | (col[1] << 8) | col[2];
          for (let j = 0; j < s; j++) {
            for (let i = 0; i < s; i++) {
              const X = gx + c * s + i, Y = gTop + (ic.top + r) * s + j;
              const k = Y * CW + X;
              ink[k] = 2; icv[k] = packed; gyv[k] = (ic.top + r) * s + j;
            }
          }
        }
      }
      continue;
    }
    const g = t.glyph;
    const val = t.tag ? 3 : 1;                                   // 1 = normal fill, 3 = colour-tagged glyph
    const tagPacked = t.tag ? (t.tag[0] << 16) | (t.tag[1] << 8) | t.tag[2] : 0;
    if (o.brush) {
      const nR = g.rows.length;
      const at = (c, r) => c >= 0 && r >= 0 && r < nR && c < g.w && g.rows[r][c] === '#';
      for (let r = 0; r < nR; r++) {
        for (let c = 0; c < g.w; c++) {
          if (!at(c, r)) continue;
          const cx0 = gx + (c + 0.5) * s + o.sh, cy0 = gTop + (r + 0.5) * s + o.sh;
          stampSegment(ink, gyv, icv, CW, CH, cx0, cy0, cx0, cy0, R, sq, gTop, val, tagPacked);
          if (at(c + 1, r)) stampSegment(ink, gyv, icv, CW, CH, cx0, cy0, cx0 + s, cy0, R, sq, gTop, val, tagPacked);
          if (at(c, r + 1)) stampSegment(ink, gyv, icv, CW, CH, cx0, cy0, cx0, cy0 + s, R, sq, gTop, val, tagPacked);
          if (at(c + 1, r + 1) && !at(c + 1, r) && !at(c, r + 1)) stampSegment(ink, gyv, icv, CW, CH, cx0, cy0, cx0 + s, cy0 + s, R, sq, gTop, val, tagPacked);
          if (at(c - 1, r + 1) && !at(c - 1, r) && !at(c, r + 1)) stampSegment(ink, gyv, icv, CW, CH, cx0, cy0, cx0 - s, cy0 + s, R, sq, gTop, val, tagPacked);
        }
      }
    } else {
      const sm = o.smear ? 1 : 0;
      for (let r = 0; r < g.rows.length; r++) {
        for (let c = 0; c < g.w; c++) {
          if (g.rows[r][c] !== '#') continue;
          for (let e = 0; e <= sm; e++) {
            for (let j = 0; j < s; j++) {
              for (let i = 0; i < s; i++) {
                const X = gx + (c + e) * s + i, Y = gTop + r * s + j;
                const k = Y * CW + X;
                ink[k] = val; gyv[k] = r * s + j;
                if (val === 3) icv[k] = tagPacked;
              }
            }
          }
        }
      }
    }
  }
  return { ink, icv, gyv, CW, CH, M };
}

/** Grow a 0/1 mask by `r` pixels (square structuring element when `sq`, else rounded). */
function grow(mask, CW, CH, r, sq) {
  if (r <= 0) return mask.slice();
  const offs = [];
  const lim = sq ? Infinity : r * r + r * 0.6;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (sq || dx * dx + dy * dy <= lim) offs.push(dx, dy);
    }
  }
  const out = mask.slice();
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      if (!mask[y * CW + x]) continue;
      for (let k = 0; k < offs.length; k += 2) {
        const X = x + offs[k], Y = y + offs[k + 1];
        if (X >= 0 && Y >= 0 && X < CW && Y < CH) out[Y * CW + X] = 1;
      }
    }
  }
  return out;
}

function pickGradient(cols, t, x, y, soft) {
  const n = cols.length;
  if (n === 1) return cols[0];
  const p = Math.min(Math.max(t, 0), 0.9999) * n;
  const i = Math.floor(p);
  const f = p - i;
  if (soft > 0) {
    if (i > 0 && f < soft) return (bayer(x, y) + 0.5) / 16 < 0.5 + f / (2 * soft) ? cols[i] : cols[i - 1];
    if (i < n - 1 && f > 1 - soft) return (bayer(x, y) + 0.5) / 16 < 0.5 - (1 - f) / (2 * soft) ? cols[i + 1] : cols[i];
  }
  return cols[i];
}

function paintLine(pix, L, ox, oy, o) {
  const { ink, icv, gyv, CW, CH, M } = L;
  const x0 = ox - M, y0 = oy - M - o.wobble;
  const clip = o.clip;
  const put = (cx, cy, c) => {
    const X = x0 + cx, Y = y0 + cy;
    if (clip && (X < clip.x || Y < clip.y || X >= clip.x + clip.w || Y >= clip.y + clip.h)) return;
    pix.set(X, Y, c);
  };
  const solid = new Uint8Array(CW * CH);
  for (let i = 0; i < solid.length; i++) solid[i] = ink[i] ? 1 : 0;
  const grown = o.ow > 0 ? grow(solid, CW, CH, o.ow, !o.brush) : solid;
  // 1. drop shadow of (outline + fill)
  if (o.shadowOn) {
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        if (grown[y * CW + x]) put(x + o.sOff, y + o.sOff, o.shadowColor);
      }
    }
  }
  // 2. outline
  if (o.ow > 0) {
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const k = y * CW + x;
        if (grown[k] && !solid[k]) put(x, y, o.outlineColor);
      }
    }
  }
  // 3. fill (+ rim, bevel)
  const capH = boxHeight(o);
  const rowsPerBand = o.colors ? capH / o.colors.length : 1;
  const soft = o.dither ? Math.min(0.3, 0.75 / Math.max(1, rowsPerBand)) : 0;
  const tagGrads = new Map();
  let rimMask = null;
  if (o.rim) {
    let er = solid;
    for (let n = 0; n < o.rimWidth; n++) {
      const inv = new Uint8Array(CW * CH);
      for (let i = 0; i < inv.length; i++) inv[i] = er[i] ? 0 : 1;
      const g2 = grow(inv, CW, CH, 1, false);
      const nx = new Uint8Array(CW * CH);
      for (let i = 0; i < nx.length; i++) nx[i] = er[i] && !g2[i] ? 1 : 0;
      er = nx;
    }
    rimMask = er;
  }
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const k = y * CW + x;
      const v = ink[k];
      if (!v) continue;
      let c;
      if (v === 3 && o.colors) {
        // colour-tagged glyph in a gradient style: same gradient shape, derived from the tag colour
        const p = icv[k];
        let g = tagGrads.get(p);
        if (!g) {
          const base = [(p >> 16) & 255, (p >> 8) & 255, p & 255, 255];
          g = [lighten(base, 0.5), base, darken(base, 0.25)];
          tagGrads.set(p, g);
        }
        c = pickGradient(g, (gyv[k] + o.lov) / capH, x0 + x, y0 + y, soft);
      } else if (v === 2 || v === 3) {
        const p = icv[k];
        c = [(p >> 16) & 255, (p >> 8) & 255, p & 255, 255];
      } else if (o.rim && rimMask && !rimMask[k]) {
        c = o.rim;
      } else if (o.colors) {
        const t = (gyv[k] + o.lov) / capH;
        c = pickGradient(o.colors, t, x0 + x, y0 + y, soft);
      } else {
        c = o.baseColor;
      }
      if (o.bevel && v !== 2) {
        let top = false;
        for (let j = 1; j <= o.bevel && !top; j++) top = y - j < 0 || !solid[k - j * CW];
        if (top) c = lighten(c, 0.5);
        else if (y + 1 >= CH || !solid[k + CW]) c = darken(c, 0.25);
      }
      put(x, y, c);
    }
  }
}

/**
 * Draw `text` into `pix` with its cap-box top-left at (x, y) (x is the left/centre/right anchor, see `align`).
 * opts:
 *   scale         integer >= 1 (default 1): every font pixel becomes scale x scale output pixels
 *   style         'plain' | 'shadow' | 'outline' | 'bold' | 'grad'  (default 'plain')
 *                   plain   flat colour
 *                   shadow  + 1 font-px drop shadow (shadowColor, default ink)
 *                   outline + 1 font-px outline all round (outlineColor, default ink)
 *                   bold    thicker strokes: 6-wide glyphs (smeared 1px right); at scale >= 2 drawn with a round brush
 *                   grad    bold + vertical gradient fill (`colors`) + dark outline + drop shadow + top-edge highlight
 *   color         flat fill colour (default white). With style 'grad' and no `colors` a 3-step gradient is derived.
 *   colors        gradient stops top->bottom (2-4 colours); default amber for 'grad'. Works with any style.
 *   outlineColor  outline colour (default #120c1c)         outlineWidth  override, in output px
 *   shadowColor   drop-shadow colour ('shadow': #120c1c, 'grad': black)   shadowOffset  override, output px (down-right)
 *   letterSpacing extra spacing after every glyph, in FONT pixels (x scale)     lineGap  extra px between lines
 *   align         'left' | 'center' | 'right'  — x is the anchor; each '\n' line is aligned separately
 *   clip          {x,y,w,h} rectangle in pix coordinates; nothing is written outside it
 *   caps          true = upper-case the text first
 *   limit         typewriter reveal: draw only the first N characters (icons count 1, '\n' does not); layout and
 *                 alignment still use the full text so nothing shifts while it types out
 *   Extras: bold (force on/off), smooth ('auto'|'none'|'brush'), bevel (0|1|2), rim (inner rim colour),
 *           rimWidth, wobble (+-px vertical jitter per glyph), wobbleSeed, dither (gradient band dither, default true),
 *           square (0..0.8, brush corner squareness)
 * Returns { x, y, w, h } — the ink box (excluding outline/shadow bleed; see measureText().pad).
 */
export function drawText(pix, text, x, y, opts = {}) {
  const o = resolve(opts);
  const lines = layoutText(text, o);
  const la = lineAdvance(o);
  let maxW = 0;
  for (const l of lines) maxW = Math.max(maxW, l.w);
  let remaining = o.limit;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.items.length) continue;
    const take = Math.min(ln.items.length, remaining);
    if (take <= 0) break;
    remaining -= take;
    let lx = x;
    if (o.align === 'center') lx = x - Math.floor(ln.w / 2);
    else if (o.align === 'right') lx = x - ln.w;
    const L = renderMasks(take < ln.items.length ? { items: ln.items.slice(0, take), w: ln.w } : ln, o);
    paintLine(pix, L, lx, y + i * la, o);
  }
  const bx = o.align === 'center' ? x - Math.floor(maxW / 2) : o.align === 'right' ? x - maxW : x;
  return { x: bx, y, w: maxW, h: boxHeight(o) + (lines.length - 1) * la };
}

/** Render text into a fresh, tightly cropped transparent Pix (handy for 3D signs / labels). */
export function textPix(text, opts = {}) {
  const m = measureText(text, opts);
  const pad = Math.max(m.pad.l, m.pad.t, m.pad.r, m.pad.b) + 2;
  const p = new Pix(m.w + pad * 2, m.h + m.descent + pad * 2 + 2);
  drawText(p, text, pad, pad, { ...opts, align: 'left' });
  return p;
}
