/*
 * Tutorial pictures: every minigame's intro card, every "How to play" step, desktop and phone.
 * Opens each game's practice card through the ?debug hook, steps through the tutorial checking a
 * real gameplay photo or SVG on every page (touch diagrams on phones where provided), checks the
 * thumbnail row on the plain card, that every key chip on it keeps its label on one line, and that
 * Start stays on screen, then the main menu's Hub sheet.
 * Screenshots go to TUT_SHOTS (default: the system temp folder), never the repo.
 *
 *   BASE_URL=http://localhost:4205/ node tests/e2e/tutorials.cjs
 *   LAYOUTS=desktop,portrait,landscape  GAMES=red-light-green-light,toy-squad  (optional filters)
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const out = process.env.TUT_SHOTS || path.join(os.tmpdir(), 'toybox-tutorial-shots');
fs.mkdirSync(out, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
// Find the Original goes last: switching away from its card keeps a software-rendered page busy
// for minutes on a loaded machine, and nothing needs to follow it (the page is simply closed).
const GAMES = (process.env.GAMES || 'copycat-conductor,jack-in-the-box,red-light-green-light,wind-up-dash,inferno-escape,midnight-hunger,music-box-rhythm,blink-duel,spellbox-showdown,toy-squad,odd-page-out,toy-tower-tumble,toybox-siege,hoop-hustle,hoop-clash,find-the-original').split(',');
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  portrait: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
};

/** The visible picture inside `scope`: rendered SVG with real shapes and a sensible size. */
async function checkArt(page, scope, label, minW = 100) {
  const art = page.locator(`${scope} [data-testid="${label}"]`).first();
  await art.locator('svg.ta').waitFor({ state: 'visible' }); // the pictures load in their own chunk
  const info = await art.evaluate((el) => {
    const svg = el.querySelector('svg.ta');
    const r = el.getBoundingClientRect();
    return { id: el.getAttribute('data-art'), shapes: svg.querySelectorAll('path,rect,circle,ellipse,polygon').length, w: r.width, h: r.height, top: r.top, bottom: r.bottom };
  });
  assert.ok(info.shapes > 8, `${info.id}: picture looks empty (${info.shapes} shapes)`);
  assert.ok(info.w >= minW && info.h >= minW * 0.55, `${info.id}: picture too small (${Math.round(info.w)}×${Math.round(info.h)})`);
  return info;
}

/** Existing games use actual gameplay photos; newly added games can keep their SVG aid. */
async function checkStep(page, id, step, mobile) {
  const photo = page.getByTestId('tutorial-photo');
  assert.ok(await page.locator('.tutorial__text strong').count(), `${id} step ${step}: missing emphasis`);
  if (id === 'copycat-conductor' && step === 2) {
    assert.ok((await page.locator('.tutorial__text').textContent()).includes(mobile ? 'tapping' : 'A, S, J and K'));
  }
  if (!await photo.count()) return checkArt(page, '[data-testid="tutorial"]', 'tutorial-art');
  await page.waitForFunction(() => { const img = document.querySelector('[data-testid="tutorial-photo"]'); return img?.complete && img.naturalWidth === 960 && img.naturalHeight === 540; });
  assert.equal(await photo.getAttribute('src'), `./assets/ui/tutorials/${id}-${step}.webp`);
  assert.equal(await photo.getAttribute('alt'), await page.locator('.tutorial__visual figcaption').textContent());
  const box = await photo.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= page.viewportSize().width, `${id}: photo fits screen`);
  return { id: await photo.getAttribute('src') };
}

/** Screenshots are for people to review; a busy software-rendered page can stall one, so a
 *  timeout is reported and skipped rather than failing the run. */
async function shot(page, name) {
  try {
    await page.screenshot({ path: path.join(out, name), timeout: 240000, animations: 'disabled' });
  } catch (e) {
    console.warn(`  screenshot ${name} skipped: ${e.message.split('\n')[0]}`);
  }
}

/** Start must stay reachable on screen (the actions are pinned to the bottom of the card). */
async function checkStartVisible(page, viewport, where) {
  const box = await page.getByTestId('match-start').boundingBox();
  assert.ok(box && box.y >= 0 && box.y + box.height <= viewport.height + 1, `${where}: Start is off screen (${JSON.stringify(box)})`);
}

(async () => {
  // The intro card and menu sheet are DOM, so by default the browser runs without a GPU: the 3D
  // room then stays blank, and screenshots take under a second instead of minutes on SwiftShader.
  // TUT_GL=1 renders the scene behind the cards as the other e2e checks do.
  const gl = process.env.TUT_GL ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-gpu'];
  let browser = null;
  const layouts = (process.env.LAYOUTS || 'desktop,portrait').split(',');
  let pages = 0;
  try {
    for (const layout of layouts) {
      // A fresh browser per layout: a busy renderer left by the last card can't stall the next.
      browser = await chromium.launch({ args: gl });
      const mobile = layout !== 'desktop';
      const viewport = VIEWPORTS[layout];
      const errors = [];
      const open = async (hash) => {
        const page = await browser.newPage({ viewport, hasTouch: mobile, isMobile: mobile });
        page.setDefaultTimeout(180000);
        page.on('pageerror', (e) => { if (!/webgl|context/i.test(e.message)) errors.push(e.message); });
        await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, coachSeen: ['menu', 'pavilion', 'trial', 'workshop', 'shop', 'scoreboard', 'jukebox', 'lobby'], quality: 'low', tutorials: true }, version: 0 })));
        await page.goto(BASE + '?debug' + hash);
        await page.waitForSelector('.loading', { state: 'detached', timeout: 600000 });
        if (!process.env.TUT_GL) await page.addStyleTag({ content: 'canvas { visibility: hidden !important; }' });
        return page;
      };

      // Main menu → How to play: the four Hub control pictures.
      let page = await open('');
      await page.getByTestId('menu-howto').click();
      const pics = page.getByTestId('howto-pics');
      await pics.waitFor({ state: 'visible' });
      assert.equal(await pics.locator('[data-testid="howto-art"]').count(), 4);
      for (let k = 0; k < 4; k++) await checkArt(page, `[data-testid="howto-pics"] li:nth-child(${k + 1})`, 'howto-art');
      await shot(page, `tut-${layout}-menu-howto.png`);
      await page.close();

      // Every game's intro card, opened straight from the previous one through the ?debug hook.
      page = await open('#play');
      let touchPictures = 0;
      let keyChips = 0;
      for (const id of GAMES) {
        await page.evaluate((g) => window.__toybox.match.practice(g), id);
        await page.waitForFunction(() => window.__toybox.match.phase() === 'intro', null, { timeout: 600000 });
        const tut = page.getByTestId('tutorial');
        await tut.waitFor({ state: 'visible' });
        const total = Number((await page.getByTestId('tutorial-step').textContent()).split('/')[1]);
        assert.ok(total >= 3 && total <= 4, `${id}: ${total} steps`);
        for (let n = 1; n <= total; n++) {
          await page.waitForFunction((k) => document.querySelector('[data-testid="tutorial-step"]').textContent.trim().startsWith(`${k} `), n);
          const info = await checkStep(page, id, n, mobile);
          if (info.id.endsWith('-touch')) touchPictures++;
          // The picture sits above (or beside, in short landscape) the step's title.
          // Measured in one go: the card may still be sliding in.
          const order = await tut.evaluate((el) => { const a = el.querySelector('[data-testid="tutorial-art"], .tutorial__visual').getBoundingClientRect(); const t = el.querySelector('.tutorial__title').getBoundingClientRect(); return { art: Math.round(a.top), title: Math.round(t.bottom) }; });
          assert.ok(order.art < order.title, `${id} step ${n}: picture is not above or beside the title (${JSON.stringify(order)})`);
          await checkStartVisible(page, viewport, `${id} step ${n}`);
          // Clicking Next can scroll a short card; show the whole step in the screenshot.
          await tut.evaluate((el) => el.scrollIntoView({ block: 'start' }));
          await shot(page, `tut-${layout}-${id}-${n}.png`);
          pages++;
          await page.getByTestId('tutorial-next').click();
        }
        // "Got it" leaves the plain card: one thumbnail per step above the description.
        await tut.waitFor({ state: 'detached' });
        const row = page.getByTestId('intro-art-row');
        await row.waitFor({ state: 'visible' });
        assert.equal(await row.locator('[data-testid="intro-art"]').count(), total, `${id}: thumbnail row`);
        await checkArt(page, '[data-testid="intro-art-row"]', 'intro-art', 60); // thumbnails
        if (mobile) touchPictures += await row.locator('[data-art$="-touch"]').count();
        await checkStartVisible(page, viewport, `${id} plain card`);
        // The controls row: every key chip keeps its label on one line and stays inside the card.
        const chips = await page.getByTestId('intro-controls').evaluate((row) => {
          const box = row.getBoundingClientRect();
          return [...row.querySelectorAll('.keycap')].map((k) => {
            const range = document.createRange();
            range.selectNodeContents(k);
            const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
            const r = k.getBoundingClientRect();
            return { label: k.textContent, lines, inside: r.left >= box.left - 1 && r.right <= box.right + 1 };
          });
        });
        for (const c of chips) assert.ok(c.lines === 1 && c.inside, `${id}: key chip "${c.label}" breaks or overflows (${JSON.stringify(c)})`);
        if (!mobile) assert.ok(chips.length > 0, `${id}: no key chips on the desktop card`);
        keyChips += chips.length;
        await page.evaluate(() => { document.querySelector('.match-intro').scrollTop = 0; });
        await shot(page, `tut-${layout}-${id}-card.png`);
        if (id === 'copycat-conductor' || id === 'toy-tower-tumble') {
          await page.getByTestId('tutorial-open').click();
          await page.getByTestId('tutorial-next').click();
          await page.getByTestId('tutorial-back').click();
          assert.match(await page.getByTestId('tutorial-step').textContent(), /1\s*\//);
          for (let k = 0; k < total; k++) await page.getByTestId('tutorial-next').click();
        }
        console.log(`  ${layout} ${id}: ${total} steps ok`);
      }
      if (mobile) assert.ok(touchPictures > 0, 'phones should see the touch pictures');
      else assert.equal(touchPictures, 0, 'desktop should see the keyboard pictures');
      assert.deepEqual(errors, [], `page errors on ${layout}`);
      await page.close();
      await browser.close();
      browser = null;
      console.log(`tutorials ${layout}: ok (${keyChips} key chips on one line each)`);
    }
    console.log(`tutorials: ${pages} tutorial pages checked; screenshots in ${out}`);
  } finally {
    if (browser) await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
