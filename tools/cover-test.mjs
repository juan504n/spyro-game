#!/usr/bin/env node
// Ground cover stands on the ground (round thirty-three). A patch of flowers, tufts, ferns or reeds is 3 to 5.6 m across, and every card of it used to be drawn at the height of the patch's CENTRE: on a
// slope, or on a ledge, the cards round it hung in the air (or were buried), and about a quarter of the Vale's flowers, tufts and ferns floated more than 15 cm up, some by metres, over a cliff's
// edge or the shore. Now each card is drawn on the terrain under it (props/nature/util.js `groundAt`), skipped where that is a cliff face or deep water, and a prop that was given a `y` of
// its own (a sky island's top) is flat at it, as it was.
//
//   node tools/cover-test.mjs [--quick]     (--quick: the unit part only; the six worlds take about 30 s)
//
//   the helper     groundAt on a flat ground, a hillside, a cliff, a shore and with a `y`, through a rotated and scaled frame
//   the props      flower_patch, tuft_patch, fern_patch and reeds on a hillside, on a ledge and on a shore: every card on the terrain (to 10 cm), none on a cliff face or in deep water, the cards that
//                  remain are the ones a level ground gives (a card that has no ground changes none of the others), the same twice; and given a `y` they are flat (the old way: the test sees the problem)
//   the worlds     every card the four props drew in the six worlds, attributed to the prop that drew it (a bush's blossoms and a garden bed's plants stand above the ground on purpose): none more than
//                  35 cm above the ground, none buried
import { Builder } from '../src/engine/builder.js';
import { Kit, flatGrid } from '../src/game/kit.js';
import { Lighting } from '../src/engine/lighting.js';
import { PROPS } from '../src/game/props/index.js';
import { groundAt } from '../src/game/props/nature/util.js';
import { WATER_LEVEL } from '../src/game/level.js';

const QUICK = process.argv.includes('--quick');
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : detail); };
const near = (a, b, e = 1e-6) => typeof a === 'number' && Math.abs(a - b) <= e;

// ---- a terrain to stand things on: a height function and the slope it has (as the real grid's slopeAt answers: the angle of its normal) -----------------------------------------------------
const terrain = (h) => {
  const g = flatGrid(0);
  g.heightAt = h;
  g.slopeAt = (x, z) => { const e = 0.4, gx = (h(x + e, z) - h(x - e, z)) / (2 * e), gz = (h(x, z + e) - h(x, z - e)) / (2 * e); return Math.atan(Math.hypot(gx, gz)); };
  return g;
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const FLAT = terrain(() => 3);
const HILL = terrain((x) => 3 + 0.4 * x);                                             // a slope of 0.38 rad: grass
const LEDGE = terrain((x) => 9 - 6 * smooth(1.0, 3.0, x));                          // a plateau of 9 m, a cliff of 6 m in 2 m (steeper than 0.55 rad over 1.9 m of it), a floor of 3 m
const SHORE = terrain((x) => 0.5 - 2.5 * smooth(0, 10, x));                         // a bank of 0.5 m that slopes (0.36 rad at most) under the water's surface (0): shallows from x = 3 to 5.7, deeper than a metre beyond

const lighting = new Lighting();
lighting.attach(flatGrid(0));
const COVER = /^(flower_|tuft$|fern$|reeds$)/;
/** the middle of the lowest edge of the quad that starts at vertex v (the two corners of its base: a quad is six vertices, two of its corners twice) and the height of that edge */
function baseOf(pos, v) {
  let minY = Infinity;
  for (let k = 0; k < 6; k++) minY = Math.min(minY, pos[(v + k) * 3 + 1]);
  const seen = new Set(); let sx = 0, sz = 0, c = 0;
  for (let k = 0; k < 6; k++) {
    const i = (v + k) * 3;
    if (pos[i + 1] >= minY + 0.02) continue;
    const key = `${pos[i].toFixed(4)},${pos[i + 2].toFixed(4)}`;
    if (!seen.has(key)) { seen.add(key); sx += pos[i]; sz += pos[i + 2]; c++; }
  }
  return { x: sx / c, z: sz / c, base: minY };
}
/** the cards a prop drew on a terrain: { x, z, base } of the lowest edge of each quad */
function cards(name, grid, params) {
  const e = PROPS[name], kit = new Kit({ assets: null, lighting, grid }), p = { ...(e.defaults || {}), x: 0, z: 0, ...params };
  kit.setPass('dry'); e.fn(kit, p);
  kit.setPass('wet'); e.fn(kit, p);
  const out = [];
  for (const [key, { builder }] of kit.builders) {
    if (!COVER.test(key.split('|')[0])) continue;
    const pos = builder.pos;
    for (let v = 0; v + 5 < pos.length / 3; v += 6) out.push(baseOf(pos, v));
  }
  return out;
}
const key2 = (c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}`;

// ---- the helper ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
{
  /** runs fn(ground) inside a patch frame at (x, z): ground(lx, lz, options) is groundAt for a point of the patch */
  const inFrame = (grid, x, z, o, fn) => { const kit = new Kit({ assets: null, lighting, grid }); let r; kit.at(x, z, o, () => { r = fn((lx, lz, q) => groundAt(kit, lx, lz, q)); }); return r; };
  check('groundAt: on level ground every point of the patch is at the patch\'s own height (0)', inFrame(FLAT, 5, 5, {}, (g) => near(g(0, 0), 0) && near(g(3, -2), 0) && near(g(-4, 4), 0)));
  // a hillside, through a frame turned by 1.1 rad and scaled by 1.5: the local point (2, -1) is at world x + (2 cos 1.1 + -1 sin 1.1) * 1.5
  const rot = 1.1, scale = 1.5, wx = 5 + (2 * Math.cos(rot) + -1 * Math.sin(rot)) * scale;
  const hill = inFrame(HILL, 5, 5, { rot, scale }, (g) => ({ v: g(2, -1), tight: g(0, 0, { slope: 0.3 }), loose: g(0, 0), own: g(3, 3, { y: 20 }) }));
  check('groundAt: on a hillside it is the terrain\'s height under the point, in the patch\'s own units, through a turned and scaled frame', near(hill.v, (3 + 0.4 * wx - (3 + 0.4 * 5)) / scale, 1e-9), `(${hill.v.toFixed(4)} for world x ${wx.toFixed(3)})`);
  check('groundAt: the limit is the slope asked for (0.38 rad is ground at the default 0.55, not at 0.3)', hill.loose !== null && hill.tight === null);
  check('groundAt: a prop that was given a y of its own (a sky island\'s top) is flat at it: 0, whatever the terrain under it', hill.own === 0);
  const led = inFrame(LEDGE, 0, 0, {}, (g) => ({ face: g(2, 0), top: g(0, 0), floor: g(4.5, 0) }));
  check('groundAt: on the face of a cliff there is none (an upright flower on it would hang over the drop); above and below it there is ground', led.face === null && led.top === 0 && near(led.floor, 3 - 9, 1e-9), `(${led.face}, ${led.top}, ${led.floor})`);
  const sh = inFrame(SHORE, 0, 0, {}, (g) => ({ bank: g(0, 0), under: g(4, 0), wading: g(4, 0, { wade: 1 }), wadingMid: g(5, 0, { wade: 1 }), deep: g(7, 0, { wade: 1 }) }));
  check('groundAt: under the water there is none; a plant that wades (a reed) gets the water\'s surface where the bed is under it by less than a metre, and none deeper', sh.bank === 0 && sh.under === null && near(sh.wading, WATER_LEVEL - 0.5, 1e-9) && near(sh.wadingMid, WATER_LEVEL - 0.5, 1e-9) && sh.deep === null, `(${JSON.stringify(sh)})`);
}

// ---- the props -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const COVERS = [['flower_patch', { r: 5, count: 40 }, -0.05], ['tuft_patch', { r: 5, count: 40 }, -0.05], ['fern_patch', { r: 6, count: 10, x: 0.4, z: 0.7 }, -0.05], ['reeds', { r: 5, count: 30 }, -0.1]];
for (const [name, params, drop] of COVERS) {
  const onFlat = cards(name, FLAT, params), onHill = cards(name, HILL, params);
  const worst = Math.max(...onHill.map((c) => Math.abs(c.base - (3 + 0.4 * c.x) - drop)));
  check(`${name} on a hillside: every card stands on the ground under it (to 10 cm)`, onHill.length === onFlat.length && onHill.length > 8 && worst < 0.1, `(${onHill.length} cards of ${onFlat.length}; the worst is ${worst.toFixed(3)} m off)`);
  const withY = cards(name, HILL, { ...params, y: 3 }), flatDev = Math.max(...withY.map((c) => Math.abs(c.base - (3 + 0.4 * c.x)))), notFlat = Math.max(...withY.map((c) => Math.abs(c.base - 3 - drop)));
  check(`${name} given a y of its own is flat at it, as before (and on the same hillside that is metres off the ground: the check sees the problem)`, notFlat < 1e-6 && flatDev > 1.2, `(flat at y, up to ${flatDev.toFixed(2)} m from the hillside)`);
  const onLedge = cards(name, LEDGE, params), floorN = onLedge.filter((c) => c.x > 3.1).length, topN = onLedge.filter((c) => c.x < 0.9).length, flatSet = new Set(onFlat.map(key2)), need = name === 'fern_patch' ? 0 : 2, slopeTol = name === 'fern_patch' ? 0.3 : 0;       // (a fern's cards stand up to 15 cm from the middle of its rosette, which is where the ground is asked)
  const slopes = onLedge.map((c) => LEDGE.slopeAt(c.x, c.z)), off = onLedge.map((c) => Math.abs(c.base - LEDGE.heightAt(c.x, c.z) - drop));
  check(`${name} at a cliff's edge: none on the cliff face, the plateau and the floor below both keep theirs, each standing on its own ground`, floorN > need && topN > need && Math.max(...slopes) <= 0.56 + slopeTol && Math.max(...off) < 0.1, `(${topN} on the plateau, ${floorN} on the floor, ${onLedge.length} of ${onFlat.length} on level ground; the steepest ${Math.max(...slopes).toFixed(2)} rad, the worst ${Math.max(...off).toFixed(3)} m off)`);
  check(`${name}: the cards that stay are the ones a level ground gives (a card with no ground to stand on changes none of the others)`, onLedge.every((c) => flatSet.has(key2(c))) && onLedge.length < onFlat.length, `(${onLedge.length} of ${onFlat.length})`);
  check(`${name}: the same twice (it is drawn in two passes, which must agree)`, JSON.stringify(cards(name, LEDGE, params)) === JSON.stringify(onLedge));
}
{
  const flowers = cards('flower_patch', SHORE, { r: 5, count: 40 }), reeds = cards('reeds', SHORE, { r: 5, count: 30 }), wading = reeds.filter((c) => SHORE.heightAt(c.x, c.z) < WATER_LEVEL);
  check('flowers on a shore: none under the water', flowers.length > 5 && flowers.every((c) => SHORE.heightAt(c.x, c.z) >= WATER_LEVEL - 0.05), `(${flowers.length} cards)`);
  check('reeds on a shore: on the bank they stand on it, in the shallows at the water\'s surface, none in deep water', reeds.length > 5 && wading.length > 0 && reeds.every((c) => SHORE.heightAt(c.x, c.z) >= WATER_LEVEL - 1.05) && reeds.every((c) => Math.abs(c.base - (Math.max(SHORE.heightAt(c.x, c.z), WATER_LEVEL) - 0.1)) < 0.12), `(${reeds.length} cards, ${wading.length} of them wading)`);
}

// ---- the worlds ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (!QUICK) {
  // every quad is attributed to the prop being built (the kit's current placement record), so that what a bush or a garden bed holds up in the air is not counted
  let cur = null;
  Object.defineProperty(Kit.prototype, 'cur', { get() { return this._cur; }, set(v) { this._cur = v; cur = v; }, configurable: true });
  const quad = Builder.prototype.quad;
  Builder.prototype.quad = function (...a) { if (this.enabled) (this.owner ||= []).push(cur ? cur.name : '?'); return quad.apply(this, a); };
  const { buildHeadless } = await import('./headless-world.mjs');
  const OWN = new Set(['flower_patch', 'tuft_patch', 'fern_patch', 'reeds']);
  for (const id of ['gloaming', 'home', 'frostbloom', 'emberfall', 'skyweaver', 'tideglass']) {
    const { grid, kit } = buildHeadless(id);
    let n = 0, high = 0, buried = 0, worst = 0, lifted = 0;
    for (const [key, { builder }] of kit.builders) {
      if (!COVER.test(key.split('|')[0])) continue;
      const pos = builder.pos, owner = builder.owner || [];
      for (let q = 0; q * 6 + 5 < pos.length / 3; q++) {
        if (!OWN.has(owner[q])) { if (owner[q] === 'bush' || owner[q] === 'garden_plot') lifted++; continue; }
        const b = baseOf(pos, q * 6), g = grid.heightAt(b.x, b.z), onWater = g < -0.15 && Math.abs(b.base - 0.2) < 0.45;        // (a reed in the shallows, at the water's surface, on purpose)
        const f = onWater ? 0 : b.base - g;
        n++; if (f > 0.35) high++; if (f < -0.5) buried++; worst = Math.max(worst, f);
      }
    }
    check(`${id}: every card of the flower, tuft, fern and reed patches is on the ground (none more than 35 cm up, none buried)`, n > 400 && high === 0 && buried === 0, `(${n} cards, the highest ${worst.toFixed(2)} m up; ${lifted} cards of bushes and garden beds are held up on purpose and not counted)`);
  }
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
