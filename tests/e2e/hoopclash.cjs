/* Hoop Clash: desktop (keys + mouse) and phones in portrait and landscape (the joystick, a held
   Shoot button and Pass, with two thumbs). Entry from practice, the jump ball, moving, a charged
   shot released on the gold arc that scores, a pass, the touch button's Steal/Grab label, pause,
   the end of the game with the team results, and back to the Playroom; no console errors.
     BASE_URL=http://localhost:4173/ node tests/e2e/hoopclash.cjs        ONLY=desktop|portrait|landscape
   Screenshots: tests/e2e/output/hoopclash-<layout>-*.png */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4173/';

/** CDP touch: hold the joystick (finger 1) pushed in a direction; tap or hold buttons with finger 2. */
async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  let stick = null;
  const centre = async (testId) => {
    const b = await page.getByTestId(testId).boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  return {
    async stickDown([dx, dy]) {
      const zone = await page.locator('.touch-stick-zone').boundingBox();
      const x = zone.x + zone.width * 0.35;
      const y = zone.y + zone.height * 0.6;
      await send('touchStart', [[x, y, 1]]);
      await send('touchMove', [[x + dx * 20, y + dy * 20, 1]]);
      stick = [x + dx * 60, y + dy * 60, 1];
      await send('touchMove', [stick]);
    },
    async stickUp() {
      if (stick) await send('touchEnd', [stick]);
      stick = null;
    },
    async press(testId) {
      const [bx, by] = await centre(testId);
      await send('touchStart', [...(stick ? [stick] : []), [bx, by, 2]]);
      return { up: () => send('touchEnd', [[bx, by, 2]]) };
    },
    async tap(testId) {
      const p = await this.press(testId);
      await p.up();
    },
    detach: () => cdp.detach(),
  };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const layout of (process.env.ONLY || 'desktop,portrait,landscape').split(',')) {
      const mobile = layout !== 'desktop';
      const viewport = layout === 'portrait' ? { width: 390, height: 844 } : layout === 'landscape' ? { width: 844, height: 390 } : { width: 1280, height: 800 };
      const page = await browser.newPage({ viewport, hasTouch: mobile, isMobile: mobile });
      page.setDefaultTimeout(150000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.addInitScript(() => {
        if (sessionStorage.getItem('hc')) return;
        sessionStorage.setItem('hc', '1');
        localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, quality: 'low', tutorials: false }, version: 0 }));
      });
      const shot = (name) => page.screenshot({ path: path.join(OUT, `hoopclash-${layout}-${name}.png`) });
      const st = () => page.evaluate(() => window.__toybox.match.state());
      const timeScale = (k) => page.evaluate((k) => window.__toybox.match.timeScale(k), k);
      const tap = async (id) => (mobile ? page.getByTestId(id).tap() : page.getByTestId(id).click());

      await page.goto(`${BASE}?debug#play`);
      await page.waitForSelector('.loading', { state: 'detached' });
      // Practice from the Pavilion's party shelf, as a player would.
      await page.evaluate(() => window.__toybox.hub.goTo('pavilion'));
      await page.waitForSelector('.prompt');
      if (mobile) await page.locator('.prompt').tap();
      else await page.keyboard.press('KeyE');
      await tap('practice-group-party');
      await tap('practice-hoop-clash');
      await page.getByTestId('match-start').waitFor({ state: 'visible' });
      await shot('intro');
      await page.waitForTimeout(900);
      await tap('match-start');
      await page.waitForFunction(() => window.__toybox.match.phase() === 'countdown');
      await timeScale(10);
      await page.waitForFunction(() => window.__toybox.match.phase() === 'playing');
      await timeScale(1);

      // A 2 v 2 by default (you and three bots): you play for Red, the scoreboard and the jump ball show.
      let s = await st();
      assert.equal(s.kind, 'hoop-clash');
      assert.equal(s.teamSize, 2);
      assert.equal(s.players.length, 4);
      const me = s.players.find((p) => p.id === 'you');
      assert.equal(me.team, 0);
      await page.getByTestId('hc-scoreboard').waitFor();
      assert.match(await page.getByTestId('hc-you').innerText(), /Red/);
      assert.match(await page.getByTestId('hc-ball').innerText(), /Jump ball|has it|Loose|inbounds/);
      await shot('jump');
      await page.waitForFunction(() => window.__toybox.match.state().phase === 'live');
      // the jump ball is won by someone within a few seconds
      await timeScale(3);
      await page.waitForFunction(() => !!window.__toybox.match.state().ball.holder || window.__toybox.match.state().phase !== 'live');
      await timeScale(1);

      // Moving: right with the keys, or the joystick.
      const x0 = (await st()).players.find((p) => p.id === 'you').x;
      let t = null;
      if (mobile) {
        t = await touch(page);
        await t.stickDown([1, 0]);
        await page.waitForFunction((x0) => window.__toybox.match.state().players.find((p) => p.id === 'you').x > x0 + 3, x0);
        // The second thumb's button reads Steal or Grab while you don't have the ball.
        const label = await page.getByTestId('hc-shoot').innerText();
        assert.match(label, /Steal|Grab|Shoot/);
        await t.stickUp();
      } else {
        await page.keyboard.down('KeyD');
        await page.waitForFunction((x0) => window.__toybox.match.state().players.find((p) => p.id === 'you').x > x0 + 3, x0);
        await page.keyboard.up('KeyD');
      }
      await shot('play');

      // A shot: you have the ball 12 cm out in front of your hoop, the others far away. Charge with
      // the real control, slowed down, and let go when the arc turns gold.
      await timeScale(0);
      await page.evaluate(() => {
        const s = window.__toybox.match.state();
        const me = s.players.find((p) => p.id === 'you');
        const att = (me.team === 0) !== s.swapped ? 1 : 0;
        const hx = att ? 32 : -32;
        const sx = Math.sign(hx);
        s.phase = 'live';
        s.inbound = null;
        s.next = null;
        s.clock = Math.max(s.clock, 30000);
        s.players.forEach((p, i) => {
          if (p !== me) Object.assign(p, { x: -sx * 40, z: -20 + i * 5, vx: 0, vz: 0, charge: -1 });
        });
        Object.assign(me, { x: hx - sx * 12, z: 3, vx: 0, vz: 0, charge: -1, swipeCd: 0 });
        me.yaw = Math.atan2(hx - me.x, 0 - me.z);
        Object.assign(s.ball, { holder: 'you', grabT: s.t, lastTeam: me.team });
        s.poss = me.team;
        s.shotClock = s.config.shotMs;
        s.shot = null;
        s.pass = null;
      });
      const before = (await st()).score[0];
      assert.ok((await page.evaluate(() => window.__toybox.hoop.perfect())) !== null, 'a shot from 12 cm can go in');
      await timeScale(0.12);
      let held;
      if (mobile) held = await t.press('hc-shoot');
      else await page.keyboard.down('Space');
      await page.waitForFunction(() => window.__toybox.match.state().players.find((p) => p.id === 'you').charge >= 0);
      await page.getByTestId('hc-meter').waitFor({ state: 'visible' });
      await page.waitForFunction(() => window.__toybox.hoop.gold(), null, { polling: 'raf' });
      if (mobile) await held.up();
      else await page.keyboard.up('Space');
      await page.waitForTimeout(200);
      await timeScale(0);
      await shot('shot');
      await timeScale(1);
      await page.waitForFunction((b) => window.__toybox.match.state().score[0] > b || window.__toybox.match.state().phase === 'dead', before);
      s = await st();
      assert.equal(s.score[0], before + 2, `the gold-arc shot went in (${JSON.stringify(s.score)})`);
      assert.equal(s.players.find((p) => p.id === 'you').pts, 2);
      await page.waitForFunction((n) => document.querySelector('[data-testid=hc-score-red]')?.textContent === String(n), before + 2);
      await shot('scored');

      // A pass to the teammate you face (Q, or the Pass button).
      await page.waitForFunction(() => window.__toybox.match.state().phase === 'inbound', null, { timeout: 20000 });
      await timeScale(0);
      await page.evaluate(() => {
        const s = window.__toybox.match.state();
        const me = s.players.find((p) => p.id === 'you');
        const mate = s.players.find((p) => p.team === me.team && p !== me);
        s.phase = 'live';
        s.inbound = null;
        Object.assign(me, { x: 0, z: 0, vx: 0, vz: 0, yaw: Math.PI / 2, charge: -1 });
        Object.assign(mate, { x: 10, z: 0, vx: 0, vz: 0 });
        s.players.forEach((p) => { if (p.team !== me.team) Object.assign(p, { x: -30, z: p.z }); });
        Object.assign(s.ball, { holder: 'you', grabT: s.t });
        s.poss = me.team;
      });
      await timeScale(1);
      if (mobile) await t.tap('hc-pass');
      else await page.keyboard.press('KeyQ');
      await page.waitForFunction(() => {
        const s = window.__toybox.match.state();
        const me = s.players.find((p) => p.id === 'you');
        return s.ball.holder !== 'you' && (s.pass?.by === 'you' || s.players.find((p) => p.id === s.ball.holder)?.team === me.team);
      });

      // Pause stops the clock.
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.waitForSelector('.pause');
      const tp = (await st()).t;
      await page.waitForTimeout(300);
      assert.equal((await st()).t, tp);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.pause', { state: 'detached' });

      // The end: run the second half's clock down; the results show the team totals and every toy's points.
      await page.evaluate(() => {
        const s = window.__toybox.match.state();
        s.period = 2;
        s.swapped = true;
        s.clock = 400;
        s.score = [s.score[0] + 3, s.score[1]];
      });
      await timeScale(4);
      await page.waitForSelector('.results', { timeout: 60000 });
      await timeScale(1);
      await page.getByTestId('hc-results').waitFor();
      const res = await page.getByTestId('hc-results').innerText();
      assert.match(res, /Red \d+/);
      assert.match(res, /Red wins/);
      assert.equal(await page.locator('[data-testid=hc-results-red] li').count(), 2);
      assert.equal(await page.locator('[data-testid=hc-results-blue] li').count(), 2);
      assert.match(await page.locator('.results').first().innerText(), /You win/);
      await shot('results');
      if (t) await t.detach();
      await page.waitForTimeout(800);
      await tap('results-leave');
      await page.waitForSelector('.hud-sign');
      assert.deepEqual(errors, []);
      console.log(`PASS Hoop Clash ${layout}: practice entry, 2 v 2 with you on Red, scoreboard, jump ball, ${mobile ? 'joystick, held Shoot button with a second thumb, Pass button' : 'keys, held Space, Q pass'}, gold-arc shot scores 2, pass, pause, final buzzer, team results, back to the Playroom; no console/page errors`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
