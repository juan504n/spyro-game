#!/usr/bin/env node
// A song read back without listening: its score drawn as a piano roll, the rendered loop as a spectrogram, and the numbers a musician would ask
// for (the key and tempo the AUDIO has, how loud each part is, how the loudness moves bar by bar, whether the loop closes).
//
//   node tools/music-sheet.mjs <id> [--out <dir>] [--variant dusk|dawn] [--wav]
//
//   id     a score of src/engine/audio/scores (home, frostbloom, ...)
//   --out  where the PNGs (and WAVs) go (default: the current directory); keep it outside the repo
//   --wav  also write the loops as 16-bit WAV files (to play on a machine with speakers)
//
// <id>-<variant>.png: top, the piano roll (time across, pitch up; one colour per part, brightness = velocity; a line at every bar, bright at every
// fourth, and at every C); middle, the loudness of every bar (RMS of the mastered loop); bottom, the spectrogram.

import fs from 'node:fs';
import path from 'node:path';
import { SCORES, songBuffers } from '../src/engine/audio/songs.js';
import { songJobs, songEvents, validateScore, variantsOf, loopSeconds, unitSec } from '../src/engine/audio/song.js';
import { runJob } from '../src/engine/audio/assets.js';
import { SR, rmsOf, peakOf } from '../src/engine/audio/synth.js';
import { writePNG } from './png.mjs';
import { monoOf, spectrogramRGBA, chromaOf, brightness, seam, keyOf, tempoOf, onsetEnvelope, PC_NAMES } from './lib/music-dsp.mjs';
import { writeWav } from './lib/wav.mjs';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out' && args[args.indexOf(a) - 1] !== '--variant');
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : '.';
const only = args.includes('--variant') ? args[args.indexOf('--variant') + 1] : null;
const score = SCORES[id];
if (!score) { console.error('usage: node tools/music-sheet.mjs <id> [--out dir]; ids:', Object.keys(SCORES).join(' ')); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

const bad = validateScore(score);
if (bad.length) { console.log('SCORE PROBLEMS:\n  ' + bad.join('\n  ')); process.exit(1); }

const dB = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
const PALETTE = [[255, 120, 90], [90, 200, 255], [255, 220, 90], [150, 255, 130], [220, 130, 255], [255, 160, 210], [120, 255, 230], [255, 190, 120], [170, 170, 255], [200, 255, 120], [255, 110, 160], [140, 220, 140]];

const NAMES = PC_NAMES;

for (const variant of variantsOf(score)) {
  if (only && only !== variant) continue;
  const names = songBuffers(id);
  const out = {};
  const t0 = performance.now();
  for (const j of songJobs(score, names, out, { stats: true })) runJob(j);
  const ms = performance.now() - t0;
  const loop = out[names[variant]];
  const mono = monoOf(loop);
  const events = songEvents(score, variant);
  const parts = score.variants[variant].parts;
  const bars = score.bars;
  const secs = loopSeconds(score);
  console.log(`\n== ${id} / ${variant}: ${score.title}  ${score.bpm} bpm  ${score.upb} eighths (${score.groups.join('+')})  ${bars} bars = ${secs.toFixed(1)} s  rendered in ${ms.toFixed(0)} ms`);
  const rms = Math.sqrt((rmsOf(loop.L) ** 2 + rmsOf(loop.R) ** 2) / 2);
  const pk = Math.max(peakOf(loop.L), peakOf(loop.R));
  const sm = seam(loop.L);
  const br = brightness(mono);
  const ch = chromaOf(mono);
  const key = keyOf(ch);
  console.log(`   level ${dB(rms)} dB RMS, peak ${dB(pk)} dB; seam jump ${sm.jump.toFixed(4)} (largest step inside ${sm.maxStep.toFixed(4)}); centroid ${br.centroid.toFixed(0)} Hz, ${(br.hiShare * 100).toFixed(1)}% above 4 kHz`);
  console.log(`   key by ear of the audio: ${key.name} (r=${key.r.toFixed(2)}); score says ${score.tonic}; tempo of the onsets ~${tempoOf(mono).toFixed(0)} bpm (the score: ${score.bpm}, beat ${(60 / score.bpm).toFixed(3)} s)`);
  // the pulse of the bar: onset strength folded over the bar, per half-unit (a sixteenth), so the meter and its groups can be seen in the audio
  {
    const { env, hopSec } = onsetEnvelope(mono);
    const steps = score.upb * 2;
    const bin = new Float64Array(steps);
    const cnt = new Float64Array(steps);
    const bs = score.upb * unitSec(score);
    for (let i = 0; i < env.length; i++) {
      const t = (i * hopSec + 0.012) % bs;
      const k = Math.min(steps - 1, Math.floor((t / bs) * steps));
      bin[k] += env[i]; cnt[k]++;
    }
    const prof = Array.from(bin, (v, k) => v / Math.max(1, cnt[k]));
    const mx = Math.max(...prof) || 1;
    console.log('   pulse   ' + prof.map((v, k) => (k % 2 === 0 && k > 0 && score.groups && [...score.groups].reduce((a, g) => { a.push((a[a.length - 1] || 0) + g); return a; }, [0]).includes(k / 2) ? '|' : '') + ' ' + Math.round((v / mx) * 9)).join('') + '   (onset strength per sixteenth of the bar, 9 = the strongest; | marks the groups)');
  }
  console.log('   chroma  ' + NAMES.map((n, i) => `${n}:${(ch[i] * 100).toFixed(0)}`).join(' '));
  console.log('   parts   ' + parts.map((p, i) => `${i}:${p.type}${p.inst ? '/' + p.inst : ''}${p.level !== undefined ? '@' + p.level : ''}`).join('  '));

  // per-bar loudness
  const spb = loop.L.length / bars;
  const barDb = [];
  for (let b = 0; b < bars; b++) {
    let s = 0;
    const a = Math.round(b * spb), z = Math.round((b + 1) * spb);
    for (let i = a; i < z; i++) s += loop.L[i] * loop.L[i] + loop.R[i] * loop.R[i];
    barDb.push(10 * Math.log10(s / (2 * (z - a)) + 1e-12));
  }
  console.log('   bar dB  ' + barDb.map((d) => d.toFixed(0)).join(' '));

  // ---- the picture
  const W = 1500;
  const rollH = 300, loudH = 50, specH = 220;
  const H = rollH + loudH + specH + 8;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgba[i * 4] = 16; rgba[i * 4 + 1] = 16; rgba[i * 4 + 2] = 22; rgba[i * 4 + 3] = 255; }
  const px = (x, y, r, g, b, a = 1) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const k = (y * W + x) * 4;
    rgba[k] = rgba[k] * (1 - a) + r * a; rgba[k + 1] = rgba[k + 1] * (1 - a) + g * a; rgba[k + 2] = rgba[k + 2] * (1 - a) + b * a;
  };
  const pitched = events.filter((e) => e.m !== undefined);
  const lo = Math.min(...pitched.map((e) => e.m)) - 1;
  const hi = Math.max(...pitched.map((e) => e.m)) + 1;
  const yOf = (m) => Math.round(rollH - 4 - ((m - lo) / (hi - lo)) * (rollH - 12));
  const xOf = (t) => Math.round((t / secs) * (W - 1));
  const barSec = (score.upb * unitSec(score));
  for (let b = 0; b <= bars; b++) { const x = Math.min(W - 1, xOf(b * barSec)); const major = b % 4 === 0; for (let y = 0; y < rollH + loudH; y++) px(x, y, 255, 255, 255, major ? 0.28 : 0.1); }
  for (let m = Math.ceil(lo / 12) * 12; m <= hi; m += 12) for (let x = 0; x < W; x++) px(x, yOf(m), 255, 255, 255, 0.2);
  const order = [...pitched].sort((a, b) => a.vel - b.vel);
  for (const e of order) {
    const c = PALETTE[e.part % PALETTE.length];
    const x0 = xOf(((e.t % secs) + secs) % secs);
    const w = Math.max(2, Math.min(xOf(Math.min(e.len, 4)), 600));
    const y = yOf(e.m);
    const a = 0.35 + 0.65 * Math.min(1, e.vel);
    for (let x = x0; x < Math.min(W, x0 + w); x++) { px(x, y, c[0], c[1], c[2], a); px(x, y - 1, c[0], c[1], c[2], a * 0.8); }
  }
  // loudness strip
  const lmin = Math.min(...barDb), lmax = Math.max(...barDb);
  for (let b = 0; b < bars; b++) {
    const x0 = xOf(b * barSec), x1 = xOf((b + 1) * barSec) - 1;
    const h = Math.round(4 + ((barDb[b] - lmin) / Math.max(1, lmax - lmin)) * (loudH - 8));
    for (let x = x0 + 1; x < x1; x++) for (let y = 0; y < h; y++) px(x, rollH + loudH - 2 - y, 120, 200, 140, 0.9);
  }
  // spectrogram
  const sp = spectrogramRGBA(mono, { size: 2048, width: W, height: specH, floorDb: -72 });
  for (let y = 0; y < specH; y++) for (let x = 0; x < Math.min(W, sp.width); x++) { const a = (y * sp.width + x) * 4; px(x, rollH + loudH + 8 + y, sp.rgba[a], sp.rgba[a + 1], sp.rgba[a + 2], 1); }
  const file = path.join(outDir, `${id}-${variant}.png`);
  writePNG(file, W, H, rgba);
  console.log('   picture ' + file);
  if (args.includes('--wav')) { writeWav(path.join(outDir, `${id}-${variant}.wav`), [loop.L, loop.R]); writeWav(path.join(outDir, `${id}-${variant}-x2.wav`), [Float32Array.from([...loop.L, ...loop.L]), Float32Array.from([...loop.R, ...loop.R])]); }
}
