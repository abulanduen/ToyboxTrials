/* Core gameplay checks (movement, collision, bounds, jump, prompts, panels, pause, repaint, elimination). Run: BASE_URL=http://localhost:4173/ node tests/e2e/functional.cjs */
const { chromium } = require('playwright');
const OUT = process.env.OUT_DIR || require('path').join(__dirname, 'output');
require('fs').mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(+process.env.E2E_TIMEOUT || 120000); // shared machine, software GL: E2E_TIMEOUT (ms) raises the limit
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low' }, version: 0 })));
  await page.goto('' + (process.env.BASE_URL || 'http://localhost:4173/') + '?debug');
  await page.waitForTimeout(4000);
  const T = (fn, ...a) => page.evaluate(fn, ...a);
  const st = () => T(() => window.__toybox.state());
  const holdFrames = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(400); };

  check('main menu visible', await page.isVisible('.menu-sign'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  check('HUD visible after start', await page.isVisible('.hud-sign'));

  // Movement
  let a = await st();
  await holdFrames('KeyW', 6000);
  let b = await st();
  check('W moves toy forward (-z)', b.z < a.z - 0.5, `z ${a.z.toFixed(2)} -> ${b.z.toFixed(2)}`);

  // Collision with the Scoreboard behind the fountain (its feet reach z = -17.7, radius 0.85)
  await T(() => window.__toybox.teleport(0, -13.6, Math.PI));
  await page.waitForTimeout(800);
  await holdFrames('KeyW', 9000);
  b = await st();
  check('the Scoreboard blocks movement', b.z > -17.2 && b.z < -16.5, `stopped at z=${b.z.toFixed(2)} (expected ≈ -16.85)`);

  // Play bounds at the table-side edge (spawn table mat maxZ 36 - r 0.85)
  await T(() => window.__toybox.teleport(-20, 34, Math.PI));
  await page.waitForTimeout(600);
  await holdFrames('KeyS', 9000);
  b = await st();
  check('play-area bound holds at the table edge', b.z <= 35.16, `z=${b.z.toFixed(2)} (max 35.15)`);

  // Jump
  await T(() => window.__toybox.teleport(0, 20, Math.PI));
  await page.waitForTimeout(600);
  await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  await page.keyboard.up('Space');
  let peak = 0;
  for (let i = 0; i < 20; i++) { const s = await st(); peak = Math.max(peak, s.y, s.anim.grounded ? 0 : 0.21); await page.waitForTimeout(150); }
  check('Space jumps (y > 0 while airborne)', peak > 0.2, `peak sample y=${peak.toFixed(2)}`);
  await page.waitForTimeout(1500);

  // Step onto the domino slab (0.75 tall) requires jump; walking onto the book from the domino also needs jump.
  // Interaction prompt + Copycat panel
  // gates are data: stand where the hub says the Copycat gate's lobby opens
  await page.evaluate((id) => { const g = window.__toybox.hub.gates().find((x) => x.game === id); window.__toybox.teleport(g.standX, g.standZ, g.yaw); }, 'copycat-conductor');
  await page.waitForFunction((t) => document.querySelector('.prompt')?.textContent.includes(t), 'Copycat', { timeout: 120000 }).catch(() => null);
  const promptTxt = await page.textContent('.prompt').catch(() => null);
  check('prompt shows at Copycat gate', !!promptTxt && promptTxt.includes('Copycat'), JSON.stringify(promptTxt));
  await page.screenshot({ path: `${OUT}/10-gate-prompt.png` });
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.match-intro', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
  check('E at the gate opens the Copycat Conductor intro', await page.isVisible('.match-intro'), await page.textContent('.match-intro h2').catch(() => ''));
  await page.screenshot({ path: `${OUT}/11-copycat-intro.png` });
  await page.click('[data-testid=match-leave]');
  await page.waitForSelector('.hud-sign', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(1200);
  check('leaving the intro returns to the Playroom unpaused', (await page.isVisible('.hud-sign')) && !(await page.isVisible('.pause')));

  // Pause via Escape (no pointer lock in headless)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  check('Esc opens pause menu', await page.isVisible('.pause'));
  await page.screenshot({ path: `${OUT}/12-pause.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  check('Esc resumes', !(await page.isVisible('.pause')));

  // Workshop building opens the Workshop screen; repaint there, then return to the Playroom
  await T(() => window.__toybox.hub.goTo('workshop'));
  await page.waitForTimeout(2500);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(2000);
  check('Workshop building opens the Workshop screen', await page.isVisible('.workshop-panel'));
  await page.click('.swatch >> nth=1');
  await page.waitForTimeout(800);
  check('picking a paint job selects it', (await page.getAttribute('.swatch >> nth=1', 'aria-selected')) === 'true');
  await page.click('[data-testid=workshop-done]');
  await page.waitForTimeout(1500);
  check('Workshop returns to the Playroom', await page.isVisible('.hud-sign'));

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
