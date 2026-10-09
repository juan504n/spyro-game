// Reads just enough of a PlayStation disc image to say what it is, without loading it whole:
// the ISO 9660 root directory, SYSTEM.CNF (which executable the disc boots) and that
// executable's SHA-1, compared with the retail SCUS_942.28 that open-spyro rebuilds byte for byte.
// Works on raw 2352-byte-sector images (.bin/.img, MODE1 or MODE2) and 2048-byte .iso files;
// compressed formats (.chd, .pbp, archives) are not inspected. Also writes the .cue for a lone image.

export const RETAIL_EXE = 'SCUS_942.28';
export const RETAIL_SHA1 = '84e3728ab94720d0873e2514adf4aade4935e0c5';

const SYNC = [0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00];

async function bytes(file, start, length) {
  return new Uint8Array(await file.slice(start, start + length).arrayBuffer());
}

// Sector layout: where sector 16 (the primary volume descriptor) starts its user data.
async function sectorLayout(file) {
  for (const raw of [2352, 2048]) {
    const head = await bytes(file, 16 * raw, 32);
    if (head.length < 32) continue;
    if (raw === 2048) {
      if (head[0] === 1 && String.fromCharCode(...head.subarray(1, 6)) === 'CD001') return { size: 2048, offset: 0, mode: 1 };
      continue;
    }
    if (!SYNC.every((b, i) => head[i] === b)) continue;
    const offset = head[15] === 2 ? 24 : 16; // MODE2 form 1 has an 8-byte subheader
    if (head[offset] === 1 && String.fromCharCode(...head.subarray(offset + 1, offset + 6)) === 'CD001') return { size: 2352, offset, mode: head[15] };
  }
  return null;
}

async function readExtent(file, layout, lba, length) {
  const sectors = Math.ceil(length / 2048);
  if (layout.size === 2048) return bytes(file, lba * 2048, length);
  const raw = await bytes(file, lba * 2352, sectors * 2352);
  const out = new Uint8Array(sectors * 2048);
  for (let i = 0; i < sectors; i++) out.set(raw.subarray(i * 2352 + layout.offset, i * 2352 + layout.offset + 2048), i * 2048);
  return out.subarray(0, length);
}

const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function listDirectory(dir) {
  const entries = [];
  for (let o = 0; o < dir.length; ) {
    const len = dir[o];
    if (len === 0) { o = (Math.floor(o / 2048) + 1) * 2048; continue; } // records never cross a sector
    const nameLen = dir[o + 32];
    const name = String.fromCharCode(...dir.subarray(o + 33, o + 33 + nameLen)).replace(/;\d+$/, '');
    entries.push({ name: name.toUpperCase(), lba: u32(dir, o + 2), size: u32(dir, o + 10), dir: (dir[o + 25] & 2) !== 0 });
    o += len;
  }
  return entries;
}

async function sha1Hex(data) {
  if (!globalThis.crypto?.subtle) return null; // only in secure contexts (https, localhost)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', data));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// -> { readable: false } or { readable: true, label, boot, sha1 (null if it could not be hashed), exe (its bytes), retail }
export async function inspectDisc(file) {
  try {
    const layout = await sectorLayout(file);
    if (!layout) return { readable: false };
    const pvd = await readExtent(file, layout, 16, 2048);
    const label = String.fromCharCode(...pvd.subarray(40, 72)).trim();
    const root = listDirectory(await readExtent(file, layout, u32(pvd, 156 + 2), u32(pvd, 156 + 10)));
    const cnf = root.find((e) => e.name === 'SYSTEM.CNF');
    let boot = 'PSX.EXE';
    if (cnf) {
      const text = new TextDecoder().decode(await readExtent(file, layout, cnf.lba, cnf.size));
      const m = /BOOT\s*=\s*cdrom:\\*([^;\s]+)/i.exec(text);
      if (m) boot = m[1].toUpperCase();
    }
    const exe = boot.includes('\\') ? null : root.find((e) => e.name === boot && !e.dir);
    const exeBytes = exe ? await readExtent(file, layout, exe.lba, exe.size) : null;
    const sha1 = exeBytes ? await sha1Hex(exeBytes) : null;
    return { readable: true, label, boot, sha1, exe: exeBytes, retail: boot === RETAIL_EXE && sha1 === RETAIL_SHA1 };
  } catch (err) {
    return { readable: false, error: String(err) };
  }
}

// A .cue sheet for a lone data-track image. Beetle PSX will not boot a bare .bin, and EmulatorJS's
// own fallback .cue always says MODE1/2352, which PlayStation discs are not.
export async function cueFor(file) {
  const layout = (await sectorLayout(file)) || { size: 2352, mode: 2 };
  const track = layout.size === 2048 ? 'MODE1/2048' : `MODE${layout.mode === 1 ? 1 : 2}/2352`;
  const text = `FILE "${file.name}" BINARY\r\n  TRACK 01 ${track}\r\n    INDEX 01 00:00:00\r\n`;
  return new File([text], file.name.replace(/\.[^.]+$/, '') + '.cue', { type: 'text/plain' });
}
