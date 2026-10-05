// Gloaming Vale audio — the mixing chain every song goes through. Pure DSP (Node + browser).
//
// A song is sequenced into a CIRCULAR stereo mix (`st.L`, `st.R`, `st.N` samples long: notes that run past the end
// wrap onto the start), and this file turns that dry mix into a finished, seamless loop:
//   1. REVERB     the dry mix is high-passed (bass stays dry), preceded by a 4.5 s "pre-roll" copy of the loop's own end,
//                 and sent through the SPU-style reverb (spu.js). The reverb has already heard the end of the loop when the
//                 loop starts, so its tail wraps around perfectly: no seam, no click. The wet level is a fixed ratio of the
//                 dry RMS, both wet channels scaled to equal energy.
//   2. MASTER     dry + wet -> high-cut -> glue compressor -> soft limiter, gained to about -14 dBFS RMS (peaks stay under
//                 -1 dBFS). The pre-roll is then thrown away.
// The state a song brings: { L, R, N, wetRatio } and optionally { reverb: preset name ('hall'), sendHp: 220, lp: 9500,
// comp: { thresholdDb, ratio, attack, release } }.
// Vale's own tune (music.js) and the songs of the other worlds (song.js) share all of it.

import { SR, Biquad, rmsOf, dbToLin, softLimit } from './synth.js';
import { SPUReverb, REVERB_PRESETS, compressStereo } from './spu.js';

export const PREROLL = Math.round(4.5 * SR);
export const MUSIC_TARGET_DB = -14;

/** Add sample `s` into the circular stereo mix at time t (s), equal-power panned; optional truncation with a 15 ms fade. */
export function place(st, s, t, gain, pan = 0, maxLen = 0) {
  const { L, R, N } = st;
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

/** Set up the reverb: the send is the dry mix high-passed (220 Hz unless `st.sendHp`), prefixed with the loop's own tail. */
export function makeVerbState(st) {
  const N = st.N;
  const ext = N + PREROLL;
  const sl = new Float32Array(ext);
  const sr = new Float32Array(ext);
  const hpL = new Biquad('hp', st.sendHp ?? 220, 0.7071);
  const hpR = new Biquad('hp', st.sendHp ?? 220, 0.7071);
  for (let i = 0; i < ext; i++) {
    const k = i < PREROLL ? N - PREROLL + i : i - PREROLL;
    sl[i] = hpL.process(st.L[k]);
    sr[i] = hpR.process(st.R[k]);
  }
  st.send = [sl, sr];
  st.wet = [new Float32Array(ext), new Float32Array(ext)];
  st.verb = new SPUReverb(REVERB_PRESETS[st.reverb ?? 'hall']);
  st.vpos = 0;
}

export function verbChunk(st, seconds) {
  const end = Math.min(st.N + PREROLL, st.vpos + Math.round(seconds * SR));
  st.verb.process(st.send[0], st.send[1], st.wet[0], st.wet[1], st.vpos, end);
  st.vpos = end;
}

/** dry + wet -> high-cut -> compressor -> limiter, to the music's level; the result is `st.out` ({ L, R } over the dry arrays). */
export function* master(st) {
  const N = st.N;
  const ext = N + PREROLL;
  // wet = wetRatio x dry RMS, each wet channel scaled to the same energy (the reverb's L/R delays differ slightly)
  const dryRms = Math.sqrt((rmsOf(st.L) ** 2 + rmsOf(st.R) ** 2) / 2);
  const wetRmsOf = (a) => rmsOf(a.subarray(PREROLL));
  const wgL = (dryRms * st.wetRatio) / Math.max(1e-9, wetRmsOf(st.wet[0]));
  const wgR = (dryRms * st.wetRatio) / Math.max(1e-9, wetRmsOf(st.wet[1]));
  // reuse the reverb-send arrays for the extended mix, and the dry arrays for the final output
  const L = st.send[0];
  const R = st.send[1];
  const lpL = new Biquad('lp', st.lp ?? 9500, 0.7071);
  const lpR = new Biquad('lp', st.lp ?? 9500, 0.7071);
  for (let i = 0; i < ext; i++) {
    const k = i < PREROLL ? N - PREROLL + i : i - PREROLL;
    L[i] = lpL.process(st.L[k] + st.wet[0][i] * wgL);
    R[i] = lpR.process(st.R[k] + st.wet[1][i] * wgR);
  }
  yield;
  // scale into the compressor's sweet spot, compress once, then trim gain against the limiter
  const g0 = dbToLin(MUSIC_TARGET_DB) / Math.max(1e-6, rmsOf(L.subarray(PREROLL)));
  for (let i = 0; i < ext; i++) { L[i] *= g0; R[i] *= g0; }
  const c = st.comp || {};
  compressStereo(L, R, { thresholdDb: c.thresholdDb ?? -13, ratio: c.ratio ?? 2.5, attack: c.attack ?? 0.008, release: c.release ?? 0.2, makeupDb: 0 });
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
