// The HD textures: the same materials as the pixel textures (../world/*.js), painted in floating point (no palette, no dither) at 256 x 256 (tiles and cards of the world) or at the size of a sprite, for the "smooth" look. The PS1 look keeps the pixel originals.
//
// A texture that has an HD painter gets `pix.hd`, a function that paints it (once: the result is kept) and returns a Pix, opaque or, for a sprite cut out of a card, with a plane of coverage; `texFromPix` (engine/materials.js) asks for it when the smooth
// look is on and HD is not turned off. A texture that has none (a realm's own) is enlarged and filtered as before. The painters are written from the palette ramps of the originals (or, where the original has no ramp of its own, from the colours
// the original uses, by `rampFrom`), and each tile is held to its twin's mean colour, so a realm keeps its colours. See kit.js for the tools they are made with, and tools/hd-test.mjs, tools/hd-sheet.mjs for what holds them and shows them.
import { RAMPS } from '../palette.js';
import * as T from './terrain.js';
import * as G from './ground.js';
import * as B from './buildings.js';
import * as P from './plants.js';
import * as W from './water.js';
import * as S from './sprites.js';
import * as Q from './props.js';
import * as M from './magic.js';

/**
 * The look's settings. `on`: the textures that have a painter are painted at all (off: the pixel textures are enlarged and filtered, as before the HD ones were made). `size`: the side, in pixels, of a square HD texture
 * (256 by default; 128 for a device that would be slow at painting: a quarter of the work, and still four times the detail of the pixel textures). The sprites keep their own sizes.
 */
export const HD = { on: true, size: 256 };
export const HD_SIZE = 256;

/**
 * the settings the page asks for: ?hd=0 (the pixel textures enlarged), ?hd=128 or ?hd=256 (the size); with no answer, what the player saved (`saved`, false = off), and a device with few cores or little memory paints at 128.
 * (Off does not take the painters away: the engine asks `HD.on` whenever it chooses an image, so the setting can be changed while the game is played: see setTextureHD in engine/materials.js.)
 */
export function configureHD(params, nav = typeof navigator !== 'undefined' ? navigator : null, saved = true) {
  const q = params && typeof params.get === 'function' ? params.get('hd') : null;
  HD.on = true; HD.size = 256;
  if (q === '0' || q === 'off') HD.on = false;
  else if (q === '128' || q === '256') HD.size = +q;
  else {
    if (saved === false) HD.on = false;
    if (nav && ((nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) || (nav.deviceMemory && nav.deviceMemory <= 2))) HD.size = 128;
  }
  return HD;
}

/** how many HD textures have been painted so far and how long it took (ms): the cost of the look, read by the tools and the debug readout */
export const HD_STATS = { made: 0, ms: 0 };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const meanOf = (pix) => {
  const m = [0, 0, 0], n = pix.w * pix.h;
  for (let i = 0; i < n; i++) { m[0] += pix.data[i * 4]; m[1] += pix.data[i * 4 + 1]; m[2] += pix.data[i * 4 + 2]; }
  return m.map((v) => v / n);
};

/** a ramp of `stops` colours, dark to light, from the colours a pixel texture uses: the colour at each quantile of its pixels by luminance (so a realm's ground keeps its own colours without a ramp of its own) */
export function rampFrom(pix, stops = 6) {
  const counts = new Map(), n = pix.w * pix.h;
  for (let i = 0; i < n; i++) {
    if (pix.data[i * 4 + 3] < 128) continue;
    const k = (pix.data[i * 4] << 16) | (pix.data[i * 4 + 1] << 8) | pix.data[i * 4 + 2];
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const list = [...counts].map(([k, c]) => { const r = k >> 16, g = (k >> 8) & 255, b = k & 255; return { c: [r, g, b], l: 0.3 * r + 0.59 * g + 0.11 * b, n: c }; }).sort((a, b) => a.l - b.l);
  const total = list.reduce((a, e) => a + e.n, 0), out = [];
  for (let s = 0; s < stops; s++) {
    const q = (0.04 + (0.92 * s) / Math.max(1, stops - 1)) * total;
    let acc = 0, pick = list[list.length - 1];
    for (const e of list) { acc += e.n; if (acc >= q) { pick = e; break; } }
    out.push(pick.c);
  }
  return out;
}

const SLATE = ['#2a3048', '#3a4262', '#4a5578', '#5e6a90', '#7a86a8', '#9aa4c2'];
const FROST = ['#3a4a68', '#56688a', '#7488ac', '#94a8c6', '#b8c8dc', '#dce8f4'];
const BASALT = ['#161214', '#241c1c', '#362a28', '#4e3e36', '#6a5848', '#8a7660'];
const MARBLE = ['#9a94a8', '#b8b0c4', '#d4cce0', '#e8e0ec', '#f4eef4', '#fffafc'];
const TIDE = ['#22384a', '#34545e', '#4c747c', '#6a9498', '#8eb4b0', '#b4d0c8'];

/** name -> (the pixel twin, { w, h, n }) => Canvas: `n` is the side of a square painting (HD.size), `w` x `h` the shape of the finished texture (the twin's, at the longer side asked for: see SIZE) */
export const PAINT = {
  // ---- meadows
  grass_a: (o, d) => T.turf(d.n, { seed: 1101, R: T.HD_RAMPS.grassSun, mean: meanOf(o) }),
  grass_b: (o, d) => T.turf(d.n, { seed: 1202, R: T.HD_RAMPS.grassLush, patchCells: 4, clover: true, mean: meanOf(o) }),
  grass_flowers: (o, d) => T.turf(d.n, { seed: 1101, R: T.HD_RAMPS.grassSun, mean: meanOf(o), flowers: { count: 6, kinds: [['#f4f0e8', '#ffc03c'], ['#e86a68', '#fff6c0'], ['#ffc03c', '#c05a14'], ['#5a8cf0', '#fff6c0']] } }),
  skyturf: (o, d) => T.turf(d.n, { seed: 1801, R: rampFrom(o, 6), contrast: 1.7, mean: meanOf(o) }),
  tideturf: (o, d) => T.turf(d.n, { seed: 2301, R: rampFrom(o, 6), contrast: 1.7, mean: meanOf(o) }),
  moss: (o, d) => P.moss(d.n, { seed: 1301, R: RAMPS.moss, mean: meanOf(o) }),
  // ---- earth, sand, snow, ash
  dirt: (o, d) => G.soil(d.n, { seed: 31, R: RAMPS.dirt, pebbleRamp: RAMPS.pathStone, mean: meanOf(o) }),
  path_snow: (o, d) => G.soil(d.n, { seed: 32, R: rampFrom(o, 6), pebbles: 4, ruts: 1, flecksN: 90, light: [255, 255, 255], dark: [60, 80, 130], crackColor: [70, 90, 140], mean: meanOf(o) }),
  path_ash: (o, d) => G.soil(d.n, { seed: 33, R: rampFrom(o, 6), pebbleRamp: RAMPS.pathStone, ruts: 1, mean: meanOf(o) }),
  path_sky: (o, d) => G.soil(d.n, { seed: 34, R: rampFrom(o, 6), pebbleRamp: RAMPS.pathStone, pebbles: 8, ruts: 1, mean: meanOf(o) }),
  path_tide: (o, d) => G.soil(d.n, { seed: 35, R: rampFrom(o, 6), pebbleRamp: ['#8aa0a0', '#b4c4bc', '#e0e4dc'], pebbles: 6, ruts: 1, flecksN: 200, mean: meanOf(o) }),
  sea_floor: (o, d) => G.soil(d.n, { seed: 36, R: rampFrom(o, 6), pebbleRamp: ['#2a5a5c', '#4a8a86', '#8ac0b4'], pebbles: 22, pebbleSize: [2.5, 6], crackColor: [8, 28, 34], cracks: 6, mean: meanOf(o) }),
  sand: (o, d) => G.dunes(d.n, { seed: 41, R: RAMPS.sand, ripples: 6, pebbles: 22, pebbleRamp: ['#7a6c5c', '#968874', '#b0a28c', '#c8bca4', '#e0d6c0'], pebbleSize: [2.4, 6], mean: meanOf(o) }),
  sand_tide: (o, d) => G.dunes(d.n, { seed: 42, R: rampFrom(o, 6), ripples: 7, shells: 3, mean: meanOf(o) }),
  sand_wet: (o, d) => G.dunes(d.n, { seed: 43, R: rampFrom(o, 6), ripples: 9, sheen: 0.16, sheenPow: 2.5, glints: 30, mean: meanOf(o) }),
  snow: (o, d) => G.drifts(d.n, { seed: 51, R: rampFrom(o, 6), hollow: '#9ab0dc', hollowAmount: 0.35, contrast: 0.6, mean: meanOf(o) }),
  snow_petals: (o, d) => G.drifts(d.n, { seed: 52, R: rampFrom(o, 6), hollow: '#9ab0dc', hollowAmount: 0.35, contrast: 0.6, petals: '#e8607e', mean: meanOf(o) }),
  ash: (o, d) => G.drifts(d.n, { seed: 53, R: rampFrom(o, 6), hollow: '#3a3030', hollowAmount: 0.45, clinker: 34, embers: 7, glints: 0, rippleAmount: 0, contrast: 1.5, clump: 0.2, grit: 0.07, mean: meanOf(o) }),
  far_rock: (o, d) => G.haze(d.n, { seed: 61, R: rampFrom(o, 4), mean: meanOf(o) }),
  far_frost: (o, d) => G.haze(d.n, { seed: 62, R: rampFrom(o, 4), mean: meanOf(o) }),
  far_ember: (o, d) => G.haze(d.n, { seed: 63, R: rampFrom(o, 4), mean: meanOf(o) }),
  far_sky: (o, d) => G.haze(d.n, { seed: 64, R: rampFrom(o, 4), mean: meanOf(o) }),
  far_tide: (o, d) => G.haze(d.n, { seed: 65, R: rampFrom(o, 4), mean: meanOf(o) }),
  // ---- cobbles, pebbles, slabs
  cobble: (o, d) => T.cobbles(d.n, { seed: 5, R: RAMPS.pathStone, gap: '#3c384a', moss: '#587a3d', cells: 5, mean: meanOf(o) }),
  cobble_frost: (o, d) => T.cobbles(d.n, { seed: 6, R: FROST, gap: '#b4c6de', moss: '#f4f8ff', mossAmount: 0.6, cells: 5, mean: meanOf(o) }),
  cobble_ember: (o, d) => T.cobbles(d.n, { seed: 7, R: BASALT, gap: '#1a1010', moss: '#2a2020', mossAmount: 0, cells: 5, glow: '#e8541a', gapPx: 2.6, toneLo: 0.3, toneHi: 0.9, mean: meanOf(o) }),
  cobble_sky: (o, d) => T.cobbles(d.n, { seed: 8, R: MARBLE, gap: '#6a6488', moss: '#8ad4ec', mossAmount: 0.4, cells: 5, mean: meanOf(o) }),
  cobble_tide: (o, d) => T.cobbles(d.n, { seed: 9, R: TIDE, gap: '#1a3038', moss: '#3a7a62', mossAmount: 0.5, cells: 5, gloss: 0.25, mean: meanOf(o) }),
  shore_pebbles: (o, d) => T.cobbles(d.n, { seed: 10, R: ['#4a4658', '#65627a', '#847f96', '#6a86a8', '#8a6a48', '#b8925a'], gap: '#2a2838', mossAmount: 0, cells: 9, gapPx: 1.8, relief: 0.9, rim: 10, gloss: 0.4, crackFrac: 0, mean: meanOf(o) }),
  cinder: (o, d) => T.cobbles(d.n, { seed: 12, R: BASALT, gap: '#0c0808', mossAmount: 0, cells: 4, glow: '#d8481a', gapPx: 2.4, relief: 0.8, rim: 14, toneLo: 0.18, toneHi: 0.55, mean: meanOf(o) }),
  ice: (o, d) => T.cobbles(d.n, { seed: 13, R: rampFrom(o, 6), gap: '#2a62ac', moss: '#eef8ff', mossAmount: 0.3, cells: 3, rows: 3, stagger: 0, jitter: 0.6, relief: 1.1, rim: 22, gloss: 0.5, crackFrac: 0.4, mean: meanOf(o) }),
  flagstone: (o, d) => T.masonry(d.n, { seed: 14, R: RAMPS.pathStone, mortar: '#3a3648', cols: 2, rows: 2, bond: 0, gap: 4.2, bevel: 1.5, wear: 0.9, tint: 8, mean: meanOf(o) }),
  // ---- rock walls
  cliff: (o, d) => T.strata(d.n, { seed: 11, R: RAMPS.cliff, moss: RAMPS.moss, mean: meanOf(o) }),
  cliff_bare: (o, d) => T.strata(d.n, { seed: 11, R: RAMPS.cliff, mean: meanOf(o) }),
  cliff_warm: (o, d) => T.strata(d.n, { seed: 15, R: RAMPS.cliffWarm, moss: RAMPS.moss, mean: meanOf(o) }),
  cliff_warm_bare: (o, d) => T.strata(d.n, { seed: 15, R: RAMPS.cliffWarm, mean: meanOf(o) }),
  cliff_frost: (o, d) => T.strata(d.n, { seed: 16, R: FROST, snow: '#f2f8ff', mean: meanOf(o) }),
  cliff_basalt: (o, d) => T.strata(d.n, { seed: 17, R: BASALT, snow: '#8c8480', ember: '#ff7a1c', mean: meanOf(o) }),
  cliff_basalt_bare: (o, d) => T.strata(d.n, { seed: 17, R: BASALT, ember: '#ff7a1c', mean: meanOf(o) }),
  cliff_marble: (o, d) => T.strata(d.n, { seed: 18, R: MARBLE, bands: 5, veins: { color: '#6a7cae', count: 9, width: 3, alpha: 0.55 }, mean: meanOf(o) }),
  cliff_tide: (o, d) => T.strata(d.n, { seed: 19, R: TIDE, salt: 700, mean: meanOf(o) }),
  // ---- masonry
  brick: (o, d) => T.masonry(d.n, { seed: 21, R: RAMPS.pathStone, mortar: '#3a3648', cols: 4, rows: 8, mean: meanOf(o) }),
  brick_warm: (o, d) => T.masonry(d.n, { seed: 22, R: RAMPS.brick, mortar: '#e0d4b4', cols: 4, rows: 8, tint: 16, mean: meanOf(o) }),
  brick_mossy: (o, d) => T.masonry(d.n, { seed: 23, R: RAMPS.pathStone, mortar: '#3a3648', cols: 4, rows: 8, moss: '#6aa040', mossAmount: 0.55, wear: 0.8, mean: meanOf(o) }),
  tower_stone: (o, d) => T.masonry(d.n, { seed: 24, R: SLATE, mortar: '#161a2c', cols: 4, rows: 8, tint: 8, mean: meanOf(o) }),
  // ---- what is built of wood, plaster, thatch, tile and metal
  plaster: (o, d) => B.stucco(d.n, { seed: 121, R: RAMPS.plaster, mean: meanOf(o) }),
  timber: (o, d) => B.timber(d.n, { seed: 111, W: RAMPS.wood, P: RAMPS.plaster, mean: meanOf(o) }),
  wood_beam: (o, d) => B.beam(d.n, { seed: 131, R: RAMPS.wood, mean: meanOf(o) }),
  wood_plank: (o, d) => B.planks(d.n, { seed: 71, R: RAMPS.wood, mean: meanOf(o) }),
  roof_red: (o, d) => B.shingles(d.n, { seed: 81, R: RAMPS.roofRed, mean: meanOf(o) }),
  roof_teal: (o, d) => B.shingles(d.n, { seed: 82, R: RAMPS.roofTeal, mean: meanOf(o) }),
  thatch: (o, d) => B.thatch(d.n, { seed: 91, R: RAMPS.thatch, mean: meanOf(o) }),
  metal_brass: (o, d) => B.plate(d.n, { seed: 101, R: RAMPS.brass, mean: meanOf(o) }),
  metal_iron: (o, d) => B.plate(d.n, { seed: 102, R: RAMPS.metal, mean: meanOf(o) }),
  // ---- trees
  leaves_green: (o, d) => P.canopy(d.n, { seed: 4101, R: RAMPS.leaf, mean: meanOf(o) }),
  leaves_teal: (o, d) => P.canopy(d.n, { seed: 4102, R: RAMPS.leafTeal, mean: meanOf(o) }),
  leaves_autumn: (o, d) => P.canopy(d.n, { seed: 4103, R: RAMPS.leafAutumn, mean: meanOf(o) }),
  leaves_blossom: (o, d) => P.canopy(d.n, { seed: 4104, R: rampFrom(o, 6), mean: meanOf(o) }),
  leaves_frost: (o, d) => P.canopy(d.n, { seed: 4105, R: rampFrom(o, 6), mean: meanOf(o) }),
  bark: (o, d) => P.bark(d.n, { seed: 4601, R: RAMPS.bark, moss: '#587a3d', mossAmount: 0.55, mean: meanOf(o) }),
  bark_pale: (o, d) => P.bark(d.n, { seed: 4602, R: RAMPS.barkPale, furrows: 6, depth: 0.5, dashes: 120, dashColor: [58, 48, 42], contrast: 0.7, mean: meanOf(o) }),
  pine: (o, d) => P.fir(d.n, { seed: 4501, P: { shade: '#16482e', back: '#1c7048', mid: '#2c9058', light: '#48b070', tip: '#80d090' }, mean: meanOf(o) }),
  pine_snow: (o, d) => P.fir(d.n, { seed: 4502, P: { shade: '#14403c', back: '#1c5a54', mid: '#2e7864', light: '#9cc4d4', tip: '#e6f2fa' }, mean: meanOf(o) }),
  pine_char: (o, d) => P.fir(d.n, { seed: 4503, P: { shade: '#140e0c', back: '#241812', mid: '#3a2a20', light: '#5c4030', tip: '#e8661c' }, mean: meanOf(o) }),
  pine_sky: (o, d) => P.fir(d.n, { seed: 4504, P: { shade: '#1c4048', back: '#2c6462', mid: '#4a9084', light: '#86c4b0', tip: '#d4f0e4' }, mean: meanOf(o) }),
  // ---- water, lava, cloud, glass
  water: (o, d) => W.water(d.n, { seed: 201, R: RAMPS.water, mean: meanOf(o) }),
  water_tide: (o, d) => W.water(d.n, { seed: 202, R: ['#082830', '#0e4a52', '#176e72', '#2a9690', '#6cc4b4', '#c8f0e4'], glintColor: [220, 255, 244], mean: meanOf(o) }),
  waterfall: (o, d) => W.fall(d.n, { seed: 251, R: rampFrom(o, 6), mean: meanOf(o) }),
  lava: (o, d) => W.lava(d.n, { seed: 211, mean: meanOf(o), meanAmount: 0 }),
  cloud_sea: (o, d) => W.billows(d.n, { seed: 221, R: rampFrom(o, 6), mean: meanOf(o) }),
  glass: (o, d) => W.pane(d.n, { seed: 241, R: rampFrom(o, 6), mean: meanOf(o) }),
  // ---- sprites (cut out of a card: painted at their own size, with a plane of coverage)
  tuft: (o, d) => S.tuft(d.w, d.h, { R: RAMPS.grass }),
  flower_pink: (o, d) => S.flowerPink(d.w, d.h, { R: RAMPS.grass }),
  flower_yellow: (o, d) => S.flowerYellow(d.w, d.h, { R: RAMPS.grass }),
  flower_blue: (o, d) => S.flowerBlue(d.w, d.h, { R: RAMPS.grass }),
  flower_ember: (o, d) => S.flowerEmber(d.w, d.h, {}),
  flower_sky: (o, d) => S.flowerSky(d.w, d.h, {}),
  reeds: (o, d) => S.reeds(d.w, d.h, { R: RAMPS.grass }),
  fern: (o, d) => S.fern(d.w, d.h, { R: RAMPS.leaf }),
  lilypad: (o, d) => S.lilypad(d.w, d.h, { R: RAMPS.leaf }),
  vine: (o, d) => S.vine(d.w, d.h, { R: RAMPS.leaf }),
  // ---- what is made and carried
  crate: (o, d) => Q.crate(d.w, d.h, { R: RAMPS.wood }),
  chest_wood: (o, d) => Q.chest(d.w, d.h, { R: RAMPS.wood, M: RAMPS.metal, B: RAMPS.brass }),
  vase: (o, d) => Q.vase(d.w, d.h, { R: ['#5a2a1a', '#8a4a2c', '#b8704a', '#d8946a', '#f0b890'] }),
  window: (o, d) => Q.windowTex(d.w, d.h, { W: RAMPS.wood, G: RAMPS.amber }),
  door: (o, d) => Q.door(d.w, d.h, { W: RAMPS.wood, M: RAMPS.metal }),
  banner: (o, d) => Q.banner(d.w, d.h, { P: RAMPS.crystalViolet, G: RAMPS.amber, W: RAMPS.wood }),
  // ---- light, magic and the sky
  crystal_violet: (o, d) => M.crystal(d.w, d.h, { seed: 9001, R: RAMPS.crystalViolet }),
  crystal_cyan: (o, d) => M.crystal(d.w, d.h, { seed: 9002, R: [...RAMPS.crystalCyan, '#eaffff'] }),
  crystal_ember: (o, d) => M.crystal(d.w, d.h, { seed: 9003, R: ['#3a0a0a', '#7a1a10', '#c4401a', '#f07a22', '#ffc060', '#fff0c0'] }),
  lantern_glass_off: (o, d) => M.lanternGlass(d.w, d.h, { seed: 9101, on: false, B: RAMPS.brass, V: RAMPS.crystalViolet, A: RAMPS.amber }),
  lantern_glass_on: (o, d) => M.lanternGlass(d.w, d.h, { seed: 9102, on: true, B: RAMPS.brass, V: RAMPS.crystalViolet, A: RAMPS.amber }),
  barrier: (o, d) => M.barrier(d.n, { seed: 9201, R: RAMPS.crystalViolet }),
  portal_swirl: (o, d) => M.swirl(d.w, { seed: 9301, R: RAMPS.crystalViolet }),
  beam: (o, d) => M.beam(d.w, d.h, { seed: 9401 }),
  sun_glow: (o, d) => M.glow(d.w),
  rune_ring: (o, d) => M.runeRing(d.w, { seed: 9501, R: RAMPS.crystalViolet }),
  rune_court: (o, d) => M.runeCourt(d.w, { seed: 9601, R: RAMPS.crystalViolet }),
  moon: (o, d) => M.moon(d.w, d.h, { seed: 9701, R: ['#6a6684', '#9894b4', '#c4c0d8', '#e8e4f2', '#ffffff'] }),
  sun_disc: (o, d) => M.sunDisc(d.w, d.h, { seed: 9801, R: ['#e06a10', '#f0901c', '#ffc03c', '#ffe27a', '#fff6c0', '#ffffff'] }),
  cloud: (o, d) => M.cloud(d.w, d.h, { seed: 9901 }),
  foam: (o, d) => M.foam(d.n, { seed: 9951 }),
  whirl: (o, d) => M.whirl(d.n, { seed: 9961 }),
  portal: (o, d) => M.portalTile(d.n, { seed: 9971, R: RAMPS.crystalViolet }),
  mushroom_cap: (o, d) => P.mushroomCap(d.w, d.h, { T: RAMPS.leafTeal, V: RAMPS.crystalViolet }),
  mushroom_stem: (o, d) => P.mushroomStem(d.w, d.h, {}),
};

/** the size (px, the longer side) of the textures that are not painted at HD_SIZE; the shape is the twin's */
export const SIZE = { tuft: 128, flower_pink: 128, flower_yellow: 128, flower_blue: 128, flower_ember: 128, flower_sky: 128, fern: 128, lilypad: 128, reeds: 256, vine: 256, window: 128, crystal_violet: 128, crystal_cyan: 128, crystal_ember: 128, lantern_glass_off: 128, lantern_glass_on: 128, sun_glow: 128, moon: 128, sun_disc: 128, mushroom_stem: 128 };
/** the sprites: cut out by their coverage, and mipmapped (as a tile is) so that they do not shimmer at a distance */
export const SPRITES = new Set(['tuft', 'flower_pink', 'flower_yellow', 'flower_blue', 'flower_ember', 'flower_sky', 'reeds', 'fern', 'lilypad', 'vine', 'moon', 'sun_disc', 'cloud', 'foam']);

/** give the textures that have a painter their `hd` (see above); `all` is what generateWorldTextures() builds */
export function attachHD(all) {
  for (const name of Object.keys(PAINT)) {
    const e = all[name];
    if (!e || !e.pix) continue;
    let made = null;
    const make = () => {
      const t0 = now();
      const size = SIZE[name] || HD.size, k = size / Math.max(e.pix.w, e.pix.h), dims = { w: Math.round(e.pix.w * k), h: Math.round(e.pix.h * k), n: HD.size };      // (a texture that is not square is painted square and squeezed to its shape)
      made = PAINT[name](e.pix, dims).toPix(dims.w, dims.h);
      HD_STATS.made++; HD_STATS.ms += now() - t0;
      return made;
    };
    const hd = () => made || make();
    hd.mip = SPRITES.has(name);
    Object.defineProperty(e.pix, 'hd', { value: hd, enumerable: false, configurable: true });
  }
  return all;
}

/** which of the textures named in `used` exist in `world` (what generateWorldTextures() builds) but have no HD painting: the smooth look enlarges their pixels, and they look pixelated beside the rest (the foundry's `textures.hd` rule) */
export function withoutHD(used, world) {
  return [...used].filter((t) => t && t !== '_' && world[t] && world[t].pix && typeof world[t].pix.hd !== 'function');
}
