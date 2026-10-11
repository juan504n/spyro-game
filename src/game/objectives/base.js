// THE BASE OF AN OBJECTIVE (see index.js). It owns the exit object (the one goal of the realm that is drawn and that burns when the task is done), tells the day how far the realm has got (the dawn creeps
// up the sky as the task goes on, as the lanterns of the Vale bring it), and says what the HUD shows. A kind is a class that extends it and plays its task in update(dt).
//
//   game.objective.update(dt, game)    the objective's step           .hudState() -> { text, n, of, bar? } | null    what the HUD says (n of `of`: pips; bar: 0..1, a gauge)
//   Objective.complete()               the task is done: the exit object burns (BeaconSystem.ignite: the ring of light, the finale)
//   Objective.progress(f)              how far the task has gone, 0..1: the dawn's share of the way to the finale
//   Objective.restore()                a saved realm entered again
import * as THREE from 'three';

import { OBJECTIVE_KINDS, objectiveProblems } from './problems.js';
export { OBJECTIVE_KINDS, objectiveProblems };

/** the dawn the task may bring before the exit burns (the exit's own ignition takes it to 1) */
export const DAWN_BEFORE_EXIT = 0.62;

export class Objective {
  constructor(game, spec) {
    this.game = game;
    this.spec = spec;
    this.kind = spec.kind;
    this.final = game.beacons.get(spec.final);
    if (!this.final) throw new Error(`objective: there is no goal '${spec.final}'`);
    this.final.noFire = true;                                                  // (nothing in this world is lit by breathing on it: the task opens the exit)
    this.final.objective = this;
    this.restored = false;
    this.done = false;
    this.f = 0;
    this.group = new THREE.Group();
    this.group.name = `objective-${spec.kind}`;
    game.dyn.add(this.group);
  }

  /** the share of the task that is done: the dawn follows it */
  progress(f) {
    this.f = Math.max(this.f, Math.min(1, f));
    const g = this.game;
    if (!this.final.litFlag) { g.dayTarget = this.f * DAWN_BEFORE_EXIT; g.audio?.setDay?.(g.dayTarget); }
  }

  /** the task is done: the exit object burns, and its ignition is the finale */
  complete() {
    if (this.done) return;
    this.done = true;
    this.final.sealed = false;
    this.game.beacons.ignite(this.final);
  }

  /** `spec.gateAfter` (a trial's id): the realm's gate opens when that trial is solved (a task that is one fight or one run has no lanterns to open it) */
  update(dt, game) {
    if (this.spec.gateAfter && !this._gated) {
      const r = game.trials?.get(this.spec.gateAfter);
      if (r && r.done) { this._gated = true; game.openRealmGate(); }
    }
  }
  frame() {}
  hudState() { return null; }
  restore() { this.restored = true; this.done = true; }
  dispose() { this.group.parent?.remove(this.group); }
}
