// Gloaming Vale audio — the foes' sounds (foes/, systems/foefx.js). Pure DSP. Made when a realm that has foes is built (assets.js LAZY_GROUPS 'foes'), not at every start-up.
//
//   foe_rumble  0.7 s  a Dustmole wakes under the ground: a brown rumble sinking 160 -> 70 Hz, a thump and a crackle of dirt
//   foe_wind    0.9 s  a Slinger winds up: a band of air that sweeps up 500 -> 1400 Hz in pulses that quicken (a sling whirling)
//   foe_lob     0.35 s the ball leaves: a snap, a short whistle falling 900 -> 520 Hz
//   foe_splat   0.55 s the ball lands: a wet burst of noise falling away, a low thump and drips
//   foe_paw     0.85 s a Ramhog paws: a snort, three scrapes of a hoof, a low grunt
//   foe_rush    0.8 s  it runs: hooves (a thump every 65 ms) under a rising rush of air
//   foe_bonk    0.8 s  it hits a wall: a crack, a thump, a wooden clunk and the little pings of a dazed head
//   foe_crack   0.95 s the ground cracks before a mole bursts: stone creaking up under a crunch of ticks that thickens
//   foe_burst   0.85 s the mole bursts out: a great thump, a crash of earth falling away and clods
//   foe_raise   1.15 s a Lidwarden raises its shield: a hinge creaking, a scrape of metal, a hum that rises as the rim glows and one small bell
//   foe_bash    0.5 s  the shield comes round: a thud, a clang, a whoosh
//   foe_fuse    1.6 s  a Fusepup's fuse is lit: a hiss that climbs 2.5 -> 6.5 kHz over a crackle that thickens, a whistle rising under it
//   foe_boom    1.4 s  the keg: a thump 100 -> 30 Hz, a crash falling away, debris, a hall
//   foe_screech 0.55 s a Dusk Moth rears: a high shriek 2.4 -> 3.7 kHz with a flutter
//   foe_dive    0.5 s  it drops: a whoosh falling 3000 -> 800 Hz and a saw falling under it
//   foe_flap    0.5 s  wings on the ground: four soft beats
//   foe_call    1.25 s a Smokecaller calls: two detuned sung vowels on 98 Hz swelling over a rush of smoke and a soft pop at the end
//   foe_puff    0.5 s  a Snuffer steps out of the smoke: a pop of noise and a thump
//   foe_jeer    0.55 s a Pilferling jeers: four quick cheeky chirps
//   foe_ice     0.75 s ice: a crackle, a thump and two glass pings (B6, E7)

import { TAU, decay, ad, smooth, seedOf, removeDC, filterBuf } from './synth.js';
import { finalizeSfx as fin, reverbMono } from './spu.js';
import { layer, lvl, sweep, noiseFilt, thump, ping, bell, tinkles, ticks, creak, vowel, hz } from './sfx-kit.js';

const pk = (x, p = 1) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, x))), p);

export const FOE_SFX = {
  foe_rumble() {
    const s = seedOf('foe_rumble');
    const rum = noiseFilt(0.7, s, { mode: 'lp', f0: 160, f1: 70, q: 0.8, colour: 'brown', env: (t, x) => pk(x, 0.6) });
    const dirt = ticks(0.7, s + 1, 16, 350, 1500, { tMin: 0.05, tMax: 0.6, gain: 0.6, lenHi: 0.012 });
    const b = layer(0.7, [[lvl(rum, 0.3), 0, 1], [thump(0.5, 72, 40, 0.1, 0.25), 0.03, 0.8], [dirt, 0, 0.5]]);
    return fin(filterBuf(removeDC(b), 'hp', 45), { grit: 0.35, fadeOut: 90 });                          // (a rumble this low leaves a DC offset behind unless it is high-passed)
  },

  foe_wind() {
    const s = seedOf('foe_wind');
    const w = noiseFilt(0.9, s, { mode: 'bp', f0: 500, f1: 1400, q: 1.6, env: (t, x) => (0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(TAU * (5 + 6 * x) * t), 1.5)) * Math.min(1, t / 0.08) * (1 - 0.3 * x) });
    return fin(w, { grit: 0.3, fadeOut: 60 });
  },

  foe_lob() {
    const s = seedOf('foe_lob');
    const snap = noiseFilt(0.05, s, { mode: 'bp', f0: 2400, q: 1.1, env: (t) => decay(t, 0.008) });
    const whistle = sweep(0.3, 900, 520, { wave: 'sine', curve: 0.8, env: (t) => ad(t, 0.004, 0.09) * 0.7 });
    return fin(layer(0.35, [[snap, 0, 1], [whistle, 0.01, 0.6], [thump(0.12, 190, 90, 0.02, 0.04), 0, 0.5]]), { grit: 0.3 });
  },

  foe_splat() {
    const s = seedOf('foe_splat');
    const burst = noiseFilt(0.55, s, { mode: 'lp', f0: 2600, f1: 280, q: 0.8, curve: 0.8, env: (t) => Math.min(1, t / 0.004) * decay(t, 0.12) });
    const drips = tinkles(0.55, s + 1, 5, 500, 1100, { tauLo: 0.02, tauHi: 0.05, tMax: 0.5, gain: 0.35 });
    return fin(layer(0.55, [[burst, 0, 1], [thump(0.3, 110, 50, 0.04, 0.12), 0, 0.9], [drips, 0.05, 0.5]]), { grit: 0.4, fadeOut: 60 });
  },

  foe_paw() {
    const s = seedOf('foe_paw');
    const snort = noiseFilt(0.18, s, { mode: 'bp', f0: 1500, f1: 900, q: 1.0, env: (t) => ad(t, 0.01, 0.06) });
    const scrape = (k) => noiseFilt(0.2, s + k, { mode: 'bp', f0: 700, f1: 1500, q: 1.3, env: (t, x) => pk(x, 0.7) });
    const grunt = vowel(0.35, (t, x) => 92 - 22 * x, [[260, 5, 0.8], [620, 6, 0.4]], { src: 'saw', raw: 0.3, env: (t, x) => pk(x, 0.6), seed: s });
    return fin(layer(0.85, [[snort, 0, 0.9], [scrape(1), 0.2, 0.8], [scrape(2), 0.42, 0.85], [scrape(3), 0.62, 0.9], [grunt, 0.05, 0.6]]), { grit: 0.35, fadeOut: 80 });
  },

  foe_rush() {
    const s = seedOf('foe_rush');
    const air = noiseFilt(0.8, s, { mode: 'bp', f0: 300, f1: 1100, q: 0.9, env: (t, x) => Math.min(1, t / 0.15) * (0.4 + 0.6 * x) * (1 - 0.5 * Math.pow(x, 4)) });
    const parts = [[air, 0, 0.8]];
    for (let k = 0; k < 11; k++) parts.push([thump(0.1, 95, 55, 0.02, 0.05), k * 0.065, 0.55 + 0.35 * (k % 2)]);
    return fin(layer(0.8, parts), { grit: 0.4, fadeOut: 120 });
  },

  foe_bonk() {
    const s = seedOf('foe_bonk');
    const crack = noiseFilt(0.08, s, { mode: 'bp', f0: 1900, q: 0.9, env: (t) => decay(t, 0.015) });
    const clunk = ping(230, 0.5, 0.12, { h2: 0.6 });
    const stars = tinkles(0.6, s + 1, 4, 2200, 3300, { tauLo: 0.06, tauHi: 0.12, tMax: 0.45, gain: 0.35 });
    return fin(reverbMono(layer(0.8, [[crack, 0, 1], [thump(0.35, 130, 38, 0.05, 0.14), 0, 1], [clunk, 0.01, 0.55], [stars, 0.18, 0.5]]), 'chamber', 0.2, 0.25), { grit: 0.35, fadeOut: 100 });
  },

  foe_crack() {
    const s = seedOf('foe_crack');
    const stone = creak(0.95, 90, 240, s, { q: 4, bpF: 420, jitter: 0.25, rate: 36, env: (t, x) => Math.pow(x, 0.8) * (1 - 0.2 * x) });
    const crunch = ticks(0.95, s + 1, 46, 250, 1100, { tMin: 0.04, tMax: 0.9, gain: 0.9, lenHi: 0.014 });
    const low = noiseFilt(0.95, s + 2, { mode: 'lp', f0: 120, f1: 220, q: 0.8, colour: 'brown', env: (t, x) => Math.pow(x, 1.2) });
    return fin(removeDC(layer(0.95, [[lvl(stone, 0.14), 0, 1], [crunch, 0, 0.6], [lvl(low, 0.2), 0, 0.8]])), { grit: 0.4, fadeOut: 50 });
  },

  foe_burst() {
    const s = seedOf('foe_burst');
    const crash = noiseFilt(0.85, s, { mode: 'lp', f0: 2200, f1: 160, q: 0.8, curve: 0.8, env: (t) => Math.min(1, t / 0.004) * decay(t, 0.2) });
    const clods = ticks(0.85, s + 1, 22, 300, 1500, { tMin: 0.05, tMax: 0.8, gain: 0.8, lenHi: 0.02 });
    return fin(reverbMono(layer(0.85, [[thump(0.7, 92, 26, 0.08, 0.3), 0, 1], [thump(0.6, 48, 30, 0.2, 0.25), 0, 0.7], [crash, 0, 0.9], [clods, 0, 0.6]]), 'chamber', 0.2, 0.3), { grit: 0.45, fadeOut: 120, lp: 7000 });
  },

  foe_raise() {
    const s = seedOf('foe_raise');
    const hinge = creak(1.1, 95, 190, s, { q: 5, bpF: 700, jitter: 0.2, rate: 44, env: (t, x) => pk(x, 0.6) });
    const scrape = noiseFilt(0.7, s + 1, { mode: 'bp', f0: 2200, f1: 3400, q: 1.4, env: (t, x) => pk(x, 1.2) * 0.8 });
    const hum = sweep(1.1, 180, 330, { wave: 'tri', curve: 1.4, env: (t, x) => Math.pow(x, 1.6) * 0.5 });
    return fin(layer(1.15, [[lvl(hinge, 0.14), 0, 1], [lvl(scrape, 0.05), 0.2, 1], [hum, 0, 0.5], [bell(hz('E6'), 0.6, 0.3, 0.7, 0.004), 0.55, 0.3]]), { grit: 0.3, fadeOut: 150 });
  },

  foe_bash() {
    const s = seedOf('foe_bash');
    const whoosh = noiseFilt(0.25, s, { mode: 'bp', f0: 500, f1: 1800, q: 1.0, env: (t) => smooth(t / 0.08) * decay(Math.max(0, t - 0.1), 0.06) });
    const clang = ping(520, 0.4, 0.09, { h2: 0.6 });
    return fin(layer(0.5, [[whoosh, 0, 0.7], [thump(0.3, 120, 50, 0.04, 0.1), 0.1, 1], [clang, 0.1, 0.5]]), { grit: 0.35, fadeOut: 60 });
  },

  foe_fuse() {
    const s = seedOf('foe_fuse');
    const hiss = noiseFilt(1.6, s, { mode: 'hp', f0: 2500, f1: 6500, q: 0.8, env: (t, x) => Math.min(1, t / 0.03) * (0.45 + 0.55 * x) });
    const crackle = ticks(1.6, s + 1, 60, 2000, 7000, { tMin: 0, tMax: 1.55, gain: 0.8, lenHi: 0.006 });
    const whistle = sweep(1.6, 1500, 3200, { wave: 'sine', curve: 1.6, env: (t, x) => 0.1 * x });
    return fin(layer(1.6, [[lvl(hiss, 0.15), 0, 1], [crackle, 0, 0.6], [whistle, 0, 0.5]]), { grit: 0.3, fadeOut: 60 });
  },

  foe_boom() {
    const s = seedOf('foe_boom');
    const crash = noiseFilt(1.3, s, { mode: 'lp', f0: 4200, f1: 180, q: 0.8, curve: 0.7, env: (t) => Math.min(1, t / 0.003) * decay(t, 0.28) });
    const debris = ticks(1.3, s + 1, 30, 600, 5000, { tMin: 0.06, tMax: 1.1, gain: 0.8, lenHi: 0.02 });
    return fin(reverbMono(layer(1.4, [[thump(1.1, 100, 28, 0.08, 0.35), 0, 1], [thump(1.0, 52, 30, 0.2, 0.3), 0, 0.8], [crash, 0, 1], [debris, 0, 0.6]]), 'hall', 0.3, 0.35), { grit: 0.45, fadeOut: 220, lp: 7000 });
  },

  foe_screech() {
    const s = seedOf('foe_screech');
    const shriek = vowel(0.55, (t, x) => (2400 + 1300 * Math.pow(x, 0.7)) * (1 + 0.05 * Math.sin(TAU * 38 * t)), [[2500, 7, 0.6], [4200, 8, 0.35]], { src: 'saw', raw: 0.2, breath: 0.2, seed: s, env: (t, x) => Math.min(1, t / 0.03) * pk(x, 0.5) });
    const air = noiseFilt(0.55, s + 1, { mode: 'hp', f0: 4000, q: 0.8, env: (t, x) => pk(x, 0.7) * 0.4 });
    return fin(layer(0.55, [[shriek, 0, 0.8], [air, 0, 0.4]]), { grit: 0.3, lp: 7500, fadeOut: 50 });
  },

  foe_dive() {
    const s = seedOf('foe_dive');
    const w = noiseFilt(0.5, s, { mode: 'bp', f0: 3000, f1: 800, q: 1.1, env: (t, x) => Math.min(1, t / 0.04) * Math.pow(1 - x, 0.5) });
    const saw = sweep(0.5, 1800, 500, { wave: 'saw', curve: 0.9, env: (t, x) => 0.18 * Math.pow(1 - x, 0.8) });
    return fin(layer(0.5, [[w, 0, 0.9], [saw, 0, 0.5]]), { grit: 0.35, fadeOut: 60 });
  },

  foe_flap() {
    const s = seedOf('foe_flap');
    const parts = [];
    for (let k = 0; k < 4; k++) parts.push([noiseFilt(0.12, s + k, { mode: 'lp', f0: 900, f1: 380, q: 0.8, env: (t) => ad(t, 0.012, 0.035) }), k * 0.11, 0.8 - 0.1 * k]);
    return fin(layer(0.5, parts), { grit: 0.3, fadeOut: 60 });
  },

  foe_call() {
    const s = seedOf('foe_call');
    const sing = (f, k) => vowel(1.25, (t, x) => f * (1 + 0.01 * Math.sin(TAU * 5.5 * t + k)), [[320, 6, 0.9], [750, 8, 0.4], [2400, 10, 0.12]], { src: 'saw', raw: 0.2, breath: 0.05, seed: s + k, env: (t, x) => Math.pow(Math.sin(Math.PI * Math.min(1, x * 0.85)), 0.8) * Math.min(1, t / 0.2) });
    const smoke = noiseFilt(1.25, s + 5, { mode: 'lp', f0: 500, f1: 1400, q: 0.8, env: (t, x) => pk(x, 0.9) * 0.9 });
    return fin(reverbMono(layer(1.25, [[sing(98, 0), 0, 0.7], [sing(98.9, 1), 0, 0.5], [sing(147, 2), 0.1, 0.25], [lvl(smoke, 0.12), 0, 1], [thump(0.12, 160, 70, 0.02, 0.04), 1.05, 0.6]]), 'chamber', 0.25, 0.3), { grit: 0.3, fadeOut: 120 });
  },

  foe_puff() {
    const s = seedOf('foe_puff');
    const pop = noiseFilt(0.4, s, { mode: 'bp', f0: 600, f1: 1800, q: 0.9, env: (t) => ad(t, 0.004, 0.08) });
    return fin(layer(0.5, [[pop, 0, 1], [thump(0.2, 150, 60, 0.03, 0.08), 0, 0.8]]), { grit: 0.35, fadeOut: 60 });
  },

  foe_jeer() {
    const parts = [];
    const f = [900, 1250, 1000, 1400];
    f.forEach((fr, k) => parts.push([sweep(0.09, fr, fr * 1.25, { wave: 'pulse', pw: 0.3, vibHz: 28, vibDepth: 0.03, env: (t) => ad(t, 0.004, 0.03) }), k * 0.115, 0.9]));
    return fin(layer(0.55, parts), { grit: 0.35, lp: 3600 });
  },

  foe_ice() {
    const s = seedOf('foe_ice');
    const crackle = ticks(0.75, s, 24, 1800, 6500, { tMin: 0, tMax: 0.5, gain: 0.8, lenHi: 0.008 });
    return fin(layer(0.75, [[crackle, 0, 0.8], [thump(0.2, 140, 60, 0.03, 0.06), 0, 0.6], [bell(hz('B6'), 0.6, 0.22, 0.8, 0.002), 0.05, 0.4], [bell(hz('E7'), 0.5, 0.18, 0.7, 0.002), 0.12, 0.3]]), { grit: 0.2, fadeOut: 80 });
  },
};
