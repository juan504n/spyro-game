// Builds the whole game (three.js, engine, procedural art/audio, level) into ONE self-contained HTML file.
//   node tools/build-single.mjs [out.html]        (default: docs/index.html — also served by GitHub Pages from /docs)
// Dev-only scenes (src/dev/*) are left out and the audio module is imported statically instead of via import.meta.glob.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const artifact = argv.includes('--artifact');      // fragment for a host that supplies its own <!doctype>/<head>/<body> wrapper
const outArg = argv.find((a) => !a.startsWith('--'));
const out = path.resolve(root, outArg || (artifact ? 'dist/artifact.html' : 'docs/index.html'));

/** exact-string source patch that fails loudly when the source drifts */
function patch(src, from, to, file) {
  if (!src.includes(from)) throw new Error(`build-single: patch anchor not found in ${file}:\n${from}`);
  return src.replace(from, to);
}

const singleFile = {
  name: 'single-file',
  setup(build) {
    build.onLoad({ filter: /src[\\/]main\.js$/ }, (a) => {
      let s = fs.readFileSync(a.path, 'utf8');
      s = patch(s, "const mod = await import(`./dev/${test}.js`);\n    scene = await mod.create(gfx, params);",
        "throw new Error('dev scenes are not part of the single-file build');", 'src/main.js');
      return { contents: s, loader: 'js', resolveDir: path.dirname(a.path) };
    });
    build.onLoad({ filter: /src[\\/]game[\\/]app\.js$/ }, (a) => {
      let s = fs.readFileSync(a.path, 'utf8');
      s = patch(s, "const audioModules = import.meta.glob('../engine/audio/audio.js');",
        "const audioModules = { audio: async () => audioNs };", 'src/game/app.js');
      s = "import * as audioNs from '../engine/audio/audio.js';\n" + s;
      return { contents: s, loader: 'js', resolveDir: path.dirname(a.path) };
    });
  },
};

const t0 = Date.now();
const res = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true, write: false, format: 'iife', minify: true, target: 'es2022', legalComments: 'none',
  plugins: [singleFile], logLevel: 'warning', charset: 'ascii',
  define: { 'process.env.NODE_ENV': '"production"' },
});
let js = res.outputFiles[0].text;
js = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const favicon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%23241a3c'/%3E%3Cpath d='M7 1h2v2h2v2H5V3h2zM4 5h8v7H4z' fill='%23f0901c'/%3E%3Cpath d='M6 6h4v5H6z' fill='%23ffe27a'/%3E%3Cpath d='M5 12h6v2H5z' fill='%236a4a8c'/%3E%3C/svg%3E";
const artifactHtml = `<title>Gloaming Vale</title>
<style>
  :root { color-scheme: dark; --bg: #000; --ink: #c8bce8; }
  html, body { height: 100%; margin: 0; background: var(--bg); overflow: hidden; overscroll-behavior: none; touch-action: none; -webkit-user-select: none; user-select: none; }
  canvas#screen { position: fixed; inset: 0; display: block; width: 100%; height: 100%; image-rendering: pixelated; outline: none; background: var(--bg); }
  noscript { position: fixed; inset: 0; display: grid; place-items: center; color: var(--ink); font: 16px monospace; }
</style>
<canvas id="screen" tabindex="0"></canvas>
<noscript>Gloaming Vale needs JavaScript and WebGL2.</noscript>
<script>
${js}
</script>
`;
const html = artifact ? artifactHtml : `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="description" content="Gloaming Vale — a fan-made Spyro-style DLC realm rendered with a pixel-accurate PlayStation 1 look in three.js.">
<title>Gloaming Vale</title>
<link rel="icon" href="${favicon}">
<style>
  :root { color-scheme: dark; --bg: #000; }
  html, body { margin: 0; height: 100%; background: var(--bg); overflow: hidden; overscroll-behavior: none; touch-action: none; -webkit-user-select: none; user-select: none; }
  canvas#screen { position: fixed; inset: 0; display: block; width: 100%; height: 100%; image-rendering: pixelated; outline: none; background: #000; }
  noscript { position: fixed; inset: 0; display: grid; place-items: center; color: #c8bce8; font: 16px monospace; }
</style>
</head>
<body>
<canvas id="screen" tabindex="0"></canvas>
<noscript>Gloaming Vale needs JavaScript and WebGL2.</noscript>
<script>
${js}
</script>
</body>
</html>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`built ${path.relative(root, out)}  ${kb} KB  in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
