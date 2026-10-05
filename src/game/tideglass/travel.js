// The places of TIDEGLASS REACH for the TRAVEL menu (src/game/travel.js): the start, a spot in front of every goal, one where each trial begins, one in each named part of the country and beside each secret. FOUND AND CHECKED
// by tools/realm-travel.mjs (every place passes the rules of tools/lib/travel-rules.mjs): re-run `node tools/realm-travel.mjs tideglass` after the layout changes rather than editing by hand.
export const TRAVEL_PLACES = {
  world: 'tideglass', name: 'TIDEGLASS REACH',
  groups: [
    {
      name: 'THE GOALS',
      places: [
        { id: 'quay', name: 'QUAY LENS', x: -181.12, z: 12.5, yaw: 2.25 },
        { id: 'pearl', name: 'PEARL LENS', x: -21.6, z: 30.26, yaw: 1.12 },
        { id: 'court', name: 'COURT LENS', x: 18.82, z: -21.35, yaw: 0.58 },
        { id: 'weeping', name: 'WEEPING LENS', x: 140.01, z: -4.68, yaw: 1.65 },
        { id: 'light', name: 'TIDEGLASS', x: 136.38, z: -132.3, yaw: 2.01, opens: true },
      ],
    },
    {
      name: 'THE TRIALS',
      places: [
        { id: 'court-circuit', name: 'THE CIRCUIT', x: -92.99, z: -116.73, yaw: 1.62 },
        { id: 'weeping-plates', name: 'THE PLATES', x: 88, z: -86, yaw: 0 },
        { id: 'light-bells', name: 'THE BELLS', x: 140, z: -140, yaw: 0, opens: true },
      ],
    },
    {
      name: 'THE COUNTRY',
      places: [
        { id: 'start', name: 'THE START', x: -193, z: 22, yaw: 1.57 },
        { id: 'strand', name: 'THE STRAND', x: -146, z: 28, yaw: 0.98 },
        { id: 'hill', name: 'THE HIGH ROAD', x: -173.76, z: -48.83, yaw: 2.86 },
        { id: 'walk', name: 'THE CLIFFWALK', x: -25.63, z: -115.93, yaw: 1.39 },
        { id: 'ridge', name: 'THE HEADLAND', x: 143.21, z: -91.21, yaw: 2.51, opens: true },
        { id: 'stair', name: 'THE WEEPING STAIR', x: 82.06, z: -33.66, yaw: 2.97 },
      ],
    },
    {
      name: 'THE COUNTRY (2)',
      places: [
        { id: 'stackA', name: 'THE FIRST STACK', x: 15.27, z: -80.85, yaw: -1.98 },
        { id: 'stackB', name: 'THE SECOND STACK', x: 24.5, z: -52, yaw: 1.57 },
        { id: 'stackC', name: 'THE LONE STACK', x: 48.38, z: -41.88, yaw: 2.33 },
      ],
    },
    {
      name: 'THE SECRETS',
      places: [
        { id: 'secret-vault', name: 'THE SALVAGE STORE', x: -177.14, z: 23.55, yaw: -0.12 },
        { id: 'secret-pool', name: 'THE TIDE POOL', x: -98.41, z: 5.51, yaw: 0.93 },
      ],
    },
  ],
};
