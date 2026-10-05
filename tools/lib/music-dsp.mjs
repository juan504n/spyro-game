// Analysis helpers for the music tools (tools/music-sheet.mjs, tools/music-check.mjs): FFT, spectrogram images, chroma, pitch,
// decay times, onsets. Node only. Nothing here is used by the game.
import { writePNG } from '../png.mjs';
import { SR } from '../../src/engine/audio/synth.js';

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Mono mix of a { L, R } pair or a mono array. */
export function monoOf(x) {
  if (x instanceof Float32Array) return x;
  const m = new Float32Array(x.L.length);
  for (let i = 0; i < m.length; i++) m[i] = 0.5 * (x.L[i] + x.R[i]);
  return m;
}

/** Hann-windowed magnitude spectrum of x[start .. start + size). */
export function magSpectrum(x, start, size) {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const v = start + i < x.length && start + i >= 0 ? x[start + i] : 0;
    re[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  fft(re, im);
  const mag = new Float64Array(size / 2);
  for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

/** Spectrogram image (log frequency, 60 Hz - 10 kHz, dB colours) of a mono signal: returns { width, height, rgba }. */
export function spectrogramRGBA(x, { sr = SR, size = 2048, width = 1400, height = 300, floorDb = -80, fMin = 60, fMax = 10000 } = {}) {
  const hop = Math.max(1, Math.floor((x.length - size) / width));
  const cols = Math.min(width, Math.floor((x.length - size) / hop));
  const rgba = new Uint8ClampedArray(cols * height * 4);
  let ref = 1e-9;
  const spectra = [];
  for (let c = 0; c < cols; c++) {
    const mag = magSpectrum(x, c * hop, size);
    spectra.push(mag);
    for (let i = 1; i < mag.length; i++) ref = Math.max(ref, mag[i]);
  }
  const bin = (f) => (f * size) / sr;
  for (let c = 0; c < cols; c++) {
    const mag = spectra[c];
    for (let y = 0; y < height; y++) {
      const f = fMin * Math.pow(fMax / fMin, 1 - y / (height - 1));
      const b0 = bin(f * 0.985);
      const b1 = Math.max(b0 + 1, bin(f * 1.015));
      let m = 0;
      for (let b = Math.floor(b0); b < Math.min(mag.length, Math.ceil(b1)); b++) m = Math.max(m, mag[b]);
      const db = 20 * Math.log10(m / ref + 1e-9);
      const v = Math.max(0, Math.min(1, (db - floorDb) / -floorDb));
      const k = (y * cols + c) * 4;
      // dark blue -> violet -> orange -> pale yellow
      rgba[k] = 255 * Math.min(1, v * 1.8);
      rgba[k + 1] = 255 * Math.max(0, Math.min(1, (v - 0.45) * 2.2));
      rgba[k + 2] = 255 * (v < 0.5 ? 0.2 + v * 1.2 : Math.max(0, 1.3 - v * 1.6));
      rgba[k + 3] = 255;
    }
  }
  return { width: cols, height, rgba };
}

export function spectrogramPNG(file, x, o = {}) {
  const im = spectrogramRGBA(x, o);
  writePNG(file, im.width, im.height, im.rgba);
  return im;
}

/** Tiles ({ width, height, rgba }) laid out in a grid of `cols` columns with a 3 px gutter: one PNG to look at instead of many. */
export function montagePNG(file, tiles, cols = 3) {
  const w = Math.max(...tiles.map((t) => t.width));
  const h = Math.max(...tiles.map((t) => t.height));
  const rows = Math.ceil(tiles.length / cols);
  const W = cols * (w + 3);
  const H = rows * (h + 3);
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgba[i * 4] = 30; rgba[i * 4 + 1] = 30; rgba[i * 4 + 2] = 34; rgba[i * 4 + 3] = 255; }
  tiles.forEach((t, k) => {
    const ox = (k % cols) * (w + 3);
    const oy = Math.floor(k / cols) * (h + 3);
    for (let y = 0; y < t.height; y++) {
      for (let x = 0; x < t.width; x++) {
        const a = (y * t.width + x) * 4;
        const b = ((oy + y) * W + ox + x) * 4;
        rgba[b] = t.rgba[a]; rgba[b + 1] = t.rgba[a + 1]; rgba[b + 2] = t.rgba[a + 2]; rgba[b + 3] = 255;
      }
    }
  });
  writePNG(file, W, H, rgba);
}

/** The frequency (Hz) of the strongest spectral peak of x[start .. start+size), refined by parabolic interpolation. */
export function peakHz(x, start = 0, size = 8192, sr = SR, fMin = 30, fMax = 6000) {
  const mag = magSpectrum(x, start, size);
  let best = 0;
  let bi = 0;
  for (let i = Math.floor((fMin * size) / sr); i < Math.min(mag.length - 1, Math.ceil((fMax * size) / sr)); i++) {
    if (mag[i] > best) { best = mag[i]; bi = i; }
  }
  const a = mag[bi - 1], b = mag[bi], c = mag[bi + 1];
  const d = a - 2 * b + c;
  const off = d !== 0 ? (0.5 * (a - c)) / d : 0;
  return ((bi + off) * sr) / size;
}

export const midiOfHz = (f) => 69 + 12 * Math.log2(f / 440);

/** Fundamental (Hz) by normalised autocorrelation over x[start .. start+size): the first strong peak, so a voice whose strongest partial is a formant still reads as its pitch. */
export function f0Auto(x, start = 0, size = 8192, sr = SR, fMin = 40, fMax = 2000) {
  const n = size * 2;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < size; i++) re[i] = (start + i < x.length ? x[start + i] : 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  fft(re, im);
  for (let i = 0; i < n; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
  fft(re, im);                                              // (power spectrum -> autocorrelation, up to a scale and a mirror)
  const lo = Math.floor(sr / fMax);
  const hi = Math.min(size - 1, Math.floor(sr / fMin));
  let best = 0;
  for (let l = lo; l <= hi; l++) best = Math.max(best, re[l]);
  for (let l = lo + 1; l < hi; l++) {
    if (re[l] > re[l - 1] && re[l] >= re[l + 1] && re[l] > 0.8 * best) {
      const a = re[l - 1], b = re[l], c = re[l + 1];
      const d = a - 2 * b + c;
      return sr / (l + (d !== 0 ? (0.5 * (a - c)) / d : 0));
    }
  }
  return 0;
}

/** Spectral centroid (Hz) of the whole signal (averaged over a few windows), and the share of energy above 4 kHz. */
export function brightness(x, sr = SR, size = 2048) {
  let num = 0;
  let den = 0;
  let hi = 0;
  const step = Math.max(size, Math.floor(x.length / 40));
  for (let s = 0; s + size <= x.length; s += step) {
    const mag = magSpectrum(x, s, size);
    for (let i = 1; i < mag.length; i++) {
      const f = (i * sr) / size;
      const e = mag[i] * mag[i];
      num += f * e;
      den += e;
      if (f > 4000) hi += e;
    }
  }
  return { centroid: den > 0 ? num / den : 0, hiShare: den > 0 ? hi / den : 0 };
}

/** Seconds from the loudest point until the short-time envelope falls `db` below it (Infinity if it never does). */
export function decayTime(x, db = -40, sr = SR) {
  const win = Math.round(sr * 0.01);
  const env = [];
  for (let i = 0; i + win <= x.length; i += win) {
    let s = 0;
    for (let k = 0; k < win; k++) s += x[i + k] * x[i + k];
    env.push(Math.sqrt(s / win));
  }
  let pk = 0, pi = 0;
  env.forEach((v, i) => { if (v > pk) { pk = v; pi = i; } });
  const thr = pk * Math.pow(10, db / 20);
  for (let i = pi; i < env.length; i++) if (env[i] < thr) return ((i - pi) * win) / sr;
  return Infinity;
}

/** 12-bin chroma (energy per pitch class, C = 0, normalised to sum 1) of a mono signal, from 70 Hz to 2 kHz, over several long windows. */
export function chromaOf(x, sr = SR, size = 8192) {
  const c = new Float64Array(12);
  const step = Math.max(size, Math.floor(x.length / 24));
  for (let s = 0; s + size <= x.length; s += step) {
    const mag = magSpectrum(x, s, size);
    for (let i = Math.ceil((70 * size) / sr); i < Math.min(mag.length, Math.floor((2000 * size) / sr)); i++) {
      const f = (i * sr) / size;
      const pc = ((Math.round(midiOfHz(f)) % 12) + 12) % 12;
      c[pc] += mag[i] * mag[i];
    }
  }
  const sum = c.reduce((a, b) => a + b, 0) || 1;
  return Array.from(c, (v) => v / sum);
}

/** Onset strength curve (positive spectral flux, 11.6 ms hop): { env: Float32Array, hopSec }. Used to find the tempo and the density of events. */
export function onsetEnvelope(x, sr = SR, size = 512, hop = 256) {
  const n = Math.floor((x.length - size) / hop);
  const env = new Float32Array(n);
  let prev = null;
  for (let f = 0; f < n; f++) {
    const mag = magSpectrum(x, f * hop, size);
    let flux = 0;
    if (prev) for (let i = 1; i < mag.length; i++) { const d = Math.log1p(mag[i] * 50) - Math.log1p(prev[i] * 50); if (d > 0) flux += d; }
    env[f] = flux;
    prev = mag;
  }
  return { env, hopSec: hop / sr };
}

/** The seam of a loop: the jump across the loop point (last sample -> first) against the largest sample-to-sample step found anywhere inside. */
export function seam(x) {
  let maxStep = 0;
  for (let i = 1; i < x.length; i++) maxStep = Math.max(maxStep, Math.abs(x[i] - x[i - 1]));
  return { jump: Math.abs(x[0] - x[x.length - 1]), maxStep };
}

// ---------------------------------------------------------------------------------------------
// Key and tempo of a piece of audio
// ---------------------------------------------------------------------------------------------
// Krumhansl-Kessler key profiles
const KMAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KMIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export const PC_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** The key a 12-bin chroma is closest to: { pc, mode: 'major' | 'minor', name, r } (the correlation with the Krumhansl-Kessler profile). It is a smoke alarm for a score that has gone wrong (a pedal an octave too low to be heard, a transposed bar), not a judge of modes. */
export function keyOf(chroma) {
  const corr = (a, b) => {
    const ma = a.reduce((x, y) => x + y, 0) / 12;
    const mb = b.reduce((x, y) => x + y, 0) / 12;
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return n / Math.sqrt(da * db);
  };
  let best = null;
  for (let k = 0; k < 12; k++) {
    for (const [mode, prof] of [['major', KMAJ], ['minor', KMIN]]) {
      const rot = prof.map((_, i) => prof[(i - k + 12) % 12]);
      const r = corr(chroma, rot);
      if (!best || r > best.r) best = { pc: k, mode, name: `${PC_NAMES[k]} ${mode}`, r };
    }
  }
  return best;
}

/**
 * Roughness (Sethares' dissonance of the strongest 14 partials, averaged over the loop): how much the notes that sound together beat against each other. Vale's own lullaby measures 0.20 at dusk
 * and 0.14 at daybreak; a song far above that is harsh in a way the first one never was. Unitless; it is a proxy for a thing nobody has heard.
 */
export function roughness(x, sr = SR, size = 4096) {
  let total = 0;
  let frames = 0;
  for (let s = 0; s + size <= x.length; s += 8192) {
    const mag = magSpectrum(x, s, size);
    const peaks = [];
    for (let i = 3; i < mag.length - 3; i++) {
      const f = (i * sr) / size;
      if (f < 100 || f > 3000) continue;
      if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1] && mag[i] > mag[i - 2] && mag[i] >= mag[i + 2]) peaks.push([f, mag[i]]);
    }
    peaks.sort((a, b) => b[1] - a[1]);
    const top = peaks.slice(0, 14);
    const mx = top.length ? top[0][1] : 1;
    let d = 0;
    for (let a = 0; a < top.length; a++) {
      for (let b = a + 1; b < top.length; b++) {
        const [f1, a1] = top[a];
        const [f2, a2] = top[b];
        const sc = 0.24 / (0.0207 * Math.min(f1, f2) + 18.96);
        const df = Math.abs(f1 - f2);
        d += (a1 / mx) * (a2 / mx) * (Math.exp(-3.5 * sc * df) - Math.exp(-5.75 * sc * df));
      }
    }
    total += d;
    frames++;
  }
  return total / Math.max(1, frames);
}

/** Tempo (BPM) of the strongest periodicity of the onsets between 0.3 and 1.5 s (0 if none). */
export function tempoOf(x) {
  const { env, hopSec } = onsetEnvelope(x);
  const n = env.length;
  const mean = env.reduce((a, b) => a + b, 0) / n;
  let best = 0, bl = 0;
  for (let lag = Math.round(0.3 / hopSec); lag < Math.round(1.5 / hopSec); lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += (env[i] - mean) * (env[i + lag] - mean);
    s /= n - lag;
    if (s > best) { best = s; bl = lag; }
  }
  return bl ? 60 / (bl * hopSec) : 0;
}

/** Curvature at the loop point against the interior: { seam, interior (99.9th percentile of the second differences), ratio }. A click at the seam would show a ratio well over 1. */
export function seamCurvature(x) {
  const n = x.length;
  const d2 = (a, b, c) => Math.abs(a - 2 * b + c);
  const vals = new Float32Array(n - 2);
  for (let i = 1; i < n - 1; i++) vals[i - 1] = d2(x[i - 1], x[i], x[i + 1]);
  const sorted = Float32Array.from(vals).sort();
  const interior = sorted[Math.floor(sorted.length * 0.999)];
  const at = Math.max(d2(x[n - 2], x[n - 1], x[0]), d2(x[n - 1], x[0], x[1]));
  return { seam: at, interior, ratio: at / Math.max(1e-9, interior) };
}
