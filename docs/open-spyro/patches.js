// Game patches the page can apply as cheat codes (constant 16-bit RAM writes, the GameShark "80"
// type both cores take). Each one is checked against the executable on the disc first: it is only
// applied when the instructions it changes are there, as in the retail SCUS_942.28 (and every
// open-spyro build that matches it), so a modified build or another game is never patched blind.

// 60 fps. Spyro's gameplay already runs on 1/60 s ticks: the main loop sets g_nFrameStep to the
// vblanks that passed since the last frame (clamped to 2..4) and Spyro, the camera, actors and every
// level overlay advance by that many ticks. Rendering is what waits for 2 vblanks. So: let the step
// go down to 1 (main, 0x80012224: li $s1, 2 -> 1) and let GamestateDraw's pacing loop wait for 1
// vblank instead of 2 (0x8001F0C4 and 0x8001F0F8: slti $v0, $v0, 2 -> 1). When a frame takes longer
// the game still measures it and steps 2 or 3 ticks, as it does at 30. Menus and cutscenes keep
// their own 30 fps pacing. Only gameplay frames are affected.
export const FPS60 = {
  name: '60 fps',
  code: '80012224 0001+8001F0C4 0001+8001F0F8 0001',
  original: [
    [0x80012224, 0x24110002], // addiu $s1, $zero, 2
    [0x8001f0c4, 0x28420002], // slti $v0, $v0, 2
    [0x8001f0f8, 0x28420002], // slti $v0, $v0, 2
  ],
};

// exe: the whole PS-X EXE file. True when every word the patch changes holds its original value.
export function patchFits(patch, exe) {
  if (!exe || exe.length < 0x800 || String.fromCharCode(...exe.subarray(0, 8)) !== 'PS-X EXE') return false;
  const view = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  const load = view.getUint32(0x18, true);
  return patch.original.every(([addr, word]) => {
    const at = 0x800 + addr - load;
    return at >= 0x800 && at + 4 <= exe.length && view.getUint32(at, true) === word;
  });
}
