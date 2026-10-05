// Gloaming Vale audio — the song player: a score (scores/<id>.js, notation in score.js) turned into two time-aligned stereo loops, 'dusk' and
// 'dawn', through the same reverb and master chain as Vale's own tune (mixer.js). Pure DSP (Node + browser).
//
//   SEQUENCE  every part of a variant becomes a list of events { t, m, len, vel, pan, gain, inst ... } (partEvents: pure data, so the tools can
//             draw and check a score without rendering it); the renderer then places the cached sample of each event into the circular mix.
//   MIX       mixer.js: reverb with the loop's own tail as pre-roll, high-cut, compressor, limiter, to -14 dBFS RMS.
//
// PARTS (a variant's `parts` list; every part has `type`, `inst`, `gain` and `pan`, and the ones with a `bars` string play where it says):
//   line   { line: 'tune', bars: 'xxxx....', transpose: 0, follow: .45, echo: { at: 1.5, gain: .2, pan: .4 }, sustain: .97 }
//          a line of the tune (score.lines[line], or the variant's own of that name) on an instrument.
//   pad    { bars, opts: { cut, attack, release, vowel, bright }, pans: [...], voices: [0, 1, 2, 3], octave: 0, pre: .35, follow: .6 }
//          the chord of every bar, held (a sustained instrument).
//   bass   { bars: 'abab...', patterns: { a: [[unit, degree, length, velocity], ...] }, follow: .2, cut: false }
//          degrees R 3 5 7 8 9 L 2 4 6 (score.js degreeInterval); a letter in `bars` picks the pattern of that bar ('.' rests).
//   arp    { bars, patterns: { a: '0.1.2.3.2.1.2.3.' }, octave, vel: [beat, unit, step], follow: .5 }
//          arpeggio: a string of upb*2 steps, each the index of the chord tone to play (0-9 up the voicing, a-e below it).
//   comp   { bars, patterns: { a: [1, 4.5] }, voices: [1, 2, 3], strum: .006, dur: 1, follow: .4 }
//          chord stabs at unit positions of the bar.
//   perc   { tracks: [{ inst: 'kick', gain, pan, bars, patterns: { a: '6.......5.3.....' }, alt: 'woodLo' }], follow: .65 }
//          the rhythm section: digits are velocities, a string of upb*2 steps (sixteenths).
//   events { list: [{ bar: 4, u: 6, notes: ['E6', 'D6'], step: .5, vel: .45, pan: -.3, panStep: .15, len: 2 }] }
//          single notes or little arpeggios by hand (bar is 1-based); `len` (units) is the length of a sustained note or a swell.
//
// A VARIANT is { chords, intensity: '3345...' (a digit per bar, 0-9), wet, alter, scale, parts, ... } (score.js says the rest).

import { SR, RNG, seedOf, rmsOf } from './synth.js';
import { place, makeVerbState, verbChunk, master, PREROLL } from './mixer.js';
import * as I from './instruments.js';
import * as V from './voices.js';
import { parseBar, chordSlots, checkChords, degreeInterval, scaleOf, nameOf, noteOf } from './score.js';

// ---------------------------------------------------------------------------------------------
// The instruments a score can name: make(m, dur, opts) -> mono sample; range = the notes the voice is made for (MIDI)
// ---------------------------------------------------------------------------------------------
export const INSTRUMENTS = {
  celesta: { range: [60, 102], make: (m) => I.celesta(m) },
  musicBox: { range: [60, 102], make: (m) => I.musicBox(m) },
  marimba: { range: [45, 96], make: (m) => I.marimba(m) },
  flute: { sustained: true, range: [60, 98], make: (m, d) => I.flute(m, d) },
  pad: { sustained: true, range: [36, 96], make: (m, d, o) => I.pad(m, d, o) },
  bass: { range: [28, 64], make: (m) => I.bass(m) },
  pizz: { range: [40, 90], make: (m) => I.pizz(m) },
  chime: { range: [72, 108], make: (m) => I.chime(m) },
  harp: { range: [36, 96], make: (m) => V.harp(m) },
  glass: { range: [64, 108], make: (m) => V.glass(m) },
  epiano: { range: [36, 90], make: (m) => V.epiano(m) },
  kalimba: { range: [55, 96], make: (m) => V.kalimba(m) },
  strings: { sustained: true, range: [36, 96], make: (m, d, o) => V.strings(m, d, o) },
  horn: { sustained: true, range: [36, 88], make: (m, d, o) => V.horn(m, d, o) },
  choir: { sustained: true, range: [40, 84], make: (m, d, o) => V.choir(m, d, o) },
  glassharm: { sustained: true, range: [55, 100], make: (m, d, o) => V.glassharm(m, d, o) },
  whistle: { sustained: true, range: [67, 100], make: (m, d, o) => V.whistle(m, d, o) },
  reed: { sustained: true, range: [40, 90], make: (m, d, o) => V.reed(m, d, o) },
  shawm: { sustained: true, range: [55, 96], make: (m, d, o) => V.shawm(m, d, o) },
  subbass: { sustained: true, range: [24, 55], make: (m, d, o) => V.subbass(m, d, o) },
  sawbass: { sustained: true, range: [24, 60], make: (m, d, o) => V.sawbass(m, d, o) },
  timpani: { range: [31, 55], make: (m) => V.timpani(m) },
};

/** Unpitched hits. */
export const KIT = {
  kick: () => I.kick(),
  shaker: () => I.shaker('soft'),
  shakerCrisp: () => I.shaker('crisp'),
  wood: () => I.wood('hi'),
  woodLo: () => I.wood('lo'),
  tomLow: () => I.tom('low'),
  tomMid: () => I.tom('mid'),
  bongoLo: () => I.bongo('lo'),
  bongoHi: () => I.bongo('hi'),
  congaOpen: () => I.conga('open'),
  congaSlap: () => I.conga('slap'),
  tamb: () => I.tambourine(),
  taiko: () => V.taiko(),
  anvil: () => V.anvil(),
  hat: () => V.hat('closed'),
  hatOpen: () => V.hat('open'),
  snare: () => V.snare('snare'),
  brush: () => V.snare('brush'),
  rim: () => V.snare('rim'),
  crash: () => V.crash(),
  triangle: () => V.triangle(96),
};

const SWELLS = new Set(['wave', 'wind', 'riser', 'wash']);

// ---------------------------------------------------------------------------------------------
// Score geometry
// ---------------------------------------------------------------------------------------------
export const unitSec = (score) => 30 / score.bpm;                                        // a unit is an eighth note
export const barSec = (score) => score.upb * unitSec(score);
export const loopSamples = (score) => Math.round(score.bars * score.upb * unitSec(score) * SR);
export const loopSeconds = (score) => loopSamples(score) / SR;
export const variantsOf = (score) => Object.keys(score.variants);
const BUFFERS = ['dusk', 'dawn'];

const isOn = (mask, bar) => mask && mask[bar] === 'x';
const intensityOf = (v, bar, n) => {
  const s = v.intensity;
  const c = Array.isArray(s) ? s[bar] : s ? Number(s[bar]) / 9 : 0.7;
  return Number.isFinite(c) ? c : 0.7;
};

/**
 * Timing "human" wobble as a pure function of WHERE in the tune a note is (bar, position), not of render order: both variants push the same
 * beat late/early by the same few milliseconds, so the day/night crossfade never produces flams between the two versions of the same note.
 */
function hj(bar, pos, amt) {
  let h = Math.imul((bar * 131 + Math.round(pos * 8) * 7 + 12345) | 0, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return amt * (((h >>> 8) / 8388608) - 1);
}

/** The state a variant is sequenced with. */
export function makeState(score, name, bank = new I.Bank()) {
  const v = score.variants[name];
  const upb = score.upb;
  const starts = new Set();
  let u = 0;
  for (const g of score.groups) { starts.add(u); u += g; }
  return {
    score, v, variant: name, id: score.id, bank,
    alter: v.alter || null,
    upb, bars: score.bars, unit: unitSec(score), swing: score.swing || 0, starts,
    N: loopSamples(score),
    rng: new RNG(seedOf(`song-${score.id}-${name}`)),
    slots: chordSlots(score, v),
  };
}

const barTime = (st, bar) => bar * st.upb * st.unit;
const swingU = (st, u) => (st.swing > 0 && Number.isInteger(u) && u % 2 === 1 ? st.swing * st.unit : 0);
/** A sixteenth-note step of the bar: its swing (the off-beat eighths late by the full amount, the odd sixteenths by half of it). */
const swingStep = (st, i) => (st.swing > 0 ? (i % 4 === 2 ? st.swing * st.unit : i % 2 === 1 ? st.swing * st.unit * 0.5 : 0) : 0);
const accentOf = (st, u) => (u === 0 ? 1 : st.starts.has(u) ? 0.88 : 0.78);
const vary = (st, amt) => 1 + st.rng.range(-amt, amt);
const MARK = { '!': 1.15, '~': 0.8, '': 1 };
const follow = (p, d) => (p.follow ?? d);
const lvl = (f, inten) => 1 - f + f * inten;

// ---------------------------------------------------------------------------------------------
// Parts -> events
// ---------------------------------------------------------------------------------------------
const lineOf = (st, key) => (st.v.lines && st.v.lines[key]) || st.score.lines[key];

const PART_EVENTS = {
  line(st, p) {
    const lines = lineOf(st, p.line);
    const out = [];
    let last = null;
    for (let b = 0; b < st.bars; b++) {
      const str = lines[b];
      if (!str || !str.trim()) { last = null; continue; }
      const on = isOn(p.bars, b);
      const inten = intensityOf(st.v, b);
      for (const e of parseBar(str, st.upb, st.alter)) {
        if (e.m === -1) { if (last) last.len += e.len * st.unit; continue; }
        if (!on) { last = null; continue; }
        const t = barTime(st, b) + e.u * st.unit + swingU(st, e.u) + hj(b, e.u, 0.004);
        const vel = accentOf(st, e.u) * MARK[e.mark] * lvl(follow(p, 0.45), inten) * vary(st, 0.05);
        const ev = { t, m: e.m + (p.transpose || 0), len: e.len * st.unit, vel, pan: p.pan ?? 0, gain: p.gain ?? 1, bar: b, u: e.u };
        out.push(ev);
        last = ev;
        if (p.echo) out.push({ ...ev, t: t + p.echo.at * st.unit, vel: vel * p.echo.gain, pan: p.echo.pan ?? -(p.pan ?? 0), echo: true, len: ev.len });
      }
    }
    return out;
  },

  pad(st, p) {
    const out = [];
    const pre = p.pre ?? 0.35;
    const pans = p.pans || [-0.5, -0.17, 0.17, 0.5];
    for (const s of st.slots) {
      if (!isOn(p.bars, s.bar)) continue;
      const inten = intensityOf(st.v, s.bar);
      const idx = p.voices || s.pad.map((_, i) => i);
      idx.forEach((i, k) => {
        if (i >= s.pad.length) return;
        out.push({
          t: barTime(st, s.bar) + s.u * st.unit - pre, m: s.pad[i] + (p.octave || 0), len: s.len * st.unit + pre + 0.15, vel: lvl(follow(p, 0.6), inten),
          pan: pans[k % pans.length], gain: p.gain ?? 1, bar: s.bar, u: s.u, hold: true,
        });
      });
    }
    return out;
  },

  bass(st, p) {
    const out = [];
    for (const s of st.slots) {
      const key = p.bars[s.bar];
      const pat = key && key !== '.' ? p.patterns[key] : null;
      if (!pat) continue;
      const inten = intensityOf(st.v, s.bar);
      for (const [u, deg, len, vel] of pat) {
        const uu = s.u + u;
        out.push({
          t: barTime(st, s.bar) + uu * st.unit + swingU(st, uu) + hj(s.bar, uu, 0.002), m: s.bassNote + degreeInterval(s.c, deg) + (p.octave || 0), len: len * st.unit,
          vel: vel * lvl(follow(p, 0.2), inten) * vary(st, 0.04), pan: p.pan ?? 0, gain: p.gain ?? 0.95, bar: s.bar, u: uu,
        });
      }
    }
    return out;
  },

  arp(st, p) {
    const out = [];
    const acc = p.vel || [1, 0.8, 0.62];
    for (const s of st.slots) {
      const key = p.bars[s.bar];
      const pat = key && key !== '.' ? p.patterns[key] : null;
      if (!pat) continue;
      const inten = intensityOf(st.v, s.bar);
      const n = s.pad.length;
      for (let i = Math.round(s.u * 2); i < Math.round((s.u + s.len) * 2); i++) {
        const ch = pat[i];
        if (ch === '.' || ch === undefined) continue;
        const k = /[0-9]/.test(ch) ? Number(ch) : -(ch.charCodeAt(0) - 96);
        const m = s.pad[((k % n) + n) % n] + 12 * Math.floor(k / n) + (p.octave || 0);
        const u = i / 2;
        const a = Number.isInteger(u) ? (st.starts.has(u) ? acc[0] : acc[1]) : acc[2];
        out.push({
          t: barTime(st, s.bar) + u * st.unit + swingStep(st, i) + hj(s.bar, u, 0.003), m, len: st.unit * 0.5 * (p.legato ?? 1.6),
          vel: a * lvl(follow(p, 0.5), inten) * vary(st, 0.06), pan: (p.pan ?? 0) + (p.spread ?? 0) * (((k % n) + n) % n - (n - 1) / 2) / n, gain: p.gain ?? 1, bar: s.bar, u,
        });
      }
    }
    return out;
  },

  comp(st, p) {
    const out = [];
    for (const s of st.slots) {
      const key = p.bars[s.bar];
      const pat = key && key !== '.' ? p.patterns[key] : null;
      if (!pat) continue;
      const inten = intensityOf(st.v, s.bar);
      const idx = p.voices || s.pad.map((_, i) => i).slice(1);
      for (const u of pat) {
        if (u < s.u || u >= s.u + s.len) continue;
        idx.forEach((i, k) => {
          if (i >= s.pad.length) return;
          out.push({
            t: barTime(st, s.bar) + u * st.unit + swingU(st, u) + k * (p.strum ?? 0.006) + hj(s.bar, u, 0.003), m: s.pad[i] + (p.octave || 0), len: (p.dur ?? 1) * st.unit,
            vel: lvl(follow(p, 0.4), inten) * vary(st, 0.08), pan: (p.pans || [-0.3, 0, 0.3])[k % 3], gain: p.gain ?? 0.4, bar: s.bar, u,
          });
        });
      }
    }
    return out;
  },

  perc(st, p) {
    const out = [];
    for (const tr of p.tracks) {
      for (let b = 0; b < st.bars; b++) {
        const key = tr.bars[b];
        const pat = key && key !== '.' ? tr.patterns[key] : null;
        if (!pat) continue;
        const inten = intensityOf(st.v, b);
        let count = 0;
        for (let i = 0; i < pat.length; i++) {
          const ch = pat[i];
          if (ch === '.') continue;
          const u = i / 2;
          out.push({
            t: barTime(st, b) + u * st.unit + swingStep(st, i) + hj(b, u, 0.003), kit: tr.alt && count % 2 === 1 ? tr.alt : tr.inst, len: 0,
            vel: (Number(ch) / 9) * lvl(follow(tr, follow(p, 0.65)), inten) * vary(st, 0.06), pan: tr.pan ?? 0, gain: tr.gain ?? 1, bar: b, u,
          });
          count++;
        }
      }
    }
    return out;
  },

  events(st, p) {
    const out = [];
    for (const e of p.list) {
      e.notes.forEach((nm, i) => {
        const u = e.u + i * (e.step ?? 0.5);
        const b = e.bar - 1;
        const ev = { t: barTime(st, b) + u * st.unit, len: (e.len ?? 2) * st.unit, vel: (e.vel ?? 1) * vary(st, 0.06), pan: (e.pan ?? 0) + i * (e.panStep ?? 0), gain: p.gain ?? 1, bar: b, u };
        if (nm === 'x') ev.kit = p.inst;                                                   // (an unpitched hit or a swell)
        else ev.m = nm;
        out.push(ev);
      });
    }
    return out;
  },
};

/** The events of one part of a variant: [{ t (s), m (MIDI) | kit (name), len (s), vel, pan, gain, bar, u, ... }]. Pure data (note names of `events` are resolved here). */
export function partEvents(st, p, index = 0) {
  const evs = PART_EVENTS[p.type](st, p);
  for (const e of evs) {
    e.part = index;
    e.inst = p.inst;
    if (typeof e.m === 'string') e.m = noteMidi(e.m, st);
  }
  return evs;
}

const noteMidi = (nm, st) => noteOf(nm, st.alter);

/** Every event of a variant, all parts, in part order. */
export function songEvents(score, name) {
  const st = makeState(score, name);
  return st.v.parts.flatMap((p, i) => partEvents(st, p, i));
}

// ---------------------------------------------------------------------------------------------
// Events -> samples in the mix
// ---------------------------------------------------------------------------------------------
const q05 = (x) => Math.max(0.05, Math.round(x * 20) / 20);
const optKey = (o) => (o ? `${o.cut}:${o.attack}:${o.release}:${o.vowel}:${o.bright}` : '');

function sampleOf(st, p, e) {
  const bank = st.bank;
  if (e.kit !== undefined) {
    if (typeof e.kit === 'string' && e.kit.startsWith('swell:')) {
      const dur = Math.max(0.2, Math.round(e.len * 10) / 10);
      return bank.get(`${e.kit}:${dur}`, () => V.swell(e.kit.slice(6), dur));
    }
    const make = KIT[e.kit];
    return bank.get('kit:' + e.kit, () => make());
  }
  const inst = INSTRUMENTS[e.inst];
  if (inst.sustained) {
    const dur = q05(e.hold ? e.len : e.len * (p.sustain ?? 0.97));
    return bank.get(`${e.inst}:${e.m}:${dur}:${optKey(p.opts)}`, () => inst.make(e.m, dur, p.opts || {}));
  }
  return bank.get(`${e.inst}:${e.m}`, () => inst.make(e.m));
}

/**
 * Place a part's events into the dry mix. A part with a `level` (dB) is gain-staged: it is mixed in, measured, and scaled so that over the bars it
 * plays in its RMS (both channels, dry) is `level` dBFS. How loud an instrument's samples are by themselves therefore never has to be tuned by
 * hand: a lead is about -17, a pad -22, a bass -21, an arpeggio -22, the whole rhythm section -27 (Vale's own tune sits at -17, -21, -21, -25).
 */
function mixPart(st, p, index) {
  const events = partEvents(st, p, index);
  const staged = typeof p.level === 'number';
  const beforeL = staged ? Float32Array.from(st.L) : null;
  const beforeR = staged ? Float32Array.from(st.R) : null;
  for (const e of events) {
    const sample = sampleOf(st, p, e);
    // a plucked bass is cut where its note ends (as Vale's is; `cut: false` lets a drum ring); everything else rings out
    const cut = p.type === 'bass' && !INSTRUMENTS[p.inst].sustained && p.cut !== false ? Math.round(e.len * SR * 1.05) : 0;
    place(st, sample, e.t, e.gain * e.vel, e.pan, cut);
  }
  if (!staged || !events.length) return;
  const { L, R, N } = st;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const a = L[i] - beforeL[i];
    const b = R[i] - beforeR[i];
    sum += a * a + b * b;
  }
  const bars = new Set(events.map((e) => e.bar)).size;
  const rms = Math.sqrt(sum / (2 * bars * st.upb * st.unit * SR));
  if (!(rms > 1e-9)) return;
  const g = Math.pow(10, p.level / 20) / rms;
  for (let i = 0; i < N; i++) {
    L[i] = beforeL[i] + (L[i] - beforeL[i]) * g;
    R[i] = beforeR[i] + (R[i] - beforeR[i]) * g;
  }
}

const PART_WEIGHT = { line: 3, pad: 3, bass: 1, arp: 2, comp: 2, perc: 2, events: 1 };

/**
 * Render jobs of a score (the same kind assetJobs makes): results land in out[names.dusk] / out[names.dawn] as { L, R }.
 * `names` maps the colourings to the buffer names the player looks for. opts.stats: per-part dry RMS in out.stats; opts.variants: ['dusk'] or ['dawn'] makes only that loop.
 */
export function songJobs(score, names, out, opts = {}) {
  const bank = new I.Bank();
  const jobs = [];
  if (opts.stats) out.stats = out.stats || {};
  const N = loopSamples(score);
  for (const name of variantsOf(score)) {
    if (opts.variants && !opts.variants.includes(name)) continue;                           // (opts.variants: only the dusk loop or only the dawn loop)
    const st = makeState(score, name, bank);
    st.L = new Float32Array(N);
    st.R = new Float32Array(N);
    st.wetRatio = st.v.wet ?? 0.55;
    st.reverb = st.v.reverb || score.reverb || 'hall';
    st.sendHp = st.v.sendHp ?? score.sendHp;
    st.lp = st.v.lp ?? score.lp;
    st.comp = st.v.comp || score.comp;
    const add = (label, weight, run) => jobs.push({ name: `song:${score.id}:${name}:${label}`, weight, run });
    st.v.parts.forEach((p, i) => {
      add(`${i}-${p.type}-${p.inst || 'kit'}`, PART_WEIGHT[p.type] ?? 1, () => {
        const before = opts.stats ? Float32Array.from(st.L) : null;
        mixPart(st, p, i);
        if (before) {
          for (let k = 0; k < N; k++) before[k] = st.L[k] - before[k];
          ((out.stats[`${score.id}:${name}`]) ??= {})[`${i}-${p.type}-${p.inst || 'kit'}`] = 20 * Math.log10(rmsOf(before) + 1e-9);
        }
      });
    });
    add('reverb-prep', 1, () => makeVerbState(st));
    const chunks = Math.ceil((N + PREROLL) / (9.5 * SR));
    for (let i = 0; i < chunks; i++) add(`reverb-${i + 1}`, 1.5, () => verbChunk(st, 9.5));
    add('master', 3, function* () {
      yield* master(st);
      out[names[name]] = st.out;
      st.L = st.R = st.send = st.wet = null;                                              // (drop the scratch arrays)
    });
  }
  return jobs;
}

/** Number of reverb chunks and other numbers a job runner may want: the job count of a score. */
export const jobCount = (score) => variantsOf(score).reduce((n, v) => n + score.variants[v].parts.length + 2 + Math.ceil((loopSamples(score) + PREROLL) / (9.5 * SR)), 0);

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------
const PART_TYPES = Object.keys(PART_EVENTS);
const patLetters = (mask) => new Set([...mask].filter((c) => c !== '.'));

/** The structural problems of a score: returns messages (empty = fine). Does not render. */
export function validateScore(score) {
  const bad = [];
  const fail = (m) => bad.push(`${score.id}: ${m}`);
  if (!score.id) return ['a score has no id'];
  if (!(score.bpm >= 40 && score.bpm <= 220)) fail(`bpm ${score.bpm}`);
  if (!Number.isInteger(score.upb) || score.upb < 3 || score.upb > 16) fail(`upb ${score.upb}`);
  if (!Number.isInteger(score.bars) || score.bars < 8 || score.bars > 64) fail(`bars ${score.bars}`);
  if (!Array.isArray(score.groups) || score.groups.reduce((a, b) => a + b, 0) !== score.upb) fail('groups do not add up to upb');
  const names = variantsOf(score || {});
  if (!names.length || names.some((n) => !BUFFERS.includes(n))) fail(`variants must be dusk and/or dawn: ${names}`);
  if (bad.length) return bad;
  const secs = loopSeconds(score);
  if (secs < 20 || secs > 75) fail(`loop is ${secs.toFixed(1)} s (20 to 75 s)`);
  for (const [key, bars] of Object.entries(score.lines || {})) if (!Array.isArray(bars) || bars.length !== score.bars) fail(`line ${key} has ${bars && bars.length} bars, expected ${score.bars}`);
  for (const name of names) {
    const v = score.variants[name];
    const L = `${score.id}/${name}`;
    for (const m of checkChords(score, v, L)) bad.push(m);
    const inten = v.intensity;
    if (!inten || inten.length !== score.bars || (typeof inten === 'string' && /[^0-9]/.test(inten))) fail(`${name}: intensity needs a digit per bar`);
    if (!(v.wet >= 0 && v.wet <= 1.5)) fail(`${name}: wet ${v.wet}`);
    if (!Array.isArray(v.parts) || !v.parts.length) { fail(`${name}: no parts`); continue; }
    let st;
    try { st = makeState(score, name); } catch (e) { fail(`${name}: ${e.message}`); continue; }
    const scale = v.scale ? scaleOf(v.scale) : null;
    v.parts.forEach((p, i) => {
      const where = `${L} part ${i} (${p.type} ${p.inst || ''})`;
      if (!PART_TYPES.includes(p.type)) return fail(`${where}: unknown type`);
      if (p.level !== undefined && !(p.level <= -8 && p.level >= -45)) fail(`${where}: level ${p.level} dB is not between -45 and -8`);
      const maskKey = (m, what) => { if (typeof m !== 'string' || m.length !== score.bars) fail(`${where}: ${what} must be ${score.bars} characters`); };
      if (p.type !== 'perc') {
        if (p.type !== 'events' && !INSTRUMENTS[p.inst]) return fail(`${where}: unknown instrument ${p.inst}`);
        if (p.type === 'events' && !INSTRUMENTS[p.inst] && !KIT[p.inst] && !(String(p.inst).startsWith('swell:') && SWELLS.has(p.inst.slice(6)))) return fail(`${where}: unknown instrument ${p.inst}`);
      }
      if (p.type === 'line') {
        maskKey(p.bars, 'bars');
        if (!lineOf(st, p.line)) return fail(`${where}: no line ${p.line}`);
        if (p.bars && p.bars.length === score.bars && /[^x.]/.test(p.bars)) fail(`${where}: bars may hold x and . only`);
        lineOf(st, p.line).forEach((str, b) => {
          if (!str || !str.trim() || !isOn(p.bars, b)) return;                                  // (only the bars the part plays)
          try {
            const evs = parseBar(str, score.upb, st.alter);
            if (b === 0 && evs[0] && evs[0].m === -1) fail(`${where}: bar 1 starts with a tie`);
            const r = INSTRUMENTS[p.inst].range;
            for (const e of evs) {
              if (e.m === -1) continue;
              const m = e.m + (p.transpose || 0);
              if (m < r[0] || m > r[1]) fail(`${where}: bar ${b + 1} note ${nameOf(m)} is outside ${p.inst}'s range ${nameOf(r[0])}-${nameOf(r[1])}`);
              if (scale && !scale.has(((e.m % 12) + 12) % 12) && !(v.chromatic || []).includes(b + 1)) fail(`${where}: bar ${b + 1} note ${nameOf(e.m)} is outside the scale (${v.scale})`);
            }
          } catch (e) { fail(`${where}: bar ${b + 1}: ${e.message}`); }
        });
      } else if (p.type === 'pad') {
        maskKey(p.bars, 'bars');
        for (const s of st.slots) {
          for (const m of s.pad) {
            const r = INSTRUMENTS[p.inst].range;
            const mm = m + (p.octave || 0);
            if (mm < r[0] || mm > r[1]) { fail(`${where}: chord ${s.c.sym} (bar ${s.bar + 1}) has ${nameOf(mm)} outside ${p.inst}'s range`); break; }
          }
        }
      } else if (p.type === 'bass' || p.type === 'arp' || p.type === 'comp') {
        maskKey(p.bars, 'bars');
        if (typeof p.bars === 'string') for (const c of patLetters(p.bars)) if (!p.patterns || !p.patterns[c]) fail(`${where}: bars use pattern ${c} which is not defined`);
        if (p.type === 'bass') {
          for (const s of st.slots) {
            const key = p.bars[s.bar];
            const pat = key && key !== '.' ? p.patterns[key] : null;
            if (!pat) continue;
            for (const [u, deg, len] of pat) {
              if (u + len > s.len + 1e-9) fail(`${where}: pattern ${key} overruns the ${s.len}-unit chord of bar ${s.bar + 1}`);
              try { degreeInterval(s.c, deg); } catch (e) { fail(`${where}: ${e.message}`); }
              const m = s.bassNote + degreeInterval(s.c, deg) + (p.octave || 0);
              const r = INSTRUMENTS[p.inst].range;
              if (m < r[0] || m > r[1]) fail(`${where}: bar ${s.bar + 1} bass note ${nameOf(m)} is outside ${p.inst}'s range`);
            }
          }
        } else if (p.type === 'arp') {
          for (const [k, pat] of Object.entries(p.patterns || {})) {
            if (pat.length !== score.upb * 2) fail(`${where}: pattern ${k} has ${pat.length} steps, expected ${score.upb * 2}`);
            if (/[^0-9a-e.]/.test(pat)) fail(`${where}: pattern ${k} has a bad step`);
          }
          for (const ev of partEvents(st, p, i)) {
            const r = INSTRUMENTS[p.inst].range;
            if (ev.m < r[0] || ev.m > r[1]) { fail(`${where}: bar ${ev.bar + 1} plays ${nameOf(ev.m)} outside ${p.inst}'s range`); break; }
          }
        } else {
          for (const [k, pat] of Object.entries(p.patterns || {})) for (const u of pat) if (!(u >= 0 && u < score.upb)) fail(`${where}: stab ${u} of pattern ${k} is outside the bar`);
        }
      } else if (p.type === 'perc') {
        if (!Array.isArray(p.tracks) || !p.tracks.length) return fail(`${where}: no tracks`);
        p.tracks.forEach((tr, t) => {
          const w = `${where} track ${t} (${tr.inst})`;
          if (!KIT[tr.inst]) fail(`${w}: unknown kit piece`);
          if (tr.alt && !KIT[tr.alt]) fail(`${w}: unknown alt kit piece`);
          maskKey(tr.bars, 'bars');
          if (typeof tr.bars === 'string') for (const c of patLetters(tr.bars)) if (!tr.patterns || !tr.patterns[c]) fail(`${w}: bars use pattern ${c} which is not defined`);
          for (const [k, pat] of Object.entries(tr.patterns || {})) {
            if (pat.length !== score.upb * 2) fail(`${w}: pattern ${k} has ${pat.length} steps, expected ${score.upb * 2}`);
            if (/[^1-9.]/.test(pat)) fail(`${w}: pattern ${k} has a bad step`);
          }
        });
      } else if (p.type === 'events') {
        for (const e of p.list || []) {
          if (!(e.bar >= 1 && e.bar <= score.bars) || !(e.u >= 0 && e.u < score.upb)) fail(`${where}: event at bar ${e.bar} unit ${e.u} is outside the loop`);
          for (const nm of e.notes) {
            if (nm === 'x') continue;
            try {
              const m = noteMidi(nm, st);
              const r = INSTRUMENTS[p.inst] && INSTRUMENTS[p.inst].range;
              if (r && (m < r[0] || m > r[1])) fail(`${where}: ${nm} is outside ${p.inst}'s range`);
            } catch (err) { fail(`${where}: ${err.message}`); }
          }
        }
      }
    });
  }
  return bad;
}
