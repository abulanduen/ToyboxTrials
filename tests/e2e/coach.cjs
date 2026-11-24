/* First-time menu tips ("coach marks", src/ui/CoachMarks.tsx), with real input: desktop (keyboard
 * and mouse), then emulated phones (real touch) in portrait and landscape.
 *
 *   npx vite build --outDir /tmp/coach-dist && npx vite preview --outDir /tmp/coach-dist --port 4312 --strictPort &
 *   BASE_URL=http://localhost:4312/ node tests/e2e/coach.cjs        (ONLY=desktop|portrait|landscape|off|shots runs some)
 *
 * Checks: the first open of a menu shows its tour; Next / Back / Skip / Done by mouse, touch and
 * keys (Enter, →, ←, Esc); at every step the card is on screen and never covers the part it points
 * at, and the outline sits on that part; the menu underneath still works; Esc only skips (the menu
 * stays open, and Enter on the main menu doesn't start play); reopening the menu doesn't show it
 * again, nor does a reload; Settings' "Show menu tips again" brings the tours back; with "Game
 * tutorials" off no tour ever shows. Desktop also runs the Scoreboard, Jukebox, Workshop, shop and
 * trial intro tours; the portrait phone turns sideways mid-tour.
 * SHOTS_DIR=<dir> also walks the Pavilion tour once more on desktop and the portrait phone at 2×
 * pixels, saving a screenshot of every step (slow under software GL). Waits are on conditions.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://localhost:4312/';
const SHOTS = process.env.SHOTS_DIR || null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (n) => !ONLY || ONLY.includes(n);
const T = +process.env.E2E_TIMEOUT || 240000;
const KEY = 'toybox-trials:prototype:v1';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  console.log(results[results.length - 1]);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const phone = (w, h, scale = 1) => ({ viewport: { width: w, height: h }, screen: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: scale, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' });
const PAVILION_STEPS = ['pavilion-tabs', 'pavilion-formats', 'pavilion-rule', 'pavilion-bots', 'pavilion-practice', 'pavilion-start'];

async function open(browser, opts, seed, hash = '#play') {
  const ctx = await browser.newContext(opts);
  // seeded once per tab, so reloads keep what the game saved
  await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, JSON.stringify(s)); } }, [KEY, seed]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}?debug${hash}`);
  await page.waitForSelector('.loading', { state: 'detached', timeout: 900000 });
  return { ctx, page, errors };
}
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').state || {}, KEY);

/** The tour on screen: its step, where the card is, and whether it covers the part it points at. */
const coach = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('.coach');
    if (!root) return null;
    const card = root.querySelector('.coach__card');
    const spot = root.querySelector('.coach__spot').getBoundingClientRect();
    const k = { x: card.offsetLeft, y: card.offsetTop, w: card.offsetWidth, h: card.offsetHeight };
    const step = root.dataset.step;
    const el = [...document.querySelectorAll(`[data-coach="${step}"]`)].find((e) => e.getClientRects().length);
    const cut = (a, b) => {
      const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
      const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
      return w > 0 && h > 0 ? { x, y, w, h } : null;
    };
    const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    // the part of the target that can be seen (inside scrolling panels and the screen)
    let t = el ? rect(el) : null;
    for (let p = el && el.parentElement; p && t; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') t = cut(t, rect(p));
    }
    t = t && cut(t, { x: 0, y: 0, w: innerWidth, h: innerHeight });
    const over = t ? cut(k, t) : null;
    // layout sizes (offset*), so the card's pop-in animation can't shrink them mid-measurement
    const btns = [...card.querySelectorAll('button')].map((b) => ({ width: b.offsetWidth, height: b.offsetHeight }));
    return {
      tour: root.dataset.tour,
      step,
      side: root.dataset.side,
      count: card.querySelector('[data-testid=coach-count]').textContent.replace(/\s+/g, ' ').trim(),
      next: card.querySelector('[data-testid=coach-next]').textContent.trim(),
      backDisabled: card.querySelector('[data-testid=coach-back]').disabled,
      inside: k.x >= 0 && k.y >= 0 && k.x + k.w <= innerWidth + 0.5 && k.y + k.h <= innerHeight + 0.5,
      covers: over ? Math.round(over.w * over.h) : 0,
      seen: !!t,
      spotOk: !!t && Math.abs(spot.left - t.x + 6) < 3 && Math.abs(spot.top - t.y + 6) < 3 && Math.abs(spot.width - t.w - 12) < 3,
      minButton: Math.round(Math.min(...btns.map((b) => Math.min(b.width, b.height)))),
      card: k,
      target: t && { x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.w), h: Math.round(t.h) },
    };
  });

/** The tour once the card, outline and target have stopped moving (menu animations, the 0.4 s re-layout). */
async function settled(page) {
  let a = await coach(page);
  for (let i = 0; i < 20 && a; i++) {
    await sleep(500);
    const b = await coach(page);
    const key = (c) => c && JSON.stringify([c.step, c.card, c.target, c.spotOk]);
    if (key(a) === key(b)) return b;
    a = b;
  }
  return a;
}
/** Wait for a tour (optionally a given step) and let it settle. */
async function waitCoach(page, tour, step, ms = 60000) {
  await page.waitForFunction(([tour, step]) => { const r = document.querySelector('.coach'); return r && r.dataset.tour === tour && (!step || r.dataset.step === step); }, [tour, step], { timeout: ms });
  return settled(page);
}
const gone = (page, ms = 30000) => page.waitForSelector('.coach', { state: 'detached', timeout: ms }).then(() => true, () => false);
/** No tour shows within `ms` (the tours start about half a second after a menu settles). */
const staysAway = async (page, ms = 3500) => { await sleep(ms); return !(await page.$('.coach')); };

/** At this step: the card is on screen, covers none of its part, outlines it; buttons big enough on touch. */
function placement(label, c, touch) {
  check(`${label}: card on screen and clear of "${c.step}"`, c.inside && c.covers === 0 && c.seen && c.side !== 'overlap', `side ${c.side}, covers ${c.covers}px², card ${JSON.stringify(c.card)}, target ${JSON.stringify(c.target)}`);
  check(`${label}: outline round "${c.step}"`, c.spotOk);
  if (touch) check(`${label}: card buttons ≥ 56 px`, c.minButton >= 56, `${c.minButton}px`);
}

/** Walk a whole tour with Next, checking each step; returns the steps seen. */
async function walk(page, label, tour, { touch, press, shots } = {}) {
  const steps = [];
  let c = await waitCoach(page, tour);
  for (let i = 0; i < 10 && c; i++) {
    steps.push(c.step);
    placement(`${label} step ${i + 1} (${c.count})`, c, touch);
    if (shots) await page.screenshot({ path: path.join(SHOTS, `${shots}-${String(i + 1).padStart(2, '0')}-${c.step}.png`), animations: 'disabled', timeout: T });
    const last = c.next === 'Done';
    const prev = c.step;
    await press();
    if (last) break;
    await page.waitForFunction((p) => { const r = document.querySelector('.coach'); return !r || r.dataset.step !== p; }, prev, { timeout: 30000 });
    c = await settled(page);
  }
  return steps;
}

const LABEL = { pavilion: 'Pavilion', scoreboard: 'Scoreboard', jukebox: 'Jukebox' };
/** Walk up to a Hub spot (teleport) and use it: E on desktop, the prompt button on a phone. */
async function hubOpen(page, spot, touch, sel) {
  await page.evaluate((s) => window.__toybox.hub.goTo(s), spot);
  // wait for this spot's own prompt (the last one can linger for a frame or two)
  await page.waitForFunction((t) => document.querySelector('.prompt')?.textContent.includes(t), LABEL[spot], { timeout: 120000 });
  await sleep(400);
  if (touch) await page.tap('.prompt--touch');
  else await page.keyboard.press('KeyE');
  await page.waitForSelector(sel, { timeout: 60000 });
}

// ------------------------------------------------------------------ desktop
async function desktop(browser) {
  const { ctx, page, errors } = await open(browser, { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, { state: { tourSeen: true, quality: 'low' }, version: 2 }, '');
  const L = 'desktop';

  // --- the main menu, first run: keys
  let c = await waitCoach(page, 'menu');
  check(`${L}: first run shows the main menu tips`, c && c.step === 'menu-play' && c.count === '1 / 4' && c.backDisabled, JSON.stringify(c && { step: c.step, count: c.count }));
  placement(`${L} menu step 1`, c);
  await page.keyboard.press('Enter');
  c = await waitCoach(page, 'menu', 'menu-workshop');
  check(`${L}: Enter moves on (and doesn't start play)`, c.count === '2 / 4' && (await page.isVisible('[data-testid=menu-play]')));
  placement(`${L} menu step 2`, c);
  await page.keyboard.press('ArrowLeft');
  c = await waitCoach(page, 'menu', 'menu-play');
  check(`${L}: ← goes back`, c.count === '1 / 4');
  await page.keyboard.press('ArrowRight');
  c = await waitCoach(page, 'menu', 'menu-workshop');
  check(`${L}: → goes on`, c.count === '2 / 4');
  await page.keyboard.press('Escape');
  check(`${L}: Esc skips the tour`, await gone(page));
  check(`${L}: …and leaves the main menu as it was`, (await page.isVisible('[data-testid=menu-play]')) && !(await page.isVisible('.cardboard-panel')));
  check(`${L}: the main menu tips are saved as seen`, (await saved(page)).coachSeen?.includes('menu'), JSON.stringify((await saved(page)).coachSeen));

  // --- the Pavilion: mouse
  await page.click('[data-testid=menu-play]');
  await page.waitForSelector('.hud-sign', { timeout: 120000 });
  await hubOpen(page, 'pavilion', false, '.formats');
  c = await waitCoach(page, 'pavilion');
  check(`${L}: opening the Pavilion shows its tips`, c.step === 'pavilion-tabs' && c.count === '1 / 6', `${c.step} ${c.count}`);
  await page.click('[data-testid=coach-next]');
  c = await waitCoach(page, 'pavilion', 'pavilion-formats');
  // the menu underneath still works while the tips show
  await page.click('[data-testid=format-normal]');
  check(`${L}: the format cards still answer clicks under the tips`, (await page.getAttribute('[data-testid=format-normal]', 'aria-checked')) === 'true' && !!(await page.$('.coach')));
  await page.click('[data-testid=coach-back]');
  c = await waitCoach(page, 'pavilion', 'pavilion-tabs');
  check(`${L}: Back (mouse) returns to the first step`, c.count === '1 / 6' && c.backDisabled);
  const steps = await walk(page, `${L} Pavilion`, 'pavilion', { press: () => page.click('[data-testid=coach-next]') });
  check(`${L}: the Pavilion tour visits tabs, formats, points, bots, single trials and Start`, steps.join() === PAVILION_STEPS.join(), steps.join());
  check(`${L}: Done ends it, the Pavilion stays open`, (await gone(page)) && (await page.isVisible('.formats')));
  await page.click('.info-panel .pause__actions .toy-btn--ink'); // Not now
  await page.waitForSelector('.formats', { state: 'detached' });
  await hubOpen(page, 'pavilion', false, '.formats');
  check(`${L}: reopening the Pavilion doesn't show the tips again`, await staysAway(page));
  await page.click('.info-panel .pause__actions .toy-btn--ink');

  // --- the Scoreboard: Esc only skips
  await hubOpen(page, 'scoreboard', false, '.scoreboard');
  c = await waitCoach(page, 'scoreboard');
  placement(`${L} scoreboard step 1`, c);
  await page.keyboard.press('Escape');
  check(`${L}: Esc skips the Scoreboard tips without closing the Scoreboard`, (await gone(page)) && (await page.isVisible('.scoreboard')));
  await page.keyboard.press('Escape');
  check(`${L}: the next Esc closes the Scoreboard as usual`, await page.waitForSelector('.scoreboard', { state: 'detached', timeout: 20000 }).then(() => true, () => false));

  // --- the Jukebox: Enter through to Done
  await hubOpen(page, 'jukebox', false, '[data-testid=jukebox-list]');
  const jk = await walk(page, `${L} Jukebox`, 'jukebox', { press: () => page.keyboard.press('Enter') });
  check(`${L}: the Jukebox tour has its two steps (Enter to Done)`, jk.join() === 'jukebox-tracks,jukebox-note' && (await gone(page)), jk.join());
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid=jukebox-list]', { state: 'detached' });

  // --- a reload keeps them seen
  await page.reload();
  await page.waitForSelector('.loading', { state: 'detached', timeout: 900000 });
  await page.waitForSelector('.hud-sign', { timeout: 120000 });
  await hubOpen(page, 'pavilion', false, '.formats');
  check(`${L}: after a reload the Pavilion tips stay seen`, await staysAway(page));
  const s1 = await saved(page);
  check(`${L}: the seen list is saved`, ['menu', 'pavilion', 'scoreboard', 'jukebox'].every((id) => s1.coachSeen.includes(id)), JSON.stringify(s1.coachSeen));
  await page.click('.info-panel .pause__actions .toy-btn--ink');
  await page.waitForSelector('.formats', { state: 'detached' });

  // --- Settings: show the tips again
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid=setting-coach-replay]', { timeout: 30000 });
  const rb = await page.locator('[data-testid=setting-coach-replay]').boundingBox();
  check(`${L}: "Show menu tips again" is in the pause menu's settings`, !!rb && rb.height >= 56, JSON.stringify(rb));
  await page.click('[data-testid=setting-coach-replay]');
  check(`${L}: …and clears the seen list`, ((await saved(page)).coachSeen || []).length === 0);
  await page.click('.pause__actions .toy-btn >> nth=0'); // Resume
  await page.waitForSelector('.pause__grid', { state: 'detached' });
  await hubOpen(page, 'pavilion', false, '.formats');
  c = await waitCoach(page, 'pavilion');
  check(`${L}: after replaying, the Pavilion tips show again`, c.step === 'pavilion-tabs');
  await page.click('[data-testid=coach-skip]');
  check(`${L}: Skip (mouse) ends them`, (await gone(page)) && (await page.isVisible('.formats')));
  await page.click('.info-panel .pause__actions .toy-btn--ink');
  await page.waitForSelector('.formats', { state: 'detached' });

  // --- the Workshop and the shop (from the pause menu)
  await page.keyboard.press('Escape');
  await page.click('.pause__actions .toy-btn >> nth=1'); // Workshop
  await page.waitForSelector('.workshop-panel', { timeout: 60000 });
  const ws = await walk(page, `${L} Workshop`, 'workshop', { press: () => page.keyboard.press('ArrowRight') });
  check(`${L}: the Workshop tour (→ to Done)`, ws.join() === 'workshop-tabs,workshop-items,workshop-name,workshop-actions' && (await gone(page)), ws.join());
  await page.click('[data-testid=workshop-to-shop]');
  await page.waitForSelector('[data-testid=shop]', { timeout: 60000 });
  const sh = await walk(page, `${L} shop`, 'shop', { press: () => page.click('[data-testid=coach-next]') });
  check(`${L}: the shop tour`, sh.join() === 'shop-wallet,shop-featured,shop-tabs,shop-detail' && (await gone(page)), sh.join());
  await page.click('[data-testid=shop-done]');
  await page.waitForSelector('.hud-sign', { timeout: 60000 });

  // --- a trial's intro card (once, for the first trial opened)
  const openGate = async (game) => {
    const title = await page.evaluate((id) => { const g = window.__toybox.hub.gates().find((x) => x.game === id); window.__toybox.teleport(g.standX, g.standZ, g.yaw); return g.title; }, game);
    await page.waitForFunction((t) => document.querySelector('.prompt')?.textContent.includes(t), title, { timeout: 120000 });
    await sleep(400);
    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-testid=match-start]', { timeout: T });
  };
  await openGate('copycat-conductor');
  const tr = await walk(page, `${L} trial intro`, 'trial', { press: () => page.click('[data-testid=coach-next]') });
  check(`${L}: the trial intro tour (how to play, opponents, online lobby, start)`, tr.join() === 'trial-howto,trial-opponents,trial-host,trial-start' && (await gone(page)), tr.join());
  await sleep(800);
  await page.click('[data-testid=match-leave]');
  await page.waitForSelector('.hud-sign', { timeout: T });
  await openGate('jack-in-the-box');
  check(`${L}: another trial's intro doesn't repeat them`, await staysAway(page));
  await sleep(800);
  await page.click('[data-testid=match-leave]');
  await page.waitForSelector('.hud-sign', { timeout: T });

  check(`${L}: no page or console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ phones
async function phoneRun(browser, layout) {
  const portrait = layout === 'portrait';
  const opts = portrait ? phone(390, 844) : phone(844, 390);
  const L = `phone ${layout}`;
  const { ctx, page, errors } = await open(browser, opts, { state: { tourSeen: true, quality: 'low', autoOnline: false }, version: 2 }, '');
  const tap = (sel) => page.tap(sel);

  // main menu tips by touch: Next, then Skip
  let c = await waitCoach(page, 'menu');
  placement(`${L} menu step 1`, c, true);
  await tap('[data-testid=coach-next]');
  c = await waitCoach(page, 'menu', 'menu-workshop');
  placement(`${L} menu step 2`, c, true);
  await tap('[data-testid=coach-skip]');
  check(`${L}: Skip (touch) ends the main menu tips`, await gone(page));

  await tap('[data-testid=menu-play]');
  await page.waitForSelector('.hud-sign', { timeout: 120000 });
  await hubOpen(page, 'pavilion', true, '.formats');
  c = await waitCoach(page, 'pavilion');
  check(`${L}: the Pavilion tips show on first open`, c.step === 'pavilion-tabs' && c.count === '1 / 6');
  await tap('[data-testid=coach-next]');
  c = await waitCoach(page, 'pavilion', 'pavilion-formats');
  await tap('[data-testid=coach-back]');
  c = await waitCoach(page, 'pavilion', 'pavilion-tabs');
  check(`${L}: Back (touch)`, c.count === '1 / 6');
  if (portrait) {
    // turn the phone sideways mid-tour, and back
    await tap('[data-testid=coach-next]');
    await waitCoach(page, 'pavilion', 'pavilion-formats');
    await page.setViewportSize({ width: 844, height: 390 });
    await sleep(1500);
    c = await settled(page);
    placement(`${L} turned sideways`, c, true);
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(1500);
    c = await settled(page);
    placement(`${L} turned back`, c, true);
    await tap('[data-testid=coach-back]');
    await waitCoach(page, 'pavilion', 'pavilion-tabs');
  }
  const steps = await walk(page, `${L} Pavilion`, 'pavilion', { touch: true, press: () => tap('[data-testid=coach-next]') });
  check(`${L}: the Pavilion tour visits every part`, steps.join() === PAVILION_STEPS.join(), steps.join());
  check(`${L}: Done (touch) ends it, the Pavilion stays open`, (await gone(page)) && (await page.isVisible('.formats')));
  await tap('.info-panel .pause__actions .toy-btn--ink');
  await page.waitForSelector('.formats', { state: 'detached' });
  await hubOpen(page, 'pavilion', true, '.formats');
  check(`${L}: reopening doesn't show them again`, await staysAway(page));
  await page.reload();
  await page.waitForSelector('.loading', { state: 'detached', timeout: 900000 });
  await page.waitForSelector('.hud-sign', { timeout: 120000 });
  await hubOpen(page, 'pavilion', true, '.formats');
  check(`${L}: nor after a reload`, await staysAway(page));
  check(`${L}: no page or console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ screenshots (SHOTS_DIR, 2× pixels)
async function screenshots(browser) {
  for (const [name, opts, touch] of [['desktop', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }, false], ['portrait', phone(390, 844, 2), true]]) {
    const { ctx, page } = await open(browser, opts, { state: { tourSeen: true, quality: 'low', autoOnline: false, coachSeen: ['menu'] }, version: 2 });
    await page.waitForSelector('.hud-sign', { timeout: 120000 });
    await hubOpen(page, 'pavilion', touch, '.formats');
    const press = () => (touch ? page.tap('[data-testid=coach-next]') : page.click('[data-testid=coach-next]'));
    const steps = await walk(page, `shots ${name}`, 'pavilion', { touch, press, shots: `${name}-pavilion` });
    check(`shots ${name}: ${steps.length} Pavilion steps saved`, steps.length === PAVILION_STEPS.length);
    await ctx.close();
  }
}

// ------------------------------------------------------------------ tutorials off
async function tutorialsOff(browser) {
  const L = 'tutorials off';
  const { ctx, page, errors } = await open(browser, phone(390, 844), { state: { tourSeen: true, quality: 'low', tutorials: false, autoOnline: false }, version: 2 }, '');
  check(`${L}: no main menu tips`, await staysAway(page, 4000));
  await page.tap('[data-testid=menu-play]');
  await page.waitForSelector('.hud-sign', { timeout: 120000 });
  await hubOpen(page, 'pavilion', true, '.formats');
  check(`${L}: no Pavilion tips`, await staysAway(page, 4000));
  check(`${L}: nothing marked seen`, ((await saved(page)).coachSeen || []).length === 0);
  check(`${L}: no page or console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  for (const [name, run] of [['desktop', desktop], ['portrait', (b) => phoneRun(b, 'portrait')], ['landscape', (b) => phoneRun(b, 'landscape')], ['off', tutorialsOff], ['shots', screenshots]]) {
    if (!want(name) || (name === 'shots' && !SHOTS)) continue;
    try {
      await run(browser);
    } catch (e) {
      check(`${name}: suite ran to the end`, false, e.message.split('\n')[0]);
    }
  }
  await browser.close();
  const failed = results.filter((r) => r.startsWith('FAIL'));
  console.log(`\n${results.length - failed.length}/${results.length} passed${SHOTS ? ` · screenshots in ${SHOTS}` : ''}`);
  process.exit(failed.length ? 1 : 0);
})();
