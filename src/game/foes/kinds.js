// The foes: what each kind is, as a table. The three Snuffers the game began with fight as they always have (the 'rush' brain is the EnemySystem's own: one melee state machine); the Rimeling is a
// Snuffer in a shell of ice. The others have a brain of their own (foes/<brain>.js) that says what the foe does; this table says what it is: its numbers, the model it wears, the words the
// game says the first time one has seen the hero. The design is in docs/DESIGN.md (round twenty-eight).
//
//   brain      which behaviour (BRAINS in foes/index.js); 'rush' is the EnemySystem's own
//   model      which model of models/creatures.js (look: its `variant`)
//   hp         every foe falls to one hit of the right thing
//   speed      m/s of its ordinary walk or run (a brain has the others)       notice  how far it sees the hero (m)       reach  how far its swing reaches (the Snuffers' melee)
//   r h cy     its radius, its height and the height of its middle over its feet (where the hero's flame and ram look for it)
//   flameDmg chargeDmg armored spiked shell   the Snuffers' matrix: which attack kills, which rings off, which hurts the hero; `shell`: ice that flame melts and a ram only slides it
//   danger     the weight of one foe in the foundry's danger curve (tools/lib/realm-rules.mjs)
//   hint       what the HUD says the first time one has seen the hero (the kind's lesson, once)
//   untargetable  the hero's aim assist leaves it alone (it cannot be hit now: a mole underground)
import { ENEMY_DROPS as D } from '../economy.js';

export const KINDS = {
  basic: { name: 'SNUFFER', brain: 'rush', model: 'snuffer', look: 'basic', hp: 1, speed: 5.4, notice: 15, reach: 2.7, r: 0.75, h: 2, cy: 1, drops: D.basic, flameDmg: 1, chargeDmg: 1, danger: 1 },
  bell: { name: 'BELL SNUFFER', brain: 'rush', model: 'snuffer', look: 'bell', hp: 1, speed: 4.3, notice: 13, reach: 2.9, r: 0.75, h: 2, cy: 1, drops: D.bell, flameDmg: 0, chargeDmg: 1, armored: true, danger: 2 },
  thorn: { name: 'THORN SNUFFER', brain: 'rush', model: 'snuffer', look: 'thorn', hp: 1, speed: 5.8, notice: 14, reach: 2.5, r: 0.75, h: 2, cy: 1, drops: D.thorn, flameDmg: 1, chargeDmg: 0, spiked: true, danger: 2 },

  // a Snuffer in a shell of ice: three ticks of flame melt it (more than one breath: 0.3 s apart), it grows back 5 s after the last, and then it is a plain Snuffer; a ram only slides it
  rime: {
    name: 'RIMELING', brain: 'rush', model: 'snuffer', look: 'rime', hp: 1, speed: 5.0, notice: 14, reach: 2.7, r: 0.8, h: 2.1, cy: 1, drops: D.rime, flameDmg: 1, chargeDmg: 1, shell: true, melt: 3, regrow: 5, danger: 3,
    hint: 'ICE ARMOUR! MELT IT WITH FIRE FIRST, THEN HIT IT',
  },

  slinger: {
    name: 'SLINGER', brain: 'sling', model: 'snuffer', look: 'slinger', hp: 1, speed: 3.0, notice: 18, reach: 0, r: 0.7, h: 1.9, cy: 1, drops: D.slinger, flameDmg: 1, chargeDmg: 1, danger: 2,
    hint: 'A SLINGER! STEP OUT OF THE RING ON THE GROUND, THEN CLOSE IN',
  },
  hog: {
    name: 'RAMHOG', brain: 'charge', model: 'ramhog', look: 'hog', hp: 1, speed: 2.6, notice: 17, reach: 0, r: 0.95, h: 1.5, cy: 0.75, drops: D.hog, flameDmg: 1, chargeDmg: 1, danger: 3,
    hint: 'A RAMHOG! STEP ASIDE WHEN IT CHARGES AND HIT ITS SIDE',
  },
  mole: {
    name: 'DUSTMOLE', brain: 'burrow', model: 'dustmole', look: 'mole', hp: 1, speed: 6.0, notice: 16, reach: 0, r: 0.75, h: 1.3, cy: 0.6, drops: D.mole, flameDmg: 1, chargeDmg: 1, danger: 1.5,
    hint: 'THE GROUND CRACKS! KEEP MOVING, THEN STRIKE THE DUSTMOLE',
  },
  warden: {
    name: 'LIDWARDEN', brain: 'ward', model: 'snuffer', look: 'warden', hp: 1, speed: 3.6, notice: 14, reach: 2.7, r: 0.85, h: 2.1, cy: 1, drops: D.warden, flameDmg: 1, chargeDmg: 1, danger: 4,
    hint: 'THE LIDWARDEN TURNS SLOWLY: GO ROUND IT AND STRIKE ITS BACK',
  },
  pup: {
    name: 'FUSEPUP', brain: 'fuse', model: 'snuffer', look: 'pup', hp: 1, speed: 7.2, notice: 15, reach: 0, r: 0.6, h: 1.3, cy: 0.6, drops: D.pup, flameDmg: 1, chargeDmg: 1, danger: 3,
    hint: 'A FUSEPUP! FLAME IT FROM FAR, OR RUN: THE KEG GOES OFF',
  },
  moth: {
    name: 'DUSK MOTH', brain: 'swoop', model: 'duskmoth', look: 'moth', hp: 1, speed: 4.0, notice: 18, reach: 0, r: 0.75, h: 1.2, cy: 0.5, drops: D.moth, flameDmg: 1, chargeDmg: 1, danger: 2, flies: true,
    hint: 'A DUSK MOTH! JUMP AND FLAME IT, OR HIT IT AS IT LANDS',
  },
  caller: {
    name: 'SMOKECALLER', brain: 'call', model: 'snuffer', look: 'caller', hp: 1, speed: 3.0, notice: 18, reach: 0, r: 0.75, h: 2.5, cy: 1.1, drops: D.caller, flameDmg: 1, chargeDmg: 1, danger: 3,
    hint: 'THE SMOKECALLER CALLS SNUFFERS OUT OF SMOKE: REACH IT FIRST',
  },
  thief: {
    name: 'PILFERLING', brain: 'flee', model: 'snuffer', look: 'thief', hp: 1, speed: 9.6, notice: 14, reach: 0, r: 0.55, h: 1.5, cy: 0.7, drops: D.thief, flameDmg: 1, chargeDmg: 1, danger: 0.5,
    hint: 'A PILFERLING! IT IS QUICK: CORNER IT OR CATCH IT WITH A RAM',
  },
  // ---- round thirty-eight: the foes that are one world's own (foes/roster.js says which world) -------------------------------------------------
  shiver: {
    name: 'SHIVERLING', brain: 'orbit', model: 'shiverling', look: 'shiver', hp: 1, speed: 5.0, notice: 15, reach: 0, r: 0.5, h: 1.3, cy: 0.65, drops: D.shiver, flameDmg: 1, chargeDmg: 1, danger: 1.5,
    hint: 'A SHIVERLING CIRCLES YOU! BREATHE FIRE AT IT, OR STEP OUT OF ITS DASH AND HIT IT',
  },
  brute: {
    name: 'SLAG BRUTE', brain: 'brute', model: 'slagbrute', look: 'brute', hp: 1, speed: 3.2, notice: 20, reach: 0, r: 1.5, h: 3.2, cy: 1.5, drops: D.brute, flameDmg: 1, chargeDmg: 1, danger: 4,
    hint: 'A SLAG BRUTE! JUMP ITS SLAM, THEN HIT THE OPEN HATCH IN ITS CHEST: THREE TIMES',
  },
  gale: {
    name: 'GALE SPIRIT', brain: 'gust', model: 'galespirit', look: 'gale', hp: 1, speed: 3.5, notice: 22, reach: 0, r: 0.8, h: 1.6, cy: 0.8, drops: D.gale, flameDmg: 1, chargeDmg: 1, danger: 4, flies: true,
    hint: 'A GALE SPIRIT! WHEN THE AIR BENDS, STEP OUT OF ITS LINE BEFORE IT BLOWS',
  },
  crab: {
    name: 'SHELLBACK', brain: 'shell', model: 'shellback', look: 'crab', hp: 1, speed: 3.6, notice: 15, reach: 0, r: 0.95, h: 1.1, cy: 0.55, drops: D.crab, flameDmg: 1, chargeDmg: 1, danger: 3,
    hint: 'A SHELLBACK! RAM ITS FACE TO FLIP IT, OR GO ROUND TO ITS SOFT BACK',
  },
  drifter: {
    name: 'DRIFTER', brain: 'drift', model: 'drifter', look: 'drifter', hp: 1, speed: 2.2, notice: 18, reach: 0, r: 0.8, h: 1.4, cy: 0.8, drops: D.drifter, flameDmg: 1, chargeDmg: 1, danger: 3.5, flies: true,
    hint: 'A DRIFTER! JUMP WHEN ITS GLOW PEAKS, THEN BREATHE FIRE UP AT IT',
  },
  urchin: {
    name: 'URCHIN', brain: 'rush', model: 'urchin', look: 'urchin', hp: 1, speed: 4.6, notice: 14, reach: 2.6, r: 0.8, h: 1.4, cy: 0.7, drops: D.urchin, flameDmg: 1, chargeDmg: 0, spiked: true, danger: 1.5,
    hint: 'AN URCHIN! ITS SPINES HURT WHEN YOU RAM IT: BREATHE FIRE',
  },
};

export const KIND_IDS = Object.keys(KINDS);
/** The kinds that have a brain of their own. */
export const FOE_IDS = KIND_IDS.filter((k) => KINDS[k].brain !== 'rush');
export const kindOf = (id) => KINDS[id] || KINDS.basic;

/** The weight of one foe in the foundry's danger curve (tools/lib/realm-rules.mjs). */
export const DANGER = Object.fromEntries(KIND_IDS.map((k) => [k, KINDS[k].danger]));
