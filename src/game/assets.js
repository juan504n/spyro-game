// Texture + material registry. Generates every procedural texture once, uploads them as nearest-filtered textures and
// hands out cached PS1 materials. Missing textures fall back to a flat colour so the game never hard-fails.
import { generateWorldTextures } from '../engine/textures/world.js';
import { Pix } from '../engine/textures/pix.js';
import { makeMaterial, texFromPix } from '../engine/materials.js';

const FALLBACK = {
  grass_a: '#3d8732', grass_b: '#3d8732', grass_flowers: '#3d8732', moss: '#587a3d', dirt: '#7a5834', sand: '#dcc48c',
  shore_pebbles: '#847f96', cobble: '#a39eb0', flagstone: '#a39eb0', ice: '#9ad0ea', cliff: '#5f5a72', cliff_warm: '#8a6a5c', cliff_bare: '#5f5a72', cliff_warm_bare: '#8a6a5c', far_rock: '#5f5a72',
  rune_ring: '#4a4658', brick: '#847f96', brick_warm: '#b98a6c', brick_mossy: '#7f9e4c', plaster: '#dccfb2', timber: '#dccfb2',
  wood_plank: '#8c6236', wood_beam: '#6b4526', roof_red: '#c45a3c', roof_teal: '#2e8088', thatch: '#b8943e', tower_stone: '#454158',
  metal_brass: '#b0802a', metal_iron: '#4a4654', window: '#ffc03c', door: '#6b4526', banner: '#5a2a9a', bark: '#634632', bark_pale: '#b4a894',
  leaves_green: '#2d8a3c', leaves_teal: '#288c80', leaves_autumn: '#d05a1c', pine: '#1f6a34', mushroom_cap: '#2a7d59', mushroom_stem: '#dccfb2',
  water: '#2a80b8', waterfall: '#d0f0f4', foam: '#ffffff', crystal_violet: '#a67cf0', crystal_cyan: '#70d0f0', lantern_glass_off: '#3e2a64',
  lantern_glass_on: '#ffc03c', barrier: '#7a4ad0', portal: '#a67cf0', beam: '#ffffff', sun_glow: '#ffe27a', cloud: '#dcd4f0', moon: '#eee8f4',
  sun_disc: '#ffe27a', vase: '#c45a3c', chest_wood: '#8c6236', crate: '#8c6236',
};

const NON_TILE = new Set(['rune_ring', 'window', 'door', 'banner', 'sun_glow', 'cloud', 'moon', 'sun_disc', 'vase', 'chest_wood', 'crate',
  'tuft', 'flower_pink', 'flower_yellow', 'flower_blue', 'reeds', 'fern', 'lilypad', 'vine', 'mushroom_cap', 'crystal_violet', 'crystal_cyan',
  'lantern_glass_off', 'lantern_glass_on']);

export class Assets {
  constructor() {
    this.raw = {};
    try { this.raw = generateWorldTextures(); } catch (e) { console.error('world textures failed', e); }
    this._tex = new Map();
    this._mats = new Map();
    this.missing = new Set();
  }

  has(name) { return !!this.raw[name]; }

  pix(name) {
    const r = this.raw[name];
    if (r) return r.pix || r;
    this.missing.add(name);
    const p = new Pix(8, 8, FALLBACK[name] || '#ff00ff');
    return p;
  }

  tile(name) {
    const r = this.raw[name];
    if (r && typeof r.tile === 'boolean') return r.tile;
    return !NON_TILE.has(name);
  }

  tex(name) {
    let t = this._tex.get(name);
    if (!t) { t = texFromPix(this.pix(name), { tile: this.tile(name) }); this._tex.set(name, t); }
    return t;
  }

  /** Cached material for a texture name. opts are makeMaterial options (mode, lit, scroll, double, ...). */
  mat(name, opts = {}) {
    if (opts.unique) {
      // per-entity material (own uniforms, e.g. for hit flashes); not cached
      const cutout = this.raw[name]?.cutout;
      return makeMaterial({ map: name ? this.tex(name) : undefined, mode: cutout && !opts.mode ? 'cutout' : undefined, ...opts, name });
    }
    const key = name + '|' + JSON.stringify(opts);
    let m = this._mats.get(key);
    if (!m) {
      const cutout = this.raw[name]?.cutout;
      m = makeMaterial({ map: name ? this.tex(name) : undefined, mode: cutout && !opts.mode ? 'cutout' : undefined, ...opts, name });
      this._mats.set(key, m);
    }
    return m;
  }
}
