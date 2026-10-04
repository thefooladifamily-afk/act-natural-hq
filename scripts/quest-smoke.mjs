// scripts/quest-smoke.mjs — headless boot check of the Quest build (Worker B).
//
//   node scripts/quest-smoke.mjs [baseUrl]
//
// Default baseUrl: https://localhost:4174/ (scripts/quest-serve.mjs).
// Checks:
//   1. Page loads with ZERO console errors and ZERO pageerrors.
//   2. Landing renders (PREVIEW (NO HEADSET) button visible).
//   3. Clicking PREVIEW enters the flat scene: window.__hq + hq.director exist.
//   4. Reports load/entry timings.
// Exit 0 = PASS, exit 1 = FAIL. This is a boot check only — it does NOT run
// the behavioral acceptance tests (Worker A owns those) and does NOT touch
// src/engine, src/interaction, src/director, or src/characters.
import { chromium } from 'playwright'

const baseUrl = process.argv[2] || 'https://localhost:4174/'
const results = []
async function snap(path) {
  try {
    await page.screenshot({ path, timeout: 10000 })
  } catch (e) {
    console.log(`WARN  screenshot skipped (${path}): ${String(e.message || e).slice(0, 80)}`)
  }
}
const ok = (name, detail) => { results.push({ name, ok: true, detail }); console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`) }
const fail = (name, detail) => { results.push({ name, ok: false, detail }); console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`) }

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))

const t0 = Date.now()
await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 })
const loadMs = Date.now() - t0
await page.waitForTimeout(2500)

// 1. landing renders
const previewBtn = page.locator('text=PREVIEW (NO HEADSET)')
if ((await previewBtn.count()) > 0) ok('landing renders', `load ${loadMs}ms`)
else fail('landing renders', 'PREVIEW button not found')
await snap('/tmp/quest_smoke_landing.png')

// 2. enter flat scene
const t1 = Date.now()
await previewBtn.first().click()
await page.waitForFunction(() => window.__hq && window.__hq.director, null, { timeout: 30000 }).catch(() => {})
const entryMs = Date.now() - t1
await page.waitForTimeout(4000)
const hqState = await page.evaluate(() => ({
  hasHq: !!window.__hq,
  hasDirector: !!(window.__hq && window.__hq.director),
  hasScene: !!(window.__hq && window.__hq.scene),
}))
if (hqState.hasHq && hqState.hasDirector) ok('flat scene entered', `entry ${entryMs}ms, scene=${hqState.hasScene}`)
else fail('flat scene entered', JSON.stringify(hqState))
await snap('/tmp/quest_smoke_scene.png')

// 3. zero console errors
if (errors.length === 0) ok('zero console errors', 'landing + scene entry')
else fail('zero console errors', `${errors.length} errors`)
errors.slice(0, 10).forEach((e) => console.log('  ERR:', e))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\nQUEST SMOKE: ${failed.length === 0 ? 'PASS' : 'FAIL'} (${results.filter((r) => r.ok).length}/${results.length} checks)`)
process.exit(failed.length === 0 ? 0 : 1)
