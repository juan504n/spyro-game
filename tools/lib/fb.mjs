// A frame buffer for the contact sheets of the texture tools (texture-sheet.mjs, hd-sheet.mjs): rectangles, scaled and tiled textures, and text in a 3 x 5 pixel font.
import { writePNG } from '../png.mjs';

// ---------------------------------------------------------------------------------------------
// tiny 3x5 pixel font for labels
// ---------------------------------------------------------------------------------------------
const FONT_ROWS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  _: ['...', '...', '...', '...', '###'], '-': ['...', '...', '###', '...', '...'], '.': ['...', '...', '...', '...', '.#.'],
  ':': ['...', '.#.', '...', '.#.', '...'], '/': ['..#', '..#', '.#.', '#..', '#..'], '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  ' ': ['...', '...', '...', '...', '...'], '+': ['...', '.#.', '###', '.#.', '...'],
  '(': ['.#.', '#..', '#..', '#..', '.#.'], ')': ['.#.', '..#', '..#', '..#', '.#.'],
};
const FONT = {};
for (const [k, rows] of Object.entries(FONT_ROWS)) FONT[k] = rows.join('');
// each glyph is 15 chars = 5 rows x 3 cols, row-major; lower case is drawn as upper case
export const glyph = (ch) => FONT[ch.toUpperCase()] || FONT[' '];

export class FB {
  constructor(w, h, bg = [24, 22, 34, 255]) {
    this.w = w; this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
    this.rect(0, 0, w, h, bg);
  }
  rect(x, y, w, h, c) {
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
        const k = (j * this.w + i) * 4;
        this.d[k] = c[0]; this.d[k + 1] = c[1]; this.d[k + 2] = c[2]; this.d[k + 3] = c[3] === undefined ? 255 : c[3];
      }
    }
  }
  /** Draw pix scaled by k at (x,y), compositing opaque pixels only (alpha < 128 = leave backdrop). */
  blit(pix, x, y, k, mul = null) {
    for (let j = 0; j < pix.h * k; j++) {
      const sy = (j / k) | 0;
      const dy = y + j;
      if (dy < 0 || dy >= this.h) continue;
      for (let i = 0; i < pix.w * k; i++) {
        const dx = x + i;
        if (dx < 0 || dx >= this.w) continue;
        const s = (sy * pix.w + ((i / k) | 0)) * 4;
        if (pix.data[s + 3] < 128) continue;
        const d = (dy * this.w + dx) * 4;
        let r = pix.data[s], g = pix.data[s + 1], b = pix.data[s + 2];
        if (mul) { r = Math.min(255, r * mul[0]); g = Math.min(255, g * mul[1]); b = Math.min(255, b * mul[2]); }
        this.d[d] = r; this.d[d + 1] = g; this.d[d + 2] = b; this.d[d + 3] = 255;
      }
    }
  }
  /** Draw pix tiled nx*ny times. */
  tiled(pix, x, y, k, nx, ny, mul = null) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) this.blit(pix, x + i * pix.w * k, y + j * pix.h * k, k, mul);
  }
  text(str, x, y, c = [230, 226, 240, 255], k = 2) {
    let cx = x;
    for (const ch of String(str)) {
      const g = glyph(ch);
      for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r * 3 + q] === '#') this.rect(cx + q * k, y + r * k, k, k, c);
      cx += 4 * k;
    }
    return cx - x;
  }
  save(file) { writePNG(file, this.w, this.h, this.d); }
}
export const textW = (s, k = 2) => String(s).length * 4 * k;
