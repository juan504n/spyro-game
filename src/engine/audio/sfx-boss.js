// Gloaming Vale audio — the Guardian's sounds (Dawnhaven's last place, systems/boss.js). Pure DSP.
//
//   guardian_roar     1.9 s  he wakes: a growl on a 62 -> 48 Hz saw through two formants (a throat of stone) with a grinding creak, a rumble and a thump at the start, a big stone room
//   guardian_whoosh   0.6 s  a fist rises: a band of air sweeping up 260 -> 1700 Hz over a falling-then-rising body tone
//   guardian_warn     0.3 s  a rune locks: two quick glass pings (A5, E6) and a tick
//   guardian_slam     1.1 s  a fist lands: a 90 -> 24 Hz thump, a crash of low-passed noise falling away, a sub boom and the scatter of stone
//   guardian_crack    0.9 s  a fist breaks: a hard crack, a split (220 -> 60 Hz), stone shards tinkling and a rune chime falling away
//   guardian_charge   1.2 s  the visor charges a bolt: a saw rising 180 -> 920 Hz under a rising band of air and a shimmer that thickens
//   guardian_bolt     0.45 s a bolt leaves: a zap (a sine falling 1400 -> 220 Hz over a burst of noise) and a crackle
//   guardian_burst    0.35 s a bolt bursts: a pop, a short crackle and one glass ping
//   guardian_gloom    0.75 s a circle of gloom bursts: a dark boom, a hollow detuned tone and noise falling away
//   guardian_stoop    1.9 s  he stoops: stone grinding under a low brown rumble, a low bell and a thump as the crown comes to rest
//   guardian_catch    0.3 s  the flame takes the lantern: a rising soft ping with a shimmer
//   guardian_lit      2.8 s  a lantern of his crown is lit: a fire whoomp, a warm choir (three vowels on D3 A3 F#4) swelling, a D major bell chord and sparkles
//   guardian_freed    5.0 s  the last lantern: a long sunrise: a choir chord rising D3 -> D4 with the bells of five realms, sparkles and a gong; the ending's sound

import { SR, TAU, decay, smooth, seedOf } from './synth.js';
import { finalizeSfx as fin, reverbMono } from './spu.js';
import { layer, lvl, sweep, noiseFilt, thump, ping, bell, tinkles, ticks, creak, vowel, hz } from './sfx-kit.js';

const pkSin = (x, p = 1) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, x))), p);

export const BOSS_SFX = {
  guardian_roar() {
    const s = seedOf('guardian_roar');
    const throat = vowel(1.9, (t, x) => (62 - 14 * Math.pow(x, 0.7)) * (1 + 0.04 * Math.sin(TAU * 7 * t)), [[(x) => 260 + 140 * Math.sin(Math.PI * x), 4, 1.0], [(x) => 640 - 180 * x, 5, 0.55], [1400, 6, 0.2]], {
      src: 'saw', breath: 0.08, raw: 0.5, seed: s, env: (t, x) => Math.min(1, t / 0.16) * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + x * 0.88)), 0.6) * (0.85 + 0.15 * Math.sin(TAU * 11 * t)),
    });
    const grind = creak(1.7, 70, 120, s + 1, { q: 3, bpF: 360, jitter: 0.25, rate: 40, env: (t, x) => pkSin(x, 0.8) });
    const rumble = noiseFilt(1.9, s + 2, { mode: 'lp', f0: 180, f1: 60, q: 0.7, colour: 'brown', env: (t, x) => pkSin(x, 0.5) });
    const hit = thump(0.5, 110, 30, 0.07, 0.18);
    const b = layer(2.0, [[lvl(throat, 0.3), 0, 1], [lvl(grind, 0.1), 0.05, 1], [lvl(rumble, 0.25), 0, 1], [hit, 0, 0.8]]);
    return fin(reverbMono(b, 'hall', 0.45, 0.5), { grit: 0.35, fadeOut: 300, lp: 5500 });
  },

  guardian_whoosh() {
    const s = seedOf('guardian_whoosh');
    const air = noiseFilt(0.6, s, { mode: 'bp', f0: 260, f1: 1700, q: 1.1, curve: 1.4, env: (t, x) => pkSin(x, 1.2) });
    const body = sweep(0.6, 150, 230, { wave: 'tri', env: (t, x) => pkSin(x, 1.5) });
    return fin(layer(0.6, [[lvl(air, 0.3), 0, 1], [body, 0, 0.5]]), { grit: 0.25, fadeOut: 80 });
  },

  guardian_warn() {
    const s = seedOf('guardian_warn');
    const tick = noiseFilt(0.04, s, { mode: 'bp', f0: 3200, q: 1.2, env: (t) => decay(t, 0.008) });
    const b = layer(0.3, [[ping(hz('A5'), 0.26, 0.07, { h2: 0.3 }), 0, 0.9], [ping(hz('E6'), 0.22, 0.06, { h2: 0.3 }), 0.07, 0.8], [tick, 0, 1.2]]);
    return fin(b, { grit: 0.2 });
  },

  guardian_slam() {
    const s = seedOf('guardian_slam');
    const th = thump(1.1, 90, 24, 0.09, 0.32);
    const sub = thump(1.0, 46, 30, 0.2, 0.28);
    const crash = noiseFilt(0.9, s, { mode: 'lp', f0: 2400, f1: 180, q: 0.8, curve: 0.8, env: (t) => Math.min(1, t / 0.004) * decay(t, 0.2) });
    const debris = ticks(0.9, s + 1, 26, 700, 4200, { tMin: 0.05, tMax: 0.8, gain: 0.7, lenHi: 0.02 });
    const b = layer(1.1, [[th, 0, 1], [sub, 0, 0.8], [lvl(crash, 0.4), 0, 1], [debris, 0, 0.6]]);
    return fin(reverbMono(b, 'chamber', 0.25, 0.3), { grit: 0.45, fadeOut: 200, lp: 7000 });
  },

  guardian_crack() {
    const s = seedOf('guardian_crack');
    const crack = noiseFilt(0.12, s, { mode: 'hp', f0: 2500, q: 0.8, env: (t) => decay(t, 0.015) });
    const split = thump(0.35, 220, 60, 0.03, 0.1);
    const shards = tinkles(0.8, s + 1, 16, 1800, 6500, { tauLo: 0.03, tauHi: 0.1, tMax: 0.45, gain: 0.6, decayGain: 0.4 });
    const chime = bell(hz('E5'), 0.85, 0.3, 0.9);
    const b = layer(0.9, [[crack, 0, 2.4], [split, 0, 1], [shards, 0.03, 0.8], [chime, 0.05, 0.4], [bell(hz('A4'), 0.8, 0.4, 0.8), 0.18, 0.3]]);
    return fin(reverbMono(b, 'chamber', 0.3, 0.3), { grit: 0.35, fadeOut: 150 });
  },

  guardian_charge() {
    const s = seedOf('guardian_charge');
    const rise = sweep(1.2, 180, 920, { wave: 'saw', curve: 1.6, env: (t, x) => 0.1 + 0.9 * smooth(x) });
    const air = noiseFilt(1.2, s, { mode: 'bp', f0: 600, f1: 4200, q: 1.3, curve: 1.3, env: (t, x) => 0.15 + 0.85 * x });
    const shim = tinkles(1.2, s + 1, 26, 2400, 7000, { tauLo: 0.05, tauHi: 0.14, tMax: 1.1, gain: 0.3, decayGain: -0.6 });
    const body = sweep(1.2, 90, 180, { wave: 'sine', env: (t, x) => 0.3 + 0.7 * x });
    const b = layer(1.25, [[lvl(rise, 0.18), 0, 1], [lvl(air, 0.1), 0, 1], [shim, 0, 0.7], [body, 0, 0.4]]);
    return fin(b, { grit: 0.3, lp: 7500, fadeOut: 60 });
  },

  guardian_bolt() {
    const s = seedOf('guardian_bolt');
    const zap = sweep(0.45, 1400, 220, { wave: 'sine', curve: 0.6, env: (t) => decay(t, 0.12) });
    const burst = noiseFilt(0.35, s, { mode: 'bp', f0: 1800, f1: 400, q: 1.0, env: (t) => decay(t, 0.09) });
    const crackle = ticks(0.4, s + 1, 14, 1500, 6000, { tMax: 0.3, gain: 0.8 });
    return fin(layer(0.45, [[zap, 0, 0.9], [lvl(burst, 0.25), 0, 1], [crackle, 0, 0.5]]), { grit: 0.35, fadeOut: 60 });
  },

  guardian_burst() {
    const s = seedOf('guardian_burst');
    const pop = thump(0.2, 320, 80, 0.015, 0.05);
    const crackle = ticks(0.3, s, 10, 1800, 7000, { tMax: 0.22, gain: 0.9 });
    const b = layer(0.35, [[pop, 0, 0.9], [crackle, 0, 0.7], [ping(hz('B5'), 0.28, 0.05), 0.02, 0.45], [noiseFilt(0.1, s + 1, { mode: 'hp', f0: 2400, env: (t) => decay(t, 0.02) }), 0, 1.4]]);
    return fin(b, { grit: 0.3, fadeOut: 60 });
  },

  guardian_gloom() {
    const s = seedOf('guardian_gloom');
    const boom = thump(0.75, 70, 34, 0.1, 0.25);
    const fall = noiseFilt(0.7, s, { mode: 'lp', f0: 900, f1: 120, q: 1.0, env: (t) => Math.min(1, t / 0.01) * decay(t, 0.22) });
    const hollow = [98, 103].map((f) => [sweep(0.7, f, f * 0.8, { wave: 'tri', env: (t) => Math.min(1, t / 0.03) * decay(t, 0.25) }), 0, 0.35]);
    return fin(reverbMono(layer(0.75, [[boom, 0, 1], [lvl(fall, 0.3), 0, 1], ...hollow]), 'chamber', 0.3, 0.3), { grit: 0.35, fadeOut: 120 });
  },

  guardian_stoop() {
    const s = seedOf('guardian_stoop');
    const grind = creak(1.7, 55, 90, s, { q: 3, bpF: 280, jitter: 0.3, rate: 30, env: (t, x) => pkSin(x, 0.7) });
    const rumble = noiseFilt(1.9, s + 1, { mode: 'lp', f0: 140, f1: 70, colour: 'brown', env: (t, x) => pkSin(x, 0.6) });
    const lowBell = bell(hz('D3'), 1.8, 0.9, 0.7);
    const settle = thump(0.5, 80, 30, 0.06, 0.15);
    const b = layer(1.9, [[lvl(grind, 0.12), 0, 1], [lvl(rumble, 0.25), 0, 1], [lowBell, 0.05, 0.35], [settle, 1.45, 0.9]]);
    return fin(reverbMono(b, 'chamber', 0.3, 0.4), { grit: 0.3, fadeOut: 300, lp: 6000 });
  },

  guardian_catch() {
    const s = seedOf('guardian_catch');
    const rise = sweep(0.3, hz('A5'), hz('E6'), { wave: 'sine', env: (t) => Math.min(1, t / 0.01) * decay(t, 0.1) });
    const shim = tinkles(0.3, s, 6, 3000, 7500, { tauLo: 0.03, tauHi: 0.08, tMax: 0.2, gain: 0.35 });
    return fin(layer(0.3, [[rise, 0, 0.8], [shim, 0, 0.6]]), { grit: 0.2 });
  },

  guardian_lit() {
    const s = seedOf('guardian_lit');
    const whoomp = noiseFilt(0.9, s, { mode: 'lp', f0: 150, f1: 2200, q: 0.8, curve: 0.7, env: (t) => smooth(t / 0.06) * Math.exp(-Math.max(0, t - 0.08) / 0.3) });
    const boom = thump(0.8, 70, 36, 0.1, 0.22);
    const choir = [['D3', 0], ['A3', 0.1], ['F#4', 0.2]].map(([nm, t], i) => [vowel(2.3, () => hz(nm) * (1 + 0.004 * Math.sin(TAU * 5.2 * i)), [[650 + i * 60, 7, 0.9], [1080, 9, 0.5], [2400, 12, 0.14]], {
      src: 'saw', breath: 0.03, raw: 0.1, seed: s + 3 + i, env: (tt, x) => smooth(tt / 0.7) * Math.pow(Math.max(0, 1 - x), 0.9),
    }), t, 0.45]);
    const chord = [['D5', 0.15], ['F#5', 0.2], ['A5', 0.25], ['D6', 0.3], ['A6', 0.36]].map(([nm, t], i) => [bell(hz(nm), 1.5, 0.7, 0.8, 0.003), t, 0.5 - i * 0.05]);
    const spark = tinkles(2.0, s + 7, 22, 2600, 7800, { tauLo: 0.08, tauHi: 0.3, tMax: 1.5, gain: 0.3, decayGain: 0.5 });
    const b = layer(2.6, [[lvl(whoomp, 0.3), 0, 1], [boom, 0, 0.9], ...choir, ...chord, [spark, 0.3, 0.5]]);
    return fin(reverbMono(b, 'hall', 0.4, 0.2), { grit: 0.2, fadeOut: 400 });
  },

  guardian_freed() {
    const s = seedOf('guardian_freed');
    const notes = [['D3', 0], ['A3', 0.15], ['D4', 0.3], ['F#4', 0.5], ['A4', 0.7]];
    const choir = notes.map(([nm, t], i) => [vowel(4.6, (tt, x) => hz(nm) * (1 + 0.003 * Math.sin(TAU * (4.6 + i * 0.3) * tt)) * (1 + 0.5 * x * (i < 2 ? 0 : 0)), [[600 + i * 90, 7, 0.9], [1100 + i * 40, 9, 0.5], [2500, 12, 0.14]], {
      src: 'saw', breath: 0.025, raw: 0.12, seed: s + 3 + i, env: (tt, x) => smooth(tt / 1.6) * Math.pow(Math.max(0, 1 - x), 0.7),
    }), t, 0.42]);
    const arp = ['D5', 'F#5', 'A5', 'D6', 'F#6', 'A6', 'D7'].map((nm, i) => [bell(hz(nm), 2.4, 1.1, 0.9, 0.003), 0.4 + i * 0.28, 0.42 - i * 0.03]);
    const gong = [bell(hz('D2'), 4.2, 2.4, 0.5, 0.01), 0, 0.5];
    const air = noiseFilt(4.6, s, { mode: 'bp', f0: 500, f1: 3200, q: 0.9, curve: 1.2, env: (t, x) => pkSin(x, 1.4) });
    const spark = tinkles(4.0, s + 9, 46, 2600, 8200, { tauLo: 0.1, tauHi: 0.4, tMax: 3.4, gain: 0.3, decayGain: 0.6 });
    const b = layer(5.0, [...choir, ...arp, gong, [lvl(air, 0.06), 0, 1], [spark, 0.6, 0.6], [thump(1.2, 62, 34, 0.1, 0.4), 0, 0.7]]);
    return fin(reverbMono(b, 'hall', 0.45, 0.4), { grit: 0.15, fadeOut: 900 });
  },
};

void SR;
