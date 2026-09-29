// Gloaming Vale audio — music renderer. Pure DSP (Node + browser).
//
// Turns composition.js into two time-aligned stereo loops ('gloaming' and 'daybreak'), each
// exactly LOOP_SAMPLES long (41.74 s @ 22050 Hz) and seamless:
//   1. SEQUENCE   every layer places cached instrument samples (instruments.js) into a circular
//                 dry mix (notes that run past the end wrap onto the start).
//   2. REVERB     the dry mix is high-passed (bass stays dry), preceded by a 4.5 s "pre-roll" copy
//                 of the loop's own end, and sent through the SPU-style hall (spu.js). Because the
//                 reverb has already heard the end of the loop when the loop starts, its tail wraps
//                 around perfectly — no seam, no click. The wet level is a fixed ratio of the dry RMS
//                 (gloaming 0.65, daybreak 0.45) with both wet channels scaled to equal energy.
//   3. MASTER     dry + wet -> 9.5 kHz high-cut -> glue compressor -> soft limiter, gained to about
//                 -14 dBFS RMS (peaks stay under -1 dBFS). The pre-roll is then thrown away.
// Rendering is split into small jobs (musicJobs) so the browser can yield between them.

import {
  SR, RNG, seedOf, Biquad, rmsOf, dbToLin, softLimit,
} from './synth.js';
import { SPUReverb, REVERB_PRESETS, compressStereo } from './spu.js';
import * as I from './instruments.js';
import * as C from './composition.js';

const N = C.LOOP_SAMPLES;
const PREROLL = Math.round(4.5 * SR);
export const MUSIC_TARGET_DB = -14;
export { SR };

const barTime = (bar) => bar * C.UNITS * C.UNIT_SEC;
/** Off-beat 8th notes are pushed late by the swing amount. */
const swingOf = (u) => {
  if (Number.isInteger(u) && u % 2 === 1) return C.SWING * C.UNIT_SEC;
  return 0;
};

/** Add sample `s` into the circular stereo mix at time t (s), equal-power panned; optional truncation with a 15 ms fade. */
function place(st, s, t, gain, pan = 0, maxLen = 0) {
  const { L, R } = st;
  const g1 = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const g2 = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  const cut = maxLen > 0 && maxLen < s.length;
  const len = cut ? maxLen : s.length;
  const fade = cut ? Math.min(len, 330) : 0;
  let k = ((Math.round(t * SR) % N) + N) % N;
  let i = 0;
  while (i < len) {
    const end = i + Math.min(len - i, N - k); // one contiguous run before the loop wraps
    if (fade && end > len - fade) {
      for (let j = i; j < end; j++, k++) {
        let v = s[j];
        if (j >= len - fade) v *= (len - j) / fade;
        L[k] += v * g1;
        R[k] += v * g2;
      }
    } else {
      for (let j = i; j < end; j++, k++) {
        const v = s[j];
        L[k] += v * g1;
        R[k] += v * g2;
      }
    }
    i = end;
    if (k === N) k = 0;
  }
}

const isOn = (plan, bar) => plan && plan[bar] === 'x';
/**
 * Timing "human" wobble as a pure function of WHERE in the tune a note is (bar, position), not of
 * render order: both variants push the same beat late/early by the same few milliseconds, so the
 * day/night crossfade never produces flams between the two versions of the same note.
 */
function hj(bar, pos, amt) {
  let h = Math.imul((bar * 131 + Math.round(pos * 8) * 7 + 12345) | 0, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return amt * (((h >>> 8) / 8388608) - 1);
}
const vary = (st, amt) => 1 + st.rng.range(-amt, amt);

/** Melody-style events for one bar: [{t, m, len, vel}]. */
function barNotes(st, bar, str, transpose = 0) {
  const inten = C.INTENSITY[st.variant][bar];
  return C.parseBar(str, st.day).map((e) => ({
    t: barTime(bar) + e.u * C.UNIT_SEC + swingOf(e.u) + hj(bar, e.u, 0.004),
    m: e.m + transpose,
    len: e.len * C.UNIT_SEC,
    vel: (e.u === 0 ? 1 : e.u % 2 === 0 ? 0.88 : 0.78) * (0.55 + 0.45 * inten) * vary(st, 0.05),
  }));
}

// ---------------------------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------------------------
const LAYERS = {
  melody(st) {
    const plan = C.PLAN[st.variant];
    for (let b = 0; b < C.BARS; b++) {
      for (const e of barNotes(st, b, C.MELODY[b])) {
        if (st.day) {
          if (isOn(plan.marimba, b)) place(st, st.bank.get('mar' + e.m, () => I.marimba(e.m)), e.t, 1.35 * e.vel, -0.12);
          if (isOn(plan.celestaDouble, b)) place(st, st.bank.get('cel' + (e.m + 12), () => I.celesta(e.m + 12)), e.t, 0.3 * e.vel, 0.25);
        } else {
          const s = st.bank.get('cel' + e.m, () => I.celesta(e.m));
          if (isOn(plan.celesta, b)) {
            place(st, s, e.t, 0.95 * e.vel, -0.15);
            place(st, s, e.t + 1.5 * C.UNIT_SEC, 0.2 * e.vel, 0.4); // dotted-eighth echo
          }
          if (isOn(plan.musicBoxDouble, b)) place(st, st.bank.get('mbx' + (e.m + 12), () => I.musicBox(e.m + 12)), e.t, 0.28 * e.vel, 0.25);
        }
      }
    }
    if (st.day) {
      // flute: descant in bars 5-12, then doubles the tune an octave up in the last section
      for (let b = 0; b < C.BARS; b++) {
        if (!isOn(C.PLAN.daybreak.flute, b)) continue;
        const str = C.FLUTE_DESCANT[b + 1];
        const notes = str ? barNotes(st, b, str) : barNotes(st, b, C.MELODY[b], 12);
        const amp = str ? 0.55 : 0.65;
        for (const e of notes) {
          const dur = Math.max(0.2, e.len * 0.97);
          place(st, st.bank.get(`flute${e.m}:${Math.round(dur * 20)}`, () => I.flute(e.m, Math.round(dur * 20) / 20)), e.t, amp * e.vel, 0.28);
        }
      }
    }
  },

  pad(st) {
    const slots = C.chordSlots(st.variant);
    const o = st.day ? { cut: 2300, attack: 0.35, release: 0.7 } : { cut: 950, attack: 0.7, release: 0.9 };
    const base = st.day ? 0.36 : 0.42;
    const pans = [-0.5, -0.17, 0.17, 0.5];
    const pre = 0.35;
    for (const c of slots) {
      const inten = C.INTENSITY[st.variant][c.bar];
      const dur = c.len * C.UNIT_SEC + pre + 0.15;
      c.pad.forEach((m, i) => {
        const s = st.bank.get(`pad${st.variant}:${m}:${c.len}`, () => I.pad(m, dur, o));
        place(st, s, barTime(c.bar) + c.u * C.UNIT_SEC - pre, base * (0.4 + 0.6 * inten), pans[i]);
      });
    }
  },

  bass(st) {
    const slots = C.chordSlots(st.variant);
    const plan = C.BASS_PLAN[st.variant];
    for (const c of slots) {
      const pat = C.BASS[plan[c.bar]];
      const inten = C.INTENSITY[st.variant][c.bar];
      for (const [u, deg, len, vel] of pat) {
        const iv = deg === 'R' ? 0 : deg === '5' ? c.t5 : deg === '8' ? 12 : c.t3;
        const m = c.root + iv;
        const uu = c.u + u;
        const t = barTime(c.bar) + uu * C.UNIT_SEC + swingOf(uu) + hj(c.bar, uu, 0.002);
        place(st, st.bank.get('bass' + m, () => I.bass(m)), t, 0.95 * vel * (0.8 + 0.2 * inten) * vary(st, 0.04), 0, Math.round(len * C.UNIT_SEC * SR * 1.05));
      }
    }
  },

  perc(st) {
    const P = C.PERC[st.variant];
    const plan = C.PLAN[st.variant];
    const step = C.UNIT_SEC / 2;
    const kit = st.bank;
    // one pattern string -> hits
    const hits = (bar, pat, sample, gain, pan, alt) => {
      const inten = C.INTENSITY[st.variant][bar];
      let count = 0;
      for (let i = 0; i < 16; i++) {
        const ch = pat[i];
        if (ch === '.') continue;
        const sw = i % 4 === 2 ? C.SWING * C.UNIT_SEC : i % 2 === 1 ? C.SWING * C.UNIT_SEC * 0.5 : 0;
        const t = barTime(bar) + i * step + sw + hj(bar, i * 0.5, 0.003);
        const s = alt && count % 2 === 1 ? alt() : sample();
        place(st, s, t, gain * (Number(ch) / 9) * (0.35 + 0.65 * inten) * vary(st, 0.06), pan);
        count++;
      }
    };
    for (let b = 0; b < C.BARS; b++) {
      const fillBar = b % 4 === 3;
      const bIsB = b >= 8 && b < 12;
      if (!st.day) {
        if (isOn(plan.shaker, b)) hits(b, P.shaker, () => kit.get('shk-s', () => I.shaker('soft')), 0.75, 0.35);
        if (isOn(plan.wood, b)) hits(b, bIsB ? P.woodB : P.wood, () => kit.get('wd-h', () => I.wood('hi')), 0.7, -0.4, () => kit.get('wd-l', () => I.wood('lo')));
        if (isOn(plan.tomL, b)) hits(b, P.tomL, () => kit.get('tom-l', () => I.tom('low')), 1.0, -0.15);
        if (fillBar) {
          hits(b, P.fillTomM, () => kit.get('tom-m', () => I.tom('mid')), 0.85, 0.15);
          hits(b, P.fillTomL, () => kit.get('tom-l', () => I.tom('low')), 0.9, -0.15);
        }
      } else {
        if (isOn(plan.shaker, b)) hits(b, P.shaker, () => kit.get('shk-c', () => I.shaker('crisp')), 0.75, 0.4);
        if (isOn(plan.wood, b)) hits(b, bIsB ? P.woodB : P.wood, () => kit.get('wd-h', () => I.wood('hi')), 0.65, -0.4, () => kit.get('wd-l', () => I.wood('lo')));
        if (isOn(plan.tamb, b)) hits(b, P.tamb, () => kit.get('tamb', () => I.tambourine()), 0.8, -0.3);
        if (isOn(plan.bongo, b)) {
          hits(b, P.bongoLo, () => kit.get('bg-l', () => I.bongo('lo')), 1.0, 0.15);
          hits(b, P.bongoHi, () => kit.get('bg-h', () => I.bongo('hi')), 0.95, 0.3);
          if (fillBar) {
            hits(b, P.fillBongoHi, () => kit.get('bg-h', () => I.bongo('hi')), 0.95, 0.3);
            hits(b, P.fillBongoLo, () => kit.get('bg-l', () => I.bongo('lo')), 1.0, 0.15);
          }
        }
        if (isOn(plan.conga, b)) {
          hits(b, P.congaO, () => kit.get('cg-o', () => I.conga('open')), 1.0, -0.35);
          hits(b, P.congaS, () => kit.get('cg-s', () => I.conga('slap')), 0.9, -0.25);
        }
        if (isOn(plan.kick, b)) hits(b, P.kick, () => kit.get('kick', () => I.kick()), 1.1, 0);
      }
    }
  },

  extras(st) {
    const key = st.variant;
    // pizzicato comping (daybreak)
    if (st.day) {
      const slots = C.chordSlots(key);
      for (const c of slots) {
        const stabs = C.PIZZ_STABS[c.bar >> 2].filter((u) => u >= c.u && u < c.u + c.len);
        for (const u of stabs) {
          const inten = C.INTENSITY[key][c.bar];
          c.pad.forEach((m, i) => {
            if (i === 0) return; // leave the lowest voice to the bass
            const t = barTime(c.bar) + u * C.UNIT_SEC + swingOf(u) + i * 0.006 + hj(c.bar, u, 0.003);
            place(st, st.bank.get('pz' + m, () => I.pizz(m)), t, 0.4 * (0.6 + 0.4 * inten) * vary(st, 0.08), [-0.3, 0, 0.3][i - 1]);
          });
        }
      }
    }
    // sparkle arpeggios at the phrase ends
    for (const [bar, u0, stp, notes, vel] of C.SPARKLES[key]) {
      notes.forEach((nm, i) => {
        const m = C.note(nm, st.day);
        const inst = st.day ? 'cel' : 'mbx';
        const s = st.bank.get(inst + m, () => (st.day ? I.celesta(m) : I.musicBox(m)));
        place(st, s, barTime(bar - 1) + (u0 + i * stp) * C.UNIT_SEC, vel * vary(st, 0.06), -0.3 + i * 0.15);
      });
    }
    // wind-chime glints
    for (const [bar, u, nm, vel] of C.CHIMES[key]) {
      const m = C.note(nm, st.day);
      place(st, st.bank.get('chm' + m, () => I.chime(m)), barTime(bar - 1) + u * C.UNIT_SEC, vel * 0.7, bar % 2 ? -0.45 : 0.45);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Reverb + master
// ---------------------------------------------------------------------------------------------
function makeVerbState(st) {
  const ext = N + PREROLL;
  // reverb send: dry mix high-passed at 220 Hz, prefixed with the loop's own tail
  const sl = new Float32Array(ext);
  const sr = new Float32Array(ext);
  const hpL = new Biquad('hp', 220, 0.7071);
  const hpR = new Biquad('hp', 220, 0.7071);
  for (let i = 0; i < ext; i++) {
    const k = i < PREROLL ? N - PREROLL + i : i - PREROLL;
    sl[i] = hpL.process(st.L[k]);
    sr[i] = hpR.process(st.R[k]);
  }
  st.send = [sl, sr];
  st.wet = [new Float32Array(ext), new Float32Array(ext)];
  st.verb = new SPUReverb(REVERB_PRESETS.hall);
  st.vpos = 0;
}

function verbChunk(st, seconds) {
  const end = Math.min(N + PREROLL, st.vpos + Math.round(seconds * SR));
  st.verb.process(st.send[0], st.send[1], st.wet[0], st.wet[1], st.vpos, end);
  st.vpos = end;
}

function* master(st) {
  const ext = N + PREROLL;
  // wet = wetRatio x dry RMS, each wet channel scaled to the same energy (the reverb's L/R delays differ slightly)
  const dryRms = Math.sqrt((rmsOf(st.L) ** 2 + rmsOf(st.R) ** 2) / 2);
  const wetRmsOf = (a) => rmsOf(a.subarray(PREROLL));
  const wgL = (dryRms * st.wetRatio) / Math.max(1e-9, wetRmsOf(st.wet[0]));
  const wgR = (dryRms * st.wetRatio) / Math.max(1e-9, wetRmsOf(st.wet[1]));
  // reuse the reverb-send arrays for the extended mix, and the dry arrays for the final output
  const L = st.send[0];
  const R = st.send[1];
  const lpL = new Biquad('lp', 9500, 0.7071);
  const lpR = new Biquad('lp', 9500, 0.7071);
  for (let i = 0; i < ext; i++) {
    const k = i < PREROLL ? N - PREROLL + i : i - PREROLL;
    L[i] = lpL.process(st.L[k] + st.wet[0][i] * wgL);
    R[i] = lpR.process(st.R[k] + st.wet[1][i] * wgR);
  }
  yield;
  // scale into the compressor's sweet spot, compress once, then trim gain against the limiter
  const g0 = dbToLin(MUSIC_TARGET_DB) / Math.max(1e-6, rmsOf(L.subarray(PREROLL)));
  for (let i = 0; i < ext; i++) { L[i] *= g0; R[i] *= g0; }
  compressStereo(L, R, { thresholdDb: -13, ratio: 2.5, attack: 0.008, release: 0.2, makeupDb: 0 });
  yield;
  let g = 1;
  const outL = st.L;
  const outR = st.R;
  for (let it = 0; it < 2; it++) {
    let s = 0;
    for (let i = 0; i < N; i++) {
      const a = softLimit(L[PREROLL + i] * g, 0.6, 0.89);
      const b = softLimit(R[PREROLL + i] * g, 0.6, 0.89);
      outL[i] = a;
      outR[i] = b;
      s += a * a + b * b;
    }
    const rms = Math.sqrt(s / (2 * N));
    g *= dbToLin(MUSIC_TARGET_DB) / rms;
  }
  st.out = { L: outL, R: outR };
}

// ---------------------------------------------------------------------------------------------
// Job list
// ---------------------------------------------------------------------------------------------
/** Returns render jobs; results land in out.gloaming / out.daybreak as { L, R } (Float32Array). */
export function musicJobs(out, opts = {}) {
  const bank = new I.Bank();
  const jobs = [];
  if (opts.stats) out.stats = {};
  for (const variant of ['gloaming', 'daybreak']) {
    const st = {
      variant, day: variant === 'daybreak', bank,
      L: new Float32Array(N), R: new Float32Array(N),
      rng: new RNG(seedOf('music-' + variant)),
      wetRatio: variant === 'gloaming' ? 0.65 : 0.45,
    };
    const add = (name, weight, run) => jobs.push({ name: `music:${variant}:${name}`, weight, run });
    // per-layer RMS (dB, dry, before reverb/master) for mix-balance diagnostics
    const layer = (name, weight) => add(name, weight, () => {
      const before = opts.stats ? Float32Array.from(st.L) : null;
      LAYERS[name](st);
      if (before) {
        for (let i = 0; i < N; i++) before[i] = st.L[i] - before[i];
        (out.stats[variant] ??= {})[name] = 20 * Math.log10(rmsOf(before) + 1e-9);
      }
    });
    layer('melody', 3);
    layer('pad', 3);
    layer('bass', 1);
    layer('perc', 2);
    layer('extras', 1);
    add('reverb-prep', 1, () => makeVerbState(st));
    for (let i = 0; i < 5; i++) add(`reverb-${i + 1}`, 1.5, () => verbChunk(st, 9.5));
    add('master', 3, function* () {
      yield* master(st);
      out[variant] = st.out;
      st.L = st.R = st.send = st.wet = null; // drop references to the scratch arrays
    });
  }
  return jobs;
}
