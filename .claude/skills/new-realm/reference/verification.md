# Verification: the gates, and what each protects

Run from the repo root. Most need no server (Node builds the world headlessly: both level passes, no GPU); the browser ones need the dev server (`GV_HMR=0 node node_modules/vite/bin/vite.js` on :5173).
Verification here is a headless Chromium with a **software renderer** (SwiftShader): it proves the game runs and the data is right, not what a phone's GPU makes of it - say so when reporting.

## For the realm itself
| gate | command | protects |
| --- | --- | --- |
| the rules | `node tools/realm-check.mjs <id>` (41 for a realm with a brief; or `tools/<id>-check.mjs`, which adds the realm's own: `frostbloom-check.mjs` checks its frosted roads, its skin, the glacier and the ice vault) | the hard rules (deterministic build, firm start, reachable goals, the ring's floor, treasure) and the design principles (situations, journey, parts, levels, loops, dead ends, secrets, danger, gem trail, palette) |
| the places of the TRAVEL menu | `node tools/realm-travel.mjs <id>` then `node tools/travel-check.mjs` | every place can be stood on, clear, named, not in a pocket, in the walkable country (gate open); a place beyond a gate says `opens` |
| the journey in the real game | `node tools/realm-test.mjs <id>` | boot, the roads and the gate's field wear what the level says, every goal lit by fire, the day climbs, the gate opens, finale, the ring carries him out, Dawnhaven, back in restored, the door behind him leads home, a TRAVEL place beyond the gate opens it |
| the way, walked | `node tools/realm-bot.mjs <id>` | the real controller (slopes, steps, hops, collisions, the gate) gets from the start to every goal in order along the walk map's routes, and lights each |
| the map | `node tools/realm-map.mjs <id> map.png` and look | the shape of the design |
| screenshots | `tools/shot.mjs`, `tools/play.mjs`, `?world=<id>&at=x,z,yaw` | what it looks like; the start, each goal, the finale, a cave, the sky at both moods |

## For everything else (nothing may regress)
| gate | command |
| --- | --- |
| the old worlds are byte-identical | `node tools/world-hash.mjs` (an intended change: `--write` in the same commit, with the reason in the message) |
| the foundry | `node tools/foundry-test.mjs` |
| Gloaming Vale | `node tools/level-check.mjs`, `node tools/realm-check.mjs gloaming` |
| Dawnhaven | `node tools/home-check.mjs` (about 45 s), `node tools/home-bot.mjs`, `node tools/realm-check.mjs home` |
| the props | `node tools/prop-lint.mjs` |
| the game loop | `node tools/bot.mjs`, `node tools/playthrough.mjs`, `node tools/portal-test.mjs`, `node tools/menu-test.mjs`, `node tools/travel-test.mjs` |
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
