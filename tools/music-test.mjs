// The songs in the running game, end to end: every world has its own song, it is made behind the loading bar of the world (TUNING THE BAND) and not before, it plays while the hero is there,
// the song of the world he has left is kept for his return and the one before it is freed, the ambience of the world follows its score (the Court's storm has no crickets), and a hop within a world
// leaves the music alone.
//   node tools/music-test.mjs [world ...]     (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=file:///.../docs/index.html tests a built file instead)
// The worlds are visited in the order given (default: all of them, Vale first); each is entered the way the TRAVEL menu does it (the world is built the real way, behind its loading bar).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { travelPlaces } from '../src/game/travel.js';

const BASE = process.env.GV_URL || 'http://127.0.0.1:5173/';
const WORLDS = process.argv.slice(2).length ? process.argv.slice(2) : ['gloaming', 'home', 'frostbloom', 'home', 'emberfall', 'skyweaver', 'tideglass', 'home', 'guardian', 'gloaming'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message.slice(0, 300)); });
page.on('console', (m) => {
  if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) { errors.push(m.text()); console.log('[error]', m.text().slice(0, 300)); }
  if (m.type() === 'warning' && /\[audio\]/.test(m.text())) { errors.push(m.text()); console.log('[audio warning]', m.text().slice(0, 300)); }
});
const ev = (fn, arg) => page.evaluate(fn, arg);
const ff = (sec) => ev((s) => { for (let t = 0; t < s; t += 1 / 30) window.__app.update(1 / 30); }, sec);
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : detail); };

const first = WORLDS[0];
await page.goto(`${BASE}?world=${first}&skip=1&preserve=1`);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
const boot = await ev(() => window.__error);
if (boot) throw new Error('boot error: ' + String(boot).slice(0, 300));
await page.focus('canvas').catch(() => {});
await ev(() => {
  const a = window.__app;
  window.__labels = new Set();
  const upd = a.update.bind(a);
  a.update = (dt) => { if (a.state === 'traveling' && a.load) window.__labels.add(a.load.label); return upd(dt); };
  a.unlockAudio();
});
await page.waitForFunction(() => window.__app.audio && window.__app.audio.ready, null, { timeout: 180000 });
await ff(1.5);

const snap = () => ev(() => {
  const A = window.__app.audio, d = A._debug;
  return { song: A.song, playing: d.playing, made: d.songsMade.slice().sort(), gains: d.gains, day: d.day, labels: [...window.__labels], realm: window.__game.realm.id };
});
const settle = async () => {
  for (let i = 0; i < 400; i++) { await ff(0.25); if (await ev(() => window.__app.state === 'play' && !window.__app.travel)) return; }
  throw new Error('the trip never ended');
};

let s = await snap();
check(`${first}: the song of the world the game begins in plays`, s.song === first && s.playing === first && s.made.length === 1 && s.made[0] === first, JSON.stringify({ song: s.song, playing: s.playing, made: s.made }));
const visited = [first];                                                 // worlds in the order he was in them (the last is where he is)
for (const id of WORLDS.slice(1)) {
  const cached = (await snap()).made.includes(id);
  await ev(() => { window.__labels.clear(); });
  const t0 = Date.now();
  await ev((w) => window.__app.travelTo(w, { from: window.__game.realm.id === 'home' ? 'home' : null }), id);
  await settle();
  await ff(2.5);                                                          // (the crossfade is 1.6 s)
  s = await snap();
  visited.push(id);
  const where = `${id} (${((Date.now() - t0) / 1000).toFixed(0)} s)`;
  check(`${where}: he is there`, s.realm === id, s.realm);
  check(`${where}: its song plays`, s.song === id && s.playing === id, JSON.stringify({ song: s.song, playing: s.playing }));
  if (cached) check(`${where}: the song was kept, so no TUNING THE BAND`, !s.labels.includes('TUNING THE BAND'), s.labels.join(','));
  else check(`${where}: the song was made behind the loading bar (TUNING THE BAND)`, s.labels.includes('TUNING THE BAND'), s.labels.join(','));
  if (id === 'guardian') check(`${where}: the Court's sounds are made behind its bar too`, s.labels.includes('TUNING THE COURT'), s.labels.join(','));
  const keep = new Set([id, visited[visited.length - 2]]);
  check(`${where}: only this song and the one he came from are kept`, s.made.length === keep.size && s.made.every((m) => keep.has(m)), `made ${s.made.join(',')}`);
  // the dawn of a song is made after he has come in, between the frames, and joins the dusk that plays
  await ev((w) => window.__app.audio.whenSongComplete(w), id);
  const fin = await ev((w) => { const A = window.__app.audio; return { complete: A.songComplete(w), gains: A._debug.gains }; }, id);
  const wantTwo = id !== 'home';
  check(`${where}: the dawn was made while he played and joins the song`, fin.complete && (!wantTwo || (fin.gains && fin.gains.song_dusk != null && fin.gains.song_dawn != null)), JSON.stringify(fin));
  if (id === 'guardian') {
    await ev(() => { window.__app.audio.setDay(0); });
    await ff(1.5);
    const g = (await snap()).gains;
    check(`${where}: no crickets in the Court's storm (the ambience follows the score)`, g && g.amb_dusk < 0.05, JSON.stringify(g));
  }
}

// a hop within the world (the TRAVEL menu to a place of the world he is in) leaves the music alone
const here = (await snap()).realm;
const before = await snap();
const place = travelPlaces(here)[0];
await ev((pl) => { window.__app.travelTo(window.__game.realm.id, { at: pl }); }, place);
await settle();
await ff(1);
const after = await snap();
check(`${here}: a hop within the world leaves the music alone`, after.playing === before.playing && JSON.stringify(after.made) === JSON.stringify(before.made), `${before.playing} -> ${after.playing}`);

check('no page errors, no audio warnings', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
