# Pitfalls: what went wrong in rounds 17-21, so that it does not go wrong again

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
* **Doors count:** waking a Dawnhaven door changes `home-check.mjs`, `portal-test.mjs` (they count sleeping doors) and Dawnhaven's `world-hash`.

**Checks and tools**
* **The walkmap cannot do everything the hero can.** It walks and steps up 0.62 m, takes drops of 0.9 m and (with `hop`) jumps 6.2 m between ground of about the same height; it cannot ride a bounce mushroom,
  climb the windmill's inner stair, or glide. Goals that need those are `glide` situations (checked by reach) or waived with a reason, as in Gloaming Vale's LEGACY list.
* **A vase's own collider blocks the vase** if the runtime colliders (chests, vases, walls, NPCs) are added before the placement checks: add them after (see `tools/lib/realm-rules.mjs`).
* **The headless world has no GPU assets:** props register colliders and records, not meshes. `Collision` in tools is built with `addRuntimeColliders` to match the game's.
* **Terrain-hash pins:** `tools/world-hash.mjs` fails on any change to a pinned world; that is the point. Pin on purpose, in the same commit.
* **Port and process hygiene:** `pkill -f` kills your own shell if the pattern appears in your command line - kill by PID. A foreground `sleep` is blocked: poll with a loop or run the command in the background.
  A scripted browser run wants `GV_HMR=0` on the dev server (hot reload reloads the page under a test).
* **Browser tests drive the app's clock** (`window.__app.update(1/30)` in a loop) instead of waiting: the title/intro are skipped for any world but Gloaming Vale; `?skip=1` starts Gloaming Vale at once.
* **The software renderer is slow and not a phone's GPU.** Screenshots take seconds; say what was and was not verified. A real device may differ in fill rate, MSAA and fog.

**The kit**
* **Keep the starter passing.** It is the golden example the generator copies; `node tools/foundry-test.mjs` builds a scratch realm from it, checks it and plays it. A change to the kit that breaks it is a
  change every future realm would inherit.
* **Waivers are to-dos.** A shipped realm waives nothing, or says why in the brief.
