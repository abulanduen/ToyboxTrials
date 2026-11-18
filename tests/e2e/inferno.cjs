/* Production-preview flow: Pavilion → Inferno → input/pause → results → hub. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, 'output');
fs.mkdirSync(out, { recursive: true });
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
    for (const mobile of [false, true]) {
      const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: mobile, isMobile: mobile });
      page.setDefaultTimeout(60000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low', tutorials: false }, version: 0 })));
      await page.goto((process.env.BASE_URL || 'http://localhost:4173/') + '?debug#play');
      await page.waitForSelector('.loading', { state: 'detached' });
      await page.evaluate(() => window.__toybox.teleport(0, -12.6, Math.PI));
      await page.waitForSelector('.prompt');
      if (mobile) await page.locator('.prompt').tap(); else await page.keyboard.press('KeyE');
      await page.getByTestId('practice-inferno-escape').click();
      // Match buttons ignore taps for 0.7 s after they appear, and the module loads lazily.
      await page.getByTestId('match-start').waitFor({ state: 'visible' });
      await page.waitForTimeout(900);
      await page.getByTestId('match-start').click();
      // Software GL can render at ~1 fps under load; fast-forward the 3 s countdown.
      await page.waitForFunction(() => window.__toybox.match.phase() === 'countdown');
      await page.evaluate(() => window.__toybox.match.timeScale(10));
      await page.waitForFunction(() => window.__toybox.match.phase() === 'playing');
      // Freeze time for a readable visual checkpoint, then resume for real input.
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      await page.screenshot({ path: path.join(out, `inferno-${mobile ? 'phone' : 'desktop'}.png`), timeout: 240000 }); // software GL under load is slow
      const start = await page.evaluate(() => ({ ...window.__toybox.match.state().players[0] }));
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      if (mobile) {
        assert.equal(await page.locator('.touch-stick-zone').count(), 1, 'touch joystick shown');
        assert.equal(await page.getByRole('button', { name: 'Up', exact: true }).count(), 0, 'no direction pads');
      }
      if (mobile) await stickUntil(page, [1, 0], x => window.__toybox.match.state().players[0].x > x, start.x);
      else { await page.keyboard.down('KeyD'); await page.waitForTimeout(100); await page.keyboard.up('KeyD'); }
      await page.waitForFunction(x => window.__toybox.match.state().players[0].x > x, start.x);
      // Face the boundary without moving; then face back to a guaranteed vacant spawn tile.
      if (mobile) await stickUntil(page, [-1, 0], () => window.__toybox.match.state().players[0].facing === 3); else await page.keyboard.press('KeyA');
      // Let that queued press land first; with slow frames it could otherwise turn the toy after the setup below.
      await page.waitForFunction(() => window.__toybox.match.state().players[0].facing === 3);
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
      await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
      await page.getByTestId('results-leave').click();
      await page.waitForSelector('.hud-sign');
      assert.deepEqual(errors, []);
      console.log(`PASS Inferno ${mobile ? 'touch portrait' : 'desktop'}: entry, movement, pause, results, persistence, return; no page errors`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
