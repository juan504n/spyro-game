// The painted skies of the worlds (see paint.js for what a spec says). Each world has two: A, the gloom before its lanterns are lit, and B, the dawn they bring; the game fades one into the other as the
// day goes from 0 to 1. They are painted the way the PS1 game's skies are: long smeared clouds lit gold and pink along the horizon, a pale band of haze under them, colours that swing round the sky
// instead of lying level, and something in the sky to remember the place by: the Vale's dusk of coral and violet, Frostbloom's aurora over pastel snow peaks, Emberfall's gold-streaked furnace
// sunset, Skyweaver's twin moons over a sea of pink cloud, Tideglass' green night with a ringed planet and the Court's eclipse. The colours are read off the reference skies; the lower stops
// are the world's own fog (lighting.js), so that the ground goes into the sky without a seam.
const rgb = (r, g, b) => [r, g, b];

// ---- Gloaming Vale (and Dawnhaven, which has the same sky): A, a coral and violet dusk with the first stars and a pale moon; B, a lavender daybreak streaked with magenta and gold over aqua haze -------------
export const GLOAMING = [
  {
    grad: [[-14, rgb(0.48, 0.29, 0.54)], [0, rgb(1.0, 0.56, 0.42)], [5, rgb(0.95, 0.47, 0.42)], [14, rgb(0.78, 0.33, 0.46)], [30, rgb(0.52, 0.27, 0.5)], [58, rgb(0.3, 0.2, 0.5)], [90, rgb(0.15, 0.11, 0.4)]],
    bend: { amp: 3, k: 2 },
    washes: [
      { az: 10, el: 10, rx: 75, ry: 26, c: rgb(0.97, 0.42, 0.36), a: 0.85 },
      { az: 205, el: 38, rx: 70, ry: 30, c: rgb(0.2, 0.14, 0.42), a: 0.55 },
      { az: 8, el: 3, rx: 30, ry: 6, c: rgb(1.0, 0.7, 0.4), a: 0.5, add: true },
    ],
    clouds: [
      { el: [3, 12], cx: 7, cy: 13, th: 0.52, soft: 0.3, lit: rgb(1.0, 0.8, 0.5), shade: rgb(0.66, 0.34, 0.5), rim: rgb(1.0, 0.92, 0.62), a: 0.92, bend: { amp: 2.5, k: 2 }, seed: 11 },
      { el: [13, 24], cx: 5, cy: 13, th: 0.6, soft: 0.3, lit: rgb(0.98, 0.56, 0.6), shade: rgb(0.5, 0.26, 0.5), rim: rgb(1.0, 0.76, 0.6), a: 0.55, bend: { amp: 4, k: 2, ph: 1 }, seed: 12 },
    ],
    bodies: [{ az: 205, el: 40, r: 4.6, c: [rgb(0.93, 0.95, 1.0), rgb(0.55, 0.58, 0.82)], glow: { c: rgb(0.3, 0.34, 0.7), a: 0.4, r: 4.5 }, blot: 0.35, seed: 3 }],
    stars: { n: 46, el: [18, 82], c: rgb(1, 0.96, 1), size: 0.85, a: 0.9, seed: 5 },
  },
  {
    grad: [[-14, rgb(0.86, 0.92, 0.97)], [0, rgb(0.82, 0.97, 1.0)], [4, rgb(0.95, 0.82, 0.96)], [11, rgb(1.0, 0.79, 0.9)], [22, rgb(0.86, 0.72, 1.0)], [38, rgb(0.64, 0.67, 1.0)], [64, rgb(0.54, 0.58, 1.0)], [90, rgb(0.52, 0.5, 1.0)]],
    bend: { amp: 4, k: 2 },
    washes: [
      { az: 205, el: 18, rx: 60, ry: 22, c: rgb(0.84, 0.54, 1.0), a: 0.75 },
      { az: 12, el: 9, rx: 65, ry: 20, c: rgb(1.0, 0.78, 0.7), a: 0.85 },
      { az: 12, el: 3, rx: 34, ry: 6, c: rgb(1.0, 0.94, 0.66), a: 0.28, add: true },
      { az: 90, el: 70, rx: 90, ry: 30, c: rgb(0.5, 0.62, 1.0), a: 0.5 },
    ],
    clouds: [
      { el: [1.5, 9], cx: 6, cy: 13, th: 0.5, soft: 0.3, lit: rgb(1.0, 0.92, 0.72), shade: rgb(0.8, 0.56, 0.92), rim: rgb(1.0, 0.97, 0.88), a: 0.9, bend: { amp: 2.2, k: 2 }, seed: 21 },
      { el: [9, 22], cx: 5, cy: 13, th: 0.58, soft: 0.3, lit: rgb(1.0, 0.82, 0.95), shade: rgb(0.74, 0.56, 0.96), rim: rgb(1.0, 0.92, 0.9), a: 0.6, bend: { amp: 4, k: 2, ph: 1 }, seed: 22 },
    ],
  },
];

// ---- Frostbloom Hollow: A, an ink-blue night with a green-teal aurora and a cold moon; B, a periwinkle dawn with the aurora fading into mint over pastel snow peaks -----------------------------------
export const FROSTBLOOM = [
  {
    grad: [[-14, rgb(0.2, 0.36, 0.52)], [0, rgb(0.56, 0.74, 0.84)], [5, rgb(0.36, 0.5, 0.8)], [16, rgb(0.14, 0.3, 0.58)], [34, rgb(0.07, 0.16, 0.42)], [62, rgb(0.04, 0.09, 0.3)], [90, rgb(0.02, 0.04, 0.2)]],
    bend: { amp: 2, k: 3 },
    washes: [
      { az: 270, el: 24, rx: 90, ry: 26, c: rgb(0.1, 0.55, 0.5), a: 0.55 },
      { az: 300, el: 46, rx: 40, ry: 24, c: rgb(0.45, 0.6, 1.0), a: 0.22, add: true },
    ],
    aurora: [{ el: 26, n: 3, gap: 5, amp: 7, lo: rgb(0.25, 1.0, 0.72), hi: rgb(0.55, 0.95, 1.0), a: 0.6, seed: 4 }, { el: 38, n: 2, gap: 6, amp: 9, lo: rgb(0.45, 0.8, 1.0), hi: rgb(0.8, 0.6, 1.0), a: 0.45, seed: 8 }],
    peaks: [{ kind: 'cones', base: -2, h: [8, 17], n: 6, a: 0.7, seed: 29, c: [rgb(0.3, 0.42, 0.66), rgb(0.24, 0.34, 0.6), rgb(0.5, 0.62, 0.86)], snow: rgb(0.7, 0.8, 0.98), snowAt: 0.55, haze: rgb(0.3, 0.46, 0.66), hazeAmt: 0.9 },
      { kind: 'cones', base: -2, h: [10, 26], n: 5, c: [rgb(0.26, 0.38, 0.62), rgb(0.2, 0.3, 0.55), rgb(0.5, 0.62, 0.86)], snow: rgb(0.78, 0.88, 1.0), snowAt: 0.5, haze: rgb(0.3, 0.46, 0.66), hazeAmt: 0.7, seed: 31 }],
    bodies: [{ az: 300, el: 46, r: 4.2, c: [rgb(0.92, 0.97, 1.0), rgb(0.5, 0.64, 0.9)], glow: { c: rgb(0.3, 0.5, 0.9), a: 0.35, r: 4 }, blot: 0.3, seed: 6 }],
    stars: { n: 60, el: [14, 85], c: rgb(0.9, 0.97, 1.0), size: 0.8, a: 0.9, seed: 9 },
  },
  {
    grad: [[-14, rgb(0.93, 0.84, 0.88)], [0, rgb(0.9, 0.82, 0.98)], [6, rgb(0.78, 0.76, 1.0)], [14, rgb(0.64, 0.82, 1.0)], [26, rgb(0.62, 0.72, 1.0)], [46, rgb(0.62, 0.62, 1.0)], [70, rgb(0.58, 0.58, 1.0)], [90, rgb(0.6, 0.55, 1.0)]],
    bend: { amp: 2.5, k: 2 },
    washes: [
      { az: 12, el: 6, rx: 70, ry: 18, c: rgb(1.0, 0.8, 0.95), a: 0.8 },
      { az: 200, el: 30, rx: 60, ry: 22, c: rgb(0.7, 0.62, 1.0), a: 0.5 },
    ],
    aurora: [{ el: 20, n: 3, gap: 5, amp: 6, lo: rgb(0.66, 1.0, 0.88), hi: rgb(0.92, 1.0, 0.84), a: 0.6, mix: true, seed: 14 }],
    clouds: [{ el: [3, 11], cx: 5, cy: 10, th: 0.55, soft: 0.3, lit: rgb(1.0, 0.92, 1.0), shade: rgb(0.72, 0.66, 0.98), a: 0.5, bend: { amp: 2, k: 2 }, seed: 15 }],
    peaks: [{ kind: 'cones', base: -1, h: [8, 17], n: 6, a: 0.7, seed: 29, c: [rgb(0.86, 0.8, 1.0), rgb(0.8, 0.76, 1.0), rgb(0.96, 0.9, 1.0)], snow: rgb(1.0, 0.97, 1.0), snowAt: 0.55, haze: rgb(0.9, 0.84, 1.0), hazeAmt: 0.9 },
      { kind: 'cones', base: -1, h: [10, 26], n: 5, c: [rgb(0.82, 0.78, 1.0), rgb(0.74, 0.7, 0.98), rgb(0.96, 0.84, 0.96)], snow: rgb(0.98, 0.95, 1.0), snowAt: 0.5, haze: rgb(0.9, 0.84, 1.0), hazeAmt: 0.7, seed: 31 }],
  },
];

// ---- Emberfall Crags: A, a furnace dusk (black-red sky, an orange horizon, clouds lit from under); B, a gold-streaked sunset of coral and plum over an amber haze ----------------------------------------
export const EMBERFALL = [
  {
    grad: [[-14, rgb(0.36, 0.13, 0.1)], [0, rgb(1.0, 0.52, 0.18)], [4, rgb(0.92, 0.38, 0.14)], [12, rgb(0.62, 0.18, 0.12)], [28, rgb(0.34, 0.1, 0.12)], [58, rgb(0.17, 0.06, 0.1)], [90, rgb(0.07, 0.03, 0.08)]],
    bend: { amp: 2.5, k: 2 },
    washes: [
      { az: 195, el: 8, rx: 70, ry: 20, c: rgb(1.0, 0.42, 0.12), a: 0.8 },
      { az: 195, el: 3, rx: 30, ry: 6, c: rgb(1.0, 0.72, 0.3), a: 0.6, add: true },
    ],
    clouds: [
      { el: [3, 11], cx: 6, cy: 13, th: 0.5, soft: 0.3, lit: rgb(1.0, 0.62, 0.22), shade: rgb(0.34, 0.12, 0.12), rim: rgb(1.0, 0.82, 0.4), a: 0.92, bend: { amp: 2, k: 2 }, seed: 41 },
      { el: [12, 26], cx: 5, cy: 10, th: 0.58, soft: 0.3, lit: rgb(0.8, 0.3, 0.2), shade: rgb(0.2, 0.08, 0.12), rim: rgb(1.0, 0.55, 0.25), a: 0.6, bend: { amp: 4, k: 2, ph: 2 }, seed: 42 },
    ],
    peaks: [{ kind: 'crag', base: -1, h: [2, 9], step: 6, c: [rgb(0.32, 0.1, 0.1), rgb(0.2, 0.07, 0.09), rgb(0.26, 0.09, 0.1)], haze: rgb(0.7, 0.24, 0.1), hazeAmt: 0.6, seed: 43 }],
    stars: { n: 18, el: [34, 82], c: rgb(1, 0.82, 0.7), size: 0.7, a: 0.7, seed: 44 },
  },
  {
    grad: [[-14, rgb(0.88, 0.66, 0.5)], [0, rgb(1.0, 0.56, 0.4)], [5, rgb(0.93, 0.48, 0.42)], [14, rgb(0.78, 0.4, 0.4)], [30, rgb(0.58, 0.3, 0.45)], [58, rgb(0.5, 0.27, 0.47)], [90, rgb(0.4, 0.22, 0.46)]],
    bend: { amp: 3, k: 2 },
    washes: [
      { az: 195, el: 18, rx: 70, ry: 30, c: rgb(0.95, 0.44, 0.4), a: 0.9 },
      { az: 330, el: 40, rx: 70, ry: 30, c: rgb(0.34, 0.2, 0.46), a: 0.6 },
      { az: 195, el: 4, rx: 36, ry: 6, c: rgb(1.0, 0.8, 0.5), a: 0.3, add: true },
    ],
    clouds: [
      { el: [2.5, 11], cx: 6, cy: 13, th: 0.5, soft: 0.3, lit: rgb(1.0, 0.76, 0.5), shade: rgb(0.6, 0.34, 0.5), rim: rgb(1.0, 0.92, 0.66), a: 0.92, bend: { amp: 2.4, k: 2 }, seed: 51 },
      { el: [12, 24], cx: 5, cy: 13, th: 0.6, soft: 0.3, lit: rgb(1.0, 0.62, 0.52), shade: rgb(0.52, 0.28, 0.5), rim: rgb(1.0, 0.8, 0.6), a: 0.55, bend: { amp: 4, k: 2, ph: 1 }, seed: 52 },
    ],
    peaks: [{ kind: 'rolling', base: -1, h: [1.5, 5], n: 6, c: [rgb(0.74, 0.5, 0.4), rgb(0.68, 0.44, 0.38), rgb(0.7, 0.46, 0.38)], haze: rgb(0.92, 0.6, 0.45), hazeAmt: 0.5, seed: 53 }],
    stars: { n: 10, el: [40, 85], c: rgb(1, 0.92, 1), size: 0.75, a: 0.8, seed: 54 },
  },
];

// ---- Skyweaver Spires: A, an indigo dusk with twin moons over a sea of pink cloud; B, a bright morning with the moons pale in a blue sky and the cloud white-gold ------------------------------------------
export const SKYWEAVER = [
  {
    grad: [[-14, rgb(0.62, 0.5, 0.72)], [0, rgb(0.93, 0.6, 0.64)], [6, rgb(0.9, 0.54, 0.66)], [16, rgb(0.78, 0.46, 0.76)], [32, rgb(0.5, 0.34, 0.7)], [58, rgb(0.28, 0.27, 0.6)], [90, rgb(0.12, 0.2, 0.5)]],
    bend: { amp: 2, k: 2 },
    washes: [
      { az: 135, el: 10, rx: 80, ry: 22, c: rgb(1.0, 0.7, 0.62), a: 0.7 },
      { az: 300, el: 24, rx: 70, ry: 24, c: rgb(0.6, 0.38, 0.84), a: 0.5 },
    ],
    clouds: [
      { el: [-4, 10], cx: 11, cy: 10, th: 0.5, soft: 0.3, lit: rgb(1.0, 0.86, 0.7), shade: rgb(0.62, 0.3, 0.62), rim: rgb(1.0, 0.94, 0.8), light: 7, a: 0.95, bend: { amp: 1.5, k: 3 }, seed: 61 },
      { el: [8, 20], cx: 6, cy: 13, th: 0.6, soft: 0.3, lit: rgb(1.0, 0.76, 0.76), shade: rgb(0.66, 0.36, 0.7), rim: rgb(1.0, 0.9, 0.8), a: 0.5, bend: { amp: 3, k: 2 }, seed: 62 },
    ],
    bodies: [
      { az: 305, el: 36, r: 5.2, c: [rgb(0.74, 0.7, 1.0), rgb(0.42, 0.36, 0.78)], alpha: 0.82, glow: { c: rgb(0.5, 0.4, 0.9), a: 0.3, r: 3 }, blot: 0.7, seed: 7 },
      { az: 325, el: 46, r: 3.0, c: [rgb(0.7, 0.74, 1.0), rgb(0.4, 0.4, 0.8)], alpha: 0.82, blot: 0.6, seed: 8 },
    ],
    stars: { n: 40, el: [26, 86], c: rgb(1, 0.95, 1), size: 0.8, a: 0.85, seed: 9 },
  },
  {
    grad: [[-14, rgb(0.9, 0.92, 1.0)], [0, rgb(0.99, 0.86, 0.78)], [6, rgb(0.96, 0.8, 0.86)], [16, rgb(0.78, 0.82, 1.0)], [32, rgb(0.5, 0.7, 1.0)], [58, rgb(0.28, 0.52, 0.97)], [90, rgb(0.14, 0.38, 0.9)]],
    bend: { amp: 2, k: 2 },
    washes: [
      { az: 135, el: 10, rx: 80, ry: 22, c: rgb(1.0, 0.9, 0.7), a: 0.75 },
      { az: 135, el: 5, rx: 34, ry: 7, c: rgb(1.0, 0.96, 0.8), a: 0.22, add: true },
    ],
    clouds: [
      { el: [-4, 10], cx: 11, cy: 10, th: 0.5, soft: 0.3, lit: rgb(1.0, 0.98, 0.96), shade: rgb(0.66, 0.68, 0.9), rim: rgb(1.0, 0.94, 0.8), light: 7, a: 0.95, bend: { amp: 1.5, k: 3 }, seed: 71 },
      { el: [10, 24], cx: 6, cy: 13, th: 0.62, soft: 0.3, lit: rgb(1.0, 1.0, 1.0), shade: rgb(0.8, 0.84, 0.98), a: 0.45, bend: { amp: 3, k: 2 }, seed: 72 },
    ],
    bodies: [
      { az: 305, el: 36, r: 5.2, c: [rgb(0.92, 0.94, 1.0), rgb(0.7, 0.76, 0.96)], alpha: 0.5, blot: 0.4, seed: 7 },
      { az: 325, el: 46, r: 3.0, c: [rgb(0.92, 0.94, 1.0), rgb(0.72, 0.78, 0.97)], alpha: 0.45, blot: 0.4, seed: 8 },
    ],
  },
];

// ---- Tideglass Reach: A, a night of teal and green with an aurora and a ringed planet over dark crags; B, the green dawn: a sky of mint and gold, the planet pale in it ----------------------------------------
export const TIDEGLASS = [
  {
    grad: [[-14, rgb(0.2, 0.46, 0.5)], [0, rgb(0.3, 0.72, 0.5)], [6, rgb(0.2, 0.55, 0.5)], [16, rgb(0.14, 0.42, 0.5)], [34, rgb(0.08, 0.28, 0.42)], [62, rgb(0.04, 0.16, 0.34)], [90, rgb(0.03, 0.1, 0.24)]],
    bend: { amp: 2.5, k: 2 },
    washes: [
      { az: 335, el: 20, rx: 80, ry: 26, c: rgb(0.3, 0.9, 0.6), a: 0.45 },
      { az: 215, el: 44, rx: 40, ry: 22, c: rgb(0.3, 0.55, 0.9), a: 0.2, add: true },
    ],
    aurora: [{ el: 30, n: 3, gap: 6, amp: 8, lo: rgb(0.4, 1.0, 0.62), hi: rgb(0.8, 1.0, 0.7), a: 0.55, seed: 22 }],
    peaks: [{ kind: 'crag', base: -1, h: [1.5, 8], step: 6, c: [rgb(0.2, 0.34, 0.4), rgb(0.14, 0.26, 0.34), rgb(0.3, 0.42, 0.5)], haze: rgb(0.22, 0.5, 0.5), hazeAmt: 0.55, seed: 23 }],
    bodies: [{ az: 215, el: 40, r: 5.2, c: [rgb(0.7, 0.88, 0.8), rgb(0.26, 0.4, 0.5)], glow: { c: rgb(0.3, 0.9, 0.7), a: 0.3, r: 3 }, ring: { ratio: 1.9, tilt: -22, c: rgb(0.7, 1.0, 0.7), w: 0.4, flat: 0.3, a: 0.75 }, blot: 0.5, seed: 12 }],
    stars: { n: 50, el: [16, 86], c: rgb(0.9, 1.0, 0.95), size: 0.8, a: 0.85, seed: 13 },
  },
  {
    grad: [[-14, rgb(0.68, 0.88, 0.84)], [0, rgb(0.5, 0.95, 0.5)], [5, rgb(0.34, 0.7, 0.46)], [14, rgb(0.34, 0.84, 0.6)], [30, rgb(0.5, 0.9, 0.7)], [56, rgb(0.42, 0.84, 0.64)], [90, rgb(0.38, 0.76, 0.6)]],
    bend: { amp: 3, k: 2 },
    washes: [
      { az: 335, el: 40, rx: 60, ry: 40, c: rgb(0.78, 1.0, 0.72), a: 0.8 },
      { az: 335, el: 6, rx: 40, ry: 8, c: rgb(1.0, 0.96, 0.7), a: 0.22, add: true },
    ],
    aurora: [{ el: 36, n: 3, gap: 7, amp: 9, lo: rgb(0.7, 1.0, 0.72), hi: rgb(0.98, 1.0, 0.7), a: 0.5, mix: true, seed: 24 }],
    peaks: [{ kind: 'crag', base: -1, h: [1.5, 8], step: 6, c: [rgb(0.5, 0.62, 0.62), rgb(0.4, 0.5, 0.56), rgb(0.7, 0.76, 0.76)], haze: rgb(0.5, 0.86, 0.7), hazeAmt: 0.55, seed: 23 }],
    bodies: [{ az: 215, el: 40, r: 5.2, c: [rgb(0.8, 0.96, 0.9), rgb(0.44, 0.72, 0.74)], ring: { ratio: 1.9, tilt: -22, c: rgb(0.88, 1.0, 0.7), w: 0.4, flat: 0.3, a: 0.8 }, blot: 0.5, seed: 12 }],
    stars: { n: 22, el: [26, 86], c: rgb(1, 1, 0.95), size: 0.7, a: 0.55, seed: 14 },
  },
];

// ---- the Guardian's Court: A, the gloom: a black-violet sky and an eclipse low in the south, its corona magenta; B, the dawn: rose-gold cloud over an amber haze ----------------------------------------
export const GUARDIAN = [
  {
    grad: [[-14, rgb(0.3, 0.14, 0.36)], [0, rgb(0.9, 0.4, 0.5)], [5, rgb(0.72, 0.26, 0.48)], [14, rgb(0.46, 0.17, 0.46)], [30, rgb(0.26, 0.1, 0.36)], [58, rgb(0.12, 0.05, 0.26)], [90, rgb(0.04, 0.02, 0.15)]],
    bend: { amp: 2, k: 2 },
    washes: [
      { az: 95, el: 14, rx: 70, ry: 24, c: rgb(0.9, 0.34, 0.58), a: 0.7 },
      { az: 225, el: 40, rx: 40, ry: 24, c: rgb(0.45, 0.4, 1.0), a: 0.2, add: true },
    ],
    clouds: [{ el: [3, 12], cx: 6, cy: 13, th: 0.52, soft: 0.3, lit: rgb(0.96, 0.5, 0.62), shade: rgb(0.34, 0.14, 0.4), rim: rgb(1.0, 0.72, 0.62), a: 0.85, bend: { amp: 2, k: 2 }, seed: 81 }],
    bodies: [
      { az: 95, el: 21, r: 4.6, c: [rgb(0.05, 0.02, 0.1), rgb(0.03, 0.01, 0.07)], glow: { c: rgb(1.0, 0.7, 0.85), a: 0.9, r: 2.2 }, blot: 0, seed: 15 },
      { az: 225, el: 40, r: 3.4, c: [rgb(0.8, 0.78, 1.0), rgb(0.42, 0.36, 0.76)], glow: { c: rgb(0.4, 0.34, 0.9), a: 0.3, r: 3 }, blot: 0.4, seed: 16 },
    ],
    stars: { n: 40, el: [20, 86], c: rgb(1, 0.92, 1), size: 0.8, a: 0.85, seed: 17 },
  },
  {
    grad: [[-14, rgb(0.9, 0.74, 0.6)], [0, rgb(1.0, 0.86, 0.5)], [5, rgb(1.0, 0.74, 0.5)], [14, rgb(0.96, 0.7, 0.66)], [30, rgb(0.7, 0.62, 0.8)], [58, rgb(0.46, 0.58, 0.88)], [90, rgb(0.26, 0.42, 0.8)]],
    bend: { amp: 2, k: 2 },
    washes: [
      { az: 62, el: 14, rx: 70, ry: 24, c: rgb(1.0, 0.8, 0.5), a: 0.8 },
      { az: 62, el: 6, rx: 36, ry: 8, c: rgb(1.0, 0.94, 0.66), a: 0.28, add: true },
    ],
    clouds: [
      { el: [3, 12], cx: 6, cy: 13, th: 0.52, soft: 0.3, lit: rgb(1.0, 0.92, 0.84), shade: rgb(0.86, 0.6, 0.64), rim: rgb(1.0, 0.98, 0.84), a: 0.9, bend: { amp: 2, k: 2 }, seed: 91 },
      { el: [13, 25], cx: 5, cy: 13, th: 0.6, soft: 0.3, lit: rgb(1.0, 0.86, 0.82), shade: rgb(0.74, 0.58, 0.76), a: 0.5, bend: { amp: 3, k: 2, ph: 1 }, seed: 92 },
    ],
  },
];
