/* Online lobbies and server-run matches, end to end, on real browsers.
   Starts the built server (npm run server:build) itself on SERVER_PORT (default 2572) with
   MATCH_DEBUG=1 (lobby time scale for short matches) and in-memory accounts. The client build
   must point at it and be served separately, e.g.:
     VITE_SERVER_URL=ws://localhost:2572 npx vite build --outDir /tmp/lobby-dist
     setsid nohup npx vite preview --outDir /tmp/lobby-dist --port 4199 --strictPort &
     BASE_URL=http://localhost:4199/ node tests/e2e/lobby.cjs
   Flow: A hosts from the Pavilion; B sees the Hub alert and joins; C (a plain protocol client,
   no browser, to keep the software-rendering load down) joins and is kicked; A caps the lobby; A switches to one trial and starts; both play a short
   authoritative match to results and see the same placements; a Blitz tournament completes and
   reaches the leaderboard; a phone in portrait joins a lobby and hosts one.
   At most three browser contexts at once; waits on conditions, never fixed sleeps. */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const BASE = process.env.BASE_URL || 'http://localhost:4199/';
const PORT = Number(process.env.SERVER_PORT) || 2572;
const HTTP = `http://localhost:${PORT}`;
const T = +process.env.E2E_TIMEOUT || 600000; // generous: software rendering on a shared machine
const OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const res = [];
const check = (n, ok, d = '') => { res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); console.log(res[res.length - 1]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name), timeout: 240000, animations: 'disabled' }).then(() => console.log(`  screenshot ${name}`)).catch((e) => console.log(`  (screenshot ${name} failed: ${e.message.split('\n')[0]})`));

(async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '../../server-dist/index.cjs')], { env: { ...process.env, PORT: String(PORT), MATCH_DEBUG: '1', ACCOUNTS_STORE: 'memory' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  child.stdout.on('data', (d) => (serverLog += d));
  child.stderr.on('data', (d) => (serverLog += d));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${HTTP}/health`)).ok) break; } catch {} await sleep(100); }
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const open = async (name, ctxOpts = { viewport: { width: 1100, height: 680 } }) => {
    const ctx = await browser.newContext(ctxOpts);
    await ctx.addInitScript((n) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low', tutorials: false, contenderName: n }, version: 1 })); } }, name);
    const page = await ctx.newPage();
    page.setDefaultTimeout(T);
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(`${BASE}?debug#play`);
    // Software rendering on a shared machine: the first frames can take many minutes.
    await page.waitForSelector('.loading', { state: 'detached', timeout: 1500000 });
    await page.waitForFunction(() => window.__toybox?.net?.status() === 'online', null, { timeout: 300000, polling: 250 });
    page.ctx = ctx;
    return page;
  };
  /** A player without a browser: speaks the protocol over a WebSocket (the server can't tell). */
  const wsClient = (name) =>
    new Promise((resolve, reject) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(`ws://localhost:${PORT}/`, { origin: new URL(BASE).origin });
      const c = { ws, msgs: [], you: null, send: (m) => ws.send(JSON.stringify(m)) };
      c.waitFor = (pred, timeout = T) =>
        new Promise((ok, no) => {
          const t0 = Date.now();
          const tick = () => {
            const hit = c.msgs.find(pred);
            if (hit) return ok(hit);
            if (Date.now() - t0 > timeout) return no(new Error(`${name}: message never came`));
            setTimeout(tick, 100);
          };
          tick();
        });
      ws.on('message', (d) => {
        const m = JSON.parse(String(d));
        if (m.t !== 'snap') c.msgs.push(m);
        if (m.t === 'welcome') {
          c.you = m.you;
          resolve(c);
        }
      });
      ws.on('error', reject);
      ws.on('open', () => c.send({ t: 'hello', v: 3, name, look: { paint: 2, hat: 'none', keySkin: 'classic', back: 'none', face: 'none', neck: 'none' }, join: { kind: 'public' } }));
    });
  const lobby = (p) => p.evaluate(() => window.__toybox.lobby.current());
  const phase = (p) => p.evaluate(() => document.querySelector('[data-testid=online-match]')?.getAttribute('data-phase') ?? null);
  const waitPhase = (p, ph, timeout = T) => p.waitForFunction((ph) => document.querySelector('[data-testid=online-match]')?.getAttribute('data-phase') === ph, ph, { timeout, polling: 300 });
  const waitLobby = (p, f, arg, timeout = T) => p.waitForFunction(f, arg, { timeout, polling: 250 });
  try {
    const A = await open('Ticker');
    const B = await open('Bobbin');
    const C = await wsClient('Clank');
    const rooms = await Promise.all([A, B].map((p) => p.evaluate(() => window.__toybox.net.room())));
    const roomC = C.msgs.find((m) => m.t === 'welcome').room;
    check('three players are in the same public Hub', [...rooms, roomC].every((r) => r?.kind === 'public' && r.instance === rooms[0].instance), JSON.stringify([...rooms, roomC].map((r) => r?.instance)));

    // 1. A walks to the Pavilion: two choices, practise with bots or host an online lobby.
    const pav = (await A.evaluate(() => window.__toybox.interactables())).find((i) => i.id === 'pavilion');
    await A.evaluate((v) => window.__toybox.teleport(v.x, v.z, 0), pav);
    await A.waitForFunction(() => !!document.querySelector('.prompt'), null, { timeout: T, polling: 250 });
    await A.keyboard.press('KeyE');
    await A.waitForSelector('[data-testid=pavilion-host]');
    check('the Pavilion offers both choices', !!(await A.$('[data-testid=pavilion-practice]')) && !!(await A.$('[data-testid=pavilion-host]')));
    await A.click('[data-testid=pavilion-host]');
    await A.click('[data-testid=format-blitz]');
    await A.waitForSelector('[data-testid=host-tournament]:not([disabled])');
    await shot(A, 'lobby-01-pavilion-choice.png');
    await A.click('[data-testid=host-tournament]');
    await waitPhase(A, 'lobby', T);
    const L = await lobby(A);
    check('A hosts a Blitz tournament lobby and sees the lobby screen', L?.settings.mode === 'tournament' && L.settings.format === 'blitz' && L.hostId === (await A.evaluate(() => window.__toybox.net.selfId())), JSON.stringify(L?.settings));

    // 2. B, in the Hub, gets the alert and joins from it.
    await B.waitForSelector('[data-testid=lobby-alert]', { timeout: T });
    await shot(B, 'lobby-02-hub-alert.png');
    const alertText = await B.textContent('[data-testid=lobby-alert]');
    check('B sees the Hub alert "Ticker is hosting a Blitz tournament · 1/8"', /Ticker is hosting a Blitz tournament · 1\/8/.test(alertText), alertText);
    await B.click('[data-testid=lobby-alert-join]');
    await waitPhase(B, 'lobby', T);
    // C got the same alert, and joins with a protocol message.
    await C.waitFor((m) => m.t === 'lobbyAlert' && m.lobby.id === L.id);
    C.send({ t: 'lobby', a: 'join', id: L.id });
    await C.waitFor((m) => m.t === 'lobby' && m.lobby?.members.length === 3);
    await waitLobby(A, () => window.__toybox.lobby.current()?.members.length === 3);
    check('B joins from the alert, and C (alerted too) joins', (await lobby(A)).members.map((m) => m.name).join(',') === 'Ticker,Bobbin,Clank');
    await shot(A, 'lobby-03-host-controls-desktop.png');

    // 3. A kicks C and caps the lobby at 2.
    await A.click('[data-testid=kick-Clank]');
    await C.waitFor((m) => m.t === 'lobby' && m.lobby === null && m.reason === 'kicked');
    await waitLobby(A, () => window.__toybox.lobby.current()?.members.length === 2);
    check('A kicks C: C is told, the lobby has two members', true);
    C.send({ t: 'lobby', a: 'join', id: L.id });
    const refused = await C.waitFor((m) => m.t === 'lobbyErr');
    check('a kicked player cannot rejoin', refused.code === 'kicked', JSON.stringify(refused));
    await A.click('[data-testid=lobby-cap-2]');
    await waitLobby(B, () => window.__toybox.lobby.current()?.settings.cap === 2);
    const listC = (await C.waitFor((m) => m.t === 'lobbies' && m.list[0]?.cap === 2)).list;
    check('A caps the lobby at 2: everyone in the Hub sees 2/2', listC[0]?.players === 2 && listC[0].cap === 2, JSON.stringify(listC));
    C.ws.close();

    // 4. One trial: Copycat Conductor, picked from the card grid. A short authoritative match.
    await A.click('[data-testid=lobby-mode-single]');
    await A.waitForSelector('[data-testid=pick-copycat-conductor]');
    await A.click('[data-testid=pick-copycat-conductor]');
    await waitLobby(B, () => window.__toybox.lobby.current()?.settings.mode === 'single' && window.__toybox.lobby.current()?.settings.game === 'copycat-conductor');
    check('B sees the host switch to one trial (Copycat Conductor)', true);
    await A.evaluate(() => window.__toybox.lobby.timeScale(3));
    await A.click('[data-testid=lobby-start]');
    await Promise.all([waitPhase(A, 'playing'), waitPhase(B, 'playing')]);
    check('both clients enter the server-run match', true);
    // A plays a note once the server opens the input phase: the press must reach the server.
    await A.waitForFunction(() => window.__toybox.match.state()?.phase === 'input', null, { timeout: T, polling: 100 });
    await A.keyboard.press('KeyA');
    await A.waitForFunction(() => {
      const s = window.__toybox.match.state();
      const me = s?.players.find((p) => p.id === window.__toybox.net.selfId());
      return me && (me.progress > 0 || !me.alive);
    }, null, { timeout: T, polling: 100 });
    check("A's key press reached the server (progress or a wrong note, decided there)", true);
    const fuseless = await A.evaluate(() => window.__toybox.match.state()?.seed);
    check('the seed never reaches the client', fuseless === 0, String(fuseless));
    await shot(A, 'lobby-04-match-client-A.png');
    await shot(B, 'lobby-04-match-client-B.png');
    await Promise.all([waitPhase(A, 'results'), waitPhase(B, 'results')]);
    const placeA = await A.evaluate(() => JSON.stringify(window.__toybox.lobby.current().match.result.placements));
    const placeB = await B.evaluate(() => JSON.stringify(window.__toybox.lobby.current().match.result.placements));
    const domA = await A.$$eval('[data-testid=online-placements] li', (ls) => ls.map((l) => `${l.dataset.place}:${l.dataset.name}`).join(','));
    const domB = await B.$$eval('[data-testid=online-placements] li', (ls) => ls.map((l) => `${l.dataset.place}:${l.dataset.name}`).join(','));
    check('both see the same placements, from the server', placeA === placeB && domA === domB && domA.split(',').length === 2, `${domA} | ${domB}`);
    await shot(B, 'lobby-05-results.png');
    await A.click('[data-testid=online-continue]');
    await B.click('[data-testid=online-continue]');
    await Promise.all([waitPhase(A, 'lobby'), waitPhase(B, 'lobby')]);
    check('Continue from both brings everyone back to the lobby', true);

    // 5. A Blitz tournament with bot fill, sped up, to the final table.
    await A.click('[data-testid=lobby-mode-tournament]');
    await A.click('[data-testid=lobby-format-blitz]');
    await A.click('[data-testid=lobby-cap-4]');
    await waitLobby(A, () => { const s = window.__toybox.lobby.current()?.settings; return s?.mode === 'tournament' && s.cap === 4 && s.botFill; });
    await A.evaluate(() => window.__toybox.lobby.timeScale(25));
    await A.click('[data-testid=lobby-start]');
    const games = await A.waitForFunction(() => window.__toybox.lobby.current()?.match?.tournament?.games, null, { timeout: T, polling: 250 }).then((h) => h.jsonValue());
    check('the server picks three Blitz trials (never Toy Squad)', games.length === 3 && !games.includes('toy-squad'), games.join(', '));
    await Promise.all([A, B].map((p) => p.waitForFunction(() => window.__toybox.lobby.current()?.match?.phase === 'final', null, { timeout: T0, polling: 500 })));
    const fin = await A.evaluate(() => window.__toybox.lobby.current().match.tournament);
    check('the tournament completes: three trials scored for all four toys', fin.standings.length === 4 && fin.standings.every((s) => s.rounds.length === 3), JSON.stringify(fin.standings.map((s) => s.rounds)));
    await waitPhase(A, 'final', T);
    await shot(A, 'lobby-06-final.png');
    const board = await (await fetch(`${HTTP}/api/leaderboard?board=blitz`)).json().catch(() => null);
    const names = (board?.entries ?? []).map((e) => e.name);
    check('the finished tournament is on the leaderboard (server API)', names.includes('Ticker') && names.includes('Bobbin'), JSON.stringify(board?.entries));
    await A.click('[data-testid=online-final-continue]');
    await B.click('[data-testid=online-final-continue]');
    await Promise.all([waitPhase(A, 'lobby'), waitPhase(B, 'lobby')]);

    // 6. The leaderboard in the Hub: B leaves the lobby and reads the Scoreboard.
    await B.click('[data-testid=lobby-leave]');
    await B.waitForFunction(() => !document.querySelector('[data-testid=online-match]'), null, { timeout: T, polling: 250 });
    const sb = (await B.evaluate(() => window.__toybox.interactables())).find((i) => i.id === 'scoreboard');
    await B.evaluate((v) => window.__toybox.teleport(v.x, v.z, 0), sb);
    await B.waitForFunction(() => !!document.querySelector('.prompt'), null, { timeout: T, polling: 250 });
    await B.keyboard.press('KeyE');
    await B.waitForSelector('[data-testid=leaderboard-row-Ticker]', { timeout: T });
    check('the Hub Scoreboard shows the online leaderboard', true);
    await shot(B, 'lobby-07-leaderboard.png');
    await B.ctx.close();

    // 7. A phone in portrait joins A's lobby, then hosts one of its own.
    const D = await open('Dottie', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await D.waitForSelector('[data-testid=lobbies-button]');
    await D.tap('[data-testid=lobbies-button]');
    await D.tap(`[data-testid=lobby-join-${L.id}]`);
    await waitPhase(D, 'lobby', T);
    await waitLobby(A, () => window.__toybox.lobby.current()?.members.some((m) => m.name === 'Dottie'));
    check('a phone in portrait joins the lobby', true);
    const noScroll = await D.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check('the lobby screen fits the phone (no sideways scrolling)', noScroll);
    await shot(D, 'lobby-08-phone-lobby.png');
    await D.tap('[data-testid=lobby-leave]');
    await D.waitForFunction(() => !document.querySelector('[data-testid=online-match]'), null, { timeout: T, polling: 250 });
    await D.evaluate(() => window.__toybox.lobby.host({ mode: 'single', game: 'wind-up-dash', format: 'blitz', cap: 6, locked: false, botFill: true, difficulty: 'normal' }));
    await waitPhase(D, 'lobby', T);
    await D.waitForSelector('[data-testid=pick-wind-up-dash]');
    const big = await D.$$eval('[data-testid^=lobby-cap-], [data-testid^=pick-], [data-testid=lobby-start]', (els) => els.filter((e) => e.getBoundingClientRect().height > 0).every((e) => e.getBoundingClientRect().height >= 55));
    check('host controls on the phone are at least 56 px tall', big);
    await shot(D, 'lobby-09-phone-host-controls.png');
    await D.evaluate(() => document.querySelector('[data-testid=pick-wind-up-dash]').scrollIntoView());
    await shot(D, 'lobby-10-phone-game-grid.png');
  } catch (e) {
    check('flow completed', false, e.message.split('\n')[0]);
  } finally {
    check('no page errors', errors.length === 0, errors.join(' | '));
    await browser.close();
    child.kill('SIGTERM');
    if (res.some((r) => r.startsWith('FAIL'))) console.log(serverLog.split('\n').slice(-30).join('\n'));
    console.log(`\n${res.filter((r) => r.startsWith('PASS')).length}/${res.length} passed`);
    process.exit(res.some((r) => r.startsWith('FAIL')) ? 1 : 0);
  }
})();
