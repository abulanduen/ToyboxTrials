/* Wind-Up Dash course gallery: screenshots of several freshly dealt courses, for looking at.
   Not a pass/fail suite. For each course: a high side view of the whole road (the ?debug-only
   `__toybox.dashCam = 'overview'`), then the chase camera's view just before each trap; on a
   phone-sized landscape and portrait page, the view a little way into the run.
   Run: npx vite preview --port 4181 --strictPort &
        BASE_URL=http://localhost:4181/ node tests/e2e/dashshots.cjs        (COURSES=4 QUALITY=low|balanced) */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4181/';
const COURSES = Number(process.env.COURSES || 4);
const QUALITY = process.env.QUALITY || 'low';
const ONLY = process.env.ONLY || '';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

function kit(page) {
  /** Wait for rendered frames rather than a fixed time: the machine may be drawing 1 frame a second. */
  const frames = (n = 5) =>
    page.evaluate(
      (n) =>
        new Promise((done) => {
          let k = 0;
          const tick = () => (++k >= n ? done() : requestAnimationFrame(tick));
          requestAnimationFrame(tick);
        }),
      n,
    );
  const racing = () =>
    page.waitForFunction(
      () => {
        const s = window.__toybox.match.state();
        return window.__toybox.match.phase() === 'playing' && s && s.course && s.course.road && s.phase === 'race';
      },
      null,
      { timeout: 900000 },
    );
  /** Stop the clock ending the race under us, and describe the course. */
  const course = () =>
    page.evaluate(() => {
      const s = window.__toybox.match.state();
      s.config.limitMs = s.config.closingMs = s.endAt = 3.6e6;
      return { seed: s.course.seed, length: s.course.startZ - s.course.finishZ, startZ: s.course.startZ, sections: s.course.sections.map((q) => ({ kind: q.kind, level: q.level, z0: q.z0, z1: q.z1, cx: q.cx })) };
    });
  const put = (x, z) =>
    page.evaluate(
      ([x, z]) => {
        const p = window.__toybox.match.state().players.find((q) => q.id === 'you');
        Object.assign(p.m, { x, z, vx: 0, vz: 0, y: 0, vy: 0, grounded: true });
      },
      [x, z],
    );
  const scale = (k) => page.evaluate((k) => window.__toybox.match.timeScale(k), k);
  const endRace = async () => {
    await page.evaluate(() => {
      const s = window.__toybox.match.state();
      s.endAt = s.t + 30;
      window.__toybox.match.timeScale(1);
    });
    await page.waitForSelector('.results', { timeout: 300000 });
    await page.waitForFunction(() => !document.querySelector('[data-testid=results-again]')?.disabled);
  };
  return { frames, racing, course, put, scale, endRace };
}

const seedStore = (quality) => {
  if (!sessionStorage.getItem('seeded')) {
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality, tutorials: false }, version: 0 }));
  }
};

async function open(page) {
  await page.goto(BASE + '?debug#play');
  await page.waitForFunction(() => window.__toybox && window.__toybox.match && !document.querySelector('.loading'), null, { timeout: 180000 });
  await page.evaluate(() => window.__toybox.match.practice('wind-up-dash'));
  await page.waitForSelector('[data-testid=match-start]', { timeout: 120000 });
}

async function desktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE ERROR', m.text()));
  await page.addInitScript(seedStore, QUALITY);
  const { frames, racing, course, put, scale, endRace } = kit(page);
  await open(page);
  for (let k = 0; k < COURSES; k++) {
    // The match buttons ignore clicks for a moment after appearing: keep trying until the race is on.
    const btn = k === 0 ? '[data-testid=match-start]' : '[data-testid=results-again]';
    for (let i = 0; i < 400 && (await page.$(btn)); i++) {
      await page.click(btn, { timeout: 2000 }).catch(() => {});
      await frames(2);
    }
    await racing();
    const c = await course();
    console.log(`course ${k + 1}: seed ${c.seed}, ${c.length} cm: ${c.sections.map((q) => q.kind + q.level).join(' → ')}`);
    await scale(0.2);
    await page.evaluate(() => (window.__toybox.dashCam = 'overview'));
    await frames(6);
    await page.screenshot({ path: `${OUT}/dash-course${k + 1}-overview.png` });
    await page.evaluate(() => (window.__toybox.dashCam = ''));
    for (const [i, q] of c.sections.entries()) {
      await put(q.cx, q.z0 + 4);
      await frames(8);
      await page.screenshot({ path: `${OUT}/dash-course${k + 1}-trap${i + 1}-${q.kind}${q.level}.png` });
    }
    await endRace();
  }
  await page.close();
}

async function phone(browser, name, viewport) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport, screen: viewport });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.addInitScript(seedStore, 'low');
  const { frames, racing, course, put, scale, endRace } = kit(page);
  await open(page);
  for (let k = 0; k < COURSES; k++) {
    const btn = k === 0 ? '[data-testid=match-start]' : '[data-testid=results-again]';
    for (let i = 0; i < 400 && (await page.$(btn)); i++) {
      await page.tap(btn, { timeout: 2000 }).catch(() => {});
      await frames(2);
    }
    await racing();
    const c = await course();
    console.log(`${name} course ${k + 1}: seed ${c.seed}: ${c.sections.map((q) => q.kind + q.level).join(' → ')}`);
    await scale(0.2);
    // Mid-run: coming up to the second trap, then the fourth (or last).
    for (const i of [1, Math.min(3, c.sections.length - 1)]) {
      const q = c.sections[i];
      await put(q.cx, q.z0 + 5);
      await frames(8);
      await page.screenshot({ path: `${OUT}/dash-course${k + 1}-${name}-trap${i + 1}-${q.kind}${q.level}.png` });
    }
    await endRace();
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (!ONLY || ONLY === 'desktop') await desktop(browser);
    if (!ONLY || ONLY === 'landscape') await phone(browser, 'phone-landscape', { width: 915, height: 412 });
    if (!ONLY || ONLY === 'portrait') await phone(browser, 'phone-portrait', { width: 412, height: 915 });
  } catch (e) {
    console.log('aborted: ' + e.message);
    process.exitCode = 1;
  }
  await browser.close();
})();
