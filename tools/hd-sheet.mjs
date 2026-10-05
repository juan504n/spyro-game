#!/usr/bin/env node
// Contact sheets of the HD textures (src/engine/textures/hd/): what the smooth look paints in place of each pixel texture, labelled, at a size you can judge.
//
//   node tools/hd-sheet.mjs [outDir] [--only=a,b,c] [--cell=160] [--cols=8] [--size=256] [--tile] [--quiet]
//
// Writes into outDir (default: <os tmpdir>/gloaming-hd-textures) one sheet per group (hd-terrain.png, hd-buildings.png, hd-plants.png, hd-sprites.png, hd-water.png, hd-magic.png, hd-sky.png, hd-props.png), each
// texture scaled to `cell` px (cut-outs over a sky-coloured checker), its name, size and the time it took to paint under it. With --tile every texture that tiles is shown 2 x 2 (the seams are where you will see them).
// --size=128 paints the way a slow device does (see configureHD). Prints the slowest textures and the total.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { FB } from './lib/fb.mjs';
import { generateWorldTextures } from '../src/engine/textures/world.js';
import { terrainTextures } from '../src/engine/textures/world/terrain.js';
import { buildingTextures } from '../src/engine/textures/world/buildings.js';
import { plantTextures } from '../src/engine/textures/world/plants.js';
import { waterTextures } from '../src/engine/textures/world/water.js';
import { magicTextures } from '../src/engine/textures/world/magic.js';
import { skyTextures } from '../src/engine/textures/world/sky.js';
import { propTextures } from '../src/engine/textures/world/props.js';
import { PAINT, HD, HD_STATS } from '../src/engine/textures/hd/index.js';

const argv = process.argv.slice(2);
const flag = (n) => argv.some((a) => a === `--${n}`);
const opt = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const outDir = argv.find((a) => !a.startsWith('--')) || path.join(os.tmpdir(), 'gloaming-hd-textures');
const CELL = Number(opt('cell', 160)), COLS = Number(opt('cols', 8)), ONLY = opt('only', '') ? opt('only', '').split(',') : null, TILE = flag('tile'), QUIET = flag('quiet');
HD.size = Number(opt('size', 256));
fs.mkdirSync(outDir, { recursive: true });

const GROUPS = { terrain: terrainTextures, buildings: buildingTextures, plants: plantTextures, water: waterTextures, magic: magicTextures, sky: skyTextures, props: propTextures };
const groupOf = {};
for (const [g, f] of Object.entries(GROUPS)) for (const n of Object.keys(f())) groupOf[n] = g;
const sprites = new Set(['tuft', 'flower_pink', 'flower_yellow', 'flower_blue', 'flower_ember', 'flower_sky', 'reeds', 'fern', 'lilypad', 'vine']);
const all = generateWorldTextures();

/** the HD image as a cell x cell picture (box average down, bilinear if it has to go up), alpha kept */
function fit(p, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = p.w / w, sy = p.h / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, c = 0;
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx)), y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * p.w + xx) * 4, wt = p.data[i + 3] / 255; r += p.data[i] * wt; g += p.data[i + 1] * wt; b += p.data[i + 2] * wt; a += p.data[i + 3]; c++; }
      const wsum = a / 255;
      out[(y * w + x) * 4] = wsum ? r / wsum : 0; out[(y * w + x) * 4 + 1] = wsum ? g / wsum : 0; out[(y * w + x) * 4 + 2] = wsum ? b / wsum : 0; out[(y * w + x) * 4 + 3] = a / c;
    }
  }
  return out;
}

const timing = [];
let total = 0;
for (const group of Object.keys(GROUPS)) {
  const names = Object.keys(PAINT).filter((n) => groupOf[n] === group && all[n] && (!ONLY || ONLY.includes(n)));
  if (!names.length) continue;
  // the sprites are sorted into their own sheet: they are the textures cut out of a card
  const parts = group === 'plants' ? [['plants', names.filter((n) => !sprites.has(n))], ['sprites', names.filter((n) => sprites.has(n))]] : [[group, names]];
  for (const [label, list] of parts) {
    if (!list.length) continue;
    const per = TILE ? CELL * 2 : CELL, rows = Math.ceil(list.length / COLS), cw = per + 8, ch = per + 22;
    const fb = new FB(COLS * cw + 8, rows * ch + 8, [24, 22, 34, 255]);
    list.forEach((name, i) => {
      const t0 = performance.now();
      const hd = all[name].pix.hd();
      const ms = performance.now() - t0;
      total += ms; timing.push([name, ms]);
      const m = Math.max(hd.w, hd.h), tw = Math.round((CELL * hd.w) / m), th = Math.round((CELL * hd.h) / m);
      const img = fit(hd, tw, th);
      const cx = 8 + (i % COLS) * cw, cy = 8 + Math.floor(i / COLS) * ch;
      const reps = TILE && all[name].tile ? 2 : 1;
      for (let ry = 0; ry < reps; ry++) {
        for (let rx = 0; rx < reps; rx++) {
          for (let y = 0; y < th; y++) {
            for (let x = 0; x < tw; x++) {
              const k = (y * tw + x) * 4, a = img[k + 3] / 255, back = (((x >> 3) + (y >> 3)) & 1) ? [150, 190, 230] : [120, 160, 205];
              fb.rect(cx + rx * tw + x, cy + ry * th + y, 1, 1, [img[k] * a + back[0] * (1 - a), img[k + 1] * a + back[1] * (1 - a), img[k + 2] * a + back[2] * (1 - a), 255]);
            }
          }
        }
      }
      fb.text(`${name} ${hd.w}x${hd.h} ${ms.toFixed(0)}MS`, cx, cy + per + 4, [230, 226, 240, 255], 1);
    });
    fb.save(path.join(outDir, `hd-${label}.png`));
  }
}
timing.sort((a, b) => b[1] - a[1]);
if (!QUIET) {
  console.log(`${timing.length} textures at ${HD.size} px, ${total.toFixed(0)} ms in all (${HD_STATS.made} painted); slowest: ${timing.slice(0, 5).map(([n, ms]) => `${n} ${ms.toFixed(0)}`).join(', ')}`);
  console.log('sheets in', outDir);
}
