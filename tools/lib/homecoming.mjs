// How the hero stands when a realm brings him home to Dawnhaven, measured in the running game (shared by tools/realm-test.mjs, which brings him home by each realm's own ring and door, and
// tools/portal-test.mjs, which brings him home from all five). The place is the one Dawnhaven's arrival names for the realm he came from (home/layout.js `layoutDoors`): he stands there on his feet, on a
// floor, above the water, in front of that realm's door and level with it - and is still there a while after, not set back again and again by a hazard.
//
// Round twenty-five's lesson: Tideglass Reach's arrival had no height, the game put him on the terrain under it - on the lake, its bed, 3.3 m under the pier - and he drowned there and was set back to the
// same place, over and over; Skyweaver Spires' put him in the Frost Grotto, 31 m under its summit door. The test that was there compared where he stood on the map and not how high, so both passed.
//
//   const r = await homecoming(ev, 'tideglass');   // (after a second or two of standing in Dawnhaven)      homeOk(r)  - the verdict
// A realm with no door in Dawnhaven (the foundry's scratch realm) comes out at Dawnhaven's start: there is no door to measure against.
import { standOk } from './standing.mjs';

/** the facts about where he stands, from the page: `ev` is the page.evaluate of the test */
export const homecoming = (ev, from) => ev((from) => {
  const g = window.__game, p = g.player, q = g.portals.get(from), d = q ? q.def : null, a = g.gameplay.arrivals[from] || g.gameplay.spawn, sup = g.collision.support(p.x, p.z, p.y + 1, 0.9);
  const s = d ? Math.sin(d.yaw) : 0, c = d ? Math.cos(d.yaw) : 0;
  return {
    realm: g.realm.id, mode: g.mode, hud: g.hud.visible, at: [p.x, p.y, p.z].map((v) => +v.toFixed(2)), floor: +sup.y.toFixed(2), kind: sup.kind, grounded: p.grounded, dead: p.dead, water: g.waterY,
    doorY: d ? +d.y.toFixed(2) : null, arrival: +Math.hypot(p.x - a.x, p.z - a.z).toFixed(2), along: d ? +((p.x - d.x) * s + (p.z - d.z) * c).toFixed(1) : null, hint: g.hud.hintState && g.hud.hintState.text,
  };
}, from);

/** the verdict: in Dawnhaven, playing, standing (lib/standing.mjs: on a floor, over the water, no drowning hint), at the place the data names, and - where there is a door - in front of it (9-13 m) and level with it (1 m) */
export const homeOk = (r) => r.realm === 'home' && r.mode === 'play' && r.hud && standOk(r) && r.arrival < 0.5
  && (r.doorY === null || (Math.abs(r.at[1] - r.doorY) < 1.0 && r.along > 9 && r.along < 13));
