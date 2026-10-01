// Touch layout test (no browser, no dev server): where the game frame sits in a window, and where the MENU button goes.
//   node tools/touch-layout-test.mjs
// Held upright, a touch screen (phone, tablet) keeps the 4:3 picture at the TOP of the window, below the platform's top safe area (a notch, or the header of an app that shows the page under it): centred, a phone's
// small picture floated in the middle of the screen. The MENU button sits centred under the picture, in the black that is left for the thumbs. Where the window leaves no room (a landscape window: the picture fills it) the
// button sits on the picture's top edge instead, below the inset, and the title and the menus keep clear of it. Everything else (desktop windows, landscape windows) is laid out exactly as before.
import * as THREE from 'three';
import { frameLayout, frameBox, TOUCH_TOP_MARGIN, DEFAULT_SETTINGS } from '../src/engine/gfx.js';
import { MENU_BTN_H, MENU_BTN_W, MENU_BELOW_GAP, PADS, padRect, menuButtonPlace } from '../src/game/input.js';
import { touchClear } from '../src/game/menu.js';

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

/** the frame layout as it was before the touch layout existed (the reference: every window it covered must come out the same) */
function oldLayout(devW, devH, s) {
  const H = s.height;
  let W, scale, rect;
  const wide = s.display === 'wide' && devW / devH > 4 / 3;
  if (wide) {
    const sInt = Math.floor(devH / H);
    const useInt = sInt >= 1 && (s.scaling === 'integer' || (s.scaling === 'auto' && (sInt * H) / devH >= 0.82));
    if (useInt) {
      scale = sInt;
      W = THREE.MathUtils.clamp(Math.floor(devW / scale), (H * 4) / 3, H * 2.4);
      W = Math.floor(W / 2) * 2;
      const rw = W * scale, rh = H * scale;
      rect = [Math.floor((devW - rw) / 2), Math.floor((devH - rh) / 2), rw, rh];
    } else {
      scale = devH / H;
      W = THREE.MathUtils.clamp(Math.round(devW / scale), (H * 4) / 3, H * 2.4);
      W = Math.floor(W / 2) * 2;
      rect = [0, 0, devW, devH];
    }
  } else {
    W = Math.round((H * 4) / 3);
    const sMax = Math.min(devW / W, devH / H);
    const sInt = Math.floor(sMax);
    const useInt = sInt >= 1 && (s.scaling === 'integer' || (s.scaling === 'auto' && sInt / sMax >= 0.85));
    scale = useInt ? sInt : sMax;
    const rw = Math.round(W * scale), rh = Math.round(H * scale);
    rect = [Math.floor((devW - rw) / 2), Math.floor((devH - rh) / 2), rw, rh];
  }
  return { W, scale, rect };
}

// ---- 1. nothing changes where it should not ------------------------------------------------------------------------------------------------
{
  const widths = [320, 360, 375, 390, 412, 430, 568, 600, 667, 740, 768, 812, 844, 896, 926, 932, 1024, 1280, 1366, 1440, 1920, 2560];
  const heights = [240, 320, 360, 375, 390, 430, 568, 640, 667, 700, 720, 768, 844, 866, 896, 926, 1024, 1080, 1440];
  let n = 0, desktopDiff = 0, landscapeDiff = 0, portraitMoved = 0, portraitBad = 0, lower = 0;
  for (const dpr of [1, 2, 3]) for (const w of widths) for (const h of heights) for (const display of ['wide', '4:3']) for (const height of [240, 360, 480, 720]) for (const scaling of ['auto', 'integer', 'fill']) {
    const s = { ...DEFAULT_SETTINGS, display, height, scaling }, devW = Math.round(w * dpr), devH = Math.round(h * dpr);
    const old = oldLayout(devW, devH, s), plain = frameLayout(devW, devH, s), touch = frameLayout(devW, devH, s, { touch: true, inset: 74 * dpr, margin: TOUCH_TOP_MARGIN * dpr });
    n++;
    if (JSON.stringify(plain) !== JSON.stringify(old)) desktopDiff++;
    if (devH > devW) {
      // upright on a touch screen: the same picture (size, scale, x), only higher up, never lower than the centred place
      if (touch.W !== old.W || touch.scale !== old.scale || touch.rect[0] !== old.rect[0] || touch.rect[2] !== old.rect[2] || touch.rect[3] !== old.rect[3]) portraitBad++;
      if (touch.rect[1] < old.rect[1]) lower++;                                                       // (y counts from the bottom: a larger y is a higher picture)
      if (touch.rect[1] > old.rect[1]) portraitMoved++;
    } else if (JSON.stringify(touch) !== JSON.stringify(old)) landscapeDiff++;
  }
  check('a desktop window (no touch) is laid out exactly as it was', desktopDiff === 0, `(${n} windows x settings compared, ${desktopDiff} different)`);
  check('a touch window that is not upright (a landscape phone, a tablet on its side) is laid out exactly as it was', landscapeDiff === 0, `(${landscapeDiff} different)`);
  check('held upright, the picture keeps its size, scale and column, and only moves up, never below its centred place', portraitBad === 0 && lower === 0, `(${portraitBad} resized, ${lower} lower than centred; ${portraitMoved} moved up)`);
}

// ---- 2. the picture at the top of an upright touch window ------------------------------------------------------------------------------------
const PHONE = { ...DEFAULT_SETTINGS, display: 'wide', height: 360, scaling: 'auto' };       // (what a touch device starts with)
/** the frame box of a window of w x h CSS px at `dpr`, as Gfx.frameCss() would give it (insets in CSS px) */
const boxOf = (w, h, { dpr = 3, touch = true, top = 0, bottom = 0, right = 0, left = 0 } = {}, s = PHONE) => {
  const devW = Math.round(w * dpr), devH = Math.round(h * dpr);
  const { rect } = frameLayout(devW, devH, s, { touch, inset: top * dpr, margin: TOUCH_TOP_MARGIN * dpr });
  return frameBox(rect, devW, devH, 240, { top, right, bottom, left }, dpr);
};
const PHONES = [['390x844', 390, 844], ['430x866 (the claude.ai app on a big phone)', 430, 866], ['430x932', 430, 932], ['393x852', 393, 852], ['375x667', 375, 667], ['360x640', 360, 640], ['412x915', 412, 915]];
const TABLETS = [['768x1024', 768, 1024], ['834x1194', 834, 1194]];
const INSETS = [0, 20, 47, 59, 74, 120, 400];
{
  let top = 0, up = 0, inside = 0, centred = 0, half = 0, mid = 0, n = 0;
  for (const [, w, h] of [...PHONES, ...TABLETS]) for (const ins of INSETS) {
    const f = boxOf(w, h, { top: ins, bottom: 34 }), c = boxOf(w, h, { touch: false });
    n++;
    const want = Math.min(Math.round((ins + TOUCH_TOP_MARGIN) * 3) / 3, c.top);              // (device px rounded: a third of a CSS px)
    if (Math.abs(f.top - want) > 0.34) top++;
    if (f.top > c.top + 0.01) up++;
    if (f.top < 0 || f.top + f.height > f.winH || !near(f.left + f.width / 2, f.winW / 2, 0.5)) inside++;
    if (ins === 0 && !(f.top < c.top)) centred++;
    if (w <= 500 && ins <= 74 && f.top + f.height / 2 >= f.winH / 2) mid++;
    if (w <= 500 && ins <= 74 && h >= 800 && f.top + f.height > f.winH / 2) half++;
  }
  check('upright: the picture sits just below the platform\'s top inset (inset + 8 px), never lower than the centred place', top === 0 && up === 0, `(${n} windows x insets, ${top} wrong, ${up} lower than centred)`);
  check('... inside the window and centred across it', inside === 0, `(${inside} wrong)`);
  check('... and without an inset it is still above the centred place (8 px from the top)', centred === 0, `(${centred} wrong)`);
  check('... on every phone (insets up to 74 px: a notch, an app\'s header) the picture is centred above the middle of the screen, and on the tall ones (800 px and more) it lies wholly in the upper half', mid === 0 && half === 0, `(${mid} centred below the middle, ${half} reach below it)`);
  const f = boxOf(430, 866, { top: 74, bottom: 34 }), c = boxOf(430, 866, { touch: false });
  check('the 430x866 phone with a 74 px inset: the picture spans y 82 to 405 of 866 (centred it spanned 272 to 594, across the middle)', near(f.top, 82, 0.4) && near(f.top + f.height, 404.7, 0.5) && c.top + c.height > 433 && c.top < 433, `(${f.top.toFixed(1)} to ${(f.top + f.height).toFixed(1)}; centred ${c.top.toFixed(1)} to ${(c.top + c.height).toFixed(1)})`);
}

// ---- 3. the MENU button ------------------------------------------------------------------------------------------------------------------------
const boxHit = (a, b, air = 0) => a.left < b.right + air && a.right > b.left - air && a.top < b.bottom + air && a.bottom > b.top - air;
{
  let n = 0, notBelow = 0, wrongSpot = 0, hitPad = 0, outside = 0, clear = 0;
  for (const [, w, h] of [...PHONES, ...TABLETS]) for (const ins of [0, 20, 47, 59, 74]) for (const sb of [0, 34]) {
    const f = boxOf(w, h, { top: ins, bottom: sb }), p = menuButtonPlace(f);
    n++;
    if (!p.below) notBelow++;
    if (p.x !== Math.round(f.left + f.width / 2) || p.top !== Math.round(f.top + f.height + MENU_BELOW_GAP)) wrongSpot++;
    const box = { left: p.x - MENU_BTN_W / 2, right: p.x + MENU_BTN_W / 2, top: p.top, bottom: p.top + MENU_BTN_H };
    if (Object.keys(PADS).some((k) => boxHit(box, padRect(k, f), 6))) hitPad++;
    if (box.left < 0 || box.right > f.winW || box.bottom > f.winH - sb || box.top < f.top + f.height) outside++;
    if (touchClear(f) !== 8) clear++;
  }
  check('upright (insets up to 74 px), the MENU button goes under the picture: centred, 24 px below its bottom edge', notBelow === 0 && wrongSpot === 0, `(${n} windows x insets x home indicators, ${notBelow} not under it, ${wrongSpot} out of place)`);
  check('... clear of every thumb control (JUMP, FIRE, RAM, CAM, TALK) and above the home indicator, inside the window', hitPad === 0 && outside === 0, `(${hitPad} on a control, ${outside} outside)`);
  check('... and the title and the menus then keep nothing clear for it (the usual 8 lines at the top of the picture)', clear === 0, `(${clear} different)`);
  // a small phone that reports an absurd inset (400 px) has no room left under its picture: the button falls back to the picture's top edge instead of landing on a thumb control
  const crowded = boxOf(375, 667, { top: 400, bottom: 34 }), pc = menuButtonPlace(crowded);
  check('no room under the picture (a 375x667 phone reporting a 400 px inset): the button sits on the picture\'s top edge instead', !pc.below && pc.top >= crowded.top, `(picture ${crowded.top.toFixed(0)} to ${(crowded.top + crowded.height).toFixed(0)} of ${crowded.winH}; button from y ${pc.top})`);
  const f = boxOf(430, 866, { top: 74, bottom: 34 }), p = menuButtonPlace(f);
  check('the 430x866 phone: the button is at y 429 to 473, centred (the red mark: just under the picture)', p.below && p.x === 215 && p.top === 429, `(x ${p.x}, y ${p.top} to ${p.top + MENU_BTN_H})`);
}
{
  // landscape (and a tablet on its side): the picture fills the window, so the button sits on its top edge, below the inset, and the lines kept clear grow with it
  let n = 0, below = 0, wrongTop = 0, short = 0, under = 0;
  const LAND = [['844x390', 844, 390], ['844x330', 844, 330], ['667x375', 667, 375], ['932x430', 932, 430], ['1024x768', 1024, 768], ['1194x834', 1194, 834]];
  for (const [, w, h] of LAND) for (const ins of [0, 24, 47, 74, 120]) {
    const f = boxOf(w, h, { top: ins }), p = menuButtonPlace(f);
    n++;
    if (p.below) below++;
    if (p.top !== Math.max(8 + f.safeTop, Math.round(f.top + 4 * f.unit))) wrongTop++;
    if (f.top + touchClear(f) * f.unit < p.top + MENU_BTN_H + 3 * f.unit - 1e-9) short++;
    if (p.top < 8 + f.safeTop - 1e-9) under++;
  }
  check('landscape: the button sits on the picture\'s top edge (4 lines down, 8 px from the page\'s top, below the inset)', below === 0 && wrongTop === 0 && under === 0, `(${n} windows x insets, ${below} under the picture, ${wrongTop} out of place, ${under} under the inset)`);
  check('... and the lines kept clear for it (title logo, menu panels) always reach below it, with 3 lines of air', short === 0, `(${short} too short)`);
  const f0 = boxOf(844, 330, { top: 0 }), f1 = boxOf(844, 330, { top: 24 }), f2 = boxOf(844, 330, { top: 74 });
  check('landscape 844x330: no inset, the button is 8 px from the top; 24 px: 32 px; 74 px: 82 px', menuButtonPlace(f0).top === 8 && menuButtonPlace(f1).top === 32 && menuButtonPlace(f2).top === 82, `(${menuButtonPlace(f0).top} / ${menuButtonPlace(f1).top} / ${menuButtonPlace(f2).top})`);
}
{
  // any window at all: if the button goes under the picture it is inside the window and clear of the controls, otherwise it is on the picture's top edge; never anywhere else
  let n = 0, bad = 0, below = 0, inside = 0;
  for (let w = 300; w <= 1400; w += 37) for (let h = 300; h <= 1400; h += 41) for (const ins of [0, 47, 74]) for (const touch of [true]) {
    const f = boxOf(w, h, { top: ins, bottom: 34, right: 0 }), p = menuButtonPlace(f);
    n++;
    const box = { left: p.x - MENU_BTN_W / 2, right: p.x + MENU_BTN_W / 2, top: p.top, bottom: p.top + MENU_BTN_H };
    if (p.below) {
      below++;
      if (box.top < f.top + f.height || box.left < 0 || box.right > f.winW || box.bottom > f.winH - 34 || Object.keys(PADS).some((k) => boxHit(box, padRect(k, f), 6))) bad++;
    } else {
      inside++;
      if (p.top !== Math.max(8 + f.safeTop, Math.round(f.top + 4 * f.unit))) bad++;
    }
  }
  check('in every window size (300 to 1400 px each way): under the picture only where there is room, clear of the controls; otherwise on its top edge', bad === 0, `(${n} windows: ${below} under the picture, ${inside} on its top edge, ${bad} wrong)`);
}

// ---- 4. what the old layouts did (the checks see the problems) -------------------------------------------------------------------------------
{
  const c = boxOf(430, 866, { touch: false, top: 74, bottom: 34 });
  check('(centred, the picture of a 430x866 phone floated across the middle of the screen: the check sees the problem)', c.top < 866 / 2 && c.top + c.height > 866 / 2, `(${c.top.toFixed(0)} to ${(c.top + c.height).toFixed(0)} of 866)`);
  const old = Math.max(8, Math.round(c.top + 4 * c.unit)) + 74;
  check('(and with the inset added on top of the frame\'s own place, the button sat 79 px into the picture: the check sees the problem)', old - c.top > 70, `(${(old - c.top).toFixed(1)} px)`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall touch layout checks passed');
process.exit(failed ? 1 : 0);
