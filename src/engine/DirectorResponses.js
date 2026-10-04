// DirectorResponses — the DIRECTOR RULE stage of the canonical pipeline:
//
//   USER ACTION -> EVENT -> MEMORY -> BEHAVIOR STATE -> DIRECTOR DECISION
//   -> SPATIAL/AUDIO RESPONSE
//
// Rules are deterministic and named: a technical reviewer asking "why did
// the room do that?" gets a visible EVENT that entered MEMORY, produced a
// BEHAVIOR STATE, matched a DIRECTOR RULE, and fired a CINEMATIC RESPONSE.
// Every firing emits DIRECTOR_RULE {rule, state, reason, response} — the
// pipeline Judge Mode animates live.
//
// Locked rules (deterministic, explainable):
//   RULE_CURIOUS_REVEAL      CURIOUS     -> warmth lift, reveal more detail
//   RULE_RETURN_ACK          RETURNING   -> warm pulse, acknowledge the return
//   RULE_UNEXPECTED_RECOMPOSE UNEXPECTED -> cooler shift, alter composition
//   RULE_COMMIT_ADVANCE      COMMITTED   -> light lift, advance narrative
//   RULE_EXPLORE_INVITE      EXPLORING   -> brightness lift, invite further
//   RULE_REPEAT_ACK          repeat INTERACT (memory read: priorInteractions
//                            >= 1) -> warm pulse + audio double-blip: the
//                            room recognizes it happened before
//
// All lighting changes are small (±0.15) and ride the existing hq.lights
// rig — no new lights, no post-processing, no perf cost. Skipped while the
// portal transition owns the lights, and while reduced-motion is set.
import { on, emit } from './EventBus.js'
import { hq } from '../hq.js'
import { REDUCED_MOTION } from '../util/reducedMotion.js'
import { getEvents, summarize } from './SessionMemory.js'

function lights() { return hq.lights || null }

// [dimTarget, warmthTarget] per rule — subtle by design.
const RULES = {
  CURIOUS:    { rule: 'RULE_CURIOUS_REVEAL',      dim: 1.0,  warmth: 0.15,  response: 'warmth lift — reveal hidden detail' },
  RETURNING:  { rule: 'RULE_RETURN_ACK',          dim: 1.0,  warmth: 0.3,   response: 'warm pulse — acknowledge the return' },
  UNEXPECTED: { rule: 'RULE_UNEXPECTED_RECOMPOSE', dim: 0.9,  warmth: -0.35, response: 'cooler shift — alter composition' },
  COMMITTED:  { rule: 'RULE_COMMIT_ADVANCE',      dim: 1.05, warmth: 0.1,   response: 'light lift — advance narrative' },
  EXPLORING:  { rule: 'RULE_EXPLORE_INVITE',      dim: 1.05, warmth: 0.05,  response: 'brightness lift — invite further' },
}

const REPEAT_RULE = { rule: 'RULE_REPEAT_ACK', dim: 1.0, warmth: 0.45, response: 'warm pulse + double-blip — recognized repeat' }

// P1 FINALE BRANCH (Amy's order): ONE behavior-dependent finale variant.
// The branch is selected by REAL session facts — never random, never
// cosmetic. The response is real (lighting + audio motif), not text
// substitution; the endcard copy is supporting evidence, not the feature.
const FINALE_RULES = {
  HOMECOMING: { rule: 'RULE_FINALE_HOMECOMING', dim: 1.1, warmth: 0.5,
    response: 'memory-glow — the room remembers what you returned to' },
  DEFAULT: { rule: 'RULE_FINALE_DEFAULT', dim: 1.0, warmth: 0.1,
    response: 'gentle resolve — a clean ending' },
}

/**
 * Read the session and decide the finale branch. Returns
 * { branch: 'HOMECOMING' | 'DEFAULT', facts, reason }.
 * Minimum 3 real session facts feed every decision; the reason names them
 * so Judge Mode (and the acceptance test) can trace exactly why.
 */
export function selectFinale() {
  const events = getEvents()
  const sum = summarize()
  const returns = events.filter((e) => e.type === 'RETURN')
  const interacts = events.filter((e) => e.type === 'INTERACT')
  const repeats = events.filter((e) => e.type === 'MEMORY_READ' && e.data && e.data.repeat)
  const states = events.filter((e) => e.type === 'BEHAVIOR_STATE').map((e) => e.data && e.data.state)
  const stateCounts = {}
  for (const s of states) if (s) stateCounts[s] = (stateCounts[s] || 0) + 1
  const dominantState = Object.entries(stateCounts).sort((a, b) => b[1] - a[1])[0]
  // Most-returned-to target: the "home" the user kept coming back to.
  const returnTargets = {}
  for (const r of returns) {
    const t = r.target || 'unknown'
    returnTargets[t] = (returnTargets[t] || 0) + 1
  }
  const mostReturned = Object.entries(returnTargets).sort((a, b) => b[1] - a[1])[0]
  const facts = {
    returnCount: returns.length,
    mostReturnedTarget: mostReturned ? mostReturned[0] : null,
    mostReturnedCount: mostReturned ? mostReturned[1] : 0,
    interactionCount: interacts.length,
    repeatCount: repeats.length,
    discoveredCount: sum.discoveredCount,
    dominantState: dominantState ? dominantState[0] : null,
    dominantStateCount: dominantState ? dominantState[1] : 0,
    sessionMs: sum.sessionMs,
  }
  if (facts.returnCount >= 1) {
    return {
      branch: 'HOMECOMING',
      facts,
      reason: `${facts.returnCount} return(s) to ${shortTarget(facts.mostReturnedTarget)} ` +
        `(${facts.mostReturnedCount}x); ${facts.interactionCount} interactions, ` +
        `${facts.repeatCount} repeats, dominant state ${facts.dominantState || 'none'} — the room remembers the homecoming`,
    }
  }
  return {
    branch: 'DEFAULT',
    facts,
    reason: `no returns in ${facts.interactionCount} interactions across ${facts.discoveredCount} discoveries ` +
      `(dominant state ${facts.dominantState || 'none'}) — a clean ending`,
  }
}

/**
 * Fire the finale through the canonical pipeline: session memory (already
 * read by selectFinale) -> director rule -> spatial/audio response.
 * Returns the { branch, facts, reason } so the caller can pass it on.
 */
export function fireFinale() {
  const sel = selectFinale()
  const rule = FINALE_RULES[sel.branch]
  if (fire(rule, 'FINALE', sel.reason, { branch: sel.branch, facts: sel.facts })) {
    finaleMotif(sel.branch)
  }
  return sel
}

function finaleMotif(branch) {
  // Audio signature for the finale — guarded, non-essential.
  // HOMECOMING: ascending triple-blip (return → recognition → resolve).
  // DEFAULT: single soft resolve blip.
  try {
    if (!hq.ambience || !hq.ambience.blip) return
    if (branch === 'HOMECOMING') {
      hq.ambience.blip(-0.3)
      setTimeout(() => { try { hq.ambience.blip(0) } catch (e) {} }, 160)
      setTimeout(() => { try { hq.ambience.blip(0.3) } catch (e) {} }, 320)
    } else {
      hq.ambience.blip(0)
    }
  } catch (e) { /* audio is non-essential */ }
}

export function getRules() { return { ...RULES, REPEAT: REPEAT_RULE, FINALE_HOMECOMING: FINALE_RULES.HOMECOMING, FINALE_DEFAULT: FINALE_RULES.DEFAULT } }

// A rule suppressed by the portal waits here. Flushed by the portal when
// its flight finishes — the behavior is acknowledged, just after the
// cinematic, never swallowed. Two lanes: state rules (latest wins — the
// room's final state is what matters) and event acks like REPEAT_ACK
// (queued — an acknowledgment of a specific moment must never be silently
// dropped by a later state change).
let pendingStateRule = null
let pendingAcks = []

export function flushPendingRules() {
  if (hq.portal) return false
  if (!pendingStateRule && !pendingAcks.length) return false
  // Acks first (chronological: the MEMORY_READ precedes the BEHAVIOR_STATE),
  // then the latest state rule so the room settles on the current state.
  const acks = pendingAcks
  pendingAcks = []
  const st = pendingStateRule
  pendingStateRule = null
  let fired = false
  for (const p of acks) fired = fire(p.rule, p.state, p.reason, p.extra) || fired
  if (st) fired = fire(st.rule, st.state, st.reason, st.extra) || fired
  return fired
}

function fire(rule, state, reason, extra = {}) {
  if (hq.portal) {
    // Defer, don't drop: the portal owns the lights for its 0.9s flight.
    // The rule fires (visibly) the moment the transition finishes — the
    // acknowledgment lands as a second beat after the cinematic.
    // State rules: latest wins (deterministic). Event acks (REPEAT_ACK):
    // queued, never dropped by a later state change.
    const rec = { rule, state, reason, extra }
    if (rule === REPEAT_RULE.rule) pendingAcks.push(rec)
    else pendingStateRule = rec
    return false
  }
  const L = lights()
  const before = L ? { dim: L.target, warmth: L.warmthTarget } : null
  if (L && !REDUCED_MOTION) {
    try {
      L.dimTo(rule.dim)
      L.setWarmth(rule.warmth)
    } catch (err) { /* lighting is non-essential */ }
  }
  const after = L ? { dim: L.target, warmth: L.warmthTarget } : null
  // The rule, with its reason — Judge Mode's proof chain. lightsBefore/after
  // prove the spatial response actually landed at fire time (later systems
  // like the portal may move the lights again — that's real, not a failure).
  emit('DIRECTOR_RULE', {
    source: 'engine',
    data: { rule: rule.rule, state, reason, response: rule.response, dim: rule.dim, warmth: rule.warmth, lightsBefore: before, lightsAfter: after, ...extra },
    significance: 0.9,
  })
  return true
}

function doubleBlip(pan) {
  // Audio accent for recognized repeats — guarded, non-essential.
  try {
    if (hq.ambience && hq.ambience.blip) {
      hq.ambience.blip(pan || 0)
      setTimeout(() => { try { hq.ambience.blip(pan || 0) } catch (e) {} }, 140)
    }
  } catch (e) { /* audio is non-essential */ }
}

export function init() {
  const offs = []
  offs.push(on('BEHAVIOR_STATE', (e) => {
    const { state, reason } = e.data || {}
    const r = RULES[state]
    if (!r || !state) return
    fire(r, state, reason)
  }))
  // Repeat recognition: the INTERACT event carries the memory read
  // (data.memoryRead.priorInteractions). A repeat is acknowledged — visibly.
  // Yields to a homecoming: if this INTERACT also closed a 4s+ return gap,
  // RULE_RETURN_ACK already fired for it — one clear beat, not two.
  offs.push(on('INTERACT', (e) => {
    const mr = e.data && e.data.memoryRead
    if (!mr || mr.priorInteractions < 1) return
    if (e.data && e.data.returned) return
    let pan = 0
    try {
      if (e.position) pan = Math.max(-1, Math.min(1, e.position[0] / 3))
    } catch (err) {}
    if (fire(REPEAT_RULE, 'REPEAT', `${shortTarget(e.target)} interacted ${mr.priorInteractions + 1}x — memory read confirmed`, { target: e.target })) {
      doubleBlip(pan)
    }
  }))
  return () => offs.forEach((off) => { try { off() } catch (e) {} })
}

function shortTarget(t) {
  if (!t) return 'unknown'
  const parts = String(t).split('.')
  return parts[parts.length - 1]
}
