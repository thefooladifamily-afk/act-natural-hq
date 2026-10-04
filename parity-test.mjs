import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 200));
  });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message.slice(0, 200)));

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Enter flat mode
  const entered = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const preview = btns.find(b => b.textContent.includes('PREVIEW') || b.textContent.includes('Enter'));
    if (preview) { preview.click(); return true; }
    return false;
  });
  console.log('Entered flat mode:', entered);
  await page.waitForTimeout(3000);

  // Check interactives registry
  const interactives = await page.evaluate(() => {
    if (!window.__hq || !window.__hq.qa) return null;
    return window.__hq.qa.interactives();
  });
  console.log('Registered interactives:', JSON.stringify(interactives, null, 2));

  // Verify expected IDs exist
  const ids = (interactives || []).map(i => i.id);
  const expected = [
    'screeningRoom.vote.swing',
    'screeningRoom.vote.chime', 
    'screeningRoom.vote.cats',
    'screeningRoom.famousButton',
  ];
  for (const id of expected) {
    console.log(`${ids.includes(id) ? 'PASS' : 'FAIL'}: ${id} registered`);
  }

  // Test vote activation via unified funnel
  const voteResult = await page.evaluate(() => {
    const rec = window.__hq.qa.interactives().find(i => i.id === 'screeningRoom.vote.swing');
    return { found: !!rec, id: rec?.id, kind: rec?.kind };
  });
  console.log('Vote record:', JSON.stringify(voteResult));

  // Check for console errors
  console.log('Console errors:', errors.length);
  errors.slice(0, 5).forEach(e => console.log('  -', e));

  await browser.close();
})();
