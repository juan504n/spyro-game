// "Gloaming Vale" world textures — procedural, hand-painted-look pixel art (no image files).
// Every texture is painted in code from the master ramps in palette.js: chunky, <= 16 colours (a 4bpp CLUT),
// 1-bit alpha, light from the upper left, authored as daylight-true albedo (the twilight/sunrise system
// multiplies them by baked vertex colours, 0.5 = neutral).
// Row 0 of every pix is the TOP of the image. Transparent texels are pure black with a = 0, so cut-outs also work in
// additive materials (which ignore alpha). See tools/texture-sheet.mjs for the contact sheets / QA report.
import { terrainTextures } from './world/terrain.js';
import { buildingTextures } from './world/buildings.js';
import { plantTextures } from './world/plants.js';
import { waterTextures } from './world/water.js';
import { magicTextures } from './world/magic.js';
import { skyTextures } from './world/sky.js';
import { propTextures } from './world/props.js';

/** -> { [name]: { pix: Pix, tile: boolean, cutout: boolean } }. Deterministic; ~70 ms in Node. */
export function generateWorldTextures() {
  return {
    ...terrainTextures(),
    ...buildingTextures(),
    ...plantTextures(),
    ...waterTextures(),
    ...magicTextures(),
    ...skyTextures(),
    ...propTextures(),
  };
}

// One-line usage hints. "N px = M units" is the recommended world size of one texture repeat
// (32 px = 4 units is ~8 texels per unit, about what a PS1 game looks like at 320x240; the ground can go to 6).
export const WORLD_TEXTURE_NOTES = {
  // terrain
  grass_a: 'Sunlit meadow ground, tiles; 32px = 4-6 units. Mix with grass_b / grass_flowers on neighbouring tiles.',
  grass_b: 'Deep lush teal grass for shady or forest meadows; same scale and blade layout as grass_a.',
  grass_flowers: 'grass_a base with sparse 3px flowers; 32px = 5 units so the flowers do not read as a grid.',
  snow: 'Frostbloom Hollow ground: blue-white drifts, shadow-blue hollows, wind ripples and glints, tiles; 32px = 4-6 units.',
  snow_petals: 'snow with blossom petals blown over it; same scale and layout as snow.',
  cobble_frost: 'Frosted cobbles: blue-grey stones with white snow in the gaps; the cobble road of Frostbloom Hollow (level.roadTextures), same mapping as cobble.',
  path_snow: 'Trodden snow: a blue-white dirt path with shadow-blue ruts; the dirt road of Frostbloom Hollow (level.roadTextures), same mapping as dirt.',
  ash: 'Emberfall Crags ground: warm grey ash drifts with wind ripples, clinker (dark cinders) and pale flecks, an ember here and there, tiles; 32px = 4-6 units.',
  cinder: 'Scorched earth: nearly black with pale slag ridges and cracks with a fire in them; the caldera floor, the caves and drifts over the ash of Emberfall Crags; same scale as ash.',
  cliff_basalt: 'Dark basalt strata under a lip of ash, a hairline of ember in the fissures, for the tall faces of Emberfall Crags; same mapping as cliff_bare.',
  cliff_basalt_bare: 'cliff_basalt without the lip of ash along each band: for the tall mountains of Emberfall Crags (a lip every 4 m up a 60 m wall reads as stripes); same orientation and scale.',
  far_ember: 'Dusky red-brown far rock for the distant mountains of Emberfall Crags; 3 close colours, no fine detail.',
  cobble_ember: 'Scorched basalt cobbles with embers glowing in the gaps; the cobble road of Emberfall Crags (level.roadTextures), same mapping as cobble.',
  path_ash: 'Trodden ash: a pale grey-brown dirt path with darker ruts; the dirt road of Emberfall Crags (level.roadTextures), same mapping as dirt.',
  cliff_frost: 'Blue-grey strata under a lip of snow for the tall faces of Frostbloom Hollow; same mapping as cliff_bare.',
  far_frost: 'Pale blue-white far rock for the distant mountains of Frostbloom Hollow; 3 close colours, no fine detail.',
  moss: 'Damp cushion moss for forest/shore floors and mossy patches; 32px = 4 units.',
  dirt: 'Packed earth with pebbles and hairline cracks for tracks and bare patches; 32px = 4 units.',
  sand: 'Beach sand with ripple lines (they run along U) and glints; 32px = 4 units.',
  shore_pebbles: 'Wet grey-blue/brown pebbles for the waterline strip; 32px = 3 units.',
  cobble: 'Warm lavender-grey cobblestone path with mossy gaps; 32px = 3 units (stones ~0.7 unit).',
  flagstone: 'Plaza slabs, 2x2 per tile with worn corners and cracks; 32px = 4 units (2-unit slabs).',
  ice: 'Pale blue ice: 3x3 big plates under a skin of frost with dark blue cracks, a bright lip on each plate\'s lit edge, a few glints; 32px = 4 units (the floor of the homeworld\'s Frost Grotto).',
  cliff: 'Vertical rock face for wall projection: strata run along U, fissures along V, moss hangs from the TOP edge (row 0) with a few specks at the bottom so it wraps; 32px = 4 units, repeat V a whole number of times per wall.',
  cliff_warm: 'Sandstone variant of cliff; same orientation and scale.',
  cliff_bare: 'cliff without the moss lip along each band: for tall faces (the homeworld\'s mountains and its Crag), where a lip every 4 m would stripe the wall; same orientation and scale.',
  cliff_warm_bare: 'Sandstone variant of cliff_bare (the Ember Canyon\'s walls).',
  far_rock: 'Three close colours, no fine detail, for distant mountains so they read smooth under fog; 32px = 16+ units.',
  rune_ring: 'NOT tiled. Dark slab with a pale glowing rune ring; a decal quad ~6 units wide under each lantern plinth (ring radius = 0.8 of the half width, centre hub is dark).',
  // buildings
  brick: 'Lavender-grey running-bond stone bricks (16x8 px per brick); 32px = 3 units (bricks 1.5 x 0.75).',
  brick_warm: 'Terracotta bricks with cream mortar; same layout and scale as brick.',
  brick_mossy: 'Ruin variant of brick with moss and crumbled corners; mix with brick on old walls.',
  plaster: 'Cream stucco wall with blotches and hairline cracks; 32px = 3 units.',
  timber: 'Half-timbered wall PANEL: posts on the left/right edges, rails on the top/bottom, brace from bottom-left to top-right; use one repeat per panel (about 3 units) so the frame lines join up.',
  wood_plank: 'Horizontal planks (they run along U) with butt joints, knots and nails; 32px = 2 units.',
  wood_beam: '16x32 vertical-grain post/beam, grain runs along V; 16x32 = 1 x 2 units.',
  roof_red: 'Scalloped terracotta shingles, rows run along U with row 0 towards the ridge; 32px = 2.5 units.',
  roof_teal: 'Teal slate shingles; same layout and scale as roof_red.',
  thatch: 'Straw thatch, strands hang along V with binding courses; 32px = 3 units.',
  tower_stone: 'Dark bluish-slate ashlar with faint pale rune marks for the observatory tower; 32px = 4 units.',
  metal_brass: '16x16 riveted brass plate for fittings and trim; 16px = 1 unit.',
  metal_iron: '16x16 dark iron plates with rivets for gates and bands; 16px = 1 unit.',
  window: 'NOT tiled, 16x16: glowing amber four-pane window with a wooden frame; put on a quad set into a wall (keep its vertex colour bright so it glows).',
  door: 'NOT tiled, 16x32, opaque: arched plank door inside its own dark timber frame (no alpha needed); quad ratio 1:2.',
  banner: 'NOT tiled, 16x32, opaque: violet banner with a gold lantern emblem, pole at row 0, gold fringe at the bottom rows; quad ratio 1:2.',
  // plants
  bark: '16x32 trunk bark, grain runs along V, U wraps round the trunk; 16x32 = 1.5 x 3 units.',
  bark_pale: '16x32 birch bark with dark horizontal marks; same mapping as bark.',
  leaves_green: 'Cartoon canopy clumps for round tree crowns; 32px = 4 units.',
  leaves_teal: 'Teal canopy variant of leaves_green.',
  leaves_autumn: 'Autumn orange canopy variant of leaves_green.',
  leaves_blossom: 'Pink blossom canopy variant of leaves_green (Frostbloom Hollow).',
  leaves_frost: 'Frosted blue-white canopy variant of leaves_green (Frostbloom Hollow).',
  pine_snow: 'Snow-laden pine sprays (white tips on blue-green) for the pines of Frostbloom Hollow; same mapping as pine.',
  pine_char: 'Charred pine sprays (black needles, ember-orange tips) for the pines of Emberfall Crags; same mapping as pine.',
  pine: 'Overlapping fir sprays for pine cones and skirts; 32px = 3 units.',
  mushroom_cap: 'NOT tiled (U wraps round the cap): crown at row 0, violet frill at the last rows, cream spots; for the bounce mushrooms.',
  mushroom_stem: 'NOT tiled, 16x16: cream stem with gills under the cap at row 0, dirt at the foot; U wraps round the stem.',
  tuft: 'CUTOUT 16x16 grass tuft billboard (alpha test); ~1.2 units wide.',
  flower_pink: 'CUTOUT 16x16 five-petal flower on a stalk; ~1 unit tall.',
  flower_yellow: 'CUTOUT 16x16 yellow tulip on a stalk; ~1 unit tall.',
  flower_blue: 'CUTOUT 16x16 bluebell spray on an arching stalk; ~1 unit tall.',
  flower_ember: 'CUTOUT 16x16 fire lily: a charred stalk and a head of flame-coloured tongues (Emberfall Crags); ~1 unit tall.',
  reeds: 'CUTOUT 16x32 cattail cluster for shorelines; ~1.2 x 2.4 units.',
  fern: 'CUTOUT 16x16 fern fan; ~1.5 units wide.',
  lilypad: 'CUTOUT 16x16 top-down lily pad with a notch; lay flat on the water, ~1.6 units.',
  vine: 'CUTOUT 8x32 hanging ivy; ~0.8 x 3 units, hang from ledges and branches.',
  // water
  water: 'Tiling water surface; scroll the UVs (0.02-0.05/s, a second layer at another angle works well) or draw it 50% transparent; 32px = 6 units.',
  waterfall: '16x32 falling water, streaks along V; scroll V upwards to make it fall; 16x32 = 2 x 4 units.',
  foam: 'CUTOUT tile of bubble foam for shorelines and waterfall bases (alpha test); 32px = 4 units.',
  lava: 'Tiling lava: plates of dark crust on molten rock, white-hot cracks between them (level.liquid of Emberfall Crags); scroll the UVs slowly and draw it self-lit; 32px = 6 units.',
  // magic & light
  crystal_violet: '16x16 faceted crystal, U runs round a hexagonal prism (edges join), row 0 = tip; bright, use additive or emissive.',
  crystal_cyan: 'Cyan variant of crystal_violet.',
  crystal_ember: 'Glowing-coal variant of crystal_violet (Emberfall Crags).',
  lantern_glass_off: '16x16 frosted dim violet panes in a dark brass cage; the unlit lantern face.',
  lantern_glass_on: '16x16 radiant amber panes with a near-white core in a brass cage; swap in when a lantern is lit (leave vertex colour bright).',
  barrier: 'Tiling violet hex-cell energy shimmer; use transparent/additive and scroll slowly; 32px = 3 units.',
  portal: 'Tiling violet/cyan/white vortices; rotate or scroll the UVs, additive; 32px = the disc diameter or smaller.',
  portal_swirl: 'NOT tiled, 64x64 black-backed vortex of three arms (violet -> cyan -> white) round a bright core, fading to black at the rim: additive, over a dark veil; turn it by rotating the UVs.',
  beam: '16x64 greyscale light shaft, dark at the edges: additive, tint with vertex colours, scroll V for a shimmer; stretch along V.',
  sun_glow: 'NOT tiled, 32x32 greyscale radial glow for an additive billboard behind the sun or lantern flames.',
  // sky
  cloud: 'CUTOUT 64x32 chunky cumulus with a flat base (alpha test); billboard, tint with vertex colours.',
  moon: 'CUTOUT 32x32 pale cratered disc; billboard (also fine additive: transparent texels are black).',
  sun_disc: 'CUTOUT 32x32 warm sun disc; billboard (also fine additive: transparent texels are black), combine with sun_glow.',
  // gameplay props
  vase: '32x32 terracotta vase wrap: U round the vase, V bottom to top; rim/foot bands are symmetric so it works either way up.',
  chest_wood: '32x32 chest face: horizontal planks, two vertical iron bands, brass lock plate; the same face can go on every side.',
  crate: '32x32 crate face: frame plus cross braces; put it on all six faces.',
};
