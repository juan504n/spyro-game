// THE TIDE: a sea that rises and falls. Every other world has a water height that is a constant (level.js WATER_LEVEL, 0): the lake, the river and the bog are what the terrain carved
// below it, and the hero wades or drowns by the depth over the ground he stands on (player.js _water). A realm may give its water a height of its own that moves - `brief.tide`, which makes
// `level.tide` - and then `Game.waterY` is the live height (this module's tideLevel at the game's time) where every other world's is WATER_LEVEL for ever; everything that decides what the
// water does NOW reads that number (the player's drowning, the surface that is drawn, the splashes, what a Snuffer will walk into), and everything that is made once (the shape of the ground, the
// textures the picker lays, where props stand, the road) reads the MEAN level, which is WATER_LEVEL and does not move: the tide rises and falls round it.
//
//   tide: { period: 90, amp: 1.4, start: 0 }
//     period   seconds from one high tide to the next
//     amp      metres: the water stands this far over the mean level at high tide and as far under it at low tide
//     start    where in the cycle the world is when it begins, 0..1: 0 is low tide (and rising), 0.5 high tide (and falling)
//
// The tide is a pure function of game time, so a test can set the hour. The numbers a design needs (how long the road is under water, how fast the water rises, how far the hero must be from
// high ground when it starts to) are worked out here too, for the realm's brief to be held to them (tools/lib/realm-rules.mjs, the `tide.*` rules).
import { WATER_LEVEL } from '../level.js';

/** The limits of a believable tide: a period short enough to wait out and long enough to see, an amplitude that moves the shore without drowning the country. */
export const TIDE = { periodMin: 50, periodMax: 150, ampMin: 0.8, ampMax: 2.2 };
/** What the water does to the hero, as player.js has it: it drowns him from this depth (water; `level.liquid.burnDepth` for other liquids), and slows him to this share of a run while he wades. */
export const DROWN_DEPTH = 0.95;
export const WADE = 0.62;

const TAU = Math.PI * 2;

/** The height of the water at game time `t` (WATER_LEVEL, always, for a world without a tide). */
export const tideLevel = (tide, t) => (tide ? WATER_LEVEL - tide.amp * Math.cos(TAU * (t / tide.period + (tide.start || 0))) : WATER_LEVEL);
/** The lowest and the highest the water gets. */
export const tideLow = (tide) => (tide ? WATER_LEVEL - tide.amp : WATER_LEVEL);
export const tideHigh = (tide) => (tide ? WATER_LEVEL + tide.amp : WATER_LEVEL);
/** How fast the water rises at its fastest, in metres a second (halfway between the low tide and the high). */
export const tideRate = (tide) => (tide ? (tide.amp * TAU) / tide.period : 0);
/** Whether the water is coming in or going out at `t` (+1 rising, -1 falling). */
export const tideDir = (tide, t) => (tide ? (Math.sin(TAU * (t / tide.period + (tide.start || 0))) >= 0 ? 1 : -1) : 0);
/** The share of the cycle (0..1) that the water stands above height `y`: the whole of it under the low tide, none of it over the high. */
export function tideAbove(tide, y) {
  if (!tide) return y < WATER_LEVEL ? 1 : 0;
  const c = -(y - WATER_LEVEL) / tide.amp;
  return c >= 1 ? 1 : c <= -1 ? 0 : 1 - Math.acos(c) / Math.PI;
}
/** Seconds from `t` until the water next crosses height `y` going `dir` (+1 up, -1 down): 0 when it is crossing it that way now, Infinity when it never reaches `y` (or the world has no tide). */
export function tideNext(tide, t, y, dir) {
  if (!tide) return Infinity;
  const c = -(y - WATER_LEVEL) / tide.amp;
  if (c >= 1 || c <= -1) return Infinity;
  const a = Math.acos(c) / TAU;                                           // (cycles: it crosses y going up at a, and going down at 1 - a, every cycle)
  const at = dir > 0 ? a : 1 - a;
  const now = (((t / tide.period + (tide.start || 0)) % 1) + 1) % 1;
  return ((at - now + 1) % 1) * tide.period;
}
/** The metres the water must stand over the ground there for the hero to drown: the depth that kills. */
export const drownDepth = (level) => (level && level.liquid && level.liquid.burnDepth) || DROWN_DEPTH;

/**
 * How far from ground that is safe at high tide a hero can be and still get there before the water rises over his head: when the sea first covers the ground he stands on he has the time it
 * takes it to rise to the depth that drowns him (at its fastest rate), wading at WADE of a run. Half of that is the distance a designer may ask of the road: the hero does not know which way
 * is the nearest, and he must not have to run his best.
 */
export function refugeReach(tide, runSpeed = 11.5, drown = DROWN_DEPTH) {
  if (!tide) return Infinity;
  return 0.5 * runSpeed * WADE * (drown / tideRate(tide));
}

/** What a brief's `tide` has to be (brief.js defineBrief asks). Returns the list of problems, empty when it is a tide. */
export function tideProblems(t) {
  const n = (v) => typeof v === 'number' && Number.isFinite(v);
  const errs = [];
  if (!t || typeof t !== 'object') return ['tide: { period, amp, start }'];
  if (!(n(t.period) && t.period >= TIDE.periodMin && t.period <= TIDE.periodMax)) errs.push(`tide.period: seconds from high tide to high tide, ${TIDE.periodMin} to ${TIDE.periodMax}`);
  if (!(n(t.amp) && t.amp >= TIDE.ampMin && t.amp <= TIDE.ampMax)) errs.push(`tide.amp: metres of water over and under the mean level, ${TIDE.ampMin} to ${TIDE.ampMax}`);
  if (t.start !== undefined && !(n(t.start) && t.start >= 0 && t.start < 1)) errs.push('tide.start: where in the cycle the world begins, 0 (low tide) to 1 (not included)');
  return errs;
}
