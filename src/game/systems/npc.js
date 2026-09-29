// Story NPCs (Elder Wick), hint zones and context prompts.
import { makeModel } from '../models/fallback.js';

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class NpcSystem {
  /** npcs: [{ id, name, x, z, yaw }]  hints: [{ x, z, r, text, once }] */
  constructor(game, npcs, hints) {
    this.game = game;
    this.npcs = npcs.map((n) => {
      const model = makeModel(game.assets, n.model || 'elder');
      const y = game.collision.heightAt(n.x, n.z);
      model.root.position.set(n.x, y, n.z);
      model.root.rotation.y = n.yaw || 0;
      game.dyn.add(model.root);
      game.collision.add({ type: 'cyl', x: n.x, z: n.z, r: 0.6, y0: y, y1: y + 1.7, top: false, tag: 'npc' });
      const shadow = game.fx.decal({ pool: 'half', sprite: 'shadow_blob', r: 1.0, color: [0.3, 0.3, 0.4], alpha: 0.7 });
      shadow.x = n.x; shadow.z = n.z;
      const glow = game.fx.billboard({ pool: 'add', sprite: 'glow', size: 4, color: [1, 0.78, 0.4], alpha: 0.5 });
      return { ...n, model, y, shadow, glow, yaw: n.yaw || 0, talking: false, t: Math.random() * 6, near: false, marker: game.fx.billboard({ pool: 'cut', sprite: 'arrow_down', size: 1.1 }) };
    });
    this.hints = hints.map((h) => ({ ...h, done: false }));
    this.prompt = null;
  }

  /** Elder Wick's line for the current progress (called when you talk to him). */
  lines(npc) {
    const s = this.game.stats;
    if (s.beacons >= 5) return ['THE SUN IS UP AND THE VALE IS SAFE! YOU ARE A TRUE LANTERN KEEPER, SPYRO.'];
    if (s.beacons >= 4) return ['THE DAWN GATE HAS DISSOLVED! CLIMB THE MOUNTAIN TO THE OBSERVATORY AND LIGHT THE GREAT BEACON!'];
    if (s.beacons >= 1) return [
      `${s.beacons} OF 5 BEACONS BURN AGAIN. I CAN FEEL THE NIGHT THINNING!`,
      'THE ISLE BEACON SITS ON AN ISLAND IN MIRRORMERE. THE MILL BEACON CROWNS THE WINDMILL HILL. THE SKY BEACON FLOATS ABOVE THE WEST CLIFFS.',
      'WHEN FOUR ARE LIT THE DAWN GATE WILL OPEN.',
    ];
    return [
      'SPYRO! THANK THE STARS! THE SNUFFERS HAVE PUT OUT EVERY BEACON LANTERN AND THE SUN CANNOT RISE.',
      'BREATHE FIRE ON THE HEARTH BEACON BEHIND ME TO RELIGHT IT. THERE ARE FIVE BEACONS IN ALL.',
    ];
  }

  update(dt, game) {
    const p = game.player;
    let prompt = null;
    for (const n of this.npcs) {
      n.t += dt;
      const dx = p.x - n.x, dz = p.z - n.z;
      const d = Math.hypot(dx, dz);
      n.near = d < 5.5;
      // face the player when close
      const target = n.near ? Math.atan2(dx, dz) : n.baseYaw ?? (n.baseYaw = n.yaw);
      n.yaw += wrap(target - n.yaw) * Math.min(1, dt * 4);
      n.model.root.rotation.y = n.yaw;
      n.model.update(dt, { talk: n.talking, wave: n.near && !n.talking ? 1 : 0, t: n.t });
      const lp = n.model.anchors?.lantern;
      if (lp) { n.model.root.updateMatrixWorld(true); const v = lp.getWorldPosition(this._v || (this._v = new (lp.position.constructor)())); n.glow.x = v.x; n.glow.y = v.y; n.glow.z = v.z; }
      else { n.glow.x = n.x + 0.5; n.glow.y = n.y + 1.5; n.glow.z = n.z; }
      n.glow.alpha = 0.42 + Math.sin(n.t * 5) * 0.05;
      n.marker.x = n.x; n.marker.z = n.z; n.marker.y = n.y + 2.9 + Math.sin(n.t * 3.5) * 0.18;
      n.marker.visible = n.near && !n.talking && !game.hud.talking;
      if (n.near && !game.hud.talking && !p.dead && !game.locked) {
        prompt = n;
        if (game.input.pressed('confirm')) this.talk(n);
      }
      // greet the hero the first time they wander close
      if (!n.greeted && d < 9 && !game.hud.talking && !p.dead && !game.locked && game.mode === 'play' && game.hud.visible) { n.greeted = true; this.talk(n); }
    }
    this.prompt = prompt;
    // hint zones
    for (const h of this.hints) {
      if (h.done) continue;
      if (Math.hypot(p.x - h.x, p.z - h.z) < h.r && !game.hud.talking) {
        h.done = h.once !== false;
        game.hud.hint(h.text, h.dur || 6);
      }
    }
    if (prompt && !game.hud.talking && !game.hud.hintState) game.hud.hint('PRESS ENTER TO TALK', 0.25);
  }

  talk(n) {
    const g = this.game;
    n.talking = true;
    g.startDialogue(n.name, this.lines(n), () => { n.talking = false; });
  }
}
