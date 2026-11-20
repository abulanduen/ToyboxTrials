/* Milestone 5: Find the Original — desktop (mouse + keyboard) and an emulated phone (real touch).
   Run: npx vite preview --port 4175 &  BASE_URL=http://localhost:4175/ node tests/e2e/findoriginal.cjs
   The game has no hub entrance yet, so it is opened with the ?debug hook match.practice(id). */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4175/';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const res = [];
// Results are printed as they happen: on a busy machine a run can take many minutes.
const check = (n, ok, d = '') => {
  res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
  console.log(res[res.length - 1]);
};

/** Helpers bound to one page. `tapAt` is how this device pokes the screen (mouse click or touch). */
function driver(page, tapAt) {
  const F = () =>
    page.evaluate(() => {
      const t = window.__toybox;
      const s = t.match.state();
      if (!s || !s.toys) return null;
      const me = s.players.find((p) => p.id === 'you');
      return {
        matchPhase: t.match.phase(),
        phase: s.phase,
        round: s.round,
        searchT: s.searchT,
        limitMs: s.limitMs,
        n: s.toys.length,
        me,
        players: s.players,
        crowd: t.find ? t.find.crowd() : [],
        original: t.find ? t.find.original() : -1,
        cursor: t.find ? t.find.cursor() : -1,
        layout: t.find ? t.find.layout() : null,
        baldwyn: t.find ? JSON.stringify(t.find.baldwyn()) : null,
        card: t.find ? t.find.card() : null,
      };
    });
  const waitF = async (pred, label, ms = 240000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const f = await F();
      if (f && pred(f)) return f;
      await page.waitForTimeout(150);
    }
    throw new Error('timeout waiting for ' + label);
  };
  const scale = (k) => page.evaluate((k) => window.__toybox.match.timeScale(k), k);
  /** Wait for n rendered frames. Headless software rendering can drop to ~1 fps on a busy machine,
      so "wait 500 ms" means nothing: camera easing, CSS pop-ins and input all advance per frame. */
  const frames = (n) => page.evaluate((n) => new Promise((done) => { const f = () => (--n <= 0 ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  /** Wait for this round's crowd to be standing (pop-in finished), then freeze time. */
  const frozenSearch = async (round, speed = 4) => {
    await scale(speed);
    await waitF((f) => f.phase === 'search' && f.round === round && f.searchT > 900 && f.crowd.length === f.n, `round ${round} search`);
    await scale(0);
    await frames(6); // let the camera and card settle (they ease in real time)
    return F();
  };
  const snap = async (name) => {
    await frames(4);
    await page.waitForTimeout(400); // CSS pop-ins
    await frames(2);
    await page.screenshot({ path: `${OUT}/${name}` });
  };
  const pick = async (f, i) => tapAt(f.crowd[i].x, f.crowd[i].y);
  /** Pick the original while frozen, then let a few steps run so the rules see it. */
  const pickOriginal = async (round) => {
    const f = await F();
    await pick(f, f.original);
    await scale(0.05);
    await waitF((x) => x.round > round || x.phase === 'reveal' || x.phase === 'over' || x.me.found, `round ${round} found`, 60000);
    await scale(0);
    return F();
  };
  const open = async () => {
    await page.evaluate(() => window.__toybox.match.practice('find-the-original'));
    await page.waitForSelector('.match-intro', { timeout: 60000 });
    await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
  };
  return { F, waitF, scale, frames, frozenSearch, snap, pick, pickOriginal, open };
}

const seedLow = async (page) =>
  page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, quality: 'low', tutorials: false }, version: 0 }));
    }
  });

async function desktop(browser, errors) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await seedLow(page);
  const d = driver(page, (x, y) => page.mouse.click(x, y));

  await page.goto(BASE + '?debug#play');
  await page.waitForSelector('.loading', { state: 'detached' });
  await page.waitForTimeout(1500);
  await d.open();
  check('desktop: practice card opens (lazy-loaded module)', (await page.textContent('.match-intro h2')).includes('Find the Original'));
  check('desktop: intro shows mouse and keyboard controls', (await page.$$('.intro-controls .keycap')).length === 3);
  const opts = await page.$$eval('.intro-options .segmented >> nth=0 >> button', (els) => els.map((e) => e.textContent));
  check('desktop: playable solo or with up to 7 bots', opts.includes('Solo') && opts.includes('7 bots'), opts.join(','));
  await page.click('.intro-options .segmented >> nth=0 >> button >> nth=0'); // solo
  await page.screenshot({ path: `${OUT}/fo-01-intro.png` });

  await d.scale(4);
  await page.click('[data-testid=match-start]');
  await page.waitForSelector('.countdown', { timeout: 30000 });
  await d.waitF((f) => f.phase === 'study', 'reference card');
  await d.scale(0);
  await d.frames(6);
  check('desktop: round 1 opens with the reference card', (await page.textContent('[data-testid=fo-banner]')).includes('This is Baldwyn'));
  check('desktop: no picks possible while the card is up', (await d.F()).crowd.length === 0);
  const firstBaldwyn = (await d.F()).baldwyn;
  await d.snap('fo-02-study.png');

  // Round 1: a wrong pick, the lockout, then the right one — all with the mouse.
  let f = await d.frozenSearch(1);
  check('desktop: round 1 crowd is 6 toys with exactly one original', f.n === 6 && f.original >= 0, `n=${f.n}`);
  const inArea = (f) => f.crowd.every((c) => c.x > f.layout.area.x0 - 4 && c.x < f.layout.area.x1 + 4 && c.y > f.layout.area.y0 - 4 && c.y < f.layout.area.y1 + 4);
  check('desktop: every toy stands inside the free area of the screen', inArea(f));
  await d.snap('fo-03-search-r1.png');
  const wrong = f.crowd.findIndex((_, i) => i !== f.original);
  await d.pick(f, wrong);
  await d.scale(0.05);
  f = await d.waitF((x) => x.me.wrong.length === 1, 'wrong pick registered', 60000);
  await d.scale(0);
  check('desktop: clicking a Not-Baldwyn locks you out', f.me.lockMs > 0 && f.me.wrongTotal === 1, `lock ${Math.round(f.me.lockMs)} ms`);
  await page.waitForSelector('[data-testid=fo-lock]', { timeout: 10000 });
  check('desktop: lockout is shown (banner + wind-up bar)', (await page.textContent('[data-testid=fo-banner]')).includes('Not Baldwyn'));
  await d.snap('fo-04-wrong.png');
  // Clicking the right toy while locked does nothing: the click is delivered on the next step,
  // when the lock still has over a second to run.
  await d.pick(f, f.original);
  await d.scale(1);
  f = await d.waitF((x) => x.me.lockMs === 0 || x.phase !== 'search', 'lock over', 120000);
  await d.scale(0);
  check('desktop: picks are ignored while wound down', f.phase === 'search' && !f.me.found, `phase ${f.phase}`);
  f = await d.pickOriginal(1);
  check('desktop: clicking the real Baldwyn scores', f.me.finds === 1 && f.me.score > 100, `score ${f.me.score}`);
  await d.frames(3);
  check('desktop: banner celebrates the find', /Found him|There he is/.test(await page.textContent('[data-testid=fo-banner]')), await page.textContent('[data-testid=fo-banner]'));
  await d.snap('fo-05-found.png');

  // Round 2: keyboard only. Arrows move the ring, Enter picks.
  f = await d.frozenSearch(2);
  check('desktop: round 2 has a bigger crowd', f.n === 12, `n=${f.n}`);
  await page.mouse.move(2, 2); // mouse away so only the keyboard drives the ring
  await d.frames(2);
  await page.keyboard.press('ArrowRight');
  await d.frames(3);
  f = await d.F();
  check('keyboard: first arrow puts a ring on a toy', f.cursor >= 0, `cursor ${f.cursor}`);
  for (let i = 0; i < 24 && f.cursor >= 0 && f.cursor !== f.original; i++) {
    const dx = f.crowd[f.original].x - f.crowd[f.cursor].x;
    const dy = f.crowd[f.original].y - f.crowd[f.cursor].y;
    // Alternate between the two axes so a blocked direction can't stall the walk.
    const horizontal = i % 2 === 0 ? Math.abs(dx) > 30 : Math.abs(dy) <= 30;
    await page.keyboard.press(horizontal ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : dy > 0 ? 'ArrowDown' : 'ArrowUp');
    await d.frames(3);
    f = await d.F();
  }
  check('keyboard: arrows can steer the ring onto any toy', f.cursor === f.original, `cursor ${f.cursor} target ${f.original}`);
  await d.snap('fo-06-keyboard-ring.png');
  await page.keyboard.press('Enter');
  await d.scale(0.05);
  f = await d.waitF((x) => x.me.finds === 2, 'keyboard pick', 60000);
  check('keyboard: Enter picks the ringed toy', f.me.finds === 2);

  // Rounds 3–5 with the mouse while the crowd shuffles.
  for (let r = 3; r <= 5; r++) {
    f = await d.frozenSearch(r);
    if (r === 5) {
      check('desktop: final round has 24 toys', f.n === 24, `n=${f.n}`);
      check('desktop: final crowd still fits the free area', inArea(f));
      await d.snap('fo-07-search-r5.png');
    }
    f = await d.pickOriginal(r);
  }
  check('desktop: five rounds, five finds', f.me.finds === 5, `finds ${f.me.finds}`);
  await d.scale(4);
  await page.waitForSelector('.results', { timeout: 120000 });
  await page.waitForTimeout(900);
  const score = (await page.textContent('[data-testid=solo-score]'))?.trim();
  check('desktop: results show the points total', score === String(f.me.score), `${score} vs ${f.me.score}`);
  await page.screenshot({ path: `${OUT}/fo-08-results.png` });
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['find-the-original']);
  check('desktop: record saved', rec?.best === f.me.score && rec?.plays === 1, JSON.stringify(rec));

  // Versus bots: don't pick at all; bots find him, the field shows who did, results rank everyone.
  await page.click('[data-testid=results-leave]');
  await page.waitForSelector('.hud-sign', { timeout: 60000 });
  await page.waitForTimeout(1200);
  await d.open();
  await page.click('.intro-options .segmented >> nth=0 >> button >> nth=2'); // 3 bots
  await page.click('.intro-options .segmented >> nth=1 >> button >> nth=1'); // normal
  await d.scale(4);
  await page.click('[data-testid=match-start]');
  const secondBaldwyn = (await d.waitF((x) => x.phase !== 'over' && !!x.baldwyn, 'second match')).baldwyn;
  check('a new match builds a different Baldwyn', !!firstBaldwyn && !!secondBaldwyn && firstBaldwyn !== secondBaldwyn, `${firstBaldwyn} vs ${secondBaldwyn}`);
  await d.waitF((x) => x.phase === 'search' && x.round === 3 && x.players.some((p) => p.found), 'a bot finds him in round 3');
  await d.scale(0);
  await d.frames(4);
  check('bots: the field shows all four toys', (await page.$$('[data-testid=fo-field] .fo-chip')).length === 4);
  check('bots: a bot that found him is marked', (await page.$$('[data-testid=fo-field] .fo-chip.done')).length >= 1);
  check('bots: "hurry" banner after someone else finds him', (await page.textContent('[data-testid=fo-banner]')).includes('Hurry'), await page.textContent('[data-testid=fo-banner]'));
  await d.snap('fo-09-bots-hurry.png');
  await d.scale(4);
  await page.waitForSelector('.results', { timeout: 240000 });
  await page.waitForTimeout(900);
  const rows = await page.$$eval('.results-list li', (els) => els.map((e) => e.textContent));
  check('bots: results rank all four toys', rows.length === 4, rows.join(' | '));
  check('bots: results show points, not "last standing"', rows.every((r) => /\d+ points?/.test(r)) && !rows.some((r) => r.includes('last standing')), rows[0]);
  const last = await d.F();
  check('bots: never picking leaves you on 0 points', last.me.score === 0 && last.players.some((p) => p.score > 0));
  await page.screenshot({ path: `${OUT}/fo-10-bots-results.png` });
  await page.close();
}

async function phone(browser, errors, orientation) {
  const dev = devices['Pixel 7'];
  const vp = orientation === 'portrait' ? { width: 412, height: 915 } : { width: 915, height: 412 };
  const ctx = await browser.newContext({ ...dev, viewport: vp, screen: vp });
  const page = await ctx.newPage();
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, quality: 'low', tutorials: false }, version: 0 })); } }); // phones default to Low anyway; tutorials are tested elsewhere
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id = 0]) => ({ x, y, id })) });
  const tapAt = async (x, y) => {
    await touch('touchStart', [[x, y]]);
    await page.waitForTimeout(40);
    await touch('touchEnd', []);
  };
  const d = driver(page, tapAt);
  const tag = `phone ${orientation}`;
  const P = orientation === 'portrait' ? 'p' : 'l';

  await page.goto(BASE + '?debug');
  await page.waitForSelector('[data-testid=menu-play]', { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.tap('[data-testid=menu-play]');
  await page.waitForTimeout(2500);
  await d.open();
  check(`${tag}: intro explains the touch controls`, (await page.textContent('.intro-controls')).includes('Tap the toy'));
  await page.click('.intro-options .segmented >> nth=0 >> button >> nth=2'); // 3 bots, so the field chips are on screen
  await page.click('.intro-options .segmented >> nth=1 >> button >> nth=0'); // easy
  if (orientation === 'portrait') await page.screenshot({ path: `${OUT}/fo-m${P}-01-intro.png` });
  await d.scale(4);
  await page.tap('[data-testid=match-start]');
  await d.waitF((f) => f.phase === 'study', 'reference card');
  await d.scale(0);
  await d.frames(6);
  await d.snap(`fo-m${P}-02-study.png`);

  let f = await d.frozenSearch(1, 2);
  const lay = f.layout;
  check(`${tag}: layout matches the orientation`, lay.portrait === (orientation === 'portrait'));
  const spacing = (f) => {
    let min = Infinity;
    for (let i = 0; i < f.crowd.length; i++) for (let j = i + 1; j < f.crowd.length; j++) min = Math.min(min, Math.hypot(f.crowd[i].x - f.crowd[j].x, f.crowd[i].y - f.crowd[j].y));
    return min;
  };
  const onScreen = (f) => f.crowd.every((c) => c.x > 20 && c.x < vp.width - 20 && c.y > f.layout.area.y0 - 4 && c.y < vp.height - 20);
  check(`${tag}: round 1 toys are on screen, below the HUD`, onScreen(f));
  check(`${tag}: round 1 targets are at least 56 px apart`, spacing(f) >= 56, `${Math.round(spacing(f))} px`);
  const c = f.card;
  check(`${tag}: reference card is drawn at full device resolution`, !!c && c.visible && Math.abs(c.canvas.w - c.canvas.cssW * c.dpr) < 0.01 && c.dpr >= 2, c && `${c.canvas.w}×${c.canvas.h} px at ${c.dpr}×`);
  check(`${tag}: reference card is readable (≥ 120 px tall) and clear of the crowd`, lay.card.h >= 120 && (lay.portrait ? lay.card.cy + lay.card.h / 2 <= lay.area.y0 : lay.card.cx + lay.card.h * 0.4 <= lay.area.x0), `card ${Math.round(lay.card.h)} px`);
  await d.snap(`fo-m${P}-03-search-r1.png`);

  // A wrong tap, then (after the lockout) the right one. Real touch events via CDP.
  // If a bot has already ended the round, skip to the next one: the checks only need one of each.
  const wrong = f.crowd.findIndex((_, i) => i !== f.original);
  await d.pick(f, wrong);
  await d.scale(0.05);
  f = await d.waitF((x) => x.me.wrong.length === 1, 'wrong tap registered', 60000);
  await d.scale(0);
  check(`${tag}: tapping a Not-Baldwyn winds you down`, f.me.lockMs > 0);
  await page.waitForSelector('[data-testid=fo-lock]', { timeout: 10000 });
  await d.snap(`fo-m${P}-04-wrong.png`);
  await d.scale(1);
  f = await d.waitF((x) => (x.phase === 'search' && x.me.lockMs === 0) || x.round > 1, 'lock over', 240000); // slow under load
  await d.scale(0);
  let tapped = 0;
  for (let r = f.round; r <= 5; r++) {
    f = await d.frozenSearch(r, r === f.round ? 1 : 4);
    if (r === 5) {
      check(`${tag}: final round (24 toys) is on screen`, f.n === 24 && onScreen(f));
      check(`${tag}: final round targets are at least 56 px apart`, spacing(f) >= 56, `${Math.round(spacing(f))} px`);
      await d.snap(`fo-m${P}-05-search-r5.png`);
    }
    const before = f.me.finds;
    f = await d.pickOriginal(r);
    if (f.me.finds > before) tapped++;
    if (r === 2) {
      await d.snap(`fo-m${P}-06-found.png`);
    }
  }
  check(`${tag}: tapping the real Baldwyn scores`, tapped >= 3 && f.me.score > 0, `${tapped} finds by touch, ${f.me.score} pts`);
  await d.scale(4);
  await page.waitForSelector('.results', { timeout: 120000 });
  await page.waitForTimeout(900);
  const rows = await page.$$eval('.results-list li', (els) => els.map((e) => e.textContent));
  check(`${tag}: results rank all four toys`, rows.length === 4, rows.join(' | '));
  await page.screenshot({ path: `${OUT}/fo-m${P}-07-results.png` });
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const errors = [];
  const only = process.env.ONLY;
  if (!only || only === 'desktop') await desktop(browser, errors);
  if (!only || only === 'portrait') await phone(browser, errors, 'portrait');
  if (!only || only === 'landscape') await phone(browser, errors, 'landscape');
  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${res.filter((r) => r.startsWith('PASS')).length} passed, ${res.filter((r) => r.startsWith('FAIL')).length} failed`);
  await browser.close();
  if (res.some((r) => r.startsWith('FAIL'))) process.exit(1);
})().catch((e) => {
  console.log('FAIL  aborted: ' + e.message);
  process.exit(1);
});
