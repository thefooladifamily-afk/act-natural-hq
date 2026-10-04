// proof-video.mjs — P4: BEHAVIORAL PROOF VIDEO.
//
// Records a short video proving, on the REAL pipeline (no faked events):
//   action -> response
//   different action -> different response (traceable reason)
//   repeat -> recognition (memory read, different response)
//   Judge Mode reveal showing the judge's OWN event trace propagating live
//
// Every interaction is a real DOM .click() through the same activate()
// funnel a user triggers. A small caption banner labels each step —
// labeling, not editing tricks. Nothing is simulated.
//
// Self-contained: starts its own `vite preview` on a dedicated port,
// tears it down afterwards.
//
// Output: ~/workspace/evidence-YYYYMMDD/proof-<runid>/
//   proof-video.webm, proof-*.png, proof-manifest.json
// plus a CI copy of the manifest at <project>/test-results/proof-manifest.json
import { mkdirSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { spawn, execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = process.env.PROOF_PORT || 4177
process.env.EVIDENCE_PORT = String(PORT) // before lib import (static imports run first)
const lib = await import('./lib/acceptance-lib.mjs')

const root = dirname(fileURLToPath(import.meta.url))
const project = join(root, '..')

function dateDir() {
  const d = new Date()
  return `evidence-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
function commit() { try { return execSync('git rev-parse --short HEAD', { cwd: project }).toString().trim() } catch { return 'unknown' } }

const runId = process.argv[2] || `proof-${Date.now().toString(36)}`
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

const captions = []
const caption = async (page, text) => {
  captions.push({ at: new Date().toISOString(), text })
  console.log(`[proof] ${text}`)
  await page.evaluate((t) => {
    let el = document.getElementById('proof-caption')
    if (!el) {
      el = document.createElement('div')
      el.id = 'proof-caption'
      el.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:50;pointer-events:none;' +
        'background:rgba(8,12,18,0.85);border:1px solid rgba(120,180,255,0.35);border-radius:8px;' +
        'color:#e8f1ff;font:600 15px/1.4 system-ui,sans-serif;padding:10px 14px;max-width:60vw;'
      document.body.appendChild(el)
    }
    el.textContent = t
  }, text)
}
const shot = async (page, label) => {
  // Screenshots are supplementary evidence; the video is primary. Under
  // headless SwiftShader, page.screenshot can time out while video is
  // recording (harness limitation, not an app bug) — never let that kill
  // the proof run.
  try {
    await page.screenshot({ path: join(outDir, `proof-${label}.png`), timeout: 20000 })
  } catch (e) {
    console.log(`[proof] screenshot ${label} skipped: ${String(e.message || e).split('\n')[0].slice(0, 100)}`)
  }
}

const scenarios = []
let server, browser, context, page, errors = []
let videoFile = null
let runError = null
try {
  console.log(`[proof] starting preview server on :${PORT}…`)
  server = await startServer()
  console.log('[proof] launching headless browser (recording video)…')
  const h = await lib.launch(outDir, { width: 1280, height: 800 })
  browser = h.browser; context = h.context; page = h.page; errors = h.errors

  try {
    await lib.enterPreview(page)
  await caption(page, 'THE SCREENING ROOM REMEMBERS WHAT YOU DID — every step below is the real pipeline, recorded.')
  await page.waitForTimeout(2500)

  await caption(page, '1/4 — ACTION: I click. The room must notice, remember, and respond.')
  const s1 = await lib.scenarioOneAction(page, (l) => shot(page, `s1-${l}`))
  scenarios.push(s1)
  await page.waitForTimeout(2000)

  await caption(page, '2/4 — DIFFERENT ACTION: a different response, for a traceable reason.')
  const s2 = await lib.scenarioTwoPattern(page, (l) => shot(page, `s2-${l}`))
  scenarios.push(s2)
  await page.waitForTimeout(2000)

  await caption(page, '3/4 — REPEAT: I do it again. The room RECOGNIZES it — memory, not just reaction.')
  const s3 = await lib.scenarioRepeatRecognition(page, (l) => shot(page, `s3-${l}`))
  scenarios.push(s3)
  await page.waitForTimeout(2000)

  await caption(page, '4/4 — JUDGE MODE: the system proves what just happened — my own actions, live.')
  // Activation via the real "type judge" key sequence. Synthetic dispatch is
  // used instead of keyboard.type: under headless SwiftShader, CDP key events
  // arrive seconds apart and trip JudgeMode's 1500ms inter-key reset (correct
  // for humans on real hardware). Same method as src/qa/checklist.js 8d.
  await page.evaluate(() => {
    for (const ch of 'judge') window.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }))
  })
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('strong')].some((s) => s.textContent.trim() === 'JUDGE MODE'),
      { timeout: 8000 })
  } catch { throw new Error('Judge Mode overlay did not open during proof recording') }
  await page.waitForTimeout(2000)
  await shot(page, 's4-judge-open')
  await caption(page, '4/4 — JUDGE MODE, live: one more action — watch it propagate through the panel.')
  await lib.realClick(page, 'GARY SAYS IT')
  await page.waitForTimeout(5000) // let the event visibly propagate through the open panel
  await shot(page, 's4-judge-propagated')

  await caption(page, 'Every step ran the real event → memory → state → director pipeline. No faked events.')
  await page.waitForTimeout(2500)
  } catch (e) {
    // A failed step must not lose the video or the manifest: record it.
    runError = String(e && e.message || e).slice(0, 300)
    console.log(`[proof] STEP FAILED (video + manifest still saved): ${runError}`)
    try { await caption(page, 'Recording interrupted — partial proof saved honestly.') } catch {}
  }
} finally {
  // Closing the context finalizes the video file.
  if (context) await context.close().catch(() => {})
  if (browser) await browser.close().catch(() => {})
  if (server) server.kill()
}

try {
  const webm = readdirSync(outDir).find((f) => f.endsWith('.webm'))
  if (webm) {
    videoFile = join(outDir, 'proof-video.webm')
    renameSync(join(outDir, webm), videoFile)
  }
} catch {}

const summary = lib.summarize(scenarios)
const manifest = {
  runId, generatedAt: new Date().toISOString(), commit: commit(),
  deterministic: true, fakedEvents: false,
  claim: 'action→response, different action→different response, repeat→recognition, Judge Mode live trace — all on the real pipeline',
  video: videoFile ? 'proof-video.webm' : null,
  runError,
  captions,
  scenarios: summary,
  pageErrors: errors.slice(0, 10),
}
writeFileSync(join(outDir, 'proof-manifest.json'), JSON.stringify(manifest, null, 2))
mkdirSync(join(project, 'test-results'), { recursive: true })
writeFileSync(join(project, 'test-results', 'proof-manifest.json'), JSON.stringify(manifest, null, 2))

console.log('\n=== PROOF VIDEO RESULTS ===')
for (const s of summary) console.log(`  ${s.verdict}  ${s.name}  (${s.pass}/${s.total})`)
console.log('video:', videoFile || 'MISSING')
console.log('dir:', outDir)
const allPass = !runError && summary.length === 3 && summary.every((s) => s.verdict === 'PASS') && !!videoFile
process.exit(allPass ? 0 : 1)
