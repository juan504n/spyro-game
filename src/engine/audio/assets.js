// Gloaming Vale audio — the asset manifest: every PCM buffer the game needs, as small render jobs.
// Pure DSP (Node + browser). The browser runtime (audio.js) runs the jobs with time-sliced yields;
// tools/audio-render.mjs runs them back to back and writes WAVs.
//
// Results land in a flat object keyed by asset name:
//   mono   Float32Array   every sfx name ('jump', 'gem_red', 'glide_loop', ...)
//   stereo { L, R }       the songs' loops (songs.js: Vale's 'gloaming' and 'daybreak', 'song_<world>_dusk' | 'song_<world>_dawn' for the others),
//                         'amb_dusk', 'amb_day' (ambience loops), 'stinger_lantern' | 'stinger_sunrise' | 'stinger_complete' | 'stinger_gameover'

import { SFX, SFX_NAMES } from './sfx.js';
import { ambienceJobs } from './ambience.js';
import { stingerJobs } from './stingers.js';
import { SONG_IDS, DEFAULT_SONG, songJobsOf } from './songs.js';

export { SR } from './synth.js';

export const STINGER_NAMES = ['lantern', 'sunrise', 'complete', 'gameover'];

/** Relative cost of heavier sfx (everything else counts as 1). */
const WEIGHT = { lantern_ignite: 3, ui_start: 2, barrier_open: 2, lantern_beam: 2, portal_hum: 2, portal_open: 2, portal_enter: 2, waterfall: 2, windmill: 2, gem_purple: 2, guardian_roar: 2, guardian_lit: 2, guardian_freed: 4 };

/**
 * Sounds that are made when the place that uses them is built, not at every start-up (audio.load(group)): the Guardian's, which only a hero who has restored every realm hears and which cost a fifth
 * of the whole start-up (`guardian_freed` alone is the heaviest job of all). The gate's rumble in Dawnhaven (`guardian_stoop`) is small and stays in the start-up set.
 */
export const LAZY_GROUPS = { guardian: SFX_NAMES.filter((n) => n.startsWith('guardian_') && n !== 'guardian_stoop') };
export const LAZY_NAMES = new Set(Object.values(LAZY_GROUPS).flat());

/**
 * All render jobs in load order: [{ name, weight, run() }]. Weights sum to the progress total.
 * run() is either a plain function or a generator function; a generator yields between its steps so
 * a runner can hand control back to the browser mid-job (use runJob() to drive either kind to the end).
 * The songs: opts.songs is the list of world ids whose songs are made (default: Vale's, the one the game begins with; the player makes the song of the world it is in and
 * the others when their worlds are built); opts.all makes the sounds of the lazy groups and every song, for the tools.
 */
export function assetJobs(out, opts = {}) {
  const jobs = [];
  for (const name of SFX_NAMES) if (opts.all || !LAZY_NAMES.has(name)) jobs.push({ name, weight: WEIGHT[name] ?? 1, run: () => { out[name] = SFX[name](); } });       // (opts.all: the tools that render every sound)
  jobs.push(...ambienceJobs(out), ...stingerJobs(out));
  for (const id of opts.songs || (opts.all ? SONG_IDS : [DEFAULT_SONG])) jobs.push(...songJobsOf(id, out, opts));
  return jobs;
}

/** The render jobs of a lazy group (LAZY_GROUPS): the same kind of job as assetJobs makes. */
export function lazyJobs(group, out) {
  return (LAZY_GROUPS[group] || []).map((name) => ({ name, weight: WEIGHT[name] ?? 1, run: () => { out[name] = SFX[name](); } }));
}

/** Approximate bytes of PCM in a results object (Float32). */
export function pcmBytes(out) {
  let n = 0;
  for (const v of Object.values(out)) {
    if (v instanceof Float32Array) n += v.length * 4;
    else if (v && v.L) n += (v.L.length + v.R.length) * 4;
  }
  return n;
}

/** Drive one job to completion synchronously (Node tools); works for plain and generator jobs. */
export function runJob(job) {
  const r = job.run();
  if (r && typeof r.next === 'function') {
    while (!r.next().done) { /* run every step */ }
  }
}
