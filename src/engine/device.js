// Small browser probes shared by the renderer's defaults and the input layer.

/**
 * Does this device have a touch screen (phones, tablets, touch laptops)? True when the browser reports touch events, touch points
 * or a coarse primary pointer. A device that reports none of them still gets the on-screen controls the moment its first touch
 * arrives (see Input._bind), so a browser that hides its touch support can never leave a phone without a menu button.
 */
export function isTouchDevice() {
  try {
    if (typeof window === 'undefined') return false;
    if ('ontouchstart' in window) return true;
    if ((navigator.maxTouchPoints | 0) > 0) return true;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) return true;
  } catch (e) { /* no window / blocked: treat as no touch */ }
  return false;
}
