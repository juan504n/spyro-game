// Dawnhaven — "Lantern Keepers' Waltz". The homeworld is always daybreak, so this song has the one colouring (dawn).
//
// A village waltz in G major, 3/4 at 104: the whistle sings the tune over a plucked oom-pah-pah (bass on one, strummed chords on two and
// three), harps and strings coming in for the second (the strums rest while the harps run, and the bass walks to the fifth in the last strain). 24 bars = A (8) B (8) A' (8):
//   A   the tune: a rising fourth to the high G, a settle through F#; the answer falls by step; bar 5 lifts it to B; the strain closes on G.
//   B   the lift: the whistle starts each bar on a high chord tone and falls through the chord (Em Bm C G/B | Am7 D/F# Em7 | D7sus4 - D7),
//       harps arpeggiate, the celesta sparkles at the ends of the strains, and the last bar's suspended G resolves to F# (the 3rd of D7) into the return.
//   A'  the tune again, fuller: climbing to C6 in bar 22, a D7 turn in bar 23, and a walk D/F# -> G in the last bar into the first.

import { defineScore } from '../score.js';

export const SCORE = defineScore({
  id: 'home',
  name: 'DAWNHAVEN',
  title: "Lantern Keepers' Waltz",
  bpm: 104, upb: 6, groups: [2, 2, 2], bars: 24, swing: 0,
  tonic: 'G',

  lines: {
    tune: [
      // A
      'D5/2 G5/3 F#5/1', 'E5/2 D5/2 F#5/2', 'G5/3 E5/1 B4/2', 'E5/2 D5/2 C5/2',
      'D5/2 G5/3 B5/1', 'A5/3 G5/1 E5/2', 'E5/2 G5/1 F#5/2 A5/1', 'G5/5 r/1',
      // B
      'B5/3 G5/1 E5/2', 'D6/3 B5/1 F#5/2', 'C6/3 G5/1 E5/2', 'D5/2 G5/2 B5/2',
      'C6/3 B5/1 A5/2', 'A5/2 F#5/2 D5/2', 'E5/2 G5/2 B5/1 A5/1', 'G5/3 F#5/3',
      // A'
      'D5/2 G5/3 F#5/1', 'E5/2 D5/2 F#5/2', 'G5/3 E5/1 B4/2', 'E5/2 D5/2 C5/2',
      'D5/2 G5/2 B5/2', 'C6/3 A5/1 E5/2', 'C6/2 A5/1 A5/2 F#5/1', 'G5/3 F#5/3',
    ],
  },

  variants: {
    dawn: {
      wet: 0.5,
      scale: 'G A B C D E F#',
      intensity: '344555666778889988889997',
      chords: [
        'G', 'D/F#', 'Em', 'Cmaj7', 'G/B', 'Am7', [['C', 3], ['D', 3]], 'G',
        'Em', 'Bm', 'C', 'G/B', 'Am7', 'D/F#', 'Em7', [['D7sus4', 3], ['D7', 3]],
        'G', 'D/F#', 'Em', 'Cmaj7', 'G/B', 'Am7', [['Am7', 3], ['D7', 3]], [['G', 3], ['D/F#', 3]],
      ],
      parts: [
        { type: 'line', line: 'tune', inst: 'whistle', bars: 'xxxxxxxx xxxxxxxx xxxxxxxx', level: -17, pan: -0.1 },
        { type: 'pad', inst: 'strings', bars: '........ xxxxxxxx xxxxxxxx', level: -23, opts: { cut: 2200, attack: 0.5, release: 0.6 } },
        {
          type: 'bass', inst: 'bass', bars: 'aaaaaaha aaaaaaah bbbbbbhh', level: -21,
          patterns: { a: [[0, 'R', 2.6, 1]], b: [[0, 'R', 1.8, 1], [4, '5', 1.8, 0.55]], h: [[0, 'R', 2.6, 1]] },
        },
        { type: 'comp', inst: 'pizz', bars: 'aaaaaaaa ........ aaaaaaaa', level: -24, patterns: { a: [2, 4] }, voices: [1, 2, 3], strum: 0.012 },
        { type: 'arp', inst: 'harp', bars: '........ aabbaabb aabbaabb', level: -22, patterns: { a: '0.1.2.3.2.1.', b: '0.2.1.3.2.1.' }, spread: 0.6, pan: 0.1 },
        {
          type: 'perc', level: -28,
          tracks: [
            { inst: 'shaker', gain: 0.7, pan: 0.35, bars: '..aaaaaa aaaaaaaa aaaaaaaa', patterns: { a: '6.3.4.3.4.3.' } },
            { inst: 'wood', gain: 0.6, pan: -0.4, alt: 'woodLo', bars: '........ aaaaaaaa aaaaaaaa', patterns: { a: '....5...4...' } },
            { inst: 'kick', gain: 0.8, pan: 0, bars: '........ aaaaaaaa aaaaaaaa', patterns: { a: '6...........' } },
            { inst: 'tamb', gain: 0.6, pan: -0.25, bars: '........ ........ aaaaaaaa', patterns: { a: '........4...' } },
          ],
        },
        {
          type: 'events', inst: 'celesta', gain: 0.9,
          list: [
            { bar: 8, u: 3, notes: ['G6', 'D6', 'B5', 'G5'], step: 0.5, vel: 0.5, pan: -0.3, panStep: 0.2 },
            { bar: 16, u: 3, notes: ['D6', 'A5', 'F#5', 'D5'], step: 0.5, vel: 0.5, pan: 0.3, panStep: -0.2 },
            { bar: 24, u: 3, notes: ['D6', 'B5', 'G5', 'D5'], step: 0.5, vel: 0.5, pan: -0.3, panStep: 0.2 },
          ],
        },
        { type: 'events', inst: 'chime', gain: 0.7, list: [{ bar: 1, u: 0, notes: ['D6'], vel: 0.35 }, { bar: 9, u: 0, notes: ['G6'], vel: 0.4 }, { bar: 17, u: 0, notes: ['D6'], vel: 0.4 }] },
      ],
    },
  },
});
