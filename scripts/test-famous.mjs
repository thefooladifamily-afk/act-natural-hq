import { chromium } from 'playwright'
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const page = await (await browser.newContext()).newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2000)
await page.locator('text=PREVIEW (NO HEADSET)').first().click()
await page.waitForFunction(() => window.__hq && window.__hq.director, null, { timeout: 30000 }).catch(() => {})
await page.waitForTimeout(3000)
// click the Famous button
const btn = page.locator('text=GARY PERFORMS')
console.log('button count:', await btn.count())
await btn.first().click()
await page.waitForTimeout(3000)
const state = await page.evaluate(() => ({
  hasVoice: !!window.__hq?.voice,
  famousAudio: !!window.__hq?.voice?._famousAudio,
  paused: window.__hq?.voice?._famousAudio?.paused,
  currentTime: window.__hq?.voice?._famousAudio?.currentTime,
  src: window.__hq?.voice?._famousAudio?.src?.slice(-30),
}))
console.log('STATE:', JSON.stringify(state))
console.log('ERRORS:', errors.length, errors.slice(0, 5))
await browser.close()
