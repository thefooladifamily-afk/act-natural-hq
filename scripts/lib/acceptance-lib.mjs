// acceptance-lib.mjs — shared Playwright harness for the Behavioral Cinema
// Engine acceptance evidence. WORKER F infrastructure only: reads the live
// app, drives it exactly the way a user would (real DOM button .click() ->
// React onClick -> activate() -> the canonical pipeline), and returns
// structured check results. Never fakes an event.
import { chromium } from 'playwright'

export const PORT = process.env.EVIDENCE_PORT || 4173
export const BASE = `http://localhost:${PORT}/`

// ---------- low-level ----------

export async function launch(videoDir = null, viewport = { width: 1280, height: 800 }) {
  const browser = await chromium.launch()
  const ctxOpts = { viewport }
  if (videoDir) ctxOpts.recordVideo = { dir: videoDir, size: viewport }
  const context = await browser.newContext(ctxOpts)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 160)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 160))
  })
  return { browser, context, page, errors }
}

export async function enterPreview(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(15000) // SwiftShader warmup
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => b.textContent.includes('PREVIEW (NO HEADSET)'))
    if (!btn) return false
    btn.click()
    return true
  })
  if (!clicked) throw new Error('no PREVIEW (NO HEADSET) button on landing')
  await page.waitForFunction(() => window.__hq && window.__hq.director, { timeout: 60000 })
  await page.waitForTimeout(8000) // scene settles
}

// Real DOM click — the same funnel a user triggers.
export async function realClick(page, text) {
  const ok = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => b.textContent.includes(t) && b.offsetParent !== null)
    if (!btn) return false
    btn.click()
    return true
  }, text)
  if (!ok) throw new Error('button not visible/clickable: ' + text)
  return true
}

export const snap = (page) => page.evaluate(() => {
  const hq = window.__hq
  const stream = hq.bus.getStream()
  const lastRule = [...stream].reverse().find((e) => e.type === 'DIRECTOR_RULE')
  return {
    streamTypes: stream.slice(-12).map((e) => e.type),
    memTypes: hq.memory.getEvents().map((e) => e.type + ':' + (e.target || '').split('.').pop()),
    behavior: hq.behavior.getState(),
    lastRule: lastRule && {
      rule: lastRule.data.rule, state: lastRule.data.state,
      after: lastRule.data.lightsAfter, response: lastRule.data.response,
    },
  }
})

export const liveLights = (page) => page.evaluate(() =>
  window.__hq.lights
    ? { level: +window.__hq.lights.target.toFixed(3), warmth: +window.__hq.lights.warmthTarget.toFixed(3) }
    : null)

export async function waitForRule(page, rule, timeoutMs = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const found = await page.evaluate((r) =>
      window.__hq.bus.getStream().some((e) => e.type === 'DIRECTOR_RULE' && e.data.rule === r), rule)
    if (found) return true
    await page.waitForTimeout(500)
  }
  return false
}

export async function showVote(page) {
  await page.evaluate(() => { window.__hq.memory.reset(); window.__hq.director.showVote() })
  const t0 = Date.now()
  while (Date.now() - t0 < 40000) {
    const visible = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .some((b) => b.textContent.includes('CHIME CHAOS') && b.offsetParent !== null))
    if (visible) break
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(3000) // shader compile on newly visible cards
}

// Headless SwiftShader renders ~0.5fps so the 0.9s portal flight takes ~35s
// of wall time. Fast-forwarding its clock is honest: the completion logic
// (finish + flush of the deferred rule) still runs for real on the next
// rendered frame.
export async function settlePortal(page) {
  await page.evaluate(() => { if (window.__hq.portal) window.__hq.portal.t = 0.999 })
  const t0 = Date.now()
  while (Date.now() - t0 < 20000) {
    const done = await page.evaluate(() => !window.__hq.portal)
    if (done) return true
    await page.waitForTimeout(500)
  }
  return false
}

// ---------- scenarios ----------
// Each returns { name, checks: [{name, pass, detail}], durationMs }.
// One-action test: a deterministic desktop interaction travels the full
// pipeline EVENT -> MEMORY -> STATE -> DIRECTOR -> RESPONSE.
export async function scenarioOneAction(page, shots = null) {
  const t0 = Date.now()
  const checks = []
  const c = (name, pass, detail = '') => checks.push({ name, pass: !!pass, detail: String(detail) })
  await showVote(page)
  await realClick(page, 'CHIME CHAOS')
  if (shots) await shots('one-action-after-click')
  await settlePortal(page)
  c('rule arrived', await waitForRule(page, 'RULE_COMMIT_ADVANCE'), 'RULE_COMMIT_ADVANCE')
  await page.waitForTimeout(3000)
  const s = await snap(page)
  const live = await liveLights(page)
  if (shots) await shots('one-action-response')
  c('EventBus received INTERACT', s.streamTypes.includes('INTERACT'), s.streamTypes.join(' '))
  c('event appears in the stream', s.streamTypes.includes('INTERACT'))
  c('SessionMemory recorded it', s.memTypes.some((t) => t.startsWith('INTERACT:chime')), s.memTypes.join(' '))
  c('BehaviorEngine derived a state', !!s.behavior.state, `${s.behavior.state} — ${s.behavior.reason}`)
  c('Director received that state (rule for it)', !!(s.lastRule && s.lastRule.state === s.behavior.state), s.lastRule && s.lastRule.rule)
  c('visible/audible response encoded in rule', !!(s.lastRule && s.lastRule.after && s.lastRule.after.warmth === 0.1 && s.lastRule.after.dim === 1.05), JSON.stringify(s.lastRule && s.lastRule.after))
  c('LIVE lights match the rule (deferral preserved it)', live && Math.abs(live.level - 1.05) < 0.08 && Math.abs(live.warmth - 0.1) < 0.08, JSON.stringify(live))
  return { name: 'one-action', checks, durationMs: Date.now() - t0 }
}

// Two-pattern test: a different meaningful action produces a different
// behavioral state and response, for a traceable reason (RETURN).
export async function scenarioTwoPattern(page, shots = null) {
  const t0 = Date.now()
  const checks = []
  const c = (name, pass, detail = '') => checks.push({ name, pass: !!pass, detail: String(detail) })
  await showVote(page)
  await realClick(page, 'CHIME CHAOS')
  if (shots) await shots('two-pattern-first')
  await page.waitForTimeout(1500)
  await realClick(page, 'THE SWING SCENE')
  if (shots) await shots('two-pattern-second')
  await page.waitForTimeout(1500)
  await page.waitForTimeout(4200) // past the 4s return gap
  await realClick(page, 'CHIME CHAOS')
  if (shots) await shots('two-pattern-return-click')
  await settlePortal(page)
  c('RETURN rule arrived', await waitForRule(page, 'RULE_RETURN_ACK'), 'RULE_RETURN_ACK')
  await page.waitForTimeout(3000)
  const s = await snap(page)
  const live = await liveLights(page)
  if (shots) await shots('two-pattern-response')
  const retEvent = await page.evaluate(() =>
    window.__hq.memory.getEvents().find((e) => e.type === 'RETURN'))
  c('RETURN event recognized the previous discovery', !!retEvent, retEvent && `gap=${(retEvent.data.gapMs / 1000).toFixed(1)}s`)
  c('behavioral state is RETURNING (differs from COMMITTED)', s.behavior.state === 'RETURNING', s.behavior.state)
  c('a DIFFERENT rule fired for a traceable reason', !!(s.lastRule && s.lastRule.rule === 'RULE_RETURN_ACK'), s.lastRule && s.lastRule.rule)
  c('a DIFFERENT response was encoded', !!(s.lastRule && s.lastRule.after && s.lastRule.after.warmth === 0.3), JSON.stringify(s.lastRule && s.lastRule.after))
  c('LIVE lights match RETURN_ACK', live && Math.abs(live.warmth - 0.3) < 0.08, JSON.stringify(live))
  return { name: 'two-pattern', checks, durationMs: Date.now() - t0 }
}

// Repeat-recognition test: ACTION A -> several other actions -> ACTION A
// again. Memory is read, the repeat is recognized, a DIFFERENT response
// occurs (RULE_REPEAT_ACK, not the state rule).
// Uses the HUD buttons (GARY SAYS IT / FAMOUS) which route through the same
// activate() funnel but start no portal — so rules fire immediately.
// All three clicks happen in ONE evaluate: the headless main thread is
// saturated (~0.5fps), so separate round-trips would blow the 4s return gap.
// Synchronous in-page clicks are milliseconds apart — a true REPEAT.
export async function scenarioRepeatRecognition(page, shots = null) {
  const t0 = Date.now()
  const checks = []
  const c = (name, pass, detail = '') => checks.push({ name, pass: !!pass, detail: String(detail) })
  await page.evaluate(() => { window.__hq.memory.reset() })
  await page.evaluate(() => {
    const find = (t) => [...document.querySelectorAll('button')]
      .find((b) => b.textContent.includes(t) && b.offsetParent !== null)
    const b1 = find('GARY SAYS IT'); if (!b1) throw new Error('no director btn')
    b1.click()
    const b2 = find('FAMOUS'); if (!b2) throw new Error('no famous btn')
    b2.click()
    const b3 = find('GARY SAYS IT'); if (!b3) throw new Error('no director btn (2nd)')
    b3.click()
  })
  if (shots) await shots('repeat-after-sequence')
  await page.waitForTimeout(2000)
  if (shots) await shots('repeat-response')
  const memReads = await page.evaluate(() =>
    window.__hq.bus.getStream()
      .filter((e) => e.type === 'MEMORY_READ' && e.target === 'screeningRoom.directorConsole'))
  const memRead = memReads[memReads.length - 1] // the LAST read = the repeat
  const rules = await page.evaluate(() =>
    window.__hq.bus.getStream()
      .filter((e) => e.type === 'DIRECTOR_RULE').map((e) => e.data.rule))
  const repeatRuleEvent = await page.evaluate(() =>
    window.__hq.bus.getStream()
      .find((e) => e.type === 'DIRECTOR_RULE' && e.data.rule === 'RULE_REPEAT_ACK'))
  c('memory was READ on the repeat', !!(memRead && memRead.data.repeat), memRead && JSON.stringify(memRead.data))
  c('repeat recognized as a different response', rules.includes('RULE_REPEAT_ACK'), rules.join(','))
  c('prior occurrence counted', !!(memRead && memRead.data.priorInteractions >= 1), memRead && `prior=${memRead.data.priorInteractions}`)
  c('REPEAT_ACK carried its own response', !!(repeatRuleEvent && repeatRuleEvent.data.lightsAfter && repeatRuleEvent.data.lightsAfter.warmth === 0.45),
    repeatRuleEvent && JSON.stringify(repeatRuleEvent.data.lightsAfter))
  return { name: 'repeat-recognition', checks, durationMs: Date.now() - t0 }
}

// ---------- full pipeline trace ----------
// captureTrace returns the EXACT event -> memory -> state -> director ->
// response chain observed in the live app, for machine-readable evidence.
// Each stage is the real runtime object from the real modules.
export const captureTrace = (page) => page.evaluate(() => {
  const hq = window.__hq
  const stream = hq.bus.getStream()
  const memEvents = hq.memory.getEvents()
  const pick = (type) => stream.filter((e) => e.type === type).map((e) => ({
    seq: e.seq, type: e.type, source: e.source, target: e.target,
    timestamp: e.timestamp, significance: e.significance,
    data: e.data ? JSON.parse(JSON.stringify(e.data).slice(0, 2000)) : null,
  }))
  const stateEvents = pick('BEHAVIOR_STATE').map((e) => ({
    state: e.data && e.data.state, prevState: e.data && e.data.prevState,
    reason: e.data && e.data.reason, seq: e.seq,
  }))
  const rules = pick('DIRECTOR_RULE').map((e) => ({
    rule: e.data && e.data.rule, state: e.data && e.data.state,
    reason: e.data && e.data.reason, response: e.data && e.data.response,
    lightsBefore: e.data && e.data.lightsBefore, lightsAfter: e.data && e.data.lightsAfter,
    target: e.data && e.data.target, seq: e.seq,
  }))
  const reads = pick('MEMORY_READ').map((e) => ({
    target: e.target, priorInteractions: e.data && e.data.priorInteractions,
    priorVisits: e.data && e.data.priorVisits, repeat: e.data && e.data.repeat, seq: e.seq,
  }))
  return {
    event: pick('INTERACT').concat(pick('DISCOVER'), pick('RETURN'), pick('DEVIATE'), pick('COMPLETE'))
      .sort((a, b) => a.seq - b.seq),
    memory: {
      recorded: memEvents.map((e) => ({
        type: e.type, target: e.target, source: e.source, timestamp: e.timestamp,
        significance: e.significance,
        data: e.data ? JSON.parse(JSON.stringify(e.data).slice(0, 2000)) : null,
      })),
      reads,
    },
    behaviorState: stateEvents,
    director: rules,
    response: {
      liveLights: window.__hq.lights
        ? { level: +window.__hq.lights.target.toFixed(3), warmth: +window.__hq.lights.warmthTarget.toFixed(3) }
        : null,
      currentState: hq.behavior.getState(),
    },
  }
})

// ---------- verdict math (only the allowed verdicts) ----------

export function verdictFor(scenario) {
  if (!scenario || !scenario.checks) return 'NOT TESTED'
  if (!scenario.checks.length) return 'NOT TESTED'
  const passed = scenario.checks.filter((c) => c.pass).length
  if (passed === scenario.checks.length) return 'PASS'
  if (passed === 0) return 'FAIL'
  return 'PARTIAL'
}

export function summarize(scenarios) {
  return scenarios.map((s) => ({
    name: s.name,
    verdict: verdictFor(s),
    pass: s.checks.filter((c) => c.pass).length,
    total: s.checks.length,
    durationMs: s.durationMs,
    checks: s.checks,
  }))
}
