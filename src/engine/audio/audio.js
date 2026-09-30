// Gloaming Vale audio — runtime API (WebAudio). This is the only file that touches the browser.
//
//   import { audio } from './engine/audio/audio.js';
//   await audio.init(p => bar.style.width = p * 100 + '%');   // from a user gesture (e.g. PRESS START)
//   audio.startMusic(); audio.setDay(0.3); audio.sfx('gem_red', { pitch: 1.05, pan: -0.3 });
//
// All sound is synthesized at startup by the pure-DSP core (assets.js and friends) at 22050 Hz and
// handed to WebAudio as AudioBuffers (the browser resamples to the device rate). Rendering is sliced
// into small jobs with time-boxed yields so the page stays responsive; total main-thread cost is
// roughly 1-2 s on a desktop machine. Every public method is safe to call at any time: before init,
// after a failed init, or with unknown names it is a silent no-op (unknown names warn once).
//
// Signal graph (all gains smoothed with setTargetAtTime / linear ramps, never stepped):
//
//   gloaming ─ gain cos(day) ┐
//   daybreak ─ gain sin(day) ┤
//   amb_dusk ─ gain cos(day) ┼─> musicMix ─> userDuck ─> stingerDuck ─┐
//   amb_day  ─ gain sin(day) ┘                                        ├─> musicVol ─┐
//   stinger (one-shot) ─ stingerGain ─────────────────────────────────┘             │
//   sfx voices (pooled gain+pan chains) / loops ─> sfxBus ─> sfxVol ────────────────┼─> master
//   master ─> muffle (low-pass, pause/underwater) ─┐
//   UI sounds ─> uiBus ─> uiVol ─> uiMaster (bypass the muffle) ─┴─> preLimit(x0.5) ─> soft-clip WaveShaper ─> out
//
// Levels: one-shots are rendered at -2 dBFS peak and played at exactly `vol` (no hidden per-sound trim,
// see SFX_TRIM in sfx.js); music is about -14 dBFS RMS. One-shot voices: every trigger makes a fresh (cheap, single-use) AudioBufferSourceNode but re-uses
// pooled gain/pan nodes; there is a global voice cap plus a per-name cap (oldest voice is faded out in
// 12 ms and stolen), and near-simultaneous triggers of the same sound are level-compensated so a
// burst of 20 gems cannot stack into a clipped spike.

import { SR, softLimit } from './synth.js';
import { assetJobs, STINGER_NAMES } from './assets.js';
import { SFX_NAMES, LOOP_NAMES, trimOf } from './sfx.js';
import { clearInstrumentCache } from './instruments.js';

const MAX_VOICES = 48;
const PER_NAME_CAP = { gem_red: 10, gem_green: 10, gem_blue: 10, gem_gold: 8, gem_purple: 6, footstep_a: 3, footstep_b: 3, footstep_c: 3, footstep_stone: 3, dialog_blip: 6, ui_move: 3 };
const DEFAULT_CAP = 6;
const AMB_LEVEL = 0.85; // ambience beds (PCM already about -26 dBFS RMS) relative gain
const STINGER_DUCK = { lantern: 0.5, sunrise: 0.7, complete: 0.65, gameover: 0.6 }; // music level reduction while a stinger plays
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
/** Menu / dialog sounds: routed around the pause-menu muffle so the UI stays crisp while the world is muffled. */
const UI_SFX = new Set(['ui_move', 'ui_select', 'ui_back', 'ui_start', 'dialog_open', 'dialog_blip', 'pause', 'unpause', 'count_tick', 'tally_done']);
/** Finite number or the default (so a NaN from game code can never reach an AudioParam). */
const num = (v, d) => (Number.isFinite(v) ? v : d);

/** ctx.resume() that tolerates old browsers returning undefined instead of a promise. */
function tryResume() {
  try {
    const p = S.ctx && S.ctx.state !== 'running' ? S.ctx.resume() : null;
    if (p && p.catch) p.catch(() => {});
    return p || Promise.resolve();
  } catch (e) {
    return Promise.resolve();
  }
}

const S = {
  ctx: null,
  ready: false,
  failed: false,
  initPromise: null,
  buffers: new Map(),
  n: {}, // graph nodes
  pools: { world: [], ui: [] }, // pooled { g, p, pool } gain+pan pairs, one pool per destination bus
  voices: [], // active one-shots
  recent: new Map(), // name -> { t, n } for burst compensation
  music: null, // { srcs: [], gains: {}, t0 }
  day: 0,
  dayAt: 0,
  dayTimer: 0,
  vol: { master: 1, music: 1, sfx: 1 },
  muted: false,
  muffled: false,
  warned: new Set(),
  seed: 0x9e3779b9,
  stingerEnd: 0,
  fading: null,
};

/** Tiny xorshift so runtime variation (jitter, loop phase) is reproducible for a given call order. */
function rand() {
  let x = S.seed;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  S.seed = x >>> 0;
  return S.seed / 4294967296;
}

function warnOnce(kind, name) {
  const key = kind + ':' + name;
  if (S.warned.has(key)) return;
  S.warned.add(key);
  if (typeof console !== 'undefined') console.warn(`[audio] ${kind} "${name}"`);
}

// ---------------------------------------------------------------------------------------------
// Startup: yielding scheduler
// ---------------------------------------------------------------------------------------------
let yieldCount = 0;
function yieldToBrowser() {
  // MessageChannel yields have no 4 ms timer clamp; every 8th yield uses a real setTimeout(0) so
  // timers and rendering also get a turn.
  if (++yieldCount % 8 !== 0 && typeof MessageChannel === 'function') {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        ch.port1.close();
        resolve();
      };
      ch.port2.postMessage(0);
    });
  }
  return new Promise((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------------------------
function limiterCurve() {
  const n = 2049;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = softLimit(((i / (n - 1)) * 2 - 1) * 2, 0.6, 0.92);
  return c;
}

function buildGraph(ctx) {
  const g = (v = 1) => {
    const node = ctx.createGain();
    node.gain.value = v;
    return node;
  };
  const n = S.n;
  n.master = g(1);
  n.muffle = ctx.createBiquadFilter();
  n.muffle.type = 'lowpass';
  n.muffle.Q.value = 0.8;
  n.muffle.frequency.value = ctx.sampleRate * 0.49;
  n.preLimit = g(0.5);
  n.shaper = ctx.createWaveShaper();
  n.shaper.curve = limiterCurve();
  n.shaper.oversample = '2x';
  n.master.connect(n.muffle).connect(n.preLimit).connect(n.shaper).connect(ctx.destination);
  // UI path: same volumes, but it joins after the muffle filter
  n.uiMaster = g(1);
  n.uiVol = g(S.vol.sfx);
  n.uiBus = g(1);
  n.uiBus.connect(n.uiVol).connect(n.uiMaster).connect(n.preLimit);

  n.musicVol = g(S.vol.music);
  n.musicVol.connect(n.master);
  n.stingerDuck = g(1);
  n.userDuck = g(1);
  n.musicMix = g(0);
  n.musicMix.connect(n.userDuck).connect(n.stingerDuck).connect(n.musicVol);
  n.stingerBus = g(1);
  n.stingerBus.connect(n.musicVol);

  n.sfxVol = g(S.vol.sfx);
  n.sfxVol.connect(n.master);
  n.sfxBus = g(1);
  n.sfxBus.connect(n.sfxVol);
}

function makeChain(kind) {
  const ctx = S.ctx;
  const dest = kind === 'ui' ? S.n.uiBus : S.n.sfxBus;
  const gn = ctx.createGain();
  let p = null;
  if (ctx.createStereoPanner) {
    p = ctx.createStereoPanner();
    gn.connect(p).connect(dest);
  } else gn.connect(dest);
  return { g: gn, p, pool: S.pools[kind] };
}

const acquireChain = (kind) => S.pools[kind].pop() || makeChain(kind);
function releaseChain(c) {
  try {
    c.g.gain.cancelScheduledValues(0);
  } catch (e) { /* ignore */ }
  c.pool.push(c);
}

// ---------------------------------------------------------------------------------------------
// PCM -> AudioBuffer
// ---------------------------------------------------------------------------------------------
function toAudioBuffer(data) {
  const ctx = S.ctx;
  const chans = data instanceof Float32Array ? [data] : [data.L, data.R];
  const rate = data.sr || SR;         // (most assets are 22.05 kHz; the gem chimes are rendered at 48 kHz)
  let buf;
  try {
    buf = ctx.createBuffer(chans.length, chans[0].length, rate);
    for (let c = 0; c < chans.length; c++) buf.copyToChannel(chans[c], c);
  } catch (e) {
    // rate not supported by this browser: resample to the context rate ourselves (linear)
    const ratio = ctx.sampleRate / rate;
    const n = Math.round(chans[0].length * ratio);
    buf = ctx.createBuffer(chans.length, n, ctx.sampleRate);
    for (let c = 0; c < chans.length; c++) {
      const out = new Float32Array(n);
      const src = chans[c];
      for (let i = 0; i < n; i++) {
        const p = i / ratio;
        const k = Math.min(src.length - 2, p | 0);
        out[i] = src[k] + (src[k + 1] - src[k]) * (p - k);
      }
      buf.copyToChannel(out, c);
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------------------------
// One-shot voices
// ---------------------------------------------------------------------------------------------
function stealVoice(v) {
  const t = S.ctx.currentTime;
  try {
    const gn = v.chain.g.gain;
    gn.cancelScheduledValues(t);
    gn.setValueAtTime(gn.value, t);
    gn.linearRampToValueAtTime(0, t + 0.012);
    v.src.stop(t + 0.015);
  } catch (e) { /* already ended */ }
}

function playOneShot(name, buf, o) {
  const ctx = S.ctx;
  const now = ctx.currentTime;
  // burst compensation: many identical triggers inside 30 ms would add coherently
  let comp = 1;
  const r = S.recent.get(name);
  if (r && now - r.t < 0.03) {
    r.n++;
    comp = 1 / Math.sqrt(1 + r.n * 0.6);
  } else S.recent.set(name, { t: now, n: 0 });
  // voice cap: per-name first, then global (steal the oldest audible voice); stolen voices fade out in 12 ms
  const cap = PER_NAME_CAP[name] ?? DEFAULT_CAP;
  let active = 0;
  let same = 0;
  let oldest = null;
  let oldestSame = null;
  for (const v of S.voices) {
    if (v.stolen) continue;
    active++;
    if (!oldest) oldest = v;
    if (v.name === name) {
      same++;
      if (!oldestSame) oldestSame = v;
    }
  }
  if (same >= cap && oldestSame) {
    oldestSame.stolen = true;
    stealVoice(oldestSame);
    active--;
    if (oldest === oldestSame) oldest = S.voices.find((x) => !x.stolen) || null;
  }
  if (active >= MAX_VOICES && oldest) {
    oldest.stolen = true;
    stealVoice(oldest);
  }
  if (S.voices.length >= MAX_VOICES * 2) return null; // hard ceiling on live nodes (stolen ones are still fading out)
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const rate = clamp(o.pitch * (1 + o.jitter * (rand() * 2 - 1)), 0.1, 8);
  src.playbackRate.value = rate;
  const chain = acquireChain(UI_SFX.has(name) ? 'ui' : 'world');
  chain.g.gain.setValueAtTime(o.vol * trimOf(name) * comp, now);
  if (chain.p) chain.p.pan.setValueAtTime(clamp(o.pan, -1, 1), now);
  src.connect(chain.g);
  const voice = { name, src, chain, stolen: false };
  S.voices.push(voice);
  src.onended = () => {
    const i = S.voices.indexOf(voice);
    if (i >= 0) S.voices.splice(i, 1);
    try {
      src.disconnect();
    } catch (e) { /* ignore */ }
    releaseChain(chain);
  };
  src.start(now);
  return voice;
}

const NOOP_LOOP = Object.freeze({ set() {}, stop() {} });

// ---------------------------------------------------------------------------------------------
// Music / day-night crossfade
// ---------------------------------------------------------------------------------------------
/** Smoothly move an AudioParam to `v` (drops future events first so per-frame calls never pile up). */
function retarget(param, v, t, tc) {
  param.cancelScheduledValues(t);
  param.setTargetAtTime(v, t, tc);
}

function dayGains(t) {
  const a = t * Math.PI * 0.5;
  return { night: Math.cos(a), day: Math.sin(a) };
}

function applyDay() {
  const m = S.music;
  if (!m || !S.ctx) return;
  const { night, day } = dayGains(S.day);
  const now = S.ctx.currentTime;
  retarget(m.gains.gloaming.gain, night, now, 0.15);
  retarget(m.gains.daybreak.gain, day, now, 0.15);
  retarget(m.gains.amb_dusk.gain, night * AMB_LEVEL, now, 0.25);
  retarget(m.gains.amb_day.gain, day * AMB_LEVEL, now, 0.25);
}

function killMusicNodes(m, at) {
  for (const s of m.srcs) {
    try {
      s.stop(at);
      s.onended = () => {
        try { s.disconnect(); } catch (e) { /* ignore */ }
      };
    } catch (e) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------
export const audio = {
  /**
   * Create the AudioContext and render every sound. Call from a user gesture. Idempotent: repeated
   * calls return the same promise. onProgress(0..1) is called as jobs complete. Never rejects.
   */
  init(onProgress) {
    if (S.initPromise) return S.initPromise;
    const p = (async () => {
      const report = (p) => {
        try {
          if (onProgress) onProgress(p);
        } catch (e) { /* the game's callback must not break audio */ }
      };
      try {
        const Ctx = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
        if (!Ctx) throw new Error('WebAudio is not available');
        S.ctx = new Ctx({ latencyHint: 'interactive' });
        buildGraph(S.ctx);
        tryResume();
        if (typeof document !== 'undefined') {
          const kick = () => tryResume();
          for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, kick, { passive: true });
        }
        const out = {};
        const jobs = assetJobs(out);
        let total = 0;
        for (const j of jobs) total += j.weight;
        let done = 0;
        let sliceStart = performance.now();
        report(0);
        for (const job of jobs) {
          try {
            const it = job.run();
            if (it && typeof it.next === 'function') {
              // generator job: it yields between steps, so hand control back to the browser mid-job
              for (let step = it.next(); !step.done; step = it.next()) {
                if (performance.now() - sliceStart > 10) {
                  await yieldToBrowser();
                  sliceStart = performance.now();
                }
              }
            }
          } catch (e) {
            warnOnce('render failed for', job.name + ': ' + (e && e.message));
          }
          for (const k of Object.keys(out)) {
            if (!S.buffers.has(k) && out[k] && (out[k] instanceof Float32Array || out[k].L)) {
              try {
                S.buffers.set(k, toAudioBuffer(out[k]));
              } catch (e) {
                warnOnce('buffer failed for', k);
              }
              delete out[k]; // release the PCM as soon as the AudioBuffer owns a copy
            }
          }
          done += job.weight;
          report(Math.min(0.999, done / total));
          if (performance.now() - sliceStart > 10) {
            await yieldToBrowser();
            sliceStart = performance.now();
          }
        }
        clearInstrumentCache();
        S.ready = S.buffers.has('gloaming') && S.buffers.has('daybreak');
        S.failed = !S.ready;
      } catch (e) {
        S.failed = true;
        S.ready = false;
        warnOnce('init failed', e && e.message);
      }
      if (S.failed) {
        // leave nothing half-built behind and allow a later init() (e.g. from another gesture) to retry
        try {
          if (S.ctx && S.ctx.close) S.ctx.close();
        } catch (e) { /* ignore */ }
        S.ctx = null;
        S.buffers.clear();
        S.n = {};
        S.pools.world.length = 0;
        S.pools.ui.length = 0;
      }
      report(1);
    })();
    S.initPromise = p;
    p.then(() => {
      if (S.failed && S.initPromise === p) S.initPromise = null; // a later init() may retry
    });
    return p;
  },

  /** context.resume() helper — safe anytime; resolves even when there is no context. */
  resume() {
    return tryResume();
  },

  /** Play a one-shot. opts: { vol = 1, pitch = 1 (playback rate), pan = 0 (-1..1), jitter = 0 (+/- pitch fraction) } */
  sfx(name, opts) {
    try {
      if (!S.ready || S.muted) return;
      if (S.ctx.state !== 'running') return void tryResume(); // suspended (no gesture yet): drop stale one-shots instead of queueing a burst
      const o = opts || {};
      if (name === 'footstep') name = ['footstep_a', 'footstep_b', 'footstep_c'][Math.floor(rand() * 3)];
      const buf = S.buffers.get(name);
      if (!buf) return warnOnce('unknown sfx', name);
      playOneShot(name, buf, { vol: Math.max(0, num(o.vol, 1)), pitch: num(o.pitch, 1), pan: num(o.pan, 0), jitter: Math.max(0, num(o.jitter, 0)) });
    } catch (e) { /* never throw into the game loop */ }
  },

  /**
   * Start a seamless loop; returns { set({ vol, pitch, pan }) (smoothed), stop(fadeSec = 0.1) }.
   * Starts at a random offset so several instances never phase-lock.
   */
  loop(name, opts) {
    try {
      if (!S.ready) return NOOP_LOOP;
      const buf = S.buffers.get(name);
      if (!buf) {
        warnOnce('unknown loop', name);
        return NOOP_LOOP;
      }
      const ctx = S.ctx;
      const o = opts || {};
      const trim = trimOf(name);
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = clamp(num(o.pitch, 1), 0.1, 8);
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0, now);
      gn.gain.linearRampToValueAtTime(Math.max(0, num(o.vol, 1)) * trim, now + 0.03);
      let pn = null;
      if (ctx.createStereoPanner) {
        pn = ctx.createStereoPanner();
        pn.pan.value = clamp(num(o.pan, 0), -1, 1);
      }
      src.connect(gn);
      if (pn) gn.connect(pn).connect(S.n.sfxBus);
      else gn.connect(S.n.sfxBus);
      src.start(now, rand() * buf.duration);
      let stopped = false;
      return {
        set(p) {
          if (stopped || !p) return;
          try {
            const t = ctx.currentTime;
            if (Number.isFinite(p.vol)) retarget(gn.gain, Math.max(0, p.vol) * trim, t, 0.04);
            if (Number.isFinite(p.pitch)) retarget(src.playbackRate, clamp(p.pitch, 0.1, 8), t, 0.05);
            if (Number.isFinite(p.pan) && pn) retarget(pn.pan, clamp(p.pan, -1, 1), t, 0.04);
          } catch (e) { /* ignore */ }
        },
        stop(fadeSec = 0.1) {
          if (stopped) return;
          stopped = true;
          try {
            const t = ctx.currentTime;
            const f = Math.max(0.005, fadeSec);
            gn.gain.cancelScheduledValues(t);
            gn.gain.setValueAtTime(gn.gain.value, t);
            gn.gain.linearRampToValueAtTime(0, t + f);
            src.stop(t + f + 0.02);
            src.onended = () => {
              try {
                src.disconnect();
                gn.disconnect();
                if (pn) pn.disconnect();
              } catch (e) { /* ignore */ }
            };
          } catch (e) { /* ignore */ }
        },
      };
    } catch (e) {
      return NOOP_LOOP;
    }
  },

  /** Start both music variants and both ambience beds (sample-aligned), faded in over 1.2 s. */
  startMusic() {
    try {
      if (!S.ready || S.music) return;
      const ctx = S.ctx;
      if (S.fading) {
        killMusicNodes(S.fading, ctx.currentTime); // a previous stopMusic() is still fading out: cut it now
        S.fading = null;
      }
      const t0 = ctx.currentTime + 0.06;
      const m = { srcs: [], gains: {} };
      for (const name of ['gloaming', 'daybreak', 'amb_dusk', 'amb_day']) {
        const buf = S.buffers.get(name);
        if (!buf) continue;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gn = ctx.createGain();
        gn.gain.value = 0;
        src.connect(gn).connect(S.n.musicMix);
        src.start(t0);
        m.srcs.push(src);
        m.gains[name] = gn;
      }
      S.music = m;
      const { night, day } = dayGains(S.day);
      m.gains.gloaming.gain.value = night;
      m.gains.daybreak.gain.value = day;
      m.gains.amb_dusk.gain.value = night * AMB_LEVEL;
      m.gains.amb_day.gain.value = day * AMB_LEVEL;
      const mg = S.n.musicMix.gain;
      mg.cancelScheduledValues(ctx.currentTime);
      mg.setValueAtTime(0, ctx.currentTime);
      mg.linearRampToValueAtTime(1, t0 + 1.2);
    } catch (e) { /* ignore */ }
  },

  stopMusic(fadeSec = 1) {
    try {
      const m = S.music;
      if (!m || !S.ctx) return;
      S.music = null;
      const ctx = S.ctx;
      const t = ctx.currentTime;
      const f = Math.max(0.02, fadeSec);
      const mg = S.n.musicMix.gain;
      mg.cancelScheduledValues(t);
      mg.setValueAtTime(mg.value, t);
      mg.linearRampToValueAtTime(0, t + f);
      S.fading = m;
      killMusicNodes(m, t + f + 0.05);
    } catch (e) { /* ignore */ }
  },

  /** 0 = gloaming (moonlit twilight) .. 1 = daybreak (bright sunrise); equal-power crossfade, safe every frame. */
  setDay(t) {
    try {
      t = clamp(Number(t) || 0, 0, 1);
      if (t === S.day && S.dayTimer === 0) return;
      S.day = t;
      if (!S.music) return;
      const now = performance.now();
      if (now - S.dayAt >= 50) {
        S.dayAt = now;
        applyDay();
      } else if (!S.dayTimer) {
        S.dayTimer = setTimeout(() => {
          S.dayTimer = 0;
          S.dayAt = performance.now();
          applyDay();
        }, 50 - (now - S.dayAt));
      }
    } catch (e) { /* ignore */ }
  },

  /** 'lantern' | 'sunrise' | 'complete' | 'gameover' — plays the jingle and ducks the music while it runs. */
  stinger(name) {
    try {
      if (!S.ready) return;
      if (S.ctx.state !== 'running') return void tryResume();
      const buf = S.buffers.get('stinger_' + name);
      if (!buf) return warnOnce('unknown stinger', name);
      const ctx = S.ctx;
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(S.n.stingerBus);
      src.onended = () => {
        try { src.disconnect(); } catch (e) { /* ignore */ }
      };
      src.start(now);
      const amt = STINGER_DUCK[name] ?? 0.5;
      const end = Math.max(S.stingerEnd, now + buf.duration);
      S.stingerEnd = end;
      const g = S.n.stingerDuck.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(1 - amt, now + 0.08);
      g.setValueAtTime(1 - amt, Math.max(now + 0.1, end - 1.2));
      g.linearRampToValueAtTime(1, end + 0.3);
    } catch (e) { /* ignore */ }
  },

  /** Lower the music by `amount` (0..1) for `seconds`, then restore (e.g. while a character speaks). */
  duck(amount = 0.5, seconds = 1) {
    try {
      if (!S.ctx) return;
      const t = S.ctx.currentTime;
      const target = 1 - clamp(Number(amount) || 0, 0, 1);
      const hold = Math.max(0.05, Number(seconds) || 0);
      const g = S.n.userDuck.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(target, t + 0.06);
      g.setValueAtTime(target, t + hold);
      g.linearRampToValueAtTime(1, t + hold + 0.5);
    } catch (e) { /* ignore */ }
  },

  /** Low-pass the whole output (pause menu / underwater feel), smoothly. Menu/dialog sounds bypass it. */
  setMuffled(on) {
    try {
      S.muffled = !!on;
      if (!S.ctx) return;
      S.n.muffle.frequency.setTargetAtTime(S.muffled ? 650 : S.ctx.sampleRate * 0.49, S.ctx.currentTime, 0.08);
    } catch (e) { /* ignore */ }
  },

  /** Any subset of { master, music, sfx }, each 0..1. */
  setVolumes(v) {
    try {
      if (!v) return;
      for (const k of ['master', 'music', 'sfx']) if (v[k] !== undefined) S.vol[k] = clamp(Number(v[k]) || 0, 0, 1);
      if (!S.ctx) return;
      const t = S.ctx.currentTime;
      S.n.musicVol.gain.setTargetAtTime(S.vol.music, t, 0.03);
      S.n.sfxVol.gain.setTargetAtTime(S.vol.sfx, t, 0.03);
      S.n.uiVol.gain.setTargetAtTime(S.vol.sfx, t, 0.03);
      S.n.master.gain.setTargetAtTime(S.muted ? 0 : S.vol.master, t, 0.03);
      S.n.uiMaster.gain.setTargetAtTime(S.muted ? 0 : S.vol.master, t, 0.03);
    } catch (e) { /* ignore */ }
  },

  setMuted(on) {
    try {
      S.muted = !!on;
      if (!S.ctx) return;
      S.n.master.gain.setTargetAtTime(S.muted ? 0 : S.vol.master, S.ctx.currentTime, 0.03);
      S.n.uiMaster.gain.setTargetAtTime(S.muted ? 0 : S.vol.master, S.ctx.currentTime, 0.03);
    } catch (e) { /* ignore */ }
  },

  get muted() {
    return S.muted;
  },
  get ready() {
    return S.ready;
  },

  // ---- additions beyond the required contract (read-only conveniences) ----
  /** Names accepted by sfx() / loop() / stinger(), and the AudioContext (null before init). */
  get sfxNames() {
    return [...SFX_NAMES.filter((n) => !LOOP_NAMES.includes(n)), 'footstep'];
  },
  get loopNames() {
    return [...LOOP_NAMES];
  },
  get stingerNames() {
    return [...STINGER_NAMES];
  },
  get context() {
    return S.ctx;
  },
  /** Testing hook: graph nodes, live voice count and loaded buffer names. */
  get _debug() {
    const gains = S.music ? Object.fromEntries(Object.entries(S.music.gains).map(([k, g]) => [k, g.gain.value])) : null;
    return { nodes: S.n, voices: S.voices.filter((v) => !v.stolen).length, voicesTotal: S.voices.length, pooled: S.pools.world.length + S.pools.ui.length, buffers: [...S.buffers.keys()], failed: S.failed, gains, day: S.day };
  },
};

export default audio;
