// Debug readout: everything debug mode says, as plain functions of the game's data (no DOM, no rendering), so it can be tested headlessly.
//
//   collect(game, extra)   -> data   where Spyro is, what the ground is, what is nearby, what the camera's centre points at
//   format(data, level)    -> rows   [{ tag, text, cls }] for the on-screen readout (level 1 = compact, 2 = full)
//   toText(rows)           -> string  the same rows as plain text (copyable, and what the tests read)
//
// Coordinates are the level's own: x = east, z = SOUTH, y = up, in metres (Spyro is about 1.6 long). Yaw 0 faces +z (south); the
// readout also gives a compass heading and clock positions ("11h" = ahead and a little to the left) for things around him.
//
// Where things come from: every prop the level script places is recorded (`gameplay.placed`: name, position, size, and `src`, the name of
// the layout function that placed it) and stamped on its colliders (`collider.prop`); gameplay records (chests, vases, enemies, hints...)
// carry `src` too. `src` names a function in src/game/levelgen/layout.js (or scatter.js / gameplay.js), so "chest layoutLake" points straight
// at the code. The ground texture comes from the same rules the terrain mesh was built with (terrainPicker), with the rule's name.
import { WATER_LEVEL } from './level.js';
import { terrainPicker } from './terrain-mesh.js';
import { drawnRoadAt, nearRoadAt } from './roads.js';

/** Which build is running: a hash of the source and the build date, set by tools/build-single.mjs ('dev' when running from the dev server). */
export const BUILD = typeof __GV_BUILD__ !== 'undefined' ? __GV_BUILD__ : 'dev';

const DEG = 180 / Math.PI;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const num = (v) => (Number.isFinite(v) ? v : 0);
const norm0 = (v, d) => { const s = num(v).toFixed(d); return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s; };     // (never "-0.00")
const f1 = (v) => norm0(v, 1);
const f2 = (v) => norm0(v, 2);

/** Compass heading of a yaw: 0 (N), 45 (NE) ... where north is -z, east +x and yaw 0 faces +z (so yaw 0 is south). */
export function heading(yaw) {
  const a = Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * DEG;
  return (a + 360) % 360;
}
export function compass(yaw) { return COMPASS[Math.round(heading(yaw) / 45) % 8]; }

/** Where a point is relative to someone at (x, z) facing `yaw`, as a clock position (12 = straight ahead, 3 = to his right, 9 = left). */
export function clock(yaw, x, z, tx, tz) {
  const dx = tx - x, dz = tz - z;
  if (Math.hypot(dx, dz) < 0.05) return 12;
  const fwd = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);         // (facing +z, his right hand points -x)
  const h = Math.round(((Math.atan2(right, fwd) * DEG + 360) % 360) / 30) % 12;
  return h === 0 ? 12 : h;
}

// ---- areas ---------------------------------------------------------------------------------------------------------
/** The named places of the realm, from the level design: [name, x, z, radius, y]; y is only set for the floating isles (walkable top). */
export function areas(L) {
  if (L.areas) return L.areas;                                    // (a level of its own names its places itself)
  return [
    ['HEARTH VILLAGE', L.village.x, L.village.z, L.village.r],
    ['REALM PORTAL', L.portal.x, L.portal.z, L.portal.r],
    ['SHRINE ISLE', L.island.x, L.island.z, L.island.r],
    ['LAUNCH MESA', L.mesa.x, L.mesa.z, L.mesa.r],
    ['WINDMILL HILL', L.windHill.x, L.windHill.z, L.windHill.r],
    ['NORTH MOUNTAIN', L.summit.x, L.summit.z, L.summit.r],
    ['DAWN GATE', L.gate.x, L.gate.z, 18],
    ['CRYSTAL HOLLOW', L.hollow.x, L.hollow.z, L.hollow.r],
    ['HERON POINT', L.heron.x, L.heron.z, L.heron.r],
    ['CASCADE PLATEAU', L.cascade.x, L.cascade.z, L.cascade.r],
    ['RUINS MOUND', L.ruinsMound.x, L.ruinsMound.z, L.ruinsMound.r],
    ...L.isles.map((I, k) => [`SKY ISLE ${k + 1}`, I.x, I.z, I.r, I.y]),
  ];
}

/**
 * The place a point is in: the smallest named area that contains it, else Mirrormere if it is over the lake, else the nearest area
 * (`inside` false, `d` = metres to its edge). `y` (optional) tells the ground under a floating isle from the isle itself.
 */
export function areaAt(L, x, z, y) {
  const list = areas(L).filter((a) => a[4] === undefined || y === undefined || y > a[4] - 10);
  let inside = null;
  for (const a of list) if (Math.hypot(x - a[1], z - a[2]) <= a[3] && (!inside || a[3] < inside[3])) inside = a;
  if (inside) return { name: inside[0], inside: true, d: 0 };
  const dl = Math.hypot((x - L.lake.x) / L.lake.rx, (z - L.lake.z) / L.lake.rz), lakeName = L.lake.name || 'MIRRORMERE';
  if (dl < 1) return { name: lakeName, inside: true, d: 0 };
  let best = null, bd = Infinity;
  for (const a of list) { const d = Math.hypot(x - a[1], z - a[2]) - a[3]; if (d < bd) { bd = d; best = a; } }
  const dm = (dl - 1) * Math.min(L.lake.rx, L.lake.rz);
  if (dm < bd) return { name: lakeName, inside: false, d: dm };
  return { name: best[0], inside: false, d: bd };
}

// ---- ground ---------------------------------------------------------------------------------------------------------
const pickers = new WeakMap();
const pickerFor = (grid) => { let p = pickers.get(grid); if (!p) { p = terrainPicker(grid); pickers.set(grid, p); } return p; };

/**
 * The nearest road { id, surface, d } within 8 m: for the dirt and cobble roads the ribbon that is drawn (flat ends: past a road's end it is the distance to that edge, where the carve's round cap
 * used to say "on it" 2.5 m beyond the last of the ribbon), for a paved forecourt (not a ribbon, the terrain's own paving) the carve's own distance field.
 */
function nearRoad(grid, x, z, pi, pd) {
  const rb = nearRoadAt(grid, x, z, 8);
  const paved = pi >= 0 && pd < 8 && grid.paths[pi].surface === 'flagstone' ? { id: grid.paths[pi].id, surface: 'flagstone', d: Math.max(0, pd) } : null;
  return rb && (!paved || rb.d <= paved.d) ? rb : paved;
}

/** Everything about the ground at (x, z): height, slope, the texture the mesh gives it (and the rule that chose it), road / river / lake. */
export function groundAt(grid, x, z) {
  const s = grid.n + 1;
  const i = Math.max(0, Math.min(grid.n, Math.round((x + grid.half) / grid.cell))), j = Math.max(0, Math.min(grid.n, Math.round((z + grid.half) / grid.cell)));
  const k = j * s + i;
  const pd = grid.pathDist[k], pi = grid.pathIdx[k];
  const L = grid.level;
  const nn = grid.normalAt(x, z);
  const tex = pickerFor(grid).at(x, z);
  return {
    h: grid.heightAt(x, z),
    slope: Math.acos(Math.max(-1, Math.min(1, nn[1]))) * DEG,
    normal: [nn[0], nn[1], nn[2]],
    tex: tex.tex, why: tex.why, cell: [tex.i, tex.j, tex.tri],
    drawn: drawnRoadAt(grid, x, z),                        // the road ribbon drawn over the ground here ({ id, surface }), or null
    road: nearRoad(grid, x, z, pi, pd),
    river: grid.riverDist[k] < 6 ? grid.riverDist[k] : null,
    lake: Math.hypot((x - L.lake.x) / L.lake.rx, (z - L.lake.z) / L.lake.rz),
    water: WATER_LEVEL - grid.heightAt(x, z),              // metres of water over the ground here (negative = dry)
  };
}

// ---- things around ----------------------------------------------------------------------------------------------------
/** Horizontal distance from (x, z) to the edge of a collider (0 inside it). */
export function colliderDist(c, x, z) {
  if (c.type === 'cyl') return Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r);
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
  const dx = x - c.x, dz = z - c.z;
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  return Math.hypot(Math.max(0, Math.abs(lx) - c.hx), Math.max(0, Math.abs(lz) - c.hz));
}

/**
 * The n colliders closest to (x, z) (edge distance), looking at the hash cells around it. With `y` (the feet of someone standing there) the
 * height counts too: the floating isle's underside 30 m overhead is not "next to" someone on the ground below it.
 */
export function nearestColliders(collision, x, z, n = 1, maxD = 14, y) {
  const seen = new Set(), out = [];
  const cell = collision.cell;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    for (const c of collision.near(x + a * cell, z + b * cell)) {
      if (seen.has(c)) continue;
      seen.add(c);
      const dy = y === undefined ? 0 : Math.max(0, c.y0 - (y + 1.05), y - c.y1);          // (a body 1.05 m tall standing on y)
      const d = Math.hypot(colliderDist(c, x, z), dy);
      if (d <= maxD) out.push({ c, d });
    }
  }
  out.sort((p, q) => p.d - q.d);
  return out.slice(0, n);
}

/**
 * The n placed props closest to (x, z), by the distance to their edge (half their footprint from the centre). With `y` the height counts
 * too, so on a floating isle the isle's own decor is nearer than the meadow trees on the ground 30 m below it.
 */
export function nearestProps(placed, x, z, n = 3, maxD = 60, y) {
  const out = [];
  for (const r of placed) {
    const half = (r.size || 2) / 2;
    const dxz = Math.max(0, Math.hypot(r.x - x, r.z - z) - half);
    const dy = y === undefined ? 0 : Math.max(0, Math.abs((r.y ?? y) - y) - half);
    const d = Math.hypot(dxz, dy);
    if (d <= maxD) out.push({ rec: r, d });
  }
  out.sort((p, q) => p.d - q.d);
  return out.slice(0, n);
}

/** Gameplay things (chests, vases, enemies, ...) with their positions, from the live systems where they exist and the level data otherwise. */
export function gameplayThings(game) {
  const gp = game.gameplay || {}, out = [];
  const add = (kind, list, fmt) => { for (const o of list || []) if (Number.isFinite(o.x) && Number.isFinite(o.z)) out.push({ kind, o, x: o.x, y: o.y, z: o.z, src: o.src, note: fmt ? fmt(o) : '' }); };
  const ob = game.objects;
  add('chest', ob ? ob.chests : gp.chests, (o) => (o.opened ? 'opened' : 'closed'));
  add('vase', ob ? ob.vases : gp.vases, (o) => (o.broken ? 'broken' : 'whole'));
  add('cracked wall', ob ? ob.walls : gp.walls, (o) => (o.broken ? 'broken' : 'intact'));
  add('brazier', ob ? ob.braziers : gp.braziers, (o) => (o.lit ? 'lit' : 'unlit'));
  add('bounce mushroom', ob ? ob.mushrooms : gp.mushrooms);
  add('enemy', game.enemies ? game.enemies.list : gp.enemies, (o) => `${o.variant || 'basic'}${o.dead ? ' (dead)' : ''}`);
  add('npc', game.npcs ? game.npcs.npcs : gp.npcs, (o) => o.name || o.id);
  add('beacon', gp.beacons, (o) => o.name || o.id);
  add('bunny', gp.bunnies);
  return out;
}

export function nearestThings(game, x, y, z, n = 3, maxD = 60) {
  const out = [];
  for (const t of gameplayThings(game)) {
    const d = Math.hypot(t.x - x, (Number.isFinite(t.y) ? t.y : y) - y, t.z - z);
    if (d <= maxD) out.push({ ...t, d });
  }
  out.sort((p, q) => p.d - q.d);
  return out.slice(0, n);
}

/** The hint zones (tutorial signs) Spyro stands in. */
export function hintZonesAt(game, x, z, y) {
  const list = game.npcs ? game.npcs.hints : (game.gameplay && game.gameplay.hints) || [];
  return list.filter((h) => Math.hypot(h.x - x, h.z - z) <= (h.r || 6) && (h.y0 === undefined || y === undefined || (y >= h.y0 && y <= h.y1))).map((h) => ({ text: h.text, src: h.src }));
}

// ---- the ray through the middle of the screen --------------------------------------------------------------------------
/**
 * Where does a ray (o = origin, d = unit direction) first hit something solid: the ground, a collider or the water? Marches every half
 * metre (a metre beyond 60 m), then bisects the last step. Also names the placed prop the ray passes through when nothing solid was in
 * the way but a prop is (props without a collider: flowers, reeds, ferns...).
 */
export function castRay(game, o, d, maxD = 240) {
  const grid = game.grid, col = game.collision;
  let prevT = 0, prevY = o.y;
  let hit = null;
  for (let t = 0.5; t <= maxD && !hit; t += t < 60 ? 0.5 : 1) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    const gh = grid.heightAt(x, z);
    if (prevY >= WATER_LEVEL && y < WATER_LEVEL && gh < WATER_LEVEL) {           // crossed the water's surface over a lake / river bed
      const k = (prevY - WATER_LEVEL) / (prevY - y);
      hit = { kind: 'water', t: prevT + (t - prevT) * k };
      break;
    }
    if (y < gh) {
      let lo = prevT, hi = t;
      for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (o.y + d.y * m < grid.heightAt(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m; }
      hit = { kind: 'terrain', t: (lo + hi) / 2 };
      break;
    }
    const c = col.blocking(x, y, z, 0.02, false);
    if (c) {
      let lo = prevT, hi = t;
      for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (col.blocking(o.x + d.x * m, o.y + d.y * m, o.z + d.z * m, 0.02, false) === c) hi = m; else lo = m; }
      hit = { kind: 'collider', t: hi, c };
      break;
    }
    prevT = t; prevY = y;
  }
  if (!hit) return { kind: 'none', t: maxD, x: o.x + d.x * maxD, y: o.y + d.y * maxD, z: o.z + d.z * maxD };
  hit.x = o.x + d.x * hit.t; hit.y = o.y + d.y * hit.t; hit.z = o.z + d.z * hit.t;
  if (hit.kind === 'water') hit.y = WATER_LEVEL;
  if (hit.kind === 'terrain') { const g = groundAt(grid, hit.x, hit.z); hit.tex = g.tex; hit.why = g.why; hit.slope = g.slope; hit.cell = g.cell; hit.road = g.drawn; }
  return hit;
}

/** The first placed prop (in front of `tMax`) whose footprint the ray passes through: what the crosshair is on, when it is not a collider. */
export function propOnRay(placed, o, d, tMax) {
  let best = null;
  for (const r of placed) {
    const rad = Math.max(0.8, (r.size || 2) / 2);
    const cx = r.x, cy = (r.y ?? 0) + Math.min(rad, 2.5) * 0.6, cz = r.z;
    const t = (cx - o.x) * d.x + (cy - o.y) * d.y + (cz - o.z) * d.z;
    if (t < 0 || t > tMax + rad) continue;
    const px = o.x + d.x * t - cx, py = o.y + d.y * t - cy, pz = o.z + d.z * t - cz;
    if (Math.hypot(px, py, pz) > rad * 0.9) continue;
    if (!best || t < best.t) best = { rec: r, t };
  }
  return best;
}

// ---- collect --------------------------------------------------------------------------------------------------------------
/** What the player is doing, in a word. */
export function playerState(p) {
  if (p.dead) return 'dead';
  if (p.hurtT > 0) return 'hurt';
  if (p.chargeT > 0) return 'charge';
  if (p.flameT > 0) return 'flame';
  if (p.gliding) return 'glide';
  if (p.inWater) return 'swim';
  if (!p.grounded) return p.vy > 0 ? 'rise' : 'fall';
  return Math.hypot(p.vx, p.vz) > 0.8 ? 'run' : 'idle';
}

/**
 * Gather the readout's data. `extra`: { pose: { ox, oy, oz, dx, dy, dz } (the camera's position and direction), perf, errors, viewport }
 * are supplied by the DOM layer (debug.js); everything else is read from the game.
 */
export function collect(game, extra = {}) {
  const p = game.player, L = game.level || game.grid.level;
  const placed = (game.gameplay && game.gameplay.placed) || [];
  const data = {
    build: BUILD,
    pos: { x: p.x, y: p.y, z: p.z },
    yaw: p.yaw, heading: heading(p.yaw), compass: compass(p.yaw),
    speed: Math.hypot(p.vx, p.vz), vy: p.vy,
    state: playerState(p),
    grounded: !!p.grounded,
    stand: p.groundKind === 'collider' && p.groundC ? { kind: 'collider', c: p.groundC } : { kind: 'terrain' },
    area: areaAt(L, p.x, p.z, p.y),
    ground: groundAt(game.grid, p.x, p.z),
    props: nearestProps(placed, p.x, p.z, 3, 60, p.y),
    things: nearestThings(game, p.x, p.y, p.z, 3),
    colliders: nearestColliders(game.collision, p.x, p.z, 2, 14, p.y),
    hints: hintZonesAt(game, p.x, p.z, p.y),
    aim: null,
    extra,
  };
  const pose = extra.pose;
  if (pose) {
    const o = { x: pose.ox, y: pose.oy, z: pose.oz }, d = { x: pose.dx, y: pose.dy, z: pose.dz };
    const hit = castRay(game, o, d);
    data.aim = { ...hit, prop: null, near: null, pinned: !!extra.pinned };
    if (hit.kind === 'collider' && hit.c.prop) data.aim.prop = hit.c.prop;
    else if (hit.kind !== 'collider') { const q = propOnRay(placed, o, d, hit.t); if (q) data.aim.prop = q.rec; }
    if (hit.kind === 'collider' && !hit.c.prop) data.aim.tag = hit.c.tag || '';
    if (hit.kind !== 'none' && !data.aim.prop) data.aim.near = nearestProps(placed, hit.x, hit.z, 1, 8, hit.y)[0] || null;      // (a flat prop the ray went over: the closest one to the spot)
  }
  return data;
}

// ---- format ----------------------------------------------------------------------------------------------------------------
const trim = (s, n) => (s.length > n ? s.slice(0, n - 1) + '~' : s);
const src = (r) => (r && r.src ? ` [${r.src}]` : '');

/** "cyl r0.55 y 3.2-7.4" / "box 2.0x1.3 y 0.0-1.8" */
export function colliderText(c) {
  if (c.type === 'massif') return `rock mass ${c.id}`;
  const shape = c.type === 'cyl' ? `cyl r${f2(c.r)}` : `box ${f1(c.hx * 2)}x${f1(c.hz * 2)}`;
  return `${shape} y ${f1(c.y0)}-${f1(c.y1)}${c.top ? ' top' : ''}${c.solid === false ? ' (off)' : ''}`;
}
const colliderName = (c) => (c.prop ? `${c.prop.name}${src(c.prop)}` : `${c.tag || 'collider'}${c.src ? ` [${c.src}]` : ''}`);

/** The readout's rows for `level` 1 (compact) or 2 (full). Each is { tag, text, cls }; cls tints the row ('' | 'aim' | 'warn' | 'dim'). */
export function format(data, level = 1) {
  const rows = [];
  const row = (tag, text, cls = '') => rows.push({ tag, text, cls });
  const ex = data.extra || {};
  const g = data.ground, p = data.pos;
  row('DEBUG', `build ${data.build}   x=east y=up z=south`, 'dim');
  row('POS', `X ${f2(p.x)}  Y ${f2(p.y)}  Z ${f2(p.z)}`, 'pos');
  row('FACE', `${data.compass} ${Math.round(data.heading)}  spd ${f1(data.speed)}  ${data.state}${data.grounded ? '' : ' (air)'}`);
  row('AREA', `${data.area.name}${data.area.inside ? '' : ` ${Math.round(data.area.d)} m away`}${g.road ? `  road ${g.road.id}${g.road.d < 0.5 ? '' : ` ${f1(g.road.d)} m`}` : ''}${g.river !== null ? `  river ${f1(g.river)} m` : ''}`);
  row('FLOOR', `${g.drawn ? `${g.drawn.surface} road ${g.drawn.id}, over ` : ''}${g.tex} (${g.why})  slope ${Math.round(g.slope)}  y ${f2(g.h)}  cell ${g.cell[0]},${g.cell[1]}${g.water > 0 ? `  water ${f1(g.water)} deep` : ''}`);
  if (data.stand.kind === 'collider') row('STAND', `on ${colliderName(data.stand.c)}  top y ${f2(data.stand.c.y1)}`);
  if (data.aim) {
    const a = data.aim;
    if (a.kind === 'none') row('AIM', 'nothing in range (sky)', 'dim');
    else {
      const what = a.kind === 'terrain' ? `ground ${a.road ? `${a.road.surface} road ${a.road.id} over ` : ''}${a.tex}` : a.kind === 'water' ? 'water surface' : `collider ${colliderName(a.c)}`;
      const tag = a.pinned ? 'PIN' : 'AIM';
      row(tag, `X ${f1(a.x)}  Y ${f1(a.y)}  Z ${f1(a.z)}  ${Math.round(a.t)} m`, 'aim');
      row('', `${what}${a.kind === 'terrain' ? ` (${a.why}) cell ${a.cell ? a.cell[0] + ',' + a.cell[1] : ''}` : ''}${a.kind === 'collider' ? `  ${colliderText(a.c)}` : ''}`, 'aim');
      if (a.prop && !(a.kind === 'collider' && a.c.prop)) row('', `prop ${a.prop.name} at ${f1(a.prop.x)}, ${f1(a.prop.z)}${src(a.prop)}`, 'aim');
      else if (a.near) row('', `nearest prop ${a.near.rec.name} ${f1(a.near.d)} m, at ${f1(a.near.rec.x)}, ${f1(a.near.rec.z)}${src(a.near.rec)}`, 'aim');
    }
  }
  const nearP = data.props.slice(0, level > 1 ? 3 : 2);
  for (const { rec, d } of nearP) row('PROP', `${trim(rec.name, 18)} ${f1(d)} m ${clock(data.yaw, p.x, p.z, rec.x, rec.z)}h  ${f1(rec.x)}, ${f1(rec.z)}${src(rec)}`);
  const nearT = data.things.slice(0, level > 1 ? 3 : 1);
  for (const t of nearT) row('OBJ', `${t.kind} ${f1(t.d)} m ${clock(data.yaw, p.x, p.z, t.x, t.z)}h  ${f1(t.x)}, ${f1(t.z)}${t.note ? `  ${t.note}` : ''}${src(t)}`);
  if (data.colliders.length) {
    const { c, d } = data.colliders[0];
    row('COLL', `${f1(d)} m ${colliderText(c)}  ${colliderName(c)}`);
  }
  for (const h of data.hints) row('HINT', trim(h.text, 34) + src(h), 'dim');
  const n = ex.errorCount || 0;
  if (n && level < 2) row('ERR', `${n} error${n > 1 ? 's' : ''} logged (full mode lists them)`, 'warn');
  if (level < 2) return rows;

  // ---- full ----
  if (ex.game) row('GAME', ex.game);
  if (ex.cam) row('CAM', ex.cam);
  if (ex.input) row('INPUT', ex.input);
  if (ex.perf) row('PERF', ex.perf);
  if (ex.gpu) row('GPU', ex.gpu, 'dim');
  if (ex.view) row('VIEW', ex.view, 'dim');
  if (ex.errors) for (const e of ex.errors.slice(-4)) row('ERR', trim(e, 60), 'warn');
  return rows;
}

/** Plain text, one line per row (the tag left-aligned in 6 columns). */
export function toText(rows) { return rows.map((r) => `${r.tag.padEnd(6)}${r.text}`.trimEnd()).join('\n'); }
