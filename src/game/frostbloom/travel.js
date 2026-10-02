// The places of FROSTBLOOM HOLLOW for the TRAVEL menu (src/game/travel.js): the start, a spot in front of every goal, one in each named part of the country and beside each secret. FOUND AND CHECKED
// by tools/realm-travel.mjs (every place passes the rules of tools/lib/travel-rules.mjs): re-run `node tools/realm-travel.mjs frostbloom` after the layout changes rather than editing by hand.
export const TRAVEL_PLACES = {
  world: 'frostbloom', name: 'FROSTBLOOM HOLLOW',
  groups: [
    {
      name: 'THE GOALS',
      places: [
        { id: 'gate', name: 'GATE BLOOM', x: 12.4, z: 143.66, yaw: 2.73 },
        { id: 'rime', name: 'RIMEWOOD BLOOM', x: -119.5, z: 23.12, yaw: -2.47 },
        { id: 'glass', name: 'GLASSWATER BLOOM', x: 1.89, z: 57, y: 0.45, yaw: 3.13 },
        { id: 'ice', name: 'ICEFALL BLOOM', x: 141.47, z: -0.9, yaw: 2.46 },
        { id: 'heart', name: 'HEARTBLOOM', x: 0, z: -154, yaw: 3.14, opens: true },
      ],
    },
    {
      name: 'THE COUNTRY',
      places: [
        { id: 'start', name: 'THE START', x: 0, z: 172, yaw: 3.14 },
        { id: 'ring', name: 'GLASSWATER', x: 0, z: -20, yaw: 1.3 },
        { id: 'rimewood', name: 'RIMEWOOD', x: -104.48, z: 39.72, yaw: -2.1 },
        { id: 'icefall', name: 'THE ICEFALL', x: 115.48, z: 22.47, yaw: 2.1 },
        { id: 'ridge', name: 'AURORA RIDGE', x: 2.64, z: -66.18, yaw: -1.98 },
        { id: 'lookout', name: 'AURORA LOOKOUT', x: 32.15, z: -60.39, yaw: 1.75 },
      ],
    },
    {
      name: 'THE SECRETS',
      places: [
        { id: 'secret-rimeglade', name: 'THE FROZEN GLADE', x: -149.32, z: 76.34, yaw: -2.14 },
        { id: 'secret-lookout', name: 'AURORA LOOKOUT', x: 49.65, z: -60.56, yaw: -2.95 },
      ],
    },
  ],
};
