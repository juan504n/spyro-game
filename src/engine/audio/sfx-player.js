// Gloaming Vale audio — player sound effects (Spyro-style dragon). Pure DSP, one function per sound.
//
// Every function returns a mono Float32Array at SR = 22050 that is already finished: DC-free,
// 9.5 kHz high-cut, a touch of 4-bit ADPCM grit, 2 ms fades, peak about -2 dBFS. Loops (glide_loop -6 dBFS,
// flame_loop -4, charge_loop -5) come from loopNoise()/loopFinish() and are seamless by construction.
//
//   jump          triangle + octave sine chirp 330 -> 980 Hz, tiny air puff
//   land          soft sine thump (120 -> 55 Hz) + grass rustle + a second little settle
//   flap          two-lobed low-passed noise (a wing beat) + 85 Hz body
//   glide_start   band-passed noise whoosh sweeping 350 -> 2400 Hz
//   glide_loop    LOOP 1.5 s pink wind band, gusting (1 cycle cutoff, 2 cycles level)
//   flame         fire whoosh: swept noise + low roar + crackle ticks
//   flame_loop    LOOP 1.2 s fire hiss: high-passed flickering noise + roar + crackle
//   charge_start  saw growl 78 -> 153 Hz through formants with 32 Hz tremolo + dash whoosh
//   charge_loop   LOOP 0.8 s: 12 footfalls (gallop) over a low rumble
//   charge_hit    170 -> 45 Hz thump + noise crack + click
//   footstep_a/b/c  soft grass pats (three pitches/seeds);  footstep_stone  tick + tock
//   hurt          "oof": formant-filtered saw gliding 440 -> 190 Hz
//   sparx_lost    shattering glass: 26 random pings (3-8.5 kHz) + falling A6 E6 B5 bells
//   die           three sad "wah" notes A4 F4 D4, then D4 wailing down an octave
//   splash        swept noise wash + rising bubble bloops + thump
//   respawn       8 bells climbing D pentatonic (D5 -> B6) + rising noise sparkle + glide
//   bounce        cartoon spring: sine with wobbling pitch (570 -> 190 Hz) and 2nd harmonic
//   checkpoint    two soft bells A5 -> E6

import { SR, TAU, gen, ad, decay, smooth, seedOf, RNG } from './synth.js';
import { finalizeSfx as fin } from './spu.js';
import { layer, sweep, noiseFilt, thump, ping, bell, tinkles, ticks, vowel, loopNoise, loopLayer, loopFinish, hz } from './sfx-kit.js';

const bump = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));

function footstep(name, fc, fth) {
  const s = seedOf(name);
  const dur = 0.12;
  const pat = noiseFilt(dur, s, { mode: 'lp', f0: fc, q: 0.7, env: (t) => ad(t, 0.002, 0.018) });
  const th = thump(dur, fth * 1.2, fth, 0.02, 0.02);
  const rus = noiseFilt(dur, s + 1, { mode: 'bp', f0: 3000, q: 0.8, env: (t) => ad(t, 0.004, 0.02) });
  return fin(layer(dur, [[pat, 0, 1.6], [th, 0, 0.35], [rus, 0, 0.3]]), { grit: 0.35 });
}

/** One mellow "wah" note for the death phrase. */
function wah(f, d) {
  return vowel(d + 0.05, (t) => f * (1 + 0.015 * Math.sin(TAU * 5.5 * t)), [[500, 5, 0.8], [1100, 7, 0.35]], {
    src: 'saw', raw: 0.3, env: (t) => Math.min(1, t / 0.008) * Math.exp(-t / (d * 0.7)),
  });
}

export const PLAYER_SFX = {
  jump() {
    const a = sweep(0.2, 330, 980, { wave: 'tri', curve: 0.7, env: (t) => ad(t, 0.004, 0.09) });
    const b = sweep(0.2, 660, 1960, { wave: 'sine', curve: 0.7, env: (t) => ad(t, 0.004, 0.06) });
    const p = noiseFilt(0.08, seedOf('jump'), { mode: 'bp', f0: 1200, f1: 2400, q: 1, env: (t) => decay(t, 0.03) });
    return fin(layer(0.2, [[a, 0, 1], [b, 0, 0.35], [p, 0, 0.12]]), { grit: 0.3 });
  },

  land() {
    const th = thump(0.18, 120, 55, 0.03, 0.06);
    const rus = noiseFilt(0.16, seedOf('land'), { mode: 'bp', f0: 2500, f1: 1400, q: 0.8, env: (t) => ad(t, 0.003, 0.05) });
    const th2 = thump(0.1, 90, 50, 0.02, 0.03);
    return fin(layer(0.2, [[th, 0, 0.7], [rus, 0.005, 2.2], [th2, 0.045, 0.25]]), { grit: 0.4 });
  },

  flap() {
    const w = noiseFilt(0.25, seedOf('flap'), { mode: 'lp', f0: 800, f1: 1900, q: 0.7, env: (t) => bump(t, 0.05, 0.035) + 0.75 * bump(t, 0.135, 0.04) });
    const body = gen(0.25, (t) => Math.sin(TAU * 85 * t) * (bump(t, 0.05, 0.03) + 0.7 * bump(t, 0.135, 0.03)));
    return fin(layer(0.25, [[w, 0, 1], [body, 0, 0.3]]), { grit: 0.35 });
  },

  glide_start() {
    const w = noiseFilt(0.5, seedOf('glide_start'), {
      mode: 'bp', f0: 350, f1: 2400, q: 1.2, curve: 1.3,
      env: (t) => smooth(t / 0.12) * (t < 0.18 ? 1 : Math.exp(-(t - 0.18) / 0.16)),
    });
    return fin(w, { grit: 0.25 });
  },

  glide_loop() {
    const b = loopNoise(1.5, seedOf('glide_loop'), {
      colour: 'pink', mode: 'bp', f0: 550, fMod: 400, q: 0.7, cut: [[1, 1, 0]], amp: [[2, 1, 0.25]], floor: 0.6, lp2: 3000, hp2: 120,
    });
    return loopFinish(b, -6, 0.15);
  },

  flame() {
    const s = seedOf('flame');
    const envF = (t) => smooth(t / 0.04) * (t < 0.3 ? 1 : Math.exp(-(t - 0.3) / 0.1));
    const body = noiseFilt(0.55, s, { mode: 'bp', f0: 500, f1: 2600, q: 0.7, curve: 0.8, env: envF });
    const roar = noiseFilt(0.55, s + 1, { mode: 'lp', f0: 380, q: 0.8, env: envF });
    const crack = ticks(0.55, s + 2, 14, 1500, 5000, { tMax: 0.4, gain: 0.6 });
    return fin(layer(0.55, [[body, 0, 0.8], [roar, 0, 0.8], [crack, 0, 0.5]]), { grit: 0.4 });
  },

  flame_loop() {
    const s = seedOf('flame_loop');
    const hiss = loopNoise(1.2, s, { mode: 'hp', f0: 2200, fMod: 2200, q: 0.8, cut: [[3, 1, 0]], amp: [[5, 0.6, 0], [11, 0.4, 0.3]], floor: 0.35, lp2: 7000 });
    const roar = loopNoise(1.2, s + 1, { mode: 'lp', f0: 320, q: 0.8, amp: [[4, 1, 0.1]], floor: 0.5 });
    const base = layer(1.2, [[hiss, 0, 0.7], [roar, 0, 1.0]]);
    const cr = ticks(1.2, s + 2, 10, 1500, 5500, { gain: 0.5, tMax: 1.17 });
    for (let i = 0; i < base.length; i++) base[i] += cr[i] * 0.5;
    return loopFinish(base, -4, 0.2);
  },

  charge_start() {
    const s = seedOf('charge_start');
    const growl = vowel(0.5, (t, x) => 78 + 75 * x, [[500, 5, 0.8], [1000, 6, 0.4]], {
      src: 'saw', breath: 0.1, raw: 0.3, env: (t) => Math.min(1, t / 0.02) * Math.exp(-t / 0.25) * (0.6 + 0.4 * Math.sin(TAU * 32 * t)),
    });
    const wh = noiseFilt(0.45, s, { mode: 'bp', f0: 300, f1: 2200, q: 1.1, curve: 1.2, env: (t) => smooth(t / 0.2) * Math.exp(-Math.max(0, t - 0.25) / 0.1) });
    return fin(layer(0.5, [[growl, 0, 1], [wh, 0.05, 0.7]]), { grit: 0.4 });
  },

  charge_loop() {
    const s = seedOf('charge_loop');
    const N = 12;
    const sec = 0.8;
    const base = loopNoise(sec, s, { mode: 'lp', f0: 210, q: 0.8, amp: [[3, 1, 0]], floor: 0.6 });
    for (let i = 0; i < base.length; i++) base[i] *= 0.8;
    const steps = [];
    for (let k = 0; k < N; k++) {
      const t = (k / N) * sec;
      steps.push([thump(0.07, 110 + (k % 2) * 15, 60, 0.02, 0.03), t, k % 2 ? 0.5 : 0.7]);
      steps.push([noiseFilt(0.03, s + 10 + k, { mode: 'bp', f0: 1500, q: 1.2, env: (tt) => Math.exp(-tt / 0.008) }), t, 2.2]);
    }
    loopLayer(base, steps);
    return loopFinish(base, -5, 0.2);
  },

  charge_hit() {
    const s = seedOf('charge_hit');
    const th = thump(0.3, 170, 45, 0.04, 0.09);
    const crack = noiseFilt(0.12, s, { mode: 'hp', f0: 1800, q: 0.8, env: (t) => Math.exp(-t / 0.02) });
    const click = ticks(0.05, s + 1, 3, 2500, 5000, { gain: 0.8, tMax: 0.02 });
    return fin(layer(0.3, [[th, 0, 0.8], [crack, 0, 2.6], [click, 0, 1.4]]), { grit: 0.45 });
  },

  footstep_a: () => footstep('footstep_a', 700, 110),
  footstep_b: () => footstep('footstep_b', 850, 130),
  footstep_c: () => footstep('footstep_c', 600, 95),

  footstep_stone() {
    const s = seedOf('footstep_stone');
    const tick = noiseFilt(0.06, s, { mode: 'bp', f0: 1900, q: 1.5, env: (t) => decay(t, 0.008) });
    const tok = ping(640, 0.08, 0.012);
    const th = thump(0.08, 160, 140, 0.02, 0.015);
    return fin(layer(0.12, [[tick, 0, 1], [tok, 0, 0.5], [th, 0, 0.4]]), { grit: 0.3 });
  },

  hurt() {
    const v = vowel(0.35, (t, x) => 440 * Math.pow(190 / 440, Math.pow(x, 0.8)), [[(x) => 450 - 100 * x, 6, 0.9], [(x) => 900 - 100 * x, 8, 0.6]], {
      src: 'saw', breath: 0.05, raw: 0.15, env: (t) => Math.min(1, t / 0.006) * Math.exp(-t / 0.2),
    });
    return fin(v, { grit: 0.35 });
  },

  sparx_lost() {
    const s = seedOf('sparx_lost');
    const sh = tinkles(0.7, s, 26, 3000, 8500, { tauLo: 0.03, tauHi: 0.11, tMax: 0.35, gain: 0.5, decayGain: 0.5 });
    const bells = [['A6', 0], ['E6', 0.09], ['B5', 0.18]].map(([nm, t]) => [bell(hz(nm), 0.5, 0.22, 1), t, 0.7]);
    const burst = noiseFilt(0.08, s + 1, { mode: 'hp', f0: 4000, q: 0.8, env: (t) => decay(t, 0.02) });
    return fin(layer(0.7, [[sh, 0, 1], ...bells, [burst, 0, 0.35]]), { grit: 0.2 });
  },

  die() {
    const notes = [['A4', 0.0, 0.24], ['F4', 0.25, 0.24], ['D4', 0.5, 0.24]];
    const parts = notes.map(([nm, t, d]) => [wah(hz(nm), d), t, 1]);
    const fall = vowel(0.45, (t, x) => hz('D4') * Math.pow(0.5, Math.pow(x, 1.1)) * (1 + (0.01 + 0.03 * x) * Math.sin(TAU * 6 * t)),
      [[(x) => 520 - 150 * x, 5, 0.8], [(x) => 1100 - 400 * x, 7, 0.3]], {
        src: 'saw', raw: 0.3, env: (t, x) => Math.min(1, t / 0.008) * Math.pow(1 - x, 0.8),
      });
    return fin(layer(1.2, [...parts, [fall, 0.75, 1]]), { grit: 0.3 });
  },

  splash() {
    const s = seedOf('splash');
    const r = new RNG(s);
    const wash = noiseFilt(0.55, s, { mode: 'bp', f0: 3500, f1: 900, q: 0.7, curve: 0.8, env: (t) => smooth(t / 0.01) * Math.exp(-t / 0.13) });
    const parts = [[wash, 0, 1], [thump(0.2, 130, 70, 0.04, 0.07), 0, 0.5]];
    for (let k = 0; k < 7; k++) {
      const f0 = 350 + r.next() * 500;
      const bloop = sweep(0.06, f0, f0 * 1.7, { curve: 0.8, env: (t) => Math.sin(Math.PI * Math.min(1, t / 0.06)) * Math.exp(-t / 0.03) });
      parts.push([bloop, 0.05 + r.next() * 0.35, 0.4 * r.range(0.5, 1)]);
    }
    return fin(layer(0.55, parts), { grit: 0.35 });
  },

  respawn() {
    const names = ['D5', 'E5', 'A5', 'B5', 'D6', 'E6', 'A6', 'B6'];
    const parts = names.map((nm, i) => [bell(hz(nm), 0.4, 0.16 + i * 0.02, 0.8), i * 0.05, 0.35 + i * 0.07]);
    const sparkle = noiseFilt(0.7, seedOf('respawn'), { mode: 'hp', f0: 2500, f1: 7000, q: 0.8, env: (t, x) => Math.pow(Math.sin(Math.PI * Math.min(1, x)), 2) * 0.6 });
    const glide = sweep(0.45, 400, 3200, { curve: 1.6, env: (t, x) => Math.sin(Math.PI * x) * 0.35 });
    return fin(layer(0.8, [...parts, [sparkle, 0, 0.25], [glide, 0, 0.5]]), { grit: 0.2 });
  },

  bounce() {
    let ph = 0;
    const b = gen(0.5, (t) => {
      const f = 220 * (1 + 0.45 * Math.exp(-t / 0.25)) * (1 + 0.22 * Math.sin(TAU * 12 * t) * Math.exp(-t / 0.28));
      ph += f / SR;
      return (Math.sin(TAU * ph) + 0.25 * Math.sin(TAU * ph * 2)) * Math.exp(-t / 0.2) * Math.min(1, t / 0.003);
    });
    return fin(layer(0.5, [[b, 0, 1], [thump(0.06, 200, 120, 0.01, 0.02), 0, 0.3]]), { grit: 0.3 });
  },

  checkpoint() {
    const parts = [[bell(hz('A5'), 0.6, 0.35, 0.9), 0, 1], [bell(hz('E6'), 0.5, 0.35, 0.9), 0.11, 0.8]];
    return fin(layer(0.65, parts), { grit: 0.15 });
  },
};
