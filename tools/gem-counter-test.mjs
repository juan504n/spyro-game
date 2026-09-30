// Gem counter regression test: the floating, bouncing 3D gem count that pops up in the corner after every pickup.
//   node tools/gem-counter-test.mjs      (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=file:///.../docs/index.html tests a built file instead)
// Part 1 looks at real rendered frames (the numerals are drawn over the world, and gone again afterwards);
// part 2 drives the state machine: show / hold / fade, digit slots, hop height, rollover, HUD off, geometry.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto((process.env.GV_URL || 'http://127.0.0.1:5173/') + '?skip=1&preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
await page.addScriptTag({ path: path.join(here, 'bot-inject.js') });
await page.waitForTimeout(1200);

await page.evaluate(() => {
  const B = __bot, g = __game, p = g.player;
  B.install(); B.god();
  B.place(-100, 50, 0);
  // a real pickup: the same path a gem takes when it reaches Spyro (score, sound, HUD pulse, counter)
  window.__pick = (v = 1) => { const it = g.gems._add(p.x, p.y + 20, p.z, v, true); g.gems._collect(it, g); };
});

// ---- part 1: pixels ---------------------------------------------------------------------------------------------------------
// (every comparison is between two frames of the very same instant, the overlay pass forced on or off: the world itself
// keeps moving between ticks, so a frame from before the pickup would differ everywhere)
const frame = async (overlay) => {         // the finished picture after two real frames (overlay: force the pass on / off)
  await page.evaluate((o) => { if (o !== undefined) __game.counter.overlay.visible = o; }, overlay);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const s = await page.evaluate(() => __gv.snapshot());
  return { w: s.w, h: s.h, d: Buffer.from(s.b64, 'base64') };
};
const changed = (a, b) => {                // pixels in the counter's corner (HUD px x 80..190, y 4..50) that differ clearly
  const k = a.h / 240;
  let n = 0;
  for (let y = Math.floor(4 * k); y < Math.ceil(50 * k); y++) {
    for (let x = Math.floor(80 * k); x < Math.ceil(190 * k); x++) {
      const i = (y * a.w + x) * 4;
      if (Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]) > 90) n++;
    }
  }
  return n;
};
const noise = changed(await frame(), await frame());
await page.evaluate(() => { __pick(1); __bot.tick(20); });                                    // "1"
const oneOn = await frame(), oneOff = await frame(false);
await page.evaluate(() => { __game.stats.gems = 199; __pick(1); __bot.tick(30); });         // "200"
const threeOn = await frame(), threeOff = await frame(false);
await page.evaluate(() => __bot.tick(240));                                                   // (long gone by now)
const goneOff = await frame(), goneOn = await frame(true);                                    // ... even with the pass forced on
const px = { noise, one: changed(oneOn, oneOff), three: changed(threeOn, threeOff), gone: changed(goneOn, goneOff) };

// ---- part 2: behaviour ------------------------------------------------------------------------------------------------------
const r = await page.evaluate(() => {
  const B = __bot, g = __game, C = g.counter;
  const out = {};
  const vis = () => C.slots.filter((s) => s.g.visible).length;
  const chars = () => C.slots.filter((s) => s.g.visible).map((s) => s.ch).reverse().join('');
  const state = () => ({ show: +C.show.toFixed(2), visible: C.root.visible, overlay: C.overlay.visible, digits: C.digits });
  g.stats.gems = 0;
  C.show = C.hold = 0; C.root.visible = C.overlay.visible = false; C.digits = '';
  C.slots.forEach((s) => { s.g.visible = s.sg.visible = false; s.ch = ''; });
  B.tick(10);
  out.start = state();

  // 1. a pickup shows the count, in the right slots
  __pick(1);
  B.tick(20);
  out.first = { ...state(), gems: g.stats.gems, slots: vis(), text: chars() };

  // 2. it stays up for a couple of seconds after the last pickup, then fades away
  B.tick(100);                                                        // 2.0 s after the pickup
  out.at2s = state();
  B.tick(60);                                                         // 3.0 s
  out.at3s = state();

  // 3. it comes back with the next pickup; a pickup while it is up keeps it up
  __pick(1);
  B.tick(10);
  out.again = { ...state(), text: chars() };
  B.tick(120);                                                        // 2.2 s since the last pickup: nearly gone
  __pick(1);
  B.tick(90);                                                         // 1.5 s later: still there (it would have faded after 2.9 s)
  out.rearmed = { ...state(), text: chars() };
  B.tick(200);

  // 4. a single pickup hops the units digit, but never past the cap; quick runs of pickups stay under it too
  __pick(1);
  let single = 0;
  for (let i = 0; i < 60; i++) { B.tick(1); single = Math.max(single, C.slots[0].y); }
  let burst = 0;
  for (let i = 0; i < 90; i++) { if (i % 3 === 0) __pick(1); B.tick(1); for (const s of C.slots) burst = Math.max(burst, s.y); }
  out.hop = { single: +single.toFixed(2), burst: +burst.toFixed(2) };
  B.tick(200);

  // 5. digits roll over: 99 -> 100 -> 1000 (three, then four digits); more than four keeps the last four
  g.stats.gems = 98;
  __pick(1); B.tick(30);
  out.n99 = { slots: vis(), text: chars() };
  __pick(1); B.tick(30);
  const geoOf = (s) => C.geos.indexOf(s.mesh.geometry);
  out.n100 = { slots: vis(), text: chars(), geos: C.slots.slice(0, 3).map(geoOf), fourthHidden: !C.slots[3].g.visible };
  g.stats.gems = 999; __pick(1); B.tick(30);
  out.n1000 = { slots: vis(), text: chars() };
  g.stats.gems = 12344; __pick(1); B.tick(30);
  out.n12345 = { slots: vis(), text: chars() };
  g.stats.gems = 7; B.tick(3);                                         // changed without a pickup (a reset): the number follows
  out.reset = { slots: vis(), text: chars() };
  B.tick(240);

  // 6. HUD hidden (title, cinematics): it goes away quickly, and does not flash back when the HUD returns
  __pick(1); B.tick(15);
  g.hud.visible = false;
  B.tick(20);
  out.hudOff = state();
  g.hud.visible = true;
  let flash = 0;
  for (let i = 0; i < 40; i++) { B.tick(1); flash = Math.max(flash, C.show); }
  out.hudBack = { ...state(), flash: +flash.toFixed(3) };

  // 7. the numerals' geometry is sound
  out.geo = C.geos.map((geo, d) => {
    const pos = geo.attributes.position.array, nrm = geo.attributes.normal ? geo.attributes.normal.array : [];
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    return { d, tris: pos.length / 9, finite: Array.from(pos).every(Number.isFinite) && Array.from(nrm).every(Number.isFinite),
      r: +geo.boundingSphere.radius.toFixed(1), cx: +((bb.min.x + bb.max.x) / 2).toFixed(1), cy: +((bb.min.y + bb.max.y) / 2).toFixed(1), h: +(bb.max.y - bb.min.y).toFixed(1) };
  });
  return out;
});
console.log(JSON.stringify({ px, ...r, geo: r.geo.map((x) => `${x.d}:${x.tris}t r${x.r} c(${x.cx},${x.cy}) h${x.h}`) }, null, 1));

const hop = r.hop, geo = r.geo;
const ok = px.noise < 60 && px.one > 250 && px.three > px.one * 1.5 && px.gone < 60                         // drawn over the world, then gone
  && !r.start.visible && !r.start.overlay && r.start.show === 0                                             // hidden until the first pickup
  && r.first.visible && r.first.overlay && r.first.show > 0.95 && r.first.slots === 1 && r.first.text === String(r.first.gems)
  && r.at2s.visible && r.at2s.show > 0.95                                                                    // held for a couple of seconds
  && !r.at3s.visible && !r.at3s.overlay                                                                     // ... then gone (and the overlay pass is skipped)
  && r.again.visible && r.again.text === '2' && r.rearmed.visible && r.rearmed.show > 0.95 && r.rearmed.text === '3'
  && hop.single > 6 && hop.single < 13.5 && hop.burst < 13.5                                                 // it hops, but never off the top of the screen
  && r.n99.text === '99' && r.n100.text === '100' && r.n100.slots === 3 && r.n100.fourthHidden && r.n100.geos.join() === '0,0,1'
  && r.n1000.text === '1000' && r.n1000.slots === 4 && r.n12345.text === '2345' && r.n12345.slots === 4
  && r.reset.text === '7' && r.reset.slots === 1
  && !r.hudOff.visible && r.hudOff.show === 0 && r.hudBack.flash === 0 && !r.hudBack.visible                 // no flash when the HUD comes back
  && geo.length === 10 && geo.every((x) => x.finite && x.tris > 40 && x.r > 8 && x.r < 20 && x.h > 18 && x.h < 27 && Math.abs(x.cx) < 4 && Math.abs(x.cy) < 2);
console.log(ok ? 'PASS  the gem counter shows, hops, rolls over, holds, fades and hides as designed' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
