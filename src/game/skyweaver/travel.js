// The places of SKYWEAVER SPIRES for the TRAVEL menu (src/game/travel.js): the start, a spot in front of every goal, one in each named part of the country and beside each secret. FOUND AND CHECKED
// by tools/realm-travel.mjs (every place passes the rules of tools/lib/travel-rules.mjs): re-run `node tools/realm-travel.mjs skyweaver` after the layout changes rather than editing by hand.
export const TRAVEL_PLACES = {
  world: 'skyweaver', name: 'SKYWEAVER SPIRES',
  groups: [
    {
      name: 'THE GOALS',
      places: [
        { id: 'first', name: 'FIRST LANTERN', x: 10.21, z: 135.58, yaw: 2.68 },
        { id: 'isle', name: 'ISLE LANTERN', x: -7.5, z: 46.1, y: 0.45, yaw: 1.59 },
        { id: 'peak', name: 'GREAT LANTERN', x: 1.97, z: -128, yaw: 3.13 },
      ],
    },
    {
      name: 'THE COUNTRY',
      places: [
        { id: 'start', name: 'THE START', x: 0, z: 156, yaw: 3.14 },
        { id: 'meadow', name: 'THE MEADOW', x: -2.21, z: 116.76, yaw: 2.47 },
        { id: 'ridge', name: 'THE RIDGE', x: 28.77, z: -50.68, yaw: -2.07 },
        { id: 'lookout', name: 'THE LOOKOUT', x: 46, z: -52, yaw: 1.7 },
      ],
    },
    {
      name: 'THE SECRETS',
      places: [
        { id: 'secret-glade', name: 'THE HIDDEN GLADE', x: -58.16, z: 114.05, yaw: -2.2 },
        { id: 'secret-ledge', name: 'THE LOOKOUT', x: 59.41, z: -50.52, yaw: -3.02 },
      ],
    },
  ],
};
