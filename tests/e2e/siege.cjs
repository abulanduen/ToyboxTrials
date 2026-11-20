/*
 * Toybox Siege, production preview: Pavilion practice list → class pick → move (keys or touch
 * joystick) → level-up card → fast-forward to an elite → treasure → send an elite to a bot board →
 * knocked down → revive → ghost → cycle boards → boss → results → back to the hub. Desktop, phone
 * portrait and phone landscape; no page errors. Screenshots land in tests/e2e/output/siege-*.png.
 *
 *   BASE_URL=http://localhost:4202/ node tests/e2e/siege.cjs        (ONLY=desktop|portrait|landscape)
 *
 * Software GL renders at 1–3 fps here, so the test waits on conditions, never on fixed frame
 * counts, and uses the ?debug match hooks to fast-forward and to set up a few moments (a full
 * health bar for the fast-forward, a cheap knockout) that would otherwise take minutes of play.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, 'output');
fs.mkdirSync(out, { recursive: true });
const SHOT_TIMEOUT = 240000;
const VIEWS = {
  desktop: { viewport: { width: 1280, height: 800 }, touch: false, cls: 'ranger' },
  portrait: { viewport: { width: 390, height: 844 }, touch: true, cls: 'warrior' },
  landscape: { viewport: { width: 844, height: 390 }, touch: true, cls: 'mage' },
};

/** Push the touch joystick (CDP touch events) in a direction until `until(arg)` holds in the page, then let go. */
async function stickUntil(page, [dx, dy], until, arg) {
  const cdp = await page.context().newCDPSession(page);
  const zone = await page.locator('.touch-stick-zone').boundingBox();
  const x = zone.x + zone.width * 0.4, y = zone.y + zone.height * 0.55;
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([px, py]) => ({ x: px, y: py, id: 1 })) });
  await send('touchStart', [[x, y]]);
  await send('touchMove', [[x + dx * 20, y + dy * 20]]);
  await send('touchMove', [[x + dx * 60, y + dy * 60]]);
  try { await page.waitForFunction(until, arg); } finally { await send('touchEnd', []); await cdp.detach(); }
}

const me = 'window.__toybox.match.state().players.find(p => p.id === "you")';

async function run(name) {
  const v = VIEWS[name];
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: v.viewport, hasTouch: v.touch, isMobile: v.touch });
    const page = await context.newPage();
    page.setDefaultTimeout(600000); // software GL under heavy load can take tens of seconds per frame
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Phones keep the layout shots (class pick, card, swarm, boss, ghost); desktop takes every moment.
    const PHONE_SHOTS = ['1-class-pick', '2-levelup', '5-swarm', '7-boss', '8-ghost'];
    const missed = [];
    const shot = async (label) => {
      if (v.touch && !PHONE_SHOTS.includes(label)) return;
      // A screenshot that times out under load is reported, not fatal: the gameplay checks are the test.
      await page.screenshot({ path: path.join(out, `siege-${name}-${label}.png`), timeout: SHOT_TIMEOUT }).catch((e) => { missed.push(label); console.log(`  [${name}] screenshot ${label} skipped: ${e.message.split('\n')[0]}`); });
    };
    // force: the HUD re-renders ten times a second, and at a frame every few seconds Playwright's stability check can starve.
    const tap = (locator) => (v.touch ? locator.tap({ force: true }) : locator.click({ force: true }));
    const state = (fn, arg) => page.evaluate(fn, arg);
    /** Skip the run clock ahead (software GL here can drop to a frame every few seconds), then fast-forward the rest with timeScale. */
    const skipTo = (ms) => state((t) => { const st = window.__toybox.match.state(); if (st.runT < t) st.runT = t; }, ms);
    const t0 = Date.now();
    const step = async (label) => console.log(`  [${name}] ${((Date.now() - t0) / 1000).toFixed(0)}s ${label} (run ${await state(() => (window.__toybox.match.state()?.runT / 1000 || 0).toFixed(1)).catch(() => '?')}s)`);
    /** Take any open level-up / treasure cards (option 1) at normal speed, so a frozen screenshot shows the board. */
    const clearCards = async () => {
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      for (let i = 0; i < 40; i++) {
        const card = await state(() => window.__toybox.match.state().players.find((q) => q.id === 'you').choice?.at ?? null);
        if (card === null) break;
        await tap(page.getByTestId('siege-option-0')).catch(() => {});
        await page.waitForFunction((at) => (window.__toybox.match.state().players.find((q) => q.id === 'you').choice?.at ?? null) !== at, card).catch(() => {});
      }
    };
    /** Freeze the match with no card open (a gem can level the toy up again between the last check and the freeze). */
    const freezeClear = async () => {
      for (let round = 0; round < 6; round++) {
        await clearCards();
        await page.evaluate(() => window.__toybox.match.timeScale(0));
        await page.waitForTimeout(400);
        if (!(await state(() => !!window.__toybox.match.state().players.find((q) => q.id === 'you').choice))) return;
      }
    };
    await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, quality: 'low', tutorials: false }, version: 0 })));
    await page.goto((process.env.BASE_URL || 'http://localhost:4202/') + '?debug#play');
    await page.waitForSelector('.loading', { state: 'detached', timeout: 180000 });

    // ---- Pavilion → practice list → intro card (3 bots) → countdown
    await page.evaluate(() => window.__toybox.hub.goTo('pavilion'));
    await page.waitForSelector('.prompt');
    if (v.touch) await page.locator('.prompt').tap(); else await page.keyboard.press('KeyE');
    // Menu cards are static, so these use Playwright's normal (scroll, wait-until-stable) clicks.
    const ui = (locator) => (v.touch ? locator.tap() : locator.click());
    await ui(page.getByTestId('practice-toybox-siege'));
    await page.getByTestId('match-start').waitFor({ state: 'visible' });
    await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after they appear
    await ui(page.locator('.intro-options .segmented button', { hasText: /^3 bots$/i }));
    await page.waitForFunction(() => document.querySelector('.intro-options .segmented button.on')?.textContent?.trim().toLowerCase() === '3 bots');
    await ui(page.getByTestId('match-start'));
    await page.waitForFunction(() => window.__toybox.match.phase() === 'countdown');
    await page.evaluate(() => window.__toybox.match.timeScale(10));
    await page.waitForFunction(() => window.__toybox.match.phase() === 'playing');
    await page.evaluate(() => window.__toybox.match.timeScale(1));

    // ---- Class pick: untimed card over a blurred board
    await page.getByTestId('siege-class-card').waitFor();
    assert.equal(await state(() => window.__toybox.match.state().phase), 'pick');
    await step('1-class-pick');
    await shot('1-class-pick');
    await tap(page.getByTestId(`siege-class-${v.cls}`));
    await page.waitForFunction(() => window.__toybox.match.state().phase === 'run', null, { timeout: 600000 });
    assert.equal(await state(new Function(`return ${me}.cls`)), v.cls);
    const bots = await state(() => window.__toybox.match.state().players.filter((p) => p.id !== 'you').map((p) => p.id));
    assert.equal(bots.length, 3);
    // Keep the bots in the run, so there are live boards to watch after our toy is out (if everyone
    // is out the match simply ends, which is correct but leaves nothing to spectate).
    await state(() => { for (const p of window.__toybox.match.state().players) if (p.id !== 'you') p.invuln = 1e12; });

    // ---- Movement: keys on desktop, the floating joystick on touch
    const x0 = await state(new Function(`return ${me}.x`));
    if (v.touch) {
      assert.equal(await page.locator('.touch-stick-zone').count(), 1, 'touch joystick shown');
      await stickUntil(page, [1, 0], new Function('x', `return ${me}.x > x + 1`), x0);
    } else {
      await page.keyboard.down('KeyD');
      await page.waitForFunction(new Function('x', `return ${me}.x > x + 1`), x0);
      await page.keyboard.up('KeyD');
    }

    // ---- Level up: drop a gem on the toy, choose a card (keys on desktop, tap on touch)
    await state(() => {
      const p = window.__toybox.match.state().players.find((q) => q.id === 'you');
      const g = p.board.gems.find((x) => !x.on);
      Object.assign(g, { on: true, kind: 0, v: 12, x: p.x, z: p.z, pull: true });
    });
    await page.getByTestId('siege-levelup').waitFor();
    await step('2-levelup');
    await shot('2-levelup');
    const level = await state(new Function(`return ${me}.level`));
    assert.ok(level >= 2, 'levelled up');
    // Choose until no card is left (12 xp can be two levels).
    for (let i = 0; i < 4 && (await page.getByTestId('siege-levelup').count()); i++) {
      if (v.touch) await tap(page.getByTestId('siege-option-0')); else await page.keyboard.press('Digit1');
      await page.waitForFunction(new Function('n', `return ${me}.pendingLevels < n || !${me}.choice`), await state(new Function(`return ${me}.pendingLevels`)));
    }
    await page.waitForFunction(new Function(`return !${me}.choice`));

    // ---- Fast-forward to the first elite. Keep our toy healthy, and stop further level-ups: at a frame
    // every few seconds a tap meant for a level card could land on the treasure card that replaced it.
    await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); p.invuln = 1e12; p.xp = 0; p.xpNext = 1e9; });
    await skipTo(50000);
    await page.evaluate(() => window.__toybox.match.timeScale(60));
    for (let i = 0; i < 400; i++) {
      const s = await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); return { elite: p.board.bigs.some((g) => g.on), card: p.choice?.kind ?? null }; });
      if (s.elite) break;
      if (s.card) await tap(page.getByTestId('siege-option-0')).catch(() => {});
      await page.waitForTimeout(250);
    }
    await freezeClear();
    // Bring the elite into view and freeze for the screenshot.
    await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); const g = p.board.bigs.find((b) => b.on); g.x = p.x + 8; g.z = p.z - 4; });
    await page.waitForTimeout(1500);
    await step('3-elite');
    await shot('3-elite');

    // ---- The elite falls, drops a chest; walk onto it: treasure card; skip it to send an elite to a bot
    await state(() => {
      const p = window.__toybox.match.state().players.find((q) => q.id === 'you');
      const g = p.board.bigs.find((b) => b.on); g.hp = 1; g.x = p.x + 2.5; g.z = p.z; g.mode = 0; // the nearest enemy, so every weapon picks it
      for (const m of p.board.mobs) m.on = false; // (our immortal toy is buried in bunnies that would soak up every cork)
      if (!p.weapons.some((w) => w.id === 'popgun')) p.weapons.push({ id: 'popgun', level: 3, evolved: false, cd: 0, aux: 0 }); // reach the elite from afar
    });
    await page.evaluate(() => window.__toybox.match.timeScale(4));
    await page.waitForFunction(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); return p.board.chests.some((c) => c.on) || p.pendingChests > 0 || p.choice?.kind === 'treasure'; });
    await page.evaluate(() => window.__toybox.match.timeScale(1));
    await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); const c = p.board.chests.find((x) => x.on); if (c) { p.x = c.x; p.z = c.z; } });
    for (let i = 0; i < 100; i++) {
      const card = await state(new Function(`return ${me}.choice?.kind ?? null`));
      if (card === 'treasure') break;
      if (card === 'level') await tap(page.getByTestId('siege-option-0')).catch(() => {});
      await page.waitForTimeout(200);
    }
    console.log(`  [${name}] before the treasure: ${JSON.stringify(await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you');
      return { choice: p.choice?.kind ?? null, pendingChests: p.pendingChests, chests: p.board.chests.filter((c) => c.on).length, elites: p.board.bigs.filter((g) => g.on).length }; }))}`);
    await page.getByTestId('siege-treasure').waitFor();
    // Any rival that can take an elite right now (bots send them to each other too).
    await page.waitForSelector('[data-testid^="siege-target-"]:not([data-testid="siege-target-leader"]):not([disabled])');
    const target = await page.$eval('[data-testid^="siege-target-"]:not([data-testid="siege-target-leader"]):not([disabled])', (el) => el.dataset.testid.replace('siege-target-', ''));
    assert.ok(bots.includes(target));
    await tap(page.getByTestId(`siege-target-${target}`));
    await page.waitForSelector(`[data-testid="siege-target-${target}"][aria-pressed="true"]`);
    await step('4-treasure');
    await shot('4-treasure');
    await tap(page.locator('[data-testid^="siege-option-"][data-kind="send"]'));
    await page.evaluate(() => window.__toybox.match.timeScale(10)); // the elite lands after a 3 s warning
    await page.waitForFunction((id) => window.__toybox.match.state().players.find((p) => p.id === id).incoming.length > 0
      || window.__toybox.match.state().players.find((p) => p.id === id).board.bigs.some((g) => g.on && g.sent), target);
    await page.waitForFunction((id) => window.__toybox.match.state().players.find((p) => p.id === id).board.bigs.some((g) => g.on && g.sent && g.from === 'you'), target, { timeout: 600000 });
    assert.ok(await state(new Function(`return ${me}.sendReadyAt > window.__toybox.match.state().runT`)), 'sender cooldown started');

    // ---- Mid-swarm: let the swarm build (fast-forward to ~2:40) and measure the renderer at its busiest
    await skipTo(140000);
    await page.evaluate(() => window.__toybox.match.timeScale(60));
    for (let i = 0; i < 600; i++) {
      const s = await state(() => { const st = window.__toybox.match.state(); const p = st.players.find((q) => q.id === 'you'); return { t: st.runT, card: p.choice?.kind ?? null }; });
      if (s.t >= 160000) break;
      if (s.card) await tap(page.getByTestId('siege-option-0')).catch(() => {});
      await page.waitForTimeout(250);
    }
    await freezeClear();
    await page.waitForTimeout(1500);
    const swarm = await state(() => ({ counts: window.__toybox.siege.counts(), render: window.__toybox.renderInfo() }));
    console.log(`  [${name}] mid-swarm entities ${JSON.stringify(swarm.counts)} renderer ${JSON.stringify(swarm.render)}`);
    await step('5-swarm');
    await shot('5-swarm');

    // ---- Knocked down → revive (paid in points)
    await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); p.points = Math.max(p.points, 900); p.invuln = 0; p.hp = 0.5; if (p.choice) p.choice = null; p.pendingLevels = 0; p.pendingChests = 0; });
    await page.evaluate(() => window.__toybox.match.timeScale(1));
    await page.getByTestId('siege-downed').waitFor();
    await step('6-downed');
    await shot('6-downed');
    const before = await state(new Function(`return ${me}.points`));
    if (v.touch) await tap(page.getByTestId('siege-revive')); else await page.keyboard.press('Space');
    await page.waitForFunction(new Function(`return ${me}.status === 'alive' && ${me}.revived`));
    assert.ok((await state(new Function(`return ${me}.points`))) < before, 'revive cost points');

    // ---- The boss at 4:00
    await skipTo(232000);
    await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); p.invuln = 1e12; });
    await page.evaluate(() => window.__toybox.match.timeScale(60));
    const bossState = () => state(() => { const st = window.__toybox.match.state(); const p = st.players.find((q) => q.id === 'you');
      return { runT: Math.round(st.runT), boss: p.board.bigs.some((g) => g.on && g.type === 'baron'), card: p.choice?.kind ?? null, status: p.status, bt: Math.round(p.board.bt) }; });
    for (let i = 0; i < 600; i++) {
      const s = await bossState();
      if (s.boss || s.status !== 'alive') break;
      if (s.card) await tap(page.getByTestId('siege-option-0')).catch(() => {});
      await page.waitForTimeout(250);
    }
    await freezeClear();
    console.log(`  [${name}] before the boss shot: ${JSON.stringify(await bossState())}`);
    await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); const g = p.board.bigs.find((b) => b.on && b.type === 'baron'); if (g) { g.x = p.x + 7; g.z = p.z - 6; } });
    await page.getByTestId('siege-boss').waitFor();
    await page.waitForTimeout(1500);
    const boss = await state(() => ({ counts: window.__toybox.siege.counts(), render: window.__toybox.renderInfo() }));
    console.log(`  [${name}] boss fight entities ${JSON.stringify(boss.counts)} renderer ${JSON.stringify(boss.render)}`);
    await step('7-boss');
    await shot('7-boss');

    // ---- Second knockout: no revive left, so a ghost. Inspect other boards.
    await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); p.invuln = 0; p.hp = 0.5; p.choice = null; p.pendingLevels = 0; p.pendingChests = 0; });
    await page.evaluate(() => window.__toybox.match.timeScale(1));
    await page.getByTestId('siege-spectate').waitFor();
    assert.equal(await state(new Function(`return ${me}.status`)), 'ghost');
    const first = await state(() => window.__toybox.siege.viewed());
    assert.notEqual(first, 'you', 'a ghost watches another board');
    await tap(page.getByTestId('siege-watch-next'));
    await page.waitForFunction((was) => window.__toybox.siege.viewed() !== was, first);
    if (v.touch) await stickUntil(page, [0, -1], new Function(`return ${me}.gz < -2`));
    else { await page.keyboard.down('KeyW'); await page.waitForFunction(new Function(`return ${me}.gz < -2`)); await page.keyboard.up('KeyW'); }
    await page.waitForTimeout(1200);
    await step('8-ghost');
    await shot('8-ghost');

    // ---- Results and back to the hub
    await skipTo(290000);
    await page.evaluate(() => window.__toybox.match.timeScale(40));
    await page.waitForSelector('.results', { timeout: 300000 });
    const placed = await page.$$eval('.results-list li', (els) => els.length);
    assert.equal(placed, 4);
    const record = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['toybox-siege']);
    assert.equal(record.plays, 1);
    await step('9-results');
    await shot('9-results');
    await page.waitForTimeout(900);
    await tap(page.getByTestId('results-leave'));
    await page.waitForSelector('.hud-sign', { timeout: 600000 });
    assert.deepEqual(errors, []);
    if (missed.length) console.log(`  [${name}] screenshots missed under load: ${missed.join(', ')}`);
    console.log(`PASS Toybox Siege ${name}: class pick, ${v.touch ? 'joystick' : 'keys'}, level-up card, elite, treasure → elite sent to ${target}, downed → revive, boss, ghost + board cycling, results, hub; no page errors`);
    await context.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  const only = process.env.ONLY;
  for (const name of Object.keys(VIEWS)) if (!only || only === name) await run(name);
})().catch((e) => { console.error(e); process.exitCode = 1; });
