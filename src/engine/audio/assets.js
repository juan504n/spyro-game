// Gloaming Vale audio — the asset manifest: every PCM buffer the game needs, as small render jobs.
// Pure DSP (Node + browser). The browser runtime (audio.js) runs the jobs with time-sliced yields;
// tools/audio-render.mjs runs them back to back and writes WAVs.
//
// Results land in a flat object keyed by asset name:
//   mono   Float32Array   every sfx name ('jump', 'gem_red', 'glide_loop', ...)
//   stereo { L, R }       'gloaming', 'daybreak' (music loops), 'amb_dusk', 'amb_day' (ambience loops),
//                         'stinger_lantern' | 'stinger_sunrise' | 'stinger_complete' | 'stinger_gameover'

import { SFX, SFX_NAMES } from './sfx.js';
import { ambienceJobs } from './ambience.js';
import { stingerJobs } from './stingers.js';
import { musicJobs } from './music.js';

export { SR } from './synth.js';

export const STINGER_NAMES = ['lantern', 'sunrise', 'complete', 'gameover'];

/** Relative cost of heavier sfx (everything else counts as 1). */
const WEIGHT = { lantern_ignite: 3, ui_start: 2, barrier_open: 2, lantern_beam: 2, portal_hum: 2, waterfall: 2, windmill: 2, gem_purple: 2 };

/**
 * All render jobs in load order: [{ name, weight, run() }]. Weights sum to the progress total.
 * run() is either a plain function or a generator function; a generator yields between its steps so
 * a runner can hand control back to the browser mid-job (use runJob() to drive either kind to the end).
 */
export function assetJobs(out, opts = {}) {
  const jobs = [];
  for (const name of SFX_NAMES) jobs.push({ name, weight: WEIGHT[name] ?? 1, run: () => { out[name] = SFX[name](); } });
  jobs.push(...ambienceJobs(out), ...stingerJobs(out), ...musicJobs(out, opts));
  return jobs;
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
