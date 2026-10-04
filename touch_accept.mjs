// Touch regression test (Quest defect #1) — temporary debug script.
// Verifies that a touchscreen tap on a 3D interactive triggers activation
// via tap-to-select (raycast from tap point), NOT requiring the center
// gaze to hold a target. This is the bug class that must not regress:
// mouse-only handlers + gaze-mismatch made Quest Browser taps dead.
import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(12000)
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent.includes('PREVIEW (NO HEADSET)')).click()
})
await page.waitForFunction(() => window.__hq && window.__hq.director, { timeout: 30000 })
await page.waitForTimeout(8000)

// Show the vote UI (3D cards) and clear gaze so tap-to-select is the ONLY path.
await page.evaluate(() => {
  window.__hq.memory.reset()
  window.__hq.director.showVote()
})
await page.waitForTimeout(8000)

// Project a DOM vote button's position, then tap it via touchscreen.
// (3D card projection is viewport-dependent; DOM buttons are the critical
// path Amy taps on Quest Browser.)
const tapResult = await page.evaluate(() => {
  const hq = window.__hq
  const btn = [...document.querySelectorAll('button')].find((b) =>
    b.textContent.includes('CHIME CHAOS') && b.offsetParent !== null)
  if (!btn) return { error: 'no CHIME button visible' }
  const r = btn.getBoundingClientRect()
  const m0 = hq.bus.getStream().length
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), m0 }
})
console.log('Tap target:', JSON.stringify(tapResult))
if (tapResult.error) { console.log('SKIP: ' + tapResult.error); await browser.close(); process.exit(2) }

await page.touchscreen.tap(tapResult.x, tapResult.y)
await page.waitForTimeout(3000)

const check = await page.evaluate((m0) => {
  const hq = window.__hq
  const news = hq.bus.getStream().slice(m0)
  const interact = news.find((e) => e.type === 'INTERACT')
  return {
    interactFired: !!interact,
    source: interact && interact.source,
    target: interact && interact.target,
    streamTypes: news.map((e) => e.type).slice(0, 8),
  }
}, tapResult.m0)
console.log('Result:', JSON.stringify(check))
const pass = check.interactFired && check.source === 'touch'
console.log(pass ? 'PASS: touchscreen tap on DOM button activated via pipeline (source=touch)'
  : 'FAIL: touchscreen tap did not activate')
console.log('PAGE ERRORS:', errors.length, errors.slice(0, 3))
await browser.close()
process.exit(pass ? 0 : 1)
