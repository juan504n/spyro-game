// LIGHT BEAM — tall additive column of light rising from the origin (base at y = 0). Three nested/crossed translucent
// pieces (a hexagonal outer shell, a square hot core and two crossed soft cards, all double sided) so it reads as a
// volumetric shaft from any angle and still looks fine with the camera inside it, plus a glow disc on the ground.
// setColor([r,g,b]) tints it, setIntensity(k) fades it (0..1, hidden at 0); the texture scrolls upward.
import { U } from '../../../engine/materials.js';
import { Rig, setAlpha } from './common.js';
import { litBuilder, TAU, clamp, lerp, smooth } from './geo.js';

const TEX_H = 16;   // world units per repeat of the 16x64 beam texture

export function createLightBeam(assets, opts = {}) {
  const H = opts.height ?? 60;
  const R = opts.radius ?? 1.6;
  const rig = new Rig(assets);
  const anchors = {};
  const mOuter = rig.glow('beam', { double: true, scroll: [0, -0.32] });
  const mCore = rig.glow('beam', { double: true, scroll: [0, -0.62] });
  const mFlare = rig.glow('sun_glow', { double: true });
  const col = [1.0, 0.78, 0.36];
  const N = [0, 1, 0];
  const g = 0.5;

  // outer hexagonal shell (slightly tapering), alpha fades to the top
  {
    const b = litBuilder(1, 121);
    const n = 6, rB = R, rT = R * 0.78;
    const v1 = H / TEX_H;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      const P = (r, y, a) => [r * Math.sin(a), y, r * Math.cos(a)];
      b.quad(P(rB, 0, a0), P(rB, 0, a1), P(rT, H, a1), P(rT, H, a0), { uv: [0.1, 0, 0.9, v1], tints: [[g, g, g], [g, g, g], [g, g, g], [g, g, g]], alphas: [1, 1, 0.12, 0.12] }, [N, N, N, N]);
    }
    // two crossed soft cards through the axis
    for (let i = 0; i < 2; i++) {
      const a = (i / 2) * Math.PI / 1;
      const dx = Math.sin(a + 0.4) * R * 1.35, dz = Math.cos(a + 0.4) * R * 1.35;
      b.quad([-dx, 0, -dz], [dx, 0, dz], [dx * 0.8, H, dz * 0.8], [-dx * 0.8, H, -dz * 0.8], { uv: [0, 0, 1, v1 * 0.8], tints: [[g, g, g], [g, g, g], [g, g, g], [g, g, g]], alphas: [0.9, 0.9, 0.1, 0.1] }, [N, N, N, N]);
    }
    rig.mesh(b, mOuter, null, { name: 'shell', order: 8 });
  }
  // hot core (square section)
  {
    const b = litBuilder(1, 122);
    const n = 4, rB = R * 0.46, rT = R * 0.34;
    const v1 = H / TEX_H;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU + Math.PI / 4, a1 = ((i + 1) / n) * TAU + Math.PI / 4;
      const P = (r, y, a) => [r * Math.sin(a), y, r * Math.cos(a)];
      b.quad(P(rB, 0, a0), P(rB, 0, a1), P(rT, H, a1), P(rT, H, a0), { uv: [0.05, 0, 0.95, v1 * 0.9], tints: [[g, g, g], [g, g, g], [g, g, g], [g, g, g]], alphas: [1, 1, 0.3, 0.3] }, [N, N, N, N]);
    }
    rig.mesh(b, mCore, null, { name: 'core', order: 9 });
  }
  // ground flare
  {
    const b = litBuilder(1, 123);
    b.disc(R * 1.9, 8, { y: 0.14, uvDisc: true, color: [g, g, g] });
    rig.mesh(b, mFlare, null, { name: 'flare', order: 8 });
  }
  rig.anchor(anchors, 'base', 0, 0, 0);
  rig.anchor(anchors, 'top', 0, H, 0);

  const st = { k: clamp(opts.intensity ?? 1), color: col.slice(), t: 0 };
  // Additive light washes towards white against a bright/violet sky, so the requested tint is pushed to a more saturated
  // colour (power curve) before it multiplies the greyscale beam texture.
  const paint = () => {
    const c = st.color;
    const pw = (v, e) => Math.pow(clamp(v, 0, 1), e);
    mOuter.uniforms.uColorMul.value.setRGB(pw(c[0], 1.9), pw(c[1], 1.9), pw(c[2], 1.9));
    mCore.uniforms.uColorMul.value.setRGB(pw(c[0], 1.5), pw(c[1], 1.5), pw(c[2], 1.5));
    mFlare.uniforms.uColorMul.value.setRGB(pw(c[0], 1.9), pw(c[1], 1.9), pw(c[2], 1.9));
  };
  const apply = () => {
    const t = st.t;
    // soft knee: a dim beam keeps its strength, a strong one is compressed so the stacked additive layers do not clip to white
    const k = st.k * (1 - 0.35 * smooth(0.4, 1, st.k));
    const dim = 1 - 0.3 * U.uDay.value;   // additive light washes out against the bright daybreak sky
    setAlpha(mOuter, k * dim * (0.4 + 0.07 * Math.sin(t * 2.1)));
    setAlpha(mCore, k * dim * (0.48 + 0.08 * Math.sin(t * 3.3 + 1)));
    setAlpha(mFlare, k * dim * (0.7 + 0.15 * Math.sin(t * 4.1)));
    rig.root.visible = st.k > 0.003;
  };
  paint();
  const model = {
    root: rig.root,
    anchors,
    radius: R,
    height: H,
    tris: rig.tris,
    get intensity() { return st.k; },
    setColor(c) { st.color = [c[0], c[1], c[2]]; paint(); },
    setIntensity(k) { st.k = clamp(k); },
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.intensity !== undefined) st.k = clamp(pose.intensity);
      if (pose.color) { st.color = pose.color.slice(0, 3); paint(); }
      apply();
    },
    testPoses: { on: { intensity: 1 }, dim: { intensity: 0.4 }, off: { intensity: 0 } },
    flash: () => {},
    dispose: () => rig.dispose(),
  };
  apply();
  return model;
}
