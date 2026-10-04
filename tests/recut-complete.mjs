// recut-complete.mjs — verify recut -> hook -> end with AI/network disabled.
// Pumps Director._tickRecut manually (headless SwiftShader is too slow for the
// frame-driven dwell), then lets the watchdog-driven say() chains finish.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const GB = process.cwd();
const DIST = GB + '/dist';
const EV = GB + '/tests/evidence';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };

const browser = await chromium.launch({ headless: true, executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 } })).newPage();
await page.route('**/*', async (route) => {
  try {
    const u = new URL(route.request().url());
    let p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(DIST, p);
    if (!file.startsWith(DIST) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, contentType: MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(file) });
  } catch (e) { return route.fulfill({ status: 500, body: String(e).slice(0, 200) }); }
});
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('https://127.0.0.1:5173/?netfail=1', { waitUntil: 'load' });
await page.waitForTimeout(6000);
await page.click('button:has-text("PREVIEW (NO HEADSET)")');
await page.waitForTimeout(3000);

const result = await page.evaluate(async () => {
  const d = window.__hq.director;
  const hq = window.__hq;
  const out = { states: [], recutOrder: null, origOrder: null, endcard: false };
  const waitFor = (want, ms) => new Promise((res, rej) => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      if (d.state === want) { clearInterval(iv); out.states.push('reached:' + want); res(true); }
      else if (performance.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout@' + d.state)); }
    }, 400);
  });
  try {
    // seed a conversation history, then trigger the recut directly
    d._history = [
      { role: 'visitor', text: 'Gary, be honest — do you actually want to be famous?' },
      { role: 'gary', text: 'The network goblins ate your words.' },
    ];
    d._asked = 1;
    // capture the recut slide order (compared against src/director/script.js SLIDES in shell)
    d.playRecut();
    out.states.push('recut-started');
    out.recutOrder = d._recutSlides.map((s) => s.title);
    // pump the recut dwell manually (4s per slide)
    for (let i = 0; i < 8; i++) {
      d._tickRecut(4.5);
      await new Promise((r) => setTimeout(r, 150));
      if (d.state !== 'recut') break;
    }
    out.states.push('after-pump:' + d.state);
    await waitFor('hook', 30000);
    await waitFor('end', 90000); // hook lines run on watchdogs
    await new Promise((r) => setTimeout(r, 3000));
    out.endcard = !!document.querySelector('.hq-endcard');
    out.states.push('endcard-visible:' + out.endcard);
    return { ok: true, ...out };
  } catch (e) { return { ok: false, error: String(e).slice(0, 200), ...out }; }
});
console.log('RECUT-COMPLETE:', JSON.stringify(result, null, 1));
await page.screenshot({ path: EV + '/20261002-f-recut-hook-end.png' });
await browser.close();
