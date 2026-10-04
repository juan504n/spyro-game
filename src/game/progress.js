// Progress that outlives a page load: which realms are restored, the best gem count of each, what the homeworld's secrets have given up, whether the Guardian's Gate has opened and whether the Guardian is free.
// It lives in localStorage; where storage is unavailable (a private window, a sandboxed frame, a blocked site) the game plays the same and simply forgets.
const KEY = 'gloaming-vale/progress/v1';

const blank = () => ({ realms: {}, home: { visits: 0, secrets: [], gate: false }, guardian: { freed: false, gems: 0, gemsTotal: 0, time: 0, deaths: 0, hits: 0 } });

/** A stored value is untrusted JSON: keep only what has the right shape. */
function sanitize(raw) {
  const p = blank();
  if (!raw || typeof raw !== 'object') return p;
  const num = (v) => (Number.isFinite(+v) && +v >= 0 ? Math.min(+v, 1e6) : 0);
  if (raw.realms && typeof raw.realms === 'object') {
    for (const id of Object.keys(raw.realms).slice(0, 16)) {
      const r = raw.realms[id];
      if (!r || typeof r !== 'object') continue;
      p.realms[String(id).slice(0, 24)] = { done: !!r.done, gems: num(r.gems), gemsTotal: num(r.gemsTotal), time: num(r.time) };
    }
  }
  if (raw.home && typeof raw.home === 'object') {
    p.home.visits = num(raw.home.visits) | 0;
    if (Array.isArray(raw.home.secrets)) p.home.secrets = [...new Set(raw.home.secrets.filter((s) => typeof s === 'string').map((s) => s.slice(0, 32)))].slice(0, 64);
    p.home.gate = !!raw.home.gate;
  }
  if (raw.guardian && typeof raw.guardian === 'object') {
    const q = raw.guardian;
    p.guardian = { freed: !!q.freed, gems: num(q.gems), gemsTotal: num(q.gemsTotal), time: num(q.time), deaths: num(q.deaths) | 0, hits: num(q.hits) | 0 };
  }
  return p;
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch (e) { /* storage unavailable or corrupt JSON */ }
  return blank();
}

export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
}

/** How many realms are restored (the lanterns on the homeworld's HUD). */
export const realmsDone = (p) => Object.values(p.realms).filter((r) => r.done).length;

/** Record a finished realm: it counts as restored for good, the best gem count is kept. */
export function noteRealmDone(p, id, { gems = 0, gemsTotal = 0, time = 0 } = {}) {
  const old = p.realms[id];
  p.realms[id] = { done: true, gems: Math.max(gems, old ? old.gems : 0), gemsTotal: gemsTotal || (old ? old.gemsTotal : 0), time: old && old.time && old.time < time ? old.time : time };
  saveProgress(p);
  return p.realms[id];
}

/** Record a gem count for a realm that is not finished yet (kept if it is the best so far). */
export function noteRealmGems(p, id, gems, gemsTotal) {
  const old = p.realms[id] || { done: false, gems: 0, gemsTotal: 0, time: 0 };
  if (gems <= old.gems && old.gemsTotal) return old;
  p.realms[id] = { ...old, gems: Math.max(gems, old.gems), gemsTotal: gemsTotal || old.gemsTotal };
  saveProgress(p);
  return p.realms[id];
}

/** A secret of the homeworld found (a chest opened, a wall broken): returns true the first time. */
export function noteSecret(p, id) {
  if (p.home.secrets.includes(id)) return false;
  p.home.secrets.push(id);
  saveProgress(p);
  return true;
}

/** The Guardian's Gate has opened (the fifth realm was restored and the hero came home): for good. Returns true the first time. */
export function noteGateOpen(p) {
  if (p.home.gate) return false;
  p.home.gate = true;
  saveProgress(p);
  return true;
}

/** Every realm burns: the gate stands open (or must open at the hero's next homecoming). */
export const allRestored = (p, doors) => doors.length > 0 && doors.every((d) => p.realms[d] && p.realms[d].done);

/** The Guardian is free: the ending was played. What it cost is kept (the best of the visits). */
export function noteGuardianFreed(p, { gems = 0, gemsTotal = 0, time = 0, deaths = 0, hits = 0 } = {}) {
  const old = p.guardian;
  p.guardian = { freed: true, gems: Math.max(gems, old.gems), gemsTotal: gemsTotal || old.gemsTotal, time: old.freed && old.time && old.time < time ? old.time : time, deaths: old.freed ? Math.min(old.deaths, deaths) : deaths, hits: old.freed ? Math.min(old.hits, hits) : hits };
  saveProgress(p);
  return p.guardian;
}
