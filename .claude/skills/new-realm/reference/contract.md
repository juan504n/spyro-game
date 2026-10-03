# The engine contract: what a realm is made of

Coordinates: x = east, z = south, y = up, metres (the hero is about 1.6 long). Yaw 0 faces +z (south); PI faces north; PI/2 faces east. The terrain is a heightfield on a 2.4 m cell grid
(`world: { size, cell }`, `size` a whole number of cells); features narrower than about 5 m alias, a crest of 4 m draws cleanly.

## REALMS entry (`src/game/realms.js`)
`{ id, kind: 'realm' | 'homeworld', name, tagline, level, populate, day, words? }` - `day`: `null` = the realm's own lanterns decide the hour; a number fixes it (Dawnhaven: 1). `realmEntry(brief, level, populate)`
makes one; `tools/new-realm.mjs` registers it between the `<realm-imports>` / `<realm-entries>` markers. `?world=<id>` opens the page in any world; a world other than Gloaming Vale skips the title.

## The level descriptor (`makeLevel` builds it from the brief)
| field | meaning |
| --- | --- |
| `name`, `labels` | the name; five loading-screen lines |
| `world { size, cell }` | the heightfield (`n = size / cell`) |
| `spawn { x, z, yaw }` | where a fresh start puts the hero (also where the door's light puts him: `gp.arrivals[from]` overrides) |
| `valley { x, z, rx, rz, rimStart }` | the playable ellipse; from 0.965 of it steep ground is far rock |
| `lake { x, z, rx, rz, bed, name?, deepHint?, islets? }` | **required** (water, debug readout, drowning hint, `ctx.lakeD` read it): `NO_LAKE` when a realm has none (a realm with a `sea` has `NO_LAKE` with the sea's `name` and `deepHint`) |
| `sea { x, z, r, name, deepHint }` | optional: the ground is islands in a sea (`brief.sea = { name, deepHint, radius }`): no basin and no `dryLand`, the surface (`liquid`) drawn out to `r` (`water.js`: a disc with per-vertex fog), what is not an island is the fill (`country.mountain.base`, far under the surface: Skyweaver Spires' -28), a hero who falls in is set back on the last firm ground with `deepHint` (`game.js`) |
| `tide { period, amp, start, hint, tint }` | optional (needs a `sea` or a `lake`): the water rises and falls (Tideglass Reach: 90 s, 1.4 m either side of the mean, `start` 0.75). `Game.waterY` is the live height (`tideLevel(tide, game.time)`), `waterLo` / `waterHi` its extremes, and every world without a tide has `WATER_LEVEL` (0) in all three for ever. **What is decided NOW reads `waterY`**: the player's wading and drowning (`player.js` `_water`: from 0.95 m, wading at 0.62 of a run), the surface (`water.js` `tideSurface`: the whole group lifted to `waterY - WATER_LEVEL`, the tint of the vertices that can change tinted again in place), splashes, the ambience, the Snuffers and critters, the debug readout, the HUD's gauge. **What is made ONCE reads the mean level** (`WATER_LEVEL`): the ground's shape and textures, where props stand, the roads, the baked light - a realm's own script never reads `waterY`. The player's safe spot (where a drowning sets him back) is a collider (a deck) or ground over `waterHi + 0.6`. `hint`: what a hero who drowned on ground that is only under water at the high tide is told (UPPER CASE); `tint { shallow, deep, scale, shimmer, texture }`: the sea's colours over the shallows and the deeps, the metres of depth over which one becomes the other, the shimmer layer's tint and the surface's texture. `realm/tide.js` is the pure module (`tideLevel`, `tideLow`, `tideHigh`, `tideRate`, `tideDir`, `tideAbove`, `tideNext`, `drownDepth`, `refugeReach`, `tideProblems`) and `tools/tide-test.mjs` its test |
| `rockLine` | optional: the height (default 42) over which the ground picker draws far rock: a realm of high islands says where its own ground ends (Skyweaver Spires: 90) |
| `paths [{ id, surface, width, pts, shoulder? }]` | roads (`[x, z]` or `[x, z, y]`; carved into the ground, drawn as ribbons; `cobble`/`dirt` ribbons, `flagstone` a paved apron) |
| `rivers []` | streams (`{ id, width, pts [x, z, surfaceY] }`); unused by the kit |
| `height(x, z, L)` | the ground (the kit: ribbons + landforms + goal pads + lake + `dryLand`) |
| `massifs(grid, L)` | rock masses that are not heightfields (caves): `[Massif]` |
| `groundRule`, `cliffs { cool, warm }`, `warmRock`, `steepSlope`, `noRockPatches`, `noGrassPatches` | the ground's textures (see the picker's order below) |
| `lakeTextures { floor, shore, pebbles }`, `roadTextures { cobble, dirt }`, `farRock` | the realm's own textures for the lake's bed and edge, for its roads (the terrain under them and the ribbons drawn over it) and for the far mountains: texture names, taken from the brief by `makeLevel` |
| `areas [[name, x, z, r, y?]]` | the named places of the debug readout (every TRAVEL place must lie in one) |
| `environment` | the two lit states and skies (`engine/lighting.js` DEFAULT_ENVIRONMENT). A sky palette may also carry `cloudTop`, `cloudBot` and `ridge` (the clouds' top and underside and the distant ridges): without them the vale's lavender clouds and mountains are painted, which is wrong over ash or ice (`sky.js`; `realm-test` checks the sky wears them) |
| `liquid { texture, splash, burnDepth, shallow, deep, shimmer, emissive, tile, scroll }` | optional: the lake is not water (Emberfall Crags' lava: `texture: 'lava'`, `splash: 'lava'` for sparks, `burnDepth: 0.2` = the depth in metres that takes the hero, water's is 0.95, `shallow`/`deep` the tints of the surface over the shallows and the deeps, `shimmer` the additive layer, `emissive: 1` lights itself). `water.js` draws it, `player.js` burns the hero and `tools/walkmap.mjs` treats the burning depth as not walkable. Water physics stay global (`WATER_LEVEL` = 0): a lava lake is a basin below zero |
| `ambient { dusk }` | optional: `'ember'` swaps the dusk's fireflies for drifting embers |
| `goal { gateAt?, daySteps? }` | the gate opens after `gateAt` goals (default 4, when the level has a barrier); `daySteps`: the day after each goal |
| `brief` | the brief (the checker reads it) |

**The ground picker's order** (`terrain-mesh.js` `terrainPicker`; the debug readout says which rule chose a texture): lake floor/shore (`lakeTextures`) -> a road's own texture (`roadTextures`) -> river -> valley rim (far rock) ->
steep (> `steepSlope`: cliff) -> `h > 42` (far rock) -> **`groundRule`** -> village/forecourt/hollow of Gloaming Vale -> lake margin -> flowers -> default grass. A `groundRule` that answers for all flat
ground (snow) re-skins the realm; it cannot change what the earlier rules decided.

## The level script and its gameplay data
`populate(kit, world)` runs twice (dry, then wet) and must be deterministic. `world.gameplay` is the dry pass's `ctx.gp`:
`spawn`, `arrivals { fromRealmId: { x, z, yaw } }`, `beacons` (goals), `portals`, `enemies [{ x, z, variant: 'basic'|'bell'|'thorn', patrol, y? }]`, `gems [{ x, y, z, value }]` + `gemsTotal` (a multiple of 50),
`vases [{ x, y, z, variant, gems: [..] }]`, `chests [{ x, y, z, yaw, gems, secret? }]`, `walls [{ x, y, z, yaw, w, h, gems }]` (cracked walls: a ram breaks them), `hints [{ x, z, r, text, touch?, pad?, dur, y0?, y1? }]`
(text in capitals; `y0`/`y1` limit a zone to a height band), `npcs`, `bunnies [{ x, z }]`, `soundSources [{ name, x, y, z, range, vol, when? }]`, `braziers`, `portcullis`, `barrier { x, y, z, yaw, opts? }` (a sealed gate; `opts.tint` [r, g, b] recolours its field: the ice gate of Frostbloom Hollow is teal, the Dawn Gate's is violet),
`mushrooms [{ x, y, z, size }]` (bounce), `whirlwinds [{ id, x, y0, z, h, r }]` (updrafts: created lazily, `(gp.whirlwinds ||= []).push(...)`, so that a world without them has no such key and its hash is what it was; `realm/whirl.js`), `placed` (every prop: name, x, y, z, size, src), `counts`. Records get a `src` (the stage that made them): the debug readout points at the code.

* **Goals** (`gp.beacons`): `{ id, name, x, y, z, yaw, big?, model?, beam?: { off, on }, glow?, wisp?, flame?: false, spark?: { c0: [r, g, b, a], c1: [r, g, b, a] }, sparkle?: [r, g, b], sfx?: 'name' }` -> `BeaconSystem` (`defineBrief` checks the shapes: `spark` is the *burst* when it is lit, from and to, not a colour). The hero lights one by breathing fire within 6.6 m
  (a hit volume of radius 1.9 and +-3.2 m round `y + 2.4`, times 2.2 for `big`). Lighting one: banner `NAME + words.lit`, `N OF M + words.goals`, the day moves to the next of `daySteps`, a checkpoint is set;
  the last starts the finale.
* **The exit** (`gp.portals`, `kind: 'lift'`): `{ id, name, tag, kind: 'lift', shape: 'ring', flat: true, x, y, z, r: 2.6, cy: 16.5, catchR: 5.4, color, target, state: 'closed' }`: a ring of light that pops open
  over the last goal in the finale; a jump inside the ring of light on the floor (`catchR`) carries the hero up (`Player.carry`) and out to `target`. `exitStage` makes it; the floor under it must be level
  (`pad`) and walkable.
* **A glide goal on a shelf** (`situation: 'glide'` with no way on foot: Emberfall's stack in the lava) needs a way off as well as a way on: dry ground of the walkable country lower than the goal, 10 m or more off, within reach of a glide
  (`situations.js`); the TRAVEL generator marks its place `shelf: true` and the realm walker (`tools/realm-bot.mjs`, `tools/lib/glide.mjs`) glides to it and off again. A hero who falls in the lava comes back to the last firm ground, which is the shelf.
* **A country of islands** (Skyweaver Spires): the ground is ribbons with a small `fall` (4-7 m) standing in a `sea`; islands are 12+ m apart on foot unless a row of slabs joins them. **Slabs** are the prop `sky_slab` (`{ y, r }`: a flat top
  at `y` with a cylinder collider to stand on, `r` its radius): the walk map hops 3.6-6.2 m between cell centres to ground within 1 m in height (`flood({ hop: 6.2 })`), so a hop is a gap of 2-4.6 m between edges and a step of 0.9 m or
  less; the hero's own jump at a run is 8.7 m, so the slabs are 4.6 m across or more (`tools/skyweaver-check.mjs` holds the numbers). **Whirlwinds** (`gp.whirlwinds`, the object `whirlwind`, a `soundSources` entry `{ name: 'whirl', ... }`,
  hints, a ring of gems at the foot): a hero inside the column (radius `r` at the foot, widening to 1.7 `r`) is lifted 11 m/s, eased to a hover at `y0 + h`; he can press jump there and glide out (`realm/whirl.js`: `WHIRL`). A **lift** goal
  (`situation: 'lift'`) is one on the island a ride sets him down on: no way on foot, entered by a lift link, a way off by another link. **The air journey** (`brief.air = { startCells, links: [{ id, kind: 'glide', launch: [x, z], land: [x, z] } |
  { id, kind: 'lift', whirl: 'w1', land: [x, z] }] }`): `startCells` is how many 1.2 m cells of ground the start has on foot (`spawn.firm` for a country with no room); the checker (`tools/lib/air.mjs`) holds every link to the reach of a
  glide from a standing start (`glideReach`) or from a hover (`liftReach`) with the situation check's margin (90% of 0.75 of a ballistic reach), a line of sight with nothing in the way, a landing that is an island (120 cells or more); it floods the ground
  of every landing the hero can get to and judges every rule about walking (goals, gems, parts, secrets, the journey, the danger) by the whole journey; `air.links`, `air.reach`, `air.trap` (no island without a way off but the last goal's) and
  `air.whirls` are its own rules. A hero who falls into the sea comes back to the last firm ground.
* **A tide** (Tideglass Reach): the sea is a `sea` with a `tide`; the country is ridges and stacks standing in it (ribbons with a steep `fall`), and the ground the tide covers is a **shoal** (a landform of the realm's own: the fill raised along a line to a height a little under the mean level - bare at the low tide, wading at the mean, drowning at the high - never lowering a rock that stands in it, with `bars` of sandbars) with **banks** to stand on (round humps raised to 2.7 m, 1.3 m over the high tide: `bank()` never lowers; `mound()` raises every point under its floor and must not be used for them). The walk map treats ground deeper than 0.95 m under the water as not walkable: `flood(start, { water })` (the low tide by default, `tideHigh(tide)` for the high) and `flood(null, { seeds })` from many places at once. The things a hero must find standing stand over the high tide + 0.3 m; the TRAVEL places and Snuffers over the high tide too.
* **A bridge** (the situation `bridge`, the prop `glass_bridge`): a span `{ id, from: [x, z], to: [x, z], width }` between two stacks (`span()` in `tideglass/brief.js` works the ends out from the stacks' centres, **2 m inside the rim**: the top of a stack is flat only to about a metre short of its radius, and the controller will not step from a deck onto the steep rim of the ground even when it stands 1 cm higher). The prop draws half-blended panes between girders and keeps **three box colliders to a pane, each as high as the highest of the pane's glass over it** (`top: true`), so that the hero stands a hair above the glass; the layout gives the deck ends `ground + 0.08`.
* **A gate** (`gp.barrier`) shuts a way until `goal.gateAt` goals burn; with `level.summit` it also draws the ward of Gloaming Vale. `words.gate` is its banner. The Dawn Gate prop (`gate_pillars`) is 15.4 m wide at the plinths (pillars centred 5 m either side, plinths 2.3-7.7 m from the middle, an opening 6 m wide, a flat threshold slab 6.8 m by 4.8 m 0.14 m high, a lintel over it): **the ground at the gate must be no wider than the plinths and level under the threshold** or a hero walks round it or cannot climb onto it (the roads are carved to their own smoothed profile: pin the road level through the neck, controls with a third element are honoured exactly; Tideglass Reach's `neckRoad()`).
* **Doors** (Dawnhaven only): `gp.portals` of `kind: 'door'` with `target` (an awake door) or `null` (sleeping); `gp.arrivals[target]` is where the hero comes out.
* **Restored**: a realm entered again through Dawnhaven after it was saved starts restored (`Game._restore`: day 1, goals lit, gate open, ring open, free roam).

## The helpers (`ctx`, from `levelgen/helpers.js`, `levelgen/gameplay.js`, `realm/helpers.js`)
`ctx.put(name, x, z, params, footprint)` (place a registered prop; records it; `footprint` reserves its occupancy), `ctx.ok(x, z, { r, maxSlope, minH, maxH, path, river, lake })`, `ctx.scatter(name | fn, n, sampler,
okOpts, paramsFn, foot)`, `ctx.spot(x, z, opts)` (a clear nearby spot), samplers `ctx.inCircle / inRing / inBand`, `ctx.h(x, z)`, `ctx.slope`, `ctx.pathDist` (metres from a road's edge), `ctx.riverDist`, `ctx.lakeD`,
`ctx.anchor(prop, key, x, z, opts)` (a prop's local anchor in the world), `ctx.face`, `ctx.pathPoint(roadId, t)`, `ctx.rng` (`float`, `int`, `chance`, `pick`), `ctx.occ`; gameplay: `ctx.addEnemy / addVase /
addChest / addWall / addBunnies / addGem / gemArc / roadGems`; from the kit: `faceTo`, `flatSpot`, `along`, `roadAlong`, `roadOf`, `band`, `lampsAlong`, `regionPts`, `pointOn`.

## Props, textures, models
* **Props** (`src/game/props/**`, registry `props/index.js`): `{ fn(kit, params), size, note, defaults, anchors }`; `ctx.put` calls `fn`. `node tools/prop-lint.mjs` lints them; `tools/model-sheet.mjs`,
  `sprite-sheet.mjs`, `texture-sheet.mjs` draw sheets of models/sprites/textures to look at.
* **A realm's skin** (`brief.theme.skin = { textures: { moss: 'snow', ... }, palettes: { moss: { dark, light }, mossTop: [r, g, b], pine: { dark, light, under }, rune: [r, g, b] } }`): `makePopulate` puts it on the kit (`kit.skin`),
  and every prop built through `kit.b(texture)` wears the remapped texture (rocks snow-capped where they wore moss, pines under snow, one colour of meadow flower), with the tints in `palettes` where the
  prop reads them (rocks, stepping stones, arches, pines). `rune` is the tint of the standing stones' runes (Emberfall's burn orange, the Lantern Keepers' are violet). It is `null` for Gloaming Vale and Dawnhaven, whose props stay byte-identical. Props that name a texture in their own parameters (a tree's
  `canopy: 'leaves_blossom'`) are not remapped: say it in the layout.
* **Textures** (`src/engine/textures/world/*.js`, 16-colour-ish pixel art generated in code with `pix.js`): register a new one where its siblings are; the picker and materials use it by name.
* **Models** (`src/game/models/objects/*.js`, registry `models/index.js`): `makeModel(assets, name, opts)` -> `{ root, setLit?, update?, anchors? ... }`; `beacon.js` (Rig, `litBuilder`, recolouring) is the pattern for
  a goal object.

## The kit's files (`src/game/realm/`)
`brief.js` (`defineBrief`, `ptsOf`, `RULES`, `SITUATION_IDS`), `tide.js` (the tide, pure), `whirl.js` (whirlwinds, pure), `country.js` (`makeCountry`, `regionAt`, landforms: `basin`, `mound`, `dryLand`, `flatten`, `glade`, `ravine`, `pointOn`), `level.js` (`makeLevel`,
`NO_LAKE`), `rockmass.js` (`rockMass`: a mountain with caves from data), `populate.js` (`makePopulate`, `goalsStage`, `exitStage`, `gemsStage`), `helpers.js`, `situations.js` (`SITUATIONS`, `glideReach`), `index.js` (re-exports + `realmEntry`), `starter/` (the golden example).
