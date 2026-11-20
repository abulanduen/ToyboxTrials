/* Optional accounts, end to end: the real server (server-dist/index.cjs, started here on port 2570)
   and a preview build of the client pointed at it.
     VITE_SERVER_URL=ws://localhost:2570 npx vite build --outDir /tmp/acct-dist
     setsid nohup npx vite preview --outDir /tmp/acct-dist --port 4198 --strictPort &
     npm run server:build
     BASE_URL=http://localhost:4198/ node tests/e2e/account.cjs      (ONLY=desktop|portrait|landscape|off runs one part)
   The server keeps accounts in memory, or uses PostgreSQL when ACCOUNT_DATABASE_URL is set.
   desktop and portrait (phone, real touch), each with its own account:
     1. a guest earns cogs (an old save's secrets pay 160 when migrated, then a practice trial sped up
        with the ?debug match.timeScale hook);
     2. pause menu → Account → Create account: the merge keeps the guest's cogs, the server has them;
     3. buy a scarf at the shop: the change is saved to the account;
     4. a fresh browser context signs in from the main menu: same cogs, owns the scarf, nickname =
        username;
     5. sign out there: the guest copy stays and play still works;
     6. delete the account (first context): the server forgets it.
   landscape (phone): the sheet fits, every button is ≥ 56 px, sign in and out.
   off: the server restarted without accounts: the Account entries are hidden and play works.
   Plus raw HTTP checks: health, CORS preflight, refused origin, body limit.
   Software rendering is slow: page loads wait up to LOAD_TIMEOUT (default 10 min). */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4198/';
const ORIGIN = new URL(BASE).origin;
const PORT = Number(process.env.SERVER_PORT) || 2570; // the client build must use the same port in VITE_SERVER_URL
const API = `http://localhost:${PORT}`;
const DB = process.env.ACCOUNT_DATABASE_URL || '';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const T = +process.env.E2E_TIMEOUT || 240000;
const LOAD_T = +process.env.LOAD_TIMEOUT || 600000;
const KEY = 'toybox-trials:prototype:v1';
const ACCOUNT_KEY = 'toybox-trials:account';
const res = [];
const check = (n, ok, d = '') => {
  res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
  console.log(res[res.length - 1]);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (s) => Number(String(s ?? '').replace(/[^0-9-]/g, ''));
const RUN = Date.now().toString(36).slice(-5);

const phone = (w, h) => ({ viewport: { width: w, height: h }, screen: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' });
const DEVICES = {
  desktop: { opts: { viewport: { width: 1280, height: 720 } }, touch: false },
  portrait: { opts: phone(390, 844), touch: true },
  landscape: { opts: phone(844, 390), touch: true },
};

// ---------------------------------------------------------------- server
let server = null;
/** Every line any server printed, and every username/password used: the logs must not contain them. */
const allLogs = [];
const SECRETS = [];
async function startServer(withAccounts = true) {
  try {
    await fetch(`${API}/health`);
    throw new Error(`port ${PORT} is already in use: stop the other server first`);
  } catch (e) {
    if (String(e.message).includes('already in use')) throw e;
  }
  const env = { ...process.env, PORT: String(PORT) };
  delete env.DATABASE_URL;
  delete env.ACCOUNTS_STORE;
  if (withAccounts) {
    if (DB) env.DATABASE_URL = DB;
    else env.ACCOUNTS_STORE = 'memory';
  }
  const child = spawn(process.execPath, [path.join(__dirname, '../../server-dist/index.cjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = [];
  child.stdout.on('data', (d) => (log.push(String(d)), allLogs.push(String(d))));
  child.stderr.on('data', (d) => (log.push(String(d)), allLogs.push(String(d))));
  for (let i = 0; i < 200; i++) {
    try {
      const r = await fetch(`${API}/health`);
      const h = await r.json();
      if (r.ok && (!withAccounts || h.accounts === (DB ? 'postgres' : 'memory'))) return (server = { child, log });
    } catch {}
    await sleep(100);
  }
  child.kill();
  throw new Error('server did not start (run npm run server:build first): ' + log.join(''));
}
async function stopServer() {
  if (!server) return;
  const { child } = server;
  server = null;
  await new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(resolve, 5000);
  });
}
const api = async (method, p, body, token, headers = {}) => {
  const r = await fetch(API + p, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await r.json();
  } catch {}
  return { status: r.status, json, headers: r.headers };
};

// ---------------------------------------------------------------- browser helpers
async function openPage(browser, dev, seed) {
  const { opts, touch } = DEVICES[dev];
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(
    ([key, state]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(key, JSON.stringify(state));
    },
    [KEY, seed],
  );
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // A refused request (401 wrong password, 409 taken) is logged by the browser as a console error.
    if (m.type() === 'error' && !/status of (401|409|429)/.test(m.text())) errors.push(m.text());
  });
  const press = async (sel) => {
    await page.locator(sel).scrollIntoViewIfNeeded();
    return touch ? page.tap(sel) : page.click(sel);
  };
  const type = async (sel, text) => {
    await page.locator(sel).scrollIntoViewIfNeeded();
    await page.fill(sel, text);
  };
  const shot = (file) => page.screenshot({ path: path.join(OUT, file), timeout: T });
  const store = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').state || {}, KEY);
  const acct = () => page.evaluate(() => window.__toybox.account.state());
  const session = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), ACCOUNT_KEY);
  const settle = (sel) => page.waitForFunction((s) => [...document.querySelectorAll(s)].every((el) => el.getAnimations({ subtree: true }).every((a) => a.playState === 'finished')), sel, { timeout: 30000 }).catch(() => null);
  /** Wait until the account layer has saved (and, optionally, reached a revision). */
  const synced = (minRev = 0) => page.waitForFunction((r) => { const s = window.__toybox.account.state(); return s.signedIn && s.sync === 'saved' && s.rev >= r; }, minRev, { timeout: 60000, polling: 250 }).then(() => true, () => false);
  return { ctx, page, touch, errors, press, type, shot, store, acct, session, settle, synced };
}

/** Every visible button (and input) in `sel` at least 56 × 56 px, and the panel inside the screen. */
async function layoutOf(page, sel) {
  return page.evaluate((s) => {
    const panel = document.querySelector(s);
    const small = [...panel.querySelectorAll('button, input:not([type=hidden]):not([hidden])')]
      .filter((b) => b.offsetParent)
      .map((b) => ({ t: (b.textContent || b.getAttribute('name') || '').trim().slice(0, 16), w: b.offsetWidth, h: b.offsetHeight }))
      .filter((b) => b.h < 56 || (b.w < 56 && b.t));
    const r = panel.getBoundingClientRect();
    return { small, inside: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, docScroll: document.scrollingElement.scrollWidth - innerWidth };
  }, sel);
}

const V0_SAVE = { state: { tourSeen: true, quality: 'low', tutorials: false, contenderName: 'Guesty', paintIndex: 1, secretsFound: ['musicbox', 'marble', 'jack', 'key'] }, version: 0 };
const FRESH = { state: { tourSeen: true, quality: 'low', tutorials: false }, version: 1 };

// ---------------------------------------------------------------- the main flow
async function flow(browser, dev) {
  const user = `${dev === 'desktop' ? 'Desk' : 'Phone'}_${RUN}`;
  const password = `wind-up ${RUN} key`;
  SECRETS.push(user, user.toLowerCase(), password);
  // ------------------------------------------------------------ 1. a guest earns cogs
  const A = await openPage(browser, dev, V0_SAVE);
  await A.page.goto(BASE + '?debug#play');
  await A.page.waitForSelector('.loading', { state: 'detached', timeout: LOAD_T });
  await A.page.waitForSelector('[data-testid=hud-cogs]');
  check(`${dev}: guest: the old save's secrets pay 160 cogs`, num(await A.page.textContent('[data-testid=hud-cogs]')) === 160);
  await A.page.evaluate(() => {
    window.__toybox.match.timeScale(40);
    window.__toybox.match.practice('copycat-conductor');
  });
  await A.page.waitForSelector('[data-testid=match-start]', { timeout: T });
  await sleep(900);
  await A.press('[data-testid=match-start]');
  await A.page.waitForSelector('.results', { timeout: LOAD_T });
  await A.page.evaluate(() => window.__toybox.match.timeScale(1));
  await sleep(900);
  await A.press('[data-testid=results-leave]');
  await A.page.waitForSelector('[data-testid=hud-cogs]');
  const guestCogs = (await A.store()).profile.wallet.cogs;
  check(`${dev}: guest: a practice trial earns cogs`, guestCogs > 160, `wallet ${guestCogs}`);

  // ------------------------------------------------------------ 2. pause menu → Account → Create account
  if (A.touch) await A.page.tap('.touch-pause');
  else await A.page.keyboard.press('Escape');
  await A.page.waitForSelector('[data-testid=setting-account]');
  check(`${dev}: the pause menu has an Account row (guest)`, /guest/.test(await A.page.textContent('[data-testid=setting-account]')));
  await A.press('[data-testid=setting-account-open]');
  await A.page.waitForSelector('[data-testid=account-sheet]');
  await A.settle('.account-sheet');
  await A.press('[data-testid=account-tab-register]');
  const ac = await A.page.evaluate(() => ({ u: document.querySelector('[data-testid=account-username]').autocomplete, p: document.querySelector('[data-testid=account-password]').autocomplete }));
  check(`${dev}: password-manager autocomplete attributes (username, new-password)`, ac.u === 'username' && ac.p === 'new-password', JSON.stringify(ac));
  // A too-short password is caught before anything is sent.
  await A.type('[data-testid=account-username]', user);
  await A.type('[data-testid=account-password]', 'short');
  await A.press('[data-testid=account-submit]');
  await A.page.waitForSelector('[data-testid=account-error]');
  check(`${dev}: a short password is refused with a clear message`, /at least 8/.test(await A.page.textContent('[data-testid=account-error]')));
  await A.type('[data-testid=account-password]', password);
  const lay = await layoutOf(A.page, '.account-sheet');
  check(`${dev}: account sheet: buttons and fields ≥ 56 px, inside the screen, no sideways scroll`, !lay.small.length && lay.inside && lay.docScroll <= 0, JSON.stringify(lay));
  await A.shot(`account-01-${dev}-create.png`);
  if (A.touch) await A.page.tap('[data-testid=account-submit]');
  else await A.page.keyboard.press('Enter'); // Enter submits the form
  await A.page.waitForSelector('[data-testid=account-signed-in]', { timeout: T });
  check(`${dev}: account created and signed in`, (await A.page.textContent('[data-testid=account-signed-in]')).includes(user));
  const created = await A.synced(1);
  const note = (await A.page.textContent('[data-testid=account-notice]').catch(() => '')) || '';
  check(`${dev}: one line says what happened to the guest toy`, /Account created with this device's toy/.test(note) && note.includes(`${guestCogs} cogs`), note);
  const sess = await A.session();
  if (sess?.token) SECRETS.push(sess.token);
  check(`${dev}: the token is kept under its own key, not in the game store`, !!sess?.token && !JSON.stringify(await A.store()).includes(sess.token));
  const me1 = await api('GET', '/api/me', null, sess.token);
  check(`${dev}: merge kept the guest's cogs: the server has them`, created && me1.status === 200 && me1.json.profile?.wallet.cogs === guestCogs, JSON.stringify(me1.json?.profile?.wallet));
  check(`${dev}: and the secrets the guest found`, (me1.json.profile?.secretsPaid ?? []).length === 4);
  await A.shot(`account-02-${dev}-signed-in.png`);
  await A.press('[data-testid=account-close]');

  // ------------------------------------------------------------ 3. buy a scarf: saved to the account
  await A.page.waitForSelector('[data-testid=pause-shop]');
  await A.press('[data-testid=pause-shop]');
  await A.page.waitForSelector('[data-testid=shop]', { timeout: T });
  await A.settle('.workshop-panel');
  await A.press('[data-testid=shop-tab-accessory]');
  await A.press('[data-testid=shop-item-scarf]');
  await A.page.waitForSelector('[data-testid=shop-buy]');
  const price = num(await A.page.textContent('[data-testid=shop-buy]'));
  await A.press('[data-testid=shop-buy]');
  await A.page.waitForFunction(() => /Bought/.test(document.querySelector('[data-testid=shop-note]')?.textContent ?? ''), null, { timeout: T });
  await A.press('[data-testid=shop-equip]');
  const afterBuy = guestCogs - price;
  const savedBuy = await A.page
    .waitForFunction((c) => { const s = window.__toybox.account.state(); return s.sync === 'saved' && s.rev >= 2 && JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.profile.wallet.cogs === c; }, afterBuy, { timeout: 60000, polling: 250 })
    .then(() => true, () => false);
  const me2 = await api('GET', '/api/me', null, sess.token);
  check(`${dev}: buying is saved to the account (about 2 s later)`, savedBuy && me2.json.profile?.wallet.cogs === afterBuy && !!me2.json.profile?.owned?.scarf && me2.json.profile?.loadout?.neck === 'scarf', JSON.stringify({ cogs: me2.json.profile?.wallet.cogs, want: afterBuy, rev: me2.json.rev }));
  await A.press('[data-testid=shop-done]');
  await A.page.waitForSelector('.hud-sign');

  // ------------------------------------------------------------ 4. a fresh browser signs in from the main menu
  const B = await openPage(browser, dev, FRESH);
  await B.page.goto(BASE + '?debug');
  await B.page.waitForSelector('.loading', { state: 'detached', timeout: LOAD_T });
  await B.page.waitForSelector('[data-testid=menu-account]', { timeout: 60000 });
  check(`${dev}: fresh browser: the main menu shows "Sign in"`, (await B.page.textContent('[data-testid=menu-account]')).trim() === 'Sign in');
  const btn = await B.page.$eval('[data-testid=menu-account]', (b) => ({ w: b.offsetWidth, h: b.offsetHeight }));
  check(`${dev}: the menu Account button is at least 56 px`, btn.w >= 56 && btn.h >= 56, JSON.stringify(btn));
  await B.shot(`account-03-${dev}-menu.png`);
  await B.press('[data-testid=menu-account]');
  await B.page.waitForSelector('[data-testid=account-username]');
  await B.settle('.account-sheet');
  check(`${dev}: sign-in form uses current-password`, (await B.page.$eval('[data-testid=account-password]', (i) => i.autocomplete)) === 'current-password');
  await B.type('[data-testid=account-username]', user.toLowerCase()); // usernames are case-insensitive
  await B.type('[data-testid=account-password]', 'not the password');
  await B.press('[data-testid=account-submit]');
  await B.page.waitForSelector('[data-testid=account-error]');
  check(`${dev}: a wrong password gets the generic message`, (await B.page.textContent('[data-testid=account-error]')).includes('Wrong username or password'));
  await B.type('[data-testid=account-password]', password);
  await B.press('[data-testid=account-submit]');
  await B.page.waitForSelector('[data-testid=account-signed-in]', { timeout: T });
  await B.page.waitForFunction((c) => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1') || '{}').state?.profile?.wallet?.cogs === c, afterBuy, { timeout: 30000 }).catch(() => null);
  const bState = await B.store();
  const bNote = (await B.page.textContent('[data-testid=account-notice]').catch(() => '')) || '';
  check(`${dev}: signed in elsewhere: the same cogs and the scarf`, bState.profile?.wallet.cogs === afterBuy && !!bState.profile?.owned?.scarf && bState.profile?.loadout?.neck === 'scarf', JSON.stringify({ cogs: bState.profile?.wallet.cogs, want: afterBuy }));
  check(`${dev}: …and the four secrets`, (bState.secretsFound ?? []).length === 4, JSON.stringify(bState.secretsFound));
  check(`${dev}: the notice says the account's toy was loaded`, /loaded your account's toy/.test(bNote), bNote);
  check(`${dev}: the online nickname defaults to the username`, bState.contenderName === user);
  await B.shot(`account-04-${dev}-signed-in-elsewhere.png`);
  await B.press('[data-testid=account-close]');
  await B.page.waitForFunction((c) => Number((document.querySelector('[data-testid=menu-cogs]')?.textContent || '').replace(/\D/g, '')) === c, afterBuy, { timeout: 30000 }).catch(() => null);
  check(`${dev}: the menu shows the account's cogs and the username`, num(await B.page.textContent('[data-testid=menu-cogs]')) === afterBuy && (await B.page.textContent('[data-testid=menu-account]')).includes(user));

  // ------------------------------------------------------------ 5. sign out: play still works
  await B.press('[data-testid=menu-account]');
  await B.page.waitForSelector('[data-testid=account-signout]');
  await B.press('[data-testid=account-signout]');
  await B.page.waitForSelector('[data-testid=account-tab-login]', { timeout: 30000 });
  check(`${dev}: signed out: the session is gone from this browser`, (await B.session()) === null && /Signed out/.test((await B.page.textContent('[data-testid=account-notice]')) || ''));
  const meOut = await api('GET', '/api/me', null, (await A.session()).token);
  check(`${dev}: …and only that session ended (the first browser is still signed in)`, meOut.status === 200);
  await B.press('[data-testid=account-close]');
  await B.press('[data-testid=menu-play]');
  await B.page.waitForSelector('[data-testid=hud-cogs]', { timeout: T });
  const playing = await B.page.evaluate(() => !!window.__toybox.state());
  check(`${dev}: after signing out, Play still works and keeps a guest copy`, playing && num(await B.page.textContent('[data-testid=hud-cogs]')) === afterBuy);
  check(`${dev}: no page errors in the second browser`, B.errors.length === 0, B.errors.slice(0, 3).join(' | '));
  await B.ctx.close();

  // ------------------------------------------------------------ 6. delete the account
  if (A.touch) await A.page.tap('.touch-pause');
  else await A.page.keyboard.press('Escape');
  await A.page.waitForSelector('[data-testid=setting-account-open]');
  check(`${dev}: the pause menu Account row shows the username`, (await A.page.textContent('[data-testid=setting-account]')).includes(user));
  await A.press('[data-testid=setting-account-open]');
  await A.press('[data-testid=account-delete]');
  await A.page.waitForSelector('[data-testid=account-delete-password]');
  await A.type('[data-testid=account-delete-password]', 'wrong one');
  await A.press('[data-testid=account-delete-confirm]');
  await A.page.waitForSelector('[data-testid=account-error]');
  check(`${dev}: delete needs the right password`, /Wrong password/.test(await A.page.textContent('[data-testid=account-error]')));
  await A.type('[data-testid=account-delete-password]', password);
  await A.shot(`account-05-${dev}-delete.png`);
  await A.press('[data-testid=account-delete-confirm]');
  await A.page.waitForSelector('[data-testid=account-tab-login]', { timeout: 30000 });
  check(`${dev}: account deleted: signed out with a clear note`, /deleted/.test((await A.page.textContent('[data-testid=account-notice]')) || '') && (await A.session()) === null);
  const login = await api('POST', '/api/login', { username: user, password });
  const meGone = await api('GET', '/api/me', null, sess.token);
  check(`${dev}: the server forgot it (login and the old token both refused)`, login.status === 401 && meGone.status === 401, `${login.status} ${meGone.status}`);
  check(`${dev}: the device keeps its guest toy`, (await A.store()).profile?.wallet.cogs === afterBuy);
  check(`${dev}: no page errors in the first browser`, A.errors.length === 0, A.errors.slice(0, 3).join(' | '));
  await A.ctx.close();
}

// ---------------------------------------------------------------- landscape: layout, sign in, sign out
async function landscape(browser) {
  const user = `Land_${RUN}`;
  const password = `landscape ${RUN}`;
  SECRETS.push(user, password);
  const reg = await api('POST', '/api/register', { username: user, password });
  check('landscape: account made through the API', reg.status === 201);
  const L = await openPage(browser, 'landscape', FRESH);
  await L.page.goto(BASE + '?debug');
  await L.page.waitForSelector('.loading', { state: 'detached', timeout: LOAD_T });
  await L.page.waitForSelector('[data-testid=menu-account]', { timeout: 60000 });
  await L.press('[data-testid=menu-account]');
  await L.page.waitForSelector('[data-testid=account-username]');
  await L.settle('.account-sheet');
  const lay = await layoutOf(L.page, '.account-sheet');
  check('landscape: account sheet buttons and fields ≥ 56 px, no sideways scroll', !lay.small.length && lay.docScroll <= 0, JSON.stringify(lay));
  await L.shot('account-06-landscape-sheet.png');
  await L.type('[data-testid=account-username]', user);
  await L.type('[data-testid=account-password]', password);
  await L.press('[data-testid=account-submit]');
  await L.page.waitForSelector('[data-testid=account-signed-in]', { timeout: T });
  check('landscape: signed in', await L.synced(1));
  check('landscape: signing in to a never-saved account says "Signed in"', /^Signed in/.test((await L.page.textContent('[data-testid=account-notice]')) || ''));
  const lay2 = await layoutOf(L.page, '.account-sheet');
  check('landscape: signed-in sheet buttons ≥ 56 px', !lay2.small.length, JSON.stringify(lay2.small));
  await L.shot('account-07-landscape-signed-in.png');
  await L.press('[data-testid=account-signout]');
  await L.page.waitForSelector('[data-testid=account-tab-login]', { timeout: 30000 });
  check('landscape: signed out', (await L.session()) === null);
  check('landscape: no page errors', L.errors.length === 0, L.errors.slice(0, 3).join(' | '));
  await L.ctx.close();
  await api('DELETE', '/api/account', { password }, reg.json.token);
}

// ---------------------------------------------------------------- raw HTTP
async function http() {
  const h = await (await fetch(`${API}/health`)).json();
  check(`http: /health reports accounts (${h.accounts})`, h.ok === true && h.accounts === (DB ? 'postgres' : 'memory'));
  const pre = await fetch(`${API}/api/me`, { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
  check('http: CORS preflight from the game origin', pre.status === 204 && pre.headers.get('access-control-allow-origin') === ORIGIN && /authorization/.test(pre.headers.get('access-control-allow-headers') || ''));
  const evil = await api('GET', '/api/status', null, null, { origin: 'https://evil.example' });
  check('http: another origin is refused (403, no CORS header)', evil.status === 403 && !evil.headers.get('access-control-allow-origin'));
  const big = await fetch(`${API}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'x', password: 'y'.repeat(40000) }) }).catch(() => ({ status: 'closed' }));
  check('http: an oversized body is refused (413)', big.status === 413 || big.status === 'closed', String(big.status));
  const st = await api('GET', '/api/status');
  check('http: /api/status says accounts are on', st.status === 200 && st.json.accounts === true);
}

// ---------------------------------------------------------------- accounts off
async function off(browser) {
  await stopServer();
  await startServer(false);
  const h = await (await fetch(`${API}/health`)).json();
  const st = await api('GET', '/api/status');
  const reg = await api('POST', '/api/register', { username: 'Nobody_Off', password: 'long enough' });
  check('off: without a database /health says accounts are off and the API answers 503', h.accounts === 'off' && st.json.accounts === false && reg.status === 503, `${h.accounts} ${reg.status}`);
  const O = await openPage(browser, 'portrait', FRESH);
  await O.page.goto(BASE + '?debug');
  await O.page.waitForSelector('.loading', { state: 'detached', timeout: LOAD_T });
  await O.page.waitForSelector('[data-testid=menu-play]');
  await O.page.waitForFunction(() => window.__toybox.account.state().availability === 'off', null, { timeout: 60000 }).catch(() => null);
  check('off: the main menu hides the Account button', !(await O.page.isVisible('[data-testid=menu-account]')));
  await O.press('[data-testid=menu-settings]');
  await O.page.waitForSelector('.pause__grid');
  check('off: Settings has no Account row', !(await O.page.isVisible('[data-testid=setting-account]')));
  await O.page.keyboard.press('Escape');
  await O.press('[data-testid=menu-play]');
  await O.page.waitForSelector('[data-testid=hud-cogs]', { timeout: T });
  check('off: play works as a guest', await O.page.evaluate(() => !!window.__toybox.state()));
  check('off: no page errors', O.errors.length === 0, O.errors.slice(0, 3).join(' | '));
  await O.ctx.close();
}

(async () => {
  const only = process.env.ONLY;
  await startServer(true);
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (!only) await http();
    for (const dev of ['desktop', 'portrait']) {
      if (only && only !== dev) continue;
      try {
        await flow(browser, dev);
      } catch (e) {
        check(`${dev}: account e2e ran to the end`, false, e.stack || String(e));
      }
    }
    if (!only || only === 'landscape') {
      try {
        await landscape(browser);
      } catch (e) {
        check('landscape: ran to the end', false, e.stack || String(e));
      }
    }
    if (!only || only === 'off') {
      try {
        await off(browser);
      } catch (e) {
        check('off: ran to the end', false, e.stack || String(e));
      }
    }
  } finally {
    await browser.close();
    await stopServer();
    const log = allLogs.join('');
    const leaked = SECRETS.filter((x) => log.includes(x));
    check('server logs carry no usernames or passwords', leaked.length === 0, leaked.join(', '));
    fs.writeFileSync(path.join(OUT, 'account-server.log'), log);
    console.log('\n' + res.join('\n'));
    const failed = res.filter((r) => r.startsWith('FAIL')).length;
    console.log(`\n${res.length - failed}/${res.length} passed`);
    process.exit(failed ? 1 : 0);
  }
})();
