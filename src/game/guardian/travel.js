// The places of THE GUARDIAN'S COURT for the TRAVEL menu (src/game/travel.js): the door home, the road, the mouth of the court, the floor and the dais. Written by hand (the Court has no goals for the
// realm foundry to find them from), held by tools/travel-check.mjs like every other list. A hero put on the floor or the dais wakes the Guardian (the three seconds of the warp's grace are his to use).
const PI = Math.PI;
export const TRAVEL_PLACES = {
  world: 'guardian', name: 'THE GUARDIAN\'S COURT',
  groups: [
    {
      name: 'THE GORGE ROAD',
      places: [
        { id: 'door', name: 'THE DOOR HOME', x: 0, z: 93, yaw: PI },
        { id: 'crest', name: 'THE CREST', x: 0, z: 56, yaw: PI },
      ],
    },
    {
      name: 'THE COURT',
      places: [
        { id: 'mouth', name: 'THE COURT\'S MOUTH', x: 0, z: 14, yaw: PI },
        { id: 'floor', name: 'THE FLAGSTONE FLOOR', x: -20, z: -50, yaw: Math.atan2(20, 20) },
        { id: 'dais', name: 'THE DAIS', x: 0, z: -22, yaw: PI },
        { id: 'rematch', name: 'THE FIGHT AGAIN', x: 0, z: 8, yaw: PI, rematch: true },          // (the Court built as it was before he was freed: once he is free it is quiet, and a fight is a thing a tester wants again)
      ],
    },
  ],
};
