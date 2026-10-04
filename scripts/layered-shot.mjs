import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
const outDir = '/home/hatch/workspace/your_files/theater-qc'
mkdirSync(outDir, { recursive: true })
const stamp = new Date().toISOString().slice(11, 16).replace(':', '')
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const page = await (await browser.newContext()).newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 200)))
await page.goto('http://localhost:5173/?layered=1', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2000)
await page.locator('text=PREVIEW (NO HEADSET)').first().click()
await page.waitForFunction(() => window.__hq && window.__hq.scene, null, { timeout: 30000 }).catch(() => {})
await page.waitForTimeout(5000)
const cdp = await page.context().newCDPSession(page)
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
const p = `${outDir}/layered-25d-${stamp}.png`
writeFileSync(p, Buffer.from(data, 'base64'))
console.log('SHOT', p, 'errors:', errors.length, errors.slice(0, 3))
await browser.close()
