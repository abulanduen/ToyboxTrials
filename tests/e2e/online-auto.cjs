/* Automatic public online Hub: entering the Hub joins it; Leave keeps you offline for the session;
   the Settings switch turns it off. Starts the built server (npm run server:build) on SERVER_PORT
   (default 2567); the client build must point at it:
     VITE_SERVER_URL=ws://localhost:2567 npx vite build --outDir /tmp/online-dist
     BASE_URL=http://localhost:4190/ node tests/e2e/online-auto.cjs */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const BASE = process.env.BASE_URL || 'http://localhost:4190/';
const PORT = Number(process.env.SERVER_PORT) || 2567;
const HTTP = `http://localhost:${PORT}`;
const T = +process.env.E2E_TIMEOUT || 240000;
const res = [];
const check = (n, ok, d = '') => { res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); console.log(res[res.length - 1]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '../../server-dist/index.cjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${HTTP}/health`)).ok) break; } catch {} await sleep(100); }
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const open = async (name, hash, extra = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
    await ctx.addInitScript(([n, extra]) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, quality: 'low', tutorials: false, contenderName: n, ...extra }, version: 1 })); } }, [name, extra]);
    const page = await ctx.newPage();
    page.setDefaultTimeout(T);
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(`${BASE}?debug${hash}`);
    await page.waitForSelector('.loading', { state: 'detached', timeout: 600000 });
    return page;
  };
  const status = (p) => p.evaluate(() => window.__toybox.net.status());
  const waitStatus = (p, s, timeout = 60000) => p.waitForFunction((s) => window.__toybox.net.status() === s, s, { timeout, polling: 250 });
  try {
    // 1. Straight into the Hub (#play): joins the public Hub with no clicks.
    const A = await open('AutoA', '#play');
    await waitStatus(A, 'online');
    const room = await A.evaluate(() => window.__toybox.net.room());
    check('opening the Hub joins the public online Hub automatically', room?.kind === 'public', JSON.stringify(room));

    // 2. From the main menu: pressing Play joins too, and both see each other.
    const B = await open('AutoB', '');
    check('the main menu itself stays offline', (await status(B)) === 'offline');
    await B.keyboard.press('Enter'); // the menu's Play
    await waitStatus(B, 'online');
    await B.waitForFunction(() => [...document.querySelectorAll('.name-tag__name')].some((e) => e.textContent === 'AutoA'), null, { timeout: 120000, polling: 500 });
    await A.waitForFunction(() => [...document.querySelectorAll('.name-tag__name')].some((e) => e.textContent === 'AutoB'), null, { timeout: 120000, polling: 500 });
    check('pressing Play joins, and the two players see each other', true);

    // 3. Leave keeps B offline for the rest of the session, even after a menu round trip.
    await B.click('[data-testid=online-leave]');
    await waitStatus(B, 'offline');
    await B.waitForTimeout(1500);
    check('Leave stays offline', (await status(B)) === 'offline');
    await A.context().close();
    await B.context().close(); // software rendering: keep at most two pages open

    // 4. The Settings switch off: entering the Hub stays offline.
    const C = await open('AutoC', '#play', { autoOnline: false });
    await C.waitForTimeout(3000);
    check('with "Join the online Hub automatically" off, the Hub stays offline', (await status(C)) === 'offline');
    await C.context().close();

    // 5. A room link still goes to that room, not the public Hub.
    const hostCtx = await open('AutoHost', '');
    await hostCtx.click('[data-testid=menu-online]');
    await hostCtx.click('[data-testid=online-host]');
    await waitStatus(hostCtx, 'online');
    const code = (await hostCtx.evaluate(() => window.__toybox.net.room())).code;
    const D = await open('AutoD', `#room=${code}`);
    await waitStatus(D, 'online');
    const droom = await D.evaluate(() => window.__toybox.net.room());
    check('a #room= link joins that private room, not the public Hub', droom?.kind === 'private' && droom.code === code, JSON.stringify(droom));
  } catch (e) {
    check('flow completed', false, e.message.split('\n')[0]);
  } finally {
    check('no page errors', errors.length === 0, errors.join(' | '));
    await browser.close();
    child.kill();
    if (res.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
  }
})();
