// Portals: the doors of the homeworld, and the ring of light that opens above the Great Beacon once the last lantern burns.
//
//   door  an arched doorway (the 'realm_portal' model, shape 'arch') in a stone frame: walk into the light and the world changes. A door that has
//         a realm behind it (`target`) is awake; the others are 'sealed': a dim, slow swirl that says what sleeps behind it when you come close.
//         The Guardian's Gate (`gate: true`) is a door too, but one that is not there until the lanterns of every realm burn (state 'closed'): Game.openGate pops it into the opening between the
//         gate's pillars, and a beam (`beam: { height, radius }`) rises from it into the sky, the landmark of Dawnhaven; the Guardian's freedom turns the beam from violet to gold.
//   lift  a ring of light that hangs above the Great Beacon, out of a jump's reach: a ring of light on the floor marks where its beam comes down,
//         and a JUMP made inside it lets the light carry the hero up the beam into the portal (Player.carry), and out of the world.
//
// Going through either raises `game.emit('portal', def)`; the app (app.js, travelTo) fades the screen, builds the other world and swaps it in.
import { makeModel } from '../models/fallback.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const rnd = (a, b) => a + (b - a) * Math.random();
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** A door this close to where the hero arrives has no need to announce itself (m). */
const HERE = 18;

/** How long the light takes to carry the hero up into the portal (seconds): a base plus a little per metre of the climb. */
export const liftDuration = (rise) => 1.6 + Math.min(rise, 40) * 0.06;

export class PortalSystem {
  /**
   * @param defs [{ id, name, tag, kind: 'door' | 'lift', x, y, z (the floor under it), yaw (a door's front looks along +z turned by yaw), shape: 'arch' | 'ring',
   *   r (half-width / radius), hs (an arch's straight part), cy (height of the swirl's centre over the floor), color [r,g,b], target (realm id, or null: sleeping),
   *   state: 'open' | 'sealed' | 'closed' (hidden until pop(id)), catchR (lift: radius of the ring of light on the floor), blurb (what a sleeping door says) }]
   */
  constructor(game, defs) {
    this.game = game;
    this.list = defs.map((d) => this._make(d));
    this.time = 0;
    this.busy = null;               // the portal being entered: nothing else triggers meanwhile
  }

  _make(d) {
    const g = this.game;
    // a door whose realm the hero has already restored shines gold instead of its own colour
    const done = !!(d.target && g.progress && g.progress.realms[d.target] && g.progress.realms[d.target].done);
    const color = done ? [1.0, 0.86, 0.5] : d.color || [0.66, 0.46, 1.0];
    const model = makeModel(g.assets, 'realm_portal', { shape: d.shape || 'ring', r: d.r, hs: d.hs, color });
    model.root.position.set(d.x, d.y + d.cy, d.z);
    if (d.flat) model.root.rotation.set(Math.PI / 2, 0, 0);                  // (a disc hanging flat over the beam, seen from below)
    else model.root.rotation.y = d.yaw || 0;
    g.dyn.add(model.root);
    const state = d.state || (d.target ? 'open' : 'sealed');
    model.setSealed?.(state === 'sealed');
    model.setOpen?.(state === 'closed' ? 0 : 1);
    const halo = g.fx.billboard({ pool: 'add', sprite: 'glow', size: d.r * 5.2, color, alpha: 0 });
    halo.x = d.x; halo.y = d.y + d.cy; halo.z = d.z;
    let pool = null, ring = null, ring2 = null;
    if (d.kind === 'door') {
      const s = Math.sin(d.yaw || 0), c = Math.cos(d.yaw || 0);
      pool = g.fx.decal({ pool: 'add', sprite: 'glow', x: d.x + s * 2.6, z: d.z + c * 2.6, r: d.r * 1.9, color, alpha: 0 });
      pool.y = d.y + 0.1;
    } else {
      ring = g.fx.decal({ pool: 'add', sprite: 'ring', x: d.x, z: d.z, r: (d.catchR || 4.4) * 1.12, color, alpha: 0 });
      ring.y = d.y + 0.1;
      ring2 = g.fx.decal({ pool: 'add', sprite: 'glow', x: d.x, z: d.z, r: (d.catchR || 4.4) * 1.1, color, alpha: 0 });
      ring2.y = d.y + 0.09;
    }
    // the beam over a gate (it burns while the door is open)
    let beam = null;
    if (d.beam) {
      beam = makeModel(g.assets, 'light_beam', { height: d.beam.height, radius: d.beam.radius });
      beam.root.position.set(d.x, d.y, d.z);
      g.dyn.add(beam.root);
      beam.setColor?.(done ? [1.0, 0.82, 0.42] : color);
      beam.setIntensity?.(0);
    }
    // (a door the hero arrives beside has no need to announce itself: the name of the world is up on the screen)
    const p = g.player, here = !!p && Math.hypot(p.x - d.x, p.z - d.z) < HERE;
    return { def: d, color, done, model, halo, pool, ring, ring2, beam, beamK: 0, state, popT: 99, near: 0, told: here, greeted: here ? 1 : 0, acc: 0, t: Math.random() * 6 };
  }

  /** The hero was put down somewhere (the TRAVEL menu): the doors beside him need not announce themselves either, the name of the place is up on the screen. */
  arrivedAt(x, z) {
    for (const r of this.list) if (r.def.kind === 'door' && Math.hypot(x - r.def.x, z - r.def.z) < HERE) { r.told = true; r.greeted = 1; }
  }

  get(id) { return this.list.find((r) => r.def.id === id); }
  isOpen(id) { const r = this.get(id); return !!r && r.state === 'open'; }

  /** The portal pops open (the one above the Great Beacon, when the last lantern burns). */
  pop(id) {
    const r = this.get(id);
    if (!r || r.state === 'open') return;
    const g = this.game, d = r.def;
    r.state = 'open';
    r.popT = 0;
    r.model.setSealed?.(false);
    r.model.setOpen?.(1);
    g.audio?.sfx('portal_open', { vol: 1 });
    g.cam.shake(0.3, 0.6);
    const cy = d.y + d.cy;
    g.fx.ignite?.(d.x, cy, d.z, true);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      g.fx.spawn({ pool: 'add', sprite: 'spark_small', x: d.x, y: cy, z: d.z, vx: Math.cos(a) * rnd(3, 6.5), vy: Math.sin(a) * rnd(3, 6.5) + rnd(-0.5, 0.5), vz: rnd(-1, 1), life: rnd(0.8, 1.5), size: [0.5, 0.1], c0: [1, 0.95, 1, 1], c1: [r.color[0], r.color[1], r.color[2], 0], pulse: false });
    }
    g.emit('portal-open', d);
  }

  /** The Guardian's Gate stands open already, with no ceremony (Dawnhaven after the gate has opened: Game.build): its door is there, at rest, and its beam burns. */
  openGateAtOnce(id = 'guardian') {
    const r = this.get(id);
    if (!r || r.state === 'open') return;
    r.state = 'open';
    r.popT = 99;
    r.model.setSealed?.(false);
    r.model.setOpen?.(1);
    for (let i = 0; i < 90; i++) r.model.update?.(1 / 30, { t: this.game.time });       // (its spring settles: it does not pop open on the first frame)
    r.beamK = 1;
    r.beam?.setIntensity?.(1);
  }

  /** The Guardian is free: the beam over the gate turns gold (and so does the door's light). */
  gildGate(id = 'guardian') {
    const r = this.get(id);
    if (!r) return;
    r.done = true;
    r.beam?.setColor?.([1.0, 0.82, 0.42]);
    r.model.setColor?.([1.0, 0.86, 0.5]);
  }

  /** The lift above the Great Beacon is open already, without the pop (a realm the hero has saved, entered again: Game._restore). */
  restore() {
    for (const r of this.list) {
      if (r.def.kind !== 'lift' || r.state === 'open') continue;
      r.state = 'open';
      r.popT = 99;
      r.model.setSealed?.(false);
      r.model.setOpen?.(1);
      for (let i = 0; i < 90; i++) r.model.update?.(1 / 30, { t: this.game.time });       // (its spring settles: it does not pop open on the first frame)
    }
  }

  update(dt, game) {
    this.time += dt;
    const p = game.player, hud = game.hud;
    const playing = (game.mode === 'play' || game.mode === 'complete') && !game.locked && !p.dead && !this.busy;
    for (const r of this.list) {
      const d = r.def;
      r.t += dt;
      r.popT += dt;
      const dist = Math.hypot(p.x - d.x, p.z - d.z);
      r.near = clamp(1 - (dist - 3) / 9);                          // 1 within 3 m, 0 beyond 12 m: the swirl spins faster as the hero comes close
      if (d.kind === 'door') {
        // a name when you come near (the first time, and again after you have gone away), and what a sleeping door has to say
        if (dist > 26) { r.told = false; r.greeted = 0; }
        if (playing && game.hud.visible && dist < 15 && !r.told && r.state !== 'closed') {
          r.told = true;
          const status = r.state === 'open' ? (r.done ? 'RESTORED - ITS LANTERNS BURN' : d.tag) : 'THE PORTAL SLEEPS';
          hud.banner(d.name, status, 3.2);
        }
        if (playing && game.hud.visible && r.state === 'sealed' && dist < 7 && !r.greeted && !hud.talking) {
          r.greeted = 1;
          hud.hint(d.blurb || `${d.name}: THIS PORTAL SLEEPS, FOR NOW`, 5.5);
        }
        if (playing && r.state === 'open' && d.target) {
          // the swirl is the plane through the door's centre: crossing it (a little before it, the light is already around you) is going in
          const s = Math.sin(d.yaw || 0), c = Math.cos(d.yaw || 0), dx = p.x - d.x, dz = p.z - d.z;
          const along = dx * s + dz * c, lateral = dx * c - dz * s, up = p.y + 0.5 - d.y;
          if (Math.abs(along) < 0.9 && Math.abs(lateral) < d.r - 0.3 && up > 0 && up < d.cy + d.r) this.enter(r);
        }
      } else if (d.kind === 'lift' && r.state === 'open') {
        const onFloor = dist < (d.catchR || 4.4) && Math.abs(p.y - d.y) < 2.5;
        r.inZone = onFloor && playing;
        const near = playing && dist < (d.catchR || 4.4) + 2.5 && Math.abs(p.y - d.y) < 2.5;       // (the hint comes a little before the ring)
        if (near && !r.told && game.hud.visible) {
          r.told = true;
          const dev = game.input.lastDevice;
          hud.hint(dev === 'touch' ? 'TAP JUMP INSIDE THE RING OF LIGHT TO RIDE THE BEAM INTO THE PORTAL' : dev === 'pad' ? 'PRESS A INSIDE THE RING OF LIGHT TO RIDE THE BEAM INTO THE PORTAL' : 'JUMP INSIDE THE RING OF LIGHT TO RIDE THE BEAM INTO THE PORTAL', 6.5);
        }
        if (!onFloor && dist > (d.catchR || 4.4) + 8) r.told = false;
        if (r.inZone && game.input.pressed('jump') && (p.grounded || p.vy > 8) && p.canAct) this.lift(r);
      }
    }
  }

  /** Walk into a door: the app takes over (it fades the screen and builds the other world). */
  enter(r) {
    const g = this.game, d = r.def;
    this.busy = r;
    g.player.locked = true;
    g.locked = true;
    g.audio?.sfx('portal_enter', { vol: 1 });
    g.emit('portal', d);
  }

  /** The beam picks the hero up and carries him up the axis into the ring, turning slowly; the camera watches from the floor. */
  lift(r) {
    const g = this.game, p = g.player, d = r.def;
    this.busy = r;
    g.locked = true;
    p.locked = true;
    p.invulnT = 99;
    g.hud.hintState = null; g.hud.bannerState = null;                            // (nothing over the ride)
    const from = [p.x, p.y, p.z], cy = d.y + d.cy;
    const r0 = Math.hypot(p.x - d.x, p.z - d.z), a0 = Math.atan2(p.z - d.z, p.x - d.x);
    const dur = liftDuration(cy - p.y);
    // up the beam: he spirals round the lantern (it stands on the axis: a ride through it would clip), turning one and a half times, rising from the floor to the ring's centre; the circle
    // closes only above the lantern's crown, and the last stretch goes straight into the light
    const R = Math.max(3.4, d.catchR ? d.catchR * 0.75 : 3.4);
    p.carry = {
      t: 0, dur,
      at: (k) => {
        const e = ease(k), up = ease(clamp((k - 0.04) / 0.96));
        const a = a0 + e * Math.PI * 3, rr = lerp(r0, R, ease(clamp(k / 0.18))) * (1 - ease(clamp((k - 0.84) / 0.16)));
        return [d.x + Math.cos(a) * rr, lerp(from[1], cy - 0.55, up), d.z + Math.sin(a) * rr, a + Math.PI / 2];
      },
      vanish: 0.93,                                           // (he disappears into the light a moment before the end of the ride)
    };
    g.audio?.sfx('portal_enter', { vol: 1 });
    g.fx.puff(p.x, p.y + 0.5, p.z, 0.9);
    // the camera stays down in the room and tips up after him, the view widening as he goes
    const cx = d.x + Math.sin(a0 + Math.PI) * 6.2, cz = d.z + Math.cos(a0 + Math.PI) * 6.2;
    g.cam.playCinematic((t, k) => ({
      pos: [cx, d.y + 2.1 + 2.5 * ease(k), cz],
      look: [lerp(d.x, p.x, 0.5), p.y + 0.9, lerp(d.z, p.z, 0.5)],
      fov: 58 + 16 * ease(k),
    }), dur + 5);
    g.after(dur * 0.62, () => g.emit('portal', d));
  }

  frame(dt, alpha, game) {
    const t = game.time, day = game.day;
    const cam = game.camera.position;
    for (const r of this.list) {
      const d = r.def, k = r.model.k ?? 1, cy = d.y + d.cy;
      r.model.update?.(dt, { t, boost: r.state === 'open' ? r.near : 0 });
      const far = Math.hypot(cam.x - d.x, cam.z - d.z) > 150;
      const live = r.state === 'open' ? 1 : r.state === 'sealed' ? 0.25 : 0;
      const pulse = 0.88 + 0.12 * Math.sin(t * 2.3 + d.x);
      r.halo.visible = !far;
      r.halo.alpha = 0.5 * clamp(k) * live * pulse * (1 - 0.25 * day) * (0.8 + 0.5 * r.near);
      r.halo.y = cy;
      if (r.pool) { r.pool.alpha = 0.55 * clamp(k) * live * pulse * (1 - 0.3 * day); r.pool.visible = !far; }
      if (r.ring) {
        const zone = r.inZone ? 1 : 0;
        r.ring.alpha = clamp(k) * live * (0.5 + 0.25 * Math.sin(t * 3.1) + 0.3 * zone);
        r.ring.rot = t * 0.25;
        r.ring.r = (d.catchR || 4.4) * 1.12 * (1 + 0.025 * Math.sin(t * 2.4));
        r.ring2.alpha = clamp(k) * live * (0.3 + 0.2 * zone);
      }
      if (r.beam) {
        r.beamK += ((r.state === 'open' ? 1 : 0) - r.beamK) * (1 - Math.exp(-dt * (r.state === 'open' && r.popT < 99 ? 0.9 : 3)));
        r.beam.setIntensity?.(r.beamK * (0.82 + 0.1 * Math.sin(t * 1.7)));
        r.beam.update?.(dt, { t });
      }
      if (r.state === 'closed' || far) continue;
      // motes drifting into the light (and sparks of the pop for a second or two)
      r.acc += dt * (r.state === 'open' ? 9 : 2.5) * (r.popT < 1.6 ? 3 : 1);
      while (r.acc >= 1) {
        r.acc -= 1;
        const col = r.state === 'open' ? lerp3(r.color, [1, 1, 1], 0.4) : r.color;
        if (d.kind === 'door') {
          const s = Math.sin(d.yaw || 0), c = Math.cos(d.yaw || 0), lat = rnd(-d.r, d.r), fwd = rnd(0.3, 2.4);
          game.fx.spawn({ pool: 'add', sprite: 'spark_small', x: d.x + s * fwd + c * lat, y: d.y + rnd(0.2, d.cy + d.r * 0.9), z: d.z + c * fwd - s * lat, vx: -s * rnd(0.2, 0.8), vy: rnd(0.15, 0.7), vz: -c * rnd(0.2, 0.8), life: rnd(1.2, 2.4), size: [0.26, 0.1], c0: [col[0], col[1], col[2], 0.9], c1: [col[0], col[1], col[2], 0], pulse: true });
        } else {
          const a = rnd(0, Math.PI * 2), rr = rnd(d.r * 0.6, d.r * 1.1);
          game.fx.spawn({ pool: 'add', sprite: 'spark_small', x: d.x + Math.cos(a) * rr * 0.3, y: cy + Math.sin(a) * rr, z: d.z + Math.cos(a + 1) * 0.3, vx: Math.cos(a) * -0.6, vy: Math.sin(a) * -0.6 + rnd(0.1, 0.5), vz: rnd(-0.4, 0.4), life: rnd(1, 2), size: [0.32, 0.1], c0: [col[0], col[1], col[2], 0.9], c1: [col[0], col[1], col[2], 0], pulse: true });
        }
      }
    }
  }

  dispose() {
    for (const r of this.list) { r.model.dispose?.(); r.beam?.dispose?.(); }
    this.list = [];
  }
}
