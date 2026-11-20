/* Odd Page Out (spot the difference): desktop (mouse + keyboard), phone portrait and phone landscape
   (real touch events). Opens the game from the Pavilion's practice list, finds differences by real
   clicks/taps, checks the wrong-tap lockout, finishes a round, reaches the results and goes back to
   the hub. Screenshots of every scene (desktop) and of both phone layouts go to tests/e2e/output/sd-*.
   Run: npx vite preview --port 4201 &  BASE_URL=http://localhost:4201/ node tests/e2e/spotdiff.cjs
   ONLY=desktop|portrait|landscape runs one part. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4201/';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const SHOT_MS = 240000; // software GL under load is slow
const res = [];
const check = (n, ok, d = '') => {
  res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
  console.log(res[res.length - 1]);
};

function driver(page, tapAt) {
  const S = () =>
    page.evaluate(() => {
      const t = window.__toybox;
      const s = t.match.state();
      if (!s || !s.data || !s.players) return null;
      const me = s.players.find((p) => p.id === 'you');
      const sd = t.spotdiff;
      return {
        matchPhase: t.match.phase(),
        phase: s.phase,
        round: s.round,
        theme: s.data.theme,
        phaseT: s.phaseT,
        me: { found: me.found.length, score: me.score, lockMs: me.lockMs, wrong: me.wrong, done: me.done, bonus: me.bonus, finds: me.finds },
        players: s.players.map((p) => ({ id: p.id, found: p.found.length, score: p.score, done: p.done })),
        slots: sd ? sd.slots() : [],
        misses: sd ? sd.misses() : [],
        open: sd ? sd.open() : false,
        cursor: sd ? sd.cursor() : -1,
        cursorAt: sd ? sd.cursorAt() : null,
        layout: sd ? sd.layout() : null,
      };
    });
  const waitS = async (pred, label, ms = 240000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const f = await S();
      if (f && pred(f)) return f;
      await page.waitForTimeout(150);
    }
    throw new Error('timeout waiting for ' + label);
  };
  const scale = (k) => page.evaluate((k) => window.__toybox.match.timeScale(k), k);
  const frames = (n) => page.evaluate((n) => new Promise((done) => { const f = () => (--n <= 0 ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const snap = async (name) => {
    await frames(3);
    await page.waitForTimeout(450); // CSS pop-ins (rings, banners)
    await frames(1);
    await page.screenshot({ path: `${OUT}/${name}`, timeout: SHOT_MS });
  };
  /** Wait for round `round`'s search, then freeze time. */
  const frozenSearch = async (round, speed = 4) => {
    await scale(speed);
    const f = await waitS((x) => x.phase === 'search' && x.round === round && x.phaseT > 150 && x.slots.length === 15, `round ${round} search`);
    await scale(0);
    await frames(2);
    return f;
  };
  /** Let the (frozen) rules run briefly until `pred`, then freeze again. */
  const settle = async (pred, label) => {
    await scale(0.2);
    const f = await waitS(pred, label, 120000);
    await scale(0);
    return f;
  };
  const tapSlot = (sl, page2) => tapAt(page2 ? sl.b.x : sl.a.x, page2 ? sl.b.y : sl.a.y);
  return { S, waitS, scale, frames, snap, frozenSearch, settle, tapSlot };
}

const seedLow = (page) =>
  page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, quality: 'low', tutorials: false }, version: 0 }));
    }
  });

/** From the hub: walk to the Pavilion, open it, pick Odd Page Out from the practice list. */
async function openFromPavilion(page, mobile) {
  await page.goto(BASE + '?debug#play');
  await page.waitForSelector('.loading', { state: 'detached', timeout: 120000 });
  await page.evaluate(() => window.__toybox.hub.goTo('pavilion'));
  await page.waitForSelector('.prompt', { timeout: 120000 });
  if (mobile) await page.locator('.prompt').tap();
  else await page.keyboard.press('KeyE');
  await page.getByTestId('practice-group-party').click(); // the practice list opens by section
  const entry = page.getByTestId('practice-odd-page-out');
  await entry.waitFor({ state: 'visible', timeout: 120000 });
  if (mobile) await entry.tap();
  else await entry.click();
  await page.waitForSelector('.match-intro', { timeout: 120000 });
  await page.getByTestId('match-start').waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
}

async function pickBots(page, mobile, n, skill) {
  const a = page.getByRole('button', { name: n === 0 ? 'Solo' : `${n} bot${n > 1 ? 's' : ''}`, exact: true });
  if (mobile) await a.tap();
  else await a.click();
  if (n > 0) {
    const b = page.getByRole('button', { name: skill, exact: true });
    if (mobile) await b.tap();
    else await b.click();
  }
}

const THEME_TITLES = { toyshop: 'The Toy Shop', picnic: 'The Garden Picnic', bathtime: 'Pirate Bath-Time', bedtime: 'Bedtime' };

async function desktop(browser, errors) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await seedLow(page);
  const d = driver(page, (x, y) => page.mouse.click(x, y));

  await openFromPavilion(page, false);
  check('desktop: the Pavilion practice list opens Odd Page Out (lazy-loaded)', (await page.textContent('.match-intro h2')).includes('Odd Page Out'));
  check('desktop: intro shows mouse and keyboard controls', (await page.$$('.intro-controls .keycap')).length === 3);
  await pickBots(page, false, 3, 'easy');
  await page.screenshot({ path: `${OUT}/sd-01-intro.png`, timeout: SHOT_MS });

  await page.getByTestId('match-start').click();
  await page.waitForSelector('.countdown', { timeout: 60000 });
  await d.scale(6);
  let f = await d.waitS((x) => x.phase === 'turn', 'page turn');
  await d.scale(0);
  await page.waitForSelector('[data-testid=sd-cover]', { timeout: 60000 });
  check('desktop: each page opens with a cover card naming the scene', (await page.textContent('[data-testid=sd-cover]')).includes(THEME_TITLES[f.theme]), f.theme);
  check('desktop: no taps count while the cover is up', !f.open);
  await d.snap('sd-02-cover.png');

  // ---- round 1: mouse ----
  f = await d.frozenSearch(1);
  const themes = [f.theme];
  const L = f.layout;
  check('desktop: pages side by side, 4 : 3, inside the window and below the HUD', !L.portrait && L.pics[0].x + L.pics[0].w <= L.pics[1].x && L.pics.every((p) => p.x >= 0 && p.x + p.w <= 1920 && p.y + p.h <= 1080 && Math.abs(p.h / p.w - 0.75) < 0.01), JSON.stringify(L.pics));
  check('desktop: storybook pictures use the enlarged 820 px cap', L.pics[0].w === 820);
  const hudBottom = await page.evaluate(() => document.querySelector('.sd-top').getBoundingClientRect().bottom);
  check('desktop: the HUD does not cover the book', hudBottom <= L.book.y + 2, `${Math.round(hudBottom)} vs ${L.book.y}`);
  check('desktop: 15 differences, each with a hit circle on both pages', f.slots.length === 15 && f.slots.every((s) => s.a.r > 20 && Math.abs(s.a.x - (s.b.x - (L.pics[1].x - L.pics[0].x))) < 1));
  const svgs = await page.$$eval('.sd-pic svg.sd-art', (els) => els.length);
  check('desktop: both pictures are vector SVG (crisp at any pixel ratio)', svgs === 2);
  await d.snap(`sd-03-search-r1-${f.theme}.png`);
  check('desktop: the mini leaderboard lists all four toys', (await page.$$('[data-testid=sd-board] .sd-chip')).length === 4);

  // three finds, alternating pages
  for (let i = 0; i < 3; i++) await d.tapSlot(f.slots[i], i % 2 === 1);
  f = await d.settle((x) => x.me.found === 3, 'three finds');
  check('desktop: clicking differences on either page finds them (+10 each)', f.me.found === 3 && f.me.score === 30, `found ${f.me.found}, ${f.me.score} pts`);
  // the HUD redraws at 12 Hz: wait for the rings rather than reading the DOM straight away
  const rings = await page.waitForFunction(() => document.querySelectorAll('.sd-found').length === 6, null, { timeout: 60000 }).then(() => 6).catch(async () => (await page.$$('.sd-found')).length);
  check('desktop: finds are ringed on both pages', rings === 6, `${rings} rings`);
  await d.snap('sd-04-found.png');

  // a wrong tap: lockout, shown, and finds during it are ignored
  await page.mouse.click(f.misses[0].x, f.misses[0].y);
  f = await d.settle((x) => x.me.wrong === 1, 'wrong tap');
  check('desktop: a wrong tap locks you out for about a second', f.me.lockMs > 500 && f.me.lockMs <= 1000, `lock ${Math.round(f.me.lockMs)} ms`);
  await page.waitForSelector('[data-testid=sd-lock]', { timeout: 30000 });
  check('desktop: the lockout is shown with a red X', await page.waitForSelector('.sd-wrong', { timeout: 30000, state: 'attached' }).then(() => true).catch(() => false));
  await d.snap('sd-05-wrong.png');
  await d.tapSlot(f.slots[3], false);
  await d.scale(0.2);
  await d.frames(3);
  f = await d.S();
  check('desktop: taps are ignored while locked out', f.me.found === 3 && f.me.lockMs > 0, `found ${f.me.found}, lock ${Math.round(f.me.lockMs)}`);
  await d.scale(1);
  f = await d.waitS((x) => x.me.lockMs === 0, 'lock over', 120000);
  await d.scale(0);

  // the other twelve
  for (let i = 3; i < 15; i++) await d.tapSlot(f.slots[i], i % 2 === 0);
  f = await d.settle((x) => x.me.done, 'all fifteen');
  check('desktop: finding all 15 completes the page with a bonus', f.me.found === 15 && f.me.done && f.me.bonus >= 60 && f.me.score === 150 + f.me.bonus, `score ${f.me.score}, bonus ${f.me.bonus}`);
  await page.waitForSelector('[data-testid=sd-banner]', { timeout: 30000 });
  check('desktop: banner celebrates all 15', /All 15 found/.test(await page.textContent('[data-testid=sd-banner]')), await page.textContent('[data-testid=sd-banner]'));
  await d.snap('sd-06-complete.png');

  // ---- round 2: keyboard ----
  f = await d.frozenSearch(2, 10);
  themes.push(f.theme);
  await d.snap(`sd-07-search-r2-${f.theme}.png`);
  await page.mouse.move(2, 2);
  await page.keyboard.press('ArrowRight');
  await d.frames(2);
  f = await d.S();
  check('keyboard: first arrow puts a ring on the page', f.cursor >= 0 && !!f.cursorAt, `cursor ${f.cursor}`);
  // walk the ring to the nearest difference
  const near = (f) => f.slots.slice().sort((a, b) => Math.hypot(a.a.x - f.cursorAt.x, a.a.y - f.cursorAt.y) - Math.hypot(b.a.x - f.cursorAt.x, b.a.y - f.cursorAt.y))[0];
  const target = near(f);
  // the debug hook gives the arrow keys (shortest path between the scene's things); press them for real
  const keys = await page.evaluate((to) => window.__toybox.spotdiff.keysTo(to), target.slot);
  check('keyboard: the difference can be reached with the arrows', Array.isArray(keys), JSON.stringify(keys));
  for (const k of keys || []) {
    await page.keyboard.press(k);
    await d.frames(2);
  }
  f = await d.waitS((x) => x.cursor === target.slot, 'ring on target', 60000).catch(() => d.S());
  check('keyboard: arrows steer the ring onto a difference', f.cursor === target.slot, `cursor ${f.cursor} target ${target.slot}`);
  await d.snap('sd-08-keyboard-ring.png');
  await page.keyboard.press('Enter');
  f = await d.settle((x) => x.me.found === 1, 'keyboard find');
  check('keyboard: Enter circles the ringed difference', f.me.found === 1);

  // let round 2 run out: the missed ones are circled
  await d.scale(10);
  f = await d.waitS((x) => x.phase === 'reveal' && x.round === 2, 'round 2 reveal');
  await d.scale(0);
  await d.frames(2);
  const want = 2 * (15 - f.me.found);
  const missed = await page.waitForFunction((n) => document.querySelectorAll('.sd-missed').length === n, want, { timeout: 60000 }).then(() => want).catch(async () => (await page.$$('.sd-missed')).length);
  check('desktop: when time runs out the missed differences are shown', missed === want, `${missed} marks`);
  await d.snap('sd-09-reveal.png');

  // rounds 3 and 4: a screenshot of each scene
  for (const r of [3, 4]) {
    f = await d.frozenSearch(r, 10);
    themes.push(f.theme);
    await d.snap(`sd-1${r - 3}-search-r${r}-${f.theme}.png`);
  }
  check('desktop: four pages, four different scenes', new Set(themes).size === 4, themes.join(', '));

  await d.scale(40);
  await page.waitForSelector('.results', { timeout: 600000 });
  await page.waitForTimeout(900);
  const rows = await page.$$eval('.results-list li', (els) => els.map((e) => e.textContent));
  check('desktop: results rank all four toys by points', rows.length === 4 && rows.every((r) => /\d+ points?/.test(r)), rows.join(' | '));
  await page.screenshot({ path: `${OUT}/sd-12-results.png`, timeout: SHOT_MS });
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['odd-page-out']);
  check('desktop: record saved', rec?.plays === 1 && rec.best > 150, JSON.stringify(rec));
  await page.getByTestId('results-leave').click();
  await page.waitForSelector('.hud-sign', { timeout: 120000 });
  check('desktop: back to the hub', true);
  await page.close();
}

async function phone(browser, errors, orientation) {
  const vp = orientation === 'portrait' ? { width: 390, height: 844 } : { width: 844, height: 390 };
  const ctx = await browser.newContext({ viewport: vp, screen: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await seedLow(page);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 0 })) });
  const tapAt = async (x, y) => {
    await touch('touchStart', [[x, y]]);
    await page.waitForTimeout(40);
    await touch('touchEnd', []);
  };
  const d = driver(page, tapAt);
  const tag = `phone ${orientation}`;
  const P = orientation === 'portrait' ? 'p' : 'l';

  await openFromPavilion(page, true);
  check(`${tag}: intro explains the touch controls`, (await page.textContent('.intro-controls')).includes('Tap a difference'));
  await pickBots(page, true, 3, 'easy');
  if (orientation === 'portrait') await page.screenshot({ path: `${OUT}/sd-m${P}-01-intro.png`, timeout: SHOT_MS });
  await page.getByTestId('match-start').tap();
  await page.waitForSelector('.countdown', { timeout: 60000 });

  let f = await d.frozenSearch(1, 6);
  const L = f.layout;
  check(`${tag}: layout matches the orientation`, L.portrait === (orientation === 'portrait'));
  const [A, B] = L.pics;
  check(`${tag}: pages ${L.portrait ? 'stacked' : 'side by side'} and on screen`, (L.portrait ? A.y + A.h <= B.y : A.x + A.w <= B.x) && [A, B].every((p) => p.x >= 0 && p.y >= 0 && p.x + p.w <= vp.width && p.y + p.h <= vp.height), JSON.stringify(L.pics));
  const hud = await page.evaluate(() => { const r = document.querySelector('.sd-top').getBoundingClientRect(); return { bottom: r.bottom, right: r.right }; });
  check(`${tag}: the HUD stays clear of the book`, hud.bottom <= L.book.y + 2, `${Math.round(hud.bottom)} vs ${L.book.y}`);
  const minR = Math.min(...f.slots.map((s) => s.a.r));
  check(`${tag}: every difference is a finger-sized target (≥ 56 px across)`, 2 * minR >= 56, `${Math.round(2 * minR)} px`);
  check(`${tag}: pictures are big enough to see (≥ 360 px wide)`, A.w >= 360, `${A.w} px`);
  await d.snap(`sd-m${P}-02-search.png`);

  for (let i = 0; i < 4; i++) await d.tapSlot(f.slots[i], i % 2 === 1);
  f = await d.settle((x) => x.me.found === 4, 'four taps');
  check(`${tag}: tapping differences on either page finds them`, f.me.found === 4 && f.me.score === 40, `found ${f.me.found}`);
  await d.snap(`sd-m${P}-03-found.png`);
  await tapAt(f.misses[0].x, f.misses[0].y);
  f = await d.settle((x) => x.me.wrong === 1, 'wrong tap');
  check(`${tag}: a wrong tap locks you out`, f.me.lockMs > 0);
  await page.waitForSelector('[data-testid=sd-lock]', { timeout: 30000 });
  await d.snap(`sd-m${P}-04-wrong.png`);
  await d.tapSlot(f.slots[5], false);
  await d.scale(0.2);
  await d.frames(3);
  f = await d.S();
  check(`${tag}: taps are ignored while locked out`, f.me.found === 4, `found ${f.me.found}`);
  await d.scale(1);
  f = await d.waitS((x) => x.me.lockMs === 0, 'lock over', 120000);
  await d.scale(0);
  // finish the page by touch
  for (let i = 4; i < 15; i++) if (!f.slots[i].found) await d.tapSlot(f.slots[i], i % 2 === 0);
  f = await d.settle((x) => x.me.done, 'page complete by touch');
  check(`${tag}: all 15 found by touch completes the page`, f.me.done && f.me.found === 15, `found ${f.me.found}`);
  if (orientation === 'landscape') await d.snap(`sd-m${P}-05-complete.png`);

  await d.scale(40); // each frame advances at most 100 ms × scale: software GL here can run at ~1 fps
  await page.waitForSelector('.results', { timeout: 600000 });
  await page.waitForTimeout(900);
  const rows = await page.$$eval('.results-list li', (els) => els.map((e) => e.textContent));
  check(`${tag}: results rank all four toys`, rows.length === 4, rows.join(' | '));
  await page.screenshot({ path: `${OUT}/sd-m${P}-06-results.png`, timeout: SHOT_MS });
  await page.getByTestId('results-leave').tap();
  await page.waitForSelector('.hud-sign', { timeout: 120000 });
  check(`${tag}: back to the hub`, true);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const errors = [];
  const only = process.env.ONLY;
  try {
    if (!only || only === 'desktop') await desktop(browser, errors);
    if (!only || only === 'portrait') await phone(browser, errors, 'portrait');
    if (!only || only === 'landscape') await phone(browser, errors, 'landscape');
  } finally {
    check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    console.log(`${res.filter((r) => r.startsWith('PASS')).length} passed, ${res.filter((r) => r.startsWith('FAIL')).length} failed`);
    await browser.close();
  }
  if (res.some((r) => r.startsWith('FAIL'))) process.exit(1);
})().catch((e) => {
  console.log('FAIL  aborted: ' + e.message);
  process.exit(1);
});
