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
| `lake { x, z, rx, rz, bed, name?, deepHint?, islets? }` | **required** (water, debug readout, drowning hint, `ctx.lakeD` read it): `NO_LAKE` when a realm has none |
| `paths [{ id, surface, width, pts, shoulder? }]` | roads (`[x, z]` or `[x, z, y]`; carved into the ground, drawn as ribbons; `cobble`/`dirt` ribbons, `flagstone` a paved apron) |
| `rivers []` | streams (`{ id, width, pts [x, z, surfaceY] }`); unused by the kit |
| `height(x, z, L)` | the ground (the kit: ribbons + landforms + goal pads + lake + `dryLand`) |
| `massifs(grid, L)` | rock masses that are not heightfields (caves): `[Massif]` |
| `groundRule`, `cliffs { cool, warm }`, `warmRock`, `steepSlope`, `noRockPatches`, `noGrassPatches` | the ground's textures (see the picker's order below) |
| `lakeTextures { floor, shore, pebbles }`, `roadTextures { cobble, dirt }`, `farRock` | the realm's own textures for the lake's bed and edge, for its roads (the terrain under them and the ribbons drawn over it) and for the far mountains: texture names, taken from the brief by `makeLevel` |
| `areas [[name, x, z, r, y?]]` | the named places of the debug readout (every TRAVEL place must lie in one) |
| `environment` | the two lit states and skies (`engine/lighting.js` DEFAULT_ENVIRONMENT) |
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
`mushrooms [{ x, y, z, size }]` (bounce), `placed` (every prop: name, x, y, z, size, src), `counts`. Records get a `src` (the stage that made them): the debug readout points at the code.

* **Goals** (`gp.beacons`): `{ id, name, x, y, z, yaw, big?, model?, beam?: { off, on }, glow?, wisp?, flame?: false, spark?: { c0: [r, g, b, a], c1: [r, g, b, a] }, sparkle?: [r, g, b] }` -> `BeaconSystem` (`defineBrief` checks the shapes: `spark` is the *burst* when it is lit, from and to, not a colour). The hero lights one by breathing fire within 6.6 m
  (a hit volume of radius 1.9 and +-3.2 m round `y + 2.4`, times 2.2 for `big`). Lighting one: banner `NAME + words.lit`, `N OF M + words.goals`, the day moves to the next of `daySteps`, a checkpoint is set;
  the last starts the finale.
* **The exit** (`gp.portals`, `kind: 'lift'`): `{ id, name, tag, kind: 'lift', shape: 'ring', flat: true, x, y, z, r: 2.6, cy: 16.5, catchR: 5.4, color, target, state: 'closed' }`: a ring of light that pops open
  over the last goal in the finale; a jump inside the ring of light on the floor (`catchR`) carries the hero up (`Player.carry`) and out to `target`. `exitStage` makes it; the floor under it must be level
  (`pad`) and walkable.
* **A gate** (`gp.barrier`) shuts a way until `goal.gateAt` goals burn; with `level.summit` it also draws the ward of Gloaming Vale. `words.gate` is its banner.
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
* **A realm's skin** (`brief.theme.skin = { textures: { moss: 'snow', ... }, palettes: { moss: { dark, light }, mossTop: [r, g, b], pine: { dark, light, under } } }`): `makePopulate` puts it on the kit (`kit.skin`),
  and every prop built through `kit.b(texture)` wears the remapped texture (rocks snow-capped where they wore moss, pines under snow, one colour of meadow flower), with the tints in `palettes` where the
  prop reads them (rocks, stepping stones, arches, pines). It is `null` for Gloaming Vale and Dawnhaven, whose props stay byte-identical. Props that name a texture in their own parameters (a tree's
  `canopy: 'leaves_blossom'`) are not remapped: say it in the layout.
* **Textures** (`src/engine/textures/world/*.js`, 16-colour-ish pixel art generated in code with `pix.js`): register a new one where its siblings are; the picker and materials use it by name.
* **Models** (`src/game/models/objects/*.js`, registry `models/index.js`): `makeModel(assets, name, opts)` -> `{ root, setLit?, update?, anchors? ... }`; `beacon.js` (Rig, `litBuilder`, recolouring) is the pattern for
  a goal object.

## The kit's files (`src/game/realm/`)
`brief.js` (`defineBrief`, `ptsOf`, `RULES`, `SITUATION_IDS`), `country.js` (`makeCountry`, `regionAt`, landforms: `basin`, `mound`, `dryLand`, `flatten`, `glade`, `ravine`, `pointOn`), `level.js` (`makeLevel`,
`NO_LAKE`), `rockmass.js` (`rockMass`: a mountain with caves from data), `populate.js` (`makePopulate`, `goalsStage`, `exitStage`, `gemsStage`), `helpers.js`, `situations.js` (`SITUATIONS`, `glideReach`), `index.js` (re-exports + `realmEntry`), `starter/` (the golden example).
