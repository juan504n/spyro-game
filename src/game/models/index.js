// MODEL REGISTRY — animated / interactive "actors" (hero, enemies, critters, interactive objects).
//
// Each entry: { create(assets, opts) -> Model, size, note }
// A Model is a plain object:
//   root       THREE.Object3D — origin at the feet/ground-contact point, +Y up, FORWARD = +Z (yaw about Y).
//   update(dt, pose)  advance animation; `pose` fields are model-specific (documented on the model) — all optional.
//   testPoses  { name: pose }  named poses the dev viewer can apply (?test=models&only=name&pose=run)
//   flash(k)   0..1 white hit-flash (via material uFlash uniforms — use assets.mat(tex, { unique: true, lit: true }))
//   radius, height   for collision / UI
//   dispose()  optional
//
// Build geometry with Builder({ lit: true }) (dynamic per-vertex lighting from normals; colours are raw albedo tints),
// one THREE.Mesh per articulated part parented under pivot Object3Ds, materials from assets.mat(tex, { lit: true, unique: true }).
import { CREATURES } from './creatures.js';
import { OBJECTS } from './objects.js';

export const MODELS = { ...CREATURES, ...OBJECTS };
