# The recipe: how Dawnhaven was built, as a way to build a realm (and what Frostbloom Hollow and Emberfall Crags added)

Dawnhaven (round 19) was rebuilt after the first thing said about it: *an open field, everything at an equal distance, nothing like the original's homeworlds*. The recipe that fixed it is the
foundry's kit (`src/game/realm/`). Follow it in this order.

## 1. The country: ribbons between mountains (`realm/country.js`)

* A **region** is a ribbon of open ground: `{ id, fall, label, pts: [[x, z, height, halfWidth], ...] }`. The ground keeps the line's height out to the half width, then rises over `fall` metres to the
  **mountains** that fill everything that is not open ground (`mountain: { base, ridge, rough }`, 34-56 m by default). Where ribbons meet or overlap, their heights blend (a ramp, a pass). A road runs along
  the ribbon's line, so the ribbons are also the skeleton of the journey.
* Make a ribbon **wide where there is something to see** (a meadow, a lake's shore: 14-34 m half width), **narrow where it is a way** (a pass, a canyon, a ridge: 8-12 m), and **wind** it: switchbacks
  of 40-60 m legs make a climb of 50 m a 300 m walk at a grade of 0.2. Keep nominal grades under 0.35 (the ground rolls: `roll.amp` 3 m adds up to 0.13) so the road stays under 0.5.
* Heights: start low, end high; at least 25 m of range; give each part a floor of its own so the parts have levels and the passes between them are real climbs.
* **Mountains are walls.** Whatever is outside the ribbons is rock the hero cannot walk or glide over (the valley's rim is steeper still). The world is as big as the ribbons make it: a 384 m world with a
  200 m corridor is fine. **A country with high ribbons needs `country: { mountain: { margin } }`** (Emberfall Crags: a rim at 24 m, a gorge climbing to 34, `margin: 24`): the noise alone makes mountains of 35 m
  beside a floor of 34, and the hero simply walks up them (the walk map found ground from 2.7 to 63 m and `design.height` failed). With a margin the mountains stand at least that far over the ribbons' floors
  beside them (`tools/emberfall-check.mjs` has the check: no ground over 30 m is walkable but the gorge and the caldera).
* **Declared heights must be the ground's.** A ribbon's height is blended with its neighbours' (weights by the square of the closeness): a stair 6 m wide beside a 28 m wide plain, or a spur close to a rim,
  is dragged to their level and `design.parts` fails (the ground is over 2 m off its own line). Narrow the wide end, start the next ribbon a long way from the stair, remove the spur; `ctx.pathPoint` + `h` to
  compare is how it was done. **A ribbon beside the lake must reach the bank's top** (the basin's bank is at 1.34 of its radius, the shore at 1.0), or a crest of mountain stands between the plateau and the lake.
* `makeLevel(brief, extras)` (`realm/level.js`) turns the brief into the level descriptor and puts a level pad (7 m, 9 for a big goal) under every goal. Landforms the ribbons cannot make go in
  `extras.landforms(h, x, z)`: `glade` (a round floor walled in by rock, open along a strip: a secret room), `ravine` (a chasm to glide over), `flatten` (a shelf), `mound` (an islet, a knoll), `basin` is
  the lake (done for you from `brief.lake`; with `lake.islets: [{ x, z, r, top }]` it leaves a stack standing in it: Emberfall's rock in the lava, `ANVIL`). `NO_LAKE` is the engine's placeholder when a realm has no lake.
* Draw it: `node tools/realm-map.mjs <id> map.png`. White circles are the ribbons, cream roads, blue water, red dots Snuffers, orange chests, yellow dots gems, numbered discs the goals.

## 2. Roads and the trail of gems

* A road is `{ id, surface: 'dirt'|'cobble'|'flagstone', width, pts, gems: { every, pattern, lateral } }`; `pts` usually follow a ribbon (`ptsOf(REGIONS, 'ridge')`). Roads carry the gem trail
  (the checker's `design.leads`). Keep them `<= 6 m` wide; a cobble trunk (6 m), dirt side roads (4.6 m). Give the realm **a second way** somewhere (a ring round a lake, a shortcut): loops.
* Every road ends at a junction, the start, or a reward (a goal, a chest, a door, a person): no dead ends.

## 3. Goals in different situations (`brief.goals`, `situations.js`)

Pick the arc before the coordinates. A good five-goal arc: a **landing** goal a short walk from the start; a goal off the road in a **clearing**; one on an **island** or in a **cave**; one that asks
for the **glide** (across a chasm or a lake: a stack of rock in the middle of lava, 15 m up, 36 m from the rim; **with no way on foot at all it needs a way off** by a glide, which the situation check looks for, and the lake must be deep from bank to bank so that the only dry ground is the stack) or a **puzzle**; the finale on a **summit** or in a **crater**. Each goal has `hint` (what to do) and `hintAt`. A goal on a structure of its own (an islet, a tower) takes
`pad: false`; one given `y` keeps it. The last goal is `big: true` (a bigger lantern with a ring of light 16.5 m above it).

## 4. The places (`layout.js`)

A stage is `function layoutX(ctx) { ... }`. What you have (`reference/contract.md` has the list): `ctx.put(name, x, z, params, footprint)`, `ctx.ok(x, z, opts)` (is it clear?), `ctx.scatter(name, n, sampler,
okOpts, paramsFn)`, `band(ctx, REGIONS, id, f0, f1, lo, hi)` (a sampler over a stretch of a ribbon), `flatSpot`, `lampsAlong`, `ctx.addEnemy / addVase / addChest / addWall / addBunnies / addGem / gemArc`,
`ctx.gp.hints / purple / soundSources`, `ctx.pathPoint(road, t)`. Rules that keep it honest:
* Props: nothing stands in a road (`ctx.ok` keeps `path` clear), nothing is planted in a cave (the kit's `ok` refuses spots under a roof; caves are dressed by hand), a prop's footprint is its occupancy.
* Enemies by progress: none within 30 m of the start, one or two basics on the first third, bells and thorns later; place them along roads with `ctx.pathPoint`. **A realm has a cast**: at least five kinds of Snuffer, three of them of the foes of `src/game/foes/kinds.js` (the Rimeling in its shell, the Slinger, the Ramhog, the Dustmole, the Lidwarden, the Fusepup, the Dusk Moth, the Smokecaller, the Pilferling; `enemies.cast`), chosen for the ground they stand on and what each asks of the hero (`docs/DESIGN.md`, round twenty-eight, says what each wants): a Ramhog where he has room to step off its line (`enemies.room`: 11 of 16 points of a ring of 6 m round it are ground he can stand on), Rimelings where the realm is cold, a Dusk Moth over open ground, a Dustmole on soft ground, a Slinger where there is space to stand off, a Pilferling early, where a chase is a game and not a danger. `ctx.addEnemy(x, z, kind, patrol)` takes the kind's id; the kinds are weighted for the danger curve (`DANGER`, `foes/kinds.js`) and pay the gems of `ENEMY_DROPS` (`economy.js`: the treasure's total is a round number of the gems laid out plus the drops of the foes, so a new foe is paid for there too).
* Secrets: a chest with `secret: '<id>'` for each secret of the brief, 8+ m off any road; one behind a cracked wall (`ctx.addWall(x, z, yaw, width, height, gems)` across a strip 8.4 m wide; the glade
  landform has the strip). A hint just before the wall: "THAT WALL LOOKS CRACKED... TRY CHARGING IT".
* Treasure: hand-placed gems/vases/chests count; `gemsStage` adds the trail, weeds out what hangs in a solid, and tops up to a multiple of 50 (>= `gems.min`). Put it last.

## 5. Caves (rock that is not a heightfield: `massif.js`, `realm/rockmass.js`)

A heightfield cannot hold a cave. A level lists `massifs: (grid, L) => [Massif]`; the rock is a function `field(x, y, z)` (negative inside). `rockMass` (`realm/rockmass.js`) builds one from data - the recipe
of Dawnhaven's Crag (`home/crag.js`) made general - and `frostbloom/glacier.js` is its worked example:

```js
export const GLACIER = rockMass({ id: 'glacier', name: 'THE GLACIER', plinth: 11,
  mounds:   [{ x, z, rx, rz, h, flat }],                       // heights above the plinth (`flat`: the share of the radius where the top is level; 0.9 = a sheer wall)
  tunnels:  { mouth: [[x, z, floorY, halfWidth, height], ...] },  // arched ways; the floor is interpolated along the line
  chambers: { heart: { x, z, rx, rz, rot, H, floorY } },          // domes of air on a flat floor
  shafts:   [{ x, z, r, y0, y1 }],                                // skylights
  box: [x0, y0, z0, x1, y1, z1], style: { rock, interior, top, ambient, layers } });
```
Four things make it work, and each is one line in the realm: **a plinth** (a ribbon of level ground at the plinth's height under the mass, so it stands on flat ground), **the landform**
(`landforms: (h, x, z) => GLACIER.landform(h, x, z)`: the terrain follows the caves' floors, level inside every tunnel and chamber), **the massif** (`massifs: () => [GLACIER.massif()]`) and **the ground rule**
(`GLACIER.inside(x, z)`: ice or flagstone on the cave floors). The layout places things by `GLACIER.at(tunnel, s, side)` (`s` metres along it, `side` to the right) and `GLACIER.length`. The mass
(1.5 m cells over its box) costs about half a second to build; keep the box tight. Dress caves by hand (crystals, torches: glow lights light the rock round them; a `light_shaft` under the skylight);
`ctx.ok` refuses spots in the rock or under a roof, so nothing is scattered into a cave. The checker's `cave` situation wants the goal under a roof (a skylight over the goal itself is fine: it looks
round the goal too). A cracked wall (`ctx.addWall(x, z, yaw, 7.0, 5.7, [25])`) across a tunnel of half width 3.2 shuts a vault; the walk map's `walkShut` then cannot reach the chest.
`home/crag.js` and `home/layout-crag.js` are the bigger hand-written example (4 tunnels, 2 halls, a ledge road round the outside).

## 6. The feel: environment, ground, goal model, words

* **Environment** (`brief.environment`): `{ name, envs: [A, B], sky: [A, B], sun: { az, el: [e0, e1] }, moon: { az, el } }` (`engine/lighting.js` DEFAULT_ENVIRONMENT has the shape). `envs[i]` is a baked light state:
  `lights: [{ dir, color, shadow }]` (the first with `shadow` casts; use `dirAzEl(az, el)`), `sky` and `ground` ambient colours. `sky[i]` is the dome palette (zenith, high, mid, low, horizon, fog, glow).
  A palette that wants its own clouds and distant mountains adds `cloudTop`, `cloudBot` and `ridge` (without them the vale's lavender is painted: Emberfall's first screenshots had pink clouds over ash).
  Day 0 is how the realm looks before its goals are lit, day 1 after; each goal lit moves it along (`level.goal.daySteps` or the default curve). Pick the two moods first (frozen night with an aurora ->
  blossom dawn), keep each to two or three base hues, make the glow colour the accent.
* **Ground** (`extras.groundRule`): a method `groundRule(x, z, h, slope, { r, surface, pd })` returning `[texture, why]` or nothing. It runs after roads, lake shores, steep rock (-> cliff) and
  `h > 42` (-> far rock) and before the default grass, so returning a texture for all the flat ground (snow, sand) re-skins the realm; `cliffs: { cool, warm }` names the tall faces.
  New textures live in `src/engine/textures/world/*.js` (`tools/texture-sheet.mjs` shows them); a realm uses few.
* **Skin and own textures** (`brief.theme.skin`, `brief.lakeTextures`, `brief.roadTextures`, `brief.farRock`): a realm can wear its own textures without touching the engine's: the roads (`cobble_frost`,
  `path_snow`), the lake, the far mountains, and every prop that is built from the kit (see `contract.md`). Keep to two or three base colours (the checker's `design.palette` counts the ground's textures)
  and make the flowers one colour (`flower_patch` takes `kinds: ['flower_pink'], tufts: false`). A gate can be recoloured (`gp.barrier.opts.tint`), a skylight's beam too (`light_shaft`: `color`, `glow`).
* **A lake that is not water** (`extras.descriptor: { liquid, ambient }` in `level.js`, see `contract.md`): Emberfall's lava is `{ texture: 'lava', splash: 'lava', burnDepth: 0.2, ... }` over a basin 5 m deep. Water physics are global (`WATER_LEVEL` = 0), so a lake of lava is a basin below zero that burns from `burnDepth` instead
  of drowning from 0.95 m; give it `lakeTextures` for its bed and shore (`cinder`, `ash`), `ambient: { dusk: 'ember' }` for embers where the vale has fireflies, and torches and vents round it, since it lights itself.
  Put lava `soundSources` (`flame_loop`, a quiet bed) along it. Draw its surface with big irregular plates (a fine tile reads as honeycomb).
* **A sea instead of a lake** (`brief.sea = { name, deepHint, radius }`, `extras.descriptor.liquid` for its surface, `brief.rockLine`): the ground is islands, each a short ribbon `[[x, z, height, halfWidth], ...]` with a steep `fall` (4-7 m: the
  ground drops to the fill, `country.mountain: { base: -28, ridge: 0, rough: 0 }`, within about 3 m of the ribbon's edge below the surface). Draw the surface opaque and lit from within so the dusk does not darken it (`emissive: 0.55`), with
  big soft billows (a fine tile reads as bubbles) and puffs of cloud on it for scale and parallax (`cloud_puff` with `y: 0`). The `island` situation counts the directions with water within 14 m of the goal: a small round island with the bell
  near its middle (the sea starts 3 m past a ribbon's edge). Keep the ridge of the sky no darker than the fog (a faint mist, not mountains).
* **Slabs, glides and whirlwinds** (a country of islands joined in the air): hop rows from `ROWS` (a gap of 2-4.6 m, slabs 4.6 m across or more, a step of 0.9 m; a gem over each), glides where the way is down (a launch ledge, a landing 3 m
  inside the next island's edge, about 40 m across for 12 m of drop), whirlwinds where it is up (36-40 m tall: the glide out of the top must come down within the reach: `liftReach(drop)`; the shaft clear of rock; the foot a ring of standing stones
  and gems; the landing 25-50 m from the foot). Declare the glides and rides in `brief.air`; the checker says how much of each reach is used. Put the goals where the situation wants them: a glide goal within one glide of a launch ledge
  (near the landing), a lift goal on the island a ride sets him down on.
* **Goal object**: `makeModel(assets, name, { big })` from `src/game/models/objects/*.js` (the `beacon.js` Rig/litBuilder pattern: `setLit(k)`, `update`, `anchors.flame`); a goal in the brief carries `model`,
  `beam: { off, on }`, `glow`, `wisp`, `flame: false`, `spark`, `sparkle` (colours of its beam before/after, pool of light, wisps, ignition burst).
* **Words** (`brief.words`, defaults in `realms.js` DEFAULT_WORDS): what the HUD counts (`goals`: "BEACONS"), the banner when one is lit (`lit`), the finale (`finale`), results, free roam, the gate's banner (`gate`),
  the two icons (`icons`: keys of the HUD icon atlas, `engine/textures/ui/icons.js`: `lantern_on`/`lantern_off` by default, `bloom_on`/`bloom_off` for Frostbloom Hollow; a new realm draws its own 12 by 16 pair there). The banner `NAME + ' ' + words.lit` is drawn at twice the font's size on a 320 px screen, so keep the pair short (`hud.banners` checks it).

## 6b. Water that moves: a sea with a tide (Tideglass Reach; read `tideglass/brief.js` first, then `level.js`, `weeping.js`, `layout.js`)

* **Brief the tide first** (`brief.tide = { period: 90, amp: 1.4, start: 0.75, hint, tint }`, `sea: { name, deepHint, radius, segs, rings }`): 50-150 s round, 0.8-2.2 m either side; the hero drowns from 0.95 m and wades at 0.62 of a run, so over ground at -0.5 m (the flats) the sea is wading at the mean level, deadly above +0.45 m, and bare under -0.5 m. Choose `start` so that the first thing he sees is the sea going out (0.75). Draw the numbers before the places: how much of the road is under water at each hour (`tide.takes`), what the tide shuts (`tide.gates`), the refuges (`tide.refuge`: at 90 s and 1.4 m the most he may be from safe ground is 35 m: a pair of cairns every 40 m of the Low Road, 11 m either side).
* **The country** is ridges and stacks in the sea (ribbons with `fall` 5-8, `mountain.base` the fill, -7), a **shoal** for the sand the tide covers (`shoal()` in `tideglass/level.js`: raise the fill along a line to a level, never lower what stands in it, ripples and bars), **banks** for the refuges (`bank()`, `cairnSpots()`), rock for the cliff (a `rockMass`: a tunnel whose floor climbs from under the high tide at its mouth to a chamber 0.6 m or more over it).
* **Dress the tide**: posts in the water painted at the heights (`tide_post`), the cairns with a lantern each (`tide_cairn`), a hint for the sea (`sea.deepHint`: where it is too deep, `tide.hint`: where it came in), the surf as a loop (`surf`), the sea's own surface texture (`tint.texture`) darker and calmer than a lake's (the first one was too bright), and a sky. Everything that stands over deep water must be `unshadowed` (the terrain's shadow map smears streaks over it).
* **A bridge goal** (`situation: 'bridge'`): stacks 12-13 m over the sea with flat tops (radii 4.5-8.5), bridges 15-26 m long and 3.4-3.8 m wide landing 2 m inside each rim, a goal on the widest. Keep the stacks free of Snuffers (8 m across: a TRAVEL place must be 6 m from one) and of props on the deck's line.
* **A gate across a neck**: a ridge that narrows to 12.8 m (the sea the wall on both sides), pillars no wider than the neck, the road pinned level through it (`neckRoad()`), a field that opens at `gate.at` goals (four of five: the last lens is beyond it).
* **Prove it before you trust it**: `node tools/tide-test.mjs` (the tide itself), the seven `tide.*` rules, the realm's own checks (`tools/tideglass-check.mjs`: the road bare at the low tide and drowned at the high, the cairns over the high tide, the cave's floors, the bridges walkable end to end and landing on ground he can step off onto, the gate across the whole neck with no step to climb), then the real controller (`realm-bot`): it found a gate that did not shut, a gate that could not be walked through, and bridges that landed on a rim, none of which a check had.

## 7. The door and the way home

`--wake-door` sets the Dawnhaven door's `target` (`src/game/home/level.js` DOOR_DEFS; none sleeps now: a new realm needs a door cut first, see SKILL.md); Dawnhaven's `layoutDoors` then makes the door awake and records `gp.arrivals[target]` (11 m in front of the door, at the ground's height unless the door names a `floor`: a door on a deck or a pad must, or the hero comes home under it). The hero arrives at the
realm's `spawn` (or `gp.arrivals[from]` if the realm sets one). The realm's `exit` (the ring of light over the last goal) leads back to `exit.target` ('home'). Update `home-check.mjs`, `home-bot.mjs`
(`sealed-doors` lists the doors that sleep; each awake door has a `door-opens-<id>` run) and `portal-test.mjs` when a door wakes, re-pin Dawnhaven's `world-hash` (an intended change: its door is awake) and move
any Dawnhaven TRAVEL place that lies within 6 m of the door (an awake door's light carries him away). A place of the realm that lies **beyond its gate** carries `opens: true` (`realm-travel.mjs` finds out by
walking with the gate shut): the app opens the gate for a hero put there, or he would stand shut in.
