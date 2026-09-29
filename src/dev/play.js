// Dev: the bare world with the player, camera and collision (no props/entities) for tuning movement.
import { Game } from '../game/game.js';

export async function create(gfx) {
  const game = await new Game(gfx).build();
  game.resize(gfx.W, gfx.H);
  const params = new URLSearchParams(location.search);
  if (params.get('day')) { game.day = game.dayTarget = parseFloat(params.get('day')); }
  if (params.get('at')) {
    const [x, z, yaw] = params.get('at').split(',').map(Number);
    game.player.place(x, game.grid.heightAt(x, z) + 0.05, z, yaw ?? 0);
    game.cam.snapBehind(game.player);
  }
  window.__game = game;
  console.log('play build ms', Math.round(game.buildTime), JSON.stringify(game.world.timings));
  return { scene: game.scene, camera: game.camera, update: (dt) => game.update(dt), onResize: (W, H) => game.resize(W, H) };
}
