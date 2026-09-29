// Gloaming Vale audio — stingers (non-looping jingles). Pure DSP (Node + browser).
//
// All four are stereo, built from the same instrument bank as the music and written in D so they
// sit on top of either colouring of the tune. The lantern stinger avoids the 3rd (no F / F#) so it
// never clashes with the modal music underneath; the celebratory ones use D major.
//
//   lantern   2.5 s  bright rising celesta/bell arpeggio (D A D E A) + warm pad swell + chime glint
//   sunrise  10.0 s  pad crescendo, three glittering rising arpeggios, a flute hook (A D F# E),
//                    a noise riser, then a big D-major-add9 chord with kick / bass / chime shower
//   complete  7.0 s  playful major-key fanfare (marimba + flute lead, pizzicato stabs, tambourine)
//                    ending on a held D chord
//   gameover  3.0 s  gentle descending sigh in D minor (flute + celesta echo over a soft pad)
//
// Every stinger gets the SPU hall/chamber reverb baked in, a 9.5 kHz high-cut, a 2 ms fade-in and
// a long raised-cosine fade-out so it always ends in silence.

import {
  SR, StereoMix, RNG, Noise, Biquad, seedOf, samples, fadeEdges, removeDC, dbToLin, peakOf, softLimit,
} from './synth.js';
import { SPUReverb, REVERB_PRESETS } from './spu.js';
import * as I from './instruments.js';
import { note } from './composition.js';

const n = (name) => note(name, false);
/** One octave up, unless that would leave the range where the bank samples stay clean (above E7). */
const up12 = (m) => (m + 12 > 100 ? m : m + 12);

/** Run a generator builder to completion (used by the plain exported functions; jobs yield between steps instead). */
function drain(g) {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/** Reverb + high-cut + fades + peak normalise. Returns { L, R }. (A generator: yields after the reverb.) */
function* finishStinger(mix, o) {
  const { preset = 'hall', wet = 0.6, peakDb = -1.5, fadeOutSec = 0.3, hpSend = 200 } = o;
  const N = mix.n;
  const sendL = new Float32Array(N);
  const sendR = new Float32Array(N);
  const hpL = new Biquad('hp', hpSend, 0.7071);
  const hpR = new Biquad('hp', hpSend, 0.7071);
  for (let i = 0; i < N; i++) {
    sendL[i] = hpL.process(mix.L[i]);
    sendR[i] = hpR.process(mix.R[i]);
  }
  const wl = new Float32Array(N);
  const wr = new Float32Array(N);
  new SPUReverb(REVERB_PRESETS[preset]).process(sendL, sendR, wl, wr);
  yield;
  // wet level = `wet` x the dry RMS, and each wet channel is scaled to the SAME energy: the reverb's
  // left/right delay lines differ slightly, which would otherwise tilt a short, tonal stinger to one side
  let dry = 0;
  let wtL = 0;
  let wtR = 0;
  for (let i = 0; i < N; i++) {
    dry += mix.L[i] * mix.L[i] + mix.R[i] * mix.R[i];
    wtL += wl[i] * wl[i];
    wtR += wr[i] * wr[i];
  }
  const target = Math.sqrt(dry / 2) * wet;
  const gL = wtL > 1e-12 ? target / Math.sqrt(wtL) : 0;
  const gR = wtR > 1e-12 ? target / Math.sqrt(wtR) : 0;
  const lpL = new Biquad('lp', 9500, 0.7071);
  const lpR = new Biquad('lp', 9500, 0.7071);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    L[i] = lpL.process(mix.L[i] + wl[i] * gL);
    R[i] = lpR.process(mix.R[i] + wr[i] * gR);
  }
  removeDC(L);
  removeDC(R);
  // soft limit then normalise (shared gain keeps the stereo image)
  let pk = Math.max(peakOf(L), peakOf(R));
  const pre = pk > 0.8 ? 0.8 / pk : 1;
  for (let i = 0; i < N; i++) {
    L[i] = softLimit(L[i] * pre, 0.7, 0.98);
    R[i] = softLimit(R[i] * pre, 0.7, 0.98);
  }
  pk = Math.max(peakOf(L), peakOf(R));
  const k = dbToLin(peakDb) / pk;
  const fo = Math.round(fadeOutSec * 1000);
  for (let i = 0; i < N; i++) {
    L[i] *= k;
    R[i] *= k;
  }
  fadeEdges(L, 2, fo);
  fadeEdges(R, 2, fo);
  return { L, R };
}

const cel = (nm) => I.celesta(typeof nm === 'string' ? n(nm) : nm);

// ---------------------------------------------------------------------------------------------
function* buildLantern() {
  const mix = new StereoMix(2.5);
  const notes = ['D5', 'A5', 'D6', 'E6', 'A6'];
  const at = [0, 0.07, 0.14, 0.21, 0.3];
  const pans = [-0.35, 0.3, -0.2, 0.25, 0]; // zig-zag so the ringing tail stays centred
  notes.forEach((nm, i) => {
    mix.add(cel(nm), at[i], 0.75 + i * 0.05, pans[i]);
    mix.add(I.musicBox(up12(n(nm))), at[i] + 0.012, 0.25, -pans[i]);
  });
  mix.add(I.chime(n('A6')), 0.3, 0.4, 0.15);
  mix.add(I.chime(n('D7')), 0.42, 0.28, -0.15);
  // warm swell: D sus2 pad, opening filter
  for (const [nm, pan] of [['D3', -0.4], ['A3', -0.15], ['D4', 0.15], ['E4', 0.4]]) {
    mix.add(I.pad(n(nm), 1.3, { cut: 2600, attack: 0.5, release: 0.7 }), 0.02, 0.55, pan);
  }
  mix.add(I.bass(n('D2')), 0.05, 0.6, 0, samples(0.9));
  yield;
  return yield* finishStinger(mix, { preset: 'chamber', wet: 0.7, fadeOutSec: 0.35 });
}

// ---------------------------------------------------------------------------------------------
function* buildSunrise() {
  const mix = new StereoMix(10);
  const rng = new RNG(seedOf('sunrise'));
  // 1. pad crescendo: D major add9, very slow attack, blooming cutoff
  const chord = [['D3', -0.5], ['A3', -0.3], ['D4', -0.1], ['F#4', 0.1], ['A4', 0.3], ['E5', 0.5]];
  chord.forEach(([nm, pan], i) => mix.add(I.pad(n(nm), 6.0, { cut: 3400, attack: 3.2, release: 3.4 }), 0.0 + i * 0.05, 0.55, pan));
  yield;
  // 2. flute hook (the daybreak motif, slowed): A4 D5 F#5 E5
  const hook = [['A4', 1.6, 0.9], ['D5', 2.5, 0.5], ['F#5', 3.0, 0.9], ['E5', 3.9, 1.4]];
  for (const [nm, t, d] of hook) mix.add(I.flute(n(nm), d), t, 0.55, 0.25);
  // 3. glittering arpeggios climbing in three waves
  const runs = [
    [1.2, ['D5', 'A5', 'D6', 'F#6'], 0.11, 0.35],
    [3.0, ['A5', 'D6', 'F#6', 'A6', 'D7'], 0.095, 0.5],
    [4.6, ['D5', 'F#5', 'A5', 'D6', 'F#6', 'A6', 'D7'], 0.085, 0.65],
  ];
  runs.forEach(([t0, list, step, vel], ri) => {
    list.forEach((nm, i) => {
      const s = ri === 1 ? I.musicBox(n(nm)) : I.celesta(n(nm));
      mix.add(s, t0 + i * step, vel * (0.7 + 0.3 * (i / list.length)), -0.5 + (i / list.length));
    });
  });
  yield;
  // 4. noise riser (band swept up), 3.5 -> 6.0 s
  const nz = new Noise(seedOf('sunriser'));
  const rn = new Float32Array(samples(2.6));
  const hp = new Biquad('hp', 1500, 0.7071);
  for (let i = 0; i < rn.length; i++) {
    const t = i / SR;
    if ((i & 31) === 0) hp.set('hp', 1200 + 3800 * (t / 2.6), 0.8);
    rn[i] = hp.process(nz.white()) * Math.pow(t / 2.6, 2.2);
  }
  mix.add(rn, 3.5, 0.32, 0);
  yield;
  // 5. the big chord at 6.0 s
  const T = 6.0;
  const big = ['D3', 'A3', 'D4', 'F#4', 'A4', 'D5', 'F#5', 'E5'];
  big.forEach((nm, i) => mix.add(I.pad(n(nm), 3.0, { cut: 4200, attack: 0.04, release: 2.6 }), T - 0.03, 0.55, -0.6 + i * 0.17));
  yield;
  for (const [nm, pan] of [['D5', -0.3], ['F#5', -0.1], ['A5', 0.1], ['D6', 0.3]]) mix.add(I.celesta(n(nm)), T, 0.8, pan);
  for (const [nm, pan] of [['D4', -0.2], ['A4', 0.2]]) mix.add(I.marimba(n(nm)), T, 0.75, pan);
  mix.add(I.bass(n('D2')), T, 1.0, 0, samples(2.4));
  mix.add(I.kick(), T, 1.0, 0);
  mix.add(I.tom('low'), T, 0.8, -0.1);
  mix.add(I.tambourine(), T + 0.02, 0.5, 0.3);
  // crash-ish noise burst
  const cr = new Float32Array(samples(2.2));
  const chp = new Biquad('hp', 3200, 0.7071);
  for (let i = 0; i < cr.length; i++) cr[i] = chp.process(nz.white()) * Math.exp(-(i / SR) / 0.55);
  mix.add(cr, T, 0.3, 0);
  // chime shower over the top
  const pent = ['D6', 'E6', 'A6', 'B6', 'D7'];
  for (let i = 0; i < 9; i++) mix.add(I.chime(n(rng.pick(pent))), T + 0.05 + i * 0.17 + rng.range(0, 0.06), 0.28 * (1 - i * 0.07), rng.range(-0.7, 0.7));
  yield;
  return yield* finishStinger(mix, { preset: 'hall', wet: 0.65, fadeOutSec: 0.9 });
}

// ---------------------------------------------------------------------------------------------
function* buildComplete() {
  const E = 0.2; // one eighth note (150 bpm)
  const mix = new StereoMix(7.0);
  // lead: [startEighth, note, lenEighths]
  const lead = [
    [0, 'A4', 1], [1, 'D5', 1], [2, 'F#5', 1], [3, 'A5', 1], [4, 'B5', 3], [7, 'A5', 1],
    [8, 'G5', 1], [9, 'F#5', 1], [10, 'E5', 1], [11, 'F#5', 1], [12, 'D5', 3],
    [16, 'B4', 1], [17, 'E5', 1], [18, 'G5', 1], [19, 'B5', 1], [20, 'D6', 3], [23, 'C#6', 1],
    [24, 'B5', 1], [25, 'A5', 1], [26, 'F#5', 1], [27, 'A5', 1],
  ];
  for (const [u, nm, len] of lead) {
    const m = n(nm);
    const t = u * E;
    mix.add(I.marimba(m), t, 0.9, -0.15);
    if (len >= 3) mix.add(I.flute(m, len * E * 0.95), t, 0.5, 0.3);
    else if (m >= n('A5')) mix.add(I.celesta(up12(m)), t, 0.22, 0.25);
  }
  yield;
  // final chord: D major add9 at 28 eighths (5.6 s), rings to the end
  const T = 28 * E;
  for (const [nm, pan] of [['D4', -0.4], ['F#4', -0.15], ['A4', 0.1], ['D5', 0.35], ['E5', 0.55]]) {
    mix.add(I.pad(n(nm), 1.2, { cut: 3800, attack: 0.03, release: 1.2 }), T, 0.5, pan);
    mix.add(I.marimba(n(nm)), T, 0.55, pan);
  }
  for (const [nm, pan] of [['D6', -0.3], ['F#6', 0.1], ['A6', 0.4]]) mix.add(I.celesta(n(nm)), T, 0.6, pan);
  mix.add(I.bass(n('D2')), T, 0.95, 0, samples(1.2));
  mix.add(I.kick(), T, 0.9, 0);
  mix.add(I.chime(n('D7')), T + 0.05, 0.4, 0.3);
  mix.add(I.chime(n('A6')), T + 0.2, 0.35, -0.3);
  yield;
  // accompaniment: bass on the beat, pizzicato stabs on the off-beats, tambourine + bongos
  const roots = [['D2', 0], ['D2', 4], ['G2', 8], ['A2', 12], ['E2', 16], ['A2', 20], ['G2', 24]];
  for (const [nm, u] of roots) mix.add(I.bass(n(nm)), u * E, 0.85, 0, samples(4 * E * 0.95));
  const stabs = [
    [1.5, ['F#3', 'A3', 'D4']], [3.5, ['F#3', 'A3', 'D4']], [5.5, ['F#3', 'A3', 'D4']],
    [9.5, ['G3', 'B3', 'D4']], [13.5, ['G3', 'C#4', 'E4']], [17.5, ['G3', 'B3', 'E4']], [21.5, ['G3', 'C#4', 'E4']], [25.5, ['G3', 'B3', 'D4']],
  ];
  for (const [u, notes] of stabs) notes.forEach((nm, i) => mix.add(I.pizz(n(nm)), u * E + i * 0.005, 0.4, -0.3 + i * 0.3));
  for (let u = 0; u < 28; u += 2) {
    mix.add(I.shaker('crisp'), u * E, 0.3 + (u % 4 === 0 ? 0.12 : 0), 0.4);
    if (u % 4 === 2) mix.add(I.tambourine(), u * E, 0.4, -0.3);
    mix.add(I.bongo(u % 8 === 6 ? 'lo' : 'hi'), (u + 1) * E, 0.4, 0.25);
  }
  yield;
  return yield* finishStinger(mix, { preset: 'chamber', wet: 0.55, fadeOutSec: 0.5 });
}

// ---------------------------------------------------------------------------------------------
function* buildGameover() {
  const mix = new StereoMix(3.0);
  // descending sigh in D minor: A4 F4 E4 D4 (quarter = 0.42 s, the last note long)
  const line = [['A4', 0.0, 0.5], ['F4', 0.5, 0.5], ['E4', 1.0, 0.5], ['D4', 1.5, 1.0]];
  for (const [nm, t, d] of line) {
    mix.add(I.flute(n(nm), d), t, 0.6, 0.15);
    mix.add(I.celesta(n(nm) + 12), t + 0.02, 0.3, -0.25);
    mix.add(I.celesta(n(nm) + 12), t + 0.02 + 0.375, 0.1, 0.4); // faint echo
  }
  for (const [nm, pan] of [['D3', -0.3], ['A3', 0.0], ['F4', 0.3]]) mix.add(I.pad(n(nm), 1.9, { cut: 900, attack: 0.5, release: 1.0 }), 0.3, 0.55, pan);
  mix.add(I.bass(n('D2')), 1.5, 0.7, 0, samples(1.4));
  return yield* finishStinger(mix, { preset: 'hall', wet: 0.6, fadeOutSec: 0.6 });
}

export const lantern = () => drain(buildLantern());
export const sunrise = () => drain(buildSunrise());
export const complete = () => drain(buildComplete());
export const gameover = () => drain(buildGameover());

/** Render jobs; each is a generator so the runtime can yield to the browser between steps. */
export function stingerJobs(out) {
  return [
    { name: 'stinger_lantern', weight: 1, run: function* () { out.stinger_lantern = yield* buildLantern(); } },
    { name: 'stinger_sunrise', weight: 2, run: function* () { out.stinger_sunrise = yield* buildSunrise(); } },
    { name: 'stinger_complete', weight: 2, run: function* () { out.stinger_complete = yield* buildComplete(); } },
    { name: 'stinger_gameover', weight: 1, run: function* () { out.stinger_gameover = yield* buildGameover(); } },
  ];
}
