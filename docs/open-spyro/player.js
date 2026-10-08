// The open-spyro player page: take a disc image from the user, say what it is, keep it in
// IndexedDB if asked, and boot it in EmulatorJS (PCSX-ReARMed, vendored in ./emulatorjs/ by
// tools/vendor-emulatorjs.mjs).
import { inspectDisc, storeZip, RETAIL_EXE, RETAIL_SHA1 } from './disc.js';

const $ = (id) => document.getElementById(id);
const ext = (name) => name.split('.').pop().toLowerCase();
const mb = (n) => (n < 1048576 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1048576).toFixed(0)} MB`);
const SINGLE = ['iso', 'chd', 'pbp', 'm3u', 'zip', '7z'];

let disc = null; // { file: File, label: string }

// ---- remembering the last disc (IndexedDB; a File is stored as its bytes) ----
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
const remember = (file) => idb('readwrite', (s) => s.put(file, 'last'));
const recall = () => idb('readonly', (s) => s.get('last'));
const forget = () => idb('readwrite', (s) => s.delete('last'));

// ---- choosing a disc ----
async function choose(files) {
  files = [...files];
  if (!files.length) return;
  const bins = files.filter((f) => ['bin', 'img'].includes(ext(f.name)));
  const cues = files.filter((f) => ext(f.name) === 'cue');
  const single = files.find((f) => SINGLE.includes(ext(f.name)));
  let file = null;
  let inspect = null;
  if (bins.length === 1) {
    // One data track, as open-spyro's disc is: the core reads the raw .bin alone, so the .cue is not needed.
    file = inspect = bins[0];
  } else if (bins.length > 1 && cues.length === 1) {
    // Several tracks: the .cue names them, so they travel together in an archive the emulator unpacks.
    const cueText = await cues[0].text();
    const first = /FILE\s+"([^"]+)"/i.exec(cueText)?.[1];
    inspect = bins.find((b) => b.name === first) || bins[0];
    show(`${cues[0].name} + ${bins.length} tracks`, 'Packing the tracks…', '');
    const zip = await storeZip([cues[0], ...bins].map((f) => ({ name: f.name, blob: f })));
    file = new File([zip], cues[0].name.replace(/\.cue$/i, '.zip'), { type: 'application/zip' });
  } else if (single && files.length === 1) {
    file = single;
    if (ext(single.name) === 'iso') inspect = single;
  } else if (cues.length && !bins.length) {
    show(cues[0].name, 'A .cue is only the index of the disc: choose its .bin as well (both at once).', 'warn');
    return;
  } else {
    show(files.map((f) => f.name).join(', '), 'Not a disc image this page knows. Choose a .bin (and its .cue), .iso, .chd, .pbp or an archive of them.', 'warn');
    return;
  }

  disc = { file };
  $('play').disabled = false;
  const title = `${file.name} · ${mb(file.size)}`;
  if (!inspect) { show(title, 'Compressed image: booting it as is.', ''); return; }
  show(title, 'Reading the disc…', '');
  const info = await inspectDisc(inspect);
  if (disc?.file !== file) return; // another disc was chosen meanwhile
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

// ---- booting ----
async function boot(file) {
  $('play').disabled = $('play-remembered').disabled = true;
  const bios = $('bios').files[0];
  Object.assign(window, {
    EJS_player: '#game',
    EJS_core: 'pcsx_rearmed',
    EJS_pathtodata: new URL('emulatorjs/', location.href).pathname,
    EJS_gameUrl: file,
    EJS_gameName: 'Spyro the Dragon', // names the memory card and save states kept in this browser
    EJS_biosUrl: bios || '',
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

$('play').addEventListener('click', async () => {
  if (!disc) return;
  if ($('remember').checked) {
    $('verdict').textContent = 'Keeping the disc in this browser for next time…';
    try { await remember(disc.file); } catch (err) { console.warn('could not keep the disc:', err); }
  }
  boot(disc.file);
});

$('back').addEventListener('click', () => location.reload());

(async () => {
  let last = null;
  try { last = await recall(); } catch { /* private window or storage off */ }
  if (!(last instanceof Blob)) return;
  const file = last instanceof File ? last : new File([last], 'disc.bin');
  $('remembered').style.display = 'block';
  $('remembered-name').textContent = `${file.name} · ${mb(file.size)}`;
  $('play-remembered').addEventListener('click', () => boot(file));
  $('forget').addEventListener('click', async () => {
    try { await forget(); } catch { /* nothing to forget */ }
    $('remembered').style.display = 'none';
  });
})();
