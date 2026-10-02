// The places of EMBERFALL CRAGS for the TRAVEL menu (src/game/travel.js): the start, a spot in front of every goal, one in each named part of the country and beside each secret. FOUND AND CHECKED
// by tools/realm-travel.mjs (every place passes the rules of tools/lib/travel-rules.mjs): re-run `node tools/realm-travel.mjs emberfall` after the layout changes rather than editing by hand.
export const TRAVEL_PLACES = {
  world: 'emberfall', name: 'EMBERFALL CRAGS',
  groups: [
    {
      name: 'THE GOALS',
      places: [
        { id: 'gate', name: 'FORGE STONE', x: -149.86, z: 29.06, yaw: 1.84 },
        { id: 'grove', name: 'GROVE STONE', x: -125.94, z: -52.5, yaw: 2.64 },
        { id: 'anvil', name: 'ANVIL STONE', x: -10.74, z: -10.11, yaw: 1.84, shelf: true },
        { id: 'smelter', name: 'SMELTER STONE', x: 154.58, z: 29.74, yaw: 2.78, opens: true },
        { id: 'heart', name: 'HEARTFORGE', x: 146.62, z: -167.86, yaw: 2.14, opens: true },
      ],
    },
    {
      name: 'THE COUNTRY',
      places: [
        { id: 'start', name: 'THE START', x: -175, z: 36, yaw: 1.57 },
        { id: 'flats', name: 'THE CINDER FLATS', x: -126.87, z: 31.79, yaw: 1.75 },
        { id: 'grove-part', name: 'THE CINDER GROVE', x: -125.89, z: -21.55, yaw: 3.1 },
        { id: 'stair', name: 'THE BASALT STAIR', x: -82.96, z: 7.68, yaw: -3.02 },
        { id: 'rim', name: 'THE BASALT RIM', x: -50.91, z: -62.43, yaw: -2.78 },
        { id: 'northway', name: 'THE NORTH CAUSEWAY', x: 19.64, z: -124.02, yaw: 1.16 },
      ],
    },
    {
      name: 'THE COUNTRY (2)',
      places: [
        { id: 'ashway', name: 'THE ASHWAY', x: -15.73, z: 114.09, yaw: 1.53 },
        { id: 'lookout', name: 'THE LOOKOUT TRAIL', x: -52.12, z: 133.17, yaw: 0.35 },
        { id: 'shelf', name: 'THE ANVIL PLATEAU', x: 56.03, z: -22.52, yaw: 2.62 },
        { id: 'forecourt', name: 'THE MAW', x: 79.15, z: 17.23, yaw: 0.98 },
        { id: 'gorge', name: 'THE CINDER GORGE', x: 153.98, z: -82.01, yaw: -1.89, opens: true },
        { id: 'caldera', name: 'THE CALDERA', x: 152.12, z: -143.88, yaw: -2.88, opens: true },
      ],
    },
    {
      name: 'THE SECRETS',
      places: [
        { id: 'secret-ashglade', name: 'THE ASH GLADE', x: -151.13, z: 105.69, yaw: 0.33 },
        { id: 'secret-lookout', name: 'THE EMBER LOOKOUT', x: -51.26, z: 156.73, yaw: 1.2 },
        { id: 'secret-balcony', name: 'THE SMELTER BALCONY', x: 195.26, z: 42.73, yaw: -1.2, opens: true },
      ],
    },
  ],
};
