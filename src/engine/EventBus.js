// EventBus — the single real event bus for the Behavioral Cinema Engine.
//
// Every interaction publishes here; the behavior engine, session memory,
// director responses, and Judge Mode all subscribe. Judge Mode's "live event
// graph" renders THIS bus — no fake visualization, no simulated data.
//
// Event vocabulary (small, meaningful only — Amy's locked set):
//   DISCOVER | RETURN | INTERACT | DEVIATE | COMPLETE
// plus the engine's own: BEHAVIOR_STATE, DIRECTOR_RULE, MEMORY_READ.
// No meaningless activity collection. Each event carries type, target,
// timestamp, sequence — enough to explain what happened — plus source,
// position, duration, significance, data for the finale and Judge Mode.
const listeners = new Map() // type -> Set(fn); '*' gets everything

// Ring buffer of the most recent events — Judge Mode's event stream reads
// this. Bounded so a long session can't grow memory (perf law).
const STREAM_CAP = 300
const stream = []
let seq = 0 // session sequence — every event gets its order number

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set())
  listeners.get(type).add(fn)
  return () => listeners.get(type).delete(fn)
}

export function emit(type, partial = {}) {
  const event = {
    type,
    seq: seq++,
    timestamp: Date.now(),
    source: partial.source || 'unknown',
    target: partial.target || null,
    position: partial.position || null,
    duration: partial.duration || 0,
    significance: partial.significance || 0,
    data: partial.data || null,
  }
  stream.push(event)
  if (stream.length > STREAM_CAP) stream.splice(0, stream.length - STREAM_CAP)
  const set = listeners.get(type)
  if (set) for (const fn of set) { try { fn(event) } catch (e) { console.error('[bus]', type, e) } }
  const all = listeners.get('*')
  if (all) for (const fn of all) { try { fn(event) } catch (e) { console.error('[bus] *', e) } }
  return event
}

// The live stream for Judge Mode — real events, newest last.
export function getStream() { return stream }

// Session counters — real aggregates, never faked.
export function countByType() {
  const counts = {}
  for (const e of stream) counts[e.type] = (counts[e.type] || 0) + 1
  return counts
}
