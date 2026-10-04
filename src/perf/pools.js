// pools.js — shared scratch objects for the frame loop. GC pauses are
// frame killers on Quest: hot paths must NEVER allocate. Import these
// instead of `new THREE.Vector3()` inside useFrame/tick.
import * as THREE from 'three'

export const _v1 = new THREE.Vector3()
export const _v2 = new THREE.Vector3()
export const _v3 = new THREE.Vector3()
export const _q1 = new THREE.Quaternion()
export const _m1 = new THREE.Matrix4()
export const _c1 = new THREE.Color()
export const _e1 = new THREE.Euler()

// Fixed update order for the frame (documented, enforced by component
// mount order in App.jsx): input -> logic -> governor -> animation -> render.
//   input:     GazeDwell, DesktopControls, HandCursors
//   logic:     DirectorTick (director.tick, ambience.tick)
//   governor:  GovernorTick (perf governor; observes, never allocates)
//   animation: character/world useFrame visuals
//   render:    R3F automatic render (no positive-priority useFrame anywhere,
//              so nobody hijacks the render loop)
export const FRAME_ORDER = ['input', 'logic', 'governor', 'animation', 'render']

// Delta clamp: no spiral of death after hitches (tab-switch, shader
// compile, GC). Everything downstream gets the clamped value.
export function clampDt(rawDt) {
  return Math.min(Math.max(rawDt, 0), 0.05)
}
