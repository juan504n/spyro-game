// Emberfall Crags — "The Cold Forge". The forges of the crags have gone cold; five Emberstones are lit by dragon fire, and the crags burn from ash-red dusk to forge-gold.
//
// A forge song in SEVEN: 7/8 counted 2+2+3 at 144 (the hammer falls on one, three and five, and the last stroke of the bar is the long one), over a growling saw-bass ostinato,
// timpani and taiko on the two big strokes, an anvil that rings on the last eighth of every second bar, and a brass line for the tune.
//   DUSK  C phrygian dominant (C Db E F G Ab Bb), power chords with no thirds so nothing is major or minor but the tune: a shawm (a double reed) sings the hook over a drone, and the half-step
//         it falls by (Db to C) is the whole mood. A low choir "oh" joins for the peak; the strings hold the ash.
//   DAWN  the same tune with D, A and B back where they belong (C major), triads under it, the horn in the light (brighter), hats and a snare, the strings an octave up on the tune,
//         a cymbal on the downbeats of the big sections: the forge is lit.
// 28 bars = seven phrases of four:
//   1 hook      E G C, D C G, E G C D, E-D-C           the rising fifth and fourth, the fall; the forge starts
//   2 hook'     the hook climbs: G E C, then D F A (the Db chord at dusk), then a close on G E D
//   3 hammer    the tune turns to the stroke: G G C, E E G ... in the 7/8 rhythm (1 1 2 1 1 1), walking down through F and E to C
//   4 peak      C6 G E / D6 A F / E6 C G / D6 C G: high and wide, the choir comes in
//   5 hook      the first phrase again, thin: the anvil and the bass alone under it
//   6 build     rests on the strokes and the tune climbs back in (E G | G C | C E | G E D): a snare roll under it
//   7 final     the hook an octave out of reach (D C G up to G5, E G C6) and a descent B A G (Bb Ab G at dusk) that falls into the first bar

import { defineScore } from '../score.js';

export const SCORE = defineScore({
  id: 'emberfall',
  name: 'EMBERFALL CRAGS',
  title: 'The Cold Forge',
  bpm: 144, upb: 7, groups: [2, 2, 3], bars: 28, swing: 0,
  ambience: { dusk: 0.2, day: 0.45 },
  tonic: 'C',
  bassLow: 36,
  padRange: [45, 64],                                                // (the harmony stays under the tune: the Db of the tune is a half-step above the drone, not against it)

  // written in the notes of the dawn (C major); the dusk lowers D, A and B (phrygian dominant)
  lines: {
    tune: [
      // 1 hook
      'E4/2 G4/2 C5/3', 'D5/2 C5/2 G4/3', 'E4/2 G4/2 C5/1.5 D5/1.5', 'E5/4 D5/1 C5/2',
      // 2 hook'
      'E4/2 G4/2 C5/3', 'G5/2 E5/2 C5/3', 'D5/2 F5/2 A5/3', 'G5/4 E5/1 D5/2',
      // 3 hammer
      'G4/1 G4/1 C5/2 E5/1 E5/1 G5/1', 'G5/1 G5/1 F5/2 E5/1 E5/1 D5/1', 'E5/1 E5/1 A5/2 G5/1 G5/1 F5/1', 'E5/2 D5/2 C5/3',
      // 4 peak
      'C6/3 G5/2 E5/2', 'D6/3 A5/2 F5/2', 'E6/3 C6/2 G5/2', 'D6/2 C6/2 G5/3',
      // 5 hook, thin
      'E4/2 G4/2 C5/3', 'D5/2 C5/2 G4/3', 'E4/2 G4/2 C5/1.5 D5/1.5', 'E5/4 D5/1 C5/2',
      // 6 build
      'r/2 E4/2 G4/3', 'r/2 G4/2 C5/3', 'r/2 C5/2 E5/3', 'G5/2 E5/2 D5/3',
      // 7 final
      'E4/2 G4/2 C5/3', 'D5/2 C5/2 G5/3', 'E5/2 G5/2 C6/3', 'B5/2 A5/2 G5/3',
    ],
  },

  variants: {
    dusk: {
      wet: 0.8,
      alter: { D: -1, A: -1, B: -1 },
      scale: 'C Db E F G Ab Bb',
      intensity: '4444 5555 6677 8888 4444 6789 9999',
      chords: [
        'C5', 'C5', 'C5', 'C5',
        'C5', 'C5', 'Db', 'C5',
        'C5', 'Fm', 'Fm', 'C5',
        'Fm', 'Db', 'C5', 'C5',
        'C5', 'C5', 'C5', 'C5',
        'Fm', 'Fm', 'Db', 'C5',
        'C5', 'C5', 'C5', 'C5',
      ],
      parts: [
        { type: 'line', line: 'tune', inst: 'shawm', bars: 'xxxx xxxx xxxx xxxx xxxx xxxx xxxx', level: -17, pan: -0.05, opts: { bright: 0.9 } },
        { type: 'pad', inst: 'strings', bars: '.... xxxx xxxx xxxx .... xxxx xxxx', level: -25, opts: { cut: 1500, attack: 0.5, release: 0.5 } },
        { type: 'pad', inst: 'choir', bars: '.... .... .... xxxx .... .... xxxx', level: -27, voices: [0, 2], pans: [-0.3, 0.3], opts: { vowel: 'o', attack: 0.6, release: 0.6 } },
        {
          type: 'bass', inst: 'sawbass', bars: 'aaaa aaaa aaaa aaaa aaaa aaaa aaaa', level: -21, opts: { bright: 0.8 },
          patterns: { a: [[0, 'R', 1.6, 1], [2, 'R', 1.6, 0.85], [4, 'R', 0.9, 1], [5, '5', 0.9, 0.7], [6, 'R', 0.9, 0.8]] },
        },
        { type: 'bass', inst: 'timpani', bars: 'aaaa aaaa aaaa aaaa aaaa aaaa aaaa', level: -24, cut: false, patterns: { a: [[0, 'R', 1, 1], [4, 'R', 1, 0.8]] } },
        {
          type: 'perc', level: -26,
          tracks: [
            { inst: 'taiko', gain: 1, pan: 0, bars: 'aaaa aaaa aaaa aaaa aaaa aaaa aaaa', patterns: { a: '8.......6.....' } },
            { inst: 'anvil', gain: 0.8, pan: 0.3, bars: 'a.a. a.a. a.a. a.a. a.a. a.a. a.a.', patterns: { a: '............5.' } },
            { inst: 'rim', gain: 0.8, pan: -0.3, bars: '.... aaaa aaaa aaaa .... aaaa aaaa', patterns: { a: '....6.....5...' } },
          ],
        },
        { type: 'events', inst: 'swell:riser', gain: 0.5, list: [{ bar: 24, u: 0, notes: ['x'], len: 7 }] },
        { type: 'events', inst: 'crash', gain: 0.6, list: [{ bar: 13, u: 0, notes: ['x'], vel: 0.6 }, { bar: 25, u: 0, notes: ['x'], vel: 0.7 }] },
      ],
    },

    dawn: {
      wet: 0.5,
      scale: 'C D E F G A B',
      intensity: '5555 6666 7777 9999 5555 7789 9999',
      chords: [
        'C', 'G', 'C', 'C',
        'C', 'F', 'Dm', 'G',
        'C', 'F', 'Dm7', 'G',
        'Am', 'F', 'C', 'G',
        'C', 'G', 'C', 'C',
        'Am', 'Am', 'F', 'G',
        'C', 'G', 'C', 'G',
      ],
      parts: [
        { type: 'line', line: 'tune', inst: 'horn', bars: 'xxxx xxxx xxxx xxxx xxxx xxxx xxxx', level: -17, pan: -0.05, opts: { bright: 1.3 } },
        { type: 'line', line: 'tune', inst: 'strings', bars: '.... .... .... .... .... .... xxxx', level: -27, pan: 0.25, transpose: 12, opts: { cut: 3200, attack: 0.15, release: 0.3 } },
        { type: 'pad', inst: 'strings', bars: 'xxxx xxxx xxxx xxxx xxxx xxxx xxxx', level: -24, opts: { cut: 2600, attack: 0.4, release: 0.5 } },
        { type: 'pad', inst: 'choir', bars: '.... .... .... xxxx .... .... xxxx', level: -27, voices: [0, 2], pans: [-0.3, 0.3], opts: { vowel: 'a', attack: 0.5, release: 0.6 } },
        {
          type: 'bass', inst: 'sawbass', bars: 'aaaa aaaa aaaa aaaa aaaa aaaa aaaa', level: -21, opts: { bright: 1.2 },
          patterns: { a: [[0, 'R', 1.6, 1], [2, 'R', 1.6, 0.85], [4, 'R', 0.9, 1], [5, '5', 0.9, 0.7], [6, 'R', 0.9, 0.8]] },
        },
        { type: 'bass', inst: 'timpani', bars: 'aaaa aaaa aaaa aaaa aaaa aaaa aaaa', level: -24, cut: false, patterns: { a: [[0, 'R', 1, 1], [4, 'R', 0.9, 0.8]] } },
        {
          type: 'perc', level: -25,
          tracks: [
            { inst: 'taiko', gain: 1, pan: 0, bars: 'aaaa aaaa aaaa aaaa aaaa aaaa aaaa', patterns: { a: '8.......6.....' } },
            { inst: 'anvil', gain: 0.7, pan: 0.3, bars: 'a.a. a.a. a.a. a.a. a.a. a.a. a.a.', patterns: { a: '............5.' } },
            { inst: 'snare', gain: 0.8, pan: -0.2, bars: '.... aaaa aaaa aaaa .... aaaa aaaa', patterns: { a: '....6.....5...' } },
            { inst: 'hat', gain: 0.6, pan: 0.35, bars: '.... aaaa aaaa aaaa .... aaaa aaaa', patterns: { a: '5.3.4.3.5.3.3.' } },
          ],
        },
        { type: 'events', inst: 'swell:riser', gain: 0.5, list: [{ bar: 24, u: 0, notes: ['x'], len: 7 }] },
        { type: 'events', inst: 'crash', gain: 0.7, list: [{ bar: 1, u: 0, notes: ['x'], vel: 0.6 }, { bar: 13, u: 0, notes: ['x'], vel: 0.8 }, { bar: 25, u: 0, notes: ['x'], vel: 0.9 }] },
        {
          type: 'events', inst: 'chime', gain: 0.8,
          list: [
            { bar: 8, u: 5, notes: ['E6', 'G6', 'C7'], step: 0.5, vel: 0.5, pan: -0.3, panStep: 0.3 },
            { bar: 16, u: 5, notes: ['G6', 'B6', 'D7'], step: 0.5, vel: 0.5, pan: 0.3, panStep: -0.3 },
            { bar: 28, u: 5, notes: ['E6', 'G6', 'C7'], step: 0.5, vel: 0.5, pan: -0.3, panStep: 0.3 },
          ],
        },
      ],
    },
  },
});
