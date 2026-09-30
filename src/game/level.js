// LEVEL DESIGN: "Gloaming Vale" — the single source of truth for the realm's layout.
// Coordinates: x = east, z = south, y = up. World is centred on the origin. Units ~ metres (Spyro ~1.6 long).
//
// Flow: spawn at the south portal -> Hearth Village (Beacon I, tutorial) -> the ring road around Mirrormere lake
// leads to Beacon II (island shrine), Beacon III (windmill hill, brazier puzzle) and Beacon IV (sky isles, glide).
// With four Beacons lit the Dawn Gate at the foot of the north mountain dissolves; the spiral climb ends at the
// Observatory where the Great Beacon V waits. Lighting it raises the sun.

export const WORLD = { size: 384, cell: 2.4 };
/** Radius around the summit of the ward that keeps the hero out of the mountain until the Dawn Gate opens (it passes through the gate). */
export const WARD_RADIUS = 42;
export const WATER_LEVEL = 0;

/** Points on a spiral: returns [[x, z, y], ...] */
export function spiral(cx, cz, r0, r1, a0, turns, y0, y1, steps = 40) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + t * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * t;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, y0 + (y1 - y0) * t]);
  }
  return pts;
}

export const LEVEL = {
  name: 'Gloaming Vale',
  spawn: { x: 0, z: 158, yaw: Math.PI },

  // valley shell: playable ellipse, ringed by impassable mountains
  valley: { x: 0, z: 14, rx: 176, rz: 176, rimStart: 0.84 },

  lake: { x: -4, z: 30, rx: 60, rz: 42, bed: -4.4 },
  island: { x: -4, z: 27, r: 12, top: 2.5 },
  ponds: [],                                                        // (a pond here sat on the east trail / ring road junction)

  village: { x: 0, z: 138, r: 30, fall: 16, h: 3.2 },
  portal: { x: 0, z: 172, r: 9.5, fall: 6, h: 3.4 },               // level pad under the realm portal arch (cut into the south rim)
  mesa: { x: -112, z: 42, r: 20, fall: 20, h: 26 },                // launch cliff for the sky isles
  windHill: { x: 112, z: 26, r: 50, h: 21, topR: 9, topH: 21.5 },
  summit: { x: 0, z: -132, r: 66, h: 58, topR: 12, topH: 61 },
  gate: { x: 0, z: -90 },                                           // the Dawn Gate at the mountain's foot
  landing: { x: -4, z: 76, r: 20, fade: 10 },                       // the pier's foot, where the main road reaches Mirrormere: one calm lawn (see terrain-mesh.js), fading out over `fade` metres
  hollow: { x: -68, z: -70, r: 20 },                               // crystal hollow bowl
  heron: { x: 12, z: -12, r: 12, fall: 8, h: 15 },                 // headland over the lake's north shore
  cascade: { x: 72, z: -104, r: 30, fall: 4, h: 30 },              // plateau the waterfall pours from
  ruinsMound: { x: -78, z: 102, r: 13, h: 6.2 },

  // rolling hills that break up the valley floor and frame sight-lines
  hills: [
    { x: -92, z: 10, r: 24, h: 9 }, { x: -30, z: -34, r: 26, h: 6.5 }, { x: 34, z: -50, r: 22, h: 7 },
    { x: 86, z: 88, r: 24, h: 6.5 }, { x: -54, z: 112, r: 22, h: 6 }, { x: 48, z: 6, r: 18, h: 4.5 },
    { x: -22, z: -100, r: 22, h: 8 }, { x: 34, z: -112, r: 18, h: 9 }, { x: 60, z: 116, r: 20, h: 5.5 },
    { x: -70, z: 84, r: 16, h: 4 }, { x: 20, z: 104, r: 14, h: 3.5 }, { x: 96, z: -30, r: 26, h: 8 },
  ],

  // the five beacons
  lanterns: [
    { id: 'hearth', name: 'HEARTH BEACON', x: 0, z: 132 },
    { id: 'isle', name: 'ISLE BEACON', x: -4, z: 27 },
    { id: 'mill', name: 'MILL BEACON', x: 112, z: 26 },
    { id: 'sky', name: 'SKY BEACON', x: -72, z: -98 },
    { id: 'dawn', name: 'GREAT BEACON', x: 0, z: -132 },
  ],

  // sky isles (floating). y is the walkable top surface.
  isles: [
    { id: 'i1', x: -126, z: 8, y: 29, r: 13 },
    { id: 'i2', x: -130, z: -32, y: 34, r: 12 },
    { id: 'i3', x: -110, z: -68, y: 39, r: 13 },
    { id: 'i4', x: -72, z: -98, y: 45, r: 15 },
  ],

  // roads ([x, z] or [x, z, y]); y pins the path height, otherwise it follows (smoothed) terrain
  paths: [
    { id: 'main', surface: 'cobble', width: 6, pts: [[0, 172], [0, 156], [0, 138], [0, 118], [-3, 100], [-2, 86], [-3, 76]] },
    { id: 'west', surface: 'dirt', width: 4.6, pts: [[-3, 80], [-30, 80], [-58, 74], [-76, 66], ...spiral(-112, 42, 40, 9, 0.5, 0.82, 3.4, 26, 26)] },
    { id: 'east', surface: 'dirt', width: 4.6, pts: [[0, 84], [30, 86], [56, 74], [76, 58], [90, 46]] },
    { id: 'mill', surface: 'dirt', width: 4.2, pts: spiral(112, 26, 40, 11, Math.PI * 0.62, 1.45, 3.2, 20.2, 44) },
    // the two ring roads follow the terrain all the way and run into the sides of the gate's forecourt (no pinned heights: a pin
    // 9 m below the natural ground at the gate dragged the last 40 m of both roads down into a trench below the waterline)
    { id: 'ringW', surface: 'dirt', width: 4.4, pts: [[-80, 62], [-72, 34], [-70, 6], [-58, -24], [-40, -50], [-28, -68], [-17, -75], [-7.6, -78.6]] },
    { id: 'ringE', surface: 'dirt', width: 4.4, pts: [[76, 58], [70, 28], [62, 4], [52, -16], [44, -40], [30, -64], [18, -73], [7.6, -78.6]] },
    // the Dawn Gate's forecourt: a paved apron 16 m wide that climbs gently from the valley floor to the gate's threshold (both ends
    // pinned; it is not drawn as a ribbon, the terrain itself is paved there); the ring roads end at its sides
    { id: 'plaza', surface: 'flagstone', width: 15, shoulder: 7.5, pts: [[0, -77.5, 2.2], [0, -90.5, 4.4]] },
    { id: 'summit', surface: 'cobble', width: 6, pts: [[0, -91, 4.4], ...spiral(0, -132, 37, 15.5, Math.PI * 0.5, 1.85, 5.0, 61.0, 54), [9.7, -124.9, 61.05]] },   // last stretch runs level onto the observatory's base ring (r 13.4, top y ~60.7)
    { id: 'ruins', surface: 'dirt', width: 3.6, pts: [[-58, 74], [-66, 90], [-76, 100]] },
    { id: 'meadow', surface: 'dirt', width: 3.6, pts: [[30, 86], [50, 98], [72, 102]] },
    { id: 'hollow', surface: 'dirt', width: 3.6, pts: [[-50, -36], [-60, -50], [-66, -58]] },
    { id: 'landing', surface: 'cobble', width: 4.2, pts: [[-3, 76], [-4, 68]] },
    { id: 'heron', surface: 'dirt', width: 3.8, pts: [[48.3, -27.8, 3.0], [40, -24, 2.8], ...spiral(12, -12, 21, 9, -0.35, -0.6, 3.2, 15, 26)] },     // ramp up Heron Point (branches off ringE's west bank; pinned to its height at the junction)
  ],

  // streams: surfaceY pinned; carved bed sits below the surface
  rivers: [
    { id: 'river', width: 6.5, pts: [[72, -68, 2.4], [72, -62, 2.4], [70, -44, 2.2], [60, -30, 1.9], [50, -18, 1.4], [42, -8, 0.85], [40, 4, 0.15]] },
  ],
};
