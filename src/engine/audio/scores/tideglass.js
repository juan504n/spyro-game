// Tideglass Reach — "The Lens and the Tide". The Tideglass is the great lens of the lighthouse, sea-glass blown by the Reachfolk, and it kept the tide to its hours; when its light went
// out the tide lost its way. Five Tide Lenses are lit; each brings the realm a step from a teal dusk to a green dawn, and when the Tideglass itself shines the tide is true again.
//
// A BARCAROLLE, 6/8 at 92 (two dotted-quarter beats to the bar: the rock of a boat), in F# with the third as the one note that moves between the two lights:
//   the tune is written with `+` on the notes whose sound is the mode (the third A / A#, D / D#), so it is the same tune in F# MINOR at dusk (the low tide: the sea is out, the
//   Reach is dark and still, a glass harmonica sings and a slow harp rolls under it) and in F# MAJOR at dawn (the high tide: the same notes, the third raised, a bright harp in
//   sixteenths, a kalimba like drops, hand drums, a shaker, a triangle). Every other chord is the same in both lights, including the borrowed chords of the middle strain (D, A, E: the
//   water the colour of the lens), so the blend between them is only ever a third.
//   A   (8)  the tide comes in: broken chords sung in long notes with a stepwise lift (C#-F#-G#-A / B-A-F#-D / A-G#-F# ...), a rise to F#6 on the tonic, a suspension F# -> E# over C# (4-3)
//            and home to F# on the last bar.
//   B   (8)  the water lifts into the borrowed chords D, A, E, C#: the tune climbs the chord each bar to the peak, G# and E#6 over the last two bars.
//   A'  (8)  the tune returns; the last bar settles on E# G# C#, the dominant, which turns back into the tonic and the first note (C#5).
// A wave (swept noise, 4 bars apart) breaks over the music: 12 units rising and falling.

import { defineScore } from '../score.js';

export const SCORE = defineScore({
  id: 'tideglass',
  name: 'TIDEGLASS REACH',
  title: 'The Lens and the Tide',
  bpm: 92, upb: 6, groups: [3, 3], bars: 24, swing: 0,
  ambience: { dusk: 0.5, day: 0.6 },
  tonic: 'F#',
  bassLow: 36,

  lines: {
    tune: [
      // A
      'C#5/3 F#5/1 G#5/1 A+5/1', 'B5/2 A=5/1 F#5/2 D+5/1', 'A+5/3 G#5/1 F#5/2', 'C#6/3 B5/1 G#5/2',
      'A+5/2 C#6/2 F#6/2', 'D+6/3 C#6/1 B5/2', 'F#5/3 E#5/3', 'A+5/3 F#5/3',
      // B
      'A=5/3 G=5/1 F#5/1 D=5/1', 'C#6/3 B5/1 A=5/2', 'B5/3 A=5/1 G#5/2', 'E#5/3 G#5/2 C#6/1',
      'F#5/2 A=5/2 D=6/2', 'E=6/3 D=6/1 C#6/2', 'G#6/3 F#6/1 E=6/2', 'E#6/3 C#6/2 G#5/1',
      // A'
      'C#5/3 F#5/1 G#5/1 A+5/1', 'B5/2 A=5/1 F#5/2 D+5/1', 'A+5/3 G#5/1 F#5/2', 'C#6/3 B5/1 G#5/2',
      'A+5/2 C#6/2 F#6/2', 'D+6/3 C#6/1 B5/2', 'F#5/3 E#5/3', 'G#5/3 E#5/1 C#5/2',
    ],
  },

  variants: {
    dusk: {
      wet: 0.85,
      intensity: '2222 2233 3344 4433 2222 2233',
      chords: [
        'F#m', 'Bm', 'F#m', 'C#', 'F#m', 'Bm', [['C#sus4', 3], ['C#', 3]], 'F#m',
        'D', 'A', 'E', 'C#', 'D', 'A', 'E', 'C#',
        'F#m', 'Bm', 'F#m', 'C#', 'F#m', 'Bm', [['C#sus4', 3], ['C#', 3]], 'C#',
      ],
      parts: [
        { type: 'line', line: 'tune', inst: 'glassharm', bars: 'xxxx xxxx xxxx xxxx xxxx xxxx', level: -18, pan: -0.05, opts: { attack: 0.16, release: 0.5 }, sustain: 0.97 },
        { type: 'arp', inst: 'harp', bars: 'aaaa aaaa aaaa aaaa aaaa aaaa', level: -22, spread: 0.7, patterns: { a: '0.1.2.3.2.1.' } },
        { type: 'pad', inst: 'strings', bars: 'xxxx xxxx xxxx xxxx xxxx xxxx', level: -26, opts: { cut: 1500, attack: 0.9, release: 1.0 } },
        {
          type: 'bass', inst: 'bass', bars: 'aaaa aaha aaaa aaaa aaaa aaha', level: -22,
          patterns: { a: [[0, 'R', 2.8, 1], [3, '5', 2.8, 0.7]], h: [[0, 'R', 2.8, 1]] },
        },
        { type: 'events', inst: 'swell:wave', gain: 0.55, list: [1, 5, 9, 13, 17, 21].map((b) => ({ bar: b, u: 0, notes: ['x'], len: 12 })) },
        {
          type: 'events', inst: 'glass', gain: 0.8,
          list: [
            { bar: 4, u: 3, notes: ['C#7', 'A6', 'F#6'], step: 1, vel: 0.35, pan: -0.3, panStep: 0.3 },
            { bar: 12, u: 3, notes: ['G#6', 'E#6', 'C#6'], step: 1, vel: 0.35, pan: 0.3, panStep: -0.3 },
            { bar: 24, u: 3, notes: ['G#6', 'E#6', 'C#6'], step: 1, vel: 0.4, pan: -0.3, panStep: 0.3 },
          ],
        },
      ],
    },

    dawn: {
      wet: 0.55,
      alter: { '+': 1 },
      intensity: '4455 5566 6677 7766 5555 5566',
      chords: [
        'F#', 'B', 'F#', 'C#', 'F#', 'B', [['C#sus4', 3], ['C#', 3]], 'F#',
        'D', 'A', 'E', 'C#', 'D', 'A', 'E', 'C#',
        'F#', 'B', 'F#', 'C#', 'F#', 'B', [['C#sus4', 3], ['C#', 3]], 'C#',
      ],
      parts: [
        { type: 'line', line: 'tune', inst: 'glassharm', bars: 'xxxx xxxx xxxx xxxx xxxx xxxx', level: -18, pan: -0.05, opts: { attack: 0.12, release: 0.45 }, sustain: 0.97 },
        {
          type: 'arp', inst: 'harp', bars: 'aaaa aaaa bbbb bbbb aaaa aaaa', level: -21, spread: 0.7, pan: 0.05,
          patterns: { a: '0.1.2.3.4.2.', b: '012123432123' },
        },
        { type: 'pad', inst: 'strings', bars: 'xxxx xxxx xxxx xxxx xxxx xxxx', level: -25, opts: { cut: 2800, attack: 0.7, release: 0.8 } },
        {
          type: 'bass', inst: 'bass', bars: 'aaaa aaha aaaa aaaa aaaa aaha', level: -22,
          patterns: { a: [[0, 'R', 2.8, 1], [3, '5', 2.8, 0.7]], h: [[0, 'R', 2.8, 1]] },
        },
        {
          type: 'perc', level: -29,
          tracks: [
            { inst: 'congaOpen', gain: 0.9, pan: -0.3, bars: '.... aaaa aaaa aaaa aaaa aaaa', patterns: { a: '5.....4.....' } },
            { inst: 'shaker', gain: 0.7, pan: 0.35, bars: '..aa aaaa aaaa aaaa aaaa aaaa', patterns: { a: '4.2.3.4.2.3.' } },
          ],
        },
        { type: 'events', inst: 'swell:wave', gain: 0.4, list: [1, 5, 9, 13, 17, 21].map((b) => ({ bar: b, u: 0, notes: ['x'], len: 12 })) },
        { type: 'events', inst: 'triangle', gain: 0.6, list: [1, 9, 17].map((b) => ({ bar: b, u: 0, notes: ['x'], vel: 0.5 })) },
        {
          type: 'events', inst: 'kalimba', gain: 0.8,
          list: [
            { bar: 4, u: 3, notes: ['C#6', 'F#6', 'A#6'], step: 1, vel: 0.45, pan: 0.3, panStep: -0.3 },
            { bar: 8, u: 3, notes: ['G#5', 'C#6', 'E#6'], step: 1, vel: 0.45, pan: -0.3, panStep: 0.3 },
            { bar: 16, u: 3, notes: ['G#5', 'C#6', 'E#6'], step: 1, vel: 0.45, pan: 0.3, panStep: -0.3 },
            { bar: 20, u: 3, notes: ['C#6', 'F#6', 'A#6'], step: 1, vel: 0.45, pan: -0.3, panStep: 0.3 },
            { bar: 24, u: 3, notes: ['G#5', 'C#6', 'E#6'], step: 1, vel: 0.5, pan: 0.3, panStep: -0.3 },
          ],
        },
      ],
    },
  },
});
