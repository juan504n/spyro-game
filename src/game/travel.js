// The places the TRAVEL menu can take the hero to: a debugging tool, to get at once to any part of either world and look at it. The menu (app.js) lists the worlds, then the groups of
// places of a world (a page of a phone's menu holds about six rows), then the places; a place is picked, the menu asks ARE YOU SURE?, and YES takes the hero there.
//
// A place is { id, name, x, z, yaw, y? }: where the hero is put, the way he faces (yaw 0 looks south, +z; PI looks north; PI / 2 looks east) and, when the ground there is not the terrain
// (a pier, a floating isle, a summit's slab, a tower's floor), the height of the floor. `tools/travel-check.mjs` holds every place to the same standard: it is somewhere the hero can
// stand, clear of rock and props, away from the Snuffers and from a door that is awake, and (in Dawnhaven) a part of the walkable country. The app (App._placeHero) puts him there, makes
// him untouchable for a few seconds as after a respawn, and makes the place his checkpoint; a place inside the ward that seals the vale's summit (the observatory) opens the Dawn Gate first.
import { TRAVEL_PLACES as TRAVEL_FROSTBLOOM } from './frostbloom/travel.js';
import { TRAVEL_PLACES as TRAVEL_EMBERFALL } from './emberfall/travel.js';
import { TRAVEL_PLACES as TRAVEL_SKYWEAVER } from './skyweaver/travel.js';
import { TRAVEL_PLACES as TRAVEL_TIDEGLASS } from './tideglass/travel.js';
import { TRAVEL_PLACES as TRAVEL_GUARDIAN } from './guardian/travel.js';
// <realm-travel-imports>  (tools/realm-travel.mjs adds the import of a realm's places above this line)
const PI = Math.PI;
/** the yaw that looks from (x, z) towards (tx, tz) */
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

export const TRAVEL = [
  {
    world: 'gloaming', name: 'GLOAMING VALE',
    groups: [
      {
        name: 'THE VALE',
        places: [
          { id: 'start', name: 'THE START', x: 0, z: 158, yaw: PI },
          { id: 'village', name: 'HEARTH VILLAGE', x: 0, z: 146, yaw: PI },
          { id: 'dock', name: 'MIRRORMERE DOCK', x: -4.8, z: 76.2, yaw: PI },
          { id: 'shrine', name: 'SHRINE ISLE', x: -3.4, z: 34.9, yaw: PI },
          { id: 'ruins', name: 'THE RUINS', x: -77, z: 98, yaw: PI },
          { id: 'windmill', name: 'WINDMILL HILL', x: 104, z: 30, yaw: face(104, 30, 112, 26) },
        ],
      },
      {
        name: 'THE HEIGHTS',
        places: [
          { id: 'mesa', name: 'LAUNCH MESA', x: -112, z: 44, yaw: face(-112, 44, -4, 30) },
          { id: 'heron', name: 'HERON POINT', x: 12.8, z: -9.2, yaw: face(12.8, -9.2, -4, 27) },
          { id: 'cascade', name: 'CASCADE PLATEAU', x: 72, z: -104, yaw: 0 },
          { id: 'hollow', name: 'CRYSTAL HOLLOW', x: -69.9, z: -70.4, yaw: 0 },
          { id: 'dawn-gate', name: 'THE DAWN GATE', x: 0, z: -80, yaw: PI },
        ],
      },
      {
        name: 'SKY AND SUMMIT',
        places: [
          { id: 'isle1', name: 'SKY ISLE 1', x: -126, z: 12, y: 29, yaw: PI / 2 },
          { id: 'isle2', name: 'SKY ISLE 2', x: -130, z: -26, y: 34, yaw: PI / 2 },
          { id: 'isle3', name: 'SKY ISLE 3', x: -116, z: -68, y: 39, yaw: PI / 2 },
          { id: 'isle4', name: 'SKY ISLE 4', x: -72, z: -93, y: 45, yaw: PI },
          { id: 'observatory', name: 'THE OBSERVATORY', x: 0, z: -121, y: 62.2, yaw: PI },
          { id: 'beacon-room', name: 'GREAT BEACON ROOM', x: 5, z: -130, y: 86.2, yaw: face(5, -130, 0, -132) },
        ],
      },
    ],
  },
  {
    world: 'home', name: 'DAWNHAVEN',
    groups: [
      {
        name: 'THE COUNTRY',
        places: [
          { id: 'cove', name: 'LANDING COVE', x: -29.07, z: 145.2, yaw: 1.46 },
          { id: 'heartlands', name: 'THE HEARTLANDS', x: 20, z: 94, yaw: PI },
          { id: 'forecourt', name: 'THE FORECOURT', x: 6, z: 22, yaw: PI },
          { id: 'terraces', name: 'HEARTH TERRACES', x: -60, z: 101, yaw: PI },
          { id: 'windmill-ridge', name: 'WINDMILL RIDGE', x: -116, z: -70, yaw: PI },
          { id: 'garden', name: 'HIDDEN GARDEN', x: -80, z: 33, yaw: -0.83 },
        ],
      },
      {
        name: 'LAKE AND CANYON',
        places: [
          { id: 'lake-shore', name: 'MIRROR LAKE SHORE', x: 128, z: 92, yaw: PI },
          { id: 'pier-end', name: 'TIDEGLASS PIER', x: 128, z: 49.4, y: 0.3, yaw: PI },
          { id: 'islet', name: 'THE ISLET', x: 111.5, z: 62.5, yaw: face(111.5, 62.5, 114, 62) },
          { id: 'canyon', name: 'EMBER CANYON', x: 136, z: -54, yaw: PI },
          { id: 'forge', name: 'THE FORGE', x: 151.6, z: -154.5, yaw: face(151.6, -154.5, 152, -164) },
        ],
      },
      {
        name: 'INSIDE THE CRAG',
        places: [
          { id: 'south-mouth', name: 'SOUTH MOUTH', x: 6, z: 2, yaw: PI },
          { id: 'echo-hall', name: 'ECHO HALL', x: 4.9, z: -42.6, yaw: PI },
          { id: 'winding-way', name: 'WINDING WAY', x: -14.4, z: -80.7, yaw: 2.4 },
          { id: 'grotto', name: 'FROST GROTTO', x: 35.2, z: -84.7, yaw: face(35.2, -84.7, 42.5, -87.5) },       // (8 m from the Frostbloom door, which is awake: its light is 6 m)
          { id: 'vault', name: 'CRYSTAL VAULT', x: 4, z: -69, yaw: PI },
          { id: 'north-passage', name: 'NORTH PASSAGE', x: 32.4, z: -104.3, yaw: 2.6 },       // (6 m from the Skyweaver door above it, which is awake)
        ],
      },
      {
        name: 'UP AND AWAY',
        places: [
          { id: 'ledge', name: 'LEDGE ROAD', x: -25, z: -2, y: 9.08, yaw: PI },
          { id: 'summit', name: 'THE SUMMIT', x: 31.4, z: -95.6, y: 35.7, yaw: face(31.4, -95.6, 37, -99) },       // (looking at the Skyweaver door, which is awake: its light is 6 m)
          { id: 'ascent', name: 'THE ASCENT', x: 12, z: -152, yaw: PI },
          { id: 'guardian-gate', name: 'GUARDIAN\'S GATE', x: 5.1, z: -173.6, yaw: PI },
        ],
      },
    ],
  },
  TRAVEL_FROSTBLOOM,
  TRAVEL_EMBERFALL,
  TRAVEL_SKYWEAVER,
  TRAVEL_TIDEGLASS,
  TRAVEL_GUARDIAN,
  // <realm-travel-entries>  (tools/realm-travel.mjs adds the entry of a realm's places above this line)
];

/** the world entry of the list (by REALMS id) */
export const travelWorld = (id) => TRAVEL.find((w) => w.world === id) || null;

/** every place of a world, flat, each with its `world` (the REALMS id), `group` (the name of its group) and a `key` that names it for good ("home/echo-hall") */
export function travelPlaces(worldId) {
  const w = travelWorld(worldId);
  if (!w) return [];
  return w.groups.flatMap((g) => g.places.map((p) => ({ ...p, world: w.world, group: g.name, key: `${w.world}/${p.id}` })));
}

/** a place by its key ("gloaming/dock"), or null */
export function findPlace(key) {
  const [world] = String(key).split('/');
  return travelPlaces(world).find((p) => p.key === key) || null;
}

/** where the hero is put for a place: on the ground (or on the floor the place names), a hair above it */
export const heroSpot = (grid, p) => ({ x: p.x, y: (p.y ?? grid.heightAt(p.x, p.z)) + 0.05, z: p.z, yaw: p.yaw });
