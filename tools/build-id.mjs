// The build id debug mode shows (top line of the readout): a short hash of everything under src/ plus the build date. A screenshot of the
// readout then says exactly which code was running:  node tools/build-id.mjs   prints the id of the source tree as it is now.
//   (the hash covers the source only: README, docs/ and the built files do not change it, so an id can be checked against any commit.)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else out.push(p);
  }
  return out;
}

export function sourceHash(base = root) {
  const h = crypto.createHash('sha1');
  for (const f of files(path.join(base, 'src'))) {
    h.update(path.relative(base, f).split(path.sep).join('/'));
    h.update('\0');
    h.update(fs.readFileSync(f));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 7);
}

export function buildId(base = root, date = new Date()) { return `${sourceHash(base)} ${date.toISOString().slice(0, 10)}`; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(buildId());
