#!/usr/bin/env node
// The sample bank read back: every voice of the songs rendered at a few pitches and measured, so a voice can be checked without
// listening (the pitch it really has, how loud, how bright, how long it rings, what it costs), and optionally a spectrogram per voice.
//
//   node tools/voice-sheet.mjs [--png <dir>] [--only=<regex>]
//
// Exit code 1 if a voice is silent, clipped, not at the pitch it was asked for (more than 25 cents off), or contains NaN.

import fs from 'node:fs';
import path from 'node:path';
import * as I from '../src/engine/audio/instruments.js';
import * as V from '../src/engine/audio/voices.js';
import { SR, rmsOf, peakOf } from '../src/engine/audio/synth.js';
import { peakHz, f0Auto, midiOfHz, brightness, decayTime, spectrogramRGBA, montagePNG } from './lib/music-dsp.mjs';

const args = process.argv.slice(2);
const pngDir = args.includes('--png') ? args[args.indexOf('--png') + 1] : null;
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const onlyRe = only ? new RegExp(only) : null;
if (pngDir) fs.mkdirSync(pngDir, { recursive: true });

// [name, maker(m) -> samples, pitches, pitched?]
const D = 1.6; // seconds a sustained voice is held in this test
const VOICES = [
  ['celesta', (m) => I.celesta(m), [72, 84], true],
  ['harp', (m) => V.harp(m), [48, 60, 72, 84], true],
  ['glass', (m) => V.glass(m), [72, 84, 96], true],
  ['epiano', (m) => V.epiano(m), [48, 60, 72], true],
  ['kalimba', (m) => V.kalimba(m), [60, 72, 84], true],
  ['strings', (m) => V.strings(m, D), [48, 60, 72], true],
  ['horn', (m) => V.horn(m, D), [48, 60, 72], true],
  ['choir', (m) => V.choir(m, D), [48, 60, 72], true],
  ['glassharm', (m) => V.glassharm(m, D), [60, 72, 84], true],
  ['whistle', (m) => V.whistle(m, D), [72, 84], true],
  ['reed', (m) => V.reed(m, D), [48, 60, 72], true],
  ['shawm', (m) => V.shawm(m, D), [60, 72, 84], true],
  ['subbass', (m) => V.subbass(m, D), [28, 36, 43], true],
  ['sawbass', (m) => V.sawbass(m, D), [28, 36, 43], true],
  ['timpani', (m) => V.timpani(m), [36, 43, 48], true],
  ['taiko', () => V.taiko(), [0], false],
  ['anvil', () => V.anvil(), [0], false],
  ['hat closed', () => V.hat('closed'), [0], false],
  ['hat open', () => V.hat('open'), [0], false],
  ['snare', () => V.snare('snare'), [0], false],
  ['snare brush', () => V.snare('brush'), [0], false],
  ['snare rim', () => V.snare('rim'), [0], false],
  ['crash', () => V.crash(), [0], false],
  ['triangle', () => V.triangle(96), [0], false],
  ['swell wave', () => V.swell('wave', 2.4), [0], false],
  ['swell wind', () => V.swell('wind', 3), [0], false],
  ['swell riser', () => V.swell('riser', 2), [0], false],
  ['swell wash', () => V.swell('wash', 2.4), [0], false],
];

const db = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
let fails = 0;
const tiles = [];
const order = [];
console.log('voice'.padEnd(13), 'note'.padStart(4), 'sec'.padStart(5), 'peak'.padStart(6), 'rms'.padStart(6), 'f0 cents'.padStart(9), 'centr'.padStart(6), 'hi%'.padStart(4), 'T-40'.padStart(5), 'ms'.padStart(5));
for (const [name, make, pitches, pitched] of VOICES) {
  if (onlyRe && !onlyRe.test(name)) continue;
  for (const m of pitches) {
    const t0 = performance.now();
    const x = make(m);
    const ms = performance.now() - t0;
    let bad = '';
    if (x.some((v) => !Number.isFinite(v))) bad += ' NaN';
    const pk = peakOf(x);
    if (pk < 0.05) bad += ' SILENT';
    if (pk > 0.99) bad += ' CLIP';
    let cents = '';
    if (pitched) {
      // (two readings: the strongest partial, and the autocorrelation: a bell may have no clear period, a formant voice peaks on a formant)
      const start = Math.round(0.05 * SR);
      const want = midiOfHz(440 * Math.pow(2, (m - 69) / 12));
      const off = (f) => { const c = (midiOfHz(f) - want) * 100; return ((c + 600) % 1200 + 1200) % 1200 - 600; };
      const a = off(peakHz(x, start, 16384));
      const b = off(f0Auto(x, start, 8192) || 1);
      const c = Math.abs(a) < Math.abs(b) ? a : b;
      cents = c.toFixed(0);
      if (Math.abs(c) > 25) bad += ' OFFPITCH';
    }
    const br = brightness(x);
    const tr = decayTime(x, -40);
    console.log(name.padEnd(13), String(pitched ? m : '-').padStart(4), (x.length / SR).toFixed(2).padStart(5), db(pk).padStart(6), db(rmsOf(x)).padStart(6), cents.padStart(9), br.centroid.toFixed(0).padStart(6), (br.hiShare * 100).toFixed(0).padStart(4), (tr === Infinity ? 'inf' : tr.toFixed(2)).padStart(5), ms.toFixed(1).padStart(5), bad ? '  <-- ' + bad.trim() : '');
    if (bad) fails++;
    if (pngDir && m === pitches[Math.min(1, pitches.length - 1)]) {
      // one tile per voice (its second pitch), padded with silence to a common length
      const pad = new Float32Array(Math.round(3.4 * SR));
      pad.set(x.subarray(0, Math.min(x.length, pad.length)));
      tiles.push(spectrogramRGBA(pad, { size: 1024, width: 360, height: 150, floorDb: -70 }));
      order.push(name);
    }
  }
}
if (pngDir && tiles.length) { montagePNG(path.join(pngDir, 'voices.png'), tiles, 3); console.log('\nvoices.png, left to right and top to bottom:', order.join(', ')); }
if (fails) { console.log(`\n${fails} voice(s) failed`); process.exit(1); }
console.log('\nall voices fine');
