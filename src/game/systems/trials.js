// The trials of a realm as the game plays them (the machines are trials/, the design is docs/DESIGN.md round twenty-nine): an ask that stands in front of a lantern and SEALS it. While it is unsolved
// the lantern takes no flame (a breath on it is turned away and the HUD says what the trial wants); the last step of the trial breaks the seal and, a moment after, lights the lantern with all the
// ceremony of one lit by fire (BeaconSystem.ignite). This file is the part that is not pure: it makes the trial from what the layout wrote (`gp.trials`), steps its machine with the Player, lets a
// machine call foes out of the EnemySystem, keeps the HUD's line and the lesson (what a kind asks, said once), and hands what the machine says to the views (systems/trialview.js: what it looks and sounds like).
//
//   gp.trials [{ id, kind, goal (the id of the lantern it seals), x, z, y?, ...the kind's own parts (trials/*.js), gems? (what a solved trial pays), look? }]
import { makeTrial, stepTrial, hudOf, targetsOf, whereIs, TRIALS } from '../trials/index.js';
import { lcg } from '../trials/core.js';
import { makeView, SealView } from './trialview.js';

const seen = new Set();                                  // the kinds whose lesson the HUD has said this time the game is open (a kind teaches once)
const LESSON_R = 17;                                     // how near a trial the hero comes before it says what it asks
const NEAR = 26;                                         // how near its lantern he must be, when the seal breaks, for the lantern to be lit at once (else it waits for his fire)
const hash = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h || 1; };

export class TrialSystem {
  /** specs: gp.trials (the realm's), or none: a trial can be put into a running world with add() (tools/trial-bot.mjs does) */
  constructor(game, specs = []) {
    this.game = game;
    this.list = [];
    this.queue = [];
    for (const s of specs) this.add(s);
  }

  /** A trial comes into the world. Its lantern (`spec.goal`, the id of a goal) is sealed until it is solved; a trial with no goal seals nothing. Returns its record. */
  add(spec) {
    const g = this.game;
    const beacon = spec.goal ? (g.beacons && g.beacons.get(spec.goal)) || null : null;
    if (spec.goal && !beacon) throw new Error(`trial '${spec.id}': there is no goal '${spec.goal}' to seal`);
    const rng = lcg(spec.seed ?? hash(`${(g.realm && g.realm.id) || ''}:${spec.id}`));
    const r = { spec, beacon, t: null, view: null, seal: null, ctx: null, done: false, rebuffCd: 0, foes: [] };
    r.ctx = {
      p: g.player, rng,
      emit: (type, d) => this._on(r, type, d || {}),
      spawn: (kind, x, z, o = {}) => this._spawn(r, kind, x, z, o),
      fate: (h) => this._fate(h),
      dismiss: (h) => { if (h) g.enemies.dismiss(h); },
    };
    // (every part stands on the ground it is on: the machines hold the hero's flame and feet to the height of a bell and a plate)
    const parts = {};
    for (const k of ['bells', 'plates', 'pylons', 'vents']) if (spec[k]) parts[k] = spec[k].map((q) => ({ ...q, y: q.y ?? g.collision.heightAt(q.x, q.z) }));
    r.t = makeTrial({ ...spec, ...parts, y: spec.y ?? g.collision.heightAt(spec.x, spec.z) }, r.ctx);
    r.view = makeView(this, r);
    if (beacon) { beacon.sealed = true; beacon.trial = r; r.seal = new SealView(this, r); }
    this.list.push(r);
    return r;
  }

  get(id) { return this.list.find((r) => r.spec.id === id); }

  /** A trial leaves the world (what it called is put away, its props and marks go, its lantern is free of the seal). */
  remove(r) {
    const g = this.game;
    for (const e of r.foes) if (e.state !== 'dead') g.enemies.dismiss(e);
    r.foes.length = 0;
    r.view.dispose?.(); r.seal?.dispose();
    if (r.beacon && r.beacon.trial === r) { r.beacon.sealed = false; r.beacon.trial = null; }
    const i = this.list.indexOf(r);
    if (i >= 0) this.list.splice(i, 1);
  }

  /** a foe a machine calls (a thief, the waves of a siege): it pays nothing when it falls (the trial pays, once, when it is solved) */
  _spawn(r, kind, x, z, o) {
    const g = this.game;
    const e = g.enemies.add({ x, z, variant: kind, wild: !!o.wild, noGems: true, trial: r.spec.id, y: g.collision.heightAt(x, z) });
    g.fx.puff(x, e.y + 1.0, z, 1.0);
    g.audio?.sfx('foe_puff', { vol: 0.6 });
    r.foes.push(e);
    return e;
  }

  /** what became of a foe a machine called: alive, killed (by the hero's hand or a blast) or gone (put away: the hero was set back, or it went off by itself) */
  _fate(h) {
    if (!h) return 'gone';
    if (h.slain) return 'killed';
    if (h.gone || h.state === 'dead') return 'gone';
    return 'alive';
  }

  /** What a machine says: the view makes it look and sound like something; a solved trial breaks its seal. */
  _on(r, type, d) {
    r.view.on(type, d);
    if (type === 'solved') this._solved(r, false);
    if (type === 'return') this._carryBack(r, d);
  }

  /**
   * A gust carries the hero back to where a flown trial begins (the ledge): he landed where its course ends, with it unsolved, and the way back is a long walk or none (the stack in the lava). The
   * ride is the game's own carry (Player.carry, as the light of a portal takes him up): an arc over the gap, a moment of wind, and he stands on the ledge facing the course.
   */
  _carryBack(r, d) {
    const g = this.game, p = g.player;
    if (p.carry || p.dead || r.done) return;
    const from = [p.x, p.y, p.z], to = [d.x, d.y + 0.05, d.z], dist = Math.hypot(to[0] - from[0], to[2] - from[2]);
    const dur = 1.3 + dist / 45, ease = (k) => k * k * (3 - 2 * k), toward = Math.atan2(to[0] - from[0], to[2] - from[2]);
    p.invulnT = Math.max(p.invulnT, 1);                                                            // (untouchable for the ride: the timer does not run down while he is carried. The carry owns him; nothing is locked, so that a hero who is put somewhere else on the way - the TRAVEL menu - is free at once)
    g.audio?.sfx('trial_gust', { vol: 0.9 });
    g.fx.puff(p.x, p.y + 0.5, p.z, 1.0);
    g.hud.hint('A GUST CARRIES YOU BACK TO THE LEDGE', 3.2);
    p.carry = {
      t: 0, dur,
      at: (k) => { const e = ease(k), arc = Math.sin(Math.PI * k) * (4 + 0.14 * dist); return [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e + arc, from[2] + (to[2] - from[2]) * e, k < 0.85 ? toward : d.yaw]; },
      onDone: () => {
        p.carry = null;
        p.vy = 0; p.invulnT = 1.2;                                                                 // (the last of the arc's speed is not his; a moment to look about: the ride has set him down facing the course)
        g.cam.snapBehind(p);
        g.fx.puff(p.x, p.y + 0.5, p.z, 0.9);
      },
    };
  }

  /** The seal breaks. `quiet`: no ceremony (the lantern was lit some other way, or the realm is a saved one entered again). A lantern within 26 m is lit a moment later with all its ceremony; one that is further off is freed, and waits for his breath. */
  _solved(r, quiet) {
    if (r.done) return;
    r.done = true;
    r.t.state = 'solved';
    const g = this.game, b = r.beacon;
    g.stats.trials++;
    if (b) b.sealed = false;
    for (const e of r.foes) if (e.state !== 'dead') g.enemies.dismiss(e);          // (what a trial called is put away with it)
    r.foes.length = 0;
    r.view.solved?.(quiet);
    if (r.seal) r.seal.shatter(quiet);
    if (!quiet) {
      g.audio?.sfx('trial_break', { vol: 1 });
      g.cam.shake(0.25, 0.4);
      if (b && r.spec.gems && r.spec.gems.length) g.gems.burst(b.x, b.y + 2.2, b.z, r.spec.gems, 1.2);
    }
    if (b && !b.litFlag) {
      if (quiet) g.beacons.ignite(b);
      else if (Math.hypot(g.player.x - b.x, g.player.z - b.z) < NEAR) g.after(0.9, () => g.beacons.ignite(b));        // (the seal falls, and then the lantern is lit)
      else {                                                                        // (a lantern far from the trial: its seal is broken, and it waits for his fire; its column pulses so that it is seen)
        b.ready = true;
        g.after(1.6, () => {
          if (b.litFlag) return;
          const where = whereIs({ x: b.x, z: b.z }, g.player);                              // (and where it is: a lantern 70 m off is not in sight)
          g.hud.hint(`THE SEAL IS BROKEN  -  THE ${b.def.name} WAITS FOR YOUR FIRE${where ? `  (${where})` : ''}`, where ? 6.5 : 5);
        });
      }
    }
    g.emit('trial', r.t, g.stats.trials);
  }

  /** A saved realm entered again: every seal is broken already (the lanterns burn: BeaconSystem.restore), none of it plays out. */
  restore() {
    for (const r of this.list) {
      r.done = true; r.t.state = 'solved';
      if (r.beacon) r.beacon.sealed = false;
      r.view.restore?.();
      r.seal?.restore();
    }
    this.game.stats.trials = this.list.length;
  }

  update(dt, game) {
    if (!this.list.length) return;
    const p = game.player;
    for (const r of this.list) {
      r.rebuffCd = Math.max(0, r.rebuffCd - dt);
      if (r.done) continue;
      if (r.beacon && r.beacon.litFlag) { this._solved(r, true); continue; }       // (lit by some other means: the trial has nothing left to ask)
      stepTrial(r.t, dt, r.ctx);
      // a breath on the sealed lantern is turned away, and the HUD says what the trial wants
      const b = r.beacon;
      if (b && b.sealed && p.flameT > 0 && r.rebuffCd <= 0 && p.flameHits(b.x, b.y + 2.4 * b.scale, b.z, b.radius, 3.2 * b.scale)) {
        r.rebuffCd = 4.5;
        const fp = game.beacons.flamePos(b);
        game.fx.hitSpark(fp.x, fp.y, fp.z, 1.0);
        game.audio?.sfx('trial_seal', { vol: 0.9 });
        const where = whereIs(r.t, p);                                                       // (and where to find it, when it is not in sight: 98 m of country is a long way to hunt)
        if (!(r.t.kind === 'siege' && r.t.state === 'active')) game.hud.hint(`THE LANTERN IS SEALED  -  ${TRIALS[r.t.kind].hint}${where ? `  (${where})` : ''}`, where ? 6.5 : 5);        // (not in the middle of the siege that stands round it: he is doing what it says)
      }
      if (!seen.has(r.t.kind) && Math.hypot(p.x - r.t.x, p.z - r.t.z) < LESSON_R && !this.queue.some((q) => q.id === r.t.kind)) this.queue.push({ id: r.t.kind, text: TRIALS[r.t.kind].hint });
    }
    this._lesson();
  }

  /** a kind's lesson, once, when the hint line is free (it never takes the place of what the player is being told) */
  _lesson() {
    if (!this.queue.length) return;
    const hud = this.game.hud;
    if (!hud || hud.hintState || hud.dlg) return;
    const q = this.queue.shift();
    seen.add(q.id);
    hud.hint(q.text, 6);
  }

  frame(dt, alpha, game) {
    for (const r of this.list) { r.view.frame(dt, alpha); if (r.seal) r.seal.frame(dt); }
  }

  /** what the HUD shows: the line of the nearest trial that has something to say, or null */
  hudState() {
    const p = this.game.player;
    let best = null, bd = Infinity;
    for (const r of this.list) {
      if (r.done) continue;
      const h = hudOf(r.t);
      if (!h) continue;
      const d = Math.hypot(p.x - r.t.x, p.z - r.t.z);
      if (d < bd) { bd = d; best = { ...h, kind: r.t.kind, name: TRIALS[r.t.kind].name }; }
    }
    return best;
  }

  /** what the hero's aim assist may swing to: the bells while it is his turn, the wisps in the air */
  targets() {
    const out = this._targets || (this._targets = []);
    out.length = 0;
    for (const r of this.list) if (!r.done) for (const q of targetsOf(r.t)) out.push(q);
    return out;
  }

  dispose() { for (const r of this.list) { r.view.dispose?.(); r.seal?.dispose(); } this.list.length = 0; }
}
