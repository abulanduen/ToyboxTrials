/* The arcade under the spawn table (docs/ARCADE_PLAN.md: the second level, the shell, the rides).
     BASE_URL=http://localhost:4173/ node tests/e2e/arcade.cjs        (ONLY=desktop|phone)
   Desktop: the toy car (Interact by it) carries the toy off the table, round the loop and into the
   arcade, with input locked on the way; the toy walks the arcade floor and stays inside it, the camera
   stays between the floor and the table above, nothing on the table overhead offers a prompt, and the
   lift (Interact) takes it back up to the table. Phone portrait: the Interact button boards the car;
   the joystick walks the toy round the arcade; the Interact button boards the lift. */
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
const CAR = { x: 10, z: 30 }; // src/game/hubRides.ts CAR (boarding spot)
const LIFT = { x: -4, z: 32, landZ: 33 }; // LIFT
const rideState = (page) => page.evaluate(() => window.__toybox.ride.state());
/** Wait until the ride is over (the toy got off): its level and where it stands. */
async function waitLanded(page, ms = 60000) {
  await page.waitForFunction(() => !window.__toybox.ride.state().kind, null, { timeout: ms, polling: 100 }).catch(() => null);
  await frames(page, 4);
  return me(page);
}

async function desktop(browser) {
  const { ctx, page, errs } = await open(browser, { viewport: { width: 1280, height: 720 } });
  // down to the arcade on the toy car
  await page.evaluate(([x, z]) => { window.__toybox.teleport(x + 1, z - 2.5, 0); window.__toybox.aim(Math.PI + 0.7, 0.35); }, [CAR.x, CAR.z]);
  await frames(page, 8);
  check('by the toy car, the prompt offers the ride down', /Ride.*toy car/.test(await prompt(page)), JSON.stringify(await prompt(page)));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__toybox.ride.state().kind === 'car', null, { timeout: 10000 }).catch(() => null);
  check('Interact boards the car', (await rideState(page)).kind === 'car');
  // halfway: hold the ride still and look (input is locked: walking keys do nothing)
  await page.evaluate(() => window.__toybox.ride.hold(2.15));
  await page.keyboard.down('a');
  await frames(page, 20);
  await page.keyboard.up('a');
  const mid = await me(page);
  check('halfway, the car has the toy off the table, round the loop on the rug (walking keys do nothing)', mid.y < -60 && mid.z > 90 && Math.abs(mid.x - 10) < 8, JSON.stringify(mid));
  check('no prompt while riding', !(await prompt(page)).trim());
  await page.screenshot({ path: `${OUT}/arcade-00-ride-loop.png` });
  await page.evaluate(() => window.__toybox.ride.hold(null));
  let s = await waitLanded(page);
  check('the car sets the toy down on the arcade floor under the spawn table', s.level === 'floor' && Math.abs(s.y - FLOOR_Y) < 0.05 && inArcade(s), JSON.stringify(s));
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

  // back up on the lift
  await page.evaluate(([x, z]) => window.__toybox.teleport(x, z - 2, 0, 'floor'), [LIFT.x, LIFT.z]);
  await frames(page, 6);
  check('by the lift, the prompt offers the ride up', /Ride.*lift/.test(await prompt(page)), JSON.stringify(await prompt(page)));
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__toybox.ride.state().kind === 'lift', null, { timeout: 10000 }).catch(() => null);
  check('Interact boards the lift', (await rideState(page)).kind === 'lift');
  await page.evaluate(() => window.__toybox.ride.hold(3.6));
  await frames(page, 30);
  const climbing = await me(page);
  check('the lift climbs outside the table’s edge', climbing.y > FLOOR_Y + 10 && climbing.y < -5 && climbing.z > 47, JSON.stringify(climbing));
  await page.screenshot({ path: `${OUT}/arcade-03-lift.png` });
  await page.evaluate(() => window.__toybox.ride.hold(null));
  const s4 = await waitLanded(page);
  check('the lift sets the toy down on the table top, and the camera is back above it', s4.level === 'table' && Math.abs(s4.y) < 0.05 && Math.abs(s4.z - LIFT.landZ) < 0.1 && s4.cam.y > 0, JSON.stringify(s4));
  // and it walks on from there as before
  await page.evaluate(() => window.__toybox.aim(0, 0.3)); // camera south of the toy: W walks north, into the Hub
  await page.keyboard.down('w');
  await page.waitForTimeout(1200);
  await page.keyboard.up('w');
  await frames(page, 4);
  const s5 = await me(page);
  check('off the lift, the toy walks on into the Hub', s5.level === 'table' && s5.z < s4.z - 0.5, JSON.stringify(s5));
  check('no page errors (desktop)', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

async function phone(browser) {
  const { ctx, page, errs } = await open(browser, { ...devices['iPhone 13'] });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id = 0]) => ({ x, y, id })) });
  const tapInteract = async (id) => {
    const el = await page.waitForSelector('.touch-btn--interact', { timeout: 60000 });
    const b = await el.boundingBox();
    await touch('touchStart', [[b.x + b.width / 2, b.y + b.height / 2, id]]);
    await page.waitForTimeout(150);
    await touch('touchEnd', []);
  };
  // the Interact button boards the car
  await page.evaluate(([x, z]) => { window.__toybox.teleport(x, z - 2.5, 0); window.__toybox.aim(Math.PI, 0.35); }, [CAR.x, CAR.z]);
  await page.waitForFunction(() => document.querySelector('.touch-btn--interact')?.getAttribute('aria-label')?.includes('toy car'), null, { timeout: 60000 }).catch(() => null);
  await tapInteract(7);
  await page.waitForFunction(() => window.__toybox.ride.state().kind === 'car', null, { timeout: 10000 }).catch(() => null);
  check('phone: the Interact button boards the toy car', (await rideState(page)).kind === 'car');
  const s = await waitLanded(page);
  check('phone: the car brings the toy down to the arcade floor', s.level === 'floor' && Math.abs(s.y - FLOOR_Y) < 0.05, JSON.stringify(s));
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
  // and the lift back up
  await page.evaluate(([x, z]) => window.__toybox.teleport(x, z - 2, 0, 'floor'), [LIFT.x, LIFT.z]);
  await page.waitForFunction(() => document.querySelector('.touch-btn--interact')?.getAttribute('aria-label')?.includes('lift'), null, { timeout: 60000 }).catch(() => null);
  await tapInteract(8);
  await page.waitForFunction(() => window.__toybox.ride.state().kind === 'lift', null, { timeout: 10000 }).catch(() => null);
  check('phone: the Interact button boards the lift', (await rideState(page)).kind === 'lift');
  const up = await waitLanded(page);
  check('phone: the lift brings the toy back up to the table', up.level === 'table' && Math.abs(up.y) < 0.05, JSON.stringify(up));
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
