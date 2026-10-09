// Tests the open-spyro player page (docs/open-spyro/) without any game data: builds a tiny
// PlayStation disc of its own (ISO 9660, SYSTEM.CNF, a hand-assembled MIPS program that paints
// the screen one colour), checks the disc inspector on it, then boots it through the page in
// Chromium and reads the colour back from the emulator's own screenshot. For the HD mode, which
// needs a BIOS, it also makes a stand-in BIOS of its own: 512 KB whose reset code paints the screen
// the same way (Beetle PSX boots the BIOS first, so that is what shows, at the upscaled size).
//   node tools/open-spyro-test.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectDisc, cueFor, RETAIL_EXE } from '../docs/open-spyro/disc.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'open-spyro-test-'));
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };

// ---- MIPS code that fills the 320x240 screen with one colour, then spins at the end ----
const COLOUR = [0xf2, 0xb8, 0x4b];
function fillScreen(base) {
  const lui = (rt, imm) => (0x0f << 26) | (rt << 16) | imm;
  const ori = (rt, rs, imm) => (0x0d << 26) | (rs << 21) | (rt << 16) | imm;
  const sw = (rt, off, b) => (0x2b << 26) | (b << 21) | (rt << 16) | off;
  const T0 = 8, T1 = 9;
  const code = [lui(T0, 0x1f80), ori(T0, T0, 0x1810)]; // t0 = GP0; GP1 is t0 + 4
  const put = (port, word) => code.push(lui(T1, word >>> 16), ori(T1, T1, word & 0xffff), sw(T1, port, T0));
  for (const w of [0x00000000, 0x03000000, 0x08000001, 0x05000000, 0x06c60260, 0x07040010]) put(4, w); // GP1: reset, display on, 320x240, area, ranges
  for (const w of [0xe1000400, 0xe3000000, 0xe403bd3f, 0xe5000000]) put(0, w); // GP0: draw mode, drawing area 0,0-319,239, offset
  put(0, (0x02 << 24) | (COLOUR[2] << 16) | (COLOUR[1] << 8) | COLOUR[0]); // GP0: fill rectangle…
  put(0, 0x00000000); // …at 0,0
  put(0, (240 << 16) | 320); // …320x240
  const loop = base + code.length * 4;
  code.push((0x02 << 26) | ((loop >>> 2) & 0x3ffffff), 0); // j loop; nop
  const out = Buffer.alloc(code.length * 4);
  code.forEach((w, i) => out.writeUInt32LE(w >>> 0, i * 4));
  return out;
}

// A PS-EXE running that code, loaded at 0x80010000.
function psExe() {
  const exe = Buffer.alloc(2048 + 2048);
  exe.write('PS-X EXE', 0, 'latin1');
  exe.writeUInt32LE(0x80010000, 0x10); // pc
  exe.writeUInt32LE(0x80010000, 0x18); // load address
  exe.writeUInt32LE(2048, 0x1c); // text size
  exe.writeUInt32LE(0x801ffff0, 0x30); // stack
  exe.write('Sony Computer Entertainment Inc. for North America area', 0x4c, 'latin1');
  fillScreen(0x80010000).copy(exe, 2048);
  return exe;
}

// A stand-in BIOS: the CPU starts at 0xBFC00000, the first byte of the 512 KB ROM.
function standInBios() {
  const rom = Buffer.alloc(512 * 1024);
  fillScreen(0xbfc00000).copy(rom, 0);
  return rom;
}

// ---- ISO 9660 image (2048-byte sectors) holding SYSTEM.CNF and the executable ----
function iso(files) {
  const both16 = (b, o, v) => { b.writeUInt16LE(v, o); b.writeUInt16BE(v, o + 2); };
  const both32 = (b, o, v) => { b.writeUInt32LE(v, o); b.writeUInt32BE(v, o + 4); };
  const record = (name, lba, size, dir) => {
    const n = Buffer.from(name, 'latin1');
    const r = Buffer.alloc(33 + n.length + (n.length % 2 === 0 ? 1 : 0));
    r[0] = r.length; both32(r, 2, lba); both32(r, 10, size);
    r.set([96, 1, 1, 0, 0, 0, 0], 18); r[25] = dir ? 2 : 0; both16(r, 28, 1); r[32] = n.length; n.copy(r, 33);
    return r;
  };
  const ROOT = 20;
  let lba = 21;
  const placed = files.map((f) => { const at = lba; lba += Math.ceil(f.data.length / 2048); return { ...f, lba: at }; });
  const total = lba;
  const img = Buffer.alloc(total * 2048);
  const dir = Buffer.concat([record('\0', ROOT, 2048, true), record('\x01', ROOT, 2048, true), ...placed.map((f) => record(`${f.name};1`, f.lba, f.data.length, false))]);
  dir.copy(img, ROOT * 2048);
  for (const f of placed) f.data.copy(img, f.lba * 2048);
  const pvd = img.subarray(16 * 2048, 17 * 2048);
  pvd[0] = 1; pvd.write('CD001', 1, 'latin1'); pvd[6] = 1;
  pvd.fill(0x20, 8, 72); pvd.write('PLAYSTATION', 8, 'latin1'); pvd.write('OPENSPYROTEST', 40, 'latin1');
  both32(pvd, 80, total); both16(pvd, 120, 1); both16(pvd, 124, 1); both16(pvd, 128, 2048); both32(pvd, 132, 10);
  pvd.writeUInt32LE(18, 140); pvd.writeUInt32BE(19, 148);
  record('\0', ROOT, 2048, true).copy(pvd, 156); pvd[881] = 1;
  const term = img.subarray(17 * 2048); term[0] = 255; term.write('CD001', 1, 'latin1'); term[6] = 1;
  const pt = Buffer.from([1, 0, ROOT, 0, 0, 0, 1, 0, 0, 0]);
  pt.copy(img, 18 * 2048);
  Buffer.from([1, 0, 0, 0, 0, ROOT, 0, 1, 0, 0]).copy(img, 19 * 2048);
  return img;
}

// ---- the same image as raw MODE2/2352 sectors, as mkpsxiso writes open-spyro's disc ----
// With real EDC and ECC: Beetle PSX checks every sector's and will not read a disc without them.
const EDC = new Uint32Array(256), ECC_F = new Uint8Array(256), ECC_B = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const j = (i << 1) ^ (i & 0x80 ? 0x11d : 0);
  ECC_F[i] = j; ECC_B[i ^ j] = i;
  let e = i;
  for (let k = 0; k < 8; k++) e = (e >>> 1) ^ (e & 1 ? 0xd8018001 : 0);
  EDC[i] = e >>> 0;
}
function eccBlock(sector, majors, minors, majorMult, minorInc, dest) {
  const src = sector.subarray(12), size = majors * minors;
  for (let major = 0; major < majors; major++) {
    let index = (major >> 1) * majorMult + (major & 1), a = 0, b = 0;
    for (let minor = 0; minor < minors; minor++) {
      const t = src[index];
      index += minorInc; if (index >= size) index -= size;
      a ^= t; b ^= t; a = ECC_F[a];
    }
    a = ECC_B[ECC_F[a] ^ b];
    sector[dest + major] = a; sector[dest + major + majors] = a ^ b;
  }
}
function raw2352(img) {
  const n = img.length / 2048;
  const out = Buffer.alloc(n * 2352);
  const bcd = (v) => ((v / 10) | 0) * 16 + (v % 10);
  for (let i = 0; i < n; i++) {
    const s = out.subarray(i * 2352, (i + 1) * 2352);
    s.fill(0xff, 1, 11);
    const f = i + 150;
    s[12] = bcd((f / 4500) | 0); s[13] = bcd(((f / 75) | 0) % 60); s[14] = bcd(f % 75); s[15] = 2;
    s[18] = s[22] = 8; // subheader: form 1 data
    img.copy(s, 24, i * 2048, (i + 1) * 2048);
    let edc = 0;
    for (let k = 16; k < 16 + 8 + 2048; k++) edc = (edc >>> 8) ^ EDC[(edc ^ s[k]) & 0xff];
    s.writeUInt32LE(edc >>> 0, 2072);
    const header = Buffer.from(s.subarray(12, 16)); // MODE2 form 1 ECC is computed with the header zeroed
    s.fill(0, 12, 16);
    eccBlock(s, 86, 24, 2, 86, 2076);
    eccBlock(s, 52, 43, 86, 88, 2248);
    header.copy(s, 12);
  }
  return out;
}

const exe = psExe();
const cnf = Buffer.from(`BOOT = cdrom:\\${RETAIL_EXE};1\r\nTCB = 4\r\nEVENT = 10\r\nSTACK = 801FFFF0\r\n`, 'latin1');
const image = iso([{ name: 'SYSTEM.CNF', data: cnf }, { name: RETAIL_EXE, data: exe }]);
const bin = raw2352(image);
fs.writeFileSync(path.join(tmp, 'TestDisc.bin'), bin);
fs.writeFileSync(path.join(tmp, 'TestDisc.cue'), 'FILE "TestDisc.bin" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n');
// A two-track set (data + 2 s of silent audio) for the multi-.bin path.
fs.writeFileSync(path.join(tmp, 'Multi (Track 1).bin'), bin);
fs.writeFileSync(path.join(tmp, 'Multi (Track 2).bin'), Buffer.alloc(150 * 2352));
fs.writeFileSync(path.join(tmp, 'scph-test.bin'), standInBios());
fs.writeFileSync(path.join(tmp, 'Multi.cue'), 'FILE "Multi (Track 1).bin" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\nFILE "Multi (Track 2).bin" BINARY\r\n  TRACK 02 AUDIO\r\n    INDEX 00 00:00:00\r\n    INDEX 01 00:02:00\r\n');

// ---- the inspector, in Node ----
const sha1 = (await import('node:crypto')).createHash('sha1').update(exe).digest('hex');
for (const [label, data] of [['raw 2352', bin], ['iso 2048', image]]) {
  const info = await inspectDisc(new Blob([data]));
  check(info.readable && info.boot === RETAIL_EXE && info.sha1 === sha1 && !info.retail && info.label === 'OPENSPYROTEST', `inspector reads the ${label} image (boot ${info.boot}, sha1 ${info.sha1?.slice(0, 8)}, label ${info.label})`);
}
check(!(await inspectDisc(new Blob([Buffer.alloc(100000)]))).readable, 'inspector rejects a blank file');
const cue = await (await cueFor(new File([bin], 'TestDisc.bin'))).text();
check(/FILE "TestDisc\.bin" BINARY/.test(cue) && /TRACK 01 MODE2\/2352/.test(cue), 'a lone .bin gets a MODE2/2352 .cue');
check(/TRACK 01 MODE1\/2048/.test(await (await cueFor(new File([image], 'TestDisc.iso'))).text()), 'a 2048-byte .iso gets a MODE1/2048 .cue');

// ---- the page, in Chromium ----
const docs = path.join(root, 'docs');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const p = path.join(docs, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = p.endsWith('/') ? path.join(p, 'index.html') : p;
  if (!file.startsWith(docs) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/open-spyro/`; // a secure context, as https is: the page hashes with crypto.subtle

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--host-resolver-rules=MAP open-spyro.test 127.0.0.1'] });

async function run(files, label, { expectRemembered = false, context = null, gfx = null, bios = false, size = [320, 240] } = {}) {
  const ctx = context || (await browser.newContext({ viewport: { width: 960, height: 720 } }));
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => { if (!/Wake Lock/.test(e.message)) problems.push(e.message); }); // headless Chromium refuses the screen wake lock
  page.on('console', (m) => { if (m.type() === 'error' && !/cdn\.emulatorjs\.org|Failed to load resource|Missing language/.test(m.text())) problems.push(m.text()); });
  // Served from 127.0.0.1, EmulatorJS asks its CDN for a newer version: answer for it, offline.
  await page.route('https://cdn.emulatorjs.org/**', (r) => r.fulfill({ json: { version: '4.2.3', current_version: '4.2.3' } }));
  await page.goto(url);
  if (gfx) {
    await page.check(`input[name="look"][value="${gfx.look}"]`);
    if (gfx.scale) await page.selectOption('#scale', gfx.scale);
    if (gfx.filter) await page.selectOption('#filter', gfx.filter);
    if (gfx.overclock) await page.check('#overclock');
  }
  if (bios) {
    if (gfx?.look === 'hd') check(await page.isVisible('#need-bios'), `${label}: HD asks for a BIOS before it can play`);
    await page.setInputFiles('#bios', path.join(tmp, 'scph-test.bin'));
    await page.waitForFunction(() => /scph-test\.bin/.test(document.getElementById('bios-name').textContent));
  }
  if (expectRemembered) {
    await page.waitForSelector('#remembered', { state: 'visible', timeout: 10000 });
    check(/TestDisc\.bin/.test(await page.textContent('#remembered-name')), `${label}: the remembered disc is offered`);
    await page.click('#play-remembered');
  } else {
    await page.setInputFiles('#file', files.map((f) => path.join(tmp, f)));
    await page.waitForFunction(() => !/Reading/.test(document.getElementById('verdict').textContent), null, { timeout: 30000 });
    const verdict = await page.textContent('#verdict');
    check(/modified/.test(verdict) && /SCUS_942\.28/.test(verdict), `${label}: verdict says a modified SCUS_942.28 (“${verdict.slice(0, 70)}…”)`);
    await page.click('#play');
  }
  await page.waitForFunction(() => document.body.dataset.started === '1', null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const px = await page.evaluate(async () => {
    const png = await window.EJS_emulator.gameManager.screenshot();
    const bmp = await createImageBitmap(new Blob([png], { type: 'image/png' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
    c.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, rgb: [...c.getImageData(bmp.width >> 1, bmp.height >> 1, 1, 1).data.slice(0, 3)] };
  });
  const near = px.rgb.every((v, i) => Math.abs(v - COLOUR[i]) <= 8); // 15-bit colour rounds the low bits
  check(near && px.w === size[0] && px.h === size[1], `${label}: it boots and paints the screen (${px.w}x${px.h}, expected ${size.join('x')}; centre rgb ${px.rgb.join(',')})`);
  await page.screenshot({ path: path.join(tmp, `${label.replace(/\W+/g, '-')}.png`) });
  check(problems.length === 0, `${label}: no page errors${problems.length ? ': ' + problems.join(' | ').slice(0, 300) : ''}`);
  await page.close();
  return ctx;
}

const ctx = await run(['TestDisc.bin', 'TestDisc.cue'], 'bin + cue');
await run([], 'remembered disc', { expectRemembered: true, context: ctx });
await ctx.close();
await (await run(['Multi.cue', 'Multi (Track 1).bin', 'Multi (Track 2).bin'], 'multi-track set')).close();
await (await run(['TestDisc.bin'], 'standard + smooth filter + overclock', { gfx: { look: 'standard', filter: 'smooth', overclock: true } })).close();
// HD: Beetle PSX boots the stand-in BIOS, which paints the screen; the emulator renders it at 2x and 4x.
await (await run(['TestDisc.bin'], 'HD 2x', { gfx: { look: 'hd', scale: '2x' }, bios: true, size: [640, 480] })).close();
await (await run(['TestDisc.bin', 'TestDisc.cue'], 'HD 4x + CRT + overclock', { gfx: { look: 'hd', scale: '4x', filter: 'crt', overclock: true }, bios: true, size: [1280, 960] })).close();

// Over plain http (not a secure context) the page cannot hash, and says so instead.
{
  const page = await browser.newPage();
  await page.goto(`http://open-spyro.test:${port}/open-spyro/`);
  await page.setInputFiles('#file', path.join(tmp, 'TestDisc.bin'));
  await page.waitForFunction(() => !/Reading/.test(document.getElementById('verdict').textContent), null, { timeout: 30000 });
  check(/over https/.test(await page.textContent('#verdict')), 'plain http: the verdict names the boot executable and asks for https to compare it');
  await page.close();
}

await browser.close();
server.close();
console.log(`screenshots in ${tmp}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
