/* Verify every illustrated tutorial, then touch portrait/landscape navigation and scrolling.
 * BASE_URL=http://localhost:4173/ node tests/e2e/tutorials.cjs */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const games = ['copycat-conductor', 'jack-in-the-box', 'find-the-original', 'red-light-green-light', 'wind-up-dash', 'inferno-escape', 'midnight-hunger', 'music-box-rhythm', 'blink-duel', 'spellbox-showdown', 'toy-squad', 'odd-page-out', 'toy-tower-tumble'];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const layout of (process.argv[2] || 'desktop,portrait,landscape').split(',')) {
      const mobile = layout !== 'desktop';
      const context = await browser.newContext({ viewport: layout === 'desktop' ? { width: 1280, height: 800 } : layout === 'portrait' ? { width: 390, height: 844 } : { width: 844, height: 390 }, hasTouch: mobile, isMobile: mobile });
      const page = await context.newPage();
      page.setDefaultTimeout(240000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.url().includes('/assets/ui/tutorials/') && r.status() !== 200) errors.push(`${r.status()} ${r.url()}`); });
      await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low', tutorials: true }, version: 0 })));
      await page.goto(BASE + '?debug#play');
      await page.waitForFunction(() => window.__toybox?.match && !document.querySelector('.loading'));
      const click = async id => mobile ? page.getByTestId(id).tap() : page.getByTestId(id).click();
      for (const id of mobile ? ['copycat-conductor', 'toy-tower-tumble'] : games) {
        await page.evaluate(id => window.__toybox.match.practice(id), id);
        await page.getByTestId('tutorial').waitFor();
        let step = 1;
        while (true) {
          await page.waitForFunction(() => {
            const img = document.querySelector('.tutorial__visual img');
            return img?.complete && img.naturalWidth === 960 && img.naturalHeight === 540;
          });
          assert.equal(await page.locator('.tutorial__visual img').getAttribute('src'), `./assets/ui/tutorials/${id}-${step}.webp`);
          assert.ok(await page.locator('.tutorial__text strong').count(), `${id} step ${step} highlights its instructions`);
          assert.equal(await page.locator('.tutorial__visual img').getAttribute('alt'), await page.locator('.tutorial__visual figcaption').textContent());
          const bounds = await page.locator('.tutorial__visual img').boundingBox();
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize().width, 'photo fits screen width');
          if (id === 'copycat-conductor' && step === 2) {
            const text = await page.locator('.tutorial__text').textContent();
            assert.ok(text.includes(mobile ? 'tapping' : 'A, S, J and K'), 'uses the correct device controls');
          }
          const last = (await page.getByTestId('tutorial-next').textContent()).includes('Got it');
          if (step === 2 && id === 'toy-tower-tumble') {
            await page.getByTestId('tutorial').screenshot({ path: path.join(OUT, `tutorial-${layout}-merge.png`), timeout: 240000 });
          }
          await click('tutorial-next');
          if (last) break;
          step++;
          await page.waitForFunction(step => document.querySelector('[data-testid=tutorial-step]')?.textContent.trim().startsWith(`${step} /`), step);
        }
        await page.getByTestId('tutorial').waitFor({ state: 'detached' });
        await click('tutorial-open');
        assert.match(await page.getByTestId('tutorial-step').textContent(), /1\s*\//, 'reopening starts at step one');
        // Back is reachable on all layouts, including a short phone with a scrollable intro card.
        await click('tutorial-next'); await click('tutorial-back');
        assert.match(await page.getByTestId('tutorial-step').textContent(), /1\s*\//);
        console.log(`${layout}: ${id} ${step} illustrated steps PASS`);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
