// THE MISSIONS (docs/DESIGN.md, round thirty-nine). The first Spyro games gave every level its own errand: Gloaming Vale's is the lanterns (breathe fire on them), and no other world asks for that. Each of the others has one
// of its own, and the goals of the world (its lanterns, stones, blooms, bells and lenses: BeaconSystem) stay where they are and are lit when the mission says so:
//
//   rescue   Frostbloom Hollow   a sprite sleeps in each frozen bloom: RAM the bloom to free it, lead the freed sprites to the Heartbloom (they follow him, and fly home if he falls)
//   hunt     Emberfall Crags     a Slag Brute holds each of three stones: beat it (three wounds, in the hatch of its chest) and the stone burns
//   chime    Skyweaver Spires    the windbells hang too high for a hero on the ground: fly into one (a jump is enough at the first, the whirlwinds and the glides carry him to the rest) and it rings
//   deliver  Tideglass Reach     the lenses are dark: carry a tide pearl to each (the pearls lie in the shallows, bare only at low tide; he drops it in deep water or when he is hurt)
//
// A brief says its mission as data: `mission: { kind, goals: [ids it lights], ...the kind's own }` (missionProblems holds it). The goals of the realm that are not the mission's are lit by their trials; every goal
// of a world with a mission is out of reach of the flame (`b.noFire`): the lanterns of the Vale are the only ones that are lit by fire. A goal sealed by a trial needs the trial AND the mission.
//
//   (this file: the base of the four; index.js has the registry)
//   game.mission.update(dt, game)    the mission's step         .hudState() -> { text, n, of } | null   what the HUD says        .restore()   a saved realm entered again
//   Mission.complete(b)              the mission's condition for goal `b` is met: it is lit (or, if a trial still seals it, as soon as the trial is solved: TrialSystem._solved)
import * as THREE from 'three';

import { MISSION_KINDS, missionProblems } from './problems.js';
export { MISSION_KINDS, missionProblems };

/** The base of the four: it takes the goals' fire away from them and says when one of them is done. */
export class Mission {
  constructor(game, spec) {
    this.game = game;
    this.spec = spec;
    this.kind = spec.kind;
    this.ids = spec.goals.slice();
    for (const b of game.beacons.list) b.noFire = true;                           // (no goal of this world is lit by breathing on it)
    this.owned = this.ids.map((id) => { const b = game.beacons.get(id); if (!b) throw new Error(`mission: there is no goal '${id}'`); b.mission = this; return b; });
    this.rebuffCd = 0;
    this.restored = false;
    this.group = new THREE.Group();
    this.group.name = `mission-${spec.kind}`;
    game.dyn.add(this.group);
  }

  /** the goals of the mission that are not yet lit */
  get pending() { return this.owned.filter((b) => !b.litFlag); }
  get done() { return this.owned.length - this.pending.length; }

  /** The mission's condition for goal `b` is met: the goal is lit, unless a trial still seals it (the trial's last step lights it: TrialSystem._solved looks at `b.missionDone`). */
  complete(b) {
    if (b.litFlag) return;
    b.missionDone = true;
    if (!b.sealed) this.game.beacons.ignite(b);
  }

  /** What the hero's contact with a goal that is still sealed says: the seal's own words (the trial's ask), once in a while. */
  rebuff(b, what) {
    if (this.rebuffCd > 0) return;
    this.rebuffCd = 4.5;
    const g = this.game, fp = g.beacons.flamePos(b);
    g.fx.hitSpark(fp.x, fp.y, fp.z, 1.0);
    g.audio?.sfx('trial_seal', { vol: 0.9 });
    const t = b.trial && b.trial.t;
    g.hud.hint(`THE ${b.def.name} IS SEALED  -  ${t ? 'FINISH THE ASK THAT STANDS BEFORE IT' : what || 'SOMETHING STILL HOLDS IT'}`, 5);
  }

  /** A breath of fire on a goal that is the mission's: it takes none, and the HUD says what it does want (once in a while). */
  _flameRebuff(p, say) {
    if (!(p.flameT > 0) || this.rebuffCd > 0) return;
    for (const b of this.pending) {
      if (!p.flameHits(b.x, b.y + 2.4 * b.scale, b.z, b.radius, 3.2 * b.scale)) continue;
      this.rebuffCd = 4.5;
      const fp = this.game.beacons.flamePos(b);
      this.game.fx.hitSpark(fp.x, fp.y, fp.z, 0.8);
      this.game.audio?.sfx('trial_seal', { vol: 0.7 });
      this.game.hud.hint(say, 5);
      return;
    }
  }

  update(dt) { this.rebuffCd = Math.max(0, this.rebuffCd - dt); }
  frame() {}
  hudState() { return null; }
  restore() { this.restored = true; for (const b of this.owned) b.missionDone = true; }
  dispose() { this.group.parent?.remove(this.group); }
}

