# Verification: the gates, and what each protects

Run from the repo root. Most need no server (Node builds the world headlessly: both level passes, no GPU); the browser ones need the dev server (`GV_HMR=0 node node_modules/vite/bin/vite.js` on :5173).
Verification here is a headless Chromium with a **software renderer** (SwiftShader): it proves the game runs and the data is right, not what a phone's GPU makes of it - say so when reporting.

## For the realm itself
| gate | command | protects |
| --- | --- | --- |
| the rules | `node tools/realm-check.mjs <id>` (41 for a realm with a brief, 45 when its islands are joined in the air, 48 when its sea has a tide; or `tools/<id>-check.mjs`, which adds the realm's own: `frostbloom-check.mjs` checks its frosted roads, its skin, the glacier and the ice vault; `emberfall-check.mjs` its scorched roads, the lava, the stack, the Maw and its ward, the Smelter's floors, that the mountains are walls; `skyweaver-check.mjs` the sea, the way on foot, every hop a fair one, the whirlwinds' shafts, the Loom in sight, turf on every island; `tideglass-check.mjs` the tide's numbers, the Low Road bare at the low tide and drowned at the high, the cairns, Pearl Rock, the sea cave's floors and fall, the bridges walkable end to end and landing on ground he can step onto, the Sea Gate across the whole neck with no step to climb, the lenses, the sky) | the hard rules (deterministic build, firm start, reachable goals, the ring's floor, treasure) and the design principles (situations, journey, parts, levels, loops, dead ends, secrets, danger, gem trail, palette) |
| the places of the TRAVEL menu | `node tools/realm-travel.mjs <id>` then `node tools/travel-check.mjs` | every place can be stood on, clear, named, not in a pocket, in the walkable country (gate open); a place beyond a gate says `opens` |
| the journey in the real game | `node tools/realm-test.mjs <id>` | boot, the roads and the gate's field wear what the level says, the sky wears the realm's palette, a lake that is not water is drawn with its texture and burns where it says (the deep and the shallows), the dusk's embers, every goal lit by fire, the day climbs, the gate opens, finale, **a tide** (the water, the surface drawn and the tint of its shallows follow the game's clock; the high tide drowns a hero on flat sand once and sets him back on dry ground, with the realm's words; on a cairn he stays dry), the ring carries him out, Dawnhaven (**he stands on his feet on a floor at this realm's door, level with it and still there two seconds later**: `tools/lib/homecoming.mjs`), back in restored, the door behind him leads home (and he comes out at the door again), a TRAVEL place beyond the gate opens it |
| the tide itself, with no browser | `node tools/tide-test.mjs` | the pure functions, the real `Player` in water that rises and falls (wading, drowning at the high tide, set back on ground the sea never reaches, a world with no tide as it was), the walk map at any water level and from many places at once, the surface that is drawn and its tint |
| the way, walked | `node tools/realm-bot.mjs <id> [--plan]` | the real controller (slopes, steps, hops, collisions, the gate, **glides**) gets from the start to every goal in order along the walk map's routes, and lights each; a glide goal it reaches by running off the ledge the glide check found and holding the glide, and leaves by gliding off again (`GLIDE_USE=0.8` makes it use less of the reach: how much room the glide has); in a realm with a tide each leg is begun as the water ebbs (routes planned for 0.5 m over the low tide, off the rims, the roads before the jumps) and a leg the sea drowns him on fails; a realm with a gate has it tried first by the real controller (32 runs, none may end standing beyond it); `--plan` prints the routes and walks nothing |
| the map | `node tools/realm-map.mjs <id> map.png` and look | the shape of the design |
| screenshots | `tools/shot.mjs`, `tools/play.mjs`, `?world=<id>&at=x,z,yaw` | what it looks like; the start, each goal, the finale, a cave, the sky at both moods |

## For everything else (nothing may regress)
| gate | command |
| --- | --- |
| the old worlds are byte-identical | `node tools/world-hash.mjs` (an intended change: `--write` in the same commit, with the reason in the message) |
| the foundry | `node tools/foundry-test.mjs` |
| Gloaming Vale | `node tools/level-check.mjs`, `node tools/realm-check.mjs gloaming` |
| Dawnhaven | `node tools/home-check.mjs` (about 90 s; it holds the way home from each of the five realms as data: a floor of its own height, over the water, clear, level with its door, on the walk), `node tools/home-bot.mjs`, `node tools/realm-check.mjs home` |
| the Guardian's Court (kind `arena`: `realm-check` does not apply) | `node tools/guardian-check.mjs` (36 checks: the arena, the fight's numbers, a player model that must win and three that must not, the gate, the words), `node tools/boss-test.mjs` (the brain, 44 checks), `node tools/boss-bot.mjs --ending` (the real controller wins and plays the ending out; `--ram off`, `--flame off` and `--idle` must NOT win), `node tools/guardian-test.mjs` (the last chapter in the browser, 12 checks) |
| the props | `node tools/prop-lint.mjs` |
| the game loop | `node tools/bot.mjs`, `node tools/playthrough.mjs`, `node tools/portal-test.mjs` (also: home from each of the five realms, on his feet at that realm's door), `node tools/arrival-test.mjs` (every way of putting him somewhere, in every world: a fresh start, each TRAVEL place, a respawn at each checkpoint, a set-back that would take him again), `node tools/menu-test.mjs`, `node tools/travel-test.mjs` |
| a full render fingerprint (browser; every geometry attribute of both old worlds) | the geohash harness of round 21 (scratch; `world-hash` is the quick Node version of it) |

A realm that wakes a door changes Dawnhaven (its door is awake: `gp.portals`, `gp.arrivals`): update the expectations that count sleeping doors (`home-check.mjs`, `portal-test.mjs`, `menu-test.mjs`/
`travel-test.mjs` if they list worlds), re-pin `world-hash` for `home`, and say so.

## Mutation-check what you add
A test that cannot fail proves nothing. For each new rule or test, break the thing it guards in a scratch copy (a git worktree) and see it fail: move a goal into the rock, delete a stone of the hop path, put
an enemy at the start, shift a chest onto the road, make the layout non-deterministic (`Math.random()` in a stage). The mutation runner pattern of rounds 19-20 (a spec of text replacements applied in a worktree,
each running the relevant check) is the way; keep the mutations list in the commit message or DESIGN.md.

## Shipping
README and `docs/DESIGN.md` (a **Round N** entry before the previous one; the Worlds table gains the realm), `npm run build:single` (writes `docs/index.html` and `dist/artifact.html`), smoke-test the built
file (`GV_URL=file:///.../docs/index.html node tools/portal-test.mjs`), commit (message ends with the two trailers the session asks for), `git push -u origin <branch>`, republish the Artifact. No PR unless asked.
