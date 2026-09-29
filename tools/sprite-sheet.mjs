// Dev tool: renders review sheets (PNG) for the procedural sprites, bitmap font and UI art.
//   node tools/sprite-sheet.mjs [--out <dir>] [--only a,b,c] [--zoom N] [sprites|font|ui|all]
// Default output dir: <os tmpdir>/gloaming-tex-sprites. Nothing is written into the repo.
//   sprites  -> sprites_normal.png, sprites_additive_dark.png, sprites_additive_grey.png, sprites_tinted.png,
//               sprites_actual.png (game-scale scene)         (--only name,name : zoomed close-ups instead)
//   font     -> font_scale1.png, font_scales.png, font_glyphs.png
//   ui       -> ui_icons.png, ui_panels.png, ui_mock_hud.png (gameplay), ui_mock_title.png  (--only : icon close-ups)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pix } from '../src/engine/textures/pix.js';
import { writePNG } from './png.mjs';
import { generateSprites, packAtlas, SPRITE_NOTES, SPRITE_BLEND, SPRITE_ANIMS } from '../src/engine/textures/sprites.js';
import { drawText, measureText, wrapText, FONT_GLYPHS } from '../src/engine/textures/font.js';

const args = process.argv.slice(2);
let outDir = path.join(os.tmpdir(), 'gloaming-tex-sprites');
let onlyList = null;      // --only glow,spark   : zoomed close-up of just these sprites / icons
let zoom = 0;             // --zoom N (sprites --only: default 12; ui icons: default 6)
const which = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') outDir = args[++i];
  else if (args[i] === '--only') onlyList = args[++i].split(',');
  else if (args[i] === '--zoom') zoom = parseInt(args[++i], 10);
  else which.push(args[i]);
}
if (!which.length) which.push('all');
fs.mkdirSync(outDir, { recursive: true });

/* ---------------------------------- helpers ---------------------------------- */
function savePix(p, name, k = 1) {
  let d = p.data, w = p.w, h = p.h;
  if (k > 1) {
    const out = new Uint8ClampedArray(w * k * h * k * 4);
    for (let y = 0; y < h * k; y++) {
      for (let x = 0; x < w * k; x++) {
        const s = (((y / k) | 0) * w + ((x / k) | 0)) * 4;
        const o = (y * w * k + x) * 4;
        out[o] = d[s]; out[o + 1] = d[s + 1]; out[o + 2] = d[s + 2]; out[o + 3] = 255;
      }
    }
    d = out; w *= k; h *= k;
  } else {
    d = new Uint8ClampedArray(d);
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
  }
  writePNG(path.join(outDir, name), w, h, d);
  console.log('wrote', path.join(outDir, name), `${w}x${h}`);
}

/** Composite `src` onto `dst` at (x,y), scaled by k. mode: 'normal' | 'add' ; tint = [r,g,b] 0..1 multiplies the sprite. */
function put(dst, src, x, y, k = 1, mode = 'normal', tint = null) {
  for (let sy = 0; sy < src.h; sy++) {
    for (let sx = 0; sx < src.w; sx++) {
      const si = (sy * src.w + sx) * 4;
      if (src.data[si + 3] < 128) continue;
      let r = src.data[si], g = src.data[si + 1], b = src.data[si + 2];
      if (tint) { r *= tint[0]; g *= tint[1]; b *= tint[2]; }
      for (let j = 0; j < k; j++) {
        for (let i = 0; i < k; i++) {
          const dx = x + sx * k + i, dy = y + sy * k + j;
          if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
          const di = (dy * dst.w + dx) * 4;
          if (mode === 'add') {
            dst.data[di] = Math.min(255, dst.data[di] + r);
            dst.data[di + 1] = Math.min(255, dst.data[di + 1] + g);
            dst.data[di + 2] = Math.min(255, dst.data[di + 2] + b);
          } else {
            dst.data[di] = r; dst.data[di + 1] = g; dst.data[di + 2] = b; dst.data[di + 3] = 255;
          }
        }
      }
    }
  }
}

function checker(w, h, a = '#1c1830', b = '#241e3c', cell = 8) {
  const p = new Pix(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) p.set(x, y, (((x / cell) | 0) + ((y / cell) | 0)) & 1 ? b : a);
  }
  return p;
}

function label(dst, text, x, y, color = '#b4a8d4') {
  drawText(dst, text, x, y, { color });
}

/** Sanity checks every asset must pass: 1-bit alpha, and a CLUT-friendly colour count (<= 16). */
function checkPix(name, p) {
  let bad = 0;
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] !== 0 && p.data[i] !== 255) bad++;
  if (bad) console.log(`  !! ${name}: ${bad} pixels with non-binary alpha`);
  const cc = p.colorCount();
  if (cc > 16) console.log(`  !! ${name}: ${cc} colours (> 16, exceeds a 4-bit CLUT)`);
}

/** A dusk-sky + hills 320x240 backdrop so HUD / sprite mocks are judged against something scene-like. */
function duskScene(hills = true) {
  const scene = new Pix(320, 240);
  for (let y = 0; y < 240; y++) {
    for (let x = 0; x < 320; x++) {
      const t = y / 240;
      scene.set(x, y, [Math.round(56 + 70 * (1 - t) + 8 * Math.sin(x / 23)), Math.round(48 + 44 * (1 - t)), Math.round(104 + 90 * (1 - t)), 255]);
    }
  }
  if (hills) {
    for (let x = 0; x < 320; x++) {
      const h1 = 150 + 12 * Math.sin(x / 31) + 6 * Math.sin(x / 11);
      const h2 = 172 + 9 * Math.sin(x / 19 + 2);
      for (let y = Math.round(h1); y < 240; y++) scene.set(x, y, y < h2 ? '#2e2a58' : '#1c3a3c');
    }
  }
  return scene;
}

/* ---------------------------------- sprites ---------------------------------- */
const GROUPS = [
  ['glow', 'glow_small', 'spark', 'spark_small', 'lens_star', 'gem_glint', 'firefly', 'ring'],
  ['flame_0', 'flame_1', 'flame_2', 'flame_3', 'flame_big_0', 'flame_big_1', 'flame_big_2', 'flame_big_3'],
  ['smoke_0', 'smoke_1', 'puff_0', 'puff_1', 'puff_2', 'puff_3', 'dust', 'leaf'],
  ['butterfly_0', 'butterfly_1', 'butterfly_2', 'sparx_0', 'sparx_1', 'shadow_blob', 'arrow_down', 'exclaim'],
  ['ripple_0', 'ripple_1', 'ripple_2', 'splash_0', 'splash_1', 'splash_2', 'snuffer_wisp'],
];
const isAdd = (n) => SPRITE_BLEND[n] === 'add';

function spriteSheets() {
  const t0 = process.hrtime.bigint();
  const S = generateSprites();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`generateSprites: ${Object.keys(S).length} sprites in ${ms.toFixed(1)} ms`);
  for (const k of Object.keys(S)) {
    checkPix(k, S[k]);
    if (SPRITE_NOTES[k] === undefined) console.log(`  !! ${k}: missing SPRITE_NOTES`);
    if (SPRITE_BLEND[k] === undefined) console.log(`  !! ${k}: missing SPRITE_BLEND`);
  }
  for (const [an, a] of Object.entries(SPRITE_ANIMS)) for (const f of a.frames) if (!S[f]) console.log(`  !! anim ${an}: unknown frame ${f}`);

  if (onlyList) {
    // zoomed close-up: each sprite twice side by side: alpha over checker, and additive-over-dark (or alpha over grey)
    const Z = zoom || 12, pad = 8, LHz = 12, maxW = 1500;
    const list = onlyList.filter((n) => S[n]);
    let x = pad, y = pad, rowH = 0;
    const placed = [];
    for (const n of list) {
      const p = S[n];
      const iw = p.w * Z * 2 + pad * 3;
      if (x + iw > maxW && x > pad) { x = pad; y += rowH + pad; rowH = 0; }
      placed.push({ n, x, y });
      x += iw;
      rowH = Math.max(rowH, p.h * Z + LHz);
    }
    const sh = new Pix(maxW, y + rowH + pad, '#101020');
    for (const { n, x: px, y: py } of placed) {
      const p = S[n];
      const bgc = checker(p.w * Z, p.h * Z, '#1c1830', '#241e3c', Z);
      for (let yy = 0; yy < bgc.h; yy++) for (let xx = 0; xx < bgc.w; xx++) sh.set(px + xx, py + LHz + yy, bgc.get(xx, yy));
      put(sh, p, px, py + LHz, Z, 'normal');
      label(sh, n, px, py);
      const x2 = px + p.w * Z + pad;
      sh.rect(x2, py + LHz, p.w * Z, p.h * Z, isAdd(n) ? '#0c0a18' : '#6a7a9a');
      put(sh, p, x2, py + LHz, Z, isAdd(n) ? 'add' : 'normal');
    }
    savePix(sh, 'sprites_zoom.png');
    return S;
  }

  const K = 4, CELL = 32 * K + 12, LH = 12;
  const W = 8 * CELL + 8, H = GROUPS.length * (CELL + LH + 4) + 8;
  const make = (bg, additiveOnBg, name) => {
    const sheet = bg();
    GROUPS.forEach((row, ri) => {
      row.forEach((n, ci) => {
        const p = S[n];
        const x = 8 + ci * CELL, y = 8 + ri * (CELL + LH + 4);
        put(sheet, p, x + ((32 - p.w) * K) / 2, y + LH + ((32 - p.h) * K) / 2, K, additiveOnBg && isAdd(n) ? 'add' : 'normal');
        label(sheet, n, x, y);
      });
    });
    savePix(sheet, name);
  };
  make(() => checker(W, H), false, 'sprites_normal.png');
  make(() => new Pix(W, H, '#1a1430'), true, 'sprites_additive_dark.png');
  make(() => new Pix(W, H, '#3a3a48'), true, 'sprites_additive_grey.png');

  // tinted: yellow / blue / green multiply (what vertex colours will do)
  const tints = [[1, 0.9, 0.3], [0.45, 0.75, 1], [0.5, 1, 0.5]];
  const tsheet = new Pix(W, 3 * (CELL + LH) + 8, '#1a1430');
  const tnames = ['glow', 'spark', 'lens_star', 'firefly', 'sparx_0', 'sparx_1', 'flame_1', 'gem_glint'];
  tints.forEach((t, ri) => {
    tnames.forEach((n, ci) => {
      const p = S[n];
      const x = 8 + ci * CELL, y = 8 + ri * (CELL + LH);
      put(tsheet, p, x + ((32 - p.w) * K) / 2, y + ((32 - p.h) * K) / 2, K, isAdd(n) ? 'add' : 'normal', t);
    });
  });
  savePix(tsheet, 'sprites_tinted.png');

  // game-scale scene: sprites in context on a dusk backdrop (what the player would actually see, x3)
  const sc = duskScene();
  const put1 = (n, x, y, tint) => put(sc, S[n], Math.round(x - S[n].w / 2), Math.round(y - S[n].h / 2), 1, isAdd(n) ? 'add' : 'normal', tint);
  put1('shadow_blob', 60, 196); put1('shadow_blob', 200, 204);
  put1('glow', 40, 150, [1, 0.75, 0.35]); put1('flame_big_1', 40, 176); put1('glow', 40, 172, [1, 0.6, 0.2]);
  put1('flame_2', 110, 178); put1('glow_small', 110, 170, [1, 0.7, 0.3]);
  put1('lens_star', 160, 100, [1, 0.9, 0.6]); put1('spark', 190, 84, [1, 0.95, 0.7]); put1('spark_small', 130, 90);
  put1('gem_glint', 230, 178, [0.6, 0.9, 1]);
  put1('butterfly_0', 90, 130); put1('butterfly_1', 250, 120); put1('butterfly_2', 275, 140);
  put1('sparx_0', 150, 130, [1, 0.85, 0.3]); put1('sparx_1', 175, 138, [0.5, 0.75, 1]);
  put1('firefly', 220, 110, [0.9, 1, 0.4]); put1('firefly', 235, 96, [0.9, 1, 0.4]); put1('firefly', 60, 100, [0.9, 1, 0.4]);
  put1('snuffer_wisp', 290, 160); put1('exclaim', 290, 142); put1('arrow_down', 200, 60);
  put1('smoke_0', 110, 150); put1('smoke_1', 116, 138); put1('puff_1', 140, 196); put1('dust', 170, 205); put1('leaf', 230, 130);
  put1('splash_1', 20, 226); put1('ripple_1', 60, 226); put1('ring', 280, 210, [0.7, 0.9, 1]);
  savePix(sc, 'sprites_actual.png', 3);

  // atlas (what packAtlas() gives the game): all sprites in one power-of-two texture
  const atlas = packAtlas(S);
  console.log(`packAtlas: ${atlas.w}x${atlas.h}`);
  const ap = new Pix(atlas.w, atlas.h, '#14101f');
  put(ap, atlas.pix, 0, 0, 1, 'normal');
  savePix(ap, 'sprites_atlas.png', 4);
  return S;
}

/* ---------------------------------- font ---------------------------------- */
function fontSheet() {
  const BG = '#3a2a5a';
  const strs = [
    'SPYRO GLOAMING VALE 0123456789',
    'GEMS 123/400  PRESS START',
    'THE LANTERNS HAVE GONE DARK!',
    'Hello, little dragon! Don\'t stop: "keep" going; (yes)?',
    'The quick brown fox jumps over the lazy dog. 0123456789',
    '. , : ; ! ? \' " - + / % ( ) = > < * # & @ _ [ ] × ♥ ~ ^ ` | { } \\ $',
    '{heart} x3   {gem} 123/400   {lantern} 4/6   {star} BONUS  ♥ ◆ ★',
  ];
  const sheet = new Pix(340, 520, BG);
  let y = 4;
  for (const style of ['plain', 'shadow', 'outline', 'bold', 'grad']) {
    label(sheet, style, 4, y, '#ffe27a');
    y += 10;
    for (const s of strs) {
      drawText(sheet, s, 4, y, { style });
      y += 11 + (style === 'outline' || style === 'shadow' || style === 'grad' ? 1 : 0);
    }
    y += 4;
  }
  savePix(sheet, 'font_scale1.png', 2);

  const big = new Pix(330, 470, BG);
  y = 4;
  for (const sc of [2, 3, 4]) {
    for (const style of ['plain', 'shadow', 'outline', 'bold', 'grad']) {
      drawText(big, sc === 4 ? 'GEMS 123/400 Gloam' : 'SPYRO GLOAMING VALE 0123456789', 4, y, { style, scale: sc });
      y += 7 * sc + (style === 'plain' ? 4 : 8);
    }
    y += 2;
  }
  savePix(big, 'font_scales.png', 2);

  const g = new Pix(320, 130, BG);
  const chars = Object.keys(FONT_GLYPHS).filter((c) => c !== ' ');
  let x = 4, yy = 4;
  for (const ch of chars) {
    const w = FONT_GLYPHS[ch].w;
    if (x + w + 3 > 316) { x = 4; yy += 12; }
    drawText(g, ch, x, yy, { color: '#ffffff' });
    x += w + 3;
  }
  savePix(g, 'font_glyphs.png', 4);
}

/* ---------------------------------- ui ---------------------------------- */
async function uiSheets() {
  const ui = await import('../src/engine/textures/ui.js');
  const { generateUI, drawPanel, drawBar, drawKeycap, makeLogo, UI_NOTES } = ui;
  let t0 = process.hrtime.bigint();
  const U = generateUI();
  console.log(`generateUI: ${Object.keys(U).length} icons in ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)} ms`);
  for (const n of Object.keys(U)) {
    if (UI_NOTES[n] === undefined) console.log(`  !! ${n}: missing UI_NOTES`);
    checkPix(n, U[n]);
  }
  const K = zoom || 6;
  const names = onlyList ? onlyList.filter((n) => U[n]) : Object.keys(U);
  const cols = onlyList ? Math.max(1, Math.floor(1500 / (16 * K + 10))) : 8, cell = 16 * K + 10;
  const sheet = new Pix(cols * cell + 8, Math.ceil(names.length / cols) * (cell + 12) + 8, '#3a2a5a');
  names.forEach((n, i) => {
    const x = 8 + (i % cols) * cell, y = 8 + Math.floor(i / cols) * (cell + 12);
    put(sheet, U[n], x, y + 12, K);
    label(sheet, n, x, y);
  });
  savePix(sheet, 'ui_icons.png');
  if (onlyList) return;

  t0 = process.hrtime.bigint();
  const logoA = makeLogo(['GLOAMING', 'VALE'], { scale: 3 });
  console.log(`makeLogo: ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)} ms  (${logoA.w}x${logoA.h}, ${logoA.colorCount()} colours)`);
  checkPix('logo', logoA);

  // ---- panels / bars / keycaps / menu ----
  const pan = new Pix(320, 240, '#5a4a88');
  for (let y = 0; y < 240; y += 8) for (let x = 0; x < 320; x += 8) if (((x + y) >> 3) & 1) pan.rect(x, y, 8, 8, '#4e4080');
  drawPanel(pan, 6, 6, 148, 50, { style: 'dialog' });
  drawText(pan, 'dialog', 14, 12, { style: 'shadow', color: '#ffe27a' });
  drawText(pan, 'Body: checker (default)', 14, 24, { style: 'shadow' });
  drawPanel(pan, 166, 6, 148, 50, { style: 'dialog', body: 'screen' });
  drawText(pan, 'dialog / screen', 174, 12, { style: 'shadow', color: '#ffe27a' });
  drawText(pan, 'see-through holes', 174, 24, { style: 'shadow' });
  drawPanel(pan, 6, 62, 100, 74, { style: 'menu' });
  ['RESUME', 'OPTIONS', 'QUIT'].forEach((t, i) => drawText(pan, t, 30, 72 + i * 16, { style: 'outline', color: i === 0 ? '#ffe27a' : '#dcd4f0' }));
  put(pan, U.arrow_right, 16, 71);
  drawPanel(pan, 116, 62, 90, 22, { style: 'hud' });
  put(pan, U.gem_red, 122, 67); drawText(pan, '1234', 140, 66, { style: 'grad', scale: 1 });
  drawPanel(pan, 216, 62, 98, 22, { style: 'hud', body: 'solid' });
  put(pan, U.heart, 222, 68); drawText(pan, 'x 5', 238, 66, { style: 'shadow' });
  for (let i = 0; i < 4; i++) drawBar(pan, 116, 92 + i * 11, 90, 7, [0, 0.35, 0.7, 1][i]);
  drawBar(pan, 216, 92, 98, 7, 0.6, { segments: 0 });
  drawBar(pan, 216, 103, 98, 9, 0.5, { segments: 6, colors: ['#a0f0b0', '#3fc060', '#14802e'] });
  drawBar(pan, 216, 116, 98, 5, 0.8, { segments: 12, colors: ['#ffc0b8', '#e02c34', '#a01420'] });
  let kx = 116;
  for (const k of ['A', 'X', 'ESC', 'SPACE']) kx += drawKeycap(pan, kx, 142, k).w + 3;
  [['{gem} 123/400', 0], ['{lantern} 4/6', 1], ['{heart}{heart}{heart}', 2]].forEach(([t, i]) => {
    drawText(pan, t, 116 + i * 70, 166, { style: 'outline' });
  });
  drawText(pan, 'Press {star} to jump', 116, 182, { style: 'shadow' });
  drawText(pan, wrapText('Word wrap keeps every line inside the panel width you give it.', 90, { style: 'shadow' }).join('\n'), 216, 182, { style: 'shadow' });
  const logoB = makeLogo(['GLOAMING', 'VALE'], { scale: 2 });
  put(pan, logoB, 8, 150);
  savePix(pan, 'ui_panels.png', 3);

  // ---- gameplay HUD mock ----
  const scene = duskScene();
  const S = generateSprites();
  const sp = (n, x, y, tint) => put(scene, S[n], Math.round(x - S[n].w / 2), Math.round(y - S[n].h / 2), 1, isAdd(n) ? 'add' : 'normal', tint);
  sp('glow', 250, 175, [1, 0.7, 0.3]); sp('flame_big_2', 250, 170);
  sp('shadow_blob', 130, 200); sp('sparx_0', 150, 150, [1, 0.85, 0.3]); sp('butterfly_0', 210, 130);
  put(scene, U.dragon_head, 8, 8);
  drawText(scene, '×3', 27, 11, { style: 'grad' });
  put(scene, U.sparx_blue, 8, 28);
  drawBar(scene, 26, 31, 60, 7, 0.7);
  for (let i = 0; i < 6; i++) put(scene, i < 3 ? U.lantern_on : U.lantern_off, 108 + i * 15, 6);
  const gw = measureText('123/400', { style: 'grad', scale: 2 }).w;
  drawText(scene, '123/400', 312, 8, { style: 'grad', scale: 2, align: 'right' });
  put(scene, U.gem_gold, 312 - gw - 16, 9);
  put(scene, S.arrow_down, 152, 92);
  drawPanel(scene, 12, 170, 296, 62, { style: 'dialog' });
  drawText(scene, 'Ember', 24, 177, { style: 'shadow', color: '#ffe27a' });
  drawText(scene, wrapText('The lanterns have gone dark! Light all six braziers before dusk falls, little dragon. {heart}', 268, { style: 'shadow' }).join('\n'), 24, 190, { style: 'shadow', color: '#f0e4ff' });
  put(scene, U.arrow_right, 292, 218);
  savePix(scene, 'ui_mock_hud.png', 3);

  // ---- title screen mock ----
  const title = duskScene();
  const logo = makeLogo(['GLOAMING', 'VALE'], { scale: 3 });
  put(title, logo, Math.round((320 - logo.w) / 2), 22);
  put(title, S.lens_star, 224, 32, 1, 'add', [1, 0.9, 0.6]);
  drawText(title, 'PRESS START', 160, 156, { style: 'outline', scale: 2, align: 'center', color: '#ffffff' });
  drawText(title, 'A FAN-MADE ADVENTURE', 160, 200, { style: 'shadow', align: 'center', color: '#dcd4f0' });
  drawText(title, 'GLOAMING VALE  NOT AFFILIATED', 160, 216, { style: 'shadow', align: 'center', color: '#b4a8d4' });
  put(title, U.dragon_head, 60, 110); put(title, U.star, 250, 110);
  savePix(title, 'ui_mock_title.png', 3);
}

/* ---------------------------------- main ---------------------------------- */
const all = which.includes('all');
if (all || which.includes('sprites')) spriteSheets();
if (all || which.includes('font')) fontSheet();
if (all || which.includes('ui')) await uiSheets();
