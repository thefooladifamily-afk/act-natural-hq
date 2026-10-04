// GazeTrack — Meta-native magic, item 1: gaze-aware heads.
//
// Gary + Marlow subtly turn toward the visitor's HEADSET position (smooth
// lerp, never snappy). When the visitor speaks, the ADDRESSED character
// leans in. Eye contact is the thing flat screens can't do.
//
// CONSTRAINT: character files are hands-off (other workers own them), so
// this module only touches what the avatar registry exposes and what the
// character components don't write per-frame:
//
// - BillboardCharacter (2D track) writes group.rotation.y (yaw billboard),
//   group.scale, group.position.x/y per frame. It NEVER writes rotation.z,
//   rotation.x, or position.z — those are ours.
// - HybridCharacter writes inner.scale, inner.position.y, group.position.x.
//   Same deal: group.rotation.z / group.position.z are free.
// - AvatarSlot (placeholder track) exposes rec.head — if present we also
//   yaw the head mesh itself toward the camera.
//
// For the 2D billboards the body plane already faces the camera (yaw
// billboard); "looking at me" reads as a subtle lean toward the visitor
// plus a small approach when addressed. Within the billboard constraint,
// that's the honest version of eye contact.
//
// Perf: a few lerps per frame, zero allocations (module temps). The
// governor never notices this module.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { getAvatars } from '../characters/avatarRegistry.js'
import { hq } from '../hq.js'

// Module temps — no per-frame allocation.
const _v = { x: 0, z: 0 }

const LEAN_MAX = 0.07      // rad of lean toward the visitor (subtle)
const LEAN_ADDRESSED = 0.12 // addressed character leans in a touch more
const APPROACH = 0.09      // m the addressed character drifts toward you
const LERP_K = 2.0         // "never snappy": gentle smoothing rate
const HEAD_YAW_MAX = 0.4   // AvatarSlot head yaw clamp

export default function GazeTrack() {
  // Per-character smoothed state: id -> { lean, approach, headYaw }
  const smooth = useRef({})

  useFrame((state, dt) => {
    const avatars = getAvatars()
    const cam = state.camera.position
    const k = Math.min(1, dt * LERP_K)
    for (const id of Object.keys(avatars)) {
      const rec = avatars[id]
      if (!rec || !rec.group) continue
      const g = rec.group
      let s = smooth.current[id]
      if (!s) { s = smooth.current[id] = { lean: 0, approach: 0, headYaw: 0 } }

      // Direction from character to the visitor's headset.
      _v.x = cam.x - g.position.x
      _v.z = cam.z - g.position.z
      const dist = Math.max(0.001, Math.hypot(_v.x, _v.z))
      const nx = _v.x / dist

      // Lean: tilt the top of the figure toward the visitor's x.
      // (rotation.z positive tilts left; visitor to the right => negative.)
      const addressed = hq.addressedId === id
      const leanTarget = Math.max(-LEAN_MAX, Math.min(LEAN_MAX, -nx * LEAN_MAX * 2)) *
        (addressed ? LEAN_ADDRESSED / LEAN_MAX : 1)
      s.lean += (Math.max(-LEAN_ADDRESSED, Math.min(LEAN_ADDRESSED, leanTarget)) - s.lean) * k
      g.rotation.z = s.lean

      // Approach: the addressed character drifts slightly toward you.
      const approachTarget = addressed ? APPROACH : 0
      s.approach += (approachTarget - s.approach) * k
      // group.position.z is never written by the character components.
      g.position.z = (rec.home ? rec.home.z : g.position.z) + s.approach

      // AvatarSlot track: yaw the actual head mesh toward the headset.
      if (rec.head) {
        const yawToCam = Math.atan2(_v.x, _v.z)
        const yawTarget = Math.max(-HEAD_YAW_MAX, Math.min(HEAD_YAW_MAX, yawToCam))
        const hk = Math.min(1, dt * (addressed ? 4 : LERP_K))
        s.headYaw += (yawTarget - s.headYaw) * hk
        rec.head.rotation.y = s.headYaw
      }
    }
  })

  return null
}
