// THE UI KIT: the look of what is drawn on the UI layer (engine/uilayer.js) - the HUD (game/hud.js) and the menus (game/menu.js): translucent glass panels with a thin light edge, slim pill gauges, a clean sans type,
// and a few small icons drawn as vectors. Everything takes a Canvas2D context in dp (the layer's layout space, 720 dp high).

// ---- the look ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const FONT = '"SF Pro Display","Segoe UI","Helvetica Neue",Roboto,Inter,system-ui,-apple-system,"Noto Sans",Arial,sans-serif';
export const T = {
  glassTop: 'rgba(30,36,64,0.66)', glassBot: 'rgba(12,15,30,0.74)', edge: 'rgba(255,255,255,0.17)', hi: 'rgba(255,255,255,0.10)',
  text: '#f5f7ff', dim: 'rgba(214,222,255,0.68)', track: 'rgba(255,255,255,0.14)',
  gold0: '#ffe08a', gold1: '#ffb83a', hot: '#ff6a4f', teal0: '#8ff3e6', teal1: '#35c9c0', amber: '#ffb060',
};
export const font = (px, w = 600) => `${w} ${px}px ${FONT}`;
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const ease = (k) => 1 - Math.pow(1 - clamp01(k), 3);

export function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** a glass panel: soft shadow, a gradient fill, a thin light edge and a highlight along its top */
export function panel(c, x, y, w, h, o = {}) {
  const r = o.r ?? 16, a = o.alpha ?? 1;
  c.save();
  c.globalAlpha *= a;
  // (a soft drop shadow made of a few stacked translucent rounded rects: a blurred shadow is far dearer to rasterise)
  for (let i = 3; i >= 1; i--) { rr(c, x - i * 2.5, y + 3 + i * 2, w + i * 5, h + i * 2, r + i * 2.5); c.fillStyle = `rgba(0,0,0,${0.07 + (4 - i) * 0.015})`; c.fill(); }
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, T.glassTop); g.addColorStop(1, T.glassBot);
  rr(c, x, y, w, h, r); c.fillStyle = g; c.fill();
  rr(c, x + 0.5, y + 0.5, w - 1, h - 1, r); c.lineWidth = 1; c.strokeStyle = T.edge; c.stroke();
  c.beginPath(); c.moveTo(x + r, y + 1.5); c.lineTo(x + w - r, y + 1.5); c.lineWidth = 1; c.strokeStyle = T.hi; c.stroke();
  if (o.accent) { rr(c, x + 10, y + 9, 4, h - 18, 2); c.fillStyle = o.accent; c.fill(); }
  c.restore();
}

/** a slim pill gauge: a track, a gradient fill with a soft glow, 0..1 */
export function gauge(c, x, y, w, h, k, o = {}) {
  k = clamp01(k);
  rr(c, x, y, w, h, h / 2); c.fillStyle = T.track; c.fill();
  const fw = Math.max(k > 0 ? h : 0, w * k);
  if (k > 0) {
    c.save();
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, o.c0 || T.gold0); g.addColorStop(1, o.c1 || T.gold1);
    c.globalAlpha = 0.28; rr(c, x - 2.5, y - 2.5, fw + 5, h + 5, h / 2 + 2.5); c.fillStyle = (o.glow || 'rgba(255,184,58,1)').replace(/,\s*[\d.]+\)$/, ',1)'); c.fill(); c.globalAlpha = 1;          // (the glow: a wider, fainter pill behind it; a blurred shadow is far dearer to rasterise)
    rr(c, x, y, fw, h, h / 2); c.fillStyle = g; c.fill();
    c.restore();
  }
  if (o.notch !== undefined) { c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(x + w * o.notch - 0.75, y - 2, 1.5, h + 4); }
}

/** text with a soft shadow; shrinks to fit `max` dp */
export function txt(c, s, x, y, o = {}) {
  let px = o.size ?? 20;
  c.font = font(px, o.weight ?? 600);
  if (o.max) { const w = c.measureText(s).width; if (w > o.max) { px = Math.max(10, Math.floor(px * o.max / w)); c.font = font(px, o.weight ?? 600); } }
  c.textAlign = o.align || 'left';
  if ('letterSpacing' in c) c.letterSpacing = o.track ? `${o.track}px` : '0px';
  if (o.shadow !== false) {                                      // (a drop shadow: the words again, darker, a little lower and, for the big ones, a little wider; a blurred shadow is far dearer to rasterise)
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillText(s, x, y + 2);
    if (px >= 40) { c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillText(s, x, y + 4); c.fillText(s, x + 1.5, y + 3); c.fillText(s, x - 1.5, y + 3); }
  }
  c.fillStyle = o.color || T.text;
  c.fillText(s, x, y);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
  return px;
}
export const measure = (c, s, size, weight = 600, track = 0) => { c.font = font(size, weight); if ('letterSpacing' in c) c.letterSpacing = track ? `${track}px` : '0px'; const w = c.measureText(s).width; if ('letterSpacing' in c) c.letterSpacing = '0px'; return w; };

export function wrap(c, text, maxW, size, weight = 500) {
  c.font = font(size, weight);
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (line && c.measureText(t).width > maxW) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** a cut gem, centred on (x, y), `s` dp across */
export function gemIcon(c, x, y, s, a = '#7fe3ff', b = '#2b86d8') {
  const h = s * 0.5, w = s * 0.5;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  const g = c.createLinearGradient(x, y - h, x, y + h);
  g.addColorStop(0, a); g.addColorStop(1, b);
  c.beginPath(); c.moveTo(x - w * 0.62, y - h * 0.5); c.lineTo(x - w * 0.3, y - h); c.lineTo(x + w * 0.3, y - h); c.lineTo(x + w * 0.62, y - h * 0.5); c.lineTo(x, y + h); c.closePath();
  c.fillStyle = g; c.fill();
  c.shadowColor = 'transparent';
  c.beginPath(); c.moveTo(x - w * 0.62, y - h * 0.5); c.lineTo(x + w * 0.62, y - h * 0.5); c.moveTo(x - w * 0.3, y - h); c.lineTo(x - w * 0.18, y - h * 0.5); c.lineTo(x, y + h); c.moveTo(x + w * 0.3, y - h); c.lineTo(x + w * 0.18, y - h * 0.5); c.lineTo(x, y + h);
  c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,0.45)'; c.stroke();
  c.restore();
}

/** Sparx: a glowing orb with two small wings */
export function sparxIcon(c, x, y, s, col) {
  c.save();
  const g = c.createRadialGradient(x, y, 0, x, y, s * 0.9);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, s * 0.9, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.beginPath(); c.ellipse(x - s * 0.5, y - s * 0.38, s * 0.34, s * 0.16, -0.6, 0, Math.PI * 2); c.ellipse(x + s * 0.5, y - s * 0.38, s * 0.34, s * 0.16, 0.6, 0, Math.PI * 2); c.fill();
  c.restore();
}

/** a lantern's flame: lit or only its ring */
export function flameIcon(c, x, y, s, lit, pulse = 0) {
  c.save();
  if (lit) {
    const g = c.createRadialGradient(x, y, 0, x, y, s * (1.1 + pulse * 0.4));
    g.addColorStop(0, 'rgba(255,214,110,0.95)'); g.addColorStop(0.5, 'rgba(255,160,50,0.35)'); g.addColorStop(1, 'rgba(255,160,50,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, s * (1.1 + pulse * 0.4), 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(x, y - s * 0.62); c.bezierCurveTo(x + s * 0.5, y - s * 0.1, x + s * 0.4, y + s * 0.5, x, y + s * 0.5); c.bezierCurveTo(x - s * 0.4, y + s * 0.5, x - s * 0.5, y - s * 0.1, x, y - s * 0.62); c.closePath();
    const f = c.createLinearGradient(x, y - s * 0.6, x, y + s * 0.5); f.addColorStop(0, '#fff3b0'); f.addColorStop(1, '#ff9a2e');
    c.fillStyle = f; c.fill();
  } else {
    c.beginPath(); c.arc(x, y, s * 0.42, 0, Math.PI * 2); c.lineWidth = 2; c.strokeStyle = 'rgba(214,222,255,0.45)'; c.stroke();
  }
  c.restore();
}

