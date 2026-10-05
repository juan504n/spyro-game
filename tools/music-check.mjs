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
//   notation      note names, accidentals and the alter map, bars and ties, chords and slash chords, the bass degrees, voice leading
//   validator     the validator refuses a bar that does not add up, an unknown chord or instrument, a pattern of the wrong length or one that overruns its chord, a note out of range or out of scale ...
//   colourings    the dusk and the dawn of a song made separately (the player makes the dawn after the world is entered) are bit for bit the two made together
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
import { scaleOf, noteOf, parseBar, parseChord, voiceChord, degreeInterval, chordSlots } from '../src/engine/audio/score.js';
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

// ---- notation
if (!only) {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check(noteOf('C4') === 60 && noteOf('A4') === 69 && noteOf('Bb2') === 46 && noteOf('F#3') === 54 && noteOf('B-1') === 11, 'notation: note names are MIDI numbers (C4 = 60)', 'noteOf');
  check(noteOf('F5', { F: 1 }) === 78 && noteOf('F=5', { F: 1 }) === 77 && noteOf('F#5', { F: 1 }) === 78 && noteOf('G+5', { '+': 1 }) === 80 && noteOf('G+5', null) === 79 && noteOf('Bb4', { B: 1 }) === 70, 'notation: the alter map moves plain letters, "=" and "#" and "b" do not, "+" is its own', 'noteOf with alter');
  const b1 = parseBar('A4/3 D5/1 F5/2! E5/1.5 r/0.5', 8);
  check(eq(b1.map((e) => e.u), [0, 3, 4, 6]) && eq(b1.map((e) => e.m), [69, 74, 77, 76]) && b1[2].mark === '!' && b1[3].len === 1.5, 'notation: a bar is notes with lengths in units, rests, marks', JSON.stringify(b1));
  check(parseBar('_/2 A4/6', 8)[0].m === -1 && parseBar('r/8', 8).length === 0, 'notation: a tie holds the note before it', 'tie');
  let threw = 0;
  for (const bad of ['A4/3', 'A4/9', 'A4/x', 'H4/8']) { try { parseBar(bad, 8); } catch (e) { threw++; } }
  check(threw === 4, 'notation: a bar that does not add up to the meter, or has a bad note or length, is refused', `${threw} of 4 refused`);
  const bb = parseChord('Bbmaj7/D');
  check(bb.root === 10 && bb.bass === 2 && eq(bb.tones, [0, 4, 7, 11]) && bb.t3 === 4 && bb.t7 === 11, 'notation: a chord symbol has its root, its bass, its tones', JSON.stringify(bb));
  let bad = 0;
  for (const sym of ['H', 'Gfoo', 'g', '']) { try { parseChord(sym); } catch (e) { bad++; } }
  check(bad === 4, 'notation: an unknown chord is refused', `${bad} of 4`);
  const cm7 = parseChord('Cm7');
  const ce = parseChord('C/E');
  check(['R', '3', '5', '7', '8', 'L'].map((d) => degreeInterval(cm7, d)).join() === '0,3,7,10,12,-12' && degreeInterval(ce, 'R') === 0 && degreeInterval(ce, '5') === 3 && degreeInterval(ce, '3') === 0, 'notation: bass degrees count from the bass note (a slash chord\'s fifth is above its bass)', 'degreeInterval');
  const v1 = voiceChord(parseChord('Em'), null);
  const v2 = voiceChord(parseChord('C'), v1);
  const sorted = (v) => v.every((m, i) => i === 0 || m > v[i - 1]);
  const pcs = (v) => [...new Set(v.map((m) => m % 12))].sort((a, b) => a - b).join();
  check(v1.length === 4 && sorted(v1) && v1.every((m) => m >= 52 && m <= 72) && pcs(v1) === '4,7,11' && v2.length === 4 && sorted(v2) && pcs(v2) === '0,4,7', 'notation: a pad voicing is four voices in range on the tones of the chord', `${v1} ${v2}`);
  check(v2.reduce((a, m, i) => a + Math.abs(m - v1[i]), 0) <= 12, 'notation: the next voicing moves by the smoothest way (a minor to its relative major in at most a whole step in total, a third at most per voice)', `${v1} -> ${v2}`);
  const sl = chordSlots(SCORES.home, SCORES.home.variants.dawn);
  const perBar = new Map();
  for (const x of sl) perBar.set(x.bar, (perBar.get(x.bar) || 0) + x.len);
  check(sl.length === 28 && [...perBar.values()].every((l) => l === SCORES.home.upb), 'notation: a bar with two chords has two slots that fill it', `${sl.length} slots`);
}

// ---- the validator refuses what it should
if (!only) {
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const refuses = (what, mutate, word, id = 'home', variant = 'dawn') => {
    const sc = clone(SCORES[id]);
    mutate(sc, sc.variants[variant]);
    const msgs = validateScore(sc);
    check(msgs.some((m) => m.includes(word)), `validator: refuses ${what}`, msgs.length ? `said: ${msgs[0]}` : 'accepted it');
  };
  check(validateScore(clone(SCORES.home)).length === 0 && validateScore(clone(SCORES.tideglass)).length === 0, 'validator: accepts a score that is well formed (a copy of two of the songs)', validateScore(clone(SCORES.home)).join('; '));
  refuses('a bar that does not add up', (s) => { s.lines.tune[0] = 'D5/2 G5/3'; }, 'sums to');
  refuses('an unknown chord', (s, v) => { v.chords[0] = 'Hm'; }, 'bad chord');
  refuses('an unknown chord quality', (s, v) => { v.chords[1] = 'Gfoo'; }, 'unknown chord quality');
  refuses('chords that do not fill the bar', (s, v) => { v.chords[6] = [['C', 3], ['D', 2]]; }, 'fill');
  refuses('too few chords', (s, v) => { v.chords.pop(); }, 'chords has');
  refuses('a bass pattern that overruns its chord', (s, v) => { v.parts.find((p) => p.type === 'bass').patterns.h = [[0, 'R', 4, 1]]; }, 'overruns');
  refuses('a step pattern of the wrong length', (s, v) => { v.parts.find((p) => p.type === 'arp').patterns.a = '0.1.2'; }, 'steps');
  refuses('a rhythm pattern of the wrong length', (s, v) => { v.parts.find((p) => p.type === 'perc').tracks[0].patterns.a = '6.3'; }, 'steps');
  refuses('a note outside its instrument', (s, v) => { v.parts[0].transpose = 40; }, 'outside');
  refuses('an unknown instrument', (s, v) => { v.parts[0].inst = 'kazoo'; }, 'unknown instrument');
  refuses('a bar mask of the wrong length', (s, v) => { v.parts[0].bars = 'xxx'; }, 'characters');
  refuses('a pattern letter that is not defined', (s, v) => { v.parts.find((p) => p.type === 'bass').bars = 'z' + v.parts.find((p) => p.type === 'bass').bars.slice(1); }, 'not defined');
  refuses('a note outside the scale', (s) => { s.lines.tune[1] = 'E5/2 D5/2 G#5/2'; }, 'outside the scale');
  refuses('groups that do not add up to the meter', (s) => { s.groups = [2, 2]; }, 'groups');
  refuses('a level that is not a level', (s, v) => { v.parts[0].level = -3; }, 'level');
  refuses('an intensity of the wrong length', (s, v) => { v.intensity = '123'; }, 'intensity');
  refuses('a tie in the first bar', (s) => { s.lines.tune[0] = '_/2 G5/4'; }, 'tie');
  refuses('a loop that is too short', (s) => { s.bars = 8; s.lines.tune = s.lines.tune.slice(0, 8); s.variants.dawn.chords = s.variants.dawn.chords.slice(0, 8); }, 'loop is');
  refuses('a part of an unknown type', (s, v) => { v.parts[0].type = 'solo'; }, 'unknown type');
  refuses('a colouring that is neither dusk nor dawn', (s) => { s.variants.noon = s.variants.dawn; }, 'dusk and/or dawn');
}

// ---- the colourings made separately are the colourings made together
if (!only) {
  for (const id of ['gloaming', 'frostbloom']) {
    const b = songBuffers(id);
    const sep = {};
    for (const v of variantsOf(id === 'gloaming' ? { variants: { dusk: 1, dawn: 1 } } : SCORES[id])) {
      const out = {};
      for (const j of songJobsOf(id, out, { variants: [v] })) runJob(j);
      if (out[b[v]]) sep[v] = out[b[v]];
    }
    const same = Object.keys(sep).length === 2 && Object.entries(sep).every(([v, x]) => hashOf(x) === hashes[`${id}:${v}`]);
    check(same, `colourings: ${id}'s dusk and dawn made separately are bit for bit the two made together`, 'the dawn made on its own is not the dawn made with the dusk');
  }
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
