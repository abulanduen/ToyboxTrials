/* Touch / mobile checks with an emulated phone (real touch events via CDP).
   Run: BASE_URL=http://localhost:4173/ node tests/e2e/mobile.cjs */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const res = [];
const check = (n, ok, d = '') => res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const phone = devices['Pixel 7'];
  const ctx = await browser.newContext({ ...phone, viewport: { width: 915, height: 412 }, screen: { width: 915, height: 412 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(+process.env.E2E_TIMEOUT || 120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id = 0]) => ({ x, y, id })) });
  const st = () => page.evaluate(() => window.__toybox.state());

  await page.goto(BASE + '?debug');
  await page.waitForTimeout(4000);
  check('main menu shows on touch device', await page.isVisible('[data-testid=menu-play]'));
  await page.screenshot({ path: `${OUT}/mobile-00-menu-landscape.png` });
  await page.tap('[data-testid=menu-play]');
  await page.waitForTimeout(2500);
  check('touch controls visible in hub', await page.isVisible('.touch-stick-zone'));
  check('keyboard controls card hidden on touch', !(await page.isVisible('.controls')));
  await page.screenshot({ path: `${OUT}/mobile-01-hub-landscape.png` });

  // Joystick: thumb down in the left zone, push up (forward), hold.
  let a = await st();
  await touch('touchStart', [[120, 300]]);
  await touch('touchMove', [[120, 255]]);
  await page.waitForTimeout(6000);
  await touch('touchEnd', []);
  await page.waitForTimeout(500);
  let b = await st();
  check('joystick moves the toy forward', b.z < a.z - 0.4, `z ${a.z.toFixed(2)} -> ${b.z.toFixed(2)}`);

  // Look: drag on the right half of the scene.
  a = await st();
  await touch('touchStart', [[600, 150, 1]]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [[600 - i * 25, 150, 1]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(1500);
  b = await st();
  check('drag on scene rotates the camera', Math.abs(b.camYaw - a.camYaw) > 0.1, `camYaw ${a.camYaw.toFixed(2)} -> ${b.camYaw.toFixed(2)}`);

  // Simultaneous: move with left thumb while looking with right thumb.
  a = await st();
  await touch('touchStart', [[120, 300, 2]]);
  await touch('touchMove', [[120, 255, 2]]);
  await touch('touchStart', [[120, 255, 2], [650, 150, 3]]);
  await touch('touchMove', [[120, 255, 2], [600, 150, 3]]);
  await page.waitForTimeout(4000);
  await touch('touchEnd', []);
  await page.waitForTimeout(500);
  b = await st();
  check('two-thumb move + look at the same time', Math.hypot(b.x - a.x, b.z - a.z) > 0.3 && Math.abs(b.camYaw - a.camYaw) > 0.05);

  // Jump button
  await page.evaluate(() => window.__toybox.teleport(0, 20, Math.PI));
  await page.waitForTimeout(800);
  const jb = await page.$('.touch-btn--jump');
  const box = await jb.boundingBox();
  await touch('touchStart', [[box.x + box.width / 2, box.y + box.height / 2, 4]]);
  let peak = 0;
  // Sample for ~3 s: software-rendered frames can take >1 s each in CI.
  for (let i = 0; i < 20; i++) { const s = await st(); peak = Math.max(peak, s.y, s.anim.grounded ? 0 : 0.21); await page.waitForTimeout(150); }
  await touch('touchEnd', []);
  check('Jump button jumps', peak > 0.2, `peak y=${peak.toFixed(2)}`);
  await page.waitForTimeout(1200);

  // Interact button at the Copycat gate opens the game; play a round with the touch pads.
  await page.evaluate(() => window.__toybox.match.timeScale(4));
  await page.evaluate((id) => { const g = window.__toybox.hub.gates().find((x) => x.game === id); window.__toybox.teleport(g.standX, g.standZ, g.yaw); }, 'copycat-conductor');
  await page.waitForFunction(() => document.querySelector('.touch-btn--interact')?.getAttribute('aria-label')?.includes('Copycat'), null, { timeout: 120000 }).catch(() => null);
  check('Interact button appears with a prompt', await page.isVisible('.touch-btn--interact'), await page.textContent('.touch-btn--interact').catch(() => ''));
  await page.screenshot({ path: `${OUT}/mobile-02-gate-prompt.png` });
  const ib = await (await page.$('.touch-btn--interact')).boundingBox();
  await touch('touchStart', [[ib.x + ib.width / 2, ib.y + ib.height / 2, 5]]);
  await page.waitForTimeout(600);
  await touch('touchEnd', []);
  await page.waitForSelector('.match-intro', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
  check('Interact button opens the Copycat intro', await page.isVisible('.match-intro'));
  await page.tap('[data-testid=tutorial-next]');
  check('phone tutorial uses touch wording', (await page.textContent('.tutorial__text').catch(() => ''))?.includes('tapping the four instrument pads'));
  const tutTargets = await page.$$eval('.tutorial button', (bs) => bs.map((b) => b.getBoundingClientRect().height));
  check('tutorial buttons are at least 56 px tall', tutTargets.length === 3 && tutTargets.every((h) => h >= 56), tutTargets.join(','));
  await page.screenshot({ path: `${OUT}/mobile-02b-tutorial.png` });
  await page.locator('[data-testid=match-start]').scrollIntoViewIfNeeded();
  await page.tap('[data-testid=match-start]');
  const MS = () =>
    page.evaluate(() => {
      const s = window.__toybox.match.state();
      return s && { phase: s.phase, round: s.round, seq: s.sequence, len: s.config.startLength + s.round - 1, me: s.players[0] };
    });
  const waitInput = async () => {
    for (let i = 0; i < 600; i++) {
      const x = await MS();
      if (x && x.phase === 'input') return x;
      await page.waitForTimeout(250);
    }
    throw new Error('no input phase');
  };
  const tapPad = async (i) => {
    const b = await page.locator('.cc-pad').nth(i).boundingBox();
    await touch('touchStart', [[b.x + b.width / 2, b.y + b.height / 2, 20 + i]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(80);
  };
  let cm = await waitInput();
  check('four instrument pads on screen', (await page.$$('.cc-pad')).length === 4);
  // Freeze match time while the (slow, software-rendered) screenshot is taken.
  await page.evaluate(() => window.__toybox.match.timeScale(0));
  await page.screenshot({ path: `${OUT}/mobile-03-copycat-pads.png` });
  // Keep the simulation frozen while CDP sends the ordered touch presses. Under software
  // rendering, protocol latency can otherwise consume the whole input deadline.
  for (let i = cm.me.progress; i < cm.len; i++) await tapPad(cm.seq[i]);
  await page.evaluate(() => window.__toybox.match.timeScale(4));
  for (let i = 0; i < 600; i++) {
    const x = await MS();
    if (x.round === 2) break;
    await page.waitForTimeout(250);
  }
  check('tapping the pads repeats the sequence (round 2 reached)', (await MS()).round === 2);
  cm = await waitInput();
  await tapPad((cm.seq[cm.me.progress] + 1) % 4);
  await page.waitForSelector('.results', { timeout: 120000 }).catch(() => null);
  await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
  check('a wrong pad ends the run with results', await page.isVisible('.results'));
  await page.screenshot({ path: `${OUT}/mobile-04-copycat-results.png` });
  await page.tap('[data-testid=results-leave]');
  await page.waitForSelector('.touch-stick-zone', { timeout: 60000 }).catch(() => null);
  check('back to the Playroom with touch controls', await page.isVisible('.touch-stick-zone'));

  // Tapping the prompt pill also interacts (workshop building → Workshop screen)
  await page.evaluate(() => window.__toybox.hub.goTo('workshop'));
  await page.waitForTimeout(2500);
  await page.tap('.prompt--touch');
  await page.waitForTimeout(1800);
  check('tapping the prompt pill interacts (opens Workshop)', await page.isVisible('.workshop-panel'));
  await page.tap('.workshop-tabs button >> nth=1');
  await page.waitForTimeout(400);
  await page.tap('.swatch >> nth=1');
  await page.waitForTimeout(600);
  check('hat swatch is tappable and selects', (await page.getAttribute('.swatch >> nth=1', 'aria-selected')) === 'true');
  await page.screenshot({ path: `${OUT}/mobile-06-workshop-landscape.png` });
  await page.tap('[data-testid=workshop-done]');
  await page.waitForTimeout(1500);

  // Pause button
  await page.tap('.touch-pause');
  await page.waitForTimeout(1000);
  check('pause button opens pause menu', await page.isVisible('.pause'));
  check('touch devices default to Low quality', (await page.textContent('.segmented .on'))?.trim() === 'low');
  await page.screenshot({ path: `${OUT}/mobile-04-pause.png` });
  await page.tap('.pause__actions .toy-btn >> nth=0');
  await page.waitForTimeout(800);

  // Portrait
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(3000);
  const p = await st();
  check('portrait widens the camera FOV', p.fov > 60, `fov=${p.fov.toFixed(1)}`);
  await page.screenshot({ path: `${OUT}/mobile-05-portrait.png` });

  // Jack-in-the-Box in portrait: the answer box sits high (clear of the phone keyboard), tap Crank! to pass.
  await page.evaluate(() => window.__toybox.match.timeScale(2));
  await page.evaluate((id) => { const g = window.__toybox.hub.gates().find((x) => x.game === id); window.__toybox.teleport(g.standX, g.standZ, g.yaw); }, 'jack-in-the-box');
  await page.waitForFunction(() => document.querySelector('.touch-btn--interact')?.getAttribute('aria-label')?.includes('Jack-in-the-Box'));
  const jib = await (await page.$('.touch-btn--interact')).boundingBox();
  await touch('touchStart', [[jib.x + jib.width / 2, jib.y + jib.height / 2, 6]]);
  await page.waitForTimeout(600);
  await touch('touchEnd', []);
  await page.waitForSelector('.match-intro', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(1500); // a long press must not tap-through to the intro's buttons
  check('Interact button at the coral gate opens Jack-in-the-Box and it stays open (portrait)', (await page.textContent('.match-intro h2').catch(() => ''))?.includes('Jack'));
  await page.tap('[data-testid=match-start]');
  const JS = () => page.evaluate(() => {
    const s = window.__toybox.match.state();
    return s && s.category ? { phase: s.phase, holder: s.holder, said: s.said.map((x) => x.display.toLowerCase()), tiers: s.category.tiers } : null;
  });
  let js = null;
  for (let i = 0; i < 900; i++) {
    js = await JS();
    if (js && js.phase === 'live' && js.holder === 'you') break;
    if (await page.isVisible('.results')) break;
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => window.__toybox.match.timeScale(0));
  const myTurn = js && js.phase === 'live' && js.holder === 'you';
  check('the box reaches you (portrait)', myTurn);
  if (myTurn) {
    const ib2 = await page.locator('[data-testid=jb-input]').boundingBox();
    const sb = await page.locator('[data-testid=jb-send]').boundingBox();
    check('answer box sits in the top third (clear of the keyboard)', ib2.y + ib2.height < 915 / 3, `bottom=${(ib2.y + ib2.height).toFixed(0)}`);
    check('answer box and Crank! button are ≥ 56 px tall', ib2.height >= 56 && sb.height >= 56, `${ib2.height}/${sb.height}`);
    await page.screenshot({ path: `${OUT}/mobile-09-jack-portrait.png` });
    const ans = js.tiers[0].split(',').map((e) => e.split('|')[0].trim()).find((a) => !js.said.includes(a));
    await page.tap('[data-testid=jb-input]');
    await page.keyboard.type(ans);
    const sb2 = await page.locator('[data-testid=jb-send]').boundingBox();
    await touch('touchStart', [[sb2.x + sb2.width / 2, sb2.y + sb2.height / 2, 30]]);
    await touch('touchEnd', []);
    await page.evaluate(() => window.__toybox.match.timeScale(0.05));
    let passed = false;
    for (let i = 0; i < 100 && !passed; i++) {
      const x = await JS();
      passed = !!x && x.said.includes(ans);
      await page.waitForTimeout(150);
    }
    check('tapping Crank! submits the answer and passes the box', passed, ans);
  }
  await page.evaluate(() => window.__toybox.match.timeScale(4));
  if (!(await page.isVisible('.results'))) {
    await page.tap('.match-pause');
    await page.waitForTimeout(1000);
    await page.tap('.pause__actions .toy-btn >> nth=1'); // leave
  } else {
    await page.waitForTimeout(900);
    await page.tap('[data-testid=results-leave]');
  }
  await page.waitForSelector('.touch-stick-zone', { timeout: 60000 }).catch(() => null);
  check('back in the Playroom after Jack (portrait)', await page.isVisible('.touch-stick-zone'));

  // Portrait menu and Workshop
  await page.tap('.touch-pause');
  await page.waitForTimeout(800);
  await page.tap('.pause__actions .toy-btn >> nth=2'); // Main menu
  await page.waitForTimeout(2500);
  check('pause → Main menu works (portrait)', await page.isVisible('[data-testid=menu-play]'));
  await page.screenshot({ path: `${OUT}/mobile-07-menu-portrait.png` });
  await page.tap('[data-testid=menu-workshop]');
  await page.waitForTimeout(2500);
  check('menu → Workshop works (portrait)', await page.isVisible('.workshop-panel'));
  await page.screenshot({ path: `${OUT}/mobile-08-workshop-portrait.png` });

  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(res.join('\n'));
  await browser.close();
})().catch(e => { console.log(res.join('\n')); console.error(e); process.exitCode = 1; });
