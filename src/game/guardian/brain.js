// THE GUARDIAN'S BRAIN: the fight, as a pure state machine (no three, no DOM, no random numbers but its own seeded ones). The game's BossSystem (systems/boss.js) feeds it the hero every step and draws what it
// says; tools/boss-test.mjs plays it in Node; tools/lib/duel.mjs plays whole fights against a model of a hero; tools/guardian-check.mjs holds its numbers to what a fair fight needs.
//
//   const b = new GuardianBrain(arena);          arena: { cx, cz, floorAt(x, z), daisY, arenaR, wakeR, leaveR, pillars: [{ x, z, r }] }
//   b.step(dt, hero, q);                          hero: { x, y, z, r, invuln }   q: { flameHits(x, y, z, r, dy) -> bool }  (the Player's own tests: the brain asks, it never reads the hero's moves)
//   b.ramFist(i)                                  the hero's ram struck fist i (a collider's onCharge): true if it cracked
//   b.events                                      what happened this step ({ type, ... }: the system plays its sounds and effects, hurts the hero on 'hit', and empties it)
//
// The shape of the fight (every number is in GUARDIAN below; the design is in docs/DESIGN.md):
//   asleep -> waking -> FIGHT (two fists slam in turn; a fist that has landed is stuck for a while: ram it and it cracks) -> STOOP (both fists gone: the crown comes down; flame the next of its three
//   lanterns until it lights) -> RISING -> the next phase (the fists form again, a little faster, and one more kind of attack) ... -> FREED after the third.
// Phase 0: slams.  Phase 1: slams and rune bolts.  Phase 2: slams, rune bolts and gloom circles.  A window that closes before the lantern lights sends the Guardian up and the phase begins again.

/** The numbers of the fight. Seconds, metres. A starting value, held to its bounds by tools/guardian-check.mjs. */
export const GUARDIAN = {
  crownRest: 15.9, crownDown: 3.2,                       // the crown's height over the dais: on his head, and come down for the hero (who reaches it from the dais)
  lantern: { ring: 2.4, ringDown: 6.2, r: 1.5, dy: 3.2 },  // the three lanterns hang on a ring round his axis: 2.4 m on his head, 6.2 m when it has come down round his body (outside the 4.6 m his body fills); the flame test's radius and vertical reach (Player.flameHits)
  fist: { r: 1.7, hover: 7.0, orbit: 13.5, riseY: 12.0, riseT: 0.45, aimT: 0.9, lockT: 0.55, dropT: 0.22, follow: [8.0, 9.0, 10.0], stuckT: [4.2, 3.8, 3.4], recoverT: 0.8, formT: 1.2, crackT: 0.9 },     // (by phase: the circle follows him faster, a fist that has landed stays shorter, as the fight goes on)
  slam: { r: 4.2, every: [3.4, 2.6, 2.1], waveSpeed: 11, waveW: 1.4, waveH: 0.8, waveMax: [9, 14, 16] },
  bolt: { every: [Infinity, 4.5, 5.5], chargeT: 1.2, speed: 11, r: 0.7, y: 1.1, life: 3.4, start: 4.6 },
  gloom: { every: [Infinity, Infinity, 6.0], n: 5, r: 3.2, warnT: 1.4, gap: 0.25, spread: 8, lingerT: 0.35 },
  stoop: { downT: 1.6, window: 9.0, need: 1.4, upT: 1.4 },
  wakeT: 4.0, breather: 3.0, firstSlam: 1.2, hits: 3,     // the waking roar; the quiet at the start of a phase; the first slam after it; how many hits Spyro takes (Sparx) before the phase begins again
};

const hyp = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lcg = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

export class GuardianBrain {
  constructor(arena, seed = 7) {
    this.A = { daisY: 0, arenaR: 38, wakeR: 44, leaveR: 50, pillars: [], floorAt: () => 0, ...arena };
    this.G = GUARDIAN;
    this.seed = seed;
    this.events = [];
    this.reset();
  }

  /** The Guardian as the world begins: asleep, no lantern lit, his fists dormant. */
  reset() {
    this.rng = lcg(this.seed);
    this.t = 0;
    this.mode = 'asleep';                                 // asleep | waking | fight | stoop | rising | freed
    this.lit = 0;                                         // lanterns lit (0..3): also the phase while he fights (0..2)
    this.crown = this.G.crownRest;
    this._clear();
    this._formFists('hover');
    this.events.length = 0;
  }

  get phase() { return Math.min(2, this.lit); }
  /** is the hero's flame on the lantern that counts, this step? */
  get touching() { return this._touching; }
  get fistsLeft() { return this.fists.filter((f) => f.state !== 'cracked' && f.state !== 'gone').length; }
  /** how far the crown has come down: 0 on his head .. 1 round his body */
  get stoopAmount() { return clamp((this.G.crownRest - this.crown) / (this.G.crownRest - this.G.crownDown), 0, 1); }
  /** the radius of the ring the lanterns hang on: it opens as it comes down, so that it clears his shoulders (it is wide by the time it is level with them) */
  get ring() { const L = this.G.lantern; return lerp(L.ring, L.ringDown, smooth(this.stoopAmount / 0.4)); }
  /** where the crown's lantern `j` hangs: on the ring round the axis, the first facing the road (south) */
  lanternPos(j) {
    const a = Math.PI / 2 + (j * 2 * Math.PI) / 3, r = this.ring;
    return { x: this.A.cx + Math.cos(a) * r, y: this.A.daisY + this.crown, z: this.A.cz + Math.sin(a) * r };
  }
  /** what the HUD says: the phase, the lanterns, the fists still to crack, the window's seconds and the lantern's progress */
  status() {
    const S = this.G.stoop;
    return { mode: this.mode, sub: this.sub || null, lit: this.lit, phase: this.phase, fistsLeft: this.fistsLeft, windowLeft: this.mode === 'stoop' && this.sub === 'window' ? Math.max(0, S.window - this.st) : 0, window: S.window, contact: this.contact, need: S.need };
  }

  emit(type, o = {}) { this.events.push({ type, ...o }); }

  _clear() { this.waves = []; this.bolts = []; this.circles = []; this.charge = null; this.sub = null; this.st = 0; this.contact = 0; this._touching = false; this.slamT = this.G.firstSlam; this.boltT = 0; this.gloomT = 0; this.quietT = 0; }

  _formFists(state) {
    const F = this.G.fist, A = this.A;
    this.fists = [0, 1].map((id) => {
      const ang = (id ? 1 : 0) * Math.PI + 0.55;
      return { id, state, t: 0, ang, x: A.cx + Math.cos(ang) * F.orbit, z: A.cz + Math.sin(ang) * F.orbit, y: F.hover, tx: 0, tz: 0, sx: 0, sz: 0, last: -99 };
    });
  }

  // ---- the waking and the sleeping ------------------------------------------------------------------------------------------------
  /** The hero came to the court: the Guardian wakes (a roar, the fists form), and the fight begins when it is over. */
  wake() {
    if (this.mode !== 'asleep') return;
    this.mode = 'waking'; this.wakeT = this.G.wakeT;
    for (const f of this.fists) { f.state = 'form'; f.t = 0; }
    this.emit('wake');
  }

  /** He was freed in an earlier visit: all three lanterns burn, his hands are gone, he sits quiet on his dais (the ending's after-state; nothing in him fights). */
  setFreed() {
    this.lit = 3; this.mode = 'freed'; this.crown = this.G.crownRest;
    this._clear();
    for (const f of this.fists) { f.state = 'gone'; f.t = 0; }
  }

  /** The hero left the court: the Guardian sleeps, whatever it was doing (the phase begins again when he returns; the lanterns lit stay lit). */
  sleep() {
    if (this.mode === 'asleep' || this.mode === 'freed') return;
    this.mode = 'asleep'; this.crown = this.G.crownRest;
    this._clear();
    this._formFists('hover');
    this.emit('sleep');
  }

  /** The hero was set back (he died): the phase he was in begins again. */
  resetPhase() {
    if (this.mode === 'asleep' || this.mode === 'freed') return;
    this.crown = this.G.crownRest;
    this._beginPhase();
    this.emit('reset');
  }

  _beginPhase() {
    this._clear();
    this.mode = 'fight';
    this._formFists('form');
    this.quietT = this.G.breather;
    this.boltT = this.G.bolt.every[this.phase] * 0.7;
    this.gloomT = this.G.gloom.every[this.phase] * 0.7;
    this.emit('phase', { phase: this.phase, lit: this.lit });
  }

  // ---- the step -----------------------------------------------------------------------------------------------------------------------
  step(dt, hero, q = {}) {
    this.t += dt;
    const A = this.A;
    if (hero && this.mode !== 'asleep' && this.mode !== 'freed' && hyp(hero.x - A.cx, hero.z - A.cz) > A.leaveR) this.sleep();
    switch (this.mode) {
      case 'asleep': this._hover(dt); if (hero && hyp(hero.x - A.cx, hero.z - A.cz) < A.wakeR) this.wake(); break;
      case 'waking': this._fists(dt, hero); this.wakeT -= dt; if (this.wakeT <= 0) this._beginPhase(); break;
      case 'fight': this._fight(dt, hero); break;
      case 'stoop': this._stoop(dt, hero, q); break;
      case 'rising': this._rising(dt); break;
      default: break;
    }
    this._hazards(dt, hero);
  }

  _hover(dt) { for (const f of this.fists) this._orbit(f, dt, 0.6); }

  /** a fist circling the dais, bobbing; `k` scales how lively it is */
  _orbit(f, dt, k = 1) {
    const F = this.G.fist, A = this.A;
    f.ang += dt * 0.25 * (f.id ? -1 : 1) * k;
    f.x = A.cx + Math.cos(f.ang) * F.orbit; f.z = A.cz + Math.sin(f.ang) * F.orbit;
    f.y = F.hover + Math.sin(this.t * 1.7 + f.id * 2) * 0.35;
  }

  _fight(dt, hero) {
    const G = this.G, p = this.phase;
    this._fists(dt, hero);
    this.quietT -= dt;
    if (this.quietT > 0) return;
    // the slams: in turn, the fist that has been waiting longest
    this.slamT -= dt;
    if (this.slamT <= 0 && hero) {
      const f = this.fists.filter((q) => q.state === 'hover').sort((a, b) => a.last - b.last)[0];
      if (f) { this._startSlam(f, hero); this.slamT = G.slam.every[p]; } else this.slamT = 0.25;
    }
    // the rune bolts: the visor charges, then one flies at where the hero is
    if (p >= 1) {
      if (this.charge) {
        this.charge.t += dt;
        if (this.charge.t >= G.bolt.chargeT) { this._fireBolt(hero); this.charge = null; this.boltT = G.bolt.every[p]; }
      } else {
        this.boltT -= dt;
        if (this.boltT <= 0 && hero) { this.charge = { t: 0 }; this.emit('bolt-charge'); }
      }
    }
    // the gloom circles: five runes round the hero, the first under him
    if (p >= 2) {
      this.gloomT -= dt;
      if (this.gloomT <= 0 && hero) { this._spawnGloom(hero); this.gloomT = G.gloom.every[p]; }
    }
    // both hands gone: the Guardian is spent, and stoops
    if (this.fists.length && this.fists.every((f) => f.state === 'cracked' || f.state === 'gone')) this._beginStoop();
  }

  // ---- the fists -------------------------------------------------------------------------------------------------------------------------
  _fists(dt, hero) { for (const f of this.fists) this._fist(f, dt, hero); }

  _startSlam(f, hero) {
    const F = this.G.fist, A = this.A, R = A.arenaR - 3;
    f.state = 'rise'; f.t = 0; f.sx = f.x; f.sz = f.z; f.last = this.t;
    const d = hyp(hero.x - A.cx, hero.z - A.cz), k = d > R ? R / d : 1;
    f.tx = A.cx + (hero.x - A.cx) * k; f.tz = A.cz + (hero.z - A.cz) * k;
    this.emit('slam-telegraph', { fist: f.id, x: f.tx, z: f.tz });
    void F;
  }

  _fist(f, dt, hero) {
    const F = this.G.fist, A = this.A;
    f.t += dt;
    switch (f.state) {
      case 'form': {                                       // out of the dais and up to its orbit
        const e = smooth(f.t / F.formT), hx = A.cx + Math.cos(f.ang) * F.orbit, hz = A.cz + Math.sin(f.ang) * F.orbit;
        f.x = lerp(A.cx, hx, e); f.z = lerp(A.cz, hz, e); f.y = lerp(this.G.crownRest * 0.5, F.hover, e);
        if (f.t >= F.formT) { f.state = 'hover'; f.t = 0; }
        break;
      }
      case 'hover': this._orbit(f, dt); break;
      case 'rise': {                                       // up over the place the hero was
        const e = smooth(f.t / F.riseT);
        f.x = lerp(f.sx, f.tx, e); f.z = lerp(f.sz, f.tz, e); f.y = lerp(F.hover, F.riseY, e);
        if (f.t >= F.riseT) { f.state = 'aim'; f.t = 0; }
        break;
      }
      case 'aim': {                                        // it follows him, slower than he runs
        if (hero) {
          const dx = hero.x - f.tx, dz = hero.z - f.tz, d = hyp(dx, dz), s = Math.min(d, F.follow[this.phase] * dt);
          if (d > 1e-6) { f.tx += (dx / d) * s; f.tz += (dz / d) * s; }
          const c = hyp(f.tx - A.cx, f.tz - A.cz), R = A.arenaR - 3;
          if (c > R) { f.tx = A.cx + ((f.tx - A.cx) / c) * R; f.tz = A.cz + ((f.tz - A.cz) / c) * R; }
        }
        f.x = f.tx; f.z = f.tz; f.y = F.riseY;
        if (f.t >= F.aimT) { f.state = 'lock'; f.t = 0; this.emit('slam-lock', { fist: f.id, x: f.tx, z: f.tz }); }
        break;
      }
      case 'lock': f.x = f.tx; f.z = f.tz; f.y = F.riseY; if (f.t >= F.lockT) { f.state = 'drop'; f.t = 0; } break;
      case 'drop': {
        const k = clamp(f.t / F.dropT, 0, 1), fl = A.floorAt(f.tx, f.tz);
        f.y = lerp(F.riseY, fl, k * k);
        if (f.t >= F.dropT) this._impact(f, hero);
        break;
      }
      case 'stuck': if (f.t >= F.stuckT[this.phase]) { f.state = 'recover'; f.t = 0; f.rx = f.x; f.rz = f.z; this.emit('fist-free', { fist: f.id, x: f.x, z: f.z }); } break;
      case 'recover': {                                    // it pulls free and rises back to its orbit
        const e = smooth(f.t / F.recoverT), hx = A.cx + Math.cos(f.ang) * F.orbit, hz = A.cz + Math.sin(f.ang) * F.orbit;
        f.x = lerp(f.rx, hx, e); f.z = lerp(f.rz, hz, e); f.y = lerp(A.floorAt(f.rx, f.rz), F.hover, e);
        if (f.t >= F.recoverT) { f.state = 'hover'; f.t = 0; }
        break;
      }
      case 'cracked': if (f.t >= F.crackT) { f.state = 'gone'; f.t = 0; } break;
      default: break;
    }
  }

  _impact(f, hero) {
    const S = this.G.slam, p = this.phase;
    f.state = 'stuck'; f.t = 0; f.x = f.tx; f.z = f.tz; f.y = this.A.floorAt(f.tx, f.tz);
    if (hero && !hero.invuln && hyp(hero.x - f.tx, hero.z - f.tz) < S.r + hero.r) this.emit('hit', { what: 'slam', fx: f.tx, fz: f.tz });
    this.waves.push({ x: f.tx, z: f.tz, r: S.r, max: S.waveMax[p], hit: false });
    this.emit('slam', { fist: f.id, x: f.tx, z: f.tz });
  }

  /** The hero's ram struck fist `i`: a fist that is stuck cracks (and is gone for the phase); one that is not does not. */
  ramFist(i) {
    const f = this.fists[i];
    if (!f || f.state !== 'stuck') return false;
    f.state = 'cracked'; f.t = 0;
    this.emit('crack', { fist: f.id, x: f.x, z: f.z });
    return true;
  }

  // ---- the bolts and the gloom --------------------------------------------------------------------------------------------------------------
  _fireBolt(hero) {
    const B = this.G.bolt, A = this.A;
    let dx = hero ? hero.x - A.cx : 0, dz = hero ? hero.z - A.cz : 1;
    const d = hyp(dx, dz) || 1; dx /= d; dz /= d;
    this.bolts.push({ x: A.cx + dx * B.start, z: A.cz + dz * B.start, y: A.floorAt(A.cx + dx * B.start, A.cz + dz * B.start) + B.y, vx: dx * B.speed, vz: dz * B.speed, age: 0 });
    this.emit('bolt', { x: A.cx + dx * B.start, z: A.cz + dz * B.start, dx, dz });
  }

  _spawnGloom(hero) {
    const C = this.G.gloom, A = this.A, R = A.arenaR - 3;
    const a0 = this.rng() * Math.PI * 2;
    for (let i = 0; i < C.n; i++) {
      let x = hero.x, z = hero.z;
      if (i > 0) { const a = a0 + (i / (C.n - 1)) * Math.PI * 2, r = C.spread * (0.55 + 0.45 * this.rng()); x += Math.cos(a) * r; z += Math.sin(a) * r; }
      const d = hyp(x - A.cx, z - A.cz); if (d > R) { x = A.cx + ((x - A.cx) / d) * R; z = A.cz + ((z - A.cz) / d) * R; }
      this.circles.push({ x, z, t: C.warnT + i * C.gap, warn: C.warnT, burst: false, after: C.lingerT });
    }
    this.emit('gloom', { n: C.n });
  }

  // ---- the stoop and the lanterns --------------------------------------------------------------------------------------------------------------
  _beginStoop() {
    this.mode = 'stoop'; this.sub = 'down'; this.st = 0; this.contact = 0; this._touching = false;
    this.bolts = []; this.circles = []; this.charge = null;
    this.emit('stoop');
  }

  _stoop(dt, hero, q) {
    const S = this.G.stoop;
    this.st += dt;
    this._fists(dt, hero);                                 // (the last of the broken pieces fall)
    if (this.sub === 'down') {
      this.crown = lerp(this.G.crownRest, this.G.crownDown, smooth(this.st / S.downT));
      if (this.st >= S.downT) { this.sub = 'window'; this.st = 0; this.crown = this.G.crownDown; this.emit('window', { lit: this.lit }); }
      return;
    }
    const L = this.lanternPos(this.lit), N = this.G.lantern;
    if (q.flameHits && q.flameHits(L.x, L.y, L.z, N.r, N.dy)) {
      this.contact += dt;
      if (!this._touching) this.emit('contact');
      this._touching = true;
    } else this._touching = false;
    if (this.contact >= S.need) { this.lit++; this.emit('lit', { n: this.lit }); this._rise(false); return; }
    if (this.st >= S.window) { this.emit('window-lost'); this._rise(true); }
  }

  _rise(retry) { this.mode = 'rising'; this.rt = 0; this.retry = retry; this.sub = null; this.contact = 0; this._touching = false; this.emit(retry ? 'recover' : 'rise'); }

  _rising(dt) {
    const S = this.G.stoop;
    this.rt += dt;
    this.crown = lerp(this.G.crownDown, this.G.crownRest, smooth(this.rt / S.upT));
    if (this.rt < S.upT) return;
    this.crown = this.G.crownRest;
    if (!this.retry && this.lit >= 3) { this.mode = 'freed'; this._clear(); this.emit('freed'); return; }
    this._beginPhase();
  }

  // ---- what flies and what bursts: it finishes whatever the Guardian was doing ------------------------------------------------------------------
  _hazards(dt, hero) {
    const G = this.G, A = this.A, S = G.slam, B = G.bolt, C = G.gloom;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += S.waveSpeed * dt;
      if (hero && !hero.invuln && !w.hit && Math.abs(hyp(hero.x - w.x, hero.z - w.z) - w.r) < S.waveW / 2 + hero.r && hero.y - A.floorAt(hero.x, hero.z) < S.waveH) { w.hit = true; this.emit('hit', { what: 'wave', fx: w.x, fz: w.z }); }
      if (w.r >= w.max) this.waves.splice(i, 1);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.age += dt; b.x += b.vx * dt; b.z += b.vz * dt;
      let dead = b.age > B.life || hyp(b.x - A.cx, b.z - A.cz) > A.arenaR + 2;
      for (const P of A.pillars) if (!dead && hyp(b.x - P.x, b.z - P.z) < P.r + B.r) dead = true;
      if (hero && !hero.invuln && !dead && hyp(hero.x - b.x, hero.z - b.z) < B.r + hero.r && hero.y < b.y + B.r && hero.y + 1.05 > b.y - B.r) { dead = true; this.emit('hit', { what: 'bolt', fx: b.x - b.vx * 0.2, fz: b.z - b.vz * 0.2 }); }
      if (dead) { this.emit('bolt-burst', { x: b.x, z: b.z }); this.bolts.splice(i, 1); }
    }
    for (let i = this.circles.length - 1; i >= 0; i--) {
      const c = this.circles[i];
      if (!c.burst) {
        c.t -= dt;
        if (c.t <= 0) {
          c.burst = true;
          if (hero && !hero.invuln && hyp(hero.x - c.x, hero.z - c.z) < C.r + hero.r) this.emit('hit', { what: 'gloom', fx: c.x, fz: c.z });
          this.emit('gloom-burst', { x: c.x, z: c.z });
        }
      } else if ((c.after -= dt) <= 0) this.circles.splice(i, 1);
    }
  }
}
