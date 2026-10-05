// Gloaming Vale audio — the trials' sounds (trials/, systems/trialview.js). Pure DSP. Made when a realm is built (assets.js LAZY_GROUPS 'trials'), not at every start-up.
//
//   trial_bell   1.5 s  a bronze bell struck (C5, the others of the tune are this played faster): inharmonic partials over a soft hum an octave down
//   trial_clunk  0.5 s  the wrong bell: a dull thud, a flat clank and a detuned little bell that dies at once
//   trial_tune   0.9 s  the shrine's tune is about to ring: a shimmer of glass rising, two soft pings
//   trial_turn   0.5 s  it is his turn: two pings, E5 then B5
//   trial_plate  0.5 s  a plate turns over: a stone click, a low thud, a ping (played faster for lit, slower for dark)
//   trial_pylon  0.6 s  a pylon is touched: a sine that climbs 600 -> 1800 Hz and a glassy bell on top (played faster for each next)
//   trial_start  0.7 s  a clock starts: a rush of air that rises and two ticks
//   trial_tick   0.12 s one second of the last five
//   trial_fail   0.8 s  it begins again: a falling hum and a breath of air going out
//   trial_wisp   0.6 s  a wisp rises out of its vent: a soft breathy wheep
//   trial_pop    0.35 s a wisp is burnt: a bubble's pop and a few pings of glitter
//   trial_sigh   0.7 s  a wisp gets away: a breath that falls
//   trial_kick   0.35 s the puck is struck: a glassy clack with a thud under it
//   trial_save   0.5 s  the goalie saves it: a heavy stone clunk
//   trial_goal   1.2 s  a goal: an arpeggio of bells, C5 E5 G5 C6, and a shimmer
//   trial_beam   1.0 s  the beam is true: a chord of bells on a rising shimmer
//   trial_seal   0.6 s  a breath on a sealed lantern is turned away: a dull ring of a rune and a hush
//   trial_break  1.4 s  the seal breaks: a rush of glass, a crash of shards and a low thud
//   trial_horn   1.1 s  a wave of the siege: a low horn

import { TAU, decay, ad, smooth, seedOf, removeDC } from './synth.js';
import { finalizeSfx as fin, reverbMono } from './spu.js';
import { layer, lvl, sweep, noiseFilt, thump, ping, bell, tinkles, ticks, vowel, hz } from './sfx-kit.js';

const pk = (x, p = 1) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, x))), p);

export const TRIAL_SFX = {
  trial_bell() {
    const hum = ping(hz('C4'), 1.4, 0.7);
    const strike = noiseFilt(0.05, seedOf('trial_bell'), { mode: 'bp', f0: 2600, q: 0.9, env: (t) => decay(t, 0.01) });
    return fin(reverbMono(layer(1.5, [[bell(hz('C5'), 1.4, 0.75, 1.0, 0.002), 0, 1], [hum, 0, 0.35], [strike, 0, 0.35]]), 'chamber', 0.15, 0.2), { grit: 0.15, fadeOut: 150 });
  },

  trial_clunk() {
    const s = seedOf('trial_clunk');
    const clank = noiseFilt(0.18, s, { mode: 'bp', f0: 700, f1: 500, q: 1.2, env: (t) => decay(t, 0.04) });
    return fin(layer(0.5, [[thump(0.35, 140, 62, 0.05, 0.1), 0, 1], [clank, 0, 0.6], [bell(hz('F#4') * 0.97, 0.4, 0.1, 0.5, 0.003), 0.01, 0.6]]), { grit: 0.35, fadeOut: 60 });
  },

  trial_tune() {
    const s = seedOf('trial_tune');
    const shimmer = noiseFilt(0.9, s, { mode: 'bp', f0: 1200, f1: 4200, q: 2.2, curve: 1.3, env: (t, x) => pk(x, 1.2) * 0.8 });
    return fin(layer(0.9, [[lvl(shimmer, 0.08), 0, 1], [ping(hz('A5'), 0.5, 0.14), 0.45, 0.4], [ping(hz('E6'), 0.5, 0.16), 0.62, 0.35]]), { grit: 0.25, fadeOut: 120 });
  },

  trial_turn() {
    return fin(layer(0.5, [[ping(hz('E5'), 0.35, 0.1, { h2: 0.3 }), 0, 0.9], [ping(hz('B5'), 0.4, 0.13, { h2: 0.3 }), 0.12, 0.9]]), { grit: 0.2, fadeOut: 60 });
  },

  trial_plate() {
    const s = seedOf('trial_plate');
    const click = ticks(0.12, s, 3, 900, 2600, { tMax: 0.05, gain: 0.8, lenHi: 0.01 });
    return fin(layer(0.5, [[click, 0, 0.8], [thump(0.3, 210, 85, 0.04, 0.09), 0, 1], [ping(hz('A4'), 0.3, 0.1, { h2: 0.4 }), 0.02, 0.5]]), { grit: 0.3, fadeOut: 60 });
  },

  trial_pylon() {
    const zap = sweep(0.4, 600, 1800, { wave: 'sine', curve: 0.8, env: (t, x) => ad(t, 0.01, 0.12) * 0.7 });
    return fin(layer(0.6, [[zap, 0, 0.8], [bell(hz('E6'), 0.5, 0.2, 0.8, 0.002), 0.05, 0.7], [thump(0.2, 180, 90, 0.03, 0.06), 0, 0.5]]), { grit: 0.25, fadeOut: 80 });
  },

  trial_start() {
    const s = seedOf('trial_start');
    const rush = noiseFilt(0.6, s, { mode: 'bp', f0: 300, f1: 2200, q: 1.0, curve: 1.2, env: (t, x) => Math.min(1, t / 0.05) * (0.3 + 0.7 * x) * (1 - 0.4 * Math.pow(x, 5)) });
    return fin(layer(0.7, [[lvl(rush, 0.12), 0, 1], [ping(hz('C6'), 0.2, 0.04), 0.5, 0.5], [ping(hz('C6'), 0.2, 0.04), 0.62, 0.7]]), { grit: 0.3, fadeOut: 80 });
  },

  trial_tick() {
    return fin(ping(hz('A6'), 0.12, 0.02), { grit: 0.2, fadeOut: 20 });
  },

  trial_fail() {
    const s = seedOf('trial_fail');
    const hum = sweep(0.8, 440, 110, { wave: 'tri', curve: 0.7, env: (t, x) => ad(t, 0.02, 0.3) * 0.5 });
    const air = noiseFilt(0.7, s, { mode: 'lp', f0: 1500, f1: 200, q: 0.8, env: (t, x) => Math.pow(1 - x, 0.8) * 0.8 });
    return fin(layer(0.8, [[hum, 0, 0.8], [lvl(air, 0.1), 0, 1], [thump(0.4, 110, 45, 0.08, 0.15), 0.05, 0.6]]), { grit: 0.35, fadeOut: 120 });
  },

  trial_wisp() {
    const s = seedOf('trial_wisp');
    const wheep = sweep(0.55, 520, 1500, { wave: 'sine', curve: 1.2, env: (t, x) => pk(x, 0.8) * 0.5, vibHz: 7, vibDepth: 0.03 });
    const air = noiseFilt(0.55, s, { mode: 'bp', f0: 1800, f1: 3200, q: 1.4, env: (t, x) => pk(x, 0.9) });
    return fin(layer(0.6, [[wheep, 0, 0.7], [lvl(air, 0.04), 0, 1]]), { grit: 0.25, fadeOut: 80 });
  },

  trial_pop() {
    const s = seedOf('trial_pop');
    return fin(layer(0.35, [[thump(0.15, 760, 260, 0.01, 0.04), 0, 0.9], [tinkles(0.35, s, 5, 1600, 3600, { tauLo: 0.03, tauHi: 0.07, tMax: 0.25, gain: 0.45 }), 0.02, 0.8]]), { grit: 0.25, fadeOut: 60 });
  },

  trial_sigh() {
    const s = seedOf('trial_sigh');
    const breath = noiseFilt(0.7, s, { mode: 'bp', f0: 1400, f1: 420, q: 1.1, env: (t, x) => pk(x, 0.7) * (1 - 0.5 * x) });
    return fin(lvl(breath, 0.1), { grit: 0.25, fadeOut: 120 });
  },

  trial_kick() {
    const s = seedOf('trial_kick');
    const tick = ticks(0.06, s, 2, 1800, 4200, { tMax: 0.01, gain: 0.9, lenHi: 0.006 });
    return fin(layer(0.35, [[ping(1180, 0.25, 0.05, { h2: 0.6 }), 0, 0.8], [tick, 0, 0.7], [thump(0.15, 320, 120, 0.02, 0.05), 0, 0.8]]), { grit: 0.3, fadeOut: 40 });
  },

  trial_save() {
    const s = seedOf('trial_save');
    return fin(layer(0.5, [[thump(0.4, 150, 55, 0.05, 0.12), 0, 1], [ticks(0.4, s, 8, 600, 2400, { tMax: 0.12, gain: 0.7, lenHi: 0.012 }), 0, 0.6], [ping(hz('G3'), 0.35, 0.1, { h2: 0.4 }), 0.01, 0.4]]), { grit: 0.4, fadeOut: 80 });
  },

  trial_goal() {
    const notes = ['C5', 'E5', 'G5', 'C6'], parts = [];
    notes.forEach((n, i) => parts.push([bell(hz(n), 1.0, 0.5, 1.0, 0.002), i * 0.1 + (i === 3 ? 0.04 : 0), 0.85]));
    const s = seedOf('trial_goal');
    parts.push([tinkles(1.0, s, 12, 2000, 6000, { tauLo: 0.05, tauHi: 0.12, tMax: 0.9, gain: 0.25 }), 0.2, 0.7]);
    return fin(reverbMono(layer(1.2, parts), 'hall', 0.2, 0.25), { grit: 0.2, fadeOut: 200 });
  },

  trial_beam() {
    const rise = sweep(0.9, 400, 1700, { wave: 'sine', curve: 1.4, env: (t, x) => ad(t, 0.05, 0.4) * 0.35 });
    return fin(reverbMono(layer(1.0, [[bell(hz('E5'), 0.9, 0.45, 1, 0.003), 0.05, 0.7], [bell(hz('B5'), 0.9, 0.45, 1, 0.003), 0.12, 0.6], [bell(hz('E6'), 0.9, 0.4, 1, 0.003), 0.2, 0.5], [rise, 0, 0.5]]), 'chamber', 0.15, 0.25), { grit: 0.2, fadeOut: 160 });
  },

  trial_seal() {
    const s = seedOf('trial_seal');
    const hush = noiseFilt(0.4, s, { mode: 'bp', f0: 900, f1: 600, q: 1.0, env: (t) => decay(t, 0.09) });
    return fin(layer(0.6, [[bell(hz('D#4'), 0.55, 0.22, 0.4, 0.003), 0, 0.9], [hush, 0, 0.4], [thump(0.2, 130, 70, 0.03, 0.06), 0, 0.5]]), { grit: 0.3, fadeOut: 80 });
  },

  trial_break() {
    const s = seedOf('trial_break');
    const rush = noiseFilt(1.3, s, { mode: 'bp', f0: 4200, f1: 700, q: 0.9, curve: 0.9, env: (t) => Math.min(1, t / 0.004) * decay(t, 0.28) });
    const shards = tinkles(1.2, s + 1, 26, 1600, 7000, { tauLo: 0.03, tauHi: 0.1, tMax: 1.0, gain: 0.5 });
    return fin(reverbMono(layer(1.4, [[lvl(rush, 0.12), 0, 1], [shards, 0.01, 0.9], [thump(0.8, 120, 38, 0.06, 0.22), 0, 0.9]]), 'hall', 0.25, 0.3), { grit: 0.35, fadeOut: 220 });
  },

  trial_horn() {
    const s = seedOf('trial_horn');
    const horn = vowel(1.0, (t, x) => 110 * (1 + 0.012 * Math.sin(TAU * 5.5 * t)) * (0.97 + 0.06 * smooth(x * 4)), [[330, 4, 1], [720, 6, 0.55], [1250, 7, 0.2]], { src: 'saw', raw: 0.25, breath: 0.03, seed: s, env: (t, x) => ad(t, 0.12, 0.9) * (1 - smooth((x - 0.85) / 0.15)) });
    return fin(removeDC(horn), { grit: 0.3, fadeOut: 150 });
  },
};
