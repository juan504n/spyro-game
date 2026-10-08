// Reads just enough of a PlayStation disc image to say what it is, without loading it whole:
// the ISO 9660 root directory, SYSTEM.CNF (which executable the disc boots) and that
// executable's SHA-1, compared with the retail SCUS_942.28 that open-spyro rebuilds byte for byte.
// Works on raw 2352-byte-sector images (.bin/.img, MODE1 or MODE2) and 2048-byte .iso files;
// compressed formats (.chd, .pbp, archives) are not inspected.

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
      if (head[0] === 1 && String.fromCharCode(...head.subarray(1, 6)) === 'CD001') return { size: 2048, offset: 0 };
      continue;
    }
    if (!SYNC.every((b, i) => head[i] === b)) continue;
    const offset = head[15] === 2 ? 24 : 16; // MODE2 form 1 has an 8-byte subheader
    if (head[offset] === 1 && String.fromCharCode(...head.subarray(offset + 1, offset + 6)) === 'CD001') return { size: 2352, offset };
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

// -> { readable: false } or { readable: true, label, boot, sha1 (null if it could not be hashed), retail }
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
    const sha1 = exe ? await sha1Hex(await readExtent(file, layout, exe.lba, exe.size)) : null;
    return { readable: true, label, boot, sha1, retail: boot === RETAIL_EXE && sha1 === RETAIL_SHA1 };
  } catch (err) {
    return { readable: false, error: String(err) };
  }
}

// A store-only zip (no compression) of several files, for multi-track .cue/.bin sets: the
// emulator takes one file, and unpacks an archive into its filesystem before booting.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

async function crc32(blob) {
  let c = 0xffffffff;
  const step = 16 << 20;
  for (let at = 0; at < blob.size; at += step) {
    const b = new Uint8Array(await blob.slice(at, at + step).arrayBuffer());
    for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export async function storeZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, blob } of files) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = await crc32(blob);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, blob.size, true);
    local.setUint32(22, blob.size, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(local.buffer, nameBytes, blob);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, blob.size, true);
    entry.setUint32(24, blob.size, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(entry.buffer, nameBytes);
    offset += 30 + nameBytes.length + blob.size;
  }
  const centralSize = central.reduce((n, p) => n + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
