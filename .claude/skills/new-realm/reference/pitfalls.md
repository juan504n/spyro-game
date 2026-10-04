# Pitfalls: what went wrong in rounds 17-24, so that it does not go wrong again

**Building a level**
* **`lake` is required.** The water, the debug readout, the drowning hint and `ctx.lakeD` all read `level.lake`. A realm without a lake uses `NO_LAKE` (a speck 6 km away); `makeLevel` does it for you.
* **The level script runs twice** (dry, then wet) and the second must place exactly what the first did: `ctx.rng` only, no `Math.random()`, no state from the other pass. Gameplay data is kept from the dry pass.
  `build.deterministic` checks the counts. A layout that reads the colliders of an earlier stage sees the same ones in both passes only if it stays in the same order.
* **Nothing in a cave from the scatter.** `ctx.ok` refuses a spot under a massif's roof (or in the rock); caves are dressed by hand. A crystal cluster's collider is wide: a gem hung near one ends up
  inside it (`gemsStage` weeds those out; hand-placed gems are filtered too).
* **A gem total is a multiple of 50** (`gemsStage` tops up), and the HUD total is what can be collected: dynamic drops (Snuffers, vases, chests, walls) count.
* **Features under ~5 m alias on a 2.4 m grid.** A crest of 4 m draws cleanly; a narrower wall is a sawtooth. A ribbon narrower than ~7 m is a trench with ragged edges.
* **Jagged rock/grass borders** came from a per-cell coin toss; levels now name one `steepSlope` and the border is cut along that contour (`noRockPatches: true` keeps hills domes of one ground).
* **A road is not drawn on ground steeper than 0.64 rad** (`ROAD_MAX_SLOPE`): a grade over ~0.74 loses its ribbon (`roads.grade`). Keep roads under 0.5.
* **Valley rim and far rock:** from 0.965 of `valley` steep ground is far rock, and **any ground higher than 42 m is far rock whatever the `groundRule` says** (it comes after that rule in the picker):
  a snowy summit above 42 m is grey rock unless a road's own texture lies on it. Keep the places that must wear the realm's ground below 42 m, or accept the rock. Mountains must stay higher than the
  ribbons (the kit's `peaks` are 34-56 m: a summit ribbon above 58 m stands over them).
* **A goal needs a floor:** the ring of light comes down on the floor under the last goal (`catchR` 5.4): `makeLevel` flattens a pad under every goal; `exit.floor` checks the floor is level and walkable.
* **The ward and `level.summit`:** Gloaming Vale's gate draws a ward only when the level has `summit`; a realm without one has a plain barrier. The TRAVEL arrival code checks `level.summit` too.
* **`onBeacon` opens the gate at `level.goal.gateAt` goals (default 4)** and says `words.gate`: set both for a gate that opens at another count.
* **Doors count:** waking a Dawnhaven door changes `home-check.mjs`, `home-bot.mjs`, `portal-test.mjs` (they count sleeping doors) and Dawnhaven's `world-hash` (heights, props and gems stay; the gameplay hash moves with the door's state).
* **A goal under its own skylight is still in a cave.** The `cave` situation looks at the goal and round it (4.5 m, six of eight points under a roof); a shaft of air over the goal alone does not make it open ground.
* **Under a cave's roof the highest surface is the roof.** `collision.support(x, z, 1e3, 1e3)` answers the top of the mountain; ask with the height of the floor you mean (`support(x, z, floorY, 0.9)`). The TRAVEL
  generator does (`ref`); a script of your own that finds places must too.
* **A prop that names a texture itself ignores the skin** (`kit.skin` remaps what is built through `kit.b`, not a parameter like a tree's `canopy`): a blossom tree is asked for as `canopy: 'leaves_blossom'`.
* **`ctx.put` footprints reserve ground:** a tall prop with a wide footprint (the Icefall's `13`) keeps trees and rocks off a road's end; its origin is checked against roads too (`props.roads`), so a prop a road
  runs through the middle of (a gate, a fall) is on the checker's list of those that may (`OK_ON_ROAD`).

* **High ribbons need walls** (`mountain.margin`; Emberfall Crags): with a rim at 24 m and a gorge at 34 the noise's mountains are lower than the floors beside them and the walk map climbs out over them. The
  margin is opt-in (the other two worlds' ground is byte-identical).
* **Ribbons blend their heights**: a declared height is not the ground's if a wide ribbon or a spur is near (`design.parts`); and a ribbon next to the lake must reach the bank top or a crest of mountain stands between.
* **Lava burns where water does not drown**: `burnDepth` is read by the player (a touch burns) and by the walk map (the shallows of a lava lake are not ground to stand on: `WET`), so a "way off" must be dry
  ground (>= 0.6 m over the lake). A hero who falls in comes back to the last firm ground: for a goal on a stack, the stack itself.
* **A glide that is just in reach is not a glide a hero can make from anywhere**: the situation check's `GLIDE_MARGIN` (0.75 of a ballistic reach) is a person's, and the real controller lands at about 99 % of the
  checked reach; give the ledge room to run up and a high launch (Emberfall: 36 m across, 7 m down, from the rim to a stack 15 m up).
* **A realm's own colours need their own keys**: pink clouds over ash, violet runes on orange stones, white snow caps on ash, honeycomb lava, green flowers: each was a first-screenshot finding. Name them
  (`cloudTop/cloudBot/ridge`, `skin.palettes.rune`, `mossTop`, a bigger `liquid.tile`).
* **A road's grade is measured along it**, not as the straight line between two points: a hairpin made a 10 m chord look steeper than the road is (`design.grade`).

**Checks and tools**
* **The walkmap cannot do everything the hero can.** It walks and steps up 0.62 m, takes drops of 0.9 m and (with `hop`) jumps 6.2 m between ground of about the same height; it cannot ride a bounce mushroom,
  climb the windmill's inner stair, or glide. Goals that need those are `glide` situations (checked by reach) or waived with a reason, as in Gloaming Vale's LEGACY list. The realm walker (`realm-bot`) does glide: it asks `tools/lib/glide.mjs` for the ledge to launch from and the ground to land on, and the real controller's glide must come down on firm ground near the goal.
* **A vase's own collider blocks the vase** if the runtime colliders (chests, vases, walls, NPCs) are added before the placement checks: add them after (see `tools/lib/realm-rules.mjs`).
* **The headless world has no GPU assets:** props register colliders and records, not meshes. `Collision` in tools is built with `addRuntimeColliders` to match the game's.
* **Terrain-hash pins:** `tools/world-hash.mjs` fails on any change to a pinned world; that is the point. Pin on purpose, in the same commit.
* **Port and process hygiene:** `pkill -f` kills your own shell if the pattern appears in your command line - kill by PID. A foreground `sleep` is blocked: poll with a loop or run the command in the background.
  A scripted browser run wants `GV_HMR=0` on the dev server (hot reload reloads the page under a test).
* **`player.place()` also makes the spot the hero's safe place** (where a fall, a drowning or a burn brings him back): a test that puts him in lava must set `player.safe` to somewhere dry afterwards, or he is "saved" back into the lava.
* **Browser tests drive the app's clock** (`window.__app.update(1/30)` in a loop) instead of waiting: the title/intro are skipped for any world but Gloaming Vale; `?skip=1` starts Gloaming Vale at once.
* **The software renderer is slow and not a phone's GPU.** Screenshots take seconds; say what was and was not verified. A real device may differ in fill rate, MSAA and fog.

**A country of islands** (Skyweaver Spires)
* **A hop the flood allows is not a hop a hero at a run lands.** The walk map hops 3.6-6.2 m between cell centres, but the controller's jump at a run is 8.7 m: slabs 4.6 m across with 3.4 m gaps were overshot by the bot (it jumped off the far edge of one slab and
  flew past the next). Make the slabs 5-6 m across, the gaps 3 m, and let the walker hop with care (`goto(..., { careful: true })`: 0.7 of full speed, a jump at the very edge); a person walks them.
* **Islands closer than 6.2 m are one island to the flood** (it hops them): keep the tops 12+ m apart unless a row of slabs is meant, or `on foot he can reach only the Skygate and the Cloud Islet` (the realm's own check) fails.
* **`gems.air`**: a gem on a slab hangs over the sea as far as the terrain is concerned. In a country with an air journey the floor under a gem is whatever he would stand on (`collision.support`); in every other world the old rule stands (Gloaming Vale's sky-isle gems are aerial by it, and the rules were calibrated on that).
* **A glide goal wants one glide from a launch ledge**: the situation check looks for a ledge within reach of the *goal*, not of the landing. A bell 70 m inside the island the glide lands on failed it; the bell stands near the landing.
* **A secret off the road is 8 m from its carved edge**, measured at the nearest grid vertex (2.4 m cells): ask 10 m from the centreline, more beside a wide road (`design.secrets.off`). `ctx.pathDist` is what the rule reads.
* **A whirlwind is not a lift unless he can glide out of it**: `whirlStep` sets `jumpsUsed >= 1` (a glide needs a jump used), and a glide lasts while jump is held: a test that presses and releases jump before it looks sees no glide.
* **TRAVEL in a country of islands**: the walkable country is the whole journey (`journeyMap` in `tools/lib/air.mjs`), the pocket test counts hops (a spire is 78 cells of its own), and a Dawnhaven place within 6 m of a door that woke must be moved (`home/north-passage`, `home/summit`).
* **Words with a count in them**: the Elder said "1 STILL SLEEP" when one door was left (`home/dialogue.js`).

**A sea with a tide** (Tideglass Reach)
* **The tide moves nothing that is built once.** The ground, its textures, where props stand, the roads and the baked light are made at the MEAN level (`WATER_LEVEL`); only what is decided now reads `Game.waterY`. A level script that read the live level would build a different world each run and `build.deterministic` would say so.
* **A landform that raises ground to a floor raises everything under it.** `mound()` as a bank lifted the whole world to -0.5 m (every height in it); a bank is a hump that never lowers and rises only inside its radius (`bank()` in `tideglass/level.js`).
* **A road is carved to its own profile, and the profile is the ground smoothed over 13 m** (`terrain.js` `pathProfile`: three passes of a 9-point mean; control points with a third element are pinned exactly, but one pin is a spike in a slope). A flat thing on a road - a gate's threshold slab, a deck's apron - ends up a step high on a slope: the flat pad under the gate was tilted by the road through it and the threshold stood 0.63 m over the ground in front of it, a hair more than the 0.62 m a hero climbs. Pin the road level at several points through the place, and check the step (`tideglass-check`).
* **The Dawn Gate's plinths cover 2.3-7.7 m either side of its middle.** A ridge neck of 15 m left a strip of ground outside them and the walk with the gate shut was 7 m longer than with it open: the neck must be no wider than the plinths, and `walkShut` must not reach what is behind the gate.
* **The player's rule for steep faces read the terrain under a prop.** `player.js` stops a runner climbing a steep face (the terrain's normal under him steeper than `SLOPE_WALK`, and `heightAt` rising), and `heightAt` counts a prop's top: a deck that rises a few centimetres over the crest of a stack's rim read as a face being climbed and the hero stood still on it with a full stick, for some positions across its width. The rule now skips a hero walking on a prop that rises (`control-test` holds it with the real `Player`). Still: a bridge lands 2 m inside the rim of a stack (flat only to a metre or so short of its radius), a hair (0.08 m) over the ground it lands on, and its colliders are never lower than its glass; `tideglass-check` looks for steep terrain under or beyond its ends.
* **A route that is the shortest path hugs every corner**, and a runner does not turn on a rim: the walker keeps every cell of a route as a point, keeps 2.5-3 m from a cliff's rim (a metre of deck round a cell on a bridge), and takes the roads before the jumps (the walk map's hop across a notch at the stair's corner was real to the map and a fall to the controller). Plan the walker's routes for the water as it stands at the start of the window the leg is begun in, not at the bottom of the tide: a route across ground that is only wadable at the very bottom drowned him.
* **A TRAVEL place must be 6 m from a Snuffer and from an awake door's light**: a Snuffer on an 8 m stack leaves no place on it, and Dawnhaven's `pier-end` (5 m from the door that woke) moved to the spot the realm's own door puts him (11 m).
* **A test that stands a hero on a cell must stand him on flat ground**: the first cell the drowning test picked was on the foot of a bank, and he slid into the deep before the tide came.
* **A walk with hops is not a walk a person does.** `flood({ hop })` is for goals that cannot be reached without a jump (slabs, lily pads); it is not what a road is. A realm walker asks for a hop-free route first.
* **A door's arrival is a floor, and a test must look at how high.** `gp.arrivals[from]` (where the hero comes out when a realm brings him home to Dawnhaven) had x, z and yaw and no height, and the game falls back to the terrain: right for a door on the ground, wrong for a door on a pier (the lake's bed, 3.3 m under the water: he drowned there and was set back to the same place, for ever: `place()` makes the spot his safe spot) or on a summit (the floor of the mountain, 31 m under the door). A phone found it, not the tests: `realm-test` compared x and z within 2.5 m, `portal-test` a distance on the map, and `home-bot` places the hero with the bot's `place()`, which falls back to the terrain too. A door that stands over the ground names its `floor` in `DOOR_DEFS`; `home-check` holds every arrival to a floor (collision's `support` agrees with the data), over the water, clear, level with its door and on the walk; `tools/lib/homecoming.mjs` (used by `realm-test` and `portal-test`) holds the trip in the running game, with two seconds of standing.
* **A test that places the hero must not use the thing under test to do it**: a `place()` that falls back to the terrain agrees with an arrival that falls back to the terrain. Put him through the real path (`app.travelTo('home', { from })`) and ask what he stands on afterwards (`collision.support`), not where he is on the map.
* **Words outlive the state they describe**: the summit said "THE SKYWEAVER DOOR IS SEALED, FOR NOW" for a round after the door woke (the first thing read on coming home to it); `home-check` fails a hint that calls a door sealed or asleep while every door is awake.

**The kit**
* **Keep the starter passing.** It is the golden example the generator copies; `node tools/foundry-test.mjs` builds a scratch realm from it, checks it and plays it. A change to the kit that breaks it is a
  change every future realm would inherit.
* **Waivers are to-dos.** A shipped realm waives nothing, or says why in the brief.
