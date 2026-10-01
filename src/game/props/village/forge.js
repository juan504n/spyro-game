// forge : the smithy at the head of the Ember Canyon. A squat warm-brick hearth-house with a gabled roof of red tiles, a furnace mouth in its front wall glowing like a sunset, a tall chimney
// that smokes, a lean-to on its right where an anvil stands on a stump, a quenching trough on its left. Front = +Z (the mouth, the way in for the hammering).
import { PI, frustum, quadUV, vgrad } from './common.js';

const WALL = { tile: 2.9, emissive: 0.2 };

export function forge(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const brick = kit.b('brick_warm'), stone = kit.b('tower_stone'), iron = kit.b('metal_iron'), plank = kit.b('wood_plank', { double: true }), beam = kit.b('wood_beam');
    const roof = kit.b('roof_red', { double: true });
    const HX = 3.2, Z0 = -4.6, Z1 = 0.6, YT = 4.5;                                   // the house: x -3.2..3.2, z -4.6..0.6, walls up to 4.5
    // plinth and walls
    frustum(stone, 0, (Z0 + Z1) / 2, HX + 0.4, (Z1 - Z0) / 2 + 0.4, HX + 0.3, (Z1 - Z0) / 2 + 0.3, -0.6, 0.5, { tile: 3.0, color: [0.95, 0.9, 0.92], emissive: 0.2 });
    frustum(brick, 0, (Z0 + Z1) / 2, HX, (Z1 - Z0) / 2, HX, (Z1 - Z0) / 2, 0.5, YT, { ...WALL, color: vgrad(0.5, [0.9, 0.86, 0.86], YT, [1.1, 1.04, 1.0]) });
    // gables (the stone triangles under the ridge) and the roof: two slopes with a ridge along x at z = -2, overhanging the walls
    const g = kit.b('brick_warm', { double: true });
    for (const sx of [-1, 1]) g.tri([sx * HX, YT, Z0], [sx * HX, YT, Z1], [sx * HX, YT + 1.55, (Z0 + Z1) / 2], [0, 0], [1, 0], [0.5, 0.6], { ...WALL });
    const ox = HX + 0.55, zf = Z1 + 0.7, zb = Z0 - 0.5, zr = (Z0 + Z1) / 2, yr = YT + 1.7;
    quadUV(roof, [-ox, YT, zf], [ox, YT, zf], [ox, yr, zr], [-ox, yr, zr], { tile: 3.0, emissive: 0.15, color: [1.05, 0.98, 0.95] });
    quadUV(roof, [ox, YT, zb], [-ox, YT, zb], [-ox, yr, zr], [ox, yr, zr], { tile: 3.0, emissive: 0.15, color: [0.9, 0.84, 0.86] });
    // the furnace mouth: a dark opening in the front wall, an iron frame, and the glow that spills out of it
    const mz = Z1 + 0.04;
    quadUV(stone, [-1.15, 0.5, mz], [1.15, 0.5, mz], [1.15, 3.1, mz], [-1.15, 3.1, mz], { tile: 3.0, color: [0.1, 0.08, 0.09], emissive: 0 });
    const emb = kit.b('sun_glow', { mode: 'add', double: true });
    emb.quad([-1.25, 0.5, mz + 0.06], [1.25, 0.5, mz + 0.06], [1.25, 3.0, mz + 0.06], [-1.25, 3.0, mz + 0.06], { uv: [0, 0, 1, 1], emissive: 1, color: [1.0, 0.48, 0.12] });
    emb.quad([-0.8, 0.5, mz + 0.1], [0.8, 0.5, mz + 0.1], [0.8, 2.0, mz + 0.1], [-0.8, 2.0, mz + 0.1], { uv: [0, 0, 1, 1], emissive: 1, color: [1.0, 0.8, 0.4] });
    for (const sx of [-1, 1]) frustum(iron, sx * 1.32, mz + 0.18, 0.18, 0.18, 0.18, 0.18, 0.5, 3.25, { tile: 1.6, emissive: 0.1, faces: ['+z', '-z', '+x', '-x'] });
    frustum(iron, 0, mz + 0.18, 1.5, 0.2, 1.5, 0.2, 3.1, 3.4, { tile: 1.6, emissive: 0.1, faces: ['+z', '-z', '+x', '-x', '+y', '-y'] });
    // coals heaped before the mouth
    kit.xf.push().translate(0, 0.45, mz + 0.9);
    kit.b('metal_iron').blob(0.9, { detail: 1, noise: 0.3, sy: 0.4, tile: 2, color: [0.45, 0.3, 0.28], emissive: 0.35 });
    kit.xf.pop();
    // the chimney: a tall brick stack up from the back of the roof, a cap on it
    const cx = -1.7, cz = Z0 + 1.2;
    frustum(brick, cx, cz, 0.85, 0.85, 0.62, 0.62, YT - 0.4, YT + 5.1, { ...WALL, color: vgrad(YT, [0.95, 0.9, 0.9], YT + 5, [0.78, 0.74, 0.78]) });
    frustum(stone, cx, cz, 0.8, 0.8, 0.8, 0.8, YT + 5.1, YT + 5.45, { tile: 2.0, color: [0.9, 0.86, 0.9], emissive: 0.2 });
    kit.emitter(cx, YT + 5.7, cz, { kind: 'smoke', rate: 2.2, radius: 0.4 });
    // the lean-to on the right: two posts, a roof of planks sloping down from the wall, and the anvil on its stump
    for (const [px, pz] of [[HX + 3.0, Z1 - 0.3], [HX + 3.0, Z0 + 0.5]]) frustum(beam, px, pz, 0.17, 0.17, 0.17, 0.17, -0.2, 3.0, { tile: 2.4, faces: ['+z', '-z', '+x', '-x'] });
    quadUV(plank, [HX, 3.7, Z1 + 0.3], [HX, 3.7, Z0 - 0.2], [HX + 3.4, 2.95, Z0 - 0.2], [HX + 3.4, 2.95, Z1 + 0.3], { tile: 2.6, color: [0.95, 0.85, 0.78], emissive: 0.1 });
    const ax = HX + 1.6, az = (Z0 + Z1) / 2 + 0.2;
    kit.xf.push().translate(ax, 0, az);
    kit.b('bark').cyl(0.62, 0.55, 0.95, 7, { tile: 2.4, smooth: false, color: [0.9, 0.85, 0.82] });
    frustum(iron, 0, 0, 0.7, 0.28, 0.46, 0.24, 0.95, 1.38, { tile: 1.6, emissive: 0.12, color: [1.0, 1.0, 1.1] });
    frustum(iron, 0.95, 0, 0.3, 0.14, 0.04, 0.1, 1.15, 1.38, { tile: 1.6, emissive: 0.12, faces: ['+z', '-z', '+x', '+y', '-y'] });
    kit.xf.pop();
    // the quenching trough on the left: planks, and dark water in it
    const tx = -HX - 2.3, tz = Z1 - 1.4;
    frustum(plank, tx, tz, 1.4, 0.65, 1.4, 0.65, -0.1, 0.95, { tile: 2.2, color: [0.9, 0.82, 0.78], faces: ['+z', '-z', '+x', '-x', '-y'] });
    quadUV(kit.b('metal_iron'), [tx - 1.2, 0.8, tz + 0.5], [tx + 1.2, 0.8, tz + 0.5], [tx + 1.2, 0.8, tz - 0.5], [tx - 1.2, 0.8, tz - 0.5], { tile: 2.0, color: [0.2, 0.3, 0.45], emissive: 0.1 });
    // light: the furnace mouth throws an orange pool on the ground in front of it
    kit.glow(0, 1.7, Z1 + 1.8, { color: [1.0, 0.5, 0.18], size: 9.5, pool: 8, flicker: 0.55 });
    kit.emitter(0, 2.3, Z1 + 0.6, { kind: 'sparkle', rate: 3, radius: 0.9 });
    // solids: the house, the lean-to's posts, the stump with its anvil, the trough
    kit.box(0, (Z0 + Z1) / 2, HX + 0.4, (Z1 - Z0) / 2 + 0.4, -0.6, YT + 1.8, { tag: 'forge' });
    for (const [px, pz] of [[HX + 3.0, Z1 - 0.3], [HX + 3.0, Z0 + 0.5]]) kit.cyl(px, pz, 0.22, -0.2, 3.0, { tag: 'post' });
    kit.cyl(ax, az, 0.75, 0, 1.4, { tag: 'anvil' });
    kit.box(tx, tz, 1.4, 0.65, -0.1, 0.95, { tag: 'trough' });
    kit.caster(0, (Z0 + Z1) / 2, 4.2, 6.0, 0.5);
    kit.caster(cx, cz, 0.9, YT + 5.4, 0.3);
    void PI;
  });
}

export const FORGE = {
  forge: { fn: forge, size: 14, note: 'The Ember Canyon smithy: warm-brick hearth-house 6.4 x 5.2 with a red-tile gabled roof, a glowing furnace mouth in its FRONT (+Z) wall with an orange pool of light before it, a smoking chimney (top ~10), a lean-to on the right with an anvil on a stump, a quenching trough on the left. Solid box colliders (not walk-on).' },
};
