/* Secrets, climbing, boost and persistence checks. Run: BASE_URL=http://localhost:4173/ node tests/e2e/secrets.cjs */
const { chromium } = require('playwright');
const res = [];
const check = (n, ok, d = '') => res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low' }, version: 0 })); } });
  await page.goto('' + (process.env.BASE_URL || 'http://localhost:4173/') + '?debug');
  await page.waitForTimeout(3000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  const st = () => page.evaluate(() => window.__toybox.state());

  // Climb: from the book top (2.0), jump onto the eraser (3.5)
  await page.evaluate(() => window.__toybox.teleport(-32, 26.5, Math.PI / 2)); // on the book, clear of the eraser
  await page.waitForTimeout(1500);
  let s = await st();
  check('book is standable (teleport lands on top)', Math.abs(s.y - 2.0) < 0.05, `y=${s.y.toFixed(2)}`);

  // Key on top of tower
  await page.evaluate(() => window.__toybox.teleport(-29.6, 25.2, 0));
  await page.waitForTimeout(2000);
  s = await st();
  check('tower block top is standable', Math.abs(s.y - 5.0) < 0.05, `y=${s.y.toFixed(2)}`);
  const kp = await page.textContent('.prompt').catch(() => null);
  check('key prompt appears on top of tower', !!kp && kp.includes('golden key'), JSON.stringify(kp));
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1500);
  s = await st();
  check('key grants speed boost', s.anim.boosted === true);

  // Key prompt must NOT appear from the ground below
  await page.evaluate(() => window.__toybox.teleport(-33.0, 25.2, 0));
  await page.waitForTimeout(1500);
  s = await st();
  const kp2 = await page.textContent('.prompt').catch(() => null);
  check('key unreachable from the ground (minY)', !(kp2 || '').includes('golden key'), `y=${s.y.toFixed(2)} prompt=${JSON.stringify(kp2)}`);

  // Marble push
  await page.evaluate(() => window.__toybox.teleport(-9, -2.6, Math.PI));
  await page.waitForTimeout(1500);
  const mp = await page.textContent('.prompt').catch(() => null);
  check('marble prompt', !!mp && mp.includes('marble'), JSON.stringify(mp));
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(4000);

  // Music box
  await page.evaluate(() => window.__toybox.teleport(11, -24.5, Math.PI));
  await page.waitForTimeout(1500);
  const mb = await page.textContent('.prompt').catch(() => null);
  check('music box prompt', !!mb && mb.includes('music box'), JSON.stringify(mb));
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1500);
  const secrets = await page.textContent('.hud-secrets');
  check('three secrets counted (key, marble, music box)', secrets?.trim().startsWith('3'), secrets);
  // persistence
  await page.reload();
  await page.waitForTimeout(3000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  check('secrets persist across reload', (await page.textContent('.hud-secrets'))?.trim().startsWith('3'));
  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(res.join('\n'));
  await browser.close();
})();
