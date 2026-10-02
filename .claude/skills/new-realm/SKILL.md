---
name: new-realm
description: Design and build a new realm (a level, "world") for this Spyro-style game - lay its foundation with the realm foundry, write its design brief from the principles of the PS1 games' hubs and levels, build its places, and hold it to the checks. Use when asked to add, design, start or extend a realm / level / world (Frostbloom Hollow, Tideglass Reach, Emberfall Crags, Skyweaver Spires, a new one), or to wake a sleeping door of Dawnhaven.
---

# New realm: the foundry workflow

A realm is a standalone level the hero enters through a door of Dawnhaven and leaves through a ring of light over its last goal. The **foundry** makes the foundation of one in minutes and then holds
the design to what made the original games' worlds good, as code. You supply the design and the places; the tools supply the boilerplate and the verdict.

| Piece | Where |
| --- | --- |
| the kit a realm is built on (ground from ribbons, level descriptor, level-script stages, goal situations) | `src/game/realm/` |
| the golden example the generator copies (a small complete realm that passes every rule) | `src/game/realm/starter/` |
| generator: foundation of a new realm, registered | `node tools/new-realm.mjs <id> --name "NAME" --tagline "..." [--door <door id> --wake-door]` |
| the rules: hard (it works) + design (the principles) | `node tools/realm-check.mjs <id>` (rules in `tools/lib/realm-rules.mjs`) |
| a map of the built world (terrain, roads, goals, Snuffers, chests, hints, props) | `node tools/realm-map.mjs <id> out.png` |
| the TRAVEL menu's places for the realm, found and validated | `node tools/realm-travel.mjs <id>` |
| the realm played end to end in the real game | `node tools/realm-test.mjs <id>` (dev server on :5173) |
| the foundry tested as a whole (generates a scratch realm, checks, plays it) | `node tools/foundry-test.mjs` |
| Gloaming Vale and Dawnhaven must not change by accident | `node tools/world-hash.mjs` |

Read `reference/principles.md` first (what a good realm is, and which rule enforces each principle), `reference/recipe.md` when building, `reference/contract.md` for the engine's data, `reference/verification.md`
for the gates, `reference/pitfalls.md` before debugging anything strange.

## The workflow

**1. Brief the realm (design before code).** Settle, in the user's words if they gave any, then in your own: the id (`frostbloom`), NAME and TAGLINE in capitals, the Dawnhaven door that leads to it
(`src/game/home/level.js` DOOR_DEFS: `target: null` is a sleeping door), the **theme** (two or three base colours, a sky for each of its two moods: night before its goals are lit, dawn after), the
**journey** (the parts of the country in order, each with a character; at least five; heights that span 25 m or more), the **goals** (3-9; each in a different *situation*: `landing`, `clearing`, `island`,
`summit`, `cave`, `glide`, `puzzle`, `crater` - at least four different kinds among five), the **secrets** (three or more, off the road, one behind a cracked wall), the **danger curve** (quiet start, harder
Snuffers as the way climbs). Do not ask the user about things the principles already decide; ask only when the theme itself is open.

**2. Lay the foundation.**
```
node tools/new-realm.mjs <id> --name "FROSTBLOOM HOLLOW" --tagline "A REALM OF ICE AND BLOSSOM" --door <door id> --wake-door
```
This copies the starter into `src/game/<id>/` (brief.js, level.js, layout.js, index.js), writes `tools/<id>-check.mjs`, registers the realm in `realms.js`, finds and registers its TRAVEL places, and runs
the checker. You now have a realm that builds, boots at `?world=<id>` and passes every rule, with the starter's design and one waiver (`design.loops`) as a to-do.

**3. Write the design into `brief.js`.** Replace the starter's regions, lake, roads, goals, exit, secrets, words, sky. Everything the other files need to know about positions is read from the brief, so the
design lives in one place. `defineBrief` refuses a brief that is not a design yet (too few parts, goals alike, no secrets...). Draw it as you go: `node tools/realm-map.mjs <id> map.png` and look at it.

**4. Build the places.** `layout.js` is a list of stages (`makePopulate(BRIEF, [goalsStage, layoutX, ..., exitStage, gemsStage])`): the kit provides the goals, the ring of light and the treasure; each part of the
country is a function of your own that dresses it (props, enemies, vases, chests, walls, hints). `level.js` takes landforms the ribbons cannot make (`glade`, `ravine`, `flatten`, `mound`, rock masses
for caves via `massifs`, a `groundRule` for the realm's own ground). New art goes where it belongs (`reference/recipe.md`: textures, props, goal model, environment).

**5. Run the checker until it is quiet, then delete the waivers.** `node tools/realm-check.mjs <id>` prints FAIL (fix it), WAIVE (a to-do you wrote or the starter left) and PASS. A rule may be waived only
with a reason in `brief.waive`; a finished realm waives nothing. Add the realm's own checks to `tools/<id>-check.mjs`.

**6. Refresh the TRAVEL places** after the layout settles: `node tools/realm-travel.mjs <id>`; then `node tools/travel-check.mjs`.

**7. Play it.** `node tools/realm-test.mjs <id>` (boot, light every goal with fire, finale, ring, Dawnhaven, back restored), then look at it for real: screenshots from the dev server (`?world=<id>`,
`tools/shot.mjs`, `tools/play.mjs`), from the start and from each goal; the software-rendered headless browser is not a phone's GPU - say so when reporting.

**8. Ship** (see `reference/verification.md`): the other worlds unchanged (`world-hash`) or the change pinned on purpose, the regression suite, mutation-check what you added, README and `docs/DESIGN.md`
(a "Round N" entry before the previous round's), `npm run build:single`, smoke-test the built file, commit with the repo's trailers, push, republish the Artifact.

## Rules of the house

* Everything a level script does must be deterministic: it runs twice (dry, wet) - use `ctx.rng`, never `Math.random`, and never read the other pass's state.
* No ripped assets: every texture, model and sound is generated in code (the README's promise). Name no model identifier in commits, comments or pushed files.
* A new world must not disturb the old ones: `node tools/world-hash.mjs` before and after; an intended change is pinned with `--write` in the same commit.
* Keep the generator honest: if you learn something every realm needs, put it in the kit (`src/game/realm/`) or the starter, not in one realm, and run `node tools/foundry-test.mjs`.
* The `Workflow` tool (multi-agent orchestration) is for when the user asks for it; this skill works with ordinary tools.
