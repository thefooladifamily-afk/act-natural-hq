// ExitSign — the in-VR EXIT. Carried over from hq-v3.
//
// In XR, the DOM overlay is gone (no dom-overlay on Quest Browser), so the
// visitor leaves via this gaze-activatable sign: 1.2s dwell or tap/pinch
// ends the XR session and shows the endcard. On desktop it exits pointer
// lock / returns to the intro.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { canvasTexture } from './materials.js'
import { registerInteractive } from '../interaction/interactives.js'
import { useFocusGlow } from '../interaction/useFocusGlow.js'
import { useHQ } from '../hq-context.jsx'

export default function ExitSign({ position = [2.9, 1.6, -1.4] }) {
  const hq = useHQ()
  const group = useRef()
  const mesh = useRef()

  const faceTex = useMemo(() => canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#20242c'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#8fd0ff'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16)
    g.fillStyle = '#8fd0ff'; g.textAlign = 'center'; g.font = 'bold 56px sans-serif'
    g.fillText('EXIT', w / 2, 118)
    g.font = '30px sans-serif'; g.fillStyle = '#cfe6ff'
    g.fillText('look + hold', w / 2, 168)
    g.fillText('or tap', w / 2, 206)
  }), [])

  const rec = useMemo(() => {
    const r = {
      id: 'screeningRoom.exit', kind: 'exit', object3D: null, radius: 0.7,
      onActivate: () => hq.director.exitShow(),
    }
    const unreg = registerInteractive(r)
    return { r, unreg }
  }, [hq])
  useEffect(() => () => rec.unreg(), [rec])
  useFocusGlow(rec, mesh)

  useFrame((state) => {
    if (!rec.r.object3D && mesh.current) rec.r.object3D = mesh.current
    if (group.current) {
      group.current.lookAt(state.camera.position.x, 1.6, state.camera.position.z)
      group.current.visible = hq.session.presenting
    }
  })

  return (
    <group ref={group} position={position} visible={false} name="screeningRoom.exitSign">
      <mesh ref={mesh} name="screeningRoom.exit">
        <boxGeometry args={[0.62, 0.62, 0.08]} />
        <meshBasicMaterial map={faceTex} />
      </mesh>
    </group>
  )
}
