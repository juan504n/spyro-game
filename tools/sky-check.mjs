// The painted skies (src/game/skybox/) held to what makes a sky usable, headlessly (no server, no browser): every sky of every world is painted and must be finite, deterministic, seamless round the
// back (azimuth 0 meets 360), joined to the world's fog under the horizon, neither black nor blown out, and the two moods of a world must differ; every world that is meant to have a painted sky has one.
//   node tools/sky-check.mjs
import { paintSky, EL_MIN, EL_MAX } from '../src/game/skybox/paint.js';
import * as SPECS from '../src/game/skybox/specs.js';
import { FROST_ENVIRONMENT } from '../src/game/frostbloom/environment.js';
import { EMBER_ENVIRONMENT } from '../src/game/emberfall/environment.js';
import { SKY_ENVIRONMENT } from '../src/game/skyweaver/environment.js';
import { TIDE_ENVIRONMENT } from '../src/game/tideglass/environment.js';
import { GUARDIAN_ENVIRONMENT } from '../src/game/guardian/environment.js';
import { DEFAULT_ENVIRONMENT } from '../src/engine/lighting.js';

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : detail); };
const W = 512, H = 128, SPAN = EL_MAX - EL_MIN;
const hash = (d) => { let h = 2166136261; for (let i = 0; i < d.length; i += 7) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
const px = (img, x, y) => [0, 1, 2].map((c) => img.data[(y * img.w + x) * 4 + c]);
const rowOf = (el) => Math.round(((el - EL_MIN) / SPAN) * H - 0.5);
const worlds = { GLOAMING: DEFAULT_ENVIRONMENT, FROSTBLOOM: FROST_ENVIRONMENT, EMBERFALL: EMBER_ENVIRONMENT, SKYWEAVER: SKY_ENVIRONMENT, TIDEGLASS: TIDE_ENVIRONMENT, GUARDIAN: GUARDIAN_ENVIRONMENT };

for (const [name, env] of Object.entries(worlds)) {
  const pair = SPECS[name], own = env.skybox || (env === DEFAULT_ENVIRONMENT ? SPECS.GLOAMING : null);
  check(`${name}: the world has a painted sky of two moods (the gloom, then the dawn)`, Array.isArray(pair) && pair.length === 2 && own === pair, own ? `(${own.length} skies)` : '(none)');
  if (!pair) continue;
  const imgs = pair.map((spec, m) => paintSky(spec, { w: W, h: H, fog: env.sky[m].fog, grade: 0 }));
  imgs.forEach((img, m) => {
    const tag = `${name} ${'AB'[m]}`;
    let nan = 0, lum = 0, hi = 0;
    for (let i = 0; i < img.w * img.h; i++) { const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2]; if (!(r >= 0 && g >= 0 && b >= 0)) nan++; const l = (0.3 * r + 0.59 * g + 0.11 * b) / 255; lum += l; if (l > 0.985) hi++; }
    lum /= img.w * img.h;
    check(`${tag}: finite, and neither black nor blown out (mean luminance ${lum.toFixed(2)}, ${(100 * hi / (img.w * img.h)).toFixed(1)}% white)`, nan === 0 && lum > 0.12 && lum < 0.9 && hi / (img.w * img.h) < 0.05);
    // seamless: the step across azimuth 0 is no bigger than a few of the steps elsewhere
    let across = 0, typical = 0, n = 0;
    for (let y = 0; y < H; y++) { const a = px(img, 0, y), b = px(img, W - 1, y), c = px(img, 1, y), d = px(img, W - 2, y); across += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]); typical += Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) + Math.abs(a[2] - c[2]) + Math.abs(b[0] - d[0]) + Math.abs(b[1] - d[1]) + Math.abs(b[2] - d[2]); n++; }
    across /= n; typical /= 2 * n;
    check(`${tag}: no seam where azimuth 0 meets 360 (a step of ${across.toFixed(1)} against ${typical.toFixed(1)} elsewhere)`, across <= typical * 3 + 4);
    // under the horizon it is the world's fog
    const fog = env.sky[m].fog.map((v) => v * 255), low = px(img, W >> 1, rowOf(-11));
    const dFog = Math.max(...low.map((v, c) => Math.abs(v - fog[c])));
    check(`${tag}: under the horizon it is the world's fog, so that the ground fades into the sky (off by ${dFog.toFixed(0)} of 255)`, dFog <= 10);
  });
  const again = paintSky(pair[0], { w: W, h: H, fog: env.sky[0].fog, grade: 0 });
  check(`${name}: painting is deterministic`, hash(again.data) === hash(imgs[0].data));
  let diff = 0; for (let i = 0; i < imgs[0].data.length; i += 4) diff += Math.abs(imgs[0].data[i] - imgs[1].data[i]) + Math.abs(imgs[0].data[i + 1] - imgs[1].data[i + 1]) + Math.abs(imgs[0].data[i + 2] - imgs[1].data[i + 2]);
  diff /= 3;
  check(`${name}: the gloom and the dawn are different skies (mean difference ${(diff / (W * H)).toFixed(0)} of 255 a channel)`, diff / (W * H) > 25);
}
// the painter is held to its budget: the two skies of a world at the game's size
const t0 = Date.now();
paintSky(SPECS.FROSTBLOOM[0], { w: 1024, h: 256, fog: FROST_ENVIRONMENT.sky[0].fog, grade: 0.6 });
const ms = Date.now() - t0;
check(`one sky at the game's size (1024 x 256) paints in under 2 s (${ms} ms)`, ms < 2000);
console.log(failed ? `\n${failed} FAILED` : '\nall sky checks passed');
process.exit(failed ? 1 : 0);
