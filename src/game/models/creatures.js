// Creatures (owned by the creature artist). Export CREATURES = { name: { create(assets, opts) -> Model, size, note } }.
//
// spyro    the hero: small purple dragon (pose: speed, grounded, vy, glide, charge, flame, turn, hurt, land, dead, cheer, look)
// snuffer  lantern-snuffing shadow imps, variants basic | bell | thorn
// bunny    fodder critter
// elder    Elder Wick, the lantern keeper
// sparx    the dragonfly companion and health meter (gold / blue / green)
// butterfly  the blue butterflies (ambient ones and the healing ones), looks azure | cyan | violet | sky | pearl | shiny
import { createSpyro } from './creatures/spyro.js';
import { createSnuffer } from './creatures/snuffer.js';
import { createBunny } from './creatures/bunny.js';
import { createElder } from './creatures/elder.js';
import { createSparx } from './creatures/sparx.js';
import { createButterfly } from './creatures/butterfly.js';

export const CREATURES = {
  spyro: {
    create: createSpyro,
    size: 2.6,
    note: 'Hero dragon. Pose { speed, grounded, vy, glide, charge, flame, turn, hurt, land, dead, cheer, look, t }. anchors: mouth, back.',
  },
  snuffer: {
    create: createSnuffer,
    size: 2.4,
    note: 'Lantern-snuffing shadow imp. opts.variant basic|bell|thorn. Pose { speed, attack, alert, hurt, stun, dead, t }. anchors: eyes, poleTip, bell, top.',
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
  elder: {
    create: createElder,
    size: 2.2,
    note: 'Elder Wick, the lantern keeper. Pose { talk, wave 0..1, t }. anchors: lantern (glow sprite), top.',
  },
};
