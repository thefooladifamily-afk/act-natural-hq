// judge-mode-test.mjs — P3: Judge Mode INTEGRATION test.
//
//   npm run judge-mode-test   (additive script; see package.json)
//
// JudgeMode.jsx exists, is mounted in App.jsx, and reads live
// EventBus/SessionMemory/BehaviorEngine state — but it was NEVER
// integration-tested. This script:
//
//   1. opens the app, enters flat preview
//   2. asserts the overlay is hidden before activation
//   3. types "judge" (the real hidden activation) and asserts it opens
//   4. performs the three acceptance interactions (action, different
//      action, repeat) — real DOM .click() through activate(), no fakes
//   5. asserts the overlay shows the LIVE propagation of the judge's OWN
//      actions: EVENT -> MEMORY -> STATE -> DIRECTOR -> RESPONSE, plus a
//      real measured FPS reading
//
// Verdicts use ONLY: PASS / FAIL / PARTIAL / NOT TESTED.
// Exit code 0 iff every check PASSes (overall PASS).
//
// Self-contained: starts its own `vite preview` on a dedicated port,
// tears it down afterwards. Emits machine-readable JSON:
//   ~/workspace/evidence-YYYYMMDD/<run-id>/judge-mode-results.json
// plus a CI copy at <project>/test-results/judge-mode-results.json
//
// This script never modifies src/. If a check fails because JudgeMode
// itself is broken, the failure is reported — fixes go to src/debug/
// only, by a human decision, never to the engine.
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawn, execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = process.env.JUDGE_PORT || 4176
process.env.EVIDENCE_PORT = String(PORT) // before lib import (static imports run first)
const lib = await import('./lib/acceptance-lib.mjs')

const root = dirname(fileURLToPath(import.meta.url))
const project = join(root, '..')

function dateDir() {
  const d = new Date()
  return `evidence-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
function commit() { try { return execSync('git rev-parse --short HEAD', { cwd: project }).toString().trim() } catch { return 'unknown' } }

const runId = process.argv[2] || `judge-mode-${Date.now().toString(36)}`
const outDir = join(process.env.HOME, 'workspace', dateDir(), runId)
mkdirSync(outDir, { recursive: true })

function startServer() {
  return new Promise((resolve, reject) => {
    const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
      cwd: project, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const t0 = Date.now()
    srv.on('error', reject)
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`http://localhost:${PORT}/`)
        if (r.ok) { clearInterval(poll); resolve(srv) }
      } catch {}
      if (Date.now() - t0 > 45000) { clearInterval(poll); reject(new Error('preview server did not start')) }
    }, 1000)
  })
}

// The overlay's rendered text, scoped to the fixed panel (not the header row:
// the "JUDGE MODE" <strong> sits inside a header <div>, so we walk up to the
// ancestor <div> with position:fixed — the panel root).
const overlayText = (page) => page.evaluate(() => {
  const strongs = [...document.querySelectorAll('strong')]
  const title = strongs.find((s) => s.textContent.trim() === 'JUDGE MODE')
  if (!title) return null
  let el = title
  while (el && !(el.tagName === 'DIV' && getComputedStyle(el).position === 'fixed')) {
    el = el.parentElement
  }
  return el ? el.innerText : null
})

const overlayOpen = (page) => page.evaluate(() =>
  [...document.querySelectorAll('strong')].some((s) => s.textContent.trim() === 'JUDGE MODE'))

const checks = []
const c = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail: String(detail).slice(0, 300) })
  console.log(`[judge]   ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + String(detail).slice(0, 120) : ''}`)
}

let server, browser, page, errors = []
try {
  console.log(`[judge] starting preview server on :${PORT}…`)
  server = await startServer()
  console.log('[judge] launching headless browser…')
  const h = await lib.launch()
  browser = h.browser; page = h.page; errors = h.errors
  await lib.enterPreview(page)

  // 1 — hidden before activation
  c('overlay hidden before activation', !(await overlayOpen(page)))

  // 2 — activate Judge Mode via its real "type judge" key sequence.
  // NOTE (root-caused 2026-10-03): page.keyboard.type() was tried first and
  // FAILED — not an app bug. Under headless SwiftShader the main thread is so
  // saturated that CDP-dispatched key events arrive 1.5–4s apart, and
  // JudgeMode's 1500ms inter-key buffer reset (correct UX for humans, who
  // type 5 chars in <1s on real hardware) clears the sequence mid-typing.
  // Synthetic KeyboardEvents dispatched in-page are the reliable programmatic
  // equivalent — this is exactly how the app's own QA checklist
  // (src/qa/checklist.js test 8d) activates it, and the handler cannot tell
  // the difference. The activation path itself is genuinely tested.
  await page.evaluate(() => {
    for (const ch of 'judge') window.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }))
  })
  let opened = false
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('strong')].some((s) => s.textContent.trim() === 'JUDGE MODE'),
      { timeout: 8000 })
    opened = true
  } catch { opened = false }
  c('overlay opens on typing "judge"', opened)
  if (!opened) throw new Error('Judge Mode did not open — cannot test propagation')

  // 3 — SCENARIO 1: one action -> full pipeline, visible in the overlay
  console.log('[judge] scenario 1: one action…')
  await lib.scenarioOneAction(page, null)
  await page.waitForTimeout(2500) // overlay re-renders on bus events; let it settle
  let t = await overlayText(page)
  c('overlay shows the INTERACT event (live stream)', !!t && t.includes('INTERACT'), t && t.includes('INTERACT') ? 'stream live' : 'missing INTERACT')
  c('overlay shows DIRECTOR_RULE RULE_COMMIT_ADVANCE', !!t && t.includes('RULE_COMMIT_ADVANCE'))
  c('overlay behavior state reads COMMITTED', !!t && /state:\s*COMMITTED/i.test(t), (t && t.match(/state:\s*\S+/i) || [''])[0])
  c('overlay memory section counted events', !!t && /events:\s*[1-9]\d*/i.test(t), (t && t.match(/events:\s*\S+/i) || [''])[0])

  // 4 — SCENARIO 2: different action -> different state/response, for a traceable reason
  console.log('[judge] scenario 2: different action…')
  await lib.scenarioTwoPattern(page, null)
  await page.waitForTimeout(2500)
  t = await overlayText(page)
  c('overlay shows the RETURN event', !!t && t.includes('RETURN'), 'judge returned to an earlier target')
  c('overlay shows RULE_RETURN_ACK (different rule, traceable reason)', !!t && t.includes('RULE_RETURN_ACK'))
  c('overlay behavior state reads RETURNING (differs from COMMITTED)', !!t && /state:\s*RETURNING/i.test(t), (t && t.match(/state:\s*\S+/i) || [''])[0])

  // 5 — SCENARIO 3: repeat -> recognized -> different response
  console.log('[judge] scenario 3: repeat recognition…')
  await lib.scenarioRepeatRecognition(page, null)
  await page.waitForTimeout(2500)
  t = await overlayText(page)
  c('overlay shows MEMORY_READ (memory was read on the repeat)', !!t && t.includes('MEMORY_READ'))
  c('overlay shows RULE_REPEAT_ACK (recognized, different response)', !!t && t.includes('RULE_REPEAT_ACK'))
  c('overlay stream shows the judge\'s own action target', !!t && t.includes('directorConsole'),
    'target "directorConsole" = the console button the test clicked')

  // 6 — real measured FPS (rAF deltas, never faked — JudgeMode measures it live).
  // The frame-time ms value must parse > 0: that is unambiguously a measured
  // rAF delta, not a placeholder.
  const fpsM = t && t.match(/fps:\s*(\d+)/i)
  const frameM = t && t.match(/frame:\s*([\d.]+)\s*ms/i)
  const frameMs = frameM ? parseFloat(frameM[1]) : 0
  c('overlay shows a real measured FPS reading', !!(fpsM && frameMs > 0), fpsM && frameM ? `${fpsM[1]} fps / ${frameM[1]} ms` : 'no numeric fps/frame reading')
} catch (e) {
  c('test harness completed without exception', false, String(e).message || e)
} finally {
  if (browser) await browser.close()
  if (server) server.kill()
}

const passed = checks.filter((x) => x.pass).length
const total = checks.length
const overall = total === 0 ? 'NOT TESTED'
  : passed === total ? 'PASS'
  : passed === 0 ? 'FAIL' : 'PARTIAL'

const results = {
  generatedAt: new Date().toISOString(), commit: commit(),
  test: 'judge-mode-integration', overall, pass: passed, total,
  checks,
  pageErrors: errors.slice(0, 10),
  notes: 'Judge Mode reads live EventBus/SessionMemory/BehaviorEngine state. ' +
    'Every overlay assertion above was checked against the judge\'s OWN freshly-performed actions in this run.',
}
const outFile = join(outDir, 'judge-mode-results.json')
writeFileSync(outFile, JSON.stringify(results, null, 2))
mkdirSync(join(project, 'test-results'), { recursive: true })
writeFileSync(join(project, 'test-results', 'judge-mode-results.json'), JSON.stringify(results, null, 2))
console.log(`\n[judge] overall: ${overall} (${passed}/${total})`)
console.log(`[judge] report:  ${outFile}`)
process.exit(overall === 'PASS' ? 0 : 1)
