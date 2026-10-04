// WORKER C — performance measurement script (read-only probe of dist/).
// Serves dist over local HTTP, loads index.html headless, records:
//  - navigation + paint timings
//  - every network request with encoded size and timing (waterfall)
//  - time until #root renders content (app interactive marker)
//  - WebAudio decode cost of the largest audio asset (famous.mp3)
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const DIST = process.argv[2] || path.resolve('dist');
const PORT = 8123;

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', DIST], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const requests = [];
const browser = await chromium.launch();
const page = await browser.newPage();

page.on('response', async (res) => {
  try {
    const req = res.request();
    const buf = await res.body().catch(() => null);
    requests.push({
      url: req.url().replace(`http://127.0.0.1:${PORT}`, ''),
      status: res.status(),
      bytes: buf ? buf.length : 0,
      type: req.resourceType(),
      timing: res.timing(),
    });
  } catch {}
});

const t0 = Date.now();
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
const loadMs = Date.now() - t0;

// wait for the app to actually render something into #root
let interactiveMs = null;
try {
  const t1 = Date.now();
  await page.waitForFunction(
    () => document.querySelector('#root') && document.querySelector('#root').innerHTML.trim().length > 100,
    { timeout: 30000 }
  );
  interactiveMs = Date.now() - t0;
} catch (e) {
  interactiveMs = `TIMEOUT after ${Date.now() - t0}ms`;
}

const perf = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0]?.toJSON() || null;
  const paints = performance.getEntriesByType('paint').map(p => ({ name: p.name, startTime: Math.round(p.startTime) }));
  const resources = performance.getEntriesByType('resource').map(r => ({
    name: r.name.split('/').slice(-2).join('/'),
    type: r.initiatorType,
    transfer: r.transferSize,
    duration: Math.round(r.duration),
    start: Math.round(r.startTime),
  })).sort((a, b) => a.start - b.start);
  return { nav, paints, resources };
});

const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

// --- audio decode cost: fetch famous.mp3 and decodeAudioData in-page ---
const decode = await page.evaluate(async () => {
  const tA = performance.now();
  const resp = await fetch('./audio/famous.mp3');
  const buf = await resp.arrayBuffer();
  const fetchMs = performance.now() - tA;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const tB = performance.now();
  let decoded = null, err = null;
  try {
    decoded = await ctx.decodeAudioData(buf.slice(0));
  } catch (e) { err = String(e).slice(0, 200); }
  const decodeMs = performance.now() - tB;
  return {
    bytes: buf.byteLength,
    fetchMs: Math.round(fetchMs),
    decodeMs: Math.round(decodeMs),
    durationSec: decoded ? Math.round(decoded.duration * 10) / 10 : null,
    channels: decoded ? decoded.numberOfChannels : null,
    sampleRate: decoded ? decoded.sampleRate : null,
    err,
  };
}).catch(e => ({ err: 'evaluate failed: ' + String(e).slice(0, 200) }));

const totalBytes = requests.reduce((s, r) => s + r.bytes, 0);
const out = {
  measuredAtUTC: new Date().toISOString(),
  dist: DIST,
  navLoadMs: loadMs,
  interactiveMs,
  paints: perf.paints,
  nav: perf.nav ? {
    domContentLoaded: Math.round(perf.nav.domContentLoadedEventEnd),
    loadEvent: Math.round(perf.nav.loadEventEnd),
    transferSize: perf.nav.transferSize,
    encodedBodySize: perf.nav.encodedBodySize,
  } : null,
  requestCount: requests.length,
  totalTransferBytes: totalBytes,
  totalTransferMB: Math.round(totalBytes / 1048576 * 100) / 100,
  consoleErrors,
  audioDecode: decode,
  resourceWaterfall: perf.resources,
  requestList: requests.map(r => ({ url: r.url, bytes: r.bytes, type: r.type, status: r.status })),
};

fs.writeFileSync('/tmp/perf-measure.json', JSON.stringify(out, null, 2));
console.log('=== summary ===');
console.log('nav load (load event):', loadMs, 'ms');
console.log('interactive (#root rendered):', interactiveMs, 'ms');
console.log('paints:', JSON.stringify(perf.paints));
console.log('requests:', requests.length, '| total transfer:', Math.round(totalBytes / 1048576 * 100) / 100, 'MB');
console.log('audio decode:', JSON.stringify(decode));
console.log('console errors:', consoleErrors.length);

await browser.close();
server.kill();
