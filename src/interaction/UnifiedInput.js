// UnifiedInput — the SINGLE activation funnel (Amy 20-feature #19).
//
// Hand tracking + head-gaze + controllers + mouse + touch all converge here.
// There is exactly one interaction model: the head-gaze ray holds a target
// (hq.gaze.current, set by GazeDwell), and ANY confirm gesture — pinch,
// tap, trigger pull, mouse click — activates it. No hand rays, no per-device
// core logic, no duplicated paths (the v3 dead-tap lesson).
//
//   activate(rec, source)  — fire a record's onActivate with UI feedback.
//   source: 'gaze-dwell' | 'pinch' | 'tap' | 'trigger' | 'mouse' | 'touch'
//
// Every activation gets: (1) the spatial UI blip panned by the target's
// world x, (2) the onActivate call in a try/catch that logs a real
// console.error on failure (agent QA reads these).
import * as THREE from 'three'
import { hq } from '../hq.js'
import { record as recordMemory } from '../engine/SessionMemory.js'

const _v = new THREE.Vector3() // module temp: no per-activation allocation

function panFor(rec) {
  try {
    if (rec && rec.object3D) {
      rec.object3D.getWorldPosition(_v)
      return Math.max(-1, Math.min(1, _v.x / 3))
    }
  } catch (e) { /* fall through to center */ }
  return 0
}

function posFor(rec) {
  try {
    if (rec && rec.object3D) {
      rec.object3D.getWorldPosition(_v)
      return [_v.x, _v.y, _v.z]
    }
  } catch (e) { /* no position */ }
  return null
}

export function activate(rec, source = 'unknown') {
  if (!rec || typeof rec.onActivate !== 'function') {
    console.error(`[input] activate(${source}) with no actionable target`)
    return false
  }
  try {
    if (hq.ambience && hq.ambience.blip) hq.ambience.blip(panFor(rec))
  } catch (e) { /* UI cue is non-essential */ }
  try {
    rec.onActivate()
  } catch (e) {
    console.error(`[input] activation failed: ${rec.id} via ${source}:`, e)
    return false
  }
  // Behavioral Cinema Engine: every activation is a real INTERACTED event.
  try {
    recordMemory('INTERACT', { source, target: rec.id, position: posFor(rec) })
  } catch (e) { /* memory is non-essential */ }
  return true
}

// Convenience: activate whatever the head-gaze currently holds.
export function activateGazed(source = 'unknown') {
  const g = hq.gaze && hq.gaze.current
  if (!g) return false
  return activate(g, source)
}
