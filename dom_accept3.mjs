// DOM acceptance — the ONE-pipeline proof (temporary debug script).
// Every interaction is a REAL DOM button .click() dispatched in-page
// (real event through the real DOM -> React onClick -> fire() ->
// activate() -> the canonical pipeline). Verifies:
// EventBus -> stream -> SessionMemory -> BehaviorEngine -> Director rule
// -> visible response. Raw output, no polished Judge Mode.
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 120)))
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(15000) // SwiftShader warmup
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('PREVIEW (NO HEADSET)'))
  if (!btn) throw new Error('no preview button')
  btn.click()
})
await page.waitForFunction(() => window.__hq && window.__hq.director, { timeout: 30000 })
await page.waitForTimeout(8000)

let pass = 0, fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}${detail ? ' — ' + detail : ''}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

// Real DOM button click, in-page.
async function realClick(text) {
  const ok = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))
    if (!btn || btn.offsetParent === null) return false
    btn.click()
    return true
  }, text)
  if (!ok) throw new Error('button not visible: ' + text)
}
const snap = () => page.evaluate(() => {
  const hq = window.__hq
  const stream = hq.bus.getStream()
  const lastRule = [...stream].reverse().find((e) => e.type === 'DIRECTOR_RULE')
  return {
    streamTypes: stream.slice(-10).map((e) => e.type),
    memTypes: hq.memory.getEvents().map((e) => e.type + ':' + (e.target || '').split('.').pop()),
    behavior: hq.behavior.getState(),
    lastRule: lastRule && { rule: lastRule.data.rule, state: lastRule.data.state, after: lastRule.data.lightsAfter },
  }
})
async function showVote() {
  await page.evaluate(() => { window.__hq.memory.reset(); window.__hq.director.showVote() })
  // Poll for the vote button (headless frame rate varies wildly; fixed waits flake).
  const t0 = Date.now()
  while (Date.now() - t0 < 40000) {
    const visible = await page.evaluate(() =>
      [...document.querySelectorAll('button')].some((b) => b.textContent.includes('CHIME CHAOS') && b.offsetParent !== null))
    if (visible) break
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(3000) // let newly-visible card shaders compile
}
async function waitForRule(rule, timeoutMs = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const found = await page.evaluate((r) =>
      window.__hq.bus.getStream().some((e) => e.type === 'DIRECTOR_RULE' && e.data.rule === r), rule)
    if (found) return true
    await page.waitForTimeout(500)
  }
  return false
}
// Headless SwiftShader runs ~0.5fps, so the 0.9s portal takes ~35s of wall
// time. Fast-forward its clock; the completion logic (finish + flush of the
// deferred rule) still runs for real on the next frame.
async function settlePortal() {
  await page.evaluate(() => { if (window.__hq.portal) window.__hq.portal.t = 0.999 })
  const t0 = Date.now()
  while (Date.now() - t0 < 15000) {
    const done = await page.evaluate(() => !window.__hq.portal)
    if (done) return true
    await page.waitForTimeout(500)
  }
  return false
}
const liveLights = () => page.evaluate(() => window.__hq.lights
  // Targets are set synchronously by the rule; the damped currents catch
  // up over frames (0.5fps in headless makes that slow — targets are the
  // honest signal here).
  ? { level: +window.__hq.lights.target.toFixed(3), warmth: +window.__hq.lights.warmthTarget.toFixed(3) } : null)

// ---------- TEST 1: cold DOM click -> full 6-step pipeline ----------
console.log('TEST 1: real DOM button click on CHIME CHAOS')
await showVote()
await realClick('CHIME CHAOS')
await settlePortal() // fast-forward the transition; deferred rule flushes for real
check('1.0 rule arrived (deferred past portal if needed)', await waitForRule('RULE_COMMIT_ADVANCE'))
await page.waitForTimeout(3000) // let damped lights settle
let s = await snap()
const live = await liveLights()
check('1.1 EventBus received INTERACT', s.streamTypes.includes('INTERACT'), s.streamTypes.join(' '))
check('1.2 appears in event stream', s.streamTypes.includes('INTERACT'))
check('1.3 SessionMemory recorded it', s.memTypes.some((t) => t.startsWith('INTERACT:chime')), s.memTypes.join(' '))
check('1.4 BehaviorEngine derived a state', !!s.behavior.state, `${s.behavior.state} — ${s.behavior.reason}`)
check('1.5 Director rule fired for that state', !!(s.lastRule && s.lastRule.state === s.behavior.state), s.lastRule && s.lastRule.rule)
check('1.6 response in rule event', !!(s.lastRule && s.lastRule.after && s.lastRule.after.warmth === 0.1 && s.lastRule.after.dim === 1.05), JSON.stringify(s.lastRule && s.lastRule.after))
check('1.7 LIVE lights match (deferral preserved the response)', live && Math.abs(live.level - 1.05) < 0.08 && Math.abs(live.warmth - 0.1) < 0.08, JSON.stringify(live))

// ---------- TEST 2: different interaction -> different state + response ----------
console.log('TEST 2: CHIME, SWING, [4.2s], CHIME again -> RETURNING (different)')
await showVote()
await realClick('CHIME CHAOS')
await page.waitForTimeout(1500)
await realClick('THE SWING SCENE')
await page.waitForTimeout(1500)
await page.waitForTimeout(4200) // past the 4s return gap
await realClick('CHIME CHAOS')
await settlePortal()
check('2.0 RETURN rule arrived', await waitForRule('RULE_RETURN_ACK'))
await page.waitForTimeout(3000)
s = await snap()
const live2 = await liveLights()
const retEvent = await page.evaluate(() => window.__hq.memory.getEvents().find((e) => e.type === 'RETURN'))
check('2.1 RETURN event recognized the previous discovery', !!retEvent, retEvent && `gap=${(retEvent.data.gapMs / 1000).toFixed(1)}s`)
check('2.2 behavioral state is RETURNING (differs from COMMITTED)', s.behavior.state === 'RETURNING', s.behavior.state)
check('2.3 different rule fired', !!(s.lastRule && s.lastRule.rule === 'RULE_RETURN_ACK'), s.lastRule && s.lastRule.rule)
check('2.4 different response', !!(s.lastRule && s.lastRule.after && s.lastRule.after.warmth === 0.3), JSON.stringify(s.lastRule && s.lastRule.after))
check('2.5 LIVE lights match RETURN_ACK', live2 && Math.abs(live2.warmth - 0.3) < 0.08, JSON.stringify(live2))

// ---------- TEST 3: A -> others -> A again -> recognized ----------
// Uses the HUD buttons (GARY SAYS IT / FAMOUS) which route through the same
// activate() funnel but don't start a portal — so rules fire immediately.
// All three clicks in ONE evaluate: the headless main thread is saturated
// (~0.5fps), so separate round-trips add 8-10s of overhead each, blowing
// the 4s return gap. Synchronous in-page clicks are milliseconds apart —
// a true REPEAT, not a RETURN.
console.log('TEST 3: GARY SAYS IT, FAMOUS, GARY SAYS IT (quick) -> repeat recognized')
await page.evaluate(() => { window.__hq.memory.reset() })
await page.evaluate(() => {
  const find = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t) && b.offsetParent !== null)
  const b1 = find('GARY SAYS IT'); if (!b1) throw new Error('no director btn')
  b1.click()
  const b2 = find('FAMOUS'); if (!b2) throw new Error('no famous btn')
  b2.click()
  const b3 = find('GARY SAYS IT'); if (!b3) throw new Error('no director btn (2nd)')
  b3.click()
})
await page.waitForTimeout(2000)
s = await snap()
const live3 = await liveLights()
const memReads = await page.evaluate(() =>
  window.__hq.bus.getStream().filter((e) => e.type === 'MEMORY_READ' && e.target === 'screeningRoom.directorConsole'))
const memRead = memReads[memReads.length - 1] // the LAST read = the repeat
check('3.1 system read memory on the repeat', !!(memRead && memRead.data.repeat), memRead && JSON.stringify(memRead.data))
const rules = await page.evaluate(() =>
  window.__hq.bus.getStream().filter((e) => e.type === 'DIRECTOR_RULE').map((e) => e.data.rule))
check('3.2 RULE_REPEAT_ACK fired', rules.includes('RULE_REPEAT_ACK'), rules.join(','))
check('3.3 prior occurrence counted', !!(memRead && memRead.data.priorInteractions >= 1), memRead && `prior=${memRead.data.priorInteractions}`)
const repeatRuleEvent = await page.evaluate(() =>
  window.__hq.bus.getStream().find((e) => e.type === 'DIRECTOR_RULE' && e.data.rule === 'RULE_REPEAT_ACK'))
check('3.4 REPEAT_ACK carried its response', !!(repeatRuleEvent && repeatRuleEvent.data.lightsAfter.warmth === 0.45),
  repeatRuleEvent && JSON.stringify(repeatRuleEvent.data.lightsAfter))

console.log(`\nRESULT: ${pass} pass, ${fail} fail`)
console.log('PAGE ERRORS:', errors.length, errors.slice(0, 4))
await browser.close()
process.exit(fail ? 1 : 0)
