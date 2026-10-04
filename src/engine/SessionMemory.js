// SessionMemory — "THE SCREENING ROOM REMEMBERS YOU."
//
// Records meaningful interaction events only, per Amy's locked schema:
//   { type, timestamp, source, target, position, duration, significance }
//   plus seq (session order) and data.
//
// Event vocabulary (small, locked): DISCOVER | RETURN | INTERACT | DEVIATE
// | COMPLETE. Experience-specific behavioral history only — nothing
// sensitive, nothing personal. Never infers characteristics about the player.
//
// Deterministic: RETURN fires when a target focused now was discovered
// earlier in this session (gap > 4s since last focus). Every INTERACT first
// READS memory (prior visits/interactions on the target) and carries the
// result in data — that read is the repeat-recognition proof, visible in
// Judge Mode. Significance is scored from type + repetition, never random.
import { emit } from './EventBus.js'

const RETURN_GAP_MS = 4000

// Base significance per type — deterministic weights, documented here.
const WEIGHT = {
  DISCOVER: 0.5,
  INTERACT: 0.8,
  RETURN: 0.7,
  DEVIATE: 0.6,
  COMPLETE: 1.0,
}

const seen = new Map() // target -> { firstSeen, lastSeen, focusCount, interactions }
const events = []      // the session's meaningful events (bounded)

function significanceFor(type, target) {
  const base = WEIGHT[type] || 0.3
  const s = target ? seen.get(target) : null
  // Repetition raises significance, capped — the room notices patterns.
  const rep = s ? Math.min(0.3, (s.interactions || 0) * 0.1) : 0
  return Math.min(1, base + rep)
}

export function record(type, { source = 'unknown', target = null, position = null, duration = 0, data = null } = {}) {
  const now = Date.now()
  let rec = target ? seen.get(target) : null
  if (target && !rec) {
    // Note: engagement events (DISCOVER/INTERACT/RETURN) flip engaged=true
    // below. Milestones like COMPLETE create the entry for timing but do
    // NOT count as engagement — otherwise a COMPLETE recorded before its
    // INTERACT (castVote runs inside onActivate) would defeat first-touch.
    rec = { firstSeen: now, lastSeen: 0, focusCount: 0, interactions: 0, engaged: false }
    seen.set(target, rec)
  }
  // FIRST-TOUCH DISCOVERY: a deliberate tap/click on a never-before-engaged
  // target is irrefutable evidence of discovery — you cannot hit what you
  // haven't found. The tap is observed; the DISCOVER label is the honest
  // interpretation, marked firstTouch in data so it stays explainable.
  // This makes touch/mouse/DOM users first-class citizens of the behavioral
  // pipeline: no gaze required, ONE canonical pipeline for every input.
  if (type === 'INTERACT' && target && !rec.engaged) {
    record('DISCOVER', { source, target, position, duration: 0, data: { firstTouch: true } })
    rec = seen.get(target)
  }
  // RETURN on re-engage: coming back to a known target after 4s+ away is a
  // RETURN for ANY input (gaze, tap, click) — not just noteFocus. The repeat
  // acknowledgment yields to the homecoming: one clear beat, not two.
  let returned = false
  if (type === 'INTERACT' && rec && now - rec.lastSeen > RETURN_GAP_MS) {
    record('RETURN', { source, target, position, duration: 0,
      data: { gapMs: now - rec.lastSeen, visits: rec.focusCount + 1, via: 'interact' } })
    rec = seen.get(target)
    returned = true
  }
  if (target && !rec) {
    rec = { firstSeen: now, lastSeen: 0, focusCount: 0, interactions: 0 }
    seen.set(target, rec)
  }
  // THE MEMORY READ: every INTERACT consults prior history first. The result
  // rides in data — Judge Mode shows the room literally reading memory.
  let read = null
  if (type === 'INTERACT' && rec) {
    read = { priorVisits: rec.focusCount, priorInteractions: rec.interactions }
    data = { ...(data || {}), memoryRead: read, repeat: rec.interactions > 0, returned }
  }
  if (rec) {
    rec.lastSeen = now
    if (type === 'INTERACT') rec.interactions++
    if (type === 'DISCOVER' || type === 'RETURN') rec.focusCount++
    if (type === 'DISCOVER' || type === 'INTERACT' || type === 'RETURN') rec.engaged = true
  }
  const event = {
    type,
    timestamp: now,
    source,
    target,
    position,
    duration,
    significance: significanceFor(type, target),
    data,
  }
  events.push(event)
  if (events.length > 500) events.splice(0, events.length - 500)
  if (read) {
    // The read itself is traceable — the REPEAT TEST watches for this.
    emit('MEMORY_READ', {
      source: 'engine', target,
      data: { priorVisits: read.priorVisits, priorInteractions: read.priorInteractions, repeat: rec.interactions > 1 },
      significance: 0.7,
    })
  }
  emit(type, event) // the bus carries it to behavior + Judge Mode
  return event
}

// Called by the gaze system on every focus gain. Returns the recorded type:
// DISCOVER (first time) or RETURN (came back after 4s+ away).
export function noteFocus(target, { source = 'head-gaze', position = null } = {}) {
  const now = Date.now()
  const rec = seen.get(target)
  if (rec && now - rec.lastSeen > RETURN_GAP_MS) {
    return record('RETURN', { source, target, position, data: { gapMs: now - rec.lastSeen, visits: rec.focusCount + 1 } })
  }
  if (!rec) {
    return record('DISCOVER', { source, target, position })
  }
  // Re-focus inside the gap: not meaningful on its own — just update timing.
  rec.lastSeen = now
  rec.focusCount++
  return null
}

export function wasDiscovered(target) { return seen.has(target) }
export function visitCount(target) { const s = seen.get(target); return s ? s.focusCount : 0 }
export function interactionCount(target) { const s = seen.get(target); return s ? s.interactions : 0 }

// The interaction trail for "THE PATH YOU LEFT BEHIND" — real coordinates,
// real timestamps. Pointer samples are labeled pointer, never gaze.
const trail = []
export function noteTrail(kind, x, y, extra = null) {
  trail.push({ kind, x, y, t: Date.now(), extra })
  if (trail.length > 600) trail.splice(0, trail.length - 600)
}
export function getTrail() { return trail }

// Finale input: the session as facts. Deterministic ordering.
export function summarize() {
  const byType = {}
  for (const e of events) byType[e.type] = (byType[e.type] || 0) + 1
  const ranked = [...seen.entries()]
    .sort((a, b) => (b[1].interactions * 2 + b[1].focusCount) - (a[1].interactions * 2 + a[1].focusCount))
    .map(([target, s]) => ({ target, interactions: s.interactions, visits: s.focusCount, firstSeen: s.firstSeen }))
  return {
    totalEvents: events.length,
    byType,
    topTargets: ranked.slice(0, 5),
    discoveredCount: seen.size,
    firstEvent: events[0] || null,
    lastEvent: events[events.length - 1] || null,
    sessionMs: events.length ? events[events.length - 1].timestamp - events[0].timestamp : 0,
  }
}

export function getEvents() { return events }
export function reset() { seen.clear(); events.length = 0; trail.length = 0 }
