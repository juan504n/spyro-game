// Is the hero standing, in the running game? What every way of putting him somewhere (a fresh start, a door, a ring of light, a place of the TRAVEL menu, a respawn at a checkpoint) must leave him: on his
// feet, on a floor the collision layer says is there, above the water, not dead and not being set back by a hazard again and again. The facts are read from the page, the verdict is plain data.
//
// Round twenty-five's lesson: Dawnhaven's arrival for Tideglass Reach had no height, so the game put the hero on the bed of the lake under the pier and he drowned there for ever; the tests that were there
// compared where he stood on the map and not how high. Ask what he stands ON (`collision.support`), not where he is.
//
//   const r = await standing(ev);   standOk(r)

/** the facts about how he stands, from the page: `ev` is the page.evaluate of the test */
export const standing = (ev) => ev(() => {
  const g = window.__game, p = g.player, sup = g.collision.support(p.x, p.z, p.y + 1, 0.9);
  return {
    realm: g.realm.id, mode: g.mode, at: [p.x, p.y, p.z].map((v) => +v.toFixed(2)), floor: +sup.y.toFixed(2), kind: sup.kind, grounded: p.grounded, dead: p.dead, inWater: p.inWater, water: g.waterY,
    hint: g.hud.hintState && g.hud.hintState.text, trail: (g.trail || []).slice(-3).map((e) => `${e.text}${e.n > 1 ? ` x${e.n}` : ''}`),
  };
});

/** the verdict: grounded and alive, his feet on the floor the collision says is under him (0.15 m), a quarter metre over the water, and no drowning hint on the screen */
export const standOk = (r) => r.grounded && !r.dead && Math.abs(r.at[1] - r.floor) < 0.15 && r.at[1] > r.water + 0.25 && !/TOO DEEP/.test(r.hint || '');
