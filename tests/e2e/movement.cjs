/* Milestone 6: movement minigames (Red Light Green Light, Wind-Up Dash) on desktop and an emulated phone.
   There is no hub entrance yet, so the games are opened with the ?debug hook __toybox.match.practice(id).
   Run: npx vite preview --port 4176 &  BASE_URL=http://localhost:4176/ node tests/e2e/movement.cjs
   ONLY=rlgl|dash|dash-desktop limits the run. */
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
    localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low', tutorials: false }, version: 0 }));
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
        me: { x: p.m.x, y: p.m.y, z: p.m.z, vx: p.m.vx, speed: Math.hypot(p.m.vx, p.m.vz), grounded: p.m.grounded, caught: p.caught, held: p.held, fling: !!p.fling, finished: p.finished, prog, stun: p.stunMs, snaps: p.snaps, toppled: p.toppled, toss: !!p.toss },
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
  check('RLGL phone: the joystick runs the toy down the runway (landscape)', r.me.z < z0 - 1, `z ${z0.toFixed(1)} → ${r.me.z.toFixed(1)}`);
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
  check('RLGL phone: the joystick runs the toy in portrait too', r.me.z < z1 - 1, // a short "snap" green only leaves time for a centimetre or two
    `z ${z1.toFixed(1)} → ${r.me.z.toFixed(1)}`);

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

// ============================================================================ desktop: Dash
async function desktopDash(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(SEED);
  const { scale, snap, R, waitFor, open, textHas } = kit(page);
  const held = { KeyW: false, KeyS: false, KeyA: false, KeyD: false };
  const key = async (k, on) => {
    if (held[k] === on) return;
    held[k] = on;
    await page.keyboard[on ? 'down' : 'up'](k);
  };
  const stop = async () => { for (const k of Object.keys(held)) await key(k, false); };
  /** Run forward steering towards aim(r) (an x, or null for "stand still") until done(r). */
  const drive = async (aim, done, label, ms = 300000) => {
    const t0 = Date.now();
    let r = await R();
    while (Date.now() - t0 < ms) {
      r = await R();
      if (!r.s || r.host !== 'playing' || done(r)) break;
      const a = aim(r);
      const x = a && typeof a === 'object' ? a.x : a;
      if (x === null) await stop();
      else {
        await key('KeyW', !(a && (a.sidestep || a.back))); // sidestep: line up first, don't run forward yet
        await key('KeyS', !!(a && a.back));
        // Keys are all-or-nothing, so let go early enough to coast to a stop on the line.
        const dx = x - r.me.x;
        const closing = Math.sign(dx) === Math.sign(r.me.vx);
        const need = Math.abs(dx) - (closing ? (r.me.vx * r.me.vx) / 110 + Math.abs(r.me.vx) * 0.08 : 0);
        const band = a && a.sidestep ? 0.2 : 0.5;
        await key('KeyD', need > band && dx > 0);
        await key('KeyA', need > band && dx < 0);
      }
      await page.waitForTimeout(30);
    }
    if (Date.now() - t0 >= ms) throw new Error('timeout driving: ' + label);
    return r;
  };
  const rulerX = (d, z) => {
    const k = Math.max(0, Math.min(1, (d.jam.z0 - z) / (d.jam.z0 - d.jam.z1)));
    return d.ruler.x0 + (d.ruler.x1 - d.ruler.x0) * k;
  };

  await page.goto(BASE + '?debug#play');
  await page.waitForSelector('.loading', { state: 'detached' });
  await page.waitForTimeout(1500);
  await open('wind-up-dash');
  check('Dash: practice hook opens the intro card (lazy-loaded module)', (await page.textContent('.match-intro h2')).includes('Wind-Up Dash'));
  await page.click('.intro-options .segmented >> nth=1 >> button >> nth=0'); // easy bots
  await page.screenshot({ path: `${OUT}/m6-20-dash-intro.png` });
  await page.click('[data-testid=match-start]');
  let r = await waitFor((r) => r.host === 'playing' && r.s && r.s.phase === 'race', 'race start');
  // This scripted run dawdles on purpose (and software rendering is slow), so stop the clock from
  // closing the race once the bots are home. Test-only: the ?debug hook exposes the live state.
  await page.evaluate(() => {
    const s = window.__toybox.match.state();
    s.config.closingMs = 3600000;
    s.config.limitMs = 3600000;
    s.endAt = 3600000;
  });
  const d = r.dash;
  check('Dash: four toys on the grid, course built from the seed', r.s.n === 4 && d.rows.length === 3 && d.jaws.length === 6);

  // 1. Dominoes: barge straight into one in the first row, then use the gaps for the other rows.
  const nearestGap = (row, x) => row.gaps.reduce((b, g) => (Math.abs(g - x) < Math.abs(b - x) ? g : b), row.gaps[0]);
  const solidX = d.rows[0].gaps.some((g) => Math.abs(g) < 0.1) ? 2.4 : 0; // a spot in row 1 with a domino standing in it
  r = await drive(() => solidX, (r) => r.me.z < d.rows[0].z + 6, 'approach row 1');
  await snap('m6-21-dash-dominoes.png');
  r = await drive(() => solidX, (r) => r.me.z < d.rows[0].z - 1.5, 'through row 1');
  check('Dash: walking into a domino topples it and lets you through', r.me.toppled >= 1 && r.dash.down >= 1, `toppled=${r.me.toppled}`);
  const before = r.me.toppled;
  // Slow motion here: lining up with a 2.8 cm gap needs finer control than one look per 100 ms of game time.
  await scale(0.3);
  let gapX = null;
  let gapRow = -1;
  r = await drive(
    (r) => {
      const i = r.me.z > d.rows[1].z - 1 ? 1 : 2;
      if (i !== gapRow) {
        gapRow = i;
        gapX = nearestGap(d.rows[i], r.me.x); // pick once per row, then line up before walking through
      }
      const committed = r.me.z < d.rows[i].z + 1.0;
      return { x: gapX, sidestep: !committed && (Math.abs(r.me.x - gapX) > 0.3 || Math.abs(r.me.vx) > 2) };
    },
    (r) => r.me.z < d.rows[2].z - 1.5,
    'rows 2-3 by the gaps',
  );
  await scale(1);
  check('Dash: the gaps let you through without toppling anything', r.me.toppled === before, `toppled ${before} → ${r.me.toppled}`);

  // 2. Spring pad: over the wall.
  r = await drive(() => d.pad.x, (r) => r.me.toss || r.me.z < d.wall.z, 'onto the spring pad');
  check('Dash: the spring pad launches the toy', r.me.toss);
  await page.waitForTimeout(250);
  await snap('m6-22-dash-spring.png');
  await stop();
  r = await waitFor((r) => !r.me.toss, 'landed');
  check('Dash: …and it lands beyond the block wall', r.me.z < d.wall.z - 1, `z=${r.me.z.toFixed(1)} wall=${d.wall.z}`);

  // 3. Jam: wade in off the ruler (slow), then finish the crossing on the ruler (fast).
  const off = (z) => (rulerX(d, z) > 0 ? -1 : 1) * 8.5;
  r = await drive((r) => off(r.me.z), (r) => r.me.z < d.jam.z0 - 4, 'into the jam');
  check('Dash: jam slows the toy to a crawl', r.me.speed < 7, `speed=${r.me.speed.toFixed(1)} cm/s`);
  check('Dash: the HUD says to find the ruler', await textHas('[data-testid=wd-banner]', 'ruler'));
  await snap('m6-23-dash-jam.png');
  r = await drive((r) => rulerX(d, r.me.z - 1.5), (r) => r.me.z < d.jam.z1 + 5 && Math.abs(r.me.x - rulerX(d, r.me.z)) < 1.2, 'along the ruler');
  check('Dash: the ruler is full speed', r.me.speed > 10, `speed=${r.me.speed.toFixed(1)} cm/s`);
  r = await drive((r) => rulerX(d, r.me.z - 1.5), (r) => r.me.z < d.jam.z1 - 1, 'off the far end');

  // 4. Snap jaws. First row: stand in one on purpose and get snapped.
  const j0 = d.jaws[r.me.x > 0 ? 1 : 0];
  // Park in the middle of the jaw (backing up if the toy overshoots) and wait for it to bite.
  await scale(0.5);
  r = await drive((r) => (r.me.z > j0.z + 0.6 ? j0.x : r.me.z < j0.z - 0.6 ? { x: j0.x, back: true } : null), (r) => r.me.snaps > 0, 'snapped by the first jaw');
  await scale(1);
  await stop();
  check('Dash: a jaw snapping shut on the toy stuns it and spits it back', r.me.snaps === 1 && r.me.stun > 0 && r.me.z > j0.z + j0.hz, `stun=${r.me.stun.toFixed(0)}ms`);
  check('Dash: the HUD says Snapped!', await textHas('[data-testid=wd-banner]', 'Snapped'));
  await snap('m6-24-dash-snapped.png');
  // Then cross all three rows properly: wait short of the jaw until it has just re-opened.
  for (let row = 0; row < 3; row++) {
    const ji = row * 2 + (r.me.x > 0 ? 1 : 0);
    const j = d.jaws[ji];
    const line = j.z + j.hz + 2.2;
    r = await drive(
      (r) => {
        const clear = r.dash.jaws[ji].untilShut > 1100; // open for long enough to walk through
        if (r.me.z > line + 0.6) return j.x; // walk up to the line
        if (r.me.z < j.z + j.hz + 0.6) return j.x; // already committed
        return clear ? j.x : null;
      },
      (r) => r.me.z < j.z - j.hz - 1.2,
      `jaw row ${row + 1}`,
    );
  }
  check('Dash: waiting for the jaws to open gets you through all three rows unsnapped', r.me.snaps === 1, `snaps=${r.me.snaps}`);
  r = await drive(() => 0, (r) => r.me.finished, 'finish');
  await stop();
  check('Dash: crossing the line finishes the race', r.me.finished || r.host === 'results');
  await scale(6);
  await page.waitForSelector('.results', { timeout: 240000 });
  await page.waitForTimeout(900);
  const rows = await page.$$eval('.results-list li', (els) => els.map((e) => e.textContent));
  check('Dash: results list all four toys with scores', rows.length === 4 && rows.every((x) => /points?/.test(x)), rows.join(' | '));
  await page.screenshot({ path: `${OUT}/m6-25-dash-results.png` });
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['wind-up-dash']);
  check('Dash: record saved (finishers score 100 or more)', rec?.best >= 100 && rec?.plays === 1, JSON.stringify(rec));
  await page.click('[data-testid=results-leave]');
  await page.waitForSelector('.hud-sign', { timeout: 60000 });
  check('Dash: leaving returns to the Playroom', true);
  check('Dash desktop: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// ============================================================================== phone: Dash
async function phoneDash(browser) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 915, height: 412 }, screen: { width: 915, height: 412 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id = 0]) => ({ x, y, id })) });
  const { scale, snap, R, waitFor, open } = kit(page);
  const inView = (b, w, h) => b && b.x >= 0 && b.y >= 0 && b.x + b.width <= w && b.y + b.height <= h;
  const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  await page.goto(BASE + '?debug#play');
  await page.waitForTimeout(5000);
  await open('wind-up-dash');
  check('Dash phone: intro explains the touch controls', (await page.textContent('.intro-controls')).includes('joystick'));
  await page.tap('[data-testid=match-start]');
  let r = await waitFor((r) => r.host === 'playing' && r.s && r.s.phase === 'race', 'race start');
  const jb = await page.locator('[data-testid=mv-jump]').boundingBox();
  check('Dash phone: joystick zone and a ≥ 56 px Jump button are on screen', (await page.isVisible('.touch-stick-zone')) && jb.width >= 56 && jb.height >= 56 && inView(jb, 915, 412));
  const z0 = r.me.z;
  await touch('touchStart', [[130, 300]]);
  await touch('touchMove', [[130, 270]]);
  await touch('touchMove', [[130, 236]]);
  r = await waitFor((r) => r.me.z < z0 - 8, 'moving (landscape)');
  await snap('m6-30-dash-phone-landscape.png');
  await touch('touchEnd', []);
  check('Dash phone: the joystick runs the toy down the course (landscape)', r.me.z < z0 - 8, `z ${z0.toFixed(1)} → ${r.me.z.toFixed(1)}`);
  await touch('touchStart', [[jb.x + jb.width / 2, jb.y + jb.height / 2, 2]]);
  let peak = 0;
  for (let i = 0; i < 30; i++) {
    peak = Math.max(peak, (await R()).me.y);
    await page.waitForTimeout(60);
  }
  await touch('touchEnd', []);
  check('Dash phone: the Jump button jumps', peak > 0.5, `peak y=${peak.toFixed(2)}`);

  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(2500);
  const top = await page.locator('.mv-top').boundingBox();
  const pause = await page.locator('.match-pause').boundingBox();
  const jb2 = await page.locator('[data-testid=mv-jump]').boundingBox();
  check('Dash phone: portrait HUD fits and clears the pause button', inView(top, 412, 915) && !overlap(top, pause) && inView(jb2, 412, 915), JSON.stringify(top));
  r = await R();
  const z1 = r.me.z;
  await touch('touchStart', [[120, 760, 3]]);
  await touch('touchMove', [[120, 730, 3]]);
  await touch('touchMove', [[120, 696, 3]]);
  r = await waitFor((r) => r.me.z < z1 - 6 || r.me.toss || r.host !== 'playing', 'moving (portrait)');
  await snap('m6-31-dash-phone-portrait.png');
  await touch('touchEnd', []);
  check('Dash phone: the joystick runs the toy in portrait too', r.me.z < z1 - 3 || r.me.toss, `z ${z1.toFixed(1)} → ${r.me.z.toFixed(1)}`);
  await scale(1);
  if (await page.isVisible('.match-pause')) {
    await page.tap('.match-pause');
    await page.waitForTimeout(1000);
    await page.tap('.pause__actions .toy-btn >> nth=1');
  } else {
    await page.waitForTimeout(900);
    await page.tap('[data-testid=results-leave]');
  }
  await page.waitForSelector('.touch-stick-zone', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(800);
  check('Dash phone: back in the Playroom with the hub controls', (await page.isVisible('.touch-stick-zone')) && !(await page.isVisible('[data-testid=mv-jump]')));
  check('Dash phone: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (!ONLY || ONLY === 'rlgl') {
      await desktopRlgl(browser);
      await phoneRlgl(browser);
    }
    if (!ONLY || ONLY.startsWith('dash')) {
      await desktopDash(browser);
      if (ONLY !== 'dash-desktop') await phoneDash(browser);
    }
  } catch (e) {
    check('aborted: ' + e.message, false);
  }
  await browser.close();
  const fails = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fails} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
