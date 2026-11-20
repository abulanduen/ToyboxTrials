/* Touch / mobile checks with an emulated phone (real touch events via CDP).
   Run: BASE_URL=http://localhost:4173/ node tests/e2e/mobile.cjs
   The online Hub chat sheet (portrait and landscape) also runs when CHAT_BASE_URL points at a
   preview of a build made with VITE_SERVER_URL=ws://localhost:<CHAT_SERVER_PORT> (default 2567);
   it starts server-dist/index.cjs itself (npm run server:build first). */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const res = [];
const check = (n, ok, d = '') => res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const phone = devices['Pixel 7'];
  const ctx = await browser.newContext({ ...phone, viewport: { width: 915, height: 412 }, screen: { width: 915, height: 412 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(+process.env.E2E_TIMEOUT || 120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id = 0]) => ({ x, y, id })) });
  const st = () => page.evaluate(() => window.__toybox.state());

  // Pipwick's first-visit Hub tour has its own suite (welcome.cjs); this one starts as a returning player.
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true }, version: 2 })); } });
  await page.goto(BASE + '?debug');
  await page.waitForTimeout(4000);
  check('main menu shows on touch device', await page.isVisible('[data-testid=menu-play]'));
  await page.screenshot({ path: `${OUT}/mobile-00-menu-landscape.png` });
  await page.tap('[data-testid=menu-play]');
  await page.waitForTimeout(2500);
  check('touch controls visible in hub', await page.isVisible('.touch-stick-zone'));
  check('keyboard controls card hidden on touch', !(await page.isVisible('.controls')));
  await page.screenshot({ path: `${OUT}/mobile-01-hub-landscape.png` });

  // Joystick: thumb down in the left zone, push up (forward), hold.
  let a = await st();
  await touch('touchStart', [[120, 300]]);
  await touch('touchMove', [[120, 255]]);
  await page.waitForTimeout(6000);
  await touch('touchEnd', []);
  await page.waitForTimeout(500);
  let b = await st();
  check('joystick moves the toy forward', b.z < a.z - 0.4, `z ${a.z.toFixed(2)} -> ${b.z.toFixed(2)}`);

  // Look: drag on the right half of the scene.
  a = await st();
  await touch('touchStart', [[600, 150, 1]]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [[600 - i * 25, 150, 1]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(1500);
  b = await st();
  check('drag on scene rotates the camera', Math.abs(b.camYaw - a.camYaw) > 0.1, `camYaw ${a.camYaw.toFixed(2)} -> ${b.camYaw.toFixed(2)}`);

  // Simultaneous: move with left thumb while looking with right thumb.
  a = await st();
  await touch('touchStart', [[120, 300, 2]]);
  await touch('touchMove', [[120, 255, 2]]);
  await touch('touchStart', [[120, 255, 2], [650, 150, 3]]);
  await touch('touchMove', [[120, 255, 2], [600, 150, 3]]);
  await page.waitForTimeout(4000);
  await touch('touchEnd', []);
  await page.waitForTimeout(500);
  b = await st();
  check('two-thumb move + look at the same time', Math.hypot(b.x - a.x, b.z - a.z) > 0.3 && Math.abs(b.camYaw - a.camYaw) > 0.05);

  // Jump button
  await page.evaluate(() => window.__toybox.teleport(0, 20, Math.PI));
  await page.waitForTimeout(800);
  const jb = await page.$('.touch-btn--jump');
  const box = await jb.boundingBox();
  await touch('touchStart', [[box.x + box.width / 2, box.y + box.height / 2, 4]]);
  let peak = 0;
  // Sample for ~3 s: software-rendered frames can take >1 s each in CI.
  for (let i = 0; i < 20; i++) { const s = await st(); peak = Math.max(peak, s.y, s.anim.grounded ? 0 : 0.21); await page.waitForTimeout(150); }
  await touch('touchEnd', []);
  check('Jump button jumps', peak > 0.2, `peak y=${peak.toFixed(2)}`);
  await page.waitForTimeout(1200);

  // Interact button at the Copycat gate opens the game; play a round with the touch pads.
  await page.evaluate(() => window.__toybox.match.timeScale(4));
  await page.evaluate((id) => { const g = window.__toybox.hub.gates().find((x) => x.game === id); window.__toybox.teleport(g.standX, g.standZ, g.yaw); }, 'copycat-conductor');
  await page.waitForFunction(() => document.querySelector('.touch-btn--interact')?.getAttribute('aria-label')?.includes('Copycat'), null, { timeout: 120000 }).catch(() => null);
  check('Interact button appears with a prompt', await page.isVisible('.touch-btn--interact'), await page.textContent('.touch-btn--interact').catch(() => ''));
  await page.screenshot({ path: `${OUT}/mobile-02-gate-prompt.png` });
  const ib = await (await page.$('.touch-btn--interact')).boundingBox();
  await touch('touchStart', [[ib.x + ib.width / 2, ib.y + ib.height / 2, 5]]);
  await page.waitForTimeout(600);
  await touch('touchEnd', []);
  await page.waitForSelector('.match-intro', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
  check('Interact button opens the Copycat intro', await page.isVisible('.match-intro'));
  await page.tap('[data-testid=tutorial-next]');
  check('phone tutorial uses touch wording', (await page.textContent('.tutorial__text').catch(() => ''))?.includes('tapping the four instrument pads'));
  const tutTargets = await page.$$eval('.tutorial button', (bs) => bs.map((b) => b.getBoundingClientRect().height));
  check('tutorial buttons are at least 56 px tall', tutTargets.length === 3 && tutTargets.every((h) => h >= 56), tutTargets.join(','));
  await page.screenshot({ path: `${OUT}/mobile-02b-tutorial.png` });
  await page.locator('[data-testid=match-start]').scrollIntoViewIfNeeded();
  await page.tap('[data-testid=match-start]');
  const MS = () =>
    page.evaluate(() => {
      const s = window.__toybox.match.state();
      return s && { phase: s.phase, round: s.round, seq: s.sequence, len: s.config.startLength + s.round - 1, me: s.players[0] };
    });
  const waitInput = async () => {
    for (let i = 0; i < 600; i++) {
      const x = await MS();
      if (x && x.phase === 'input') return x;
      await page.waitForTimeout(250);
    }
    throw new Error('no input phase');
  };
  const tapPad = async (i) => {
    const b = await page.locator('.cc-pad').nth(i).boundingBox();
    await touch('touchStart', [[b.x + b.width / 2, b.y + b.height / 2, 20 + i]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(80);
  };
  let cm = await waitInput();
  check('four instrument pads on screen', (await page.$$('.cc-pad')).length === 4);
  // Freeze match time while the (slow, software-rendered) screenshot is taken.
  await page.evaluate(() => window.__toybox.match.timeScale(0));
  await page.screenshot({ path: `${OUT}/mobile-03-copycat-pads.png` });
  // Keep the simulation frozen while CDP sends the ordered touch presses. Under software
  // rendering, protocol latency can otherwise consume the whole input deadline.
  for (let i = cm.me.progress; i < cm.len; i++) await tapPad(cm.seq[i]);
  await page.evaluate(() => window.__toybox.match.timeScale(4));
  for (let i = 0; i < 600; i++) {
    const x = await MS();
    if (x.round === 2) break;
    await page.waitForTimeout(250);
  }
  check('tapping the pads repeats the sequence (round 2 reached)', (await MS()).round === 2);
  cm = await waitInput();
  await tapPad((cm.seq[cm.me.progress] + 1) % 4);
  await page.waitForSelector('.results', { timeout: 120000 }).catch(() => null);
  await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
  check('a wrong pad ends the run with results', await page.isVisible('.results'));
  await page.screenshot({ path: `${OUT}/mobile-04-copycat-results.png` });
  await page.tap('[data-testid=results-leave]');
  await page.waitForSelector('.touch-stick-zone', { timeout: 60000 }).catch(() => null);
  check('back to the Playroom with touch controls', await page.isVisible('.touch-stick-zone'));

  // Hub play by touch (offline): the Interact button kicks the marble, picks up the basketball,
  // and held down charges a throw (meter + arc), which goes when the thumb lets go.
  const hp = () => page.evaluate(() => window.__toybox.hubplay.state());
  const btnText = (t) => page.waitForFunction((s) => document.querySelector('.touch-btn--interact')?.textContent?.includes(s), t, { timeout: 120000 }).catch(() => null);
  const pressBtn = async (id, ms) => {
    const el = await page.$('.touch-btn--interact');
    const b = await el.boundingBox();
    // the button pops in with a scale animation: its layout size is the touch target
    const [w, h] = await el.evaluate((e) => [e.offsetWidth, e.offsetHeight]);
    b.layout = { w, h };
    await touch('touchStart', [[b.x + b.width / 2, b.y + b.height / 2, id]]);
    if (ms) await page.waitForTimeout(ms);
    return b;
  };
  const m0 = (await hp()).marble;
  await page.evaluate(([x, z]) => window.__toybox.teleport(x + 2.3, z, -Math.PI / 2), [m0.x, m0.z]);
  await btnText('Kick');
  const kb = await pressBtn(40, 300);
  await touch('touchEnd', []);
  await page.waitForFunction((x) => window.__toybox.hubplay.state().marble.x < x - 4, m0.x, { timeout: 120000, polling: 200 }).catch(() => null);
  check('touch: the Interact button (≥ 56 px) reads Kick by the marble and kicks it', kb.layout.w >= 56 && kb.layout.h >= 56 && (await hp()).marble.x < m0.x - 4, `${JSON.stringify(kb)} x ${m0.x} → ${(await hp()).marble.x.toFixed(1)}`);
  await page.evaluate(() => window.__toybox.teleport(76, -125.6, Math.PI));
  await btnText('Pick');
  await pressBtn(41, 300);
  await touch('touchEnd', []);
  await page.waitForFunction(() => window.__toybox.hubplay.state().holding, null, { timeout: 120000, polling: 200 }).catch(() => null);
  await btnText('Hold');
  check('touch: Pick up takes the ball; the button now reads Hold (to throw)', (await hp()).holding && ((await page.textContent('.touch-btn--interact').catch(() => '')) || '').includes('Hold'));
  await pressBtn(42);
  await page.waitForFunction(() => (window.__toybox.hubplay.state().charge ?? 0) > 0.3, null, { timeout: 120000, polling: 100 }).catch(() => null);
  await page.waitForFunction(() => document.querySelector('[data-testid=hubplay-meter]')?.style.display !== 'none', null, { timeout: 120000, polling: 100 }).catch(() => null);
  const ch = await hp();
  const meterBox = await page.locator('[data-testid=hubplay-meter]').boundingBox().catch(() => null);
  await page.screenshot({ path: `${OUT}/mobile-10-hubplay-charge-landscape.png` });
  await touch('touchEnd', []);
  await page.waitForFunction(() => !window.__toybox.hubplay.state().holding, null, { timeout: 120000, polling: 100 }).catch(() => null);
  check('touch: holding the button charges (meter on screen), letting go throws', ch.charge > 0.3 && !!meterBox && meterBox.y > 0 && meterBox.y + meterBox.height < 412 && !(await hp()).holding, `charge ${ch.charge?.toFixed(2)} meter ${JSON.stringify(meterBox)}`);

  // Tapping the prompt pill also interacts (workshop building → Workshop screen)
  await page.evaluate(() => window.__toybox.hub.goTo('workshop'));
  await page.waitForTimeout(2500);
  await page.tap('.prompt--touch');
  await page.waitForTimeout(1800);
  check('tapping the prompt pill interacts (opens Workshop)', await page.isVisible('.workshop-panel'));
  await page.tap('.workshop-tabs button >> nth=1');
  await page.waitForTimeout(400);
  await page.tap('.swatch >> nth=1');
  await page.waitForTimeout(600);
  check('hat swatch is tappable and selects', (await page.getAttribute('.swatch >> nth=1', 'aria-selected')) === 'true');
  await page.screenshot({ path: `${OUT}/mobile-06-workshop-landscape.png` });
  await page.tap('[data-testid=workshop-done]');
  await page.waitForTimeout(1500);

  // Pause button
  await page.tap('.touch-pause');
  await page.waitForTimeout(1000);
  check('pause button opens pause menu', await page.isVisible('.pause'));
  check('touch devices default to Low quality', (await page.textContent('.segmented .on'))?.trim() === 'low');
  await page.screenshot({ path: `${OUT}/mobile-04-pause.png` });
  await page.tap('.pause__actions .toy-btn >> nth=0');
  await page.waitForTimeout(800);

  // Portrait
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(3000);
  const p = await st();
  check('portrait widens the camera FOV', p.fov > 60, `fov=${p.fov.toFixed(1)}`);
  await page.screenshot({ path: `${OUT}/mobile-05-portrait.png` });

  // Hub play in portrait: pick the ball up wherever it landed and charge a throw; the score chip
  // and the meter stay on screen, clear of the touch buttons.
  await page.waitForFunction(() => window.__toybox.hubplay.state().ballRest, null, { timeout: 400000, polling: 250 }).catch(() => null);
  const bl = (await hp()).ball;
  await page.evaluate(([x, z]) => { const d = Math.hypot(76 - x, -128 - z) || 1; window.__toybox.teleport(x + ((76 - x) / d) * 2, z + ((-128 - z) / d) * 2, Math.PI); }, [bl.x, bl.z]);
  await btnText('Pick');
  await pressBtn(43, 300);
  await touch('touchEnd', []);
  await btnText('Hold');
  await pressBtn(44);
  await page.waitForFunction(() => (window.__toybox.hubplay.state().charge ?? 0) > 0.25, null, { timeout: 120000, polling: 100 }).catch(() => null);
  await page.waitForFunction(() => document.querySelector('[data-testid=hubplay-meter]')?.style.display !== 'none', null, { timeout: 120000, polling: 100 }).catch(() => null);
  const chip = await page.locator('[data-testid=hubplay-score]').boundingBox().catch(() => null);
  const mb = await page.locator('[data-testid=hubplay-meter]').boundingBox().catch(() => null);
  const btns = await page.$$eval('.touch-btn, .touch-pause', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  const hit = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.width && a.y < b.y + b.h && b.y < a.y + a.height;
  await page.screenshot({ path: `${OUT}/mobile-11-hubplay-portrait.png` });
  await touch('touchEnd', []);
  check('portrait: score chip and throw meter on screen, clear of the touch buttons', !!chip && !!mb && chip.x >= 0 && chip.x + chip.width <= 412 && mb.x >= 0 && mb.x + mb.width <= 412 && !btns.some((b) => hit(chip, b) || hit(mb, b)), JSON.stringify({ chip, mb }));

  // Jack-in-the-Box in portrait: the answer box sits high (clear of the phone keyboard), tap Crank! to pass.
  await page.evaluate(() => window.__toybox.match.timeScale(2));
  await page.evaluate((id) => { const g = window.__toybox.hub.gates().find((x) => x.game === id); window.__toybox.teleport(g.standX, g.standZ, g.yaw); }, 'jack-in-the-box');
  await page.waitForFunction(() => document.querySelector('.touch-btn--interact')?.getAttribute('aria-label')?.includes('Jack-in-the-Box'));
  const jib = await (await page.$('.touch-btn--interact')).boundingBox();
  await touch('touchStart', [[jib.x + jib.width / 2, jib.y + jib.height / 2, 6]]);
  await page.waitForTimeout(600);
  await touch('touchEnd', []);
  await page.waitForSelector('.match-intro', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(1500); // a long press must not tap-through to the intro's buttons
  check('Interact button at the coral gate opens Jack-in-the-Box and it stays open (portrait)', (await page.textContent('.match-intro h2').catch(() => ''))?.includes('Jack'));
  await page.tap('[data-testid=match-start]');
  const JS = () => page.evaluate(() => {
    const s = window.__toybox.match.state();
    return s && s.category ? { phase: s.phase, holder: s.holder, said: s.said.map((x) => x.display.toLowerCase()), tiers: s.category.tiers } : null;
  });
  let js = null;
  for (let i = 0; i < 900; i++) {
    js = await JS();
    if (js && js.phase === 'live' && js.holder === 'you') break;
    if (await page.isVisible('.results')) break;
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => window.__toybox.match.timeScale(0));
  const myTurn = js && js.phase === 'live' && js.holder === 'you';
  check('the box reaches you (portrait)', myTurn);
  if (myTurn) {
    const ib2 = await page.locator('[data-testid=jb-input]').boundingBox();
    const sb = await page.locator('[data-testid=jb-send]').boundingBox();
    check('answer box sits in the top third (clear of the keyboard)', ib2.y + ib2.height < 915 / 3, `bottom=${(ib2.y + ib2.height).toFixed(0)}`);
    check('answer box and Crank! button are ≥ 56 px tall', ib2.height >= 56 && sb.height >= 56, `${ib2.height}/${sb.height}`);
    await page.screenshot({ path: `${OUT}/mobile-09-jack-portrait.png` });
    const ans = js.tiers[0].split(',').map((e) => e.split('|')[0].trim()).find((a) => !js.said.includes(a));
    await page.tap('[data-testid=jb-input]');
    await page.keyboard.type(ans);
    const sb2 = await page.locator('[data-testid=jb-send]').boundingBox();
    await touch('touchStart', [[sb2.x + sb2.width / 2, sb2.y + sb2.height / 2, 30]]);
    await touch('touchEnd', []);
    await page.evaluate(() => window.__toybox.match.timeScale(0.05));
    let passed = false;
    for (let i = 0; i < 100 && !passed; i++) {
      const x = await JS();
      passed = !!x && x.said.includes(ans);
      await page.waitForTimeout(150);
    }
    check('tapping Crank! submits the answer and passes the box', passed, ans);
  }
  await page.evaluate(() => window.__toybox.match.timeScale(4));
  if (!(await page.isVisible('.results'))) {
    await page.tap('.match-pause');
    await page.waitForTimeout(1000);
    await page.tap('.pause__actions .toy-btn >> nth=1'); // leave
  } else {
    await page.waitForTimeout(900);
    await page.tap('[data-testid=results-leave]');
  }
  await page.waitForSelector('.touch-stick-zone', { timeout: 60000 }).catch(() => null);
  check('back in the Playroom after Jack (portrait)', await page.isVisible('.touch-stick-zone'));

  // Portrait menu and Workshop
  await page.tap('.touch-pause');
  await page.waitForTimeout(800);
  await page.tap('.pause__actions .toy-btn >> nth=2'); // Main menu
  await page.waitForTimeout(2500);
  check('pause → Main menu works (portrait)', await page.isVisible('[data-testid=menu-play]'));
  await page.screenshot({ path: `${OUT}/mobile-07-menu-portrait.png` });
  await page.tap('[data-testid=menu-workshop]');
  await page.waitForTimeout(2500);
  check('menu → Workshop works (portrait)', await page.isVisible('.workshop-panel'));
  await page.screenshot({ path: `${OUT}/mobile-08-workshop-portrait.png` });

  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  // ---------------------------------------------------------------- online Hub chat sheet (phone)
  // Needs a client build pointed at a server (CHAT_BASE_URL, built with
  // VITE_SERVER_URL=ws://localhost:<CHAT_SERVER_PORT>) and server-dist (npm run server:build);
  // this suite starts the server itself. Skipped without CHAT_BASE_URL.
  if (process.env.CHAT_BASE_URL) {
    const { spawn } = require('child_process');
    const port = Number(process.env.CHAT_SERVER_PORT) || 2567;
    const srv = spawn(process.execPath, [path.join(__dirname, '../../server-dist/index.cjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
    try {
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(`http://localhost:${port}/health`)).ok) break; } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      for (const [label, w, h] of [['portrait', 390, 844], ['landscape', 844, 390]]) {
        const cctx = await browser.newContext({ ...phone, viewport: { width: w, height: h }, screen: { width: w, height: h } });
        const cp = await cctx.newPage();
        cp.setDefaultTimeout(+process.env.E2E_TIMEOUT || 120000);
        const cerr = [];
        cp.on('pageerror', (e) => cerr.push(e.message));
        await cp.addInitScript((n) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, quality: 'low', autoOnline: false, contenderName: n }, version: 2 })); } }, `Phone ${label}`);
        await cp.goto(process.env.CHAT_BASE_URL + '?debug');
        await cp.waitForSelector('.loading', { state: 'detached', timeout: 600000 });
        await cp.tap('[data-testid=menu-online]');
        await cp.tap('[data-testid=online-public]');
        await cp.waitForFunction(() => window.__toybox?.net?.status() === 'online', null, { timeout: 120000, polling: 250 }).catch(() => null);
        const btn = await cp.waitForSelector('[data-testid=chat-button]', { timeout: 60000 }).catch(() => null);
        const bb = btn ? await btn.evaluate((e) => { const r = e.getBoundingClientRect(); return { w: e.offsetWidth, h: e.offsetHeight, x: r.x, y: r.y, r: r.right, b: r.bottom }; }) : null;
        check(`chat (${label}): online, a Chat button ≥ 56 px on screen`, !!bb && bb.w >= 56 && bb.h >= 56 && bb.x >= 0 && bb.r <= w && bb.y >= 0 && bb.b <= h, JSON.stringify(bb));
        if (!btn) { await cctx.close(); continue; }
        await cp.tap('[data-testid=chat-button]');
        await cp.waitForSelector('[data-testid=chat-sheet]');
        const lay = () => cp.evaluate(() => {
          const vv = window.visualViewport;
          const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: e.offsetWidth, h: e.offsetHeight }; };
          return { vvTop: vv ? vv.offsetTop : 0, vvH: vv ? vv.height : innerHeight, vw: innerWidth, sheet: box('[data-testid=chat-sheet]'), input: box('[data-testid=chat-input]'), send: box('[data-testid=chat-send]'), close: box('[data-testid=chat-close]'), people: box('[data-testid=chat-people]'), focused: document.activeElement?.getAttribute('data-testid') };
        });
        let L = await lay();
        const inView = (b, l) => !!b && b.x >= 0 && b.r <= l.vw && b.y >= l.vvTop && b.b <= l.vvTop + l.vvH + 0.5;
        check(`chat (${label}): the sheet opens with the text box focused, inside the visible viewport`, L.focused === 'chat-input' && inView(L.sheet, L) && inView(L.input, L), JSON.stringify(L));
        check(`chat (${label}): text box, Send, Close and People are ≥ 56 px`, [L.input, L.send, L.close, L.people].every((b) => b && b.h >= 56 && b.w >= 56), JSON.stringify([L.input, L.send, L.close, L.people]));
        await cp.fill('[data-testid=chat-input]', `hello from the ${label} phone`);
        await cp.tap('[data-testid=chat-send]');
        const echoed = await cp.waitForFunction((t) => window.__toybox.net.chat().lines.some((l) => l.text === t), `hello from the ${label} phone`, { timeout: 30000, polling: 200 }).then(() => true, () => false);
        check(`chat (${label}): Send posts the message (the server echoes it into the log)`, echoed && (await cp.isVisible('[data-testid=chat-sheet]')));
        await cp.screenshot({ path: `${OUT}/mobile-10-chat-sheet-${label}.png` });
        // An on-screen keyboard shrinks the visual viewport: the sheet must follow and keep the box in view.
        await cp.setViewportSize({ width: w, height: Math.round(h * (label === 'portrait' ? 0.55 : 0.5)) });
        await cp.waitForTimeout(600);
        L = await lay();
        check(`chat (${label}): with the viewport shrunk as by a keyboard, the text box and Send stay visible`, inView(L.sheet, L) && inView(L.input, L) && inView(L.send, L), JSON.stringify(L));
        await cp.screenshot({ path: `${OUT}/mobile-11-chat-sheet-${label}-keyboard.png` });
        await cp.setViewportSize({ width: w, height: h });
        await cp.waitForTimeout(400);
        await cp.tap('[data-testid=chat-close]');
        await cp.waitForSelector('[data-testid=chat-sheet]', { state: 'detached', timeout: 20000 }).catch(() => null);
        check(`chat (${label}): Close returns to play (joystick and Chat button back)`, !(await cp.isVisible('[data-testid=chat-sheet]')) && (await cp.isVisible('[data-testid=chat-button]')) && (await cp.isVisible('.touch-stick-zone')));
        // Who Am I? on a phone: open the suspicious box (the server deals a card even to a lone player).
        const spot = await cp.evaluate(() => window.__toybox.interactables().find((i) => i.id === 'jack'));
        await cp.evaluate(([x, z]) => window.__toybox.teleport(x, z, Math.PI / 2), [spot.x, spot.z]);
        await cp.waitForTimeout(5000); // the server lets the toy cross the room at walking pace
        const ib = await cp.waitForSelector('.touch-btn--interact', { timeout: 60000 }).catch(() => null);
        if (ib) await cp.tap('.touch-btn--interact');
        const chip = await cp.waitForSelector('[data-testid=whoami-chip]', { timeout: 60000 }).catch(() => null);
        const cb = chip ? await cp.evaluate(() => [...document.querySelectorAll('[data-testid=whoami-chip], [data-testid=whoami-guess], [data-testid=whoami-peel]')].map((e) => { const r = e.getBoundingClientRect(); return { w: e.offsetWidth, h: e.offsetHeight, x: r.x, r: r.right, y: r.y, b: r.bottom }; })) : [];
        check(`Who Am I? (${label}): the box deals a card; the chip fits on screen with ≥ 56 px buttons`, cb.length === 3 && cb.every((b) => b.x >= 0 && b.r <= w && b.y >= 0 && b.b <= h) && cb.slice(1).every((b) => b.h >= 56 && b.w >= 56), JSON.stringify(cb));
        await cp.evaluate(() => window.__toybox.aim(Math.PI / 2, 0.3));
        await cp.waitForTimeout(1500);
        await cp.screenshot({ path: `${OUT}/mobile-12-whoami-chip-${label}.png` });
        if (chip) {
          await cp.tap('[data-testid=whoami-peel]');
          await cp.waitForSelector('[data-testid=whoami-chip]', { state: 'detached', timeout: 30000 }).catch(() => null);
          check(`Who Am I? (${label}): Peel it off removes the card and tells you the answer`, !(await cp.isVisible('[data-testid=whoami-chip]')) && (await cp.evaluate(() => window.__toybox.net.chat().lines.some((l) => l.text.startsWith('You peeled off')))));
        }
        check(`chat (${label}): no page errors`, cerr.length === 0, cerr.slice(0, 3).join(' | '));
        await cctx.close();
      }
    } finally {
      srv.kill('SIGTERM');
    }
  } else check('chat sheet: skipped (set CHAT_BASE_URL and CHAT_SERVER_PORT to an online build)', true);

  console.log(res.join('\n'));
  await browser.close();
})().catch(e => { console.log(res.join('\n')); console.error(e); process.exitCode = 1; });
