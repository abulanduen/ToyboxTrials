/*
 * Toybox Siege, production preview: Pavilion practice list → straight to the class pick (no 3-2-1)
 * → move (keys, or the floating joystick anywhere in the bottom half) → level-up card (icons,
 * Lv n → n+1, secret-upgrade badge) → fast-forward to an elite → treasure → send an elite to a bot
 * board → knocked down → revive → the boss at 4:00 → then, by layout:
 *   desktop and landscape: slay the boss → three chests and the magnet (prep window) → the arena
 *     opens with the bots → Rally Horn summons the Baron → knocked out → the out-popup → Watch
 *     other players → cycle fighters;
 *   portrait: a second knockout in the run → the out-popup (stays on its own board) → Watch other
 *     players → cycle boards, drift with the joystick from the other side of the bottom half → the
 *     bots' arena, watched;
 * → results → back to the hub. No page errors. Screenshots land in tests/e2e/output/siege-*.png.
 *
 *   BASE_URL=http://localhost:4198/ node tests/e2e/siege.cjs        (ONLY=desktop|portrait|landscape, E2E_TIMEOUT=ms)
 *
 * Software GL renders at 1–3 fps here, so the test waits on conditions, never on fixed frame
 * counts, and uses the ?debug match hooks to fast-forward and to set up a few moments (a full
 * health bar for the fast-forward, a cheap knockout, a staged level-up card) that would otherwise
 * take minutes of play.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, 'output');
fs.mkdirSync(out, { recursive: true });
// E2E_TIMEOUT (ms) raises the screenshot and wait timeouts on a loaded machine.
const SHOT_TIMEOUT = Number(process.env.E2E_TIMEOUT) || 240000;
const WAIT_TIMEOUT = Math.max(600000, Number(process.env.E2E_TIMEOUT) || 0);
const VIEWS = {
  desktop: { viewport: { width: 1280, height: 800 }, touch: false, cls: 'ranger', finale: 'arena' },
  portrait: { viewport: { width: 390, height: 844 }, touch: true, cls: 'warrior', finale: 'ghost' },
  landscape: { viewport: { width: 844, height: 390 }, touch: true, cls: 'mage', finale: 'arena' },
};

/** Push the touch joystick (CDP touch events) from (fx, fy) of the bottom-half zone in a direction until `until(arg)` holds in the page, then let go. */
async function stickUntil(page, [dx, dy], until, arg, [fx, fy] = [0.4, 0.55]) {
  const cdp = await page.context().newCDPSession(page);
  const zone = await page.locator('.touch-stick-zone').boundingBox();
  const x = zone.x + zone.width * fx, y = zone.y + zone.height * fy;
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
    page.setDefaultTimeout(WAIT_TIMEOUT); // software GL under heavy load can take tens of seconds per frame
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Phones keep the layout shots; desktop takes every moment.
    const PHONE_SHOTS = ['1-class-pick', '2-levelup', '5-swarm', '5b-secrets', '7-boss', '8-prep', '9-arena', '10-ally', '11-out', '12-watching'];
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
      for (let i = 0; i < 60; i++) {
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
    await page.goto((process.env.BASE_URL || 'http://localhost:4198/') + '?debug#play');
    await page.waitForSelector('.loading', { state: 'detached', timeout: 180000 });

    // ---- Pavilion → practice list → intro card (3 bots) → straight to playing: no 3-2-1 before the class pick
    await page.evaluate(() => window.__toybox.hub.goTo('pavilion'));
    await page.waitForSelector('.prompt');
    if (v.touch) await page.locator('.prompt').tap(); else await page.keyboard.press('KeyE');
    // Menu cards are static, so these use Playwright's normal (scroll, wait-until-stable) clicks.
    const ui = (locator) => (v.touch ? locator.tap() : locator.click());
    await ui(page.getByTestId('practice-group-strategy')); // the practice list opens by section
    await ui(page.getByTestId('practice-toybox-siege'));
    await page.getByTestId('match-start').waitFor({ state: 'visible' });
    await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after they appear
    await ui(page.locator('.intro-options .segmented button', { hasText: /^3 bots$/i }));
    await page.waitForFunction(() => document.querySelector('.intro-options .segmented button.on')?.textContent?.trim().toLowerCase() === '3 bots');
    await page.evaluate(() => { window.__phases = []; const tick = () => { const p = window.__toybox.match.phase(); if (window.__phases.at(-1) !== p) window.__phases.push(p); if (p !== 'playing') requestAnimationFrame(tick); }; tick(); });
    await ui(page.getByTestId('match-start'));
    await page.waitForFunction(() => window.__toybox.match.phase() === 'playing');
    const phases = await state(() => window.__phases);
    assert.ok(!phases.includes('countdown'), `no countdown before the class pick (saw ${phases.join(' → ')})`);

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
    // Keep the bots in the run, so there are live boards to watch after our toy is out and an arena at
    // the end (in the arena, weapons ignore this run-time invulnerability).
    await state(() => { for (const p of window.__toybox.match.state().players) if (p.id !== 'you') p.invuln = 1e12; });

    // ---- Movement: keys on desktop, the floating joystick (bottom half) on touch
    const x0 = await state(new Function(`return ${me}.x`));
    if (v.touch) {
      assert.equal(await page.locator('.touch-stick-zone.touch-stick-zone--half').count(), 1, 'bottom-half joystick zone');
      const zone = await page.locator('.touch-stick-zone').boundingBox();
      assert.ok(zone.width >= v.viewport.width * 0.95 && Math.abs(zone.y + zone.height - v.viewport.height) < 2 && zone.height >= v.viewport.height * 0.45, `zone covers the bottom half: ${JSON.stringify(zone)}`);
      assert.equal(await page.locator('.touch-stick--on').count(), 0, 'stick hidden until touched');
      await stickUntil(page, [1, 0], new Function('x', `return ${me}.x > x + 1`), x0);
      await page.waitForFunction(() => !document.querySelector('.touch-stick--on'));
    } else {
      await page.keyboard.down('KeyD');
      await page.waitForFunction(new Function('x', `return ${me}.x > x + 1`), x0);
      await page.keyboard.up('KeyD');
    }

    // ---- Level up: drop a gem on the toy; stage the card so one option completes an evolution pair
    await state(() => {
      const p = window.__toybox.match.state().players.find((q) => q.id === 'you');
      p.weapons[0].level = 4;
      const g = p.board.gems.find((x) => !x.on);
      Object.assign(g, { on: true, kind: 0, v: 6, x: p.x, z: p.z, pull: true });
    });
    await page.getByTestId('siege-levelup').waitFor();
    const staged = await state(() => {
      const p = window.__toybox.match.state().players.find((q) => q.id === 'you');
      const partner = { sweep: 'plating', popgun: 'gears', chime: 'magnifier' }[p.weapons[0].id];
      if (!p.passives.some((x) => x.id === partner)) p.passives.push({ id: partner, level: 1 });
      p.choice.options = [{ kind: 'weapon', id: p.weapons[0].id, level: 5 }, { kind: 'passive', id: partner, level: 2 }, { kind: 'weapon', id: 'marbles', level: 1 }];
      return p.weapons[0].id;
    });
    await page.waitForSelector('[data-testid="siege-option-0"][data-hint="ready"]');
    assert.match(await page.getByTestId('siege-option-0-level').innerText(), /Lv 4\s*→\s*5/);
    assert.match(await page.getByTestId('siege-option-2-level').innerText(), /New · Lv 1/);
    assert.match(await page.getByTestId('siege-option-0-secret').innerText(), /secret upgrade/i);
    assert.ok(await page.locator('[data-testid="siege-option-0"] svg.siege-icon').count() >= 1, 'option icon');
    await step('2-levelup');
    await shot('2-levelup');
    if (v.touch) await tap(page.getByTestId('siege-option-0')); else await page.keyboard.press('Digit1');
    await page.waitForFunction(new Function('w', `return ${me}.weapons[0].level === 5`), staged);
    for (let i = 0; i < 4 && (await page.getByTestId('siege-levelup').count()); i++) {
      if (v.touch) await tap(page.getByTestId('siege-option-0')); else await page.keyboard.press('Digit1');
      await page.waitForFunction(new Function('n', `return ${me}.pendingLevels < n || !${me}.choice`), await state(new Function(`return ${me}.pendingLevels`)));
    }
    await page.waitForFunction(new Function(`return !${me}.choice`));
    assert.ok(await page.locator('[data-testid="siege-items"] svg.siege-icon').count() >= 2, 'the kit strip shows item icons');

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
    await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); const g = p.board.bigs.find((b) => b.on); g.x = p.x + 8; g.z = p.z - 4; });
    await page.waitForTimeout(1500);
    await step('3-elite');
    await shot('3-elite');

    // ---- The elite falls, drops a chest; walk onto it: treasure card; skip it to send an elite to a bot
    await state(() => {
      const p = window.__toybox.match.state().players.find((q) => q.id === 'you');
      const g = p.board.bigs.find((b) => b.on); g.hp = 1; g.x = p.x + 2.5; g.z = p.z; g.mode = 0;
      for (const m of p.board.mobs) m.on = false;
      if (!p.weapons.some((w) => w.id === 'popgun')) p.weapons.push({ id: 'popgun', level: 3, evolved: false, cd: 0, aux: 0 });
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
    await page.getByTestId('siege-treasure').waitFor();
    await page.waitForSelector('[data-testid^="siege-target-"]:not([data-testid="siege-target-leader"]):not([disabled])');
    const target = await page.$eval('[data-testid^="siege-target-"]:not([data-testid="siege-target-leader"]):not([disabled])', (el) => el.dataset.testid.replace('siege-target-', ''));
    assert.ok(bots.includes(target));
    await tap(page.getByTestId(`siege-target-${target}`));
    await page.waitForSelector(`[data-testid="siege-target-${target}"][aria-pressed="true"]`);
    await step('4-treasure');
    await shot('4-treasure');
    await tap(page.locator('[data-testid^="siege-option-"][data-kind="send"]'));
    await page.evaluate(() => window.__toybox.match.timeScale(10));
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

    // ---- The secret upgrades the owner asked for (20 Nov 2026): Prism Ray (a laser through the line),
    // Firebell Meteors (pools of flame) and the Boiler Heart (a ring of rivets), all at once on our board
    await state(() => {
      const p = window.__toybox.match.state().players.find((q) => q.id === 'you');
      for (const id of ['popgun', 'chime']) {
        const w = p.weapons.find((x) => x.id === id);
        if (w) Object.assign(w, { level: 5, evolved: true, cd: 0 }); else if (p.weapons.length < 4) p.weapons.push({ id, level: 5, evolved: true, cd: 0, aux: 0 });
        else Object.assign(p.weapons[p.weapons.length - 1], { id, level: 5, evolved: true, cd: 0, aux: 0 });
      }
      p.horn = { level: 3, readyAt: 1e12, evolved: true, cd: 0, aux: 0 };
    });
    await page.evaluate(() => window.__toybox.match.timeScale(1));
    await page.waitForFunction(new Function(`const b = ${me}.board; return b.blasts.some(k => k.on && k.kind === 4) && b.fires.some(f => f.on) && b.projs.some(q => q.on && q.kind === 2)`));
    await page.evaluate(() => window.__toybox.match.timeScale(0));
    await page.waitForTimeout(1500);
    const secrets = await state(() => window.__toybox.siege.counts());
    assert.ok(secrets.fires > 0, 'flame pools on the board');
    assert.ok((await page.locator('[data-testid="siege-items"] li[title="Boiler Heart"]').count()) === 1, 'the kit strip shows the Boiler Heart');
    assert.ok((await page.locator('[data-testid="siege-items"] li[title="Prism Ray"] svg.siege-icon').count()) === 1, 'the kit strip shows the Prism Ray');
    console.log(`  [${name}] secret upgrades on the board ${JSON.stringify(secrets)}`);
    await step('5b-secrets');
    await shot('5b-secrets');

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
      return { runT: Math.round(st.runT), boss: p.board.bigs.some((g) => g.on && g.type === 'baron'), card: p.choice?.kind ?? null, status: p.status }; });
    for (let i = 0; i < 600; i++) {
      const s = await bossState();
      if (s.boss || s.status !== 'alive') break;
      if (s.card) await tap(page.getByTestId('siege-option-0')).catch(() => {});
      await page.waitForTimeout(250);
    }
    await freezeClear();
    await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); const g = p.board.bigs.find((b) => b.on && b.type === 'baron'); if (g) { g.x = p.x + 7; g.z = p.z - 6; } });
    await page.getByTestId('siege-boss').waitFor();
    await page.waitForTimeout(1500);
    const boss = await state(() => ({ counts: window.__toybox.siege.counts(), render: window.__toybox.renderInfo() }));
    console.log(`  [${name}] boss fight entities ${JSON.stringify(boss.counts)} renderer ${JSON.stringify(boss.render)}`);
    await step('7-boss');
    await shot('7-boss');

    let finale;
    if (v.finale === 'arena') {
      // ---- Slay the boss: three chests, the magnet, a cleared board and the prep window
      await state(() => {
        const p = window.__toybox.match.state().players.find((q) => q.id === 'you');
        const g = p.board.bigs.find((b) => b.on && b.type === 'baron'); g.hp = 1; g.x = p.x + 2.5; g.z = p.z; g.mode = 0;
        for (const m of p.board.mobs) m.on = false;
        p.xpNext = 30; p.xp = 0; // so the magnet's gems bring a level-up card or two
        // Gems scattered over the board, for the magnet to pull in.
        p.board.gems.slice(0, 24).forEach((gem, i) => Object.assign(gem, { on: true, kind: 0, v: 4, x: p.x - 18 + (i % 6) * 7, z: p.z - 14 + Math.floor(i / 6) * 8, pull: false }));
        p.horn = { level: 2, readyAt: 0, evolved: false, cd: 0, aux: 0 }; // for the arena
      });
      await page.evaluate(() => window.__toybox.match.timeScale(2));
      await page.waitForFunction(new Function(`return ${me}.status === 'prep'`));
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      const prep = await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); return { chests: p.board.chests.filter((c) => c.on).length + p.pendingChests, mobs: p.board.mobs.filter((m) => m.on).length, pulled: p.board.gems.filter((g) => g.on).every((g) => g.pull), victoryAt: p.victoryAt }; });
      assert.equal(prep.chests, 3, 'the boss drops three chests');
      assert.equal(prep.mobs, 0, 'the board is cleared');
      assert.ok(prep.pulled && prep.victoryAt > 0);
      await page.evaluate(() => window.__toybox.match.timeScale(0.5));
      await page.waitForFunction(new Function(`return !!${me}.choice || ${me}.board.gems.filter(g => g.on).length < 12`));
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      await page.waitForTimeout(1200);
      await step('8-prep');
      await shot('8-prep');
      // Take every card (the boss's chests among them), then wait for the arena: the bots are pulled out at 5:00.
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      for (let i = 0; i < 80; i++) {
        const s = await state(() => { const st = window.__toybox.match.state(); const p = st.players.find((q) => q.id === 'you'); return { card: p.choice?.kind ?? null, gems: p.board.gems.some((g) => g.on), chests: p.board.chests.some((c) => c.on) || p.pendingChests > 0, ready: st.runT >= p.prepUntil }; });
        if (!s.card && !s.gems && !s.chests) break;
        if (s.card) await tap(page.getByTestId('siege-option-0')).catch(() => {});
        await page.waitForTimeout(250);
      }
      await page.getByTestId('siege-prep').waitFor();
      await skipTo(299000);
      await page.evaluate(() => window.__toybox.match.timeScale(10));
      await page.waitForFunction(() => window.__toybox.match.state().phase === 'arena', null, { timeout: 600000 });
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      const arena = await state(() => { const st = window.__toybox.match.state(); return { fighters: st.players.filter((p) => p.status === 'arena').length, arenaT: st.arenaT }; });
      assert.equal(arena.fighters, 4, 'every toy still in reaches the arena');
      assert.equal(await state(() => window.__toybox.siege.viewed()), 'you');
      await page.evaluate(() => window.__toybox.match.timeScale(0.5));
      await page.waitForFunction(() => window.__toybox.match.state().arenaT > 900);
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      await page.waitForTimeout(1200);
      const arenaRender = await state(() => ({ counts: window.__toybox.siege.counts(), render: window.__toybox.renderInfo() }));
      console.log(`  [${name}] arena entities ${JSON.stringify(arenaRender.counts)} renderer ${JSON.stringify(arenaRender.render)}`);
      await step('9-arena');
      await shot('9-arena');
      // ---- The Rally Horn summons the Baron for us
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      await page.waitForSelector('[data-testid="siege-skill"]:not([disabled])');
      if (v.touch) await tap(page.getByTestId('siege-skill')); else await page.keyboard.press('Space');
      await page.waitForFunction(() => window.__toybox.match.state().arena.bigs.some((g) => g.on && g.from === 'you'));
      await page.getByTestId('siege-ally').waitFor();
      await page.waitForFunction(() => window.__toybox.match.state().arenaT > 4500);
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      await page.waitForTimeout(1200);
      await step('10-ally');
      await shot('10-ally');
      // ---- Knocked out of the arena: the popup, then watch the fighters
      await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); p.hp = 0.001; for (const q of window.__toybox.match.state().players) if (q !== p && q.status === 'arena') { q.hp = q.stat.maxHp * 5; } });
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      await page.waitForFunction(new Function(`return ${me}.status === 'ghost'`));
      await page.getByTestId('siege-out-popup').waitFor();
      assert.equal(await state(() => window.__toybox.siege.viewed()), 'you', 'stays on its own spot until it chooses to watch');
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      await step('11-out');
      await shot('11-out');
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      if (v.touch) await tap(page.getByTestId('siege-watch-others')); else await page.keyboard.press('Space');
      await page.waitForFunction(() => window.__toybox.siege.viewed() !== 'you');
      const first = await state(() => window.__toybox.siege.viewed());
      await tap(page.getByTestId('siege-watch-next'));
      await page.waitForFunction((was) => window.__toybox.siege.viewed() !== was, first);
      await page.waitForTimeout(1200);
      await step('12-watching');
      await shot('12-watching');
      finale = 'boss slain → 3 chests + magnet → prep → arena (4 toys) → horn summons the Baron → knocked out → popup → watch fighters';
      // The bots fight it out (overtime ends it).
      await page.evaluate(() => { for (const q of window.__toybox.match.state().players) if (q.status === 'arena') q.hp = Math.min(q.hp, q.stat.maxHp); window.__toybox.match.timeScale(20); });
    } else {
      // ---- Second knockout in the run: no revive left, so out for good. The popup; the toy stays on its own board.
      await state(() => { const p = window.__toybox.match.state().players.find((q) => q.id === 'you'); p.invuln = 0; p.hp = 0.5; p.choice = null; p.pendingLevels = 0; p.pendingChests = 0; });
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      await page.getByTestId('siege-out-popup').waitFor();
      assert.equal(await state(new Function(`return ${me}.status`)), 'ghost');
      assert.equal(await state(() => window.__toybox.siege.viewed()), 'you', 'a ghost stays on its own board until it chooses to watch');
      await page.waitForTimeout(1500);
      assert.equal(await state(() => window.__toybox.siege.viewed()), 'you');
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      await step('11-out');
      await shot('11-out');
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      // "Stay here" first: the popup goes, a small "Watch other players" button stays.
      await tap(page.getByTestId('siege-out-dismiss'));
      await page.getByTestId('siege-watch-open').waitFor();
      assert.equal(await page.getByTestId('siege-out-popup').count(), 0);
      await tap(page.getByTestId('siege-watch-open'));
      await page.waitForFunction(() => window.__toybox.siege.viewed() !== 'you');
      await page.getByTestId('siege-spectate').waitFor();
      const first = await state(() => window.__toybox.siege.viewed());
      await tap(page.getByTestId('siege-watch-next'));
      await page.waitForFunction((was) => window.__toybox.siege.viewed() !== was, first);
      // The joystick from another spot in the bottom half (clear of the HUD buttons) drifts the ghost.
      await stickUntil(page, [0, -1], new Function(`return ${me}.gz < -2`), undefined, [0.3, 0.88]); // clear of the spectate panel's buttons
      await page.waitForTimeout(1200);
      await step('12-watching');
      await shot('12-watching');
      // The bots are pulled into the arena at 5:00; the ghost watches it.
      await skipTo(299000);
      await page.evaluate(() => window.__toybox.match.timeScale(10));
      await page.waitForFunction(() => window.__toybox.match.state().phase === 'arena', null, { timeout: 600000 });
      await page.evaluate(() => window.__toybox.match.timeScale(0.5));
      await page.waitForFunction(() => window.__toybox.match.state().arenaT > 900);
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      const viewed = await state(() => { const st = window.__toybox.match.state(); return st.players.find((p) => p.id === window.__toybox.siege.viewed()).status; });
      assert.equal(viewed, 'arena', 'a ghost from the run watches a fighter in the arena');
      await page.waitForTimeout(1200);
      await step('9-arena');
      await shot('9-arena');
      finale = 'out in the run → popup → stay → watch → cycle + drift → the bots\' arena, watched';
      await page.evaluate(() => window.__toybox.match.timeScale(20));
    }

    // ---- Results and back to the hub
    await page.waitForSelector('.results', { timeout: 600000 });
    const placed = await page.$$eval('.results-list li', (els) => els.length);
    assert.equal(placed, 4);
    const record = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['toybox-siege']);
    assert.equal(record.plays, 1);
    await step('13-results');
    await shot('13-results');
    await page.waitForTimeout(900);
    await tap(page.getByTestId('results-leave'));
    await page.waitForSelector('.hud-sign', { timeout: 600000 });
    assert.deepEqual(errors, []);
    if (missed.length) console.log(`  [${name}] screenshots missed under load: ${missed.join(', ')}`);
    console.log(`PASS Toybox Siege ${name}: no countdown, class pick, ${v.touch ? 'bottom-half joystick' : 'keys'}, level-up card with icons + secret-upgrade badge, elite, treasure → elite sent to ${target}, downed → revive, boss, ${finale}, results, hub; no page errors`);
    await context.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  const only = process.env.ONLY;
  for (const name of Object.keys(VIEWS)) if (!only || only === name) await run(name);
})().catch((e) => { console.error(e); process.exitCode = 1; });
