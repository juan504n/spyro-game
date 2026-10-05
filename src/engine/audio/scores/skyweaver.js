// Skyweaver Spires — "Windbell Loom". The Skyweavers wove the winds into the spires and kept them there with five great Windbells; the bells fell silent, the winds fell slack,
// and the clouds have lain still. Each bell the hero rings brings the realm a step from a windless rose dusk to a bright morning.
//
// ONE TUNE IN A SUNLESS AND A SUNNY ARRANGEMENT: the key (A major) and the tune are the same in both; what changes is the weather.
//   DUSK  windless: a music box winds the tune out note by note, a glass harmonica holds the air under it, a few notes of an FM piano fall like single drops, wind chimes hang
//         still, the harmony is open (add9, sus), a plucked bass beats the long beats. No wind, no drums.
//   DAWN  the winds return: a breathy flute sings the tune, bright piano arpeggios run in sixteenths, a pulse in the bass, a soft kick, hats on the
//         off-beats, a shaker and a tambourine, strings, wind swells that rise and fall at the start of every phrase, and a harp that sweeps at the ends of phrases.
// 4/4 at 112, 20 bars = five phrases of four: A (the run and the soar) A' (higher) B (the same 3+3+2 over D A B/E C#m... lifting) A'' (the run again) and a tag that climbs to E6 and falls back.
//   A    four eighth notes running up (A B C# E) and landing on the long A; E/G# answers by falling; the second run starts on F# and lands on B (the 11th of F#m7: it leans, and resolves)
//   A'   the run ends in a leap to C#6; the second run goes up to E6, the peak of the first half
//   B    the rhythm changes to 3+3+2 (a tresillo): each bar rises through the chord (F# A D | E C# A | D B F# | G# B E)
//   tag  E6 / C#6 / A5, B5 / G#5 / E5, a run through D and a last turn that drops into the first run

import { defineScore } from '../score.js';

export const SCORE = defineScore({
  id: 'skyweaver',
  name: 'SKYWEAVER SPIRES',
  title: 'Windbell Loom',
  bpm: 112, upb: 8, groups: [2, 2, 2, 2], bars: 20, swing: 0,
  ambience: { dusk: 0.1, day: 0.7 },                                 // (the dusk of the Spires is windless)
  tonic: 'A',
  bassLow: 38,

  lines: {
    tune: [
      // A
      'A4/1 B4/1 C#5/1 E5/1 A5/4', 'G#5/2 F#5/2 E5/4', 'F#5/1 G#5/1 A5/1 C#6/1 B5/4', 'A5/3 F#5/1 G#5/2 E5/2',
      // A'
      'A4/1 B4/1 C#5/1 E5/1 A5/2 C#6/2', 'B5/2 G#5/2 E5/2 G#5/2', 'F#5/1 G#5/1 A5/1 C#6/1 E6/4', 'D6/2 B5/2 G#5/2 B5/2',
      // B
      'F#5/3 A5/3 D6/2', 'E6/3 C#6/3 A5/2', 'D6/3 B5/3 F#5/2', 'G#5/3 B5/3 E6/2',
      // A''
      'A4/1 B4/1 C#5/1 E5/1 A5/4', 'G#5/2 F#5/2 E5/4', 'F#5/1 G#5/1 A5/1 C#6/1 B5/4', 'A5/3 F#5/1 G#5/2 E5/2',
      // tag
      'E6/4 C#6/2 A5/2', 'B5/4 G#5/2 E5/2', 'F#5/2 A5/2 D6/4', 'E6/2 D6/1 C#6/1 B5/2 G#5/2',
    ],
  },

  variants: {
    dusk: {
      wet: 0.9,
      scale: 'A B C# D E F# G#',
      intensity: '2233 3344 4455 3344 3322',
      chords: [
        'Aadd9', 'E/G#', 'F#m7', [['Dmaj7', 4], ['E', 4]],
        'Aadd9', 'E/G#', 'F#m9', [['Dmaj7', 4], ['E', 4]],
        'Dmaj7', 'A/C#', 'Bm7', [['Esus4', 4], ['E', 4]],
        'Aadd9', 'E/G#', 'F#m7', [['Dmaj7', 4], ['E', 4]],
        'A', 'E/G#', 'Dmaj7', 'E',
      ],
      parts: [
        { type: 'line', line: 'tune', inst: 'musicBox', bars: 'xxxx xxxx xxxx xxxx xxxx', level: -19, pan: -0.1, echo: { at: 3, gain: 0.3, pan: 0.5 } },
        { type: 'pad', inst: 'glassharm', bars: 'xxxx xxxx xxxx xxxx xxxx', level: -26, opts: { attack: 1.0, release: 1.2 }, octave: 12, voices: [0, 2, 3], pans: [-0.4, 0, 0.4] },
        { type: 'bass', inst: 'bass', bars: 'aaah aaah aaah aaah aaaa', level: -23, patterns: { a: [[0, 'R', 3, 1], [4, '5', 3, 0.65]], h: [[0, 'R', 3, 1]] } },
        { type: 'arp', inst: 'epiano', bars: 'aaaa aaaa aaaa aaaa aaaa', level: -27, spread: 0.5, patterns: { a: '0.......2.......' } },
        { type: 'events', inst: 'chime', gain: 0.6, list: [1, 5, 9, 13, 17].map((b, i) => ({ bar: b, u: 0, notes: [['A6', 'E6', 'C#7', 'A6', 'E7'][i]], vel: 0.35, pan: i % 2 ? 0.4 : -0.4 })) },
        {
          type: 'events', inst: 'glass', gain: 0.8,
          list: [
            { bar: 4, u: 6, notes: ['E6', 'C#6', 'A5'], step: 1, vel: 0.35, pan: -0.3, panStep: 0.3 },
            { bar: 8, u: 6, notes: ['G#6', 'E6', 'B5'], step: 1, vel: 0.35, pan: 0.3, panStep: -0.3 },
            { bar: 20, u: 6, notes: ['E6', 'C#6', 'A5'], step: 1, vel: 0.4, pan: -0.3, panStep: 0.3 },
          ],
        },
      ],
    },

    dawn: {
      wet: 0.55,
      scale: 'A B C# D E F# G#',
      intensity: '5566 6677 7788 8899 9976',
      chords: [
        'A', 'E/G#', 'F#m', [['D', 4], ['E', 4]],
        'A', 'E/G#', 'F#m7', [['D', 4], ['E', 4]],
        'D', 'A/C#', 'Bm', [['Esus4', 4], ['E', 4]],
        'A', 'E/G#', 'F#m', [['D', 4], ['E', 4]],
        'A', 'E/G#', 'D', 'E',
      ],
      parts: [
        { type: 'line', line: 'tune', inst: 'flute', bars: 'xxxx xxxx xxxx xxxx xxxx', level: -18, pan: -0.1 },
        {
          type: 'arp', inst: 'epiano', bars: 'aaaa aaaa bbbb aaaa bbbb', level: -22, spread: 0.7, pan: 0.05,
          patterns: { a: '0123210123210123', b: '0.12.1230.12.123' },
        },
        { type: 'pad', inst: 'strings', bars: 'xxxx xxxx xxxx xxxx xxxx', level: -25, opts: { cut: 3200, attack: 0.5, release: 0.6 } },
        {
          type: 'bass', inst: 'bass', bars: 'aaah aaah aaah aaah aaaa', level: -22,
          patterns: { a: [[0, 'R', 1.5, 1], [2, 'R', 1, 0.6], [3, '5', 1, 0.7], [4, 'R', 1.5, 0.9], [6, '8', 1, 0.7], [7, '5', 1, 0.6]], h: [[0, 'R', 1.5, 1], [2, 'R', 1, 0.6]] },
        },
        {
          type: 'perc', level: -27,
          tracks: [
            { inst: 'kick', gain: 0.9, pan: 0, bars: '.aaa aaaa aaaa aaaa aaaa', patterns: { a: '6.......5.......' } },
            { inst: 'hat', gain: 0.7, pan: 0.3, bars: '.aaa aaaa aaaa aaaa aaaa', patterns: { a: '..4...4...4...4.' } },
            { inst: 'shakerCrisp', gain: 0.6, pan: -0.3, bars: 'aaaa aaaa aaaa aaaa aaaa', patterns: { a: '3232323232323232' } },
            { inst: 'tamb', gain: 0.6, pan: -0.25, bars: '.... .... aaaa .... aaaa', patterns: { a: '....4.......4...' } },
          ],
        },
        { type: 'events', inst: 'swell:wind', gain: 0.5, list: [1, 5, 9, 13, 17].map((b) => ({ bar: b, u: 0, notes: ['x'], len: 14 })) },
        { type: 'events', inst: 'chime', gain: 0.7, list: [1, 5, 9, 13, 17].map((b, i) => ({ bar: b, u: 0, notes: [['A6', 'E6', 'C#7', 'A6', 'E7'][i]], vel: 0.45, pan: i % 2 ? 0.4 : -0.4 })) },
        {
          type: 'events', inst: 'harp', gain: 0.9,
          list: [
            { bar: 4, u: 6, notes: ['A4', 'C#5', 'E5', 'A5', 'C#6', 'E6'], step: 0.25, vel: 0.45, pan: -0.4, panStep: 0.16 },
            { bar: 8, u: 6, notes: ['B4', 'E5', 'G#5', 'B5', 'E6', 'G#6'], step: 0.25, vel: 0.45, pan: -0.4, panStep: 0.16 },
            { bar: 16, u: 6, notes: ['A4', 'C#5', 'E5', 'A5', 'C#6', 'E6'], step: 0.25, vel: 0.45, pan: -0.4, panStep: 0.16 },
            { bar: 20, u: 6, notes: ['B4', 'E5', 'G#5', 'B5', 'E6', 'G#6'], step: 0.25, vel: 0.5, pan: -0.4, panStep: 0.16 },
          ],
        },
      ],
    },
  },
});
