// Dev-only gallery compositions (only registered when the page URL contains ?vdev=1).  Handy for comparing variants
// side by side:  ?test=props&vdev=1&only=dev_cottages
export function makeDev(all) {
  const row = (name, entries, gap = 13) => ({
    fn(kit, { x, z, rot = 0 }) {
      entries.forEach(([prop, params], i) => {
        const e = all[prop];
        e.fn(kit, { ...(e.defaults || {}), x: x + (i - (entries.length - 1) / 2) * gap, z, ...params });
      });
    },
    size: gap * entries.length, note: 'dev row',
  });
  // a small hamlet for judging the ensemble
  const hamlet = {
    fn(kit, { x, z }) {
      const put = (name, dx, dz, params = {}) => { const e = all[name]; e.fn(kit, { ...(e.defaults || {}), x: x + dx, z: z + dz, ...params }); };
      put('well', 0, 0);
      put('house_cottage', -14, -8, { variant: 0, rot: 0.3 });
      put('house_cottage', 14, -9, { variant: 1, rot: -0.25 });
      put('house_long', 0, -22, { rot: 0 });
      put('house_round', -19, 8, { rot: 0.9 });
      put('house_cottage', 21, 6, { variant: 2, rot: -0.9 });
      put('house_cottage', -30, -12, { variant: 3, rot: 0.5 });
      put('market_stall', -7, 6, { variant: 0, rot: 0.2 });
      put('market_stall', -3, 9, { variant: 1, rot: -0.1 });
      put('market_stall', 3, 9, { variant: 2, rot: 0.1 });
      put('lamp_post', 6, 3); put('lamp_post', -6, -4); put('lamp_post', 10, -14);
      put('barrel_cluster', -9, -2); put('crate_stack', 9, 5); put('signpost', 5, 14, { rot: 0.3 });
      put('banner_pole', -12, 14); put('banner_pole', 12, 15);
      put('fence', 0, 0, { ax: 8, az: 18, bx: 26, bz: 14 });
      put('bunting', 0, 0, { ax: -12, az: 14, bx: 12, bz: 15, h: 5.5 });
      put('haystack', 26, -8); put('cart', 24, 14, { rot: 2 }); put('bench', -3, 3, { rot: 0.4 });
      put('torch_stand', 3, -3); put('garden_plot', 14, 12);
    },
    size: 90, note: 'dev hamlet',
  };
  return {
    dev_hamlet: hamlet,
    dev_extraA: row('dev_extraA', [['banner_pole', {}], ['torch_stand', {}], ['haystack', {}], ['cart', {}], ['bench', {}]], 7),
    dev_extraB: row('dev_extraB', [['scarecrow', {}], ['boat', { y: 3.2 }], ['garden_plot', {}], ['fountain', {}]], 10),
    dev_smallA: row('dev_smallA', [['lamp_post', {}], ['signpost', {}], ['well', {}], ['barrel_cluster', {}]], 7),
    dev_smallB: row('dev_smallB', [['crate_stack', {}], ['market_stall', { variant: 0 }], ['market_stall', { variant: 1 }], ['market_stall', { variant: 2 }]], 8),
    dev_bridge: row('dev_bridge', [['bridge_stone', { y: 6.6 }]], 20),
    dev_bridge_short: row('dev_bridge_short', [['bridge_stone', { y: 6.6, len: 11 }], ['pier', { y: 3.7 }]], 22),
    dev_cottages: row('dev_cottages', [0, 1, 2, 3].map((v) => ['house_cottage', { variant: v }]), 14),
    dev_halls: row('dev_halls', [['house_long', {}], ['house_round', {}], ['house_cottage', { variant: 0 }]], 18),
    dev_cottages_back: row('dev_cottages_back', [0, 1, 2, 3].map((v) => ['house_cottage', { variant: v, rot: Math.PI }]), 14),
    dev_cottages_side: row('dev_cottages_side', [0, 1, 2, 3].map((v) => ['house_cottage', { variant: v, rot: Math.PI / 2 }]), 14),
  };
}
