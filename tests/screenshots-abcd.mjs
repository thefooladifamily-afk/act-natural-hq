// screenshots-abcd.mjs — evidence for Tasks A–D.
// Proven sandbox recipe (from tests/xr-verify.mjs): the sandbox Chromium
// has no network access at all, so dist/ is served from disk via Playwright
// route interception; navigation goes to https://127.0.0.1:5173/ with
// --allow-insecure-localhost + ignoreHTTPSErrors.
//
// Drives the REAL pipeline through window.__hq and captures:
//   1. a1-recut-beat-dimmed.png — staged recut, mid-sequence (lights down,
//      Marlow's bridge line quoting the visitor's exact words)
//   2. a2-recut-title-card.png — the YOU SAID IT title card in-world
//      (game-time driven via director.tick: SwiftShader runs ~0.3fps, so
//      real-time slide dwells would take minutes)
//   3. cd-hud-governor.png — the in-scene perf HUD (?perf=1) with the
//      governor driven white-box to L6, proving every ladder step
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const GB = '/home/hatch/workspace/goals/meta-vr-start-developer-competition-prize/hidden_files/hq-v5-greybox'
const DIST = GB + '/dist'
const EV = GB + '/tests/evidence'
const APP_URL = 'https://127.0.0.1:5173/?perf=1'

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

async function serveDist(page) {
  await page.route('**/*', async (route) => {
    try {
      const u = new URL(route.request().url())
      let p = decodeURIComponent(u.pathname)
      if (p === '/' || p === '') p = '/index.html'
      const file = path.join(DIST, p)
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        return route.fulfill({ status: 404, body: 'not found' })
      }
      const ext = path.extname(file).toLowerCase()
      return route.fulfill({ status: 200, contentType: MIME[ext] || 'application/octet-stream', body: fs.readFileSync(file) })
    } catch (e) { return route.fulfill({ status: 500, body: String(e).slice(0, 200) }) }
  })
}

const browser = await chromium.launch({
  headless: true,
  executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--disable-features=LocalNetworkAccessChecks', '--allow-insecure-localhost'],
})
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))
await serveDist(page)

await page.goto(APP_URL, { waitUntil: 'load' })
await page.waitForFunction(() => window.__hq && window.__hq.director, null, { timeout: 30000 })
await page.evaluate(() => {
  document.querySelectorAll('.hq-overlay').forEach((el) => { el.style.display = 'none' })
})
await page.waitForTimeout(3000)

// ---- TASK A: the staged beat, driven through the real pipeline ----
await page.evaluate(() => { window.__hq.director.startTalk() })
await page.waitForTimeout(2500)
await page.evaluate(async () => {
  await window.__hq.director.askLine({
    id: 'ask-fame', target: 'gary', trigger: 'protest',
    label: 'GARY: DO YOU WANT TO BE FAMOUS?',
    question: 'Gary, be honest — do you actually want to be famous?',
  })
})
await page.evaluate(() => { window.__hq.director.endTalk() }) // -> playRecut()
await page.waitForTimeout(3000) // lights snap dimmed (huge dt) + bridge caption
await page.screenshot({ path: EV + '/a1-recut-beat-dimmed.png' })

// game-time drive to the YOU SAID IT title card (slide index 1)
await page.evaluate(() => { window.__hq.director.tick(4) })
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/a2-recut-title-card.png' })

// ---- TASK D: governor ladder, white-box driven ----
const ladder = await page.evaluate(() => {
  const g = window.__hq.governor
  const L = window.__hq.lights
  const dir = () => L.dirLight()
  const snap = () => ({
    level: g.level,
    shadow: dir() ? dir().shadow.mapSize.x : null,
    pixel: +window.__hq.gl.getPixelRatio().toFixed(2),
    castShadow: dir() ? dir().castShadow : null,
    far: g._ctx.camera.far,
  })
  const steps = [{ step: 'L0-full', ...snap() }]
  for (let lvl = 1; lvl <= 6; lvl++) {
    for (let i = 0; i < 65; i++) g.update(50) // force over-budget
    steps.push({ step: 'L' + lvl, ...snap(), lastLog: g.log[g.log.length - 1] })
  }
  // recovery: force under-budget -> should step back up
  for (let i = 0; i < 650; i++) g.update(5)
  steps.push({ step: 'recovered', ...snap() })
  return steps
})
console.log('ladder:', JSON.stringify(ladder, null, 1))

await page.waitForTimeout(1500) // HUD redraws at 2Hz
await page.screenshot({ path: EV + '/cd-hud-governor.png' })

await browser.close()
console.log('done')
