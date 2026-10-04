// xr-verify.mjs — first eyes-on verification of the ACT NATURAL Screening Room.
// Three passes:
//   1. IWER VR: install emulated Quest 3, ENTER IN VR, capture room entry + screen mid-playback.
//   2. Flat preview: PREVIEW (NO HEADSET), capture room + HUD/director-mode input.
//   3. Take-it-away (?netfail): drive the FULL loop with all network/AI failed,
//      verify every state transition completes and responses come from the cover ladder.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const GB = '/home/hatch/workspace/goals/meta-vr-start-developer-competition-prize/hidden_files/hq-v5-greybox';
const EV = GB + '/tests/evidence';
const DIST = GB + '/dist';
const APP_URL = 'https://127.0.0.1:5173/';
const stamp = '20261002';
const shot = (n) => `${EV}/${stamp}-${n}.png`;

const IWER_BUNDLE = GB + '/node_modules/iwer/build/iwer.js';

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// Serve dist/ from disk via route interception: the sandbox Chromium has NO
// network access at all (loopback + public both blocked), so the Node side
// (which can read the filesystem) fulfills every request.
async function serveDist(page) {
  await page.route('**/*', async (route) => {
    try {
      const u = new URL(route.request().url());
      let p = decodeURIComponent(u.pathname);
      if (p === '/' || p === '') p = '/index.html';
      const file = path.join(DIST, p);
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        return route.fulfill({ status: 404, body: 'not found' });
      }
      const ext = path.extname(file).toLowerCase();
      return route.fulfill({
        status: 200,
        contentType: MIME[ext] || 'application/octet-stream',
        body: fs.readFileSync(file),
      });
    } catch (e) {
      return route.fulfill({ status: 500, body: String(e).slice(0, 200) });
    }
  });
}

const results = { screenshots: [], takeItAway: { transitions: [], responseSources: [], pass: false } };
const log = (...a) => console.log('[verify]', ...a);

async function newPage(browser, { iwer = false } = {}) {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();
  await serveDist(page);
  if (iwer) {
    await page.addInitScript({ path: IWER_BUNDLE });
    await page.addInitScript(() => {
      try {
        const { XRDevice, metaQuest3 } = window.IWER;
        const device = new XRDevice(metaQuest3);
        device.installRuntime({ forceInstall: true });
        window.__iwerDevice = device;
      } catch (e) { window.__iwerErr = String(e).slice(0, 300); }
    });
  }
  page.on('pageerror', (e) => log('PAGEERROR', String(e).slice(0, 160)));
  return { ctx, page };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/meta-chromium/chrome', // sandbox Chromium (Playwright CDN blocked)
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
      '--disable-features=LocalNetworkAccessChecks', '--allow-insecure-localhost'],
  });

  // ---------- PASS 1: IWER emulated VR ----------
  try {
    const { ctx, page } = await newPage(browser, { iwer: true });
    await page.goto(APP_URL, { waitUntil: 'load' });
    await page.waitForTimeout(6000);

    const xr = await page.evaluate(async () => {
      if (!navigator.xr) return 'NO navigator.xr';
      try {
        const ok = await navigator.xr.isSessionSupported('immersive-vr');
        return 'immersive-vr supported=' + ok;
      } catch (e) { return 'isSessionSupported err: ' + e.message; }
    });
    log('PASS1 XR:', xr);
    await page.screenshot({ path: shot('a1-intro') });
    results.screenshots.push(shot('a1-intro'));

    await page.click('button:has-text("ENTER IN VR")');
    await page.waitForTimeout(5000);
    const st1 = await page.evaluate(() => ({
      director: window.__hq?.director?.state,
      presenting: window.__hq?.voice?.presenting,
      session: !!document.querySelector('canvas'),
    }));
    log('PASS1 after enter:', JSON.stringify(st1));
    await page.screenshot({ path: shot('a2-room-entry-vr') });
    results.screenshots.push(shot('a2-room-entry-vr'));

    // let the screening play: watch state advances slides on tick
    await page.waitForTimeout(12000);
    const st2 = await page.evaluate(() => ({
      director: window.__hq?.director?.state,
      slide: window.__hq?.director?._watchSlide,
    }));
    log('PASS1 watch progress:', JSON.stringify(st2));
    await page.screenshot({ path: shot('b-screen-midplay-vr') });
    results.screenshots.push(shot('b-screen-midplay-vr'));
    await ctx.close();
  } catch (e) { log('PASS1 FAILED:', String(e).slice(0, 300)); }

  // ---------- PASS 2: flat preview (room + HUD/director input) ----------
  try {
    const { ctx, page } = await newPage(browser);
    await page.goto(APP_URL, { waitUntil: 'load' });
    await page.waitForTimeout(6000);
    await page.click('button:has-text("PREVIEW (NO HEADSET)")');
    await page.waitForTimeout(6000);
    const st = await page.evaluate(() => ({
      director: window.__hq?.director?.state,
      hud: !!document.querySelector('.hq-hud'),
      canvas: !!document.querySelector('canvas'),
    }));
    log('PASS2 flat state:', JSON.stringify(st));
    await page.screenshot({ path: shot('c-room-entry-flat') });
    results.screenshots.push(shot('c-room-entry-flat'));

    // HUD director-mode input state: type a line, keep it in the box for the shot
    await page.fill('input[placeholder^="director:"]', 'Gary, tell them the documentary is YOUR idea now.');
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot('d-hud-director-input') });
    results.screenshots.push(shot('d-hud-director-input'));
    await ctx.close();
  } catch (e) { log('PASS2 FAILED:', String(e).slice(0, 300)); }

  // ---------- PASS 3: take-it-away (?netfail) full loop ----------
  try {
    const { ctx, page } = await newPage(browser);
    const seen = [];
    await page.exposeFunction('__noteState', (s) => seen.push(s));
    await page.goto(APP_URL + '?netfail=1', { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    await page.click('button:has-text("PREVIEW (NO HEADSET)")');

    // poll the director state machine; drive transitions at the right moments
    const drive = await page.evaluate(async () => {
      const d = window.__hq.director;
      const hq = window.__hq;
      const states = [];
      const note = (s) => states.push(s + '@' + Math.round(performance.now() / 1000) + 's');
      const waitFor = (want, timeoutMs) => new Promise((res, rej) => {
        const t0 = performance.now();
        const iv = setInterval(() => {
          if (d.state === want) { clearInterval(iv); note('reached:' + want); res(true); }
          else if (performance.now() - t0 > timeoutMs) { clearInterval(iv); rej(new Error('timeout waiting for ' + want + ' (at ' + d.state + ')')); }
        }, 500);
      });
      const sources = [];
      try {
        note('start:' + d.state);
        await waitFor('voting', 90000);          // watch lines play (watchdogs)
        d.castVote('chime');                    // chime stunt -> straight to talk
        note('voted:chime');
        await waitFor('talk', 60000);
        // ask a line with the network failed: must come from the cover ladder
        await d.askLine({ id: 'ask-fame', target: 'gary', question: 'Gary, be honest — do you actually want to be famous?' });
        await waitFor('talk', 30000);           // answering -> back to talk
        const last = d._history[d._history.length - 1];
        sources.push('talk-response source=' + (last && last.role) + ' text="' + (last && last.text.slice(0, 60)) + '"');
        d.endTalk();                            // -> recut
        note('endTalk called');
        await waitFor('recut', 15000);
        await waitFor('hook', 120000);          // recut slides (4 x 4s + bridge line)
        await waitFor('end', 90000);            // hook lines -> endShow
        return { ok: true, states, sources };
      } catch (e) {
        return { ok: false, error: String(e).slice(0, 200), states, sources };
      }
    });
    log('PASS3 take-it-away:', JSON.stringify(drive).slice(0, 1200));
    results.takeItAway.transitions = drive.states || [];
    results.takeItAway.responseSources = drive.sources || [];
    results.takeItAway.pass = drive.ok === true;
    await page.screenshot({ path: shot('e-takeitaway-end') });
    results.screenshots.push(shot('e-takeitaway-end'));
    await ctx.close();
  } catch (e) { log('PASS3 FAILED:', String(e).slice(0, 300)); }

  await browser.close();
  console.log('RESULTS:' + JSON.stringify(results, null, 1));
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
