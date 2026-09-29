// World dressing: forests, meadows, rocks — the "everywhere else" that makes the valley feel lived-in.
const TAU = Math.PI * 2;

export function scatterWorld(ctx) {
  const { rng, L } = ctx;
  const pickTree = (x, z) => {
    const h = ctx.h(x, z);
    if (h > 22) return 'tree_pine';
    const nearLake = ctx.lakeD(x, z) < 1.5;
    const r = rng.next();
    if (nearLake) return r < 0.4 ? 'tree_lantern' : r < 0.8 ? 'tree_round' : 'tree_birch';
    if (r < 0.34) return 'tree_round';
    if (r < 0.52) return 'tree_pine';
    if (r < 0.62) return 'tree_birch';
    if (r < 0.72) return 'tree_lantern';
    return 'tree_round';
  };
  const treeParams = (x, z) => {
    const east = x > 40;
    const r = rng.next();
    return {
      size: rng.pick(['s', 'm', 'm', 'l']),
      canopy: east && r < 0.5 ? 'leaves_autumn' : r < 0.3 ? 'leaves_teal' : 'leaves_green',
    };
  };

  // forest belt hugging the valley walls, thicker toward the rim
  ctx.scatter(pickTree, 210, ctx.inBand(0.56, 0.88), { r: 3.3, maxSlope: 0.5, path: 3.8, river: 4, lake: 1.14, minH: 1.0 }, treeParams);
  // scattered grove trees across the meadows
  ctx.scatter(pickTree, 46, ctx.inBand(0.12, 0.6), { r: 4.5, maxSlope: 0.32, path: 5, river: 5, lake: 1.2, minH: 1.0 }, treeParams);
  // bushes hugging tree lines and paths
  ctx.scatter('bush', 70, ctx.inBand(0.1, 0.86), { r: 1.6, maxSlope: 0.4, path: 1.6, lake: 1.1 }, () => ({ flowers: rng.chance(0.5), canopy: rng.pick(['leaves_green', 'leaves_teal']) }));
  // rocks
  ctx.scatter('rock_cluster', 44, ctx.inBand(0.1, 0.88), { r: 3, maxSlope: 0.5, path: 2.8, lake: 1.06 }, () => ({ scale: rng.float(0.8, 1.5) }));
  ctx.scatter('boulder_big', 10, ctx.inBand(0.62, 0.86), { r: 5, maxSlope: 0.5, path: 4, lake: 1.2 });
  ctx.scatter('rock_spire', 8, ctx.inBand(0.7, 0.9), { r: 3, maxSlope: 0.55, path: 4, lake: 1.2 });
  // meadow dressing
  ctx.scatter('flower_patch', 150, ctx.inBand(0.02, 0.84), { r: 2.4, maxSlope: 0.36, path: 1.4, lake: 1.05 }, () => ({ r: rng.float(3, 5), count: 10 + rng.int(0, 6) }));
  ctx.scatter('tuft_patch', 170, ctx.inBand(0.02, 0.86), { r: 2.2, maxSlope: 0.42, path: 1.0, lake: 1.03 }, () => ({ r: rng.float(3, 5.5), count: 12 + rng.int(0, 8) }));
  ctx.scatter('fern_patch', 40, ctx.inBand(0.5, 0.86), { r: 2, maxSlope: 0.5, path: 2.5, lake: 1.1 }, () => ({ r: 3, count: 8 }));
  ctx.scatter('mushroom_cluster', 16, ctx.inBand(0.45, 0.85), { r: 2, maxSlope: 0.4, path: 3, lake: 1.1 }, () => ({ count: 4 + rng.int(0, 4) }));
  // a few glowing crystal outcrops along the walls
  ctx.scatter('crystal_cluster', 12, ctx.inBand(0.7, 0.9), { r: 2.5, maxSlope: 0.6, path: 4, lake: 1.2 }, () => ({ color: rng.chance(0.5) ? 'violet' : 'cyan', count: 3 + rng.int(0, 3) }));
  // ambient emitters so the valley breathes (fireflies over meadows, mist near the lake)
  void L;
  void TAU;
}
