/* Rebuild the tutorial's REAL gameplay photos against the Vite dev server (ESM imports below).
 * BASE_URL=http://127.0.0.1:4175/ node tests/e2e/tutorial-capture.cjs [game-id,...]
 * Uses ?debug to freeze time and stage reproducible examples through the existing rules.
 * No AI artwork or production debug dependencies. CDP downsamples to 960x540 WebP.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4175/';
const OUT = path.resolve(__dirname, '../../public/assets/ui/tutorials');
const ONLY = process.argv[2]?.split(',');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(240000);
    page.on('pageerror', e => { throw e; });
    await page.addInitScript(() => localStorage.setItem('toybox-trials:prototype:v1', JSON.stringify({ state: { tourSeen: true, quality: 'low', tutorials: false }, version: 0 })));
    await page.goto(BASE + '?debug#play');
    await page.waitForFunction(() => window.__toybox?.match && !document.querySelector('.loading'));
    const games = await page.evaluate(async () => {
      const { TUTORIALS } = await import('/src/minigames/tutorials.ts');
      // Diagram-only tutorials (none today) keep their code-drawn pictures.
      return Object.entries(TUTORIALS).filter(([, steps]) => steps.every(step => step.image))
        .map(([id, steps]) => ({ id, count: steps.length }));
    });
    const cdp = await page.context().newCDPSession(page);
    for (const { id, count } of games) {
      if (ONLY && !ONLY.includes(id)) continue;
      await page.evaluate(async id => {
        const session = await import('/src/minigames/session.ts');
        session.quitMatch();
        window.__toybox.match.timeScale(1);
        await session.openPractice(id);
      }, id);
      await page.getByTestId('match-start').waitFor();
      await page.waitForTimeout(850);
      // Always show a small field, including in games which also allow solo practice.
      await page.getByRole('button', { name: '3 bots', exact: true }).click();
      await page.getByTestId('match-start').click();
      await page.evaluate(() => window.__toybox.match.timeScale(20));
      await page.waitForFunction(() => {
        if (window.__toybox.match.phase() !== 'playing') return false;
        window.__toybox.match.timeScale(0); return true;
      });
      await page.evaluate(async () => {
        const session = await import('/src/minigames/session.ts');
        const m = session.useMatch.getState(), rules = m.module.rules, s = window.__toybox.match.state();
        Object.assign(s, rules.init(m.contestants, 1978));
        const step = (inputs = {}, dt = 16) => {
          rules.step(s, inputs, dt);
          for (const event of rules.drainEvents(s)) session.matchBus.emit('event', event);
        };
        const until = phase => { for (let n = 0; s.phase !== phase && n < 10000; n++) step({}, 16); if (s.phase !== phase) throw Error('Missing phase ' + phase); };
        window.__tutorialCapture = { s, step, until, session };
      });
      for (let i = 0; i < count; i++) {
        await page.evaluate(async ({ id, i }) => {
          const { s, step, until, session } = window.__tutorialCapture, p = s.players[0];
          const local = inputs => step({ [p.id]: inputs });
          if (id === 'copycat-conductor') {
            if (i === 0) { until('demo'); step({}, 730); }
            if (i === 1) { until('input'); local([{ slot: s.sequence[0] }]); }
            if (i === 2) { s.round = 3; s.sequence = [0, 2, 1, 3, 0]; s.demoIndex = 2; s.phase = 'demo'; s.phaseT = 1200; }
          } else if (id === 'jack-in-the-box') {
            if (i === 0) until('reveal');
            if (i === 1) { until('live'); s.holder = p.id; }
            if (i === 2) { s.holder = p.id; s.fuseMs = 1; step({}, 16); }
          } else if (id === 'find-the-original') {
            if (i === 0) until('study');
            // The look-alikes pop up one after another over the first ~0.5 s of the search:
            // let them all arrive, or the photo shows an empty tray.
            if (i === 1) { until('search'); step({}, 700); }
            if (i === 2) { until('reveal'); }
          } else if (id === 'red-light-green-light') {
            if (i === 0) { until('go'); s.players.forEach((q, k) => { q.m.z = -22 + k * 5; }); }
            if (i === 1) until('warn');
            if (i === 2) { until('stop'); s.phaseT = 200; p.m.vz = -8; local([{ ax: 0, ay: 1, run: false, jump: false }]); }
          } else if (id === 'wind-up-dash') {
            if (i === 0) until('race');
            if (i > 0) {
              const section = s.course.sections[Math.min(i - 1, s.course.sections.length - 1)];
              Object.assign(p.m, { x: section.cx, z: section.z0 + 7, y: 0, vx: 0, vz: 0, vy: 0, grounded: true });
              if (i === 2) step({}, 400);
            }
          } else if (id === 'inferno-escape') {
            if (i === 0) { p.facing = 0; local([{ action: 'break' }]); }
            if (i === 1) { p.facing = 1; local([{ action: 'build' }]); }
            if (i === 2) { until('hunt'); step({}, 1000); }
          } else if (id === 'midnight-hunger') {
            if (i === 0) s.players.forEach((q, n) => { q.energy = 85 - n * 20; });
            if (i === 1) {
              Object.assign(p, { x: 5, z: 5, facing: 0 });
              Object.assign(s.batteries[0], { x: 5, z: 4, hits: 1 });
              s.nextTarget = 1e9; local([{ hit: true }]);
            }
            if (i === 2) { until('day'); Object.assign(p, { x: 1, z: 1, energy: 65 }); }
          } else if (id === 'music-box-rhythm') {
            if (i === 0) s.t = s.chart[0].t - 650;
            if (i === 1) { const n = s.chart[0]; s.t = n.t - 16; local([{ lane: n.lane, t: n.t }]); }
            if (i === 2) {
              // Hit the first thirty notes through the rules to earn the actual x4 multiplier.
              for (const n of s.chart.slice(1, 31)) { s.t = n.t - 16; local([{ lane: n.lane, t: n.t }]); }
            }
          } else if (id === 'hoop-hustle') {
            // Bots shooting from their spots; then your charge held in the gold zone (the arc glows);
            // then the sliding hoop with gold balls in the last 15 seconds.
            const { perfectPowerAt } = await import('/src/minigames/hoophustle/rules.ts');
            // Two rivals let go at the perfect power, a moment ago: their balls are in the air.
            const rivalsShoot = (frames) => {
              const inputs = {};
              for (const q of s.players.slice(1, 3)) inputs[q.id] = [{ type: 'throw', power: perfectPowerAt(s.config, s.spots[q.spot], s.t) ?? 0.5 }];
              step(inputs, 16);
              for (let n = 0; n < frames; n++) step({}, 16);
            };
            if (i === 0) { for (let n = 0; n < 60; n++) step({}, 16); rivalsShoot(24); }
            if (i === 1) { for (let n = 0; n < 120; n++) step({}, 16); window.__toybox.hoop.charge(window.__toybox.hoop.perfect()); }
            if (i === 2) {
              window.__toybox.hoop.charge(null);
              // Late in the match: the hoop resting at one end of its track, and gold balls.
              const k = Math.round((s.config.durationMs - 14300) / (1000 / 60)); s.tick = k; s.t = (k * 1000) / 60;
              for (let n = 0; n < 40; n++) step({}, 16);
              rivalsShoot(20);
            }
          } else if (id === 'blink-duel') {
            if (i === 0) s.players.forEach((q, n) => Object.assign(q, { x: (n % 2 ? 1 : -1) * 5, z: n < 2 ? -3 : 5 }));
            if (i === 1) { p.angle = Math.PI / 2; local([{ type: 'blink' }]); step({}, 80); }
            if (i === 2) { p.angle = -Math.PI / 2; local([{ type: 'attack' }]); step({}, 380); }
          } else if (id === 'spellbox-showdown') {
            if (i === 1) {
              for (const q of s.players) step({ [q.id]: [{ type: 'ready' }] });
              until('arena');
              Object.assign(p, { x: -3, z: 0, angle: Math.PI / 2 });
              Object.assign(s.players[1], { x: 3, z: 0 });
              p.build[0] = 'pop-rocket'; local([{ type: 'cast', slot: 0 }]);
              for (let n = 0; n < 45; n++) step({}, 16);
            }
            if (i === 2) { s.players[3].alive = false; s.players[3].outAt = s.t; step({}, 16); }
          } else if (id === 'toy-squad') {
            if (i === 0) {
              p.coins = 20; p.shop = ['soldier', 'soldier', 'robot', 'paper-medic', 'hare'];
              local([{ type: 'buy', slot: 0 }]);
            }
            if (i === 1) local([{ type: 'buy', slot: 1 }]);
            if (i === 2) { local([{ type: 'buy', slot: 2 }, { type: 'buy', slot: 3 }]); p.units.forEach((u, n) => { u.cell = [4, 12, 21][n]; }); }
            if (i === 3) { s.round = 3; p.level = 3; p.passiveOffers = ['padding', 'springs', 'sights']; }
          } else if (id === 'odd-page-out') {
            if (i === 0) until('search');
            if (i === 1 || i === 2) {
              const { themeById } = await import('/src/minigames/spotdiff/themes.ts');
              const theme = themeById(s.data.theme);
              const found = i === 1 ? 1 : 5;
              for (const index of s.data.diffs.slice(p.found.length, found)) {
                const slot = theme.slots[index]; local([{ x: slot.x / 400, y: slot.y / 300 }]);
              }
            }
            if (i === 3) { s.phaseT = s.config.searchMs; step({}, 16); until('turn'); }
          } else if (id === 'toy-tower-tumble') {
            const { useTumbleUI } = await import('/src/minigames/towertumble/local.ts');
            if (i === 0) { local([{ type: 'build', cell: 17 }]); }
            if (i === 1) {
              p.gold = 150; local([{ type: 'build', cell: 20 }, { type: 'build', cell: 36 }]);
              p.towers[0].def = 'tin-sentry'; p.towers[1].def = 'spark-bot';
              useTumbleUI.setState({ selected: 17, cursor: 17 });
            }
            if (i === 2) { local([{ type: 'builder' }]); useTumbleUI.setState({ selected: null, panel: 'odds' }); }
            if (i === 3) {
              useTumbleUI.setState({ selected: null, panel: null });
              s.players.forEach(q => { q.ready = true; }); step({}, 16);
              for (let n = 0; n < 180; n++) step({}, 16);
            }
          } else if (id === 'toybox-siege') {
            // Toys and mobs pop in over the first moments of any phase: every shot steps the rules
            // a little before it is taken, so the picture is never an empty board.
            const others = s.players.filter(q => q !== p);
            const kit = (q, weapons, passives = []) => {
              q.weapons = weapons.map(([wid, level, evolved = false]) => ({ id: wid, level, evolved, cd: 200, aux: 0 }));
              q.passives = passives.map(([pid, level]) => ({ id: pid, level }));
            };
            const cards = q => { for (let n = 0; n < 200 && (q.choice || q.pendingLevels || q.pendingChests); n++) step(q.choice ? { [q.id]: [{ type: 'choose', index: 0 }] } : {}, 16); };
            if (i === 0) {
              // The class card, with the bots already locked in.
              step({ [others[0].id]: [{ type: 'class', cls: 'warrior' }], [others[1].id]: [{ type: 'class', cls: 'mage' }] });
            }
            if (i === 1) {
              step({ [p.id]: [{ type: 'class', cls: 'ranger' }], [others[2].id]: [{ type: 'class', cls: 'ranger' }] });
              for (const q of s.players) { q.invuln = 1e12; q.xpNext = 1e9; }
              kit(p, [['popgun', 4], ['chime', 2]], [['gears', 1]]);
              for (let n = 0; n < 500; n++) step({}, 16); // 8 s: the first dust bunnies arrive and fall
              p.xp = 0; p.xpNext = 3;
              const g = p.board.gems.find(x => !x.on);
              Object.assign(g, { on: true, kind: 0, v: 3, x: p.x, z: p.z, pull: true });
              step({}, 16);
              // A card that shows every kind of label: a level change that unlocks the secret upgrade
              // (the Pop-Gun's partner is owned), a new passive that pairs with the Chime Burst, a new weapon.
              p.choice.options = [{ kind: 'weapon', id: 'popgun', level: 5 }, { kind: 'passive', id: 'magnifier', level: 1 }, { kind: 'weapon', id: 'marbles', level: 1 }];
            }
            if (i === 2) {
              step({ [p.id]: [{ type: 'choose', index: 0 }] });
              cards(p);
              p.xpNext = 1e9;
              // A middling kit, so the swarm is not wiped out before the photo.
              kit(p, [['popgun', 3], ['chime', 2], ['yoyo', 2], ['marbles', 2]], [['gears', 1], ['magnifier', 1]]);
              s.runT = 38000;
              for (let n = 0; n < 1450; n++) { step({}, 16); cards(p); } // the swarm builds; the Rag Bear arrives at 1:00
              const bear = p.board.bigs.find(b => b.on);
              if (bear) { bear.x = p.x + 9; bear.z = p.z - 6; bear.mode = 0; bear.dashT = 1e9; bear.hp = bear.maxHp; }
              for (let n = 0; n < 24; n++) step({}, 16);
            }
            if (i === 3) {
              // Every toy pulled out at 5:00, a moment of prep, then the arena with every build and a summoned Baron.
              kit(others[0], [['sweep', 5, true], ['yoyo', 4]], [['plating', 3]]);
              kit(others[1], [['chime', 5, true], ['marbles', 4]], [['magnifier', 3]]);
              kit(others[2], [['popgun', 5], ['planes', 4]], [['gears', 2]]);
              p.horn = { level: 2, readyAt: 0 };
              s.players.forEach((q, k) => { q.level = 24 + 2 * k; });
              s.runT = s.config.durationMs - 16; step({}, 16);
              for (const q of s.players) cards(q);
              s.runT = s.config.durationMs + s.config.prepMs; step({}, 16);
              if (s.phase !== 'arena') throw Error('no arena');
              for (let n = 0; n < 140; n++) step({}, 16);
              local([{ type: 'skill' }]);
              for (let n = 0; n < 90; n++) step({}, 16);
            }
          }
        }, { id, i });
        // Scene cameras ease to the new view; HUDs tick independently of the frozen rules clock.
        await page.evaluate(() => new Promise(done => { let n = 18; const f = () => --n ? requestAnimationFrame(f) : done(); requestAnimationFrame(f); }));
        await page.waitForTimeout(350);
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'webp', quality: 86, clip: { x: 0, y: 0, width: 1280, height: 720, scale: 0.75 } });
        fs.writeFileSync(path.join(OUT, `${id}-${i + 1}.webp`), Buffer.from(data, 'base64'));
        console.log(`${id} ${i + 1}/${count}`);
      }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
