// A small log of the last errors and warnings the page produced (uncaught errors, unhandled promise rejections, console.error / console.warn),
// so debug mode can show them: a screenshot of the readout then carries the message that explains a glitch. Installed once, as early as
// possible (main.js), so errors from loading the world are caught as well.
const MAX = 24;
const log = [];
let installed = false;

const text = (v) => {
  try {
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  } catch (e) { return String(v); }
};

export function pushError(kind, message) {
  const line = `${kind}: ${String(message).replace(/\s+/g, ' ').slice(0, 240)}`;
  const last = log[log.length - 1];
  if (last && last.text === line) { last.n++; return; }             // (the same error every frame is one line with a count)
  log.push({ kind, text: line, n: 1 });
  if (log.length > MAX) log.shift();
}

/** The log as display lines, oldest first ("error: x" or "error: x (x12)"). */
export function errorLines() { return log.map((e) => (e.n > 1 ? `${e.text} (x${e.n})` : e.text)); }
/** How many real errors (not warnings) were logged. */
export function errorCount() { return log.reduce((n, e) => n + (e.kind === 'warn' ? 0 : e.n), 0); }
export function clearErrors() { log.length = 0; }

export function installErrorLog() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => pushError('error', e.message || text(e.error)));
  window.addEventListener('unhandledrejection', (e) => pushError('promise', text(e.reason)));
  for (const kind of ['error', 'warn']) {
    const orig = console[kind];
    console[kind] = function (...args) {
      try { pushError(kind, args.map(text).join(' ')); } catch (e) { /* never let logging break logging */ }
      return orig.apply(this, args);
    };
  }
}
