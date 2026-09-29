// Gloaming Vale audio — ambience beds. Pure DSP (Node + browser).
//
// Two seamless 11.0 s stereo loops that crossfade with the day/night cycle:
//   amb_dusk  soft low wind, a small chorus of crickets, a few distant wind-chime glints
//   amb_day   lighter breezy wind, birdsong phrases (tweet / trill / two-note / warble), leaf rustle
//
// Seamlessness is built in, not patched on:
//   - noise sources are PERIODIC (one white-noise table of exactly one loop, tiled twice);
//   - every time-varying control (gusts, rustle swells, cricket activity) uses an integer number
//     of cycles per loop;
//   - filtered layers are warmed up on the loop's own last second before sample 0 (a pre-roll), so
//     the filter state at the loop start equals the state at the loop end;
//   - discrete events (chirps, chimes, birds) are mixed with wrap-around, so their tails run over
//     the loop point onto the start.

import {
  SR, TAU, RNG, SVF, Biquad, seedOf, mixWrap, removeDC, rmsOf, peakOf, dbToLin, gen,
} from './synth.js';
import * as I from './instruments.js';
import { note } from './composition.js';

export const AMB_SECONDS = 11;
const AN = Math.round(AMB_SECONDS * SR);
const AMB_TARGET_DB = -26; // PCM RMS; the beds sit far under the -14 dB music
const PRE = SR; // filter warm-up: replay the loop's own last second before sample 0

function panGains(pan) {
  return [Math.cos(((pan + 1) * Math.PI) / 4), Math.sin(((pan + 1) * Math.PI) / 4)];
}

/** Add a mono event into a stereo circular pair with wrap-around. */
function placeWrap(L, R, s, tSec, gain, pan) {
  const [gl, gr] = panGains(pan);
  const off = Math.round(tSec * SR);
  mixWrap(L, s, off, gain * gl);
  mixWrap(R, s, off, gain * gr);
}

/** Filter a circular buffer without a seam: run the filter over two passes, keep the second. */
function circFilter(buf, filt) {
  const n = buf.length;
  const out = new Float32Array(n);
  for (let i = 0; i < 2 * n; i++) {
    const y = filt(buf[i % n]);
    if (i >= n) out[i - n] = y;
  }
  return out;
}

/** Wind: periodic white noise -> gusting SVF band + low-pass, decorrelated L/R. */
function* windBed(seed, p) {
  const out = [new Float32Array(AN), new Float32Array(AN)];
  for (let c = 0; c < 2; c++) {
    yield;
    const r = new RNG(seed + c * 977);
    const noise = new Float32Array(AN);
    for (let i = 0; i < AN; i++) noise[i] = r.bi();
    const f1 = new SVF();
    const top = new Biquad('lp', p.top, 0.7071);
    const phA = r.next();
    const phB = r.next();
    let sq = 0;
    let g = 0;
    for (let i = -PRE; i < AN; i++) {
      const j = i < 0 ? i + AN : i;
      if ((i & 15) === 0) { // control rate: every 16 samples
        g = 0.5 + 0.5 * (0.62 * Math.sin(TAU * (p.gustA * (j / AN) + phA)) + 0.38 * Math.sin(TAU * (p.gustB * (j / AN) + phB)));
        f1.setup(p.f0 + p.fMod * g, p.q);
      }
      f1.tick(noise[j]);
      const y = top.process(f1.bp * 0.8 + f1.lp * 0.35) * (p.floor + (1 - p.floor) * g);
      if (i >= 0) {
        out[c][i] = y;
        sq += y * y;
      }
    }
    const k = p.level / Math.sqrt(sq / AN);
    for (let i = 0; i < AN; i++) out[c][i] *= k;
  }
  return out;
}

/** One cricket chirp: a burst of `pulses` short sine pulses. */
function cricketChirp(f, pulses = 3) {
  const spacing = 0.05;
  return gen(spacing * pulses + 0.02, (t) => {
    let s = 0;
    for (let k = 0; k < pulses; k++) {
      const x = (t - k * spacing) / 0.024;
      if (x > 0 && x < 1) s += Math.sin(TAU * f * t) * Math.sin(Math.PI * x) ** 2;
    }
    return s;
  });
}

function birdCall(kind, f, seed) {
  const r = new RNG(seed);
  const withHarm = (ph) => Math.sin(ph) + 0.15 * Math.sin(2 * ph);
  switch (kind) {
    case 'tweet': {
      let ph = 0;
      return gen(0.17, (t) => {
        const x = t / 0.17;
        const m = x < 0.7 ? 0.75 + 0.45 * Math.pow(x / 0.7, 0.7) : 1.2 - 0.25 * ((x - 0.7) / 0.3);
        ph += (TAU * f * m) / SR;
        return withHarm(ph) * Math.pow(Math.sin(Math.PI * x), 0.6);
      });
    }
    case 'trill': {
      let ph = 0;
      return gen(0.34, (t) => {
        const k = Math.floor(t / 0.04);
        const x = (t - k * 0.04) / 0.028;
        ph += (TAU * f * (k % 2 ? 1.22 : 1)) / SR;
        return x < 1 ? withHarm(ph) * Math.sin(Math.PI * x) * (1 - t / 0.5) : 0;
      });
    }
    case 'twonote': {
      let ph = 0;
      return gen(0.34, (t) => {
        let fr, a;
        if (t < 0.09) { fr = f * (0.95 + 0.1 * (t / 0.09)); a = Math.sin(Math.PI * (t / 0.09)); }
        else if (t > 0.12 && t < 0.28) {
          const x = (t - 0.12) / 0.16;
          fr = f * (0.78 - 0.08 * x) * (1 + 0.015 * Math.sin(TAU * 28 * t));
          a = Math.sin(Math.PI * x);
        } else { fr = f; a = 0; }
        ph += (TAU * fr) / SR;
        return withHarm(ph) * a;
      });
    }
    default: { // warble
      let ph = 0;
      const dep = 0.05 + r.range(0, 0.03);
      return gen(0.3, (t) => {
        const x = t / 0.3;
        ph += (TAU * f * (1 + dep * Math.sin(TAU * 52 * t))) / SR;
        return withHarm(ph) * Math.pow(Math.sin(Math.PI * x), 0.5);
      });
    }
  }
}

function finish(L, R) {
  removeDC(L);
  removeDC(R);
  const rms = Math.sqrt((rmsOf(L) ** 2 + rmsOf(R) ** 2) / 2);
  let g = dbToLin(AMB_TARGET_DB) / rms;
  const pk = Math.max(peakOf(L), peakOf(R)) * g;
  if (pk > dbToLin(-6)) g *= dbToLin(-6) / pk;
  for (let i = 0; i < AN; i++) { L[i] *= g; R[i] *= g; }
  return { L, R };
}

// ---------------------------------------------------------------------------------------------
function* buildDusk() {
  const r = new RNG(seedOf('amb_dusk'));
  const [wl, wr] = yield* windBed(seedOf('duskwind'), { f0: 240, fMod: 460, q: 0.8, top: 2400, gustA: 1, gustB: 3, floor: 0.4, level: 0.1 });
  const L = Float32Array.from(wl);
  const R = Float32Array.from(wr);
  // crickets: three voices whose chirp periods divide the loop exactly
  const crickets = [[4350, 17, -0.55, 0.0], [4720, 19, 0.15, 0.3], [5150, 13, 0.6, 0.7]];
  for (const [f, count, pan, ph] of crickets) {
    const period = AMB_SECONDS / count;
    const chirp = cricketChirp(f, 3);
    for (let k = 0; k < count; k++) {
      const t = k * period + ph * period;
      const act = 0.55 + 0.45 * Math.sin(TAU * (2 * (t / AMB_SECONDS) + ph));
      placeWrap(L, R, chirp, t, 0.035 * act * (0.85 + 0.3 * r.next()), pan);
    }
  }
  yield;
  // distant wind chimes (dorian-safe notes), low-passed so they read as far away
  const cl = new Float32Array(AN);
  const cr = new Float32Array(AN);
  const glints = [[1.3, 'A5', 0.8, -0.5], [3.6, 'E6', 0.6, 0.4], [4.1, 'D6', 0.7, 0.2], [6.9, 'A6', 0.5, 0.6], [8.4, 'G6', 0.65, -0.3], [9.7, 'B5', 0.7, -0.6]];
  for (const [t, nm, v, pan] of glints) placeWrap(cl, cr, I.chime(note(nm, false)), t, 0.05 * v, pan);
  const lpA = new Biquad('lp', 3800, 0.7071);
  const lpB = new Biquad('lp', 3800, 0.7071);
  const fl = circFilter(cl, (x) => lpA.process(x));
  const fr = circFilter(cr, (x) => lpB.process(x));
  for (let i = 0; i < AN; i++) { L[i] += fl[i]; R[i] += fr[i]; }
  return finish(L, R);
}

function* buildDay() {
  const [wl, wr] = yield* windBed(seedOf('daywind'), { f0: 420, fMod: 900, q: 0.7, top: 3600, gustA: 2, gustB: 5, floor: 0.3, level: 0.07 });
  const L = Float32Array.from(wl);
  const R = Float32Array.from(wr);
  yield;
  // birdsong: phrases of 1-3 calls of one species at irregular times
  const phrases = [
    [0.6, 'tweet', 3300, 3, 0.3, -0.6], [2.2, 'trill', 3700, 1, 0, 0.5], [3.7, 'twonote', 3900, 2, 0.5, 0.2],
    [5.3, 'warble', 3100, 1, 0, -0.3], [6.4, 'tweet', 3600, 2, 0.28, 0.7], [8.1, 'twonote', 3500, 3, 0.45, -0.4],
    [9.5, 'trill', 4000, 1, 0, 0.3],
  ];
  let idx = 0;
  for (const [t0, kind, f, count, gap, pan] of phrases) {
    for (let k = 0; k < count; k++) {
      const call = birdCall(kind, f * (1 + 0.04 * k), seedOf('bird' + idx++));
      placeWrap(L, R, call, t0 + k * gap, 0.05 * (1 - 0.15 * k), pan);
    }
  }
  yield;
  // leaf rustle: periodic noise, high-passed/band-passed, gated by three soft swells
  const rl = new Float32Array(AN);
  const rr = new Float32Array(AN);
  const swells = [[1.9, 0.7], [5.05, 0.9], [8.6, 0.6]];
  for (let c = 0; c < 2; c++) {
    yield;
    const nr = new RNG(seedOf('rustle' + c));
    const noise = new Float32Array(AN);
    for (let i = 0; i < AN; i++) noise[i] = nr.bi();
    const hp = new Biquad('hp', 1800, 0.7071);
    const bp = new Biquad('bp', 4200, 0.6);
    const dst = c ? rr : rl;
    let gate = 0;
    for (let i = -PRE; i < AN; i++) {
      const j = i < 0 ? i + AN : i;
      if ((i & 7) === 0) { // control rate: every 8 samples
        const t = (j / SR) / AMB_SECONDS;
        let env = 0;
        for (const [ts, w] of swells) {
          let d = Math.abs(j / SR - ts);
          d = Math.min(d, AMB_SECONDS - d);
          if (d < w) env += 0.5 + 0.5 * Math.cos((Math.PI * d) / w);
        }
        gate = env * (0.6 + 0.4 * Math.sin(TAU * (37 * t) + 6 * Math.sin(TAU * 11 * t)));
      }
      const y = (hp.process(noise[j]) * 0.5 + bp.process(noise[j]) * 0.5) * gate;
      if (i >= 0) dst[i] = y * 0.035;
    }
  }
  for (let i = 0; i < AN; i++) { L[i] += rl[i]; R[i] += rr[i]; }
  return finish(L, R);
}

function drain(g) {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
export const ambDusk = () => drain(buildDusk());
export const ambDay = () => drain(buildDay());

/** Render jobs (generators: the runtime can yield to the browser between steps). */
export function ambienceJobs(out) {
  return [
    { name: 'amb_dusk', weight: 2, run: function* () { out.amb_dusk = yield* buildDusk(); } },
    { name: 'amb_day', weight: 2, run: function* () { out.amb_day = yield* buildDay(); } },
  ];
}
