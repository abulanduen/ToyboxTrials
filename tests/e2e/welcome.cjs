/* Welcoming players in the Hub: Pipwick's first-visit tour (desktop + phone portrait), Next and
 * Skip by keyboard, mouse and touch, the "seen" flag persisting across a reload, replaying the
 * tour by talking to Pipwick and from the main menu's How to play, a gate greeter speaking (and
 * the gate still opening its trial), the Jukebox track list, the Music and Voice volume sliders,
 * and the background music director's choices (it cannot tell how anything sounds).
 *
 *   BASE_URL=http://localhost:4173/ node tests/e2e/welcome.cjs [desktop,phone]
 *
 * Software GL renders at a few fps here: every wait is on a condition or a frame count.
 * Output: tests/e2e/output/welcome-*.png
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const ONLY = process.argv[2] ? process.argv[2].split(',') : null;
const want = (n) => !ONLY || ONLY.includes(n);
const KEY = 'toybox-trials:prototype:v1';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  console.log(results[results.length - 1]);
};

async function frames(page, n) {
  await page.evaluate((k) => new Promise((res) => { let i = 0; const t0 = performance.now(); const tick = () => (++i >= k || performance.now() - t0 > 60000 ? res() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);
}
const welcome = (page) => page.evaluate(() => window.__toybox.welcome.state());
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').state || {}, KEY);
const pos = (page) => page.evaluate(() => { const s = window.__toybox.state(); return { x: s.x, z: s.z }; });
const camPos = (page) => page.evaluate(() => { const c = window.__toybox.three().camera.position; return [c.x, c.y, c.z]; });
const waitPhase = (page, stop, phase) =>
  page.waitForFunction(([s, p]) => { const w = window.__toybox.welcome.state(); return w.mode === 'tour' && w.stop === s && w.phase === p; }, [stop, phase], { timeout: 180000 });
const box = async (page, sel) => page.locator(sel).boundingBox();

async function open(browser, opts, seed) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // seeded once per tab (sessionStorage), so reloads keep what the game saved
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, JSON.stringify(s)); } }, [KEY, seed]);
  await page.goto(`${BASE}?debug#play`);
  await page.waitForFunction(() => window.__toybox && window.__toybox.welcome && window.__toybox.hub && window.__toybox.state, null, { timeout: 180000 });
  await page.waitForSelector('.hud-sign', { timeout: 180000 });
  return { ctx, page, errors };
}

async function desktop(browser) {
  const { ctx, page, errors } = await open(browser, { viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 }, { state: { quality: 'low', tutorials: false }, version: 1 });

  // --- first visit: the tour starts by itself
  await page.waitForSelector('[data-testid=tour-card]', { timeout: 180000 });
  // Pipwick's lines are recorded: the tour moves on by itself after each one. Hold it still while
  // the steps below drive it by hand (checked on its own further down).
  await page.evaluate(() => window.__toybox.welcome.autoAdvance(false));
  await waitPhase(page, 0, 'talk');
  await frames(page, 3);
  let w = await welcome(page);
  check('first visit: Pipwick’s tour starts on its own', w.mode === 'tour' && w.stop === 0, JSON.stringify(w));
  check('tour card opens on Pipwick’s first caption', /^In this town, every toy arrives with a dream\.$/.test((await page.textContent('[data-testid=tour-text]')).trim()), await page.textContent('[data-testid=tour-text]'));
  const log = await page.evaluate(() => window.__toybox.voice.log());
  check('the first line is asked for by id, and it has a recording', log.some((l) => l.id === 'pipwick-tour-hello' && l.recorded === true), JSON.stringify(log));
  check('movement controls card steps aside during the tour', !(await page.isVisible('.controls')));
  await page.screenshot({ path: `${OUT}/welcome-desktop-01-hello.png` });

  // the toy cannot walk while the tour runs
  const p0 = await pos(page);
  await page.keyboard.down('w');
  await frames(page, 12);
  await page.keyboard.up('w');
  const p1 = await pos(page);
  check('the toy stays put while Pipwick talks', Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.05, `${JSON.stringify(p0)} → ${JSON.stringify(p1)}`);

  // --- Next by keyboard (E): a real flight to the Pavilion, the camera glides there
  const c0 = await camPos(page);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__toybox.welcome.state().stop === 1, null, { timeout: 60000 });
  await waitPhase(page, 1, 'talk');
  await frames(page, 3);
  const c1 = await camPos(page);
  check('E moves on to the next stop, and the camera flies there', Math.hypot(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]) > 5, `${c0.map((v) => v.toFixed(1))} → ${c1.map((v) => v.toFixed(1))}`);
  check('the Pavilion stop is the second', (await page.getAttribute('[data-testid=tour-card]', 'data-stop')) === 'pavilion');
  // The key press let audio start: the card follows Pipwick's voice a caption at a time.
  await page.waitForFunction(() => /Pavilion|legends|Blitz|Practise|points/.test(document.querySelector('[data-testid=tour-text]').textContent), null, { timeout: 60000 });
  const capText = (await page.textContent('[data-testid=tour-text]')).trim();
  check('the card shows one caption of the line, not the whole line', capText.length < 110 && capText.length > 10, capText);
  await page.screenshot({ path: `${OUT}/welcome-desktop-02-pavilion.png` });

  // --- Next by mouse, twice (the second click cuts the flight short), on to the trials
  await page.click('[data-testid=tour-next]');
  await page.click('[data-testid=tour-next]');
  await waitPhase(page, 2, 'talk');
  await frames(page, 4);
  check('the Trials Table stop', (await page.getAttribute('[data-testid=tour-card]', 'data-stop')) === 'trials');
  await page.screenshot({ path: `${OUT}/welcome-desktop-03-trials.png` });
  // --- on its own: with auto-advance back on, the Workshop's short line plays and the tour moves on to the shop
  await page.click('[data-testid=tour-next]');
  await page.click('[data-testid=tour-next]');
  await waitPhase(page, 3, 'talk');
  await page.evaluate(() => window.__toybox.welcome.autoAdvance(true));
  await page.waitForFunction(() => window.__toybox.welcome.state().stop === 4, null, { timeout: 90000 }).catch(() => null);
  w = await welcome(page);
  check('after a recorded line ends, the tour moves on by itself', w.stop === 4, JSON.stringify({ stop: w.stop, phase: w.phase }));
  await page.evaluate(() => window.__toybox.welcome.autoAdvance(false));
  // on to the jukebox and the pitch
  for (const n of [5, 6]) {
    await page.click('[data-testid=tour-next]');
    await page.click('[data-testid=tour-next]');
    await waitPhase(page, n, 'talk');
  }
  await frames(page, 4);
  check('the Jukebox stop', (await page.getAttribute('[data-testid=tour-card]', 'data-stop')) === 'jukebox');
  await page.screenshot({ path: `${OUT}/welcome-desktop-04-jukebox.png` });
  await page.click('[data-testid=tour-next]');
  await page.click('[data-testid=tour-next]');
  await waitPhase(page, 7, 'talk');
  await frames(page, 6);
  check('the pitch stop (ball, hoop and nets)', (await page.getAttribute('[data-testid=tour-card]', 'data-stop')) === 'play');
  await page.screenshot({ path: `${OUT}/welcome-desktop-04b-play.png` });

  // --- Esc skips (the focus is on a button after the clicks: blur it so the key reaches the game)
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid=tour-card]', { state: 'detached', timeout: 60000 });
  await frames(page, 4);
  w = await welcome(page);
  check('Esc skips the tour', w.mode === null && !w.flag.active, JSON.stringify(w));
  check('skipping marks the tour seen (saved)', (await saved(page)).tourSeen === true);
  check('no pause menu from that Esc', !(await page.isVisible('.pause')));
  const q0 = await pos(page);
  await page.keyboard.down('w');
  await frames(page, 20);
  await page.keyboard.up('w');
  const q1 = await pos(page);
  check('after the tour the toy walks again', Math.hypot(q1.x - q0.x, q1.z - q0.z) > 0.3, `${JSON.stringify(q0)} → ${JSON.stringify(q1)}`);

  // --- persistence: a reload does not show it again
  await page.reload();
  await page.waitForFunction(() => window.__toybox && window.__toybox.welcome && window.__toybox.state, null, { timeout: 180000 });
  await page.waitForSelector('.hud-sign', { timeout: 180000 });
  await frames(page, 40);
  check('after a reload the tour does not start again', (await welcome(page)).mode === null && !(await page.isVisible('[data-testid=tour-card]')));

  // --- talk to Pipwick: chat, another remark, replay the tour, skip it
  await page.evaluate(() => window.__toybox.hub.goTo('pipwick'));
  await page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Pipwick'), null, { timeout: 60000 });
  check('Pipwick has a Talk prompt by the plaza', (await page.textContent('.prompt')).includes('Talk to'));
  await page.keyboard.press('e');
  await page.waitForSelector('[data-testid=chat-card]', { timeout: 60000 });
  const hello = await page.textContent('[data-testid=chat-text]');
  await page.click('[data-testid=chat-more]');
  await page.waitForFunction((h) => document.querySelector('[data-testid=chat-text]').textContent !== h, hello, { timeout: 30000 });
  check('“Tell me something” gets another line', true);
  await frames(page, 3);
  await page.screenshot({ path: `${OUT}/welcome-desktop-05-chat.png` });
  await page.click('[data-testid=chat-tour]');
  await waitPhase(page, 0, 'talk');
  check('“Show me round” replays the tour from the start', (await welcome(page)).stop === 0);
  await page.click('[data-testid=tour-skip]');
  await page.waitForSelector('[data-testid=tour-card]', { state: 'detached', timeout: 60000 });

  // --- a gate greeter talks, and the gate still opens its trial
  const gates = await page.evaluate(() => window.__toybox.hub.gates());
  const cc = gates.find((g) => g.game === 'copycat-conductor');
  await page.evaluate((g) => window.__toybox.teleport(g.standX, g.standZ, g.yaw), cc);
  await page.waitForSelector('[data-testid=greeter-bubble][data-game=copycat-conductor]', { timeout: 60000 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid=greeter-bubble]')).opacity === '1', null, { timeout: 30000 });
  await frames(page, 3);
  const bub = await page.textContent('[data-testid=greeter-bubble]');
  check('the Copycat greeter says hello and asks for a go', /Maestro Tibbs/.test(bub) && /Want to have a go\?/.test(bub), bub);
  const bb = await box(page, '[data-testid=greeter-bubble]');
  check('the bubble is on screen', bb && bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= 960 && bb.y + bb.height <= 540, JSON.stringify(bb));
  check('the greeter’s line is asked for by id', (await page.evaluate(() => window.__toybox.voice.log())).some((l) => l.id === 'greeter-copycat-conductor'));
  await page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Copycat'), null, { timeout: 30000 });
  await page.screenshot({ path: `${OUT}/welcome-desktop-06-greeter.png` });
  await page.keyboard.press('e');
  await page.waitForSelector('.match-intro', { timeout: 120000 });
  check('the gate still opens its trial (the greeter does not block it)', true);
  await page.waitForFunction(() => window.__toybox.music.state().target.style !== null, null, { timeout: 30000 }).catch(() => {});
  const mIntro = await page.evaluate(() => window.__toybox.music.state());
  check('music: Copycat’s intro card has its own calm mood', mIntro.target.style === 'mood-bright', JSON.stringify(mIntro.target));
  await page.waitForTimeout(800);
  await page.click('[data-testid=match-leave]');
  await page.waitForSelector('.match-intro', { state: 'detached', timeout: 120000 });
  await page.waitForSelector('.hud-sign', { timeout: 120000 });
  await frames(page, 6);

  // Music Box Rhythm: no background music at all
  const mb = gates.find((g) => g.game === 'music-box-rhythm');
  await page.evaluate((g) => window.__toybox.teleport(g.standX, g.standZ, g.yaw), mb);
  await page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Music Box'), null, { timeout: 60000 });
  await page.keyboard.press('e');
  await page.waitForSelector('.match-intro', { timeout: 120000 });
  await frames(page, 6);
  const mRhythm = await page.evaluate(() => window.__toybox.music.state());
  check('music: Music Box Rhythm keeps its own music (background silent)', mRhythm.target.style === null, JSON.stringify(mRhythm.target));
  await page.waitForTimeout(800);
  await page.click('[data-testid=match-leave]');
  await page.waitForSelector('.match-intro', { state: 'detached', timeout: 120000 });
  await page.waitForSelector('.hud-sign', { timeout: 120000 });
  await frames(page, 6);

  // --- the Jukebox
  await page.evaluate(() => window.__toybox.hub.goTo('jukebox'));
  await page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Jukebox'), null, { timeout: 60000 });
  await frames(page, 3);
  await page.screenshot({ path: `${OUT}/welcome-desktop-07-jukebox-prop.png` });
  await page.keyboard.press('e');
  await page.waitForSelector('[data-testid=jukebox-list]', { timeout: 60000 });
  const tracks = await page.$$eval('.jukebox__track strong', (els) => els.map((e) => e.textContent));
  check('the Jukebox lists its named tracks', tracks.length >= 5 && tracks.includes('Tin Lullaby'), tracks.join(', '));
  await page.click('[data-testid=jukebox-tin-lullaby]');
  await page.waitForFunction(() => document.querySelector('[data-testid=jukebox-tin-lullaby]').getAttribute('aria-pressed') === 'true');
  check('picking a track saves it (per player, this device)', (await saved(page)).hubTrack === 'tin-lullaby');
  await page.screenshot({ path: `${OUT}/welcome-desktop-08-jukebox-list.png` });
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid=jukebox-list]', { state: 'detached' });
  await page.waitForFunction(() => window.__toybox.music.state().target.style === 'tin-lullaby', null, { timeout: 30000 }).catch(() => {});
  const m = await page.evaluate(() => window.__toybox.music.state());
  check('music director follows the jukebox choice', m.target.style === 'tin-lullaby', JSON.stringify(m));
  if (m.running) {
    await page.waitForFunction(() => window.__toybox.music.state().style === 'tin-lullaby' && window.__toybox.music.state().bars > 0, null, { timeout: 60000 }).catch(() => {});
    const m2 = await page.evaluate(() => window.__toybox.music.state());
    check('music is scheduled on the audio clock after a gesture (crossfaded to the new track)', m2.style === 'tin-lullaby' && m2.bars > 0 && m2.notes > 0, JSON.stringify(m2));
  } else check('music: AudioContext not running in this browser (scheduling not exercised)', true, 'skipped');

  // --- settings: Music and Voice sliders
  await page.keyboard.press('Escape');
  await page.waitForSelector('.pause', { timeout: 60000 });
  check('settings have Music and Voice volume sliders', (await page.isVisible('[data-testid=setting-music]')) && (await page.isVisible('[data-testid=setting-voice]')));
  const mv0 = (await saved(page)).musicVolume;
  await page.focus('[data-testid=setting-music]');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(([k, v]) => JSON.parse(localStorage.getItem(k)).state.musicVolume < v, [KEY, mv0], { timeout: 10000 }).catch(() => {});
  const mv1 = (await saved(page)).musicVolume;
  check('the Music slider changes the saved music volume', mv1 < mv0, `${mv0} → ${mv1}`);
  const vv0 = (await saved(page)).voiceVolume;
  await page.focus('[data-testid=setting-voice]');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(([k, v]) => JSON.parse(localStorage.getItem(k)).state.voiceVolume < v, [KEY, vv0], { timeout: 10000 }).catch(() => {});
  check('the Voice slider changes the saved voice volume', (await saved(page)).voiceVolume < vv0);

  // --- main menu → How to play → Take the Hub tour
  await page.click('text=Main menu');
  await page.waitForSelector('[data-testid=menu-howto]');
  await page.click('[data-testid=menu-howto]');
  await page.click('[data-testid=howto-tour]');
  await page.waitForSelector('[data-testid=tour-card]', { timeout: 180000 });
  check('How to play → Take the Hub tour replays it in the Hub', (await welcome(page)).mode === 'tour');
  await page.click('[data-testid=tour-skip]');
  await page.waitForSelector('[data-testid=tour-card]', { state: 'detached', timeout: 60000 });

  check('desktop: no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function phone(browser) {
  const { ctx, page, errors } = await open(browser, { ...devices['Pixel 7'] }, { state: { tutorials: false }, version: 1 });
  await page.waitForSelector('[data-testid=tour-card]', { timeout: 180000 });
  await page.evaluate(() => window.__toybox.welcome.autoAdvance(false));
  await waitPhase(page, 0, 'talk');
  await frames(page, 3);
  const vp = page.viewportSize();
  check('phone portrait: the tour starts on a first visit', (await welcome(page)).mode === 'tour');
  check('phone: joystick hidden during the tour', !(await page.isVisible('.touch-stick-zone')));
  for (const id of ['tour-next', 'tour-skip']) {
    const b = await box(page, `[data-testid=${id}]`);
    check(`phone: ${id} is a ≥56 px target inside the screen`, b && b.height >= 56 && b.width >= 56 && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height, JSON.stringify(b));
  }
  const card = await box(page, '[data-testid=tour-card]');
  check('phone: the card leaves most of the screen to the scene', card && card.height < vp.height * 0.4, JSON.stringify(card));
  await page.screenshot({ path: `${OUT}/welcome-phone-01-hello.png` });
  await page.tap('[data-testid=tour-next]');
  await page.tap('[data-testid=tour-next]');
  await waitPhase(page, 1, 'talk');
  await page.tap('[data-testid=tour-next]');
  await page.tap('[data-testid=tour-next]');
  await waitPhase(page, 2, 'talk');
  await page.tap('[data-testid=tour-next]');
  await page.tap('[data-testid=tour-next]');
  await waitPhase(page, 3, 'talk');
  await frames(page, 4);
  check('phone: tapping Next moves through the stops', (await welcome(page)).stop === 3);
  await page.screenshot({ path: `${OUT}/welcome-phone-02-trials.png` });
  await page.tap('[data-testid=tour-skip]');
  await page.waitForSelector('[data-testid=tour-card]', { state: 'detached', timeout: 60000 });
  await frames(page, 4);
  check('phone: Skip ends it and saves it as seen', (await saved(page)).tourSeen === true);
  check('phone: the joystick is back', await page.isVisible('.touch-stick-zone'));

  // a greeter's bubble on a narrow screen
  const gates = await page.evaluate(() => window.__toybox.hub.gates());
  const sq = gates.find((g) => g.game === 'toy-squad');
  await page.evaluate((g) => window.__toybox.teleport(g.standX, g.standZ, g.yaw), sq);
  await page.waitForSelector('[data-testid=greeter-bubble][data-game=toy-squad]', { timeout: 60000 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid=greeter-bubble]')).opacity === '1', null, { timeout: 30000 });
  await frames(page, 3);
  const bb = await box(page, '[data-testid=greeter-bubble]');
  check('phone: the greeter bubble fits on screen', bb && bb.x >= 0 && bb.x + bb.width <= vp.width && bb.y >= 0, JSON.stringify(bb));
  check('phone: the gate’s Play button is still there', await page.isVisible('.prompt--touch'));
  await page.screenshot({ path: `${OUT}/welcome-phone-03-greeter.png` });

  // the jukebox by touch
  await page.evaluate(() => window.__toybox.hub.goTo('jukebox'));
  await page.waitForSelector('.prompt--touch', { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('.prompt--touch')?.textContent.includes('Jukebox'), null, { timeout: 60000 });
  await page.tap('.prompt--touch');
  await page.waitForSelector('[data-testid=jukebox-list]', { timeout: 60000 });
  const t = await box(page, '[data-testid=jukebox-felt-and-sawdust]');
  check('phone: jukebox tracks are ≥56 px tall', t && t.height >= 56, JSON.stringify(t));
  await page.tap('[data-testid=jukebox-felt-and-sawdust]');
  await page.waitForFunction(() => document.querySelector('[data-testid=jukebox-felt-and-sawdust]').getAttribute('aria-pressed') === 'true');
  check('phone: picking a track by touch saves it', (await saved(page)).hubTrack === 'felt-and-sawdust');
  await page.screenshot({ path: `${OUT}/welcome-phone-04-jukebox.png` });

  check('phone: no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    if (want('desktop')) await desktop(browser);
    if (want('phone')) await phone(browser);
  } catch (e) {
    check('suite ran to the end', false, e.message.split('\n')[0]);
  }
  await browser.close();
  const failed = results.filter((r) => r.startsWith('FAIL'));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
