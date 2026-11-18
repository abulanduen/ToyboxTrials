/* Music Box Rhythm — desktop (keyboard) and an emulated phone (real touch), portrait + landscape.
   Run: npm run preview -- --port 4173 &  node tests/e2e/rhythm.cjs
   The game is opened with the ?debug hook match.practice(id).

   Timing: the match runs slowed down (timeScale) so presses can be aimed at a note from outside
   the page. Each press is aimed by sampling the game's smooth song clock and its rate, waiting in
   Node, then sending a real key/touch event — the game judges the event's own timestamp, so slow
   headless frames don't blur the result. Audio is not checked: this container has no sound. */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const KEYS = ['KeyA', 'KeyS', 'KeyJ', 'KeyK'];
/** Slow enough to aim inside the ±45 ms Perfect window even when a frame is capped at 100 ms. */
const SLOW = 0.2;
/** Used to cross the gaps between notes (≤ 100 ms of song per frame on a starved machine). */
const FAST = 1;
/** Switch from FAST to SLOW this far (song ms) before a target. */
const NEAR = 260;
const res = [];
const check = (n, ok, d = '') => {
  res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
  console.log(res[res.length - 1]);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Helpers bound to one page. `hit(lane)` is how this device plays a lane (key or touch). */
function driver(page, hit) {
  const F = () =>
    page.evaluate(() => {
      const t = window.__toybox;
      const s = t.match.state();
      if (!s || !s.chart) return { matchPhase: t.match.phase() };
      const me = s.players.find((p) => p.id === 'you');
      return {
        matchPhase: t.match.phase(),
        t: s.t,
        song: t.rhythm.songTime(),
        rate: t.rhythm.rate(),
        track: s.track,
        notes: s.chart.length,
        endMs: s.endMs,
        over: s.over,
        me: { score: me.score, combo: me.combo, maxCombo: me.maxCombo, perfect: me.perfect, good: me.good, miss: me.miss, stray: me.stray, cursor: me.cursor },
        players: s.players.map((p) => ({ id: p.id, score: p.score, perfect: p.perfect, good: p.good, miss: p.miss })),
        music: t.rhythm.music(),
        last: t.rhythm.lastJudge(),
      };
    });
  const chart = async () => (notes = await page.evaluate(() => window.__toybox.match.state().chart.map((n) => ({ t: n.t, lane: n.lane }))));
  const waitF = async (pred, label, ms = 240000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const f = await F();
      if (f && pred(f)) return f;
      await page.waitForTimeout(60);
    }
    throw new Error('timeout waiting for ' + label);
  };
  const scale = (k) => page.evaluate((k) => window.__toybox.match.timeScale(k), k);
  const frames = (n) => page.evaluate((n) => new Promise((done) => { const f = () => (--n <= 0 ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  /** After changing the time scale: a few frames, and the song clock measuring a rate again. */
  const settle = async () => {
    await frames(3);
    await waitF((f) => f.rate > 0, 'song clock running', 120000);
  };
  /**
   * Wait until the song clock reaches `target` ms, then return so the caller can press. The wait
   * runs inside the page, frame by frame: fast while far away, slowed down for the last stretch,
   * returning on the frame whose song time is closest to the target. Headless software rendering
   * can drop below 1 fps on a busy machine, and the host advances at most 100 ms × timeScale per
   * frame, so wall-clock waits can't aim; frames can. Leaves the match running at SLOW.
   */
  const until = (target) =>
    page.evaluate(
      ([target, FAST, SLOW, NEAR]) =>
        new Promise((done) => {
          const t = window.__toybox;
          let mode = null;
          let prev = null;
          let slowFrames = 0;
          const tick = () => {
            const song = t.rhythm.songTime();
            const left = target - song;
            const want = left > NEAR ? FAST : SLOW;
            if (want !== mode) {
              t.match.timeScale(want);
              mode = want;
              slowFrames = 0;
              prev = null;
            } else if (mode === SLOW) {
              slowFrames++;
              const advance = prev !== null && song > prev ? song - prev : 0;
              // The next frame would be further from the target than this one: go now.
              if (left <= advance / 2 && (slowFrames >= 3 || left <= 0)) return done();
            }
            prev = song;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      [target, FAST, SLOW, NEAR],
    );
  const aim = [];
  let offsetMs = 0;
  const setOffset = (ms) => (offsetMs = ms);
  const aimReport = (tag) => {
    if (!aim.length) return;
    const mean = aim.reduce((a, b) => a + b, 0) / aim.length;
    console.log(`      (info) ${tag}: ${aim.length} aimed presses were judged ${mean.toFixed(1)} ms from the aimed time on average, worst ${Math.max(...aim.map(Math.abs)).toFixed(1)} ms (headless, slowed clock: not a latency measurement)`);
  };
  let notes = null;
  /** The chart note nearest to a song time (to turn a judged delta back into an aiming error). */
  const noteTime = (target) => notes.reduce((best, n) => (Math.abs(n.t - target) < Math.abs(best - target) ? n.t : best), notes[0].t);
  /** Play `lane` when the song clock reads `target`, then wait for the rules to react. */
  const playAt = async (lane, target) => {
    const before = await F();
    await until(target);
    await hit(lane);
    const sum = (f) => f.me.perfect + f.me.good + f.me.stray;
    const f = await waitF((f) => sum(f) > sum(before), `press in lane ${lane}`, 120000);
    // How far from the aimed time the press was judged (hits only): the test's own aiming error.
    if (f.me.perfect + f.me.good > before.me.perfect + before.me.good) aim.push(f.last.delta + offsetMs - (target - noteTime(target)));
    return f;
  };
  const snap = async (name) => {
    await frames(3);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${name}` });
  };
  const open = async () => {
    await page.evaluate(() => window.__toybox.match.practice('music-box-rhythm'));
    await page.waitForSelector('.match-intro', { timeout: 60000 });
    await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
  };
  /** Start the match and come out of the countdown slowed down, early in the count-in. */
  const start = async (click) => {
    await scale(2);
    await click();
    await waitF((f) => f.matchPhase === 'playing', 'countdown to finish');
    await scale(SLOW);
    await settle();
    return F();
  };
  const judgeText = () => page.$eval('[data-testid=mbr-judge]', (el) => ({ kind: el.dataset.kind, text: el.textContent }));
  return { F, chart, waitF, scale, frames, settle, until, playAt, snap, open, start, judgeText, setOffset, aimReport };
}

const seedLow = async (page) =>
  page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low' }, version: 0 }));
    }
  });

async function desktop(browser, errors) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await seedLow(page);
  const d = driver(page, (lane) => page.keyboard.press(KEYS[lane]));

  await page.goto(BASE + '?debug#play');
  await page.waitForSelector('.loading', { state: 'detached' });
  await page.waitForTimeout(1500);
  await d.open();
  check('desktop: practice card opens (lazy-loaded module)', (await page.textContent('.match-intro h2')).includes('Music Box Rhythm'));
  check('desktop: intro shows the four lane keys', (await page.$$('.intro-controls .keycap')).length === 4);
  const tracks = await page.$$eval('.mbr-trackcard', (els) => els.map((e) => e.textContent));
  check('desktop: three tracks to choose from (easy / medium / hard)', tracks.length === 3 && /easy/i.test(tracks[0]) && /medium/i.test(tracks[1]) && /hard/i.test(tracks[2]), tracks.join(' | '));
  const opts = await page.$$eval('.intro-options .segmented >> nth=0 >> button', (els) => els.map((e) => e.textContent));
  check('desktop: playable solo or with up to 7 bots', opts.includes('Solo') && opts.includes('7 bots'), opts.join(','));
  check('desktop: timing offset starts at 0 ms', (await page.textContent('[data-testid=mbr-offset]')).trim() === '0 ms');
  await page.click('.intro-options .segmented >> nth=0 >> button >> nth=0'); // solo
  await page.click('[data-testid=mbr-track-tin-waltz]');
  await page.screenshot({ path: `${OUT}/mbr-01-intro.png` });

  // ---- Match 1: Tin Waltz, solo, no calibration. Perfect, Good (late and early), Miss, stray.
  let f = await d.start(() => page.click('[data-testid=match-start]'));
  const chart = await d.chart();
  check('desktop: the chosen track is loaded', f.track === 'tin-waltz' && f.notes === chart.length && chart.length > 60, `${f.track}, ${f.notes} notes`);
  check('desktop: play starts inside the count-in, before the first note', f.t < chart[0].t - 500, `t=${Math.round(f.t)} first note ${Math.round(chart[0].t)}`);
  check('desktop: the song clock follows the slowed match clock', f.rate > 0 && f.rate < SLOW + 0.08 && Math.abs(f.song - f.t) < 60, `rate ${f.rate.toFixed(3)}, song−t ${Math.round(f.song - f.t)} ms`);
  check('desktop: count-in hint is shown', (await page.textContent('[data-testid=mbr-banner]')).includes('A S J K'));
  await d.until(chart[0].t - 620);
  await d.scale(0);
  await d.snap('mbr-02-count-in.png');

  f = await d.playAt(chart[0].lane, chart[0].t);
  check('desktop: a press on the note is a Perfect', f.me.perfect === 1 && f.me.good === 0 && f.me.combo === 1 && f.me.score === 100, JSON.stringify(f.me));
  let j = await d.judgeText();
  check('desktop: HUD pops "Perfect!"', j.kind === 'perfect' && j.text.includes('Perfect'), JSON.stringify(j));

  f = await d.playAt(chart[1].lane, chart[1].t + 70);
  check('desktop: a press 70 ms late is a Good', f.me.perfect === 1 && f.me.good === 1 && f.me.score === 150, JSON.stringify(f.me));
  j = await d.judgeText();
  check('desktop: HUD pops "Good · late"', j.kind === 'good' && j.text.includes('late'), JSON.stringify(j));

  // Note 2 is left alone.
  f = await d.playAt(chart[3].lane, chart[3].t - 70);
  check('desktop: an unplayed note is a Miss and breaks the combo', f.me.miss === 1 && f.me.combo === 1, JSON.stringify(f.me));
  check('desktop: a press 70 ms early is a Good', f.me.good === 2 && f.me.perfect === 1, JSON.stringify(f.me));
  j = await d.judgeText();
  check('desktop: HUD pops "Good · early"', j.kind === 'good' && j.text.includes('early'), JSON.stringify(j));

  // A press in the wrong lane, halfway between two notes: a stray, combo back to 0.
  const wrongLane = [0, 1, 2, 3].find((l) => l !== chart[3].lane && l !== chart[4].lane);
  f = await d.playAt(wrongLane, (chart[3].t + chart[4].t) / 2);
  check('desktop: a tap with no pin in reach is a stray and breaks the combo', f.me.stray === 1 && f.me.combo === 0 && f.me.score === 200, JSON.stringify(f.me));

  // A run of Perfects: combo climbs and the multiplier kicks in at 10.
  const scoreBefore = f.me.score;
  // (Aimed at the note; on a starved machine one or two may still land as a Good, which is fine here.)
  for (let i = 4; i < 15; i++) f = await d.playAt(chart[i].lane, chart[i].t);
  const runP = f.me.perfect - 1;
  const runG = f.me.good - 2;
  check('desktop: eleven notes in a row all hit, mostly Perfect', runP + runG === 11 && runP >= 8 && f.me.combo === 11 && f.me.miss === 1, JSON.stringify(f.me));
  const gained = f.me.score - scoreBefore;
  // Notes 10 and 11 of the combo score double; the bounds allow for where any Goods fell.
  check('desktop: combo multiplier ×2 from the 10th note', gained >= runP * 100 + runG * 50 + 100 && gained <= runP * 100 + runG * 50 + 200, `+${gained} for ${runP} Perfect, ${runG} Good`);
  await d.until(chart[15].t - 380);
  await d.scale(0);
  await d.frames(8);
  const hud = await page.evaluate(() => ({ score: document.querySelector('[data-testid=mbr-score] strong').textContent, combo: document.querySelector('[data-testid=mbr-combo]').textContent, acc: document.querySelector('[data-testid=mbr-acc]').textContent }));
  check('desktop: HUD shows score, combo ×2 and accuracy', hud.score === String(f.me.score) && hud.combo.includes('×2') && hud.combo.includes('11') && /^\d+\.\d%$/.test(hud.acc.trim()), JSON.stringify(hud));
  const expectAcc = ((f.me.perfect + f.me.good * 0.5) / 15) * 100;
  check('desktop: accuracy = (Perfect + ½ Good) ÷ notes', Math.abs(parseFloat(hud.acc) - expectAcc) < 0.06, `${hud.acc} vs ${expectAcc.toFixed(1)}`);
  await d.snap('mbr-03-playing.png');

  // Pause freezes the song; resume carries on.
  await d.scale(1);
  await d.settle();
  await page.keyboard.press('Escape');
  await page.waitForSelector('.pause', { timeout: 60000 });
  await d.frames(2);
  const p1 = await d.F();
  await page.waitForTimeout(600);
  await d.frames(4);
  const p2 = await d.F();
  check('desktop: pause stops the song clock', p2.t === p1.t && p2.rate === 0, `t ${Math.round(p1.t)} → ${Math.round(p2.t)}, rate ${p2.rate}`);
  await page.waitForTimeout(800); // pause sheet buttons arm after 0.7 s
  await page.keyboard.press('Escape');
  await d.waitF((x) => x.t > p2.t + 100, 'resume', 120000);

  await d.scale(8);
  await page.waitForSelector('.results', { timeout: 240000 });
  await page.waitForTimeout(900);
  f = await d.F();
  const score = (await page.textContent('[data-testid=solo-score]'))?.trim();
  check('desktop: the song ends and results show the points total', score === String(f.me.score) && f.over, `${score} vs ${f.me.score}`);
  check('desktop: every note was judged by the end', f.me.perfect + f.me.good + f.me.miss === f.notes, JSON.stringify(f.me));
  await page.screenshot({ path: `${OUT}/mbr-04-results.png` });
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['music-box-rhythm']);
  check('desktop: record saved', rec?.best === f.me.score && rec?.plays === 1, JSON.stringify(rec));
  console.log('      (info) music scheduler: ' + JSON.stringify(f.music));

  // ---- Match 2: hard track vs 3 bots, with a +50 ms timing offset set on the intro card.
  await d.scale(1);
  await page.click('.results .toy-btn >> nth=1').catch(() => {}); // "Change settings"
  await page.waitForSelector('.match-intro', { timeout: 60000 });
  await page.waitForTimeout(900);
  // Tap test: tap Space along with the ticks; it reports an offset (or asks for another go) and returns.
  await page.click('[data-testid=mbr-taptest]');
  await page.waitForSelector('[data-testid=mbr-tap]', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[data-testid=mbr-tap]')?.textContent.includes('Tap along'), null, { timeout: 60000, polling: 50 });
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Space');
    await sleep(500);
  }
  await page.waitForSelector('[data-testid=mbr-offset-note]', { timeout: 60000 });
  const tapNote = await page.textContent('[data-testid=mbr-offset-note]');
  check('desktop: tap test finishes and reports back (Space did not start the match)', /Set to .+ ms from your taps|landed on the beat/.test(tapNote) && (await d.F()).matchPhase === 'intro', tapNote);
  const afterTaps = parseInt((await page.textContent('[data-testid=mbr-offset]')).replace('−', '-'), 10);
  check('desktop: tap test result is within the offset range', afterTaps >= -150 && afterTaps <= 250 && afterTaps % 5 === 0, `${afterTaps} ms`);
  for (let v = afterTaps; v !== 50; v += v < 50 ? 5 : -5) await page.click(v < 50 ? '[data-testid=mbr-offset-up]' : '[data-testid=mbr-offset-down]');
  check('desktop: timing offset stepper goes to +50 ms', (await page.textContent('[data-testid=mbr-offset]')).trim() === '+50 ms');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.rhythmOffsetMs);
  check('desktop: timing offset is persisted', stored === 50, String(stored));
  await page.click('[data-testid=mbr-track-spring-loaded]');
  await page.click('.intro-options .segmented >> nth=0 >> button >> nth=2'); // 3 bots
  await page.click('.intro-options .segmented >> nth=1 >> button >> nth=1'); // normal
  await page.screenshot({ path: `${OUT}/mbr-05-intro-offset.png` });
  d.setOffset(50);
  f = await d.start(() => page.click('[data-testid=match-start]'));
  const hard = await d.chart();
  check('desktop: hard track is denser than the waltz', f.track === 'spring-loaded' && hard.length > chart.length, `${hard.length} vs ${chart.length} notes`);
  // With +50 ms calibration, a press 50 ms after each note is dead on, and one just before the note is 70 ms early.
  for (let i = 0; i < 6; i++) f = await d.playAt(hard[i].lane, hard[i].t + 50);
  check('desktop: with +50 ms offset, presses 50 ms late are Perfect', f.me.perfect === 6 && f.me.good === 0, JSON.stringify(f.me));
  f = await d.playAt(hard[6].lane, hard[6].t - 20);
  check('desktop: with +50 ms offset, a press 20 ms before the note reads 70 ms early (Good)', f.me.good === 1 && f.me.perfect === 6, JSON.stringify(f.me));
  j = await d.judgeText();
  check('desktop: …and the HUD says "early"', j.text.includes('early'), JSON.stringify(j));
  await d.until(hard[9].t - 300);
  await d.scale(0);
  await d.frames(8);
  check('bots: the field shows all four toys with scores', (await page.$$('[data-testid=mbr-field] .mbr-chip')).length === 4);
  const fb = await d.F();
  check('bots: bots are playing along', fb.players.filter((p) => p.id !== 'you' && p.perfect + p.good > 0).length === 3, JSON.stringify(fb.players));
  await d.snap('mbr-06-bots-hard.png');
  await d.scale(8);
  await page.waitForSelector('.results', { timeout: 240000 });
  await page.waitForTimeout(900);
  const rows = await page.$$eval('.results-list li', (els) => els.map((e) => e.textContent));
  check('bots: results rank all four toys by points', rows.length === 4 && rows.every((r) => /\d+ points?/.test(r)), rows.join(' | '));
  const last = await d.F();
  const sorted = last.players.slice().sort((a, b) => b.score - a.score);
  check('bots: the top score is first', rows[0].includes(String(sorted[0].score)), `${rows[0]} / ${sorted[0].score}`);
  await page.screenshot({ path: `${OUT}/mbr-07-bots-results.png` });
  await d.scale(1);
  d.aimReport('desktop keys');
  await page.close();
}

async function phone(browser, errors, orientation) {
  const dev = devices['Pixel 7'];
  const vp = orientation === 'portrait' ? { width: 412, height: 915 } : { width: 915, height: 412 };
  const ctx = await browser.newContext({ ...dev, viewport: vp, screen: vp });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id = 0]) => ({ x, y, id })) });
  let pads = [];
  const tapPad = async (lane) => {
    const p = pads[lane];
    await touch('touchStart', [[p.x + p.w / 2, p.y + p.h / 2]]);
    await sleep(35);
    await touch('touchEnd', []);
  };
  const d = driver(page, tapPad);
  const tag = `phone ${orientation}`;
  const P = orientation === 'portrait' ? 'p' : 'l';

  await page.goto(BASE + '?debug');
  await page.waitForSelector('[data-testid=menu-play]', { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.tap('[data-testid=menu-play]');
  await page.waitForTimeout(2500);
  await d.open();
  check(`${tag}: intro explains the touch controls`, (await page.textContent('.intro-controls')).includes('Tap a pad'));
  const card = await page.$eval('.match-intro', (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, sh: el.scrollHeight, ch: el.clientHeight }; });
  check(`${tag}: intro card (with track + offset options) fits or scrolls on screen`, card.top >= 0 && card.bottom <= vp.height + 1, JSON.stringify(card));
  const stepper = await page.$$eval('.mbr-stepper button, .mbr-trackcard', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  check(`${tag}: intro option buttons are at least 44 px`, Math.min(...stepper) >= 44, `${Math.round(Math.min(...stepper))} px`);
  await page.tap('.intro-options .segmented >> nth=0 >> button >> nth=2'); // 3 bots
  await page.tap('.intro-options .segmented >> nth=1 >> button >> nth=0'); // easy
  await page.tap('[data-testid=mbr-track-clockwork-parade]');
  await page.screenshot({ path: `${OUT}/mbr-m${P}-01-intro.png` });

  let f = await d.start(() => page.tap('[data-testid=match-start]'));
  const chart = await d.chart();
  pads = await page.$$eval('.mbr-pad', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  check(`${tag}: four lane pads`, pads.length === 4);
  check(`${tag}: pads are at least 56 px in both directions`, pads.every((p) => p.w >= 56 && p.h >= 56), pads.map((p) => `${Math.round(p.w)}×${Math.round(p.h)}`).join(' '));
  check(`${tag}: pads are on screen, in lane order, not overlapping`, pads.every((p, i) => p.x >= 0 && p.x + p.w <= vp.width && p.y + p.h <= vp.height && (i === 0 || p.x >= pads[i - 1].x + pads[i - 1].w)), JSON.stringify(pads.map((p) => Math.round(p.x))));
  const hudBox = await page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom }; };
    return { score: r('.mbr-score'), top: r('.mbr-top'), pause: r('.match-pause'), field: r('.mbr-field'), pads: r('.mbr-pads'), banner: r('.mbr-banner') };
  });
  const overlap = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
  check(`${tag}: HUD pieces don't overlap each other or the pads`, !overlap(hudBox.score, hudBox.top) && !overlap(hudBox.top, hudBox.pause) && !overlap(hudBox.score, hudBox.pause) && !overlap(hudBox.field, hudBox.pads) && !overlap(hudBox.field, hudBox.top) && !overlap(hudBox.field, hudBox.score) && !!hudBox.banner && ['score', 'top', 'pause', 'field', 'pads'].every((k) => !overlap(hudBox.banner, hudBox[k])), JSON.stringify(hudBox));

  await d.until(chart[0].t - 560);
  await d.scale(0);
  await d.snap(`mbr-m${P}-02-count-in.png`);

  // Real touch: eight notes on the beat.
  for (let i = 0; i < 8; i++) f = await d.playAt(chart[i].lane, chart[i].t);
  check(`${tag}: tapping the pads on the beat registers hits`, f.me.perfect + f.me.good === 8 && f.me.miss === 0 && f.me.stray === 0, JSON.stringify(f.me));
  check(`${tag}: touch timing is tight enough for Perfects`, f.me.perfect >= 6, `${f.me.perfect} Perfect, ${f.me.good} Good`);
  // Two fingers at once on two different pads (multi-touch): both lanes register.
  const a = chart[8];
  const other = (a.lane + 2) % 4;
  await d.until(a.t);
  const before = f;
  await touch('touchStart', [[pads[a.lane].x + pads[a.lane].w / 2, pads[a.lane].y + pads[a.lane].h / 2, 0], [pads[other].x + pads[other].w / 2, pads[other].y + pads[other].h / 2, 1]]);
  await sleep(40);
  await touch('touchEnd', []);
  f = await d.waitF((x) => x.me.perfect + x.me.good + x.me.stray >= before.me.perfect + before.me.good + before.me.stray + 2, 'two-finger tap', 30000);
  check(`${tag}: two pads tapped together both register (multi-touch)`, f.me.perfect + f.me.good === 9 && f.me.stray === 1, JSON.stringify(f.me));
  await d.until(chart[10].t - 330);
  await d.scale(0);
  await d.frames(8);
  await d.snap(`mbr-m${P}-03-playing.png`);
  await d.scale(8);
  await page.waitForSelector('.results', { timeout: 240000 });
  await page.waitForTimeout(900);
  const rows = await page.$$eval('.results-list li', (els) => els.map((e) => e.textContent));
  check(`${tag}: results rank all four toys`, rows.length === 4, rows.join(' | '));
  await page.screenshot({ path: `${OUT}/mbr-m${P}-04-results.png` });
  await d.scale(1);
  d.aimReport(`${tag} touch`);
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
