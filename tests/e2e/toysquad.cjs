/* Pavilion → solo workshop → formation/upgrade/sell → 3 auto-battles → records → hub. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const out = path.join(__dirname, 'output'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const layout of (process.env.SQUAD_LAYOUTS || 'desktop,portrait,landscape').split(',')) {
      const mobile = layout !== 'desktop'; const viewport = layout === 'portrait' ? { width: 390, height: 844 } : layout === 'landscape' ? { width: 844, height: 390 } : { width: 1280, height: 800 };
      const page = await browser.newPage({ viewport, hasTouch: mobile, isMobile: mobile }); page.setDefaultTimeout(90000);
      const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low' }, version: 0 })));
      const state = () => page.evaluate(() => window.__toybox.match.state());
      const click = async id => { const button = page.getByTestId(id); if (mobile) await button.tap(); else await button.click(); };
      await page.goto((process.env.BASE_URL || 'http://127.0.0.1:4174/') + '?debug#play');
      await page.waitForSelector('.loading', { state: 'detached' }); await page.evaluate(() => window.__toybox.teleport(0, -12.6, Math.PI));
      await page.waitForSelector('.prompt'); if (mobile) await page.locator('.prompt').tap(); else await page.keyboard.press('KeyE');
      await click('practice-toy-squad'); await page.waitForTimeout(800); await click('match-start');
      await page.waitForFunction(() => window.__toybox.match.phase() === 'playing');
      await click('squad-buy-soldier'); await page.waitForFunction(() => window.__toybox.match.state().players[0].units.length === 1);
      await click('squad-cell-0'); await click('squad-upgrade');
      await page.waitForFunction(() => window.__toybox.match.state().players[0].units[0].tier === 2);
      await click('squad-buy-robot'); await page.waitForFunction(() => window.__toybox.match.state().players[0].units.length === 2);
      assert.equal((await state()).players[0].coins, 0);
      assert.equal(await page.getByTestId('squad-buy-hare').isDisabled(), true);
      await click('squad-cell-2'); await page.waitForFunction(() => window.__toybox.match.state().players[0].units[0].cell === 2);
      await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
      await click('squad-cell-1'); await click('squad-sell');
      await page.waitForFunction(() => window.__toybox.match.state().players[0].units.length === 1);
      await click('squad-buy-soldier'); await page.waitForFunction(() => window.__toybox.match.state().players[0].units.length === 2);
      await page.getByRole('button', { name: 'Pause', exact: true }).click(); await page.waitForSelector('.pause');
      const t = (await state()).t; await page.waitForTimeout(250); assert.equal((await state()).t, t);
      await page.keyboard.press('Escape'); await page.waitForSelector('.pause', { state: 'detached' });
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      await page.screenshot({ path: path.join(out, `toysquad-${layout}-build.png`) });
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      // Desktop controls also work through native keyboard activation.
      if (!mobile) { await page.getByTestId('squad-ready').focus(); await page.keyboard.press('Enter'); } else await click('squad-ready');
      await page.waitForFunction(() => window.__toybox.match.state().phase === 'battle');
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      await page.screenshot({ path: path.join(out, `toysquad-${layout}-battle.png`) });
      assert.equal((await state()).battles[0].opponent, 'clockwork');
      await page.evaluate(() => window.__toybox.match.timeScale(10));
      for (let round = 2; round <= 3; round++) {
        await page.waitForFunction(r => { const s = window.__toybox.match.state(); return s.round === r && s.phase === 'build'; }, round);
        await page.evaluate(() => window.__toybox.match.timeScale(1));
        assert.ok((await state()).players[0].coins >= 10); assert.ok((await state()).players[0].units.length >= 2);
        await click('squad-buy-hare'); await page.waitForTimeout(250); await click('squad-ready');
        await page.waitForFunction(() => window.__toybox.match.state().phase === 'battle');
        await page.evaluate(() => window.__toybox.match.timeScale(10));
      }
      await page.waitForSelector('.results');
      const record = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['toy-squad']);
      assert.equal(record.plays, 1); assert.ok(record.best >= 0);
      await page.waitForTimeout(800); await click('results-again');
      await page.waitForFunction(() => window.__toybox.match.phase() === 'playing');
      assert.equal((await state()).round, 1); assert.equal((await state()).players[0].units.length, 0);
      await page.getByRole('button', { name: 'Pause', exact: true }).click(); await page.waitForTimeout(800);
      await page.locator('.pause__actions .toy-btn').nth(1).click(); await page.waitForSelector('.hud-sign');
      assert.deepEqual(errors, []);
      console.log(`PASS Toy Squad ${layout}: shop, limits, upgrade, formation, sell, pause, keyboard/touch Ready, three battles, income, records, restart and hub return; no console/page errors`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
