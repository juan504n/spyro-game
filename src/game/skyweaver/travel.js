// The places of SKYWEAVER SPIRES for the TRAVEL menu (src/game/travel.js): the start, a spot in front of every goal, one in each named part of the country and beside each secret. FOUND AND CHECKED
// by tools/realm-travel.mjs (every place passes the rules of tools/lib/travel-rules.mjs): re-run `node tools/realm-travel.mjs skyweaver` after the layout changes rather than editing by hand.
export const TRAVEL_PLACES = {
  world: 'skyweaver', name: 'SKYWEAVER SPIRES',
  groups: [
    {
      name: 'THE GOALS',
      places: [
        { id: 'gate', name: 'GATE BELL', x: -167.98, z: 153.56, yaw: 1.46 },
        { id: 'isle', name: 'ISLE BELL', x: -76.79, z: 112.77, yaw: 1.89 },
        { id: 'field', name: 'FIELD BELL', x: -36.64, z: 80.66, yaw: 2 },
        { id: 'spire', name: 'SPIRE BELL', x: 115.07, z: -84.15, yaw: -2.87 },
        { id: 'loom', name: 'LOOM BELL', x: 90.15, z: -126.19, yaw: 2.35 },
      ],
    },
    {
      name: 'THE COUNTRY',
      places: [
        { id: 'start', name: 'THE START', x: -191, z: 151, yaw: 1.57 },
        { id: 'lowfield', name: 'THE LOWFIELD', x: -2.05, z: 57.23, yaw: 2.08 },
        { id: 'kite', name: 'THE KITE ISLE', x: 6, z: 8, yaw: 1.57 },
        { id: 'orchard', name: 'THE ORCHARD TERRACE', x: 83.85, z: 20.05, yaw: 2.03 },
        { id: 'spire1', name: 'THE FIRST SPIRE', x: 101.32, z: -33.18, yaw: 0.8 },
      ],
    },
    {
      name: 'THE COUNTRY (2)',
      places: [
        { id: 'spire2', name: 'THE SECOND SPIRE', x: 140.8, z: -57.54, yaw: -0.37 },
        { id: 'spire4', name: 'THE FOURTH SPIRE', x: 90.5, z: -66, yaw: -1.57 },
      ],
    },
  ],
};
