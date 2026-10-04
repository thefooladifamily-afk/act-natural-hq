// SceneUnderstanding — boots RATK against the R3F renderer's XRManager
// and owns the MR environment toggle.
//
// MR behavior (v3 carried over, refined):
// - immersive-ar = full-color passthrough on Quest.
// - "YOUR ROOM" (default): the meadow environment (sky/ground/treeline/fence/
//   barn) hides; Gary + Marlow + swing + cards stand in the visitor's real
//   room, with RATK plane overlays showing the room being understood.
// - "MEADOW": keep the full virtual meadow floating over passthrough.
// The choice persists in localStorage (store.mrRoomMode).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RATKManager } from './ratk.js'
import { hq } from '../hq.js'
import { store } from '../state/store.js'
import { basic, canvasTexture } from '../world/materials.js'
import { registerInteractive } from '../interaction/interactives.js'
import { useFocusGlow } from '../interaction/useFocusGlow.js'

export default function SceneUnderstanding() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const mgr = new RATKManager()
    mgr.init(gl.xr, scene)
    hq.ratk = mgr
    return () => {
      mgr.dispose(scene)
      if (hq.ratk === mgr) hq.ratk = null
    }
  }, [gl, scene])

  useFrame(() => {
    if (hq.ratk) hq.ratk.update()
    // Wireframe overlays are MR-debug only: visible in AR mode, never in VR.
    // (Quest defect #2 — Amy saw RATK wireframes in immersive-vr.)
    // Overlays are flagged isDebugOverlay at creation; flip them here so
    // already-created planes/meshes follow mode changes.
    if (hq.ratk && hq.ratk.ratk && hq.ratk.ratk.root) {
      const show = hq.session.mode === 'ar'
      hq.ratk.showOverlays = show
      hq.ratk.ratk.root.traverse((o) => {
        if (o.userData && o.userData.isDebugOverlay) o.visible = show
      })
    }
    // MR environment visibility: cheap flag flip, evaluated every frame so
    // the in-world toggle takes effect instantly.
    const env = scene.getObjectByName('hq-environment')
    if (env) {
      const inMR = hq.session.mode === 'ar'
      env.visible = !(inMR && store.data.mrRoomMode)
    }
    const overlays = scene.getObjectByName('screeningRoom.mrToggle')
    if (overlays) overlays.visible = hq.session.mode === 'ar'
  })

  return null
}

// In-world toggle for the MR environment (registered as an interactive so
// it works with gaze + pinch). RATK/MR logic lives in this module.
export function MRToggle3D({ position = [0, 1.15, 2.6] }) {
  const mesh = useRef()
  const labelTex = useMemo(() => canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = 'rgba(18,24,20,.8)'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#9adcff'; g.textAlign = 'center'; g.font = 'bold 44px sans-serif'
    g.fillText(store.data.mrRoomMode ? 'ROOM: YOURS' : 'ROOM: MEADOW', w / 2, 80)
  }), [])

  const rec = useMemo(() => {
    const r = {
      id: 'screeningRoom.mrToggle', kind: 'mr', object3D: null, radius: 0.6,
      onActivate: () => {
        store.data.mrRoomMode = !store.data.mrRoomMode
        store.save()
        const c = labelTex.image
        const g = c.getContext('2d')
        g.fillStyle = 'rgba(18,24,20,.8)'; g.fillRect(0, 0, c.width, c.height)
        g.fillStyle = '#9adcff'; g.textAlign = 'center'; g.font = 'bold 44px sans-serif'
        g.fillText(store.data.mrRoomMode ? 'ROOM: YOURS' : 'ROOM: MEADOW', c.width / 2, 80)
        labelTex.needsUpdate = true
      },
    }
    const unreg = registerInteractive(r)
    return { r, unreg }
  }, [labelTex])

  useEffect(() => () => rec.unreg(), [rec])
  useFocusGlow(rec, mesh)

  useFrame(() => {
    if (!rec.r.object3D && mesh.current) rec.r.object3D = mesh.current
  })

  return (
    <group position={position} name="screeningRoom.mrToggle">
      <mesh ref={mesh} name="screeningRoom.mrToggle.button">
        <boxGeometry args={[0.9, 0.24, 0.06]} />
        <primitive object={basic(0x16241e)} attach="material" />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[0.86, 0.215]} />
        <meshBasicMaterial map={labelTex} transparent />
      </mesh>
    </group>
  )
}
