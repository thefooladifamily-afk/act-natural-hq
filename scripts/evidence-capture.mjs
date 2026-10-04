// evidence-capture.mjs — automated acceptance evidence capture.
//
// Runs the three behavioral acceptance scenarios against a RUNNING local
// build (npm run preview on dist, default port 4173), captures screenshots
// and a Playwright video of the sequence, and saves everything to a dated
// evidence dir with a JSON manifest + results JSON for acceptance-report.mjs.
//
// Usage:  npm run preview -- --port 4173   (separate shell)
//         node scripts/evidence-capture.mjs [run-id]
//
// Output: ~/workspace/evidence-YYYYMMDD/<run-id>/{
//   manifest.json, results.json, summary.html, summary.md,
//   *.png (per-step screenshots), *.webm (session video)
// }
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderHTML, renderMarkdown } from './acceptance-report.mjs'
import {
  PORT, launch, enterPreview, snap,
  scenarioOneAction, scenarioTwoPattern, scenarioRepeatRecognition,
  summarize,
} from './lib/acceptance-lib.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const project = join(root, '..')

function dateDir() {
  const d = new Date()
  return `evidence-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
function commit() {
  try { return execSync('git rev-parse --short HEAD', { cwd: project }).toString().trim() }
  catch { return 'unknown' }
}

const runId = process.argv[2] || `run-${Date.now().toString(36)}`
const outDir = join(process.env.HOME, 'workspace', dateDir(), runId)
mkdirSync(outDir, { recursive: true })

const media = []
const shots = async (label) => {
  const file = `${label}.png`
  await page.screenshot({ path: join(outDir, file) })
  media.push({ label, file, capturedAt: new Date().toISOString() })
}

let page, browser, errors
try {
  const h = await launch(outDir)
  browser = h.browser; page = h.page; errors = h.errors
  console.log('[evidence] entering flat preview…')
  await enterPreview(page)
  await page.screenshot({ path: join(outDir, '00-landing-in-scene.png') })
  media.push({ label: 'in-scene', file: '00-landing-in-scene.png', capturedAt: new Date().toISOString() })

  console.log('[evidence] TEST 1: one-action…')
  const s1 = await scenarioOneAction(page, shots)
  console.log('[evidence] TEST 2: two-pattern…')
  const s2 = await scenarioTwoPattern(page, shots)
  console.log('[evidence] TEST 3: repeat-recognition…')
  const s3 = await scenarioRepeatRecognition(page, shots)

  const scenarios = summarize([s1, s2, s3])
  const final = await snap(page)
  const results = {
    generatedAt: new Date().toISOString(),
    commit: commit(),
    buildUrl: `http://localhost:${PORT}/`,
    scenarios,
    finalPipelineState: final,
    pageErrors: errors.slice(0, 10),
  }
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2))
  writeFileSync(join(outDir, 'summary.html'), renderHTML(results))
  writeFileSync(join(outDir, 'summary.md'), renderMarkdown(results))
  const manifest = {
    runId,
    capturedAt: results.generatedAt,
    commit: results.commit,
    buildUrl: results.buildUrl,
    scenarios: scenarios.map((s) => ({ name: s.name, verdict: s.verdict, checks: `${s.pass}/${s.total}` })),
    media: media.map((m) => m.file),
    video: existsSync(join(outDir)) ? 'see Playwright video dir' : null,
    notes: 'All interactions were real DOM .click() events through activate() -> the canonical pipeline. No simulated events.',
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('\n=== SUMMARY ===')
  for (const s of scenarios) console.log(`  ${s.verdict}  ${s.name}  (${s.pass}/${s.total})`)
  console.log('page errors:', errors.length)
  console.log('evidence dir:', outDir)
} finally {
  if (browser) await browser.close()
}
