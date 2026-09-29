// Gloaming Vale audio — the composition ("Vale Lullaby / Vale Reveille"), as plain data.
//
// ORIGINAL TUNE. Two colourings of one 16-bar tune, so the world can "wake up" while it plays:
//
//   'gloaming'  moonlit twilight — D dorian (D E F G A B C), celesta/music-box, soft pad,
//               round plucked bass, brushed shaker, wood block, soft toms. Sparse and warm.
//   'daybreak'  bright sunrise  — D major with a lydian #4 flavour (D E F# G(#) A B C#),
//               marimba + flute, pizzicato strings, bongos / congas / tambourine, soft kick.
//
// Tempo 92 BPM, 4/4, 16 bars = 64 beats = 41.74 s. Grid unit = one eighth note (8 per bar).
// Form (4 bars each):   A  |  A'  |  B  |  A''
//   A   the motif. Bar 1 = the hook:  A4 (dotted quarter) D5 F5 E5 — a long note, a quick pick-up
//       leap to D, up to F, settle on E. Bar 2 answers it a step up the chord (B4 E5 G5 F5 E5),
//       bar 3 sequences it down (A4 C5 E5 D5 C5), bar 4 sighs to an open end (E5 C5 A4).
//   A'  same rhythm, but the phrase climbs (G5 -> A5, then a C6 arpeggio falling back) and the
//       cadence turns through Em7 -> Am7 / A (ii -> V of D).
//   B   contrast: the rhythm shifts onto the off-beats (every phrase starts on the "&"), harmony
//       leaves home (Bm7 -> Em7 -> G -> C | A: vi ii IV bVII V), melody peaks on D6.
//   A'' recap of the hook at full strength, then a bigger climb and a ii -> V turnaround that
//       pulls straight back to bar 1 (so the loop wraps like a phrase, not a restart).
//
// Chord skeleton (identical roots in both variants — only the colour changes):
//   bar:       1      2       3       4       5    6       7      8            9      10    11      12         13 14 15 16
//   gloaming:  Dm9    G6      Fmaj7   Am7     Dm9  G6      Fmaj7  Em7|Am7      Bm7b5  Em7   G6      C|A7sus4   (as 1-3)  Em7|A7sus4
//   daybreak:  Dmaj9  Gmaj7   F#m7    Aadd9   Dmaj9 Gmaj7  F#m7   Em7|A        Bm7    Em7   Gmaj7   C|A        (as 1-3)  Em7|A
// The melody is written ONCE in gloaming spelling; the daybreak colouring is applied by note()
// below (F->F#, C->C#, 'G+' -> G# only by day, 'C=' keeps natural by day).
//
// Rhythm: syncopated tumbao-style bass (long root, 5th on the "&" of 2, root on 4), a 3+3+2
// tresillo on the wood block (a son-clave 3-2 in the B section), 16th shaker with ghost notes.
// A light swing (SWING) pushes the off-beat 8ths late; every note also gets a tiny deterministic
// timing/velocity "human" wobble in music.js.

import { SR } from './synth.js';

export const BPM = 92;
export const BARS = 16;
export const UNITS = 8; // eighth notes per bar
export const BEAT = 60 / BPM;
export const UNIT_SEC = BEAT / 2;
export const LOOP_SAMPLES = Math.round(BARS * 4 * BEAT * SR);
export const SWING = 0.1; // off-beat 8ths late by this fraction of an 8th note

// ---------------------------------------------------------------------------------------------
// Note names -> MIDI, with the daybreak colouring rules
// ---------------------------------------------------------------------------------------------
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * 'A4' 'F#3' 'Bb2' -> MIDI. Accidental rules:
 *   ''   plain letter: by day F and C are raised (F#, C#) — the D-major colouring
 *   '='  never altered (e.g. 'C=5' keeps C natural over the borrowed C chord)
 *   '+'  raised by day only ('G+5' = G in the gloaming, G# = the lydian #4 by day)
 *   '#' / 'b'  absolute in both variants
 */
export function note(name, day = false) {
  const m = /^([A-G])([#b=+]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  let n = PC[m[1]] + 12 * (Number(m[3]) + 1);
  const acc = m[2];
  if (acc === '#') n += 1;
  else if (acc === 'b') n -= 1;
  else if (acc === '+') n += day ? 1 : 0;
  else if (acc === '' && day && (m[1] === 'F' || m[1] === 'C')) n += 1;
  return n;
}

/** Parse one bar string ('A4/3 D5/1 r/4') into events {u, m, len}; u = eighth-note offset in the bar. */
export function parseBar(str, day = false) {
  const out = [];
  let u = 0;
  for (const tok of str.trim().split(/\s+/)) {
    const [nm, l] = tok.split('/');
    const len = Number(l);
    if (nm !== 'r') out.push({ u, m: note(nm, day), len });
    u += len;
  }
  if (u !== UNITS) throw new Error(`bar "${str}" sums to ${u}, expected ${UNITS}`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The tune (gloaming spelling) — 16 bars, units of one eighth note
// ---------------------------------------------------------------------------------------------
export const MELODY = [
  // A — the hook
  'A4/3 D5/1 F5/2 E5/2', // 1  Dm9
  'B4/3 E5/1 G5/2 F5/1 E5/1', // 2  G6
  'A4/3 C5/1 E5/2 D5/1 C5/1', // 3  Fmaj7
  'E5/2 C5/2 A4/3 r/1', // 4  Am7 (open ending, pick-up rest)
  // A' — the climb
  'A4/3 D5/1 F5/2 G+5/1 A5/1', // 5  Dm9 (G+ = lydian #4 by day)
  'B4/3 E5/1 G5/2 B5/1 A5/1', // 6  G6
  'C6/3 A5/1 F5/2 E5/2', // 7  Fmaj7 (falling arpeggio)
  'G5/2 E5/2 C5/2 E5/2', // 8  Em7 | Am7
  // B — off-beat contrast
  'r/1 D5/2 F5/2 A5/2 G5/1', // 9  Bm7b5
  'r/1 G5/2 B5/2 D6/2 B5/1', // 10 Em7 (peak)
  'A5/3 G5/1 F5/2 D5/2', // 11 G6
  'G5/2 E5/2 A5/2 E5/2', // 12 C | A7sus4
  // A'' — recap and turnaround
  'A4/3 D5/1 F5/2 E5/2', // 13
  'B4/3 E5/1 G5/2 F5/1 E5/1', // 14
  'C6/3 A5/1 F5/2 A5/2', // 15
  'G5/2 B5/2 A5/3 r/1', // 16 Em7 | A
];

/** Flute descant (daybreak only), long notes over the pad, bars 5-12. Bars 13-16 the flute doubles MELODY +1 octave. */
export const FLUTE_DESCANT = {
  // chosen so that no held note sits a semitone from a melody note (bar 5's passing G# would bite against A5; bar 9's G5 against F#5)
  5: 'E5/8', 6: 'G5/4 B5/4', 7: 'C6/8', 8: 'B5/4 A5/4',
  9: 'D5/8', 10: 'G5/4 B5/4', 11: 'D6/8', 12: 'G5/4 A5/4',
};

// ---------------------------------------------------------------------------------------------
// Harmony. root = bass note; pad = voicing (kept close so voices move by step); t3/t5 = the chord's
// third and fifth in semitones above the root, for the bass patterns.
// ---------------------------------------------------------------------------------------------
const CH = {
  // gloaming (D dorian)
  Dm9: { root: 'D2', pad: ['F3', 'A3', 'C4', 'E4'], t3: 3 },
  G6: { root: 'G2', pad: ['G3', 'B3', 'D4', 'E4'], t3: 4 },
  Fmaj7: { root: 'F2', pad: ['F3', 'A3', 'C4', 'E4'], t3: 4 },
  Am7: { root: 'A2', pad: ['G3', 'A3', 'C4', 'E4'], t3: 3 },
  Em7: { root: 'E2', pad: ['G3', 'B3', 'D4', 'E4'], t3: 3 },
  Bm7b5: { root: 'B1', pad: ['A3', 'B3', 'D4', 'F4'], t3: 3, t5: 6 },
  C: { root: 'C3', pad: ['G3', 'C4', 'E4', 'G4'], t3: 4 },
  A7sus4: { root: 'A2', pad: ['A3', 'D4', 'E4', 'G4'], t3: 5 },
  // daybreak (D major / lydian)
  Dmaj9: { root: 'D2', pad: ['F#3', 'A3', 'C#4', 'E4'], t3: 4 },
  Gmaj7: { root: 'G2', pad: ['G3', 'B3', 'D4', 'F#4'], t3: 4 },
  'F#m7': { root: 'F#2', pad: ['F#3', 'A3', 'C#4', 'E4'], t3: 3 },
  Aadd9: { root: 'A2', pad: ['A3', 'B3', 'C#4', 'E4'], t3: 4 },
  Bm7: { root: 'B1', pad: ['A3', 'B3', 'D4', 'F#4'], t3: 3 },
  A: { root: 'A2', pad: ['A3', 'C#4', 'E4', 'A4'], t3: 4 },
};

// one entry per bar; an array = two chords of half a bar each
const PROG = {
  gloaming: [
    'Dm9', 'G6', 'Fmaj7', 'Am7', 'Dm9', 'G6', 'Fmaj7', ['Em7', 'Am7'],
    'Bm7b5', 'Em7', 'G6', ['C', 'A7sus4'], 'Dm9', 'G6', 'Fmaj7', ['Em7', 'A7sus4'],
  ],
  daybreak: [
    'Dmaj9', 'Gmaj7', 'F#m7', 'Aadd9', 'Dmaj9', 'Gmaj7', 'F#m7', ['Em7', 'A'],
    'Bm7', 'Em7', 'Gmaj7', ['C', 'A'], 'Dmaj9', 'Gmaj7', 'F#m7', ['Em7', 'A'],
  ],
};

/** Resolved chord slots: [{bar, u, len, name, root (MIDI), pad [MIDI], t3, t5}] */
export function chordSlots(variant) {
  const out = [];
  PROG[variant].forEach((entry, bar) => {
    const list = Array.isArray(entry) ? entry : [entry];
    const len = UNITS / list.length;
    list.forEach((name, i) => {
      const c = CH[name];
      out.push({
        bar, u: i * len, len, name,
        root: note(c.root, false), pad: c.pad.map((p) => note(p, false)), t3: c.t3, t5: c.t5 ?? 7,
      });
    });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Bass patterns: [unit, degree, lengthUnits, velocity]; degree R=root 5=fifth 8=octave 3=third
// ---------------------------------------------------------------------------------------------
export const BASS = {
  g1: [[0, 'R', 3, 1.0], [3, '5', 2, 0.6], [6, 'R', 2, 0.8]],
  g2: [[0, 'R', 2, 1.0], [3, 'R', 1, 0.5], [4, '5', 3, 0.7]],
  gB: [[0, 'R', 4, 1.0], [4, '5', 4, 0.65]],
  gHalf: [[0, 'R', 3, 1.0], [3, '5', 1, 0.55]],
  d1: [[0, 'R', 2, 1.0], [2, 'R', 1, 0.5], [3, '5', 1, 0.75], [4, '8', 2, 0.9], [6, '5', 1, 0.6], [7, '3', 1, 0.5]],
  d2: [[0, 'R', 3, 1.0], [3, '5', 1, 0.6], [4, 'R', 2, 0.85], [6, '5', 2, 0.7]],
  dB: [[0, 'R', 2, 1.0], [3, '5', 1, 0.7], [4, '8', 2, 0.85], [6, '5', 2, 0.65]],
  dHalf: [[0, 'R', 2, 1.0], [2, '5', 1, 0.65], [3, '8', 1, 0.6]],
};

/** Which bass pattern plays in each bar (whole-bar chords; half-bar chords use the *Half pattern). */
export const BASS_PLAN = {
  gloaming: ['g1', 'g2', 'g1', 'g2', 'g1', 'g2', 'g1', 'gHalf', 'gB', 'gB', 'gB', 'gHalf', 'g1', 'g2', 'g1', 'gHalf'],
  daybreak: ['d1', 'd2', 'd1', 'd2', 'd1', 'd2', 'd1', 'dHalf', 'dB', 'dB', 'dB', 'dHalf', 'd1', 'd2', 'd1', 'dHalf'],
};

// ---------------------------------------------------------------------------------------------
// Percussion: 16-step strings per bar (one step = a 16th note). Digits 1-9 = velocity, '.' = rest.
// ---------------------------------------------------------------------------------------------
export const PERC = {
  gloaming: {
    shaker: '4.2.3.2.4.2.3.2.',
    wood: '5.....4.....4...', // 3+3+2 tresillo
    woodB: '5..3..4...3.4...', // son clave 3-2 (B section)
    tomL: '6.........3.....',
    fillTomM: '............3.4.',
    fillTomL: '.............3.5',
  },
  daybreak: {
    shaker: '4232423242324234',
    wood: '5.....4.....4...',
    woodB: '5..3..4...3.4...',
    tamb: '....6.......6.3.',
    bongoLo: '5.....4...4.....',
    bongoHi: '..4.3....3..4.3.',
    congaO: '....4.4.....4.4.',
    congaS: '..............3.',
    kick: '6.......5.3.....',
    fillBongoHi: '..........3.4.56',
    fillBongoLo: '............3.4.',
  },
};

/** Which bars each layer plays in (16 chars, one per bar; 'x' = plays). */
export const PLAN = {
  gloaming: {
    celesta: 'xxxxxxxxxxxxxxxx', pad: 'xxxxxxxxxxxxxxxx', bass: 'xxxxxxxxxxxxxxxx',
    shaker: '..xxxxxxxxxxxxxx', wood: '....xxxxxxxxxxxx', tomL: 'xxxxxxxxxxxxxxxx',
    musicBoxDouble: '............xxxx', chime: 'x.......x...x...',
  },
  daybreak: {
    marimba: 'xxxxxxxxxxxxxxxx', pad: 'xxxxxxxxxxxxxxxx', bass: 'xxxxxxxxxxxxxxxx', pizz: 'xxxxxxxxxxxxxxxx',
    shaker: 'xxxxxxxxxxxxxxxx', wood: '....xxxxxxxxxxxx', tamb: '....xxxxxxxxxxxx',
    bongo: 'xxxxxxxxxxxxxxxx', conga: '........xxxxxxxx', kick: '....xxxxxxxxxxxx',
    flute: '....xxxxxxxxxxxx', celestaDouble: '............xxxx', chime: 'x.......x...x...',
  },
};

/** Overall energy per bar (0..1): scales pad level, percussion level and filter brightness. */
export const INTENSITY = {
  gloaming: [0.5, 0.5, 0.55, 0.55, 0.62, 0.62, 0.7, 0.72, 0.8, 0.8, 0.85, 0.95, 0.65, 0.65, 0.72, 0.72],
  daybreak: [0.4, 0.42, 0.48, 0.55, 0.62, 0.65, 0.72, 0.8, 0.85, 0.85, 0.92, 1.0, 0.95, 0.97, 1.0, 1.0],
};

/** Pizzicato comping: chord-stab positions (units within a bar) per bar group of 4. */
export const PIZZ_STABS = [
  [1, 4.5], // bars 1-4
  [1, 3, 4.5, 6.5], // bars 5-8
  [1, 3, 5, 6.5], // bars 9-12
  [1, 3, 4.5, 6, 7], // bars 13-16
];

/** Sparkle arpeggios [bar (1-based), startUnit, stepUnits, notes, velocity] (gloaming spelling). */
export const SPARKLES = {
  gloaming: [
    [4, 6, 0.5, ['E6', 'D6', 'A5', 'E5'], 0.45],
    [8, 6, 0.5, ['A6', 'E6', 'C6', 'A5'], 0.45],
    [12, 6, 0.5, ['D6', 'A5', 'E5', 'D5'], 0.45],
    [16, 6, 0.5, ['A6', 'E6', 'D6', 'A5'], 0.5],
  ],
  daybreak: [
    [4, 6, 0.5, ['A5', 'C6', 'E6', 'A6'], 0.5],
    [8, 5.5, 0.5, ['E5', 'A5', 'C6', 'E6', 'A6'], 0.5],
    [12, 5.5, 0.5, ['E5', 'A5', 'D6', 'E6', 'A6'], 0.55],
    [16, 5.5, 0.5, ['A5', 'D6', 'F6', 'A6', 'D7'], 0.6],
  ],
};

/** Wind-chime hits [bar (1-based), unit, note, velocity] — the moon / sun "glints". */
export const CHIMES = {
  gloaming: [[1, 0, 'A5', 0.35], [9, 0, 'E6', 0.4], [13, 0, 'D6', 0.35]],
  daybreak: [[1, 0, 'D6', 0.35], [9, 0, 'A6', 0.4], [13, 0, 'D6', 0.4]],
};

/** Structural self-check used by tools/audio-render.mjs: returns a list of problems (empty = fine). */
export function validateComposition() {
  const bad = [];
  if (MELODY.length !== BARS) bad.push(`MELODY has ${MELODY.length} bars`);
  for (const day of [false, true]) {
    MELODY.forEach((b, i) => {
      try { parseBar(b, day); } catch (e) { bad.push(`melody bar ${i + 1} (${day ? 'day' : 'night'}): ${e.message}`); }
    });
  }
  for (const [bar, str] of Object.entries(FLUTE_DESCANT)) {
    try { parseBar(str, true); } catch (e) { bad.push(`flute descant bar ${bar}: ${e.message}`); }
  }
  for (const v of Object.keys(PERC)) {
    for (const [k, pat] of Object.entries(PERC[v])) if (pat.length !== 16) bad.push(`PERC.${v}.${k} has ${pat.length} steps`);
  }
  for (const v of Object.keys(PLAN)) {
    for (const [k, pat] of Object.entries(PLAN[v])) if (pat.length !== BARS) bad.push(`PLAN.${v}.${k} has ${pat.length} bars`);
  }
  for (const v of Object.keys(PROG)) {
    if (PROG[v].length !== BARS) bad.push(`PROG.${v} has ${PROG[v].length} bars`);
    for (const e of PROG[v].flat()) if (!CH[e]) bad.push(`unknown chord ${e}`);
    if (BASS_PLAN[v].length !== BARS) bad.push(`BASS_PLAN.${v} has ${BASS_PLAN[v].length} bars`);
    BASS_PLAN[v].forEach((k, bar) => {
      const pat = BASS[k];
      if (!pat) return bad.push(`unknown bass pattern ${k}`);
      const slotLen = Array.isArray(PROG[v][bar]) ? UNITS / PROG[v][bar].length : UNITS;
      for (const [u, , len] of pat) if (u + len > slotLen + 1e-9) bad.push(`bass ${k} overruns its ${slotLen}-unit slot (bar ${bar + 1})`);
    });
    for (const c of chordSlots(v)) if (c.pad.length !== 4) bad.push(`chord ${c.name} pad voicing is not 4 notes`);
  }
  return bad;
}
