/* Production-preview flow: Pavilion → Inferno → input/pause → results → hub. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, 'output');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const mobile of [false, true]) {
      const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: mobile, isMobile: mobile });
      page.setDefaultTimeout(60000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low' }, version: 0 })));
      await page.goto((process.env.BASE_URL || 'http://localhost:4173/') + '?debug#play');
      await page.waitForSelector('.loading', { state: 'detached' });
      await page.evaluate(() => window.__toybox.teleport(0, -12.6, Math.PI));
      await page.waitForSelector('.prompt');
      if (mobile) await page.locator('.prompt').tap(); else await page.keyboard.press('KeyE');
      await page.getByTestId('practice-inferno-escape').click();
      await page.waitForTimeout(800);
      await page.getByTestId('match-start').click();
      await page.waitForFunction(() => window.__toybox.match.phase() === 'playing');
      // Freeze time for a readable visual checkpoint, then resume for real input.
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      await page.screenshot({ path: path.join(out, `inferno-${mobile ? 'phone' : 'desktop'}.png`) });
      const start = await page.evaluate(() => ({ ...window.__toybox.match.state().players[0] }));
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      if (mobile) await page.getByRole('button', { name: 'Right', exact: true }).tap();
      else { await page.keyboard.down('KeyD'); await page.waitForTimeout(100); await page.keyboard.up('KeyD'); }
      await page.waitForFunction(x => window.__toybox.match.state().players[0].x > x, start.x);
      // Face the boundary without moving; then face back to a guaranteed vacant spawn tile.
      if (mobile) await page.getByRole('button', { name: 'Left', exact: true }).tap(); else await page.keyboard.press('KeyA');
      await page.evaluate(() => {
        const s = window.__toybox.match.state(); const p = s.players[0];
        p.x = 4; p.z = 4; p.facing = 0;
        s.tiles[3 * 11 + 4] = 'rock'; p.nextBreak = 0;
      });
      if (mobile) await page.getByRole('button', { name: 'Break', exact: true }).tap(); else await page.keyboard.press('Space');
      await page.waitForFunction(() => window.__toybox.match.state().tiles[3 * 11 + 4] === 'floor');
      if (mobile) await page.getByRole('button', { name: 'Build wall', exact: true }).tap(); else await page.keyboard.press('KeyR');
      await page.waitForFunction(() => window.__toybox.match.state().players[0].wallUsed);
      assert.equal(await page.evaluate(() => window.__toybox.match.state().tiles[3 * 11 + 4]), 'wall');
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.waitForSelector('.pause');
      const pausedAt = await page.evaluate(() => window.__toybox.match.state().t);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.__toybox.match.state().t), pausedAt);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.pause', { state: 'detached' });
      // Accelerate the complete match; all survivors may legitimately tie at the safety limit.
      await page.evaluate(() => window.__toybox.match.timeScale(40));
      await page.waitForSelector('.results');
      const record = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['inferno-escape']);
      assert.equal(record.plays, 1);
      await page.waitForTimeout(800);
      await page.getByTestId('results-leave').click();
      await page.waitForSelector('.hud-sign');
      assert.deepEqual(errors, []);
      console.log(`PASS Inferno ${mobile ? 'touch portrait' : 'desktop'}: entry, movement, pause, results, persistence, return; no page errors`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
