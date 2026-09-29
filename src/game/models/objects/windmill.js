// WINDMILL SAILS — hub + four latticed sails with cloth panels, ~15 units tip to tip. Local origin = hub centre, the
// sails lie in the XY plane facing +Z; update(dt, { angle }) sets the rotation about local Z (the game drives it).
// Positive angle = counter-clockwise seen from the front (+Z); each sail trails its spar and is "weathered" (twisted a
// little about the spar) so it has depth from the side.
import { Rig, exposure, setExposure } from './common.js';
import { litBuilder, strut, dquad } from './geo.js';
import { derivedTexture, recolor } from './recolor.js';

// the `timber` texture's plaster infill (pale, low saturation) is what we re-colour into sailcloth
const plasterPick = (h, s, v) => s <= 0.34 && v >= 0.5;

const TIP = 7.5;
const BAYS = [1.55, 2.6, 3.65, 4.7, 5.75, 6.8];   // frame rail heights along the arm (5 bays)
const X0 = 0.22, X1 = 2.3;                          // lattice frame spans this width beside the spar
const TWIST = (11 * Math.PI) / 180;

export function createWindmillSails(assets, opts = {}) {
  const rig = new Rig(assets);
  const anchors = {};
  const mBeam = rig.lit('wood_beam');
  const cloths = [
    rig.lit('timber', { double: true }),
    rig.litMap(derivedTexture(assets, 'timber', 'coral', (p) => recolor(p, plasterPick, { hue: 8, sat: 2.6, val: 1.0 })), { double: true }),
    rig.litMap(derivedTexture(assets, 'timber', 'teal', (p) => recolor(p, plasterPick, { hue: 178, sat: 2.4, val: 0.95 })), { double: true }),
  ];
  const mPlank = rig.lit('wood_plank', { double: true });
  const mBrass = rig.lit('metal_brass');
  const spin = rig.pivot('spin');

  const beam = litBuilder(1, 91), plank = litBuilder(1, 93), brass = litBuilder(1, 94);
  const panels = [litBuilder(1, 92), litBuilder(1, 97), litBuilder(1, 98)];
  const BAY_CLOTH = [0, 1, 0, 2];   // cream, coral, cream, teal (inner -> tip)
  for (let k = 0; k < 4; k++) {
    for (const bb of [beam, plank, brass, ...panels]) { bb.push(); bb.rotateZ((k * Math.PI) / 2); }
    // spar (stock) + brass tip
    strut(beam, [0, 0.55, 0], [0, TIP + 0.1, 0], 0.42, 0.3, { tile: 2, caps: 'top' });
    brass.at(0, TIP + 0.1, 0, (b) => b.cone(0.24, 0.42, 4, { smooth: false, tile: 0.6 }));
    // twisted lattice frame
    for (const bb of [plank, ...panels]) { bb.push(); bb.rotateY(TWIST); }
    // open lattice bay nearest the hub: two slats + rail
    for (const y of [BAYS[0], BAYS[1]]) {
      dquad(plank, [X0, y - 0.1, 0], [X1, y - 0.1, 0], [X1, y + 0.1, 0], [X0, y + 0.1, 0], { tile: 1.6 });
    }
    dquad(plank, [X1 - 0.2, BAYS[0], 0], [X1, BAYS[0], 0], [X1, BAYS[1], 0], [X1 - 0.2, BAYS[1], 0], { tile: 1.6 });
    // timber-framed cloth bays (texture supplies the frame + brace)
    for (let i = 1; i < BAYS.length - 1; i++) {
      const bb = panels[BAY_CLOTH[i - 1]];
      dquad(bb, [X0, BAYS[i], 0], [X1, BAYS[i], 0], [X1, BAYS[i + 1], 0], [X0, BAYS[i + 1], 0], { uv: [0, 0, 1, 1], color: [1, 1, 1] });
    }
    for (const bb of [plank, ...panels]) bb.pop();
    for (const bb of [beam, plank, brass, ...panels]) bb.pop();
  }
  // ---- hub: wooden barrel along Z with a brass nose cone ---------------------------------------------------------------
  {
    const b = litBuilder(1, 95);
    b.rotateX(Math.PI / 2);   // lathe axis +Y -> +Z
    b.lathe([[0.55, -0.8], [0.76, -0.55], [0.76, 0.35], [0.62, 0.5]], 8, { smooth: false, tile: 1.6, color: [1, 1, 1] });
    b.lathe([[0.55, -0.8], [0, -0.8]], 8, { smooth: false, tile: 1.6 });
    rig.mesh(b, mBeam, spin, { name: 'hub' });
    const c = litBuilder(1, 96);
    c.rotateX(Math.PI / 2);
    c.lathe([[0.62, 0.5], [0.7, 0.55], [0.5, 1.0], [0.1, 1.45]], 8, { smooth: false, tile: 0.8 });
    c.lathe([[0.84, -0.12], [0.84, 0.14]], 8, { smooth: false, tile: 0.8, color: [0.9, 0.9, 1] });
    brass.append(c);
  }
  rig.mesh(beam, mBeam, spin, { name: 'spars' });
  panels.forEach((pb, i) => rig.mesh(pb, cloths[i], spin, { name: 'cloth' + i }));
  rig.mesh(plank, mPlank, spin, { name: 'lattice' });
  rig.mesh(brass, mBrass, spin, { name: 'brass' });
  rig.anchor(anchors, 'hub', 0, 0, 0);
  rig.anchor(anchors, 'tip0', 0, TIP, 0, spin);

  const st = { angle: opts.angle ?? 0, t: 0 };
  const model = {
    root: rig.root,
    anchors,
    radius: TIP + 0.4,
    height: (TIP + 0.4) * 2,
    tris: rig.tris,
    get angle() { return st.angle; },
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.angle !== undefined) st.angle = pose.angle;
      spin.rotation.z = st.angle;
      const e = exposure(1.4);
      setExposure(mBeam, e); setExposure(mPlank, e); setExposure(mBrass, e);
      for (const m of cloths) setExposure(m, e * 1.5);
    },
    testPoses: { still: { angle: 0 }, spin: (t) => ({ t, angle: t * 0.9 }), tilt: { angle: 0.4 } },
    flash: (k) => rig.flash(k),
    dispose: () => rig.dispose(),
  };
  model.update(0, {});
  return model;
}
