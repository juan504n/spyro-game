// Gloaming Vale audio — the music's "sample bank" (our stand-in for a PlayStation VAB file).
//
// Every function renders ONE note or hit of an instrument as a mono Float32Array at SR = 22050,
// peaking near -6 dBFS after the SPU colouring chain (high-cut + 4-bit ADPCM grit). The
// sequencer (music.js) renders each distinct (instrument, pitch, length) once, caches it, and
// simply mixes copies at different times / velocities — exactly how a hardware sampler works.
//
// Voices:
//   celesta    struck steel bar: fundamental + 2-octave-up partial + faint 9.7x shimmer, hammer tick
//   musicBox   plucked comb tine: fundamental + fast-dying 6.27x tine mode + soft octave
//   marimba    rosewood bar: fundamental + 4x + 9.9x modes (bar-tuned), mallet thock
//   flute      ocarina-ish breathy sine: 2nd/3rd harmonic, delayed vibrato, chiff noise burst
//   pad        warm "string synth": 3 detuned polyBLEP saws through a blooming low-pass (no ADPCM pass)
//   bass       round plucked bass: sine + fast-decaying 2nd/3rd harmonics, click, dark low-pass
//   pizz       pizzicato strings: tuned Karplus-Strong pluck
//   chime      metal wind-chime tube: inharmonic partials with long decays
//   shaker / wood / tom / bongo / conga / tambourine / kick   the percussion kit
// The voices of the other worlds' songs (harp, glass bells, strings, horns, choir, drums ...) are in voices.js, on the same bank.

import {
  SR, TAU, Noise, Biquad, mtof, samples, gen, barVoice, pluckString, adsr, ad, clamp, seedOf, smooth, blep,
} from './synth.js';
import { finalizeSfx } from './spu.js';

const REF_DB = -6;
export const done = (buf, o = {}) => finalizeSfx(buf, { peakDb: REF_DB, grit: 0.3, fadeIn: 1, fadeOut: 4, ...o });

/** Tiny memo table so each distinct sample is rendered only once. */
export class Bank {
  constructor() {
    this.map = new Map();
  }
  get(key, make) {
    let v = this.map.get(key);
    if (v === undefined) {
      v = make();
      this.map.set(key, v);
    }
    return v;
  }
  clear() {
    this.map.clear();
  }
}

/**
 * Every instrument below is memoised in one shared bank (music, stingers and ambience all ask for
 * the same notes), so a given (instrument, pitch, length) is synthesised once per session.
 * Returned arrays are shared: callers must treat them as read-only.
 */
export const SHARED = new Bank();
export const clearInstrumentCache = () => SHARED.clear();

// ---------------------------------------------------------------------------------------------
// Pitched voices
// ---------------------------------------------------------------------------------------------
export const celesta = (m) => SHARED.get('cel' + m, () => render_celesta(m));
function render_celesta(m) {
  const f = mtof(m);
  const tau = clamp(1.5 * Math.pow(261.6 / f, 0.45), 0.3, 1.8);
  const b = barVoice(f, Math.min(2.4, tau * 4.4), [[1, 1, tau], [4.0, 0.2, tau * 0.3], [9.7, 0.07, tau * 0.08]]);
  const nz = new Noise(seedOf('cel' + m));
  for (let i = 0; i < 60; i++) b[i] += nz.white() * 0.08 * (1 - i / 60); // hammer tick
  return done(b);
}

export const musicBox = (m) => SHARED.get('mbx' + m, () => render_musicBox(m));
function render_musicBox(m) {
  const f = mtof(m);
  const tau = clamp(0.9 * Math.pow(523 / f, 0.3), 0.25, 1.2);
  const b = barVoice(f, Math.min(2.4, tau * 5), [[1, 1, tau], [2.0, 0.14, tau * 0.5], [6.27, 0.17, tau * 0.14]]);
  return done(b);
}

export const marimba = (m) => SHARED.get('mar' + m, () => render_marimba(m));
function render_marimba(m) {
  const f = mtof(m);
  const tau = clamp(0.62 * Math.pow(261.6 / f, 0.55), 0.1, 1.0);
  const b = barVoice(f, Math.min(2, tau * 6), [[1, 1, tau], [3.98, 0.38, tau * 0.24], [9.9, 0.09, tau * 0.06]], { attack: 0.001 });
  const nz = new Noise(seedOf('mar' + m));
  const bp = new Biquad('bp', 1900, 1.2);
  for (let i = 0; i < 70; i++) b[i] += bp.process(nz.white()) * 0.22 * (1 - i / 70); // mallet thock
  return done(b);
}

/** Sustained breathy flute / ocarina note of `dur` seconds (plus a short release). */
export const flute = (m, dur) => SHARED.get(`flute${m}:${dur}`, () => render_flute(m, dur));
function render_flute(m, dur) {
  const f = mtof(m);
  const rel = 0.09;
  const n = samples(dur + rel + 0.02);
  const out = new Float32Array(n);
  const nz = new Noise(seedOf('flute' + m + Math.round(dur * 100)));
  const bp = new Biquad('bp', Math.min(f * 2.2, 8500), 2.5);
  let ph = 0;
  let fr = f / SR;
  let env = 0;
  let breathG = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 7) === 0) { // control rate
      const t = i / SR;
      const vib = 1 + 0.006 * Math.sin(TAU * 5.2 * t) * smooth((t - 0.22) / 0.3);
      fr = (f * vib * (1 - 0.02 * Math.exp(-t / 0.03))) / SR;
      env = Math.min(1, t / 0.05) * (t > dur ? Math.max(0, 1 - (t - dur) / rel) : 1) * (1 + 0.15 * Math.exp(-t / 0.08));
      breathG = 0.05 + 0.3 * Math.exp(-t / 0.05);
    }
    ph += fr;
    if (ph >= 1) ph -= 1;
    const a = TAU * ph;
    const s1 = Math.sin(a);
    const c1 = Math.cos(a);
    const tone = s1 + 0.1 * (2 * s1 * c1) + 0.035 * (s1 * (3 - 4 * s1 * s1));
    out[i] = (tone + bp.process(nz.white()) * breathG) * env;
  }
  return done(out, { fadeOut: 8 });
}

/**
 * Warm string-synth pad note. o.cut = low-pass centre (Hz), o.attack / o.release in seconds.
 * Three detuned polyBLEP saws; the low-pass "blooms" with the amplitude swell. Envelope and
 * cutoff run at control rate (every 16 samples, linearly interpolated). No ADPCM pass: the
 * pad is already band-limited and the grit would only add hiss under the swell.
 */
export const pad = (m, dur, o = {}) => SHARED.get(`pad${m}:${dur}:${o.cut}:${o.attack}:${o.release}`, () => render_pad(m, dur, o));
function render_pad(m, dur, o) {
  const f = mtof(m);
  const cut = o.cut ?? 1400;
  const att = o.attack ?? 0.5;
  const rel = o.release ?? 0.8;
  const n = samples(dur + rel);
  const out = new Float32Array(n);
  const d0 = (f * 0.996) / SR;
  const d1 = f / SR;
  const d2 = (f * 1.0042) / SR;
  let p0 = 0;
  let p1 = 0.31;
  let p2 = 0.67;
  const lp = new Biquad('lp', cut, 0.7);
  let env = 0;
  let step = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      env = adsr(i / SR, dur, att, 0.35, 0.85, rel);
      step = (adsr((i + 16) / SR, dur, att, 0.35, 0.85, rel) - env) / 16;
      if ((i & 63) === 0) lp.set('lp', cut * (0.55 + 0.45 * env), 0.7);
    }
    env += step;
    p0 += d0; if (p0 >= 1) p0 -= 1;
    p1 += d1; if (p1 >= 1) p1 -= 1;
    p2 += d2; if (p2 >= 1) p2 -= 1;
    const s = 2 * (p0 + p1 + p2) - 3 - blep(p0, d0) - blep(p1, d1) - blep(p2, d2);
    out[i] = lp.process(s * 0.33) * env;
  }
  return done(out, { fadeOut: 10, grit: 0, lp: 0 });
}

/** Round plucked bass: three decaying harmonics (recursive oscillators), click, dark low-pass. */
export const bass = (m) => SHARED.get('bass' + m, () => render_bass(m));
function render_bass(m) {
  const f = mtof(m);
  const b = barVoice(f, 1.1, [[1, 1, 0.55], [2, 0.5, 0.16], [3, 0.2, 0.07]], { attack: 0.004 });
  const nz = new Noise(seedOf('bass' + m));
  for (let i = 0; i < 90; i++) b[i] += nz.white() * 0.06 * Math.exp((-4 * i) / 90);
  const lp = new Biquad('lp', 1500, 0.8);
  for (let i = 0; i < b.length; i++) b[i] = lp.process(b[i]);
  return done(b, { fadeOut: 20 });
}

/** Pizzicato string (Karplus-Strong, tuned). */
export const pizz = (m) => SHARED.get('pz' + m, () => render_pizz(m));
function render_pizz(m) {
  const b = pluckString(mtof(m), 0.55, 0.9965, 0.55, seedOf('pz' + m));
  const lp = new Biquad('lp', 3600, 0.7);
  for (let i = 0; i < b.length; i++) b[i] = lp.process(b[i]);
  return done(b);
}

/** Wind-chime tube. */
export const chime = (m) => SHARED.get('chm' + m, () => render_chime(m));
function render_chime(m) {
  const f = mtof(m);
  return done(barVoice(f, 3.2, [[1, 1, 2.0], [2.76, 0.5, 1.1], [5.4, 0.28, 0.6], [8.93, 0.15, 0.3]], { attack: 0.002 }), { grit: 0.2, fadeOut: 40 });
}

// ---------------------------------------------------------------------------------------------
// Percussion kit
// ---------------------------------------------------------------------------------------------
export const shaker = (kind = 'soft') => SHARED.get('shk' + kind, () => render_shaker(kind));
function render_shaker(kind) {
  const soft = kind === 'soft';
  const nz = new Noise(seedOf('shaker' + kind));
  const bp = new Biquad('bp', soft ? 3800 : 6200, soft ? 0.7 : 0.9);
  const hp = new Biquad('hp', soft ? 1800 : 3000, 0.7);
  const a = soft ? 0.014 : 0.006;
  const tau = soft ? 0.055 : 0.04;
  return done(gen(soft ? 0.2 : 0.16, (t) => hp.process(bp.process(nz.white())) * ad(t, a, tau)), { grit: 0.2 });
}

export const wood = (kind = 'hi') => SHARED.get('wood' + kind, () => render_wood(kind));
function render_wood(kind) {
  const f = kind === 'hi' ? 1180 : 820;
  const nz = new Noise(seedOf('wood' + kind));
  return done(gen(0.14, (t) => {
    let s = Math.sin(TAU * f * t) * Math.exp(-t / 0.022);
    s += 0.5 * Math.sin(TAU * f * 2.13 * t) * Math.exp(-t / 0.012);
    s += nz.white() * 0.25 * Math.exp(-t / 0.0015);
    return s * Math.min(1, t / 0.0008);
  }));
}

/** Pitch-swept membrane drum used for toms, bongos, congas and the soft kick. */
export function drum(name, fStart, fEnd, sweepTau, ampTau, sec, noiseAmt, harm = 0) {
  const nz = new Noise(seedOf(name));
  const lp = new Biquad('lp', 2200, 0.7);
  let ph = 0;
  return done(gen(sec, (t) => {
    ph += (fEnd + (fStart - fEnd) * Math.exp(-t / sweepTau)) / SR;
    let s = Math.sin(TAU * ph) * Math.exp(-t / ampTau);
    if (harm) s += harm * Math.sin(TAU * ph * 1.59) * Math.exp(-t / (ampTau * 0.4));
    s += lp.process(nz.white()) * Math.exp(-t / 0.006) * noiseAmt;
    return s * Math.min(1, t / 0.002);
  }), { fadeOut: 12 });
}

export const tom = (kind = 'low') =>
  SHARED.get('tom' + kind, () => (kind === 'low' ? drum('tomL', 135, 92, 0.05, 0.24, 0.6, 0.12) : drum('tomM', 190, 135, 0.045, 0.2, 0.5, 0.12)));
export const bongo = (kind = 'hi') =>
  SHARED.get('bongo' + kind, () => (kind === 'hi' ? drum('bongoH', 520, 440, 0.02, 0.09, 0.28, 0.35, 0.25) : drum('bongoL', 380, 318, 0.02, 0.11, 0.32, 0.3, 0.25)));
export const conga = (kind = 'open') =>
  SHARED.get('conga' + kind, () => (kind === 'open' ? drum('congaO', 310, 245, 0.03, 0.16, 0.45, 0.25, 0.3) : drum('congaS', 420, 300, 0.012, 0.06, 0.25, 0.7, 0.2)));
export const kick = () => SHARED.get('kick', () => drum('kick', 120, 50, 0.04, 0.17, 0.5, 0.05));

export const tambourine = () => SHARED.get('tamb', () => render_tambourine());
function render_tambourine() {
  const nz = new Noise(seedOf('tamb'));
  const bp = new Biquad('bp', 7800, 1.2);
  const hp = new Biquad('hp', 4500, 0.7);
  const zils = [[5210, 1], [6870, 0.8], [8330, 0.6], [9600, 0.4]];
  return done(gen(0.34, (t) => {
    let s = hp.process(bp.process(nz.white())) * ad(t, 0.003, 0.05) * 0.8;
    for (const [f, a] of zils) {
      s += 0.35 * a * Math.sin(TAU * f * t) * Math.exp(-t / 0.11) * (0.5 + 0.5 * Math.sin(TAU * (62 + f * 0.002) * t));
    }
    return s;
  }), { grit: 0.2 });
}
