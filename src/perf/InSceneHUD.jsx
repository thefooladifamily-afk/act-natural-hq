// InSceneHUD — the perf readout that works INSIDE the headset.
// DOM overlays are invisible in XR, so the Quest law numbers live on this
// floating card: FPS, frame ms, draw calls, triangles, governor level.
// ?perf=1 shows it (same flag as the DOM PerfHUD); 'p' toggles it.
// Positioned right of the seat at ~1.25m from the eye — readable, out of
// the documentary sightline. Redrawn at 2Hz: cheap, never in the hot path.
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { canvasTexture } from '../world/materials.js'
import { governor } from './governor.js'

const ENABLED =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('perf') &&
  !new URLSearchParams(window.location.search).has('clean') // ?clean=1 wins

function drawHUD(canvas, fps, ms, gl) {
  const g = canvas.getContext('2d')
  const w = canvas.width, h = canvas.height
  g.fillStyle = 'rgba(10,14,20,.88)'; g.fillRect(0, 0, w, h)
  g.strokeStyle = '#8fd0ff'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12)
  const info = gl.info.render
  const gov = governor.getState()
  const rows = [
    ['FPS', String(fps), fps < 70],
    ['FRAME', ms.toFixed(1) + 'ms', ms > 13.8],
    ['CALLS', info.calls + ' / 80', info.calls > 80],
    ['TRIS', (info.triangles / 1000).toFixed(0) + 'K / 300K', info.triangles > 300000],
    ['GOV', 'L' + gov.level + ' ' + gov.name, gov.level > 0],
  ]
  g.textAlign = 'left'
  rows.forEach(([label, val, over], i) => {
    const y = 52 + i * 40
    g.fillStyle = '#8fd0ff'; g.font = 'bold 26px monospace'
    g.fillText(label, 28, y)
    g.fillStyle = over ? '#ff6b6b' : '#9fe8a9'; g.font = '26px monospace'
    g.fillText(val, 170, y)
  })
}

export default function InSceneHUD() {
  if (!ENABLED) return null
  return <InSceneHUDInner />
}

function InSceneHUDInner() {
  const gl = useThree((s) => s.gl)
  const mesh = useRef()
  const texRef = useRef()
  const acc = useRef({ t: 0, frames: 0 })

  useEffect(() => {
    const tex = canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = 'rgba(10,14,20,.88)'; g.fillRect(0, 0, w, h)
    })
    texRef.current = tex
    if (mesh.current) {
      mesh.current.material.map = tex
      mesh.current.material.needsUpdate = true
    }
    const onKey = (e) => {
      if ((e.key === 'p' || e.key === 'P') && mesh.current) {
        mesh.current.visible = !mesh.current.visible
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useFrame((state, dt) => {
    const a = acc.current
    a.t += dt; a.frames++
    if (mesh.current) mesh.current.lookAt(state.camera.position)
    if (a.t >= 0.5 && texRef.current) {
      const fps = Math.round(a.frames / a.t)
      const ms = (a.t / a.frames) * 1000
      drawHUD(texRef.current.image, fps, ms, gl)
      texRef.current.needsUpdate = true
      a.t = 0; a.frames = 0
    }
  })

  return (
    <mesh ref={mesh} position={[0.45, 1.4, 0.35]}>
      <planeGeometry args={[0.55, 0.275]} />
      <meshBasicMaterial transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

// Re-exported for the governor's HUD wiring check.
export function hudEnabled() { return ENABLED }
