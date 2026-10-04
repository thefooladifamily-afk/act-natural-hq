// acceptance.mjs — THE automated acceptance command.
//
//   npm run acceptance
//
// Runs the three behavioral acceptance tests end-to-end against the REAL
// pipeline (input -> event -> memory -> state -> director -> response):
//   1. one-action: a deterministic desktop interaction travels the full pipeline
//   2. two-pattern: a different action -> different state + response, traceable
//   3. repeat-recognition: A -> others -> A again -> memory read -> different response
//
// Every interaction is a real DOM .click() through the same activate()
// funnel a user triggers. No simulated events.
//
// Emits a machine-readable JSON report:
//   ~/workspace/evidence-YYYYMMDD/<run-id>/acceptance-results.json
// with per-test verdicts (PASS/FAIL/PARTIAL/NOT TESTED/NOT IMPLEMENTED) and
// the exact event -> memory -> state -> director -> response trace per test.
//
// Exit code: 0 if all three tests PASS, 1 otherwise (CI blocks on this).
//
// The script starts its own `vite preview` server on a dedicated port and
// tears it down afterwards, so it is fully self-contained.
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawn, execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = process.env.ACCEPTANCE_PORT || 4175
process.env.EVIDENCE_PORT = String(PORT) // before lib import (static imports run first)
const lib = await import('./lib/acceptance-lib.mjs')

const root = dirname(fileURLToPath(import.meta.url))
const project = join(root, '..')

function dateDir() {
  const d = new Date()
  return `evidence-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
function commit() { try { return execSync('git rev-parse --short HEAD', { cwd: project }).toString().trim() } catch { return 'unknown' } }
function branch() { try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd: project }).toString().trim() } catch { return 'unknown' } }

const runId = process.argv[2] || `acceptance-${Date.now().toString(36)}`
const outDir = join(process.env.HOME, 'workspace', dateDir(), runId)
mkdirSync(outDir, { recursive: true })

function startServer() {
  return new Promise((resolve, reject) => {
    const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
      cwd: project, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const t0 = Date.now()
    const onData = () => {
      fetch(`http://localhost:${PORT}/`).then((r) => {
        if (r.ok || Date.now() - t0 < 30000) {
          if (r.ok) { srv.stdout.off('data', onData); srv.stderr.off('data', onData); resolve(srv) }
        }
      }).catch(() => {})
    }
    srv.stdout.on('data', onData)
    srv.stderr.on('data', onData)
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

const verdictFor = (s) => lib.verdictFor(s)
let server, browser, page
const results = { generatedAt: new Date().toISOString(), commit: commit(), branch: branch(), buildUrl: `http://localhost:${PORT}/`, tests: [] }
try {
  console.log(`[acceptance] starting preview server on :${PORT}…`)
  server = await startServer()
  console.log('[acceptance] launching headless browser…')
  const h = await lib.launch()
  browser = h.browser; page = h.page
  await lib.enterPreview(page)

  const tests = [
    { name: 'one-action', desc: 'one deterministic interaction travels the full pipeline', run: lib.scenarioOneAction },
    { name: 'two-pattern', desc: 'a different action -> different state + response, for a traceable reason', run: lib.scenarioTwoPattern },
    { name: 'repeat-recognition', desc: 'A -> others -> A again: memory read, recognized, different response', run: lib.scenarioRepeatRecognition },
  ]
  for (const t of tests) {
    console.log(`[acceptance] TEST ${t.name}…`)
    let scenario
    try {
      scenario = await t.run(page, null)
    } catch (e) {
      scenario = { name: t.name, checks: [{ name: 'scenario completed', pass: false, detail: String(e).slice(0, 200) }], durationMs: 0 }
    }
    let trace = null
    try { trace = await lib.captureTrace(page) } catch (e) { trace = { error: String(e).slice(0, 200) } }
    const verdict = verdictFor(scenario)
    results.tests.push({
      name: t.name, description: t.desc, verdict,
      pass: scenario.checks.filter((c) => c.pass).length,
      total: scenario.checks.length,
      durationMs: scenario.durationMs,
      checks: scenario.checks,
      trace,
    })
    console.log(`[acceptance]   ${verdict} (${scenario.checks.filter((c) => c.pass).length}/${scenario.checks.length})`)
  }
  results.pageErrors = h.errors.slice(0, 10)
} finally {
  if (browser) await browser.close()
  if (server) server.kill()
}

const allPass = results.tests.length === 3 && results.tests.every((t) => t.verdict === 'PASS')
results.overall = results.tests.length < 3 ? 'NOT TESTED'
  : allPass ? 'PASS'
  : results.tests.every((t) => t.verdict === 'FAIL') ? 'FAIL' : 'PARTIAL'

const outFile = join(outDir, 'acceptance-results.json')
writeFileSync(outFile, JSON.stringify(results, null, 2))
// CI copy: inside the repo so CI artifacts can pick it up.
mkdirSync(join(project, 'test-results'), { recursive: true })
writeFileSync(join(project, 'test-results', 'acceptance-results.json'), JSON.stringify(results, null, 2))
console.log(`\n[acceptance] overall: ${results.overall}`)
console.log(`[acceptance] report:  ${outFile}`)
process.exit(allPass ? 0 : 1)
