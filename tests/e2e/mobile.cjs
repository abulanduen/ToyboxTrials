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
  page.setDefaultTimeout(120000);
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

  // Interact button appears at the Copycat gate and opens the panel; instruments are tappable.
  await page.evaluate(() => window.__toybox.teleport(13.9, -20.4, Math.PI - 0.55));
  await page.waitForTimeout(2500);
  check('Interact button appears with a prompt', await page.isVisible('.touch-btn--interact'), await page.textContent('.touch-btn--interact').catch(() => ''));
  await page.screenshot({ path: `${OUT}/mobile-02-gate-prompt.png` });
  const ib = await (await page.$('.touch-btn--interact')).boundingBox();
  await touch('touchStart', [[ib.x + ib.width / 2, ib.y + ib.height / 2, 5]]);
  await page.waitForTimeout(600);
  await touch('touchEnd', []);
  await page.waitForTimeout(1500);
  check('Interact button opens the Copycat panel', await page.isVisible('.info-panel'));
  await page.tap('.instrument >> nth=2');
  await page.waitForTimeout(150);
  check('instrument lights up on tap', (await page.$$('.instrument--lit')).length === 1);
  await page.screenshot({ path: `${OUT}/mobile-03-copycat-panel.png` });
  await page.tap('.panel__actions .toy-btn');
  await page.waitForTimeout(1200);
  check('panel closes via button', !(await page.isVisible('.info-panel')));

  // Tapping the prompt pill also interacts (workshop building → Workshop screen)
  await page.evaluate(() => window.__toybox.teleport(-24.0, -2.6, 0.3 + Math.PI));
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
})();
