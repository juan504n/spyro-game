# Pitfalls: what went wrong in rounds 17-22, so that it does not go wrong again

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

**The kit**
* **Keep the starter passing.** It is the golden example the generator copies; `node tools/foundry-test.mjs` builds a scratch realm from it, checks it and plays it. A change to the kit that breaks it is a
  change every future realm would inherit.
* **Waivers are to-dos.** A shipped realm waives nothing, or says why in the brief.
