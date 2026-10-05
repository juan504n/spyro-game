// What a musician would check on a lead sheet, computed from a score (no audio): the chord of every bar with its voicing, the notes of the tune
// over it, which of them are chord tones, and where a note of the tune leans on a note of the harmony a semitone away. Node only.
import { chordSlots, nameOf, pcName } from '../../src/engine/audio/score.js';
import { makeState, partEvents, unitSec } from '../../src/engine/audio/song.js';

const pcSet = (c) => new Set(c.tones.map((t) => (c.root + t) % 12));

/** The slot of the chord sounding at (bar, unit). */
const slotAt = (slots, bar, u) => slots.find((s) => s.bar === bar && u >= s.u - 1e-9 && u < s.u + s.len - 1e-9);

/** The parts that carry the tune: the `line` parts marked `lead: true`, else the first `line` part of the variant. */
function leadParts(v) {
  const lines = v.parts.map((p, i) => ({ p, i })).filter(({ p }) => p.type === 'line');
  const marked = lines.filter(({ p }) => p.lead);
  return marked.length ? marked : lines.slice(0, 1);
}

/**
 * { rows: lead sheet lines, nonChord: [...], clashes: [...], strongRatio (share of the tune's strong-beat notes that are chord tones), leaps, steps }
 * Only the lead line counts as the tune (leadParts).
 */
export function analyzeVariant(score, name) {
  const st = makeState(score, name);
  const v = score.variants[name];
  const notes = leadParts(v).flatMap(({ p, i }) => partEvents(st, p, i)).filter((e) => !e.echo && e.m !== undefined);
  notes.sort((a, b) => a.t - b.t);
  const rows = [];
  const nonChord = [];
  const clashes = [];
  let strong = 0;
  let strongIn = 0;
  const upb = score.upb;
  for (let b = 0; b < score.bars; b++) {
    const slots = st.slots.filter((s) => s.bar === b);
    const here = notes.filter((e) => e.bar === b);
    const chordTxt = slots.map((s) => `${s.c.sym} [${s.pad.map(nameOf).join(' ')}] bass ${nameOf(s.bassNote)}`).join(' | ');
    const melTxt = here.map((e) => {
      const s = slotAt(st.slots, b, e.u);
      const set = s ? pcSet(s.c) : new Set();
      const inChord = set.has(((e.m % 12) + 12) % 12);
      const isStrong = st.starts.has(e.u) || e.u === 0;
      if (isStrong && e.len >= unitSec(score) * 0.99) { strong++; if (inChord) strongIn++; }
      if (!inChord && isStrong && e.len >= unitSec(score) * 1.9) nonChord.push(`bar ${b + 1} u${e.u}: ${nameOf(e.m)} over ${s.c.sym}`);
      // a semitone (or a minor ninth) between a note held in the tune and a voice of the pad (the bass is too far below to count) while the note is not a chord tone itself
      if (s && !inChord && e.len >= unitSec(score) * 1.9) {
        for (const h of s.pad) {
          const d = Math.abs(e.m - h);
          if (d === 1 || d === 13) { clashes.push(`bar ${b + 1} u${e.u}: ${nameOf(e.m)} against ${nameOf(h)} of ${s.c.sym}`); break; }
        }
      }
      return `${nameOf(e.m)}${inChord ? '' : '*'}${e.len / unitSec(score) !== 1 ? '/' + (e.len / unitSec(score)).toFixed(e.len / unitSec(score) % 1 ? 1 : 0) : ''}`;
    }).join(' ');
    rows.push(`${String(b + 1).padStart(2)}  ${chordTxt.padEnd(52)} ${melTxt}`);
  }
  // melodic motion of the tune
  let steps = 0, leaps = 0, repeats = 0;
  for (let i = 1; i < notes.length; i++) {
    const d = Math.abs(notes[i].m - notes[i - 1].m);
    if (d === 0) repeats++; else if (d <= 2) steps++; else leaps++;
  }
  const range = notes.length ? [Math.min(...notes.map((e) => e.m)), Math.max(...notes.map((e) => e.m))] : [0, 0];
  return { rows, nonChord, clashes, strongRatio: strong ? strongIn / strong : 1, steps, leaps, repeats, count: notes.length, range };
}

/** A melodic fingerprint for telling two songs apart: the set of 3-grams of intervals (in semitones) of the tune. */
export function intervalGrams(score, name, n = 3) {
  const st = makeState(score, name);
  const v = score.variants[name];
  const notes = leadParts(v).flatMap(({ p, i }) => partEvents(st, p, i)).filter((e) => !e.echo && e.m !== undefined).sort((a, b) => a.t - b.t);
  const iv = [];
  for (let i = 1; i < notes.length; i++) iv.push(Math.max(-12, Math.min(12, notes[i].m - notes[i - 1].m)));
  const grams = new Set();
  for (let i = 0; i + n <= iv.length; i++) grams.add(iv.slice(i, i + n).join(','));
  return grams;
}

export { pcName };
