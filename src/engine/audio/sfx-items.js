// Gloaming Vale audio — collectible, breakable and critter/enemy sound effects. Pure DSP.
//
// Gems are glassy bells from the D pentatonic (D E A B, no 3rd, so they never fight the music's
// mode). Value climbs three ways at once: higher root pitch, more notes, longer / richer ring:
//   gem_red     D6                              one tiny tink
//   gem_green   E6 + B6 (45 ms later)           two-note "ti-ting"
//   gem_blue    A5 (soft) A6 E7                 three-note lift
//   gem_gold    B5 (soft) B6 D7 E7 + shimmer    four notes, detuned twin bells
//   gem_purple  D6 A6 B6 D7 E7 chord + shimmer  wide shimmering chord in a small stone room
//
//   gem_burst     pop + air puff + nine scattered pentatonic tinkles
//   butterfly     A5 B5 D6 E6 A6 rising chime with detuned twin bells, sparkle and a bit of room
//   vase_break    clay crack + low thud + shard crunch (12 ticks) + ceramic tinkles
//   chest_open    creaking lid, latch click, then a D5 A5 D6 "ta-da" with a D7 glint
//   snuffer_alert two pulse-wave blips a tritone apart (392 -> 554 Hz) with 30 Hz wobble
//   snuffer_swing swept noise whoosh 500 -> 1700 Hz
//   snuffer_hurt  thwack + thud + 900 -> 1500 Hz squeak
//   snuffer_die   noise poof + triangle wail sliding 720 -> 140 Hz with growing vibrato
//   armor_clang   six inharmonic steel partials (x1 2.32 2.76 3.73 5.11 6.6) + detuned twin + strike noise
//   bunny_squeak  tiny 1.9 -> 2.7 -> 2.4 kHz chirp;  bunny_poof  soft puff + thud + three sparkles

import { SR, TAU, gen, decay, ad, smooth, seedOf, RNG, barVoice } from './synth.js';
import { finalizeSfx as fin, reverbMono } from './spu.js';
import { layer, sweep, noiseFilt, thump, ping, bell, tinkles, ticks, vowel, hz, creak } from './sfx-kit.js';

/** Build a gem sound from [[note, delaySec, gain], ...]. */
function gem(list, o) {
  const { tau = 0.15, bright = 1, dur = 0.4, grit = 0.15, rev = 0, shimmer = 0 } = o;
  const parts = [];
  for (const [nm, t, g] of list) {
    const f = hz(nm);
    parts.push([bell(f, dur, tau, bright), t, g]);
    if (shimmer) parts.push([bell(f * 1.004, dur, tau * 0.9, bright * 0.7), t + 0.004, g * shimmer]);
  }
  let b = layer(dur + (rev ? 0.12 : 0.03), parts);
  if (rev) b = reverbMono(b, 'chamber', rev, 0.35);
  return fin(b, { grit });
}

export const ITEM_SFX = {
  gem_red: () => gem([['D6', 0, 1]], { tau: 0.09, bright: 0.6, dur: 0.25 }),
  gem_green: () => gem([['E6', 0, 1], ['B6', 0.045, 0.75]], { tau: 0.11, bright: 0.8, dur: 0.32 }),
  gem_blue: () => gem([['A5', 0, 0.5], ['A6', 0.02, 1], ['E7', 0.06, 0.65]], { tau: 0.14, bright: 0.9, dur: 0.4 }),
  gem_gold: () => gem([['B5', 0, 0.5], ['B6', 0.02, 1], ['D7', 0.055, 0.8], ['E7', 0.09, 0.7]], { tau: 0.2, bright: 1, dur: 0.55, shimmer: 0.5 }),
  gem_purple: () => gem([['D6', 0, 0.8], ['A6', 0.005, 1], ['B6', 0.03, 0.75], ['D7', 0.055, 0.8], ['E7', 0.085, 0.65]], { tau: 0.42, bright: 1, dur: 0.9, shimmer: 0.6, rev: 0.45 }),

  gem_burst() {
    const s = seedOf('gem_burst');
    const r = new RNG(s);
    const pent = ['D6', 'E6', 'A6', 'B6', 'D7'];
    const parts = [
      [thump(0.08, 420, 130, 0.015, 0.03), 0, 0.9],
      [noiseFilt(0.06, s, { mode: 'lp', f0: 3000, q: 0.7, env: (t) => decay(t, 0.012) }), 0, 0.6],
    ];
    for (let i = 0; i < 9; i++) parts.push([bell(hz(r.pick(pent)), 0.3, 0.08, 0.8), 0.02 + i * 0.045 + r.range(0, 0.02), r.range(0.3, 0.7)]);
    return fin(layer(0.62, parts), { grit: 0.25 });
  },

  butterfly() {
    const names = ['A5', 'B5', 'D6', 'E6', 'A6'];
    const parts = names.map((nm, i) => [bell(hz(nm), 0.7, 0.28, 0.7, 0.006), i * 0.09, 0.55 + i * 0.1]);
    names.forEach((nm, i) => parts.push([bell(hz(nm) * 1.003, 0.6, 0.25, 0.5, 0.008), i * 0.09 + 0.01, 0.25]));
    parts.push([noiseFilt(0.9, seedOf('butterfly'), { mode: 'hp', f0: 3000, f1: 7500, q: 0.8, env: (t, x) => Math.pow(Math.sin(Math.PI * Math.min(1, x * 1.1)), 2) * 0.5 }), 0, 0.15]);
    return fin(reverbMono(layer(0.95, parts), 'chamber', 0.35, 0.3), { grit: 0.15 });
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
      return (Math.sin(TAU * ph) + 0.2 * Math.sin(TAU * ph * 2)) * Math.pow(Math.sin(Math.PI * x), 0.7);
    });
    return fin(sq, { grit: 0.2 });
  },

  bunny_poof() {
    const s = seedOf('bunny_poof');
    const puff = noiseFilt(0.28, s, { mode: 'lp', f0: 2200, f1: 500, env: (t) => ad(t, 0.005, 0.07) });
    const spark = tinkles(0.28, s + 1, 3, 3000, 5000, { tauLo: 0.03, tauHi: 0.06, tMax: 0.15, gain: 0.3 });
    return fin(layer(0.28, [[puff, 0, 1], [thump(0.1, 90, 50, 0.03, 0.04), 0, 0.5], [spark, 0.02, 0.6]]), { grit: 0.3 });
  },
};
