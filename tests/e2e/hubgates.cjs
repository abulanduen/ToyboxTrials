/* Hub gates: every playable trial has a gate whose prompt opens that trial's lobby (intro card),
 * desktop + phone (touch Interact), plus screenshots of each gate's surroundings, the scoreboard
 * dominoes, opposing gameplay views and a whole-hub overview, with renderer counts.
 *
 *   BASE_URL=http://localhost:4173/ node tests/e2e/hubgates.cjs [only]
 *     only  comma list of parts: gates,phone,shots,overview (default all)
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
    check('eleven gates in the hub', gates.length === 11, gates.map((g) => g.game).join(','));
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
        await page.screenshot({ path: `${OUT}/hubgates-lobby-desktop.png` });
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
    const touch = (type, pts) => page.evaluate(([t, p]) => {
      const el = document.elementFromPoint(p[0]?.[0] ?? 1, p[0]?.[1] ?? 1) || document.body;
      const mk = (q) => new Touch({ identifier: q[2], target: el, clientX: q[0], clientY: q[1] });
      const list = p.map(mk);
      el.dispatchEvent(new TouchEvent(t, { bubbles: true, cancelable: true, touches: t === 'touchend' ? [] : list, changedTouches: list, targetTouches: list }));
    }, [type, pts]);
    for (const id of ['toy-squad', 'spellbox-showdown', 'red-light-green-light']) {
      const g = gates.find((x) => x.game === id);
      await page.evaluate((v) => window.__toybox.teleport(v.standX, v.standZ, v.yaw), g);
      await page.waitForFunction((t) => document.querySelector('.touch-btn--interact')?.getAttribute('aria-label')?.includes(t), g.title, { timeout: 120000 }).catch(() => null);
      const btn = await page.$('.touch-btn--interact');
      check(`phone ${id}: Interact button names the trial`, !!btn && ((await btn.getAttribute('aria-label')) || '').includes(g.title));
      if (id === 'toy-squad') await page.screenshot({ path: `${OUT}/hubgates-phone-prompt.png` });
      const b = await btn.boundingBox();
      check(`phone ${id}: Interact button ≥ 56 px`, b.width >= 56 && b.height >= 56, `${b.width}x${b.height}`);
      await touch('touchstart', [[b.x + b.width / 2, b.y + b.height / 2, 7]]);
      await page.waitForTimeout(300);
      await touch('touchend', [[b.x + b.width / 2, b.y + b.height / 2, 7]]);
      const h2 = await page.waitForSelector('.match-intro h2', { timeout: 120000 }).then((e) => e.textContent()).catch(() => '');
      check(`phone ${id}: Interact opens its lobby`, h2.includes(g.title), h2);
      if (id === 'toy-squad') await page.screenshot({ path: `${OUT}/hubgates-lobby-phone.png` });
      await page.waitForTimeout(800);
      await page.tap('[data-testid=match-leave]');
      await page.waitForSelector('.match-intro', { state: 'detached', timeout: 120000 });
      await frames(page, 4);
    }
    check('no page errors (phone)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  if (want('shots')) {
    const q = process.env.SHOT_QUALITY || 'balanced';
    const { ctx, page } = await open(browser, desktop, q);
    await page.addStyleTag({ content: '.hud-hint,.ticket-stack,.prompt{display:none!important}' }).catch(() => {});
    const gates = await page.evaluate(() => window.__toybox.hub.gates());
    for (const g of gates) {
      // stand on the road in front of the gate, camera behind and a little to the side
      await page.evaluate((v) => { const d = 7.5; window.__toybox.teleport(v.x + Math.sin(v.rot) * d, v.z + Math.cos(v.rot) * d, v.yaw); window.__toybox.aim(v.rot + 0.25, 0.2); }, g);
      await frames(page, 10);
      await page.screenshot({ path: `${OUT}/hubgates-gate-${g.game}.png`, timeout: 180000 });
    }
    // scoreboard close-up (front) and from the side
    await page.evaluate(() => { window.__toybox.teleport(24.5, 5.6, -1.79 + Math.PI); window.__toybox.aim(-1.79 - 0.15, 0.12); });
    await frames(page, 10);
    await page.screenshot({ path: `${OUT}/hubgates-scoreboard.png`, timeout: 180000 });
    await page.evaluate(() => { window.__toybox.teleport(27, 15, -2.4); window.__toybox.aim(-0.9, 0.15); });
    await frames(page, 10);
    await page.screenshot({ path: `${OUT}/hubgates-scoreboard-side.png`, timeout: 180000 });
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
    await ctx.close();
  }

  if (want('overview')) {
    for (const q of ['low', 'balanced']) {
      const { ctx, page } = await open(browser, { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, q);
      await page.evaluate(() => { window.__toybox.teleport(0, 22, Math.PI); window.__toybox.aim(0, 0.2); });
      await frames(page, 8);
      info[`play-${q}`] = await page.evaluate(() => window.__toybox.renderInfo());
      console.log(q, 'spawn view', JSON.stringify(info[`play-${q}`]));
      // a high three-quarter camera over the whole playmat (rendered once with a cloned camera)
      for (const [name, pos] of [['overview', [0, 115, 85]], ['overview-north', [0, 105, -95]]]) {
        const png = await page.evaluate((p) => {
          const { gl, scene, camera } = window.__toybox.three();
          const cam = camera.clone();
          cam.fov = 50;
          cam.aspect = gl.domElement.width / gl.domElement.height;
          cam.position.set(p[0], p[1], p[2]);
          cam.lookAt(0, 0, -4);
          cam.updateProjectionMatrix();
          cam.updateMatrixWorld();
          gl.render(scene, cam);
          return gl.domElement.toDataURL('image/png');
        }, pos);
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
