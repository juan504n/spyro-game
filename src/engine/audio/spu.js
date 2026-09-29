// Gloaming Vale audio — "PlayStation SPU" colouring. Pure DSP, no DOM / WebAudio.
//
// The SPU (Sound Processing Unit) gave 90s console music three signature traits, all recreated here:
//   1. 4-bit ADPCM samples. Every instrument and effect was stored as 28-sample blocks of 4-bit
//      residuals with one of five fixed predictors and a per-block range. Quantisation noise
//      therefore follows the signal level: a grainy, slightly crunchy, "digital-tape" texture.
//      adpcm() below is a genuine encode/decode round trip of that scheme (5 filters, 13 ranges).
//   2. A gentle high-cut (Gaussian interpolation + 22 kHz-class sample rates): lowpass at ~9.5 kHz.
//   3. The hardware reverb: a fixed network of two "same-side" and two "different-side"
//      damped feedback reflections (left/right, cross-coupled), four early-echo taps per side,
//      and two all-pass diffusers. SPUReverb follows exactly that topology with delay lengths
//      chosen by ear (they are ours, not copied from any game's preset table).
//
// Also here: a linked stereo bus compressor (loudness glue for the music mix) and finalizeSfx(),
// the standard "make this one-shot behave" chain (DC removal, high-cut, grit, click-free edges).

import {
  SR, dbToLin, Biquad, removeDC, fadeEdges, normalizePeak, holdDown, rmsOf,
} from './synth.js';

// ---------------------------------------------------------------------------------------------
// ADPCM grit
// ---------------------------------------------------------------------------------------------
// Predictor coefficients (k1, k2) / 64 for filters 0..4 — the standard SPU-ADPCM set:
//   0: (0, 0)   1: (60, 0)   2: (115, -52)   3: (98, -55)   4: (122, -60)
const K1 = [0, 0.9375, 1.796875, 1.53125, 1.90625];
const K2 = [0, 0, -0.8125, -0.859375, -0.9375];

/**
 * Run `buf` (floats in -1..1) through 4-bit ADPCM encode+decode and return the decoded signal.
 * `amount` 0..1 blends the *quantisation error* back in (1 = full PlayStation crunch).
 * With inPlace = true the input array is overwritten and returned (no allocation).
 */
export function adpcm(buf, amount = 1, inPlace = false) {
  const n = buf.length;
  const out = inPlace ? buf : new Float32Array(n);
  let h1 = 0;
  let h2 = 0; // decoder history (int16 scale)
  let o1 = 0;
  let o2 = 0; // original samples just before the block (int16 scale) for filter selection
  for (let b = 0; b < n; b += 28) {
    const m = Math.min(28, n - b);
    // 1. pick the predictor with the smallest open-loop residual (all five in one pass)
    let m0 = 0, m1 = 0, m2 = 0, m3 = 0, m4 = 0;
    let p1 = o1;
    let p2 = o2;
    for (let i = 0; i < m; i++) {
      const x = buf[b + i] * 32768;
      let r = x < 0 ? -x : x;
      if (r > m0) m0 = r;
      r = x - 0.9375 * p1; r = r < 0 ? -r : r;
      if (r > m1) m1 = r;
      r = x - 1.796875 * p1 + 0.8125 * p2; r = r < 0 ? -r : r;
      if (r > m2) m2 = r;
      r = x - 1.53125 * p1 + 0.859375 * p2; r = r < 0 ? -r : r;
      if (r > m3) m3 = r;
      r = x - 1.90625 * p1 + 0.9375 * p2; r = r < 0 ? -r : r;
      if (r > m4) m4 = r;
      p2 = p1;
      p1 = x;
    }
    const ends1 = p1;
    const ends2 = p2;
    let bestF = 0;
    let bestMax = m0;
    if (m1 < bestMax) { bestMax = m1; bestF = 1; }
    if (m2 < bestMax) { bestMax = m2; bestF = 2; }
    if (m3 < bestMax) { bestMax = m3; bestF = 3; }
    if (m4 < bestMax) { bestMax = m4; bestF = 4; }
    // 2. range: smallest power-of-two step whose 4-bit span (-8..7) covers the residual
    let k = 0;
    while (k < 12 && 7 * (1 << k) < bestMax) k++;
    const step = 1 << k;
    const inv = 1 / step;
    const c1 = K1[bestF];
    const c2 = K2[bestF];
    // 3. closed-loop quantise (the encoder tracks the decoder so error does not accumulate)
    for (let i = 0; i < m; i++) {
      const src = buf[b + i];
      const pred = c1 * h1 + c2 * h2;
      let q = Math.round((src * 32768 - pred) * inv);
      q = q < -8 ? -8 : q > 7 ? 7 : q;
      let rec = pred + q * step;
      rec = rec < -32768 ? -32768 : rec > 32767 ? 32767 : rec;
      h2 = h1;
      h1 = rec;
      out[b + i] = src + amount * (rec * (1 / 32768) - src);
    }
    o1 = ends1;
    o2 = ends2;
  }
  return out;
}

/** Soft tanh saturation, level-preserving at small signals. */
export function saturate(buf, drive = 1.5) {
  const k = 1 / Math.tanh(drive);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive) * k;
  return buf;
}

// ---------------------------------------------------------------------------------------------
// SPU-style reverb
// ---------------------------------------------------------------------------------------------
// Delay lengths are in samples at 22050 Hz. wall = feedback per pass, iir = damping (one-pole
// coefficient; smaller = darker tail). taps: 2 from the "same" ring, 2 from the "diff" ring.
export const REVERB_PRESETS = {
  // long, lush hall used for the music and the big stingers (RT60 about 2.4 s, dark tail)
  hall: {
    same: [1327, 1451], diff: [1093, 1187], wall: 0.835, iir: 0.68, lin: 0.55, rin: 0.55,
    tapsL: [[211, 0.4], [853, 0.3], [467, 0.34], [1021, 0.28]],
    tapsR: [[233, 0.4], [911, 0.3], [503, 0.34], [1069, 0.28]],
    apf1: [439, 467], apf2: [173, 191], g1: 0.55, g2: 0.5, lout: 1,
  },
  // bigger stone chamber for chimes and lanterns (RT60 about 1.1 s)
  chamber: {
    same: [757, 821], diff: [619, 683], wall: 0.79, iir: 0.72, lin: 0.6, rin: 0.6,
    tapsL: [[97, 0.42], [443, 0.3], [251, 0.34], [577, 0.28]],
    tapsR: [[109, 0.42], [479, 0.3], [277, 0.34], [601, 0.28]],
    apf1: [263, 281], apf2: [97, 107], g1: 0.55, g2: 0.5, lout: 1,
  },
  // small wooden room (RT60 about 0.3 s) — just enough air for glassy one-shots
  room: {
    same: [331, 367], diff: [283, 311], wall: 0.7, iir: 0.75, lin: 0.6, rin: 0.6,
    tapsL: [[61, 0.45], [197, 0.3], [113, 0.35], [251, 0.28]],
    tapsR: [[67, 0.45], [211, 0.3], [127, 0.35], [263, 0.28]],
    apf1: [113, 127], apf2: [41, 47], g1: 0.5, g2: 0.5, lout: 1,
  },
};

export class SPUReverb {
  constructor(preset = REVERB_PRESETS.hall) {
    this.p = preset;
    this.sL = new Float32Array(preset.same[0]);
    this.sR = new Float32Array(preset.same[1]);
    this.dL = new Float32Array(preset.diff[0]);
    this.dR = new Float32Array(preset.diff[1]);
    this.a1L = new Float32Array(preset.apf1[0]);
    this.a1R = new Float32Array(preset.apf1[1]);
    this.a2L = new Float32Array(preset.apf2[0]);
    this.a2R = new Float32Array(preset.apf2[1]);
    this.ws = [0, 0, 0, 0, 0, 0, 0, 0]; // write heads: sL sR dL dR a1L a1R a2L a2R
    this.y = [0, 0, 0, 0]; // one-pole memories: sL sR dL dR
  }

  /** Process samples [start, end) from (inL, inR) into (outL, outR) (overwrites, wet only). */
  process(inL, inR, outL, outR, start = 0, end = inL.length) {
    const P = this.p;
    const { sL, sR, dL, dR, a1L, a1R, a2L, a2R, ws } = this;
    const nsL = sL.length, nsR = sR.length, ndL = dL.length, ndR = dR.length;
    const n1L = a1L.length, n1R = a1R.length, n2L = a2L.length, n2R = a2R.length;
    const wall = P.wall, iir = P.iir, lin = P.lin, rin = P.rin, lout = P.lout, g1 = P.g1, g2 = P.g2;
    const [tl0, tl1, tl2, tl3] = P.tapsL;
    const [tr0, tr1, tr2, tr3] = P.tapsR;
    let wsL = ws[0], wsR = ws[1], wdL = ws[2], wdR = ws[3];
    let w1L = ws[4], w1R = ws[5], w2L = ws[6], w2R = ws[7];
    let ysL = this.y[0], ysR = this.y[1], ydL = this.y[2], ydR = this.y[3];
    for (let i = start; i < end; i++) {
      const l = inL[i] * lin;
      const r = inR[i] * rin;
      // reflections: damped feedback, same side and cross-coupled different side
      ysL += iir * (l + wall * sL[wsL] - ysL);
      ysR += iir * (r + wall * sR[wsR] - ysR);
      ydL += iir * (l + wall * dR[wdR] - ydL);
      ydR += iir * (r + wall * dL[wdL] - ydR);
      sL[wsL] = ysL;
      sR[wsR] = ysR;
      dL[wdL] = ydL;
      dR[wdR] = ydR;
      // early-echo taps (delay measured from the sample just written)
      let k;
      k = wsL - tl0[0]; if (k < 0) k += nsL;
      let oL = tl0[1] * sL[k];
      k = wsL - tl1[0]; if (k < 0) k += nsL;
      oL += tl1[1] * sL[k];
      k = wdL - tl2[0]; if (k < 0) k += ndL;
      oL += tl2[1] * dL[k];
      k = wdL - tl3[0]; if (k < 0) k += ndL;
      oL += tl3[1] * dL[k];
      k = wsR - tr0[0]; if (k < 0) k += nsR;
      let oR = tr0[1] * sR[k];
      k = wsR - tr1[0]; if (k < 0) k += nsR;
      oR += tr1[1] * sR[k];
      k = wdR - tr2[0]; if (k < 0) k += ndR;
      oR += tr2[1] * dR[k];
      k = wdR - tr3[0]; if (k < 0) k += ndR;
      oR += tr3[1] * dR[k];
      // two all-pass diffusers per side: y = x - g*d ; store y ; out = g*y + d
      let d = a1L[w1L];
      let y = oL - g1 * d;
      a1L[w1L] = y;
      oL = g1 * y + d;
      d = a2L[w2L];
      y = oL - g2 * d;
      a2L[w2L] = y;
      oL = g2 * y + d;
      d = a1R[w1R];
      y = oR - g1 * d;
      a1R[w1R] = y;
      oR = g1 * y + d;
      d = a2R[w2R];
      y = oR - g2 * d;
      a2R[w2R] = y;
      oR = g2 * y + d;
      outL[i] = oL * lout;
      outR[i] = oR * lout;
      if (++wsL === nsL) wsL = 0;
      if (++wsR === nsR) wsR = 0;
      if (++wdL === ndL) wdL = 0;
      if (++wdR === ndR) wdR = 0;
      if (++w1L === n1L) w1L = 0;
      if (++w1R === n1R) w1R = 0;
      if (++w2L === n2L) w2L = 0;
      if (++w2R === n2R) w2R = 0;
    }
    ws[0] = wsL; ws[1] = wsR; ws[2] = wdL; ws[3] = wdR;
    ws[4] = w1L; ws[5] = w1R; ws[6] = w2L; ws[7] = w2R;
    this.y[0] = ysL; this.y[1] = ysR; this.y[2] = ydL; this.y[3] = ydR;
  }
}

/**
 * Add reverb to a mono buffer. `wet` is the wet-to-dry RMS ratio (calibrated, so presets are
 * interchangeable), `tail` seconds are appended so the decay is not cut off. Returns mono.
 */
export function reverbMono(buf, presetName = 'room', wet = 0.4, tail = 0.5) {
  const n = buf.length + Math.round(tail * SR);
  const inp = new Float32Array(n);
  inp.set(buf);
  const wl = new Float32Array(n);
  const wr = new Float32Array(n);
  new SPUReverb(REVERB_PRESETS[presetName]).process(inp, inp, wl, wr);
  const dryRms = rmsOf(buf);
  let wetRms = 0;
  for (let i = 0; i < n; i++) wetRms += (wl[i] + wr[i]) * (wl[i] + wr[i]) * 0.25;
  wetRms = Math.sqrt(wetRms / n);
  const g = wetRms > 1e-9 ? (dryRms * wet) / wetRms : 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = inp[i] + (wl[i] + wr[i]) * 0.5 * g;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Bus compressor (stereo linked, feed-forward, peak detector) — glue for the music mix
// ---------------------------------------------------------------------------------------------
export function compressStereo(L, R, o = {}) {
  const thrDb = o.thresholdDb ?? -22;
  const ratio = o.ratio ?? 3;
  const at = Math.exp(-1 / ((o.attack ?? 0.006) * SR));
  const rt = Math.exp(-1 / ((o.release ?? 0.16) * SR));
  const makeup = dbToLin(o.makeupDb ?? 0);
  const thr = dbToLin(thrDb);
  const ex = 1 / ratio - 1;
  let env = 0;
  let g = makeup;
  for (let i = 0; i < L.length; i++) {
    const l = L[i] < 0 ? -L[i] : L[i];
    const r = R[i] < 0 ? -R[i] : R[i];
    const a = l > r ? l : r;
    env = a > env ? at * env + (1 - at) * a : rt * env + (1 - rt) * a;
    if ((i & 3) === 0) g = env > thr ? Math.pow(env / thr, ex) * makeup : makeup; // gain moves slowly: 4-sample hold
    L[i] *= g;
    R[i] *= g;
  }
}

// ---------------------------------------------------------------------------------------------
// The standard one-shot finishing chain
// ---------------------------------------------------------------------------------------------
/**
 * DC removal -> gentle 9.5 kHz high-cut -> ADPCM grit -> optional sample-rate hold ->
 * 2 ms raised-cosine fades -> peak normalise. CONSUMES its input (works in place, returns it).
 * opts: peakDb (-2), grit (0.4), lp (9500), hold (0 = off, else rate in Hz), fadeIn/fadeOut (ms)
 */
export function finalizeSfx(buf, opts = {}) {
  const { peakDb = -2, grit = 0.4, lp = 9500, hold = 0, fadeIn = 2, fadeOut = 2 } = opts;
  let y = buf; // consumed in place: callers pass a freshly rendered buffer
  removeDC(y);
  if (lp > 0 && lp < SR * 0.48) {
    const f = new Biquad('lp', lp, 0.7071);
    const { b0, b1, b2, a1, a2 } = f;
    let z1 = 0;
    let z2 = 0;
    for (let i = 0; i < y.length; i++) {
      const x = y[i];
      const o = b0 * x + z1;
      z1 = b1 * x - a1 * o + z2;
      z2 = b2 * x - a2 * o;
      y[i] = o;
    }
  }
  if (grit > 0) adpcm(y, grit, true);
  if (hold > 0) y = holdDown(y, hold);
  fadeEdges(y, fadeIn, fadeOut);
  normalizePeak(y, peakDb);
  return y;
}

/** Same chain for a stereo pair (shared gain so the image is preserved). */
export function finalizeStereo(L, R, opts = {}) {
  const { peakDb = -3, grit = 0.3, lp = 9500, fadeIn = 2, fadeOut = 2 } = opts;
  const out = [Float32Array.from(L), Float32Array.from(R)];
  let peak = 0;
  for (let c = 0; c < 2; c++) {
    removeDC(out[c]);
    if (lp > 0) {
      const f = new Biquad('lp', lp, 0.7071);
      for (let i = 0; i < out[c].length; i++) out[c][i] = f.process(out[c][i]);
    }
    if (grit > 0) out[c] = adpcm(out[c], grit);
    fadeEdges(out[c], fadeIn, fadeOut);
    for (let i = 0; i < out[c].length; i++) peak = Math.max(peak, Math.abs(out[c][i]));
  }
  const g = peak > 1e-9 ? dbToLin(peakDb) / peak : 1;
  for (let c = 0; c < 2; c++) for (let i = 0; i < out[c].length; i++) out[c][i] *= g;
  return out;
}

