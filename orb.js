/*!
 * Orb — a voice agent visualiser. MIT © 2026 Yagnik Barasiya
 * https://github.com/YagnikBarasiya23/orb-voice-visualizer
 */

/**
 * Motion per state. `speed` is how fast the surface noise flows, `displace`
 * how deep it cuts, `glow` the halo strength and `react` how much audio moves it.
 */
export const STATES = {
  idle: { speed: 0.35, displace: 0.1, glow: 0.25, react: 0.3 },
  listening: { speed: 0.9, displace: 0.16, glow: 0.45, react: 1 },
  thinking: { speed: 2.2, displace: 0.2, glow: 0.35, react: 0.2 },
  speaking: { speed: 1.2, displace: 0.14, glow: 0.55, react: 1 },
};

export const DEFAULT_COLORS = {
  idle: ['#4c8dff', '#a06bff'],
  listening: ['#2e8cff', '#2fd3a7'],
  thinking: ['#a06bff', '#ff5fa2'],
  speaking: ['#ff5fa2', '#ffb347'],
};

/** Root mean square of a signal in −1…1. */
export function rms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const v of samples) sum += v * v;
  return Math.sqrt(sum / samples.length);
}

/**
 * Loudness 0–1 from an AnalyserNode byte buffer, where 128 is silence. Speech
 * sits around 0.05–0.25 RMS, so it is scaled up by `gain` and clamped.
 */
export function levelFromBytes(bytes, gain = 4) {
  if (!bytes.length) return 0;
  let sum = 0;
  for (const b of bytes) {
    const v = (b - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / bytes.length) * gain);
}

/** One step of a damped spring (critically damped by default: damping ≈ 2√stiffness). */
export function stepSpring(state, target, dt, stiffness = 170, damping = 26) {
  const v = state.v + (stiffness * (target - state.x) - damping * state.v) * dt;
  return { x: state.x + v * dt, v };
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Blends two parameter sets; numbers and number arrays are interpolated. */
export function blendParams(from, to, t) {
  const k = Math.min(1, Math.max(0, t));
  const out = {};
  for (const key of Object.keys(to)) {
    const a = from[key];
    const b = to[key];
    out[key] = Array.isArray(b) ? b.map((v, i) => lerp(a[i], v, k)) : lerp(a, b, k);
  }
  return out;
}

/** '#4c8dff' or '#48f' → [r, g, b] in 0–1. */
export function parseColor(hex) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!match) throw new TypeError(`Orb: "${hex}" is not a hex colour`);
  let h = match[1];
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
}

/** An array colours every state; an object overrides the defaults per state. */
export function resolveColors(colors) {
  if (Array.isArray(colors)) return Object.fromEntries(Object.keys(STATES).map(state => [state, colors]));
  return { ...DEFAULT_COLORS, ...(colors ?? {}) };
}
