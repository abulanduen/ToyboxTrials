/* The arcade under the spawn table (docs/ARCADE_PLAN.md phase 1: the second level and the shell).
   Until the toy-car ride and the lift exist (phase 2), the test hook puts the toy down there:
     BASE_URL=http://localhost:4173/ node tests/e2e/arcade.cjs        (ONLY=desktop|phone)
   Desktop: the toy stands on the arcade floor, walks on it and stays inside it, the camera stays
   between the floor and the table above, nothing on the table overhead offers a prompt, and back on
   the table everything is as before. Phone portrait: the joystick walks the toy round the arcade. */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const ONLY = process.env.ONLY;
const want = (k) => !ONLY || ONLY === k;
const FLOOR_Y = -75.5;
const ARCADE = { minX: -70, maxX: 70, minZ: -50, maxZ: 36 }; // hubBounds.ts ARCADE_WALK
const CEILING = -11.5; // hubBounds.ts ARCADE_CEILING
const results = [];
const check = (n, ok, d = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
  console.log(results[results.length - 1]);
};
const SAVE = { state: { tourSeen: true, coachSeen: ['menu', 'pavilion', 'trial', 'workshop', 'shop', 'scoreboard', 'jukebox', 'lobby'] }, version: 0 };

async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (c) => { if (c.type() === 'error') errs.push(c.text()); });
  await page.addInitScript((s) => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify(s)), SAVE);
  await page.goto(`${BASE}?debug#play`);
  await page.waitForFunction(() => window.__toybox && window.__toybox.teleport && window.__toybox.state, null, { timeout: 180000 });
  await page.waitForSelector('.hud-sign', { timeout: 180000 });
  return { ctx, page, errs };
}
const frames = (page, n) => page.evaluate((n) => new Promise((res) => { let i = 0; const t0 = performance.now(); const tick = () => (++i >= n || performance.now() - t0 > 30000 ? res() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);
const me = (page) => page.evaluate(() => { const s = window.__toybox.state(); const c = window.__toybox.three().camera.position; return { level: s.level, x: s.x, y: s.y, z: s.z, cam: { x: c.x, y: c.y, z: c.z } }; });
const inArcade = (p, r = 0.8) => p.x >= ARCADE.minX + r - 0.01 && p.x <= ARCADE.maxX - r + 0.01 && p.z >= ARCADE.minZ + r - 0.01 && p.z <= ARCADE.maxZ - r + 0.01;
const prompt = (page) => page.evaluate(() => document.querySelector('.prompt')?.textContent ?? '');

async function desktop(browser) {
  const { ctx, page, errs } = await open(browser, { viewport: { width: 1280, height: 720 } });
  // down to the arcade (the hook stands in for the ride)
  await page.evaluate(() => { window.__toybox.teleport(0, 10, Math.PI, 'floor'); window.__toybox.aim(0, 0.2); });
  await frames(page, 8);
  let s = await me(page);
  check('the toy stands on the arcade floor under the spawn table', s.level === 'floor' && Math.abs(s.y - FLOOR_Y) < 0.05, JSON.stringify(s));
  check('the camera is between the floor and the table above', s.cam.y > FLOOR_Y + 0.5 && s.cam.y < CEILING, `camera y ${s.cam.y.toFixed(1)}`);
  await page.screenshot({ path: `${OUT}/arcade-01-desktop.png` });

  // walk: it stays on the floor
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  await page.keyboard.up('w');
  await frames(page, 4);
  const s2 = await me(page);
  check('walking in the arcade moves the toy along its floor', Math.hypot(s2.x - s.x, s2.z - s.z) > 1 && Math.abs(s2.y - FLOOR_Y) < 0.05 && s2.level === 'floor', `(${s.x.toFixed(1)}, ${s.z.toFixed(1)}) → (${s2.x.toFixed(1)}, ${s2.z.toFixed(1)}), y ${s2.y.toFixed(2)}`);

  // walk into the side wall: it stops at the arcade's edge, never off into the room
  await page.evaluate(() => { window.__toybox.teleport(67.5, 0, Math.PI / 2, 'floor'); window.__toybox.aim(-Math.PI / 2, 0.2); });
  await frames(page, 4);
  await page.keyboard.down('w');
  await page.waitForTimeout(2500);
  await page.keyboard.up('w');
  await frames(page, 4);
  const s3 = await me(page);
  check('the arcade has edges: walking at its wall stops at its edge, never off into the room', inArcade(s3) && s3.x > ARCADE.maxX - 0.85 - 0.05 && s3.level === 'floor', `x ${s3.x.toFixed(2)} (stops at ${ARCADE.maxX - 0.85})`);

  // nothing on the table above offers a prompt down here (stand right under the suspicious box)
  const its = await page.evaluate(() => window.__toybox.interactables());
  const jack = its.find((i) => i.id === 'jack');
  const under = jack && jack.x > ARCADE.minX && jack.x < ARCADE.maxX && jack.z > ARCADE.minZ && jack.z < ARCADE.maxZ;
  if (under) {
    await page.evaluate(([x, z]) => window.__toybox.teleport(x, z, 0, 'floor'), [jack.x, jack.z]);
    await frames(page, 6);
    check('right under the suspicious box, no prompt (it is on the table above)', !(await prompt(page)).trim(), JSON.stringify(await prompt(page)));
  } else check('(the suspicious box is not over the arcade: prompt check skipped)', true);

  // standing under the Pavilion doesn't lift its lid
  const pv = await page.evaluate(() => window.__toybox.hub.pavilion());
  await page.evaluate(([x, z]) => window.__toybox.teleport(x, z, 0, 'floor'), [pv.x, pv.z]);
  await frames(page, 10);
  check('standing under the Pavilion does not open it up', !(await page.evaluate(() => window.__toybox.hub.pavilion().inside)));

  // back up on the table: as before
  await page.evaluate(() => window.__toybox.teleport(0, 22, Math.PI, 'table'));
  await frames(page, 6);
  const s4 = await me(page);
  check('back on the table, the toy stands on its top again', s4.level === 'table' && Math.abs(s4.y) < 0.05 && s4.cam.y > 0, JSON.stringify(s4));
  check('no page errors (desktop)', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

async function phone(browser) {
  const { ctx, page, errs } = await open(browser, { ...devices['iPhone 13'] });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id = 0]) => ({ x, y, id })) });
  await page.evaluate(() => { window.__toybox.teleport(0, 10, Math.PI, 'floor'); window.__toybox.aim(0, 0.2); });
  await frames(page, 8);
  const s = await me(page);
  check('phone: the toy is on the arcade floor', s.level === 'floor' && Math.abs(s.y - FLOOR_Y) < 0.05);
  const vp = page.viewportSize();
  const x0 = Math.round(vp.width * 0.25);
  const y0 = Math.round(vp.height * 0.8);
  await touch('touchStart', [[x0, y0]]);
  await touch('touchMove', [[x0, y0 - 20]]);
  await touch('touchMove', [[x0, y0 - 45]]);
  await page.waitForTimeout(1500);
  await touch('touchEnd', []);
  await frames(page, 4);
  const s2 = await me(page);
  check('phone: the joystick walks the toy across the arcade floor', Math.hypot(s2.x - s.x, s2.z - s.z) > 1 && s2.level === 'floor' && Math.abs(s2.y - FLOOR_Y) < 0.05, `(${s.x.toFixed(1)}, ${s.z.toFixed(1)}) → (${s2.x.toFixed(1)}, ${s2.z.toFixed(1)})`);
  check('phone: the camera stays under the table', s2.cam.y < CEILING && s2.cam.y > FLOOR_Y + 0.5, `camera y ${s2.cam.y.toFixed(1)}`);
  await page.screenshot({ path: `${OUT}/arcade-02-phone-portrait.png` });
  check('no page errors (phone)', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    if (want('desktop')) await desktop(browser);
    if (want('phone')) await phone(browser);
  } catch (e) {
    check('suite ran to the end', false, e.message.split('\n')[0]);
  }
  await browser.close();
  const failed = results.filter((r) => r.startsWith('FAIL'));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
