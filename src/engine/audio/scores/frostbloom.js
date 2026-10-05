// Frostbloom Hollow — "Aurora Thaw". An endless winter has frozen the blossoms asleep; five flowers of ice with a flame inside are thawed by fire.
//
// ONE TUNE, TWO LIGHTS. The tune is written once, in the notes E minor and G major share (E F# G A B C D), and it is the same tune in both colourings; what changes is where
// the harmony stands. Dusk (the frozen, aurora-lit night) keeps an E in the bass under every chord of the first eight bars: a pedal that holds the music still, so that the
// chords above it (Em, C/E, G/E, D/E ...) hang in the air like light on ice: glass bells ring the tune, a cold string pad swells under them, a wind rises and falls, a
// heartbeat starts late. Dawn (the blossom thaw) moves the pedal to G and the same notes turn major: a flute sings the tune over a flowing harp, a warm string pad, a
// shaker and a triangle; the triangle rings on the downbeats of the strains. The two loops are time-aligned and share every note of the tune, so the crossfade is a change of light, not of music.
//
// 4/4 at 66, 12 bars = A (4) A' (4) B (4):
//   A   the hook: up a fourth from the low B to E, a third to G, then the same figure as an arpeggio (E G B), a high D, a fall to G; the strain hangs on a held F# over D.
//   A'  the hook again; the second bar opens out to D6 (the ninth over C); A m7 falls from C6; the strain stops on F# held over Bm (the fifth: not finished).
//   B   the lift: G C E (a rising C arpeggio) to the peak E6, a fall through G/B, A m7, and Dsus4 -> D (G falls to F#, the 3rd) which turns back into the hook.

import { defineScore } from '../score.js';

export const SCORE = defineScore({
  id: 'frostbloom',
  name: 'FROSTBLOOM HOLLOW',
  title: 'Aurora Thaw',
  bpm: 66, upb: 8, groups: [2, 2, 2, 2], bars: 12, swing: 0,
  ambience: { dusk: 0.2, day: 0.5 },                                // (the Hollow has its own wind: the music brings it)
  tonic: 'E',
  bassLow: 40,                                                       // (E2: the pedal has to be heard on a phone's speaker; E1 is not)

  lines: {
    tune: [
      // A
      'B4/4 E5/2 G5/2', 'E5/2 G5/2 B5/4', 'D6/4 B5/2 G5/2', 'A5/4 F#5/4',
      // A'
      'B4/4 E5/2 G5/2', 'E5/2 G5/2 B5/2 D6/2', 'C6/4 A5/2 E5/2', 'D6/3 B5/1 F#5/4',
      // B
      'G5/2 C6/2 E6/4', 'D6/2 B5/2 G5/4', 'A5/4 E5/4', 'G5/4 F#5/4',
    ],
  },

  variants: {
    dusk: {
      wet: 0.95,
      scale: 'E F# G A B C D',
      intensity: '2333 3445 6764',
      chords: [
        'Em', 'Cmaj7/E', 'G/E', 'D/E',
        'Em', 'Cmaj7/E', 'Am7/E', 'Bm/E',
        'C', 'G/B', 'Am7', [['Dsus4', 4], ['D', 4]],
      ],
      parts: [
        { type: 'line', line: 'tune', inst: 'glass', bars: 'xxxx xxxx xxxx', level: -19, pan: 0, echo: { at: 1.5, gain: 0.28, pan: 0.45 } },
        { type: 'pad', inst: 'strings', bars: 'xxxx xxxx xxxx', level: -24, opts: { cut: 1600, attack: 1.1, release: 1.2 } },
        { type: 'pad', inst: 'choir', bars: '.... xxxx xxxx', level: -29, voices: [0, 2], pans: [-0.3, 0.3], opts: { vowel: 'u', attack: 1.2, release: 1.4 } },
        { type: 'bass', inst: 'subbass', bars: 'aaaa aaaa aaah', level: -24, patterns: { a: [[0, 'R', 7.5, 1]], h: [[0, 'R', 3.5, 1]] } },
        {
          type: 'perc', level: -34,
          tracks: [{ inst: 'kick', gain: 1, pan: 0, bars: '.... aaaa aaaa', patterns: { a: '5.....3.........' } }],
        },
        {
          type: 'events', inst: 'swell:wind', gain: 0.55,
          list: [{ bar: 1, u: 0, notes: ['x'], len: 14 }, { bar: 5, u: 0, notes: ['x'], len: 14 }, { bar: 9, u: 0, notes: ['x'], len: 14 }],
        },
        {
          type: 'events', inst: 'glass', gain: 0.8,
          list: [
            { bar: 4, u: 6, notes: ['E6', 'B5', 'G5', 'E5'], step: 0.5, vel: 0.4, pan: -0.3, panStep: 0.2 },
            { bar: 8, u: 6, notes: ['F#6', 'D6', 'B5', 'F#5'], step: 0.5, vel: 0.4, pan: 0.3, panStep: -0.2 },
            { bar: 12, u: 6, notes: ['D6', 'A5', 'F#5', 'D5'], step: 0.5, vel: 0.45, pan: -0.2, panStep: 0.15 },
          ],
        },
      ],
    },

    dawn: {
      wet: 0.6,
      scale: 'G A B C D E F#',
      intensity: '4555 5667 8986',
      chords: [
        'G', 'Cmaj7/G', 'Em7/G', 'D/G',
        'G', 'Cmaj7/G', 'Am7/G', 'Bm/G',
        'C', 'G/B', 'Am7', [['Dsus4', 4], ['D', 4]],
      ],
      parts: [
        { type: 'line', line: 'tune', inst: 'flute', bars: 'xxxx xxxx xxxx', level: -18, pan: -0.1 },
        {
          type: 'arp', inst: 'harp', bars: 'aaaa aaaa bbbb', level: -21, spread: 0.7, pan: 0.05,
          patterns: { a: '0.1.2.3.2.1.2.1.', b: '0123210123210123' },
        },
        { type: 'pad', inst: 'strings', bars: 'xxxx xxxx xxxx', level: -24, opts: { cut: 2600, attack: 0.8, release: 0.9 } },
        { type: 'bass', inst: 'subbass', bars: 'aaaa aaaa aaah', level: -24, patterns: { a: [[0, 'R', 7.5, 1]], h: [[0, 'R', 3.5, 1]] } },
        {
          type: 'perc', level: -29,
          tracks: [
            { inst: 'shaker', gain: 0.8, pan: 0.35, bars: '..aa aaaa aaaa', patterns: { a: '4.2.3.2.4.2.3.2.' } },
            { inst: 'tamb', gain: 0.6, pan: -0.3, bars: '.... .... aaaa', patterns: { a: '....4.......4...' } },
            { inst: 'kick', gain: 0.8, pan: 0, bars: '.... .... aaaa', patterns: { a: '5.......4.......' } },
          ],
        },
        {
          type: 'events', inst: 'triangle', gain: 0.6,
          list: [{ bar: 1, u: 0, notes: ['x'], vel: 0.5 }, { bar: 5, u: 0, notes: ['x'], vel: 0.5 }, { bar: 9, u: 0, notes: ['x'], vel: 0.6 }],
        },
        { type: 'events', inst: 'swell:wash', gain: 0.4, list: [{ bar: 8, u: 4, notes: ['x'], len: 4 }] },
        {
          type: 'events', inst: 'kalimba', gain: 0.8,
          list: [
            { bar: 4, u: 6, notes: ['B5', 'D6', 'E6'], step: 0.5, vel: 0.5, pan: 0.3, panStep: -0.2 },
            { bar: 8, u: 6, notes: ['D6', 'F#6', 'A6'], step: 0.5, vel: 0.5, pan: -0.3, panStep: 0.2 },
            { bar: 12, u: 6, notes: ['D6', 'A5', 'F#5', 'D5'], step: 0.5, vel: 0.5, pan: 0.2, panStep: -0.15 },
          ],
        },
      ],
    },
  },
});
