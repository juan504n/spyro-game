// The air journey of a realm, worked out: where a hero who cannot walk on can GLIDE to (from a ledge, down to a lower island) or be LIFTED to (a whirlwind carries him up and he glides from its top), and
// so which islands he can get to and how far that is. A realm declares its air links as data (`brief.air.links`: { id, kind: 'glide' | 'lift', launch | whirl, land }); this module holds each link to
// the numbers (the reach of a glide from a standing start or from a hover, with the situation check's own margin: src/game/realm/situations.js), looks along it for rock in the way, floods the ground
// he lands on, and makes of the lot
//   * a MAP with the walk map's interface (has / dist / distNear / yAt / each / count), where the distance is the journey: metres walked, the ride up and the width of the glides, so that
//     the checker's rules about distance (the journey, the danger, the walk to a goal) mean the same thing in a country of islands as in one of roads;
//   * the PATH between two places (the legs: walk, glide, lift, in order) that tools/realm-bot.mjs plays with the real controller.
// A link that cannot be flown is an error in the brief, not a number in the map: it is reported and left out.
import { glideReach, liftReach, GLIDE_MARGIN } from '../../src/game/realm/situations.js';

/** a link may use this share of the reach the situation check allows (as tools/lib/glide.mjs: the bot is a person, not a ballistic curve) */
export const USE = 0.9;
const STAND = 2.4;                    // (a hero is "at" a launch or a whirlwind's foot when he stands within this many metres)
const MIN_ISLAND = 120;               // (cells of 1.2 m a landing's flood must reach: a landing is on an island, not on a rock)

export function airTools({ grid, collision, gp, brief, flood }) {
  const links = (brief && brief.air && brief.air.links) || [];
  const whirls = gp.whirlwinds || [];
  const top = (x, z) => collision.support(x, z, 1e3, 1e3).y;

  /** nothing in the way of a straight flight from a to b: terrain and solid things, but for the first and last 3 m (the ground he leaves and the ground he lands on) */
  const clear = (a, b) => {
    const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 1.5));
    for (let i = 1; i < n; i++) {
      const s = (i / n) * L;
      if (s < 3 || L - s < 3) continue;
      const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
      if (grid.heightAt(x, z) > y - 0.6 || collision.blocking(x, y, z, 0.5)) return { ok: false, at: [x, y, z] };
    }
    return { ok: true };
  };

  /** every link held to the numbers: its origin (the launch cell or the foot of the whirlwind), its landing, the width of the gap against the reach, the line of sight */
  const evalLink = (L) => {
    const errors = [];
    let o = null;
    if (L.kind === 'lift') {
      const w = whirls.find((q) => q.id === L.whirl);
      if (!w) errors.push(`no whirlwind '${L.whirl}' in the world`);
      else o = { x: w.x, z: w.z, y: w.y0, apex: w.y0 + w.h, h: w.h, r: w.r };
    } else if (L.kind === 'glide') o = { x: L.launch[0], z: L.launch[1], y: top(L.launch[0], L.launch[1]) };
    else errors.push(`kind '${L.kind}': glide or lift`);
    const t = { x: L.land[0], z: L.land[1], y: top(L.land[0], L.land[1]) };
    let gap = NaN, drop = NaN, reach = NaN, cost = NaN;
    if (o) {
      gap = Math.hypot(t.x - o.x, t.z - o.z);
      const from = L.kind === 'lift' ? o.apex : o.y;
      drop = from - t.y;
      reach = (L.kind === 'lift' ? liftReach(drop) : glideReach(drop)) * GLIDE_MARGIN;
      cost = L.kind === 'lift' ? o.h + gap : gap;
      if (drop < 1) errors.push(`the landing is not below the ${L.kind === 'lift' ? 'top of the whirlwind' : 'launch'} (${drop.toFixed(1)} m)`);
      if (gap < 8) errors.push(`only ${gap.toFixed(1)} m across: not a link`);
      if (gap > reach * USE) errors.push(`${gap.toFixed(1)} m across, ${drop.toFixed(1)} m down: more than ${(reach * USE).toFixed(1)} m (${Math.round(USE * 100)}% of the reach with its margin)`);
      const los = clear({ x: o.x, y: from + 1.0, z: o.z }, { x: t.x, y: t.y + 1.0, z: t.z });
      if (!los.ok) errors.push(`something is in the way at (${los.at.map((v) => v.toFixed(0)).join(', ')})`);
    }
    return { ...L, o, t, gap, drop, reach, cost, errors, active: false, floodTo: null };
  };

  /**
   * The map of a hero who starts at `start` (and stands at `startY`): the flood from there, and the flood of every link's landing that he can get to from somewhere he can get to, with the
   * distance to it. `opt` is what the walk map takes (hop, breakWalls, openGate).
   */
  const make = ({ start, startY, hop = 6.2, breakWalls = true, openGate = true }) => {
    const opt = { hop, breakWalls, openGate };
    const floods = [{ id: 'start', link: null, parent: null, offset: 0, at: [start[0], start[1]], map: flood(start, { ...opt, startY }) }];
    const evals = links.map(evalLink), cache = new Map();
    const reaches = (F, E) => F.map.distNear(E.o.x, E.o.z, STAND, E.o.y);
    for (let changed = true; changed;) {
      changed = false;
      for (const E of evals) {
        if (E.active || !E.o || E.errors.length) continue;
        if (!floods.some((F) => Number.isFinite(reaches(F, E)))) continue;
        const key = `${E.t.x},${E.t.z}`;
        let F = cache.get(key);
        if (!F) { F = { id: E.id, link: null, parent: null, offset: Infinity, at: [E.t.x, E.t.z], map: flood([E.t.x, E.t.z], { ...opt, startY: E.t.y }) }; cache.set(key, F); floods.push(F); }
        E.active = true; E.floodTo = F; changed = true;
      }
    }
    // the distances: the cheapest way to each landing's flood (the walk to the origin, the link's cost), settled by relaxation (a few links deep)
    for (let iter = 0; iter < 10; iter++) {
      let moved = false;
      for (const E of evals) {
        if (!E.active) continue;
        const F = E.floodTo;
        for (const P of floods) {
          if (P === F || !Number.isFinite(P.offset)) continue;
          const d = P.offset + reaches(P, E) + E.cost;
          if (d < F.offset - 1e-6) { F.offset = d; F.parent = P; F.link = E; moved = true; }
        }
      }
      if (!moved) break;
    }
    for (const E of evals) {
      if (E.active && !E.floodTo.map.count) E.errors.push('nothing to walk on where it lands');
      else if (E.active && E.floodTo.map.count < MIN_ISLAND) E.errors.push(`a landing on an island of only ${E.floodTo.map.count} cells (${MIN_ISLAND} or more)`);
    }
    const live = () => floods.filter((F) => Number.isFinite(F.offset));
    const bestNear = (x, z, r, y) => { let bf = null, bd = Infinity; for (const F of live()) { const d = F.offset + F.map.distNear(x, z, r, y); if (d < bd) { bd = d; bf = F; } } return { F: bf, d: bd }; };
    const map = {
      get count() { return live().reduce((s, F) => s + F.map.count, 0); },
      has: (x, z, y) => live().some((F) => F.map.has(x, z, y)),
      dist(x, z, y) { let b = Infinity; for (const F of live()) b = Math.min(b, F.offset + F.map.dist(x, z, y)); return b; },
      distNear: (x, z, r = 2.4, y) => bestNear(x, z, r, y).d,
      yAt(x, z, y) { let b = Infinity, v = NaN; for (const F of live()) { const d = F.map.dist(x, z, y); if (F.offset + d < b) { b = F.offset + d; v = F.map.yAt(x, z, y); } } return v; },
      each(fn) { for (const F of live()) F.map.each(fn); },
      /** the walk in the flood nearest to (x, z) (not the whole journey: see `path`) */
      route(x, z, r = 3, y) { const { F } = bestNear(x, z, r, y); return F ? F.map.route(x, z, r, y) : []; },
    };
    return {
      map, floods, links: evals,
      /** the flood the place is in at the least distance (the first the hero gets to it by) */
      floodAt: (x, z, r = 3, y) => bestNear(x, z, r, y).F,
      /** the link that sets the hero down on the island with this place on it (null: it is the start's own ground, or no flood holds it) */
      enteredBy(x, z, y, r = 3) { const F = bestNear(x, z, r, y).F; return F ? F.link : null; },
      /** the active links that start from the ground this place is on (where the hero can go from here) */
      leavesFrom(x, z, y, r = 3) { const F = bestNear(x, z, r, y).F; return F ? evals.filter((E) => E.active && Number.isFinite(reaches(F, E))) : []; },
      /** the foot of every flood that is not a link's landing: the start's own ground */
      foot: floods[0].map,
    };
  };

  /**
   * The legs from `from` ({ x, y, z }) to `to`: [{ kind: 'walk', route: [[x, y, z, metres]...] } | { kind: 'glide' | 'lift', link }], found by a search over the links (the fewest first),
   * each flood rooted where the hero stands. Null when there is none. (What the walker plays: tools/realm-bot.mjs.)
   */
  const path = (from, to, { hop = 6.2, breakWalls = true, openGate = true } = {}) => {
    const cache = new Map(), key = (p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
    const fl = (p) => { const k = key(p); if (!cache.has(k)) cache.set(k, flood([p.x, p.z], { hop, breakWalls, openGate, startY: p.y })); return cache.get(k); };
    const evals = links.map(evalLink).filter((E) => E.o && !E.errors.length);
    const queue = [{ pos: from, F: fl(from), acts: [] }], seen = new Set([key(from)]);
    while (queue.length) {
      const s = queue.shift();
      const route = s.F.route(to.x, to.z, 4.5, to.y);
      if (route && route.length) return [...s.acts, { kind: 'walk', route }];
      for (const E of evals) {
        if (!Number.isFinite(s.F.distNear(E.o.x, E.o.z, STAND, E.o.y))) continue;
        const k = key(E.t);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push({ pos: E.t, F: fl(E.t), acts: [...s.acts, { kind: 'walk', route: s.F.route(E.o.x, E.o.z, STAND, E.o.y) }, { kind: E.kind, link: E }] });
      }
    }
    return null;
  };

  return { make, path, evalLink, links, clear };
}

/**
 * The walkable country of a world as a map: the flood from `arrive` (the walk map's, with `hop` where the world has a brief with an air journey) - or, in a country of islands joined in the air
 * (brief.air), the whole journey: the start's ground and every landing the hero can get to (a map with the same interface). What the TRAVEL menu's rules and the realm's own checks ask "can
 * he be there" of.
 */
export function journeyMap(W, flood, arrive, { breakWalls = true, openGate = true, startY } = {}) {
  const brief = W.level.brief;
  if (!brief || !brief.air) return flood(arrive, { breakWalls, openGate, startY });
  const t = airTools({ grid: W.grid, collision: W.collision, gp: W.gp, brief, flood });
  return t.make({ start: arrive, startY, hop: 6.2, breakWalls, openGate }).map;
}
