/* Milestone 3: main menu, sheets, Workshop customisation, unlocks, persistence, deep links.
   Run: BASE_URL=http://localhost:4173/ node tests/e2e/menu.cjs */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const res = [];
const check = (n, ok, d = '') => res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // Seed a clean save once (not on reloads, so persistence can be tested).
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'balanced' }, version: 0 }));
    }
  });

  await page.goto(BASE + '?debug');
  check('loading card shows first', await page.isVisible('.loading'));
  await page.waitForSelector('.loading', { state: 'detached', timeout: 120000 });
  check('loading card goes away after first frames', !(await page.isVisible('.loading')));
  await page.waitForTimeout(2500);
  check('main menu visible with Play / Workshop / Settings / How to play', (await page.$$('.menu-buttons .toy-btn')).length === 4);
  await page.screenshot({ path: `${OUT}/m3-01-menu.png` });

  // How to play + Esc
  await page.click('[data-testid=menu-howto]');
  await page.waitForTimeout(600);
  check('How to play opens', await page.isVisible('.howto'));
  await page.screenshot({ path: `${OUT}/m3-02-howto.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Esc closes How to play', !(await page.isVisible('.howto')));

  // Settings sheet
  await page.click('[data-testid=menu-settings]');
  await page.waitForTimeout(500);
  check('Settings sheet opens from menu', await page.isVisible('.pause__grid'));
  // Changing quality remounts the 3D canvas — must not crash (regression: light-target cleanup).
  await page.click('.segmented button >> text=low');
  await page.waitForTimeout(2500);
  await page.click('.segmented button >> text=balanced');
  await page.waitForTimeout(2500);
  check('switching quality tiers keeps the app alive', (await page.isVisible('.pause__grid')) && errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.click('.pause__actions .toy-btn');
  await page.waitForTimeout(400);

  // Workshop from menu
  await page.click('[data-testid=menu-workshop]');
  await page.waitForTimeout(2500);
  check('Workshop opens from menu', await page.isVisible('.workshop-panel'));
  check('URL hash follows screen', (await page.evaluate(() => location.hash)) === '#workshop');
  await page.fill('.workshop-name input', 'Bolt');
  await page.click('.workshop-tabs button >> nth=1'); // Hats
  await page.waitForTimeout(300);
  const acorn = page.locator('.swatch', { hasText: 'Acorn cap' });
  check('Acorn cap starts locked', (await acorn.getAttribute('aria-label')).includes('locked'));
  await acorn.click();
  await page.waitForTimeout(300);
  check('clicking a locked hat explains how to unlock it', (await page.textContent('.workshop-info')).includes('marble'));
  await page.locator('.swatch', { hasText: 'Thimble helmet' }).click();
  await page.waitForTimeout(1500);
  check('free hat can be equipped', (await page.locator('.swatch', { hasText: 'Thimble helmet' }).getAttribute('aria-selected')) === 'true');
  await page.screenshot({ path: `${OUT}/m3-03-workshop-hat.png` });
  await page.click('.workshop-tabs button >> nth=2'); // Keys
  await page.waitForTimeout(300);
  await page.locator('.swatch', { hasText: 'Heart key' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/m3-04-workshop-key.png` });
  await page.click('[data-testid=workshop-done]');
  await page.waitForTimeout(1500);
  check('Done returns to the menu', await page.isVisible('[data-testid=menu-play]'));
  check('menu card shows the new name', (await page.textContent('.menu-contender strong')) === 'Bolt');

  // Persistence
  await page.reload();
  await page.waitForSelector('.loading', { state: 'detached' });
  await page.waitForTimeout(1500);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state);
  check('name, hat and key persist across reload', saved.contenderName === 'Bolt' && saved.hat === 'thimble' && saved.keySkin === 'heart', JSON.stringify({ n: saved.contenderName, h: saved.hat, k: saved.keySkin }));

  // Deep link #play
  await page.goto(BASE + '?debug#play');
  await page.waitForSelector('.loading', { state: 'detached' });
  await page.waitForTimeout(2500);
  check('#play deep link opens the Playroom', await page.isVisible('.hud-sign'));
  check('HUD shows the contender name', (await page.textContent('.hud-sign__sub')) === 'Bolt');
  await page.screenshot({ path: `${OUT}/m3-05-hub-signs.png` });

  // Secret → unlock
  await page.evaluate(() => window.__toybox.teleport(-9, -2.6, Math.PI));
  await page.waitForTimeout(2500);
  await page.waitForSelector('.prompt', { timeout: 30000 });
  await page.keyboard.press('KeyE');
  // Wait for the reward rather than a fixed delay: software-rendered frames are slow in CI.
  await page.waitForSelector('.ticket--reward', { timeout: 30000 }).catch(() => null);
  const ticket = await page.textContent('.tickets').catch(() => '');
  check('secret reward ticket names the unlock', ticket.includes('Acorn cap'), ticket.slice(0, 90));
  await page.keyboard.press('Escape'); // pause
  await page.waitForTimeout(800);
  await page.click('.pause__actions .toy-btn >> nth=1'); // Workshop
  await page.waitForTimeout(2500);
  await page.click('.workshop-tabs button >> nth=1');
  await page.waitForTimeout(300);
  check('Acorn cap is now unlocked', !(await page.locator('.swatch', { hasText: 'Acorn cap' }).getAttribute('aria-label')).includes('locked'));
  await page.locator('.swatch', { hasText: 'Acorn cap' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/m3-06-workshop-acorn.png` });
  check('Workshop opened from the Playroom offers "Back to the Playroom"', (await page.textContent('[data-testid=workshop-done]')).includes('Playroom'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  check('Esc leaves the Workshop back to the Playroom', await page.isVisible('.hud-sign'));

  // Pause → Main menu puts the toy back on the spawn tile
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.click('.pause__actions .toy-btn >> nth=2');
  await page.waitForTimeout(3000);
  const st = await page.evaluate(() => window.__toybox.state());
  check('Main menu resets the toy to the spawn tile', Math.abs(st.z - 22) < 0.5 && Math.abs(st.x) < 0.5, `x=${st.x.toFixed(1)} z=${st.z.toFixed(1)}`);
  check('Enter on the menu starts play', (await (async () => { await page.keyboard.press('Enter'); await page.waitForTimeout(2000); return page.isVisible('.hud-sign'); })()));

  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(res.join('\n'));
  await browser.close();
})();
