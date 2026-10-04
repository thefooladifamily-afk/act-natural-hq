// DesktopControls — flat-mode (no headset) interaction.
//
// The flat page carries the whole show (voice-loop design: judging floor is
// a browser). Mouse drag = look around (yaw/pitch, clamped); click (no drag)
// = activate whatever the gaze reticle holds — the same single activation
// path as pinch/tap in XR. Only active when no XR session is presenting.
//
// TOUCH (Quest Browser defect #1, fixed): taps fire mouse events, but the
// gaze-target model breaks for touch — a tap is at a point, not at the
// center-screen gaze. So touch pointers raycast from the TAP POINT
// (tap-to-select) instead of requiring the center gaze to already hold a
// target. Pointer events unify mouse/touch/pen in one handler.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { activate, activateGazed } from './UnifiedInput.js'
import { getInteractives } from './interactives.js'
import { hq } from '../hq.js'

const _ray = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _pos = new THREE.Vector3()
const _d = new THREE.Vector3() // temp: no per-tap allocation
const _pp = new THREE.Vector3() // temp: no per-tap allocation

// Find the nearest interactive under a screen point (tap-to-select).
// Same tolerance model as GazeDwell's center-ray, but from tap coordinates.
function pickAt(camera, clientX, clientY) {
  const el = document.querySelector('canvas')
  if (!el) return null
  const r = el.getBoundingClientRect()
  _ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
  _ray.setFromCamera(_ndc, camera)
  let best = null, bestDist = Infinity
  for (const it of getInteractives()) {
    if (!it.object3D) continue
    it.object3D.getWorldPosition(_pos)
    const along = _d.copy(_pos).sub(_ray.ray.origin).dot(_ray.ray.direction)
    if (along < 0.3 || along > 30) continue
    const perp = _pp.copy(_d).addScaledVector(_ray.ray.direction, -along).length()
    const tol = (it.radius || 0.4) + along * 0.02
    if (perp < tol && along < bestDist) { bestDist = along; best = it }
  }
  return best
}

export default function DesktopControls() {
  const { camera, gl } = useThree((s) => ({ camera: s.camera, gl: s.gl }))
  const drag = useRef(null)
  // Double-activation guard (Quest parity fix 2026-10-03): modern browsers
  // fire BOTH pointer events AND synthesized mouse events for the same tap.
  // Without this guard, every touch tap activates TWICE (double votes,
  // double Famous triggers). Track the last pointerdown time; ignore mouse
  // events that follow within the debounce window.
  const lastPointerDown = useRef(0)

  useEffect(() => {
    const el = gl.domElement
    const yawPitch = { yaw: 0, pitch: 0 }

    function onDown(e) {
      if (hq.session.presenting) return
      // Guard: ignore synthesized mouse events that duplicate a pointer event.
      if (e.type === 'mousedown' && Date.now() - lastPointerDown.current < 500) return
      if (e.type === 'pointerdown') lastPointerDown.current = Date.now()
      // Pointer events unify mouse/touch/pen. Track the pointer type so
      // touch taps can use tap-to-select (raycast from tap point).
      const pt = e.pointerType || (e.touches ? 'touch' : 'mouse')
      drag.current = { x: e.clientX, y: e.clientY, moved: false, pointerType: pt }
    }
    function onMove(e) {
      const d = drag.current
      if (!d || hq.session.presenting) return
      const dx = e.clientX - d.x, dy = e.clientY - d.y
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
      yawPitch.yaw -= dx * 0.0035
      yawPitch.pitch = Math.max(-1.1, Math.min(1.1, yawPitch.pitch - dy * 0.0035))
      d.x = e.clientX; d.y = e.clientY
      camera.rotation.set(0, 0, 0)
      camera.rotateY(yawPitch.yaw)
      camera.rotateX(yawPitch.pitch)
    }
    function onUp(e) {
      const d = drag.current
      drag.current = null
      if (!d || d.moved || hq.session.presenting) return
      // Touch tap: raycast from the TAP POINT (not the center gaze).
      // Touch users tap what they want; requiring the center gaze to
      // already hold it is the defect that broke Quest Browser taps.
      if (d.pointerType === 'touch') {
        const hit = pickAt(camera, e.clientX, e.clientY)
        if (hit) activate(hit, 'touch')
        // No hit = no-op (not an error; the tap just missed everything).
        return
      }
      // Mouse/pen click = activate the gaze target (same unified funnel).
      activateGazed('mouse')
    }
    // Pointer events cover mouse + touch + pen. Keep the legacy mouse
    // handlers too: some browsers (older Quest builds) synthesize mouse
    // events without full PointerEvent support.
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [camera, gl])

  return null
}
