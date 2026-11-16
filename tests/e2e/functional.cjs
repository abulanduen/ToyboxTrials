/* Core gameplay checks (movement, collision, bounds, jump, prompts, panels, pause, repaint, elimination). Run: BASE_URL=http://localhost:4173/ node tests/e2e/functional.cjs */
const { chromium } = require('playwright');
const OUT = process.env.OUT_DIR || require('path').join(__dirname, 'output');
require('fs').mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low' }, version: 0 })));
  await page.goto('' + (process.env.BASE_URL || 'http://localhost:4173/') + '?debug');
  await page.waitForTimeout(4000);
  const T = (fn, ...a) => page.evaluate(fn, ...a);
  const st = () => T(() => window.__toybox.state());
  const holdFrames = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(400); };

  check('title screen visible', await page.isVisible('.title-sign'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  check('HUD visible after start', await page.isVisible('.hud-sign'));

  // Movement
  let a = await st();
  await holdFrames('KeyW', 6000);
  let b = await st();
  check('W moves toy forward (-z)', b.z < a.z - 0.5, `z ${a.z.toFixed(2)} -> ${b.z.toFixed(2)}`);

  // Collision with pavilion front wall (front face at z = -15.7, radius 0.85)
  await T(() => window.__toybox.teleport(0, -13.6, Math.PI));
  await page.waitForTimeout(800);
  await holdFrames('KeyW', 9000);
  b = await st();
  check('pavilion blocks movement', b.z > -15.0 && b.z < -14.3, `stopped at z=${b.z.toFixed(2)} (expected ≈ -14.85)`);

  // Play bounds at the table-side edge (maxZ 33 - r 0.85)
  await T(() => window.__toybox.teleport(-20, 31, Math.PI));
  await page.waitForTimeout(600);
  await holdFrames('KeyS', 9000);
  b = await st();
  check('play-area bound holds at the table edge', b.z <= 32.16, `z=${b.z.toFixed(2)} (max 32.15)`);

  // Jump
  await T(() => window.__toybox.teleport(0, 20, Math.PI));
  await page.waitForTimeout(600);
  await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  await page.keyboard.up('Space');
  let peak = 0;
  for (let i = 0; i < 6; i++) { const s = await st(); peak = Math.max(peak, s.y); await page.waitForTimeout(150); }
  check('Space jumps (y > 0 while airborne)', peak > 0.2, `peak sample y=${peak.toFixed(2)}`);
  await page.waitForTimeout(1500);

  // Step onto the domino slab (0.75 tall) requires jump; walking onto the book from the domino also needs jump.
  // Interaction prompt + Copycat panel
  await T(() => window.__toybox.teleport(13.9, -20.4, Math.PI - 0.55));
  await page.waitForTimeout(2500);
  const promptTxt = await page.textContent('.prompt').catch(() => null);
  check('prompt shows at Copycat gate', !!promptTxt && promptTxt.includes('Copycat'), JSON.stringify(promptTxt));
  await page.screenshot({ path: `${OUT}/10-gate-prompt.png` });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(2000);
  check('E opens Copycat Conductor panel', await page.isVisible('.info-panel'), await page.textContent('.info-panel h2').catch(() => ''));
  await page.keyboard.press('KeyS');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/11-copycat-panel.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  check('Esc closes panel without opening pause', !(await page.isVisible('.info-panel')) && !(await page.isVisible('.pause')));

  // Pause via Escape (no pointer lock in headless)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  check('Esc opens pause menu', await page.isVisible('.pause'));
  await page.screenshot({ path: `${OUT}/12-pause.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  check('Esc resumes', !(await page.isVisible('.pause')));

  // Workshop repaint
  const before = await page.textContent('.hud-sign__sub');
  await T(() => window.__toybox.teleport(-24.0, -2.6, 0.3 + Math.PI));
  await page.waitForTimeout(2500);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1500);
  const after = await page.textContent('.hud-sign__sub');
  check('Workshop repaints the toy', before !== after, `${before} -> ${after}`);

  // Jack-in-the-box elimination + respawn
  await T(() => window.__toybox.teleport(-31.8, -21.5, -Math.PI / 2));
  await page.waitForTimeout(2500);
  const jp = await page.textContent('.prompt').catch(() => null);
  await page.keyboard.press('KeyE');
  let sawElim = false;
  for (let i = 0; i < 10; i++) { const s = await st(); if (s.anim.elimT >= 0) { sawElim = true; break; } await page.waitForTimeout(300); }
  check('jack-in-the-box eliminates the toy', sawElim, `prompt was ${JSON.stringify(jp)}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/13-elimination.png` });
  let respawned = false;
  for (let i = 0; i < 120; i++) { const s = await st(); if (s.anim.elimT < 0 && Math.abs(s.z - 22) < 0.5) { respawned = true; break; } await page.waitForTimeout(500); }
  check('toy respawns at spawn after elimination', respawned);
  const secrets = await page.textContent('.hud-secrets');
  check('secret counter increments', secrets?.trim().startsWith('1'), secrets);

  check('no console/page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log(results.join('\n'));
  await browser.close();
})();
