# Lantern Keepers Pack — design notes for *Gloaming Vale*

A one-realm DLC for a PS1-era 3D platformer. This file is the pitch and the level design; the README covers how to run it and how the renderer works.

## Pitch

The Snuffers, small hooded pests that eat light, have swallowed the sunrise over a valley that is kept alive by five Beacon
Lanterns. You relight the lanterns one by one and the sky answers: every beacon pushes the valley a step from a violet
gloaming toward daybreak, and the last one lifts the sun over the rim.

**Design goals**

* One hub-like valley that you can read from any hill: every beacon has a beam of light you can see from the spawn.
* Five beacons, five different verbs: walk-and-burn (tutorial), hop, puzzle, glide, climb.
* The world itself is the progress bar. The lighting is baked twice (dusk and daybreak) and blended by how many beacons burn.
* Nothing is gated by anything but movement skill and one visible puzzle. No fetch quests, no menus.

## Flow

```mermaid
flowchart LR
  spawn([Realm portal]) --> V[Hearth Village<br/>Beacon I]
  V --> L[Mirrormere lake<br/>Beacon II on the island]
  V -->|east trail| M[Windmill hill<br/>Beacon III]
  V -->|west trail| Mesa[Launch mesa]
  Mesa -->|bounce + glide| S[Sky isles<br/>Beacon IV]
  L & M & S -->|4 lit| G{Dawn Gate}
  G --> T[Spiral mountain road] --> O[Observatory<br/>Beacon V]
  O --> Sunrise([Sunrise finale])
```

| # | Beacon | Skill it teaches | Obstacle |
| - | --- | --- | --- |
| I | Hearth | fire breath | none; the elder explains the premise |
| II | Isle | jumping | a reef of stepping stones across the lake (or glide from Heron Point) |
| III | Mill | fire on a target, stairs | three braziers along the spiral road raise the portcullis to the tower stair |
| IV | Sky | bounce, glide | a launch mushroom on the mesa, then a chain of floating isles that bob |
| V | Dawn | endurance | the Dawn Gate stays sealed until four lanterns burn (a ward around the mountain, shown by drifting violet motes, stops anyone walking or gliding round the arch), then a cobbled road spirals up to the observatory |

The two long trails leave the village on opposite sides of the lake and meet again at the Dawn Gate, running into the two
sides of its paved forecourt (a flagstone apron that climbs gently to the threshold), so the valley is a loop and no route is
a dead end. Heron Point, a red-rock headland on the lake's north shore, has its own trail: it is the launch
pad for the long glide out to the island shrine.

## Enemies

| Snuffer | Looks like | Beats it |
| --- | --- | --- |
| Plain | hooded, amber eyes | fire or charge |
| Bell | brass bell shield on a pole | charge (fire bounces off) |
| Thorn | crystal spikes on the back | fire (charging hurts you) |

Sparx, the dragonfly, is the health bar: three hits, shown by his colour. Scorched bunnies turn into butterflies that heal him.

## Collectibles and economy

* Gems are worth 1, 2, 5, 10 and 25. **700** in total: 319 laid out as road trails, arcs over gaps and a few hidden purples and golds, 381 inside vases, chests, a cracked wall and Snuffers.
* The HUD total is computed from the same drop tables the game uses, and a test collects everything to check the numbers match.
* The results screen awards up to three stars by gem percentage (60 % and 95 % thresholds).
* **Gems fly in on a lob.** With Sparx alive, a gem inside 5.2 m is launched towards Spyro's chest on a fixed-time arc instead of a straight
  slide: the position is `start + (chest - start) * u^1.35 + up * H * 4u(1 - u)` with `u` running 0..1 over `T = 0.32 + 0.05 d` seconds and
  a hump of `H = 0.55 + 0.4 d` metres (`d` is the distance at launch), so it climbs first and dives in at the end. The target is re-read every
  step, so a running Spyro is still caught; if he gets more than 14 m away the pull lets go (a placed gem goes back to where it hangs, a dropped
  one falls where it is). The gem tumbles and swells a little on the way and leaves a short trail of coloured sparkles. Gems within 1.55 m are
  collected directly, exactly as before, so the economy is unchanged.

## Art direction

* **Palette:** violet sky, teal water, warm window light. Gold is reserved for lit things, so a lit lantern is the brightest object on screen.
* **Time of day:** one moon-lit *gloaming* light and one *daybreak* light. Vertex colours store both; a uniform blends them.
* **Textures:** 62 tiny tiles (16–64 px), drawn in code from a limited palette, sampled with nearest filtering.
* **Geometry:** hand-built from primitives in code. Chunky silhouettes, few vertices per model, texture detail does the work.
* **Gems:** cut stones of 48 flat facets (table, crown, girdle, two-tier pavilion). The gem shader ignores the scene light and uses two fixed
  lights plus a specular glint, so the facets flash as a gem spins, at dusk and at daybreak alike. Nearby gems twinkle with white four-point
  stars now and then (big ones more often). Five hues: red, green, blue, gold and purple, bigger for higher values.
* **Gem counter:** the count that hops in the corner after every pickup is real 3D, like the original's HUD numerals: a stroke font
  (`DIGIT_STROKES`) of flat-ended, extruded strokes with octagonal joints, in the faceted gem shader tinted gold, with a hard dark copy just
  behind and below it for readability and a spinning gem icon in the colour of the last pickup. It lives in its own small scene, drawn after the
  world with the depth buffer cleared, through the same PS1 shader (vertex wobble, banding and dither included). The camera is set up so that
  one world unit is one HUD pixel on the 240-line layout, so it is placed with the same numbers as the 2D panels. Every changed digit hops
  (the units first, the tens a moment later; a digit that rolls over flips right round, and every landing squashes). The hop launch speed is
  capped so that a burst of pickups never lifts a digit above 12 px. It slides in from above on the first pickup, stays for 2.6 s after the last
  one and slides out; it also goes away at once whenever the HUD is hidden (title, cinematics). While it is hidden the extra render pass is skipped.
* **Camera:** chase camera at a fixed distance that pulls in when something blocks it, plus authored cinematic shots for the title, intro and finale.
  The chase camera has three modes, after the original games' Active / Passive camera setting (research: the manual describes Active as "moves right along
  with you", Passive as slow, letting you "run around without moving the camera"; players describe Active as swinging Spyro round in wide arcs and Passive
  as absolute sideways movement). **Active** (the default) turns after Spyro at up to 2.3 rad/s for even a small sideways lean. **Passive** never turns by itself.
  **Smart** is a calmer Active: nothing happens inside a 35 degree dead zone around straight ahead (a touch thumb always wanders), the rate ramps
  up to 1 rad/s by about 55 degrees after a 0.3 s hold on one side, and a pure strafe or a step back never moves the view. The turn rate depends on the stick angle
  from straight ahead (steering is camera-relative, so that angle IS the angle between Spyro's path and the view).
  Other twitches removed: the look-ahead point is smoothed (it used to follow Spyro's near-instant turns), the camera is smoothed as an offset from the pivot (an
  absolute lerp trailed a running hero by speed / rate metres, and the rate switched with the obstruction, pumping the distance by ~0.7 m), and the obstruction
  ray is bisected (0.6 m sampling made the pulled-in distance jump in 8 % steps).
  **Obstacles.** The camera used to be held back by every collider and by the ground, and could come within 1.4 m of Spyro: circling a lone tree it got as close as
  1.6 m and popped in and out 95 times in 9 s, and at slopes it sat 1.8-3.4 m away for up to 63 % of the time. Now (a) only colliders at least 2.4 m across that are not
  walk-on surfaces can hold it back (houses, the windmill and observatory towers, gate pillars, big boulders and spires; trees are 0.5-1.1 m, lamp posts 0.3 m, so it
  slides through them); (b) rising ground behind Spyro makes the camera climb instead of come in: the smallest extra pitch (found by bisection, up to 63 degrees) that
  clears the terrain at its full distance, smoothed up in ~0.12 s, held 0.5 s and released over ~1.5 s so bumps never bob the view; (c) whatever still blocks it pulls
  it in at most to 62 % of its distance, over ~0.1 s, and releases after 0.5 s of clear view. The same scenarios now keep the camera at 6.9-7.1 m at the closest
  (tools/camera-test.mjs checks each rule; the collider survey behind the 2.4 m threshold is in the commit message).
* **Steering aids:** the touch move stick is a floating circle with a dead zone whose base follows a thumb sliding past the rim (a turn of any size costs at most one
  diameter of thumb travel); breathing fire turns Spyro up to 5.5 rad/s towards the burnable thing nearest to straight ahead inside a 66 degree cone (never against
  a stick pushed the other way).
* **Menu on a touch screen:** there is no Esc key on a phone, and the old unlabelled "II" button sat over the title logo, so the menu now has a plain labelled **MENU**
  button (a 44 px pill, top centre, anchored to the game frame so it sits in the same place relative to the HUD on any window; it reads RESUME / BACK while a menu is
  open). The app tells the input layer what to show each frame (`Input.setTouchUI(controls, menuLabel)`): the title shows only MENU, play shows everything, menus show only
  RESUME / BACK (JUMP / FIRE would sit on top of the rows and swallow the taps meant for them, and a hidden button never sees its touchend, so hiding also lets go of
  anything held), and cutscenes show nothing. Menu rows are finger-sized: the HUD is a fixed 240 lines however big the screen, so `Menu.layout` converts 40 CSS px to
  lines (25 on a phone, the usual 13 on a desktop window) and keeps the panel below the button. Options is a short list of sub-pages so every page has at most 7 rows, and the
  BACK / RESUME rows are left out on touch (the button and a tap outside do that). Taps on the menu never count as "tap to start" on the title (the flag they set is discarded), and an
  open menu stops the mouse being captured (a click on a row used to lock and hide the pointer). A tap made in play leaves its pointer flags set (nothing consumes them
  there), so opening a menu clears them: the menu used to read that old tap as a click on its first frame and close (or press a row) at once. A browser that hides its touch
  support gets the controls with its first touch.
* **Debug mode:** F3 (off / compact / full), or Menu → Debug mode on a phone. `debuginfo.js` holds everything the readout says as pure functions (testable without a
  browser), `debug.js` is the DOM overlay, the crosshair, an aim marker and the collider wireframes. It answers "where do I fix this?" from a screenshot: the player's X / Y / Z
  (x east, z south, y up), the named area, the ground texture *and the rule that chose it* (`terrainPicker`, factored out of the mesh builder, so it is the same code), a ray
  through the middle of the screen against the terrain, the colliders and the water (marching every 0.5 m, then bisecting) with the prop it landed on, the nearest props,
  gameplay things and collision shape with distance and clock direction, and the build id. On a touch screen a tap pins the aim ray to the tapped pixel (unprojected through the
  camera), so the thing that looks wrong can be pointed at without centring it. Provenance is recorded while the level is built: `ctx.put` records every prop
  (`gameplay.placed`: name, position, size, `src`), the props' colliders carry the prop (`collider.prop`) and `populate()` labels each gameplay record with the layout function
  that made it (`src`: `layoutLake`, `scatterWorld`, ...), so "chest [layoutLake]" is a grep away from the code. `errlog.js` keeps the last errors and warnings from page load on; the
  build id is a hash of `src/` injected by `tools/build-single.mjs`.
* **The hero:** modelled from a measured character sheet (orthographic front / side / top / back views), so the proportions are the classic
  ones: a boxy purple head on a short thick neck with a broad flat muzzle (the cheek corners are the widest point), big glossy eyes tilted
  outward on the forehead wall, thick ringed horns sweeping back and up, a flat orange crest fin standing on the midline (six spikes, the
  base running down the back of the head), a tall upright chest carrying crisp banded orange plates from the throat to the belly, four
  short columnar legs with flat three-toed feet, wings held up like triangular sails (dark red membrane, broad orange leading edge,
  brown shoulder knob) and a long tapering tail with an orange ringed tip. Everything is authored in sheet units (`K` metres each) and
  converted by one helper, so the model can be rescaled with a single constant. The build was checked against the sheet by overlaying
  silhouettes from the front, side, top and back (about 0.9 overlap for the side and top views, 0.86 from the front).

## Audio direction

Everything is synthesised at start-up to imitate a 22 kHz sample-playback chip with ADPCM grit and a hall reverb, with one deliberate
exception: the gem chimes (below). The score is
one 16-bar theme in two colourings: D dorian on celesta and music box for the gloaming, D major with marimba and flute for
daybreak. Both are the same length and time-aligned, so the game crossfades between them as beacons are lit.

**Gem chimes.** The most-heard sound in the game gets the cleanest treatment: 48 kHz stereo, no grit, no high-cut. Each gem is a quick
rising run of near-harmonic glass bells (A6 to A8 for the purple one) with a detuned twin on the other side of the stereo field, a 1.5 ms
glint of 7-9 kHz on the attack and a scatter of tiny 5-9 kHz pings as the glitter tail. Value climbs by a higher top note, more notes and a
longer ring (red 3 notes, green 4, blue 5, gold 6, purple 8). A quick run of pickups (a burst from a chest, a sprint down a trail) climbs a
ladder of a fourth, a fifth and an octave over the chime's own pitch (all inside the D pentatonic family) and then trills, and a pause resets it.

## Testing

`tools/bot.mjs` walks every road with the real player controller; `tools/playthrough.mjs` completes the whole story
(every beacon, the puzzle, the glide chain, the gate, the finale). Both run without rendering, so they take seconds.
`tools/camera-test.mjs` and `tools/control-test.mjs` run the real Player, camera and collision layer over fake terrain and props with scripted stick input (no browser or server): every mode's
behaviour under a wobbling, zig-zagging, hopping or sideways thumb, trees / houses / slopes / bumps around the camera, the settings migration, the touch stick and the aim assist.
`tools/camera-input-test.mjs` drives the real game loop in the browser: R, the gamepad's Y and the touch CAM button must swing the camera behind Spyro at any frame rate. (They once
did not: the camera looked for the press after the step loop had already cleared it, so they only worked on frames in which no fixed step ran.)
`tools/level-check.mjs` builds the level headlessly (no server) and checks the gem economy and a few placements that once went
wrong: the shrine chest sits seated on its island's level top, and the Dawn Gate's forecourt is dry, gentle and where the ring roads end.

`tools/debuginfo-test.mjs` (no server) builds the level headlessly and checks the debug readout against independent computations: the texture it reports is the texture of the
terrain mesh triangle under the point (1500 scattered points, all eleven textures and 16 rules), the aim ray against known ground, houses, a pier and the water, the nearest prop and
collider against brute force, and that every prop, collider and gameplay record names its layout function. `tools/debug-test.mjs` and `tools/menu-test.mjs` (browser) cover F3, the readout's X / Y / Z
being the player's, the aim point lying on the camera's own ray, the phone layout, and the menu on an emulated phone through real touch events (the MENU button, finger-sized rows, sub-pages,
thumb controls hiding and nothing left held) plus the keyboard and mouse on a desktop window.

Focused checks (they need the dev server): `charge-test` (charging lasts exactly as long as the button is held), `gem-flight-test` (a pulled gem
rises, peaks in the middle of the flight and dives in; a running target is still caught; the pull cancels cleanly; bursts add up exactly),
`gem-counter-test` (rendered frames really contain the numerals and lose them again; show / hold / fade timing; digit slots, rollover to three
and four digits, hop height cap, no flash when the HUD returns; sane numeral geometry) and `gem-sound-test` (the chimes).
