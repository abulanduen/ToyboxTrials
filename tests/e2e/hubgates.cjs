/* Hub gates: every playable trial has a gate on the gates table whose prompt opens that trial's
 * lobby (intro card), desktop + phone (touch Interact); walking across the domino bridge from the
 * spawn table to the gates table (keyboard, and the phone joystick) and on to the Copycat gate;
 * the TV beside the Scoreboard (offline card, channel change);
 * plus screenshots of each gate's surroundings, the Scoreboard, opposing gameplay views, the bridge
 * and a whole-hub overview of both tables, with renderer counts.
 *
 *   BASE_URL=http://localhost:4173/ node tests/e2e/hubgates.cjs [only]
 *     only  comma list of parts: gates,phone,bridge,bridgephone,tv,shots,overview (default all)
 *
 * SwiftShader renders at 1–3 fps here: every wait is on a condition, frame counts, never on FPS.
 * Output: tests/e2e/output/hubgates-*.png and hubgates-renderinfo.json.
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const ONLY = process.argv[2] ? process.argv[2].split(',') : null;
const want = (n) => !ONLY || ONLY.includes(n);
const QUALITY = process.env.QUALITY || 'low';
const results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); console.log(results[results.length - 1]); };
const info = {};

async function frames(page, n) {
  await page.evaluate((k) => new Promise((res) => { let i = 0; const t0 = performance.now(); const tick = () => (++i >= k || performance.now() - t0 > 60000 ? res() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);
}
async function open(browser, opts, quality = QUALITY) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000); // shared machine, software GL: be patient
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((q) => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: q, tutorials: false }, version: 0 })), quality);
  await page.goto(`${BASE}?debug#play`);
  await page.waitForFunction(() => window.__toybox && window.__toybox.hub && window.__toybox.renderInfo && window.__toybox.teleport, null, { timeout: 180000 });
  await page.waitForSelector('.loading', { state: 'detached', timeout: 180000 }).catch(() => {});
  await page.waitForSelector('.hud-sign', { timeout: 180000 });
  await frames(page, 6);
  return { ctx, page, errors };
}
const leave = async (page) => {
  await page.waitForTimeout(800); // intro buttons arm after 0.7 s
  await page.click('[data-testid=match-leave]');
  await page.waitForSelector('.match-intro', { state: 'detached', timeout: 120000 });
  await page.waitForFunction(() => window.__toybox.match.phase() === 'idle' || !document.querySelector('.match-intro'), null, { timeout: 120000 }).catch(() => {});
  await frames(page, 4);
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const desktop = { viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 };

  if (want('gates')) {
    const { ctx, page, errors } = await open(browser, desktop);
    const gates = await page.evaluate(() => window.__toybox.hub.gates());
    check('twelve gates in the hub', gates.length === 12, gates.map((g) => g.game).join(','));
    for (const g of gates) {
      await page.evaluate((v) => window.__toybox.teleport(v.standX, v.standZ, v.yaw), g);
      const prompt = await page.waitForFunction((t) => { const p = document.querySelector('.prompt'); return p && p.textContent.includes(t) ? p.textContent : null; }, g.title, { timeout: 120000 }).then((h) => h.jsonValue()).catch(() => null);
      check(`${g.game}: prompt at its gate`, !!prompt && prompt.includes('Play'), JSON.stringify(prompt));
      await page.keyboard.press('KeyE');
      const h2 = await page.waitForSelector('.match-intro h2', { timeout: 120000 }).then((e) => e.textContent()).catch(() => '');
      check(`${g.game}: E opens its lobby (intro card)`, h2.includes(g.title), h2);
      if (g.game === 'copycat-conductor') {
        const note = await page.$('[data-testid=online-lobby-note] button');
        check('online lobby shown as not available (disabled)', !!note && (await note.isDisabled()), note ? await note.textContent() : 'missing');
        await page.screenshot({ path: `${OUT}/hubgates-lobby-desktop.png`, timeout: 180000, animations: 'disabled' });
      }
      await leave(page);
    }
    check('no page errors (desktop gates)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  if (want('phone')) {
    const phone = { ...devices['iPhone 13'], deviceScaleFactor: 1 };
    const { ctx, page, errors } = await open(browser, phone);
    const gates = await page.evaluate(() => window.__toybox.hub.gates());
    // real touch input through the DevTools protocol (as tests/e2e/mobile.cjs does)
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id = 0]) => ({ x, y, id })) });
    for (const id of ['toy-squad', 'spellbox-showdown', 'red-light-green-light']) {
      const g = gates.find((x) => x.game === id);
      await page.evaluate((v) => window.__toybox.teleport(v.standX, v.standZ, v.yaw), g);
      await page.waitForFunction((t) => document.querySelector('.touch-btn--interact')?.getAttribute('aria-label')?.includes(t), g.title, { timeout: 120000 }).catch(() => null);
      const btn = await page.$('.touch-btn--interact');
      check(`phone ${id}: Interact button names the trial`, !!btn && ((await btn.getAttribute('aria-label')) || '').includes(g.title));
      if (id === 'toy-squad') await page.screenshot({ path: `${OUT}/hubgates-phone-prompt.png`, timeout: 180000 });
      const b = await btn.boundingBox();
      check(`phone ${id}: Interact button ≥ 56 px`, b.width >= 56 && b.height >= 56, `${b.width}x${b.height}`);
      await touch('touchStart', [[b.x + b.width / 2, b.y + b.height / 2, 7]]);
      await page.waitForTimeout(300);
      await touch('touchEnd', []);
      const h2 = await page.waitForSelector('.match-intro h2', { timeout: 120000 }).then((e) => e.textContent()).catch(() => '');
      check(`phone ${id}: Interact opens its lobby`, h2.includes(g.title), h2);
      if (id === 'toy-squad') await page.screenshot({ path: `${OUT}/hubgates-lobby-phone.png`, timeout: 180000, animations: 'disabled' });
      await page.waitForTimeout(800);
      await page.tap('[data-testid=match-leave]');
      await page.waitForSelector('.match-intro', { state: 'detached', timeout: 120000 });
      await frames(page, 4);
    }
    check('no page errors (phone)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }


  // Walk the bridge for real: hold forward from the spawn table's end of the bridge until the toy is
  // on the gates table. Records the highest point (the deck) and the widest sideways drift.
  async function walkBridge(page, label, hold, release) {
    const br = await page.evaluate(() => window.__toybox.hub.bridge());
    await page.evaluate((b) => { window.__toybox.teleport(b.x, b.start + 3, Math.PI); window.__toybox.aim(0, 0.32); }, br);
    await frames(page, 6);
    await hold();
    const track = { maxY: 0, maxDx: 0, z: 0, shot: false };
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      const s = await page.evaluate(() => window.__toybox.state());
      track.maxY = Math.max(track.maxY, s.y);
      if (s.z < br.deckA && s.z > br.deckB) track.maxDx = Math.max(track.maxDx, Math.abs(s.x - br.x));
      track.z = s.z;
      if (!track.shot && s.z < (br.deckA + br.deckB) / 2) {
        track.shot = true;
        await page.screenshot({ path: `${OUT}/hubgates-bridge-walk-${label}.png`, timeout: 240000 });
      }
      if (s.z < br.end - 2) break;
      await page.waitForTimeout(400);
    }
    await release();
    check(`${label}: walked across the bridge onto the gates table`, track.z < br.end - 2, `z=${track.z.toFixed(1)} (far end ${br.end.toFixed(1)})`);
    check(`${label}: on the deck at deck height`, Math.abs(track.maxY - br.top) < 0.3, `max y ${track.maxY.toFixed(2)} (deck ${br.top.toFixed(2)})`);
    check(`${label}: stayed between the rails`, track.maxDx < 2.7, `max drift ${track.maxDx.toFixed(2)} cm`);
    return br;
  }

  if (want('bridge')) {
    const { ctx, page, errors } = await open(browser, desktop);
    const keys = { hold: async () => { await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); }, release: async () => { await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); } };
    const br = await walkBridge(page, 'desktop', keys.hold, keys.release);
    // straight on to the Copycat gate at the head of the gates table's avenue, and into its lobby
    await page.evaluate(() => window.__toybox.aim(0, 0.32));
    await keys.hold();
    const prompt = await page.waitForFunction(() => { const p = document.querySelector('.prompt'); return p && p.textContent.includes('Copycat') ? p.textContent : null; }, null, { timeout: 300000, polling: 300 }).then((h) => h.jsonValue()).catch(() => null);
    await keys.release();
    check('walked on from the bridge to the Copycat gate prompt', !!prompt, JSON.stringify(prompt));
    await page.keyboard.press('KeyE');
    const h2 = await page.waitForSelector('.match-intro h2', { timeout: 120000 }).then((e) => e.textContent()).catch(() => '');
    check('the gates table gate opens its lobby after the walk', h2.includes('Copycat'), h2);
    await leave(page);
    // trying to step off the side of the bridge: hold a sideways key on the deck
    await page.evaluate((b) => { window.__toybox.teleport(b.x, (b.deckA + b.deckB) / 2, Math.PI); window.__toybox.aim(0, 0.32); }, br);
    await frames(page, 4);
    for (const key of ['KeyA', 'KeyD']) {
      await page.keyboard.down(key);
      await frames(page, 40);
      await page.keyboard.up(key);
      const s = await page.evaluate(() => window.__toybox.state());
      check(`holding ${key} on the deck keeps the toy on the bridge`, Math.abs(s.x - br.x) < 2.7 && Math.abs(s.y - br.top) < 0.3, `x=${s.x.toFixed(2)} y=${s.y.toFixed(2)}`);
    }
    check('no page errors (bridge)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  if (want('bridgephone')) {
    const phone = { ...devices['iPhone 13'], deviceScaleFactor: 1 };
    const { ctx, page, errors } = await open(browser, phone);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id = 0]) => ({ x, y, id })) });
    const zone = await (await page.$('.touch-stick-zone')).boundingBox();
    const cx = zone.x + zone.width / 2;
    const cy = zone.y + zone.height / 2;
    await walkBridge(
      page,
      'phone',
      async () => { await touch('touchStart', [[cx, cy, 11]]); await touch('touchMove', [[cx, cy - 30, 11]]); await touch('touchMove', [[cx, cy - 60, 11]]); },
      async () => { await touch('touchEnd', []); },
    );
    check('no page errors (phone bridge)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  if (want('tv')) {
    const { ctx, page, errors } = await open(browser, desktop, process.env.SHOT_QUALITY || 'balanced');
    await page.addStyleTag({ content: '.hud-hint,.ticket-stack{display:none!important}' }).catch(() => {});
    await page.waitForFunction(() => window.__toybox.tv && window.__toybox.tv().draws > 0, null, { timeout: 120000 });
    const first = await page.evaluate(() => window.__toybox.tv());
    check('TV shows a card (offline: points at Play online)', first.card !== null && (first.card !== 'online' || first.lines.join(' ').includes('PLAY ONLINE')), JSON.stringify(first));
    await page.evaluate(() => window.__toybox.hub.goTo('tv'));
    const prompt = await page.waitForFunction(() => { const p = document.querySelector('.prompt'); return p && p.textContent.includes('TV') ? p.textContent : null; }, null, { timeout: 120000 }).then((h) => h.jsonValue()).catch(() => null);
    check('prompt at the TV', !!prompt, JSON.stringify(prompt));
    const before = await page.evaluate(() => window.__toybox.tv());
    await page.keyboard.press('KeyE');
    await page.waitForFunction((n) => window.__toybox.tv().draws > n, before.draws, { timeout: 60000 }).catch(() => null);
    const after = await page.evaluate(() => window.__toybox.tv());
    check('Interact at the TV changes channel', after.index !== before.index, `${before.card} -> ${after.card}`);
    // the TV and the Scoreboard together, close up
    await page.addStyleTag({ content: '.prompt{display:none!important}' }).catch(() => {});
    await page.evaluate(() => { window.__toybox.teleport(-9, -6.5, Math.PI + 0.35); window.__toybox.aim(0.3, 0.12); });
    await frames(page, 10);
    await page.screenshot({ path: `${OUT}/hubgates-tv.png`, timeout: 240000 });
    // the draw counter only moves when the card changes (a 1 s timer, never per frame)
    const d0 = await page.evaluate(() => window.__toybox.tv().draws);
    const t0 = Date.now();
    await frames(page, 30);
    const secs = (Date.now() - t0) / 1000;
    const d1 = await page.evaluate(() => window.__toybox.tv().draws);
    // one redraw per card flip (6 s) at most, however many frames were rendered meanwhile
    check('TV redraws only when its card changes, not per frame', d1 - d0 <= Math.ceil(secs / 6) + 1 && d1 - d0 < 30, `${d1 - d0} redraws over 30 frames / ${secs.toFixed(1)} s`);
    check('no page errors (tv)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  if (want('shots') || want('gateshots')) {
    const q = process.env.SHOT_QUALITY || 'balanced';
    const { ctx, page } = await open(browser, desktop, q);
    await page.addStyleTag({ content: '.hud-hint,.ticket-stack,.prompt{display:none!important}' }).catch(() => {});
    const gates = await page.evaluate(() => window.__toybox.hub.gates());
    for (const g of gates) {
      // stand in front of the gate, camera swung out to the side so the arch and both of its
      // themed spots are in frame (straight behind, a building can shorten the camera boom)
      await page.evaluate((v) => { const d = 5; window.__toybox.teleport(v.x + Math.sin(v.rot) * d, v.z + Math.cos(v.rot) * d, v.yaw); window.__toybox.aim(v.rot + 0.85, 0.32); }, g);
      await frames(page, 10);
      await page.screenshot({ path: `${OUT}/hubgates-gate-${g.game}.png`, timeout: 180000 });
    }
    if (want('shots')) {
      // the Scoreboard (and the TV beside it) close up from the front, and from the side
      await page.evaluate(() => { window.__toybox.teleport(-4, -9, Math.PI); window.__toybox.aim(0.25, 0.14); });
      await frames(page, 10);
      await page.screenshot({ path: `${OUT}/hubgates-scoreboard.png`, timeout: 180000 });
      await page.evaluate(() => { window.__toybox.teleport(10, -12, -2.2); window.__toybox.aim(-2.2 + Math.PI, 0.15); });
      await frames(page, 10);
      await page.screenshot({ path: `${OUT}/hubgates-scoreboard-side.png`, timeout: 180000 });
      // the bridge from the spawn table, and from beside it over the gap
      await page.evaluate(() => { const b = window.__toybox.hub.bridge(); window.__toybox.teleport(b.x - 3, b.start + 6, Math.PI - 0.2); window.__toybox.aim(-0.2, 0.3); });
      await frames(page, 10);
      await page.screenshot({ path: `${OUT}/hubgates-bridge-from-plaza.png`, timeout: 180000 });
      // opposing gameplay views from the plaza
      const views = [
        ['north', 0, 8, Math.PI, 0, 0.2],
        ['south', 0, -10, 0, Math.PI, 0.2],
        ['east', -10, -1, Math.PI / 2, -Math.PI / 2, 0.2],
        ['west', 10, -1, -Math.PI / 2, Math.PI / 2, 0.2],
      ];
      info.views = {};
      for (const [name, x, z, yaw, cy, cp] of views) {
        await page.evaluate((v) => { window.__toybox.teleport(v[1], v[2], v[3]); window.__toybox.aim(v[4], v[5]); }, [name, x, z, yaw, cy, cp]);
        await frames(page, 10);
        await page.screenshot({ path: `${OUT}/hubgates-view-${name}.png`, timeout: 180000 });
        info.views[name] = await page.evaluate(() => window.__toybox.renderInfo());
        console.log(q, name, JSON.stringify(info.views[name]));
      }
    }
    await ctx.close();
  }

  if (want('overview')) {
    for (const q of ['low', 'balanced']) {
      const { ctx, page } = await open(browser, { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, q);
      await page.evaluate(() => { window.__toybox.teleport(0, 22, Math.PI); window.__toybox.aim(0, 0.2); });
      await frames(page, 8);
      info[`play-${q}`] = await page.evaluate(() => window.__toybox.renderInfo());
      console.log(q, 'spawn view', JSON.stringify(info[`play-${q}`]));
      // high three-quarter cameras over both tables and the bridge (rendered once with a cloned camera)
      for (const [name, pos, look] of [['overview', [25, 190, 120], [25, 0, -62]], ['overview-north', [25, 140, -176], [25, 0, -40]], ['overview-bridge', [70, 40, -50], [24, 0, -73]]]) {
        const png = await page.evaluate(([p, l]) => {
          const { gl, scene, camera } = window.__toybox.three();
          const cam = camera.clone();
          cam.fov = 50;
          cam.aspect = gl.domElement.width / gl.domElement.height;
          cam.position.set(p[0], p[1], p[2]);
          cam.lookAt(l[0], l[1], l[2]);
          cam.updateProjectionMatrix();
          cam.updateMatrixWorld();
          gl.render(scene, cam);
          return gl.domElement.toDataURL('image/png');
        }, [pos, look]);
        fs.writeFileSync(`${OUT}/hubgates-${name}-${q}.png`, Buffer.from(png.split(',')[1], 'base64'));
      }
      await ctx.close();
    }
  }

  fs.writeFileSync(`${OUT}/hubgates-renderinfo.json`, JSON.stringify(info, null, 2));
  await browser.close();
  console.log('\n' + results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  process.exit(fails ? 1 : 0);
})();
