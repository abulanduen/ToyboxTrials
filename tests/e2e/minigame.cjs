/* Milestones 4–5: minigame host, Copycat Conductor, Jack-in-the-Box and the tournament flow (desktop).
   Find the Original has its own suite (tests/e2e/findoriginal.cjs); here it only appears in the tournament.
   Run: BASE_URL=http://localhost:4173/ node tests/e2e/minigame.cjs */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const res = [];
const check = (n, ok, d = '') => res.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
const KEYS = ['KeyA', 'KeyS', 'KeyJ', 'KeyK'];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  page.setDefaultTimeout(+process.env.E2E_TIMEOUT || 120000); // shared machine, software GL: E2E_TIMEOUT (ms) raises the limit
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { quality: 'low' }, version: 0 }));
    }
  });
  const M = () => page.evaluate(() => {
    const s = window.__toybox.match.state();
    return { phase: window.__toybox.match.phase(), s: s && { phase: s.phase, round: s.round, seq: s.sequence, len: s.config.startLength + s.round - 1, players: s.players } };
  });
  const waitFor = async (pred, label, ms = 240000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const m = await M();
      if (pred(m)) return m;
      await page.waitForTimeout(250);
    }
    throw new Error('timeout waiting for ' + label);
  };
  /** Play the current round correctly (local player) by reading the sequence. */
  const playRound = async () => {
    const m = await waitFor((m) => m.s && m.s.phase === 'input', 'input phase');
    const me = m.s.players.find((p) => p.id === 'you');
    for (let i = me.progress; i < m.s.len; i++) {
      await page.keyboard.press(KEYS[m.s.seq[i]]);
      await page.waitForTimeout(60);
    }
    return m.s.round;
  };
  const failRound = async () => {
    const m = await waitFor((m) => m.s && (m.s.phase === 'input' || m.s.phase === 'over'), 'input phase');
    if (m.s.phase === 'over') return;
    const me = m.s.players.find((p) => p.id === 'you');
    const wrong = (m.s.seq[me.progress] + 1) % 4;
    await page.keyboard.press(KEYS[wrong]);
  };

  await page.goto(BASE + '?debug#play');
  await page.waitForSelector('.loading', { state: 'detached' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__toybox.match.timeScale(4));

  // --- Solo practice via the Copycat gate
  await page.evaluate((id) => { const g = window.__toybox.hub.gates().find((x) => x.game === id); window.__toybox.teleport(g.standX, g.standZ, g.yaw); }, 'copycat-conductor');
  await page.waitForFunction((t) => document.querySelector('.prompt')?.textContent.includes(t), 'Copycat', { timeout: 120000 }).catch(() => null);
  check('gate prompt says Play Copycat Conductor', (await page.textContent('.prompt'))?.includes('Play'));
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.match-intro', { timeout: 60000 });
  await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
  check('gate opens the Copycat intro card (lazy-loaded module)', (await page.textContent('.match-intro h2')).includes('Copycat'));
  // Quick tutorial: opens by itself, pages through, and can be turned off.
  check('tutorial opens on the intro card', await page.isVisible('[data-testid=tutorial]'));
  check('tutorial starts at step 1 of 3', (await page.textContent('[data-testid=tutorial-step]')).replace(/\s/g, '') === '1/3');
  check('first step names the goal', (await page.textContent('.match-intro')).includes('Watch the conductor'));
  await page.screenshot({ path: `${OUT}/m4-00-tutorial.png` });
  await page.click('[data-testid=tutorial-next]');
  check('desktop step uses the keys', (await page.textContent('.tutorial__text')).includes('A, S, J and K'));
  await page.click('[data-testid=tutorial-next]');
  check('last tutorial step offers Got it', (await page.textContent('[data-testid=tutorial-next]')).includes('Got it'));
  await page.click('[data-testid=tutorial-back]');
  check('Back goes to the previous step', (await page.textContent('.tutorial__text')).includes('A, S, J and K'));
  await page.click('[data-testid=tutorial-next]');
  await page.click('[data-testid=tutorial-next]');
  check('Got it closes the tutorial and shows the description', !(await page.isVisible('[data-testid=tutorial]')) && (await page.isVisible('[data-testid=tutorial-open]')));
  check('intro shows keyboard controls', (await page.$$('.intro-controls .keycap')).length === 4);
  await page.screenshot({ path: `${OUT}/m4-01-intro.png` });
  await page.click('[data-testid=tutorial-open]');
  check('How to play reopens the tutorial', await page.isVisible('[data-testid=tutorial]'));
  await page.click('[data-testid=tutorial-never]');
  const tutOff = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.tutorials);
  check('Never show again turns tutorials off (persisted) and points to Settings', tutOff === false && (await page.textContent('[data-testid=tutorial-off-note]')).includes('Settings'));
  await page.click('[data-testid=match-start]');
  await page.waitForSelector('.countdown', { timeout: 30000 });
  check('countdown appears', true);
  // Screenshots are slow under software rendering: freeze match time while capturing.
  const snap = async (name) => {
    await page.evaluate(() => window.__toybox.match.timeScale(0));
    await page.screenshot({ path: `${OUT}/${name}` });
    await page.evaluate(() => window.__toybox.match.timeScale(4));
  };
  await waitFor((m) => m.s && m.s.phase === 'demo', 'demo');
  await snap('m4-02-demo.png');
  const r1 = await playRound();
  await waitFor((m) => m.s.round === 2, 'round 2');
  check('correct repetition advances to the next round', true, `round ${r1} → 2`);
  await waitFor((m) => m.s.phase === 'input', 'input r2');
  const m2 = await M();
  await page.keyboard.press(KEYS[m2.s.seq[0]]); // one correct note so the pips show progress
  await waitFor((m) => m.s.players[0].progress >= 1, 'first note registered');
  await snap('m4-03-input.png');
  await playRound();
  await waitFor((m) => m.s.round === 3, 'round 3');
  check('sequence grows by one note per round', (await M()).s.len === 5);
  await failRound();
  await page.waitForSelector('.results', { timeout: 120000 });
  await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
  check('a wrong note ends the solo run', true);
  const score = await page.textContent('[data-testid=solo-score]');
  check('solo score = rounds completed', score?.trim() === '2', score);
  check('first run is a new personal best', await page.isVisible('.sticker-badge'));
  await page.screenshot({ path: `${OUT}/m4-04-results.png` });
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['copycat-conductor']);
  check('record is saved', rec?.best === 2 && rec?.plays === 1, JSON.stringify(rec));

  // Play again → quit via pause → back in the hub near the gate
  await page.click('[data-testid=results-again]');
  await page.waitForSelector('.countdown', { timeout: 30000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  check('Esc pauses the match', await page.isVisible('.pause'));
  await page.click('.pause__actions .toy-btn >> nth=1');
  await page.waitForSelector('.hud-sign', { timeout: 60000 });
  await page.waitForTimeout(1500);
  const pos = await page.evaluate(() => window.__toybox.state());
  const cc = await page.evaluate(() => window.__toybox.hub.gates().find((g) => g.game === 'copycat-conductor'));
  check('quitting returns to the hub where you left it', Math.hypot(pos.x - cc.standX, pos.z - cc.standZ) < 1.5, `x=${pos.x.toFixed(1)} z=${pos.z.toFixed(1)} (gate stand ${cc.standX.toFixed(1)}, ${cc.standZ.toFixed(1)})`);

  // --- Jack-in-the-Box practice via the coral gate: type real answers into the answer box
  const J = () => page.evaluate(() => {
    const s = window.__toybox.match.state();
    return s && s.category ? { phase: s.phase, round: s.round, holder: s.holder, said: s.said.map((x) => x.display.toLowerCase()), tiers: s.category.tiers, prompt: s.category.prompt, players: s.players } : null;
  });
  const waitJ = async (pred, label, ms = 240000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const j = await J();
      if (j && pred(j)) return j;
      await page.waitForTimeout(200);
    }
    throw new Error('timeout waiting for ' + label);
  };
  /** A valid answer from the category's common tier that hasn't been said yet. */
  const freshAnswer = (j) => j.tiers[0].split(',').map((e) => e.split('|')[0].trim()).find((a) => !j.said.includes(a));
  await page.evaluate((id) => { const g = window.__toybox.hub.gates().find((x) => x.game === id); window.__toybox.teleport(g.standX, g.standZ, g.yaw); }, 'jack-in-the-box');
  // The prompt updates on the next rendered frames: wait for it rather than a fixed delay (slow software GL).
  await page.waitForFunction(() => document.querySelector('.prompt')?.textContent.includes('Jack-in-the-Box'), null, { timeout: 60000 }).catch(() => null);
  check('coral gate prompt says Play Jack-in-the-Box', (await page.textContent('.prompt'))?.includes('Jack-in-the-Box'), await page.textContent('.prompt'));
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.match-intro', { timeout: 60000 });
  await page.waitForTimeout(900);
  check('gate opens the Jack-in-the-Box intro card', (await page.textContent('.match-intro h2')).includes('Jack'));
  check('with tutorials off the intro skips the tutorial but still offers How to play', !(await page.isVisible('[data-testid=tutorial]')) && (await page.isVisible('[data-testid=tutorial-open]')));
  const opts = await page.$$eval('.intro-options .segmented >> nth=0 >> button', (els) => els.map((e) => e.textContent));
  check('Jack practice needs company: no Solo option, bots by default', !opts.includes('Solo') && (await page.textContent('.intro-options .segmented .on'))?.includes('3 bots'), opts.join(','));
  await page.click('.intro-options .segmented >> nth=0 >> button >> nth=0'); // 1 bot
  await page.click('.intro-options .segmented >> nth=1 >> button >> nth=0'); // easy
  await page.screenshot({ path: `${OUT}/m5-01-jack-intro.png` });
  await page.evaluate(() => window.__toybox.match.timeScale(2));
  await page.click('[data-testid=match-start]');
  let j = await waitJ((j) => j.phase === 'live' && j.holder === 'you', 'my turn');
  check('category card shows the prompt', (await page.textContent('[data-testid=jb-category]')).includes(j.prompt), j.prompt);
  await page.evaluate(() => window.__toybox.match.timeScale(0)); // freeze the fuse while we type
  // The HUD redraws at 10 Hz; under heavy CPU load give it a moment to catch up.
  const focused = await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'jb-input', null, { timeout: 10000 }).then(() => true, () => false);
  check('answer box is focused when the box reaches you', focused);
  await page.keyboard.type('zzqx nonsense');
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__toybox.match.timeScale(0.05)); // let one step run
  await page.waitForSelector('[data-testid=jb-note]', { timeout: 30000 });
  await page.evaluate(() => window.__toybox.match.timeScale(0));
  check('a wrong answer is rejected and keeps the box', (await page.textContent('[data-testid=jb-note]')).includes("doesn't count") && (await J()).holder === 'you');
  await page.screenshot({ path: `${OUT}/m5-02-jack-reject.png` });
  j = await J();
  const ans = freshAnswer(j);
  await page.fill('[data-testid=jb-input]', '');
  await page.keyboard.type(ans.toUpperCase()); // case doesn't matter
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__toybox.match.timeScale(0.05));
  const after = await waitJ((x) => x.holder !== 'you', 'box passed on', 60000);
  check('a valid answer cranks the box and passes it on', after.said.includes(ans), `${ans} → ${after.said.join(',')}`);
  check('typing P in the answer box does not pause', !(await page.isVisible('.pause')));
  await page.evaluate(() => window.__toybox.match.timeScale(0));
  await page.screenshot({ path: `${OUT}/m5-03-jack-passed.png` });
  await page.evaluate(() => window.__toybox.match.timeScale(4));
  // Now stop answering: the jack pops on us (or the bot) and the match ends.
  await page.waitForSelector('.results', { timeout: 180000 });
  await page.waitForTimeout(900);
  const jrows = await page.$$eval('.results-list li', (els) => els.map((e) => e.textContent));
  check('Jack results list both toys', jrows.length === 2, jrows.join(' | '));
  await page.screenshot({ path: `${OUT}/m5-04-jack-results.png` });
  const jrec = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.records['jack-in-the-box']);
  check('Jack record saved (answers given)', jrec?.best >= 1 && jrec?.plays === 1, JSON.stringify(jrec));
  await page.click('[data-testid=results-leave]');
  await page.waitForSelector('.hud-sign', { timeout: 60000 });
  await page.waitForTimeout(1200);

  // --- The blue gate opens Wind-Up Dash (the race itself is covered by tests/e2e/movement.cjs)
  await page.evaluate((id) => { const g = window.__toybox.hub.gates().find((x) => x.game === id); window.__toybox.teleport(g.standX, g.standZ, g.yaw); }, 'wind-up-dash');
  await page.waitForFunction((t) => document.querySelector('.prompt')?.textContent.includes(t), 'Wind-Up Dash', { timeout: 120000 }).catch(() => null);
  check('blue gate prompt says Play Wind-Up Dash', (await page.textContent('.prompt'))?.includes('Wind-Up Dash'), await page.textContent('.prompt'));
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.match-intro', { timeout: 60000 });
  await page.waitForTimeout(900);
  check('blue gate opens the Wind-Up Dash intro card', (await page.textContent('.match-intro h2')).includes('Dash'));
  await page.click('[data-testid=match-leave]');
  await page.waitForSelector('.hud-sign', { timeout: 60000 });
  await page.waitForTimeout(1200);

  // --- Tournament (Blitz, 1 easy bot): lose each trial on purpose to exercise the flow
  await page.evaluate(() => window.__toybox.hub.goTo('pavilion'));
  await page.waitForTimeout(2500);
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.formats', { timeout: 30000 });
  check('pavilion opens the tournament picker', true);
  await page.screenshot({ path: `${OUT}/m4-05-picker.png` });
  await page.click('[data-testid=format-blitz]');
  await page.click('.intro-options .segmented >> nth=0 >> button >> nth=0'); // 1 bot
  await page.click('.intro-options .segmented >> nth=1 >> button >> nth=0'); // easy
  // A repeatable draw covers both combat modules and Copycat; Jack practice is checked above.
  await page.evaluate(() => { Math.random = () => 15 / 4294967296; });
  await page.click('[data-testid=tournament-start]');
  const games = [];
  for (let round = 1; round <= 3; round++) {
    await page.waitForSelector('.reveal-ticket', { timeout: 60000 });
    await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
    if (round === 1) await page.screenshot({ path: `${OUT}/m4-06-reveal.png` });
    check(`trial ${round}: reveal ticket`, (await page.textContent('.reveal-ticket__round')).includes(`Trial ${round} of 3`));
    await page.click('[data-testid=reveal-go]');
    await page.waitForSelector('[data-testid=match-start]', { timeout: 60000 });
    await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
    const game = (await page.textContent('.match-intro h2')).trim();
    games.push(game);
    await page.click('[data-testid=match-start]');
    // Lose on purpose. Copycat: play a wrong note. Jack: never answer, and the jack pops on us.
    // The races (Red Light Green Light, Wind-Up Dash): never leave the start line.
    // Find the Original: never pick, and the bot outscores us.
    // Inferno Escape: put our toy on the furnace and let the real rules/host resolve the loss.
    // Midnight Hunger: drain our energy and let the night knock us out first.
    // Blink Duel / Spellbox Showdown: mark our toy out and let the rules finish the round.
    // Music Box Rhythm: never tap, and the bot outscores us.
    // Odd Page Out: never tap, and the bot finds more differences.
    if (game.includes('Copycat')) await failRound();
    if (game.includes('Inferno')) {
      await page.evaluate(() => { const s = window.__toybox.match.state(); s.players[0].x = s.furnace.x; s.players[0].z = s.furnace.z; });
    }
    if (game.includes('Midnight')) {
      // Leave our toy exposed with almost no energy and let the real rules knock it out first.
      await page.evaluate(() => { const s = window.__toybox.match.state(); s.players[0].energy = 0.01; });
    }
    if (game.includes('Music Box')) {
      // Never tap: every pin is a miss. Fast-forward the ~68 s song (music is muted off 1x).
      await page.waitForFunction(() => window.__toybox.match.phase() === 'playing', null, { timeout: 120000 });
      await page.evaluate(() => window.__toybox.match.timeScale(8));
    }
    if (game.includes('Odd Page')) {
      // Never tap: the bot finds more differences. Fast-forward the four 30 s pages (the SVG pages
      // render slowly in software, so steps per frame are what limit it: push hard).
      await page.waitForFunction(() => window.__toybox.match.phase() === 'playing', null, { timeout: 120000 });
      await page.evaluate(() => window.__toybox.match.timeScale(40));
    }
    if (game.includes('Blink') || game.includes('Spellbox')) {
      // Knock our toy out and let the real rules resolve the round (Spellbox: skip the build draft).
      await page.waitForFunction(() => window.__toybox.match.phase() === 'playing', null, { timeout: 120000 });
      await page.evaluate(() => { const s = window.__toybox.match.state(); if (s.kind === 'spellbox-showdown') s.players.forEach((p) => { p.ready = true; }); s.players[0].alive = false; s.players[0].outAt = s.t; });
    }
    await page.waitForSelector('.results', { timeout: 600000 });
    await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
    const rows = await page.$$eval('.results-list li', (els) => els.map((e) => e.textContent));
    check(`trial ${round}: results list both contestants with points`, rows.length === 2 && rows.some((r) => r.includes('+10')) && rows.some((r) => r.includes('+8')), rows.join(' | '));
    if (round === 1) await page.screenshot({ path: `${OUT}/m4-07-results-tournament.png` });
    await page.click('[data-testid=results-next]');
    if (round < 3) {
      await page.waitForSelector('.standings', { timeout: 30000 });
      await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
      if (round === 1) await page.screenshot({ path: `${OUT}/m4-08-standings.png` });
      await page.click('[data-testid=standings-next]');
    }
  }
  await page.waitForSelector('.final', { timeout: 30000 });
  await page.waitForTimeout(900); // match buttons ignore taps for 0.7 s after appearing
  const title = await page.textContent('.final h2');
  check('final standings: placed 2nd of 2 after losing every trial', title.includes('2nd of 2'), title);
  check('tournament plays three different trials', new Set(games).size === 3, games.join(', '));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/m4-09-final.png` });
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('toybox-trials:prototype:v1')).state.tournamentHistory);
  check('tournament history saved', hist?.[0]?.format === 'blitz' && hist[0].place === 2 && hist[0].games.length === 3);
  await page.click('[data-testid=final-leave]');
  await page.waitForSelector('.hud-sign', { timeout: 60000 });
  check('back to the Playroom after the tournament', true);

  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(res.join('\n'));
  await browser.close();
  if (res.some(line => line.startsWith('FAIL'))) process.exitCode = 1;
})().catch((e) => {
  console.log(res.join('\n'));
  console.log('FAIL  aborted: ' + e.message);
  process.exit(1);
});
