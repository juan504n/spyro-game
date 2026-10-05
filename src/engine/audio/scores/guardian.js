// The Guardian's Court — "The Last Lantern". The hero stands on the Court of the Guardian's dais under a violet storm; each of the three lanterns he lights turns the storm toward a golden
// dawn, and the song turns with it (the day of the Court is the number of lanterns lit).
//
// G MINOR AT DUSK, G MAJOR AT DAWN, and the tune turns upside down as the light comes: the storm's tune FALLS (D Bb G, Eb D Bb, down each chord: the weight of the stone), the dawn's tune
// RISES (the bugle call G D G, then each chord climbed from the bottom: the same chords, the other way up). The two share every chord root (G G C D / C G F D / G G C D / C F D D); only
// the tonic and the subdominant change their third (Gm / G, Cm / C), F and D are the same in both, and every note of both tunes is a tone of the chord under it. The Court spends minutes
// at the lanterns between dusk and dawn (a quarter, a half, three quarters of the day), where both play at once: fate falling and hope rising on the same harmony, never a clash.
// G is the key of Dawnhaven: the Court's dawn comes home.
// The bass stands on G (a pedal: Cm/G, D/G) through both calls and walks with the chords (C, G, F, D) in B and C: the key is never in doubt, and the harmony still moves.
// 4/4 at 100, 16 bars = A (4) B (4) A' (4) C (4). Under both: a saw-bass that never stops (eighth notes), timpani and taiko on the beats, a marching snare, a choir, a crash on the
// sections, a riser into the turn. The dawn adds hats, bells, a harp sweep and strings in unison with the horns.
//   A  G G C D         the call: two bars of the motif, then the subdominant and the dominant
//   B  C G F D         the answer lifts to C6 / D6 (E6 at dawn); F, the flat seventh, is the darkest chord (the stone's shadow) and the brightest at dawn
//   A' the call again
//   C  C F D D         a short, tense close and a run up the D chord (D F# A C) that falls back onto the G of the first bar

import { defineScore } from '../score.js';

export const SCORE = defineScore({
  id: 'guardian',
  name: "THE GUARDIAN'S COURT",
  title: 'The Last Lantern',
  bpm: 100, upb: 8, groups: [2, 2, 2, 2], bars: 16, swing: 0,
  ambience: { dusk: 0, day: 0.5 },                                   // (no crickets in the storm; the birds are the dawn's)
  stingerShift: 5,                                                   // (the jingles are in D: in the Court they are in G)
  tonic: 'G',
  bassLow: 36,
  padRange: [43, 64],
  comp: { thresholdDb: -11, ratio: 2 },

  variants: {
    dusk: {
      wet: 0.75,
      scale: 'G A Bb C D Eb F F#',
      intensity: '5566 6788 5566 7899',
      chords: ['Gm', 'Gm', 'Cm/G', 'D/G', 'Cm', 'Gm', 'F', 'D', 'Gm', 'Gm', 'Cm/G', 'D/G', 'Cm', 'F', 'D', 'D'],
      lines: {
        tune: [
          'D5/3 Bb4/1 G4/4', 'Eb5/3 D5/1 Bb4/4', 'G5/3 Eb5/1 C5/4', 'A5/2 F#5/2 D5/4',
          'C6/3 Bb5/1 G5/4', 'D6/3 Bb5/1 G5/4', 'C6/4 A5/2 F5/2', 'A5/2 F#5/2 D5/2 A4/2',
          'D5/3 Bb4/1 G4/4', 'Eb5/3 D5/1 Bb4/4', 'G5/3 Eb5/1 C5/4', 'A5/2 F#5/2 D5/4',
          'G5/2 Eb5/2 C5/4', 'A5/2 F5/2 C5/4', 'A5/4 F#5/2 D5/2', 'D5/1 F#5/1 A5/1 C6/1 A5/2 G5/2',
        ],
      },
      parts: [
        { type: 'line', line: 'tune', inst: 'horn', bars: 'xxxx xxxx xxxx xxxx', level: -17, pan: -0.05, opts: { bright: 0.75 } },
        { type: 'pad', inst: 'strings', bars: 'xxxx xxxx xxxx xxxx', level: -25, opts: { cut: 1400, attack: 0.5, release: 0.5 } },
        { type: 'pad', inst: 'choir', bars: '.... xxxx .... xxxx', level: -26, opts: { vowel: 'o', attack: 0.6, release: 0.6 } },
        {
          type: 'bass', inst: 'sawbass', bars: 'aaaa aaaa aaaa aaaa', level: -21, opts: { bright: 0.8 },
          patterns: { a: [[0, 'R', 0.9, 1], [1, 'R', 0.9, 0.6], [2, 'R', 0.9, 0.85], [3, 'R', 0.9, 0.6], [4, 'R', 0.9, 0.95], [5, 'R', 0.9, 0.6], [6, 'R', 0.9, 0.85], [7, '5', 0.9, 0.65]] },
        },
        {
          type: 'bass', inst: 'timpani', bars: 'aaab aaab aaab aaab', level: -23, cut: false,
          patterns: { a: [[0, 'R', 1, 1], [4, 'R', 1, 0.8]], b: [[0, 'R', 1, 1], [4, 'R', 1, 0.8], [6, 'R', 1, 0.7], [7, 'R', 1, 0.85]] },
        },
        {
          type: 'perc', level: -25,
          tracks: [
            { inst: 'taiko', gain: 1, pan: 0, bars: 'aaaa aaaa aaaa aaaa', patterns: { a: '9.......7.......' } },
            { inst: 'snare', gain: 0.7, pan: -0.15, bars: '.aaa aaaa .aaa aaaa', patterns: { a: '....7.......7...' } },
          ],
        },
        { type: 'events', inst: 'swell:riser', gain: 0.5, list: [{ bar: 16, u: 0, notes: ['x'], len: 8 }] },
        { type: 'events', inst: 'crash', gain: 0.6, list: [1, 5, 9, 13].map((b) => ({ bar: b, u: 0, notes: ['x'], vel: 0.6 })) },
        { type: 'events', inst: 'anvil', gain: 0.5, list: [{ bar: 8, u: 6, notes: ['x'], vel: 0.6 }, { bar: 12, u: 6, notes: ['x'], vel: 0.6 }] },
      ],
    },

    dawn: {
      wet: 0.5,
      intensity: '6677 7788 6677 8899',
      chords: ['G', 'G', 'C/G', 'D/G', 'C', 'G', 'F', 'D', 'G', 'G', 'C/G', 'D/G', 'C', 'F', 'D', 'D'],
      lines: {
        tune: [
          'G4/2 D5/2 G5/4', 'B5/3 A5/1 G5/4', 'E5/2 G5/2 C6/4', 'F#5/2 A5/2 D6/4',
          'G5/2 C6/2 E6/4', 'G5/2 B5/2 D6/4', 'F5/2 A5/2 C6/4', 'F#5/2 A5/2 D6/4',
          'G4/2 D5/2 G5/4', 'B5/3 A5/1 G5/4', 'E5/2 G5/2 C6/4', 'F#5/2 A5/2 D6/4',
          'G5/2 C6/2 E6/4', 'F5/2 A5/2 C6/4', 'A5/4 D6/4', 'D5/1 F#5/1 A5/1 C6/1 D6/2 A5/2',
        ],
      },
      parts: [
        { type: 'line', line: 'tune', inst: 'horn', bars: 'xxxx xxxx xxxx xxxx', level: -17, pan: -0.05, opts: { bright: 1.3 } },
        { type: 'line', line: 'tune', inst: 'strings', bars: '.... .... xxxx xxxx', level: -27, pan: 0.25, opts: { cut: 3200, attack: 0.15, release: 0.3 } },
        { type: 'pad', inst: 'strings', bars: 'xxxx xxxx xxxx xxxx', level: -24, opts: { cut: 2600, attack: 0.4, release: 0.5 } },
        { type: 'pad', inst: 'choir', bars: '.... xxxx xxxx xxxx', level: -26, opts: { vowel: 'a', attack: 0.5, release: 0.6 } },
        {
          type: 'bass', inst: 'sawbass', bars: 'aaaa aaaa aaaa aaaa', level: -21, opts: { bright: 1.2 },
          patterns: { a: [[0, 'R', 0.9, 1], [1, '8', 0.9, 0.6], [2, 'R', 0.9, 0.85], [3, '8', 0.9, 0.6], [4, 'R', 0.9, 0.95], [5, '8', 0.9, 0.6], [6, 'R', 0.9, 0.85], [7, '5', 0.9, 0.65]] },
        },
        {
          type: 'bass', inst: 'timpani', bars: 'aaab aaab aaab aaab', level: -23, cut: false,
          patterns: { a: [[0, 'R', 1, 1], [4, 'R', 1, 0.8]], b: [[0, 'R', 1, 1], [4, 'R', 1, 0.8], [6, 'R', 1, 0.7], [7, 'R', 1, 0.85]] },
        },
        {
          type: 'perc', level: -24,
          tracks: [
            { inst: 'taiko', gain: 1, pan: 0, bars: 'aaaa aaaa aaaa aaaa', patterns: { a: '9.......7.......' } },
            { inst: 'snare', gain: 0.7, pan: -0.15, bars: 'aaaa aaaa aaaa aaaa', patterns: { a: '....7.......7...' } },
            { inst: 'hat', gain: 0.55, pan: 0.3, bars: '.aaa aaaa .aaa aaaa', patterns: { a: '5.3.4.3.5.3.4.3.' } },
          ],
        },
        { type: 'events', inst: 'swell:riser', gain: 0.5, list: [{ bar: 16, u: 0, notes: ['x'], len: 8 }] },
        { type: 'events', inst: 'crash', gain: 0.7, list: [1, 5, 9, 13].map((b) => ({ bar: b, u: 0, notes: ['x'], vel: 0.75 })) },
        { type: 'events', inst: 'chime', gain: 0.8, list: [{ bar: 1, u: 0, notes: ['G6', 'D7'], step: 1, vel: 0.5 }, { bar: 9, u: 0, notes: ['G6', 'D7'], step: 1, vel: 0.5 }] },
        {
          type: 'events', inst: 'harp', gain: 0.9,
          list: [
            { bar: 8, u: 5, notes: ['D4', 'F#4', 'A4', 'D5', 'F#5', 'A5'], step: 0.25, vel: 0.5, pan: -0.4, panStep: 0.16 },
            { bar: 16, u: 4, notes: ['G4', 'B4', 'D5', 'G5', 'B5', 'D6', 'G6'], step: 0.25, vel: 0.5, pan: -0.4, panStep: 0.13 },
          ],
        },
      ],
    },
  },
});
