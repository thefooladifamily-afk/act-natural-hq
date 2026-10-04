import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 200) ))
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
await page.screenshot({ path: '/tmp/smoke_intro.png' })
// click PREVIEW (NO HEADSET)
await page.click('text=PREVIEW (NO HEADSET)')
await page.waitForTimeout(4000)
await page.screenshot({ path: '/tmp/smoke_flat.png' })
// check loft loaded
const loft = await page.evaluate(() => window.__hq && window.__hq.loft)
console.log('LOFT:', JSON.stringify(loft))
// run QA checklist
const qa = await page.evaluate(async () => { return await window.__hq.qa.run() })
console.log('QA RESULT:', JSON.stringify({ ok: qa.ok, failed: qa.failed, skipped: qa.skipped }))
for (const r of qa.results) console.log(`  [${r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'SKIP'}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
console.log('CONSOLE ERRORS:', errors.length)
errors.slice(0, 8).forEach((e) => console.log('  ERR:', e))
await browser.close()
