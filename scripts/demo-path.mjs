// demo-path.mjs — the DETERMINISTIC demo path.
//
// Drives the REAL event -> memory -> state -> director pipeline through the
// three acceptance scenarios, paced so a judge can watch each step. Nothing
// is faked: every interaction is a real DOM .click() through the same
// activate() funnel a user would trigger. The demo path triggers the same
// real pipeline — reliably.
//
// Usage:  npm run preview -- --port 4173   (separate shell)
//         node scripts/demo-path.mjs [run-id]
//
// Output: ~/workspace/evidence-YYYYMMDD/<run-id>/demo-*.{png,webm}, demo-log.json
import { mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  launch, enterPreview, snap, liveLights,
  scenarioOneAction, scenarioTwoPattern, scenarioRepeatRecognition, summarize,
} from './lib/acceptance-lib.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const project = join(root, '..')
function dateDir() {
  const d = new Date()
  return `evidence-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
const runId = process.argv[2] || `demo-${Date.now().toString(36)}`
const outDir = join(process.env.HOME, 'workspace', dateDir(), runId)
mkdirSync(outDir, { recursive: true })

const log = []
const say = (step, caption) => {
  const entry = { step, caption, at: new Date().toISOString() }
  log.push(entry)
  console.log(`[demo ${step}] ${caption}`)
}
const commit = () => { try { return execSync('git rev-parse --short HEAD', { cwd: project }).toString().trim() } catch { return 'unknown' } }

let page, browser
try {
  const h = await launch(outDir)
  browser = h.browser; page = h.page
  say(0, 'THE SCREENING ROOM REMEMBERS WHAT YOU DID — deterministic demo of the real pipeline')
  await enterPreview(page)
  await page.waitForTimeout(2000)
  say(1, 'One pipeline for every input. Watch what happens when I interact.')

  const shots = async (label) => { await page.screenshot({ path: join(outDir, `demo-${label}.png`) }) }
  say(2, 'SCENARIO 1 — I act. The room must notice, remember, and respond.')
  const s1 = await scenarioOneAction(page, shots)
  const st1 = await snap(page)
  say(3, `Scenario 1 result: state=${st1.behavior.state}, rule=${st1.lastRule && st1.lastRule.rule}`)

  await page.waitForTimeout(3000)
  say(4, 'SCENARIO 2 — a different action must produce a different response, for a traceable reason.')
  const s2 = await scenarioTwoPattern(page, shots)
  const st2 = await snap(page)
  say(5, `Scenario 2 result: state=${st2.behavior.state}, rule=${st2.lastRule && st2.lastRule.rule}`)

  await page.waitForTimeout(3000)
  say(6, 'SCENARIO 3 — repeat something from earlier. The room must RECOGNIZE it, not just react.')
  const s3 = await scenarioRepeatRecognition(page, shots)
  const lights = await liveLights(page)
  say(7, `Scenario 3 done. Live lighting after recognition: ${JSON.stringify(lights)}`)
  say(8, 'Demo complete. Every step above ran the REAL event -> memory -> state -> director pipeline. No faked events.')

  const scenarios = summarize([s1, s2, s3])
  writeFileSync(join(outDir, 'demo-log.json'), JSON.stringify({
    runId, generatedAt: new Date().toISOString(), commit: commit(),
    deterministic: true, fakedEvents: false,
    scenarios, steps: log,
  }, null, 2))
  console.log('\n=== DEMO RESULTS ===')
  for (const s of scenarios) console.log(`  ${s.verdict}  ${s.name}  (${s.pass}/${s.total})`)
  console.log('demo dir:', outDir)
} finally {
  if (browser) await browser.close()
}
