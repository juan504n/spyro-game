#!/usr/bin/env node
// The songs held to account, in Node (no browser): every world has its own song, every score is well formed, every rendered loop is clean, the songs are not alike, and none of them
// changes by accident.
//
//   node tools/music-check.mjs [--write] [--only=<id>] [--quick]
//
//   --write   pin the hash of every rendered loop in tools/music-hash.json (a song changed ON PURPOSE: say so in the commit)
//   --only    check one song (and none of the comparisons between songs)
//   --quick   skip the second render that proves a song is bit-identical every time
//
// Gates (PASS / FAIL lines; exit 1 on any FAIL):
//   world songs   every world of the game (REALMS) has a song, every song is a world of the game
//   score         validateScore: bars add up, chords parse, patterns fit, notes are in their instrument's range and in the scale of the colouring
//   loop          both colourings of a song are the same length, finite, peak under -1 dBFS, -14 dBFS RMS, no DC, and the loop closes (the curvature at the loop point is no bigger than the
//                 99.9th percentile of the curvature inside it)
//   scale         at least 80% of the audio's pitch energy (70 Hz - 2 kHz) is in the scale the score declares for the colouring
//   key           the key the AUDIO has (chroma against the Krumhansl profiles) has the score's tonic, its relative, or a neighbour by a fifth: a pedal too low to be heard or a transposed
//                 bar shows here
//   pinned        the loop is the one in tools/music-hash.json; deterministic: a second render is bit-identical
//   alike         no two songs share a tempo and a meter, no two songs share a lead and a tonic, and the tunes of two songs share no more than 30% of their 3-note interval patterns

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SCORES, SONG_IDS, songBuffers, songJobsOf } from '../src/engine/audio/songs.js';
import { validateScore, variantsOf, loopSamples, loopSeconds } from '../src/engine/audio/song.js';
import { validateComposition, MELODY, parseBar as valeBar, LOOP_SAMPLES, BPM as VALE_BPM } from '../src/engine/audio/composition.js';
import { runJob } from '../src/engine/audio/assets.js';
import { rmsOf, peakOf } from '../src/engine/audio/synth.js';
import { REALMS, songOf } from '../src/game/realms.js';
import { monoOf, chromaOf, keyOf, seamCurvature, PC_NAMES } from './lib/music-dsp.mjs';
import { scaleOf } from '../src/engine/audio/score.js';
import { intervalGrams } from './lib/score-analysis.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HASH_FILE = path.join(root, 'tools', 'music-hash.json');
const args = process.argv.slice(2);
const write = args.includes('--write');
const quick = args.includes('--quick');
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);

let fails = 0;
const pass = (what) => console.log(`PASS  ${what}`);
const fail = (what, why) => { fails++; console.log(`FAIL  ${what}: ${why}`); };
const check = (ok, what, why) => (ok ? pass(what) : fail(what, why));
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const hashOf = (loop) => {
  const h = createHash('sha256');
  h.update(Buffer.from(loop.L.buffer, loop.L.byteOffset, loop.L.byteLength));
  h.update(Buffer.from(loop.R.buffer, loop.R.byteOffset, loop.R.byteLength));
  return h.digest('hex').slice(0, 24);
};
const pcOf = (name) => { const m = /^([A-G])([#b]?)$/.exec(name); return (({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12; };
const jaccard = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.max(1, a.size + b.size - n); };

// ---- the songs the game has
const ids = SONG_IDS.filter((i) => !only || i === only);
if (only && !ids.length) { console.error(`no song "${only}"; songs: ${SONG_IDS.join(' ')}`); process.exit(2); }
if (!only) {
  const worlds = Object.keys(REALMS);
  const missing = worlds.filter((w) => !SONG_IDS.includes(songOf(REALMS[w])));
  check(!missing.length, 'world songs: every world of the game has a song', `no song for ${missing.join(', ')}`);
  const orphans = SONG_IDS.filter((s) => !worlds.some((w) => songOf(REALMS[w]) === s));
  check(!orphans.length, 'world songs: every song belongs to a world', `songs of no world: ${orphans.join(', ')}`);
  const bad = Object.keys(SCORES).filter((k) => SCORES[k].id !== k || !SCORES[k].name || !SCORES[k].title);
  check(!bad.length, 'world songs: every score has its id, name and title', bad.join(', '));
}

// ---- render everything once
const loops = {};                                                        // id -> { dusk?: {L,R}, dawn?: {L,R} }
const timing = {};
for (const id of ids) {
  const out = {};
  const t0 = performance.now();
  for (const j of songJobsOf(id, out)) runJob(j);
  timing[id] = performance.now() - t0;
  const b = songBuffers(id);
  loops[id] = {};
  for (const v of ['dusk', 'dawn']) if (b[v] && out[b[v]]) loops[id][v] = out[b[v]];
}

const pinned = fs.existsSync(HASH_FILE) ? JSON.parse(fs.readFileSync(HASH_FILE, 'utf8')) : {};
const hashes = {};

for (const id of ids) {
  const isVale = id === 'gloaming';
  const score = SCORES[id];
  if (isVale) {
    const bad = validateComposition();
    check(!bad.length, `${id}: score (the composition) is well formed`, bad.join('; '));
  } else {
    const bad = validateScore(score);
    check(!bad.length, `${id}: score is well formed`, bad.slice(0, 4).join('; '));
  }
  const want = isVale ? ['dusk', 'dawn'] : variantsOf(score);
  const got = Object.keys(loops[id]);
  check(want.every((v) => got.includes(v)) && got.length === want.length, `${id}: renders ${want.join(' and ')}`, `got ${got.join(',')}`);
  const N = isVale ? LOOP_SAMPLES : loopSamples(score);
  for (const v of got) {
    const x = loops[id][v];
    const tag = `${id}/${v}`;
    check(x.L.length === N && x.R.length === N, `${tag}: loop is ${N} samples (${(N / 22050).toFixed(1)} s)`, `${x.L.length}`);
    let finite = true;
    for (let i = 0; i < N && finite; i++) if (!Number.isFinite(x.L[i]) || !Number.isFinite(x.R[i])) finite = false;
    check(finite, `${tag}: every sample is a number`, 'NaN or Infinity');
    const pk = Math.max(peakOf(x.L), peakOf(x.R));
    check(db(pk) < -0.9, `${tag}: peak ${db(pk).toFixed(1)} dBFS is under -1`, `peak ${db(pk).toFixed(2)} dBFS`);
    const rms = Math.sqrt((rmsOf(x.L) ** 2 + rmsOf(x.R) ** 2) / 2);
    check(Math.abs(db(rms) + 14) < 0.3, `${tag}: level ${db(rms).toFixed(1)} dBFS RMS is -14`, `${db(rms).toFixed(2)} dB`);
    let dc = 0;
    for (let i = 0; i < N; i++) dc += x.L[i] + x.R[i];
    dc = Math.abs(dc / (2 * N));
    check(dc < 0.002, `${tag}: no DC offset (${dc.toFixed(5)})`, `${dc}`);
    const sm = Math.max(seamCurvature(x.L).ratio, seamCurvature(x.R).ratio);
    check(sm <= 1.2, `${tag}: the loop closes (curvature at the loop point ${sm.toFixed(2)} of the interior)`, `ratio ${sm.toFixed(2)}`);
    // the key of the audio, and how much of it is in the scale the score says
    const chroma = chromaOf(monoOf(x));
    const key = keyOf(chroma);
    const sc = !isVale && score.variants[v].scale;
    if (sc) {
      const set = scaleOf(sc);
      const inScale = chroma.reduce((a, e, pc) => a + (set.has(pc) ? e : 0), 0);
      check(inScale >= 0.8, `${tag}: ${(inScale * 100).toFixed(0)}% of the energy is in its scale (${sc})`, `${(inScale * 100).toFixed(0)}%: a note of the score or an alteration is out of the scale`);
    }
    const tonic = isVale ? 2 : pcOf(score.tonic);
    const d = (((key.pc - tonic) % 12) + 12) % 12;
    check([0, 3, 9, 5, 7].includes(d), `${tag}: the audio is in ${key.name} (r ${key.r.toFixed(2)}), ${isVale ? 'D' : score.tonic} is the tonic`, `${key.name}; tonic ${PC_NAMES[tonic]}`);
    hashes[`${id}:${v}`] = hashOf(x);
  }
  if (got.length === 2) check(loops[id].dusk.L.length === loops[id].dawn.L.length, `${id}: dusk and dawn are time-aligned (same length)`, 'lengths differ');
}

// ---- pinned and deterministic
if (write) {
  fs.writeFileSync(HASH_FILE, JSON.stringify({ ...pinned, ...hashes }, null, 2) + '\n');
  console.log(`wrote ${Object.keys(hashes).length} hashes to tools/music-hash.json`);
} else {
  for (const [k, h] of Object.entries(hashes)) check(pinned[k] === h, `${k}: is the pinned loop`, pinned[k] ? `hash ${h} != pinned ${pinned[k]} (a song changed: --write pins it)` : 'not pinned (--write pins it)');
}
if (!quick) {
  const id = ids.includes('home') ? 'home' : ids[ids.length - 1];
  const out = {};
  for (const j of songJobsOf(id, out)) runJob(j);
  const b = songBuffers(id);
  const same = Object.keys(loops[id]).every((v) => hashOf(out[b[v]]) === hashes[`${id}:${v}`]);
  check(same, `${id}: a second render is bit-identical`, 'the render is not deterministic');
}

// ---- not alike
if (!only) {
  const scored = ids.filter((i) => i !== 'gloaming');
  const info = { gloaming: { bpm: VALE_BPM, upb: 8, tonic: 'D', lead: { dusk: 'celesta', dawn: 'marimba' } } };
  for (const id of scored) {
    const s = SCORES[id];
    const lead = {};
    for (const v of variantsOf(s)) lead[v] = s.variants[v].parts.find((p) => p.type === 'line').inst;
    info[id] = { bpm: s.bpm, upb: s.upb, tonic: s.tonic, lead };
  }
  const grams = {};
  // Vale's tune: the intervals of its 16 bars
  const vm = MELODY.flatMap((b) => valeBar(b, false).map((e) => e.m));
  const vi = [];
  for (let i = 1; i < vm.length; i++) vi.push(Math.max(-12, Math.min(12, vm[i] - vm[i - 1])));
  grams.gloaming = new Set();
  for (let i = 0; i + 3 <= vi.length; i++) grams.gloaming.add(vi.slice(i, i + 3).join(','));
  for (const id of scored) {
    grams[id] = new Set();
    for (const v of variantsOf(SCORES[id])) for (const g of intervalGrams(SCORES[id], v, 3)) grams[id].add(g);
  }
  const all = Object.keys(info);
  for (let a = 0; a < all.length; a++) {
    for (let b = a + 1; b < all.length; b++) {
      const A = info[all[a]], B = info[all[b]];
      const tag = `${all[a]} / ${all[b]}`;
      check(!(A.bpm === B.bpm && A.upb === B.upb), `alike: ${tag} differ in tempo or meter`, `both ${A.bpm} bpm, ${A.upb} units`);
      const sharedLead = Object.keys(A.lead).filter((v) => B.lead[v] && A.lead[v] === B.lead[v]);
      check(!(sharedLead.length && A.tonic === B.tonic), `alike: ${tag} differ in lead or tonic`, `${A.lead[sharedLead[0]]} over ${A.tonic} in both`);
      const j = jaccard(grams[all[a]], grams[all[b]]);
      check(j <= 0.3, `alike: ${tag} tunes share ${(j * 100).toFixed(0)}% of their interval patterns`, `${(j * 100).toFixed(0)}% (the limit is 30)`);
    }
  }
}

console.log('\nrender times (Node, cold, ms): ' + Object.entries(timing).map(([k, v]) => `${k} ${v.toFixed(0)}`).join('  '));
console.log(fails ? `\n${fails} FAILED` : '\nall songs fine');
process.exit(fails ? 1 : 0);
