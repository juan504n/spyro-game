// HUD / menu icons for Gloaming Vale: hand-drawn ASCII pixel maps (1-bit alpha, dark outlines).
// Every map is validated by fromMap() (throws on ragged rows / unknown palette letters), so typos surface at once.
import { Pix, rgb } from '../pix.js';
import { RAMPS } from '../palette.js';
import { fromMap } from './pixmap.js';

const INK = '#120c1c';

/* ---------------------------------------------------------------------------------------------- */
/* gems 12x12: digits 1..5 = ramp dark -> light, w = white glint, o = outline                       */
/* ---------------------------------------------------------------------------------------------- */
const GEM_MAP = [
  '...oooooo...',
  '..ow55553o..',
  '.o44555533o.',
  'o4445555333o',
  'o4444333221o',
  '.o33344211o.',
  '..o334421o..',
  '...o3441o...',
  '...o3441o...',
  '....o41o....',
  '....o41o....',
  '.....oo.....',
];

function gem(ramp, name) {
  return fromMap(GEM_MAP, { o: INK, w: '#ffffff', 1: ramp[0], 2: ramp[1], 3: ramp[2], 4: ramp[3], 5: ramp[4] }, name);
}

/* ---------------------------------------------------------------------------------------------- */
/* lanterns 12x16                                                                                   */
/* ---------------------------------------------------------------------------------------------- */
const LANTERN_MAP = [
  '....oooo....',
  '...oBhhBo...',
  '...oB..Bo...',
  '....oBBo....',
  '...oBhhBo...',
  '..oBhhhhBo..',
  '.oBhhhhhhBo.',
  '.obbbbbbbbo.',
  '.oByYYYYyBo.',
  '.oByyYYyyBo.',
  '.oByYwwYyBo.',
  '.oBYwwwwYBo.',
  '.oBaayyaaBo.',
  '.obbbbbbbbo.',
  '..oBhhhhBo..',
  '...oooooo...',
];
const LANTERN_ON = { o: INK, B: RAMPS.brass[2], h: RAMPS.brass[3], b: RAMPS.brass[1], Y: RAMPS.amber[4], y: RAMPS.amber[3], w: RAMPS.amber[5], a: RAMPS.amber[2] };
const LANTERN_OFF = { o: INK, B: RAMPS.metal[2], h: RAMPS.metal[3], b: RAMPS.metal[1], Y: RAMPS.crystalViolet[1], y: RAMPS.crystalViolet[0], w: RAMPS.crystalViolet[2], a: RAMPS.crystalViolet[0] };

/* ---------------------------------------------------------------------------------------------- */
/* bloom 12x16: the goal of Frostbloom Hollow, frozen (bloom_off) and thawed (bloom_on)             */
/* ---------------------------------------------------------------------------------------------- */
const BLOOM_MAP = [
  '....oooo....',
  '..ooPPPPoo..',
  '.oPPppppPPo.',
  'oPppwppwppPo',
  'oPpwYYYYwpPo',
  'oPpYyyyyYpPo',
  'oPpYyyyyYpPo',
  'oPpwYYYYwpPo',
  '.oPppwwppPo.',
  '..oPPppPPo..',
  '...ooPPoo...',
  '....oSSo....',
  '.oo.oSSo.oo.',
  'oLLLoSSoLLLo',
  '.ooLLSSLLoo.',
  '...oooooo...',
];
const BLOOM_ON = { o: INK, P: '#e0709c', p: '#f4a0c0', w: '#fff0f6', Y: '#ffd45a', y: '#f0a030', S: '#2e7a48', L: '#58b060' };
const BLOOM_OFF = { o: INK, P: '#5a98c4', p: '#9cd0e8', w: '#e8f8ff', Y: '#c8ecff', y: '#78b4d8', S: '#2a5a78', L: '#4a8ab0' };

/* ---------------------------------------------------------------------------------------------- */
/* ember 12x16: the goal of Emberfall Crags, cold (ember_off) and burning (ember_on)                 */
/* ---------------------------------------------------------------------------------------------- */
const EMBER_MAP = [
  '.....oo.....',
  '....oYYo....',
  '....oYwo....',
  '...oYYwYo...',
  '...oYwwYo...',
  '..oyYwwYyo..',
  '..oyYwwYyo..',
  '..oyyYYyyo..',
  '...oRyyRo...',
  '....oRRo....',
  '..oooSSooo..',
  '.oShhSSSSSo.',
  'oShhSSSssSSo',
  'oShSSSSSssSo',
  'oSSSSSssSSSo',
  '.ooSSSSSSoo.',
];
const EMBER_ON = { o: INK, Y: '#ffd24a', w: '#fff4c0', y: '#f08a22', R: '#c4401a', S: '#4a3a34', s: '#2e2420', h: '#8a7466' };
const EMBER_OFF = { o: INK, Y: '#6a3a30', w: '#8a4a38', y: '#4e2a22', R: '#38160f', S: '#4a3a34', s: '#2e2420', h: '#6e5a4e' };

/* ---------------------------------------------------------------------------------------------- */
/* bell 12x16: the goal of Skyweaver Spires, silent (bell_off) and ringing (bell_on)                   */
/* ---------------------------------------------------------------------------------------------- */
const BELL_MAP = [
  '.....oo.....',
  '....oYYo....',
  '....oYYo....',
  '...ooYYoo...',
  '..oYYYYYYo..',
  '.oYYwYYYYYo.',
  '.oYwYYYYYYo.',
  '.oYwYYYYYyo.',
  '.oYYYYYYYyo.',
  'oYYwYYYYYYyo',
  'oYYwYYYYYyyo',
  'oYYYYYYYYyyo',
  'oyyyyyyyyyyo',
  'oooooooooooo',
  '....oRRo....',
  '.....oo.....',
];
const BELL_ON = { o: INK, Y: '#f0bc48', w: '#fff4c0', y: '#b87a20', R: '#ffe08a' };
const BELL_OFF = { o: INK, Y: '#68718a', w: '#8c97b2', y: '#434b62', R: '#566078' };

/* ---------------------------------------------------------------------------------------------- */
/* heart 10x9                                                                                       */
/* ---------------------------------------------------------------------------------------------- */
const HEART_MAP = [
  '..oo..oo..',
  '.owpooRRo.',
  'opppRRRRdo',
  'oppRRRRRdo',
  'oRRRRRRRdo',
  '.oRRRRRdo.',
  '..oRRRdo..',
  '...oRdo...',
  '....oo....',
];

/* ---------------------------------------------------------------------------------------------- */
/* flame 10x12                                                                                      */
/* ---------------------------------------------------------------------------------------------- */
const FLAME_MAP = [
  '....oo....',
  '...oyyo...',
  '...oyyoo..',
  '..ooyyyo..',
  '..oyyyyoo.',
  '.ooyYYyyo.',
  '.oyyYYYyo.',
  '.oyYYWYyo.',
  '.oaYWWYao.',
  '.oaaYWYao.',
  '..oaaaao..',
  '...oooo...',
];

/* ---------------------------------------------------------------------------------------------- */
/* star 10x10                                                                                       */
/* ---------------------------------------------------------------------------------------------- */
const STAR_MAP = [
  '....oo....',
  '...owYo...',
  '...oYYo...',
  'oooYYYYooo',
  'oYwYYYYYgo',
  '.oYYYYYgo.',
  '..oYYYgo..',
  '..oYYggo..',
  '.oYYooggo.',
  '.ooo..ooo.',
];

/* ---------------------------------------------------------------------------------------------- */
/* menu arrows 6x8, check / cross 8x8                                                               */
/* ---------------------------------------------------------------------------------------------- */
const ARROW_R_MAP = [
  'oo....',
  'oYoo..',
  'oYYYoo',
  'oYwYYo',
  'oYYYYo',
  'oYYyoo',
  'oyoo..',
  'oo....',
];
const CHECK_MAP = [
  '......oo',
  '.....oGo',
  '....oGgo',
  'oo.oGgo.',
  'oGoGgo..',
  'oGggo...',
  '.oGo....',
  '..o.....',
];
const CROSS_MAP = [
  'oo....oo',
  'oRo..oRo',
  'oRRooRRo',
  '.oRRRRo.',
  '.oRRRRo.',
  'oRRooRRo',
  'oRo..oRo',
  'oo....oo',
];

function mirrorH(rows) {
  return rows.map((r) => r.split('').reverse().join(''));
}

/* ---------------------------------------------------------------------------------------------- */
/* key cap 16x16 (empty rounded keycap for control prompts; text is drawn on top by the game)       */
/* ---------------------------------------------------------------------------------------------- */
const KEY_MAP = [
  '..oooooooooooo..',
  '.oLLLLLLLLLLLLo.',
  'oLLffffffffffLGo',
  'oLfffffffffffFGo',
  'oLfffffffffffFGo',
  'oLfffffffffffFGo',
  'oLfffffffffffFGo',
  'oLfffffffffffFGo',
  'oLfffffffffffFGo',
  'oLfffffffffffFGo',
  'oLfffffffffffFGo',
  'oLfffffffffffFGo',
  'oLFFFFFFFFFFFFGo',
  'oGGGGGGGGGGGGGGo',
  '.oGGGGGGGGGGGGo.',
  '..oooooooooooo..',
];

/* ---------------------------------------------------------------------------------------------- */
/* clock 10x10, bunny 10x10, butterfly 10x10                                                        */
/* ---------------------------------------------------------------------------------------------- */
const CLOCK_MAP = [
  '..oooooo..',
  '.oGGGGGGo.',
  'oGwwkwwwGo',
  'oGwwkwwwGo',
  'oGwwkkkwGo',
  'oGwwwwwwGo',
  'oGwwwwwwdo',
  'oGwwwwwwdo',
  '.oddddddo.',
  '..oooooo..',
];

const BUNNY_MAP = [
  '..oo..oo..',
  '.opo..opo.',
  '.opo..opo.',
  '.opoooopo.',
  '.oWWWWWWo.',
  'oWWkWWkWWo',
  'oWWWWWWwwo',
  'oWWWnnWwwo',
  '.oWWWWwwo.',
  '..oooooo..',
];

const BFLY_HALF = [
  '...a.',
  '.oo.b',
  'oLLob',
  'oLwLb',
  'oLLLb',
  'oMLLb',
  '.oMMb',
  '.oMMb',
  '..ooB',
  '....b',
];

/* ---------------------------------------------------------------------------------------------- */
/* dragon head 16x16 (life icon): purple face, orange horns, original chibi design (front view)      */
/* ---------------------------------------------------------------------------------------------- */
// 14x14 interior (facing right); dropped into a 16x16 canvas and outlined
const DRAGON_MAP = [
  'dc...dc.......',
  '.dc...dc......',
  '..dc...dc.....',
  '...cb...cb....',
  '...b555555....',
  '..555522225...',
  '.44444www444..',
  '.44433wkk33333',
  '333333wkk333n3',
  '23333333333333',
  '.2333333nnnnn.',
  '..22555555w5..',
  '...2555555....',
  '....22222.....',
];

function dragonHead() {
  const pur = RAMPS.spyroPurple, gold = RAMPS.spyroGold;
  const inner = fromMap(DRAGON_MAP, {
    d: gold[2], c: gold[1], b: gold[0],
    2: pur[1], 3: pur[2], 4: pur[3], 5: pur[4], w: '#ffffff', k: INK, n: pur[0],
  }, 'dragon_head');
  const p = new Pix(16, 16);
  p.blit(inner, 1, 1);
  p.outline(INK);
  return p;
}

/* ---------------------------------------------------------------------------------------------- */
/* charge (head-butt) 12x10 and wings 14x10                                                          */
/* ---------------------------------------------------------------------------------------------- */
/** Two speed chevrons + a big orange horn pointing right: the "charge / head-butt" symbol. */
function chargeIcon() {
  const p = new Pix(12, 10);
  const W = rgb('#ffffff');
  // horn
  const g = RAMPS.spyroGold;
  p.poly([[6.4, 1.6], [8.8, 2.4], [10.9, 3.4], [11.6, 3.9], [9.8, 5.2], [6.4, 7.4]], rgb(g[2]));
  for (let y = 0; y < 10; y++) {
    for (let x = 6; x < 12; x++) {
      if (p.get(x, y)[3] < 128) continue;
      const t = (y - 1.6) / 6 + (x - 6) * 0.03;
      p.set(x, y, rgb(t < 0.28 ? g[4] : t < 0.5 ? g[3] : t < 0.75 ? g[2] : g[1]));
    }
  }
  p.outline(INK);
  // speed chevrons (drawn after the outline so they stay clean white)
  for (const x0 of [0, 3]) {
    p.set(x0, 2, W); p.set(x0 + 1, 3, W); p.set(x0 + 2, 4, W); p.set(x0 + 1, 5, W); p.set(x0, 6, W);
  }
  return p;
}

const WING_HALF = [
  'oo.....',
  'ooooo..',
  'oyyyooo',
  '.oyyyyo',
  '.oYyyyo',
  '..oYyyo',
  '..ooYyo',
  '...ooYo',
  '.....oo',
  '.......',
];

/* ---------------------------------------------------------------------------------------------- */
/* Sparx icons 14x12 (procedural: pink-violet wings with yellow tips + a round body in the health colour + big eyes) */
/* ---------------------------------------------------------------------------------------------- */
function sparxIcon(ramp) {
  const p = new Pix(14, 12);
  const wingHi = rgb('#ffd2f6'), wingA = rgb('#e46ee6'), wingB = rgb('#a64ec8'), wingTip = rgb('#ffe860');
  const wingL = [[6.4, 6.4], [3.4, 5.6], [0.6, 2.6], [0.4, 0.4], [2.6, 0.7], [5.6, 3.4], [6.9, 5.2]];
  for (const w of [wingL, wingL.map(([x, y]) => [14 - x, y])]) {
    const tmp = new Pix(14, 12);
    tmp.poly(w, wingA);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 14; x++) {
        if (tmp.data[(y * 14 + x) * 4 + 3] < 128) continue;
        p.set(x, y, ((x + y) & 1) ? wingA : wingB);
      }
    }
    p.line(w[2][0], w[2][1], w[3][0], w[3][1], wingHi);
    p.line(w[3][0], w[3][1], w[4][0], w[4][1], wingHi);
    p.set(Math.round(w[3][0] < 7 ? w[3][0] + 0.6 : w[3][0] - 0.6), 1, wingTip);                 // (the yellow tip of the wing)
  }
  // orb body in the tint colour
  p.circle(7, 7.4, 3.6, rgb(ramp[1]));
  p.circle(6.8, 7.1, 3.0, rgb(ramp[2]));
  p.circle(6.4, 6.6, 1.8, rgb(ramp[3]));
  p.set(5, 5, rgb('#ffffff')); p.set(6, 5, rgb('#ffffff')); p.set(5, 6, rgb(ramp[4]));
  // lower-right shade
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 14; x++) {
      const c = p.get(x, y);
      if (c[3] < 128) continue;
      const dx = x + 0.5 - 7, dy = y + 0.5 - 7.4;
      if (Math.hypot(dx, dy) < 3.7 && dx + dy > 3.0) p.set(x, y, rgb(ramp[0]));
    }
  }
  // tail nub
  p.set(6, 11, rgb(ramp[1])); p.set(7, 11, rgb(ramp[1]));
  // eyes: big and white, with dark pupils looking a little to one side
  p.rect(3, 6, 3, 3, rgb('#ffffff')); p.rect(8, 6, 3, 3, rgb('#ffffff'));
  p.rect(4, 7, 2, 2, rgb(INK)); p.rect(9, 7, 2, 2, rgb(INK));
  p.outline(INK, true);
  return p;
}

/* ---------------------------------------------------------------------------------------------- */
/* public                                                                                            */
/* ---------------------------------------------------------------------------------------------- */
export function buildIcons() {
  const U = {};
  U.gem_red = gem(RAMPS.gemRed, 'gem_red');
  U.gem_green = gem(RAMPS.gemGreen, 'gem_green');
  U.gem_blue = gem(RAMPS.gemBlue, 'gem_blue');
  U.gem_gold = gem(RAMPS.gemGold, 'gem_gold');
  U.gem_purple = gem(RAMPS.gemPurple, 'gem_purple');
  U.lantern_on = fromMap(LANTERN_MAP, LANTERN_ON, 'lantern_on');
  U.lantern_off = fromMap(LANTERN_MAP, LANTERN_OFF, 'lantern_off');
  U.bloom_on = fromMap(BLOOM_MAP, BLOOM_ON, 'bloom_on');
  U.bloom_off = fromMap(BLOOM_MAP, BLOOM_OFF, 'bloom_off');
  U.ember_on = fromMap(EMBER_MAP, EMBER_ON, 'ember_on');
  U.ember_off = fromMap(EMBER_MAP, EMBER_OFF, 'ember_off');
  U.bell_on = fromMap(BELL_MAP, BELL_ON, 'bell_on');
  U.bell_off = fromMap(BELL_MAP, BELL_OFF, 'bell_off');
  U.sparx_blue = sparxIcon(RAMPS.gemBlue);
  U.sparx_green = sparxIcon(RAMPS.gemGreen);
  U.sparx_yellow = sparxIcon(RAMPS.gemGold);
  U.dragon_head = dragonHead();
  U.heart = fromMap(HEART_MAP, { o: INK, R: RAMPS.gemRed[2], p: RAMPS.gemRed[3], w: RAMPS.gemRed[4], d: RAMPS.gemRed[1] }, 'heart');
  U.butterfly_icon = fromMap(BFLY_HALF.map((r) => r + r.split('').reverse().join('')), {
    o: RAMPS.gemBlue[0], a: RAMPS.gemBlue[0], L: RAMPS.crystalCyan[4], M: RAMPS.crystalCyan[3], w: '#ffffff', b: RAMPS.shadow[1], B: RAMPS.shadow[1],
  }, 'butterfly_icon');
  U.flame_icon = fromMap(FLAME_MAP, { o: INK, a: RAMPS.amber[1], y: RAMPS.amber[2], Y: RAMPS.amber[3], W: RAMPS.amber[5] }, 'flame_icon');
  U.charge_icon = chargeIcon();
  U.wing_icon = fromMap(WING_HALF.map((r) => r + r.split('').reverse().join('')), {
    o: INK, y: RAMPS.spyroGold[2], Y: RAMPS.spyroGold[3],
  }, 'wing_icon');
  U.key_frame = fromMap(KEY_MAP, { o: INK, L: '#f0f4ff', f: '#dcdcf0', F: '#b4a8d4', G: '#8a7cb0' }, 'key_frame');
  U.star = fromMap(STAR_MAP, { o: INK, Y: RAMPS.spyroGold[3], w: RAMPS.spyroGold[4], g: RAMPS.spyroGold[2] }, 'star');
  U.arrow_right = fromMap(ARROW_R_MAP, { o: INK, Y: RAMPS.spyroGold[3], w: '#ffffff', y: RAMPS.spyroGold[2] }, 'arrow_right');
  U.arrow_left = fromMap(mirrorH(ARROW_R_MAP), { o: INK, Y: RAMPS.spyroGold[3], w: '#ffffff', y: RAMPS.spyroGold[2] }, 'arrow_left');
  U.check = fromMap(CHECK_MAP, { o: INK, G: RAMPS.gemGreen[2], g: RAMPS.gemGreen[3] }, 'check');
  U.cross = fromMap(CROSS_MAP, { o: INK, R: RAMPS.gemRed[2] }, 'cross');
  U.bunny_icon = fromMap(BUNNY_MAP, {
    o: RAMPS.dirt[0], p: RAMPS.coral[3], w: RAMPS.bunny[3], W: RAMPS.bunny[4], k: INK, n: RAMPS.coral[2],
  }, 'bunny_icon');
  U.clock_icon = fromMap(CLOCK_MAP, { o: INK, G: RAMPS.spyroGold[2], w: '#f0f4ff', k: INK, d: RAMPS.spyroGold[0] }, 'clock_icon');
  return U;
}
