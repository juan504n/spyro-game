// Gloaming Vale audio — pure DSP core (no DOM, no WebAudio; runs in Node and in the browser).
//
// Everything in the game's soundtrack is synthesized from scratch at startup at SR = 22050 Hz,
// which is the native rate of the PlayStation SPU's reverb unit and a typical rate for its
// sampled instruments. Nothing here uses Math.random: every source of randomness is a seeded
// mulberry32 generator, so a given sound is bit-identical on every run.
//
// This file holds the low-level toolbox:
//   - RNG / seeding helpers
//   - buffer helpers (alloc, mix, fade, normalise, DC removal, soft limiter)
//   - Osc: sine / triangle / polyBLEP saw / polyBLEP pulse oscillators with a phase accumulator
//   - envelope helpers (exponential decay, attack-decay, ADSR, piecewise-linear)
//   - Biquad (RBJ), SVF (TPT, cheap to modulate), one-pole, Noise (white / pink / brown)
//   - Delay (fractional), Karplus-Strong string, FM bell, additive "bar" (metallophone/marimba)
// The SPU-flavoured pieces (ADPCM grit, hardware-style reverb, bus compressor) live in spu.js.

export const SR = 22050;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Maths helpers
// ---------------------------------------------------------------------------------------------
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (x) => {
  x = x < 0 ? 0 : x > 1 ? 1 : x;
  return x * x * (3 - 2 * x);
};
/** MIDI note number -> Hz (A4 = 69 = 440 Hz). */
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const dbToLin = (db) => Math.pow(10, db / 20);
export const linToDb = (g) => 20 * Math.log10(Math.max(g, 1e-12));
/** Exponential glide from f0 to f1 as x goes 0 -> 1. */
export const expGlide = (f0, f1, x) => f0 * Math.pow(f1 / f0, clamp(x, 0, 1));

// ---------------------------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------------------------
export class RNG {
  constructor(seed = 1) {
    this.s = seed >>> 0;
  }
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** float in [a, b) */
  range(a = 0, b = 1) {
    return a + (b - a) * this.next();
  }
  /** signed float in [-1, 1) */
  bi() {
    return this.next() * 2 - 1;
  }
  /** integer in [a, b) */
  int(a, b) {
    return a + Math.floor(this.next() * (b - a));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
}

/** FNV-1a string hash -> 32-bit seed. Gives every named sound its own stable random stream. */
export function seedOf(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------------------------
// Buffer helpers
// ---------------------------------------------------------------------------------------------
/** Number of samples in `sec` seconds (at least 1). */
export const samples = (sec) => Math.max(1, Math.round(sec * SR));
export const alloc = (sec) => new Float32Array(samples(sec));

/** Render `sec` seconds by calling fn(t, i) for each sample. */
export function gen(sec, fn) {
  const n = samples(sec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
  return out;
}

/** dst += src * gain, starting `at` seconds into dst. Clipped to dst's length (no wrap). */
export function mixInto(dst, src, at = 0, gain = 1) {
  const off = Math.round(at * SR);
  const n = Math.min(src.length, dst.length - off);
  for (let i = Math.max(0, -off); i < n; i++) dst[off + i] += src[i] * gain;
  return dst;
}

/** dst += src * gain starting at sample `off`, WRAPPING around the end of dst (for seamless loops). */
export function mixWrap(dst, src, off, gain = 1) {
  const N = dst.length;
  let k = ((off % N) + N) % N;
  for (let i = 0; i < src.length; i++) {
    dst[k] += src[i] * gain;
    if (++k === N) k = 0;
  }
  return dst;
}

export function scaleBuf(buf, g) {
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

export function peakOf(buf) {
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = buf[i] < 0 ? -buf[i] : buf[i];
    if (a > p) p = a;
  }
  return p;
}

export function rmsOf(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, buf.length));
}

/** Scale in place so the peak sits at `db` dBFS. */
export function normalizePeak(buf, db = -2) {
  const p = peakOf(buf);
  if (p > 1e-9) scaleBuf(buf, dbToLin(db) / p);
  return buf;
}

export function meanOf(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i];
  return s / Math.max(1, buf.length);
}

/** Subtract the mean (kills static DC offset; leaves the waveform shape alone). */
export function removeDC(buf) {
  const m = meanOf(buf);
  if (m !== 0) for (let i = 0; i < buf.length; i++) buf[i] -= m;
  return buf;
}

/** Raised-cosine fade in / out (milliseconds) so a one-shot never clicks. */
export function fadeEdges(buf, inMs = 2, outMs = 2) {
  const a = Math.min(buf.length >> 1, Math.round((inMs * SR) / 1000));
  const b = Math.min(buf.length >> 1, Math.round((outMs * SR) / 1000));
  for (let i = 0; i < a; i++) buf[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / a);
  for (let i = 0; i < b; i++) buf[buf.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / b);
  return buf;
}

/** Memoryless soft limiter: linear below `thr`, tanh-compressed above, never exceeds `ceil`. */
export function softLimit(x, thr = 0.55, ceil = 0.89) {
  const a = x < 0 ? -x : x;
  if (a <= thr) return x;
  const y = thr + (ceil - thr) * Math.tanh((a - thr) / (ceil - thr));
  return x < 0 ? -y : y;
}

export function limitBuf(buf, thr = 0.55, ceil = 0.89) {
  for (let i = 0; i < buf.length; i++) buf[i] = softLimit(buf[i], thr, ceil);
  return buf;
}

/** Sample-and-hold decimation to an effective `rate` Hz (crunchy aliasing, SPU-ish grit). */
export function holdDown(buf, rate) {
  const step = SR / rate;
  const out = new Float32Array(buf.length);
  let acc = step;
  let held = 0;
  for (let i = 0; i < buf.length; i++) {
    if (acc >= step) {
      acc -= step;
      held = buf[i];
    }
    acc += 1;
    out[i] = held;
  }
  return out;
}

/** Quantise to `bits` bits (mild bit reduction). */
export function bitcrush(buf, bits) {
  const q = Math.pow(2, bits - 1);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.round(buf[i] * q) / q;
  return buf;
}

/** Linear-interpolated resample by `ratio` (>1 = higher pitch/shorter). Used for sample "pitching". */
export function resample(buf, ratio) {
  const n = Math.max(1, Math.floor((buf.length - 1) / ratio));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const k = p | 0;
    const f = p - k;
    out[i] = buf[k] * (1 - f) + buf[k + 1] * f;
  }
  return out;
}

/** Reverse copy. */
export function reversed(buf) {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[buf.length - 1 - i];
  return out;
}

// ---------------------------------------------------------------------------------------------
// Oscillators (phase accumulator; polyBLEP for saw / pulse to tame aliasing at 22 kHz)
// ---------------------------------------------------------------------------------------------
/** polyBLEP residual for a unit step at phase 0 (phase t in 0..1, increment dt). */
export function blep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

export class Osc {
  constructor(phase = 0) {
    this.p = phase;
  }
  _adv(dt) {
    let p = this.p + dt;
    if (p >= 1) p -= Math.floor(p);
    this.p = p;
  }
  sine(f) {
    const v = Math.sin(TAU * this.p);
    this._adv(f / SR);
    return v;
  }
  /** sine with phase modulation (radians) — the core of the FM voices. */
  pm(f, mod) {
    const v = Math.sin(TAU * this.p + mod);
    this._adv(f / SR);
    return v;
  }
  /** additive: amps[k] is the level of harmonic k+1, all sharing one phase (so they stay coherent). */
  add(f, amps) {
    const p = TAU * this.p;
    let v = 0;
    for (let k = 0; k < amps.length; k++) v += amps[k] * Math.sin(p * (k + 1));
    this._adv(f / SR);
    return v;
  }
  tri(f) {
    const p = this.p;
    const v = p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
    this._adv(f / SR);
    return v;
  }
  saw(f) {
    const dt = f / SR;
    const p = this.p;
    const v = 2 * p - 1 - blep(p, dt);
    this._adv(dt);
    return v;
  }
  /** pulse / PWM; w = duty (0..1). */
  pulse(f, w = 0.5) {
    const dt = f / SR;
    const p = this.p;
    let q = p - w;
    if (q < 0) q += 1;
    const v = (p < w ? 1 : -1) + blep(p, dt) - blep(q, dt);
    this._adv(dt);
    return v;
  }
}

// ---------------------------------------------------------------------------------------------
// Envelopes (pure functions of time in seconds)
// ---------------------------------------------------------------------------------------------
/** Exponential decay, time constant tau. */
export const decay = (t, tau) => Math.exp(-t / tau);
/** Linear attack over `a` seconds then exponential decay with time constant `tau`. */
export const ad = (t, a, tau) => (t < a ? t / a : Math.exp(-(t - a) / tau));
/** ADSR: note held for `hold` seconds then released over `r`. Exponential-ish segments. */
export function adsr(t, hold, a, d, s, r) {
  let v;
  if (t < a) v = t / a;
  else if (t < a + d) v = 1 + (s - 1) * smooth((t - a) / d);
  else v = s;
  if (t > hold) v *= Math.max(0, 1 - (t - hold) / r);
  return v;
}
/** Piecewise-linear envelope through [[t, v], ...] (t ascending). */
export function pw(points, t) {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (t < points[i][0]) {
      const [t0, v0] = points[i - 1];
      const [t1, v1] = points[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return points[points.length - 1][1];
}

// ---------------------------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------------------------
/** RBJ biquad. type: lp hp bp (unity peak) notch peak lowshelf highshelf ap. */
export class Biquad {
  constructor(type = 'lp', f = 1000, q = 0.7071, gainDb = 0) {
    this.z1 = 0;
    this.z2 = 0;
    this.set(type, f, q, gainDb);
  }
  set(type, f, q = 0.7071, gainDb = 0) {
    f = clamp(f, 8, SR * 0.49);
    const w = (TAU * f) / SR;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const al = sw / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'hp':
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
        a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
        break;
      case 'bp':
        b0 = al; b1 = 0; b2 = -al;
        a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
        break;
      case 'notch':
        b0 = 1; b1 = -2 * cw; b2 = 1;
        a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
        break;
      case 'peak':
        b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A;
        a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A;
        break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * al;
        b0 = A * (A + 1 - (A - 1) * cw + s); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s);
        a0 = A + 1 + (A - 1) * cw + s; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s;
        break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * al;
        b0 = A * (A + 1 + (A - 1) * cw + s); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s);
        a0 = A + 1 - (A - 1) * cw + s; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s;
        break;
      }
      case 'ap':
        b0 = 1 - al; b1 = -2 * cw; b2 = 1 + al;
        a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
        break;
      default: // lp
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2;
        a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** Filter a whole buffer (new array). `order2` = cascade twice for a steeper slope. */
export function filterBuf(buf, type, f, q = 0.7071, order2 = false, gainDb = 0) {
  const out = new Float32Array(buf.length);
  const a = new Biquad(type, f, q, gainDb);
  const b = order2 ? new Biquad(type, f, q, gainDb) : null;
  if (b) for (let i = 0; i < buf.length; i++) out[i] = b.process(a.process(buf[i]));
  else for (let i = 0; i < buf.length; i++) out[i] = a.process(buf[i]);
  return out;
}

/**
 * TPT state-variable filter: cheap to retune. run(x, f, q) retunes and ticks in one call;
 * for block-rate modulation call setup(f, q) every few samples and tick(x) per sample.
 * Outputs after each call: .lp .bp (unity peak) .hp.
 */
export class SVF {
  constructor() {
    this.s1 = 0;
    this.s2 = 0;
    this.lp = 0;
    this.bp = 0;
    this.hp = 0;
    this.setup(1000, 0.7071);
  }
  setup(f, q = 0.7071) {
    const g = Math.tan((Math.PI * Math.min(f, SR * 0.45)) / SR);
    const k = 1 / q;
    this.k = k;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  tick(x) {
    const k = this.k;
    const v3 = x - this.s2;
    const v1 = this.a1 * this.s1 + this.a2 * v3;
    const v2 = this.s2 + this.a2 * this.s1 + this.a3 * v3;
    this.s1 = 2 * v1 - this.s1;
    this.s2 = 2 * v2 - this.s2;
    this.lp = v2;
    this.bp = k * v1; // unity peak gain
    this.hp = x - k * v1 - v2;
    return v2;
  }
  run(x, f, q = 0.7071) {
    this.setup(f, q);
    return this.tick(x);
  }
}

/** One-pole low-pass; coefficient from a cutoff in Hz. */
export class OnePole {
  constructor(f = 1000) {
    this.y = 0;
    this.setF(f);
  }
  setF(f) {
    this.a = 1 - Math.exp((-TAU * f) / SR);
  }
  process(x) {
    this.y += this.a * (x - this.y);
    return this.y;
  }
}

// ---------------------------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------------------------
export class Noise {
  constructor(seed = 1) {
    this.r = new RNG(seed);
    this.b0 = this.b1 = this.b2 = this.b3 = this.b4 = this.b5 = this.b6 = 0;
    this.br = 0;
  }
  white() {
    return this.r.next() * 2 - 1;
  }
  /** Paul Kellet's economy pink filter fed by the given white sample (so loops can use periodic tables). */
  pinkFrom(w) {
    this.b0 = 0.99886 * this.b0 + w * 0.0555179;
    this.b1 = 0.99332 * this.b1 + w * 0.0750759;
    this.b2 = 0.969 * this.b2 + w * 0.153852;
    this.b3 = 0.8665 * this.b3 + w * 0.3104856;
    this.b4 = 0.55 * this.b4 + w * 0.5329522;
    this.b5 = -0.7616 * this.b5 - w * 0.016898;
    const p = (this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + w * 0.5362) * 0.11;
    this.b6 = w * 0.115926;
    return p;
  }
  pink() {
    return this.pinkFrom(this.white());
  }
  /** Leaky-integrated white noise (6 dB/oct roll-off), roughly +-1. */
  brownFrom(w) {
    this.br = (this.br + 0.02 * w) / 1.02;
    return this.br * 3.5;
  }
  brown() {
    return this.brownFrom(this.white());
  }
}

// ---------------------------------------------------------------------------------------------
// Delay line with fractional read (linear interpolation)
// ---------------------------------------------------------------------------------------------
export class Delay {
  constructor(maxSamples) {
    this.n = Math.ceil(maxSamples) + 2;
    this.buf = new Float32Array(this.n);
    this.w = 0;
  }
  write(x) {
    this.buf[this.w] = x;
    if (++this.w === this.n) this.w = 0;
  }
  /** value written `d` samples ago (d >= 1 counted from the most recent write). */
  read(d) {
    let p = this.w - d;
    while (p < 0) p += this.n;
    const k = Math.floor(p);
    const f = p - k;
    const a = this.buf[k];
    const b = this.buf[k + 1 === this.n ? 0 : k + 1];
    return a + (b - a) * f;
  }
}

/** Feedback echo over a whole buffer. Returns a new, longer buffer (adds the tail). */
export function echo(buf, time, feedback = 0.4, mix = 0.5, lpHz = 3500, tail = 1.0) {
  const n = buf.length + samples(tail);
  const out = new Float32Array(n);
  const d = Math.max(1, Math.round(time * SR));
  const lp = new OnePole(lpHz);
  const line = new Float32Array(d);
  let w = 0;
  for (let i = 0; i < n; i++) {
    const x = i < buf.length ? buf[i] : 0;
    const e = lp.process(line[w]);
    line[w] = x + e * feedback;
    if (++w === d) w = 0;
    out[i] = x + e * mix;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Ready-made voices used all over the sfx / music code
// ---------------------------------------------------------------------------------------------
/**
 * Karplus-Strong plucked string with tuned fractional delay (allpass) and a one-zero damping
 * loop. `decayK` ~0.994..0.9995 sets the ring time; `bright` 0..1 sets the excitation colour.
 * Returns `sec` seconds of audio at pitch `freq`.
 */
export function pluckString(freq, sec, decayK = 0.996, bright = 0.6, seed = 7) {
  const n = samples(sec);
  const out = new Float32Array(n);
  const L = SR / freq;
  const N = Math.max(2, Math.floor(L - 0.5 - 0.5));
  const D = L - 0.5 - N; // fractional part, 0.5..1.5
  const ap = (1 - D) / (1 + D);
  const line = new Float32Array(N);
  const r = new RNG(seed);
  // excitation: noise burst low-passed by `bright`
  let lpv = 0;
  for (let i = 0; i < N; i++) {
    lpv += (r.bi() - lpv) * (0.25 + 0.75 * bright);
    line[i] = lpv;
  }
  let w = 0;
  let prev = 0; // one-zero damping memory
  let apx = 0;
  let apy = 0;
  for (let i = 0; i < n; i++) {
    const y = line[w];
    out[i] = y;
    const damped = 0.5 * (y + prev) * decayK;
    prev = y;
    // allpass fractional delay: y[n] = ap*(x[n]-y[n-1]) + x[n-1]
    const a = ap * (damped - apy) + apx;
    apx = damped;
    apy = a;
    line[w] = a;
    if (++w === N) w = 0;
  }
  return out;
}

/**
 * Additive "struck bar" voice (marimba / celesta / metallophone / chimes).
 * partials: [[ratio, amp, tauSeconds], ...]. Recursive sine oscillators (no Math.sin per sample).
 */
export function barVoice(freq, sec, partials, opts = {}) {
  const n = samples(sec);
  const out = new Float32Array(n);
  const attack = opts.attack ?? 0.0015;
  const an = Math.max(1, Math.round(attack * SR));
  for (const [ratio, amp, tau] of partials) {
    const f = freq * ratio;
    if (f >= SR * 0.47) continue;
    const w = (TAU * f) / SR;
    const c = 2 * Math.cos(w);
    // recurrence y[n] = c*y[n-1] - y[n-2] seeded with y[-1] = 0, y[-2] = -sin(w) gives sin(w*(n+1))
    let y1 = 0;
    let y2 = -Math.sin(w);
    const dm = Math.exp(-1 / (tau * SR));
    let e = amp;
    for (let i = 0; i < n; i++) {
      const y = c * y1 - y2;
      y2 = y1;
      y1 = y;
      out[i] += y * e * (i < an ? i / an : 1);
      e *= dm;
    }
  }
  return out;
}

/** Simple 2-operator FM bell/pluck. ratio = modulator/carrier, index decays with idxTau. */
export function fmVoice(freq, sec, ratio, index, idxTau, ampTau, attack = 0.002) {
  const n = samples(sec);
  const out = new Float32Array(n);
  const car = new Osc();
  const mod = new Osc();
  const fm = freq * ratio;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const I = index * Math.exp(-t / idxTau);
    const m = mod.sine(fm) * I;
    out[i] = car.pm(freq, m) * Math.exp(-t / ampTau) * (t < attack ? t / attack : 1);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Linear (non-wrapping) stereo mixer used by the stingers and multi-note sfx
// ---------------------------------------------------------------------------------------------
export class StereoMix {
  constructor(sec) {
    this.n = samples(sec);
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
  }
  /** Add mono sample `s` at time t (s), equal-power panned; maxLen (samples) truncates with a 15 ms fade. */
  add(s, t, gain = 1, pan = 0, maxLen = 0) {
    const g1 = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const g2 = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    const off = Math.round(t * SR);
    const cut = maxLen > 0 && maxLen < s.length;
    const len = Math.min(cut ? maxLen : s.length, this.n - off);
    const fade = cut ? Math.min(len, 330) : 0;
    for (let i = Math.max(0, -off); i < len; i++) {
      let v = s[i];
      if (fade && i >= len - fade) v *= (len - i) / fade;
      this.L[off + i] += v * g1;
      this.R[off + i] += v * g2;
    }
    return this;
  }
}
