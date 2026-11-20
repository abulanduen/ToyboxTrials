/* Game-card thumbnails from real gameplay: one page opens each trial's practice card in turn with
   bots, plays it (sped up with the ?debug time scale) to a representative moment, freezes it,
   hides the DOM overlay and captures the 3D scene. Writes tests/e2e/output/thumb-src-<id>.png;
   then `python3 tests/e2e/thumbs.py` turns them into public/assets/thumbs/<id>.webp (480×270).
   Not a pass/fail suite. One browser page in all (software rendering is slow).
     BASE_URL=http://localhost:4199/ node tests/e2e/thumbs.cjs      ONLY=<id>,<id> captures some. */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const BASE = process.env.BASE_URL || 'http://localhost:4199/';
const OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const T = 1200000;

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
  'toy-squad': 42000,
  'spellbox-showdown': 16000,
  'jack-in-the-box': 7000,
  'odd-page-out': 6000,
  'toy-tower-tumble': 26000,
  // Staged (STAGE below): the class pick, then the swarm with every elite and the boss at 4:01.
  'toybox-siege': 0,
};

/**
 * Trials that need a moment staged rather than reached by playing on (debug hooks only, like the
 * e2e tests). Toybox Siege: pick the Ranger, give it a full kit, jump the run clock to just before
 * the boss and let the swarm, the elites and the Boiler Baron arrive with every weapon firing.
 */
const STAGE = {
  'toybox-siege': async (page) => {
    await page.click('[data-testid=siege-class-ranger]');
    await page.waitForFunction(() => window.__toybox.match.state()?.phase === 'run', null, { polling: 200 });
    await page.evaluate(() => {
      const s = window.__toybox.match.state();
      for (const p of s.players) p.invuln = 1e12;
      const me = s.players.find((p) => p.id === 'you');
      me.xpNext = 1e9;
      me.weapons = [['popgun', 4], ['chime', 3], ['yoyo', 3], ['marbles', 3]].map(([id, level, evolved = false]) => ({ id, level, evolved, cd: 100, aux: 0 }));
      me.passives = [{ id: 'gears', level: 3 }, { id: 'magnifier', level: 3 }, { id: 'crayon', level: 2 }];
      s.runT = 233000;
    });
    await page.evaluate(() => window.__toybox.match.timeScale(3));
    await page.waitForFunction(() => { const s = window.__toybox.match.state(); return s.runT >= 240400 && s.players.find((p) => p.id === 'you').board.bigs.some((g) => g.on && g.type === 'baron'); }, null, { polling: 100 });
    await page.evaluate(() => window.__toybox.match.timeScale(1));
    await page.evaluate(() => {
      const s = window.__toybox.match.state(), me = s.players.find((p) => p.id === 'you');
      // The Baron and the elites close around the toy, in frame, and not yet worn down.
      const spots = { baron: [7, -4], bear: [-8, -3], drummer: [-5, 6], rhino: [8, 6] };
      for (const g of me.board.bigs) if (g.on) { const [x, z] = spots[g.type]; g.x = me.x + x; g.z = me.z + z; g.mode = 0; g.dashT = 1e9; g.hp = g.maxHp; }
    });
    await page.waitForFunction(() => window.__toybox.match.state().runT >= 241100, null, { polling: 100 });
  },
};

/** Trials whose pictures live in the DOM layer (the page spreads, the shop): keep the overlay. */
const KEEP_OVERLAY = new Set(['odd-page-out', 'toy-squad']);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ids = process.env.ONLY ? process.env.ONLY.split(',') : Object.keys(MOMENT);
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('s')) {
      sessionStorage.setItem('s', '1');
      localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low', tutorials: false, contenderName: 'Ticker', autoOnline: false }, version: 1 }));
    }
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  await page.goto(`${BASE}?debug#play`);
  await page.waitForSelector('.loading', { state: 'detached', timeout: T });
  for (const id of ids) {
    try {
      await page.evaluate(() => {
        document.getElementById('thumb-hide')?.remove();
        window.__toybox.match.timeScale(1);
      });
      await page.evaluate((id) => window.__toybox.match.practice(id), id);
      await page.waitForFunction(() => window.__toybox.match.phase() === 'intro', null, { polling: 250 });
      await page.waitForSelector('[data-testid=match-start]');
      const labels = await page.$$eval('.intro-options .segmented >> nth=0 >> button', (els) => els.map((e) => e.textContent));
      const pick = labels.indexOf('3 bots') >= 0 ? labels.indexOf('3 bots') : labels.indexOf('1 bot');
      if (pick >= 0) await page.click(`.intro-options .segmented >> nth=0 >> button >> nth=${pick}`);
      await page.click('[data-testid=match-start]');
      await page.waitForFunction(() => window.__toybox.match.phase() === 'playing', null, { polling: 200 });
      if (STAGE[id]) await STAGE[id](page);
      else {
        await page.evaluate(() => window.__toybox.match.timeScale(6));
        await page.waitForFunction((t) => (window.__toybox.match.state()?.t ?? 0) >= t || window.__toybox.match.phase() !== 'playing', MOMENT[id], { polling: 100 });
      }
      await page.evaluate((keep) => {
        window.__toybox.match.timeScale(0);
        if (keep) return;
        const st = document.createElement('style');
        st.id = 'thumb-hide';
        st.textContent = '.overlay { visibility: hidden !important; }';
        document.head.appendChild(st);
      }, KEEP_OVERLAY.has(id));
      // A few rendered frames with the camera settled.
      await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n >= 4 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
      await page.screenshot({ path: path.join(OUT, `thumb-src-${id}.png`), timeout: T });
      console.log(`captured ${id}`);
    } catch (e) {
      console.log(`FAILED ${id}: ${e.message.split('\n')[0]}`);
    }
  }
  await ctx.close();
  await browser.close();
})();
