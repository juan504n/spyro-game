// Gloaming Vale audio — the sounds of the foes that came with round thirty-eight (every realm has foes of its own: foes/orbit.js, brute.js, gust.js, shell.js, drift.js). Pure DSP, made with the
// others of sfx-foes.js when a realm that has foes is built.
//
//   foe_shiver  0.5 s  a Shiverling shivers before its dash: a chatter of cold ticks on a thin glass ping, quickening
//   foe_slam    0.95 s a Slag Brute's fists come down: a deep thump 90 -> 32 Hz, a metal crash, a rumble of slag and a hiss of heat
//   foe_vent    1.3 s  its furnace vents: a long hiss of steam over a low roar that dies away
//   foe_wound   0.6 s  a blow lands in the open hatch: a clang, a groan falling 220 -> 110 Hz and sparks
//   foe_gather  1.0 s  a Gale Spirit gathers: air drawn in, a band that sweeps up 400 -> 1500 Hz and swells
//   foe_gust    0.75 s the blast: a roar of wind that peaks at once and falls away, a low rush under it
//   foe_snap    0.4 s  a Shellback's claws: two hard clacks and a scrape of shell
//   foe_flip    0.7 s  the shell goes over: a hollow clunk, a clatter of legs and a little scramble
//   foe_glow    0.9 s  a Drifter gathers its charge: a hum rising 220 -> 880 Hz with a shimmer of glass
//   foe_pulse   0.6 s  the pulse: a zap falling 2200 -> 300 Hz over a crackle, one glass ping
import { TAU, decay, ad, seedOf, removeDC, filterBuf } from './synth.js';
import { finalizeSfx as fin } from './spu.js';
import { layer, lvl, sweep, noiseFilt, thump, ping, bell, ticks, creak, hz } from './sfx-kit.js';

const pk = (x, p = 1) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, x))), p);

export const FOE_SFX2 = {
  foe_shiver() {
    const s = seedOf('foe_shiver');
    const chatter = ticks(0.5, s, 22, 2400, 7000, { tMin: 0, tMax: 0.44, gain: 0.8, lenHi: 0.006 });
    return fin(layer(0.5, [[chatter, 0, 0.9], [bell(hz('D7'), 0.45, 0.16, 0.8, 0.002), 0.03, 0.35], [sweep(0.4, 1800, 2600, { wave: 'sine', env: (t, x) => 0.2 * pk(x, 0.7) }), 0.05, 0.3]]), { grit: 0.2, fadeOut: 60 });
  },

  foe_slam() {
    const s = seedOf('foe_slam');
    const crash = noiseFilt(0.9, s, { mode: 'lp', f0: 3600, f1: 160, q: 0.8, curve: 0.7, env: (t) => Math.min(1, t / 0.003) * decay(t, 0.22) });
    const slag = noiseFilt(0.9, s + 1, { mode: 'lp', f0: 380, f1: 120, q: 0.9, colour: 'brown', env: (t, x) => pk(x, 0.5) });
    const heat = noiseFilt(0.8, s + 2, { mode: 'hp', f0: 4200, f1: 6500, q: 0.7, env: (t, x) => 0.5 * ad(t, 0.05, 0.4) * (1 - x) });
    const b = layer(0.95, [[thump(0.9, 90, 32, 0.07, 0.3), 0, 1], [thump(0.7, 140, 60, 0.04, 0.12), 0, 0.7], [crash, 0, 0.9], [lvl(slag, 0.25), 0.05, 0.6], [heat, 0.1, 0.4]]);
    return fin(filterBuf(removeDC(b), 'hp', 40), { grit: 0.4, fadeOut: 160 });
  },

  foe_vent() {
    const s = seedOf('foe_vent');
    const steam = noiseFilt(1.3, s, { mode: 'bp', f0: 5200, f1: 3200, q: 0.8, env: (t, x) => Math.min(1, t / 0.05) * Math.pow(1 - x, 0.8) });
    const roar = noiseFilt(1.3, s + 1, { mode: 'lp', f0: 260, f1: 90, q: 0.9, colour: 'brown', env: (t, x) => pk(Math.min(1, x * 1.1), 0.5) });
    return fin(filterBuf(removeDC(layer(1.3, [[lvl(steam, 0.25), 0, 0.9], [lvl(roar, 0.3), 0, 0.8]])), 'hp', 45), { grit: 0.3, fadeOut: 200 });
  },

  foe_wound() {
    const s = seedOf('foe_wound');
    const spark = ticks(0.5, s, 14, 2500, 7000, { tMin: 0, tMax: 0.3, gain: 0.8, lenHi: 0.006 });
    const groan = creak(0.6, 220, 110, s, { env: (t, x) => 0.5 * ad(t, 0.02, 0.5) * (1 - x * 0.5) });
    return fin(layer(0.6, [[bell(hz('A4'), 0.5, 0.14, 1.2, 0.001), 0, 0.8], [thump(0.2, 180, 70, 0.02, 0.07), 0, 0.7], [groan, 0.04, 0.6], [spark, 0.01, 0.5]]), { grit: 0.35, fadeOut: 80 });
  },

  foe_gather() {
    const s = seedOf('foe_gather');
    const air = noiseFilt(1.0, s, { mode: 'bp', f0: 400, f1: 1500, q: 1.4, env: (t, x) => Math.pow(x, 0.9) * (1 - 0.3 * x) * Math.min(1, t / 0.1) });
    const lo = noiseFilt(1.0, s + 1, { mode: 'lp', f0: 220, f1: 420, q: 0.8, colour: 'pink', env: (t, x) => 0.5 * pk(x, 0.7) });
    return fin(layer(1.0, [[lvl(air, 0.3), 0, 1], [lvl(lo, 0.2), 0, 0.5]]), { grit: 0.25, fadeOut: 90 });
  },

  foe_gust() {
    const s = seedOf('foe_gust');
    const roar = noiseFilt(0.75, s, { mode: 'bp', f0: 1800, f1: 500, q: 0.9, env: (t) => Math.min(1, t / 0.015) * decay(t, 0.3) });
    const low = noiseFilt(0.75, s + 1, { mode: 'lp', f0: 300, f1: 120, q: 0.8, colour: 'pink', env: (t) => Math.min(1, t / 0.02) * decay(t, 0.4) });
    return fin(filterBuf(removeDC(layer(0.75, [[lvl(roar, 0.3), 0, 1], [lvl(low, 0.3), 0, 0.8], [thump(0.2, 120, 60, 0.03, 0.08), 0, 0.5]])), 'hp', 50), { grit: 0.3, fadeOut: 120 });
  },

  foe_snap() {
    const s = seedOf('foe_snap');
    const clack = (f) => layer(0.12, [[noiseFilt(0.06, s + f, { mode: 'bp', f0: 2200 + f * 40, q: 2.2, env: (t) => decay(t, 0.006) }), 0, 1], [thump(0.1, 520, 260, 0.01, 0.025), 0, 0.5]]);
    const scrape = noiseFilt(0.3, s + 9, { mode: 'bp', f0: 3400, f1: 2000, q: 1.2, env: (t, x) => 0.25 * pk(x, 0.8) });
    return fin(layer(0.4, [[clack(1), 0, 1], [clack(7), 0.1, 0.9], [scrape, 0.02, 0.5]]), { grit: 0.3, fadeOut: 50 });
  },

  foe_flip() {
    const s = seedOf('foe_flip');
    const legs = ticks(0.7, s, 18, 1400, 4200, { tMin: 0.12, tMax: 0.6, gain: 0.7, lenHi: 0.01 });
    return fin(layer(0.7, [[thump(0.4, 190, 70, 0.04, 0.12), 0, 1], [noiseFilt(0.25, s + 1, { mode: 'bp', f0: 900, q: 1.1, env: (t) => decay(t, 0.05) }), 0, 0.6], [legs, 0, 0.7]]), { grit: 0.3, fadeOut: 100 });
  },

  foe_glow() {
    const s = seedOf('foe_glow');
    const hum = sweep(0.9, 220, 880, { wave: 'tri', curve: 1.4, env: (t, x) => 0.3 * ad(t, 0.1, 0.7) * (0.6 + 0.4 * x) });
    const shim = ticks(0.9, s, 16, 3000, 8000, { tMin: 0.3, tMax: 0.85, gain: 0.5, lenHi: 0.006 });
    return fin(layer(0.9, [[hum, 0, 1], [bell(hz('E6'), 0.7, 0.3, 0.9, 0.01), 0.35, 0.3], [shim, 0, 0.5]]), { grit: 0.15, fadeOut: 100 });
  },

  foe_pulse() {
    const s = seedOf('foe_pulse');
    const zap = sweep(0.5, 2200, 300, { wave: 'saw', curve: 0.8, env: (t, x) => 0.25 * Math.min(1, t / 0.004) * decay(t, 0.12) });
    const crackle = ticks(0.6, s, 26, 1800, 7000, { tMin: 0, tMax: 0.4, gain: 0.8, lenHi: 0.006 });
    return fin(layer(0.6, [[zap, 0, 0.9], [crackle, 0, 0.8], [thump(0.2, 160, 60, 0.03, 0.06), 0, 0.5], [bell(hz('B6'), 0.45, 0.12, 1, 0.001), 0.04, 0.4]]), { grit: 0.3, fadeOut: 70 });
  },
};
