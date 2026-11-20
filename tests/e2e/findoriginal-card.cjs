/* Find the Original: the "meet Baldwyn" card and the in-round reference card are crisp, and each
   match builds a different Baldwyn. Three matches each on a desktop (Balanced tier, the desktop
   default, whose tilt-shift used to blur the card; 2× pixels) and an emulated high-DPR phone
   (Low tier, 3× pixels) in portrait and landscape. Screenshots go to tests/e2e/output/fo-card-*.
   Run: npx vite preview --port 4182 &  BASE_URL=http://localhost:4182/ node tests/e2e/findoriginal-card.cjs
   ONLY=desktop|portrait|landscape and MATCHES=n narrow it down. */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4175/';
const MATCHES = Number(process.env.MATCHES || 3);
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const res = [];
const check = (n, ok, d = '') => {
  res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
  console.log(res[res.length - 1]);
};

const pixel = devices['Pixel 7'];
const CONFIGS = {
  desktop: { tag: 'desktop', quality: 'balanced', ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 } },
  portrait: { tag: 'phone-portrait', quality: 'low', ctx: { ...pixel, viewport: { width: 412, height: 915 }, screen: { width: 412, height: 915 }, deviceScaleFactor: 3 } },
  landscape: { tag: 'phone-landscape', quality: 'low', ctx: { ...pixel, viewport: { width: 915, height: 412 }, screen: { width: 915, height: 412 }, deviceScaleFactor: 3 } },
};

async function match(browser, cfg, n, errors) {
  const ctx = await browser.newContext(cfg.ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(400000); // 3× software rendering is very slow
  page.on('pageerror', (e) => errors.push(`${cfg.tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${cfg.tag}: ${m.text()}`); });
  await page.addInitScript((q) => {
    localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, quality: q, tutorials: false }, version: 0 }));
  }, cfg.quality);
  const F = () =>
    page.evaluate(() => {
      const t = window.__toybox;
      const s = t.match.state();
      if (!s || !s.toys || !t.find) return null;
      return { phase: s.phase, round: s.round, searchT: s.searchT, n: s.toys.length, crowd: t.find.crowd().length, baldwyn: t.find.baldwyn(), card: t.find.card(), layout: t.find.layout() };
    });
  const waitF = async (pred, label, ms = 300000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const f = await F();
      if (f && pred(f)) return f;
      await page.waitForTimeout(150);
    }
    throw new Error('timeout waiting for ' + label);
  };
  const scale = (k) => page.evaluate((k) => window.__toybox.match.timeScale(k), k);
  const frames = (k) => page.evaluate((k) => new Promise((done) => { const f = () => (--k <= 0 ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); }), k);
  /** Wait until the card has eased onto its target (it moves in real time, per frame). */
  const settled = async (which) => {
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      const f = await F();
      const want = f.layout[which];
      const r = f.card.rect;
      if (f.card.visible && Math.abs(r.h - want.h) < 0.5 && Math.abs(r.x + r.w / 2 - want.cx) < 0.5 && Math.abs(r.y + r.h / 2 - want.cy) < 0.5) return f;
      await frames(2);
    }
    const f = await F();
    throw new Error('card never settled on ' + which + ' ' + JSON.stringify({ card: f.card, want: f.layout[which] }));
  };

  await page.goto(BASE + '?debug#play');
  await page.waitForSelector('.loading', { state: 'detached', timeout: 120000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__toybox.match.practice('find-the-original'));
  await page.waitForSelector('.match-intro', { timeout: 240000 });
  await page.waitForTimeout(900);
  await page.click('.intro-options .segmented >> nth=0 >> button >> nth=0'); // solo
  await scale(4);
  await page.click('[data-testid=match-start]');
  await waitF((f) => f.phase === 'study', 'study');
  await scale(0);
  let f = await settled('big');
  const name = `fo-card-${cfg.tag}-m${n}`;
  const dpr = f.card.dpr;
  // Backing store = CSS size × device pixel ratio (1:1 with the screen) and the card is not scaled.
  const crisp = (c) => Math.abs(c.canvas.w - c.canvas.cssW * c.dpr) < 0.01 && Math.abs(c.canvas.h - c.canvas.cssH * c.dpr) < 0.01 && Math.abs(c.rect.h - c.boxH) < 0.01;
  check(`${cfg.tag} m${n}: meet-Baldwyn card is drawn at full device resolution`, crisp(f.card), `${f.card.canvas.w}×${f.card.canvas.h} px for ${f.card.canvas.cssW}×${f.card.canvas.cssH} css at ${dpr}×`);
  check(`${cfg.tag} m${n}: big card is on screen`, f.card.rect.x >= 0 && f.card.rect.y >= 0 && f.card.rect.x + f.card.rect.w <= cfg.ctx.viewport.width && f.card.rect.y + f.card.rect.h <= cfg.ctx.viewport.height);
  const filters = await page.evaluate(() => {
    const out = [];
    for (let el = document.querySelector('[data-testid=fo-card]'); el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.filter !== 'none' || cs.backdropFilter !== 'none') out.push(el.className || el.tagName);
    }
    return out;
  });
  check(`${cfg.tag} m${n}: no CSS filter on the card or its parents`, filters.length === 0, filters.join(','));
  await frames(2);
  await page.screenshot({ path: `${OUT}/${name}-1-study.png` });
  const r = f.card.rect;
  await page.screenshot({ path: `${OUT}/${name}-1-study-card.png`, clip: { x: r.x, y: r.y, width: r.w, height: r.h } });

  await scale(4);
  await waitF((x) => x.phase === 'search' && x.searchT > 900 && x.crowd === x.n, 'search');
  await scale(0);
  f = await settled('card');
  check(`${cfg.tag} m${n}: in-round card is drawn at full device resolution`, crisp(f.card), `${f.card.canvas.w}×${f.card.canvas.h} px for ${f.card.canvas.cssW}×${f.card.canvas.cssH} css`);
  await frames(2);
  await page.screenshot({ path: `${OUT}/${name}-2-search.png` });
  const r2 = f.card.rect;
  await page.screenshot({ path: `${OUT}/${name}-2-search-card.png`, clip: { x: Math.max(0, r2.x - 4), y: Math.max(0, r2.y - 4), width: r2.w + 8, height: r2.h + 8 } });
  await ctx.close();
  return f.card.look;
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const errors = [];
  const looks = [];
  for (const [key, cfg] of Object.entries(CONFIGS)) {
    if (process.env.ONLY && process.env.ONLY !== key) continue;
    for (let n = 1; n <= MATCHES; n++) looks.push(await match(browser, cfg, n, errors));
  }
  check('every match had its own Baldwyn', new Set(looks).size === looks.length, looks.join(' | '));
  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${res.filter((r) => r.startsWith('PASS')).length} passed, ${res.filter((r) => r.startsWith('FAIL')).length} failed`);
  await browser.close();
  if (res.some((r) => r.startsWith('FAIL'))) process.exit(1);
})().catch((e) => {
  console.log('FAIL  aborted: ' + e.message);
  process.exit(1);
});
