// The open-spyro player page: take a disc image from the user, say what it is, keep it (and a BIOS)
// in IndexedDB if asked, and boot it in EmulatorJS, vendored in ./emulatorjs/ by
// tools/vendor-emulatorjs.mjs, with one of two PlayStation cores:
//   standard  PCSX-ReARMed: light, native 320x240, needs no BIOS (it has a high-level one built in)
//   hd        Beetle PSX (mednafen_psx_hw) with its software renderer at 2x/4x/8x internal resolution:
//             a real dump of the console's BIOS is required. (Its OpenGL renderer does not start in
//             this EmulatorJS build; the software one upscales just as well, on the CPU.)
import { inspectDisc, cueFor, RETAIL_EXE, RETAIL_SHA1 } from './disc.js';

const $ = (id) => document.getElementById(id);
const ext = (name) => name.split('.').pop().toLowerCase();
const mb = (n) => (n < 1048576 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1048576).toFixed(0)} MB`);
const RAW = ['bin', 'img', 'iso'];
const SINGLE = ['chd', 'pbp', 'm3u', 'zip', '7z'];
const GAME_NAME = 'Spyro the Dragon'; // names the memory card, save states and settings kept in this browser

let disc = null; // { files: File[], name: string }
let bios = null; // File

// ---- graphics settings (this page's own; written into EmulatorJS's settings before each boot) ----
const GFX_KEY = 'open-spyro-graphics';
const GFX_DEFAULT = { look: 'standard', scale: '2x', widescreen: false, filter: 'none', overclock: false };
function loadGfx() {
  try { return { ...GFX_DEFAULT, ...JSON.parse(localStorage.getItem(GFX_KEY) || '{}') }; } catch { return { ...GFX_DEFAULT }; }
}
function readGfx() {
  return {
    look: document.querySelector('input[name="look"]:checked').value,
    scale: $('scale').value,
    widescreen: $('widescreen').checked,
    filter: $('filter').value,
    overclock: $('overclock').checked,
  };
}
function showGfx(g) {
  document.querySelector(`input[name="look"][value="${g.look}"]`).checked = true;
  $('scale').value = g.scale;
  $('widescreen').checked = g.widescreen;
  $('filter').value = g.filter;
  $('overclock').checked = g.overclock;
  $('hd-options').disabled = g.look !== 'hd';
  refreshPlay();
}

// The EmulatorJS core options for a choice. EmulatorJS reads them from its saved settings at start-up
// (EJS_defaultOptions only reach the core after it has started, too late for most of these).
function coreSettings(g) {
  const shader = { none: 'disabled', smooth: g.look === 'hd' ? '2xScaleHQ.glslp' : '4xScaleHQ.glslp', crt: 'crt-easymode.glslp' }[g.filter];
  if (g.look === 'hd') {
    return {
      retroarch_core: 'mednafen_psx_hw',
      shader,
      beetle_psx_hw_renderer: 'software',
      beetle_psx_hw_internal_resolution: g.scale,
      beetle_psx_hw_dither_mode: 'disabled', // the PS1's dither pattern is meant for 240 lines, not 960
      beetle_psx_hw_widescreen_hack: g.widescreen ? 'enabled' : 'disabled',
      beetle_psx_hw_widescreen_hack_aspect_ratio: '16:9',
      beetle_psx_hw_cpu_freq_scale: g.overclock ? '200%' : '100%',
    };
  }
  return {
    retroarch_core: 'pcsx_rearmed',
    shader,
    pcsx_rearmed_psxclock: g.overclock ? '100' : 'auto',
  };
}

function writeCoreSettings(g) {
  const key = `ejs-1-psx-${GAME_NAME}-settings`; // EmulatorJS's key: gameId (1), system, game name
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { /* start afresh */ }
  saved.settings = { ...(saved.settings || {}), ...coreSettings(g) };
  try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* storage off: the core keeps its defaults */ }
}

// ---- remembering the disc and BIOS (IndexedDB; Files are stored as their bytes) ----
const DB = 'open-spyro-player';
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('disc');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb(mode, fn) {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction('disc', mode);
    const req = fn(tx.objectStore('disc'));
    tx.oncomplete = () => { conn.close(); resolve(req && req.result); };
    tx.onerror = tx.onabort = () => { conn.close(); reject(tx.error); };
  });
}
const put = (key, value) => idb('readwrite', (s) => s.put(value, key));
const get = (key) => idb('readonly', (s) => s.get(key));
const del = (key) => idb('readwrite', (s) => s.delete(key));

// ---- choosing a disc ----
// -> { files, name, inspect } or a string saying what is wrong
function sortOut(files) {
  const raws = files.filter((f) => RAW.includes(ext(f.name)));
  const cues = files.filter((f) => ext(f.name) === 'cue');
  const single = files.find((f) => SINGLE.includes(ext(f.name)));
  if (cues.length === 1 && raws.length) return { files: [cues[0], ...raws], name: `${cues[0].name} + ${raws.length === 1 ? raws[0].name : `${raws.length} tracks`}`, inspect: raws[0] };
  if (raws.length === 1) return { files: [raws[0]], name: raws[0].name, inspect: raws[0] };
  if (single && files.length === 1) return { files: [single], name: single.name, inspect: null };
  if (cues.length && !raws.length) return 'A .cue is only the index of the disc: choose its .bin as well (both at once).';
  return 'Not a disc image this page knows. Choose a .bin (and its .cue), .iso, .chd, .pbp or an archive of them.';
}

async function choose(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  const picked = sortOut(files);
  if (typeof picked === 'string') { show(files.map((f) => f.name).join(', '), picked, 'warn'); return; }
  disc = picked;
  refreshPlay();
  const size = files.reduce((n, f) => n + f.size, 0);
  const title = `${picked.name} · ${mb(size)}`;
  if (!picked.inspect) { show(title, 'Compressed image: booting it as is.', ''); return; }
  show(title, 'Reading the disc…', '');
  const info = await inspectDisc(picked.inspect);
  if (disc !== picked) return; // another disc was chosen meanwhile
  if (!info.readable) show(title, 'No PlayStation file system found in this image; it will be booted anyway.', 'warn');
  else if (info.retail) show(title, `Spyro the Dragon (NTSC-U). <code>${RETAIL_EXE}</code> is byte-identical to retail (SHA-1 <code>${RETAIL_SHA1.slice(0, 12)}…</code>): an original disc, or an open-spyro build that matches.`, 'ok');
  else if (info.boot === RETAIL_EXE && !info.sha1) show(title, `Spyro the Dragon (NTSC-U), booting <code>${RETAIL_EXE}</code>. (Open this page over https to check it against retail.)`, '');
  else if (info.boot === RETAIL_EXE) show(title, `Spyro the Dragon (NTSC-U), with a <strong>modified</strong> <code>${RETAIL_EXE}</code> (SHA-1 <code>${info.sha1}</code>, retail is <code>${RETAIL_SHA1}</code>): a changed open-spyro build. It boots all the same.`, 'warn');
  else show(title, `This disc boots <code>${html(info.boot)}</code>${info.label ? ` (volume “${html(info.label)}”)` : ''}, not open-spyro's <code>${RETAIL_EXE}</code>. It will run, but it is another game or region.`, 'warn');
}

function html(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function show(name, verdict, kind) {
  $('disc').style.display = 'block';
  $('disc-name').textContent = name;
  $('verdict').innerHTML = verdict;
  $('verdict').className = kind;
}

function showBios() {
  $('bios-name').textContent = bios ? `${bios.name} · ${mb(bios.size)}` : 'none';
  $('forget-bios').hidden = !bios;
  refreshPlay();
}

// HD needs a BIOS: say so next to the buttons instead of failing inside the emulator.
function refreshPlay() {
  const needBios = readGfxSafe().look === 'hd' && !bios;
  $('need-bios').hidden = !needBios;
  $('play').disabled = !disc || needBios;
  $('play-remembered').disabled = needBios;
}
function readGfxSafe() {
  try { return readGfx(); } catch { return GFX_DEFAULT; }
}

// ---- booting ----
async function boot(files) {
  $('play').disabled = $('play-remembered').disabled = true;
  const g = readGfx();
  writeCoreSettings(g);
  // Raw images boot through a .cue (the disc's own, or one written for it); the .bin tracks it names
  // go into the emulator's file system beside it. Compressed images and archives go in as they are.
  let game = files[0];
  const external = {};
  if (RAW.includes(ext(game.name))) {
    game = await cueFor(files[0]);
    external['/' + files[0].name] = files[0];
  } else if (ext(game.name) === 'cue') {
    for (const f of files.slice(1)) external['/' + f.name] = f;
  }
  // Both cores look for this name in their system folder (the root of the emulator's file system).
  if (bios) external['/scph5501.bin'] = bios;
  Object.assign(window, {
    EJS_player: '#game',
    EJS_core: g.look === 'hd' ? 'mednafen_psx_hw' : 'pcsx_rearmed',
    EJS_pathtodata: new URL('emulatorjs/', location.href).pathname,
    EJS_gameUrl: game,
    EJS_externalFiles: external,
    EJS_gameName: GAME_NAME,
    EJS_startOnLoaded: true,
    EJS_color: '#f2b84b',
    EJS_backgroundColor: '#000',
    EJS_threads: false,
    EJS_onGameStart: () => { document.body.dataset.started = '1'; },
  });
  document.body.classList.add('playing');
  const loader = document.createElement('script');
  loader.src = 'emulatorjs/loader.js';
  document.body.appendChild(loader);
}

$('file').addEventListener('change', (e) => choose(e.target.files));
const drop = $('drop');
for (const t of ['dragenter', 'dragover']) window.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); });
for (const t of ['dragleave', 'drop']) window.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); });
window.addEventListener('drop', (e) => choose(e.dataTransfer.files));

$('graphics').addEventListener('change', () => {
  const g = readGfx();
  try { localStorage.setItem(GFX_KEY, JSON.stringify(g)); } catch { /* not remembered */ }
  showGfx(g);
});

$('bios').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size !== 512 * 1024) { $('bios-name').textContent = `${file.name} is ${mb(file.size)}: a PlayStation BIOS is exactly 512 KB.`; return; }
  bios = file;
  showBios();
  try { await put('bios', file); } catch { /* used for this visit only */ }
});
$('forget-bios').addEventListener('click', async () => {
  bios = null;
  $('bios').value = '';
  showBios();
  try { await del('bios'); } catch { /* nothing kept */ }
});

$('play').addEventListener('click', async () => {
  if (!disc) return;
  if ($('remember').checked) {
    $('verdict').textContent = 'Keeping the disc in this browser for next time…';
    try { await put('last', disc.files); } catch (err) { console.warn('could not keep the disc:', err); }
  }
  boot(disc.files);
});

$('back').addEventListener('click', () => location.reload());

showGfx(loadGfx());
(async () => {
  try { bios = (await get('bios')) || null; } catch { /* private window or storage off */ }
  showBios();
  let last = null;
  try { last = await get('last'); } catch { /* private window or storage off */ }
  if (last instanceof Blob) last = [last]; // kept by the first version of this page: one File
  if (!Array.isArray(last) || !last.length || !last.every((f) => f instanceof Blob)) return;
  const files = last.map((f) => (f instanceof File ? f : new File([f], 'disc.bin')));
  const picked = sortOut(files);
  if (typeof picked === 'string') return;
  $('remembered').style.display = 'block';
  $('remembered-name').textContent = `${picked.name} · ${mb(files.reduce((n, f) => n + f.size, 0))}`;
  $('play-remembered').addEventListener('click', () => boot(picked.files));
  $('forget').addEventListener('click', async () => {
    try { await del('last'); } catch { /* nothing to forget */ }
    $('remembered').style.display = 'none';
  });
})();
