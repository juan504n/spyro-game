// The loading screen between worlds (src/game/loadscreen.js), in the running game: a trip to another world shows the sky of the place he is going to with the hero gliding over it and the gems he found
// arcing into an open chest, the treasure counting up; it stays long enough for the gems to be seen, goes to white, and the new world arrives. Played with the real loop (the page runs itself).
//   node tools/loadscreen-test.mjs      (needs the dev server on :5173, GV_HMR=0 recommended)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.env.GV_URL || 'http://127.0.0.1:5173/';
const PROGRESS_KEY = 'gloaming-vale/progress/v1';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : detail); };

async function open(url, progress) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  if (progress) await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* no storage */ } }, [PROGRESS_KEY, progress]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) { errors.push(m.text()); console.log('[error]', m.text().slice(0, 300)); } });
  await page.goto(base + url);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error('boot error: ' + String(err).slice(0, 300));
  await page.waitForTimeout(1500);
  return { ctx, page };
}

/** go through a trip and note what the loading screen was: sampled every 150 ms until he has arrived */
async function trip(page, go) {
  await page.evaluate(go);
  const seen = { frames: 0, ls: false, title: null, treasure: null, shown: [], pile: 0, gems: 0, maxT: 0, minT: null, sky: false, fadeEnd: 0, scene: null };
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const s = await page.evaluate(() => {
      const a = window.__app, tr = a.travel, ls = tr && tr.ls;
      return { state: a.state, phase: tr && tr.phase, ls: ls ? { title: ls.title, treasure: ls.treasure, total: ls.total, shown: ls.shown, pile: ls.pile.count, gems: ls.pool.filter((g) => g.alive).length, t: ls.t, minT: ls.minT, sky: !!ls.sky && ls.sky.painted, fade: ls.fade, own: a.scene === ls.scene } : null };
    });
    if (s.ls) { seen.ls = true; seen.frames++; seen.title = s.ls.title; seen.treasure = s.ls.treasure; seen.total = s.ls.total; seen.shown.push(s.ls.shown); seen.pile = Math.max(seen.pile, s.ls.pile); seen.gems = Math.max(seen.gems, s.ls.gems); seen.maxT = Math.max(seen.maxT, s.ls.t); seen.minT = s.ls.minT; seen.sky = s.ls.sky; seen.own = s.ls.own; seen.fadeEnd = s.ls.fade; }
    if (s.state === 'play' && !s.phase && seen.ls) break;
    await page.waitForTimeout(150);
  }
  return seen;
}

// 1: from a realm with gems found, home: "RETURNING HOME...", the treasure found counted up to what was found
{
  const { ctx, page } = await open('?world=frostbloom&preserve=1&skip=1');
  const seen = await trip(page, () => { window.__game.stats.gems = 137; window.__app.travelTo('home'); });
  check('a trip to another world shows the loading screen', seen.ls && seen.frames >= 3, `(${seen.frames} samples)`);
  check('... it says where he goes: RETURNING HOME... (from a realm, to Dawnhaven)', seen.title === 'RETURNING HOME...', `(${seen.title})`);
  check('... it is a scene of its own (the app draws it while the world is built), with a painted sky', seen.own === true && seen.sky === true);
  check('... the treasure found is what he found: 137', seen.treasure === 137, `(${seen.treasure})`);
  const up = seen.shown.every((v, i) => i === 0 || v >= seen.shown[i - 1]);
  check('... the count climbs, never falls, and reaches 137 (before he goes)', up && Math.max(...seen.shown) === 137 && seen.shown[0] < 137, `(${seen.shown.slice(0, 6).join(',')} ... ${Math.max(...seen.shown)})`);
  check('... gems are in the air and the chest fills (the gems that land lie in it)', seen.gems > 0 && seen.pile > 9, `(${seen.gems} in the air, ${seen.pile} in the chest)`);
  check('... it stays long enough for the gems to be seen (at least 2 s with treasure) and ends in white', seen.maxT >= 2 && seen.fadeEnd > 0.5, `(${seen.maxT.toFixed(1)} s, fade ${seen.fadeEnd.toFixed(2)})`);
  const now = await page.evaluate(() => ({ state: window.__app.state, realm: window.__game.realm.id, scene: window.__app.scene === window.__game.scene, travel: !!window.__app.travel }));
  check('... and then he is in Dawnhaven, playing, with the world\'s own scene again', now.state === 'play' && now.realm === 'home' && now.scene && !now.travel, JSON.stringify(now));
  await ctx.close();
}

// 2: into a world from the title (nothing found): ENTERING ..., and the total treasure he has saved
{
  const { ctx, page } = await open('?preserve=1', { realms: { gloaming: { done: true, gems: 400, gemsTotal: 700, time: 600 }, frostbloom: { done: true, gems: 250, gemsTotal: 500, time: 600 } }, home: { visits: 1, secrets: [] } });
  const seen = await trip(page, () => { window.__app.travelTo('tideglass', { from: null, at: { id: 'quay', name: 'THE HARBOUR QUAY', x: 0, z: 0, yaw: 0, world: 'tideglass' } }); });
  check('into a world: ENTERING TIDEGLASS REACH...', seen.title === 'ENTERING TIDEGLASS REACH...', `(${seen.title})`);
  check('... nothing was found here: it shows the TOTAL he has saved (650), counted up', seen.treasure === 0 && seen.total === 650 && Math.max(...seen.shown) === 650, `(found ${seen.treasure}, total ${seen.total}, shown to ${Math.max(...seen.shown)})`);
  check('... and it stays long enough for the count to get there (2 s)', seen.maxT >= 2, `(${seen.maxT.toFixed(1)} s)`);
  await ctx.close();
}

check('no page errors, no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall loading screen checks passed');
process.exit(failed ? 1 : 0);
