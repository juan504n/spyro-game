// Gloaming Vale audio — sound-effect registry. Pure DSP (Node + browser).
//
// SFX maps every sound name to a function that returns a finished mono Float32Array at SR = 22050
// (see sfx-player.js / sfx-items.js / sfx-world.js for how each one is synthesized).
//
// Levels: every one-shot is normalised to -2 dBFS peak, so `vol` = 1 means "as rendered" and callers
// scale from there (the game already passes per-call vol values). Loop beds are baked at lower peaks
// (glide -6, flame -4, charge -5, portal / waterfall / windmill -12 dBFS) so vol = 1 is a sensible bed level.
// SFX_TRIM is an optional extra per-sound multiplier applied by the runtime; it is empty on purpose.

import { PLAYER_SFX } from './sfx-player.js';
import { ITEM_SFX } from './sfx-items.js';
import { WORLD_SFX } from './sfx-world.js';

export const SFX = { ...PLAYER_SFX, ...ITEM_SFX, ...WORLD_SFX };

export { SR } from './synth.js';

export const SFX_NAMES = Object.keys(SFX);

/** Sounds that are seamless loops (use audio.loop()). */
export const LOOP_NAMES = ['glide_loop', 'flame_loop', 'charge_loop', 'portal_hum', 'waterfall', 'windmill', 'whirl', 'surf'];

/** Optional per-sound runtime multiplier (name -> factor); empty: nothing is trimmed behind the caller's back. */
export const SFX_TRIM = {};

export const trimOf = (name) => SFX_TRIM[name] ?? 1;
