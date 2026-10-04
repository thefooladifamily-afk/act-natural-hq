// useFocusGlow — the gaze-priority focus effect (Amy 2026-10-03: gaze is
// input #1). When the head-gaze ray lands on a registered interactive, the
// target gets a subtle futuristic focus treatment: its material brightens
// toward white and it eases ~5% larger. When gaze leaves, it eases back.
// No extra meshes, no extra draw calls, no post-processing — pure material
// color + scale lerp, safe at 72fps.
//
// Usage:
//   const rec = useMemo(() => { const r = { id: 'screeningRoom.vote.swing',
//     kind: 'vote', object3D: null, radius: 0.38, onActivate }; ... }, [])
//   const mesh = useRef()
//   useFocusGlow(rec, mesh)   // wires rec.setFocus + drives the effect
//
// GazeDwell calls rec.setFocus(true/false) on target change.
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { damp01 } from '../util/reducedMotion.js'

const BRIGHT = 1.35 // focused brightness multiplier (subtle, not neon)
const GROW = 1.05   // focused scale multiplier

export function useFocusGlow(rec, meshRef, opts = {}) {
  const focus = useRef(0) // 0..1 eased focus amount
  const baseScale = useRef(null)
  const bright = opts.brightness ?? BRIGHT
  const grow = opts.scale ?? GROW

  useEffect(() => {
    if (!rec) return undefined
    rec.r.setFocus = (on) => { rec._want = on ? 1 : 0 }
    rec._want = 0
    return () => { rec.r.setFocus = null }
  }, [rec])

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt)
    const mesh = meshRef.current
    if (!mesh || !rec) return
    const want = rec._want || 0
    // Clone-on-first-focus: shared/cached materials (materials.js) must
    // never be tinted in place — the tint would leak to every user.
    if (want > 0 && mesh.material && !mesh.material.userData._focusOwned) {
      mesh.material = mesh.material.clone()
      mesh.material.userData._focusOwned = true
    }
    focus.current = damp01(focus.current, want, 10, dt)
    const f = focus.current
    if (f < 0.002 && want === 0) {
      // settled at rest: restore exactly once
      if (baseScale.current) {
        mesh.scale.setScalar(baseScale.current)
        baseScale.current = null
      }
      const m = mesh.material
      if (m && m.userData._dimmed) {
        m.color.setHex(0xffffff)
        m.userData._dimmed = false
      }
      return
    }
    if (!baseScale.current) baseScale.current = mesh.scale.x || 1
    mesh.scale.setScalar(baseScale.current * (1 + (grow - 1) * f))
    const m = mesh.material
    // Only tint materials that are safely per-instance and untextured-tintable.
    // Textured cards: brightening the white base color lifts the whole card.
    if (m && m.color) {
      const b = 1 + (bright - 1) * f
      m.color.setRGB(b, b, b)
      m.userData._dimmed = f > 0.002
    }
  })
}
