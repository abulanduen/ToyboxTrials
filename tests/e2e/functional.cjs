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
  await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, quality: 'low' }, version: 0 })));
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

  // Hub play, offline (the browser runs the same physics as the online server): kick the marble
  // with E, pick up the basketball with E, hold E to charge and let go to throw; a basket; a goal.
  const hp = () => T(() => window.__toybox.hubplay.state());
  const waitHp = (fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 200 }).catch(() => null);
  const m0 = (await hp()).marble;
  await T(([x, z]) => window.__toybox.teleport(x + 2.3, z, -Math.PI / 2), [m0.x, m0.z]);
  await page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Kick'), null, { timeout: 120000 }).catch(() => null);
  const promptHas = async (...parts) => { const t = (await page.textContent('.prompt').catch(() => '')) || ''; return parts.every((x) => t.includes(x)); };
  check('next to the marble the prompt says Kick (the giant marble)', await promptHas('Kick', 'the giant marble'));
  await page.keyboard.press('KeyE');
  await waitHp((x) => window.__toybox.hubplay.state().marble.x < x - 4, m0.x);
  const m1 = (await hp()).marble;
  check('E kicks the marble the way the toy faces', m1.x < m0.x - 4 && Math.abs(m1.z - m0.z) < 2, `x ${m0.x.toFixed(1)} → ${m1.x.toFixed(1)}`);
  check('kicking the marble is still a playroom secret', (await page.textContent('.hud-secrets'))?.trim().startsWith('2'));

  await T(() => window.__toybox.teleport(76, -125.6, Math.PI));
  await page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Pick up'), null, { timeout: 120000 }).catch(() => null);
  check('by the hoop the prompt says Pick up (the basketball)', await promptHas('Pick up', 'the basketball'));
  await page.keyboard.press('KeyE');
  await waitHp(() => window.__toybox.hubplay.state().holding);
  await page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Hold to throw'), null, { timeout: 60000 }).catch(() => null);
  check('E picks the ball up; the prompt becomes Hold to throw', (await hp()).holding && (await promptHas('Hold to throw')));
  await page.keyboard.down('KeyE');
  await waitHp(() => (window.__toybox.hubplay.state().charge ?? 0) > 0.3, null, 60000);
  await waitHp(() => document.querySelector('[data-testid=hubplay-meter]')?.style.display !== 'none', null, 120000);
  const charging = await hp();
  const meterShown = await page.isVisible('[data-testid=hubplay-meter]');
  const arcDots = await T(() => window.__toybox.three().scene.getObjectByName('hubplay:arc')?.count ?? 0);
  await page.screenshot({ path: `${OUT}/14-hubplay-charge.png` });
  await page.keyboard.up('KeyE');
  await waitHp(() => { const s = window.__toybox.hubplay.state(); return !s.holding && !s.ball.held; });
  const thrown = await hp();
  check('holding E charges (meter and arc preview showing); letting go throws', charging.charge > 0.3 && meterShown && arcDots > 3 && !thrown.holding && !thrown.ball.held, `charge ${charging.charge?.toFixed(2)}, meter ${meterShown}, arc ${arcDots} dots`);
  // software GL runs a few frames a second here, so the flight takes a while: wait until it rests
  await waitHp(() => window.__toybox.hubplay.state().ballRest, null, 400000);
  // a basket: pick it up where it landed, then throw from in front of the hoop with the solved power
  const bl = (await hp()).ball;
  await T(([x, z]) => { const d = Math.hypot(76 - x, -128 - z) || 1; window.__toybox.teleport(x + ((76 - x) / d) * 2, z + ((-128 - z) / d) * 2, Math.PI); }, [bl.x, bl.z]);
  await page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Pick up'), null, { timeout: 120000 }).catch(() => null);
  await page.keyboard.press('KeyE');
  await waitHp(() => window.__toybox.hubplay.state().holding);
  await T(() => window.__toybox.teleport(72, -125, Math.atan2(76 - 72, -137.2 + 125)));
  await page.waitForTimeout(500);
  const shot = await T(() => window.__toybox.hubplay.solve());
  await T(([y, p]) => window.__toybox.hubplay.throw(y, p), [shot.yaw, shot.power]);
  await waitHp(() => window.__toybox.hubplay.state().hoops >= 1, null, 120000);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/15-hubplay-basket.png` });
  const afterBasket = await hp();
  check('a throw through the hoop scores a basket (yours, and the Hub tally)', afterBasket.hoops === 1 && afterBasket.mine === 1, `power ${shot.power}, hoops ${afterBasket.hoops}, mine ${afterBasket.mine}`);
  check('…and the HUD shows the tally', ((await page.textContent('[data-testid=hubplay-baskets]').catch(() => '')) || '').includes('Baskets 1'), await page.textContent('[data-testid=hubplay-score]').catch(() => ''));
  // Dribble: walking with the ball bounces it between hand and floor. Snatch: a ball in mid-air is
  // caught with E (the test freezes the offline ball mid-flight: software GL draws a few frames a second).
  await waitHp(() => window.__toybox.hubplay.state().ballRest, null, 400000);
  const bl2 = (await hp()).ball;
  await T(([x, z]) => { const d = Math.hypot(76 - x, -128 - z) || 1; window.__toybox.teleport(x + ((76 - x) / d) * 2, z + ((-128 - z) / d) * 2, Math.PI); }, [bl2.x, bl2.z]);
  await page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Pick up'), null, { timeout: 120000 }).catch(() => null);
  await page.keyboard.press('KeyE');
  await waitHp(() => window.__toybox.hubplay.state().holding);
  await T(() => window.__toybox.teleport(40, -122, Math.PI / 2));
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyW');
  const ys = [];
  for (let i = 0; i < 30; i++) {
    ys.push((await hp()).ball.y);
    if (i === 15) await page.screenshot({ path: `${OUT}/15b-hubplay-dribble.png` });
    await page.waitForTimeout(120);
  }
  await page.keyboard.up('KeyW');
  const lo = Math.min(...ys), hi = Math.max(...ys);
  check('walking with the ball dribbles it: it bounces between the floor and the hand', lo < 1.5 && hi > 1.8 && (await hp()).holding, `ball y ${lo.toFixed(2)} … ${hi.toFixed(2)}`);
  await page.waitForTimeout(800);
  const still = (await hp()).ball.y;
  check('…and standing still holds it up again', still > 2, `y ${still.toFixed(2)}`);
  await T(() => window.__toybox.teleport(60, -122, Math.PI / 2));
  await page.waitForTimeout(300);
  const lob = await T(() => {
    const h = window.__toybox.hubplay;
    h.throw(Math.PI / 2, 0);
    h.freeze(true);
    let b = h.advance(0);
    for (let i = 0; i < 300 && !(b.vy < 0 && b.y < 4.6); i++) b = h.advance(1);
    return b;
  });
  await page.waitForTimeout(700); // past your own throw's half second
  check('a frozen lob hangs in mid-air, not held', !lob.holder && lob.y > 3 && lob.y < 4.7 && (await hp()).ball.y > 3, JSON.stringify(lob));
  await T(([x, z]) => window.__toybox.teleport(x - 1.2, z, Math.PI / 2), [lob.x, lob.z]);
  await page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Snatch'), null, { timeout: 120000 }).catch(() => null);
  check('under a ball in mid-air the prompt says Snatch (the basketball), not Pick up', await promptHas('Snatch', 'the basketball'), await page.textContent('.prompt').catch(() => ''));
  await page.screenshot({ path: `${OUT}/15c-hubplay-snatch-prompt.png` });
  await page.keyboard.press('KeyE');
  await waitHp(() => window.__toybox.hubplay.state().holding, null, 60000);
  const snatched = await T(() => [...document.querySelectorAll('.ticket')].some((t) => t.textContent.includes('Snatched!')));
  check('E snatches it: you hold it, with a Snatched! ticket', (await hp()).holding && snatched);
  await T(() => window.__toybox.hubplay.freeze(false));
  await T(() => window.__toybox.hubplay.throw(Math.PI / 2, 0.3));
  await waitHp(() => window.__toybox.hubplay.state().ballRest, null, 400000);

  // a goal in the east net (Coral scores)
  await T(() => window.__toybox.hubplay.place(101 - 11.8, -126));
  await T(() => window.__toybox.teleport(101 - 14.2, -126, Math.PI / 2));
  await page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Kick'), null, { timeout: 120000 }).catch(() => null);
  await page.keyboard.press('KeyE');
  await waitHp(() => window.__toybox.hubplay.state().score[0] === 1, null, 120000);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/16-hubplay-goal.png` });
  check('kicking the marble into the east net scores for Coral', (await hp()).score.join() === '1,0', JSON.stringify((await hp()).score));
  check('…and the HUD shows Coral 1 – 0 Blue', ((await page.textContent('[data-testid=hubplay-goals]').catch(() => '')) || '').replace(/\s/g, '') === '1–0');
  await waitHp(() => { const m = window.__toybox.hubplay.state().marble; return !m.inNet && Math.abs(m.x - 26) < 0.5; }, null, 120000);
  check('after the goal the marble goes back to the centre spot', Math.abs((await hp()).marble.x - 26) < 0.5);

  // Hold Alt: a free cursor for the HUD (no pause), with its hint; let go and it's gone.
  await page.keyboard.down('Alt');
  await page.waitForSelector('[data-testid=cursor-free]', { timeout: 30000 }).catch(() => null);
  const freed = await T(() => ({ hint: !!document.querySelector('[data-testid=cursor-free]'), paused: !!document.querySelector('.pause'), locked: !!document.pointerLockElement }));
  await page.keyboard.up('Alt');
  await page.waitForTimeout(400);
  const after = await T(() => !!document.querySelector('[data-testid=cursor-free]'));
  check('holding Alt frees the cursor (hint shown, no pause, no pointer lock); letting go ends it', freed.hint && !freed.paused && !freed.locked && !after, JSON.stringify({ ...freed, after }));
  check('no console/page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log(results.join('\n'));
  await browser.close();
})();
