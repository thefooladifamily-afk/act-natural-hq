import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 200)))
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.click('text=PREVIEW (NO HEADSET)', { force: true })
await page.waitForFunction(() => window.__hq && window.__hq.director, { timeout: 20000 })
await page.waitForTimeout(6000)
const qa = await page.evaluate(async () => { return await window.__hq.qa.run() })
console.log('QA CLEAN:', JSON.stringify({ ok: qa.ok, failed: qa.failed, skipped: qa.skipped }))
for (const r of qa.results) console.log(`  [${r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'SKIP'}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
console.log('CONSOLE ERRORS:', errors.length)
errors.slice(0, 10).forEach((e) => console.log('  ERR:', e))
try { await page.screenshot({ path: '/tmp/smoke_clean.png', timeout: 60000 }); console.log('SHOT ok') } catch (e) { console.log('SHOT failed:', String(e.message).slice(0, 80)) }
await browser.close()
