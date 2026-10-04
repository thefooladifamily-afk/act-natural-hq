// HandCursors — the visible proof of hand tracking, at minimum cost.
//
// The store disables xrt's default hand/controller visuals (dozens of draw
// calls we don't have). These two palm spheres (2 draw calls, basic
// material) track the wrist joint from the raw WebXR session — enough for
// the hands-first feel without the heavy joint models. Pinch still fires
// `selectstart` on the session, which XRSession turns into gaze-target
// activation (the v3 dead-tap rule).
//
// FEEDBACK (Amy 2026-10-03, hand tracking is input #2):
// - hover: when the head-gaze holds an interactive, cursors grow slightly
//   and warm up — "your hands are near something you can take"
// - pinch: XRSession's selectstart sets hq.hands.pinchedUntil; cursors flash
//   the accent color for ~180ms — unmistakable confirmation.
import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { hq } from '../hq.js'
import { damp01 } from '../util/reducedMotion.js'

const IDLE = new THREE.Color(0xfff6d8)
const PINCH = new THREE.Color(0xffd166)

export default function HandCursors() {
  const gl = useThree((s) => s.gl)
  const c0 = useRef()
  const c1 = useRef()
  const glow = useRef(0)

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt)
    let found = 0
    try {
      const xr = gl.xr
      const session = xr.getSession && xr.getSession()
      const frame = xr.getFrame && xr.getFrame()
      if (session && frame) {
        const refSpace = xr.getReferenceSpace()
        if (refSpace) {
          for (const src of session.inputSources) {
            if (found >= 2 || !src.hand) continue
            const wrist = src.hand.get('wrist')
            if (!wrist) continue
            const pose = frame.getJointPose(wrist, refSpace)
            if (pose) {
              const cur = found === 0 ? c0.current : c1.current
              if (cur) {
                cur.visible = true
                cur.position.setFromMatrixPosition(pose.transform.matrix)
              }
              found++
            }
          }
        }
      }
    } catch (e) { /* session not presenting / joints unavailable */ }
    if (c0.current && found < 1) c0.current.visible = false
    if (c1.current && found < 2) c1.current.visible = false

    // Feedback: pinch flash + gaze-hover swell.
    const pinched = !!(hq.hands && hq.hands.pinchedUntil > performance.now())
    const hovering = !!(hq.gaze && hq.gaze.current)
    const want = pinched ? 1 : hovering ? 0.45 : 0
    glow.current = damp01(glow.current, want, 12, dt)
    const g = glow.current
    for (const cur of [c0.current, c1.current]) {
      if (!cur) continue
      cur.scale.setScalar(1 + g * 0.55)
      cur.material.color.copy(IDLE).lerp(PINCH, Math.min(1, g * 1.6))
    }
  })

  return (
    <group name="screeningRoom.handCursors">
      <mesh ref={c0} visible={false}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <meshBasicMaterial color={0xfff6d8} transparent opacity={0.85} />
      </mesh>
      <mesh ref={c1} visible={false}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <meshBasicMaterial color={0xfff6d8} transparent opacity={0.85} />
      </mesh>
    </group>
  )
}
