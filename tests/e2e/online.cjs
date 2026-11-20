/* Online Hub, end to end: the real server (server-dist/index.cjs, started here on port 2567)
   and a preview build of the client pointed at it.
     VITE_SERVER_URL=ws://localhost:2567 npx vite build --outDir /tmp/online-dist
     npx vite preview --outDir /tmp/online-dist --port 4190 --strictPort &
     npm run server:build
     BASE_URL=http://localhost:4190/ node tests/e2e/online.cjs
   Desktop: A hosts a private room, B joins with the code, C through a #room= link; name tags,
   movement, emotes, hub play (B sees the marble A kicks; A picks up, throws and sinks the
   basketball; a goal), reconnect, leave, errors, public Hub. B's save owns shop items (a cape, a
   monocle and the Dance gesture on key 4): A must see B's accessories and B's bought gesture. Phones (portrait + landscape, touch):
   join the public Hub and use the Emote menu. Raw-socket checks: health, origin, version, limits.
   Software rendering is slow: page loads wait up to LOAD_TIMEOUT (default 10 min). */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4190/';
const ORIGIN = new URL(BASE).origin;
const PORT = Number(process.env.SERVER_PORT) || 2567; // the client build must use the same port in VITE_SERVER_URL
const HTTP = `http://localhost:${PORT}`;
const WS = `ws://localhost:${PORT}`;
const T = +process.env.E2E_TIMEOUT || 240000;
/** Several WebGL pages share a software renderer: the 2nd/3rd page can take minutes to draw its first frames. */
const LOAD_T = +process.env.LOAD_TIMEOUT || 600000;
const res = [];
const check = (n, ok, d = '') => {
  res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
  console.log(res[res.length - 1]);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** The protocol version this test expects (src/net/protocol.ts PROTOCOL_VERSION). */
const PROTO = 4; // v4: hub play (the shared marble and basketball)

// ---------------------------------------------------------------- server
async function startServer() {
  try {
    await fetch(`${HTTP}/health`);
    throw new Error(`port ${PORT} is already in use: stop the other server first`);
  } catch (e) {
    if (String(e.message).includes('already in use')) throw e;
  }
  // MATCH_DEBUG: a test server (lets the hub play test place the marble in front of a net)
  const child = spawn(process.execPath, [path.join(__dirname, '../../server-dist/index.cjs')], { env: { ...process.env, PORT: String(PORT), MATCH_DEBUG: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${HTTP}/health`);
      if (r.ok) return { child, log };
    } catch {}
    await sleep(100);
  }
  child.kill();
  throw new Error('server did not start (run npm run server:build first): ' + log.join(''));
}

/** Raw socket helper: resolves with the messages received and how it closed. */
function rawSession(url, opts, sends, waitMs = 1500) {
  return new Promise((resolve) => {
    const msgs = [];
    let status = null;
    const ws = new WebSocket(url, opts);
    ws.on('unexpected-response', (_req, r) => {
      status = r.statusCode;
      resolve({ msgs, status, code: null });
    });
    ws.on('error', () => {});
    ws.on('open', () => sends.forEach((s) => ws.send(typeof s === 'string' ? s : JSON.stringify(s))));
    ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
    ws.on('close', (code) => resolve({ msgs, status, code }));
    setTimeout(() => {
      ws.terminate();
      resolve({ msgs, status, code: 'open' });
    }, waitMs);
  });
}

// ---------------------------------------------------------------- browser helpers
const errors = [];
/** Each test player wears different (free) cosmetics, so the screenshots show them carried across. */
const LOOKS = { Alpha: [0, 'none', 'classic'], Bravo: [1, 'thimble', 'heart'], Charlie: [2, 'bottlecap', 'classic'], Delta: [3, 'thimble', 'heart'], Echo: [4, 'bottlecap', 'heart'] };
/**
 * Bravo's save is a current (version 1) profile that has bought a cape, a monocle and the Dance
 * gesture at the shop and wears them (Dance on key 4). Everyone else starts from an old
 * (version 0) save, which the game migrates.
 */
const BRAVO_PROFILE = {
  schema: 1,
  wallet: { cogs: 40, earned: 450, spent: 410 },
  owned: { cape: { source: 'shop', at: 1 }, monocle: { source: 'shop', at: 1 }, dance: { source: 'shop', at: 1 } },
  loadout: { paint: 'coral-clank', hat: 'thimble', keySkin: 'heart', back: 'cape', face: 'monocle', neck: 'none', gestures: ['wave', 'cheer', 'spin', 'dance'] },
  firstWinDay: null,
  secretsPaid: [],
  achievements: [],
};
async function openPage(browser, name, ctxOpts, url = BASE + '?debug') {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(([n, look, profile]) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      const [paintIndex, hat, keySkin] = look;
      const save = profile
        ? { state: { quality: 'low', tutorials: false, contenderName: n, profile }, version: 1 }
        : { state: { quality: 'low', tutorials: false, contenderName: n, paintIndex, hat, keySkin }, version: 0 };
      localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify(save));
    }
  }, [name, LOOKS[name] ?? LOOKS.Alpha, name === 'Bravo' ? BRAVO_PROFILE : null]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${name}: ${m.text()}`);
  });
  await page.goto(url);
  await page.waitForSelector('.loading', { state: 'detached', timeout: LOAD_T });
  return { ctx, page, name };
}
const net = (p, fn, arg) => p.evaluate(([f, a]) => window.__toybox.net[f](a), [fn, arg]);
const waitNet = (p, status, timeout = T) => p.waitForFunction((s) => window.__toybox?.net?.status() === s, status, { timeout, polling: 250 });
const tagNames = (p) => p.evaluate(() => [...document.querySelectorAll('.name-tag__name')].map((e) => e.textContent));
const waitTags = (p, names, timeout = T) =>
  p.waitForFunction((ns) => { const have = [...document.querySelectorAll('.name-tag__name')].map((e) => e.textContent); return ns.every((n) => have.includes(n)); }, names, { timeout, polling: 500 });
const remoteBy = (p, name) => p.evaluate((n) => window.__toybox.net.remotes().find((r) => r.name === n) ?? null, name);
const shot = (p, file) => p.screenshot({ path: path.join(OUT, file), timeout: T });

(async () => {
  const { child, log } = await startServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    // ------------------------------------------------------------ raw socket checks
    const health = await (await fetch(`${HTTP}/health`)).json();
    check(`server GET /health answers ok (protocol ${PROTO})`, health.ok === true && health.protocol === PROTO, JSON.stringify(health));
    const evil = await rawSession(`${WS}/`, { origin: 'https://evil.example' }, []);
    check('origin not on the allow-list is refused (403)', evil.status === 403);
    const noPath = await rawSession(`${WS}/elsewhere`, { origin: ORIGIN }, []);
    check('WebSocket on another path is refused (404)', noPath.status === 404);
    const look = { paint: 0, hat: 'none', keySkin: 'classic' };
    const old = await rawSession(`${WS}/`, { origin: ORIGIN }, [{ t: 'hello', v: 999, name: 'Old', look, join: { kind: 'public' } }]);
    check('mismatched protocol version gets a clear error and is closed', old.msgs[0]?.code === 'version_mismatch' && /refresh/i.test(old.msgs[0]?.message) && old.code === 4001, JSON.stringify(old.msgs[0]));
    const junk = await rawSession(`${WS}/`, { origin: ORIGIN }, ['{"t":"move","x":1e999}', 'nonsense']);
    check('malformed messages are answered with bad_request', junk.msgs.filter((m) => m.code === 'bad_request').length === 2);
    // Looks: unknown or misplaced accessory ids are cleaned by the server against the shared catalogue.
    const dressed = await rawSession(`${WS}/`, { origin: ORIGIN }, [{ t: 'hello', v: PROTO, name: 'Dresser', look: { paint: 9, hat: 'propeller', keySkin: 'moon', back: 'scarf', face: 'goggles', neck: 'crown-jewels' }, join: { kind: 'public' } }, { t: 'leave' }]);
    const dw = dressed.msgs.find((m) => m.t === 'welcome');
    const dl = dw?.players.find((p) => p.id === dw.you)?.look;
    check('server keeps catalogue accessories and blanks unknown or wrong-slot ids', dl && dl.paint === 9 && dl.hat === 'propeller' && dl.keySkin === 'moon' && dl.face === 'goggles' && dl.back === 'none' && dl.neck === 'none', JSON.stringify(dl));
    const big = await rawSession(`${WS}/`, { origin: ORIGIN }, ['x'.repeat(3000)]);
    check('messages over 2 KB close the socket (1009)', big.code === 1009, `close ${big.code}`);
    const flood = await rawSession(`${WS}/`, { origin: ORIGIN }, Array.from({ length: 400 }, () => '{"t":"leave"}'), 2500);
    check('a message flood is rate-limited and closed (4008)', flood.code === 4008, `close ${flood.code}`);

    // Server-side emote limit: X sends two emotes back to back; Y should see only the first.
    const emoteCheck = await new Promise((resolve) => {
      const opts = { origin: ORIGIN };
      const x = new WebSocket(`${WS}/`, opts);
      const y = new WebSocket(`${WS}/`, opts);
      const seen = [];
      let xId = null;
      y.on('message', (d) => { const m = JSON.parse(String(d)); if (m.t === 'emote') seen.push(m); });
      x.on('message', (d) => {
        const m = JSON.parse(String(d));
        if (m.t === 'welcome') {
          xId = m.you;
          x.send(JSON.stringify({ t: 'emote', id: 'wave' }));
          x.send(JSON.stringify({ t: 'emote', id: 'cheer' }));
          setTimeout(() => { x.send(JSON.stringify({ t: 'leave' })); y.send(JSON.stringify({ t: 'leave' })); x.close(); y.close(); resolve({ xId, seen }); }, 1000);
        }
      });
      y.on('open', () => y.send(JSON.stringify({ t: 'hello', v: PROTO, name: 'Watcher', look, join: { kind: 'public' } })));
      y.on('message', (d) => { if (JSON.parse(String(d)).t === 'welcome') x.send(JSON.stringify({ t: 'hello', v: PROTO, name: 'Spammer', look, join: { kind: 'public' } })); });
      x.on('error', () => {});
      y.on('error', () => {});
      setTimeout(() => resolve({ xId, seen }), 8000);
    });
    check('server sends only one of two back-to-back emotes (1.5 s limit)', emoteCheck.seen.length === 1 && emoteCheck.seen[0].emote === 'wave' && emoteCheck.seen[0].id === emoteCheck.xId, JSON.stringify(emoteCheck.seen));

    // ------------------------------------------------------------ desktop: private room
    const A = await openPage(browser, 'Alpha', { viewport: { width: 1280, height: 720 } });
    check('this build points online play at VITE_SERVER_URL', (await net(A.page, 'serverUrl')) === `ws://localhost:${PORT}`);
    await A.page.click('[data-testid=menu-online]');
    await A.page.waitForSelector('.online-sheet');
    check('Play online sheet: nickname, public, host and code options', (await A.page.inputValue('[data-testid=online-name]')) === 'Alpha' && (await A.page.isVisible('[data-testid=online-public]')) && (await A.page.isVisible('[data-testid=online-host]')) && (await A.page.isVisible('[data-testid=online-code]')));
    await shot(A.page, 'online-01-sheet.png');
    await A.page.click('[data-testid=online-host]');
    await waitNet(A.page, 'online');
    const room = await net(A.page, 'room');
    const code = room.code;
    check('A hosts a private room with a 5-character code', room.kind === 'private' && /^[A-HJ-KM-NP-Z2-9]{5}$/.test(code), code);
    await A.page.waitForSelector('[data-testid=online-chip]');
    check('A is in the hub with the online chip showing the room code', (await A.page.isVisible('.hud-sign')) && (await A.page.textContent('[data-testid=online-room]')).includes(code));
    check('the address bar carries the share link', (await A.page.evaluate(() => location.hash)) === `#room=${code}`);
    await A.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    await A.page.click('[data-testid=online-share]');
    await A.page.waitForFunction(() => /copied|Code/i.test(document.querySelector('[data-testid=online-count]')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => null);
    const clip = await A.page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    check('Share copies the room link (desktop: clipboard)', clip.endsWith(`#room=${code}`), clip);

    // Shrink pages that are already running while the next one loads (shared software renderer).
    const tiny = { width: 320, height: 200 };
    await A.page.setViewportSize(tiny);
    const B = await openPage(browser, 'Bravo', { viewport: { width: 720, height: 450 } });
    await B.page.click('[data-testid=menu-online]');
    await B.page.fill('[data-testid=online-code]', code.toLowerCase());
    await B.page.click('[data-testid=online-join-code]');
    await waitNet(B.page, 'online');
    check('B joins with the code', (await net(B.page, 'room')).code === code);

    await B.page.setViewportSize(tiny);
    const C = await openPage(browser, 'Charlie', { viewport: { width: 560, height: 360 } }, `${BASE}?debug#room=${code}`);
    await waitNet(C.page, 'online');
    check('C joins through the #room= deep link', (await net(C.page, 'room')).code === code && (await C.page.isVisible('.hud-sign')));

    await A.page.setViewportSize({ width: 1280, height: 720 });
    await B.page.setViewportSize({ width: 720, height: 450 });
    await Promise.all([waitTags(A.page, ['Bravo', 'Charlie']), waitTags(B.page, ['Alpha', 'Charlie']), waitTags(C.page, ['Alpha', 'Bravo'])]).catch(() => null);
    check('A sees name tags for B and C', (await tagNames(A.page)).sort().join() === 'Bravo,Charlie', (await tagNames(A.page)).join());
    check('B sees name tags for A and C', (await tagNames(B.page)).sort().join() === 'Alpha,Charlie', (await tagNames(B.page)).join());
    check('C sees name tags for A and B', (await tagNames(C.page)).sort().join() === 'Alpha,Bravo', (await tagNames(C.page)).join());
    check('chip counts 3 toys online', (await A.page.textContent('[data-testid=online-count]')).includes('3'));
    const bLook = (await remoteBy(A.page, 'Bravo'))?.look;
    check("remote players carry their cosmetics (A sees B's paint, hat and key)", bLook && bLook.paint === 1 && bLook.hat === 'thimble' && bLook.keySkin === 'heart', JSON.stringify(bLook));
    check("A sees B's shop accessories in B's look (cape on the back, monocle on the face)", bLook && bLook.back === 'cape' && bLook.face === 'monocle' && bLook.neck === 'none', JSON.stringify(bLook));
    await A.page.waitForFunction(() => !!window.__toybox.three().scene.getObjectByName('accessory:cape') && !!window.__toybox.three().scene.getObjectByName('accessory:monocle'), null, { timeout: 60000, polling: 250 }).catch(() => null);
    check("…and A's scene draws them on B's toy (A itself wears none)", await A.page.evaluate(() => { const sc = window.__toybox.three().scene; return !!sc.getObjectByName('accessory:cape') && !!sc.getObjectByName('accessory:monocle'); }));

    // Stage a group photo: A by the spawn tile facing the village, B and C in front, facing A.
    await A.page.evaluate(() => window.__toybox.teleport(0, 24, Math.PI));
    await B.page.evaluate(() => window.__toybox.teleport(-2.6, 17.5, 0));
    await C.page.evaluate(() => window.__toybox.teleport(2.6, 17.5, 0));
    await A.page.waitForFunction(() => window.__toybox.net.remotes().every((r) => r.x !== null && Math.abs(r.z - 17.5) < 0.4), null, { timeout: 60000, polling: 250 }).catch(() => null);
    await B.page.waitForFunction(() => { const a = window.__toybox.net.remotes().find((r) => r.name === 'Alpha'); return a && Math.abs(a.z - 24) < 0.4; }, null, { timeout: 60000, polling: 250 }).catch(() => null);
    await A.page.waitForFunction(() => [...document.querySelectorAll('.name-tag')].filter((e) => e.style.display !== 'none').length >= 2, null, { timeout: 60000, polling: 250 }).catch(() => null);
    const shown = await A.page.evaluate(() => [...document.querySelectorAll('.name-tag')].filter((e) => e.style.display !== 'none').map((e) => { const r = e.getBoundingClientRect(); return { name: e.querySelector('.name-tag__name').textContent, x: Math.round(r.x), y: Math.round(r.y) }; }));
    check("A sees B's and C's name tags on screen above their toys", shown.length === 2 && shown.every((t) => t.x > 0 && t.x < 1280 && t.y > 0 && t.y < 720), JSON.stringify(shown));
    await sleep(1500);
    await shot(A.page, 'online-02-A-sees-B-and-C.png');
    await shot(B.page, 'online-03-B-sees-A-and-C.png');

    // Movement: teleport A, time how long until B draws A there.
    const target = { x: 5, z: 21.5 };
    const t0 = Date.now();
    await A.page.evaluate(({ x, z }) => window.__toybox.teleport(x, z, Math.PI), target);
    await B.page.waitForFunction(({ x, z }) => { const a = window.__toybox.net.remotes().find((r) => r.name === 'Alpha'); return a && Math.hypot(a.x - x, a.z - z) < 0.3; }, target, { timeout: 20000, polling: 50 }).catch(() => null);
    const moveMs = Date.now() - t0;
    check('moving A (teleport) moves A for B within about 1 s', moveMs <= 1500, `${moveMs} ms (teleport → B's interpolated view, incl. 100 ms buffer)`);
    // Keys: hold W on A; B should see A walk.
    const before = await remoteBy(B.page, 'Alpha');
    await A.page.keyboard.down('KeyW');
    await B.page.waitForFunction((b) => { const a = window.__toybox.net.remotes().find((r) => r.name === 'Alpha'); return a && Math.hypot(a.x - b.x, a.z - b.z) > 0.6; }, before, { timeout: 30000, polling: 250 }).catch(() => null);
    await A.page.keyboard.up('KeyW');
    const after = await remoteBy(B.page, 'Alpha');
    check('walking A with the keyboard moves A for B', Math.hypot(after.x - before.x, after.z - before.z) > 0.6, `moved ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(2)} cm`);

    // Emote from B (key 1 = wave), seen by A through the remote toy's anim state.
    await B.page.keyboard.press('Digit1');
    await B.page.waitForFunction(() => window.__toybox.state().anim.emote === 'wave', null, { timeout: 30000, polling: 100 }).catch(() => null);
    check('B plays the wave emote locally (key 1)', (await B.page.evaluate(() => window.__toybox.state().anim.emote)) === 'wave' || (await B.page.evaluate(() => window.__toybox.state().anim.emoteT)) > 0);
    await A.page.waitForFunction(() => window.__toybox.net.remotes().find((r) => r.name === 'Bravo')?.lastEmote === 'wave', null, { timeout: 20000, polling: 100 }).catch(() => null);
    const bOnA = await remoteBy(A.page, 'Bravo');
    check("A sees B's wave (remote anim state)", bOnA.lastEmote === 'wave' && (bOnA.anim.emote === 'wave' || bOnA.anim.emoteT >= 0), JSON.stringify(bOnA.anim));
    await shot(A.page, 'online-04-A-sees-B-wave.png');
    // B's bought gesture: Dance is on B's key 4, and A must see it.
    await sleep(1600);
    await B.page.keyboard.press('Digit4');
    await B.page.waitForFunction(() => window.__toybox.state().anim.emote === 'dance', null, { timeout: 30000, polling: 100 }).catch(() => null);
    check('B plays the bought Dance gesture on key 4', (await B.page.evaluate(() => window.__toybox.state().anim.emote)) === 'dance');
    await A.page.waitForFunction(() => window.__toybox.net.remotes().find((r) => r.name === 'Bravo')?.lastEmote === 'dance', null, { timeout: 20000, polling: 100 }).catch(() => null);
    check("A sees B's bought gesture (dance)", (await remoteBy(A.page, 'Bravo'))?.lastEmote === 'dance');
    await shot(A.page, 'online-04b-A-sees-B-dance-cape.png');
    // Client cooldown: two emote keys in quick succession play (and send) only one emote.
    await sleep(1600);
    const evBefore = (await remoteBy(A.page, 'Bravo')).emoteEvents;
    await B.page.keyboard.press('Digit4');
    await B.page.keyboard.press('Digit3');
    await A.page.waitForFunction((n) => window.__toybox.net.remotes().find((r) => r.name === 'Bravo')?.emoteEvents > n, evBefore, { timeout: 20000, polling: 100 }).catch(() => null);
    await sleep(1200);
    const bAfter = await remoteBy(A.page, 'Bravo');
    const bLocal = await B.page.evaluate(() => window.__toybox.state().anim.emote);
    check('keys 4 and 3 pressed together: exactly one emote is played and sent', bAfter.emoteEvents === evBefore + 1 && ['dance', 'spin'].includes(bAfter.lastEmote) && bLocal === bAfter.lastEmote, `events +${bAfter.emoteEvents - evBefore}, sent ${bAfter.lastEmote}, B plays ${bLocal}`);

    // ------------------------------------------------------------ hub play: one shared marble, ball and score per room
    const hp = (p) => p.evaluate(() => window.__toybox.hubplay.state());
    /** Teleport a toy through waypoints, waiting each time until `watcher` sees it there (the server limits travel speed). */
    const travel = async (P, watcher, pts, yaw) => {
      for (const [x, z] of pts) {
        await P.page.evaluate(([x, z, y]) => window.__toybox.teleport(x, z, y), [x, z, yaw]);
        await watcher.page.waitForFunction(([n, x, z]) => { const r = window.__toybox.net.remotes().find((q) => q.name === n); return r && r.x !== null && Math.hypot(r.x - x, r.z - z) < 0.3; }, [P.name, x, z], { timeout: 120000, polling: 250 }).catch(() => null);
      }
    };
    const TRIALS = [[20, 10], [24, -40], [24, -108]];
    await Promise.all([A, B].map((P) => P.page.waitForFunction(() => window.__toybox.hubplay.state().newest !== null, null, { timeout: 60000, polling: 250 }).catch(() => null)));
    let ha = await hp(A.page);
    let hb = await hp(B.page);
    check('A and B are each sent the room\'s one marble (online, server state)', ha.mode === 'remote' && hb.mode === 'remote' && ha.newest && hb.newest && Math.abs(ha.newest.m[0] - hb.newest.m[0]) < 0.01 && Math.abs(ha.newest.m[1] - hb.newest.m[1]) < 0.01, JSON.stringify([ha.newest?.m, hb.newest?.m]));
    const m0 = ha.newest.m;
    await travel(A, B, [[m0[0] + 2.3, m0[1]]], -Math.PI / 2);
    await A.page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Kick'), null, { timeout: 60000 }).catch(() => null);
    await A.page.keyboard.press('KeyE');
    await B.page.waitForFunction((x) => { const n = window.__toybox.hubplay.state().newest; return n && n.m[0] < x - 4; }, m0[0], { timeout: 60000, polling: 100 }).catch(() => null);
    await shot(B.page, 'online-07-B-sees-A-kick-the-marble.png');
    await B.page.waitForFunction(() => { const n = window.__toybox.hubplay.state().newest; return n && n.m[2] === 0 && n.m[3] === 0; }, null, { timeout: 60000, polling: 250 }).catch(() => null);
    await A.page.waitForFunction(() => { const n = window.__toybox.hubplay.state().newest; return n && n.m[2] === 0 && n.m[3] === 0; }, null, { timeout: 60000, polling: 250 }).catch(() => null);
    ha = await hp(A.page);
    hb = await hp(B.page);
    check('A kicks the marble (E); B sees the same marble roll and stop in the same place', hb.newest.m[0] < m0[0] - 4 && Math.hypot(ha.newest.m[0] - hb.newest.m[0], ha.newest.m[1] - hb.newest.m[1]) < 0.01 && Math.hypot(hb.marble.x - hb.newest.m[0], hb.marble.z - hb.newest.m[1]) < 0.5, `x ${m0[0]} → ${hb.newest.m[0]} (A ${ha.newest.m[0]}, B draws ${hb.marble.x.toFixed(2)})`);

    // basketball: A picks it up by the hoop (B watches from the pitch), throws it (hold E), then sinks one
    await travel(B, A, [...TRIALS, [62, -118]], -2.4);
    await travel(A, B, [...TRIALS, [76, -125.6]], Math.PI);
    await A.page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Pick up'), null, { timeout: 60000 }).catch(() => null);
    await A.page.keyboard.press('KeyE');
    const aId = await net(A.page, 'selfId');
    await B.page.waitForFunction((id) => window.__toybox.hubplay.state().newest?.h === id, aId, { timeout: 60000, polling: 100 }).catch(() => null);
    await B.page.waitForFunction(() => window.__toybox.hubplay.state().ball.held, null, { timeout: 60000, polling: 100 }).catch(() => null);
    hb = await hp(B.page);
    check('A picks up the ball (E); B sees A holding it', (await hp(A.page)).holding && hb.newest.h === aId && hb.ball.held && hb.ball.holder === aId, JSON.stringify(hb.ball));
    await B.page.evaluate(() => window.__toybox.aim(-2.4 + Math.PI, 0.15));
    await sleep(800);
    await shot(B.page, 'online-08-B-sees-A-hold-the-ball.png');
    await A.page.keyboard.down('KeyE');
    await A.page.waitForFunction(() => (window.__toybox.hubplay.state().charge ?? 0) > 0.35, null, { timeout: 60000, polling: 50 }).catch(() => null);
    await A.page.keyboard.up('KeyE');
    await B.page.waitForFunction(() => { const n = window.__toybox.hubplay.state().newest; return n && n.h === null && Math.hypot(n.b[3], n.b[4], n.b[5]) > 1; }, null, { timeout: 60000, polling: 50 }).catch(() => null);
    hb = await hp(B.page);
    check('A holds E and lets go: the ball is thrown, and B sees it fly', !(await hp(A.page)).holding && hb.newest.h === null, JSON.stringify(hb.newest?.b));
    await B.page.waitForFunction(() => { const n = window.__toybox.hubplay.state().newest; return n && !n.h && n.b[3] === 0 && n.b[4] === 0 && n.b[5] === 0; }, null, { timeout: 120000, polling: 250 }).catch(() => null);
    const lb = (await hp(B.page)).newest.b;
    await travel(A, B, [[lb[0], lb[2] + 2]], Math.PI);
    await A.page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Pick up'), null, { timeout: 60000 }).catch(() => null);
    await A.page.keyboard.press('KeyE');
    await B.page.waitForFunction((id) => window.__toybox.hubplay.state().newest?.h === id, aId, { timeout: 60000, polling: 100 }).catch(() => null);
    const shotYaw = Math.atan2(76 - 72, -137.2 + 125);
    await travel(A, B, [[72, -125]], shotYaw);
    const sol = await A.page.evaluate(() => window.__toybox.hubplay.solve());
    await A.page.evaluate(([y, p]) => window.__toybox.hubplay.throw(y, p), [sol.yaw, sol.power]);
    await B.page.waitForFunction(() => window.__toybox.hubplay.state().hoops >= 1, null, { timeout: 60000, polling: 100 }).catch(() => null);
    await A.page.waitForFunction(() => window.__toybox.hubplay.state().mine >= 1, null, { timeout: 60000, polling: 100 }).catch(() => null);
    await sleep(300);
    await shot(B.page, 'online-09-B-sees-A-score-a-basket.png');
    ha = await hp(A.page);
    hb = await hp(B.page);
    check('A sinks a basket: the room tally is 1 for both, and it counts as A\'s', ha.hoops === 1 && hb.hoops === 1 && ha.mine === 1 && hb.mine === 0, `power ${sol.power}; A ${ha.hoops}/${ha.mine}, B ${hb.hoops}/${hb.mine}`);
    check('…and both HUDs show it', ((await A.page.textContent('[data-testid=hubplay-baskets]').catch(() => '')) || '').includes('Baskets 1') && ((await B.page.textContent('[data-testid=hubplay-baskets]').catch(() => '')) || '').includes('Baskets 1'));

    // a goal: the test server lets A put the marble in front of the east net (hpdebug), then A kicks it in
    await A.page.evaluate(() => window.__toybox.hubplay.place(101 - 11.8, -126));
    await travel(A, B, [[101 - 14.2, -126]], Math.PI / 2);
    await A.page.waitForFunction(() => { const n = window.__toybox.hubplay.state().newest; return n && Math.abs(n.m[0] - 89.2) < 0.05; }, null, { timeout: 60000, polling: 100 }).catch(() => null);
    await A.page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Kick'), null, { timeout: 60000 }).catch(() => null);
    await A.page.keyboard.press('KeyE');
    await B.page.waitForFunction(() => window.__toybox.hubplay.state().score[0] === 1, null, { timeout: 60000, polling: 100 }).catch(() => null);
    await B.page.evaluate(() => window.__toybox.aim(-Math.PI / 2 + 0.3, 0.2));
    await sleep(500);
    await shot(B.page, 'online-10-B-sees-the-goal.png');
    ha = await hp(A.page);
    hb = await hp(B.page);
    check('A kicks the marble into the east net: a goal for Coral, 1 – 0 for both', ha.score.join() === '1,0' && hb.score.join() === '1,0' && ((await B.page.textContent('[data-testid=hubplay-goals]').catch(() => '')) || '').replace(/\s/g, '') === '1–0', `A ${ha.score} B ${hb.score}`);
    await B.page.waitForFunction(() => { const n = window.__toybox.hubplay.state().newest; return n && n.n === 0 && Math.abs(n.m[0] - 26) < 0.01; }, null, { timeout: 60000, polling: 250 }).catch(() => null);
    check('…and the marble goes back to the centre spot', Math.abs((await hp(B.page)).newest.m[0] - 26) < 0.01);
    // back to spawn (the rest of the test stands there)
    await travel(A, B, [[24, -108], [24, -40], [5, 21.5]], Math.PI);

    // Reconnect: C's socket drops without a leave; C resumes the same slot.
    const cId = await net(C.page, 'selfId');
    await net(C.page, 'drop');
    await C.page.waitForFunction(() => document.querySelector('[data-testid=online-count]')?.textContent?.includes('Reconnecting'), null, { timeout: 10000, polling: 50 }).catch(() => null);
    await waitNet(C.page, 'online', 30000).catch(() => null);
    check('a dropped connection reconnects into the same room and slot', (await net(C.page, 'selfId')) === cId && (await net(C.page, 'room')).code === code, `id ${cId} → ${await net(C.page, 'selfId')}`);
    check('…and A still has 3 toys in the room', (await A.page.evaluate(() => window.__toybox.net.players().length)) === 3);

    // Leave.
    await C.page.click('[data-testid=online-leave]');
    await waitNet(C.page, 'offline', 20000);
    await A.page.waitForFunction(() => window.__toybox.net.players().length === 2, null, { timeout: 30000, polling: 250 }).catch(() => null);
    check('Leave: C goes offline and disappears for A', (await net(C.page, 'status')) === 'offline' && !(await tagNames(A.page)).includes('Charlie') && (await A.page.evaluate(() => window.__toybox.net.players().length)) === 2);
    check('C keeps playing offline in the hub', (await C.page.isVisible('.hud-sign')) && !(await C.page.isVisible('[data-testid=online-chip]')));

    // Errors and the public Hub, from the pause menu.
    await C.page.keyboard.press('Escape');
    await C.page.waitForSelector('[data-testid=pause-online]');
    await C.page.click('[data-testid=pause-online]');
    await C.page.fill('[data-testid=online-code]', 'ZZZZZ');
    await C.page.click('[data-testid=online-join-code]');
    await C.page.waitForSelector('[data-testid=online-error]', { timeout: 30000 });
    check('an unknown code shows "No room with that code"', (await C.page.textContent('[data-testid=online-error]')).includes('No room with that code'));
    await C.page.click('[data-testid=online-public]');
    await waitNet(C.page, 'online');
    const pub = await net(C.page, 'room');
    check('Join public Hub works (instance 1)', pub.kind === 'public' && pub.instance === 1, JSON.stringify(pub));
    check('joining from the pause menu resumes play', !(await C.page.isVisible('.pause')) && (await C.page.textContent('[data-testid=online-room]')).includes('Public Hub 1'));

    await A.ctx.close();
    await B.ctx.close();

    // ------------------------------------------------------------ phones (touch)
    const phone = (w, h) => ({ viewport: { width: w, height: h }, screen: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' });
    await C.page.setViewportSize(tiny);
    const P = await openPage(browser, 'Delta', phone(390, 844));
    await P.page.tap('[data-testid=menu-online]');
    await P.page.tap('[data-testid=online-public]');
    await waitNet(P.page, 'online');
    check('phone portrait (390×844) joins the public Hub', (await net(P.page, 'room')).instance === 1);
    await waitTags(P.page, ['Charlie'], 120000).catch(() => null);
    check('phone portrait sees C in the public Hub', (await tagNames(P.page)).includes('Charlie'), (await tagNames(P.page)).join());
    const btn = await P.page.waitForSelector('[data-testid=emote-button]');
    const bb = await btn.boundingBox();
    check('touch Emote button is at least 56 px and on screen', bb.width >= 56 && bb.height >= 56 && bb.x >= 0 && bb.x + bb.width <= 390 && bb.y + bb.height <= 844, JSON.stringify(bb));
    const leaveBox = await (await P.page.$('[data-testid=online-leave]')).boundingBox();
    check('online chip buttons are at least 56 px on touch', leaveBox.height >= 56 && leaveBox.width >= 56, JSON.stringify(leaveBox));
    await P.page.tap('[data-testid=emote-button]');
    await P.page.waitForSelector('[data-testid=emote-menu]');
    await P.page.waitForFunction(() => document.querySelector('.emote-menu')?.getAnimations().every((a) => a.playState === 'finished'), null, { timeout: 30000 }).catch(() => null);
    // Layout size (offsetWidth/Height) is the touch target; the pop-in animation scales the box briefly.
    const boxes = await P.page.$$eval('.emote-menu__btn', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: e.offsetWidth, h: e.offsetHeight, x: Math.round(r.x), y: Math.round(r.y) }; }));
    check('Emote menu: 4 options, each ≥ 56 px, inside the screen', boxes.length === 4 && boxes.every((b) => b.w >= 56 && b.h >= 56 && b.x >= 0 && b.x + b.w <= 390 && b.y >= 0), JSON.stringify(boxes));
    await shot(P.page, 'online-05-phone-portrait-emote-menu.png');
    await P.page.tap('[data-testid=emote-cheer]');
    await P.page.waitForFunction(() => window.__toybox.state().anim.emote === 'cheer', null, { timeout: 30000, polling: 100 }).catch(() => null);
    check('tapping Cheer plays it on the phone', (await P.page.evaluate(() => window.__toybox.state().anim.emote)) === 'cheer');
    check('…and closes the menu', !(await P.page.isVisible('[data-testid=emote-menu]')));
    await C.page.waitForFunction(() => window.__toybox.net.remotes().find((r) => r.name === 'Delta')?.lastEmote === 'cheer', null, { timeout: 20000, polling: 100 }).catch(() => null);
    check("C sees the phone's cheer", (await remoteBy(C.page, 'Delta'))?.lastEmote === 'cheer');
    // touch: the phone's Interact button kicks the public room's marble, and C sees it roll
    await P.page.waitForFunction(() => window.__toybox.hubplay.state().newest !== null, null, { timeout: 60000, polling: 250 }).catch(() => null);
    const pm = (await hp(P.page)).newest.m;
    await travel(P, C, [[pm[0] + 2.3, pm[1]]], -Math.PI / 2);
    const kickBtn = await P.page.waitForSelector('.touch-btn--interact', { timeout: 60000 }).catch(() => null);
    const kb = kickBtn ? await kickBtn.boundingBox() : null;
    check('phone: next to the marble the touch Interact button reads Kick, ≥ 56 px', !!kb && kb.width >= 56 && kb.height >= 56 && ((await kickBtn.textContent()) || '').includes('Kick'), JSON.stringify(kb));
    if (kickBtn) await P.page.tap('.touch-btn--interact');
    await C.page.waitForFunction((x) => { const n = window.__toybox.hubplay.state().newest; return n && n.m[0] < x - 3; }, pm[0], { timeout: 60000, polling: 100 }).catch(() => null);
    check('phone: tapping Kick kicks the shared marble, and C sees it roll', (await hp(C.page)).newest.m[0] < pm[0] - 3, `x ${pm[0]} → ${(await hp(C.page)).newest.m[0]}`);

    await P.page.setViewportSize({ width: 195, height: 422 });
    const L = await openPage(browser, 'Echo', phone(844, 390));
    await P.page.setViewportSize({ width: 390, height: 844 });
    await L.page.tap('[data-testid=menu-online]');
    await L.page.tap('[data-testid=online-public]');
    await waitNet(L.page, 'online');
    check('phone landscape (844×390) joins the public Hub', (await net(L.page, 'room')).instance === 1);
    const lb = await (await L.page.waitForSelector('[data-testid=emote-button]')).boundingBox();
    check('landscape: Emote button ≥ 56 px, on screen', lb.width >= 56 && lb.y >= 0 && lb.y + lb.height <= 390, JSON.stringify(lb));
    await L.page.tap('[data-testid=emote-button]');
    await L.page.waitForSelector('[data-testid=emote-menu]');
    await L.page.waitForFunction(() => document.querySelector('.emote-menu')?.getAnimations().every((a) => a.playState === 'finished'), null, { timeout: 30000 }).catch(() => null);
    const lboxes = await L.page.$$eval('.emote-menu__btn', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: e.offsetWidth, h: e.offsetHeight, x: Math.round(r.x), y: Math.round(r.y), b: Math.round(r.bottom) }; }));
    check('landscape: Emote menu fits on screen, each option ≥ 56 px', lboxes.length === 4 && lboxes.every((b) => b.w >= 56 && b.h >= 56 && b.y >= 0 && b.b <= 390), JSON.stringify(lboxes));
    await shot(L.page, 'online-06-phone-landscape-emote-menu.png');
    await L.page.tap('[data-testid=emote-spin]');
    await P.page.waitForFunction(() => window.__toybox.net.remotes().find((r) => r.name === 'Echo')?.lastEmote === 'spin', null, { timeout: 20000, polling: 100 }).catch(() => null);
    check("portrait phone sees the landscape phone's spin", (await remoteBy(P.page, 'Echo'))?.lastEmote === 'spin');
    check('public Hub counts 3 toys (C + two phones)', (await P.page.evaluate(() => window.__toybox.net.players().length)) === 3);

    await L.ctx.close();
    await P.ctx.close();
    await C.ctx.close();
    let end = null;
    for (let i = 0; i < 50; i++) {
      end = await (await fetch(`${HTTP}/health`)).json();
      if (end.connected === 0) break;
      await sleep(200);
    }
    check('no connections left at the end (dropped slots are held for 30 s)', end.connected === 0, JSON.stringify(end));
  } catch (e) {
    check('online e2e ran to the end', false, e.stack || String(e));
  } finally {
    await browser.close();
    child.kill('SIGTERM');
    const relevant = errors.filter((e) => !/favicon/i.test(e));
    check('no page errors', relevant.length === 0, relevant.slice(0, 6).join(' | '));
    fs.writeFileSync(path.join(OUT, 'online-server.log'), log.join(''));
    console.log('\n' + res.join('\n'));
    const failed = res.filter((r) => r.startsWith('FAIL')).length;
    console.log(`\n${res.length - failed}/${res.length} passed`);
    process.exit(failed ? 1 : 0);
  }
})();
