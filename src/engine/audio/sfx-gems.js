// Gloaming Vale audio — gem pickup chimes and the gem burst. Pure DSP (Node + browser).
//
// The gems are the most-heard sound in the game, so they get a cleaner treatment than the rest of the
// (deliberately grainy, 22.05 kHz, mono) sound effects: they are rendered at 48 kHz in stereo, with no
// ADPCM grit and no 9.5 kHz high-cut, because a shiny chime needs real energy up to 10+ kHz without the
// mirrored "fizz" of a 22 kHz sample being stretched to the device rate. The buffers carry their own
// sample rate in `.sr`; audio.js and tools/audio-render.mjs honour it.
//
// A gem is a quick rising run of glassy bells followed by a glitter tail. Value climbs three ways at once
// (as before): a higher top note, more notes in the run, and a longer / airier ring:
//   gem_red     A6 E7 A7                              "ti-ti-ting"
//   gem_green   D7 E7 A7 D8                           four-note run
//   gem_blue    A6 D7 E7 A7 B7                        five notes, a little air
//   gem_gold    D7 E7 A7 B7 D8 E8 + body note         six notes, detuned twin bells, more glitter
//   gem_purple  D6 body, then A6 .. A8 (eight notes)  a long shimmering cascade in a bright glass room
// Notes come from the D pentatonic (D E A B) so they never fight the music. Each bell is nearly harmonic
// (1, 2, 3.01, 4.17 x the fundamental: clean and glassy rather than clanky), decaying faster the higher
// the partial, with a detuned twin panned to the other side (slow stereo shimmer), a 1.5 ms "glint"
// of 7-9 kHz at the start (the shiny attack) and a scatter of tiny 5-9 kHz pings (the sparkle).
//
// The pickup code plays them at pitch = a small ladder of intervals (see systems/gems.js), so a quick
// run of gems climbs the scale instead of repeating one ting.

import { RNG, seedOf, softLimit } from './synth.js';
import { hz } from './sfx-kit.js';

export const GEM_SR = 48000;
const TAU = Math.PI * 2;
const MAX_PARTIAL = 11000;      // nothing above this: the pickup code plays these up to an octave higher, and 2 x 11 kHz is still below Nyquist (no aliasing)

// ---------------------------------------------------------------------------------------------
// Building blocks (all at GEM_SR)
// ---------------------------------------------------------------------------------------------
const panGains = (pan) => {
  const a = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
};

/** Add a decaying sine (recursive oscillator: no Math.sin per sample) with a raised-cosine attack. */
function partial(L, R, t0, f, amp, tau, pan = 0, atk = 0.0007, phase = 0) {
  if (f >= MAX_PARTIAL || amp < 1e-5) return;
  const start = Math.round(t0 * GEM_SR);
  const n = Math.min(L.length - start, Math.ceil(tau * 9.2 * GEM_SR));       // 9.2 tau = -80 dB
  if (n <= 0) return;
  const w = (TAU * f) / GEM_SR;
  const c = 2 * Math.cos(w);
  let y1 = Math.sin(phase - w);
  let y2 = Math.sin(phase - 2 * w);
  const dm = Math.exp(-1 / (tau * GEM_SR));
  const an = Math.max(1, Math.round(atk * GEM_SR));
  const [gl, gr] = panGains(pan);
  let e = amp;
  for (let i = 0; i < n; i++) {
    const y = c * y1 - y2;
    y2 = y1;
    y1 = y;
    const v = y * e * (i < an ? 0.5 - 0.5 * Math.cos((Math.PI * i) / an) : 1);
    L[start + i] += v * gl;
    R[start + i] += v * gr;
    e *= dm;
  }
}

/** One struck glass bell: near-harmonic partials, the upper ones dying faster, plus a detuned twin on the other side. */
function bell(L, R, t0, f, gain, { tau = 0.12, bright = 1, twin = 0.3, pan = 0 } = {}) {
  // (the partials start at different phases: in phase they would add up to a sharp spike at every onset, which
  // costs headroom and sounds like a click; the glint below is the deliberate transient)
  const P = [[1, 1, 1, 0], [2.0, 0.34, 0.5, 2.4], [3.01, 0.16, 0.3, 4.8], [4.17, 0.08, 0.18, 0.9], [5.43, 0.035, 0.1, 3.3]];
  for (const [r, a, ts, ph] of P) partial(L, R, t0, f * r, gain * a * (r === 1 ? 1 : bright), tau * ts, pan + 0.12, 0.0007, ph);
  if (twin > 0) {
    partial(L, R, t0 + 0.0006, f * 1.0026, gain * twin, tau * 0.95, pan - 0.35, 0.0007, 1.7);
    partial(L, R, t0 + 0.0006, f * 2.0052, gain * twin * 0.3 * bright, tau * 0.5, pan - 0.35, 0.0007, 5.6);
  }
}

/** The shiny attack: a 1.5 ms Hann-windowed burst of two very high sines. */
function glint(L, R, t0, amp, pan = 0, fs = [6900, 9100]) {
  const start = Math.round(t0 * GEM_SR);
  const n = Math.round(0.0015 * GEM_SR);
  const [gl, gr] = panGains(pan);
  for (let i = 0; i < n && start + i < L.length; i++) {
    const w = 0.5 - 0.5 * Math.cos((TAU * (i + 0.5)) / n);
    let v = 0;
    for (const f of fs) v += Math.sin((TAU * f * i) / GEM_SR);
    v *= amp * w * 0.5;
    L[start + i] += v * gl;
    R[start + i] += v * gr;
  }
}

/** A soft low "pop": a sine that falls f0 -> f1 (time constant tauP) and decays (tauA), centred. */
function thumpHi(L, R, t0, f0, f1, tauP, tauA, gain) {
  const start = Math.round(t0 * GEM_SR);
  const n = Math.min(L.length - start, Math.round(tauA * 8 * GEM_SR));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / GEM_SR;
    ph += (f1 + (f0 - f1) * Math.exp(-t / tauP)) / GEM_SR;
    const v = Math.sin(TAU * ph) * Math.exp(-t / tauA) * Math.min(1, t / 0.002) * gain;
    L[start + i] += v * 0.7071;
    R[start + i] += v * 0.7071;
  }
}

const SPARKLE = [4699, 5274, 7040, 7902, 9397];      // D8 E8 A8 B8 D9: consonant with the notes underneath

/** `count` tiny high pings scattered over [t0, t1] (front-loaded), random pan: the glitter. */
function glitter(L, R, rng, t0, t1, count, gain) {
  for (let k = 0; k < count; k++) {
    const x = (k + rng.range(0.05, 0.95)) / count;
    const t = t0 + (t1 - t0) * Math.pow(x, 1.35);
    const a = gain * rng.range(0.45, 1) * (1 - 0.6 * x);
    const f = rng.pick(SPARKLE);
    const pan = rng.range(-0.85, 0.85);
    const tau = rng.range(0.010, 0.026);
    partial(L, R, t, f, a, tau, pan, 0.0004);
    partial(L, R, t, f * 1.5, a * 0.22, tau * 0.6, pan, 0.0004);        // a fifth above: the ping shines rather than beeps
  }
}

// A small bright plate: four damped combs per side (different lengths left / right so the wet signal is wide),
// two all-pass diffusers, 4 ms pre-delay. `wet` is the wet-to-dry RMS ratio, `rt` the reverberation time (s).
const COMBS_L = [0.0233, 0.0291, 0.0337, 0.0389];
const COMBS_R = [0.0247, 0.0306, 0.0353, 0.0407];
function bloom(L, R, wet, rt, damp = 0.42) {
  const n = L.length;
  const mono = new Float32Array(n);
  const pre = Math.round(0.004 * GEM_SR);
  for (let i = 0; i + pre < n; i++) mono[i + pre] = (L[i] + R[i]) * 0.5;
  const run = (delays, apDelays) => {
    const out = new Float32Array(n);
    for (const d of delays) {
      const len = Math.round(d * GEM_SR);
      const buf = new Float32Array(len);
      const fb = Math.pow(10, (-3 * d) / rt);
      let idx = 0;
      let store = 0;
      for (let i = 0; i < n; i++) {
        const y = buf[idx];
        store = y * (1 - damp) + store * damp;
        buf[idx] = mono[i] + store * fb;
        out[i] += y;
        if (++idx === len) idx = 0;
      }
    }
    for (const d of apDelays) {
      const len = Math.round(d * GEM_SR);
      const buf = new Float32Array(len);
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const b = buf[idx];
        const x = out[i];
        out[i] = -x + b;
        buf[idx] = x + b * 0.5;
        if (++idx === len) idx = 0;
      }
    }
    return out;
  };
  const wl = run(COMBS_L, [0.0050, 0.0017]);
  const wr = run(COMBS_R, [0.0053, 0.0019]);
  let dry = 0;
  let wt = 0;
  for (let i = 0; i < n; i++) {
    dry += (L[i] * L[i] + R[i] * R[i]) * 0.5;
    wt += (wl[i] * wl[i] + wr[i] * wr[i]) * 0.5;
  }
  const g = wt > 1e-12 ? wet * Math.sqrt(dry / wt) : 0;
  for (let i = 0; i < n; i++) {
    L[i] += wl[i] * g;
    R[i] += wr[i] * g;
  }
}

/** Fade the tail, soft-limit, and scale so the loudest sample sits at `peakDb`. Returns { L, R, sr }. */
function finish(L, R, peakDb) {
  const n = L.length;
  const fade = Math.min(n >> 1, Math.round(0.03 * GEM_SR));
  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    L[n - 1 - i] *= g;
    R[n - 1 - i] *= g;
  }
  let pk = 1e-9;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const k = Math.pow(10, peakDb / 20) / pk;
  for (let i = 0; i < n; i++) {
    L[i] = softLimit(L[i] * k, 0.85, 0.97);
    R[i] = softLimit(R[i] * k, 0.85, 0.97);
  }
  return { L, R, sr: GEM_SR };
}

/**
 * Render one gem chime.
 * s: { notes, gap, tau, bright, twin, glint, sparkle: [count, span, gain], wet, rt, body?: [note, gain], peakDb }
 */
function chimeRun(name, s) {
  const rng = new RNG(seedOf(name));
  const last = s.notes.length - 1;
  const topTau = s.tau * 1.55;
  const runEnd = last * s.gap;
  const ring = topTau * 5.2;                                            // cut at about -45 dB (then a 30 ms fade)
  const tail = s.wet > 0 ? Math.min(0.32, s.rt * 0.5) : 0.02;
  const n = Math.round((runEnd + ring + tail + 0.03) * GEM_SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  if (s.body) bell(L, R, 0, hz(s.body[0]), s.body[1], { tau: s.tau * 2.4, bright: 0.5, twin: 0.5 });
  s.notes.forEach((nm, k) => {
    const x = last ? k / last : 1;
    const gain = 0.72 + 0.28 * x;                                      // gentle crescendo up the run
    const tau = s.tau * (0.8 + 0.75 * x);                               // and the top note rings longest
    const pan = (rng.next() - 0.5) * 0.3;
    bell(L, R, k * s.gap, hz(nm), gain, { tau, bright: s.bright, twin: s.twin, pan });
  });
  glint(L, R, 0, s.glint, -0.1);
  glint(L, R, runEnd, s.glint * 0.8, 0.15, [7600, 9800]);
  const [gc, span, gg] = s.sparkle;
  glitter(L, R, rng, runEnd * 0.4 + 0.02, runEnd + span, gc, gg);
  if (s.wet > 0) bloom(L, R, s.wet, s.rt);
  return finish(L, R, s.peakDb);
}

export const GEM_SFX = {
  gem_red: () => chimeRun('gem_red', { notes: ['A6', 'E7', 'A7'], gap: 0.026, tau: 0.05, bright: 0.9, twin: 0.26, glint: 0.15, sparkle: [4, 0.16, 0.10], wet: 0.15, rt: 0.24, peakDb: -2.4 }),
  gem_green: () => chimeRun('gem_green', { notes: ['D7', 'E7', 'A7', 'D8'], gap: 0.028, tau: 0.06, bright: 0.95, twin: 0.28, glint: 0.16, sparkle: [6, 0.2, 0.11], wet: 0.2, rt: 0.32, peakDb: -2.2 }),
  gem_blue: () => chimeRun('gem_blue', { notes: ['A6', 'D7', 'E7', 'A7', 'B7'], gap: 0.03, tau: 0.075, bright: 1, twin: 0.32, glint: 0.17, sparkle: [8, 0.26, 0.12], wet: 0.24, rt: 0.42, peakDb: -2.2 }),
  gem_gold: () => chimeRun('gem_gold', { notes: ['D7', 'E7', 'A7', 'B7', 'D8', 'E8'], gap: 0.028, tau: 0.11, bright: 1, twin: 0.4, glint: 0.19, sparkle: [12, 0.36, 0.13], wet: 0.34, rt: 0.6, body: ['A6', 0.95], peakDb: -2.2 }),
  gem_purple: () => chimeRun('gem_purple', { notes: ['A6', 'D7', 'E7', 'A7', 'B7', 'D8', 'E8', 'A8'], gap: 0.024, tau: 0.16, bright: 1.05, twin: 0.5, glint: 0.21, sparkle: [20, 0.55, 0.14], wet: 0.44, rt: 0.85, body: ['D6', 1.05], peakDb: -2.2 }),

  /** Gems bursting out of a vase / chest / enemy: a soft pop and a rising shower of glitter. */
  gem_burst() {
    const rng = new RNG(seedOf('gem_burst'));
    const n = Math.round(0.95 * GEM_SR);
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    thumpHi(L, R, 0, 300, 95, 0.02, 0.05, 0.5);
    const scale = ['A6', 'D7', 'E7', 'A7', 'B7', 'D8', 'E8'];
    for (let k = 0; k < 12; k++) {
      const x = k / 11;
      const t = 0.015 + 0.3 * Math.pow(x, 1.2) + rng.range(0, 0.02);
      const f = hz(scale[Math.min(scale.length - 1, Math.floor(x * 5 + rng.range(0, 2.2)))]);
      bell(L, R, t, f, rng.range(0.4, 0.75), { tau: rng.range(0.05, 0.095), bright: 0.9, twin: 0.2, pan: rng.range(-0.7, 0.7) });
    }
    glint(L, R, 0.005, 0.14, 0);
    glitter(L, R, rng, 0.05, 0.5, 14, 0.09);
    bloom(L, R, 0.26, 0.5);
    return finish(L, R, -3);
  },
};
