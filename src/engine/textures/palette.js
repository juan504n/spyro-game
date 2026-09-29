// Master colour ramps for "Gloaming Vale". Every texture pulls its colours from these ramps so the
// whole realm reads as one hand-painted set (the way a PS1 artist would share a CLUT family).
// Each ramp runs DARK -> LIGHT. Textures are authored as *daylight-true albedo*; the game multiplies
// them by baked vertex colours (0.5 = neutral, x2 brighten) so twilight will cool and darken them.

export const RAMPS = {
  // terrain
  grass:      ['#1f4d2b', '#2f6e35', '#3f8f3c', '#58ad45', '#7cc84f', '#a6e06a'],
  grassTeal:  ['#123f3a', '#1c5c4a', '#2a7d59', '#3f9c66', '#63b878', '#8fd493'],
  moss:       ['#24402b', '#3a5c33', '#587a3d', '#7f9e4c', '#a6c05a'],
  dirt:       ['#3b2a1e', '#5a4028', '#7a5834', '#9a7444', '#b8925a', '#d2ae76'],
  sand:       ['#a08a5a', '#c4a870', '#dcc48c', '#ecdcaa', '#f6ecc8'],
  pathStone:  ['#4a4658', '#65627a', '#847f96', '#a39eb0', '#c4bfcc', '#e0dbe4'],
  cliff:      ['#2c2a3a', '#454158', '#5f5a72', '#7c7590', '#9d94a8', '#bdb4c6'],
  cliffWarm:  ['#4a3a3e', '#6a4e4c', '#8a6a5c', '#aa8a70', '#c8aa88'],

  // buildings
  brick:      ['#5a3a3a', '#7a4e44', '#9a6a56', '#b98a6c', '#d8ac88'],
  plaster:    ['#8a7a6a', '#b8a890', '#dccfb2', '#f0e6cc', '#fff8e6'],
  wood:       ['#2e1c12', '#4a2e1a', '#6b4526', '#8c6236', '#b0844a', '#d0a866'],
  roofRed:    ['#5a1e22', '#8a2e2c', '#b8483a', '#d86a48', '#f09a6a'],
  roofTeal:   ['#12383f', '#1e5a64', '#2e8088', '#4ea8a4', '#88d0c4'],
  thatch:     ['#5a4620', '#8a6c30', '#b8943e', '#dcc060', '#f0dc88'],
  metal:      ['#2a2630', '#4a4654', '#726e82', '#a4a0b4', '#d4d0e0'],
  brass:      ['#4a2e0c', '#7a5218', '#b0802a', '#dcb048', '#f8dc80'],

  // plants
  leaf:       ['#144a2a', '#1f6a34', '#2d8a3c', '#46a848', '#72c455', '#a0e070'],
  leafTeal:   ['#0e4650', '#186a6a', '#288c80', '#44aa94', '#7cd0b0'],
  leafAutumn: ['#6a1a18', '#a03418', '#d05a1c', '#f0902c', '#ffc850'],
  bark:       ['#2a1a14', '#443024', '#634632', '#86644a', '#a88462'],
  barkPale:   ['#5a5048', '#8a7e70', '#b4a894', '#d8ccb4', '#f0e8d4'],

  // water / sky / magic
  water:      ['#0f3a6a', '#1a5a94', '#2a80b8', '#48a8d0', '#8ad0e4', '#d0f0f4'],
  crystalViolet: ['#2a1560', '#4a2a9a', '#7a4ad0', '#a67cf0', '#d0b0ff', '#f0e4ff'],
  crystalCyan:   ['#0a3a6a', '#1a6aa0', '#30a0d0', '#70d0f0', '#c0f4ff'],
  amber:      ['#7a2a10', '#c05a14', '#f0901c', '#ffc03c', '#ffe27a', '#fff6c0'],
  shadow:     ['#0c0818', '#1a1030', '#2a1a48', '#3e2a64'],
  cloud:      ['#8a7cb0', '#b4a8d4', '#dcd4f0', '#fff4ff'],

  // characters / collectibles
  spyroPurple: ['#3a1a6a', '#5a2a9a', '#7c3ec8', '#9c5ce0', '#bc88f0'],
  spyroGold:   ['#a04a08', '#d87a10', '#f0a828', '#ffd050', '#fff090'],
  gemRed:     ['#5a0a10', '#a01420', '#e02c34', '#ff6a68', '#ffc0b8'],
  gemGreen:   ['#0a4a20', '#14802e', '#28c050', '#70e890', '#c8ffd8'],
  gemBlue:    ['#0a2a7a', '#1848c8', '#3c78ff', '#84acff', '#d0e0ff'],
  gemGold:    ['#8a5a00', '#d09000', '#ffc820', '#ffe870', '#fffad0'],
  gemPurple:  ['#3a0a6a', '#6a1ab0', '#a03cf0', '#c890ff', '#f0d8ff'],
  snuffer:    ['#0c0a20', '#1a1638', '#2c2658', '#463c80', '#6a5ca8'],
  mask:       ['#a89cb8', '#d0c8dc', '#eee8f4', '#ffffff'],
  bunny:      ['#8a7060', '#b49a84', '#d8c4ae', '#f4e8d8', '#ffffff'],
  coral:      ['#7a1a30', '#b8384a', '#e86a68', '#ff9a80', '#ffc8a0'],
  ink:        ['#000000', '#120c1c'],
  white:      ['#dcdcf0', '#f0f4ff', '#ffffff'],
};

/** Flatten a list of ramp names into one array of colours. */
export function pal(...names) {
  const out = [];
  for (const n of names) {
    if (!RAMPS[n]) throw new Error(`unknown ramp ${n}`);
    out.push(...RAMPS[n]);
  }
  return out;
}
