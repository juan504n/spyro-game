// Gloaming Vale audio — building blocks shared by the sound-effect files. Pure DSP.
//
//   layer()        sum [buffer, atSec, gain] parts into one buffer;  lvl() scale a bed to a given RMS
//   sweep()        exponentially gliding oscillator (sine / tri / saw / pulse) with vibrato
//   noiseFilt()    noise through a swept state-variable filter (whooshes, hiss, rumble)
//   thump()        sine with a fast pitch drop (impacts, footfalls, boings' body)
//   ping(), bell() glassy struck partials (dings, chimes, clangs)
//   tinkles()      random glassy pings scattered in time (shards, sparkles)
//   ticks()        random very short filtered noise ticks (crackle, crunch, rustle)
//   vowel()        pitched source through parallel formant filters (oof, wail, growl)
//   loopNoise()    seamless looping noise bed (periodic table, two-pass filtering)
//   loopFinish()   seamless finishing for loops (DC removal, ADPCM over two passes, normalise)

import {
  SR, TAU, Osc, Noise, SVF, Biquad, RNG, samples, gen, barVoice, removeDC, normalizePeak, mtof,
} from './synth.js';
import { adpcm } from './spu.js';
import { note } from './composition.js';

/** Note name -> Hz (no day colouring: sfx use explicit names like 'A5'). */
export const hz = (name) => mtof(note(name, false));

export function layer(sec, parts) {
  const out = new Float32Array(samples(sec));
  for (const [b, t = 0, g = 1] of parts) {
    const off = Math.round(t * SR);
    const n = Math.min(b.length, out.length - off);
    for (let i = 0; i < n; i++) out[off + i] += b[i] * g;
  }
  return out;
}

/** Copy of `b` scaled to the given RMS (for continuous noise beds, so layer gains are comparable). */
export function lvl(b, rms = 0.2) {
  let s = 0;
  for (let i = 0; i < b.length; i++) s += b[i] * b[i];
  const g = s > 0 ? rms / Math.sqrt(s / b.length) : 0;
  const o = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) o[i] = b[i] * g;
  return o;
}

/**
 * Oscillator gliding exponentially f0 -> f1 (shape via `curve`: x^curve).
 * o: wave ('sine'|'tri'|'saw'|'pulse'), pw, env(t, x), vibHz, vibDepth, phase.
 */
export function sweep(sec, f0, f1, o = {}) {
  const { wave = 'sine', curve = 1, pw = 0.5, env = (t) => Math.exp(-t / (sec * 0.4)), vibHz = 0, vibDepth = 0, phase = 0 } = o;
  const osc = new Osc(phase);
  const ratio = f1 / f0;
  return gen(sec, (t) => {
    const x = t / sec;
    let f = f0 * Math.pow(ratio, Math.pow(x, curve));
    if (vibHz) f *= 1 + vibDepth * Math.sin(TAU * vibHz * t);
    const v = wave === 'sine' ? osc.sine(f) : wave === 'tri' ? osc.tri(f) : wave === 'saw' ? osc.saw(f) : osc.pulse(f, pw);
    return v * env(t, x);
  });
}

/** Noise -> SVF (mode bp|lp|hp) with the cutoff gliding f0 -> f1. colour: white|pink|brown. */
export function noiseFilt(sec, seed, o = {}) {
  const { mode = 'bp', f0 = 1000, f1 = f0, q = 1, curve = 1, env = () => 1, colour = 'white' } = o;
  const nz = new Noise(seed);
  const f = new SVF();
  const ratio = f1 / f0;
  return gen(sec, (t, i) => {
    if ((i & 7) === 0) f.setup(f0 * Math.pow(ratio, Math.pow(t / sec, curve)), q);
    const w = colour === 'pink' ? nz.pink() : colour === 'brown' ? nz.brown() : nz.white();
    f.tick(w);
    return (mode === 'bp' ? f.bp : mode === 'hp' ? f.hp : f.lp) * env(t, t / sec);
  });
}

/** Sine thump: frequency falls f0 -> f1 with time constant tauP, amplitude decays with tauA. */
export function thump(sec, f0, f1, tauP, tauA, atk = 0.002) {
  let ph = 0;
  return gen(sec, (t) => {
    ph += (f1 + (f0 - f1) * Math.exp(-t / tauP)) / SR;
    return Math.sin(TAU * ph) * Math.exp(-t / tauA) * Math.min(1, t / atk);
  });
}

/** A sine "ping" with a fast attack and exponential decay; optional 2nd-partial (ratio h2r) and glide. */
export function ping(freq, sec, tau, o = {}) {
  const { h2 = 0, h2r = 2.76, atk = 0.0015, glide = 0 } = o;
  let ph = 0;
  return gen(sec, (t) => {
    const f = freq * (1 + glide * Math.exp(-t / 0.03));
    ph += f / SR;
    let s = Math.sin(TAU * ph);
    if (h2) s += h2 * Math.sin(TAU * ph * h2r) * Math.exp(-t / (tau * 0.4));
    return s * Math.exp(-t / tau) * Math.min(1, t / atk);
  });
}

/** Inharmonic glassy bell; bright scales the upper partials. */
export function bell(freq, sec, tau = 0.4, bright = 1, atk = 0.0015) {
  return barVoice(freq, sec, [[1, 1, tau], [2.76, 0.5 * bright, tau * 0.55], [5.4, 0.28 * bright, tau * 0.3], [8.93, 0.12 * bright, tau * 0.15]], { attack: atk });
}

/** `count` glassy pings at random times in [0, tMax], pitches log-uniform in [fLo, fHi]. */
export function tinkles(sec, seed, count, fLo, fHi, o = {}) {
  const { tauLo = 0.04, tauHi = 0.12, tMax = sec * 0.8, gain = 1, decayGain = 0 } = o;
  const r = new RNG(seed);
  const out = new Float32Array(samples(sec));
  for (let k = 0; k < count; k++) {
    const t = r.range(0, tMax);
    const f = fLo * Math.pow(fHi / fLo, r.next());
    const tau = r.range(tauLo, tauHi);
    const b = barVoice(f, Math.min(sec - t, tau * 5), [[1, 1, tau], [2.76, 0.4, tau * 0.5]], { attack: 0.0008 });
    const off = Math.round(t * SR);
    const g = gain * r.range(0.4, 1) * (1 - decayGain * (t / sec));
    for (let i = 0; i < b.length && off + i < out.length; i++) out[off + i] += b[i] * g;
  }
  return out;
}

/** `count` short band-passed noise ticks at random times (crackle / crunch / rustle). */
export function ticks(sec, seed, count, fLo, fHi, o = {}) {
  const { lenLo = 0.003, lenHi = 0.012, tMin = 0, tMax = sec * 0.9, gain = 1, q = 1.5 } = o;
  const r = new RNG(seed);
  const out = new Float32Array(samples(sec));
  for (let k = 0; k < count; k++) {
    const t = r.range(tMin, tMax);
    const len = samples(r.range(lenLo, lenHi));
    const f = new SVF();
    f.setup(fLo * Math.pow(fHi / fLo, r.next()), q);
    const g = gain * r.range(0.35, 1);
    const off = Math.round(t * SR);
    for (let i = 0; i < len && off + i < out.length; i++) {
      f.tick(r.bi());
      out[off + i] += f.bp * g * Math.exp((-4 * i) / len);
    }
  }
  return out;
}

/**
 * Voiced sound through parallel formant band-passes.
 * f0(t, x) -> Hz; formants: [[centreHz | fn(x), q, gain], ...]; env(t, x); src 'saw' | 'pulse' | 'tri'.
 */
export function vowel(sec, f0, formants, o = {}) {
  const { src = 'saw', env = (t) => Math.exp(-t / (sec * 0.5)), breath = 0.04, seed = 5, raw = 0.12, pw = 0.35 } = o;
  const osc = new Osc();
  const nz = new Noise(seed);
  const filts = formants.map(() => new SVF());
  const rawLp = new Biquad('lp', 1200, 0.7071);
  return gen(sec, (t, i) => {
    const x = t / sec;
    const f = f0(t, x);
    const s = src === 'saw' ? osc.saw(f) : src === 'tri' ? osc.tri(f) : osc.pulse(f, pw);
    const inp = s + nz.white() * breath;
    let y = rawLp.process(inp) * raw;
    for (let k = 0; k < filts.length; k++) {
      const [fc, q, g] = formants[k];
      if ((i & 15) === 0) filts[k].setup(typeof fc === 'function' ? fc(x) : fc, q);
      filts[k].tick(inp);
      y += filts[k].bp * g;
    }
    return y * env(t, x);
  });
}

/**
 * Creaking wood / hinge: a saw whose pitch and level are re-drawn at random "stick-slip" intervals,
 * band-passed. f0 -> f1 is the average pitch drift; o.env(t, x) shapes the level.
 */
export function creak(sec, f0, f1, seed, o = {}) {
  const { q = 5, bpF = 800, jitter = 0.18, rate = 70, env = (t, x) => Math.pow(Math.sin(Math.PI * x), 0.7) } = o;
  const r = new RNG(seed);
  const osc = new Osc();
  const f = new SVF();
  let fj = 1;
  let am = 1;
  let next = 0;
  return gen(sec, (t, i) => {
    const x = t / sec;
    if (t >= next) {
      fj = 1 + jitter * r.bi();
      am = 0.55 + 0.45 * r.next();
      next = t + (1 / rate) * (0.6 + 0.8 * r.next());
    }
    if ((i & 15) === 0) f.setup(bpF * (0.85 + 0.3 * fj), q);
    f.tick(osc.saw((f0 + (f1 - f0) * x) * fj));
    return f.bp * am * env(t, x);
  });
}

// ---------------------------------------------------------------------------------------------
// Seamless loops
// ---------------------------------------------------------------------------------------------
const lfoOf = (list, x) => {
  if (!list.length) return 0.5;
  let v = 0;
  let w = 0;
  for (const [cyc, dep, ph] of list) {
    v += dep * Math.sin(TAU * (cyc * x + ph));
    w += dep;
  }
  return 0.5 + (0.5 * v) / w;
};
export { lfoOf };

/**
 * Looping noise bed. One white-noise table of exactly one loop is used periodically; the filters are
 * warmed up on the loop's own last 0.4 s before sample 0, so every filter is in steady state at the seam. cut / amp are lists of
 * [cyclesPerLoop, depth, phase] low-frequency modulators (integer cycles => periodic).
 */
export function loopNoise(sec, seed, o = {}) {
  const { colour = 'white', mode = 'bp', f0 = 800, fMod = 0, q = 0.7, cut = [], amp = [], floor = 1, lp2 = 0, hp2 = 0 } = o;
  const n = samples(sec);
  const r = new RNG(seed);
  const table = new Float32Array(n);
  for (let i = 0; i < n; i++) table[i] = r.bi();
  const nz = new Noise(seed + 1);
  const f = new SVF();
  const lpF = lp2 ? new Biquad('lp', lp2, 0.7071) : null;
  const hpF = hp2 ? new Biquad('hp', hp2, 0.7071) : null;
  const out = new Float32Array(n);
  const pre = Math.min(n, Math.round(0.4 * SR)); // warm-up: replay the loop's own last 0.4 s before the start
  let a = 1;
  for (let i = -pre; i < n; i++) {
    const j = i < 0 ? i + n : i;
    if ((i & 7) === 0) {
      const x = j / n;
      a = floor + (1 - floor) * lfoOf(amp, x);
      f.setup(f0 + fMod * lfoOf(cut, x), q);
    }
    let w = table[j];
    if (colour === 'pink') w = nz.pinkFrom(w);
    else if (colour === 'brown') w = nz.brownFrom(w);
    f.tick(w);
    let y = mode === 'bp' ? f.bp : mode === 'hp' ? f.hp : f.lp;
    if (lpF) y = lpF.process(y);
    if (hpF) y = hpF.process(y);
    if (i >= 0) out[i] = y * a;
  }
  return out;
}

/** Add events to a loop buffer with wrap-around: parts = [[buffer, atSec, gain], ...]. */
export function loopLayer(base, parts) {
  const N = base.length;
  for (const [b, t, g = 1] of parts) {
    let k = Math.round(t * SR) % N;
    for (let i = 0; i < b.length; i++) {
      base[k] += b[i] * g;
      if (++k === N) k = 0;
    }
  }
  return base;
}

/** Finish a loop without touching its seam: mean removal, ADPCM grit over two passes, peak normalise. */
export function loopFinish(buf, peakDb = -3, grit = 0.25) {
  let y = Float32Array.from(buf);
  removeDC(y);
  if (grit > 0) {
    const two = new Float32Array(y.length * 2);
    two.set(y);
    two.set(y, y.length);
    y = adpcm(two, grit).subarray(y.length).slice();
  }
  normalizePeak(y, peakDb);
  return y;
}
