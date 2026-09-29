// Packs every generated sprite (particles, HUD-in-world markers…) into one atlas texture.
import { generateSprites } from '../engine/textures/sprites.js';
import { Pix } from '../engine/textures/pix.js';
import { texFromPix } from '../engine/materials.js';

export class SpriteAtlas {
  constructor(size = 256) {
    let sprites = {};
    try { sprites = generateSprites(); } catch (e) { console.error('sprite generation failed', e); }
    const names = Object.keys(sprites).sort((a, b) => sprites[b].h - sprites[a].h || a.localeCompare(b));
    const atlas = new Pix(size, size);
    this.size = size;
    this.ids = new Map();
    this.rects = [];      // [u0, vBottom, u1, vTop] (v up: image top = high v)
    this.dims = [];       // [w, h] pixels
    this.names = [];
    let x = 1, y = 1, rowH = 0;
    for (const name of names) {
      const p = sprites[name];
      if (x + p.w + 1 > size) { x = 1; y += rowH + 1; rowH = 0; }
      if (y + p.h + 1 > size) { console.warn('sprite atlas full at', name); break; }
      atlas.blit(p, x, y);
      // blit thresholds alpha; keep the exact RGB of translucent-looking pixels by copying raw
      for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
        const s = (j * p.w + i) * 4, d = ((y + j) * size + x + i) * 4;
        atlas.data[d] = p.data[s]; atlas.data[d + 1] = p.data[s + 1]; atlas.data[d + 2] = p.data[s + 2]; atlas.data[d + 3] = p.data[s + 3];
      }
      const inset = 0.2 / size;
      this.ids.set(name, this.rects.length);
      this.rects.push([x / size + inset, 1 - (y + p.h) / size + inset, (x + p.w) / size - inset, 1 - y / size - inset]);
      this.dims.push([p.w, p.h]);
      this.names.push(name);
      x += p.w + 1;
      rowH = Math.max(rowH, p.h);
    }
    if (!this.rects.length) {
      // sprite generation failed: keep one white texel so every billboard lookup (id 0) still resolves
      const d = (1 * size + 1) * 4;
      atlas.data[d] = atlas.data[d + 1] = atlas.data[d + 2] = atlas.data[d + 3] = 255;
      this.rects.push([1.5 / size, 1 - 1.5 / size, 1.5 / size, 1 - 1.5 / size]);
      this.dims.push([1, 1]);
      this.names.push('_blank');
    }
    this.pix = atlas;
    this.texture = texFromPix(atlas, { tile: false });
  }

  has(name) { return this.ids.has(name); }
  id(name) {
    const i = this.ids.get(name);
    if (i === undefined) { if (!this._warned) this._warned = new Set(); if (!this._warned.has(name)) { this._warned.add(name); console.warn('missing sprite', name); } return 0; }
    return i;
  }
  rect(name) { return this.rects[this.id(name)]; }
  dim(name) { return this.dims[this.id(name)]; }
}
