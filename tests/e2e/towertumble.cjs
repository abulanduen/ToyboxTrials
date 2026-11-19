/* Toy Tower Tumble, desktop + phone portrait + phone landscape (real touch events on phones).
 *
 * Enter from the Tournament Pavilion's practice list, build (on a chosen square and automatically),
 * merge two identical towers (desktop: mouse drag onto the twin; portrait: tap, then tap the
 * glowing twin; landscape: touch drag, then the sheet's Merge button), level the builder and open the
 * odds, complete a quest, fast-forward waves, beat the wave-5 boss for its free tier-4 tower, get
 * knocked out, spectate another board (and fast-forward it), reach the results and return to the hub.
 * Test hooks (`?debug`) set up boards and time; they are never gameplay.
 *
 *   BASE_URL=http://localhost:4203/ node tests/e2e/towertumble.cjs [desktop,portrait,landscape]
 *
 * SwiftShader renders at 1–3 fps here: every wait is on a condition. One browser context at a time.
 * Output: tests/e2e/output/towertumble-<layout>-*.png and towertumble-renderinfo.json.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const LAYOUTS = (process.argv[2] || process.env.ONLY || 'desktop,portrait,landscape').split(',');
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } };
const info = {};
async function frames(page, n) {
  await page.evaluate((k) => new Promise((res) => { let i = 0; const tick = () => (++i >= k ? res() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const layout of LAYOUTS) {
      const mobile = layout !== 'desktop';
      const context = await browser.newContext({ viewport: VIEWPORTS[layout], hasTouch: mobile, isMobile: mobile });
      const page = await context.newPage();
      page.setDefaultTimeout(240000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low', tutorials: false }, version: 0 })));
      const log = (msg) => console.log(`[${layout}] ${msg}`);
      const shot = (name) => page.screenshot({ path: path.join(OUT, `towertumble-${layout}-${name}.png`), timeout: 240000 });
      const state = (fn, arg) => page.evaluate(fn, arg);
      const me = (expr) => page.evaluate(`(() => { const s = window.__toybox.match.state(); const p = s.players.find(x => x.id === 'you'); return ${expr}; })()`);
      const until = (expr, timeout = 240000) => page.waitForFunction(`(() => { const s = window.__toybox.match.state(); const p = s && s.players.find(x => x.id === 'you'); return ${expr}; })()`, null, { timeout });
      const click = async (id) => { const b = page.getByTestId(id); if (mobile) await b.tap(); else await b.click(); };
      const size56 = async (id) => { const r = await page.getByTestId(id).boundingBox(); assert.ok(r && r.width >= 56 && r.height >= 56, `${id} is at least 56 px: ${JSON.stringify(r)}`); };
      const square = (cell, y = 0.4) => page.evaluate(([c, h]) => window.__toybox.tumble.point(c % 8, Math.floor(c / 8), h), [cell, y]);
      const tapSquare = async (cell) => { const p = await square(cell, 0.3); if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); };
      const peak = { calls: 0, triangles: 0, geometries: 0, meshes: 0, fx: 0 };
      const sample = async () => {
        const r = await page.evaluate(() => ({ ...window.__toybox.renderInfo(), fx: window.__toybox.tumbleFx ? window.__toybox.tumbleFx.peak() : 0 }));
        for (const k of Object.keys(peak)) peak[k] = Math.max(peak[k], r[k] || 0);
      };

      // ── enter from the Pavilion's practice list ──
      await page.goto(`${BASE}?debug#play`);
      await page.waitForSelector('.loading', { state: 'detached' });
      await page.evaluate(() => window.__toybox.hub.goTo('pavilion'));
      await page.waitForSelector('.prompt');
      if (mobile) await page.locator('.prompt').tap(); else await page.keyboard.press('KeyE');
      await click('practice-toy-tower-tumble');
      await page.getByTestId('match-start').waitFor({ state: 'visible' });
      await page.waitForTimeout(900); // the intro buttons' tap guard
      const three = page.locator('.intro-options .segmented button', { hasText: '3 bots' });
      if (mobile) await three.tap(); else await three.click();
      await click('match-start');
      await page.waitForFunction(() => window.__toybox.match.phase() === 'countdown');
      await page.evaluate(() => window.__toybox.match.timeScale(10));
      await page.waitForFunction(() => window.__toybox.match.phase() === 'playing', null, { timeout: 600000 });
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      assert.equal(await me('s.players.length'), 4);
      assert.equal(await me('s.config.waves'), 20);
      // Hold the first build phase open while the interactions run (software GL is slow).
      await state(() => { window.__toybox.match.state().phaseEnds += 3600000; });
      await page.getByTestId('td-hud').waitFor();
      // The camera frames the board into the HUD's board slot; squares are only clickable once it has.
      await page.waitForFunction(() => window.__toybox.tumble && window.__toybox.tumble.fitted());
      await frames(page, 2);
      for (const id of ['td-build', 'td-builder', 'td-odds-open', 'td-next']) await size56(id);
      log('in the match');

      // ── build: on a chosen square, then automatically ──
      const chosen = 17; // B3, beside the first bend
      await tapSquare(chosen);
      await page.getByTestId('td-build-here').waitFor();
      await size56('td-build-here'); await size56('td-sheet-close');
      await click('td-build-here');
      await until(`p.towers.some(t => t.cell === ${chosen})`);
      assert.equal(await me('p.towers[0].cell'), chosen);
      await page.getByTestId('td-sheet-name').waitFor(); // the new tower's sheet
      await click('td-sheet-close');
      await click('td-build'); await until('p.towers.length === 2');
      await click('td-build'); await until('p.towers.length === 3');
      assert.equal(await me('p.gold'), 70 - 60);
      log('built three towers');

      // ── merge two identical towers (forced identical with the debug hook) ──
      const [a, b] = await me('p.towers.slice(0, 2).map(t => t.cell)');
      await state(() => { const p = window.__toybox.match.state().players[0]; p.towers[0].def = 'tin-sentry'; p.towers[1].def = 'tin-sentry'; });
      if (layout === 'desktop') {
        const from = await square(a, 1.4), to = await square(b, 0.3);
        await page.mouse.move(from.x, from.y); await page.mouse.down();
        await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
        await page.mouse.move(to.x, to.y, { steps: 4 });
        await page.waitForFunction(() => document.querySelector('canvas').style.cursor === 'grabbing');
        await shot('drag');
        await page.mouse.up();
      } else if (layout === 'portrait') {
        await tapSquare(a);
        await page.getByTestId(`td-merge-${b}`).waitFor(); // twin found: the sheet offers it, the board highlights it
        await tapSquare(b);
      } else {
        const from = await square(a, 1.4), to = await square(b, 0.3), cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
        for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / 6, y: from.y + (to.y - from.y) * i / 6, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
      }
      await until(`p.merges === 1 && p.towers.length === 2 && p.towers.some(t => t.cell === ${b} && t.how !== 'build')`);
      assert.equal(await me(`p.towers.some(t => t.cell === ${a})`), false);
      await page.waitForSelector('.td-toast');
      await shot('merge');
      // Landscape also merges with the sheet's button.
      if (layout === 'landscape') {
        await state(() => { const p = window.__toybox.match.state().players[0]; p.towers.forEach(t => { t.def = 'felt-cub'; }); });
        const cells = await me('p.towers.map(t => t.cell)');
        await tapSquare(cells[0]);
        await page.getByTestId(`td-merge-${cells[1]}`).waitFor();
        await size56(`td-merge-${cells[1]}`);
        await click(`td-merge-${cells[1]}`);
        await until('p.merges === 2 && p.towers.length === 1');
        await click('td-sheet-close');
      }
      log('merged');

      // ── level the builder and read the odds ──
      await state(() => { window.__toybox.match.state().players[0].gold = 300; });
      await click('td-builder');
      await until('p.builder === 2');
      assert.equal(await me('p.gold'), 250);
      await click('td-odds-open');
      await page.getByTestId('td-odds').waitFor();
      assert.equal(await page.locator('[data-testid="td-odds"] tr.is-current').getAttribute('data-testid'), 'td-odds-2');
      assert.match(await page.getByTestId('td-odds').textContent(), /Tier 1.*Tier 2.*Tier 3.*Lucky/s);
      await size56('td-odds-close');
      await shot('odds');
      await click('td-odds-close');
      await page.getByTestId('td-odds').waitFor({ state: 'detached' });
      log('builder level 2');

      // ── complete a quest: all five tier-1 towers at once ──
      await state(() => {
        const s = window.__toybox.match.state(), p = s.players[0];
        ['tin-sentry', 'paper-popper', 'spark-bot', 'band-slinger', 'felt-cub'].forEach((def, i) => p.towers.push({ id: 90000 + i, def, cell: [48, 56, 57, 58, 59][i], cd: 0, shots: 0, dealt: 0, bornAt: s.t, how: 'build', auraDamage: 0, auraSpeed: 0 }));
        p.auraDirty = true; p.boardDirty = true;
      });
      await until('p.quests.collect5');
      if (layout === 'portrait') { await click('td-quests-open'); await size56('td-quests-close'); }
      await page.waitForSelector('[data-testid="td-quest-collect5"][data-done]');
      await shot('quests');
      if (layout === 'portrait') await click('td-quests-close');
      log('quest done');

      // ── fast-forward waves; look at the board mid-wave ──
      // The five quest towers go again so wave 1 has enemies alive long enough to photograph.
      await state(() => { const p = window.__toybox.match.state().players[0]; p.gold = 0; p.towers = p.towers.filter(t => t.id < 90000); p.auraDirty = true; });
      await click('td-next');
      await until("s.phase === 'wave'");
      await until('p.enemies.length >= 3');
      await sample(); await shot('wave');
      await page.evaluate(() => window.__toybox.match.timeScale(8));
      await until("s.wave >= 2 && s.phase === 'build'", 600000);
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      assert.ok(await me('p.cleared') >= 1);
      log(`cleared wave 1 (lives ${await me('p.lives')})`);

      // ── the wave-5 boss: give the board two tier-5 marshals and skip ahead ──
      await state(() => {
        const s = window.__toybox.match.state(), p = s.players[0];
        s.wave = 5; p.lives = 20;
        p.towers = p.towers.filter(t => t.cell !== 2 && t.cell !== 18);
        p.towers.push({ id: 91000, def: 'quill-marshal', cell: 2, cd: 0, shots: 0, dealt: 0, bornAt: s.t, how: 'build', auraDamage: 0, auraSpeed: 0 },
          { id: 91001, def: 'quill-marshal', cell: 18, cd: 0, shots: 0, dealt: 0, bornAt: s.t, how: 'build', auraDamage: 0, auraSpeed: 0 });
        p.auraDirty = true; s.phaseEnds = s.t + 200;
      });
      await until("s.phase === 'wave' && p.enemies.some(e => e.boss)");
      await page.waitForSelector('.td-boss-tag');
      await sample(); await shot('boss');
      await page.evaluate(() => window.__toybox.match.timeScale(4));
      await until("p.towers.some(t => t.how === 'gift')", 600000);
      const gift = await me("p.towers.find(t => t.how === 'gift').def");
      log(`boss reward: ${gift}`);
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      // Select the free tower: its sheet says tier 4.
      await tapSquare(await me("p.towers.find(t => t.how === 'gift').cell"));
      await page.waitForFunction(() => /Tier 4/.test(document.querySelector('[data-testid="td-sheet-tier"]')?.textContent || ''));
      await shot('boss-reward');
      await click('td-sheet-close');
      await sample();

      // ── get knocked out, then spectate ──
      await state(() => { const p = window.__toybox.match.state().players[0]; p.towers.length = 0; p.lives = 1; p.auraDirty = true; });
      await page.evaluate(() => window.__toybox.match.timeScale(6));
      await until('p.out', 600000);
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      await page.getByTestId('td-spectate').waitFor();
      const first = await page.evaluate(() => window.__toybox.tumble.watching());
      assert.notEqual(first, 'you');
      await size56('td-watch-next');
      await click('td-watch-next');
      await page.waitForFunction((f) => window.__toybox.tumble.watching() !== f, first);
      const second = await page.evaluate(() => window.__toybox.tumble.watching());
      assert.match(await page.getByTestId('td-watching').textContent(), /Watching/);
      await click('td-speed-2');
      await until('s.speed === 2');
      await sample(); await shot('spectate');
      log(`knocked out; watching ${first} then ${second}`);

      // ── results, then back to the hub ──
      await state(() => { for (const p of window.__toybox.match.state().players) { if (!p.out) { p.towers.length = 0; p.lives = 1; } } });
      await page.evaluate(() => window.__toybox.match.timeScale(8));
      await page.waitForFunction(() => window.__toybox.match.phase() === 'results', null, { timeout: 600000 });
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      await page.getByTestId('results-leave').waitFor();
      await shot('results');
      await page.waitForTimeout(900);
      await click('results-leave');
      await page.waitForFunction(() => window.__toybox.match.phase() === 'idle');
      await page.waitForSelector('[data-testid="td-hud"]', { state: 'detached' });
      log('back in the hub');

      info[layout] = { peak };
      assert.deepEqual(errors, [], `no page errors: ${errors.join('\n')}`);
      log(`PASS · peak renderer ${JSON.stringify(peak)}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'towertumble-renderinfo.json'), JSON.stringify(info, null, 2));
  console.log('towertumble: all layouts passed');
})().catch((e) => { console.error(e); process.exit(1); });
