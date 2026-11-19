/* Game-card thumbnails from real gameplay: opens each trial's practice card with three bots,
   plays it (sped up with the ?debug time scale) to a representative moment, freezes it, hides the
   DOM overlay and captures the 3D scene. Writes tests/e2e/output/thumb-src-<id>.png; then
   `python3 tests/e2e/thumbs.py` turns them into public/assets/thumbs/<id>.webp (480×270).
   Not a pass/fail suite. Needs a preview server: BASE_URL=http://localhost:4199/ node tests/e2e/thumbs.cjs
   ONLY=<game-id> captures one. */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const BASE = process.env.BASE_URL || 'http://localhost:4199/';
const OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });

/** Match time (ms) to reach before the picture, per trial: past intros, drafts and studies. */
const MOMENT = {
  'copycat-conductor': 4200,
  'inferno-escape': 21000,
  'midnight-hunger': 4000,
  'find-the-original': 9500,
  'red-light-green-light': 5200,
  'blink-duel': 3500,
  'wind-up-dash': 4200,
  'music-box-rhythm': 9000,
  'toy-squad': 2500,
  'spellbox-showdown': 16000,
  'jack-in-the-box': 7000,
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ids = process.env.ONLY ? [process.env.ONLY] : Object.keys(MOMENT);
  for (const id of ids) {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript(() => {
      if (!sessionStorage.getItem('s')) {
        sessionStorage.setItem('s', '1');
        localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'medium', tutorials: false, contenderName: 'Ticker', autoOnline: false }, version: 1 }));
      }
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(240000);
    try {
      await page.goto(`${BASE}?debug#play`);
      await page.waitForSelector('.loading', { state: 'detached', timeout: 600000 });
      await page.evaluate((id) => window.__toybox.match.practice(id), id);
      await page.waitForSelector('[data-testid=match-start]');
      const labels = await page.$$eval('.intro-options .segmented >> nth=0 >> button', (els) => els.map((e) => e.textContent));
      const pick = labels.indexOf('3 bots') >= 0 ? labels.indexOf('3 bots') : labels.indexOf('1 bot');
      if (pick >= 0) await page.click(`.intro-options .segmented >> nth=0 >> button >> nth=${pick}`);
      await page.click('[data-testid=match-start]');
      await page.waitForFunction(() => window.__toybox.match.phase() === 'playing', null, { polling: 200 });
      await page.evaluate(() => window.__toybox.match.timeScale(6));
      await page.waitForFunction((t) => (window.__toybox.match.state()?.t ?? 0) >= t || window.__toybox.match.phase() !== 'playing', MOMENT[id], { polling: 100 });
      await page.evaluate(() => window.__toybox.match.timeScale(0));
      await page.addStyleTag({ content: '.overlay { visibility: hidden !important; }' });
      await page.waitForTimeout(1500); // a few rendered frames with the camera settled (software rendering is slow)
      await page.screenshot({ path: path.join(OUT, `thumb-src-${id}.png`), timeout: 240000 });
      console.log(`captured ${id}`);
    } catch (e) {
      console.log(`FAILED ${id}: ${e.message.split('\n')[0]}`);
    }
    await ctx.close();
  }
  await browser.close();
})();
