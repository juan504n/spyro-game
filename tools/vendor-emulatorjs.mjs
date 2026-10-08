// Vendors EmulatorJS and its PlayStation core (PCSX-ReARMed) into docs/open-spyro/emulatorjs/,
// so the open-spyro player page works from GitHub Pages (or any static server) with no CDN.
//   node tools/vendor-emulatorjs.mjs [version]     (default: the pinned version below)
// The npm packages ship the unminified sources; this joins them into the emulator.min.js /
// emulator.min.css that data/loader.js asks for, and keeps only the files the player uses:
// the two single-threaded cores (WebGL2 and legacy), the core report, the archive extractors
// (the cores themselves are 7z archives) and the UI translations.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const VERSION = process.argv[2] || '4.2.3';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/open-spyro/emulatorjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ejs-'));

function unpack(pkg) {
  const tgz = execFileSync('npm', ['pack', `${pkg}@${VERSION}`, '--silent'], { cwd: tmp, encoding: 'utf8' }).trim().split('\n').pop();
  const dir = path.join(tmp, pkg.replace(/[@/]/g, '_'));
  fs.mkdirSync(dir);
  execFileSync('tar', ['xzf', path.join(tmp, tgz), '-C', dir]);
  return path.join(dir, 'package');
}

const ejs = unpack('@emulatorjs/emulatorjs');
const core = unpack('@emulatorjs/core-pcsx_rearmed');
const data = path.join(ejs, 'data');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'cores/reports'), { recursive: true });

// Same order as the debug list in data/loader.js: they are classic scripts sharing globals.
const scripts = ['emulator.js', 'nipplejs.js', 'shaders.js', 'storage.js', 'gamepad.js', 'GameManager.js', 'socket.io.min.js', 'compression.js'];
const joined = scripts.map((f) => fs.readFileSync(path.join(data, 'src', f), 'utf8')).join(';\n');
const js = await esbuild.transform(joined, { minifyWhitespace: true, minifySyntax: true, legalComments: 'inline', target: 'es2020' });
fs.writeFileSync(path.join(out, 'emulator.min.js'), js.code);
const css = await esbuild.transform(fs.readFileSync(path.join(data, 'emulator.css'), 'utf8'), { loader: 'css', minify: true });
fs.writeFileSync(path.join(out, 'emulator.min.css'), css.code);

for (const f of ['loader.js', 'version.json']) fs.copyFileSync(path.join(data, f), path.join(out, f));
fs.cpSync(path.join(data, 'compression'), path.join(out, 'compression'), { recursive: true, filter: (p) => !p.endsWith('README.md') });
fs.cpSync(path.join(data, 'localization'), path.join(out, 'localization'), { recursive: true, filter: (p) => !p.endsWith('README.md') });
for (const f of ['pcsx_rearmed-wasm.data', 'pcsx_rearmed-legacy-wasm.data']) fs.copyFileSync(path.join(core, f), path.join(out, 'cores', f));
fs.copyFileSync(path.join(core, 'reports/pcsx_rearmed.json'), path.join(out, 'cores/reports/pcsx_rearmed.json'));
fs.copyFileSync(path.join(ejs, 'LICENSE'), path.join(out, 'LICENSE'));

fs.rmSync(tmp, { recursive: true, force: true });
let bytes = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : (bytes += fs.statSync(path.join(d, e.name)).size)));
walk(out);
console.log(`vendored EmulatorJS ${VERSION} + pcsx_rearmed into ${path.relative(root, out)} (${(bytes / 1048576).toFixed(1)} MB)`);
