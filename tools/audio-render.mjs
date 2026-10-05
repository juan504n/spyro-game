#!/usr/bin/env node
// Renders the whole Gloaming Vale audio layer in Node (no browser), prints per-sound diagnostics and
// writes 16-bit WAVs, so every sound can be checked or auditioned without running the game.
//
//   node tools/audio-render.mjs <outDir> [--only=<regex>] [--no-wav] [--x2] [--analyze]
//
//   outDir     where the .wav files go (created if missing); keep it outside the repo
//   --only     render/print only assets whose name matches the regex
//   --no-wav   diagnostics only
//   --x2       also write "<name>_x2.wav" (two back-to-back repetitions) for every loop / music / ambience
//              asset, so the loop seam can be auditioned
//   --analyze  add spectral peaks (with note names) per sound and a per-bar pitch-class table for the music
//
// Diagnostics per asset: duration, peak and RMS in dBFS, count of clipped samples, DC offset, first /
// last sample (one-shots must start and end at silence), spectral centroid and dominant frequency,
// and for loops the SEAM: the curvature (second difference) across the loop point compared with the
// curvature everywhere else in the loop (a click shows up as a value above every interior one).
// Exit code 1 if any hard check fails (NaN, clipping, DC, click at the edges, loop seam, composition errors).

import fs from 'node:fs';
import path from 'node:path';
import { assetJobs, pcmBytes, runJob } from '../src/engine/audio/assets.js';
import { SR } from '../src/engine/audio/synth.js';
import { LOOP_NAMES } from '../src/engine/audio/sfx.js';
import { validateComposition, BEAT, BARS } from '../src/engine/audio/composition.js';
import { SCORES, SONG_IDS, songBuffers } from '../src/engine/audio/songs.js';
import { validateScore } from '../src/engine/audio/song.js';

const args = process.argv.slice(2);
const cli = new Set(args.filter((a) => a.startsWith('--') && !a.includes('=')));
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const outDir = args.find((a) => !a.startsWith('--'));
const onlyRe = only ? new RegExp(only) : null;
const writeWav = !cli.has('--no-wav') && outDir;
if (writeWav) fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------------------------
const dB = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const LOOP_SET = new Set([...LOOP_NAMES, 'amb_dusk', 'amb_day', ...SONG_IDS.flatMap((id) => Object.values(songBuffers(id)).filter(Boolean))]);
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (f) => {
  const m = 69 + 12 * Math.log2(f / 440);
  const r = Math.round(m);
  return `${NOTE[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
};

function writeWavFile(file, chans, sr = SR) {
  const n = chans[0].length;
  const nc = chans.length;
  const b = Buffer.alloc(44 + n * nc * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * nc * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(nc, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * nc * 2, 28);
  b.writeUInt16LE(nc * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * nc * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nc; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      b.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  fs.writeFileSync(file, b);
}

function fft(re, im) {
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

/** Magnitude spectrum of x[start .. start+len) zero-padded to `size` (Tukey window, 2% tapers: percussive sounds live at the very start, so no Hann). */
function spectrum(x, start, len, size) {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const taper = Math.max(1, Math.round(len * 0.02));
  for (let i = 0; i < len && start + i < x.length; i++) {
    const w = i < taper ? 0.5 - 0.5 * Math.cos((Math.PI * i) / taper) : i >= len - taper ? 0.5 - 0.5 * Math.cos((Math.PI * (len - 1 - i)) / taper) : 1;
    re[i] = x[start + i] * w;
  }
  fft(re, im);
  const mag = new Float64Array(size / 2);
  for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

function analyseSpectrum(mono, size = 1 << 16, sr = SR) {
  const len = Math.min(mono.length, size);
  const start = Math.max(0, ((mono.length - len) / 2) | 0);
  let n = 1024;
  while (n < len * 2) n <<= 1;
  const mag = spectrum(mono, start, len, n);
  let wsum = 0, s = 0, low = 0, mid = 0, high = 0, tot = 0;
  for (let i = 1; i < mag.length; i++) {
    const f = (i * sr) / n;
    const e = mag[i] * mag[i];
    wsum += f * mag[i];
    s += mag[i];
    tot += e;
    if (f < 250) low += e; else if (f < 2000) mid += e; else high += e;
  }
  const peaks = [];
  const m2 = Float64Array.from(mag);
  for (let k = 0; k < 3; k++) {
    let bi = 1;
    for (let i = 2; i < m2.length; i++) if (m2[i] > m2[bi]) bi = i;
    if (m2[bi] <= 0) break;
    const f = (bi * sr) / n;
    peaks.push(f);
    const lo = Math.max(1, Math.floor(bi * 0.94));
    const hi = Math.min(m2.length - 1, Math.ceil(bi * 1.06));
    for (let i = lo; i <= hi; i++) m2[i] = 0;
  }
  return { centroid: wsum / s, peaks, low: low / tot, mid: mid / tot, high: high / tot };
}

/**
 * Loop seam test. A click at the loop point shows up as an outsized SECOND difference (the signal's
 * curvature), so compare the two second differences that straddle the seam with the distribution of
 * all interior ones: `pct` = rank among them, `ratio` = seam / RMS, `maxRatio` = seam / interior maximum.
 * (A healthy periodic loop's seam is just another sample: any rank, maxRatio well under 1.)
 */
function seamOf(x) {
  const N = x.length;
  const dd = (a, b, c) => Math.abs(c - 2 * b + a);
  const seam = Math.max(dd(x[N - 2], x[N - 1], x[0]), dd(x[N - 1], x[0], x[1]));
  let mx = 0;
  let ss = 0;
  let below = 0;
  for (let i = 1; i < N - 1; i++) {
    const d = dd(x[i - 1], x[i], x[i + 1]);
    ss += d * d;
    if (d > mx) mx = d;
    if (d < seam) below++;
  }
  return { step: seam, ratio: seam / Math.max(Math.sqrt(ss / (N - 2)), 1e-9), pct: (100 * below) / (N - 2), maxRatio: seam / Math.max(mx, 1e-9) };
}

// ---------------------------------------------------------------------------------------------
const problems = [...validateComposition(), ...Object.values(SCORES).flatMap((sc) => validateScore(sc))];
console.log(problems.length ? `composition: ${problems.length} PROBLEM(S)\n  ${problems.join('\n  ')}` : `composition: structure OK (Vale's tune: 16 bars, every bar sums to 8 eighths, all patterns 16 steps; the scores of ${Object.keys(SCORES).join(', ')}: bars add up, chords parse, patterns fit, notes in range)`);

const out = {};
const jobs = assetJobs(out, { stats: true, all: true });
const rows = [];
const hardFails = [];
const t0 = performance.now();
const groupMs = {};

for (const job of jobs) {
  const a = performance.now();
  runJob(job);
  const ms = performance.now() - a;
  const g = job.name.startsWith('music:') || job.name.startsWith('song:') ? 'music' : job.name.startsWith('amb_') ? 'ambience' : job.name.startsWith('stinger_') ? 'stingers' : 'sfx';
  groupMs[g] = (groupMs[g] || 0) + ms;
  for (const k of Object.keys(out)) {
    if (k === 'stats' || out[k].__done) continue;
    const v = out[k];
    const chans = v instanceof Float32Array ? [v] : [v.L, v.R];
    Object.defineProperty(v, '__done', { value: true, enumerable: false });
    if (onlyRe && !onlyRe.test(k)) continue;
    const isLoop = LOOP_SET.has(k);
    const sr = v.sr || SR;                       // (the gem chimes carry their own rate: 48 kHz)
    const N = chans[0].length;
    let peak = 0, sq = 0, clip = 0, dc = 0, nan = 0;
    for (const c of chans) {
      let m = 0;
      for (let i = 0; i < N; i++) {
        const x = c[i];
        if (x !== x || x === Infinity || x === -Infinity) { nan++; continue; }
        const ax = x < 0 ? -x : x;
        if (ax > peak) peak = ax;
        if (ax >= 0.9999) clip++;
        sq += x * x;
        m += x;
      }
      dc = Math.max(dc, Math.abs(m / N));
    }
    const rms = Math.sqrt(sq / (N * chans.length));
    const edge = Math.max(...chans.map((c) => Math.max(Math.abs(c[0]), Math.abs(c[N - 1]))));
    const seams = isLoop ? chans.map(seamOf) : [];
    const seam = isLoop ? Math.max(...seams.map((q) => q.pct)) : 0;
    const seamRatio = isLoop ? Math.max(...seams.map((q) => q.ratio)) : 0;
    const seamMax = isLoop ? Math.max(...seams.map((q) => q.maxRatio)) : 0;
    const mono = chans.length === 1 ? chans[0] : Float32Array.from(chans[0], (x, i) => (x + chans[1][i]) * 0.5);
    const sp = analyseSpectrum(mono, 1 << 16, sr);
    const flags = [];
    if (nan) flags.push(`NaN x${nan}`);
    if (clip) flags.push(`CLIP x${clip}`);
    if (dc > 0.004) flags.push('DC');
    if (!isLoop && edge > 0.001) flags.push('EDGE-CLICK');
    if (isLoop && seamMax > 1.0) flags.push('SEAM');
    const isShot = !k.startsWith('stinger_') && !LOOP_SET.has(k);
    if (isShot && (dB(peak) > -1 || dB(peak) < -4)) flags.push('PEAK-RANGE');
    if (dB(peak) > -0.5) flags.push('HOT');
    if (flags.some((f) => /NaN|CLIP|DC|EDGE|SEAM/.test(f))) hardFails.push(`${k}: ${flags.join(' ')}`);
    rows.push({ k, kind: isLoop ? 'loop' : k.startsWith('stinger_') ? 'sting' : 'shot', ch: chans.length, dur: N / sr, peak: dB(peak), rms: dB(rms), clip, dc, edge, seam, seamRatio, seamMax, sp, flags, ms: job.name === k ? ms : NaN });
    if (writeWav) {
      writeWavFile(path.join(outDir, `${k}.wav`), chans, sr);
      if (flags2x(k)) writeWavFile(path.join(outDir, `${k}_x2.wav`), chans.map((c) => Float32Array.from([...c, ...c])), sr);
    }
  }
}
function flags2x(k) {
  return cli.has('--x2') && LOOP_SET.has(k);
}

// ---------------------------------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const num = (v, d = 1, n = 6) => (Number.isFinite(v) ? v.toFixed(d) : '-').padStart(n);
console.log('\n' + pad('asset', 18) + pad('kind', 6) + 'ch  ' + ' dur(s)' + '  peak' + '   rms' + '  clip' + '   dc(dB)' + '  edge(dB)' + '  seam%' + ' /rms' + ' /max' + '  centroid' + '  peakHz' + '  <250/mid/>2k %' + '  flags');
for (const r of rows) {
  console.log(
    pad(r.k, 18) + pad(r.kind, 6) + pad(r.ch, 3) + num(r.dur, 2, 7) + num(r.peak, 1, 6) + num(r.rms, 1, 6) + String(r.clip).padStart(5) +
    num(dB(r.dc), 0, 9) + (r.kind === 'loop' ? '        -' : num(dB(r.edge), 0, 9)) + (r.kind === 'loop' ? num(r.seam, 1, 8) + num(r.seamRatio, 1, 5) + num(r.seamMax, 2, 5) : '       -    -    -') +
    num(r.sp.centroid, 0, 10) + num(r.sp.peaks[0], 0, 8) + '  ' + [r.sp.low, r.sp.mid, r.sp.high].map((v) => (v * 100).toFixed(0).padStart(3)).join('/') + '  ' + r.flags.join(' ') +
    (cli.has('--analyze') && r.sp.peaks.length ? '   peaks: ' + r.sp.peaks.map((f) => `${noteName(f)}(${f.toFixed(0)})`).join(' ') : ''),
  );
}

if (out.stats) {
  console.log('\nmusic dry layer RMS (dB, before reverb / master):');
  for (const [v, s] of Object.entries(out.stats)) console.log('  ' + pad(v, 9) + Object.entries(s).map(([k, x]) => `${k} ${x.toFixed(1)}`).join('   '));
}

if (cli.has('--analyze') && (out.gloaming || out.daybreak)) {
  console.log('\nper-bar pitch classes (top 5, % of energy; out-of-mode % should stay small):');
  for (const v of ['gloaming', 'daybreak']) {
    if (!out[v]) continue;
    const x = Float32Array.from(out[v].L, (s, i) => (s + out[v].R[i]) * 0.5);
    const outMode = v === 'gloaming' ? [1, 6, 8, 10, 3] : [5, 0, 10, 3];
    console.log(' ' + v);
    for (let b = 0; b < BARS; b++) {
      const mag = spectrum(x, Math.round(b * 4 * BEAT * SR) + 2000, 32768, 32768);
      const c = new Float64Array(12);
      for (let i = 1; i < mag.length; i++) {
        const f = (i * SR) / 32768;
        if (f < 90 || f > 2400) continue;
        c[(((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12)] += mag[i] * mag[i];
      }
      const tot = c.reduce((p, q) => p + q, 0) || 1;
      const top = [...c].map((e, i) => [NOTE[i], e / tot]).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([n, e]) => `${n}:${(e * 100).toFixed(0)}`).join(' ');
      const oo = outMode.reduce((p, i) => p + c[i], 0) / tot;
      console.log('  bar ' + String(b + 1).padStart(2) + '  ' + pad(top, 30) + 'out-of-mode ' + (oo * 100).toFixed(1) + '%');
    }
  }
}

const total = performance.now() - t0;
console.log(`\n${rows.length} assets, ${(pcmBytes(out) / 1e6).toFixed(1)} MB of Float32 PCM, render ${total.toFixed(0)} ms ` +
  `(${Object.entries(groupMs).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')})` + (writeWav ? `, WAVs -> ${outDir}` : ''));
const warns = rows.filter((r) => r.flags.length).length;
console.log(`${warns} asset(s) with flags; ${hardFails.length} hard failure(s)${hardFails.length ? ':\n  ' + hardFails.join('\n  ') : ''}`);
process.exit(hardFails.length || problems.length ? 1 : 0);
