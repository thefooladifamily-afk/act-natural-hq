// PerfHUD — dev-only budget readout. Append ?perf=1 to the URL.
// The Quest law: ≤300K tris, ≤80 draw calls, 72fps floor. Over-budget
// numbers render red. This is a dev tool — never part of the show.
//
// NOTE (fixed 2026-10-02): this component used to call useThree/useFrame
// while mounted OUTSIDE the Canvas — ?perf=1 crashed the whole app. It now
// reads hq.gl (registered by GovernorTick) on a plain interval: no R3F
// hooks, safe to mount anywhere.
import { useEffect, useRef } from 'react'
import { hq } from '../hq.js'

export default function PerfHUD() {
  if (typeof window !== 'undefined' &&
      !new URLSearchParams(window.location.search).has('perf')) return null
  return <PerfHUDInner />
}

function PerfHUDInner() {
  const div = useRef()

  useEffect(() => {
    let raf = 0
    let frames = 0
    let last = performance.now()
    let acc = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      frames++
      acc += now - last
      last = now
      if (acc >= 500 && div.current && hq.gl) {
        const fps = Math.round((frames / acc) * 1000)
        const info = hq.gl.info.render
        const mem = hq.gl.info.memory
        const callsOver = info.calls > 80
        const trisOver = info.triangles > 300000
        const fpsLow = fps < 70
        div.current.innerHTML =
          `fps <span class="${fpsLow ? 'over' : ''}">${fps}</span> (floor 72)\n` +
          `draw calls <span class="${callsOver ? 'over' : ''}">${info.calls}</span> (max 80)\n` +
          `triangles <span class="${trisOver ? 'over' : ''}">${info.triangles.toLocaleString()}</span> (max 300K)\n` +
          `geometries ${mem.geometries} | textures ${mem.textures}`
        frames = 0; acc = 0
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <div ref={div} className="hq-perf" />
}
