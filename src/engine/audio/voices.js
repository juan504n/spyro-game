// Gloaming Vale audio — the second sample bank: the voices of the other worlds' songs. Pure DSP (Node + browser).
//
// Same rules as instruments.js: every function renders ONE note or hit as a mono Float32Array at SR = 22050, peaking near -6 dBFS after
// the SPU colouring chain, memoised in the same shared bank (the sequencer mixes copies at different times and velocities).
//
//   harp        plucked string: eight partials that die faster the higher they are, a fingertip tick, inharmonicity of a real string
//   glass       struck glass / crystal: inharmonic partials in beating pairs (a shimmer), long ring
//   strings     bowed ensemble: three detuned saws, delayed vibrato, a low-pass that blooms with the bow
//   horn        brass section: saw + pulse, a filter that opens with the attack, a small scoop up to the pitch, late vibrato
//   choir       sung "aah" (or ooh / oh / eh): detuned saws through formant filters, breath, vibrato
//   glassharm   bowed glass: a pure tone with a slow swell and a faint rub (a singing-glass lead)
//   whistle     tin whistle / recorder: pure, a little reedy, a chiff at the start
//   reed        reed organ / harmonium: pulse + saw, tremolo, a warm low-pass
//   shawm       double reed (zurna / shawm): a narrow pulse and a saw through a nasal band, quick vibrato, a scoop up to the pitch
//   epiano      FM electric piano with a tine ping
//   kalimba     thumb piano: a tine with its sharp second mode and a wooden thock
//   subbass     held sub bass (a sine and three harmonics: a phone's speaker has nothing under 150 Hz)
//   sawbass     saw bass whose filter snaps shut: a pulsing, growling line
//   timpani     tuned drum: five membrane modes with the pitch dropping after the stroke
//   taiko       big drum (unpitched)
//   anvil       struck metal (a forge)
//   hat / snare / crash / triangle   the rest of the kit
//   swell       swept noise: a wave washing in and out, wind, a riser, a cymbal wash

import {
  SR, TAU, Noise, Biquad, SVF, Osc, mtof, samples, gen, barVoice, fmVoice, adsr, ad, clamp, seedOf, smooth, blep,
} from './synth.js';
import { SHARED, done, drum } from './instruments.js';

// ---------------------------------------------------------------------------------------------
// Plucked and struck voices
// ---------------------------------------------------------------------------------------------
export const harp = (m) => SHARED.get('harp' + m, () => render_harp(m));
function render_harp(m) {
  const f = mtof(m);
  const tau = clamp(1.1 * Math.pow(261.6 / f, 0.5), 0.35, 1.8);                   // low strings ring long
  const amps = [1, 0.62, 0.42, 0.26, 0.18, 0.11, 0.07, 0.04];
  const parts = amps.map((a, i) => [(i + 1) * (1 + 0.00012 * (i + 1) * (i + 1)), a, tau / Math.pow(i + 1, 0.85)]);
  const b = barVoice(f, Math.min(3, tau * 5), parts, { attack: 0.0012 });
  const nz = new Noise(seedOf('harp' + m));
  const bp = new Biquad('bp', Math.min(f * 3, 3000), 1);
  for (let i = 0; i < 90; i++) b[i] += bp.process(nz.white()) * 0.14 * (1 - i / 90);   // the fingertip
  return done(b, { grit: 0.25, fadeOut: 30 });
}

export const glass = (m) => SHARED.get('glass' + m, () => render_glass(m));
function render_glass(m) {
  const f = mtof(m);
  const tau = clamp(2.2 * Math.pow(523 / f, 0.35), 0.6, 3);
  const parts = [[1, 1, tau], [1.0035, 0.6, tau * 0.9], [2.32, 0.34, tau * 0.55], [2.335, 0.22, tau * 0.5], [4.25, 0.2, tau * 0.35], [6.63, 0.11, tau * 0.22], [9.38, 0.05, tau * 0.15]];
  return done(barVoice(f, Math.min(3.4, tau * 3.6), parts, { attack: 0.002 }), { grit: 0.2, fadeOut: 40 });
}

export const epiano = (m) => SHARED.get('epno' + m, () => render_epiano(m));
function render_epiano(m) {
  const f = mtof(m);
  const tau = clamp(1.6 * Math.pow(261.6 / f, 0.4), 0.3, 2.2);
  const sec = Math.min(2.6, tau * 3);
  const a = fmVoice(f, sec, 1, 1.8, tau * 0.35, tau, 0.003);
  const t = fmVoice(f, sec, 14, 0.9, 0.04, 0.12, 0.001);                              // the tine's metallic ping
  for (let i = 0; i < a.length; i++) a[i] += 0.28 * t[i];
  return done(a, { grit: 0.25, fadeOut: 30 });
}

export const kalimba = (m) => SHARED.get('klb' + m, () => render_kalimba(m));
function render_kalimba(m) {
  const f = mtof(m);
  const tau = clamp(1.1 * Math.pow(523 / f, 0.4), 0.3, 1.5);
  const b = barVoice(f, Math.min(2.2, tau * 4), [[1, 1, tau], [5.45, 0.32, tau * 0.25], [9, 0.08, tau * 0.1]], { attack: 0.001 });
  const nz = new Noise(seedOf('klb' + m));
  const lp = new Biquad('lp', 900, 0.8);
  for (let i = 0; i < 70; i++) b[i] += lp.process(nz.white()) * 0.3 * (1 - i / 70);   // the thock of the wooden body
  return done(b, { fadeOut: 25 });
}

// ---------------------------------------------------------------------------------------------
// Sustained voices (o.attack / o.release in seconds)
// ---------------------------------------------------------------------------------------------
const okey = (o) => `${o.cut}:${o.attack}:${o.release}:${o.bright}:${o.vowel}`;

export const strings = (m, dur, o = {}) => SHARED.get(`str${m}:${dur}:${okey(o)}`, () => render_strings(m, dur, o));
function render_strings(m, dur, o) {
  const f = mtof(m);
  const cut = o.cut ?? 2600;
  const att = o.attack ?? 0.3;
  const rel = o.release ?? 0.5;
  const n = samples(dur + rel);
  const out = new Float32Array(n);
  const det = [0.9972, 1, 1.0033];
  const ph = [0, 0.37, 0.71];
  const lp = new Biquad('lp', cut, 0.75);
  let env = 0;
  let step = 0;
  let vib = 1;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const t = i / SR;
      env = adsr(t, dur, att, 0.3, 0.9, rel);
      step = (adsr((i + 16) / SR, dur, att, 0.3, 0.9, rel) - env) / 16;
      vib = 1 + 0.0032 * Math.sin(TAU * 5.3 * t) * smooth((t - 0.2) / 0.5);
      if ((i & 63) === 0) lp.set('lp', cut * (0.5 + 0.5 * env), 0.75);
    }
    env += step;
    let s = 0;
    for (let k = 0; k < 3; k++) {
      const inc = (f * det[k] * vib) / SR;
      let p = ph[k] + inc;
      if (p >= 1) p -= 1;
      ph[k] = p;
      s += 2 * p - 1 - blep(p, inc);
    }
    out[i] = lp.process(s * 0.33) * env;
  }
  return done(out, { fadeOut: 10, grit: 0, lp: 0 });
}

export const horn = (m, dur, o = {}) => SHARED.get(`horn${m}:${dur}:${okey(o)}`, () => render_horn(m, dur, o));
function render_horn(m, dur, o) {
  const f = mtof(m);
  const att = o.attack ?? 0.07;
  const rel = o.release ?? 0.16;
  const bright = o.bright ?? 1;
  const n = samples(dur + rel + 0.02);
  const out = new Float32Array(n);
  const saw = new Osc(0);
  const pul = new Osc(0.25);
  const lp = new Biquad('lp', 1000, 0.85);
  let env = 0;
  let step = 0;
  let fr = f;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const t = i / SR;
      const open = smooth(t / 0.1) * (1 - 0.4 * smooth((t - 0.1) / 0.6));                // the bell opens with the attack, then settles
      fr = f * (1 - 0.016 * Math.exp(-t / 0.045)) * (1 + 0.0042 * Math.sin(TAU * 5.6 * t) * smooth((t - 0.3) / 0.4));
      env = adsr(t, dur, att, 0.15, 0.85, rel);
      step = (adsr((i + 16) / SR, dur, att, 0.15, 0.85, rel) - env) / 16;
      if ((i & 31) === 0) lp.set('lp', Math.min(f * (1.6 + 5.2 * open) * bright, 9000), 0.85);
    }
    env += step;
    out[i] = lp.process(saw.saw(fr) * 0.55 + pul.pulse(fr * 1.003, 0.4) * 0.4) * env;
  }
  return done(out, { fadeOut: 12, grit: 0.25 });
}

const VOWELS = {
  a: [[730, 1, 6], [1090, 0.55, 8], [2440, 0.22, 10]],
  o: [[570, 1, 6], [840, 0.45, 8], [2410, 0.12, 10]],
  u: [[320, 1, 5], [800, 0.4, 7], [2200, 0.06, 10]],
  e: [[530, 1, 6], [1840, 0.5, 8], [2480, 0.25, 10]],
};
export const choir = (m, dur, o = {}) => SHARED.get(`choir${m}:${dur}:${okey(o)}`, () => render_choir(m, dur, o));
function render_choir(m, dur, o) {
  const f = mtof(m);
  const att = o.attack ?? 0.5;
  const rel = o.release ?? 0.7;
  const vow = VOWELS[o.vowel || 'a'];
  const sc = f > 330 ? 1.12 : f > 220 ? 1.04 : 1;                                       // higher voices open the throat a little
  const bps = vow.map(([fc, , q]) => new Biquad('bp', fc * sc, q));
  const nz = new Noise(seedOf(`choir${m}:${dur}`));
  const n = samples(dur + rel);
  const out = new Float32Array(n);
  const det = [0.9955, 1.0045];
  const ph = [0, 0.5];
  let env = 0;
  let step = 0;
  let vib = 1;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const t = i / SR;
      env = adsr(t, dur, att, 0.3, 0.9, rel);
      step = (adsr((i + 16) / SR, dur, att, 0.3, 0.9, rel) - env) / 16;
      vib = 1 + 0.005 * Math.sin(TAU * 5 * t) * smooth((t - 0.4) / 0.5);
    }
    env += step;
    let src = 0;
    for (let k = 0; k < 2; k++) {
      const inc = (f * det[k] * vib) / SR;
      let p = ph[k] + inc;
      if (p >= 1) p -= 1;
      ph[k] = p;
      src += 2 * p - 1 - blep(p, inc);
    }
    src = src * 0.5 + nz.white() * 0.03;                                               // the voice and its breath
    let y = 0;
    for (let k = 0; k < 3; k++) y += bps[k].process(src) * vow[k][1];
    out[i] = y * env;
  }
  return done(out, { fadeOut: 10, grit: 0, lp: 0 });
}

export const glassharm = (m, dur, o = {}) => SHARED.get(`gh${m}:${dur}:${okey(o)}`, () => render_glassharm(m, dur, o));
function render_glassharm(m, dur, o) {
  const f = mtof(m);
  const att = o.attack ?? 0.2;
  const rel = o.release ?? 0.4;
  const n = samples(dur + rel);
  const out = new Float32Array(n);
  const osc = new Osc();
  const nz = new Noise(seedOf(`gh${m}:${dur}`));
  const rub = new Biquad('bp', 3200, 1.2);
  const amps = [1, 0.2, 0.07];
  let env = 0;
  let step = 0;
  let vib = 1;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const t = i / SR;
      env = adsr(t, dur, att, 0.25, 0.85, rel);
      step = (adsr((i + 16) / SR, dur, att, 0.25, 0.85, rel) - env) / 16;
      vib = 1 + 0.0028 * Math.sin(TAU * 4.7 * t) * smooth((t - 0.15) / 0.4);
    }
    env += step;
    out[i] = (osc.add(f * vib, amps) + rub.process(nz.white()) * 0.03) * env;
  }
  return done(out, { fadeOut: 12, grit: 0.05, lp: 0 });
}

export const whistle = (m, dur, o = {}) => SHARED.get(`whs${m}:${dur}:${okey(o)}`, () => render_whistle(m, dur, o));
function render_whistle(m, dur, o) {
  const f = mtof(m);
  const rel = o.release ?? 0.1;
  const n = samples(dur + rel + 0.02);
  const out = new Float32Array(n);
  const osc = new Osc();
  const nz = new Noise(seedOf(`whs${m}:${dur}`));
  const bp = new Biquad('bp', Math.min(f * 3.1, 8000), 3);
  const amps = [1, 0.18, 0.06];
  let env = 0;
  let step = 0;
  let fr = f;
  let breath = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 7) === 0) {
      const t = i / SR;
      fr = f * (1 + 0.005 * Math.sin(TAU * 5.8 * t) * smooth((t - 0.35) / 0.3)) * (1 - 0.012 * Math.exp(-t / 0.03));
      env = adsr(t, dur, 0.025, 0.1, 0.92, rel);
      step = (adsr((i + 8) / SR, dur, 0.025, 0.1, 0.92, rel) - env) / 8;
      breath = 0.06 + 0.35 * Math.exp(-t / 0.04);
    }
    env += step;
    out[i] = (osc.add(fr, amps) + bp.process(nz.white()) * breath) * env;
  }
  return done(out, { fadeOut: 8 });
}

export const reed = (m, dur, o = {}) => SHARED.get(`reed${m}:${dur}:${okey(o)}`, () => render_reed(m, dur, o));
function render_reed(m, dur, o) {
  const f = mtof(m);
  const att = o.attack ?? 0.03;
  const rel = o.release ?? 0.09;
  const n = samples(dur + rel);
  const out = new Float32Array(n);
  const pul = new Osc(0);
  const saw = new Osc(0.4);
  const lp = new Biquad('lp', o.cut ?? 2100, 0.8);
  let env = 0;
  let step = 0;
  let trem = 1;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const t = i / SR;
      env = adsr(t, dur, att, 0.1, 0.9, rel);
      step = (adsr((i + 16) / SR, dur, att, 0.1, 0.9, rel) - env) / 16;
      trem = 1 - 0.1 * (0.5 + 0.5 * Math.sin(TAU * 5.1 * t));
    }
    env += step;
    out[i] = lp.process(pul.pulse(f, 0.3) * 0.5 + saw.saw(f * 1.004) * 0.45) * env * trem;
  }
  return done(out, { fadeOut: 8, grit: 0.15 });
}

export const shawm = (m, dur, o = {}) => SHARED.get(`shawm${m}:${dur}:${okey(o)}`, () => render_shawm(m, dur, o));
function render_shawm(m, dur, o) {
  const f = mtof(m);
  const att = o.attack ?? 0.025;
  const rel = o.release ?? 0.12;
  const n = samples(dur + rel + 0.02);
  const out = new Float32Array(n);
  const pul = new Osc(0);
  const saw = new Osc(0.3);
  const nasal = new Biquad('bp', clamp(f * 3.2, 900, 2600), 2.2);
  const lp = new Biquad('lp', 4200 * (o.bright ?? 1), 0.8);
  const nz = new Noise(seedOf(`shawm${m}:${dur}`));
  let env = 0;
  let step = 0;
  let fr = f;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const t = i / SR;
      fr = f * (1 - 0.025 * Math.exp(-t / 0.04)) * (1 + 0.006 * Math.sin(TAU * 5.8 * t) * smooth((t - 0.12) / 0.2));
      env = adsr(t, dur, att, 0.12, 0.92, rel);
      step = (adsr((i + 16) / SR, dur, att, 0.12, 0.92, rel) - env) / 16;
    }
    env += step;
    const x = pul.pulse(fr, 0.2) * 0.5 + saw.saw(fr * 1.003) * 0.4 + nz.white() * 0.02;
    out[i] = (lp.process(x) * 0.45 + nasal.process(x) * 1.1) * env;
  }
  return done(out, { fadeOut: 10, grit: 0.25 });
}

export const subbass = (m, dur, o = {}) => SHARED.get(`sub${m}:${dur}:${okey(o)}`, () => render_subbass(m, dur, o));
function render_subbass(m, dur, o) {
  const f = mtof(m);
  const att = o.attack ?? 0.012;
  const rel = o.release ?? 0.12;
  const n = samples(dur + rel);
  const out = new Float32Array(n);
  const osc = new Osc();
  const amps = [1, 0.5, 0.24, 0.1];                                                    // (a phone's speaker has nothing under 150 Hz: the pedal lives on its harmonics)
  let env = 0;
  let step = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      env = adsr(i / SR, dur, att, 0.2, 0.9, rel);
      step = (adsr((i + 16) / SR, dur, att, 0.2, 0.9, rel) - env) / 16;
    }
    env += step;
    out[i] = osc.add(f, amps) * env;
  }
  return done(out, { fadeOut: 10, grit: 0, lp: 0 });
}

export const sawbass = (m, dur, o = {}) => SHARED.get(`swb${m}:${dur}:${okey(o)}`, () => render_sawbass(m, dur, o));
function render_sawbass(m, dur, o) {
  const f = mtof(m);
  const rel = o.release ?? 0.05;
  const n = samples(dur + rel);
  const out = new Float32Array(n);
  const a = new Osc(0);
  const b = new Osc(0.5);
  const lp = new Biquad('lp', 600, 1.1);
  const top = o.bright ?? 1;
  let env = 0;
  let step = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const t = i / SR;
      env = adsr(t, dur, 0.004, 0.12, 0.75, rel);
      step = (adsr((i + 16) / SR, dur, 0.004, 0.12, 0.75, rel) - env) / 16;
      if ((i & 31) === 0) lp.set('lp', Math.min(f * (2 + 8 * top * Math.exp(-t / 0.09)), 6000), 1.1);   // the filter snaps shut
    }
    env += step;
    out[i] = lp.process(a.saw(f) * 0.6 + b.saw(f * 1.0035) * 0.4) * env;
  }
  return done(out, { fadeOut: 8, grit: 0.25 });
}

// ---------------------------------------------------------------------------------------------
// Drums and the rest of the kit
// ---------------------------------------------------------------------------------------------
export const timpani = (m) => SHARED.get('timp' + m, () => render_timpani(m));
function render_timpani(m) {
  const f = mtof(m);
  const modes = [[1, 1, 0.75], [1.5, 0.55, 0.5], [1.99, 0.3, 0.32], [2.44, 0.16, 0.2], [2.9, 0.08, 0.14]];
  const ds = clamp(Math.pow(110 / f, 0.3), 0.6, 1.4);
  const ph = modes.map(() => 0);
  const nz = new Noise(seedOf('timp' + m));
  const lp = new Biquad('lp', 700, 0.7);
  return done(gen(2, (t) => {
    const sweep = 1 + 0.25 * Math.exp(-t / 0.045);
    let s = 0;
    for (let k = 0; k < modes.length; k++) {
      ph[k] += (f * modes[k][0] * sweep) / SR;
      s += Math.sin(TAU * ph[k]) * modes[k][1] * Math.exp(-t / (modes[k][2] * ds));
    }
    s += lp.process(nz.white()) * 0.5 * Math.exp(-t / 0.012);
    return s * Math.min(1, t / 0.002);
  }), { fadeOut: 40 });
}

export const taiko = () => SHARED.get('taiko', () => drum('taiko', 170, 62, 0.055, 0.26, 0.9, 0.22, 0.45));

export const anvil = () => SHARED.get('anvil', () => {
  const b = barVoice(760, 1.1, [[1, 1, 0.32], [2.32, 0.7, 0.2], [3.87, 0.5, 0.13], [5.41, 0.38, 0.09], [7.13, 0.22, 0.06], [0.25, 0.5, 0.06]], { attack: 0.0006 });
  const nz = new Noise(seedOf('anvil'));
  const bp = new Biquad('bp', 2600, 0.8);
  for (let i = 0; i < 60; i++) b[i] += bp.process(nz.white()) * 0.5 * (1 - i / 60);
  return done(b, { fadeOut: 20 });
});

export const hat = (kind = 'closed') => SHARED.get('hat' + kind, () => {
  const open = kind === 'open';
  const nz = new Noise(seedOf('hat' + kind));
  const hp = new Biquad('hp', 6800, 0.7);
  const bp = new Biquad('bp', 9200, 0.8);
  return done(gen(open ? 0.36 : 0.09, (t) => hp.process(bp.process(nz.white())) * ad(t, 0.0008, open ? 0.11 : 0.017)), { grit: 0.15, lp: 10200 });
});

export const snare = (kind = 'snare') => SHARED.get('snr' + kind, () => {
  const nz = new Noise(seedOf('snr' + kind));
  if (kind === 'rim') {
    return done(gen(0.09, (t) => (Math.sin(TAU * 1750 * t) * Math.exp(-t / 0.005) + 0.6 * Math.sin(TAU * 480 * t) * Math.exp(-t / 0.02) + nz.white() * 0.3 * Math.exp(-t / 0.003)) * Math.min(1, t / 0.0006)), { fadeOut: 8 });
  }
  if (kind === 'brush') {
    const bp = new Biquad('bp', 3800, 0.5);
    return done(gen(0.26, (t) => bp.process(nz.white()) * ad(t, 0.012, 0.1)), { grit: 0.2 });
  }
  const bp = new Biquad('bp', 4200, 0.6);
  const hp = new Biquad('hp', 1200, 0.7);
  let ph = 0;
  return done(gen(0.32, (t) => {
    ph += (185 + 75 * Math.exp(-t / 0.012)) / SR;
    return (Math.sin(TAU * ph) * Math.exp(-t / 0.055) * 0.6 + hp.process(bp.process(nz.white())) * 1.6 * Math.exp(-t / 0.1)) * Math.min(1, t / 0.001);
  }), { fadeOut: 14 });
});

export const crash = () => SHARED.get('crash', () => {
  const nz = new Noise(seedOf('crash'));
  const hp = new Biquad('hp', 2500, 0.7);
  const metal = [[2100, 1], [3300, 0.8], [4700, 0.7], [6100, 0.5], [7900, 0.35]];
  return done(gen(2.6, (t) => {
    let s = hp.process(nz.white()) * 0.55;
    for (const [fr, a] of metal) s += 0.16 * a * Math.sin(TAU * fr * t) * (0.6 + 0.4 * Math.sin(TAU * (7 + fr * 0.001) * t));
    return s * ad(t, 0.003, 0.7);
  }), { grit: 0.2, fadeOut: 60 });
});

export const triangle = (m = 96) => SHARED.get('tri' + m, () => {
  const f = mtof(m);
  return done(barVoice(f, 1.6, [[1, 1, 0.9], [2.76, 0.5, 0.6], [5.4, 0.3, 0.35], [8.93, 0.15, 0.2]], { attack: 0.0006 }), { grit: 0.15, fadeOut: 40 });
});

/** Swept noise of `dur` seconds: 'wave' (washes in and out), 'wind', 'riser' (a rising hiss that stops), 'wash' (a cymbal swell). */
export const swell = (kind, dur) => SHARED.get(`swl${kind}:${dur}`, () => render_swell(kind, dur));
function render_swell(kind, dur) {
  const n = samples(dur);
  const out = new Float32Array(n);
  const nz = new Noise(seedOf(`swl${kind}:${dur}`));
  const sv = new SVF();
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const w = nz.white();
    let y;
    if (kind === 'wave') {
      const a = Math.pow(Math.sin(Math.PI * Math.pow(x, 0.7)), 1.5);
      sv.setup(400 + 2200 * a, 0.8);
      sv.tick(w);
      y = sv.lp * a;
    } else if (kind === 'wind') {
      const a = smooth(x * 3) * smooth((1 - x) * 3) * (0.8 + 0.2 * Math.sin(TAU * 3 * x));
      sv.setup(700 + 800 * Math.sin(Math.PI * x), 1.2);
      sv.tick(w);
      y = sv.bp * a;
    } else if (kind === 'riser') {
      const a = x * x * (x < 0.97 ? 1 : smooth((1 - x) / 0.03));
      sv.setup(300 * Math.pow(20, x), 0.8);
      sv.tick(w);
      y = sv.hp * a;
    } else { // wash
      const a = x < 0.35 ? smooth(x / 0.35) : Math.exp(-(x - 0.35) / 0.3);
      sv.setup(5500, 0.5);
      sv.tick(w);
      y = (sv.bp * 0.7 + sv.hp * 0.5) * a;
    }
    out[i] = y;
  }
  return done(out, { grit: 0.1, fadeIn: 5, fadeOut: 30 });
}
