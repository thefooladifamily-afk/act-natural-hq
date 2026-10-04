// EngineBridge — mounts the Behavioral Cinema Engine inside the Canvas.
//
// Wires: EventBus handles onto hq (for Judge Mode + agent QA), the behavior
// engine + director responses subscriptions, and the flat-mode pointer trail
// sampler ("THE PATH YOU LEFT BEHIND" — pointer samples are labeled pointer,
// never gaze).
//
// Cost: two bus subscriptions + one throttled pointermove listener. Zero
// draw calls, zero per-frame work.
import { useEffect } from 'react'
import { hq } from '../hq.js'
import * as bus from '../engine/EventBus.js'
import * as memory from '../engine/SessionMemory.js'
import * as behavior from '../engine/BehaviorEngine.js'
import * as responses from '../engine/DirectorResponses.js'

const TRAIL_MS = 150 // pointer sample cadence — the trail, not surveillance

export default function EngineBridge() {
  useEffect(() => {
    // Handles for Judge Mode, the automated QA, and the finale.
    hq.bus = bus
    hq.memory = memory
    hq.behavior = behavior

    const unsubs = [behavior.init(), responses.init()]

    let last = 0
    const onMove = (e) => {
      const now = performance.now()
      if (now - last < TRAIL_MS) return
      last = now
      try {
        // Normalized device coords — honest pointer data, labeled as such.
        const x = (e.clientX / window.innerWidth) * 2 - 1
        const y = -((e.clientY / window.innerHeight) * 2 - 1)
        memory.noteTrail('pointer', +x.toFixed(3), +y.toFixed(3))
      } catch (err) { /* trail is non-essential */ }
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    return () => {
      unsubs.forEach((u) => { try { u() } catch (e) {} })
      window.removeEventListener('pointermove', onMove)
      hq.bus = null
      hq.memory = null
      hq.behavior = null
    }
  }, [])
  return null
}
