// WORKER C — measures the full flat-preview load: landing -> click PREVIEW -> 3D scene interactive.
// Records full resource waterfall, per-asset timing/size, and time-to-scene.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const DIST = process.argv[2] || path.resolve('dist');
const PORT = 8124;

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', DIST], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));

const t0 = Date.now();
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
console.log('page load event at', Date.now() - t0, 'ms');

// click PREVIEW (NO HEADSET) — text-based, tolerant of rebuilds
await page.waitForFunction(
  () => [...document.querySelectorAll('button')].some(b => b.textContent.includes('PREVIEW')),
  { timeout: 30000 }
);
const tClick = Date.now();
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button.hq-btn')];
  const b = btns.find(x => x.textContent.includes('PREVIEW'));
  if (b) b.click();
});
console.log('clicked PREVIEW at', tClick - t0, 'ms');

// wait for the 3D canvas to appear and first frames to render
let canvasMs = null;
try {
  await page.waitForSelector('canvas', { timeout: 30000 });
  canvasMs = Date.now() - tClick;
  console.log('canvas appeared at +', canvasMs, 'ms after click');
} catch { console.log('NO CANVAS after 30s'); }

// let assets settle: wait until network is quiet for 3s or 40s max
const tSettle = Date.now();
await page.evaluate(() => new Promise((resolve) => {
  let last = performance.now(), quiet = 0;
  const iv = setInterval(() => {
    const entries = performance.getEntriesByType('resource');
    const latest = entries.length ? Math.max(...entries.map(e => e.startTime + e.duration)) : 0;
    if (performance.now() - latest > 3000) { clearInterval(iv); resolve(); }
    if (performance.now() - last > 40000) { clearInterval(iv); resolve(); }
  }, 500);
}));
const settleMs = Date.now() - tSettle;
console.log('asset settle took', settleMs, 'ms');

// sample FPS for 5 seconds after settle
const fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0;
  const start = performance.now();
  const tick = () => { frames++; if (performance.now() - start < 5000) requestAnimationFrame(tick); else resolve(frames / 5); };
  requestAnimationFrame(tick);
}));
console.log('approx FPS (5s window):', fps);

const perf = await page.evaluate(() => ({
  paints: performance.getEntriesByType('paint').map(p => ({ name: p.name, startTime: Math.round(p.startTime) })),
  resources: performance.getEntriesByType('resource').map(r => ({
    name: r.name.split('/').pop(),
    path: r.name.replace(/^https?:\/\/[^/]+\//, ''),
    type: r.initiatorType,
    transfer: r.transferSize,
    duration: Math.round(r.duration),
    start: Math.round(r.startTime),
  })).sort((a, b) => a.start - b.start),
  mem: performance.memory ? {
    jsHeapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
    jsHeapLimitMB: Math.round(performance.memory.jsHeapSizeLimit / 1048576),
  } : null,
  renderer: (() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'no-context';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
  })(),
}));

const totalTransfer = perf.resources.reduce((s, r) => s + (r.transfer || 0), 0);
const out = {
  measuredAtUTC: new Date().toISOString(),
  dist: DIST,
  clickToCanvasMs: canvasMs,
  settleAfterCanvasMs: settleMs,
  totalClickToSettledMs: (canvasMs || 0) + settleMs,
  fps5s: fps,
  paints: perf.paints,
  mem: perf.mem,
  renderer: perf.renderer,
  consoleErrors,
  resourceCount: perf.resources.length,
  totalTransferBytes: totalTransfer,
  totalTransferMB: Math.round(totalTransfer / 1048576 * 100) / 100,
  resources: perf.resources,
};

fs.writeFileSync('/tmp/perf-scene.json', JSON.stringify(out, null, 2));
console.log('=== top assets by transfer size ===');
[...perf.resources].sort((a, b) => (b.transfer || 0) - (a.transfer || 0)).slice(0, 15)
  .forEach(r => console.log(String(Math.round(r.transfer / 1024)).padStart(6) + ' KB  +' + String(r.start).padStart(6) + 'ms  ' + r.name));
console.log('console errors:', consoleErrors.length, consoleErrors.slice(0, 5));

await browser.close();
server.kill();
