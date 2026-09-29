// Gloaming Vale audio — world, environment and UI sound effects. Pure DSP.
//
//   lantern_ignite  1.8 s  low fire "whoomp" (swept noise + 95 -> 48 Hz boom) under a slow-attack
//                          D-sus bell chord (D5 A5 D6 E6 A6) and warm D3/A3 swell, small stone room
//   lantern_beam    1.2 s  five sine partials gliding up a fifth with 9 Hz shimmer + rising noise + sparkles
//   barrier_open    2.0 s  swelling 90 -> 200 Hz rumble + 42 Hz growl, then glass shatter at 0.85 s
//   gate_creak      0.95 s two stick-slip creaks (110 -> 190 Hz and 220 -> 330 Hz) + wooden thunk
//   brazier_light   0.55 s fire whomp: swept low-passed noise + 90 -> 50 Hz boom + crackle
//   portal_hum      LOOP 2 s  110 Hz drone, detuned pairs beating at 1 Hz, FM swirl at 660 Hz; every
//                             partial has a whole number of cycles per loop so the seam is exact
//   waterfall       LOOP 3 s  pink + band + brown noise layers with slow periodic level drift
//   windmill        LOOP 3 s  four blade passes per loop: whoosh + wood creak + tock over a low bed
//   ui_move         1.5 kHz wood tick;  ui_select  E6 -> A6 marimba pair;  ui_back  A5 -> E5
//   ui_start        D-major-add9 saw stab + bell chord + boom + rising air sweep (title "PRESS START")
//   dialog_open     two rising triangle blips;  dialog_blip  50 ms triangle blip (repeat per letter)
//   pause / unpause A5 -> D5 / D5 -> A5;  count_tick  dry marimba tick;  tally_done  D6 A6 D7 sparkle chord

import { SR, TAU, decay, smooth, seedOf, barVoice, filterBuf } from './synth.js';
import { finalizeSfx as fin, reverbMono } from './spu.js';
import {
  layer, lvl, sweep, noiseFilt, thump, ping, bell, tinkles, ticks, creak, loopNoise, loopLayer, loopFinish, hz,
} from './sfx-kit.js';

const pkSin = (x, p = 1) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, x))), p);

export const WORLD_SFX = {
  lantern_ignite() {
    const s = seedOf('lantern_ignite');
    const whoomp = noiseFilt(0.9, s, { mode: 'lp', f0: 150, f1: 2200, q: 0.8, curve: 0.7, env: (t) => smooth(t / 0.06) * Math.exp(-Math.max(0, t - 0.08) / 0.3) });
    const roar = noiseFilt(1.2, s + 1, { mode: 'bp', f0: 700, f1: 1400, q: 0.6, env: (t) => smooth(t / 0.12) * Math.exp(-Math.max(0, t - 0.2) / 0.35) });
    const chord = [['D5', 0.12], ['A5', 0.16], ['D6', 0.2], ['E6', 0.25], ['A6', 0.3]].map(([nm, t], i) => [bell(hz(nm), 1.3, 0.6, 0.8, 0.05), t, 0.5 - i * 0.05]);
    const warm = ['D3', 'A3'].map((nm, i) => [sweep(1.4, hz(nm), hz(nm), { env: (t) => smooth(t / 0.4) * Math.exp(-Math.max(0, t - 0.5) / 0.5) }), 0.1 + i * 0.02, 0.45]);
    const b = layer(1.5, [[lvl(whoomp, 0.35), 0, 1], [lvl(roar, 0.12), 0, 1], [thump(0.6, 95, 48, 0.08, 0.2), 0, 0.9], ...chord, ...warm]);
    return fin(reverbMono(b, 'chamber', 0.4, 0.3), { grit: 0.25, fadeOut: 250 });
  },

  lantern_beam() {
    const s = seedOf('lantern_beam');
    const base = hz('D5');
    const parts = [1, 1.5, 2, 3, 4].map((r, i) => [
      sweep(1.2, base * r, base * r * 1.5, { curve: 1.4, env: (t, x) => pkSin(x, 1.5) * (1 + 0.3 * Math.sin(TAU * 9 * t + i)) }), 0, 0.5 / (1 + i * 0.3),
    ]);
    parts.push([lvl(noiseFilt(1.2, s, { mode: 'bp', f0: 2000, f1: 6500, q: 1.2, env: (t, x) => pkSin(x, 2) }), 0.05), 0, 1]);
    parts.push([tinkles(1.2, s + 1, 12, 2500, 6000, { tauLo: 0.05, tauHi: 0.15, tMax: 0.9, gain: 0.3 }), 0, 0.5]);
    return fin(layer(1.2, parts), { grit: 0.15, fadeIn: 30, fadeOut: 150 });
  },

  barrier_open() {
    const s = seedOf('barrier_open');
    const rumble = noiseFilt(2.0, s, { mode: 'lp', f0: 90, f1: 200, q: 0.8, env: (t, x) => pkSin(x / 0.9, 1.5) });
    const growl = sweep(2.0, 42, 55, { env: (t, x) => pkSin(x * 1.05, 2) });
    const shards = tinkles(1.15, s + 1, 45, 1800, 8000, { tauLo: 0.04, tauHi: 0.3, tMax: 0.9, gain: 0.5, decayGain: 0.4 });
    const burst = noiseFilt(0.25, s + 2, { mode: 'hp', f0: 3500, q: 0.8, env: (t) => decay(t, 0.05) });
    const crack = ticks(0.4, s + 3, 18, 2000, 7000, { tMax: 0.35, gain: 0.7 });
    const b = layer(2.0, [[lvl(rumble, 0.3), 0, 1], [growl, 0, 0.5], [shards, 0.85, 1], [burst, 0.85, 0.35], [crack, 0.85, 0.6], [thump(0.5, 80, 40, 0.06, 0.15), 0.85, 0.8]]);
    return fin(b, { grit: 0.35, fadeOut: 200 });
  },

  gate_creak() {
    const s = seedOf('gate_creak');
    const c1 = creak(0.85, 110, 190, s, { q: 6, bpF: 750, jitter: 0.22, rate: 60 });
    const c2 = creak(0.85, 220, 330, s + 1, { q: 5, bpF: 1500, jitter: 0.25, rate: 75 });
    return fin(layer(0.95, [[lvl(c1, 0.2), 0, 1], [lvl(c2, 0.1), 0.05, 1], [thump(0.15, 140, 70, 0.02, 0.05), 0.8, 0.5]]), { grit: 0.35 });
  },

  brazier_light() {
    const s = seedOf('brazier_light');
    const whomp = noiseFilt(0.5, s, { mode: 'lp', f0: 120, f1: 1800, q: 0.8, curve: 0.7, env: (t) => smooth(t / 0.03) * Math.exp(-Math.max(0, t - 0.05) / 0.16) });
    const crack = ticks(0.5, s + 1, 8, 1500, 4500, { tMin: 0.05, tMax: 0.45, gain: 0.5 });
    return fin(layer(0.55, [[lvl(whomp, 0.3), 0, 1], [thump(0.4, 90, 50, 0.05, 0.12), 0, 0.9], [crack, 0, 0.5]]), { grit: 0.4 });
  },

  portal_hum() {
    const sec = 2;
    const N = Math.round(sec * SR);
    // [frequency (multiple of 0.5 Hz => whole cycles in 2 s), amplitude]
    const partials = [[110, 1], [111, 0.75], [220, 0.6], [221.5, 0.45], [330, 0.5], [441, 0.35], [880.5, 0.2], [1321, 0.12]];
    const hum = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      let v = 0;
      for (const [f, a] of partials) v += a * Math.sin(TAU * f * t);
      // FM swirl: 660 Hz carrier, +-40 Hz deviation once every 2 s (integer cycles)
      v += 0.25 * Math.sin(TAU * 660 * t + (40 / 0.5) * Math.sin(TAU * 0.5 * t) * 0.5);
      hum[i] = v * (1 + 0.15 * Math.sin(TAU * 1 * t));
    }
    const shim = loopNoise(sec, seedOf('portal_hum'), { mode: 'bp', f0: 1100, fMod: 600, q: 3, cut: [[1, 1, 0]], amp: [[2, 1, 0.3]], floor: 0.3 });
    return loopFinish(layer(sec, [[hum, 0, 1], [lvl(shim, 0.06), 0, 1]]), -12, 0.1);
  },

  waterfall() {
    const s = seedOf('waterfall');
    const a = loopNoise(3, s, { colour: 'pink', mode: 'lp', f0: 4500, q: 0.6, amp: [[7, 0.3, 0], [13, 0.2, 0.4]], floor: 0.75, hp2: 180 });
    const b = loopNoise(3, s + 1, { mode: 'bp', f0: 2600, fMod: 1200, q: 0.5, cut: [[5, 1, 0.2]], amp: [[9, 1, 0.6]], floor: 0.5 });
    const low = loopNoise(3, s + 2, { colour: 'brown', mode: 'lp', f0: 400, q: 0.7, amp: [[2, 1, 0]], floor: 0.7, hp2: 60 });
    return loopFinish(layer(3, [[lvl(a, 0.3), 0, 1], [lvl(b, 0.15), 0, 1], [lvl(low, 0.2), 0, 1]]), -12, 0.1);
  },

  windmill() {
    const sec = 3;
    const s = seedOf('windmill');
    const bed = lvl(loopNoise(sec, s, { mode: 'lp', f0: 380, q: 0.7, amp: [[4, 1, 0]], floor: 0.5 }), 0.06);
    const parts = [];
    for (let k = 0; k < 4; k++) {
      const t = k * 0.75;
      parts.push([lvl(noiseFilt(0.5, s + 10 + k, { mode: 'bp', f0: 500, f1: 800, q: 0.8, env: (tt, x) => pkSin(x, 2) }), 0.05), t + 0.05, 1]);
      parts.push([lvl(creak(0.55, 120, 100, s + 20 + k, { q: 6, bpF: 650, jitter: 0.12, rate: 40, env: (tt, x) => pkSin(x, 1.5) * 0.7 }), 0.05), t + 0.1, 1]);
      parts.push([ping(310, 0.09, 0.02, { h2: 0.3, h2r: 2.4 }), t + 0.4, 0.12]);
    }
    return loopFinish(loopLayer(bed, parts), -12, 0.2);
  },

  ui_move() {
    const t = ping(1500, 0.06, 0.012, { h2: 0.3, h2r: 2 });
    const c = noiseFilt(0.01, seedOf('ui_move'), { mode: 'hp', f0: 3000, q: 0.8, env: (tt) => decay(tt, 0.003) });
    return fin(layer(0.06, [[t, 0, 1], [c, 0, 0.3]]), { grit: 0.15 });
  },

  ui_select() {
    const m = (nm, d) => barVoice(hz(nm), d, [[1, 1, 0.09], [4, 0.3, 0.03]], { attack: 0.001 });
    return fin(layer(0.3, [[m('E6', 0.25), 0, 1], [m('A6', 0.25), 0.07, 1]]), { grit: 0.15 });
  },

  ui_back() {
    const m = (nm, d) => barVoice(hz(nm), d, [[1, 1, 0.09], [4, 0.25, 0.03]], { attack: 0.001 });
    return fin(layer(0.22, [[m('A5', 0.2), 0, 1], [m('E5', 0.18), 0.06, 0.8]]), { grit: 0.15 });
  },

  ui_start() {
    const s = seedOf('ui_start');
    const chord = ['D3', 'A3', 'D4', 'F#4', 'A4', 'E5'].map((nm, i) => [sweep(1.2, hz(nm), hz(nm), { wave: 'saw', env: (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.5) }), 0.005 * i, 0.22]);
    const stab = filterBuf(layer(1.2, chord), 'lp', 3400, 0.7071, true);
    const bells = [['D6', 0], ['A6', 0.03], ['D7', 0.06]].map(([nm, t]) => [bell(hz(nm), 1.0, 0.5, 1), t, 0.5]);
    const air = noiseFilt(0.6, s, { mode: 'hp', f0: 1000, f1: 8000, q: 0.8, env: (t, x) => pkSin(x, 1.2) });
    const b = layer(1.0, [[stab, 0, 1], ...bells, [thump(0.6, 95, 60, 0.05, 0.25), 0, 0.8], [lvl(air, 0.08), 0, 1]]);
    return fin(reverbMono(b, 'chamber', 0.45, 0.25), { grit: 0.2, fadeOut: 220 });
  },

  dialog_open() {
    const b = (f0, f1, d) => sweep(d, f0, f1, { wave: 'tri', env: (t) => Math.min(1, t / 0.005) * Math.exp(-t / (d * 0.5)) });
    return fin(layer(0.16, [[b(660, 700, 0.07), 0, 0.8], [b(880, 990, 0.09), 0.07, 1]]), { lp: 3500, grit: 0.15 });
  },

  dialog_blip() {
    const b = sweep(0.05, 520, 495, { wave: 'tri', env: (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.018) });
    const h = sweep(0.05, 1040, 990, { wave: 'sine', env: (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.012) });
    return fin(layer(0.05, [[b, 0, 1], [h, 0, 0.2]]), { lp: 4000, grit: 0.1 });
  },

  pause() {
    return fin(layer(0.24, [[bell(hz('A5'), 0.2, 0.09, 0.3), 0, 1], [bell(hz('D5'), 0.2, 0.1, 0.3), 0.08, 0.9]]), { grit: 0.15 });
  },

  unpause() {
    return fin(layer(0.24, [[bell(hz('D5'), 0.2, 0.09, 0.3), 0, 0.9], [bell(hz('A5'), 0.2, 0.1, 0.3), 0.08, 1]]), { grit: 0.15 });
  },

  count_tick() {
    const t = barVoice(1760, 0.05, [[1, 1, 0.012], [4, 0.3, 0.004]], { attack: 0.0008 });
    const c = noiseFilt(0.01, seedOf('count_tick'), { mode: 'bp', f0: 3500, q: 1, env: (tt) => decay(tt, 0.002) });
    return fin(layer(0.05, [[t, 0, 1], [c, 0, 0.3]]), { grit: 0.15 });
  },

  tally_done() {
    const parts = [['D6', 0], ['A6', 0.015], ['D7', 0.03]].map(([nm, t]) => [bell(hz(nm), 0.5, 0.25, 1), t, 0.8]);
    parts.push([barVoice(hz('D5'), 0.4, [[1, 1, 0.15], [4, 0.3, 0.05]]), 0, 0.5]);
    parts.push([tinkles(0.5, seedOf('tally_done'), 5, 3000, 6500, { tauLo: 0.05, tauHi: 0.1, tMax: 0.3, gain: 0.25 }), 0.05, 1]);
    return fin(reverbMono(layer(0.55, parts), 'room', 0.3, 0.15), { grit: 0.15 });
  },
};
