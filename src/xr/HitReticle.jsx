// HitReticle — the viewer-space hit-test ring for MR.
// RATK updates the hit-test target's transform every frame (ratk.update());
// this ring rides real-world surfaces so the visitor can see where the
// room is. Only visible in immersive-ar.
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { hq } from '../hq.js'

export default function HitReticle() {
  const ring = useRef()

  useEffect(() => {
    let cancelled = false
    const t = setInterval(async () => {
      if (cancelled || !hq.ratk || !hq.ratk.ready) return
      const target = await hq.ratk.viewerHitTarget().catch(() => null)
      if (target && ring.current && !ring.current.userData.attached) {
        ring.current.userData.attached = true
        target.add(ring.current)
        ring.current.position.set(0, 0, 0)
        clearInterval(t)
      }
    }, 1000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  useFrame(() => {
    if (ring.current) {
      ring.current.visible = hq.session.mode === 'ar' && !!ring.current.userData.attached
    }
  })

  return (
    <mesh ref={ring} visible={false}>
      <ringGeometry args={[0.09, 0.11, 32]} />
      <meshBasicMaterial color={0x7fd8ff} transparent opacity={0.9} side={THREE.DoubleSide} depthTest={false} />
    </mesh>
  )
}
