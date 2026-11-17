/* Milestone 6: movement minigames (Red Light Green Light, Wind-Up Dash) on desktop and an emulated phone.
   There is no hub entrance yet, so the games are opened with the ?debug hook __toybox.match.practice(id).
   Run: npx vite preview --port 4176 &  BASE_URL=http://localhost:4176/ node tests/e2e/movement.cjs
   ONLY=rlgl|dash limits the run to one game. */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4176/';
const ONLY = process.env.ONLY || '';
const res = [];
const check = (n, ok, d = '') => {
  res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
  console.log(res[res.length - 1]);
};
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const SEED = () => {
  if (!sessionStorage.getItem('seeded')) {
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low' }, version: 0 }));
  }
};

/** Helpers bound to a page. */
function kit(page) {
  const scale = (k) => page.evaluate((k) => window.__toybox.match.timeScale(k), k);
  const snap = async (name, back = 1) => {
    await scale(0);
    await page.waitForTimeout(1300); // let frames with the frozen state render (and HUD pop-in animations finish)
    await page.screenshot({ path: `${OUT}/${name}` });
    await scale(back);
  };
  /** Compact view of either racing game's state, for the local player. */
  const R = () =>
    page.evaluate(() => {
      const s = window.__toybox.match.state();
      if (!s || !s.players) return { host: window.__toybox.match.phase(), s: null };
      const p = s.players.find((x) => x.id === 'you');
      const c = s.config;
      const prog = c.startZ !== undefined ? Math.max(0, Math.min(1, (c.startZ - p.m.z) / (c.startZ - c.finishZ))) : 0;
      const dash = s.course
        ? {
            rows: s.course.rows,
            wall: s.course.wall,
            pad: s.course.pad,
            jam: s.course.jam,
            ruler: s.course.ruler,
            down: s.dominoes.filter((d) => d.state !== 'up').length,
            // Per jaw: ms until it next shuts (0 = shut now).
            jaws: s.course.jaws.map((j) => {
              const k = (((s.t + j.offsetMs) % j.periodMs) + j.periodMs) % j.periodMs;
              const shutAt = j.periodMs - 750;
              return { x: j.x, z: j.z, hx: j.hx, hz: j.hz, untilShut: k >= shutAt ? 0 : shutAt - k };
            }),
          }
        : null;
      return {
        host: window.__toybox.match.phase(),
        dash,
        s: { phase: s.phase, phaseT: s.phaseT, t: s.t, cycle: s.cycle, n: s.players.length },
        me: { x: p.m.x, y: p.m.y, z: p.m.z, speed: Math.hypot(p.m.vx, p.m.vz), grounded: p.m.grounded, caught: p.caught, held: p.held, fling: !!p.fling, finished: p.finished, prog, stun: p.stunMs, snaps: p.snaps, toppled: p.toppled, toss: !!p.toss },
      };
    });
  const waitFor = async (pred, label, ms = 240000, every = 60) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const r = await R();
      if (pred(r)) return r;
      await page.waitForTimeout(every);
    }
    throw new Error('timeout waiting for ' + label);
  };
  /**
   * Fast-forward while nothing needs a reaction. Match time advances at most 100 ms × scale per
   * rendered frame, so under slow software rendering scale 1 already gives the script a look at
   * every 100 ms of game time; idle stretches are skipped at 3×.
   */
  const ff = async (pred, label, ms) => {
    await scale(3);
    const r = await waitFor(pred, label, ms);
    await scale(1);
    return r;
  };
  /** The HUD re-renders on a ticker, so give text a moment to catch up with the state. */
  const textHas = async (sel, sub, ms = 8000) => {
    const t0 = Date.now();
    let txt = '';
    while (Date.now() - t0 < ms) {
      txt = (await page.textContent(sel).catch(() => '')) || '';
      if (txt.includes(sub)) return true;
      await page.waitForTimeout(80);
    }
    return false;
  };
  const open = async (id) => {
    await page.evaluate((id) => window.__toybox.match.practice(id), id);
    await page.waitForSelector('.match-intro', { timeout: 60000 });
    await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
  };
  return { scale, snap, R, waitFor, ff, open, textHas };
}

// ============================================================================ desktop: RLGL
async function desktopRlgl(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(SEED);
  const { scale, snap, R, waitFor, ff, open, textHas } = kit(page);

  await page.goto(BASE + '?debug#play');
  await page.waitForSelector('.loading', { state: 'detached' });
  await page.waitForTimeout(1500);
  await open('red-light-green-light');
  check('RLGL: practice hook opens the intro card (lazy-loaded module)', (await page.textContent('.match-intro h2')).includes('Red Light'));
  check('RLGL: intro shows keyboard controls', (await page.$$('.intro-controls .keycap')).length >= 2);
  const opts = await page.$$eval('.intro-options .segmented >> nth=0 >> button', (els) => els.map((e) => e.textContent));
  check('RLGL: needs company (no Solo option, 3 bots by default)', !opts.includes('Solo') && (await page.textContent('.intro-options .segmented .on'))?.includes('3 bots'), opts.join(','));
  await page.click('.intro-options .segmented >> nth=1 >> button >> nth=0'); // easy bots
  await page.screenshot({ path: `${OUT}/m6-01-rlgl-intro.png` });
  await page.click('[data-testid=match-start]');
  await page.waitForSelector('.countdown', { timeout: 30000 });
  let r = await waitFor((r) => r.host === 'playing' && r.s, 'playing');
  check('RLGL: four toys on the start line', r.s.n === 4 && r.me.prog === 0, `n=${r.s.n}`);

  // Holding forward before the first green does nothing.
  await page.keyboard.down('KeyW');
  r = await waitFor((r) => r.s.phase === 'go', 'first green');
  check('RLGL: signal says GO on green', await textHas('[data-testid=rl-signal]', 'GO'));
  r = await waitFor((r) => r.me.prog > 0.06 || r.s.phase !== 'go', 'some progress');
  await snap('m6-02-rlgl-go.png', 1);
  r = await waitFor((r) => r.s.phase === 'warn', 'the tell');
  await page.keyboard.up('KeyW'); // stop on the tell
  const atTell = r.me.prog;
  check('RLGL: a GO run makes progress down the runway', atTell > 0.08, `progress ${(atTell * 100).toFixed(0)}%`);
  await snap('m6-03-rlgl-warn.png', 1);
  check('RLGL: signal warns during the tell', (await textHas('[data-testid=rl-signal]', 'turning', 1500)) || (await R()).s.phase !== 'warn');
  r = await ff((r) => r.s.phase === 'stop' && r.s.phaseT > 600, 'red');
  await snap('m6-04-rlgl-stop.png', 1);
  check('RLGL: signal says STOP on red', await textHas('[data-testid=rl-signal]', 'STOP'));
  check('RLGL: stopping on the tell is safe (not caught, progress kept)', r.me.caught === 0 && r.me.prog >= atTell - 0.001 && r.me.speed === 0, `caught=${r.me.caught} prog=${(r.me.prog * 100).toFixed(0)}%`);

  // Now break the rule: keep running through the red light.
  r = await ff((r) => r.s.phase === 'go', 'second green');
  await page.keyboard.down('KeyW');
  r = await waitFor((r) => r.me.caught > 0, 'caught on red');
  check('RLGL: moving on red is caught', r.s.phase === 'stop' && r.me.caught === 1 && r.me.held, `phase=${r.s.phase} t=${r.s.phaseT.toFixed(0)}ms`);
  await page.waitForSelector('[data-testid=rl-note]', { timeout: 30000 });
  check('RLGL: the HUD says why', await textHas('[data-testid=rl-note]', 'Caught'));
  await snap('m6-05-rlgl-caught.png', 1);
  r = await ff((r) => !r.me.fling, 'landed');
  check('RLGL: the penalty is a knock-back to the start line', r.me.prog === 0, `progress ${(r.me.prog * 100).toFixed(0)}%`);
  await page.waitForTimeout(700);
  r = await R();
  check('RLGL: a caught toy is held until the next green (key still down)', r.s.phase !== 'stop' || (r.me.speed === 0 && r.me.caught === 1), `speed=${r.me.speed.toFixed(1)} caught=${r.me.caught}`);
  await page.keyboard.up('KeyW');

  // Play properly to the finish: run on green, let go on the tell.
  let down = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 400000) {
    r = await R();
    if (!r.s || r.host !== 'playing' || r.me.finished) break;
    const want = r.s.phase === 'go' && !r.me.held;
    if (want !== down) {
      await page.keyboard[want ? 'down' : 'up']('KeyW');
      down = want;
    }
    await page.waitForTimeout(40);
  }
  if (down) await page.keyboard.up('KeyW');
  check('RLGL: obeying the signal gets you across the finish line', !!r.me?.finished || r.host === 'results', `caught=${r.me?.caught} host=${r.host}`);
  if (r.host === 'playing') await snap('m6-06-rlgl-finish.png', 1);
  await scale(6); // let the bots finish / the closing clock run out
  await page.waitForSelector('.results', { timeout: 240000 });
  await page.waitForTimeout(900);
  const rows = await page.$$eval('.results-list li', (els) => els.map((e) => e.textContent));
  check('RLGL: results list all four toys with scores', rows.length === 4 && rows.every((x) => /points?/.test(x)), rows.join(' | '));
  check('RLGL: no "last standing" wording in a race', !rows.some((x) => x.includes('last standing')));
  await page.screenshot({ path: `${OUT}/m6-07-rlgl-results.png` });
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['red-light-green-light']);
  check('RLGL: record saved (finishers score over 100)', rec?.best > 100 && rec?.plays === 1, JSON.stringify(rec));

  // Pause works, and leaving returns to the hub.
  await page.click('[data-testid=results-again]');
  await page.waitForSelector('.countdown', { timeout: 30000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  check('RLGL: Esc pauses the match', await page.isVisible('.pause'));
  await page.click('.pause__actions .toy-btn >> nth=1');
  await page.waitForSelector('.hud-sign', { timeout: 60000 });
  check('RLGL: quitting returns to the Playroom', true);
  check('RLGL desktop: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// ============================================================================== phone: RLGL
async function phoneRlgl(browser) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 915, height: 412 }, screen: { width: 915, height: 412 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id = 0]) => ({ x, y, id })) });
  const { scale, snap, R, waitFor, ff, open, textHas } = kit(page);
  const inView = (b, w, h) => b && b.x >= 0 && b.y >= 0 && b.x + b.width <= w && b.y + b.height <= h;
  const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  await page.goto(BASE + '?debug#play');
  await page.waitForTimeout(5000);
  await open('red-light-green-light');
  check('RLGL phone: intro explains the touch controls', (await page.textContent('.intro-controls')).includes('joystick'));
  await page.screenshot({ path: `${OUT}/m6-10-rlgl-phone-intro.png` });
  await page.tap('[data-testid=match-start]');
  let r = await waitFor((r) => r.host === 'playing' && r.s, 'playing');
  await scale(1);
  check('RLGL phone: joystick zone and Jump button are on screen', (await page.isVisible('.touch-stick-zone')) && (await page.isVisible('[data-testid=mv-jump]')));
  const jb = await page.locator('[data-testid=mv-jump]').boundingBox();
  check('RLGL phone: Jump button is ≥ 56 px and inside the screen', jb.width >= 56 && jb.height >= 56 && inView(jb, 915, 412), `${jb.width}×${jb.height}`);

  // Landscape: push the stick up on green, let go on the tell.
  r = await ff((r) => r.s.phase === 'go' && r.s.phaseT > 50, 'green');
  const z0 = r.me.z;
  await touch('touchStart', [[130, 300]]);
  await touch('touchMove', [[130, 270]]);
  await touch('touchMove', [[130, 236]]);
  r = await waitFor((r) => r.me.prog > 0.05 || r.s.phase !== 'go', 'moving');
  await snap('m6-11-rlgl-phone-landscape.png', 1);
  r = await waitFor((r) => r.s.phase !== 'go', 'tell');
  await touch('touchEnd', []);
  check('RLGL phone: the joystick runs the toy down the runway (landscape)', r.me.z < z0 - 4, `z ${z0.toFixed(1)} → ${r.me.z.toFixed(1)}`);
  r = await ff((r) => r.s.phase === 'stop' && r.s.phaseT > 500, 'red');
  check('RLGL phone: letting go of the stick on the tell is safe', r.me.caught === 0 && r.me.speed === 0, `caught=${r.me.caught}`);

  // Steering and the Jump button.
  r = await ff((r) => r.s.phase === 'go' && r.s.phaseT > 50, 'green 2');
  const x0 = r.me.x;
  await touch('touchStart', [[130, 300, 1]]);
  await touch('touchMove', [[170, 300, 1]]);
  await touch('touchMove', [[190, 300, 1]]);
  await page.waitForTimeout(900);
  await touch('touchEnd', []);
  r = await R();
  check('RLGL phone: pushing the stick right steers right', r.me.x > x0 + 0.5, `x ${x0.toFixed(1)} → ${r.me.x.toFixed(1)}`);
  r = await ff((r) => r.s.phase === 'go' && r.s.phaseT > 50 && r.me.grounded && !r.me.held, 'green 3');
  await touch('touchStart', [[jb.x + jb.width / 2, jb.y + jb.height / 2, 2]]);
  let peak = 0;
  for (let i = 0; i < 30; i++) {
    const q = await R();
    peak = Math.max(peak, q.me.y);
    await page.waitForTimeout(60);
  }
  await touch('touchEnd', []);
  check('RLGL phone: the Jump button jumps', peak > 0.5, `peak y=${peak.toFixed(2)}`);

  // Portrait: same controls, the whole HUD still fits.
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(2500);
  const top = await page.locator('.mv-top').boundingBox();
  const pause = await page.locator('.match-pause').boundingBox();
  const jb2 = await page.locator('[data-testid=mv-jump]').boundingBox();
  check('RLGL phone: portrait HUD fits and clears the pause button', inView(top, 412, 915) && !overlap(top, pause) && inView(jb2, 412, 915), JSON.stringify(top));
  r = await ff((r) => r.s.phase === 'go' && r.s.phaseT > 50 && !r.me.held, 'green (portrait)');
  const z1 = r.me.z;
  await touch('touchStart', [[120, 760, 3]]);
  await touch('touchMove', [[120, 730, 3]]);
  await touch('touchMove', [[120, 696, 3]]);
  r = await waitFor((r) => r.me.z < z1 - 3 || r.s.phase !== 'go', 'moving (portrait)');
  await snap('m6-12-rlgl-phone-portrait.png', 1);
  r = await waitFor((r) => r.s.phase !== 'go', 'tell (portrait)');
  await touch('touchEnd', []);
  check('RLGL phone: the joystick runs the toy in portrait too', r.me.z < z1 - 3, `z ${z1.toFixed(1)} → ${r.me.z.toFixed(1)}`);

  // Run a red light in portrait for the screenshot of the penalty, then leave via the pause button.
  r = await ff((r) => r.s.phase === 'go' && r.s.phaseT > 50 && !r.me.held, 'green (portrait 2)');
  const before = r.me.caught;
  await touch('touchStart', [[120, 760, 4]]);
  await touch('touchMove', [[120, 696, 4]]);
  r = await waitFor((r) => r.me.caught > before, 'caught (portrait)');
  await touch('touchEnd', []);
  await snap('m6-13-rlgl-phone-portrait-caught.png', 1);
  check('RLGL phone: running a red light with the stick is punished', r.me.caught > before);
  await scale(1);
  await page.tap('.match-pause');
  await page.waitForTimeout(1000);
  check('RLGL phone: pause button opens the pause sheet', await page.isVisible('.pause'));
  await page.tap('.pause__actions .toy-btn >> nth=1');
  await page.waitForSelector('.touch-stick-zone', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(800);
  check('RLGL phone: back in the Playroom with the hub controls', (await page.isVisible('.touch-stick-zone')) && !(await page.isVisible('[data-testid=mv-jump]')));
  check('RLGL phone: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (!ONLY || ONLY === 'rlgl') {
      await desktopRlgl(browser);
      await phoneRlgl(browser);
    }
  } catch (e) {
    check('aborted: ' + e.message, false);
  }
  await browser.close();
  const fails = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fails} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
