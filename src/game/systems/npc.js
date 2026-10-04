// Story NPCs (Elder Wick), hint zones and context prompts.
import { makeModel } from '../models/fallback.js';
import { homeLines } from '../home/dialogue.js';

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class NpcSystem {
  /** npcs: [{ id, name, x, z, yaw }]  hints: [{ x, z, r, text, once, y0?, y1? }] (y0..y1: only at those heights) */
  constructor(game, npcs, hints) {
    this.game = game;
    this.npcs = npcs.map((n) => {
      const model = makeModel(game.assets, n.model || 'elder');
      const y = game.collision.heightAt(n.x, n.z);
      model.root.position.set(n.x, y, n.z);
      model.root.rotation.y = n.yaw || 0;
      game.dyn.add(model.root);
      game.collision.add({ type: 'cyl', x: n.x, z: n.z, r: 0.6, y0: y, y1: y + 1.7, top: false, tag: 'npc', src: n.src });
      const shadow = game.fx.decal({ pool: 'half', sprite: 'shadow_blob', r: 1.0, color: [0.3, 0.3, 0.4], alpha: 0.7 });
      shadow.x = n.x; shadow.z = n.z;
      const glow = game.fx.billboard({ pool: 'add', sprite: 'glow', size: 4, color: [1, 0.78, 0.4], alpha: 0.5 });
      return { ...n, model, y, shadow, glow, yaw: n.yaw || 0, talking: false, t: Math.random() * 6, near: false, marker: game.fx.billboard({ pool: 'cut', sprite: 'arrow_down', size: 1.1 }) };
    });
    this.hints = hints.map((h) => ({ ...h, done: false }));
    this.prompt = null;
  }

  /** What an NPC says now (called when you talk to them): a character with a `script` has its own (the homeworld's), Elder Wick of the realm follows the lanterns. */
  lines(npc) {
    if (npc.script === 'home_elder') return homeLines(this.game, npc);
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
        if (game.input.pressed('talk')) this.talk(n);
      }
      // greet the hero the first time they wander close
      if (!n.greeted && d < 9 && !game.hud.talking && !p.dead && !game.locked && game.mode === 'play' && game.hud.visible) { n.greeted = true; this.talk(n); }
    }
    this.prompt = prompt;
    // hint zones
    const playing = game.hud.visible && game.mode === 'play';      // (not while the title / intro / finale own the screen)
    const gateOpen = !!(game.portals && game.portals.isOpen('guardian'));            // (some hints belong to the Guardian's Gate shut or open: `shut` / `open`)
    for (const h of this.hints) {
      if (h.done || !playing || (h.shut && gateOpen) || (h.open && !gateOpen)) continue;
      if (Math.hypot(p.x - h.x, p.z - h.z) < h.r && (h.y0 === undefined || (p.y >= h.y0 && p.y <= h.y1)) && !game.hud.talking) {          // (y0..y1: a zone inside a mountain is not the road above it)
        h.done = h.once !== false;
        const dev = game.input.lastDevice;
        game.hud.hint((dev === 'touch' && h.touch) || (dev === 'pad' && h.pad) || h.text, h.dur || 6);
      }
    }
    const inp = game.input;
    inp.setTalkVisible?.(!!prompt && !game.hud.talking);
    if (prompt && !game.hud.talking) {
      const text = inp.lastDevice === 'touch' ? 'TAP TALK TO SPEAK' : inp.lastDevice === 'pad' ? 'PRESS RT TO TALK' : 'PRESS ENTER TO TALK';
      const hs = game.hud.hintState;
      if (hs && hs.text === text) hs.t = 0.2;                 // keep it up while the hero stays close (no slide-in restart)
      else if (!hs) game.hud.hint(text, 0.25);
    }
  }

  talk(n) {
    const g = this.game;
    n.talking = true;
    g.startDialogue(n.name, this.lines(n), () => { n.talking = false; });
  }
}
