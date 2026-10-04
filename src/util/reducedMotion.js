// reducedMotion — single source of truth for the prefers-reduced-motion
// accessibility gate. Components that bob/float/pulse read this once at
// module load and freeze their idle animation (positions stay, motion stops).
export const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Frame-rate independent ease toward a target (no per-frame allocation).
export function damp01(current, target, lambda, dt) {
  const k = 1 - Math.exp(-lambda * dt)
  return current + (target - current) * k
}
