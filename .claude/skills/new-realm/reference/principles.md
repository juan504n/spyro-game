# The principles a realm is written against

Source: the round-19 research on the PlayStation Spyro games' homeworlds and levels. The full articles could not be fetched (the network proxy blocked the sites), so these are the findings as
web-search summaries reported them; where a claim matters, treat it as a design heuristic, not as scripture. Each principle below says where the foundry holds a realm to it.

## What the research said

* **A themed place.** Every hub has its own palette, sky and time of day, and music (Stewart Copeland scored each hub after playing an early build). The sky matters most for mood, and a
  palette should use only two or three base colours; accents sit on top of them.
* **Panoramic, with height as a reward.** The worlds are open and tall: you see where you are going before you can get there, and altitude (the glide, towers, ledges) is what exploring pays.
* **Collectibles lead you.** Gems trace the way through the space; a trail of them says "this way" without a word.
* **Secret branching paths, loops you can see before you can reach them, no dead ends.** Shortcuts and hidden rooms (cracked walls, whirlwinds, rooftops) reward the curious; a path always goes somewhere.
* **Portals in very different situations**, never the same: beside the landing, at the end of a hedge maze, up a tower by a whirlwind, through a narrow gap into a stone dragon's mouth, in a tunnel
  behind an NPC, in a small cave on a platform, down a well, underwater.
* **Interiors with their own character:** marble, magically lit caves; ice-rink caves and a secret waterfall; an underground stream into a marble pool; hidden rooms behind cracked walls.
* **Hubs are safe; hazards grow.** The hubs of the third game have no enemies; the levels get harder as you go, and later games add environmental hazards.

## How the foundry holds a realm to them

| Principle | Where the brief says it | What checks it |
| --- | --- | --- |
| A themed place: few base colours | `theme.palette` (1-3 names), `theme.ground`, `environment` (two skies) | `defineBrief` (palette <= 3), `design.palette` (<= 7 ground textures beyond rock) |
| A country of parts, not an open field | `country.regions` (>= 5 ribbons, each a place with a character) | `defineBrief`, `design.parts` (every part can be walked along its line) |
| Height as a reward, levels | the ribbons' heights span >= 25 m; the highest ground holds something | `defineBrief`, `design.levels`, `design.height` |
| Goals in very different situations | `goals[].situation` (>= 4 kinds among 5; the last is somewhere grand) | `defineBrief`, `goal.<id>` (the world really has water round the island goal, a roof over the cave goal ...), `design.varied` |
| Walks that differ a great deal | the order and places of the goals | `design.journey`: the first goal under 140 m of walking, the farthest over 300 m, no two within 15 m of each other, the finale among the two farthest |
| Collectibles lead you | `roads[].gems` (trail along each road) | `design.leads` (80% of every 12 m of road has a gem within 7 m), `gems.air` (gems in mid-air are a minority) |
| Secrets, off the road, one behind a wall | `secrets` (>= 3), chests with `secret: id`, `ctx.addWall` | `design.secrets`, `design.secrets.off` (8 m from any road), `design.secrets.sealed` (one needs the ram), `design.secrets.reach` |
| Loops, shortcuts | the road list | `design.loops` (the roads make a cycle) |
| No dead ends | each road ends at a junction, the start, or a reward | `design.deadends` |
| No enemies where you begin; hazards grow | `danger.safeRadius` (30 m), the Snuffers' places | `enemies.safe`, `design.danger` (the first third of the walk is the quietest, the busiest at least twice it, two kinds of Snuffer) |
| A world has its own creatures, and each asks something different of the hero (flame, ram, jump, a flank, a corner, patience) | the Snuffers' kinds (`foes/kinds.js`) in the layout's marks | `enemies.cast` (at least five kinds of Snuffer, three of them the new foes), `enemies.room` (a Ramhog has ground to step off its line) |
| Each lantern asks something different of the hero (an order to remember, a ring to turn over, a run against a clock, an aim and a count, a sport, a mechanism, a chase, a fight, a glide through hoops), and the first is plain: it teaches the lantern; failing costs a try and never a life | `goals[].trial` in the brief (`trials/place.js`), `theme.trials` | `trials.mix` (the first lantern plain, at least three kinds in front of the others, none twice running), `trials.fair` (every trial on level, dry, clear ground the hero can walk to, within 110 m of its lantern; a circuit's ways walkable and its clock enough for them; a Pilferling's country to run in; a course of rings a ledge to leap from, a level run to its lip, hoops that hang clear and that the model of the hero can fly) |
| A gentle road | the roads' heights | `design.grade` (< 0.5 over 10 m; the game cannot draw a road above 0.74: `roads.grade`) |
| Caves with their own light, hidden rooms | `massifs` (rock masses, see recipe), cracked walls | the `cave` situation (a roof over the goal), `design.secrets.sealed` |

A realm may waive a rule it breaks on purpose (`brief.waive: [['design.loops', 'why']]`); the reason is printed on every run. Gloaming Vale (before the rules) and Dawnhaven (a hub) have their own
documented departures in `tools/lib/realm-rules.mjs` (LEGACY): that is where the thresholds were calibrated.

## The situations (what each one means, and how it is checked: `src/game/realm/situations.js`)

| id | the place | the check |
| --- | --- | --- |
| `landing` | beside the arrival: the first goal, in sight of the start, where the hero learns what a goal is | under 140 m of walking from the start |
| `clearing` | level open ground off the road, ringed by trees and rocks | slope < 0.3, 3-45 m from a road, >= 4 trees/rocks within 24 m |
| `island` | out on the water: an islet reached by stepping stones or a glide | water in >= 5 of 8 directions within 14 m |
| `summit` | on top: the highest ground for 60 m, far above the start, at the end of a long climb | >= 18 m above the start, highest within 60 m, > 150 m of walking |
| `cave` | inside the rock: a tunnel or chamber under a roof, lit by crystals and torches, behind something | under a massif's roof (over the goal, or all round it: a skylight over the goal itself is fine), reachable |
| `glide` | across a gap: a shelf reached by gliding from higher ground (a long way round on foot is allowed, a short one is not) | a launch ledge within `glideReach`, no short walk |
| `lift` | up a whirlwind: the island a ride sets the hero down on (Skyweaver Spires' spire) | no way on foot, entered by a lift link of `brief.air`, a way off by another link |
| `bridge` | out over the water, reached by a span of the realm's own making (Tideglass Reach's glass bridges between sea stacks) | water in >= 5 of 8 directions within 14 m; the walk to it crosses >= 12 m of bridge (a prop surface more than 3 m over the ground) |
| `puzzle` | sealed until something is done: a cracked wall, a gate the other goals open | unreachable while shut, reachable once the walls are broken and the gate open |
| `crater` | in a bowl: lower than the rim all round, guarded | the rim 4 m higher in 11 of 16 directions at 30 m, >= 2 Snuffers within 30 m |

Ideas the research listed that the game does not do yet (good for a realm that wants something new; whirlwinds that lift the hero were done by Skyweaver Spires, a tunnel behind a waterfall by Tideglass Reach): a hedge (or ice) maze, cannons that clear a path, a balloonist to the
next world, underwater tunnels, a portal that shows the sky of the world behind it.

## What a moving hazard asks (the tide of Tideglass Reach: `reference/contract.md`, the `tide.*` rules)

The tide is a hazard that comes and goes, and the principle behind its rules is the one the research gives for every hazard in these games: **the hero must be able to read it, and must never be trapped by it.** *Readable:* a gauge on the HUD, posts in the water painted at the low tide, the mean and the high, the water's colour that is the depth under it, a hint in the realm's words when it takes him. *Never trapped:* everything he finds standing is over the high tide (`tide.dry`), ground he can stand on at the high tide is within the reach of a wading hero while the water rises over his head, halved (`tide.refuge`), where a drowned hero is set back is near (`tide.shore`), no way is shut for long (`tide.wait`), the first goal and the last are open at every hour (`tide.open`). *A real part of the journey:* the tide shuts at least one way (`tide.gates`) and takes a real share of the ground (`tide.takes`) - or it is scenery.
