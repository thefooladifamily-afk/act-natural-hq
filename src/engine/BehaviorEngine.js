// BehaviorEngine — deterministic behavior → state. No randomness, no AI
// claims, no per-frame or timer work: scoring runs ONLY when a meaningful
// event lands on the bus (event-driven, per the perf constraint).
//
// It scores REAL interaction signals only (dwell times, sequences, timing,
// repetition, exploration) and maps them to the locked gameplay states:
//
//   CURIOUS | RETURNING | EXPLORING | UNEXPECTED | COMMITTED
//
// Rules are fixed and documented below; the same behavior always produces
// the same state. Emits BEHAVIOR_STATE {state, reason, prevState} on change.
// Before any behavior, the state is null ('—') — the engine reports no
// state until there is real behavior to score. Honest, not padded.
import { on, emit } from './EventBus.js'
import { getEvents } from './SessionMemory.js'

const WINDOW = {
  explore: 30000, // distinct discoveries counted inside this window
  recent: 20000,  // deviation stays "fresh" this long
  returning: 10000, // a RETURN event colors this long
  commit: 10000,  // discover -> interact inside this = COMMITTED (generous:
                  // software renderers dilate wall-clock; the directness
                  // condition below carries the meaning, not the stopwatch)
}

let current = null // no behavior yet — not CALM, just unknown
let currentReason = 'no behavior yet'

const MEANINGFUL = new Set(['DISCOVER', 'INTERACT', 'RETURN', 'DEVIATE', 'COMPLETE'])

function recentEvents(ms) {
  const now = Date.now()
  return getEvents().filter((e) => now - e.timestamp <= ms)
}

function distinctDiscovered(ms) {
  const s = new Set()
  for (const e of recentEvents(ms)) {
    if (e.type === 'DISCOVER' || e.type === 'RETURN') s.add(e.target)
  }
  return s
}

// Deterministic priority: the first matching rule wins. Same behavior ->
// same state, every session. No randomness disguised as adaptation.
function score() {
  const recent = recentEvents(WINDOW.recent)
  const returning = recentEvents(WINDOW.returning)
  const events = getEvents()
  if (!events.length) return [null, 'no behavior yet']

  // RETURNING: came back to something discovered earlier.
  const ret = returning.find((e) => e.type === 'RETURN')
  if (ret) return ['RETURNING', `returned to ${shortTarget(ret.target)} after ${(ret.data && ret.data.gapMs / 1000 | 0) || '?'}s away`]
  // UNEXPECTED: deviated from the expected path recently.
  const dev = recent.find((e) => e.type === 'DEVIATE')
  if (dev) return ['UNEXPECTED', `lingered off-path on ${shortTarget(dev.target)} — expected flow broken`]
  // COMMITTED: a DIRECT discover -> interact — the discovery of this target
  // inside the window, with no intervening discovery of anything else.
  // Directness (not the stopwatch) carries the meaning: the user went
  // straight from "what's that" to "that one".
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type !== 'INTERACT' || !e.target) continue
    const rev = [...events].reverse()
    const ri = rev.findIndex((d) =>
      (d.type === 'DISCOVER' || d.type === 'RETURN') && d.target === e.target && d.timestamp <= e.timestamp)
    if (ri !== -1) {
      const discIdx = events.length - 1 - ri
      const disc = events[discIdx]
      const intervening = events.slice(discIdx + 1, i).some((d) =>
        (d.type === 'DISCOVER' || d.type === 'RETURN') && d.target !== e.target)
      if (!intervening && e.timestamp - disc.timestamp <= WINDOW.commit) {
        return ['COMMITTED', `chose ${shortTarget(e.target)} ${((e.timestamp - disc.timestamp) / 1000).toFixed(1)}s after discovering it, directly`]
      }
    }
    break // only the latest interaction commits
  }
  // EXPLORING: breadth — 3+ distinct targets in the window.
  if (distinctDiscovered(WINDOW.explore).size >= 3) {
    return ['EXPLORING', `${distinctDiscovered(WINDOW.explore).size} distinct discoveries in 30s`]
  }
  // CURIOUS: discovering, nothing else yet.
  if (events.some((e) => e.type === 'DISCOVER')) return ['CURIOUS', 'exploring the room, first discoveries']
  return [null, 'events but no scorable behavior yet']
}

function shortTarget(t) {
  if (!t) return 'unknown'
  const parts = String(t).split('.')
  return parts[parts.length - 1]
}

function evaluate() {
  const [state, reason] = score()
  if (state !== current) {
    const prev = current
    current = state
    currentReason = reason
    emit('BEHAVIOR_STATE', {
      source: 'engine',
      data: { state, prevState: prev, reason },
      significance: 0.9,
    })
  }
}

export function getState() { return { state: current, reason: currentReason } }

export function init() {
  const off = on('*', (e) => {
    if (MEANINGFUL.has(e.type)) evaluate()
  })
  return () => off()
}
