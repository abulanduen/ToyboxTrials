/* Hoop Hustle: entry from the Hub, real keyboard/mouse and touch input (aim, hold-to-charge, let go in
   the gold zone: a basket), a joystick and the Throw button held at once, pause dropping a charge, the
   sliding-hoop and gold-ball banners, results, the record, restart and the way back to the Hub.
   Desktop, phone portrait and phone landscape (HH_LAYOUTS=desktop,portrait,landscape). Screenshots go
   to tests/e2e/output/hoophustle-<layout>-*.png. Preview server: BASE_URL (default :4173). */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, 'output');
fs.mkdirSync(out, { recursive: true });

/** Hold the touch joystick (CDP touch point 1) pushed in a direction; `holdButton`/`releaseButton` use a second finger. */
async function holdStick(page, [dx, dy]) {
  const cdp = await page.context().newCDPSession(page);
  const zone = await page.locator('.touch-stick-zone').boundingBox();
  const x = zone.x + zone.width * 0.4, y = zone.y + zone.height * 0.55;
  const stick = [x + dx * 60, y + dy * 60];
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([px, py, id]) => ({ x: px, y: py, id })) });
  await send('touchStart', [[x, y, 1]]);
  await send('touchMove', [[x + dx * 20, y + dy * 20, 1]]);
  await send('touchMove', [[...stick, 1]]);
  let button = null;
  return {
    async holdButton(testId) {
      const b = await page.getByTestId(testId).boundingBox();
      button = [b.x + b.width / 2, b.y + b.height / 2];
      await send('touchStart', [[...stick, 1], [...button, 2]]);
    },
    // touchEnd lifts only the fingers it lists: the stick stays down.
    async releaseButton() { await send('touchEnd', [[...button, 2]]); },
    async release() { await send('touchEnd', []); await cdp.detach(); },
  };
}

const boxesOverlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const layout of (process.env.HH_LAYOUTS || 'desktop,portrait,landscape').split(',')) {
      const mobile = layout !== 'desktop';
      const viewport = layout === 'portrait' ? { width: 390, height: 844 } : layout === 'landscape' ? { width: 844, height: 390 } : { width: 1280, height: 800 };
      const page = await browser.newPage({ viewport, hasTouch: mobile, isMobile: mobile });
      page.setDefaultTimeout(120000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, quality: 'low', tutorials: false }, version: 0 })));
      const state = () => page.evaluate(() => window.__toybox.match.state());
      const me = () => page.evaluate(() => window.__toybox.match.state().players.find((p) => p.id === 'you'));
      const click = async (id) => (mobile ? page.getByTestId(id).tap() : page.getByTestId(id).click());
      const shot = (name) => page.screenshot({ path: path.join(out, `hoophustle-${layout}-${name}.png`) });
      /** Jump the match clock (whole 60 Hz steps), keeping everything else as it is. */
      const jumpTo = (ms) => page.evaluate((ms) => { const s = window.__toybox.match.state(); const k = Math.round(ms / (1000 / 60)); s.tick = k; s.t = (k * 1000) / 60; }, ms);
      /** Keep the bots from shooting (their next ball never arrives) and pin our toy, ball in hand, to a spot. */
      const quietBots = () => page.evaluate(() => { const s = window.__toybox.match.state(); for (const p of s.players) if (p.id !== 'you') { p.holding = false; p.charging = false; p.readyAt = 1e12; } });
      const startPlaying = async () => {
        await page.waitForFunction(() => window.__toybox.match.phase() === 'countdown');
        await page.evaluate(() => window.__toybox.match.timeScale(10));
        await page.waitForFunction(() => window.__toybox.match.phase() === 'playing');
        await page.evaluate(() => window.__toybox.match.timeScale(1));
      };

      await page.goto(`${process.env.BASE_URL || 'http://localhost:4173/'}?debug#play`);
      await page.waitForSelector('.loading', { state: 'detached' });
      // In through the practice table (every party trial is listed there).
      await page.evaluate(() => window.__toybox.hub.goTo('pavilion'));
      await page.waitForSelector('.prompt');
      if (mobile) await page.locator('.prompt').tap();
      else await page.keyboard.press('KeyE');
      await click('practice-group-party');
      await click('practice-hoop-hustle');
      await page.getByTestId('match-start').waitFor({ state: 'visible' });
      await page.waitForTimeout(900);
      await click('match-start');
      await startPlaying();
      let s = await state();
      assert.equal(s.kind, 'hoop-hustle');
      assert.ok(s.players.length >= 2, 'bots fill the court');
      assert.equal(new Set(s.players.map((p) => p.spot)).size, s.players.length, 'every toy on its own spot');
      await page.getByTestId('hh-rail').waitFor();
      assert.equal(await page.locator('[data-testid=hh-rail] li').count(), s.players.length, 'a standings row per toy');
      assert.match(await page.getByTestId('hh-clock').innerText(), /^1:1\d$/);
      await page.waitForTimeout(1200);
      await shot('start');

      // ----- the layout: nothing important overlaps, and the touch controls are big enough
      const boxes = {};
      for (const id of ['hh-top', 'hh-rail', 'hh-meter', ...(mobile ? ['hh-throw'] : [])]) boxes[id] = await page.getByTestId(id).boundingBox();
      boxes.pause = await page.getByRole('button', { name: 'Pause', exact: true }).boundingBox();
      for (const [a, b] of [['hh-top', 'hh-rail'], ['hh-top', 'pause'], ['hh-rail', 'pause'], ['hh-meter', 'hh-rail'], ...(mobile ? [['hh-throw', 'hh-rail'], ['hh-throw', 'hh-meter'], ['hh-throw', 'pause']] : [])])
        assert.ok(!boxesOverlap(boxes[a], boxes[b]), `${layout}: ${a} overlaps ${b}: ${JSON.stringify([boxes[a], boxes[b]])}`);
      for (const [id, b] of Object.entries(boxes)) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width + 0.5 && b.y + b.height <= viewport.height + 0.5, `${layout}: ${id} on screen`);
      if (mobile) {
        assert.ok(boxes['hh-throw'].width >= 56 && boxes['hh-throw'].height >= 56, 'Throw is a big target');
        const zone = await page.locator('.touch-stick-zone').boundingBox();
        assert.ok(!boxesOverlap(zone, boxes['hh-throw']), 'the joystick zone leaves the Throw button alone');
        assert.equal(await page.getByRole('button', { name: 'Up', exact: true }).count(), 0, 'no direction pads');
      }

      // ----- aim: A / D (or the joystick) turns it
      await quietBots();
      const aim0 = await page.evaluate(() => window.__toybox.hoop.aim());
      if (mobile) {
        const stick = await holdStick(page, [1, 0]);
        await page.waitForFunction((a0) => Math.abs(window.__toybox.hoop.aim() - a0) > 0.3, aim0);
        // Aim back at the hoop (up on the stick) and keep holding it while the other thumb throws.
        await stick.release();
      } else {
        await page.keyboard.down('KeyD');
        await page.waitForFunction((a0) => window.__toybox.hoop.aim() < a0 - 0.3, aim0);
        await page.keyboard.up('KeyD');
        await page.keyboard.down('KeyA');
        await page.waitForFunction((a0) => window.__toybox.hoop.aim() > a0 - 0.1, aim0);
        await page.keyboard.up('KeyA');
      }
      if (!mobile) {
        // The mouse aims too: point at the court under the rim.
        const p = await page.evaluate(() => window.__toybox.hoop.point(0, 0.06, 0.5));
        await page.mouse.move(p.x, p.y);
        await page.waitForFunction(() => { const s = window.__toybox.match.state(), me = s.players.find((q) => q.id === 'you'), sp = s.spots[me.spot]; return Math.abs(window.__toybox.hoop.aim() - Math.atan2(-sp.x, 0.5 - sp.z)) < 0.1; });
      }

      // ----- hold to charge, let go in the gold zone: a basket. Slowed right down so software
      // rendering (a few frames a second on a loaded machine) can still see the meter in the zone;
      // if a slow frame jumps past it, that throw is let go late (a miss) and we try again.
      const throwInZone = async (stick) => {
        const before = await me();
        for (let attempt = 0; attempt < 5; attempt++) {
          await page.waitForFunction(() => { const s = window.__toybox.match.state(), p = s.players.find((q) => q.id === 'you'); return p.holding && !p.move; });
          const shots = (await me()).shots;
          await page.evaluate(() => window.__toybox.match.timeScale(0.06));
          if (mobile) await stick.holdButton('hh-throw');
          else await page.keyboard.down('Space');
          await page.waitForFunction(() => !!document.querySelector('.hh-meter.is-charging'));
          await page.waitForFunction(() => {
            const m = document.querySelector('.hh-meter');
            const k = parseFloat((document.querySelector('.hh-meter__fill')?.style.transform ?? '').replace(/[^0-9.]/g, '')) || 0;
            return m?.classList.contains('is-perfect') || k > 0.97;
          }, null, { polling: 'raf' });
          const inZone = await page.evaluate(() => document.querySelector('.hh-meter')?.classList.contains('is-perfect'));
          if (mobile) await stick.releaseButton();
          else await page.keyboard.up('Space');
          await page.waitForFunction((n) => window.__toybox.match.state().players.find((p) => p.id === 'you').shots > n, shots);
          if (inZone) {
            await page.evaluate(() => window.__toybox.match.timeScale(0));
            await shot('throw');
          }
          await page.evaluate(() => window.__toybox.match.timeScale(1));
          await page.waitForFunction(() => window.__toybox.match.state().balls.every((b) => b.owner !== 'you' || b.result));
          const after = await me();
          if (!inZone) {
            console.log(`  (${layout}: a slow frame let go past the zone; again)`);
            continue;
          }
          assert.equal(after.makes, before.makes + 1, `${layout}: a throw let go in the gold zone goes in (${JSON.stringify(after.lastMiss)})`);
          assert.ok(after.points > before.points);
          assert.notEqual(after.spot, before.spot, 'hops to a new spot after a make');
          await page.getByTestId('hh-pop').waitFor();
          assert.match(await page.getByTestId('hh-pop').innerText(), /^\+[1-3]!/);
          await page.waitForFunction(() => window.__toybox.match.state().players.find((p) => p.id === 'you').holding);
          return after;
        }
        throw new Error(`${layout}: never caught the gold zone in five tries`);
      };
      let stick = null;
      if (mobile) stick = await holdStick(page, [0, -1]); // up: at the hoop
      try {
        await throwInZone(stick);
        await quietBots();
        await throwInZone(stick);
        if (mobile) assert.ok((await me()).makes === 2, 'two baskets with the stick held the whole time');
      } finally {
        if (stick) await stick.release();
      }
      assert.equal(await page.getByTestId('hh-points').innerText(), String((await me()).points));

      // ----- pause drops a charge: no throw on resume, and the clock stops
      const shots = (await me()).shots;
      if (mobile) await page.getByTestId('hh-throw').dispatchEvent('pointerdown', { button: 0, pointerId: 9, pointerType: 'touch', isPrimary: true });
      else await page.keyboard.down('Space');
      await page.waitForFunction(() => !!document.querySelector('.hh-meter.is-charging'));
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.waitForSelector('.pause');
      // (Let go of Space with nothing focused, so the key-up can't press a button on the pause sheet.)
      if (!mobile) { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.up('Space'); }
      const t = (await state()).t;
      await page.waitForTimeout(300);
      assert.equal((await state()).t, t, 'paused');
      await page.keyboard.press('Escape');
      await page.waitForSelector('.pause', { state: 'detached' });
      await page.waitForFunction((t0) => window.__toybox.match.state().t > t0 + 300, t);
      assert.equal((await me()).shots, shots, 'the charge was dropped, not thrown');
      assert.equal((await me()).charging, false);

      // ----- the twists: the hoop winds up and slides, then the gold ball
      await jumpTo(37500 - 1500);
      await page.waitForFunction(() => document.querySelector('[data-testid=hh-banner]')?.dataset.tone === 'warn');
      await shot('warn');
      await page.waitForFunction(() => document.querySelector('[data-testid=hh-banner]')?.dataset.tone === 'slide');
      await page.waitForFunction(() => window.__toybox.match.state().t > 38200);
      await shot('slide');
      await jumpTo(75000 - 15000 - 100);
      await page.waitForFunction(() => document.querySelector('[data-testid=hh-banner]')?.dataset.tone === 'gold');
      await page.waitForFunction(() => window.__toybox.match.state().players.find((p) => p.id === 'you').gold);
      assert.match(await page.getByTestId('hh-spot').innerText(), /gold/);
      await shot('gold');

      // ----- the buzzer, results and the record
      await page.evaluate(() => window.__toybox.match.timeScale(8));
      await page.waitForSelector('.results');
      const record = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['hoop-hustle']);
      assert.equal(record.plays, 1);
      assert.ok(record.best >= 2, 'best score recorded');
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      await page.waitForTimeout(800);
      await shot('results');
      await click('results-again');
      await startPlaying();
      assert.equal((await me()).shots, 0, 'a fresh match');
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.waitForTimeout(800);
      await page.locator('.pause__actions .toy-btn').nth(1).click();
      await page.waitForSelector('.hud-sign');
      assert.deepEqual(errors, []);
      console.log(`PASS Hoop Hustle ${layout}: entry, HUD layout${mobile ? ' (joystick + Throw button, no overlaps)' : ''}, aim (${mobile ? 'joystick' : 'A/D and mouse'}), two gold-zone baskets${mobile ? ' with the stick held' : ''}, hop to a new spot, pause drops a charge, slide warning and slide, gold ball, results, record, restart, hub return; no console/page errors`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
