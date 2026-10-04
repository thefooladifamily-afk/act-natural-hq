// perf-verify-probe.mjs — WORKER C.
// Headless check: the quest-perf-probe records without errors and exports JSON.
// This does NOT validate Quest numbers; it only proves the probe is functional.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 8126;
const probeSrc = fs.readFileSync(path.join(ROOT, 'scripts/perf-probe/quest-perf-probe.js'), 'utf8');

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', path.join(ROOT, 'dist')], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));

// inject the probe manually (simulates the worker's 3-line integration)
await page.addInitScript(probeSrc);
// long capture window: the script drives stop() explicitly (headless timers throttle)
await page.goto(`http://127.0.0.1:${PORT}/index.html?perf=1&capture=600`, { waitUntil: 'load' });
// don't rely on wall-clock auto-stop: drive stop() explicitly
await page.waitForFunction(
  () => window.__questPerf && document.querySelector('#quest-perf-panel'),
  { timeout: 15000 }
);
await page.waitForTimeout(1500);
await page.mouse.click(400, 300);
await page.mouse.click(500, 400);
await page.evaluate(() => {
  window.__questPerf.mark('test-mark');
});
await page.waitForFunction(
  () => { const k = Object.keys(localStorage).filter(x => x.startsWith('quest-perf-')); return k.length > 0 || (window.__questPerf && document.querySelector('#quest-perf-panel')); },
  { timeout: 15000 }
).catch(() => {});
// explicit stop (headless timers are throttled; on real hardware auto-stop fires on time)
await page.evaluate(() => window.__questPerf.stop());
await page.waitForTimeout(500);

const result = await page.evaluate(() => {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('quest-perf-'));
  const panel = document.querySelector('#quest-perf-panel');
  const exported = keys.length ? JSON.parse(localStorage.getItem(keys[0])) : null;
  return {
    api: typeof window.__questPerf,
    keys,
    panelVisible: !!panel,
    panelSaysComplete: panel ? panel.textContent.includes('CAPTURE COMPLETE') : false,
    frames: exported?.frames || null,
    taps: exported?.inputLatency?.length,
    marks: exported?.marks?.length,
    resources: exported?.resources?.length,
  };
});
console.log(JSON.stringify({ errors, result }, null, 1));
const pass = errors.length === 0 && result.panelSaysComplete && result.frames && result.frames.count > 0 && result.taps >= 2;
console.log(pass ? 'PROBE VERIFY: PASS' : 'PROBE VERIFY: FAIL');
await browser.close();
server.kill();
process.exit(pass ? 0 : 1);
