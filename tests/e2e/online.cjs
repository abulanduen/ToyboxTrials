/* Online Hub, end to end: the real server (server-dist/index.cjs, started here on port 2567)
   and a preview build of the client pointed at it.
     VITE_SERVER_URL=ws://localhost:2567 npx vite build --outDir /tmp/online-dist
     npx vite preview --outDir /tmp/online-dist --port 4190 --strictPort &
     npm run server:build
     BASE_URL=http://localhost:4190/ node tests/e2e/online.cjs
   Desktop: A hosts a private room, B joins with the code, C through a #room= link; name tags,
   movement, emotes, text chat and Who Am I? (A opens the suspicious box; B sees the word on A's
   card, A only "?"; typing doesn't move the toy; B's hint, A's masked copy of the answer, a wrong
   then a right guess, Peel it off, mute), hub play (B sees the marble A kicks; A picks up, throws
   and sinks the basketball; a goal; SKIP_HUBPLAY=1 skips it), reconnect, leave, errors, public Hub. B's save owns shop items (a cape, a
   monocle and the Dance gesture on key 4): A must see B's accessories and B's bought gesture. Phones (portrait + landscape, touch):
   join the public Hub and use the Emote menu. Raw-socket checks: health, origin, version, limits.
   Voice chat (A and B, desktop, Chromium's fake microphone): no microphone request before the mic
   button is pressed, a link that connects and carries sound when close, closes when apart, a mute
   that silences, and push to talk on V. Phones: the mic button's size and place.
   ONLY=voice runs just the raw-socket checks, A + B and the voice checks.
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
const PROTO = 6; // v6: proximity voice chat; v5: chat and Who Am I? cards (v4: hub play)
const VOICE_ONLY = process.env.ONLY === 'voice';

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
  // Count microphone requests: voice chat must not ask before the player presses the mic button or V.
  await ctx.addInitScript(() => {
    window.__gum = 0;
    const md = navigator.mediaDevices;
    if (md && md.getUserMedia) {
      const real = md.getUserMedia.bind(md);
      md.getUserMedia = (c) => {
        window.__gum++;
        return real(c);
      };
    }
  });
  await ctx.addInitScript(([n, look, profile]) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      const [paintIndex, hat, keySkin] = look;
      const save = profile
        ? { state: { tourSeen: true, quality: 'low', tutorials: false, contenderName: n, profile }, version: 1 }
        : { state: { tourSeen: true, quality: 'low', tutorials: false, contenderName: n, paintIndex, hat, keySkin }, version: 0 };
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

// ---------------------------------------------------------------- voice chat (A speaks, B listens; then B speaks with V)
const vstate = (p) => p.evaluate(() => window.__toybox.voice.state());
const gum = (p) => p.evaluate(() => window.__gum);
/** Loudest sound P's analyser measured from player `id` over `ms` (null when there is no link). */
async function loudness(P, id, ms = 2500) {
  await P.page.evaluate((i) => window.__toybox.voice.peak(i), id);
  await sleep(ms);
  return P.page.evaluate((i) => window.__toybox.voice.peak(i), id);
}
/**
 * The fake microphone beeps; its RMS as measured (one 512-sample window per rendered frame, and
 * software-rendered frames are slow) has ranged 0.007–0.08 here, while a silent link reads ~3e-6.
 */
const LOUD = 0.001;
const QUIET = 0.0005;
const inLink = (st, id) => st.inbound.find((l) => l.id === id) ?? null;
/** Move a toy through waypoints, waiting until `watcher` draws it at each one (the server limits speed). */
async function walk(P, watcher, pts, yaw) {
  for (const [x, z] of pts) {
    await P.page.evaluate(([x, z, y]) => window.__toybox.teleport(x, z, y), [x, z, yaw]);
    await watcher.page.waitForFunction(([n, x, z]) => { const r = window.__toybox.net.remotes().find((q) => q.name === n); return r && r.x !== null && Math.hypot(r.x - x, r.z - z) < 0.5; }, [P.name, x, z], { timeout: 120000, polling: 250 }).catch(() => null);
  }
}
/** Pick a mic mode in the pause menu's settings (Esc, the segmented control, Resume). */
async function micMode(P, mode) {
  await P.page.keyboard.press('Escape');
  await P.page.waitForSelector('[data-testid=setting-mic-mode]');
  await P.page.click(`[data-testid=setting-mic-mode] button[data-mode=${mode}]`);
  await P.page.click('.pause__actions .toy-btn >> nth=0');
  await P.page.waitForSelector('.pause', { state: 'detached' });
}
async function voiceChecks(A, B) {
  const aId = await net(A.page, 'selfId');
  const bId = await net(B.page, 'selfId');
  check('voice: nobody is asked for a microphone on joining (no getUserMedia call)', (await gum(A.page)) === 0 && (await gum(B.page)) === 0, `A ${await gum(A.page)}, B ${await gum(B.page)}`);
  const mic = await A.page.waitForSelector('[data-testid=voice-mic]');
  const mb = await mic.boundingBox();
  const near = await A.page.$$eval('.hud-sign, .hud-secrets, .hud-cogs, .online-chip, .hub-lobbies, .tickets .ticket, .look-hint', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { c: e.className, x: r.x, y: r.y, w: r.width, h: r.height }; }));
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.width && a.y < b.y + b.h && b.y < a.y + a.height;
  check('voice: desktop mic button top right, ≥ 56 px, clear of the rest of the HUD', mb.width >= 56 && mb.height >= 56 && mb.x + mb.width <= 1280 && mb.x > 1280 / 2 && mb.y < 100 && !near.some((b) => b.w && hit(mb, b)), JSON.stringify({ mb, hits: near.filter((b) => b.w && hit(mb, b)).map((b) => b.c) }));
  await shot(A.page, 'voice-01-desktop-mic-off.png');

  // A: Always on, then press the mic button. B (hearing on by default) connects and hears A.
  await A.page.evaluate(() => window.__toybox.teleport(0, 24, Math.PI));
  await B.page.evaluate(() => window.__toybox.teleport(-3, 18, 0.3));
  await micMode(A, 'open');
  await A.page.keyboard.press('Escape');
  await A.page.waitForSelector('[data-testid=setting-mic-mode]');
  await sleep(1200); // the pause card's pop-in
  await A.page.$eval('[data-testid=setting-mic-mode]', (e) => e.scrollIntoView({ block: 'center' }));
  await shot(A.page, 'voice-02-settings.png');
  check('voice: settings show Hear voice chat (on), Voice chat volume and Mic mode', (await A.page.isChecked('[data-testid=setting-voice-hear]')) && (await A.page.isVisible('[data-testid=setting-voice-chat]')) && (await A.page.textContent('[data-testid=setting-mic-mode]')).includes('Push to talk (V)'));
  await A.page.click('.pause__actions .toy-btn >> nth=0');
  await A.page.waitForSelector('.pause', { state: 'detached' });
  check('voice: still no microphone request before the press', (await gum(A.page)) === 0);
  await A.page.click('[data-testid=voice-mic]');
  await A.page.waitForFunction(() => window.__toybox.voice.state().mic === 'on' && window.__toybox.voice.state().transmitting, null, { timeout: 30000, polling: 100 }).catch(() => null);
  let a = await vstate(A.page);
  check('voice: pressing the mic button asks once and turns the mic on (Always on)', a.mic === 'on' && (await gum(A.page)) === 1 && a.transmitting, JSON.stringify({ mic: a.mic, gum: await gum(A.page), tx: a.transmitting }));
  await B.page.waitForFunction((id) => window.__toybox.voice.state().micOn.includes(id), aId, { timeout: 20000, polling: 100 }).catch(() => null);
  check("voice: B is told A's mic is on, and B was never asked for a microphone", (await vstate(B.page)).micOn.includes(aId) && (await gum(B.page)) === 0);
  await B.page.waitForFunction((id) => window.__toybox.voice.state().inbound.some((l) => l.id === id && l.state === 'connected' && l.audio), aId, { timeout: 60000, polling: 250 }).catch(() => null);
  let b = await vstate(B.page);
  check("voice: A and B close together: B's link from A reaches connected", inLink(b, aId)?.state === 'connected', JSON.stringify(b.inbound));
  check("voice: …and A's side sends to B", (await vstate(A.page)).outbound.some((l) => l.id === bId && l.state === 'connected'), JSON.stringify((await vstate(A.page)).outbound));
  const heard = await loudness(B, aId, 4000);
  check("voice: B's analyser hears A's (fake) microphone (not silent)", heard !== null && heard > LOUD, `peak RMS ${heard}`);
  b = await vstate(B.page);
  check('voice: close by, the voice plays at (near) full volume', (inLink(b, aId)?.gain ?? 0) > 0.6, `gain ${inLink(b, aId)?.gain}`);
  // (the fake microphone beeps, and a slow software-rendered page samples it only once a frame: give it time)
  await B.page.waitForFunction((id) => document.querySelector(`.name-tag[data-player="${id}"] .voice-tag.is-talking`), aId, { timeout: 60000, polling: 50 }).catch(() => null);
  check("voice: A's name tag on B's screen shows the mic mark and the speaking ring", await B.page.evaluate((id) => !!document.querySelector(`.name-tag[data-player="${id}"] .voice-tag--on.is-talking`), aId));
  await shot(B.page, 'voice-03-B-hears-A-talking-ring.png');
  await A.page.waitForFunction(() => document.querySelector('[data-testid=voice-mic]').classList.contains('is-talking'), null, { timeout: 60000, polling: 50 }).catch(() => null);
  check("voice: A's mic button shows A talking", await A.page.evaluate(() => document.querySelector('[data-testid=voice-mic]').classList.contains('is-talking')));
  await shot(A.page, 'voice-04-A-mic-on-talking.png');

  // Move apart (beyond 60 cm): the link closes. Come back: it opens again.
  await walk(B, A, [[20, 10], [24, -40], [24, -108]], 0);
  await B.page.waitForFunction((id) => !window.__toybox.voice.state().inbound.some((l) => l.id === id), aId, { timeout: 30000, polling: 250 }).catch(() => null);
  await A.page.waitForFunction((id) => !window.__toybox.voice.state().outbound.some((l) => l.id === id), bId, { timeout: 30000, polling: 250 }).catch(() => null);
  check('voice: B walks far away: both ends close the link', !inLink(await vstate(B.page), aId) && !(await vstate(A.page)).outbound.some((l) => l.id === bId));
  await walk(B, A, [[24, -40], [20, 10], [-3, 18]], 0.3);
  await B.page.waitForFunction((id) => window.__toybox.voice.state().inbound.some((l) => l.id === id && l.state === 'connected'), aId, { timeout: 60000, polling: 250 }).catch(() => null);
  check('voice: B comes back: the link connects again', inLink(await vstate(B.page), aId)?.state === 'connected');

  // B mutes A (pause menu → Voice chat): the link closes and B hears nothing from A.
  await B.page.keyboard.press('Escape');
  await B.page.waitForSelector(`[data-testid=voice-mute-${aId}]`);
  await B.page.click(`[data-testid=voice-mute-${aId}]`);
  await B.page.waitForSelector(`[data-testid=voice-mute-${aId}][aria-pressed=true]`);
  await shot(B.page, 'voice-05-B-pause-mutes-A.png');
  await B.page.click('.pause__actions .toy-btn >> nth=0');
  await sleep(800);
  b = await vstate(B.page);
  const mutedPeak = await loudness(B, aId, 1500);
  check('voice: B mutes A: link closed, silence', b.muted.includes(aId) && !inLink(b, aId) && !mutedPeak, JSON.stringify({ muted: b.muted, link: inLink(b, aId), mutedPeak }));
  check("voice: …and A's name tag shows the muted mark", await B.page.evaluate((id) => !!document.querySelector(`.name-tag[data-player="${id}"] .voice-tag--muted`), aId));
  await B.page.evaluate((id) => window.__toybox.voice.mute(id), aId); // unmute

  // B: push to talk (the default) on V. The first press only asks for the microphone.
  check('voice: B is in push-to-talk mode by default', (await vstate(B.page)).mode === 'ptt');
  await B.page.keyboard.down('KeyV');
  await B.page.waitForFunction(() => window.__toybox.voice.state().mic === 'on', null, { timeout: 30000, polling: 100 }).catch(() => null);
  await sleep(500);
  b = await vstate(B.page);
  check('voice: the first V press asks for the microphone (once) and opens it without sending', b.mic === 'on' && (await gum(B.page)) === 1 && !b.transmitting, JSON.stringify({ mic: b.mic, gum: await gum(B.page), tx: b.transmitting }));
  await B.page.keyboard.up('KeyV');
  await A.page.waitForFunction((id) => window.__toybox.voice.state().inbound.some((l) => l.id === id && l.state === 'connected' && l.audio), bId, { timeout: 60000, polling: 250 }).catch(() => null);
  check('voice: A connects to B (B is now a speaker)', inLink(await vstate(A.page), bId)?.state === 'connected');
  const idle = await loudness(A, bId, 3000);
  check('voice: V not held: A hears nothing from B', idle !== null && idle < QUIET, `peak ${idle}`);
  await B.page.keyboard.down('KeyV');
  await B.page.waitForFunction(() => window.__toybox.voice.state().transmitting, null, { timeout: 10000, polling: 50 }).catch(() => null);
  const talking = await loudness(A, bId, 5000);
  await shot(B.page, 'voice-06-B-holds-V.png');
  await B.page.keyboard.up('KeyV');
  check('voice: B holds V: B sends and A hears B', (await gum(B.page)) === 1 && talking !== null && talking > LOUD, `peak ${talking}`);
  // B's frame loop sees the release on its next frame (slow under software rendering); then the last packets drain
  await B.page.waitForFunction(() => !window.__toybox.voice.state().transmitting, null, { timeout: 20000, polling: 50 }).catch(() => null);
  await sleep(800);
  const after = await loudness(A, bId, 3000);
  check('voice: B lets go of V: silence again', !(await vstate(B.page)).transmitting && after !== null && after < QUIET, `peak ${after}`);

  // A turns the mic off with the button (Always on): B's link from A closes.
  await A.page.click('[data-testid=voice-mic]');
  await B.page.waitForFunction((id) => !window.__toybox.voice.state().micOn.includes(id) && !window.__toybox.voice.state().inbound.some((l) => l.id === id), aId, { timeout: 20000, polling: 100 }).catch(() => null);
  b = await vstate(B.page);
  check("voice: A presses the button again: A's mic is off, B's link from A closes", (await vstate(A.page)).mic === 'off' && !b.micOn.includes(aId) && !inLink(b, aId));
  // B goes into the Workshop: voice is Hub-only, so B's mic closes.
  await B.page.keyboard.press('Escape');
  await B.page.click('.pause__actions .toy-btn >> nth=1');
  await B.page.waitForFunction(() => window.__toybox.voice.state().mic === 'off', null, { timeout: 20000, polling: 100 }).catch(() => null);
  await A.page.waitForFunction((id) => !window.__toybox.voice.state().micOn.includes(id), bId, { timeout: 20000, polling: 100 }).catch(() => null);
  check("voice: B opens the Workshop: B's mic closes and A no longer lists it", (await vstate(B.page)).mic === 'off' && !(await vstate(A.page)).micOn.includes(bId) && (await vstate(A.page)).inbound.length === 0);
  await B.page.keyboard.press('Escape');
  await B.page.waitForSelector('.hud-sign', { timeout: 60000 }).catch(() => null);
  await micMode(A, 'ptt');
}

/** Phones: the mic button is ≥ 56 px, on screen and clear of every other HUD control. */
async function phoneMic(P, w, h, label, file) {
  const m = await P.page.waitForSelector('[data-testid=voice-mic]', { timeout: 60000 }).catch(() => null);
  const mb = m ? await m.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: e.offsetWidth, height: e.offsetHeight }; }) : null;
  const others = await P.page.$$eval('.touch-pause, .hud-sign, .hud-secrets, .hud-cogs, .online-chip, .hub-lobbies, .tickets .ticket, .lobby-alert, .hubplay-score, [data-testid=emote-button], .touch-btn--jump, .prompt, .look-hint', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { c: e.className, x: r.x, y: r.y, w: r.width, h: r.height }; }));
  const hits = mb ? others.filter((b) => b.w && mb.x < b.x + b.w && b.x < mb.x + mb.width && mb.y < b.y + b.h && b.y < mb.y + mb.height).map((b) => b.c) : [];
  check(`${label}: mic button ≥ 56 px, on screen at the top right, clear of the other HUD controls`, !!mb && mb.width >= 56 && mb.height >= 56 && mb.x >= 0 && mb.x + mb.width <= w && mb.y >= 0 && mb.y < h / 3 && mb.x > w / 2 && hits.length === 0, JSON.stringify({ mb, hits }));
  await shot(P.page, file);
}

(async () => {
  const { child, log } = await startServer();
  // Fake microphone (a beeping tone) granted without a prompt; real local addresses in ICE (no mDNS names) so two pages on one machine connect.
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
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
    const big = await rawSession(`${WS}/`, { origin: ORIGIN }, [JSON.stringify({ t: 'emote', id: 'wave', pad: 'x'.repeat(3000) })]);
    check('messages over 2 KB (other than voice handshakes) are refused with bad_request', big.msgs.some((m) => m.code === 'bad_request'), JSON.stringify(big.msgs[0]));
    const huge = await rawSession(`${WS}/`, { origin: ORIGIN }, ['x'.repeat(9000)]);
    check('frames over 8 KB close the socket (1009)', huge.code === 1009, `close ${huge.code}`);
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

    // ONLY=voice: just A and B and the voice checks (the full run does them after the emotes, with C in the room too).
    if (VOICE_ONLY) {
      await A.page.setViewportSize({ width: 1280, height: 720 });
      await Promise.all([waitTags(A.page, ['Bravo']), waitTags(B.page, ['Alpha'])]).catch(() => null);
      await voiceChecks(A, B);
      await A.ctx.close();
      await B.ctx.close();
    } else {

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

    // ------------------------------------------------------------ text chat and Who Am I? (the suspicious box)
    {
      /** Teleport a toy through waypoints, waiting each time until `watcher` sees it there (the server limits travel speed). */
      const walk = async (P, watcher, pts, yaw) => {
        for (const [x, z] of pts) {
          await P.page.evaluate(([x, z, y]) => window.__toybox.teleport(x, z, y), [x, z, yaw]);
          await watcher.page.waitForFunction(([n, x, z]) => { const r = window.__toybox.net.remotes().find((q) => q.name === n); return r && r.x !== null && Math.hypot(r.x - x, r.z - z) < 0.3; }, [P.name, x, z], { timeout: 120000, polling: 250 }).catch(() => null);
        }
      };
      const chat = (p) => p.evaluate(() => window.__toybox.net.chat());
      const lines = async (p) => (await chat(p)).lines;
      const say = async (p, text, key = 'Enter') => {
        await p.keyboard.press(key);
        await p.waitForSelector('[data-testid=chat-input]', { timeout: 30000 });
        await p.keyboard.type(text);
        await p.keyboard.press('Enter');
      };
      const waitLine = (p, pred, timeout = 30000) => p.waitForFunction((src) => window.__toybox.net.chat().lines.some(new Function('l', `return ${src}`)), pred, { timeout, polling: 200 }).catch(() => null);
      const aId = await net(A.page, 'selfId');
      const bId = await net(B.page, 'selfId');
      const spot = await A.page.evaluate(() => window.__toybox.interactables().find((i) => i.id === 'jack'));
      // A by the box, facing east (its back to the box); B a few steps east, facing A.
      await walk(A, B, [[spot.x, spot.z]], Math.PI / 2);
      await walk(B, A, [[spot.x + 7, spot.z]], -Math.PI / 2);
      await A.page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('suspicious'), null, { timeout: 60000 }).catch(() => null);
      const cogs0 = await A.page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.profile.wallet.cogs);
      await A.page.keyboard.press('KeyE');
      const tagCard = await B.page.waitForSelector(`.name-tag[data-player="${aId}"] [data-testid=name-tag-card]`, { timeout: 60000 }).catch(() => null);
      const word = tagCard ? ((await tagCard.textContent()) || '').trim().toLowerCase() : '';
      check('A opens the suspicious box online: B sees a word card on A (name tag)', /^[a-z]+( [a-z]+)?$/.test(word), word);
      await B.page.waitForFunction((w) => !!window.__toybox.three().scene.getObjectByName(`whoami:card:${w}`), word, { timeout: 60000, polling: 250 }).catch(() => null);
      check("…and B's scene draws the paper card with that word on A's face", await B.page.evaluate((w) => !!window.__toybox.three().scene.getObjectByName(`whoami:card:${w}`), word));
      await A.page.waitForSelector('[data-testid=whoami-chip]', { timeout: 60000 }).catch(() => null);
      check("A's HUD shows the Who Am I? chip", ((await A.page.textContent('[data-testid=whoami-chip]').catch(() => '')) || '').includes("Something's stuck to your face! Ask the others, then guess in chat."));
      await A.page.waitForFunction(() => !!window.__toybox.three().scene.getObjectByName('whoami:card-hidden'), null, { timeout: 60000, polling: 250 }).catch(() => null);
      check('A sees a blank card with "?" on its own toy, never the word', await A.page.evaluate((w) => { const sc = window.__toybox.three().scene; let named = false; sc.traverse((o) => { if (o.name === `whoami:card:${w}`) named = true; }); return !!sc.getObjectByName('whoami:card-hidden') && !named; }, word));
      check("C (also in the room) sees A's card too", await C.page.waitForFunction((id) => !!window.__toybox.net.chat().cards[id], aId, { timeout: 60000, polling: 250 }).then(() => true, () => false));
      await A.page.evaluate(() => window.__toybox.aim(Math.PI / 2, 0.35));
      await B.page.evaluate(() => window.__toybox.aim(Math.PI / 2, 0.16));
      await sleep(1500);
      await shot(B.page, 'online-11-B-sees-A-card.png');
      await shot(A.page, 'online-12-A-own-card-is-blank.png');

      // A types in the chat: the toy must not walk, and the chat box releases the keys afterwards.
      const posA = await A.page.evaluate(() => window.__toybox.state());
      await A.page.keyboard.press('KeyT');
      await A.page.waitForSelector('[data-testid=chat-input]', { timeout: 30000 });
      check('T opens the desktop chat box (focused)', await A.page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'chat-input'));
      await A.page.keyboard.type('wasd wasd dddd');
      await sleep(800);
      const posA2 = await A.page.evaluate(() => window.__toybox.state());
      check('typing W A S D in the chat box does not move the toy', Math.hypot(posA2.x - posA.x, posA2.z - posA.z) < 0.05, `moved ${Math.hypot(posA2.x - posA.x, posA2.z - posA.z).toFixed(3)} cm`);
      check('…and does not pause the game', !(await A.page.isVisible('.pause')));
      await A.page.keyboard.press('Escape');
      await A.page.waitForSelector('[data-testid=chat-input]', { state: 'detached', timeout: 30000 }).catch(() => null);
      check('Esc closes the chat box without sending or pausing', !(await A.page.isVisible('[data-testid=chat-input]')) && !(await A.page.isVisible('.pause')) && !(await lines(A.page)).some((l) => l.text.includes('wasd')));

      // B gives a hint: everyone sees it, with a bubble over B for A.
      await say(B.page, 'Hint: you live somewhere nice');
      await waitLine(A.page, "l.name === 'Bravo' && l.text === 'Hint: you live somewhere nice'");
      check('B chats a hint (Enter, type, Enter): A sees it in the log', (await lines(A.page)).some((l) => l.name === 'Bravo' && l.text === 'Hint: you live somewhere nice'));
      const bubble = await A.page.evaluate((id) => { const b = document.querySelector(`.name-tag[data-player="${id}"] .name-tag__bubble`); return b ? { text: b.textContent, shown: b.style.display !== 'none' } : null; }, bId);
      check("…and a speech bubble over B's toy for A", bubble && bubble.shown && bubble.text === 'Hint: you live somewhere nice', JSON.stringify(bubble));
      check("…and B's own log shows the line once the server echoes it", !!(await waitLine(B.page, "l.name === 'Bravo' && l.text.startsWith('Hint')")));
      await shot(A.page, 'online-13-A-chat-log-and-bubble.png');

      // B names the answer: A gets it masked, C plainly.
      const spoiler = `ok fine, you are a ${word}!`;
      await say(B.page, spoiler, 'KeyT');
      await waitLine(A.page, "l.name === 'Bravo' && l.text.startsWith('ok fine')");
      await waitLine(C.page, "l.name === 'Bravo' && l.text.startsWith('ok fine')");
      const masked = (await lines(A.page)).find((l) => l.name === 'Bravo' && l.text.startsWith('ok fine'));
      check("A's copy of B's message has the answer masked", masked && masked.masked && !masked.text.toLowerCase().includes(word) && masked.text.includes(`${word[0]}*`), masked?.text);
      const plain = (await lines(C.page)).find((l) => l.name === 'Bravo' && l.text.startsWith('ok fine'));
      check('…while C sees it as written', plain && plain.text === spoiler && !plain.masked, plain?.text);
      await shot(A.page, 'online-14-A-sees-the-answer-masked.png');

      // A guesses wrong (posted), then right (the card comes off for everyone).
      const wrong = word === 'teapot' ? 'am I a kite?' : 'am I a teapot?';
      await say(A.page, wrong, 'KeyT');
      await waitLine(B.page, `l.name === 'Alpha' && l.text === ${JSON.stringify(wrong)}`);
      check('A guesses wrong: the guess is posted to the room', (await lines(B.page)).some((l) => l.name === 'Alpha' && l.text === wrong));
      check('…and A still wears the card', (await chat(B.page)).cards[aId] === word);
      // Before the right guess: nothing A was ever sent, and nothing in A's page, holds the word.
      const recv = await net(A.page, 'received');
      // (whole words: a short card such as "cat" must not match "copycat-conductor" in the lobby list)
      const named = (text) => new RegExp(`\\b${word.replace(/ /g, '[^a-z]*')}(s|es)?\\b`, 'i').test(text);
      check("no message A received names A's card (before the right guess)", recv.length > 5 && !recv.some(named), `${recv.length} messages`);
      const pageText = await A.page.evaluate(() => document.body.innerText + JSON.stringify(window.__toybox.net.chat()));
      check("…and A's page shows it nowhere", !named(pageText));
      await sleep(1600); // the chat rate limit
      await say(A.page, `Am I ${word}?`, 'KeyT');
      await B.page.waitForFunction((id) => !(id in window.__toybox.net.chat().cards), aId, { timeout: 30000, polling: 200 }).catch(() => null);
      await A.page.waitForSelector('[data-testid=whoami-chip]', { state: 'detached', timeout: 30000 }).catch(() => null);
      const annB = (await lines(B.page)).find((l) => l.kind === 'announce' && l.text.startsWith('Alpha guessed it'));
      const annA = (await lines(A.page)).find((l) => l.kind === 'announce' && l.text.startsWith('You guessed it'));
      check('A guesses right: the card comes off for both, with an announcement', !(aId in (await chat(B.page)).cards) && !(aId in (await chat(A.page)).cards) && !!annB && annB.text.toLowerCase().includes(word) && !!annA, `${annB?.text} | ${annA?.text}`);
      check('…the right guess is not posted as a chat line', !(await lines(B.page)).some((l) => l.kind === 'say' && l.name === 'Alpha' && l.text.toLowerCase().includes(word)));
      check("…the card is gone from A's face in B's scene and the name tag", !(await B.page.evaluate((w) => !!window.__toybox.three().scene.getObjectByName(`whoami:card:${w}`), word)) && !(await B.page.isVisible(`.name-tag[data-player="${aId}"] [data-testid=name-tag-card]`)));
      await sleep(400);
      await shot(B.page, 'online-15-B-sees-A-guess-it.png');
      const cogs1 = await A.page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.profile.wallet.cogs);
      check('…and A earns 5 cogs for it (on top of the secret, if this was the first open)', cogs1 - cogs0 === 5 || cogs1 - cogs0 === 45, `${cogs0} → ${cogs1}`);

      // Peel it off: the answer is revealed to the holder too.
      await sleep(4200); // the box's cool-down
      await A.page.keyboard.press('KeyE');
      await B.page.waitForFunction((id) => !!window.__toybox.net.chat().cards[id], aId, { timeout: 60000, polling: 200 }).catch(() => null);
      const word2 = (await chat(B.page)).cards[aId];
      await A.page.waitForSelector('[data-testid=whoami-peel]', { timeout: 30000 }).catch(() => null);
      await A.page.keyboard.press('KeyE');
      await A.page.waitForFunction(() => [...document.querySelectorAll('.ticket')].some((t) => t.textContent.includes('already wearing')), null, { timeout: 20000 }).catch(() => null);
      check('opening the box again while wearing a card says so', await A.page.evaluate(() => [...document.querySelectorAll('.ticket')].some((t) => t.textContent.includes('already wearing'))));
      check('a second card is a different one', !!word2 && word2 !== word, `${word} then ${word2}`);
      await A.page.click('[data-testid=whoami-peel]');
      await waitLine(A.page, "l.kind === 'announce' && l.text.startsWith('You peeled off')");
      const peelA = (await lines(A.page)).find((l) => l.kind === 'announce' && l.text.startsWith('You peeled off'));
      check('Peel it off: the card comes off and A is told the answer', !!peelA && !!word2 && peelA.text.toLowerCase().includes(word2) && !(aId in (await chat(B.page)).cards), peelA?.text);

      // Mute: B mutes A from A's line in the log; A's next message doesn't show for B.
      await B.page.keyboard.press('KeyT');
      await B.page.waitForSelector('[data-testid=chat-input]', { timeout: 30000 });
      await B.page.click('.chat-line button.chat-line__name >> text=Alpha');
      await B.page.click('[data-testid=chat-mute]');
      check('B mutes A from a line in the open log', (await chat(B.page)).muted.includes(aId));
      await B.page.keyboard.press('Escape');
      await sleep(1600);
      await say(A.page, 'can anyone hear me', 'KeyT');
      await waitLine(C.page, "l.text === 'can anyone hear me'");
      await sleep(500);
      const bShows = await B.page.evaluate(() => [...document.querySelectorAll('[data-testid=chat-line]')].some((e) => e.textContent.includes('can anyone hear me')));
      check("…B's log hides A's messages (C still gets them)", !bShows && (await lines(C.page)).some((l) => l.text === 'can anyone hear me'));
      await B.page.evaluate((id) => window.__toybox.net.chat().muted.includes(id), aId);
      // back where the rest of the test expects them
      await walk(A, B, [[5, 21.5]], Math.PI);
      await walk(B, A, [[-2.6, 17.5]], 0);
    }
    // ------------------------------------------------------------ proximity voice chat
    await voiceChecks(A, B);

    // ------------------------------------------------------------ hub play: one shared marble, ball and score per room
    const hp = (p) => p.evaluate(() => window.__toybox.hubplay.state());
    /** Teleport a toy through waypoints, waiting each time until `watcher` sees it there (the server limits travel speed). */
    const travel = async (P, watcher, pts, yaw) => {
      for (const [x, z] of pts) {
        await P.page.evaluate(([x, z, y]) => window.__toybox.teleport(x, z, y), [x, z, yaw]);
        await watcher.page.waitForFunction(([n, x, z]) => { const r = window.__toybox.net.remotes().find((q) => q.name === n); return r && r.x !== null && Math.hypot(r.x - x, r.z - z) < 0.3; }, [P.name, x, z], { timeout: 120000, polling: 250 }).catch(() => null);
      }
    };
    if (!process.env.SKIP_HUBPLAY) {
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
      const restB = (await hp(B.page)).newest.b;
      // stand 2 cm from where it lies, on the side of its spot (always on the pitch)
      const toSpot = Math.hypot(76 - restB[0], -128 - restB[2]) || 1;
      await travel(A, B, [[restB[0] + ((76 - restB[0]) / toSpot) * 2, restB[2] + ((-128 - restB[2]) / toSpot) * 2]], Math.atan2(restB[0] - 76, restB[2] + 128));
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

      // a steal: B picks the ball up and dribbles (walks) past A; A takes it off the dribble (Steal)
      await B.page.waitForFunction(() => { const n = window.__toybox.hubplay.state().newest; return n && !n.h && n.b[3] === 0 && n.b[4] === 0 && n.b[5] === 0; }, null, { timeout: 120000, polling: 250 }).catch(() => null);
      const rest2 = (await hp(B.page)).newest.b;
      const toSpot2 = Math.hypot(76 - rest2[0], -128 - rest2[2]) || 1;
      await travel(B, A, [[rest2[0] + ((76 - rest2[0]) / toSpot2) * 2, rest2[2] + ((-128 - rest2[2]) / toSpot2) * 2]], Math.atan2(rest2[0] - 76, rest2[2] + 128));
      await B.page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Pick up'), null, { timeout: 60000 }).catch(() => null);
      await B.page.keyboard.press('KeyE');
      const bId = await net(B.page, 'selfId');
      await A.page.waitForFunction((id) => window.__toybox.hubplay.state().newest?.h === id, bId, { timeout: 60000, polling: 100 }).catch(() => null);
      await travel(B, A, [[50, -120]], Math.PI / 2);
      await travel(A, B, [[57, -118]], -Math.PI / 2);
      await sleep(1700); // past the 1.5 s after the ball changed hands
      const stoleP = A.page.waitForFunction(() => window.__toybox.hubplay.stealable() && window.__toybox.hubplay.grab(), null, { timeout: 20000, polling: 30 }).then(() => true).catch(() => false);
      await B.page.keyboard.down('KeyW');
      const stole = await stoleP;
      await B.page.keyboard.up('KeyW');
      await B.page.waitForFunction((id) => window.__toybox.hubplay.state().newest?.h === id, aId, { timeout: 30000, polling: 100 }).catch(() => null);
      const stolenNote = await B.page.waitForFunction(() => [...document.querySelectorAll('.ticket')].some((t) => t.textContent.includes('Stolen!')), null, { timeout: 15000 }).then(() => true).catch(() => false);
      check('B dribbles past A: A can Steal it (E), the server gives A the ball, and B is told', stole && (await hp(B.page)).newest?.h === aId && (await hp(A.page)).holding && stolenNote, JSON.stringify({ stole, h: (await hp(B.page)).newest?.h, stolenNote }));
      await A.page.evaluate(() => window.__toybox.hubplay.throw(Math.PI, 0.2));
      await sleep(300);

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
    }

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
    await phoneMic(P, 390, 844, 'phone portrait', 'voice-07-phone-portrait-mic.png');
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
    // layout size (the button pops in with a scale animation)
    const kb = kickBtn ? await kickBtn.evaluate((e) => ({ width: e.offsetWidth, height: e.offsetHeight })) : null;
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
    await phoneMic(L, 844, 390, 'phone landscape', 'voice-08-phone-landscape-mic.png');
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
    } // end of the full run (ONLY=voice skips it)
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
