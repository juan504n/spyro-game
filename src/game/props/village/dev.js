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
  return {
    dev_cottages: row('dev_cottages', [0, 1, 2, 3].map((v) => ['house_cottage', { variant: v }]), 14),
    dev_halls: row('dev_halls', [['house_long', {}], ['house_round', {}], ['house_cottage', { variant: 0 }]], 18),
    dev_cottages_back: row('dev_cottages_back', [0, 1, 2, 3].map((v) => ['house_cottage', { variant: v, rot: Math.PI }]), 14),
    dev_cottages_side: row('dev_cottages_side', [0, 1, 2, 3].map((v) => ['house_cottage', { variant: v, rot: Math.PI / 2 }]), 14),
  };
}
