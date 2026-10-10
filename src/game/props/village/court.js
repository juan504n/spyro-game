// The props of the Guardian's Court (guardian/layout.js): the runed pillars that stand round the floor, the rings of runes in it, the dais the Guardian sits on, and the statues of the wardens that stood
// before it along the gorge road. Dark runed stone (the textures of the Dawn Gate: tower_stone, brick, rune_ring) with violet light in the runes: the same hand as the gate it is the end of.
import { PI, TAU, lerp, vgrad } from './common.js';

const VIOLET = [0.66, 0.46, 1.0];
const FACES = ['+z', '-z', '+x', '-x', '+y'];

// ---------------------------------------------------------------------------------------------------------------
// court_pillar : a tapering octagonal column of runed stone on a stepped plinth, a capital, three rune plaques on its front (the side that looks at the dais) and a violet orb over it that lights the
// court. Params h (default 9), r (the shaft's mean radius, 0.9). Local +Z = the front. A cylinder collider; the bolts of the Guardian burst on it.
// ---------------------------------------------------------------------------------------------------------------
export function courtPillar(kit, p) {
  const { x, z, rot = 0, scale = 1, y, h = 9, r = 0.9 } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const st = kit.b('tower_stone'), br = kit.b('brick'), rb = kit.b('rune_ring', { mode: 'add', decal: true }), gl = kit.b(null);
    const so = { tile: 3.2, emissive: 0.26 }, tint = vgrad(0, [0.95, 0.95, 1.05], h, [1.2, 1.2, 1.35]), bt = [0.86, 0.84, 0.96];
    br.box(0, 0.3, 0, 3.0, 0.8, 3.0, { tile: 3.2, color: vgrad(-0.1, [0.62, 0.6, 0.7], 0.7, bt), emissive: 0.2, faces: FACES });
    br.box(0, 0.95, 0, 2.3, 0.5, 2.3, { tile: 3.2, color: bt, emissive: 0.2, faces: FACES });
    st.push().translate(0, 1.2, 0).cyl(r * 1.18, r * 0.88, h - 1.2, 8, { ...so, color: tint }).pop();
    br.box(0, h + 0.3, 0, 2.3, 0.6, 2.3, { tile: 3.2, color: [1.0, 0.98, 1.1], emissive: 0.22, faces: ['+z', '-z', '+x', '-x', '-y', '+y'] });
    // the rune plaques on the front, three of them, lit
    for (const py of [3.1, 5.3, 7.5]) {
      const t = (py - 1.2) / (h - 1.2), rr = lerp(r * 1.18, r * 0.88, t), s = 0.72, zz = rr + 0.04;
      rb.quad([-s, py - s, zz], [s, py - s, zz], [s, py + s, zz], [-s, py + s, zz], { uv: [0, 0, 1, 1], emissive: 0.9, color: [0.95, 0.9, 1.0] });
    }
    // the orb over it
    gl.push().translate(0, h + 1.35, 0).sphere(0.46, 6, 5, { color: VIOLET, emissive: 1 }).pop();
    gl.push().translate(0, h + 0.85, 0).cyl(0.2, 0.34, 0.5, 6, { color: [0.7, 0.62, 0.9], emissive: 0.8 }).pop();
    kit.glow(0, h + 1.35, 0, { color: [0.7, 0.5, 1.0], size: 6, pool: 8, flicker: 0.04 });
    kit.caster(0, 0, 1.7, h + 1.5);
    kit.cyl(0, 0, r + 0.25, 0, h + 1.6, { tag: 'pillar' });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// court_runes : the rings of runes in the court's floor - one flat disc of the additive rune_court texture, `r` in radius (default 38), a hair over the floor (the floor is flat: the dais, which stands over
// it, hides the middle). No collider.
// ---------------------------------------------------------------------------------------------------------------
export function courtRunes(kit, p) {
  const { x, z, y, r = 38 } = p;
  kit.at(x, z, { y }, () => {
    kit.b('rune_court', { mode: 'add', decal: true }).disc(r, 40, { y: 0.07, uvDisc: true, emissive: 1, color: [0.4, 0.38, 0.48] });          // (dim: the rings of light are the setting, not what the eye is asked to read: the circles of the fists are)
  });
}

// ---------------------------------------------------------------------------------------------------------------
// guardian_dais : the Guardian's seat. Origin at the top of the dais (params y: its height, r: its radius, 10). A ring of sixteen low stones on its rim, its own rings of runes, the pedestal the
// Guardian stands on (5.0 m across, 1 m high) and the collider that is the Guardian's body (a cylinder of 4.6 m and 14 m, solid: the hero stands outside it, never in it).
// ---------------------------------------------------------------------------------------------------------------
export function guardianDais(kit, p) {
  const { x, z, y, r = 10 } = p;
  kit.at(x, z, { y }, () => {
    const st = kit.b('tower_stone'), br = kit.b('brick');
    kit.b('rune_court', { mode: 'add', decal: true }).disc(r - 0.9, 28, { y: 0.07, uvDisc: true, emissive: 1, color: [0.5, 0.45, 0.6] });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, rr = r - 0.45;
      br.push().translate(Math.sin(a) * rr, 0.28, Math.cos(a) * rr).rotateY(a).box(0, 0, 0, 1.7, 0.62, 0.9, { tile: 3.2, color: [0.84, 0.82, 0.96], emissive: 0.2, faces: FACES }).pop();
    }
    // the pedestal: two steps of dark stone
    st.cyl(5.4, 5.0, 0.55, 12, { tile: 3.2, color: [0.9, 0.9, 1.05], emissive: 0.24, caps: 'top' });
    st.push().translate(0, 0.55, 0).cyl(4.8, 4.5, 0.55, 12, { tile: 3.2, color: [1.0, 1.0, 1.12], emissive: 0.26, caps: 'top' }).pop();
    kit.caster(0, 0, 5.4, 1.2);
    kit.cyl(0, 0, 4.6, 0, 16, { tag: 'guardian' });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// warden_statue : one of the wardens who stood before the Guardian: a hooded figure in a tapering robe on a plinth, one arm out holding a lantern that has gone dark (a faint violet in its cage). 4.2 m
// tall. Local +Z = the front (the way it looks).
// ---------------------------------------------------------------------------------------------------------------
export function wardenStatue(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const st = kit.b('tower_stone'), br = kit.b('brick'), gl = kit.b(null);
    br.box(0, 0.4, 0, 2.0, 0.9, 2.0, { tile: 3.2, color: [0.8, 0.78, 0.9], emissive: 0.2, faces: FACES });
    st.push().translate(0, 0.85, 0).cyl(0.92, 0.5, 2.3, 8, { tile: 3.2, color: vgrad(0, [0.9, 0.9, 1.0], 2.3, [1.15, 1.15, 1.3]), emissive: 0.24 }).pop();
    st.push().translate(0, 3.35, 0).sphere(0.46, 7, 5, { tile: 3.2, color: [1.1, 1.1, 1.25], emissive: 0.26, sy: 1.15 }).pop();
    st.box(-0.7, 2.85, 0.15, 0.34, 0.5, 0.34, { tile: 3.2, color: [1.0, 1.0, 1.15], emissive: 0.24 });                  // the arm that hangs
    st.box(0.62, 2.7, 0.55, 0.32, 0.32, 1.0, { tile: 3.2, color: [1.0, 1.0, 1.15], emissive: 0.24 });                   // the arm held out
    gl.push().translate(0.62, 2.35, 1.15).sphere(0.26, 6, 5, { color: [0.38, 0.28, 0.6], emissive: 0.6 }).pop();       // the dark lantern
    br.push().translate(0.62, 2.74, 1.15).box(0, 0, 0, 0.1, 0.5, 0.1, { tile: 3.2, color: [0.5, 0.45, 0.6], emissive: 0.3 }).pop();
    kit.glow(0.62, 2.35, 1.15, { color: [0.55, 0.4, 0.95], size: 1.8, pool: 0 });
    kit.caster(0, 0, 1.1, 4.0);
    kit.cyl(0, 0, 0.95, 0, 4.2, { tag: 'statue' });
  });
}

export const COURT = {
  court_pillar: {
    fn: courtPillar, size: 4,
    note: 'Runed pillar of the Guardian\'s Court: tapering octagonal shaft (r 0.9 mean, params h 9, r) on a stepped brick plinth, a capital, three lit rune plaques on the front (+Z, the side that looks at the dais) and a violet orb with a glow over it. Cylinder collider (r + 0.25, to h + 1.6).',
    defaults: { h: 9, r: 0.9 },
  },
  court_runes: {
    fn: courtRunes, size: 76,
    note: 'The rings of runes in the Guardian\'s Court\'s floor: one flat additive disc (texture rune_court) of radius r (38) a hair over the floor at y (pass the floor\'s height: the dais hides the middle). No collider.',
    defaults: { r: 38 },
  },
  guardian_dais: {
    fn: guardianDais, size: 22,
    note: 'The Guardian\'s seat. Origin at the dais\'s TOP (pass y). A ring of 16 rim stones at r - 0.45 (r 10), the rune_court rings, a two-step pedestal 5.4 m across under the Guardian, and the collider of its body: a solid cylinder r 4.6 from the top up 16 m (tag guardian).',
    defaults: { r: 10 },
  },
  warden_statue: {
    fn: wardenStatue, size: 4,
    note: 'A hooded warden in a tapering robe on a plinth (4.2 m), one arm out with a dark lantern (a faint violet in its cage). Local +Z = the way it looks. Cylinder collider r 0.95.',
  },
};
void PI;
