// Gloaming Vale audio — the score format: notes, bars, chords and voicings of a song written as data. Pure (no DSP, no DOM).
//
// A world's song (scores/<id>.js) is plain data: a tempo and a meter, one tune written once in its dusk spelling, and for each of the
// two colourings of the world (dusk: its lanterns are unlit, dawn: they burn) a chord for every bar and a list of parts (a line of
// the tune on an instrument, a pad, a bass, an arpeggio, stabs, a rhythm section, single events). song.js plays it.
//
// NOTATION
//   notes   'A4' 'F#3' 'Bb2' (MIDI: C4 = 60). A plain letter is changed by the colouring's `alter` map ({ F: 1, C: 1 } raises F and C by a
//           semitone in that colouring: the same tune in the other mode); 'C=5' is never changed; 'G+5' is raised by alter['+'] (the
//           lydian #4 of one colouring only); '#' and 'b' are absolute.
//   bars    'A4/3 D5/1 F5/2 E5/2 r/4': tokens of `note/length` (length in units: an eighth note; 0.5 is a sixteenth), `r` is a rest. A bar
//           sums to the meter's `upb` units. A trailing '!' accents a note, '~' softens it; `_/2` holds the previous note two units longer
//           (a tie, also across the barline: it is how a note rings over into the next bar; never in bar 1).
//   chords  'Em' 'Cmaj7' 'D/F#' 'Bsus4' 'Am7' 'G69' ... (QUALITIES): the bass plays the root (or the note after the slash), the pad voices
//           the tones with the smoothest voice leading. A bar with two chords is an array of two (half a bar each) or of any number
//           of [symbol, units] pairs summing to the bar.
//   steps   rhythm patterns are strings of upb*2 steps (a sixteenth each): '.' is a rest, a digit 1-9 the velocity of a hit; arpeggios use
//           the index of the chord tone to play instead of the velocity (see song.js).

export const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const nameOf = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
export const pcName = (pc) => NAMES[((pc % 12) + 12) % 12];

const NOTE_RE = /^([A-G])([#b=+]?)(-?\d)$/;

/** 'A4' 'F#3' 'Bb2' 'C=5' 'G+5' -> MIDI number, with the colouring's alter map applied to plain letters ('+' is its own key). */
export function noteOf(name, alter = null) {
  const m = NOTE_RE.exec(name);
  if (!m) throw new Error('bad note ' + name);
  let n = NOTE_PC[m[1]] + 12 * (Number(m[3]) + 1);
  const acc = m[2];
  if (acc === '#') n += 1;
  else if (acc === 'b') n -= 1;
  else if (acc === '+') n += (alter && alter['+']) || 0;
  else if (acc === '') n += (alter && alter[m[1]]) || 0;
  return n;
}

const EPS = 1e-9;
/**
 * One bar string -> events [{ u, m, len, mark }] (u = units from the start of the bar; m = MIDI or -1 for a tie `_`; mark '!' | '~' | ''), and
 * the sum of the tokens must be `upb` units.
 */
export function parseBar(str, upb, alter = null) {
  const out = [];
  let u = 0;
  for (const raw of String(str).trim().split(/\s+/)) {
    const mark = /[!~]$/.test(raw) ? raw[raw.length - 1] : '';
    const tok = mark ? raw.slice(0, -1) : raw;
    const [nm, l] = tok.split('/');
    const len = Number(l);
    if (!(len > 0)) throw new Error(`bad length in "${raw}"`);
    if (nm === '_') out.push({ u, m: -1, len, mark });
    else if (nm !== 'r') out.push({ u, m: noteOf(nm, alter), len, mark });
    u += len;
  }
  if (Math.abs(u - upb) > EPS) throw new Error(`bar "${str}" sums to ${u}, expected ${upb}`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------------------------
/** The semitones above the root of each chord quality (an interval of 12 or more is an extension: kept above the octave). */
export const QUALITIES = {
  '': [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
  sus2: [0, 2, 7], sus4: [0, 5, 7], 5: [0, 7],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 69: [0, 4, 7, 9, 14],
  7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], mMaj7: [0, 3, 7, 11], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], 9: [0, 4, 7, 10, 14],
  '7sus4': [0, 5, 7, 10], '7b9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15], 'maj7#11': [0, 4, 7, 11, 18], 'add11': [0, 4, 7, 17], m11: [0, 3, 7, 10, 17],
  'sus4add9': [0, 5, 7, 14], 'm7add11': [0, 3, 7, 10, 17], 'maj7add13': [0, 4, 7, 11, 21],
};

const CHORD_RE = /^([A-G])([#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;
const pcOfName = (letter, acc) => (NOTE_PC[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;

/** 'Em9' 'D/F#' 'Bbmaj7' -> { sym, root (pc), bass (pc), tones: [semitones above the root], t3, t5, t7 }. Throws on an unknown symbol. */
export function parseChord(sym) {
  const m = CHORD_RE.exec(sym);
  if (!m) throw new Error('bad chord ' + sym);
  const tones = QUALITIES[m[3]];
  if (!tones) throw new Error(`unknown chord quality "${m[3]}" in ${sym}`);
  const root = pcOfName(m[1], m[2]);
  let bass = root;
  if (m[4]) bass = pcOfName(m[4][0], m[4][1] || '');
  const third = tones.find((t) => t === 3 || t === 4 || t === 2 || t === 5);
  const fifth = tones.find((t) => t === 6 || t === 7 || t === 8);
  const seventh = tones.find((t) => t === 9 || t === 10 || t === 11);
  return { sym, root, bass, tones: [...tones], t3: third ?? 4, t5: fifth ?? 7, t7: seventh ?? fifth ?? 7 };
}

/** The bass-line degrees of a pattern ('R' the bass note, 'L' an octave under it, '8' an octave over, '3' '5' '7' '9' the chord's, '2' '4' '6' the scale's) as semitones above the bass note. */
export function degreeInterval(c, deg) {
  const above = (iv) => ((iv + (c.root - c.bass) + 120) % 12); // (an interval of the chord's root, above the bass note when it is a slash)
  switch (deg) {
    case 'R': return 0;
    case 'L': return -12;
    case '8': return 12;
    case '3': return above(c.t3);
    case '5': return above(c.t5);
    case '7': return above(c.t7);
    case '9': return above(14) + 12 * (c.root === c.bass ? 1 : 0);
    case '2': return above(2);
    case '4': return above(5);
    case '6': return above(9);
    default: throw new Error('bad bass degree ' + deg);
  }
}

/** Place a pitch class in [lo, lo + 12). */
const pcIn = (pc, lo) => lo + ((((pc - lo) % 12) + 12) % 12);

/**
 * The pad's voicing of a chord (MIDI, ascending, `n` voices in [lo, hi]) with the smoothest motion from the voicing before it: the 5th goes
 * first when a chord has more tones than voices, a triad doubles its root; no voice is more than 9 semitones from the next one; no two voices
 * a semitone apart unless the chord itself needs it.
 */
export function voiceChord(c, prev, n = 4, lo = 52, hi = 72) {
  const order = c.tones.map((t) => ({ t, pc: (c.root + t) % 12 }));
  if (order.length > n) {
    // drop the 5th, then the root (the bass has it), keep the colour
    const drop = (pred) => { const i = order.findIndex(pred); if (i >= 0 && order.length > n) order.splice(i, 1); };
    drop((o) => o.t === c.t5 && c.tones.length > 3);
    drop((o) => o.t === 0);
    drop((o) => o.t === c.t5);
    while (order.length > n) order.pop();
  }
  const base = order.map((o) => o.pc);
  const pool = [0, c.t5, c.t3].map((t) => (c.root + t) % 12);                              // what a short chord doubles: root, fifth, third
  // a widening range: the first that holds the chord (a doubled note needs two octaves of room)
  for (let w = 0; w < 6; w++) {
    const L = lo - 3 * w;
    const H = hi + 3 * w;
    const noteCount = (pc) => { let k = 0; for (let m = L; m <= H; m++) if (((m % 12) + 12) % 12 === pc) k++; return k; };
    const list = [...base];
    while (list.length < n) {
      const want = (pc) => list.filter((x) => x === pc).length + 1;
      const pick = pool.find((pc) => noteCount(pc) >= want(pc)) ?? pool[0];
      list.push(pick);
    }
    const r = voiceIn(list, prev, n, L, H);
    if (r) return r;
  }
  throw new Error(`no voicing for ${c.sym} in [${lo}, ${hi}]`);
}

function voiceIn(list, prev, n, lo, hi) {
  const opts = list.map((pc) => {
    const o = [];
    for (let m = lo; m <= hi; m++) if (((m % 12) + 12) % 12 === pc) o.push(m);
    return o;
  });
  if (opts.some((o) => !o.length)) return null;
  const target = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / n);
  const ref = prev && prev.length === n ? prev : target;
  let best = null;
  let bestCost = Infinity;
  const pick = new Array(n);
  const tryAll = (i) => {
    if (i === n) {
      const v = [...pick].sort((a, b) => a - b);
      let cost = 0;
      for (let k = 0; k < n; k++) cost += Math.abs(v[k] - ref[k]);
      for (let k = 1; k < n; k++) {
        const d = v[k] - v[k - 1];
        if (d === 0) return;                                                               // (no doubled note on one pitch)
        if (d > 9) cost += (d - 9) * 3;
        if (d === 1) cost += 6;
      }
      if (prev === null || prev === undefined) cost += 0.5 * Math.abs(v[0] - lo - 2);      // (the first chord sits low in the range)
      if (cost < bestCost - 1e-9) { bestCost = cost; best = v; }
      return;
    }
    for (const m of opts[i]) { pick[i] = m; tryAll(i + 1); }
  };
  tryAll(0);
  return best;
}

/** The bass note of a chord in the octave that starts at `bassLow` (MIDI). */
export const bassNoteOf = (c, bassLow) => pcIn(c.bass, bassLow);
/** The chord's root as a MIDI note at or above the bass note (a slash chord's root sits above its bass). */
export const chordRootAbove = (c, bassNote) => pcIn(c.root, bassNote);

/**
 * The chord slots of a variant, in order: [{ bar, u, len, c (parsed chord), bassNote, pad [MIDI], pcs }]. `variant.chords` has one entry
 * per bar: a symbol, or an array of symbols (equal parts of the bar), or an array of [symbol, units] pairs. `voicings` (symbol -> note
 * names) replaces the computed voicing of a symbol.
 */
export function chordSlots(score, variant) {
  const upb = score.upb;
  const rng = variant.padRange || score.padRange || [52, 72];
  const bassLow = variant.bassLow ?? score.bassLow ?? 36;
  const nv = variant.padVoices ?? 4;
  const slots = [];
  let prev = null;
  variant.chords.forEach((entry, bar) => {
    const list = Array.isArray(entry) ? entry : [entry];
    const parts = list.map((e) => (Array.isArray(e) ? [e[0], Number(e[1])] : [e, upb / list.length]));
    let u = 0;
    for (const [sym, len] of parts) {
      const c = parseChord(sym);
      const fixed = variant.voicings && variant.voicings[sym];
      const pad = fixed ? fixed.map((nm) => noteOf(nm)) : voiceChord(c, prev, nv, rng[0], rng[1]);
      prev = pad;
      slots.push({ bar, u, len, c, bassNote: bassNoteOf(c, bassLow), pad });
      u += len;
    }
  });
  return slots;
}

/** Structural problems of a chords list against the score's meter (for validators): returns messages. */
export function checkChords(score, variant, label) {
  const bad = [];
  if (!Array.isArray(variant.chords) || variant.chords.length !== score.bars) return [`${label}: chords has ${variant.chords && variant.chords.length} entries, expected ${score.bars}`];
  variant.chords.forEach((entry, bar) => {
    const list = Array.isArray(entry) ? entry : [entry];
    let total = 0;
    for (const e of list) {
      const [sym, len] = Array.isArray(e) ? [e[0], Number(e[1])] : [e, score.upb / list.length];
      try { parseChord(sym); } catch (err) { bad.push(`${label}: bar ${bar + 1}: ${err.message}`); }
      if (!(len > 0)) bad.push(`${label}: bar ${bar + 1}: bad chord length`);
      total += len;
    }
    if (Math.abs(total - score.upb) > EPS) bad.push(`${label}: bar ${bar + 1}: chords fill ${total} units, expected ${score.upb}`);
  });
  return bad;
}

/**
 * Wrap a score on the way in: whitespace in bar masks, step patterns and the intensity string is dropped (so they can be written in groups: 'xxxx xxxx ....'),
 * and the score is returned. Every scores/*.js is `export const SCORE = defineScore({ ... })`.
 */
export function defineScore(score) {
  const strip = (s) => (typeof s === 'string' ? s.replace(/\s+/g, '') : s);
  const patterns = (o) => { if (o) for (const k of Object.keys(o)) o[k] = strip(o[k]); };
  for (const v of Object.values(score.variants)) {
    v.intensity = strip(v.intensity);
    for (const p of v.parts) {
      p.bars = strip(p.bars);
      patterns(p.patterns);                                                              // (bass and comp patterns are arrays: left alone)
      for (const tr of p.tracks || []) { tr.bars = strip(tr.bars); patterns(tr.patterns); }
    }
  }
  return score;
}

/** Pitch classes of a scale given as names ('E F# G A B C D'). */
export function scaleOf(str) {
  return new Set(String(str).trim().split(/\s+/).map((n) => pcOfName(n[0], n[1] || '')));
}
