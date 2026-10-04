// scripts/progress-shot.mjs — screenshot the current dev build for Amy's check-ins.
// Uses CDP captureScreenshot (no font-wait hang). Usage: node scripts/progress-shot.mjs [label]
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
const label = process.argv[2] || 'progress'
const outDir = '/home/hatch/workspace/your_files/theater-qc'
mkdirSync(outDir, { recursive: true })
const stamp = new Date().toISOString().slice(11, 16).replace(':', '')
const path = `${outDir}/emerald-${label}-${stamp}.png`
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const page = await (await browser.newContext()).newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 200)))
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2000)
await page.locator('text=PREVIEW (NO HEADSET)').first().click()
await page.waitForFunction(() => window.__hq && window.__hq.director, null, { timeout: 30000 }).catch(() => {})
await page.waitForTimeout(4000)
const cdp = await page.context().newCDPSession(page)
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
const { writeFileSync } = await import('fs')
writeFileSync(path, Buffer.from(data, 'base64'))
console.log('SHOT', path, 'errors:', errors.length)
await browser.close()
