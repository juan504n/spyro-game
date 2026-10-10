// Creatures (owned by the creature artist). Export CREATURES = { name: { create(assets, opts) -> Model, size, note } }.
//
// spyro    the hero: small purple dragon (pose: speed, grounded, vy, glide, charge, flame, turn, hurt, land, dead, cheer, look)
// snuffer  lantern-snuffing shadow imps, variants basic | bell | thorn | rime | slinger | warden | pup | caller | thief
// bunny    fodder critter
// elder    Elder Wick, the lantern keeper
// sparx    the dragonfly companion and health meter (gold / blue / green)
// ramhog   the boar with a brow of bone (foes/charge.js); dustmole  the mole that lives in soft ground (foes/burrow.js); duskmoth  the moth that hangs over the hero (foes/swoop.js)
// shiverling shellback drifter urchin slagbrute galespirit  the foes that are one world's own (foes/roster.js); bloomsprite tidepearl  what the realms' missions are about (missions/)
// butterfly  the blue butterflies (ambient ones and the healing ones), looks azure | cyan | violet | sky | pearl | shiny
import { createSpyro } from './creatures/spyro.js';
import { createSnuffer } from './creatures/snuffer.js';
import { createBunny } from './creatures/bunny.js';
import { createElder } from './creatures/elder.js';
import { createSparx } from './creatures/sparx.js';
import { createButterfly } from './creatures/butterfly.js';
import { createRamhog } from './creatures/ramhog.js';
import { createDustmole } from './creatures/dustmole.js';
import { createDuskmoth } from './creatures/duskmoth.js';
import { createShiverling } from './creatures/shiverling.js';
import { createSlagbrute } from './creatures/slagbrute.js';
import { createGalespirit } from './creatures/galespirit.js';
import { createShellback } from './creatures/shellback.js';
import { createDrifter } from './creatures/drifter.js';
import { createUrchin } from './creatures/urchin.js';
import { createBloomsprite } from './creatures/bloomsprite.js';
import { createTidepearl } from './creatures/tidepearl.js';

export const CREATURES = {
  spyro: {
    create: createSpyro,
    size: 2.6,
    note: 'Hero dragon. Pose { speed, grounded, vy, glide, charge, flame, turn, hurt, land, dead, cheer, look, t }. anchors: mouth, back.',
  },
  snuffer: {
    create: createSnuffer,
    size: 2.4,
    note: 'Lantern-snuffing shadow imp. opts.variant basic|bell|thorn|rime|slinger|warden|pup|caller|thief. Pose { speed, attack, alert, hurt, stun, dead, t } and, for the foes, { shell, shield, fuse, lit, cast, jeer, cower }. anchors: eyes, poleTip, bell, top.',
  },
  bunny: {
    create: createBunny,
    size: 1.0,
    note: 'Fodder critter. Pose { hop 0..1 phase, speed, alarm, burn, t }. anchors: top, nose.',
  },
  sparx: {
    create: createSparx,
    size: 0.6,
    note: 'Sparx the dragonfly companion, in 3D (big eyes, swishing tail, two pairs of translucent wings). setHealth(hp) 3 gold / 2 blue / 1 green. Pose { t, speed, vy, turn, hp, hurt, eat, grab, vis }. anchors: top, mouth.',
  },
  butterfly: {
    create: createButterfly,
    size: 0.9,
    note: 'Blue butterfly in 3D (forewings + hindwings, banded body, antennae). opts { look azure|cyan|violet|sky|pearl|shiny, scale, hover, still }. Pose { t, flap 0..1, speed, vy, turn, wing (radians), vis }. anchors: top.',
  },
  ramhog: {
    create: createRamhog,
    size: 2.0,
    note: 'Boar with a brow of bone. Pose { speed, paw, rush, alert, hurt, stun, dead, t }. anchors: eyes, top.',
  },
  dustmole: {
    create: createDustmole,
    size: 1.4,
    note: 'Mole in a mound of earth. Pose { under (1 hidden .. 0 out), speed, crack, stun, alert, hurt, dead, t }. anchors: eyes, top.',
  },
  duskmoth: {
    create: createDuskmoth,
    size: 1.9,
    note: 'Moth that hangs in the air. Pose { speed, rear, dive, perch, stun, alert, hurt, dead, t }. anchors: eyes, top.',
  },
  shiverling: {
    create: createShiverling,
    size: 1.3,
    note: 'Cold imp of Frostbloom. Pose { speed, attack, shiver 0..1, dash 0|1, stun, alert, hurt, dead, t }. anchors: eyes, top.',
  },
  slagbrute: {
    create: createSlagbrute,
    size: 3.2,
    note: 'Slag Brute of Emberfall. Pose { speed, attack, raise 0..1, vent 0|1, wounds 0..3, stun, alert, hurt, dead, t }. anchors: eyes, top, hatch.',
  },
  galespirit: {
    create: createGalespirit,
    size: 1.6,
    note: 'Gale Spirit of Skyweaver. Pose { speed, attack, gather 0..1, blow 0|1, stun, alert, hurt, dead, t }. anchors: eyes, top.',
  },
  shellback: {
    create: createShellback,
    size: 1.9,
    note: 'Shellback crab of Tideglass. Pose { speed, attack, raise 0..1, flipped 0..1, dir, stun, alert, hurt, dead, t }. anchors: eyes, top.',
  },
  drifter: {
    create: createDrifter,
    size: 1.4,
    note: 'Glass jelly of Tideglass. Pose { speed, attack, glow 0..1, pulse 0|1, stun, alert, hurt, dead, t }. anchors: eyes, top.',
  },
  urchin: {
    create: createUrchin,
    size: 1.4,
    note: 'Spiny walker of Tideglass. Pose { speed, attack, alert, stun, hurt, dead, t }. anchors: eyes, top.',
  },
  bloomsprite: {
    create: createBloomsprite,
    size: 0.9,
    note: 'A sprite of Frostbloom (the mission frees them). See the file for the pose.',
  },
  tidepearl: {
    create: createTidepearl,
    size: 0.8,
    note: 'A pearl of the tide (the Tideglass mission carries them). See the file for the pose.',
  },
  elder: {
    create: createElder,
    size: 2.2,
    note: 'Elder Wick, the lantern keeper. Pose { talk, wave 0..1, t }. anchors: lantern (glow sprite), top.',
  },
};
