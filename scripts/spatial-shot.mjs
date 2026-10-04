// Spatial captures via real mouse-drag look controls (same as a user).
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
const outDir = '/home/hatch/workspace/your_files/theater-qc'
mkdirSync(outDir, { recursive: true })
const stamp = new Date().toISOString().slice(11, 16).replace(':', '')
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const page = await (await browser.newContext()).newPage({ viewport: { width: 1280, height: 800 } })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2000)
await page.locator('text=PREVIEW (NO HEADSET)').first().click()
await page.waitForFunction(() => window.__hq && window.__hq.scene, null, { timeout: 30000 }).catch(() => {})
await page.waitForTimeout(4000)
const cdp = await page.context().newCDPSession(page)
async function shot(name) {
  await page.waitForTimeout(1000)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const p = `${outDir}/spatial-${name}-${stamp}.png`
  writeFileSync(p, Buffer.from(data, 'base64'))
  console.log('SHOT', p)
}
async function drag(dx, dy) {
  await page.mouse.move(640, 400)
  await page.mouse.down()
  await page.mouse.move(640 + dx, 400 + dy, { steps: 12 })
  await page.mouse.up()
}
await shot('front')
await drag(-260, 0); await shot('left')    // look left
await drag(260, 0)                          // back to center
await drag(260, 0); await shot('right')    // look right
await drag(-260, 0)                         // back to center
await drag(0, -300); await shot('ceiling') // look up
await browser.close()
