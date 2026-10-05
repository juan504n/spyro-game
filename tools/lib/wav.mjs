// 16-bit PCM WAV writer for the dev tools (audio-render writes the same format).
import fs from 'node:fs';
import { SR } from '../../src/engine/audio/synth.js';

/** Write mono or stereo channels (Float32Array each, -1..1) to a WAV file. */
export function writeWav(file, chans, sr = SR) {
  const n = chans[0].length;
  const nc = chans.length;
  const b = Buffer.alloc(44 + n * nc * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * nc * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(nc, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * nc * 2, 28);
  b.writeUInt16LE(nc * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * nc * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nc; c++) {
      b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chans[c][i])) * 32767), o);
      o += 2;
    }
  }
  fs.writeFileSync(file, b);
}
