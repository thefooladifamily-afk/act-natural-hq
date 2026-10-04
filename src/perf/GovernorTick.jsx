// GovernorTick — the frame hook for the runtime perf governor.
// Mounted after DirectorTick (fixed update order: input -> logic ->
// governor -> animation -> render). Observes the clamped frame delta;
// allocates nothing.
import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { governor } from './governor.js'
import { clampDt } from './pools.js'
import { hq } from '../hq.js'

export default function GovernorTick() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    governor.init({ gl, camera, scene })
    hq.gl = gl // debug/verification handle for the DOM PerfHUD
    hq.governor = governor // debug/verification handle (like window.__hq)
    hq.scene = scene // debug/verification handle
    // Collect the non-essential FX list once (tagged name="hq-fx" in Meadow).
    const found = []
    scene.traverse((o) => { if (o.name === 'hq-fx') found.push(o) })
    hq.fx.list = found
    return () => { if (hq.governor === governor) hq.governor = null }
  }, [gl, camera, scene])

  useFrame((_, rawDt) => {
    governor.update(clampDt(rawDt) * 1000)
  })

  return null
}
