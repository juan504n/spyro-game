#!/usr/bin/env node
// Headless-Chromium smoke test for the WebAudio wrapper (src/engine/audio/audio.js).
//
//   node tools/audio-smoke.mjs [--runs=N] [--json]
//
// Starts a tiny static http server for the repo, opens a generated page that imports the audio module
// (no bundler), and checks in a real browser that:
//   - every public method is a silent no-op before init(),
//   - init() completes with no console errors, reports progress 0..1 monotonically, and its time is
//     measured (also the longest main-thread task and the longest gap between event-loop turns),
//   - every sfx name, loop, stinger and control call runs without throwing,
//   - audio actually reaches the output (an AnalyserNode on the last node sees energy) and never
//     exceeds full scale, even in a 200-trigger gem burst; the voice pool stays under its cap,
//   - the day/night crossfade is equal-power (cos^2 + sin^2 = 1),
//   - setMuffled() low-passes world sounds but lets UI sounds through unfiltered.
// Playwright is the global install; chromium is launched with autoplay allowed. Exit code 1 on failure.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runs = Number((process.argv.find((a) => a.startsWith('--runs=')) || '--runs=1').slice(7));
const asJson = process.argv.includes('--json');

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
const PAGE = `<!doctype html><meta charset="utf-8"><title>audio smoke</title><body>
<script type="module">
import { audio } from '/src/engine/audio/audio.js';
window.audio = audio;
window.__ready = true;
</script>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(PAGE);
  }
  const file = path.join(root, url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

/** Runs inside the page. Returns a plain-JSON report. */
async function inPage() {
  const report = { errors: [], notes: [] };
  const fail = (m) => report.errors.push(m);
  window.__warns = [];                                                   // (what the page warns: a sound that is not made yet must be silent, not a warning)
  const ow = console.warn.bind(console);
  console.warn = (...a) => { window.__warns.push(a.join(' ')); ow(...a); };
  const A = window.audio;
  const tryCall = (label, fn) => {
    try { return fn(); } catch (e) { fail(`${label} threw: ${e && e.message}`); return undefined; }
  };

  // 1. before init: everything must be a silent no-op
  tryCall('pre-init sfx', () => A.sfx('jump'));
  const preLoop = tryCall('pre-init loop', () => A.loop('glide_loop'));
  tryCall('pre-init loop.set/stop', () => { preLoop.set({ vol: 0.5 }); preLoop.stop(); });
  tryCall('pre-init music', () => { A.startMusic(); A.setDay(0.4); A.stopMusic(); });
  tryCall('pre-init stinger/duck/muffle/volumes/mute', () => { A.stinger('lantern'); A.duck(0.5, 1); A.setMuffled(true); A.setVolumes({ master: 1 }); A.setMuted(false); });
  tryCall('pre-init resume', () => A.resume());
  if (A.ready !== false) fail('ready should be false before init');

  // 2. init, with progress + main-thread responsiveness measurement
  const progress = [];
  const longTasks = [];
  let obs = null;
  try {
    obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) longTasks.push(e.duration); });
    obs.observe({ entryTypes: ['longtask'] });
  } catch (e) { report.notes.push('longtask observer unavailable'); }
  let maxGap = 0;
  let last = performance.now();
  let alive = true;
  (function tick() {
    const n = performance.now();
    maxGap = Math.max(maxGap, n - last);
    last = n;
    if (alive) setTimeout(tick, 0);
  })();
  const t0 = performance.now();
  await A.init((p) => progress.push(p));
  const initMs = performance.now() - t0;
  alive = false;
  if (obs) obs.disconnect();
  report.initMs = initMs;
  report.maxLongTaskMs = longTasks.length ? Math.max(...longTasks) : 0;
  report.longTasks = longTasks.length;
  report.maxLoopGapMs = maxGap;
  report.progressCalls = progress.length;
  if (!A.ready) fail('ready is false after init');
  if (progress[progress.length - 1] !== 1) fail('final progress is not 1');
  for (let i = 1; i < progress.length; i++) if (progress[i] < progress[i - 1]) { fail('progress not monotonic'); break; }
  if (progress.some((p) => p < 0 || p > 1)) fail('progress out of range');
  const again = A.init(() => {});
  if (!(again instanceof Promise)) fail('init() should return a promise');
  await again; // idempotent
  const dbg = A._debug;
  report.buffers = dbg.buffers.length;
  report.ctxState = A.context && A.context.state;
  report.ctxRate = A.context && A.context.sampleRate;
  report.baseLatency = A.context && A.context.baseLatency;
  const lazy = A.lazyNames;                                              // (the Guardian's: made by load(), not by init())
  const expectNames = [...A.sfxNames.filter((n) => n !== 'footstep' && !lazy.includes(n)), ...A.loopNames, 'gloaming', 'daybreak', 'amb_dusk', 'amb_day', ...A.stingerNames.map((n) => 'stinger_' + n)];
  const missing = expectNames.filter((n) => !dbg.buffers.includes(n));
  if (missing.length) fail('missing buffers: ' + missing.join(','));
  if (!lazy.length) fail('no lazy sounds');
  if (lazy.some((n) => dbg.buffers.includes(n))) fail('lazy sounds were made at start-up: ' + lazy.filter((n) => dbg.buffers.includes(n)).join(','));
  if (!dbg.buffers.includes('guardian_stoop')) fail('the gate\'s rumble (guardian_stoop) must be made at start-up: Dawnhaven plays it');

  // 3. tap the final node so we can see whether sound really reaches the output
  const ctx = A.context;
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  dbg.nodes.shaper.connect(an);
  const buf = new Float32Array(an.fftSize);
  const sample = () => { an.getFloatTimeDomainData(buf); let pk = 0, s = 0; for (const v of buf) { pk = Math.max(pk, Math.abs(v)); s += v * v; } return { pk, rms: Math.sqrt(s / buf.length) }; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let maxPeak = 0;
  const watch = async (ms) => { let mx = { pk: 0, rms: 0 }; const end = performance.now() + ms; while (performance.now() < end) { const s = sample(); mx = { pk: Math.max(mx.pk, s.pk), rms: Math.max(mx.rms, s.rms) }; await sleep(8); } maxPeak = Math.max(maxPeak, mx.pk); return mx; };
  await A.resume();
  report.clockAdvances = await (async () => { const a = ctx.currentTime; await sleep(150); return ctx.currentTime > a; })();

  // 3b. the lazy sounds: silence (and no warning) until load() has made them, then they play; load() is idempotent and reports 0..1
  const warned = () => (window.__warns || []).filter((w) => /guardian_/.test(w));
  tryCall('sfx of a lazy sound before load', () => A.sfx('guardian_roar'));
  if (warned().length) fail('a lazy sound that is not made yet warned: ' + warned().join(' | '));
  const lp = [];
  const t1 = performance.now();
  await A.load('guardian', (p) => lp.push(p));
  report.lazyMs = performance.now() - t1;
  if (!lp.length || lp[lp.length - 1] !== 1) fail('load() did not report its end (' + lp.slice(-3).join(',') + ')');
  for (let i = 1; i < lp.length; i++) if (lp[i] < lp[i - 1]) { fail('load() progress not monotonic'); break; }
  const miss2 = lazy.filter((n) => !A._debug.buffers.includes(n));
  if (miss2.length) fail('lazy sounds missing after load(): ' + miss2.join(','));
  const lp2 = [];
  await A.load('guardian', (p) => lp2.push(p));
  if (lp2.length) fail('a second load() made the sounds again');
  const v0 = A._debug.voicesTotal;
  tryCall('sfx of a lazy sound after load', () => A.sfx('guardian_slam'));
  if (!(A._debug.voicesTotal > v0)) fail('a lazy sound does not play after load()');
  tryCall('load of an unknown group', () => A.load('nope'));

  // 4. music, day/night crossfade (equal power), controls
  tryCall('startMusic', () => A.startMusic());
  tryCall('startMusic twice', () => A.startMusic());
  const music0 = await watch(700);
  report.musicRms = music0.rms;
  if (!(music0.rms > 0.005)) fail(`music produced no signal at the output (rms ${music0.rms})`);
  const powers = [];
  for (const d of [0, 0.25, 0.5, 0.75, 1]) {
    tryCall('setDay', () => A.setDay(d));
    await sleep(1600); // let the smoothing settle (time constant 0.15 s / 0.25 s)
    const g = A._debug.gains;
    powers.push({ d, night: g.gloaming, day: g.daybreak, sum: g.gloaming ** 2 + g.daybreak ** 2 });
  }
  report.crossfade = powers;
  for (const p of powers) if (Math.abs(p.sum - 1) > 0.03) fail(`crossfade not equal-power at day=${p.d}: cos^2+sin^2=${p.sum.toFixed(3)}`);
  if (powers[0].day > 0.02 || powers[4].night > 0.02) fail('crossfade endpoints wrong');
  for (let i = 0; i < 120; i++) { A.setDay(i / 119); await sleep(4); } // per-frame-style spam must not throw
  tryCall('duck', () => A.duck(0.6, 0.4));
  tryCall('setMuffled on', () => A.setMuffled(true));
  await sleep(300);
  report.mufFreq = A._debug.nodes.muffle.frequency.value;
  tryCall('setMuffled off', () => A.setMuffled(false));
  tryCall('setVolumes', () => A.setVolumes({ master: 0.8, music: 0.9, sfx: 0.7 }));
  tryCall('setVolumes subset', () => A.setVolumes({ sfx: 1 }));
  tryCall('setMuted', () => A.setMuted(true));
  if (A.muted !== true) fail('muted getter');
  tryCall('sfx while muted', () => A.sfx('jump'));
  tryCall('setMuted off', () => A.setMuted(false));
  if (A.muted !== false) fail('muted getter (off)');

  // 5. every sfx name (varied opts), loops, stingers
  const names = A.sfxNames;
  let idx = 0;
  for (const n of names) tryCall('sfx ' + n, () => A.sfx(n, { vol: 0.8, pitch: 0.9 + (idx++ % 5) * 0.05, pan: ((idx % 7) - 3) / 3, jitter: 0.03 }));
  tryCall('sfx unknown', () => A.sfx('does_not_exist'));
  tryCall('sfx no opts', () => A.sfx('gem_red'));
  const loopReports = [];
  for (const n of A.loopNames) {
    const h = tryCall('loop ' + n, () => A.loop(n, { vol: 0.7, pitch: 1, pan: 0 }));
    tryCall('loop.set ' + n, () => h.set({ vol: 1, pitch: 1.1, pan: 0.4 }));
    loopReports.push(h);
  }
  const unk = tryCall('loop unknown', () => A.loop('nope'));
  tryCall('loop unknown handle', () => { unk.set({ vol: 1 }); unk.stop(); });
  const loudLoops = await watch(500);
  for (const h of loopReports) tryCall('loop.stop', () => h.stop(0.05));
  tryCall('loop.stop twice', () => loopReports[0].stop());
  for (const n of A.stingerNames) tryCall('stinger ' + n, () => A.stinger(n));
  tryCall('stinger unknown', () => A.stinger('nope'));
  report.voicesAfterAll = A._debug.voices;
  await sleep(300);

  // 6. burst stress: 200 gem triggers in one turn must not exceed the pool cap or full scale
  await A.resume();
  for (let i = 0; i < 200; i++) A.sfx(['gem_red', 'gem_green', 'gem_blue', 'gem_gold', 'gem_purple'][i % 5], { pitch: 1 + (i % 9) * 0.02, pan: (i % 5) / 2 - 1, jitter: 0.02 });
  report.voicesInBurst = A._debug.voices;
  const burst = await watch(500);
  report.burstPeak = burst.pk;
  if (report.voicesInBurst > 48) fail('voice cap exceeded: ' + report.voicesInBurst);
  if (burst.pk > 1.0001) fail('burst exceeded full scale: ' + burst.pk);
  report.maxPeakSeen = maxPeak;
  report.sfxLoudPeak = loudLoops.pk;
  tryCall('stopMusic', () => A.stopMusic(0.2));
  await sleep(500);
  tryCall('startMusic after stop', () => A.startMusic());
  await sleep(200);
  tryCall('stopMusic 2', () => A.stopMusic(0));

  // 7. pause-menu muffle: world sounds are low-passed, UI sounds bypass the filter
  await sleep(2200); // let every voice from the burst finish
  // short sounds are easy to under-sample, so take the loudest short-window RMS over three triggers
  const peakOf = async (name, opts) => { let best = 0; for (let k = 0; k < 3; k++) { await sleep(250); A.sfx(name, opts); best = Math.max(best, (await watch(200)).rms); } return best; };
  tryCall('setMuffled(false)', () => A.setMuffled(false));
  await sleep(500);
  const uiOpen = await peakOf('ui_move', { vol: 1 });
  const gemOpen = await peakOf('gem_red', { vol: 1 });
  tryCall('setMuffled(true)', () => A.setMuffled(true));
  await sleep(700);
  const uiMuf = await peakOf('ui_move', { vol: 1 });
  const gemMuf = await peakOf('gem_red', { vol: 1 });
  tryCall('setMuffled(false) again', () => A.setMuffled(false));
  report.muffle = { uiOpen, uiMuf, gemOpen, gemMuf };
  if (!(uiOpen > 0.05 && gemOpen > 0.05)) fail('unmuffled sfx not seen at the output');
  else {
    if (uiMuf < uiOpen * 0.7) fail(`UI sound was muffled (${uiMuf.toFixed(3)} vs ${uiOpen.toFixed(3)})`);
    if (gemMuf > gemOpen * 0.6) fail(`world sound was not muffled (${gemMuf.toFixed(3)} vs ${gemOpen.toFixed(3)})`);
  }
  return report;
}

/** Runs inside a fresh page: a place that asks for its sounds before the audio is up (the title's TRAVEL, a tap after the click that started it) is not left silent: init() makes them once it has the rest. */
async function inPageWanted(mode) {
  const A = window.audio, errors = [];
  const fail = (m) => errors.push(m);
  if (mode === 'before') {
    await A.load('guardian', () => fail('a load() before init() reported progress'));
    if (A.ready) fail('ready before init');
    await A.init(() => {});
  } else {
    const p = A.init(() => {});
    await new Promise((r) => setTimeout(r, 400));                       // (init() is under way: its jobs are being rendered)
    if (A.ready) fail('init() was over before the test could ask');
    await A.load('guardian', () => {});
    await p;
  }
  if (!A.ready) fail('not ready after init');
  const missing = A.lazyNames.filter((n) => !A._debug.buffers.includes(n));
  if (missing.length) fail('sounds asked for ' + mode + ' init() were not made: ' + missing.join(','));
  return errors;
}

const results = [];
let failed = false;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
for (let run = 0; run < runs; run++) {
  const page = await browser.newPage();
  const consoleMsgs = [];
  page.on('console', (m) => consoleMsgs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  await page.mouse.click(10, 10); // a real user gesture, as PRESS START would be
  const report = await page.evaluate(inPage);
  const bad = consoleMsgs.filter((m) => /^(error|pageerror)/.test(m));
  const warns = consoleMsgs.filter((m) => /^warning/.test(m));
  // (the sounds of a place that asks for them before the audio is up, and while it is coming up)
  for (const mode of ['before', 'during']) {
    const p2 = await browser.newPage();
    await p2.goto(`http://127.0.0.1:${port}/`);
    await p2.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
    await p2.mouse.click(10, 10);
    const errs = await p2.evaluate(inPageWanted, mode);
    if (errs.length) report.errors.push(...errs);
    await p2.close();
  }
  report.consoleErrors = bad;
  report.consoleWarnings = warns;
  if (bad.length) report.errors.push(...bad.map((b) => 'console ' + b));
  if (warns.length) report.notes.push(...warns.map((w) => 'console ' + w));
  if (report.errors.length) failed = true;
  results.push(report);
  await page.close();
}
await browser.close();
server.close();

if (asJson) console.log(JSON.stringify(results, null, 2));
else {
  results.forEach((r, i) => {
    console.log(`run ${i + 1}: init ${r.initMs.toFixed(0)} ms | progress calls ${r.progressCalls} | longest task ${r.maxLongTaskMs.toFixed(0)} ms (${r.longTasks} long) | longest event-loop gap ${r.maxLoopGapMs.toFixed(0)} ms`);
    console.log(`  context ${r.ctxState} @ ${r.ctxRate} Hz, base latency ${r.baseLatency ? (r.baseLatency * 1000).toFixed(1) + ' ms' : 'n/a'}, ${r.buffers} buffers, clock advances: ${r.clockAdvances}`);
    console.log(`  music rms at output ${r.musicRms.toFixed(3)}, burst: ${r.voicesInBurst} voices, peak ${r.burstPeak.toFixed(3)}, max peak seen ${r.maxPeakSeen.toFixed(3)}, muffle freq ${Math.round(r.mufFreq)} Hz`);
    console.log(`  muffle test (loudest RMS at output): ui_move ${r.muffle.uiOpen.toFixed(3)} -> ${r.muffle.uiMuf.toFixed(3)} (bypasses), gem_red ${r.muffle.gemOpen.toFixed(3)} -> ${r.muffle.gemMuf.toFixed(3)} (filtered)`);
    console.log('  crossfade (day, gloaming gain, daybreak gain, power): ' + r.crossfade.map((p) => `${p.d}: ${p.night.toFixed(3)}/${p.day.toFixed(3)}/${p.sum.toFixed(3)}`).join('  '));
    if (r.notes.length) console.log('  notes: ' + r.notes.join(' | '));
    console.log(r.errors.length ? '  FAILURES:\n    ' + r.errors.join('\n    ') : '  all checks passed');
  });
}
process.exit(failed ? 1 : 0);
