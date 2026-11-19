/* Preview browser flow: Pavilion → Midnight → battery/energy/day/shelter → results → hub. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, 'output'); fs.mkdirSync(out, { recursive: true });
/** Push the touch joystick (CDP touch events) in a direction until `until(arg)` holds in the page, then let go. */
async function stickUntil(page, [dx, dy], until, arg) {
  const cdp = await page.context().newCDPSession(page);
  const zone = await page.locator('.touch-stick-zone').boundingBox();
  const x = zone.x + zone.width * 0.4, y = zone.y + zone.height * 0.55;
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([px, py]) => ({ x: px, y: py, id: 1 })) });
  await send('touchStart', [[x, y]]);
  await send('touchMove', [[x + dx * 20, y + dy * 20]]);
  await send('touchMove', [[x + dx * 60, y + dy * 60]]);
  try { await page.waitForFunction(until, arg); } finally { await send('touchEnd', []); await cdp.detach(); }
}
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const layout of (process.env.MIDNIGHT_LAYOUTS || 'desktop,portrait,landscape').split(',')) {
      const mobile = layout !== 'desktop';
      const viewport = layout === 'portrait' ? { width: 390, height: 844 } : layout === 'landscape' ? { width: 844, height: 390 } : { width: 1280, height: 800 };
      const page = await browser.newPage({ viewport, hasTouch: mobile, isMobile: mobile }); page.setDefaultTimeout(90000);
      const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low', tutorials: false }, version: 0 })));
      await page.goto((process.env.BASE_URL || 'http://localhost:4173/') + '?debug#play');
      await page.waitForSelector('.loading', { state: 'detached' });
      await page.evaluate(() => window.__toybox.teleport(0, -12.6, Math.PI));
      await page.waitForSelector('.prompt');
      if (mobile) await page.locator('.prompt').tap(); else await page.keyboard.press('KeyE');
      await page.getByTestId('practice-midnight-hunger').click();
      // The module loads lazily and match buttons ignore taps for 0.7 s after they appear.
      await page.getByTestId('match-start').waitFor({ state: 'visible' }); await page.waitForTimeout(900);
      if (process.env.MIDNIGHT_BAR_REVIEW) await page.getByRole('button', { name: '7 bots', exact: true }).click();
      await page.getByTestId('match-start').click();
      // Software GL can render at ~1 fps under load; fast-forward the 3 s countdown.
      await page.waitForFunction(() => window.__toybox.match.phase() === 'countdown');
      await page.evaluate(() => window.__toybox.match.timeScale(10));
      await page.waitForFunction(() => window.__toybox.match.phase() === 'playing');
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      assert.equal(await page.evaluate(() => { const s = window.__toybox.match.state(); return s.batteries.length === s.players.length - 1; }), true);
      if (process.env.MIDNIGHT_BAR_REVIEW) {
        const energy = await page.evaluate(() => {
          const s = window.__toybox.match.state(), original = s.players.map(p => p.energy);
          s.players.forEach((p, i) => { p.energy = [100, 75, 50, 25, 10, 90, 40, 5][i] / 100 * s.config.maxEnergy; });
          return original;
        });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: path.join(out, `midnight-${layout}-energy-bars.png`), timeout: 240000 });
        await page.evaluate(values => { window.__toybox.match.state().players.forEach((p, i) => { p.energy = values[i]; }); }, energy);
      }
      // Controlled battery next to the local toy tests the real movement and collection adapter.
      const startX = await page.evaluate(() => {
        const s = window.__toybox.match.state(); const p = s.players[0];
        p.energy = 40; s.nextTarget = 99999;
        s.players.slice(1).forEach((other, i) => { other.x = 9; other.z = i; other.nextMove = 999999; });
        p.nextMove = 0;
        s.batteries[0].x = p.x + 1; s.batteries[0].z = p.z;
        return p.x;
      });
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      if (mobile) {
        assert.equal(await page.locator('.touch-stick-zone').count(), 1, 'touch joystick shown');
        assert.equal(await page.getByRole('button', { name: 'Up', exact: true }).count(), 0, 'no direction pads');
      }
      if (mobile) await stickUntil(page, [1, 0], () => window.__toybox.match.state().players[0].facing === 1); else await page.keyboard.press('KeyD');
      await page.waitForFunction(() => window.__toybox.match.state().players[0].facing === 1);
      assert.equal(await page.evaluate(() => window.__toybox.match.state().players[0].x), startX, 'battery bot blocks movement');
      assert.equal(await page.evaluate(() => window.__toybox.match.state().players[0].fed), false, 'contact does not collect');
      for (let hit = 1; hit <= 3; hit++) {
        await page.waitForFunction(() => { const s = window.__toybox.match.state(); return s.t >= s.players[0].nextHit; });
        if (mobile) await page.getByRole('button', { name: 'Hit', exact: true }).tap(); else await page.keyboard.press('Space');
        await page.waitForFunction(n => window.__toybox.match.state().batteries[0].hits === n, hit);
        assert.equal(await page.evaluate(() => window.__toybox.match.state().players[0].fed), hit === 3);
      }
      if (mobile) await stickUntil(page, [1, 0], x => window.__toybox.match.state().players[0].x > x, startX); else await page.keyboard.press('KeyD');
      await page.waitForFunction(x => window.__toybox.match.state().players[0].x > x, startX);
      assert.ok(await page.evaluate(() => window.__toybox.match.state().players[0].energy > 60));
      await page.getByRole('button', { name: 'Pause', exact: true }).click(); await page.waitForSelector('.pause');
      const pausedAt = await page.evaluate(() => window.__toybox.match.state().t); await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.__toybox.match.state().t), pausedAt);
      await page.keyboard.press('Escape'); await page.waitForSelector('.pause', { state: 'detached' });
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      await page.screenshot({ path: path.join(out, `midnight-${layout}-night.png`), timeout: 240000 }); // software GL under load is slow
      // Cross the actual rules boundary and inspect daytime shelter behaviour.
      await page.evaluate(() => { const s = window.__toybox.match.state(); s.players[0].x = 1; s.players[0].z = 1; s.players[0].energy = 100; window.__toybox.match.timeScale(15); });
      await page.waitForFunction(() => window.__toybox.match.state().phase === 'day');
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      await page.waitForFunction(() => document.querySelector('.hunger-banner')?.textContent.includes('Sheltered'));
      await page.screenshot({ path: path.join(out, `midnight-${layout}-day.png`), timeout: 240000 }); // software GL under load is slow
      const energy = await page.evaluate(() => window.__toybox.match.state().players[0].energy);
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      // Wait on the condition rather than a fixed delay: slow frames can run no step in 600 ms.
      await page.waitForFunction(e => window.__toybox.match.state().players[0].energy < e, energy);
      assert.ok(await page.evaluate(e => window.__toybox.match.state().players[0].energy < e, energy), 'shelter slows drain without stopping it');
      await page.evaluate(() => window.__toybox.match.timeScale(40));
      await page.waitForSelector('.results');
      const record = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['midnight-hunger']);
      assert.equal(record.plays, 1);
      await page.waitForTimeout(800); await page.getByTestId('results-again').click();
      await page.waitForFunction(() => window.__toybox.match.phase() === 'playing');
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      assert.equal(await page.evaluate(() => window.__toybox.match.state().players[0].batteries), 0);
      await page.getByRole('button', { name: 'Pause', exact: true }).click(); await page.waitForSelector('.pause');
      await page.waitForTimeout(800); // shared buttons deliberately ignore the first 700 ms
      await page.locator('.pause__actions .toy-btn').nth(1).click(); await page.waitForSelector('.hud-sign');
      assert.deepEqual(errors, []);
      console.log(`PASS Midnight ${layout}: entry, scarcity, movement, battery/recharge, pause, day/shelter, results, record, restart, hub return; no console/page errors`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
