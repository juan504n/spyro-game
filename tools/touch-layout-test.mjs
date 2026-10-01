// Touch layout test (no browser, no dev server): where the MENU button sits on the page, and how much room the title and the menus leave for it.
//   node tools/touch-layout-test.mjs
// The button is anchored to the game frame (4 HUD lines below its top edge, never closer than 8 px to the top of the page) and stays below what the platform covers at the top of the
// window (`safeTop`: a notch, or the header of an app that shows the page under it: the claude.ai app seems to report about 74 px). The frame's own top is already a position on the page:
// the inset was once added on top of it, and in a portrait window (the frame centred, far below the inset) the button sat in the middle of the picture, over the title logo and the view.
import { MENU_BTN_H, menuButtonTop } from '../src/game/input.js';
import { touchClear } from '../src/game/menu.js';

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };

/** the frame Gfx.resize() makes in a window of w x h CSS px: a 4:3 frame centred (portrait, tablet), or the wide frame that fills the window (a landscape phone), plus the platform's top inset */
const frame = (w, h, wide, safeTop = 0) => {
  const fw = wide ? w : Math.min(w, (h * 4) / 3), fh = wide ? h : fw * 0.75;
  return { left: (w - fw) / 2, top: (h - fh) / 2, width: fw, height: fh, unit: fh / 240, dpr: 3, safeTop };
};
const WINDOWS = [
  ['phone, portrait 390x844', 390, 844, false], ['phone, portrait 430x866 (the claude.ai app)', 430, 866, false], ['small phone, portrait 375x667', 375, 667, false],
  ['phone, landscape 844x390', 844, 390, true], ['small phone, landscape 667x375', 667, 375, true], ['big phone, landscape 932x430', 932, 430, true],
  ['tablet, portrait 768x1024', 768, 1024, false], ['tablet, landscape 1024x768', 1024, 768, false], ['desktop 1280x720, 4:3', 1280, 720, false], ['desktop 1280x720, wide', 1280, 720, true],
];
const INSETS = [0, 20, 24, 47, 59, 74, 120];
const old = (f) => Math.max(8, Math.round(f.top + 4 * f.unit)) + f.safeTop;      // the placement before the fix: calc(top + env(safe-area-inset-top))

let rows = 0, tooHigh = 0, moved = 0, short = 0, worstMove = 0;
for (const [, w, h, wide] of WINDOWS) {
  for (const s of INSETS) {
    const f = frame(w, h, wide, s), top = menuButtonTop(f), floor = Math.round(f.top + 4 * f.unit);
    rows++;
    if (top < 8 + s - 1e-9 || top < floor) tooHigh++;                                    // under the inset, or above its place in the frame
    if (floor >= 8 + s && top !== floor) { moved++; worstMove = Math.max(worstMove, top - floor); }       // the frame's own place is clear of the inset: nothing moves it
    if (f.top + touchClear(f) * f.unit < top + MENU_BTN_H + 3 * f.unit - 1e-9) short++;        // the title / menus start below the button (and 3 lines of air)
  }
}
check(`the button is never under the platform's inset (nor above its place in the frame): ${WINDOWS.length} windows x ${INSETS.length} insets`, tooHigh === 0, `(${tooHigh} of ${rows} placements wrong)`);
check('an inset does not move the button where the frame already lies below it (every portrait window, any inset up to 120 px)', moved === 0, `(${moved} of ${rows} moved, by up to ${worstMove.toFixed(0)} px)`);
check('the lines kept clear for the button (title logo, menu panels) always reach below it, with 3 lines of air', short === 0, `(${short} of ${rows} too short)`);

// the claude.ai app's phone, as in the screenshot: portrait 430 x 866, an inset of about 74 px
{
  const f = frame(430, 866, false, 74), top = menuButtonTop(f);
  check('portrait 430x866 with a 74 px inset: the button sits 4 lines below the picture\'s top edge, 5 px, not 79', top - f.top >= 4 * f.unit - 1 && top - f.top <= 4 * f.unit + 1, `(${(top - f.top).toFixed(1)} px below the picture's top edge; the picture starts at y ${f.top.toFixed(1)})`);
  check('(the old placement put it 74 px lower, well into the picture: the check sees the problem)', old(f) - f.top > 10 * f.unit, `(${(old(f) - f.top).toFixed(1)} px)`);
  const bottom = top + MENU_BTN_H;
  check('... and it lies inside the picture\'s top strip, clear of the HUD lines below (title logo, panels)', bottom <= f.top + touchClear(f) * f.unit && touchClear(f) < 60, `(reserves ${touchClear(f)} of 240 lines)`);
}

// a window whose picture reaches the top (a landscape phone, a tablet): the button goes below the inset, and the lines kept clear grow to match
{
  const f0 = frame(844, 390, true, 0), f1 = frame(844, 390, true, 24), f2 = frame(844, 390, true, 74);
  check('landscape 844x390: no inset, the button is 8 px from the top; 24 px: 32 px; 74 px: 82 px', menuButtonTop(f0) === 8 && menuButtonTop(f1) === 32 && menuButtonTop(f2) === 82, `(${menuButtonTop(f0)} / ${menuButtonTop(f1)} / ${menuButtonTop(f2)})`);
  check('... and the lines kept clear grow with it, so the title and the menus still start below the button', touchClear(f0) < touchClear(f1) && touchClear(f1) < touchClear(f2), `(${touchClear(f0)} / ${touchClear(f1)} / ${touchClear(f2)} lines)`);
  let up = 0;
  for (const [, w, h, wide] of WINDOWS) for (let i = 1; i < INSETS.length; i++) if (menuButtonTop(frame(w, h, wide, INSETS[i])) < menuButtonTop(frame(w, h, wide, INSETS[i - 1]))) up++;
  check('a bigger inset never moves the button up', up === 0, `(${up} cases)`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall touch layout checks passed');
process.exit(failed ? 1 : 0);
