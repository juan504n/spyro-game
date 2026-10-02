# The recipe: how Dawnhaven was built, as a way to build a realm

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
  200 m corridor is fine.
* `makeLevel(brief, extras)` (`realm/level.js`) turns the brief into the level descriptor and puts a level pad (7 m, 9 for a big goal) under every goal. Landforms the ribbons cannot make go in
  `extras.landforms(h, x, z)`: `glade` (a round floor walled in by rock, open along a strip: a secret room), `ravine` (a chasm to glide over), `flatten` (a shelf), `mound` (an islet, a knoll), `basin` is
  the lake (done for you from `brief.lake`). `NO_LAKE` is the engine's placeholder when a realm has no lake.
* Draw it: `node tools/realm-map.mjs <id> map.png`. White circles are the ribbons, cream roads, blue water, red dots Snuffers, orange chests, yellow dots gems, numbered discs the goals.

## 2. Roads and the trail of gems

* A road is `{ id, surface: 'dirt'|'cobble'|'flagstone', width, pts, gems: { every, pattern, lateral } }`; `pts` usually follow a ribbon (`ptsOf(REGIONS, 'ridge')`). Roads carry the gem trail
  (the checker's `design.leads`). Keep them `<= 6 m` wide; a cobble trunk (6 m), dirt side roads (4.6 m). Give the realm **a second way** somewhere (a ring round a lake, a shortcut): loops.
* Every road ends at a junction, the start, or a reward (a goal, a chest, a door, a person): no dead ends.

## 3. Goals in different situations (`brief.goals`, `situations.js`)

Pick the arc before the coordinates. A good five-goal arc: a **landing** goal a short walk from the start; a goal off the road in a **clearing**; one on an **island** or in a **cave**; one that asks
for the **glide** or a **puzzle**; the finale on a **summit** or in a **crater**. Each goal has `hint` (what to do) and `hintAt`. A goal on a structure of its own (an islet, a tower) takes
`pad: false`; one given `y` keeps it. The last goal is `big: true` (a bigger lantern with a ring of light 16.5 m above it).

## 4. The places (`layout.js`)

A stage is `function layoutX(ctx) { ... }`. What you have (`reference/contract.md` has the list): `ctx.put(name, x, z, params, footprint)`, `ctx.ok(x, z, opts)` (is it clear?), `ctx.scatter(name, n, sampler,
okOpts, paramsFn)`, `band(ctx, REGIONS, id, f0, f1, lo, hi)` (a sampler over a stretch of a ribbon), `flatSpot`, `lampsAlong`, `ctx.addEnemy / addVase / addChest / addWall / addBunnies / addGem / gemArc`,
`ctx.gp.hints / purple / soundSources`, `ctx.pathPoint(road, t)`. Rules that keep it honest:
* Props: nothing stands in a road (`ctx.ok` keeps `path` clear), nothing is planted in a cave (the kit's `ok` refuses spots under a roof; caves are dressed by hand), a prop's footprint is its occupancy.
* Enemies by progress: none within 30 m of the start, one or two basics on the first third, bells and thorns later; place them along roads with `ctx.pathPoint`.
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
  Day 0 is how the realm looks before its goals are lit, day 1 after; each goal lit moves it along (`level.goal.daySteps` or the default curve). Pick the two moods first (frozen night with an aurora ->
  blossom dawn), keep each to two or three base hues, make the glow colour the accent.
* **Ground** (`extras.groundRule`): a method `groundRule(x, z, h, slope, { r, surface, pd })` returning `[texture, why]` or nothing. It runs after roads, lake shores, steep rock (-> cliff) and
  `h > 42` (-> far rock) and before the default grass, so returning a texture for all the flat ground (snow, sand) re-skins the realm; `cliffs: { cool, warm }` names the tall faces.
  New textures live in `src/engine/textures/world/*.js` (`tools/texture-sheet.mjs` shows them); a realm uses few.
* **Skin and own textures** (`brief.theme.skin`, `brief.lakeTextures`, `brief.roadTextures`, `brief.farRock`): a realm can wear its own textures without touching the engine's: the roads (`cobble_frost`,
  `path_snow`), the lake, the far mountains, and every prop that is built from the kit (see `contract.md`). Keep to two or three base colours (the checker's `design.palette` counts the ground's textures)
  and make the flowers one colour (`flower_patch` takes `kinds: ['flower_pink'], tufts: false`). A gate can be recoloured (`gp.barrier.opts.tint`), a skylight's beam too (`light_shaft`: `color`, `glow`).
* **Goal object**: `makeModel(assets, name, { big })` from `src/game/models/objects/*.js` (the `beacon.js` Rig/litBuilder pattern: `setLit(k)`, `update`, `anchors.flame`); a goal in the brief carries `model`,
  `beam: { off, on }`, `glow`, `wisp`, `flame: false`, `spark`, `sparkle` (colours of its beam before/after, pool of light, wisps, ignition burst).
* **Words** (`brief.words`, defaults in `realms.js` DEFAULT_WORDS): what the HUD counts (`goals`: "BEACONS"), the banner when one is lit (`lit`), the finale (`finale`), results, free roam, the gate's banner (`gate`),
  the two icons (`icons`: keys of the HUD icon atlas, `engine/textures/ui/icons.js`: `lantern_on`/`lantern_off` by default, `bloom_on`/`bloom_off` for Frostbloom Hollow; a new realm draws its own 12 by 16 pair there). The banner `NAME + ' ' + words.lit` is drawn at twice the font's size on a 320 px screen, so keep the pair short (`hud.banners` checks it).

## 7. The door and the way home

`--wake-door` sets the Dawnhaven door's `target` (`src/game/home/level.js` DOOR_DEFS); Dawnhaven's `layoutDoors` then makes the door awake and records `gp.arrivals[target]`. The hero arrives at the
realm's `spawn` (or `gp.arrivals[from]` if the realm sets one). The realm's `exit` (the ring of light over the last goal) leads back to `exit.target` ('home'). Update `home-check.mjs`, `home-bot.mjs`
(`sealed-doors` lists the doors that sleep; each awake door has a `door-opens-<id>` run) and `portal-test.mjs` when a door wakes, re-pin Dawnhaven's `world-hash` (an intended change: its door is awake) and move
any Dawnhaven TRAVEL place that lies within 6 m of the door (an awake door's light carries him away). A place of the realm that lies **beyond its gate** carries `opens: true` (`realm-travel.mjs` finds out by
walking with the gate shut): the app opens the gate for a hero put there, or he would stand shut in.
