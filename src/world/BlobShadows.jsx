// BlobShadows — the governor's shadow fallback (ladder L5).
// When real shadows are killed for perf, these cheap radial discs keep the
// characters grounded. Hidden by default; hq.blobs.setVisible toggles.
// Two draw calls, one shared 128px texture, zero per-frame cost.
import { useEffect, useMemo, useRef } from 'react'
import { canvasTexture } from './materials.js'
import { hq } from '../hq.js'

const SPOTS = [
  [-1.9, -0.6], // gary
  [1.9, -0.6],  // marlow
]

export default function BlobShadows() {
  const group = useRef()
  const tex = useMemo(() => canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2)
    grad.addColorStop(0, 'rgba(0,0,0,.42)')
    grad.addColorStop(0.7, 'rgba(0,0,0,.18)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
  }), [])

  useEffect(() => {
    const api = {
      setVisible(v) { if (group.current) group.current.visible = v },
    }
    hq.blobs = api
    return () => { if (hq.blobs === api) hq.blobs = null }
  }, [])

  return (
    <group ref={group} visible={false}>
      {SPOTS.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.065, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.1, 1.1]} />
          <meshBasicMaterial map={tex} transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}
