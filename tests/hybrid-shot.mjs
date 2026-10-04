// hybrid-shot.mjs — screenshot the hybrid 3D track (?hybrid=1).
// Usage: xvfb-run -a node tests/hybrid-shot.mjs [out.png]
import { chromium } from 'playwright'

const out = process.argv[2] || 'tests/evidence/hybrid-render.png'
const url = process.argv[3] || 'http://localhost:4173/?hybrid=1'

const browser = await chromium.launch({
  executablePath: '/opt/meta-chromium/chrome',
  headless: false,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage',
    '--disable-features=LocalNetworkAccessChecks'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[conerr]', m.text().slice(0, 200))
})
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
// Dismiss the intro overlay via PREVIEW (NO HEADSET).
const btn = page.getByRole('button', { name: /PREVIEW/i })
if (await btn.count()) {
  await btn.first().click()
  console.log('clicked PREVIEW')
} else {
  console.log('no PREVIEW button found')
}
await page.waitForTimeout(9000) // let GLB + textures load and the scene settle
await page.screenshot({ path: out })
console.log('saved', out)
await browser.close()
