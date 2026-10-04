// PortalTransition — the cinematic spatial transition on content select
// (Amy's 20-feature list #6).
//
// When a vote is cast, the three vote cards don't just vanish: over ~0.9s
// they fly toward the projection screen, shrink, and dissolve into an
// expanding light ring at the screen while the room lights dip and recover.
// Transform-only animation (no post-processing, no new textures): two draw
// calls while active, zero when idle. Reduced-motion: instant cut.
//
// Driven by hq.portal = { t: 0 } set by Director.castVote(). The transition
// owns the cards' visibility during flight, then hands off to the stunt.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { hq, finishPortalTransition } from '../hq.js'
import { flushPendingRules } from '../engine/DirectorResponses.js'
import { REDUCED_MOTION, damp01 } from '../util/reducedMotion.js'

const DURATION = 0.9
const SCREEN_POS = new THREE.Vector3(0, 1.62, -1.2)
const _from = new THREE.Vector3() // module temp: no per-frame allocation

// Complete the portal transition: hide the vote cards, restore the lights,
// clear the portal flag. Exported so the automated QA / unit tests can drive
// the transition to completion without a render loop.
export { finishPortalTransition }

export default function PortalTransition() {
  const scene = useThree((s) => s.scene)
  const ring = useRef()
  const ringMat = useRef()

  const ringGeo = useMemo(() => new THREE.RingGeometry(0.45, 0.55, 48), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt)
    const p = hq.portal
    const cards = scene.getObjectByName('screeningRoom.movieSelector')
    if (!p || p.t == null) {
      if (ring.current) ring.current.visible = false
      return
    }
    if (REDUCED_MOTION) { finishPortalTransition(cards); flushPendingRules(); if (ring.current) ring.current.visible = false; return }

    p.t = Math.min(1, (p.t || 0) + dt / DURATION)
    const t = p.t
    const e = t * t * (3 - 2 * t) // smoothstep

    // 1. Cards fly to the screen, shrinking.
    if (cards) {
      cards.visible = true
      if (!p.fromSet) { _from.copy(cards.position); p.fromSet = true }
      cards.position.lerpVectors(_from, SCREEN_POS, e)
      const s = 1 - e * 0.85
      cards.scale.setScalar(Math.max(0.05, s))
    }
    // 2. Room lights dip and recover with the transition.
    if (hq.lights) {
      hq.lights.dimTo(1 - Math.sin(t * Math.PI) * 0.45)
      hq.lights.setWarmth(Math.sin(t * Math.PI) * 0.6)
    }
    // 3. Expanding glow ring at the screen.
    if (ring.current) {
      ring.current.visible = true
      const rs = 0.4 + e * 2.2
      ring.current.scale.setScalar(rs)
      if (ringMat.current) ringMat.current.opacity = 0.55 * (1 - e)
    }
    if (t >= 1) { finishPortalTransition(cards); flushPendingRules(); if (ring.current) ring.current.visible = false }
  })

  return (
    <mesh
      ref={ring}
      geometry={ringGeo}
      position={[0, 1.62, -1.44]}
      visible={false}
      name="screeningRoom.portalRing"
    >
      <meshBasicMaterial
        ref={ringMat}
        color={0x9adcff}
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
