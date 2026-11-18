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
      // Red Light keeps its runway in the config; Wind-Up Dash deals a course per match.
      const course = s.course && s.course.road ? s.course : null;
      const startZ = course ? course.startZ : c.startZ;
      const finishZ = course ? course.finishZ : c.finishZ;
      const prog = startZ !== undefined ? Math.max(0, Math.min(1, (startZ - p.m.z) / (startZ - finishZ))) : 0;
      const dash = course
        ? {
            seed: course.seed,
            startZ,
            finishZ,
            road: course.road,
            sections: course.sections,
            // What makes one course different from another: which traps, where, on what road.
            key: course.sections.map((q) => `${q.kind}${q.level}@${q.z0}:${q.cx}/${q.hw}`).join(' '),
            down: s.dominoes.filter((d) => d.state !== 'up').length,
          }
        : null;
      return {
        host: window.__toybox.match.phase(),
        dash,
        s: { phase: s.phase, phaseT: s.phaseT, t: s.t, cycle: s.cycle, n: s.players.length },
        me: { x: p.m.x, y: p.m.y, z: p.m.z, vx: p.m.vx, speed: Math.hypot(p.m.vx, p.m.vz), grounded: p.m.grounded, caught: p.caught, held: p.held, fling: !!p.fling, finished: p.finished, prog, stun: p.stunMs, snaps: p.snaps, toppled: p.toppled, bonks: p.bonks, bumps: p.bumps, toss: !!p.toss },
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
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low', tutorials: false }, version: 0 })); } }); // phones default to Low anyway; tutorials are tested elsewhere
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
/** Every trap kind the generator can deal (src/minigames/winddash/course.ts). */
const DASH_KINDS = ['dominoes', 'spring', 'jam', 'jaws', 'crayons', 'marbles', 'pendulum', 'tops', 'conveyor', 'books'];

/**
 * Dash helpers. The course is different every match, so nothing here knows where anything is:
 * it all comes from the generated course in `__toybox.match.state().course`.
 */
function dashKit(page, R, waitFor) {
  /** Stand the local toy somewhere on the course (test-only: the ?debug hook exposes the live state). */
  const put = (x, z) =>
    page.evaluate(
      ([x, z]) => {
        const p = window.__toybox.match.state().players.find((q) => q.id === 'you');
        Object.assign(p.m, { x, z, vx: 0, vz: 0, y: 0, vy: 0, grounded: true });
        p.stunMs = 0;
        p.toss = null;
      },
      [x, z],
    );
  /** This scripted run dawdles (and software rendering is slow), so stop the clock ending the race. */
  const holdClock = () =>
    page.evaluate(() => {
      const s = window.__toybox.match.state();
      s.config.closingMs = s.config.limitMs = s.endAt = 3600000;
    });
  const rulerX = (sec, z) => {
    const p = sec.path;
    if (z >= p[0].z) return p[0].x;
    for (let i = 1; i < p.length; i++) if (z >= p[i].z) return p[i - 1].x + ((p[i].x - p[i - 1].x) * (p[i - 1].z - z)) / (p[i - 1].z - p[i].z);
    return p[p.length - 1].x;
  };
  const key = (k, on) => page.keyboard[on ? 'down' : 'up'](k);

  /** One real-input check per trap kind, each starting from a spot read out of the course data. */
  const traps = {
    async dominoes(sec) {
      const d = await page.evaluate((i) => window.__toybox.match.state().dominoes.find((q) => q.sec === i && q.state === 'up'), sec.index);
      const before = (await R()).me.toppled;
      await put(d.x, d.z + 2.5);
      await key('KeyW', true);
      const r = await waitFor((r) => r.me.z < d.z - 1.5, 'through a domino');
      await key('KeyW', false);
      check('Dash dominoes: walking into one topples it and lets you through', r.me.toppled > before && r.dash.down >= 1, `toppled ${before} → ${r.me.toppled}`);
      const gap = sec.rows[0].gaps[0];
      await put(gap, sec.rows[0].z + 2.5);
      const t0 = (await R()).me.toppled;
      await key('KeyW', true);
      const g = await waitFor((r) => r.me.z < sec.rows[0].z - 1.2, 'through a gap');
      await key('KeyW', false);
      check('Dash dominoes: a gap lets you through without toppling anything', g.me.toppled === t0, `toppled ${t0} → ${g.me.toppled}`);
    },
    async spring(sec) {
      await put(sec.pad.x, sec.pad.z + sec.pad.hz + 1.5);
      await key('KeyW', true);
      let r = await waitFor((r) => r.me.toss || r.me.z < sec.wall.z, 'onto the spring pad');
      await key('KeyW', false);
      check('Dash spring: the pad launches the toy', r.me.toss);
      r = await waitFor((r) => !r.me.toss, 'landed');
      check('Dash spring: …and it lands beyond the block wall', r.me.z < sec.wall.z - 1, `z=${r.me.z.toFixed(1)} wall=${sec.wall.z}`);
      const away = sec.cx + (sec.wall.gateX > sec.cx ? -1.5 : 1.5);
      await put(away, sec.wall.z + 2.5);
      await key('KeyW', true);
      r = await waitFor((r) => r.me.z < sec.wall.z + 1.8 && r.me.speed < 0.5, 'up against the wall');
      await key('KeyW', false);
      check('Dash spring: the wall itself blocks', r.me.z > sec.wall.z + sec.wall.hz);
    },
    async jam(sec, textHas) {
      const mid = (sec.jam.z0 + sec.jam.z1) / 2;
      const off = sec.cx + (rulerX(sec, mid) > sec.cx ? -1 : 1) * (sec.hw - 1.5);
      await put(off, mid + 1.5);
      await key('KeyW', true);
      let r = await waitFor((r) => r.me.z < mid + 0.6, 'wading through jam');
      check('Dash jam: jam slows the toy to a crawl', r.me.speed < 7, `speed=${r.me.speed.toFixed(1)} cm/s`);
      check('Dash jam: the HUD says to find the ruler', await textHas('[data-testid=wd-banner]', 'ruler'));
      await key('KeyW', false);
      await put(rulerX(sec, mid + 1.5), mid + 1.5);
      await key('KeyW', true);
      r = await waitFor((r) => r.me.z < mid + 0.1, 'along the ruler');
      await key('KeyW', false);
      check('Dash jam: the ruler is full speed', r.me.speed > 9, `speed=${r.me.speed.toFixed(1)} cm/s`);
    },
    async jaws(sec, textHas) {
      const j = sec.jaws[0];
      const before = (await R()).me.snaps;
      await put(j.x, j.z);
      const r = await waitFor((r) => r.me.snaps > before, 'snapped by a jaw');
      check('Dash jaws: a jaw snapping shut on the toy stuns it and spits it back', r.me.stun > 0 && r.me.z > j.z + j.hz, `stun=${r.me.stun.toFixed(0)}ms`);
      check('Dash jaws: the HUD says Snapped!', await textHas('[data-testid=wd-banner]', 'Snapped'));
    },
    async crayons(sec) {
      const row = sec.rows[0];
      const door = row.doors[1];
      await put(door.x, row.z + 2.5);
      await key('KeyW', true);
      // Whatever the gate is doing now, holding forward gets through once its turn comes round.
      const r = await waitFor((r) => r.me.z < row.z - 1.5, 'through a crayon gate');
      await key('KeyW', false);
      check('Dash crayon gates: a gate lets the toy through when it lifts', r.me.z < row.z - 1.5);
      const post = row.posts[1];
      await put(post.x, row.z + 2.5);
      await key('KeyW', true);
      const b = await waitFor((r) => r.me.z < row.z + 2 && r.me.speed < 0.5, 'up against the fence');
      await key('KeyW', false);
      check('Dash crayon gates: the fence between the doorways blocks', b.me.z > row.z);
    },
    async marbles(sec, textHas) {
      const lane = sec.lanes[0];
      const before = (await R()).me.bonks;
      await put(sec.cx, lane.z);
      let r = await waitFor((r) => r.me.bonks > before, 'bowled over by a marble');
      check('Dash marbles: a marble bowls a toy standing in its lane back', r.me.bonks === before + 1);
      check('Dash marbles: the HUD says Bonk!', await textHas('[data-testid=wd-banner]', 'Bonk'));
      r = await waitFor((r) => !r.me.toss, 'landed');
      check('Dash marbles: …and it lands clear of the lane', r.me.z > lane.z + 1.8, `z=${r.me.z.toFixed(1)} lane=${lane.z}`);
    },
    async pendulum(sec) {
      const arm = sec.arms[0];
      const before = (await R()).me.bonks;
      await put(arm.x, arm.z);
      let r = await waitFor((r) => r.me.bonks > before, 'knocked by the pendulum');
      r = await waitFor((r) => !r.me.toss, 'landed');
      check('Dash pendulum: the bead knocks a toy in its path back out', r.me.bonks === before + 1 && r.me.z > arm.z + arm.hz, `z=${r.me.z.toFixed(1)} arm=${arm.z}`);
    },
    async tops(sec) {
      const tp = sec.tops[0];
      const before = (await R()).me.bumps;
      await put(tp.x, tp.z + 3.4);
      await key('KeyW', true);
      const r = await waitFor((r) => r.me.bumps > before, 'bounced off a top');
      await key('KeyW', false);
      check('Dash tops: touching a spinning top bounces the toy off', r.me.bumps > before && r.me.z > tp.z);
    },
    async conveyor(sec, textHas) {
      const back = sec.belts.find((b) => b.v < 0);
      const fwd = sec.belts.find((b) => b.v > 0);
      const zb = (back.z0 + back.z1) / 2 - 2;
      await put(back.x, zb);
      let r = await waitFor((r) => r.me.z > zb + 1.5 || r.me.z < zb - 1.5, 'carried by a belt');
      check('Dash belts: a backwards belt carries a standing toy back', r.me.z > zb + 1.5, `z ${zb.toFixed(1)} → ${r.me.z.toFixed(1)}`);
      await put(back.x, zb);
      check('Dash belts: the HUD says to switch lanes', await textHas('[data-testid=wd-banner]', 'belt'));
      const zf = (fwd.z0 + fwd.z1) / 2 + 2;
      await put(fwd.x, zf);
      r = await waitFor((r) => r.me.z > zf + 1.5 || r.me.z < zf - 1.5, 'carried by a belt');
      check('Dash belts: the forward belt carries it on', r.me.z < zf - 1.5, `z ${zf.toFixed(1)} → ${r.me.z.toFixed(1)}`);
    },
    async books(sec) {
      const f = sec.faces[0];
      await put(2 * sec.cx - f.rampX, f.z + 2.5); // the side away from the ramp
      await key('KeyW', true);
      let r = await waitFor((r) => r.me.z < f.z + 1.5 && r.me.speed < 0.5, 'up against the book');
      check('Dash books: a book across the road blocks a walking toy', r.me.z > f.z && r.me.y === 0, `z=${r.me.z.toFixed(2)} face=${f.z}`);
      // Hop (again if a slow frame swallowed the first) until the toy is standing on the book.
      const t0 = Date.now();
      while (Date.now() - t0 < 120000) {
        r = await R();
        if (r.me.grounded && r.me.y > f.top - 0.05) break;
        if (r.me.grounded) await page.keyboard.press('Space');
        await page.waitForTimeout(60);
      }
      await key('KeyW', false);
      check('Dash books: a hop gets the toy up onto the book', r.me.grounded && Math.abs(r.me.y - f.top) < 0.05, `y=${r.me.y.toFixed(2)} top=${f.top}`);
    },
  };
  return { put, holdClock, traps };
}

async function desktopDash(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(SEED);
  const { scale, snap, R, waitFor, open, textHas } = kit(page);
  const { put, holdClock, traps } = dashKit(page, R, waitFor);
  const stop = async () => { for (const k of ['KeyW', 'KeyA', 'KeyD']) await page.keyboard.up(k); };

  await page.goto(BASE + '?debug#play');
  await page.waitForSelector('.loading', { state: 'detached' });
  await page.waitForFunction(() => window.__toybox && window.__toybox.match);
  await open('wind-up-dash');
  check('Dash: practice hook opens the intro card (lazy-loaded module)', (await page.textContent('.match-intro h2')).includes('Wind-Up Dash'));
  await page.click('.intro-options .segmented >> nth=1 >> button >> nth=0'); // easy bots
  await page.screenshot({ path: `${OUT}/m6-20-dash-intro.png` });
  await page.click('[data-testid=match-start]');
  let r = await waitFor((r) => r.host === 'playing' && r.s && r.dash && r.s.phase === 'race', 'race start');
  await holdClock();
  const first = r.dash;
  const kinds = first.sections.map((q) => q.kind);
  check('Dash: four toys on the grid of a course built from the seed', r.s.n === 4 && first.road.length >= 6 && Math.abs(r.me.z - first.startZ) < 4, `seed ${first.seed}`);
  check('Dash: the course has 4–5 different traps from the catalogue', kinds.length >= 4 && kinds.length <= 5 && new Set(kinds).size === kinds.length && kinds.every((k) => DASH_KINDS.includes(k)), kinds.join(' → '));
  const ordered = first.sections.every((q, i) => q.z0 > q.z1 && (i === 0 ? first.startZ - q.z0 >= 5 : first.sections[i - 1].z1 - q.z0 >= 5)) && first.sections[kinds.length - 1].z1 - first.finishZ >= 5;
  check('Dash: traps come one after another with clear road between, start to finish', ordered);
  const len = first.startZ - first.finishZ;
  check('Dash: course length is close to the original 106 cm sprint', len >= 92 && len <= 122, `${len} cm`);
  check('Dash: the progress strip marks every trap', (await page.$$('.mv-track__mark')).length === kinds.length);

  // Real keys on the opening straight (the first 8 cm of every course are clear road).
  const z0 = r.me.z;
  await page.keyboard.down('KeyW');
  r = await waitFor((r) => r.me.z < z0 - 3, 'running off the line');
  await page.keyboard.down('KeyD');
  const x0 = r.me.x;
  r = await waitFor((r) => r.me.x > x0 + 0.8 || r.me.z < z0 - 7.5, 'steering right');
  await stop();
  check('Dash: W runs down the road and D steers right', r.me.z < z0 - 3 && r.me.x > x0 + 0.8, `z ${z0.toFixed(1)} → ${r.me.z.toFixed(1)}, x ${x0.toFixed(1)} → ${r.me.x.toFixed(1)}`);
  await snap('m6-21-dash-start.png');

  // Every trap this course dealt, each from a spot read out of the course data.
  const done = new Set();
  const runTraps = async (dash, shot) => {
    for (const sec of dash.sections) {
      if (done.has(sec.kind)) continue;
      await put(sec.cx, sec.z0 + 3);
      if (shot) await snap(`m6-22-dash-trap${sec.index + 1}-${sec.kind}.png`);
      await traps[sec.kind](sec, textHas);
      await stop();
      done.add(sec.kind);
    }
  };
  await runTraps(first, true);

  // The run to the line.
  const endCx = first.road[first.road.length - 1].cx;
  await put(endCx, first.finishZ + 4);
  await page.keyboard.down('KeyW');
  r = await waitFor((r) => r.me.finished || r.host !== 'playing', 'finish');
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

  // Play again: a new seed deals a different course.
  await page.click('[data-testid=results-again]');
  r = await waitFor((r) => r.host === 'playing' && r.s && r.dash && r.s.phase === 'race' && r.dash.seed !== first.seed, 'second race');
  await holdClock();
  await scale(1);
  const second = r.dash;
  check('Dash: a new match has a new seed and a different course', second.seed !== first.seed && second.key !== first.key, `${first.key}  ≠  ${second.key}`);
  check('Dash: the second course is laid out afresh (toys back on its start line)', Math.abs(r.me.z - second.startZ) < 4 && (await page.$$('.mv-track__mark')).length === second.sections.length);
  await snap('m6-26-dash-second-course.png');
  await runTraps(second, false); // only the trap kinds the first course did not have
  console.log(`      (trap kinds exercised with real input this run: ${[...done].join(', ')})`);

  await page.keyboard.press('Escape');
  await page.waitForSelector('.pause', { timeout: 30000 });
  await page.click('.pause__actions .toy-btn >> nth=1');
  await page.waitForSelector('.hud-sign', { timeout: 60000 });
  check('Dash: quitting returns to the Playroom', true);
  check('Dash desktop: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// ============================================================================== phone: Dash
async function phoneDash(browser) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 915, height: 412 }, screen: { width: 915, height: 412 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low', tutorials: false }, version: 0 })); } }); // phones default to Low anyway; tutorials are tested elsewhere
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id = 0]) => ({ x, y, id })) });
  const { scale, snap, R, waitFor, open } = kit(page);
  const { put, holdClock } = dashKit(page, R, waitFor);
  const inView = (b, w, h) => b && b.x >= 0 && b.y >= 0 && b.x + b.width <= w && b.y + b.height <= h;
  const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  await page.goto(BASE + '?debug#play');
  await page.waitForTimeout(5000);
  await open('wind-up-dash');
  check('Dash phone: intro explains the touch controls', (await page.textContent('.intro-controls')).includes('joystick'));
  await page.tap('[data-testid=match-start]');
  let r = await waitFor((r) => r.host === 'playing' && r.s && r.dash && r.s.phase === 'race', 'race start');
  await holdClock();
  const jb = await page.locator('[data-testid=mv-jump]').boundingBox();
  check('Dash phone: joystick zone and a ≥ 56 px Jump button are on screen', (await page.isVisible('.touch-stick-zone')) && jb.width >= 56 && jb.height >= 56 && inView(jb, 915, 412));
  const z0 = r.me.z;
  await touch('touchStart', [[130, 300]]);
  await touch('touchMove', [[130, 270]]);
  await touch('touchMove', [[130, 236]]);
  r = await waitFor((r) => r.me.z < z0 - 6, 'moving (landscape)'); // every course opens with 8 cm of clear road
  await snap('m6-30-dash-phone-landscape.png');
  await touch('touchEnd', []);
  check('Dash phone: the joystick runs the toy down the course (landscape)', r.me.z < z0 - 6, `z ${z0.toFixed(1)} → ${r.me.z.toFixed(1)}`);
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
  // Back to the start line, so the stretch ahead is clear road whatever this course's first trap is.
  await put(0, r.dash.startZ);
  r = await R();
  const z1 = r.me.z;
  await touch('touchStart', [[120, 760, 3]]);
  await touch('touchMove', [[120, 730, 3]]);
  await touch('touchMove', [[120, 696, 3]]);
  r = await waitFor((r) => r.me.z < z1 - 5 || r.host !== 'playing', 'moving (portrait)');
  await snap('m6-31-dash-phone-portrait.png');
  await touch('touchEnd', []);
  check('Dash phone: the joystick runs the toy in portrait too', r.me.z < z1 - 3, `z ${z1.toFixed(1)} → ${r.me.z.toFixed(1)}`);
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
