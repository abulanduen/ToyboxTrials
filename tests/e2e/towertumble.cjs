/* Toy Tower Tumble, desktop + phone portrait + phone landscape (real touch events on phones).
 *
 * Enter from the Tournament Pavilion's practice list, build (on a chosen square and automatically),
 * merge different towers of the same tier (mouse drag, tap, touch drag and the sheet button),
 * press M without a selection to auto-merge, level the builder and open the odds (prices in the
 * bar's coin style), complete a quest (quest pictures), view another player's board from the rail
 * and come back, pan and zoom the board (wheel on desktop, pinch on phones) and reset the view,
 * fast-forward waves (round rewards the moment your board clears, the rail highlighting who is
 * still going, status badges over enemies), beat the wave-5 boss for its free tier-4 tower, get
 * knocked out (stay on your own board, the popup offers to watch), spectate, then the damage check
 * after the final wave (sign over the target, rail leaderboard), the results and back to the hub.
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
      await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, quality: 'low', tutorials: false }, version: 0 })));
      const log = (msg) => console.log(`[${layout}] ${msg}`);
      const shot = (name) => page.screenshot({ path: path.join(OUT, `towertumble-${layout}-${name}.png`), timeout: 240000 });
      const state = (fn, arg) => page.evaluate(fn, arg);
      const me = (expr) => page.evaluate(`(() => { const s = window.__toybox.match.state(); const p = s.players.find(x => x.id === 'you'); return ${expr}; })()`);
      const until = (expr, timeout = 240000) => page.waitForFunction(`(() => { const s = window.__toybox.match.state(); const p = s && s.players.find(x => x.id === 'you'); return ${expr}; })()`, null, { timeout });
      const click = async (id) => { const b = page.getByTestId(id); if (mobile) await b.tap(); else await b.click(); };
      const size56 = async (id) => { const r = await page.getByTestId(id).boundingBox(); assert.ok(r && r.width >= 56 && r.height >= 56, `${id} is at least 56 px: ${JSON.stringify(r)}`); };
      const square = (cell, y = 0.4) => page.evaluate(([c, h]) => window.__toybox.tumble.point(c % 8, Math.floor(c / 8), h), [cell, y]);
      // Towers are tapped on their bodies (as a player would); empty squares on the felt.
      const tapSquare = async (cell, y) => { const tower = await me(`p.towers.some(t => t.cell === ${cell})`); const p = await square(cell, y ?? (tower ? 1.3 : 0.3)); if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); };
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
      await click('practice-group-strategy'); // the practice list opens by section
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
      // 70 start − 3 × 20, plus any quest a lucky roll just completed (e.g. three of the ordered tier 1).
      const questGold = await page.evaluate(() => { const p = window.__toybox.match.state().players[0]; return { collect5: 40, order1: 25 }[Object.keys(p.quests).find((q) => p.quests[q])] || 0; });
      assert.equal(await me('p.builds'), 3);
      assert.equal(await me('p.gold'), 70 - 60 + questGold);
      log('built three towers');
      // A fresh build selects its tower; start the merge from no selection.
      if (await page.getByTestId('td-sheet-close').count()) { await click('td-sheet-close'); await page.getByTestId('td-sheet').waitFor({ state: 'detached' }); }

      // ── merge different tower types of the same tier ──
      const [a, b] = await me('p.towers.slice(0, 2).map(t => t.cell)');
      await state(() => { const p = window.__toybox.match.state().players[0]; p.towers[0].def = 'tin-sentry'; p.towers[1].def = 'spark-bot'; });
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
      await frames(page, 2);
      await shot('merge');
      // Landscape also merges with the sheet's button.
      if (layout === 'landscape') {
        await state(() => { const p = window.__toybox.match.state().players[0]; p.towers.forEach((t,i) => { t.def = i ? 'felt-cub' : 'tin-sentry'; }); });
        const cells = await me('p.towers.map(t => t.cell)');
        // The merged tower is still selected; clear it so the tap selects rather than toggles.
        if (await page.getByTestId('td-sheet-close').count()) { await click('td-sheet-close'); await page.getByTestId('td-sheet').waitFor({ state: 'detached' }); }
        await tapSquare(cells[0]);
        await page.getByTestId(`td-merge-${cells[1]}`).waitFor();
        await size56(`td-merge-${cells[1]}`);
        await click(`td-merge-${cells[1]}`);
        await until('p.merges === 2 && p.towers.length === 1');
        await click('td-sheet-close');
      }
      if (layout === 'desktop') {
        await state(() => { const p = window.__toybox.match.state().players[0]; p.towers.forEach((t,i) => { t.def = i ? 'spark-bot' : 'tin-sentry'; }); });
        if (await page.getByTestId('td-sheet-close').count()) { await click('td-sheet-close'); await page.getByTestId('td-sheet').waitFor({state:'detached'}); }
        await page.keyboard.press('KeyM');
        await until('p.merges === 2 && p.towers.length === 1');
        await shot('keyboard-merge');
        if (await page.getByTestId('td-sheet-close').count()) await click('td-sheet-close');
      }
      log(layout === 'desktop' ? 'merged same-tier towers; M works without selection' : 'merged same-tier towers with touch');

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
      // Every "own 3 × …" quest shows a picture of that very tower.
      for (const q of ['order1', 'order2', 'order3']) await page.waitForFunction((id) => { const i = document.querySelector(`[data-testid="td-quest-art-${id}"] img`); return !!i && i.complete && i.naturalWidth > 0; }, q);
      assert.equal(await page.getAttribute('[data-testid="td-quest-art-order1"]', 'data-model'), await page.evaluate(() => window.__toybox.match.state().orders.t1).then((id) => ({ 'tin-sentry': 'soldier', 'paper-popper': 'paper-medic', 'spark-bot': 'robot', 'band-slinger': 'marble-slinger', 'felt-cub': 'felt-fox' })[id]));
      await shot('quests');
      if (layout === 'portrait') await click('td-quests-close');
      log('quest done, quest pictures shown');

      // ── the player rail: view a bot's board (read-only), then come back ──
      const bot = await state(() => window.__toybox.match.state().players[1].id);
      await size56(`rail-${bot}`);
      if (layout === 'desktop') { await page.getByTestId(`rail-${bot}`).focus(); await page.keyboard.press('Enter'); } else await click(`rail-${bot}`);
      await page.waitForFunction((b) => window.__toybox.tumble.watching() === b, bot);
      await page.getByTestId('watch-banner').waitFor();
      assert.equal(await page.getByTestId(`rail-${bot}`).getAttribute('aria-pressed'), 'true');
      await size56('watch-back');
      await frames(page, 2); await shot('rail-view');
      // Read-only: tapping a square there selects nothing.
      await tapSquare(20, 0.3); await frames(page, 2);
      assert.equal(await page.getByTestId('td-sheet').count(), 0);
      if (layout === 'desktop') await page.keyboard.press('Escape'); else await click('watch-back');
      await page.waitForFunction(() => window.__toybox.tumble.watching() === 'you');
      assert.equal(await page.getByTestId('td-next').isDisabled(), false, 'Escape went back without pausing');
      log(`viewed ${bot}'s board from the rail and came back`);

      // ── pan and zoom: wheel or pinch zooms toward the pointer, a drag on the felt pans, Reset view ──
      if (await page.getByTestId('td-sheet-close').count()) { await click('td-sheet-close'); await page.getByTestId('td-sheet').waitFor({ state: 'detached' }); }
      await frames(page, 2);
      const centre = await square(27, 0.3);
      log(`before zoom: ${JSON.stringify(await page.evaluate(() => window.__toybox.tumbleView.get()))}, under the centre: ${await page.evaluate((c) => { const e = document.elementFromPoint(c.x, c.y); return e ? e.tagName + '.' + e.className : 'none'; }, centre)}`);
      if (layout === 'desktop') {
        await page.mouse.move(centre.x, centre.y); await page.mouse.wheel(0, -400);
        await page.waitForFunction(() => window.__toybox.tumbleView.get().zoom > 1.2);
      } else {
        const cdp = await context.newCDPSession(page), a = { x: centre.x - 30, y: centre.y }, b = { x: centre.x + 30, y: centre.y };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }, { ...b, id: 2 }] });
        for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x - i * 14, y: a.y, id: 1 }, { x: b.x + i * 14, y: b.y, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
        await page.waitForFunction(() => window.__toybox.tumbleView.get().zoom > 1.5, null, { timeout: 60000 })
          .catch(async (e) => { log(`pinch failed: ${JSON.stringify(await page.evaluate(() => window.__toybox.tumbleView.get()))}`); await shot('pinch-failed'); throw e; });
      }
      const zoomed = await page.evaluate(() => window.__toybox.tumbleView.get());
      // A drag that does not start on one of your towers pans, and does not select anything.
      // Start near the zoom centre where no tower stands (a press on one of your towers drags it instead).
      let felt = null;
      for (const cell of [27, 28, 26, 29, 35, 34, 36]) { // path squares on row 4 first, then felt
        const p = await square(cell, 0.3), hit = await page.evaluate((q) => window.__toybox.tumble.pick(q.x, q.y), p);
        if (!hit.tower) { felt = p; break; }
      }
      assert.ok(felt, 'a free spot to start the pan');
      await page.evaluate(() => { const c = document.querySelector('canvas'); window.__panEv = []; for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) c.addEventListener(t, (e) => window.__panEv.push(t + ':' + e.pointerId)); });
      log(`pan from ${JSON.stringify(felt)} over ${await page.evaluate((c) => { const e = document.elementFromPoint(c.x, c.y); return e ? e.tagName + '.' + e.className : 'none'; }, felt)}; view ${JSON.stringify(zoomed)}`);
      if (mobile) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...felt, id: 1 }] });
        for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: felt.x + i * 12, y: felt.y - i * 8, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
      } else { await page.mouse.move(felt.x, felt.y); await page.mouse.down(); await page.mouse.move(felt.x + 60, felt.y - 40, { steps: 5 }); await page.mouse.up(); }
      await page.waitForFunction((z) => { const v = window.__toybox.tumbleView.get(); return Math.abs(v.panX - z.panX) + Math.abs(v.panZ - z.panZ) > 0.5; }, zoomed, { timeout: 60000 })
        .catch(async (e) => { log(`pan failed: ${JSON.stringify(await page.evaluate(() => ({ v: window.__toybox.tumbleView.get(), ev: window.__panEv, sel: document.querySelector('[data-testid="td-sheet"]') ? 'sheet' : '', towers: window.__toybox.match.state().players[0].towers.map((t) => t.cell) })))}`); await shot('pan-failed'); throw e; });
      assert.equal(await page.getByTestId('td-sheet').count(), 0, 'a pan is not a tap');
      // Taps still select while zoomed in.
      await tapSquare(17); await page.getByTestId('td-sheet').waitFor();
      await frames(page, 2); await shot('zoomed');
      await click('td-sheet-close');
      await size56('td-view-reset');
      await click('td-view-reset');
      await page.waitForFunction(() => { const v = window.__toybox.tumbleView.get(); return v.zoom === 1 && v.panX === 0 && v.panZ === 0; });
      await page.getByTestId('td-view-reset').waitFor({ state: 'detached' });
      log(`zoomed to ${zoomed.zoom.toFixed(2)}, panned, reset`);

      // ── fast-forward waves; look at the board mid-wave ──
      // The five quest towers go again; a slowing Band Slinger and a burning Crayon Mortar (weak enough that walkers
      // live to wear their badges). One bot board has no towers and lots of lives, so it is still going after yours clears.
      await state(() => {
        const s = window.__toybox.match.state(), p = s.players[0];
        p.gold = 0; p.towers = p.towers.filter(t => t.id < 90000);
        p.towers.push({ id: 92000, def: 'band-slinger', cell: 2, cd: 0, shots: 0, dealt: 0, bornAt: s.t, how: 'build', auraDamage: 0, auraSpeed: 0 },
          { id: 92001, def: 'crayon-mortar', cell: 18, cd: 0, shots: 0, dealt: 0, bornAt: s.t, how: 'build', auraDamage: 0, auraSpeed: 0 });
        p.auraDirty = true;
        const slow = s.players[1]; slow.towers = []; slow.lives = 99; slow.auraDirty = true;
      });
      // Conditions are polled every frame and the host advances at most 100 ms of match time per frame,
      // so nothing is missed at 1–3 fps. Freeze time for the photo.
      await click('td-next');
      await until("s.phase === 'wave'");
      // Freeze in the same frame the first badge is drawn (walkers on wave 1 do not live long).
      await page.waitForFunction(() => { if (window.__toybox.tumbleStatus.shown() === 0) return false; window.__tdBadges = window.__toybox.tumbleStatus.byKind(); window.__toybox.match.timeScale(0); return true; });
      const badges = await page.evaluate(() => window.__tdBadges);
      assert.ok(badges.slow || badges.burn, `status badges over enemies: ${JSON.stringify(badges)}`);
      await frames(page, 2);
      await sample(); await shot('wave');
      await page.evaluate(() => window.__toybox.match.timeScale(4));
      // Your board clears first: paid at once, while the tower-less bot is still going (and highlighted on the rail).
      const goldBefore = await me('p.gold');
      await until("p.waveDone", 600000);
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      assert.equal(await me("s.phase"), 'wave');
      assert.ok(await me('p.gold') >= goldBefore + 9, 'the clear bonus arrived the moment the board cleared');
      await page.waitForSelector(`[data-testid="rail-${bot}"][data-busy]`);
      assert.equal(await page.getByTestId('rail-you').getAttribute('data-busy'), null);
      assert.match(await page.getByTestId('td-phase').textContent(), /Cleared/);
      await frames(page, 2); await shot('still-going');
      await page.evaluate(() => window.__toybox.match.timeScale(8));
      await until("s.wave >= 2 && s.phase === 'build'", 600000);
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      assert.ok(await me('p.cleared') >= 1);
      log(`cleared wave 1 first, paid at once (lives ${await me('p.lives')}); badges ${JSON.stringify(badges)}`);

      // ── the wave-5 boss: give the board two tier-5 marshals and skip ahead ──
      await state(() => {
        const s = window.__toybox.match.state(), p = s.players[0];
        s.wave = 5; p.lives = 20;
        p.towers = p.towers.filter(t => t.cell !== 2 && t.cell !== 18);
        p.towers.push({ id: 91000, def: 'quill-marshal', cell: 2, cd: 0, shots: 0, dealt: 0, bornAt: s.t, how: 'build', auraDamage: 0, auraSpeed: 0 },
          { id: 91001, def: 'quill-marshal', cell: 18, cd: 0, shots: 0, dealt: 0, bornAt: s.t, how: 'build', auraDamage: 0, auraSpeed: 0 });
        p.auraDirty = true; s.phaseEnds = s.t + 200;
      });
      await until("s.phase === 'wave' && p.enemies.some(e => e.boss) && s.waveT > 600");
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      await page.waitForSelector('.td-boss-tag');
      await frames(page, 2);
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

      // ── get knocked out: you stay on your own board; the popup offers to watch ──
      await state(() => { const p = window.__toybox.match.state().players[0]; p.towers.length = 0; p.lives = 1; p.auraDirty = true; });
      await page.evaluate(() => window.__toybox.match.timeScale(6));
      await until('p.out', 600000);
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      await page.getByTestId('spectate-offer').waitFor();
      assert.equal(await page.evaluate(() => window.__toybox.tumble.watching()), 'you', 'not moved off your own board automatically');
      await size56('spectate-watch'); await size56('spectate-dismiss');
      await frames(page, 2); await shot('knocked-out');
      await click('spectate-watch');
      await page.getByTestId('spectate-offer').waitFor({ state: 'detached' });
      const first = await page.evaluate(() => window.__toybox.tumble.watching());
      assert.notEqual(first, 'you');
      await page.getByTestId('td-spectate').waitFor();
      await size56('td-watch-next');
      await click('td-watch-next');
      await page.waitForFunction((f) => window.__toybox.tumble.watching() !== f, first);
      const second = await page.evaluate(() => window.__toybox.tumble.watching());
      assert.match(await page.getByTestId('watch-banner').textContent(), /Watching/);
      await click('td-speed-2');
      await until('s.speed === 2');
      await sample(); await shot('spectate');
      log(`knocked out; popup; watching ${first} then ${second}`);

      // ── the final wave, then the damage check (bots still in; you watch one) ──
      await state(() => {
        const s = window.__toybox.match.state();
        s.config.waves = s.wave; s.config.waveCapMs = 4000; // this wave is now the last; end it quickly
        for (const p of s.players) if (!p.out) p.towers.push({ id: 93000 + s.players.indexOf(p), def: 'last-monarch', cell: 2, cd: 0, shots: 0, dealt: 0, bornAt: s.t, how: 'build', auraDamage: 0, auraSpeed: 0 }, { id: 93100 + s.players.indexOf(p), def: 'patchwork-wyrm', cell: 18, cd: 0, shots: 0, dealt: 0, bornAt: s.t, how: 'build', auraDamage: 0, auraSpeed: 0 });
        for (const p of s.players) { p.auraDirty = true; p.lives = Math.max(p.lives, 60); }
        if (s.phase === 'build') s.phaseEnds = s.t + 100;
      });
      await page.evaluate(() => window.__toybox.match.timeScale(4));
      await until("s.wave > s.config.waves && s.phase === 'wave' && s.waveT > 2500", 600000);
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      const watched = await page.evaluate(() => window.__toybox.tumble.watching());
      await page.getByTestId('td-check-damage').waitFor();
      await page.waitForFunction(() => window.__toybox.tumbleCheck.shown());
      const shownDamage = Number((await page.getByTestId('td-check-damage').locator('b').textContent()).replace(/,/g, ''));
      assert.ok(shownDamage > 0, 'the damage check counts damage');
      assert.match(await page.getByTestId('player-rail').textContent(), /damage/);
      assert.equal(await page.getByTestId(`rail-${watched}`).getAttribute('aria-pressed'), 'true');
      await frames(page, 2); await sample(); await shot('damage-check');
      log(`damage check: ${shownDamage} on ${watched}'s board`);

      // ── results, then back to the hub ──
      await page.evaluate(() => window.__toybox.match.timeScale(8));
      await page.waitForFunction(() => window.__toybox.match.phase() === 'results', null, { timeout: 600000 });
      await page.evaluate(() => window.__toybox.match.timeScale(1));
      await page.getByTestId('results-leave').waitFor();
      await page.waitForTimeout(900); // the card's fade-in and tap guard
      await shot('results');
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
