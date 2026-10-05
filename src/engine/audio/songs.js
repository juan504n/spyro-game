// Gloaming Vale audio — the songs: one for every world of the game, by the id of the world (REALMS in game/realms.js).
//
//   gloaming   Vale Lullaby / Vale Reveille: the tune the game began with, written for music.js (the buffers 'gloaming' and 'daybreak')
//   <others>   a score (scores/<id>.js, notation in score.js) played by song.js (the buffers 'song_<id>_dusk' and 'song_<id>_dawn')
//
// Every song is two time-aligned loops, one for each colouring of the world (dusk: its lanterns are unlit; dawn: they burn); the player crossfades them
// with the day of the world. A song with a single colouring (Dawnhaven is always daybreak) has one loop. A song is made when the world it belongs to is
// built (audio.loadSong), and freed when the hero has moved on (audio.setSong keeps the song he is in and the one he came from).

import { musicJobs } from './music.js';
import { songJobs, variantsOf, loopSeconds } from './song.js';
import { SCORE as HOME } from './scores/home.js';
import { SCORE as FROSTBLOOM } from './scores/frostbloom.js';
import { SCORE as EMBERFALL } from './scores/emberfall.js';
import { SCORE as SKYWEAVER } from './scores/skyweaver.js';
import { SCORE as TIDEGLASS } from './scores/tideglass.js';
import { SCORE as GUARDIAN } from './scores/guardian.js';

/** The songs that are scores. */
export const SCORES = {
  home: HOME,
  frostbloom: FROSTBLOOM,
  emberfall: EMBERFALL,
  skyweaver: SKYWEAVER,
  tideglass: TIDEGLASS,
  guardian: GUARDIAN,
  // <scores>  (a new realm's score is registered here)
};

/** Every world with a song, the first being the one the game begins with. */
export const SONG_IDS = ['gloaming', ...Object.keys(SCORES)];
export const DEFAULT_SONG = 'gloaming';
export const hasSong = (id) => SONG_IDS.includes(id);

/** The names of the buffers of a song: { dusk, dawn } (null where the song has no such colouring). */
export function songBuffers(id) {
  if (id === 'gloaming') return { dusk: 'gloaming', dawn: 'daybreak' };
  const s = SCORES[id];
  if (!s) return { dusk: null, dawn: null };
  const has = (v) => variantsOf(s).includes(v);
  return { dusk: has('dusk') ? `song_${id}_dusk` : null, dawn: has('dawn') ? `song_${id}_dawn` : null };
}

/** The render jobs of a song (the kind assetJobs makes): results land in out[<buffer name>] as { L, R }. */
export function songJobsOf(id, out, opts = {}) {
  if (id === 'gloaming') return musicJobs(out, opts);
  const s = SCORES[id];
  if (!s) return [];
  const b = songBuffers(id);
  return songJobs(s, { dusk: b.dusk, dawn: b.dawn }, out, opts);
}

/**
 * How much of the ambience beds (crickets and a chime at dusk, birds and a breeze by day: the Vale's) a song lets through, { dusk, day } as multipliers (a score says `ambience`): the crickets
 * of a meadow do not sing in the Guardian's storm, and the dusk of the Spires is windless.
 */
export const songAmbience = (id) => ({ dusk: 1, day: 1, ...((SCORES[id] && SCORES[id].ambience) || {}) });

/** Seconds a song's loop lasts (Vale's tune: 41.7). */
export const songSeconds = (id) => (id === 'gloaming' ? 41.74 : loopSeconds(SCORES[id]));
