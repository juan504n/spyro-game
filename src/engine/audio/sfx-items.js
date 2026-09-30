// Gloaming Vale audio — collectible, breakable and critter/enemy sound effects. Pure DSP.
//
// The gem pickups (gem_red .. gem_purple) and gem_burst live in sfx-gems.js: bright stereo 48 kHz chimes
// with a glitter tail, rendered cleaner than everything else here (which is deliberately 22 kHz and grainy).
//
//   butterfly     A5 B5 D6 E6 A6 rising chime with detuned twin bells, sparkle and a bit of room
//   butterfly_blue  the rare blue butterfly: a fuller run A5 .. E7 with a long A6 + E7 ring and a shimmer of glitter
//   vase_break    clay crack + low thud + shard crunch (12 ticks) + ceramic tinkles
//   chest_open    creaking lid, latch click, then a D5 A5 D6 "ta-da" with a D7 glint
//   snuffer_alert two pulse-wave blips a tritone apart (392 -> 554 Hz) with 30 Hz wobble
//   snuffer_swing swept noise whoosh 500 -> 1700 Hz
//   snuffer_hurt  thwack + thud + 900 -> 1500 Hz squeak
//   snuffer_die   noise poof + triangle wail sliding 720 -> 140 Hz with growing vibrato
//   armor_clang   six inharmonic steel partials (x1 2.32 2.76 3.73 5.11 6.6) + detuned twin + strike noise
//   bunny_squeak  tiny 1.9 -> 2.7 -> 2.4 kHz chirp;  bunny_poof  soft puff + thud + three sparkles

import { SR, TAU, gen, decay, ad, smooth, seedOf, barVoice } from './synth.js';
import { finalizeSfx as fin, reverbMono } from './spu.js';
import { layer, sweep, noiseFilt, thump, ping, bell, tinkles, ticks, vowel, hz, creak } from './sfx-kit.js';
import { GEM_SFX } from './sfx-gems.js';

export const ITEM_SFX = {
  ...GEM_SFX,

  butterfly() {
    const names = ['A5', 'B5', 'D6', 'E6', 'A6'];
    const parts = names.map((nm, i) => [bell(hz(nm), 0.7, 0.28, 0.7, 0.006), i * 0.09, 0.55 + i * 0.1]);
    names.forEach((nm, i) => parts.push([bell(hz(nm) * 1.003, 0.6, 0.25, 0.5, 0.008), i * 0.09 + 0.01, 0.25]));
    parts.push([noiseFilt(0.9, seedOf('butterfly'), { mode: 'hp', f0: 3000, f1: 7500, q: 0.8, env: (t, x) => Math.pow(Math.sin(Math.PI * Math.min(1, x * 1.1)), 2) * 0.5 }), 0, 0.15]);
    return fin(reverbMono(layer(0.95, parts), 'chamber', 0.35, 0.3), { grit: 0.15 });
  },

  // The rare blue butterfly (every tenth bunny) is eaten: a longer, fuller version of the butterfly chime. The same pentatonic run two notes further (A5 B5 D6 E6 A6 B6 D7 E7), each bell with
  // a detuned twin, then a last long ring of A6 + E7 over a shimmer of glitter and a breath of air, so it reads as "something special just happened to Sparx".
  butterfly_blue() {
    const names = ['A5', 'B5', 'D6', 'E6', 'A6', 'B6', 'D7', 'E7'];
    const parts = names.map((nm, i) => [bell(hz(nm), 0.95, 0.4, 0.8, 0.006), i * 0.075, 0.52 + i * 0.06]);
    names.forEach((nm, i) => parts.push([bell(hz(nm) * 1.004, 0.85, 0.36, 0.55, 0.008), i * 0.075 + 0.012, 0.22]));
    parts.push([bell(hz('A6'), 1.3, 0.85, 0.5, 0.01), 0.6, 0.34], [bell(hz('E7'), 1.3, 0.8, 0.4, 0.01), 0.63, 0.24]);
    parts.push([tinkles(1.2, seedOf('butterfly_blue'), 14, 3200, 8500, { tauLo: 0.06, tauHi: 0.16, tMax: 0.9, gain: 0.3 }), 0.1, 1]);
    parts.push([noiseFilt(0.7, seedOf('butterfly_blue') + 1, { mode: 'hp', f0: 3500, f1: 8500, q: 0.8, env: (t, x) => Math.pow(Math.sin(Math.PI * Math.min(1, x * 1.05)), 2) * 0.4 }), 0.05, 0.5]);
    return fin(reverbMono(layer(1.9, parts), 'chamber', 0.45, 0.35), { grit: 0.12 });
  },

  vase_break() {
    const s = seedOf('vase_break');
    const crack = noiseFilt(0.06, s, { mode: 'bp', f0: 2200, q: 0.9, env: (t) => decay(t, 0.01) });
    const th = thump(0.12, 210, 100, 0.03, 0.04);
    const crunch = ticks(0.3, s + 1, 12, 1500, 5000, { lenLo: 0.006, lenHi: 0.016, tMin: 0.01, tMax: 0.25, gain: 0.8, q: 1.2 });
    const tink = tinkles(0.65, s + 2, 7, 1800, 4500, { tauLo: 0.05, tauHi: 0.12, tMax: 0.4, gain: 0.35 });
    const knock = layer(0.1, [[ping(720, 0.1, 0.014, { h2: 0.5, h2r: 1.9 }), 0, 1], [ping(1180, 0.08, 0.01), 0.004, 0.6]]);
    return fin(layer(0.65, [[crack, 0, 1], [th, 0, 0.6], [knock, 0, 1.6], [crunch, 0, 0.8], [tink, 0.03, 1]]), { grit: 0.4 });
  },

  chest_open() {
    const s = seedOf('chest_open');
    const lid = creak(0.42, 95, 150, s);
    const latch = ticks(0.03, s + 1, 2, 2500, 4000, { gain: 1, tMax: 0.005 });
    const tada = ['D5', 'A5', 'D6'].map((nm, i) => [bell(hz(nm), 0.6, 0.3, 1), 0.46 + i * 0.07, 0.8]);
    return fin(layer(1.1, [[lid, 0, 0.8], [latch, 0.43, 0.7], ...tada, [bell(hz('D7'), 0.5, 0.25, 0.8), 0.6, 0.3]]), { grit: 0.25 });
  },

  snuffer_alert() {
    const blip = (f, d) => sweep(d, f, f * 0.97, { wave: 'pulse', pw: 0.25, vibHz: 30, vibDepth: 0.03, env: (t) => ad(t, 0.004, d * 0.4) });
    return fin(layer(0.27, [[blip(392, 0.1), 0, 0.9], [blip(554, 0.13), 0.11, 1.0]]), { lp: 3200, grit: 0.35 });
  },

  snuffer_swing() {
    const w = noiseFilt(0.3, seedOf('snuffer_swing'), {
      mode: 'bp', f0: 500, f1: 1700, q: 1.0, curve: 0.9, env: (t) => smooth(t / 0.09) * Math.exp(-Math.max(0, t - 0.1) / 0.09),
    });
    return fin(w, { grit: 0.3 });
  },

  snuffer_hurt() {
    const s = seedOf('snuffer_hurt');
    const thwack = noiseFilt(0.06, s, { mode: 'lp', f0: 1800, q: 0.7, env: (t) => decay(t, 0.012) });
    const sq = sweep(0.2, 900, 1500, { curve: 0.8, vibHz: 40, vibDepth: 0.04, env: (t) => ad(t, 0.006, 0.09) });
    return fin(layer(0.32, [[thwack, 0, 1], [thump(0.1, 180, 90, 0.02, 0.04), 0, 0.7], [sq, 0.03, 0.5]]), { grit: 0.35 });
  },

  snuffer_die() {
    const poof = noiseFilt(0.3, seedOf('snuffer_die'), { mode: 'lp', f0: 1400, f1: 300, env: (t) => ad(t, 0.004, 0.08) });
    const wail = vowel(0.7, (t, x) => 720 * Math.pow(140 / 720, Math.pow(x, 1.2)) * (1 + 0.02 * (1 + x * 2) * Math.sin(TAU * 8 * t)),
      [[(x) => 700 - 300 * x, 5, 0.7], [(x) => 1300 - 500 * x, 7, 0.3]], {
        src: 'tri', raw: 0.5, env: (t, x) => Math.min(1, t / 0.01) * Math.pow(1 - x, 0.9),
      });
    return fin(layer(0.85, [[poof, 0, 0.9], [wail, 0.05, 0.9]]), { grit: 0.3 });
  },

  armor_clang() {
    const p = [[1, 0.9, 0.35], [2.32, 0.9, 0.22], [2.76, 0.8, 0.28], [3.73, 0.8, 0.12], [5.11, 0.7, 0.07], [6.6, 0.5, 0.04]];
    const a = barVoice(460, 0.7, p, { attack: 0.0008 });
    const b = barVoice(460 * 1.006, 0.7, p, { attack: 0.0008 });
    const tr = noiseFilt(0.04, seedOf('armor_clang'), { mode: 'hp', f0: 1500, q: 0.8, env: (t) => decay(t, 0.006) });
    return fin(layer(0.7, [[a, 0, 0.6], [b, 0, 0.4], [tr, 0, 0.6]]), { grit: 0.3 });
  },

  bunny_squeak() {
    let ph = 0;
    const sq = gen(0.13, (t) => {
      const x = t / 0.13;
      ph += (2000 + 700 * Math.sin(Math.PI * x) - 300 * x) / SR;
      return (Math.sin(TAU * ph) + 0.2 * Math.sin(TAU * ph * 2)) * Math.pow(Math.sin(Math.PI * x), 1.6);
    });
    return fin(sq, { grit: 0.2, peakDb: -3.5 }); // a pure sine burst is dense: keep it a little under the others
  },

  bunny_poof() {
    const s = seedOf('bunny_poof');
    const puff = noiseFilt(0.28, s, { mode: 'lp', f0: 2200, f1: 500, env: (t) => ad(t, 0.005, 0.07) });
    const spark = tinkles(0.28, s + 1, 3, 3000, 5000, { tauLo: 0.03, tauHi: 0.06, tMax: 0.15, gain: 0.3 });
    return fin(layer(0.28, [[puff, 0, 1], [thump(0.1, 90, 50, 0.03, 0.04), 0, 0.5], [spark, 0.02, 0.6]]), { grit: 0.3 });
  },
};
